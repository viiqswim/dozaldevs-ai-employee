/**
 * Fly.io Machines API client.
 * Handles machine creation, destruction, and status queries with retry on rate limits.
 */
import { ExternalApiError } from './errors.js';
import { createHttpClient } from './http-client.js';

export interface FlyMachineConfig {
  image: string; // e.g. "registry.fly.io/ai-employee-workers:latest"
  vm_size?: string; // e.g. "performance-2x"
  env?: Record<string, string>; // env vars injected at launch
  auto_destroy?: boolean;
  cmd?: string[]; // Optional CMD override — runs instead of Dockerfile CMD
  kill_timeout?: number; // Seconds before Fly.io force-kills the machine (default: ~900s)
}

export interface FlyMachine {
  id: string;
  state: string;
  name?: string;
  image_ref?: { digest: string };
}

const BASE_URL = 'https://api.machines.dev/v1';

/**
 * Get the Fly.io API token from environment.
 * Throws if not set.
 */
function getFlyApiToken(): string {
  const token = process.env.FLY_API_TOKEN;
  if (!token) {
    throw new Error('FLY_API_TOKEN environment variable is not set');
  }
  return token;
}

/**
 * Create an authenticated HTTP client for the Fly.io Machines API.
 * Called per-operation so the token is read fresh each time.
 */
function getHttpClient() {
  return createHttpClient(
    BASE_URL,
    {
      Authorization: `Bearer ${getFlyApiToken()}`,
      'Content-Type': 'application/json',
    },
    { service: 'fly', maxAttempts: 3, baseDelayMs: 1000 },
  );
}

/**
 * Parse a Fly.io vm_size string (e.g. "performance-1x") into the guest object
 * required by the Machines API: { cpu_kind, cpus, memory_mb }.
 */
function parseVmSize(vmSize: string): { cpu_kind: string; cpus: number; memory_mb: number } {
  const shared: Record<string, { cpus: number; memory_mb: number }> = {
    'shared-cpu-1x': { cpus: 1, memory_mb: 256 },
    'shared-cpu-2x': { cpus: 2, memory_mb: 512 },
    'shared-cpu-4x': { cpus: 4, memory_mb: 1024 },
    'shared-cpu-6x': { cpus: 6, memory_mb: 1536 },
    'shared-cpu-8x': { cpus: 8, memory_mb: 2048 },
  };
  const performance: Record<string, { cpus: number; memory_mb: number }> = {
    'performance-1x': { cpus: 1, memory_mb: 2048 },
    'performance-2x': { cpus: 2, memory_mb: 4096 },
    'performance-4x': { cpus: 4, memory_mb: 8192 },
    'performance-8x': { cpus: 8, memory_mb: 16384 },
  };
  if (shared[vmSize]) return { cpu_kind: 'shared', ...shared[vmSize] };
  if (performance[vmSize]) return { cpu_kind: 'performance', ...performance[vmSize] };
  // Fallback: shared-cpu-1x
  return { cpu_kind: 'shared', cpus: 1, memory_mb: 256 };
}

/**
 * Create a new machine on Fly.io.
 * @param appName - Fly.io app name
 * @param config - Machine configuration
 * @returns Created machine details
 * @throws ExternalApiError on non-2xx responses (except 404)
 * @throws RateLimitExceededError after exhausting retries on 429
 */
export async function createMachine(
  appName: string,
  config: FlyMachineConfig,
): Promise<FlyMachine> {
  const path = `/apps/${appName}/machines`;
  const body = {
    config: {
      image: config.image,
      ...(config.vm_size ? { guest: parseVmSize(config.vm_size) } : {}),
      env: config.env,
      auto_destroy: config.auto_destroy,
      ...(config.cmd ? { init: { cmd: config.cmd } } : {}),
      ...(config.kill_timeout !== undefined ? { kill_timeout: config.kill_timeout } : {}),
    },
  };

  const response = await getHttpClient().post(path, body);
  const { status } = response;

  if (status < 200 || status >= 300) {
    throw new ExternalApiError(`Fly.io API error: ${status} on POST ${path}`, {
      service: 'fly',
      statusCode: status,
      endpoint: path,
    });
  }

  return response.json() as Promise<FlyMachine>;
}

/**
 * Destroy a machine on Fly.io.
 * Treats 404 (machine not found) as success.
 * @param appName - Fly.io app name
 * @param machineId - Machine ID to destroy
 * @throws ExternalApiError on non-2xx responses (except 404, which is treated as already-gone)
 * @throws RateLimitExceededError after exhausting retries on 429
 */
export async function destroyMachine(appName: string, machineId: string): Promise<void> {
  const path = `/apps/${appName}/machines/${machineId}?force=true`;

  const { status } = await getHttpClient().delete(path);

  // Any 2xx = success, 404 = already gone (also success)
  if ((status >= 200 && status < 300) || status === 404) {
    return;
  }

  // Any other status is an error
  throw new ExternalApiError(`Fly.io API error: ${status} on DELETE ${path}`, {
    service: 'fly',
    statusCode: status,
    endpoint: path,
  });
}

/**
 * Get machine status from Fly.io.
 * Returns null if machine not found (404).
 * @param appName - Fly.io app name
 * @param machineId - Machine ID to query
 * @returns Machine details or null if not found
 * @throws ExternalApiError on non-2xx, non-404 responses
 * @throws RateLimitExceededError after exhausting retries on 429
 */
export async function getMachine(appName: string, machineId: string): Promise<FlyMachine | null> {
  const path = `/apps/${appName}/machines/${machineId}`;

  const response = await getHttpClient().get(path);
  const { status } = response;

  // 404 = machine not found
  if (status === 404) {
    return null;
  }

  // 200 = success
  if (status === 200) {
    return response.json() as Promise<FlyMachine>;
  }

  // Any other status is an error
  throw new ExternalApiError(`Fly.io API error: ${status} on GET ${path}`, {
    service: 'fly',
    statusCode: status,
    endpoint: path,
  });
}
