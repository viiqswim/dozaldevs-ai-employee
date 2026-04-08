import { describe, it, expect } from 'vitest';
import {
  parsePlan,
  getNextIncompleteWave,
  isPlanComplete,
} from '../../../src/workers/lib/plan-parser.js';

const SAMPLE_PLAN = `
# My Plan

Some intro text that's longer than 500 bytes to pass the minimum length check.
This plan is for testing purposes only and contains multiple waves and tasks.
The parser must correctly identify wave headers and task checkboxes.
Additional padding to ensure we exceed the 500 byte minimum threshold requirement.
More text here to make sure we're well above the threshold. Let's add a lot more content.

## Wave 1

- [ ] 1. Create foo module
- [ ] 2. Create bar module
- [x] 3. Write tests for baz

## Wave 2

- [ ] 1. Wire foo into main
- [x] 2. Wire bar into main
`;

describe('parsePlan', () => {
  it('parses wave headers and tasks correctly', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    expect(plan.totalWaves).toBe(2);
    expect(plan.waves[0]!.number).toBe(1);
    expect(plan.waves[0]!.tasks).toHaveLength(3);
    expect(plan.waves[1]!.number).toBe(2);
    expect(plan.waves[1]!.tasks).toHaveLength(2);
  });

  it('correctly identifies completed vs incomplete tasks', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    const wave1Tasks = plan.waves[0]!.tasks;
    expect(wave1Tasks[0]!.completed).toBe(false);
    expect(wave1Tasks[1]!.completed).toBe(false);
    expect(wave1Tasks[2]!.completed).toBe(true);
  });

  it('counts total and completed tasks', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    expect(plan.totalTasks).toBe(5);
    expect(plan.completedTasks).toBe(2);
  });

  it('throws if plan is too short (< 500 bytes)', () => {
    expect(() => parsePlan('## Wave 1\n- [ ] 1. Task')).toThrow('too short');
  });

  it('throws if no wave headers found', () => {
    const noWaves = 'x'.repeat(600);
    expect(() => parsePlan(noWaves)).toThrow('no waves');
  });

  it('throws if no tasks found', () => {
    const noTasks = '## Wave 1\n' + 'x'.repeat(600);
    expect(() => parsePlan(noTasks)).toThrow('no tasks');
  });

  it('ignores lines that do not match grammar', () => {
    const planWithNoise = SAMPLE_PLAN + '\nSome random text\n> blockquote\n```code```\n';
    const plan = parsePlan(planWithNoise);
    expect(plan.totalTasks).toBe(5);
  });

  it('parses task number and title correctly', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    const firstTask = plan.waves[0]!.tasks[0]!;
    expect(firstTask.number).toBe(1);
    expect(firstTask.title).toBe('Create foo module');
  });
});

describe('getNextIncompleteWave', () => {
  it('returns first wave with incomplete tasks', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    const next = getNextIncompleteWave(plan);
    expect(next).not.toBeNull();
    expect(next!.number).toBe(1);
  });

  it('returns null when all tasks completed', () => {
    const allDone = `${'x'.repeat(600)}\n## Wave 1\n- [x] 1. Done\n`;
    const plan = parsePlan(allDone);
    expect(getNextIncompleteWave(plan)).toBeNull();
  });
});

describe('isPlanComplete', () => {
  it('returns false when tasks remain', () => {
    const plan = parsePlan(SAMPLE_PLAN);
    expect(isPlanComplete(plan)).toBe(false);
  });

  it('returns true when all tasks completed', () => {
    const allDone = `${'x'.repeat(600)}\n## Wave 1\n- [x] 1. Done\n- [x] 2. Also done\n`;
    const plan = parsePlan(allDone);
    expect(isPlanComplete(plan)).toBe(true);
  });
});
