# Issues — sifely-tool-restructure

## [2026-05-14] Session Init — Pre-execution known issues

### sifely-client.ts bugs (already fixed in prior session)

- endDate was not set to 0 for permanent codes — FIXED
- date param was built outside withRetry lambda — FIXED
- withRetry wrapper was missing — FIXED

### diagnose-access.ts missing withRetry

- All Sifely API calls in diagnose-access.ts have NO withRetry — will be fixed in T11

### rotate-property-code.ts no retry on runTool()

- Shell calls to sifely-client.ts have no retry — will be fixed in T12

### generate-code.ts duplicate functions

- generateMemorableCode() duplicates generateMemorableCodeWithMeta() logic — will be fixed in T4
