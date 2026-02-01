/**
 * Slack OAuth Callback Handler
 * 
 * GET /api/slack/callback?code=...&state=...
 * 
 * Slack redirects here after user clicks "Allow" on the permission screen.
 * Exchanges the authorization code for access tokens and stores them.
 * 
 * Flow:
 * 1. Slack sends authorization code in query parameter
 * 2. We exchange it for access tokens
 * 3. Store tokens in database (SlackWorkspace, SlackInstallation)
 * 4. Redirect user to dashboard with success message
 * 5. If error, show error page
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleOAuthCallback } from '@/integrations/slack/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const state = searchParams.get('state');

    // Handle user rejection
    if (error) {
      const errorDescription = searchParams.get('error_description') || error;
      console.warn(`User rejected Slack authorization: ${error}`);
      return NextResponse.redirect(
        new URL(`/auth?slack_error=${encodeURIComponent(errorDescription)}`, request.url)
      );
    }

    // Validate authorization code
    if (!code) {
      console.error('No authorization code in Slack callback');
      return NextResponse.redirect(
        new URL('/auth?slack_error=no_code', request.url)
      );
    }

    // Exchange code for tokens
    const config = {
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
      redirectUri: process.env.SLACK_OAUTH_REDIRECT_URI!,
      scopes: [
        'channels:read',
        'chat:write',
        'messages.metadata:read',
        'users:read',
        'team:read',
        'groups:read',
        'mpim:read',
        'im:read',
        'conversations:history',
      ],
    };

    const tokens = await handleOAuthCallback(code, config);

    // Get workspace ID and name
    const workspaceId = tokens.teamId;

    // Redirect to success page with workspace info
    const successUrl = new URL('/dashboard/integrations', request.url);
    successUrl.searchParams.set('slack_workspace', workspaceId);
    successUrl.searchParams.set('slack_workspace_name', tokens.teamName);
    successUrl.searchParams.set('slack_success', 'true');

    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('Error in Slack OAuth callback:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/auth?slack_error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
