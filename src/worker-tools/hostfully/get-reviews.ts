/**
 * Fetches guest reviews for a Hostfully property or all properties in an agency.
 *
 * ENDPOINT: GET /api/v3.3/reviews
 * The reviews endpoint is only available in the Hostfully v3.3 API. This script
 * defaults to https://api.hostfully.com/api/v3.3 unless HOSTFULLY_API_URL overrides.
 *
 * UPDATED SINCE SEMANTICS: The --since flag maps to the `updatedSince` query
 * parameter, which filters by the LAST UPDATE TIME of the review record, NOT by
 * the review creation date. A review updated after --since will appear even if
 * it was originally posted before --since.
 *
 * UNRESPONDED FILTER: --unresponded-only is a client-side filter. Reviews where
 * responseDateTimeUTC is null or undefined are considered unresponded.
 *
 * PORTFOLIO MODE: When --property-id is omitted, HOSTFULLY_AGENCY_UID is required.
 * All property UIDs are fetched first via GET /properties, then reviews are fetched
 * per property. Per-property errors log a warning and continue — they do NOT abort.
 */
type RawReview = {
  uid: string;
  propertyUid?: string;
  leadUid?: string;
  author?: string;
  title?: string;
  content?: string;
  rating?: number;
  date?: string;
  source?: string;
  privateFeedback?: string;
  responseDateTimeUTC?: string | null;
  updatedUtcDateTime?: string;
  reviewResponse?: object | null;
  ratingCategories?: unknown[];
};

type ReviewSummary = {
  uid: string;
  propertyUid: string | null;
  guestName: string | null;
  title: string | null;
  content: string | null;
  rating: number | null;
  date: string | null;
  source: string | null;
  hasResponse: boolean;
  responseDateTimeUTC: string | null;
};

import { getArg } from '../lib/get-arg.js';
import { requireEnv, optionalEnv } from '../lib/require-env.js';

function parseArgs(argv: string[]): {
  propertyId: string;
  since: string;
  unrespondedOnly: boolean;
  help: boolean;
} {
  const args = argv.slice(2);
  return {
    propertyId: getArg(args, '--property-id') ?? '',
    since: getArg(args, '--since') ?? '',
    unrespondedOnly: args.includes('--unresponded-only'),
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { propertyId, since, unrespondedOnly, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: node get-reviews.js [--property-id <uid>] [--since <date>] [--unresponded-only]\n' +
        'Fetches guest reviews from the Hostfully API.\n\n' +
        'Options:\n' +
        '  --property-id <uid>  Property UID to fetch reviews for.\n' +
        '                       When omitted, all properties for the agency are queried\n' +
        '                       (requires HOSTFULLY_AGENCY_UID).\n' +
        '  --since <date>       Filters by last-updated record time, NOT review creation date.\n' +
        '                       Accepts ISO 8601 date/datetime (e.g. 2024-01-01 or 2024-01-01T00:00:00Z).\n' +
        '                       Maps to the updatedSince query parameter on the Hostfully API.\n' +
        '  --unresponded-only   Return only reviews without a host response\n' +
        '                       (responseDateTimeUTC is null or missing).\n' +
        '  --help               Show this help message\n\n' +
        'Environment variables:\n' +
        '  HOSTFULLY_API_KEY      (required) Hostfully API key\n' +
        '  HOSTFULLY_AGENCY_UID   (required when --property-id is not provided) Hostfully agency UID\n' +
        '  HOSTFULLY_API_URL      (optional) Base API URL (default: https://api.hostfully.com/api/v3.3)\n',
    );
    process.exit(0);
  }

  const apiKey = requireEnv('HOSTFULLY_API_KEY');

  const baseUrl = optionalEnv('HOSTFULLY_API_URL') ?? 'https://api.hostfully.com/api/v3.3';

  const headers = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };

  if (propertyId) {
    let queryBase = `${baseUrl}/reviews?propertyUid=${encodeURIComponent(propertyId)}&sort=SORT_BY_DATE&sortDirection=DESC`;
    if (since) {
      queryBase += `&updatedSince=${encodeURIComponent(since)}`;
    }

    const seenUids = new Set<string>();
    const allReviews: RawReview[] = [];
    let cursor: string | undefined = undefined;

    for (;;) {
      const url = cursor ? `${queryBase}&_cursor=${encodeURIComponent(cursor)}` : queryBase;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        process.stderr.write(`Error: Failed to fetch reviews: ${res.status}\n`);
        process.exit(1);
      }

      const json = (await res.json()) as {
        reviews?: RawReview[];
        _paging?: { _nextCursor?: string };
      };

      const page = json.reviews ?? [];
      let hasNew = false;
      for (const review of page) {
        if (review.uid && !seenUids.has(review.uid)) {
          seenUids.add(review.uid);
          allReviews.push(review);
          hasNew = true;
        }
      }

      cursor = json._paging?._nextCursor;
      if (!hasNew || !cursor) break;
    }

    let results: ReviewSummary[] = allReviews.map((r) => ({
      uid: r.uid,
      propertyUid: r.propertyUid ?? null,
      guestName: r.author ?? null,
      title: r.title ?? null,
      content: r.content ?? null,
      rating: r.rating ?? null,
      date: r.date ?? null,
      source: r.source ?? null,
      hasResponse: r.responseDateTimeUTC != null,
      responseDateTimeUTC: r.responseDateTimeUTC ?? null,
    }));

    if (unrespondedOnly) {
      results = results.filter((r) => r.responseDateTimeUTC == null);
    }

    process.stdout.write(JSON.stringify(results) + '\n');
  } else {
    const agencyUid = requireEnv('HOSTFULLY_AGENCY_UID');

    const seenPropertyUids = new Set<string>();
    const propertyUids: string[] = [];
    let propCursor: string | undefined = undefined;

    for (;;) {
      const url = propCursor
        ? `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}&cursor=${encodeURIComponent(propCursor)}`
        : `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        process.stderr.write(`Error: Failed to fetch properties: ${res.status}\n`);
        process.exit(1);
      }

      const json = (await res.json()) as {
        properties?: Array<{ uid: string }>;
        _paging?: { _nextCursor?: string };
      };

      const page = json.properties ?? [];
      let hasNew = false;
      for (const p of page) {
        if (p.uid && !seenPropertyUids.has(p.uid)) {
          seenPropertyUids.add(p.uid);
          propertyUids.push(p.uid);
          hasNew = true;
        }
      }

      propCursor = json._paging?._nextCursor;
      if (!hasNew || !propCursor) break;
    }

    const allReviews: ReviewSummary[] = [];

    for (const uid of propertyUids) {
      let queryBase = `${baseUrl}/reviews?propertyUid=${encodeURIComponent(uid)}&sort=SORT_BY_DATE&sortDirection=DESC`;
      if (since) {
        queryBase += `&updatedSince=${encodeURIComponent(since)}`;
      }

      const seenUids = new Set<string>();
      const propReviews: RawReview[] = [];
      let cursor: string | undefined = undefined;
      let fetchError = false;

      for (;;) {
        const url = cursor ? `${queryBase}&_cursor=${encodeURIComponent(cursor)}` : queryBase;

        const res = await fetch(url, { headers });
        if (!res.ok) {
          process.stderr.write(
            `Warning: Failed to fetch reviews for property ${uid}: ${res.status}\n`,
          );
          fetchError = true;
          break;
        }

        const json = (await res.json()) as {
          reviews?: RawReview[];
          _paging?: { _nextCursor?: string };
        };

        const page = json.reviews ?? [];
        let hasNew = false;
        for (const review of page) {
          if (review.uid && !seenUids.has(review.uid)) {
            seenUids.add(review.uid);
            propReviews.push(review);
            hasNew = true;
          }
        }

        cursor = json._paging?._nextCursor;
        if (!hasNew || !cursor) break;
      }

      if (!fetchError) {
        for (const r of propReviews) {
          allReviews.push({
            uid: r.uid,
            propertyUid: r.propertyUid ?? null,
            guestName: r.author ?? null,
            title: r.title ?? null,
            content: r.content ?? null,
            rating: r.rating ?? null,
            date: r.date ?? null,
            source: r.source ?? null,
            hasResponse: r.responseDateTimeUTC != null,
            responseDateTimeUTC: r.responseDateTimeUTC ?? null,
          });
        }
      }
    }

    let results = allReviews;
    if (unrespondedOnly) {
      results = results.filter((r) => r.responseDateTimeUTC == null);
    }

    process.stdout.write(JSON.stringify(results) + '\n');
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
