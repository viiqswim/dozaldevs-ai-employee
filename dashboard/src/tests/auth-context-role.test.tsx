import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
}));

vi.mock('@/lib/gateway', () => ({
  getMe: mocks.getMe,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token-abc', user: { id: 'u1' } } },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signOut: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { AuthProvider, useAuth } from '../contexts/AuthContext';

function RoleProbe() {
  const { globalRole, isPlatformOwner, roleLoading } = useAuth();
  return (
    <div>
      <span data-testid="role">{globalRole ?? 'null'}</span>
      <span data-testid="owner">{String(isPlatformOwner)}</span>
      <span data-testid="loading">{String(roleLoading)}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <RoleProbe />
    </AuthProvider>,
  );
}

describe('AuthContext globalRole wiring', () => {
  beforeEach(() => {
    mocks.getMe.mockReset();
  });

  it('exposes globalRole and isPlatformOwner=true when getMe returns PLATFORM_OWNER', async () => {
    mocks.getMe.mockResolvedValue({
      id: 'u1',
      email: 'owner@dozaldevs.com',
      name: null,
      globalRole: 'PLATFORM_OWNER',
      status: 'active',
    });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('PLATFORM_OWNER'));
    expect(screen.getByTestId('owner')).toHaveTextContent('true');
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
  });

  it('exposes isPlatformOwner=false for a non-owner role', async () => {
    mocks.getMe.mockResolvedValue({
      id: 'u2',
      email: 'testuser@dozaldevs.com',
      name: null,
      globalRole: 'USER',
      status: 'active',
    });
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('USER'));
    expect(screen.getByTestId('owner')).toHaveTextContent('false');
  });

  it('falls back to globalRole=null and isPlatformOwner=false when getMe fails', async () => {
    mocks.getMe.mockRejectedValue(new Error('network down'));
    renderProvider();

    await waitFor(() => expect(mocks.getMe).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('role')).toHaveTextContent('null');
    expect(screen.getByTestId('owner')).toHaveTextContent('false');
  });
});
