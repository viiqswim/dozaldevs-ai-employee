import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmployeeRuleRepository } from '../../../src/repositories/employee-rule-repository.js';

function makePrisma() {
  return {
    employeeRule: {
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

const baseRule = {
  id: 'rule-1',
  tenant_id: 'tenant-1',
  archetype_id: 'arch-1',
  rule_text: 'Always greet guests warmly',
  source: 'extraction',
  status: 'pending',
  source_task_id: null,
  parent_rule_ids: [],
  slack_ts: null,
  slack_channel: null,
  created_at: new Date(),
  confirmed_at: null,
  deleted_at: null,
};

describe('EmployeeRuleRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: EmployeeRuleRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new EmployeeRuleRepository(prisma as never);
  });

  describe('get', () => {
    it('returns rule when found', async () => {
      prisma.employeeRule.findFirst.mockResolvedValue(baseRule);

      const result = await repo.get('rule-1');

      expect(prisma.employeeRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
      expect(result).toBe(baseRule);
    });

    it('returns null when not found', async () => {
      prisma.employeeRule.findFirst.mockResolvedValue(null);
      expect(await repo.get('missing')).toBeNull();
    });
  });

  describe('countConfirmed', () => {
    it('returns count of confirmed rules for archetype', async () => {
      prisma.employeeRule.count.mockResolvedValue(7);

      const result = await repo.countConfirmed('arch-1');

      expect(prisma.employeeRule.count).toHaveBeenCalledWith({
        where: { archetype_id: 'arch-1', status: 'confirmed' },
      });
      expect(result).toBe(7);
    });

    it('returns 0 when no confirmed rules', async () => {
      prisma.employeeRule.count.mockResolvedValue(0);
      expect(await repo.countConfirmed('arch-empty')).toBe(0);
    });
  });

  describe('patchConfirm', () => {
    it('sets status to confirmed and confirmed_at', async () => {
      const confirmed = { ...baseRule, status: 'confirmed', confirmed_at: new Date() };
      prisma.employeeRule.update.mockResolvedValue(confirmed);

      const result = await repo.patchConfirm('rule-1', 'user-123');

      expect(prisma.employeeRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { status: 'confirmed', confirmed_at: expect.any(Date) },
      });
      expect(result.status).toBe('confirmed');
    });
  });

  describe('patchReject', () => {
    it('sets status to rejected', async () => {
      const rejected = { ...baseRule, status: 'rejected' };
      prisma.employeeRule.update.mockResolvedValue(rejected);

      const result = await repo.patchReject('rule-1');

      expect(prisma.employeeRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { status: 'rejected' },
      });
      expect(result.status).toBe('rejected');
    });
  });

  describe('patchArchive', () => {
    it('sets status to archived', async () => {
      const archived = { ...baseRule, status: 'archived' };
      prisma.employeeRule.update.mockResolvedValue(archived);

      const result = await repo.patchArchive('rule-1');

      expect(prisma.employeeRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { status: 'archived' },
      });
      expect(result.status).toBe('archived');
    });
  });

  describe('patchRephrase', () => {
    it('updates rule_text', async () => {
      const rephrased = { ...baseRule, rule_text: 'Updated rule text' };
      prisma.employeeRule.update.mockResolvedValue(rephrased);

      const result = await repo.patchRephrase('rule-1', 'Updated rule text');

      expect(prisma.employeeRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { rule_text: 'Updated rule text' },
      });
      expect(result.rule_text).toBe('Updated rule text');
    });
  });
});
