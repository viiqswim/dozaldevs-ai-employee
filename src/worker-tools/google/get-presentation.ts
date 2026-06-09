import { googleFetch } from './google-fetch.js';
import { getArg } from '../lib/get-arg.js';

interface SlidePageElement {
  objectId: string;
}

interface Slide {
  objectId: string;
  pageElements?: SlidePageElement[];
}

interface PresentationResponse {
  presentationId: string;
  title: string;
  slides?: Slide[];
}

function parseArgs(argv: string[]): { presentationId: string; help: boolean } {
  const args = argv.slice(2);
  return {
    presentationId: getArg(args, '--presentation-id') ?? '',
    help: args.includes('--help'),
  };
}

async function main(): Promise<void> {
  const { presentationId, help } = parseArgs(process.argv);

  if (help) {
    process.stdout.write(
      'Usage: tsx get-presentation.ts --presentation-id <id>\n' +
        '\n' +
        'Fetches a Google Slides presentation with slide count and page element counts.\n' +
        '\n' +
        'Options:\n' +
        '  --presentation-id <id>  Required. The Google Slides presentation ID.\n' +
        '  --help                  Show this help message\n' +
        '\n' +
        'Environment:\n' +
        '  GOOGLE_ACCESS_TOKEN  Required. OAuth2 access token with Slides read scope.\n' +
        '\n' +
        'Output: JSON { id, title, slides_count, slides: [{ objectId, pageElements_count }] }\n',
    );
    process.exit(0);
  }

  if (!presentationId) {
    process.stderr.write('Error: --presentation-id is required\n');
    process.exit(1);
  }

  const url = `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`;

  const response = await googleFetch(url);

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(`Error: Slides API returned ${response.status}: ${body}\n`);
    process.exit(1);
  }

  const data = (await response.json()) as PresentationResponse;

  const slides = (data.slides ?? []).map((slide) => ({
    objectId: slide.objectId,
    pageElements_count: slide.pageElements?.length ?? 0,
  }));

  const result = {
    id: data.presentationId,
    title: data.title,
    slides_count: slides.length,
    slides,
  };

  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
