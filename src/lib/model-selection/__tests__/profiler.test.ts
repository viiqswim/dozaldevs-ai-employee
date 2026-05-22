import { describe, it, expect } from 'vitest';
import { analyzeArchetype, adjustProfileWithUserAnswers } from '../profiler.js';
import type { TaskProfile, UserAnswers } from '../types.js';

function makeArchetype(overrides: Partial<{
  system_prompt: string;
  instructions: string;
  deliverable_type: string;
  agents_md: string | null;
}> = {}) {
  return {
    system_prompt: 'You are a helpful bot.',
    instructions: 'Complete the task.',
    deliverable_type: 'task',
    agents_md: null,
    ...overrides,
  };
}

function baseProfile(overrides: Partial<TaskProfile> = {}): TaskProfile {
  return {
    toolIntensity: 'none',
    outputQualityBar: 'low',
    contextNeeds: 'small',
    latencySensitivity: 'normal',
    costSensitivity: 'medium',
    domain: null,
    ...overrides,
  };
}

describe('analyzeArchetype', () => {
  describe('toolIntensity', () => {
    it('returns none when instructions and agents_md contain no tool keywords', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Write a brief daily digest.',
        agents_md: null,
      }));
      expect(result.toolIntensity).toBe('none');
    });

    it('returns light when instructions contain exactly one tool keyword', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Use the api to process data.',
      }));
      expect(result.toolIntensity).toBe('light');
    });

    it('returns heavy when instructions contain five or more tool keywords', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Call the api with curl, use the shell tool to query the database.',
      }));
      expect(result.toolIntensity).toBe('heavy');
    });

    it('searches agents_md for tool keywords too', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Write a brief summary.',
        agents_md: 'Fetch data from the slack api endpoint.',
      }));
      expect(result.toolIntensity).toBe('light');
    });
  });

  describe('outputQualityBar', () => {
    it('returns high when deliverable_type is guest_reply', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'guest_reply' }));
      expect(result.outputQualityBar).toBe('high');
    });

    it('returns high when deliverable_type is message', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'message' }));
      expect(result.outputQualityBar).toBe('high');
    });

    it('returns high when system_prompt contains a quality keyword', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'You are a professional assistant.',
        deliverable_type: 'task',
      }));
      expect(result.outputQualityBar).toBe('high');
    });

    it('returns medium when deliverable_type is summary', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'summary' }));
      expect(result.outputQualityBar).toBe('medium');
    });

    it('returns medium when deliverable_type is report', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'report' }));
      expect(result.outputQualityBar).toBe('medium');
    });

    it('returns low when deliverable_type is neither high nor medium quality', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Do the task.',
        deliverable_type: 'task',
      }));
      expect(result.outputQualityBar).toBe('low');
    });
  });

  describe('contextNeeds', () => {
    it('returns small when instructions are under 500 chars', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Short instructions.',
      }));
      expect(result.contextNeeds).toBe('small');
    });

    it('returns medium when instructions are between 500 and 2000 chars', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'a'.repeat(500),
      }));
      expect(result.contextNeeds).toBe('medium');
    });

    it('returns large when instructions exceed 2000 chars', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'a'.repeat(2001),
      }));
      expect(result.contextNeeds).toBe('large');
    });

    it('returns large when instructions contain "conversation history"', () => {
      const result = analyzeArchetype(makeArchetype({
        instructions: 'Read the conversation history carefully and reply.',
      }));
      expect(result.contextNeeds).toBe('large');
    });
  });

  describe('latencySensitivity', () => {
    it('returns critical when deliverable_type is message', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'message' }));
      expect(result.latencySensitivity).toBe('critical');
    });

    it('returns relaxed when deliverable_type is summary', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'summary' }));
      expect(result.latencySensitivity).toBe('relaxed');
    });

    it('returns relaxed when deliverable_type is digest', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'digest' }));
      expect(result.latencySensitivity).toBe('relaxed');
    });

    it('returns normal when deliverable_type is neither critical nor relaxed', () => {
      const result = analyzeArchetype(makeArchetype({ deliverable_type: 'task' }));
      expect(result.latencySensitivity).toBe('normal');
    });
  });

  describe('costSensitivity and domain', () => {
    it('always sets costSensitivity to medium regardless of inputs', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Be very expensive.',
        instructions: 'api api api api api'.repeat(100),
      }));
      expect(result.costSensitivity).toBe('medium');
    });

    it('detects hospitality domain when "guest" appears in system_prompt or instructions', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Help guests with their stay.',
        instructions: 'Write a reply.',
      }));
      expect(result.domain).toBe('hospitality');
    });

    it('detects engineering domain when "code" appears in combined text', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Review code submissions.',
        instructions: 'Check the pull request.',
      }));
      expect(result.domain).toBe('engineering');
    });

    it('detects operations domain when "sifely" appears in combined text', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Rotate access for tenants.',
        instructions: 'Use sifely to update locks.',
      }));
      expect(result.domain).toBe('operations');
    });

    it('returns null domain when no domain keywords match', () => {
      const result = analyzeArchetype(makeArchetype({
        system_prompt: 'Be helpful.',
        instructions: 'Write a brief report.',
      }));
      expect(result.domain).toBeNull();
    });
  });
});

describe('adjustProfileWithUserAnswers', () => {
  it('upgrades outputQualityBar to high when audience is external and quality was medium', () => {
    const profile = baseProfile({ outputQualityBar: 'medium' });
    const answers: UserAnswers = { audience: 'external', frequency: 'daily', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.outputQualityBar).toBe('high');
  });

  it('leaves outputQualityBar unchanged when audience is external and quality is already high', () => {
    const profile = baseProfile({ outputQualityBar: 'high' });
    const answers: UserAnswers = { audience: 'external', frequency: 'daily', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.outputQualityBar).toBe('high');
  });

  it('leaves outputQualityBar unchanged when audience is internal', () => {
    const profile = baseProfile({ outputQualityBar: 'low' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'daily', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.outputQualityBar).toBe('low');
  });

  it('sets costSensitivity to high when frequency is frequent', () => {
    const profile = baseProfile({ costSensitivity: 'medium' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'frequent', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.costSensitivity).toBe('high');
  });

  it('sets costSensitivity to low when frequency is rare', () => {
    const profile = baseProfile({ costSensitivity: 'medium' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'rare', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.costSensitivity).toBe('low');
  });

  it('leaves costSensitivity unchanged when frequency is daily', () => {
    const profile = baseProfile({ costSensitivity: 'medium' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'daily', speedPreference: 'relaxed' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.costSensitivity).toBe('medium');
  });

  it('upgrades latencySensitivity from relaxed to normal when speedPreference is fast', () => {
    const profile = baseProfile({ latencySensitivity: 'relaxed' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'daily', speedPreference: 'fast' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.latencySensitivity).toBe('normal');
  });

  it('leaves latencySensitivity as critical when speedPreference is fast (only relaxed is upgraded)', () => {
    const profile = baseProfile({ latencySensitivity: 'critical' });
    const answers: UserAnswers = { audience: 'internal', frequency: 'daily', speedPreference: 'fast' };
    const result = adjustProfileWithUserAnswers(profile, answers);
    expect(result.latencySensitivity).toBe('critical');
  });

  it('does not mutate the original profile', () => {
    const profile = baseProfile({ costSensitivity: 'medium', outputQualityBar: 'low' });
    const answers: UserAnswers = { audience: 'external', frequency: 'frequent', speedPreference: 'fast' };
    adjustProfileWithUserAnswers(profile, answers);
    expect(profile.costSensitivity).toBe('medium');
    expect(profile.outputQualityBar).toBe('low');
  });
});
