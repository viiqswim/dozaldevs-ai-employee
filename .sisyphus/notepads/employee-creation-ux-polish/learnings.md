# Learnings — employee-creation-ux-polish

## [2026-05-18] Session Start

### Key Conventions

- Dashboard is served as static build from `dashboard/dist/` via gateway static middleware
- Always run `cd dashboard && pnpm build` after frontend changes — changes are NOT hot-reloaded in production mode
- Tool paths from archetype-generator look like `/tools/sifely/create-passcode.ts` (segment[2] = service, last segment = tool name)
- `MarkdownEditorField` props interface must NOT be changed — no new required props
- `system_prompt` is nullable in Prisma schema (`String?`) — safe to omit from creation UI

### Known Patterns

- React `createPortal` to `document.body` for overlay/fullscreen components
- Vitest test pattern: follow `src/gateway/services/__tests__/archetype-generator.test.ts`
- Badge component: `import { Badge } from '../../components/ui/badge'` (relative path from panels/employees/)
- MarkdownPreview import: `import { MarkdownPreview } from '../../components/MarkdownPreview'`
