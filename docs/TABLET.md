# Tablet and iPad

The size the app is currently worst at, and the size a vocabulary app is most
pleasant on.

[MOBILE.md](./MOBILE.md) covers phone layout and the Android/iOS toolchains.
This is the band between them, which neither document currently serves.

## The problem

The responsive shell has one breakpoint that matters: `lg` (1024px). Below it,
bottom tabs and a phone layout. At or above it, the sidebar and a desktop
layout. That is two designs for three device classes, and a tablet gets
whichever one it is nearest — badly, in both directions:

| Device | Portrait | What it gets today | Why that is wrong |
| --- | --- | --- | --- |
| iPad mini | 744×1133 | Phone layout | A 744px-wide phone screen with thumb tabs at the bottom of an 1133px-tall screen the thumb cannot reach |
| iPad 10.9" | 820×1180 | Phone layout | Same, plus ~400px of unused width beside every card |
| iPad Pro 11" | 834×1194 | Phone layout | Same |
| iPad Pro 13" | 1024×1366 | **Desktop layout** | Sidebar appears at exactly 1024 — a one-pixel difference in device changes the whole navigation model |
| Any of the above | landscape | Desktop layout | Correct shell, but content laid out for a mouse and a 1440px window |

The 12.9-inch iPad crossing the `lg` line while the 11-inch does not is the
clearest symptom: two devices a user thinks of as the same thing get different
navigation.

## The target sizes

Real viewports, in CSS pixels, that the work is checked against:

| | Portrait | Landscape |
| --- | --- | --- |
| iPad mini | 744 × 1133 | 1133 × 744 |
| iPad 10.9" | 820 × 1180 | 1180 × 820 |
| iPad Pro 11" | 834 × 1194 | 1194 × 834 |
| iPad Pro 13" | 1024 × 1366 | 1366 × 1024 |
| Android tablet (common) | 800 × 1280 | 1280 × 800 |

Landscape at 1133–1366 wide is *not* a desktop window. It is a touch screen
held at arm's length, with no hover, no right-click, and 44px targets.

## The design

### Navigation: a rail, not tabs and not a sidebar

```
  phone (<md)        tablet (md–lg)       desktop (lg+)
┌───────────┐      ┌──┬──────────────┐   ┌────┬─────────┐
│  content  │      │▣ │              │   │ nav│ content │
│           │      │▤ │   content    │   │    │         │
├───────────┤      │▥ │              │   │    │         │
│ ▣ ▤ ▥ ▦ ▧ │      │▦ │              │   │    │         │
└───────────┘      └──┴──────────────┘   └────┴─────────┘
   tabs              72px icon rail        240px sidebar
```

A 76px icon rail from **`rail` (720px)** up to `lg`. It carries **all ten**
destinations — the reason the phone bar is limited to five is thumb reach along
a narrow bottom edge, and a vertical rail on an 1180px-tall screen has no such
constraint. Labels appear beneath the icons at rail width; no "More" sheet, no
hidden destinations.

This also fixes the 13-inch iPad discontinuity from the other side: the jump at
`lg` becomes rail → sidebar, which is the same navigation getting wider, rather
than bottom tabs → sidebar, which is a different app.

**Why 720px and not `md`.** Tailwind's `md` is 768px, which sits one pixel
class above the iPad mini's 744px portrait width — so the framework default
put thumb tabs at the bottom of an 1133px-tall screen and handed two iPads a
user thinks of as the same device different navigation. The breakpoint is
named `rail` in `tailwind.config.js` and chosen from the device table above
rather than from a default. It governs the shell only; content columns still
use `md`.

### Content: two columns, because the width exists

At `md` and up, screens that are a single tall column on a phone and a single
wide column on a desktop become two columns on a tablet:

| Screen | Tablet layout |
| --- | --- |
| Dashboard | Stats 2×2 beside the due-today panel, not stacked above it |
| Flashcards | Card centred with a fixed comfortable measure; the day's word list beside it in landscape |
| Daily Practice | Word list left, detail right — the master/detail this screen has always wanted |
| Archive | 3-column month grid (phone 1, desktop 4) |
| Progress | Heatmap at full width without horizontal scroll; year and month side by side |
| Word detail | A side panel in landscape rather than a modal that covers a 1194px screen to show six lines |
| Quiz / Exam | Question centred at a readable measure, never stretched to 1366px |
| Settings | Two-column sections; labels stop being 900px from their controls |

The rule underneath: **content has a maximum comfortable measure**, and extra
width becomes a second column or margin — never a longer line. A definition set
across 1300px is unreadable, and stretching it there is the single most common
way a desktop layout "supports" tablets.

### Fullscreen, always

**Below `lg`, the app fills the screen.** Not a centred column with margins —
the whole viewport.

Three things this means concretely, and each was a real defect before it was a
rule:

- **Content is full-bleed.** Every page used `max-w-3xl mx-auto`, which on an
  834px iPad left a phone-width column floating in the middle of the screen.
  Those constraints now apply from `lg` up only; below that a page is
  `w-full`, with a gutter and nothing else.
- **Height is `100dvh`, not `100vh`.** On a phone `100vh` is the viewport
  *without* the browser's collapsing address bar, so the bottom of the app sits
  underneath it until the user scrolls. `100dvh` is the height actually on
  screen and it updates as the chrome moves. `100vh` stays as the fallback.
- **`viewport-fit=cover`, then safe areas.** The page paints under the notch
  and the home indicator — which is what fullscreen should mean — and anything
  at an edge comes back inside them deliberately, on all four sides, because
  landscape moves the indicator to a side.

A desktop browser window will not show you any of this. It is only visible at
a real viewport, which is what `tablet-audit.mjs` is for.

### Touch, at tablet size

Everything in MOBILE.md's rules applies, plus:

- **No hover-only affordance, at any width.** The existing rules stop at `sm`
  because that was where touch was assumed to stop. An iPad Pro in landscape is
  1366px wide and has no pointer at all. Reveal-on-hover becomes
  reveal-on-hover-*or-focus-or-touch* everywhere — which is exactly the pattern
  [FLASHCARD-INTERACTION.md](./FLASHCARD-INTERACTION.md) specifies for the
  card arrows, and it generalises.
- **44px targets at every breakpoint**, not only below `sm`.
- **Safe areas in landscape too.** The home indicator is on the bottom edge in
  portrait and the side in landscape; `env(safe-area-inset-*)` on all four.
- **Rotation is a layout change, not a reload.** Nothing may reset scroll
  position, a card's flipped state, or a quiz in progress when the device
  turns. This is the tablet-specific bug class, and it is invisible until
  someone rotates mid-session.
- **External keyboard.** iPads have them. Every existing shortcut must keep
  working, and focus rings must be visible when they are used.

### Split view and multitasking

iPadOS can hand the app a third of the screen with no warning. The layout is
driven by the *viewport*, never by device detection, so a 375px-wide split view
gets the phone layout correctly and for free — provided nothing anywhere
branches on user agent. That is a rule, not an observation: **no code in this
app decides layout from a device string.**

Slide Over sizes (320–507px) are within the phone range and need no separate
work beyond not breaking.

## Verification

A `scripts/drive/tablet-audit.mjs`, alongside the existing drivers, running
every viewport in the table above in both orientations and asserting:

- no horizontal page scroll
- every interactive target ≥ 44×44, measured once entry animations have
  settled — a control caught mid-transform measures 43.9px and is not a defect
- every control has an accessible name, **including the one a `<label for>`
  gives it**; an earlier version of this check looked only at `aria-label`,
  `title` and text content and reported five correctly-labelled inputs on
  Settings as nameless
- the rail is present between `rail` and `lg`, the sidebar at `lg`+, tabs below
- no element extends past the viewport width
- a rotation mid-session preserves the card and its flipped state

The existing `mobile-audit.mjs` found 32 unnamed buttons and a 360px overflow
minutes after they were introduced. The same class of regression at tablet
width is currently undetectable, which is most of why this document exists.

## What this deliberately does not do

- **No iPad-specific components.** One responsive shell. A parallel tablet
  component tree is how two designs drift into three.
- **No drag-and-drop between panes, no Apple Pencil handling, no Stage Manager
  window chrome.** Interesting, and not what a vocabulary app is for.
- **No device detection.** Viewport and capability only — see the split-view
  rule above.
