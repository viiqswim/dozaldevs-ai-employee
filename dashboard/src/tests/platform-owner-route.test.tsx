import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const authState = vi.hoisted(() => ({
  current: { roleLoading: false, isPlatformOwner: false } as {
    roleLoading: boolean;
    isPlatformOwner: boolean;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}));

import { PlatformOwnerRoute } from '../components/PlatformOwnerRoute';

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route element={<PlatformOwnerRoute />}>
          <Route path="/protected" element={<div>Owner Only Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PlatformOwnerRoute', () => {
  beforeEach(() => {
    authState.current = { roleLoading: false, isPlatformOwner: false };
  });

  it('shows a loading indicator (and neither children nor access-denied) while the role is loading', () => {
    authState.current = { roleLoading: true, isPlatformOwner: false };
    renderRoute();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Owner Only Content')).not.toBeInTheDocument();
    expect(screen.queryByText(/access restricted/i)).not.toBeInTheDocument();
  });

  it('renders the protected children for a platform owner', () => {
    authState.current = { roleLoading: false, isPlatformOwner: true };
    renderRoute();

    expect(screen.getByText('Owner Only Content')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.queryByText(/access restricted/i)).not.toBeInTheDocument();
  });

  it('renders the access-denied page for a non-owner', () => {
    authState.current = { roleLoading: false, isPlatformOwner: false };
    renderRoute();

    expect(screen.getByText(/access restricted/i)).toBeInTheDocument();
    expect(screen.queryByText('Owner Only Content')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });
});
