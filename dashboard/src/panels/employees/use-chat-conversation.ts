import { useState } from 'react';
import { converseEdit } from '@/lib/gateway';
import type { ConverseMessage, ConverseResponse } from '@/lib/types';

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

type MessageRole = 'user' | 'assistant';
type MessageKind = 'text' | 'proposal';

export interface ProposalData {
  baseline: Record<string, unknown>;
  proposal: Record<string, unknown>;
  changed_fields: Record<string, unknown>;
  tool_delta?: { added: string[]; removed: string[] };
  trigger_change?: { before: string; after: string };
  input_change?: { added: string[]; removed: string[] };
  approval_warning?: boolean;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  kind: MessageKind;
  text?: string;
  proposal?: ProposalData;
  proposalActed?: boolean;
}

export interface UseChatConversationReturn {
  messages: ChatMessage[];
  transcript: ConverseMessage[];
  isLoading: boolean;
  hasPendingProposal: boolean;
  mustStartFresh: boolean;
  submit: (text: string) => Promise<void>;
  startFresh: () => void;
  markProposalActed: (msgId: string) => void;
  setIsLoading: (loading: boolean) => void;
  appendAssistantMessage: (text: string) => void;
}

export function useChatConversation(
  tenantId: string,
  archetypeId: string,
): UseChatConversationReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<ConverseMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProposalId, setPendingProposalId] = useState<string | null>(null);
  const [mustStartFresh, setMustStartFresh] = useState(false);

  const hasPendingProposal = pendingProposalId !== null;

  const appendAssistantMessage = (text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        kind: 'text' as const,
        text,
      },
    ]);
  };

  const submit = async (text: string) => {
    if (!text || isLoading) return;

    const userMsgId = crypto.randomUUID();
    const newUserMsg: ChatMessage = { id: userMsgId, role: 'user', kind: 'text', text };
    const updatedTranscript: ConverseMessage[] = [...transcript, { role: 'user', content: text }];

    setMessages((prev) => [...prev, newUserMsg]);
    setTranscript(updatedTranscript);
    setIsLoading(true);

    try {
      const result: ConverseResponse = await converseEdit(tenantId, archetypeId, updatedTranscript);
      const assistantMsgId = crypto.randomUUID();

      if (result.kind === 'question') {
        setMessages((prev) => [
          ...prev,
          { id: assistantMsgId, role: 'assistant', kind: 'text', text: result.question },
        ]);
        setTranscript((prev) => [...prev, { role: 'assistant', content: result.question }]);
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
        setMustStartFresh(true);
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
      appendAssistantMessage(getProposalErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const startFresh = () => {
    setMessages([]);
    setTranscript([]);
    setPendingProposalId(null);
    setMustStartFresh(false);
  };

  const markProposalActed = (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, proposalActed: true } : m)));
    setPendingProposalId(null);
  };

  return {
    messages,
    transcript,
    isLoading,
    hasPendingProposal,
    mustStartFresh,
    submit,
    startFresh,
    markProposalActed,
    setIsLoading,
    appendAssistantMessage,
  };
}
