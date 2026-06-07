import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { createLogger } from '../../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { TenantIntegrationRepository } from '../../services/tenant-integration-repository.js';
import { resolveArchetypeFromChannel } from '../../services/interaction-classifier.js';
import {
  pendingInputCollections,
  recentMentions,
  MENTION_DEDUP_TTL_MS,
  findTaskIdByThreadTs,
} from './shared.js';

const log = createLogger('slack-handlers');

export function registerEventHandlers(boltApp: App, inngest: InngestLike): void {
  boltApp.use(async ({ body, next }) => {
    const eventType = (body as { event?: { type?: string } }).event?.type ?? body.type ?? 'unknown';
    log.debug({ eventType, bodyType: body.type }, 'Bolt middleware: raw payload received');
    await next();
  });

  boltApp.event('message', async ({ event }) => {
    const msg = event as {
      subtype?: string;
      bot_id?: string;
      thread_ts?: string;
      ts: string;
      text?: string;
      user?: string;
      channel: string;
      team?: string;
    };

    if (!msg.thread_ts || msg.thread_ts === msg.ts) return;
    if (msg.subtype === 'bot_message' || msg.bot_id) return;
    if (!msg.user || !msg.text) return;

    const pending = pendingInputCollections.get(msg.thread_ts);
    if (pending) {
      pendingInputCollections.delete(msg.thread_ts);
      try {
        await inngest.send({
          name: 'employee/trigger.input-received',
          data: {
            threadTs: msg.thread_ts,
            text: msg.text,
            tenantId: pending.tenantId,
            pending,
          },
        });
        log.info(
          { threadTs: msg.thread_ts, tenantId: pending.tenantId, userId: msg.user },
          'Input-received event sent for pending input collection',
        );
      } catch (err) {
        log.error({ threadTs: msg.thread_ts, err }, 'Failed to send trigger.input-received event');
      }
      return;
    }

    const taskId = await findTaskIdByThreadTs(msg.thread_ts);
    if (!taskId) return;

    try {
      await inngest.send({
        name: 'employee/interaction.received',
        data: {
          source: 'thread_reply' as const,
          text: msg.text,
          userId: msg.user,
          channelId: msg.channel,
          threadTs: msg.thread_ts,
          taskId,
          tenantId: undefined,
          team: undefined,
        },
      });
      log.info({ taskId, userId: msg.user }, 'Interaction event sent from thread reply');
    } catch (err) {
      log.error({ taskId, err }, 'Failed to send feedback event');
    }
  });

  boltApp.event('app_mention', async ({ event, client }) => {
    const mention = event as {
      text: string;
      user: string;
      channel: string;
      thread_ts?: string;
      ts: string;
      team?: string;
      bot_id?: string;
    };

    log.info(
      { channel: mention.channel, user: mention.user, hasBotId: !!mention.bot_id },
      'app_mention event received',
    );

    if (mention.bot_id) return;

    if (mention.channel.startsWith('D')) return;

    // Dedup: skip duplicate app_mention events (Slack Socket Mode at-least-once delivery)
    const dedupKey = `${mention.ts}:${mention.channel}`;
    const now = Date.now();
    if (
      recentMentions.has(dedupKey) &&
      now - recentMentions.get(dedupKey)! < MENTION_DEDUP_TTL_MS
    ) {
      log.info(
        { ts: mention.ts, channel: mention.channel },
        'Duplicate app_mention suppressed — skipping',
      );
      return;
    }
    recentMentions.set(dedupKey, now);
    // Lazy cleanup: evict expired entries to prevent unbounded growth
    for (const [key, timestamp] of recentMentions) {
      if (now - timestamp > MENTION_DEDUP_TTL_MS) recentMentions.delete(key);
    }

    const text = mention.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (mention.thread_ts && mention.thread_ts !== mention.ts) {
      const pending = pendingInputCollections.get(mention.thread_ts);
      if (pending) {
        pendingInputCollections.delete(mention.thread_ts);
        try {
          await inngest.send({
            name: 'employee/trigger.input-received',
            data: {
              threadTs: mention.thread_ts,
              text,
              tenantId: pending.tenantId,
              pending,
            },
          });
          log.info(
            { threadTs: mention.thread_ts, tenantId: pending.tenantId, userId: mention.user },
            'Input-received event sent from app_mention (thread reply with @mention)',
          );
        } catch (err) {
          log.error(
            { threadTs: mention.thread_ts, err },
            'Failed to send trigger.input-received from app_mention',
          );
        }
        return;
      }
    }

    let ackTs: string | undefined;
    try {
      const ackResult = await client.chat.postMessage({
        channel: mention.channel,
        thread_ts: mention.thread_ts ?? mention.ts,
        text: 'On it — one moment…',
      });
      ackTs = typeof ackResult.ts === 'string' ? ackResult.ts : undefined;
    } catch (ackErr) {
      log.warn({ err: ackErr }, 'Failed to post app_mention ack — continuing without ack');
    }

    let tenantId: string | null = null;
    if (mention.team) {
      try {
        const prisma = new PrismaClient();
        const integrationRepo = new TenantIntegrationRepository(prisma);
        const integration = await integrationRepo.findByExternalId('slack', mention.team);
        tenantId = integration?.tenant_id ?? null;
        await prisma.$disconnect();
      } catch (err) {
        log.warn({ team: mention.team, err }, 'Failed to resolve tenant from Slack team ID');
      }
    }

    const taskId = mention.thread_ts ? await findTaskIdByThreadTs(mention.thread_ts) : null;

    if (tenantId) {
      try {
        const resolution = await resolveArchetypeFromChannel(mention.channel, tenantId);
        if (!resolution.archetype) {
          const declineText =
            "I don't have any employees assigned to this channel. An admin can assign one in the dashboard.";
          if (ackTs) {
            try {
              await client.chat.update({
                channel: mention.channel,
                ts: ackTs,
                text: declineText,
              });
            } catch (updateErr) {
              log.warn(
                { err: updateErr },
                'Failed to update ack with decline — posting separately',
              );
              try {
                await client.chat.postMessage({
                  channel: mention.channel,
                  thread_ts: mention.thread_ts ?? mention.ts,
                  text: declineText,
                });
              } catch (postErr) {
                log.warn({ err: postErr }, 'Failed to post decline fallback');
              }
            }
          } else {
            try {
              await client.chat.postMessage({
                channel: mention.channel,
                thread_ts: mention.thread_ts ?? mention.ts,
                text: declineText,
              });
            } catch (postErr) {
              log.warn({ err: postErr }, 'Failed to post decline message');
            }
          }
          log.info(
            { channel: mention.channel, tenantId },
            'No archetype for channel — declined at gateway',
          );
          return;
        }
      } catch (resolveErr) {
        log.warn({ err: resolveErr }, 'Failed to check channel assignment — forwarding to Inngest');
      }
    }

    try {
      await inngest.send({
        name: 'employee/interaction.received',
        data: {
          source: 'mention' as const,
          text,
          userId: mention.user,
          channelId: mention.channel,
          threadTs: mention.thread_ts,
          messageTs: mention.ts,
          taskId: taskId ?? undefined,
          tenantId,
          team: mention.team,
        },
      });
      log.info({ userId: mention.user, tenantId }, 'Interaction event sent from mention');
    } catch (err) {
      log.error({ err }, 'Failed to send mention event');
    }
  });
}
