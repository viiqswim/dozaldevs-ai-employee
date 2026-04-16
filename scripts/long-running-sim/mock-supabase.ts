import express from 'express';
import type { Request, Response } from 'express';

const app = express();
app.use(express.json());

const state = {
  tasks: new Map<string, Record<string, unknown>>(),
  executions: new Map<string, Record<string, unknown>>(),
};

app.get('/rest/v1/tasks', (req: Request, res: Response) => {
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
  res.json([task]);
});

app.patch('/rest/v1/tasks', (req: Request, res: Response) => {
  const id = ((req.query as Record<string, string>).id ?? '').replace('eq.', '');
  const existing = state.tasks.get(id) ?? {};
  state.tasks.set(id, { ...existing, ...(req.body as Record<string, unknown>) });
  console.log(`[mock-supabase] PATCH tasks/${id}:`, req.body);
  res.json([state.tasks.get(id)]);
});

app.post('/rest/v1/executions', (req: Request, res: Response) => {
  const id = `exec-${Date.now()}`;
  const execution = { id, ...(req.body as Record<string, unknown>) };
  state.executions.set(id, execution);
  console.log(`[mock-supabase] POST executions:`, req.body);
  res.status(201).json([execution]);
});

app.patch('/rest/v1/executions', (req: Request, res: Response) => {
  const id = ((req.query as Record<string, string>).id ?? '').replace('eq.', '');
  const existing = state.executions.get(id) ?? {};
  state.executions.set(id, { ...existing, ...(req.body as Record<string, unknown>) });
  console.log(`[mock-supabase] PATCH executions/${id}:`, req.body);
  res.json([state.executions.get(id)]);
});

app.get('/rest/v1/executions', (req: Request, res: Response) => {
  const taskId = ((req.query as Record<string, string>).task_id ?? '').replace('eq.', '');
  const execs = [...state.executions.values()].filter((e) => e['task_id'] === taskId);
  res.json(execs);
});

const port = parseInt(process.env.MOCK_SUPABASE_PORT ?? '54399', 10);
app.listen(port, '0.0.0.0', () => {
  console.log(`[mock-supabase] Listening on port ${port}`);
});
