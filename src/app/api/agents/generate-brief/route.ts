import { NextResponse } from 'next/server';
import { DecisionBriefAgent } from '@/agents/DecisionBriefAgent';

export async function POST(req: Request) {
  try {
    const { decisionCandidateId, userId } = await req.json();
    if (!decisionCandidateId) return NextResponse.json({ error: 'decisionCandidateId is required' }, { status: 400 });

    const result = await DecisionBriefAgent.runForCandidate(decisionCandidateId, userId);

    if (!result.success) {
      return NextResponse.json({ success: false, errors: result.errors, brief: result.brief }, { status: 400 });
    }

    return NextResponse.json({ success: true, brief: result.brief }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
