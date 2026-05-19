export function buildTemplateVars(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      vars[key.toLowerCase()] = value;
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('INPUT_') && value !== undefined) {
      const strippedKey = key.slice('INPUT_'.length).toLowerCase();
      vars[strippedKey] = value;
    }
  }

  return vars;
}

export function substituteTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    return match;
  });
}
