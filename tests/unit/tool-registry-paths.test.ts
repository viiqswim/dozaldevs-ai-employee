import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const SEED_PATH = join(ROOT, 'prisma', 'seed.ts');
const WORKER_TOOLS_DIR = join(ROOT, 'src', 'worker-tools');

function extractToolRegistryPaths(seedContent: string): string[] {
  const paths = new Set<string>();
  const regex = /['"]\/tools\/[^'"]+['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(seedContent)) !== null) {
    paths.add(match[0].slice(1, -1));
  }
  return Array.from(paths).sort();
}

function containerPathToSourcePath(containerPath: string): string {
  const relative = containerPath.replace(/^\/tools\//, '');
  const withTs = relative.replace(/\.js$/, '.ts');
  return join(WORKER_TOOLS_DIR, withTs);
}

describe('tool_registry paths in seed.ts', () => {
  const seedContent = readFileSync(SEED_PATH, 'utf-8');
  const toolPaths = extractToolRegistryPaths(seedContent);

  it('should find at least one tool path in seed.ts', () => {
    expect(toolPaths.length).toBeGreaterThan(0);
  });

  it('every seed registry path maps to a real source file under src/worker-tools/', () => {
    const missing: string[] = [];

    for (const containerPath of toolPaths) {
      const sourcePath = containerPathToSourcePath(containerPath);
      if (!existsSync(sourcePath)) {
        missing.push(`${containerPath} → ${sourcePath} (NOT FOUND)`);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `The following tool_registry paths in seed.ts do not resolve to a real source file:\n` +
          missing.map((m) => `  - ${m}`).join('\n'),
      );
    }
  });

  it('every seed registry path source file exports a descriptor', () => {
    const missingDescriptor: string[] = [];

    for (const containerPath of toolPaths) {
      const sourcePath = containerPathToSourcePath(containerPath);
      if (!existsSync(sourcePath)) {
        continue;
      }
      const content = readFileSync(sourcePath, 'utf-8');
      if (!content.includes('export const descriptor')) {
        missingDescriptor.push(`${containerPath} → ${sourcePath}`);
      }
    }

    if (missingDescriptor.length > 0) {
      throw new Error(
        `The following tool source files are missing 'export const descriptor':\n` +
          missingDescriptor.map((m) => `  - ${m}`).join('\n'),
      );
    }
  });
});
