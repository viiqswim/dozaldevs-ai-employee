export interface NotificationEnrichment {
  displayName?: string; // e.g. "Guest: Olivia" or "Schedule: Thornton 2026-05-11"
  contextUrl?: string; // e.g. Hostfully inbox link, or null
  subtitle?: string; // e.g. "Property: Casa del Sol" or "Location: Thornton"
  metadata?: Record<string, string>; // Additional key-value pairs for the Slack card
}

export type EnrichmentAdapter = (
  rawEvent: Record<string, unknown>,
  tenantSecrets: Record<string, string>,
) => Promise<NotificationEnrichment | null>;
