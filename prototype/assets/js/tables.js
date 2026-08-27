/* ============================================================================
   Tables — floor plan, covers and the evening's reservation book.
   Nodes are absolutely positioned from a 0–100 grid in floor.json so the same
   layout scales from a phone to the 27" counter screen.
   ========================================================================== */
import { $, $$, esc, icon, money, num, loadAll, ready, on, toast, timeOf, minsAgo, trapFocus } from './core.js';
import { initShell } from './shell.js';

const state = { floor: null, orders: [], staff: null, zone: 'z_ground' };

const STATUS = {
  available: ['Available', 'success'],
  occupied: ['Occupied', 'brand'],
  billed: ['Bill printed', 'info'],
  reserved: ['Reserved', 'warning'],
  dirty: ['Needs clearing', ''],
  blocked: ['Blocked', 'danger'],
};

ready(async () => {
  await initShell({ page: 'tables', title: 'Tables', crumb: 'Operate' });
  const [floor, ordersData, staff] = await loadAll('floor', 'orders', 'staff');
  state.floor = floor;
  state.orders = ordersData.orders;
  state.staff = staff;

  renderStats();
  renderZones();
  renderPlan();
  renderReservations();
  renderServers();
  wire();
});

function renderStats() {
  const t = state.floor.tables;
  const occupied = t.filter((x) => x.status === 'occupied').length;
  const seated = t.filter((x) => x.guests).reduce((s, x) => s + x.guests, 0);
  const open = t.filter((x) => x.status === 'available').length;
  const revenue = t.filter((x) => x.amount).reduce((s, x) => s + x.amount, 0);
  const avgSeatedMins = Math.round(
    t.filter((x) => x.seatedAt).reduce((s, x) => s + minsAgo(x.seatedAt), 0) /
    Math.max(t.filter((x) => x.seatedAt).length, 1));

  $('#floorSub').textContent = `${occupied} occupied · ${open} free · ${seated} covers seated`;

  const tiles = [
    ['Occupancy', `${Math.round((occupied / t.length) * 100)}<small>%</small>`, `${occupied} of ${t.length} tables`, 'tables'],
    ['Covers seated', num(seated), `capacity ${t.reduce((s, x) => s + x.seats, 0)}`, 'customers'],
    ['On the floor', money(revenue), 'open table value', 'rupee'],
    ['Avg time at table', `${avgSeatedMins}<small>min</small>`, 'turn target 45 min', 'timer'],
  ];
  $('#floorStats').innerHTML = tiles.map(([l, v, f, ic]) => `
    <div class="col-3 stat">
      <div class="stat-label">${icon(ic, 'icon-sm')}${esc(l)}</div>
      <div class="stat-value">${v}</div>
      <div class="stat-foot">${esc(f)}</div>
    </div>`).join('');
}

function renderZones() {
  $('#zoneTabs').innerHTML = state.floor.zones.map((z) =>
    `<button role="tab" data-zone="${esc(z.id)}" aria-selected="${z.id === state.zone}">${esc(z.name)}</button>`).join('');
}

function renderPlan() {
  const zone = state.floor.zones.find((z) => z.id === state.zone);
  $('#zoneName').textContent = zone.name;
  const tables = state.floor.tables.filter((t) => t.zone === state.zone);

  $('#floorplan').innerHTML = tables.map((t) => {
    const mins = t.seatedAt ? minsAgo(t.seatedAt) : null;
    const overdue = mins != null && mins > 60;
    return `<button class="table-node" data-table="${esc(t.id)}" data-status="${esc(t.status)}"
        data-shape="${esc(t.shape)}" style="left:${t.x}%;top:${t.y}%"
        ${t.status === 'blocked' ? 'disabled' : ''}
        data-tip="${esc(STATUS[t.status][0])}${mins != null ? ` · ${mins}m` : ''}">
      <b>${esc(t.id)}</b>
      <small>${t.guests ? `${t.guests}/${t.seats}` : `${t.seats} seats`}</small>
      ${t.amount ? `<small class="num" style="color:var(--text-primary);font-weight:600">${money(t.amount)}</small>` : ''}
      ${overdue ? `<small style="color:var(--warning-soft-fg)">${mins}m</small>` : ''}
    </button>`;
  }).join('');
}

function renderReservations() {
  const res = state.floor.reservations;
  $('#resCount').textContent = `${res.length} booked`;
  $('#resList').innerHTML = res.map((r) => `
    <div class="row gap-3" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
      <span class="avatar avatar-sm">${esc(r.name.slice(0, 2).toUpperCase())}</span>
      <span class="stack grow" style="gap:1px;min-width:0">
        <b class="t-sm">${esc(r.name)} · ${r.pax} pax</b>
        <span class="t-2xs dim truncate">${esc(r.note || '')}</span>
      </span>
      <span class="stack ai-end" style="gap:2px">
        <b class="t-sm num">${esc(timeOf(r.at))}</b>
        <span class="badge ${r.status === 'waitlist' ? 'badge-warning' : 'badge-success'}">${esc(r.table || 'Waitlist')}</span>
      </span>
    </div>`).join('');
}

function renderServers() {
  const servers = state.staff.users.filter((u) => u.role === 'role_waiter' && u.covers);
  const max = Math.max(...servers.map((s) => s.salesToday));
  $('#serverLoad').innerHTML = servers.map((s) => `
    <div class="meter-row">
      <span class="row gap-2 t-sm"><span class="avatar avatar-sm">${esc(s.initials)}</span>${esc(s.name)}</span>
      <span class="t-sm num fw-semibold">${money(s.salesToday)}</span>
      <span class="meter-bar"><span style="width:${(s.salesToday / max) * 100}%"></span></span>
      <span class="t-2xs faint" style="grid-column:1/-1">${s.covers} covers · avg ${money(Math.round(s.salesToday / s.covers))} per cover</span>
    </div>`).join('');
}

/* ------------------------------------------------------------------ drawer */
let release = null;

function openTable(id) {
  const t = state.floor.tables.find((x) => x.id === id);
  if (!t) return;
  const order = state.orders.find((o) => o.id === t.orderId);
  const server = state.staff.users.find((u) => u.id === t.server);
  const [label, tone] = STATUS[t.status];

  $('#tblTitle').textContent = `Table ${t.id}`;
  $('#tblBody').innerHTML = `
    <div class="row gap-3 mb-6">
      <span class="badge badge-${tone} badge-lg badge-dot">${esc(label)}</span>
      <span class="badge badge-outline badge-lg">${t.seats} seats</span>
      ${t.seatedAt ? `<span class="badge badge-outline badge-lg">${minsAgo(t.seatedAt)} min at table</span>` : ''}
    </div>

    ${t.status === 'reserved' ? `<div class="alert alert-warning mb-6">${icon('calendar')}
      <div><strong>${esc(t.reservedFor)}</strong><span class="t-xs">Arriving ${esc(timeOf(t.reservedAt))}</span></div></div>` : ''}

    ${t.note ? `<div class="alert mb-6">${icon('info')}<div>${esc(t.note)}</div></div>` : ''}

    ${order ? `
      <div class="card card-flat mb-6">
        <div class="card-header"><h4>${esc(order.id)}</h4>
          <span class="ml-auto t-xs dim">${esc(timeOf(order.placedAt))} · ${esc(server?.name || '')}</span></div>
        <div>${order.lines.map((l) => `
          <div class="row gap-3" style="padding:var(--space-2) var(--space-4);border-bottom:1px solid var(--border-subtle)">
            <span class="badge">${l.qty}×</span>
            <span class="t-sm grow truncate">${esc(l.name)}</span>
            <span class="t-sm num">${money(l.total)}</span>
          </div>`).join('')}
        </div>
        <div class="card-footer row between">
          <span class="t-sm">Running total</span>
          <b class="display" style="font-size:var(--text-lg)">${money(order.total)}</b>
        </div>
      </div>` : `<div class="empty">${icon('utensils', 'icon-xl')}<h4>No open order</h4>
        <p>Seat a guest to start a ticket on this table.</p></div>`}`;

  $('#tblFoot').innerHTML = t.status === 'available' || t.status === 'dirty'
    ? `<button class="btn btn-secondary" data-act="clean">Mark clean</button>
       <button class="btn btn-primary grow" data-act="seat">Seat guests</button>`
    : `<button class="btn btn-secondary" data-act="move">${icon('swap', 'icon-sm')}Move / merge</button>
       <button class="btn btn-secondary" data-act="print">${icon('printer', 'icon-sm')}Print bill</button>
       <button class="btn btn-primary grow" data-act="settle">Settle</button>`;

  $('#tblDrawer').dataset.open = 'true';
  $('#tblScrim').dataset.open = 'true';
  release = trapFocus($('#tblDrawer'));
}

function closeTable() {
  $('#tblDrawer').dataset.open = 'false';
  $('#tblScrim').dataset.open = 'false';
  release?.();
}

/* ------------------------------------------------------------------ wiring */
function wire() {
  on($('#zoneTabs'), 'click', '[data-zone]', (_e, btn) => {
    state.zone = btn.dataset.zone;
    $$('#zoneTabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    renderPlan();
  });
  on($('#floorplan'), 'click', '[data-table]', (_e, btn) => openTable(btn.dataset.table));
  on(document, 'click', '[data-close-tbl]', closeTable);
  $('#tblScrim').addEventListener('click', closeTable);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTable(); });

  on($('#tblFoot'), 'click', '[data-act]', (_e, btn) => {
    const msgs = {
      clean: ['Table marked clean and available', 'success'],
      seat: ['Opening a new ticket in the POS', 'success'],
      move: ['Move / merge is stubbed in the prototype', ''],
      print: ['Bill sent to the counter printer', 'success'],
      settle: ['Settle opens the POS payment sheet', ''],
    };
    const [msg, type] = msgs[btn.dataset.act];
    toast(msg, { type, icon: type === 'success' ? 'check-circle' : 'info' });
    closeTable();
  });

  $('#btnEditFloor').addEventListener('click', () => toast('Drag-and-drop floor editor is stubbed here', { icon: 'info' }));
  $('#btnReserve').addEventListener('click', () => toast('Reservation form is stubbed in the prototype', { icon: 'calendar' }));
}
