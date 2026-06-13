#!/usr/bin/env tsx
/**
 * generate-skills — umbrella script that regenerates all worker-skill folders.
 *
 * Steps (in order):
 *   1. tool-usage-reference — delegates to scripts/generate-tool-usage-skill.ts
 *   2. Per-service skills (hostfully · sifely · github · slack · knowledge-base · platform)
 *      via generateServiceSkill() from src/lib/custom-skills/skill-generator.ts
 *   3. Composio skills — delegates to scripts/generate-composio-skills.ts
 *      ONLY when COMPOSIO_API_KEY is set; skips with exit 0 when absent.
 *
 * Usage:
 *   pnpm generate-skills
 *   COMPOSIO_API_KEY=xxx pnpm generate-skills
 *
 * Idempotent — running twice with no registry changes produces an empty git diff.
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const _require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

try {
  const dotenv = _require('dotenv');
  dotenv.config({ path: join(repoRoot, '.env') });
} catch {
  // dotenv unavailable — process.env must already be populated (none required here)
}

import { ALL_TOOL_DESCRIPTORS } from '../src/lib/tool-registry.js';
import {
  generateServiceSkill,
  serviceToSkillName,
} from '../src/lib/custom-skills/skill-generator.js';

const SKILLS_DIR = join(repoRoot, 'src', 'workers', 'skills');

const SERVICE_SKILL_SERVICES = [
  'hostfully',
  'sifely',
  'github',
  'slack',
  'knowledge_base',
  'platform',
] as const;

function normaliseLf(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

function writeIfChanged(filePath: string, content: string): 'written' | 'unchanged' {
  const normalised = normaliseLf(content);
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing === normalised) return 'unchanged';
  }
  writeFileSync(filePath, normalised, { encoding: 'utf8', flag: 'w' });
  return 'written';
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function spawnOrExit(args: string[]): void {
  const result = spawnSync('tsx', args, { cwd: repoRoot, stdio: 'inherit', encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`[generate-skills] ${args[0]} failed with status`, result.status);
    process.exit(result.status ?? 1);
  }
}

function stepToolUsageReference(): void {
  console.log('\n[generate-skills] Step 1/3: Regenerating tool-usage-reference SKILL.md…');
  spawnOrExit(['scripts/generate-tool-usage-skill.ts']);
}

function stepServiceSkills(): void {
  console.log('\n[generate-skills] Step 2/3: Generating per-service skill folders…');

  let totalWritten = 0;
  let totalUnchanged = 0;

  for (const service of SERVICE_SKILL_SERVICES) {
    const descriptors = ALL_TOOL_DESCRIPTORS.filter((d) => d.service === service);

    if (descriptors.length === 0) {
      console.warn(`[generate-skills]   WARN: no descriptors for service "${service}" — skipping`);
      continue;
    }

    const skillName = serviceToSkillName(service);
    const skillDir = join(SKILLS_DIR, skillName);
    const actionsDir = join(skillDir, 'actions');

    ensureDir(skillDir);
    ensureDir(actionsDir);

    const { skillMd, actionFiles } = generateServiceSkill(service, descriptors);

    const skillMdResult = writeIfChanged(join(skillDir, 'SKILL.md'), skillMd);
    if (skillMdResult === 'written') totalWritten++;
    else totalUnchanged++;

    const sortedEntries = Array.from(actionFiles.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [toolId, content] of sortedEntries) {
      const result = writeIfChanged(join(actionsDir, `${toolId}.md`), content);
      if (result === 'written') totalWritten++;
      else totalUnchanged++;
    }

    console.log(
      `[generate-skills]   ✓ ${skillName}: SKILL.md + ${sortedEntries.length} action file(s)`,
    );
  }

  console.log(
    `[generate-skills] Service skills done. ${totalWritten} written, ${totalUnchanged} unchanged.`,
  );
}

function stepComposio(): void {
  console.log('\n[generate-skills] Step 3/3: Composio skill generation…');

  if (!process.env.COMPOSIO_API_KEY) {
    console.log('[generate-skills] Composio skipped (no COMPOSIO_API_KEY)');
    return;
  }

  console.log('[generate-skills] COMPOSIO_API_KEY found — running generate-composio-skills…');
  spawnOrExit(['scripts/generate-composio-skills.ts']);
}

function main(): void {
  console.log('[generate-skills] Starting umbrella skill generation…');
  stepToolUsageReference();
  stepServiceSkills();
  stepComposio();
  console.log('\n[generate-skills] All done. ✓');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
