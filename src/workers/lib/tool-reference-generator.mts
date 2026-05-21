/**
 * tool-reference-generator — Produces an "Available Tools" AGENTS.md section
 * by parsing tool source files via the existing tool-parser.
 *
 * Used by the harness to inject a runtime tool reference into the agent's AGENTS.md
 * so the OpenCode agent knows which tools exist and what they do.
 */

import path from 'path';
import { getToolByPath } from '../../gateway/services/tool-parser.js';

const SUBMIT_OUTPUT_CONTAINER_PATH = '/tools/platform/submit-output.ts';

/**
 * Parse a container-style tool path into service + toolName components.
 * "/tools/slack/post-message.ts" → { service: "slack", toolName: "post-message" }
 * Returns null for malformed paths.
 */
function parseContainerPath(containerPath: string): { service: string; toolName: string } | null {
  // Strip leading /tools/ prefix
  const stripped = containerPath.replace(/^\/tools\//, '');
  const parts = stripped.split('/');
  if (parts.length < 2) return null;

  const service = parts[0];
  const toolName = path.basename(parts[parts.length - 1], '.ts');
  if (!service || !toolName) return null;

  return { service, toolName };
}

/**
 * Generate an "Available Tools" AGENTS.md section from a list of container-style tool paths.
 *
 * @param toolPaths - Container-style paths from tool_registry.tools, e.g. ["/tools/slack/post-message.ts"]
 * @param workerToolsBasePath - Local filesystem base for tool source files (default: "src/worker-tools")
 * @returns Markdown string with the available tools section
 */
export async function generateToolReference(
  toolPaths: string[] | null | undefined,
  workerToolsBasePath = 'src/worker-tools',
): Promise<string> {
  // Normalise input
  const paths: string[] = Array.isArray(toolPaths) ? [...toolPaths] : [];

  // Always include submit-output — ensure no duplicate
  if (!paths.includes(SUBMIT_OUTPUT_CONTAINER_PATH)) {
    paths.push(SUBMIT_OUTPUT_CONTAINER_PATH);
  }

  const lines: string[] = [];

  for (const containerPath of paths) {
    const parsed = parseContainerPath(containerPath);

    if (!parsed) {
      // Malformed path — use raw path as fallback label
      lines.push(`- **${containerPath}** (\`${containerPath}\`) — tool`);
      continue;
    }

    const { service, toolName } = parsed;
    const metadata = await getToolByPath(workerToolsBasePath, service, toolName);

    if (metadata) {
      lines.push(
        `- **${metadata.name}** (\`${metadata.containerPath}\`) — ${metadata.description}`,
      );
    } else {
      // File not found or parse error — graceful fallback using filename
      lines.push(`- **${toolName}** (\`${containerPath}\`) — ${toolName}`);
    }
  }

  const toolList = lines.join('\n');

  return [
    '## Available Tools',
    '',
    'The following tools are available to you. Use `tsx <tool-path>` to run them.',
    '',
    toolList,
    '',
    'Load the `tool-usage-reference` skill for exact CLI syntax and flags.',
  ].join('\n');
}
