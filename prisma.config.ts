import { defineConfig } from 'prisma/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const dotenvPath = resolve(process.cwd(), '.env');
if (existsSync(dotenvPath)) {
  for (const line of readFileSync(dotenvPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqPos = trimmed.indexOf('=');
    if (eqPos < 1) continue;
    const key = trimmed.slice(0, eqPos).trim();
    if (!key || key in process.env) continue;
    const raw = trimmed.slice(eqPos + 1).trim();
    process.env[key] = raw.replace(/^["'](.*)["']$/s, '$1');
  }
}

export default defineConfig({});
