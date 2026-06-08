export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const INNGEST_EVENT_KEY = getEnv('INNGEST_EVENT_KEY', 'local');
export const INNGEST_BASE_URL = getEnv('INNGEST_BASE_URL', 'http://localhost:8288');
export const GATEWAY_URL = getEnv('GATEWAY_URL', '');
export const WORKER_RUNTIME = getEnv('WORKER_RUNTIME', 'docker');
export const FLY_WORKER_IMAGE = getEnv(
  'FLY_WORKER_IMAGE',
  'registry.fly.io/ai-employee-workers:latest',
);

// ─── Lazy env getters ─────────────────────────────────────────────────────────

// Platform core
export const PORT = (): string => process.env.PORT ?? '7700';
export const ADMIN_API_KEY = (): string => process.env.ADMIN_API_KEY ?? '';
export const ENCRYPTION_KEY = (): string => process.env.ENCRYPTION_KEY ?? '';

// Supabase / PostgREST
export const SUPABASE_URL = (): string => process.env.SUPABASE_URL ?? '';
export const SUPABASE_SECRET_KEY = (): string => process.env.SUPABASE_SECRET_KEY ?? '';
export const SUPABASE_ANON_KEY = (): string => process.env.SUPABASE_ANON_KEY ?? '';

// Slack OAuth
export const SLACK_CLIENT_ID = (): string => process.env.SLACK_CLIENT_ID ?? '';
export const SLACK_CLIENT_SECRET = (): string => process.env.SLACK_CLIENT_SECRET ?? '';
export const SLACK_REDIRECT_BASE_URL = (): string =>
  process.env.SLACK_REDIRECT_BASE_URL ?? `http://localhost:${PORT()}`;

// Google OAuth
export const GOOGLE_CLIENT_ID = (): string => process.env.GOOGLE_CLIENT_ID ?? '';
export const GOOGLE_CLIENT_SECRET = (): string => process.env.GOOGLE_CLIENT_SECRET ?? '';
export const GOOGLE_REDIRECT_BASE_URL = (): string =>
  process.env.GOOGLE_REDIRECT_BASE_URL ?? `http://localhost:${PORT()}`;

// Jira OAuth
export const JIRA_CLIENT_ID = (): string => process.env.JIRA_CLIENT_ID ?? '';
export const JIRA_CLIENT_SECRET = (): string => process.env.JIRA_CLIENT_SECRET ?? '';
export const JIRA_REDIRECT_BASE_URL = (): string =>
  process.env.JIRA_REDIRECT_BASE_URL ?? `http://localhost:${PORT()}`;

// Notion OAuth
export const NOTION_CLIENT_ID = (): string => process.env.NOTION_CLIENT_ID ?? '';
export const NOTION_CLIENT_SECRET = (): string => process.env.NOTION_CLIENT_SECRET ?? '';
export const NOTION_REDIRECT_BASE_URL = (): string =>
  process.env.NOTION_REDIRECT_BASE_URL ?? `http://localhost:${PORT()}`;
