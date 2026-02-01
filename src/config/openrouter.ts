export interface OpenRouterConfig {
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  models: {
    [key: string]: {
      name: string;
      temperature: number;
      maxTokens: number;
      description: string;
    };
  };
}

export const openrouterConfig: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY || '',
  baseURL: 'https://openrouter.ai/api/v1',
  defaultModel: 'deepseek/deepseek-r1-0528:free',
  models: {
    'deepseek/deepseek-r1-0528:free': {
      name: 'DeepSeek R1 (Free)',
      temperature: 0.7,
      maxTokens: 1024,
      description: 'Primary free model for all operations'
    },
    'google/gemini-2.0-flash-exp:free': {
      name: 'Google Gemini Flash (Free)',
      temperature: 0.7,
      maxTokens: 1024,
      description: 'Alternative free model when DeepSeek is rate limited'
    }
  }
};

export const validateOpenRouterConfig = (): boolean => {
  if (!openrouterConfig.apiKey) {
    console.warn('OPENROUTER_API_KEY not set. OpenRouter features will not work.');
    return false;
  }
  return true;
};

export const getModelConfig = (modelKey: string) => {
  return openrouterConfig.models[modelKey] || openrouterConfig.models[openrouterConfig.defaultModel];
};