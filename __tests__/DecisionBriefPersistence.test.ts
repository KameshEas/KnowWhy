import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma client to avoid runtime import issues in unit tests
vi.mock('../src/lib/db', () => ({ default: { decisionBrief: { create: vi.fn() } } }));

import { DecisionBriefService } from '../src/services/DecisionBriefService';
import prisma from '../src/lib/db';

const sampleBrief = {
  title: 'Use Auth0',
  problem: 'Need SSO',
  optionsConsidered: ['Auth0', 'Okta'],
  rationale: 'Auth0 provides SSO and compliance',
  participants: ['alice'],
  sourceReferences: [{ type: 'slack', externalId: 'conv-1', timestamp: '2026-02-01T12:00:00Z' }],
  confidence: 0.9,
};

describe('DecisionBriefService persistence', () => {
  let createMock: any;

  beforeEach(() => {
    // Use the mocked create from vi.mock above
    // `prisma.decisionBrief.create` is already the mocked function
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls prisma.decisionBrief.create with mapped fields', async () => {
    const fakeDbRecord = { id: 'brief-1', ...sampleBrief };
    (prisma as any).decisionBrief.create.mockResolvedValueOnce(fakeDbRecord);

    const result = await DecisionBriefService.saveBrief(sampleBrief, 'user-1', 'cand-1');

    expect((prisma as any).decisionBrief.create).toHaveBeenCalled();
    const callArg = (prisma as any).decisionBrief.create.mock.calls[0][0];
    expect(callArg.data.decisionSummary).toBe('Use Auth0');
    expect(callArg.data.userId).toBe('user-1');
    expect(result).toEqual(fakeDbRecord);
  });
});
