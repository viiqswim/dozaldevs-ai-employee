import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ArchetypeGenerationCallRepository,
  type RecordInput,
} from '../../../src/repositories/ArchetypeGenerationCallRepository.js';

function makePrisma() {
  return {
    archetypeGenerationCall: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };
}

const baseInput: RecordInput = {
  tenant_id: 'tenant-1',
  archetype_id: 'arch-1',
  call_type: 'generate',
  model_requested: 'minimax/minimax-m2.7',
  model_actual: 'deepseek/deepseek-v4-flash',
  prompt: 'generate an employee that greets guests',
  response: '{"role_name":"greeter"}',
  prompt_tokens: 12,
  completion_tokens: 34,
  estimated_cost_usd: 0.0021,
  latency_ms: 150,
  retry_count: 0,
  status: 'success',
  created_by: 'user-123',
};

const MAX_SIZE = 262144; // 256KB — matches the cap in the repository under test

describe('ArchetypeGenerationCallRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ArchetypeGenerationCallRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ArchetypeGenerationCallRepository(prisma as never);
  });

  describe('record', () => {
    it('(a) inserts a row with the correct field shape', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-1' });

      const result = await repo.record(baseInput);

      expect(prisma.archetypeGenerationCall.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-1',
          archetype_id: 'arch-1',
          call_type: 'generate',
          model_requested: 'minimax/minimax-m2.7',
          model_actual: 'deepseek/deepseek-v4-flash',
          prompt: 'generate an employee that greets guests',
          response: '{"role_name":"greeter"}',
          prompt_truncated: false,
          response_truncated: false,
          prompt_tokens: 12,
          completion_tokens: 34,
          estimated_cost_usd: 0.0021,
          latency_ms: 150,
          retry_count: 0,
          status: 'success',
          error_message: null,
          created_by: 'user-123',
        },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'call-1' });
    });

    it('defaults retry_count to 0 and nullable fields to null when omitted', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-min' });

      await repo.record({
        tenant_id: 'tenant-1',
        call_type: 'recommend_model',
        status: 'success',
      });

      expect(prisma.archetypeGenerationCall.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          archetype_id: null,
          call_type: 'recommend_model',
          model_requested: null,
          model_actual: null,
          prompt: null,
          response: null,
          prompt_truncated: false,
          response_truncated: false,
          prompt_tokens: null,
          completion_tokens: null,
          estimated_cost_usd: null,
          latency_ms: null,
          retry_count: 0,
          status: 'success',
          error_message: null,
          created_by: null,
        }),
        select: { id: true },
      });
    });

    it('(b) truncates an oversized prompt and sets prompt_truncated=true', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-big' });

      const oversized = 'x'.repeat(300000); // 300KB ASCII — exceeds the 256KB cap

      await repo.record({ ...baseInput, prompt: oversized });

      const callArg = prisma.archetypeGenerationCall.create.mock.calls[0][0] as {
        data: { prompt: string; prompt_truncated: boolean };
      };
      expect(callArg.data.prompt_truncated).toBe(true);
      expect(Buffer.byteLength(callArg.data.prompt, 'utf8')).toBeLessThanOrEqual(MAX_SIZE);
      expect(callArg.data.prompt.length).toBe(MAX_SIZE);
    });

    it('(b) truncates an oversized response and sets response_truncated=true', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-big-resp' });

      const oversized = 'y'.repeat(300000);

      await repo.record({ ...baseInput, response: oversized });

      const callArg = prisma.archetypeGenerationCall.create.mock.calls[0][0] as {
        data: { response: string; response_truncated: boolean };
      };
      expect(callArg.data.response_truncated).toBe(true);
      expect(Buffer.byteLength(callArg.data.response, 'utf8')).toBeLessThanOrEqual(MAX_SIZE);
    });

    it('does not truncate a prompt at exactly the cap boundary', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-edge' });

      const atBoundary = 'z'.repeat(MAX_SIZE); // exactly 262144 ASCII bytes

      await repo.record({ ...baseInput, prompt: atBoundary });

      const callArg = prisma.archetypeGenerationCall.create.mock.calls[0][0] as {
        data: { prompt: string; prompt_truncated: boolean };
      };
      expect(callArg.data.prompt_truncated).toBe(false);
      expect(callArg.data.prompt.length).toBe(MAX_SIZE);
    });

    it('(c) accepts a null archetype_id without error (EDGE-1)', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-no-arch' });

      const result = await repo.record({ ...baseInput, archetype_id: null });

      const callArg = prisma.archetypeGenerationCall.create.mock.calls[0][0] as {
        data: { archetype_id: string | null };
      };
      expect(callArg.data.archetype_id).toBeNull();
      expect(result).toEqual({ id: 'call-no-arch' });
    });

    it('(d) accepts a null created_by without error (EDGE-3)', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-no-user' });

      const result = await repo.record({ ...baseInput, created_by: null });

      const callArg = prisma.archetypeGenerationCall.create.mock.calls[0][0] as {
        data: { created_by: string | null };
      };
      expect(callArg.data.created_by).toBeNull();
      expect(result).toEqual({ id: 'call-no-user' });
    });

    it('persists a failed row with error_message set', async () => {
      prisma.archetypeGenerationCall.create.mockResolvedValue({ id: 'call-failed' });

      await repo.record({
        tenant_id: 'tenant-1',
        call_type: 'generate',
        status: 'failed',
        error_message: 'LLM returned empty content',
      });

      expect(prisma.archetypeGenerationCall.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'failed',
          error_message: 'LLM returned empty content',
        }),
        select: { id: true },
      });
    });

    it('(f) propagates the error when the underlying create throws — caller owns try/catch', async () => {
      prisma.archetypeGenerationCall.create.mockRejectedValue(new Error('db down'));

      await expect(repo.record(baseInput)).rejects.toThrow('db down');
    });
  });

  describe('linkArchetype', () => {
    it('(e) updates archetype_id for the given call id', async () => {
      prisma.archetypeGenerationCall.updateMany.mockResolvedValue({ count: 1 });

      await repo.linkArchetype('call-1', 'arch-99');

      expect(prisma.archetypeGenerationCall.updateMany).toHaveBeenCalledWith({
        where: { id: 'call-1', deleted_at: null },
        data: { archetype_id: 'arch-99' },
      });
    });

    it('propagates the error when updateMany throws — caller owns try/catch', async () => {
      prisma.archetypeGenerationCall.updateMany.mockRejectedValue(new Error('update failed'));

      await expect(repo.linkArchetype('call-1', 'arch-99')).rejects.toThrow('update failed');
    });
  });
});
