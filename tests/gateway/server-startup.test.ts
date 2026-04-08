import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/gateway/server.js';

describe('Gateway startup validation', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore all env vars
    process.env.JIRA_WEBHOOK_SECRET = savedEnv.JIRA_WEBHOOK_SECRET;
    process.env.ADMIN_API_KEY = savedEnv.ADMIN_API_KEY;
  });

  it('throws if JIRA_WEBHOOK_SECRET is missing', async () => {
    delete process.env.JIRA_WEBHOOK_SECRET;
    process.env.ADMIN_API_KEY = 'test-key';
    await expect(buildApp()).rejects.toThrow('JIRA_WEBHOOK_SECRET');
  });

  it('throws if ADMIN_API_KEY is missing', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'test-secret';
    delete process.env.ADMIN_API_KEY;
    await expect(buildApp()).rejects.toThrow('ADMIN_API_KEY');
  });

  it('succeeds when both env vars are set', async () => {
    process.env.JIRA_WEBHOOK_SECRET = 'test-secret';
    process.env.ADMIN_API_KEY = 'test-key';
    const app = await buildApp();
    await app.close();
  });
});
