# Papi Chulo — The Summarizer AI Employee

## What is it?

Papi Chulo is an AI employee that **automatically reads your Slack channels, generates a dramatic Spanish news-style summary, and asks a human to approve it before posting it publicly** — every weekday morning.

Before this work, the platform only knew how to do one thing: receive a Jira ticket and open a GitHub pull request. Papi Chulo is the first proof that the platform is truly **generic** — new AI employees can be created by adding a database record, not writing new code.

---

## Diagram 1 — What happens every weekday morning

> **Question**: What is the end-to-end flow from cron tick to Slack message?

```mermaid
flowchart LR
    subgraph Triggers
        CRON(["Cron — 8am UTC"]):::external
    end

    subgraph Platform
        LIFE["Employee Lifecycle"]:::service
        MACHINE["Worker Machine (Fly.io)"]:::service
        DB[("Supabase DB")]:::storage
    end

    subgraph Tools
        READ["slack.readChannels"]:::service
        LLM["llm.generate"]:::service
        POST["slack.postMessage"]:::service
    end

    subgraph Slack
        APPROVAL(["Approval Message"]):::event
        PUBLISHED(["Published Summary"]):::event
    end

    CRON ==>|"1. Fire daily trigger"| LIFE
    LIFE ==>|"2. Spin up worker"| MACHINE
    MACHINE -->|"3. Read archetype config"| DB
    MACHINE ==>|"4. Run step 1"| READ
    READ -.->|"fetch channel history"| Slack
    MACHINE ==>|"5. Run step 2"| LLM
    MACHINE ==>|"6. Run step 3"| POST
    POST ==>|"7. Post for approval"| APPROVAL
    APPROVAL -.->|"8. Human clicks Approve"| LIFE
    LIFE ==>|"9. Publish summary"| PUBLISHED

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
```

| #   | What happens          | Details                                                                               |
| --- | --------------------- | ------------------------------------------------------------------------------------- |
| 1   | Cron fires            | Inngest runs `0 8 * * 1-5` (weekdays at 8am UTC)                                      |
| 2   | Spin up worker        | Lifecycle creates a Fly.io machine with the generic harness command                   |
| 3   | Read archetype config | Worker reads its job description from the database (Papi Chulo persona, steps, model) |
| 4   | Read Slack channels   | Step 1: fetches last 24h of messages from configured channels                         |
| 5   | Generate summary      | Step 2: sends messages to the LLM with Papi Chulo's dramatic Spanish persona prompt   |
| 6   | Post for approval     | Step 3: posts the summary to a target channel with Approve/Reject buttons             |
| 7   | Human sees it         | A human reads the summary in Slack                                                    |
| 8   | Human approves        | Clicks the Approve button → Slack sends an interaction event to the gateway           |
| 9   | Publish               | Lifecycle receives approval, posts the final summary to the public channel            |

---

## Diagram 2 — How the platform knows what Papi Chulo should do

> **Question**: Where does the "job description" live, and how does the worker read it?

```mermaid
flowchart TD
    subgraph Database
        ARCH[("Archetype Record")]:::storage
        TASK[("Task Record")]:::storage
    end

    subgraph Archetype Record Fields
        PERSONA["system_prompt — Papi Chulo persona"]:::service
        STEPS["steps — ordered tool calls"]:::service
        MODEL["model — which LLM to use"]:::service
        RISK["risk_model — approval required: true"]:::service
    end

    subgraph Worker
        HARNESS["Generic Harness"]:::service
        RESOLVER["Param Resolver"]:::service
        REGISTRY["Tool Registry"]:::service
    end

    ARCH -->|"1. Contains"| PERSONA
    ARCH -->|"1. Contains"| STEPS
    ARCH -->|"1. Contains"| MODEL
    ARCH -->|"1. Contains"| RISK
    HARNESS -->|"2. Reads archetype at boot"| ARCH
    HARNESS -->|"3. Loops through steps"| RESOLVER
    RESOLVER -->|"4. Resolves params"| REGISTRY
    REGISTRY -->|"5. Calls the right tool"| HARNESS
    HARNESS -->|"6. Writes result"| TASK

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage fill:#7B68EE,stroke:#5B4BC7,color:#fff
```

| #   | What happens            | Details                                                                                                                                            |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Archetype record        | A single DB row defines everything: persona prompt, which tools to run in which order, which LLM model, whether human approval is required         |
| 2   | Worker reads it at boot | The generic harness (a single TypeScript file) reads this record on startup — it doesn't know it's Papi Chulo until that moment                    |
| 3   | Loop through steps      | Each step says "call tool X with params Y"                                                                                                         |
| 4   | Resolve params          | Params can reference env vars (`$DAILY_SUMMARY_CHANNELS`), previous step output (`$prev_result`), or archetype fields (`$archetype.system_prompt`) |
| 5   | Call the right tool     | The tool registry is a map of tool names → implementations                                                                                         |
| 6   | Write result            | Summary text is stored to the task's deliverable record                                                                                            |

---

## Diagram 3 — What's generic vs. what's Papi Chulo-specific

> **Question**: What's reusable for any future employee vs. what's unique to Papi Chulo?

```mermaid
flowchart TD
    subgraph Generic Platform - Reused by ALL employees
        GW["Express Gateway"]:::service
        LIFE["Employee Lifecycle"]:::service
        HARNESS["Generic Harness"]:::service
        REGISTRY["Tool Registry"]:::service
        RESOLVER["Param Resolver"]:::service
        CRON_INFRA["Trigger Infrastructure"]:::service
    end

    subgraph Papi Chulo-Specific - Just a DB record
        SEED["daily-summarizer archetype"]:::external
        PERSONA2["Papi Chulo system prompt"]:::external
        STEPS2["3 steps: read → generate → post"]:::external
        CHANNELS["Channel IDs in .env"]:::external
    end

    SEED -.->|"configured in"| LIFE
    SEED -.->|"read by"| HARNESS
    PERSONA2 -.->|"field on"| SEED
    STEPS2 -.->|"field on"| SEED
    CHANNELS -.->|"resolved at runtime by"| RESOLVER

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
```

**The key design principle**: everything in the blue box was built once and works for any employee. Everything in the orange box is just configuration — if you wanted a "Daily Standup Summarizer" or a "Sales Report Employee", you'd add a new DB record and point it at existing tools. No new code.

---

## What was changed in the codebase

| Area         | What changed                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gateway**  | Migrated from Fastify → Express + added Slack Bolt for handling Approve/Reject button clicks                                                  |
| **Database** | Added config fields to the `archetypes` table; added `content` and `metadata` to `deliverables`; new statuses `Failed` and `AwaitingApproval` |
| **Tools**    | Three new platform tools: `slack.readChannels`, `llm.generate`, `slack.postMessage`                                                           |
| **Worker**   | New `generic-harness.mts` — the single file all non-engineering employees run                                                                 |
| **Inngest**  | New `employee-lifecycle` function (generic); new `trigger/daily-summarizer` cron function                                                     |
| **Seed**     | Added Operations department + Papi Chulo archetype record with full persona                                                                   |
| **Tests**    | 843 tests passing; 4 new test files for the new tools and lifecycle                                                                           |
| **Docs**     | `AGENTS.md` updated to explain how to add future employees                                                                                    |
