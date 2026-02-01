import React from 'react';
import { groqConfig } from '@/config/groq';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  disabled = false
}) => {
  const models = Object.entries(groqConfig.models);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Select Model
      </label>
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
        className="w-full p-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        {models.map(([key, config]) => (
          <option key={key} value={key}>
            {config.name} - {config.description}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Current model: {groqConfig.models[selectedModel]?.name}
      </p>
    </div>
  );
};
