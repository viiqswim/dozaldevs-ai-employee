# Shell Tool Onboarding Checklist

> Use this checklist whenever adding a new shell tool to `src/worker-tools/`. Shell tools are TypeScript scripts executed via `tsx` inside the worker Docker container. They are the only way OpenCode agents interact with external services.

## Quick Reference

| Property          | Value                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Source path       | `src/worker-tools/{service}/{verb}-{noun}.ts`                                                         |
| Container path    | `/tools/{service}/{verb}-{noun}.ts`                                                                   |
| Execution pattern | `NODE_NO_WARNINGS=1 tsx /tools/{service}/{verb}-{noun}.ts --arg val`                                  |
| Output format     | JSON to stdout, errors/warnings to stderr, non-zero exit on failure                                   |
| Rebuild required  | Local Docker: No (bind-mounted, live immediately). Fly.io: Yes — `docker build` + image push required |

---

### 1. Create the script file

Place the file at `src/worker-tools/{service}/{verb}-{noun}.ts`.

- Use the service name as the directory (e.g., `hostfully`, `slack`, `locks`).
- Use a verb-noun filename that describes the single action (e.g., `get-property.ts`, `send-message.ts`, `list-passcodes.ts`).
- One file = one primary action. Each action gets its own file (e.g., `list-passcodes.ts`, `create-passcode.ts`). Avoid multi-action dispatch tools.
- Do not create subdirectories inside `src/worker-tools/{service}/`.

### 2. Implement the standard script pattern

Every tool must follow this structure:

```typescript
// 1. parseArgs — manual, no CLI frameworks
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

  // 2. --help exits 0 with usage text to stdout
  if (help) {
    process.stdout.write('Usage: tsx tool-name.ts --required-arg <value>\n');
    process.exit(0);
  }

  // 3. Validate required args — exit 1 with message to stderr
  if (!requiredArg) {
    process.stderr.write('Error: --required-arg is required\n');
    process.exit(1);
  }

  // 4. Validate required env vars — exit 1 with message to stderr
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

Key rules:

- `parseArgs` is always a plain `for` loop over `argv.slice(2)` — no yargs, commander, or any CLI framework.
- `--help` writes to stdout and exits 0.
- Validation failures write to stderr and exit 1.
- The final result is always `JSON.stringify(output) + '\n'` to stdout.
- Warnings (non-fatal failures) go to stderr; the tool still exits 0 if it can produce partial output.

### 3. Add mock fixture support

Every tool that calls an external API must support a mock mode for local testing without live credentials.

**Pattern:**

```typescript
async function main(): Promise<void> {
  const { requiredArg, help } = parseArgs(process.argv);

  // Mock mode — check at the top of main(), before any validation
  if (process.env['SERVICE_MOCK'] === 'true') {
    const fixturePath = new URL('./fixtures/tool-name.json', import.meta.url);
    const fixture = await import(fixturePath.pathname, { assert: { type: 'json' } });
    process.stdout.write(JSON.stringify(fixture.default) + '\n');
    process.exit(0);
  }

  // ... rest of main
}
```

**Fixture files**: Place at `src/worker-tools/{service}/fixtures/{verb}-{noun}.json`. The fixture must be valid JSON matching the exact shape the tool would return from the live API.

**Mock env var naming**: `{SERVICE}_MOCK` (uppercase service name). Examples: `HOSTFULLY_MOCK`, `SLACK_MOCK`, `SIFELY_MOCK`.

**Platform env whitelist**: Mock env vars are not secrets — they must be explicitly added to the platform env whitelist in `src/gateway/services/tenant-env-loader.ts` so they reach the worker machine. Credentials from `tenant_secrets` are auto-injected; non-secret vars are not.

### 4. Handle environment variables

**Credentials (secrets)**: Store in `tenant_secrets` table with a lowercase key (e.g., `hostfully_api_key`). The `tenant-env-loader.ts` auto-uppercases and injects all secrets into the worker machine env — no code changes needed. Access in the tool via `process.env['HOSTFULLY_API_KEY']`.

**Non-secret config vars** (e.g., `HOSTFULLY_MOCK`, `HOSTFULLY_API_URL`): Must be explicitly added to the platform env whitelist in `src/gateway/services/tenant-env-loader.ts`. They are not auto-injected.

**Never read credentials from `.env`** in tool scripts. The tool runs inside a Docker container where `.env` is not mounted. All env vars come from the machine environment injected by the lifecycle.

**Provisioning a new secret** for a tenant:

```bash
curl -X PUT "http://localhost:7700/admin/tenants/{tenantId}/secrets/{key}" \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"value":"<secret-value>"}'
```

### 5. Docker

All tools under `src/worker-tools/` are bulk-copied into the Docker image via a single `COPY` instruction in the Dockerfile:

```dockerfile
COPY src/worker-tools/ /tools/
```

This means:

- **No Dockerfile changes needed** when adding a new tool or a new service directory.
- **Local Docker mode** (`WORKER_RUNTIME=docker`): `src/worker-tools/` is bind-mounted into the container, so new or modified tool files are available immediately — no image rebuild required.
- **Fly.io production deploys**: A rebuild and image push (`docker build` + `pnpm fly:image`) is still required for all `src/worker-tools/` changes.
- New npm dependencies used by the tool must be added to `src/worker-tools/package.json` and will be included in the image on the next build.
- The tool is available in the container at `/tools/{service}/{verb}-{noun}.ts`.

### 6. Document in AGENTS.md (service directories only)

If you are adding a **new service directory** (e.g., a new `stripe/` folder that didn't exist before), add a row to the shell tools table in AGENTS.md under the "OpenCode Worker" section.

If you are adding a **new tool within an existing service** (e.g., a new `hostfully/get-reviews.ts`), no AGENTS.md change is needed — the `tool-usage-reference` skill and the tool's own `--help` output are sufficient documentation.

Keep AGENTS.md entries at the service level, not the tool level.

### 7. Reference in archetype instructions

The tool is only useful if the OpenCode agent knows it exists. Add a usage example to the archetype's `instructions` field in `prisma/seed.ts`:

```typescript
instructions: `
  ...existing instructions...

  To fetch property details:
    NODE_NO_WARNINGS=1 tsx /tools/hostfully/get-property.ts --property-id <uid>
  Output: JSON with uid, name, address, bedrooms, maxGuests, wifiNetwork, wifiPassword, houseRules, amenities.
`,
```

After editing `prisma/seed.ts`, re-seed the database:

```bash
pnpm prisma db seed
```

The seed is idempotent — it upserts archetypes by slug, so re-running is safe.

### 8. Test

Run these checks in order before considering the tool complete:

1. **`--help`**: `tsx src/worker-tools/{service}/{verb}-{noun}.ts --help` — must print usage and exit 0.
2. **Mock mode**: `{SERVICE}_MOCK=true tsx src/worker-tools/{service}/{verb}-{noun}.ts --required-arg val` — must print fixture JSON and exit 0.
3. **Missing arg**: `tsx src/worker-tools/{service}/{verb}-{noun}.ts` — must print error to stderr and exit 1.
4. **Missing env var**: Run without the required env var set — must print error to stderr and exit 1.
5. **Docker rebuild** (Fly.io only): `docker build -t ai-employee-worker:latest .` — must succeed. In local Docker mode, the bind-mount makes the tool available immediately without a rebuild.
6. **E2E trigger**: `pnpm trigger-task` (or simulate the relevant webhook) — verify the agent calls the tool and produces the expected output.

---

## Reference Implementations

| Tool                                         | Pattern                     | Notes                                                                      |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `src/worker-tools/hostfully/get-property.ts` | Simple single-action tool   | Canonical pattern: parseArgs, env validation, parallel fetch, JSON output  |
| `src/worker-tools/slack/post-message.ts`     | Complex tool with Block Kit | Shows optional args, conditional block generation, `@slack/web-api` import |
| `src/worker-tools/sifely/list-passcodes.ts`  | Single-action tool          | Shows Sifely auth pattern; each action is its own file under `sifely/`     |

---

## Anti-patterns

| Don't                                                                      | Do Instead                                                                                                 |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Import from `src/lib/` (e.g., `import { logger } from '../../lib/logger'`) | Use `process.stderr.write()` directly — tools run standalone in Docker, not as part of the gateway         |
| Use a CLI framework (yargs, commander, minimist)                           | Write a plain `parseArgs()` function with a `for` loop over `argv.slice(2)`                                |
| Print human-readable text to stdout                                        | Print JSON to stdout — the agent parses stdout as structured data                                          |
| Skip `--help`                                                              | Always implement `--help` — it is the first test and documents the tool's interface                        |
| Skip mock fixture support                                                  | Always add `{SERVICE}_MOCK=true` mode — it enables local testing without live credentials                  |
| Hardcode credentials or channel IDs                                        | Read credentials from env vars injected by `tenant-env-loader.ts`; read config from archetype instructions |
