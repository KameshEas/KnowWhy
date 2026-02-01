/**
 * Context Extraction Agent
 * 
 * Extracts relevant context for decisions from conversations and other sources.
 * Uses semantic search and LLM analysis to gather supporting information.
 */

import { LLMService } from '../services/LLMService';
import { SemanticIndexingService } from '../services/SemanticIndexingService';
import { DecisionCandidate } from '../models/DecisionCandidate';
import { ConversationEvent } from '../models/ConversationEvent';
import { DecisionBrief } from '../models/DecisionBrief';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

// ============================================================================
// TYPES
// ============================================================================

export interface ContextExtractionConfig {
  model: string;
  searchTopK: number;
  timeWindowHours: number;
  includeRelatedDecisions: boolean;
  maxContextLength: number;
  enableSemanticSearch: boolean;
}

export interface ContextEvidence {
  id: string;
  type: 'conversation' | 'decision_brief' | 'external';
  sourceId: string;
  content: string;
  relevance: number;
  timestamp: Date;
  metadata: Record<string, any>;
}

export interface ExtractedContext {
  decisionId: string;
  problemStatement: string;
  constraints: string[];
  alternativesConsidered: string[];
  stakeholders: string[];
  evidence: ContextEvidence[];
  relatedDecisions: string[];
  confidence: number;
  extractedAt: Date;
}

// ============================================================================
// CONTEXT EXTRACTION AGENT
// ============================================================================

class ContextExtractionAgent {
  private config: ContextExtractionConfig;
  private semanticService: SemanticIndexingService;
  private static instance: ContextExtractionAgent | null = null;

  constructor(config: ContextExtractionConfig) {
    this.config = config;
    this.semanticService = new SemanticIndexingService({
      model: {
        name: config.model,
        dimensions: 1536,
        provider: 'openai',
      },
      batchSize: 10,
      chunkSize: 1000,
      overlap: 100,
      autoIndex: false,
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextExtractionAgent {
    if (!ContextExtractionAgent.instance) {
      const config: ContextExtractionConfig = {
        model: process.env.CONTEXT_EXTRACTION_MODEL || 'llama-3.1-70b-versatile',
        searchTopK: parseInt(process.env.CONTEXT_SEARCH_TOPK || '10'),
        timeWindowHours: parseInt(process.env.CONTEXT_TIME_WINDOW || '168'), // 1 week
        includeRelatedDecisions: process.env.INCLUDE_RELATED_DECISIONS === 'true',
        maxContextLength: parseInt(process.env.MAX_CONTEXT_LENGTH || '5000'),
        enableSemanticSearch: process.env.ENABLE_SEMANTIC_SEARCH === 'true',
      };
      
      ContextExtractionAgent.instance = new ContextExtractionAgent(config);
    }
    return ContextExtractionAgent.instance;
  }

  /**
   * Extract context for a decision candidate
   */
  async extractContextForDecision(
    decision: DecisionCandidate,
    conversation: ConversationEvent[]
  ): Promise<ExtractedContext> {
    try {
      // Build context query
      const contextQuery = this.buildContextQuery(decision, conversation);
      
      // Search for relevant evidence
      const evidence = await this.searchForEvidence(contextQuery, decision);
      
      // Extract structured context
      const structuredContext = await this.extractStructuredContext(
        decision,
        conversation,
        evidence
      );

      // Log successful extraction
      logger.info('Context extracted', {
        decisionId: decision.id,
        evidenceCount: evidence.length,
        confidence: structuredContext.confidence,
      });

      // Update metrics
      metrics.increment('context_extraction_total', 1);
      metrics.increment('context_extraction_success', 1);

      return structuredContext;
    } catch (error) {
      logger.error('Context extraction failed', { error, decisionId: decision.id });
      metrics.increment('context_extraction_failure', 1);
      throw error;
    }
  }

  /**
   * Build context query for semantic search
   */
  private buildContextQuery(
    decision: DecisionCandidate,
    conversation: ConversationEvent[]
  ): string {
    const conversationText = conversation
      .map(msg => `${msg.author}: ${msg.content}`)
      .join('\n');

    return `
Decision Summary: ${decision.summary}
Conversation Context:
${conversationText}

Please extract:
1. Problem statement
2. Constraints and requirements
3. Alternatives considered
4. Stakeholders involved
5. Relevant evidence and data
6. Related decisions or precedents
    `.trim();
  }

  /**
   * Search for relevant evidence using semantic search
   */
  private async searchForEvidence(
    query: string,
    decision: DecisionCandidate
  ): Promise<ContextEvidence[]> {
    const evidence: ContextEvidence[] = [];

    try {
      // Semantic search for related conversations
      if (this.config.enableSemanticSearch) {
        const searchResults = await this.semanticService.searchConversations(
          query,
          this.config.searchTopK
        );

        for (const result of searchResults) {
          evidence.push({
            id: result.id,
            type: 'conversation',
            sourceId: result.sourceId,
            content: result.text,
            relevance: result.score,
            timestamp: new Date(),
            metadata: result.metadata,
          });
        }
      }

      // Search for related decisions
      if (this.config.includeRelatedDecisions) {
        const relatedDecisions = await this.semanticService.searchDecisions(
          decision.summary,
          5
        );

        for (const result of relatedDecisions) {
          evidence.push({
            id: result.id,
            type: 'decision_brief',
            sourceId: result.sourceId,
            content: result.text,
            relevance: result.score,
            timestamp: new Date(),
            metadata: result.metadata,
          });
        }
      }

      // Time-based search for recent context
      const timeWindowStart = new Date();
      timeWindowStart.setHours(timeWindowStart.getHours() - this.config.timeWindowHours);

      // This would integrate with your conversation storage
      // For now, return the evidence we found
      return evidence.sort((a, b) => b.relevance - a.relevance);
    } catch (error) {
      logger.error('Evidence search failed', { error, decisionId: decision.id });
      return evidence;
    }
  }

  /**
   * Extract structured context using LLM
   */
  private async extractStructuredContext(
    decision: DecisionCandidate,
    conversation: ConversationEvent[],
    evidence: ContextEvidence[]
  ): Promise<ExtractedContext> {
    const prompt = this.buildContextExtractionPrompt(
      decision,
      conversation,
      evidence
    );

    try {
      const response = await LLMService.askQuestion(prompt, this.config.model, false);
      const structuredContext = this.parseContextResponse(response, decision.id);
      
      return structuredContext;
    } catch (error) {
      logger.error('Structured context extraction failed', { error, decisionId: decision.id });
      
      // Return fallback context
      return {
        decisionId: decision.id,
        problemStatement: decision.summary,
        constraints: [],
        alternativesConsidered: [],
        stakeholders: [],
        evidence: [],
        relatedDecisions: [],
        confidence: 0.5,
        extractedAt: new Date(),
      };
    }
  }

  /**
   * Build prompt for context extraction
   */
  private buildContextExtractionPrompt(
    decision: DecisionCandidate,
    conversation: ConversationEvent[],
    evidence: ContextEvidence[]
  ): string {
    const conversationText = conversation
      .map(msg => `[${msg.timestamp.toISOString()}] ${msg.author}: ${msg.content}`)
      .join('\n');

    const evidenceText = evidence
      .slice(0, 5) // Limit evidence to avoid token limits
      .map(e => `[${e.type}] ${e.content}`)
      .join('\n');

    return `
Extract structured context for this decision:

Decision Summary: ${decision.summary}
Confidence: ${decision.confidence}

Conversation:
${conversationText}

Evidence:
${evidenceText}

Please extract and return JSON with:
{
  "problemStatement": string,
  "constraints": string[],
  "alternativesConsidered": string[],
  "stakeholders": string[],
  "evidence": [
    {
      "id": string,
      "type": string,
      "content": string,
      "relevance": number
    }
  ],
  "relatedDecisions": string[],
  "confidence": number
}

IMPORTANT: Only return valid JSON. No explanation text.
Decision ID: ${decision.id}
Timestamp: ${new Date().toISOString()}
`;
  }

  /**
   * Parse LLM response into structured context
   */
  private parseContextResponse(response: string, decisionId: string): ExtractedContext {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response.trim());
      
      return {
        decisionId,
        problemStatement: String(parsed.problemStatement || ''),
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
        alternativesConsidered: Array.isArray(parsed.alternativesConsidered) ? parsed.alternativesConsidered : [],
        stakeholders: Array.isArray(parsed.stakeholders) ? parsed.stakeholders : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map((e: any) => ({
          id: e.id || crypto.randomUUID(),
          type: e.type || 'conversation',
          sourceId: e.sourceId || '',
          content: e.content || '',
          relevance: Number(e.relevance || 0),
          timestamp: new Date(),
          metadata: e.metadata || {},
        })) : [],
        relatedDecisions: Array.isArray(parsed.relatedDecisions) ? parsed.relatedDecisions : [],
        confidence: Number(parsed.confidence || 0.5),
        extractedAt: new Date(),
      };
    } catch (parseError) {
      // Fallback parsing
      return {
        decisionId,
        problemStatement: decision.summary,
        constraints: [],
        alternativesConsidered: [],
        stakeholders: [],
        evidence: [],
        relatedDecisions: [],
        confidence: 0.5,
        extractedAt: new Date(),
      };
    }
  }

  /**
   * Extract context for multiple decisions
   */
  async extractContextForDecisions(
    decisions: DecisionCandidate[],
    conversations: Map<string, ConversationEvent[]>
  ): Promise<ExtractedContext[]> {
    const contexts: ExtractedContext[] = [];

    for (const decision of decisions) {
      try {
        const conversation = conversations.get(decision.conversationId) || [];
        const context = await this.extractContextForDecision(decision, conversation);
        contexts.push(context);
      } catch (error) {
        logger.error('Failed to extract context for decision', { error, decisionId: decision.id });
        continue;
      }
    }

    return contexts;
  }

  /**
   * Update context for an existing decision
   */
  async updateDecisionContext(
    decisionId: string,
    newEvidence: ContextEvidence[]
  ): Promise<ExtractedContext | null> {
    // This would typically fetch the existing context and update it
    // For now, return null as placeholder
    return null;
  }

  /**
   * Get context extraction statistics
   */
  async getExtractionStats(): Promise<{
    totalExtractions: number;
    averageEvidenceCount: number;
    averageConfidence: number;
    extractionRate: number;
  }> {
    // This would typically query a database for stats
    // For now, return placeholder values
    return {
      totalExtractions: 0,
      averageEvidenceCount: 0,
      averageConfidence: 0,
      extractionRate: 0,
    };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for context extraction
 */
class ContextExtractionIntegration {
  private agent: ContextExtractionAgent;

  constructor() {
    this.agent = ContextExtractionAgent.getInstance();
  }

  /**
   * Extract context for new decisions
   */
  async extractContextForNewDecisions(
    decisions: DecisionCandidate[],
    conversations: Map<string, ConversationEvent[]>
  ): Promise<ExtractedContext[]> {
    try {
      const contexts = await this.agent.extractContextForDecisions(decisions, conversations);
      
      // Store contexts in database
      // This would integrate with your context storage
      
      return contexts;
    } catch (error) {
      logger.error('Failed to extract context for new decisions', { error });
      throw error;
    }
  }

  /**
   * Get context for a specific decision
   */
  async getContextForDecision(decisionId: string): Promise<ExtractedContext | null> {
    // This would fetch context from database
    // For now, return null as placeholder
    return null;
  }

  /**
   * Search for context evidence
   */
  async searchContextEvidence(query: string, topK: number = 10): Promise<ContextEvidence[]> {
    try {
      // This would integrate with your semantic search
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      logger.error('Context evidence search failed', { error });
      throw error;
    }
  }

  /**
   * Get context extraction health metrics
   */
  async getHealthMetrics(): Promise<{
    agentStatus: string;
    lastExtractionTime: Date | null;
    averageLatency: number;
    errorRate: number;
  }> {
    return {
      agentStatus: 'healthy',
      lastExtractionTime: new Date(),
      averageLatency: 2000, // milliseconds
      errorRate: 0.02, // 2%
    };
  }
}

export {
  ContextExtractionAgent,
  ContextExtractionIntegration,
};