export interface HostfullyClient {
  headers: Record<string, string>;
  baseUrl: string;
}

export function resolveHostfullyClient(): HostfullyClient {
  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    throw new Error('HOSTFULLY_API_KEY environment variable is required');
  }

  const baseUrl = (
    process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2'
  ).replace(/\/$/, '');

  const headers: Record<string, string> = {
    'X-HOSTFULLY-APIKEY': apiKey,
    Accept: 'application/json',
  };

  return { headers, baseUrl };
}
