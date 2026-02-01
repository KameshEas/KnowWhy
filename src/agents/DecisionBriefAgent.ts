import prisma from '../lib/db';
import { DecisionBriefService } from '../services/DecisionBriefService';

export class DecisionBriefAgent {
  /**
   * Generate and persist a decision brief for a given DecisionCandidate ID
   * Returns the created brief or an object with errors when validation fails
   */
  static async runForCandidate(decisionCandidateId: string, userId?: string) {
    // Load candidate and conversation
    const candidate = await prisma.decisionCandidate.findUnique({ where: { id: decisionCandidateId } });
    if (!candidate) throw new Error('DecisionCandidate not found');

    const conversation = await prisma.conversation.findUnique({ where: { id: candidate.conversationId } });
    if (!conversation) throw new Error('Conversation not found');

    // Map DB conversation to ConversationBlock shape expected by DecisionBriefService
    const conversationBlock = {
      id: conversation.id,
      source: conversation.source as any,
      author: conversation.author || 'unknown',
      timestamp: conversation.timestamp.toISOString(),
      text: conversation.content,
    };

    const generation = await DecisionBriefService.generateFromCandidate(candidate as any, [conversationBlock]);

    if (!generation.valid || !generation.brief) {
      return { success: false, errors: generation.errors, brief: generation.brief };
    }

    // Persist in a transaction
    const created = await prisma.$transaction(async (tx) => {
      const dbBrief = await tx.decisionBrief.create({
        data: {
          decisionSummary: generation.brief.title,
          problem: generation.brief.problem,
          optionsConsidered: generation.brief.optionsConsidered || [],
          rationale: generation.brief.rationale || '',
          participants: generation.brief.participants || [],
          sourceReferences: generation.brief.sourceReferences || [],
          confidence: typeof generation.brief.confidence === 'number' ? generation.brief.confidence : candidate.confidence,
          status: generation.brief.status || 'pending',
          tags: generation.brief.tags || [],
          decisionCandidateId: candidate.id,
          userId: userId || candidate.userId || 'system',
        },
      });

      // Optionally, update candidate or other records
      await tx.decisionCandidate.update({ where: { id: candidate.id }, data: { updatedAt: new Date() } as any });

      return dbBrief;
    });

    return { success: true, brief: created };
  }
}
