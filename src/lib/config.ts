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
