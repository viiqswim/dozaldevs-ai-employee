/**
 * Thin fetch-based PostgREST HTTP client for workers.
 * Accesses Supabase without Prisma using native fetch.
 */
import { createLogger } from '../../lib/logger.js';

export interface PostgRESTClient {
  get(table: string, query: string): Promise<unknown[] | null>;
  post(table: string, body: Record<string, unknown>): Promise<unknown | null>;
  patch(table: string, query: string, body: Record<string, unknown>): Promise<unknown | null>;
}

const log = createLogger('postgrest-client');

export function createPostgRESTClient(): PostgRESTClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  // Validate environment variables
  if (!supabaseUrl || !supabaseKey) {
    log.warn('[postgrest-client] Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    return {
      get: async () => null,
      post: async () => null,
      patch: async () => null,
    };
  }

  const baseUrl = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    async get(table: string, query: string): Promise<unknown[] | null> {
      try {
        const url = `${baseUrl}/${table}?${query}`;
        const response = await fetch(url, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] GET ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        return Array.isArray(data) ? data : null;
      } catch (error) {
        log.warn(
          `[postgrest-client] GET ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },

    async post(table: string, body: Record<string, unknown>): Promise<unknown | null> {
      try {
        const url = `${baseUrl}/${table}`;
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] POST ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        // PostgREST returns an array; return the first element
        return Array.isArray(data) ? data[0] : data;
      } catch (error) {
        log.warn(
          `[postgrest-client] POST ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },

    async patch(
      table: string,
      query: string,
      body: Record<string, unknown>,
    ): Promise<unknown | null> {
      try {
        const url = `${baseUrl}/${table}?${query}`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          log.warn(`[postgrest-client] PATCH ${table} failed with HTTP ${response.status}`);
          return null;
        }

        const data = await response.json();
        return data;
      } catch (error) {
        log.warn(
          `[postgrest-client] PATCH ${table} error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    },
  };
}
