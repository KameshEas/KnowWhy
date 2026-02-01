import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metrics } from '../src/lib/metrics';
import { DecisionBriefService } from '../src/services/DecisionBriefService';
import { LLMService } from '../src/services/LLMService';

// Mock Prisma client to avoid runtime init errors
vi.mock('../src/lib/db', () => {
  const mockPrisma = {
    decisionBrief: { create: vi.fn() },
  };
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

// Mock the metrics module
vi.mock('../src/lib/metrics', () => {
  const mockMetrics = {
    increment: vi.fn(),
    get: vi.fn(() => 0),
    reset: vi.fn(),
    prometheus: vi.fn(() => ''),
  };
  return {
    metrics: mockMetrics,
  };
});

vi.mock('../src/services/LLMService', () => ({
  LLMService: {
    askQuestion: vi.fn(),
  }
}));

const sampleDecision: any = {
  id: 'cand-1',
  conversationId: 'conv-1',
  isDecision: true,
  summary: 'Use X',
  confidence: 0.5,
};

const conversations: any[] = [
  { id: 'conv-1', source: 'slack', author: 'a', timestamp: '2026-02-01T12:00:00Z', text: 'msg' }
];

describe('metrics', () => {
  beforeEach(() => {
    metrics.reset();
    vi.clearAllMocks();
  });

  it('increments success when generation succeeds on first try', async () => {
    (LLMService.askQuestion as any).mockResolvedValueOnce(JSON.stringify({
      title: 'Use X for auth',
      problem: 'We need a single sign-on solution for customers that supports SSO and compliance requirements.',
      optionsConsidered: ['X', 'Y'],
      rationale: 'X provides better integration and compliance support',
      participants: ['a'],
      sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
      confidence: 0.5
    }));

    const res = await DecisionBriefService.createBrief({
      decisionSummary: 'Use X for auth',
      problem: 'We need a single sign-on solution for customers that supports SSO and compliance requirements.',
      optionsConsidered: ['X', 'Y'],
      rationale: 'X provides better integration and compliance support',
      participants: ['a'],
      sourceReferences: [{ conversationId: 'conv-1', text: 'msg' }],
      confidence: 0.5,
      status: 'pending',
      tags: [],
      userId: 'user-1',
      decisionCandidateId: 'cand-1',
    });
    expect(res).toBeDefined();
    expect(metrics.get('decision_brief_created')).toBe(1);
    expect(metrics.get('decision_brief_created_success')).toBe(1);
  });

  it('increments failure when creation fails', async () => {
    (LLMService.askQuestion as any)
      .mockResolvedValueOnce('still not json')
      .mockResolvedValueOnce('still not json');

    try {
      await DecisionBriefService.createBrief({
        decisionSummary: 'Use X for auth',
        problem: 'We need a single sign-on solution for customers that supports SSO and compliance requirements.',
        optionsConsidered: ['X', 'Y'],
        rationale: 'X provides better integration and compliance support',
        participants: ['a'],
        sourceReferences: [{ conversationId: 'conv-1', text: 'msg' }],
        confidence: 0.5,
        status: 'pending',
        tags: [],
        userId: 'user-1',
        decisionCandidateId: 'cand-1',
      });
    } catch (error) {
      expect(metrics.get('decision_brief_created_failure')).toBe(1);
    }
  });

  it('tracks llm request and errors in askQuestion', async () => {
    metrics.reset();
    // Use the real LLMService implementation for these tests
    const { LLMService: RealLLMService } = await vi.importActual('../src/services/LLMService');

    // configure LLMService to call fetchFn that throws
    const failingFetch = async () => { throw new Error('boom'); };
    (RealLLMService as any).configure({ baseUrl: 'http://localhost', fetchFn: failingFetch as any });

    const res = await (RealLLMService as any).askQuestion('hi');
    // askQuestion returns fallback string on error
    expect(res).toContain("Sorry");
    expect(metrics.get('llm_requests_total')).toBe(1);
    expect(metrics.get('llm_request_errors_total')).toBe(1);
  });

  it('tracks stream reader errors', async () => {
    metrics.reset();
    const { LLMService: RealLLMService } = await vi.importActual('../src/services/LLMService');

    const fakeFetch = async () => ({ ok: true, body: { getReader: () => ({ read: async () => { throw new Error('reader fail'); } }) } });
    (RealLLMService as any).configure({ baseUrl: 'http://stream', fetchFn: fakeFetch as any });

    const res = await (RealLLMService as any).askQuestion('q', undefined, true);
    expect(res).toContain("Sorry");
    expect(metrics.get('llm_requests_total')).toBe(1);
    expect(metrics.get('llm_request_errors_total')).toBe(1); // errors counter increments on catch
    expect(metrics.get('llm_request_stream_errors_total')).toBe(1); // stream-specific counter incremented when reader throws
  });
});
