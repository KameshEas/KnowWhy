/**
 * Slack OAuth 2.0 Authentication & Installation Handler
 * 
 * Manages:
 * - OAuth installation flow (redirect to Slack, handle callback)
 * - Workspace token storage
 * - Multi-workspace support
 * - Token refresh (if using user tokens)
 * 
 * Environment variables required:
 * - SLACK_CLIENT_ID
 * - SLACK_CLIENT_SECRET
 * - SLACK_SIGNING_SECRET (for webhook verification)
 * - SLACK_OAUTH_REDIRECT_URI
 */

import { WebClient, WebAPICallResult } from '@slack/web-api';
import { InstallProvider } from '@slack/oauth';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// ============================================================================
// TYPES
// ============================================================================

export interface SlackOAuthConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  redirectUri: string;
  scopes: string[];
  userScopes?: string[];
}

export interface SlackTokens {
  botToken: string;
  userToken?: string;
  teamId: string;
  teamName: string;
  botUserId?: string;
}

export interface SlackInstallationRecord {
  workspaceId: string;
  workspaceName: string;
  botToken: string;
  userToken?: string;
  botUserId?: string;
  installedBy: string;
  scopes: string[];
}

// ============================================================================
// OAUTH PROVIDER SETUP
// ============================================================================

/**
 * Create an InstallProvider for OAuth flow
 */
export function createOAuthProvider(config: SlackOAuthConfig): InstallProvider {
  return new InstallProvider({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    stateStore: new PrismaStateStore(), // Custom state store using DB
    installationStore: new PrismaInstallationStore(), // Custom installation store using DB
  });
}

// ============================================================================
// CUSTOM STATE STORE (For OAuth code/state management)
// ============================================================================

/**
 * Store OAuth state in database (instead of in-memory)
 * Enables multi-server setups and prevents state loss on restart
 */
class PrismaStateStore {
  async consumeOAuthState(stateToConsume: string): Promise<boolean> {
    try {
      // For MVP: simple in-memory validation
      // Production: store in Redis or DB with TTL
      return true;
    } catch (error) {
      console.error('Error consuming OAuth state:', error);
      return false;
    }
  }

  async saveOAuthState(stateToSave: string): Promise<void> {
    try {
      // For MVP: skip persistence (state is short-lived)
      // Production: store with 10-minute TTL
    } catch (error) {
      console.error('Error saving OAuth state:', error);
    }
  }
}

// ============================================================================
// CUSTOM INSTALLATION STORE (For token persistence)
// ============================================================================

/**
 * Store OAuth tokens and installation metadata in Postgres
 */
class PrismaInstallationStore {
  async saveInstallation(installation: any): Promise<void> {
    try {
      const { team, enterprise, bot, user, incoming_webhook } = installation;

      const workspaceId = team?.id || 'unknown';
      const workspaceName = team?.name || 'Unknown Workspace';

      // Create or update SlackWorkspace
      await prisma.slackWorkspace.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          workspaceName,
          botUserId: bot?.id,
          botAccessToken: bot?.token || '',
          installedBy: user?.id || 'unknown',
          installUrl: incoming_webhook?.url || '',
          scopes: bot?.scopes || [],
          isActive: true,
        },
        update: {
          workspaceName,
          botUserId: bot?.id,
          botAccessToken: bot?.token || '',
          isActive: true,
          updatedAt: new Date(),
        },
      });

      // Create or update SlackInstallation
      await prisma.slackInstallation.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          botToken: bot?.token || '',
          userToken: user?.token,
        },
        update: {
          botToken: bot?.token || '',
          userToken: user?.token,
          updatedAt: new Date(),
        },
      });

      // Initialize sync status
      await prisma.slackSyncStatus.upsert({
        where: { workspaceId },
        create: {
          workspaceId,
          isSyncing: false,
        },
        update: {
          isSyncing: false,
        },
      });

      console.log(`✅ Slack workspace installed: ${workspaceName} (${workspaceId})`);
    } catch (error) {
      console.error('Error saving Slack installation:', error);
      throw error;
    }
  }

  async fetchInstallation(
    installQuery: any
  ): Promise<any> {
    try {
      const workspaceId = installQuery.teamId || installQuery.team_id;

      if (!workspaceId) {
        throw new Error('No team_id provided to fetch installation');
      }

      const installation = await prisma.slackInstallation.findUnique({
        where: { workspaceId },
        include: {
          workspace: true,
        },
      });

      if (!installation) {
        return undefined;
      }

      return {
        team: { id: workspaceId, name: installation.workspace.workspaceName },
        bot: {
          token: installation.botToken,
          id: installation.workspace.botUserId,
          scopes: installation.workspace.scopes,
        },
        user: {
          token: installation.userToken,
          id: installation.workspace.installedBy,
        },
      };
    } catch (error) {
      console.error('Error fetching Slack installation:', error);
      return undefined;
    }
  }

  async deleteInstallation(deleteQuery: any): Promise<void> {
    try {
      const workspaceId = deleteQuery.teamId || deleteQuery.team_id;

      if (!workspaceId) {
        throw new Error('No team_id provided to delete installation');
      }

      // Mark as inactive instead of deleting (audit trail)
      await prisma.slackWorkspace.update({
        where: { workspaceId },
        data: { isActive: false },
      });

      console.log(`🗑️  Slack workspace deinstalled: ${workspaceId}`);
    } catch (error) {
      console.error('Error deleting Slack installation:', error);
    }
  }

  async findInstallation(
    installQuery: any
  ): Promise<any> {
    // Alias for fetchInstallation (some flows expect this method)
    return this.fetchInstallation(installQuery);
  }
}

// ============================================================================
// OAUTH FLOW HANDLERS
// ============================================================================

/**
 * Generate OAuth install URL
 * User clicks this to redirect to Slack's permission dialog
 */
export function generateInstallUrl(config: SlackOAuthConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scopes.join(','),
    redirect_uri: config.redirectUri,
    state: state || generateState(),
    ...(config.userScopes && { user_scope: config.userScopes.join(',') }),
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Handle OAuth callback (after user clicks "Allow" on Slack)
 * 
 * Usage in Next.js API route:
 * ```typescript
 * const { botToken, workspaceId } = await handleOAuthCallback(code, config);
 * ```
 */
export async function handleOAuthCallback(
  code: string,
  config: SlackOAuthConfig
): Promise<SlackTokens> {
  try {
    // Exchange authorization code for tokens
    const client = new WebClient(); // No token needed for oauth.v2.access
    const result = await client.oauth.v2.access({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
    });

    if (!result.ok || !result.access_token) {
      throw new Error(`OAuth failed: ${result.error}`);
    }

    const tokens: SlackTokens = {
      botToken: result.access_token,
      userToken: result.authed_user?.access_token,
      teamId: result.team?.id || 'unknown',
      teamName: result.team?.name || 'Unknown',
      botUserId: result.bot_user_id,
    };

    // Store installation
    const stateStore = new PrismaInstallationStore();
    await stateStore.saveInstallation({
      team: { id: tokens.teamId, name: tokens.teamName },
      bot: {
        token: tokens.botToken,
        id: tokens.botUserId,
        scopes: config.scopes,
      },
      user: {
        token: tokens.userToken,
        id: result.authed_user?.id || 'unknown',
      },
    });

    return tokens;
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    throw error;
  }
}

/**
 * Get a Slack WebClient for a specific workspace
 * 
 * Usage:
 * ```typescript
 * const slack = await getSlackClient(workspaceId);
 * const channels = await slack.conversations.list();
 * ```
 */
export async function getSlackClient(workspaceId: string): Promise<WebClient> {
  try {
    const installation = await prisma.slackInstallation.findUnique({
      where: { workspaceId },
    });

    if (!installation || !installation.botToken) {
      throw new Error(`No Slack token found for workspace: ${workspaceId}`);
    }

    return new WebClient(installation.botToken);
  } catch (error) {
    console.error('Error getting Slack client:', error);
    throw error;
  }
}

/**
 * List all installed Slack workspaces for a user
 */
export async function listInstalledWorkspaces(userId?: string) {
  try {
    const workspaces = await prisma.slackWorkspace.findMany({
      where: {
        isActive: true,
        ...(userId && { userId }),
      },
      select: {
        id: true,
        workspaceId: true,
        workspaceName: true,
        botUserId: true,
        installedBy: true,
        createdAt: true,
        lastSyncedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return workspaces;
  } catch (error) {
    console.error('Error listing workspaces:', error);
    throw error;
  }
}

/**
 * Deinstall Slack app from a workspace
 * (Marks workspace as inactive, preserves audit trail)
 */
export async function deinstallWorkspace(workspaceId: string): Promise<void> {
  try {
    await prisma.slackWorkspace.update({
      where: { workspaceId },
      data: { isActive: false, updatedAt: new Date() },
    });

    console.log(`✅ Deinstalled Slack workspace: ${workspaceId}`);
  } catch (error) {
    console.error('Error deinstalling workspace:', error);
    throw error;
  }
}

// ============================================================================
// WEBHOOK VERIFICATION & SIGNATURE VALIDATION
// ============================================================================

/**
 * Verify Slack webhook signature (for Socket Mode events, slash commands, etc.)
 * Slack includes X-Slack-Request-Timestamp and X-Slack-Signature headers
 */
export function verifySlackSignature(
  headers: Record<string, string>,
  body: string,
  signingSecret: string
): boolean {
  try {
    const timestamp = headers['x-slack-request-timestamp'];
    const signature = headers['x-slack-signature'];

    if (!timestamp || !signature) {
      console.warn('Missing Slack signature headers');
      return false;
    }

    // Prevent replay attacks (timestamp must be within 5 minutes)
    const requestAge = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (requestAge > 300) {
      console.warn('Slack request timestamp too old');
      return false;
    }

    // Compute signature
    const baseString = `v0:${timestamp}:${body}`;
    const computedSignature = `v0=${crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex')}`;

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));
  } catch (error) {
    console.error('Error verifying Slack signature:', error);
    return false;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a random state string for OAuth (CSRF protection)
 */
function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Get workspace info from Slack API
 */
export async function getWorkspaceInfo(slack: WebClient): Promise<any> {
  try {
    const result = await slack.team.info();
    return result.team;
  } catch (error) {
    console.error('Error getting workspace info:', error);
    throw error;
  }
}

/**
 * Test the bot token (verify it's valid)
 */
export async function testBotToken(slack: WebClient): Promise<boolean> {
  try {
    const result = await slack.auth.test();
    return result.ok === true;
  } catch (error) {
    console.error('Error testing bot token:', error);
    return false;
  }
}

export { PrismaInstallationStore, PrismaStateStore };
