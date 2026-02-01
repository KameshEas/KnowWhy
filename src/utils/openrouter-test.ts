import { openrouterConfig } from '@/config/openrouter';

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export async function testOpenRouterConnection(): Promise<TestResult> {
  try {
    // Check if API key is configured
    if (!openrouterConfig.apiKey) {
      return {
        success: false,
        message: 'OpenRouter API key not configured'
      };
    }

    // Test the chat API endpoint
    const response = await fetch('/api/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Hello, this is a test.',
        model: 'deepseek/deepseek-r1-0528:free',
        temperature: 0.1,
        maxTokens: 50
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `API request failed with status ${response.status}`,
        details: {
          status: response.status,
          statusText: response.statusText
        }
      };
    }

    const result = await response.json();
    
    if (result.text) {
      return {
        success: true,
        message: 'OpenRouter integration is working correctly',
        details: {
          model: result.model,
          usage: result.usage
        }
      };
    } else {
      return {
        success: false,
        message: 'API returned empty response',
        details: result
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Connection test failed: ${error.message}`,
      details: {
        error: error.message,
        stack: error.stack
      }
    };
  }
}

export async function testModelAvailability(model: string): Promise<TestResult> {
  try {
    const response = await fetch('/api/openrouter/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Test model availability.',
        model: model,
        temperature: 0.1,
        maxTokens: 20
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Model ${model} is not available or failed`,
        details: {
          status: response.status,
          statusText: response.statusText
        }
      };
    }

    const result = await response.json();
    
    return {
      success: true,
      message: `Model ${model} is working correctly`,
      details: {
        model: result.model,
        usage: result.usage
      }
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Model ${model} test failed: ${error.message}`,
      details: {
        error: error.message
      }
    };
  }
}