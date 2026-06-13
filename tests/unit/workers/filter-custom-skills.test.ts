import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../../src/lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import {
  filterCustomSkills,
  CUSTOM_SKILL_ALLOWLIST,
  CUSTOM_SKILL_ALWAYS_KEEP,
} from '../../../src/workers/lib/harness-helpers.mjs';
import { ALL_TOOL_DESCRIPTORS } from '../../../src/lib/tool-registry.js';
import { serviceToSkillName } from '../../../src/lib/custom-skills/skill-generator.js';

const ALLOWLIST_FOLDERS = ['hostfully', 'sifely', 'github', 'slack'];
const ALWAYS_KEEP_FOLDERS = ['knowledge-base', 'platform'];
const NEVER_TOUCH_FOLDERS = ['composio-notion', 'tool-usage-reference', 'uuid-disambiguation'];
const ALL_SKILL_FOLDERS = [...ALLOWLIST_FOLDERS, ...ALWAYS_KEEP_FOLDERS, ...NEVER_TOUCH_FOLDERS];

let skillsDir: string;

function makeSkillsDir(folders: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-custom-skills-'));
  for (const folder of folders) {
    fs.mkdirSync(path.join(dir, folder));
    fs.writeFileSync(
      path.join(dir, folder, 'SKILL.md'),
      `---\nname: ${folder}\ndescription: test\n---\n# Body\n`,
    );
  }
  return dir;
}

function listFolders(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe('filterCustomSkills — explicit-allowlist pruning', () => {
  beforeEach(() => {
    skillsDir = makeSkillsDir(ALL_SKILL_FOLDERS);
  });

  afterEach(() => {
    if (skillsDir) fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  it('keeps the connected service + always-keep set; removes other allowlist folders; never touches composio-*/tool-usage-reference/uuid-disambiguation', () => {
    filterCustomSkills(['hostfully'], skillsDir);

    const remaining = listFolders(skillsDir);

    expect(remaining).toContain('hostfully');
    expect(remaining).toContain('knowledge-base');
    expect(remaining).toContain('platform');
    expect(remaining).not.toContain('sifely');
    expect(remaining).not.toContain('github');
    expect(remaining).not.toContain('slack');
    expect(remaining).toContain('composio-notion');
    expect(remaining).toContain('tool-usage-reference');
    expect(remaining).toContain('uuid-disambiguation');
  });

  it('removes all allowlist folders when no services are connected, keeps the always-keep set', () => {
    filterCustomSkills([], skillsDir);

    const remaining = listFolders(skillsDir);

    for (const slug of CUSTOM_SKILL_ALLOWLIST) {
      expect(remaining).not.toContain(slug);
    }
    for (const slug of CUSTOM_SKILL_ALWAYS_KEEP) {
      expect(remaining).toContain(slug);
    }
    expect(remaining).toContain('composio-notion');
    expect(remaining).toContain('tool-usage-reference');
    expect(remaining).toContain('uuid-disambiguation');
  });

  it('keeps every allowlist folder when all services are connected', () => {
    filterCustomSkills([...CUSTOM_SKILL_ALLOWLIST], skillsDir);

    const remaining = listFolders(skillsDir);
    expect(remaining.sort()).toEqual(ALL_SKILL_FOLDERS.sort());
  });

  it('matches service slugs case-insensitively', () => {
    filterCustomSkills(['HostFully', 'GITHUB'], skillsDir);

    const remaining = listFolders(skillsDir);
    expect(remaining).toContain('hostfully');
    expect(remaining).toContain('github');
    expect(remaining).not.toContain('sifely');
    expect(remaining).not.toContain('slack');
  });

  it('is a no-op when the skills directory does not exist (never throws)', () => {
    const missing = path.join(os.tmpdir(), 'filter-custom-skills-missing-xyz-123');
    expect(() => filterCustomSkills(['hostfully'], missing)).not.toThrow();
  });

  it('handles an allowlisted folder being absent gracefully (no-op for that slug)', () => {
    const partialDir = makeSkillsDir(['hostfully', 'sifely', 'knowledge-base', 'platform']);
    try {
      expect(() => filterCustomSkills(['github'], partialDir)).not.toThrow();
      const remaining = listFolders(partialDir);
      expect(remaining).not.toContain('sifely');
      expect(remaining).not.toContain('hostfully');
      expect(remaining).toContain('knowledge-base');
      expect(remaining).toContain('platform');
    } finally {
      fs.rmSync(partialDir, { recursive: true, force: true });
    }
  });

  it('ignores non-directory entries in the skills dir', () => {
    fs.writeFileSync(path.join(skillsDir, 'README.md'), 'stray');
    expect(() => filterCustomSkills([], skillsDir)).not.toThrow();
    expect(fs.existsSync(path.join(skillsDir, 'README.md'))).toBe(true);
  });
});

describe('filterCustomSkills — list-sync invariant', () => {
  // Composio tools are pruned by filterComposioSkills (prefix match on
  // `composio-*`), NOT by the custom-integration allowlist. It is the one
  // service intentionally outside (allowlist ∪ always-keep).
  const HANDLED_ELSEWHERE = new Set(['composio']);

  it('every service in ALL_TOOL_DESCRIPTORS is accounted for in (allowlist ∪ always-keep)', () => {
    const accounted = new Set<string>([...CUSTOM_SKILL_ALLOWLIST, ...CUSTOM_SKILL_ALWAYS_KEEP]);
    const uniqueServices = [...new Set(ALL_TOOL_DESCRIPTORS.map((d) => d.service))];

    const unaccounted = uniqueServices.filter((service) => {
      if (HANDLED_ELSEWHERE.has(service)) return false;
      return !accounted.has(serviceToSkillName(service));
    });

    // Failure here means a new service entered ALL_TOOL_DESCRIPTORS without a
    // matching entry in CUSTOM_SKILL_ALLOWLIST/CUSTOM_SKILL_ALWAYS_KEEP.
    expect(unaccounted).toEqual([]);
  });

  it('allowlist and always-keep sets are disjoint', () => {
    const overlap = CUSTOM_SKILL_ALLOWLIST.filter((s) => CUSTOM_SKILL_ALWAYS_KEEP.includes(s));
    expect(overlap).toEqual([]);
  });
});
