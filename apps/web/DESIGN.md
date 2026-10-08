# Design

Sora's web UI is black, square and quiet. Artwork carries the colour; the interface stays out
of its way. Every control comes from `src/lib/components/ui`, and pages compose those pieces
instead of restyling them.

## Colour

Tokens live in `src/routes/layout.css`. There are no others; don't reach for raw Tailwind
palette colours or `white/…` overlays.

| Token                    | Use                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `canvas`                 | Page background                                                                                                                 |
| `surface`                | Placeholders, hover cards, search and header dropdown panels                                                                    |
| `raised`                 | Header, other menus, sheets, tooltips                                                                                           |
| `hover`                  | Hover/open/pressed background with `foreground` text: `#151515`, or `#272727` inside a `bg-surface` panel (set in `layout.css`) |
| `foreground`             | Primary text, selected or current items                                                                                         |
| `muted`                  | Secondary text, resting controls                                                                                                |
| `subtle`                 | Tertiary text: counts, group labels, placeholders                                                                               |
| `border`/`border-strong` | Input outlines at rest and on hover                                                                                             |
| `accent`                 | Actions and focus only, never decoration                                                                                        |
| `accent-secondary`       | State: checked radios, switches, active filters, text-role hover                                                                |
| `danger`/`success`       | Destructive actions, errors, unread dots; status banners                                                                        |

## Type

One family, DM Sans. Sentence case for all copy. Uppercase is reserved for button labels, tab
labels and the calendar's weekday names.

| Role                  | Classes                                               |
| --------------------- | ----------------------------------------------------- |
| Page title (app)      | `text-2xl font-bold`, left aligned                    |
| Screen title (auth)   | `text-3xl font-bold`, centred                         |
| Section heading       | `text-lg font-bold` (home rows `text-xl sm:text-2xl`) |
| Card title            | `text-sm font-semibold leading-snug`                  |
| Body / meta           | `text-sm text-muted`                                  |
| Group label in a menu | `text-sm text-subtle`                                 |

## Layout

App pages use the `page` utility for padding and minimum height, then a centred `max-w-7xl`
column. The title row is `mb-8 flex items-center justify-between`, with page actions on the
right. Corners are square by default. Badges, including the home hero's carousel indicators,
and switch tracks and thumbs are explicitly approved rounded exceptions. Use `rounded-full`
for badge and switch containers, with circular switch thumbs. Other dots and markers remain
square. Add rounding elsewhere only when explicitly requested. No divider borders; separate
with space or a `surface`/`raised` step. Empty states sit in a `border-2 border-dotted
border-muted` frame.

## Controls

**Button** is chosen by role, never by look:

- `primary`: the main action. At most one per view.
- `secondary`: the alternative next to it (Cancel, bookmark beside Play).
- `ghost`: secondary actions and menu triggers.
- `toolbar`: sort, filter and view pickers beside a page title.
- `text`: a bare text trigger with no background, `accent-secondary` on hover; for places where
  any background looks heavy (season picker, mobile pickers).
- `icon`: icon-only actions, colour change only. `tone="accent"` for quick actions on cards.
- `item`: rows in menus, sheets and lists.
- `nav`: header bar links and triggers.

Sizes are `md` (44px, default) and `sm` (36px). `square` makes a primary, secondary or ghost
button icon-only. `tone="danger"` works on every variant. The Select `heading` variant is the `text` role.

**Dropdown** takes the same `variant` and `square` for its trigger. **Field** is the labelled
text input with its error and password toggle; use it for every form field. **Tabs** switch
views within a page. **Sheet** is the mobile stand-in for a dropdown.

`class` on a primitive is for layout only: width, flex, margin, position, visibility. If a call
site needs a different colour, height, weight or case, that's a missing variant; add it to the
primitive so every page gets it.

## States

Hover, open (`aria-expanded`) and pressed share the `hover` tint. Focus is a 2px `accent`
outline. Selected or current items turn `foreground` but never get the hover background; menus
open without a pre-highlighted row (the background follows the pointer, or keyboard
navigation once a key is pressed). Checked radios fill with `accent-secondary`.
Destructive actions turn `danger` on hover and live away from the primary action.
