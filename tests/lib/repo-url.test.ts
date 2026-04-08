import { describe, it, expect } from 'vitest';
import { parseRepoOwnerAndName, normalizeRepoUrl } from '../../src/lib/repo-url.js';

describe('repo-url', () => {
  describe('parseRepoOwnerAndName', () => {
    it('parses https://github.com/owner/repo', () => {
      const result = parseRepoOwnerAndName('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses https://github.com/owner/repo.git and strips .git', () => {
      const result = parseRepoOwnerAndName('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('throws on http:// (not https)', () => {
      expect(() => parseRepoOwnerAndName('http://github.com/owner/repo')).toThrow(
        /Unrecognized repository URL format/,
      );
    });

    it('throws on SSH format git@github.com:owner/repo.git', () => {
      expect(() => parseRepoOwnerAndName('git@github.com:owner/repo.git')).toThrow(
        /Unrecognized repository URL format/,
      );
    });

    it('throws on non-GitHub HTTPS URL (gitlab.com)', () => {
      expect(() => parseRepoOwnerAndName('https://gitlab.com/owner/repo')).toThrow(
        /Unrecognized repository URL format/,
      );
    });

    it('throws on empty string', () => {
      expect(() => parseRepoOwnerAndName('')).toThrow(/Unrecognized repository URL format/);
    });

    it('throws on missing repo segment (only owner)', () => {
      expect(() => parseRepoOwnerAndName('https://github.com/owner')).toThrow(
        /Unrecognized repository URL format/,
      );
    });
  });

  describe('normalizeRepoUrl', () => {
    it('strips trailing .git and whitespace', () => {
      const result = normalizeRepoUrl('https://github.com/owner/repo.git ');
      expect(result).toBe('https://github.com/owner/repo');
    });

    it('trims whitespace from URL without .git', () => {
      const result = normalizeRepoUrl('  https://github.com/owner/repo  ');
      expect(result).toBe('https://github.com/owner/repo');
    });

    it('returns URL unchanged if no .git suffix', () => {
      const result = normalizeRepoUrl('https://github.com/owner/repo');
      expect(result).toBe('https://github.com/owner/repo');
    });
  });
});
