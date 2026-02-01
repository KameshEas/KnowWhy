/**
 * Slack OAuth Install URL Generation
 * 
 * GET /api/slack/install
 * 
 * Returns the URL where users click to authorize KnowWhy to access their Slack workspace.
 * 
 * Usage:
 * ```
 * 1. User clicks "Connect Slack" button
 * 2. Frontend calls GET /api/slack/install
 * 3. Redirects user to Slack's OAuth consent screen
 * 4. User clicks "Allow"
 * 5. Slack redirects to /api/slack/callback
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateInstallUrl } from '@/integrations/slack/auth';

export async function GET(request: NextRequest) {
  try {
    const config = {
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      signingSecret: process.env.SLACK_SIGNING_SECRET!,
      redirectUri: process.env.SLACK_OAUTH_REDIRECT_URI!,
      scopes: [
        'channels:read',      // List channels
        'chat:write',         // Send messages (for notifications)
        'messages.metadata:read', // Read message metadata
        'users:read',         // List users
        'team:read',          // Get workspace info
        'groups:read',        // Private channels
        'mpim:read',          // Group DMs
        'im:read',            // Direct messages
        'conversations:history', // Message history
      ],
    };

    const installUrl = generateInstallUrl(config);

    return NextResponse.json(
      { installUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error generating install URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate Slack install URL' },
      { status: 500 }
    );
  }
}
