import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../../gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    const adminKey = req.headers['x-admin-key'] as string | undefined;
    if (adminKey && adminKey === process.env.ADMIN_API_KEY) {
      (req as Request & { isServiceToken?: boolean }).isServiceToken = true;
    }
    next();
  },
}));

vi.mock('../../../gateway/middleware/authz.js', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction): void => {
    if (
      (req as Request & { isServiceToken?: boolean }).isServiceToken ||
      (req as Request & { auth?: unknown }).auth
    ) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  },
  requireTenantRole:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
  requirePermission:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

const { mockSecretGet, mockConversationsList } = vi.hoisted(() => ({
  mockSecretGet: vi.fn(),
  mockConversationsList: vi.fn(),
}));

vi.mock('../../../repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    get: mockSecretGet,
  })),
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn(() => ({
    conversations: {
      list: mockConversationsList,
    },
  })),
}));

import { adminSlackChannelsRoutes } from '../admin-slack-channels.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

function makeApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(adminSlackChannelsRoutes({ prisma: {} as never }));
  return app;
}

describe('GET /admin/tenants/:tenantId/slack/channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header is missing', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/slack/channels`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('200 with SLACK_NOT_CONFIGURED when no bot token is set', async () => {
    mockSecretGet.mockResolvedValue(null);
    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/slack/channels`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ channels: [], error: 'SLACK_NOT_CONFIGURED' });
  });

  it('200 with channels array when bot token is configured', async () => {
    mockSecretGet.mockResolvedValue('xoxb-test-token');
    mockConversationsList.mockResolvedValue({
      channels: [
        { id: 'C001', name: 'general', is_private: false },
        { id: 'C002', name: 'private-stuff', is_private: true },
      ],
    });
    const app = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/slack/channels`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.channels).toHaveLength(2);
    expect(res.body.channels[0]).toEqual({ id: 'C001', name: 'general', is_private: false });
    expect(res.body.channels[1]).toEqual({
      id: 'C002',
      name: 'private-stuff',
      is_private: true,
    });
  });
});
