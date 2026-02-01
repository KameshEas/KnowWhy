import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionBrief } from '@/models/DecisionBrief';
import { ConversationBlock } from '@/models/ConversationBlock';
import { LLMService } from './LLMService';

export class DecisionContextService {
  /**
   * Generates a comprehensive decision brief from a decision candidate
   */
  static async generateDecisionBrief(
    decision: DecisionCandidate, 
    conversations: ConversationBlock[]
  ): Promise<DecisionBrief> {
    const conversation = conversations.find(c => c.id === decision.conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${decision.conversationId} not found`);
    }

    const prompt = this.buildContextReconstructionPrompt(decision, conversation);
    const response = await LLMService.generateBrief(decision, [conversation]);
    
    return this.parseDecisionBrief(response, decision);
  }

  /**
   * Builds the prompt for decision context reconstruction
   */
  private static buildContextReconstructionPrompt(
    decision: DecisionCandidate, 
    conversation: ConversationBlock
  ): string {
    return `
Reconstruct the context and rationale for this decision:

Decision Summary: ${decision.summary}
Confidence: ${decision.confidence}

Conversation Context:
- Author: ${conversation.author}
- Source: ${conversation.source}
- Timestamp: ${conversation.timestamp}
- Message: "${conversation.text}"

Please generate a comprehensive decision brief with the following structure:

{
  "decisionSummary": "Clear, concise summary of the decision made",
  "problem": "What problem was being solved or addressed",
  "optionsConsidered": ["List", "of", "options", "that", "were", "considered"],
  "rationale": "Detailed explanation of why this decision was made",
  "participants": ["List", "of", "people", "involved", "in", "the", "decision"],
  "sourceReferences": [
    {
      "text": "Exact quote or reference from the conversation",
      "source": "Conversation ID or source identifier"
    }
  ]
}

IMPORTANT: 
1. Only use information from the provided conversation
2. Always cite specific quotes or references
3. Return only JSON, no explanation text
4. Make the rationale detailed and actionable
`;
  }

  /**
   * Parses the AI response into a DecisionBrief
   */
  private static parseDecisionBrief(response: string, decision: DecisionCandidate): DecisionBrief {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response.trim());
      
      return {
        id: crypto.randomUUID(),
        decisionSummary: parsed.decisionSummary || decision.summary,
        problem: parsed.problem || 'Problem context not specified',
        optionsConsidered: parsed.optionsConsidered || [],
        rationale: parsed.rationale || 'Rationale not provided',
        participants: parsed.participants || [],
        sourceReferences: parsed.sourceReferences || []
      };
    } catch (parseError) {
      // Fallback parsing for text responses
      console.warn('Failed to parse decision brief JSON, using fallback:', parseError);
      
      return {
        id: crypto.randomUUID(),
        decisionSummary: decision.summary,
        problem: 'Problem context not specified',
        optionsConsidered: [],
        rationale: 'Rationale not provided',
        participants: [],
        sourceReferences: []
      };
    }
  }

  /**
   * Extracts participants from conversation context
   */
  static extractParticipants(conversation: ConversationBlock): string[] {
    // Simple participant extraction - in a real app, this would be more sophisticated
    const participants = new Set<string>();
    participants.add(conversation.author);
    
    // Look for mentions of other people in the message
    const mentionRegex = /@(\w+)/g;
    let match;
    while ((match = mentionRegex.exec(conversation.text)) !== null) {
      participants.add(match[1]);
    }
    
    return Array.from(participants);
  }

  /**
   * Extracts options considered from conversation
   */
  static extractOptionsConsidered(conversation: ConversationBlock): string[] {
    const options: string[] = [];
    
    // Look for option patterns in the conversation
    const optionPatterns = [
      /we could (use|try|go with|choose) ([^.!?]+)/gi,
      /alternatives? are (.+)/gi,
      /options? include (.+)/gi,
      /considering (.*?)(?:or|and|but)/gi
    ];

    for (const pattern of optionPatterns) {
      const matches = conversation.text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Clean up the match
          const cleaned = match
            .replace(/we could /i, '')
            .replace(/alternatives? are /i, '')
            .replace(/options? include /i, '')
            .replace(/considering /i, '')
            .replace(/[.!?,]/g, '')
            .trim();
          
          if (cleaned && cleaned.length > 2) {
            options.push(cleaned);
          }
        });
      }
    }

    return [...new Set(options)]; // Remove duplicates
  }

  /**
   * Validates a decision brief for completeness
   */
  static validateDecisionBrief(brief: DecisionBrief): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    if (!brief.decisionSummary || brief.decisionSummary.length < 10) {
      issues.push('Decision summary is too short or missing');
    }
    
    if (!brief.problem || brief.problem.length < 10) {
      issues.push('Problem description is too short or missing');
    }
    
    if (!brief.rationale || brief.rationale.length < 20) {
      issues.push('Rationale is too short or missing');
    }
    
    if (brief.optionsConsidered.length === 0) {
      issues.push('No options considered were identified');
    }
    
    if (brief.sourceReferences.length === 0) {
      issues.push('No source references provided');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Enhances a decision brief with additional context
   */
  static async enhanceDecisionBrief(
    brief: DecisionBrief, 
    conversation: ConversationBlock
  ): Promise<DecisionBrief> {
    // Add extracted participants if not already present
    const participants = this.extractParticipants(conversation);
    const enhancedParticipants = [...new Set([...brief.participants, ...participants])];

    // Add extracted options if not already present
    const options = this.extractOptionsConsidered(conversation);
    const enhancedOptions = [...new Set([...brief.optionsConsidered, ...options])];

    // Add source reference if not present
    const hasSourceRef = brief.sourceReferences.some(ref => 
      ref.text.includes(conversation.text.substring(0, 50))
    );

    const enhancedReferences = [...brief.sourceReferences];
    if (!hasSourceRef) {
      enhancedReferences.push({
        conversationId: conversation.id,
        text: conversation.text
      });
    }

    return {
      ...brief,
      participants: enhancedParticipants,
      optionsConsidered: enhancedOptions,
      sourceReferences: enhancedReferences
    };
  }
}