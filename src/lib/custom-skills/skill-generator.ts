import { type ToolDescriptor, toolInvocationPath } from '../tool-registry.js';

/**
 * Maps a service directory name to a skill folder name.
 * Only `knowledge_base` → `knowledge-base`; all other services pass through.
 * Output satisfies ^[a-z0-9]+(-[a-z0-9]+)*$
 */
export function serviceToSkillName(service: string): string {
  return service.replace(/_/g, '-');
}

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  hostfully:
    'Use when working with Hostfully API — message retrieval, sending, property/reservation lookups, webhook handling, and door codes',
  sifely:
    'Use when managing Sifely smart lock passcodes — list locks, create/delete/update passcodes, rotate codes, or diagnose guest access issues',
  github:
    'Use when working with GitHub — fetch a short-lived installation token for git/gh CLI operations',
  slack:
    'Use when posting messages to Slack, reading channel history, or posting guest-reply approval cards',
  knowledge_base:
    'Use when searching the employee knowledge base for relevant information using semantic vector search',
  platform:
    'Use when submitting task output to the platform, reporting issues, or evaluating mathematical expressions',
  composio:
    'Use when executing Composio actions (Notion, Google, Jira, etc.) or discovering available actions for a toolkit',
};

function renderToolIndexRow(descriptor: ToolDescriptor): string {
  return `| ${descriptor.id} | ${descriptor.description} |`;
}

function renderActionFile(descriptor: ToolDescriptor): string {
  const lines: string[] = [];

  lines.push(`# ${descriptor.id}`);
  lines.push('');
  lines.push(`**Description**: ${descriptor.description}`);
  lines.push('');
  lines.push(`**Invocation**: \`${toolInvocationPath(descriptor)} [flags]\``);
  lines.push('');

  const envVars = descriptor.envVars.length > 0 ? descriptor.envVars.join(', ') : 'None';
  lines.push(`**Environment variables**: ${envVars}`);
  lines.push('');

  lines.push('## Arguments');
  lines.push('');

  if (descriptor.args.length === 0) {
    lines.push('_(no arguments)_');
  } else {
    lines.push('| Argument | Required | Description |');
    lines.push('|----------|----------|-------------|');
    for (const arg of descriptor.args) {
      const req = arg.required ? 'required' : 'optional';
      lines.push(`| \`${arg.name}\` | ${req} | ${arg.description} |`);
    }
  }

  lines.push('');

  return lines.join('\n');
}

export interface GeneratedServiceSkill {
  skillMd: string;
  actionFiles: Map<string, string>;
}

export function generateServiceSkill(
  service: string,
  descriptors: ToolDescriptor[],
): GeneratedServiceSkill {
  const skillName = serviceToSkillName(service);
  const description = SERVICE_DESCRIPTIONS[service] ?? `Shell tools for the ${skillName} service`;

  const skillLines: string[] = [];

  skillLines.push('---');
  skillLines.push(`name: ${skillName}`);
  skillLines.push(`description: '${description}'`);
  skillLines.push('---');
  skillLines.push('');

  const title = skillName.charAt(0).toUpperCase() + skillName.slice(1);
  skillLines.push(`# ${title} Shell Tools`);
  skillLines.push('');
  skillLines.push(`Shell tools for the ${skillName} service.`);
  skillLines.push('Full CLI contract for each tool is in `actions/<tool-id>.md`.');
  skillLines.push('');

  skillLines.push('## Available Tools');
  skillLines.push('');
  skillLines.push('| Tool | Description |');
  skillLines.push('|------|-------------|');
  for (const descriptor of descriptors) {
    skillLines.push(renderToolIndexRow(descriptor));
  }
  skillLines.push('');

  const skillMd = skillLines.join('\n');

  const actionFiles = new Map<string, string>();
  for (const descriptor of descriptors) {
    actionFiles.set(descriptor.id, renderActionFile(descriptor));
  }

  return { skillMd, actionFiles };
}
