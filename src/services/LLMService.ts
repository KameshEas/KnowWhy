import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionBrief } from '@/models/DecisionBrief';
import { rateLimiter } from '@/utils/rate-limiter';

export class LLMService {
  static async detectDecision(conversation: ConversationBlock): Promise<DecisionCandidate> {
    try {
      // Apply rate limiting before making the API call
      await rateLimiter.waitForRateLimit();

      const response = await fetch('/api/groq/decision-detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ conversation }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        isDecision: result.isDecision || false,
        summary: result.summary || '',
        confidence: result.confidence || 0,
      };
    } catch (error) {
      console.error('Error detecting decision:', error);
      return {
        id: crypto.randomUUID(),
        conversationId: conversation.id,
        isDecision: false,
        summary: '',
        confidence: 0,
      };
    }
  }

  static async generateBrief(decision: DecisionCandidate, conversations: ConversationBlock[]): Promise<DecisionBrief> {
    const conversation = conversations.find(c => c.id === decision.conversationId);
    if (!conversation) throw new Error('Conversation not found');

    try {
      // Apply rate limiting before making the API call
      await rateLimiter.waitForRateLimit();

      const response = await fetch('/api/groq/brief-generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision, conversation }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        id: crypto.randomUUID(),
        decisionSummary: result.decisionSummary || decision.summary,
        problem: result.problem || '',
        optionsConsidered: result.optionsConsidered || [],
        rationale: result.rationale || '',
        participants: result.participants || [conversation.author],
        sourceReferences: result.sourceReferences || [{ conversationId: conversation.id, text: conversation.text }],
      };
    } catch (error) {
      console.error('Error generating brief:', error);
      return {
        id: crypto.randomUUID(),
        decisionSummary: decision.summary,
        problem: '',
        optionsConsidered: [],
        rationale: '',
        participants: [conversation.author],
        sourceReferences: [{ conversationId: conversation.id, text: conversation.text }],
      };
    }
  }

  static async askQuestion(prompt: string, model?: string, stream: boolean = false): Promise<string> {
    try {
      // Apply rate limiting before making the API call
      await rateLimiter.waitForRateLimit();

      const response = await fetch('/api/groq/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          model,
          temperature: 0.1,
          maxTokens: 512,
          stream
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (stream) {
        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No readable stream available');
        }

        const decoder = new TextDecoder();
        let result = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          result += chunk;
          
          // For streaming, we would need to handle this differently in the frontend
          // For now, we'll collect the full response
        }
        
        return result || "No answer available.";
      } else {
        // Handle non-streaming response
        const result = await response.json();
        return result.text || "No answer available.";
      }
    } catch (error) {
      console.error('Error asking question:', error);
      return "Sorry, I couldn't process your question at this time.";
    }
  }
}
