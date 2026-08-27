/* ============================================================================
   Inventory — stock on hand, par levels, recipe costing and wastage.
   The link back to the menu is what makes this useful: an ingredient at zero
   automatically explains why a dish is 86'd on the POS.
   ========================================================================== */
import { $, $$, esc, icon, money, num, loadAll, ready, on, toast, timeAgo } from './core.js';
import { initShell } from './shell.js';

const state = { inv: null, menu: null, filter: 'all', q: '' };

const STATUS = { ok: ['In stock', 'success'], low: ['Below par', 'warning'], critical: ['Critical', 'warning'], out: ['Out of stock', 'danger'] };

ready(async () => {
  await initShell({ page: 'inventory', title: 'Inventory', crumb: 'Manage' });
  const [inv, menu] = await loadAll('inventory', 'menu');
  state.inv = inv;
  state.menu = menu;

  renderAlert();
  renderStats();
  renderRows();
  renderPOs();
  renderRecipes();
  renderWaste();
  wire();
});

function renderAlert() {
  const out = state.inv.items.filter((i) => i.status === 'out');
  if (!out.length) return;
  const blocked = state.menu.categories.flatMap((c) => c.items).filter((i) => !i.available && i.outOfStockReason);
  $('#invAlert').innerHTML = `<div class="alert alert-danger">
    ${icon('alert')}
    <div class="grow">
      <strong>${out.length} ingredients are at zero</strong>
      <span class="t-xs">${esc(out.map((i) => i.name).join(', '))}.
      ${blocked.length ? `${blocked.length} menu item${blocked.length > 1 ? 's are' : ' is'} 86'd as a result — ${esc(blocked.map((b) => b.name).join(', '))}.` : ''}</span>
      <div class="mt-2 row gap-2">
        <button class="btn btn-primary btn-sm" id="btnAutoPO">Draft purchase order</button>
        <a class="btn btn-secondary btn-sm" href="menu.html">Review affected items</a>
      </div>
    </div>
  </div>`;
}

function renderStats() {
  const items = state.inv.items;
  const value = items.reduce((s, i) => s + i.value, 0);
  const below = items.filter((i) => i.status !== 'ok').length;
  const waste = state.inv.wastage.reduce((s, w) => s + w.value, 0);
  const variance = (items.reduce((s, i) => s + Math.abs(i.variancePct), 0) / items.length).toFixed(1);

  const tiles = [
    ['Stock value', money(value), `${items.length} tracked ingredients`, 'inventory'],
    ['Below par', num(below), 'reorder before service', 'warning'],
    ['Wastage today', money(waste), `${state.inv.wastage.length} entries`, 'trash'],
    ['Count variance', `${variance}<small>%</small>`, 'target under 2%', 'sliders'],
  ];
  $('#invStats').innerHTML = tiles.map(([l, v, f, ic]) => `
    <div class="col-3 stat">
      <div class="stat-label">${icon(ic, 'icon-sm')}${esc(l)}</div>
      <div class="stat-value">${v}</div>
      <div class="stat-foot">${esc(f)}</div>
    </div>`).join('');
}

function renderRows() {
  const q = state.q.trim().toLowerCase();
  const rows = state.inv.items.filter((i) => {
    if (state.filter === 'low' && i.status === 'ok') return false;
    if (state.filter === 'out' && i.status !== 'out') return false;
    if (q && !`${i.name} ${i.supplier}`.toLowerCase().includes(q)) return false;
    return true;
  });

  if (!rows.length) {
    $('#invRows').innerHTML = `<tr><td colspan="8"><div class="empty">${icon('inventory', 'icon-xl')}
      <h4>Nothing matches</h4></div></td></tr>`;
    return;
  }

  $('#invRows').innerHTML = rows.map((i) => {
    const station = state.menu.stations.find((s) => s.id === i.station);
    const [label, tone] = STATUS[i.status];
    const fillPct = Math.min(100, (i.stock / i.par) * 100);
    const barTone = i.status === 'out' ? 'danger' : i.status === 'ok' ? 'success' : 'warning';
    return `<tr>
      <td>
        <b class="t-sm">${esc(i.name)}</b>
        <div class="t-2xs faint">${esc(i.supplier)}</div>
      </td>
      <td><span class="row gap-2 t-xs dim">
        <span class="station-dot" style="background:${station?.color || 'var(--border-strong)'}"></span>${esc(station?.short || '—')}</span></td>
      <td class="col-num"><b class="num">${i.stock}</b> <span class="t-2xs faint">${esc(i.unit)}</span></td>
      <td class="col-num t-sm dim num">${i.par}</td>
      <td>
        <div class="progress progress-${barTone}"><span style="width:${fillPct}%"></span></div>
        <div class="t-2xs faint mt-1">${i.daysCover ? `${i.daysCover} days cover` : 'none left'}</div>
      </td>
      <td class="col-num t-sm num">${money(i.value)}</td>
      <td><span class="badge badge-${tone} badge-dot">${esc(label)}</span></td>
      <td><button class="btn btn-ghost btn-sm" data-adjust="${esc(i.id)}">Adjust</button></td>
    </tr>`;
  }).join('');
}

function renderPOs() {
  const pos = state.inv.purchaseOrders;
  $('#poCount').textContent = `${pos.filter((p) => p.status !== 'received').length} open`;
  const tone = { draft: '', sent: 'info', received: 'success' };
  $('#poList').innerHTML = pos.map((p) => `
    <div class="row gap-3" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
      <span class="stack grow" style="gap:1px;min-width:0">
        <b class="t-sm mono">${esc(p.id)}</b>
        <span class="t-2xs dim truncate">${esc(p.supplier)} · ${p.lines} lines</span>
        <span class="t-2xs faint truncate">${esc(p.note)}</span>
      </span>
      <span class="stack ai-end" style="gap:3px">
        <b class="t-sm num">${money(p.total)}</b>
        <span class="badge badge-${tone[p.status]}">${esc(p.status)}</span>
      </span>
    </div>`).join('');
}

function renderRecipes() {
  const all = state.menu.categories.flatMap((c) => c.items);
  $('#recipeList').innerHTML = state.inv.recipes.map((r) => {
    const item = all.find((i) => i.id === r.itemId);
    const price = item?.price ?? item?.variants?.[0].price ?? 0;
    return `<div class="meter-row">
      <span class="t-sm truncate">${esc(item?.name || r.itemId)}</span>
      <span class="t-sm fw-semibold num">${r.margin}%</span>
      <span class="meter-bar"><span style="width:${r.margin}%;background:${r.margin > 50 ? 'var(--success)' : 'var(--warning)'}"></span></span>
      <span class="t-2xs faint" style="grid-column:1/-1">
        sells ${money(price)} · food cost ${money(r.foodCost)} · ${r.components.length} ingredients</span>
    </div>`;
  }).join('');
}

function renderWaste() {
  $('#wasteList').innerHTML = state.inv.wastage.map((w) => {
    const ing = state.inv.items.find((i) => i.id === w.item);
    return `<div class="row gap-3" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
      <span class="stack grow" style="gap:1px">
        <b class="t-sm">${esc(ing?.name || w.item)}</b>
        <span class="t-2xs dim">${w.qty} ${esc(w.unit)} · ${esc(w.reason)} · ${esc(timeAgo(w.at))}</span>
      </span>
      <b class="t-sm num text-danger">−${money(w.value)}</b>
    </div>`;
  }).join('');
}

function wire() {
  on($('#invFilter'), 'click', '[data-f]', (_e, btn) => {
    state.filter = btn.dataset.f;
    $$('#invFilter button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderRows();
  });
  $('#invSearch').addEventListener('input', (e) => { state.q = e.target.value; renderRows(); });
  on(document, 'click', '[data-adjust]', (_e, btn) => {
    const i = state.inv.items.find((x) => x.id === btn.dataset.adjust);
    toast(`Stock adjustment for ${i.name} — logged to the audit trail`, { icon: 'sliders' });
  });
  on(document, 'click', '#btnAutoPO', () =>
    toast('PO-2026-115 drafted for Haji Meat Supply — 2 lines', { type: 'success', icon: 'truck' }));
  $('#btnCount').addEventListener('click', () => toast('Stock count sheet opens on the tablet', { icon: 'list' }));
  $('#btnPO').addEventListener('click', () => toast('New purchase order form is stubbed here', { icon: 'info' }));
}
