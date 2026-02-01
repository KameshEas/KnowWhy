/**
 * Trigger Decision Detection Agent
 *
 * POST /api/agents/detect-decisions
 * Body: { limit?: number, conversationIds?: string[] }
 * Auth: Bearer JWT required
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import DecisionDetectionAgent from '@/agents/DecisionDetectionAgent';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = verifyJWT(token);
    if (!decoded || !decoded.userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { limit, conversationIds } = body;

    // Kick off detection (run in background so request returns quickly)
    if (conversationIds && Array.isArray(conversationIds) && conversationIds.length > 0) {
      DecisionDetectionAgent.runOnConversationIds(conversationIds).catch((err) => console.error('Background detection error', err));
    } else {
      DecisionDetectionAgent.runDetection({ limit: limit || 200 }).catch((err) => console.error('Background detection error', err));
    }

    return NextResponse.json({ ok: true, message: 'Decision detection started' }, { status: 202 });
  } catch (error) {
    console.error('Error starting decision detection:', error);
    return NextResponse.json({ error: 'Failed to start decision detection' }, { status: 500 });
  }
}
