/**
 * Long-running session configuration and type definitions.
 * Foundation module for Wave 2 orchestration overhaul.
 *
 * Provides:
 * - LongRunningConfig: all timeout and limit settings
 * - DEFAULT_LONG_RUNNING_CONFIG: production defaults
 * - WaveState: per-wave execution state
 * - PlanMeta: aggregated plan metadata
 * - readConfigFromEnv(): overlay env vars on defaults
 */

/**
 * Configuration for long-running AI agent sessions.
 * All timeout values in milliseconds.
 */
export interface LongRunningConfig {
  /** Timeout for a single orchestrate() call (4h) */
  orchestrateTimeoutMs: number;
  /** Timeout for completion polling (6h) */
  completionTimeoutMs: number;
  /** Total task timeout from start to finish (8h) */
  totalTimeoutMs: number;
  /** Timeout for initial planning phase (30min) */
  planningTimeoutMs: number;
  /** Max continuation calls per wave (5) */
  maxContinuationsPerWave: number;
  /** Max waves per task (20) */
  maxWavesPerTask: number;
  /** Minimum free disk space required (2GB) */
  minDiskSpaceBytes: number;
  /** Max characters for AGENTS.md content (8000) */
  agentsMdMaxChars: number;
  /** Heartbeat interval for DB keep-alive (60s) */
  heartbeatIntervalMs: number;
  /** Watchdog stale threshold before restart (20min) */
  watchdogStaleThresholdMs: number;
  /** Enable fallback PR creation on failure (true) */
  fallbackPrEnabled: boolean;
  /** Token cap for cost circuit breaker (4M tokens) */
  costBreakerTokenCap: number;
}

/**
 * Production defaults for long-running configuration.
 */
export const DEFAULT_LONG_RUNNING_CONFIG: LongRunningConfig = {
  orchestrateTimeoutMs: 14400000, // 4h
  completionTimeoutMs: 21600000, // 6h
  totalTimeoutMs: 28800000, // 8h
  planningTimeoutMs: 1800000, // 30min
  maxContinuationsPerWave: 5,
  maxWavesPerTask: 20,
  minDiskSpaceBytes: 2147483648, // 2GB
  agentsMdMaxChars: 8000,
  heartbeatIntervalMs: 60000, // 60s
  watchdogStaleThresholdMs: 1200000, // 20min
  fallbackPrEnabled: true,
  costBreakerTokenCap: 4000000, // 4M tokens
};

/**
 * Execution state of a single wave.
 */
export interface WaveState {
  /** Wave number (1-indexed) */
  number: number;
  /** ISO timestamp when wave started (null if not yet started) */
  startedAt: string | null;
  /** ISO timestamp when wave completed (null if not yet completed) */
  completedAt: string | null;
  /** Current status of the wave */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Error message if status is 'failed' (null otherwise) */
  error: string | null;
}

/**
 * Array of wave states for a task.
 */
export interface WaveStateArray {
  waves: WaveState[];
}

/**
 * Aggregated metadata about a plan's execution progress.
 */
export interface PlanMeta {
  /** Total number of waves planned */
  totalWaves: number;
  /** Total number of tasks across all waves */
  totalTasks: number;
  /** Number of waves completed */
  completedWaves: number;
  /** Number of tasks completed */
  completedTasks: number;
}

/**
 * Read configuration from environment variables, overlaying on defaults.
 * All env vars are optional; missing values use DEFAULT_LONG_RUNNING_CONFIG.
 *
 * @returns LongRunningConfig with env overrides applied
 */
export function readConfigFromEnv(): LongRunningConfig {
  return {
    orchestrateTimeoutMs: parseInt(process.env['ORCHESTRATE_TIMEOUT_MS'] ?? '14400000', 10),
    completionTimeoutMs: parseInt(process.env['COMPLETION_TIMEOUT_MS'] ?? '21600000', 10),
    totalTimeoutMs: parseInt(process.env['TOTAL_TIMEOUT_MS'] ?? '28800000', 10),
    planningTimeoutMs: parseInt(process.env['PLANNING_TIMEOUT_MS'] ?? '1800000', 10),
    maxContinuationsPerWave: parseInt(process.env['MAX_CONTINUATIONS_PER_WAVE'] ?? '5', 10),
    maxWavesPerTask: parseInt(process.env['MAX_WAVES_PER_TASK'] ?? '20', 10),
    minDiskSpaceBytes: parseInt(process.env['MIN_DISK_SPACE_BYTES'] ?? '2147483648', 10),
    agentsMdMaxChars: parseInt(process.env['AGENTS_MD_MAX_CHARS'] ?? '8000', 10),
    heartbeatIntervalMs: parseInt(process.env['HEARTBEAT_INTERVAL_MS'] ?? '60000', 10),
    watchdogStaleThresholdMs: parseInt(process.env['WATCHDOG_STALE_THRESHOLD_MS'] ?? '1200000', 10),
    fallbackPrEnabled: (process.env['FALLBACK_PR_ENABLED'] ?? 'true') !== 'false',
    costBreakerTokenCap: parseInt(process.env['COST_BREAKER_TOKEN_CAP'] ?? '4000000', 10),
  };
}
