export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Error: ${name} environment variable is required\n`);
    process.exit(1);
  }
  return value;
}

async function refreshGoogleToken(): Promise<string | null> {
  const taskId = process.env['TASK_ID'];
  if (!taskId) {
    return null;
  }

  const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://localhost:7700';
  const endpoint = `${gatewayUrl}/internal/tasks/${encodeURIComponent(taskId)}/google-token`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'X-Task-ID': taskId, 'Content-Type': 'application/json' },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let result: { token: string; expires_at: string };
  try {
    result = JSON.parse(await response.text()) as { token: string; expires_at: string };
  } catch {
    return null;
  }

  if (!result.token) {
    return null;
  }

  process.env['GOOGLE_ACCESS_TOKEN'] = result.token;
  return result.token;
}

export async function googleFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = requireEnv('GOOGLE_ACCESS_TOKEN');

  const makeHeaders = (t: string): Record<string, string> => ({
    Authorization: `Bearer ${t}`,
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) ?? {}),
  });

  const response = await fetch(url, { ...opts, headers: makeHeaders(token) });

  if (response.status === 401) {
    const freshToken = await refreshGoogleToken();

    if (freshToken) {
      const retryResponse = await fetch(url, { ...opts, headers: makeHeaders(freshToken) });

      if (retryResponse.status === 401) {
        process.stderr.write(
          'Error: Access token expired or invalid even after refresh. Re-authenticate Google in the dashboard.\n',
        );
        process.exit(1);
      }

      if (retryResponse.status === 403) {
        process.stderr.write(
          'Error: Insufficient permissions. Check granted scopes in the Google integration settings.\n',
        );
        process.exit(1);
      }

      return retryResponse;
    }

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
