/**
 * Slack Workspaces Management API
 * 
 * GET    /api/slack/workspaces          - List all connected workspaces
 * POST   /api/slack/workspaces/:id/test - Test workspace connection
 * DELETE /api/slack/workspaces/:id      - Disconnect workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getSlackClient, listInstalledWorkspaces, deinstallWorkspace, testBotToken } from '@/integrations/slack/auth';
import { verifyJWT } from '@/lib/auth';

const prisma = new PrismaClient();

/**
 * GET /api/slack/workspaces
 * List all connected Slack workspaces for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyJWT(token);
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get workspaces
    const workspaces = await listInstalledWorkspaces(decoded.userId);

    return NextResponse.json(
      {
        workspaces,
        count: workspaces.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/slack/workspaces/:id/test
 * Test the Slack bot token (verify connection is valid)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyJWT(token);
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Extract workspace ID from URL
    const pathname = request.nextUrl.pathname;
    const workspaceId = pathname.split('/').slice(-2)[0]; // Get from /api/slack/workspaces/:id/test

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400 }
      );
    }

    // Get Slack client for workspace
    const slack = await getSlackClient(workspaceId);
    const isValid = await testBotToken(slack);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Bot token is invalid or expired' },
        { status: 400 }
      );
    }

    // Update sync status
    await prisma.slackSyncStatus.update({
      where: { workspaceId },
      data: { lastSyncedAt: new Date() },
    });

    return NextResponse.json(
      {
        ok: true,
        message: 'Slack workspace connection is valid',
        workspaceId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error testing Slack connection:', error);
    return NextResponse.json(
      { error: 'Failed to test Slack connection' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/slack/workspaces/:id
 * Disconnect (deinstall) Slack workspace
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyJWT(token);
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Extract workspace ID from URL
    const pathname = request.nextUrl.pathname;
    const workspaceId = pathname.split('/')[4]; // Get from /api/slack/workspaces/:id

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID required' },
        { status: 400 }
      );
    }

    // Verify user owns this workspace
    const workspace = await prisma.slackWorkspace.findUnique({
      where: { workspaceId },
    });

    if (!workspace || (workspace.userId && workspace.userId !== decoded.userId)) {
      return NextResponse.json(
        { error: 'Workspace not found or access denied' },
        { status: 404 }
      );
    }

    // Deinstall workspace
    await deinstallWorkspace(workspaceId);

    return NextResponse.json(
      {
        ok: true,
        message: 'Slack workspace disconnected',
        workspaceId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deinstalling workspace:', error);
    return NextResponse.json(
      { error: 'Failed to deinstall workspace' },
      { status: 500 }
    );
  }
}
