# Round 2 Learnings

## Task 11 — Approved LLM Models section trim

- **Two surgical Edit calls** were sufficient — no whole-section rewrite needed.
  - Edit 1: collapsed the 14-model seeded catalog list + the long "Recommended for E2E testing" reliability paragraph into a single pointer line (`See creating-archetypes skill...`).
  - Edit 2: replaced the multi-sentence OpenCodeGo routing paragraph with the one-line pointer (`creating-archetypes skill + src/lib/go-models.ts`).
- **Kept loud (per plan):** CRITICAL CONSTRAINT — NEVER VIOLATE header, the two-category rule table, the "Execution model selection — how it works" paragraph, the OpenCode VM size CRITICAL paragraph, the Forbidden-hardcoded-references NEVER rule, and the retired-engineering-employee one-liner.
- **Net effect:** AGENTS.md 652 → 650 lines (the section's value is density, not line count — the big win is removing volatile content per the Documentation Durability rule: the 14-model catalog list and per-model E2E quirks were classic "volatile facts" that rot on any catalog change).
- **QA evidence:** `.sisyphus/evidence/round2-task-11-models.txt` — all 8 scenarios pass; `zhipu/glm-5.1` and `Recommended for E2E testing` both grep to 0.
- **Commit hygiene:** lint-staged emitted "could not find any staged files matching configured tasks" (benign — no .ts/.json staged) and the commit still succeeded. `.sisyphus/` is gitignored, so only AGENTS.md needed staging; working tree clean after commit.

## Task 17 — Project Structure trim (2026-06-16)

**What was done**: Replaced the bloated `## Project Structure` code block with a lean directory tree. The old block had:

- `workers/lib/` as a ~800-char comma-separated enumeration of every `.mts` file
- `gateway/services/` as a 3-sentence essay about archetype-generator internals
- `gateway/slack/` listing every per-action module by name
- `inngest/lifecycle/steps/` listing every step file
- `repositories/` listing all 4 repos with method signatures
- `lib/` as a ~20-file enumeration with bold annotations

**Pattern used**: Each dir gets one short purpose line. Bloated sub-dirs get "browse dir + load relevant skill for detail." Three load-bearing files survive explicitly: `events.ts`, `postgrest-headers.ts`, `http-response.ts`.

**Canary pattern**: `approval-card-poster.mts` was the canary — its absence confirms the `workers/lib/` essay is gone.

**Commit**: `docs(agents): trim project-structure tree to dirs + load-bearing files`

**Evidence**: `.sisyphus/evidence/round2-task-17-structure.txt` (gitignored, local only)

## Task 18 — E2E sections collapse (2026-06-16)

**What was done**: Collapsed two verbose E2E sections (`## Post-Implementation E2E Testing` and `## Plan E2E Validation`) into one tight `## E2E Testing (MANDATORY...)` block. Net: 69 lines deleted, 5 inserted (64-line reduction).

**Deleted content** (already migrated to `e2e-testing` skill):

- `### How to self-test` bash block (pgrep, lsof, tail -f, kill %1)
- `### Gateway stability rule` bash block (GATEWAY_PID, lsof, ps)
- Scenario-guide table (`| Guide | Scenarios | Domain |`)
- Minimum-scenario lines (guest-messaging, archetype generator, Slack trigger)
- `### Plan template (Final Verification Wave)` markdown code block
- "No plan passes its Final Verification Wave..." closing line

**Kept loud (per plan):**

- "YOU MUST run a real end-to-end test..." mandate
- `"Code looks correct" is not a substitute for actual execution`
- Three-bullet MUST list (run live path, observe real output, document what you observed)
- Four-bullet "without a live test, you cannot detect" list
- "Slack trigger workflow changes require live @mention E2E" heading
- Single-gateway pre-flight requirement
- Live @mention → Confirm → Done E2E requirement
- `"Verified from code" or "unit tests pass" is explicitly insufficient`
- Skill pointer: `Full pre-flight scripts, scenario tables, and plan template → load \`e2e-testing\` skill.`

**QA evidence**: `.sisyphus/evidence/round2-task-18-e2e.txt` — pgrep count=0, all 4 mandate phrases PASS, scenario table count=0, plan template count=0.

**Commit**: `docs(agents): collapse E2E sections to mandate + skill pointer`

## Task 19 — Future Work deletion + Reference Table prune+trim (2026-06-16)

**What was done**: Three sub-steps in one pass:

1. Deleted `### Future Work (Backlog — Not in Current Plan)` section (7 lines: heading, intro sentence, 2 bullets).
2. Pruned 9 stale rows from the Reference Documents table (closed research spikes, superseded architecture docs, closed planning docs, deprecated employees).
3. Trimmed all surviving "When to Read" cells from verbose multi-clause sentences to short trigger phrases (10-15 words).

**Pruned rows** (all confirmed 0 occurrences post-edit):

- `docs/architecture/2026-03-22-2317-ai-employee-architecture.md` — superseded by CURRENT-ARCHITECTURE.md
- `docs/architecture/2026-04-14-0057-worker-post-redesign-overview.md` — historical, no longer actionable
- `docs/planning/2026-04-21-2202-phase1-story-map.md` — closed planning doc
- `docs/planning/2026-04-21-1813-product-roadmap.md` — closed planning doc
- `docs/architecture/airbnb-integration/2026-05-12-1120-go-no-go-decision.md` — closed research spike
- `docs/architecture/airbnb-integration/2026-05-12-1120-ecosystem-landscape.md` — closed research spike
- `docs/architecture/airbnb-integration/2026-05-12-1120-partner-api-next-steps.md` — closed research spike
- `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — deprecated/on-hold employee
- `docs/employees/cleaning-schedule.md` — deprecated/on-hold employee

**Telegram section**: Byte-identical to baseline (git show 727f541d). Lines 407-428 untouched.

**Net effect**: 497 → 481 lines (16-line reduction). Reference table went from 33 rows to 24 rows.

**Approach**: Single Edit call replaced the entire Reference Documents table block — cleaner than 9 individual row deletions + 24 cell trims.

**Commit**: `docs(agents): drop future-work backlog; prune+trim reference table`

**Evidence**: `.sisyphus/evidence/round2-task-19-refs-telegram.txt` (gitignored, local only)

## Task 20 — Tripwire-coverage audit + TOC refresh (2026-06-16)

**What was done**: Verification + gap-fill pass. All 5 tripwires (Tasks 16) and the meta-instruction (Task 10) were already present — no tripwire content needed adding. The only fix was 2 dead TOC anchors left behind by Task 18's section rename/merge.

**6 grep checks — all PASS on first run** (no gap-fill needed):

- `dashboard.*react-dashboard.*FIRST`, `gateway route.*api-design`, `shell tool.*adding-shell-tools`, `archetype.*creating-archetypes`, `auth.*security|secrets.*security`, `before editing any file.*load`

**TOC fix**: Removed 2 dead entries (`#post-implementation-e2e-testing-...` renamed, `#plan-e2e-validation-mandatory` deleted), replaced with 1 live `[E2E Testing](#e2e-testing-mandatory--applies-to-every-implementation)`. Confirmed `## Future Work`, `## Plan E2E Validation`, `## Post-Implementation` headings all GONE.

**Anchor-validation gotcha**: GitHub's slug algorithm maps each space to a hyphen ONE-TO-ONE (no collapse). A naive `\s+`→`-` validator produces false DEAD positives on headings with `& ` or em-dash-space (e.g. `Authentication & Authorization` → `authentication--authorization`). Correct regex: `.toLowerCase().replace(/[^\w\s-]/g,'').replace(/ /g,'-')` — single-space replace, NOT `\s+`. With the correct algo: 20/20 TOC anchors resolve, DEAD COUNT 0. The existing `cicd--auto-deploy--...` entry was the reference proof that double-hyphens are correct.

**Note**: python3 unavailable via asdf in this repo (`.tool-versions` has no python) — used `node` for the anchor-validation script instead.

**Net effect**: 481 → 480 lines (1-line reduction from TOC consolidation). Documentation-only, no source touched.

**Commit**: `docs(agents): ensure tripwire coverage + refresh TOC`

**Evidence**: `.sisyphus/evidence/round2-task-20-tripwires.txt`
