// register-webhook.ts — registers a NEW_INBOX_MESSAGE webhook with the Hostfully API
//
// Usage:
//   HOSTFULLY_API_KEY=... HOSTFULLY_AGENCY_UID=942d08d9-... WEBHOOK_PUBLIC_URL=https://my-gateway.com \
//     npx tsx src/worker-tools/hostfully/register-webhook.ts
//
// Lists existing webhooks first; skips registration if already registered for same event+URL.

interface WebhookRecord {
  uid: string;
  eventType: string;
  callbackUrl: string;
  webhookType?: string;
  objectUid?: string;
}

function parseArgs(argv: string[]): { help: boolean } {
  const args = argv.slice(2);
  let help = false;
  for (const arg of args) {
    if (arg === '--help') help = true;
  }
  return { help };
}

async function listWebhooks(
  baseUrl: string,
  apiKey: string,
  agencyUid: string,
): Promise<WebhookRecord[]> {
  const url = `${baseUrl}/webhooks?agencyUid=${encodeURIComponent(agencyUid)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-HOSTFULLY-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET /webhooks failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { webhooks?: WebhookRecord[] };
  return data.webhooks ?? [];
}

async function registerWebhook(
  baseUrl: string,
  apiKey: string,
  agencyUid: string,
  callbackUrl: string,
): Promise<WebhookRecord> {
  const body = {
    agencyUid,
    eventType: 'NEW_INBOX_MESSAGE',
    callbackUrl,
    webhookType: 'POST_JSON',
    objectUid: agencyUid,
  };

  const res = await fetch(`${baseUrl}/webhooks`, {
    method: 'POST',
    headers: {
      'X-HOSTFULLY-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /webhooks failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { webhook?: WebhookRecord };
  return data.webhook ?? ({} as WebhookRecord);
}

async function main(): Promise<void> {
  const { help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: HOSTFULLY_API_KEY=... HOSTFULLY_AGENCY_UID=... WEBHOOK_PUBLIC_URL=... \\\n' +
        '  npx tsx src/worker-tools/hostfully/register-webhook.ts\n\n' +
        'Registers a NEW_INBOX_MESSAGE webhook with the Hostfully API.\n' +
        'Lists existing webhooks first; skips if already registered for same event+URL.\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY      (required) Hostfully API key\n' +
        '  HOSTFULLY_AGENCY_UID   (required) Agency UID\n' +
        '  WEBHOOK_PUBLIC_URL     (required) Public base URL; /webhooks/hostfully is appended\n' +
        '  HOSTFULLY_API_URL      (optional) Base API URL (default: https://api.hostfully.com/api/v3.2)\n',
    );
    process.exit(0);
  }

  const apiKey = process.env['HOSTFULLY_API_KEY'];
  if (!apiKey) {
    process.stderr.write('Error: HOSTFULLY_API_KEY environment variable is required\n');
    process.exit(1);
  }

  const agencyUid = process.env['HOSTFULLY_AGENCY_UID'];
  if (!agencyUid) {
    process.stderr.write('Error: HOSTFULLY_AGENCY_UID environment variable is required\n');
    process.exit(1);
  }

  const webhookPublicUrl = process.env['WEBHOOK_PUBLIC_URL'];
  if (!webhookPublicUrl) {
    process.stderr.write('Error: WEBHOOK_PUBLIC_URL environment variable is required\n');
    process.exit(1);
  }

  const baseUrl = process.env['HOSTFULLY_API_URL'] ?? 'https://api.hostfully.com/api/v3.2';
  const callbackUrl = `${webhookPublicUrl}/webhooks/hostfully`;

  console.log('Registering Hostfully webhook...');
  console.log('Agency UID:', agencyUid);
  console.log('Callback URL:', callbackUrl);
  console.log('');

  let existing: WebhookRecord[] = [];
  try {
    existing = await listWebhooks(baseUrl, apiKey, agencyUid);

    const duplicate = existing.find(
      (w) => w.eventType === 'NEW_INBOX_MESSAGE' && w.callbackUrl === callbackUrl,
    );

    if (duplicate) {
      console.log('✅ Webhook already registered:', duplicate.uid);
      console.log('No action needed.');
      process.exit(0);
    }

    if (existing.length > 0) {
      console.log('Existing webhooks:');
      for (const w of existing) {
        console.log(`  - ${w.eventType} → ${w.callbackUrl}`);
      }
      console.log('');
    }
  } catch (err) {
    process.stderr.write(`⚠️  Could not list existing webhooks: ${(err as Error).message}\n`);
    console.log('Proceeding with registration...');
    console.log('');
  }

  try {
    const result = await registerWebhook(baseUrl, apiKey, agencyUid, callbackUrl);

    console.log('✅ Webhook registered successfully!');
    console.log('  UID:', result.uid);
    console.log('  Event:', result.eventType);
    console.log('  URL:', result.callbackUrl);
    console.log('');
    console.log('Add to .env:');
    console.log(`HOSTFULLY_WEBHOOK_UID="${result.uid}"`);
    console.log('');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    process.stderr.write(`❌ Registration failed: ${(err as Error).message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
