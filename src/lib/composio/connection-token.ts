import { Composio } from '@composio/core';
import { COMPOSIO_API_KEY } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('composio:connection-token');

export class ComposioNoConnectionError extends Error {
  readonly tenantId: string;
  readonly toolkitSlug: string;

  constructor(tenantId: string, toolkitSlug: string) {
    super(`No active Composio connection found for toolkit ${toolkitSlug} on tenant ${tenantId}`);
    this.name = 'ComposioNoConnectionError';
    this.tenantId = tenantId;
    this.toolkitSlug = toolkitSlug;
  }
}

export class ComposioMaskedTokenError extends Error {
  readonly toolkitSlug: string;

  constructor(toolkitSlug: string) {
    super(
      `Composio token masking is enabled for toolkit ${toolkitSlug}. Disable it in the Composio project settings (mask_secret_keys_in_connected_account: false).`,
    );
    this.name = 'ComposioMaskedTokenError';
    this.toolkitSlug = toolkitSlug;
  }
}

export class ComposioApiError extends Error {
  readonly toolkitSlug: string;

  constructor(toolkitSlug: string, cause: unknown) {
    super(`Composio API failure while fetching token for toolkit ${toolkitSlug}: ${String(cause)}`);
    this.name = 'ComposioApiError';
    this.toolkitSlug = toolkitSlug;
    this.cause = cause;
  }
}

interface ConnectedAccountItem {
  id?: string;
  status?: string;
  toolkit?: { slug?: string };
  toolkitSlug?: string;
}

interface ConnectedAccountListResult {
  items: ConnectedAccountItem[];
}

interface ConnectedAccountDetail {
  state?: {
    val?: {
      oauth_token?: string;
      access_token?: string;
    };
  };
}

function isMaskedToken(token: string): boolean {
  return (
    token.endsWith('...') ||
    token.includes('***') ||
    token.includes('REDACTED') ||
    token.length < 10
  );
}

export async function getComposioConnectionToken(
  tenantId: string,
  toolkitSlug: string,
): Promise<string> {
  const apiKey = COMPOSIO_API_KEY();
  if (!apiKey) {
    throw new ComposioApiError(toolkitSlug, new Error('COMPOSIO_API_KEY is not set'));
  }

  const userId = `tenant_${tenantId}`;
  const composio = new Composio({ apiKey }) as unknown as {
    connectedAccounts: {
      list: (opts: {
        user_id: string;
        toolkitSlug?: string;
      }) => Promise<ConnectedAccountListResult>;
      get: (id: string) => Promise<ConnectedAccountDetail>;
    };
  };

  let listResult: ConnectedAccountListResult;
  try {
    listResult = await composio.connectedAccounts.list({
      user_id: userId,
      toolkitSlug,
    });
  } catch (err) {
    throw new ComposioApiError(toolkitSlug, err);
  }

  const activeConnection = listResult.items.find((item) => {
    const hasMatchingToolkit =
      (item.toolkit?.slug?.toLowerCase() ?? '') === toolkitSlug.toLowerCase() ||
      (item.toolkitSlug?.toLowerCase() ?? '') === toolkitSlug.toLowerCase();
    const isActive = item.status?.toLowerCase() === 'active';
    return hasMatchingToolkit && isActive;
  });

  if (!activeConnection?.id) {
    throw new ComposioNoConnectionError(tenantId, toolkitSlug);
  }

  let detail: ConnectedAccountDetail;
  try {
    detail = await composio.connectedAccounts.get(activeConnection.id);
  } catch (err) {
    throw new ComposioApiError(toolkitSlug, err);
  }

  const tokenValue = detail.state?.val?.oauth_token ?? detail.state?.val?.access_token;

  if (!tokenValue) {
    throw new ComposioNoConnectionError(tenantId, toolkitSlug);
  }

  if (isMaskedToken(tokenValue)) {
    throw new ComposioMaskedTokenError(toolkitSlug);
  }

  logger.info({ tenantId, toolkitSlug }, 'Composio connection token fetched successfully');

  return tokenValue;
}
