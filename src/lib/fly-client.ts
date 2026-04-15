/**
 * Fly.io Machines API client.
 * Handles machine creation, destruction, and status queries with retry on rate limits.
 */
import { ExternalApiError, RateLimitExceededError } from './errors.js';
import { withRetry } from './retry.js';

export interface FlyMachineConfig {
  image: string; // e.g. "registry.fly.io/ai-employee-workers:latest"
  vm_size?: string; // e.g. "performance-2x"
  env?: Record<string, string>; // env vars injected at launch
  auto_destroy?: boolean;
  cmd?: string[]; // Optional CMD override — runs instead of Dockerfile CMD
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
 * Make an authenticated request to the Fly.io Machines API.
 * Handles rate limit detection and throws appropriate errors.
 */
async function makeRequest<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ data: T; status: number }> {
  const token = getFlyApiToken();
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Check for rate limit (429)
  if (response.status === 429) {
    throw new RateLimitExceededError(`Fly.io API rate limit exceeded on ${method} ${path}`, {
      service: 'fly',
      attempts: 1,
    });
  }

  // Return both data and status for caller to handle 404, 204, etc.
  let data: T | null = null;
  if (response.status !== 204) {
    // 204 No Content has no body
    try {
      data = (await response.json()) as T;
    } catch {
      // If response is not JSON, leave data as null
    }
  }

  return { data: data as T, status: response.status };
}

/**
 * Wrapper around makeRequest that applies retry logic for rate limits.
 */
async function makeRequestWithRetry<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ data: T; status: number }> {
  return withRetry(() => makeRequest<T>(method, path, body), {
    maxAttempts: 3,
    baseDelayMs: 1000,
    retryOn: (error) => error instanceof RateLimitExceededError,
  });
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
      vm_size: config.vm_size,
      env: config.env,
      auto_destroy: config.auto_destroy,
      ...(config.cmd ? { init: { cmd: config.cmd } } : {}),
    },
  };

  const { data, status } = await makeRequestWithRetry<FlyMachine>('POST', path, body);

  if (status < 200 || status >= 300) {
    throw new ExternalApiError(`Fly.io API error: ${status} on POST ${path}`, {
      service: 'fly',
      statusCode: status,
      endpoint: path,
    });
  }

  return data;
}

/**
 * Destroy a machine on Fly.io.
 * Treats 404 (machine not found) as success.
 * @param appName - Fly.io app name
 * @param machineId - Machine ID to destroy
 * @throws ExternalApiError on non-2xx, non-404 responses
 * @throws RateLimitExceededError after exhausting retries on 429
 */
export async function destroyMachine(appName: string, machineId: string): Promise<void> {
  const path = `/apps/${appName}/machines/${machineId}?force=true`;

  const { status } = await makeRequestWithRetry<void>('DELETE', path);

  // 204 No Content = success, 404 = already gone (also success)
  if (status === 204 || status === 404) {
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

  const { data, status } = await makeRequestWithRetry<FlyMachine>('GET', path);

  // 404 = machine not found
  if (status === 404) {
    return null;
  }

  // 200 = success
  if (status === 200) {
    return data;
  }

  // Any other status is an error
  throw new ExternalApiError(`Fly.io API error: ${status} on GET ${path}`, {
    service: 'fly',
    statusCode: status,
    endpoint: path,
  });
}
