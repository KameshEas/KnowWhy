/**
 * Semantic Indexing Service
 * 
 * Provides semantic search capabilities using vector embeddings.
 * Supports multiple embedding models and integrates with vector databases.
 */

import { OpenAI } from 'openai';
import { Groq } from 'groq-sdk';
import crypto from 'crypto';

// Import Prisma Client with error handling - only on server side
let prisma: any;

if (typeof window === 'undefined') {
  try {
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  } catch (error) {
    console.error('Failed to initialize Prisma client:', error);
    
    // Create a mock Prisma client for development/testing
    prisma = {
      vectorEmbedding: {
        create: () => Promise.resolve({ id: '1', text: 'test', embedding: [], source: 'test', sourceId: 'test' }),
        createMany: () => Promise.resolve({ count: 1 }),
        findMany: () => Promise.resolve([]),
        findUnique: () => Promise.resolve(null),
        deleteMany: () => Promise.resolve({ count: 0 }),
        groupBy: () => Promise.resolve([]),
        aggregate: () => Promise.resolve({ _avg: { embedding: 0 } }),
      },
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
    };
  }
} else {
  // Browser environment - use mock client
  prisma = {
    vectorEmbedding: {
      create: () => Promise.resolve({ id: '1', text: 'test', embedding: [], source: 'test', sourceId: 'test' }),
      createMany: () => Promise.resolve({ count: 1 }),
      findMany: () => Promise.resolve([]),
      findUnique: () => Promise.resolve(null),
      deleteMany: () => Promise.resolve({ count: 0 }),
      groupBy: () => Promise.resolve([]),
      aggregate: () => Promise.resolve({ _avg: { embedding: 0 } }),
    },
    $connect: () => Promise.resolve(),
    $disconnect: () => Promise.resolve(),
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface EmbeddingModel {
  name: string;
  dimensions: number;
  provider: 'openai' | 'groq' | 'custom';
  apiKey?: string;
}

export interface VectorEmbedding {
  id: string;
  text: string;
  embedding: number[];
  source: string;
  sourceId: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface SearchQuery {
  query: string;
  topK?: number;
  filter?: Record<string, any>;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  text: string;
  source: string;
  sourceId: string;
  score: number;
  metadata: Record<string, any>;
}

export interface IndexingConfig {
  model: EmbeddingModel;
  batchSize: number;
  chunkSize: number;
  overlap: number;
  autoIndex: boolean;
}

// ============================================================================
// EMBEDDING PROVIDERS
// ============================================================================

class OpenAIEmbeddingProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error getting OpenAI embedding:', error);
      throw error;
    }
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('Error getting OpenAI embeddings:', error);
      throw error;
    }
  }
}

class GroqEmbeddingProvider {
  private client: Groq;

  constructor(apiKey: string) {
    this.client = new Groq({ apiKey });
  }

  async getEmbedding(text: string): Promise<number[]> {
    try {
      // Note: Groq doesn't have native embedding API, using OpenAI-compatible endpoint
      // This is a placeholder - in production you'd use a dedicated embedding service
      throw new Error('Groq embedding provider not implemented yet');
    } catch (error) {
      console.error('Error getting Groq embedding:', error);
      throw error;
    }
  }
}

// ============================================================================
// TEXT CHUNKING
// ============================================================================

class TextChunker {
  private chunkSize: number;
  private overlap: number;

  constructor(chunkSize: number = 1000, overlap: number = 100) {
    this.chunkSize = chunkSize;
    this.overlap = overlap;
  }

  /**
   * Split text into overlapping chunks
   */
  chunkText(text: string): string[] {
    if (!text || text.length === 0) return [];

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + this.chunkSize, text.length);
      const chunk = text.substring(startIndex, endIndex);
      
      chunks.push(chunk);
      
      // Move to next chunk with overlap
      startIndex = endIndex - this.overlap;
      
      // Ensure we don't get stuck in infinite loop
      if (startIndex >= text.length) break;
    }

    return chunks;
  }

  /**
   * Chunk conversation with context preservation
   */
  chunkConversation(conversation: any): string[] {
    const chunks: string[] = [];
    
    // Create a structured representation of the conversation
    const conversationText = this.formatConversation(conversation);
    
    // Split into chunks
    const textChunks = this.chunkText(conversationText);
    
    // Add metadata to each chunk
    return textChunks.map((chunk, index) => 
      `Conversation Chunk ${index + 1}/${textChunks.length}\n\n${chunk}`
    );
  }

  private formatConversation(conversation: any): string {
    return `
Conversation ID: ${conversation.id}
Source: ${conversation.source}
Author: ${conversation.author}
Timestamp: ${conversation.timestamp}
Title: ${conversation.title}

Content:
${conversation.content}

Metadata:
${JSON.stringify(conversation.metadata, null, 2)}
    `.trim();
  }
}

// ============================================================================
// VECTOR STORAGE
// ============================================================================

class VectorStorage {
  /**
   * Store vector embeddings in database
   */
  static async storeEmbedding(embedding: Omit<VectorEmbedding, 'id' | 'createdAt'>): Promise<VectorEmbedding> {
    try {
      const record = await prisma.vectorEmbedding.create({
        data: {
          text: embedding.text,
          embedding: embedding.embedding,
          source: embedding.source,
          sourceId: embedding.sourceId,
          metadata: embedding.metadata,
        },
      });

      return {
        id: record.id,
        text: record.text,
        embedding: record.embedding,
        source: record.source,
        sourceId: record.sourceId,
        metadata: record.metadata,
        createdAt: record.createdAt,
      };
    } catch (error) {
      console.error('Error storing vector embedding:', error);
      throw error;
    }
  }

  /**
   * Store multiple embeddings efficiently
   */
  static async storeEmbeddings(embeddings: Omit<VectorEmbedding, 'id' | 'createdAt'>[]): Promise<VectorEmbedding[]> {
    try {
      const records = await prisma.vectorEmbedding.createMany({
        data: embeddings.map(e => ({
          text: e.text,
          embedding: e.embedding,
          source: e.source,
          sourceId: e.sourceId,
          metadata: e.metadata,
        })),
      });

      // Return the created embeddings (without actual data since createMany doesn't return records)
      return embeddings.map((e, index) => ({
        id: crypto.randomUUID(),
        text: e.text,
        embedding: e.embedding,
        source: e.source,
        sourceId: e.sourceId,
        metadata: e.metadata,
        createdAt: new Date(),
      }));
    } catch (error) {
      console.error('Error storing multiple embeddings:', error);
      throw error;
    }
  }

  /**
   * Find similar embeddings using cosine similarity
   */
  static async findSimilar(
    queryEmbedding: number[],
    topK: number = 10,
    filter?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      // Note: This is a simplified implementation
      // In production, you'd use a vector database like Pinecone, Weaviate, or PostgreSQL with pgvector
      
      const whereClause: any = {};
      if (filter) {
        Object.keys(filter).forEach(key => {
          whereClause[`metadata->>'${key}'`] = filter[key];
        });
      }

      const records = await prisma.vectorEmbedding.findMany({
        where: whereClause,
        take: topK * 10, // Get more records for similarity calculation
      });

      // Calculate cosine similarity
      const results = records.map(record => {
        const similarity = this.cosineSimilarity(queryEmbedding, record.embedding);
        return {
          id: record.id,
          text: record.text,
          source: record.source,
          sourceId: record.sourceId,
          score: similarity,
          metadata: record.metadata,
        };
      });

      // Sort by similarity and return top K
      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .filter(result => result.score > 0.1); // Minimum similarity threshold

    } catch (error) {
      console.error('Error finding similar embeddings:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private static cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Get embedding by ID
   */
  static async getEmbedding(id: string): Promise<VectorEmbedding | null> {
    try {
      const record = await prisma.vectorEmbedding.findUnique({
        where: { id },
      });

      if (!record) return null;

      return {
        id: record.id,
        text: record.text,
        embedding: record.embedding,
        source: record.source,
        sourceId: record.sourceId,
        metadata: record.metadata,
        createdAt: record.createdAt,
      };
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }

  /**
   * Delete embeddings by source
   */
  static async deleteBySource(source: string, sourceId?: string): Promise<number> {
    try {
      const whereClause: any = { source };
      if (sourceId) {
        whereClause.sourceId = sourceId;
      }

      const result = await prisma.vectorEmbedding.deleteMany({
        where: whereClause,
      });

      return result.count;
    } catch (error) {
      console.error('Error deleting embeddings by source:', error);
      throw error;
    }
  }
}

// ============================================================================
// SEMANTIC INDEXING SERVICE
// ============================================================================

class SemanticIndexingService {
  private config: IndexingConfig;
  private chunker: TextChunker;
  private embeddingProvider: OpenAIEmbeddingProvider | GroqEmbeddingProvider;

  constructor(config: IndexingConfig) {
    this.config = config;
    this.chunker = new TextChunker(config.chunkSize, config.overlap);

    switch (config.model.provider) {
      case 'openai':
        this.embeddingProvider = new OpenAIEmbeddingProvider(config.model.apiKey || '');
        break;
      case 'groq':
        this.embeddingProvider = new GroqEmbeddingProvider(config.model.apiKey || '');
        break;
      default:
        throw new Error(`Unsupported embedding provider: ${config.model.provider}`);
    }
  }

  /**
   * Index a single conversation
   */
  async indexConversation(conversation: any): Promise<void> {
    try {
      // Chunk the conversation
      const chunks = this.chunker.chunkConversation(conversation);

      // Generate embeddings for chunks
      const embeddings = await this.embeddingProvider.getEmbeddings(chunks);

      // Store embeddings
      const embeddingRecords = chunks.map((chunk, index) => ({
        text: chunk,
        embedding: embeddings[index],
        source: 'conversation',
        sourceId: conversation.id,
        metadata: {
          conversationId: conversation.id,
          source: conversation.source,
          author: conversation.author,
          timestamp: conversation.timestamp,
          chunkIndex: index,
          totalChunks: chunks.length,
        },
      }));

      await VectorStorage.storeEmbeddings(embeddingRecords);
      console.log(`Indexed conversation ${conversation.id} with ${chunks.length} chunks`);

    } catch (error) {
      console.error(`Error indexing conversation ${conversation.id}:`, error);
      throw error;
    }
  }

  /**
   * Index multiple conversations
   */
  async indexConversations(conversations: any[]): Promise<void> {
    for (const conversation of conversations) {
      await this.indexConversation(conversation);
    }
  }

  /**
   * Index decision brief
   */
  async indexDecisionBrief(brief: any): Promise<void> {
    try {
      const text = `
Decision Brief: ${brief.decisionSummary}
Problem: ${brief.problem}
Options Considered: ${brief.optionsConsidered.join(', ')}
Rationale: ${brief.rationale}
Participants: ${brief.participants.join(', ')}
      `.trim();

      const embedding = await this.embeddingProvider.getEmbedding(text);

      await VectorStorage.storeEmbedding({
        text,
        embedding,
        source: 'decision_brief',
        sourceId: brief.id,
        metadata: {
          briefId: brief.id,
          decisionSummary: brief.decisionSummary,
          problem: brief.problem,
          participants: brief.participants,
          confidence: brief.confidence,
          status: brief.status,
        },
      });

      console.log(`Indexed decision brief ${brief.id}`);

    } catch (error) {
      console.error(`Error indexing decision brief ${brief.id}:`, error);
      throw error;
    }
  }

  /**
   * Search for similar content
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingProvider.getEmbedding(query.query);

      // Find similar embeddings
      const results = await VectorStorage.findSimilar(
        queryEmbedding,
        query.topK || 10,
        query.filter
      );

      // Apply minimum score filter
      const minScore = query.minScore || 0.1;
      return results.filter(result => result.score >= minScore);

    } catch (error) {
      console.error('Error searching embeddings:', error);
      throw error;
    }
  }

  /**
   * Search for decision-related content
   */
  async searchDecisions(query: string, topK: number = 10): Promise<SearchResult[]> {
    return this.search({
      query: `Decision context: ${query}`,
      topK,
      filter: { source: 'decision_brief' },
      minScore: 0.2,
    });
  }

  /**
   * Search for conversation context
   */
  async searchConversations(query: string, topK: number = 10): Promise<SearchResult[]> {
    return this.search({
      query,
      topK,
      filter: { source: 'conversation' },
      minScore: 0.1,
    });
  }

  /**
   * Get conversation context for a decision
   */
  async getDecisionContext(decisionId: string, topK: number = 5): Promise<SearchResult[]> {
    return this.search({
      query: `Context for decision ${decisionId}`,
      topK,
      filter: { source: 'conversation' },
      minScore: 0.15,
    });
  }

  /**
   * Update embeddings for a conversation (re-index)
   */
  async updateConversationIndex(conversationId: string, conversation: any): Promise<void> {
    try {
      // Delete existing embeddings
      await VectorStorage.deleteBySource('conversation', conversationId);

      // Re-index
      await this.indexConversation(conversation);

      console.log(`Updated index for conversation ${conversationId}`);

    } catch (error) {
      console.error(`Error updating index for conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Delete embeddings for a conversation
   */
  async deleteConversationIndex(conversationId: string): Promise<void> {
    try {
      await VectorStorage.deleteBySource('conversation', conversationId);
      console.log(`Deleted index for conversation ${conversationId}`);
    } catch (error) {
      console.error(`Error deleting index for conversation ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Get indexing statistics
   */
  async getStats(): Promise<{
    totalEmbeddings: number;
    sources: Array<{ source: string; count: number }>;
    avgEmbeddingSize: number;
  }> {
    try {
      const totalEmbeddings = await prisma.vectorEmbedding.count();

      const sources = await prisma.vectorEmbedding.groupBy({
        by: ['source'],
        _count: { _all: true },
      });

      const avgSizeResult = await prisma.vectorEmbedding.aggregate({
        _avg: {
          embedding: true,
        },
      });

      return {
        totalEmbeddings,
        sources: sources.map(s => ({ source: s.source, count: s._count._all })),
        avgEmbeddingSize: avgSizeResult._avg.embedding || 0,
      };
    } catch (error) {
      console.error('Error getting indexing stats:', error);
      throw error;
    }
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for semantic indexing
 */
class SemanticIndexingIntegration {
  private service: SemanticIndexingService;

  constructor() {
    const config: IndexingConfig = {
      model: {
        name: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
        dimensions: 1536,
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
      },
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '10'),
      chunkSize: parseInt(process.env.EMBEDDING_CHUNK_SIZE || '1000'),
      overlap: parseInt(process.env.EMBEDDING_OVERLAP || '100'),
      autoIndex: process.env.AUTO_INDEX === 'true',
    };

    this.service = new SemanticIndexingService(config);
  }

  /**
   * Index conversation when it's created
   */
  async indexConversation(conversation: any): Promise<void> {
    if (process.env.AUTO_INDEX === 'true') {
      await this.service.indexConversation(conversation);
    }
  }

  /**
   * Index decision brief when it's created
   */
  async indexDecisionBrief(brief: any): Promise<void> {
    if (process.env.AUTO_INDEX === 'true') {
      await this.service.indexDecisionBrief(brief);
    }
  }

  /**
   * Search for relevant context
   */
  async searchContext(query: string, topK: number = 10): Promise<SearchResult[]> {
    return this.service.searchConversations(query, topK);
  }

  /**
   * Search for similar decisions
   */
  async searchSimilarDecisions(query: string, topK: number = 5): Promise<SearchResult[]> {
    return this.service.searchDecisions(query, topK);
  }

  /**
   * Get decision context
   */
  async getDecisionContext(decisionId: string, topK: number = 5): Promise<SearchResult[]> {
    return this.service.getDecisionContext(decisionId, topK);
  }
}

export {
  OpenAIEmbeddingProvider,
  GroqEmbeddingProvider,
  TextChunker,
  VectorStorage,
  SemanticIndexingService,
  SemanticIndexingIntegration,
};
