export interface NotificationEnrichment {
  displayName?: string; // e.g. "Recipient: Olivia" or "Schedule: Thornton 2026-05-11"
  contextUrl?: string; // e.g. a link to an external system (inbox, ticket, etc.)
  contextLabel?: string; // e.g. "🔗 View in Hostfully" — label for the contextUrl link
  subtitle?: string; // e.g. "Property: Casa del Sol" or "Location: Thornton"
  metadata?: Record<string, string>; // Additional key-value pairs for the Slack card
}

export type EnrichmentAdapter = (
  rawEvent: Record<string, unknown>,
  tenantSecrets: Record<string, string>,
) => Promise<NotificationEnrichment | null>;
