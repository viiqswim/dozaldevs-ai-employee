import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { MentionHandler } from '../../../src/gateway/services/mention-handler.js';

vi.mock('../../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn(),
}));

import { callLLM } from '../../../src/lib/call-llm.js';

function makePrisma(overrides: Partial<PrismaClient> = {}): PrismaClient {
  return {
    feedback: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

describe('MentionHandler', () => {
  let prisma: PrismaClient;
  let handler: MentionHandler;

  const baseInput = {
    text: 'Great job on the summary!',
    userId: 'U123456',
    channelId: 'C123456',
    tenantId: '00000000-0000-0000-0000-000000000002',
  };

  beforeEach(() => {
    prisma = makePrisma();
    handler = new MentionHandler(prisma);
    vi.clearAllMocks();
  });

  describe('classifyIntent', () => {
    it('returns feedback when LLM responds with feedback', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'feedback', usage: {} } as never);
      const intent = await handler.classifyIntent('Great work!');
      expect(intent).toBe('feedback');
    });

    it('returns teaching when LLM responds with teaching', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'teaching', usage: {} } as never);
      const intent = await handler.classifyIntent('Next time use bullet points');
      expect(intent).toBe('teaching');
    });

    it('returns question when LLM responds with question', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'question', usage: {} } as never);
      const intent = await handler.classifyIntent('What channels do you read?');
      expect(intent).toBe('question');
    });

    it('returns task when LLM responds with task', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'task', usage: {} } as never);
      const intent = await handler.classifyIntent('Please generate a summary now');
      expect(intent).toBe('task');
    });

    it('falls back to question for unrecognized LLM response', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'unknown_intent', usage: {} } as never);
      const intent = await handler.classifyIntent('some text');
      expect(intent).toBe('question');
    });

    it('trims and lowercases LLM response', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: '  FEEDBACK  ', usage: {} } as never);
      const intent = await handler.classifyIntent('some text');
      expect(intent).toBe('feedback');
    });

    it('uses claude-haiku-4-5 model for classification', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'question', usage: {} } as never);
      await handler.classifyIntent('some text');
      expect(callLLM).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'anthropic/claude-haiku-4-5' }),
      );
    });
  });

  describe('handle', () => {
    it('stores feedback record when intent is feedback', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'feedback', usage: {} } as never);

      const result = await handler.handle(baseInput);

      expect(result.intent).toBe('feedback');
      expect(result.stored).toBe(true);
      expect(prisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            feedback_type: 'mention_feedback',
            correction_reason: baseInput.text,
            created_by: baseInput.userId,
            tenant_id: baseInput.tenantId,
          }),
        }),
      );
    });

    it('stores feedback record when intent is teaching', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'teaching', usage: {} } as never);

      const result = await handler.handle(baseInput);

      expect(result.intent).toBe('teaching');
      expect(result.stored).toBe(true);
      expect(prisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ feedback_type: 'teaching' }),
        }),
      );
    });

    it('does NOT store feedback when intent is question', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'question', usage: {} } as never);

      const result = await handler.handle(baseInput);

      expect(result.intent).toBe('question');
      expect(result.stored).toBe(false);
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('does NOT store feedback when intent is task', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'task', usage: {} } as never);

      const result = await handler.handle(baseInput);

      expect(result.intent).toBe('task');
      expect(result.stored).toBe(false);
      expect(prisma.feedback.create).not.toHaveBeenCalled();
    });

    it('uses system tenant ID when tenantId is null', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'feedback', usage: {} } as never);

      await handler.handle({ ...baseInput, tenantId: null });

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.tenant_id).toBe('00000000-0000-0000-0000-000000000002');
    });

    it('sets original_decision and corrected_decision to JsonNull', async () => {
      vi.mocked(callLLM).mockResolvedValue({ content: 'feedback', usage: {} } as never);

      await handler.handle(baseInput);

      const call = vi.mocked(prisma.feedback.create).mock.calls[0][0];
      expect(call.data.original_decision).toBe(Prisma.JsonNull);
      expect(call.data.corrected_decision).toBe(Prisma.JsonNull);
    });
  });
});
