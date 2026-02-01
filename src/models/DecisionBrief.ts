export interface DecisionBrief {
  id: string;
  decisionSummary: string;
  problem: string;
  optionsConsidered: string[];
  rationale: string;
  participants: string[];
  sourceReferences: { conversationId: string; text: string }[];
  confidence: number;
  status: 'pending' | 'approved' | 'archived';
  tags: string[];
  decisionCandidateId?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}
