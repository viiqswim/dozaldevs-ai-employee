export interface DeliveryContext {
  deliverableContent: string;
  metadata: Record<string, unknown>;
  taskId: string;
  deliveryInstructions: string;
}

/**
 * Returns a complete deliveryPrompt string, or null to fall back to the default
 * `--- DELIVERABLE CONTENT ---` template in the harness.
 */
export type DeliveryAdapter = (ctx: DeliveryContext) => string | null;

const adapters: Record<string, DeliveryAdapter> = {};

export function registerDeliveryAdapter(name: string, fn: DeliveryAdapter): void {
  adapters[name] = fn;
}

export function getDeliveryAdapter(name: string): DeliveryAdapter | undefined {
  return adapters[name];
}
