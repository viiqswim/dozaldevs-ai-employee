import { describe, expect, it } from 'vitest';
import {
  generateServiceSkill,
  serviceToSkillName,
} from '../../../../src/lib/custom-skills/skill-generator.js';
import { ALL_TOOL_DESCRIPTORS, toolInvocationPath } from '../../../../src/lib/tool-registry.js';

const hostfullyDescriptors = ALL_TOOL_DESCRIPTORS.filter((d) => d.service === 'hostfully');
const knowledgeBaseDescriptors = ALL_TOOL_DESCRIPTORS.filter((d) => d.service === 'knowledge_base');

describe('serviceToSkillName', () => {
  it('maps knowledge_base to knowledge-base', () => {
    expect(serviceToSkillName('knowledge_base')).toBe('knowledge-base');
  });

  it('passes other services through unchanged', () => {
    expect(serviceToSkillName('hostfully')).toBe('hostfully');
    expect(serviceToSkillName('sifely')).toBe('sifely');
    expect(serviceToSkillName('slack')).toBe('slack');
    expect(serviceToSkillName('github')).toBe('github');
    expect(serviceToSkillName('platform')).toBe('platform');
  });

  it('produces output matching ^[a-z0-9]+(-[a-z0-9]+)*$', () => {
    const pattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const descriptor of ALL_TOOL_DESCRIPTORS) {
      const result = serviceToSkillName(descriptor.service);
      expect(result).toMatch(pattern);
    }
  });

  it('no output name contains an underscore', () => {
    const services = [...new Set(ALL_TOOL_DESCRIPTORS.map((d) => d.service))];
    for (const service of services) {
      expect(serviceToSkillName(service)).not.toContain('_');
    }
  });
});

describe('generateServiceSkill — hostfully', () => {
  const { skillMd, actionFiles } = generateServiceSkill('hostfully', hostfullyDescriptors);

  it('returns an action file for every hostfully descriptor', () => {
    expect(hostfullyDescriptors.length).toBeGreaterThan(0);
    for (const descriptor of hostfullyDescriptors) {
      expect(actionFiles.has(descriptor.id)).toBe(true);
    }
  });

  it('SKILL.md frontmatter contains name and description', () => {
    expect(skillMd).toContain('name: hostfully');
    expect(skillMd).toContain("description: '");
  });

  it('SKILL.md indexes every hostfully tool', () => {
    for (const descriptor of hostfullyDescriptors) {
      expect(skillMd).toContain(`| ${descriptor.id} |`);
    }
  });

  it('each action file contains the invocation path from toolInvocationPath()', () => {
    for (const descriptor of hostfullyDescriptors) {
      const actionMd = actionFiles.get(descriptor.id);
      expect(actionMd).toBeDefined();
      expect(actionMd).toContain(toolInvocationPath(descriptor));
    }
  });

  it('invocation paths use tsx /tools/hostfully/<id>.ts', () => {
    for (const descriptor of hostfullyDescriptors) {
      const actionMd = actionFiles.get(descriptor.id);
      expect(actionMd).toContain(`tsx /tools/hostfully/${descriptor.id}.ts`);
    }
  });

  it('action files list required and optional args', () => {
    const withArgs = hostfullyDescriptors.find((d) => d.args.length > 0);
    expect(withArgs).toBeDefined();
    if (withArgs) {
      const actionMd = actionFiles.get(withArgs.id);
      const requiredArg = withArgs.args.find((a) => a.required);
      const optionalArg = withArgs.args.find((a) => !a.required);
      if (requiredArg) expect(actionMd).toContain('required');
      if (optionalArg) expect(actionMd).toContain('optional');
    }
  });

  it('action files for no-arg tools show the no-arguments placeholder', () => {
    const noArgTool = hostfullyDescriptors.find((d) => d.args.length === 0);
    if (noArgTool) {
      const actionMd = actionFiles.get(noArgTool.id);
      expect(actionMd).toContain('_(no arguments)_');
    }
  });
});

describe('generateServiceSkill — knowledge_base', () => {
  const { skillMd, actionFiles } = generateServiceSkill('knowledge_base', knowledgeBaseDescriptors);

  it('SKILL.md frontmatter name is knowledge-base (not knowledge_base)', () => {
    expect(skillMd).toContain('name: knowledge-base');
    expect(skillMd).not.toContain('name: knowledge_base');
  });

  it('action files use the correct invocation path including knowledge_base directory', () => {
    for (const descriptor of knowledgeBaseDescriptors) {
      const actionMd = actionFiles.get(descriptor.id);
      expect(actionMd).toContain(`tsx /tools/knowledge_base/${descriptor.id}.ts`);
    }
  });
});

describe('generateServiceSkill — pure function contract', () => {
  it('returns distinct maps for different service calls', () => {
    const result1 = generateServiceSkill('hostfully', hostfullyDescriptors);
    const result2 = generateServiceSkill('hostfully', hostfullyDescriptors);
    expect(result1.actionFiles).not.toBe(result2.actionFiles);
  });

  it('returns empty actionFiles Map when given an empty descriptor list', () => {
    const { skillMd, actionFiles } = generateServiceSkill('platform', []);
    expect(actionFiles.size).toBe(0);
    expect(skillMd).toContain('name: platform');
  });

  it('uses ALL_TOOL_DESCRIPTORS as its only data source (no filesystem calls)', () => {
    const slackDescriptors = ALL_TOOL_DESCRIPTORS.filter((d) => d.service === 'slack');
    const { actionFiles } = generateServiceSkill('slack', slackDescriptors);
    expect(actionFiles.size).toBe(slackDescriptors.length);
    for (const descriptor of slackDescriptors) {
      expect(actionFiles.has(descriptor.id)).toBe(true);
    }
  });
});
