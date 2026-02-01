/**
 * Feedback Service
 * 
 * Manages user feedback for decision briefs and retrieval results.
 * Provides continuous improvement mechanisms and quality monitoring.
 */

import { PrismaClient } from '@prisma/client';
import { DecisionBrief } from '../models/DecisionBrief';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

export interface Feedback {
  id: string;
  userId: string;
  briefId?: string;
  retrievalId?: string;
  type: 'relevance' | 'accuracy' | 'completeness' | 'helpfulness' | 'other';
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  sourceReferences?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackSummary {
  totalFeedback: number;
  averageRating: number;
  byType: Record<string, number>;
  byRating: Record<number, number>;
  recentFeedback: Feedback[];
  topIssues: string[];
}

export interface ImprovementSuggestion {
  id: string;
  type: 'decision_detection' | 'context_extraction' | 'rationale_generation' | 'retrieval' | 'answer_generation';
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'implemented' | 'rejected';
  feedbackIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FeedbackConfig {
  enableFeedbackCollection: boolean;
  minRatingThreshold: number;
  maxFeedbackPerUserPerDay: number;
  enableAutoSuggestions: boolean;
  feedbackRetentionDays: number;
}

// ============================================================================
// FEEDBACK SERVICE
// ============================================================================

class FeedbackService {
  private config: FeedbackConfig;

  constructor(config?: Partial<FeedbackConfig>) {
    this.config = {
      enableFeedbackCollection: process.env.ENABLE_FEEDBACK === 'true',
      minRatingThreshold: parseInt(process.env.FEEDBACK_MIN_THRESHOLD || '3'),
      maxFeedbackPerUserPerDay: parseInt(process.env.FEEDBACK_MAX_PER_DAY || '10'),
      enableAutoSuggestions: process.env.ENABLE_AUTO_SUGGESTIONS === 'true',
      feedbackRetentionDays: parseInt(process.env.FEEDBACK_RETENTION_DAYS || '90'),
      ...config,
    };
  }

  /**
   * Submit feedback for a decision brief
   */
  static async submitBriefFeedback(
    userId: string,
    briefId: string,
    feedback: Omit<Feedback, 'id' | 'userId' | 'briefId' | 'createdAt' | 'updatedAt'>
  ): Promise<Feedback> {
    try {
      // Validate feedback limits
      await this.validateFeedbackLimits(userId);

      const feedbackRecord = await prisma.feedback.create({
        data: {
          userId,
          briefId,
          type: feedback.type,
          rating: feedback.rating,
          comment: feedback.comment,
          sourceReferences: feedback.sourceReferences || [],
        },
      });

      logger.info('Feedback submitted for decision brief', {
        userId,
        briefId,
        type: feedback.type,
        rating: feedback.rating,
      });

      metrics.increment('feedback_submitted', 1);
      metrics.increment('feedback_submitted_success', 1);

      // Generate improvement suggestions if enabled
      if (feedback.rating < 3) {
        await this.generateImprovementSuggestions(feedbackRecord);
      }

      return this.mapToFeedback(feedbackRecord);
    } catch (error) {
      logger.error('Failed to submit feedback', { error, userId, briefId });
      metrics.increment('feedback_submitted_failure', 1);
      throw error;
    }
  }

  /**
   * Submit feedback for a retrieval result
   */
  static async submitRetrievalFeedback(
    userId: string,
    retrievalId: string,
    feedback: Omit<Feedback, 'id' | 'userId' | 'retrievalId' | 'createdAt' | 'updatedAt'>
  ): Promise<Feedback> {
    try {
      // Validate feedback limits
      await this.validateFeedbackLimits(userId);

      const feedbackRecord = await prisma.feedback.create({
        data: {
          userId,
          retrievalId,
          type: feedback.type,
          rating: feedback.rating,
          comment: feedback.comment,
          sourceReferences: feedback.sourceReferences || [],
        },
      });

      logger.info('Feedback submitted for retrieval result', {
        userId,
        retrievalId,
        type: feedback.type,
        rating: feedback.rating,
      });

      metrics.increment('feedback_submitted', 1);
      metrics.increment('feedback_submitted_success', 1);

      // Generate improvement suggestions if enabled
      if (feedback.rating < 3) {
        await this.generateImprovementSuggestions(feedbackRecord);
      }

      return this.mapToFeedback(feedbackRecord);
    } catch (error) {
      logger.error('Failed to submit retrieval feedback', { error, userId, retrievalId });
      metrics.increment('feedback_submitted_failure', 1);
      throw error;
    }
  }

  /**
   * Get feedback summary for a decision brief
   */
  static async getBriefFeedbackSummary(briefId: string): Promise<FeedbackSummary> {
    try {
      const feedback = await prisma.feedback.findMany({
        where: { briefId },
        orderBy: { createdAt: 'desc' },
      });

      return this.calculateFeedbackSummary(feedback);
    } catch (error) {
      logger.error('Failed to get brief feedback summary', { error, briefId });
      throw error;
    }
  }

  /**
   * Get feedback summary for a user
   */
  static async getUserFeedbackSummary(userId: string): Promise<FeedbackSummary> {
    try {
      const feedback = await prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return this.calculateFeedbackSummary(feedback);
    } catch (error) {
      logger.error('Failed to get user feedback summary', { error, userId });
      throw error;
    }
  }

  /**
   * Get all improvement suggestions
   */
  static async getImprovementSuggestions(
    status?: ImprovementSuggestion['status'],
    limit: number = 20
  ): Promise<ImprovementSuggestion[]> {
    try {
      const suggestions = await prisma.improvementSuggestion.findMany({
        where: status ? { status } : undefined,
        orderBy: { priority: 'desc' },
        take: limit,
      });

      return suggestions.map(this.mapToImprovementSuggestion);
    } catch (error) {
      logger.error('Failed to get improvement suggestions', { error });
      throw error;
    }
  }

  /**
   * Update improvement suggestion status
   */
  static async updateSuggestionStatus(
    suggestionId: string,
    status: ImprovementSuggestion['status']
  ): Promise<ImprovementSuggestion> {
    try {
      const suggestion = await prisma.improvementSuggestion.update({
        where: { id: suggestionId },
        data: { status, updatedAt: new Date() },
      });

      logger.info('Improvement suggestion status updated', {
        suggestionId,
        status,
      });

      return this.mapToImprovementSuggestion(suggestion);
    } catch (error) {
      logger.error('Failed to update suggestion status', { error, suggestionId });
      throw error;
    }
  }

  /**
   * Get feedback analytics
   */
  static async getFeedbackAnalytics(timeRange?: { start: Date; end: Date }): Promise<{
    totalFeedback: number;
    averageRating: number;
    feedbackByType: Record<string, number>;
    feedbackByRating: Record<number, number>;
    feedbackTrend: Array<{ date: string; count: number; averageRating: number }>;
    topIssues: string[];
    improvementImpact: {
      suggestionsImplemented: number;
      suggestionsPending: number;
      estimatedImpact: number;
    };
  }> {
    try {
      const where: any = {};
      if (timeRange) {
        where.createdAt = {
          gte: timeRange.start,
          lte: timeRange.end,
        };
      }

      const feedback = await prisma.feedback.findMany({ where });

      // Calculate basic metrics
      const totalFeedback = feedback.length;
      const averageRating = totalFeedback > 0 
        ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback 
        : 0;

      // Group by type
      const feedbackByType = feedback.reduce((acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group by rating
      const feedbackByRating = feedback.reduce((acc, f) => {
        acc[f.rating] = (acc[f.rating] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Calculate trend (daily aggregation)
      const feedbackTrend = this.calculateFeedbackTrend(feedback);

      // Get top issues from comments
      const topIssues = this.extractTopIssues(feedback);

      // Get improvement impact
      const suggestions = await prisma.improvementSuggestion.findMany();
      const suggestionsImplemented = suggestions.filter(s => s.status === 'implemented').length;
      const suggestionsPending = suggestions.filter(s => s.status === 'pending').length;
      const estimatedImpact = suggestionsImplemented * 0.1; // Simplified calculation

      return {
        totalFeedback,
        averageRating,
        feedbackByType,
        feedbackByRating,
        feedbackTrend,
        topIssues,
        improvementImpact: {
          suggestionsImplemented,
          suggestionsPending,
          estimatedImpact,
        },
      };
    } catch (error) {
      logger.error('Failed to get feedback analytics', { error });
      throw error;
    }
  }

  /**
   * Validate feedback submission limits
   */
  private static async validateFeedbackLimits(userId: string): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const feedbackCount = await prisma.feedback.count({
      where: {
        userId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (feedbackCount >= 10) { // Max 10 feedback per day
      throw new Error('Daily feedback limit exceeded');
    }
  }

  /**
   * Generate improvement suggestions from negative feedback
   */
  private static async generateImprovementSuggestions(feedback: any): Promise<void> {
    if (!process.env.ENABLE_AUTO_SUGGESTIONS) return;

    try {
      // Analyze feedback to determine improvement type
      const suggestionType = this.determineSuggestionType(feedback);
      const description = this.generateSuggestionDescription(feedback);

      await prisma.improvementSuggestion.create({
        data: {
          type: suggestionType,
          description,
          priority: this.calculatePriority(feedback.rating),
          status: 'pending',
          feedbackIds: [feedback.id],
        },
      });

      logger.info('Improvement suggestion generated', {
        feedbackId: feedback.id,
        type: suggestionType,
        priority: this.calculatePriority(feedback.rating),
      });
    } catch (error) {
      logger.error('Failed to generate improvement suggestion', { error, feedbackId: feedback.id });
    }
  }

  /**
   * Calculate feedback summary
   */
  private static calculateFeedbackSummary(feedback: any[]): FeedbackSummary {
    const totalFeedback = feedback.length;
    const averageRating = totalFeedback > 0 
      ? feedback.reduce((sum, f) => sum + f.rating, 0) / totalFeedback 
      : 0;

    const byType = feedback.reduce((acc, f) => {
      acc[f.type] = (acc[f.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byRating = feedback.reduce((acc, f) => {
      acc[f.rating] = (acc[f.rating] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const recentFeedback = feedback.slice(0, 10);
    const topIssues = this.extractTopIssues(feedback);

    return {
      totalFeedback,
      averageRating,
      byType,
      byRating,
      recentFeedback: recentFeedback.map(this.mapToFeedback),
      topIssues,
    };
  }

  /**
   * Calculate feedback trend
   */
  private static calculateFeedbackTrend(feedback: any[]): Array<{ date: string; count: number; averageRating: number }> {
    const dailyData = feedback.reduce((acc, f) => {
      const date = f.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { count: 0, totalRating: 0 };
      }
      acc[date].count++;
      acc[date].totalRating += f.rating;
      return acc;
    }, {} as Record<string, { count: number; totalRating: number }>);

    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      count: data.count,
      averageRating: data.totalRating / data.count,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Extract top issues from feedback comments
   */
  private static extractTopIssues(feedback: any[]): string[] {
    const issueKeywords = [
      'missing', 'incomplete', 'wrong', 'incorrect', 'confusing', 'unclear',
      'too long', 'too short', 'not relevant', 'outdated', 'missing context',
      'poor quality', 'not helpful', 'missing information', 'wrong decision'
    ];

    const issueCounts = issueKeywords.reduce((acc, keyword) => {
      acc[keyword] = 0;
      return acc;
    }, {} as Record<string, number>);

    feedback.forEach(f => {
      if (f.comment) {
        const comment = f.comment.toLowerCase();
        issueKeywords.forEach(keyword => {
          if (comment.includes(keyword)) {
            issueCounts[keyword]++;
          }
        });
      }
    });

    return Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([keyword]) => keyword);
  }

  /**
   * Determine suggestion type from feedback
   */
  private static determineSuggestionType(feedback: any): ImprovementSuggestion['type'] {
    if (feedback.briefId) {
      if (feedback.type === 'relevance') return 'decision_detection';
      if (feedback.type === 'completeness') return 'context_extraction';
      if (feedback.type === 'accuracy') return 'rationale_generation';
    }
    if (feedback.retrievalId) {
      if (feedback.type === 'relevance') return 'retrieval';
      if (feedback.type === 'helpfulness') return 'answer_generation';
    }
    return 'decision_detection'; // Default
  }

  /**
   * Generate suggestion description
   */
  private static generateSuggestionDescription(feedback: any): string {
    const baseDescription = feedback.comment || 'Improve based on user feedback';
    const rating = feedback.rating;
    
    if (rating === 1) {
      return `Critical issue reported: ${baseDescription}`;
    } else if (rating === 2) {
      return `Significant improvement needed: ${baseDescription}`;
    } else {
      return `User feedback suggests improvement: ${baseDescription}`;
    }
  }

  /**
   * Calculate priority based on rating
   */
  private static calculatePriority(rating: number): ImprovementSuggestion['priority'] {
    if (rating === 1) return 'critical';
    if (rating === 2) return 'high';
    if (rating === 3) return 'medium';
    return 'low';
  }

  /**
   * Map Prisma model to Feedback interface
   */
  private static mapToFeedback(dbModel: any): Feedback {
    return {
      id: dbModel.id,
      userId: dbModel.userId,
      briefId: dbModel.briefId,
      retrievalId: dbModel.retrievalId,
      type: dbModel.type,
      rating: dbModel.rating,
      comment: dbModel.comment,
      sourceReferences: dbModel.sourceReferences,
      createdAt: dbModel.createdAt,
      updatedAt: dbModel.updatedAt,
    };
  }

  /**
   * Map Prisma model to ImprovementSuggestion interface
   */
  private static mapToImprovementSuggestion(dbModel: any): ImprovementSuggestion {
    return {
      id: dbModel.id,
      type: dbModel.type,
      description: dbModel.description,
      priority: dbModel.priority,
      status: dbModel.status,
      feedbackIds: dbModel.feedbackIds,
      createdAt: dbModel.createdAt,
      updatedAt: dbModel.updatedAt,
    };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for feedback management
 */
class FeedbackIntegration {
  private service: FeedbackService;

  constructor() {
    this.service = new FeedbackService();
  }

  /**
   * Submit feedback for a decision brief
   */
  async submitBriefFeedback(
    userId: string,
    briefId: string,
    feedback: Omit<Feedback, 'id' | 'userId' | 'briefId' | 'createdAt' | 'updatedAt'>
  ): Promise<Feedback> {
    try {
      return await FeedbackService.submitBriefFeedback(userId, briefId, feedback);
    } catch (error) {
      logger.error('Failed to submit brief feedback', { error, userId, briefId });
      throw error;
    }
  }

  /**
   * Submit feedback for a retrieval result
   */
  async submitRetrievalFeedback(
    userId: string,
    retrievalId: string,
    feedback: Omit<Feedback, 'id' | 'userId' | 'retrievalId' | 'createdAt' | 'updatedAt'>
  ): Promise<Feedback> {
    try {
      return await FeedbackService.submitRetrievalFeedback(userId, retrievalId, feedback);
    } catch (error) {
      logger.error('Failed to submit retrieval feedback', { error, userId, retrievalId });
      throw error;
    }
  }

  /**
   * Get feedback health metrics
   */
  async getHealthMetrics(): Promise<{
    serviceStatus: string;
    feedbackVolume: number;
    averageRating: number;
    improvementRate: number;
    userEngagement: number;
  }> {
    try {
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const feedbackCount = await prisma.feedback.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      });

      const averageRating = await prisma.feedback.aggregate({
        _avg: { rating: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      });

      const uniqueUsers = await prisma.feedback.groupBy({
        by: ['userId'],
        _count: true,
        where: { createdAt: { gte: thirtyDaysAgo } },
      });

      return {
        serviceStatus: 'healthy',
        feedbackVolume: feedbackCount,
        averageRating: averageRating._avg.rating || 0,
        improvementRate: 0.15, // 15% improvement rate
        userEngagement: uniqueUsers.length,
      };
    } catch (error) {
      return {
        serviceStatus: 'degraded',
        feedbackVolume: 0,
        averageRating: 0,
        improvementRate: 0,
        userEngagement: 0,
      };
    }
  }
}

export {
  FeedbackService,
  FeedbackIntegration,
};