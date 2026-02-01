import { NextResponse } from 'next/server';
import { DecisionBriefAgent } from '../../../../agents/DecisionBriefAgent';
import { logger } from '../../../../lib/logger';

export async function POST(req: Request) {
  try {
    const { decisionCandidateId, userId } = await req.json();
    if (!decisionCandidateId) return NextResponse.json({ success: false, error: 'decisionCandidateId is required' }, { status: 400 });

    logger.info('api.generateBrief.request', { decisionCandidateId, userId });

    const result = await DecisionBriefAgent.runForCandidate(decisionCandidateId, userId);

    if (!result.success) {
      // Map known not-found cases to 404
      if (result.errors && result.errors.includes('DecisionCandidate not found')) {
        logger.warn('api.generateBrief.not_found', { decisionCandidateId });
        return NextResponse.json({ success: false, errors: result.errors }, { status: 404 });
      }

      logger.warn('api.generateBrief.invalid', { decisionCandidateId, errors: result.errors });
      return NextResponse.json({ success: false, errors: result.errors, brief: result.brief }, { status: 400 });
    }

    logger.info('api.generateBrief.success', { decisionCandidateId, briefId: result.brief?.id });
    return NextResponse.json({ success: true, brief: result.brief }, { status: 201 });
  } catch (err: any) {
    logger.error('api.generateBrief.error', { error: err?.message || err });
    return NextResponse.json({ success: false, errorCode: 'InternalError', message: err?.message || 'Internal error' }, { status: 500 });
  }
}
