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

    const leadJson = (await res.json()) as { lead?: RawLeadResponse };
    const lead = leadJson.lead ?? (leadJson as unknown as RawLeadResponse);

    const firstName = lead.guestInformation?.firstName ?? '';
    const lastName = lead.guestInformation?.lastName ?? '';
    const fullName = `${firstName} ${lastName}`.trim();

    let propertyName: string | null = null;
    if (lead.propertyUid) {
      try {
        const propUrl = `${apiBaseUrl}/properties/${encodeURIComponent(lead.propertyUid)}`;
        const propRes = await fetch(propUrl, {
          headers: {
            'X-HOSTFULLY-APIKEY': apiKey,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(2000),
        });
        if (propRes.ok) {
          const propertyJson = (await propRes.json()) as {
            property?: { name?: string };
            name?: string;
          };
          const property = propertyJson.property ?? propertyJson;
          propertyName = (property as { name?: string }).name ?? null;
        }
      } catch (_) {
        propertyName = null;
      }
    }

    return {
      guestName: fullName || null,
      propertyName,
      checkIn: formatDate(lead.checkInLocalDateTime),
      checkOut: formatDate(lead.checkOutLocalDateTime),
      bookingChannel: lead.channel ?? null,
    };
  } catch {
    return { ...NULL_ENRICHMENT };
  }
}
