import * as fs from 'fs';
import { createLogger } from '../../lib/logger.js';
import { buildExecutionPrompt } from './prompt-builder.js';
import type { ParsedWave } from './plan-parser.js';

const log = createLogger('task-context');

/**
 * Tooling configuration for a project.
 * Each field is an optional command string that can be executed during validation.
 */
export interface ToolingConfig {
  install?: string;
  typescript?: string;
  lint?: string;
  unit?: string;
  integration?: string;
  e2e?: string;
}

/**
 * Default tooling configuration applied to all projects.
 * Projects can override these with their own config.
 */
export const DEFAULT_TOOLING_CONFIG: ToolingConfig = {
  install: 'pnpm install --frozen-lockfile',
  typescript: 'pnpm tsc --noEmit',
  lint: 'pnpm lint',
  unit: 'pnpm test -- --run',
  // integration and e2e have no defaults — skip if not configured
};

/**
 * Task row from the database (PostgREST response format).
 * Represents a single task with its metadata and triage result.
 */
export interface TaskRow {
  id: string;
  external_id: string;
  status: string;
  triage_result: unknown;
  requirements: unknown | null;
  project_id: string | null;
  source_system?: string;
  raw_event?: unknown;
  dispatch_attempts?: number;
  failure_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Project row from the database.
 * Contains project metadata including tooling configuration.
 */
export interface ProjectRow {
  id: string;
  tooling_config: ToolingConfig | null;
  name?: string;
  repo_url?: string;
  default_branch?: string;
  jira_project_key?: string;
}

/**
 * Jira webhook payload structure (simplified for type safety).
 */
interface JiraPayload {
  webhookEvent?: string;
  issue?: {
    id?: string;
    key?: string;
    fields?: {
      summary?: string;
      description?: string | { content?: Array<{ content?: Array<{ text?: string }> }> };
      project?: {
        key?: string;
      };
    };
  };
}

// Parse task context from a JSON file.
export function parseTaskContext(filePath: string): TaskRow | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);

    // PostgREST returns an array; extract first element
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed[0] as TaskRow;
    }

    return null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.warn(`[task-context] Failed to parse task context from ${filePath}: ${errorMsg}`);
    return null;
  }
}

// Render Jira description (which can be a complex ADF structure) to plain text.
function renderDescription(description: unknown): string {
  if (!description) {
    return '';
  }

  // Simple string description
  if (typeof description === 'string') {
    return description;
  }

  // Atlassian Document Format (ADF) — extract text from nested content
  if (typeof description === 'object' && description !== null) {
    const obj = description as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      const texts: string[] = [];
      const extractText = (content: unknown): void => {
        if (Array.isArray(content)) {
          content.forEach((item) => {
            if (typeof item === 'object' && item !== null) {
              const itemObj = item as Record<string, unknown>;
              if (typeof itemObj.text === 'string') {
                texts.push(itemObj.text);
              }
              if (Array.isArray(itemObj.content)) {
                extractText(itemObj.content);
              }
            }
          });
        }
      };
      extractText(obj.content);
      return texts.join('\n').trim();
    }
  }

  return '';
}

export async function buildPrompt(task: TaskRow): Promise<string> {
  const jiraPayload = task.triage_result as JiraPayload | null;

  if (!jiraPayload || typeof jiraPayload !== 'object' || !jiraPayload.issue) {
    return `Implement task ${task.external_id}: Please examine the codebase and implement the required changes.`;
  }

  const issue = jiraPayload.issue;
  const fields = issue.fields || {};
  const issueKey = issue.key || 'UNKNOWN';
  const summary = fields.summary || 'No summary provided';
  const description = renderDescription(fields.description) || 'No description provided';

  let requirementsText = '';
  if (task.requirements && typeof task.requirements === 'object') {
    try {
      requirementsText = '\n\n## Requirements\n' + JSON.stringify(task.requirements, null, 2);
    } catch {
      requirementsText = '';
    }
  }

  const syntheticWave: ParsedWave = {
    number: 1,
    tasks: [{ number: 1, title: summary, completed: false }],
  };

  return buildExecutionPrompt({
    ticket: {
      key: issueKey,
      summary,
      description: description + requirementsText,
    },
    repoRoot: '/workspace',
    projectMeta: { repoUrl: '', name: '' },
    wave: syntheticWave,
    planPath: '',
    agentsMdContent: null,
    boulderContext: null,
  });
}

// Resolve the effective tooling configuration for a project.
export function resolveToolingConfig(projectRow: ProjectRow | null): ToolingConfig {
  // If no project or no tooling config, return defaults
  if (!projectRow || !projectRow.tooling_config) {
    return DEFAULT_TOOLING_CONFIG;
  }

  // Merge project config with defaults (project config overrides)
  return {
    ...DEFAULT_TOOLING_CONFIG,
    ...projectRow.tooling_config,
  };
}
