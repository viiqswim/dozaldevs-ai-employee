import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ZodError } from 'zod';
import {
  JiraWebhookSchema,
  JiraIssueDeletedSchema,
  GitHubPRWebhookSchema,
  parseJiraWebhook,
  parseJiraIssueDeletion,
  type JiraWebhookPayload,
  CreateTenantBodySchema,
  UpdateTenantBodySchema,
  TenantIdParamSchema,
  SecretKeyParamSchema,
  SetSecretBodySchema,
  TenantConfigBodySchema,
  SlackOAuthStateSchema,
} from '../../src/gateway/validation/schemas.js';

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve('test-payloads', name), 'utf8'));
}

describe('JiraWebhookSchema', () => {
  it('accepts the valid jira-issue-created fixture', () => {
    const fixture = loadFixture('jira-issue-created.json');
    expect(() => JiraWebhookSchema.parse(fixture)).not.toThrow();
  });

  it('rejects the invalid fixture (missing issue.key and summary)', () => {
    const fixture = loadFixture('jira-issue-created-invalid.json');
    expect(() => JiraWebhookSchema.parse(fixture)).toThrow(ZodError);
  });

  it('rejects payload missing issue.key', () => {
    const fixture = {
      webhookEvent: 'jira:issue_created',
      issue: {
        id: '10001',
        fields: { summary: 'Test', project: { key: 'TEST' } },
      },
    };
    expect(() => JiraWebhookSchema.parse(fixture)).toThrow(ZodError);
  });

  it('rejects payload missing issue.fields.summary', () => {
    const fixture = {
      webhookEvent: 'jira:issue_created',
      issue: {
        id: '10001',
        key: 'TEST-1',
        fields: {
          project: { key: 'TEST' },
        },
      },
    };
    expect(() => JiraWebhookSchema.parse(fixture)).toThrow(ZodError);
  });

  it('rejects payload missing issue.fields.project.key', () => {
    const fixture = {
      webhookEvent: 'jira:issue_created',
      issue: {
        id: '10001',
        key: 'TEST-1',
        fields: {
          summary: 'Test',
          project: {
            name: 'Test Project',
          },
        },
      },
    };
    expect(() => JiraWebhookSchema.parse(fixture)).toThrow(ZodError);
  });

  it('preserves extra fields (passthrough)', () => {
    const fixture = loadFixture('jira-issue-created.json') as Record<string, unknown>;
    const parsed = JiraWebhookSchema.parse(fixture);
    expect(parsed.webhookEvent).toBe('jira:issue_created');
  });
});

describe('parseJiraWebhook', () => {
  it('returns parsed payload with correct fields', () => {
    const fixture = loadFixture('jira-issue-created.json');
    const result = parseJiraWebhook(fixture);
    expect(result.issue.key).toBe('TEST-1');
    expect(result.issue.fields.summary).toBeTruthy();
    expect(result.issue.fields.project.key).toBe('TEST');
  });

  it('TypeScript type inference works (compile-time check)', () => {
    const fixture = loadFixture('jira-issue-created.json');
    const result: JiraWebhookPayload = parseJiraWebhook(fixture);
    const _key: string = result.issue.key;
    expect(_key).toBe('TEST-1');
  });
});

describe('JiraIssueDeletedSchema', () => {
  it('accepts the jira-issue-deleted fixture', () => {
    const fixture = loadFixture('jira-issue-deleted.json');
    expect(() => JiraIssueDeletedSchema.parse(fixture)).not.toThrow();
  });
});

describe('GitHubPRWebhookSchema', () => {
  it('accepts a valid GitHub PR payload', () => {
    const payload = {
      action: 'opened',
      pull_request: { number: 1, title: 'Test PR' },
      repository: { full_name: 'org/repo', html_url: 'https://github.com/org/repo' },
    };
    expect(() => GitHubPRWebhookSchema.parse(payload)).not.toThrow();
  });

  it('rejects payload missing action', () => {
    const payload = {
      pull_request: { number: 1 },
      repository: { full_name: 'org/repo' },
    };
    expect(() => GitHubPRWebhookSchema.parse(payload)).toThrow(ZodError);
  });
});

describe('CreateTenantBodySchema', () => {
  it('accepts valid input', () => {
    expect(() =>
      CreateTenantBodySchema.parse({ name: 'DozalDevs', slug: 'dozal-devs' }),
    ).not.toThrow();
  });

  it('rejects invalid slug with uppercase', () => {
    expect(() => CreateTenantBodySchema.parse({ name: 'Test', slug: 'MyTenant' })).toThrow(
      ZodError,
    );
  });

  it('rejects slug with spaces', () => {
    expect(() => CreateTenantBodySchema.parse({ name: 'Test', slug: 'my tenant' })).toThrow(
      ZodError,
    );
  });

  it('rejects empty name', () => {
    expect(() => CreateTenantBodySchema.parse({ name: '', slug: 'test' })).toThrow(ZodError);
  });
});

describe('UpdateTenantBodySchema', () => {
  it('accepts valid partial update', () => {
    expect(() => UpdateTenantBodySchema.parse({ name: 'New Name' })).not.toThrow();
  });

  it('accepts status update', () => {
    expect(() => UpdateTenantBodySchema.parse({ status: 'suspended' })).not.toThrow();
  });

  it('rejects empty object', () => {
    expect(() => UpdateTenantBodySchema.parse({})).toThrow(ZodError);
  });

  it('rejects invalid status value', () => {
    expect(() => UpdateTenantBodySchema.parse({ status: 'deleted' })).toThrow(ZodError);
  });
});

describe('TenantIdParamSchema', () => {
  it('accepts system tenant UUID', () => {
    expect(() =>
      TenantIdParamSchema.parse({ tenantId: '00000000-0000-0000-0000-000000000002' }),
    ).not.toThrow();
  });

  it('rejects non-UUID string', () => {
    expect(() => TenantIdParamSchema.parse({ tenantId: 'not-a-uuid' })).toThrow(ZodError);
  });
});

describe('SecretKeyParamSchema', () => {
  it('accepts valid key', () => {
    expect(() =>
      SecretKeyParamSchema.parse({
        tenantId: '00000000-0000-0000-0000-000000000002',
        key: 'slack_bot_token',
      }),
    ).not.toThrow();
  });

  it('rejects key with hyphens', () => {
    expect(() =>
      SecretKeyParamSchema.parse({
        tenantId: '00000000-0000-0000-0000-000000000002',
        key: 'slack-bot-token',
      }),
    ).toThrow(ZodError);
  });
});

describe('SetSecretBodySchema', () => {
  it('accepts valid value', () => {
    expect(() => SetSecretBodySchema.parse({ value: 'xoxb-token' })).not.toThrow();
  });

  it('rejects empty value', () => {
    expect(() => SetSecretBodySchema.parse({ value: '' })).toThrow(ZodError);
  });

  it('rejects oversized value', () => {
    expect(() => SetSecretBodySchema.parse({ value: 'x'.repeat(10001) })).toThrow(ZodError);
  });
});

describe('SlackOAuthStateSchema', () => {
  it('accepts valid state', () => {
    expect(() =>
      SlackOAuthStateSchema.parse({
        tenant_id: '00000000-0000-0000-0000-000000000002',
        nonce: 'a'.repeat(32),
      }),
    ).not.toThrow();
  });

  it('rejects nonce of wrong length', () => {
    expect(() =>
      SlackOAuthStateSchema.parse({
        tenant_id: '00000000-0000-0000-0000-000000000002',
        nonce: 'short',
      }),
    ).toThrow(ZodError);
  });
});

describe('TenantConfigBodySchema', () => {
  it('accepts valid body with notification_channel string', () => {
    const result = TenantConfigBodySchema.safeParse({ notification_channel: 'C_TEST_001' });
    expect(result.success).toBe(true);
  });

  it('rejects non-string notification_channel', () => {
    const result = TenantConfigBodySchema.safeParse({ notification_channel: 123 });
    expect(result.success).toBe(false);
  });

  it('accepts body without notification_channel (field is optional)', () => {
    const result = TenantConfigBodySchema.safeParse({ summary: { target_channel: 'C123' } });
    expect(result.success).toBe(true);
  });

  it('accepts valid body with source_channels array of strings', () => {
    const result = TenantConfigBodySchema.safeParse({
      source_channels: ['C001', 'C002', 'C003'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-array source_channels', () => {
    const result = TenantConfigBodySchema.safeParse({ source_channels: 'C001' });
    expect(result.success).toBe(false);
  });
});
