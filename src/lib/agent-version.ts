import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

export interface VersionInput {
  promptTemplate: string;
  modelId: string;
  toolConfig: Record<string, unknown>;
}

/**
 * Deterministically sort object keys and stringify.
 * Ensures { b: 1, a: 2 } and { a: 2, b: 1 } produce identical output.
 */
function sortedStringify(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Compute SHA-256 hashes for prompt template, model ID, and tool configuration.
 * Uses deterministic JSON serialization to ensure identical inputs always produce identical hashes.
 *
 * @param input - VersionInput with promptTemplate, modelId, and toolConfig
 * @returns Object with promptHash, modelId, and toolConfigHash
 */
export function computeVersionHash(input: VersionInput): {
  promptHash: string;
  modelId: string;
  toolConfigHash: string;
} {
  const promptHash = createHash('sha256').update(input.promptTemplate).digest('hex');
  const toolConfigHash = createHash('sha256')
    .update(sortedStringify(input.toolConfig))
    .digest('hex');

  return {
    promptHash,
    modelId: input.modelId,
    toolConfigHash,
  };
}

/**
 * Upsert semantics: find existing agent_version record or create new one.
 * Prevents duplicate records for the same hash combination.
 *
 * @param prisma - PrismaClient instance
 * @param params - Hash values and optional changelog note
 * @returns UUID of the agent_version record (existing or newly created)
 */
export async function ensureAgentVersion(
  prisma: PrismaClient,
  params: {
    promptHash: string;
    modelId: string;
    toolConfigHash: string;
    changelogNote?: string;
  },
): Promise<string> {
  // Try to find existing record
  const existing = await prisma.agentVersion.findFirst({
    where: {
      prompt_hash: params.promptHash,
      model_id: params.modelId,
      tool_config_hash: params.toolConfigHash,
    },
  });

  if (existing) {
    return existing.id;
  }

  // Create new record
  const created = await prisma.agentVersion.create({
    data: {
      prompt_hash: params.promptHash,
      model_id: params.modelId,
      tool_config_hash: params.toolConfigHash,
      changelog_note: params.changelogNote,
      is_active: true,
    },
  });

  return created.id;
}
