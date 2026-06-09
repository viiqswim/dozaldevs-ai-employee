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

// used by AGENTS.md documentation and route handlers that accept tenant/task UUIDs
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidField = () =>
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

// Query params for ?dry_run=true (Express delivers query params as strings)
export const TriggerEmployeeQuerySchema = z.object({
  dry_run: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

// URL params for GET /admin/tenants/:tenantId/tasks/:id
export const GetTaskParamsSchema = z.object({
  tenantId: uuidField(),
  id: uuidField(),
});

// URL params for /admin/tenants/:tenantId/projects/:id
export const TenantProjectParamSchema = z.object({
  tenantId: uuidField(),
  id: uuidField(),
});

export const CreateTenantBodySchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens only'),
  config: z.record(z.string(), z.unknown()).optional(),
});

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

export const TenantIdParamSchema = z.object({
  tenantId: uuidField(),
});

export const SecretKeyParamSchema = z.object({
  tenantId: uuidField(),
  key: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, 'key must be lowercase alphanumeric with underscores only'),
});

export const SetSecretBodySchema = z.object({
  value: z.string().min(1).max(10000),
});

export const TenantConfigBodySchema = z.object({
  notification_channel: z.string().optional(),
  source_channels: z.array(z.string()).optional(),
  summary: z
    .object({
      channel_ids: z.array(z.string()).optional(),
      target_channel: z.string().optional(),
      publish_channel: z.string().optional(),
    })
    .optional(),
});

export const SlackOAuthStateSchema = z.object({
  tenant_id: uuidField(),
  nonce: z.string().length(32),
});

// ─── Knowledge Base Entry CRUD ────────────────────────────────────────────────

export const CreateKbEntrySchema = z
  .object({
    entity_type: z.string().min(1).max(100).optional(),
    entity_id: z.string().min(1).max(500).optional(),
    content: z
      .string()
      .min(1, 'content is required')
      .max(100000, 'content must be under 100,000 characters'),
  })
  .refine((data) => !(data.entity_id && !data.entity_type), {
    message: 'entity_type is required when entity_id is provided',
    path: ['entity_type'],
  });

export const UpdateKbEntrySchema = z.object({
  content: z
    .string()
    .min(1, 'content is required')
    .max(100000, 'content must be under 100,000 characters'),
});

export const ListKbEntriesQuerySchema = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
});

export const KbEntryIdParamSchema = z.object({
  tenantId: uuidField(),
  entryId: uuidField(),
});

export const KbEntryTenantParamSchema = z.object({
  tenantId: uuidField(),
});

// ─── Hostfully Webhook ────────────────────────────────────────────────────────

const HostfullyWebhookPayloadSchema = z
  .object({
    agency_uid: z.string().min(1),
    event_type: z.string().min(1),
    message_uid: z.string().min(1),
    thread_uid: z.string().min(1),
    lead_uid: z.string().optional(),
    property_uid: z.string().optional(),
    message_content: z.string().optional(),
    created: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
  })
  .passthrough();

export type HostfullyWebhookPayload = z.infer<typeof HostfullyWebhookPayloadSchema>;

export function parseHostfullyWebhook(body: unknown): HostfullyWebhookPayload {
  return HostfullyWebhookPayloadSchema.parse(body);
}

// ─── Property Lock CRUD ───────────────────────────────────────────────────────

export const CreatePropertyLockSchema = z.object({
  property_external_id: z.string().min(1),
  lock_external_id: z.string().min(1),
  lock_name: z.string().min(1),
  lock_provider: z.string().default('sifely'),
  lock_role: z.string().optional(),
  property_type: z.string().min(1),
  property_name: z.string().min(1),
  passcode_name: z.string().optional(),
  lock_metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdatePropertyLockSchema = CreatePropertyLockSchema.partial();

export const TenantPropertyLockParamSchema = TenantIdParamSchema.extend({
  lockId: uuidField(),
});

// ─── Input Schema (dynamic employee inputs) ───────────────────────────────────

export const InputSchemaItemSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        'Key must be snake_case (lowercase letters, digits, underscores)',
      ),
    label: z.string().min(1).max(100),
    type: z.enum(['text', 'long_text', 'date', 'number', 'url', 'select']),
    frequency: z.enum(['once', 'every_run']),
    required: z.boolean(),
    description: z.string().max(500).optional(),
    options: z.array(z.string()).optional(),
    default_value: z.string().optional(),
  })
  .refine((item) => item.type !== 'select' || (item.options && item.options.length > 0), {
    message: 'options must be provided and non-empty when type is "select"',
    path: ['options'],
  });

export type InputSchemaItem = z.infer<typeof InputSchemaItemSchema>;

export const InputSchemaSchema = z.array(InputSchemaItemSchema);

// ─── Employee Rules CRUD ──────────────────────────────────────────────────────

export const RuleArchetypeParamsSchema = z.object({
  tenantId: uuidField(),
  archetypeId: uuidField(),
});

export const RuleIdParamsSchema = RuleArchetypeParamsSchema.extend({
  ruleId: uuidField(),
});

export const CreateRuleBodySchema = z.object({
  rule_text: z.string().min(1, 'rule_text is required').max(10000),
  status: z.enum(['confirmed', 'rejected']).optional().default('confirmed'),
});

export const UpdateRuleBodySchema = z
  .object({
    rule_text: z.string().min(1).max(10000).optional(),
    status: z.enum(['confirmed', 'rejected']).optional(),
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });
