# Menu Reference — Cafe Adda Khana

The source data for the entire prototype. Transcribed from a printed menu card
(and photographs of the same card with handwritten annotations) supplied as the
project reference.

Machine-readable version: [`prototype/data/menu.json`](../prototype/data/menu.json)

---

## Why this document exists

Real menu data is messier than any schema designed in the abstract. This card
contained three things a clean sample menu would never have shown us, and each
one produced a product decision:

| What the card actually had | What it forced into the design |
| --- | --- |
| **11 items with the price left blank** | `pendingPrice` as a first-class state — visible in the console, unsellable in the POS, invisible to guests. Not `0`, not an error. |
| **Prices written in pen in the margin** | An `annotation` object with a `suggestedPrice` and a confirmation status. The system proposes; the owner decides. Nothing is silently inferred. |
| **A dish sold daily that never made it onto the card** | A `draft` state for items that exist in the kitchen before they exist in the catalogue. |

If the reference menu had been tidy, the menu manager would have been a CRUD
table and the product would have been worse.

---

## The card

> **CAFE ADDA KHANA** — Kolkata · Est. Adda
> *"Where every plate comes with a story & a cup of cha"*
> All prices in ₹ (INR) and inclusive of applicable taxes. Menu subject to availability.

**12 categories · 75 items · ₹10 – ₹180**

---

## Transcription

Prices as printed. `—` means the price was blank on the card.

### Starters · Veg

| Item | Portion | Price |
| --- | --- | ---: |
| Crispy Chilli Baby Corn | | ₹100 |
| French Fries | | ₹60 |
| Chilli Potato | | ₹70 |
| Veg Pakora | 10 pc | ₹60 ⚠️ |
| Chilli Mushroom | | ₹130 |
| Salt & Pepper Mushroom | | ₹130 |
| Spring Potato | 2 pc | ₹80 |
| Chilli Paneer | 10 pc | ₹100 |

### Starters · Non-Veg

| Item | Portion | Price |
| --- | --- | ---: |
| Chicken Lollipop | 4 pc | ₹90 |
| Drums of Heaven | 4 pc | ₹130 |
| Dry Chilli Chicken | 8 pc | ₹150 |
| Salt & Pepper Chicken | 8 pc | ₹150 |
| Dry Honey Chicken | 8 pc | ₹160 |
| Dragon Chicken | 10 pc | ₹160 |
| **Fish Finger** | 6 pc | **—** |
| **Fish Fry** | | **—** |
| **Fish Ball** | 4 pc | **—** |

### Chicken · Gravy

| Item | Portion | Price |
| --- | --- | ---: |
| Chilli Chicken | 8 pc | ₹140 |
| Chicken Manchurian | 6 pc | ₹120 |
| Schezwan Chicken | 8 pc | ₹160 |
| Hot Garlic Chicken | 8 pc | ₹150 |
| Shanghai Chicken | 8 pc | ₹160 |
| Chicken Satay | 4 stick | ₹180 |
| Chicken 65 | 8 pc | ₹130 |
| Honey Chicken | 8 pc | ₹130 |
| Sweet & Sour Chicken | 8 pc | ₹150 |
| Roasted Chilli Chicken | 8 pc | ₹160 |

### Fried Rice

| Variant | Price | | Variant | Price |
| --- | ---: | --- | --- | ---: |
| Veg | ₹50 | | Hong Kong | ₹140 |
| Egg | ₹70 | | Hot Garlic | ₹130 |
| Mix | ₹120 | | Singapore | ₹130 |
| Schezwan (Chicken) | ₹140 | | Manchurian | ₹130 |
| | | | Chicken | ₹100 |

### Hakka Noodles

| Variant | Price | | Variant | Price |
| --- | ---: | --- | --- | ---: |
| Veg | ₹60 | | Hong Kong | ₹120 |
| Egg | ₹70 | | Hot Garlic | ₹80 |
| Mix | ₹110 | | Singapore | ₹110 |
| Schezwan (Chicken) | ₹120 | | Manchurian | ₹110 |
| | | | Chicken | ₹90 |

### Momo

The only true **variant axis** on the card, and the reason the POS has a variant
sheet at all.

| | Steam | Fry | Pan Fry |
| --- | ---: | ---: | ---: |
| Veg | ₹50 | ₹60 | ₹70 |
| Chicken | ₹70 | ₹80 | ₹90 |

### Rolls

| Item | Price |
| --- | ---: |
| Veg Roll | ₹30 |
| Egg Roll | ₹40 |
| Chicken Roll | ₹70 |
| Egg Chicken Roll | ₹80 |
| Paneer Roll | ₹50 |

### Biriyani

| Item | Price |
| --- | ---: |
| Aloo Biriyani | ₹70 |
| Egg Biriyani | ₹80 |
| Chicken Biriyani | ₹110 |
| Special Chicken Biriyani | ₹150 |

### Moghlai

| Item | Price |
| --- | ---: |
| Egg Moghlai | ₹80 |
| Chicken Moghlai | ₹130 |
| Special Moghlai | ₹150 |
| *Chicken Chaap* | *₹70* ✍️ |

### Salad

| Item | Price |
| --- | ---: |
| Onion Salad | ₹30 |
| Cucumber Salad | ₹40 |
| Green Salad | ₹50 |

### Drinks & Ice Cream — **every price blank**

| Item | Price |
| --- | ---: |
| Mineral Water (500 ml) | **—** |
| Mineral Water (1 litre) | **—** |
| Cold Drinks | **—** |
| Ice Cream — Vanilla | **—** |
| Ice Cream — Strawberry | **—** |
| Ice Cream — Chocolate | **—** |
| Ice Cream — 2 in One | **—** |
| Ice Cream — Mango | **—** |

### Tea & Coffee — blank on the card, supplied in pen

| Item | Price |
| --- | ---: |
| Tea — Normal | ₹10 ✍️ |
| Tea — Special | ₹15 ✍️ |
| Coffee — Normal | ₹20 ✍️ |
| Coffee — Special | ₹25 ✍️ |

---

## Handwritten annotations

Four sets of pen marks appear on the photographed card. Each is stored as an
`annotation` object rather than being applied to the price directly.

| Mark | Read as | Status in `menu.json` |
| --- | --- | --- |
| `10 · 15 · 20 · 25` written beside the Tea & Coffee block | The four missing beverage prices, in printed order | **Applied.** The sequence maps unambiguously to four consecutive blank rows. |
| `Pakora → 40` | Veg Pakora repriced from ₹60 to ₹40 | **Needs confirmation.** A 33% cut is plausible (a smaller portion, a monsoon promotion) but it is a real revenue decision. |
| `Chicken chaap → 70` | A new item, priced ₹70 | **Needs confirmation, held as a draft.** Chicken Chaap is a Kolkata staple and its absence from a Moghlai section is conspicuous — but ₹70 is low for chaap, so the price is proposed, not assumed. |
| Assorted marks near the Rolls block | Illegible in the photograph | **Not transcribed.** Recorded here as an open question rather than guessed at. |

### The rule this encodes

> A price the system infers is a price the restaurant did not choose.

Applied annotations become the price. Unconfirmed ones appear in the menu
manager as a suggestion card with the item, the pen mark, the current price and
the proposed price, plus **Apply** and **Dismiss**. Nothing reaches a guest
until a human has agreed to it.

---

## Open questions for the restaurant

These would go to the owner before the menu is published. They are listed here
because leaving them implicit is how a prototype quietly becomes wrong.

1. **The eleven blank prices.** Fish Finger, Fish Fry, Fish Ball, both mineral
   waters, cold drinks and five ice creams. Are these still sold?
2. **Veg Pakora at ₹40** — is this a permanent reprice or a seasonal offer? The
   distinction matters for margin reporting.
3. **Chicken Chaap** — confirm the item and the ₹70 price, and whether it belongs
   under Moghlai or in its own section.
4. **Fried Rice and Hakka Noodles "Schezwan"** are annotated *(Chicken)* on the
   card while every sibling variant is unmarked. Are the others vegetarian by
   default, or is the note simply inconsistent? This affects the veg/non-veg
   mark, which is a legal requirement.
5. **Cold Drinks** is a single line. Is it one price for any bottle, or does it
   need to become per-brand and per-size items?
6. **Ice cream** — one price for all five flavours, or five prices?
7. **Portion sizes** are given for some items (`8 pc`, `4 stick`) and not others.
   Do the unmarked items have a standard portion worth recording?
8. **GST treatment.** The card says prices are tax-inclusive at 5%. Packaged
   water and bottled drinks are taxed differently from restaurant service —
   confirm before the beverage prices are entered.

---

## What the data drives

| Prototype surface | How it uses this menu |
| --- | --- |
| **POS terminal** | The whole catalogue. Unpriced items render disabled with "Needs price". Momo opens the variant sheet. Spicy items offer a spice-level modifier. |
| **Guest QR menu** | Priced, non-draft items only. 86'd items appear greyed so guests stop asking staff. |
| **Menu manager** | Every item, plus the blank-price banner and the handwritten-suggestion cards. |
| **Kitchen display** | `station` routes each line to the right rail; `prepMins` sets the target that drives the green → amber → red timer. |
| **Reports** | `tags` and category structure produce the mix analysis; the seed weights bestsellers and cha to make demand realistic. |
| **Inventory** | Recipes link ingredients to five of these items, which is what makes the food-cost and margin figures real. |

---

## Provenance

Transcribed 27 August 2026 from a printed menu card and three photographs of the
same card. Menu content belongs to Cafe Adda Khana, Kolkata, and is used here as
reference data for a prototype. Prices reflect the card as photographed and are
not a current price list.
