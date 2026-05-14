# Tool Discovery Dashboard

## TL;DR

> **Quick Summary**: Add a dynamic "Tools" page to the dashboard that auto-discovers all shell tools from `src/worker-tools/` source files. A gateway endpoint parses tool metadata (description, flags, env vars, output shape) via static analysis + SKILL.md enrichment. The dashboard shows a flat list sorted by service → click any tool → full detail page. Zero manual documentation — add a tool file to disk and it appears automatically.
>
> **Deliverables**:
>
> - `src/gateway/services/tool-parser.ts` — static analysis engine for tool metadata extraction
> - `src/gateway/routes/admin-tools.ts` — GET /admin/tools + GET /admin/tools/:service/:toolName
> - `dashboard/src/panels/tools/ToolList.tsx` — flat list sorted by service with service badges
> - `dashboard/src/panels/tools/ToolDetail.tsx` — full detail page (description, flags, env vars, output, notes, example)
> - Sidebar "Tools" nav item + App.tsx routes + AGENTS.md/README.md docs
>
> **Estimated Effort**: Medium — 8 implementation tasks + 4 final verification
> **Parallel Execution**: YES — 3 waves

---

## Context

### Research Findings (from codebase exploration)

**Tool inventory**: 24 runnable tools across 5 services:

- `slack/`: post-message.ts, read-channels.ts, post-guest-approval.ts (3 tools)
- `hostfully/`: get-messages.ts, send-message.ts, get-property.ts, get-properties.ts, get-reservations.ts, get-reviews.ts, get-door-code.ts, update-door-code.ts, validate-env.ts, register-webhook.ts (10 tools — includes 2 setup utilities)
- `sifely/`: list-locks.ts, list-passcodes.ts, list-access-records.ts, create-passcode.ts, update-passcode.ts, delete-passcode.ts, generate-code.ts, rotate-property-code.ts, diagnose-access.ts (9 tools)
- `knowledge_base/`: search.ts (1 tool)
- `platform/`: report-issue.ts (1 tool)
- `sifely/lib/api.ts` — shared library, NOT a runnable tool — must be excluded

**Three parseArgs patterns** (all must be handled):

- Pattern A: `parseArgs(argv)` function with `args[i] === '--flag-name'` — most common
- Pattern B: `args.includes('--flag-name')` inline — sifely/list-locks.ts style
- Pattern C: `interface Args` + manual loop — knowledge_base/search.ts style

**Description sources**:

- ~60% have JSDoc `/** ... */` headers with one-line description (sifely, knowledge_base, platform tools)
- ~40% have description only in `--help` text (all slack, most hostfully) — must extract from help text

**SKILL.md**: `src/workers/skills/tool-usage-reference/SKILL.md` has curated docs with warnings, side effects, notes, examples. CRITICAL: sifely entries reference stale path `/tools/locks/` — match by **filename only**, NOT container path.

**Archetype `tool_registry`**: NOT used in this feature. User wants global tools page only.

**shadcn/ui cap**: 9/10 components already installed (button, badge, card, dialog, input, select, separator, table, tabs). 1 slot remaining — plan uses 0 new components.

**Gateway runtime**: Runs from repo root via `tsx watch` — `src/worker-tools/` accessible at runtime locally.

### User Requirements

- Global "Tools" page (NOT per-employee display)
- Flat list sorted by service, service shown as badge/tag
- Full detail page (NOT collapsible cards): description, all flags, env vars, output shape, warnings, example
- Dynamic — add tool file, refresh page, it appears. Zero frontend code changes needed.
- Parse source files as-is — NO modifications to tool files
- Build + browser QA verification only

---

## Constraints

### Must Have

- Dynamic discovery — read `src/worker-tools/` at request time, no caching
- Static analysis ONLY — never execute tool files
- Flat list sorted by service (alphabetical within service)
- Full detail page with all metadata sections
- SKILL.md enrichment matched by filename only
- `requireAdminKey` middleware on endpoint
- Per-file error isolation (one broken file ≠ broken endpoint)
- All 3 parseArgs patterns handled
- `**/lib/**` exclusion (path-based, catches sifely/lib/api.ts + future libraries)
- Update AGENTS.md and README.md (Documentation Freshness requirement)

### Must NOT Have

- NO modifications to any file in `src/worker-tools/`
- NO new shadcn/ui components (use existing: badge, table, card, separator, button)
- NO search/filter UI
- NO "Run tool" / edit / copy functionality
- NO per-employee tool display
- NO caching
- NO tool file execution
- NO new test files
- NO tenant scoping on the endpoint (tools are global)
- NO modifications to tsconfig.json, tsconfig.build.json, src/inngest/, src/workers/

---

## TODOs

- [x] 1. Tool Parser Module — `src/gateway/services/tool-parser.ts`

  Create a static analysis module that discovers and extracts metadata from tool source files.

  **Interfaces to define and export**:

  ```typescript
  interface ToolFlag {
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description?: string;
    default?: string;
  }
  interface ToolEnvVar {
    name: string;
    required: boolean;
  }
  interface ToolMetadata {
    name: string;
    service: string;
    containerPath: string;
    description: string;
    flags: ToolFlag[];
    envVars: ToolEnvVar[];
    outputShape?: string;
    notes?: string;
    example?: string;
    sourceLength: number;
  }
  ```

  **Functions to implement**:
  1. `discoverTools(basePath: string): Promise<ToolMetadata[]>` — reads directory recursively via `fs.readdir({recursive:true})`, excludes `**/lib/**` and `**/fixtures/**` paths, calls `parseToolFile()` per file wrapped in try/catch, returns array sorted by service then name
  2. `parseToolFile(filePath: string): ToolMetadata` — reads file as text, extracts:
     - `name`: filename minus `.ts`
     - `service`: parent directory name
     - `containerPath`: `/tools/{service}/{name}.ts`
     - `description`: from JSDoc first line (`/\*\*\s*\n\s*\*\s+(.+)/`) OR from `--help` text (first non-"Usage:" non-empty content line)
     - `flags`: from all 3 patterns — `args[i] === '--flag'`, `args.includes('--flag')`, interface pattern; required = has `process.stderr.write` with flag name + `process.exit(1)` nearby; type = `parseInt` → number, else string; boolean = no `args[i+1]` check
     - `envVars`: regex `process\.env\[['"](\w+)['"]\]` and `process\.env\.(\w+)`; required = adjacent `process.exit(1)` guard
     - `outputShape`: JSDoc `* Output:` section or `--help` "Output:" block (raw string)
     - `sourceLength`: line count
  3. `getToolByPath(basePath: string, service: string, toolName: string): Promise<ToolMetadata | null>` — reads single tool file

  **Must NOT**:
  - Execute tool files
  - Cache results
  - Use AST parsing libraries
  - Modify any worker-tools file

  **Agent**: `deep` | **Wave**: 1 | **Blocks**: Tasks 2, 3

  **Acceptance Criteria**:

  ```bash
  # Verify via node REPL or ts-node
  # discoverTools returns 21+ tools
  # sifely/lib/api.ts (name='api') NOT in results
  # parseToolFile('src/worker-tools/sifely/create-passcode.ts') has flags: --lock-id, --name, --code (all required)
  # parseToolFile('src/worker-tools/slack/post-message.ts') has non-empty description (from --help)
  # pnpm build exits 0
  ```

  Evidence: `.sisyphus/evidence/task-1-parser.txt`

  **Commit**: `feat(gateway): add tool metadata parser with SKILL.md enrichment`

- [x] 2. SKILL.md Enrichment Layer — add to `src/gateway/services/tool-parser.ts`

  Extend the parser module with enrichment functions.

  **Add interface**:

  ```typescript
  interface SkillEnrichment {
    notes?: string;
    example?: string;
    flagDescriptions?: Record<string, string>;
  }
  ```

  **Add functions**:
  1. `parseSkillMd(skillPath: string): Promise<Map<string, SkillEnrichment>>` — reads SKILL.md, splits on `### \`tool-name.ts\``headers, extracts Notes/Example sections per tool, returns Map keyed by **filename only** (e.g.,`list-locks.ts`). If file missing → return empty Map (no throw).
  2. `enrichTools(tools: ToolMetadata[], enrichments: Map<string, SkillEnrichment>): ToolMetadata[]` — merges enrichment into tools by matching `${name}.ts`. Unmatched tools keep empty notes/example. Unmatched SKILL.md entries silently skipped.

  **CRITICAL**: Match by filename only — SKILL.md sifely paths say `/tools/locks/` but actual service is `sifely`. Never match by container path.

  **Agent**: `quick` | **Wave**: 1 (after Task 1) | **Blocks**: Task 3

  **Acceptance Criteria**:

  ```bash
  # parseSkillMd returns Map with size > 0
  # parseSkillMd('/nonexistent') returns empty Map (no throw)
  # enrichTools result has at least some tools with non-empty notes
  # pnpm build exits 0
  ```

  Evidence: `.sisyphus/evidence/task-2-enrichment.txt`

  **Commit**: grouped with Task 1

- [x] 3. Gateway Route — `src/gateway/routes/admin-tools.ts`

  Create Express Router with two endpoints:
  - `GET /` → `discoverTools` + `parseSkillMd` + `enrichTools`, returns `{ tools: ToolMetadata[] }` sorted by service then name. 200 OK.
  - `GET /:service/:toolName` → `getToolByPath` + single enrichment, returns `ToolMetadata`. 404 `{ error: "Tool not found" }` if missing.
  - Both routes: `requireAdminKey` middleware (from `src/gateway/middleware/admin-auth.ts`)
  - Route is NOT tenant-scoped — path is `/admin/tools`, NOT `/admin/tenants/:tenantId/tools`

  Register in `src/gateway/server.ts` alongside other admin routers (find where `adminArchetypesRouter` is mounted, add `adminToolsRouter` next to it). Base path resolves to `/admin/tools`.

  **Pattern to follow**: `src/gateway/routes/admin-archetypes.ts`
  **Middleware to import**: `src/gateway/middleware/admin-auth.ts` → `requireAdminKey`
  **Service to import**: `src/gateway/services/tool-parser.ts`

  **Agent**: `quick` | **Wave**: 2 (after Tasks 1+2) | **Blocks**: Tasks 5, 6

  **Acceptance Criteria**:

  ```bash
  curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tools | jq '.tools | length'
  # Expected: 21+
  curl -s -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tools/sifely/list-locks | jq '.name'
  # Expected: "list-locks"
  curl -s -o /dev/null -w "%{http_code}" -H "X-Admin-Key: $ADMIN_API_KEY" http://localhost:7700/admin/tools/fake/nope
  # Expected: 404
  curl -s -o /dev/null -w "%{http_code}" http://localhost:7700/admin/tools
  # Expected: 401 (no auth header)
  ```

  Evidence: `.sisyphus/evidence/task-3-endpoint.txt`

  **Commit**: `feat(gateway): add GET /admin/tools endpoint for tool discovery`

- [x] 4. Dashboard Data Layer — `dashboard/src/lib/gateway.ts` + `types.ts`

  Add to `dashboard/src/lib/gateway.ts`:

  ```typescript
  export async function fetchTools(): Promise<{ tools: ToolMetadata[] }> {
    return gatewayFetch('/admin/tools');
  }
  export async function fetchTool(service: string, toolName: string): Promise<ToolMetadata> {
    return gatewayFetch(`/admin/tools/${service}/${toolName}`);
  }
  ```

  Add to `dashboard/src/lib/types.ts`:

  ```typescript
  export interface ToolFlag {
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description?: string;
    default?: string;
  }
  export interface ToolEnvVar {
    name: string;
    required: boolean;
  }
  export interface ToolMetadata {
    name: string;
    service: string;
    containerPath: string;
    description: string;
    flags: ToolFlag[];
    envVars: ToolEnvVar[];
    outputShape?: string;
    notes?: string;
    example?: string;
    sourceLength: number;
  }
  ```

  **Pattern**: Follow `triggerEmployee`, `patchArchetype` in `dashboard/src/lib/gateway.ts`

  **Agent**: `quick` | **Wave**: 2 (parallel with Tasks 3, 5, 6) | **Blocks**: Tasks 5, 6

  **Acceptance Criteria**:

  ```bash
  cd dashboard && pnpm build  # exit 0, types compile
  ```

  Evidence: `.sisyphus/evidence/task-4-build.txt`

  **Commit**: grouped with Tasks 5, 6

- [x] 5. Dashboard ToolList Page — `dashboard/src/panels/tools/ToolList.tsx`

  Create a flat table list of all tools:
  - `useEffect` + `useState` — fetch once on mount via `fetchTools()` (NOT usePoll)
  - Table columns: Service (Badge), Tool Name (Link to detail), Description (~100 char truncation)
  - Service badge colors: slack→blue (`bg-blue-100 text-blue-800`), hostfully→orange (`bg-orange-100 text-orange-800`), sifely→purple (`bg-purple-100 text-purple-800`), knowledge_base→green (`bg-green-100 text-green-800`), platform→gray (`bg-slate-100 text-slate-700`)
  - Each row: tool name is `<Link to={/dashboard/tools/${tool.service}/${tool.name}}>` (react-router Link)
  - Tools sorted by service then name (API already sorts, just render in order)
  - Header: `<h2>Tools</h2>` + subtitle `"Shell tools available to AI employees. Auto-discovered from source files."` + count badge `(24 tools)`
  - Loading: "Loading tools..." text; Error: error message + Retry button; Empty: "No tools found"
  - Use shadcn Table, Badge, Button components

  **Pattern**: Follow `dashboard/src/panels/employees/EmployeeList.tsx`

  **Agent**: `unspecified-high` | **Wave**: 2 (parallel with Task 6, after Tasks 3+4) | **Blocks**: Task 7

  **Acceptance Criteria**:

  ```
  Playwright: navigate to http://localhost:7700/dashboard/tools
  - Assert table present with 21+ rows
  - Assert service badges "slack", "sifely", "hostfully" visible
  - Assert clicking "list-locks" navigates to /dashboard/tools/sifely/list-locks
  ```

  Evidence: `.sisyphus/evidence/task-5-tool-list.png`

  **Commit**: grouped with Tasks 4, 6

- [x] 6. Dashboard ToolDetail Page — `dashboard/src/panels/tools/ToolDetail.tsx`

  Full detail page for a single tool:
  - `useParams<{ service: string; toolName: string }>()` to extract identity from URL
  - `useEffect` + `useState` — fetch via `fetchTool(service, toolName)` on mount
  - Back link: `← Back to Tools` → `/dashboard/tools`
  - Header: tool name as `<h2>`, service badge, container path in muted text (`/tools/{service}/{name}.ts`)
  - **Section 1 — Description**: full description text (plain text, NOT markdown)
  - **Section 2 — CLI Usage**: monospace `<pre>` block reconstructed from flags: `tsx /tools/{service}/{name}.ts --req1 <val> [--opt2 <val>]`
  - **Section 3 — Flags**: shadcn Table: columns Flag (`--name`), Type, Required (✓ or —), Default, Description. Show even if empty (show "No flags" row).
  - **Section 4 — Environment Variables**: Table: Variable Name, Required (✓/—). Only show section if envVars.length > 0.
  - **Section 5 — Output Shape**: `<pre>` block with `outputShape` string. Only if non-empty.
  - **Section 6 — Notes & Warnings**: prose text from `notes`. Only if non-empty.
  - **Section 7 — Example**: `<pre>` code block from `example`. Only if non-empty.
  - Use shadcn Card for each section, Separator between sections
  - Loading: "Loading tool details..."; Error/404: "Tool not found" + back link
  - Do NOT render any field as Markdown — plain text only

  **Pattern**: Follow `dashboard/src/panels/employees/EmployeeDetail.tsx`

  **Agent**: `unspecified-high` | **Wave**: 2 (parallel with Task 5) | **Blocks**: Task 7

  **Acceptance Criteria**:

  ```
  Playwright: navigate to http://localhost:7700/dashboard/tools/sifely/create-passcode
  - Assert heading "create-passcode" visible
  - Assert service badge "sifely" visible
  - Assert flags table contains "--lock-id", "--name", "--code"
  - Assert env var "SIFELY_USERNAME" visible
  - Assert back link "← Back to Tools" present
  Playwright: navigate to /dashboard/tools/fake/nonexistent
  - Assert "Tool not found" message
  - Assert back link present
  ```

  Evidence: `.sisyphus/evidence/task-6-tool-detail.png`, `.sisyphus/evidence/task-6-404.png`

  **Commit**: grouped with Tasks 4, 5

- [x] 7. Sidebar Nav + Routes + Docs

  Four small additions:

  **`dashboard/src/components/layout/Sidebar.tsx`**:
  - Add `{ icon: Wrench, label: 'Tools', to: '/dashboard/tools' }` to `NAV_ITEMS`
  - Import `Wrench` from `lucide-react`
  - Position: after 'Rules', before 'Preflight'

  **`dashboard/src/App.tsx`**:
  - Add two routes inside the `<Route element={<Layout>}>` block:
    ```tsx
    <Route path="/dashboard/tools" element={<ToolList />} />
    <Route path="/dashboard/tools/:service/:toolName" element={<ToolDetail />} />
    ```
  - Import `ToolList` from `./panels/tools/ToolList`
  - Import `ToolDetail` from `./panels/tools/ToolDetail`

  **`AGENTS.md`**: Add to "Admin API" section:

  ```
  - `GET /admin/tools` — list all available shell tools with parsed metadata (description, flags, env vars, output shape, SKILL.md enrichment)
  - `GET /admin/tools/:service/:toolName` — get full metadata for a single tool
  ```

  **`README.md`**: Add two rows to the admin API routes table.

  **Agent**: `quick` | **Wave**: 3 (after Tasks 5+6) | **Blocks**: F1-F4

  **Acceptance Criteria**:

  ```bash
  pnpm build          # exit 0
  cd dashboard && pnpm build   # exit 0
  cd dashboard && pnpm test --run  # 5/5 pass
  # Playwright: sidebar shows "Tools" nav item with wrench icon
  # Clicking "Tools" navigates to /dashboard/tools
  ```

  Evidence: `.sisyphus/evidence/task-7-build.txt`, `.sisyphus/evidence/task-7-sidebar.png`

  **Commit**: `feat(dashboard): wire Tools nav item and routes, document admin endpoint`

- [x] 8. Notify Completion via Telegram

  Run: `npx tsx scripts/telegram-notify.ts "✅ tool-discovery-dashboard complete — All tasks done. Come back to review results."`

  **Agent**: `quick` | **Wave**: 3 (after Task 7) | No commit

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — oracle
      Read plan Must Have / Must NOT Have lists. For each Must Have: verify it exists (curl, read file, run command). For each Must NOT Have: search for forbidden patterns. Check all evidence files exist.
      Output: `Must Have [10/10] | Must NOT Have [10/10] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — unspecified-high
      Run `pnpm build` + `cd dashboard && pnpm build` + `cd dashboard && pnpm test --run`. Review all changed files for `as any`, `@ts-ignore`, empty catches, console.log, commented-out code, unused imports. Check for AI slop patterns.
      Output: `Build [PASS] | Anti-patterns [CLEAN] | Logic [CORRECT] | shadcn [9/9] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — unspecified-high
      Execute every QA scenario from every task. Start from clean state. Test the full flow: endpoint → list page → detail page → back navigation. Test edge cases: 404 tool, missing auth, sifely/lib/api.ts excluded from results. Save all screenshots/outputs.
      Output: `Scenarios [9/9 pass] | Edge Cases [CLEAN] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — deep
      For each task: read spec vs actual diff. Verify 1:1 — everything in spec built, nothing beyond spec built. Confirm SKILL.md not modified, no tool files modified, no new shadcn components installed, no caching added, no test files added.
      Output: `Tasks [7/7 compliant] | Unaccounted changes [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

| Tasks | Commit Message                                                             |
| ----- | -------------------------------------------------------------------------- |
| 1-2   | `feat(gateway): add tool metadata parser with SKILL.md enrichment`         |
| 3     | `feat(gateway): add GET /admin/tools endpoint for tool discovery`          |
| 4-6   | `feat(dashboard): add Tools list and detail pages`                         |
| 7     | `feat(dashboard): wire Tools nav item and routes, document admin endpoint` |
