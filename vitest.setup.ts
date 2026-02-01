// Global test setup to make LLMService test-friendly and avoid making real network calls
import { LLMService } from './src/services/LLMService';

// A very small Response-like stub that covers the parts LLMService uses in tests.
const okJsonResponse = async (payload: any = {}) => ({
  ok: true,
  json: async () => payload,
  body: undefined,
});

// Configure the LLMService to use a harmless fetch stub and a localhost baseUrl
LLMService.configure({
  baseUrl: 'http://localhost',
  fetchFn: async (input: any, init?: any) => {
    // Return an empty-but-ok response by default. Individual tests should spy/mock LLMService.askQuestion
    // or set a more specific fetchFn if they test low-level behavior.
    return okJsonResponse({});
  },
});
