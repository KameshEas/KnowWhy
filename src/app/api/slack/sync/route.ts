/**
 * Trigger Slack sync for a workspace
 *
 * POST /api/slack/sync?workspaceId=...      — triggers sync for specified workspace
 * POST /api/slack/sync (body: { workspaceId }) — triggers sync for workspace in body
 *
 * Auth: Bearer JWT required
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyJWT } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';
import { syncWorkspace } from '@/integrations/slack/ingest';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const decoded = verifyJWT(token);
    if (!decoded || !decoded.userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const urlWorkspaceId = request.nextUrl.searchParams.get('workspaceId');

    let body: any = {};
    try {
      body = await request.json();
    } catch (err) {
      // ignore if no body
    }

    const workspaceId = urlWorkspaceId || body.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });

    // Validate user has access to workspace (owner or admin). For MVP, we allow any authenticated user if workspace exists.
    const workspace = await prisma.slackWorkspace.findUnique({ where: { workspaceId } });
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    // Kick off sync in background (do not block request)
    syncWorkspace(workspaceId).catch((err) => console.error('Background sync error', err));

    return NextResponse.json({ ok: true, message: 'Sync started' }, { status: 202 });
  } catch (error) {
    console.error('Error starting Slack sync:', error);
    return NextResponse.json({ error: 'Failed to start sync' }, { status: 500 });
  }
}
