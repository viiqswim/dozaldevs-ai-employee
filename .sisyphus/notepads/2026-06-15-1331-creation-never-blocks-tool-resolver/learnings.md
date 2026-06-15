# Learnings — creation-never-blocks-tool-resolver

## [2026-06-15] Session Start

### Key Architecture Facts (code-verified)

- `ALL_TOOL_DESCRIPTORS` in `src/lib/tool-registry.ts` — authoritative tool list
- `toolInvocationPath(d)` returns `tsx /tools/service/tool.ts` — strip `tsx ` prefix to get the path
- `validateTools()` at `archetype-edit-helpers.ts:84-128` — the reject logic to replace
- `validateProposalFields()` at `archetype-edit-helpers.ts:130-190` — shared by both routes
- `ValidateProposalResult` type at `archetype-edit-helpers.ts:31-33`
- `converse-create` 422 at `admin-archetype-converse-create.ts:215-219`
- `propose-edit` 422 at `admin-archetype-propose-edit.ts:190-194`
- `postProcess()` at `archetype-generator.ts:358-433` — DO NOT MODIFY
- `isToolAllowed()` at `execution-phase.mts:79-89` — DO NOT MODIFY
- `converse()` degrade-to-no_change at ~lines 879, 887 in archetype-generator.ts
- `agents-md-compiler.mts` does NOT read `tool_registry` at all

### Resolver Design (confirmed)

- Return shape: `{ resolved: string[]; dropped: Array<{ tool: string; reason: string }> }`
- Normalization order: (a) strip `tsx ` prefix; (b) bare `service/tool` → `/tools/service/tool.ts`; (c) `/tools/`-prefixed missing extension AND not Composio → append `.ts`; (d) leave `/tools/composio/...` as-is
- Exact-match against descriptor set — no fuzzy
- Idempotent

### Never-Block Policy

- tools: resolve + drop unknowns + log — NEVER an error
- trigger_sources invalid: coerce to `{ type: 'manual' }` + log — NEVER an error
- input_schema invalid: drop invalid items, keep valid — NEVER an error
- prose-went-blank on EDIT: convert to plain-English re-ask (`kind:'question'`) — NOT a 422

### Tenant for E2E

- `00000000-0000-0000-0000-000000000002` (DozalDevs)

## [2026-06-15] Task 1 — resolveToolPaths() Implementation

### Module Placement Decision
Placed in `src/gateway/lib/archetype-edit-helpers.ts` (not a sibling file) because:
- The module already imports `ALL_TOOL_DESCRIPTORS` and `toolInvocationPath` from `tool-registry.ts`
- `validateProposalFields` will consume `resolveToolPaths` in Task 2 — co-location eliminates an import
- The `ToolDescriptor` type was added to the existing import from `tool-registry.ts`

### Implementation Notes
- `normalizeToolPath()` is a private helper (not exported) — handles the 4 normalization rules in order
- `COMPOSIO_PATTERN = /^\/tools\/composio\//` — module-level const, avoids re-creating regex per call
- Composio toolkit extraction: `normalized.split('/')[3]` — e.g. `/tools/composio/notion` → `notion`
- Default params: `descriptors = ALL_TOOL_DESCRIPTORS`, `connectedToolkits = []`
- The `ResolveToolPathsResult` interface is exported (Task 2 will need it)
- `normalizeToolPath` leaves non-`/tools/`-prefixed, non-2-part paths unchanged (will be dropped as unknown)

### Normalization edge cases
- `tsx /tools/foo/bar.ts` → strip `tsx ` → `/tools/foo/bar.ts` (has extension, composio check skipped) → in shellToolPaths? → resolve
- `foo/bar/baz` (3 parts, no slash) → not 2-part bare, no `/tools/` prefix → stays as-is → not in shellToolPaths → dropped
- `/tools/composio/notion/something` → composio pattern matches → toolkit = `notion` → check connectedSet

### TDD Flow
- Tests written first (red), then implementation (green)
- All 7 matrix scenarios pass; 0 regressions in 171-file suite

## [2026-06-15] Task 6 — Observability helpers + degraded no_change differentiation

### Logging Convention for Tool Drops/Coercions (USE THIS IN TASKS 2/3/4)

A reusable helper now exists in `src/lib/logger.ts`:

```ts
export interface ToolResolutionEvent {
  tenantId?: string | null;
  archetypeId?: string | null;   // null on CREATE (no archetype yet)
  originalTool: string;
  outcome: 'dropped' | 'normalized';
  reason?: string;               // human reason for a drop
  resolvedTo?: string;           // present on normalize
}
export function logToolResolution(logger: pino.Logger, event: ToolResolutionEvent): void
```

- Emits ONE `log.warn` per drop/coerce: msg = `tool path dropped` | `tool path normalized`.
- Tasks 2/3/4 MUST call this for every dropped/normalized tool so operators get a
  single queryable record (filter on `outcome` / `originalTool` / `tenantId`).
- Import: `import { logToolResolution } from '../../lib/logger.js';` (path-relative).
- The validator already has tenantId/archetypeId in scope at the route layer; pass
  them through. On converse-create, archetypeId is null.

### Degraded no_change Differentiation (converse())

The two degrade-to-no_change branches in `archetype-generator.ts` `converse()` now
carry a structured discriminator so a swallowed failure is queryable, distinct from
a legit no-op. API contract UNCHANGED — both still return `{ kind: 'no_change' }`.

- LLM-call failure (was `log.error({err},'...LLM call failed...')`):
  `log.error({ err, degraded: true, reason: 'llm_call_failed' }, 'converse: degraded to no_change after LLM call failed')`
- Parse failure (was `log.warn('...failed to parse...')`):
  `log.warn({ degraded: true, reason: 'parse_failed' }, 'converse: degraded to no_change after failing to parse LLM response')`
- A genuine `{kind:'no_change'}` from the model emits NO degraded log.
- Operators query `{ degraded: true }` to find swallowed failures.

### Testing the module-level `log` (pino) — gotcha

`archetype-generator.ts` binds `const log = createLogger('archetype-generator')` at
module load. To spy on it in a unit test, partial-mock the logger module:

```ts
const { logMock } = vi.hoisted(() => { const m = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(), child: vi.fn() }; m.child.mockReturnValue(m); return { logMock: m }; });
vi.mock('../../../../src/lib/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('.../logger.js')>();
  return { ...actual, createLogger: () => logMock, taskLogger: () => logMock };
});
```

- MUST spread `...actual` — other modules in the graph import logStep/logTool/etc.;
  a full mock breaks load. (Reason kept as the one necessary comment in the test.)
- pino call shape is `(obj, msg)` → assert `call[0]` (fields) and `call[1]` (message).
- Existing precedent: `tests/unit/inngest/lifecycle-helpers.test.ts` uses the simpler
  `createLogger: () => ({ warn: mockWarn, info: vi.fn() })` (no importOriginal) because
  that module graph doesn't need the other helpers. Use importOriginal when it might.

### Files touched (Task 6)
- `src/lib/logger.ts` — added `ToolResolutionEvent` + `logToolResolution()`
- `src/gateway/services/archetype-generator.ts` — two converse() degrade logs (ONLY)
- `tests/unit/lib/logger.test.ts` — added `logToolResolution` describe block
- `tests/unit/gateway/services/archetype-generator-degraded-log.test.ts` — NEW

### Verification
- TDD: RED (1 failed: expected undefined to be defined) → GREEN after impl.
- `pnpm test:unit` → 172 files, 2048 passed, 9 skipped, 0 failed.
- `pnpm build` (tsc) clean. eslint on 4 changed files → exit 0.
- Evidence: `.sisyphus/evidence/task-6-degraded-log.txt`

## [2026-06-15] Task 8 — Regression guard tests (postProcess/refine golden + isToolAllowed exact-match)

### What was added (pure tripwires — zero source changes)
- NEW `tests/unit/gateway/services/archetype-generator-golden.test.ts` (7 tests)
  - postProcess() golden: exercised via PUBLIC `generate()` (postProcess is private — only callers are generate/refine/converse). Mixed-format tool input → exact `/tools/*.ts`; legacy `cron`→`scheduled`; prose verbatim; `instructions===execution_steps`; kebab role_name; `toMatchInlineSnapshot` golden of all postProcess-owned fields.
  - refine() round-trip: already-CLI-style paths come back byte-identical while prose edit applies; pure-echo idempotency (exercises the `proseUnchanged` retry-with-nudge path — confirmed in logs).
- EXTENDED `tests/unit/tool-registry-enforce.test.ts` — added `Test 4: exact-match semantics` (4 tests). Did NOT duplicate Test 1-3. Value-add = near-miss variants of a LISTED tool (`slack/post-message`, `tsx /tools/slack/post-message.ts`, `/tools/slack/post-message` no-ext) all DENIED; only byte-identical listed path allowed. This is the direct tripwire against resolveToolPaths leaking into the enforcement path.

### Key gotchas for golden-testing the generator
- `makeRoutingLLM` MUST route the TimeEstimator sub-call: if `messages[0].content.startsWith('You estimate manual task duration')` return `makeResult('5')`, else main response. Without this the estimator call swallows the main response and the test mis-asserts.
- `generate(description)` derives role_name from description ONLY when model omits role_name; when model SUPPLIES role_name it is kebab-cased (`'Daily Digest Bot'`→`'daily-digest-bot'`). Golden test relies on the supplied-then-kebabed branch.
- `toMatchInlineSnapshot` with embedded `\n` in execution_steps renders as literal multi-line inside the snapshot template literal — that's expected, not corruption.
- refine()'s proseUnchanged guard fires a SECOND LLM call on echo input; routing mock returns same response both times → final still byte-identical. The guard log `"refine: prose fields identical to input — retrying with explicit change nudge"` confirms the path was hit.

### Verification
- Targeted: 21 passed (7 golden + 14 enforce). Full: `pnpm test:unit` → 173 files, 2059 passed, 9 skipped, 0 failed.
- eslint on both files → exit 0. (LSP tsc unavailable locally: `No version set for typescript-language-server` — pre-existing env gap, not a code error; full vitest run type-checks via esbuild transform.)
- Evidence: `.sisyphus/evidence/task-8-golden.txt`, `.sisyphus/evidence/task-8-enforce.txt`, `.sisyphus/evidence/task-8-fullsuite.txt`.
