import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
      const accessTokenFromHash = hashParams.get('access_token');
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error_description') ?? searchParams.get('error');

      if (errorParam) {
        setError('Sign-in was cancelled or failed. Please try again.');
        setTimeout(() => navigate('/dashboard/login'), 3000);
        return;
      }

      if (accessTokenFromHash) {
        const refreshToken = hashParams.get('refresh_token') ?? '';
        const type = hashParams.get('type');

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessTokenFromHash,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setError('Session expired or invalid. Please request a new link.');
          setTimeout(() => navigate('/dashboard/login'), 3000);
          return;
        }

        if (type === 'recovery') {
          navigate('/dashboard/auth/update-password');
        } else {
          navigate('/dashboard/');
        }
        return;
      }

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError || !data.session) {
          setError('Could not complete sign-in. Please try again.');
          setTimeout(() => navigate('/dashboard/login'), 3000);
          return;
        }
        navigate('/dashboard/');
        return;
      }

      navigate('/dashboard/login');
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm text-center rounded-lg border bg-card px-5 py-6 space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <p className="text-xs text-muted-foreground">Redirecting to sign-in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center rounded-lg border bg-card px-5 py-6 space-y-3">
        <p className="text-sm text-muted-foreground animate-pulse">Completing sign-in…</p>
      </div>
    </div>
  );
}
