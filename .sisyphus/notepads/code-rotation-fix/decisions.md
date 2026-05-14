# Decisions — code-rotation-fix

## [2026-05-13] Tool Architecture

- New tool `rotate-property-code.ts` calls existing tools as child processes (not imports)
- Reason: shell tools are designed to be standalone CLI scripts, not libraries
- Child process pattern: execSync with timeout, capture stdout/stderr, parse JSON

## [2026-05-13] Update-in-place vs Delete+Create

- User explicitly requested update-in-place (not delete+create)
- sifely-client.ts `update-passcode --code` flag already works (commit 1857bec)
- If no matching passcode exists → create new one (first-time setup)
- vlre-hub uses delete+create, but user preference overrides

## [2026-05-13] Hostfully door_code is non-blocking

- If door_code custom field doesn't exist → log warning, continue
- If Hostfully API fails → log error, continue
- Reason: some properties may not have the custom field configured yet
