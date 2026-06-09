import { describe, expect, it } from 'vitest';
import {
  parseStandardOutput,
  isApprovalRequired,
  standardOutputSchema,
} from '../../../../src/workers/lib/output-schema.mjs';

describe('parseStandardOutput', () => {
  it('valid NEEDS_APPROVAL JSON → returns StandardOutput', () => {
    const raw = JSON.stringify({
      summary: 'Guest asked about check-in time',
      classification: 'NEEDS_APPROVAL',
      draft: 'Check-in is at 3pm!',
      confidence: 0.95,
      urgency: false,
    });
    const result = parseStandardOutput(raw);
    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Guest asked about check-in time');
    expect(result!.classification).toBe('NEEDS_APPROVAL');
    expect(result!.draft).toBe('Check-in is at 3pm!');
    expect(result!.confidence).toBe(0.95);
  });

  it('valid NO_ACTION_NEEDED JSON → returns StandardOutput', () => {
    const raw = JSON.stringify({
      summary: 'Thread already resolved — no response needed',
      classification: 'NO_ACTION_NEEDED',
    });
    const result = parseStandardOutput(raw);
    expect(result).not.toBeNull();
    expect(result!.classification).toBe('NO_ACTION_NEEDED');
  });

  it('valid JSON with all optional fields → returns StandardOutput with all fields', () => {
    const raw = JSON.stringify({
      summary: 'Summary text',
      classification: 'NEEDS_APPROVAL',
      draft: 'Draft reply',
      confidence: 0.8,
      reasoning: 'Guest needs help',
      urgency: true,
      metadata: { property_id: 'abc123' },
    });
    const result = parseStandardOutput(raw);
    expect(result).not.toBeNull();
    expect(result!.reasoning).toBe('Guest needs help');
    expect(result!.urgency).toBe(true);
    expect(result!.metadata).toEqual({ property_id: 'abc123' });
  });

  it('invalid JSON string → returns null', () => {
    const result = parseStandardOutput('not valid json {{{{');
    expect(result).toBeNull();
  });

  it('empty string → returns null', () => {
    const result = parseStandardOutput('');
    expect(result).toBeNull();
  });

  it('JSON missing required summary → returns null', () => {
    const raw = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
    });
    const result = parseStandardOutput(raw);
    expect(result).toBeNull();
  });

  it('JSON missing required classification → returns null', () => {
    const raw = JSON.stringify({
      summary: 'Some summary',
    });
    const result = parseStandardOutput(raw);
    expect(result).toBeNull();
  });

  it('JSON with invalid classification value → returns null', () => {
    const raw = JSON.stringify({
      summary: 'Some summary',
      classification: 'INVALID_VALUE',
    });
    const result = parseStandardOutput(raw);
    expect(result).toBeNull();
  });

  it('plain text (non-JSON) → returns null', () => {
    const result = parseStandardOutput('NO_ACTION_NEEDED: thread resolved');
    expect(result).toBeNull();
  });
});

describe('standardOutputSchema', () => {
  it('safeParse with APPROVED classification → success: true', () => {
    const result = standardOutputSchema.safeParse({
      summary: 'test',
      classification: 'APPROVED',
    });
    expect(result.success).toBe(true);
  });

  it('safeParse with NEEDS_APPROVAL classification → success: true', () => {
    const result = standardOutputSchema.safeParse({
      summary: 'test',
      classification: 'NEEDS_APPROVAL',
    });
    expect(result.success).toBe(true);
  });

  it('safeParse with NO_ACTION_NEEDED classification → success: true', () => {
    const result = standardOutputSchema.safeParse({
      summary: 'test',
      classification: 'NO_ACTION_NEEDED',
    });
    expect(result.success).toBe(true);
  });

  it('safeParse with INVALID classification → success: false', () => {
    const result = standardOutputSchema.safeParse({
      summary: 'test',
      classification: 'INVALID',
    });
    expect(result.success).toBe(false);
  });

  it('safeParse missing summary → success: false', () => {
    const result = standardOutputSchema.safeParse({ classification: 'APPROVED' });
    expect(result.success).toBe(false);
  });

  it('safeParse with all optional fields → success: true and data has all fields', () => {
    const result = standardOutputSchema.safeParse({
      summary: 'summary text',
      classification: 'NEEDS_APPROVAL',
      draft: 'draft reply',
      confidence: 0.9,
      reasoning: 'because',
      urgency: true,
      metadata: { key: 'value' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.draft).toBe('draft reply');
      expect(result.data.confidence).toBe(0.9);
      expect(result.data.urgency).toBe(true);
    }
  });
});

describe('isApprovalRequired', () => {
  it('NEEDS_APPROVAL → returns true', () => {
    const output = {
      summary: 'Guest needs a response',
      classification: 'NEEDS_APPROVAL' as const,
    };
    expect(isApprovalRequired(output)).toBe(true);
  });

  it('NO_ACTION_NEEDED → returns false', () => {
    const output = {
      summary: 'Thread already resolved',
      classification: 'NO_ACTION_NEEDED' as const,
    };
    expect(isApprovalRequired(output)).toBe(false);
  });

  it('APPROVED → returns false', () => {
    const output = {
      summary: 'Auto-approved task',
      classification: 'APPROVED' as const,
    };
    expect(isApprovalRequired(output)).toBe(false);
  });
});
