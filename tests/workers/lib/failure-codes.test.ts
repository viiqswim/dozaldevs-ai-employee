import { describe, it, expect } from 'vitest';
import { classifyFailure, FAILURE_CODES } from '../../../src/workers/lib/failure-codes.js';

describe('classifyFailure', () => {
  it('classifies output_contract_missing', () => {
    expect(classifyFailure('Model did not produce content')).toBe('output_contract_missing');
    expect(classifyFailure('summary.txt was not written')).toBe('output_contract_missing');
  });

  it('classifies worker_terminated', () => {
    expect(classifyFailure('Worker terminated')).toBe('worker_terminated');
  });

  it('classifies session_failed', () => {
    expect(classifyFailure('Failed to start OpenCode server')).toBe('session_failed');
    expect(classifyFailure('Failed to create OpenCode session')).toBe('session_failed');
  });

  it('classifies session_timeout', () => {
    expect(classifyFailure('OpenCode session did not complete: timeout')).toBe('session_timeout');
    expect(classifyFailure('Session timed out')).toBe('session_timeout');
  });

  it('classifies delivery_failed', () => {
    expect(classifyFailure('Delivery failed after 3 attempts')).toBe('delivery_failed');
  });

  it('classifies delivery_config_missing', () => {
    expect(classifyFailure('Archetype missing delivery_instructions')).toBe(
      'delivery_config_missing',
    );
  });

  it('classifies delivery_not_confirmed', () => {
    expect(classifyFailure('Delivery not confirmed — send-message.ts may not have succeeded')).toBe(
      'delivery_not_confirmed',
    );
  });

  it('classifies approval_expired', () => {
    expect(classifyFailure('approval window expired')).toBe('approval_expired');
  });

  it('classifies cost_limit_exceeded', () => {
    expect(classifyFailure('Cost limit exceeded for department')).toBe('cost_limit_exceeded');
    expect(classifyFailure('cost limit reached')).toBe('cost_limit_exceeded');
  });

  it('classifies dispatch_limit_exceeded', () => {
    expect(classifyFailure('Max dispatch attempts reached')).toBe('dispatch_limit_exceeded');
    expect(classifyFailure('timeout budget exhausted')).toBe('dispatch_limit_exceeded');
  });

  it('classifies reviewing_stuck', () => {
    expect(classifyFailure('Task stuck in Reviewing state')).toBe('reviewing_stuck');
  });

  it('classifies validation_failed', () => {
    expect(classifyFailure('Validation failed: output schema mismatch')).toBe('validation_failed');
  });

  it('classifies invalid_approval_metadata', () => {
    expect(classifyFailure('Invalid approval metadata detected')).toBe('invalid_approval_metadata');
    expect(classifyFailure('PLACEHOLDER found in ts field')).toBe('invalid_approval_metadata');
  });

  it('returns unknown for unrecognized strings', () => {
    expect(classifyFailure('Some completely unknown error')).toBe('unknown');
    expect(classifyFailure('')).toBe('unknown');
    expect(classifyFailure('xyz')).toBe('unknown');
  });

  it('FAILURE_CODES const has all 14 codes', () => {
    expect(Object.keys(FAILURE_CODES)).toHaveLength(14);
  });
});
