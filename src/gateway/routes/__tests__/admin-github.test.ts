import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const {
  mockSecretGet,
  mockSecretSet,
  mockSecretDelete,
  mockGenerateInstallationToken,
  mockIntegrationFindByTenantAndProvider,
  mockIntegrationUpsert,
  mockIntegrationDelete,
} = vi.hoisted(() => ({
  mockSecretGet: vi.fn(),
  mockSecretSet: vi.fn(),
  mockSecretDelete: vi.fn(),
  mockGenerateInstallationToken: vi.fn(),
  mockIntegrationFindByTenantAndProvider: vi.fn(),
  mockIntegrationUpsert: vi.fn(),
  mockIntegrationDelete: vi.fn(),
}));

vi.mock('../../../repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    get: mockSecretGet,
    set: mockSecretSet,
    delete: mockSecretDelete,
  })),
}));

vi.mock('../../services/github-token-manager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/github-token-manager.js')>();
  return {
    ...actual,
    generateInstallationToken: mockGenerateInstallationToken,
  };
});

vi.mock('../../services/tenant-integration-repository.js', () => ({
  TenantIntegrationRepository: vi.fn(() => ({
    findByTenantAndProvider: mockIntegrationFindByTenantAndProvider,
    upsert: mockIntegrationUpsert,
    delete: mockIntegrationDelete,
  })),
}));

import crypto from 'crypto';
import { adminGithubRoutes } from '../admin-github.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';

function makeApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(adminGithubRoutes({ prisma: {} as never }));
  return app;
}

const MOCK_REPOS_PAGE1 = {
  total_count: 2,
  repositories: [
    {
      full_name: 'org/repo-one',
      html_url: 'https://github.com/org/repo-one',
      default_branch: 'main',
      private: false,
      extra_field: 'should be stripped',
    },
    {
      full_name: 'org/repo-two',
      html_url: 'https://github.com/org/repo-two',
      default_branch: 'master',
      private: true,
      extra_field: 'should be stripped',
    },
  ],
};

describe('GET /admin/tenants/:tenantId/github/repos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when X-Admin-Key header is missing', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/github/repos`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Admin-Key is wrong', async () => {
    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('returns 404 when tenant has no GitHub installation', async () => {
    mockSecretGet.mockResolvedValue(null);
    const app = makeApp();

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'GitHub not connected' });
  });

  it('returns repos on happy path (single page)', async () => {
    mockSecretGet.mockResolvedValue('12345');
    const app = makeApp();

    mockGenerateInstallationToken.mockResolvedValue({
      token: 'ghs_test_token',
      expires_at: '2026-01-01T01:00:00Z',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_REPOS_PAGE1,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      repos: [
        {
          full_name: 'org/repo-one',
          html_url: 'https://github.com/org/repo-one',
          default_branch: 'main',
          private: false,
        },
        {
          full_name: 'org/repo-two',
          html_url: 'https://github.com/org/repo-two',
          default_branch: 'master',
          private: true,
        },
      ],
    });
    expect(mockGenerateInstallationToken).toHaveBeenCalledWith(12345);
  });

  it('fetches all pages when pagination is present', async () => {
    mockSecretGet.mockResolvedValue('99999');
    const app = makeApp();

    mockGenerateInstallationToken.mockResolvedValue({
      token: 'ghs_paged_token',
      expires_at: '2026-01-01T01:00:00Z',
    });

    const page1Response = {
      ok: true,
      json: async () => ({
        total_count: 3,
        repositories: [
          {
            full_name: 'org/repo-a',
            html_url: 'https://github.com/org/repo-a',
            default_branch: 'main',
            private: false,
          },
        ],
      }),
      headers: {
        get: (name: string) =>
          name === 'Link'
            ? '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"'
            : null,
      },
    };

    const page2Response = {
      ok: true,
      json: async () => ({
        total_count: 3,
        repositories: [
          {
            full_name: 'org/repo-b',
            html_url: 'https://github.com/org/repo-b',
            default_branch: 'develop',
            private: true,
          },
        ],
      }),
      headers: { get: () => null },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page1Response)
      .mockResolvedValueOnce(page2Response);
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.repos).toHaveLength(2);
    expect(res.body.repos[0].full_name).toBe('org/repo-a');
    expect(res.body.repos[1].full_name).toBe('org/repo-b');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 502 when GitHub API call fails', async () => {
    mockSecretGet.mockResolvedValue('12345');
    const app = makeApp();

    mockGenerateInstallationToken.mockResolvedValue({
      token: 'ghs_test_token',
      expires_at: '2026-01-01T01:00:00Z',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 502 when token generation fails', async () => {
    mockSecretGet.mockResolvedValue('12345');
    const app = makeApp();

    mockGenerateInstallationToken.mockRejectedValue(new Error('GitHub App not configured'));

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });

  it('strips extra fields from GitHub response', async () => {
    mockSecretGet.mockResolvedValue('12345');
    const app = makeApp();

    mockGenerateInstallationToken.mockResolvedValue({
      token: 'ghs_test_token',
      expires_at: '2026-01-01T01:00:00Z',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => MOCK_REPOS_PAGE1,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/repos`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    for (const repo of res.body.repos as Record<string, unknown>[]) {
      expect(Object.keys(repo)).toEqual(['full_name', 'html_url', 'default_branch', 'private']);
    }
  });
});

describe('GET /admin/tenants/:tenantId/github/available-installations', () => {
  let savedAppId: string | undefined;
  let savedPrivateKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    savedAppId = process.env.GITHUB_APP_ID;
    savedPrivateKey = process.env.GITHUB_PRIVATE_KEY;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_PRIVATE_KEY;
  });

  afterEach(() => {
    if (savedAppId === undefined) {
      delete process.env.GITHUB_APP_ID;
    } else {
      process.env.GITHUB_APP_ID = savedAppId;
    }
    if (savedPrivateKey === undefined) {
      delete process.env.GITHUB_PRIVATE_KEY;
    } else {
      process.env.GITHUB_PRIVATE_KEY = savedPrivateKey;
    }
  });

  it('returns 401 without admin key', async () => {
    const app = makeApp();
    const res = await request(app).get(
      `/admin/tenants/${TENANT_ID}/github/available-installations`,
    );
    expect(res.status).toBe(401);
  });

  it('returns 503 when GITHUB_APP_ID is not set', async () => {
    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/available-installations`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(503);
    expect(res.body).toHaveProperty('error');
  });

  it('returns installations with already_linked=false when not connected', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-key';

    vi.spyOn(crypto, 'createSign').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn().mockReturnValue(Buffer.from('fake-sig')),
    } as unknown as crypto.Sign);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 12345,
            account: {
              login: 'my-org',
              type: 'Organization',
              avatar_url: 'https://avatars.githubusercontent.com/u/1',
            },
          },
        ],
        headers: { get: () => null },
      }),
    );

    mockIntegrationFindByTenantAndProvider.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/available-installations`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      installations: [
        {
          id: 12345,
          account: {
            login: 'my-org',
            type: 'Organization',
            avatar_url: 'https://avatars.githubusercontent.com/u/1',
          },
          already_linked: false,
        },
      ],
    });
  });

  it('returns already_linked=true when tenant has matching integration', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-key';

    vi.spyOn(crypto, 'createSign').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn().mockReturnValue(Buffer.from('fake-sig')),
    } as unknown as crypto.Sign);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 12345,
            account: {
              login: 'my-org',
              type: 'Organization',
              avatar_url: 'https://avatars.githubusercontent.com/u/1',
            },
          },
        ],
        headers: { get: () => null },
      }),
    );

    mockIntegrationFindByTenantAndProvider.mockResolvedValue({ external_id: '12345' });

    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/available-installations`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.installations[0].already_linked).toBe(true);
  });

  it('returns 502 when GitHub API returns an error', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-key';

    vi.spyOn(crypto, 'createSign').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn().mockReturnValue(Buffer.from('fake-sig')),
    } as unknown as crypto.Sign);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }),
    );

    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/github/available-installations`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /admin/tenants/:tenantId/github/link-installation', () => {
  let savedAppId: string | undefined;
  let savedPrivateKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    savedAppId = process.env.GITHUB_APP_ID;
    savedPrivateKey = process.env.GITHUB_PRIVATE_KEY;
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_PRIVATE_KEY;
  });

  afterEach(() => {
    if (savedAppId === undefined) {
      delete process.env.GITHUB_APP_ID;
    } else {
      process.env.GITHUB_APP_ID = savedAppId;
    }
    if (savedPrivateKey === undefined) {
      delete process.env.GITHUB_PRIVATE_KEY;
    } else {
      process.env.GITHUB_PRIVATE_KEY = savedPrivateKey;
    }
  });

  it('returns 401 without admin key', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/github/link-installation`)
      .send({ installation_id: '12345' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when installation_id is missing from body', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/github/link-installation`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('stores installation and returns linked:true on happy path', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-key';

    vi.spyOn(crypto, 'createSign').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn().mockReturnValue(Buffer.from('fake-sig')),
    } as unknown as crypto.Sign);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12345, account: { login: 'my-org' } }),
      }),
    );

    mockSecretSet.mockResolvedValue(undefined);
    mockIntegrationUpsert.mockResolvedValue({ id: 'int-1', external_id: '12345' });

    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/github/link-installation`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ installation_id: '12345' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: true, installation_id: '12345' });
    expect(mockSecretSet).toHaveBeenCalledWith(TENANT_ID, 'github_installation_id', '12345');
    expect(mockIntegrationUpsert).toHaveBeenCalledWith(TENANT_ID, 'github', {
      external_id: '12345',
    });
  });

  it('returns 502 when GitHub installation verification fails', async () => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_PRIVATE_KEY = 'test-key';

    vi.spyOn(crypto, 'createSign').mockReturnValue({
      update: vi.fn().mockReturnThis(),
      sign: vi.fn().mockReturnValue(Buffer.from('fake-sig')),
    } as unknown as crypto.Sign);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      }),
    );

    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/github/link-installation`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ installation_id: '99999' });

    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
  });
});

describe('DELETE /admin/tenants/:tenantId/integrations/github', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 401 without admin key', async () => {
    const app = makeApp();
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/integrations/github`);
    expect(res.status).toBe(401);
  });

  it('calls both delete methods and returns disconnected:true', async () => {
    mockIntegrationDelete.mockResolvedValue(undefined);
    mockSecretDelete.mockResolvedValue(undefined);

    const app = makeApp();
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/integrations/github`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disconnected: true, tenant_id: TENANT_ID });
    expect(mockIntegrationDelete).toHaveBeenCalledWith(TENANT_ID, 'github');
    expect(mockSecretDelete).toHaveBeenCalledWith(TENANT_ID, 'github_installation_id');
  });

  it('returns 200 even when delete methods throw (idempotent)', async () => {
    mockIntegrationDelete.mockRejectedValue(new Error('Record not found'));
    mockSecretDelete.mockRejectedValue(new Error('Secret not found'));

    const app = makeApp();
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/integrations/github`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disconnected: true, tenant_id: TENANT_ID });
  });
});
