import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateEmployeePage } from '../CreateEmployeePage';

vi.mock('@/lib/gateway', () => ({
  generateArchetype: vi.fn(),
  converseCreate: vi.fn(),
  createArchetype: vi.fn(),
  compilePreview: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/use-tenant', () => ({
  useTenant: () => ({ tenantId: 'tenant-1' }),
}));

vi.mock('@/hooks/use-slack-channels', () => ({
  useSlackChannels: () => ({ channels: [], loading: false, error: undefined }),
}));

vi.mock('@/hooks/use-wizard-data', () => ({
  useWizardData: () => ({
    repoUrl: '',
    setRepoUrl: vi.fn(),
    repos: [],
    reposLoading: false,
    reposError: null,
    githubConnected: false,
  }),
}));

vi.mock('@/panels/employees/components/WizardEditStep', () => ({
  WizardEditStep: () => <div data-testid="wizard-edit-step" />,
}));

vi.mock('@/components/MarkdownPreview', () => ({
  MarkdownPreview: ({ content }: { content: string }) => <div>{content}</div>,
}));

const VALID_DESCRIPTION =
  'An employee that reads our support channel every morning and posts a summary of open issues.';

const MINIMAL_PROPOSAL = {
  kind: 'proposal' as const,
  baseline: {
    identity: '',
    execution_steps: '',
    delivery_steps: null,
    role_name: '',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode' as const,
    risk_model: { approval_required: false },
    tool_registry: { tools: [] },
    trigger_sources: { type: 'manual' as const },
  } as never,
  proposal: {
    identity: 'I am a summarizer.',
    execution_steps: 'Read the channel.',
    delivery_steps: null,
    role_name: 'support-summarizer',
    model: 'deepseek/deepseek-v4-flash',
    runtime: 'opencode' as const,
    risk_model: { approval_required: false },
    tool_registry: { tools: [] },
    trigger_sources: { type: 'manual' as const },
  } as never,
  changed_fields: { identity: { from: '', to: 'I am a summarizer.' } },
};

async function describeAndGenerate() {
  const textarea = screen.getByPlaceholderText(/e\.g\., An employee/i);
  fireEvent.change(textarea, { target: { value: VALID_DESCRIPTION } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
}

describe('CreateEmployeePage — describe step with converseCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clear description → converseCreate returns proposal → skips chat and lands on edit step', async () => {
    const { converseCreate } = await import('@/lib/gateway');
    vi.mocked(converseCreate).mockResolvedValue(MINIMAL_PROPOSAL);

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByTestId('wizard-edit-step')).toBeInTheDocument();
    });

    expect(converseCreate).toHaveBeenCalledOnce();
    expect(screen.queryByText(/which channel/i)).not.toBeInTheDocument();
  });

  it('ambiguous description → converseCreate returns question → escalates to chat with question bubble', async () => {
    const { converseCreate } = await import('@/lib/gateway');
    vi.mocked(converseCreate).mockResolvedValue({
      kind: 'question',
      question: 'Which channels should I monitor?',
    });

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText('Which channels should I monitor?')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('wizard-edit-step')).not.toBeInTheDocument();
  });

  it('chat loop: question then proposal → transitions to edit step', async () => {
    const { converseCreate } = await import('@/lib/gateway');
    vi.mocked(converseCreate)
      .mockResolvedValueOnce({ kind: 'question', question: 'Which channels?' })
      .mockResolvedValueOnce(MINIMAL_PROPOSAL);

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText('Which channels?')).toBeInTheDocument();
    });

    const replyTextarea = screen.getByPlaceholderText(/reply/i);
    fireEvent.change(replyTextarea, { target: { value: 'all of them' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByTestId('wizard-edit-step')).toBeInTheDocument();
    });
  });

  it('converseCreate returns too_long → renders friendly "too long" chat message, not the error step', async () => {
    const { converseCreate } = await import('@/lib/gateway');
    vi.mocked(converseCreate).mockResolvedValue({ kind: 'too_long' });

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText(/too long/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/start a new session/i)).toBeInTheDocument();
    expect(screen.queryByText(/Generation Failed/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('wizard-edit-step')).not.toBeInTheDocument();
  });

  it('converseCreate error surfaces as assistant chat message, not a technical error string', async () => {
    const { converseCreate } = await import('@/lib/gateway');
    vi.mocked(converseCreate).mockRejectedValue(
      new Error('Gateway error 500 on /admin/tenants/tenant-1/archetypes/converse-create: {}'),
    );

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText(/something went wrong on our end/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Gateway error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });
});
