import type { TaskProfile, UserAnswers } from './types.js';

const TOOL_KEYWORDS = [
  'api',
  'curl',
  'shell',
  'tool',
  'database',
  'query',
  'hostfully',
  'slack',
  'sifely',
  'jira',
  'webhook',
  'http',
  'fetch',
  'request',
  'endpoint',
];

const HIGH_QUALITY_DELIVERABLE_TYPES = [
  'guest_reply',
  'message',
  'reply',
  'response',
  'email',
  'notification',
];
const HIGH_QUALITY_PROMPT_KEYWORDS = ['professional', 'accurate', 'customer', 'guest', 'client'];
const MEDIUM_QUALITY_DELIVERABLE_TYPES = ['summary', 'report', 'digest', 'analysis'];

const CRITICAL_LATENCY_TYPES = ['message', 'reply', 'response', 'guest_reply'];
const RELAXED_LATENCY_TYPES = ['summary', 'report', 'digest', 'rotation', 'batch'];

const DOMAIN_KEYWORDS: Array<{ keywords: string[]; domain: string }> = [
  { keywords: ['hospitality', 'property', 'guest', 'airbnb', 'hostfully'], domain: 'hospitality' },
  { keywords: ['engineering', 'code', 'github', 'jira', 'pull request'], domain: 'engineering' },
  { keywords: ['operations', 'lock', 'passcode', 'sifely'], domain: 'operations' },
  { keywords: ['finance', 'invoice', 'payment', 'billing'], domain: 'finance' },
];

export function analyzeArchetype(archetype: {
  identity: string;
  instructions: string;
  deliverable_type: string;
}): TaskProfile {
  const { identity, instructions, deliverable_type } = archetype;
  const searchText = instructions.toLowerCase();
  const deliverableLower = deliverable_type.toLowerCase();
  const promptLower = identity.toLowerCase();

  const matchedKeywords = TOOL_KEYWORDS.filter((kw) => searchText.includes(kw));
  const toolIntensity: TaskProfile['toolIntensity'] =
    matchedKeywords.length >= 5 ? 'heavy' : matchedKeywords.length >= 1 ? 'light' : 'none';

  let outputQualityBar: TaskProfile['outputQualityBar'];
  if (
    HIGH_QUALITY_DELIVERABLE_TYPES.some((t) => deliverableLower.includes(t)) ||
    HIGH_QUALITY_PROMPT_KEYWORDS.some((kw) => promptLower.includes(kw))
  ) {
    outputQualityBar = 'high';
  } else if (MEDIUM_QUALITY_DELIVERABLE_TYPES.some((t) => deliverableLower.includes(t))) {
    outputQualityBar = 'medium';
  } else {
    outputQualityBar = 'low';
  }

  let contextNeeds: TaskProfile['contextNeeds'];
  if (
    instructions.length > 2000 ||
    instructions.toLowerCase().includes('conversation history') ||
    instructions.toLowerCase().includes('full context')
  ) {
    contextNeeds = 'large';
  } else if (instructions.length >= 500) {
    contextNeeds = 'medium';
  } else {
    contextNeeds = 'small';
  }

  let latencySensitivity: TaskProfile['latencySensitivity'];
  if (CRITICAL_LATENCY_TYPES.some((t) => deliverableLower.includes(t))) {
    latencySensitivity = 'critical';
  } else if (RELAXED_LATENCY_TYPES.some((t) => deliverableLower.includes(t))) {
    latencySensitivity = 'relaxed';
  } else {
    latencySensitivity = 'normal';
  }

  const costSensitivity: TaskProfile['costSensitivity'] = 'medium';

  const combinedText = `${identity} ${instructions}`.toLowerCase();
  let domain: string | null = null;
  for (const entry of DOMAIN_KEYWORDS) {
    if (entry.keywords.some((kw) => combinedText.includes(kw))) {
      domain = entry.domain;
      break;
    }
  }

  return {
    toolIntensity,
    outputQualityBar,
    contextNeeds,
    latencySensitivity,
    costSensitivity,
    domain,
  };
}

export function adjustProfileWithUserAnswers(
  profile: TaskProfile,
  answers: UserAnswers,
): TaskProfile {
  const result = { ...profile };

  if (answers.audience === 'external' && result.outputQualityBar !== 'high') {
    result.outputQualityBar = 'high';
  }

  if (answers.frequency === 'frequent') {
    result.costSensitivity = 'high';
  } else if (answers.frequency === 'rare') {
    result.costSensitivity = 'low';
  }

  if (answers.speedPreference === 'fast' && result.latencySensitivity === 'relaxed') {
    result.latencySensitivity = 'normal';
  }

  return result;
}
