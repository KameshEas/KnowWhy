/**
 * Slack Message Ingestion
 *
 * - List channels
 * - Backfill channel history (idempotent)
 * - Incremental sync (since last sync cursor / timestamp)
 * - Normalize Slack messages into Conversation rows
 * - Handle threads (replies) and message metadata
 *
 * Notes:
 * - Uses `slackInstallation.botToken` stored in DB
 * - Stores each Slack message as a `Conversation` with `source='slack'` and
 *   `externalId = `${channelId}:${message.ts}`` to satisfy unique constraint
 * - Uses a system user to own imported conversations (created if missing)
 */

import { PrismaClient } from '@prisma/client';
import { WebClient, WebAPICallResult } from '@slack/web-api';
import pMap from 'p-map';

const prisma = new PrismaClient();

const SYSTEM_USER_EMAIL = 'system@knowwhy.internal';

async function ensureSystemUser() {
  const existing = await prisma.user.findUnique({ where: { email: SYSTEM_USER_EMAIL } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      email: SYSTEM_USER_EMAIL,
      name: 'System',
      password: Math.random().toString(36).slice(2, 10),
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const isRateLimited = err?.data?.error === 'ratelimited' || err?.code === 'slack_webapi_rate_limited' || err?.status === 429;
      attempt++;
      if (isRateLimited && attempt <= retries) {
        const waitMs = Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited, retrying in ${waitMs}ms (attempt ${attempt}/${retries})`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

export async function listChannels(workspaceId: string) {
  const installation = await prisma.slackInstallation.findUnique({ where: { workspaceId } });
  if (!installation) throw new Error('No Slack installation for workspace');

  const slack = new WebClient(installation.botToken);

  const channels: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res: any = await withRateLimitRetry(() => slack.conversations.list({ limit: 200, cursor } as any));
    channels.push(...(res.channels || []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return channels;
}

/**
 * Fetch messages for a channel, optionally since an oldest ts
 */
export async function fetchChannelMessages(workspaceId: string, channelId: string, oldest?: string) {
  const installation = await prisma.slackInstallation.findUnique({ where: { workspaceId } });
  if (!installation) throw new Error('No Slack installation for workspace');

  const slack = new WebClient(installation.botToken);
  const messages: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const res: any = await withRateLimitRetry(() =>
      slack.conversations.history({ channel: channelId, oldest, limit: 200, cursor } as any)
    );
    messages.push(...(res.messages || []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return messages;
}

function normalizeMessageText(msg: any): string {
  // Slack messages may contain blocks; fallback to text
  if (msg.blocks && msg.blocks.length > 0) {
    try {
      // Simple extraction of text from section blocks
      const parts: string[] = [];
      for (const b of msg.blocks) {
        if (b.type === 'section' && b.text?.text) parts.push(b.text.text);
        else if (b.type === 'rich_text' && b.elements) {
          // Pull plain text from rich_text
          const t = b.elements.map((e: any) => e.elements?.map((x: any) => x.text).join('')).join('');
          if (t) parts.push(t);
        }
      }
      const joined = parts.join('\n').trim();
      if (joined.length > 0) return joined;
    } catch (err) {
      // ignore
    }
  }
  return msg.text || '';
}

/**
 * Process a single Slack message into Conversation
 */
export async function processMessage(workspaceId: string, channelId: string, message: any) {
  const systemUser = await ensureSystemUser();

  const externalId = `${channelId}:${message.ts}`;
  const source = 'slack';

  const existing = await prisma.conversation.findFirst({ where: { source, externalId } });

  const timestamp = new Date(Math.floor(parseFloat(message.ts) * 1000));
  const text = normalizeMessageText(message);
  const title = text.split('\n')[0].slice(0, 140);

  const data = {
    title: title || '(no title)',
    content: text,
    source: 'slack',
    author: message.user || message.username || message.bot_id || 'unknown',
    timestamp,
    userId: systemUser.id,
    slackMessageId: message.ts,
    slackChannelId: channelId,
    slackThreadId: message.thread_ts || null,
    externalId,
    metadata: {
      subtype: message.subtype || null,
      reactions: message.reactions || null,
      reply_count: message.reply_count || 0,
      edited: message.edited || null,
      files: message.files ? message.files.map((f: any) => ({ id: f.id, name: f.name })) : null,
    },
  };

  if (existing) {
    // Update if content changed
    const needsUpdate = existing.content !== data.content || JSON.stringify(existing.metadata) !== JSON.stringify(data.metadata);
    if (needsUpdate) {
      await prisma.conversation.update({ where: { id: existing.id }, data });
    }
    return existing;
  }

  // Create conversation
  const created = await prisma.conversation.create({ data });
  return created;
}

/**
 * Backfill all channels for a workspace. Idempotent.
 */
export async function backfillWorkspace(workspaceId: string, concurrency = 4) {
  const channels = await listChannels(workspaceId);
  console.log(`Found ${channels.length} channels for workspace ${workspaceId}`);

  // Process channels in parallel with concurrency
  await pMap(
    channels,
    async (ch: any) => {
      try {
        console.log(`Backfilling channel ${ch.name} (${ch.id})`);
        // Fetch messages (oldest undefined to go back to the beginning)
        const msgs = await fetchChannelMessages(workspaceId, ch.id);
        console.log(`Fetched ${msgs.length} messages from ${ch.name}`);

        // Process messages sequentially to preserve order (or in small batches)
        for (const msg of msgs.reverse()) {
          await processMessage(workspaceId, ch.id, msg);

          // If message is a thread root, fetch replies and process
          if (msg.thread_ts && msg.thread_ts === msg.ts) {
            try {
              const installation = await prisma.slackInstallation.findUnique({ where: { workspaceId } });
              const slack = new WebClient(installation?.botToken);
              const res: any = await withRateLimitRetry(() => slack.conversations.replies({ channel: ch.id, ts: msg.thread_ts } as any));
              const replies = res.messages || [];
              for (const r of replies) {
                if (r.ts !== msg.ts) {
                  await processMessage(workspaceId, ch.id, r);
                }
              }
            } catch (err) {
              console.warn('Failed to fetch thread replies:', err);
            }
          }
        }

        // Update sync status per channel
        await prisma.slackSyncStatus.upsert({
          where: { workspaceId },
          create: { workspaceId, totalChannels: 1, totalMessages: msgs.length },
          update: {
            totalChannels: { increment: 1 },
            totalMessages: { increment: msgs.length },
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        console.error('Error backfilling channel', ch.id, err);
        // Increment error count
        await prisma.slackSyncStatus.update({ where: { workspaceId }, data: { errorCount: { increment: 1 }, lastErrorMessage: String(err), updatedAt: new Date() } });
      }
    },
    { concurrency }
  );

  console.log('Backfill complete.');
}

/**
 * Incremental sync: fetch messages since lastMessageTimestamp (stored in slackSyncStatus.lastMessageTimestamp)
 */
export async function incrementalSync(workspaceId: string, concurrency = 4) {
  const status = await prisma.slackSyncStatus.findUnique({ where: { workspaceId } });
  const oldest = status?.lastMessageTimestamp || undefined;

  const channels = await listChannels(workspaceId);

  for (const ch of channels) {
    try {
      const msgs = await fetchChannelMessages(workspaceId, ch.id, oldest);
      if (msgs.length === 0) continue;

      let latestTs = oldest ? parseFloat(oldest) : 0;

      for (const msg of msgs.reverse()) {
        await processMessage(workspaceId, ch.id, msg);
        const ts = parseFloat(msg.ts);
        if (ts > latestTs) latestTs = ts;
      }

      // Update lastMessageTimestamp to latest processed across channels
      await prisma.slackSyncStatus.upsert({
        where: { workspaceId },
        create: { workspaceId, lastMessageTimestamp: String(latestTs), lastSyncedAt: new Date(), totalMessages: msgs.length, totalChannels: 1 },
        update: { lastMessageTimestamp: String(latestTs), lastSyncedAt: new Date(), totalMessages: { increment: msgs.length }, updatedAt: new Date() },
      });
    } catch (err) {
      console.error('Error incremental syncing channel', ch.id, err);
      await prisma.slackSyncStatus.update({ where: { workspaceId }, data: { errorCount: { increment: 1 }, lastErrorMessage: String(err), updatedAt: new Date() } });
    }
  }

  console.log('Incremental sync complete.');
}

/**
 * Manual helper: sync workspace fully (backfill if never synced, else incremental)
 */
export async function syncWorkspace(workspaceId: string) {
  const status = await prisma.slackSyncStatus.findUnique({ where: { workspaceId } });
  if (!status || !status.lastSyncedAt) {
    console.log('No previous sync found; running full backfill');
    await backfillWorkspace(workspaceId);
  } else {
    console.log('Running incremental sync');
    await incrementalSync(workspaceId);
  }
}

export default {
  listChannels,
  fetchChannelMessages,
  processMessage,
  backfillWorkspace,
  incrementalSync,
  syncWorkspace,
};
