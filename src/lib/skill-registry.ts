/**
 * skill-registry — single source of truth for worker skill metadata.
 *
 * Reads the YAML frontmatter (name + description) from every
 * `src/workers/skills/*\/SKILL.md` on disk, replacing hardcoded skill lists
 * scattered across the gateway. The directory listing is authoritative — adding
 * a new skill folder makes it appear here with no code change.
 *
 * Design constraints:
 *   - Pure TypeScript, no framework deps (mirrors src/lib/go-models.ts style)
 *   - No YAML library — simple line parsing of the `---`-delimited frontmatter
 *   - Reads fresh from disk on every call so newly-added skills are picked up
 *   - Never throws on a missing dir or malformed file — logs nothing, skips
 */

import fs from 'fs';
import path from 'path';

export interface WorkerSkill {
  name: string;
  description: string;
}

const DEFAULT_SKILLS_DIR = path.join(process.cwd(), 'src/workers/skills');

/**
 * Strip a single layer of surrounding single or double quotes from a value.
 * Frontmatter descriptions may be single-quoted (composio-*, tool-usage-reference)
 * or unquoted (uuid-disambiguation).
 */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseFrontmatter(content: string): WorkerSkill | null {
  // Frontmatter is the block between the first two `---` delimiters.
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const block = match[1] ?? '';
  let name = '';
  let description = '';

  for (const line of block.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      name = stripQuotes(nameMatch[1] ?? '');
      continue;
    }
    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) {
      description = stripQuotes(descMatch[1] ?? '');
    }
  }

  if (!name || !description) return null;
  return { name, description };
}

export function getWorkerSkills(skillsDir: string = DEFAULT_SKILLS_DIR): WorkerSkill[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: WorkerSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseFrontmatter(content);
    if (parsed) skills.push(parsed);
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
