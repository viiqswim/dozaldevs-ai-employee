// World A module (compiled gateway/workers). Worker-tools (World B, tsx-isolated)
// must NOT import this — they receive a generated copy. A worker-tool importing
// this would pull non-bundled deps into tsx and crash at runtime.

import type { StandardOutput } from '../workers/lib/output-schema.mjs';

export const SUMMARY_PATH = '/tmp/summary.txt';

export const APPROVAL_MESSAGE_PATH = '/tmp/approval-message.json';

export const DRAFT_PATH = '/tmp/draft.txt';

// Re-export, never redefine — keeps one source for the classification literals.
export type OutputClassification = StandardOutput['classification'];

export const EXECUTION_PROMPT =
  'Follow the instructions in <execution-instructions> within the AGENTS.md file';

export const DELIVERY_PHASE_VALUE = 'delivery';

export const EXECUTION_PHASE_VALUE = 'execution';

export const OUTPUT_CONTRACT_VERSION = 1;
