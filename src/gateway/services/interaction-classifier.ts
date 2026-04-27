import type { callLLM } from '../../lib/call-llm.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('interaction-classifier');

export type MentionIntent = 'feedback' | 'teaching' | 'question' | 'task';

export class InteractionClassifier {
  constructor(private readonly callLLMFn: typeof callLLM) {}

  async classifyIntent(
    text: string,
    archetypeContext?: { role_name: string },
  ): Promise<MentionIntent> {
    const systemPrompt = archetypeContext
      ? `You are ${archetypeContext.role_name}. Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only.`
      : 'Classify this interaction into exactly one category: feedback, teaching, question, task. Respond with one word only.';

    const result = await this.callLLMFn({
      model: 'anthropic/claude-haiku-4-5',
      taskType: 'review',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      maxTokens: 10,
      temperature: 0,
    });

    const intent = result.content.trim().toLowerCase();
    const validIntents: MentionIntent[] = ['feedback', 'teaching', 'question', 'task'];
    return validIntents.includes(intent as MentionIntent) ? (intent as MentionIntent) : 'question';
  }
}

function getPostgrestHeaders(): Record<string, string> {
  return {
    apikey: process.env.SUPABASE_ANON_KEY || '',
    Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY || ''}`,
    'Content-Type': 'application/json',
  };
}

export async function resolveArchetypeFromChannel(
  channelId: string,
  tenantId: string,
): Promise<{ id: string; role_name: string; notification_channel: string | null } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const headers = getPostgrestHeaders();

  try {
    const url1 = `${supabaseUrl}/rest/v1/archetypes?notification_channel=eq.${channelId}&tenant_id=eq.${tenantId}&select=id,role_name,notification_channel&limit=1`;
    const res1 = await fetch(url1, { headers });
    const data1 = (await res1.json()) as Array<{
      id: string;
      role_name: string;
      notification_channel: string | null;
    }>;

    if (data1.length > 0) {
      return data1[0];
    }

    const url2 = `${supabaseUrl}/rest/v1/archetypes?tenant_id=eq.${tenantId}&select=id,role_name,notification_channel&order=created_at.asc&limit=1`;
    const res2 = await fetch(url2, { headers });
    const data2 = (await res2.json()) as Array<{
      id: string;
      role_name: string;
      notification_channel: string | null;
    }>;

    if (data2.length > 0) {
      return data2[0];
    }

    return null;
  } catch (err) {
    log.warn({ channelId, tenantId, err }, 'Failed to resolve archetype from channel');
    return null;
  }
}

export async function resolveArchetypeFromTask(
  taskId: string,
): Promise<{ id: string; role_name: string; tenantId: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const headers = getPostgrestHeaders();

  try {
    const taskUrl = `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=tenant_id,archetype_id`;
    const taskRes = await fetch(taskUrl, { headers });
    const tasks = (await taskRes.json()) as Array<{
      tenant_id: string;
      archetype_id: string | null;
    }>;

    if (!tasks[0] || !tasks[0].archetype_id) {
      return null;
    }

    const { tenant_id: tenantId, archetype_id: archetypeId } = tasks[0];

    const archUrl = `${supabaseUrl}/rest/v1/archetypes?id=eq.${archetypeId}&select=id,role_name`;
    const archRes = await fetch(archUrl, { headers });
    const archetypes = (await archRes.json()) as Array<{ id: string; role_name: string }>;

    if (!archetypes[0]) {
      return null;
    }

    return {
      id: archetypes[0].id,
      role_name: archetypes[0].role_name,
      tenantId,
    };
  } catch (err) {
    log.warn({ taskId, err }, 'Failed to resolve archetype from task');
    return null;
  }
}
