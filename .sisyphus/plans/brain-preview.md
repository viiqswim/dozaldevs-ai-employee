# Brain Preview — Employee Container Injection Viewer

## TL;DR

> **Quick Summary**: Add a "Brain Preview" tab to the employee detail page showing exactly what the Docker/OpenCode container receives when it executes — the full prompt, AGENTS.md, environment variables, tools, skills, and output contract.
>
> **Deliverables**:
>
> - New backend endpoint: `GET /admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview`
> - New frontend tab: "Brain Preview" on the employee detail page
> - Unit test for the backend endpoint
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types) → Task 2 (endpoint) → Task 5 (frontend tab) → Task 7 (integration) → F1-F4

---

## Context

### Original Request

Add a way to visualize, on the employee detail page in the dashboard, what the "brain" (the Docker OpenCode instance) of an AI employee receives when it executes. This includes the prompt, environment variables, the generated AGENTS.md file, and anything else injected into the container. The intention is so that anybody building or testing an AI employee can see what would be injected.

### Interview Summary

- **Fidelity**: High fidelity — render the actual prompt text, full AGENTS.md, all env vars as the container would see them
- **Interactivity**: Static read-only preview, not an interactive sandbox
- **Secret handling**: Env var names only, never actual values
- **UI placement**: New 4th tab "Brain Preview" alongside Config/Tasks/Rules
- **Prompt rendering**: Both raw markdown source and rendered HTML with a toggle switch
- **Dynamic data**: Show CURRENT employee rules and knowledge from DB
- **Phase coverage**: Show BOTH execution and delivery phase prompts
- **Test strategy**: Backend unit test for the new endpoint; Playwright QA for frontend

### Research Findings

- Dashboard is React 19 + Vite 8 + Tailwind 4 + shadcn/ui + react-router-dom 7
- EmployeeDetail.tsx has 3 tabs (Config, Tasks, Rules) — adding a 4th is straightforward
- The harness constructs the prompt from: system_prompt + rules + knowledge + instructions
- AGENTS.md uses `resolveAgentsMd()` — 3-layer concatenation (Platform + Tenant + Employee)
- Env vars come from 6 sources: platform whitelist, tenant secrets, tenant config, lifecycle, raw_event, harness-internal
- `loadTenantEnv()` in `src/gateway/services/tenant-env-loader.ts` is directly callable from a gateway route
- Existing `GET /admin/tools` logic provides tool metadata
- `ToolDetail.tsx` is the best UI pattern reference for structured data display
- `resolveAgentsMd()` lives in `src/workers/lib/agents-md-resolver.mts` and is importable
- Platform AGENTS.md static file is at `src/workers/config/agents.md`
- Tests use `tests/gateway/` pattern with `TestApp.inject()` from `tests/setup.ts`

### Metis Review — Guardrails

- Never expose actual env var VALUES — redact all to `[SET]`/`[NOT SET]`
- Reuse actual `resolveAgentsMd()` and `loadTenantEnv()` functions for accuracy
- No new npm dependencies in dashboard
- Self-contained endpoint (no over-abstraction)
- Delivery prompt collapsed by default (secondary concern)
- Conditional env vars (raw_event) noted as "only set when triggered with webhook data"

---

## Work Objectives

### Concrete Deliverables

- `src/gateway/routes/admin-brain-preview.ts` — new route handler
- `dashboard/src/panels/employees/BrainPreviewTab.tsx` — new React component
- Updated `dashboard/src/panels/employees/EmployeeDetail.tsx` — add 4th tab
- Updated `dashboard/src/lib/types.ts` — add BrainPreview response types
- Updated `dashboard/src/lib/gateway.ts` — add fetchBrainPreview function
- `tests/gateway/admin-brain-preview.test.ts` — unit test
- Updated `src/gateway/server.ts` — register new route

### Must Have

- Full execution prompt assembled exactly as the harness would (system_prompt + rules + knowledge + instructions)
- Full delivery prompt assembled exactly (system_prompt + delivery_instructions)
- 3-layer AGENTS.md using the actual `resolveAgentsMd()` function
- Env var names grouped by source category (never values)
- Available tools list with descriptions
- Employee rules and knowledge as they currently exist in DB
- Raw/rendered toggle for prompt display

### Must NOT Have (Guardrails)

- Never expose actual env var VALUES in the response (names only, `[SET]`/`[NOT SET]`)
- Never expose decrypted tenant secrets
- No interactive editing or "apply changes" functionality
- No actual container launch or dry-run execution
- No modifications to `opencode-harness.mts` or `employee-lifecycle.ts`
- No new npm dependencies in the dashboard
- No over-abstraction — keep endpoint self-contained

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — independent):
├── Task 1: Response types + shared interfaces [quick]
└── Task 2: Backend endpoint [unspecified-high]  (includes platform AGENTS.md file read)

Wave 2 (After Wave 1 — parallel):
├── Task 3: Gateway client function [quick]
├── Task 4: BrainPreviewTab React component [visual-engineering]
└── Task 5: Unit test for endpoint [quick]

Wave 3 (After Wave 2 — sequential):
├── Task 6: Wire tab into EmployeeDetail + register route [quick]
└── Task 7: Dashboard build + visual verification [quick]

Wave FINAL:
├── F1: Plan compliance audit [oracle]
├── F2: Code quality review [unspecified-high]
├── F3: Real manual QA [unspecified-high]
└── F4: Scope fidelity check [oracle]
```

---

## TODOs

- [x] 1. Response types + shared interfaces

  Add to `dashboard/src/lib/types.ts`:

  ```typescript
  export interface BrainPreviewEnvVar {
    name: string;
    source: 'platform' | 'tenant_secret' | 'tenant_config' | 'lifecycle' | 'raw_event' | 'harness';
    category: 'always' | 'conditional';
    is_set: boolean;
  }
  export interface BrainPreviewResponse {
    execution_prompt: string;
    delivery_prompt: string | null;
    agents_md: {
      full: string;
      layers: { platform: string; tenant: string | null; employee: string | null };
    };
    env_vars: BrainPreviewEnvVar[];
    tools: Array<{ name: string; service: string; description: string; containerPath: string }>;
    skills: Array<{ name: string; description: string }>;
    config: {
      model: string;
      runtime: string;
      bash_timeout_ms: number;
      permissions: string;
      opencode_version: string;
    };
    output_contract: {
      required_files: Array<{ path: string; description: string; required: boolean }>;
    };
    employee_rules: string[];
    employee_knowledge: string[];
  }
  ```

  Pattern reference: `dashboard/src/lib/types.ts:53-75` (Archetype interface)

- [x] 2. Backend endpoint — brain preview route

  Create `src/gateway/routes/admin-brain-preview.ts`:
  - Route: `GET /admin/tenants/:tenantId/archetypes/:archetypeId/brain-preview`
  - Require X-Admin-Key via existing admin middleware
  - Fetch archetype from Prisma, return 404 if not found
  - Call `loadTenantEnv(tenantId, { tenantRepo, secretRepo })` then redact ALL values to `[SET]`/`[NOT SET]`
  - Read `src/workers/config/agents.md` via `fs.readFileSync` (cache in module-level variable)
  - Import and call `resolveAgentsMd()` from `src/workers/lib/agents-md-resolver.mts`
  - Construct execution prompt: system_prompt + rules block + knowledge block + instructions + "Task ID: <dynamic at runtime>"
  - Construct delivery prompt: system_prompt + delivery_instructions (or null)
  - Query employee_rules (confirmed, for this archetype)
  - Query knowledge_bases for themes
  - List tools by reading tool metadata (reuse logic from admin-tools route)
  - Include static lifecycle env vars (TASK_ID, TENANT_ID, NOTIFY_MSG_TS, etc.) as `source: 'lifecycle'`
  - Include static raw_event vars (PROPERTY_UID, LEAD_UID, etc.) as `source: 'raw_event', category: 'conditional'`
  - Include harness-internal vars (OPENROUTER_MODEL, etc.) as `source: 'harness'`
  - Return 200 with BrainPreviewResponse
  - Register in `src/gateway/server.ts` near line 172 with other admin routes

  Pattern references:
  - `src/gateway/routes/admin-archetypes.ts` — admin route structure
  - `src/gateway/routes/admin-tools.ts` — tool metadata logic to reuse
  - `src/gateway/services/tenant-env-loader.ts` — loadTenantEnv signature
  - `src/workers/lib/agents-md-resolver.mts` — resolveAgentsMd function

- [x] 3. Gateway client function for brain preview

  Add to `dashboard/src/lib/gateway.ts`:

  ```typescript
  export async function fetchBrainPreview(
    tenantId: string,
    archetypeId: string,
  ): Promise<BrainPreviewResponse | null>;
  ```

  - Use `GATEWAY_URL` + `X-Admin-Key` header from localStorage (same pattern as `triggerEmployee`)
  - Return null on 404; throw on other errors
    Pattern reference: `dashboard/src/lib/gateway.ts` existing functions

- [x] 4. BrainPreviewTab React component

  Create `dashboard/src/panels/employees/BrainPreviewTab.tsx`:

  Props: `{ archetype: Archetype; tenantId: string }`

  On mount: call `fetchBrainPreview(tenantId, archetype.id)`, show loading spinner

  **6 sections** (use `Card` from shadcn/ui, default open except Delivery Prompt):

  **Section 1 — Execution Prompt**:
  - Header with Raw | Rendered toggle (useState)
  - Raw: `<pre className="font-mono">` scrollable container with full prompt text
  - Rendered: `<MarkdownPreview>` (already exists at `dashboard/src/components/MarkdownPreview.tsx`)
  - If rules exist: badge "N rules injected"

  **Section 2 — Delivery Prompt** (collapsed by default):
  - Same Raw/Rendered toggle pattern
  - If null: muted "No delivery instructions configured"

  **Section 3 — AGENTS.md**:
  - Sub-tabs: Layer 1 (Platform) | Layer 2 (Tenant) | Layer 3 (Employee) | Full
  - Empty layers show "Not configured" in muted text
  - Use shadcn/ui Tabs component

  **Section 4 — Environment Variables**:
  - Group by source: Platform, Tenant Secrets, Tenant Config, Lifecycle, Webhook (Conditional), Harness Internal
  - Each row: `[source badge] NAME [SET/NOT SET chip]`
  - Conditional vars: subtle note "(only when triggered with webhook data)"
  - Font-mono for names

  **Section 5 — Available Tools**:
  - Group by service (slack/, hostfully/, sifely/, platform/, knowledge_base/)
  - Each tool: name + description
  - Also show skills (tool-usage-reference, uuid-disambiguation)

  **Section 6 — Runtime Config & Output Contract**:
  - Config: model, runtime, OpenCode version (1.14.31), bash timeout (20 min), permissions
  - Output contract: required files with descriptions
  - Baked-in skills list

  Style: follow ToolDetail.tsx pattern, Tailwind only, no new deps

- [x] 5. Unit test for brain preview endpoint

  Create `tests/gateway/admin-brain-preview.test.ts`:
  - Use `TestApp.inject()` pattern from `tests/setup.ts`
  - Mock Prisma `archetype.findFirst` to return fake archetype
  - Mock `loadTenantEnv` to return known env vars
  - Test cases:
    1. **200 happy path**: Assert all required keys present; assert env vars have no real values (only `[SET]`/`[NOT SET]`)
    2. **404 archetype not found**: Mock null return → assert 404
    3. **401 missing admin key**: No X-Admin-Key header → assert 401
    4. **Prompt assembly**: Verify execution_prompt contains system_prompt before instructions
    5. **AGENTS.md layers**: Verify platform layer is non-empty (contains "AI Employee Worker")

  Pattern reference: `tests/gateway/admin-archetypes.test.ts`

- [x] 6. Wire tab into EmployeeDetail + register route

  In `dashboard/src/panels/employees/EmployeeDetail.tsx`:
  - Import `BrainPreviewTab` from `./BrainPreviewTab`
  - Add `<TabsTrigger value="brain">Brain Preview</TabsTrigger>` after "rules" trigger
  - Add `<TabsContent value="brain"><BrainPreviewTab archetype={archetype} tenantId={tenantId} /></TabsContent>`

  In `src/gateway/server.ts`:
  - Import: `import { adminBrainPreviewRoutes } from './routes/admin-brain-preview';`
  - Register: `app.use(adminBrainPreviewRoutes({ prisma }));` in admin routes block

- [x] 7. Dashboard build + visual verification
  - Run `cd dashboard && pnpm build` — assert exit 0
  - Navigate to employee detail page Brain Preview tab
  - Verify all 6 sections render with real data
  - Verify no secret values are visible
  - Screenshot evidence

- [ ] 8. Notify completion — `npx tsx scripts/telegram-notify.ts "✅ brain-preview complete — Brain Preview tab done. Come back to review results."`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search for forbidden patterns. Check evidence files.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `pnpm build` + `pnpm lint` + `pnpm test -- --run tests/gateway/admin-brain-preview.test.ts`. Review changed files for `as any`, empty catches, console.log, AI slop.
      Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N/N] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
      Navigate to employee detail page, click Brain Preview tab, verify all sections, toggle raw/rendered, screenshot.
      Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `oracle`
      Verify each task diff matches its spec. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/ISSUES] | VERDICT`

---

## Success Criteria

```bash
# Endpoint returns 200
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/00000000-0000-0000-0000-000000000015/brain-preview" \
  | jq '.execution_prompt' | head -3

# Unit test passes
pnpm test -- --run tests/gateway/admin-brain-preview.test.ts

# Dashboard builds
cd dashboard && pnpm build

# No secret values leaked
curl -s -H "X-Admin-Key: $ADMIN_API_KEY" \
  "http://localhost:7700/admin/tenants/00000000-0000-0000-0000-000000000003/archetypes/00000000-0000-0000-0000-000000000015/brain-preview" \
  | jq '[.env_vars[].is_set] | unique'  # Expected: [true, false] only
```
