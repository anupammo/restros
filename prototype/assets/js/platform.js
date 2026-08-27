/* ============================================================================
   Platform Console — the other side of multi-tenancy.
   This is what RestrOS staff see: tenant health, MRR, provisioning, impersonation
   (audited), and the fleet-wide operational picture. No tenant ever sees it.
   ========================================================================== */
import { $, esc, icon, money, moneyShort, num, pct, loadJSON, ready, on, toast, timeAgo, store } from './core.js';
import { initShell } from './shell.js';
import { barChart, donut, legend, sparkline } from './charts.js';

let T;

ready(async () => {
  await initShell({ page: 'platform', title: 'Platform Console', crumb: 'RestrOS staff' });
  T = await loadJSON('tenants');
  render();
  wire();
});

const STATUS = {
  active: ['Active', 'success'], trialing: ['Trial', 'info'],
  past_due: ['Past due', 'warning'], suspended: ['Suspended', 'danger'],
};

function render() {
  const s = T.platformStats;
  const byPlan = T.plans.map((p) => ({
    label: p.name,
    value: T.tenants.filter((t) => t.plan === p.id).reduce((a, t) => a + t.mrr, 0),
  })).filter((x) => x.value);

  $('#platform').innerHTML = `
    <div class="alert alert-warning">
      ${icon('shield')}
      <div><strong>You are viewing platform-level data</strong>
      <span class="t-xs">Access is restricted to the <code>superadmin</code> role and every view here is written to the
      platform audit log. Tenant data stays isolated — this console reads aggregates, not order rows.</span></div>
    </div>

    <div class="bento">
      ${tile('MRR', money(s.mrr), `${s.activeTenants} paying tenants`, s.mrrDeltaPct, sparkline([24, 26, 27, 29, 28, 31, 32]))}
      ${tile('Tenants', num(T.tenants.length), `${s.trialing} trialing · ${s.suspended} suspended`, 14.3, sparkline(s.signupsThisWeek))}
      ${tile('Orders today', num(s.ordersToday), `${moneyShort(s.gmvMonth)} GMV this month`, 9.6, sparkline([1420, 1680, 1590, 1830, 1975, 2044, 2154]))}
      ${tile('p95 latency', `${s.p95LatencyMs}<small>ms</small>`, `${s.uptimePct}% uptime · ${s.openIncidents} incidents`, -6.2, sparkline([172, 168, 159, 151, 148, 145, 143]), true)}

      <section class="col-8 card">
        <div class="card-header"><h3>Tenants</h3>
          <div class="ml-auto row gap-2">
            <div class="input-group" style="width:220px">
              ${icon('search')}<input class="input" id="tenSearch" type="search" placeholder="Search tenants…">
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Tenant</th><th>Plan</th><th class="col-num">Outlets</th><th class="col-num">Seats</th>
              <th class="col-num">MRR</th><th class="col-num">Orders today</th><th style="width:120px">Health</th>
              <th>Status</th><th></th>
            </tr></thead>
            <tbody id="tenRows">${T.tenants.map(tenantRow).join('')}</tbody>
          </table>
        </div>
      </section>

      <section class="col-4 stack gap-4">
        <div class="card">
          <div class="card-header"><h3>MRR by plan</h3></div>
          <div class="card-body stack gap-5">
            ${donut(byPlan, { centerLabel: moneyShort(s.mrr), centerSub: 'per month' })}
            ${legend(byPlan)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Needs a human</h3></div>
          <div class="card-body stack gap-3">
            ${T.tenants.filter((t) => t.churnRisk === 'high' || t.status !== 'active').map((t) => `
              <div class="alert alert-${t.status === 'suspended' ? 'danger' : 'warning'}">
                ${icon('alert')}
                <div><strong>${esc(t.name)}</strong>
                <span class="t-xs">${esc((t.flags || ['needs attention']).join(' · ').replace(/_/g, ' '))}</span></div>
              </div>`).join('')}
          </div>
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Fleet activity</h3>
          <span class="ml-auto t-xs dim">last 24 hours</span></div>
        <div class="card-body">
          <div class="timeline">
            ${T.activity.map((a) => {
              const t = T.tenants.find((x) => x.id === a.tenant);
              return `<div class="timeline-item">
                <span class="timeline-marker">${icon(eventIcon(a.event))}</span>
                <span class="stack" style="gap:1px">
                  <b class="t-sm">${esc(t?.name || a.tenant)} · <code class="t-xs">${esc(a.event)}</code></b>
                  <span class="t-xs muted">${esc(a.detail)}</span>
                  <span class="t-2xs faint">${esc(timeAgo(a.at))} · ${esc(a.actor)}</span>
                </span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </section>

      <section class="col-6 card">
        <div class="card-header"><h3>Signups this week</h3></div>
        <div class="card-body">
          ${barChart(T.platformStats.signupsThisWeek, {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], height: 190, fmt: (v) => String(Math.round(v)) })}
        </div>
        <div class="card-footer t-xs dim">
          Self-serve trials start on Starter. ${T.tenants.filter((t) => t.status === 'trialing').length} trial(s) convert
          on average in 9 days.
        </div>
      </section>

      <section class="col-12 card">
        <div class="card-header"><h3>Tenant isolation</h3>
          <span class="ml-auto badge badge-success badge-dot">All checks green</span></div>
        <div class="card-body grid-auto gap-4">
          ${[
            ['Row-level security', 'Every table carries tenant_id; Postgres RLS policies are enforced on the connection, not in application code.', 'database'],
            ['Per-tenant encryption keys', 'Payment tokens and guest PII are encrypted with a tenant-scoped DEK wrapped by the platform KMS key.', 'key'],
            ['Query guardrails', 'A CI check fails any Prisma query on a tenant model that is not wrapped in the tenant-scoped client.', 'shield'],
            ['Blast-radius limits', 'Background jobs are sharded by tenant so one noisy tenant cannot starve the queue.', 'layers'],
          ].map(([t, d, ic]) => `
            <div class="stack gap-2">
              <span class="feature-ico">${icon(ic)}</span>
              <b class="t-sm">${esc(t)}</b>
              <p class="t-xs muted" style="line-height:var(--leading-relaxed)">${esc(d)}</p>
            </div>`).join('')}
        </div>
      </section>
    </div>`;
}

function tenantRow(t) {
  const plan = T.plans.find((p) => p.id === t.plan);
  const [label, tone] = STATUS[t.status];
  const healthTone = t.health > 80 ? 'success' : t.health > 55 ? 'warning' : 'danger';
  return `<tr data-tenant="${esc(t.id)}">
    <td>
      <span class="row gap-3">
        <span class="tenant-mark" style="width:28px;height:28px;border-radius:8px;font-size:10px;background:${esc(t.brand.primary)}">${esc(t.logoText)}</span>
        <span class="stack" style="gap:0">
          <b class="t-sm">${esc(t.name)}</b>
          <span class="t-2xs faint">${esc(t.city)} · since ${esc(t.createdAt)}</span>
        </span>
      </span>
    </td>
    <td><span class="badge badge-outline">${esc(plan.name)}</span></td>
    <td class="col-num num">${t.outlets}</td>
    <td class="col-num num">${t.seats}</td>
    <td class="col-num num fw-semibold">${t.mrr ? money(t.mrr) : '<span class="faint">—</span>'}</td>
    <td class="col-num num">${num(t.ordersToday)}</td>
    <td>
      <div class="progress progress-${healthTone}"><span style="width:${t.health}%"></span></div>
      <div class="t-2xs faint mt-1">${t.health}/100 · ${esc(t.churnRisk)} risk</div>
    </td>
    <td><span class="badge badge-${tone} badge-dot">${esc(label)}</span></td>
    <td>
      <div class="row gap-1">
        <button class="btn btn-ghost btn-sm" data-impersonate="${esc(t.id)}" data-tip="Open as this tenant (audited)">
          ${icon('eye', 'icon-sm')}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-tip="More">${icon('more', 'icon-sm')}</button>
      </div>
    </td>
  </tr>`;
}

const eventIcon = (e) =>
  e.startsWith('invoice') ? 'billing' :
  e.startsWith('trial') ? 'clock' :
  e.startsWith('outlet') ? 'building' :
  e.startsWith('menu') ? 'menu-book' : 'zap';

function tile(label, value, foot, delta, spark, invert = false) {
  const good = invert ? delta < 0 : delta > 0;
  return `<div class="col-3 stat">
    <div class="stat-label">${esc(label)}</div>
    <div class="row between ai-end">
      <div class="stat-value">${value}</div>
      <span class="delta ${good ? 'delta-up' : 'delta-down'}">${icon(delta > 0 ? 'trending-up' : 'trending-down', 'icon-sm')}${esc(pct(delta))}</span>
    </div>
    <div style="color:var(--brand)">${spark}</div>
    <div class="stat-foot">${esc(foot)}</div>
  </div>`;
}

function wire() {
  on($('#platform'), 'click', '[data-impersonate]', (_e, btn) => {
    const t = T.tenants.find((x) => x.id === btn.dataset.impersonate);
    store.set('tenant', t.id);
    toast(`Opening ${t.name} as support — this session is logged`, { type: 'warning', icon: 'eye', timeout: 2200 });
    setTimeout(() => { location.href = 'dashboard.html'; }, 900);
  });

  $('#tenSearch')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $('#tenRows').innerHTML = T.tenants
      .filter((t) => `${t.name} ${t.city} ${t.slug}`.toLowerCase().includes(q))
      .map(tenantRow).join('');
  });

  $('#btnProvision').addEventListener('click', () =>
    toast('Provisioning runs migrations, seeds default roles and issues an owner invite', { icon: 'zap', timeout: 4000 }));
}
