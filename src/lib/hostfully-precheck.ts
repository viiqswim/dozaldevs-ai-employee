type RawMessage = {
  uid: string;
  senderType?: string; // "GUEST" or "AGENCY"
  createdUtcDateTime?: string; // ISO 8601 UTC timestamp
};

export async function checkLastMessageSender(
  leadUid: string,
  apiKey: string,
  apiBaseUrl = 'https://api.hostfully.com/api/v3.2',
): Promise<{ lastSenderIsHost: boolean; error?: string }> {
  try {
    const url = `${apiBaseUrl}/messages?leadUid=${encodeURIComponent(leadUid)}&_limit=5`;
    const res = await fetch(url, {
      headers: {
        'X-HOSTFULLY-APIKEY': apiKey,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return { lastSenderIsHost: false, error: `HTTP ${res.status}` };
    }

    const json = (await res.json()) as { messages?: RawMessage[] };
    const messages = json.messages ?? [];

    if (messages.length === 0) {
      return { lastSenderIsHost: false };
    }

    // API returns newest-first; sort chronologically to find the truly last message
    const sorted = [...messages].sort((a, b) =>
      (a.createdUtcDateTime ?? '').localeCompare(b.createdUtcDateTime ?? ''),
    );

    const lastMessage = sorted[sorted.length - 1];
    const lastSenderIsHost = lastMessage?.senderType === 'AGENCY';

    return { lastSenderIsHost };
  } catch (e) {
    return { lastSenderIsHost: false, error: String(e) };
  }
}
