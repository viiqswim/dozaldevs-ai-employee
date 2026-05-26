
## Task 1: Dockerfile blanket COPY + worker-tools/package.json (2026-05-25)

### What was done
- Created `src/worker-tools/package.json` with `@slack/web-api: "^7.15.1"` as the only dependency
- Replaced 50 individual per-file COPY lines (lines 84–133) in Dockerfile with 3 lines:
  - `COPY --from=builder /build/src/worker-tools/ /tools/`
  - `RUN cd /tools && npm install --production`
  - `ENV NODE_PATH=/tools/node_modules`
- Removed old `/tool-deps/slack` approach (`mkdir -p /tool-deps/slack`, `npm install --prefix /tool-deps/slack`, `ENV NODE_PATH=/tool-deps/slack/node_modules`)

### Key findings
- Builder stage WORKDIR is `/build`, so source path is `/build/src/worker-tools/`
- `@slack/web-api` is the ONLY external npm dep across all 25+ tool files
- Blanket COPY preserves all subdirectories and fixtures automatically
- `NODE_PATH=/tools/node_modules` makes tsx resolve `@slack/web-api` from the shared install
- All preserved lines (entrypoint.sh, opencode.json, skills/, agents.md, LABEL, CMD) remain intact

### Verification results
- `grep -c "COPY.*worker-tools.*\.ts" Dockerfile` → 0 ✅
- `grep -c "tool-deps" Dockerfile` → 0 ✅
- `grep -c "NODE_PATH=/tools/node_modules" Dockerfile` → 1 ✅
- `node -e "require('./src/worker-tools/package.json')"` → valid JSON ✅

## Task 3 — README test count cleanup (2026-05-25)
- Replaced "1490 passing, 27 skipped, 0 failures" with "All tests should pass with 0 failures"
- The two skip explanations (inngest-serve.test.ts, container-boot.test.ts) were preserved unchanged
- Line 216 in README.md was the only occurrence of "1490"

## Task 4 — adding-shell-tools skill update (2026-05-25)

- Skill file: `.opencode/skills/adding-shell-tools/SKILL.md`
- Edit 1 (Step 5): Changed dep location from root `package.json` → `src/worker-tools/package.json`
- Edit 2 (Step 6): Replaced per-tool AGENTS.md instruction with service-directory-only guidance
- Edit 3 (Common Mistakes table): Updated "Every new tool" → "New service directories only"
- Note: Step 7 still says "Add a usage example to the archetype's instructions" — this is correct and unrelated to Step 6's AGENTS.md guidance

## Task 5 — Guide deps update (2026-05-25 18:55)
- Guide at docs/guides/2026-05-04-1645-adding-a-shell-tool.md updated in-place (living doc, not snapshot)
- Edit 1: line 147 — 'root package.json' → 'src/worker-tools/package.json'
- Edit 2: Section 6 — replaced per-tool CLI syntax block with service-directory-only guidance
- Verification: grep confirms both changes, no regressions on other sections


## Task 2: AGENTS.md Cleanup (2026-05-25)

### Changes Made
- **A1**: Removed `(25 models), 28 migrations` from `prisma/` line in Project Structure
- **A2**: "1490 passing" was already absent from AGENTS.md (only in README.md) — no change needed
- **A3**: Replaced verbose `src/lib/` module list with structural note pointing to `call-llm.ts`, `encryption.ts`, `model-selection/`, and `Browse src/lib/`
- **A4**: Replaced `gateway/services/` enumeration with structural note pointing to `Browse src/gateway/services/`
- **A5**: Replaced ~25 lines of per-tool CLI syntax (Sifely 9 tools, Hostfully 2 door-code tools, Jira 5 tools + auth block, Platform 2 tools) with a 6-row service table + `--help` reference
- **A6**: Removed the `Inngest functions (deregistered)` bullet line entirely
- **B**: Added 6 new rows to Commands table: docker:start, docker:stop, docker:reset, docker:status, dashboard:build, dev:e2e

### Key Findings
- The "deregistered" word still appears once in Project Structure (`triggers/` directory description) — this is correct and intentional
- The 5 active Inngest functions list was preserved exactly
- SYNTHESIS_THRESHOLD, MAX_EMPLOYEE_RULES_CHARS, MAX_EMPLOYEE_KNOWLEDGE_CHARS all preserved
- Approved LLM Models, Deprecated Components, Reference Documents all untouched

## Task 7 — Build + lint + Docker build (Mon May 25 2026)

### Key finding: All three checks have PRE-EXISTING failures unrelated to this plan

**pnpm build** — EXIT_CODE:2 (pre-existing)
- Root cause: `import.meta` in worker-tools files (ESM-only) vs CommonJS tsconfig.build.json target
- Files: hostfully/get-messages.ts, get-property.ts, get-reservations.ts, send-message.ts; jira/add-comment.ts, get-issue.ts, list-comments.ts, search-issues.ts; sifely/rotate-property-code.ts
- Confirmed pre-existing: same errors with `git stash` (before our changes)

**pnpm lint** — EXIT_CODE:1 (pre-existing)
- Root cause: ESLint config ignores `dist/**` but NOT `dashboard/dist/**` or `.sisyphus/evidence/**`
- 3759 problems (3668 errors, 91 warnings) — all from dashboard build artifacts and sisyphus evidence scripts
- Confirmed pre-existing: same count with `git stash`

**docker build** — EXIT_CODE:2 (pre-existing)
- Root cause: Docker build fails at `RUN pnpm build` (line 17) — same TS errors as above
- The new Dockerfile changes (blanket COPY + npm install) are syntactically correct but unreachable
- Confirmed pre-existing: same failure with `git stash`

### Impact on this plan
NONE — this plan only modifies Dockerfile, AGENTS.md, README.md, skill files, and guide docs.
No TypeScript source files were modified. The Dockerfile changes are correct and would work
if the pre-existing TS build errors were fixed.

### Evidence saved
- .sisyphus/evidence/task-7-build.txt
- .sisyphus/evidence/task-7-lint.txt
- .sisyphus/evidence/task-7-docker-build.txt

## Task 7b — tsconfig.build.json fix (2026-05-25 19:33)
- Added "src/worker-tools/**/*" to exclude in tsconfig.build.json
- Reason: worker-tools use import.meta.url (ESM) but tsconfig.build.json targets CommonJS output
- worker-tools run via tsx at runtime — they don't need to be compiled to dist/
- pnpm build result: PASS (EXIT_CODE:0)

## Task 7+8 — Docker build + smoke tests + commit (2026-05-25)
- Docker build: PASS (exit 0, cached layers, completed in <30s)
- submit-output.ts present in /tools/platform/: YES — BUG FIX VERIFIED
- @slack/web-api resolves: YES (post-message.ts --help exit 0)
- All 6 service directories present: YES (slack, hostfully, sifely, jira, knowledge_base, platform)
- Tool count: 32 .ts files in /tools (excluding node_modules)
- Commit: eb8c6e8 — "refactor: simplify Dockerfile tool COPY and clean up stale AGENTS.md inventories"
- Working tree: clean after commit (only untracked .sisyphus/ files remain)
