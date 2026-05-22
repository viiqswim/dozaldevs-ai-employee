# Learnings — model-selection-engine

## Codebase Conventions (from schema.prisma + routes inspection)

### Prisma Schema Patterns

- UUID fields use `@default(uuid()) @db.Uuid` for primary keys
- `created_at DateTime @default(now())`, `updated_at DateTime @updatedAt`
- `deleted_at DateTime?` for soft delete (see Tenant, TenantIntegration)
- tenant isolation: `tenant_id String @db.Uuid` + `@@index([tenant_id])`
- unique multi-column: `@@unique([tenant_id, model_id])` pattern (see TenantIntegration, TenantSecret)
- Relations declared with `// Relations` comment block
- Table mapped with `@@map("snake_case_name")`
- KnowledgeBaseEntry uses `@@index([tenant_id, entity_type, entity_id])` + `@@unique` — good model for our catalog
- No `tenant_id` FK declared as a real Prisma relation for ModelCatalog (follow Project/Department pattern which does have a relation — but KnowledgeBaseEntry also has a Tenant relation)
- Archetype.model is `String?` — no constraint

### Route Files Present

- `admin-archetypes.ts` — archetype CRUD + generate endpoint
- `admin-archetype-generate.ts` — separate generate handler
- `admin-kb.ts` — knowledge base CRUD (soft delete pattern)
- NO `admin-model-catalog.ts` yet — needs creating
- Routes are NOT in an `index.ts` in routes/ — they're in `src/gateway/` (main server file)

### Key Research Findings

- `archetype-generator.ts` line ~215 has postProcess() model override → Task 10 MUST remove
- `admin-archetypes.ts` line ~78 has z.enum model restriction → Task 11 MUST expand
- `call-llm.ts` PRICING_PER_1M_TOKENS is gateway-side only — DO NOT MODIFY
- Execution cost tracking already works for any model via OpenRouter response data
- Two tenants seeded: 00000000-0000-0000-0000-000000000002 (DozalDevs), 00000000-0000-0000-0000-000000000003 (VLRE)

### Route Registration Pattern (CRITICAL)

- Routes are mounted in `src/gateway/server.ts` — NOT in a routes/index.ts
- Pattern: `import { adminXxxRoutes } from './routes/admin-xxx.js'` then `app.use(adminXxxRoutes({ prisma }))`
- Add new route at line ~188 alongside adminKbRoutes: `app.use(adminModelCatalogRoutes({ prisma }))`
- Route functions accept `{ prisma }` options bag
- Line 183: `app.use(adminArchetypesRoutes({ prisma }))` — reference pattern

## [2026-05-22] Task: T16 — Unit + API Tests
- Test files created: tiers.test.ts, profiler.test.ts, matcher.test.ts, admin-model-catalog.test.ts
- Total new tests: 103 (38 tiers + 32 profiler + 15 matcher + 18 API)
- All pass: yes
- Known gotcha: domain detection uses substring includes() — "codes" contains "code" (engineering keyword) — use isolated terms in test inputs
