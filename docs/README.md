# Digital AI Employee Platform: Architecture Documentation

This directory contains comprehensive architecture documentation for your AI agent deployment platform.

## Documents

### 1. **2026-03-22-2314-ai-employee-platform-architecture-guide.md** (35KB)
**The complete reference guide.** Read this first.

**Covers**:
- 8 essential sections for production AI agent platforms
- What's commonly missing from architecture docs (root causes of failures)
- Technology-specific patterns:
  - OpenCode HTTP server API (`opencode serve`)
  - LangGraph PostgreSQL checkpointing
  - BullMQ cross-language job queues
  - pgvector + Supabase for RAG
  - OpenRouter API rate limiting & routing
  - Fly.io ephemeral machines
- Critical architecture decisions (memory, failure modes, observability)
- Implementation checklist (4 phases, 4 weeks)
- Common pitfalls & how to avoid them
- Reference implementations (TypeScript + Python)

**Key insight**: The gap between working prototypes and production systems is **architectural, not algorithmic**. 40%+ of agentic AI projects fail because teams optimize for agent capability while ignoring reliability, observability, and cost control.

---

### 2. **2026-03-22-2314-quick-reference-checklist.md** (8KB)
**Quick reference for implementation.** Use alongside the full guide.

**Covers**:
- Critical decisions to make first (memory, execution, cost control)
- 4-phase implementation plan with success criteria
- Technology quick reference (code snippets)
- Monitoring dashboard queries (SQL)
- Common errors & fixes
- Deployment checklist

**Use this when**: You're actively implementing and need quick answers.

---

## Key Findings from 2026 Research

### What's Commonly Missing (Causes Implementation Failures)

1. **Deterministic Failure Taxonomy** — Explicit categorization of failure modes with recovery strategies
2. **State Transition Contracts** — Formal definition of valid state transitions and invariants
3. **Tool Permission Scoping** — RBAC matrix per agent type
4. **Cost Attribution & Budgeting** — Per-agent, per-task token/API call budgets
5. **Checkpoint Lifecycle Management** — Strategy for pruning old checkpoints
6. **Human-in-the-Loop Interruption Points** — Where humans can inspect/modify/reject decisions
7. **Cross-Language Job Queue Semantics** — How TypeScript producers and Python consumers agree on format
8. **Observability Instrumentation Plan** — What gets logged, at what level, how to correlate traces

### Technology Stack Recommendations

| Component | Technology | Why |
|-----------|-----------|-----|
| **Engineering agents** | OpenCode + Fly.io Machines | Native code execution; fast startup |
| **Non-engineering agents** | LangGraph + Python | Flexible orchestration; durable state |
| **Job queue** | BullMQ + Upstash Redis | Cross-language; production-ready |
| **State persistence** | PostgreSQL + LangGraph checkpointing | Durable; resumable; human-in-the-loop |
| **Knowledge base** | pgvector + Supabase | Hybrid search (vector + keyword) |
| **LLM routing** | OpenRouter | Multi-provider fallbacks; cost control |
| **Observability** | OpenTelemetry + structured logging | Traces, metrics, logs; correlation IDs |

### 2026 Benchmark Data

From 1.7B+ workflows (CrewAI, 2026):

| Metric | Ephemeral | Persistent | Winner |
|--------|-----------|-----------|--------|
| One-shot research | 92% success, 45s | 94% success, 38s | Tie |
| 3-5 file refactor | 68% autonomous | 91% autonomous | Persistent +34% |
| Daily report (7 days) | 22% full automation | 87% full automation | Persistent ~4x |
| Error recovery | 41% self-correction | 78% self-correction | Persistent +90% |
| Cost per 100 tasks | $18-$42 | $9-$21 | Persistent ~50% lower |

**Conclusion**: Persistence dominates when workflows need memory, scheduling, retries, and consistent outputs over time.

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
Get one agent working end-to-end with checkpointing.
- [ ] PostgreSQL + pgvector
- [ ] Redis + BullMQ
- [ ] OpenCode client wrapper
- [ ] LangGraph checkpointing
- [ ] Test: Job → Agent → Checkpoint → Resume

### Phase 2: Observability (Week 2-3)
Instrument every execution with traces, metrics, logs.
- [ ] OpenTelemetry setup
- [ ] Structured logging (JSON)
- [ ] Dashboards (Grafana/Datadog)
- [ ] Cost tracking
- [ ] Alerting

### Phase 3: Resilience (Week 3-4)
Handle failures gracefully; implement recovery.
- [ ] Checkpoint GC
- [ ] Circuit breakers
- [ ] Retry logic (exponential backoff)
- [ ] Human-in-the-loop interrupts
- [ ] Test failure scenarios

### Phase 4: Scaling (Week 4+)
Deploy to production; scale to 100+ agents.
- [ ] Fly.io deployment
- [ ] Machine pool (pre-created)
- [ ] Rate limiting
- [ ] Multi-agent orchestration
- [ ] Production monitoring

---

## Critical Decisions

### Memory Architecture
- **Working memory**: In-process (LangGraph state) for < 100K tokens
- **Episodic memory**: PostgreSQL checkpoints; promote summaries to separate table
- **Semantic memory**: pgvector for < 5M vectors; Pinecone/Qdrant for larger

### Execution Model
- **OpenCode agents**: Fly.io Machines (simplicity) or Kubernetes (scale)
- **Python agents**: LangGraph with AsyncPostgresSaver (always)
- **Job queue**: BullMQ with Upstash Redis (cross-language support)

### Cost Control
- **Token budgets**: Per-agent daily limit; circuit break at 80%
- **LLM routing**: OpenRouter with cost-aware fallbacks
- **Machine lifecycle**: Pre-create 10-20; destroy after job

---

## Common Pitfalls & Fixes

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Unbounded checkpoint growth | Queries slow after 1M rows | Daily GC: keep last 20 per thread |
| Silent job failures | Jobs disappear | Log every exception; DLQ for failed jobs |
| Token budget overruns | $10K bill surprise | Token counter at every LLM call |
| Checkpoint corruption | Bad state on resume | Use AsyncPostgresSaver; validate state |
| Cross-language mismatch | Python workers crash | Shared types; version job schema |
| Machine startup latency | Agents slow | Pre-create pool; checkpoint/restore |
| Infinite agent loops | Never completes | Cap steps at 100; interrupt if exceeded |
| Missing audit trail | Can't debug | Structured logging; trace IDs |
| Unscoped tool permissions | Agent deletes data | RBAC matrix per agent type |
| No human oversight | Irreversible decisions | Approval nodes before high-impact actions |

---

## Quick Start

1. **Read the full guide**: `2026-03-22-2314-ai-employee-platform-architecture-guide.md`
2. **Review quick reference**: `2026-03-22-2314-quick-reference-checklist.md`
3. **Start Phase 1**: Get one agent working with checkpointing
4. **Add observability**: Instrument every execution
5. **Test failures**: Verify recovery strategies
6. **Scale to production**: Deploy to Fly.io; monitor metrics

---

## Key Takeaways

> **The gap between working prototypes and production systems is architectural, not algorithmic.**

Your platform will succeed if you:

1. **Document failure modes explicitly** (not assumed)
2. **Implement observability from day one** (not bolted on)
3. **Design for cost control** (not discovered after $100K bill)
4. **Separate concerns** (memory, execution, orchestration, governance)
5. **Test failure scenarios** (not just happy paths)

The 2026 benchmark data is clear: **persistent agents with durable state, human oversight, and cost controls outperform ephemeral agents by 4x on multi-day workflows.**

Your architecture document should be a **contract between engineering and operations**—not a marketing document.

---

## References

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

---

**Last updated**: March 22, 2026  
**Status**: Research-backed; production-ready patterns
