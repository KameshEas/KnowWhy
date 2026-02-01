import { Groq } from 'groq-sdk';

export interface GroqConfig {
  apiKey: string;
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

export const groqConfig: GroqConfig = {
  apiKey: process.env.NEXT_PUBLIC_GROQ_API_KEY || '',
  defaultModel: 'llama-3.3-70b-versatile',
  models: {
    'llama-3.3-70b-versatile': {
      name: 'Llama 3.3 70B (Free)',
      temperature: 0.7,
      maxTokens: 1024,
      description: 'Primary free model for all operations'
    },
    'llama-3.1-70b-versatile': {
      name: 'Llama 3.1 70B (Free)',
      temperature: 0.7,
      maxTokens: 1024,
      description: 'Alternative free model for rate limit fallback'
    },
    'llama-3.1-8b-instant': {
      name: 'Llama 3.1 8B (Free)',
      temperature: 0.7,
      maxTokens: 1024,
      description: 'Fast response model for quick queries'
    }
  }
};

export const validateGroqConfig = (): boolean => {
  if (!groqConfig.apiKey) {
    console.warn('GROQ_API_KEY not set. Groq features will not work.');
    return false;
  }
  return true;
};

export const getModelConfig = (modelKey: string) => {
  return groqConfig.models[modelKey] || groqConfig.models[groqConfig.defaultModel];
};

export const getGroqClient = () => {
  if (!validateGroqConfig()) {
    throw new Error('Groq API key not configured');
  }
  return new Groq({
    apiKey: groqConfig.apiKey
  });
};