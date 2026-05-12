import { fetchLeadEnrichment } from '../hostfully-enrichment.js';
import type { NotificationEnrichment } from '../types/notification-enrichment.js';
import { registerAdapter } from './index.js';

registerAdapter('hostfully', async (rawEvent, tenantSecrets) => {
  const leadUid = rawEvent['lead_uid'];
  const apiKey = tenantSecrets['HOSTFULLY_API_KEY'];

  if (typeof leadUid !== 'string' || !leadUid || typeof apiKey !== 'string' || !apiKey) {
    return null;
  }

  const enrichment = await fetchLeadEnrichment(leadUid, apiKey);

  const threadUid = typeof rawEvent['thread_uid'] === 'string' ? rawEvent['thread_uid'] : undefined;
  const contextUrl =
    threadUid && leadUid
      ? `https://platform.hostfully.com/app/#/inbox?threadUid=${threadUid}&leadUid=${leadUid}`
      : undefined;

  const result: NotificationEnrichment = {
    displayName: enrichment.guestName ? `Guest: ${enrichment.guestName}` : undefined,
    contextUrl,
    subtitle: enrichment.propertyName ? `Property: ${enrichment.propertyName}` : undefined,
    metadata: {
      checkIn: enrichment.checkIn ?? 'TBD',
      checkOut: enrichment.checkOut ?? 'TBD',
    },
  };

  return result;
});
