export interface InvitationEmailParams {
  acceptUrl: string;
  organizationName: string;
  inviterName?: string;
  role: string;
}

export interface InvitationEmailResult {
  subject: string;
  html: string;
  text: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

function toRoleLabel(role: string): string {
  return (
    ROLE_LABELS[role.toUpperCase()] ?? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
  );
}

export function buildInvitationEmail(params: InvitationEmailParams): InvitationEmailResult {
  const { acceptUrl, organizationName, inviterName, role } = params;
  const rolePlain = toRoleLabel(role);

  const subject = `You've been invited to join ${organizationName}`;

  const inviterClause = inviterName
    ? `${inviterName} has invited you to join`
    : 'You have been invited to join';

  const html = `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #1a1a1a;">You've been invited to join ${organizationName}</h2>
  <p>${inviterClause} <strong>${organizationName}</strong> as a <strong>${rolePlain}</strong>.</p>
  <p>Click the button below to accept your invitation:</p>
  <a href="${acceptUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept invitation</a>
  <p style="color: #666; font-size: 14px; margin-top: 24px;">This invitation expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
  <p style="color: #999; font-size: 12px;">Or copy this link: ${acceptUrl}</p>
</body>
</html>`;

  const text = `You've been invited to join ${organizationName}

${inviterClause} ${organizationName} as a ${rolePlain}.

Accept your invitation:
${acceptUrl}

This invitation expires in 7 days.

If you did not expect this invitation, you can safely ignore this email.`;

  return { subject, html, text };
}
