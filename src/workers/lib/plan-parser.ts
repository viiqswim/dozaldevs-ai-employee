import { createLogger } from '../../lib/logger.js';

const log = createLogger('plan-parser');

export interface ParsedTask {
  number: number;
  title: string;
  completed: boolean;
}

export interface ParsedWave {
  number: number;
  tasks: ParsedTask[];
}

export interface ParsedPlan {
  waves: ParsedWave[];
  totalWaves: number;
  totalTasks: number;
  completedTasks: number;
}

/** Strict grammar: Wave header line */
const WAVE_HEADER_RE = /^## Wave (\d+)/;

/** Strict grammar: Task checkbox line */
const TASK_LINE_RE = /^- \[([ x])\] (\d+)\. (.+?)$/;

/**
 * Parses a plan file string into a structured ParsedPlan.
 *
 * Grammar rules (strict):
 *   - Wave header: `## Wave N` (N is 1-indexed)
 *   - Task line: `- [ ] N. Title` or `- [x] N. Title`
 *   - Lines not matching either pattern are ignored
 *
 * @throws {Error} if plan has 0 waves, 0 tasks, or content < 500 bytes
 */
export function parsePlan(content: string): ParsedPlan {
  if (content.length < 500) {
    throw new Error(`Plan content too short: ${content.length} bytes (minimum 500)`);
  }

  const lines = content.split('\n');
  const waves: ParsedWave[] = [];
  let currentWave: ParsedWave | null = null;

  for (const line of lines) {
    const waveMatch = WAVE_HEADER_RE.exec(line);
    if (waveMatch) {
      currentWave = { number: parseInt(waveMatch[1]!, 10), tasks: [] };
      waves.push(currentWave);
      continue;
    }

    const taskMatch = TASK_LINE_RE.exec(line);
    if (taskMatch && currentWave) {
      currentWave.tasks.push({
        completed: taskMatch[1] === 'x',
        number: parseInt(taskMatch[2]!, 10),
        title: taskMatch[3]!.trim(),
      });
    }
  }

  if (waves.length === 0) {
    throw new Error('Plan has no waves (expected at least 1 `## Wave N` header)');
  }

  const totalTasks = waves.reduce((sum, w) => sum + w.tasks.length, 0);
  if (totalTasks === 0) {
    throw new Error('Plan has no tasks (expected at least 1 `- [ ] N. Title` line)');
  }

  const completedTasks = waves.flatMap((w) => w.tasks).filter((t) => t.completed).length;

  log.info({ totalWaves: waves.length, totalTasks, completedTasks }, 'Plan parsed successfully');

  return {
    waves,
    totalWaves: waves.length,
    totalTasks,
    completedTasks,
  };
}

/**
 * Returns the next incomplete wave, or null if all waves are done.
 */
export function getNextIncompleteWave(plan: ParsedPlan): ParsedWave | null {
  return plan.waves.find((w) => w.tasks.some((t) => !t.completed)) ?? null;
}

/**
 * Returns true if all tasks in all waves are completed.
 */
export function isPlanComplete(plan: ParsedPlan): boolean {
  return plan.waves.every((w) => w.tasks.every((t) => t.completed));
}
