/* ============================================================================
   Customers — CRM, loyalty tiers, segments, campaigns and feedback.
   ========================================================================== */
import { $, esc, icon, money, num, loadJSON, ready, on, toast, initials } from './core.js';
import { initShell } from './shell.js';
import { donut, legend } from './charts.js';

const state = { data: null, seg: 'all', q: '' };
const TIERS = { gold: ['Gold', 'warning'], silver: ['Silver', ''], bronze: ['Bronze', 'accent'], new: ['New', 'info'] };

ready(async () => {
  await initShell({ page: 'customers', title: 'Customers', crumb: 'Manage' });
  state.data = await loadJSON('customers');
  const p = state.data.program;
  $('#crmSub').textContent = `${p.name} · ${num(p.enrolled)} enrolled · ${p.activeRate}% active · ${p.earnRate}`;

  renderStats();
  renderSegments();
  renderRows();
  renderCampaigns();
  renderFeedback();
  wire();
});

function renderStats() {
  const c = state.data.customers;
  const lifetime = c.reduce((s, x) => s + x.lifetimeSpend, 0);
  const repeat = c.filter((x) => x.visits > 1).length;
  const lapsed = c.filter((x) => x.lastVisitDaysAgo > 45).length;
  const tiers = ['gold', 'silver', 'bronze', 'new'].map((t) => ({
    label: TIERS[t][0], value: c.filter((x) => x.tier === t).length,
  }));

  $('#crmStats').innerHTML = `
    ${[
      ['Known guests', num(c.length), `${num(state.data.program.enrolled)} in the loyalty programme`, 'customers'],
      ['Repeat rate', `${Math.round((repeat / c.length) * 100)}<small>%</small>`, `${repeat} came back`, 'refresh'],
      ['Lifetime value', money(lifetime), `avg ${money(Math.round(lifetime / c.length))} per guest`, 'rupee'],
      ['Lapsed 45d+', num(lapsed), 'worth a win-back message', 'clock'],
    ].map(([l, v, f, ic]) => `
      <div class="col-3 stat">
        <div class="stat-label">${icon(ic, 'icon-sm')}${esc(l)}</div>
        <div class="stat-value">${v}</div>
        <div class="stat-foot">${esc(f)}</div>
      </div>`).join('')}
    <section class="col-12 card">
      <div class="card-header"><h3>Loyalty mix</h3>
        <span class="ml-auto t-xs dim">${state.data.program.redeemRate}</span></div>
      <div class="card-body row gap-8 wrap">
        ${donut(tiers, { centerLabel: String(c.length), centerSub: 'guests' })}
        ${legend(tiers, { fmt: (v) => `${v} guests` })}
      </div>
    </section>`;
}

function renderSegments() {
  $('#segFilter').innerHTML = `<option value="all">All guests</option>` +
    state.data.segments.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${s.size})</option>`).join('');

  $('#segList').innerHTML = state.data.segments.map((s) => `
    <button class="row gap-3 full" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle);text-align:left"
            data-seg="${esc(s.id)}">
      <span class="stack grow" style="gap:1px;min-width:0">
        <b class="t-sm">${esc(s.name)}</b>
        <span class="t-2xs faint mono truncate">${esc(s.rule)}</span>
      </span>
      <span class="stack ai-end" style="gap:1px">
        <b class="t-sm num">${num(s.size)}</b>
        <span class="t-2xs dim">avg ${money(s.avgSpend)}</span>
      </span>
    </button>`).join('');
}

function renderRows() {
  const seg = state.data.segments.find((s) => s.id === state.seg);
  const q = state.q.trim().toLowerCase();
  let rows = state.data.customers;

  // Segment rules are evaluated client-side here; the real system compiles them
  // to SQL against the tenant's rows (see docs/ARCHITECTURE.md § Segments).
  if (seg) {
    const pred = {
      seg_regulars: (c) => c.visits >= 8,
      seg_lapsed: (c) => c.lastVisitDaysAgo > 45,
      seg_biriyani: (c) => /Biriyani/i.test(c.favourite),
      seg_veg: (c) => c.veg,
      seg_highvalue: (c) => c.lifetimeSpend > 8000,
    }[seg.id];
    if (pred) rows = rows.filter(pred);
  }
  if (q) rows = rows.filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q));

  if (!rows.length) {
    $('#crmRows').innerHTML = `<tr><td colspan="8"><div class="empty">${icon('customers', 'icon-xl')}
      <h4>No guests match</h4></div></td></tr>`;
    return;
  }

  $('#crmRows').innerHTML = rows.slice(0, 40).map((c) => {
    const [tier, tone] = TIERS[c.tier];
    return `<tr class="row-link" data-cus="${esc(c.id)}">
      <td>
        <span class="row gap-3">
          <span class="avatar avatar-sm">${esc(initials(c.name))}</span>
          <span class="stack" style="gap:0">
            <b class="t-sm">${esc(c.name)}</b>
            <span class="t-2xs faint mono">${esc(c.phone)}</span>
          </span>
        </span>
      </td>
      <td><span class="badge badge-${tone}">${esc(tier)}</span></td>
      <td class="col-num num">${c.visits}</td>
      <td class="col-num num fw-semibold">${money(c.lifetimeSpend)}</td>
      <td class="col-num num dim">${money(c.avgTicket)}</td>
      <td class="col-num num">${num(c.points)}</td>
      <td class="t-sm ${c.lastVisitDaysAgo > 45 ? 'text-warning' : 'dim'}">${c.lastVisitDaysAgo}d ago</td>
      <td class="t-sm truncate" style="max-width:160px">
        <span class="row gap-2"><span class="diet ${c.veg ? 'diet-veg' : ''}"></span>${esc(c.favourite)}</span>
      </td>
    </tr>`;
  }).join('');
}

function renderCampaigns() {
  const tone = { running: 'success', scheduled: 'info', completed: '' };
  $('#cmpList').innerHTML = state.data.campaigns.map((c) => {
    const openRate = c.sent ? Math.round((c.opened / c.sent) * 100) : 0;
    return `<div class="stack gap-2" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
      <div class="row gap-2">
        <b class="t-sm grow truncate">${esc(c.name)}</b>
        <span class="badge badge-${tone[c.status]}">${esc(c.status)}</span>
      </div>
      <div class="row gap-4 t-2xs dim">
        <span>${icon('send', 'icon-sm')} ${esc(c.channel)}</span>
        <span>${num(c.sent)} sent</span>
        <span>${openRate}% opened</span>
        <span>${c.redeemed} redeemed</span>
      </div>
      ${c.revenue ? `<div class="row between t-xs"><span class="dim">Attributed revenue</span>
        <b class="num text-success">${money(c.revenue)}</b></div>` : ''}
    </div>`;
  }).join('');
}

function renderFeedback() {
  $('#fbList').innerHTML = state.data.feedback.map((f) => `
    <div class="stack gap-2" style="padding:var(--space-3) var(--space-4);border-bottom:1px solid var(--border-subtle)">
      <div class="row gap-2">
        <span class="avatar avatar-sm">${esc(initials(f.name))}</span>
        <b class="t-sm grow truncate">${esc(f.name)}</b>
        <span class="badge badge-${f.rating >= 4 ? 'success' : f.rating === 3 ? 'warning' : 'danger'}">
          ${icon('star', 'icon-sm')}${f.rating}</span>
      </div>
      <p class="t-xs muted" style="line-height:var(--leading-relaxed)">${esc(f.text)}</p>
      <span class="t-2xs faint mono">${esc(f.order)} · ${esc(f.channel)}</span>
    </div>`).join('');
}

function wire() {
  $('#segFilter').addEventListener('change', (e) => { state.seg = e.target.value; renderRows(); });
  $('#crmSearch').addEventListener('input', (e) => { state.q = e.target.value; renderRows(); });
  on($('#segList'), 'click', '[data-seg]', (_e, btn) => {
    state.seg = btn.dataset.seg;
    $('#segFilter').value = state.seg;
    renderRows();
    $('#crmRows').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  on($('#crmRows'), 'click', '[data-cus]', (_e, tr) => {
    const c = state.data.customers.find((x) => x.id === tr.dataset.cus);
    toast(`${c.name} · ${c.visits} visits · ${money(c.lifetimeSpend)} lifetime${c.note ? ` · ${c.note}` : ''}`, { icon: 'user', timeout: 4200 });
  });
  $('#btnCampaign').addEventListener('click', () => toast('Campaign builder is stubbed in the prototype', { icon: 'send' }));
}
