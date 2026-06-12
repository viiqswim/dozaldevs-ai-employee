import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@composio/core', () => {
  return {
    Composio: vi.fn(),
  };
});

vi.mock('../../../../src/lib/config.js', () => ({
  COMPOSIO_API_KEY: vi.fn(() => 'test-api-key'),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { Composio } from '@composio/core';
import { getConnectableToolkits } from '../../../../src/lib/composio/connectable-apps.js';

const mockAuthConfigsList = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Composio as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    authConfigs: {
      list: mockAuthConfigsList,
    },
  }));
});

describe('getConnectableToolkits', () => {
  it('returns a Set of toolkit slugs from authConfigs.list()', async () => {
    mockAuthConfigsList.mockResolvedValue({
      items: [
        { toolkit: { slug: 'notion' } },
        { toolkit: { slug: 'gmail' } },
        { toolkit: { slug: 'linear' } },
      ],
    });

    const result = await getConnectableToolkits();

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has('notion')).toBe(true);
    expect(result.has('gmail')).toBe(true);
    expect(result.has('linear')).toBe(true);
  });

  it('lowercases all slugs', async () => {
    mockAuthConfigsList.mockResolvedValue({
      items: [{ toolkit: { slug: 'NOTION' } }, { toolkit: { slug: 'Gmail' } }],
    });

    const result = await getConnectableToolkits();

    expect(result.has('notion')).toBe(true);
    expect(result.has('gmail')).toBe(true);
    expect(result.has('NOTION')).toBe(false);
  });

  it('skips items with no toolkit slug', async () => {
    mockAuthConfigsList.mockResolvedValue({
      items: [{ toolkit: { slug: 'notion' } }, { toolkit: null }, { toolkit: {} }, {}],
    });

    const result = await getConnectableToolkits();

    expect(result.size).toBe(1);
    expect(result.has('notion')).toBe(true);
  });

  it('returns empty set when COMPOSIO_API_KEY is not set', async () => {
    const { COMPOSIO_API_KEY } = await import('../../../../src/lib/config.js');
    (COMPOSIO_API_KEY as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await getConnectableToolkits();

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
    expect(mockAuthConfigsList).not.toHaveBeenCalled();
  });
});
