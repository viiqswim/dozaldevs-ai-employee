import { googleFetch } from './google-fetch.js';

interface ParsedArgs {
  calendarId: string;
  maxResults: number;
  timeMin: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let calendarId = 'primary';
  let maxResults = 10;
  let timeMin = new Date().toISOString();
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--calendar-id' && args[i + 1]) {
      calendarId = args[++i];
    } else if (args[i] === '--max-results' && args[i + 1]) {
      maxResults = parseInt(args[++i], 10);
    } else if (args[i] === '--time-min' && args[i + 1]) {
      timeMin = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { calendarId, maxResults, timeMin, help };
}

async function main(): Promise<void> {
  const { calendarId, maxResults, timeMin, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx list-events.ts [--calendar-id <id>] [--max-results <number>] [--time-min <ISO datetime>]\n' +
        '\n' +
        'Options:\n' +
        '  --calendar-id   Calendar ID to list events from (default: primary)\n' +
        '  --max-results   Maximum number of events to return (default: 10)\n' +
        '  --time-min      Lower bound (inclusive) for event start times, ISO datetime (default: now)\n' +
        '  --help          Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN   Required. OAuth2 access token.\n' +
        '\n' +
        'Output: JSON { events: [{ id, summary, start, end, location, description, attendees }] }\n',
    );
    process.exit(0);
  }

  const encodedCalendarId = encodeURIComponent(calendarId);
  const encodedTimeMin = encodeURIComponent(timeMin);

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events` +
    `?maxResults=${maxResults}&timeMin=${encodedTimeMin}&singleEvents=true&orderBy=startTime`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Google Calendar API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      description?: string;
      attendees?: Array<{ email: string }>;
    }>;
  };

  const events = (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary,
    start: e.start,
    end: e.end,
    location: e.location,
    description: e.description,
    attendees: e.attendees?.map((a) => a.email) ?? [],
  }));

  process.stdout.write(JSON.stringify({ events }) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
