import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SENTINEL = '<!-- HAND-WRITTEN: DO NOT GENERATE BELOW -->';
const SKILL_PATH = join(process.cwd(), 'src/workers/skills/tool-usage-reference/SKILL.md');

describe('tool-usage-skill sentinel', () => {
  it('SKILL.md contains the sentinel exactly once', () => {
    const content = readFileSync(SKILL_PATH, 'utf8');
    expect(content).toContain(SENTINEL);
    expect(content.split(SENTINEL)).toHaveLength(2);
  });

  it('hand-written critical warnings are preserved below the sentinel', () => {
    const content = readFileSync(SKILL_PATH, 'utf8');
    const sentinelIdx = content.indexOf(SENTINEL);
    expect(sentinelIdx).toBeGreaterThan(-1);
    const belowSentinel = content.slice(sentinelIdx + SENTINEL.length);
    expect(belowSentinel).toContain('CRITICAL WARNINGS');
    expect(belowSentinel).toContain('`lead_uid` ≠ `thread_uid`');
  });

  it('generated tool sections appear above the sentinel', () => {
    const content = readFileSync(SKILL_PATH, 'utf8');
    const sentinelIdx = content.indexOf(SENTINEL);
    const aboveSentinel = content.slice(0, sentinelIdx);
    expect(aboveSentinel).toContain('# Tool Usage Reference');
    expect(aboveSentinel).toContain('## slack/post-message');
    expect(aboveSentinel).toContain('## platform/submit-output');
  });
});
