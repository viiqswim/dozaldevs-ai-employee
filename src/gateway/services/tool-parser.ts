/**
 * tool-parser — Static analysis module for discovering shell tools in src/worker-tools/
 *
 * Reads TypeScript source files and extracts structured metadata via regex.
 * Also provides SKILL.md enrichment parsing to merge documentation.
 *
 * Design constraints:
 *   - Never executes tool files — source text only
 *   - Never uses AST parsing — regex only
 *   - Never caches — always reads from disk
 *   - Never throws on missing/broken files — logs warning and skips
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Exported interfaces
// ---------------------------------------------------------------------------

interface ToolFlag {
  name: string; // e.g. "--lock-id"
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
  default?: string;
}

interface ToolEnvVar {
  name: string; // e.g. "SIFELY_USERNAME"
  required: boolean;
}

export interface ToolMetadata {
  name: string; // filename minus .ts, e.g. "create-passcode"
  service: string; // parent directory, e.g. "sifely"
  containerPath: string; // "/tools/{service}/{name}.ts"
  description: string; // one-line description, never undefined/empty
  flags: ToolFlag[];
  envVars: ToolEnvVar[];
  outputShape?: string; // raw string from JSDoc Output: section
  notes?: string; // from SKILL.md enrichment
  example?: string; // from SKILL.md enrichment
  sourceLength: number; // line count of source file
}

export interface SkillEnrichment {
  notes?: string;
  example?: string;
  flagDescriptions?: Record<string, string>; // "--flag-name" -> "description text"
}

// ---------------------------------------------------------------------------
// discoverTools
// ---------------------------------------------------------------------------

/**
 * Discover all shell tools in the given base directory.
 * Excludes files in /lib/ or /fixtures/ subdirectories.
 * Returns sorted array (by service then name).
 */
export async function discoverTools(basePath: string): Promise<ToolMetadata[]> {
  const entries = await fs.readdir(basePath, { recursive: true, withFileTypes: true });

  const toolFiles: string[] = [];
  for (const dirent of entries) {
    if (!dirent.isFile()) continue;

    // Build relative path within basePath
    // dirent.parentPath or dirent.path (Node 20+)
    const parentDir =
      'parentPath' in dirent
        ? (dirent as unknown as { parentPath: string }).parentPath
        : (dirent as unknown as { path: string }).path;
    const relativePath = path.relative(basePath, path.join(parentDir, dirent.name));

    if (!relativePath.endsWith('.ts') || relativePath.endsWith('.d.ts')) continue;
    if (relativePath.includes('/node_modules/') || relativePath.startsWith('node_modules/'))
      continue;
    if (relativePath.includes('/lib/') || relativePath.startsWith('lib/')) continue;
    if (relativePath.includes('/fixtures/') || relativePath.startsWith('fixtures/')) continue;

    toolFiles.push(path.join(basePath, relativePath));
  }

  const results: ToolMetadata[] = [];
  for (const filePath of toolFiles) {
    try {
      const metadata = await parseToolFile(filePath);
      results.push(metadata);
    } catch (err) {
      console.warn(
        'tool-parser: failed to parse',
        filePath,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Sort by service then name
  results.sort((a, b) => {
    if (a.service !== b.service) return a.service.localeCompare(b.service);
    return a.name.localeCompare(b.name);
  });

  return results;
}

// ---------------------------------------------------------------------------
// parseToolFile
// ---------------------------------------------------------------------------

/**
 * Parse a single tool file and extract structured metadata.
 */
async function parseToolFile(filePath: string): Promise<ToolMetadata> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const name = path.basename(filePath, '.ts');
  const service = path.basename(path.dirname(filePath));
  const containerPath = `/tools/${service}/${name}.ts`;
  const sourceLength = lines.length;

  const description = extractDescription(content, name);
  const flags = extractFlags(content);
  const envVars = extractEnvVars(content);
  const outputShape = extractOutputShape(content);

  return {
    name,
    service,
    containerPath,
    description,
    flags,
    envVars,
    outputShape,
    sourceLength,
  };
}

// ---------------------------------------------------------------------------
// getToolByPath
// ---------------------------------------------------------------------------

/**
 * Get metadata for a single tool by service + toolName.
 * Returns null on any error (file not found, parse error).
 */
export async function getToolByPath(
  basePath: string,
  service: string,
  toolName: string,
): Promise<ToolMetadata | null> {
  const fullPath = path.join(basePath, service, toolName + '.ts');
  try {
    return await parseToolFile(fullPath);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseSkillMd
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file and extract per-tool enrichment data.
 * Returns empty Map if file does not exist or cannot be read.
 * Keys are filenames like "list-locks.ts" (not container paths).
 */
export async function parseSkillMd(skillPath: string): Promise<Map<string, SkillEnrichment>> {
  let content: string;
  try {
    content = await fs.readFile(skillPath, 'utf-8');
  } catch {
    return new Map();
  }

  const result = new Map<string, SkillEnrichment>();

  // Split on ### ` — each section may start with a tool filename
  const sections = content.split(/(?=### `)/);

  for (const section of sections) {
    // Match heading like: ### `post-message.ts` — Post a Slack message
    const headingMatch = /^### `([^`]+\.ts)`/.exec(section);
    if (!headingMatch) continue;

    const filename = path.basename(headingMatch[1]); // e.g. "post-message.ts"

    const enrichment: SkillEnrichment = {};

    // Extract Notes section
    const notesMatch = /\*\*Notes:\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n###|\n---|\n```|$)/.exec(section);
    if (notesMatch) {
      enrichment.notes = notesMatch[1].trim();
    }

    // Extract Example section (code block content)
    const exampleMatch = /\*\*Example:\*\*\s*\n```(?:bash)?\s*\n([\s\S]*?)\n```/.exec(section);
    if (exampleMatch) {
      enrichment.example = exampleMatch[1].trim();
    }

    // Extract flag descriptions from lines like: - `--flag-name` — description
    // or: - `--flag-name <type>` — description
    const flagDescriptions: Record<string, string> = {};
    const flagLineRegex = /^- `(--[a-z][a-z0-9-]*)[^`]*`[^—-]*[—-]+\s*(.+)$/gm;
    let flagMatch: RegExpExecArray | null;
    while ((flagMatch = flagLineRegex.exec(section)) !== null) {
      const flagName = flagMatch[1];
      const desc = flagMatch[2].trim();
      if (flagName && desc) {
        flagDescriptions[flagName] = desc;
      }
    }
    if (Object.keys(flagDescriptions).length > 0) {
      enrichment.flagDescriptions = flagDescriptions;
    }

    result.set(filename, enrichment);
  }

  return result;
}

// ---------------------------------------------------------------------------
// enrichTools
// ---------------------------------------------------------------------------

/**
 * Merge SKILL.md enrichment data into tool metadata array.
 * Mutates the array in place and returns it.
 */
export function enrichTools(
  tools: ToolMetadata[],
  enrichments: Map<string, SkillEnrichment>,
): ToolMetadata[] {
  for (const tool of tools) {
    const enrichment = enrichments.get(tool.name + '.ts');
    if (!enrichment) continue;

    if (enrichment.notes) tool.notes = enrichment.notes;
    if (enrichment.example) tool.example = enrichment.example;

    if (enrichment.flagDescriptions) {
      for (const flag of tool.flags) {
        const desc = enrichment.flagDescriptions[flag.name];
        if (desc && !flag.description) {
          flag.description = desc;
        }
      }
    }
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Private extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract one-line description from tool source content.
 * Try order: JSDoc first line → --help Usage block → tool name.
 */
function extractDescription(content: string, name: string): string {
  // 1. JSDoc first content line: /** ... * <description> */
  const jsdocMatch = /\/\*\*\s*\n\s*\*\s+([^\n*][^\n]+)/.exec(content);
  if (jsdocMatch) {
    const line = jsdocMatch[1].trim();
    if (line && !line.startsWith('@') && line.length > 3) {
      return line;
    }
  }

  // 2. From join('\n') help block — array-style help text pattern
  if (/\.join\(['"]\\n['"]\)/.test(content)) {
    const joinBlock = extractFromJoinHelp(content);
    if (joinBlock) {
      const desc = pickDescLine(joinBlock.split('\n'));
      if (desc) return desc;
    }
  }

  // 3. Fallback: tool name
  return name;
}

/**
 * Try to extract help description from array.join('\n') patterns.
 * Returns the block of help lines or null.
 */
function extractFromJoinHelp(content: string): string | null {
  const joinMatch = /\[\s*\n([\s\S]{0,3000}?)\]\.join\(['"]\\n['"]\)/.exec(content);
  if (!joinMatch) return null;
  return joinMatch[1];
}

function pickDescLine(lines: string[]): string | null {
  const skipPrefixes = [
    'Usage:',
    'Options:',
    'Arguments:',
    'Environment',
    '--',
    '[',
    '{',
    "'",
    '`',
  ];
  const sourceCodePatterns =
    /process\.|import |require\(|async |function |const |let |var |}\)|}\s*$|^\s*\)/;
  for (const line of lines) {
    const trimmed = line
      .trim()
      .replace(/^['`]/, '')
      .replace(/['`],?$/, '')
      .trim();
    if (
      trimmed.length > 5 &&
      !skipPrefixes.some((p) => trimmed.startsWith(p)) &&
      !sourceCodePatterns.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Extract all CLI flags from tool source using three patterns.
 */
function extractFlags(content: string): ToolFlag[] {
  const flagMap = new Map<string, ToolFlag>();

  // Extract --help text for flag descriptions
  const helpDescriptions = extractHelpFlagDescriptions(content);

  // Pattern A & C: args[i] === '--flag-name' or similar indexOf/loop patterns
  extractLoopFlags(content, flagMap, helpDescriptions);

  // Pattern B: args.includes('--flag-name')
  const includesRegex = /args\.includes\(['"](--([\w-]+))['"]\)/g;
  let m: RegExpExecArray | null;
  while ((m = includesRegex.exec(content)) !== null) {
    const flagName = m[1];
    if (!flagMap.has(flagName)) {
      flagMap.set(flagName, {
        name: flagName,
        type: 'boolean',
        required: false,
        description: helpDescriptions[flagName],
      });
    }
  }

  // indexOf pattern: args.indexOf('--flag-name')
  const indexOfRegex = /args\.indexOf\(['"](--([\w-]+))['"]\)/g;
  while ((m = indexOfRegex.exec(content)) !== null) {
    const flagName = m[1];
    if (!flagMap.has(flagName)) {
      // Check if there's an assignment after indexOf (string flag)
      // and if there's a required check
      const isRequired = isRequiredViaIndexOf(content, flagName);
      const isNumber = isNumberViaIndexOf(content, flagName);
      flagMap.set(flagName, {
        name: flagName,
        type: isNumber ? 'number' : 'string',
        required: isRequired,
        description: helpDescriptions[flagName],
      });
    }
  }

  // Filter out --help and -h (meta flags)
  const flags = Array.from(flagMap.values()).filter(
    (f) => f.name !== '--help' && f.name !== '-h' && f.name !== '--h',
  );

  return flags;
}

/**
 * Extract flags from for-loop patterns: args[i] === '--flag' or else if chains.
 */
function extractLoopFlags(
  content: string,
  flagMap: Map<string, ToolFlag>,
  helpDescriptions: Record<string, string>,
): void {
  // Match: args[i] === '--flag-name'
  const loopFlagRegex = /args\[i\]\s*===\s*['"](--([\w-]+))['"]/g;
  let m: RegExpExecArray | null;

  while ((m = loopFlagRegex.exec(content)) !== null) {
    const flagName = m[1];
    if (flagMap.has(flagName)) continue;

    // Get context around this match (~300 chars after)
    const afterMatch = content.slice(m.index, m.index + 400);

    // Is it boolean? No args[i+1] or args[++i] assignment follows
    const hasValueAssignment = /args\[(?:i\s*\+\s*1|\+\+i|i\+1)\]/.test(afterMatch);
    const isBooleanFlag = !hasValueAssignment;

    // Is it a number type?
    const isNumber =
      hasValueAssignment &&
      (/parseInt\(args\[/.test(afterMatch) ||
        /parseFloat\(args\[/.test(afterMatch) ||
        /Number\(args\[/.test(afterMatch));

    const type = isBooleanFlag ? 'boolean' : isNumber ? 'number' : 'string';

    // Is it required? Check if there's a stderr write + process.exit within the file
    // for this specific flag
    const isRequired = isRequiredFlag(content, flagName);

    flagMap.set(flagName, {
      name: flagName,
      type,
      required: isRequired,
      description: helpDescriptions[flagName],
    });
  }
}

/**
 * Determine if a flag is required by looking for stderr output + process.exit(1) guards.
 */
function isRequiredFlag(content: string, flagName: string): boolean {
  // Look for patterns like:
  // if (lockIdIndex === -1 || !args[lockIdIndex + 1]) { stderr.write('...--lock-id...'); process.exit(1) }
  // or: if (!args.channel) { stderr ... process.exit(1) }
  // or: process.stderr.write('Error: --flag-name') nearby process.exit(1)

  const escapedFlag = flagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern: stderr mention of the flag AND process.exit(1) within 500 chars
  const stderrFlagRegex = new RegExp(
    `process\\.stderr\\.write[^)]{0,200}${escapedFlag.replace(/-/g, '[\\s\\S]{0,3}')}[^)]{0,200}\\)`,
    'i',
  );

  const stderrMatch = stderrFlagRegex.exec(content);
  if (!stderrMatch) return false;

  // Check for process.exit(1) within 300 chars after the stderr write
  const afterStderr = content.slice(stderrMatch.index, stderrMatch.index + 300);
  return /process\.exit\(1\)/.test(afterStderr);
}

/**
 * Determine if an indexOf-based flag is required.
 */
function isRequiredViaIndexOf(content: string, flagName: string): boolean {
  return isRequiredFlag(content, flagName);
}

/**
 * Determine if an indexOf-based flag expects a numeric value.
 */
function isNumberViaIndexOf(content: string, flagName: string): boolean {
  const escapedFlag = flagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flagIndexRegex = new RegExp(`args\\.indexOf\\(['"]${escapedFlag}['"]\\)`, 'g');
  const m = flagIndexRegex.exec(content);
  if (!m) return false;

  const afterMatch = content.slice(m.index, m.index + 300);
  return /parseInt\(args\[/.test(afterMatch) || /parseFloat\(args\[/.test(afterMatch);
}

/**
 * Extract flag descriptions from --help text in source.
 * Looks for patterns like: '  --flag-name <type>  description'
 */
function extractHelpFlagDescriptions(content: string): Record<string, string> {
  const descriptions: Record<string, string> = {};

  // Find help text blocks (in string literals)
  // Match lines like: '  --flag-name <stuff>    description text'
  // These appear in single-quoted strings in the help output
  const flagDescRegex = /['`]\s{2}(--([\w-]+))(?:\s+[^'`\n]*)?\s{2,}([^'`\n]{5,})['`]/g;
  let m: RegExpExecArray | null;

  while ((m = flagDescRegex.exec(content)) !== null) {
    const flagName = m[1];
    const desc = m[3].trim();
    if (flagName && desc && !descriptions[flagName]) {
      descriptions[flagName] = desc;
    }
  }

  // Also match multi-line help with \n embedded: '  --flag-name\t\tdescription'
  const inlineDescRegex = /`([^`]{0,5000})`/g;
  let templateMatch: RegExpExecArray | null;
  while ((templateMatch = inlineDescRegex.exec(content)) !== null) {
    const block = templateMatch[1];
    const lineRegex = /^\s{1,4}(--([\w-]+))(?:\s+<[^>]+>|\s+\[[^\]]+\])?\s{2,}(.+)$/gm;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(block)) !== null) {
      const flagName = lineMatch[1];
      const desc = lineMatch[3].trim();
      if (flagName && desc && !descriptions[flagName]) {
        descriptions[flagName] = desc;
      }
    }
  }

  return descriptions;
}

/**
 * Extract environment variables from process.env references.
 */
function extractEnvVars(content: string): ToolEnvVar[] {
  const envVarMap = new Map<string, ToolEnvVar>();

  const envRegex = /process\.env(?:\[['"](\w+)['"]\]|\.(\w+))/g;
  let m: RegExpExecArray | null;

  while ((m = envRegex.exec(content)) !== null) {
    const varName = m[1] ?? m[2];
    if (!varName || envVarMap.has(varName)) continue;

    // Determine if required: look for if (!...) guard + process.exit(1) nearby
    const isRequired = isRequiredEnvVar(content, varName, m.index);

    envVarMap.set(varName, { name: varName, required: isRequired });
  }

  // Filter out common non-config env vars
  const filtered = Array.from(envVarMap.values()).filter(
    (v) =>
      v.name !== 'LOG_LEVEL' &&
      v.name !== 'NODE_ENV' &&
      v.name !== 'npm_package_version' &&
      !v.name.startsWith('npm_'),
  );

  return filtered;
}

/**
 * Determine if an env var is required by checking for guard + exit near its usage.
 */
function isRequiredEnvVar(content: string, varName: string, matchIndex: number): boolean {
  // Look at the 500 chars around the env var reference
  const start = Math.max(0, matchIndex - 50);
  const end = Math.min(content.length, matchIndex + 500);
  const context = content.slice(start, end);

  // Must have: if (! guard AND process.exit(1)
  const hasGuard = new RegExp(
    `if\\s*\\(!\\s*(?:process\\.env(?:\\[['"]${varName}['"]\\]|\\.${varName})|[a-zA-Z_$][\\w$]*)`,
  ).test(context);
  const hasExit = /process\.exit\(1\)/.test(context);

  return hasGuard && hasExit;
}

/**
 * Extract output shape description from JSDoc or --help text.
 */
function extractOutputShape(content: string): string | undefined {
  // From JSDoc: match between "* Output:" and next "*/", "* @", or "* ==="
  const jsdocOutputMatch = /\*\s+Output:\s*([^\n]*(?:\n\s*\*[^@/][^\n]*)*)/.exec(content);
  if (jsdocOutputMatch) {
    const raw = jsdocOutputMatch[1].replace(/^\s*\*/gm, '').trim();
    if (raw) return raw;
  }

  // From --help text: text after "Output" section
  const helpOutputMatch = /['"`]Output[^:]*:([^'"`]{0,500})['"`]/.exec(content);
  if (helpOutputMatch) {
    return helpOutputMatch[1].trim();
  }

  return undefined;
}
