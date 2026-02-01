import { ConversationBlock } from '@/models/ConversationBlock';
import { DecisionCandidate } from '@/models/DecisionCandidate';
import { DecisionBrief } from '@/models/DecisionBrief';

const CONVERSATIONS_KEY = 'knowwhy_conversations';
const DECISIONS_KEY = 'knowwhy_decisions';
const BRIEFS_KEY = 'knowwhy_briefs';

export class StorageService {
  static saveConversations(conversations: ConversationBlock[]): void {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  }

  static getConversations(): ConversationBlock[] {
    const data = localStorage.getItem(CONVERSATIONS_KEY);
    return data ? JSON.parse(data) : [];
  }

  static saveDecisionCandidates(decisions: DecisionCandidate[]): void {
    localStorage.setItem(DECISIONS_KEY, JSON.stringify(decisions));
  }

  static getDecisionCandidates(): DecisionCandidate[] {
    const data = localStorage.getItem(DECISIONS_KEY);
    return data ? JSON.parse(data) : [];
  }

  static saveDecisionBriefs(briefs: DecisionBrief[]): void {
    localStorage.setItem(BRIEFS_KEY, JSON.stringify(briefs));
  }

  static getDecisionBriefs(): DecisionBrief[] {
    const data = localStorage.getItem(BRIEFS_KEY);
    return data ? JSON.parse(data) : [];
  }
}
