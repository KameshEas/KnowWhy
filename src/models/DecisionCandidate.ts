export interface DecisionCandidate {
  id: string;
  conversationId: string;
  isDecision: boolean;
  summary: string;
  confidence: number;
}