/**
 * Synthetic test fixture set for the GM-04 classification pipeline accuracy benchmark.
 * 25-30 guest messages with expected classifications.
 *
 * Classification rules (from MVP system prompt):
 * - NO_ACTION_NEEDED: pure transactional confirmations only ("Ok", "Got it", "Noted", "Entendido", "Listo")
 * - NEEDS_APPROVAL: everything else — polite replies, questions, complaints, mixed messages
 * - Polite warmth ("Thanks!", "Gracias!") = NEEDS_APPROVAL (not NO_ACTION_NEEDED)
 * - Spanish question tags (¿cierto?, ¿verdad?, ¿no?) = NEEDS_APPROVAL always
 * - Mixed messages (any actionable request + acknowledgment) = NEEDS_APPROVAL
 * - Any complaint/issue/safety concern = NEEDS_APPROVAL (zero false negatives)
 */

export interface ClassificationFixture {
  input: string;
  expectedClassification: 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED';
  expectedCategory: string;
  expectedUrgency: boolean;
  description: string;
}

export const CLASSIFICATION_TEST_SET: ClassificationFixture[] = [
  // ─── NO_ACTION_NEEDED — pure transactional confirmations (3) ───────────────

  {
    input: 'Ok',
    expectedClassification: 'NO_ACTION_NEEDED',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description: 'Single-word bare acknowledgment — no response needed',
  },
  {
    input: 'Got it',
    expectedClassification: 'NO_ACTION_NEEDED',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description: 'Two-word bare acknowledgment — no response needed',
  },
  {
    input: 'Entendido',
    expectedClassification: 'NO_ACTION_NEEDED',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description: 'Spanish bare acknowledgment — no response needed',
  },

  // ─── NEEDS_APPROVAL — WiFi (2) ─────────────────────────────────────────────

  {
    input: "What's the WiFi password?",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'wifi',
    expectedUrgency: false,
    description: 'Guest asking for WiFi credentials — requires a response',
  },
  {
    input: "The internet isn't working",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'wifi',
    expectedUrgency: false,
    description: 'WiFi connectivity issue reported — requires a response',
  },

  // ─── NEEDS_APPROVAL — Access (2) ───────────────────────────────────────────

  {
    input: "I can't get in, the door code doesn't work",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'access',
    expectedUrgency: true,
    description: 'Urgent access failure — guest locked out, requires immediate response',
  },
  {
    input: "What's the door code?",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'access',
    expectedUrgency: false,
    description: 'Guest requesting door code — requires a response',
  },

  // ─── NEEDS_APPROVAL — Early/Late Check-in (2) ──────────────────────────────

  {
    input: 'Can we check in at noon instead of 3pm?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'early-checkin',
    expectedUrgency: false,
    description: 'Early check-in request — requires host approval',
  },
  {
    input: 'Is it possible to check out at 1pm?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'late-checkout',
    expectedUrgency: false,
    description: 'Late check-out request — requires host approval',
  },

  // ─── NEEDS_APPROVAL — Parking (1) ──────────────────────────────────────────

  {
    input: 'Where do I park?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'parking',
    expectedUrgency: false,
    description: 'Parking location question — requires a response',
  },

  // ─── NEEDS_APPROVAL — Amenities (1) ────────────────────────────────────────

  {
    input: 'Does the property have a washer/dryer?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'amenities',
    expectedUrgency: false,
    description: 'Amenity availability question — requires a response',
  },

  // ─── NEEDS_APPROVAL — Maintenance (2) ──────────────────────────────────────

  {
    input: "The AC isn't working, it's very hot",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'maintenance',
    expectedUrgency: false,
    description: 'AC malfunction reported — requires a response',
  },
  {
    input: "There's a water leak in the bathroom ceiling",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'maintenance',
    expectedUrgency: true,
    description: 'Urgent water leak — potential property damage, requires immediate response',
  },

  // ─── NEEDS_APPROVAL — Complaints (3, CRITICAL — all must be NEEDS_APPROVAL) ─

  {
    input: "The place is filthy, there's dirt everywhere",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'other',
    expectedUrgency: false,
    description: 'Cleanliness complaint — requires a response, zero false negatives',
  },
  {
    input: 'I smell gas in the kitchen',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'maintenance',
    expectedUrgency: true,
    description: 'Safety emergency (gas leak) — requires immediate response',
  },
  {
    input: 'There are cockroaches in the bedroom',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'maintenance',
    expectedUrgency: true,
    description: 'Pest infestation — urgent complaint, requires immediate response',
  },

  // ─── NEEDS_APPROVAL — Polite replies (3, NOT NO_ACTION_NEEDED) ─────────────

  {
    input: 'Thanks!',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description:
      'Gratitude/warmth — per MVP rules, polite replies are NEEDS_APPROVAL not NO_ACTION_NEEDED',
  },
  {
    input: 'Gracias por la informacion!',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description: 'Spanish gratitude — polite reply, NEEDS_APPROVAL not NO_ACTION_NEEDED',
  },
  {
    input: 'Perfect, see you Friday!',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'acknowledgment',
    expectedUrgency: false,
    description: 'Warm closing with future reference — polite reply, NEEDS_APPROVAL',
  },

  // ─── NEEDS_APPROVAL — Spanish messages (2) ─────────────────────────────────

  {
    input: '¿Cuál es la contraseña del WiFi?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'wifi',
    expectedUrgency: false,
    description: 'Spanish WiFi password question — requires a response',
  },
  {
    input: 'No hay problema si llegamos a las 6, cierto?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'booking_question',
    expectedUrgency: false,
    description: 'Spanish question tag (cierto?) — asking for confirmation, NEEDS_APPROVAL',
  },

  // ─── NEEDS_APPROVAL — Mixed (question + acknowledgment) (2) ────────────────

  {
    input: "Got it, but what's the WiFi password?",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'wifi',
    expectedUrgency: false,
    description: 'Mixed: acknowledgment + actionable question — NEEDS_APPROVAL (question wins)',
  },
  {
    input: 'Thanks! Also, can we check in early?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'early-checkin',
    expectedUrgency: false,
    description: 'Mixed: gratitude + early check-in request — NEEDS_APPROVAL (request wins)',
  },

  // ─── NEEDS_APPROVAL — Pets (1) ─────────────────────────────────────────────

  {
    input: 'Can I bring my small dog?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'other',
    expectedUrgency: false,
    description: 'Pet policy question — requires host approval',
  },

  // ─── NEEDS_APPROVAL — Refund (1) ───────────────────────────────────────────

  {
    input: "I'd like a refund for the last night",
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'other',
    expectedUrgency: false,
    description: 'Refund request — requires host decision',
  },

  // ─── NEEDS_APPROVAL — Booking question (1) ─────────────────────────────────

  {
    input: 'How many guests are allowed at the property?',
    expectedClassification: 'NEEDS_APPROVAL',
    expectedCategory: 'booking_question',
    expectedUrgency: false,
    description: 'Occupancy policy question — requires a response',
  },
];

export const TEST_PROPERTY_CONTEXT = {
  guestName: 'Maria Garcia',
  propertyName: '3505 Banton Rd, Austin',
  checkInDate: '2026-05-10',
  checkOutDate: '2026-05-15',
  channel: 'Airbnb',
  knowledgeBase:
    'WiFi: GuestNetwork, password: abc123. Check-in: 4PM. Check-out: 11AM. Door code: 4829. Parking: Free on street.',
};
