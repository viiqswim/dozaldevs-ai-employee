import { describe, it, expect } from 'vitest';
import {
  buildPlanningPrompt,
  buildExecutionPrompt,
  buildContinuationPrompt,
} from '../../../src/workers/lib/prompt-builder.js';
import type { ParsedWave, ParsedTask } from '../../../src/workers/lib/plan-parser.js';

const TICKET = {
  key: 'TEST-42',
  summary: 'Add user authentication flow',
  description: 'Implement JWT-based auth with login, logout, and refresh endpoints.',
};

const PROJECT_META = {
  repoUrl: 'https://github.com/example/my-repo',
  name: 'My Repo',
};

const WAVE: ParsedWave = {
  number: 2,
  tasks: [
    { number: 1, title: 'Create auth middleware', completed: false },
    { number: 2, title: 'Write login endpoint', completed: false },
    { number: 3, title: 'Add refresh token logic', completed: false },
  ],
};

describe('buildPlanningPrompt', () => {
  it('contains the plan file path with correct ticket key', async () => {
    const prompt = await buildPlanningPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
    });
    expect(prompt).toContain('.sisyphus/plans/TEST-42.md');
  });

  it('includes wave grammar instructions for ## Wave N header', async () => {
    const prompt = await buildPlanningPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
    });
    expect(prompt).toContain('## Wave');
  });

  it('includes task checkbox grammar instructions for - [ ] N. Title', async () => {
    const prompt = await buildPlanningPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
    });
    expect(prompt).toContain('- [ ]');
  });

  it('includes ticket summary and description', async () => {
    const prompt = await buildPlanningPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
    });
    expect(prompt).toContain(TICKET.summary);
    expect(prompt).toContain(TICKET.description);
  });

  it('instructs agent to exit after writing the plan file', async () => {
    const prompt = await buildPlanningPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
    });
    expect(prompt.toLowerCase()).toContain('exit');
  });
});

describe('buildExecutionPrompt', () => {
  it('injects AGENTS.md content when agentsMdContent is non-null', async () => {
    const agentsMd = '# Project Conventions\nAlways use pnpm.\n';
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: agentsMd,
      boulderContext: null,
    });
    expect(prompt).toContain(agentsMd);
  });

  it('omits AGENTS.md section when agentsMdContent is null — no "null" or "undefined" in output', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: null,
    });
    expect(prompt).not.toContain('null');
    expect(prompt).not.toContain('undefined');
  });

  it('includes completion gate command', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: null,
    });
    expect(prompt).toContain('pnpm lint && pnpm build && pnpm test -- --run');
  });

  it('includes correct wave-scoped commit format', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: null,
    });
    expect(prompt).toContain('feat(wave-2):');
  });

  it('instructs agent to work only on tasks in the current wave', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: null,
    });
    expect(prompt.toLowerCase()).toContain('only work on tasks in the current wave');
  });

  it('lists all tasks assigned to the current wave', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: null,
    });
    for (const task of WAVE.tasks) {
      expect(prompt).toContain(task.title);
    }
  });

  it('injects boulderContext JSON when non-null', async () => {
    const boulder = { previousAttempt: 'failed at step 2', retryCount: 1 };
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: null,
      boulderContext: boulder,
    });
    expect(prompt).toContain('"previousAttempt"');
    expect(prompt).toContain('"retryCount"');
  });

  it('prompt stays under 20000 chars for a realistic ticket', async () => {
    const prompt = await buildExecutionPrompt({
      ticket: TICKET,
      repoRoot: '/workspace',
      projectMeta: PROJECT_META,
      wave: WAVE,
      planPath: '.sisyphus/plans/TEST-42.md',
      agentsMdContent: 'Some project conventions.\n'.repeat(50),
      boulderContext: { key: 'value' },
    });
    expect(prompt.length).toBeLessThan(20000);
  });
});

describe('buildContinuationPrompt', () => {
  it('includes the correct wave number', async () => {
    const tasks: ParsedTask[] = [{ number: 2, title: 'Write login endpoint', completed: false }];
    const prompt = await buildContinuationPrompt(tasks, 3);
    expect(prompt).toContain('Wave 3');
  });

  it('lists all unchecked task titles', async () => {
    const tasks: ParsedTask[] = [
      { number: 1, title: 'Create auth middleware', completed: false },
      { number: 2, title: 'Write login endpoint', completed: false },
    ];
    const prompt = await buildContinuationPrompt(tasks, 1);
    expect(prompt).toContain('Create auth middleware');
    expect(prompt).toContain('Write login endpoint');
  });

  it('uses unchecked checkbox format for tasks', async () => {
    const tasks: ParsedTask[] = [{ number: 1, title: 'Add refresh token logic', completed: false }];
    const prompt = await buildContinuationPrompt(tasks, 2);
    expect(prompt).toContain('- [ ]');
  });
});
