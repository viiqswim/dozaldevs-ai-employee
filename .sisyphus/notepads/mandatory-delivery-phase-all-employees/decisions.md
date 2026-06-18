# Decisions — mandatory-delivery-phase-all-employees

## [2026-06-16] User Decisions (confirmed)

- D1: Enforcement scope = enforce delivery_steps mandatory for ALL employees + retrofit 2 existing escape-hatch employees
- D2: Runtime no-op = Keep NO_ACTION_NEEDED as valid runtime finish (per-run decision, not config state)
- D3: Close null/null loophole = gate rejects empty delivery_steps INDEPENDENT of deliverable_type
- D4: deliverable_type RETAINED (deferred removal — load-bearing in model-selection, time-estimator, card UX)
- D5: Prompt boundary guidance = ONE annotated contrast + crisp boundary definition + "never deliver in execution" anti-pattern
