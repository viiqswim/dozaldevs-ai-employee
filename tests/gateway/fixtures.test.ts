import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFixture(name: string): unknown {
  const content = readFileSync(resolve('test-payloads', name), 'utf8');
  return JSON.parse(content);
}

describe('Jira webhook test fixtures', () => {
  it('jira-issue-created.json is valid JSON and exists', () => {
    expect(() => loadFixture('jira-issue-created.json')).not.toThrow();
  });

  it('jira-issue-created-invalid.json is valid JSON and exists', () => {
    expect(() => loadFixture('jira-issue-created-invalid.json')).not.toThrow();
  });

  it('jira-issue-created-unknown-project.json is valid JSON and exists', () => {
    expect(() => loadFixture('jira-issue-created-unknown-project.json')).not.toThrow();
  });

  it('jira-issue-deleted.json is valid JSON and exists', () => {
    expect(() => loadFixture('jira-issue-deleted.json')).not.toThrow();
  });

  it('valid fixture has all required fields', () => {
    const payload = loadFixture('jira-issue-created.json') as Record<string, unknown>;
    expect(payload.webhookEvent).toBe('jira:issue_created');
    const issue = payload.issue as Record<string, unknown>;
    expect(issue.key).toBe('TEST-1');
    const fields = issue.fields as Record<string, unknown>;
    expect(fields.summary).toBeTruthy();
    const project = fields.project as Record<string, unknown>;
    expect(project.key).toBe('TEST');
  });

  it('invalid fixture is missing required fields (no issue.key)', () => {
    const payload = loadFixture('jira-issue-created-invalid.json') as Record<string, unknown>;
    const issue = payload.issue as Record<string, unknown>;
    expect(issue.key).toBeUndefined();
  });

  it('unknown-project fixture has unregistered project key', () => {
    const payload = loadFixture('jira-issue-created-unknown-project.json') as Record<
      string,
      unknown
    >;
    const issue = payload.issue as Record<string, unknown>;
    const fields = issue.fields as Record<string, unknown>;
    const project = fields.project as Record<string, unknown>;
    expect(project.key).toBe('UNKNOWN');
    expect(project.key).not.toBe('TEST');
  });
});
