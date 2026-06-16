// src/lib/slack-copy.ts
// Single source of truth for all conversational Slack copy.
// Pure functions — no LLM, no randomized pools, employee-agnostic.

// ── Trigger flow (A) ─────────────────────────────────────────────────────────

export function loadingMessage(roleName: string, label?: string): string {
  return `On it — I'm getting *${roleName}* started${label ? ` for ${label}` : ''}. One moment…`;
}

export function successMessage(roleName: string, userId: string): string {
  return `✅ Done — *${roleName}* is now working on it, <@${userId}>. I'll post the results here when it's ready.`;
}

export function missingInfoMessage(roleName: string, inputList: string): string {
  return `Almost there — before I start *${roleName}*, I just need a couple of details:\n\n${inputList}\n\nJust reply here and I'll take it from there.`;
}

export function failureMessage(): string {
  return `Hmm, I ran into a problem starting that up. Mind trying again in a moment?`;
}

// ── Watchdog copy (C) ─────────────────────────────────────────────────────────

export function watchdogFailureMessage(): string {
  return `❌ This one timed out before it could finish — I didn't get what I needed in time. Mind kicking it off again?`;
}

// ── Remaining-string copy (D) ─────────────────────────────────────────────────

export function supersededMessage(): string {
  return `⏭️ A newer message came in — I've moved on to that one.`;
}

export function expiredMessage(): string {
  return `⏰ This one timed out — I didn't hear back in time, so I've let it go.`;
}

export function needsReviewMessage(name?: string): string {
  return `👀 Hey${name ? ` — ${name}` : ''}, this one's waiting on you. Mind taking a look?`;
}

export function reviewingDraftedMessage(name?: string): string {
  return `👀 I've drafted${name ? ` a reply for ${name}` : ' something'} and sent it your way for a quick look.`;
}

export function completedNoApprovalMessage(): string {
  return `✅ All done — nothing needed your sign-off on this one.`;
}

export function noActionSkippedMessage(roleName: string, reasoning?: string): string {
  return `ℹ️ I looked at this and decided nothing needed doing${reasoning ? `: ${reasoning}` : '.'} You can override me if you disagree.`;
}

export function triggerCardPrompt(employeeName: string): string {
  return `Want me to get *${employeeName}* started?`;
}

export function ruleProposedMessage(ruleText: string): string {
  return `🧠 I picked up a new pattern from your edit — does this sound right?\n\n> ${ruleText}`;
}

export function ruleMergedMessage(mergedText: string, originals: string): string {
  return `🔀 I noticed a few of your rules overlap — here's a combined version. Does this capture it?\n\n> ${mergedText}\n\n*Replaces:*\n${originals}`;
}

export function ruleContradictionMessage(description: string, conflicts: string): string {
  return `⚠️ Heads up — two of your rules seem to conflict: ${description}\n${conflicts}`;
}

export function questionNoAnswerFallback(): string {
  return `I couldn't find an answer to that one — could you give me a bit more to go on?`;
}

export function approvalCardMissingFailureMessage(): string {
  return `❌ I finished working but couldn't post the result for your review. Please try again.`;
}

export function missingDeliveryConfigFailureMessage(): string {
  return `❌ I finished my work but I'm not set up to deliver it anywhere. Please check this employee's delivery settings and try again.`;
}
