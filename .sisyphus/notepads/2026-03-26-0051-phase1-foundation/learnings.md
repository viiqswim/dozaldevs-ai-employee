# Learnings — Phase 1 Foundation

## Key Technical Facts
- Prisma version pinned to ^6.0.0 (NOT 7.x — seed config is in package.json, not prisma.config.ts)
- Local Supabase DB: postgresql://postgres:postgres@localhost:54322/postgres (port 54322, NOT 5432)
- Dashboard: http://localhost:54323
- REST API: http://localhost:54321
- Default tenant_id: 00000000-0000-0000-0000-000000000001
- ESM project: "type": "module" + NodeNext module resolution
- tsx (NOT ts-node) for TypeScript execution (seed, scripts)
- CHECK constraints require raw SQL migration (--create-only), NOT Prisma schema
- actor CHECK values: gateway, lifecycle_fn, watchdog, machine, manual (note: 'machine' added preemptively for Phase 6)
- All FKs referencing forward-compat tables (archetypes, departments) must be NULLABLE
- Vitest DB tests: pool='forks', singleFork=true for sequential execution

## Task 1: Package.json & Dependencies (2026-03-26)
- Created package.json with ESM type module, Node >=20.0.0
- Prisma 6.19.2 installed (^6.0.0 constraint respected)
- All dev tools installed: typescript 5.9.3, vitest 2.1.9, tsx 4.21.0, eslint 9.39.4, prettier 3.8.1
- pnpm-lock.yaml generated (75KB, 193 packages total)
- No runtime frameworks installed (Fastify, Inngest, Express, Hono) — correct for Phase 1
- No start/dev scripts — correct for Phase 1 (server comes in Phase 2)
- Prisma seed config in package.json: `"prisma": { "seed": "tsx prisma/seed.ts" }` (Prisma 6.x format)
- All QA checks passed: structure ✓, @prisma/client ✓, dev deps ✓, lockfile ✓, no forbidden deps ✓

## Task 2: Config Files Scaffolding (2026-03-26)

### ESLint 9 Flat Config
- Use `eslint.config.mjs` (not `.eslintrc.json`) for flat config format
- Import `typescript-eslint` and use `tseslint.config()` wrapper
- Use `projectService: true` instead of `parserOptions.project` (modern approach)
- `globals` npm package provides `globals.node` for Node.js environments
- `eslint-config-prettier` MUST be last in config array to disable conflicting rules
- Ignores array in first config object handles all ignore patterns

### TypeScript Config
- `noEmit: true` added to prevent output directory creation during type checking
- Include paths require at least one matching file (created `src/index.ts` placeholder)
- `NodeNext` module resolution works with `"type": "module"` in package.json
- Strict mode enabled for type safety

### Prettier Config
- JSON format works fine (no need for .js)
- Config files themselves must be formatted with Prettier
- `.prettierignore` file prevents formatting of lock files and migrations

### Verification
- All QA checks pass: build, lint, format
- ESLint ignores verified to contain required patterns
- Commit successful with proper message format
