import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
vi.mock('../../../src/workers/lib/postgrest-client.js', () => ({
  query: queryMock,
}));

import { loadCustomIntegrations } from '../../../src/workers/lib/agents-md-compiler.mjs';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';

function mockTables(opts: { secrets?: unknown; github?: unknown }): void {
  queryMock.mockImplementation((table: string) => {
    if (table === 'tenant_secrets') return Promise.resolve(opts.secrets ?? []);
    if (table === 'tenant_integrations') return Promise.resolve(opts.github ?? []);
    return Promise.resolve(null);
  });
}

describe('agents-md-compiler — loadCustomIntegrations', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns [] without querying when tenantId is empty', async () => {
    const result = await loadCustomIntegrations('');

    expect(result).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('detects only sifely when tenant has only sifely_* keys', async () => {
    mockTables({
      secrets: [
        { key: 'sifely_client_id' },
        { key: 'sifely_username' },
        { key: 'sifely_password' },
      ],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['sifely']);
  });

  it('detects hostfully + slack from hostfully_api_key and slack_bot_token', async () => {
    mockTables({
      secrets: [{ key: 'hostfully_api_key' }, { key: 'slack_bot_token' }],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result.sort()).toEqual(['hostfully', 'slack']);
  });

  it('queries tenant_secrets for KEYS ONLY (never ciphertext)', async () => {
    mockTables({ secrets: [{ key: 'hostfully_api_key' }] });

    await loadCustomIntegrations(TENANT_ID);

    expect(queryMock).toHaveBeenCalledWith(
      'tenant_secrets',
      expect.stringContaining(`tenant_id=eq.${TENANT_ID}`),
    );
    const secretCall = queryMock.mock.calls.find((c) => c[0] === 'tenant_secrets');
    const params = secretCall?.[1] as string;
    expect(params).toContain('select=key');
    expect(params).not.toContain('ciphertext');
  });

  it('detects github via a non-soft-deleted tenant_integrations row', async () => {
    mockTables({
      secrets: [],
      github: [{ id: '00000000-0000-0000-0000-0000000000aa' }],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['github']);
    const githubCall = queryMock.mock.calls.find((c) => c[0] === 'tenant_integrations');
    const params = githubCall?.[1] as string;
    expect(params).toContain('provider=eq.github');
    expect(params).toContain('deleted_at=is.null');
  });

  it('detects github via the github_installation_id secret key', async () => {
    mockTables({
      secrets: [{ key: 'github_installation_id' }],
      github: [],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['github']);
  });

  it('excludes github when the tenant_integrations row is soft-deleted (no rows returned)', async () => {
    // deleted_at=is.null is applied server-side by PostgREST, so a soft-deleted row never returns.
    mockTables({
      secrets: [{ key: 'hostfully_api_key' }],
      github: [],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['hostfully']);
    expect(result).not.toContain('github');
  });

  it('de-duplicates github when both secret and integration signals are present', async () => {
    mockTables({
      secrets: [{ key: 'github_installation_id' }],
      github: [{ id: '00000000-0000-0000-0000-0000000000aa' }],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['github']);
    expect(result.filter((s) => s === 'github')).toHaveLength(1);
  });

  it('detects all four integrations together', async () => {
    mockTables({
      secrets: [
        { key: 'hostfully_api_key' },
        { key: 'hostfully_agency_uid' },
        { key: 'sifely_username' },
        { key: 'slack_bot_token' },
      ],
      github: [{ id: '00000000-0000-0000-0000-0000000000aa' }],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result.sort()).toEqual(['github', 'hostfully', 'sifely', 'slack']);
  });

  it('does NOT detect slack via composio_connections — only slack_bot_token counts', async () => {
    // Invariant: Slack-via-Composio is disabled — composio_connections is never queried for slack.
    mockTables({ secrets: [{ key: 'hostfully_api_key' }] });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).not.toContain('slack');
    expect(queryMock.mock.calls.some((c) => c[0] === 'composio_connections')).toBe(false);
  });

  it('compares keys case-insensitively', async () => {
    mockTables({ secrets: [{ key: 'HOSTFULLY_API_KEY' }, { key: 'Slack_Bot_Token' }] });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result.sort()).toEqual(['hostfully', 'slack']);
  });

  it('returns [] without throwing when both queries fail (null)', async () => {
    queryMock.mockResolvedValue(null);

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual([]);
  });

  it('returns [] when no integration signals match', async () => {
    mockTables({
      secrets: [{ key: 'notion_access_token' }, { key: 'openrouter_api_key' }],
      github: [],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual([]);
  });

  it('ignores blank/non-string secret keys without throwing', async () => {
    mockTables({
      secrets: [{ key: '' }, { key: '   ' }, { key: 'sifely_client_id' }],
      github: [],
    });

    const result = await loadCustomIntegrations(TENANT_ID);

    expect(result).toEqual(['sifely']);
  });
});
