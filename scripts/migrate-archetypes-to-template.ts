#!/usr/bin/env tsx
/**
 * migrate-archetypes-to-template
 *
 * Populates identity, execution_steps, delivery_steps, and temperature for the
 * 6 known archetypes from their existing field content.
 *
 * Usage:
 *   tsx scripts/migrate-archetypes-to-template.ts [--dry-run]
 *
 * --dry-run  Show planned changes without writing to the database.
 *
 * Idempotent: skips archetypes where all 3 new fields are already non-null.
 * Raw source dumps are written to scripts/migration-output/{role_name}-source.txt.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const isDryRun = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

const TARGET_ROLES: string[] = [
  'guest-messaging',
  'daily-summarizer',
  'daily-real-estate-inspiration-2',
  'daily-real-estate-inspiration-2-copy',
  'code-rotation',
  'schedule-generator-thornton',
];

const TEMPERATURE_OVERRIDES: Record<string, number> = {
  'daily-real-estate-inspiration-2-copy': 1.5,
};

function extractIdentity(agentsMd: string | null, systemPrompt: string | null): string {
  const source = (agentsMd ?? systemPrompt ?? '').trim();
  if (!source) return '';

  const xmlSectionIdx = source.search(/<[a-z]+-instructions>/);
  const textRegion = xmlSectionIdx > 0 ? source.slice(0, xmlSectionIdx) : source;

  const doubleNlIdx = textRegion.indexOf('\n\n');
  if (doubleNlIdx !== -1 && doubleNlIdx <= 500) {
    return textRegion.slice(0, doubleNlIdx).trim();
  }
  return textRegion.slice(0, 500).trim();
}

function extractExecutionSteps(
  executionInstructions: string | null,
  agentsMd: string | null,
): string {
  let source = (executionInstructions ?? '').trim();

  const isPassthrough =
    !source || source.length < 200 || source.includes('Follow the instructions');
  if (isPassthrough) {
    source = (agentsMd ?? '').trim();
  }

  if (!source) return '';

  const xmlMatch = source.match(/<execution-instructions>([\s\S]*?)<\/execution-instructions>/);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }

  const lines = source.split('\n');
  const firstStepIdx = lines.findIndex((l) =>
    /^(?:1\.|Step\s+1\b|##\s+Step\s+1\b|STEPS?:)/i.test(l.trim()),
  );
  if (firstStepIdx !== -1) {
    return lines.slice(firstStepIdx).join('\n').trim();
  }

  const workflowMatch = source.match(/WORKFLOW:\n([\s\S]+?)(?:\n\n[A-Z]{2}|$)/);
  if (workflowMatch) {
    return workflowMatch[1].trim();
  }

  return source;
}

function extractDeliverySteps(deliveryInstructions: string | null): string | null {
  if (!deliveryInstructions) return null;

  const source = deliveryInstructions.trim();
  if (!source) return null;

  if (source.includes('Follow the instructions')) return null;

  const xmlMatch = source.match(/<delivery-instructions>([\s\S]*?)<\/delivery-instructions>/);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }

  return source;
}

interface ArchetypeRow {
  id: string;
  role_name: string;
  system_prompt: string | null;
  agents_md: string | null;
  execution_instructions: string | null;
  delivery_instructions: string | null;
  identity: string | null;
  execution_steps: string | null;
  delivery_steps: string | null;
  temperature: number | null;
}

async function main() {
  console.log(`=== Archetype Template Migration${isDryRun ? ' (DRY RUN)' : ''} ===\n`);

  mkdirSync(join('scripts', 'migration-output'), { recursive: true });

  const archetypes: ArchetypeRow[] = await (prisma.archetype as any).findMany({
    where: {
      role_name: { in: TARGET_ROLES },
      deleted_at: null,
    },
    select: {
      id: true,
      role_name: true,
      system_prompt: true,
      agents_md: true,
      execution_instructions: true,
      delivery_instructions: true,
      identity: true,
      execution_steps: true,
      delivery_steps: true,
      temperature: true,
    },
  });

  console.log(`Found ${archetypes.length} archetypes to process\n`);

  archetypes.sort((a, b) => {
    const ai = TARGET_ROLES.indexOf(a.role_name);
    const bi = TARGET_ROLES.indexOf(b.role_name);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  let updated = 0;
  let skipped = 0;

  for (const archetype of archetypes) {
    const { role_name, identity, execution_steps, delivery_steps } = archetype;

    if (identity && execution_steps && delivery_steps) {
      console.log(`[SKIP] ${role_name} — all 3 fields already populated\n`);
      skipped++;
      continue;
    }

    const temperature = TEMPERATURE_OVERRIDES[role_name] ?? 1.0;
    const newIdentity = extractIdentity(archetype.agents_md, archetype.system_prompt);
    const newExecutionSteps = extractExecutionSteps(
      archetype.execution_instructions,
      archetype.agents_md,
    );
    const newDeliverySteps = extractDeliverySteps(archetype.delivery_instructions);

    const sourceDump = [
      `=== SOURCE DUMP: ${role_name} ===`,
      '',
      '--- system_prompt ---',
      archetype.system_prompt ?? '(null)',
      '',
      '--- agents_md ---',
      archetype.agents_md ?? '(null)',
      '',
      '--- execution_instructions ---',
      archetype.execution_instructions ?? '(null)',
      '',
      '--- delivery_instructions ---',
      archetype.delivery_instructions ?? '(null)',
      '',
      '=== EXTRACTED VALUES ===',
      '',
      `--- identity (${newIdentity.length} chars) ---`,
      newIdentity || '(empty)',
      '',
      `--- execution_steps (${newExecutionSteps.length} chars) ---`,
      newExecutionSteps || '(empty)',
      '',
      `--- delivery_steps (${newDeliverySteps ? newDeliverySteps.length : 0} chars) ---`,
      newDeliverySteps ?? '(null)',
      '',
      '--- temperature ---',
      String(temperature),
    ].join('\n');

    const safeFileName = role_name.replace(/[^a-z0-9-]/g, '_');
    writeFileSync(join('scripts', 'migration-output', `${safeFileName}-source.txt`), sourceDump);

    const label = isDryRun ? 'DRY-RUN' : 'UPDATE';
    console.log(`[${label}] ${role_name}`);
    console.log(`  temperature:                  ${temperature}`);
    console.log(`  identity       (first 200):  ${newIdentity.slice(0, 200).replace(/\n/g, ' ')}`);
    console.log(
      `  execution_steps (first 200): ${newExecutionSteps.slice(0, 200).replace(/\n/g, ' ')}`,
    );
    console.log(
      `  delivery_steps  (first 200): ${
        newDeliverySteps ? newDeliverySteps.slice(0, 200).replace(/\n/g, ' ') : '(null)'
      }`,
    );
    console.log('');

    if (!isDryRun) {
      await (prisma.archetype as any).update({
        where: { id: archetype.id },
        data: {
          identity: newIdentity || null,
          execution_steps: newExecutionSteps || null,
          delivery_steps: newDeliverySteps,
          temperature,
        },
      });
      console.log(`  ✅ Updated in DB\n`);
    }

    updated++;
  }

  const foundRoles = archetypes.map((a) => a.role_name);
  const missingRoles = TARGET_ROLES.filter((r) => !foundRoles.includes(r));
  if (missingRoles.length > 0) {
    console.warn(`⚠️  Archetypes not found in DB: ${missingRoles.join(', ')}`);
    console.warn('   They may belong to a different tenant or be soft-deleted.\n');
  }

  console.log('=== Summary ===');
  console.log(`  Processed: ${archetypes.length}`);
  console.log(`  Skipped (already migrated): ${skipped}`);
  console.log(`  ${isDryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`  Source dumps: scripts/migration-output/`);

  if (isDryRun) {
    console.log('\n💡 Review the source dumps, then run without --dry-run to apply changes.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
