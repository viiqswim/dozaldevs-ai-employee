import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({ resendApiKey: '' }));

vi.mock('../../../src/lib/config.js', () => ({
  RESEND_API_KEY: () => mockState.resendApiKey,
  EMAIL_FROM: () => 'Test Sender <noreply@test.com>',
  SMTP_URL: () => 'smtp://localhost:54324',
}));

const resendConstructor = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({
  Resend: resendConstructor.mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ data: { id: 'resend-id' }, error: null }) },
  })),
}));

const createTransportMock = vi.hoisted(() => vi.fn());
vi.mock('nodemailer', () => ({
  createTransport: createTransportMock.mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: 'smtp-id' }),
  }),
}));

const { createEmailProvider } = await import('../../../src/lib/email/index.js');
const { ResendEmailProvider } = await import('../../../src/lib/email/resend-provider.js');
const { SmtpEmailProvider } = await import('../../../src/lib/email/smtp-provider.js');

describe('createEmailProvider', () => {
  beforeEach(() => {
    mockState.resendApiKey = '';
    vi.clearAllMocks();
  });

  it('returns SmtpEmailProvider when RESEND_API_KEY is empty', () => {
    mockState.resendApiKey = '';
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
    expect(createTransportMock).toHaveBeenCalledWith('smtp://localhost:54324');
    expect(resendConstructor).not.toHaveBeenCalled();
  });

  it('returns ResendEmailProvider when RESEND_API_KEY is non-empty', () => {
    mockState.resendApiKey = 're_test_key_123';
    const provider = createEmailProvider();
    expect(provider).toBeInstanceOf(ResendEmailProvider);
    expect(resendConstructor).toHaveBeenCalledWith('re_test_key_123');
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('selects SMTP again after a previous Resend selection (no hidden global state)', () => {
    mockState.resendApiKey = 're_first';
    expect(createEmailProvider()).toBeInstanceOf(ResendEmailProvider);

    mockState.resendApiKey = '';
    expect(createEmailProvider()).toBeInstanceOf(SmtpEmailProvider);
  });
});
