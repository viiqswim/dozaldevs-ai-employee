import { googleFetch } from './google-fetch.js';
import { unescapeShellArg } from '../lib/unescape-args.js';

interface ParsedArgs {
  calendarId: string;
  summary: string;
  start: string;
  end: string;
  description: string;
  location: string;
  attendees: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let calendarId = 'primary';
  let summary = '';
  let start = '';
  let end = '';
  let description = '';
  let location = '';
  let attendees = '';
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--calendar-id' && args[i + 1]) {
      calendarId = args[++i];
    } else if (args[i] === '--summary' && args[i + 1]) {
      summary = args[++i];
    } else if (args[i] === '--start' && args[i + 1]) {
      start = args[++i];
    } else if (args[i] === '--end' && args[i + 1]) {
      end = args[++i];
    } else if (args[i] === '--description' && args[i + 1]) {
      description = unescapeShellArg(args[++i]);
    } else if (args[i] === '--location' && args[i + 1]) {
      location = args[++i];
    } else if (args[i] === '--attendees' && args[i + 1]) {
      attendees = args[++i];
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { calendarId, summary, start, end, description, location, attendees, help };
}

async function main(): Promise<void> {
  const { calendarId, summary, start, end, description, location, attendees, help } = parseArgs(
    process.argv,
  );

  if (help) {
    process.stdout.write(
      'Usage: tsx create-event.ts --summary <title> --start <ISO datetime> --end <ISO datetime> [options]\n' +
        '\n' +
        'Required:\n' +
        '  --summary       Event title\n' +
        '  --start         Event start time, ISO datetime (e.g. 2026-06-03T10:00:00Z)\n' +
        '  --end           Event end time, ISO datetime (e.g. 2026-06-03T11:00:00Z)\n' +
        '\n' +
        'Optional:\n' +
        '  --calendar-id   Calendar to create event in (default: primary)\n' +
        '  --description   Event description\n' +
        '  --location      Event location\n' +
        '  --attendees     Comma-separated list of attendee emails\n' +
        '  --help          Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN   Required. OAuth2 access token.\n' +
        '\n' +
        'Output: JSON { id, summary, htmlLink, start, end }\n',
    );
    process.exit(0);
  }

  if (!summary) {
    process.stderr.write('Error: --summary is required\n');
    process.exit(1);
  }

  if (!start) {
    process.stderr.write('Error: --start is required\n');
    process.exit(1);
  }

  if (!end) {
    process.stderr.write('Error: --end is required\n');
    process.exit(1);
  }

  const eventBody: Record<string, unknown> = {
    summary,
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
  };

  if (description) {
    eventBody['description'] = description;
  }

  if (location) {
    eventBody['location'] = location;
  }

  if (attendees) {
    eventBody['attendees'] = attendees.split(',').map((email) => ({ email: email.trim() }));
  }

  const encodedCalendarId = encodeURIComponent(calendarId);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events`;

  const response = await googleFetch(url, {
    method: 'POST',
    body: JSON.stringify(eventBody),
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Google Calendar API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const created = (await response.json()) as {
    id: string;
    summary: string;
    htmlLink: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
  };

  process.stdout.write(
    JSON.stringify({
      id: created.id,
      summary: created.summary,
      htmlLink: created.htmlLink,
      start: created.start,
      end: created.end,
    }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
