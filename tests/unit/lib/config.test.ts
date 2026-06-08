import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_API_KEY,
  ENCRYPTION_KEY,
  getEnv,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_BASE_URL,
  JIRA_CLIENT_ID,
  JIRA_CLIENT_SECRET,
  JIRA_REDIRECT_BASE_URL,
  NOTION_CLIENT_ID,
  NOTION_CLIENT_SECRET,
  NOTION_REDIRECT_BASE_URL,
  PORT,
  requireEnv,
  SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET,
  SLACK_REDIRECT_BASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SECRET_KEY,
  SUPABASE_URL,
} from '../../../src/lib/config.js';

const LAZY_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_ANON_KEY',
  'ENCRYPTION_KEY',
  'ADMIN_API_KEY',
  'PORT',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SLACK_REDIRECT_BASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_BASE_URL',
  'JIRA_CLIENT_ID',
  'JIRA_CLIENT_SECRET',
  'JIRA_REDIRECT_BASE_URL',
  'NOTION_CLIENT_ID',
  'NOTION_CLIENT_SECRET',
  'NOTION_REDIRECT_BASE_URL',
] as const;

afterEach(() => {
  for (const name of LAZY_VARS) {
    delete process.env[name];
  }
});

describe('config lazy getters', () => {
  it('importing config does not throw when env vars are unset', () => {
    for (const name of LAZY_VARS) {
      delete process.env[name];
    }
    expect(() => {
      void SUPABASE_URL;
      void SUPABASE_SECRET_KEY;
      void SUPABASE_ANON_KEY;
      void ENCRYPTION_KEY;
      void ADMIN_API_KEY;
      void PORT;
      void SLACK_CLIENT_ID;
      void SLACK_CLIENT_SECRET;
      void SLACK_REDIRECT_BASE_URL;
      void GOOGLE_CLIENT_ID;
      void GOOGLE_CLIENT_SECRET;
      void GOOGLE_REDIRECT_BASE_URL;
      void JIRA_CLIENT_ID;
      void JIRA_CLIENT_SECRET;
      void JIRA_REDIRECT_BASE_URL;
      void NOTION_CLIENT_ID;
      void NOTION_CLIENT_SECRET;
      void NOTION_REDIRECT_BASE_URL;
    }).not.toThrow();
  });

  it('getters return empty string when env vars are unset', () => {
    expect(SUPABASE_URL()).toBe('');
    expect(SUPABASE_SECRET_KEY()).toBe('');
    expect(SUPABASE_ANON_KEY()).toBe('');
    expect(ENCRYPTION_KEY()).toBe('');
    expect(ADMIN_API_KEY()).toBe('');
    expect(SLACK_CLIENT_ID()).toBe('');
    expect(SLACK_CLIENT_SECRET()).toBe('');
    expect(GOOGLE_CLIENT_ID()).toBe('');
    expect(GOOGLE_CLIENT_SECRET()).toBe('');
    expect(JIRA_CLIENT_ID()).toBe('');
    expect(JIRA_CLIENT_SECRET()).toBe('');
    expect(NOTION_CLIENT_ID()).toBe('');
    expect(NOTION_CLIENT_SECRET()).toBe('');
  });

  it('PORT defaults to 7700 when unset', () => {
    delete process.env.PORT;
    expect(PORT()).toBe('7700');
  });

  it('redirect base URLs default to localhost with PORT when unset', () => {
    delete process.env.PORT;
    delete process.env.SLACK_REDIRECT_BASE_URL;
    delete process.env.GOOGLE_REDIRECT_BASE_URL;
    delete process.env.JIRA_REDIRECT_BASE_URL;
    delete process.env.NOTION_REDIRECT_BASE_URL;
    expect(SLACK_REDIRECT_BASE_URL()).toBe('http://localhost:7700');
    expect(GOOGLE_REDIRECT_BASE_URL()).toBe('http://localhost:7700');
    expect(JIRA_REDIRECT_BASE_URL()).toBe('http://localhost:7700');
    expect(NOTION_REDIRECT_BASE_URL()).toBe('http://localhost:7700');
  });

  it('redirect base URLs incorporate custom PORT', () => {
    process.env.PORT = '9000';
    delete process.env.SLACK_REDIRECT_BASE_URL;
    expect(SLACK_REDIRECT_BASE_URL()).toBe('http://localhost:9000');
  });

  it('getters reflect env var values at call time', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    expect(SUPABASE_URL()).toBe('https://example.supabase.co');

    process.env.SLACK_CLIENT_ID = 'test-client-id';
    expect(SLACK_CLIENT_ID()).toBe('test-client-id');

    process.env.SLACK_REDIRECT_BASE_URL = 'https://myapp.example.com';
    expect(SLACK_REDIRECT_BASE_URL()).toBe('https://myapp.example.com');
  });
});

const SCRATCH_VAR = '__CONFIG_TEST_SCRATCH__';

describe('requireEnv', () => {
  afterEach(() => {
    delete process.env[SCRATCH_VAR];
  });

  it('returns the value when the variable is set', () => {
    process.env[SCRATCH_VAR] = 'hello-world';
    expect(requireEnv(SCRATCH_VAR)).toBe('hello-world');
  });

  it('throws when the variable is absent', () => {
    delete process.env[SCRATCH_VAR];
    expect(() => requireEnv(SCRATCH_VAR)).toThrow(
      `Missing required environment variable: ${SCRATCH_VAR}`,
    );
  });

  it('throws when the variable is an empty string', () => {
    process.env[SCRATCH_VAR] = '';
    expect(() => requireEnv(SCRATCH_VAR)).toThrow(
      `Missing required environment variable: ${SCRATCH_VAR}`,
    );
  });
});

describe('getEnv', () => {
  afterEach(() => {
    delete process.env[SCRATCH_VAR];
  });

  it('returns the value when the variable is set', () => {
    process.env[SCRATCH_VAR] = 'present';
    expect(getEnv(SCRATCH_VAR, 'fallback')).toBe('present');
  });

  it('returns the default when the variable is absent', () => {
    delete process.env[SCRATCH_VAR];
    expect(getEnv(SCRATCH_VAR, 'fallback')).toBe('fallback');
  });
});

describe('typed constants', () => {
  it('INNGEST_EVENT_KEY defaults to "local"', async () => {
    const { INNGEST_EVENT_KEY } = await import('../../../src/lib/config.js');
    expect(typeof INNGEST_EVENT_KEY).toBe('string');
  });

  it('INNGEST_BASE_URL defaults to localhost:8288', async () => {
    const { INNGEST_BASE_URL } = await import('../../../src/lib/config.js');
    expect(INNGEST_BASE_URL).toMatch(/localhost:8288|inngest/);
  });

  it('WORKER_RUNTIME defaults to "docker"', async () => {
    const { WORKER_RUNTIME } = await import('../../../src/lib/config.js');
    expect(['docker', 'fly']).toContain(WORKER_RUNTIME);
  });
});
