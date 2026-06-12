import { COMPOSIO_API_KEY } from '../config.js';
import { createHttpClient, type HttpClient } from '../http-client.js';

export interface ComposioSkillOutput {
  skillMd: string;
  actionFiles: Record<string, string>;
}

interface ComposioInputParam {
  type?: string;
  description?: string;
  required?: boolean;
}

interface ComposioAction {
  slug: string;
  name?: string;
  description?: string;
  input_parameters?: Record<string, ComposioInputParam>;
}

interface ComposioToolsPage {
  items: ComposioAction[];
  next_cursor?: string | null;
}

const COMPOSIO_API_BASE = 'https://backend.composio.tech';
const MAX_DESCRIPTION_CHARS = 1024;
const SKILL_NAME_SAFE_RE = /[^a-z0-9]+/g; // strips anything not a lowercase alnum so name matches ^[a-z0-9]+(-[a-z0-9]+)*$

function toSkillSegment(slug: string): string {
  return slug
    .toLowerCase()
    .replace(SKILL_NAME_SAFE_RE, '-')
    .replace(/^-+|-+$/g, '');
}

function buildHttpClient(): HttpClient {
  return createHttpClient(
    COMPOSIO_API_BASE,
    {
      'x-api-key': COMPOSIO_API_KEY(),
      'Content-Type': 'application/json',
    },
    { service: 'composio-skill-generator' },
  );
}

async function fetchAllActions(toolkitSlug: string, http: HttpClient): Promise<ComposioAction[]> {
  const all: ComposioAction[] = [];
  let cursor: string | null = null;

  do {
    const qs = new URLSearchParams({ toolkit_slug: toolkitSlug, limit: '1000' });
    if (cursor) qs.set('cursor', cursor);

    const resp = await http.get(`/api/v3.1/tools?${qs.toString()}`);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Composio API error ${resp.status} for toolkit "${toolkitSlug}": ${text}`);
    }

    const page = (await resp.json()) as ComposioToolsPage;
    all.push(...(page.items ?? []));
    cursor = page.next_cursor ?? null;
  } while (cursor !== null);

  return all;
}

function renderSkillMd(toolkitSlug: string, actions: ComposioAction[]): string {
  const segment = toSkillSegment(toolkitSlug);
  const name = `composio-${segment}`;
  const appName =
    toolkitSlug.charAt(0).toUpperCase() + toolkitSlug.slice(1).toLowerCase().replace(/-/g, ' ');

  const rawDescription = `Use when working with ${appName} via the Composio integration — reading, writing, or managing ${appName} content. Requires ${appName} to be connected in the platform settings. Full action parameter schemas are in the bundled actions/ files.`;

  const description =
    rawDescription.length > MAX_DESCRIPTION_CHARS
      ? rawDescription.slice(0, MAX_DESCRIPTION_CHARS - 3) + '...'
      : rawDescription;

  const lines: string[] = [
    `---`,
    `name: ${name}`,
    `description: '${description}'`,
    `---`,
    ``,
    `# Composio — ${appName}`,
    ``,
    `Full parameter schemas for each action are in \`actions/<SLUG>.md\`.`,
    ``,
    `## Available Actions`,
    ``,
  ];

  if (actions.length === 0) {
    lines.push('_No actions available for this toolkit._');
  } else {
    lines.push('| Action | Description |');
    lines.push('|--------|-------------|');
    for (const action of actions) {
      const desc = (action.description ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${action.slug} | ${desc} |`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function renderActionMd(action: ComposioAction): string {
  const lines: string[] = [
    `# ${action.slug}`,
    ``,
    `**Description**: ${action.description ?? '(no description)'}`,
    ``,
  ];

  const entries = Object.entries(action.input_parameters ?? {});

  if (entries.length === 0) {
    lines.push('## Input Parameters', '', '_No input parameters._', '');
  } else {
    lines.push('## Input Parameters', '');
    lines.push('| Parameter | Type | Required | Description |');
    lines.push('|-----------|------|----------|-------------|');
    for (const [key, schema] of entries) {
      const type = typeof schema.type === 'string' ? schema.type : 'unknown';
      const required = schema.required === true ? 'Yes' : 'No';
      const rawDesc = typeof schema.description === 'string' ? schema.description : '';
      const desc = rawDesc.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${key} | ${type} | ${required} | ${desc} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function generateComposioSkill(
  toolkitSlug: string,
  httpOverride?: HttpClient,
): Promise<ComposioSkillOutput> {
  const http = httpOverride ?? buildHttpClient();
  const actions = await fetchAllActions(toolkitSlug, http);

  const skillMd = renderSkillMd(toolkitSlug, actions);
  const actionFiles: Record<string, string> = {};

  for (const action of actions) {
    actionFiles[`actions/${action.slug}.md`] = renderActionMd(action);
  }

  return { skillMd, actionFiles };
}
