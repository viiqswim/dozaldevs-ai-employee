/**
 * Employee-rule data-access repository.
 *
 * Location rationale: Uses Prisma; consumed by `src/gateway/slack/handlers/`
 * for rule confirmation/rejection/archiving flows. Lives in `src/repositories/`
 * to keep gateway handler files free of raw DB logic. Worker containers MUST
 * NOT import this module — they use PostgREST.
 */
import type { PrismaClient, EmployeeRule } from '@prisma/client';

export class EmployeeRuleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(ruleId: string): Promise<EmployeeRule | null> {
    return this.prisma.employeeRule.findFirst({
      where: { id: ruleId },
    });
  }

  async countConfirmed(archetypeId: string): Promise<number> {
    return this.prisma.employeeRule.count({
      where: { archetype_id: archetypeId, status: 'confirmed' },
    });
  }

  async patchConfirm(ruleId: string, _confirmedBy: string): Promise<EmployeeRule> {
    return this.prisma.employeeRule.update({
      where: { id: ruleId },
      data: { status: 'confirmed', confirmed_at: new Date() },
    });
  }

  async patchReject(ruleId: string): Promise<EmployeeRule> {
    return this.prisma.employeeRule.update({
      where: { id: ruleId },
      data: { status: 'rejected' },
    });
  }

  async patchArchive(ruleId: string): Promise<EmployeeRule> {
    return this.prisma.employeeRule.update({
      where: { id: ruleId },
      data: { status: 'archived' },
    });
  }

  async patchRephrase(ruleId: string, newContent: string): Promise<EmployeeRule> {
    return this.prisma.employeeRule.update({
      where: { id: ruleId },
      data: { rule_text: newContent },
    });
  }
}
