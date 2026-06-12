#!/usr/bin/env tsx
/**
 * generate-composio-skills — generates OpenCode skill folders for each connectable Composio app.
 *
 * For each app returned by getConnectableToolkits():
 *   1. Calls generateComposioSkill(slug) to fetch action schemas from the Composio API
 *   2. Writes src/workers/skills/composio-<slug>/SKILL.md
 *   3. Writes src/workers/skills/composio-<slug>/actions/<ACTION_SLUG>.md for each action
 *
 * Output is deterministic: action files are written in alphabetical order by filename.
 * All files use LF line endings.
 *
 * Usage:
 *   pnpm generate-composio-skills
 *   tsx scripts/generate-composio-skills.ts
 *
 * Requires COMPOSIO_API_KEY in .env (or already in process.env).
 * If COMPOSIO_API_KEY is not set, prints a warning and exits 0 (graceful no-op).
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const _require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

try {
  const dotenv = _require('dotenv');
  dotenv.config({ path: join(repoRoot, '.env') });
} catch {
  // dotenv unavailable — process.env must already be populated
}

import { COMPOSIO_API_KEY } from '../src/lib/config.js';
import { createHttpClient } from '../src/lib/http-client.js';
import { getConnectableToolkits } from '../src/lib/composio/connectable-apps.js';
import { generateComposioSkill } from '../src/lib/composio/skill-generator.js';

const COMPOSIO_API_BASE = 'https://backend.composio.dev';

const SKILLS_DIR = join(repoRoot, 'src', 'workers', 'skills');

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function normaliseLf(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

/**
 * Writes a file only when content has changed — keeps mtime stable on idempotent re-runs,
 * which keeps `git diff` clean when the script is run twice with no API changes.
 */
function writeIfChanged(filePath: string, content: string): 'written' | 'unchanged' {
  const normalised = normaliseLf(content);
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing === normalised) {
      return 'unchanged';
    }
  }
  writeFileSync(filePath, normalised, { encoding: 'utf8' });
  return 'written';
}

async function main(): Promise<void> {
  const apiKey = COMPOSIO_API_KEY();
  if (!apiKey) {
    console.warn(
      '[generate-composio-skills] COMPOSIO_API_KEY is not set — skipping skill generation.',
    );
    process.exit(0);
  }

  console.log('[generate-composio-skills] Resolving connectable Composio toolkits…');
  const toolkitSlugs = await getConnectableToolkits();

  if (toolkitSlugs.size === 0) {
    console.warn('[generate-composio-skills] No connectable toolkits found — nothing to generate.');
    process.exit(0);
  }

  const sortedSlugs = Array.from(toolkitSlugs).sort();
  console.log(
    `[generate-composio-skills] Found ${sortedSlugs.length} connectable toolkit(s): ${sortedSlugs.join(', ')}`,
  );

  let totalWritten = 0;
  let totalUnchanged = 0;

  for (const slug of sortedSlugs) {
    console.log(`[generate-composio-skills] Generating skill for: ${slug}`);

    const httpClient = createHttpClient(
      COMPOSIO_API_BASE,
      { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      { service: 'composio-skill-generator' },
    );

    let skillOutput: Awaited<ReturnType<typeof generateComposioSkill>>;
    try {
      skillOutput = await generateComposioSkill(slug, httpClient);
    } catch (err) {
      console.error(`[generate-composio-skills] ERROR generating skill for "${slug}":`, err);
      continue;
    }

    const skillDir = join(SKILLS_DIR, `composio-${slug}`);
    const actionsDir = join(skillDir, 'actions');

    ensureDir(skillDir);
    ensureDir(actionsDir);

    const skillMdPath = join(skillDir, 'SKILL.md');
    const skillResult = writeIfChanged(skillMdPath, skillOutput.skillMd);
    if (skillResult === 'written') totalWritten++;
    else totalUnchanged++;

    const sortedActionEntries = Object.entries(skillOutput.actionFiles).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    for (const [relPath, content] of sortedActionEntries) {
      const actionFilePath = join(skillDir, relPath);
      const actionFileDir = dirname(actionFilePath);
      ensureDir(actionFileDir);

      const result = writeIfChanged(actionFilePath, content);
      if (result === 'written') totalWritten++;
      else totalUnchanged++;
    }

    console.log(
      `[generate-composio-skills]   ✓ ${slug}: SKILL.md + ${sortedActionEntries.length} action file(s)`,
    );
  }

  console.log(
    `[generate-composio-skills] Done. ${totalWritten} file(s) written, ${totalUnchanged} file(s) unchanged.`,
  );
}

main().catch((err) => {
  console.error('[generate-composio-skills] Fatal error:', err);
  process.exit(1);
});
