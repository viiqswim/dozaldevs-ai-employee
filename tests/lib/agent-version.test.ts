import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeVersionHash, ensureAgentVersion } from '../../src/lib/agent-version.js';
import type { PrismaClient } from '@prisma/client';

describe('agent-version', () => {
  describe('computeVersionHash', () => {
    it('produces deterministic hashes for identical inputs', () => {
      const input = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 5000, retries: 3 },
      };

      const hash1 = computeVersionHash(input);
      const hash2 = computeVersionHash(input);

      expect(hash1.promptHash).toBe(hash2.promptHash);
      expect(hash1.toolConfigHash).toBe(hash2.toolConfigHash);
      expect(hash1.modelId).toBe(hash2.modelId);
    });

    it('produces identical hashes regardless of toolConfig key order', () => {
      const input1 = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { b: 1, a: 2 },
      };

      const input2 = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { a: 2, b: 1 },
      };

      const hash1 = computeVersionHash(input1);
      const hash2 = computeVersionHash(input2);

      expect(hash1.toolConfigHash).toBe(hash2.toolConfigHash);
    });

    it('produces different hashes for different promptTemplate', () => {
      const input1 = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 5000 },
      };

      const input2 = {
        promptTemplate: 'You are a harmful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 5000 },
      };

      const hash1 = computeVersionHash(input1);
      const hash2 = computeVersionHash(input2);

      expect(hash1.promptHash).not.toBe(hash2.promptHash);
    });

    it('produces different hashes for different toolConfig', () => {
      const input1 = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 5000 },
      };

      const input2 = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 10000 },
      };

      const hash1 = computeVersionHash(input1);
      const hash2 = computeVersionHash(input2);

      expect(hash1.toolConfigHash).not.toBe(hash2.toolConfigHash);
    });

    it('passes through modelId without hashing', () => {
      const input = {
        promptTemplate: 'You are a helpful assistant.',
        modelId: 'minimax-m2.7',
        toolConfig: { timeout: 5000 },
      };

      const hash = computeVersionHash(input);

      expect(hash.modelId).toBe('minimax-m2.7');
    });
  });

  describe('ensureAgentVersion', () => {
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        agentVersion: {
          findFirst: vi.fn(),
          create: vi.fn(),
        },
      };
    });

    it('returns existing record ID when found', async () => {
      const existingId = '00000000-0000-0000-0000-000000000001';
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValue({
        id: existingId,
        prompt_hash: 'abc123',
        model_id: 'minimax-m2.7',
        tool_config_hash: 'def456',
      });

      const result = await ensureAgentVersion(mockPrisma, {
        promptHash: 'abc123',
        modelId: 'minimax-m2.7',
        toolConfigHash: 'def456',
      });

      expect(result).toBe(existingId);
      expect(mockPrisma.agentVersion!.create).not.toHaveBeenCalled();
    });

    it('creates new record when not found', async () => {
      const newId = '00000000-0000-0000-0000-000000000002';
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValue(null);
      (mockPrisma.agentVersion!.create as any).mockResolvedValue({
        id: newId,
        prompt_hash: 'abc123',
        model_id: 'minimax-m2.7',
        tool_config_hash: 'def456',
        is_active: true,
      });

      const result = await ensureAgentVersion(mockPrisma, {
        promptHash: 'abc123',
        modelId: 'minimax-m2.7',
        toolConfigHash: 'def456',
      });

      expect(result).toBe(newId);
      expect(mockPrisma.agentVersion!.create).toHaveBeenCalledWith({
        data: {
          prompt_hash: 'abc123',
          model_id: 'minimax-m2.7',
          tool_config_hash: 'def456',
          changelog_note: undefined,
          is_active: true,
        },
      });
    });

    it('includes changelogNote when provided', async () => {
      const newId = '00000000-0000-0000-0000-000000000002';
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValue(null);
      (mockPrisma.agentVersion!.create as any).mockResolvedValue({
        id: newId,
        prompt_hash: 'abc123',
        model_id: 'minimax-m2.7',
        tool_config_hash: 'def456',
        changelog_note: 'Updated prompt for better accuracy',
        is_active: true,
      });

      await ensureAgentVersion(mockPrisma as PrismaClient, {
        promptHash: 'abc123',
        modelId: 'minimax-m2.7',
        toolConfigHash: 'def456',
        changelogNote: 'Updated prompt for better accuracy',
      });

      expect(mockPrisma.agentVersion!.create).toHaveBeenCalledWith({
        data: {
          prompt_hash: 'abc123',
          model_id: 'minimax-m2.7',
          tool_config_hash: 'def456',
          changelog_note: 'Updated prompt for better accuracy',
          is_active: true,
        },
      });
    });

    it('does not create duplicate on repeated calls with same params', async () => {
      const existingId = '00000000-0000-0000-0000-000000000001';

      // First call: not found, creates new
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValueOnce(null);
      (mockPrisma.agentVersion!.create as any).mockResolvedValueOnce({
        id: existingId,
        prompt_hash: 'abc123',
        model_id: 'minimax-m2.7',
        tool_config_hash: 'def456',
      });

      const result1 = await ensureAgentVersion(mockPrisma as PrismaClient, {
        promptHash: 'abc123',
        modelId: 'minimax-m2.7',
        toolConfigHash: 'def456',
      });

      // Second call: found existing
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValueOnce({
        id: existingId,
        prompt_hash: 'abc123',
        model_id: 'minimax-m2.7',
        tool_config_hash: 'def456',
      });

      const result2 = await ensureAgentVersion(mockPrisma as PrismaClient, {
        promptHash: 'abc123',
        modelId: 'minimax-m2.7',
        toolConfigHash: 'def456',
      });

      expect(result1).toBe(existingId);
      expect(result2).toBe(existingId);
      expect(mockPrisma.agentVersion!.create).toHaveBeenCalledTimes(1);
    });

    it('queries with correct where clause', async () => {
      (mockPrisma.agentVersion!.findFirst as any).mockResolvedValue(null);
      (mockPrisma.agentVersion!.create as any).mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000002',
      });

      await ensureAgentVersion(mockPrisma as PrismaClient, {
        promptHash: 'hash1',
        modelId: 'model1',
        toolConfigHash: 'hash2',
      });

      expect(mockPrisma.agentVersion!.findFirst).toHaveBeenCalledWith({
        where: {
          prompt_hash: 'hash1',
          model_id: 'model1',
          tool_config_hash: 'hash2',
        },
      });
    });
  });
});
