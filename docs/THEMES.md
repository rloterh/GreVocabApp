# Themes

The palette system, four new themes, and the automated check that keeps ten of
them legible.

## What exists

Six choices today: **Light**, **Dark**, **System**, **Sepia**, **Solarized** and
**High contrast**. Each is a block of HSL custom properties in
`src/styles/globals.css`; `src/lib/theme.ts` is the only thing that decides which
class goes on the root element, and `THEME_CLASSES` is derived from `THEMES` so
a new palette cannot be half-registered.

Adding a theme is therefore: one token block, one entry in `THEMES`. That is the
shape to preserve.

## Four new themes

The existing set is mostly warm and mostly dark. These fill the gaps — a cool
dark, a nature dark, a refined light, and a rich evening theme — and each has a
reason to exist beyond "another colour".

### Midnight — cool, deep indigo

The counterpart to Dark, which is near-black and warm. Midnight is navy-blue
dark with a periwinkle accent: colder, calmer, and easier on eyes that find
pure black harsh against a bright room.

```css
.midnight {
  --background: 230 30% 9%;
  --foreground: 225 20% 92%;
  --card: 230 28% 12%;
  --card-foreground: 225 20% 92%;
  --popover: 230 28% 12%;
  --popover-foreground: 225 20% 92%;
  --primary: 225 20% 92%;
  --primary-foreground: 230 30% 9%;
  --secondary: 230 24% 17%;
  --secondary-foreground: 225 20% 90%;
  --muted: 230 24% 17%;
  --muted-foreground: 228 12% 64%;
  --accent: 250 70% 68%;
  --accent-foreground: 230 30% 9%;
  --destructive: 355 70% 62%;
  --destructive-foreground: 230 30% 9%;
  --success: 160 50% 52%;
  --success-foreground: 230 30% 9%;
  --warning: 38 90% 62%;
  --warning-foreground: 230 30% 9%;
  --border: 230 20% 22%;
  --input: 230 20% 22%;
  --ring: 250 70% 72%;
}
```

### Evergreen — deep forest

Green is the colour people reach for when they want to concentrate without
feeling clinical. Near-black green with a moss accent; quieter than Dark's mint,
which reads as a highlight rather than a mood.

```css
.evergreen {
  --background: 160 22% 8%;
  --foreground: 150 15% 92%;
  --card: 160 20% 11%;
  --card-foreground: 150 15% 92%;
  --popover: 160 20% 11%;
  --popover-foreground: 150 15% 92%;
  --primary: 150 15% 92%;
  --primary-foreground: 160 22% 8%;
  --secondary: 160 18% 16%;
  --secondary-foreground: 150 15% 90%;
  --muted: 160 18% 16%;
  --muted-foreground: 152 10% 64%;
  --accent: 92 46% 58%;
  --accent-foreground: 160 22% 8%;
  --destructive: 8 66% 60%;
  --destructive-foreground: 160 22% 8%;
  --success: 140 50% 54%;
  --success-foreground: 160 22% 8%;
  --warning: 40 85% 60%;
  --warning-foreground: 160 22% 8%;
  --border: 160 16% 20%;
  --input: 160 16% 20%;
  --ring: 92 46% 62%;
}
```

### Porcelain — refined light

Light today is warm paper. Porcelain is its cool sibling: a blue-grey off-white
with charcoal text and a deep teal accent. This is the theme for a bright room
and a long session, and it is the only *new* light option — the existing set has
five dark-ish themes and one light one.

```css
.porcelain {
  --background: 210 20% 97%;
  --foreground: 215 25% 15%;
  --card: 0 0% 100%;
  --card-foreground: 215 25% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 215 25% 15%;
  --primary: 215 25% 15%;
  --primary-foreground: 210 20% 98%;
  --secondary: 210 18% 92%;
  --secondary-foreground: 215 25% 22%;
  --muted: 210 16% 92%;
  --muted-foreground: 215 12% 40%;
  --accent: 190 65% 32%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 70% 45%;
  --destructive-foreground: 0 0% 100%;
  --success: 160 55% 30%;
  --success-foreground: 0 0% 100%;
  --warning: 32 85% 38%;
  --warning-foreground: 0 0% 100%;
  --border: 214 16% 87%;
  --input: 214 16% 87%;
  --ring: 190 55% 30%;
}
```

### Claret — warm evening

Deep burgundy with a gold accent. The most decorative of the set and
unapologetically so: some people study at night and want the app to feel like a
lamp rather than a screen.

```css
.claret {
  --background: 345 25% 9%;
  --foreground: 25 20% 92%;
  --card: 345 22% 12%;
  --card-foreground: 25 20% 92%;
  --popover: 345 22% 12%;
  --popover-foreground: 25 20% 92%;
  --primary: 25 20% 92%;
  --primary-foreground: 345 25% 9%;
  --secondary: 345 20% 17%;
  --secondary-foreground: 25 20% 90%;
  --muted: 345 20% 17%;
  --muted-foreground: 350 10% 66%;
  --accent: 38 76% 60%;
  --accent-foreground: 345 25% 9%;
  --destructive: 0 70% 62%;
  --destructive-foreground: 345 25% 9%;
  --success: 150 45% 52%;
  --success-foreground: 345 25% 9%;
  --warning: 30 85% 62%;
  --warning-foreground: 345 25% 9%;
  --border: 345 18% 22%;
  --input: 345 18% 22%;
  --ring: 38 76% 64%;
}
```

## The contrast check

Ten themes is past the point where reviewing colours by eye is reliable. A theme
that looks fine on the author's monitor can be unreadable on someone else's, and
the failure is silent.

So the palettes get a **test**, not a review:

```
src/lib/theme-contrast.test.ts
  parse every theme block out of globals.css
  convert each HSL token to relative luminance
  assert the pairs that must be legible clear WCAG AA
```

The pairs that must hold, for every theme:

| Foreground | Background | Minimum |
| --- | --- | --- |
| `--foreground` | `--background` | 4.5 : 1 |
| `--card-foreground` | `--card` | 4.5 : 1 |
| `--muted-foreground` | `--background` | 4.5 : 1 |
| `--muted-foreground` | `--muted` | 4.5 : 1 |
| `--primary-foreground` | `--primary` | 4.5 : 1 |
| `--accent-foreground` | `--accent` | 4.5 : 1 |
| `--destructive` / `--success` / `--warning` | `--background` | 3 : 1 |
| `--border` | `--background` | 1.15 : 1 |

Status colours get the 3:1 large-text/UI threshold rather than 4.5:1 because
they are used as badges, dots and borders rather than body copy — holding them
to body-text contrast would force every palette toward the same few hues.

`--border` gets a low floor: a border that clears 4.5:1 against its background
is a line, not a border. The check exists to catch borders that have vanished
entirely.

> **Corrected 2026-09-11.** This originally said 1.6:1, a number written here
> without measuring anything. When the test was built, **all nine** palettes
> came in between 1.20 and 1.66 — including the four specified token by token
> in this very document. A threshold that every subject fails is a wrong
> threshold, not nine wrong palettes. 1.15 catches a border that has actually
> disappeared while leaving a deliberate hairline alone.

**High contrast is asserted at AAA (7:1)** for its text pairs. A theme whose
entire purpose is legibility should be held to the standard it claims.

This test is worth more than the themes it checks: it makes the eleventh theme
safe for someone who has never seen the other ten.

## Picking a theme, with ten of them

Six fit a 3×2 grid. Ten do not, and a flat list of ten swatches is a wall.

Group them by what the user is actually choosing between:

```
Follow the system          [ System ]

Light                      [ Light ] [ Porcelain ] [ Sepia ]

Dark                       [ Dark ] [ Midnight ] [ Evergreen ] [ Claret ]
                           [ Solarized ]

Accessibility              [ High contrast ]
```

Each button previews its own palette — background, foreground and accent as
three small blocks — so the choice is visible rather than a name to guess at.
That is more useful than any label, and it is what makes ten options browsable
instead of overwhelming.

## Rules for a new theme

1. **Define every token.** A missing one inherits from `:root`, which means a
   light value on a dark background. There is no partial theme.
2. **Add it to `THEMES` in `src/lib/theme.ts`.** `THEME_CLASSES` derives from
   that array, so this is what makes switching *away* from it work.
3. **Pass the contrast test.** Not negotiable, and not a matter of opinion.
4. **Give it a reason.** "Another dark blue" is not one. Each theme in this set
   answers a different question about how and where someone studies.

## Deliberately not doing

- **User-defined custom themes.** A colour picker per token is ten decisions
  most people do not want, and every result would bypass the contrast check.
  If this is ever wanted, the shape is presets plus an accent override — one
  decision, still checkable.
- **A theme that follows the time of day.** Sounds delightful, is disorienting:
  the app changing appearance mid-session reads as a bug.
- **Per-page themes.** One app, one palette.
