import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { WebClient } from '@slack/web-api';

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    conversations: {
      list: vi.fn().mockResolvedValue({ channels: [] }),
      history: vi.fn().mockResolvedValue({ messages: [] }),
      replies: vi.fn().mockResolvedValue({ messages: [] }),
    },
  })),
}));

type ReadChannelsModule = {
  isChannelId?: (entry: string) => boolean;
  resolveChannelNames?: (client: WebClient, entries: string[]) => Promise<string[]>;
};

let mod: ReadChannelsModule;

beforeAll(async () => {
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  process.argv = ['node', 'read-channels.ts'];
  process.env['SLACK_BOT_TOKEN'] = 'mock-token';

  mod = (await import('../../../../src/worker-tools/slack/read-channels.ts')) as ReadChannelsModule;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
});

afterAll(() => {
  vi.restoreAllMocks();
  delete process.env['SLACK_BOT_TOKEN'];
});

beforeEach(() => {
  vi.clearAllMocks();
});

function makeMockClient(channels: Array<{ id: string; name: string }> = []) {
  return {
    conversations: {
      list: vi.fn().mockResolvedValue({ channels }),
    },
  } as unknown as WebClient;
}

function listFn(client: WebClient) {
  return (client as unknown as { conversations: { list: ReturnType<typeof vi.fn> } }).conversations
    .list;
}

describe('read-channels — shape-based channel resolution', () => {
  it('passes channel IDs directly without calling conversations.list', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([]);
    const result = await mod.resolveChannelNames(client, ['C123ABC', 'G456DEF', 'DABC123']);
    expect(result).toEqual(['C123ABC', 'G456DEF', 'DABC123']);
    expect(listFn(client)).not.toHaveBeenCalled();
  });

  it('resolves plain channel name without # prefix', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([{ id: 'C123', name: 'general' }]);
    const result = await mod.resolveChannelNames(client, ['general']);
    expect(result).toEqual(['C123']);
    expect(listFn(client)).toHaveBeenCalledOnce();
  });

  it('resolves channel name with # prefix (strips # before lookup)', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([{ id: 'C456', name: 'ops' }]);
    const result = await mod.resolveChannelNames(client, ['#ops']);
    expect(result).toEqual(['C456']);
  });

  it('handles mixed IDs and names in the same --channels argument', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([
      { id: 'C200', name: 'general' },
      { id: 'C300', name: 'ops' },
    ]);
    const result = await mod.resolveChannelNames(client, ['C100ABC', 'general', '#ops']);
    expect(result).toEqual(['C100ABC', 'C200', 'C300']);
    expect(listFn(client)).toHaveBeenCalledOnce();
  });

  it('#general and general resolve identically', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const channels = [{ id: 'C999', name: 'general' }];
    const result1 = await mod.resolveChannelNames(makeMockClient(channels), ['general']);
    const result2 = await mod.resolveChannelNames(makeMockClient(channels), ['#general']);
    expect(result1).toEqual(['C999']);
    expect(result2).toEqual(['C999']);
  });

  it('handles unknown channel name gracefully without crashing', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([{ id: 'C123', name: 'general' }]);
    const result = await mod.resolveChannelNames(client, ['nonexistent-channel']);
    expect(result).toEqual([]);
    expect(process.stderr.write).toHaveBeenCalled();
  });

  it('matches channel names case-insensitively', async () => {
    if (!mod.resolveChannelNames) throw new Error('resolveChannelNames is not exported');
    const client = makeMockClient([{ id: 'C777', name: 'general' }]);
    const result = await mod.resolveChannelNames(client, ['General']);
    expect(result).toEqual(['C777']);
  });
});
