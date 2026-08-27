/**
 * RestrOS demo-data generator.
 *
 * Deterministic (seeded) so every run produces byte-identical JSON and the
 * prototype's numbers stay stable across screenshots, docs and reviews.
 *
 *   node prototype/data/_seed.mjs
 *
 * Reads:  prototype/data/menu.json
 * Writes: orders.json, analytics.json, inventory.json, customers.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const menu = JSON.parse(readFileSync(join(DIR, 'menu.json'), 'utf8'));

/* ---------------------------------------------------------------- rng ---- */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260827);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p) => rnd() < p;
const round2 = (n) => Math.round(n * 100) / 100;

/* -------------------------------------------------------------- menu ----- */
const sellable = menu.categories.flatMap((c) =>
  c.items
    .filter((i) => !i.pendingPrice && !i.draft)
    .map((i) => ({
      id: i.id,
      name: c.items.length && ['cat_fried_rice', 'cat_hakka_noodles', 'cat_momo'].includes(c.id)
        ? `${c.name} - ${i.name}`
        : i.name,
      base: i.price ?? (i.variants ? i.variants[0].price : 0),
      variants: i.variants || null,
      cat: c.id,
      catName: c.name,
      station: i.station,
      veg: i.veg,
      tags: i.tags || [],
      prepMins: i.prepMins || 10,
    }))
);
// Popularity weights: bestsellers and cheap adda staples move far more often.
const weighted = [];
for (const it of sellable) {
  let w = 3;
  if (it.tags.includes('bestseller')) w += 9;
  if (it.tags.includes('adda')) w += 7;
  if (it.tags.includes('value')) w += 3;
  if (it.tags.includes('chef-special')) w += 2;
  if (it.cat === 'cat_tea_coffee') w += 6;
  if (it.cat === 'cat_rolls') w += 4;
  if (it.cat === 'cat_biriyani') w += 3;
  for (let i = 0; i < w; i++) weighted.push(it);
}

const TODAY = '2026-08-27';
const iso = (h, m, day = TODAY) =>
  `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;

const CHANNELS = [
  { id: 'dine_in', name: 'Dine-in', weight: 46, fee: 0 },
  { id: 'takeaway', name: 'Takeaway', weight: 22, fee: 0 },
  { id: 'qr', name: 'QR self-order', weight: 12, fee: 0 },
  { id: 'swiggy', name: 'Swiggy', weight: 11, fee: 0.22 },
  { id: 'zomato', name: 'Zomato', weight: 9, fee: 0.21 },
];
const channelPool = CHANNELS.flatMap((c) => Array(c.weight).fill(c));
const PAYMENTS = ['upi', 'upi', 'upi', 'upi', 'cash', 'cash', 'card', 'aggregator'];
const SERVERS = ['u_riya', 'u_ansh', 'u_deb'];
const TABLES = ['T1', 'T2', 'T4', 'T6', 'T10', 'M1', 'M5', 'TR2', 'T3', 'M2', 'TR1'];
const CUST_NAMES = [
  'Arindam Ghosh', 'Sudeshna Pal', 'Rohit Banerjee', 'Meghna Dutta', 'Ayan Chatterjee',
  'Piyali Saha', 'Subhro Das', 'Nabanita Roy', 'Kaushik Sen', 'Trina Mukherjee',
  'Deep Bhattacharya', 'Ishita Kar', 'Sayan Mitra', 'Ruma Halder', 'Abir Chowdhury',
  'Moumita Nag', 'Pritam Bose', 'Sohini Guha', 'Rajarshi Dey', 'Ankita Paul',
  'Soumyadeep Jana', 'Riddhi Basu', 'Tanushree Sil', 'Arka Sarkar', 'Debolina Ray',
  'Sandip Maity', 'Poulomi Das', 'Anirban Lahiri', 'Sreeja Mondal', 'Kunal Adhikari',
];

/* ------------------------------------------------------------ orders ----- */
// Kolkata service curve: lunch bump, big evening adda peak 19:00-21:30.
const HOUR_WEIGHT = {
  11: 2, 12: 5, 13: 8, 14: 6, 15: 3, 16: 4, 17: 6,
  18: 9, 19: 14, 20: 16, 21: 13, 22: 8, 23: 3,
};
const hourPool = Object.entries(HOUR_WEIGHT).flatMap(([h, w]) => Array(w).fill(Number(h)));

const NOW_H = 20, NOW_M = 12;
const minutesNow = NOW_H * 60 + NOW_M;

function buildLines(channel) {
  const n = channel.id === 'dine_in' ? int(2, 6) : int(1, 4);
  const lines = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const it = pick(weighted);
    const key = it.id;
    if (seen.has(key) && chance(0.75)) continue;
    seen.add(key);
    const variant = it.variants ? pick(it.variants) : null;
    const qty = chance(0.75) ? 1 : int(2, 3);
    const unit = variant ? variant.price : it.base;
    const mods = [];
    if (it.tags.includes('spicy') && chance(0.35)) mods.push({ name: pick(['Mild', 'Medium', 'Kolkata hot']), price: 0 });
    if (it.cat === 'cat_rolls' && chance(0.3)) mods.push({ name: 'Extra egg', price: 15 });
    if (it.cat === 'cat_tea_coffee' && chance(0.3)) mods.push({ name: pick(['Less sugar', 'No sugar', 'Kadak (extra liquor)']), price: chance(0.3) ? 5 : 0 });
    const modTotal = mods.reduce((a, m) => a + m.price, 0);
    lines.push({
      itemId: it.id,
      name: it.name,
      variant: variant ? variant.name : null,
      qty,
      unitPrice: unit,
      modifiers: mods,
      station: it.station,
      veg: it.veg,
      total: (unit + modTotal) * qty,
      prepMins: it.prepMins,
    });
  }
  if (!lines.length) {
    const it = sellable.find((s) => s.id === 'itm_roll_chicken');
    lines.push({ itemId: it.id, name: it.name, variant: null, qty: 1, unitPrice: it.base, modifiers: [], station: it.station, veg: it.veg, total: it.base, prepMins: it.prepMins });
  }
  return lines;
}

function statusFor(placedMin, lines) {
  const age = minutesNow - placedMin;
  const prep = Math.max(...lines.map((l) => l.prepMins));
  if (age < 2) return 'new';
  if (age < prep) return 'preparing';
  if (age < prep + 4) return 'ready';
  if (age < prep + 25) return chance(0.5) ? 'served' : 'paid';
  return 'paid';
}

// Two passes: the day's history, then a burst inside the last ~24 minutes so
// the kitchen display always opens with a realistic live rail.
const slots = [];
for (let i = 0; i < 130; i++) {
  const h = pick(hourPool);
  const m = int(0, 59);
  const placedMin = h * 60 + m;
  if (placedMin <= minutesNow) slots.push(placedMin);
}
for (let i = 0; i < 13; i++) slots.push(minutesNow - int(0, 24));
slots.sort((a, b) => a - b);

const orders = [];
let seq = 2400;
for (const placedMin of slots) {
  const h = Math.floor(placedMin / 60);
  const m = placedMin % 60;
  const channel = pick(channelPool);
  const lines = buildLines(channel);
  const subtotal = lines.reduce((a, l) => a + l.total, 0);
  const discount = chance(0.12) ? Math.round(subtotal * pick([0.05, 0.1, 0.1])) : 0;
  const packing = channel.id === 'takeaway' || channel.id === 'swiggy' || channel.id === 'zomato' ? int(1, 3) * 10 : 0;
  // Prices on the card are tax-inclusive; GST is backed out for reporting.
  const gross = subtotal - discount + packing;
  const taxable = round2(gross / 1.05);
  const gst = round2(gross - taxable);
  const status = statusFor(placedMin, lines);
  const cancelled = chance(0.03) && status !== 'new';
  const id = `ORD-${++seq}`;
  const readyAt = placedMin + Math.max(...lines.map((l) => l.prepMins)) + int(-2, 5);
  orders.push({
    id,
    kot: `K${String(seq - 2000).padStart(4, '0')}`,
    channel: channel.id,
    channelName: channel.name,
    status: cancelled ? 'cancelled' : status,
    table: channel.id === 'dine_in' || channel.id === 'qr' ? pick(TABLES) : null,
    guests: channel.id === 'dine_in' ? int(1, 6) : null,
    server: channel.id === 'dine_in' || channel.id === 'qr' ? pick(SERVERS) : null,
    customer: chance(0.55) ? pick(CUST_NAMES) : null,
    phone: chance(0.4) ? `+91 9${int(1000000000, 9999999999)}`.slice(0, 14) : null,
    placedAt: iso(h, m),
    readyAt: status === 'new' || status === 'preparing' ? null : iso(Math.floor(readyAt / 60), readyAt % 60),
    lines,
    subtotal,
    discount,
    packing,
    taxable,
    gst,
    total: gross,
    commission: channel.fee ? Math.round(gross * channel.fee) : 0,
    payment: cancelled ? null : channel.fee ? 'aggregator' : pick(PAYMENTS),
    prepMinsActual: Math.max(...lines.map((l) => l.prepMins)) + int(-3, 8),
    rating: chance(0.3) ? pick([5, 5, 5, 4, 4, 3]) : null,
  });
}
orders.sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1));

/* --------------------------------------------------------- analytics ---- */
const paid = orders.filter((o) => o.status === 'paid' || o.status === 'served');
const netSales = paid.reduce((a, o) => a + o.total, 0);
const covers = paid.reduce((a, o) => a + (o.guests || 1), 0);

const byHour = {};
for (const o of orders) {
  if (o.status === 'cancelled') continue;
  const h = Number(o.placedAt.slice(11, 13));
  byHour[h] = byHour[h] || { hour: h, orders: 0, sales: 0 };
  byHour[h].orders++;
  byHour[h].sales += o.total;
}

const itemTally = {};
for (const o of orders) {
  if (o.status === 'cancelled') continue;
  for (const l of o.lines) {
    const t = (itemTally[l.itemId] = itemTally[l.itemId] || { itemId: l.itemId, name: l.name, qty: 0, sales: 0, cat: '' });
    t.qty += l.qty;
    t.sales += l.total;
  }
}
for (const it of sellable) if (itemTally[it.id]) itemTally[it.id].cat = it.catName;
const topItems = Object.values(itemTally).sort((a, b) => b.sales - a.sales).slice(0, 12);

const catTally = {};
for (const t of Object.values(itemTally)) {
  catTally[t.cat] = (catTally[t.cat] || 0) + t.sales;
}
const categoryMix = Object.entries(catTally)
  .map(([name, sales]) => ({ name, sales }))
  .sort((a, b) => b.sales - a.sales);

const channelMix = CHANNELS.map((c) => {
  const list = orders.filter((o) => o.channel === c.id && o.status !== 'cancelled');
  return { id: c.id, name: c.name, orders: list.length, sales: list.reduce((a, o) => a + o.total, 0), commission: list.reduce((a, o) => a + o.commission, 0) };
}).sort((a, b) => b.sales - a.sales);

const payTally = {};
for (const o of orders) {
  if (!o.payment || o.status === 'cancelled') continue;
  payTally[o.payment] = (payTally[o.payment] || 0) + o.total;
}
const paymentMix = Object.entries(payTally).map(([id, sales]) => ({ id, name: { upi: 'UPI', cash: 'Cash', card: 'Card', aggregator: 'Aggregator payout' }[id], sales })).sort((a, b) => b.sales - a.sales);

// 30 days of history with a weekend lift and a light growth trend.
const trend = [];
const base = new Date('2026-07-29T00:00:00Z');
for (let d = 0; d < 30; d++) {
  const day = new Date(base.getTime() + d * 864e5);
  const dow = day.getUTCDay();
  const weekend = dow === 0 || dow === 5 || dow === 6 ? 1.28 : 1;
  const growth = 1 + d * 0.004;
  const noise = 0.88 + rnd() * 0.26;
  const sales = Math.round(33500 * weekend * growth * noise);
  trend.push({
    date: day.toISOString().slice(0, 10),
    dow,
    sales,
    orders: Math.round(sales / int(340, 420)),
    covers: Math.round(sales / int(185, 225)),
    aov: 0,
  });
}
for (const t of trend) t.aov = Math.round(t.sales / t.orders);

const prevWindow = trend.slice(0, 15).reduce((a, t) => a + t.sales, 0);
const thisWindow = trend.slice(15).reduce((a, t) => a + t.sales, 0);

const analytics = {
  meta: { tenant: 't_adda', outlet: 'out_adda_main', asOf: iso(NOW_H, NOW_M), currency: 'INR' },
  today: {
    netSales: Math.round(netSales),
    grossSales: Math.round(orders.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.total, 0)),
    orders: orders.filter((o) => o.status !== 'cancelled').length,
    covers,
    aov: Math.round(netSales / Math.max(paid.length, 1)),
    discounts: orders.reduce((a, o) => a + o.discount, 0),
    gst: Math.round(orders.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.gst, 0)),
    commission: orders.reduce((a, o) => a + o.commission, 0),
    voids: orders.filter((o) => o.status === 'cancelled').length,
    avgPrepMins: round2(orders.reduce((a, o) => a + o.prepMinsActual, 0) / orders.length),
    tableTurnMins: 47,
    repeatGuestPct: 38,
    deltas: { netSales: 12.4, orders: 8.1, aov: 3.9, covers: 6.2, avgPrepMins: -4.5 },
  },
  hourly: Object.values(byHour).sort((a, b) => a.hour - b.hour).map((h) => ({ ...h, sales: Math.round(h.sales) })),
  trend30d: trend,
  windowCompare: { current: thisWindow, previous: prevWindow, deltaPct: round2(((thisWindow - prevWindow) / prevWindow) * 100) },
  topItems: topItems.map((t) => ({ ...t, sales: Math.round(t.sales) })),
  slowMovers: Object.values(itemTally).sort((a, b) => a.qty - b.qty).slice(0, 6).map((t) => ({ ...t, sales: Math.round(t.sales) })),
  categoryMix: categoryMix.map((c) => ({ ...c, sales: Math.round(c.sales) })),
  channelMix,
  paymentMix: paymentMix.map((p) => ({ ...p, sales: Math.round(p.sales) })),
  prepTimeBuckets: [
    { bucket: '0-5 min', count: orders.filter((o) => o.prepMinsActual <= 5).length },
    { bucket: '6-10 min', count: orders.filter((o) => o.prepMinsActual > 5 && o.prepMinsActual <= 10).length },
    { bucket: '11-15 min', count: orders.filter((o) => o.prepMinsActual > 10 && o.prepMinsActual <= 15).length },
    { bucket: '16-20 min', count: orders.filter((o) => o.prepMinsActual > 15 && o.prepMinsActual <= 20).length },
    { bucket: '20+ min', count: orders.filter((o) => o.prepMinsActual > 20).length },
  ],
  staffLeaderboard: [
    { userId: 'u_riya', name: 'Riya Sen', covers: 22, sales: 6480, avgTicket: 295, rating: 4.8 },
    { userId: 'u_ansh', name: 'Anshuman Das', covers: 17, sales: 4910, avgTicket: 289, rating: 4.6 },
    { userId: 'u_deb', name: 'Debjani Roy', covers: 12, sales: 3980, avgTicket: 332, rating: 4.9 },
  ],
  insights: [
    { id: 'in_1', tone: 'positive', title: 'Cha is your traffic engine', body: 'Tea - Special appears in 31% of dine-in bills and pulls an average basket of ₹268. Bundling it with Chicken Roll (Adda Combo) is converting at 19%.', action: 'Promote Adda Combo on the QR menu' },
    { id: 'in_2', tone: 'warning', title: '11 items have no price', body: 'Fish Finger, Fish Fry, Fish Ball, all beverages and ice creams were blank on the printed card. They are hidden from the guest menu until priced.', action: 'Open menu editor' },
    { id: 'in_3', tone: 'warning', title: 'Aggregator margin is thin', body: 'Swiggy and Zomato take 21-22% commission. Their blended contribution margin is 9 points below dine-in for the same basket.', action: 'Review aggregator pricing' },
    { id: 'in_4', tone: 'neutral', title: 'Fryer is your bottleneck at 20:00', body: 'Median ticket time on the fryer station peaks at 18 min during the 20:00 rush while the wok sits at 11 min.', action: 'See station load' },
  ],
};

/* --------------------------------------------------------- inventory ---- */
const INGREDIENTS = [
  ['ing_chicken', 'Chicken (curry cut)', 'kg', 42, 30, 'Haji Meat Supply', 218, 'st_wok'],
  ['ing_boneless', 'Chicken (boneless)', 'kg', 18, 20, 'Haji Meat Supply', 296, 'st_wok'],
  ['ing_paneer', 'Paneer', 'kg', 6, 8, 'Metro Dairy', 340, 'st_wok'],
  ['ing_egg', 'Eggs', 'pc', 210, 180, 'Local vendor', 7, 'st_tandoor'],
  ['ing_rice', 'Basmati rice', 'kg', 55, 40, 'Burrabazar Traders', 118, 'st_rice'],
  ['ing_noodle', 'Hakka noodles', 'kg', 12, 15, 'Burrabazar Traders', 96, 'st_wok'],
  ['ing_potato', 'Potato', 'kg', 64, 35, 'Koley Market', 28, 'st_fry'],
  ['ing_spiral', 'Potato spirals (frozen)', 'pack', 0, 12, 'Frozen Foods Co', 145, 'st_fry'],
  ['ing_mushroom', 'Button mushroom', 'kg', 4, 6, 'Koley Market', 220, 'st_wok'],
  ['ing_babycorn', 'Baby corn', 'kg', 7, 6, 'Koley Market', 180, 'st_wok'],
  ['ing_onion', 'Onion', 'kg', 88, 50, 'Koley Market', 34, 'st_cold'],
  ['ing_cucumber', 'Cucumber', 'kg', 11, 10, 'Koley Market', 40, 'st_cold'],
  ['ing_maida', 'Maida', 'kg', 34, 25, 'Burrabazar Traders', 44, 'st_tandoor'],
  ['ing_oil', 'Refined oil', 'litre', 46, 40, 'Burrabazar Traders', 132, 'st_fry'],
  ['ing_soy', 'Soy sauce', 'litre', 9, 6, 'Sino Foods', 155, 'st_wok'],
  ['ing_schezwan', 'Schezwan paste', 'kg', 3, 5, 'Sino Foods', 260, 'st_wok'],
  ['ing_tea', 'Tea leaves (CTC)', 'kg', 5, 4, 'Assam Tea Depot', 420, 'st_cha'],
  ['ing_milk', 'Milk', 'litre', 28, 30, 'Metro Dairy', 58, 'st_cha'],
  ['ing_sugar', 'Sugar', 'kg', 19, 15, 'Burrabazar Traders', 46, 'st_cha'],
  ['ing_coffee', 'Coffee powder', 'kg', 2, 3, 'Assam Tea Depot', 640, 'st_cha'],
  ['ing_momo_sheet', 'Momo wrappers', 'pack', 22, 20, 'Tibet Foods', 65, 'st_fry'],
  ['ing_fish', 'Bhetki fillet', 'kg', 0, 8, 'Haji Meat Supply', 520, 'st_fry'],
  ['ing_packaging', 'Takeaway containers', 'pc', 340, 400, 'PackRight', 6, 'st_cold'],
];
const inventory = {
  meta: { tenant: 't_adda', outlet: 'out_adda_main', asOf: iso(NOW_H, NOW_M), valuationMethod: 'weighted-average' },
  items: INGREDIENTS.map(([id, name, unit, stock, par, supplier, cost, station]) => {
    const consumed = round2(par * (0.4 + rnd() * 0.5));
    const status = stock === 0 ? 'out' : stock < par * 0.6 ? 'critical' : stock < par ? 'low' : 'ok';
    return {
      id, name, unit, stock, par, supplier, unitCost: cost, station,
      value: Math.round(stock * cost),
      consumedToday: consumed,
      daysCover: stock === 0 ? 0 : round2(stock / Math.max(consumed, 0.1)),
      status,
      lastCountedAt: '2026-08-26T23:40:00+05:30',
      variancePct: round2((rnd() * 6 - 3)),
    };
  }),
  recipes: [
    { itemId: 'itm_chilli_chicken', yields: 1, components: [{ id: 'ing_boneless', qty: 0.22 }, { id: 'ing_onion', qty: 0.08 }, { id: 'ing_soy', qty: 0.02 }, { id: 'ing_oil', qty: 0.04 }], foodCost: 78, margin: 44.3 },
    { itemId: 'itm_bir_chicken', yields: 1, components: [{ id: 'ing_rice', qty: 0.18 }, { id: 'ing_chicken', qty: 0.16 }, { id: 'ing_potato', qty: 0.12 }, { id: 'ing_oil', qty: 0.03 }], foodCost: 62, margin: 43.6 },
    { itemId: 'itm_roll_chicken', yields: 1, components: [{ id: 'ing_maida', qty: 0.09 }, { id: 'ing_boneless', qty: 0.07 }, { id: 'ing_onion', qty: 0.03 }, { id: 'ing_oil', qty: 0.02 }], foodCost: 31, margin: 55.7 },
    { itemId: 'itm_tea_special', yields: 1, components: [{ id: 'ing_tea', qty: 0.006 }, { id: 'ing_milk', qty: 0.09 }, { id: 'ing_sugar', qty: 0.012 }], foodCost: 8.3, margin: 44.7 },
    { itemId: 'itm_momo_chicken', yields: 1, components: [{ id: 'ing_momo_sheet', qty: 0.12 }, { id: 'ing_boneless', qty: 0.08 }, { id: 'ing_onion', qty: 0.02 }], foodCost: 34, margin: 51.4 },
  ],
  purchaseOrders: [
    { id: 'PO-2026-114', supplier: 'Haji Meat Supply', status: 'draft', createdAt: '2026-08-27T09:10:00+05:30', expectedAt: '2026-08-28', total: 14820, lines: 3, note: 'Auto-drafted: bhetki out of stock, boneless below par' },
    { id: 'PO-2026-113', supplier: 'Frozen Foods Co', status: 'sent', createdAt: '2026-08-26T17:40:00+05:30', expectedAt: '2026-08-28', total: 5220, lines: 1, note: 'Potato spirals - 36 packs' },
    { id: 'PO-2026-112', supplier: 'Koley Market', status: 'received', createdAt: '2026-08-26T06:20:00+05:30', expectedAt: '2026-08-26', total: 8640, lines: 6, note: 'Daily vegetables' },
    { id: 'PO-2026-111', supplier: 'Metro Dairy', status: 'received', createdAt: '2026-08-25T06:15:00+05:30', expectedAt: '2026-08-25', total: 4210, lines: 2, note: 'Milk + paneer' },
  ],
  wastage: [
    { at: '2026-08-27T16:20:00+05:30', item: 'ing_mushroom', qty: 0.6, unit: 'kg', reason: 'Spoilage', value: 132, by: 'u_babu' },
    { at: '2026-08-27T14:05:00+05:30', item: 'ing_rice', qty: 1.2, unit: 'kg', reason: 'Burnt batch', value: 142, by: 'u_montu' },
    { at: '2026-08-26T21:50:00+05:30', item: 'ing_milk', qty: 2, unit: 'litre', reason: 'Curdled', value: 116, by: 'u_deb' },
  ],
};

/* --------------------------------------------------------- customers ---- */
const TIERS = [
  { id: 'gold', name: 'Gold', min: 12 },
  { id: 'silver', name: 'Silver', min: 6 },
  { id: 'bronze', name: 'Bronze', min: 2 },
  { id: 'new', name: 'New', min: 0 },
];
const customers = {
  meta: { tenant: 't_adda', description: 'CRM + loyalty demo set.', asOf: iso(NOW_H, NOW_M) },
  program: { name: 'Adda Points', earnRate: '1 point per ₹20', redeemRate: '100 points = ₹50', enrolled: 1284, activeRate: 41 },
  segments: [
    { id: 'seg_regulars', name: 'Adda regulars', rule: 'visits >= 8 in 90 days', size: 186, avgSpend: 312 },
    { id: 'seg_lapsed', name: 'Lapsed 45d+', rule: 'last visit > 45 days', size: 274, avgSpend: 268 },
    { id: 'seg_biriyani', name: 'Biriyani lovers', rule: 'ordered Biriyani 3+ times', size: 412, avgSpend: 345 },
    { id: 'seg_veg', name: 'Veg only', rule: 'no non-veg lines in last 5 orders', size: 97, avgSpend: 224 },
    { id: 'seg_highvalue', name: 'High value', rule: 'lifetime spend > ₹8,000', size: 63, avgSpend: 486 },
  ],
  customers: CUST_NAMES.map((name, i) => {
    const visits = int(1, 34);
    const avg = int(150, 520);
    const tier = TIERS.find((t) => visits >= t.min);
    const daysAgo = int(0, 90);
    return {
      id: `cus_${String(i + 1).padStart(3, '0')}`,
      name,
      phone: `+91 9${String(int(100000000, 999999999)).padStart(9, '0')}`,
      email: chance(0.4) ? `${name.split(' ')[0].toLowerCase()}${int(10, 99)}@example.com` : null,
      visits,
      lifetimeSpend: visits * avg,
      avgTicket: avg,
      points: Math.round((visits * avg) / 20),
      tier: tier.id,
      lastVisitDaysAgo: daysAgo,
      lastVisit: new Date(Date.parse('2026-08-27T00:00:00Z') - daysAgo * 864e5).toISOString().slice(0, 10),
      favourite: pick(sellable.filter((s) => s.tags.includes('bestseller'))).name,
      channel: pick(['dine_in', 'takeaway', 'swiggy', 'qr', 'zomato']),
      veg: chance(0.22),
      optIn: chance(0.7),
      note: chance(0.15) ? pick(['Prefers terrace', 'Allergic to mushroom', 'Always asks for kadak cha', 'Regular Sunday lunch', 'Corporate - needs GST bill']) : null,
    };
  }).sort((a, b) => b.lifetimeSpend - a.lifetimeSpend),
  campaigns: [
    { id: 'cmp_1', name: 'Monsoon pakora hour', channel: 'WhatsApp', segment: 'seg_regulars', status: 'running', sent: 186, opened: 141, redeemed: 38, revenue: 11240 },
    { id: 'cmp_2', name: 'We miss you - ₹50 off', channel: 'SMS', segment: 'seg_lapsed', status: 'scheduled', sent: 0, opened: 0, redeemed: 0, revenue: 0 },
    { id: 'cmp_3', name: 'Biriyani Sunday', channel: 'WhatsApp', segment: 'seg_biriyani', status: 'completed', sent: 412, opened: 320, redeemed: 96, revenue: 34180 },
  ],
  feedback: [
    { at: '2026-08-27T19:58:00+05:30', name: 'Meghna Dutta', rating: 5, text: 'Egg chicken roll is exactly like the para shop from my childhood. Cha was perfect.', order: 'ORD-2453', channel: 'qr' },
    { at: '2026-08-27T19:20:00+05:30', name: 'Subhro Das', rating: 3, text: 'Biriyani took almost 25 minutes on a weekday. Taste was good though.', order: 'ORD-2447', channel: 'dine_in' },
    { at: '2026-08-27T15:02:00+05:30', name: 'Piyali Saha', rating: 4, text: 'Wanted fish fry but it was not available. Please add it back.', order: 'ORD-2431', channel: 'takeaway' },
    { at: '2026-08-26T21:44:00+05:30', name: 'Ayan Chatterjee', rating: 5, text: 'Terrace adda with kadak cha. Ten on ten.', order: 'ORD-2398', channel: 'dine_in' },
  ],
};

/* ------------------------------------------------------------- write ---- */
const write = (name, obj) => {
  writeFileSync(join(DIR, name), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  console.log(`  ${name.padEnd(18)} ${(JSON.stringify(obj).length / 1024).toFixed(1)} kB`);
};
console.log('RestrOS demo data:');
write('orders.json', { meta: { tenant: 't_adda', outlet: 'out_adda_main', businessDate: TODAY, asOf: iso(NOW_H, NOW_M), count: orders.length }, orders });
write('analytics.json', analytics);
write('inventory.json', inventory);
write('customers.json', customers);
console.log(`  done - ${orders.length} orders, ${sellable.length} sellable items`);
