# Airbnb mitmproxy Reverse Engineering — Review Management PoC

## TL;DR

> **Quick Summary**: Explore Airbnb API reverse engineering using mitmproxy to capture, analyze, and replay review management endpoints. If viable, integrate as shell tools into the AI Employee platform.
>
> **Deliverables**:
>
> - Working mitmproxy setup on macOS with SSL interception
> - Documented Airbnb review endpoint map (GraphQL queries, auth patterns, response shapes)
> - Replay scripts proving read/write feasibility and session durability data
> - Shell tools in `src/worker-tools/airbnb/` (if replay proves viable)
> - Exploration findings document with go/no-go recommendation for further work
>
> **Estimated Effort**: Medium (3-5 days)
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 → Task 4 → Task 5 → Task 7 → Task 10 → Task 13 → F1-F4

---

## Context

### Original Request

User wants to explore whether mitmproxy can be used to reverse-engineer the Airbnb API for automating business processes, specifically review management as the simplest PoC.

### Interview Summary

**Key Discussions**:

- **Goal**: "Explore the art of the possible" — not production commitment, curiosity-driven
- **Platform integration**: For the AI Employee platform, not standalone
- **Starting point**: Review management chosen for simplicity (reads don't need CSRF)
- **mitmproxy experience**: Brand new — plan needs full setup-to-capture guidance
- **Airbnb account**: Active host account available for testing
- **ToS risk**: Accepted for private exploration on own account

**Research Findings** (from prior May 2026 spike):

- 13 Airbnb endpoints mapped via HAR analysis (messaging-focused, reviews may need deeper mapping)
- v3 GraphQL API uses Apollo APQ with fixed SHA256 hashes — can't craft custom queries
- Read ops use `x-csrf-without-token: 1` header (simpler), writes need real CSRF from `_airlock_v2_` cookie
- DataDome + browser fingerprinting as anti-bot protection
- Prior artifacts at `/tmp/airbnb-research/` (ephemeral, likely gone — documented findings remain in `docs/architecture/airbnb-integration/`)
- No existing `src/worker-tools/airbnb/` directory — this would be net new

### Metis Review

**Identified Gaps** (addressed):

- **Certificate pinning risk**: Airbnb may block mitmproxy SSL interception — added explicit check step in Task 1
- **Conditional Phase 4**: Platform integration only makes sense if Phase 3 proves viability — added go/no-go gate between Wave 3 and Wave 4
- **Manual browser interaction**: Capture phase requires browsing Airbnb — plan uses Playwright CDP to automate browser while mitmproxy captures traffic
- **Session cookie scope**: Need to determine if cookies are shared across Airbnb domains — added to Task 6 analysis
- **DataDome detection**: Replayed requests may be blocked even with valid cookies — this is the key experiment in Task 7/8

---

## Work Objectives

### Core Objective

Determine whether Airbnb's review management API can be reliably automated via mitmproxy-based reverse engineering, and if so, build working shell tools for the AI Employee platform.

### Concrete Deliverables

- mitmproxy installed and configured on macOS with Airbnb SSL interception working
- Captured and filtered mitmproxy traffic for all review-related Airbnb endpoints
- Documented endpoint map: GraphQL query hashes, request/response shapes, auth requirements
- Replay scripts: read reviews programmatically, respond to reviews programmatically
- Session durability data: how long do captured cookies survive?
- `src/worker-tools/airbnb/get-reviews.ts` — shell tool for reading Airbnb reviews (if viable)
- `src/worker-tools/airbnb/respond-to-review.ts` — shell tool for posting review responses (if viable)
- Exploration findings document at `docs/architecture/airbnb-integration/`

### Definition of Done

- [ ] mitmproxy captures Airbnb HTTPS traffic without errors
- [ ] At least 3 review-related GraphQL endpoints documented with full request/response shapes
- [ ] Read replay script successfully retrieves reviews without a browser
- [ ] Session durability measured (minimum: tested at 1h, 4h, 12h, 24h marks)
- [ ] Findings document published with explicit go/no-go recommendation

### Must Have

- Full mitmproxy setup documentation (user is learning the tool)
- Every captured endpoint fully documented (not just "it works" — full request/response shapes)
- Honest assessment of fragility and maintenance burden
- Clear go/no-go gate between exploration (Waves 1-3) and platform integration (Wave 4)

### Must NOT Have (Guardrails)

- **No multi-account support** — this is one account, one machine exploration
- **No production deployment** — no deploying to Fly.io or running in Docker
- **No messaging automation** — scope is reviews only, not inbox/messaging
- **No credential storage in plaintext** — even for exploration, use `.env` or `tenant_secrets`
- **No modification of the existing NO-GO decision doc** — add new findings as a separate document
- **No scale testing** — don't stress-test Airbnb's anti-bot; one request at a time
- **No automated review responses without human confirmation** — even in the shell tool, default to dry-run

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **Automated tests**: None — this is exploration. Verification is via replay experiments, not unit tests.
- **Framework**: N/A

### QA Policy

Every task has agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI/Tool**: Use Bash — run command, validate output, check exit code
- **API/Replay**: Use Bash (curl/node) — send requests, assert status + response fields
- **mitmproxy**: Use tmux — start proxy, send keystrokes, validate capture files exist

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — setup):
├── Task 1: Install & configure mitmproxy on macOS [quick]
├── Task 2: Create exploration workspace + scripts scaffold [quick]
└── Task 3: Create src/worker-tools/airbnb/ directory scaffold [quick]

Wave 2 (After Wave 1 — capture, sequential):
├── Task 4: Capture Airbnb review traffic via mitmproxy + browser (depends: 1, 2) [deep]
└── Task 5: Export & filter review-specific API calls from captures (depends: 4) [unspecified-high]

Wave 3 (After Wave 2 — analysis & replay):
├── Task 6: Document review endpoint map (depends: 5) [unspecified-high]
├── Task 7: Build & test read-only replay script (depends: 5) [deep]
├── Task 8: Build & test write replay — review responses + CSRF (depends: 5, 7) [deep]
└── Task 9: Session durability experiment (depends: 7) [unspecified-high]

— GO/NO-GO GATE: Review Wave 3 results before proceeding —

Wave 4 (After Wave 3 — platform integration, conditional):
├── Task 10: Build get-airbnb-reviews.ts shell tool (depends: 6, 7) [unspecified-high]
├── Task 11: Build respond-to-airbnb-review.ts shell tool (depends: 6, 8) [unspecified-high]
└── Task 12: Session management strategy + archetype skeleton (depends: 9, 10) [deep]

Wave 5 (After Wave 4 — documentation):
├── Task 13: Write exploration findings document (depends: all) [writing]
├── Task 14: Update Airbnb integration docs (depends: 13) [writing]
└── Task 15: Notify completion via Telegram (depends: 14) [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 4 → Task 5 → Task 7 → Task 10 → Task 13 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 4 (Wave 3)
```

### Dependency Matrix

| Task | Depends On | Blocks       | Wave |
| ---- | ---------- | ------------ | ---- |
| 1    | —          | 4            | 1    |
| 2    | —          | 4            | 1    |
| 3    | —          | 10, 11       | 1    |
| 4    | 1, 2       | 5            | 2    |
| 5    | 4          | 6, 7, 8, 9   | 2    |
| 6    | 5          | 10, 11, 13   | 3    |
| 7    | 5          | 8, 9, 10, 13 | 3    |
| 8    | 5, 7       | 11, 13       | 3    |
| 9    | 7          | 12, 13       | 3    |
| 10   | 3, 6, 7    | 12, 13       | 4    |
| 11   | 3, 6, 8    | 13           | 4    |
| 12   | 9, 10      | 13           | 4    |
| 13   | all        | 14           | 5    |
| 14   | 13         | 15           | 5    |
| 15   | 14         | —            | 5    |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: **2** — T4 → `deep`, T5 → `unspecified-high`
- **Wave 3**: **4** — T6 → `unspecified-high`, T7 → `deep`, T8 → `deep`, T9 → `unspecified-high`
- **Wave 4**: **3** — T10 → `unspecified-high`, T11 → `unspecified-high`, T12 → `deep`
- **Wave 5**: **3** — T13 → `writing`, T14 → `writing`, T15 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Install & configure mitmproxy on macOS

  **What to do**:
  - Install mitmproxy via Homebrew: `brew install mitmproxy`
  - Start mitmproxy once to generate CA certificates (`~/.mitmproxy/mitmproxy-ca-cert.pem`)
  - Install the CA certificate in the macOS system Keychain and mark it as trusted for SSL
  - Verify SSL interception works by proxying a test HTTPS request through mitmproxy
  - Test against Airbnb specifically: start mitmproxy, configure a browser to use it as proxy, navigate to `airbnb.com`, verify traffic is captured without certificate errors
  - **CRITICAL CHECK**: If Airbnb uses certificate pinning that blocks mitmproxy, document this as a blocking finding and stop — the exploration cannot proceed

  **Must NOT do**:
  - Don't install mitmproxy globally via pip (use Homebrew for clean macOS integration)
  - Don't skip the Airbnb-specific test — some sites use cert pinning that breaks mitmproxy

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward package installation and system configuration
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: Not relevant — no shell tools in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **External References**:
  - mitmproxy official docs: `https://docs.mitmproxy.org/stable/overview-installation/` — macOS installation guide
  - mitmproxy certificate setup: `https://docs.mitmproxy.org/stable/concepts-certificates/` — how to install CA cert on macOS
  - Prior tooling setup notes: `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:157` — mentions tooling-setup.md from prior spike (at `/tmp/airbnb-research/tooling-setup.md`, likely gone)

  **WHY Each Reference Matters**:
  - mitmproxy docs: The user is brand new to mitmproxy — follow official install steps exactly
  - Certificate setup: macOS Keychain trust is required for HTTPS interception — skipping this means no SSL capture
  - Prior tooling setup: The team already set up mitmproxy once — if that doc still exists, it saves time

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: mitmproxy installation verification
    Tool: Bash
    Preconditions: macOS system with Homebrew installed
    Steps:
      1. Run `mitmproxy --version` — expect version string like "Mitmproxy: 11.x.x"
      2. Run `ls ~/.mitmproxy/mitmproxy-ca-cert.pem` — expect file exists
      3. Run `security find-certificate -a -c mitmproxy | head -5` — expect certificate in Keychain
    Expected Result: mitmproxy installed, CA cert generated, cert trusted in Keychain
    Failure Indicators: `command not found`, missing cert file, cert not in Keychain output
    Evidence: .sisyphus/evidence/task-1-mitmproxy-installed.txt

  Scenario: Airbnb SSL interception test
    Tool: Bash (tmux for mitmproxy, curl through proxy)
    Preconditions: mitmproxy installed and CA cert trusted
    Steps:
      1. Start mitmproxy in tmux: `mitmproxy -p 8080 --set console_eventlog_verbosity=info`
      2. Run `curl -x http://localhost:8080 https://www.airbnb.com/ -o /dev/null -w "%{http_code}" -s`
      3. Verify HTTP 200 returned (not a certificate error or connection refused)
      4. Check mitmproxy captured the request (look for airbnb.com in flow list)
    Expected Result: curl returns 200, mitmproxy shows the captured airbnb.com flow
    Failure Indicators: curl returns non-200, certificate error, or mitmproxy shows no flows
    Evidence: .sisyphus/evidence/task-1-airbnb-ssl-test.txt

  Scenario: Certificate pinning detection (negative test)
    Tool: Bash
    Preconditions: mitmproxy running on port 8080
    Steps:
      1. Run `curl -x http://localhost:8080 https://www.airbnb.com/api/v3/ -o /dev/null -w "%{http_code}" -s`
      2. If HTTP 200: no cert pinning, proceed with exploration
      3. If connection error or non-200: Airbnb may use cert pinning on API endpoints
    Expected Result: HTTP 200 (no cert pinning) OR documented cert pinning finding
    Failure Indicators: Consistent connection failures through proxy only (works without proxy)
    Evidence: .sisyphus/evidence/task-1-cert-pinning-check.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(airbnb): scaffold exploration workspace and mitmproxy setup`
  - Files: exploration workspace files
  - Pre-commit: `mitmproxy --version`

- [ ] 2. Create exploration workspace & scripts scaffold

  **What to do**:
  - Create directory: `/tmp/airbnb-mitmproxy-exploration/` with subdirectories: `captures/`, `filtered/`, `scripts/`, `cookies/`
  - Create a `scripts/extract-cookies.ts` skeleton — takes a mitmproxy flow export and extracts Airbnb session cookies into a JSON file
  - Create a `scripts/replay-request.ts` skeleton — takes a captured request + cookie jar and replays it via `fetch()`
  - Create a `scripts/check-session.ts` skeleton — pings Airbnb with stored cookies and reports if session is still valid
  - Create a `.env.local.example` in the workspace with: `AIRBNB_COOKIE_FILE=`, `MITMPROXY_PORT=8080`
  - All scripts should be TypeScript, runnable via `tsx`

  **Must NOT do**:
  - Don't put the exploration workspace inside the ai-employee repo (use `/tmp/`)
  - Don't store actual cookies in the repo — the workspace is ephemeral

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file scaffolding with boilerplate code
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `adding-shell-tools`: These are exploration scripts, not platform shell tools

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-reviews.ts` — CLI argument parsing pattern (`parseArgs` function at line 50-75)
  - `src/worker-tools/hostfully/validate-env.ts` — Minimal env validation pattern

  **External References**:
  - mitmproxy flow export format: `https://docs.mitmproxy.org/stable/overview-features/#save-flows` — how captured flows are saved to disk
  - mitmproxy Python API: `https://docs.mitmproxy.org/stable/api/mitmproxy/flow.html` — for understanding flow export format

  **WHY Each Reference Matters**:
  - Hostfully tools: Follow same CLI pattern (parseArgs + main + stderr errors + stdout JSON) for consistency
  - mitmproxy docs: Need to understand export format to write the cookie extractor

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Workspace directory structure
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls -la /tmp/airbnb-mitmproxy-exploration/`
      2. Verify directories exist: captures/, filtered/, scripts/, cookies/
      3. Run `ls /tmp/airbnb-mitmproxy-exploration/scripts/`
      4. Verify files: extract-cookies.ts, replay-request.ts, check-session.ts
    Expected Result: All directories and skeleton files present
    Failure Indicators: Missing directories or files
    Evidence: .sisyphus/evidence/task-2-workspace-structure.txt

  Scenario: Scripts are valid TypeScript
    Tool: Bash
    Preconditions: Workspace created
    Steps:
      1. Run `tsx /tmp/airbnb-mitmproxy-exploration/scripts/extract-cookies.ts --help`
      2. Expect usage output (not a syntax error)
      3. Run `tsx /tmp/airbnb-mitmproxy-exploration/scripts/replay-request.ts --help`
      4. Expect usage output
    Expected Result: All scripts parse and show help without errors
    Failure Indicators: TypeScript syntax errors, missing imports
    Evidence: .sisyphus/evidence/task-2-scripts-valid.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(airbnb): scaffold exploration workspace and mitmproxy setup`
  - Files: `/tmp/` workspace (note: not in git, but commit any repo-side changes)

- [ ] 3. Create `src/worker-tools/airbnb/` directory scaffold

  **What to do**:
  - Create `src/worker-tools/airbnb/` directory
  - Create `src/worker-tools/airbnb/validate-env.ts` — validates `AIRBNB_SESSION_COOKIES` env var is set (follow exact pattern from `src/worker-tools/hostfully/validate-env.ts`)
  - Create `src/worker-tools/airbnb/fixtures/` directory for future mock data
  - Add a README.md in the directory explaining this is experimental/exploration code

  **Must NOT do**:
  - Don't add the airbnb directory to the Docker COPY instructions yet (no production use)
  - Don't add to AGENTS.md shell tools table yet (not ready)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple directory creation and file scaffolding
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Provides the canonical file structure and CLI pattern for shell tools

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 10, 11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/validate-env.ts` — Exact file to copy and adapt (42 lines, validates env vars)
  - `src/worker-tools/hostfully/` — Directory structure to mirror: flat TypeScript files + fixtures/ subdirectory
  - `src/worker-tools/hostfully/get-reviews.ts:1-19` — JSDoc header pattern with endpoint documentation

  **API/Type References**:
  - None yet — types will be defined after capture analysis

  **External References**:
  - `.opencode/skills/adding-shell-tools/SKILL.md` — Canonical checklist for adding shell tools

  **WHY Each Reference Matters**:
  - `validate-env.ts`: Copy this 1:1 but swap `HOSTFULLY_API_KEY` for `AIRBNB_SESSION_COOKIES`
  - Directory structure: All worker tool directories follow the same flat pattern — don't deviate

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Directory structure matches convention
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `ls src/worker-tools/airbnb/`
      2. Verify: validate-env.ts exists, fixtures/ directory exists
      3. Run `tsx src/worker-tools/airbnb/validate-env.ts --help`
      4. Expect usage output mentioning AIRBNB_SESSION_COOKIES
    Expected Result: Directory structure matches hostfully/ pattern, validate-env works
    Failure Indicators: Missing files, wrong env var name, TypeScript errors
    Evidence: .sisyphus/evidence/task-3-airbnb-scaffold.txt

  Scenario: validate-env rejects missing env var
    Tool: Bash
    Preconditions: AIRBNB_SESSION_COOKIES not set
    Steps:
      1. Run `tsx src/worker-tools/airbnb/validate-env.ts` (without setting env var)
      2. Expect stderr message about missing AIRBNB_SESSION_COOKIES
      3. Expect exit code 1
    Expected Result: Clear error message, non-zero exit
    Failure Indicators: No error, exit code 0, or wrong env var name in error
    Evidence: .sisyphus/evidence/task-3-validate-env-error.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(airbnb): scaffold exploration workspace and mitmproxy setup`
  - Files: `src/worker-tools/airbnb/validate-env.ts`, `src/worker-tools/airbnb/fixtures/`

- [ ] 4. Capture Airbnb review traffic via mitmproxy + browser

  **What to do**:
  - Start mitmproxy in recording mode: `mitmdump -p 8080 -w /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.flow`
  - Launch Chrome with proxy configuration: `open -a "Google Chrome" --args --proxy-server=http://localhost:8080 --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-mitmproxy-profile`
  - **USER INTERACTION REQUIRED**: The user must log into their Airbnb host account in this Chrome instance. The agent should provide clear instructions and pause.
  - Once logged in, use Playwright CDP (`chromium.connectOverCDP('http://localhost:9222')`) to automate navigation:
    1. Navigate to `https://www.airbnb.com/hosting/reviews` (reviews dashboard)
    2. Wait for page load, scroll to trigger lazy-loading of review data
    3. Click into 2-3 individual reviews to capture detail endpoints
    4. Navigate to a review that has no response yet
    5. Open the "Write a response" form (but DON'T submit — just capture the form endpoint)
    6. If there are multiple pages of reviews, navigate to page 2
  - Stop mitmproxy recording after all pages visited
  - Save the raw flow file and also export as HAR: `mitmdump -r captures/airbnb-reviews.flow --set hardump=captures/airbnb-reviews.har`

  **Must NOT do**:
  - Don't submit any review responses during capture (read-only browsing)
  - Don't navigate to non-review pages (stay focused on review endpoints)
  - Don't store the user's Airbnb password anywhere

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires coordinating mitmproxy, Chrome, and Playwright simultaneously. Interactive browser automation with careful sequencing.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Playwright skill — could help but CDP connection to proxied Chrome is non-standard

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 5
  - **Blocked By**: Tasks 1, 2

  **References**:

  **External References**:
  - mitmproxy flow recording: `https://docs.mitmproxy.org/stable/overview-features/#save-flows` — `-w` flag for writing flows
  - mitmproxy HAR export: `https://docs.mitmproxy.org/stable/overview-features/#har-export` — `hardump` option
  - Playwright CDP connection: `https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp` — connecting to existing Chrome

  **Pattern References**:
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:102-114` — Known v3 GraphQL endpoints (messaging-focused but shows the pattern)

  **WHY Each Reference Matters**:
  - mitmproxy docs: Exact flags for recording mode — wrong flags mean lost captures
  - Playwright CDP: Automating browser navigation while mitmproxy captures all traffic
  - Prior endpoint map: Shows the GraphQL URL pattern (`/api/v3/{OperationName}/{sha}`) so we know what to look for in captures

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: mitmproxy captured Airbnb review traffic
    Tool: Bash
    Preconditions: Capture session completed
    Steps:
      1. Verify flow file exists: `ls -la /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.flow`
      2. Verify file size > 100KB (meaningful capture, not empty)
      3. Verify HAR export exists: `ls -la /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.har`
      4. Search HAR for review-related endpoints: `grep -c "review\|Review" /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.har`
    Expected Result: Flow file > 100KB, HAR file exists, multiple review-related entries found
    Failure Indicators: Empty/missing files, zero review matches in HAR, only static assets captured
    Evidence: .sisyphus/evidence/task-4-capture-stats.txt

  Scenario: GraphQL API calls captured (not just HTML pages)
    Tool: Bash
    Preconditions: HAR file exists
    Steps:
      1. Search for GraphQL endpoint pattern: `grep -c "api/v3/" /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.har`
      2. Expect at least 5 GraphQL API calls (not just page loads)
      3. Search for specific review operation names: `grep -o '"[A-Z][a-zA-Z]*Review[a-zA-Z]*"' /tmp/airbnb-mitmproxy-exploration/captures/airbnb-reviews.har | sort -u`
    Expected Result: 5+ GraphQL calls, at least 1 operation name containing "Review"
    Failure Indicators: Zero GraphQL calls, only HTML/CSS/JS captured
    Evidence: .sisyphus/evidence/task-4-graphql-calls.txt
  ```

  **Commit**: NO (intermediate exploration data, not source code)

- [ ] 5. Export & filter review-specific API calls from captures

  **What to do**:
  - Use `mitmdump` with filter expressions to extract only Airbnb API calls from the capture:
    `mitmdump -r captures/airbnb-reviews.flow --set flow_detail=3 "~u airbnb.com/api/v3" > filtered/api-calls.txt`
  - Parse the HAR file and extract review-specific entries into a clean JSON:
    - Filter for URLs matching `/api/v3/` pattern
    - For each: extract URL, method, request headers, request body (if POST), response status, response body
    - Group by operation name (extracted from URL path)
  - Create `filtered/review-endpoints.json` with structured data for each unique endpoint discovered
  - Create `filtered/cookies-snapshot.json` — extract all Airbnb cookies from the first request's Cookie header
  - Identify which endpoints are reads (GET) vs writes (POST/PUT)
  - Document any endpoints that require CSRF tokens (look for `x-csrf-token` or `_airlock_v2_` in request headers)

  **Must NOT do**:
  - Don't include static asset requests (images, CSS, JS) in filtered output
  - Don't discard the original capture files — keep both raw and filtered

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Significant data processing — parsing HAR, filtering, structuring. Not complex logic but substantial volume.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential, after Task 4)
  - **Blocks**: Tasks 6, 7, 8, 9
  - **Blocked By**: Task 4

  **References**:

  **External References**:
  - mitmproxy filter expressions: `https://docs.mitmproxy.org/stable/concepts-filters/` — URL filter syntax (`~u`)
  - HAR 1.2 spec: `http://www.softwareishard.com/blog/har-12-spec/` — JSON structure of HAR entries

  **Pattern References**:
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:102-114` — Known endpoint patterns to look for

  **WHY Each Reference Matters**:
  - mitmproxy filters: The capture contains ALL traffic (hundreds of requests). Filters isolate the ~10-20 API calls we care about.
  - Known endpoints: Cross-reference discovered endpoints against the prior research to spot new/changed ones

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Filtered endpoints are clean and structured
    Tool: Bash
    Preconditions: Raw capture from Task 4 exists
    Steps:
      1. Verify `filtered/review-endpoints.json` exists and is valid JSON: `cat /tmp/airbnb-mitmproxy-exploration/filtered/review-endpoints.json | python3 -m json.tool > /dev/null`
      2. Count unique endpoints: `cat /tmp/airbnb-mitmproxy-exploration/filtered/review-endpoints.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))"`
      3. Expect at least 3 unique review-related endpoints
      4. Verify each entry has: url, method, requestHeaders, responseStatus, responseBody
    Expected Result: Valid JSON, 3+ endpoints, all fields present
    Failure Indicators: Invalid JSON, zero endpoints, missing fields
    Evidence: .sisyphus/evidence/task-5-filtered-endpoints.txt

  Scenario: Cookie snapshot extracted
    Tool: Bash
    Preconditions: Filtered data from captures
    Steps:
      1. Verify `filtered/cookies-snapshot.json` exists
      2. Verify it contains Airbnb session cookies (look for `_aat` or `_user_attributes` keys)
      3. Verify cookies are not empty strings
    Expected Result: Cookie file with valid Airbnb session tokens
    Failure Indicators: Missing file, empty cookies, no Airbnb-specific cookie names
    Evidence: .sisyphus/evidence/task-5-cookies-snapshot.txt
  ```

  **Commit**: NO (intermediate exploration data)

- [ ] 6. Document review endpoint map

  **What to do**:
  - Create `/tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` with a full analysis of every review-related endpoint discovered
  - For each endpoint document:
    - Full URL pattern (with GraphQL operation name and SHA hash)
    - HTTP method (GET/POST)
    - Required headers (Cookie, x-csrf-token, x-csrf-without-token, x-airbnb-api-key, etc.)
    - Request body schema (for POST endpoints)
    - Response body schema (key fields, types, nesting)
    - Auth requirements: which cookies are needed, whether CSRF is required
  - Create a comparison section against the prior research (`docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:102-114`) — what's the same, what changed?
  - Document the cookie dependency chain: which cookies are set by which response, what's the refresh mechanism
  - Identify which endpoints are safe for replay (reads) vs risky (writes)

  **Must NOT do**:
  - Don't include actual cookie values in the document — use `[REDACTED]` placeholders
  - Don't document non-review endpoints (stay scoped)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Thorough analysis and documentation of captured API data. Requires careful attention to detail.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8, 9)
  - **Blocks**: Tasks 10, 11, 13
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:102-114` — Prior endpoint documentation format to extend
  - `/tmp/airbnb-mitmproxy-exploration/filtered/review-endpoints.json` — Raw data from Task 5

  **WHY Each Reference Matters**:
  - Prior endpoint map: Provides the documentation format and known patterns to cross-reference
  - Filtered endpoints: The raw input data this task will analyze and document

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Endpoint map is complete and accurate
    Tool: Bash
    Preconditions: Filtered endpoints from Task 5 exist
    Steps:
      1. Verify `/tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` exists
      2. Count documented endpoints: `grep -c "^###" /tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md`
      3. Expect at least 3 documented endpoints
      4. Verify no actual cookie values in doc: `grep -c "_aat=\|session=" /tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` should be 0
      5. Verify comparison section exists: `grep -c "Prior Research\|Comparison" /tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md`
    Expected Result: 3+ endpoints documented, no leaked cookies, comparison section present
    Failure Indicators: Missing endpoints, cookie values in doc, no comparison
    Evidence: .sisyphus/evidence/task-6-endpoint-map.txt

  Scenario: Each endpoint has required fields
    Tool: Bash
    Preconditions: Endpoint map document exists
    Steps:
      1. For each documented endpoint, verify presence of: URL pattern, HTTP method, Required headers, Response schema
      2. Grep for each required section: `grep -c "URL\|Method\|Headers\|Response" /tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md`
    Expected Result: Every endpoint has all 4 required sections
    Failure Indicators: Endpoints with missing URL, method, or response documentation
    Evidence: .sisyphus/evidence/task-6-endpoint-completeness.txt
  ```

  **Commit**: NO (exploration documentation, not source code)

- [ ] 7. Build & test read-only replay script

  **What to do**:
  - Flesh out `/tmp/airbnb-mitmproxy-exploration/scripts/replay-request.ts`:
    - Accept `--endpoint <name>` (from endpoint map), `--cookie-file <path>`, `--output <path>`
    - Load cookies from the cookie jar file
    - Construct the full request: URL, headers (including `x-airbnb-api-key`, `x-csrf-without-token: 1`), cookies
    - Use `fetch()` to make the request
    - Parse and output the response as formatted JSON
  - Flesh out `/tmp/airbnb-mitmproxy-exploration/scripts/extract-cookies.ts`:
    - Parse the mitmproxy flow or HAR to extract all Airbnb cookies
    - Save to `cookies/session.json` in a structured format: `{ name: value }` pairs
  - **THE KEY EXPERIMENT**: Run the replay script against the review-listing endpoint:
    1. Extract cookies from capture
    2. Replay the review-listing query using extracted cookies
    3. Verify the response matches what was captured (same reviews, same structure)
    4. Try from a different IP/machine if possible (does Airbnb bind sessions to IP?)
  - Document: Did it work? What headers were required? Did DataDome block it?

  **Must NOT do**:
  - Don't replay write endpoints in this task (reads only)
  - Don't modify any Airbnb data
  - Don't make more than 5 requests per minute (be respectful)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core feasibility experiment. Requires building scripts, running experiments, analyzing results, and documenting findings. This is the most important task in the exploration.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 6, 8, 9) — but Task 8 depends on this
  - **Blocks**: Tasks 8, 9, 10, 13
  - **Blocked By**: Task 5

  **References**:

  **Pattern References**:
  - `/tmp/airbnb-mitmproxy-exploration/filtered/review-endpoints.json` — The exact URLs, headers, and response shapes to replay
  - `/tmp/airbnb-mitmproxy-exploration/filtered/cookies-snapshot.json` — The cookies to use for replay
  - `src/worker-tools/hostfully/get-reviews.ts:110-167` — How to build HTTP requests with headers and parse JSON responses

  **External References**:
  - DataDome documentation: `https://datadome.co/` — Understanding what anti-bot checks look for
  - Airbnb's public API key: typically `d306zoyjsyarp7ifhu67rjxn52tv0t20` (the static key used by the web app)

  **WHY Each Reference Matters**:
  - Filtered endpoints: Contains exact URLs and headers that worked in the browser — replay must match exactly
  - Cookie snapshot: The auth tokens needed for replay
  - Hostfully tool: Shows the fetch() + JSON parsing pattern to follow

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Cookie extraction works
    Tool: Bash
    Preconditions: Captures from Task 4-5 exist
    Steps:
      1. Run `tsx scripts/extract-cookies.ts --input captures/airbnb-reviews.har --output cookies/session.json`
      2. Verify `cookies/session.json` exists and contains Airbnb cookie names
      3. Verify at least 3 cookies extracted (e.g., _aat, _user_attributes, bev_token)
    Expected Result: Cookie file with 3+ Airbnb session cookies
    Failure Indicators: Empty file, parsing errors, zero cookies
    Evidence: .sisyphus/evidence/task-7-cookie-extraction.txt

  Scenario: Read replay returns review data
    Tool: Bash
    Preconditions: Cookies extracted, endpoint map available
    Steps:
      1. Run `tsx scripts/replay-request.ts --endpoint review-list --cookie-file cookies/session.json --output /tmp/replay-result.json`
      2. Verify output is valid JSON: `cat /tmp/replay-result.json | python3 -m json.tool > /dev/null`
      3. Verify response contains review data (look for fields like "rating", "review", "author")
      4. Compare structure against captured response from Task 5
    Expected Result: Valid JSON response with review data matching captured structure
    Failure Indicators: HTTP 403 (blocked), empty response, HTML instead of JSON (anti-bot redirect)
    Evidence: .sisyphus/evidence/task-7-read-replay-result.json

  Scenario: DataDome detection test (negative)
    Tool: Bash
    Preconditions: Replay script works for at least one request
    Steps:
      1. Make 3 requests in quick succession (< 2 seconds apart)
      2. Check if any return non-200 status or DataDome challenge HTML
      3. Document whether rate limiting or bot detection is triggered
    Expected Result: Either all 3 succeed (great!) or document exactly which request triggered detection
    Failure Indicators: Immediate 403 on first request (session may be IP-bound)
    Evidence: .sisyphus/evidence/task-7-datadome-test.txt
  ```

  **Commit**: YES (groups with Task 6)
  - Message: `feat(airbnb): add endpoint map and replay scripts from mitmproxy analysis`
  - Files: replay scripts, endpoint documentation

- [ ] 8. Build & test write replay — review responses + CSRF

  **What to do**:
  - Extend the replay script to support POST endpoints (review response submission)
  - The key challenge: write operations require a real CSRF token, not just `x-csrf-without-token: 1`
  - Implement CSRF token extraction:
    1. First, make a read request to get the response cookies (which include `_airlock_v2_`)
    2. Parse the CSRF token from the cookie
    3. Include the token in the `x-csrf-token` header for the write request
  - **THE WRITE EXPERIMENT** (use `--dry-run` by default):
    1. Find a review without a response (from Task 7's read results)
    2. Construct a review response payload matching what was captured in mitmproxy
    3. In dry-run mode: log the full request that WOULD be sent (URL, headers, body) without sending
    4. In live mode (explicit `--live` flag): actually submit the response
    5. If live: verify the response appears on Airbnb
  - Document: Does CSRF extraction work? Can we chain read→CSRF→write reliably?

  **Must NOT do**:
  - Don't run live mode without explicit user confirmation (default to dry-run)
  - Don't submit garbage review responses — use a real, thoughtful response if testing live
  - Don't test on reviews that already have responses

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex experiment — requires chaining multiple HTTP requests with token extraction. If this works, it's the breakthrough.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (starts after Task 7 proves read works)
  - **Parallel Group**: Wave 3 (with Tasks 6, 9)
  - **Blocks**: Tasks 11, 13
  - **Blocked By**: Tasks 5, 7

  **References**:

  **Pattern References**:
  - `/tmp/airbnb-mitmproxy-exploration/filtered/review-endpoints.json` — The POST endpoint for submitting review responses
  - `/tmp/airbnb-mitmproxy-exploration/scripts/replay-request.ts` — Extend this script
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md:111` — `POST /api/v3/ThreadCreateMessageItem/{sha}` shows the CSRF pattern for writes

  **External References**:
  - CSRF token extraction patterns: The `_airlock_v2_` cookie contains the CSRF token value

  **WHY Each Reference Matters**:
  - Prior endpoint research: Confirmed that writes need real CSRF tokens — this is the documented pattern
  - Replay script: Building on top of Task 7's working read replay

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CSRF token extraction
    Tool: Bash
    Preconditions: Read replay works (Task 7), cookies available
    Steps:
      1. Run the CSRF extraction function/script
      2. Verify a CSRF token string is returned (non-empty)
      3. Verify the token format matches what was captured in mitmproxy (compare against captured x-csrf-token header)
    Expected Result: Valid CSRF token extracted from cookies/response
    Failure Indicators: Empty token, extraction error, format mismatch
    Evidence: .sisyphus/evidence/task-8-csrf-extraction.txt

  Scenario: Dry-run write replay
    Tool: Bash
    Preconditions: CSRF extraction works, read replay returns reviews with no response
    Steps:
      1. Run `tsx scripts/replay-request.ts --endpoint review-respond --cookie-file cookies/session.json --review-id <id> --response-text "Thank you for your kind review!" --dry-run`
      2. Verify output shows the full request that WOULD be sent: URL, headers (including x-csrf-token), body
      3. Verify the x-csrf-token header is populated (not empty)
      4. Verify body matches the schema captured in mitmproxy
    Expected Result: Complete dry-run request logged with valid CSRF token and correct body schema
    Failure Indicators: Missing CSRF token, wrong endpoint URL, malformed body
    Evidence: .sisyphus/evidence/task-8-write-dry-run.txt

  Scenario: Live write replay (OPTIONAL — only if user confirms)
    Tool: Bash
    Preconditions: Dry-run passed, user explicitly approves live test
    Steps:
      1. Run with --live flag against a specific unresponded review
      2. Check HTTP response status (expect 200 or 201)
      3. Verify the response appears on Airbnb (reload review page in browser)
    Expected Result: Review response posted successfully, visible on Airbnb
    Failure Indicators: HTTP 403 (CSRF failure), 429 (rate limit), response not visible
    Evidence: .sisyphus/evidence/task-8-write-live.txt
  ```

  **Commit**: NO (exploration scripts, not source code)

- [ ] 9. Session durability experiment

  **What to do**:
  - Flesh out `/tmp/airbnb-mitmproxy-exploration/scripts/check-session.ts`:
    - Accept `--cookie-file <path>`
    - Make a lightweight read request (review listing) to test if session is still valid
    - Output: `{ valid: true/false, statusCode: number, timestamp: string, hoursElapsed: number }`
  - Create a tracking log: `/tmp/airbnb-mitmproxy-exploration/session-durability-log.json`
  - Run the session check at these intervals (use a simple cron or manual triggers):
    - Immediately after cookie extraction (T+0)
    - T+1 hour
    - T+4 hours
    - T+12 hours
    - T+24 hours
    - T+48 hours (if still valid at 24h)
  - Record each result in the tracking log
  - Document findings: average session lifetime, what causes expiry, any observable patterns

  **Must NOT do**:
  - Don't make more than 1 request per check (minimize Airbnb traffic)
  - Don't try to re-authenticate automatically — just record when the session dies
  - Don't run checks at intervals shorter than 1 hour

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires time-distributed checks and data collection. The actual coding is simple but the experiment spans hours/days.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (runs in background over time)
  - **Parallel Group**: Wave 3 (starts after Task 7, runs alongside everything)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `/tmp/airbnb-mitmproxy-exploration/scripts/replay-request.ts` — Reuse the read replay for session checking
  - `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md:38` — "When a token expires, the platform cannot re-authenticate from a server IP without triggering Airbnb's Airlock"

  **WHY Each Reference Matters**:
  - Replay script: The session check is just a read replay with duration tracking
  - Prior research: Sets expectation that sessions WILL expire — the question is when

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Session check script works
    Tool: Bash
    Preconditions: Cookies from Task 7, read replay proven working
    Steps:
      1. Run `tsx scripts/check-session.ts --cookie-file cookies/session.json`
      2. Verify output is JSON with fields: valid, statusCode, timestamp, hoursElapsed
      3. Verify `valid: true` for first check (T+0)
    Expected Result: JSON output showing valid session
    Failure Indicators: Script error, missing fields, session already invalid at T+0
    Evidence: .sisyphus/evidence/task-9-session-check-t0.txt

  Scenario: Durability log accumulates data points
    Tool: Bash
    Preconditions: Multiple session checks have been run
    Steps:
      1. Read `session-durability-log.json`
      2. Verify at least 3 data points (T+0, T+1h, T+4h minimum)
      3. Verify each entry has: valid, statusCode, timestamp, hoursElapsed
      4. Identify the first `valid: false` entry (session expiry point)
    Expected Result: Log with 3+ entries, clear indication of when session expired (or confirmation it's still valid)
    Failure Indicators: Empty log, inconsistent data, missing timestamps
    Evidence: .sisyphus/evidence/task-9-durability-log.json
  ```

  **Commit**: NO (exploration data)

> **GO/NO-GO GATE**: After Wave 3, review results:
>
> - If read replay works reliably (Task 7 passed) → proceed to Wave 4
> - If read replay fails (DataDome blocks, sessions expire in < 1 hour) → skip Wave 4, go straight to Wave 5 (documentation only)
> - Decision documented in findings doc (Task 13)

- [ ] 10. Build `get-airbnb-reviews.ts` shell tool

  **What to do**:
  - Create `src/worker-tools/airbnb/get-reviews.ts` following the exact pattern from `src/worker-tools/hostfully/get-reviews.ts`
  - CLI interface:
    - `--help` — usage documentation
    - `--listing-id <id>` — (optional) specific Airbnb listing ID
    - `--since <date>` — (optional) filter by date
    - `--unresponded-only` — (optional) only reviews without host response
  - Environment variables:
    - `AIRBNB_SESSION_COOKIES` — JSON string of session cookies (from `tenant_secrets`)
    - `AIRBNB_API_KEY` — the static public API key (typically `d306zoyjsyarp7ifhu67rjxn52tv0t20`)
  - Implementation:
    - Parse cookies from env var
    - Construct GraphQL request using the endpoint map from Task 6
    - Include proper headers: `x-csrf-without-token: 1`, `x-airbnb-api-key`, cookies
    - Parse response and output clean JSON to stdout (same shape as hostfully/get-reviews.ts output)
    - Handle errors: session expired (clear message), rate limited, DataDome challenge
  - Output format should match `ReviewSummary` type from hostfully tool (consistent shape for the platform):
    ```json
    [{ "uid": "...", "guestName": "...", "content": "...", "rating": 5, "hasResponse": false }]
    ```

  **Must NOT do**:
  - Don't hardcode any cookies in source code
  - Don't add to Docker COPY yet (this is experimental)
  - Don't import from the exploration workspace — the shell tool must be self-contained

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Production-quality shell tool following established patterns, with non-trivial HTTP/cookie handling
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Provides canonical checklist for shell tool structure, CLI pattern, and env handling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12)
  - **Blocks**: Tasks 12, 13
  - **Blocked By**: Tasks 3, 6, 7

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/get-reviews.ts` — The exact file to model after. Copy the structure: JSDoc header (lines 1-19), types (20-48), parseArgs (50-75), main with fetch (77-278), error handler (280-283)
  - `src/worker-tools/hostfully/validate-env.ts` — Env validation pattern
  - `/tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` — The exact GraphQL URLs and headers to use

  **API/Type References**:
  - `src/worker-tools/hostfully/get-reviews.ts:20-48` — `RawReview` and `ReviewSummary` types to match output shape

  **External References**:
  - `.opencode/skills/adding-shell-tools/SKILL.md` — Canonical checklist

  **WHY Each Reference Matters**:
  - Hostfully get-reviews: The gold standard to copy. Same output shape means the platform can swap Airbnb for Hostfully transparently.
  - Endpoint map: The exact URLs, headers, and response schemas discovered in Task 6
  - Shell tools skill: Ensures the tool follows platform conventions (--help, stderr errors, stdout JSON)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Shell tool --help works
    Tool: Bash
    Preconditions: Tool file exists
    Steps:
      1. Run `tsx src/worker-tools/airbnb/get-reviews.ts --help`
      2. Expect usage output mentioning --listing-id, --since, --unresponded-only
      3. Expect environment variable documentation (AIRBNB_SESSION_COOKIES)
    Expected Result: Clean help text with all options documented
    Failure Indicators: TypeScript error, missing options in help, wrong env var name
    Evidence: .sisyphus/evidence/task-10-help-output.txt

  Scenario: Tool returns reviews with valid session
    Tool: Bash
    Preconditions: Valid session cookies in env var (from Task 9's durability check)
    Steps:
      1. Set AIRBNB_SESSION_COOKIES to the cookie JSON from exploration
      2. Run `tsx src/worker-tools/airbnb/get-reviews.ts`
      3. Verify output is valid JSON array
      4. Verify each entry has: uid, guestName, content, rating, hasResponse
    Expected Result: JSON array of reviews matching ReviewSummary shape
    Failure Indicators: HTTP error, empty array (when reviews exist), wrong output shape
    Evidence: .sisyphus/evidence/task-10-reviews-output.json

  Scenario: Tool handles expired session gracefully
    Tool: Bash
    Preconditions: Set AIRBNB_SESSION_COOKIES to an expired/invalid cookie value
    Steps:
      1. Set `AIRBNB_SESSION_COOKIES='{"_aat":"expired_token"}'`
      2. Run `tsx src/worker-tools/airbnb/get-reviews.ts`
      3. Expect stderr error about expired/invalid session
      4. Expect exit code 1
    Expected Result: Clear error message about session expiry, non-zero exit code
    Failure Indicators: Silent failure, exit code 0, cryptic error message
    Evidence: .sisyphus/evidence/task-10-expired-session.txt
  ```

  **Commit**: YES (groups with Task 11)
  - Message: `feat(airbnb): add review management shell tools`
  - Files: `src/worker-tools/airbnb/get-reviews.ts`
  - Pre-commit: `tsx src/worker-tools/airbnb/get-reviews.ts --help`

- [ ] 11. Build `respond-to-airbnb-review.ts` shell tool

  **What to do**:
  - Create `src/worker-tools/airbnb/respond-to-review.ts`
  - CLI interface:
    - `--help` — usage documentation
    - `--review-id <id>` — the review to respond to (required)
    - `--response-text <text>` — the response to post (required)
    - `--dry-run` — (default) show what would be sent without sending
    - `--live` — actually submit the response (must be explicit)
  - Environment variables: same as Task 10 (`AIRBNB_SESSION_COOKIES`, `AIRBNB_API_KEY`)
  - Implementation:
    - Validate inputs and env vars
    - If not `--live`: log the full request (URL, headers, body) to stdout and exit
    - If `--live`:
      1. Make a read request first to extract CSRF token from response cookies
      2. Construct the POST request with CSRF token + session cookies
      3. Submit the review response
      4. Verify submission succeeded (check HTTP status)
      5. Output result as JSON: `{ submitted: true, reviewId: "...", responseText: "..." }`
  - **CRITICAL**: Default is dry-run. Live mode requires explicit `--live` flag.

  **Must NOT do**:
  - Don't default to live mode — dry-run is the safe default
  - Don't submit responses to reviews that already have a response
  - Don't hardcode any cookies or tokens

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Similar complexity to Task 10, with additional CSRF handling and dry-run/live mode logic
  - **Skills**: [`adding-shell-tools`]
    - `adding-shell-tools`: Same rationale as Task 10

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 3, 6, 8

  **References**:

  **Pattern References**:
  - `src/worker-tools/hostfully/send-message.ts` (if it exists) — Write operation pattern for shell tools
  - `src/worker-tools/airbnb/get-reviews.ts` — (from Task 10) Shared env var handling and header construction
  - `/tmp/airbnb-mitmproxy-exploration/scripts/replay-request.ts` — The CSRF extraction logic from Task 8

  **API/Type References**:
  - `/tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` — The POST endpoint for review responses, including CSRF requirements

  **WHY Each Reference Matters**:
  - Hostfully send tool: Shows the write pattern — how to construct POST requests in shell tools
  - Endpoint map: Contains the exact POST URL, headers, and body schema for submitting review responses
  - Task 8 replay script: Contains the working CSRF extraction logic to port into the shell tool

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Shell tool --help shows dry-run as default
    Tool: Bash
    Preconditions: Tool file exists
    Steps:
      1. Run `tsx src/worker-tools/airbnb/respond-to-review.ts --help`
      2. Expect help text documenting --review-id, --response-text, --dry-run (default), --live
      3. Verify help text explicitly states dry-run is the default behavior
    Expected Result: Help text with all flags, clear indication that --live is required for real submission
    Failure Indicators: Missing --live flag docs, no mention of dry-run default
    Evidence: .sisyphus/evidence/task-11-help-output.txt

  Scenario: Dry-run mode logs request without sending
    Tool: Bash
    Preconditions: Valid session cookies in env
    Steps:
      1. Run `tsx src/worker-tools/airbnb/respond-to-review.ts --review-id test123 --response-text "Thank you!"`
      2. Expect stdout shows the request that WOULD be sent (URL, headers, body)
      3. Verify no actual HTTP request was made (no network traffic)
      4. Expect JSON output: `{ dryRun: true, requestUrl: "...", method: "POST", body: {...} }`
    Expected Result: Full request logged, nothing sent to Airbnb
    Failure Indicators: Actual request sent (check response for Airbnb API response), missing request details
    Evidence: .sisyphus/evidence/task-11-dry-run.txt

  Scenario: Missing --live flag prevents submission
    Tool: Bash
    Preconditions: Valid session, real review ID
    Steps:
      1. Run without --live: `tsx src/worker-tools/airbnb/respond-to-review.ts --review-id <real-id> --response-text "Test"`
      2. Verify stdout shows dry-run output (NOT a submission confirmation)
      3. Verify the review on Airbnb does NOT have a new response
    Expected Result: Dry-run output only, no submission
    Failure Indicators: Review response actually posted without --live flag
    Evidence: .sisyphus/evidence/task-11-no-live-flag.txt
  ```

  **Commit**: YES (groups with Task 10)
  - Message: `feat(airbnb): add review management shell tools`
  - Files: `src/worker-tools/airbnb/respond-to-review.ts`

- [ ] 12. Session management strategy + archetype skeleton

  **What to do**:
  - Create `src/worker-tools/airbnb/README.md` documenting the session management strategy:
    - How cookies are obtained (mitmproxy capture from user's browser)
    - Where cookies are stored (`tenant_secrets` as `AIRBNB_SESSION_COOKIES`)
    - How cookies are refreshed (manual — user must re-capture when session expires)
    - Session durability data from Task 9 (expected lifetime)
    - Comparison to Hostfully model (API key vs session cookies — tradeoffs)
  - Create a draft archetype skeleton (NOT a database seed, just a documentation draft):
    - `role_name`: review-management
    - `identity`: Manages Airbnb review responses
    - `execution_steps`: Read unresponded reviews → draft responses → submit via shell tool
    - `tool_registry`: `['airbnb/get-reviews', 'airbnb/respond-to-review']`
    - `risk_model.approval_required`: true (always require human approval for review responses)
  - Document known limitations:
    - Session lifetime (from Task 9)
    - CSRF token fragility
    - Single-account only (no multi-tenant)
    - Manual cookie refresh required

  **Must NOT do**:
  - Don't create actual database seeds (this is a documentation/design task)
  - Don't add to Docker Dockerfile or AGENTS.md yet
  - Don't design multi-tenant session management (out of scope)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires synthesizing findings from Tasks 7, 8, 9 into a coherent strategy document. Architecture-level thinking.
  - **Skills**: [`creating-archetypes`]
    - `creating-archetypes`: Provides the archetype schema fields needed for the draft

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11)
  - **Blocks**: Task 13
  - **Blocked By**: Tasks 9, 10

  **References**:

  **Pattern References**:
  - `docs/employees/guest-messaging.md` — Example employee documentation to follow as a template
  - `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md:38-40` — Credential custody analysis for comparison
  - `.opencode/skills/creating-archetypes/SKILL.md` — Archetype field definitions and patterns

  **WHY Each Reference Matters**:
  - Guest messaging docs: Shows how employee documentation is structured (archetype IDs, gotchas, test resources)
  - Credential custody analysis: The prior research on why stored credentials are problematic — this task must honestly compare
  - Creating archetypes skill: Ensures the archetype skeleton uses correct field names and structures

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: README covers all session management aspects
    Tool: Bash
    Preconditions: Tasks 7, 8, 9 completed with results
    Steps:
      1. Verify `src/worker-tools/airbnb/README.md` exists
      2. Grep for key sections: "Cookie", "Session", "Durability", "Refresh", "Limitations"
      3. Verify session lifetime data from Task 9 is included (specific hours, not vague)
      4. Verify comparison to Hostfully model is present
    Expected Result: Complete README with specific durability data and honest comparison
    Failure Indicators: Missing durability data, no Hostfully comparison, vague language
    Evidence: .sisyphus/evidence/task-12-readme-check.txt

  Scenario: Archetype skeleton has required fields
    Tool: Bash
    Preconditions: README exists
    Steps:
      1. Grep README for archetype fields: role_name, identity, execution_steps, tool_registry, risk_model
      2. Verify `approval_required: true` is documented (review responses must be approved)
    Expected Result: All archetype fields documented with approval required
    Failure Indicators: Missing fields, approval_required is false
    Evidence: .sisyphus/evidence/task-12-archetype-skeleton.txt
  ```

  **Commit**: YES (groups with Tasks 10, 11)
  - Message: `feat(airbnb): add review management shell tools`
  - Files: `src/worker-tools/airbnb/README.md`

- [ ] 13. Write exploration findings document

  **What to do**:
  - Create `docs/architecture/airbnb-integration/YYYY-MM-DD-HHMM-mitmproxy-review-management-exploration.md` (run `date "+%Y-%m-%d-%H%M"` for timestamp)
  - Document structure:
    1. **Executive Summary**: 2-3 sentences — what we tried, what worked, what didn't
    2. **Methodology**: mitmproxy setup, capture process, replay approach
    3. **Findings**:
       - Endpoints discovered (summary from Task 6)
       - Read replay results (Task 7) — success/failure, DataDome behavior
       - Write replay results (Task 8) — CSRF handling, success/failure
       - Session durability data (Task 9) — specific lifetime numbers
    4. **Platform Integration Assessment**:
       - Shell tools viability (did they work? how reliably?)
       - Operational burden (manual cookie refresh frequency, monitoring needs)
       - Comparison to Hostfully path (honest tradeoffs)
    5. **Go/No-Go Recommendation**:
       - For further Airbnb reverse engineering work
       - For production use of the shell tools
       - For expanding to messaging (the next logical scope)
    6. **Lessons Learned**: What would we do differently next time?
  - Include specific numbers: session duration, success rate, latency of replayed requests
  - Reference the original NO-GO decision and note what this exploration changes (or doesn't change)

  **Must NOT do**:
  - Don't modify the existing `2026-05-12-1120-go-no-go-decision.md` — this is a NEW document
  - Don't include actual cookie values or credentials
  - Don't over-sell viability if results are fragile — be honest

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Technical documentation synthesis — gathering findings from multiple tasks into a coherent narrative
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 14)
  - **Blocks**: Task 14
  - **Blocked By**: All previous tasks (needs complete results)

  **References**:

  **Pattern References**:
  - `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md` — The document format and tone to match. Structured, evidence-based, with clear verdict.
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md` — The companion reference document format

  **Data References** (inputs for the findings):
  - `/tmp/airbnb-mitmproxy-exploration/docs/endpoint-map.md` — Task 6 output
  - `.sisyphus/evidence/task-7-*` — Read replay results
  - `.sisyphus/evidence/task-8-*` — Write replay results
  - `/tmp/airbnb-mitmproxy-exploration/session-durability-log.json` — Task 9 data

  **WHY Each Reference Matters**:
  - GO/NO-GO doc: Sets the quality bar — this new doc must be equally thorough and evidence-based
  - Evidence files: Contain the raw experimental data this document will synthesize

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Findings document is complete
    Tool: Bash
    Preconditions: All wave 1-4 tasks completed
    Steps:
      1. Verify the file exists at `docs/architecture/airbnb-integration/*mitmproxy*`
      2. Verify all 6 sections present: Executive Summary, Methodology, Findings, Platform Integration Assessment, Go/No-Go Recommendation, Lessons Learned
      3. Verify specific numbers are included (not just "sessions expire quickly"): `grep -c "[0-9]\+ hour\|[0-9]\+ minute" <file>`
      4. Verify no credential leaks: `grep -c "_aat=\|cookie.*value" <file>` should be 0
      5. Verify reference to original NO-GO document: `grep -c "go-no-go-decision\|May 2026\|NO-GO" <file>`
    Expected Result: Complete document with all sections, specific data, no credentials, references prior work
    Failure Indicators: Missing sections, vague language, credential leaks, no reference to prior research
    Evidence: .sisyphus/evidence/task-13-findings-doc.txt

  Scenario: Go/No-Go recommendation is explicit
    Tool: Bash
    Preconditions: Document exists
    Steps:
      1. Find the recommendation section
      2. Verify it contains an explicit verdict: "GO" or "NO-GO" or "CONDITIONAL GO"
      3. Verify the verdict is supported by specific evidence from the experiments
    Expected Result: Clear, evidence-backed verdict
    Failure Indicators: Ambiguous recommendation, no supporting evidence cited
    Evidence: .sisyphus/evidence/task-13-recommendation.txt
  ```

  **Commit**: YES (groups with Task 14)
  - Message: `docs(airbnb): add mitmproxy exploration findings and updated integration docs`
  - Files: `docs/architecture/airbnb-integration/*mitmproxy*.md`

- [ ] 14. Update Airbnb integration docs

  **What to do**:
  - Update `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`:
    - Add a new section "Tier 4 — mitmproxy Reverse Engineering (explored June 2026)" documenting the findings
    - Keep all existing content intact — this is an additive update
  - Add the new findings document to the AGENTS.md Reference Documents table
  - If shell tools were built (Wave 4 completed), add `src/worker-tools/airbnb/` to the AGENTS.md shell tools table with a clear "EXPERIMENTAL" marker

  **Must NOT do**:
  - Don't modify the NO-GO decision document
  - Don't remove the "NO-GO" verdict from any existing document
  - Don't mark the airbnb tools as production-ready in AGENTS.md

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation updates across multiple files — requires care to preserve existing content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Task 13)
  - **Blocks**: Task 15
  - **Blocked By**: Task 13

  **References**:

  **Pattern References**:
  - `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md` — The file to update (add Tier 4 section)
  - `AGENTS.md` — Reference Documents table and shell tools table to update

  **WHY Each Reference Matters**:
  - Ecosystem landscape: The file receiving the Tier 4 addition — must match existing format
  - AGENTS.md: Platform-wide reference that agents use — adding new docs/tools here makes them discoverable

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Ecosystem landscape updated without breaking existing content
    Tool: Bash
    Preconditions: Findings document from Task 13 exists
    Steps:
      1. Verify Tier 1, 2, 3 sections still exist: `grep -c "Tier 1\|Tier 2\|Tier 3" docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`
      2. Verify new Tier 4 section exists: `grep -c "Tier 4\|mitmproxy" docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`
      3. Verify no existing content was deleted (compare line count with git): `git diff --stat docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`
    Expected Result: All 4 tiers present, line count increased (not decreased), existing content preserved
    Failure Indicators: Missing tiers, decreased line count, modified existing sections
    Evidence: .sisyphus/evidence/task-14-ecosystem-update.txt

  Scenario: AGENTS.md references updated
    Tool: Bash
    Preconditions: Documentation updates complete
    Steps:
      1. Verify new findings doc is in Reference Documents table: `grep "mitmproxy" AGENTS.md`
      2. If shell tools built: verify airbnb in shell tools table with EXPERIMENTAL marker: `grep -i "airbnb.*experimental\|experimental.*airbnb" AGENTS.md`
    Expected Result: New document referenced in AGENTS.md, tools marked experimental
    Failure Indicators: Missing reference, tools not marked experimental
    Evidence: .sisyphus/evidence/task-14-agents-md-update.txt
  ```

  **Commit**: YES (groups with Task 13)
  - Message: `docs(airbnb): add mitmproxy exploration findings and updated integration docs`
  - Files: `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md`, `AGENTS.md`

- [ ] 15. Notify completion via Telegram

  **What to do**:
  - Send Telegram notification: `tsx scripts/telegram-notify.ts "🔬 Airbnb mitmproxy exploration complete — Review management PoC finished. Come back to review findings."`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single command execution
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (after Tasks 13, 14)
  - **Blocks**: None
  - **Blocked By**: Tasks 13, 14

  **References**: None needed — `scripts/telegram-notify.ts` is a known utility.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Telegram notification sent
    Tool: Bash
    Preconditions: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID set in .env
    Steps:
      1. Run `tsx scripts/telegram-notify.ts "🔬 Airbnb mitmproxy exploration complete"`
      2. Verify exit code 0
    Expected Result: Notification delivered, exit code 0
    Failure Indicators: Non-zero exit, missing env vars
    Evidence: .sisyphus/evidence/task-15-telegram.txt
  ```

  **Commit**: NO (no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify deliverable exists (file on disk, captured data, documented findings). For each "Must NOT Have": search codebase for forbidden patterns (multi-account code, Fly.io deployment configs, messaging endpoints) — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `tsc --noEmit` on any new TypeScript files. Review all new shell tools for: proper error handling, `--help` support, env var validation, JSON stdout output, stderr for errors. Check for hardcoded cookies/tokens in source (security). Verify shell tools follow the pattern in `src/worker-tools/hostfully/get-reviews.ts`.
      Output: `Build [PASS/FAIL] | Shell Tool Pattern [PASS/FAIL] | Security [PASS/FAIL] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Test each shell tool with `--help`. If session cookies are still valid, run `get-airbnb-reviews.ts` and verify it returns JSON review data. Run `respond-to-airbnb-review.ts --dry-run` and verify it shows what it would post without actually posting. Check the exploration findings document for completeness. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Tools [N/N pass] | Replay [PASS/FAIL] | Docs [COMPLETE/INCOMPLETE] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual files created. Verify 1:1 — everything in spec was built, nothing beyond spec. Specifically check: no messaging code (reviews only), no multi-account code, no production deployment artifacts, no plaintext credentials. Flag any unaccounted files.
      Output: `Tasks [N/N compliant] | Scope [CLEAN/N violations] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message                                                                  | Files                                           |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1    | `feat(airbnb): scaffold exploration workspace and shell tool directory`         | `src/worker-tools/airbnb/`, exploration scripts |
| 3    | `feat(airbnb): add endpoint map and replay scripts from mitmproxy analysis`     | endpoint docs, replay scripts                   |
| 4    | `feat(airbnb): add review management shell tools`                               | `src/worker-tools/airbnb/*.ts`                  |
| 5    | `docs(airbnb): add mitmproxy exploration findings and updated integration docs` | `docs/architecture/airbnb-integration/`         |

---

## Success Criteria

### Verification Commands

```bash
# mitmproxy installed and working
mitmproxy --version  # Expected: mitmproxy 11.x or later

# Shell tools have --help
tsx src/worker-tools/airbnb/get-reviews.ts --help  # Expected: usage output
tsx src/worker-tools/airbnb/respond-to-review.ts --help  # Expected: usage output

# Exploration findings exist
ls docs/architecture/airbnb-integration/*mitmproxy*  # Expected: findings document

# No plaintext credentials in source
grep -r "airbnb.*cookie\|_airlock_v2_\|_aat=" src/worker-tools/airbnb/ || echo "CLEAN"  # Expected: CLEAN
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] mitmproxy successfully captured Airbnb review traffic
- [ ] Review endpoints fully documented
- [ ] Replay feasibility determined with evidence
- [ ] Session durability data collected
- [ ] Shell tools built (if replay viable) or documented why not
- [ ] Findings document with go/no-go recommendation published
