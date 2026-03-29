# Phase 4: Execution Infrastructure — Architecture & Implementation

## What This Document Is

This document describes everything built during Phase 4 of the AI Employee Platform: the shared utilities, LLM gateway, API wrappers, Docker image, and boot sequence that form the execution layer between the Inngest lifecycle function and the Fly.io worker. Phase 4 produces no new HTTP endpoints and no new Inngest functions — it builds the infrastructure that Phase 5's orchestration loop will run on top of.

---

## What Was Built

```mermaid
flowchart LR
    subgraph Phase 4 - Completed
        RETRY["withRetry()\n(src/lib/retry.ts)"]:::service
        ERRORS["Custom Error Types\n(src/lib/errors.ts)"]:::service
        LLM["callLLM()\n(src/lib/call-llm.ts)"]:::service
        JIRA["jiraClient\n(src/lib/jira-client.ts)"]:::service
        GH["githubClient\n(src/lib/github-client.ts)"]:::service
        SLACK["slackClient\n(src/lib/slack-client.ts)"]:::service
        DOCKER["Dockerfile\n(multi-stage)"]:::service
        BOOT["entrypoint.sh\n(8-step boot)"]:::service
    end

    subgraph Future Phases
        ORCH["orchestrate.mjs\n(Phase 5)"]:::future
        SESS["OpenCode Sessions\n(Phase 5)"]:::future
        VALID["Validation Pipeline\n(Phase 5)"]:::future
    end

    RETRY ==>|"1. Wraps all API calls"| LLM
    RETRY ==>|"2. Wraps all API calls"| JIRA
    RETRY ==>|"3. Wraps all API calls"| GH
    RETRY ==>|"4. Wraps all API calls"| SLACK
    ERRORS ==>|"5. Typed failures"| LLM
    LLM -.->|"6. Powers"| ORCH
    JIRA -.->|"7. Used by"| ORCH
    GH -.->|"8. Used by"| ORCH
    BOOT -.->|"9. Hands off to"| ORCH
    ORCH -.->|"10. Manages"| SESS
    ORCH -.->|"11. Runs"| VALID

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
```

| #   | What happens          | Details                                                                                                                                                        |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1-4 | Retry wraps API calls | `withRetry()` is the standard wrapper for all external calls. Exponential backoff with a `retryOn` predicate to distinguish retryable from permanent failures. |
| 5   | Typed failures        | Four error classes cover every failure mode: `LLMTimeoutError`, `CostCircuitBreakerError`, `RateLimitExceededError`, `ExternalApiError`.                       |
| 6   | LLM gateway           | `callLLM()` wraps OpenRouter with timeout enforcement, rate-limit retries, cost tracking, and a daily spend circuit breaker.                                   |
| 7-8 | API wrappers          | Thin `fetch`-only clients for Jira, GitHub, and Slack. No SDKs. Each uses the same retry infrastructure and throws the same two error types.                   |
| 9   | Boot sequence         | `entrypoint.sh` runs 8 idempotent steps: auth, clone, branch, deps, Docker daemon, task context, heartbeat, handoff.                                           |
| 10  | OpenCode sessions     | Phase 5 adds `orchestrate.mjs` — Step 8 will `exec node` into it instead of exiting cleanly.                                                                   |
| 11  | Validation pipeline   | Phase 5 adds TypeScript type-check, lint, unit tests, integration tests, and E2E tests as a post-execution validation pass.                                    |

---

## Project Structure

```
ai-employee/
├── src/
│   └── lib/
│       ├── retry.ts               # withRetry() — exponential backoff with retryOn predicate
│       ├── errors.ts              # LLMTimeoutError, CostCircuitBreakerError, RateLimitExceededError, ExternalApiError
│       ├── call-llm.ts            # callLLM() — OpenRouter wrapper with timeout, retry, cost tracking
│       ├── jira-client.ts         # createJiraClient() — getIssue, addComment, transitionIssue
│       ├── github-client.ts       # createGithubClient() — createPR, listPRs, getPR
│       └── slack-client.ts        # createSlackClient() — postMessage
├── tests/
│   └── lib/
│       ├── retry.test.ts          # 14 tests
│       ├── errors.test.ts         # 12 tests
│       ├── call-llm.test.ts       # 28 tests
│       ├── jira-client.test.ts    # 32 tests
│       ├── github-client.test.ts  # 36 tests
│       └── slack-client.test.ts   # 24 tests
├── scripts/
│   └── verify-container-boot.sh  # Integration test for the full boot sequence
├── Dockerfile                     # Multi-stage build: builder + production
├── entrypoint.sh                  # 8-step idempotent boot sequence
├── tsconfig.build.json            # Emit config for Docker builds (extends tsconfig.json)
└── .env.example                   # Phase 4 variables added under dedicated block
```

---

## Foundation Utilities

### Build Strategy

The project uses two TypeScript configs with distinct purposes.

`tsconfig.json` is the development config. It sets `"noEmit": true`, which means the compiler type-checks your code but never writes any `.js` files to disk. This is what your editor and `pnpm tsc --noEmit` use.

`tsconfig.build.json` is the Docker/production config. It extends `tsconfig.json` but overrides `noEmit` to `false`, sets `rootDir` to `src/`, and writes compiled output to `dist/`. Test files and spec files are excluded from the build output.

```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "**/*.test.ts", "**/*.spec.ts", "supabase"]
}
```

| Command             | Config used           | Output                  |
| ------------------- | --------------------- | ----------------------- |
| `pnpm tsc --noEmit` | `tsconfig.json`       | None — type errors only |
| `pnpm build`        | `tsconfig.build.json` | `dist/` — compiled JS   |

The separation keeps the dev loop fast (no file I/O during type-checking) while giving Docker a clean, test-free build artifact.

---

### Retry Utility (`src/lib/retry.ts`)

`withRetry` wraps any async function and re-runs it on failure using exponential backoff. It's the standard wrapper for all external API calls in Phase 4.

**Signature**

```typescript
async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
```

**`RetryOptions` interface**

| Option        | Type                          | Default      | Description                                     |
| ------------- | ----------------------------- | ------------ | ----------------------------------------------- |
| `maxAttempts` | `number`                      | `3`          | Total attempts before throwing                  |
| `baseDelayMs` | `number`                      | `1000`       | Base delay for backoff calculation              |
| `retryOn`     | `(error: unknown) => boolean` | `() => true` | Predicate — return `false` to abort immediately |

**Backoff schedule** (with defaults: `baseDelayMs = 1000`, `maxAttempts = 3`)

| Attempt   | Delay before next attempt |
| --------- | ------------------------- |
| 1 (fails) | 1000ms (`1000 * 2^0`)     |
| 2 (fails) | 2000ms (`1000 * 2^1`)     |
| 3 (fails) | none — throws `lastError` |

No delay is added after the final attempt. The formula is `baseDelayMs * 2^attempt` where `attempt` is 0-indexed.

**Usage example**

```typescript
import { withRetry } from '../lib/retry.js';
import { RateLimitExceededError } from '../lib/errors.js';

const result = await withRetry(() => openRouterClient.chat(payload), {
  maxAttempts: 3,
  baseDelayMs: 1000,
  retryOn: (err) => err instanceof RateLimitExceededError,
});
```

Passing a `retryOn` predicate lets callers distinguish retryable errors (rate limits, transient network failures) from permanent ones (auth errors, malformed requests) that should fail immediately without burning retry attempts.

---

### Custom Error Types (`src/lib/errors.ts`)

Four typed error classes cover the failure modes of Phase 4's external integrations. All extend `Error` and set `this.name` explicitly so `instanceof` checks survive serialization.

| Error class               | Thrown when                                        | Key properties                                                      |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| `LLMTimeoutError`         | `callLLM()` exceeds the configured timeout         | `timeoutMs: number`, `model: string`                                |
| `CostCircuitBreakerError` | Daily LLM spend for a department exceeds its limit | `department: string`, `currentSpendUsd: number`, `limitUsd: number` |
| `RateLimitExceededError`  | All retry attempts exhausted on a 429 response     | `service: string`, `attempts: number`, `retryAfterMs?: number`      |
| `ExternalApiError`        | An external API returns a non-2xx, non-429 error   | `service: string`, `statusCode: number`, `endpoint: string`         |

`CostCircuitBreakerError` is the only error that carries both the current spend and the configured limit — callers can log the exact overage without re-querying the database. `RateLimitExceededError.retryAfterMs` is optional because not all APIs include a `Retry-After` header.

---

### Environment Variables

All Phase 4 variables are declared in `.env.example` under the `# Phase 4 — Execution Infrastructure` block. Earlier variables (database, Supabase, Jira/GitHub webhooks, Inngest) were established in prior phases.

| Variable                          | Default / Example                   | Description                                                                           |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`              | `your-openrouter-api-key`           | API key for OpenRouter — routes LLM calls to Claude, GPT-4, etc.                      |
| `GITHUB_TOKEN`                    | `your-github-personal-access-token` | PAT for GitHub API — used by the execution agent to open PRs and read repos           |
| `JIRA_API_TOKEN`                  | `your-jira-api-token`               | Atlassian API token for Jira REST API calls                                           |
| `JIRA_BASE_URL`                   | `https://your-domain.atlassian.net` | Base URL for your Jira Cloud instance                                                 |
| `JIRA_USER_EMAIL`                 | `your-email@example.com`            | Email paired with `JIRA_API_TOKEN` for Basic Auth                                     |
| `SLACK_BOT_TOKEN`                 | `xoxb-your-slack-bot-token`         | Bot token for posting Slack notifications                                             |
| `SLACK_CHANNEL_ID`                | `C0123456789`                       | Target Slack channel for execution status messages                                    |
| `COST_LIMIT_USD_PER_DEPT_PER_DAY` | `50`                                | Daily LLM spend cap per department — triggers `CostCircuitBreakerError` when exceeded |

`COST_LIMIT_USD_PER_DEPT_PER_DAY` is read as a string and parsed to a number at runtime. The default of `50` is a conservative starting point — adjust per department based on actual usage patterns.

---

## LLM Gateway (`src/lib/call-llm.ts`)

The single entry point for all LLM calls in Phase 4. It wraps OpenRouter's chat completions API with timeout enforcement, rate-limit retries, cost tracking, and a daily spend circuit breaker.

### Interface Contract

**`CallLLMOptions`**

| Field         | Type                                  | Default     | Description                                                                                       |
| ------------- | ------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `model`       | `string`                              | required    | OpenRouter model ID, e.g. `"anthropic/claude-sonnet-4-6"`                                         |
| `messages`    | `Message[]`                           | required    | Conversation history. Each message has `role` (`'user' \| 'assistant' \| 'system'`) and `content` |
| `taskType`    | `'triage' \| 'execution' \| 'review'` | required    | Logical task category — used for routing decisions and logging                                    |
| `taskId`      | `string`                              | `undefined` | Optional execution ID for tracing                                                                 |
| `temperature` | `number`                              | `0`         | Sampling temperature. `0` gives deterministic output                                              |
| `maxTokens`   | `number`                              | `undefined` | Cap on completion tokens. Omit to use the model's default                                         |
| `timeoutMs`   | `number`                              | `120_000`   | Milliseconds before the request is aborted                                                        |

**`CallLLMResult`**

| Field              | Type     | Description                                                                    |
| ------------------ | -------- | ------------------------------------------------------------------------------ |
| `content`          | `string` | The model's text response                                                      |
| `model`            | `string` | Actual model used — may differ from the requested model if OpenRouter reroutes |
| `promptTokens`     | `number` | Input tokens consumed                                                          |
| `completionTokens` | `number` | Output tokens generated                                                        |
| `estimatedCostUsd` | `number` | Calculated cost in USD (see Cost Tracking below)                               |
| `latencyMs`        | `number` | Wall-clock time from request start to response received                        |

### Usage Example

```typescript
const result = await callLLM({
  model: 'anthropic/claude-sonnet-4-6',
  messages: [{ role: 'user', content: 'Write a TypeScript function...' }],
  taskType: 'execution',
  taskId: 'task-uuid',
});
console.log(result.content);
console.log(`Cost: $${result.estimatedCostUsd.toFixed(4)}`);
```

### Retry Behavior

HTTP 429 responses from OpenRouter are converted to `RateLimitExceededError` by `fetchWithRateLimitCheck`, then caught by `withRetry`. The retry schedule uses the defaults from `retry.ts`: 3 total attempts with exponential backoff at 1s, 2s, and 4s between attempts. After all attempts are exhausted, `withRetry` re-throws the last `RateLimitExceededError` and `callLLM` propagates it to the caller.

### Timeout Behavior

An `AbortController` is created per call. A `setTimeout` fires `controller.abort()` after `timeoutMs` (default 120 seconds). If the fetch is aborted, the resulting `AbortError` is caught and re-thrown as `LLMTimeoutError` with the configured `timeoutMs` and `model` attached. The timeout handle is always cleared in the `finally` block, even on success.

### Cost Circuit Breaker

Before every LLM call, `checkCostCircuitBreaker` queries the `executions` table for the sum of `estimated_cost_usd` over the past 24 hours. The result is cached in memory for 5 minutes (`CACHE_TTL_MS = 300_000ms`) to avoid a database hit on every call. If the cached total exceeds the configured limit, `CostCircuitBreakerError` is thrown immediately and no API request is made.

The limit is read from `COST_LIMIT_USD_PER_DEPT_PER_DAY` at runtime, defaulting to `$50`. The error carries `currentSpendUsd` and `limitUsd` so callers can log the exact overage.

### Cost Tracking

Pricing is stored in a static `PRICING_PER_1M_TOKENS` map:

| Model                         | Prompt (per 1M tokens) | Completion (per 1M tokens) |
| ----------------------------- | ---------------------- | -------------------------- |
| `anthropic/claude-sonnet-4-6` | $3.00                  | $15.00                     |
| `anthropic/claude-opus-4-6`   | $15.00                 | $75.00                     |
| `openai/gpt-4o`               | $2.50                  | $10.00                     |
| `openai/gpt-4o-mini`          | $0.15                  | $0.60                      |

The formula applied after each successful call:

```
estimatedCostUsd = (promptTokens × promptPrice + completionTokens × completionPrice) / 1_000_000
```

If the requested model isn't in the map, `estimatedCostUsd` is `0`. This is intentional — unknown models don't block execution, they just don't contribute to the circuit breaker's spend total.

### Model Selection by Task Type

| Task type   | Recommended model             | Rationale                                             |
| ----------- | ----------------------------- | ----------------------------------------------------- |
| `triage`    | `openai/gpt-4o-mini`          | Low-complexity classification; cost matters at volume |
| `execution` | `anthropic/claude-sonnet-4-6` | Strong code generation and reasoning at moderate cost |
| `review`    | `anthropic/claude-sonnet-4-6` | Nuanced diff analysis; same tier as execution         |

These are conventions, not enforced constraints. `callLLM` accepts any OpenRouter model ID.

### What's NOT in Phase 4

- **Claude Max routing** — no special handling for Claude's extended context tiers
- **Fallback chain** — no automatic fallback from Claude to GPT-4o to GPT-4o-mini on failure
- **Streaming responses** — `callLLM` waits for the full completion before returning; no `ReadableStream` support

---

## API Wrappers

Three thin clients wrap the Jira, GitHub, and Slack APIs. Each follows the same factory pattern, uses the same retry infrastructure, and throws the same two error types. No SDKs — native `fetch` only.

### Architecture

Each client is created by a `createXClient(config)` factory function that returns a typed interface. The factory closes over the config, so callers never touch credentials directly after construction.

All three clients pass their inner request function through `withRetry()` with `retryOn: (e) => e instanceof RateLimitExceededError`. Only rate limit errors trigger retries. Auth failures, malformed requests, and other 4xx errors throw `ExternalApiError` immediately without burning retry attempts.

Two error types cover every failure path:

- `RateLimitExceededError` — thrown when all retry attempts are exhausted on a rate limit response. Carries `retryAfterMs` where the API provides a `Retry-After` header.
- `ExternalApiError` — thrown for any non-retryable API error. Carries `statusCode` and `endpoint`.

---

### `jiraClient` (`src/lib/jira-client.ts`)

**Auth:** Basic auth. The `email` and `apiToken` from config are concatenated as `email:apiToken`, base64-encoded with `btoa()`, and sent as `Authorization: Basic <encoded>` on every request.

**API:** Jira Cloud REST API v3 only (`/rest/api/3/...`).

**Methods:**

| Method            | Signature                                                                | Endpoint                                        | Success status |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------------------- | -------------- |
| `getIssue`        | `getIssue(issueKey: string): Promise<JiraIssue>`                         | `GET /rest/api/3/issue/{issueKey}`              | 200            |
| `addComment`      | `addComment(issueKey: string, body: string): Promise<void>`              | `POST /rest/api/3/issue/{issueKey}/comment`     | 201            |
| `transitionIssue` | `transitionIssue(issueKey: string, transitionId: string): Promise<void>` | `POST /rest/api/3/issue/{issueKey}/transitions` | 204            |

`addComment` sends the body as Atlassian Document Format (ADF) — a `doc` node wrapping a `paragraph` wrapping a `text` node. The raw string you pass becomes the `text.text` value.

Rate limit detection is straightforward: HTTP 429 throws `RateLimitExceededError` with `retryAfterMs` parsed from the `Retry-After` header (converted from seconds to milliseconds). Any other 4xx or 5xx throws `ExternalApiError`.

---

### `githubClient` (`src/lib/github-client.ts`)

**Auth:** Bearer token. Sent as `Authorization: Bearer <token>` with `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`.

**Rate limit detection (critical):** GitHub uses two different status codes for rate limits. Secondary rate limits return 429. Primary rate limits return 403 with `X-RateLimit-Remaining: 0`. The `isRateLimit()` helper checks both:

```
429                                    → rate limit
403 + X-RateLimit-Remaining === "0"    → rate limit
403 (any other reason)                 → ExternalApiError
```

`retryAfterMs` is derived from the `X-RateLimit-Reset` header, which GitHub sends as a Unix epoch timestamp in seconds. The client converts it to milliseconds-from-now: `(resetEpochSeconds * 1000) - Date.now()`.

**Methods:**

| Method     | Signature                                             | Endpoint                                       |
| ---------- | ----------------------------------------------------- | ---------------------------------------------- |
| `createPR` | `createPR(params: CreatePRParams): Promise<GitHubPR>` | `POST /repos/{owner}/{repo}/pulls`             |
| `listPRs`  | `listPRs(params: ListPRsParams): Promise<GitHubPR[]>` | `GET /repos/{owner}/{repo}/pulls`              |
| `getPR`    | `getPR(params: GetPRParams): Promise<GitHubPR>`       | `GET /repos/{owner}/{repo}/pulls/{pullNumber}` |

`listPRs` accepts optional `state` (`'open' | 'closed' | 'all'`) and `head` (branch filter) params, appended as query string.

---

### `slackClient` (`src/lib/slack-client.ts`)

**Auth:** Bearer bot token. Sent as `Authorization: Bearer <botToken>`.

**Critical behavior:** Slack's Web API always returns HTTP 200, even when the call fails. The actual success or failure is in the JSON body's `ok` field. The client reads the response body and throws `ExternalApiError` if `data.ok === false`, using `data.error` as the message.

The one exception: HTTP 429 is still a real rate limit and is handled before reading the body. `retryAfterMs` comes from the `Retry-After` header (seconds to milliseconds).

**Method:**

`postMessage(params: SlackMessageParams): Promise<SlackMessageResult>`

Posts to `chat.postMessage`. The `channel` field in params is optional — if omitted, the client falls back to `config.defaultChannel`. Supports optional `blocks` for rich message formatting. Returns `{ ts, channel }` on success.

---

### Shared Patterns

All three clients use identical retry configuration:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| `maxAttempts`    | 3                                            |
| `baseDelayMs`    | 1000ms                                       |
| Backoff schedule | 1s, 2s, 4s                                   |
| `retryOn`        | `(e) => e instanceof RateLimitExceededError` |

`retryAfterMs` is included in `RateLimitExceededError` where the API provides timing information. Jira and Slack use `Retry-After` (seconds). GitHub uses `X-RateLimit-Reset` (Unix epoch). When the header is absent, `retryAfterMs` is `undefined` and `withRetry` falls back to its exponential backoff schedule.

---

### Configuration

| Environment variable | Used by        | Description                                                                    |
| -------------------- | -------------- | ------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`       | `githubClient` | Personal access token for GitHub REST API                                      |
| `JIRA_API_TOKEN`     | `jiraClient`   | Atlassian API token for Basic auth                                             |
| `JIRA_BASE_URL`      | `jiraClient`   | Base URL of your Jira Cloud instance, e.g. `https://your-domain.atlassian.net` |
| `JIRA_USER_EMAIL`    | `jiraClient`   | Email address paired with `JIRA_API_TOKEN` for Basic auth                      |
| `SLACK_BOT_TOKEN`    | `slackClient`  | Bot token (`xoxb-...`) for posting messages                                    |
| `SLACK_CHANNEL_ID`   | `slackClient`  | Default channel ID when `postMessage` is called without an explicit channel    |

---

## Docker Image & Boot Sequence

### Multi-Stage Build

The Dockerfile uses two stages to keep the production image lean.

**Stage 1 — `builder` (`node:20-slim`):** Installs all dependencies (including devDependencies), generates the Prisma client, then compiles TypeScript using `tsconfig.build.json`. After compilation, it re-runs `pnpm install --frozen-lockfile --prod` to prune devDependencies from `node_modules`.

**Stage 2 — production (`node:20-slim`):** Copies only the compiled `dist/` output and the pruned `node_modules/` from the builder stage. Installs runtime tools via `apt` and `npm`, then sets `entrypoint.sh` as the container entrypoint.

The multi-stage approach means devDependencies (TypeScript, ts-node, test frameworks, etc.) never land in the final image. Prisma client generation happens in the builder stage where the full schema and generator are available — generating it in the production stage would require copying the entire `prisma/` directory and running `prisma generate` at boot, which is slower and error-prone.

### Installed Tools

| Tool           | Version               | Purpose                                          |
| -------------- | --------------------- | ------------------------------------------------ |
| Node.js        | 20 (base image)       | JavaScript runtime                               |
| pnpm           | via `corepack enable` | Package manager for workspace deps               |
| git            | apt                   | Repo clone and branch operations                 |
| curl, jq, bash | apt                   | HTTP calls and JSON parsing in entrypoint.sh     |
| fuse-overlayfs | apt                   | Overlay filesystem for rootless Docker on Fly.io |
| uidmap         | apt                   | User namespace mapping for rootless Docker       |
| gh CLI         | 2.45.0                | GitHub API calls (PR creation, auth)             |
| opencode-ai    | 1.3.3                 | OpenCode agent CLI                               |

### `TARGETARCH` Build Arg

The production stage declares `ARG TARGETARCH` before the `gh` CLI download. The download URL includes `${TARGETARCH}` in the filename, so the same Dockerfile builds correctly on both `arm64` (Apple Silicon dev machines) and `amd64` (Fly.io production VMs) without any manual branching.

### Image Size

~1.42 GB. The bulk comes from Node.js, the global `opencode-ai` install, and the `gh` CLI binary.

---

### Boot Sequence (`entrypoint.sh`)

The entrypoint runs 8 steps in order. Every step is idempotent: a flag file at `/tmp/.boot-flags/.step-N-done` is written on success, and the step is skipped on any subsequent run. This makes the container safe to restart mid-boot without re-running completed work.

```mermaid
flowchart TD
    START(["Container starts"]):::event
    S1["Step 1: Auth tokens\nWrite ~/.git-credentials, gh auth login"]:::service
    S2["Step 2: Shallow clone\ngit clone --depth=2 $REPO_URL /workspace"]:::service
    S3["Step 3: Task branch checkout\ngit checkout -b $TASK_BRANCH"]:::service
    S4["Step 4: Install deps\npnpm install --frozen-lockfile"]:::service
    S5["Step 5: Docker daemon\ndockerd-rootless.sh (if ENABLE_DOCKER_DAEMON)"]:::service
    S6["Step 6: Read task context\nGET Supabase /rest/v1/tasks?id=eq.$TASK_ID"]:::service
    S7["Step 7: Write heartbeat\nPOST Supabase /rest/v1/executions status=running"]:::service
    S8["Step 8: Handoff\nexec node /app/dist/workers/orchestrate.mjs"]:::service
    ORCH(["orchestrate.mjs\n(Phase 5)"]):::future

    START ==>|"1. Begin boot"| S1
    S1 ==>|"2. Credentials ready"| S2
    S2 ==>|"3. Repo cloned"| S3
    S3 ==>|"4. Branch ready"| S4
    S4 ==>|"5. Deps installed"| S5
    S5 ==>|"6. Daemon up"| S6
    S6 ==>|"7. Context loaded"| S7
    S7 ==>|"8. Heartbeat written"| S8
    S8 -.->|"9. Hands off to"| ORCH

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef event fill:#50C878,stroke:#2D7A4A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
```

| Step | Name                 | Idempotent?     | Notes                                                                                                                                                      |
| ---- | -------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Auth tokens          | Yes (flag file) | Writes `~/.git-credentials` and `~/.netrc` from `$GITHUB_TOKEN`, then runs `gh auth login --with-token`. Skipped if `GITHUB_TOKEN` is unset.               |
| 2    | Shallow clone        | Yes (flag file) | `git clone --depth=2 $REPO_URL /workspace`. Retries 3x with 5s delay. Fails hard after 3 failures.                                                         |
| 3    | Task branch checkout | Yes (flag file) | `git checkout -b $TASK_BRANCH`. If the branch already exists on the remote, checks it out from `origin/$TASK_BRANCH`. No-op if `TASK_BRANCH` is unset.     |
| 4    | Install deps         | Yes (flag file) | `pnpm install --frozen-lockfile` in `/workspace`. Retries 3x. Writes a sentinel file at `node_modules/.install-done`.                                      |
| 5    | Docker daemon        | Yes (flag file) | Starts `dockerd-rootless.sh` in the background. Only runs if `$ENABLE_DOCKER_DAEMON` is set. Warns and continues if the daemon fails to start.             |
| 6    | Read task context    | Yes (flag file) | `GET $SUPABASE_URL/rest/v1/tasks?id=eq.$TASK_ID` and writes the response to `/workspace/.task-context.json`. Retries 3x. Fails hard on persistent failure. |
| 7    | Write heartbeat      | Yes (flag file) | `POST $SUPABASE_URL/rest/v1/executions` with `status: "running"`. Retries 3x. Warns and continues on failure (non-fatal).                                  |
| 8    | Handoff              | N/A             | `exec node /app/dist/workers/orchestrate.mjs`. Exits cleanly with code 0 if the file doesn't exist (Phase 5 not built yet).                                |

### Idempotency Mechanism

Flag files live in `/tmp/.boot-flags/`. The `step_done()` function checks for `.step-N-done` before running each step. `mark_step_done()` writes the flag after success. `/tmp` is ephemeral per container instance, so flags don't persist across cold starts — only across restarts of the same running container.

### Failure Modes

Steps 1-6 retry 3 times with a 5-second delay between attempts. Persistent failure exits with code 1 and logs an error to stderr. Step 7 (heartbeat) is the exception: after 3 failed attempts it logs a warning and continues rather than aborting the boot. Step 8 exits cleanly if `orchestrate.mjs` is not found.

### Environment Variables at Runtime

| Variable               | Required? | Description                                                                           |
| ---------------------- | --------- | ------------------------------------------------------------------------------------- |
| `TASK_ID`              | Yes       | UUID of the task being executed. Used to fetch task context from Supabase.            |
| `REPO_URL`             | Yes       | Full HTTPS URL of the repository to clone, e.g. `https://github.com/org/repo`.        |
| `SUPABASE_URL`         | Yes       | Base URL of the Supabase project, e.g. `https://xyz.supabase.co`.                     |
| `SUPABASE_SECRET_KEY`  | Yes       | Supabase service role key. Used for both `apikey` header and `Authorization: Bearer`. |
| `GITHUB_TOKEN`         | No        | GitHub PAT or app token. Required for private repos and `gh` CLI auth.                |
| `REPO_BRANCH`          | No        | Branch to clone. Defaults to `main`.                                                  |
| `TASK_BRANCH`          | No        | Branch to create/checkout for this task's work. If unset, stays on `REPO_BRANCH`.     |
| `ENABLE_DOCKER_DAEMON` | No        | Set to any non-empty value to start the rootless Docker daemon at boot.               |

---

## Container Boot Verification

### How to Run

```bash
bash scripts/verify-container-boot.sh
```

### Prerequisites

- Local Supabase running (`supabase status`)
- Docker Desktop running
- `.env` file with `SUPABASE_SECRET_KEY` populated

### What It Tests

- Container boots without errors
- Steps 1-7 execute (auth, clone, branch, deps, Docker daemon check, task context, heartbeat)
- Step 8 reaches the handoff point cleanly (logs "Handoff point reached [OK]")
- `executions` table has a row with `heartbeat_at` in the last 5 minutes

### Expected Output

```
  ✓ Container started
  ✓ Task context read (Step 6)
  ✓ Heartbeat written (Step 7)
  ✓ Handoff point reached (Step 8)
  ✓ executions row in DB

All boot checks passed!
```

**Timing:** ~2-3 minutes (includes git clone and pnpm install of the test repo)

---

### Gotchas

**Supabase PostgREST serves `postgres`, not `ai_employee`**

This project follows the AGENTS.md pattern of creating a dedicated `ai_employee` database to avoid cross-project schema collisions. Prisma migrations run against `ai_employee`. But `supabase start` always points PostgREST at the `postgres` database — so when `entrypoint.sh` calls `${SUPABASE_URL}/rest/v1/tasks`, it's reading from `postgres`, not `ai_employee`.

The verification script handles this by creating the required tables (`projects`, `tasks`, `executions`) directly in the `postgres` database using `CREATE TABLE IF NOT EXISTS`, then issuing `NOTIFY pgrst, 'reload schema'` and sleeping 2 seconds before running the container. Cleanup removes only the test rows on exit, leaving the tables in place for idempotent re-runs.

**Test repo: `antfu/ni`, not `sindresorhus/is`**

The original task spec referenced `sindresorhus/is` as the test repo. That repo uses npm and has no `pnpm-lock.yaml`. Step 4 of `entrypoint.sh` runs `pnpm install --frozen-lockfile`, which fails immediately on a repo without a pnpm lockfile.

`antfu/ni` is the correct test repo. It's small, public, and uses pnpm with a valid lockfile. It installs ~401 packages in roughly 3 seconds inside the worker container.

**Container uses `--network host` to reach local Supabase**

The verification script runs the container with `--network host`. This is what lets `entrypoint.sh` reach `localhost:54321` (the Supabase API gateway) from inside the container. Without `--network host`, the container's `localhost` is isolated and all Supabase calls fail.

---

## Test Suite

| Test file                         | Tests | What it covers                                                                                 |
| --------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `tests/lib/retry.test.ts`         | 14    | Backoff schedule, `retryOn` predicate, max attempts, no delay after final attempt              |
| `tests/lib/errors.test.ts`        | 12    | `instanceof` checks, property values, `name` field survives serialization                      |
| `tests/lib/call-llm.test.ts`      | 28    | Timeout abort, rate limit retry, cost circuit breaker, cost calculation, model selection       |
| `tests/lib/jira-client.test.ts`   | 32    | `getIssue`, `addComment` ADF format, `transitionIssue`, 429 retry, 4xx `ExternalApiError`      |
| `tests/lib/github-client.test.ts` | 36    | `createPR`, `listPRs`, `getPR`, 403+header rate limit detection, 429 secondary rate limit      |
| `tests/lib/slack-client.test.ts`  | 24    | `postMessage`, `ok:false` error body, 429 rate limit, default channel fallback, blocks support |

**Total: 190 tests passing, 4 skipped** (4 integration tests skipped without `INNGEST_DEV_URL`)

```bash
pnpm test
```

---

## Key Design Decisions

1. **Native fetch only** — no HTTP client library dependencies. All three API wrappers use the built-in `fetch` API. This keeps the dependency tree small and avoids version conflicts with Inngest and Fastify.

2. **Inline retry** — `withRetry()` is a 40-line utility written for this project rather than pulling in `p-retry` or `async-retry`. The only behavior needed is exponential backoff with a `retryOn` predicate. A dependency would add more surface area than the problem warrants.

3. **GitHub 403 rate limit** — GitHub uses 403 with `X-RateLimit-Remaining: 0` for primary rate limits, not 429. Any `githubClient` implementation that only checks for 429 will silently treat primary rate limits as permanent auth failures and stop retrying. The `isRateLimit()` helper checks both codes.

4. **Slack `ok:false`** — Slack's Web API returns HTTP 200 even when the call fails. The error is in the response body's `ok` field. Any `slackClient` that only checks the HTTP status code will silently swallow errors like `channel_not_found` or `not_authed`.

5. **`tsconfig.build.json`** — the development `tsconfig.json` sets `"noEmit": true` to keep the editor fast. Docker needs to emit `.js` files to `dist/`. Rather than modifying the base config, a separate `tsconfig.build.json` extends it and overrides only `noEmit`, `rootDir`, and `outDir`.

6. **`opencode-ai` on npm** — the correct package name is `opencode-ai`. The names `opencode` and `@opencode/cli` both 404 on the npm registry. Use `npm install -g opencode-ai@1.3.3`.

7. **Multi-stage Docker** — Prisma client generation must happen in the builder stage where the schema file is present. Generating it in the production stage would require copying `prisma/schema.prisma` into the final image and running `prisma generate` at boot, which adds startup latency and requires `prisma` as a production dependency.

---

## What Phase 5 Builds On Top

Phase 4 ends at the handoff point: Step 8 of `entrypoint.sh` attempts to `exec node /app/dist/workers/orchestrate.mjs` and exits cleanly when the file doesn't exist. Phase 5 creates that file and everything it depends on.

```mermaid
flowchart LR
    subgraph Phase 4 - Foundation
        BOOT["entrypoint.sh\n(8-step boot)"]:::service
        LLM["callLLM()"]:::service
        JIRA["jiraClient"]:::service
        GH["githubClient"]:::service
        SLACK["slackClient"]:::service
    end

    subgraph Phase 5 - Orchestration
        ORCH["orchestrate.mjs\n(OpenCode loop)"]:::future
        SESS["Session Management"]:::future
        VALID["Validation Pipeline"]:::future
        FIX["Fix Loop"]:::future
    end

    BOOT ==>|"1. Hands off to"| ORCH
    LLM ==>|"2. Powers triage"| ORCH
    ORCH ==>|"3. Manages"| SESS
    ORCH ==>|"4. Runs"| VALID
    VALID ==>|"5. Triggers on failure"| FIX
    JIRA ==>|"6. Updates issue"| ORCH
    GH ==>|"7. Opens PR"| ORCH
    SLACK ==>|"8. Posts status"| ORCH

    classDef service fill:#4A90E2,stroke:#2E5C8A,color:#fff
    classDef future fill:#B0B0B0,stroke:#808080,color:#333,stroke-dasharray:5
```

| #   | What Phase 5 adds                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `dist/workers/orchestrate.mjs` — the file Step 8 hands off to. Receives task context from `.task-context.json`.    |
| 2   | OpenCode session management — spawning agent sessions, tracking session IDs, reading session output.               |
| 3   | Validation pipeline — TypeScript type-check, lint, unit tests, integration tests, E2E tests run after each commit. |
| 4   | Fix loop — if validation fails, the orchestrator re-prompts the agent with the error output and retries.           |
