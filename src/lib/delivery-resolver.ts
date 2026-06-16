/**
 * Shared delivery resolver — single source of truth for determining whether a
 * task archetype has a valid delivery path configured.
 *
 * Priority order:
 *   1. delivery_steps (canonical field) — non-empty after trim → has-delivery
 *   2. delivery_instructions (legacy field, transition tolerance) — non-empty after trim → has-delivery
 *   3. deliverable_type set + classification is not NO_ACTION_NEEDED → misconfigured
 *   4. else → no-delivery-escape-hatch
 */

export type DeliveryResolution =
  | { kind: 'has-delivery'; content: string }
  | { kind: 'misconfigured' }
  | { kind: 'no-delivery-escape-hatch' };

export interface DeliveryArchetypeFields {
  delivery_steps: string | null;
  delivery_instructions?: string | null;
  deliverable_type: string | null;
}

/**
 * Resolve the delivery strategy for a given archetype and output classification.
 *
 * @param archetype - Archetype fields relevant to delivery configuration.
 * @param classification - The output classification from the worker ('NEEDS_APPROVAL' | 'NO_ACTION_NEEDED' | undefined).
 * @returns A discriminated union describing how delivery should proceed.
 */
export function resolveDelivery(
  archetype: DeliveryArchetypeFields,
  classification: string | undefined,
): DeliveryResolution {
  const deliverySteps = archetype.delivery_steps?.trim() ?? '';
  const deliveryInstructions = archetype.delivery_instructions?.trim() ?? '';

  // 1. Canonical field: delivery_steps
  if (deliverySteps.length > 0) {
    return { kind: 'has-delivery', content: archetype.delivery_steps as string };
  }

  // 2. Legacy field (transition tolerance): delivery_instructions
  if (deliveryInstructions.length > 0) {
    return { kind: 'has-delivery', content: archetype.delivery_instructions as string };
  }

  // 3. Deliverable type set but no delivery content and not a benign NO_ACTION_NEEDED
  if (archetype.deliverable_type != null && classification !== 'NO_ACTION_NEEDED') {
    return { kind: 'misconfigured' };
  }

  // 4. No delivery configured — valid escape hatch (e.g. NO_ACTION_NEEDED with no deliverable_type)
  return { kind: 'no-delivery-escape-hatch' };
}
