import Fastify from 'fastify';

const app = Fastify({ logger: false });
const state = {
  tasks: new Map<string, Record<string, unknown>>(),
  executions: new Map<string, Record<string, unknown>>(),
};

// GET /rest/v1/tasks
app.get('/rest/v1/tasks', async (req, reply) => {
  const id = ((req.query as Record<string, string>).id ?? '').replace('eq.', '');
  const task = state.tasks.get(id) ?? {
    id,
    status: 'Executing',
    plan_content: null,
    plan_generated_at: null,
    cost_usd_cents: 0,
    jira_issue_key: 'TEST-001',
    jira_issue_summary: 'Test ticket for simulation',
    jira_issue_description: 'A test ticket',
    repo_url: 'https://github.com/test/repo',
    tooling_config: { install: 'echo install' },
  };
  return reply.send([task]);
});

// PATCH /rest/v1/tasks
app.patch('/rest/v1/tasks', async (req, reply) => {
  const id = ((req.query as Record<string, string>).id ?? '').replace('eq.', '');
  const existing = state.tasks.get(id) ?? {};
  state.tasks.set(id, { ...existing, ...(req.body as Record<string, unknown>) });
  console.log(`[mock-supabase] PATCH tasks/${id}:`, req.body);
  return reply.send([state.tasks.get(id)]);
});

// POST /rest/v1/executions
app.post('/rest/v1/executions', async (req, reply) => {
  const id = `exec-${Date.now()}`;
  const execution = { id, ...(req.body as Record<string, unknown>) };
  state.executions.set(id, execution);
  console.log(`[mock-supabase] POST executions:`, req.body);
  return reply.status(201).send([execution]);
});

// PATCH /rest/v1/executions
app.patch('/rest/v1/executions', async (req, reply) => {
  const id = ((req.query as Record<string, string>).id ?? '').replace('eq.', '');
  const existing = state.executions.get(id) ?? {};
  state.executions.set(id, { ...existing, ...(req.body as Record<string, unknown>) });
  console.log(`[mock-supabase] PATCH executions/${id}:`, req.body);
  return reply.send([state.executions.get(id)]);
});

// GET /rest/v1/executions
app.get('/rest/v1/executions', async (req, reply) => {
  const taskId = ((req.query as Record<string, string>).task_id ?? '').replace('eq.', '');
  const execs = [...state.executions.values()].filter((e) => e['task_id'] === taskId);
  return reply.send(execs);
});

const port = parseInt(process.env.MOCK_SUPABASE_PORT ?? '54399', 10);
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[mock-supabase] Listening on port ${port}`);
});
