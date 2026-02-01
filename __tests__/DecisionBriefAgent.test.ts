import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma and DecisionBriefService (hoisted by Vitest)
vi.mock('../src/lib/db', () => ({
  default: {
    decisionCandidate: { findUnique: vi.fn() },
    conversation: { findUnique: vi.fn() },
    decisionBrief: { create: vi.fn() },
    $transaction: vi.fn((fn: any) => fn({
      decisionBrief: { create: vi.fn() },
      decisionCandidate: { update: vi.fn() }
    })),
  }
}));

vi.mock('../src/services/DecisionBriefService', () => ({
  DecisionBriefService: {
    generateFromCandidate: vi.fn(),
  }
}));

// We'll import the mocked modules inside each test (dynamic import) to avoid hoisting/timing issues.

describe('DecisionBriefAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a brief when generation is valid', async () => {
    const mockPrisma: any = (await import('../src/lib/db')).default;
    const mockService: any = (await import('../src/services/DecisionBriefService')).DecisionBriefService;
    const { DecisionBriefAgent } = await import('../src/agents/DecisionBriefAgent');

    mockPrisma.decisionCandidate.findUnique.mockResolvedValueOnce({ id: 'cand-1', conversationId: 'conv-1', confidence: 0.9, userId: 'user-1' });
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({ id: 'conv-1', source: 'slack', author: 'alice', timestamp: new Date('2026-02-01T12:00:00Z'), content: 'We should use Auth0' });
    mockService.generateFromCandidate.mockResolvedValueOnce({ valid: true, brief: { title: 'Use Auth0', problem: 'Need SSO', optionsConsidered: ['Auth0'], participants: ['alice'], sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }], confidence: 0.9 } });
    const created = { id: 'brief-1' };
    mockPrisma.$transaction.mockResolvedValueOnce(created);

    const res = await DecisionBriefAgent.runForCandidate('cand-1', 'user-1');

    expect(res.success).toBe(true);
    expect(res.brief).toBeTruthy();
  });

  it('returns errors when generation fails validation', async () => {
    const mockPrisma: any = (await import('../src/lib/db')).default;
    const mockService: any = (await import('../src/services/DecisionBriefService')).DecisionBriefService;
    const { DecisionBriefAgent } = await import('../src/agents/DecisionBriefAgent');

    mockPrisma.decisionCandidate.findUnique.mockResolvedValueOnce({ id: 'cand-2', conversationId: 'conv-2', confidence: 0.4, userId: 'user-2' });
    mockPrisma.conversation.findUnique.mockResolvedValueOnce({ id: 'conv-2', source: 'slack', author: 'bob', timestamp: new Date('2026-02-01T12:00:00Z'), content: 'Maybe use X' });
    mockService.generateFromCandidate.mockResolvedValueOnce({ valid: false, errors: ['title is required'], brief: null });

    const res = await DecisionBriefAgent.runForCandidate('cand-2', 'user-2');

    expect(res.success).toBe(false);
    expect(res.errors).toContain('title is required');
  });
});