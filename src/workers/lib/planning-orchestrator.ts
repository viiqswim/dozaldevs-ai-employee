import path from 'node:path';
import fs from 'node:fs';
import type { SessionManager } from './session-manager.js';
import type { LongRunningConfig } from '../config/long-running.js';
import type { Logger } from '../../lib/logger.js';
import type { ParsedPlan } from './plan-parser.js';
import type { PlanJudge } from './plan-judge.js';
import { buildCorrectionPrompt } from './prompt-builder.js';

/**
 * Thrown when a plan file fails structural validation.
 * `errors` contains the list of validation failure messages.
 */
export class PlanValidationError extends Error {
  errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'PlanValidationError';
    this.errors = errors;
  }
}

export class PlanJudgeExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanJudgeExhaustedError';
  }
}

export interface Ticket {
  key: string;
  summary: string;
  description: string;
}

export interface ProjectMeta {
  repoUrl: string;
  name: string;
}

export interface PromptBuilder {
  buildPlanningPrompt(opts: { ticket: Ticket; repoRoot: string; projectMeta: ProjectMeta }): string;
}

export interface PlanParser {
  parsePlanFile(content: string): ParsedPlan;
  validatePlan(plan: ParsedPlan): { ok: boolean; errors: string[] };
}

export interface PlanningPhaseOptions {
  ticket: Ticket;
  repoRoot: string;
  projectMeta: ProjectMeta;
  sessionManager: SessionManager;
  promptBuilder: PromptBuilder;
  planParser: PlanParser;
  config: LongRunningConfig;
  logger: Logger;
  planJudge?: PlanJudge;
}

export interface PlanningPhaseResult {
  planContent: string;
  planPath: string;
}

/**
 * Runs Phase 1: spawns a dedicated OpenCode planning session, waits for it
 * to produce a plan file, validates the plan, then locks it read-only.
 *
 * @throws {Error} if session creation fails
 * @throws {Error} if the planning session times out
 * @throws {Error} if the plan file is not found on disk after the session
 * @throws {PlanValidationError} if the plan file fails structural validation
 */
export async function runPlanningPhase(opts: PlanningPhaseOptions): Promise<PlanningPhaseResult> {
  const {
    ticket,
    repoRoot,
    projectMeta,
    sessionManager,
    promptBuilder,
    planParser,
    config,
    logger,
    planJudge,
  } = opts;

  const prompt = promptBuilder.buildPlanningPrompt({ ticket, repoRoot, projectMeta });

  const sessionId = await sessionManager.createSession(`Planning: ${ticket.key}`);
  if (!sessionId) {
    throw new Error(`Failed to create planning session for ticket ${ticket.key}`);
  }

  logger.info({ sessionId, ticket: ticket.key }, 'Planning session created');

  await sessionManager.injectTaskPrompt(sessionId, prompt);

  const monitorResult = await sessionManager.monitorSession(sessionId, {
    timeoutMs: config.planningTimeoutMs,
  });

  if (!monitorResult.completed) {
    throw new Error(`Planning phase timed out after ${config.planningTimeoutMs}ms`);
  }

  const planPath = path.join(repoRoot, '.sisyphus', 'plans', `${ticket.key}.md`);

  try {
    await fs.promises.access(planPath);
  } catch {
    throw new Error(`Plan file not found at ${planPath} after planning phase`);
  }

  let planContent = await fs.promises.readFile(planPath, 'utf8');

  const parsed = planParser.parsePlanFile(planContent);

  const validationResult = planParser.validatePlan(parsed);
  if (!validationResult.ok) {
    throw new PlanValidationError(
      `Plan validation failed: ${validationResult.errors.join(', ')}`,
      validationResult.errors,
    );
  }

  if (planJudge != null && config.planVerifierModel !== '') {
    let attempt = 1;
    let currentContent = planContent;

    while (true) {
      const judgeResult = await planJudge(currentContent, ticket);
      logger.info(
        { verdict: judgeResult.verdict, attempt, checks: judgeResult.checks },
        'plan-judge: verdict=%s attempt=%d',
        judgeResult.verdict,
        attempt,
      );

      if (judgeResult.verdict === 'PASS') {
        break;
      }

      if (attempt >= 2) {
        throw new PlanJudgeExhaustedError(
          `Plan judge rejected plan after ${attempt} attempts. Last reason: ${judgeResult.rejection_reason ?? 'No reason given'}`,
        );
      }

      await fs.promises.unlink(planPath);

      const correctionPrompt = buildCorrectionPrompt(
        ticket,
        judgeResult.rejection_reason ?? 'Plan did not match ticket requirements',
        attempt,
      );

      const correctionSessionId = await sessionManager.createSession(
        `Planning (correction ${attempt}): ${ticket.key}`,
      );
      if (!correctionSessionId) {
        throw new Error(`Failed to create correction planning session for ticket ${ticket.key}`);
      }

      await sessionManager.injectTaskPrompt(correctionSessionId, correctionPrompt);

      const correctionMonitorResult = await sessionManager.monitorSession(correctionSessionId, {
        timeoutMs: config.planningTimeoutMs,
      });

      if (!correctionMonitorResult.completed) {
        throw new Error(`Correction planning phase timed out after ${config.planningTimeoutMs}ms`);
      }

      try {
        await fs.promises.access(planPath);
      } catch {
        throw new Error(`Plan file not found at ${planPath} after correction phase`);
      }

      currentContent = await fs.promises.readFile(planPath, 'utf8');

      const correctionParsed = planParser.parsePlanFile(currentContent);
      const correctionValidation = planParser.validatePlan(correctionParsed);
      if (!correctionValidation.ok) {
        throw new PlanValidationError(
          `Plan validation failed after correction: ${correctionValidation.errors.join(', ')}`,
          correctionValidation.errors,
        );
      }

      attempt++;
    }

    planContent = currentContent;
  }

  await fs.promises.chmod(planPath, 0o444);

  logger.info({ planPath, ticket: ticket.key }, 'Planning phase complete — plan locked read-only');

  return { planContent, planPath };
}
