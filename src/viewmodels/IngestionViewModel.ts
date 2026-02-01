import { ConversationBlock } from '@/models/ConversationBlock';
import { StorageService } from '@/services/StorageService';

export class IngestionViewModel {
  static parseSlack(json: any): ConversationBlock[] {
    if (!Array.isArray(json)) return [];
    return json.map((msg: any) => ({
      id: crypto.randomUUID(),
      source: "slack" as const,
      author: msg.user || msg.author || "Unknown",
      timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      text: msg.text || "",
    }));
  }

  static parseTranscript(text: string): ConversationBlock[] {
    const lines = text.split('\n').filter(line => line.trim());
    const conversations: ConversationBlock[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const author = trimmed.substring(0, colonIndex).trim();
        const message = trimmed.substring(colonIndex + 1).trim();
        if (author && message) {
          conversations.push({
            id: crypto.randomUUID(),
            source: "meeting" as const,
            author,
            timestamp: new Date().toISOString(),
            text: message,
          });
        }
      } else {
        // No colon found, treat as message from "Unknown"
        conversations.push({
          id: crypto.randomUUID(),
          source: "meeting" as const,
          author: "Unknown",
          timestamp: new Date().toISOString(),
          text: trimmed,
        });
      }
    }
    return conversations;
  }

  static saveConversations(conversations: ConversationBlock[]): void {
    StorageService.saveConversations(conversations);
  }

  static getConversations(): ConversationBlock[] {
    return StorageService.getConversations();
  }
}