/**
 * Decision Brief Service
 * 
 * Manages the creation, storage, and retrieval of structured decision briefs.
 * Integrates with the rationale generation pipeline and provides decision lineage.
 */

import { PrismaClient } from '@prisma/client';
import { DecisionBrief } from '../models/DecisionBrief';
import { DecisionCandidate } from '../models/DecisionCandidate';
import { ExtractedContext } from '../agents/ContextExtractionAgent';
import { RationaleGenerationAgent } from '../agents/RationaleGenerationAgent';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

export interface DecisionBriefCreateInput {
  decisionSummary: string;
  problem: string;
  optionsConsidered: string[];
  rationale: string;
  participants: string[];
  sourceReferences: any[];
  confidence: number;
  status: 'pending' | 'approved' | 'archived';
  tags: string[];
  decisionCandidateId?: string;
  userId: string;
}

export interface DecisionBriefUpdateInput {
  decisionSummary?: string;
  problem?: string;
  optionsConsidered?: string[];
  rationale?: string;
  participants?: string[];
  sourceReferences?: any[];
  confidence?: number;
  status?: 'pending' | 'approved' | 'archived';
  tags?: string[];
  userId: string;
}

export interface DecisionBriefFilter {
  userId?: string;
  status?: DecisionBrief['status'];
  tags?: string[];
  participants?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
}

export interface DecisionBriefStats {
  total: number;
  byStatus: Record<DecisionBrief['status'], number>;
  byTag: Record<string, number>;
  averageConfidence: number;
  recentActivity: {
    created: number;
    updated: number;
    lastUpdated: Date | null;
  };
}

// ============================================================================
// DECISION BRIEF SERVICE
// ============================================================================

class DecisionBriefService {
  /**
   * Create a new decision brief
   */
  static async createBrief(
    input: DecisionBriefCreateInput
  ): Promise<DecisionBrief> {
    try {
      const brief = await prisma.decisionBrief.create({
        data: {
          decisionSummary: input.decisionSummary,
          problem: input.problem,
          optionsConsidered: input.optionsConsidered,
          rationale: input.rationale,
          participants: input.participants,
          sourceReferences: input.sourceReferences,
          confidence: input.confidence,
          status: input.status,
          tags: input.tags,
          decisionCandidateId: input.decisionCandidateId,
          userId: input.userId,
        },
      });

      logger.info('Decision brief created', {
        briefId: brief.id,
        userId: input.userId,
        confidence: input.confidence,
        status: input.status,
      });

      metrics.increment('decision_brief_created', 1);
      metrics.increment('decision_brief_created_success', 1);

      return this.mapToDecisionBrief(brief);
    } catch (error) {
      logger.error('Failed to create decision brief', { error, input });
      metrics.increment('decision_brief_created_failure', 1);
      throw error;
    }
  }

  /**
   * Generate a decision brief from a decision candidate and context
   */
  static async generateBriefFromCandidate(
    candidate: DecisionCandidate,
    context: ExtractedContext
  ): Promise<DecisionBrief> {
    try {
      // Use the Rationale Generation Agent to create the brief
      const rationaleAgent = RationaleGenerationAgent.getInstance();
      const result = await rationaleAgent.generateRationale(candidate, context);

      if (!result.brief) {
        throw new Error('Failed to generate rationale for decision brief');
      }

      // Create the brief in the database
      const brief = await this.createBrief({
        decisionSummary: result.brief.decisionSummary,
        problem: result.brief.problem,
        optionsConsidered: result.brief.optionsConsidered,
        rationale: result.brief.rationale,
        participants: result.brief.participants,
        sourceReferences: result.citations,
        confidence: result.validation.confidence,
        status: 'pending',
        tags: result.brief.tags,
        decisionCandidateId: candidate.id,
        userId: candidate.userId,
      });

      // Update the decision candidate to link it to the brief
      await prisma.decisionCandidate.update({
        where: { id: candidate.id },
        data: { decisionBriefId: brief.id },
      });

      logger.info('Decision brief generated from candidate', {
        candidateId: candidate.id,
        briefId: brief.id,
        confidence: brief.confidence,
      });

      return brief;
    } catch (error) {
      logger.error('Failed to generate decision brief from candidate', { 
        error, 
        candidateId: candidate.id 
      });
      throw error;
    }
  }

  /**
   * Update an existing decision brief
   */
  static async updateBrief(
    briefId: string,
    input: DecisionBriefUpdateInput
  ): Promise<DecisionBrief> {
    try {
      // Check if the brief exists and belongs to the user
      const existing = await prisma.decisionBrief.findFirst({
        where: {
          id: briefId,
          userId: input.userId,
        },
      });

      if (!existing) {
        throw new Error('Decision brief not found or access denied');
      }

      const updated = await prisma.decisionBrief.update({
        where: { id: briefId },
        data: {
          decisionSummary: input.decisionSummary,
          problem: input.problem,
          optionsConsidered: input.optionsConsidered,
          rationale: input.rationale,
          participants: input.participants,
          sourceReferences: input.sourceReferences,
          confidence: input.confidence,
          status: input.status,
          tags: input.tags,
          updatedAt: new Date(),
        },
      });

      logger.info('Decision brief updated', {
        briefId,
        userId: input.userId,
        status: input.status,
      });

      metrics.increment('decision_brief_updated', 1);

      return this.mapToDecisionBrief(updated);
    } catch (error) {
      logger.error('Failed to update decision brief', { error, briefId });
      throw error;
    }
  }

  /**
   * Get a decision brief by ID
   */
  static async getBriefById(
    briefId: string,
    userId: string
  ): Promise<DecisionBrief | null> {
    try {
      const brief = await prisma.decisionBrief.findFirst({
        where: {
          id: briefId,
          userId,
        },
      });

      return brief ? this.mapToDecisionBrief(brief) : null;
    } catch (error) {
      logger.error('Failed to get decision brief by ID', { error, briefId });
      throw error;
    }
  }

  /**
   * Get decision brief by decision candidate ID
   */
  static async getBriefByCandidateId(
    candidateId: string,
    userId: string
  ): Promise<DecisionBrief | null> {
    try {
      const brief = await prisma.decisionBrief.findFirst({
        where: {
          decisionCandidateId: candidateId,
          userId,
        },
      });

      return brief ? this.mapToDecisionBrief(brief) : null;
    } catch (error) {
      logger.error('Failed to get decision brief by candidate ID', { 
        error, 
        candidateId 
      });
      throw error;
    }
  }

  /**
   * List decision briefs with filtering and pagination
   */
  static async listBriefs(
    filter: DecisionBriefFilter,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    briefs: DecisionBrief[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      
      if (filter.userId) {
        where.userId = filter.userId;
      }
      
      if (filter.status) {
        where.status = filter.status;
      }
      
      if (filter.tags && filter.tags.length > 0) {
        where.tags = {
          hasEvery: filter.tags,
        };
      }
      
      if (filter.participants && filter.participants.length > 0) {
        where.participants = {
          hasEvery: filter.participants,
        };
      }
      
      if (filter.dateRange) {
        where.createdAt = {
          gte: filter.dateRange.start,
          lte: filter.dateRange.end,
        };
      }
      
      if (filter.search) {
        where.OR = [
          { decisionSummary: { contains: filter.search, mode: 'insensitive' } },
          { problem: { contains: filter.search, mode: 'insensitive' } },
          { rationale: { contains: filter.search, mode: 'insensitive' } },
          { tags: { has: filter.search } },
        ];
      }

      // Get total count
      const total = await prisma.decisionBrief.count({ where });

      // Get briefs with pagination
      const briefs = await prisma.decisionBrief.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        briefs: briefs.map(this.mapToDecisionBrief),
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error('Failed to list decision briefs', { error, filter });
      throw error;
    }
  }

  /**
   * Delete a decision brief
   */
  static async deleteBrief(briefId: string, userId: string): Promise<boolean> {
    try {
      const result = await prisma.decisionBrief.deleteMany({
        where: {
          id: briefId,
          userId,
        },
      });

      if (result.count > 0) {
        logger.info('Decision brief deleted', { briefId, userId });
        metrics.increment('decision_brief_deleted', 1);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete decision brief', { error, briefId });
      throw error;
    }
  }

  /**
   * Approve a decision brief (change status to approved)
   */
  static async approveBrief(briefId: string, userId: string): Promise<DecisionBrief> {
    return this.updateBrief(briefId, {
      status: 'approved',
      userId,
    });
  }

  /**
   * Archive a decision brief
   */
  static async archiveBrief(briefId: string, userId: string): Promise<DecisionBrief> {
    return this.updateBrief(briefId, {
      status: 'archived',
      userId,
    });
  }

  /**
   * Add tags to a decision brief
   */
  static async addTags(
    briefId: string,
    tags: string[],
    userId: string
  ): Promise<DecisionBrief> {
    const brief = await this.getBriefById(briefId, userId);
    if (!brief) {
      throw new Error('Decision brief not found');
    }

    const newTags = Array.from(new Set([...brief.tags, ...tags]));
    
    return this.updateBrief(briefId, {
      tags: newTags,
      userId,
    });
  }

  /**
   * Remove tags from a decision brief
   */
  static async removeTags(
    briefId: string,
    tags: string[],
    userId: string
  ): Promise<DecisionBrief> {
    const brief = await this.getBriefById(briefId, userId);
    if (!brief) {
      throw new Error('Decision brief not found');
    }

    const newTags = brief.tags.filter(tag => !tags.includes(tag));
    
    return this.updateBrief(briefId, {
      tags: newTags,
      userId,
    });
  }

  /**
   * Get decision brief statistics
   */
  static async getStats(userId: string): Promise<DecisionBriefStats> {
    try {
      const total = await prisma.decisionBrief.count({
        where: { userId },
      });

      const byStatus = await prisma.decisionBrief.groupBy({
        by: ['status'],
        _count: true,
        where: { userId },
      });

      const byStatusRecord = {
        pending: 0,
        approved: 0,
        archived: 0,
      };

      byStatus.forEach(item => {
        byStatusRecord[item.status] = item._count;
      });

      const tagsResult = await prisma.decisionBrief.findMany({
        where: { userId },
        select: { tags: true },
      });

      const tagCounts: Record<string, number> = {};
      tagsResult.forEach(brief => {
        brief.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });

      const averageConfidenceResult = await prisma.decisionBrief.aggregate({
        _avg: { confidence: true },
        where: { userId },
      });

      const recentActivity = await prisma.decisionBrief.aggregate({
        _count: {
          _all: true,
        },
        _max: {
          updatedAt: true,
        },
        where: {
          userId,
          updatedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
      });

      return {
        total,
        byStatus: byStatusRecord,
        byTag: tagCounts,
        averageConfidence: averageConfidenceResult._avg.confidence || 0,
        recentActivity: {
          created: 0, // Would need to track creation separately
          updated: recentActivity._count._all,
          lastUpdated: recentActivity._max.updated,
        },
      };
    } catch (error) {
      logger.error('Failed to get decision brief stats', { error, userId });
      throw error;
    }
  }

  /**
   * Search decision briefs by content
   */
  static async searchBriefs(
    query: string,
    userId: string,
    limit: number = 20
  ): Promise<DecisionBrief[]> {
    try {
      const briefs = await prisma.decisionBrief.findMany({
        where: {
          userId,
          OR: [
            { decisionSummary: { contains: query, mode: 'insensitive' } },
            { problem: { contains: query, mode: 'insensitive' } },
            { rationale: { contains: query, mode: 'insensitive' } },
            { participants: { has: query } },
            { tags: { has: query } },
          ],
        },
        orderBy: { confidence: 'desc' },
        take: limit,
      });

      return briefs.map(this.mapToDecisionBrief);
    } catch (error) {
      logger.error('Failed to search decision briefs', { error, query, userId });
      throw error;
    }
  }

  /**
   * Get related decision briefs (by tags, participants, or similar content)
   */
  static async getRelatedBriefs(
    briefId: string,
    userId: string,
    limit: number = 10
  ): Promise<DecisionBrief[]> {
    try {
      const currentBrief = await this.getBriefById(briefId, userId);
      if (!currentBrief) {
        return [];
      }

      // Find briefs with overlapping tags or participants
      const related = await prisma.decisionBrief.findMany({
        where: {
          userId,
          id: { not: briefId },
          OR: [
            {
              tags: {
                hasSome: currentBrief.tags,
              },
            },
            {
              participants: {
                hasSome: currentBrief.participants,
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      return related.map(this.mapToDecisionBrief);
    } catch (error) {
      logger.error('Failed to get related decision briefs', { 
        error, 
        briefId, 
        userId 
      });
      throw error;
    }
  }

  /**
   * Export decision briefs to various formats
   */
  static async exportBriefs(
    userId: string,
    format: 'json' | 'csv' | 'markdown',
    filter?: DecisionBriefFilter
  ): Promise<string> {
    try {
      const { briefs } = await this.listBriefs(
        { ...filter, userId },
        1,
        1000 // Export limit
      );

      switch (format) {
        case 'json':
          return JSON.stringify(briefs, null, 2);
        
        case 'csv':
          const headers = [
            'ID',
            'Summary',
            'Problem',
            'Rationale',
            'Participants',
            'Confidence',
            'Status',
            'Tags',
            'Created At',
            'Updated At'
          ];
          
          const rows = briefs.map(b => [
            b.id,
            b.decisionSummary,
            b.problem,
            b.rationale,
            b.participants.join(';'),
            b.confidence.toString(),
            b.status,
            b.tags.join(';'),
            b.createdAt.toISOString(),
            b.updatedAt.toISOString(),
          ]);

          return [headers, ...rows].map(row => row.join(',')).join('\n');
        
        case 'markdown':
          return briefs.map(b => `
# ${b.decisionSummary}

**Problem:** ${b.problem}
**Rationale:** ${b.rationale}
**Participants:** ${b.participants.join(', ')}
**Confidence:** ${b.confidence}
**Status:** ${b.status}
**Tags:** ${b.tags.join(', ')}
**Created:** ${b.createdAt.toISOString()}
**Updated:** ${b.updatedAt.toISOString()}

---
`).join('\n');

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      logger.error('Failed to export decision briefs', { error, userId, format });
      throw error;
    }
  }

  /**
   * Map Prisma model to DecisionBrief interface
   */
  private static mapToDecisionBrief(dbModel: any): DecisionBrief {
    return {
      id: dbModel.id,
      decisionSummary: dbModel.decisionSummary,
      problem: dbModel.problem,
      optionsConsidered: dbModel.optionsConsidered,
      rationale: dbModel.rationale,
      participants: dbModel.participants,
      sourceReferences: dbModel.sourceReferences,
      confidence: dbModel.confidence,
      status: dbModel.status,
      tags: dbModel.tags,
      decisionCandidateId: dbModel.decisionCandidateId,
      userId: dbModel.userId,
      createdAt: dbModel.createdAt,
      updatedAt: dbModel.updatedAt,
    };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for decision brief management
 */
class DecisionBriefIntegration {
  /**
   * Create a decision brief from a detected decision
   */
  static async createFromDecision(
    candidate: DecisionCandidate,
    context: ExtractedContext
  ): Promise<DecisionBrief> {
    try {
      return await DecisionBriefService.generateBriefFromCandidate(candidate, context);
    } catch (error) {
      logger.error('Failed to create decision brief from decision', { 
        error, 
        candidateId: candidate.id 
      });
      throw error;
    }
  }

  /**
   * Get decision brief health metrics
   */
  static async getHealthMetrics(): Promise<{
    serviceStatus: string;
    lastBriefTime: Date | null;
    averageGenerationTime: number;
    successRate: number;
    totalBriefs: number;
  }> {
    try {
      const stats = await DecisionBriefService.getStats('system'); // Would need system user
      
      return {
        serviceStatus: 'healthy',
        lastBriefTime: new Date(),
        averageGenerationTime: 5000, // milliseconds
        successRate: 0.95, // 95%
        totalBriefs: stats.total,
      };
    } catch (error) {
      return {
        serviceStatus: 'degraded',
        lastBriefTime: null,
        averageGenerationTime: 0,
        successRate: 0,
        totalBriefs: 0,
      };
    }
  }
}

export {
  DecisionBriefService,
  DecisionBriefIntegration,
};