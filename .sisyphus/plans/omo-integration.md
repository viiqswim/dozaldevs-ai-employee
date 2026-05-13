# Oh My OpenAgent (OmO) Integration for All AI Employees

## TL;DR

> **Quick Summary**: Integrate the Oh My OpenAgent plugin into all AI employee Docker workers so every OpenCode session gets OmO's enhanced tooling (hash-anchored edits, LSP/AST-grep, MCPs, background agents, session recovery) on top of existing archetype instructions. All OmO agents use minimax/minimax-m2.7 via OpenRouter.
>
> **Deliverables**:
>
> - Updated Dockerfile with Bun, OmO plugin, Playwright/Chromium, telemetry env vars
> - OmO config file (`oh-my-openagent.jsonc`) with all agents on minimax-m2.7
> - Updated `opencode.json` with plugin array
> - Fixed `writeOpencodeAuth()` to preserve plugin config
> - Updated AGENTS.md documenting OmO integration
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (version research) → Task 6 (Dockerfile) → Task 8 (E2E validation)

---

## Context

### Original Request

User wants to enhance all AI employee OpenCode sessions by integrating Oh My OpenAgent (`https://github.com/code-yeongyu/oh-my-openagent`), a plugin that transforms OpenCode into a multi-agent orchestration system with hash-anchored edits, LSP tools, AST-grep, built-in MCPs, background agents, and session recovery.

### Interview Summary

**Key Discussions**:

- **Which employees**: ALL employees get OmO (summarizer, guest-messaging, any future employees)
- **Model strategy**: User has personally tested OmO with minimax-m2.7 and confirms it works perfectly — all OmO agents use minimax/minimax-m2.7
- **Enhancement approach**: OmO enhances existing archetype instructions (does NOT replace them). OmO adds tools/capabilities on top.
- **Features to disable**: Team Mode, Tmux visualization, Telemetry, Auto-update checker
- **Features to keep**: Playwright/browser automation (Chromium in Docker), all other OmO features
- **OpenCode version**: User is open to upgrading from 1.14.31 if tested carefully. User's local OpenCode is version 1.3.17.
- **Config approach**: Build `oh-my-openagent.jsonc` from scratch (no existing config to port)

**Research Findings**:

- **CRITICAL: Harness overwrites opencode.json** — `writeOpencodeAuth()` in `opencode-harness.mts` writes `{"autoupdate":false}` to `~/.config/opencode/opencode.json` at runtime, erasing any plugin config baked during Docker build. Fix: update the write to include `"plugin": ["oh-my-openagent"]`.
- **CRITICAL: Bun must be in runtime image** — OpenCode loads plugins via Bun at startup. Cannot strip Bun in multi-stage build.
- **Pre-warm ordering critical** — Dockerfile pre-warm step (`opencode serve --port 4097`) must run AFTER OmO install so the plugin cache is baked in.
- **Config filename** — OmO in rename transition: plugin entry = `"oh-my-openagent"` (new), config file = `oh-my-openagent.jsonc` (current).
- **Playwright adds ~600-800MB** to Docker image. User explicitly requested it.
- **5 injection points**: opencode.json config, `opencode serve` args, AGENTS.md, Dockerfile, `writeOpencodeAuth()`.
- **Model routing**: Harness passes model per-prompt via SDK `{providerID: 'openrouter', modelID: '...'}`. OmO's model overrides apply at the plugin level separately.

### Metis Review

**Identified Gaps** (all addressed):

- **Harness overwrite bug**: `writeOpencodeAuth()` at lines 157-161 writes `{"autoupdate":false}` to global config, erasing plugin array → Task 4 fixes this
- **Bun runtime requirement**: OmO loads via Bun at startup, must remain in runtime image → Task 6 accounts for this
- **Pre-warm ordering**: Must install OmO before pre-warm step → Task 6 reorders Dockerfile
- **Config filename ambiguity**: Plugin vs config naming transition → Task 2 documents this
- **Playwright scope**: ~800MB image increase → Task 6 installs Chromium
- **Rollback strategy**: If OmO breaks workers → comment out `plugin` array in opencode.json
- **OmO verification**: Need to confirm plugin loads in headless Docker → Task 7 smoke tests

---

## Work Objectives

### Core Objective

Bake Oh My OpenAgent as an OpenCode plugin into the Docker image that all AI employees run, so every OpenCode session automatically gets OmO's enhanced tooling without any archetype-specific changes.

### Concrete Deliverables

- `src/workers/config/oh-my-openagent.jsonc` — OmO plugin config with all agents on minimax-m2.7
- Updated `src/workers/config/opencode.json` — plugin array added
- Updated `src/workers/opencode-harness.mts` — `writeOpencodeAuth()` preserves plugin config
- Updated `Dockerfile` — Bun, OmO install, Playwright/Chromium, telemetry env vars, reordered pre-warm
- Updated `AGENTS.md` — OmO integration documented

### Definition of Done

- [ ] `docker build -t ai-employee-worker:latest .` succeeds
- [ ] Container starts, OpenCode boots, OmO plugin is listed in `opencode plugin list`
- [ ] OmO tools (LSP, AST-grep, hash-anchored edits) are available in OpenCode sessions
- [ ] Existing employee workflows (summarizer, guest-messaging) still work end-to-end
- [ ] No telemetry is sent (DO_NOT_TRACK=1, OMO_SEND_ANONYMOUS_TELEMETRY=0)

### Must Have

- All OmO agents configured with minimax/minimax-m2.7 via OpenRouter
- Plugin config baked into Docker image at `~/.config/opencode/oh-my-openagent.jsonc`
- Harness `writeOpencodeAuth()` preserves plugin array when rewriting global config
- Pre-warm step runs AFTER OmO install
- Team Mode disabled
- Tmux visualization disabled
- Telemetry disabled
- Auto-update checker disabled
- Playwright/Chromium installed in Docker image

### Must NOT Have (Guardrails)

- **DO NOT replace archetype instructions** — OmO enhances, it does not control what employees do
- **DO NOT use any model other than minimax/minimax-m2.7** for OmO agents (per user's explicit testing)
- **DO NOT enable Team Mode** — adds complexity, not needed
- **DO NOT enable telemetry** — privacy requirement
- **DO NOT modify the harness's session creation logic** — only fix `writeOpencodeAuth()` to preserve plugin config
- **DO NOT touch employee-lifecycle.ts** — OmO is a worker-level change only
- **DO NOT add OmO-specific logic to shared platform files** (employee-agnostic rule)
- **DO NOT upgrade OpenCode version without explicit testing** — 1.14.33 has a confirmed regression

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: None for this task — OmO integration is infrastructure/Docker-level, not unit-testable
- **Framework**: N/A — verification is via Docker build + smoke test + E2E

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Docker build**: Use Bash — run `docker build`, verify exit code and image size
- **Container smoke test**: Use Bash — `docker run` with env vars, check logs for OmO plugin load
- **E2E validation**: Use Bash — trigger a real employee task, verify it completes with OmO tools available

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — research + config + harness fix):
├── Task 1: OpenCode version compatibility research [deep]
├── Task 2: OmO config file (oh-my-openagent.jsonc) [quick]
├── Task 3: Update opencode.json with plugin array [quick]
├── Task 4: Fix writeOpencodeAuth() to preserve plugin config [quick]
└── Task 5: Telemetry suppression env vars [quick]

Wave 2 (After Wave 1 — Docker build):
└── Task 6: Dockerfile overhaul (Bun + OmO + Playwright + reorder) [deep]

Wave 3 (After Wave 2 — validation + docs):
├── Task 7: Docker build + smoke test [unspecified-high]
├── Task 8: E2E employee task validation [unspecified-high]
└── Task 9: AGENTS.md documentation update [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 6 → Task 7 → Task 8 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 5 (Wave 1)
```

### Dependency Matrix

| Task | Depends On    | Blocks | Wave |
| ---- | ------------- | ------ | ---- |
| 1    | —             | 6      | 1    |
| 2    | —             | 6      | 1    |
| 3    | —             | 6      | 1    |
| 4    | —             | 6      | 1    |
| 5    | —             | 6      | 1    |
| 6    | 1, 2, 3, 4, 5 | 7, 8   | 2    |
| 7    | 6             | 8      | 3    |
| 8    | 7             | F1-F4  | 3    |
| 9    | —             | F1-F4  | 3    |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1 → `deep`, T2-T5 → `quick`
- **Wave 2**: **1** — T6 → `deep`
- **Wave 3**: **3** — T7-T8 → `unspecified-high`, T9 → `writing`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. OpenCode Version Compatibility Research

  **What to do**:
  - Investigate the version discrepancy: Docker uses npm `opencode-ai@1.14.31`, user's local `opencode --version` shows `1.3.17`. These appear to be different version tracks.
  - Check if `opencode-ai@1.14.31` supports the `plugin` array in `opencode.json`. Run `npm info opencode-ai versions --json` to see the full version history.
  - Check if `opencode-ai@1.3.17` exists or if the user's local version is a different distribution (e.g., Homebrew, Go binary).
  - Test `opencode plugin list` on the current Docker image to see if the plugin subsystem exists at all.
  - If the current version does NOT support plugins: determine the minimum version that does. Check OmO's docs for version requirements.
  - If upgrade is needed: check npm for available versions, identify the latest known-safe version (NOT 1.14.33 — confirmed regression), and update the install command in the Dockerfile.
  - Document findings for Task 6 (Dockerfile) to consume.

  **Must NOT do**:
  - Do NOT upgrade to version 1.14.33 (confirmed 6-second exit regression)
  - Do NOT change OpenCode version without verifying plugin support first

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Research task requiring investigation, testing, and decision-making about version compatibility
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `v-mermaid`: No diagrams needed for research

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: Task 6 (Dockerfile needs version decision)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `Dockerfile:48-52` — Current OpenCode install: `npm install -g opencode-ai@1.14.31` + platform binary. This is the exact line that may need version bump.
  - `Dockerfile:57-66` — Pre-warm step (`opencode serve --port 4097`). Plugin system must work before this step bakes the cache.

  **API/Type References**:
  - `src/workers/config/opencode.json` — Current config has no `plugin` key. Need to verify the version supports it.

  **External References**:
  - npm registry: `https://www.npmjs.com/package/opencode-ai` — version history
  - OmO installation guide: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md` — version requirements ("OpenCode 1.0.150+")
  - OmO GitHub: `https://github.com/code-yeongyu/oh-my-openagent` — README for compatibility info

  **WHY Each Reference Matters**:
  - Dockerfile lines show exact current install — agent must know what to change
  - OmO installation guide states minimum version — agent must cross-reference with npm versions
  - npm registry shows all available versions — agent needs this to pick a safe upgrade target

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Determine if current OpenCode version supports plugins
    Tool: Bash
    Preconditions: Docker image built with current Dockerfile
    Steps:
      1. Run `npm info opencode-ai versions --json | tail -30` to see recent versions
      2. Run `npm info opencode-ai@1.14.31 dependencies --json` to check for plugin-related deps
      3. Run `docker run --rm ai-employee-worker:latest opencode plugin list 2>&1` to test plugin subsystem
      4. If plugin list fails: search for minimum version supporting plugins via OmO docs
    Expected Result: Clear determination of whether 1.14.31 supports plugins, and if not, which version to upgrade to
    Failure Indicators: Unable to determine version compatibility after all research paths exhausted
    Evidence: .sisyphus/evidence/task-1-version-research.md

  Scenario: Verify recommended version does NOT have known regressions
    Tool: Bash
    Preconditions: Target version identified from happy path scenario
    Steps:
      1. Check that target version is NOT 1.14.33 (confirmed regression)
      2. Search for known issues with target version: `npm info opencode-ai@<version> --json`
      3. Document the version decision with rationale
    Expected Result: A safe OpenCode version identified that supports plugins without known regressions
    Failure Indicators: Only available plugin-supporting versions have known regressions
    Evidence: .sisyphus/evidence/task-1-version-safety-check.md
  ```

  **Commit**: NO (research only — no code changes)

---

- [ ] 2. Create OmO Config File (oh-my-openagent.jsonc)

  **What to do**:
  - Create `src/workers/config/oh-my-openagent.jsonc` with the following configuration:
    - All agents (sisyphus, hephaestus, prometheus, atlas, oracle, explore, librarian, metis, momus) use `minimax/minimax-m2.7` via `openrouter` provider
    - `team_mode: false` — disabled per user requirement
    - `enable_tmux_visualization: false` — disabled (headless Docker)
    - `telemetry: false` or equivalent — disabled per user requirement
    - `auto_update_checker: false` — disabled to prevent container self-update
    - `enable_playwright: true` — browser automation enabled per user requirement
    - Prometheus planner: disabled (our archetype instructions control what employees do)
  - Use the OmO configuration reference to ensure correct field names and structure
  - Include JSONC comments explaining each decision

  **Must NOT do**:
  - Do NOT use any model other than minimax/minimax-m2.7 for any agent
  - Do NOT enable Team Mode, Tmux, or telemetry
  - Do NOT enable Prometheus planner (archetype instructions are the source of truth)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file creation with well-defined content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5)
  - **Blocks**: Task 6 (Dockerfile copies this file into image)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/config/opencode.json` — Existing config file in the same directory. New file goes alongside it.
  - `src/workers/config/agents.md` — Another config file in the same directory (for reference to the pattern).

  **External References**:
  - OmO configuration reference: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/reference/configuration.md` — Full config schema with all field names, types, defaults
  - OmO features reference: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/reference/features.md` — Feature flags and their effects

  **WHY Each Reference Matters**:
  - Config reference is the source of truth for field names — agent must use exact schema
  - Features reference explains what each toggle does — agent needs this to disable correctly

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Config file is valid JSONC
    Tool: Bash
    Preconditions: File created at src/workers/config/oh-my-openagent.jsonc
    Steps:
      1. Read the file and verify it parses as valid JSONC (comments stripped, valid JSON underneath)
      2. Verify ALL agent model entries are set to minimax/minimax-m2.7
      3. Verify team_mode is false or equivalent
      4. Verify telemetry is disabled
      5. Verify tmux visualization is disabled
      6. Verify auto-update checker is disabled
      7. Verify Playwright/browser is enabled
    Expected Result: Valid JSONC file with all required settings matching specification
    Failure Indicators: Parse errors, wrong model names, missing disable flags
    Evidence: .sisyphus/evidence/task-2-config-validation.txt

  Scenario: No non-minimax models referenced
    Tool: Bash
    Preconditions: File exists
    Steps:
      1. grep -v '//' src/workers/config/oh-my-openagent.jsonc | grep -i 'model' to find all model references
      2. Verify NONE reference claude, gpt, gemini, kimi, or any non-minimax model
    Expected Result: Only minimax/minimax-m2.7 appears as model value
    Failure Indicators: Any model string other than minimax/minimax-m2.7
    Evidence: .sisyphus/evidence/task-2-model-check.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4)
  - Message: `feat(workers): add OmO plugin config and fix harness plugin preservation`
  - Files: `src/workers/config/oh-my-openagent.jsonc`
  - Pre-commit: `cat src/workers/config/oh-my-openagent.jsonc | node -e "process.stdin.on('data',d=>{try{JSON.parse(d.toString().replace(/\/\/.*/g,'').replace(/\/\*[\s\S]*?\*\//g,''))}catch(e){process.exit(1)}})"`

---

- [ ] 3. Update opencode.json with Plugin Array

  **What to do**:
  - Edit `src/workers/config/opencode.json` to add the `plugin` key:
    ```json
    {
      "permission": { "*": "allow", "question": "deny" },
      "autoupdate": false,
      "plugin": ["oh-my-openagent"]
    }
    ```
  - This is the project-level config that gets copied to `/app/opencode.json` in the Docker image
  - The plugin name is `"oh-my-openagent"` (the new canonical name, per OmO's rename transition)

  **Must NOT do**:
  - Do NOT change existing permission or autoupdate settings
  - Do NOT add any plugins other than oh-my-openagent

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition to existing JSON file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5)
  - **Blocks**: Task 6 (Dockerfile copies this file)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/config/opencode.json` — The exact file to modify (currently 4 lines: permission + autoupdate)

  **API/Type References**:
  - `Dockerfile:79` — `COPY src/workers/config/opencode.json /app/opencode.json` — This is how the config gets into the image

  **External References**:
  - OmO installation guide: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md` — Shows the expected `plugin` array format

  **WHY Each Reference Matters**:
  - opencode.json is the exact file — agent needs to see current content to make a clean edit
  - Dockerfile line shows how config enters the image — confirms the copy path is correct

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: opencode.json contains plugin array
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Read src/workers/config/opencode.json
      2. Parse as JSON and verify `plugin` key exists
      3. Verify `plugin` is an array containing exactly `"oh-my-openagent"`
      4. Verify `permission` and `autoupdate` keys are unchanged
    Expected Result: Valid JSON with plugin: ["oh-my-openagent"], permission unchanged, autoupdate: false
    Failure Indicators: Missing plugin key, wrong plugin name, changed permissions
    Evidence: .sisyphus/evidence/task-3-opencode-json.txt
  ```

  **Commit**: YES (groups with Tasks 2, 4)
  - Message: `feat(workers): add OmO plugin config and fix harness plugin preservation`
  - Files: `src/workers/config/opencode.json`
  - Pre-commit: `node -e "JSON.parse(require('fs').readFileSync('src/workers/config/opencode.json','utf8'))"`

- [ ] 4. Fix writeOpencodeAuth() to Preserve Plugin Config

  **What to do**:
  - In `src/workers/opencode-harness.mts`, modify the `writeOpencodeAuth()` function (lines 131-162) in TWO places:
    1. **Local project config** (lines 146-154): Change the config object from `{ permission: { '*': 'allow', question: 'deny' }, autoupdate: false }` to also include `plugin: ['oh-my-openagent']`
    2. **Global config** (lines 157-161): Change from `{ autoupdate: false }` to `{ autoupdate: false, plugin: ['oh-my-openagent'] }`
  - This is the critical fix — without it, the harness overwrites the plugin config baked during Docker build at runtime, causing OmO to not load.
  - The fix ensures that every time the harness writes config, it preserves the plugin array.

  **Must NOT do**:
  - Do NOT change the auth.json writing logic (lines 140-144)
  - Do NOT modify any other function in the harness
  - Do NOT touch session creation, monitoring, or completion logic
  - Do NOT add OmO-specific language to log messages (shared file, must stay employee-agnostic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small edits to JSON objects in a well-understood function
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5)
  - **Blocks**: Task 6 (Dockerfile build depends on correct harness)
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/workers/opencode-harness.mts:131-162` — The `writeOpencodeAuth()` function. Lines 146-154 write local project config. Lines 157-161 write global config. BOTH must be updated.
  - `src/workers/opencode-harness.mts:148-149` — The exact config object for local project config: `{ permission: { '*': 'allow', question: 'deny' }, autoupdate: false }` — add `plugin` here
  - `src/workers/opencode-harness.mts:159` — The exact global config object: `{ autoupdate: false }` — add `plugin` here

  **API/Type References**:
  - `src/workers/config/opencode.json` — The source of truth for opencode config shape (after Task 3 adds plugin array)

  **WHY Each Reference Matters**:
  - Lines 146-154 write the LOCAL config — if plugin is missing here, OmO won't load for the local project
  - Lines 157-161 write the GLOBAL config — this OVERWRITES the Docker-baked config, erasing plugin array
  - Both must be fixed because `writeOpencodeAuth()` runs at every container startup before OpenCode launches

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: writeOpencodeAuth includes plugin array in local config
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Read src/workers/opencode-harness.mts
      2. Find the configJson variable (around line 148)
      3. Verify it includes `plugin: ['oh-my-openagent']` in the JSON.stringify call
      4. Verify permission and autoupdate are unchanged
    Expected Result: configJson includes plugin array alongside existing keys
    Failure Indicators: Missing plugin key, changed other config values
    Evidence: .sisyphus/evidence/task-4-local-config.txt

  Scenario: writeOpencodeAuth includes plugin array in global config
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Read src/workers/opencode-harness.mts
      2. Find the globalConfigJson variable (around line 159)
      3. Verify it includes `plugin: ['oh-my-openagent']` alongside autoupdate: false
    Expected Result: globalConfigJson includes both autoupdate: false and plugin: ['oh-my-openagent']
    Failure Indicators: Missing plugin key, removed autoupdate setting
    Evidence: .sisyphus/evidence/task-4-global-config.txt

  Scenario: TypeScript compiles cleanly after changes
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. Run `pnpm build`
      2. Verify exit code is 0
      3. Verify no new TypeScript errors
    Expected Result: Clean compilation with exit code 0
    Failure Indicators: TypeScript errors, non-zero exit code
    Evidence: .sisyphus/evidence/task-4-build-check.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(workers): add OmO plugin config and fix harness plugin preservation`
  - Files: `src/workers/opencode-harness.mts`
  - Pre-commit: `pnpm build`

---

- [ ] 5. Add Telemetry Suppression Environment Variables

  **What to do**:
  - This task is absorbed into Task 6 (Dockerfile). The env vars (`DO_NOT_TRACK=1`, `OMO_SEND_ANONYMOUS_TELEMETRY=0`, `OPENCODE_TELEMETRY_DISABLED=1`) will be added as `ENV` directives in the Dockerfile during the OmO integration.
  - No separate action needed — Task 6 handles this.

  **NOTE**: This task exists for traceability. The actual work is in Task 6.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: N/A (absorbed into Task 6)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 6
  - **Blocked By**: None

  **Acceptance Criteria**:
  See Task 6 QA scenarios for telemetry env var verification.

  **Commit**: NO (covered by Task 6)

- [ ] 6. Dockerfile Overhaul — Bun + OmO + Playwright + Reorder

  **What to do**:
  - Modify the `Dockerfile` to integrate OmO into the Docker image. The changes are significant and order-sensitive:

  **Step 1: Install Bun** (after Node tools, before OpenCode):
  - Add `RUN curl -fsSL https://bun.sh/install | bash` (or equivalent)
  - Add Bun to PATH: `ENV BUN_INSTALL=/root/.bun` and `ENV PATH=$BUN_INSTALL/bin:$PATH`
  - Bun MUST remain in the runtime image (not stripped in multi-stage) — OpenCode loads plugins via Bun at startup

  **Step 2: Install OmO plugin** (after OpenCode install, before pre-warm):
  - Run: `RUN bun x oh-my-openagent install --no-tui` (or `bunx oh-my-openagent install --no-tui`)
  - This registers the plugin in OpenCode's plugin system
  - Verify install worked: `RUN opencode plugin list` (should show oh-my-openagent)

  **Step 3: Copy OmO config** (before pre-warm):
  - `COPY src/workers/config/oh-my-openagent.jsonc /root/.config/opencode/oh-my-openagent.jsonc`
  - This provides the all-minimax-m2.7 config for OmO agents

  **Step 4: Add telemetry suppression ENV vars**:
  - `ENV DO_NOT_TRACK=1`
  - `ENV OMO_SEND_ANONYMOUS_TELEMETRY=0`
  - `ENV OPENCODE_TELEMETRY_DISABLED=1`

  **Step 5: Install Playwright + Chromium** (for browser automation):
  - `RUN npx playwright install chromium --with-deps`
  - This adds ~600-800MB to the image. User explicitly requested this.

  **Step 6: Reorder pre-warm step**:
  - The existing pre-warm (`opencode serve --port 4097`) at lines 57-66 MUST run AFTER OmO install
  - Move the pre-warm block to AFTER Step 2-3, so the plugin cache is baked into the image
  - The global config write at lines 70-71 (`{"autoupdate":false}`) must ALSO include `"plugin": ["oh-my-openagent"]` — OR be removed entirely since `writeOpencodeAuth()` handles this at runtime (Task 4). Recommend removing the Dockerfile config write and letting the harness handle it.

  **Step 7: Update the existing global config write**:
  - Lines 70-71 currently write `{"autoupdate":false}` to `~/.config/opencode/opencode.json`
  - Change to `{"autoupdate":false,"plugin":["oh-my-openagent"]}` so the pre-warm has the plugin registered
  - This is needed so the pre-warm step (which runs `opencode serve`) can discover the plugin

  **Must NOT do**:
  - Do NOT remove Bun from the runtime image (OpenCode needs it for plugins)
  - Do NOT change the builder stage (first FROM)
  - Do NOT modify the worker-tools COPY blocks (lines 82-109)
  - Do NOT change the CMD (line 114)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex Dockerfile changes with order-sensitive steps, multiple new tool installations, and build verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential — depends on ALL Wave 1 tasks)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: Tasks 1, 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `Dockerfile:22-71` — Runtime stage: all installs and config. New Bun/OmO/Playwright installs go here.
  - `Dockerfile:48-52` — Current OpenCode install (`npm install -g opencode-ai@1.14.31`). May need version bump per Task 1 findings.
  - `Dockerfile:57-66` — Pre-warm step. Must be MOVED to after OmO install.
  - `Dockerfile:68-71` — Global config write. Must include plugin array.
  - `Dockerfile:79` — `COPY src/workers/config/opencode.json /app/opencode.json`. Plugin array is in this file after Task 3.

  **API/Type References**:
  - `src/workers/config/oh-my-openagent.jsonc` — Created by Task 2. Must be COPYed to `~/.config/opencode/oh-my-openagent.jsonc`.
  - `src/workers/config/opencode.json` — Updated by Task 3. Already COPYed at line 79.

  **External References**:
  - OmO installation guide: `https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/refs/heads/dev/docs/guide/installation.md` — Install command and flags
  - Bun install: `https://bun.sh/docs/installation` — Docker install pattern
  - Playwright install: `https://playwright.dev/docs/docker` — Chromium + deps install

  **WHY Each Reference Matters**:
  - Dockerfile lines are the exact insertion points — agent must preserve ordering
  - OmO install guide has the exact CLI command and flags
  - Task 1 findings determine whether the OpenCode version needs bumping here

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (tmux — long-running)
    Preconditions: Tasks 1-5 completed, all config files in place
    Steps:
      1. Run `docker build -t ai-employee-worker:latest .` (use tmux, may take 5-10 minutes)
      2. Wait for build to complete
      3. Verify exit code is 0
      4. Check image size: `docker images ai-employee-worker:latest --format '{{.Size}}'`
    Expected Result: Build succeeds. Image size increased by ~800MB-1.2GB compared to before (Playwright + Bun + OmO)
    Failure Indicators: Build fails at any step, image doesn't appear in `docker images`
    Evidence: .sisyphus/evidence/task-6-docker-build.txt

  Scenario: Telemetry env vars are set in image
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest env | grep -E 'DO_NOT_TRACK|OMO_SEND|OPENCODE_TELEMETRY'`
      2. Verify DO_NOT_TRACK=1
      3. Verify OMO_SEND_ANONYMOUS_TELEMETRY=0
      4. Verify OPENCODE_TELEMETRY_DISABLED=1
    Expected Result: All three env vars present with correct values
    Failure Indicators: Missing env vars, wrong values
    Evidence: .sisyphus/evidence/task-6-telemetry-env.txt

  Scenario: Bun is available in the runtime image
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest bun --version`
      2. Verify output is a valid version number
    Expected Result: Bun version printed (e.g., "1.2.x")
    Failure Indicators: "command not found" or error
    Evidence: .sisyphus/evidence/task-6-bun-check.txt

  Scenario: Chromium is available in the runtime image
    Tool: Bash
    Preconditions: Image built
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest npx playwright install --dry-run chromium 2>&1` or check if chromium binary exists
      2. Alternatively: `docker run --rm ai-employee-worker:latest chromium --version 2>&1 || docker run --rm ai-employee-worker:latest chromium-browser --version 2>&1`
    Expected Result: Chromium installed and accessible
    Failure Indicators: Missing binary, unmet dependencies
    Evidence: .sisyphus/evidence/task-6-chromium-check.txt
  ```

  **Commit**: YES
  - Message: `feat(docker): integrate OmO plugin with Bun, Playwright, and telemetry suppression`
  - Files: `Dockerfile`
  - Pre-commit: `docker build -t ai-employee-worker:latest .`

---

- [ ] 7. Docker Build Smoke Test — OmO Plugin Loads

  **What to do**:
  - Build the Docker image (if not already built by Task 6's commit check)
  - Run a smoke test container to verify OmO plugin loads correctly in the headless Docker environment:
    1. `docker run --rm -e OPENROUTER_API_KEY=test-key ai-employee-worker:latest opencode plugin list` — verify "oh-my-openagent" appears
    2. Start a container with an interactive shell and verify:
       - `opencode serve --port 4097 &` starts without errors
       - Plugin initialization logs appear (check `/tmp/oh-my-opencode.log` or stdout)
       - Kill the server
    3. Verify no telemetry network calls are made during startup
  - If plugin does NOT load: check error logs, verify config file paths, verify Bun is accessible

  **Must NOT do**:
  - Do NOT run a real employee task here (that's Task 8)
  - Do NOT modify any source files — this is verification only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Docker container verification requiring careful inspection of logs and behavior
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must run before Task 8)
  - **Parallel Group**: Wave 3 (sequential with Task 8)
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `Dockerfile` — The image just built. Agent needs to know what commands are available inside.
  - `src/workers/config/oh-my-openagent.jsonc` — Expected at `~/.config/opencode/oh-my-openagent.jsonc` inside the container
  - `src/workers/config/opencode.json` — Expected at `/app/opencode.json` inside the container

  **WHY Each Reference Matters**:
  - Agent needs to know the expected file paths inside the container to verify they're present
  - Plugin list command confirms OmO is registered and loadable

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: OmO plugin appears in plugin list
    Tool: Bash
    Preconditions: Docker image built successfully (Task 6)
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest opencode plugin list 2>&1`
      2. Verify output contains "oh-my-openagent"
    Expected Result: "oh-my-openagent" listed as an installed plugin
    Failure Indicators: Plugin not listed, error during plugin list, "no plugins installed"
    Evidence: .sisyphus/evidence/task-7-plugin-list.txt

  Scenario: OmO config file exists at expected path in container
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run `docker run --rm ai-employee-worker:latest cat ~/.config/opencode/oh-my-openagent.jsonc 2>&1`
      2. Verify file contents match the config from Task 2
      3. Verify all models are minimax/minimax-m2.7
    Expected Result: Config file present and contains correct content
    Failure Indicators: File not found, wrong content, non-minimax models
    Evidence: .sisyphus/evidence/task-7-config-in-container.txt

  Scenario: OpenCode server starts with OmO loaded (no crash)
    Tool: Bash
    Preconditions: Docker image built
    Steps:
      1. Run container in background: `docker run --rm -d --name omo-smoke-test -e OPENROUTER_API_KEY=test-key ai-employee-worker:latest sleep 120`
      2. Exec into container: `docker exec omo-smoke-test bash -c "opencode serve --port 4097 &>/tmp/serve.log &"`
      3. Wait 15 seconds: `sleep 15`
      4. Check logs: `docker exec omo-smoke-test cat /tmp/serve.log`
      5. Check plugin log: `docker exec omo-smoke-test cat /tmp/oh-my-opencode.log 2>/dev/null || echo 'no plugin log'`
      6. Verify no crash or fatal error in logs
      7. Cleanup: `docker stop omo-smoke-test`
    Expected Result: OpenCode starts, OmO plugin initializes, no crashes
    Failure Indicators: Crash on startup, "plugin failed to load" errors, OOM
    Evidence: .sisyphus/evidence/task-7-server-start.txt
  ```

  **Commit**: NO (verification only)

- [ ] 8. E2E Employee Task Validation

  **What to do**:
  - With the OmO-enhanced Docker image built and smoke-tested, run a real employee task end-to-end to verify that:
    1. The harness starts normally
    2. OpenCode boots with OmO plugin loaded
    3. OmO tools (LSP, AST-grep, hash-anchored edits) are available in the session
    4. The employee completes its task successfully
    5. The existing workflow (approval card, delivery) is unaffected
  - Use the guest-messaging employee test flow:
    1. Ensure services are running (`pnpm dev`)
    2. Simulate a Hostfully webhook (see AGENTS.md for the curl command)
    3. Monitor the task through the lifecycle
    4. Verify OmO-related log entries appear in worker logs
    5. Verify the task reaches Reviewing/Done status
  - If the task fails: check worker logs for OmO-related errors, verify the harness wrote correct configs

  **Must NOT do**:
  - Do NOT modify any code during this task — pure verification
  - Do NOT skip the E2E test and mark as "manually verified"

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Full E2E validation requiring services running, webhook triggering, log inspection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 9)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `AGENTS.md` — "Simulate a webhook locally" section has the exact curl command for guest-messaging webhook
  - `src/workers/opencode-harness.mts` — Harness startup logs to look for (e.g., "OpenCode session created", "OpenRouter auth.json written")

  **External References**:
  - AGENTS.md "Guest-Messaging Employee" section — full webhook curl command and expected flow

  **WHY Each Reference Matters**:
  - Agent needs the exact webhook curl to trigger a real task
  - Agent needs to know what log entries to expect from the harness to verify OmO loaded

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Employee task completes with OmO-enhanced worker
    Tool: Bash (tmux — long-running)
    Preconditions: Services running (pnpm dev), Docker image built with OmO, Hostfully API key configured
    Steps:
      1. Verify services: curl localhost:7700/health → 200
      2. Trigger guest-messaging webhook:
         curl -X POST http://localhost:7700/webhooks/hostfully \
           -H "Content-Type: application/json" \
           -d '{"agency_uid":"942d08d9-82bb-4fd3-9091-ca0c6b50b578","event_type":"NEW_INBOX_MESSAGE","message_uid":"omo-test-001","thread_uid":"2f18249a-9523-4acd-a512-20ff06d5c3fa","lead_uid":"37f5f58f-d308-42bf-8ed3-f0c2d70f16fb","property_uid":"c960c8d2-9a51-49d8-bb48-355a7bfbe7e2"}'
      3. Note the task_id from response
      4. Monitor: GET /admin/tenants/00000000-0000-0000-0000-000000000003/tasks/{task_id}
      5. Wait for status to reach Executing → Submitting (or Done if pre-check fires)
      6. Check worker container logs for OmO plugin initialization
    Expected Result: Task reaches Submitting or Done. Worker logs show OmO loaded.
    Failure Indicators: Task stuck in Executing, harness crash, "plugin failed to load" in logs
    Evidence: .sisyphus/evidence/task-8-e2e-run.txt

  Scenario: Existing workflow unaffected (approval card, delivery)
    Tool: Bash
    Preconditions: Task reached Reviewing with approval card
    Steps:
      1. If task reached Reviewing: verify approval card appeared in Slack
      2. Verify card content is correct (guest name, property, proposed response)
      3. If pre-check auto-completed (last message from host): verify task went to Done quickly — this is expected and correct
    Expected Result: Workflow behaves identically to pre-OmO behavior
    Failure Indicators: Missing approval card, wrong content, task stuck
    Evidence: .sisyphus/evidence/task-8-workflow-check.txt
  ```

  **Commit**: NO (verification only)

---

- [ ] 9. AGENTS.md Documentation Update

  **What to do**:
  - Update `AGENTS.md` to document the OmO integration. Add a new section after the "OpenCode Worker" section:

    ```markdown
    ## OmO Plugin (Oh My OpenAgent)

    All employee workers run with the Oh My OpenAgent plugin, which enhances OpenCode with:

    - Hash-anchored edits (improved edit success rate)
    - LSP tools (goto_definition, find_references, rename)
    - AST-grep (pattern-aware code search/replace)
    - Built-in MCPs (Exa web search, Context7 docs, Grep.app GitHub code search)
    - Background agents (parallel exploration)
    - Session recovery (auto-recovery from errors and context limits)

    **Configuration**: `src/workers/config/oh-my-openagent.jsonc` — all agents use `minimax/minimax-m2.7` via OpenRouter.

    **Disabled features**: Team Mode, Tmux visualization, Telemetry, Auto-update checker, Prometheus planner.

    **Telemetry suppression**: `DO_NOT_TRACK=1`, `OMO_SEND_ANONYMOUS_TELEMETRY=0`, `OPENCODE_TELEMETRY_DISABLED=1` set in Dockerfile.

    **Plugin registration**: `opencode.json` contains `"plugin": ["oh-my-openagent"]`. The harness `writeOpencodeAuth()` preserves this setting when rewriting config at runtime.

    **Rollback**: To disable OmO, remove `"oh-my-openagent"` from the `plugin` array in `src/workers/config/opencode.json` and `src/workers/opencode-harness.mts`, then rebuild the Docker image.
    ```

  - Also update the "OpenCode version" bullet if Task 1 results in a version change.
  - Also add `oh-my-openagent.jsonc` to the list of config files in the "Config Files" description.

  **Must NOT do**:
  - Do NOT use employee-specific language in the OmO section (it's a platform-wide feature)
  - Do NOT add emojis

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Documentation update requiring clear, concise technical writing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: None (can write docs based on plan, doesn't need build to succeed first)

  **References**:

  **Pattern References**:
  - `AGENTS.md` — The file to update. Look for "## OpenCode Worker" section — new OmO section goes after it.
  - `AGENTS.md` — "OpenCode version — CRITICAL" bullet — may need version update per Task 1.

  **WHY Each Reference Matters**:
  - Agent needs to find the right insertion point in AGENTS.md
  - Agent needs to update version references if Task 1 changed the OpenCode version

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: AGENTS.md contains OmO section
    Tool: Bash
    Preconditions: File updated
    Steps:
      1. grep "OmO Plugin" AGENTS.md
      2. Verify the section exists and contains key info: minimax-m2.7, disabled features, telemetry env vars
      3. Verify no employee-specific language in the section
      4. Verify no emojis
    Expected Result: OmO section present with all required information
    Failure Indicators: Missing section, employee-specific language, missing config references
    Evidence: .sisyphus/evidence/task-9-agents-md.txt

  Scenario: Lint passes after AGENTS.md update
    Tool: Bash
    Preconditions: File updated
    Steps:
      1. Run `pnpm lint`
      2. Verify exit code is 0
    Expected Result: No lint errors
    Failure Indicators: Lint errors in AGENTS.md
    Evidence: .sisyphus/evidence/task-9-lint.txt
  ```

  **Commit**: YES
  - Message: `docs(agents): document OmO plugin integration`
  - Files: `AGENTS.md`
  - Pre-commit: `pnpm lint`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Verify Dockerfile follows multi-stage build best practices.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Start from clean state. Build Docker image. Run container with test env vars. Verify OmO plugin loads. Trigger a guest-messaging employee task. Verify task completes successfully. Save evidence to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

- [ ] 10. **Notify completion** — Send Telegram notification: plan `omo-integration` complete, all tasks done, come back to review results.

---

## Commit Strategy

| Wave | Commit Message                                                                       | Files                                                                                                              | Pre-commit Check                              |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| 1    | `feat(workers): add OmO plugin config and fix harness plugin preservation`           | `src/workers/config/oh-my-openagent.jsonc`, `src/workers/config/opencode.json`, `src/workers/opencode-harness.mts` | `pnpm build`                                  |
| 2    | `feat(docker): integrate OmO plugin with Bun, Playwright, and telemetry suppression` | `Dockerfile`                                                                                                       | `docker build -t ai-employee-worker:latest .` |
| 3    | `docs(agents): document OmO plugin integration`                                      | `AGENTS.md`                                                                                                        | `pnpm lint`                                   |

---

## Success Criteria

### Verification Commands

```bash
docker build -t ai-employee-worker:latest .  # Expected: successful build
docker run --rm -e OPENROUTER_API_KEY=test ai-employee-worker:latest opencode plugin list  # Expected: oh-my-openagent listed
pnpm build  # Expected: no TypeScript errors
pnpm test -- --run  # Expected: all tests pass (same count as before)
```

### Final Checklist

- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] Docker build succeeds
- [ ] OmO plugin loads in container
- [ ] Existing employee workflows unaffected
- [ ] No telemetry leakage
