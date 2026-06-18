import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminModelCatalogRoutes } from '../admin-model-catalog.js';
import { GO_MODEL_MAP } from '../../../lib/go-models.js';

vi.mock('../../../gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === process.env.SERVICE_TOKEN) {
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

import type { AuthenticatedUser } from '../../../lib/auth/types.js';

function makeAppWithUserAuth(prismaOverrides: Record<string, unknown> = {}) {
  process.env.SERVICE_TOKEN = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.headers.authorization === 'Bearer user-jwt') {
      (req as Request & { auth?: AuthenticatedUser }).auth = {
        id: 'user-123',
        supabaseId: 'supa-123',
        email: 'user@example.com',
        name: null,
        globalRole: 'USER',
        status: 'active',
      };
    }
    next();
  });
  app.use(
    adminModelCatalogRoutes({
      prisma: {
        modelCatalog: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          ...prismaOverrides,
        },
      } as never,
    }),
  );
  return app;
}

const ADMIN_KEY = 'test-admin-key';
const MODEL_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d6';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeModelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MODEL_ID,
    model_id: 'provider/model-name',
    display_name: 'Test Model',
    provider: 'provider',
    context_window: 128_000,
    input_cost_per_million: 1.0,
    output_cost_per_million: 2.0,
    is_free: false,
    supports_tools: true,
    supports_structured_output: true,
    is_active: true,
    deleted_at: null,
    throughput_tokens_per_sec: null,
    latency_seconds: null,
    tool_call_error_rate: null,
    structured_output_error_rate: null,
    quality_index: null,
    agentic_score: null,
    tool_use_score: null,
    instruction_following_score: null,
    non_hallucination_rate: null,
    description: null,
    notes: null,
    strengths: null,
    weaknesses: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.SERVICE_TOKEN = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use(
    adminModelCatalogRoutes({
      prisma: {
        modelCatalog: {
          findMany: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          ...prismaOverrides,
        },
      } as never,
    }),
  );
  return app;
}

const VALID_CREATE_BODY = {
  model_id: 'provider/new-model',
  display_name: 'New Model',
  provider: 'provider',
  context_window: 128_000,
  input_cost_per_million: 1.0,
  output_cost_per_million: 2.0,
  supports_tools: true,
  supports_structured_output: true,
};

describe('GET /admin/model-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/admin/model-catalog');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 200 for a JWT-authenticated user (Role.USER)', async () => {
    const model = makeModelRow();
    const findMany = vi.fn().mockResolvedValue([model]);
    const app = makeAppWithUserAuth({ findMany });
    const res = await request(app)
      .get('/admin/model-catalog')
      .set('Authorization', 'Bearer user-jwt');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('returns 200 with list of models', async () => {
    const model = makeModelRow();
    const findMany = vi.fn().mockResolvedValue([model]);
    const app = makeApp({ findMany });
    const res = await request(app)
      .get('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(MODEL_ID);
    expect(findMany).toHaveBeenCalledOnce();
  });

  it('annotates each model with supported_gateways=["openrouter"] when model is not in GO_MODEL_MAP', async () => {
    const model = makeModelRow({ model_id: 'provider/model-name' });
    const findMany = vi.fn().mockResolvedValue([model]);
    const app = makeApp({ findMany });
    const res = await request(app)
      .get('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body[0].supported_gateways).toEqual(['openrouter']);
  });

  it('annotates each model with ["opencode-go","openrouter"] when model is in GO_MODEL_MAP', async () => {
    const goModelId = [...GO_MODEL_MAP.keys()][0];
    const model = makeModelRow({ model_id: goModelId });
    const findMany = vi.fn().mockResolvedValue([model]);
    const app = makeApp({ findMany });
    const res = await request(app)
      .get('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body[0].supported_gateways).toEqual(['opencode-go', 'openrouter']);
  });

  it('passes deleted_at:null filter to findMany', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const app = makeApp({ findMany });
    await request(app).get('/admin/model-catalog').set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deleted_at: null }),
      }),
    );
  });
});

describe('GET /admin/model-catalog/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/model-catalog/${MODEL_ID}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 for a JWT-authenticated user (Role.USER)', async () => {
    const model = makeModelRow();
    const findFirst = vi.fn().mockResolvedValue(model);
    const app = makeAppWithUserAuth({ findFirst });
    const res = await request(app)
      .get(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', 'Bearer user-jwt');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MODEL_ID);
  });

  it('returns 200 with the model when found', async () => {
    const model = makeModelRow();
    const findFirst = vi.fn().mockResolvedValue(model);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .get(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(MODEL_ID);
    expect(res.body.supported_gateways).toEqual(['openrouter']);
  });

  it('returns 404 when model is not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .get(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

describe('POST /admin/model-catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const app = makeApp();
    const res = await request(app).post('/admin/model-catalog').send(VALID_CREATE_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ model_id: 'only-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 201 with created model on valid input', async () => {
    const created = makeModelRow({ model_id: VALID_CREATE_BODY.model_id });
    const create = vi.fn().mockResolvedValue(created);
    const app = makeApp({ create });
    const res = await request(app)
      .post('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });

  it('returns 409 with MODEL_ID_TAKEN on duplicate model_id (Prisma P2002)', async () => {
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const app = makeApp({ create });
    const res = await request(app)
      .post('/admin/model-catalog')
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send(VALID_CREATE_BODY);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('MODEL_ID_TAKEN');
  });
});

describe('PATCH /admin/model-catalog/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when patch body is empty', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeModelRow());
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 404 when model does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ display_name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 200 with updated model', async () => {
    const updated = makeModelRow({ display_name: 'Updated' });
    const findFirst = vi.fn().mockResolvedValue(makeModelRow());
    const update = vi.fn().mockResolvedValue(updated);
    const app = makeApp({ findFirst, update });
    const res = await request(app)
      .patch(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`)
      .send({ display_name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('Updated');
  });
});

describe('DELETE /admin/model-catalog/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when model does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .delete(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 200 and performs a soft delete by setting deleted_at', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeModelRow());
    const update = vi.fn().mockResolvedValue({});
    const app = makeApp({ findFirst, update });
    const res = await request(app)
      .delete(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MODEL_ID },
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
  });

  it('does not call hard delete (update is used, not delete method)', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeModelRow());
    const update = vi.fn().mockResolvedValue({});
    const deleteFn = vi.fn();
    const app = makeApp({ findFirst, update, delete: deleteFn });
    await request(app)
      .delete(`/admin/model-catalog/${MODEL_ID}`)
      .set('Authorization', `Bearer ${ADMIN_KEY}`);
    expect(deleteFn).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
