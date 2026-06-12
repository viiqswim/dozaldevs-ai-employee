import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInfo, mockWarn, mockError } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock('@composio/core', () => ({
  Composio: vi.fn(),
}));

vi.mock('../../../../src/lib/config.js', () => ({
  COMPOSIO_API_KEY: vi.fn(() => 'test-api-key'),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  })),
}));

import { Composio } from '@composio/core';
import {
  getComposioConnectionToken,
  ComposioNoConnectionError,
  ComposioMaskedTokenError,
  ComposioApiError,
} from '../../../../src/lib/composio/connection-token.js';

const mockList = vi.fn();
const mockGet = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (Composio as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    connectedAccounts: {
      list: mockList,
      get: mockGet,
    },
  }));
});

const TENANT_ID = 'tenant-abc';
const TOOLKIT = 'github';
const TOKEN = 'ghs_realtoken123';
const CONN_ID = 'conn-001';

function makeListResult(overrides?: Partial<{ id: string; status: string; slugField: string }>) {
  const { id = CONN_ID, status = 'active', slugField = 'toolkit' } = overrides ?? {};
  const item =
    slugField === 'toolkitSlug'
      ? { id, status, toolkitSlug: TOOLKIT }
      : { id, status, toolkit: { slug: TOOLKIT } };
  return { items: [item] };
}

function makeDetail(token: string, field: 'oauth_token' | 'access_token' = 'oauth_token') {
  return { state: { val: { [field]: token } } };
}

describe('getComposioConnectionToken', () => {
  describe('happy path', () => {
    it('returns oauth_token from active connection', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail(TOKEN, 'oauth_token'));

      const result = await getComposioConnectionToken(TENANT_ID, TOOLKIT);

      expect(result).toBe(TOKEN);
      expect(mockList).toHaveBeenCalledWith({
        user_id: `tenant_${TENANT_ID}`,
        toolkitSlug: TOOLKIT,
      });
      expect(mockGet).toHaveBeenCalledWith(CONN_ID);
    });

    it('falls back to access_token when oauth_token is absent', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail(TOKEN, 'access_token'));

      const result = await getComposioConnectionToken(TENANT_ID, TOOLKIT);

      expect(result).toBe(TOKEN);
    });

    it('accepts toolkitSlug field on item (alternate shape)', async () => {
      mockList.mockResolvedValue(makeListResult({ slugField: 'toolkitSlug' }));
      mockGet.mockResolvedValue(makeDetail(TOKEN));

      const result = await getComposioConnectionToken(TENANT_ID, TOOLKIT);

      expect(result).toBe(TOKEN);
    });

    it('matches toolkit slug case-insensitively', async () => {
      mockList.mockResolvedValue({
        items: [{ id: CONN_ID, status: 'active', toolkit: { slug: 'GITHUB' } }],
      });
      mockGet.mockResolvedValue(makeDetail(TOKEN));

      const result = await getComposioConnectionToken(TENANT_ID, 'github');

      expect(result).toBe(TOKEN);
    });
  });

  describe('no connection', () => {
    it('throws ComposioNoConnectionError when list returns empty', async () => {
      mockList.mockResolvedValue({ items: [] });

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioNoConnectionError,
      );
    });

    it('throws ComposioNoConnectionError when no item has matching toolkit', async () => {
      mockList.mockResolvedValue({
        items: [{ id: CONN_ID, status: 'active', toolkit: { slug: 'notion' } }],
      });

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioNoConnectionError,
      );
    });

    it('throws ComposioNoConnectionError when connection is not active', async () => {
      mockList.mockResolvedValue(makeListResult({ status: 'inactive' }));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioNoConnectionError,
      );
    });

    it('throws ComposioNoConnectionError when token fields are both absent', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue({ state: { val: {} } });

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioNoConnectionError,
      );
    });

    it('error message contains tenantId and toolkitSlug', async () => {
      mockList.mockResolvedValue({ items: [] });

      const err = await getComposioConnectionToken(TENANT_ID, TOOLKIT).catch((e) => e);

      expect(err).toBeInstanceOf(ComposioNoConnectionError);
      expect(err.message).toContain(TENANT_ID);
      expect(err.message).toContain(TOOLKIT);
      expect(err.tenantId).toBe(TENANT_ID);
      expect(err.toolkitSlug).toBe(TOOLKIT);
    });
  });

  describe('masked token', () => {
    it('throws ComposioMaskedTokenError when token ends with ...', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail('gho_abc...'));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioMaskedTokenError,
      );
    });

    it('throws ComposioMaskedTokenError when token contains ***', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail('ghp_***'));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioMaskedTokenError,
      );
    });

    it('throws ComposioMaskedTokenError when token contains [REDACTED]', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail('[REDACTED]'));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioMaskedTokenError,
      );
    });

    it('error message instructs to disable masking in Composio settings', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail('gho_abc...'));

      const err = await getComposioConnectionToken(TENANT_ID, TOOLKIT).catch((e) => e);

      expect(err).toBeInstanceOf(ComposioMaskedTokenError);
      expect(err.message).toContain('mask_secret_keys_in_connected_account: false');
      expect(err.toolkitSlug).toBe(TOOLKIT);
    });
  });

  describe('API failures', () => {
    it('throws ComposioApiError when list() throws', async () => {
      mockList.mockRejectedValue(new Error('network error'));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioApiError,
      );
    });

    it('throws ComposioApiError when get() throws', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockRejectedValue(new Error('timeout'));

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioApiError,
      );
    });

    it('throws ComposioApiError when COMPOSIO_API_KEY is empty', async () => {
      const { COMPOSIO_API_KEY } = await import('../../../../src/lib/config.js');
      (COMPOSIO_API_KEY as ReturnType<typeof vi.fn>).mockReturnValueOnce('');

      await expect(getComposioConnectionToken(TENANT_ID, TOOLKIT)).rejects.toThrow(
        ComposioApiError,
      );
      expect(mockList).not.toHaveBeenCalled();
    });

    it('ComposioApiError message contains toolkit name', async () => {
      mockList.mockRejectedValue(new Error('boom'));

      const err = await getComposioConnectionToken(TENANT_ID, TOOLKIT).catch((e) => e);

      expect(err).toBeInstanceOf(ComposioApiError);
      expect(err.message).toContain(TOOLKIT);
      expect(err.toolkitSlug).toBe(TOOLKIT);
    });
  });

  describe('token never logged', () => {
    it('logger.info does not receive the token value', async () => {
      mockList.mockResolvedValue(makeListResult());
      mockGet.mockResolvedValue(makeDetail(TOKEN));

      await getComposioConnectionToken(TENANT_ID, TOOLKIT);

      for (const call of mockInfo.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TOKEN);
      }
    });
  });
});
