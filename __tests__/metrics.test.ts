import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metrics } from '../src/lib/metrics';
import { DecisionBriefService } from '../src/services/DecisionBriefService';
import { LLMService } from '../src/services/LLMService';

// Mock Prisma client to avoid runtime init errors
vi.mock('../src/lib/db', () => ({
  default: {
    decisionBrief: { create: vi.fn() },
  },
}));

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

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations as any);
    expect(res.valid).toBe(true);
    expect(metrics.get('decision_brief_generation_success_total')).toBe(1);
    expect(metrics.get('decision_brief_generation_repair_attempts_total')).toBe(0);
    expect(metrics.get('decision_brief_generation_failure_total')).toBe(0);
  });

  it('increments repair attempts when repair is needed', async () => {
    (LLMService.askQuestion as any)
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify({
        title: 'Adopt X for auth',
        problem: 'We need unified auth to support SSO across our apps.',
        optionsConsidered: ['X'],
        rationale: 'X is easiest to integrate',
        participants: ['a'],
        sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
        confidence: 0.7
      }));

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations as any);
    expect(res.valid).toBe(true);
    expect(metrics.get('decision_brief_generation_repair_attempts_total')).toBeGreaterThanOrEqual(1);
    expect(metrics.get('decision_brief_generation_success_total')).toBe(1);
  });

  it('increments failure when model cannot produce valid brief', async () => {
    (LLMService.askQuestion as any)
      .mockResolvedValueOnce('still not json')
      .mockResolvedValueOnce('still not json');

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations as any);
    expect(res.valid).toBe(false);
    expect(metrics.get('decision_brief_generation_failure_total')).toBe(1);
  });

  it('tracks llm request and errors in askQuestion', async () => {
    metrics.reset();
    // Use the real LLMService implementation for these tests
    const { LLMService: RealLLMService } = await vi.importActual('../src/services/LLMService');

    // configure LLMService to call fetchFn that throws
    const failingFetch = async () => { throw new Error('boom'); };
    RealLLMService.configure({ baseUrl: 'http://localhost', fetchFn: failingFetch as any });

    const res = await RealLLMService.askQuestion('hi');
    // askQuestion returns fallback string on error
    expect(res).toContain("Sorry");
    expect(metrics.get('llm_requests_total')).toBe(1);
    expect(metrics.get('llm_request_errors_total')).toBe(1);
  });

  it('tracks stream reader errors', async () => {
    metrics.reset();
    const { LLMService: RealLLMService } = await vi.importActual('../src/services/LLMService');

    const fakeFetch = async () => ({ ok: true, body: { getReader: () => ({ read: async () => { throw new Error('reader fail'); } }) } });
    RealLLMService.configure({ baseUrl: 'http://stream', fetchFn: fakeFetch as any });

    const res = await RealLLMService.askQuestion('q', undefined, true);
    expect(res).toContain("Sorry");
    expect(metrics.get('llm_requests_total')).toBe(1);
    expect(metrics.get('llm_request_errors_total')).toBe(1); // errors counter increments on catch
    expect(metrics.get('llm_request_stream_errors_total')).toBe(1); // stream-specific counter incremented when reader throws
  });
});
