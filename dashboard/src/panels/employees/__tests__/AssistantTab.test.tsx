import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssistantTab } from '../AssistantTab';
import type { Archetype } from '@/lib/types';

vi.mock('@/lib/gateway', () => ({
  proposeEdit: vi.fn(),
  patchArchetype: vi.fn().mockResolvedValue({}),
  recordEditHistory: vi.fn().mockResolvedValue({}),
  interpretRequest: vi.fn(),
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

async function submitAndConfirm(requestText: string) {
  const { interpretRequest, proposeEdit } = await import('@/lib/gateway');
  vi.mocked(interpretRequest).mockResolvedValue({
    understanding: 'I understand the request.',
  } as never);

  const textarea = screen.getByPlaceholderText(/ask me to change/i);
  fireEvent.change(textarea, { target: { value: requestText } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  await waitFor(() => screen.getByRole('button', { name: /confirm/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

  return { proposeEdit };
}

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
    const { interpretRequest } = await import('@/lib/gateway');
    vi.mocked(interpretRequest).mockResolvedValue({
      understanding: 'Make replies shorter.',
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
    await submitAndConfirm('make it friendlier');

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
    await submitAndConfirm('test');

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
    await submitAndConfirm('test');

    await waitFor(() => screen.getByText('Proposed changes'));
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    await waitFor(() => {
      expect(screen.getByText(/discarded/i)).toBeInTheDocument();
    });
  });

  it('surfaces error as assistant message when proposeEdit rejects', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockRejectedValue(new Error('Tool not available'));

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    await submitAndConfirm('add a new tool');

    await waitFor(() => {
      expect(screen.getByText(/couldn't turn that into a change/i)).toBeInTheDocument();
    });
  });

  it('approve calls patchArchetype and onSaved', async () => {
    const { proposeEdit, patchArchetype } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old identity' },
      proposal: { identity: 'new identity' },
      changed_fields: { identity: { before: 'old identity', after: 'new identity' } },
      no_change: false,
    } as never);
    vi.mocked(patchArchetype).mockResolvedValue({} as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    await submitAndConfirm('make it friendlier');

    await waitFor(() => screen.getByText('Proposed changes'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /approve/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(patchArchetype).toHaveBeenCalledWith(
        'tenant-1',
        'arch-1',
        expect.objectContaining({ identity: 'new identity' }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('deny does not call patchArchetype or recordEditHistory', async () => {
    const { proposeEdit, patchArchetype, recordEditHistory } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old' },
      proposal: { identity: 'new' },
      changed_fields: { identity: { before: 'old', after: 'new' } },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    await submitAndConfirm('make it shorter');

    await waitFor(() => screen.getByText('Proposed changes'));
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));

    await waitFor(() => {
      expect(patchArchetype).not.toHaveBeenCalled();
      expect(recordEditHistory).not.toHaveBeenCalled();
    });
  });

  it('proposal card has no refine textarea and no "Ask for more changes" button', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old identity' },
      proposal: { identity: 'new identity' },
      changed_fields: { identity: { before: 'old identity', after: 'new identity' } },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    await submitAndConfirm('make it friendlier');

    await waitFor(() => screen.getByText('Proposed changes'));

    expect(screen.queryByLabelText(/refinement request/i)).toBeNull();
    expect(screen.queryByText(/ask for more changes/i)).toBeNull();
  });

  it('proposal card approval-off confirm gates Approve button', async () => {
    const { proposeEdit } = await import('@/lib/gateway');
    vi.mocked(proposeEdit).mockResolvedValue({
      baseline: { identity: 'old', risk_model: { approval_required: true } },
      proposal: { identity: 'new', risk_model: { approval_required: false } },
      changed_fields: {
        identity: { before: 'old', after: 'new' },
        approval_required: { from: true, to: false },
      },
      no_change: false,
    } as never);

    render(<AssistantTab archetype={mockArchetype} tenantId="tenant-1" onSaved={onSaved} />);
    await submitAndConfirm('disable approval');

    await waitFor(() => screen.getByText('Proposed changes'));

    const approveBtn = screen.getByRole('button', { name: /approve/i });
    expect(approveBtn).toBeDisabled();

    const confirmBox = screen.getByRole('checkbox', {
      name: /I understand this employee will act without my approval/i,
    });
    fireEvent.click(confirmBox);

    expect(approveBtn).not.toBeDisabled();
  });
});
