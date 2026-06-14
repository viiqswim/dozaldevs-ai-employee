import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { converseEdit, patchArchetype } from '@/lib/gateway';
import type { Archetype, ConverseMessage, ConverseResponse } from '@/lib/types';
import { ProposalDiffCard } from './sections/ProposalDiffCard';
import { EditHistoryList } from './sections/EditHistoryList';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

const PROPOSAL_ERROR_FALLBACK =
  "I couldn't turn that into a change just now — the request may have been too complex to process. Try rephrasing it a bit, or breaking it into smaller changes.";

function getProposalErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return PROPOSAL_ERROR_FALLBACK;

  // gatewayFetch error format: "Gateway error <status> on <path>: <body>"
  const bodyMatch = /Gateway error \d+ on [^:]+: (.*)$/s.exec(err.message);
  if (bodyMatch) {
    try {
      const parsed = JSON.parse(bodyMatch[1]) as Record<string, unknown>;
      if (parsed.reasons && typeof parsed.reasons === 'object' && !Array.isArray(parsed.reasons)) {
        const reasons = Object.entries(parsed.reasons as Record<string, string>)
          .map(([field, reason]) => `• ${field}: ${reason}`)
          .join('\n');
        if (reasons) return `I wasn't able to make that change:\n${reasons}`;
      }
    } catch {
      // JSON parse error from gateway body — fall through to friendly fallback
    }
  }

  return PROPOSAL_ERROR_FALLBACK;
}

interface AssistantTabProps {
  archetype: Archetype;
  tenantId: string;
  onSaved: () => void;
}

type MessageRole = 'user' | 'assistant';
type MessageKind = 'text' | 'proposal';

interface ProposalData {
  baseline: Record<string, unknown>;
  proposal: Record<string, unknown>;
  changed_fields: Record<string, unknown>;
  tool_delta?: { added: string[]; removed: string[] };
  trigger_change?: { before: string; after: string };
  input_change?: { added: string[]; removed: string[] };
  approval_warning?: boolean;
  no_change?: boolean;
}

interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text?: string;
  proposal?: ProposalData;
  proposalActed?: boolean;
}

export function AssistantTab({ archetype, tenantId, onSaved }: AssistantTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasPendingProposal = pendingProposalId !== null;
  useUnsavedChangesGuard(hasPendingProposal || isLoading);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const buildTranscript = (
    currentMessages: ChatMessage[],
    newUserText: string,
  ): ConverseMessage[] => {
    const transcript: ConverseMessage[] = currentMessages
      .filter((m) => m.kind === 'text')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.text ?? '',
      }));
    transcript.push({ role: 'user', content: newUserText });
    return transcript;
  };

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    const userMsgId = crypto.randomUUID();
    const newUserMsg: ChatMessage = { id: userMsgId, role: 'user', kind: 'text', text };
    setMessages((prev) => [...prev, newUserMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const transcript = buildTranscript(messages, text);
      const result: ConverseResponse = await converseEdit(tenantId, archetype.id, transcript);
      const assistantMsgId = crypto.randomUUID();

      if (result.kind === 'question') {
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: 'assistant', kind: 'text', text: result.question },
        ]);
      } else if (result.kind === 'no_change') {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            kind: 'text',
            text: 'It looks like no change is needed for that.',
          },
        ]);
      } else if (result.kind === 'too_long') {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            kind: 'text',
            text: 'The conversation is getting too long. Please start a new session to continue making changes.',
          },
        ]);
      } else if (result.kind === 'proposal') {
        const proposalData: ProposalData = {
          baseline: result.baseline as unknown as Record<string, unknown>,
          proposal: result.proposal as unknown as Record<string, unknown>,
          changed_fields: result.changed_fields as Record<string, unknown>,
          tool_delta: result.tool_delta,
          trigger_change: result.trigger_change as { before: string; after: string } | undefined,
          input_change: result.input_change as { added: string[]; removed: string[] } | undefined,
          approval_warning: result.approval_warning,
        };
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: 'assistant', kind: 'proposal', proposal: proposalData },
        ]);
        setPendingProposalId(assistantMsgId);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          kind: 'text' as const,
          text: getProposalErrorMessage(err),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (msgId: string, proposal: ProposalData) => {
    setIsLoading(true);
    try {
      const ALLOWED_PATCH_KEYS = [
        'identity',
        'execution_steps',
        'delivery_steps',
        'overview',
        'risk_model',
        'tool_registry',
        'trigger_sources',
        'input_schema',
      ] as const;

      const patchBody: Record<string, unknown> = {};
      for (const key of ALLOWED_PATCH_KEYS) {
        if (proposal.proposal[key] !== undefined) {
          patchBody[key] = proposal.proposal[key];
        }
      }

      await patchArchetype(
        tenantId,
        archetype.id,
        patchBody as Parameters<typeof patchArchetype>[2],
      );

      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, proposalActed: true } : m)));
      setPendingProposalId(null);
      toast.success('Change applied to your employee.');
      onSaved();
      setHistoryRefreshTrigger((t) => t + 1);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          kind: 'text' as const,
          text: `I wasn't able to apply that change: ${errMsg}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, proposalActed: true } : m)));
    setPendingProposalId(null);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        kind: 'text',
        text: 'Discarded. Feel free to ask for a different change.',
      },
    ]);
  };

  return (
    <div className="flex flex-col h-full min-h-[500px] space-y-4">
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.length === 0 && !isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center space-y-2 max-w-sm">
              <p className="text-sm text-muted-foreground">
                Ask me to change how this employee works — for example, &ldquo;make replies
                shorter&rdquo; or &ldquo;add a friendly greeting&rdquo;.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 max-w-[80%] text-sm">
                    {msg.text}
                  </div>
                </div>
              );
            }

            if (msg.kind === 'proposal' && msg.proposal) {
              const proposal = msg.proposal;
              const proseFields = [
                'identity',
                'execution_steps',
                'delivery_steps',
                'overview',
              ] as const;
              const proseChanges = proseFields
                .filter((f) => proposal.changed_fields[f])
                .map((f) => ({
                  field: f as 'identity' | 'execution_steps' | 'delivery_steps' | 'overview',
                  before: String(proposal.baseline[f] ?? ''),
                  after: String(proposal.proposal[f] ?? ''),
                }));

              const approvalChange = proposal.changed_fields['approval_required']
                ? (proposal.changed_fields['approval_required'] as { from: boolean; to: boolean })
                : undefined;

              return (
                <div key={msg.id}>
                  <ProposalDiffCard
                    proseChanges={proseChanges}
                    toolDelta={proposal.tool_delta}
                    approvalChange={approvalChange}
                    triggerChange={proposal.trigger_change}
                    inputChange={proposal.input_change}
                    onApprove={() => void handleApprove(msg.id, proposal)}
                    onDeny={() => handleDeny(msg.id)}
                    busy={isLoading || (msg.proposalActed ?? false)}
                  />
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex justify-start">
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm max-w-[80%]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text ?? ''}</ReactMarkdown>
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Thinking…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2 items-end border-t pt-4">
        <textarea
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          rows={2}
          placeholder="Ask me to change how this employee works…"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          disabled={isLoading}
        />
        <Button onClick={() => void handleSubmit()} disabled={!inputText.trim() || isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
        </Button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">Change History</h3>
        <EditHistoryList
          archetypeId={archetype.id}
          tenantId={tenantId}
          onReverted={() => {
            onSaved();
            setHistoryRefreshTrigger((t) => t + 1);
          }}
          refreshTrigger={historyRefreshTrigger}
        />
      </div>
    </div>
  );
}
