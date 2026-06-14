import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { createLogger } from '../../../lib/logger.js';
import type { PrismaClient } from '@prisma/client';
import { TenantIntegrationRepository } from '../../services/tenant-integration-repository.js';
import { resolveEmployeesAcrossTenants } from '../../../lib/interaction-classifier.js';
import { routeToEmployee, prettifyRoleName } from '../../../inngest/slack-trigger-handler.js';
import { callLLM } from '../../../lib/call-llm.js';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import {
  pendingInputCollections,
  recentMentions,
  MENTION_DEDUP_TTL_MS,
  findTaskIdByThreadTs,
} from './shared.js';

const log = createLogger('slack-handlers');

export function registerEventHandlers(
  boltApp: App,
  inngest: InngestLike,
  prisma: PrismaClient,
): void {
  const integrationRepo = new TenantIntegrationRepository(prisma);

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

    if (mention.bot_id) {
      log.info({ channel: mention.channel }, 'Ignoring app_mention from bot');
      return;
    }

    if (mention.channel.startsWith('D')) {
      log.info({ channel: mention.channel }, 'Ignoring app_mention in DM channel');
      return;
    }

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

    if (!mention.team) {
      const taskId = mention.thread_ts ? await findTaskIdByThreadTs(mention.thread_ts) : null;
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
            tenantId: null,
            team: undefined,
          },
        });
        log.info({ userId: mention.user }, 'Interaction event sent from mention (no team)');
      } catch (err) {
        log.error({ err }, 'Failed to send mention event (no team)');
      }
      return;
    }

    let integrations: Array<{ tenant_id: string }> = [];
    try {
      integrations = await integrationRepo.findManyByExternalId('slack', mention.team);
    } catch (err) {
      log.warn({ team: mention.team, err }, 'Failed to resolve tenants from Slack team ID');
    }

    const tenantIds = integrations.map((i) => i.tenant_id);

    let candidates: Array<{
      archetype: { id: string; role_name: string; notification_channel: string | null };
      tenantId: string;
    }> = [];
    try {
      candidates = await resolveEmployeesAcrossTenants(mention.channel, tenantIds);
    } catch (err) {
      log.warn(
        { channel: mention.channel, tenantIds, err },
        'Failed to resolve employees across tenants',
      );
    }

    if (candidates.length === 0) {
      const declineText =
        "I don't have any employees assigned to this channel. An admin can assign one in the dashboard.";
      await updateOrPost(
        client,
        mention.channel,
        mention.thread_ts ?? mention.ts,
        ackTs,
        declineText,
      );
      log.info({ channel: mention.channel, tenantIds }, 'No candidates for channel — declined');
      return;
    }

    const taskId = mention.thread_ts ? await findTaskIdByThreadTs(mention.thread_ts) : null;

    if (candidates.length === 1) {
      const winner = candidates[0];
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
            tenantId: winner.tenantId,
            team: mention.team,
          },
        });
        log.info(
          { userId: mention.user, tenantId: winner.tenantId },
          'Interaction event sent from mention (single candidate)',
        );
      } catch (err) {
        log.error({ err }, 'Failed to send mention event (single candidate)');
      }
      return;
    }

    const archetypes = candidates.map((c) => c.archetype);
    let routed: { archetype: { id: string; role_name: string }; confidence: number } | null = null;
    try {
      routed = await routeToEmployee(text, archetypes, callLLM);
    } catch (err) {
      log.warn({ err }, 'routeToEmployee failed — falling back to disambiguation');
    }

    if (routed !== null) {
      const winner = candidates.find((c) => c.archetype.id === routed!.archetype.id);
      const winnerTenantId = winner?.tenantId ?? candidates[0].tenantId;
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
            tenantId: winnerTenantId,
            team: mention.team,
          },
        });
        log.info(
          { userId: mention.user, tenantId: winnerTenantId, confidence: routed.confidence },
          'Interaction event sent from mention (LLM routed)',
        );
      } catch (err) {
        log.error({ err }, 'Failed to send mention event (LLM routed)');
      }
      return;
    }

    const capped = candidates.slice(0, 5);
    const buttons = capped.map((c, index) => {
      const employeeName = prettifyRoleName(c.archetype.role_name);
      const value = JSON.stringify({
        archetypeId: c.archetype.id,
        tenantId: c.tenantId,
        userId: mention.user,
        channelId: mention.channel,
        threadTs: mention.thread_ts ?? mention.ts,
        text,
      });
      return {
        type: 'button' as const,
        text: { type: 'plain_text' as const, text: employeeName, emoji: true },
        action_id: `${SLACK_ACTION_ID.TRIGGER_DISAMBIGUATE}_${index}`,
        value,
      };
    });

    const disambigBlocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Multiple employees could handle this. Which one should I use?',
        },
      },
      {
        type: 'actions',
        elements: buttons,
      },
    ];

    try {
      if (ackTs) {
        await client.chat.update({
          channel: mention.channel,
          ts: ackTs,
          text: 'Multiple employees could handle this. Which one should I use?',
          blocks: disambigBlocks,
        });
      } else {
        await client.chat.postMessage({
          channel: mention.channel,
          thread_ts: mention.thread_ts ?? mention.ts,
          text: 'Multiple employees could handle this. Which one should I use?',
          blocks: disambigBlocks,
        });
      }
      log.info(
        { channel: mention.channel, candidateCount: candidates.length, capped: capped.length },
        'Disambiguation card posted',
      );
    } catch (err) {
      log.warn({ err }, 'Failed to post disambiguation card');
    }
  });
}

type SlackChatClient = {
  chat: {
    update: (args: { channel: string; ts: string; text: string }) => Promise<unknown>;
    postMessage: (args: { channel: string; thread_ts: string; text: string }) => Promise<unknown>;
  };
};

async function updateOrPost(
  client: SlackChatClient,
  channel: string,
  threadTs: string,
  ackTs: string | undefined,
  text: string,
): Promise<void> {
  const log = createLogger('slack-handlers');
  if (ackTs) {
    try {
      await client.chat.update({ channel, ts: ackTs, text });
      return;
    } catch (updateErr) {
      log.warn({ err: updateErr }, 'Failed to update ack — posting separately');
    }
  }
  try {
    await client.chat.postMessage({ channel, thread_ts: threadTs, text });
  } catch (postErr) {
    log.warn({ err: postErr }, 'Failed to post message');
  }
}
