import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { getPrisma, cleanupTestData, disconnectPrisma } from './setup.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

// ============================================================
// GROUP 1: Table existence
// ============================================================
describe('Table existence', () => {
  it('all 16 application tables exist in public schema', async () => {
    const prisma = getPrisma();
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != '_prisma_migrations'
      ORDER BY table_name;
    `;
    const tableNames = tables.map((t) => t.table_name).sort();
    const expected = [
      'agent_versions',
      'archetypes',
      'audit_log',
      'clarifications',
      'cross_dept_triggers',
      'deliverables',
      'departments',
      'executions',
      'feedback',
      'knowledge_bases',
      'projects',
      'reviews',
      'risk_models',
      'task_status_log',
      'tasks',
      'validation_runs',
    ].sort();
    expect(tableNames).toEqual(expected);
  });
});

// ============================================================
// GROUP 2: CHECK constraints
// ============================================================
describe('CHECK constraints', () => {
  it('rejects invalid task status', async () => {
    const prisma = getPrisma();
    await expect(
      prisma.$executeRaw`
        INSERT INTO tasks (id, status, tenant_id, updated_at)
        VALUES (gen_random_uuid(), 'InvalidStatus', ${TENANT_ID}::uuid, NOW())
      `,
    ).rejects.toThrow();
  });

  it('accepts all 13 valid task statuses', async () => {
    const prisma = getPrisma();
    const validStatuses = [
      'Received',
      'Triaging',
      'AwaitingInput',
      'Ready',
      'Executing',
      'Validating',
      'Submitting',
      'Reviewing',
      'Approved',
      'Delivering',
      'Done',
      'Cancelled',
      'Stale',
    ];
    for (const status of validStatuses) {
      await expect(
        prisma.$executeRaw`
          INSERT INTO tasks (id, status, tenant_id, updated_at)
          VALUES (gen_random_uuid(), ${status}, ${TENANT_ID}::uuid, NOW())
        `,
      ).resolves.toBeDefined();
    }
  });

  it('rejects invalid actor in task_status_log', async () => {
    const prisma = getPrisma();
    // Insert a valid task first (required for FK)
    await prisma.$executeRaw`
      INSERT INTO tasks (id, status, tenant_id, updated_at)
      VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Received', ${TENANT_ID}::uuid, NOW())
    `;
    await expect(
      prisma.$executeRaw`
        INSERT INTO task_status_log (id, task_id, to_status, actor)
        VALUES (gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Ready', 'robot')
      `,
    ).rejects.toThrow();
  });

  it("accepts all 5 valid actors including 'machine'", async () => {
    const prisma = getPrisma();
    const taskId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await prisma.$executeRaw`
      INSERT INTO tasks (id, status, tenant_id, updated_at)
      VALUES (${taskId}::uuid, 'Received', ${TENANT_ID}::uuid, NOW())
    `;
    const validActors = ['gateway', 'lifecycle_fn', 'watchdog', 'machine', 'manual'];
    for (const actor of validActors) {
      await expect(
        prisma.$executeRaw`
          INSERT INTO task_status_log (id, task_id, to_status, actor)
          VALUES (gen_random_uuid(), ${taskId}::uuid, 'Ready', ${actor})
        `,
      ).resolves.toBeDefined();
    }
  });
});

// ============================================================
// GROUP 3: UNIQUE constraints
// ============================================================
describe('UNIQUE constraints', () => {
  it('rejects duplicate tasks with same external_id, source_system, tenant_id', async () => {
    const prisma = getPrisma();
    // First insert should succeed
    await prisma.task.create({
      data: {
        external_id: 'TEST-DUP',
        source_system: 'jira',
        status: 'Received',
        tenant_id: TENANT_ID,
      },
    });
    // Second insert with same triple should fail
    await expect(
      prisma.task.create({
        data: {
          external_id: 'TEST-DUP',
          source_system: 'jira',
          status: 'Received',
          tenant_id: TENANT_ID,
        },
      }),
    ).rejects.toThrow();
  });

  it('allows tasks with different external_id but same source_system', async () => {
    const prisma = getPrisma();
    await expect(
      prisma.task.create({
        data: {
          external_id: 'TEST-001',
          source_system: 'jira',
          status: 'Received',
          tenant_id: TENANT_ID,
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      prisma.task.create({
        data: {
          external_id: 'TEST-002',
          source_system: 'jira',
          status: 'Received',
          tenant_id: TENANT_ID,
        },
      }),
    ).resolves.toBeDefined();
  });
});

// ============================================================
// GROUP 4: Seed data verification
// ============================================================
describe('Seed data verification', () => {
  it('project seed data is present and correct', async () => {
    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: { name: 'test-project' },
    });
    expect(project).not.toBeNull();
    expect(project!.repo_url).toBe('https://github.com/your-org/your-test-repo');
    expect(project!.default_branch).toBe('main');
  });

  it('agent_version seed data is present and correct', async () => {
    const prisma = getPrisma();
    const agentVersion = await prisma.agentVersion.findFirst({
      where: { is_active: true },
    });
    expect(agentVersion).not.toBeNull();
    expect(agentVersion!.model_id).toBe('anthropic/claude-sonnet-4-6');
  });

  it('project has correct default tenant_id', async () => {
    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: { name: 'test-project' },
    });
    expect(project!.tenant_id).toBe(TENANT_ID);
  });
});

// ============================================================
// GROUP 5: Default values
// ============================================================
describe('Default values', () => {
  it('tasks.dispatch_attempts defaults to 0', async () => {
    const prisma = getPrisma();
    const task = await prisma.task.create({
      data: {
        status: 'Received',
        tenant_id: TENANT_ID,
      },
    });
    expect(task.dispatch_attempts).toBe(0);
  });

  it("tasks.status defaults to 'Received'", async () => {
    const prisma = getPrisma();
    const task = await prisma.$queryRaw<Array<{ status: string }>>`
      INSERT INTO tasks (id, tenant_id, updated_at)
      VALUES (gen_random_uuid(), ${TENANT_ID}::uuid, NOW())
      RETURNING status
    `;
    expect(task[0].status).toBe('Received');
  });
});
