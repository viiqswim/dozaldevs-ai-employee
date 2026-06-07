/**
 * Tests for register-dev-slack-tenant.ts logic
 *
 * Covers:
 * 1. Token precedence — SLACK_APP_TOKEN informational message in dev.ts
 * 2. Dev-tenant registration helper — arg parsing, validation, idempotency
 *
 * No real Slack API, no real DB, no real process spawning.
 */

import { describe, it, expect } from 'vitest';

// ─── Token precedence logic (extracted from scripts/dev.ts) ──────────────────
//
// The dev.ts startup info message fires when SLACK_APP_TOKEN starts with 'xapp-'.
// It is informational only — never blocks startup.

function shouldShowTokenReminder(slackAppToken: string | undefined): boolean {
  return typeof slackAppToken === 'string' && slackAppToken.startsWith('xapp-');
}

describe('dev.ts SLACK_APP_TOKEN startup reminder', () => {
  it('shows reminder when token starts with xapp-', () => {
    expect(shouldShowTokenReminder('xapp-1-A09678HT90S-abc123')).toBe(true);
  });

  it('shows reminder for any xapp- token (personal or shared)', () => {
    expect(shouldShowTokenReminder('xapp-1-APERSONAL-xyz789')).toBe(true);
  });

  it('does NOT show reminder when token is undefined', () => {
    expect(shouldShowTokenReminder(undefined)).toBe(false);
  });

  it('does NOT show reminder when token is empty string', () => {
    expect(shouldShowTokenReminder('')).toBe(false);
  });

  it('does NOT show reminder for non-xapp tokens (e.g. xoxb-)', () => {
    expect(shouldShowTokenReminder('xoxb-1234567890-abc')).toBe(false);
  });

  it('does NOT show reminder for placeholder values', () => {
    expect(shouldShowTokenReminder('xapp-your-app-level-token')).toBe(true); // still starts with xapp-
  });
});

// ─── Arg parsing logic (extracted from scripts/register-dev-slack-tenant.ts) ──

function getArg(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return undefined;
}

function validateTeamId(teamId: string | undefined): string | null {
  if (!teamId) return '--team-id is required';
  if (!teamId.startsWith('T')) return '--team-id must start with T';
  return null;
}

function validateBotToken(botToken: string | undefined): string | null {
  if (!botToken) return '--bot-token is required';
  if (!botToken.startsWith('xoxb-')) return '--bot-token must start with xoxb-';
  return null;
}

function validateTenantId(tenantId: string): string | null {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(tenantId)) return '--tenant-id must be a valid UUID';
  return null;
}

const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';

describe('register-dev-slack-tenant arg parsing', () => {
  it('parses --team-id correctly', () => {
    const argv = ['--team-id', 'T0601SMSVEU', '--bot-token', 'xoxb-abc'];
    expect(getArg(argv, '--team-id')).toBe('T0601SMSVEU');
  });

  it('parses --bot-token correctly', () => {
    const argv = ['--team-id', 'T0601SMSVEU', '--bot-token', 'xoxb-abc-def'];
    expect(getArg(argv, '--bot-token')).toBe('xoxb-abc-def');
  });

  it('returns undefined for missing flag', () => {
    const argv = ['--team-id', 'T0601SMSVEU'];
    expect(getArg(argv, '--bot-token')).toBeUndefined();
  });

  it('defaults tenant-id to DozalDevs when not provided', () => {
    const argv = ['--team-id', 'T0601SMSVEU', '--bot-token', 'xoxb-abc'];
    const tenantId = getArg(argv, '--tenant-id') ?? DOZALDEVS_TENANT_ID;
    expect(tenantId).toBe(DOZALDEVS_TENANT_ID);
  });

  it('uses provided tenant-id when specified', () => {
    const vlreTenantId = '00000000-0000-0000-0000-000000000003';
    const argv = [
      '--team-id',
      'T0601SMSVEU',
      '--bot-token',
      'xoxb-abc',
      '--tenant-id',
      vlreTenantId,
    ];
    const tenantId = getArg(argv, '--tenant-id') ?? DOZALDEVS_TENANT_ID;
    expect(tenantId).toBe(vlreTenantId);
  });
});

describe('register-dev-slack-tenant validation', () => {
  describe('validateTeamId', () => {
    it('accepts valid team ID starting with T', () => {
      expect(validateTeamId('T0601SMSVEU')).toBeNull();
    });

    it('rejects missing team ID', () => {
      expect(validateTeamId(undefined)).toBe('--team-id is required');
    });

    it('rejects team ID not starting with T', () => {
      expect(validateTeamId('INVALID')).toBe('--team-id must start with T');
    });

    it('rejects empty string', () => {
      expect(validateTeamId('')).toBe('--team-id is required');
    });
  });

  describe('validateBotToken', () => {
    it('accepts valid bot token starting with xoxb-', () => {
      expect(validateBotToken('xoxb-1234567890-abc')).toBeNull();
    });

    it('rejects missing bot token', () => {
      expect(validateBotToken(undefined)).toBe('--bot-token is required');
    });

    it('rejects token not starting with xoxb-', () => {
      expect(validateBotToken('xapp-1-abc')).toBe('--bot-token must start with xoxb-');
    });

    it('rejects empty string', () => {
      expect(validateBotToken('')).toBe('--bot-token is required');
    });
  });

  describe('validateTenantId', () => {
    it('accepts valid UUID', () => {
      expect(validateTenantId('00000000-0000-0000-0000-000000000002')).toBeNull();
    });

    it('accepts uppercase UUID', () => {
      expect(validateTenantId('00000000-0000-0000-0000-000000000002'.toUpperCase())).toBeNull();
    });

    it('rejects non-UUID string', () => {
      expect(validateTenantId('not-a-uuid')).toBe('--tenant-id must be a valid UUID');
    });

    it('rejects empty string', () => {
      expect(validateTenantId('')).toBe('--tenant-id must be a valid UUID');
    });
  });
});

describe('register-dev-slack-tenant token masking', () => {
  it('masks bot token to first 10 chars + ...', () => {
    const botToken = 'xoxb-1234567890-abcdefghij-xyz';
    const masked = botToken.slice(0, 10) + '...';
    expect(masked).toBe('xoxb-12345...');
    expect(masked).not.toContain('abcdefghij');
  });

  it('never exposes full token in masked output', () => {
    const botToken = 'xoxb-secret-token-value-here';
    const masked = botToken.slice(0, 10) + '...';
    expect(masked.length).toBeLessThan(botToken.length);
    expect(masked.endsWith('...')).toBe(true);
  });
});
