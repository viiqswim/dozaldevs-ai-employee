import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/lib/config.js', () => ({
  COMPOSIO_API_KEY: vi.fn(() => 'test-composio-key'),
}));

import { generateComposioSkill } from '../../../../src/lib/composio/skill-generator.js';
import notionFixture from '../../../../src/lib/composio/__fixtures__/notion-tools.json' with { type: 'json' };

const makeResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateComposioSkill', () => {
  describe('SKILL.md frontmatter', () => {
    it('includes name: composio-notion for toolkit "notion"', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { skillMd } = await generateComposioSkill('notion');
      expect(skillMd).toContain('name: composio-notion');
    });

    it('description is ≤1024 chars', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { skillMd } = await generateComposioSkill('notion');
      const match = skillMd.match(/description: '([^']+)'/);
      expect(match).not.toBeNull();
      expect(match![1].length).toBeLessThanOrEqual(1024);
    });

    it('name matches ^[a-z0-9]+(-[a-z0-9]+)*$', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { skillMd } = await generateComposioSkill('notion');
      const match = skillMd.match(/^name: ([^\n]+)/m);
      expect(match).not.toBeNull();
      expect(match![1]).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('sanitises toolkit slugs with special chars (underscores → hyphens)', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse({ items: [], next_cursor: null }));
      const { skillMd } = await generateComposioSkill('my_toolkit');
      expect(skillMd).toContain('name: composio-my-toolkit');
    });
  });

  describe('action index in SKILL.md', () => {
    it('lists all action slugs from the fixture', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { skillMd } = await generateComposioSkill('notion');
      expect(skillMd).toContain('NOTION_GET_PAGE_MARKDOWN');
      expect(skillMd).toContain('NOTION_CREATE_PAGE');
      expect(skillMd).toContain('NOTION_APPEND_BLOCK');
    });

    it('includes a note that full schemas are in actions/<SLUG>.md', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { skillMd } = await generateComposioSkill('notion');
      expect(skillMd).toContain('actions/<SLUG>.md');
    });
  });

  describe('actionFiles', () => {
    it('generates one file per action from the fixture', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { actionFiles } = await generateComposioSkill('notion');
      expect(Object.keys(actionFiles)).toHaveLength(3);
      expect(actionFiles['actions/NOTION_GET_PAGE_MARKDOWN.md']).toBeDefined();
      expect(actionFiles['actions/NOTION_CREATE_PAGE.md']).toBeDefined();
      expect(actionFiles['actions/NOTION_APPEND_BLOCK.md']).toBeDefined();
    });

    it('action file contains slug, description, and input parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { actionFiles } = await generateComposioSkill('notion');
      const md = actionFiles['actions/NOTION_GET_PAGE_MARKDOWN.md'];
      expect(md).toContain('NOTION_GET_PAGE_MARKDOWN');
      expect(md).toContain('Retrieves the content of a Notion page');
      expect(md).toContain('page_id');
      expect(md).toContain('string');
    });

    it('marks required parameters as Yes and optional as No', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse(notionFixture));
      const { actionFiles } = await generateComposioSkill('notion');
      const createPageMd = actionFiles['actions/NOTION_CREATE_PAGE.md'];
      expect(createPageMd).toContain('| parent_id | string | Yes |');
      expect(createPageMd).toContain('| content | string | No |');
    });
  });

  describe('pagination', () => {
    it('follows next_cursor and merges results across pages', async () => {
      const page1 = { items: [notionFixture.items[0], notionFixture.items[1]], next_cursor: 'abc' };
      const page2 = { items: [notionFixture.items[2]], next_cursor: null };
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(page1))
        .mockResolvedValueOnce(makeResponse(page2));

      const { actionFiles } = await generateComposioSkill('notion');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(Object.keys(actionFiles)).toHaveLength(3);
    });

    it('passes cursor query param on second page request', async () => {
      const page1 = { items: [notionFixture.items[0]], next_cursor: 'my-cursor' };
      const page2 = { items: [notionFixture.items[1]], next_cursor: null };
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(page1))
        .mockResolvedValueOnce(makeResponse(page2));

      await generateComposioSkill('notion');

      const secondCallUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string;
      expect(secondCallUrl).toContain('cursor=my-cursor');
    });
  });

  describe('empty toolkit', () => {
    it('returns valid skillMd with no-actions note when toolkit has zero actions', async () => {
      global.fetch = vi.fn().mockResolvedValue(makeResponse({ items: [], next_cursor: null }));
      const { skillMd, actionFiles } = await generateComposioSkill('emptytoolkit');
      expect(skillMd).toContain('name: composio-emptytoolkit');
      expect(skillMd).toContain('_No actions available for this toolkit._');
      expect(Object.keys(actionFiles)).toHaveLength(0);
    });
  });

  describe('API error handling', () => {
    it('throws on non-OK HTTP response', async () => {
      global.fetch = vi.fn().mockResolvedValue(new Response('Not found', { status: 404 }));
      await expect(generateComposioSkill('badtoolkit')).rejects.toThrow('Composio API error 404');
    });
  });
});
