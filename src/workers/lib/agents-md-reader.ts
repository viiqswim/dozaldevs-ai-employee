import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('agents-md-reader');

/**
 * Reads AGENTS.md from the given repo root directory.
 * Returns content as-is if within maxChars, truncated with notice if over.
 * Returns null if the file is missing or unreadable.
 *
 * SCOPE: read + inject + truncate only. NO @file parsing. NO metadata extraction.
 */
export async function readAgentsMd(
  repoRoot: string,
  maxChars: number = 8000,
): Promise<string | null> {
  const filePath = path.join(repoRoot, 'AGENTS.md');

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
  } catch {
    log.info({ repoRoot }, 'AGENTS.md not found — skipping injection');
    return null;
  }

  try {
    const contents = await fs.promises.readFile(filePath, 'utf-8');
    if (contents.length <= maxChars) {
      return contents;
    }
    return contents.slice(0, maxChars) + `\n\n[TRUNCATED at ${maxChars} chars]`;
  } catch (err) {
    log.warn(
      { repoRoot, err: err instanceof Error ? err.message : String(err) },
      'Failed to read AGENTS.md — returning null',
    );
    return null;
  }
}
