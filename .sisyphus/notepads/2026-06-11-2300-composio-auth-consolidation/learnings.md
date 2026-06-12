# Learnings — composio-auth-consolidation

## [2026-06-12] Plan Start

### Composio SDK Pattern

- SDK init: `new Composio({ apiKey })` — see `src/lib/composio/connectable-apps.ts`
- User namespace: `user_id: tenant_${tenantId}` — see `src/worker-tools/composio/execute.ts`
- `COMPOSIO_API_KEY` is a FUNCTION in `src/lib/config.ts` — must call it: `COMPOSIO_API_KEY()`
- Token fetch: `connectedAccounts.list({ user_id })` → find by toolkit → `connectedAccounts.get(id)` → `account.state.val` → `oauth_token` or `access_token`
- Masking already disabled at project level (`mask_secret_keys_in_connected_account: false`)

### Token Architecture

- Slack `xoxb-` (bot token): Composio-managed (own app) → stored in `tenant_secrets.slack_bot_token`
- Slack `xapp-` (Socket Mode): stays in `.env` as `SLACK_APP_TOKEN` — Composio cannot issue app-level tokens
- GitHub token: Composio-managed (own app, `repo` scope confirmed) → fetched via `internal-github-token.ts` endpoint
- Notion/Google/Jira: Composio-managed credentials (employees call `execute.ts`, never hold token)

### Critical Path

- `installation-store.ts:28` reads `slack_bot_token` from tenant secrets — must stay populated
- `integrationRepo.findByExternalId('slack', teamId)` resolves teamId→tenant — must be preserved by Composio connect path
- `tenant-env-loader.ts:51-53` uppercases `slack_bot_token` → `SLACK_BOT_TOKEN` for workers

### Active Employees Affected

- `cleaning-schedule` (tenant `…0003`) — uses `/tools/notion/` → rewrite to Composio
- `google-workspace-assistant` (tenant `…0003`) — uses `/tools/google/` → rewrite to Composio
- `engineer` / `github-code-engineer` — use `get-token.ts` (kept) but gateway endpoint re-sourced

### Tool Deletion Safety

- `discoverTools()` in `tool-parser.ts` is directory-driven — deleting a dir auto-removes from wizard catalog
- Must rewrite archetypes (T6, T7) BEFORE deleting tools (T8) — never leave `main` broken

## [2026-06-12] Task 1 — getComposioConnectionToken

### Implementation Location
- `src/lib/composio/connection-token.ts` — three exported error classes + `getComposioConnectionToken(tenantId, toolkitSlug): Promise<string>`
- `tests/unit/lib/composio/connection-token.test.ts` — 18 unit tests, all passing

### Key Design Decisions
- `connectedAccounts.list({ user_id: `tenant_${tenantId}`, toolkitSlug })` — passes toolkitSlug for server-side filtering
- Item matching: handles both `item.toolkit.slug` and `item.toolkitSlug` field shapes (Composio API returns either)
- Masked token detection: ends with `...` OR contains `***` OR contains `[REDACTED]`
- Token field priority: `oauth_token` first, then `access_token` fallback
- `this.cause = cause` works without explicit `readonly cause` declaration in TypeScript — `Error.prototype.cause` is already defined

### Vitest Mock Gotchas (CRITICAL)
- `vi.mock()` factories are hoisted BEFORE any `const`/`let`/`var` initializations at module top level
- To use a shared spy inside a `vi.mock()` factory, declare it with `vi.hoisted(() => ({ ... }))` — this runs before hoisting
- `mockReturnValue('')` persists across `vi.clearAllMocks()` — use `mockReturnValueOnce('')` to scope to a single test
- `vi.mock()` calls inside test bodies also get hoisted — NEVER put `vi.mock()` inside a test function body

### Typed Errors Exported
- `ComposioNoConnectionError` — `{ tenantId, toolkitSlug }`
- `ComposioMaskedTokenError` — `{ toolkitSlug }`
- `ComposioApiError` — `{ toolkitSlug, cause }`

## [2026-06-12] Task 2 — Connection Status & Token Verification (VLRE)

### Evidence files
- `.sisyphus/evidence/task-2-connections/connections.json` — gateway DB view + Composio ground truth + per-toolkit status
- `.sisyphus/evidence/task-2-connections/connections-raw.json` — raw gateway API response
- `.sisyphus/evidence/task-2-connections/token-check.txt` — getComposioConnectionToken results + exact-value probe
- `.sisyphus/evidence/task-2-connections/credential-model.txt` — managed vs own-app per toolkit

### CONTRADICTIONS to inherited assumptions (IMPORTANT)
1. "Masking already disabled at project level" is FALSE. Live check shows masking is ON:
   - slack token -> "xoxp..." (7 chars, masked)
   - github token -> "REDACTED" (8 chars, masking placeholder)
   - gmail token -> "REDACTED" (8 chars, masking placeholder)
   A real token is 40-60+ chars. None of slack/github are readable today.
2. "GitHub: must use OWN app credentials" — GitHub auth config is currently
   `managed=true` (Composio-managed), authConfig ac_2mXVfyCm49K1. NOT own-app yet.
   To reach target: create custom GitHub auth config (managed=false) w/ repo scope,
   disable masking, reconnect tenant.

### Verified credential model (Composio authConfigs.list, all pages)
- slack:       managed=false (OWN-APP) ✅  ac_VKAyYpy7JfC5  OAUTH2
- slackbot:    managed=true  (Composio-managed) ac_UP84VDHgzCBI  — NOTE: TWO slack toolkits exist
- github:      managed=true  (Composio-managed) ac_2mXVfyCm49K1  ⚠️ target wants own-app
- notion:      managed=true  ac_Gsqb4UMAQUkD
- gmail:       managed=true  ac_DP-UMa6NBplN
- googledrive: managed=true  ac_pgqgCaeoK6Nh
- jira:        managed=true  ac_NdBj12TlgSy7

### Connection status (required toolkits)
- slack:       gateway=active, Composio=ACTIVE (4 dup active accts) — token MASKED
- slackbot:    gateway=active, Composio=ACTIVE
- github:      gateway=MISSING from composio_connections table, BUT Composio has ACTIVE acct ca_RC08mnOFvG5b — token MASKED (REDACTED)
- notion:      gateway=active, BUT NOT in Composio connectedAccounts.list under tenant_<id> user_id (helper -> ComposioNoConnectionError)
- gmail:       gateway=MISSING, Composio ACTIVE ca_OuCJhllG504D — token MASKED
- googledrive: MISSING everywhere
- jira:        MISSING everywhere

### BUG found in getComposioConnectionToken (src/lib/composio/connection-token.ts)
- isMaskedToken() checks endsWith('...') || includes('***') || includes('[REDACTED]')
- Composio masks GitHub/Gmail as bare "REDACTED" (no brackets) -> matches NONE
  -> helper returns "REDACTED" as a SUCCESSFUL token (false positive).
- Slack "xoxp..." ends with "..." -> correctly caught.
- FIX NEEDED: also detect bare 'REDACTED' (and likely uppercase) so github/gmail
  masked placeholders are rejected, not returned as valid tokens.

### Data-consistency note
- gateway `composio_connections` table and Composio's connectedAccounts.list diverge:
  - DB has notion active; Composio has no notion account under tenant_<id>.
  - Composio has github+gmail active; DB has neither.
  The DB table is NOT a reliable mirror of Composio reality — trust the SDK for token ops.

### Env loading gotcha for ad-hoc tsx scripts
- COMPOSIO_API_KEY (config.ts) reads process.env, which is NOT auto-populated.
- `source .env` FAILS (multiline values, parse error near `\n`).
- Correct pattern (from scripts/generate-composio-skills.ts):
    const dotenv = createRequire(import.meta.url)('dotenv');
    dotenv.config({ path: join(repoRoot, '.env') });
- Scripts must live in-repo (not /tmp) to resolve node_modules. Run via `pnpm exec tsx`.

## [2026-06-12] Task 3 — Notion Operation Mapping

### cleaning-schedule Notion Usage (confirmed from DB execution_steps)
- Employee calls `/tools/notion/get-page.ts` exactly **3 times** (Steps 3, 4A, 4B)
- **NO** calls to `append-blocks.ts` or `update-block.ts` — employee is read-only w.r.t. Notion
- All 3 calls are page reads: Reporte Financiero, Manual de Personal, Directorio Operativo

### Page IDs (stable — hardcoded in execution_steps)
- Reporte Financiero: `370d540b438080ca8676e61856488960`
- Manual de Personal: `370d540b438080969a72c16c20defc70`
- Directorio Operativo: `370d540b4380809a8ea0c11074f92abb`

### Composio Skill Status
- `src/workers/skills/composio-notion/` EXISTS with 48 action files
- `NOTION_GET_PAGE_MARKDOWN` — best replacement for `get-page.ts` (single call, returns full Markdown)
- `NOTION_FETCH_ALL_BLOCK_CONTENTS` — fallback if block-level structure needed (bold, block types)
- Action schema files in `actions/*.md` have sparse params (generic placeholders) — actual params must be inferred from action descriptions

### Mapping Summary (no gaps)
| Shell tool | Composio action | Status |
|---|---|---|
| `get-page.ts` | `NOTION_GET_PAGE_MARKDOWN` | ✅ Confirmed equivalent |
| `append-blocks.ts` | `NOTION_APPEND_TEXT_BLOCKS` | N/A (not used by cleaning-schedule) |
| `update-block.ts` | `NOTION_UPDATE_BLOCK` | N/A (not used by cleaning-schedule) |

### Task 6 Archetype Rewrite Pattern
Replace each `tsx /tools/notion/get-page.ts --page-id <id>` with:
```bash
tsx /tools/composio/execute.ts --toolkit notion --action NOTION_GET_PAGE_MARKDOWN --params '{"page_id": "<id>"}'
```
Output shape: `{ data: { ... }, error: null }` — verify `data.markdown` field in live test before finalizing.

### Critical: Notion Connection Discrepancy (from T2)
- DB `composio_connections` shows notion=active for VLRE tenant
- BUT Composio SDK `connectedAccounts.list` returns NO notion account under `tenant_<id>`
- This means `getComposioConnectionToken('...0003', 'notion')` throws `ComposioNoConnectionError`
- **Implication for T6**: The archetype rewrite may fail at runtime unless the Notion connection is re-established in Composio under the correct user_id namespace

## [2026-06-12] Task 16 — Unified Integrations Page

### Route Changes (App.tsx)
- `/dashboard/integrations` → renders `ComposioConnections` (was `IntegrationsPage`)
- `/dashboard/integrations/composio` → `<Navigate to="/dashboard/integrations" replace />` (was duplicate ComposioConnections render)
- `IntegrationsPage` import removed from `App.tsx`; file itself kept to avoid breaking any direct imports

### Heading Change (ComposioConnections.tsx line 173)
- `"Connected Apps"` → `"Integrations"`

### Sidebar confirmed correct
- Already pointed to `/dashboard/integrations` — no change needed

### Build
- `pnpm dashboard:build` → EXIT_CODE:0, no TypeScript/lint errors

### Pattern: Navigate component for SPA redirects
- `<Navigate to="/dashboard/integrations" replace />` is the React Router v6 way to redirect at a route level
- Need to import `Navigate` from `react-router-dom` alongside `Routes`, `Route`

## [2026-06-12] Task 6 — cleaning-schedule Notion → Composio Rewrite

### Param name: `page_id` (snake_case), NOT `pageId`
- Task prompt example showed `{"pageId":...}` — THIS IS WRONG, would cause runtime HTTP 400.
- Correct Composio param is `page_id` — confirmed by THREE ground-truth sources:
  1. `.sisyphus/evidence/task-3-notion-map/mapping.md` (designated authority) — uses `page_id`
  2. `src/lib/composio/__fixtures__/notion-tools.json` — NOTION_GET_PAGE_MARKDOWN `input_parameters.page_id` (type string, required:true)
  3. `src/workers/skills/composio-notion/SKILL.md` — all Notion actions use `page_id`
- The skill action file `actions/NOTION_GET_PAGE_MARKDOWN.md` has GENERIC placeholder params (type/title/required/properties) — useless for param names. Use the fixture JSON instead.

### seed.ts duplication structure (archetype upserts)
- Every archetype upsert duplicates `execution_steps` VERBATIM in BOTH `create` and `update` blocks.
- cleaning-schedule (`vlreCleaningSchedule`, id ...0019): create block ~line 3480, update block ~line 3746.
- `tool_registry.tools` array also appears in BOTH blocks (2x).
- Net: 3 notion lines × 2 blocks = 6 execution_steps refs + 2 tool_registry refs = 8 total `/tools/notion/` matches.
- `Edit` with `replaceAll:true` handles both create+update at once since the lines are byte-identical.

### Live DB UPDATE technique for large multi-line execution_steps
- DO NOT re-escape the full 8KB string (emojis, accents, single-quotes, newlines → escaping hell).
- INSTEAD: use nested Postgres `replace(replace(replace(execution_steps, old1, new1), old2, new2), old3, new3)` to surgically swap only the 3 lines in-place. Preserves everything else verbatim.
- For tool_registry jsonb array element swap: `jsonb_set(..., (SELECT jsonb_agg(CASE WHEN elem #>> '{}' = 'old' THEN to_jsonb('new'::text) ELSE elem END) FROM jsonb_array_elements(...)))`. NOTE: must use `elem #>> '{}'` to extract text — comparing jsonb element directly to a string literal throws "invalid input syntax for type json: Token / is invalid".
- SQL saved at `.sisyphus/evidence/task-6-cleaning/update.sql` (run with `psql -f`, returned `UPDATE 1`).

### --fixture flag dropped in rewrite
- Old `/tools/notion/get-page.ts` calls had `--fixture reporte-financiero` etc. (mock-mode fixtures for that tool).
- Composio `execute.ts` uses `--mock` (not `--fixture`) and has its own single fixture. The per-page fixtures don't transfer. Dropped `--fixture` from rewritten calls — acceptable since live E2E (Task 12) uses real Composio.

### Verification
- Live DB: 0 `/tools/notion/` (all cols), 3 Composio calls, tool_registry migrated.
- seed.ts: 0 `/tools/notion/`, 6 Composio calls (3 create + 3 update).
- Evidence: `.sisyphus/evidence/task-6-cleaning/steps.txt`

## [2026-06-12] Task 17 — Custom Credential Apps (Hostfully, Sifely)

### Architecture
- Registry pattern: `CUSTOM_CREDENTIAL_APPS` array in `CustomCredentialCard.tsx` — add a new entry to add a new app, no new component needed
- `isConnected` = ALL field keys exist in `listSecrets()` response
- `deleteSecret` added to `dashboard/src/lib/gateway.ts` (was missing)
- `ConnectedAppsZone` extended with `customConnectedCards: ReactNode` + `customConnectedCount: number` props — adds custom cards to the same grid, updates count badge

### Key Decisions
- Secret values NEVER fetched back — form fields always empty (`{}` on dialog open)
- Connected custom apps appear in the "Connected apps" zone (same grid as Composio)
- Available custom apps appear first in "Available to connect now" grid (before Composio items)
- Uses `Promise.all` for parallel set/delete of multiple secrets per app
- Error handling via `toast.error` — single message covers any field failure

### Files Changed
- `dashboard/src/lib/gateway.ts` — `deleteSecret(tenantId, key)` added
- `dashboard/src/pages/composio/CustomCredentialCard.tsx` — new (registry + card component)
- `dashboard/src/pages/composio/ConnectedAppsZone.tsx` — `customConnectedCards` + `customConnectedCount` props
- `dashboard/src/pages/ComposioConnections.tsx` — secrets fetch, custom app filtering, card rendering

### Build
- `pnpm dashboard:build` → EXIT_CODE:0, no TypeScript/lint errors

## [2026-06-12] Task 18 — E2E Integrations Page Verification

### Test Run Summary
- Date: 2026-06-12
- Tenant: `00000000-0000-0000-0000-000000000003` (VLRE)
- Evidence: `.sisyphus/evidence/task-18-integrations-e2e/`

### Verification Results

#### (a) `/dashboard/integrations` renders unified Composio page
- ✅ URL: `http://localhost:7700/dashboard/integrations?tenant=00000000-0000-0000-0000-000000000003`
- ✅ Heading: **"Integrations"** (h1)
- ✅ Subtitle: "Connect the tools your team already uses to unlock powerful automations."
- ✅ Connected apps zone visible (showing count badge)
- ✅ "Available to connect now" section present
- ✅ "Browse all apps" section present with search + category filters

#### (b) `/dashboard/integrations/composio` redirects to `/dashboard/integrations`
- ✅ Navigating to `/dashboard/integrations/composio?tenant=...` results in final URL `/dashboard/integrations?tenant=...`
- ✅ React Router `<Navigate to="/dashboard/integrations" replace />` client-side redirect works correctly
- ✅ No 404 — page loads normally

#### (c) Hostfully credential form save + encrypted persistence
- ✅ Hostfully card in "Available to connect now" section (after disconnect)
- ✅ Clicking "Connect Hostfully" opens a dialog with title "Connect Hostfully"
- ✅ Dialog text: "Enter your Hostfully credentials. They are stored securely and never shown again."
- ✅ Fields: "API Key" (placeholder: "Enter api key") + "Agency UID" (placeholder: "Enter agency uid")
- ✅ Filled with test values: `test-api-key-e2e` / `test-agency-uid-e2e`
- ✅ "Save credentials" button → API calls: `PUT .../secrets/hostfully_api_key` + `PUT .../secrets/hostfully_agency_uid`
- ✅ Dialog closes after save
- ✅ Hostfully moves to "Connected apps" section
- ✅ Connected count increments (+1)

#### psql verification — encrypted rows
```
 hostfully_agency_uid | ciphertext=Nvj18uOrmpan6iNZqt3ept3uLQ== | iv=YkrE9ojzl6Jmz+PI | auth_tag=4IyYx4vNT+tAEk0AgoUEIA==
 hostfully_api_key    | ciphertext=LPK6nZbWOAbunauBiG/21A==     | iv=sGHv6400eMu0HIvh | auth_tag=vMEymTxhiGGigCE00kuNnQ==
```
- ✅ 2 rows exist in `tenant_secrets` for the tenant
- ✅ ciphertext_len: 24 (api_key) and 28 (agency_uid) — base64 of AES-256-GCM ciphertext
- ✅ iv_len: 16 — base64 of 12-byte random IV
- ✅ auth_tag_len: 24 — base64 of 16-byte GCM auth tag
- ✅ Values are AES-256-GCM encrypted, NOT plaintext (ciphertext `LPK6nZb...` ≠ `test-api-key-e2e`)

#### (d) Re-opening form shows empty fields (no secret leakage)
- ✅ After disconnect + Connect click, form opens with `apiKeyValue=""`, `agencyUidValue=""`
- ✅ `noLeakage: true` — confirmed programmatically
- Secret values are NEVER returned from the API (`listSecrets()` returns only keys, not values)

### Disconnect API Behavior
- `DELETE /admin/tenants/:tenantId/secrets/:key` → 204 No Content
- After disconnect API calls succeed, page UI does NOT immediately update — requires reload
- After page reload, connected count decrements and app moves to Available section

### Network Request Pattern (connect flow)
- Form submit → `PUT .../secrets/hostfully_api_key` + `PUT .../secrets/hostfully_agency_uid` (parallel)
- After save → `GET .../secrets` (page re-fetches to update Connected status)
- Hostfully `isConnected` = both `hostfully_api_key` AND `hostfully_agency_uid` keys present in secrets list

### CDP Note
- Chrome was NOT running with `--remote-debugging-port=9222` at test time
- Used Playwright MCP managed browser instead (works fine for React SPA dashboard)
- For future runs: start Chrome with `open -a "Google Chrome" --args --remote-debugging-port=9222` before running E2E if CDP is required

### Evidence Files
- `01-integrations-page.png` — initial page load, heading "Integrations" visible
- `02-composio-redirect.png` — page after navigating to `/composio` path (confirms redirect)
- `03-after-disconnect-attempt.png` — post-disconnect (API calls succeeded but UI needed reload)
- `04-hostfully-in-available.png` — Hostfully in Available section after reload
- `05-credential-form-open.png` — Connect Hostfully dialog open (empty fields)
- `06-form-filled.png` — form filled with test credentials
- `07-hostfully-connected.png` — Hostfully in Connected section after save
- `08-form-empty-on-reopen.png` — form re-opened showing empty fields (no leakage)
- `psql-secrets-output.txt` — psql output confirming 2 encrypted rows

## [2026-06-12] Task 7 — google-workspace-assistant Rewrite

- Migrated `google-workspace-assistant` archetype off `/tools/google/*` (21 scripts + `validate-env.ts`) to `tsx /tools/composio/execute.ts --toolkit <slug> --action <SLUG> --params '<json>'`.
- Toolkit slug map used: gmail / googledrive / googledocs / googlesheets / googleslides / googlecalendar.
- Employee is GENERAL-PURPOSE — rewrote execution_steps to tell it to discover action slugs dynamically via the composio-<app> skills loaded in the session, rather than hardcoding operations.
- seed.ts pattern confirmed: `execution_steps` is a single shared const (`VLRE_GOOGLE_ASSISTANT_EXECUTION_STEPS`) referenced by BOTH create+update — one Edit covers both. `tool_registry` IS duplicated inline in both blocks — used `replaceAll: true` to hit both.
- New tool_registry: only 3 entries — `/tools/platform/submit-output.ts`, `/tools/slack/post-message.ts`, `/tools/composio/execute.ts`.
- Dropped the validate-env STEP entirely (Composio handles auth; no google_* tenant secrets needed — auth is via OAuth connect flow + `tenant_${tenantId}` namespace).
- Live DB UPDATE done via `psql -f` with dollar-quoting ($STEPS$ / $REG$) to avoid shell/quote escaping of the JSON `--params '<json>'` examples. Clean approach for multi-line text with embedded single quotes.
- GOTCHA: JS template `\\` in seed.ts resolves to a single `\` in the stored DB value — the SQL file must use single backslashes for the line-continuation chars to match seed output.
- Verification: count of google-workspace-assistant rows with `/tools/google/` in execution_steps = 0; `pnpm build` exit 0; grep `/tools/google/` in seed.ts = zero matches.
- Doc freshness: updated docs/employees/2026-06-03-0243-google-assistant.md (Available Tools, Authentication→Composio, Known Gotchas) per the mandatory discrepancy rule.
- LSP diagnostics unavailable locally (typescript-language-server not installed via asdf) — `tsc -p tsconfig.build.json` (pnpm build) is the authoritative TS check and passed.

## [2026-06-12] Task 8 — Delete notion/google/jira tools

Deleted `src/worker-tools/{notion,google,jira}/` + tests. Build + tests clean (147 files, 1737 passed, 9 skipped, 0 fail).

### Reference cleanup beyond the directories (the non-obvious part)
Deleting the dirs is trivial; the references that break the build/test are spread across config:
- **vitest.config.ts** — had a notion test in `exclude` (`src/worker-tools/notion/__tests__/write-tools.test.ts`) AND a coverage exclude (`src/worker-tools/notion/lib/**`). Both removed.
- **vitest.integration.config.ts** — had `tests/integration/worker-tools/jira/add-comment.test.ts` in `exclude`. Removed.
- **eslint.config.mjs** — had `src/worker-tools/notion/lib/**` in `ignores`. Removed.
- **tests/integration/worker-tools/jira/** — 5 integration test files testing the deleted jira source. These are NOT under the tool dir, so `rm -rf src/worker-tools/jira` alone leaves them dangling (they `path.resolve` to the deleted source). Must delete `tests/integration/worker-tools/jira/` too.
- **prisma/seed.ts** — `jira-motivation-bot` archetype `tool_registry` listed `/tools/jira/get-issue.ts`. Its `execution_steps` read from `triage_result`, NOT the tool, so removing the advisory entry is behavior-safe. Identical line in BOTH create+update blocks → `replaceAll: true`.

### Flaky-test gotcha (important for all Wave-3/4 tasks)
A live `pnpm dev` gateway running on the host causes 2 unit tests to flake under parallel run:
- `tests/unit/gateway/socket-mode-lock.test.ts` — the live gateway holds/contends the socket-mode lock file; the "blocked-live" assertion sees `acquired:true` instead of `false`.
- `tests/unit/gateway/routes/admin-tasks.test.ts` — "socket hang up" network flake.
Both PASS in isolation on clean HEAD (`git stash` → `npx vitest run <2 files>` → 13 passed) and PASS on full re-run. Neither imports any worker-tool. Verdict: environmental, not a regression. When you see these two fail, re-run before assuming breakage.

### Stale LSP cache after bulk delete
After `rm -rf` of tool dirs, the LSP/diagnostics tool still reported "Cannot find module './auth.js'" errors for the just-deleted notion files. These are stale — `ls` confirms the files are gone and `tsc -p tsconfig.build.json` exits 0. Trust the tsc build, not the LSP cache, immediately after bulk deletes.

### Pre-existing (do not "fix")
`vitest.config.ts:32` LSP error "coverage does not exist in type UserConfigExport" exists at HEAD (verified via `git show HEAD:vitest.config.ts`). Not caused by this task. Build still passes.

## [2026-06-12] Task 9 — seed.ts Verification

**Result**: seed.ts was already clean — T6/T7/T8 had already removed all `/tools/notion/`, `/tools/google/`, and `/tools/jira/` references in prior tasks.

**Actions taken**:
- `grep -n "/tools/notion/\|/tools/google/\|/tools/jira/" prisma/seed.ts` → zero matches (already clean)
- Added clarifying comment before the `slack_bot_token` seed block: documents it as a LOCAL-DEV FALLBACK only; production sources from Composio. Prevents accidental deletion by future devs cleaning up after Composio integration.
- Ran `DATABASE_URL="postgresql://postgres:postgres@localhost:54322/ai_employee_test" pnpm prisma db seed` → exit 0, all 14 models, 7 archetypes upserted cleanly
- Post-seed psql check: `SELECT count(*) FROM archetypes WHERE execution_steps LIKE '%/tools/notion/%' OR execution_steps LIKE '%/tools/google/%' OR execution_steps LIKE '%/tools/jira/%'` → **0**
- Committed: `chore(seed): document slack_bot_token as local-dev fallback for Composio`

**Key pattern**: `.sisyphus/evidence/` is gitignored — save evidence locally but don't try to commit it.

## [2026-06-12] Task 10 — Wizard Prompt Cleanup

**Result**: NO CHANGES NEEDED — wizard prompt (`archetype-generator-prompts.ts`) and `archetype-generator.ts` were already clean after T6/T7/T8.

### Verification evidence
- `grep -n "notion|google|jira" archetype-generator-prompts.ts` → 2 matches, BOTH benign:
  - L29: `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_CREATE_PAGE` — "notion" is a Composio `--toolkit` ARGUMENT (correct post-migration pattern), NOT a `/tools/notion/` path.
  - L91: `notion_page_url` — an example input_schema KEY name, not a tool path.
- `grep -nE "/tools/(notion|google|jira)/"` across both generator files → ZERO matches.
- No tiebreaker/preference language exists or was added (overlap is gone — nothing to disambiguate).

### Why discoverTools() auto-handles deletion (no code change)
- `discoverTools(basePath)` (tool-parser.ts L66) = `fs.readdir(basePath, {recursive:true})` on `src/worker-tools/`. Module header: "Never caches — always reads from disk."
- `buildSystemPrompt()` (archetype-generator.ts L119-149) feeds that live scan into `formatToolCatalog()` → the "## Available Tools" prompt section.
- Since notion/google/jira dirs were physically deleted in T8, they vanish from the catalog automatically. The LLM is told (formatToolCatalog L96, SYSTEM_PROMPT_POST L292) to use ONLY listed tools → deleted tools cannot be generated.
- `src/worker-tools/` now contains: _template, composio, github, hostfully, knowledge_base, lib, platform, sifely, slack. (notion/google/jira absent — confirmed.)

### Confirms T8 inherited wisdom
- The stale LSP "Cannot find module './auth.js'" errors for `src/worker-tools/notion/*.ts` re-appeared this session — exactly the stale-LSP-cache gotcha logged in T8 (learnings L341-342). Files ARE deleted (directory read confirms); `pnpm build` EXIT_CODE:0 is authoritative. Trust tsc, not the LSP cache.

### Build
- `pnpm build` → EXIT_CODE:0.

### No commit
- Zero code changes made → no commit created. Evidence at `.sisyphus/evidence/task-10-wizard/result.txt`.

## [2026-06-12] Task 11 — Docs Update

### Files updated
- `AGENTS.md` — removed Jira, Notion, Google rows from shell-tools table; updated Composio row description to document auth-manager model (Composio manages auth for all connected toolkits; GitHub + Slack use own-app credentials)
- `docs/employees/cleaning-schedule.md` — replaced Notion OAuth setup with Composio connect flow; updated CRITICAL gotcha; removed `notion_access_token` from Tenant Secrets table; added note that Notion access is via Composio
- `docs/employees/2026-06-02-1230-engineer.md` — added note in inbound flow and Setup section that GitHub token currently comes from GitHub App installation credentials via `internal-github-token.ts`; noted T4 (Composio GitHub migration) is pending
- `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — updated Mock Mode Testing section to reflect `/tools/jira/` removal and Composio-based Jira access; updated Docker image gotcha
- `docs/guides/2026-05-31-2352-cleaning-schedule-verification.md` — replaced 3x `/tools/notion/get-page.ts` calls with `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_GET_PAGE_MARKDOWN` equivalents

### Grep check result
Remaining `/tools/jira` references after update:
- `docs/architecture/2026-04-14-0104-full-system-vision.md` — historical architecture examples (not operational instructions, OK to leave)
- `docs/employees/2026-05-21-1721-jira-motivation-bot.md` — updated references correctly noting tools are removed

### Key pattern
When removing a shell tool directory, update: AGENTS.md table, employee doc, any verification/testing guides that reference the tool CLI, and the employee's setup checklist + tenant secrets table.

## [2026-06-12] Task 12 — cleaning-schedule Live E2E — ✅ PASS

**Task ID:** `0dabde55-32ca-4864-95ae-a1b80bb67af7` · runtime ~2.5 min · status `Done`

### Result
Full E2E verified the Composio auth consolidation works on a real task. All 4 acceptance criteria met:
- Task reached `Done` (Received→...→Executing→Submitting→Validating→Submitting→Done; no Reviewing — `approval_required: false`)
- Harness log shows 3× `tsx /tools/composio/execute.ts --toolkit notion --action NOTION_GET_PAGE_MARKDOWN`
- `task_composio_calls`: 3 rows, `toolkit=notion`, `tool_name=NOTION_GET_PAGE_MARKDOWN`, `phase=execution`
- Deliverable: Spanish cleaning schedule posted to Slack `C0B71QSMZKQ` (9 properties, 3 cleaners), classification `NO_ACTION_NEEDED`

### Gotchas discovered
1. **Trigger payload key is `inputs` (plural), not `input`.** `{"input":{...}}` → `422 MISSING_REQUIRED_INPUTS`. Correct: `{"inputs":{"date":"2026-06-13"}}`. Schema source: `admin-employee-trigger.ts` line 22 (`inputs: z.record(...)`).
2. **`task_status_log` column is `to_status`/`from_status`, not `status`.** `SELECT status` errors.
3. **`tasks` table has only `status` + `metadata` columns** for output — no `output`/`result`/`summary` columns. Deliverable lives in Slack (channel/ts in `metadata.notify_slack_channel` / `notify_slack_ts`); audit in `task_composio_calls`.
4. **execute.ts notion calls are NOT visible via `docker logs`** — they run inside the OpenCode bash tool. Find them in the harness log file `/tmp/employee-{taskId:0:8}.log` via `grep -oE "tsx /tools/[^\"]*"`. docker-logs grep for "notion"/"composio" returns only the boot-time skill-filter lines.
5. Container boot log (`harness-helpers`) confirms `connectedToolkits: ["notion","slack","github"]` and keeps `composio-notion`/`composio-slack` skills, removes unconnected ones — the boot-time `filterComposioSkills()` works.

### Leftover-files observation (NOT modified — out of scope for this task)
LSP reports stale files still present: `src/worker-tools/notion/{get-page,append-blocks,update-block}.ts` import `./auth.js` and `./lib/notion-types.js` which T8 deleted → unresolved-module errors. These leftover notion tool files were not fully removed by T8 (only `auth.ts`/`lib` deleted, not the consumers). They don't affect runtime (cleaning-schedule uses `/tools/composio/execute.ts`, not these), but they're dead code with broken imports. Flag for cleanup follow-up.

### Evidence
`.sisyphus/evidence/task-12-cleaning-e2e/` — SUMMARY.md, task-id.txt, status-log-trace.txt, composio-calls.txt, tool-invocations.txt, container-composio-init.txt, slack-deliverable.txt

## [2026-06-12] Task 13 — google-workspace-assistant Live E2E (BLOCKED, environmental)

**Outcome**: ❌ Cannot satisfy success criteria — no Google toolkit connected for VLRE. Two tasks triggered; both reached `Submitting` with `NO_ACTION_NEEDED`. Zero Google `task_composio_calls` rows possible without an OAuth connect first.

### Finding A — task brief's trigger key was wrong
- Brief said `{"inputs":{"task":"..."}}`. Harness `extractTriggerPrompt()` in `src/workers/lib/trigger-payload.mts` reads **only `prompt`** key.
- `inputs.task` → silently dropped → empty `## Your Assignment` → model: "No assignment found in initial message - no action taken".
- Correct key is `inputs.prompt` (confirmed by `docs/employees/2026-06-03-0243-google-assistant.md` L14/32/36).
- Trigger-key cheat sheet: `input` (singular) → 422; `inputs.task` → 200 but no-op; `inputs.prompt` → 200 + assignment injected ✅.

### Finding B — NO Google toolkit connected for VLRE (hard blocker)
- Direct probes vs `https://backend.composio.dev/api/v3.1/tools/execute/<ACTION>` with `user_id=tenant_00000000-0000-0000-0000-000000000003` (exact path execute.ts uses, key `ak_b6ci2Ba-Oz60ZZn4qQ6I`):
  - `SLACK_TEST_AUTH` → `successful:true` (control passes)
  - `GMAIL_FETCH_EMAILS` → "No connected account found ... for toolkit gmail"
  - `GOOGLEDRIVE_LIST_FILES` → "No connected account found ... for toolkit googledrive"
  - googledocs/googlesheets/googlecalendar → all NOT CONNECTED
- `composio_connections` (VLRE) = github, notion, slack only.
- Harness `filterComposioSkills(["notion","slack","github"])` removed `composio-gmail` at boot (logged both tasks). Task #2 model STILL attempted `GMAIL_FETCH_EMAILS` from its execution_steps examples → Composio HTTP 400.
- **Inherited wisdom WRONG**: brief claimed Gmail ACTIVE `ca_OuCJhllG504D` under tenant_...0003 — verified false.

### Audit-row gotcha
`execute.ts` writes `task_composio_calls` ONLY on the HTTP-success path (after `if (!response.ok)` exit at L156-165; write at L167). A 400 "no connected account" → no audit row. So a failed Google call leaves zero rows even though it was attempted. Slack calls succeeded → 5 audit rows on task #1.

### Secondary (orthogonal) — NO_ACTION_NEEDED tasks stuck in Submitting
Both tasks sat in `Submitting` 12+ min instead of short-circuiting Submitting→Done. No lifecycle error in available logs. Possible follow-up; not related to the Composio-Google verification goal.

### Remediation to pass this E2E
1. `GET /admin/tenants/00000000-0000-0000-0000-000000000003/composio/connect?toolkit=gmail` → open URL → complete Google OAuth (live URL this run: https://connect.composio.dev/link/lk_5WzxYtcYGNVJ).
2. Verify connection active via `/composio/connections`.
3. Re-trigger with `{"inputs":{"prompt":"..."}}` (NOT `task`).
4. Expect gmail row in `task_composio_calls` → Reviewing → approve → Done.

### Task IDs
- `170799e7-a6f3-4ef7-9e41-66af9fef6d43` (inputs.task, no assignment)
- `e4f42387-edcc-4262-8a2d-5474c6c8d382` (inputs.prompt, attempted Gmail)
- Evidence: `.sisyphus/evidence/task-13-google-e2e/` (SUMMARY.md + 5 raw files)

## [2026-06-12] Task 13 — google-workspace-assistant Live E2E (retry with Gmail connected) — ✅ PASS

**Outcome**: PASS. Gmail Composio integration verified end-to-end after Gmail OAuth was completed.

**Task ID**: `40dd4bfe-4edc-413f-b7f0-6b47e5d7041f` (VLRE `...0003`, archetype `00000000-0000-0000-0001-000000000001`)

**Evidence (all 4 criteria met)**:
- Task reached `Done` — full trace: Received→Triaging→AwaitingInput→Ready→Executing→Validating→Submitting→Done
- `task_composio_calls`: 2 rows `gmail | GMAIL_FETCH_EMAILS | execution` (zero-rows-is-failure rule satisfied)
- Deliverable contains 3 REAL inbox emails (Leadpages migration, 2 Turno cleaning alerts) — live API access proven
- Model `deepseek/deepseek-v4-flash` routed via OpenCodeGo, called Gmail reliably. promptTokens 24990 / completionTokens 2054 / $0.0052

**Key learnings / gotchas confirmed**:
1. **Trigger key is `inputs.prompt`** (plural inputs, key=prompt) — CONFIRMED working. Harness `extractTriggerPrompt()` reads ONLY the `prompt` key; `inputs.task` silently dropped, `input` (singular) → 422.
2. **NO_ACTION_NEEDED + approval_required=true parks in Submitting, NOT Reviewing.** A read-only "list emails" request is correctly classified NO_ACTION_NEEDED. The lifecycle (`override-card.ts` `runOverrideCardPath`) posts an FYI override card and parks on `step.waitForEvent('wait-for-override', timeout: 24h)`. Task stays `Submitting` up to 24h until override or timeout→Done. This is EXPECTED, not a stall. To finish E2E cleanly, send: `employee/override.requested` with `direction: null` → drives Submitting→Done (override-dismiss path). Inngest run shows "Completed" even while parked because waitForEvent yields the run.
3. **Archetype `notification_channel` is null** → `channel_not_found` Slack error at notify-received (non-fatal, swallowed). Does not affect Composio verification. Set `notification_channel` if Slack delivery is wanted for this employee.
4. **Harness log location**: `/tmp/employee-{id8}.log` is correct for Composio/classification lines. Filter out `permission`/`ruleset` noise — opencode-server emits huge permission-eval JSON blobs. Use `grep '"component":"opencode-harness"'` for clean lifecycle.
5. **Dual-gateway footgun observed**: two independent `tsx watch` gateway supervisors were running. The one owning port 7700 (PID logging to `/tmp/ai-gateway.log`) ran the lifecycle — NOT the `pnpm dev` gateway (`/tmp/ai-dev.log`). When debugging lifecycle on a Slack-trigger workflow, run the single-gateway pre-flight (`pgrep -f '.*src/gateway/server.ts' | wc -l` must be 1) or you'll read the wrong log and chase phantom stalls.
6. Boot-time `filterComposioSkills(["notion","slack","github","gmail"])` kept composio-gmail (gmail now connected); removed composio-slackbot.

**Resolves** the prior BLOCKED T13 attempt (no Google toolkit connected). Gmail active since 2026-06-12T16:32:27Z.

**Evidence dir**: `.sisyphus/evidence/task-13-google-e2e/` (SUMMARY.md, status-log-trace.txt, composio-calls.txt, deliverable.txt, harness-log-excerpt.txt, harness-component-log.txt)

## [2026-06-12] Task 14 — engineer Live E2E (GitHub App token flow) — ✅ PASS

**Verifies**: engineer employee unaffected by Composio consolidation (T8 tool deletes, T19 OAuth-route removal). It uses the GitHub App installation-token flow (`get-token.ts` → `internal-github-token.ts` → `generateInstallationToken()` → `github_installation_id` secret), which was NOT touched.

### Results — 2 runs, both produced real PRs
- Run 1: task `44e77b7a-8d69-410e-ac8f-974c8ec11de1` → PR #30, reached harness "Submitting" but DB hung at `Executing`.
- Run 2: task `92afa961-a19d-4ef9-bf28-39b3edb599f2` → PR #31, **clean pass to `Reviewing`** (full trace Received→Triaging→AwaitingInput→Ready→Executing→Submitting→Validating→Submitting→Reviewing).
- Both PRs authored by GitHub App bot `app/dozaldevs-ai-employee-dev`, branch `ai/<id8>-engineer` → proves installation token is valid (can't open a PR as the App without it).

### Key gotchas / findings
1. **`xiaomi/mimo-v2.5-pro` works fine for the engineer** — no model override to deepseek needed. AGENTS.md confirms it reliably calls bash tools in engineer context. It called get-token.ts, git, gh all correctly. (The "override to deepseek" advice is only for models that fail bash — mimo-v2.5-pro is NOT one of them.)
2. **DB-status-stuck-at-Executing is usually INFRA, not the employee.** Run 1's harness logged "OpenCode harness complete" + created PR #30, but `PATCH tasks`/`POST deliverables` got **HTTP 503** from local PostgREST (`ai-employee-rest` at host.docker.internal:54331) during the 17:14-17:15 writeback window. The work succeeded; only the status writeback failed. PostgREST recovered on its own (container up 12d, RestartCount=0). ALWAYS grep the harness log for `HTTP 503`/`postgrest-client.*failed` before blaming the employee when status is stuck but a PR exists.
3. **Worker writeback path (local docker mode)**: harness uses `${SUPABASE_URL}/rest/v1`, and machine-provisioner.ts rewrites `localhost`→`host.docker.internal`. So worker hits `host.docker.internal:54331/rest/v1`, NOT the cloudflare tunnel (tunnel is fly-mode only). A 503 here = local PostgREST flake.
4. **engineer `notification_channel` is null** → no Slack approval card → `pending_approvals` empty even in `Reviewing`. Same as google-workspace-assistant (T13). Not a blocker for PR verification; drive approval via manual `employee/approval.received` Inngest event if needed.
5. **Dual-supervisor footgun (confirmed again)**: two `tsx watch` gateway supervisors existed (PID 12998 stale w/ no children; PID 62386→38418 owns port 7700). `lsof -i :7700` + `ps -o ppid=` traces the real one. Stale one serves nothing — left alone (don't kill).
6. **Trigger key `inputs.prompt`** confirmed working for engineer (200 + assignment injected). Matches T12/T13.

### Evidence
`.sisyphus/evidence/task-14-engineer-e2e/` — SUMMARY.md, task-id.txt (+run2), trigger-response*.json, status-log-trace.txt (run2 full trace), pr-url.txt (both PRs), token-log.txt (git command sequence both runs).
