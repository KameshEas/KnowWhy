import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionBrief } from '@/models/DecisionBrief';
import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionContextService } from '@/services/DecisionContextService';
import { StorageService } from '@/services/StorageService';

export class DecisionBriefViewModel {
  /**
   * Generates decision briefs from decision candidates
   */
  static async generateBriefs(decisions: DecisionCandidate[], conversations: ConversationBlock[]): Promise<DecisionBrief[]> {
    const promises = decisions.map(dec => DecisionContextService.generateDecisionBrief(dec, conversations));
    const briefs = await Promise.all(promises);
    
    // Save to storage
    StorageService.saveDecisionBriefs(briefs);
    
    return briefs;
  }

  /**
   * Generates a single decision brief
   */
  static async generateBrief(decision: DecisionCandidate, conversations: ConversationBlock[]): Promise<DecisionBrief> {
    const brief = await DecisionContextService.generateDecisionBrief(decision, conversations);
    
    // Save to storage
    StorageService.saveDecisionBriefs([brief]);
    
    return brief;
  }

  /**
   * Validates a decision brief
   */
  static validateBrief(brief: DecisionBrief): { isValid: boolean; issues: string[] } {
    return DecisionContextService.validateDecisionBrief(brief);
  }

  /**
   * Enhances a decision brief with additional context
   */
  static async enhanceBrief(brief: DecisionBrief, conversation: ConversationBlock): Promise<DecisionBrief> {
    return DecisionContextService.enhanceDecisionBrief(brief, conversation);
  }

  /**
   * Saves decision briefs to storage
   */
  static saveDecisionBriefs(briefs: DecisionBrief[]): void {
    StorageService.saveDecisionBriefs(briefs);
  }

  /**
   * Gets decision briefs from storage
   */
  static getDecisionBriefs(): DecisionBrief[] {
    return StorageService.getDecisionBriefs();
  }
}
