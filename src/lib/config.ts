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

// ─── Env profile detection ────────────────────────────────────────────────────

/**
 * Detects whether the runtime is using the LOCAL or CLOUD Supabase profile
 * based on SUPABASE_URL and SUPABASE_ANON_KEY values.
 *
 * LOCAL  — http://localhost or http://127.0.0.1 URL + eyJ HS256 JWT key
 * CLOUD  — https://*.supabase.co URL + sb_ opaque publishable key
 *
 * Throws if the two signals are inconsistent (mixed profile).
 */
export function detectEnvProfile(): 'local' | 'cloud' {
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_ANON_KEY');

  const isLocalUrl = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
  const isCloudUrl = url.startsWith('https://') && url.includes('.supabase.co');
  const isLegacyKey = key.startsWith('eyJ'); // HS256 JWT
  const isOpaqueKey = key.startsWith('sb_'); // opaque publishable key

  if (isLocalUrl && isLegacyKey) return 'local';
  if (isCloudUrl && isOpaqueKey) return 'cloud';

  throw new Error(
    `Env profile mismatch: SUPABASE_URL="${url}" and SUPABASE_ANON_KEY prefix="${key.slice(0, 15)}..." ` +
      `are inconsistent. Use either all-local or all-cloud values.`,
  );
}

export function assertEnvProfile(): void {
  detectEnvProfile();
}

// ─── Lazy env getters ─────────────────────────────────────────────────────────

// Platform core
export const PORT = (): string => process.env.PORT ?? '7700';
export const ENCRYPTION_KEY = (): string => process.env.ENCRYPTION_KEY ?? '';
// Machine-to-machine auth token. Never expose to browser.
export const SERVICE_TOKEN = (): string => requireEnv('SERVICE_TOKEN');

// Database
export const DATABASE_URL = (): string => process.env.DATABASE_URL ?? '';

// Supabase / PostgREST
export const SUPABASE_URL = (): string => process.env.SUPABASE_URL ?? '';
export const SUPABASE_SECRET_KEY = (): string => process.env.SUPABASE_SECRET_KEY ?? '';
export const SUPABASE_ANON_KEY = (): string => process.env.SUPABASE_ANON_KEY ?? '';
export const SUPABASE_JWKS_URL = (): string => `${SUPABASE_URL()}/auth/v1/.well-known/jwks.json`;

// AI providers
export const OPENROUTER_API_KEY = (): string => process.env.OPENROUTER_API_KEY ?? '';
export const OPENCODE_GO_API_KEY = (): string => process.env.OPENCODE_GO_API_KEY ?? '';

// Slack bot
export const SLACK_BOT_TOKEN = (): string => process.env.SLACK_BOT_TOKEN ?? '';

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

// Email
export const RESEND_API_KEY = (): string => process.env.RESEND_API_KEY ?? '';
export const EMAIL_FROM = (): string =>
  process.env.EMAIL_FROM ?? 'DozalDevs <noreply@dozaldevs.com>';
export const DASHBOARD_BASE_URL = (): string =>
  process.env.DASHBOARD_BASE_URL ?? 'http://localhost:7700';
export const SMTP_URL = (): string => process.env.SMTP_URL ?? 'smtp://localhost:54324';
