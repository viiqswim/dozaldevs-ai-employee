import { z } from 'zod';

// Jira issue_created / issue_updated schemas
const JiraProjectSchema = z.object({
  id: z.string().optional(),
  key: z.string(),
  name: z.string().optional(),
  self: z.string().optional(),
});

const JiraFieldsSchema = z
  .object({
    summary: z.string(),
    description: z.string().nullable().optional(),
    issuetype: z.object({ name: z.string() }).optional(),
    project: JiraProjectSchema,
    status: z.object({ name: z.string() }).optional(),
    priority: z.object({ name: z.string() }).optional(),
    labels: z.array(z.string()).optional(),
    reporter: z
      .object({
        displayName: z.string(),
        emailAddress: z.string().optional(),
        accountId: z.string().optional(),
      })
      .optional(),
    assignee: z.unknown().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
  })
  .passthrough();

const JiraIssueSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    self: z.string().optional(),
    fields: JiraFieldsSchema,
  })
  .passthrough();

export const JiraWebhookSchema = z
  .object({
    webhookEvent: z.string(),
    timestamp: z.number().optional(),
    issue: JiraIssueSchema,
    user: z.unknown().optional(),
  })
  .passthrough();

// Jira issue_deleted schema (minimal — just needs issue.key)
export const JiraIssueDeletedSchema = z
  .object({
    webhookEvent: z.string(),
    timestamp: z.number().optional(),
    issue: z
      .object({
        id: z.string().optional(),
        key: z.string(),
        fields: z
          .object({
            project: z.object({ key: z.string() }).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

// GitHub PR webhook schema (stub for M4 — minimal validation)
export const GitHubPRWebhookSchema = z
  .object({
    action: z.string(),
    pull_request: z
      .object({
        number: z.number(),
      })
      .passthrough(),
    repository: z
      .object({
        full_name: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

// TypeScript types
export type JiraWebhookPayload = z.infer<typeof JiraWebhookSchema>;
export type JiraIssueDeletedPayload = z.infer<typeof JiraIssueDeletedSchema>;
export type GitHubPRWebhookPayload = z.infer<typeof GitHubPRWebhookSchema>;

// Parse helpers
export function parseJiraWebhook(body: unknown): JiraWebhookPayload {
  return JiraWebhookSchema.parse(body);
}

export function parseJiraIssueDeletion(body: unknown): JiraIssueDeletedPayload {
  return JiraIssueDeletedSchema.parse(body);
}

// ────────────────────────────────────────────────────────────
// Admin Project CRUD
// ────────────────────────────────────────────────────────────

import { parseRepoOwnerAndName } from '../../lib/repo-url.js';

export const ToolingConfigSchema = z
  .object({
    install: z.string().optional(),
    typescript: z.string().optional(),
    lint: z.string().optional(),
    unit: z.string().optional(),
    integration: z.string().optional(),
    e2e: z.string().optional(),
  })
  .strict();

export type ToolingConfigInput = z.infer<typeof ToolingConfigSchema>;

const ProjectFieldsSchema = z.object({
  name: z.string().min(1, 'name is required'),
  repo_url: z.string().refine(
    (url) => {
      try {
        parseRepoOwnerAndName(url);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: 'repo_url must be a valid HTTPS GitHub URL (e.g. https://github.com/owner/repo)',
    },
  ),
  jira_project_key: z.string().min(1, 'jira_project_key is required'),
  default_branch: z.string().optional(),
  concurrency_limit: z.number().int().positive().optional(),
  tooling_config: ToolingConfigSchema.optional(),
});

export const CreateProjectSchema = ProjectFieldsSchema.extend({
  default_branch: z.string().optional().default('main'),
  concurrency_limit: z.number().int().positive().optional().default(3),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = ProjectFieldsSchema.partial().superRefine((obj, ctx) => {
  if (Object.keys(obj).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required for update',
    });
  }
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

export function parseCreateProject(body: unknown): CreateProjectInput {
  return CreateProjectSchema.parse(body);
}

export function parseUpdateProject(body: unknown): UpdateProjectInput {
  return UpdateProjectSchema.parse(body);
}
