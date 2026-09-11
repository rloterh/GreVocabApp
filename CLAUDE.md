# Instructions for Claude

You are helping build **Lexicon**, a daily vocabulary practice app.

## Read these first, in order

1. **[CONTINUING.md](./CONTINUING.md)** — current state, design principles, where to make common changes, known rough edges. This is the primary handoff document.
2. **[ROADMAP.md](./ROADMAP.md)** — phased plan with priorities and acceptance criteria. Consult this when the user asks "what should we build?" or "what's next?" — don't invent a plan from scratch.
3. **[docs/](./docs/)** — design documentation for v1.0 (Phases 6-12): the AI provider layer, generation and dedup, quizzes and exams, mobile, and the data model. Start at [docs/README.md](./docs/README.md). Decision records are in [docs/adr/](./docs/adr/) — read the relevant one before re-arguing a decision.
4. **[CHANGELOG.md](./CHANGELOG.md)** — shipped features per release.
5. **[README.md](./README.md)** — user-facing feature set, data model, scripts.
6. **[src/types/index.ts](./src/types/index.ts)** — the domain contract that everything else follows.

Do not begin coding without reading at least CONTINUING.md. When starting significant new work, also read the relevant phase in ROADMAP.md — if it doesn't fit any planned phase, say so before building.

## Before making changes

Confirm the app is in a clean state:

```bash
npm install
npm run typecheck
npm run build
```

If typecheck or build fails, fix that first — do not layer new changes on a broken build.

## Non-negotiable conventions

Pulled from CONTINUING.md. If any of these conflict with a request, flag it before proceeding.

- **Layering.** Pure logic goes in `src/lib/`. State goes in `src/store/` (Zustand). UI goes in `src/components/` and `src/pages/`. Pages orchestrate; they don't own domain logic.
- **State.** Zustand stores are the source of truth. Persistence is via `zustand/middleware`. Never read from or write to `localStorage` directly outside the three stores.
- **Progress is orthogonal to vocab.** Progress records are keyed by `wordId`. Reloading the same JSON five times must never reset progress.
- **Animation.** Framer Motion, easing `[0.16, 1, 0.3, 1]`. Search the codebase for that string to see the pattern.
- **Typography.** The word itself uses `display-serif` (Fraunces). Everything else is Inter. Numbers get the `tabular` class.
- **Design tokens.** All colors are HSL CSS variables in `src/styles/globals.css`. Never hardcode colors in components.
- **Commits.** No `Co-Authored-By` lines. Attribution is the repo owner only.

## When adding a new page

1. Create `src/pages/NewPage.tsx`
2. Add `"newpage"` to the `Page` union in `src/store/useAppStore.ts`
3. Register it in the `renderPage` switch in `src/App.tsx`
4. Add a nav entry in `src/components/Sidebar.tsx`

Miss any of those four and the page will either not compile or not appear.

## When you're done

Rerun `npm run typecheck && npm run build` and only report success if both are green.
