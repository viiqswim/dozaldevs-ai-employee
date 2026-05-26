-- =============================================================================
-- scripts/2026-05-25-update-archetype-delivery.sql
--
-- Purpose: Add delivery_instructions and rewrite instructions for non-seeded
--          archetypes to use the platform submit-output pattern instead of
--          posting directly to Slack. Also soft-deletes qa-time-est-test.
--
-- Date: 2026-05-25
-- Safe to re-run (idempotent)
--
-- Archetypes modified:
--   real-estate-motivation-bot-2      561439b9-7491-40de-a550-95906624fffc
--   daily-real-estate-inspiration-2   3b07ec63-207f-4f2b-a8c3-c17f08bc508f
--   schedule-generator-thornton       00000000-0000-0000-0000-000000000017
--
-- Archetype soft-deleted:
--   qa-time-est-test                  b77c5176-8a33-46f3-a3ff-f1526addd286
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. real-estate-motivation-bot-2 (561439b9-7491-40de-a550-95906624fffc)
--
--    Change: Remove direct Slack posting step. Add submit-output call.
--    Keep: quote selection, personalization, and motivational framing logic.
-- ---------------------------------------------------------------------------
UPDATE archetypes SET
  instructions = $$Select an inspirational quote relevant to real estate investment, property renovation, or short-term rental business success. Personalize the quote with context about entrepreneurship, resilience, or growth in the real estate space. Compose an encouraging message that ties the quote to the team's current efforts.

Then submit your output:
tsx /tools/platform/submit-output.ts --summary "Posted motivational message for the real estate team" --classification "NO_ACTION_NEEDED"$$,
  delivery_instructions = $$Post the motivational message to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.$$,
  updated_at = NOW()
WHERE id = '561439b9-7491-40de-a550-95906624fffc'
  AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. daily-real-estate-inspiration-2 (3b07ec63-207f-4f2b-a8c3-c17f08bc508f)
--
--    Change: Remove final "Post the complete personalized message to Slack."
--            sentence. Add submit-output call.
--    Keep: VARIETY MANDATE, ANTI-REPETITION, STRUCTURE VARIETY, and all
--          actionable insight requirements — unchanged.
-- ---------------------------------------------------------------------------
UPDATE archetypes SET
  instructions = $$Each day, select an inspirational business quote and personalize it for the real estate investment and short-term rental community. Relate the quote to themes like property renovation, entrepreneurship, resilience, or growth in real estate.

VARIETY MANDATE: You MUST rotate through diverse source categories each run. Draw from: ancient philosophy (Stoics, Confucius, Lao Tzu), sports psychology (coaches, athletes), science and innovation (scientists, inventors), arts and literature (writers, poets, artists), military strategy (generals, tacticians), humanitarian leaders (activists, social reformers), exploration and adventure (explorers, mountaineers), business mavericks (unconventional entrepreneurs), and psychology/philosophy (modern thinkers). Never repeat the same category two days in a row.

ANTI-REPETITION: You MUST prefer OBSCURE quotes that most people have never heard. Actively avoid overused famous quotes. Do NOT use quotes from: Steve Jobs, Einstein (famous ones), Winston Churchill (famous ones), Sun Tzu (overused), Lao Tzu (overused), or any quote that appears on motivational posters. Seek out lesser-known wisdom from unexpected sources. Never use the same quote twice.

STRUCTURE VARIETY: Vary the tone and structure of your message each run. Sometimes lead with the quote, sometimes build up to it. Sometimes use a short punchy message, sometimes a more reflective one. Vary the length and style so each day feels fresh.

Compose an encouraging message that ties the quote directly to the team's current efforts in the real estate space. Include at least one specific, actionable insight about how the quote applies to real estate professionals today — make it concrete and practical (e.g., a specific action they can take this week related to property management, guest experience, or portfolio growth).

Then submit your output:
tsx /tools/platform/submit-output.ts --summary "Posted daily real estate inspiration message" --classification "NO_ACTION_NEEDED"$$,
  delivery_instructions = $$Post the inspirational message to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.$$,
  updated_at = NOW()
WHERE id = '3b07ec63-207f-4f2b-a8c3-c17f08bc508f'
  AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. schedule-generator-thornton (00000000-0000-0000-0000-000000000017)
--
--    Change: instructions already use submit-output (FINAL STEP).
--            Only add delivery_instructions — do NOT rewrite instructions.
-- ---------------------------------------------------------------------------
UPDATE archetypes SET
  delivery_instructions = $$Post the generated schedule to the configured Slack notification channel as a thread reply under the task notification message. Use the NOTIFY_MSG_TS environment variable as thread_ts. Write confirmation to /tmp/summary.txt with { "delivered": true }.$$,
  updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000017'
  AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Soft-delete qa-time-est-test (b77c5176-8a33-46f3-a3ff-f1526addd286)
--
--    WHERE deleted_at IS NULL ensures idempotency — no-op if already deleted.
-- ---------------------------------------------------------------------------
UPDATE archetypes SET
  deleted_at = NOW(),
  updated_at = NOW()
WHERE id = 'b77c5176-8a33-46f3-a3ff-f1526addd286'
  AND deleted_at IS NULL;

COMMIT;

-- =============================================================================
-- Verification queries
-- =============================================================================

-- Check delivery_instructions set and soft-delete status
SELECT
  role_name,
  delivery_instructions IS NOT NULL AND delivery_instructions != '' AS has_delivery_instructions,
  deleted_at IS NOT NULL AS is_deleted
FROM archetypes
WHERE id IN (
  '561439b9-7491-40de-a550-95906624fffc',
  '3b07ec63-207f-4f2b-a8c3-c17f08bc508f',
  '00000000-0000-0000-0000-000000000017',
  'b77c5176-8a33-46f3-a3ff-f1526addd286'
);

-- Confirm qa-time-est-test is soft-deleted
SELECT id, role_name, deleted_at
FROM archetypes
WHERE id = 'b77c5176-8a33-46f3-a3ff-f1526addd286';
