/**
 * ToolDescriptor — typed metadata exported by every shell tool.
 *
 * Each tool under src/worker-tools/ exports a `descriptor` constant of this type.
 * The gateway's discoverTools() aggregates these at startup (no regex, no disk read
 * per request) and serves the cached catalog to the archetype generator and admin routes.
 *
 * Design constraints:
 *   - This file lives in World B (src/worker-tools/lib/) — MUST NOT import from src/lib/
 *   - Keep the shape minimal; downstream consumers (ToolMetadata) are derived from it
 */

export interface ToolArg {
  name: string; // e.g. "--lock-id"
  required: boolean;
  description: string;
  type?: 'string' | 'number' | 'boolean';
}

export interface ToolDescriptor {
  /** Unique tool identifier — matches the filename without .ts, e.g. "post-message" */
  id: string;
  /** Parent service directory, e.g. "slack" */
  service: string;
  /** One-line description of what the tool does */
  description: string;
  /** Environment variables this tool reads (platform vars only — not tenant secrets) */
  envVars: string[];
  /** CLI arguments the tool accepts */
  args: ToolArg[];
}
