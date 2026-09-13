# Flashcard interaction

Moving between cards without leaving the card.

## The problem

The only way to reach the next card is a button below the rating row, which on
a laptop is a couple of hundred pixels below where the eye is and on a phone is
below the fold. The card is the thing being read; the controls for it are
somewhere else.

## What this adds

Three ways through, all reaching the same two actions:

| | Where | Appears |
| --- | --- | --- |
| **Edge arrows** | Just outside the card's left and right edges | On hover, focus, or touch — never at rest |
| **Swipe** | The card itself | Always, on any pointer |
| **Keyboard** | `←` `→`, already implemented | Always |

The buttons below stay. They are the discoverable path and removing them to
make room for a gesture would be a downgrade dressed as a refinement.

## Edge arrows

### Appearance

Circular, 44px, one either side of the card, vertically centred, sitting just
outside the card's bounds with a gap — not overlapping the text. Backdrop-blurred
surface, hairline border, the same accent the rest of the app uses for focus.

They are **hidden at rest**. A card with two permanent arrows bolted to it looks
like a carousel widget; a card that reveals them when you approach looks like it
was made for you. The difference is entirely in the restraint.

### When they show

```
show  =  pointer is over the card or the arrows
      or  focus is within the card
      or  the card was tapped (touch)
```

Three rules behind that, each learned from an interaction that would otherwise
be irritating:

1. **The arrows are part of the hover target.** If the region that reveals them
   excludes the arrows themselves, moving the mouse toward one makes it vanish
   before it can be clicked. The hover area is the card *and* its arrows.
2. **Focus counts, and focus persists.** A keyboard user tabbing to an arrow
   must see it, and it must not disappear when the pointer is elsewhere.
3. **On touch there is no hover.** First tap on the card reveals; the arrows
   then stay until the card changes or the user taps away. A touch user who has
   to hold a finger down to see navigation has been given nothing.

### Motion

Fade and a 4px slide inward, 180ms, on the easing this codebase already uses
(`[0.16, 1, 0.3, 1]`). Fast enough not to lag the pointer, slow enough not to
snap. Respects `prefers-reduced-motion` through the existing `reduceMotion`
setting: reduced means the arrows appear and disappear without moving.

### Disabled states

At the first card, the left arrow is not hidden — it is **disabled and still
visible**, at reduced opacity. Hiding it would move the right arrow's position
between cards, and a control that jumps is worse than one that is greyed.

## Swipe

Drag the card left to advance, right to go back.

- **Threshold:** 25% of the card's width, or a flick faster than 500px/s. A
  fixed pixel threshold is wrong on a 360px phone and a 1024px tablet.
- **The card follows the finger** while dragging, with resistance past the
  edges, and springs back if the threshold is not met. A gesture that does
  nothing visible until it completes feels broken while it is happening.
- **Direction is locked** once the drag is clearly horizontal. Otherwise a
  vertical scroll on a phone drags the card sideways.
- **A flip is not a swipe.** Tapping flips the card; dragging moves between
  cards. The gesture only begins after a few pixels of horizontal movement, so a
  tap with a shaky thumb still flips.
- **Mouse drag works too** — it costs nothing and some people reach for it.

Swipe is never the only route to anything. Every gesture here has a button.

## Accessibility

- Arrows are real `<button>`s with `aria-label` ("Previous card", "Next card"),
  in the tab order, reachable and operable with no pointer at all.
- The card announces its position — "Card 7 of 30" — in a live region on change,
  so a screen-reader user knows the swipe or arrow did something.
- Nothing here is hover-only in the sense that matters: every action has a
  keyboard route that does not depend on revealing anything.
- Targets are 44px, and the pointer-based sizing rules in `globals.css` already
  apply.

## What this is deliberately not

- **Not a carousel.** No dots, no auto-advance, no peek of the next card. This
  is a study tool; a preview of the next word would defeat it.
- **Not a stack.** No Tinder-style rotation or fling-away. It looks impressive
  for one session and becomes noise in the fiftieth.
- **Not replacing the rating row.** Rating a card and moving past it are
  different decisions, and merging them into a swipe is the single most common
  way flashcard apps become untrustworthy — you cannot tell what you told it.

  This was not hypothetical. Until Phase 15 the swipe **did** rate: left wrote
  "again", right wrote "good", at a fixed 120px. A 121-pixel drag on a 360px
  phone recorded a permanent judgement about a word, with nothing on screen
  afterwards to say what had been recorded. Swipe now navigates, and rating
  keeps the four buttons and the keys `1`–`4`.
