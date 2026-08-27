# RestrOS

**The operating system for restaurants.**

A multi-tenant SaaS platform that runs the whole floor — point of sale, kitchen
display, table management, QR ordering, inventory, loyalty, staffing and
reporting — from a single versioned menu.

This repository currently contains a **complete front-end prototype** and the
**engineering documentation** for the production build.

---

## Why "RestrOS"

The brief asked for a name that is short, memorable, and conveys efficiency,
hospitality and technology. `RestrOS` earns all four:

| Requirement | How the name delivers |
| --- | --- |
| **Short** | Seven letters, two syllables, one word. Fits a favicon, a sidebar and a tab title. |
| **Memorable** | A portmanteau you only have to hear once: *restaurant* + *OS*. |
| **Efficiency** | "OS" carries the promise directly — the layer everything else runs on, always on, never in the way. |
| **Hospitality** | The `Restr-` stem keeps the word rooted in *restaurant* and *restore*, not in generic B2B vocabulary. |
| **Technology** | "OS" is unambiguous engineering language without being jargon. |

It also survives the practical tests: it is pronounceable in Hindi and Bengali
("res-tros"), has no unfortunate meaning in Indian languages, works as a verb-free
logotype (`Restr` + accent-coloured `OS`), and leaves room for sub-products —
RestrOS Pay, RestrOS Kitchen, RestrOS Cloud.

> Names considered and rejected: *Servio* (crowded namespace), *Plateform*
> (a pun that stops being funny), *Thali* (regionally narrow for a global
> platform), *Mise* (from *mise en place* — invisible to non-chefs).

---

## What is in this repository

```
restros/
├── README.md                  ← you are here
├── docs/
│   ├── PLAN.md                Phase-by-phase delivery plan with checklists
│   ├── ARCHITECTURE.md        Front-end + back-end architecture, multi-tenancy
│   ├── DATA-MODEL.md          Prisma schema, tenancy strategy, migrations
│   ├── API.md                 tRPC/REST surface, webhooks, realtime contracts
│   ├── DESIGN-SYSTEM.md       Tokens, colour, type, icons, component rules
│   └── MENU-REFERENCE.md      The source menu, transcribed, with open questions
├── prototype/                 The clickable front-end (HTML + CSS + JS, no build)
│   ├── index.html             Marketing site
│   ├── login.html             Sign in (email or POS PIN)
│   ├── signup.html            Tenant provisioning wizard
│   ├── styleguide.html        Living design system
│   ├── app/                   The operator console (13 screens)
│   ├── guest/menu.html        Guest QR menu
│   ├── assets/
│   │   ├── css/               tokens → base → components → shell → pages
│   │   ├── js/                ES modules, one per screen
│   │   └── icons/sprite.svg   101-icon hand-built SVG sprite
│   └── data/                  Demo data as JSON + a deterministic generator
└── tools/check.mjs            Static sanity checks for the prototype
```

---

## Running the prototype

The prototype reads its demo data with `fetch()` and loads ES modules, so it
**must be served over HTTP**. Opening the files directly with `file://` will
fail with a CORS error (the prototype detects this and tells you so).

### With XAMPP (this repo already lives in `htdocs`)

1. Start Apache from the XAMPP control panel.
2. Open **<http://localhost/restros/prototype/>**

### With any static server

```bash
npx serve prototype        # or: python -m http.server 8080 -d prototype
```

There is **no build step, no package.json and no runtime dependency**. The only
external requests are three Google Fonts stylesheets; everything else — icons,
charts, data — is local.

### Where to start clicking

| Screen | Path | What it demonstrates |
| --- | --- | --- |
| Marketing site | `/prototype/index.html` | Positioning, pricing from live plan data |
| **Console dashboard** | `/prototype/app/dashboard.html` | Bento KPIs, charts, live service rail |
| **POS terminal** | `/prototype/app/pos.html` | The real interaction model: search → tap → modifiers → KOT → settle |
| **Kitchen display** | `/prototype/app/kds.html` | Station rails, age colouring, bump/recall |
| **Menu manager** | `/prototype/app/menu.html` | Blank-price handling and handwritten-note suggestions |
| Tables | `/prototype/app/tables.html` | Floor plan, covers, reservation book |
| Orders | `/prototype/app/orders.html` | Ticket ledger with a detail drawer |
| Inventory | `/prototype/app/inventory.html` | Par levels, recipe costing, wastage |
| Customers | `/prototype/app/customers.html` | Loyalty tiers, segments, campaigns |
| Reports | `/prototype/app/reports.html` | Channel margin, dish margin, GST summary |
| Staff & roles | `/prototype/app/staff.html` | The RBAC permission matrix |
| Settings / Billing | `/prototype/app/settings.html`, `billing.html` | Tenant configuration and subscription |
| **Platform console** | `/prototype/app/platform.html` | The multi-tenant control plane |
| **Guest QR menu** | `/prototype/guest/menu.html` | The public surface, same `menu.json` |
| Design system | `/prototype/styleguide.html` | Every token and component, self-documenting |

Keyboard: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd> opens the command palette
anywhere in the console. <kbd>F2</kbd> focuses search in the POS.
<kbd>Esc</kbd> closes any overlay.

---

## The demo data

Everything on screen comes from `prototype/data/*.json`. The menu was
transcribed from a real printed menu card — **Cafe Adda Khana, Kolkata** — and
that card drove several product decisions (see
[docs/MENU-REFERENCE.md](docs/MENU-REFERENCE.md)):

- **75 items across 12 categories**, with portions (`8 pc`, `4 stick`) preserved.
- **11 items had no price printed at all.** Rather than inventing numbers, they
  carry `price: null, pendingPrice: true`. The console shows them as
  "Needs price"; the POS refuses to sell them; the guest menu never renders them.
- **Four prices existed only as pen marks** in the margin of the photographed
  card. They are stored as `annotation` objects with a `suggestedPrice` and a
  `needs-confirmation` status — surfaced in the menu manager with a one-tap
  Apply, never silently applied.
- Momo carries a genuine **variant axis** (steam / fry / pan-fry at ₹50/₹60/₹70),
  which is what makes the POS variant sheet worth building.

The bulk data — 96 orders, 30 days of trend, inventory, customers — is generated
deterministically so the numbers never drift between runs:

```bash
node prototype/data/_seed.mjs
```

Regenerating is only necessary if you change `menu.json`.

---

## Checks

```bash
node --experimental-vm-modules tools/check.mjs
```

Parses every JS module and JSON file, resolves every stylesheet/script path in
every HTML file, and verifies that every icon referenced by name actually exists
in the sprite.

---

## Documentation map

| Document | Read it when you want to know… |
| --- | --- |
| [PLAN.md](docs/PLAN.md) | What gets built, in what order, and how we know a phase is done |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system is put together: Next.js, Prisma, PostgreSQL, realtime, offline |
| [DATA-MODEL.md](docs/DATA-MODEL.md) | The schema, and how tenant isolation is actually enforced |
| [API.md](docs/API.md) | Every endpoint, event and webhook contract |
| [DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Why the interface looks and behaves the way it does |
| [MENU-REFERENCE.md](docs/MENU-REFERENCE.md) | The source menu, and the questions it left open |

---

## Status and honest limitations

This is a **prototype and a plan**, not a running product.

- There is **no back end**. Every mutation lives in memory and is announced with
  a toast; refreshing the page resets it. The Next.js/Prisma/PostgreSQL stack
  described in `ARCHITECTURE.md` is designed, not implemented.
- Authentication is **cosmetic**. Any submit on the login page opens the console.
- Payments, printing, aggregator sync and WhatsApp are **stubs** — the buttons
  exist and explain what they would do.
- The multi-tenant story is demonstrated through the tenant switcher, the
  platform console and the RBAC matrix; the isolation it describes (row-level
  security, per-tenant keys) is a design commitment, not running code.
- The prototype targets **current evergreen browsers**. It uses `oklch()`,
  `color-mix()`, container queries and `:has()` without fallbacks, which is
  deliberate for a 2026 prototype and would need a support policy decision
  before production.

Every stub says so on screen. Nothing pretends to work that does not.

---

## Licence

Prototype and documentation, © 2026. Menu content is transcribed from a
publicly displayed menu card and is used here as reference data only.
