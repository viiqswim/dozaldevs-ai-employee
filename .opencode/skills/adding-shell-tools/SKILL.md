---
name: adding-shell-tools
description: Use when adding a new shell tool script to src/worker-tools/. Covers file structure, CLI pattern, TypeScript conventions, mock fixture support, Docker integration, environment variable handling, and AGENTS.md documentation requirements. Full step-by-step checklist with common mistakes.
---

# Adding a Shell Tool

Shell tools are TypeScript scripts executed via `tsx` inside the worker Docker container. They are the only way OpenCode agents interact with external services (Slack, Hostfully, locks, etc.).

**Full reference guide**: `docs/guides/2026-05-04-1645-adding-a-shell-tool.md`

---

## Quick Reference

| Property          | Value                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| Source path       | `src/worker-tools/{service}/{verb}-{noun}.ts`                                                   |
| Container path    | `/tools/{service}/{verb}-{noun}.ts`                                                             |
| Execution pattern | `NODE_NO_WARNINGS=1 tsx /tools/{service}/{verb}-{noun}.ts --arg val`                            |
| Output format     | JSON to stdout · errors/warnings to stderr · non-zero exit on failure                           |
| Rebuild required  | Local Docker: **No** (bind-mounted, live immediately) · Fly.io: **Yes** (`docker build` + push) |

---

## Shared Helpers (use these — don't reinvent)

Two shared helpers live in `src/worker-tools/lib/` (container path: `/tools/lib/`):

### `requireEnv(name)` — `src/worker-tools/lib/require-env.ts`

Reads an env var and exits 1 with a clear error if it's missing or empty.

```typescript
import { requireEnv } from '../lib/require-env.js';

const apiKey = requireEnv('SERVICE_API_KEY');
// If SERVICE_API_KEY is unset: writes "Error: SERVICE_API_KEY environment variable is required\n" to stderr, exits 1
```

Use this instead of the manual `if (!process.env['X']) { process.stderr.write(...); process.exit(1); }` pattern.

### `getArg(args, flag)` — `src/worker-tools/lib/get-arg.ts`

Reads a named CLI flag from `process.argv.slice(2)`.

```typescript
import { getArg } from '../lib/get-arg.js';

const args = process.argv.slice(2);
const propertyId = getArg(args, '--property-id'); // string | undefined
```

Use this instead of the manual `for` loop pattern for simple flag parsing. For `--help` detection, still use `args.includes('--help')` directly.

---

## Step-by-Step Checklist

### Step 1 — Create the script file

Place at `src/worker-tools/{service}/{verb}-{noun}.ts`.

- Service name = directory (e.g. `slack`, `hostfully`, `locks`)
- Filename = verb-noun describing one action (e.g. `get-property.ts`, `send-message.ts`)
- One file = one primary action. Multi-action tools (`--action` dispatch) are the exception, only when actions share significant auth/setup
- No subdirectories inside `src/worker-tools/{service}/` (except `lib/` and `fixtures/`)

### Step 2 — Implement the standard script pattern

```typescript
import { node:process } from 'node:process'; // use node: prefix for built-ins
import { requireEnv } from '../lib/require-env.js';
import { getArg } from '../lib/get-arg.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // 1. --help exits 0 with usage to stdout (check FIRST)
  if (args.includes('--help')) {
    process.stdout.write('Usage: tsx tool-name.ts --required-arg <value>\n');
    process.exit(0);
  }

  // 2. Mock mode — check BEFORE any validation
  if (process.env['SERVICE_MOCK'] === 'true') {
    const fixturePath = new URL('./fixtures/verb-noun.json', import.meta.url);
    const fixture = await import(fixturePath.pathname, { assert: { type: 'json' } });
    process.stdout.write(JSON.stringify(fixture.default) + '\n');
    process.exit(0);
  }

  // 3. Parse args using shared helper
  const requiredArg = getArg(args, '--required-arg');

  // 4. Validate required args — stderr + exit 1
  if (!requiredArg) {
    process.stderr.write('Error: --required-arg is required\n');
    process.exit(1);
  }

  // 5. Validate required env vars using shared helper
  const apiKey = requireEnv('SERVICE_API_KEY');

  // 6. Do the work, write JSON result to stdout
  const result = { success: true, data: 'value' };
  process.stdout.write(JSON.stringify(result) + '\n');
}

// 7. Top-level error handler — always exit non-zero on unhandled errors
main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
```

**Key rules:**

- Use `node:` prefix for Node.js built-in imports: `import { readFileSync } from 'node:fs'`, `import { resolve } from 'node:path'`
- `--help` check comes FIRST in `main()`, before mock mode and before any validation
- Mock mode check comes SECOND, before arg/env validation
- Use `requireEnv()` for env var validation (replaces manual `if (!process.env['X'])` blocks)
- Use `getArg(args, '--flag')` for CLI flag parsing (replaces manual `for` loops)
- Final result is always `JSON.stringify(output) + '\n'` to stdout
- Warnings (non-fatal) go to stderr; tool still exits 0 if it can produce partial output

### Step 3 — Add mock fixture support

Every tool that calls an external API must support mock mode.

- Mock env var: `{SERVICE}_MOCK=true` (e.g. `HOSTFULLY_MOCK`, `SLACK_MOCK`, `SIFELY_MOCK`)
- Check mock mode at the **top of `main()`**, before any arg/env validation
- Fixture file: `src/worker-tools/{service}/fixtures/{verb}-{noun}.json`
- Fixture must be valid JSON matching the exact shape the live API returns
- **Non-secret env vars** (including mock flags) must be explicitly added to the platform env whitelist in `src/gateway/services/tenant-env-loader.ts` — they are NOT auto-injected

### Step 4 — Handle environment variables

**Credentials (secrets)**: Store in `tenant_secrets` table with a lowercase key (e.g. `my_api_key`). `tenant-env-loader.ts` auto-uppercases and injects all secrets → `MY_API_KEY` in machine env. Use `requireEnv('MY_API_KEY')` to read. No code changes needed.

**Non-secret config vars** (e.g. `SERVICE_MOCK`, `SERVICE_API_URL`): Must be explicitly added to the env whitelist in `src/gateway/services/tenant-env-loader.ts`.

**Provisioning a new secret for a tenant:**

```bash
curl -X PUT "http://localhost:7700/admin/tenants/{tenantId}/secrets/{key}" \
  -H "Authorization: Bearer $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"<secret-value>"}'
```

Never read credentials from `.env` — the tool runs inside Docker where `.env` is not mounted.

### Step 5 — Docker (no Dockerfile changes needed)

All tools are bulk-copied into the image via `COPY src/worker-tools/ /tools/` in the Dockerfile. No Dockerfile edits needed when adding a new tool or service directory.

- **Local Docker mode** (`WORKER_RUNTIME=docker`): bind-mounted → new/modified files available immediately, no rebuild
- **Fly.io**: rebuild and push required for all `src/worker-tools/` changes (`docker build` + `pnpm fly:image`)
- New npm dependencies → add to `src/worker-tools/package.json` → included on next Docker build

**Gitignore gotcha**: `src/worker-tools/*/lib/` is gitignored. New lib files under any service's `lib/` directory need `git add -f`:

```bash
git add -f src/worker-tools/my-service/lib/my-helper.ts
```

The shared helpers in `src/worker-tools/lib/` (top-level, not under a service) are already tracked.

### Step 6 — Document in AGENTS.md (service directories only)

If you are adding a **new service directory** (e.g., a new `stripe/` folder that didn't exist before), add a row to the shell tools table in AGENTS.md under the "OpenCode Worker" section.

If you are adding a **new tool within an existing service** (e.g., a new `hostfully/get-reviews.ts`), no AGENTS.md change is needed — the `tool-usage-reference` skill and the tool's own `--help` output are sufficient documentation.

Keep AGENTS.md entries at the service level, not the tool level. AGENTS.md is loaded on every LLM call — every token has a real cost.

### Step 7 — Reference in archetype instructions

Add a usage example to the archetype's `instructions` field in `prisma/seed.ts` so the OpenCode agent knows the tool exists:

```typescript
instructions: `
  ...existing instructions...

  To fetch X:
    NODE_NO_WARNINGS=1 tsx /tools/{service}/{verb}-{noun}.ts --arg <value>
  Output: JSON with field1, field2, field3.
`,
```

After editing `prisma/seed.ts`, re-seed (idempotent upsert — safe to re-run):

```bash
pnpm prisma db seed
```

### Step 8 — Test (run in this order)

1. **`--help`**: `pnpm exec tsx src/worker-tools/{service}/{verb}-{noun}.ts --help` → prints usage, exits 0
2. **Mock mode**: `SERVICE_MOCK=true pnpm exec tsx src/worker-tools/{service}/{verb}-{noun}.ts --required-arg val` → prints fixture JSON, exits 0
3. **Missing arg**: `pnpm exec tsx src/worker-tools/{service}/{verb}-{noun}.ts` → prints error to stderr, exits 1
4. **Missing env**: Run without the required env var → prints error to stderr, exits 1
5. **Docker** (Fly.io only): `docker build -t ai-employee-worker:latest .` → must succeed
6. **E2E**: `pnpm trigger-task` (or simulate the relevant webhook) → agent calls tool, expected output produced

---

## Reference Implementations

| Tool                                         | Pattern                    | Notes                                                                  |
| -------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `src/worker-tools/hostfully/get-property.ts` | Simple single-action       | Uses `requireEnv` + `getArg`; canonical parseArgs pattern              |
| `src/worker-tools/slack/post-message.ts`     | Complex with optional args | Shows optional args, conditional block generation, npm import          |
| `src/worker-tools/locks/sifely-client.ts`    | Multi-action (`--action`)  | Use only when actions share significant auth/setup                     |
| `src/worker-tools/knowledge_base/search.ts`  | requireEnv for two vars    | Shows `requireEnv` called twice for SUPABASE_URL + SUPABASE_SECRET_KEY |

---

## Common Mistakes — MUST NOT DO

| Don't                                                                     | Do Instead                                                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import from `src/lib/` (e.g. `import { logger } from '../../lib/logger'`) | Use `process.stderr.write()` directly — tools run standalone in Docker                                                                                      |
| Use a CLI framework (yargs, commander, minimist)                          | Use `getArg(args, '--flag')` from `../lib/get-arg.js` for flag parsing                                                                                      |
| Write manual `if (!process.env['X'])` env validation                      | Use `requireEnv('X')` from `../lib/require-env.js`                                                                                                          |
| Print human-readable text to stdout                                       | Print JSON to stdout — the agent parses stdout as structured data                                                                                           |
| Skip `--help`                                                             | Always implement `--help` as the FIRST check in `main()` — it's the first test and documents the interface                                                  |
| Skip mock fixture support                                                 | Always add `{SERVICE}_MOCK=true` mode — enables local testing without credentials                                                                           |
| Hardcode credentials or channel IDs                                       | Read credentials from env vars injected by `tenant-env-loader.ts`                                                                                           |
| Check mock mode after arg/env validation                                  | Check mock mode **second** (after `--help`), before any validation — mock bypasses all checks                                                               |
| Forget to whitelist non-secret env vars                                   | Add mock flags and config vars to `src/gateway/services/tenant-env-loader.ts`                                                                               |
| Use bare `import` for Node.js built-ins                                   | Use `node:` prefix: `import { readFileSync } from 'node:fs'`, `import { resolve } from 'node:path'`                                                         |
| Skip AGENTS.md update                                                     | New **service directories** must be added to the shell tools table in AGENTS.md. Individual tools within an existing service do not need AGENTS.md entries. |
| Skip archetype instructions update                                        | Agents only use tools they know about — add usage to `prisma/seed.ts` instructions                                                                          |
| Use bare `tsx` in test commands                                           | Use `pnpm exec tsx` — bare `tsx` is not on PATH in this project                                                                                             |

---

## Critical Environment Variable Rules

### Rule 1 — `requireEnv()`/`optionalEnv()` only, never raw `process.env`

All shell tools in `src/worker-tools/` MUST read environment variables via `requireEnv(name)` (throws + exits 1 if missing) or `optionalEnv(name)` (returns `string | undefined`). Never access `process.env.FOO` directly — missing vars fail silently and produce cryptic runtime errors.

```typescript
// CORRECT
const apiKey = requireEnv('SERVICE_API_KEY'); // throws if missing
const url = optionalEnv('SERVICE_API_URL'); // undefined if not set

// WRONG — never do this
const apiKey = process.env['SERVICE_API_KEY']; // silent failure risk
```

### Rule 2 — `unescapeShellArg` for all free-text CLI arguments

Import `unescapeShellArg` from `../lib/unescape-args.js` and wrap every free-text CLI argument (`--body`, `--message`, `--content`, `--description`, etc.) at parse time.

LLMs generate shell commands with literal `\n` in string arguments (e.g. `--body "Hello\nWorld"`). The shell passes `\`+`n` as two characters to `process.argv` — NOT a real newline. `unescapeShellArg` converts `\n` → newline, `\t` → tab, `\r` → carriage return. Omitting this causes literal backslash-n to reach external APIs (email, Notion, Jira, Hostfully, Slack, etc.).

```typescript
import { unescapeShellArg } from '../lib/unescape-args.js';

const body = unescapeShellArg(getArg(args, '--body') ?? '');
const message = unescapeShellArg(getArg(args, '--message') ?? '');
```

---

## ToolDescriptor Registration (MANDATORY)

Every shell tool must export a `descriptor` object and register it in the global tool registry. This is how the gateway discovers tools, generates the `tool-usage-reference` skill, and validates archetype `tool_registry` fields.

### Step 1 — Export a descriptor from your tool file

```typescript
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  service: 'my-service', // matches the directory name
  toolName: 'verb-noun', // matches the filename (without .ts)
  description: 'One-line description of what this tool does',
  requiredArgs: ['--required-arg'],
  optionalArgs: ['--optional-arg'],
  requiredEnv: ['MY_SERVICE_API_KEY'],
  optionalEnv: ['MY_SERVICE_API_URL'],
  mockEnvVar: 'MY_SERVICE_MOCK',
};
```

The `ToolDescriptor` type is defined in `src/worker-tools/lib/types.ts`.

### Step 2 — Add to `ALL_TOOL_DESCRIPTORS` in `src/lib/tool-registry.ts`

```typescript
import { descriptor as myServiceVerbNoun } from '../worker-tools/my-service/verb-noun.js';

export const ALL_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  // ... existing descriptors ...
  myServiceVerbNoun,
];
```

`ALL_TOOL_DESCRIPTORS` is a static typed array — no disk reads, no regex. `discoverTools()` in `src/gateway/services/tool-parser.ts` maps it to `ToolMetadata` and caches the result at startup. This eliminates the production bug where `src/worker-tools/` was not present in the gateway image.

### Step 3 — Regenerate the tool-usage-reference skill

After adding your descriptor, regenerate the always-on skill so agents know about your new tool:

```bash
pnpm generate-tool-usage-skill
```

Commit the updated `src/workers/skills/tool-usage-reference/SKILL.md` alongside your tool. CI has a freshness gate that fails if the committed skill is stale.
