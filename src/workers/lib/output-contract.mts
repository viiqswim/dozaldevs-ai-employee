import { createLogger } from '../../lib/logger.js';
import { parseStandardOutput, isApprovalRequired, type StandardOutput } from './output-schema.mjs';

const log = createLogger('output-contract');

export interface OutputContractResult {
  content: string;
  extraMetadata: Record<string, unknown>;
}

export interface CheckOutputFilesOptions {
  /** When false, skips auto-posting an approval card even if NEEDS_APPROVAL. */
  approvalRequired?: boolean;
  /** Called when summary has NEEDS_APPROVAL but no approval card was found. */
  onNeedsApproval?: (parsedOutput: StandardOutput) => Promise<Record<string, unknown>>;
}

/**
 * Read /tmp/summary.txt and /tmp/approval-message.json.
 * Validates that approval-message.json does not contain PLACEHOLDER values.
 * If NEEDS_APPROVAL and no approval card exists, calls onNeedsApproval callback.
 */
export async function checkOutputFiles(
  taskId: string,
  options?: CheckOutputFilesOptions,
): Promise<OutputContractResult> {
  const { readFile } = await import('fs/promises');

  let content = 'completed';
  let extraMetadata: Record<string, unknown> = {};

  try {
    const summaryText = await readFile('/tmp/summary.txt', 'utf8');
    if (summaryText.trim()) {
      content = summaryText.trim();
      log.info({ taskId }, '[opencode-harness] Read summary from /tmp/summary.txt');
    }
  } catch {
    // not written
  }

  let approvalJsonExists = false;
  try {
    const approvalJson = await readFile('/tmp/approval-message.json', 'utf8');
    const approvalData = JSON.parse(approvalJson) as Record<string, unknown>;
    const PLACEHOLDER_PATTERN = /PLACEHOLDER/i;
    const tsVal = String(approvalData.ts ?? '');
    const channelVal = String(approvalData.channel ?? '');
    if (
      !tsVal ||
      !channelVal ||
      PLACEHOLDER_PATTERN.test(tsVal) ||
      PLACEHOLDER_PATTERN.test(channelVal)
    ) {
      const msg = `[opencode-harness] Invalid approval metadata detected — ts="${tsVal}", channel="${channelVal}". The model likely wrote placeholders instead of a real Slack ts/channel. Failing task.`;
      log.error({ taskId }, msg);
      throw new Error(msg);
    }
    extraMetadata = {
      ...approvalData,
      approval_message_ts: approvalData.ts,
      target_channel: approvalData.channel,
      ...(approvalData.conversationRef !== undefined && {
        conversation_ref: approvalData.conversationRef,
      }),
    };
    approvalJsonExists = true;
    log.info(
      { taskId },
      '[opencode-harness] Read approval metadata from /tmp/approval-message.json',
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[opencode-harness] Invalid')) {
      throw err; // re-throw validation errors
    }
    // not written — swallow file-not-found errors only
  }

  // Auto-post approval card if summary has NEEDS_APPROVAL but agent did not post a card
  if (!approvalJsonExists && content !== 'completed' && options?.onNeedsApproval) {
    const parsedOutput = parseStandardOutput(content);
    if (parsedOutput && isApprovalRequired(parsedOutput)) {
      if (options.approvalRequired === false) {
        log.info(
          { taskId },
          '[opencode-harness] Skipping auto-post approval card — approval not required',
        );
      } else {
        const autoMeta = await options.onNeedsApproval(parsedOutput);
        if (Object.keys(autoMeta).length > 0) {
          extraMetadata = autoMeta;
        }
      }
    }
  }

  return { content, extraMetadata };
}

/**
 * Like checkOutputFiles, but throws if neither file was written (no content produced).
 * Use this for the normal completion path after an OpenCode session finishes.
 */
export async function readOutputContract(
  taskId: string,
  options?: CheckOutputFilesOptions,
): Promise<OutputContractResult> {
  const result = await checkOutputFiles(taskId, options);
  if (result.content === 'completed' && Object.keys(result.extraMetadata).length === 0) {
    throw new Error(
      '[opencode-harness] Model did not produce content — /tmp/summary.txt and /tmp/approval-message.json were not written. This is a model reliability issue; retry the task.',
    );
  }
  return result;
}
