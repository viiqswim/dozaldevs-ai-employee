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

// Admin Project CRUD
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

// Loose UUID regex — accepts any 8-4-4-4-12 hex pattern including system tenant IDs
// (Zod's z.string().uuid() enforces strict RFC 4122 version/variant bits which rejects
// the system tenant ID '00000000-0000-0000-0000-000000000001')
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = () =>
  z.string().regex(UUID_REGEX, 'Invalid UUID — expected 8-4-4-4-12 hex format');

// URL params for POST /admin/tenants/:tenantId/employees/:slug/trigger
export const TriggerEmployeeParamsSchema = z.object({
  tenantId: uuidField(),
  // slug is the archetype role_name, must be lowercase alphanumeric + hyphens
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens only'),
});
export type TriggerEmployeeParams = z.infer<typeof TriggerEmployeeParamsSchema>;

// Query params for ?dry_run=true (Express delivers query params as strings)
export const TriggerEmployeeQuerySchema = z.object({
  dry_run: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type TriggerEmployeeQuery = z.infer<typeof TriggerEmployeeQuerySchema>;

// URL params for GET /admin/tenants/:tenantId/tasks/:id
export const GetTaskParamsSchema = z.object({
  tenantId: uuidField(),
  id: uuidField(),
});
export type GetTaskParams = z.infer<typeof GetTaskParamsSchema>;

export const CreateTenantBodySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens only'),
  config: z.record(z.string(), z.unknown()).optional(),
});
export type CreateTenantBody = z.infer<typeof CreateTenantBodySchema>;

export const UpdateTenantBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });
export type UpdateTenantBody = z.infer<typeof UpdateTenantBodySchema>;

export const TenantIdParamSchema = z.object({
  tenantId: uuidField(),
});
export type TenantIdParam = z.infer<typeof TenantIdParamSchema>;

export const SecretKeyParamSchema = z.object({
  tenantId: uuidField(),
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase alphanumeric with underscores only'),
});
export type SecretKeyParam = z.infer<typeof SecretKeyParamSchema>;

export const SetSecretBodySchema = z.object({
  value: z.string().min(1).max(10000),
});
export type SetSecretBody = z.infer<typeof SetSecretBodySchema>;

export const TenantConfigBodySchema = z.object({
  summary: z
    .object({
      channel_ids: z.array(z.string()).optional(),
      target_channel: z.string().optional(),
    })
    .optional(),
});
export type TenantConfigBody = z.infer<typeof TenantConfigBodySchema>;

export const SlackOAuthStateSchema = z.object({
  tenant_id: uuidField(),
  nonce: z.string().length(32),
});
export type SlackOAuthState = z.infer<typeof SlackOAuthStateSchema>;
