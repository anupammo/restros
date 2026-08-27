/* ============================================================================
   Dashboard — the "how is service going right now" screen.
   Bento layout: live KPIs, revenue trend, station load, top items, insights.
   ========================================================================== */
import { $, esc, icon, money, moneyShort, num, pct, timeOf, loadAll, ready, on, toast } from './core.js';
import { initShell } from './shell.js';
import { areaChart, barChart, rankedBars, donut, legend, sparkline } from './charts.js';

ready(async () => {
  await initShell({ page: 'dashboard', title: 'Dashboard', crumb: 'Cafe Adda Khana · Shyambazar' });
  const [a, orders, inv, floor] = await loadAll('analytics', 'orders', 'inventory', 'floor');
  render(a, orders, inv, floor);
});

const deltaEl = (v, { invert = false } = {}) => {
  const good = invert ? v < 0 : v > 0;
  const dir = v > 0 ? 'trending-up' : 'trending-down';
  return `<span class="delta ${good ? 'delta-up' : 'delta-down'}">${icon(dir, 'icon-sm')}${esc(pct(v))}</span>`;
};

function render(a, ordersData, inv, floor) {
  const t = a.today;
  const orders = ordersData.orders;
  const live = orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status));
  const lowStock = inv.items.filter((i) => i.status !== 'ok');
  const tables = floor.tables;
  const occupied = tables.filter((x) => ['occupied', 'billed'].includes(x.status)).length;
  const seated = tables.filter((x) => ['occupied', 'billed'].includes(x.status)).reduce((s, x) => s + (x.guests || 0), 0);

  const hourly = a.hourly;
  const peakIdx = hourly.indexOf(hourly.reduce((m, h) => (h.sales > m.sales ? h : m), hourly[0]));

  $('#dashboard').innerHTML = `
    <div class="bento">
      ${statTile('Net sales', money(t.netSales), t.deltas.netSales, `${num(t.orders)} orders settled`, sparkline(a.trend30d.slice(-14).map((d) => d.sales)))}
      ${statTile('Orders', num(t.orders), t.deltas.orders, `${live.length} still open`, sparkline(hourly.map((h) => h.orders)))}
      ${statTile('Average bill', money(t.aov), t.deltas.aov, `${num(t.covers)} covers`, sparkline(a.trend30d.slice(-14).map((d) => d.aov)))}
      ${statTile('Avg prep time', `${t.avgPrepMins.toFixed(1)}<small>min</small>`, t.deltas.avgPrepMins, 'target ≤ 14 min', sparkline(a.prepTimeBuckets.map((b) => b.count)), true)}

      <!-- Revenue trend -->
      <section class="col-8 card">
        <div class="card-header">
          <h3>Revenue</h3>
          <span class="badge badge-success badge-dot">${esc(pct(a.windowCompare.deltaPct))} vs prior 15 days</span>
          <div class="ml-auto segmented" role="tablist">
            <button role="tab" aria-selected="true" data-range="30">30 days</button>
            <button role="tab" aria-selected="false" data-range="14">14 days</button>
            <button role="tab" aria-selected="false" data-range="7">7 days</button>
          </div>
        </div>
        <div class="card-body" id="trendHost">
          ${areaChart(a.trend30d.map((d) => d.sales), { labels: a.trend30d.map((d) => d.date.slice(8) + '/' + d.date.slice(5, 7)), height: 210 })}
        </div>
        <div class="card-footer row gap-6 t-xs dim">
          <span><b class="num" style="color:var(--text-primary)">${moneyShort(a.trend30d.reduce((s, d) => s + d.sales, 0))}</b> in 30 days</span>
          <span>Best day <b class="num" style="color:var(--text-primary)">${esc(bestDay(a.trend30d).date)}</b> · ${moneyShort(bestDay(a.trend30d).sales)}</span>
          <span class="ml-auto">Tax-inclusive, net of discounts</span>
        </div>
      </section>

      <!-- Live service -->
      <section class="col-4 card">
        <div class="card-header">
          <span class="dot-live"></span><h3>Live service</h3>
          <a class="ml-auto btn btn-ghost btn-sm" href="kds.html">Open KDS ${icon('arrow-right', 'icon-sm')}</a>
        </div>
        <div class="card-body stack gap-4">
          <div class="grid-3 gap-3">
            ${miniStat('On the pass', live.length, 'kds')}
            ${miniStat('Tables seated', `${occupied}/${tables.length}`, 'tables')}
            ${miniStat('Covers in', seated, 'customers')}
          </div>
          <div class="divider"></div>
          <div class="stack gap-3">
            ${live.slice(0, 5).map((o) => liveRow(o)).join('') || '<p class="t-sm dim">Nothing on the pass.</p>'}
          </div>
        </div>
      </section>

      <!-- Hourly -->
      <section class="col-6 card">
        <div class="card-header">
          <h3>Sales by hour</h3>
          <span class="ml-auto badge badge-accent">Peak ${esc(String(hourly[peakIdx].hour).padStart(2, '0'))}:00</span>
        </div>
        <div class="card-body">
          ${barChart(hourly.map((h) => h.sales), { labels: hourly.map((h) => String(h.hour).padStart(2, '0')), height: 190, highlight: peakIdx })}
        </div>
      </section>

      <!-- Channel mix -->
      <section class="col-6 card">
        <div class="card-header"><h3>Where orders came from</h3>
          <span class="ml-auto t-xs dim">Commission ${money(t.commission)}</span>
        </div>
        <div class="card-body row gap-6 wrap">
          ${donut(a.channelMix.map((c) => ({ label: c.name, value: c.sales })), {
            centerLabel: moneyShort(a.channelMix.reduce((s, c) => s + c.sales, 0)),
            centerSub: 'today',
          })}
          ${legend(a.channelMix.map((c) => ({ label: `${c.name} · ${c.orders}`, value: c.sales })))}
        </div>
      </section>

      <!-- Top items -->
      <section class="col-5 card">
        <div class="card-header"><h3>Top sellers</h3>
          <a class="ml-auto btn btn-ghost btn-sm" href="reports.html">All items ${icon('arrow-right', 'icon-sm')}</a>
        </div>
        <div class="card-body">
          ${rankedBars(a.topItems.slice(0, 7).map((i) => ({ label: `${i.name}`, value: i.sales })))}
        </div>
      </section>

      <!-- Needs attention -->
      <section class="col-4 card">
        <div class="card-header">${icon('warning')}<h3>Needs attention</h3></div>
        <div class="card-body stack gap-3">
          ${attention('11 menu items have no price', 'Fish, drinks and ice cream were blank on the printed card. They stay hidden from the guest menu until priced.', 'menu.html', 'Fix in menu', 'warning')}
          ${attention(`${lowStock.length} ingredients below par`, lowStock.slice(0, 3).map((i) => i.name).join(', ') + '…', 'inventory.html', 'Open inventory', 'danger')}
          ${attention('Aggregator margin is thin', 'Swiggy and Zomato take 21–22%. Blended margin sits 9 points under dine-in.', 'reports.html', 'See breakdown', 'info')}
        </div>
      </section>

      <!-- Insights -->
      <section class="col-3 card" style="background:linear-gradient(160deg,var(--brand-soft),transparent 60%)">
        <div class="card-header">${icon('sparkles')}<h3>What changed</h3></div>
        <div class="card-body stack gap-4">
          ${a.insights.slice(0, 3).map((i) => `
            <div class="stack gap-1">
              <b class="t-sm">${esc(i.title)}</b>
              <p class="t-xs muted" style="line-height:var(--leading-relaxed)">${esc(i.body)}</p>
            </div>`).join('<div class="divider"></div>')}
        </div>
      </section>

      <!-- Recent orders -->
      <section class="col-12 card">
        <div class="card-header">
          <h3>Recent orders</h3>
          <a class="ml-auto btn btn-ghost btn-sm" href="orders.html">View all ${icon('arrow-right', 'icon-sm')}</a>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Order</th><th>Channel</th><th>Table</th><th>Items</th>
              <th>Placed</th><th>Status</th><th class="col-num">Total</th>
            </tr></thead>
            <tbody>
              ${orders.slice(0, 8).map((o) => `
                <tr class="row-link">
                  <td><span class="mono t-sm fw-semibold">${esc(o.id)}</span>
                      <div class="t-2xs faint mono">${esc(o.kot)}</div></td>
                  <td>${channelBadge(o.channel, o.channelName)}</td>
                  <td class="t-sm">${o.table ? esc(o.table) : '<span class="faint">—</span>'}</td>
                  <td class="t-sm truncate" style="max-width:280px">${esc(o.lines.map((l) => `${l.qty}× ${l.name}`).join(', '))}</td>
                  <td class="t-sm dim nowrap">${esc(timeOf(o.placedAt))}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td class="col-num fw-semibold">${money(o.total)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;

  // Range switcher on the revenue chart
  on($('#dashboard'), 'click', '[data-range]', (_e, btn) => {
    const n = Number(btn.dataset.range);
    btn.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    const slice = a.trend30d.slice(-n);
    $('#trendHost').innerHTML = areaChart(slice.map((d) => d.sales), {
      labels: slice.map((d) => d.date.slice(8) + '/' + d.date.slice(5, 7)),
      height: 210,
    });
  });

  on($('#dashboard'), 'click', '.row-link', () => toast('Order detail opens in the Orders screen', { icon: 'info' }));
}

/* ------------------------------------------------------------------ bits */
const bestDay = (trend) => trend.reduce((m, d) => (d.sales > m.sales ? d : m), trend[0]);

function statTile(label, value, delta, foot, spark, invert = false) {
  return `<div class="col-3 stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="row between ai-end gap-3">
      <div class="stat-value">${value}</div>
      ${deltaEl(delta, { invert })}
    </div>
    <div style="color:${invert ? 'var(--info)' : 'var(--brand)'};margin-block:var(--space-1)">${spark}</div>
    <div class="stat-foot">${esc(foot)}</div>
  </div>`;
}

function miniStat(label, value, ico) {
  return `<div class="stack gap-1">
    <span class="row gap-1 t-2xs dim">${icon(ico, 'icon-sm')}${esc(label)}</span>
    <b class="display" style="font-size:var(--text-lg)">${esc(String(value))}</b>
  </div>`;
}

function liveRow(o) {
  const mins = Math.max(0, Math.round((new Date('2026-08-27T20:12:00+05:30') - new Date(o.placedAt)) / 60000));
  const tone = mins > 18 ? 'danger' : mins > 12 ? 'warning' : 'success';
  return `<div class="row gap-3">
    <span class="badge badge-${tone} num">${mins}m</span>
    <span class="stack gap-0 grow" style="min-width:0">
      <b class="t-sm mono">${esc(o.id)}</b>
      <span class="t-2xs faint truncate">${esc(o.lines.map((l) => `${l.qty}× ${l.name}`).join(', '))}</span>
    </span>
    <span class="t-xs dim nowrap">${esc(o.table || o.channelName)}</span>
  </div>`;
}

function attention(title, body, href, cta, tone) {
  return `<div class="alert alert-${tone}">
    ${icon(tone === 'danger' ? 'alert' : tone === 'warning' ? 'warning' : 'info')}
    <div class="grow">
      <strong>${esc(title)}</strong>
      <span class="t-xs">${esc(body)}</span>
      <div class="mt-2"><a class="btn btn-secondary btn-sm" href="${esc(href)}">${esc(cta)}</a></div>
    </div>
  </div>`;
}

export function statusBadge(status) {
  const map = {
    new: ['info', 'New'], preparing: ['warning', 'Preparing'], ready: ['success', 'Ready'],
    served: ['brand', 'Served'], paid: ['success', 'Paid'], cancelled: ['danger', 'Void'],
  };
  const [tone, label] = map[status] || ['', status];
  return `<span class="badge badge-${tone} badge-dot">${esc(label)}</span>`;
}

export function channelBadge(id, name) {
  const ico = { dine_in: 'utensils', takeaway: 'bag', qr: 'qr', swiggy: 'bike', zomato: 'bike' }[id] || 'orders';
  return `<span class="row gap-2 t-sm nowrap">${icon(ico, 'icon-sm')}${esc(name)}</span>`;
}
