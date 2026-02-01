import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMService } from '../src/services/LLMService';
import { rateLimiter } from '../src/utils/rate-limiter';

describe('LLMService configuration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses configured baseUrl and fetchFn for askQuestion (non-stream)', async () => {
    // Stub rate limiter
    vi.spyOn(rateLimiter, 'waitForRateLimit').mockResolvedValue();

    const fakeFetch = vi.fn(async (input: any, init?: any) => ({
      ok: true,
      json: async () => ({ text: 'hello from fake' }),
    }));

    LLMService.configure({ baseUrl: 'http://example.com', fetchFn: fakeFetch });

    const res = await LLMService.askQuestion('test prompt', 'model-x', false);

    expect(fakeFetch).toHaveBeenCalled();
    const calledUrl = fakeFetch.mock.calls[0][0];
    expect(String(calledUrl)).toContain('http://example.com/api/groq/chat');
    expect(res).toBe('hello from fake');
  });

  it('falls back to http://localhost when baseUrl is empty', async () => {
    vi.spyOn(rateLimiter, 'waitForRateLimit').mockResolvedValue();

    const fakeFetch = vi.fn(async (input: any, init?: any) => ({
      ok: true,
      json: async () => ({ text: 'local response' }),
    }));

    LLMService.configure({ baseUrl: '', fetchFn: fakeFetch });

    const res = await LLMService.askQuestion('another prompt');

    expect(fakeFetch).toHaveBeenCalled();
    const calledUrl = fakeFetch.mock.calls[0][0];
    expect(String(calledUrl)).toContain('http://localhost/api/groq/chat');
    expect(res).toBe('local response');
  });

  it('handles streaming responses by concatenating chunks', async () => {
    vi.spyOn(rateLimiter, 'waitForRateLimit').mockResolvedValue();

    // create a fake reader that returns two chunks then done
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    let idx = 0;

    const fakeFetch = vi.fn(async (input: any, init?: any) => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (idx < chunks.length) {
              return { done: false, value: chunks[idx++] };
            }
            return { done: true, value: undefined };
          }
        })
      }
    }));

    LLMService.configure({ baseUrl: 'http://stream.local', fetchFn: fakeFetch });

    const res = await LLMService.askQuestion('stream prompt', 'model-x', true);

    expect(fakeFetch).toHaveBeenCalled();
    const calledUrl = fakeFetch.mock.calls[0][0];
    expect(String(calledUrl)).toContain('http://stream.local/api/groq/chat');
    expect(res).toBe('hello world');
  });

  it('returns a graceful fallback when the stream reader throws', async () => {
    vi.spyOn(rateLimiter, 'waitForRateLimit').mockResolvedValue();

    const fakeFetch = vi.fn(async (input: any, init?: any) => ({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => { throw new Error('reader failure'); }
        })
      }
    }));

    LLMService.configure({ baseUrl: 'http://stream.error', fetchFn: fakeFetch });

    const res = await LLMService.askQuestion('stream prompt', 'model-x', true);

    expect(fakeFetch).toHaveBeenCalled();
    const calledUrl = fakeFetch.mock.calls[0][0];
    expect(String(calledUrl)).toContain('http://stream.error/api/groq/chat');
    expect(res).toBe("Sorry, I couldn't process your question at this time.");
  });
});
