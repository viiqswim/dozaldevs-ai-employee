import type { ParsedWave, ParsedTask } from './plan-parser.js';

interface TicketInfo {
  key: string;
  summary: string;
  description: string;
}

interface ProjectMeta {
  repoUrl: string;
  name: string;
}

interface PlanningPromptOpts {
  ticket: TicketInfo;
  repoRoot: string;
  projectMeta: ProjectMeta;
}

interface ExecutionPromptOpts {
  ticket: TicketInfo;
  repoRoot: string;
  projectMeta: ProjectMeta;
  wave: ParsedWave;
  planPath: string;
  agentsMdContent: string | null;
  boulderContext: Record<string, unknown> | null;
}

/**
 * Build the Phase 1 planning prompt.
 *
 * Instructs the agent to:
 * 1. Read the ticket summary and description
 * 2. Research the repository using available tools
 * 3. Write a structured plan file to `.sisyphus/plans/{ticket.key}.md`
 * 4. Exit the session once the plan file is written
 *
 * Plan grammar requirements enforced:
 * - Wave header: `## Wave N`
 * - Task line:   `- [ ] N. Title`
 * - Minimum 1 wave, 1 task, 500 bytes
 */
export async function buildPlanningPrompt(opts: PlanningPromptOpts): Promise<string> {
  const { ticket, projectMeta } = opts;
  const planPath = `.sisyphus/plans/${ticket.key}.md`;

  return `# Planning Phase — ${ticket.key}

## Project
- **Name**: ${projectMeta.name}
- **Repository**: ${projectMeta.repoUrl}

## Ticket
- **Key**: ${ticket.key}
- **Summary**: ${ticket.summary}

## Description
${ticket.description}

## Your Task
You are in the **planning phase**. Your only job right now is to produce a written plan file.

### Steps
1. Read the ticket summary and description above carefully.
2. Explore the repository structure using your available tools (read files, list directories, search code).
3. Identify all the work required to implement the ticket.
4. Break the work into sequential waves. Each wave should be independently shippable.
5. Write the plan file to \`${planPath}\`.

### Plan File Format (STRICT — do not deviate)
The plan file **must** follow this exact grammar:

\`\`\`
# ${ticket.key} — ${ticket.summary}

<brief description of the overall approach>

## Wave 1

- [ ] 1. <task title>
- [ ] 2. <task title>

## Wave 2

- [ ] 1. <task title>
\`\`\`

Rules:
- Wave headers: exactly \`## Wave N\` (N is 1-indexed integer)
- Task lines: exactly \`- [ ] N. Title\` (space between \`-\` and \`[\`, checkbox is \`[ ]\`, N matches position in wave)
- Minimum 1 wave
- Minimum 1 task per wave
- Plan file must be at least 500 bytes — add detail to descriptions if needed
- Do NOT use \`- [x]\` in the plan — all tasks start unchecked

### When You Are Done
Once you have written \`${planPath}\`, **exit the session immediately**. Do not begin implementation — that happens in a separate phase.

Do not create any other files. Do not make any code changes. Only write the plan file.
`;
}

/**
 * Build the Phase 2 execution prompt for a single wave.
 *
 * Instructs the agent to:
 * - Work only on tasks in the specified wave
 * - Run the completion gate before marking tasks done
 * - Use conventional commit format `feat(wave-N): description`
 * - Inject AGENTS.md content if provided
 * - Inject boulder context if provided
 */
export async function buildExecutionPrompt(opts: ExecutionPromptOpts): Promise<string> {
  const { ticket, projectMeta, wave, planPath, agentsMdContent, boulderContext } = opts;

  const taskList = wave.tasks.map((t) => `- [ ] ${t.number}. ${t.title}`).join('\n');

  const agentsMdSection =
    agentsMdContent !== null
      ? `## Project Conventions (AGENTS.md)

The following conventions apply to this repository. Follow them exactly.

${agentsMdContent}

`
      : '';

  const boulderSection =
    boulderContext !== null
      ? `## Prior Context (Boulder)

The following context was captured from a previous session on this task:

\`\`\`json
${JSON.stringify(boulderContext, null, 2)}
\`\`\`

`
      : '';

  return `# Execution Phase — ${ticket.key} / Wave ${wave.number}

## Project
- **Name**: ${projectMeta.name}
- **Repository**: ${projectMeta.repoUrl}
- **Plan file**: \`${planPath}\`

## Ticket
- **Key**: ${ticket.key}
- **Summary**: ${ticket.summary}

## Description
${ticket.description}

${agentsMdSection}${boulderSection}## Current Wave: Wave ${wave.number}

You are executing **Wave ${wave.number}** of the plan. The tasks assigned to this wave are:

${taskList}

**IMPORTANT: Only work on tasks in the current wave. Do not touch tasks from other waves.**

## Completion Gate

Before marking any task complete, you MUST run:

\`\`\`
pnpm lint && pnpm build && pnpm test -- --run
\`\`\`

All three commands must pass without errors. Fix any failures before proceeding.

## Commit Format

Use conventional commits for every commit in this wave:

\`\`\`
feat(wave-${wave.number}): <short description of what was done>
\`\`\`

Rules:
- Type is always \`feat\` for wave work unless it is purely a bug fix (\`fix\`) or documentation (\`docs\`)
- Scope is always \`wave-${wave.number}\`
- Description is lowercase, imperative mood, no period at the end
- Do not add co-author lines or tool attribution to commit messages

## Task Tracking

After completing each task, update the plan file at \`${planPath}\` by changing the task's checkbox from \`- [ ]\` to \`- [x]\` for that specific task number.

Only mark a task complete after the completion gate passes.

## Done

You are done with this wave when all tasks above have \`[x]\` in the plan file and the completion gate passes.
`;
}

export function buildCorrectionPrompt(
  ticket: TicketInfo,
  rejectionReason: string,
  attempt: number,
): string {
  const planPath = `.sisyphus/plans/${ticket.key}.md`;

  return `# ⚠️ PLANNING CORRECTION — Attempt ${attempt + 1}

## CRITICAL INSTRUCTION — READ FIRST

Your previous plan was REJECTED. You MUST write a NEW, COMPLETE plan file RIGHT NOW.

**DO NOT:**
- Ask clarifying questions
- Write a short summary or stub
- Write fewer than 500 bytes
- Use placeholder text like "Task title goes here", "TBD", or angle-bracket placeholders

**DO:**
- Explore the repository to understand what files and functions already exist
- Write the full plan file to \`${planPath}\` with REAL task titles (not placeholders)
- Include detailed task descriptions (not one-liners)
- Follow the EXACT format shown below

---

## Why Your Previous Plan Was Rejected

${rejectionReason}

## The Ticket You Must Plan For

- **Key**: ${ticket.key}
- **Summary**: ${ticket.summary}

### Ticket Description (implement EXACTLY this — no more, no less)
${ticket.description}

---

## Plan File Requirements

### File to write: \`${planPath}\`

### Size requirement: The file MUST be at least 500 bytes. This is enforced programmatically — shorter files will cause the task to fail.

### Format (STRICT — do not deviate from this grammar):

\`\`\`
# TICKET-KEY — Ticket Summary

Brief description of the overall implementation approach, explaining what will be built
and how the work is broken into waves.

## Wave 1

- [ ] 1. Task title — detailed description of what this task involves
- [ ] 2. Task title — detailed description of what this task involves
- [ ] 3. Task title — detailed description of what this task involves

## Wave 2

- [ ] 1. Task title — detailed description of what this task involves
\`\`\`

### Grammar rules (must be followed exactly):
- Wave headers: exactly \`## Wave N\` where N is a 1-indexed integer (## Wave 1, ## Wave 2, etc.)
- Task lines: exactly \`- [ ] N. Title\` where N matches position in that wave (space between \`-\` and \`[\`, space inside \`[ ]\`)
- Minimum 2 waves, minimum 1 task per wave
- Plan file must be at least 500 bytes — add detail to task descriptions if needed
- Do NOT use \`- [x]\` — all tasks start unchecked

---

## Concrete Example of a VALID Plan

Here is an example of a correctly formatted plan for a \`formatCurrency\` ticket.
**Copy this structure** — replace content to match your ticket:

\`\`\`markdown
# TICKET-123 — Implement formatCurrency utility function

Implement a \`formatCurrency(amount, currency)\` utility function in the shared utils module.
The function will format a numeric amount into a locale-aware currency string.
Work is split into two waves: implementation then test coverage.

## Wave 1

- [ ] 1. Create formatCurrency function in src/utils/currency.ts — implement the function that
  accepts a numeric amount and ISO 4217 currency code, uses Intl.NumberFormat for locale-aware
  formatting, handles edge cases (null, undefined, NaN), and exports the function
- [ ] 2. Add TypeScript types and JSDoc — add parameter types, return type annotation, and
  JSDoc comment describing parameters, return value, and example usage
- [ ] 3. Export from barrel file — add the formatCurrency export to src/utils/index.ts
  so it can be imported from the package root

## Wave 2

- [ ] 1. Write unit tests in src/utils/currency.test.ts — cover happy path with USD/EUR/GBP,
  edge cases (zero, negative, large numbers), and invalid input handling using vitest
- [ ] 2. Run completion gate and fix any failures — run pnpm lint && pnpm build && pnpm test
  and address any TypeScript errors, lint violations, or failing tests before marking done
\`\`\`

---

## Your Plan Must Cover: ${ticket.summary}

Write the plan file to \`${planPath}\` NOW. Match the ticket description exactly.
Include detailed descriptions for each task (not just titles).
The plan file must be at least 500 bytes — add context and detail to reach this minimum.

**After writing the file, exit the session immediately. Do not begin implementation.**
`;
}

export async function buildContinuationPrompt(
  uncheckedTasks: ParsedTask[],
  waveNumber: number,
): Promise<string> {
  const taskList = uncheckedTasks.map((t) => `- [ ] ${t.number}. ${t.title}`).join('\n');

  return `# Continuation — Wave ${waveNumber}

The previous session ended before all tasks in Wave ${waveNumber} were completed.

## Remaining Tasks

These tasks in Wave ${waveNumber} are still unchecked. Continue:

${taskList}

Complete each task, run the completion gate (\`pnpm lint && pnpm build && pnpm test -- --run\`), and mark it done in the plan file before moving to the next.
`;
}
