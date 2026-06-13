import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getWorkerSkills } from '../../src/lib/skill-registry.js';

describe('getWorkerSkills()', () => {
  it('returns a non-empty array of on-disk skills', () => {
    const skills = getWorkerSkills();
    expect(Array.isArray(skills)).toBe(true);
    expect(skills.length).toBeGreaterThan(0);
  });

  it('every skill has a non-empty name and description', () => {
    const skills = getWorkerSkills();
    for (const skill of skills) {
      expect(typeof skill.name).toBe('string');
      expect(skill.name.length).toBeGreaterThan(0);
      expect(typeof skill.description).toBe('string');
      expect(skill.description.length).toBeGreaterThan(0);
    }
  });

  it('includes the always-present tool-usage-reference skill', () => {
    const skills = getWorkerSkills();
    const names = skills.map((s) => s.name);
    expect(names).toContain('tool-usage-reference');
  });

  it('strips single-quotes and accepts unquoted descriptions from frontmatter', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-registry-quotes-'));
    try {
      fs.mkdirSync(path.join(dir, 'quoted'));
      fs.writeFileSync(
        path.join(dir, 'quoted', 'SKILL.md'),
        "---\nname: quoted\ndescription: 'A single-quoted description'\n---\n# Body\n",
      );
      fs.mkdirSync(path.join(dir, 'unquoted'));
      fs.writeFileSync(
        path.join(dir, 'unquoted', 'SKILL.md'),
        '---\nname: unquoted\ndescription: An unquoted description\n---\n# Body\n',
      );

      const skills = getWorkerSkills(dir);
      const quoted = skills.find((s) => s.name === 'quoted');
      const unquoted = skills.find((s) => s.name === 'unquoted');
      expect(quoted?.description).toBe('A single-quoted description');
      expect(unquoted?.description).toBe('An unquoted description');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('picks up a newly-added skill file on the next call', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-registry-temp-'));
    try {
      expect(getWorkerSkills(dir)).toHaveLength(0);

      fs.mkdirSync(path.join(dir, 'temp-skill'));
      fs.writeFileSync(
        path.join(dir, 'temp-skill', 'SKILL.md'),
        "---\nname: temp-skill\ndescription: 'A temporary test skill'\n---\n# Body\n",
      );

      const skills = getWorkerSkills(dir);
      expect(skills).toHaveLength(1);
      expect(skills[0]).toEqual({
        name: 'temp-skill',
        description: 'A temporary test skill',
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty array for a non-existent directory', () => {
    const missing = path.join(os.tmpdir(), 'skill-registry-does-not-exist-xyz');
    expect(getWorkerSkills(missing)).toEqual([]);
  });
});
