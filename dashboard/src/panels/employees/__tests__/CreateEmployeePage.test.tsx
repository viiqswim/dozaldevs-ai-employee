import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateEmployeePage } from '../CreateEmployeePage';

vi.mock('@/lib/gateway', () => ({
  generateArchetype: vi.fn(),
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

async function describeAndGenerate() {
  const textarea = screen.getByPlaceholderText(/e\.g\., An employee/i);
  fireEvent.change(textarea, { target: { value: VALID_DESCRIPTION } });
  fireEvent.click(screen.getByRole('button', { name: /generate/i }));
}

describe('CreateEmployeePage — generation error rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a friendly message, not a raw "Gateway error 422" string', async () => {
    const { generateArchetype } = await import('@/lib/gateway');
    vi.mocked(generateArchetype).mockRejectedValue(
      new Error('Gateway error 422 on /admin/tenants/tenant-1/archetypes/generate: {"error":"x"}'),
    );

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText(/generation failed/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Gateway error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/422/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[{}]/)).not.toBeInTheDocument();
  });

  it('renders the friendly text when the error carries a clean message', async () => {
    const { generateArchetype } = await import('@/lib/gateway');
    vi.mocked(generateArchetype).mockRejectedValue(
      new Error("We couldn't generate your employee from that description. Please try again."),
    );

    render(<CreateEmployeePage />);
    await describeAndGenerate();

    await waitFor(() => {
      expect(screen.getByText(/couldn't generate your employee/i)).toBeInTheDocument();
    });
  });
});
