/* ============================================================================
   Kitchen Display System
   Ticket rail for the pass. Age drives colour: green under target, amber at
   80% of the item's quoted prep time, red past it. A cook should be able to
   read the board from three metres away.
   ========================================================================== */
import { $, $$, esc, icon, loadAll, ready, on, toast, NOW, minsAgo } from './core.js';

const state = { orders: [], stations: [], filter: 'all', done: new Set(), tick: 0 };

ready(async () => {
  const [menu, ordersData] = await loadAll('menu', 'orders');
  state.stations = menu.stations;
  state.orders = ordersData.orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));

  buildFilter();
  render();
  wire();

  // The prototype clock advances so timers visibly move without faking data.
  setInterval(() => { state.tick++; render(); }, 15000);
  setInterval(updateClock, 1000);
  updateClock();
});

function updateClock() {
  const t = new Date(NOW.getTime() + state.tick * 15000);
  $('#kdsClock').textContent = t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildFilter() {
  $('#stationFilter').innerHTML =
    `<button data-station="all" aria-selected="true">All stations</button>` +
    state.stations.map((s) => `<button data-station="${esc(s.id)}" aria-selected="false">${esc(s.short)}</button>`).join('');
}

/** Only the lines this station cares about; the ticket header stays whole. */
function ticketsForFilter() {
  if (state.filter === 'all') return state.orders.map((o) => ({ o, lines: o.lines }));
  return state.orders
    .map((o) => ({ o, lines: o.lines.filter((l) => l.station === state.filter) }))
    .filter((x) => x.lines.length);
}

function ageState(mins, target) {
  if (mins >= target) return 'late';
  if (mins >= target * 0.8) return 'warn';
  return 'ok';
}

function render() {
  const tickets = ticketsForFilter();
  const offset = state.tick * 0.25; // minutes of simulated drift

  const board = $('#kdsBoard');
  if (!tickets.length) {
    board.innerHTML = `<div class="empty" style="grid-column:1/-1;color:var(--ink-400)">
      ${icon('check-circle', 'icon-xl')}<h4 style="color:var(--ink-200)">Pass is clear</h4>
      <p>No open tickets for this station.</p></div>`;
    return;
  }

  let late = 0;
  let totalAge = 0;

  board.innerHTML = tickets.map(({ o, lines }) => {
    const mins = minsAgo(o.placedAt) + offset;
    const target = Math.max(...lines.map((l) => l.prepMins));
    const age = ageState(mins, target);
    if (age === 'late') late++;
    totalAge += mins;
    const ready = o.status === 'ready';

    return `<article class="kds-ticket" data-age="${age}" data-state="${ready ? 'ready' : 'open'}" data-id="${esc(o.id)}">
      <div class="kds-tkt-head">
        <span class="kds-tkt-id">${esc(o.kot)}</span>
        <span class="badge" style="background:rgba(255,255,255,.1);color:inherit">${esc(o.table || o.channelName)}</span>
        <span class="kds-timer">${Math.floor(mins)}:${String(Math.floor((mins % 1) * 60)).padStart(2, '0')}</span>
      </div>
      <div class="kds-tkt-sub">
        <span>${esc(o.id)}</span><span>·</span>
        <span>${esc(o.channelName)}</span>
        ${o.guests ? `<span>·</span><span>${o.guests} pax</span>` : ''}
        <span class="ml-auto">target ${target}m</span>
      </div>
      <div class="kds-lines">
        ${lines.map((l, i) => {
          const key = `${o.id}:${i}`;
          const done = state.done.has(key);
          const st = state.stations.find((s) => s.id === l.station);
          return `<div class="kds-line" data-line="${esc(key)}" data-done="${done}">
            <b>${l.qty}</b>
            <span>
              <span class="kds-line-name">${esc(l.name)}${l.variant ? ` · ${esc(l.variant)}` : ''}</span>
              ${l.modifiers?.length ? `<div class="kds-line-mod">${esc(l.modifiers.map((m) => m.name).join(' · '))}</div>` : ''}
              ${state.filter === 'all' && st ? `<div class="t-2xs" style="color:${st.color}">${esc(st.short)}</div>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
      <div class="kds-actions">
        <button class="bump" data-bump="${esc(o.id)}">${ready ? 'Served' : 'Bump'}</button>
        <button data-recall="${esc(o.id)}" aria-label="Recall" style="padding-inline:var(--space-4)">${icon('undo')}</button>
      </div>
    </article>`;
  }).join('');

  $('#kdsActive').textContent = tickets.length;
  $('#kdsLate').textContent = late;
  $('#kdsAvg').textContent = `${Math.round(totalAge / tickets.length)}m`;
}

function wire() {
  on($('#stationFilter'), 'click', '[data-station]', (_e, btn) => {
    state.filter = btn.dataset.station;
    $$('#stationFilter button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    render();
  });

  // Tap a line to strike it through as it leaves the station.
  on($('#kdsBoard'), 'click', '[data-line]', (_e, node) => {
    const key = node.dataset.line;
    state.done.has(key) ? state.done.delete(key) : state.done.add(key);
    node.dataset.done = String(state.done.has(key));
  });

  on($('#kdsBoard'), 'click', '[data-bump]', (ev, btn) => {
    ev.stopPropagation();
    const id = btn.dataset.bump;
    const card = btn.closest('.kds-ticket');
    card.style.transition = 'opacity .25s, transform .25s';
    card.style.opacity = '0';
    card.style.transform = 'scale(.94)';
    setTimeout(() => {
      state.orders = state.orders.filter((o) => o.id !== id);
      render();
    }, 240);
    toast(`${id} bumped to the pass`, { type: 'success', icon: 'check-circle' });
  });

  on($('#kdsBoard'), 'click', '[data-recall]', (ev, btn) => {
    ev.stopPropagation();
    toast(`${btn.dataset.recall} recalled — timer reset`, { icon: 'undo' });
  });

  $('#kdsFull').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast('Full screen was blocked by the browser', { type: 'warning', icon: 'warning' }));
  });
}
