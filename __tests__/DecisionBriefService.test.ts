import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecisionBriefService } from '../src/services/DecisionBriefService';
import { LLMService } from '../src/services/LLMService';
import type { DecisionCandidate } from '../src/models/DecisionCandidate';
import type { ConversationBlock } from '../src/models/ConversationBlock';

const sampleDecision: DecisionCandidate = {
  id: 'cand-1',
  conversationId: 'conv-1',
  isDecision: true,
  summary: 'Use Auth0 for authentication',
  confidence: 0.92,
};

const conversations: ConversationBlock[] = [
  { id: 'conv-1', source: 'slack', author: 'alice', timestamp: '2026-02-01T12:00:00Z', text: 'We should use Auth0 for auth because of SSO and compliance.' },
  { id: 'conv-2', source: 'slack', author: 'bob', timestamp: '2026-02-01T12:05:00Z', text: "Sounds good to me, let's go with Auth0." },
];

describe('DecisionBriefService', () => {
  let askMock: any;

  beforeEach(() => {
    askMock = vi.spyOn(LLMService, 'askQuestion');
  });

  afterEach(() => {
    askMock.mockRestore();
  });

  it('parses valid JSON returned by LLM and validates it', async () => {
    const llmResponse = JSON.stringify({
      title: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise-grade auth for customers',
      optionsConsidered: ['Auth0', 'Okta', 'Firebase Auth'],
      rationale: 'Auth0 provides SSO and strong compliance for enterprise customers',
      participants: ['alice', 'bob'],
      sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z', excerpt: 'We should use Auth0 for auth' }],
      confidence: 0.92
    });

    askMock.mockResolvedValueOnce(llmResponse);

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations);

    expect(res.valid).toBe(true);
    expect(res.brief).toBeTruthy();
    expect((res.brief as any).title).toContain('Auth0');
  });

  it('attempts to repair invalid JSON by re-asking and fails gracefully if still invalid', async () => {
    // First response: not JSON
    askMock
      .mockResolvedValueOnce('I think Auth0 is best — explanation follows: ...')
      // Second response: still not JSON
      .mockResolvedValueOnce('still not json');

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations);

    expect(res.valid).toBe(false);
    expect(res.errors).toBeTruthy();
    expect(res.brief).toBeNull();
  });

  it('repairs invalid JSON by asking again and succeeds when valid JSON is returned', async () => {
    askMock
      .mockResolvedValueOnce('Some text not json')
      .mockResolvedValueOnce(JSON.stringify({
        title: 'Use Auth0 for authentication',
        problem: 'Need SSO',
        optionsConsidered: ['Auth0'],
        rationale: 'SSO for enterprise',
        participants: ['alice'],
        sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
        confidence: 0.9
      }));

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations);

    expect(res.valid).toBe(true);
    expect(res.brief).toBeTruthy();
  });

  it('asks for schema-corrected JSON when fields are missing and accepts corrected JSON', async () => {
    // First response: JSON missing required fields (optionsConsidered)
    const incomplete = JSON.stringify({
      title: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise auth',
      rationale: 'SSO for enterprise',
      participants: ['alice'],
      sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
      confidence: 0.9
    });

    const corrected = JSON.stringify({
      title: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise auth',
      optionsConsidered: ['Auth0', 'Okta'],
      rationale: 'SSO for enterprise',
      participants: ['alice'],
      sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
      confidence: 0.9
    });

    askMock
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(corrected);

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations);

    expect(res.valid).toBe(true);
    expect((res.brief as any).optionsConsidered.length).toBeGreaterThan(0);
  });

  it('rejects when model returns JSON with wrong types and cannot correct', async () => {
    // First: JSON with confidence as string
    const badType = JSON.stringify({
      title: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise auth',
      optionsConsidered: ['Auth0'],
      rationale: 'SSO for enterprise',
      participants: ['alice'],
      sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
      confidence: 'high'
    });

    // Second: still invalid (model fails to correct)
    const stillBad = JSON.stringify({
      title: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise auth',
      optionsConsidered: [],
      rationale: '',
      participants: [],
      sourceReferences: [],
      confidence: 'high'
    });

    askMock.mockResolvedValueOnce(badType).mockResolvedValueOnce(stillBad);

    const res = await DecisionBriefService.generateFromCandidate(sampleDecision, conversations);

    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });
});
