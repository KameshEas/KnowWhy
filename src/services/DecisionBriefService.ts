import { DecisionCandidate } from '../models/DecisionCandidate';
import { ConversationBlock } from '../models/ConversationBlock';
import { LLMService } from './LLMService';
import { validateDecisionBrief, DECISION_BRIEF_JSON_SCHEMA } from '../models/DecisionSchema';
import prisma from '../lib/db';

import { logger } from '../lib/logger';

export class DecisionBriefService {
  /**
   * Generate a Decision Brief from a DecisionCandidate and conversation context.
   * Returns the parsed brief and validation result.
   */
  static async generateFromCandidate(
    decision: DecisionCandidate,
    conversations: ConversationBlock[],
    model?: string
  ) {
    // Build a compact context to send to the LLM (top N messages)
    const contextSnippet = conversations
      .map((c) => `- [${c.timestamp}] ${c.author}: ${c.text}`)
      .slice(0, 10)
      .join('\n');

    const systemInstructions = `You are an assistant that produces a concise JSON Decision Brief.
The output MUST be valid JSON that conforms to the following JSON schema:
${JSON.stringify(DECISION_BRIEF_JSON_SCHEMA, null, 2)}

Return only a single JSON object that satisfies the schema. Keep values concise and factual.`;

    const prompt = `${systemInstructions}

Decision candidate summary:
${decision.summary}

Context (most relevant messages):
${contextSnippet}

Please provide the brief now.`;

    // Ask the LLM
    const raw = await LLMService.askQuestion(prompt, model, false);

    // We'll attempt up to 2 repairs if the model returns non-conforming output
    let parsed: any = null;
    let lastErrors: string[] = [];

    async function tryParseCandidateResponse(text: string) {
      try {
        const obj = JSON.parse(text);
        return obj;
      } catch (e) {
        return null;
      }
    }

    parsed = await tryParseCandidateResponse(raw);

    // If parsing failed or schema invalid, run up to 2 repair iterations with explicit schema and error guidance
    for (let attempt = 0; attempt < 2; attempt++) {
      if (parsed) {
        const { valid, errors } = validateDecisionBrief(parsed);
        if (valid) {
          // Ensure confidence is present and numeric
          parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : decision.confidence ?? 0;
          logger.info('DecisionBrief parsed and validated', { decisionId: decision.id, valid: true });
          return { brief: parsed, valid: true, errors: [] as string[] };
        } else {
          lastErrors = errors;
          // Ask model to fix the JSON to address these errors
          logger.audit('repair_attempt', { decisionId: decision.id, attempt: attempt + 1, errors });
          const repairPrompt = `The JSON you returned does not conform to the required schema. The errors are: ${JSON.stringify(errors)}. ` +
            `Please return only a single corrected JSON object that satisfies the schema. Do not include any commentary.` +
            `\n\nSchema: ${JSON.stringify(DECISION_BRIEF_JSON_SCHEMA, null, 2)}` +
            `\n\nOriginal JSON:\n${JSON.stringify(parsed, null, 2)}`;

          const repaired = await LLMService.askQuestion(repairPrompt, model, false);
          parsed = await tryParseCandidateResponse(repaired);
          if (parsed) {
            logger.audit('repair_response_received', { decisionId: decision.id, attempt: attempt + 1 });
          }
          continue;
        }
      } else {
        // Not JSON at all: ask to extract valid JSON
        logger.audit('repair_attempt_not_json', { decisionId: decision.id, attempt: attempt + 1, snippet: raw?.slice?.(0, 500) });
        const repairPrompt = `The previous output was not valid JSON. Extract and return only a valid JSON object that conforms to this schema and contains the decision brief.` +
          `\n\nSchema: ${JSON.stringify(DECISION_BRIEF_JSON_SCHEMA, null, 2)}` +
          `\n\nOriginal output:\n${raw}`;
        const repaired = await LLMService.askQuestion(repairPrompt, model, false);
        parsed = await tryParseCandidateResponse(repaired);
        if (parsed) {
          const { valid, errors } = validateDecisionBrief(parsed);
          if (valid) {
            parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : decision.confidence ?? 0;
            logger.info('DecisionBrief repaired from non-json and validated', { decisionId: decision.id, attempt: attempt + 1 });
            return { brief: parsed, valid: true, errors: [] as string[] };
          } else {
            lastErrors = errors;
            logger.warn('Repaired JSON still invalid', { decisionId: decision.id, attempt: attempt + 1, errors });
            continue;
          }
        } else {
          logger.warn('Repair attempt did not return valid JSON', { decisionId: decision.id, attempt: attempt + 1 });
        }
      }
    }

    // Last attempt exhausted — return failure with last observed errors
    return {
      brief: parsed,
      valid: false,
      errors: lastErrors.length > 0 ? lastErrors : ['Model did not return valid JSON or conformed object.'],
    };
  }

  /**
   * Persist a validated brief to the database via Prisma
   * Returns the created DecisionBrief record
   */
  static async saveBrief(
    brief: any,
    userId: string,
    decisionCandidateId?: string
  ) {
    // Map brief fields -> Prisma schema fields
    const dbRecord = await prisma.decisionBrief.create({
      data: {
        decisionSummary: brief.title,
        problem: brief.problem,
        optionsConsidered: brief.optionsConsidered || [],
        rationale: brief.rationale || '',
        participants: brief.participants || [],
        sourceReferences: brief.sourceReferences || [],
        confidence: typeof brief.confidence === 'number' ? brief.confidence : 0,
        status: brief.status || 'pending',
        tags: brief.tags || [],
        decisionCandidateId: decisionCandidateId || null,
        userId,
      },
    });

    return dbRecord;
  }
}
