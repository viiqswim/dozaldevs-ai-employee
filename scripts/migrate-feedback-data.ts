#!/usr/bin/env tsx
/**
 * migrate-feedback-data — One-time migration script
 *
 * Copies data from old tables (learned_rules, feedback) to new tables
 * (employee_rules, feedback_events), and removes stale knowledge_bases rows
 * of type 'feedback_summary'.
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   pnpm migrate:feedback
 *   tsx scripts/migrate-feedback-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Feedback Data Migration ===\n');

  // ─────────────────────────────────────────────────────────────
  // 1. Copy learned_rules → employee_rules
  // ─────────────────────────────────────────────────────────────
  const learnedRules = await prisma.learnedRule.findMany();
  console.log(`Found ${learnedRules.length} learned_rules rows`);

  let migrated = 0;
  let skipped = 0;

  for (const rule of learnedRules) {
    // Idempotency: skip if a row with the same source_task_id + source already exists
    if (rule.source_task_id) {
      const mappedSource =
        rule.source === 'weekly_synthesis' ? 'synthesis' : (rule.source ?? 'rejection');
      const existing = await prisma.employeeRule.findFirst({
        where: {
          source_task_id: rule.source_task_id,
          source: mappedSource,
        },
      });
      if (existing) {
        skipped++;
        continue;
      }
    }

    // entity_id is always the archetype UUID (entity_type = 'archetype')
    const archetypeId = rule.entity_id;
    if (!archetypeId) {
      console.warn(`  Skipping learned_rule ${rule.id} — no entity_id (archetype UUID)`);
      skipped++;
      continue;
    }

    const mappedSource =
      rule.source === 'weekly_synthesis' ? 'synthesis' : (rule.source ?? 'rejection');

    await prisma.employeeRule.create({
      data: {
        tenant_id: rule.tenant_id,
        archetype_id: archetypeId,
        rule_text: rule.rule_text,
        source: mappedSource,
        status: rule.status,
        source_task_id: rule.source_task_id ?? undefined,
        parent_rule_ids: [], // original parent tracking not stored in old schema
        slack_ts: rule.slack_ts ?? undefined,
        slack_channel: rule.slack_channel ?? undefined,
        created_at: rule.created_at,
        confirmed_at: rule.confirmed_at ?? undefined,
      },
    });
    migrated++;
  }

  console.log(
    `Migrated ${migrated} learned_rules rows (skipped ${skipped} already-migrated or invalid)`,
  );

  const rulesByStatus = await prisma.employeeRule.groupBy({
    by: ['status'],
    _count: true,
  });
  console.log(
    'employee_rules by status:',
    rulesByStatus.map((r) => `${r.status}: ${r._count}`).join(', '),
  );

  // ─────────────────────────────────────────────────────────────
  // 2. Copy feedback → feedback_events
  // ─────────────────────────────────────────────────────────────
  const feedbackRows = await prisma.feedback.findMany({
    include: {
      task: {
        select: { archetype_id: true },
      },
    },
  });
  console.log(`\nFound ${feedbackRows.length} feedback rows`);

  let fbMigrated = 0;
  let fbSkipped = 0;

  for (const fb of feedbackRows) {
    const archetypeId = fb.task?.archetype_id;
    if (!archetypeId) {
      console.warn(`  Skipping feedback ${fb.id} — no archetype_id (task missing or no archetype)`);
      fbSkipped++;
      continue;
    }

    // Idempotency: skip if a feedback_event with same task_id + event_type already exists
    if (fb.task_id) {
      const existing = await prisma.feedbackEvent.findFirst({
        where: {
          task_id: fb.task_id,
          event_type: fb.feedback_type ?? 'rejection',
        },
      });
      if (existing) {
        fbSkipped++;
        continue;
      }
    }

    await prisma.feedbackEvent.create({
      data: {
        tenant_id: fb.tenant_id,
        archetype_id: archetypeId,
        task_id: fb.task_id ?? undefined,
        event_type: fb.feedback_type ?? 'rejection',
        actor_id: fb.created_by ?? undefined,
        correction_content: fb.correction_reason ?? undefined,
        original_content: undefined,
        metadata: fb.original_decision ?? undefined,
        created_at: fb.created_at,
      },
    });
    fbMigrated++;
  }

  console.log(
    `Migrated ${fbMigrated} feedback rows (skipped ${fbSkipped} without archetype or already-migrated)`,
  );

  // ─────────────────────────────────────────────────────────────
  // 3. Remove feedback_summary rows from knowledge_bases
  // ─────────────────────────────────────────────────────────────
  const kbBefore = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM knowledge_bases WHERE source_config->>'type' = 'feedback_summary'
  `;
  const beforeCount = Number(kbBefore[0].count);
  console.log(`\nFound ${beforeCount} feedback_summary knowledge_bases rows to remove`);

  if (beforeCount > 0) {
    await prisma.$executeRaw`
      DELETE FROM knowledge_bases WHERE source_config->>'type' = 'feedback_summary'
    `;
    console.log(`Deleted ${beforeCount} feedback_summary knowledge_bases rows`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Verification summary
  // ─────────────────────────────────────────────────────────────
  const finalRules = await prisma.employeeRule.count();
  const finalFbEvents = await prisma.feedbackEvent.count();
  const finalKbFeedback = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM knowledge_bases WHERE source_config->>'type' = 'feedback_summary'
  `;

  console.log('\n=== Verification ===');
  console.log(`employee_rules total:                  ${finalRules}`);
  console.log(`feedback_events total:                 ${finalFbEvents}`);
  console.log(
    `knowledge_bases feedback_summary rows: ${Number(finalKbFeedback[0].count)} (expected: 0)`,
  );
  console.log('\nMigration complete ✓');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
