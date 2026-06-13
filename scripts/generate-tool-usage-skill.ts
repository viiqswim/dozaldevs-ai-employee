#!/usr/bin/env tsx
/**
 * generate-tool-usage-skill — regenerates the CLI-reference body of the
 * tool-usage-reference SKILL.md from ALL_TOOL_DESCRIPTORS (src/lib/tool-registry.ts).
 *
 * The file is split by a sentinel line. Everything ABOVE is generated (YAML
 * frontmatter + per-tool CLI reference); everything BELOW the sentinel (the
 * hand-written critical warnings and curated per-service docs) is preserved
 * byte-for-byte and never regenerated. On the first run — before the sentinel
 * exists — it is bootstrapped above the CRITICAL WARNINGS heading.
 *
 * Idempotent (writeIfChanged → stable mtime → clean git diff). A CI diff gate in
 * .github/workflows/deploy.yml proves the committed SKILL.md stays in sync.
 *
 * Usage: pnpm generate-tool-usage-skill   (no API key required — pure codegen)
 */

import { createRequire } from 'module';
import { existsSync, readFileSync, writeFileSync } from 'fs';
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
  // dotenv unavailable — process.env must already be populated (none required here)
}

import {
  ALL_TOOL_DESCRIPTORS,
  toolInvocationPath,
  type ToolDescriptor,
} from '../src/lib/tool-registry.js';

const SKILL_PATH = join(repoRoot, 'src', 'workers', 'skills', 'tool-usage-reference', 'SKILL.md');

const SENTINEL = '<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->';
const HANDWRITTEN_BOOTSTRAP_HEADING = '## ⚠️ CRITICAL WARNINGS';

function normaliseLf(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

/**
 * Writes a file only when content has changed — keeps mtime stable on idempotent
 * re-runs, which keeps `git diff` clean when the script is run twice with no
 * registry changes.
 */
function writeIfChanged(filePath: string, content: string): 'written' | 'unchanged' {
  const normalised = normaliseLf(content);
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing === normalised) {
      return 'unchanged';
    }
  }
  writeFileSync(filePath, normalised, { encoding: 'utf8', flag: 'w' });
  return 'written';
}

function extractFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n/);
  if (!match) {
    throw new Error(
      `[generate-tool-usage-skill] Could not find YAML frontmatter at the top of ${SKILL_PATH}`,
    );
  }
  return match[0];
}

/**
 * Extracts the hand-written section to preserve — everything from the sentinel
 * to EOF. If the sentinel is absent (first run), bootstraps it by locating the
 * CRITICAL WARNINGS heading and prepending the sentinel above it.
 */
function extractHandWritten(content: string): string {
  const sentinelIdx = content.indexOf(SENTINEL);
  if (sentinelIdx !== -1) {
    return content.slice(sentinelIdx);
  }
  const headingIdx = content.indexOf(HANDWRITTEN_BOOTSTRAP_HEADING);
  if (headingIdx === -1) {
    throw new Error(
      `[generate-tool-usage-skill] Could not find the sentinel "${SENTINEL}" or the ` +
        `bootstrap heading "${HANDWRITTEN_BOOTSTRAP_HEADING}" in ${SKILL_PATH}. ` +
        `The hand-written section cannot be located — refusing to overwrite.`,
    );
  }
  return `${SENTINEL}\n\n${content.slice(headingIdx)}`;
}

export function renderTool(descriptor: ToolDescriptor): string[] {
  const lines: string[] = [];
  lines.push(`## ${descriptor.service}/${descriptor.id}`);
  lines.push('');
  lines.push(`**Description**: ${descriptor.description}`);
  lines.push('');
  lines.push(`**Invocation**: \`${toolInvocationPath(descriptor)} [flags]\``);
  lines.push('');
  const envVars = descriptor.envVars.length > 0 ? descriptor.envVars.join(', ') : 'None';
  lines.push(`**Environment variables**: ${envVars}`);
  lines.push('');
  lines.push('**Arguments**:');
  lines.push('');
  if (descriptor.args.length === 0) {
    lines.push('- _(no arguments)_');
  } else {
    for (const arg of descriptor.args) {
      const requirement = arg.required ? 'required' : 'optional';
      lines.push(`- \`${arg.name}\` (${requirement}): ${arg.description}`);
    }
  }
  lines.push('');
  return lines;
}

function buildGeneratedSection(frontmatter: string): string {
  const sortedDescriptors = [...ALL_TOOL_DESCRIPTORS].sort(
    (a, b) => a.service.localeCompare(b.service) || a.id.localeCompare(b.id),
  );

  const lines: string[] = [];
  lines.push(frontmatter.trimEnd());
  lines.push('');
  lines.push('# Tool Usage Reference');
  lines.push('');
  lines.push('Exact CLI syntax for every shell tool pre-installed in the worker container.');
  lines.push('All tools are executed via `tsx`. Output is JSON to stdout; errors go to stderr.');
  lines.push('');
  lines.push(
    '<!-- The sections below are auto-generated from src/lib/tool-registry.ts ' +
      '(ALL_TOOL_DESCRIPTORS). Run `pnpm generate-tool-usage-skill` to regenerate. ' +
      'Edit the registry, not this section. -->',
  );
  lines.push('');
  for (const descriptor of sortedDescriptors) {
    lines.push(...renderTool(descriptor));
  }
  return lines.join('\n');
}

function buildContent(): string {
  const current = readFileSync(SKILL_PATH, 'utf8');
  const frontmatter = extractFrontmatter(current);
  const handWritten = extractHandWritten(current);
  const generated = buildGeneratedSection(frontmatter);
  const content = `${generated}\n${handWritten}`;
  return `${content.replace(/\s*$/, '')}\n`;
}

function main(): void {
  const content = buildContent();
  const result = writeIfChanged(SKILL_PATH, content);
  console.log(
    `[generate-tool-usage-skill] ${result === 'written' ? 'Wrote' : 'Up to date'}: ${SKILL_PATH}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
