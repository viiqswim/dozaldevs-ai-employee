/**
 * Shared fetch helper for Google API calls.
 * All Google shell tools import from here — never use raw fetch() directly.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Error: ${name} environment variable is required\n`);
    process.exit(1);
  }
  return value;
}

export async function googleFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = requireEnv('GOOGLE_ACCESS_TOKEN');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) ?? {}),
  };

  const response = await fetch(url, { ...opts, headers });

  if (response.status === 401) {
    process.stderr.write(
      'Error: Access token expired or invalid. Re-run validate-env or reconnect Google.\n',
    );
    process.exit(1);
  }

  if (response.status === 403) {
    process.stderr.write(
      'Error: Insufficient permissions. Check granted scopes in the Google integration settings.\n',
    );
    process.exit(1);
  }

  return response;
}
