import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variant?: 'default' | 'outlined';
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  variant = 'default',
  className = '',
  ...props
}) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors';
  
  const variantClasses = {
    default: 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
    outlined: 'border-gray-200 focus:ring-blue-500 focus:border-blue-500 bg-gray-50'
  };

  const inputClasses = `${baseClasses} ${variantClasses[variant]} ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''} ${className}`;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{leftIcon}</span>
          </div>
        )}
        <input
          className={inputClasses}
          {...props}
        />
        {rightIcon && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-400">{rightIcon}</span>
          </div>
        )}
      </div>
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  variant?: 'default' | 'outlined';
}

export const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  variant = 'default',
  className = '',
  ...props
}) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors resize-vertical';
  
  const variantClasses = {
    default: 'border-gray-300 focus:ring-blue-500 focus:border-blue-500',
    outlined: 'border-gray-200 focus:ring-blue-500 focus:border-blue-500 bg-gray-50'
  };

  const textareaClasses = `${baseClasses} ${variantClasses[variant]} ${error ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''} ${className}`;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <textarea
        className={textareaClasses}
        {...props}
      />
      {error && (
        <p className="text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
};