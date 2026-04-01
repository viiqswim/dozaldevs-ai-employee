import * as fs from 'fs';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('task-context');

/**
 * Tooling configuration for a project.
 * Each field is an optional command string that can be executed during validation.
 */
export interface ToolingConfig {
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

/**
 * Parse task context from a JSON file.
 * Expects a PostgREST array response: [{...task row...}]
 * Returns the first element if array is non-empty, otherwise null.
 *
 * @param filePath - Path to the .task-context.json file
 * @returns TaskRow if found, null if file doesn't exist or array is empty
 */
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

/**
 * Render Jira description (which can be a complex ADF structure) to plain text.
 * Handles both simple string descriptions and Atlassian Document Format (ADF).
 *
 * @param description - The description field from Jira issue
 * @returns Plain text description or empty string
 */
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

/**
 * Build a structured markdown prompt from a task.
 * Extracts information from the Jira webhook payload (triage_result).
 * Falls back to a generic prompt if triage_result is missing or invalid.
 *
 * @param task - The task row containing triage_result and requirements
 * @returns Markdown-formatted prompt string
 */
export function buildPrompt(task: TaskRow): string {
  // Attempt to extract Jira payload from triage_result
  const jiraPayload = task.triage_result as JiraPayload | null;

  // Validate that we have a valid Jira payload
  if (!jiraPayload || typeof jiraPayload !== 'object' || !jiraPayload.issue) {
    // Fallback prompt for missing or invalid triage_result
    return `Implement task ${task.external_id}: Please examine the codebase and implement the required changes.`;
  }

  const issue = jiraPayload.issue;
  const fields = issue.fields || {};
  const issueKey = issue.key || 'UNKNOWN';
  const summary = fields.summary || 'No summary provided';
  const projectKey = fields.project?.key || 'UNKNOWN';
  const description = renderDescription(fields.description) || 'No description provided';

  // Build requirements section
  let requirementsSection = 'See description above';
  if (task.requirements && typeof task.requirements === 'object') {
    try {
      requirementsSection = JSON.stringify(task.requirements, null, 2);
    } catch {
      requirementsSection = 'See description above';
    }
  }

  return `# Task: ${issueKey} — ${summary}

## Ticket Information
- **Ticket ID**: ${task.external_id}
- **Project**: ${projectKey}

## Description
${description}

## Requirements
${requirementsSection}

## Instructions
Implement the requirements described above. Make all changes in the current working directory (/workspace). 
Write clean, well-tested code that follows the existing project conventions.
After implementing, ensure the code compiles without TypeScript errors.
`;
}

/**
 * Resolve the effective tooling configuration for a project.
 * Merges project-specific config with defaults, with project config taking precedence.
 *
 * @param projectRow - The project row from the database, or null
 * @returns Merged ToolingConfig with defaults applied
 */
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
