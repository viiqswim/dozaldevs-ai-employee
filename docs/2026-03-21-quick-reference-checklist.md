# Digital AI Employee Platform: Quick Reference Checklist

**Use this alongside the full architecture guide for implementation.**

---

## CRITICAL DECISIONS (Make These First)

### Memory Architecture

- [ ] **Working memory**: In-process (LangGraph state) or Redis?
  - **Recommendation**: In-process for < 100K tokens; Redis for larger
- [ ] **Episodic memory**: PostgreSQL checkpoints or separate table?
  - **Recommendation**: Use LangGraph checkpoints; promote summaries to separate table
- [ ] **Semantic memory**: pgvector or dedicated vector DB?
  - **Recommendation**: pgvector for < 5M vectors; Pinecone/Qdrant for larger

### Execution Model

- [ ] **OpenCode agents**: Fly.io Machines or Kubernetes?
  - **Recommendation**: Fly.io for simplicity; Kubernetes for scale
- [ ] **Python agents**: LangGraph with PostgreSQL checkpointing?
  - **Recommendation**: Yes, always use AsyncPostgresSaver
- [ ] **Job queue**: BullMQ with Upstash Redis?
  - **Recommendation**: Yes, cross-language support is critical

### Cost Control

- [ ] **Token budgets**: Per-agent daily limit?
  - **Recommendation**: Yes; circuit break at 80% of limit
- [ ] **LLM routing**: OpenRouter with cost-aware fallbacks?
  - **Recommendation**: Yes; use price sorting for batch, latency for interactive
- [ ] **Machine lifecycle**: Pre-create pool or on-demand?
  - **Recommendation**: Pre-create 10-20; destroy after job

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation (Week 1-2)

**Goal**: Get one agent (OpenCode or LangGraph) working end-to-end with checkpointing.

```bash
# 1. Set up PostgreSQL
docker run -d \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=ai_employee \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Enable pgvector
psql -U postgres -d ai_employee -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 3. Create LangGraph checkpoint tables
# (AsyncPostgresSaver.setup() does this automatically)

# 4. Set up Redis (for BullMQ)
docker run -d -p 6379:6379 redis:7-alpine

# 5. Create shared job schema (TypeScript + Python)
# See: 2026-03-22-2314-ai-employee-platform-architecture-guide.md#2.3

# 6. Implement OpenCode client wrapper
# See: Reference Implementation section

# 7. Test: Send one job through queue → OpenCode → checkpoint
```

**Success criteria**:

- [ ] Job completes and checkpoint is stored in PostgreSQL
- [ ] Job can be resumed from checkpoint
- [ ] Session cleanup happens on completion

---

### Phase 2: Observability (Week 2-3)

**Goal**: Instrument every agent execution with traces, metrics, logs.

```bash
# 1. Set up OpenTelemetry collector
docker run -d \
  -p 4317:4317 \
  -p 4318:4318 \
  otel/opentelemetry-collector:latest

# 2. Add structured logging (structlog + JSON)
pip install structlog python-json-logger

# 3. Add OpenTelemetry instrumentation
pip install opentelemetry-api opentelemetry-sdk \
  opentelemetry-exporter-otlp

# 4. Create dashboards (Grafana or Datadog)
# Metrics: agent_execution_duration, llm_tokens_total, tool_call_duration

# 5. Set up alerting
# Alert on: error_rate > 5%, budget_exceeded, latency_p99 > 30s
```

**Success criteria**:

- [ ] Every agent execution has a trace ID
- [ ] Token usage is logged per LLM call
- [ ] Dashboards show agent execution metrics
- [ ] Alerts fire when budget is exceeded

---

### Phase 3: Resilience (Week 3-4)

**Goal**: Handle failures gracefully; implement recovery strategies.

```bash
# 1. Implement checkpoint GC
# Cron job: DELETE FROM checkpoints WHERE created_at < NOW() - INTERVAL '24 hours'

# 2. Add circuit breakers
# - LLM: Fail after 3 retries; queue for later
# - Tool: Timeout after 30s; retry or skip
# - Database: Fail after 5 retries; escalate

# 3. Implement retry logic
# - Exponential backoff: 1s, 2s, 4s, 8s, 16s
# - Jitter: Add random 0-1s to prevent thundering herd

# 4. Add human-in-the-loop interrupts
# - Pause before high-impact actions (delete, modify, deploy)
# - Allow human to inspect state and approve/reject

# 5. Test failure scenarios
# - Kill PostgreSQL; verify agent resumes from checkpoint
# - Kill LLM provider; verify fallback to secondary
# - Exceed token budget; verify agent stops
```

**Success criteria**:

- [ ] Agent resumes from checkpoint after crash
- [ ] Fallback chain works (primary → secondary → tertiary)
- [ ] Token budget is enforced
- [ ] Human can interrupt and modify agent state

---

### Phase 4: Scaling (Week 4+)

**Goal**: Deploy to production; scale to 100+ concurrent agents.

```bash
# 1. Deploy to Fly.io
fly launch --name ai-employee-platform

# 2. Create machine pool
# Pre-create 10-20 machines; assign on-demand

# 3. Implement rate limiting
# - Per-agent: 10 requests/minute
# - Per-provider: Respect OpenRouter limits

# 4. Add multi-agent orchestration
# - Handoff protocol: Agent A → Agent B
# - State passing: Serialize state; deserialize on handoff

# 5. Optimize pgvector queries
# - Use HNSW index (not IVFFlat)
# - Limit match_count to 10-20
# - Cache embeddings for common queries

# 6. Monitor production
# - Latency: p50, p95, p99
# - Cost: Per-agent, per-task-type
# - Error rate: By agent, by failure type
```

**Success criteria**:

- [ ] 100+ concurrent agents running
- [ ] Latency p99 < 30s
- [ ] Cost per task < $0.10
- [ ] Error rate < 1%

---

## TECHNOLOGY QUICK REFERENCE

### OpenCode HTTP Server

```typescript
// Start server
opencode serve --port 4096 --hostname 127.0.0.1

// Client
import { createOpencodeClient } from "@opencode-ai/sdk"
const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })

// Create session
const session = await client.session.create({ body: { name: "task-1" } })

// Send prompt
const response = await client.session.prompt({
  path: { id: session.data.id },
  body: { content: "Implement feature X" }
})

// Cleanup
await client.session.delete({ path: { id: session.data.id } })
```

### LangGraph Checkpointing

```python
# Setup
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import asyncpg

pool = await asyncpg.create_pool(dsn, min_size=5, max_size=20)
checkpointer = AsyncPostgresSaver(pool)
await checkpointer.setup()

# Build graph
graph = builder.compile(checkpointer=checkpointer)

# Execute with durability
result = await graph.ainvoke(
    input,
    config={"configurable": {"thread_id": f"job-{job_id}"}},
    durability="sync"  # or "async" or "exit"
)

# Resume from checkpoint
result = await graph.ainvoke(
    None,  # Resume from last checkpoint
    config={"configurable": {"thread_id": f"job-{job_id}"}}
)
```

### BullMQ Job Queue

```typescript
// Producer (TypeScript)
const queue = new Queue("tasks", { connection: redis })
await queue.add("code-review", {
  repository: "user/repo",
  branch: "feature/auth",
  description: "Review auth implementation"
})

// Consumer (Python)
from bullmq import Worker

async def process(job):
    task = job.data
    # Do work
    return result

worker = Worker("tasks", process, { "connection": redis })
```

### pgvector Hybrid Search

```sql
-- Hybrid search (vector + keyword)
SELECT id, content, similarity
FROM hybrid_search(
  'authentication implementation',
  $1::vector,  -- query embedding
  10,          -- match_count
  1.0,         -- full_text_weight
  1.0          -- semantic_weight
)
ORDER BY similarity DESC;
```

### OpenRouter Routing

```typescript
// Cost-aware routing
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { "Authorization": `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: "anthropic/claude-sonnet-4.5",
    messages: [...],
    provider: {
      sort: "price",  // or "latency" or "throughput"
      order: ["anthropic", "openai", "google"],
      max_price: { prompt: 0.01, completion: 0.05 }
    }
  })
})
```

### Fly.io Machines

```typescript
// Create machine
const machine = await fly.machines.create({
  app: "ai-employee-platform",
  config: {
    image: "your-registry/agent:latest",
    env: { JOB_ID: jobId },
    auto_stop: "stop"
  }
})

// Wait for startup
await fly.machines.wait(machine.id, { state: "started" })

// Cleanup
await fly.machines.destroy(machine.id)
```

---

## MONITORING DASHBOARD QUERIES

### Agent Execution Duration

```sql
SELECT
  agent_id,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99
FROM agent_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id;
```

### Token Usage by Agent

```sql
SELECT
  agent_id,
  SUM(tokens_in + tokens_out) as total_tokens,
  COUNT(*) as num_calls,
  SUM(tokens_in + tokens_out) * 0.00002 as estimated_cost_usd
FROM llm_calls
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id
ORDER BY estimated_cost_usd DESC;
```

### Error Rate by Agent

```sql
SELECT
  agent_id,
  COUNT(*) as total_executions,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  ROUND(100.0 * COUNT(CASE WHEN status = 'failed' THEN 1 END) / COUNT(*), 2) as error_rate_pct
FROM agent_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id;
```

### Checkpoint Growth

```sql
SELECT
  thread_id,
  COUNT(*) as num_checkpoints,
  SUM(LENGTH(value)) as total_bytes,
  MAX(created_at) as last_checkpoint
FROM checkpoints
GROUP BY thread_id
ORDER BY total_bytes DESC
LIMIT 20;
```

---

## COMMON ERRORS & FIXES

| Error | Cause | Fix |
|-------|-------|-----|
| `"table does not exist"` | AsyncPostgresSaver.setup() not called | Call `await checkpointer.setup()` |
| `"job data > 512MB"` | Redis string size limit | Split job data; store in S3 |
| `"Python worker crashes"` | Job schema mismatch | Define shared types; version schema |
| `"Checkpoint corruption"` | Concurrent writes | Use AsyncPostgresSaver; validate state |
| `"Infinite agent loop"` | No step limit | Cap steps at 100; interrupt if exceeded |
| `"Token budget exceeded"` | No token counting | Add counter at every LLM call |
| `"Machine startup slow"` | Cold starts | Pre-create pool; use checkpoint/restore |
| `"pgvector query slow"` | No index | Create HNSW index; limit match_count |

---

## DEPLOYMENT CHECKLIST

- [ ] PostgreSQL with pgvector enabled
- [ ] Redis for BullMQ (Upstash or self-hosted)
- [ ] OpenCode server running (or Fly.io Machines)
- [ ] LangGraph checkpointing configured
- [ ] BullMQ job queue with shared schema
- [ ] OpenTelemetry instrumentation
- [ ] Structured logging (JSON)
- [ ] Dashboards (Grafana or Datadog)
- [ ] Alerting (budget, error rate, latency)
- [ ] Checkpoint GC job (daily)
- [ ] Circuit breakers (LLM, tool, database)
- [ ] Retry logic (exponential backoff)
- [ ] Human-in-the-loop interrupts
- [ ] Rate limiting (per agent, per provider)
- [ ] Cost tracking (per agent, per task)
- [ ] Machine pool (pre-created, auto-scaling)
- [ ] Monitoring (latency, cost, error rate)

---

## NEXT STEPS

1. **Read the full architecture guide** (2026-03-22-2314-ai-employee-platform-architecture-guide.md)
2. **Start with Phase 1**: Get one agent working with checkpointing
3. **Add observability**: Instrument every execution
4. **Test failures**: Verify recovery strategies work
5. **Scale to production**: Deploy to Fly.io; monitor metrics

---

**Questions?** Refer to the full architecture guide for detailed explanations and code examples.
