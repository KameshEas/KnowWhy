export interface ConversationBlock {
  id: string;
  source: "slack" | "meeting";
  author: string;
  timestamp: string;
  text: string;
}