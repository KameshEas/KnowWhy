/**
 * Unified Conversation Event Data Model
 * 
 * This model serves as the foundation for all conversation data ingestion,
 * providing a consistent structure for Slack messages, meeting transcripts,
 * Jira comments, and other conversation sources.
 */

import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ConversationEvent {
  id: string;
  title: string;
  content: string;
  source: ConversationSource;
  author: string;
  timestamp: Date;
  userId: string;
  
  // Source-specific identifiers for idempotency
  slackMessageId?: string;
  slackChannelId?: string;
  slackThreadId?: string;
  externalId?: string; // zoom/jira/etc id for idempotency
  
  // Metadata varies by source
  metadata: ConversationMetadata;
  
  // Relationships
  decisionCandidates?: DecisionCandidate[];
  decisionBrief?: DecisionBrief;
  
  createdAt: Date;
  updatedAt: Date;
}

export type ConversationSource = 
  | 'slack'
  | 'zoom'
  | 'google_meet'
  | 'jira'
  | 'upload'
  | 'manual';

export interface ConversationMetadata {
  // Slack-specific
  subtype?: string;
  reactions?: any[];
  reply_count?: number;
  edited?: any;
  files?: Array<{ id: string; name: string }>;
  
  // Meeting-specific
  meeting_id?: string;
  meeting_title?: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  confidence?: number;
  participants?: string[];
  duration?: number;
  
  // Jira-specific
  issue_key?: string;
  issue_type?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  
  // General
  [key: string]: any;
}

export interface DecisionCandidate {
  id: string;
  conversationId: string;
  isDecision: boolean;
  summary: string;
  confidence: number;
  agentVersion: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Relationships
  conversation?: ConversationEvent;
  decisionBrief?: DecisionBrief;
}

export interface DecisionBrief {
  id: string;
  decisionSummary: string;
  problem: string;
  optionsConsidered: string[];
  rationale: string;
  participants: string[];
  sourceReferences: SourceReference[];
  confidence: number;
  status: DecisionStatus;
  tags: string[];
  decisionCandidateId?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Relationships
  decisionCandidate?: DecisionCandidate;
  user?: any; // User model
}

export interface SourceReference {
  type: 'slack' | 'zoom' | 'jira' | 'upload';
  messageId?: string;
  timestamp?: Date;
  url?: string;
  channel?: string;
  meetingId?: string;
  issueKey?: string;
}

export type DecisionStatus = 'pending' | 'approved' | 'archived';

// ============================================================================
// VALIDATION
// ============================================================================

export class ConversationEventValidator {
  static validateSource(source: string): source is ConversationSource {
    const validSources: ConversationSource[] = ['slack', 'zoom', 'google_meet', 'jira', 'upload', 'manual'];
    return validSources.includes(source as ConversationSource);
  }

  static validateMetadata(source: ConversationSource, metadata: any): boolean {
    switch (source) {
      case 'slack':
        return this.validateSlackMetadata(metadata);
      case 'zoom':
      case 'google_meet':
        return this.validateMeetingMetadata(metadata);
      case 'jira':
        return this.validateJiraMetadata(metadata);
      default:
        return true; // Allow any metadata for other sources
    }
  }

  private static validateSlackMetadata(metadata: any): boolean {
    if (metadata.reactions && !Array.isArray(metadata.reactions)) return false;
    if (metadata.reply_count && typeof metadata.reply_count !== 'number') return false;
    if (metadata.files && !Array.isArray(metadata.files)) return false;
    return true;
  }

  private static validateMeetingMetadata(metadata: any): boolean {
    if (metadata.start_time && typeof metadata.start_time !== 'number') return false;
    if (metadata.end_time && typeof metadata.end_time !== 'number') return false;
    if (metadata.confidence && (typeof metadata.confidence !== 'number' || metadata.confidence < 0 || metadata.confidence > 1)) return false;
    if (metadata.participants && !Array.isArray(metadata.participants)) return false;
    if (metadata.duration && typeof metadata.duration !== 'number') return false;
    return true;
  }

  private static validateJiraMetadata(metadata: any): boolean {
    if (metadata.issue_key && typeof metadata.issue_key !== 'string') return false;
    if (metadata.status && typeof metadata.status !== 'string') return false;
    if (metadata.assignee && typeof metadata.assignee !== 'string') return false;
    return true;
  }
}

// ============================================================================
// NORMALIZATION
// ============================================================================

export class ConversationEventNormalizer {
  /**
   * Normalize any conversation source into a unified ConversationEvent
   */
  static normalizeFromSlack(slackMessage: any, channelId: string, userId: string): ConversationEvent {
    return {
      id: crypto.randomUUID(),
      title: this.extractTitle(slackMessage.text),
      content: this.normalizeSlackText(slackMessage),
      source: 'slack',
      author: slackMessage.user || slackMessage.username || 'unknown',
      timestamp: new Date(Math.floor(parseFloat(slackMessage.ts) * 1000)),
      userId,
      slackMessageId: slackMessage.ts,
      slackChannelId: channelId,
      slackThreadId: slackMessage.thread_ts || null,
      externalId: `${channelId}:${slackMessage.ts}`,
      metadata: {
        subtype: slackMessage.subtype || null,
        reactions: slackMessage.reactions || null,
        reply_count: slackMessage.reply_count || 0,
        edited: slackMessage.edited || null,
        files: slackMessage.files ? slackMessage.files.map((f: any) => ({ id: f.id, name: f.name })) : null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static normalizeFromZoomTranscript(
    segment: any, 
    meetingInfo: any, 
    userId: string
  ): ConversationEvent {
    return {
      id: crypto.randomUUID(),
      title: `${meetingInfo.title} - ${segment.speaker}`,
      content: segment.text,
      source: 'zoom',
      author: segment.speaker,
      timestamp: new Date(meetingInfo.startTime.getTime() + (segment.startTime * 1000)),
      userId,
      externalId: `${meetingInfo.id}:${segment.id}`,
      metadata: {
        meeting_id: meetingInfo.id,
        meeting_title: meetingInfo.title,
        speaker: segment.speaker,
        start_time: segment.startTime,
        end_time: segment.endTime,
        confidence: segment.confidence,
        participants: meetingInfo.participants || [],
        duration: meetingInfo.duration,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static normalizeFromJiraComment(
    comment: any, 
    issue: any, 
    userId: string
  ): ConversationEvent {
    return {
      id: crypto.randomUUID(),
      title: `Jira: ${issue.key} - Comment`,
      content: comment.body,
      source: 'jira',
      author: comment.author?.displayName || 'unknown',
      timestamp: new Date(comment.created),
      userId,
      externalId: `${issue.key}:${comment.id}`,
      metadata: {
        issue_key: issue.key,
        issue_type: issue.fields?.issuetype?.name,
        status: issue.fields?.status?.name,
        assignee: issue.fields?.assignee?.displayName,
        priority: issue.fields?.priority?.name,
        comment_id: comment.id,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static normalizeFromText(
    text: string, 
    source: ConversationSource, 
    author: string, 
    timestamp: Date, 
    userId: string,
    metadata: any = {}
  ): ConversationEvent {
    return {
      id: crypto.randomUUID(),
      title: this.extractTitle(text),
      content: text,
      source,
      author,
      timestamp,
      userId,
      externalId: crypto.randomUUID(),
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private static extractTitle(text: string): string {
    if (!text || text.length === 0) return '(no title)';
    
    const lines = text.split('\n').filter(line => line.trim());
    const firstLine = lines[0] || '';
    
    // Truncate to reasonable length
    return firstLine.length > 140 ? firstLine.substring(0, 140) + '...' : firstLine;
  }

  private static normalizeSlackText(message: any): string {
    // Slack messages may contain blocks; fallback to text
    if (message.blocks && message.blocks.length > 0) {
      try {
        const parts: string[] = [];
        for (const block of message.blocks) {
          if (block.type === 'section' && block.text?.text) parts.push(block.text.text);
          else if (block.type === 'rich_text' && block.elements) {
            const text = block.elements
              .map((element: any) => element.elements?.map((x: any) => x.text).join(''))
              .join('');
            if (text) parts.push(text);
          }
        }
        const joined = parts.join('\n').trim();
        if (joined.length > 0) return joined;
      } catch (err) {
        // ignore
      }
    }
    return message.text || '';
  }
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

export class ConversationEventStore {
  /**
   * Create or update a conversation event (idempotent)
   */
  static async upsert(event: ConversationEvent): Promise<ConversationEvent> {
    try {
      // Check if externalId exists for idempotency
      if (event.externalId) {
        const existing = await prisma.conversation.findFirst({
          where: {
            source: event.source,
            externalId: event.externalId,
          },
        });

        if (existing) {
          // Update if content changed
          const needsUpdate = existing.content !== event.content || 
                             JSON.stringify(existing.metadata) !== JSON.stringify(event.metadata);
          
          if (needsUpdate) {
            const updated = await prisma.conversation.update({
              where: { id: existing.id },
              data: {
                title: event.title,
                content: event.content,
                metadata: event.metadata,
                updatedAt: new Date(),
              },
            });
            return this.mapToConversationEvent(updated);
          }
          
          return this.mapToConversationEvent(existing);
        }
      }

      // Create new conversation
      const created = await prisma.conversation.create({
        data: {
          title: event.title,
          content: event.content,
          source: event.source,
          author: event.author,
          timestamp: event.timestamp,
          userId: event.userId,
          slackMessageId: event.slackMessageId,
          slackChannelId: event.slackChannelId,
          slackThreadId: event.slackThreadId,
          externalId: event.externalId,
          metadata: event.metadata,
        },
      });

      return this.mapToConversationEvent(created);
    } catch (error) {
      console.error('Error upserting conversation event:', error);
      throw error;
    }
  }

  /**
   * Find conversation events by source and external ID
   */
  static async findBySourceAndExternalId(
    source: ConversationSource, 
    externalId: string
  ): Promise<ConversationEvent | null> {
    const found = await prisma.conversation.findFirst({
      where: {
        source,
        externalId,
      },
    });

    return found ? this.mapToConversationEvent(found) : null;
  }

  /**
   * Find conversation events by user
   */
  static async findByUser(userId: string, limit: number = 100): Promise<ConversationEvent[]> {
    const found = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return found.map(this.mapToConversationEvent);
  }

  /**
   * Find conversation events by time range
   */
  static async findByTimeRange(
    startTime: Date, 
    endTime: Date, 
    userId?: string
  ): Promise<ConversationEvent[]> {
    const found = await prisma.conversation.findMany({
      where: {
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
        ...(userId && { userId }),
      },
      orderBy: { timestamp: 'desc' },
    });

    return found.map(this.mapToConversationEvent);
  }

  /**
   * Find conversation events by source
   */
  static async findBySource(source: ConversationSource, userId?: string): Promise<ConversationEvent[]> {
    const found = await prisma.conversation.findMany({
      where: {
        source,
        ...(userId && { userId }),
      },
      orderBy: { timestamp: 'desc' },
    });

    return found.map(this.mapToConversationEvent);
  }

  /**
   * Delete conversation events by source and time range (for retention)
   */
  static async deleteBySourceAndTimeRange(
    source: ConversationSource, 
    beforeDate: Date
  ): Promise<number> {
    const result = await prisma.conversation.deleteMany({
      where: {
        source,
        timestamp: {
          lt: beforeDate,
        },
      },
    });

    return result.count;
  }

  /**
   * Map Prisma model to ConversationEvent interface
   */
  private static mapToConversationEvent(dbModel: any): ConversationEvent {
    return {
      id: dbModel.id,
      title: dbModel.title,
      content: dbModel.content,
      source: dbModel.source as ConversationSource,
      author: dbModel.author,
      timestamp: dbModel.timestamp,
      userId: dbModel.userId,
      slackMessageId: dbModel.slackMessageId,
      slackChannelId: dbModel.slackChannelId,
      slackThreadId: dbModel.slackThreadId,
      externalId: dbModel.externalId,
      metadata: dbModel.metadata,
      createdAt: dbModel.createdAt,
      updatedAt: dbModel.updatedAt,
    };
  }
}

// ============================================================================
// RETENTION POLICIES
// ============================================================================

export class ConversationEventRetention {
  /**
   * Apply retention policy for a specific source
   */
  static async applyRetentionPolicy(
    source: ConversationSource, 
    retentionDays: number
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deletedCount = await ConversationEventStore.deleteBySourceAndTimeRange(source, cutoffDate);
    
    console.log(`Applied retention policy for ${source}: deleted ${deletedCount} events older than ${retentionDays} days`);
    
    return deletedCount;
  }

  /**
   * Apply retention policies for all sources
   */
  static async applyAllRetentionPolicies(): Promise<Record<ConversationSource, number>> {
    const policies: Record<ConversationSource, number> = {
      slack: 365,      // Keep Slack for 1 year
      zoom: 730,       // Keep Zoom transcripts for 2 years
      google_meet: 730,
      jira: 1095,      // Keep Jira for 3 years
      upload: 365,
      manual: 365,
    };

    const results: Record<ConversationSource, number> = {} as any;

    for (const [source, days] of Object.entries(policies)) {
      results[source as ConversationSource] = await this.applyRetentionPolicy(source as ConversationSource, days);
    }

    return results;
  }
}

// Export classes are already exported individually above
