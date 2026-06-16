
## Task 16 — Key Conventions split (COMPLETE)

Commit: docs(agents): keep universal conventions; convert domain rules to tripwire pointers
Diff: AGENTS.md +5/−13

### What changed
5 tripwires now replace 10 domain-specific full-body bullets:
- **Dashboard UI** → `react-dashboard` (collapsed 3 bullets: SearchableSelect, card-shells, URL-state)
- **Gateway routes** → `api-design` (was sendError/sendSuccess full body)
- **Auth/secrets** → `security` (was gateway-proxied set-password full body)
- **Shell tools** → `adding-shell-tools` (collapsed requireEnv + ToolDescriptor bullets)
- **Archetype routes/helpers** → `creating-archetypes` (collapsed enforce_tool_registry + archetype-edit-helpers + never-block)

### Kept inline (universal — DO NOT migrate in future tasks)
exactly-two-things, discover-before-build, worker-branch-naming, inngest-in-gateway,
postgrest-not-prisma, scripts-via-tsx, config-driven, multi-tenancy, employee-agnostic,
UUID_REGEX, soft-delete, end-user-language, concise-outputs, /tmp-tools-only,
platform-settings-over-env, knowledge_base snake_case, test-suites, World-A/World-B,
Documentation Freshness, Documentation Durability, Future Work (Task 19 deletes Future Work).

### QA: all scenarios PASS (evidence: .sisyphus/evidence/round2-task-16-key-conventions.txt)
Note: scenario 8 `requireTenantRole` count=1 is line 286 (Project Structure middleware annotation), NOT Key Conventions — intent satisfied.
AGENTS.md line count after: 563 (was 571).
