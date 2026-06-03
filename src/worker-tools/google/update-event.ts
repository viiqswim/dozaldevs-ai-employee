import { googleFetch } from './google-fetch.js';

interface ParsedArgs {
  calendarId: string;
  eventId: string;
  summary: string;
  start: string;
  end: string;
  description: string;
  location: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let calendarId = 'primary';
  let eventId = '';
  let summary = '';
  let start = '';
  let end = '';
  let description = '';
  let location = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--calendar-id' && args[i + 1]) {
      calendarId = args[++i];
    } else if (args[i] === '--event-id' && args[i + 1]) {
      eventId = args[++i];
    } else if (args[i] === '--summary' && args[i + 1]) {
      summary = args[++i];
    } else if (args[i] === '--start' && args[i + 1]) {
      start = args[++i];
    } else if (args[i] === '--end' && args[i + 1]) {
      end = args[++i];
    } else if (args[i] === '--description' && args[i + 1]) {
      description = args[++i];
    } else if (args[i] === '--location' && args[i + 1]) {
      location = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { calendarId, eventId, summary, start, end, description, location, help };
}

async function main(): Promise<void> {
  const { calendarId, eventId, summary, start, end, description, location, help } = parseArgs(
    process.argv,
  );

  if (help) {
    process.stdout.write(
      'Usage: tsx update-event.ts --event-id <id> [options]\n' +
        '\n' +
        'Required:\n' +
        '  --event-id      ID of the event to update\n' +
        '\n' +
        'Optional:\n' +
        '  --calendar-id   Calendar containing the event (default: primary)\n' +
        '  --summary       New event title\n' +
        '  --start         New start time, ISO datetime (e.g. 2026-06-03T10:00:00Z)\n' +
        '  --end           New end time, ISO datetime (e.g. 2026-06-03T11:00:00Z)\n' +
        '  --description   New event description\n' +
        '  --location      New event location\n' +
        '  --help          Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN   Required. OAuth2 access token.\n' +
        '\n' +
        'Output: JSON { id, summary, htmlLink, updated }\n',
    );
    process.exit(0);
  }

  if (!eventId) {
    process.stderr.write('Error: --event-id is required\n');
    process.exit(1);
  }

  const patchBody: Record<string, unknown> = {};

  if (summary) {
    patchBody['summary'] = summary;
  }

  if (start) {
    patchBody['start'] = { dateTime: start, timeZone: 'UTC' };
  }

  if (end) {
    patchBody['end'] = { dateTime: end, timeZone: 'UTC' };
  }

  if (description) {
    patchBody['description'] = description;
  }

  if (location) {
    patchBody['location'] = location;
  }

  const encodedCalendarId = encodeURIComponent(calendarId);
  const encodedEventId = encodeURIComponent(eventId);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events/${encodedEventId}`;

  const response = await googleFetch(url, {
    method: 'PATCH',
    body: JSON.stringify(patchBody),
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Google Calendar API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const updated = (await response.json()) as {
    id: string;
    summary: string;
    htmlLink: string;
    updated: string;
  };

  process.stdout.write(
    JSON.stringify({
      id: updated.id,
      summary: updated.summary,
      htmlLink: updated.htmlLink,
      updated: updated.updated,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
