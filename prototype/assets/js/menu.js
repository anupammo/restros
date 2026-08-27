/* ============================================================================
   Menu manager
   The screen that turns a photographed paper card into a priced, publishable
   catalogue. Two ideas do the heavy lifting:

   1. An item with no price is *not* an error — it is a first-class state
      ("Needs price"), hidden from guests but visible to the owner.
   2. Handwritten annotations from the scanned card are kept as suggestions
      with a one-tap Apply, so nothing is silently invented.
   ========================================================================== */
import { $, $$, esc, icon, money, num, loadJSON, ready, on, toast, trapFocus } from './core.js';
import { initShell } from './shell.js';

const state = { menu: null, filter: 'all', diet: 'all', q: '', editing: null, dirty: 0 };

ready(async () => {
  await initShell({ page: 'menu', title: 'Menu', crumb: 'Manage' });
  state.menu = await loadJSON('menu');
  $('#menuMeta').textContent = `${state.menu.categories.length} categories · v14 published 26 Aug`;
  renderAlerts();
  renderStats();
  renderList();
  wire();
});

const items = () => state.menu.categories.flatMap((c) => c.items.map((i) => ({ ...i, cat: c })));

/* ------------------------------------------------------------------ alerts */
function renderAlerts() {
  const pending = items().filter((i) => i.pendingPrice);
  const suggestions = items().filter((i) => i.annotation?.status === 'needs-confirmation');
  const out = [];

  if (pending.length) {
    out.push(`<div class="alert alert-warning">
      ${icon('warning')}
      <div class="grow">
        <strong>${pending.length} items have no price</strong>
        <span class="t-xs">These were left blank on the printed card (${esc(pending.slice(0, 4).map((i) => i.name).join(', '))}${pending.length > 4 ? ` +${pending.length - 4} more` : ''}).
        They are hidden from the guest menu and cannot be added to a ticket until priced.</span>
        <div class="mt-2 row gap-2">
          <button class="btn btn-secondary btn-sm" data-f-jump="pending">Show only these</button>
        </div>
      </div>
    </div>`);
  }

  if (suggestions.length) {
    out.push(`<div class="alert alert-info">
      ${icon('sparkles')}
      <div class="grow">
        <strong>${suggestions.length} handwritten notes found on the scanned card</strong>
        <span class="t-xs">RestrOS read pen marks on the photographed menu. Confirm each one before it goes live.</span>
        <div class="mt-3 stack gap-2">
          ${suggestions.map((i) => `
            <div class="row gap-3 wrap card card-pad" style="padding:var(--space-3)">
              <span class="diet ${i.veg ? 'diet-veg' : ''}"></span>
              <b class="t-sm">${esc(i.name)}</b>
              <span class="t-xs dim mono">${esc(i.annotation.text)}</span>
              <span class="grow"></span>
              <span class="t-xs">${i.price != null ? `${money(i.price)} → ` : ''}<b>${money(i.annotation.suggestedPrice)}</b></span>
              <button class="btn btn-primary btn-sm" data-apply="${esc(i.id)}">Apply</button>
              <button class="btn btn-ghost btn-sm" data-dismiss="${esc(i.id)}">Dismiss</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`);
  }

  $('#menuAlerts').innerHTML = out.join('');
}

/* ------------------------------------------------------------------ stats */
function renderStats() {
  const all = items();
  const priced = all.filter((i) => i.price != null || i.variants);
  const prices = all.filter((i) => i.price != null).map((i) => i.price);
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

  const tiles = [
    ['Items on the card', num(all.length), `${state.menu.categories.length} categories`, 'menu-book'],
    ['Ready to sell', num(priced.filter((i) => i.available).length), `${all.length - priced.filter((i) => i.available).length} not sellable`, 'check-circle'],
    ['Needs price', num(all.filter((i) => i.pendingPrice).length), 'blank on the printed card', 'warning'],
    ['Average price', money(avg), `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`, 'rupee'],
  ];
  $('#menuStats').innerHTML = tiles.map(([l, v, f, ic]) => `
    <div class="col-3 stat">
      <div class="stat-label">${icon(ic, 'icon-sm')}${esc(l)}</div>
      <div class="stat-value">${v}</div>
      <div class="stat-foot">${esc(f)}</div>
    </div>`).join('');
}

/* ------------------------------------------------------------------ list */
function matches(i) {
  const q = state.q.trim().toLowerCase();
  if (state.filter === 'pending' && !i.pendingPrice) return false;
  if (state.filter === 'unavailable' && i.available) return false;
  if (state.filter === 'draft' && !i.draft) return false;
  if (state.diet === 'veg' && !i.veg) return false;
  if (state.diet === 'nonveg' && i.veg) return false;
  if (q && !`${i.name} ${i.cat.name} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
  return true;
}

function renderList() {
  const shown = items().filter(matches);
  $('#menuCount').textContent = `${shown.length} of ${items().length} items`;

  if (!shown.length) {
    $('#menuList').innerHTML = `<div class="empty">${icon('menu-book', 'icon-xl')}
      <h4>Nothing here</h4><p>No items match this filter.</p></div>`;
    return;
  }

  let html = '';
  for (const cat of state.menu.categories) {
    const rows = cat.items.filter((i) => matches({ ...i, cat }));
    if (!rows.length) continue;
    html += `<div class="menu-cat-head">
      ${icon('grip', 'icon-sm')}
      <span>${esc(cat.name)}</span>
      ${cat.subtitle ? `<span class="badge">${esc(cat.subtitle)}</span>` : ''}
      <span class="t-2xs faint fw-normal" style="text-transform:none">${rows.length} items</span>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-sm" data-add-cat="${esc(cat.id)}">${icon('plus', 'icon-sm')}Add item</button>
    </div>`;
    html += rows.map((i) => itemRow(i, cat)).join('');
  }
  $('#menuList').innerHTML = html;
}

function itemRow(i, cat) {
  const price = i.variants
    ? `${money(Math.min(...i.variants.map((v) => v.price)))}–${money(Math.max(...i.variants.map((v) => v.price)))}`
    : i.price != null ? money(i.price) : '<span class="badge badge-warning">Needs price</span>';
  const station = state.menu.stations.find((s) => s.id === i.station);

  return `<div class="menu-row" data-item="${esc(i.id)}"
      data-pending="${!!i.pendingPrice}" data-draft="${!!i.draft}">
    <span class="diet ${i.veg ? 'diet-veg' : ''}" aria-label="${i.veg ? 'Veg' : 'Non-veg'}"></span>
    <div class="stack" style="gap:2px;min-width:0">
      <div class="row gap-2">
        <b class="t-sm truncate">${esc(i.name)}</b>
        ${i.portion ? `<span class="t-2xs faint">${esc(i.portion)}</span>` : ''}
        ${i.draft ? '<span class="badge badge-info">Draft</span>' : ''}
        ${(i.tags || []).includes('bestseller') ? '<span class="badge badge-accent">Bestseller</span>' : ''}
        ${(i.tags || []).includes('chef-special') ? '<span class="badge badge-brand">Chef special</span>' : ''}
        ${(i.tags || []).includes('new') ? '<span class="badge badge-success">New</span>' : ''}
      </div>
      ${i.outOfStockReason ? `<span class="t-2xs text-danger">${esc(i.outOfStockReason)}</span>` : ''}
      ${i.annotation ? `<span class="t-2xs" style="color:var(--info)">${icon('sparkles', 'icon-sm')} ${esc(i.annotation.text)}</span>` : ''}
    </div>
    <span class="t-sm num fw-semibold">${price}</span>
    <span class="menu-col-hide t-xs dim row gap-2">
      <span class="station-dot" style="background:${station?.color || 'var(--border-strong)'}"></span>${esc(station?.short || '—')}
    </span>
    <span class="menu-col-hide">
      <label class="switch" data-tip="${i.available ? 'Available' : 'Sold out'}">
        <input type="checkbox" ${i.available ? 'checked' : ''} data-toggle="${esc(i.id)}"
               ${i.pendingPrice ? 'disabled' : ''}>
        <span class="switch-track"></span>
      </label>
    </span>
    <button class="btn btn-ghost btn-icon btn-sm" data-edit="${esc(i.id)}" aria-label="Edit ${esc(i.name)}">
      ${icon('edit', 'icon-sm')}
    </button>
  </div>`;
}

/* ------------------------------------------------------------------ editor */
let release = null;

function openItem(id) {
  const i = items().find((x) => x.id === id);
  if (!i) return;
  state.editing = i;

  $('#itTitle').textContent = i.name;
  $('#itBody').innerHTML = `
    <div class="grid-2 gap-4">
      <div class="field" style="grid-column:1/-1">
        <label class="label" for="fName">Item name<span class="req">*</span></label>
        <input class="input" id="fName" value="${esc(i.name)}">
      </div>
      <div class="field">
        <label class="label" for="fPrice">Price (₹)<span class="req">*</span></label>
        <input class="input num" id="fPrice" type="number" inputmode="numeric" value="${i.price ?? ''}"
               placeholder="${i.pendingPrice ? 'Blank on the card' : ''}" aria-invalid="${!!i.pendingPrice}">
        ${i.pendingPrice ? '<span class="error-text">This was left blank on the printed menu.</span>' : ''}
      </div>
      <div class="field">
        <label class="label" for="fPortion">Portion</label>
        <input class="input" id="fPortion" value="${esc(i.portion || '')}" placeholder="e.g. 8 pc">
      </div>
      <div class="field">
        <label class="label" for="fCat">Category</label>
        <select class="select" id="fCat">
          ${state.menu.categories.map((c) => `<option ${c.id === i.cat.id ? 'selected' : ''}>${esc(c.name)}${c.subtitle ? ' · ' + esc(c.subtitle) : ''}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="label" for="fStation">Kitchen station</label>
        <select class="select" id="fStation">
          ${state.menu.stations.map((s) => `<option ${s.id === i.station ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="label" for="fPrep">Prep time (min)</label>
        <input class="input num" id="fPrep" type="number" value="${i.prepMins || 10}">
      </div>
      <div class="field">
        <span class="label">Dietary</span>
        <div class="segmented">
          <button aria-selected="${i.veg}">Veg</button>
          <button aria-selected="${!i.veg}">Non-veg</button>
        </div>
      </div>
    </div>

    ${i.variants ? `
      <h4 class="mt-8 mb-3 t-sm">Variants · ${esc(i.cat.variantAxis?.name || '')}</h4>
      <div class="card card-flat">
        ${i.variants.map((v) => `
          <div class="row gap-3" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
            <b class="t-sm grow">${esc(v.name)}</b>
            <div class="input-group" style="width:120px">
              <input class="input num" type="number" value="${v.price}">
            </div>
          </div>`).join('')}
      </div>` : ''}

    <h4 class="mt-8 mb-3 t-sm">Availability</h4>
    <div class="stack gap-3">
      <label class="switch"><input type="checkbox" ${i.available ? 'checked' : ''}><span class="switch-track"></span>
        <span class="t-sm">Available for sale</span></label>
      <label class="switch"><input type="checkbox" checked><span class="switch-track"></span>
        <span class="t-sm">Show on the guest QR menu</span></label>
      <label class="switch"><input type="checkbox" ${i.channels?.aggregator === false ? '' : 'checked'}><span class="switch-track"></span>
        <span class="t-sm">Sell on Swiggy / Zomato</span></label>
    </div>

    <h4 class="mt-8 mb-3 t-sm">Tags</h4>
    <div class="row gap-2 wrap">
      ${['bestseller', 'spicy', 'chef-special', 'value', 'kolkata', 'new', 'dessert'].map((t) => `
        <button class="chip" aria-pressed="${(i.tags || []).includes(t)}">${esc(t)}</button>`).join('')}
    </div>

    ${i.annotation ? `
      <div class="alert alert-info mt-8">${icon('sparkles')}
        <div><strong>Handwritten note on the scanned card</strong>
        <span class="t-xs">“${esc(i.annotation.text)}” — suggests ${money(i.annotation.suggestedPrice)}.</span>
        <div class="mt-2"><button class="btn btn-primary btn-sm" data-apply="${esc(i.id)}">Apply ${money(i.annotation.suggestedPrice)}</button></div>
        </div></div>` : ''}`;

  $('#itemDrawer').dataset.open = 'true';
  $('#itemScrim').dataset.open = 'true';
  release = trapFocus($('#itemDrawer'));
  $('#fName').focus();
}

function closeItem() {
  $('#itemDrawer').dataset.open = 'false';
  $('#itemScrim').dataset.open = 'false';
  state.editing = null;
  release?.();
}

/** Apply a handwritten suggestion to the in-memory menu. */
function applySuggestion(id) {
  const item = items().find((x) => x.id === id);
  if (!item?.annotation) return;
  const target = state.menu.categories.flatMap((c) => c.items).find((x) => x.id === id);
  target.price = item.annotation.suggestedPrice;
  target.pendingPrice = false;
  target.annotation.status = 'applied';
  state.dirty++;
  renderAlerts(); renderStats(); renderList();
  toast(`${item.name} priced at ${money(target.price)}`, { type: 'success' });
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  const root = document;

  on(root, 'click', '[data-apply]', (_e, btn) => applySuggestion(btn.dataset.apply));
  on(root, 'click', '[data-dismiss]', (_e, btn) => {
    const t = state.menu.categories.flatMap((c) => c.items).find((x) => x.id === btn.dataset.dismiss);
    if (t) { t.annotation.status = 'dismissed'; renderAlerts(); toast('Suggestion dismissed', { icon: 'undo' }); }
  });

  on(root, 'click', '[data-f-jump]', (_e, btn) => {
    state.filter = btn.dataset.fJump;
    $$('#menuFilter button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.f === state.filter)));
    renderList();
    $('#menuList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  on($('#menuFilter'), 'click', '[data-f]', (_e, btn) => {
    state.filter = btn.dataset.f;
    $$('#menuFilter button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderList();
  });
  on($('#menuDiet'), 'click', '[data-d]', (_e, btn) => {
    state.diet = btn.dataset.d;
    $$('#menuDiet button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderList();
  });
  $('#menuSearch').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });

  on($('#menuList'), 'click', '[data-edit]', (_e, btn) => openItem(btn.dataset.edit));
  on($('#menuList'), 'change', '[data-toggle]', (_e, input) => {
    const t = state.menu.categories.flatMap((c) => c.items).find((x) => x.id === input.dataset.toggle);
    t.available = input.checked;
    state.dirty++;
    toast(`${t.name} ${input.checked ? 'back on the menu' : '86’d — pulled from POS and guest menu'}`,
      { type: input.checked ? 'success' : 'warning', icon: input.checked ? 'check-circle' : 'warning' });
    renderStats();
  });
  on($('#menuList'), 'click', '[data-add-cat]', () => toast('New item form is stubbed in the prototype', { icon: 'info' }));

  on(root, 'click', '[data-close-item]', closeItem);
  $('#itemScrim').addEventListener('click', closeItem);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeItem(); });

  $('#itSave').addEventListener('click', () => {
    const i = state.editing;
    if (!i) return;
    const target = state.menu.categories.flatMap((c) => c.items).find((x) => x.id === i.id);
    const price = Number($('#fPrice').value);
    target.name = $('#fName').value.trim() || target.name;
    target.portion = $('#fPortion').value.trim() || null;
    target.prepMins = Number($('#fPrep').value) || target.prepMins;
    if (price > 0) { target.price = price; target.pendingPrice = false; }
    state.dirty++;
    closeItem(); renderAlerts(); renderStats(); renderList();
    toast('Item saved as a draft change', { type: 'success' });
  });
  $('#itDelete').addEventListener('click', () => toast('Deleting is stubbed — items archive instead of disappearing', { type: 'warning', icon: 'shield' }));

  $('#btnPublish').addEventListener('click', () => {
    const pending = items().filter((i) => i.pendingPrice).length;
    if (pending) {
      toast(`${pending} items still need a price — they will publish as hidden`, { type: 'warning', icon: 'warning', timeout: 4500 });
    } else {
      toast('Menu v15 published to POS, KDS, QR menu and aggregators', { type: 'success', timeout: 4500 });
    }
  });
}
