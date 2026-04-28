import { describe, it, expect } from 'vitest';
import { parseClassifyResponse } from '../../src/lib/classify-message.js';
import { CLASSIFICATION_TEST_SET } from '../fixtures/classification-test-set.js';

describe('parseClassifyResponse', () => {
  // ─── 1. Valid NEEDS_APPROVAL JSON — all fields populated ─────────────────

  it('parses valid NEEDS_APPROVAL JSON', () => {
    const input = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.85,
      reasoning: 'Guest asking about WiFi',
      draftResponse: 'WiFi is GuestNetwork, password abc123.',
      summary: 'WiFi request',
      category: 'wifi',
      conversationSummary: null,
      urgency: false,
    });
    const result = parseClassifyResponse(input);
    expect(result.classification).toBe('NEEDS_APPROVAL');
    expect(result.confidence).toBe(0.85);
    expect(result.draftResponse).toBe('WiFi is GuestNetwork, password abc123.');
    expect(result.category).toBe('wifi');
    expect(result.reasoning).toBe('Guest asking about WiFi');
    expect(result.summary).toBe('WiFi request');
    expect(result.conversationSummary).toBeNull();
    expect(result.urgency).toBe(false);
  });

  // ─── 2. Valid NO_ACTION_NEEDED JSON — draftResponse forced to null, category forced to 'acknowledgment' ─

  it('normalizes NO_ACTION_NEEDED: forces draftResponse to null and category to acknowledgment', () => {
    const input = JSON.stringify({
      classification: 'NO_ACTION_NEEDED',
      confidence: 0.95,
      reasoning: 'Guest said thanks',
      draftResponse: "You're welcome!",
      summary: 'Acknowledgment',
      category: 'thanks',
      conversationSummary: null,
      urgency: false,
    });
    const result = parseClassifyResponse(input);
    expect(result.classification).toBe('NO_ACTION_NEEDED');
    expect(result.draftResponse).toBeNull();
    expect(result.category).toBe('acknowledgment');
    expect(result.confidence).toBe(0.95);
  });

  // ─── 3. Non-JSON early-exit string (EC4) ─────────────────────────────────

  it('handles non-JSON early-exit string starting with NO_ACTION_NEEDED:', () => {
    const result = parseClassifyResponse('NO_ACTION_NEEDED: No unresponded guest messages found.');
    expect(result.classification).toBe('NO_ACTION_NEEDED');
    expect(result.confidence).toBe(1.0);
    expect(result.draftResponse).toBeNull();
    expect(result.category).toBe('acknowledgment');
  });

  it('handles non-JSON early-exit string with whitespace prefix', () => {
    const result = parseClassifyResponse('  NO_ACTION_NEEDED: All messages already answered.');
    expect(result.classification).toBe('NO_ACTION_NEEDED');
    expect(result.confidence).toBe(1.0);
    expect(result.draftResponse).toBeNull();
    expect(result.urgency).toBe(false);
    expect(result.conversationSummary).toBeNull();
    expect(result.reasoning).toBe('Early exit — no messages to process');
  });

  // ─── 4. Markdown code fence wrapping (EC1) ───────────────────────────────

  it('strips markdown code fences before parsing', () => {
    const json = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.9,
      reasoning: 'test',
      draftResponse: 'Hello',
      summary: 'test',
      category: 'wifi',
      conversationSummary: null,
      urgency: false,
    });
    const result = parseClassifyResponse('```json\n' + json + '\n```');
    expect(result.classification).toBe('NEEDS_APPROVAL');
    expect(result.confidence).toBe(0.9);
  });

  it('strips plain code fences (no language specifier) before parsing', () => {
    const json = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.75,
      reasoning: 'Maintenance issue',
      draftResponse: 'We will send someone right away.',
      summary: 'AC broken',
      category: 'maintenance',
      conversationSummary: null,
      urgency: true,
    });
    const result = parseClassifyResponse('```\n' + json + '\n```');
    expect(result.classification).toBe('NEEDS_APPROVAL');
    expect(result.urgency).toBe(true);
  });

  // ─── 5. Malformed JSON — parse failure defaults to NEEDS_APPROVAL with confidence 0.3 ─

  it('returns NEEDS_APPROVAL fallback on parse failure', () => {
    const result = parseClassifyResponse('This is not JSON at all');
    expect(result.classification).toBe('NEEDS_APPROVAL');
    expect(result.confidence).toBe(0.3);
    expect(result.draftResponse).not.toBeNull();
  });

  it('returns confidence 0.3 (not 0.5) on parse failure', () => {
    const result = parseClassifyResponse('{ broken json >>>');
    expect(result.confidence).toBe(0.3);
  });

  // ─── 6. Missing classification field — defaults to NEEDS_APPROVAL ─────────

  it('defaults to NEEDS_APPROVAL when classification field is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({ confidence: 0.7, reasoning: 'test', summary: 'test', category: 'wifi' }),
    );
    expect(result.classification).toBe('NEEDS_APPROVAL');
  });

  // ─── 7. Unrecognized classification value — defaults to NEEDS_APPROVAL ────

  it('defaults to NEEDS_APPROVAL for unrecognized classification value', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'BANANA',
        confidence: 0.7,
        reasoning: 'test',
        summary: 'test',
        category: 'wifi',
      }),
    );
    expect(result.classification).toBe('NEEDS_APPROVAL');
  });

  // ─── 8. Confidence clamping — values >1.0 clamped to 1.0 ────────────────

  it('clamps confidence above 1.0 to 1.0', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        confidence: 1.5,
        reasoning: 'test',
        summary: 'test',
        category: 'wifi',
      }),
    );
    expect(result.confidence).toBe(1.0);
  });

  // ─── 9. Confidence clamping — values <0.0 clamped to 0.0 ────────────────

  it('clamps confidence below 0.0 to 0.0', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        confidence: -0.5,
        reasoning: 'test',
        summary: 'test',
        category: 'wifi',
      }),
    );
    expect(result.confidence).toBe(0.0);
  });

  // ─── 10. Missing optional fields — defaults applied ───────────────────────

  it('applies defaults for missing optional fields', () => {
    const result = parseClassifyResponse(JSON.stringify({ classification: 'NEEDS_APPROVAL' }));
    expect(result.conversationSummary).toBeNull();
    expect(result.urgency).toBe(false);
    expect(result.confidence).toBe(0.5);
  });

  it('applies default draftResponse when NEEDS_APPROVAL and draftResponse is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({ classification: 'NEEDS_APPROVAL', confidence: 0.7 }),
    );
    expect(result.draftResponse).not.toBeNull();
    expect(typeof result.draftResponse).toBe('string');
  });

  it('applies default reasoning when reasoning field is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({ classification: 'NEEDS_APPROVAL', confidence: 0.7 }),
    );
    expect(result.reasoning).toBe('No reasoning provided');
  });

  it('applies default summary when summary field is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({ classification: 'NEEDS_APPROVAL', confidence: 0.7 }),
    );
    expect(result.summary).toBe('Guest message requires review');
  });

  it('applies default category "other" for NEEDS_APPROVAL when category is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({ classification: 'NEEDS_APPROVAL', confidence: 0.7 }),
    );
    expect(result.category).toBe('other');
  });

  // ─── 11. Urgency field ────────────────────────────────────────────────────

  it('preserves urgency: true', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        urgency: true,
        confidence: 0.9,
        reasoning: 'test',
        summary: 'test',
        category: 'maintenance',
      }),
    );
    expect(result.urgency).toBe(true);
  });

  it('defaults urgency to false for non-boolean string value', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        urgency: 'yes',
        confidence: 0.9,
        reasoning: 'test',
        summary: 'test',
        category: 'maintenance',
      }),
    );
    expect(result.urgency).toBe(false);
  });

  it('defaults urgency to false when urgency field is missing', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        confidence: 0.8,
        reasoning: 'test',
        summary: 'test',
        category: 'wifi',
      }),
    );
    expect(result.urgency).toBe(false);
  });

  // ─── 12. Fixture set integration — all fixtures can be parsed ─────────────

  it('can parse pre-formatted JSON for every fixture in the test set', () => {
    for (const fixture of CLASSIFICATION_TEST_SET) {
      const json = JSON.stringify({
        classification: fixture.expectedClassification,
        confidence: 0.9,
        reasoning: 'test',
        draftResponse: fixture.expectedClassification === 'NEEDS_APPROVAL' ? 'Test response' : null,
        summary: fixture.description,
        category: fixture.expectedCategory,
        conversationSummary: null,
        urgency: fixture.expectedUrgency,
      });
      const result = parseClassifyResponse(json);
      expect(result.classification).toBe(fixture.expectedClassification);
    }
  });

  it('correctly normalizes NO_ACTION_NEEDED fixtures from test set', () => {
    const noActionFixtures = CLASSIFICATION_TEST_SET.filter(
      (f) => f.expectedClassification === 'NO_ACTION_NEEDED',
    );
    expect(noActionFixtures.length).toBeGreaterThan(0);
    for (const fixture of noActionFixtures) {
      const json = JSON.stringify({
        classification: 'NO_ACTION_NEEDED',
        confidence: 0.95,
        reasoning: 'Bare acknowledgment',
        draftResponse: 'Some response that should be nulled',
        summary: fixture.description,
        category: fixture.expectedCategory,
        conversationSummary: null,
        urgency: false,
      });
      const result = parseClassifyResponse(json);
      expect(result.draftResponse).toBeNull();
      expect(result.category).toBe('acknowledgment');
    }
  });

  // ─── 13. conversationSummary — passed through when present ───────────────

  it('passes conversationSummary through when present', () => {
    const result = parseClassifyResponse(
      JSON.stringify({
        classification: 'NEEDS_APPROVAL',
        confidence: 0.8,
        reasoning: 'test',
        summary: 'test',
        category: 'wifi',
        conversationSummary: 'Guest has been asking about WiFi issues for 3 days.',
      }),
    );
    expect(result.conversationSummary).toBe('Guest has been asking about WiFi issues for 3 days.');
  });

  // ─── 14. Embedded JSON extraction (EC2) ──────────────────────────────────

  it('extracts JSON object embedded in surrounding text', () => {
    const json = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.8,
      reasoning: 'door code request',
      draftResponse: 'The door code is 4829.',
      summary: 'Access question',
      category: 'access',
      conversationSummary: null,
      urgency: false,
    });
    const result = parseClassifyResponse('Here is my analysis:\n' + json + '\nEnd of analysis.');
    expect(result.classification).toBe('NEEDS_APPROVAL');
    expect(result.category).toBe('access');
  });

  // ─── 15. Guest context fields — all 9 present ────────────────────────────

  it('extracts all 9 guest context fields when present in JSON', () => {
    const input = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.9,
      reasoning: 'Guest asking about early check-in',
      draftResponse: 'We can accommodate early check-in at 1pm.',
      summary: 'Early check-in request',
      category: 'check-in',
      conversationSummary: 'Guest has been asking about arrival time.',
      urgency: false,
      guestName: 'Maria Garcia',
      propertyName: 'Beachfront Villa',
      checkIn: '2026-05-10',
      checkOut: '2026-05-17',
      bookingChannel: 'AIRBNB',
      originalMessage: 'Hi, can I check in early around noon?',
      leadUid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
      threadUid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
      messageUid: 'aabbccdd-1234-5678-abcd-ef0123456789',
    });
    const result = parseClassifyResponse(input);
    expect(result.guestName).toBe('Maria Garcia');
    expect(result.propertyName).toBe('Beachfront Villa');
    expect(result.checkIn).toBe('2026-05-10');
    expect(result.checkOut).toBe('2026-05-17');
    expect(result.bookingChannel).toBe('AIRBNB');
    expect(result.originalMessage).toBe('Hi, can I check in early around noon?');
    expect(result.leadUid).toBe('37f5f58f-d308-42bf-8ed3-f0c2d70f16fb');
    expect(result.threadUid).toBe('2f18249a-9523-4acd-a512-20ff06d5c3fa');
    expect(result.messageUid).toBe('aabbccdd-1234-5678-abcd-ef0123456789');
  });

  // ─── 16. Guest context fields — absent → undefined (backward compat) ─────

  it('returns undefined for all guest context fields when absent from JSON', () => {
    const input = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.8,
      reasoning: 'WiFi question',
      draftResponse: 'WiFi password is abc123.',
      summary: 'WiFi request',
      category: 'wifi',
      conversationSummary: null,
      urgency: false,
    });
    const result = parseClassifyResponse(input);
    expect(result.guestName).toBeUndefined();
    expect(result.propertyName).toBeUndefined();
    expect(result.checkIn).toBeUndefined();
    expect(result.checkOut).toBeUndefined();
    expect(result.bookingChannel).toBeUndefined();
    expect(result.originalMessage).toBeUndefined();
    expect(result.leadUid).toBeUndefined();
    expect(result.threadUid).toBeUndefined();
    expect(result.messageUid).toBeUndefined();
  });
});
