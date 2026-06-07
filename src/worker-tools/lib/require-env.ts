export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`Error: ${name} environment variable is required\n`);
    process.exit(1);
  }
  return value;
}
