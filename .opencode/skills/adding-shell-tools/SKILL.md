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

## Step-by-Step Checklist

### Step 1 — Create the script file

Place at `src/worker-tools/{service}/{verb}-{noun}.ts`.

- Service name = directory (e.g. `slack`, `hostfully`, `locks`)
- Filename = verb-noun describing one action (e.g. `get-property.ts`, `send-message.ts`)
- One file = one primary action. Multi-action tools (`--action` dispatch) are the exception, only when actions share significant auth/setup
- No subdirectories inside `src/worker-tools/{service}/`

### Step 2 — Implement the standard script pattern

```typescript
function parseArgs(argv: string[]): { requiredArg: string; help: boolean } {
  const args = argv.slice(2);
  let requiredArg = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--required-arg' && args[i + 1]) {
      requiredArg = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { requiredArg, help };
}

async function main(): Promise<void> {
  const { requiredArg, help } = parseArgs(process.argv);

  // 1. --help exits 0 with usage to stdout
  if (help) {
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

  // 3. Validate required args — stderr + exit 1
  if (!requiredArg) {
    process.stderr.write('Error: --required-arg is required\n');
    process.exit(1);
  }

  // 4. Validate required env vars — stderr + exit 1
  const apiKey = process.env['SERVICE_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: SERVICE_API_KEY environment variable is required\n');
    process.exit(1);
  }

  // 5. Do the work, write JSON result to stdout
  const result = { success: true, data: 'value' };
  process.stdout.write(JSON.stringify(result) + '\n');
}

// 6. Top-level error handler — always exit non-zero on unhandled errors
main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
```

**Key rules:**

- `parseArgs` is always a plain `for` loop over `argv.slice(2)` — no yargs, commander, minimist
- `--help` writes to stdout and exits 0
- Validation failures write to stderr and exit 1
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

**Credentials (secrets)**: Store in `tenant_secrets` table with a lowercase key (e.g. `my_api_key`). `tenant-env-loader.ts` auto-uppercases and injects all secrets → `MY_API_KEY` in machine env. Access via `process.env['MY_API_KEY']`. No code changes needed.

**Non-secret config vars** (e.g. `SERVICE_MOCK`, `SERVICE_API_URL`): Must be explicitly added to the env whitelist in `src/gateway/services/tenant-env-loader.ts`.

**Provisioning a new secret for a tenant:**

```bash
curl -X PUT "http://localhost:7700/admin/tenants/{tenantId}/secrets/{key}" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<secret-value>"}'
```

Never read credentials from `.env` — the tool runs inside Docker where `.env` is not mounted.

### Step 5 — Docker (no Dockerfile changes needed)

All tools are bulk-copied into the image via `COPY src/worker-tools/ /tools/` in the Dockerfile. No Dockerfile edits needed when adding a new tool or service directory.

- **Local Docker mode** (`WORKER_RUNTIME=docker`): bind-mounted → new/modified files available immediately, no rebuild
- **Fly.io**: rebuild and push required for all `src/worker-tools/` changes (`docker build` + `pnpm fly:image`)
- New npm dependencies → add to `src/worker-tools/package.json` → included on next Docker build

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

1. **`--help`**: `tsx src/worker-tools/{service}/{verb}-{noun}.ts --help` → prints usage, exits 0
2. **Mock mode**: `SERVICE_MOCK=true tsx src/worker-tools/{service}/{verb}-{noun}.ts --required-arg val` → prints fixture JSON, exits 0
3. **Missing arg**: `tsx src/worker-tools/{service}/{verb}-{noun}.ts` → prints error to stderr, exits 1
4. **Missing env**: Run without the required env var → prints error to stderr, exits 1
5. **Docker** (Fly.io only): `docker build -t ai-employee-worker:latest .` → must succeed
6. **E2E**: `pnpm trigger-task` (or simulate the relevant webhook) → agent calls tool, expected output produced

---

## Reference Implementations

| Tool                                         | Pattern                    | Notes                                                             |
| -------------------------------------------- | -------------------------- | ----------------------------------------------------------------- |
| `src/worker-tools/hostfully/get-property.ts` | Simple single-action       | Canonical: parseArgs, env validation, parallel fetch, JSON output |
| `src/worker-tools/slack/post-message.ts`     | Complex with optional args | Shows optional args, conditional block generation, npm import     |
| `src/worker-tools/locks/sifely-client.ts`    | Multi-action (`--action`)  | Use only when actions share significant auth/setup                |

---

## Common Mistakes — MUST NOT DO

| Don't                                                                     | Do Instead                                                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import from `src/lib/` (e.g. `import { logger } from '../../lib/logger'`) | Use `process.stderr.write()` directly — tools run standalone in Docker                                                                                      |
| Use a CLI framework (yargs, commander, minimist)                          | Write a plain `parseArgs()` with a `for` loop over `argv.slice(2)`                                                                                          |
| Print human-readable text to stdout                                       | Print JSON to stdout — the agent parses stdout as structured data                                                                                           |
| Skip `--help`                                                             | Always implement `--help` — it's the first test and documents the interface                                                                                 |
| Skip mock fixture support                                                 | Always add `{SERVICE}_MOCK=true` mode — enables local testing without credentials                                                                           |
| Hardcode credentials or channel IDs                                       | Read credentials from env vars injected by `tenant-env-loader.ts`                                                                                           |
| Check mock mode after arg/env validation                                  | Check mock mode **first**, before any validation — mock bypasses all checks                                                                                 |
| Forget to whitelist non-secret env vars                                   | Add mock flags and config vars to `src/gateway/services/tenant-env-loader.ts`                                                                               |
| Skip AGENTS.md update                                                     | New **service directories** must be added to the shell tools table in AGENTS.md. Individual tools within an existing service do not need AGENTS.md entries. |
| Skip archetype instructions update                                        | Agents only use tools they know about — add usage to `prisma/seed.ts` instructions                                                                          |
