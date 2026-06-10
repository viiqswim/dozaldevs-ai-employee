import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { PreflightStatus } from '@/hooks/use-preflight-status';

const authState = vi.hoisted(() => ({
  current: { isPlatformOwner: false, roleLoading: false } as {
    isPlatformOwner: boolean;
    roleLoading: boolean;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

import { Sidebar } from '../components/layout/Sidebar';

const preflightStatus: PreflightStatus = {
  results: {},
  allOk: true,
  hasError: false,
  failingNames: [],
  checking: false,
  lastCheckedAt: null,
  runChecks: () => {},
};

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar preflightStatus={preflightStatus} />
    </MemoryRouter>,
  );
}

describe('Sidebar grouping', () => {
  beforeEach(() => {
    authState.current = { isPlatformOwner: false, roleLoading: false };
  });

  it('shows the Platform Admin group when the user is a platform owner', () => {
    authState.current = { isPlatformOwner: true, roleLoading: false };
    renderSidebar();

    expect(screen.getByText('Platform Admin')).toBeInTheDocument();
    expect(screen.getByText('Platform Settings')).toBeInTheDocument();
    expect(screen.getByText('AI Models')).toBeInTheDocument();
    expect(screen.getByText('Tenant Management')).toBeInTheDocument();
  });

  it('hides the Platform Admin group for a non-owner', () => {
    authState.current = { isPlatformOwner: false, roleLoading: false };
    renderSidebar();

    expect(screen.queryByText('Platform Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Tenant Management')).not.toBeInTheDocument();
  });

  it('hides the Platform Admin group while the role is still loading', () => {
    authState.current = { isPlatformOwner: true, roleLoading: true };
    renderSidebar();

    expect(screen.queryByText('Platform Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Platform Settings')).not.toBeInTheDocument();
  });

  it('always shows Members in the Workspace group regardless of role', () => {
    authState.current = { isPlatformOwner: false, roleLoading: false };
    const { unmount } = renderSidebar();
    expect(screen.getByText('Members')).toBeInTheDocument();
    unmount();

    authState.current = { isPlatformOwner: true, roleLoading: false };
    renderSidebar();
    expect(screen.getByText('Members')).toBeInTheDocument();
  });
});
