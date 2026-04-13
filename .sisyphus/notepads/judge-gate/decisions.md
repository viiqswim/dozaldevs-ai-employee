# Judge Gate — Decisions

## Architecture Decisions

- Judge model: anthropic/claude-haiku-4-5 via OpenRouter
- SVR rubric: 3 binary checks (scope_match, function_names, no_hallucination)
- response_format: { type: 'json_object' } — enforces JSON output
- Temperature: 0 (deterministic)
- Gate disabled when planVerifierModel='' (empty string)
- PlanJudgeExhaustedError thrown after 2 REJECT verdicts

## Commit Strategy

- T1: feat(workers): add plan-judge OpenRouter caller with SVR rubric
- T2: feat(config): add planVerifierModel config field and PLAN_VERIFIER_MODEL env var
- T3: feat(prompt-builder): add buildCorrectionPrompt for judge retry
- T4: feat(lifecycle): wire PLAN_VERIFIER_MODEL into Fly dispatch env
- T5: feat(planning-orchestrator): inject judge gate with corrective replay (max 2 retries)
- T6: test(workers): add plan-judge and planning-orchestrator judge integration tests
