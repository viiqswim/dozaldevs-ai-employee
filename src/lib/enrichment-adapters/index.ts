import type { EnrichmentAdapter } from '../types/notification-enrichment.js';

const adapters: Record<string, EnrichmentAdapter> = {};

export function registerAdapter(name: string, adapter: EnrichmentAdapter): void {
  adapters[name] = adapter;
}

export function getAdapter(name: string): EnrichmentAdapter | undefined {
  return adapters[name];
}
