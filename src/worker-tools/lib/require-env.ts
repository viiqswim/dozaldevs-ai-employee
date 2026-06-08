/**
 * Reads an env var. If missing or empty, writes to stderr and calls process.exit(1).
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Error: ${name} environment variable is required\n`);
    process.exit(1);
  }
  return value;
}

/**
 * Reads an env var. Returns undefined if missing or empty (graceful — does not exit).
 */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
