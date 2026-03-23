# Digital AI Employee Platform: Comprehensive Architecture Document Guide

**Date**: March 22, 2026  
**Status**: Research-backed reference guide  
**Scope**: Engineering + non-engineering agent deployment platform

---

## EXECUTIVE SUMMARY

This guide synthesizes 2026 production patterns for AI agent platforms. It identifies **8 critical sections** that separate working systems from abandoned projects, with emphasis on what's commonly missing from architecture documents that causes implementation failures.

**Key insight from 1.7B+ workflows (CrewAI, 2026)**: The gap isn't intelligence—it's architecture. 40%+ of agentic AI projects fail not because models are weak, but because teams optimize for agent capability while ignoring system reliability, observability, and cost control.

---

## PART 1: ARCHITECTURE DOCUMENT STRUCTURE (What to Include)

### 1.1 The 8 Essential Sections

Production AI agent platform architecture documents must cover:

1. **System Context & Boundaries** (often missing)
2. **Memory & State Persistence Architecture** (most commonly incomplete)
3. **Execution Environment & Isolation Model** (frequently underspecified)
4. **Tool/Action Layer & Contracts** (usually vague)
5. **Observability, Tracing & Governance** (treated as afterthought)
6. **Cost Control & Rate Limiting** (rarely quantified)
7. **Failure Modes & Recovery Patterns** (almost never documented)
8. **Multi-Agent Orchestration & Handoff Protocols** (assumed to "just work")

---

### 1.2 What's Commonly Missing (Root Cause of Failures)

#### **A. Deterministic Failure Taxonomy**

- **Missing**: Explicit categorization of failure modes (transient vs. permanent, recoverable vs. unrecoverable)
- **Impact**: Teams ship agents that fail silently or loop infinitely
- **Solution**: Document failure modes per component with recovery strategy

#### **B. State Transition Contracts**

- **Missing**: Formal definition of valid state transitions and invariants
- **Impact**: Agents resume from corrupted state; checkpoints become useless
- **Solution**: Define state schema with validation rules; document idempotency requirements

#### **C. Tool Permission Scoping**

- **Missing**: Explicit list of what each agent can/cannot do
- **Impact**: Agents accidentally delete production data or exhaust budgets
- **Solution**: RBAC matrix per agent type; tool authentication via OIDC/OAuth

#### **D. Cost Attribution & Budgeting**

- **Missing**: Per-agent, per-task token/API call budgets
- **Impact**: Single runaway agent burns monthly budget in hours
- **Solution**: Token counters at every LLM call; circuit breakers per agent

#### **E. Checkpoint Lifecycle Management**

- **Missing**: Strategy for pruning old checkpoints; retention policy
- **Impact**: Checkpoint tables grow unbounded; queries slow down
- **Solution**: Rolling window (keep last N or last T hours); promotion strategy for long-term memory

#### **F. Human-in-the-Loop Interruption Points**

- **Missing**: Where humans can inspect, modify, or reject agent decisions
- **Impact**: Agents make irreversible decisions without oversight
- **Solution**: Explicit interrupt_before/interrupt_after nodes; approval workflows

#### **G. Cross-Language Job Queue Semantics**

- **Missing**: How TypeScript producers and Python consumers agree on job format
- **Impact**: Jobs fail silently; Python workers can't deserialize TypeScript payloads
- **Solution**: Shared schema (JSON schema or Protobuf); versioning strategy

#### **H. Observability Instrumentation Plan**

- **Missing**: What gets logged, at what level, and how to correlate traces
- **Impact**: Production incidents take hours to debug; no audit trail
- **Solution**: Structured logging (JSON); trace IDs on every request; OpenTelemetry integration

---

## PART 2: TECHNOLOGY-SPECIFIC PATTERNS

### 2.1 OpenCode HTTP Server API (`opencode serve`)

**What it is**: OpenCode exposes an OpenAPI 3.1 HTTP server for programmatic access.

**Key patterns**:

```typescript
// SDK-based client (recommended for TypeScript orchestrator)
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  // Optional: basic auth
  // username: "opencode",
  // password: process.env.OPENCODE_SERVER_PASSWORD
})

// Create a session for an engineering task
const session = await client.session.create({
  body: { name: "feature-implementation" }
})

// Send a prompt and stream responses
const response = await client.session.prompt({
  path: { id: session.data.id },
  body: {
    content: "Implement user authentication with JWT",
    // Optional: request structured JSON output
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          code: { type: "string" },
          tests: { type: "string" },
          explanation: { type: "string" }
        }
      }
    }
  }
})
```

**Critical for your architecture**:

- **Session lifecycle**: Each OpenCode session is stateful. Map `session.id` to your job queue's `job_id` for correlation
- **Authentication**: Use `OPENCODE_SERVER_PASSWORD` env var; consider rotating credentials per deployment
- **Streaming**: OpenCode supports SSE (Server-Sent Events) for streaming responses—critical for long-running tasks
- **File access**: Use `/file` endpoints to read/write files in the OpenCode workspace
- **MCP integration**: OpenCode can load MCP servers; document which MCPs your agents require

**What's missing from docs**:

- How to handle session timeouts (default behavior unclear)
- Retry strategy when OpenCode server is unavailable
- How to clean up sessions after completion (memory leak risk)
- Rate limiting per session (if any)

**Recommendation for your platform**:

- Wrap OpenCode client in a job handler that maps BullMQ jobs → OpenCode sessions
- Store `session.id` in job metadata for debugging
- Implement session cleanup on job completion (success or failure)
- Add circuit breaker: if OpenCode server is down, queue jobs for retry

---

### 2.2 LangGraph PostgreSQL Checkpointing (Python Agents)

**What it is**: LangGraph's `AsyncPostgresSaver` persists agent state to PostgreSQL, enabling pause/resume and human-in-the-loop.

**Production pattern** (from 2026 benchmarks):

```python
import asyncpg
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import StateGraph

async def build_durable_agent(dsn: str):
    # Connection pool (critical for concurrency)
    pool = await asyncpg.create_pool(
        dsn,
        min_size=5,
        max_size=20,
        command_timeout=30,
    )
    
    # Checkpointer setup
    checkpointer = AsyncPostgresSaver(pool)
    await checkpointer.setup()  # Creates tables idempotently
    
    # Build graph with checkpointing
    graph = builder.compile(checkpointer=checkpointer)
    
    # Execute with thread_id (maps to job_id in your queue)
    config = {"configurable": {"thread_id": f"job-{job_id}"}}
    
    # Invoke with durability mode
    result = await graph.ainvoke(
        {"input": task_data},
        config=config,
        # Options: "exit" (best perf), "async" (good balance), "sync" (safest)
        durability="sync"
    )
    
    return result
```

**Critical for your architecture**:

1. **Checkpoint table bloat**: LangGraph creates 4 tables (`checkpoints`, `checkpoint_writes`, `checkpoint_blobs`, `checkpoint_migrations`). Without pruning:
   - 100 agents × 10 checkpoints/day × 365 days = 365K rows
   - Query latency degrades after ~1M rows

   **Solution**: Implement daily GC job:

   ```sql
   -- Keep last 20 checkpoints per thread, delete older ones
   DELETE FROM checkpoints 
   WHERE thread_id IN (
     SELECT thread_id FROM checkpoints 
     GROUP BY thread_id 
     HAVING COUNT(*) > 20
   )
   AND created_at < NOW() - INTERVAL '24 hours'
   ```

2. **Durability modes trade-off**:
   - `"exit"`: Checkpoint only on graph completion (best throughput, risky)
   - `"async"`: Checkpoint asynchronously (good balance, small data loss risk)
   - `"sync"`: Checkpoint before each step (safest, ~20% latency overhead)

   **Recommendation**: Use `"sync"` for high-stakes tasks (financial, data deletion), `"async"` for exploratory work

3. **Human-in-the-loop interrupts**:

   ```python
   # Pause before approval step
   graph.invoke(
       input,
       config=config,
       interrupt_before=["approval_node"]
   )
   
   # Later: inspect state and resume
   state = graph.get_state(config)
   # Modify state if needed
   graph.invoke(
       None,  # Resume from checkpoint
       config=config,
       interrupt_before=["next_step"]
   )
   ```

4. **Async vs. sync**: Always use `AsyncPostgresSaver` in production (Kubernetes, multi-pod). `SqliteSaver` is single-writer and will corrupt under concurrent load.

**What's missing from docs**:

- Exact checkpoint write latency (p95, p99) under load
- How to handle checkpoint corruption (rare but possible)
- Migration strategy when schema changes
- Cost of checkpoint storage at scale (bytes per checkpoint)

**Recommendation for your platform**:

- Use `AsyncPostgresSaver` for all Python agents
- Implement checkpoint GC as a scheduled Kubernetes CronJob
- Monitor `checkpoint_writes` table size; alert if > 1GB
- Store checkpoint metadata (agent_id, task_type, duration) for analytics

---

### 2.3 BullMQ Cross-Language Job Queues

**What it is**: BullMQ is a Redis-backed job queue with clients for TypeScript, Python, Elixir, PHP.

**Critical for your architecture**: Your TypeScript orchestrator produces jobs; Python workers consume them. They must agree on job format.

**Shared job schema** (define in both TypeScript and Python):

```typescript
// TypeScript: job producer (orchestrator)
interface EngineeringTask {
  type: "code-review" | "refactor" | "test-generation"
  repository: string
  branch: string
  description: string
  maxTokens: number
  timeout: number // seconds
}

const queue = new Queue<EngineeringTask>("engineering-tasks", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  }
})

await queue.add("code-review", {
  type: "code-review",
  repository: "user/repo",
  branch: "feature/auth",
  description: "Review authentication implementation",
  maxTokens: 50000,
  timeout: 600
})
```

```python
# Python: job consumer (agent worker)
from bullmq import Worker
from typing import TypedDict

class EngineeringTask(TypedDict):
    type: str
    repository: str
    branch: str
    description: str
    maxTokens: int
    timeout: int

async def process_task(job: Job):
    task: EngineeringTask = job.data
    
    if task["type"] == "code-review":
        # Run OpenCode agent
        result = await run_code_review_agent(task)
        return result
    
    raise ValueError(f"Unknown task type: {task['type']}")

worker = Worker("engineering-tasks", process_task, {
    "connection": redis,
    "concurrency": 2,  # Limit concurrent agents
})
```

**Critical patterns**:

1. **Job format versioning**: Add a `version` field to job schema

   ```typescript
   interface EngineeringTask {
     version: 1  // Increment if schema changes
     // ... rest of fields
   }
   ```

2. **Idempotency**: Jobs may be retried. Ensure side effects are idempotent:
   - Don't create new resources; update existing ones
   - Use `job.id` as idempotency key in external systems

3. **Progress tracking**:

   ```python
   async def process_task(job: Job):
       await job.updateProgress(10)  # 10% complete
       # ... do work ...
       await job.updateProgress(50)
       # ... more work ...
       return result
   ```

4. **Cross-language limitations** (as of March 2026):
   - Python client doesn't support repeatable jobs (scheduled tasks)
   - Python client doesn't support job priorities
   - **Workaround**: Use TypeScript producer for scheduled tasks; Python only consumes

5. **Rate limiting per queue**:

   ```typescript
   const limiter = new RateLimiter(redis, {
     max: 10,  // 10 jobs
     duration: 60,  // per 60 seconds
   })
   
   await queue.add("task", data, {
     limiter: limiter
   })
   ```

**What's missing from docs**:

- Exact serialization format (msgpack vs. JSON)
- How to handle job data > Redis max string size (512MB)
- Retry behavior when Python worker crashes mid-job
- How to correlate BullMQ job_id with external systems (Slack, GitHub)

**Recommendation for your platform**:

- Define shared TypeScript/Python types in a monorepo package
- Use `job.id` as correlation ID in all logs
- Implement job timeout enforcement (kill worker if job exceeds timeout)
- Monitor queue depth; alert if > 1000 pending jobs

---

### 2.4 pgvector + Supabase for RAG & Knowledge Base

**What it is**: PostgreSQL extension for vector similarity search; enables semantic search over documents.

**Production pattern**:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  embedding VECTOR(1536),  -- OpenAI text-embedding-3-small
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- HNSW index (better for dynamic data)
CREATE INDEX ON documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Hybrid search function (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 1.0,
  semantic_weight FLOAT DEFAULT 1.0
) RETURNS TABLE (
  id BIGINT,
  content TEXT,
  similarity FLOAT
) AS $$
WITH semantic_search AS (
  SELECT id, content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM documents
  ORDER BY embedding <=> query_embedding
  LIMIT match_count
),
keyword_search AS (
  SELECT id, content,
    ts_rank(to_tsvector('english', content), 
            plainto_tsquery('english', query_text)) AS similarity
  FROM documents
  WHERE to_tsvector('english', content) @@ 
        plainto_tsquery('english', query_text)
  LIMIT match_count
),
rrf_combined AS (
  SELECT 
    COALESCE(s.id, k.id) AS id,
    COALESCE(s.content, k.content) AS content,
    (
      COALESCE(1.0 / (60 + ROW_NUMBER() OVER (ORDER BY s.similarity DESC)), 0) * semantic_weight +
      COALESCE(1.0 / (60 + ROW_NUMBER() OVER (ORDER BY k.similarity DESC)), 0) * full_text_weight
    ) AS rrf_score
  FROM semantic_search s
  FULL OUTER JOIN keyword_search k ON s.id = k.id
)
SELECT id, content, rrf_score::FLOAT AS similarity
FROM rrf_combined
ORDER BY rrf_score DESC
LIMIT match_count;
$$ LANGUAGE SQL;
```

**Critical for your architecture**:

1. **Embedding strategy**:
   - Use OpenAI `text-embedding-3-small` (1536 dims, $0.02/1M tokens)
   - Batch embed documents offline; store in pgvector
   - For real-time queries, embed on-the-fly (adds ~100ms latency)

2. **Hybrid search is essential**:
   - Vector-only search fails on exact matches (error codes, SKUs, proper nouns)
   - Keyword-only search misses semantic intent
   - Reciprocal Rank Fusion (RRF) combines both without manual weighting

3. **Index tuning**:
   - HNSW: Better for dynamic data (frequent inserts); slower to build
   - IVFFlat: Faster to build; requires retraining after inserts
   - **Recommendation**: Use HNSW for agent knowledge bases

4. **Chunking strategy**:

   ```python
   # Split documents into chunks with overlap
   def chunk_document(text: str, chunk_size: int = 800, overlap: int = 100):
       chunks = []
       for i in range(0, len(text), chunk_size - overlap):
           chunks.append(text[i:i + chunk_size])
       return chunks
   
   # Embed and store
   for chunk in chunks:
       embedding = await openai.embeddings.create(
           model="text-embedding-3-small",
           input=chunk
       )
       await supabase.table("documents").insert({
           "content": chunk,
           "embedding": embedding.data[0].embedding,
           "metadata": {"source": filename, "chunk_index": i}
       })
   ```

5. **Query cost optimization**:
   - Limit match_count to 10-20 (diminishing returns beyond)
   - Use metadata filters to reduce search space
   - Cache embeddings for common queries

**What's missing from docs**:

- Exact latency of hybrid search at scale (10K, 100K, 1M documents)
- How to handle embedding model updates (re-embed all documents?)
- Cost of pgvector storage (bytes per embedding)
- Reranking strategy (BM25, cross-encoder) for top-K results

**Recommendation for your platform**:

- Implement document ingestion pipeline (async, batched)
- Use hybrid search for all agent queries
- Monitor embedding cache hit rate
- Store embedding metadata (source, chunk_index, created_at) for debugging

---

### 2.5 OpenRouter API Rate Limiting & Routing

**What it is**: OpenRouter is an LLM gateway that routes requests across providers (OpenAI, Anthropic, Google, Mistral, etc.).

**Production pattern**:

```typescript
// Declarative routing configuration
const routingConfig = {
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "..." }],
  provider: {
    // Route by latency (for interactive), price (for batch), or throughput
    sort: "latency",
    order: ["anthropic", "openai", "google"],  // Fallback chain
    allow_fallbacks: true,
    zdr: true,  // Zero Data Retention (no logging)
    max_price: {
      prompt: 0.01,      // $/1K tokens
      completion: 0.05
    }
  }
}

// Single API call handles all routing internally
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer": "https://your-domain.com",
    "X-Title": "AI Employee Platform"
  },
  body: JSON.stringify(routingConfig)
})
```

**Critical for your architecture**:

1. **Rate limit types**:
   - **Free tier**: 50 requests/day (if no credits), 1000 requests/day (if $10+ credits)
   - **Paid tier**: RPM (requests per minute) based on account balance
   - **Per-model limits**: Some models have lower limits

   **Recommendation**: Always use paid tier; implement per-agent budget

2. **Fallback chains**:

   ```typescript
   // If primary provider fails, automatically retry with fallback
   const models = [
     "anthropic/claude-sonnet-4.5",  // Primary
     "openai/gpt-4-turbo",            // Fallback 1
     "google/gemini-2-flash"          // Fallback 2
   ]
   
   // OpenRouter tries each in order until one succeeds
   ```

3. **Cost-aware routing**:

   ```typescript
   // For batch processing, prioritize cheapest provider
   provider: {
     sort: "price",
     max_price: { prompt: 0.001, completion: 0.005 }
   }
   
   // For interactive, prioritize fastest
   provider: {
     sort: "latency",
     preferred_max_latency: { p90: 2000, p99: 5000 }  // ms
   }
   ```

4. **Token counting**:
   - OpenRouter charges by actual tokens used (not estimated)
   - Different models have different tokenization
   - **Recommendation**: Track token usage per agent, per task type

5. **Rate limit headers**:

   ```typescript
   const response = await fetch(...)
   const remaining = response.headers.get("x-ratelimit-remaining-requests")
   const resetAt = response.headers.get("x-ratelimit-reset-requests")
   
   if (remaining < 10) {
     // Implement backoff or queue for later
   }
   ```

**What's missing from docs**:

- Exact latency per provider (p50, p95, p99)
- How fallback chains affect cost (does it retry on 429?)
- Whether ZDR (zero data retention) adds latency
- How to handle provider-specific errors (e.g., Anthropic's overload)

**Recommendation for your platform**:

- Implement token counter middleware (log every LLM call)
- Use cost-aware routing for batch tasks; latency-aware for interactive
- Set per-agent daily budget; circuit break if exceeded
- Monitor fallback chain success rates; adjust if primary provider unreliable

---

### 2.6 Fly.io Ephemeral Machines for Agent Execution

**What it is**: Fly.io Machines are fast-launching VMs (1-2s startup) for running isolated code.

**Two models**:

1. **Ephemeral** (stateless, destroyed after use):
   - Best for: One-shot tasks, stateless processing
   - Startup: ~100ms
   - Cost: Per-second billing, scales to zero

2. **Sprites** (persistent, checkpoint/restore):
   - Best for: Long-running agents, state preservation
   - Startup: ~1-2s from checkpoint
   - Cost: Hourly + storage

**Production pattern** (for OpenCode agents):

```typescript
// Fly.io Machines API
import { Fly } from "@fly/api"

const fly = new Fly(process.env.FLY_API_TOKEN)

// Create a machine for an agent
const machine = await fly.machines.create({
  app: "ai-employee-platform",
  region: "sjc",  // San Jose (closest to your users)
  config: {
    image: "your-registry/opencode-agent:latest",
    env: {
      OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD,
      AGENT_TYPE: "engineering",
      JOB_ID: jobId
    },
    services: [
      {
        protocol: "http",
        internal_port: 4096,  // OpenCode server port
        ports: [{ port: 443 }]
      }
    ],
    // Auto-stop after 30 min idle
    auto_stop: "stop",
    auto_start: true
  }
})

// Wait for machine to start
await fly.machines.wait(machine.id, { state: "started" })

// Send request to agent
const response = await fetch(`https://${machine.id}.internal:4096/session`, {
  method: "POST",
  headers: { "Authorization": `Basic ${btoa("opencode:" + password)}` }
})

// Cleanup
await fly.machines.destroy(machine.id)
```

**Critical for your architecture**:

1. **Machine lifecycle**:
   - Create per job (or reuse pool of pre-created machines)
   - Auto-stop after idle timeout (saves cost)
   - Destroy on job completion (or keep for next job)

2. **Networking**:
   - Machines get unique HTTPS URLs (`.internal` for private)
   - Use `fly-replay` header for routing
   - Firewall rules: restrict to your orchestrator IP

3. **Storage**:
   - Ephemeral filesystem (cleared on restart)
   - Persistent volumes (optional, for state)
   - **Recommendation**: Use volumes only for long-running agents

4. **Cost model**:
   - Shared CPU: $0.003/hour
   - Dedicated CPU: $0.03/hour
   - Storage: $0.15/GB/month
   - **Calculation**: 100 agents × 10 min/job × $0.003/hour = $0.05/job

5. **Scaling**:
   - Pre-create machine pool (10-20 machines)
   - Assign machines to jobs on-demand
   - Destroy after job completion
   - Monitor machine utilization; scale pool size

**What's missing from docs**:

- Exact startup latency (cold vs. warm)
- How to handle machine failures (auto-restart?)
- Cost comparison with Kubernetes
- How to debug machine issues (logs, SSH access)

**Recommendation for your platform**:

- Use Fly.io Machines for OpenCode agents (engineering department)
- Pre-create pool of 10 machines; assign on-demand
- Set auto-stop to 30 min; destroy on job completion
- Monitor machine startup latency; alert if > 5s

---

## PART 3: CRITICAL ARCHITECTURE DECISIONS

### 3.1 Memory Architecture (Most Important)

**The problem**: Agents need three types of memory:

1. **Working memory** (current task context)
   - What: Current conversation, recent tool outputs
   - Where: LangGraph state (in-memory or checkpoint)
   - Lifetime: Duration of task (minutes to hours)

2. **Episodic memory** (past interactions)
   - What: Previous tasks, outcomes, lessons learned
   - Where: PostgreSQL (LangGraph checkpoints)
   - Lifetime: Days to weeks

3. **Semantic memory** (knowledge base)
   - What: Documents, code, best practices
   - Where: pgvector (Supabase)
   - Lifetime: Months to years

**Production pattern**:

```python
# Layered memory system
class AgentMemory:
    def __init__(self, agent_id: str, db: AsyncPG):
        self.agent_id = agent_id
        self.db = db
        self.working_memory = {}  # In-memory, cleared per task
        
    async def recall_episodic(self, query: str, limit: int = 5):
        """Retrieve past task outcomes"""
        return await self.db.fetch("""
            SELECT task_description, outcome, timestamp
            FROM agent_episodes
            WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '30 days'
            ORDER BY created_at DESC
            LIMIT $2
        """, self.agent_id, limit)
    
    async def recall_semantic(self, query: str, limit: int = 10):
        """Retrieve knowledge base documents"""
        embedding = await openai.embeddings.create(
            model="text-embedding-3-small",
            input=query
        )
        return await self.db.fetch("""
            SELECT content, metadata
            FROM documents
            WHERE 1 - (embedding <=> $1::vector) > 0.7
            ORDER BY embedding <=> $1::vector
            LIMIT $2
        """, embedding.data[0].embedding, limit)
    
    async def store_episode(self, task: str, outcome: str):
        """Store task outcome for future recall"""
        await self.db.execute("""
            INSERT INTO agent_episodes (agent_id, task_description, outcome)
            VALUES ($1, $2, $3)
        """, self.agent_id, task, outcome)
```

**Critical decisions**:

1. **Checkpoint retention**: Keep last 20 checkpoints per agent; delete older than 24h
2. **Episode retention**: Keep 30 days of episodes; summarize older ones
3. **Semantic retention**: Keep indefinitely; update embeddings when documents change
4. **Memory size limits**: Cap working memory at 100K tokens; summarize if exceeded

---

### 3.2 Failure Mode Taxonomy

**Document every failure mode**:

| Failure | Cause | Detection | Recovery |
|---------|-------|-----------|----------|
| **Transient LLM error** | Provider overload (503) | Retry with exponential backoff | Automatic (3 retries) |
| **Rate limit** | Too many requests | 429 response | Queue for later; exponential backoff |
| **Token limit exceeded** | Prompt too long | LLM error response | Summarize context; retry |
| **Tool execution timeout** | External API slow | Timeout after 30s | Retry or skip tool |
| **Checkpoint corruption** | Concurrent writes | Query fails | Restore from previous checkpoint |
| **Agent loop** | Infinite reasoning | Step count > 100 | Interrupt; escalate to human |
| **Budget exceeded** | Too many tokens | Token counter > limit | Stop agent; alert |
| **Machine crash** | OOM or kernel panic | Machine state = "failed" | Restart machine; resume from checkpoint |

**Recommendation**: Document recovery strategy for each failure mode.

---

### 3.3 Observability Instrumentation

**Minimum required**:

```python
import structlog
from opentelemetry import trace, metrics

logger = structlog.get_logger()
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)

# Every agent execution
with tracer.start_as_current_span("agent_execution") as span:
    span.set_attribute("agent_id", agent_id)
    span.set_attribute("job_id", job_id)
    span.set_attribute("task_type", task_type)
    
    logger.info("agent_started", agent_id=agent_id, job_id=job_id)
    
    try:
        # Every LLM call
        with tracer.start_as_current_span("llm_call") as llm_span:
            llm_span.set_attribute("model", model)
            llm_span.set_attribute("tokens_in", tokens_in)
            
            response = await llm.create(...)
            
            llm_span.set_attribute("tokens_out", tokens_out)
            meter.counter("llm_tokens").add(tokens_in + tokens_out)
        
        # Every tool call
        with tracer.start_as_current_span("tool_call") as tool_span:
            tool_span.set_attribute("tool_name", tool_name)
            tool_span.set_attribute("tool_args", tool_args)
            
            result = await tool.execute(...)
            
            tool_span.set_attribute("tool_result", result)
        
        logger.info("agent_completed", agent_id=agent_id, duration=duration)
        
    except Exception as e:
        logger.error("agent_failed", agent_id=agent_id, error=str(e))
        span.record_exception(e)
        raise
```

**Critical metrics**:

- `agent_execution_duration` (histogram): How long agents take
- `llm_tokens_total` (counter): Total tokens used (for cost tracking)
- `tool_call_duration` (histogram): How long tools take
- `agent_errors_total` (counter): Error rate by type
- `checkpoint_write_latency` (histogram): Database performance

---

## PART 4: IMPLEMENTATION CHECKLIST

### Phase 1: Foundation (Week 1-2)

- [ ] Define system context diagram (boundaries, external systems)
- [ ] Document failure mode taxonomy (per component)
- [ ] Design state schema (LangGraph for Python, OpenCode for TypeScript)
- [ ] Set up PostgreSQL with pgvector and LangGraph checkpointing
- [ ] Implement BullMQ job queue with shared schema (TypeScript + Python)
- [ ] Create OpenCode client wrapper (session lifecycle management)

### Phase 2: Observability (Week 2-3)

- [ ] Implement structured logging (JSON, trace IDs)
- [ ] Set up OpenTelemetry (traces, metrics, logs)
- [ ] Create dashboards (agent execution, token usage, errors)
- [ ] Implement cost tracking (per agent, per task type)
- [ ] Set up alerting (budget exceeded, error rate, latency)

### Phase 3: Resilience (Week 3-4)

- [ ] Implement checkpoint GC (prune old checkpoints)
- [ ] Add circuit breakers (LLM, tool, database)
- [ ] Implement retry logic (exponential backoff with jitter)
- [ ] Add human-in-the-loop interrupts (approval workflows)
- [ ] Test failure scenarios (provider outage, machine crash, budget exceeded)

### Phase 4: Scaling (Week 4+)

- [ ] Deploy to Fly.io (machine pool, auto-scaling)
- [ ] Implement rate limiting (per agent, per provider)
- [ ] Add multi-agent orchestration (handoff protocols)
- [ ] Optimize pgvector queries (indexing, chunking)
- [ ] Monitor production metrics (latency, cost, error rate)

---

## PART 5: COMMON PITFALLS & HOW TO AVOID THEM

| Pitfall | Symptom | Root Cause | Fix |
|---------|---------|-----------|-----|
| **Unbounded checkpoint growth** | Queries slow down after 1M rows | No GC strategy | Implement daily pruning (keep last 20 per thread) |
| **Silent job failures** | Jobs disappear from queue | No error logging | Log every exception; store failed jobs in DLQ |
| **Token budget overruns** | Unexpected $10K bill | No token counting | Add counter at every LLM call; circuit break at limit |
| **Checkpoint corruption** | Agent resumes from bad state | Concurrent writes | Use AsyncPostgresSaver; validate state on resume |
| **Cross-language job mismatch** | Python workers crash | Schema drift | Define shared types; version job schema |
| **Machine startup latency** | Agents slow to start | Cold starts | Pre-create machine pool; use checkpoint/restore |
| **Infinite agent loops** | Agent never completes | No iteration limit | Cap steps at 100; interrupt if exceeded |
| **Missing audit trail** | Can't debug production issues | No structured logging | Log every decision; include trace ID |
| **Unscoped tool permissions** | Agent deletes production data | No RBAC | Define tool permissions per agent type |
| **No human oversight** | Agent makes irreversible decisions | No interrupts | Add approval nodes before high-impact actions |

---

## PART 6: REFERENCE IMPLEMENTATIONS

### OpenCode Agent Wrapper (TypeScript)

```typescript
// Wraps OpenCode client with job queue integration
class OpenCodeJobHandler {
  constructor(
    private opencode: OpencodeClient,
    private queue: Queue,
    private logger: Logger
  ) {}
  
  async handleJob(job: Job<EngineeringTask>) {
    const sessionId = `job-${job.id}`
    
    try {
      // Create session
      const session = await this.opencode.session.create({
        body: { name: sessionId }
      })
      
      // Store session ID for debugging
      await job.updateData({ sessionId: session.data.id })
      
      // Send prompt
      const response = await this.opencode.session.prompt({
        path: { id: session.data.id },
        body: {
          content: job.data.description,
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                code: { type: "string" },
                explanation: { type: "string" }
              }
            }
          }
        }
      })
      
      // Update progress
      await job.updateProgress(100)
      
      return response.data
      
    } catch (error) {
      this.logger.error("job_failed", {
        jobId: job.id,
        error: error.message,
        sessionId: job.data().sessionId
      })
      throw error
    }
  }
}
```

### LangGraph Agent with Checkpointing (Python)

```python
# Durable agent with PostgreSQL checkpointing
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
import asyncpg

class ResearchAgent:
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        self.checkpointer = AsyncPostgresSaver(db_pool)
    
    async def build_graph(self):
        graph = StateGraph(AgentState)
        
        # Add nodes
        graph.add_node("research", self.research_node)
        graph.add_node("analyze", self.analyze_node)
        graph.add_node("summarize", self.summarize_node)
        
        # Add edges
        graph.add_edge(START, "research")
        graph.add_edge("research", "analyze")
        graph.add_edge("analyze", "summarize")
        graph.add_edge("summarize", END)
        
        # Compile with checkpointing
        return graph.compile(checkpointer=self.checkpointer)
    
    async def research_node(self, state: AgentState):
        # Retrieve documents from pgvector
        docs = await self.recall_semantic(state["query"])
        return {"documents": docs}
    
    async def analyze_node(self, state: AgentState):
        # Analyze documents
        analysis = await self.llm.analyze(state["documents"])
        return {"analysis": analysis}
    
    async def summarize_node(self, state: AgentState):
        # Summarize findings
        summary = await self.llm.summarize(state["analysis"])
        return {"summary": summary}
    
    async def recall_semantic(self, query: str):
        # Hybrid search in pgvector
        embedding = await self.openai.embeddings.create(
            model="text-embedding-3-small",
            input=query
        )
        
        results = await self.db_pool.fetch("""
            SELECT content, metadata
            FROM documents
            WHERE 1 - (embedding <=> $1::vector) > 0.7
            ORDER BY embedding <=> $1::vector
            LIMIT 10
        """, embedding.data[0].embedding)
        
        return results
```

---

## CONCLUSION

**The gap between working prototypes and production systems is architectural, not algorithmic.**

Your platform will succeed if you:

1. **Document failure modes explicitly** (not assumed)
2. **Implement observability from day one** (not bolted on)
3. **Design for cost control** (not discovered after $100K bill)
4. **Separate concerns** (memory, execution, orchestration, governance)
5. **Test failure scenarios** (not just happy paths)

The 2026 benchmark data is clear: **persistent agents with durable state, human oversight, and cost controls outperform ephemeral agents by 4x on multi-day workflows.**

Your architecture document should be a contract between engineering and operations—not a marketing document.

---

## REFERENCES

- **AI Agent Production Best Practices 2026** (Calmops)
- **Agentic AI Reference Architecture** (TopAIAgent, 2026)
- **LangGraph Persistence & Checkpointing** (LangChain Docs, 2026)
- **BullMQ Cross-Language Patterns** (BullMQ Docs, 2026)
- **pgvector + Supabase RAG** (Supabase Docs, 2026)
- **OpenRouter Multi-Provider Routing** (OpenRouter Docs, 2026)
- **Fly.io Ephemeral Machines** (Fly.io Docs, 2026)
- **Persistent vs. Ephemeral Agents** (Computer Agents, 2026)
- **Capability-Centric Architecture for Multi-Agent Systems** (Michael Stal, 2026)
- **AI Agent Architecture: Tools, Memory, Evals, Guardrails** (Andrii Furmanets, 2026)
