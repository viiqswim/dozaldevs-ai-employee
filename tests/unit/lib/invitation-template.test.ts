import { describe, it, expect } from 'vitest';
import { buildInvitationEmail } from '../../../src/lib/email/templates/invitation.js';

describe('buildInvitationEmail', () => {
  const base = {
    acceptUrl: 'https://app.example.com/dashboard/accept-invite?token=abc123',
    organizationName: 'Acme Corp',
    role: 'MEMBER',
    inviterName: 'Jane Doe',
  };

  it('returns subject, html, and text fields', () => {
    const result = buildInvitationEmail(base);
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
    expect(result).toHaveProperty('text');
    expect(typeof result.subject).toBe('string');
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
  });

  it('includes the acceptUrl in the html', () => {
    const result = buildInvitationEmail(base);
    expect(result.html).toContain(base.acceptUrl);
  });

  it('includes the acceptUrl in the text', () => {
    const result = buildInvitationEmail(base);
    expect(result.text).toContain(base.acceptUrl);
  });

  it('includes the organizationName in subject, html, and text', () => {
    const result = buildInvitationEmail(base);
    expect(result.subject).toContain('Acme Corp');
    expect(result.html).toContain('Acme Corp');
    expect(result.text).toContain('Acme Corp');
  });

  it('renders the role as a human-readable label', () => {
    const result = buildInvitationEmail({ ...base, role: 'MEMBER' });
    expect(result.html).toContain('Member');
    expect(result.html).not.toContain('MEMBER');
    expect(result.text).toContain('Member');
  });

  it('maps each known role to its title-case label', () => {
    expect(buildInvitationEmail({ ...base, role: 'OWNER' }).html).toContain('Owner');
    expect(buildInvitationEmail({ ...base, role: 'ADMIN' }).html).toContain('Admin');
    expect(buildInvitationEmail({ ...base, role: 'VIEWER' }).html).toContain('Viewer');
  });

  it('normalizes an unknown role to title case', () => {
    const result = buildInvitationEmail({ ...base, role: 'custom' });
    expect(result.html).toContain('Custom');
  });

  it('includes the inviterName when provided', () => {
    const result = buildInvitationEmail(base);
    expect(result.html).toContain('Jane Doe');
    expect(result.text).toContain('Jane Doe');
  });

  it('renders gracefully without an inviterName', () => {
    const result = buildInvitationEmail({
      acceptUrl: base.acceptUrl,
      organizationName: base.organizationName,
      role: base.role,
    });
    expect(result.html).toContain('You have been invited to join');
    expect(result.html).not.toContain('undefined');
    expect(result.text).not.toContain('undefined');
  });
});
