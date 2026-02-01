import React from 'react';
import { Badge } from './ui/badge';

interface ConversationListProps {
  conversations: Array<{
    id: string;
    text: string;
    author: string;
    timestamp: string;
  }>;
  selectedConversation: string | null;
  onConversationSelect: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedConversation,
  onConversationSelect
}) => {
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          onClick={() => onConversationSelect(conversation.id)}
          className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
            selectedConversation === conversation.id
              ? 'border-blue-300 bg-blue-50 shadow-md'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-blue-600">
                  {conversation.author.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{conversation.author}</h4>
                <p className="text-xs text-gray-500">{formatDate(conversation.timestamp)}</p>
              </div>
            </div>
            <Badge variant="default" size="sm">
              {conversation.text.length} chars
            </Badge>
          </div>
          <p className="text-gray-700 text-sm line-clamp-2">
            {conversation.text}
          </p>
        </div>
      ))}
    </div>
  );
};