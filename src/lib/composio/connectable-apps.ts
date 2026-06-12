import { Composio } from '@composio/core';
import { COMPOSIO_API_KEY } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('composio:connectable-apps');

/**
 * Returns the set of Composio toolkit slugs that have an auth config set up
 * (i.e. the platform supports OAuth for those apps).
 *
 * "Connectable" is a global concept — it means the platform has configured
 * Composio OAuth for that app. It is NOT tenant-scoped.
 * "Connected" (tenant-scoped) is a separate concept tracked in composio_connections.
 *
 * Caching is the caller's responsibility — this function always fetches fresh data.
 */
export async function getConnectableToolkits(): Promise<Set<string>> {
  const apiKey = COMPOSIO_API_KEY();
  if (!apiKey) {
    logger.warn('COMPOSIO_API_KEY is not set — returning empty connectable set');
    return new Set();
  }

  const composio = new Composio({ apiKey }) as unknown as Pick<Composio, 'authConfigs'>;
  const authConfigs = await composio.authConfigs.list();

  const slugs = new Set<string>();
  for (const ac of authConfigs.items) {
    const slug = (ac as { toolkit?: { slug?: string } }).toolkit?.slug;
    if (slug) slugs.add(slug.toLowerCase());
  }

  return slugs;
}
