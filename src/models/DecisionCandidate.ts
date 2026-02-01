export interface DecisionCandidate {
  id: string;
  conversationId: string;
  userId?: string;
  isDecision: boolean;
  summary: string;
  confidence: number;
  agentVersion?: string;
  createdAt?: string;
  updatedAt?: string;
}