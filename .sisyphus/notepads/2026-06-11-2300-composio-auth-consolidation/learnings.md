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
