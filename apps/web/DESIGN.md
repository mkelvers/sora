# Design

Sora's web UI is black, square and quiet. Artwork carries the colour; the interface stays out of its way. Every control comes from `src/lib/components/ui`, and pages compose those pieces instead of restyling them.

## Colour

Tokens live in `src/routes/layout.css`. There are no others; don't reach for raw Tailwind palette colours or `white/…` overlays.

| Token | Use |
| --- | --- |
| `canvas` | Page background |
| `surface` | Placeholders, hover cards, search and header dropdown panels |
| `raised` | Header, other menus, sheets, tooltips |
| `hover` | Hover/open/pressed background with `foreground` text: `#151515`, or `#272727` inside a `bg-surface` panel (set in `layout.css`) |
| `foreground` | Primary text, selected or current items |
| `muted` | Secondary text, resting controls |
| `subtle` | Tertiary text: counts, group labels, placeholders |
| `border`/`border-strong` | Input outlines at rest and on hover |
| `accent` | Actions and focus only, never decoration |
| `accent-secondary` | State: checked radios, switches, active filters, text-role hover |
| `danger`/`success` | Destructive actions, errors, unread dots; status banners |

## Type

One family, DM Sans. Title Case for labels: buttons, menu items, tabs, sort and filter options, sheet titles and section headings ("Plan to Watch", "Mark Season as Watched", "Last Updated"), with short words like "to", "as", "and", "from" and "the" kept lowercase. Sentence case for everything else: descriptions, hints, empty-state copy and error messages. All-caps is reserved for button labels, tab labels and the calendar's weekday names, and comes from CSS, never from the text.

| Role                  | Classes                                               |
| --------------------- | ----------------------------------------------------- |
| Page title (app)      | `text-2xl font-bold`, left aligned                    |
| Screen title (auth)   | `text-3xl font-bold`, centred                         |
| Section heading       | `text-lg font-bold` (home rows `text-xl sm:text-2xl`) |
| Card title            | `text-sm font-semibold leading-snug`                  |
| Body / meta           | `text-sm text-muted`                                  |
| Group label in a menu | `text-sm text-subtle`                                 |

## Layout

App pages use the `page` utility for padding and minimum height, then a centred `max-w-7xl` column. The title row is `mb-8 flex items-center justify-between`, with page actions on the right. Corners are square by default. Badges, including the home hero's carousel indicators, and switch tracks and thumbs are explicitly approved rounded exceptions. Use `rounded-full` for badge and switch containers, with circular switch thumbs. Other dots and markers remain square. Add rounding elsewhere only when explicitly requested. No divider borders; separate with space or a `surface`/`raised` step. Empty states sit in a `border-2 border-dotted border-muted` frame.

## Controls

**Button** is chosen by role, never by look:

- `primary`: the main action. At most one per view.
- `secondary`: the alternative next to it (Cancel, bookmark beside Play).
- `ghost`: secondary actions and menu triggers.
- `toolbar`: sort, filter and view pickers beside a page title.
- `text`: a bare text trigger with no background, `accent-secondary` on hover; for places where any background looks heavy (season picker, mobile pickers).
- `icon`: icon-only actions, colour change only. `tone="accent"` for quick actions on cards.
- `item`: rows in menus, sheets and lists.
- `nav`: header bar links and triggers.

Sizes are `md` (44px, default) and `sm` (36px). `square` makes a primary, secondary or ghost button icon-only. `tone="danger"` works on every variant. The Select `heading` variant is the `text` role.

**Switch** is plain by default. Pass `icons` on settings pages to draw a cross on the thumb when off and a check when on.

**Settings** pages are one centred `Panel` (title `text-2xl font-bold`, then a `text-sm text-muted` description) holding a narrow column of settings. A switch row is a `text-base font-semibold` label with a `text-sm text-muted` description under it on the left and the switch on the right. A select keeps the underlined field style: a small `text-xs text-subtle` label above, the value in `text-base font-medium`, its description under it. Settings are grouped into pages by what a person looks for (Playback, Notifications, Password), not by one catch-all. A page with one group has no section headings; a page with two distinct groups, such as Import and Export, gives each a `text-lg font-bold` heading and the same rows under it. A list of things, such as signed-in devices, puts an icon in a `size-11` `surface` tile before each row's `text-base font-semibold` name and `text-sm text-muted` detail, shows the first five and collapses the rest, and keeps a group's bulk action in its heading row. A result sits in a `surface` block with its numbers in `text-2xl font-bold`. Choosing between a few things with a real identity, such as the sites a list can be imported from, is a group of `surface` tiles with `border-2 border-border` holding the thing's own mark on its own colour and its name; the chosen one takes `accent-secondary`, and one primary button below acts on it. Marks come from `$lib/assets/providers`. The sidebar is `text-lg font-bold` group labels (Profile for what follows the person watching, Account for what belongs to the login) over `text-sm text-muted` links with `px-3 py-3`; a hovered link takes a full-width `surface` background with `foreground` text, the current one `accent`.

**Dropdown** takes the same `variant` and `square` for its trigger. **Field** is the labelled text input with its error and password toggle; use it for every form field. **Tabs** switch views within a page. **Sheet** is the mobile stand-in for a dropdown.

`class` on a primitive is for layout only: width, flex, margin, position, visibility. If a call site needs a different colour, height, weight or case, that's a missing variant; add it to the primitive so every page gets it.

## States

Hover, open (`aria-expanded`) and pressed share the `hover` tint. Focus is a 2px `accent` outline. Selected or current items turn `foreground` but never get the hover background; menus open without a pre-highlighted row (the background follows the pointer, or keyboard navigation once a key is pressed). Checked radios fill with `accent-secondary`. Destructive actions turn `danger` on hover and live away from the primary action.
