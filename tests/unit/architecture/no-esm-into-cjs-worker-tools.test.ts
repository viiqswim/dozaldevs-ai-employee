import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

/**
 * Regression guard for the ESM->CJS worker-tools boot crash.
 *
 * `src/worker-tools/` is a CommonJS island (it has its own package.json with no
 * "type": "module"). The rest of `src/` is ESM. When an ESM module imports a
 * NAMED export from the CJS worker-tools subtree, Node's interop only exposes a
 * `default` export at runtime, so the named import is `undefined` and throws
 * `SyntaxError: ... does not provide an export named 'X'` at module load.
 *
 * This crashed the gateway in production (see fix: repoint requireEnv to
 * src/lib/config.js). `pnpm build` and Vitest do NOT catch it because tsx/esbuild
 * resolve the .ts source and bypass Node's native CJS interop — only a real Node
 * boot reproduces it. Hence this static source-tree guard.
 *
 * RULE: No file under src/ (outside src/worker-tools/ itself) may import from
 * the src/worker-tools/ subtree. Shared helpers must live in ESM-safe locations
 * like src/lib/.
 */

function collectTsFiles(dir: string, results: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

describe('architecture: no ESM imports into the CJS worker-tools island', () => {
  it('has zero src/ (non worker-tools) files importing from src/worker-tools/', () => {
    const srcDir = join(repoRoot, 'src');
    const workerToolsDir = join(repoRoot, 'src', 'worker-tools');

    const allTsFiles = collectTsFiles(srcDir);
    const files = allTsFiles
      .filter((f) => !f.startsWith(workerToolsDir))
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) => f.slice(repoRoot.length + 1)); // make relative

    const offenders: string[] = [];
    const importRe = /\bfrom\s+['"][^'"]*worker-tools\/[^'"]*['"]/;

    for (const rel of files) {
      const content = readFileSync(join(repoRoot, rel), 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (importRe.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `ESM files must not import from the CJS src/worker-tools/ island ` +
        `(named imports resolve to undefined at runtime and crash on Node boot). ` +
        `Move the shared helper to an ESM location like src/lib/. Offenders:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
