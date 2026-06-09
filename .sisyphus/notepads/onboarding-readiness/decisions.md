# Decisions — onboarding-readiness

## [2026-06-07] User Decisions

- Test split mechanism: **directory split** (`tests/unit/` vs `tests/integration/`)
- Default `pnpm test`: **unit-only (fast)** — husky pre-commit + CI default
- Archived-script test (migrate-vlre-kb): **Remove it** (not repoint)
- Wave 0 must be 100% green before any Wave 1+ work begins
