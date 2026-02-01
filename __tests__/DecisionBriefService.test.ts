import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma client to avoid runtime import issues in unit tests
vi.mock('../src/lib/db', () => {
  const mockPrisma = {
    decisionBrief: { 
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
  };
  return {
    default: mockPrisma,
    prisma: mockPrisma,
  };
});

import { DecisionBriefService } from '../src/services/DecisionBriefService';
import { LLMService } from '../src/services/LLMService';
import type { DecisionCandidate } from '../src/models/DecisionCandidate';

const sampleDecision: DecisionCandidate = {
  id: 'cand-1',
  conversationId: 'conv-1',
  isDecision: true,
  summary: 'Use Auth0 for authentication',
  confidence: 0.92,
};

describe('DecisionBriefService', () => {
  let askMock: any;

  beforeEach(() => {
    askMock = vi.spyOn(LLMService, 'askQuestion');
  });

  afterEach(() => {
    askMock.mockRestore();
  });

  it('creates a decision brief successfully', async () => {
    const result = await DecisionBriefService.createBrief({
      decisionSummary: 'Use Auth0 for authentication',
      problem: 'Need SSO and enterprise-grade auth for customers',
      optionsConsidered: ['Auth0', 'Okta', 'Firebase Auth'],
      rationale: 'Auth0 provides SSO and strong compliance for enterprise customers',
      participants: ['alice', 'bob'],
      sourceReferences: [{ conversationId: 'conv-1', text: 'We should use Auth0 for auth' }],
      confidence: 0.92,
      status: 'pending',
      tags: [],
      userId: 'user-1',
      decisionCandidateId: 'cand-1',
    });

    expect(result).toBeDefined();
    expect(result.decisionSummary).toBe('Use Auth0 for authentication');
  });

  it('updates a decision brief successfully', async () => {
    const result = await DecisionBriefService.updateBrief('brief-1', {
      decisionSummary: 'Updated Auth0 decision',
      problem: 'Updated problem statement',
      optionsConsidered: ['Auth0', 'Okta'],
      rationale: 'Updated rationale',
      participants: ['alice'],
      sourceReferences: [{ conversationId: 'conv-1', text: 'Updated reference' }],
      confidence: 0.95,
      status: 'approved',
      tags: ['security', 'auth'],
      userId: 'user-1',
    });

    expect(result).toBeDefined();
    expect(result.decisionSummary).toBe('Updated Auth0 decision');
  });

  it('gets a decision brief by ID', async () => {
    const result = await DecisionBriefService.getBriefById('brief-1', 'user-1');

    expect(result).toBeDefined();
    expect(result?.id).toBe('brief-1');
  });

  it('lists decision briefs with filtering', async () => {
    const result = await DecisionBriefService.listBriefs({
      userId: 'user-1',
      status: 'pending',
      tags: ['security'],
    });

    expect(result).toBeDefined();
    expect(result.briefs).toBeDefined();
    expect(result.total).toBeDefined();
  });

  it('deletes a decision brief', async () => {
    const result = await DecisionBriefService.deleteBrief('brief-1', 'user-1');

    expect(typeof result).toBe('boolean');
  });
});
