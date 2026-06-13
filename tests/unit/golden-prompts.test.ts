/**
 * Golden-snapshot tests for LLM-facing prompt outputs and the agents-md compiler.
 *
 * PURPOSE: Byte-identical guards that fail if any refactoring accidentally changes
 * what gets sent to the LLM. Every subsequent task in the single-source plan runs
 * `pnpm test:unit -- golden-prompts` as a pre-commit check.
 *
 * GENERATING FIXTURES:
 *   GENERATE_GOLDEN=true pnpm test:unit -- golden-prompts
 *
 * This writes the fixture files from the current function output. Commit the result.
 * The next run (without GENERATE_GOLDEN) compares against those files.
 *
 * FIXED INPUT for compileAgentsMd — NEVER change this without also regenerating fixtures:
 *   See FIXED_COMPILE_INPUT below.
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Must mock postgrest-client before importing agents-md-compiler (module-level import)
vi.mock('../../src/workers/lib/postgrest-client.js', () => ({
  query: vi.fn().mockResolvedValue([]),
}));

import {
  SYSTEM_PROMPT_PRE,
  SYSTEM_PROMPT_POST,
  REFINE_SYSTEM_PROMPT_PRE,
  REFINE_SYSTEM_PROMPT_POST,
  buildConnectedAppsBlock,
} from '../../src/gateway/services/prompts/archetype-generator-prompts.js';

import { compileAgentsMd } from '../../src/workers/lib/agents-md-compiler.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, '../fixtures/golden');
const GENERATE = process.env['GENERATE_GOLDEN'] === 'true';

/**
 * Fixed deterministic input for compileAgentsMd golden fixture.
 * NEVER change these strings without regenerating fixtures (GENERATE_GOLDEN=true).
 * The exact values are chosen to be representative of a real summarizer employee
 * but contain no timestamps, random values, or external dependencies.
 */
const FIXED_COMPILE_INPUT = {
  identity:
    'You are Alex, the Daily Summarizer at Acme Properties. You specialize in daily operations reporting and communicate in a concise, professional tone.',
  executionSteps:
    '1. Read all messages from $SOURCE_CHANNELS from the last 24 hours using tsx /tools/slack/read-channels.ts --channels "$SOURCE_CHANNELS" --lookback-hours 24.\n' +
    '2. Write a summary to /tmp/draft.txt.\n' +
    '3. Submit output: tsx /tools/platform/submit-output.ts --summary "Daily summary complete" --classification "NEEDS_APPROVAL" --draft-file /tmp/draft.txt.',
  deliverySteps:
    '1. Parse the <approved-content> JSON from the prompt, extract the "draft" field, and write to /tmp/delivery-draft.txt.\n' +
    '2. Post to Slack: tsx /tools/slack/post-message.ts --channel "$NOTIFICATION_CHANNEL" --text-file /tmp/delivery-draft.txt.\n' +
    '3. Submit confirmation: tsx /tools/platform/submit-output.ts --summary "Delivered to Slack" --classification "DELIVERED".',
};

function writeFixture(filename: string, content: string): void {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  writeFileSync(path.join(FIXTURES_DIR, filename), content, 'utf-8');
}

function readFixture(filename: string): string {
  return readFileSync(path.join(FIXTURES_DIR, filename), 'utf-8');
}

describe('golden-prompts', () => {
  it('system-prompt (empty tool catalog) matches golden fixture', () => {
    // Replicates the fallback path of buildSystemPrompt([], []) when discoverTools returns empty:
    //   SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + SYSTEM_PROMPT_POST
    const connectedAppsBlock = buildConnectedAppsBlock([], []);
    const actual = SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + SYSTEM_PROMPT_POST;

    if (GENERATE) {
      writeFixture('system-prompt.txt', actual);
      return;
    }

    const expected = readFixture('system-prompt.txt');
    expect(actual).toBe(expected);
  });

  it('refine-prompt (empty tool catalog) matches golden fixture', () => {
    const connectedAppsBlock = buildConnectedAppsBlock([], []);
    const actual =
      REFINE_SYSTEM_PROMPT_PRE + '\n\n' + connectedAppsBlock + '\n\n' + REFINE_SYSTEM_PROMPT_POST;

    if (GENERATE) {
      writeFixture('refine-prompt.txt', actual);
      return;
    }

    const expected = readFixture('refine-prompt.txt');
    expect(actual).toBe(expected);
  });

  it('compiled-agents-md matches golden fixture', () => {
    const actual = compileAgentsMd(FIXED_COMPILE_INPUT);

    if (GENERATE) {
      writeFixture('compiled-agents-md.txt', actual);
      return;
    }

    const expected = readFixture('compiled-agents-md.txt');
    expect(actual).toBe(expected);
  });
});
