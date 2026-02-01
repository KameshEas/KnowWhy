/**
 * Chat Interface Component
 * 
 * Provides the "Ask KnowWhy" chat interface for natural language queries.
 * Integrates with the Natural Language Query Service and Advanced Retrieval Service.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NaturalLanguageQueryService } from '../services/NaturalLanguageQueryService';
import { AdvancedRetrievalService } from '../services/AdvancedRetrievalService';
import { FeedbackService } from '../services/FeedbackService';
import { QueryResult } from '../services/NaturalLanguageQueryService';
import { RetrievalResult } from '../services/AdvancedRetrievalService';
import { Feedback } from '../services/FeedbackService';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    queryUnderstanding?: any;
    searchMetadata?: any;
    citations?: any[];
    feedbackGiven?: boolean;
    feedbackRating?: 1 | 2 | 3 | 4 | 5;
  };
}

interface ChatInterfaceProps {
  userId: string;
  className?: string;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  userId,
  className = ''
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load initial suggestions
  useEffect(() => {
    loadSuggestions();
  }, [userId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadSuggestions = async () => {
    try {
      const suggestionsService = NaturalLanguageQueryService.getInstance();
      const suggestionsResult = await suggestionsService.getSuggestions(userId, 5);
      setSuggestions(suggestionsResult);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      setSuggestions([
        'What decisions were made last week?',
        'Find decisions related to API design',
        'Show me conversations about performance optimization',
        'What were the alternatives considered for the database decision?',
        'Find decisions involving the frontend team'
      ]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (query: string) => {
    if (!query.trim()) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: query,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      // Process query with Natural Language Query Service
      const queryService = NaturalLanguageQueryService.getInstance();
      const queryResult = await queryService.processQuery(query, userId);

      // If we have decision briefs, use Advanced Retrieval Service for better answers
      let retrievalResult: RetrievalResult | null = null;
      if (queryResult.items.length > 0) {
        const retrievalService = AdvancedRetrievalService.getInstance();
        retrievalResult = await retrievalService.retrieve(query, userId);
      }

      // Generate assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        type: 'assistant',
        content: generateResponseContent(queryResult, retrievalResult),
        timestamp: new Date(),
        metadata: {
          queryUnderstanding: queryResult.queryUnderstanding,
          searchMetadata: queryResult.searchMetadata,
          citations: retrievalResult?.citations || []
        }
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Failed to process query:', error);
      
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        content: 'I apologize, but I encountered an error while processing your query. Please try again.',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const generateResponseContent = (
    queryResult: QueryResult,
    retrievalResult: RetrievalResult | null
  ): string => {
    if (queryResult.total === 0) {
      return "I couldn't find any decisions or conversations related to your query. Try being more specific or use different keywords.";
    }

    const itemCount = queryResult.total;
    const resultType = queryResult.type;
    
    let response = `I found ${itemCount} ${resultType === 'decision' ? 'decision' : resultType === 'conversation' ? 'conversation' : 'item'}(s) related to your query.`;

    if (retrievalResult && retrievalResult.answer) {
      response += `\n\n${retrievalResult.answer}`;
    } else {
      // Generate a summary based on the items found
      const items = queryResult.items.slice(0, 3);
      response += '\n\nHere are the most relevant items I found:';
      
      items.forEach((item, index) => {
        if ('decisionSummary' in item) {
          response += `\n\n${index + 1}. **Decision**: ${item.decisionSummary}`;
          if (item.problem) {
            response += `\n   **Problem**: ${item.problem}`;
          }
          if (item.participants.length > 0) {
            response += `\n   **Participants**: ${item.participants.join(', ')}`;
          }
        } else {
          response += `\n\n${index + 1}. **Conversation**: ${item.content.substring(0, 100)}...`;
          if (item.author) {
            response += `\n   **Author**: ${item.author}`;
          }
        }
      });

      if (queryResult.total > 3) {
        response += `\n\n... and ${queryResult.total - 3} more items.`;
      }
    }

    return response;
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  const handleFeedback = async (messageId: string, rating: 1 | 2 | 3 | 4 | 5) => {
    try {
      // This would integrate with the FeedbackService
      console.log(`Feedback for message ${messageId}: ${rating}`);
      
      // Update message with feedback indicator
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, metadata: { ...msg.metadata, feedbackGiven: true, feedbackRating: rating } }
          : msg
      ));
    } catch (error) {
      console.error('Failed to submit feedback:', error);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`flex flex-col h-full bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-gray-900">Ask KnowWhy</h3>
            <span className="text-sm text-gray-500">AI-Powered Decision Search</span>
          </div>
          <div className="text-xs text-gray-400">
            {messages.length} messages
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md xl:max-w-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'system'
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-gray-50 text-gray-900'
              } rounded-lg p-3 shadow-sm`}
            >
              <div className="text-sm whitespace-pre-wrap">{message.content}</div>
              <div className="text-xs opacity-75 mt-1 text-right">
                {formatTime(message.timestamp)}
              </div>
              
              {/* Citations */}
              {message.metadata?.citations && message.metadata.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-600 font-medium mb-1">Sources:</div>
                  {message.metadata.citations.slice(0, 3).map((citation, index) => (
                    <div key={index} className="text-xs text-gray-500 mb-1">
                      [{index + 1}] {citation.title} ({citation.type})
                    </div>
                  ))}
                  {message.metadata.citations.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{message.metadata.citations.length - 3} more sources
                    </div>
                  )}
                </div>
              )}

              {/* Feedback */}
              {message.type === 'assistant' && !message.metadata?.feedbackGiven && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-600 font-medium mb-1">Was this helpful?</div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleFeedback(message.id, 5)}
                      className="text-green-600 hover:text-green-800 text-xs"
                    >
                      👍 Yes
                    </button>
                    <button
                      onClick={() => handleFeedback(message.id, 1)}
                      className="text-red-600 hover:text-red-800 text-xs"
                    >
                      👎 No
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback Confirmation */}
              {message.metadata?.feedbackGiven && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <div className="text-xs text-gray-500">
                    Feedback submitted {message.metadata.feedbackRating === 5 ? '👍' : '👎'}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start" role="status" aria-live="polite">
            <div className="bg-gray-50 rounded-lg p-3 shadow-sm">
              <div className="flex space-x-2" aria-hidden="true">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <div className="text-xs text-gray-500 mt-1">Searching decisions...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-600 mb-2">Try asking:</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            aria-label="Ask a question about decisions"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
            placeholder="Ask about decisions, context, or anything else..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isTyping}
          />
          <button
            onClick={() => handleSendMessage(inputValue)}
            aria-label="Send question"
            disabled={!inputValue.trim() || isTyping}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        <div className="text-xs text-gray-500 mt-2 text-center">
          Tip: Be specific about timeframes, people, or topics for better results
        </div>
      </div>
    </div>
  );
};