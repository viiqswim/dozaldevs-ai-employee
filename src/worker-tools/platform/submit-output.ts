/**
 * submit-output.ts
 *
 * Shell tool for AI employees to write the platform output contract file /tmp/summary.txt.
 *
 * When to use: Call this tool at the end of every task to declare the outcome.
 * The harness reads /tmp/summary.txt and calls parseStandardOutput() to determine
 * whether approval is required and what to deliver.
 *
 * Classification values:
 *   NEEDS_APPROVAL    — deliverable requires PM review before sending
 *   NO_ACTION_NEEDED  — task complete, no deliverable to send (e.g. nothing to reply)
 *
 * No environment variables required — this tool is a pure local file writer.
 */

import fs from 'fs';

interface Args {
  summary: string;
  classification: string;
  draft: string | null;
  confidence: number | null;
  reasoning: string | null;
  urgency: boolean;
  metadata: Record<string, unknown> | null;
  help: boolean;
}

const VALID_CLASSIFICATIONS = ['NEEDS_APPROVAL', 'NO_ACTION_NEEDED'] as const;
const OUTPUT_PATH = '/tmp/summary.txt';

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let summary = '';
  let classification = '';
  let draft: string | null = null;
  let confidence: number | null = null;
  let reasoning: string | null = null;
  let urgency = false;
  let metadata: Record<string, unknown> | null = null;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--summary' && args[i + 1]) {
      summary = args[++i];
    } else if (args[i] === '--classification' && args[i + 1]) {
      classification = args[++i];
    } else if (args[i] === '--draft' && args[i + 1]) {
      draft = args[++i];
    } else if (args[i] === '--confidence' && args[i + 1]) {
      confidence = parseFloat(args[++i]);
    } else if (args[i] === '--reasoning' && args[i + 1]) {
      reasoning = args[++i];
    } else if (args[i] === '--urgency') {
      urgency = true;
    } else if (args[i] === '--metadata' && args[i + 1]) {
      const raw = args[++i];
      try {
        metadata = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        process.stderr.write('Error: --metadata must be valid JSON\n');
        process.exit(1);
      }
    } else if (args[i] === '--help') {
      help = true;
    }
  }

  return { summary, classification, draft, confidence, reasoning, urgency, metadata, help };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    process.stdout.write(
      'Usage: tsx submit-output.ts --summary <text> --classification <value> [options]\n\n' +
        'Writes the platform output contract to /tmp/summary.txt.\n' +
        'Call this at the end of every task to declare the outcome.\n\n' +
        'Required flags:\n' +
        '  --summary <text>              Human-readable summary of what was done\n' +
        '  --classification <value>      NEEDS_APPROVAL | NO_ACTION_NEEDED\n\n' +
        'Optional flags:\n' +
        '  --draft <text>                Draft message/content for PM review (use with NEEDS_APPROVAL)\n' +
        '  --confidence <0-1>            Confidence score between 0 and 1 (e.g. 0.95)\n' +
        '  --reasoning <text>            Explanation of the classification decision\n' +
        '  --urgency                     Flag presence marks urgency=true\n' +
        '  --metadata <json>             JSON object with additional structured data\n' +
        '  --help                        Show this help message\n\n' +
        'Environment variables:\n' +
        '  (none required)\n\n' +
        'Output:\n' +
        '  JSON written to /tmp/summary.txt\n' +
        '  Same JSON echoed to stdout\n\n' +
        'Exit codes:\n' +
        '  0 — success, /tmp/summary.txt written\n' +
        '  1 — missing required flag, invalid value, or file write failure\n',
    );
    process.exit(0);
  }

  if (!args.summary) {
    process.stderr.write('Error: --summary is required\n');
    process.exit(1);
  }

  if (!args.classification) {
    process.stderr.write('Error: --classification is required\n');
    process.exit(1);
  }

  if (
    !VALID_CLASSIFICATIONS.includes(args.classification as (typeof VALID_CLASSIFICATIONS)[number])
  ) {
    process.stderr.write(
      `Error: --classification must be one of: ${VALID_CLASSIFICATIONS.join(', ')}\n`,
    );
    process.exit(1);
  }

  if (args.confidence !== null) {
    if (isNaN(args.confidence) || args.confidence < 0 || args.confidence > 1) {
      process.stderr.write('Error: --confidence must be a number between 0 and 1\n');
      process.exit(1);
    }
  }

  const output: Record<string, unknown> = {
    summary: args.summary,
    classification: args.classification,
  };

  if (args.draft !== null) output['draft'] = args.draft;
  if (args.confidence !== null) output['confidence'] = args.confidence;
  if (args.reasoning !== null) output['reasoning'] = args.reasoning;
  if (args.urgency) output['urgency'] = true;
  if (args.metadata !== null) output['metadata'] = args.metadata;

  const json = JSON.stringify(output);

  try {
    fs.writeFileSync(OUTPUT_PATH, json, 'utf8');
  } catch (err) {
    process.stderr.write(`Error: Failed to write ${OUTPUT_PATH}: ${String(err)}\n`);
    process.exit(1);
  }

  process.stdout.write(json + '\n');
}

main().catch((err) => {
  process.stderr.write('Fatal: ' + String(err) + '\n');
  process.exit(1);
});
