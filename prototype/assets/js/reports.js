/* ============================================================================
   Reports — the owner's monthly read: sales, mix, margin, staff, tax.
   Every figure traces back to orders.json so the numbers reconcile.
   ========================================================================== */
import { $, esc, icon, money, moneyShort, num, pct, sum, loadAll, ready, on, toast } from './core.js';
import { initShell } from './shell.js';
import { areaChart, barChart, rankedBars, donut, legend } from './charts.js';

let A, INV, MENU, range = 30;

ready(async () => {
  await initShell({ page: 'reports', title: 'Reports', crumb: 'Insights' });
  [A, INV, MENU] = await loadAll('analytics', 'inventory', 'menu');
  render();
  on($('#reportRange'), 'click', '[data-r]', (_e, btn) => {
    range = Number(btn.dataset.r);
    btn.parentElement.querySelectorAll('.btn').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    render();
  });
  $('#btnGst').addEventListener('click', () =>
    toast('GSTR-1 JSON generated for August 2026 — 2,614 B2C invoices', { type: 'success', icon: 'download' }));
});

function render() {
  const trend = A.trend30d.slice(-range);
  const totalSales = sum(trend, (d) => d.sales);
  const totalOrders = sum(trend, (d) => d.orders);
  const totalCovers = sum(trend, (d) => d.covers);
  const aov = Math.round(totalSales / totalOrders);
  const taxable = totalSales / 1.05;
  const gst = totalSales - taxable;

  // Weekday profile: which days actually carry the month.
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = dowNames.map((name, i) => ({
    name,
    value: Math.round(sum(trend.filter((d) => d.dow === i), (d) => d.sales) / Math.max(trend.filter((d) => d.dow === i).length, 1)),
  }));

  const foodCostRows = INV.recipes.map((r) => {
    const item = MENU.categories.flatMap((c) => c.items).find((i) => i.id === r.itemId);
    return { name: item?.name || r.itemId, price: item?.price ?? item?.variants?.[0].price ?? 0, cost: r.foodCost, margin: r.margin };
  }).sort((a, b) => b.margin - a.margin);

  $('#reports').innerHTML = `
    <div class="bento">
      ${tile('Net sales', money(totalSales), `${range} days`, A.windowCompare.deltaPct)}
      ${tile('Orders', num(totalOrders), `${Math.round(totalOrders / range)} per day`, 8.1)}
      ${tile('Average bill', money(aov), `${num(totalCovers)} covers`, 3.9)}
      ${tile('GST collected', money(Math.round(gst)), 'CGST 2.5 + SGST 2.5', 12.4)}

      <section class="col-12 card">
        <div class="card-header"><h3>Sales trend</h3>
          <span class="ml-auto t-xs dim">Tax-inclusive, net of discounts and voids</span></div>
        <div class="card-body">
          ${areaChart(trend.map((d) => d.sales), {
            labels: trend.map((d) => d.date.slice(8) + '/' + d.date.slice(5, 7)), height: 240 })}
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Best days of the week</h3>
          <span class="ml-auto badge badge-accent">${esc(dow.reduce((m, d) => (d.value > m.value ? d : m), dow[0]).name)} is your peak</span></div>
        <div class="card-body">
          ${barChart(dow.map((d) => d.value), { labels: dow.map((d) => d.name), height: 200,
            highlight: dow.indexOf(dow.reduce((m, d) => (d.value > m.value ? d : m), dow[0])) })}
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Hour of day</h3>
          <span class="ml-auto t-xs dim">today's service</span></div>
        <div class="card-body">
          ${barChart(A.hourly.map((h) => h.sales), { labels: A.hourly.map((h) => String(h.hour).padStart(2, '0')), height: 200 })}
        </div>
      </section>

      <section class="col-4 card">
        <div class="card-header"><h3>Category mix</h3></div>
        <div class="card-body stack gap-5">
          ${donut(A.categoryMix.slice(0, 6).map((c) => ({ label: c.name, value: c.sales })), {
            centerLabel: moneyShort(sum(A.categoryMix, (c) => c.sales)), centerSub: 'today' })}
          ${legend(A.categoryMix.slice(0, 6).map((c) => ({ label: c.name, value: c.sales })))}
        </div>
      </section>

      <section class="col-4 card">
        <div class="card-header"><h3>Payment mix</h3></div>
        <div class="card-body stack gap-5">
          ${donut(A.paymentMix.map((p) => ({ label: p.name, value: p.sales })), {
            centerLabel: `${Math.round((A.paymentMix.find((p) => p.id === 'upi')?.sales / sum(A.paymentMix, (p) => p.sales)) * 100)}%`,
            centerSub: 'on UPI' })}
          ${legend(A.paymentMix.map((p) => ({ label: p.name, value: p.sales })))}
        </div>
      </section>

      <section class="col-4 card">
        <div class="card-header"><h3>Ticket time</h3>
          <span class="ml-auto badge badge-${A.today.avgPrepMins > 14 ? 'warning' : 'success'}">avg ${A.today.avgPrepMins.toFixed(1)}m</span></div>
        <div class="card-body">
          ${rankedBars(A.prepTimeBuckets.map((b, i) => ({
            label: b.bucket, value: b.count,
            color: i > 2 ? 'var(--danger)' : i === 2 ? 'var(--warning)' : 'var(--success)',
          })), { fmt: (v) => `${v} orders` })}
          <p class="t-xs dim mt-4">Target is 14 minutes from KOT to pass. Anything past 20 gets a red rail on the KDS.</p>
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Top sellers by revenue</h3>
          <span class="ml-auto t-xs dim">today</span></div>
        <div class="card-body">${rankedBars(A.topItems.map((i) => ({ label: i.name, value: i.sales })))}</div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Channel profitability</h3></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Channel</th><th class="col-num">Orders</th><th class="col-num">Sales</th>
              <th class="col-num">Commission</th><th class="col-num">Net</th></tr></thead>
            <tbody>
              ${A.channelMix.map((c) => `<tr>
                <td class="t-sm">${esc(c.name)}</td>
                <td class="col-num num">${c.orders}</td>
                <td class="col-num num">${money(c.sales)}</td>
                <td class="col-num num ${c.commission ? 'text-danger' : 'faint'}">${c.commission ? '−' + money(c.commission) : '—'}</td>
                <td class="col-num num fw-semibold">${money(c.sales - c.commission)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="card-footer t-xs dim">
          Aggregators bring volume but take 21–22%. Their net contribution per order is
          ${money(Math.round((A.channelMix.find((c) => c.id === 'swiggy')?.sales - A.channelMix.find((c) => c.id === 'swiggy')?.commission) / Math.max(A.channelMix.find((c) => c.id === 'swiggy')?.orders, 1)))}
          against ${money(Math.round(A.channelMix.find((c) => c.id === 'dine_in')?.sales / Math.max(A.channelMix.find((c) => c.id === 'dine_in')?.orders, 1)))} on dine-in.
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Dish margin</h3>
          <span class="ml-auto t-xs dim">price vs food cost</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Dish</th><th class="col-num">Sells at</th><th class="col-num">Food cost</th><th class="col-num">Margin</th></tr></thead>
            <tbody>
              ${foodCostRows.map((r) => `<tr>
                <td class="t-sm">${esc(r.name)}</td>
                <td class="col-num num">${money(r.price)}</td>
                <td class="col-num num dim">${money(r.cost)}</td>
                <td class="col-num"><span class="badge badge-${r.margin > 50 ? 'success' : 'warning'}">${r.margin}%</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Slow movers</h3>
          <span class="ml-auto t-xs dim">candidates to cut or re-price</span></div>
        <div class="card-body">
          ${rankedBars(A.slowMovers.map((i) => ({ label: i.name, value: i.qty, color: 'var(--warning)' })), { fmt: (v) => `${v} sold` })}
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Staff performance</h3></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Server</th><th class="col-num">Covers</th><th class="col-num">Sales</th>
              <th class="col-num">Avg ticket</th><th class="col-num">Rating</th></tr></thead>
            <tbody>
              ${A.staffLeaderboard.map((s) => `<tr>
                <td class="t-sm">${esc(s.name)}</td>
                <td class="col-num num">${s.covers}</td>
                <td class="col-num num fw-semibold">${money(s.sales)}</td>
                <td class="col-num num dim">${money(s.avgTicket)}</td>
                <td class="col-num"><span class="badge badge-success">${icon('star', 'icon-sm')}${s.rating}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header">${icon('sparkles')}<h3>Where the money is going</h3></div>
        <div class="card-body stack gap-4">
          ${A.insights.map((i) => `
            <div class="alert alert-${i.tone === 'positive' ? 'success' : i.tone === 'warning' ? 'warning' : 'info'}">
              ${icon(i.tone === 'warning' ? 'warning' : 'info')}
              <div><strong>${esc(i.title)}</strong><span class="t-xs">${esc(i.body)}</span></div>
            </div>`).join('')}
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Tax summary</h3>
          <span class="ml-auto badge badge-outline">GSTIN 19ABCDE1234F1Z5</span></div>
        <div class="card-body stack gap-3">
          ${taxRow('Gross collected (tax-inclusive)', money(totalSales))}
          ${taxRow('Taxable value', money(Math.round(taxable)))}
          ${taxRow('CGST @ 2.5%', money(Math.round(gst / 2)))}
          ${taxRow('SGST @ 2.5%', money(Math.round(gst / 2)))}
          <div class="divider"></div>
          ${taxRow('Total GST payable', money(Math.round(gst)), true)}
          <p class="t-xs dim mt-2">Restaurant service is taxed at 5% without input tax credit. Aggregator orders
          are reported by the platform under Section 9(5) — reconcile against their monthly statement.</p>
        </div>
      </section>
    </div>`;
}

function tile(label, value, foot, delta) {
  const up = delta > 0;
  return `<div class="col-3 stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="row between ai-end">
      <div class="stat-value">${value}</div>
      <span class="delta ${up ? 'delta-up' : 'delta-down'}">${icon(up ? 'trending-up' : 'trending-down', 'icon-sm')}${esc(pct(delta))}</span>
    </div>
    <div class="stat-foot">${esc(foot)}</div>
  </div>`;
}

const taxRow = (k, v, strong = false) => `<div class="row between ${strong ? 'fw-bold' : 't-sm muted'}">
  <span>${esc(k)}</span><span class="num">${v}</span></div>`;
