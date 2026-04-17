import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { callLLM } from '../../lib/call-llm.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('mention-handler');

export type MentionIntent = 'feedback' | 'teaching' | 'question' | 'task';

export interface MentionInput {
  text: string;
  userId: string;
  channelId: string;
  threadTs?: string;
  tenantId: string | null;
}

export interface MentionResult {
  intent: MentionIntent;
  stored: boolean;
}

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export class MentionHandler {
  constructor(private readonly prisma: PrismaClient) {}

  async classifyIntent(text: string): Promise<MentionIntent> {
    const result = await callLLM({
      model: 'anthropic/claude-haiku-4-5',
      taskType: 'review',
      messages: [
        {
          role: 'system',
          content:
            'Classify the following message into exactly one of these intents: feedback, teaching, question, task. ' +
            'feedback = opinion about past work. teaching = instruction to change future behavior. ' +
            'question = asking for information. task = requesting new work. ' +
            'Respond with only the single word intent.',
        },
        { role: 'user', content: text },
      ],
      maxTokens: 10,
      temperature: 0,
    });
    const raw = result.content.trim().toLowerCase();
    const valid: MentionIntent[] = ['feedback', 'teaching', 'question', 'task'];
    return valid.includes(raw as MentionIntent) ? (raw as MentionIntent) : 'question';
  }

  async handle(data: MentionInput): Promise<MentionResult> {
    const { text, userId, tenantId } = data;
    const resolvedTenantId = tenantId ?? SYSTEM_TENANT_ID;

    const intent = await this.classifyIntent(text);
    log.info({ intent, userId }, 'Mention classified');

    if (intent === 'feedback' || intent === 'teaching') {
      await this.prisma.feedback.create({
        data: {
          feedback_type: intent === 'teaching' ? 'teaching' : 'mention_feedback',
          original_decision: Prisma.JsonNull,
          corrected_decision: Prisma.JsonNull,
          correction_reason: text,
          created_by: userId,
          tenant_id: resolvedTenantId,
        },
      });
      return { intent, stored: true };
    }

    return { intent, stored: false };
  }
}
