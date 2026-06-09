import { describe, it, expect } from 'vitest';
import {
  buildNotifyBlocks,
  buildNotifyStateBlocks,
  createTaskNotifyBuilders,
} from '../../../src/lib/slack-blocks.js';

describe('buildNotifyBlocks — runId in context block', () => {
  it('includes Run element when runId is provided', () => {
    const blocks = buildNotifyBlocks({
      state: 'Executing',
      archetypeName: 'test',
      taskId: 'task-123',
      runId: '01RUNID123',
    });
    const lastBlock = blocks[blocks.length - 1] as {
      type: string;
      elements: { type: string; text: string }[];
    };
    expect(lastBlock.type).toBe('context');
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Run `01RUNID123`' });
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Task `task-123`' });
  });

  it('omits Run element when runId is absent', () => {
    const blocks = buildNotifyBlocks({
      state: 'Ready',
      archetypeName: 'test',
      taskId: 'task-no-run',
    });
    const lastBlock = blocks[blocks.length - 1] as {
      type: string;
      elements: { type: string; text: string }[];
    };
    expect(lastBlock.type).toBe('context');
    expect(lastBlock.elements).toHaveLength(1);
    expect(lastBlock.elements[0]).toEqual({ type: 'mrkdwn', text: 'Task `task-no-run`' });
  });
});

describe('buildNotifyStateBlocks — runId in context block', () => {
  it('includes both Task and Run elements when runId is provided', () => {
    const blocks = buildNotifyStateBlocks({
      emoji: '✅',
      text: 'Done',
      taskId: 'task-456',
      runId: '01RUNID456',
    });
    const lastBlock = blocks[blocks.length - 1] as {
      type: string;
      elements: { type: string; text: string }[];
    };
    expect(lastBlock.type).toBe('context');
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Run `01RUNID456`' });
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Task `task-456`' });
  });
});

describe('createTaskNotifyBuilders — factory captures taskId and runId', () => {
  it('notifyBlocks result contains both Task and Run context elements without re-passing IDs', () => {
    const { notifyBlocks } = createTaskNotifyBuilders({ taskId: 'task-789', runId: '01RUNID789' });
    const blocks = notifyBlocks({ state: 'Ready', archetypeName: 'test' });
    const lastBlock = blocks[blocks.length - 1] as {
      type: string;
      elements: { type: string; text: string }[];
    };
    expect(lastBlock.type).toBe('context');
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Task `task-789`' });
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Run `01RUNID789`' });
  });

  it('notifyStateBlocks result contains both Task and Run context elements without re-passing IDs', () => {
    const { notifyStateBlocks } = createTaskNotifyBuilders({
      taskId: 'task-789',
      runId: '01RUNID789',
    });
    const blocks = notifyStateBlocks({ emoji: '⏳', text: 'Waiting' });
    const lastBlock = blocks[blocks.length - 1] as {
      type: string;
      elements: { type: string; text: string }[];
    };
    expect(lastBlock.type).toBe('context');
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Task `task-789`' });
    expect(lastBlock.elements).toContainEqual({ type: 'mrkdwn', text: 'Run `01RUNID789`' });
  });
});
