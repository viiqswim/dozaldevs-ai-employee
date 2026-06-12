import type { App } from '@slack/bolt';
import type { InngestLike } from '../../types.js';
import { createLogger } from '../../../lib/logger.js';
import type { PrismaClient } from '@prisma/client';
import { SLACK_ACTION_ID } from '../../../lib/slack-action-ids.js';
import { extractInputsFromText } from '../../../lib/extract-inputs.js';
import { callLLM } from '../../../lib/call-llm.js';
import {
  loadingMessage,
  successMessage,
  failureMessage,
  missingInfoMessage,
} from '../../../lib/slack-copy.js';
import { dispatchEmployeeById } from '../../services/employee-dispatcher.js';
import { type ActionBody, type PendingInputCollection, pendingInputCollections } from './shared.js';

const log = createLogger('slack-handlers');

export function registerTriggerHandlers(
  boltApp: App,
  inngest: InngestLike,
  prisma: PrismaClient,
): void {
  boltApp.action(SLACK_ACTION_ID.TRIGGER_CONFIRM, async ({ ack, body, respond, client }) => {
    const actionBody = body as ActionBody;
    const valueStr = actionBody.actions[0]?.value;
    const user = actionBody.user;

    if (!valueStr) {
      await ack();
      log.warn('trigger_confirm action received without value');
      return;
    }

    let ctx: {
      archetypeId: string;
      tenantId: string;
      userId: string;
      channelId: string;
      threadTs: string;
      text: string;
      extractedInputs?: Record<string, string>;
    };
    try {
      ctx = JSON.parse(valueStr) as typeof ctx;
    } catch {
      await ack();
      log.warn({ valueStr }, 'trigger_confirm: failed to parse button value as JSON');
      return;
    }

    await ack();
    await new Promise<void>((resolve) => setImmediate(resolve));

    log.info(
      { archetypeId: ctx.archetypeId, tenantId: ctx.tenantId, userId: user.id },
      'trigger_confirm action received — dispatching task',
    );

    const loadingText = loadingMessage('your request');
    try {
      await respond({
        replace_original: true,
        text: loadingText,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: loadingText } }],
      });
    } catch (err) {
      log.warn(
        { archetypeId: ctx.archetypeId, err },
        'Failed to show pending feedback on trigger_confirm',
      );
    }

    let dispatched = false;

    try {
      const archetype = await prisma.archetype.findFirst({
        where: {
          id: ctx.archetypeId,
          tenant_id: ctx.tenantId,
          status: 'active',
          deleted_at: null,
        },
        select: { id: true, role_name: true, input_schema: true },
      });

      if (!archetype) {
        throw new Error(`Archetype not found or inactive: ${ctx.archetypeId}`);
      }

      const roleName = archetype.role_name ?? archetype.id;
      const externalId = `slack-trigger-${ctx.threadTs}-${ctx.archetypeId}`;

      const requiredInputs = Array.isArray(archetype.input_schema)
        ? (
            archetype.input_schema as Array<{
              key: string;
              label: string;
              description?: string;
              required?: boolean;
              frequency?: string;
              type?: string;
              options?: string[];
            }>
          )
            .filter(
              (item) =>
                item.required === true &&
                (item.frequency === 'every_run' || item.frequency === undefined),
            )
            .map((item) => ({
              key: item.key,
              label: item.label,
              description: item.description,
              type: item.type,
              options: item.options,
            }))
        : [];

      const preExtracted = ctx.extractedInputs;
      const extractedInputs =
        requiredInputs.length > 0
          ? preExtracted && Object.keys(preExtracted).length > 0
            ? preExtracted
            : await extractInputsFromText(ctx.text, requiredInputs, callLLM)
          : {};

      const missingInputs = requiredInputs.filter((inp) => !(inp.key in extractedInputs));
      const allFound = requiredInputs.length > 0 && missingInputs.length === 0;
      const someFound = Object.keys(extractedInputs).length > 0 && missingInputs.length > 0;

      if (allFound) {
        const confirmText = loadingMessage(roleName);

        await client.chat.postMessage({
          channel: ctx.channelId,
          ...(ctx.threadTs ? { thread_ts: ctx.threadTs } : {}),
          text: confirmText,
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: confirmText } }],
        });

        const dispatchResult = await dispatchEmployeeById({
          archetypeId: archetype.id,
          tenantId: ctx.tenantId,
          externalId,
          sourceSystem: 'slack',
          prisma,
          inngest,
          inputs: { prompt: ctx.text, ...extractedInputs },
        });

        if (dispatchResult.kind === 'error') throw new Error(dispatchResult.message);

        const { taskId } = dispatchResult;
        dispatched = true;

        if (dispatchResult.kind === 'idempotent') {
          log.info(
            { taskId, externalId, tenantId: ctx.tenantId },
            'Reusing existing task for duplicate trigger_confirm (idempotent)',
          );
        }

        log.info(
          { taskId, archetypeId: archetype.id, tenantId: ctx.tenantId, extractedInputs },
          'Task dispatched from trigger_confirm with extracted inputs',
        );

        const successText = successMessage(roleName, user.id);
        try {
          await respond({
            replace_original: true,
            text: successText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: successText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
              },
            ],
          });
        } catch (err) {
          log.warn(
            { archetypeId: ctx.archetypeId, err },
            'Failed to show pending feedback on trigger_confirm',
          );
        }
        return;
      } else if (someFound || requiredInputs.length > 0) {
        const inputsToAsk = someFound ? missingInputs : requiredInputs;
        const inputList = inputsToAsk
          .map(
            (item, i) =>
              `${i + 1}. *${item.label}*${item.description ? ` — ${item.description}` : ''}`,
          )
          .join('\n');

        const pendingData: PendingInputCollection = {
          archetypeId: archetype.id,
          tenantId: ctx.tenantId,
          userId: user.id,
          channelId: ctx.channelId,
          text: ctx.text,
          roleName,
          requiredInputs,
          extractedInputs: someFound ? extractedInputs : undefined,
        };

        if (ctx.threadTs) {
          pendingInputCollections.set(ctx.threadTs, pendingData);
        }

        const missingInfoText = missingInfoMessage(roleName, inputList);
        const inputMsgResult = await client.chat.postMessage({
          channel: ctx.channelId,
          ...(ctx.threadTs ? { thread_ts: ctx.threadTs } : {}),
          text: missingInfoText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: missingInfoText },
            },
          ],
        });

        const pendingKey = ctx.threadTs ?? (inputMsgResult.ts as string | undefined);

        if (!ctx.threadTs) {
          pendingInputCollections.set(pendingKey, pendingData);
        }

        const waitingText = loadingMessage(roleName);
        await respond({
          replace_original: true,
          text: waitingText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: waitingText },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Archetype \`${ctx.archetypeId}\`` }],
            },
          ],
        });

        log.info(
          {
            archetypeId: archetype.id,
            tenantId: ctx.tenantId,
            pendingKey,
            someFound,
            extractedCount: Object.keys(extractedInputs).length,
          },
          'Waiting for inputs in thread before dispatching task',
        );
        return;
      }

      const dispatchResult = await dispatchEmployeeById({
        archetypeId: archetype.id,
        tenantId: ctx.tenantId,
        externalId,
        sourceSystem: 'slack',
        prisma,
        inngest,
        inputs: { prompt: ctx.text },
      });

      if (dispatchResult.kind === 'error') throw new Error(dispatchResult.message);

      const { taskId } = dispatchResult;
      dispatched = true;

      log.info(
        { taskId, archetypeId: archetype.id, tenantId: ctx.tenantId, userId: user.id },
        'Task dispatched from Slack trigger confirmation',
      );

      const successText = successMessage(roleName, user.id);
      try {
        await respond({
          replace_original: true,
          text: successText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: successText },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
            },
          ],
        });
      } catch (err) {
        log.warn(
          { archetypeId: ctx.archetypeId, err },
          'Failed to show pending feedback on trigger_confirm',
        );
      }
    } catch (err) {
      log.error(
        { archetypeId: ctx.archetypeId, err },
        'Failed to dispatch task from trigger_confirm',
      );
      if (!dispatched) {
        const failText = failureMessage();
        try {
          await respond({
            replace_original: true,
            text: failText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: failText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Archetype \`${ctx.archetypeId}\`` }],
              },
            ],
          });
        } catch (respondErr) {
          log.warn({ err: respondErr }, 'Failed to update message after trigger_confirm failure');
        }
      } else {
        log.warn(
          { archetypeId: ctx.archetypeId, err },
          'trigger_confirm: post-dispatch error after successful dispatch (suppressed false-failure message)',
        );
      }
    }
  });

  boltApp.action(/^trigger_disambiguate/, async ({ ack, body, respond }) => {
    const actionBody = body as ActionBody;
    const valueStr = actionBody.actions[0]?.value;
    const user = actionBody.user;

    if (!valueStr) {
      await ack();
      log.warn('trigger_disambiguate action received without value');
      return;
    }

    let ctx: {
      archetypeId: string;
      tenantId: string;
      userId: string;
      channelId: string;
      threadTs: string;
      text: string;
      extractedInputs?: Record<string, string>;
    };
    try {
      ctx = JSON.parse(valueStr) as typeof ctx;
    } catch {
      await ack();
      log.warn({ valueStr }, 'trigger_disambiguate: failed to parse button value as JSON');
      return;
    }

    await ack();
    await new Promise<void>((resolve) => setImmediate(resolve));

    log.info(
      { archetypeId: ctx.archetypeId, tenantId: ctx.tenantId, userId: user.id },
      'trigger_disambiguate action received — dispatching task',
    );

    const loadingText = loadingMessage('your request');
    try {
      await respond({
        replace_original: true,
        text: loadingText,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: loadingText } }],
      });
    } catch (err) {
      log.warn(
        { archetypeId: ctx.archetypeId, err },
        'Failed to show pending feedback on trigger_disambiguate',
      );
    }

    let dispatched = false;

    try {
      const archetype = await prisma.archetype.findFirst({
        where: {
          id: ctx.archetypeId,
          tenant_id: ctx.tenantId,
          status: 'active',
          deleted_at: null,
        },
        select: { id: true, role_name: true, input_schema: true },
      });

      if (!archetype) {
        throw new Error(`Archetype not found or inactive: ${ctx.archetypeId}`);
      }

      const roleName = archetype.role_name ?? archetype.id;
      const externalId = `slack-trigger-${ctx.threadTs}-${ctx.archetypeId}`;

      const dispatchResult = await dispatchEmployeeById({
        archetypeId: archetype.id,
        tenantId: ctx.tenantId,
        externalId,
        sourceSystem: 'slack',
        prisma,
        inngest,
        inputs: { prompt: ctx.text },
      });

      if (dispatchResult.kind === 'error') throw new Error(dispatchResult.message);

      const { taskId } = dispatchResult;
      dispatched = true;

      log.info(
        { taskId, archetypeId: archetype.id, tenantId: ctx.tenantId, userId: user.id },
        'Task dispatched from Slack disambiguation',
      );

      const successText = successMessage(roleName, user.id);
      try {
        await respond({
          replace_original: true,
          text: successText,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: successText },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
            },
          ],
        });
      } catch (err) {
        log.warn(
          { archetypeId: ctx.archetypeId, err },
          'Failed to show success feedback on trigger_disambiguate',
        );
      }
    } catch (err) {
      log.error(
        { archetypeId: ctx.archetypeId, err },
        'Failed to dispatch task from trigger_disambiguate',
      );
      if (!dispatched) {
        const failText = failureMessage();
        try {
          await respond({
            replace_original: true,
            text: failText,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: failText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Archetype \`${ctx.archetypeId}\`` }],
              },
            ],
          });
        } catch (respondErr) {
          log.warn(
            { err: respondErr },
            'Failed to update message after trigger_disambiguate failure',
          );
        }
      }
    }
  });

  boltApp.action(SLACK_ACTION_ID.TRIGGER_CANCEL, async ({ ack, body, respond }) => {
    await ack();

    const actionBody = body as ActionBody;
    const valueStr = actionBody.actions[0]?.value;
    const user = actionBody.user;

    let archetypeId = '';
    if (valueStr) {
      try {
        const ctx = JSON.parse(valueStr) as { archetypeId?: string };
        archetypeId = ctx.archetypeId ?? '';
      } catch {
        archetypeId = '';
      }
    }

    log.info({ userId: user.id, archetypeId }, 'trigger_cancel action received');

    try {
      await respond({
        replace_original: true,
        text: `🚫 Cancelled by <@${user.id}>`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `🚫 Cancelled by <@${user.id}>` },
          },
          ...(archetypeId
            ? [
                {
                  type: 'context' as const,
                  elements: [{ type: 'mrkdwn' as const, text: `Archetype \`${archetypeId}\`` }],
                },
              ]
            : []),
        ],
      });
    } catch (err) {
      log.warn(
        { userId: user.id, archetypeId, err },
        'Failed to update message after trigger_cancel',
      );
    }
  });
}
