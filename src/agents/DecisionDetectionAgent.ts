import { PrismaClient } from '@prisma/client';
import { DecisionDetectionService } from '@/services/DecisionDetectionService';
import { DecisionCandidate as DCModel } from '@/models/DecisionCandidate';

const prisma = new PrismaClient();

const SYSTEM_USER_EMAIL = 'system@knowwhy.internal';

async function ensureSystemUserId(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } });
  if (existing) return existing.id;

  const created = await prisma.user.create({
    data: {
      email: SYSTEM_USER_EMAIL,
      name: 'System',
      password: Math.random().toString(36).slice(2, 10),
    },
  });
  return created.id;
}

export class DecisionDetectionAgent {
  /**
   * Run detection on unprocessed Slack conversations.
   * - Finds conversations without any DecisionCandidate
   * - Calls DecisionDetectionService to classify messages
   * - Persists DecisionCandidate rows for positive detections
   */
  static async runDetection({ limit = 200 } = {}) {
    console.log(`DecisionDetectionAgent: scanning for up to ${limit} unprocessed Slack messages...`);

    const systemUserId = await ensureSystemUserId();

    // Fetch conversations from Slack that have no linked decision candidate yet
    const conversations = await prisma.conversation.findMany({
      where: {
        source: 'slack',
        decisions: { none: {} },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    if (!conversations || conversations.length === 0) {
      console.log('No unprocessed conversations found.');
      return { scanned: 0, created: 0 };
    }

    // Map to ConversationBlock expected by DecisionDetectionService
    const conversationBlocks = conversations.map((c) => ({
      id: c.id,
      source: 'slack',
      author: c.author || 'unknown',
      timestamp: c.timestamp.toISOString(),
      text: c.content,
    }));

    // Detect decisions
    const detections = await DecisionDetectionService.detectDecisions(conversationBlocks as any);

    let createdCount = 0;

    for (const d of detections) {
      try {
        // Only persist if model says it's a decision
        if (!d.isDecision) continue;

        // Skip if we already have a DecisionCandidate for this conversation (race-safety)
        const existing = await prisma.decisionCandidate.findFirst({ where: { conversationId: d.conversationId } });
        if (existing) continue;

        // Create DB record
        await prisma.decisionCandidate.create({
          data: {
            id: d.id,
            conversationId: d.conversationId,
            isDecision: d.isDecision,
            summary: d.summary,
            confidence: d.confidence,
            agentVersion: d.agentVersion || 'v1-groq',
            userId: systemUserId,
          },
        });

        createdCount++;
      } catch (err) {
        console.error('Failed to persist decision candidate:', err);
      }
    }

    console.log(`DecisionDetectionAgent: scanned ${conversations.length}, created ${createdCount} candidates.`);

    return { scanned: conversations.length, created: createdCount };
  }

  /**
   * Run detection on a given list of conversation IDs (explicit)
   */
  static async runOnConversationIds(conversationIds: string[]) {
    const convs = await prisma.conversation.findMany({ where: { id: { in: conversationIds } } });
    if (convs.length === 0) return { scanned: 0, created: 0 };

    const conversationBlocks = convs.map((c) => ({
      id: c.id,
      source: 'slack',
      author: c.author || 'unknown',
      timestamp: c.timestamp.toISOString(),
      text: c.content,
    }));

    const detections = await DecisionDetectionService.detectDecisions(conversationBlocks as any);

    let createdCount = 0;
    const systemUserId = await ensureSystemUserId();

    for (const d of detections) {
      if (!d.isDecision) continue;
      const existing = await prisma.decisionCandidate.findFirst({ where: { conversationId: d.conversationId } });
      if (existing) continue;

      try {
        await prisma.decisionCandidate.create({
          data: {
            id: d.id,
            conversationId: d.conversationId,
            isDecision: d.isDecision,
            summary: d.summary,
            confidence: d.confidence,
            agentVersion: d.agentVersion || 'v1-groq',
            userId: systemUserId,
          },
        });
        createdCount++;
      } catch (err) {
        console.error('Failed to persist decision candidate:', err);
      }
    }

    return { scanned: convs.length, created: createdCount };
  }
}

export default DecisionDetectionAgent;
