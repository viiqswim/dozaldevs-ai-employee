import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Build Infrastructure', () => {
  it('tsconfig.build.json exists', () => {
    const path = join(process.cwd(), 'tsconfig.build.json');
    expect(existsSync(path)).toBe(true);
  });

  it('tsconfig.build.json is valid JSON', () => {
    const path = join(process.cwd(), 'tsconfig.build.json');
    const content = readFileSync(path, 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('tsconfig.build.json extends ./tsconfig.json', () => {
    const path = join(process.cwd(), 'tsconfig.build.json');
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content);
    expect(config.extends).toBe('./tsconfig.json');
  });

  it('tsconfig.build.json sets noEmit: false', () => {
    const path = join(process.cwd(), 'tsconfig.build.json');
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content);
    expect(config.compilerOptions.noEmit).toBe(false);
  });

  it('tsconfig.build.json sets outDir', () => {
    const path = join(process.cwd(), 'tsconfig.build.json');
    const content = readFileSync(path, 'utf-8');
    const config = JSON.parse(content);
    expect(config.compilerOptions.outDir).toBeDefined();
    expect(config.compilerOptions.outDir).not.toBe('');
  });

  it('.env.example has OPENROUTER_API_KEY', () => {
    const path = join(process.cwd(), '.env.example');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('OPENROUTER_API_KEY');
  });

  it('.env.example has GITHUB_TOKEN', () => {
    const path = join(process.cwd(), '.env.example');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('GITHUB_TOKEN=');
  });

  it('.env.example has COST_LIMIT_USD_PER_DEPT_PER_DAY', () => {
    const path = join(process.cwd(), '.env.example');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('COST_LIMIT_USD_PER_DEPT_PER_DAY');
  });

  it('package.json build script uses tsconfig.build.json', () => {
    const path = join(process.cwd(), 'package.json');
    const content = readFileSync(path, 'utf-8');
    const pkg = JSON.parse(content);
    expect(pkg.scripts.build).toContain('tsconfig.build.json');
  });
});
