import React from 'react';
import { Button } from './button';

interface EmptyStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  actionLabel,
  onAction
}) => {
  return (
    <div className="text-center py-12">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>}
      <p className="text-gray-500 mb-4">{message}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction} aria-label={actionLabel}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
