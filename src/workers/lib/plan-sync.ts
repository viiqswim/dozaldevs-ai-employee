import { readFile, writeFile } from 'node:fs/promises';
import type { Logger } from '../../lib/logger.js';
import type { WaveStateArray } from '../config/long-running.js';
import type { PostgRESTClient } from './postgrest-client.js';

export interface PlanSyncOptions {
  postgrestClient: PostgRESTClient;
  logger: Logger;
  diskPath: string;
}

export class PlanSync {
  private readonly postgrestClient: PostgRESTClient;
  private readonly logger: Logger;
  private readonly diskPath: string;

  constructor(opts: PlanSyncOptions) {
    this.postgrestClient = opts.postgrestClient;
    this.logger = opts.logger;
    this.diskPath = opts.diskPath;
  }

  async savePlanAfterPhase1(opts: { taskId: string; planContent: string }): Promise<void> {
    const { taskId, planContent } = opts;

    await writeFile(this.diskPath, planContent, 'utf8');

    const result = await this.postgrestClient.patch('tasks', `id=eq.${taskId}`, {
      plan_content: planContent,
      plan_generated_at: new Date().toISOString(),
    });

    if (result === null) {
      throw new Error(`Failed to persist plan to Supabase for task ${taskId}`);
    }
  }

  async loadPlanOnRestart(
    taskId: string,
  ): Promise<{ planContent: string; source: 'disk' | 'supabase' } | null> {
    try {
      const planContent = await readFile(this.diskPath, 'utf8');
      return { planContent, source: 'disk' };
    } catch {
      this.logger.info(`[plan-sync] Disk read failed for task ${taskId}, falling back to Supabase`);
    }

    const result = await this.postgrestClient.get('tasks', `id=eq.${taskId}&select=plan_content`);

    if (result !== null && result.length > 0) {
      const row = result[0] as Record<string, unknown>;
      const planContent = row['plan_content'];
      if (typeof planContent === 'string' && planContent.length > 0) {
        await writeFile(this.diskPath, planContent, 'utf8');
        return { planContent, source: 'supabase' };
      }
    }

    return null;
  }

  async updateWaveState(opts: {
    executionId: string;
    waveNumber: number;
    waveState: WaveStateArray;
  }): Promise<void> {
    const { executionId, waveNumber, waveState } = opts;
    await this.postgrestClient.patch('executions', `id=eq.${executionId}`, {
      wave_number: waveNumber,
      wave_state: waveState as unknown as Record<string, unknown>,
    });
  }
}
