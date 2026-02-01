import React from 'react';
import { Button } from '../ui/button';

interface ErrorBannerProps {
  message: string;
  onClose?: () => void;
  onRetry?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onClose, onRetry }) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center justify-between"
    >
      <div className="flex items-center space-x-3">
        <div className="text-sm">{message}</div>
      </div>
      <div className="flex items-center space-x-2">
        {onRetry && (
          <Button variant="primary" size="sm" onClick={onRetry} aria-label="Retry action">
            Retry
          </Button>
        )}
        <button
          aria-label="Dismiss error"
          onClick={onClose}
          className="text-red-500 hover:text-red-700 focus:outline-none"
        >
          ×
        </button>
      </div>
    </div>
  );
};
