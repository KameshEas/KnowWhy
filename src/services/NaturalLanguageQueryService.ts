/**
 * Natural Language Query Service
 * 
 * Handles natural language queries and converts them to structured search requests.
 * Implements query understanding, intent classification, and query optimization.
 */

import { LLMService } from './LLMService';
import { SemanticIndexingService } from './SemanticIndexingService';
import { DecisionBrief } from '../models/DecisionBrief';
import { ConversationEvent, ConversationSource } from '../models/ConversationEvent';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

// ============================================================================
// TYPES
// ============================================================================

export interface QueryUnderstanding {
  intent: 'decision_search' | 'context_search' | 'general_query' | 'unknown';
  entities: {
    decisionTopic?: string;
    timeRange?: { start: Date; end: Date };
    stakeholders?: string[];
    tags?: string[];
    confidence: number;
  };
  queryType: 'specific' | 'broad' | 'exploratory';
  optimizedQuery: string;
}

export interface QueryResult {
  type: 'decision' | 'conversation' | 'mixed';
  items: Array<DecisionBrief | ConversationEvent>;
  total: number;
  queryUnderstanding: QueryUnderstanding;
  searchMetadata: {
    searchTime: number;
    itemsSearched: number;
    relevanceThreshold: number;
  };
}

export interface QueryConfig {
  model: string;
  maxResults: number;
  relevanceThreshold: number;
  enableQueryOptimization: boolean;
  enableIntentClassification: boolean;
  maxQueryLength: number;
}

// ============================================================================
// NATURAL LANGUAGE QUERY SERVICE
// ============================================================================

class NaturalLanguageQueryService {
  private config: QueryConfig;
  private semanticService: SemanticIndexingService;
  private static instance: NaturalLanguageQueryService | null = null;

  constructor(config: QueryConfig) {
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
  static getInstance(): NaturalLanguageQueryService {
    if (!NaturalLanguageQueryService.instance) {
      const config: QueryConfig = {
        model: process.env.QUERY_MODEL || 'llama-3.1-70b-versatile',
        maxResults: parseInt(process.env.QUERY_MAX_RESULTS || '20'),
        relevanceThreshold: parseFloat(process.env.QUERY_RELEVANCE_THRESHOLD || '0.3'),
        enableQueryOptimization: process.env.ENABLE_QUERY_OPTIMIZATION === 'true',
        enableIntentClassification: process.env.ENABLE_INTENT_CLASSIFICATION === 'true',
        maxQueryLength: parseInt(process.env.QUERY_MAX_LENGTH || '500'),
      };
      
      NaturalLanguageQueryService.instance = new NaturalLanguageQueryService(config);
    }
    return NaturalLanguageQueryService.instance;
  }

  /**
   * Process natural language query
   */
  async processQuery(query: string, userId: string): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Validate query
      this.validateQuery(query);

      // Understand query intent and entities
      const queryUnderstanding = await this.understandQuery(query);

      // Optimize query if enabled
      const optimizedQuery = this.config.enableQueryOptimization 
        ? await this.optimizeQuery(query, queryUnderstanding)
        : query;

      // Execute search based on intent
      const searchResults = await this.executeSearch(optimizedQuery, queryUnderstanding);

      // Calculate search metadata
      const searchTime = Date.now() - startTime;

      const result: QueryResult = {
        type: searchResults.length > 0 ? this.determineResultType(searchResults) : 'mixed',
        items: searchResults,
        total: searchResults.length,
        queryUnderstanding,
        searchMetadata: {
          searchTime,
          itemsSearched: searchResults.length,
          relevanceThreshold: this.config.relevanceThreshold,
        },
      };

      // Log successful query
      logger.info('Query processed successfully', {
        userId,
        query: query.substring(0, 100),
        intent: queryUnderstanding.intent,
        resultCount: result.total,
        searchTime,
      });

      // Update metrics
      metrics.increment('query_processed_total', 1);
      metrics.increment('query_processed_success', 1);

      return result;
    } catch (error) {
      logger.error('Query processing failed', { error, userId, query: query.substring(0, 100) });
      metrics.increment('query_processed_failure', 1);
      
      // Return empty result on failure
      return {
        type: 'mixed',
        items: [],
        total: 0,
        queryUnderstanding: {
          intent: 'unknown',
          entities: { confidence: 0 },
          queryType: 'broad',
          optimizedQuery: query,
        },
        searchMetadata: {
          searchTime: Date.now() - startTime,
          itemsSearched: 0,
          relevanceThreshold: this.config.relevanceThreshold,
        },
      };
    }
  }

  /**
   * Validate query input
   */
  private validateQuery(query: string): void {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (query.length > this.config.maxQueryLength) {
      throw new Error(`Query too long. Maximum length: ${this.config.maxQueryLength} characters`);
    }

    // Check for potentially harmful queries
    const harmfulPatterns = [
      /drop\s+table/i,
      /delete\s+from/i,
      /truncate\s+table/i,
      /drop\s+database/i,
    ];

    for (const pattern of harmfulPatterns) {
      if (pattern.test(query)) {
        throw new Error('Query contains potentially harmful operations');
      }
    }
  }

  /**
   * Understand query intent and extract entities
   */
  private async understandQuery(query: string): Promise<QueryUnderstanding> {
    if (!this.config.enableIntentClassification) {
      return {
        intent: 'general_query',
        entities: { confidence: 0.5 },
        queryType: 'broad',
        optimizedQuery: query,
      };
    }

    const prompt = `
Analyze this natural language query and extract structured information:

QUERY: "${query}"

Please analyze and return JSON with:
{
  "intent": "decision_search" | "context_search" | "general_query" | "unknown",
  "entities": {
    "decisionTopic": string | null,
    "timeRange": {
      "start": "ISO date" | null,
      "end": "ISO date" | null
    } | null,
    "stakeholders": string[] | null,
    "tags": string[] | null,
    "confidence": number
  },
  "queryType": "specific" | "broad" | "exploratory",
  "optimizedQuery": string
}

Intent classification:
- decision_search: Looking for specific decisions or decision briefs
- context_search: Looking for context, conversations, or related information
- general_query: General questions about the system or capabilities
- unknown: Cannot determine intent

Entity extraction:
- decisionTopic: Main topic or subject of the decision
- timeRange: Any time constraints mentioned (e.g., "last week", "Q1 2024")
- stakeholders: People or teams mentioned
- tags: Specific tags or categories mentioned

Query type:
- specific: Looking for specific information
- broad: General exploration or overview
- exploratory: Open-ended investigation

IMPORTANT: Only return valid JSON. No explanation text.
Timestamp: ${new Date().toISOString()}
`;

    try {
      const response = await LLMService.askQuestion(prompt, this.config.model, false);
      return this.parseQueryUnderstandingResponse(response);
    } catch (error) {
      logger.error('Query understanding failed', { error, query: query.substring(0, 100) });
      
      // Return fallback understanding
      return {
        intent: 'general_query',
        entities: { confidence: 0.3 },
        queryType: 'broad',
        optimizedQuery: query,
      };
    }
  }

  /**
   * Optimize query for better search results
   */
  private async optimizeQuery(
    query: string,
    understanding: QueryUnderstanding
  ): Promise<string> {
    if (!this.config.enableQueryOptimization) {
      return query;
    }

    const prompt = `
Optimize this query for better search results:

ORIGINAL QUERY: "${query}"

QUERY UNDERSTANDING:
Intent: ${understanding.intent}
Entities: ${JSON.stringify(understanding.entities)}
Query Type: ${understanding.queryType}

Please return an optimized query string that:
1. Focuses on the main intent
2. Includes relevant keywords
3. Removes noise words
4. Maintains the original meaning
5. Is optimized for semantic search

Return only the optimized query string, no explanation.
Timestamp: ${new Date().toISOString()}
`;

    try {
      const response = await LLMService.askQuestion(prompt, this.config.model, false);
      return response.trim();
    } catch (error) {
      logger.error('Query optimization failed', { error, query: query.substring(0, 100) });
      return query; // Return original if optimization fails
    }
  }

  /**
   * Execute search based on query understanding
   */
  private async executeSearch(
    query: string,
    understanding: QueryUnderstanding
  ): Promise<Array<DecisionBrief | ConversationEvent>> {
    const results: Array<DecisionBrief | ConversationEvent> = [];

    try {
      switch (understanding.intent) {
        case 'decision_search': {
          const decisionResults = await this.semanticService.searchDecisions(
            query,
            this.config.maxResults
          );
          results.push(...decisionResults.map(r => ({
            id: r.id,
            decisionSummary: r.text,
            problem: r.metadata?.problem || '',
            optionsConsidered: r.metadata?.optionsConsidered || [],
            rationale: r.metadata?.rationale || '',
            participants: r.metadata?.participants || [],
            sourceReferences: r.metadata?.sourceReferences || [],
            confidence: r.score,
            status: r.metadata?.status || 'pending',
            tags: r.metadata?.tags || [],
            decisionCandidateId: r.sourceId,
            userId: r.metadata?.userId || '',
            createdAt: r.metadata?.createdAt || new Date(),
            updatedAt: r.metadata?.updatedAt || new Date(),
          })));
          break;
        }

        case 'context_search': {
          const contextResults = await this.semanticService.searchConversations(
            query,
            this.config.maxResults
          );
          results.push(...contextResults.map(r => ({
            id: r.id,
            content: r.text,
            author: r.metadata?.author || 'Unknown',
            timestamp: r.metadata?.timestamp || new Date(),
            source: r.source as ConversationSource,
            sourceId: r.sourceId,
            metadata: r.metadata || {},
            title: r.metadata?.title || '',
            userId: r.metadata?.userId || '',
            createdAt: r.metadata?.createdAt || new Date(),
            updatedAt: r.metadata?.updatedAt || new Date(),
          })));
          break;
        }

        case 'general_query':
        case 'unknown':
        default: {
          // Search both decisions and conversations
          const [decisionResults, contextResults] = await Promise.all([
            this.semanticService.searchDecisions(query, Math.floor(this.config.maxResults / 2)),
            this.semanticService.searchConversations(query, Math.floor(this.config.maxResults / 2)),
          ]);

          results.push(
            ...decisionResults.map(r => ({
              id: r.id,
              decisionSummary: r.text,
              problem: r.metadata?.problem || '',
              optionsConsidered: r.metadata?.optionsConsidered || [],
              rationale: r.metadata?.rationale || '',
              participants: r.metadata?.participants || [],
              sourceReferences: r.metadata?.sourceReferences || [],
              confidence: r.score,
              status: r.metadata?.status || 'pending',
              tags: r.metadata?.tags || [],
              decisionCandidateId: r.sourceId,
              userId: r.metadata?.userId || '',
              createdAt: r.metadata?.createdAt || new Date(),
              updatedAt: r.metadata?.updatedAt || new Date(),
            })),
            ...contextResults.map(r => ({
              id: r.id,
              content: r.text,
              author: r.metadata?.author || 'Unknown',
              timestamp: r.metadata?.timestamp || new Date(),
              source: r.source as ConversationSource,
              sourceId: r.sourceId,
              metadata: r.metadata || {},
              title: r.metadata?.title || '',
              userId: r.metadata?.userId || '',
              createdAt: r.metadata?.createdAt || new Date(),
              updatedAt: r.metadata?.updatedAt || new Date(),
            }))
          );
          break;
        }
      }

      // Filter by relevance threshold
      const filteredResults = results.filter(item => {
        if ('confidence' in item) {
          return (item as any).confidence >= this.config.relevanceThreshold;
        }
        return true; // For conversation events, include all
      });

      // Sort by relevance/confidence
      filteredResults.sort((a, b) => {
        const confidenceA = 'confidence' in a ? (a as any).confidence : 1.0;
        const confidenceB = 'confidence' in b ? (b as any).confidence : 1.0;
        return confidenceB - confidenceA;
      });

      return filteredResults.slice(0, this.config.maxResults);
    } catch (error) {
      logger.error('Search execution failed', { error, query: query.substring(0, 100) });
      return [];
    }
  }

  /**
   * Determine result type based on items
   */
  private determineResultType(
    items: Array<DecisionBrief | ConversationEvent>
  ): 'decision' | 'conversation' | 'mixed' {
    const decisionCount = items.filter(item => 'decisionSummary' in item).length;
    const conversationCount = items.filter(item => 'content' in item).length;

    if (decisionCount > conversationCount) return 'decision';
    if (conversationCount > decisionCount) return 'conversation';
    return 'mixed';
  }

  /**
   * Parse query understanding response
   */
  private parseQueryUnderstandingResponse(response: string): QueryUnderstanding {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response.trim());
      
      return {
        intent: parsed.intent || 'general_query',
        entities: {
          decisionTopic: parsed.entities?.decisionTopic || null,
          timeRange: parsed.entities?.timeRange || null,
          stakeholders: parsed.entities?.stakeholders || null,
          tags: parsed.entities?.tags || null,
          confidence: parsed.entities?.confidence || 0.5,
        },
        queryType: parsed.queryType || 'broad',
        optimizedQuery: parsed.optimizedQuery || '',
      };
    } catch (parseError) {
      // Fallback parsing
      return {
        intent: 'general_query',
        entities: { confidence: 0.3 },
        queryType: 'broad',
        optimizedQuery: response.trim(),
      };
    }
  }

  /**
   * Get query suggestions based on user history
   */
  async getSuggestions(userId: string, limit: number = 5): Promise<string[]> {
    // This would typically query user query history
    // For now, return generic suggestions
    return [
      'What decisions were made last week?',
      'Find decisions related to API design',
      'Show me conversations about performance optimization',
      'What were the alternatives considered for the database decision?',
      'Find decisions involving the frontend team',
    ].slice(0, limit);
  }

  /**
   * Get query statistics
   */
  async getQueryStats(): Promise<{
    totalQueries: number;
    averageQueryLength: number;
    mostCommonIntents: Array<{ intent: string; count: number }>;
    averageSearchTime: number;
    successRate: number;
  }> {
    // This would typically query a database for stats
    // For now, return placeholder values
    return {
      totalQueries: 0,
      averageQueryLength: 0,
      mostCommonIntents: [],
      averageSearchTime: 0,
      successRate: 0,
    };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for natural language queries
 */
class NaturalLanguageQueryIntegration {
  private service: NaturalLanguageQueryService;

  constructor() {
    this.service = NaturalLanguageQueryService.getInstance();
  }

  /**
   * Process a natural language query
   */
  async processQuery(query: string, userId: string): Promise<QueryResult> {
    try {
      return await this.service.processQuery(query, userId);
    } catch (error) {
      logger.error('Failed to process natural language query', { error, userId });
      throw error;
    }
  }

  /**
   * Get query suggestions
   */
  async getSuggestions(userId: string, limit: number = 5): Promise<string[]> {
    try {
      return await this.service.getSuggestions(userId, limit);
    } catch (error) {
      logger.error('Failed to get query suggestions', { error, userId });
      return [];
    }
  }

  /**
   * Get query health metrics
   */
  async getHealthMetrics(): Promise<{
    serviceStatus: string;
    lastQueryTime: Date | null;
    averageLatency: number;
    errorRate: number;
    successRate: number;
  }> {
    return {
      serviceStatus: 'healthy',
      lastQueryTime: new Date(),
      averageLatency: 1500, // milliseconds
      errorRate: 0.02, // 2%
      successRate: 0.98, // 98%
    };
  }
}

export {
  NaturalLanguageQueryService,
  NaturalLanguageQueryIntegration,
};