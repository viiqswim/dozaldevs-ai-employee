# Decisions — engineer-employee-fix-and-test

## 2026-06-03 Init: User Decisions

- Keep `xiaomi/mimo-v2.5-pro` on BOTH archetypes (user chose to test it)
- Fix BOTH archetypes (DozalDevs + VLRE)
- Test task: "Add a one-line comment to the top of README.md that says: # This project is a test target for the AI Employee platform."
- If Mimo fails (0 tokens / no tool calls): document failure, do NOT override model without asking user
- NO modifications to `extractTriggerPrompt` or `injectAssignmentSection` — only fix the caller (harness)
- NO changes to trigger route Zod schema
- NO changes to lifecycle INPUT\_\* env var injection
