import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  text = 'Processing...' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div className="flex items-center justify-center space-x-2" role="status" aria-live="polite">
      <div
        aria-hidden="true"
        className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]}`}
      ></div>
      <span className="text-sm text-gray-600">{text}</span>
      {/* Assistive text for screen readers */}
      <span className="sr-only">{text}</span>
    </div>
  );
};

export const LoadingOverlay: React.FC<{ text?: string }> = ({ text = 'Processing...' }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-modal="true"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div className="bg-white p-6 rounded-lg shadow-xl">
        <LoadingSpinner size="lg" text={text} />
      </div>
    </div>
  );
};