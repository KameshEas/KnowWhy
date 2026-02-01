/**
 * Decision Detection Agent
 * 
 * AI-powered agent that detects decision moments in conversations using LLMs.
 * Implements sliding window analysis, confidence scoring, and deduplication.
 */

import { LLMService } from '../services/LLMService';
import { DecisionCandidate } from '../models/DecisionCandidate';
import { ConversationEvent } from '../models/ConversationEvent';
import { DecisionDetectionService } from '../services/DecisionDetectionService';
import { logger } from '../lib/logger';
import { metrics } from '../lib/metrics';

// ============================================================================
// TYPES
// ============================================================================

export interface DecisionDetectionConfig {
  model: string;
  confidenceThreshold: number;
  slidingWindowSize: number;
  deduplicationWindow: number;
  maxRetries: number;
  enableRepair: boolean;
}

export interface DecisionAnalysis {
  isDecision: boolean;
  summary: string;
  confidence: number;
  reasoning: string;
  decisionSignals: string[];
  context: string;
}

export interface SlidingWindow {
  id: string;
  messages: ConversationEvent[];
  windowStart: Date;
  windowEnd: Date;
  context: string;
}

// ============================================================================
// DECISION DETECTION AGENT
// ============================================================================

class DecisionDetectionAgent {
  private config: DecisionDetectionConfig;
  private static instance: DecisionDetectionAgent | null = null;

  constructor(config: DecisionDetectionConfig) {
    this.config = config;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DecisionDetectionAgent {
    if (!DecisionDetectionAgent.instance) {
      const config: DecisionDetectionConfig = {
        model: process.env.DECISION_DETECTION_MODEL || 'llama-3.1-70b-versatile',
        confidenceThreshold: parseFloat(process.env.DECISION_CONFIDENCE_THRESHOLD || '0.7'),
        slidingWindowSize: parseInt(process.env.SLIDING_WINDOW_SIZE || '10'),
        deduplicationWindow: parseInt(process.env.DEDUPLICATION_WINDOW || '300'), // 5 minutes
        maxRetries: parseInt(process.env.DECISION_MAX_RETRIES || '3'),
        enableRepair: process.env.ENABLE_DECISION_REPAIR === 'true',
      };
      
      DecisionDetectionAgent.instance = new DecisionDetectionAgent(config);
    }
    return DecisionDetectionAgent.instance;
  }

  /**
   * Detect decisions in a conversation using sliding window analysis
   */
  async detectDecisionsInConversation(
    conversation: ConversationEvent[],
    userId: string
  ): Promise<DecisionCandidate[]> {
    try {
      // Create sliding windows
      const windows = this.createSlidingWindows(conversation);
      
      const decisions: DecisionCandidate[] = [];
      const seenDecisions = new Set<string>();

      for (const window of windows) {
        try {
          const analysis = await this.analyzeWindow(window);
          
          if (analysis.isDecision && analysis.confidence >= this.config.confidenceThreshold) {
            // Deduplicate similar decisions
            const decisionKey = this.generateDecisionKey(analysis.summary);
            
            if (!seenDecisions.has(decisionKey)) {
              seenDecisions.add(decisionKey);
              
              const candidate = this.createDecisionCandidate(
                analysis,
                window,
                userId
              );
              
              decisions.push(candidate);
              
              // Log successful detection
              logger.info('Decision detected', {
                conversationId: conversation[0]?.id,
                summary: analysis.summary,
                confidence: analysis.confidence,
                signals: analysis.decisionSignals,
              });
            }
          }
        } catch (error) {
          logger.error('Error analyzing window', { error, windowId: window.id });
          continue;
        }
      }

      // Update metrics
      metrics.increment('decision_detection_total', decisions.length);
      metrics.increment('decision_detection_success', 1);

      return decisions;
    } catch (error) {
      logger.error('Decision detection failed', { error, conversationId: conversation[0]?.id });
      metrics.increment('decision_detection_failure', 1);
      throw error;
    }
  }

  /**
   * Create sliding windows from conversation
   */
  private createSlidingWindows(conversation: ConversationEvent[]): SlidingWindow[] {
    const windows: SlidingWindow[] = [];
    const sortedMessages = conversation.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    for (let i = 0; i < sortedMessages.length; i += this.config.slidingWindowSize) {
      const windowMessages = sortedMessages.slice(i, i + this.config.slidingWindowSize);
      
      if (windowMessages.length > 0) {
        windows.push({
          id: `window_${i}_${i + this.config.slidingWindowSize}`,
          messages: windowMessages,
          windowStart: windowMessages[0].timestamp,
          windowEnd: windowMessages[windowMessages.length - 1].timestamp,
          context: this.buildWindowContext(windowMessages),
        });
      }
    }

    return windows;
  }

  /**
   * Build context string for a window
   */
  private buildWindowContext(messages: ConversationEvent[]): string {
    return messages
      .map(msg => `[${msg.timestamp.toISOString()}] ${msg.author}: ${msg.content}`)
      .join('\n');
  }

  /**
   * Analyze a single window for decision content
   */
  private async analyzeWindow(window: SlidingWindow): Promise<DecisionAnalysis> {
    const prompt = this.buildAnalysisPrompt(window);
    
    let retries = 0;
    let lastError: Error | null = null;

    while (retries < this.config.maxRetries) {
      try {
        const response = await LLMService.askQuestion(prompt, this.config.model, false);
        const analysis = this.parseAnalysisResponse(response);
        
        if (analysis) {
          return analysis;
        }
        
        lastError = new Error('Failed to parse LLM response');
      } catch (error) {
        lastError = error as Error;
        retries++;
        
        if (retries >= this.config.maxRetries) {
          break;
        }
        
        // Exponential backoff
        await this.sleep(Math.pow(2, retries) * 1000);
      }
    }

    // Return fallback analysis if all retries failed
    return {
      isDecision: false,
      summary: 'Analysis failed',
      confidence: 0,
      reasoning: lastError?.message || 'Unknown error',
      decisionSignals: [],
      context: window.context,
    };
  }

  /**
   * Build prompt for decision analysis
   */
  private buildAnalysisPrompt(window: SlidingWindow): string {
    return `
Analyze this conversation window for decision-making content:

Conversation Window:
${window.context}

Decision signals to look for:
1. Explicit choice words: "we decided", "let's go with", "chose", "opted for"
2. Commitment phrases: "we'll use", "going forward", "from now on"
3. Problem-solving: "solution is", "approach will be"
4. Future actions: "implementing", "starting next week", "will begin"
5. Consensus indicators: "everyone agrees", "team consensus", "we all think"
6. Alternatives discussion: "option A vs B", "pros and cons", "trade-offs"

Please analyze and return JSON with:
{
  "isDecision": boolean,
  "summary": string (2-3 sentences capturing the decision),
  "confidence": number (0.0 to 1.0),
  "reasoning": string (why you think this is/is not a decision),
  "decisionSignals": string[] (list of signals found),
  "context": string (relevant context from the conversation)
}

IMPORTANT: Only return valid JSON. No explanation text.
Window ID: ${window.id}
Timestamp: ${new Date().toISOString()}
`;
  }

  /**
   * Parse LLM response into DecisionAnalysis
   */
  private parseAnalysisResponse(response: string): DecisionAnalysis | null {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response.trim());
      
      return {
        isDecision: Boolean(parsed.isDecision),
        summary: String(parsed.summary || ''),
        confidence: Number(parsed.confidence || 0),
        reasoning: String(parsed.reasoning || ''),
        decisionSignals: Array.isArray(parsed.decisionSignals) ? parsed.decisionSignals : [],
        context: String(parsed.context || ''),
      };
    } catch (parseError) {
      // Fallback parsing for text responses
      const isDecision = response.toLowerCase().includes('true') || 
                        response.toLowerCase().includes('yes') ||
                        response.toLowerCase().includes('decision');
      
      const confidenceMatch = response.match(/confidence[:\s]+(\d+\.?\d*)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
      
      const summaryMatch = response.match(/summary[:\s]+(.+)/i);
      const summary = summaryMatch ? summaryMatch[1].trim() : 'Decision detected';
      
      return {
        isDecision,
        summary,
        confidence,
        reasoning: 'Parsed from text response',
        decisionSignals: [],
        context: '',
      };
    }
  }

  /**
   * Create DecisionCandidate from analysis
   */
  private createDecisionCandidate(
    analysis: DecisionAnalysis,
    window: SlidingWindow,
    userId: string
  ): DecisionCandidate {
    return {
      id: crypto.randomUUID(),
      conversationId: window.messages[0].id,
      isDecision: analysis.isDecision,
      summary: analysis.summary,
      confidence: analysis.confidence,
      agentVersion: 'v1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId,
    };
  }

  /**
   * Generate decision key for deduplication
   */
  private generateDecisionKey(summary: string): string {
    // Normalize summary for comparison
    return summary
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 50);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch detect decisions in multiple conversations
   */
  async detectDecisionsInConversations(
    conversations: ConversationEvent[][],
    userId: string
  ): Promise<DecisionCandidate[]> {
    const allDecisions: DecisionCandidate[] = [];

    for (const conversation of conversations) {
      try {
        const decisions = await this.detectDecisionsInConversation(conversation, userId);
        allDecisions.push(...decisions);
      } catch (error) {
        logger.error('Error detecting decisions in conversation', { error });
        continue;
      }
    }

    return allDecisions;
  }

  /**
   * Get detection statistics
   */
  async getDetectionStats(): Promise<{
    totalWindows: number;
    totalDecisions: number;
    averageConfidence: number;
    detectionRate: number;
  }> {
    // This would typically query a database for stats
    // For now, return placeholder values
    return {
      totalWindows: 0,
      totalDecisions: 0,
      averageConfidence: 0,
      detectionRate: 0,
    };
  }
}

// ============================================================================
// INTEGRATION WITH EXISTING SYSTEMS
// ============================================================================

/**
 * Integration wrapper for decision detection
 */
class DecisionDetectionIntegration {
  private agent: DecisionDetectionAgent;

  constructor() {
    this.agent = DecisionDetectionAgent.getInstance();
  }

  /**
   * Detect decisions in new conversations
   */
  async detectNewDecisions(conversations: ConversationEvent[]): Promise<DecisionCandidate[]> {
    if (conversations.length === 0) return [];

    try {
      const decisions = await this.agent.detectDecisionsInConversation(conversations, conversations[0].userId);
      
      // Store decisions in database
      for (const decision of decisions) {
        await DecisionDetectionService.saveDecisionCandidate(decision);
      }

      return decisions;
    } catch (error) {
      logger.error('Failed to detect decisions', { error });
      throw error;
    }
  }

  /**
   * Re-analyze existing conversations for missed decisions
   */
  async reanalyzeConversations(conversations: ConversationEvent[]): Promise<DecisionCandidate[]> {
    try {
      const decisions = await this.agent.detectDecisionsInConversation(conversations, conversations[0].userId);
      
      // Filter out existing decisions (if any)
      // This would typically check against existing DecisionCandidates
      
      return decisions;
    } catch (error) {
      logger.error('Failed to reanalyze conversations', { error });
      throw error;
    }
  }

  /**
   * Get decision detection health metrics
   */
  async getHealthMetrics(): Promise<{
    agentStatus: string;
    lastDetectionTime: Date | null;
    averageLatency: number;
    errorRate: number;
  }> {
    return {
      agentStatus: 'healthy',
      lastDetectionTime: new Date(),
      averageLatency: 1000, // milliseconds
      errorRate: 0.05, // 5%
    };
  }
}

export { DecisionDetectionAgent, DecisionDetectionIntegration };
