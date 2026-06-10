import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '../../../src/gateway/server.js';

describe('Gateway startup validation', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env.JIRA_WEBHOOK_SECRET = savedEnv.JIRA_WEBHOOK_SECRET;
  });

  it('warns but does not throw if JIRA_WEBHOOK_SECRET is missing', async () => {
    delete process.env.JIRA_WEBHOOK_SECRET;
    const result = await buildApp();
    expect(result.app).toBeDefined();
  });

  it('succeeds when JIRA_WEBHOOK_SECRET is set', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'test-secret';
    const result = await buildApp();
    expect(result.app).toBeDefined();
  });
});
