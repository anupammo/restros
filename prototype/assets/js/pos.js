/* ============================================================================
   POS Terminal
   Reads menu.json, builds a ticket in memory, and settles it. Everything a
   cashier does in one screen with no navigation: search, filter, tap, fire.

   Keyboard: F2 search · Esc clears search/closes drawer · Enter adds the only
   visible result. Touch targets stay ≥44px because this runs on a counter tablet.
   ========================================================================== */
import { $, $$, esc, icon, money, loadAll, ready, on, toast, trapFocus } from './core.js';
import { initShell } from './shell.js';

const GST_RATE = 0.05; // menu prices are tax-inclusive; GST is backed out for the bill

const state = {
  menu: null,
  floor: null,
  lines: [],          // { key, itemId, name, portion, variant, unit, qty, mods[], station, veg }
  category: 'all',
  diet: 'all',
  query: '',
  type: 'dine_in',
  pay: 'cash',
  discountPct: 0,
  pending: null,      // item awaiting options in the drawer
};

ready(async () => {
  await initShell({
    page: 'pos',
    title: 'POS Terminal',
    crumb: 'Operate',
    actions: `<span class="badge badge-warning hide-sm" data-tip="Orders queue locally and sync when the link returns">
                ${icon('offline', 'icon-sm')} Offline-ready</span>`,
  });
  const [menu, floor] = await loadAll('menu', 'floor');
  state.menu = menu;
  state.floor = floor;

  buildCategoryRail();
  buildTableSelects();
  renderGrid();
  renderTicket();
  wire();
});

/* ------------------------------------------------------------------ catalogue */
const allItems = () =>
  state.menu.categories.flatMap((c) => c.items.map((i) => ({ ...i, cat: c, catName: c.name, catSub: c.subtitle })));

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  return allItems().filter((i) => {
    if (i.draft) return false;
    if (state.category !== 'all' && i.cat.id !== state.category) return false;
    if (state.diet === 'veg' && !i.veg) return false;
    if (state.diet === 'nonveg' && i.veg) return false;
    if (q && !`${i.name} ${i.catName} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function buildCategoryRail() {
  const cats = state.menu.categories;
  $('#posCats').innerHTML =
    `<button class="chip" data-cat="all" aria-pressed="true">All items</button>` +
    cats.map((c) => `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="false">
        ${esc(c.name)}${c.subtitle ? ` <span class="faint">${esc(c.subtitle)}</span>` : ''}
      </button>`).join('');
}

function buildTableSelects() {
  const free = state.floor.tables.filter((t) => t.status !== 'blocked');
  $('#posTable').innerHTML = free
    .map((t) => `<option value="${esc(t.id)}" ${t.id === 'T3' ? 'selected' : ''}>
      Table ${esc(t.id)} · ${t.seats} seats${t.status === 'occupied' ? ' (occupied)' : ''}</option>`).join('');
  $('#posGuests').innerHTML = Array.from({ length: 12 }, (_, i) =>
    `<option value="${i + 1}" ${i === 1 ? 'selected' : ''}>${i + 1} guest${i ? 's' : ''}</option>`).join('');
}

function renderGrid() {
  const items = visibleItems();
  $('#posCount').textContent = `${items.length} items`;
  const grid = $('#posGrid');

  if (!items.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      ${icon('search', 'icon-xl')}<h4>Nothing matches “${esc(state.query)}”</h4>
      <p>Try a shorter word, or clear the veg / non-veg filter.</p></div>`;
    return;
  }

  // Group under category headings when showing everything.
  const grouped = state.category === 'all' && !state.query;
  let html = '';
  let lastCat = null;
  for (const item of items) {
    if (grouped && item.cat.id !== lastCat) {
      lastCat = item.cat.id;
      html += `<div class="pos-cat-head"><h3>${esc(item.catName)}</h3>
        <span class="t-2xs faint">${esc(item.catSub || '')}</span></div>`;
    }
    html += itemTile(item);
  }
  grid.innerHTML = html;
}

function itemTile(item) {
  const inTicket = state.lines.filter((l) => l.itemId === item.id).reduce((a, l) => a + l.qty, 0);
  const price = item.price ?? (item.variants ? Math.min(...item.variants.map((v) => v.price)) : null);
  const blocked = item.pendingPrice || !item.available;
  const reason = item.pendingPrice ? 'Needs price' : item.outOfStockReason ? '86’d' : 'Unavailable';

  return `<button class="pos-item" data-item="${esc(item.id)}"
      ${blocked ? `data-unavailable="true" data-reason="${esc(reason)}" disabled` : ''}>
    ${inTicket ? `<span class="qty-flag">${inTicket}</span>` : ''}
    <span class="diet ${item.veg ? 'diet-veg' : ''}" aria-label="${item.veg ? 'Vegetarian' : 'Non-vegetarian'}"></span>
    <span class="pos-item-name">${esc(item.name)}</span>
    ${item.portion ? `<span class="pos-item-portion">${esc(item.portion)}</span>` : ''}
    <span class="pos-item-price">${item.variants ? `${money(price)}+` : money(price)}</span>
  </button>`;
}

/* ------------------------------------------------------------------ ticket */
function lineKey(itemId, variantId, mods) {
  return [itemId, variantId || '', ...mods.map((m) => m.id).sort()].join('|');
}

function addLine(item, { variant = null, mods = [] } = {}) {
  const key = lineKey(item.id, variant?.id, mods);
  const found = state.lines.find((l) => l.key === key);
  if (found) { found.qty++; }
  else {
    state.lines.push({
      key,
      itemId: item.id,
      name: item.name,
      catName: item.catName,
      portion: item.portion || null,
      variant: variant ? variant.name : null,
      unit: (variant ? variant.price : item.price) + mods.reduce((a, m) => a + m.price, 0),
      qty: 1,
      mods,
      station: item.station,
      veg: item.veg,
    });
  }
  renderTicket();
  renderGrid();
}

function setQty(key, delta) {
  const line = state.lines.find((l) => l.key === key);
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) state.lines = state.lines.filter((l) => l.key !== key);
  renderTicket();
  renderGrid();
}

function totals() {
  const subtotal = state.lines.reduce((a, l) => a + l.unit * l.qty, 0);
  const discount = Math.round(subtotal * (state.discountPct / 100));
  const packing = state.type === 'takeaway' || state.type === 'delivery' ? (state.lines.length ? 20 : 0) : 0;
  const gross = subtotal - discount + packing;
  const taxable = gross / (1 + GST_RATE);
  const gst = gross - taxable;
  return { subtotal, discount, packing, gross, taxable, gst, cgst: gst / 2, sgst: gst / 2 };
}

function renderTicket() {
  const host = $('#ticketLines');
  if (!state.lines.length) {
    host.innerHTML = `<div class="empty">
      ${icon('orders', 'icon-xl')}
      <h4>Empty ticket</h4>
      <p>Tap an item to start. The KOT prints to each station automatically.</p></div>`;
  } else {
    host.innerHTML = state.lines.map((l) => `
      <div class="ticket-line" data-key="${esc(l.key)}">
        <span class="diet ${l.veg ? 'diet-veg' : ''}" style="margin-top:4px"></span>
        <span class="stack" style="gap:2px;min-width:0">
          <span class="ticket-line-name">${esc(l.name)}${l.variant ? ` · ${esc(l.variant)}` : ''}</span>
          <span class="ticket-line-meta">
            ${l.portion ? esc(l.portion) + ' · ' : ''}${money(l.unit)} each
            ${l.mods.length ? `<br><span style="color:var(--warning-soft-fg)">${esc(l.mods.map((m) => m.name).join(', '))}</span>` : ''}
          </span>
          <span class="stepper mt-1">
            <button data-step="-1" aria-label="Remove one">${icon('minus', 'icon-sm')}</button>
            <span class="qty">${l.qty}</span>
            <button data-step="1" aria-label="Add one">${icon('plus', 'icon-sm')}</button>
          </span>
        </span>
        <span class="ticket-line-amt">${money(l.unit * l.qty)}</span>
      </div>`).join('');
  }

  const t = totals();
  $('#ticketTotals').innerHTML = `
    <div class="ticket-total-row"><span>Subtotal · ${state.lines.reduce((a, l) => a + l.qty, 0)} items</span><span class="num">${money(t.subtotal)}</span></div>
    <div class="ticket-total-row">
      <button class="btn btn-ghost btn-sm" id="btnDiscount" style="height:auto;padding:0;font-weight:inherit">
        ${icon('percent', 'icon-sm')} Discount${state.discountPct ? ` (${state.discountPct}%)` : ''}
      </button>
      <span class="num">${t.discount ? '−' + money(t.discount) : '—'}</span>
    </div>
    ${t.packing ? `<div class="ticket-total-row"><span>Packing</span><span class="num">${money(t.packing)}</span></div>` : ''}
    <div class="ticket-total-row"><span>CGST 2.5% + SGST 2.5% (incl.)</span><span class="num">${money(t.gst, { paise: true })}</span></div>
    <div class="ticket-total-row grand"><span>Total</span><span class="num">${money(t.gross)}</span></div>`;

  $('#btnSettleAmt').textContent = t.gross ? money(t.gross) : '';
  $('#btnSettle').disabled = !state.lines.length;
  $('#btnKot').disabled = !state.lines.length;
}

/* ------------------------------------------------------------------ options drawer */
function openOptions(item) {
  state.pending = { item, variant: item.variants ? item.variants[0] : null, mods: [] };
  const groups = state.menu.modifierGroups.filter((g) =>
    g.appliesTo.some((rule) =>
      rule.startsWith('tag:') ? (item.tags || []).includes(rule.slice(4)) : rule === item.cat.id));

  $('#optTitle').textContent = item.name;
  $('#optBody').innerHTML = `
    <div class="row gap-3 mb-6">
      <span class="diet ${item.veg ? 'diet-veg' : ''}"></span>
      <div class="stack" style="gap:2px">
        <b>${esc(item.name)}</b>
        <span class="t-xs dim">${esc(item.catName)}${item.portion ? ' · ' + esc(item.portion) : ''} · ~${item.prepMins} min</span>
      </div>
    </div>
    ${item.variants ? `
      <div class="field mb-6">
        <span class="label">${esc(item.cat.variantAxis?.name || 'Variant')}<span class="req">*</span></span>
        <div class="row gap-2 wrap" data-group="variant">
          ${item.variants.map((v, i) => `
            <button class="chip" data-variant="${esc(v.id)}" aria-pressed="${i === 0}">
              ${esc(v.name)} · ${money(v.price)}</button>`).join('')}
        </div>
      </div>` : ''}
    ${groups.map((g) => `
      <div class="field mb-6">
        <span class="label">${esc(g.name)} <span class="faint fw-normal">choose up to ${g.max}</span></span>
        <div class="row gap-2 wrap" data-group="${esc(g.id)}" data-max="${g.max}">
          ${g.options.map((o) => `<button class="chip" data-mod="${esc(o.id)}" data-price="${o.price}"
              data-name="${esc(o.name)}" aria-pressed="false">
              ${esc(o.name)}${o.price ? ` <span class="faint">+${money(o.price)}</span>` : ''}</button>`).join('')}
        </div>
      </div>`).join('')}
    <div class="field">
      <label class="label" for="optNote">Note to kitchen</label>
      <textarea class="textarea" id="optNote" placeholder="e.g. no onion, pack separately"></textarea>
    </div>`;

  $('#optDrawer').dataset.open = 'true';
  $('#optScrim').dataset.open = 'true';
  releaseTrap = trapFocus($('#optDrawer'));
  $('#optAdd').focus();
}

let releaseTrap = null;
function closeOptions() {
  $('#optDrawer').dataset.open = 'false';
  $('#optScrim').dataset.open = 'false';
  releaseTrap?.();
  state.pending = null;
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const grid = $('#posGrid');

  on(grid, 'click', '.pos-item', (_e, btn) => {
    const item = allItems().find((i) => i.id === btn.dataset.item);
    if (!item) return;
    const needsChoice = item.variants ||
      state.menu.modifierGroups.some((g) => g.appliesTo.some((r) =>
        r.startsWith('tag:') ? (item.tags || []).includes(r.slice(4)) : r === item.cat.id));
    if (needsChoice) openOptions(item);
    else addLine(item);
  });

  on($('#posCats'), 'click', '[data-cat]', (_e, btn) => {
    state.category = btn.dataset.cat;
    $$('#posCats .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
    renderGrid();
  });

  on(document, 'click', '[data-diet]', (_e, btn) => {
    state.diet = btn.dataset.diet;
    btn.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderGrid();
  });

  $('#posSearch').addEventListener('input', (ev) => { state.query = ev.target.value; renderGrid(); });
  $('#posSearch').addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.target.value = ''; state.query = ''; renderGrid(); }
    if (ev.key === 'Enter') {
      const items = visibleItems().filter((i) => i.available && !i.pendingPrice);
      if (items.length === 1) { addLine(items[0]); ev.target.select(); }
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'F2') { ev.preventDefault(); $('#posSearch').focus(); }
    if (ev.key === 'Escape' && $('#optDrawer').dataset.open === 'true') closeOptions();
  });

  on($('#ticketLines'), 'click', '[data-step]', (_e, btn) => {
    setQty(btn.closest('.ticket-line').dataset.key, Number(btn.dataset.step));
  });

  on(document, 'click', '#btnDiscount', () => {
    const next = { 0: 5, 5: 10, 10: 15, 15: 0 }[state.discountPct] ?? 0;
    state.discountPct = next;
    renderTicket();
    toast(next ? `${next}% discount applied` : 'Discount removed', { icon: 'percent' });
  });

  on($('#orderType'), 'click', '[data-type]', (_e, btn) => {
    state.type = btn.dataset.type;
    $$('#orderType button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    $('#tableRow').classList.toggle('hide', state.type !== 'dine_in');
    renderTicket();
  });

  on($('#payMethods'), 'click', '[data-pay]', (_e, btn) => {
    state.pay = btn.dataset.pay;
    $$('#payMethods .pay-btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  });

  // Options drawer
  on(document, 'click', '[data-close-drawer]', closeOptions);
  $('#optScrim').addEventListener('click', closeOptions);

  on($('#optBody'), 'click', '[data-variant]', (_e, btn) => {
    state.pending.variant = state.pending.item.variants.find((v) => v.id === btn.dataset.variant);
    btn.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
  });
  on($('#optBody'), 'click', '[data-mod]', (_e, btn) => {
    const group = btn.parentElement;
    const max = Number(group.dataset.max || 1);
    const pressed = btn.getAttribute('aria-pressed') === 'true';
    if (!pressed && group.querySelectorAll('[aria-pressed="true"]').length >= max) {
      if (max === 1) group.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false'));
      else { toast(`Choose up to ${max}`, { type: 'warning', icon: 'warning' }); return; }
    }
    btn.setAttribute('aria-pressed', String(!pressed));
    state.pending.mods = Array.from($('#optBody').querySelectorAll('[data-mod][aria-pressed="true"]')).map((n) => ({
      id: n.dataset.mod, name: n.dataset.name, price: Number(n.dataset.price),
    }));
  });
  $('#optAdd').addEventListener('click', () => {
    const { item, variant, mods } = state.pending;
    addLine(item, { variant, mods });
    closeOptions();
    toast(`${item.name} added`, { type: 'success' });
  });

  // Ticket actions
  $('#btnClear').addEventListener('click', () => {
    if (!state.lines.length) return;
    state.lines = [];
    state.discountPct = 0;
    renderTicket(); renderGrid();
    toast('Ticket cleared', { icon: 'undo' });
  });
  $('#btnSplit').addEventListener('click', () => toast('Split bill is stubbed in the prototype', { icon: 'info' }));

  $('#btnKot').addEventListener('click', () => {
    const byStation = state.lines.reduce((acc, l) => { (acc[l.station] ||= []).push(l); return acc; }, {});
    const names = Object.keys(byStation).map((s) => state.menu.stations.find((x) => x.id === s)?.name || s);
    toast(`KOT fired to ${names.length} station${names.length > 1 ? 's' : ''}: ${names.join(', ')}`, { type: 'success', icon: 'printer' });
  });

  $('#btnSettle').addEventListener('click', () => {
    const t = totals();
    toast(`${money(t.gross)} settled by ${state.pay.toUpperCase()} · bill sent to guest`, { type: 'success' });
    state.lines = [];
    state.discountPct = 0;
    renderTicket(); renderGrid();
  });
}
