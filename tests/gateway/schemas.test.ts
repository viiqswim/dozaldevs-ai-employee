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
