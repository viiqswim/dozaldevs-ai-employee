import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssistantTab } from '../AssistantTab';
import type { Archetype } from '@/lib/types';

vi.mock('@/lib/gateway', () => ({
  proposeEdit: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useBlocker: vi.fn(() => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() })),
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock('remark-gfm', () => ({ default: vi.fn() }));

vi.mock('react-diff-viewer-continued', () => ({
  default: ({ oldValue, newValue }: { oldValue: string; newValue: string }) => (
    <div data-testid="diff-viewer">
      <div data-testid="diff-old">{oldValue}</div>
      <div data-testid="diff-new">{newValue}</div>
    </div>
  ),
  DiffMethod: { WORDS: 'diffWords' },
}));

const mockArchetype: Archetype = {
  id: 'arch-1',
  tenant_id: 'tenant-1',
  role_name: 'test-bot',
  identity: 'I am a test bot.',
  execution_steps: 'Do the thing.',
  delivery_steps: 'Deliver the thing.',
  overview: 'A test bot.',
  status: 'active',
  model: 'minimax/minimax-m2.7',
  temperature: 1.0,
  runtime: 'opencode',
  risk_model: { approval_required: true },
  tool_registry: { tools: [] },
  trigger_sources: [{ type: 'manual' }],
  input_schema: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as Archetype;

describe('AssistantTab', () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders empty state initially', () => {
    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    expect(screen.getByPlaceholderText(/ask me to change/i)).toBeInTheDocument();
    expect(screen.getByText(/ask me to change how this employee works/i)).toBeInTheDocument();
  });

  it('appends user message on submit', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old' },
      proposal: { identity: 'new' },
      changed_fields: { identity: { before: 'old', after: 'new' } },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    const textarea = screen.getByPlaceholderText(/ask me to change/i);
    fireEvent.change(textarea, { target: { value: 'make replies shorter' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('make replies shorter')).toBeInTheDocument();
  });

  it('shows proposal card when proposeEdit returns changes', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old identity' },
      proposal: { identity: 'new identity' },
      changed_fields: { identity: { before: 'old identity', after: 'new identity' } },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    const textarea = screen.getByPlaceholderText(/ask me to change/i);
    fireEvent.change(textarea, { target: { value: 'make it friendlier' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText('Proposed changes')).toBeInTheDocument();
    });
  });

  it('shows no-change message when proposal has no_change=true', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: {},
      proposal: {},
      changed_fields: {},
      no_change: true,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText(/ask me to change/i), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/no change is needed/i)).toBeInTheDocument();
    });
  });

  it('deny adds discarded message and disarms guard', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old' },
      proposal: { identity: 'new' },
      changed_fields: { identity: { before: 'old', after: 'new' } },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    fireEvent.change(screen.getByPlaceholderText(/ask me to change/i), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => screen.getByText('Proposed changes'));
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    await waitFor(() => {
      expect(screen.getByText(/discarded/i)).toBeInTheDocument();
    });
  });
});
