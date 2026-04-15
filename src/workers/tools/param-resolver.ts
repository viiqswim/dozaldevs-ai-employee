export function resolveParams(
  params: Record<string, unknown>,
  env: Record<string, string>,
  previousResult: unknown,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const ref = value.slice(1);
      if (ref === 'prev_result') {
        resolved[key] = previousResult;
      } else {
        resolved[key] = env[ref] ?? value;
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}
