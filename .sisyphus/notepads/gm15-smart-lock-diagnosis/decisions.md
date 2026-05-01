# Decisions — gm15-smart-lock-diagnosis

## [2026-05-01] Initial Decisions

### PropertyLock Table Design

- Single flat table (not 3-table junction like vlre-hub)
- NO unique constraint on (tenant_id, property_external_id) — multi-lock per property required
- Fields: id, tenant_id, property_external_id, lock_external_id, lock_name, lock_provider (default 'sifely'), lock_role, property_type, property_name, passcode_name (optional override), lock_metadata, created_at, updated_at
- Index on (tenant_id, property_external_id) for efficient lookup

### Sifely Client Design

- Shell tool (not library) — standalone, no imports from other tools
- Read-only — no passcode mutations
- No circuit breaker, no persistent token cache
- Token cached within single invocation only

### Diagnosis Tool Design

- Self-contained — inlines Sifely auth + Hostfully door code fetch + PostgREST query
- Graceful degradation: per-lock Sifely failure is non-fatal
- Passcode name filtering for shared locks (CRITICAL for correctness)
- Output: JSON to stdout, errors to stderr

### Test Strategy

- Unit tests: mock HTTP server + execFile pattern (same as get-reservations.test.ts)
- Integration tests: real test DB (ai_employee_test) + mock APIs
- No real Sifely credentials in tests
