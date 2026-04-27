import { describe, it, expect } from 'vitest';
import { resolveNotificationChannel } from '../../../src/gateway/services/notification-channel.js';

describe('resolveNotificationChannel', () => {
  it('returns archetype value when archetype has a notification_channel', () => {
    const result = resolveNotificationChannel(
      { notification_channel: 'C_ARCHETYPE' },
      { notification_channel: 'C_TENANT' },
    );
    expect(result).toBe('C_ARCHETYPE');
  });

  it('returns tenant value when archetype notification_channel is null', () => {
    const result = resolveNotificationChannel(
      { notification_channel: null },
      { notification_channel: 'C_TENANT' },
    );
    expect(result).toBe('C_TENANT');
  });

  it('returns empty string when both archetype and tenant values are absent', () => {
    const result = resolveNotificationChannel({ notification_channel: null }, {});
    expect(result).toBe('');
  });

  it('archetype value overrides tenant value when both are present', () => {
    const result = resolveNotificationChannel(
      { notification_channel: 'C_ARCHETYPE_OVERRIDE' },
      { notification_channel: 'C_TENANT_DEFAULT' },
    );
    expect(result).toBe('C_ARCHETYPE_OVERRIDE');
  });
});
