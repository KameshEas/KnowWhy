import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionDetectionService } from '@/services/DecisionDetectionService';
import { StorageService } from '@/services/StorageService';

export class DecisionDetectionViewModel {
  /**
   * Detects decisions in conversations using AI
   */
  static async detectDecisions(conversations: ConversationBlock[]): Promise<DecisionCandidate[]> {
    const decisions = await DecisionDetectionService.detectDecisions(conversations);
    
    // Save decisions to storage
    StorageService.saveDecisionCandidates(decisions);
    
    return decisions;
  }

  /**
   * Loads decisions from storage
   */
  static async loadDecisions(): Promise<DecisionCandidate[]> {
    return StorageService.getDecisionCandidates();
  }

  /**
   * Gets decision candidates from storage
   */
  static getDecisionCandidates(): DecisionCandidate[] {
    return StorageService.getDecisionCandidates();
  }

  /**
   * Gets high-confidence decisions only
   */
  static getHighConfidenceDecisions(): DecisionCandidate[] {
    return DecisionDetectionService.getHighConfidenceDecisions(
      StorageService.getDecisionCandidates()
    );
  }

  /**
   * Gets medium-confidence decisions
   */
  static getMediumConfidenceDecisions(): DecisionCandidate[] {
    return DecisionDetectionService.getMediumConfidenceDecisions(
      StorageService.getDecisionCandidates()
    );
  }
}
