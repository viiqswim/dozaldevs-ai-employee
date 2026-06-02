import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mockSecretGet, mockGenerateInstallationToken } = vi.hoisted(() => ({
  mockSecretGet: vi.fn(),
  mockGenerateInstallationToken: vi.fn(),
}));

vi.mock('../../services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    get: mockSecretGet,
  })),
}));

vi.mock('../../services/github-token-manager.js', () => ({
  generateInstallationToken: mockGenerateInstallationToken,
}));

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
