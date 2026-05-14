# Decisions — sifely-tool-restructure

## [2026-05-14] Session Init

### Fully replace monolith

- sifely-client.ts deleted after individual tools are proven in Wave 3+4
- No backward-compat wrapper

### Permanent passcodes only

- create-passcode.ts must NOT have --type flag
- ALWAYS keyboardPwdType=2, endDate=0

### sifely-client.test.ts deleted

- The test tested the monolith; monolith is gone. Individual tool CLI QA scenarios serve as verification.

### update-passcode.ts keeps --start-date/--end-date (optional)

- These are for modifying EXISTING passcodes (not for timed creation)
- Acceptable since we're editing existing passcodes, not creating timed ones

### Output contract preserved

- Every new tool produces byte-compatible JSON with the old --action equivalent
- rotate-property-code.ts parses generate-code.ts stdout — must not break

### Commit strategy (4 commits)

- Wave 1: rename rename
- Wave 2: foundation (lib, hostfully move, generate-code cleanup)
- Waves 3+4: split + delete monolith
- Wave 5: all references (Dockerfile, seed, AGENTS, tests, docs)
