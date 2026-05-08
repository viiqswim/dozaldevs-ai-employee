type RawLeadResponse = {
  uid?: string;
  propertyUid?: string;
  channel?: string | null;
  checkInLocalDateTime?: string | null;
  checkOutLocalDateTime?: string | null;
  guestInformation?: {
    firstName?: string | null;
    lastName?: string | null;
  };
};

export interface LeadEnrichment {
  guestName: string | null;
  propertyName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  bookingChannel: string | null;
}

const NULL_ENRICHMENT: LeadEnrichment = {
  guestName: null,
  propertyName: null,
  checkIn: null,
  checkOut: null,
  bookingChannel: null,
};

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

export async function fetchLeadEnrichment(
  leadUid: string,
  apiKey: string,
  apiBaseUrl = 'https://api.hostfully.com/api/v3.2',
): Promise<LeadEnrichment> {
  try {
    const url = `${apiBaseUrl}/leads/${encodeURIComponent(leadUid)}`;
    const res = await fetch(url, {
      headers: {
        'X-HOSTFULLY-APIKEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return { ...NULL_ENRICHMENT };
    }

    const lead = (await res.json()) as RawLeadResponse;

    const firstName = lead.guestInformation?.firstName ?? '';
    const lastName = lead.guestInformation?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      guestName: fullName || null,
      propertyName: null,
      checkIn: formatDate(lead.checkInLocalDateTime),
      checkOut: formatDate(lead.checkOutLocalDateTime),
      bookingChannel: lead.channel ?? null,
    };
  } catch {
    return { ...NULL_ENRICHMENT };
  }
}
