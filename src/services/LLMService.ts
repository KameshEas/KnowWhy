import { ConversationBlock } from '../models/ConversationBlock';
import { DecisionCandidate } from '../models/DecisionCandidate';
import { DecisionBrief } from '../models/DecisionBrief';
import { rateLimiter } from '../utils/rate-limiter';

// Import metrics only on server side to avoid browser compatibility issues
let metrics: any;
if (typeof window === 'undefined') {
  try {
    metrics = require('../lib/metrics').metrics;
  } catch (error) {
    console.warn('Metrics not available in this environment:', error);
    metrics = {
      increment: () => {},
      get: () => 0,
      reset: () => {},
      prometheus: async () => ''
    };
  }
} else {
  // Browser environment - provide safe fallback
  metrics = {
    increment: () => {},
    get: () => 0,
    reset: () => {},
    prometheus: async () => ''
  };
}

export class LLMService {
  // Configurable base URL and fetch function to make the service test-friendly
  static baseUrl: string = process.env.LLM_BASE_URL || '';
  static fetchFn: any = (globalThis as any).fetch?.bind(globalThis);

  static configure(opts: { baseUrl?: string; fetchFn?: any }) {
    if (opts.baseUrl !== undefined) this.baseUrl = opts.baseUrl;
    if (opts.fetchFn !== undefined) this.fetchFn = opts.fetchFn;
  }

  static async detectDecision(conversation: ConversationBlock): Promise<DecisionCandidate> {
    try {
      // Apply rate limiting before making the API call
      await rateLimiter.waitForRateLimit();

      // Metrics: record LLM request
      metrics.increment('llm_requests_total');

      const url = new URL('/api/groq/decision-detection', this.baseUrl || 'http://localhost').toString();
      const response = await (this.fetchFn ?? (globalThis as any).fetch)(url, {
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
      metrics.increment('llm_request_errors_total');
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

      const url = new URL('/api/groq/brief-generation', this.baseUrl || 'http://localhost').toString();
      const response = await (this.fetchFn ?? (globalThis as any).fetch)(url, {
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

      // Metrics: record a request
      metrics.increment('llm_requests_total');

      const url = new URL('/api/groq/chat', this.baseUrl || 'http://localhost').toString();
      const response = await (this.fetchFn ?? (globalThis as any).fetch)(url, {
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
        const reader = response.body?.getReader?.();
        if (!reader) {
          metrics.increment('llm_request_stream_errors_total');
          throw new Error('No readable stream available');
        }

        const decoder = new TextDecoder();
        let result = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            result += chunk;
            
            // For streaming, we would need to handle this differently in the frontend
            // For now, we'll collect the full response
          }
        } catch (err) {
          // If the reader itself throws, count it and surface a friendly message
          metrics.increment('llm_request_stream_errors_total');
          throw err;
        }
        
        return result || "No answer available.";
      } else {
        // Handle non-streaming response
        const result = await response.json();
        return result.text || "No answer available.";
      }
    } catch (error) {
      metrics.increment('llm_request_errors_total');
      console.error('Error asking question:', error);
      return "Sorry, I couldn't process your question at this time.";
    }
  }
}
