# Learnings — docker-container-lifecycle-fix

## Session started: 2026-05-06T13:36:47Z

## Key Code Locations (verified)

- `runLocalDockerContainer()`: employee-lifecycle.ts:66-89
- `stopLocalDockerContainer()`: TO BE ADDED after line 89
- Cleanup steps: L439 (cleanup-on-failure), L504 (cleanup-no-approval), L553 (cleanup-no-action), L1597 (cleanup)
- Delivery retry loop: L1225-1299 — local Docker spawn at L1228, post-poll cleanup at L1284-1293
- Reply-anyway spawn: L710-730, poll: L750-768, failure path: L770+
- dev.ts cleanup(): L129-143
- Container name patterns:
  - Primary: `employee-${taskId.slice(0, 8)}`
  - Reply-anyway: `employee-reply-${taskId.slice(0, 8)}`
  - Delivery: `employee-delivery-${taskId.slice(0, 8)}`

## Reference Pattern (deprecated lifecycle.ts:470-477)

```typescript
if (machine.id.startsWith('docker_')) {
  try {
    const { execSync } = await import('child_process');
    const containerName = `ai-worker-${taskId.slice(0, 8)}`;
    execSync(`docker stop ${containerName} 2>/dev/null || true`, { encoding: 'utf8' });
  } catch {
    /* ignore */
  }
} else {
  const flyWorkerApp = process.env.FLY_WORKER_APP ?? '';
  if (flyWorkerApp) {
    await destroyMachine(flyWorkerApp, machine.id).catch(() => {});
  }
}
```

## Test Mock Pattern

- Use `vi.hoisted()` + `vi.mock('node:child_process', ...)` for execSync mocking
- Reference: tests/workers/opencode-harness-delivery.test.ts
- Reference: tests/inngest/lifecycle-notify-msg-ts.test.ts

## Constraints

- DO NOT touch deprecated lifecycle.ts
- DO NOT modify Fly.io path
- No employee-specific language in runLocalDockerContainer() or stopLocalDockerContainer()
- Keep --rm flag in docker run
- Use docker stop (graceful) before docker rm -f
