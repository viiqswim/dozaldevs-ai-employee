export interface ClassifyResult {
  classification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED';
  confidence: number;
  reasoning: string;
  draftResponse: string | null;
  summary: string;
  category: string;
  conversationSummary: string | null;
  urgency: boolean;
}

/**
 * Pure parser for LLM classification responses.
 * No network calls, no side effects — takes raw LLM text and returns a validated ClassifyResult.
 * Handles markdown code fences, non-JSON early-exit strings, parse failures, and field normalization.
 */
export function parseClassifyResponse(responseText: string): ClassifyResult {
  if (responseText.trim().startsWith('NO_ACTION_NEEDED:')) {
    return {
      classification: 'NO_ACTION_NEEDED',
      confidence: 1.0,
      category: 'acknowledgment',
      draftResponse: null,
      summary: responseText.trim(),
      urgency: false,
      conversationSummary: null,
      reasoning: 'Early exit — no messages to process',
    };
  }

  const jsonMatch =
    responseText.match(/```(?:json)?\s*([\s\S]+?)\s*```/) ?? responseText.match(/(\{[\s\S]+\})/);
  const jsonString = jsonMatch?.[1] ?? responseText;

  let parsed: Partial<ClassifyResult>;
  try {
    parsed = JSON.parse(jsonString) as Partial<ClassifyResult>;
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
  };
}
