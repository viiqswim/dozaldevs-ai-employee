# Learnings — sifely-tool-restructure

## [2026-05-14] Session Init

### Sifely API Conventions (CRITICAL)

- `keyboardPwdType=2` + `endDate=0` = permanent passcode (the ONLY type we create)
- `addType=1` / `changeType=1` / `deleteType=1` = universal (works for gateway + non-gateway locks)
- `date` param MUST be built fresh inside the withRetry lambda (never outside) — stale date = auth failure
- HTTP 200 on auth failure — must check `body.code` field (presence = error for list endpoints; errcode for mutations)
- Login endpoint: `https://app-smart-server.sifely.com/v3/user/login` (NOT pro-server.sifely.com)
- List success: response omits `code` field. Presence of `code` = error.
- Credentials: SIFELY_USERNAME=admin@vlrealestate.co, SIFELY_PASSWORD=08ceafbc3f201d93fa9ba5a5dac3fc58

### Directory Structure Decisions

- `locks/` → `sifely/` (matches service-based convention: slack/, hostfully/, platform/)
- Shared lib at `sifely/lib/api.ts` — justified exception to "no subdirectories" guideline
- No `lib/index.ts` barrel — each tool imports directly from `./lib/api.ts`
- Hostfully tools (hostfully-door-code.ts, update-door-code.ts) move to `hostfully/`

### Tool Conventions

- Every tool: parseArgs, --help, env validation, JSON stdout, stderr errors
- Exit 0 on success, exit 1 on error
- No timed passcodes — create-passcode.ts is permanent-only ONLY

### Test Lock (SAFETY CRITICAL)

- Lock ID: `24572672` (5306-kin-Home Front PERSONAL)
- Property UID: `c960c8d2-9a51-49d8-bb48-355a7bfbe7e2`
- ONLY use this lock for live API testing. NEVER touch other locks.

### Rotate-property-code.ts path resolution

- Uses `path.join(__dirname, name)` for sibling tool resolution — directory-agnostic
- For hostfully tools (cross-directory): needs `hostfullyToolPath()` = `path.join(__dirname, '..', 'hostfully', name)`
