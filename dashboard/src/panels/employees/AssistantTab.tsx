import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getArchetype, patchArchetype, recordEditHistory, converseEdit } from '@/lib/gateway';
import type { Archetype } from '@/lib/types';
import { ProposalDiffCard } from './sections/ProposalDiffCard';
import { EditHistoryList } from './sections/EditHistoryList';
import { CollapsibleSection } from './components/CollapsibleSection';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { useChatConversation } from './use-chat-conversation';
import type { ProposalData } from './use-chat-conversation';

interface AssistantTabProps {
  archetype: Archetype;
  tenantId: string;
  onSaved: () => void;
}

export function AssistantTab({ archetype, tenantId, onSaved }: AssistantTabProps) {
  const [inputText, setInputText] = useState('');
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const {
    messages,
    isLoading,
    hasPendingProposal,
    submit,
    markProposalActed,
    setIsLoading,
    appendAssistantMessage,
  } = useChatConversation((transcript) => converseEdit(tenantId, archetype.id, transcript));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useUnsavedChangesGuard(hasPendingProposal || isLoading);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    setInputText('');
    await submit(text);
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

      const currentArchetype = await getArchetype(tenantId, archetype.id);
      const before_json: Record<string, unknown> = {};
      for (const key of ALLOWED_PATCH_KEYS) {
        before_json[key] = (currentArchetype as unknown as Record<string, unknown>)[key];
      }

      await patchArchetype(
        tenantId,
        archetype.id,
        patchBody as Parameters<typeof patchArchetype>[2],
      );

      const firstUserMessage = messages.find((m) => m.role === 'user' && m.kind === 'text');
      const request_text = firstUserMessage?.text ?? '';

      await recordEditHistory(tenantId, archetype.id, {
        request_text,
        before_json,
        after_json: patchBody,
        changed_fields: Object.keys(proposal.changed_fields),
        kind: 'edit',
      });

      markProposalActed(msgId);
      toast.success('Change applied to your employee.');
      onSaved();
      setHistoryRefreshTrigger((t) => t + 1);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      appendAssistantMessage(`I wasn't able to apply that change: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = (msgId: string) => {
    markProposalActed(msgId);
    appendAssistantMessage('Discarded. Feel free to ask for a different change.');
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
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2 max-w-[80%] text-sm text-foreground [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
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

      <CollapsibleSection title="Change history" defaultOpen={false}>
        <EditHistoryList
          archetypeId={archetype.id}
          tenantId={tenantId}
          onReverted={() => {
            onSaved();
            setHistoryRefreshTrigger((t) => t + 1);
          }}
          refreshTrigger={historyRefreshTrigger}
        />
      </CollapsibleSection>
    </div>
  );
}
