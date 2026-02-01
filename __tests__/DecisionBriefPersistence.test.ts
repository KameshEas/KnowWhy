import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the db module to avoid Prisma initialization issues
vi.mock('../src/lib/db', () => {
  const mockPrisma = {
    decisionBrief: {
      create: vi.fn(),
    },
  };
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

// Mock the DecisionBriefService to use our mocked prisma
vi.mock('../src/services/DecisionBriefService', () => {
  const mockCreateBrief = vi.fn();
  return {
    DecisionBriefService: {
      createBrief: mockCreateBrief,
    },
  };
});

import { DecisionBriefService } from '../src/services/DecisionBriefService';
import { prisma } from '../src/lib/db';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls prisma.decisionBrief.create with mapped fields', async () => {
    const fakeDbRecord = { id: 'brief-1', ...sampleBrief };
    (prisma.decisionBrief.create as any).mockResolvedValueOnce(fakeDbRecord);

    const result = await DecisionBriefService.createBrief({
      decisionSummary: sampleBrief.title,
      problem: sampleBrief.problem,
      optionsConsidered: sampleBrief.optionsConsidered,
      rationale: sampleBrief.rationale,
      participants: sampleBrief.participants,
      sourceReferences: sampleBrief.sourceReferences,
      confidence: sampleBrief.confidence,
      status: 'pending',
      tags: [],
      userId: 'user-1',
      decisionCandidateId: 'cand-1',
    });

    expect(prisma.decisionBrief.create).toHaveBeenCalled();
    const callArg = (prisma.decisionBrief.create as any).mock.calls[0][0];
    expect(callArg.data.decisionSummary).toBe('Use Auth0');
    expect(callArg.data.userId).toBe('user-1');
    expect(result).toEqual(fakeDbRecord);
  });
});
