import React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface BriefCardProps {
  brief: {
    id: string;
    decisionSummary: string;
    problem: string;
    optionsConsidered: string[];
    rationale: string;
    participants: string[];
    timestamp: string;
  };
  onAskQuestion: (question: string) => void;
}

export const BriefCard: React.FC<BriefCardProps> = ({
  brief,
  onAskQuestion
}) => {
  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Decision Brief
            </h3>
            <p className="text-gray-600 text-sm mb-3">
              {brief.decisionSummary}
            </p>
          </div>
          <div className="flex flex-col items-end space-y-2">
            <Badge variant="info" size="sm">
              Generated
            </Badge>
            <span className="text-xs text-gray-500">
              {formatDate(brief.timestamp)}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {brief.problem && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Problem</h4>
              <p className="text-gray-600 text-sm">{brief.problem}</p>
            </div>
          )}

          {brief.optionsConsidered.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Options Considered</h4>
              <div className="space-y-1">
                {brief.optionsConsidered.map((option, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    <span className="text-gray-600 text-sm">{option}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {brief.rationale && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Rationale</h4>
              <p className="text-gray-600 text-sm">{brief.rationale}</p>
            </div>
          )}

          {brief.participants.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Participants</h4>
              <div className="flex flex-wrap gap-2">
                {brief.participants.map((participant, index) => (
                  <Badge key={index} variant="default" size="sm">
                    {participant}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex space-x-3">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onAskQuestion(`Explain the rationale behind this decision: ${brief.decisionSummary}`)}
          >
            Ask Question
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAskQuestion(`What were the alternatives considered for: ${brief.decisionSummary}`)}
          >
            View Alternatives
          </Button>
        </div>
      </div>
    </div>
  );
};