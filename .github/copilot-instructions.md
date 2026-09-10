# Copilot instructions for Lexicon

Lexicon is a daily vocabulary practice app built with React 18, TypeScript, Vite, Tailwind, Framer Motion, Zustand, and Tauri v2. It runs as a web app or a native desktop app.

For full context read `../CLAUDE.md`, `../CONTINUING.md`, and `../ROADMAP.md` at the repo root. `../CHANGELOG.md` records what's shipped.

## Layering

- `src/lib/` — pure logic, no React
- `src/store/` — Zustand stores (source of truth)
- `src/components/` — UI (primitives in `ui/`)
- `src/pages/` — orchestrating views
- `src/types/` — the domain contract

Never bypass this. Never write to `localStorage` outside the three stores.

## Style

- Framer Motion easing `[0.16, 1, 0.3, 1]` throughout
- `display-serif` (Fraunces) for the vocabulary word itself, Inter elsewhere, `tabular` on numbers
- HSL CSS variables from `src/styles/globals.css` — never hardcode colors

## Progress model

Progress is keyed by `wordId` and orthogonal to vocab. Reloading a JSON must never reset it.

## Adding a page

1. `src/pages/NewPage.tsx`
2. Add to `Page` union in `src/store/useAppStore.ts`
3. Register in `renderPage` switch in `src/App.tsx`
4. Add nav entry in `src/components/Sidebar.tsx`

## Definition of done

`npm run typecheck && npm run build` must both pass.
