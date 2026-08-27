/* ============================================================================
   Orders — the day's ticket ledger with a detail drawer.
   Doubles as the audit surface: every void, discount and aggregator commission
   is visible without leaving the row.
   ========================================================================== */
import { $, $$, esc, icon, money, num, sum, loadAll, ready, on, toast, timeOf, timeAgo, trapFocus } from './core.js';
import { initShell } from './shell.js';

const state = { orders: [], staff: null, tab: 'all', q: '', channel: 'all', pay: 'all' };

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open', match: (o) => ['new', 'preparing', 'ready', 'served'].includes(o.status) },
  { id: 'paid', label: 'Settled', match: (o) => o.status === 'paid' },
  { id: 'cancelled', label: 'Voided', match: (o) => o.status === 'cancelled' },
  { id: 'aggregator', label: 'Aggregators', match: (o) => ['swiggy', 'zomato'].includes(o.channel) },
];

ready(async () => {
  await initShell({ page: 'orders', title: 'Orders', crumb: 'Operate' });
  const [ordersData, staff] = await loadAll('orders', 'staff');
  state.orders = ordersData.orders;
  state.staff = staff;

  renderStats();
  renderTabs();
  renderRows();
  wire();
});

const filtered = () => {
  const tab = TABS.find((t) => t.id === state.tab);
  const q = state.q.trim().toLowerCase();
  return state.orders.filter((o) => {
    if (tab?.match && !tab.match(o)) return false;
    if (state.channel !== 'all' && o.channel !== state.channel) return false;
    if (state.pay !== 'all' && o.payment !== state.pay) return false;
    if (q && !`${o.id} ${o.kot} ${o.customer || ''} ${o.phone || ''} ${o.table || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
};

function renderStats() {
  const settled = state.orders.filter((o) => o.status === 'paid' || o.status === 'served');
  const open = state.orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
  const voided = state.orders.filter((o) => o.status === 'cancelled');
  const commission = sum(state.orders, (o) => o.commission);

  const tiles = [
    ['Settled', money(sum(settled, (o) => o.total)), `${settled.length} orders`, 'check-circle', 'success'],
    ['Open', money(sum(open, (o) => o.total)), `${open.length} on the pass`, 'clock', 'warning'],
    ['Voided', money(sum(voided, (o) => o.total)), `${voided.length} orders`, 'undo', 'danger'],
    ['Aggregator commission', money(commission), '21–22% of platform sales', 'bike', 'info'],
  ];
  $('#orderStats').innerHTML = tiles.map(([label, value, foot, ico, tone]) => `
    <div class="col-3 stat">
      <div class="stat-label">${icon(ico, 'icon-sm')}${esc(label)}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-foot"><span class="badge badge-${tone}">${esc(foot)}</span></div>
    </div>`).join('');
}

function renderTabs() {
  $('#orderTabs').innerHTML = TABS.map((t) => {
    const count = t.match ? state.orders.filter(t.match).length : state.orders.length;
    return `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === state.tab}">
      ${esc(t.label)}<span class="count">${count}</span></button>`;
  }).join('');
}

function renderRows() {
  const rows = filtered();
  $('#orderCount').textContent = `${rows.length} of ${state.orders.length} orders`;

  if (!rows.length) {
    $('#orderRows').innerHTML = `<tr><td colspan="10"><div class="empty">
      ${icon('search', 'icon-xl')}<h4>No orders match</h4><p>Widen the filters or clear the search.</p></div></td></tr>`;
    return;
  }

  $('#orderRows').innerHTML = rows.map((o) => `
    <tr class="row-link" data-order="${esc(o.id)}">
      <td><span class="mono t-sm fw-semibold">${esc(o.id)}</span><div class="t-2xs faint mono">${esc(o.kot)}</div></td>
      <td>${channelCell(o)}</td>
      <td class="t-sm">
        ${o.table ? `<b>${esc(o.table)}</b>` : '<span class="faint">—</span>'}
        ${o.customer ? `<div class="t-2xs dim truncate" style="max-width:150px">${esc(o.customer)}</div>` : ''}
      </td>
      <td class="t-sm truncate" style="max-width:260px">${esc(o.lines.map((l) => `${l.qty}× ${l.name}`).join(', '))}</td>
      <td class="t-sm dim nowrap">${esc(timeOf(o.placedAt))}</td>
      <td class="t-sm num ${o.prepMinsActual > 18 ? 'text-danger' : 'dim'}">${o.prepMinsActual}m</td>
      <td>${o.payment ? `<span class="badge badge-outline">${esc(o.payment.toUpperCase())}</span>` : '<span class="faint">—</span>'}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="col-num fw-semibold">${money(o.total)}${o.discount ? `<div class="t-2xs text-danger">−${money(o.discount)}</div>` : ''}</td>
      <td>${icon('chevron-right', 'icon-sm')}</td>
    </tr>`).join('');
}

function channelCell(o) {
  const ico = { dine_in: 'utensils', takeaway: 'bag', qr: 'qr', swiggy: 'bike', zomato: 'bike' }[o.channel] || 'orders';
  return `<span class="row gap-2 t-sm nowrap">${icon(ico, 'icon-sm')}${esc(o.channelName)}</span>`;
}

function statusBadge(status) {
  const map = {
    new: ['info', 'New'], preparing: ['warning', 'Preparing'], ready: ['success', 'Ready'],
    served: ['brand', 'Served'], paid: ['success', 'Paid'], cancelled: ['danger', 'Void'],
  };
  const [tone, label] = map[status] || ['', status];
  return `<span class="badge badge-${tone} badge-dot">${esc(label)}</span>`;
}

/* ------------------------------------------------------------------ drawer */
let release = null;

function openOrder(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  const server = state.staff.users.find((u) => u.id === o.server);

  $('#odTitle').textContent = o.id;
  $('#odBody').innerHTML = `
    <div class="row between mb-4">
      <div class="stack" style="gap:2px">
        <span class="mono t-sm dim">${esc(o.kot)}</span>
        <span class="t-xs dim">${esc(timeOf(o.placedAt))} · ${esc(timeAgo(o.placedAt))}</span>
      </div>
      ${statusBadge(o.status)}
    </div>

    <div class="grid-2 gap-3 mb-6">
      ${kv('Channel', o.channelName)}
      ${kv('Table', o.table || '—')}
      ${kv('Guests', o.guests ? `${o.guests} pax` : '—')}
      ${kv('Server', server ? server.name : '—')}
      ${kv('Guest', o.customer || 'Walk-in')}
      ${kv('Phone', o.phone || '—')}
    </div>

    <div class="card card-flat mb-6">
      <div class="card-header"><h4>Items</h4><span class="ml-auto t-xs dim">${o.lines.length} lines</span></div>
      <div>${o.lines.map((l) => `
        <div class="row gap-3" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
          <span class="diet ${l.veg ? 'diet-veg' : ''}"></span>
          <span class="badge">${l.qty}×</span>
          <span class="stack grow" style="gap:0;min-width:0">
            <span class="t-sm fw-medium">${esc(l.name)}${l.variant ? ` · ${esc(l.variant)}` : ''}</span>
            ${l.modifiers?.length ? `<span class="t-2xs" style="color:var(--warning-soft-fg)">${esc(l.modifiers.map((m) => m.name).join(', '))}</span>` : ''}
          </span>
          <span class="t-sm num">${money(l.total)}</span>
        </div>`).join('')}
      </div>
    </div>

    <div class="card card-sunken card-pad stack gap-2">
      ${row('Subtotal', money(o.subtotal))}
      ${o.discount ? row('Discount', `−${money(o.discount)}`, 'text-danger') : ''}
      ${o.packing ? row('Packing', money(o.packing)) : ''}
      ${row('Taxable value', money(o.taxable, { paise: true }), 'dim')}
      ${row('CGST 2.5% + SGST 2.5%', money(o.gst, { paise: true }), 'dim')}
      ${o.commission ? row('Aggregator commission', `−${money(o.commission)}`, 'text-danger') : ''}
      <div class="divider"></div>
      <div class="row between">
        <b class="t-md">Total</b>
        <b class="display" style="font-size:var(--text-xl)">${money(o.total)}</b>
      </div>
      ${o.payment ? `<div class="row between t-xs dim"><span>Paid by</span><span>${esc(o.payment.toUpperCase())}</span></div>` : ''}
    </div>

    ${o.rating ? `<div class="alert alert-success mt-6">${icon('star')}<div>
      <strong>Guest rated ${o.rating}/5</strong><span class="t-xs">Feedback collected on the QR bill.</span></div></div>` : ''}

    <h4 class="mt-8 mb-4 t-sm">Timeline</h4>
    <div class="timeline">
      ${tl('orders', 'Order placed', timeOf(o.placedAt))}
      ${tl('printer', 'KOT fired to kitchen', timeOf(o.placedAt))}
      ${o.readyAt ? tl('kds', 'Marked ready', timeOf(o.readyAt)) : tl('clock', 'Cooking', 'in progress')}
      ${o.status === 'paid' ? tl('check-circle', `Settled by ${o.payment?.toUpperCase()}`, timeOf(o.readyAt || o.placedAt)) : ''}
      ${o.status === 'cancelled' ? tl('undo', 'Voided by manager', timeOf(o.placedAt)) : ''}
    </div>`;

  $('#orderDrawer').dataset.open = 'true';
  $('#orderScrim').dataset.open = 'true';
  release = trapFocus($('#orderDrawer'));
}

const kv = (k, v) => `<div class="stack" style="gap:2px">
  <span class="t-2xs faint">${esc(k)}</span><b class="t-sm">${esc(String(v))}</b></div>`;
const row = (k, v, cls = '') => `<div class="row between t-sm ${cls}"><span>${esc(k)}</span><span class="num">${v}</span></div>`;
const tl = (ico, title, time) => `<div class="timeline-item">
  <span class="timeline-marker">${icon(ico)}</span>
  <span class="stack" style="gap:0"><b class="t-sm">${esc(title)}</b><span class="t-2xs faint">${esc(time)}</span></span></div>`;

function closeOrder() {
  $('#orderDrawer').dataset.open = 'false';
  $('#orderScrim').dataset.open = 'false';
  release?.();
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  on($('#orderTabs'), 'click', '[data-tab]', (_e, btn) => {
    state.tab = btn.dataset.tab;
    $$('#orderTabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t === btn)));
    renderRows();
  });
  $('#orderSearch').addEventListener('input', (e) => { state.q = e.target.value; renderRows(); });
  $('#channelFilter').addEventListener('change', (e) => { state.channel = e.target.value; renderRows(); });
  $('#payFilter').addEventListener('change', (e) => { state.pay = e.target.value; renderRows(); });

  on($('#orderRows'), 'click', '[data-order]', (_e, tr) => openOrder(tr.dataset.order));
  on(document, 'click', '[data-close-order]', closeOrder);
  $('#orderScrim').addEventListener('click', closeOrder);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOrder(); });

  $('#odPrint').addEventListener('click', () => toast('Bill sent to the counter printer', { type: 'success', icon: 'printer' }));
  $('#odRefund').addEventListener('click', () => toast('Refunds need manager approval — stubbed here', { type: 'warning', icon: 'shield' }));
}
