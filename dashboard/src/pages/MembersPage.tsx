import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, UserPlus } from 'lucide-react';
import { useTenant } from '@/hooks/use-tenant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listMembers,
  changeMemberRole,
  removeMember,
  inviteMember,
  listInvitations,
  revokeInvitation,
  type MemberInfo,
  type InvitationInfo,
} from '@/lib/gateway';

const ROLE_OPTIONS = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MEMBER', label: 'Member' },
  { value: 'VIEWER', label: 'Viewer' },
];

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'OWNER':
      return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300';
    case 'ADMIN':
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300';
    case 'MEMBER':
      return 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function MembersPage() {
  const { tenantId, tenants } = useTenant();
  const currentTenantRole = tenants.find((t) => t.tenantId === tenantId)?.tenantRole ?? '';
  const isAdmin = currentTenantRole === 'OWNER' || currentTenantRole === 'ADMIN';

  const [members, setMembers] = useState<MemberInfo[] | null>(null);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<Error | null>(null);

  const [invitations, setInvitations] = useState<InvitationInfo[] | null>(null);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationsError, setInvitationsError] = useState<Error | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);

  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [revokingInvite, setRevokingInvite] = useState<string | null>(null);

  const loadMembers = useCallback(() => {
    if (!tenantId) return;
    setMembersLoading(true);
    setMembersError(null);
    listMembers(tenantId)
      .then(setMembers)
      .catch((err: unknown) => setMembersError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setMembersLoading(false));
  }, [tenantId]);

  const loadInvitations = useCallback(() => {
    if (!tenantId) return;
    setInvitationsLoading(true);
    setInvitationsError(null);
    listInvitations(tenantId)
      .then(setInvitations)
      .catch((err: unknown) =>
        setInvitationsError(err instanceof Error ? err : new Error(String(err))),
      )
      .finally(() => setInvitationsLoading(false));
  }, [tenantId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleChangeRole = async (userId: string, role: string) => {
    if (!tenantId) return;
    setChangingRole(userId);
    try {
      await changeMemberRole(tenantId, userId, role);
      toast.success('Role updated');
      loadMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setChangingRole(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!tenantId) return;
    setRemovingMember(userId);
    try {
      await removeMember(tenantId, userId);
      toast.success('Member removed');
      loadMembers();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('LAST_OWNER')) {
        toast.error("Can't remove the last owner");
      } else {
        toast.error(msg || 'Failed to remove member');
      }
    } finally {
      setRemovingMember(null);
    }
  };

  const handleInvite = async () => {
    if (!tenantId || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await inviteMember(tenantId, inviteEmail.trim(), inviteRole);
      toast.success('Invitation sent');
      setInviteEmail('');
      setInviteRole('MEMBER');
      loadInvitations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!tenantId) return;
    setRevokingInvite(invitationId);
    try {
      await revokeInvitation(tenantId, invitationId);
      toast.success('Invitation revoked');
      loadInvitations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setRevokingInvite(null);
    }
  };

  const colCount = isAdmin ? 6 : 4;

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border bg-card px-5 py-4">
        <h2 className="text-xl font-semibold">Organization Members</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage who has access to this organization and what they can do.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Members</h3>
        </div>
        {membersLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading members…
          </div>
        ) : membersError ? (
          <div className="px-5 py-6">
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">Failed to load members</p>
              <p className="mt-1 text-destructive/80">{membersError.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                onClick={loadMembers}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                {isAdmin && <TableHead className="w-[160px]">Change Role</TableHead>}
                {isAdmin && <TableHead className="w-[80px] text-right">Remove</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colCount}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No members found.
                  </TableCell>
                </TableRow>
              ) : (
                (members ?? []).map((member) => (
                  <TableRow key={member.userId}>
                    <TableCell className="text-sm font-medium">{member.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleBadgeClass(member.tenantRole)}>
                        {roleLabel(member.tenantRole)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(String(member.joinedAt))}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <SearchableSelect
                          options={ROLE_OPTIONS}
                          value={member.tenantRole}
                          onValueChange={(role) => void handleChangeRole(member.userId, role)}
                          disabled={changingRole === member.userId}
                          className="w-36"
                        />
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleRemoveMember(member.userId)}
                            disabled={removingMember === member.userId}
                            aria-label={`Remove ${member.email}`}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {isAdmin && (
        <div className="rounded-lg border bg-card px-5 py-4">
          <h3 className="text-sm font-semibold mb-3">Invite a New Member</h3>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email address</label>
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={inviting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleInvite();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <SearchableSelect
                options={ROLE_OPTIONS}
                value={inviteRole}
                onValueChange={setInviteRole}
                placeholder="Select role"
                disabled={inviting}
                className="w-36"
              />
            </div>
            <Button onClick={() => void handleInvite()} disabled={inviting || !inviteEmail.trim()}>
              <UserPlus className="mr-2 h-4 w-4" />
              Send Invite
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Pending Invitations</h3>
        </div>
        {invitationsLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading invitations…
          </div>
        ) : invitationsError ? (
          <div className="px-5 py-6">
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">Failed to load invitations</p>
              <p className="mt-1 text-destructive/80">{invitationsError.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                onClick={loadInvitations}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (invitations ?? []).length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No pending invitations.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                {isAdmin && <TableHead className="w-[80px] text-right">Revoke</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invitations ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-sm font-medium">{inv.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleBadgeClass(inv.role)}>
                      {roleLabel(inv.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(inv.expiresAt)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleRevokeInvitation(inv.id)}
                          disabled={revokingInvite === inv.id}
                          aria-label={`Revoke invitation for ${inv.email}`}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
