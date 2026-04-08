# Task 16: Disk Space Pre-Check Helper — Learnings

## Implementation Summary

Created `src/workers/lib/disk-check.ts` with two exported functions:

### `checkDiskSpace(path: string, minBytes: number = 2GB): Promise<DiskCheckResult>`
- **Strategy**: Two-tier approach
  1. Try `fs.promises.statfs()` (Node ≥19) — calculates `bfree * bsize`
  2. Fall back to `df -k` command and parse 4th column (available KB) × 1024
- **No-throw contract**: All errors caught, returns `{ ok: false, freeBytes: 0, reason: "..." }`
- **Default threshold**: 2,147,483,648 bytes (2 GB)

### `checkDiskSpaceOrWarn(path: string, minBytes: number, logger: Logger): Promise<boolean>`
- Convenience wrapper that calls `checkDiskSpace()` and logs warning if insufficient
- Returns boolean for caller convenience

## Key Design Decisions

1. **Dynamic import of fs/promises**: Used `await import('node:fs/promises')` inside the function to allow graceful fallback if statfs is unavailable. This is necessary because statfs may not exist on all Node versions despite Node ≥20 requirement.

2. **df parsing**: Splits output by whitespace and extracts 4th column (Available KB). Multiplies by 1024 to get bytes.

3. **Error handling**: All errors caught at top level and returned as result objects. No exceptions thrown to caller.

## Test Coverage

Created 8 tests in `tests/workers/lib/disk-check.test.ts`:
1. Sufficient space via statfs (real system call)
2. Insufficient space via statfs (real system call with MAX_SAFE_INTEGER)
3. Falls back to df when statfs throws
4. Returns insufficient when df shows low space
5. Never throws on unexpected error
6. Uses default 2GB threshold
7. checkDiskSpaceOrWarn returns true and doesn't log when sufficient
8. checkDiskSpaceOrWarn returns false and logs when insufficient

## Patterns Followed

- All imports use `.js` extension (ESM)
- Follows sibling helper style from `cache-validator.ts` and `install-runner.ts`
- Uses `vi.mock('node:child_process')` for testing
- Result object pattern (no exceptions) consistent with codebase conventions
- Docstrings explain complex fallback logic and no-throw contract
