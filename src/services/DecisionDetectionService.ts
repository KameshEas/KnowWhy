import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionCandidate } from '@/models/DecisionCandidate';
import { LLMService } from './LLMService';

export class DecisionDetectionService {
  /**
   * Detects decisions in conversation blocks using AI
   */
  static async detectDecisions(conversations: ConversationBlock[]): Promise<DecisionCandidate[]> {
    const decisions: DecisionCandidate[] = [];
    
    for (const conversation of conversations) {
      try {
        const decision = await this.detectDecisionInBlock(conversation);
        if (decision) {
          decisions.push(decision);
        }
      } catch (error) {
        console.error(`Failed to detect decision in conversation ${conversation.id}:`, error);
      }
    }
    
    return decisions;
  }

  /**
   * Detects a single decision in a conversation block
   */
  private static async detectDecisionInBlock(conversation: ConversationBlock): Promise<DecisionCandidate | null> {
    const prompt = this.buildDecisionDetectionPrompt(conversation);
    
    try {
      const response = await LLMService.askQuestion(prompt);
      
      // Parse the response
      const result = this.parseDecisionResponse(response, conversation.id);
      
      // Filter by confidence threshold (0.7 = 70%)
      if (result.confidence >= 0.7) {
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('Decision detection failed:', error);
      return null;
    }
  }

  /**
   * Builds the prompt for decision detection
   */
  private static buildDecisionDetectionPrompt(conversation: ConversationBlock): string {
    return `
Analyze this conversation message and determine if it contains a decision.

Conversation:
- Author: ${conversation.author}
- Source: ${conversation.source}
- Timestamp: ${conversation.timestamp}
- Message: "${conversation.text}"

Decision signals to look for:
- Explicit choice words: "we decided", "let's go with", "chose", "opted for"
- Commitment phrases: "we'll use", "going forward", "from now on"
- Problem-solving: "solution is", "approach will be"
- Future actions: "implementing", "starting next week"

Return JSON with:
{
  "isDecision": boolean,
  "summary": string (2-3 sentences),
  "confidence": number (0.0 to 1.0)
}

IMPORTANT: Only return JSON, no explanation text.
`;
  }

  /**
   * Parses the AI response into a DecisionCandidate
   */
  private static parseDecisionResponse(response: string, conversationId: string): DecisionCandidate {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response.trim());
      
      return {
        id: crypto.randomUUID(),
        conversationId,
        isDecision: parsed.isDecision || false,
        summary: parsed.summary || 'Decision detected',
        confidence: parsed.confidence || 0.5
      };
    } catch (parseError) {
      // Fallback parsing for text responses
      const isDecision = response.toLowerCase().includes('true') || 
                        response.toLowerCase().includes('yes');
      
      // Extract confidence if mentioned
      const confidenceMatch = response.match(/confidence[:\s]+(\d+\.?\d*)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
      
      return {
        id: crypto.randomUUID(),
        conversationId,
        isDecision,
        summary: 'Decision detected in conversation',
        confidence
      };
    }
  }

  /**
   * Filters decisions by confidence threshold
   */
  static filterByConfidence(decisions: DecisionCandidate[], threshold: number = 0.7): DecisionCandidate[] {
    return decisions.filter(d => d.confidence >= threshold);
  }

  /**
   * Gets high-confidence decisions only
   */
  static getHighConfidenceDecisions(decisions: DecisionCandidate[]): DecisionCandidate[] {
    return this.filterByConfidence(decisions, 0.8);
  }

  /**
   * Gets medium-confidence decisions
   */
  static getMediumConfidenceDecisions(decisions: DecisionCandidate[]): DecisionCandidate[] {
    return decisions.filter(d => d.confidence >= 0.6 && d.confidence < 0.8);
  }
}