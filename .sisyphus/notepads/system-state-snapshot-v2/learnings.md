# Learnings — system-state-snapshot-v2

## Research Pre-Loaded (explore agents, May 14 2026)

### Inngest Functions (5 active, authoritative from serve.ts)

- `employee/universal-lifecycle` | event: `employee/task.dispatched`
- `employee/interaction-handler` | event: `employee/interaction.received`
- `employee/rule-extractor` | event: `employee/rule.extract-requested`
- `employee/rule-synthesizer` | event: `employee/rule.synthesize-requested`
- `trigger/reviewing-watchdog` | cron: `*/15 * * * *`
- NOTE: `guest-message-poll` is deregistered (source preserved, NOT active)

### Approved LLM Models

- `minimax/minimax-m2.7` — all employee execution work
- `anthropic/claude-haiku-4-5` — interaction classification, rule extraction, rule synthesis

### Prisma Models (24 total, 4 groups)

- MVP-Active (7): Task, Execution, Deliverable, ValidationRun, Project, TaskStatusLog, Department
- Forward-Compatibility (9): Archetype, KnowledgeBase, KnowledgeBaseEntry, RiskModel, CrossDeptTrigger, AgentVersion, Clarification, Review, AuditLog
- Multi-Tenancy (5): Tenant, TenantIntegration, SystemEvent, TenantSecret, PendingApproval
- Feedback/Rules (3): PropertyLock, FeedbackEvent, EmployeeRule
- NOTE: LearnedRule was dropped (migration 20260512054756)

### Worker Tools (19 across 5 dirs)

- slack/ (3), hostfully/ (8), locks/ (6 - 4 new since Apr 29), knowledge_base/ (1), platform/ (1)

### Key Changes Since Apr 29 Snapshot

- Code-rotation archetype added (4th active archetype)
- feedback_events + employee_rules tables added; LearnedRule dropped
- WORKER_RUNTIME env var (replaces USE_LOCAL_DOCKER flags)
- EMPLOYEE_RULES / EMPLOYEE_KNOWLEDGE replace LEARNED_RULES_CONTEXT
- 4 new lock tools
- 2 new admin routes (KB, property-locks)
- Cron daily-summarizer moved to external cron-job.org (no longer Inngest)

### Guardrails (CRITICAL)

- Old snapshot MUST NOT be modified (2026-04-29-2255-current-system-state.md)
- No per-tenant channel IDs (no C-codes)
- No CLI syntax for shell tools (reference AGENTS.md)
- No individual gateway routes — categories only
- Hard ceiling: 600 lines
- guest-message-poll must NOT appear as active
