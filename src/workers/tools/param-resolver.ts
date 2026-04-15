function prevResultToString(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    const r = value as Record<string, unknown>;
    if (typeof r.text === 'string') return r.text;
  }
  return JSON.stringify(value);
}

export function resolveParams(
  params: Record<string, unknown>,
  env: Record<string, string>,
  previousResult: unknown,
  archetypeFields?: Record<string, unknown>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') {
      resolved[key] = value;
      continue;
    }

    if (value === '$prev_result') {
      if (
        previousResult !== null &&
        typeof previousResult === 'object' &&
        typeof (previousResult as Record<string, unknown>).text === 'string'
      ) {
        resolved[key] = (previousResult as Record<string, unknown>).text;
      } else {
        resolved[key] = previousResult;
      }
      continue;
    }

    if (value.includes('$prev_result')) {
      resolved[key] = value.replace('$prev_result', prevResultToString(previousResult));
      continue;
    }

    if (value.startsWith('$archetype.') && archetypeFields) {
      const field = value.slice('$archetype.'.length);
      resolved[key] = archetypeFields[field] ?? value;
      continue;
    }

    if (value.startsWith('$')) {
      const ref = value.slice(1);
      resolved[key] = env[ref] ?? value;
      continue;
    }

    resolved[key] = value;
  }

  return resolved;
}
