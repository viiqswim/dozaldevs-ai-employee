# Learnings — new-employee-onboarding-ux

## 2026-05-18 Session Start

### Codebase Conventions

- Dashboard: React 19 + Vite + Tailwind v4 + Radix UI SPA at `/dashboard/*`
- All new gateway routes must be registered in `src/gateway/server.ts`
- `requireAdminKey` middleware applied to all admin routes
- Frontend type `Archetype` is at `dashboard/src/lib/types.ts:53-75`
- All admin API calls use `gatewayFetch` helper in `dashboard/src/lib/gateway.ts`
- Slack bot token: read via `TenantSecretRepository.get(tenantId, 'SLACK_BOT_TOKEN')`
- LLM calls: `callLLM({ model: 'anthropic/claude-haiku-4-5', taskType: 'review', ... })`
- JSON fence stripping: `rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()`

### Key Architecture Points

- `agents_md` is the real employee brain (200-400 lines markdown), NOT `system_prompt` (empty in all real archetypes)
- `model` ALWAYS hardcoded to `minimax/minimax-m2.7` - never LLM-chosen
- `runtime` ALWAYS `opencode`
- role_name: URL-safe slug `^[a-z0-9]+(-[a-z0-9]+)*$`
- Prisma P2002 on [tenant_id, role_name] unique → return 409 ROLE_NAME_TAKEN
- Generation endpoint = no DB write; Creation endpoint = DB write (two separate endpoints)
- Max refinement iterations: 3
- Max description length: 2000 chars

### Critical Guardrails

- NO changes to EmployeeDetail.tsx
- NO visual cron builder (plain text input only)
- NO interactive tool chips (read-only display)
- NO changes to existing PatchArchetypeBodySchema

## Task 3 — POST /admin/tenants/:tenantId/archetypes/generate

### Pattern Used

- `ArchetypeGenerator` class with constructor-injected `callLLMFn` (mirrors `InteractionClassifier`)
- `generate()` makes single LLM call with `anthropic/claude-haiku-4-5` + `taskType: 'review'` + `temperature: 0.3` + `maxTokens: 4000`
- `refine()` passes current config JSON + refinement instruction to same LLM pattern
- Fence stripping: `rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()`
- Post-process ALWAYS overwrites `model = 'minimax/minimax-m2.7'`, `runtime = 'opencode'`, `system_prompt = ''`
- Route registered BEFORE `adminArchetypesRoutes` so "generate" is not matched as an archetypeId
- `callLLM` imported at top level in server.ts and passed as dep injection to route factory
- `GENERATION_FAILED` error → 422 response

### Evidence

- 200: `task-3-generate-success.json` — real LLM response with hardcoded `model: "minimax/minimax-m2.7"`
- 401: `task-3-no-auth.txt` — missing X-Admin-Key returns `{"error":"Unauthorized"}`

## Task 2 — POST /admin/tenants/:tenantId/archetypes

### Pattern Used

- `CreateArchetypeBodySchema` defined separately from `PatchArchetypeBodySchema` (PATCH unchanged)
- Prisma P2002 duck-typed via `isPrismaError(err) && err.code === 'P2002'` — no `@prisma/client/runtime/library` import needed
- `trigger_sources` and `tool_registry` are Json fields — spread-conditional pattern: `...(field !== null && { field: field as Prisma.InputJsonValue })`
- `risk_model` always sent (has default), so always cast unconditionally
- server.ts already had `app.use(adminArchetypesRoutes({ prisma }))` — no changes needed there; POST route added inside the same function

### Evidence

- 201: valid create (real DB row)
- 409: duplicate `role_name` triggers P2002 on `@@unique([tenant_id, role_name])`
- 400: `role_name` fails `/^[a-z0-9]+(-[a-z0-9]+)*$/` regex
- 401: missing X-Admin-Key header

## Task 4 — GET /admin/tenants/:tenantId/slack/channels

### Pattern Used

- Route factory: `adminSlackChannelsRoutes(opts: { prisma?: PrismaClient })` — same pattern as other admin routes
- `TenantSecretRepository.get(tenantId, 'SLACK_BOT_TOKEN')` — returns null if not set
- Graceful degradation: null token → `200 { channels: [], error: 'SLACK_NOT_CONFIGURED' }` (NOT 500/404)
- `WebClient` from `@slack/web-api` used directly (already installed) — `conversations.list({ types: 'public_channel,private_channel', exclude_archived: true, limit: 200 })`
- Response shape: `{ channels: [{ id, name, is_private }] }` — mapped from Slack's raw channel objects
- Route registered after `adminArchetypesRoutes` in server.ts (no path overlap)
- `slack-client.ts` is a custom fetch wrapper — NOT used here; `@slack/web-api` WebClient used directly for `conversations.list`

### Evidence

- 401: no X-Admin-Key → `{"error":"Unauthorized"}`
- 200 SLACK_NOT_CONFIGURED: DozalDevs tenant (no token in DB) → `{"channels":[],"error":"SLACK_NOT_CONFIGURED"}`
- 200 SLACK_NOT_CONFIGURED: VLRE tenant (token not in local DB) → same response (acceptable for local QA)
- Build: `pnpm build` exit code 0

## Task 6 — CreateEmployeeDialog + EmployeeList "New Employee" button

### Pattern Used

- `CreateEmployeeDialog` uses a discriminated union `DialogState` with phases: `idle`, `generating`, `preview`, `creating`, `success`, `error`
- Dialog renders conditionally based on `state.phase` — single `DialogContent` with phase-conditional JSX
- `handleOpenChange` resets state to idle + clears description on close
- `void handleGenerate()` / `void handleCreate()` pattern for async event handlers (satisfies eslint no-floating-promises)
- `createArchetype` accepts `CreateArchetypePayload = Omit<GenerateArchetypeResponse, 'model' | 'runtime'> & { model: string; runtime: string }` — spreading `GenerateArchetypeResponse` works because literal subtypes satisfy string
- Dashboard dev server defaults to port 5173 (no port config in vite.config.ts) — if another app is on that port, use `pnpm dev --port 5174`
- EmployeeList: `createOpen` state added, `CreateEmployeeDialog` rendered in ALL 3 return paths (loading, empty, main)
- Error state uses `state.message` — TypeScript narrows correctly inside phase conditionals

### Evidence Screenshots

- `task-6-button-visible.png` — "Employees" heading + "+ New Employee" button above table
- `task-6-dialog-open.png` — dialog open, textarea active, Generate disabled (0 chars)
- `task-6-char-counter.png` — 119/2000 counter, Generate button enabled
- `task-6-dialog-close.png` — dialog dismissed via Escape, table visible

## Task 7 — CreateEmployeePreview + Dialog integration

### Pattern Used

- `notification_channel` is NOT in `GenerateArchetypeResponse` — handled via separate `notificationChannel: string` state in the parent dialog + `onNotificationChannelChange` prop on preview component
- Preview component fetches Slack channels on mount via `fetchSlackChannels(tenantId)` with cleanup via `cancelled = true` ref pattern
- Channels loaded → Select dropdown; no channels (SLACK_NOT_CONFIGURED) → plain Input fallback
- Name sanitizer: `.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '')` — auto-corrects on change, ✓/✗ indicator alongside the input
- `isValidSlug` helper in dialog gates the Create button; empty/invalid slug → disabled
- 409 ROLE_NAME_TAKEN: reverts to `preview` phase with `nameError` set (inline error under name field)
- `currentConfig` captured before `setDialogState({ phase: 'creating' })` to avoid stale closure in `handleCreate`
- Dialog uses `sm:max-w-lg` with `overflow-y-auto max-h-[55vh]` scroll container around preview
- `onConfigChange` in `creating` state harmlessly transitions back to `preview` (safe — just in case user edits a field during submission)
- Tool chip label extraction: `toolPath.split('/')[2]` gives the service directory name (e.g. "slack"), then capitalize
- Dashboard dev server on port 5174 (5173 taken by another project)
- Fetch interception via `window.fetch` override works for QA without real gateway

### Evidence Screenshots

- `task-7-preview-rendered.png` — full preview: name ✓, instructions, trigger, approval toggle, channel select, tool badges (Slack×2), concurrency
- `task-7-name-validation.png` — empty name → ✗ indicator, Create Employee button disabled
- `task-7-channel-dropdown.png` — Slack channel dropdown open: #general, #support, #support-summary options

## Task 8 — Trigger Config UI in CreateEmployeePreview

### Pattern Used

- Replaced single placeholder `<p>` with full discriminated-union-driven trigger UI
- 3 radio-style buttons (Manual / Scheduled / Webhook) using inline `.map()` over `as const` tuple
- `isActive` computed as `(config.trigger_sources?.type ?? 'manual') === type` — `??` fallback handles default manual state
- Clicking a type button calls `onConfigChange` with appropriate discriminated union shape
- TypeScript narrowing: within `{config.trigger_sources?.type === 'scheduled' && ...}` JSX block, TS narrows to scheduled branch — `.cron` and `.timezone` accessible directly without extra casting
- Arrow function callbacks inside conditional blocks re-check `config.trigger_sources?.type === 'scheduled'` in ternary for the timezone/cron fallback — avoids stale closure issues
- Cron input uses `font-mono text-xs` class, shows raw crontab expression
- Timezone select uses existing `Select/SelectTrigger/SelectContent/SelectItem` components — no new imports needed (already imported)
- Manual block shows API URL as `<code>` with inline Copy button using `void navigator.clipboard.writeText(...)`
- Webhook block: info paragraph + optional event_type Input with `e.target.value || undefined` to strip empty string to undefined
- `GenerateArchetypeResponse.trigger_sources` (line 245 of types.ts) is NON-NULLABLE — the `?.` optional chaining used in the UI is safe/extra-careful
- Dashboard dev server started on port 5174 (5173 taken by FloodSmart project)

### Evidence Screenshots

- `task-8-manual-trigger.png` — Manual selected: API URL with role_name + Copy button
- `task-8-scheduled-trigger.png` — Scheduled selected: cron input (0 8 * * 1-5), UTC timezone dropdown, crontab.guru ↗ link
- `task-8-webhook-trigger.png` — Webhook selected: info text + Event type optional input

## Task 9 — Refinement Loop in CreateEmployeeDialog

### Pattern Used

- 3 new state vars: `refinementCount` (0–3), `refinementInput` (string), `originalDescription` (preserved from initial generate call)
- `handleGenerate` resets all refinement state before calling API
- `handleRefine` guards: `phase !== 'preview' || !input.trim() || count >= 3` → noop; transitions to `generating` then back to `preview` on success; reverts to `preview` with original config on error
- Refinement UI only renders in `preview` phase (not `creating`) — the outer `(preview || creating)` block uses inner `{state.phase === 'preview' && ...}` guard
- Counter only shows after first refinement (refinementCount > 0) → "Refinement N/3" label
- At count === 3: input section replaced by "Maximum refinements reached" message
- `handleOpenChange` resets all 3 refinement vars on close
- `refineArchetype` imported from `@/lib/gateway`; `Input` imported from `@/components/ui/input`
- `void handleRefine()` pattern for async event handlers (Enter key + button click)

### Evidence Screenshots

- `task-9-refinement-input.png` — preview state: refinement input visible below preview, Refine button disabled (empty)
- `task-9-refinement-applied.png` — after first refinement: "Refinement 1/3" counter, input cleared, Refine disabled (awaiting new input)

## Task 10 — Advanced section in CreateEmployeePreview

### Pattern Used

- New `advancedOpen: boolean` state (default `false`) added alongside existing slack state vars
- `MarkdownEditorField` import: `import { MarkdownEditorField } from '@/components/MarkdownEditorField'`
- Advanced toggle is a `<button type="button">` with `▶`/`▼` arrow prefix — arrow changes via ternary on `advancedOpen`
- Delivery instructions conditionally rendered inside Advanced block: `{config.risk_model.approval_required && <MarkdownEditorField ... />}`
- `delivery_instructions` uses `?? ''` for value and `val || null` in onChange to handle `string | null` type
- Advanced section placed AFTER concurrency field, BEFORE closing `</div>` of `space-y-4` container
- Dashboard is built as static files (`dashboard/dist/`) served by Express gateway at `/dashboard/` — requires `pnpm build` in `dashboard/` dir after code changes; no hot reload in production mode
- Dashboard served at `http://localhost:7700/dashboard/?tenant=...`
- Dashboard build is fast (~400ms) even with 2142 modules
- Advanced button text in browser is `"▶Advanced"` (no space between arrow span and text span — text content concatenates span children)

### Evidence Screenshots

- `task-10-collapsed.png` — Advanced toggle visible, `.cm-editor` NOT in DOM, arrow is ▶
- `task-10-expanded.png` — Advanced expanded: 2 CodeMirror editors visible (agents_md pre-populated + delivery_instructions), Employee Brain label, Trigger Instructions input, System Prompt input

## Task 11 — CreateEmployeeNextSteps component

### Pattern Used

- `CreateEmployeeNextSteps` is a standalone presentational component with props: `archetype: Archetype`, `tenantId: string`, `onClose: () => void`
- `getTriggerInstructions` helper extracts trigger label + snippet via `switch` on `archetype.trigger_sources?.type` (`?.` handles null)
- `switch` default case covers both `'manual'` and null/undefined — no separate null check needed
- Navigation uses `useNavigate` from `react-router-dom` → `navigate(\`/dashboard/employees/${archetype.id}\`)` (same pattern as EmployeeList)
- Success indicator: SVG checkmark (M5 13l4 4L19 7) in a green circle — no external icon library needed
- Wiring: replaced entire `{state.phase === 'success' && ...}` block in `CreateEmployeeDialog.tsx` with `<CreateEmployeeNextSteps .../>` — no `DialogHeader` needed in the success state since the component has its own heading
- `sm:max-w-lg` DialogContent is wide enough to accommodate the card without scrolling
- tsc --noEmit exit 0, pnpm build exit 0 (414ms, 2143 modules)

## Task 12 — Empty state CTA in EmployeeList

### Pattern Used

- Replaced single-line `<p className="text-muted-foreground">No employees found for this tenant</p>` with a centered CTA card
- CTA card: `flex flex-col items-center justify-center py-16 text-center` wrapper with heading, subtext, and Button
- `setCreateOpen(true)` already existed (added in Task 6) — no new state needed
- `onCreated={refresh}` already wired in the empty-state `CreateEmployeeDialog` render — no changes needed
- `Button` already imported — no new imports needed
- tsc --noEmit exit 0

## Task 13 — Backend Unit Tests

### Test File Locations

- Tests must go in `tests/` directory OR update `vitest.config.ts` to include `src/**/__tests__/**/*.test.ts`
- `vitest.config.ts` `include: ['tests/**/*.test.ts']` — added second pattern for `src/**/__tests__/**/*.test.ts`
- Test files created at `src/gateway/services/__tests__/` and `src/gateway/routes/__tests__/`

### ArchetypeGenerator Test Pattern

- Constructor-injected `callLLMFn`: `new ArchetypeGenerator(mockFn as typeof callLLM)`
- Mock helper: `vi.fn().mockResolvedValue({ content, model, promptTokens, completionTokens, estimatedCostUsd, latencyMs })`
- `postProcess()` ALWAYS overwrites `model`, `runtime`, `system_prompt` — so LLM response with wrong values still produces correct output
- Test fence-stripping by providing content like `` ```json\n{...}\n``` `` — should parse cleanly
- `Parameters<typeof gen.refine>[0]` to get the `previousConfig` type without importing `GenerateArchetypeResponse`

### Route Test Pattern (POST archetypes)

- Duck-typed Prisma P2002: `vi.fn().mockRejectedValue({ code: 'P2002' })` — `isPrismaError()` only checks `typeof === 'object' && 'code' in err`
- Mock prisma via `opts.prisma`: `{ archetype: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), ...overrides } } as never`
- Must set `process.env.ADMIN_API_KEY` in `makeApp()` for auth to work

### Slack Channels Test Pattern (vi.hoisted + vi.mock)

- `vi.mock` factory functions create `vi.fn(() => ...)` — these implementations are PRESERVED by `vi.clearAllMocks()` but CLEARED by `vi.resetAllMocks()`
- Use `vi.clearAllMocks()` (not `vi.resetAllMocks()`) in `beforeEach` when using class mock factories in `vi.mock`
- `vi.hoisted()` required for variables used inside `vi.mock` factory:
  ```ts
  const { mockSecretGet, mockConversationsList } = vi.hoisted(() => ({
    mockSecretGet: vi.fn(),
    mockConversationsList: vi.fn(),
  }));
  vi.mock('../../services/tenant-secret-repository.js', () => ({
    TenantSecretRepository: vi.fn(() => ({ get: mockSecretGet })),
  }));
  ```
- `vi.mock` path resolved from test file's directory (not project root)

### Pre-existing Failures (NOT caused by this task)

- `tests/gateway/migration-agents-md.test.ts` — 2 tests fail: `Archetype agents_md matches static file (DozalDevs)` and `Tenant default_agents_md matches static file`. These check DB seed vs `src/workers/config/agents.md` static file — DB was modified by earlier tasks in this session, file not re-synced. NOT a regression from test code changes.
