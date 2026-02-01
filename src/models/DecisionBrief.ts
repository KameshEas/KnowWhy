export interface DecisionBrief {
  id: string;
  decisionSummary: string;
  problem: string;
  optionsConsidered: string[];
  rationale: string;
  participants: string[];
  sourceReferences: { conversationId: string; text: string }[];
}