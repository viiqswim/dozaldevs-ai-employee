> **Last updated:** 2026-06-07

# Current Architecture

**Question this diagram answers:** How does a trigger become a completed AI employee task?

```mermaid
flowchart LR
    subgraph Triggers["Triggers"]
        SLACK(["Slack @mention"]):::external
        WEBHOOK(["Webhooks (Hostfully / GitHub / Jira)"]):::external
        CRON(["Cron / Admin API"]):::external
    end

    subgraph PlatformCore["Platform Core"]
        GW["Gateway (Express :7700)"]:::service
        DASH["Dashboard (React SPA)"]:::service
        INN["Inngest (:8288)"]:::service
        DB[("PostgreSQL")]:::storage
        PGREST["PostgREST (:54331)"]:::storage
    end

    subgraph WorkerRuntime["Worker Runtime (Docker / Fly.io)"]
        HARNESS["OpenCode Harness"]:::service
        TOOLS["Shell Tools (/tools/)"]:::service
    end

    subgraph LLMRouting["LLM Routing"]
        OPENROUTER["OpenRouter"]:::external
        GOLLM["OpenCodeGo (flat $10/mo)"]:::external
    end

    subgraph ApprovalGate["Approval Gate"]
        CARD(["Slack Approval Card"]):::event
        PM(["PM: Approve / Reject"]):::decision
    end

    EXTAPI(["External APIs (Slack / Hostfully / Google)"]):::external

    SLACK -.->|"1. app_mention"| GW
    WEBHOOK -.->|"1. webhook"| GW
    CRON -.->|"1. trigger"| GW

    GW ==>|"2. task.dispatched"| INN
    GW <-->|"Prisma"| DB
    DASH <-->|"via Gateway proxy"| GW

    INN ==>|"3. provision"| HARNESS
    HARNESS <-->|"PostgREST"| PGREST
    PGREST <-->| | DB

    HARNESS ==>|"4. run tools"| TOOLS
    TOOLS -.->|"5. call"| EXTAPI

    HARNESS -.->|"model request"| OPENROUTER
    HARNESS -.->|"model request (if OPENCODE_GO_API_KEY set)"| GOLLM

    HARNESS ==>|"6. post card"| CARD
    CARD ==>|"7. PM reviews"| PM
    PM ==>|"8. approve"| INN
    PM -.->|"reject"| INN

    INN ==>|"9. deliver"| EXTAPI

    classDef service  fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef storage  fill:#7B68EE,stroke:#5B4BC7,color:#fff
    classDef external fill:#F5A623,stroke:#C4841A,color:#fff
    classDef event    fill:#50C878,stroke:#2D7A4A,color:#fff
    classDef decision fill:#F8E71C,stroke:#C7B916,color:#333
```

## Flow Walkthrough

| #   | What happens         | Details                                                                                                                                                                                                           |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Trigger arrives      | A Slack @mention (Socket Mode WebSocket), an inbound webhook (Hostfully `NEW_INBOX_MESSAGE`, GitHub push, Jira event), or a manual admin API call / cron fires. All paths land at the Gateway.                    |
| 2   | Task dispatched      | Gateway creates a `tasks` row via Prisma and emits `employee/task.dispatched` to Inngest. The universal lifecycle function picks it up and transitions the task through `Received → Ready`.                       |
| 3   | Worker provisioned   | Inngest triggers the OpenCode Harness in a Docker container (local) or Fly.io machine (prod). The harness reads the archetype from DB via PostgREST, compiles the AGENTS.md file, and starts an OpenCode session. |
| 4   | Tools executed       | The OpenCode session calls shell tools at `/tools/` (TypeScript scripts run via `tsx`). Tools cover Slack, Hostfully, Sifely, Jira, Knowledge Base, Notion, Platform, GitHub, and Google.                         |
| 5   | External APIs called | Shell tools make authenticated calls to external services. Credentials come from `tenant_secrets` in the DB, injected at harness startup via `loadTenantEnv()`.                                                   |
| 6   | Approval card posted | When work is complete, the worker calls `submit-output.ts` which writes `/tmp/approval-message.json`. The harness reads this and posts a Slack Block Kit approval card.                                           |
| 7   | PM reviews           | The PM sees the card in Slack and clicks Approve, Edit & Send, or Reject. The Slack action hits the Gateway via Socket Mode.                                                                                      |
| 8   | Approval received    | Gateway emits `employee/approval.received` to Inngest. On approve, the lifecycle transitions to `Delivering`. On reject, it transitions to `Failed`.                                                              |
| 9   | Delivery             | A delivery container runs the archetype's `delivery_steps`, sending the final output (Slack message, Hostfully reply, etc.) to the appropriate external API.                                                      |

## Key Design Decisions

**Two DB access paths:** The Gateway uses Prisma (direct PostgreSQL connection) for writes during task creation and lifecycle management. Worker containers use PostgREST (REST API at `:54331`) because they run in isolated Docker/Fly.io environments without direct DB access.

**OpenCodeGo routing:** When `OPENCODE_GO_API_KEY` is set, the harness routes compatible models (14 models, see `src/lib/go-models.ts`) through OpenCodeGo at a flat $10/month subscription instead of per-token OpenRouter pricing. Incompatible models fall back to OpenRouter automatically.

**Approval gate is optional:** Controlled per-archetype via `risk_model.approval_required`. When `false`, the lifecycle skips steps 6-8 and goes straight from `Submitting` to `Delivering`.

**Socket Mode (no public webhook URL needed):** Slack events arrive via a persistent WebSocket connection managed by Bolt. No ngrok or public URL required for Slack integration in local dev.
