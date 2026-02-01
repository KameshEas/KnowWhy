import React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface DecisionCardProps {
  decision: {
    id: string;
    summary: string;
    confidence: number;
    timestamp: string;
    context: string;
  };
  onAskQuestion: (question: string) => void;
  onViewBrief: (decisionId: string) => void;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({
  decision,
  onAskQuestion,
  onViewBrief
}) => {
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'danger';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {decision.summary}
            </h3>
            <p className="text-gray-600 text-sm mb-3 line-clamp-3">
              {decision.context}
            </p>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <Badge 
              variant={getConfidenceColor(decision.confidence)}
              size="sm"
            >
              Confidence: {Math.round(decision.confidence * 100)}%
            </Badge>
            <span className="text-xs text-gray-500">
              {formatDate(decision.timestamp)}
            </span>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onViewBrief(decision.id)}
            aria-label={`View brief for ${decision.summary}`}
          >
            View Brief
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAskQuestion(`Tell me more about: ${decision.summary}`)}
            aria-label={`Ask question about ${decision.summary}`}
          >
            Ask Question
          </Button>
        </div>
      </div>
    </div>
  );
};