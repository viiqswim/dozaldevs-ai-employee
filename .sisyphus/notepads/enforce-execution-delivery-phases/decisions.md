# Decisions — enforce-execution-delivery-phases

## [2026-06-16] User Decisions (from planning phase)

- D1: Enforcement = BOTH auto-fill (generator derives default) AND hard-gate at draft-save
- D2: Field model = FULL CONSOLIDATION to single canonical field (delivery_steps)
- D3: Migration rule = COALESCE(delivery_steps, delivery_instructions) — never blind overwrite
- D4: Repair = fix ONLY the known-broken employee (ab1b5ecb)
- D5: E2E proof = brand-new wizard employee + approval-required employee, both to Done
- D6: Tests = TDD (tests first — RED then GREEN)
- D7: Column drop = single-phase (this release)
- D8: Classification fix = runtime + creation time
