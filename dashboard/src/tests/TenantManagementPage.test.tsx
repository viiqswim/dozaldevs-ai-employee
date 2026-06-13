import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { toSlug } from '@/lib/utils';

vi.mock('@/lib/gateway', () => ({
  listAllTenants: vi.fn().mockResolvedValue([]),
  createTenant: vi.fn().mockResolvedValue({ id: 'test-id' }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TenantManagementPage } from '../pages/TenantManagementPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <TenantManagementPage />
    </MemoryRouter>,
  );
}

async function openCreateDialog() {
  await screen.findByText(/no organizations yet/i);
  const createBtn = screen.getAllByRole('button', { name: /create organization/i })[0];
  fireEvent.click(createBtn);
  await screen.findByRole('heading', { name: /create organization/i });
}

describe('toSlug', () => {
  it("converts 'Acme Corp' to 'acme-corp'", () => {
    expect(toSlug('Acme Corp')).toBe('acme-corp');
  });

  it("converts 'Hello   World!!!' to 'hello-world'", () => {
    expect(toSlug('Hello   World!!!')).toBe('hello-world');
  });

  it("strips leading/trailing hyphens from '  --Leading Hyphens--  '", () => {
    expect(toSlug('  --Leading Hyphens--  ')).toBe('leading-hyphens');
  });

  it('returns empty string for empty input', () => {
    expect(toSlug('')).toBe('');
  });
});

describe('TenantManagementPage — create dialog auto-slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-fills Slug when typing in the Name field', async () => {
    renderPage();
    await openCreateDialog();

    const nameInput = screen.getByRole('textbox', { name: /name/i });
    const slugInput = screen.getByRole('textbox', { name: /url slug/i });

    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } });

    expect(slugInput).toHaveValue('acme-corp');
  });

  it('stops auto-filling Slug once the user manually edits the Slug field', async () => {
    renderPage();
    await openCreateDialog();

    const nameInput = screen.getByRole('textbox', { name: /name/i });
    const slugInput = screen.getByRole('textbox', { name: /url slug/i });

    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } });
    expect(slugInput).toHaveValue('acme-corp');

    fireEvent.change(slugInput, { target: { value: 'my-custom-slug' } });
    expect(slugInput).toHaveValue('my-custom-slug');

    fireEvent.change(nameInput, { target: { value: 'Acme Corporation' } });
    expect(slugInput).toHaveValue('my-custom-slug');
  });

  it('resets touched state when the dialog is closed and reopened', async () => {
    renderPage();
    await openCreateDialog();

    const slugInput = screen.getByRole('textbox', { name: /url slug/i });
    fireEvent.change(slugInput, { target: { value: 'my-custom-slug' } });

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await act(async () => {});
    const createBtns = screen.getAllByRole('button', { name: /create organization/i });
    fireEvent.click(createBtns[0]);
    await screen.findByRole('heading', { name: /create organization/i });

    const nameInput2 = screen.getByRole('textbox', { name: /name/i });
    const slugInput2 = screen.getByRole('textbox', { name: /url slug/i });

    expect(nameInput2).toHaveValue('');
    expect(slugInput2).toHaveValue('');

    fireEvent.change(nameInput2, { target: { value: 'Fresh Start' } });
    expect(slugInput2).toHaveValue('fresh-start');
  });
});
