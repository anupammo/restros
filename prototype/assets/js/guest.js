/* ============================================================================
   Guest QR menu — the public face of the same menu.json.

   Product rules encoded here:
   • An item with no price is never shown. Blank prices are an internal problem,
     not something a guest should have to interpret.
   • An 86'd item is shown but visibly unavailable, so guests stop asking staff.
   • Scroll-spy keeps the sticky section rail in sync without a framework.
   ========================================================================== */
import { $, $$, esc, icon, money, loadJSON, ready, on, toast, theme, store } from './core.js';

const state = { menu: null, cart: [], diet: 'all', q: '' };

ready(async () => {
  state.menu = await loadJSON('menu');
  state.cart = store.get('guestCart', []);
  renderCombos();
  renderNav();
  renderMenu();
  renderCart();
  wire();
});

/** Only items a guest can actually order. */
const sellable = (items) => items.filter((i) => !i.pendingPrice && !i.draft);

function visible(cat) {
  const q = state.q.trim().toLowerCase();
  return sellable(cat.items).filter((i) => {
    if (state.diet === 'veg' && !i.veg) return false;
    if (state.diet === 'nonveg' && i.veg) return false;
    if (q && !`${i.name} ${cat.name}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ------------------------------------------------------------------ combos */
function renderCombos() {
  const all = state.menu.categories.flatMap((c) => c.items);
  $('#comboStrip').innerHTML = state.menu.combos.filter((c) => c.available).map((c) => `
    <div class="card card-pad row gap-4" style="background:linear-gradient(120deg,var(--brand-soft),transparent 70%)">
      <span class="feature-ico" style="width:38px;height:38px">${icon('gift')}</span>
      <span class="stack grow" style="gap:2px;min-width:0">
        <b class="t-sm">${esc(c.name)}</b>
        <span class="t-xs dim truncate">${esc(c.description)}</span>
      </span>
      <span class="stack ai-end" style="gap:2px">
        <b class="display" style="font-size:var(--text-md)">${money(c.price)}</b>
        <span class="t-2xs text-success">save ${money(c.saves)}</span>
      </span>
      <button class="btn btn-primary btn-sm" data-combo="${esc(c.id)}">Add</button>
    </div>`).join('');
}

/* ------------------------------------------------------------------ nav */
function renderNav() {
  $('#guestNav').innerHTML = state.menu.categories.map((c, i) => `
    <button class="chip" data-jump="${esc(c.slug)}" aria-pressed="${i === 0}">
      ${esc(c.name)}${c.subtitle ? ` <span class="faint">${esc(c.subtitle)}</span>` : ''}
    </button>`).join('');
}

/* ------------------------------------------------------------------ menu */
function renderMenu() {
  const sections = state.menu.categories.map((cat) => {
    const items = visible(cat);
    if (!items.length) return '';
    return `<section class="guest-section" id="${esc(cat.slug)}" data-section="${esc(cat.slug)}">
      <h2>
        <span class="diet ${cat.dietary === 'veg' ? 'diet-veg' : ''}" ${cat.dietary === 'mixed' ? 'style="display:none"' : ''}></span>
        ${esc(cat.name)}
        ${cat.subtitle ? `<span class="badge">${esc(cat.subtitle)}</span>` : ''}
      </h2>
    </section>` + items.map((i) => itemRow(i, cat)).join('');
  }).join('');

  $('#guestMain').innerHTML = sections || `<div class="empty">${icon('search', 'icon-xl')}
    <h4>Nothing matches</h4><p>Try a different word or clear the filter.</p></div>`;
}

function itemRow(i, cat) {
  const price = i.variants ? Math.min(...i.variants.map((v) => v.price)) : i.price;
  const out = !i.available;
  const badges = [
    (i.tags || []).includes('bestseller') && '<span class="badge badge-accent">Bestseller</span>',
    (i.tags || []).includes('chef-special') && '<span class="badge badge-brand">Chef special</span>',
    (i.tags || []).includes('spicy') && `<span class="badge badge-danger">${icon('flame', 'icon-sm')}Spicy</span>`,
    (i.tags || []).includes('kolkata') && '<span class="badge badge-warning">Kolkata classic</span>',
  ].filter(Boolean).join('');

  return `<article class="guest-item" ${out ? 'style="opacity:.5"' : ''}>
    <h3>
      <span class="diet ${i.veg ? 'diet-veg' : ''}" aria-label="${i.veg ? 'Vegetarian' : 'Non-vegetarian'}"></span>
      ${esc(i.name)}
    </h3>
    <span class="price">${i.variants ? `${money(price)}+` : money(price)}</span>
    <span class="meta">
      ${i.portion ? esc(i.portion) + ' · ' : ''}${i.prepMins} min
      ${i.variants ? ` · ${i.variants.map((v) => `${esc(v.name)} ${money(v.price)}`).join(' · ')}` : ''}
      ${badges ? `<span class="row gap-1 wrap mt-2">${badges}</span>` : ''}
      ${out ? '<span class="badge badge-danger mt-2">Not available right now</span>' : ''}
    </span>
    <span class="add">
      ${out
        ? ''
        : i.variants
          ? `<div class="row gap-1 wrap jc-end">${i.variants.map((v) => `
              <button class="btn btn-secondary btn-sm" data-add="${esc(i.id)}" data-variant="${esc(v.id)}">
                ${esc(v.name)}</button>`).join('')}</div>`
          : `<button class="btn btn-secondary btn-sm btn-pill" data-add="${esc(i.id)}">
              ${icon('plus', 'icon-sm')}Add</button>`}
    </span>
  </article>`;
}

/* ------------------------------------------------------------------ cart */
function addToCart(itemId, variantId) {
  const all = state.menu.categories.flatMap((c) => c.items);
  const item = all.find((i) => i.id === itemId);
  if (!item) return;
  const variant = variantId ? item.variants.find((v) => v.id === variantId) : null;
  const key = `${itemId}:${variantId || ''}`;
  const found = state.cart.find((l) => l.key === key);
  if (found) found.qty++;
  else state.cart.push({ key, name: item.name, variant: variant?.name || null, price: variant ? variant.price : item.price, qty: 1 });
  store.set('guestCart', state.cart);
  renderCart();
  toast(`${item.name}${variant ? ` (${variant.name})` : ''} added`, { type: 'success' });
}

function renderCart() {
  const count = state.cart.reduce((a, l) => a + l.qty, 0);
  const total = state.cart.reduce((a, l) => a + l.price * l.qty, 0);
  $('#cartCount').textContent = `${count} item${count === 1 ? '' : 's'}`;
  $('#cartTotal').textContent = money(total);
  $('#guestCart').dataset.open = String(count > 0);
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  on(document, 'click', '[data-add]', (_e, btn) => addToCart(btn.dataset.add, btn.dataset.variant));

  on(document, 'click', '[data-combo]', (_e, btn) => {
    const c = state.menu.combos.find((x) => x.id === btn.dataset.combo);
    state.cart.push({ key: c.id, name: c.name, variant: 'combo', price: c.price, qty: 1 });
    store.set('guestCart', state.cart);
    renderCart();
    toast(`${c.name} added — you saved ${money(c.saves)}`, { type: 'success', icon: 'gift' });
  });

  on($('#guestNav'), 'click', '[data-jump]', (_e, btn) => {
    document.getElementById(btn.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  on($('#guestDiet'), 'click', '[data-d]', (_e, btn) => {
    state.diet = btn.dataset.d;
    $$('#guestDiet button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderMenu();
  });

  $('#guestSearch').addEventListener('input', (e) => { state.q = e.target.value; renderMenu(); });

  $('#guestTheme').addEventListener('click', () => { theme.cycle(); toast(`Theme: ${theme.get()}`, { icon: 'sun' }); });

  $('#cartPlace').addEventListener('click', () => {
    const total = state.cart.reduce((a, l) => a + l.price * l.qty, 0);
    toast(`Order sent to the kitchen · ${money(total)} · pay at the counter or by UPI`, { type: 'success', timeout: 5000 });
    state.cart = [];
    store.set('guestCart', []);
    renderCart();
  });

  // Scroll-spy for the sticky section rail.
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const slug = e.target.dataset.section;
      $$('#guestNav .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.jump === slug)));
      $$('#guestNav .chip').find((c) => c.dataset.jump === slug)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, { rootMargin: '-72px 0px -72% 0px' });

  const observe = () => $$('[data-section]').forEach((s) => spy.observe(s));
  observe();
  // Re-observe whenever the list is filtered and rebuilt.
  new MutationObserver(observe).observe($('#guestMain'), { childList: true });
}
