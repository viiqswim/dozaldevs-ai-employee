/**
 * Battle-tested resource caps for AI worker containers.
 * Ported from Nexus stack — these values prevent OOM, turbo CPU explosion,
 * and bash hangs during long-running sessions.
 *
 * Source: nexus-stack/tools/fly-worker/entrypoint.sh:463-473
 */
const RESOURCE_CAPS = {
  /** Turbo build concurrency limit (prevents CPU thrash on Fly machines) */
  TURBO_CONCURRENCY: '2',
  /** Vitest worker count limit (prevents OOM on 2-core Fly machines) */
  NEXUS_VITEST_MAX_WORKERS: '2',
  /** Bash command timeout for OpenCode sessions (20 minutes in ms). Fallback if not set by harness from platform_settings DB. */
  OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '1200000',
  /** Node.js heap size limit (prevents OOM on large projects) */
  NODE_OPTIONS: '--max-old-space-size=4096',
} as const;

export function applyResourceCaps(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(RESOURCE_CAPS)) {
    if (!env[key]) {
      env[key] = value;
    }
  }
}
