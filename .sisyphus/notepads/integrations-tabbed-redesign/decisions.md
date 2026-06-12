# Decisions — integrations-tabbed-redesign

## [2026-06-12] Design Decisions (confirmed by user)

- Two tabs: "Connected apps" | "Browse apps"
- URL: `?tab=connected` / `?tab=browse`; smart default never written to URL
- Smart default: returning users (≥1 connection) → Connected; new users → Browse
- Custom apps (Hostfully, Sifely, GitHub, Slack) mix uniformly into both tabs
- "Available to connect now" section eliminated — connectables pinned to top of Browse
- Connected tab gets FULL toolbar (search + categories)
- Connected tab URL params: `?csearch=` / `?ccategory=`
- Browse tab URL params: `?search=` / `?category=`
- Tab count badges: "Connected apps (N)"
- Fix latent pagination bug: Connected sourced from connections poll, NOT catalogItems
- Connectable sort scope: GLOBAL (keep limit-200 fetch, client-filter by search/category)
- Empty state on Connected: single CTA "Browse apps" (Hick's Law)
- loadMore/IntersectionObserver guarded — only fires when Browse tab active
- Do NOT forceMount Browse TabsContent
