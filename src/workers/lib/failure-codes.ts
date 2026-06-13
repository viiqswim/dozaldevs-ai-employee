/**
 * Canonical failure codes for the AI Employee platform.
 * Used to classify failure_reason strings into structured codes for observability.
 *
 * These are stored as plain TEXT in the `executions.failure_code` column (not a Postgres ENUM).
 */
const FAILURE_CODES = {
  output_contract_missing: 'output_contract_missing',
  worker_terminated: 'worker_terminated',
  session_failed: 'session_failed',
  session_timeout: 'session_timeout',
  delivery_failed: 'delivery_failed',
  delivery_config_missing: 'delivery_config_missing',
  delivery_not_confirmed: 'delivery_not_confirmed',
  approval_expired: 'approval_expired',
  cost_limit_exceeded: 'cost_limit_exceeded',
  dispatch_limit_exceeded: 'dispatch_limit_exceeded',
  reviewing_stuck: 'reviewing_stuck',
  validation_failed: 'validation_failed',
  invalid_approval_metadata: 'invalid_approval_metadata',
  unknown: 'unknown',
} as const;

/**
 * Maps a failure_reason string to one of the 14 canonical failure codes.
 * Uses substring matching (String.prototype.includes) — no regex.
 * Returns 'unknown' if no pattern matches.
 */
export function classifyFailure(reason: string): string {
  // output_contract_missing — worker did not write the summary output contract file
  if (reason.includes('did not produce content') || reason.includes('summary.txt')) {
    return FAILURE_CODES.output_contract_missing;
  }

  // worker_terminated — SIGTERM received by harness
  if (reason.includes('Worker terminated')) {
    return FAILURE_CODES.worker_terminated;
  }

  // session_failed — OpenCode process failed to start
  if (
    reason.includes('Failed to start OpenCode') ||
    reason.includes('Failed to create OpenCode session')
  ) {
    return FAILURE_CODES.session_failed;
  }

  // session_timeout — OpenCode session ran too long or did not complete
  if (reason.includes('did not complete') || reason.includes('timed out')) {
    return FAILURE_CODES.session_timeout;
  }

  // delivery_failed — delivery retries exhausted
  if (reason.includes('Delivery failed after')) {
    return FAILURE_CODES.delivery_failed;
  }

  // delivery_config_missing — archetype has no delivery_instructions
  if (reason.includes('missing delivery_instructions')) {
    return FAILURE_CODES.delivery_config_missing;
  }

  // delivery_not_confirmed — delivery step did not confirm success
  if (reason.includes('Delivery not confirmed')) {
    return FAILURE_CODES.delivery_not_confirmed;
  }

  // approval_expired — approval window closed before PM acted
  if (reason.includes('approval') && reason.includes('expir')) {
    return FAILURE_CODES.approval_expired;
  }

  // cost_limit_exceeded — daily cost circuit breaker tripped
  if (reason.includes('cost limit') || reason.includes('Cost limit')) {
    return FAILURE_CODES.cost_limit_exceeded;
  }

  // dispatch_limit_exceeded — max dispatch attempts or timeout budget exhausted
  if (reason.includes('Max dispatch attempts') || reason.includes('timeout budget')) {
    return FAILURE_CODES.dispatch_limit_exceeded;
  }

  // reviewing_stuck — watchdog detected zombie task in Reviewing state
  if (reason.includes('stuck in Reviewing')) {
    return FAILURE_CODES.reviewing_stuck;
  }

  // validation_failed — output validation step rejected the deliverable
  if (reason.includes('Validation failed')) {
    return FAILURE_CODES.validation_failed;
  }

  // invalid_approval_metadata — approval card metadata was malformed or placeholder
  if (reason.includes('Invalid approval metadata') || reason.includes('PLACEHOLDER')) {
    return FAILURE_CODES.invalid_approval_metadata;
  }

  // unknown — no pattern matched
  return FAILURE_CODES.unknown;
}
