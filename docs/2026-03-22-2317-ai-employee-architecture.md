# Digital AI Employee Platform — Architecture

## Table of Contents

- [1. Platform Vision](#1-platform-vision)
- [2. Platform Architecture](#2-platform-architecture)
- [3. Employee Archetype Framework](#3-employee-archetype-framework)
- [4. Universal Task Lifecycle](#4-universal-task-lifecycle)
  - [4.1 Department-Specific Interpretations](#41-department-specific-interpretations)
  - [4.2 Mid-Flight Task Updates](#42-mid-flight-task-updates)
- [5. Cross-Department Workflow Orchestration](#5-cross-department-workflow-orchestration)
- [6. Department Archetypes — Detailed Specifications](#6-department-archetypes--detailed-specifications)
- [7. Architecture Review & Design Decisions (Engineering)](#7-architecture-review--design-decisions-engineering)
- [8. Engineering Department — System Context](#8-engineering-department--system-context)
- [9. Engineering Department — Phase Details](#9-engineering-department--phase-details)
  - [9.1 Triage Agent](#91-triage-agent)
  - [9.2 Execution Agent](#92-execution-agent)
  - [9.3 Review Agent](#93-review-agent)
  - [9.4 Branch Naming Convention](#94-branch-naming-convention)
- [10. Engineering Department — Orchestration and Scaling](#10-engineering-department--orchestration-and-scaling)
  - [10.1 Machine Health Monitoring (3-Layer Approach)](#101-machine-health-monitoring-3-layer-approach)
  - [10.2 Scaling Strategy](#102-scaling-strategy)
- [11. Engineering Department — Full Lifecycle Sequence](#11-engineering-department--full-lifecycle-sequence)
- [12. Knowledge Base Architecture](#12-knowledge-base-architecture)
- [13. Platform Data Model](#13-platform-data-model)
- [14. Platform Shared Infrastructure](#14-platform-shared-infrastructure)
  - [14.1 Multi-Project Docker Image Strategy](#141-multi-project-docker-image-strategy)
- [15. Technology Stack](#15-technology-stack)
- [16. Implementation Roadmap](#16-implementation-roadmap)
- [17. Cost Estimation](#17-cost-estimation)
- [18. Risk Mitigation](#18-risk-mitigation)
- [19. Department Onboarding Checklist](#19-department-onboarding-checklist)
- [20. Success Metrics](#20-success-metrics)
- [21. Feedback Loops](#21-feedback-loops)
- [22. LLM Gateway Design](#22-llm-gateway-design)
  - [22.1 Cost Circuit Breaker](#221-cost-circuit-breaker)
- [23. Agent Versioning](#23-agent-versioning)
- [24. API Rate Limiting](#24-api-rate-limiting)
- [25. Security Model](#25-security-model)
- [26. Disaster Recovery](#26-disaster-recovery)
- [27. Operational Runbooks](#27-operational-runbooks)
- [28. Deferred Capabilities & Future Scale Path](#28-deferred-capabilities--future-scale-path)

---

## 1. Platform Vision

This document describes a **multi-department Digital AI Employee Platform** — a system for deploying autonomous AI agents ("digital employees") that monitor work queues, triage incoming tasks, execute domain-specific work, and submit results for review.

The platform is built by a **solo developer**, which shapes every design choice. Operational simplicity wins over theoretical scale. Self-hosted infrastructure is avoided where managed alternatives exist. The product model is **internal-first, SaaS-later**: built to run inside one company first, with multi-tenancy designed in from the start so the path to a commercial product doesn't require a rewrite.

**Engineering is the MVP department.** Paid Marketing is second, chosen specifically to validate that the archetype pattern generalizes beyond code. Every subsequent department should be addable in days, not months.

The core insight is that every department follows the same five-step workflow:

1. **Trigger** — An event arrives from an external system (Jira ticket, ad platform alert, invoice, lead form).
2. **Triage** — An AI agent analyzes the task, consults a domain knowledge base, and asks clarifying questions.
3. **Execute** — An AI agent performs the actual work using domain-specific tools.
4. **Review** — An AI agent validates the output against acceptance criteria and routes to approval or revision.
5. **Deliver** — The result is published, merged, sent, or filed, and stakeholders are notified.

What changes between departments is the **integrations** (which systems to watch), the **tools** (what the agent can do), the **knowledge base** (domain expertise), and the **approval gates** (risk thresholds). The orchestration layer, queue infrastructure, state management, and observability are shared.

The platform generalizes the proven **nexus-stack fly-worker pattern** — an existing AI-driven Fly.io dispatch system — into a reusable department runtime. **Slack** is the primary human interaction layer for approvals, questions, and status updates across all departments.

---

## 2. Platform Architecture

```mermaid
graph LR
    subgraph External Ecosystem
        JIRA(["Jira"]):::external
        GH(["GitHub"]):::external
        META(["Meta Ads"]):::external
        GHL(["GoHighLevel"]):::external
        SLACK(["Slack"]):::external
    end

    subgraph Shared Platform
        GATEWAY["Event Gateway\n(Fastify/TS)"]:::service
        INNGEST["Inngest\n(Workflows + Queue)"]:::service
        SUPABASE[("Supabase\n(PostgreSQL + pgvector)")]:::storage
        OBS["Observability\n(Inngest + Supabase)"]:::service
    end

    subgraph Department Runtimes
        ENG["Engineering\n(OpenCode)"]:::service
        MKT["Paid Marketing\n(Inngest)"]:::service
        FIN["Finance\n(future)"]:::future
        SALES["Sales\n(future)"]:::future
    end

    JIRA -.->|"1. Jira webhook"| GATEWAY
    GH -.->|"2. GitHub webhook"| GATEWAY
    META -.->|"3. Meta Ads webhook"| GATEWAY
    GHL -.->|"4. GoHighLevel webhook"| GATEWAY
    GATEWAY ==>|"5. Send task event"| INNGEST
    INNGEST ==>|"6. Trigger engineering workflow"| ENG
    INNGEST ==>|"7. Trigger marketing workflow"| MKT
    INNGEST -.->|"8. Future: finance workflow"| FIN
    INNGEST -.->|"9. Future: sales workflow"| SALES
    ENG -->|"10. Write task state"| SUPABASE
    MKT -->|"11. Write task state"| SUPABASE
    ENG -.->|"12. Send notification"| SLACK
    MKT -.->|"13. Send notification"| SLACK
    ENG -->|"14. Send execution traces"| OBS
    MKT -->|"15. Send workflow traces"| OBS

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
```

**Flow Walkthrough**

1. **Jira webhook** — Jira sends a webhook event to the Event Gateway when a ticket is created or updated, providing the raw trigger payload for normalization.
2. **GitHub webhook** — GitHub fires a webhook to the Event Gateway on PR creation or CI status events, feeding the platform repository-level signals.
3. **Meta Ads webhook** — Meta Ads sends a webhook to the Event Gateway on spend alerts or performance threshold breaches, triggering marketing department tasks.
4. **GoHighLevel webhook** — GoHighLevel sends a webhook to the Event Gateway on campaign events or pipeline stage changes, triggering sales and marketing tasks.
5. **Send task event** — The Event Gateway normalizes all incoming webhooks into the universal task schema and sends them to Inngest as the critical shared path.
6. **Trigger engineering workflow** — Inngest triggers an engineering workflow to the OpenCode-based Engineering department runtime for coding work.
7. **Trigger marketing workflow** — Inngest triggers a marketing workflow to the Inngest-based Paid Marketing department runtime for campaign optimization.
8. **Future: finance workflow** — Inngest will trigger finance workflows to the Finance department runtime once that archetype is built (dashed = not yet active).
9. **Future: sales workflow** — Inngest will trigger sales workflows to the Sales department runtime once that archetype is built (dashed = not yet active).
10. **Write task state** — The Engineering runtime writes task status, execution metadata, and agent outputs to Supabase (PostgreSQL + pgvector).
11. **Write task state** — The Paid Marketing runtime writes campaign optimization results and task status to Supabase.
12. **Send notification** — The Engineering runtime sends async Slack notifications for escalations, approvals, and completion events (dashed = async, non-blocking).
13. **Send notification** — The Paid Marketing runtime sends async Slack notifications for campaign approval requests and optimization results.
14. **Send execution traces** — The Engineering runtime sends OpenCode agent execution traces to the Observability stack (Inngest + Supabase) for debugging and monitoring.
15. **Send workflow traces** — The Paid Marketing runtime sends Inngest workflow execution logs to the Observability stack for performance monitoring.

The diagram reflects four deliberate choices:

**Event Gateway** (Fastify/TypeScript) receives webhooks from all external systems, normalizes them into a universal task schema, and sends events to Inngest. It's the only entry point — no department talks directly to an external system at ingest time.

**Inngest** provides durable workflow execution with per-department function namespaces, configurable concurrency controls, and built-in retry logic. As a managed serverless service it removes all queue infrastructure from the operational burden.

**Supabase (PostgreSQL + pgvector)** serves as the single database for both application state and vector search. It's already in the nexus-stack, so there's no new infrastructure to operate.

**Engineering (OpenCode)** uses the OpenCode CLI as its agent runtime, dispatching work to ephemeral Fly.io machines for full filesystem isolation. **Paid Marketing (Inngest)** runs event-driven workflow orchestration via Inngest — appropriate for API-heavy tasks that don't need VM isolation. **Observability** combines the Inngest Dashboard for workflow execution traces with Supabase Logs for infrastructure and query monitoring.

### MVP Architecture

The diagram below shows what gets built first — the MVP architecture for the Engineering department. The full architecture diagram above shows the complete platform vision including future departments and capabilities.

```mermaid
flowchart LR
    subgraph External
        JIRA(["Jira Cloud"]):::external
        GH(["GitHub"]):::external
    end

    subgraph Platform
        GW["Event Gateway\n(thin webhook receiver)"]:::service
        ING["Inngest\n(workflows + queue)"]:::service
        SUP[("Supabase\n(PostgreSQL)")]:::storage
    end

     subgraph Agents
         EXEC["Execution Agent\n(Fly.io + OpenCode)"]:::service
     end

    LLM["OpenRouter\n(LLM Gateway)"]:::external

    JIRA -.->|"webhook"| GW
    GW ==>|"event"| ING
    ING ==>|"dispatch"| EXEC
    EXEC -->|"state"| SUP
    EXEC -->|"PR"| GH
    EXEC -->|"inference"| LLM

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
```

> **GitHub webhooks are enabled in M4 when the review agent reacts to PR events. In MVP, GitHub is an output target only (the execution agent creates PRs).**

**What's not in the MVP**: The triage agent (deferred — execution agent reads raw ticket from `triage_result`), the review agent (deferred — PRs are reviewed manually by the developer), the marketing department, pgvector knowledge base, and the full rate limiting infrastructure. In MVP, PRs created by the execution agent are reviewed manually by the developer. The review agent is post-MVP. Each of these is documented in the roadmap (Section 16) and deferred capabilities (Section 28). Dashed lines = async; solid lines = synchronous; bold lines = critical path.

### MVP Scope Summary

The table below is the quick-reference for what is built in the MVP versus what is designed but deferred. Each deferred capability has a `> **MVP Scope**:` callout in its section and a migration path in Section 28 (Deferred Capabilities).

| Component | MVP (Building Now) | Post-MVP (Designed, Deferred) |
|---|---|---|
| Triage Agent | Raw Jira payload → `triage_result` column (no agent yet) | Full triage agent: ticket analysis, clarifying questions, pgvector similarity |
| Execution Agent | Fly.io + OpenCode, single-project, full validation pipeline | Multi-project concurrency scheduling, knowledge base integration |
| Review Agent | Deferred — human reviews PRs manually | Full review agent: risk scoring, auto-merge, Slack escalation (M4, post-MVP) |
| Knowledge Base | SQL task history + OpenCode native codebase search | pgvector embedding pipeline for semantic ticket similarity |
| Rate Limiting | Retry-on-429 wrappers in `callLLM()` | Centralized token bucket with backpressure and per-model quotas |
| LLM Gateway | `callLLM()` wrapper → OpenRouter (Claude Sonnet default) | Claude Max routing, full fallback chain, per-call cost circuit breaker |
| Agent Versioning | `agent_versions` table + forensic prompt trail | Performance profiles, A/B prompt experiments, auto-promotion |
| Observability | Inngest Dashboard + Supabase query logs | Grafana dashboards, LangSmith tracing, custom alerting |
| Departments | Engineering only | Paid Marketing, Finance, Sales (archetype-driven) |

---

## 3. Employee Archetype Framework

An "archetype" is a declarative config object that describes everything a department's AI employee needs to operate. It's not code — it's configuration. The orchestrator reads an archetype and knows which webhooks to watch, which tools to provision, which knowledge base to query, how to assess risk, and which agent runtime to spin up. Adding a new department means writing a new archetype config, not writing new orchestration logic.

### 3.1 Archetype Schema

| Field | Purpose | Example (Engineering) | Example (Paid Marketing) |
|---|---|---|---|
| `department` | Logical grouping | `engineering` | `marketing.paid` |
| `trigger_sources` | Webhook endpoints to monitor | Jira, GitHub | Meta Ads, GoHighLevel |
| `triage_tools` | Tools during triage | Jira API, codebase search | Ad account API, campaign history |
| `execution_tools` | Tools during execution | Git, file editor, test runner | Meta Ads API, analytics query |
| `review_tools` | Tools during review | GitHub PR API, CI status | Performance dashboard, brand checker |
| `knowledge_base` | Domain knowledge sources | pgvector embeddings, task history | Campaign playbooks, brand docs |
| `delivery_target` | Where results go | GitHub PR | Ad platform draft |
| `risk_model` | Approval gate configuration | File-count + critical-path score | Spend threshold + audience size |
| `concurrency` | Max parallel tasks | 3 per project | 2 per ad account |
| `escalation_rules` | When to involve human | DB migrations, auth changes | Budget > $500/day, new audience |
| **`runtime`** | **Agent runtime to use** | **`opencode`** | **`inngest`** |
| **`runtime_config`** | **Runtime-specific config** | **`{type: "fly-machine", vm_size: "performance-2x"}`** | **`{type: "inngest-function", function_id: "marketing/optimize-campaign"}`** |

#### runtime_config Examples

The `runtime_config` field carries the runtime-specific parameters the orchestrator passes when spinning up a worker. Each runtime interprets this differently.

```json
// Engineering Department — Fly.io machine execution
{
  "runtime": "opencode",
  "runtime_config": {
    "type": "fly-machine",
    "vm_size": "performance-2x",
    "image": "nexus-workers:latest",
    "max_duration_minutes": 90,
    "volume_id": "auto"
  }
}

// Paid Marketing Department — Inngest workflow function
{
  "runtime": "inngest",
  "runtime_config": {
    "type": "inngest-function",
    "function_id": "marketing/optimize-campaign"
  }
}
```

Engineering tasks run in ephemeral Fly.io VMs — full filesystem isolation, git access, test execution. Marketing tasks run as Inngest workflow functions — appropriate for API-heavy workflows that don't need VM overhead.

### 3.2 Archetype Composition

> **MVP Scope**: For MVP, the engineering archetype is a hardcoded configuration object (`engineeringArchetype`), not a dynamic registry. The Archetype Registry pattern described below is the target architecture — it activates when the Paid Marketing department is onboarded (M6). At that point, the common pattern will be extracted from two concrete implementations rather than designed speculatively. Adding the second department is the trigger, not a deadline.

The diagram below shows how an archetype config wires together into the platform and routes work to the correct runtime.

```mermaid
graph LR
    subgraph Archetype Definition
        CONFIG["Archetype Config"]:::service
        TRIGGERS["Trigger Sources"]:::service
        TOOLS["Tool Registry"]:::service
        KB["Knowledge Base"]:::storage
        RISK["Risk Model"]:::service
        RUNTIME["Runtime Config"]:::service
    end

    subgraph Platform Wiring
        REG["Archetype Registry"]:::service
        ORCH["Inngest Lifecycle\nFunctions"]:::service
    end

    subgraph Worker Pool
        OC["OpenCode Workers\n(Engineering)"]:::service
        IG["Inngest Workers\n(Marketing)"]:::service
    end

    TRIGGERS -->|"1. Declare trigger sources"| CONFIG
    TOOLS -->|"2. Register tool set"| CONFIG
    KB -->|"3. Link knowledge base"| CONFIG
    RISK -->|"4. Define risk model"| CONFIG
    RUNTIME -->|"5. Set runtime config"| CONFIG
    CONFIG -->|"6. Register archetype"| REG
    REG -->|"7. Load archetype map"| ORCH
    ORCH -->|"8. Spin up OpenCode session"| OC
    ORCH -->|"9. Trigger Inngest workflow"| IG

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
```

**Flow Walkthrough**

1. **Declare trigger sources** — The Trigger Sources config field feeds into the Archetype Config, declaring which webhook endpoints (Jira, GitHub, Meta Ads, etc.) this department monitors.
2. **Register tool set** — The Tool Registry config field feeds into the Archetype Config, listing every tool the agent can call during triage, execution, and review phases.
3. **Link knowledge base** — The Knowledge Base config field feeds into the Archetype Config, pointing to the pgvector embeddings and task history partition for this department.
4. **Define risk model** — The Risk Model config field feeds into the Archetype Config, specifying the factors, weights, and auto-approve thresholds for this department's output.
5. **Set runtime config** — The Runtime Config field feeds into the Archetype Config, specifying whether to use OpenCode (Fly.io machine) or Inngest (workflow) and the runtime-specific parameters.
6. **Register archetype** — The completed Archetype Config object is registered into the Archetype Registry, the in-memory dispatch table loaded at startup.
7. **Load archetype map** — The orchestrator reads all registered archetypes from the Archetype Registry to know which trigger sources to subscribe to and which worker pool to route tasks toward.
8. **Spin up OpenCode session** — The orchestrator dispatches engineering department tasks to the OpenCode Worker pool, launching an OpenCode session for coding work.
9. **Trigger Inngest workflow** — The orchestrator dispatches marketing department tasks to the Inngest Worker pool, triggering an Inngest workflow for campaign optimization.

The Archetype Registry is a simple in-memory map at startup. In MVP, this is a single exported config object (`engineeringArchetype`). The registry pattern activates when the second department validates that the schema generalizes. The orchestrator loads all registered archetypes, subscribes to their trigger sources, and routes incoming tasks to the correct worker pool based on the `runtime` field. No dynamic dispatch logic — the archetype config is the dispatch table.

### 3.3 Why Archetypes Matter

The archetype pattern solves a real problem: every AI agent project starts with a custom orchestration layer that's tightly coupled to one domain. When you want to add a second department, you're not extending the system — you're building a second system. That's how you end up with 2 months of work instead of 2 weeks.

By separating the *what* (archetype config) from the *how* (orchestration engine), the platform can onboard a new department without touching the core. The orchestrator doesn't know anything about Jira or Meta Ads — it knows about trigger sources, tool registries, and risk models. The archetype fills in the domain-specific values.

This also makes cross-department workflows tractable. When an engineering task requires a marketing review (say, a landing page change that affects ad spend), the orchestrator can hand off between archetypes using the same task schema. Neither department's agent needs to know about the other's internals.

The hybrid runtime model extends this flexibility further. Engineering tasks demand a coding-specific agent with deep filesystem access, git tooling, and test execution — OpenCode is built for exactly this. Marketing tasks are API-heavy workflows that benefit from Inngest's durable execution and event-driven state management. The archetype's `runtime` field makes this choice explicit and swappable: as better runtimes emerge, updating a department's agent technology requires changing one config field, not rewiring the entire pipeline.

---

## 4. Universal Task Lifecycle

Every department shares this state machine. The states are identical across all archetypes — only the transitions' internal behavior changes, defined by the archetype's runtime, tools, and knowledge base configuration. This universality is what makes it possible to onboard a new department without writing new orchestration logic: the state machine already exists; you only fill in what each state means for your domain.

```mermaid
stateDiagram-v2
    [*] --> Received: 1. Event from trigger source
    Received --> Triaging: 2. Orchestrator dispatches
    Triaging --> AwaitingInput: 3. Clarification needed
    Triaging --> Ready: 4. Task is unambiguous
    AwaitingInput --> Triaging: 5. Input received
    AwaitingInput --> Stale: 6. No response 72h
    Ready --> Provisioning: 7. Execution slot available
    Provisioning --> Executing: 8. Runtime environment ready
    Executing --> Validating: 9. Work output produced
    Validating --> Executing: 10. Validation fails, fix needed
    Validating --> Submitting: 11. All checks pass
    Submitting --> Reviewing: 12. Submitted for review
    Reviewing --> Approved: 13. Review passed
    Reviewing --> Executing: 14. Changes requested
    Approved --> Delivering: 15. Approval gate cleared
    Delivering --> Done: 16. Result delivered
    Received --> Cancelled: Task cancelled
    Triaging --> Cancelled: Task cancelled
    AwaitingInput --> Cancelled: Task cancelled
    Ready --> Cancelled: Task cancelled
    Provisioning --> Cancelled: Task cancelled
    Executing --> Cancelled: Task cancelled
    Validating --> Cancelled: Task cancelled
    Submitting --> Cancelled: Task cancelled
    Reviewing --> Cancelled: Task cancelled
    Cancelled --> [*]
    Stale --> [*]
    Done --> [*]
```

**Flow Walkthrough**

1. **Event from trigger source** — An external system (Jira, GitHub, Meta Ads, GoHighLevel) fires a webhook that the Event Gateway normalizes and enqueues, creating the task in `Received` state.
2. **Orchestrator dispatches** — The Inngest lifecycle function receives the Inngest event and launches a triage session, moving the task to `Triaging`.
3. **Clarification needed** — The triage agent detects ambiguous, missing, or contradictory requirements and moves the task to `AwaitingInput` while posting questions to the source system.
4. **Task is unambiguous** — The triage agent determines requirements are fully clear and moves the task to `Ready` with a structured context object written to Supabase.
5. **Input received** — A new webhook arrives (e.g., Jira comment) containing the reporter's answers, returning the task to `Triaging` for re-evaluation.
6. **No response 72h** — The reporter did not answer within 72 hours; the task moves to `Stale` and exits the lifecycle without execution.
7. **Execution slot available** — The Concurrency Scheduler confirms a slot is open within the project's concurrency budget and moves the task to `Provisioning`.
8. **Runtime environment ready** — For OpenCode tasks, the Fly.io machine has booted and is ready; the task moves to `Executing` where the agent writes code.
9. **Work output produced** — The execution agent completes its work (code written, API calls made) and moves the task to `Validating` where checks run.
10. **Validation fails, fix needed** — A validation stage (TypeScript, lint, unit, integration, or E2E) fails; the execution agent re-enters `Executing` at the specific failing stage.
11. **All checks pass** — Every validation stage passes; the task moves to `Submitting` where the deliverable (PR, campaign draft) is published externally.
12. **Submitted for review** — The deliverable is submitted (PR created, draft published) and the task moves to `Reviewing` where the review agent evaluates it.
13. **Review passed** — The review agent confirms acceptance criteria are met, code quality is acceptable, CI is green, and risk is below threshold; the task moves to `Approved`.
14. **Changes requested** — The review agent finds issues (failed acceptance criteria, code quality, or CI failure) and posts change requests, returning the task to `Executing`.
15. **Approval gate cleared** — The task passes the risk gate (auto-approved or human-approved via Slack) and moves to `Delivering` for final publication.
16. **Result delivered** — The deliverable is published to its final destination (PR merged, campaign published, journal entry posted) and the task reaches `Done`.

> **Note on Provisioning**: The `Provisioning` state applies only when the archetype's `runtime` is `opencode` (Fly.io machine spin-up). For `inngest` or `in-process` runtimes, the transition goes directly from `Ready → Executing` — there is no machine to provision.

> **Note on fix loop**: When `Validating → Executing` (validation fails), the execution agent re-enters at the **failing validation stage** and re-runs all subsequent stages from that point forward. A lint fix re-enters at lint and then continues through unit → integration → E2E. A TypeScript fix re-starts from TypeScript through all stages. This catches cascading failures where fixing one stage inadvertently breaks a later stage. Maximum **3 fix iterations per individual stage**; maximum **10 fix iterations total** across all stages before escalating to human.

> **Note on re-dispatch**: When a Fly.io machine times out or fails (see §10 Pattern C Hybrid), the lifecycle function checks `dispatch_attempts` in Supabase. If `dispatch_attempts < 3`, the task returns to `Executing` state via a new machine dispatch — the existing branch is reused and execution continues from the last commit. If `dispatch_attempts >= 3`, the task moves to `AwaitingInput` and Slack escalation is triggered. The `dispatch_attempts` counter is stored on the `tasks` table (see §13) and is incremented on each re-dispatch. Total timeout budget: 6 hours across all attempts.

### 4.1 Department-Specific Interpretations

The table below shows how each state maps to concrete actions per department. Engineering and Paid Marketing are fully specified. Finance and Sales are abbreviated — they follow the same pattern once their archetypes are built.

| State | Engineering (OpenCode) | Paid Marketing (Inngest) | Finance (future) | Sales (future) |
|---|---|---|---|---|
| Received | Jira ticket created | Ad performance alert | Invoice received | Lead form submitted |
| Triaging | Analyze requirements vs. codebase context | Analyze metrics vs. campaign goals | Classify expense, check budget | Qualify lead, check CRM history |
| AwaitingInput | Questions posted to Jira, awaiting reporter | Clarification on creative brief | Missing receipt or PO number | Missing company info |
| Executing | Write code on Fly.io machine, run tests | Inngest workflow: call Meta/Google Ads APIs | Categorize, reconcile, draft entry | Research prospect, draft outreach |
| Validating | TypeScript → Lint → Unit → Integration → E2E | Brand compliance + budget limits check | Double-entry balance + policy check | Messaging tone + CRM completeness |
| Reviewing | AI code review + risk score → Slack approval | Human creative approval via Slack | Manager approval over threshold | Manager approval for enterprise |
| Delivering | PR merged via GitHub → Slack notification | Campaign draft published to Meta/Google | Journal entry posted, Slack alert | Email sequence sent via GoHighLevel |

### 4.2 Mid-Flight Task Updates

**MVP approach**: Mid-flight updates to Jira tickets during execution are intentionally ignored. The current execution phase runs to completion and produces a PR.

- **Ticket updated mid-execution**: The review phase reads the latest Jira ticket state. If the update changes acceptance criteria, the review agent flags the discrepancy in its PR comment before auto-merging or escalating. *(Post-MVP: in MVP, this discrepancy is noted in the PR description for the developer's review.)*
- **Ticket cancelled mid-execution**: When a cancellation is detected (a Jira `issue_deleted` or status-change-to-Cancelled webhook arrives), the Event Gateway writes `Cancelled` to the task's Supabase record. The running Fly.io machine is **not aborted** — it finishes its current work. The review phase checks task status before proceeding; if `Cancelled`, the PR is closed without merging and the ticket is updated accordingly.
- **Entering the Cancelled state**: Any phase (triage, execution, review) checks `tasks.status` before beginning. Finding `Cancelled` terminates the lifecycle function gracefully.

**Post-MVP enhancement**: Periodic cancellation polling from within the Fly.io machine (checking `tasks.status` every 5 minutes) enables early abort for long-running tasks.

---

## 5. Cross-Department Workflow Orchestration

Departments don't operate in isolation. A single business event can cascade through multiple departments: a deal closes in Sales, Engineering provisions the client environment, Finance generates the invoice, and Marketing drafts a case study. The orchestrator supports this workflow chaining through a standardized event contract that any department can emit and any other department can consume. Neither side needs to know the other's internals.

**This is a Phase 2+ feature.** Cross-department workflow chaining should only be built after Engineering and Paid Marketing are each independently operational and validated through the shadow, supervised, and autonomous progression. Wiring departments together before each one is stable compounds complexity in ways that are hard to debug.

### 5.1 Workflow Chain Example

The diagram below shows a Sales-to-Engineering-to-Finance-to-Marketing chain. Engineering and Sales nodes are active today. Finance and Marketing workflow chaining are future work.

```mermaid
flowchart LR
    subgraph Sales
        LEAD(["Lead Qualified"]):::active
        DEAL["Close Deal"]:::active
        WON(["Deal Won"]):::active
    end

    subgraph Engineering
        PROVISION["Provision Client Env"]:::active
        DEPLOY(["Environment Ready"]):::active
    end

    subgraph Finance
        INVOICE["Generate Invoice"]:::future
        SENT(["Invoice Sent"]):::future
    end

    subgraph Marketing
        CASE["Draft Case Study"]:::future
        PUB(["Published"]):::future
    end

    LEAD ==>|"1. Lead qualified"| DEAL
    DEAL ==>|"2. Deal closed"| WON
    WON -->|"3. Trigger client provisioning"| PROVISION
    WON -.->|"4. Trigger invoice generation"| INVOICE
    PROVISION ==>|"5. Environment ready"| DEPLOY
    INVOICE -.->|"6. Invoice sent"| SENT
    DEPLOY -.->|"7. Trigger case study draft"| CASE
    CASE -.->|"8. Case study published"| PUB

    classDef active fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
```

**Flow Walkthrough**

1. **Lead qualified** — A lead passes Sales qualification criteria and the Sales agent moves the deal to the Close Deal stage via GoHighLevel.
2. **Deal closed** — The Sales agent marks the deal as won in GoHighLevel, emitting a `cross_department_trigger` event with the client's requirements payload.
3. **Trigger client provisioning** — The Engineering department receives the cross-department trigger and the Provision Client Env task begins, spinning up a Fly.io machine to set up the client environment.
4. **Trigger invoice generation** — The Finance department receives a cross-department trigger from the won deal and the Generate Invoice task begins (dashed = future, Finance archetype not yet built).
5. **Environment ready** — The Engineering execution agent completes provisioning, emits an Environment Ready event, and the client environment is live.
6. **Invoice sent** — The Finance agent completes the invoice and marks it sent (dashed = future, not yet active).
7. **Trigger case study draft** — The Marketing department receives a cross-department trigger once the environment is ready and begins drafting a case study (dashed = future).
8. **Case study published** — The Marketing agent publishes the completed case study to the CMS (dashed = future, Marketing archetype not yet built).

Solid arrows (`==>`) are active paths. Dashed arrows (`-.->`) are future connections that exist in the schema but aren't wired yet.

### 5.2 Cross-Department Event Contract

When a department completes work that should trigger another department, it emits a `cross_department_trigger` event. The schema is fixed — every department speaks the same language.

```json
{
  "event_type": "cross_department_trigger",
  "source_department": "sales",
  "source_task_id": "task_abc123",
  "target_department": "engineering",
  "target_archetype": "client_provisioning",
  "runtime_hint": "opencode",
  "payload": {
    "client_name": "Acme Corp",
    "plan_tier": "enterprise",
    "requirements": ["SSO", "custom domain", "dedicated DB"]
  },
  "priority": "high",
  "deadline": "2026-04-01T00:00:00Z"
}
```

The `runtime_hint` field tells the receiving department's orchestrator which agent runtime to use. When `"opencode"`, the engineering department spins up a Fly.io machine. When `"inngest"`, the marketing department triggers an Inngest workflow function. This avoids hard-coupling the event source to the implementation details of the target department. The source just says what it needs done and hints at how; the target decides whether to honor the hint or override it based on its own archetype config.

### 5.3 Phase 2+ Advisory

> **Phase 2+ Only**: Cross-department workflow chaining requires both source and target departments to be independently operational. Implement this after Engineering and Paid Marketing have each achieved autonomous operation through the shadow, supervised, and autonomous progression. Attempting to build workflow chaining before individual departments are stable will compound complexity.

---

## 6. Department Archetypes — Detailed Specifications

### 6.1 Engineering Department (Active — Primary Implementation)

The engineering department is the primary implementation and the pattern-setter for all other departments. It uses **OpenCode** (`opencode serve` + `@opencode-ai/sdk`) as its agent runtime, dispatching work to ephemeral Fly.io machines for full filesystem and environment isolation. The implementation builds directly on the **nexus-stack fly-worker pattern** — a proven Fly.io dispatch system with `dispatch.sh`, `orchestrate.mjs`, and `entrypoint.sh` scripts already running in production. The AI Employee Platform generalizes that pattern into a reusable department runtime rather than reinventing it.

**Trigger sources**: Jira Cloud webhooks (ticket created, comment added, status changed) and GitHub webhooks (PR created, review submitted, CI status). The Event Gateway normalizes both into the universal task schema before enqueuing.

**Agent runtime**: OpenCode CLI running via `opencode serve` on port 4096. The `@opencode-ai/sdk` TypeScript client (`createOpencodeClient()`) controls sessions programmatically — opening sessions, injecting task context, and monitoring progress. Wave-based orchestration runs via a generalized version of `orchestrate.mjs`, which today handles the nexus-stack monorepo and will be adapted to support any project repository registered in the platform.

**Execution environment**: Each task gets an ephemeral Fly.io `performance-2x` machine (8 GB RAM). The pre-built Docker image includes OpenCode CLI, GitHub CLI, pnpm, Docker-in-Docker (for Supabase local), and all project tooling. A volume-cached pnpm store and Docker layer cache keep warm-start time well under the target of 80 seconds, down from a ~157-second baseline in the original nexus-stack implementation. The boot lifecycle follows `entrypoint.sh`'s ten-step sequence: write auth tokens, clone repo, checkout or create branch, install dependencies, start Docker daemon, start local Supabase, extract credentials, apply schema, configure OpenCode, then dispatch the task.

**Knowledge base (2 layers)**:

- **Layer 1 — Semantic search (pgvector)**: Code chunks, docstrings, and README files are embedded and stored in Supabase. During triage, the agent queries this index to answer "which files are relevant to this ticket?" without reading the entire codebase.
- **Layer 2 — Task history (Supabase)**: Every completed task stores its inputs, outputs, file paths touched, and validation results. This is institutional memory — the agent can query "how was similar work done before?" to avoid re-solving solved problems.
- **Deferred — Layer 3 (Tree-sitter AST graph)** and **Layer 4 (living documentation)**: These improve triage precision but add operational complexity. They'll be added only when triage quality degrades in ways that Layer 1 and Layer 2 can't address.

**Unique challenge — concurrent PR conflicts**: Two tasks running in parallel may modify overlapping files. Because each task runs on an isolated Fly.io machine with its own git clone, there is no filesystem-level conflict — both tasks complete independently and create separate PRs. Merge conflicts are detected by GitHub at PR review time and resolved by the review agent via rebase. Per-project concurrency limits (2-3 concurrent tasks) via Inngest prevent resource exhaustion without requiring custom conflict detection.

---

### 6.2 Paid Marketing Department (Active — Second Department)

The paid marketing department validates that the archetype pattern generalizes beyond code. It uses **Inngest** as its workflow runtime — an event-driven workflow orchestrator with durable execution and built-in retry logic. Tasks run as Inngest functions rather than isolated VMs, since ad optimization requires only API calls and doesn't need filesystem access or git tooling. This makes the marketing department significantly cheaper and faster to spin up than engineering: no machine provisioning, no Docker boot, no repo clone.

**V1 scope**: Campaign performance monitoring and optimization against Meta Ads API and Google Ads API. Creative generation (image and video assets) is a V2 feature — it requires multimodal models, creative approval workflows, and brand compliance tooling that don't belong in the first iteration.

**Trigger sources**: Meta Marketing API webhooks (spend alerts, performance thresholds), scheduled cron jobs (daily performance reviews), and GoHighLevel webhooks (campaign events and pipeline stage changes).

Detailed marketing agent specifications — risk model weights, tool configurations, and Inngest workflow patterns — will be defined when M6 planning begins.

---

### 6.3 Organic Content / Content Marketing Department (Planned)

The organic content department monitors content calendars and generates blog posts, social media content, and SEO-optimized articles from briefs and keyword targets. It triggers from content calendar events and SEO alert tools (Ahrefs or SEMrush rank changes) and uses Inngest workflows with a writing-focused tool set: long-form generation, social formatting, SEO metadata, and image prompt generation. Delivery targets include CMS drafts (WordPress, Webflow), social scheduling tools, and email platforms. No detailed spec is written until Engineering and Paid Marketing reach autonomous operation.

---

### 6.4 Finance Department (Planned)

The finance department processes incoming invoices, categorizes expenses, reconciles accounts, and flags anomalies for review. Triggers come from QuickBooks Online webhooks and bank feed imports via Plaid, and the department uses Inngest workflows for multi-step reconciliation with human approval gates for all journal entries above a configurable threshold. The knowledge base includes the chart of accounts, vendor master list, expense policies, and historical categorization patterns. Detailed specification is deferred until the first two departments are independently stable.

---

### 6.5 Sales Department (Planned)

The sales department qualifies inbound leads, enriches CRM records, drafts personalized outreach sequences, and follows up on stale opportunities. It triggers from GoHighLevel webhooks (form submissions, pipeline stage changes) and CRM scheduled tasks, with Inngest handling the workflow and GoHighLevel API handling execution. Manager approval is required for any opportunity above $25,000 or any enterprise prospect. Full specification is deferred to a later phase.

---

## 7. Architecture Review & Design Decisions (Engineering)

This section documents the key design decisions made during architecture review, the alternatives considered, and the reasoning behind each choice. These aren't obvious calls — each one has a real tradeoff worth understanding.

---

### 7.1 Polling vs. Event-Driven (Jira Monitoring)

The original concept described an AI agent "constantly monitoring" Jira for new tickets. Polling Jira's REST API is fragile at scale — you'll hit rate limits across multiple projects, burn compute on empty polls, and introduce latency between ticket creation and triage. Jira supports webhooks natively. A webhook listener that pushes events into a durable queue is dramatically more efficient, reliable, and scalable. The agent should react to events, not poll for them.

**Recommendation:** Jira Webhooks → Event Gateway → Inngest → Triage Agent. This pattern generalizes: every department uses webhooks or scheduled triggers through the same Event Gateway.

---

### 7.2 Hybrid Agent Runtime: OpenCode + Inngest

**The question**: Should we use one agent runtime for all departments, or choose the best tool per use case?

**The answer**: Hybrid. OpenCode for engineering, Inngest for everything else.

**Why OpenCode for engineering**: OpenCode (`opencode serve` + `@opencode-ai/sdk`) is purpose-built for AI coding workflows. It has deep integration with file editing, git operations, test execution, LSP diagnostics, and CLI tools and REST APIs. The nexus-stack already uses it in production. For a task that requires cloning a repo, modifying TypeScript files, running tests, and creating PRs — OpenCode is the right tool. There's no point building custom file editing and git integrations when a production-grade implementation already exists.

**Why Inngest for non-engineering**: Inngest provides durable execution with built-in retry logic, step-level checkpointing, and human-in-the-loop pauses. For tasks that are primarily API calls (Meta Ads, GoHighLevel, QuickBooks), OpenCode's coding tools are irrelevant overhead. Inngest's event-driven workflow model maps cleanly to multi-step business processes: collect data, analyze, decide, execute, report. Each step checkpoints before proceeding, so a crashed worker resumes from the last successful step.

**Why not one runtime for all**: Using OpenCode for marketing tasks would mean loading a coding-specific runtime, initializing git tooling, and spinning up file editing infrastructure for tasks that only need API calls. Using Inngest for engineering tasks would mean building custom file editing and git integrations from scratch — work that OpenCode already does well. Each tool is genuinely better in its domain. Forcing one runtime everywhere trades simplicity for the wrong kind of simplicity.

**The boundary**: The archetype's `runtime` field makes the choice declarative. Switching runtimes requires changing one config value. As better runtimes emerge, updating a department's agent technology doesn't require rewiring the pipeline.

---

### 7.3 Fly.io Machine Lifecycle

The nexus-stack fly-worker provides measured boot time data that directly informs the platform's performance targets.

**Warm vs. cold boot**: The nexus-stack fly-worker has measured boot times of ~7.8 minutes (467s) cold and ~2.6 minutes (157s) warm. The platform targets <80s warm boot — achievable through three levers: pre-built Docker images, shallow git clones (`--depth=2`), and volume-cached pnpm store.

**Pre-built images**: Docker images are rebuilt nightly and on every merge to `main`. The image includes the repo, installed `node_modules`, Docker-in-Docker for Supabase local, and all tooling. With a warm image already pulled, spin-up time drops to ~5-10 seconds for the container itself. The remaining time is repo checkout, dependency verification, and service startup.

**Volume persistence**: Each Fly.io machine gets a persistent volume for the pnpm store and Docker image cache. This is critical for warm boot performance. Without volume persistence, every boot re-downloads gigabytes of dependencies. With it, the pnpm store is already populated and Docker layers are already cached.

**Cost**: ~$0.05/GB-hour for `performance-2x` (2 shared CPU, 8GB RAM). A typical engineering task runs 20-60 minutes, putting per-task cost at roughly $0.50-$2.00 including machine time and storage.

**Teardown**: Machines auto-destroy on exit via `--auto-destroy`. Hard timeout is 4 hours (configurable per archetype) — any task still running at that point is killed and re-dispatched. Stale machines are detected by the 3-layer monitoring system described in Section 10.

---

### 7.4 AI-Only PR Merge is Risky

Fully autonomous PR merges — where an AI agent creates a PR and merges it without any human review — are appropriate for some changes and dangerous for others. The risk isn't that the AI will write bad code (though it might). The risk is that certain categories of change have consequences that are hard to reverse: database migrations, authentication changes, security-sensitive code paths, and new external dependencies.

A blanket "always require human review" policy defeats the purpose of autonomous operation. A blanket "always auto-merge" policy is reckless. The right answer is a risk-based merge gate.

**Risk score 0-100** based on:

- Files changed (count and which files)
- Lines modified (net diff size)
- Critical paths touched (auth, DB migrations, payment processing, security config)
- New dependencies introduced (new `package.json` entries)

**Low risk** (docs, config, small patches, test additions): auto-merge after AI review passes. No human needed.

**High risk** (DB migrations, auth changes, security-sensitive code, new external dependencies): require human approval via Slack. The agent posts the PR summary, risk breakdown, and one-click approve/reject. Approved PRs merge immediately; rejected PRs close with the reason logged.

The threshold between low and high risk is configurable per project. A startup moving fast sets a higher auto-merge threshold. A regulated business sets a lower one.

---

### 7.5 Knowledge Base Strategy

The platform uses a 2-layer knowledge base. Two additional layers are designed but deferred — they add operational complexity that isn't justified until the first two layers prove insufficient.

**Layer 1 — Vector embeddings (pgvector in Supabase)**: Code chunks, docstrings, and README files are embedded and stored in Supabase's pgvector extension. During triage, the agent queries this index to identify which files and functions are relevant to a ticket — without reading the entire codebase. For marketing, this layer stores campaign playbooks, brand guidelines, and performance benchmarks. The same infrastructure serves both departments; only the content differs.

**Layer 2 — Task history (Supabase PostgreSQL)**: Every completed task stores its inputs, outputs, file paths touched, and validation results, indexed per project. This is institutional memory. The agent can query "how was similar work done before?" to avoid re-solving solved problems and to reuse patterns that have already been validated. For marketing, this is past campaign optimizations and their ROAS outcomes — the agent learns which levers actually moved performance.

**Deferred — Layer 3 (Tree-sitter AST structural index)**: A structural index of the codebase built from AST parsing. This improves triage precision for large codebases where semantic search alone misses structural relationships (e.g., "which functions call this interface?"). Add Layer 3 when triage quality degrades in ways that Layer 1 can't address.

**Deferred — Layer 4 (Living documentation)**: ADRs, API specs, and architectural decision records kept in sync with the codebase. Add Layer 4 when architectural compliance issues emerge — agents making changes that violate documented decisions. Both deferred layers run in pgvector once added. No new infrastructure is needed; only new ingestion pipelines.

The 2-layer approach is the right V1 target. It covers the core use cases, runs entirely in existing Supabase infrastructure, and leaves a clear upgrade path.

---

### 7.6 Concurrent Task Conflicts

> **MVP Scope**: Concurrent task conflicts are resolved at PR review time via Git's standard merge conflict detection. MVP enforces per-project concurrency limits (2–3 concurrent tasks) via Inngest to prevent resource exhaustion. Custom conflict-resolution infrastructure is not needed because Fly.io machine isolation is the architectural foundation.

Each engineering task runs on an **isolated Fly.io machine** with its own git clone, filesystem, and branch. Two tasks can never conflict at the filesystem level — they don't share one.

**How concurrent PRs work**: When two tasks modify overlapping files, both tasks complete independently and both create separate PRs against `main`. GitHub detects merge conflicts at PR review time, which is exactly what Git is designed for. The review agent handles rebasing and conflict resolution as part of its normal workflow — this is standard engineering practice, not an exceptional case requiring platform-level infrastructure.

**What concurrency controls remain**: Per-project concurrency limits (2–3 concurrent tasks) are enforced via Inngest's built-in concurrency controls. This prevents resource exhaustion — too many simultaneous Fly.io machines — without any need for file-level tracking.

**Cross-department generalization**: For future non-engineering departments (marketing, finance), API-level conflicts (e.g., two agents modifying the same ad account simultaneously) are handled by Inngest's per-function concurrency limits on a per-account basis, not custom locking infrastructure.

The original design specified custom conflict detection at the orchestrator level and sequential PR ordering. That infrastructure was removed because it adds complexity to solve a problem that Git already handles naturally at PR review time. Fly.io machine isolation is the right architectural foundation — conflict resolution at PR time is the right workflow boundary.

---

## 8. Engineering Department — System Context

> **MVP Scope**: The Event Gateway is a thin webhook receiver (~200 lines of Fastify code), not a full application. It does exactly 4 things: (1) verify webhook signatures (Jira HMAC, GitHub X-Hub-Signature-256), (2) normalize payloads to the universal task schema, (3) write `Received` status to Supabase `tasks` table, and (4) send the event to Inngest. It does NOT do routing, business logic, orchestration, or retry management — Inngest handles all of that. Three reasons it's kept rather than pointing webhooks directly at Inngest:
>
> 1. **Task receipt tracking** (primary reason): Writing `Received` status to Supabase before enqueueing creates an idempotency record. If Inngest loses the event or the worker crashes, you know the event arrived and can reconcile. Without the Gateway, the first record of a webhook would be Inngest's internal state — which is ephemeral.
> 2. **Vendor-independent webhook URLs**: External services (Jira, GitHub) are configured to send webhooks to your Gateway URL, not to Inngest's URL. Changing orchestration providers in the future doesn't require reconfiguring every external integration.
 > 3. **Signature verification**: While this CAN be done in Inngest function code, centralizing it in the Gateway simplifies the function code and avoids signing secrets being passed to Inngest's infrastructure.
> 4. **Inngest failure recovery** (SPOF mitigation): The Event Gateway writes the full normalized webhook payload to `tasks.raw_event` (JSONB) before sending to Inngest. If Inngest loses the event or has an outage, the full payload is recoverable from Supabase. A CLI script (`dispatch-task.ts`) can re-read tasks in `Received` state and re-send events to Inngest for manual recovery — no data is lost.
> 5. **Dual-purpose Inngest function hosting**: The Event Gateway Fastify application serves dual duty: it is simultaneously (1) the webhook receiver for all external integrations (Jira, GitHub, Slack) and (2) the Inngest function host — all engineering lifecycle functions execute as steps within this Fastify app's process. Inngest Cloud orchestrates their execution via HTTP requests to the app's `/api/inngest` endpoint. This is the standard Inngest hosting model: you provide the compute (Fly.io), Inngest provides the durable orchestration layer.

**Event Idempotency**: The Event Gateway sets the Inngest event `id` field to the webhook delivery ID to prevent duplicate task creation. Jira provides a `webhookEvent` ID in the payload; GitHub provides the `X-GitHub-Delivery` header. If a webhook provider retries delivery (e.g., due to a slow Gateway response), Inngest deduplicates by event ID and discards the duplicate.

**Inngest Send Retry**: The Event Gateway retries `inngest.send()` 3 times with exponential backoff (1s, 2s, 4s delay between attempts) before giving up. This is a design decision, not current implementation — it's documented here so it's built this way from the start. If all 3 retries fail (e.g., Inngest is temporarily unavailable), the task stays in `Received` state with the full payload preserved in `tasks.raw_event` (the existing SPOF mitigation from point 4 above). The `dispatch-task.ts` CLI script handles manual recovery for persistent failures. Escalation: if you observe >5 tasks/week stuck in `Received` due to Inngest failures, add an Inngest cron function that polls for stale `Received` tasks and re-sends them automatically (~20 lines).

**Reverse-Path SPOF Mitigation (Machine → Inngest)**: The forward path (Jira → Gateway → Supabase → Inngest) is protected by the Supabase-first write described above. The REVERSE-PATH SPOF is the critical gap: the Fly.io machine sends `engineering/task.completed` to Inngest AFTER doing its work. If this event send fails (network blip, Inngest outage), the lifecycle function times out and marks the task `Failed` even though the PR was created. Mitigation:

1. The machine writes its final status (+ PR URL if applicable) to `tasks.status = 'Submitting'` in Supabase **BEFORE sending the Inngest event** — this is the Supabase-first pattern applied to the completion path
2. The machine retries the Inngest event send 3 times with backoff before exiting
3. The watchdog cron (Layer 3 in §10) detects tasks stuck in `Submitting` state with no corresponding lifecycle function completion, and emits the completion event on the machine's behalf

This ensures that a successful PR creation is never silently lost: the `Submitting` state in Supabase is durable proof that the machine completed, regardless of whether the Inngest event was delivered.

**Slack Interactions Endpoint**: The Event Gateway hosts a `/slack/interactions` endpoint that receives Slack interactive message payloads (approve/reject button clicks from Slack approval messages). It extracts the action (`approved` or `rejected`) and task metadata, then sends an Inngest event (`engineering/approval.received`) which resumes the review lifecycle function's `step.waitForEvent("engineering/approval.received", { timeout: "7d" })`. This closes the human approval loop: Slack button → Gateway → Inngest event → lifecycle function resumes.

The diagram below shows how the engineering department's components connect. External systems push events in; the shared platform queues and routes them; the OpenCode agent pool does the work; Fly.io and Supabase are the two primary infrastructure dependencies.

```mermaid
graph LR
    subgraph External Systems
        JIRA(["Jira Cloud"]):::external
        GH(["GitHub"]):::external
        SLACK(["Slack"]):::external
        FLY(["Fly.io"]):::external
    end

    subgraph Shared Platform
        INGEST["Event Gateway\n(Fastify)"]:::service
        INNGEST["Inngest\n(Workflows + Queue)"]:::service
        SUPABASE[("Supabase\n(PostgreSQL + pgvector)")]:::storage
        ORCH["Inngest Lifecycle\nFunctions"]:::service
    end

    subgraph OpenCode Agent Pool
        TRIAGE["Triage Agent\n(LLM call)"]:::service
        EXEC["Execution Agent\n(Fly.io machine)"]:::service
        REVIEW["Review Agent\n(Fly.io machine)"]:::service
    end

    JIRA -.->|"1. Jira webhook"| INGEST
    GH -.->|"2. GitHub webhook"| INGEST
    INGEST ==>|"3. Send task event"| INNGEST
    INNGEST ==>|"4. Trigger orchestrator"| ORCH
    ORCH -->|"5. Launch triage session"| TRIAGE
    ORCH -->|"6. Launch execution session"| EXEC
    ORCH -->|"7. Launch review session"| REVIEW
    TRIAGE -->|"8. Query KB and write context"| SUPABASE
    TRIAGE -->|"9. Post clarifying questions"| JIRA
    EXEC -->|"10. Provision machine"| FLY
    EXEC -->|"11. Create pull request"| GH
    REVIEW -->|"12. Merge pull request"| GH
    REVIEW -->|"13. Update ticket status"| JIRA
    ORCH -.->|"14. Send escalation or status"| SLACK

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
```

**Flow Walkthrough**

1. **Jira webhook** — Jira Cloud sends a webhook to the Event Gateway when a ticket is created, commented on, or its status changes, initiating the triage flow.
2. **GitHub webhook** — GitHub sends a webhook to the Event Gateway on PR creation, review submission, or CI status update, initiating the review flow.
3. **Send task event** — The Event Gateway normalizes the incoming webhook into the universal task schema and sends it to Inngest as a workflow trigger.
4. **Trigger orchestrator** — Inngest triggers the Inngest lifecycle function, which reads task state from Supabase and decides which agent phase to run.
5. **Launch triage session** — The Inngest lifecycle function invokes the Triage Agent as a stateless LLM call via OpenRouter, injecting the task context and Jira API access.
6. **Launch execution session** — The orchestrator dispatches the task to the Execution Agent once triage marks it `Ready`, triggering Fly.io machine provisioning.
7. **Launch review session** — The Inngest lifecycle function provisions a Fly.io machine and launches the Review Agent as an OpenCode session, injecting the PR diff and GitHub API access. *(Post-MVP: in MVP, the developer reviews PRs manually after the execution agent creates them.)*
8. **Query KB and write context** — The Triage Agent queries task history in Supabase (SQL) to build a structured context object, then writes the result back to Supabase.
9. **Post clarifying questions** — The Triage Agent uses the Jira REST API to post specific, actionable questions as comments tagged to the ticket reporter.
10. **Provision machine** — The Execution Agent calls `dispatch.sh` to launch a `performance-2x` Fly.io machine with the pre-built Docker image containing the repo and all tooling.
11. **Create pull request** — After all validation stages pass, the Execution Agent uses the GitHub CLI to create a pull request from the task branch.
12. **Merge pull request** — The Review Agent uses the GitHub REST API to approve and merge the PR when all checks pass and risk is below threshold.
13. **Update ticket status** — The Review Agent uses the Jira REST API to update the ticket status to Done and post a summary comment with the PR link.
14. **Send escalation or status** — The orchestrator sends async Slack notifications for human escalation requests, approval prompts, and task completion summaries (dashed = async).

A few things worth noting in this diagram:

**Jira and GitHub are both inputs and outputs.** Jira sends webhooks in (ticket created, comment added) and receives comments back from the triage agent (clarifying questions, status updates). GitHub sends webhooks in (PR events, CI status) and receives PRs and review comments from the execution and review agents.

**Slack is async-only.** The orchestrator sends Slack notifications for escalations, approvals, and status updates, but Slack never triggers a task directly. All task entry points go through the Event Gateway.

**Supabase is shared across all three agents.** The triage agent reads and writes task history and context. The execution agent reads task context written by triage. The review agent reads acceptance criteria and task metadata. One database, three consumers.

**The execution and review agents run on Fly.io; triage runs as a stateless LLM call.** The review agent runs as an OpenCode session on a Fly.io machine (same infrastructure as the execution agent), giving it filesystem access for merge conflict resolution via rebase. A unique engineering capability enabled by this design is merge conflict resolution: if the PR branch has diverged from `main`, the review agent can rebase directly rather than requiring a round trip back to the execution agent. The triage agent runs as a stateless LLM inference call via OpenRouter since it only needs to read tickets and post clarifying questions — it doesn't write code and doesn't need OpenCode's file editing, git, or LSP capabilities.

### Webhook Event Routing

The Event Gateway determines its action by matching the `webhookEvent` field in the Jira payload. Unknown event types are logged and ignored.

| Jira Event | MVP Action | Post-MVP Action |
|---|---|---|
| `jira:issue_created` | Create task record in Supabase (`Received` status), send `engineering/task.received` event to Inngest | Same + trigger triage agent enrichment of `triage_result` |
| `jira:issue_updated` | Ignore (per Section 4.2 — updates during execution are not processed) | Update `triage_result` if task is pre-execution state |
| `jira:issue_deleted` / status changed to Cancelled | Set task status to `Cancelled` in Supabase, send cancellation event to Inngest to halt in-flight lifecycle | Same |
| `jira:comment_created` | Ignore | Resume `AwaitingInput` tasks — send `engineering/clarification.received` event to Inngest |

### Error Handling Contract

The Event Gateway applies a layered validation chain: signature verification → Zod payload validation → Supabase write → Inngest send. Each layer has a defined failure response.

Payload validation uses Zod schemas applied after signature verification and before Supabase write. Required fields for Jira webhooks: `webhookEvent`, `issue.id`, `issue.key`, `issue.fields.summary`, `issue.fields.project.key`. Required fields for GitHub PR webhooks: `action`, `pull_request.number`, `repository.full_name`. Any missing required field returns 400 and logs the payload shape for debugging.

| Failure Mode | HTTP Response | Behavior |
|---|---|---|
| Webhook signature verification fails | `return 401` | Log attempt, don't create task record |
| Payload validation fails (Zod — missing required fields) | `return 400` | Log payload shape, don't create task record |
| Supabase write fails | `return 500` | Let Jira/GitHub retry the webhook delivery |
| Inngest send fails after 3 retries | `return 202` | Task is in Supabase with `raw_event`; manual recovery via `dispatch-task.ts` CLI |
| `tasks(external_id, source_system, tenant_id)` UNIQUE violation | `return 200` idempotent | Task already exists, treat as success |

The 202 response on Inngest failure (rather than 500) is intentional: it prevents Jira/GitHub from retrying the webhook, which would create a second `Received` task record. Recovery is via the `dispatch-task.ts` CLI, which reads `Received`-state tasks and re-sends them to Inngest.

---

## 9. Engineering Department — Phase Details

The engineering department's work splits across three agents: triage, execution, and review. Each agent has a distinct responsibility boundary. They don't call each other directly — they communicate through the task state stored in Supabase and the events emitted to Inngest.

### 9.1 Triage Agent

> **MVP Scope**: The triage agent is deferred for MVP. In MVP, the execution agent reads the raw Jira ticket directly from the `triage_result` column (populated by the Event Gateway with the raw webhook payload). The full triage agent described below will be built when ticket volume or ambiguity justifies it. See Section 28 for the deferral rationale.

The triage agent runs when a Jira ticket enters the queue. Its job is to decide whether a ticket is ready to execute — and if not, to ask the right questions before any code is written.

```mermaid
flowchart TD
    WEBHOOK(["Jira Webhook Received"]):::event
    PARSE["Parse Ticket Payload"]:::service
    ENRICH["Load Project Context\n(SQL + native search)"]:::service
    SUPABASE[("Supabase\n(task history)")]:::storage
     ANALYZE["Analyze Requirements\n(LLM call via OpenRouter)"]:::service
    CLEAR{"Requirements\nClear?"}:::decision
    QUESTIONS["Post Questions to Jira"]:::service
    READY["Mark Ticket Ready"]:::service
    QUEUE_EXEC(["Enqueue for Execution"]):::event

    WEBHOOK ==>|"1. Receive Jira webhook"| PARSE
    PARSE -->|"2. Structured payload"| ENRICH
    ENRICH -->|"3. Query task history"| SUPABASE
    SUPABASE -->|"4. Return relevant context"| ANALYZE
    ANALYZE -->|"5. Evaluate requirements"| CLEAR
    CLEAR -->|"6b. No"| QUESTIONS
    QUESTIONS -.->|"8. Await new webhook"| WEBHOOK
    CLEAR -->|"6a. Yes"| READY
    READY ==>|"7. Enqueue execution job"| QUEUE_EXEC

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
    classDef decision fill:#F8E71C,stroke:#C7B916,color:#333
```

**Flow Walkthrough**

1. **Receive Jira webhook** — The Event Gateway delivers a normalized Jira webhook event (new ticket or comment) to the Triage Agent's LLM call via OpenRouter to begin processing.
2. **Structured payload** — The Triage Agent parses the ticket title, description, and acceptance criteria into a structured requirements object for analysis.
3. **Query task history** — The Triage Agent queries the Supabase `tasks` table (SQL `WHERE` on project, labels, keywords) for similar past tickets. Uses OpenCode's native codebase search (file search, LSP, grep, AST tools) for code context — no vector similarity in V1.
4. **Return relevant context** — Supabase returns matching historical task records. OpenCode's search tools provide code context without reading the entire repo.
5. **Evaluate requirements** — The LLM call via OpenRouter analyzes the structured requirements against the retrieved context to determine whether the ticket is clear enough to execute.
6a. **Yes** — Requirements are unambiguous; the agent writes the structured task context to Supabase and marks the ticket `Ready` for execution.
6b. **No** — Requirements are ambiguous, contradictory, or incomplete; the agent generates specific questions to resolve the gaps.
6. **Send execution event** — The Triage Agent signals the Orchestrator that the task is `Ready`, and the Orchestrator sends an execution event to Inngest.
7. **Await new webhook** — The questions are posted as a Jira comment; the task moves to `AwaitingInput` and the triage loop waits for a new comment webhook to re-trigger (dashed = async loop-back).

**Triage Agent Responsibilities**:

1. **Requirement extraction** — Parse ticket title, description, and acceptance criteria into a structured requirements object
2. **Codebase mapping** — Use OpenCode's native search tools (file search, LSP, grep, AST) to identify which files, modules, and functions are likely affected
3. **Historical context** — Search task history for similar past tickets and their resolutions
4. **Ambiguity detection** — Flag vague, contradictory, or missing requirements; compare against past rework patterns
5. **Scope estimation** — Classify as small (<1h), medium (1-4h), or large (4+h). Large tickets flag for human decomposition
6. **Task history awareness** — Check if similar tasks are currently in-progress and flag potential overlap for the execution agent
7. **Question generation** — Generate specific, actionable questions and post as Jira comments tagged to the reporter

The triage agent runs as a stateless LLM inference call via OpenRouter with Jira API access (read ticket, post comment) and Supabase queries. It doesn't write any code — its only output is a structured task context object written to Supabase and a status update on the Jira ticket.

---

### 9.2 Execution Agent

The execution agent does the actual coding work. It's the most complex agent in the system and the one with the most infrastructure dependencies. Every execution task runs on a dedicated Fly.io machine — full filesystem isolation, its own Docker daemon, its own local Supabase instance.

```mermaid
flowchart TD
    PICKUP(["Ticket Ready Event"]):::event
    PROVISION["Provision Fly.io Machine\n(dispatch.sh)"]:::service
    BOOT["Boot: clone + install + setup\n(entrypoint.sh ~80s warm)"]:::service
    PLAN["Generate Implementation Plan\n(orchestrate.mjs wave 1)"]:::service
    CODE["Write Code Changes\n(OpenCode session)"]:::service
    TYPECHECK{"TypeScript\nPasses?"}:::decision
    LINT{"Lint\nPasses?"}:::decision
    UNIT{"Unit Tests\nPass?"}:::decision
    INTEG{"Integration\nTests Pass?"}:::decision
    E2E{"E2E Tests\nPass?"}:::decision
    FIX["Diagnose + Fix\n(re-enter at failing stage)"]:::service
    PR(["Submit Pull Request"]):::event
    FAIL["Escalate to Human\n(Slack)"]:::error

    PICKUP ==>|"1. Ticket ready event"| PROVISION
    PROVISION -->|"2. Machine provisioned"| BOOT
    BOOT -->|"3. Boot complete"| PLAN
    PLAN ==>|"4. Plan generated"| CODE
    CODE -->|"5. Code written"| TYPECHECK
    TYPECHECK -->|"6a. TS Fail"| FIX
    TYPECHECK -->|"6b. TS Pass"| LINT
    LINT -->|"7a. Lint Fail"| FIX
    LINT -->|"7b. Lint Pass"| UNIT
    UNIT -->|"8a. Unit Fail"| FIX
    UNIT -->|"8b. Unit Pass"| INTEG
    INTEG -->|"9a. Integration Fail"| FIX
    INTEG -->|"9b. Integration Pass"| E2E
    E2E -->|"10a. E2E Fail"| FIX
    FIX -->|"11. Re-enter at failing stage, run all subsequent"| TYPECHECK
    FIX -->|"12. Escalate (iterations exhausted)"| FAIL
    E2E -->|"10b. E2E Pass"| PR

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
    classDef decision fill:#F8E71C,stroke:#C7B916,color:#333
    classDef error fill:#E74C3C,stroke:#A93226,color:#fff
```

**Flow Walkthrough**

1. **Ticket ready event** — Inngest triggers the execution workflow to the Execution Agent after the Triage Agent marks the task `Ready` in Supabase.
2. **Machine provisioned** — The Execution Agent calls `dispatch.sh` to launch a `performance-2x` Fly.io machine with the pre-built Docker image containing all project tooling.
3. **Boot complete** — The Fly.io machine runs `entrypoint.sh`: writes auth tokens, shallow-clones the repo, installs dependencies from the volume-cached pnpm store, starts Docker daemon and local Supabase (~80s warm).
4. **Plan generated** — `orchestrate.mjs` wave 1 runs an OpenCode session to generate a structured implementation plan, identifying which files to change and in what order.
5. **Code written** — The OpenCode session writes all code changes across the identified files, then moves to the first validation gate.
6a. **TS Fail** — The TypeScript compiler reports errors; the Execution Agent sends the failing output to the Diagnose + Fix step.
6b. **TS Pass** — TypeScript compiles cleanly; the pipeline advances to the Lint check.
7a. **Lint Fail** — The linter reports violations; the Execution Agent sends the failing output to the Diagnose + Fix step.
7b. **Lint Pass** — Lint passes cleanly; the pipeline advances to Unit Tests.
8a. **Unit Fail** — Unit tests fail; the Execution Agent sends the failing test output to the Diagnose + Fix step.
8b. **Unit Pass** — Unit tests pass; the pipeline advances to Integration Tests.
9a. **Integration Fail** — Integration tests fail; the Execution Agent sends the failing test output to the Diagnose + Fix step.
9b. **Integration Pass** — Integration tests pass; the pipeline advances to E2E Tests.
10a. **E2E Fail** — End-to-end tests fail; the Execution Agent sends the failing test output to the Diagnose + Fix step.
10b. **E2E Pass** — All tests pass; the Execution Agent uses the GitHub CLI to submit a Pull Request from the task branch.
11. **Re-enter at failing stage** — The Diagnose + Fix step generates targeted fixes and re-enters the pipeline at the specific stage that failed, running all subsequent stages from that point forward.
12. **Escalate (iterations exhausted)** — When the per-stage iteration limit (3) or global cap (10 total) is reached, the agent posts the failing stage, full error output, and attempted diff to Slack and moves the task to `AwaitingInput`.

**Provisioning strategy**: `dispatch.sh` launches a `performance-2x` Fly.io machine (8GB RAM). Pre-built Docker images include the full repo, installed `node_modules`, and all tooling. The target warm boot is under 80 seconds, achieved through the `entrypoint.sh` boot lifecycle: write auth tokens, shallow clone the repo (`--depth=2`), checkout or create the branch, install dependencies against the volume-cached pnpm store, start the Docker daemon, start local Supabase, extract credentials, apply schema, configure OpenCode, then dispatch the task. Parallelized setup steps keep the total well under the target.

**Fix loop**: When a stage fails, the agent diagnoses the specific error, applies a fix, and re-runs the pipeline from the failing stage forward through all remaining stages. A TypeScript fix re-runs TypeScript → lint → unit → integration → E2E. A lint fix re-runs lint → unit → integration → E2E. This stage-forward approach catches cascading failures where fixing one stage breaks a later one. Maximum **3 fix iterations per individual stage**; maximum **10 fix iterations total** across all stages.

**Escalation**: After 3 failed fix iterations on any stage, the agent escalates to Slack with the failing stage name, the full error output, the diff attempted, and a request for human guidance. The task moves to `AwaitingInput` state and waits. The platform also enforces a global cap of **10 fix iterations** across all stages. If total fix iterations reach 10 before any individual stage hits 3, the task escalates immediately. This prevents the agent from cycling through many stages without converging.

**PR Deduplication on Re-dispatch**: When a machine is re-dispatched after timeout (see §10), the previous machine may have already created a PR before failing to send the completion event. The execution agent MUST check for an existing PR before creating a new one:

1. Before `gh pr create`, run: `gh pr list --head <task-branch> --json number --jq '.[0].number'`
2. If a PR exists: push new commits to the existing branch and update the PR body if needed — do NOT create a duplicate PR
3. If no PR exists: create a new PR as normal

This pattern is already implemented in the nexus-stack `entrypoint.sh` (verified). It prevents duplicate PRs from appearing in GitHub when a task requires multiple machine dispatches to complete.

**Execution Environment**:

- Isolated PostgreSQL + Supabase local instance (Docker-in-Docker)
- Mock external services via MSW configured from project test fixtures
- Playwright browsers for E2E testing
- Direct API testing via `supertest`

**Nexus-Stack Foundation**: The engineering execution agent builds directly on the proven fly-worker pattern from the nexus-stack repository (`/Users/victordozal/repos/victordozal/nexus-stack-root/nexus-stack/`):

- `tools/fly-worker/dispatch.sh` — Machine dispatch, volume pooling, dispatch registry
- `tools/fly-worker/orchestrate.mjs` — SDK-based wave execution, SSE session monitoring, completion detection
- `tools/fly-worker/entrypoint.sh` — 13-step boot lifecycle (clone, install, services, OpenCode serve, task execution)

The AI Employee Platform generalizes this pattern: Inngest lifecycle functions replace the local `dispatch.sh` command, but the on-machine execution flow (`entrypoint.sh` → OpenCode serve → SDK orchestrator → session → completion event) remains the same.

**Task Context Injection**: The Inngest lifecycle function passes task context to the Fly.io machine via environment variables at machine creation time. The `fly machine run` call injects:
- `TASK_ID` — UUID of the task record in Supabase
- `REPO_URL` — The project's GitHub repository URL (from the PROJECT record)
- `REPO_BRANCH` — The base branch to clone from (default: `main`)
- Credentials (injected from Fly.io Secrets): `GITHUB_TOKEN`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENROUTER_API_KEY`

At boot, `entrypoint.sh` reads `TASK_ID` from the environment and queries Supabase for the full task record: `SELECT * FROM tasks WHERE id = $TASK_ID`. This includes the `triage_result` JSONB column (the ticket's context object), which is passed to the OpenCode session as its initial prompt. The machine never needs to contact the Inngest server — all task context comes from Supabase. This is the same pattern used in the nexus-stack `dispatch.sh`, where `REPO_URL`, `REPO_BRANCH`, and `PLAN_NAME` are injected at dispatch time.

---

### 9.3 Review Agent

> **MVP Scope**: The review agent is deferred for MVP. In MVP, the execution agent creates PRs which are reviewed manually by the developer. The full review agent described below will be built when execution agent output quality is proven and manual review becomes a bottleneck. See Section 28 for the deferral rationale.

The review agent evaluates PRs submitted by the execution agent for correctness, code quality, and risk. It runs as an OpenCode session on an ephemeral Fly.io machine — the same infrastructure as the execution agent — giving it filesystem access to clone the repository, run tests locally, perform git operations, and call external APIs via the GitHub CLI and Jira CLI.

```mermaid
flowchart TD
    TRIGGER(["PR Created Event\n(GitHub webhook)"]):::event
    INNGEST["Inngest Lifecycle Function\nreceives event"]:::service
    PROVISION["Provision Fly.io Machine\n(same base image as execution)"]:::service
    BOOT["Machine boots,\nclones repo, checks out PR branch"]:::service
    REVIEW["OpenCode Session\nReview-focused mode"]:::service
    CI_WAIT["Wait for CI\nstep.waitForEvent\n(check_suite.completed, 30m)"]:::service
    CONFLICT{"Merge\nConflict?"}:::decision
    REBASE["Rebase PR branch\nonto main (git rebase)"]:::service
    RISK["Compute Risk Score\n(0-100)"]:::service
    GATE{"Risk\n≤ threshold?"}:::decision
    AUTOMERGE["Auto-merge\ngh pr merge --squash"]:::service
    ESCALATE["Post Slack approval\nstep.waitForEvent\n(approval.received, 7d)"]:::service
    JIRA_UPDATE["Update Jira status\nPost completion comment"]:::service
    DONE(["Task → Done"]):::event

    TRIGGER --> INNGEST
    INNGEST ==> PROVISION
    PROVISION ==> BOOT
    BOOT ==> REVIEW
    REVIEW --> CI_WAIT
    CI_WAIT --> CONFLICT
    CONFLICT -->|"Yes"| REBASE
    REBASE --> RISK
    CONFLICT -->|"No"| RISK
    RISK --> GATE
    GATE -->|"Low risk"| AUTOMERGE
    GATE -->|"High risk"| ESCALATE
    AUTOMERGE --> JIRA_UPDATE
    ESCALATE -->|"Approved"| AUTOMERGE
    ESCALATE -->|"Rejected"| JIRA_UPDATE
    JIRA_UPDATE --> DONE

    classDef event fill:#F5A623,stroke:#C4841A,color:#fff
    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef decision fill:#F8E71C,stroke:#C7B916,color:#333
```

**Review Agent Responsibilities**

1. **Acceptance criteria validation** — Cross-references PR diff against the original Jira ticket requirements (via Jira CLI or REST API) and verifies each acceptance criterion is addressed.
2. **Code quality review** — Examines the PR diff for common issues: unused imports, missing error handling, security anti-patterns, and style violations. Uses full codebase context (not just the diff) to understand impact.
3. **CI wait** — Waits for GitHub Actions CI to complete via `step.waitForEvent("github/check_suite.completed", { timeout: "30m" })`. Does not trigger CI — it waits for the automatic run triggered by PR creation.
4. **Merge conflict resolution** — If the PR branch has diverged from `main`, the review agent rebases directly (has filesystem access: `git fetch origin main && git rebase origin/main`). Updates the PR branch and continues.
5. **Local test verification** — For high-risk changes, can run the test suite locally on the machine to independently verify CI results.
6. **Risk scoring** — Computes a 0–100 risk score based on: number of files changed, whether critical paths are affected (auth, billing, data migration), presence of new dependencies, and test coverage delta. See Section 7.4 for the full risk model.
7. **Delivery decision** — Low-risk PRs (`risk_score < threshold`) are auto-merged via `gh pr merge --squash`. High-risk PRs post an approval request to the Slack operations channel via `step.waitForEvent("engineering/approval.received", { timeout: "7d" })`.
8. **Jira completion** — Updates the linked Jira ticket status to "Done" and posts a completion comment with PR link, risk score, and brief summary.

**Why Fly.io (not a stateless LLM call)**

The review agent was originally designed as a stateless LLM call for cost efficiency (~$0.10–$0.40/review). The decision to run it on a Fly.io machine (~$0.60–$2.40/review including compute) enables three capabilities that the stateless model cannot provide:

- **Merge conflict resolution**: Rebasing requires filesystem access — a stateless call has no git context.
- **Local test execution**: Running the full test suite locally provides independent verification of CI results and catches environment-specific failures.
- **Full codebase context**: Code review with access to the entire codebase (not just the PR diff) produces substantially higher-quality analysis, especially for refactors that span many files.

The cost increase (~$0.50–$2.00 additional per task) is justified by the quality improvement and the elimination of the "review agent requests rebase → re-dispatch to execution agent" round trip.

---

### 9.4 Branch Naming Convention

All branches created by the AI Employee Platform follow the format:

```
ai/<jira-ticket-id>-<kebab-summary>
```

**Examples**:

- `ai/PROJ-123-fix-login-bug`
- `ai/ENG-456-add-payment-retry-logic`
- `ai/CORE-789-migrate-user-table-schema`

**Lifecycle**:

1. **Created at dispatch** — The execution agent's entrypoint script creates the branch from `main`, using the task's `external_id` (Jira ticket ID) and a kebab-cased version of the ticket title.
2. **Committed to during execution** — All agent commits go to this branch.
3. **PR created against `main`** — The execution agent creates the PR from this branch to `main` at the end of execution.
4. **Deleted after merge** — The branch is deleted automatically after the PR is merged (configured via GitHub repository settings or the merge command).

This adapts the nexus-stack pattern (`worker/<plan-name>` for plan-mode, `worker/<kebab-task>-<timestamp>` for prompt-mode) with Jira ticket IDs for full traceability between branch, PR, and source ticket.

---

## 10. Engineering Department — Orchestration and Scaling

The diagram below shows how events flow from external webhooks through Inngest into the lifecycle functions, and how the orchestrator dispatches work to the three worker types. The orchestrator is the only component that reads task state and makes scheduling decisions.

```mermaid
graph LR
    subgraph Event Ingestion
        WH1(["Jira Webhooks"]):::event
        WH2(["GitHub Webhooks"]):::event
        ROUTER["Event Router\n(Fastify)"]:::service
    end

    subgraph Inngest Queues
        Q_TRIAGE[("Triage Queue")]:::storage
        Q_EXEC[("Execution Queue")]:::storage
        Q_REVIEW[("Review Queue")]:::storage
    end

    subgraph Inngest Lifecycle Functions
        SM["Task State Machine"]:::service
        SCHED["Concurrency Scheduler"]:::service
        SUPABASE[("Supabase\n(State Store)")]:::storage
    end

    subgraph Worker Pool
        T1["Triage Worker\n(LLM call)"]:::service
        E1["Exec Worker\n(OpenCode + Fly.io)"]:::service
        R1["Review Worker\n(OpenCode + Fly.io)\n[post-MVP]"]:::service
    end

    WH1 -->|"1. Jira webhook events"| ROUTER
    WH2 -->|"2. GitHub webhook events"| ROUTER
    ROUTER -->|"3. Route to triage queue"| Q_TRIAGE
    ROUTER -->|"4. Route to review queue"| Q_REVIEW
    Q_TRIAGE -->|"5. Dispatch triage job"| T1
    Q_EXEC -->|"6. Dispatch execution job"| E1
    Q_REVIEW -->|"7. Dispatch review job"| R1
    T1 -->|"8. Update task state"| SM
    E1 -->|"9. Update task state"| SM
    R1 -->|"10. Update task state"| SM
    SM -->|"11. Check concurrency budget"| SCHED
    SCHED -->|"12. Enqueue when slot available"| Q_EXEC
    SM -->|"13. Persist state"| SUPABASE

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
```

**Flow Walkthrough**

1. **Jira webhook events** — Jira Cloud sends webhook events (ticket created, comment added, status changed) to the Event Router, which is the Fastify-based Event Gateway.
2. **GitHub webhook events** — GitHub sends webhook events (PR created, CI status, review submitted) to the Event Router for processing.
3. **Route to triage queue** — The Event Router identifies new-ticket and comment events and places them onto the Triage Queue in Inngest with the normalized task payload.
4. **Route to review queue** — The Event Router identifies PR events and places them onto the Review Queue in Inngest for the Review Worker to process.
5. **Dispatch triage job** — Inngest's Triage Queue delivers the job to an available Triage Worker (a stateless LLM call via OpenRouter for codebase analysis and question generation).
6. **Dispatch execution job** — Inngest's Execution Queue delivers the job to an available Execution Worker (an OpenCode + Fly.io session) when a slot is available. The Inngest lifecycle function calls the Fly.io Machines API with `TASK_ID`, `REPO_URL`, and `REPO_BRANCH` as environment variables (see Section 9.2 for the full injection spec).
7. **Dispatch review job** — Inngest's Review Queue delivers the job to an available Review Worker (an OpenCode session on a Fly.io machine for PR validation and risk scoring).
8. **Update task state** — The Triage Worker reports its outcome (task context written, questions posted, or `Ready` status) to the Task State Machine.
9. **Update task state** — The Execution Worker reports its outcome (PR created, escalation needed, or fix iteration count) to the Task State Machine.
10. **Update task state** — The Review Worker reports its outcome (changes requested, auto-merged, or human review routed) to the Task State Machine.
11. **Check concurrency budget** — The Task State Machine sends `Ready` tasks to the Concurrency Scheduler, which checks per-project concurrency limits before allowing dispatch.
12. **Enqueue when slot available** — The Concurrency Scheduler places the task onto the Execution Queue once a concurrency slot opens within the project's configured limit.
13. **Persist state** — The Task State Machine writes every state transition to Supabase, which serves as the durable source of truth for task recovery after a crash.

### MVP Lifecycle Function

The pseudo-code below shows the actual Inngest function structure for the M1+M3 MVP lifecycle. Each phase (triage M2, review M4) adds `step.run()` blocks within this same function as its milestone is built — no structural changes needed.

```typescript
// Pattern C Hybrid: Single waitForEvent + Supabase heartbeats + watchdog reconciliation
// Total timeout budget: 6 hours across all re-dispatch attempts (max 3)
export const engineeringTaskLifecycle = inngest.createFunction(
  {
    id: "engineering/task-lifecycle",
    concurrency: { limit: 3, key: "event.data.projectId" },
  },
  { event: "engineering/task.received" },
  async ({ event, step }) => {
    const taskId = event.data.taskId;

    // Step 1: Update task status to Executing (optimistic locking — see §13)
    await step.run("update-status-executing", async () => {
      const { data } = await supabase.from("tasks")
        .update({ status: "Executing" })
        .eq("id", taskId)
        .eq("status", "Ready")  // Optimistic lock: only update if still Ready
        .select("id")
        .single();
      if (!data) throw new Error(`Task ${taskId} status changed by concurrent writer`);
    });

    // Step 2: Dispatch Fly.io machine with task context via env vars
    const machine = await step.run("dispatch-fly-machine", async () => {
      return await flyApi.createMachine({
        config: {
          env: {
            TASK_ID: taskId,
            REPO_URL: event.data.repoUrl,
            REPO_BRANCH: event.data.repoBranch,
          },
          image: "registry.fly.io/ai-employee-workers:latest",
        },
      });
    });

    // Step 3: Wait for completion event — 4h10m timeout (4h machine + 10m buffer for clock offset)
    // Pattern C Hybrid: Machine sends heartbeats to Supabase every 60s (Layer 2 monitoring).
    // Machine writes final status + PR URL to Supabase BEFORE sending this event (SPOF mitigation).
    // Watchdog cron (Layer 3) detects dead machines and emits engineering/task.failed on their behalf.
    const result = await step.waitForEvent("wait-for-completion", {
      event: "engineering/task.completed",
      timeout: "4h10m",  // 4h machine timeout + 10m buffer to prevent timeout race condition
      if: `async.data.taskId == "${taskId}"`,
    });

    // Step 4: Handle completion, timeout, or failure
    await step.run("finalize", async () => {
      if (!result) {
        // Timeout: check Supabase for partial progress before giving up
        const { data: task } = await supabase.from("tasks")
          .select("dispatch_attempts, status")
          .eq("id", taskId)
          .single();

        const attempts = task?.dispatch_attempts ?? 0;

        if (attempts < 3) {
          // Partial progress may exist — auto re-dispatch
          await supabase.from("tasks")
            .update({ dispatch_attempts: attempts + 1, status: "Ready" })
            .eq("id", taskId);
          // Emit re-dispatch event — handled by a separate Inngest function
          await inngest.send({
            name: "engineering/task.redispatch",
            data: { taskId, attempt: attempts + 1, reason: "timeout" },
          });
        } else {
          // Max attempts exhausted — escalate to Slack
          await supabase.from("tasks")
            .update({ status: "AwaitingInput", failure_reason: `Exhausted ${attempts} re-dispatch attempts` })
            .eq("id", taskId);
          await slackClient.postMessage(
            // [TODO: define Slack message format during implementation]
            `Task ${taskId} failed after ${attempts} attempts. Manual intervention required.`
          );
        }
      } else {
        // Success: read final status from Supabase (machine wrote it before sending event)
        const { data: task } = await supabase.from("tasks")
          .select("status")
          .eq("id", taskId)
          .single();
        // Status already written by machine — just confirm
        if (task?.status !== "Done") {
          await supabase.from("tasks")
            .update({ status: result.data.status ?? "Done" })
            .eq("id", taskId);
        }
      }
    });
  }
);

// Re-dispatch handler: spawns a new machine to continue from the existing branch
export const engineeringTaskRedispatch = inngest.createFunction(
  { id: "engineering/task-redispatch" },
  { event: "engineering/task.redispatch" },
  async ({ event, step }) => {
    const { taskId, attempt } = event.data;
    // Total 6-hour budget check: if cumulative time exceeds 6h, escalate instead
    // [TODO: implement elapsed time check using task.created_at during implementation]
    await step.run("redispatch-machine", async () => {
      return await flyApi.createMachine({
        config: {
          env: {
            TASK_ID: taskId,
            REPO_URL: event.data.repoUrl,
            REPO_BRANCH: event.data.repoBranch,
            // Machine fetches existing branch — continues from last commit
          },
          image: "registry.fly.io/ai-employee-workers:latest",
        },
      });
    });
    // Trigger a new lifecycle function instance for this attempt
    await step.sendEvent("restart-lifecycle", {
      name: "engineering/task.received",
      data: { taskId, attempt, repoUrl: event.data.repoUrl, repoBranch: event.data.repoBranch },
    });
  }
);
```

### 10.1 Machine Health Monitoring (3-Layer Approach)

The platform uses three complementary layers to detect machine failures, ranging from normal completion through crash detection to edge-case recovery:

**Layer 1 — Completion Event + Timeout (primary)**
The Fly.io machine sends an Inngest event (`engineering/task.completed`) when it finishes work — but only AFTER writing its final status and PR URL to Supabase (Supabase-first completion write, see §8). The Inngest lifecycle function waits via `step.waitForEvent("engineering/task.completed", { timeout: "4h10m" })` — 4 hours for the machine plus a 10-minute buffer to prevent the timeout race condition (see §18). If the event arrives, the task advances. If the 4h10m timeout fires, the lifecycle function checks `dispatch_attempts` in Supabase: if < 3, it auto-re-dispatches a new machine to continue from the existing branch; if ≥ 3, it escalates to Slack.

**Layer 2 — Progress Heartbeats to Supabase (visibility)**
The Fly.io machine writes periodic status updates to the `executions` table (current phase, last activity timestamp, progress percentage). This provides visibility into machine health without requiring Inngest event overhead. The platform dashboard and alerting queries read this column for in-flight task status.

**Layer 3 — Watchdog Cron (edge-case recovery)**
An Inngest cron function runs every 10 minutes and queries Supabase for tasks in `Executing` state with no heartbeat update in the last 10 minutes. For each stale task, the watchdog checks if the Fly.io machine is still alive via the Fly.io Machines API. If the machine is dead, the watchdog emits `engineering/task.failed` with `reason: 'machine_dead'` — the lifecycle function's `step.waitForEvent` picks this up and triggers the re-dispatch flow. This catches the reverse-path SPOF: a machine that completed work but failed to send the Inngest event will have written `Submitting` status to Supabase; the watchdog detects this and emits the completion event on the machine's behalf.

### 10.2 Scaling Strategy

**Concurrency model**: Each Jira project gets a configurable concurrency limit (default: 3 concurrent executions). The scheduler enforces this via Inngest per-queue concurrency controls. This prevents resource exhaustion and reduces merge conflicts between parallel tasks working in the same codebase.

**Worker scaling** (solo developer starting point):

- Triage workers: 1-2 (lightweight, API calls + LLM inference). Scale when triage queue depth exceeds 10 jobs.
- Execution workers: 1-2 (heavyweight, Fly.io machines). Scale conservatively — each machine costs roughly $0.50-$2.00 per task.
- Review workers: 1 (medium-weight). Scale when the PR queue backs up.

**Multi-project isolation**: Each project gets its own Inngest queue namespace, Supabase knowledge base partition, and concurrency budget. A high-volume project cannot starve others.

**The orchestrator is the collection of Inngest step functions** that manage the full task lifecycle — from webhook receipt through triage, execution, and review to final delivery. It is not a separate service. The orchestrator IS the Inngest functions. Each department has a lifecycle function (e.g., `engineering/task-lifecycle`) that coordinates phases through Inngest steps: `step.run()` for synchronous work, `step.waitForEvent()` for human approvals and agent completions, and Inngest's concurrency controls for per-project limits. This is a direct evolution of the nexus-stack `orchestrate.mjs` pattern, reimplemented as durable Inngest workflows rather than a standalone process.

> **Previously Known Issue (Now Fixed) — `step.waitForEvent()` Race Condition (relevant for M4)**: Inngest issue #1433 was **fixed in Inngest v1.17.2 (released March 2, 2026)**. The race condition where events sent before `step.waitForEvent()` starts listening were silently missed is resolved. The Supabase-first-check mitigation below is retained as defense-in-depth but is no longer required to work around a bug. This affects the review agent's Slack approval flow (M4): if a human clicks "Approve" in Slack before the lifecycle function reaches `step.waitForEvent("engineering/approval.received")`, the approval event is lost and the function times out waiting. **Mitigation**: The `/slack/interactions` endpoint writes the approval action to Supabase first (a `manual_action` column on the task or deliverable record). Before calling `step.waitForEvent()`, the lifecycle function checks Supabase for an existing action. If found, skip the wait and proceed immediately. This applies to all `step.waitForEvent()` calls with human interactions: CI wait, escalation approval, and clarification receipt. This mitigation must be implemented when building the review agent in M4 — it does not affect MVP.

---

## 11. Engineering Department — Full Lifecycle Sequence

The sequence below traces a single ticket from customer creation through to Slack notification. Every participant is a real system component. The diagram shows the handoffs between Inngest, the lifecycle functions, OpenCode agents, Fly.io machines, and Supabase at each stage of the lifecycle.

> **MVP Scope**: This sequence diagram shows the **full architecture flow** including the review agent (deferred for MVP). In MVP, the lifecycle ends at step 20 (PR created, task status updated to `Submitting`). The developer reviews PRs manually. Steps 21–29 (PR webhook, review agent, auto-merge, Jira update, Slack notification) are post-MVP. See the MVP Architecture diagram in Section 2 for the simplified MVP flow.

> **Note**: This sequence diagram shows the **full architecture flow** including the triage agent (deferred for MVP) and pgvector queries (deferred for MVP). In MVP, steps 5–13 (triage agent loop) are replaced by the Inngest lifecycle function reading `triage_result` directly from Supabase and dispatching execution. See Section 9.1 for the MVP triage scope and the MVP Architecture diagram in Section 2 for the simplified flow.

```mermaid
sequenceDiagram
    actor Customer
    participant Jira
    participant Gateway as Event Gateway
    participant Inngest as Inngest Queue
    participant Orchestrator as Inngest Lifecycle Functions
    participant Supabase
    participant TriageAgent as Triage Agent
    participant ExecAgent as Execution Agent
    participant FlyMachine as Fly.io Machine
    participant GitHub
    participant ReviewAgent as Review Agent
    participant Slack

    Customer->>Jira: 1. Create ticket
    Jira->>Gateway: 2. Webhook fires
    Gateway->>Inngest: 3. Send triage event
    Gateway->>Supabase: 4. Record task (status: Received)
    Inngest->>Orchestrator: 5. Trigger triage job
    Orchestrator->>TriageAgent: 6. Invoke triage agent (LLM call)
     TriageAgent->>Supabase: 7. Query pgvector embeddings (post-MVP)
    TriageAgent->>Jira: 8. Post clarifying questions
    Customer->>Jira: 9. Answer questions
    Jira->>Gateway: 10. Comment webhook
    Gateway->>Inngest: 11. Re-send triage event
    Orchestrator->>TriageAgent: 12. Re-evaluate clarity
    TriageAgent->>Supabase: 13. Update task (status: Ready)
    Orchestrator->>Inngest: 14. Send execution event
    Inngest->>ExecAgent: 15. Trigger execution
    ExecAgent->>FlyMachine: 16. Provision via dispatch.sh
    FlyMachine->>FlyMachine: 17. Boot entrypoint.sh (~80s warm)
    FlyMachine->>FlyMachine: 18. OpenCode session: implement + test
    FlyMachine->>GitHub: 19. Create pull request
    FlyMachine->>Supabase: 20. Update task (status: Submitting)
    GitHub->>Gateway: 21. PR webhook
    Gateway->>Inngest: 22. Send review event
     Orchestrator->>ReviewAgent: 23. Invoke review agent (Fly.io machine)
    ReviewAgent->>Jira: 24. Validate acceptance criteria
    ReviewAgent->>GitHub: 25. Check CI status
    ReviewAgent->>Supabase: 26. Record risk score
    ReviewAgent->>GitHub: 27. Approve + merge PR
    ReviewAgent->>Supabase: 28. Update task (status: Done)
    ReviewAgent->>Slack: 29. Notify team
```

**Flow Walkthrough**

1. **Create ticket** — The customer creates a Jira ticket with title, description, and acceptance criteria describing the work to be done.
2. **Webhook fires** — Jira sends a webhook to the Event Gateway when the ticket is created, carrying the full ticket payload.
3. **Send triage event** — The Event Gateway normalizes the webhook into the universal task schema and sends a triage event to Inngest.
4. **Record task (status: Received)** — The Event Gateway writes the new task record to Supabase with status `Received`, establishing the durable source of truth before any agent work starts.
5. **Trigger triage job** — Inngest triggers the Inngest lifecycle function with the triage job, which picks it up and decides which agent to invoke.
6. **Invoke triage agent** — The Inngest lifecycle function invokes the Triage Agent as a stateless LLM call via OpenRouter, injecting the task context and Jira API access.
7. **Query pgvector embeddings** — The Triage Agent queries Supabase's pgvector extension to retrieve semantically similar code chunks and past task records relevant to this ticket.
8. **Post clarifying questions** — The Triage Agent determines requirements are ambiguous and posts specific, actionable questions as a Jira comment tagged to the ticket reporter.
9. **Answer questions** — The customer responds to the Triage Agent's comment in Jira, providing the missing information needed to proceed.
10. **Comment webhook** — Jira fires a comment-added webhook to the Event Gateway when the customer's answer is posted.
11. **Re-send triage event** — The Event Gateway sends a new triage event to Inngest so the Triage Agent can re-evaluate with the updated context.
12. **Re-evaluate clarity** — The Inngest lifecycle function invokes the Triage Agent again with the customer's answers included for re-analysis.
13. **Update task (status: Ready)** — The Triage Agent determines requirements are now clear, writes the structured task context to Supabase, and updates the task status to `Ready`.
14. **Send execution event** — The orchestrator sends an execution event to Inngest, passing through the Concurrency Scheduler before dispatch.
15. **Trigger execution** — Inngest triggers the Execution Agent, which begins the Fly.io provisioning process.
16. **Provision via dispatch.sh** — The Execution Agent calls `dispatch.sh` to launch a `performance-2x` Fly.io machine with the pre-built Docker image.
17. **Boot entrypoint.sh (~80s warm)** — The Fly.io machine runs the ten-step boot sequence: auth tokens, repo clone, branch checkout, dependency install, Docker daemon, local Supabase, credentials, schema, OpenCode config.
18. **OpenCode session: implement + test** — The Fly.io machine runs the full implementation pipeline: generate plan, write code, TypeScript check, lint, unit tests, integration tests, E2E tests, with fix loops at each stage.
19. **Create pull request** — After all validation stages pass, the Fly.io machine uses the GitHub CLI to create a pull request from the task branch.
20. **Update task (status: Submitting)** — The Fly.io machine writes the PR URL to Supabase and updates the task status to `Submitting`.
21. **PR webhook** — GitHub fires a pull-request-created webhook to the Event Gateway when the new PR is opened.
22. **Send review event** — The Event Gateway sends a review event to Inngest with the PR metadata.
23. **Invoke review agent** — The Inngest lifecycle function invokes the Review Agent as an OpenCode session on a Fly.io machine, injecting the PR diff, Jira ticket, and GitHub API access.
24. **Validate acceptance criteria** — The Review Agent uses the Jira REST API to fetch the original acceptance criteria and map each one to changes in the PR diff.
25. **Check CI status** — The Review Agent polls GitHub Actions via the GitHub REST API to confirm all CI checks are passing on the PR's head commit.
26. **Record risk score** — The Review Agent computes a 0-100 risk score based on files changed, critical paths, and new dependencies, and writes it to Supabase.
27. **Approve + merge PR** — The Review Agent uses the GitHub REST API to approve and merge the PR (auto-merge path; human approval Slack flow is the alternative).
28. **Update task (status: Done)** — The Review Agent writes the final task status `Done` to Supabase along with the deliverable reference (merged PR URL).
29. **Notify team** — The Review Agent sends a Slack message to the configured channel with the ticket link, PR link, and merge confirmation.

A few things worth noting in this sequence:

**Inngest is the handoff point between every phase.** The Event Gateway never calls the orchestrator directly — it sends an event and returns. The orchestrator receives triggers from Inngest, which means the gateway is never blocked waiting for agent work to complete. Each phase transition (triage complete, execution complete, review complete) goes back through Inngest rather than chaining function calls.

**Supabase is the source of truth throughout.** Every status change is written to Supabase before the next step proceeds. If the orchestrator crashes between phases, it can reconstruct task state from Supabase on restart and re-dispatch from the last known status.

**The triage loop can repeat.** If the customer's answers raise new questions, the triage agent re-evaluates and can post follow-up questions. The loop exits only when the agent marks the task `Ready`. The orchestrator doesn't advance to execution until that status is set.

**Fly.io machine boot is inside the execution phase.** The `~80s warm` boot is part of the execution agent's work, not a separate orchestration step. From the orchestrator's perspective, it dispatches an execution job and waits for a `Submitting` status update. What happens inside the Fly.io machine is the execution agent's concern.

---

## 12. Knowledge Base Architecture

> **MVP Scope**: The pgvector embedding pipeline (Layer 1 indexing) is deferred for MVP. Triage agents use OpenCode's built-in codebase search (file search, LSP, grep, AST tools) for code context, and direct SQL queries on the `tasks` table for institutional memory. The task history tables (Layer 2) are built for MVP. The full vector pipeline is documented below as the future enhancement path.

The knowledge base infrastructure is shared across all departments. Layer 1 is vector embeddings stored in pgvector (a Supabase extension) for semantic search. Layer 2 is task history — also in Supabase — for institutional memory. Both live in the same database, so there's no additional service to spin up or maintain. Layers 3 and 4 (structural AST index and living documentation) are architecturally planned but deferred until the 2-layer approach proves insufficient.

### Layer 1 — Vector Embeddings (pgvector)

> **Deferred for MVP.** The indexing pipeline below will be built when triage quality degrades in ways that OpenCode's native search can't address. See Section 28 for migration path.

Content flows from its source through chunking and embedding into pgvector.

**Content sources by department:**

- **Engineering**: Code chunks (~500 tokens each), docstrings, README sections
- **Marketing**: Campaign playbook entries, brand guideline sections, performance benchmark records

**Indexing process:**

1. On every merge to `main` (triggered via GitHub webhook), re-index changed files
2. Nightly full reindex for departments with external content (campaign data, market benchmarks)
3. Embeddings generated via OpenRouter (`text-embedding-3-small` or equivalent)
4. Stored in Supabase `knowledge_embeddings` table with: `department`, `project_id`, `source_type`, `content_chunk`, `embedding` (vector), `metadata` (jsonb), `tenant_id`

**Query interface:**

```sql
SELECT content_chunk
FROM knowledge_embeddings
WHERE department = $1
ORDER BY embedding <=> $2
LIMIT 10
```

### Layer 2 — Task History

Supabase tables already used for platform operation serve as institutional memory. No separate database needed.

- `tasks` table: all past tasks with status, requirements, affected files, scope estimate
- `deliverables` table: PR URLs, ad campaign IDs, journal entry references
- `reviews` table: review outcomes, comments, risk scores
- `feedback` table: human corrections (from Section 21)

The triage agent queries this history with: "find past tasks with similar requirements to this ticket" — combining vector similarity (Layer 1) with SQL filters on the task history (Layer 2).

### Layers 3-4 (Deferred)

> **Layer 3 — Structural Index** (Deferred): Tree-sitter AST parsing to build a dependency graph for the engineering codebase. Enables navigation from a feature area to exact files and functions. Add when triage quality needs improvement — specifically when triage agents frequently identify the wrong files.
>
> **Layer 4 — Living Documentation** (Deferred): Architecture decision records (ADRs), API specs, and style guides. Can be folded into Layer 1 (as text chunks for vector search) when needed. Add when architectural compliance issues emerge in review.

### Pipeline Diagram

> **Note**: This diagram reflects the future-state pipeline. MVP uses direct SQL queries on the `tasks` table and OpenCode's native codebase search tools.

```mermaid
graph LR
    subgraph Content Sources
        CODE(["Code + Docs\n(GitHub)"]):::external
        CAM(["Campaign Data\n(Meta/Google Ads)"]):::external
        TASK(["Task History\n(Platform DB)"]):::external
    end

    subgraph Indexing Pipeline
        CHUNK["Content Chunker"]:::service
        EMBED["Embedding Generator\n(OpenRouter)"]:::service
    end

    subgraph Supabase
        VEC[("pgvector\n(knowledge_embeddings)")]:::storage
        HIST[("Task History\n(tasks + reviews)")]:::storage
    end

    subgraph Query Interface
        AGENT["Agent Query"]:::service
        RANK["Context Ranker"]:::service
        RESULT(["Ranked Context"]):::service
    end

    CODE -->|"1. Code and docs"| CHUNK
    CAM -->|"2. Campaign data"| CHUNK
    CHUNK -->|"3. Chunked content"| EMBED
    EMBED -->|"4. Embeddings stored"| VEC
    TASK -->|"5. Task history indexed"| HIST
    AGENT -->|"6. Query submitted"| RANK
    RANK -->|"7. Vector similarity search"| VEC
    RANK -->|"8. Historical task lookup"| HIST
    RANK -->|"9. Return ranked context"| RESULT

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
```

**Flow Walkthrough**

1. **Code and docs** — GitHub code chunks (~500 tokens each), docstrings, and README sections from the engineering repository are sent to the Content Chunker for preprocessing.
2. **Campaign data** — Meta Ads and Google Ads campaign performance records, playbook entries, and brand guideline sections from the marketing department are sent to the Content Chunker.
3. **Chunked content** — The Content Chunker splits raw content into fixed-size overlapping chunks and passes them to the Embedding Generator via OpenRouter for vectorization.
4. **Embeddings stored** — The Embedding Generator calls OpenRouter (`text-embedding-3-small` or equivalent) and writes the resulting vectors to the pgvector `knowledge_embeddings` table in Supabase with department and project metadata.
5. **Task history indexed** — Completed task records (inputs, outputs, affected files, validation results) are written directly to Supabase's task history tables, bypassing chunking since they're already structured.
6. **Query submitted** — An agent (triage, execution, or review) submits a natural-language query to the Context Ranker with a task description to find relevant context.
7. **Vector similarity search** — The Context Ranker translates the query into an embedding and performs a pgvector cosine similarity search against the `knowledge_embeddings` table to find the most relevant content chunks.
8. **Historical task lookup** — The Context Ranker also runs a SQL query against the task history tables in Supabase to find past tasks with similar requirements, files touched, or resolution patterns.
9. **Return ranked context** — The Context Ranker merges vector search results with task history results, ranks them by relevance, and returns the top-N entries as the agent's context window input.

### Per-Department Content

| Layer | Engineering | Paid Marketing | Finance (future) | Sales (future) |
|---|---|---|---|---|
| Vector Embeddings (L1) | Code chunks, docstrings, README | Campaign playbooks, brand guides | Chart of accounts, expense policies | Sales playbook, email templates |
| Task History (L2) | Past tickets, PRs, resolutions | Past campaign optimizations, ROAS data | Past categorizations, reconciliations | Past deals, outreach sequences |
| Structural Index (L3, deferred) | Tree-sitter AST dependency graph | Campaign hierarchy structure | — | — |
| Living Docs (L4, deferred) | ADRs, API specs, style guides | Brand guidelines, platform policies | Tax rules, approval hierarchies | ICP definitions, pricing matrix |

### Migration Path

> **Scale consideration**: pgvector handles tens of millions of vectors efficiently. If vector query performance becomes a bottleneck (typically beyond 5M vectors with a sub-100ms p99 latency requirement), migrate to Qdrant — a dedicated vector database with HNSW indexing optimized for high-throughput similarity search. The migration requires re-embedding and reindexing, but no application logic changes if the query interface is abstracted behind a repository pattern.

---

## 13. Platform Data Model

```mermaid
erDiagram
    DEPARTMENT ||--o{ ARCHETYPE : defines
    DEPARTMENT ||--o{ PROJECT : manages
    ARCHETYPE ||--o{ TASK : processes
    ARCHETYPE ||--|| KNOWLEDGE_BASE : has
    ARCHETYPE ||--|| RISK_MODEL : uses
    TASK ||--o{ CLARIFICATION : requires
    TASK ||--|| EXECUTION : triggers
    EXECUTION ||--o{ VALIDATION_RUN : produces
    EXECUTION ||--|| DELIVERABLE : creates
    DELIVERABLE ||--o{ REVIEW : receives
    TASK ||--o{ CROSS_DEPT_TRIGGER : emits
    TASK ||--o{ FEEDBACK : generates
    TASK ||--o{ TASK_STATUS_LOG : tracks
    ARCHETYPE ||--o{ AGENT_VERSION : tracks
    PROJECT ||--o{ TASK : generates

    DEPARTMENT {
        uuid id PK
        string name
        string slack_channel
        uuid tenant_id
    }
    ARCHETYPE {
        uuid id PK
        uuid department_id FK
        string role_name
        string runtime
        json trigger_sources
        json tool_registry
        json risk_model
        int concurrency_limit
        uuid agent_version_id FK
        uuid tenant_id
    }
    TASK {
        uuid id PK
        uuid archetype_id FK
        uuid project_id FK
        string external_id
        string source_system
        string status
        json requirements
        int scope_estimate
        json affected_resources
        uuid tenant_id
        json raw_event "Full normalized webhook payload, stored before Inngest send for SPOF recovery"
        int dispatch_attempts
    }
    EXECUTION {
        uuid id PK
        uuid task_id FK
        string runtime_type
        string runtime_id "Fly.io machine ID for opencode tasks; Inngest run ID for inngest tasks"
        int fix_iterations
        string status
        uuid agent_version_id FK
        int prompt_tokens
        int completion_tokens
        string primary_model_id
        numeric estimated_cost_usd
    }
    DELIVERABLE {
        uuid id PK
        uuid execution_id FK
        string delivery_type
        string external_ref
        int risk_score
        string status
    }
    FEEDBACK {
        uuid id PK
        uuid task_id FK
        uuid agent_version_id FK
        string feedback_type
        json original_decision
        json corrected_decision
        string correction_reason
        string created_by
        timestamptz created_at
        uuid tenant_id
    }
    AGENT_VERSION {
        uuid id PK
        uuid archetype_id FK
        string prompt_hash
        string model_id
        string tool_config_hash
        string changelog_note
        timestamptz created_at
        boolean is_active
    }
    KNOWLEDGE_BASE {
        uuid id PK
        uuid archetype_id FK
        timestamptz last_indexed
        int chunk_count
        json source_config
        uuid tenant_id
    }
    RISK_MODEL {
        uuid id PK
        uuid archetype_id FK
        json factors
        int auto_approve_threshold
    }
    CROSS_DEPT_TRIGGER {
        uuid id PK
        uuid source_task_id FK
        string target_archetype_id
        string runtime_hint
        json payload
        string status
    }
    PROJECT {
        uuid id PK
        uuid department_id FK
        string name
        string repo_url
        string default_branch
        int concurrency_limit
        json tooling_config
        uuid tenant_id
    }
    VALIDATION_RUN {
        uuid id PK
        uuid execution_id FK
        string stage
        string status
        int iteration
        text error_output
        int duration_ms
        timestamptz created_at
    }
    REVIEW {
        uuid id PK
        uuid deliverable_id FK
        string reviewer_type
        uuid agent_version_id FK
        int risk_score
        string verdict
        text comments
        timestamptz created_at
    }
    CLARIFICATION {
        uuid id PK
        uuid task_id FK
        text question
        text answer
        string source_system
        string external_ref
        timestamptz asked_at
        timestamptz answered_at
    }
    TASK_STATUS_LOG {
        uuid id PK
        uuid task_id FK
        text from_status
        text to_status
        text actor "enum: gateway, lifecycle_fn, watchdog, manual"
        timestamptz created_at
    }
```

**Entity Relationships Explained**

The data model has three logical clusters:

**Department & Archetype cluster**: A `DEPARTMENT` defines one or more `ARCHETYPE` records (e.g., the engineering department defines an engineering archetype). Each archetype declares its own `KNOWLEDGE_BASE`, `RISK_MODEL`, and `AGENT_VERSION` — so every department has independent knowledge and risk configuration.

**Task execution cluster**: An `ARCHETYPE` processes many `TASK` records over time. Each task triggers exactly one `EXECUTION`, which records what actually happened (which Fly.io machine, how many fix iterations, which agent version ran). Executions produce `VALIDATION_RUN` records (one per test stage) and exactly one `DELIVERABLE` (a PR, a campaign draft, a journal entry). Deliverables receive `REVIEW` records from both AI and human reviewers.

The `tasks` table includes a `UNIQUE(external_id, source_system, tenant_id)` constraint to ensure webhook idempotency. If the Event Gateway receives a duplicate webhook, the Supabase write returns a unique violation and the Gateway returns 200 OK (idempotent — see §8 Error Handling Contract).

`dispatch_attempts` tracks how many times this task has been re-dispatched to a new Fly.io machine after timeout or failure. Hard cap: 3 attempts before Slack escalation.

#### triage_result Interface

The `triage_result` column on the `TASK` table is the interface contract between the Event Gateway and the execution agent. In MVP, the Event Gateway populates it with the raw Jira webhook payload. When the Triage Agent is built (see Section 28), it overwrites this column with enriched analysis. The execution agent **always reads from `triage_result`** — it never queries Jira directly for ticket data.

```sql
-- triage_result column on the tasks table
-- MVP: Populated by Event Gateway with raw Jira webhook data
-- Future: Populated by Triage Agent with enriched analysis
ALTER TABLE tasks ADD COLUMN triage_result JSONB;
```

**Schema contract:**

```json
{
  "// MVP fields (always present — populated by Event Gateway from webhook)": "",
  "ticket_id": "string — external Jira ticket ID (e.g., PROJ-123)",
  "title": "string — ticket title",
  "description": "string — ticket body/description",
  "labels": ["string"],
  "priority": "string — Jira priority level (Highest/High/Medium/Low/Lowest)",
  "raw_ticket": "object — full Jira webhook payload (preserved for debugging)",

  "// Future fields (populated by Triage Agent when built)": "",
  "scope_estimate": "small | medium | large | decompose",
  "complexity_notes": "string — agent's analysis of complexity",
  "suggested_approach": "string — recommended implementation strategy",
  "relevant_files": ["string — files likely affected"],
  "relevant_past_tasks": ["uuid — similar past tasks from SQL query"],
  "is_clear": "boolean — whether ticket is unambiguous",
  "clarifying_questions": ["string — questions to post on Jira if not clear"]
}
```

Adding the Triage Agent later is zero-cost: it writes to `triage_result`, the execution agent reads from it, and no other code changes.

#### Optimistic Locking Pattern

All status transitions MUST use optimistic locking to prevent concurrent writer conflicts. Pattern:

```sql
UPDATE tasks
SET status = $new_status
WHERE id = $task_id AND status = $expected_status
RETURNING id;
```

If no row is returned, another writer changed the status concurrently — the caller must handle this as a conflict (log and skip, or escalate). This applies to all status transitions: `Received → Executing`, `Executing → Submitting`, `Submitting → Done`, and cancellation paths.

**Feedback & observability cluster**: Every task can generate `FEEDBACK` records (when a human overrides an AI decision). Tasks can also emit `CROSS_DEPT_TRIGGER` records that fire work in another department. Every entity carries a `tenant_id` column for future multi-tenant isolation.

`tenant_id` appears on every entity that will need multi-tenant isolation when the platform goes SaaS. V1 has only one tenant, so application logic doesn't enforce it yet. The schema supports it from day one. Supabase Row-Level Security policies can be added at any time to enforce per-tenant isolation without touching the schema or application code.

---

## 14. Platform Shared Infrastructure

```mermaid
graph LR
    subgraph Compute Layer
        FLY["Fly.io Machines\n(Engineering)"]:::service
        GATEWAY["Event Gateway\n(Fastify/TS)"]:::service
    end

    subgraph Data Layer
        SUPABASE[("Supabase\n(PostgreSQL + pgvector)")]:::storage
        INNGEST["Inngest\n(Workflows + Queue)"]:::service
        S3[("Object Storage\n(Fly.io Volumes)")]:::storage
    end

    subgraph Observability
        INNGEST_DASH["Inngest Dashboard\n(Execution Traces)"]:::service
        SUPABASE_LOGS["Supabase Logs\n(Queries + Activity)"]:::service
        LOGS["Structured Logging"]:::service
    end

    subgraph Security
        FLYSECRTS["Fly.io Secrets\n(API Keys + OAuth)"]:::service
        SUPAUTH["Supabase Auth\n(future SaaS)"]:::service
        AUDIT[("Audit Log\n(Supabase)")]:::storage
    end

    FLY -->|"1. Read/write task state"| SUPABASE
    GATEWAY ==>|"2. Send task events"| INNGEST
    FLY -->|"3. Persist volume cache"| S3
    GATEWAY -->|"4. Log event traces"| INNGEST_DASH
    FLY -->|"5. Send execution traces"| INNGEST_DASH
    FLYSECRTS -->|"6. Inject credentials"| FLY
    FLYSECRTS -->|"7. Inject API keys"| GATEWAY

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
```

**Flow Walkthrough**

1. **Read/write task state** — Fly.io Machines (engineering execution workers) read task context from Supabase at boot and write execution results, fix iteration counts, and status updates throughout the task lifecycle.
2. **Send task events** — The Event Gateway sends all normalized webhook events to Inngest as workflow triggers, using Inngest's durable event queue as the handoff layer.
3. **Persist volume cache** — Fly.io Machines write the pnpm store and Docker layer cache to Fly.io Volumes (Object Storage) so subsequent warm boots don't re-download gigabytes of dependencies.
4. **Log event traces** — The Event Gateway sends structured trace data to the Inngest Dashboard for each webhook received and event sent, enabling end-to-end tracing from ingest to delivery.
5. **Send execution traces** — Fly.io Machines send OpenCode session traces to the Inngest Dashboard, capturing every LLM call, tool invocation, and state transition during engineering task execution.
6. **Inject credentials** — Fly.io Secrets inject GitHub tokens, Jira tokens, and Supabase credentials into Fly.io Machine environment variables at machine start, never storing secrets in code or images.
7. **Inject API keys** — Fly.io Secrets inject the OpenRouter API key, webhook validation tokens, and Inngest API key into the Event Gateway's environment at deploy time.

#### Structured Logging Schema

All platform components (Event Gateway, Inngest lifecycle functions, Fly.io machines, watchdog cron) MUST emit structured logs using this schema:

```json
{
  "timestamp": "ISO 8601 (e.g., 2026-03-25T06:00:00.000Z)",
  "level": "info | warn | error | debug",
  "taskId": "uuid — nullable; omit for logs not scoped to a task",
  "step": "string — lifecycle step name (e.g., 'triage', 'execute', 'review', 'gateway')",
  "component": "string — source component (e.g., 'event-gateway', 'lifecycle-fn', 'fly-machine', 'watchdog')",
  "message": "string — human-readable description",
  "error": "string — nullable; stack trace or error message",
  "metadata": "object — nullable; additional structured context"
}
```

Using a consistent schema enables cross-component debugging: `grep taskId=<uuid>` across all log sources reconstructs the full end-to-end trace for any task. All components write to stdout; log aggregation (Fly.io logs, Supabase logs) handles collection.

### Runtime Selection

| Runtime Type | Use When | Departments | Cost Profile |
|---|---|---|---|
| **Fly.io Machine** | Full OS isolation, long-running processes, filesystem access | Engineering | ~$0.50-$2.00/task |
| **Event Gateway Worker** | Simple API calls, notifications, webhooks | Cross-platform routing | Negligible |

The tiered approach keeps costs in check. Running 20 engineering tickets/day on Fly.io machines costs ~$10-$40/day. Running 50 marketing optimization tasks in-process costs less than $3/day. The architecture supports both without structural changes. The archetype's `runtime_config` determines which tier gets provisioned at execution time.

#### Inngest Execution Limits

These limits apply to all Inngest lifecycle functions in the platform. Architect around them from the start.

| Limit | Value | Platform Impact |
|---|---|---|
| Max step payload | 4 MB | Pass PR URLs and task IDs through steps, not full payloads (PR diffs, file contents) |
| Max function state | 32 MB | Total state across all steps + event data; monitor for large triage contexts |
| Max steps per function | 1,000 | Task lifecycle uses ~10–15 steps — no concern. Avoid unbounded loops. |
| Max event payload | 256 KB (free) / 3 MB (pro) | Jira webhook payloads are 5–50 KB; GitHub PR webhooks are 10–100 KB — no concern at MVP |
| Max sleep / wait duration | 7 days (free) / 1 year (pro) | Human approval waits (7d) require free tier minimum; use `step.waitForEvent()` correctly |

**Free Tier Capacity** (relevant for MVP volume planning):

| Limit | Free Tier | Pro ($75/mo) | MVP Usage |
|---|---|---|---|
| Function executions/month | 50,000 | 1M+ | ~9,000/mo at 20 tasks/day × 15 steps |
| Concurrent steps | 5 | 100+ | ⚠️ Bottleneck if >3 lifecycle functions run simultaneously |
| Trace retention | 24 hours | 7 days | Upgrade to Pro for debugging beyond 24h |

> **Upgrade trigger**: Upgrade to Pro ($75/mo) when concurrent task volume regularly exceeds 3 simultaneous lifecycle functions. The 5-step concurrent limit, not the execution count, is the binding constraint at MVP scale.

---

### 14.1 Multi-Project Docker Image Strategy

The platform uses a **single shared base image** for all Fly.io execution machines, regardless of which project or repository is being worked on. Per-project variation is handled at boot time via environment variables, not by maintaining separate Docker images.

**Base image contents** (shared across all projects):

- Runtime: Node.js, pnpm
- Git tooling: `git`, GitHub CLI (`gh`)
- Docker-in-Docker (fuse-overlayfs backend)
- OpenCode CLI + SDK
- Platform scripts: `entrypoint.sh`, `orchestrate.mjs`

**Per-project configuration** (environment variables injected at dispatch):

- `REPO_URL` — The project's GitHub repository URL
- `REPO_BRANCH` — The base branch to clone from (default: `main`)
- `PLAN_NAME` — The `.sisyphus/plans/*.md` plan to execute (if plan-mode)
- Project-specific secrets (GitHub token, Jira credentials) injected via Fly.io secrets

**Boot-time clone**: The machine's entrypoint script clones the target repository at startup (shallow clone, depth=2) using the `REPO_URL` variable. A per-project volume cache (`worker_pool_*` volumes) stores the pnpm dependency store and Docker image layers across runs, dramatically reducing boot time for repeat executions.

This mirrors the approach proven in the nexus-stack (`tools/fly-worker/entrypoint.sh`), where the Docker image is project-agnostic and the repository is cloned at runtime.

**When to consider per-project images**: If projects have fundamentally different tooling requirements (e.g., Python vs. TypeScript monorepos with incompatible runtimes), separate base images become appropriate. For the MVP engineering projects — all TypeScript — the single base image is the correct choice.

## 15. Technology Stack

The table below covers every component in the stack. The "Alternative" column shows what was considered and why it wasn't chosen — or what to migrate to if the recommended choice stops working.

| Component | Recommended | Why | Alternative |
|---|---|---|---|
| **Platform Layer** | Fastify (TypeScript) | Fast, lightweight, OpenAPI plugin, type safety | Express |
| **Eng Agent Runtime** | OpenCode (`opencode serve` + `@opencode-ai/sdk`) | Purpose-built for AI coding workflows. Proven in nexus-stack. Handles file editing, git, tests, LSP. | — |
| **Non-Eng Agent Runtime** | Inngest | Durable execution with step-level checkpointing, event-driven state, human-in-the-loop pauses | Trigger.dev |
| **Orchestration (Eng)** | Inngest step functions (evolved from `orchestrate.mjs` pattern) | Durable workflow execution with step-level checkpointing, concurrency control, and crash recovery. Not a separate service — the orchestrator IS these Inngest functions. | — |
| **Orchestration (Non-Eng)** | Inngest workflows | Built-in step checkpointing; crash-safe; human interrupts; no self-hosted infra | Trigger.dev |
| **Job Queue** | Inngest | Managed event queue + workflow runner in one; per-function concurrency; no Redis to operate | SQS |
| **Database + Vectors** | Supabase (PostgreSQL + pgvector) | MCP server, AI toolkit, Edge Functions, Auth, already in nexus-stack | Neon |
| **Database Migrations** | Prisma (`prisma migrate`) | Already proven in nexus-stack. Type-safe schema management, version-controlled migration files, TypeScript client generation. | `supabase migration` CLI (lighter but no type generation) |
| **LLM Access** | OpenRouter | Unified API for 100+ models, eliminates custom routing, provider-cost pricing | Direct provider APIs |
| **LLM Optimization** | Claude Max 20x subscription | Reduces LLM costs to ~$0 for Claude models when under rate limits | — |
| **Execution Compute (Eng)** | Fly.io Machines API | Proven in nexus-stack, pay-per-second, full isolation, volume persistence | Modal |
| **Execution Compute (Non-Eng)** | Inngest in-process (TypeScript) | No isolation needed for API-only tasks; lowest cost. Runs as Inngest function steps. | — |
| **Code Gen LLM** | Claude Opus/Sonnet (via OpenRouter) | Best code quality, long context window | GPT-4.1 |
| **General Task LLM** | Claude Sonnet (via OpenRouter) | Speed + quality balance for non-coding tasks | GPT-4o-mini |
| **Notifications** | Slack API | Already in use, rich formatting, approval workflows | — |
| **Human Interaction** | Slack-first | Approvals, questions, escalations all in Slack | — |
| **Knowledge Base** | pgvector in Supabase | No extra service, shared with application DB | Qdrant (at scale) |
| **E2E Testing** | Playwright | Multi-browser, proven in nexus-stack | Cypress |
| **CI Integration** | GitHub Actions | Native to GitHub | — |
| **CRM Integration** | GoHighLevel API | Already in stack for sales + marketing | HubSpot |
| **Ad Platform** | Meta Marketing API | Primary paid channel | Google Ads API |
| **Accounting** | QuickBooks Online API | Standard for SMB finance automation | Xero |
| **Agent Observability** | Inngest Dashboard | Built-in workflow execution traces, step-level inspection, replay | — |
| **Infra Observability** | Supabase Logs + structured logging | Built-in query and activity logs, no extra service to operate | Datadog |

> **Prisma + pgvector note**: Prisma handles all standard relational tables (tasks, executions, feedback, etc.). For pgvector-specific schema (`knowledge_embeddings` table), use raw SQL migrations via `prisma db execute` — Prisma does not natively support pgvector column types.

### Key Changes from the Original Architecture Document

Six decisions changed significantly from the first draft of this document. Each change reduces operational complexity without sacrificing capability.

**OpenCode for the engineering agent runtime**: The original document referenced a general-purpose assistant framework. OpenCode is the coding-specific agent runtime already running in the nexus-stack. It handles file editing, git operations, test execution, and LSP diagnostics out of the box. There's no reason to build those integrations from scratch.

**Inngest for job queuing and workflow orchestration**: A self-hosted job queue requires Redis infrastructure, operational monitoring, and custom concurrency logic. Inngest replaces the job queue, the state machine, and concurrency control in one managed service. No Redis to operate, built-in dashboard, durable step execution with retries. For V1 volumes, the free tier is sufficient. See Section 28 for the migration path back to self-hosted infrastructure if needed.

**Inngest (TypeScript) for all non-engineering workflows**: A Python-based workflow framework added a second language, second deployment pipeline, and cross-language communication complexity. Marketing V1 is campaign optimization via Meta Ads API and Google Ads API — both have TypeScript SDKs. Inngest step functions orchestrate the workflow without needing Python. The entire platform is TypeScript-only for V1. See Section 28 for the migration path to Python-based workflows when needed.

**pgvector in Supabase instead of a dedicated vector database**: Supabase eliminates a separate vector database service. pgvector handles tens of millions of vectors efficiently. A dedicated vector database (such as Qdrant) remains a future migration path if pgvector query performance becomes a bottleneck at scale.

**OpenRouter instead of a custom LLM router**: Building a custom router that handles provider fallback, model selection, and cost tracking is weeks of work. OpenRouter does all of this out of the box with a single API key. The platform's "LLM Gateway" is a thin wrapper on top of OpenRouter, not a custom-built router.

---

## 16. Implementation Roadmap

This roadmap assumes one developer. Milestones are sequential — do not begin a milestone until the previous one is fully validated in production (shadow mode, then supervised, then autonomous). Timeline estimates are approximate; quality gates matter more than dates.

**MVP = M1 + M3.** The initial launch targets platform foundation and the execution agent only. The triage agent (M2) and review agent (M4) are post-MVP. PRs are reviewed manually by the developer in MVP. M4 is explicitly post-MVP and will be built once execution agent output quality is proven and manual review becomes a bottleneck.

| Milestone | Focus | Weeks | Gate |
|---|---|---|---|
| M1 *(MVP)* | Platform Foundation | 1-3 | Inngest processing events end-to-end |
| M2 *(post-MVP)* | Engineering Triage Agent | 4-6 | Agent posting accurate questions on real Jira tickets |
| M3 *(MVP)* | Engineering Execution Agent | 7-10 | Agent creating compilable PRs for simple tickets |
| M4 *(post-MVP)* | Engineering Review Agent | 11-13 | Auto-merge working for low-risk PRs |
| M5 | Engineering Multi-Project | 14-15 | 2-3 projects onboarded with per-project isolation |
| M6 | Paid Marketing Department | 16-20 | Inngest campaign optimization running on real ad accounts |

### M1 — Platform Foundation (Weeks 1-3)

The foundation everything else runs on. No agents yet — just the infrastructure that agents will use.

- Event Gateway (Fastify/TypeScript) with Jira and GitHub webhook handlers
- Inngest project configured with per-department function namespaces
- Supabase schema: `tasks`, `archetypes`, `executions`, `feedback` tables
- Archetype Registry with the engineering archetype config
- Inngest Dashboard configured to monitor queue health and function throughput

**Gate**: A Jira webhook fires, the Event Gateway normalizes it, Inngest receives the event, and the workflow run appears in the Inngest Dashboard. No agent work yet — just the plumbing.

### M2 — Engineering Triage Agent (Weeks 4-6)

The first agent. Triage is the right starting point because it's read-only — the agent can't break anything.

- Task history queries via SQL for institutional memory. Codebase context via OpenCode's native search tools (file search, LSP, grep, AST). pgvector embeddings deferred — see Section 28.
- Triage agent in OpenCode with Jira REST API access (read ticket, post comment)
- Shadow mode: agent triages but a human reviews all AI outputs before anything is posted
- Feedback table populated with first corrections

**Gate**: Agent posts accurate, specific clarifying questions on real Jira tickets. Human reviewer agrees the questions are relevant at least 75% of the time.

### M3 — Engineering Execution Agent (Weeks 7-10) *(MVP milestone)*

The hardest milestone. This is where the Fly.io machine lifecycle, the fix loop, and the OpenCode session management all come together. M3 completes the MVP: with M1 + M3 live, the platform receives Jira tickets, implements them, and creates PRs — the developer reviews PRs manually. The review agent (M4) is built after M3's quality is proven in production.

- Generalize the nexus-stack fly-worker for multiple projects (not just nexus-stack)
- Execution agent with stage-targeted fix loop (TypeScript, lint, unit, integration, E2E)
- Fix iteration budget (3 per stage) with Slack escalation on budget exhaustion
- Supervised mode: human approves all PRs before merge

**Gate**: Agent creates compilable PRs for simple, well-scoped tickets. Human reviewer can approve without requesting changes at least 60% of the time.

### M4 — Engineering Review Agent (Weeks 11-13) *(post-MVP)*

Closes the loop. The review agent is what makes autonomous operation possible — without it, every PR needs a human. This milestone is explicitly post-MVP: it begins only after M3 is stable in production and manual PR review has become the primary bottleneck.

- Review agent with GitHub REST API and CLI access
- Risk scoring model (files changed, critical paths, new dependencies)
- Auto-merge for low-risk PRs; Slack approval request for high-risk
- Merge queue with rebase-on-merge for concurrent PRs

**Gate**: Auto-merge working correctly for low-risk PRs. No regressions introduced by auto-merged PRs in the first two weeks of operation.

### M5 — Engineering Multi-Project (Weeks 14-15)

Validates that the platform generalizes beyond the pilot project.

- Per-project concurrency scheduler (configurable limit per project)
- Onboard 2-3 additional projects with their own knowledge bases
- Full autonomous operation with monitoring

**Gate**: Two or more projects running autonomously without cross-project interference. Escalation rate below 25%.

### M6 — Paid Marketing Department (Weeks 16-20)

The second department. This validates that the archetype pattern generalizes beyond engineering.

- Inngest workflow functions for campaign optimization
- Meta Ads API and Google Ads API integration
- Campaign optimization triage, execution, and review agents
- Inngest TypeScript workflow functions (no Fly.io needed for marketing tasks — runs as Inngest step functions)
- Shadow mode, then supervised, then autonomous progression

**Gate**: Inngest campaign optimization running on real ad accounts in supervised mode. Agent recommendations match human judgment at least 70% of the time.

### Future Milestones (No Timeline)

These are architecturally planned but not scheduled. Each requires the previous departments to be independently stable before starting.

- **Finance Department**: Invoice processing, expense categorization, reconciliation
- **Sales Department**: Lead qualification, CRM enrichment, outreach sequences
- **Organic Content Department**: Blog posts, social content, SEO articles
- **Cross-Department Workflows**: Sales-to-Engineering-to-Finance chains (Section 5)
- **SaaS Multi-Tenancy**: Row-Level Security enforcement, tenant onboarding
- **LLM A/B Testing**: Route N% of tasks to new model versions, compare metrics
- **Self-Service Onboarding**: UI for adding new departments without developer involvement

---

## 17. Cost Estimation

All pricing is approximate and based on current service rates at time of writing. Check each provider's pricing page before budgeting. LLM pricing in particular changes frequently — see openrouter.ai/pricing for current rates.

### Infrastructure Fixed Costs (Monthly)

These costs are constant regardless of task volume.

| Service | Plan | Cost/Month |
|---|---|---|
| Supabase | Pro | ~$25 |
| Inngest | Pay-as-you-go | ~$0-25 |
| Fly.io (persistent services) | 2-3 always-on apps | ~$15-30 |
| **Total fixed** | | **~$40-80/month** |

### Variable Costs — Engineering Tasks

Each engineering task incurs LLM costs and Fly.io machine time. The range reflects ticket complexity.

| Component | Cost Range | Notes |
|---|---|---|
| Triage LLM (Claude Sonnet via OpenRouter) | ~$0.05-$0.15 | Depends on ticket complexity |
| Execution LLM (Claude Opus via OpenRouter) | ~$0.50-$3.00 | Depends on code complexity |
| Fly.io machine (`performance-2x`, execution) | ~$0.50-$2.00 | ~30-90 min per task |
| **Total per engineering task** | **~$1.05-$5.15** | Without Claude Max |

> **MVP note**: Triage is deferred in MVP. MVP per-task cost is ~$1.00–$5.00 (execution + compute only). The triage line item applies when the triage agent is added in M2.

| **With Claude Max 20x** | **~$0.50-$2.40** | LLM costs ~$0; Fly.io compute unchanged |

> **Post-MVP addition**: When the review agent is added (M4), expect an additional ~$0.60-$2.40 per task for review compute and LLM (Fly.io machine + Claude Sonnet via OpenRouter, including merge conflict resolution).

Claude Max 20x reduces LLM costs to near zero for Claude models when under rate limits. The Fly.io machine cost is unchanged — that's compute, not inference.

### Variable Costs — Marketing Tasks

Marketing tasks run in-process (no Fly.io machine), so costs are almost entirely LLM inference.

| Component | Cost Range |
|---|---|
| Marketing workflow LLM (Claude Sonnet via OpenRouter) | ~$0.05-$0.20 |
| In-process compute | ~$0.01-$0.03 |
| **Total per marketing task** | **~$0.06-$0.23** |

### Monthly Projection at Steady State

| Scenario | Volume | Monthly Variable Cost |
|---|---|---|
| Engineering only (without Claude Max) | 20 tasks/day | ~$990-$4,530 |
| Engineering only (with Claude Max) | 20 tasks/day | ~$600-$2,400 |
| Engineering + Marketing | 20 eng + 30 mkt/day | ~$1,044-$4,737 |

These projections don't include fixed infrastructure costs (~$40-80/month).

### Honest Framing

The platform accelerates a solo developer's output by 3-5x — it doesn't replace headcount. Human oversight, maintenance, escalation handling, and prompt refinement are still required. The cost model makes sense when the value of the accelerated output exceeds the infrastructure and LLM costs. For engineering, that threshold is low: one complex ticket automated per day at $5 cost is worth it if that ticket would have taken 2-4 hours of developer time.

---

## 18. Risk Mitigation

### Platform-Level Risks

These risks apply across all departments.

| Risk | Mitigation |
|---|---|
| Claude Max subscription ToS (automated usage) | Always maintain OpenRouter as fallback. Monitor Anthropic policy updates. Never architect the system to depend on Max being available. |
| Cross-language deployment complexity (when dual-language is enabled) | V1 is TypeScript-only — this risk activates when Python workers are added (see Section 28). Mitigation at that point: separate Dockerfiles per language, clear API contract via Inngest HTTP, documented local dev setup for both runtimes. |
| Solo developer unavailability | Alert fatigue is real. Tune escalation thresholds so non-critical tasks wait in queue rather than spam Slack. |
| LLM provider outage | LLM Gateway fallback chain: Claude (Max) → Claude (OpenRouter) → GPT-4o → GPT-4o-mini. |
| Cost runaway | Primary: cost circuit breaker in Section 22 (daily spend cap + Slack alert). Secondary: per-department concurrency limits cap parallelism but not per-call cost. |
| Knowledge base staleness | Per-project reindex on every merge to `main`; nightly full reindex for external content; drift detection via embedding distance score. |
| Unauthorized autonomous actions | Risk-model-driven gates per department; full audit trail in Supabase `audit_log` table. |

### Engineering-Specific Risks

These risks are specific to the engineering department's code execution model.

| Risk | Mitigation |
|---|---|
| AI generates buggy code that passes tests | 3-iteration fix budget per stage + human review gate for high-risk changes. |
| Fix loop oscillation (fixing one stage breaks another) | Stage-targeted fix loop: re-enter at the failing stage, not at code generation. |
| Webhook delivery failures | Inngest retries with exponential backoff + hourly Jira reconciliation poll as safety net. |
| Fly.io machine hangs | 4-hour hard timeout + 3-layer monitoring system (Section 10). |
| Merge conflicts between concurrent PRs | Each task runs on an isolated Fly.io machine with its own git clone. Conflicts surface at PR review time and are resolved by the review agent via rebase — standard Git workflow. |
| AI-generated PR contains bugs (MVP) | Human reviews all PRs manually in MVP; fix loop + per-stage escalation reduce defect rate before PR creation. Post-MVP: review agent adds automated validation layer. |
| (Post-MVP) Auto-merged PR introduces regression | CI failure on `main` after merge triggers Slack alert with one-click "Create revert PR" button. Human clicks → system creates revert PR → review agent validates → merge. Post-MVP: automatic revert for PRs causing CI failure within 15 minutes of merge. (Probability: Low — risk scoring prevents high-risk auto-merges; Impact: High) |
| Event Gateway downtime | Fly.io health checks on `GET /health` endpoint detect and restart crashed gateway instances automatically. If Fly.io has a regional outage, webhooks queue on the provider side (Jira/GitHub retry for up to 24h). |
| Fly.io machine crash after branch creation but before PR | Re-dispatch is idempotent: `entrypoint.sh` checks if the task branch already exists and reuses it rather than creating a new one. `git push --force-with-lease` prevents stale overwrites. The 3-layer monitoring system (Section 10) detects stale machines and re-dispatches. |
| Supabase connection pool exhaustion | Expected peak connections: 3 execution machines + 1 gateway + Inngest functions ≈ 10–15 concurrent connections. Supabase Pro provides 60 direct connections — headroom is adequate at MVP. Enable Supavisor (Supabase's connection pooler) if concurrent Fly.io machines regularly exceed 10. |
| Credential expires during long-running execution | GitHub tokens have 90-day expiry — unlikely to expire during a 4-hour max task. If auth fails at PR creation, the execution agent retries once with a fresh token read from Fly.io Secrets. Claude Max OAuth tokens are refreshed by `sync-token.sh` before each dispatch cycle. |
| Completion event lost (machine → Inngest) | Supabase-first completion write: machine writes final status + PR URL to Supabase BEFORE sending Inngest event. Watchdog cron reconciles tasks stuck in `Submitting` state within 10 minutes. See §8 and §10. |
| Timeout race (waitForEvent vs machine clock) | `step.waitForEvent` timeout set to machine hard timeout + 10 minutes buffer (4h10m). Prevents premature lifecycle function timeout when machine clock starts before `waitForEvent` begins. See §10. |
| Infinite re-dispatch loop | `dispatch_attempts` counter on `tasks` table (see §13). Hard cap at 3 re-dispatches. Slack escalation after exhaustion. Task moves to `AwaitingInput`. |
| Concurrent status writers causing inconsistent state | Optimistic locking via SQL WHERE clause on all status transitions: `UPDATE tasks SET status = $new WHERE id = $id AND status = $expected RETURNING id`. See §13 Optimistic Locking Pattern. |

---

## 19. Department Onboarding Checklist

Use this checklist when adding a new department to the platform. Steps are sequential — each one depends on the previous. Don't skip shadow mode.

1. **Define the archetype** — Identify trigger sources, tools, knowledge base content, risk model, delivery targets, and `runtime` type (`opencode` / `inngest` / `in-process`). Write the archetype config object. (MVP: hardcoded as `engineeringArchetype`. Post-MVP: register in the Archetype Registry once the pattern is validated by two departments.)

2. **Register webhook endpoints** — Extend the Event Gateway with handlers for the department's trigger sources. Normalize incoming events to the universal task schema. Test with real webhook payloads before proceeding.

3. **Configure the LLM Gateway** — Select appropriate models per task type in the archetype config (triage, execution, review). Set token budget limits per task type. Verify the fallback chain works for this department's task profile.

4. **Build the knowledge base** — Index domain content into pgvector with department-scoped namespacing. Set up the indexing pipeline (trigger on source changes) and refresh schedule (nightly for external content). Verify query results are relevant before wiring to agents.

5. **Implement the triage agent** — OpenCode session or Inngest workflow with department-specific tools. Tools for reading source data and generating clarifying questions. Test against a sample of real historical tasks before going live.

6. **Implement the execution agent** — OpenCode + Fly.io machine (engineering) or Inngest workflow (marketing and other departments). Execution tools, fix loop, escalation path. Test against simple, well-scoped tasks first.

7. **Implement the review agent** — OpenCode session or Inngest workflow with validation tools and risk scoring. Define what "acceptable output" means for this department before writing the review logic.

8. **Configure the risk model** — Define factors, weights, and thresholds. Start conservative (low auto-approve threshold, high escalation rate). Loosen as confidence grows. Document the initial weights so you have a baseline to compare against.

9. **Shadow mode** (2-4 weeks) — Run the full pipeline on live tasks but suppress all external actions. The agent triages, executes, and reviews, but nothing is posted, merged, or published. A human reviews all AI output and populates the feedback table with corrections.

10. **Supervised mode** — Enable external actions but require human approval for every delivery. Gradually increase the auto-approval threshold as the feedback table shows consistent accuracy. Don't rush this step.

11. **Autonomous mode** — Full autonomous operation with human escalation only for high-risk tasks. Monitor via Inngest Dashboard (queue health, execution traces) and Supabase Logs (error patterns). Run the weekly prompt refinement ritual from Section 21.

---

## 20. Success Metrics

These metrics are appropriate for a solo developer starting point. V1 targets are aspirational — you're building the measurement infrastructure alongside the capability. Measure accuracy from Day 1 via the feedback table, even before you have optimization levers to pull.

### Platform Health (V1 Targets)

| Metric | V1 Target | Alert Threshold |
|---|---|---|
| Task throughput | > 10 engineering tasks/day | < 5 tasks/day |
| Queue wait time (p95) | < 10 minutes | > 30 minutes |
| Escalation rate | < 25% (loosens over time) | > 50% |
| LLM cost per task | Track baseline, trend down | > 2x baseline |
| Agent prompt refinement rate | Weekly review + update cycle | No updates in 30 days |

The escalation rate target of < 25% is intentionally loose for V1. Starting at 50-60% escalation is normal and expected. The goal is a downward trend over weeks, not hitting 25% on day one.

### Per-Department Quality (Aspirational V1 Targets)

| Metric | Engineering | Paid Marketing |
|---|---|---|
| Triage accuracy (questions relevant) | > 75% | > 70% |
| Execution success (no human rework) | > 60% | > 70% |
| Review catch rate (bad output blocked) | > 90% | > 85% |
| Time to PR (vs. human baseline) | 40% faster | 60% faster |

Marketing targets are slightly more aggressive than engineering because marketing tasks are more structured (API calls with defined inputs and outputs) and less open-ended than code changes.

### How to Measure

- **Triage accuracy**: Track via the `feedback` table. Every time a human overrides a triage decision, that's a miss. Accuracy = (total triage decisions - overrides) / total triage decisions.
- **Execution success**: Track via PR review outcomes. A PR that requires changes after human review counts as a partial failure. A PR that merges without changes counts as a success.
- **Review catch rate**: Track via post-merge regressions. If a merged PR introduces a bug that a human reviewer would have caught, that's a miss.
- **Time to PR**: Compare `task.created_at` to `deliverable.created_at` against the historical average for similar tickets.

### What Not to Measure in V1

Don't track "tasks completed per day" as a primary metric in V1 — it incentivizes rushing through shadow mode and supervised mode. Quality gates matter more than throughput until the system is proven. Throughput becomes the primary metric in V2, once quality is established.

---

## 21. Feedback Loops

Feedback loops are built into V1 from the start, not bolted on later. Every time a human overrides an AI decision, that correction becomes a training signal. Without a feedback mechanism, the platform is static: it makes the same mistakes indefinitely. With feedback, it improves over time. The mechanism is intentionally simple. Capture corrections, aggregate weekly, apply to prompts and risk weights. No ML pipelines, no automated retraining. Just a structured record of where the AI was wrong and a weekly ritual to act on it.

### 21.1 Correction Capture

When a human overrides an AI decision, the system captures the full context of that correction. This is the raw material for all downstream improvement.

**What gets captured:**

- The task ID and agent version that produced the original decision
- The original decision (e.g., "auto-merged", "triaged as small scope", "risk score: 30")
- The human correction (e.g., "requested changes", "decomposed into 3 tickets", "risk score: 70")
- The correction reason (free text, optional but encouraged)
- Timestamp and which human made the correction

**Storage:** `feedback` table in Supabase.

```sql
CREATE TABLE feedback (
  id                uuid DEFAULT gen_random_uuid(),
  task_id           uuid REFERENCES tasks(id),
  agent_version_id  uuid,
  feedback_type     text NOT NULL,  -- 'triage_override', 'merge_override', 'risk_score_adjustment', 'pr_rejection'
  original_decision jsonb,
  corrected_decision jsonb,
  correction_reason text,
  created_by        text,
  created_at        timestamptz DEFAULT now(),
  tenant_id         uuid  -- future SaaS isolation
);
```

The `feedback_type` field drives aggregation. Triage overrides cluster differently from merge overrides, and each type informs a different part of the system. The `original_decision` and `corrected_decision` columns are JSONB so the schema stays flexible as agent behavior evolves.

### 21.2 Prompt Refinement Queue

Raw corrections don't improve the system on their own. The Prompt Refinement Queue is the weekly process that turns captured corrections into better agent behavior.

**Weekly aggregation process:**

1. Query all feedback entries from the past 7 days, grouped by `feedback_type`
2. For each type, identify patterns: are triage overrides concentrated in a specific project? Are risk scores consistently underestimated for migration tickets?
3. Draft prompt adjustments targeting those patterns
4. Review and apply the prompt changes (update the archetype's agent version record)
5. Log the change: what was the pattern, what was changed, when

This is a **weekly ritual** for the solo developer, not an automated process in V1. It takes 15-30 minutes. The Monitoring Runbook (Section 27) includes this in the weekly checklist.

The goal isn't perfection. It's directional improvement. If triage overrides drop from 8 per week to 3 per week over a month, the feedback loop is working.

### 21.3 Risk Model Tuning

Risk weights drift out of calibration over time. A factor that was correctly weighted at launch may be over- or under-weighted after a few months of real usage. Risk Model Tuning corrects this.

**After each human escalation or missed escalation:**

- If a task was auto-merged but a human later identified a regression, increase the weight of the relevant risk factor
- If a task was escalated for human review but the human approved immediately, decrease the weight of the triggering factor
- Log the adjustment: factor, old weight, new weight, reason

Risk weights are stored in the archetype's `risk_model` configuration in Supabase. Changes require updating the ARCHETYPE record, which automatically applies to subsequent tasks. No code deployment needed.

### 21.4 Feedback Flow

```mermaid
flowchart LR
    HO(["Human Override\nor Correction"]):::event
    FC["Correction Capture\n(Supabase feedback table)"]:::service
    WA["Weekly Aggregation\n(pattern identification)"]:::service
    PR["Prompt Refinement\n(archetype agent version)"]:::service
    RT["Risk Weight Tuning\n(archetype risk model)"]:::service
    IA(["Improved Agent\nBehavior"]):::event

    HO ==>|"1. Override captured"| FC
    FC -->|"2. Corrections aggregated"| WA
    WA -->|"3. Prompt pattern identified"| PR
    WA -->|"4. Risk drift detected"| RT
    PR ==>|"5. Prompt updated"| IA
    RT ==>|"6. Risk weights tuned"| IA

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
```

**Flow Walkthrough**

1. **Override captured** — A human overrides an AI decision (e.g., rejects an auto-merge, requests changes on a triage decision, or adjusts a risk score) and the system captures the full correction context into the Supabase `feedback` table.
2. **Corrections aggregated** — The Weekly Aggregation process queries all `feedback` records from the past 7 days and groups them by `feedback_type` (triage override, merge override, risk score adjustment, PR rejection) to identify patterns.
3. **Prompt pattern identified** — The Weekly Aggregation identifies recurring triage or execution errors (e.g., consistently misclassifying migration tickets as low-risk) and routes the pattern to Prompt Refinement.
4. **Risk drift detected** — The Weekly Aggregation identifies risk model miscalibration (e.g., tasks that were auto-merged but later caused regressions, or tasks escalated unnecessarily) and routes the pattern to Risk Weight Tuning.
5. **Prompt updated** — The Prompt Refinement step drafts targeted prompt changes for the affected agent, creates a new `AGENT_VERSION` record in Supabase with a changelog note, and marks it active for subsequent tasks.
6. **Risk weights tuned** — The Risk Weight Tuning step updates the affected factor weights in the archetype's `risk_model` configuration in Supabase, taking effect on all tasks processed after the update.

> **This is a V1 feature.** The feedback table schema and correction capture hooks must be implemented alongside the first triage agent, not added in a later milestone. The data model is simple; the cost is low; the value compounds over time. Deferring feedback infrastructure means operating blind for months.

---

## 22. LLM Gateway Design

> **MVP Scope**: MVP implements a minimal `callLLM({ model, messages, taskType })` wrapper function that all agents use. Today it calls OpenRouter directly. This provides a single insertion point for adding Claude Max routing, fallback orchestration, and cost tracking later — without modifying any agent code. The full gateway design below documents the future enhancement path.

All agent code calls the LLM Gateway. No agent ever calls a provider directly. The gateway owns model selection, provider routing, fallback logic, and cost tracking. This means swapping models or providers is a config change, not a code change. Agents don't know or care whether they're talking to Claude, GPT-4o, or an open-source model. They send a request to the gateway and get a response back.

The gateway is not a custom-built router. OpenRouter (openrouter.ai) serves as the primary interface, handling routing across 100+ models through a single API endpoint. The platform's "gateway" is a thin wrapper that adds cost tracking, fallback orchestration, and the optional Claude Max optimization layer on top of OpenRouter.

### Interface Contract

All agent code calls `callLLM()`. No agent ever imports or calls an LLM provider directly.

```typescript
interface CallLLMOptions {
  model: string;            // OpenRouter model ID (e.g., "anthropic/claude-sonnet-4")
  messages: Message[];      // Standard chat messages array
  taskType: string;         // "triage" | "execution" | "review" — drives model selection defaults
  taskId?: string;          // For cost tracking — associates LLM usage with a task's EXECUTION record
  temperature?: number;     // Default: 0 for code generation, 0.3 for analysis
  maxTokens?: number;       // Default: model-dependent
  timeoutMs?: number;       // Default: 120_000 (2 minutes)
}

interface CallLLMResult {
  content: string;          // The model's response text
  model: string;            // Actual model used (may differ if fallback triggered)
  promptTokens: number;     // From response.usage.prompt_tokens
  completionTokens: number; // From response.usage.completion_tokens
  estimatedCostUsd: number; // Calculated from token counts × current model pricing
  latencyMs: number;        // Wall-clock time for the LLM call
}
```

**Error handling**: On 429 (rate limit), retry with exponential backoff (3 attempts). On 5xx, fall through to the next model in the fallback chain (Section 22 Fallback Chain). On timeout after `timeoutMs`, throw `LLMTimeoutError`.

**Cost accumulation**: Each call's `promptTokens` and `completionTokens` are accumulated in memory during an execution. On execution completion, the totals are written to the `EXECUTION` table's `prompt_tokens`, `completion_tokens`, and `estimated_cost_usd` columns (see Section 13 data model). Claude Max calls record a cost of $0 in `estimated_cost_usd` since they are covered by the flat subscription.

**Circuit breaker check**: Before each call, the wrapper checks cumulative daily spend for the department via `SELECT SUM(estimated_cost_usd) FROM executions WHERE department_id = $dept AND created_at > NOW() - INTERVAL '1 day'`. If over the configured threshold, it throws `CostCircuitBreakerError` (triggering the Section 22.1 circuit breaker).

### Primary Interface: OpenRouter

OpenRouter is a unified API that proxies to Anthropic Claude, OpenAI GPT-4o, Google Gemini, Meta Llama, and hundreds of other models. It's compatible with the OpenAI API format, so integration is minimal. Pricing is pay-per-token at rates equal to or below direct provider pricing. See openrouter.ai/pricing for current rates.

Key benefits for this platform:

- **Single API key** for all LLM access. No managing separate Anthropic, OpenAI, and Google credentials.
- **No custom router needed.** OpenRouter handles model routing, so the platform doesn't build one.
- **Automatic fallback** at the provider level if a model is unavailable.
- **Model switching** via config. Upgrading from Claude Sonnet to Opus is a one-line change.

### Cost Optimization: Claude Max Subscription

Claude Max 20x provides high-volume Claude access at a flat monthly rate. When available, the gateway routes Claude requests through the Max subscription to avoid per-token costs. This is an optimization layer, not a dependency.

The nexus-stack's `sync-token.sh` script manages the Claude Max OAuth token lifecycle: it reads tokens from OpenCode's local auth store (`~/.local/share/opencode/auth.json`), checks expiry, refreshes via `opencode auth login` when expired, and pushes updated tokens to Fly.io Secrets. The `entrypoint.sh` boot script writes these tokens into the Fly.io machine's auth store at startup. The same mechanism applies for any OAuth-based integration added to the platform.

**Important caveat:** Automated API usage under a Max subscription may require verification against Anthropic's terms of service. Always maintain OpenRouter as the fallback. Never architect the system to depend on Max being available.

### Fallback Chain

```
Primary: Claude (via Max subscription, if available)
    ↓ (if rate limited or unavailable)
Fallback 1: Claude (via OpenRouter, pay-per-token)
    ↓ (if Claude is down)
Fallback 2: GPT-4o (via OpenRouter)
    ↓ (if all premium models unavailable)
Fallback 3: GPT-4o-mini or open-source model (via OpenRouter)
```

The gateway checks Max availability on each request. If the Max token is expired, rate-limited, or returns an error, it falls through to Fallback 1 immediately. Fallback 2 and 3 only trigger on provider-level failures, not on individual request errors.

### Cost Tracking

LLM cost data is tracked at two levels: **per-execution** via the `prompt_tokens`, `completion_tokens`, `primary_model_id`, and `estimated_cost_usd` columns on the `EXECUTION` table (populated by the `callLLM()` wrapper on execution completion), and **in aggregate** via the [OpenRouter Dashboard](https://openrouter.ai/activity). The per-execution columns enable the cost circuit breaker (Section 22.1) — which queries `SELECT SUM(estimated_cost_usd) FROM executions WHERE department_id = $dept AND created_at > NOW() - INTERVAL '1 day'` — per-task cost analysis, and feedback loop optimization. The OpenRouter Dashboard provides model-level cost breakdowns for monthly budgeting. For Claude Max calls (direct Anthropic), usage is monitored via the Anthropic console; Claude Max calls should be included in the `estimated_cost_usd` column with a cost of $0 when Max is active (since they are covered by the flat subscription).

This data feeds the cost estimation dashboards described in Section 17.

### Model Selection by Task Type

| Task Type | Recommended Model | Rationale |
|---|---|---|
| Engineering triage | Claude Sonnet (via OpenRouter) | Fast, sufficient reasoning for codebase analysis |
| Engineering execution (code gen) | Claude Opus (via OpenRouter or Max) | Best code quality, handles complex TypeScript |
| Engineering review | Claude Sonnet | Fast enough for review, cost-effective |
| Marketing triage | Claude Sonnet | API analysis, not code |
| Marketing execution | Claude Sonnet | Sufficient for campaign optimization decisions |
| High-volume simple tasks | GPT-4o-mini | Cost-efficient for bulk operations |

Model assignments live in agent config, not in code. Changing the model for a task type is a config update that takes effect on the next deployment.

### Architecture Diagram

```mermaid
flowchart LR
    subgraph Agents
        TRIAGE["Triage Agent"]:::service
        EXEC["Execution Agent"]:::service
        REVIEW["Review Agent"]:::service
    end

    GW["LLM Gateway"]:::service
    OR["OpenRouter\n(openrouter.ai)"]:::service

    subgraph Providers
        CLAUDE["Anthropic Claude"]:::external
        GPT["OpenAI GPT"]:::external
        OPEN["Open-Source\nModels"]:::external
    end

    MAX["Claude Max\nSubscription\n(optional)"]:::storage

    TRIAGE -->|"1. LLM request"| GW
    EXEC -->|"2. LLM request"| GW
    REVIEW -->|"3. LLM request"| GW
    GW -->|"4. Route via Max subscription"| MAX
    GW -->|"5. Route via OpenRouter API"| OR
    MAX -.->|"6. Fallback if rate-limited"| OR
    OR -->|"7. Forward to Claude"| CLAUDE
    OR -->|"8. Forward to GPT"| GPT
    OR -->|"9. Forward to open-source"| OPEN

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
```

**Flow Walkthrough**

1. **LLM request** — The Triage Agent sends all LLM inference requests to the LLM Gateway rather than calling any provider directly, keeping model selection and routing centralized.
2. **LLM request** — The Execution Agent sends all LLM inference requests (code generation, plan creation, fix diagnosis) to the LLM Gateway for routing and cost tracking.
3. **LLM request** — The Review Agent sends all LLM inference requests (code review, acceptance criteria validation, risk scoring) to the LLM Gateway for routing.
4. **Route via Max subscription** — The LLM Gateway checks Claude Max availability and routes Claude requests through the `sync-token.sh` OAuth token management when available, reducing per-token costs to near zero.
5. **Route via OpenRouter API** — The LLM Gateway routes requests through OpenRouter's unified API when Claude Max is unavailable or for non-Claude models, paying per-token at provider-rate pricing.
6. **Fallback if rate-limited** — When Claude Max hits its rate limit or returns an error, the gateway falls through to OpenRouter's Claude endpoint automatically (dashed = contingency path, not the primary flow).
7. **Forward to Claude** — OpenRouter proxies the request to Anthropic's Claude API (Opus for engineering execution, Sonnet for triage and review) and returns the response.
8. **Forward to GPT** — OpenRouter proxies the request to OpenAI's GPT-4o API when Claude is unavailable or for high-volume low-cost tasks.
9. **Forward to open-source** — OpenRouter proxies the request to open-source models (Llama, Mistral, etc.) when all premium models are unavailable or for bulk operations where cost matters most.

### 22.1 Cost Circuit Breaker

The `callLLM()` wrapper tracks cumulative daily LLM spend per department. When daily cost exceeds a configurable threshold (default: `$50/day` for the engineering department), the circuit breaker activates:

1. New LLM calls for that department are paused
2. A Slack alert is posted to the operations channel with: current spend, threshold, department, and a resume link
3. In-flight Inngest lifecycle functions check the cost gate before dispatching new tasks; tasks that would exceed the threshold are held in `AwaitingInput` state

The threshold is stored in the archetype configuration and adjustable without code deployment. This is especially important when Claude Max becomes unavailable: without Max's fixed subscription cost, per-request LLM costs spike 3–5×, potentially driving monthly engineering costs from ~$2,400 to ~$4,530 at steady state (see Section 17).

**Complementary to Section 18 concurrency limits**: Inngest concurrency limits cap parallelism (preventing resource exhaustion). The cost circuit breaker caps actual dollar spend. Both operate independently; the circuit breaker is the primary cost-control mechanism.

---

## 23. Agent Versioning

> **MVP Scope**: MVP implements minimal versioning: the `agent_versions` table with `prompt_hash`, `model_id`, and `tool_config_hash`, and every `EXECUTION` record links to its `agent_version_id`. This preserves the forensic trail (which version ran which task) from day one. Performance profiles, A/B testing, and the formal rollback mechanism described below are future enhancements.

Every agent that runs in this platform is versioned. This isn't optional — it's what makes the system debuggable and improvable over time.

### Version Schema

Each agent version is a row in the Supabase `agent_versions` table with these fields:

- `prompt_hash` — SHA256 of the prompt template. Changes when the prompt changes, even if the model doesn't.
- `model_id` — The LLM model used (e.g., `anthropic/claude-opus-4-5`). Changes when you switch models.
- `tool_config_hash` — SHA256 of the tool configuration JSON. Changes when tools are added, removed, or reconfigured.
- `changelog_note` — Human-readable description of what changed and why.
- `is_active` — Whether this version is currently live for new tasks.

The combination of `prompt_hash + model_id + tool_config_hash` uniquely identifies a version. If any of the three change, a new version row is created.

### Linking Versions to Executions

Every `EXECUTION` record includes `agent_version_id`. This enables forensic queries: "which version of the triage agent caused this misclassification?" Every `FEEDBACK` record also includes `agent_version_id`, linking human corrections to the exact version that made the error. Over time, this builds a per-version performance profile.

### Rollback

If a new prompt version underperforms, update the ARCHETYPE record's `agent_version_id` to the previous version's ID. The change takes effect immediately for all subsequent tasks. Old tasks retain their original version ID for audit purposes — you never lose the historical record of what ran.

### Changelog Discipline

Each version update requires a changelog entry: date, what changed, why, and the performance delta observed (e.g., "triage accuracy: 78% to 84%, 15-task sample"). This keeps the version history human-readable, not just a hash log.

### A/B Testing (Future)

Route N% of tasks to the new version while keeping the proven version as default. Compare metrics after a statistically significant sample. Not in V1 — the single-version rollback mechanism is sufficient for now.

---

## 24. API Rate Limiting

> **MVP Scope**: The full centralized token bucket with backpressure and cross-worker coordination is deferred. MVP uses thin API service wrappers (`jiraClient`, `githubClient`) with built-in retry-on-429 logic. All external API calls go through these wrappers, providing a single insertion point for the full rate limiter later. See Section 28 for the migration path and cost analysis.

### The Problem

Multiple concurrent tasks hitting Jira, GitHub, and Meta Ads from the same account can exceed per-account rate limits. Without platform-level management, individual tasks get throttled, retries pile up, and you get cascading delays or outright failures during busy periods.

### Solution: Centralized Token Bucket

> **Deferred for MVP.** The token bucket design below will be built when concurrent task volume causes cascading 429 failures. MVP uses retry-on-429 in the thin API service wrappers.

A centralized rate limiter runs as middleware in the Event Gateway (TypeScript). It uses an in-process token bucket backed by Supabase for cross-worker coordination. Each external API gets a configured limit, and the bucket is shared across all concurrent workers. No single worker can starve the others, and no API account gets hammered.

### Backpressure

> **Deferred for MVP.** Backpressure and dispatch delay logic will be added alongside the full token bucket.

When a rate limit bucket drops below 20% capacity, the orchestrator delays task dispatch rather than failing. Tasks queue in Inngest with a calculated delay based on the refill rate. They retry transparently from the caller's perspective. This prevents the thundering herd problem when multiple tasks start simultaneously after a quiet period.

### Per-API Configuration

> **Future reference**: These limits will be used when the full token bucket is implemented.

| External API | Platform Rate Limit | Recommended Budget | Bucket Refill |
|---|---|---|---|
| Jira REST API | 1,000 req/minute (Cloud) | 200 req/minute | Per minute |
| GitHub REST API | 5,000 req/hour (authenticated) | 1,000 req/hour | Per hour |
| GitHub GraphQL | 5,000 points/hour | 1,000 points/hour | Per hour |
| Meta Marketing API | Varies by endpoint | 30% of limit | Per window |
| GoHighLevel API | 400 req/minute | 100 req/minute | Per minute |

The "Recommended Budget" column is conservative by design. It leaves headroom for manual API calls from developers and other tooling that shares the same credentials.

### Monitoring

> **Deferred for MVP.** Rate limit monitoring will be added alongside the full token bucket. MVP relies on Inngest execution logs to spot rate-limit-related failures.

Rate limit utilization per API per department is tracked in Supabase. A Slack alert fires at 80% utilization so you can investigate before hitting the ceiling. Inngest execution logs include rate limit wait times, making it easy to spot which tasks are spending time in the backpressure queue versus actually doing work.

---

## 25. Security Model

### Secret Storage

All credentials live in Fly.io Secrets. Never in `.env` files, never in code, never in version control. Secrets are injected as environment variables at machine startup. Rotating a credential means updating it in Fly.io and redeploying — no code changes required.

### OAuth Token Lifecycle

The nexus-stack's `sync-token.sh` pattern manages OAuth tokens that expire on short cycles (Claude Max subscription tokens expire every 24-48 hours). The sync script refreshes them and updates Fly.io Secrets automatically. Any OAuth-based integration added to this platform (Meta Ads API, GoHighLevel, etc.) must follow the same pattern. Manual token management doesn't scale.

### Per-Department Credential Scoping

Each department's agent workers receive only the credentials they need:

- **Engineering agents**: `GITHUB_TOKEN`, `JIRA_TOKEN`
- **Marketing agents**: `META_ADS_TOKEN`, `GOOGLE_ADS_TOKEN`, `GOHIGHLEVEL_TOKEN`

No agent receives cross-department credentials. A marketing agent cannot touch GitHub. An engineering agent cannot touch Meta Ads. This is enforced at the Fly.io machine level, not just in application code.

### Least Privilege

Agents get minimum permissions within their credential scope:

- **Engineering**: Create PRs, post Jira comments, read repos. Cannot merge to `main` without a human review gate.
- **Marketing**: Create campaign drafts. Cannot publish without an approval gate.
- **All agents**: Read access to the Supabase knowledge base. Write access only to their own task records.

### Audit Trail

Every external API call is logged to the Supabase `audit_log` table: `timestamp`, `agent_version_id`, `task_id`, `api_endpoint`, `http_method`, `response_status`. This supports both debugging ("what did the agent actually call?") and compliance ("show me all actions taken on this account in the last 30 days").

### Future Multi-Tenant Isolation

When the platform goes multi-tenant, each tenant's credentials get Fly.io Secrets with tenant-scoped namespacing. Supabase Row-Level Security enforces data isolation at the database layer. Cross-tenant credential access isn't just prevented by policy — it's architecturally impossible.

---

## 26. Disaster Recovery

### Philosophy

The platform relies entirely on managed services with built-in redundancy. The DR strategy is: managed services handle infrastructure failures; the platform handles retries. Custom DR infrastructure isn't cost-justified for a solo developer. Every service choice in this architecture was made partly because it handles its own availability.

### Failure Modes and Recovery

| Failure | Detection | Recovery | Auto/Manual |
|---|---|---|---|
| Supabase outage | Inngest function fails with DB connection error | Inngest retries with exponential backoff; Supabase PITR recovers data to last checkpoint | Auto |
| Inngest outage | Event Gateway cannot send events | Events are stored in `tasks.raw_event` before Inngest send. On recovery: Inngest retries with exponential backoff automatically. For extended outages: run `dispatch-task.ts` CLI to re-send events from Supabase for tasks stuck in `Received` state. | Auto |
| Fly.io machine crash | 3-layer monitoring system (Section 10) | The orchestrator marks task as failed; re-dispatches to a new machine | Auto |
| LLM provider outage | OpenRouter returns 5xx or timeout | LLM Gateway fallback chain: Claude primary to GPT-4o to GPT-4o-mini | Auto |
| Webhook delivery failure | Jira/GitHub built-in retry exhausted | Event Gateway is idempotent (deduplication by webhook ID); hourly reconciliation poll catches strays | Auto |

### Manual Intervention Required

Some failures need a human:

- **Supabase credentials compromised**: Rotate via Supabase dashboard, update Fly.io Secrets, redeploy.
- **GitHub token expired**: Re-authenticate via GitHub OAuth, update Fly.io Secrets.
- **Meta Ads API access revoked**: Re-authorize OAuth, run the `sync-token` pattern to push the new token.

These are credential lifecycle events, not infrastructure failures. They can't be automated without introducing credential storage risks.

### The Reconciliation Job

A scheduled cron job runs every hour and polls Jira for all open tickets not yet reflected in the platform state store. This is the safety net for missed webhooks, not the primary path. When webhook delivery fails and retries are exhausted, the reconciliation job catches the gap within an hour. Tasks created this way are indistinguishable from webhook-triggered tasks once they enter the queue.

---

## 27. Operational Runbooks

These runbooks are for a solo developer operating the platform. Each is designed to take less than 15 minutes for routine operations. They link to service dashboards rather than repeating documentation that changes over time. When in doubt, check the dashboard first.

---

### Deployment Runbook

**Initial setup** (one-time, ~2 hours):

1. Create Fly.io account and apps: `ai-employee-gateway` (Event Gateway — Fastify/TS), `nexus-workers` (OpenCode execution machines)
2. Create Supabase project, run schema migrations. (Enable pgvector extension when knowledge base indexing is needed — deferred for MVP.)
2.5. Run schema migrations: `npx prisma migrate deploy` — applies all pending migrations to Supabase. For initial setup, this creates all tables. For subsequent deployments, run before `fly deploy` if schema changed.
3. Create Inngest project, copy signing key and event key to Fly.io Secrets
4. Set Fly.io Secrets: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GITHUB_TOKEN`, `JIRA_TOKEN`, `OPENROUTER_API_KEY`
5. Configure Jira webhook pointing to the Event Gateway URL for each project
6. Configure GitHub webhook pointing to the Event Gateway URL for each repo
7. Build and deploy: `fly deploy --app ai-employee-gateway`

The Event Gateway exposes a `GET /health` endpoint that returns `200 OK` when ready to accept webhooks. Configure Fly.io health checks to poll this endpoint every 10 seconds with a 5-second timeout — Fly.io will restart the gateway automatically if it stops responding.

**Ongoing deployments** (< 5 minutes):

- If schema changed: `npx prisma migrate deploy` before `fly deploy --app ai-employee-gateway`
- `fly deploy --app ai-employee-gateway` for gateway changes
- OpenCode execution images: `fly deploy --app nexus-workers` after `docker build`

**Rollback**:

- Schema rollback: `npx prisma migrate resolve --rolled-back <migration-name>` marks a failed migration. Manual SQL rollback if needed — Prisma does not auto-rollback applied migrations.

Dashboards: [Fly.io Apps](https://fly.io/apps) | [Supabase Projects](https://supabase.com/dashboard) | [Inngest Dashboard](https://app.inngest.com)

---

### Monitoring Runbook

**Daily (< 5 minutes)**:

- Check Inngest queue depth in [Inngest Dashboard](https://app.inngest.com) — any queue with > 20 jobs warrants investigation
- Review [Inngest execution logs](https://app.inngest.com) for failed runs — check error patterns
- Check [OpenRouter dashboard](https://openrouter.ai) for cost spike vs. yesterday baseline
- Check Fly.io app health: `fly status --app ai-employee-gateway`
- Check watchdog cron last execution: query `SELECT MAX(created_at) FROM task_status_log WHERE actor = 'watchdog'` — should be within last 10 minutes. If stale > 30 minutes, investigate watchdog cron health.
- Check for tasks stuck in `Submitting` state: `SELECT id, created_at FROM tasks WHERE status = 'Submitting' AND created_at < NOW() - INTERVAL '15 minutes'` — these indicate the reverse-path SPOF; watchdog should have resolved them.

**Weekly (< 15 minutes)**:

- Review `feedback` table in Supabase: what corrections were made? Any patterns?
- Check knowledge base freshness: when was the last reindex? Any drift?
- Review escalation reasons in Slack: are the same types of issues recurring?
- Update agent versions if prompt improvements are ready

Dashboards: [Inngest Dashboard](https://app.inngest.com) | [OpenRouter](https://openrouter.ai/activity) | [Fly.io Metrics](https://fly.io/apps)

---

### Incident Runbook

Common failure modes and immediate actions:

| Symptom | First Check | Fix |
|---|---|---|
| Task stuck in "Executing" for > 4 hours | `fly logs --app nexus-workers` | Machine likely hung — `fly machine stop <id>` + redispatch |
| Triage agent posting wrong questions | Inngest execution logs for the task | Check which prompt version ran, compare to expected behavior |
| LLM API errors | [OpenRouter status page](https://status.openrouter.ai) | Likely transient — Inngest will retry. Check fallback chain is active |
| Jira webhook not firing | Jira Admin > Webhooks > Last delivery | Check webhook URL, re-test delivery |
| Supabase connection errors | [Supabase dashboard](https://supabase.com/dashboard) > Database > Metrics | Check connection pool exhaustion; may need to increase pool size |
| Tasks stuck in `Received` state (> 30 min, Inngest outage) | Check [Inngest status page](https://app.inngest.com) and Inngest Dashboard for errors | Run: `npx dispatch-task.ts --status received --since 1h` — re-sends events from Supabase `tasks.raw_event`. Inngest deduplicates by event ID. |

Dashboards: [Fly.io Logs](https://fly.io/apps) | [Inngest Dashboard](https://app.inngest.com) | [OpenRouter Status](https://status.openrouter.ai)

---

### Maintenance Runbook

**Weekly**:

- Review feedback table (10 min):

  ```sql
  SELECT feedback_type, COUNT(*)
  FROM feedback
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY feedback_type;
  ```

- If corrections > 5 for any type: draft and apply prompt update
- Create new `AGENT_VERSION` record with `changelog_note`

- Check re-dispatch patterns (10 min):

  ```sql
  -- Check re-dispatch patterns (tasks requiring multiple machine attempts)
  SELECT task_id, COUNT(*) as dispatch_count
  FROM task_status_log
  WHERE to_status = 'Executing'
  GROUP BY task_id
  HAVING COUNT(*) > 1
  ORDER BY dispatch_count DESC;
  ```

  Tasks with dispatch_count > 1 required re-dispatch. If > 10% of tasks need re-dispatch, investigate machine stability or timeout configuration.

**Monthly**:

- Reindex knowledge base for all active projects (manual trigger or verify cron ran)
- Review cost trends in [OpenRouter Dashboard](https://openrouter.ai/activity) and Supabase `executions` table:

  ```sql
  SELECT runtime_type, COUNT(*), AVG(fix_iterations)
  FROM executions
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY runtime_type;
  ```

- Update Fly.io base images if OpenCode CLI version changed

**Quarterly**:

- Review risk model weights per department: are auto-approval thresholds still appropriate?
- Assess department expansion: is Marketing ready? Should Finance begin?
- Review escalation patterns: what percentage of tasks required human intervention?

Dashboards: [Supabase Table Editor](https://supabase.com/dashboard) | [Fly.io Apps](https://fly.io/apps)

---

### Debugging Runbook

When a task produces unexpected results, trace it end-to-end:

1. **Find the task**: `SELECT id, status, created_at FROM tasks WHERE external_id = '<jira-ticket-id>'`
2. **Find the execution**: `SELECT * FROM executions WHERE task_id = '<task-id>'`
3. **Find the agent version**: `SELECT * FROM agent_versions WHERE id = '<agent_version_id>'` — check `prompt_hash` vs. current prompt
4. **View execution traces**: Open [Inngest Dashboard](https://app.inngest.com), search by `task_id` in function metadata
5. **Check Fly.io logs** (engineering only): `fly logs --app nexus-workers --instance <machine-id>`
6. **Check feedback**: `SELECT * FROM feedback WHERE task_id = '<task-id>'` — any corrections made?
7. **Cross-reference**: Does the feedback correction + agent version combo explain the behavior?

Dashboards: [Inngest Dashboard](https://app.inngest.com) | [Supabase Table Editor](https://supabase.com/dashboard) | [Fly.io Logs](https://fly.io/apps)

---

### 27.5 Local Development Setup

This setup lets you test the full pipeline locally without deploying to Fly.io or Inngest Cloud. Use this for rapid iteration during M1 and M3 development.

**Prerequisites**: Node.js 20+, Docker Desktop, Supabase CLI, GitHub CLI

#### 1. Local Supabase

```bash
supabase start          # Starts PostgreSQL, Auth, Storage locally
npx prisma migrate dev  # Applies schema migrations to local DB
```

Local Supabase dashboard: http://localhost:54323
Local DB connection: `postgresql://postgres:postgres@localhost:54322/postgres`

#### 2. Inngest Dev Server

```bash
npx inngest-cli@latest dev
```

Starts a local Inngest server at http://localhost:8288. Your Fastify app's Inngest functions are auto-discovered when you start the gateway. The dashboard shows all function executions, step-by-step traces, and event history — identical to the production Inngest dashboard.

#### 3. Event Gateway (Local)

```bash
# Start the Fastify gateway locally
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres \
INNGEST_DEV=1 \
INNGEST_SIGNING_KEY=local \
INNGEST_EVENT_KEY=local \
GITHUB_TOKEN=<your-token> \
npx ts-node src/gateway/index.ts
```

Gateway runs at http://localhost:3000. Inngest Dev Server auto-connects.

#### 4. Webhook Tunneling

To receive real Jira/GitHub webhooks locally:

```bash
# Option A: Smee (free, no account needed)
npx smee-client --url https://smee.io/<your-channel> --target http://localhost:3000/webhooks/jira

# Option B: ngrok (requires account for persistent URLs)
ngrok http 3000
```

Configure your Jira webhook to point to the Smee/ngrok URL. GitHub webhooks: same pattern.

#### 5. Mock Fly.io Machine (Local Testing)

For testing the execution agent locally without a real Fly.io machine:

```bash
# Run entrypoint.sh directly in Docker
docker build -t ai-employee-worker .
docker run --env-file .env.local \
  -e TASK_ID=<task-uuid> \
  -e REPO_URL=<your-repo> \
  -e REPO_BRANCH=main \
  ai-employee-worker
```

Or test `orchestrate.mjs` directly against a local OpenCode server (`opencode serve`).

#### Minimal `.env.local`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
SUPABASE_URL=http://localhost:54321
SUPABASE_SECRET_KEY=<from supabase start output>
INNGEST_SIGNING_KEY=local
INNGEST_EVENT_KEY=local
GITHUB_TOKEN=<your-github-pat>
JIRA_TOKEN=<your-jira-api-token>
OPENROUTER_API_KEY=<your-openrouter-key>
```

#### End-to-End Local Test Flow

1. `supabase start` → `npx prisma migrate dev`
2. `npx inngest-cli@latest dev`
3. Start Event Gateway (step 3 above)
4. Start Smee tunnel (step 4 above)
5. Send a test Jira webhook via Smee (or use `curl -X POST http://localhost:3000/webhooks/jira -d @test-payload.json`)
6. Verify event appears in Inngest Dev dashboard (http://localhost:8288)
7. Verify task record created in local Supabase (http://localhost:54323)
8. Trigger mock machine execution (step 5 above)
9. Verify task status transitions in Supabase: `Received → Executing → Submitting → Done`

---

## 28. Deferred Capabilities & Future Scale Path

> This section records the technologies and capabilities deliberately deferred for V1 in favor of speed-to-market. Each item includes what was deferred, why, when to reconsider it, and the migration path.

| Deferred Capability | What We Use Instead (V1) | What We Gave Up | When to Reconsider | Migration Path |
|---|---|---|---|---|
| **BullMQ + Redis** (self-hosted job queue) | Inngest (managed) | Full control over queue infrastructure; no vendor dependency on critical path | When Inngest costs exceed $100/mo, or if Inngest has reliability issues | Replace `inngest.createFunction()` with BullMQ producers/consumers. Business logic inside each step is unchanged. Add Upstash Redis or self-hosted Redis. ~1-2 weeks of work. |
| **LangGraph (Python)** (workflow orchestration) | Inngest step functions (TypeScript) | Python ML ecosystem; LangGraph's graph-based branching, multi-agent coordination, and sophisticated human-in-the-loop primitives | When marketing workflows need complex multi-step agent reasoning, multimodal creative generation, or ML model integration that TypeScript can't handle | Add Python workers alongside TypeScript. Marketing archetype's `runtime` field changes from `inngest` to `langgraph`. Inngest can trigger Python workers via HTTP. ~2-3 weeks. |
| **LangSmith** ($39/mo agent observability) | Inngest dashboard + Supabase logging | Deep agent trace visualization — see exact prompt/response chains, token usage per step, latency breakdown across LLM calls | When debugging agent behavior becomes difficult from logs alone — typically when agents chain 5+ LLM calls with complex tool use | Sign up for LangSmith, add `@langchain/core` tracing middleware. Wrap LLM calls with LangSmith trace context. ~1 week. |
| **Grafana** (self-hosted infra monitoring) | Fly.io + Supabase + Inngest + OpenRouter dashboards | Unified metrics view across all services; custom alerts; historical trend analysis across infrastructure | When you need cross-service correlation (e.g., "Fly.io machine CPU spike caused Supabase connection timeout") or custom SLO tracking | Deploy Grafana on Fly.io, connect data sources (Supabase metrics, Fly.io metrics API). ~2-3 days. |
| **Custom Orchestrator** (generalized orchestrate.mjs) | Inngest step functions | Fine-grained control over task scheduling, custom priority algorithms, advanced conflict detection between concurrent tasks | When Inngest's concurrency model is too coarse — e.g., you need custom priority algorithms or advanced scheduling logic. | Extract Inngest function logic into a standalone TypeScript service. Add BullMQ for queue management. Reuse orchestrate.mjs patterns from nexus-stack. ~2-3 weeks. |
| **pgvector Embedding Pipeline** (vector search for triage context) | OpenCode's native codebase search (file search, LSP, grep, AST tools) for code context. Direct SQL queries on `tasks` table for institutional memory. No vector similarity. | Semantic similarity search for triage context. Agents search by keyword/structure rather than semantic meaning. Lower recall for ambiguous tickets. | When triage agents frequently identify the wrong files or miss relevant past tasks. Track via the `feedback` table — if triage overrides exceed 30% for "wrong context" reasons, add the pipeline. | Add `knowledge_embeddings` table to Supabase, build webhook-triggered indexing (on merge to `main`), add embedding generation via OpenRouter (`text-embedding-3-small`), update triage query interface. ~2-3 days of agent work. No existing code changes — purely additive. |
| **Full API Rate Limiting** (token bucket + backpressure) | Thin API service wrappers (`jiraClient.getTicket()`, `githubClient.createPR()`) with built-in retry-on-429 logic. No proactive rate tracking. | Proactive backpressure (delaying dispatch before hitting limits), cross-worker coordination (shared rate budget), per-API monitoring dashboards. | When concurrent tasks cause cascading 429 failures, or when adding Meta Ads API (stricter limits than Jira/GitHub). At MVP volume (2-3 concurrent tasks, one project), this is unlikely. | Add token bucket middleware to the thin API wrappers (single insertion point). Add Supabase table for cross-worker bucket state. Add Slack alerts at 80% utilization. ~1.5 days of agent work. |
| **Jira Reconciliation Cron Job** (hourly webhook safety net) | Rely on Jira webhook delivery (99%+ reliable). Missed webhooks detected manually during daily monitoring. | Automatic detection and recovery of missed webhooks within 1 hour. | When task state drift is observed in production — tasks exist in Jira but not in the platform's task state store. | Add an Inngest cron function that polls Jira REST API hourly, compares against `tasks` table, and enqueues missing tasks. ~0.5 days of agent work. Standalone function with zero integration points — plug and play. |
| **Dual-language runtime** (TypeScript + Python) | TypeScript-only | Access to Python's ML ecosystem (scikit-learn, pandas, transformers), Python-native agent frameworks | When a department's work requires ML model inference, data science workflows, or Python-only API clients | Add Python Fly.io app, connect via Inngest events or HTTP. No TypeScript code changes needed — just add a new runtime option. ~1 week for infrastructure, variable for the Python code itself. |

> **Implementation Note — Nexus-Stack Completion Mechanism**: The AI Employee Platform's completion mechanism differs fundamentally from the nexus-stack pattern. The nexus-stack uses local SSE/polling: `orchestrate.mjs` monitors OpenCode session completion directly on the same machine via the `@opencode-ai/sdk` event stream. The AI Employee Platform uses remote Inngest events: the Fly.io machine sends `engineering/task.completed` to Inngest Cloud when done. This difference is intentional — Inngest provides durability and crash recovery that local monitoring cannot. The tradeoff is the reverse-path SPOF (mitigated by Supabase-first completion write + watchdog cron, see §8 and §10).

> **Recovery Script Note — `dispatch-task.ts`**: The `dispatch-task.ts` CLI script (referenced in §8) remains a valid recovery path. The watchdog cron (§10 Layer 3) is the **primary** automated recovery mechanism. `dispatch-task.ts` is the **manual fallback** for cases where the watchdog itself fails or is unavailable. Usage: `npx dispatch-task.ts --status received --since 1h` re-sends events from Supabase for tasks stuck in `Received` state; `npx dispatch-task.ts --task-id <uuid>` re-dispatches a specific task.

> **The guiding principle**: Every deferred item has a clear "when to reconsider" trigger and a concrete migration path. Nothing is permanently lost — just postponed until the evidence says it's needed. Shipping a working V1 with fewer moving parts is worth more than a theoretically perfect architecture that takes months to build.

---
