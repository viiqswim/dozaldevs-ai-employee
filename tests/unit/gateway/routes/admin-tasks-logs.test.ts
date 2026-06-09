import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { adminTasksRoutes } from '../../../../src/gateway/routes/admin-tasks.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TASK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ADMIN_KEY = 'test-admin-key';
const LOG_PATH = `/tmp/employee-${TASK_ID.slice(0, 8)}.log`;

function makeApp(prismaFindFirst: ReturnType<typeof vi.fn>) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(
    adminTasksRoutes({
      prisma: { task: { findFirst: prismaFindFirst } } as never,
    }),
  );
  return app;
}

function collectSse(req: request.Test): Promise<request.Response> {
  return req.buffer(true).parse((res, callback) => {
    let data = '';
    res.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    res.on('end', () => callback(null, data));
  });
}

describe('GET /admin/tenants/:tenantId/tasks/:id/logs', () => {
  afterEach(() => {
    if (existsSync(LOG_PATH)) {
      unlinkSync(LOG_PATH);
    }
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header missing', async () => {
    const findFirst = vi.fn();
    const app = makeApp(findFirst);
    const res = await request(app).get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('400 when task id is not a UUID', async () => {
    const findFirst = vi.fn();
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/not-a-uuid/logs`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('404 when task does not exist in DB', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });

  it('404 with LOG_NOT_FOUND when log file is missing', async () => {
    if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);

    const findFirst = vi.fn().mockResolvedValue({ id: TASK_ID, status: 'Done' });
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('LOG_NOT_FOUND');
  });

  it('streams log content as SSE for Done task with log file', async () => {
    writeFileSync(LOG_PATH, 'line one\nline two\nline three\n');
    const findFirst = vi.fn().mockResolvedValue({ id: TASK_ID, status: 'Done' });
    const app = makeApp(findFirst);

    const res = await collectSse(
      request(app)
        .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`)
        .set('X-Admin-Key', ADMIN_KEY),
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const body = res.body as string;
    expect(body).toContain('data: {"line":"line one"}');
    expect(body).toContain('data: {"line":"line two"}');
    expect(body).toContain('data: {"line":"line three"}');
    expect(body).toContain('event: done');
  });

  it('sends event: done for terminal status tasks', async () => {
    writeFileSync(LOG_PATH, 'task completed successfully\n');
    const findFirst = vi.fn().mockResolvedValue({ id: TASK_ID, status: 'Failed' });
    const app = makeApp(findFirst);

    const res = await collectSse(
      request(app)
        .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`)
        .set('X-Admin-Key', ADMIN_KEY),
    );

    expect(res.status).toBe(200);
    const body = res.body as string;
    expect(body).toContain('data: {"line":"task completed successfully"}');
    expect(body).toContain('event: done');
    expect(body).toContain('data: {"reason":"complete"}');
  });

  it('sets correct SSE headers on stream response', async () => {
    writeFileSync(LOG_PATH, 'log content\n');
    const findFirst = vi.fn().mockResolvedValue({ id: TASK_ID, status: 'Cancelled' });
    const app = makeApp(findFirst);

    const res = await collectSse(
      request(app)
        .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}/logs`)
        .set('X-Admin-Key', ADMIN_KEY),
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
  });
});
