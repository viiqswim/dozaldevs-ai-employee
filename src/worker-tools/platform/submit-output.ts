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

import { unescapeShellArg } from '../lib/unescape-args.js';
import { getArg } from '../lib/get-arg.js';
import type { ToolDescriptor } from '../lib/types.js';

export const descriptor: ToolDescriptor = {
  id: 'submit-output',
  service: 'platform',
  description: 'Write the platform output contract to /tmp/summary.txt to declare task outcome',
  envVars: [],
  args: [
    {
      name: '--summary',
      required: true,
      description: 'Human-readable summary of what was done',
      type: 'string',
    },
    {
      name: '--classification',
      required: true,
      description: 'NEEDS_APPROVAL | NO_ACTION_NEEDED',
      type: 'string',
    },
    {
      name: '--draft',
      required: false,
      description: 'Draft message/content for PM review',
      type: 'string',
    },
    {
      name: '--draft-file',
      required: false,
      description: 'Read draft from file at path',
      type: 'string',
    },
    {
      name: '--confidence',
      required: false,
      description: 'Confidence score between 0 and 1',
      type: 'number',
    },
    {
      name: '--reasoning',
      required: false,
      description: 'Explanation of the classification decision',
      type: 'string',
    },
    {
      name: '--urgency',
      required: false,
      description: 'Flag presence marks urgency=true',
      type: 'boolean',
    },
    {
      name: '--metadata',
      required: false,
      description: 'JSON object with additional structured data',
      type: 'string',
    },
  ],
};

const VALID_CLASSIFICATIONS = ['NEEDS_APPROVAL', 'NO_ACTION_NEEDED'] as const;
const OUTPUT_PATH = '/tmp/summary.txt';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: tsx submit-output.ts --summary <text> --classification <value> [options]\n\n' +
        'Writes the platform output contract to /tmp/summary.txt.\n' +
        'Call this at the end of every task to declare the outcome.\n\n' +
        'Required flags:\n' +
        '  --summary <text>              Human-readable summary of what was done\n' +
        '  --classification <value>      NEEDS_APPROVAL | NO_ACTION_NEEDED\n\n' +
        'Optional flags:\n' +
        '  --draft <text>                Draft message/content for PM review (use with NEEDS_APPROVAL)\n' +
        '  --draft-file <path>           Read draft from file at <path> instead of inline text (avoids shell quoting issues)\n' +
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

  const rawSummary = getArg(args, '--summary');
  const classification = getArg(args, '--classification') ?? '';
  const rawDraft = getArg(args, '--draft');
  const draftFile = getArg(args, '--draft-file') ?? null;
  const rawConfidence = getArg(args, '--confidence');
  const rawReasoning = getArg(args, '--reasoning');
  const urgency = args.includes('--urgency');
  const rawMetadata = getArg(args, '--metadata');

  const summary = rawSummary !== undefined ? unescapeShellArg(rawSummary) : '';
  let draft: string | null = rawDraft !== undefined ? unescapeShellArg(rawDraft) : null;
  const confidence: number | null = rawConfidence !== undefined ? parseFloat(rawConfidence) : null;
  const reasoning: string | null =
    rawReasoning !== undefined ? unescapeShellArg(rawReasoning) : null;

  let metadata: Record<string, unknown> | null = null;
  if (rawMetadata !== undefined) {
    try {
      metadata = JSON.parse(rawMetadata) as Record<string, unknown>;
    } catch {
      process.stderr.write('Error: --metadata must be valid JSON\n');
      process.exit(1);
    }
  }

  if (!summary) {
    process.stderr.write('Error: --summary is required\n');
    process.exit(1);
  }

  if (!classification) {
    process.stderr.write('Error: --classification is required\n');
    process.exit(1);
  }

  if (!VALID_CLASSIFICATIONS.includes(classification as (typeof VALID_CLASSIFICATIONS)[number])) {
    process.stderr.write(
      `Error: --classification must be one of: ${VALID_CLASSIFICATIONS.join(', ')}\n`,
    );
    process.exit(1);
  }

  if (confidence !== null) {
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      process.stderr.write('Error: --confidence must be a number between 0 and 1\n');
      process.exit(1);
    }
  }

  if (draftFile !== null) {
    if (!fs.existsSync(draftFile)) {
      process.stderr.write(`Error: --draft-file path does not exist: ${draftFile}\n`);
      process.exit(1);
    }
    draft = fs.readFileSync(draftFile, 'utf-8').trim();
  } else if (draft === null && fs.existsSync('/tmp/draft.txt')) {
    draft = fs.readFileSync('/tmp/draft.txt', 'utf-8').trim();
  }

  const output: Record<string, unknown> = {
    summary,
    classification,
  };

  if (draft !== null) output['draft'] = draft;
  if (confidence !== null) output['confidence'] = confidence;
  if (reasoning !== null) output['reasoning'] = reasoning;
  if (urgency) output['urgency'] = true;
  if (metadata !== null) output['metadata'] = metadata;

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
