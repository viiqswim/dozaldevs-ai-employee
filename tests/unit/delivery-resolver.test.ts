import { describe, it, expect } from 'vitest';
import { resolveDelivery } from '../../src/lib/delivery-resolver.js';

const baseArchetype = {
  delivery_steps: null as string | null,
  delivery_instructions: null as string | null,
  deliverable_type: null as string | null,
};

describe('resolveDelivery', () => {
  describe('case (a): delivery_steps non-empty → has-delivery with delivery_steps content', () => {
    it('returns has-delivery when delivery_steps is set', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: 'Post the result to the configured channel.',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Post the result to the configured channel.',
      });
    });

    it('uses delivery_steps content over delivery_instructions when both are set', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: 'Step-based delivery instructions.',
        delivery_instructions: 'Legacy delivery instructions.',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Step-based delivery instructions.',
      });
    });

    it('returns has-delivery regardless of classification when delivery_steps is set', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: 'Deliver the output.',
      };
      const result = resolveDelivery(archetype, 'NO_ACTION_NEEDED');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Deliver the output.',
      });
    });
  });

  describe('case (b): delivery_steps null but delivery_instructions non-empty → has-delivery (transition tolerance)', () => {
    it('falls back to delivery_instructions when delivery_steps is null', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: null,
        delivery_instructions: 'Legacy: send the summary to the team channel.',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Legacy: send the summary to the team channel.',
      });
    });

    it('falls back to delivery_instructions when delivery_steps is empty string', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: '',
        delivery_instructions: 'Legacy delivery path.',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Legacy delivery path.',
      });
    });
  });

  describe('case (c): delivery_steps empty + deliverable_type set + classification NOT NO_ACTION_NEEDED → misconfigured', () => {
    it('returns misconfigured when deliverable_type is set but no delivery content', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: null,
        delivery_instructions: null,
        deliverable_type: 'slack_message',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({ kind: 'misconfigured' });
    });

    it('returns misconfigured with undefined classification when deliverable_type is set', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: null,
        delivery_instructions: null,
        deliverable_type: 'report',
      };
      const result = resolveDelivery(archetype, undefined);
      expect(result).toEqual({ kind: 'misconfigured' });
    });
  });

  describe('case (d): no delivery content + NO_ACTION_NEEDED + no deliverable_type → no-delivery-escape-hatch', () => {
    it('returns no-delivery-escape-hatch when classification is NO_ACTION_NEEDED and no delivery config', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: null,
        delivery_instructions: null,
        deliverable_type: null,
      };
      const result = resolveDelivery(archetype, 'NO_ACTION_NEEDED');
      expect(result).toEqual({ kind: 'no-delivery-escape-hatch' });
    });

    it('returns no-delivery-escape-hatch when all delivery fields are absent', () => {
      const result = resolveDelivery({ ...baseArchetype }, 'NO_ACTION_NEEDED');
      expect(result).toEqual({ kind: 'no-delivery-escape-hatch' });
    });
  });

  describe('case (e): delivery_steps set + NEEDS_APPROVAL → has-delivery (not misconfigured)', () => {
    it('resolves to has-delivery when delivery_steps is set even when deliverable_type is also set', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: 'Publish the result to the output channel.',
        deliverable_type: 'slack_message',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Publish the result to the output channel.',
      });
    });

    it('delivery_steps presence wins over deliverable_type-only misconfigured path', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: 'Send the output to the team.',
        delivery_instructions: null,
        deliverable_type: 'report',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Send the output to the team.',
      });
    });
  });

  describe('edge cases', () => {
    it('treats whitespace-only delivery_steps as empty and falls back to delivery_instructions', () => {
      const archetype = {
        ...baseArchetype,
        delivery_steps: '   ',
        delivery_instructions: 'Fallback delivery.',
      };
      const result = resolveDelivery(archetype, 'NEEDS_APPROVAL');
      expect(result).toEqual({
        kind: 'has-delivery',
        content: 'Fallback delivery.',
      });
    });

    it('returns no-delivery-escape-hatch when all fields null and classification undefined', () => {
      const result = resolveDelivery({ ...baseArchetype }, undefined);
      expect(result).toEqual({ kind: 'no-delivery-escape-hatch' });
    });
  });
});
