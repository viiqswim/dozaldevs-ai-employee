export interface ClassifyResult {
  classification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED';
  confidence: number;
  reasoning: string;
  draftResponse: string | null;
  summary: string;
  category: string;
  conversationSummary: string | null;
  urgency: boolean;
  displayContext?: Record<string, string>;
  context?: Record<string, unknown>;
}

/**
 * Pure parser for LLM classification responses.
 * No network calls, no side effects — takes raw LLM text and returns a validated ClassifyResult.
 * Handles markdown code fences, non-JSON early-exit strings, parse failures, and field normalization.
 *
 * Parse order:
 * 1. Try JSON parse → if has `classification` field (NEEDS_APPROVAL | NO_ACTION_NEEDED) → standard schema path
 * 2. Check for `NO_ACTION_NEEDED:` prefix → legacy plain text path
 * 3. Try JSON parse → legacy JSON path (existing logic with draftResponse, guestName, etc.)
 * 4. Parse failure fallback
 */
export function parseClassifyResponse(responseText: string): ClassifyResult {
  // 1. Try standard JSON schema first (has `classification` field but no legacy-specific fields)
  const jsonMatchEarly =
    responseText.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? responseText.match(/(\{[\s\S]+\})/);
  const jsonStringEarly = jsonMatchEarly?.[1] ?? responseText;

  const legacyFields = [
    'draftResponse',
    'guestName',
    'propertyName',
    'checkIn',
    'checkOut',
    'bookingChannel',
    'conversationSummary',
    'category',
    'displayContext',
  ];

  try {
    const parsedEarly = JSON.parse(jsonStringEarly) as Record<string, unknown>;
    const cls = parsedEarly['classification'];
    const hasLegacyFields = legacyFields.some((f) => f in parsedEarly);
    if ((cls === 'NEEDS_APPROVAL' || cls === 'NO_ACTION_NEEDED') && !hasLegacyFields) {
      const isNoAction = cls === 'NO_ACTION_NEEDED';
      const confidence =
        typeof parsedEarly['confidence'] === 'number'
          ? Math.min(1.0, Math.max(0.0, parsedEarly['confidence']))
          : 0.5;
      const summary =
        typeof parsedEarly['summary'] === 'string'
          ? parsedEarly['summary']
          : 'Guest message requires review';
      // StandardOutput employees populate `summary`, not the guest-era `reasoning`
      // field; fall back to `summary` so renderers don't drop the explanation.
      const reasoning =
        typeof parsedEarly['reasoning'] === 'string'
          ? parsedEarly['reasoning']
          : typeof parsedEarly['summary'] === 'string'
            ? parsedEarly['summary']
            : 'No reasoning provided';
      const draft = typeof parsedEarly['draft'] === 'string' ? parsedEarly['draft'] : undefined;
      const urgency = parsedEarly['urgency'] === true;

      return {
        classification: isNoAction ? 'NO_ACTION_NEEDED' : 'NEEDS_APPROVAL',
        confidence,
        reasoning,
        draftResponse: isNoAction
          ? null
          : (draft ?? 'Thank you for your message. Our team will be in touch shortly.'),
        summary,
        category: isNoAction ? 'acknowledgment' : 'other',
        conversationSummary: null,
        urgency,
      };
    }
  } catch {
    // Not valid JSON — fall through to legacy handling
  }

  // 2. Legacy plain text: NO_ACTION_NEEDED: prefix
  if (responseText.trim().startsWith('NO_ACTION_NEEDED:')) {
    return {
      classification: 'NO_ACTION_NEEDED',
      confidence: 1.0,
      category: 'acknowledgment',
      draftResponse: null,
      summary: responseText.trim(),
      urgency: false,
      conversationSummary: null,
      reasoning:
        responseText
          .trim()
          .replace(/^NO_ACTION_NEEDED:\s*/, '')
          .trim() || 'No messages to process',
    };
  }

  // 3. Legacy JSON path (draftResponse, guestName, etc.)
  const jsonMatch =
    responseText.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? responseText.match(/(\{[\s\S]+\})/);
  const jsonString = jsonMatch?.[1] ?? responseText;

  interface LegacyParsed {
    classification?: string;
    confidence?: number;
    reasoning?: string;
    draftResponse?: string;
    summary?: string;
    category?: string;
    conversationSummary?: string | null;
    urgency?: boolean;
    displayContext?: Record<string, string>;
    guestName?: string;
    propertyName?: string;
    checkIn?: string;
    checkOut?: string;
    bookingChannel?: string;
    originalMessage?: string;
    leadUid?: string;
    threadUid?: string;
    messageUid?: string;
  }
  let parsed: LegacyParsed;
  try {
    parsed = JSON.parse(jsonString) as LegacyParsed;
  } catch {
    return {
      classification: 'NEEDS_APPROVAL',
      confidence: 0.3,
      reasoning: 'Failed to parse LLM response — manual review required',
      draftResponse:
        'Thank you for your message! A member of our team will get back to you shortly.',
      summary: 'Classification failed — manual review needed',
      category: 'other',
      conversationSummary: null,
      urgency: false,
    };
  }

  const rawClassification = parsed.classification;
  const isNoActionNeeded = rawClassification === 'NO_ACTION_NEEDED';
  const classification = isNoActionNeeded ? 'NO_ACTION_NEEDED' : 'NEEDS_APPROVAL';

  const explicitDisplayContext =
    parsed.displayContext && typeof parsed.displayContext === 'object'
      ? parsed.displayContext
      : undefined;

  let synthesizedDisplayContext: Record<string, string> | undefined;
  if (!explicitDisplayContext) {
    const fields: Record<string, string> = {};
    if (parsed.guestName) fields['Guest'] = parsed.guestName;
    if (parsed.propertyName) fields['Property'] = parsed.propertyName;
    if (parsed.checkIn) fields['Check-in'] = parsed.checkIn;
    if (parsed.checkOut) fields['Check-out'] = parsed.checkOut;
    if (parsed.bookingChannel) fields['Channel'] = parsed.bookingChannel;
    synthesizedDisplayContext = Object.keys(fields).length > 0 ? fields : undefined;
  }

  const displayContext = explicitDisplayContext ?? synthesizedDisplayContext;

  const guestContext: Record<string, unknown> = {};
  if (parsed.guestName !== undefined) guestContext['guestName'] = parsed.guestName;
  if (parsed.propertyName !== undefined) guestContext['propertyName'] = parsed.propertyName;
  if (parsed.checkIn !== undefined) guestContext['checkIn'] = parsed.checkIn;
  if (parsed.checkOut !== undefined) guestContext['checkOut'] = parsed.checkOut;
  if (parsed.bookingChannel !== undefined) guestContext['bookingChannel'] = parsed.bookingChannel;
  if (parsed.originalMessage !== undefined)
    guestContext['originalMessage'] = parsed.originalMessage;
  if (parsed.leadUid !== undefined) guestContext['leadUid'] = parsed.leadUid;
  if (parsed.threadUid !== undefined) guestContext['threadUid'] = parsed.threadUid;
  if (parsed.messageUid !== undefined) guestContext['messageUid'] = parsed.messageUid;

  return {
    classification,
    confidence: Math.min(1.0, Math.max(0.0, parsed.confidence ?? 0.5)),
    reasoning: parsed.reasoning ?? 'No reasoning provided',
    draftResponse: isNoActionNeeded
      ? null
      : (parsed.draftResponse ?? 'Thank you for your message. Our team will be in touch shortly.'),
    summary: parsed.summary ?? 'Guest message requires review',
    category: isNoActionNeeded ? 'acknowledgment' : (parsed.category ?? 'other'),
    conversationSummary: parsed.conversationSummary ?? null,
    urgency: parsed.urgency === true,
    ...(displayContext !== undefined && { displayContext }),
    ...(Object.keys(guestContext).length > 0 && { context: guestContext }),
  };
}
