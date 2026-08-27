# RestrOS — Design System

The interactive version of this document is
[`prototype/styleguide.html`](../prototype/styleguide.html) — it renders every
token and component live, in both themes, and reads the icon set from the sprite
itself so it can never drift from the code.

This file explains the *reasoning*. The style guide shows the result.

---

## 1. The problem this system solves

RestrOS serves two audiences whose needs point in opposite directions.

|  | **Operator** (POS, KDS, console) | **Guest** (QR menu, bill) |
| --- | --- | --- |
| Session | Eight hours, every day | Ninety seconds, once |
| Skill | Expert, muscle memory | First-time, no training |
| Context | Bright kitchen, greasy screen, standing | Dim restaurant, one hand, seated |
| Wants | Density, speed, zero ambiguity | Warmth, appetite, the restaurant's character |
| Branding | **Neutral** — staff move between outlets | **Tenant-branded** — this is the restaurant |

One token layer serves both. The two surfaces differ in *values* (colour, scale,
density), never in *structure*. That is the whole design strategy.

---

## 2. Principles

### Speed is the feature
A cashier at 20:15 does not read the screen; they recognise it. Elements stay in
the same place, mean the same thing, and are large enough to hit without looking.
Never a modal in the ordering path.

### State is visible, not implied
An item with no price says **"Needs price"** in the console. A late ticket turns
red on the pass. An 86'd dish stays on the guest menu, greyed, so guests stop
asking staff about it. The awkward state gets a design, not an empty cell.

### Brand belongs to the guest
Tenant colours drive the QR menu, printed bills and receipts. The operator
console stays neutral. A manager covering a shift at another outlet should not
have to re-learn what green means.

### Colour never carries meaning alone
Every status pairs colour with a label, an icon, or both. Kitchens have bad
screens; roughly eight percent of men cannot reliably separate red from green.

### Density is earned, not assumed
14px body text and 36px controls on desktop, because operators trade comfort for
rows. 44px minimum targets on POS, KDS and guest surfaces, because those are
touched.

---

## 3. Colour

### Why OKLCH

The palette is authored in `oklch(L C H)`, not hex.

- **Perceptual uniformity.** `--basil-500` and `--chilli-500` have the same
  lightness, so they read as the same visual weight. In HSL they would not —
  `hsl(220 80% 50%)` looks far darker than `hsl(60 80% 50%)`.
- **Dark mode is an inversion, not a second palette.** Because lightness is
  perceptually linear, flipping the semantic layer produces a coherent dark
  theme without hand-tuning fifty values.
- **Predictable mixing.** `color-mix(in oklch, …)` does not pass through muddy
  intermediate greys the way sRGB interpolation does. Every hover, soft
  background and border tint in the system is a `color-mix`, so this matters.

### The palette

Basil and Chilli are lifted directly from the Cafe Adda Khana menu card — the
deep green of the section headers and the red of the price column.

| Ramp | Hue | Role |
| --- | --- | --- |
| **Basil** | ~163 | Brand. Primary actions, active navigation, positive trends. |
| **Chilli** | ~32 | Accent. Peak highlights, urgency, the "OS" in the wordmark. |
| **Turmeric** | ~80 | Warning. Pending prices, tickets approaching target, low stock. |
| **Indigo** | ~260 | Informational. System messages, neutral badges. |
| **Jade** | ~168 | Success. Cooler than Basil so "paid" never reads as "brand". |
| **Ink** | ~165, chroma 0.01 | Neutrals. A whisper of brand hue keeps greys warm rather than clinical. |
| **Paper** | ~86 | The light-theme canvas — the cream of the printed card. |

Ramps run 50 → 950 in eleven steps. Jade is abbreviated to six because it only
ever appears as a status.

### Three-layer architecture

```
Layer 1  primitives   --basil-500, --chilli-600, --ink-950
                      Raw palette. Never referenced by a component.
Layer 2  semantics    --bg-surface, --text-primary, --brand, --danger-soft
                      What components consume. This layer is what a theme swaps.
Layer 3  component    --sidebar-w, --control-h, --topbar-h
                      Per-pattern knobs.
```

The rule that makes it work: **nothing below `tokens.css` hard-codes a colour.**
Grep the CSS for `#` and the only hits are inside `tokens.css` and the tenant
brand fields in demo data.

### Theming in three states

The viewer's theme has three states, and all three are handled explicitly:

```css
:root                        { /* complete light palette — every token defined */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark overrides */ }
}
:root[data-theme='dark']     { /* the same dark overrides, for the explicit toggle */ }
```

The dark block is written twice on purpose. `data-theme` is stamped only when
the user makes an explicit choice; with the default "system" setting nothing is
stamped and `prefers-color-scheme` decides. Defining a colour *only* inside a
media query is the bug this structure prevents.

An inline script in every `<head>` applies the stored preference before first
paint, so there is no flash of the wrong theme.

### The KDS is a deliberate exception

The kitchen display is locked to dark and ignores the theme toggle. It runs
full-screen on a wall in a bright, greasy room. Glare beats contrast every time,
and a cook should never be able to accidentally switch it to a white screen
mid-service.

### Dietary marks

The square-with-a-dot veg/non-veg symbol is a legal requirement on Indian menus,
not decoration. It is a component (`.diet`), it appears on every item on every
surface, and it carries an `aria-label`.

---

## 4. Typography

Three faces, three jobs. Nothing is chosen for flavour alone.

| Face | Role | Why |
| --- | --- | --- |
| **Bricolage Grotesque** | Display, headings, all large numbers | Slightly condensed with real personality — it carries the energy of a hand-painted menu board without becoming a novelty face. Its variable optical-size axis keeps ₹30,190 tight at 28px and open at 64px. |
| **Inter** | All interface text | The most thoroughly hinted UI face available. `cv02`/`cv03`/`ss01` are enabled for a single-storey `g` and a disambiguated `l`, which matters when staff read item names at a glance. |
| **JetBrains Mono** | Order IDs, KOT codes, technical values | Anything a human reads *aloud to another human* gets a monospace face with unambiguous `0`/`O` and `1`/`l`. "Order oh-four-nine-seven" across a noisy kitchen has to be unambiguous. |

### Scale

Dense by default. An operator scanning a POS grid needs more rows, not bigger
letters — so the app body size is **14px**, not 16px. Marketing pages opt up via
the fluid steps.

| Token | Size | Used for |
| --- | --- | --- |
| `--text-2xs` | 11px | Micro labels, table meta |
| `--text-xs` | 12px | Badges, captions, hints |
| `--text-sm` | 13px | Secondary UI, table cells |
| `--text-base` | **14px** | App body |
| `--text-md` | 16px | Reading body, marketing paragraphs |
| `--text-lg` | 18px | Subheadings |
| `--text-xl` | 22px | Card titles |
| `--text-2xl` | 28px | Page titles, stat values |
| `--text-3xl` | `clamp(2rem, 1.6rem + 1.4vw, 2.75rem)` | Section headings |
| `--text-4xl` | `clamp(2.5rem, 1.7rem + 3.2vw, 4rem)` | Page hero |
| `--text-5xl` | `clamp(3rem, 1.6rem + 5.6vw, 5.5rem)` | Marketing hero |

Fluid steps use `clamp()` with a `vw` term in the middle so text scales with the
viewport but never below a readable floor or above a comfortable ceiling.

### Numbers

Every figure a human compares vertically uses `font-variant-numeric: tabular-nums`
(the `.num` class). Prices in a column, quantities in a ticket, totals in a
report — if two numbers stack, their digits must align.

---

## 5. Space, shape, elevation

**Spacing** is a 4px base scale, `--space-1` through `--space-32`. Only scale
values are used; there are no arbitrary pixel margins.

**Radius** runs `--radius-xs` 6px → `--radius-3xl` 36px. The working rule:
smaller elements take smaller radii, so a 22px badge inside a 16px-radius card
does not look like a pill glued to a rectangle.

**Elevation** is two-part. Every shadow pairs a tight contact shadow with a wide
ambient one, which is how real objects sit on real surfaces:

```css
--shadow-md:
  0 2px 4px -2px  color-mix(in oklch, var(--ink-1000) 8%,  transparent),
  0 8px 20px -6px color-mix(in oklch, var(--ink-1000) 12%, transparent);
```

Dark mode raises shadow opacity substantially (50–75% vs 8–22%), because a soft
shadow is invisible against a near-black canvas. Surfaces separate by
*lightness* in dark mode and by *shadow* in light mode.

Every surface also carries `--ring-inset` — a 1px inner hairline that gives an
edge without a heavy border.

---

## 6. Motion

Two curves, and a strict rule about which applies:

| Token | Curve | Applies to |
| --- | --- | --- |
| `--ease-spring` | `cubic-bezier(.32,.72,0,1)` | Anything that moves through space: drawers, sidebars, cards, the palette |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | Anything that only fades or changes colour |

| Duration | Value | Used for |
| --- | --- | --- |
| `--dur-instant` | 80ms | Press feedback |
| `--dur-fast` | 140ms | Hover, colour, focus ring |
| `--dur-base` | 220ms | Toggles, tabs, dropdowns |
| `--dur-slow` | 380ms | Drawers, sheets, sidebar collapse |

The spring curve is fast out of the gate and lands softly, with **no overshoot**.
Bouncy motion is charming in a marketing page and infuriating on the fortieth
ticket of a shift.

Under `prefers-reduced-motion: reduce`, every duration token collapses to 1ms —
one change at the token layer disables shimmer, the live-dot ping, drawer
slides and card lifts everywhere at once.

---

## 7. Icons

A single hand-built SVG sprite: **101 symbols**, 24px grid, 1.75 stroke, round
caps and joins.

```html
<svg class="icon"><use href="assets/icons/sprite.svg#i-orders"></use></svg>
```

Why a sprite rather than an icon font or a React icon package:

- **One cached request** for the whole set, and no layout shift while it loads.
- **`currentColor` inheritance** — an icon inside a danger button is the right
  red without a variant.
- **No CDN and no runtime dependency.** The whole prototype makes exactly three
  external requests, all of them Google Fonts.
- **Accessibility.** Icon fonts announce themselves to screen readers as random
  glyphs. `<use>` with `aria-hidden` does not.

Stroke width and size come from the `.icon` class, never from the symbol, so
`.icon-sm` / `.icon-lg` / `.icon-xl` scale the whole set consistently.

---

## 8. Components

The full inventory is rendered in the style guide. The rules that govern them:

### Buttons

| Variant | When |
| --- | --- |
| `btn-primary` | The one action this screen exists for. **One per view.** |
| `btn-accent` | Guest-facing calls to action |
| `btn-secondary` | Everything else with a border |
| `btn-soft` | Tinted, for a secondary action inside a branded area |
| `btn-ghost` | Icon buttons, toolbars, low-emphasis rows |
| `btn-danger` | Destructive — and it must be paired with a confirmation |

Sizes: `sm` 30px, default 36px, `lg` 44px, `xl` 54px. **POS and KDS use `lg` or
`xl` exclusively.**

### Status badges

Always colour + label, never colour alone. `badge-dot` adds a leading dot for
the tightest table cells where the label has to shrink.

### Tables

Sticky headers, hover rows, tabular numerals, right-aligned numeric columns, and
horizontal scroll inside `.table-wrap` — the page body must never scroll
sideways.

### Empty states

Every list has one, and it says what to do next, not just that there is nothing
here. The POS empty ticket reads *"Tap an item to start. The KOT prints to each
station automatically"* — it teaches the interaction while the ticket is empty.

### The bento grid

The dashboard uses a 12-column grid with `container-type: inline-size` on the
main column, so cards reflow against **their container**, not the viewport.
Collapsing the sidebar re-lays the dashboard correctly with no media query
involved.

---

## 9. Writing

The interface's voice is a competent colleague: plain, specific, never cute.

| Instead of | Write |
| --- | --- |
| "Oops! Something went wrong" | "Could not reach the printer at 192.168.0.42" |
| "Item unavailable" | "86'd — potato spirals finished" |
| "Invalid price" | "This was left blank on the printed menu" |
| "Are you sure?" | "Void 1× Chilli Chicken from ORD-2440?" |
| "Success!" | "KOT fired to 3 stations: Wok, Fryer, Cha Counter" |

Kitchen vocabulary is used where kitchen staff will read it — **86**, **KOT**,
**cover**, **the pass**, **fire**. Owner-facing screens use business
vocabulary — **net sales**, **average bill**, **commission**, **margin**. Using
the wrong register is how software announces it was not built for this trade.

Numbers always carry their unit and their context: *"₹30,190 · 92 orders
settled"*, not a bare figure.

---

## 10. Accessibility

WCAG 2.2 AA is the floor.

| Commitment | Implementation |
| --- | --- |
| **Contrast** | Body ≥ 4.5:1, large text and UI boundaries ≥ 3:1, verified in both themes |
| **Focus** | `:focus-visible` ring on every interactive element, 2px offset against the canvas so it is visible on any surface |
| **Targets** | 44×44 minimum on POS, KDS and guest; 30px permitted in dense desktop tables |
| **Motion** | `prefers-reduced-motion` collapses every duration token to 1ms |
| **Semantics** | Real `<button>` elements; `aria-pressed` and `aria-selected` for toggles; `aria-current="page"` in navigation; `role="status"` live region for toasts |
| **Keyboard** | <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> palette, <kbd>F2</kbd> POS search, <kbd>Esc</kbd> closes every overlay, focus trapped in drawers and returned on close |
| **Skip link** | First focusable element on every page |
| **Colour independence** | Every status carries a text label or icon alongside its colour |

Automated `axe-core` checks run on every console route and the guest menu in CI;
zero criticals is a merge requirement.

---

## 11. Browser support

The prototype targets **current evergreen browsers** and uses `oklch()`,
`color-mix()`, container queries, `:has()` and `@supports (animation-timeline)`
without fallbacks. That is a deliberate choice for a 2026 prototype.

For production, two of these need a policy decision:

- **`oklch()` and `color-mix()`** — a PostCSS build emits sRGB fallbacks ahead of
  each declaration, so an older browser gets a correct-but-flatter palette.
- **Container queries** — supported everywhere current; the fallback is the
  viewport-width media queries already present in `shell.css`.

`animation-timeline` scroll reveals are already progressively enhanced inside
`@supports` and degrade to no animation, which is the correct behaviour anyway.

---

## 12. File map

| File | Contains |
| --- | --- |
| `assets/css/tokens.css` | Layers 1–3. **The only file permitted to define a colour.** |
| `assets/css/base.css` | Reset, element defaults, typography helpers, layout utilities |
| `assets/css/components.css` | The pattern library |
| `assets/css/shell.css` | Console chrome: sidebar, topbar, main column |
| `assets/css/pages.css` | Screens with a shape of their own: POS, KDS, floor plan, guest, marketing |
| `assets/css/app.css` | `@import` entry point — one `<link>` per page, bundled in production |
| `assets/icons/sprite.svg` | 101 symbols |
| `styleguide.html` | The living, self-documenting version of this file |
