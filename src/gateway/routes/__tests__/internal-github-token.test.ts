import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const { mockTaskFindUnique, mockSecretGet, mockGenerateInstallationToken } = vi.hoisted(() => ({
  mockTaskFindUnique: vi.fn(),
  mockSecretGet: vi.fn(),
  mockGenerateInstallationToken: vi.fn(),
}));

vi.mock('../../../repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    get: mockSecretGet,
  })),
}));

vi.mock('../../services/github-token-manager.js', () => ({
  generateInstallationToken: mockGenerateInstallationToken,
}));

import { internalGithubTokenRoutes } from '../internal-github-token.js';

const TASK_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const INSTALLATION_ID = '12345678';
const TOKEN = 'ghs_testtoken123';
const EXPIRES_AT = '2026-06-02T12:00:00Z';

function makeApp() {
  const app = express();
  app.use(express.json());
  const prisma = {
    task: { findUnique: mockTaskFindUnique },
  } as never;
  app.use('/internal', internalGithubTokenRoutes({ prisma }));
  return app;
}

function makeExecutingTask() {
  return { id: TASK_ID, tenant_id: TENANT_ID, status: 'Executing' };
}

describe('POST /internal/tasks/:taskId/github-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with token when task is executing and GitHub is connected', async () => {
    mockTaskFindUnique.mockResolvedValue(makeExecutingTask());
    mockSecretGet.mockResolvedValue(INSTALLATION_ID);
    mockGenerateInstallationToken.mockResolvedValue({ token: TOKEN, expires_at: EXPIRES_AT });

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: TOKEN, expires_at: EXPIRES_AT });
    expect(mockTaskFindUnique).toHaveBeenCalledWith({ where: { id: TASK_ID } });
    expect(mockSecretGet).toHaveBeenCalledWith(TENANT_ID, 'github_installation_id');
    expect(mockGenerateInstallationToken).toHaveBeenCalledWith(parseInt(INSTALLATION_ID, 10));
  });

  it('returns 400 when X-Task-ID header is missing', async () => {
    const app = makeApp();
    const res = await request(app).post(`/internal/tasks/${TASK_ID}/github-token`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/X-Task-ID/);
    expect(mockTaskFindUnique).not.toHaveBeenCalled();
  });

  it('returns 400 when X-Task-ID header does not match taskId param', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', 'different-task-id');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/X-Task-ID/);
    expect(mockTaskFindUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when task is not found', async () => {
    mockTaskFindUnique.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Task not found' });
    expect(mockSecretGet).not.toHaveBeenCalled();
  });

  it('returns 403 when task is not in Executing state', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...makeExecutingTask(), status: 'Done' });

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Task is not in Executing state' });
    expect(mockSecretGet).not.toHaveBeenCalled();
  });

  it('returns 403 for tasks in Submitting state', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...makeExecutingTask(), status: 'Submitting' });

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(403);
  });

  it('returns 404 when GitHub is not connected (no installation_id secret)', async () => {
    mockTaskFindUnique.mockResolvedValue(makeExecutingTask());
    mockSecretGet.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'GitHub not connected' });
    expect(mockGenerateInstallationToken).not.toHaveBeenCalled();
  });

  it('returns 500 when token generation fails', async () => {
    mockTaskFindUnique.mockResolvedValue(makeExecutingTask());
    mockSecretGet.mockResolvedValue(INSTALLATION_ID);
    mockGenerateInstallationToken.mockRejectedValue(new Error('GitHub API 500'));

    const app = makeApp();
    const res = await request(app)
      .post(`/internal/tasks/${TASK_ID}/github-token`)
      .set('x-task-id', TASK_ID);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to generate GitHub token' });
  });
});
