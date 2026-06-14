import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminArchetypeGenerateRoutes } from '../../../../src/gateway/routes/admin-archetype-generate.js';

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    (req as Request & { isServiceToken?: boolean }).isServiceToken = true;
    next();
  },
}));

vi.mock('../../../../src/gateway/middleware/authz.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
  requireTenantRole:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

vi.mock('../../../../src/lib/composio/connectable-apps.js', () => ({
  getConnectableToolkits: vi.fn().mockResolvedValue(new Set(['notion', 'gmail'])),
}));

vi.mock('../../../../src/repositories/composio-connection-repository.js', () => ({
  ComposioConnectionRepository: vi.fn().mockImplementation(() => ({
    getActiveConnections: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../../../../src/repositories/ArchetypeGenerationCallRepository.js', () => ({
  ArchetypeGenerationCallRepository: vi.fn().mockImplementation(() => ({})),
}));

const mockGenerate = vi.fn();
vi.mock('../../../../src/gateway/services/archetype-generator.js', () => ({
  ArchetypeGenerator: vi.fn().mockImplementation(() => ({
    generate: mockGenerate,
  })),
}));

const TENANT = '11111111-1111-4111-8111-111111111111';
const DESCRIPTION =
  'An employee that reads our support channel every morning and posts a summary of open issues.';

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    adminArchetypeGenerateRoutes({
      callLLM: vi.fn() as never,
      prisma: prismaOverrides as never,
    }),
  );
  return app;
}

function makePrisma() {
  return {
    modelCatalog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('POST /admin/tenants/:tenantId/archetypes/generate — friendly errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('422 GENERATION_FAILED returns a friendly message AND keeps technical details', async () => {
    const technical =
      'GENERATION_FAILED: LLM returned invalid JSON — SyntaxError: Unexpected token < in JSON';
    mockGenerate.mockRejectedValue(new Error(technical));
    const app = makeApp(makePrisma());

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/generate`)
      .send({ description: DESCRIPTION });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('GENERATION_FAILED');

    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/try again/i);
    expect(res.body.message).not.toMatch(/GENERATION_FAILED/);
    expect(res.body.message).not.toMatch(/invalid JSON/i);
    expect(res.body.message).not.toMatch(/LLM/);
    expect(res.body.message).not.toMatch(/SyntaxError/);

    expect(res.body.details).toBe(technical);
  });

  it('422 GENERATION_FAILED for empty-content failure also returns the friendly message', async () => {
    const technical = 'GENERATION_FAILED: LLM returned no usable content — possible reasoning-only';
    mockGenerate.mockRejectedValue(new Error(technical));
    const app = makeApp(makePrisma());

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/generate`)
      .send({ description: DESCRIPTION });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('GENERATION_FAILED');
    expect(res.body.message).toMatch(/couldn't generate|could not generate/i);
    expect(res.body.details).toBe(technical);
  });

  it('500 INTERNAL_ERROR for non-generation failures (unchanged behavior)', async () => {
    mockGenerate.mockRejectedValue(new Error('boom: database connection lost'));
    const app = makeApp(makePrisma());

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/archetypes/generate`)
      .send({ description: DESCRIPTION });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
