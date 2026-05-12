import { createLogger } from '../../../lib/logger.js';
import { registerDeliveryAdapter } from './index.mjs';

const log = createLogger('delivery-adapter:hostfully');

/**
 * Hostfully / guest-messaging delivery adapter.
 *
 * Pre-parses the JSON deliverable to extract Hostfully IDs programmatically,
 * avoiding LLM UUID confusion in the delivery prompt. Registered under the key
 * `'hostfully'` to match the `enrichment_adapter` column on the archetype row.
 *
 * Returns the complete deliveryPrompt string when pre-parse succeeds, or null to
 * let the harness fall back to the default `--- DELIVERABLE CONTENT ---` template.
 */
registerDeliveryAdapter('hostfully', (ctx) => {
  const { deliverableContent, metadata, taskId, deliveryInstructions } = ctx;
  try {
    const parsed = JSON.parse(deliverableContent) as Record<string, unknown>;
    const leadUid =
      typeof parsed['leadUid'] === 'string'
        ? parsed['leadUid']
        : typeof parsed['lead_uid'] === 'string'
          ? parsed['lead_uid']
          : '';
    const threadUidFromParsed =
      typeof parsed['threadUid'] === 'string'
        ? parsed['threadUid']
        : typeof parsed['thread_uid'] === 'string'
          ? parsed['thread_uid']
          : '';
    const threadUidFromMetadata =
      !threadUidFromParsed && typeof metadata['thread_uid'] === 'string'
        ? metadata['thread_uid']
        : '';
    if (threadUidFromMetadata) {
      log.info(
        { taskId, source: 'metadata-fallback' },
        '[delivery-adapter:hostfully] threadUid sourced from deliverable metadata',
      );
    }
    const threadUid = threadUidFromParsed || threadUidFromMetadata;
    const draftResponse =
      typeof parsed['draftResponse'] === 'string' ? parsed['draftResponse'] : '';
    // Safety: leadUid must be non-empty and MUST NOT be the task ID
    if (leadUid && leadUid !== taskId && draftResponse) {
      const threadIdArg = threadUid ? `--thread-id "${threadUid}"` : '';
      const sendCmd =
        `tsx /tools/hostfully/send-message.ts --lead-id "${leadUid}" ${threadIdArg} --message "${draftResponse}"`
          .replace(/  +/g, ' ')
          .trim();
      log.info(
        { taskId, leadUid, hasThreadId: !!threadUid },
        '[delivery-adapter:hostfully] guest-messaging delivery pre-parsed',
      );
      return `${deliveryInstructions}\n\nThe deliverable has been pre-parsed. Execute this exact command to deliver the response:\n\n${sendCmd}\n\nAfter delivery, write results to /tmp/summary.txt as JSON with "delivered": true and the send-message.ts output.\n\nTask ID: ${taskId}`;
    } else {
      if (leadUid === taskId) {
        log.warn(
          { taskId, leadUid },
          '[delivery-adapter:hostfully] leadUid matches taskId — execution model error, using raw fallback',
        );
      }
    }
  } catch (err) {
    log.warn(
      { taskId, err },
      '[delivery-adapter:hostfully] JSON pre-parse failed — using raw deliverable',
    );
  }
  return null;
});
