import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/agents/DecisionBriefAgent', () => ({
  DecisionBriefAgent: {
    runForCandidate: vi.fn(),
  }
}));

import { POST } from '../../src/app/api/agents/generate-brief/route';
import { DecisionBriefAgent } from '../../src/agents/DecisionBriefAgent';

describe('POST /api/agents/generate-brief', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 and brief when successful', async () => {
    (DecisionBriefAgent.runForCandidate as any).mockResolvedValueOnce({ success: true, brief: { id: 'brief-1', title: 'Title' } });

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ decisionCandidateId: 'cand-1', userId: 'user-1' }) });
    const res: any = await POST(req as any);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.brief).toBeTruthy();
  });

  it('returns 400 with validation errors when generation fails', async () => {
    (DecisionBriefAgent.runForCandidate as any).mockResolvedValueOnce({ success: false, errors: ['title is required'], brief: null });

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ decisionCandidateId: 'cand-1' }) });
    const res: any = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain('title is required');
  });

  it('returns 404 when candidate not found', async () => {
    (DecisionBriefAgent.runForCandidate as any).mockResolvedValueOnce({ success: false, errors: ['DecisionCandidate not found'], brief: null });

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ decisionCandidateId: 'cand-unknown' }) });
    const res: any = await POST(req as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toContain('DecisionCandidate not found');
  });

  it('returns 500 for unexpected errors', async () => {
    (DecisionBriefAgent.runForCandidate as any).mockRejectedValueOnce(new Error('boom'));

    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ decisionCandidateId: 'cand-1' }) });
    const res: any = await POST(req as any);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('InternalError');
  });
});