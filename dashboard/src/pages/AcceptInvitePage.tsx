import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  getInvitationByToken,
  setInvitationPassword,
  acceptInvitation,
  declineInvitation,
  type InvitationLookupResult,
} from '../lib/gateway';

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [invitation, setInvitation] = useState<InvitationLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [alreadyAuthed, setAlreadyAuthed] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No invitation token found. Please check your email link.');
      setLoading(false);
      return;
    }
    Promise.all([getInvitationByToken(token), supabase.auth.getSession()])
      .then(([inv, { data }]) => {
        setInvitation(inv);
        if (data.session) setAlreadyAuthed(true);
      })
      .catch(() => setError('This invitation link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAcceptOnly() {
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      await acceptInvitation(token, sessionData.session?.access_token);
      navigate('/dashboard/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    let signedIn = false;
    try {
      await setInvitationPassword(token, password);
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation!.email,
        password,
      });
      if (signInError) throw signInError;
      signedIn = true;
      setAlreadyAuthed(true);
      await acceptInvitation(token, signInData.session?.access_token);
      navigate('/dashboard/');
    } catch (err) {
      if (signedIn) {
        setError('Could not complete setup. Click "Accept invitation" to try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDecline() {
    setSubmitting(true);
    setError(null);
    try {
      await declineInvitation(token);
      setDeclined(true);
    } catch {
      setError('Could not decline the invitation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading invitation...</p>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border bg-card px-5 py-4 max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-2">Invitation declined</h2>
          <p className="text-muted-foreground mb-4">You have declined the invitation.</p>
          <Link to="/dashboard/login" className="text-primary underline">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border bg-card px-5 py-4 max-w-md w-full text-center">
          <h2 className="text-xl font-semibold mb-2">Invitation not found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link to="/dashboard/login" className="text-primary underline">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  if (invitation.isExistingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border bg-card px-5 py-4 max-w-md w-full">
          <h2 className="text-xl font-semibold mb-2">Accept your invitation</h2>
          <p className="text-muted-foreground mb-4">
            You've been invited to join <strong>{invitation.organizationName}</strong> as a{' '}
            <strong>
              {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1).toLowerCase()}
            </strong>
            .
          </p>
          {alreadyAuthed ? (
            <>
              <button
                onClick={handleAcceptOnly}
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground rounded px-4 py-2 font-medium disabled:opacity-50"
              >
                {submitting ? 'Accepting...' : 'Accept invitation'}
              </button>
              {error && <p className="text-destructive text-sm mt-2">{error}</p>}
            </>
          ) : (
            <p className="mb-4 text-sm">
              You already have an account. Please{' '}
              <Link
                to={`/dashboard/login?redirect=${encodeURIComponent(`/dashboard/accept-invite?token=${token}`)}`}
                className="text-primary underline"
              >
                log in
              </Link>{' '}
              to accept this invitation.
            </p>
          )}
          <div className="mt-4 text-center">
            <button
              onClick={handleDecline}
              disabled={submitting}
              className="text-sm text-muted-foreground underline disabled:opacity-50"
            >
              Decline invitation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="rounded-lg border bg-card px-5 py-4 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-2">Accept your invitation</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          You've been invited to join <strong>{invitation.organizationName}</strong> as a{' '}
          <strong>
            {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1).toLowerCase()}
          </strong>
          . Set a password to create your account.
        </p>
        {alreadyAuthed ? (
          <div className="space-y-4">
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button
              onClick={handleAcceptOnly}
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground rounded px-4 py-2 font-medium disabled:opacity-50"
            >
              {submitting ? 'Accepting...' : 'Accept invitation'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                placeholder="Repeat your password"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground rounded px-4 py-2 font-medium disabled:opacity-50"
            >
              {submitting ? 'Setting up your account...' : 'Accept invitation'}
            </button>
          </form>
        )}
        <div className="mt-4 text-center">
          <button
            onClick={handleDecline}
            disabled={submitting}
            className="text-sm text-muted-foreground underline disabled:opacity-50"
          >
            Decline invitation
          </button>
        </div>
      </div>
    </div>
  );
}
