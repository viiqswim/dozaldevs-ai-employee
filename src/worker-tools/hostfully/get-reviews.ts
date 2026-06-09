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

import { resolveHostfullyClient } from './lib/client.js';
import { paginateCursor } from './lib/paginate.js';
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

  const { headers } = resolveHostfullyClient();

  const baseUrl = optionalEnv('HOSTFULLY_API_URL') ?? 'https://api.hostfully.com/api/v3.3';

  if (propertyId) {
    let queryBase = `${baseUrl}/reviews?propertyUid=${encodeURIComponent(propertyId)}&sort=SORT_BY_DATE&sortDirection=DESC`;
    if (since) {
      queryBase += `&updatedSince=${encodeURIComponent(since)}`;
    }

    let allReviews: RawReview[];
    try {
      allReviews = await paginateCursor<RawReview>(queryBase, headers, (json) => {
        const j = json as { reviews?: RawReview[]; _paging?: { _nextCursor?: string } };
        return { items: j.reviews ?? [], nextCursor: j._paging?._nextCursor };
      });
    } catch (err) {
      process.stderr.write(`Error: Failed to fetch reviews: ${String(err)}\n`);
      process.exit(1);
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

    let properties: Array<{ uid: string }>;
    try {
      properties = await paginateCursor<{ uid: string }>(
        `${baseUrl}/properties?agencyUid=${encodeURIComponent(agencyUid)}`,
        headers,
        (json) => {
          const j = json as {
            properties?: Array<{ uid: string }>;
            _paging?: { _nextCursor?: string };
          };
          return { items: j.properties ?? [], nextCursor: j._paging?._nextCursor };
        },
      );
    } catch (err) {
      process.stderr.write(`Error: Failed to fetch properties: ${String(err)}\n`);
      process.exit(1);
    }
    const propertyUids = properties.map((p) => p.uid);

    const allReviews: ReviewSummary[] = [];

    for (const uid of propertyUids) {
      let queryBase = `${baseUrl}/reviews?propertyUid=${encodeURIComponent(uid)}&sort=SORT_BY_DATE&sortDirection=DESC`;
      if (since) {
        queryBase += `&updatedSince=${encodeURIComponent(since)}`;
      }

      let propReviews: RawReview[];
      try {
        propReviews = await paginateCursor<RawReview>(queryBase, headers, (json) => {
          const j = json as { reviews?: RawReview[]; _paging?: { _nextCursor?: string } };
          return { items: j.reviews ?? [], nextCursor: j._paging?._nextCursor };
        });
      } catch (err) {
        process.stderr.write(
          `Warning: Failed to fetch reviews for property ${uid}: ${String(err)}\n`,
        );
        continue;
      }

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
