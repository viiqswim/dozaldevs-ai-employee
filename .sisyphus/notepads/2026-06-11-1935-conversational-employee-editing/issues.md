# Issues — Conversational Employee Editing

## [2026-06-13] Known Issues / Gotchas

### T1 — PATCH schema gap

- `PatchArchetypeBodySchema` in `admin-archetypes.ts` lines 40-67 is MISSING `identity`
- `execution_steps` and `delivery_steps` are present — mirror their pattern
- Must also verify `identity` flows into `prisma.archetype.update()` data (not excluded from spread)

### T2 — DB migration

- MUST back up DB before migration (per AGENTS.md)
- Must reload PostgREST schema cache after: `NOTIFY pgrst, 'reload schema'`
- DB name: `ai_employee` (NOT postgres)

### T3 — react-diff-viewer-continued

- Not yet installed — must `pnpm --dir dashboard add react-diff-viewer-continued`
- Use `DiffMethod.WORDS` for prose diffs
- Tool changes: render as add/remove list (NOT prose diff)
- Approval-off: requires explicit confirm checkbox before Approve is enabled

### T4 — useBlocker (React Router 7)

- react-router-dom 7 `useBlocker` API for in-app nav blocking
- Must cooperate with EmployeeDetail.tsx `handleTabChange`

### T8 — patchArchetype type gap

- `patchArchetype`'s `Pick<>` type at gateway.ts:147-168 is MISSING `tool_registry` and `trigger_sources`
- Gateway PATCH schema already accepts both — just a client-side type gap
- T8 must extend this Pick<> to add both fields

### T5 — refine() signature

- 4-param: `refine(previousConfig, refinementInstruction, catalog?, composioContext?)`
- composioContext = `{ connectedToolkits, connectableToolkits }` — derive same as generate route
- `applyModelAndEstimate` still runs (line 435) — must strip model from output
- `postProcess` may set fields to '' — empty-field guard needed

## F3 Final QA (2026-06-13-1117) — REJECT — two P0 blockers

### Blocker 1 (Frontend P0): AssistantTab crashes on render — useBlocker needs data router
- `dashboard/src/panels/employees/AssistantTab.tsx:22` calls `useUnsavedChangesGuard()`
  unconditionally; that hook calls `useBlocker(active)` at
  `dashboard/src/hooks/use-unsaved-changes-guard.ts:21`.
- `useBlocker` requires a DATA router (`createBrowserRouter` + `RouterProvider`).
- The app uses plain `<BrowserRouter>` at `dashboard/src/App.tsx:71`.
- Result: every render throws → tab falls back to ErrorBoundary "Something went wrong".
  The chat UI / empty state / textarea / Send / Change History NEVER render.
- Verbatim console: "Error: useBlocker must be used within a data router."
- Evidence: .sisyphus/evidence/final-qa/B-assistant-tab-crash.png

### Blocker 2 (Backend P0): propose-edit 422 — tool-path format mismatch
- `validateTools()` in `src/gateway/routes/admin-archetype-propose-edit.ts:81` builds its
  valid set from `toolInvocationPath()` (`src/lib/tool-registry.ts:19-21`) which yields
  `tsx /tools/slack/post-message.ts` (WITH `tsx ` prefix).
- Archetype `tool_registry.tools` (DB), `isToolAllowed()`
  (`src/workers/lib/execution-phase.mts`), `tool-parser.ts:66 containerPath`, AND the
  refine prompt (`archetype-generator.ts:96`) all use `/tools/slack/post-message.ts`
  (NO prefix).
- Mismatch → validator rejects the archetype's OWN existing tools + prompt-mandated
  submit-output.ts → EVERY propose-edit on a seeded employee returns 422.
- LLM call itself succeeds (~95s) — NOT a timeout.
- Fix: compare against `containerPath` (no prefix) OR strip `tsx ` before comparing.
- Evidence: .sisyphus/evidence/final-qa/A1-propose-edit.json, A2-model-request.json

### Passing parts
- A3 edit-history record(201)+list(200): WORKS at runtime.
- A4 identity PATCH(200) + DB write: WORKS.
- Scenario C: edit-history row persisted, soft-delete + identity restore verified.
- B1/B2: AI Assistant tab is present and URL syncs to ?tab=assistant.

### Side note (not a runtime blocker)
- LSP shows `Property 'archetypeEditHistory' does not exist on PrismaClient` in
  `admin-archetype-edit-history.ts` (lines 145/188/217/265). Runtime works (A3 passed),
  so this is stale generated Prisma types, not a functional defect. Regenerate client.
