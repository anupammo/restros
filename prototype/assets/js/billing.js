/* ============================================================================
   Billing & Plan — subscription state, usage against plan limits, invoices.
   Plan limits are read from tenants.json so the console and the marketing
   pricing page can never disagree.
   ========================================================================== */
import { $, esc, icon, money, num, loadJSON, ready, on, toast, store } from './core.js';
import { initShell } from './shell.js';

ready(async () => {
  await initShell({ page: 'billing', title: 'Billing & Plan', crumb: 'Account' });
  const T = await loadJSON('tenants');
  const tenant = T.tenants.find((t) => t.id === store.get('tenant', 't_adda')) || T.tenants[0];
  const plan = T.plans.find((p) => p.id === tenant.plan);
  render(T, tenant, plan);

  on($('#billing'), 'click', '[data-plan]', (_e, btn) => {
    const p = T.plans.find((x) => x.id === btn.dataset.plan);
    toast(p.price == null
      ? 'Enterprise is quoted — a solution architect will reach out'
      : `Switching to ${p.name} — prorated ${money(p.price)}/month from today`,
      { type: 'success', icon: 'billing', timeout: 4000 });
  });
  $('#btnUpgrade').addEventListener('click', () =>
    toast('Upgrade to Scale unlocks 15 outlets, custom roles and the API', { icon: 'zap' }));
});

function render(T, tenant, plan) {
  const usage = [
    { label: 'Outlets', used: tenant.outlets, limit: plan.outlets, unit: '' },
    { label: 'Staff seats', used: tenant.seats, limit: plan.seats, unit: '' },
    { label: 'Orders this month', used: 4218, limit: 10000, unit: '' },
    { label: 'Menu versions', used: 14, limit: null, unit: 'unlimited' },
  ];

  const invoices = [
    ['INV-2026-0827', '27 Aug 2026', 3999, 'paid', 'UPI · HDFC'],
    ['INV-2026-0727', '27 Jul 2026', 3999, 'paid', 'UPI · HDFC'],
    ['INV-2026-0627', '27 Jun 2026', 3999, 'paid', 'UPI · HDFC'],
    ['INV-2026-0527', '27 May 2026', 1499, 'paid', 'Card · •••• 4242'],
    ['INV-2026-0427', '27 Apr 2026', 1499, 'paid', 'Card · •••• 4242'],
  ];

  $('#billing').innerHTML = `
    <div class="bento">
      <section class="col-8 card">
        <div class="card-header"><h3>Current plan</h3>
          <span class="ml-auto badge badge-success badge-dot">${esc(tenant.status)}</span></div>
        <div class="card-body row between wrap gap-6">
          <div class="stack gap-2">
            <span class="eyebrow">${esc(plan.name)}</span>
            <div class="row ai-baseline gap-2">
              <span class="display" style="font-size:var(--text-3xl)">${money(plan.price)}</span>
              <span class="dim">/ month</span>
            </div>
            <span class="t-sm dim">Renews 27 Sep 2026 · ${plan.outlets} outlets, ${plan.seats} seats included</span>
          </div>
          <div class="stack gap-2 ai-end">
            <div class="row gap-2">
              ${icon('upi')}<b class="t-sm">UPI mandate · HDFC ••4471</b>
            </div>
            <button class="btn btn-secondary btn-sm">Change payment method</button>
            <button class="btn btn-ghost btn-sm">Cancel subscription</button>
          </div>
        </div>
        <div class="card-footer grid-2 gap-6">
          ${usage.map((u) => {
            const pctUsed = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0;
            const tone = pctUsed > 85 ? 'danger' : pctUsed > 65 ? 'warning' : 'success';
            return `<div class="meter-row">
              <span class="t-sm">${esc(u.label)}</span>
              <span class="t-sm num fw-semibold">${num(u.used)}${u.limit ? ` / ${num(u.limit)}` : ` · ${u.unit}`}</span>
              <span class="meter-bar"><span style="width:${u.limit ? pctUsed : 100}%;background:var(--${u.limit ? tone : 'brand'})"></span></span>
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="col-4 card">
        <div class="card-header"><h3>Next invoice</h3></div>
        <div class="card-body stack gap-3">
          <div class="row between t-sm"><span class="dim">Growth plan</span><span class="num">${money(plan.price)}</span></div>
          <div class="row between t-sm"><span class="dim">Extra outlet (1 × ₹999)</span><span class="num">${money(999)}</span></div>
          <div class="row between t-sm"><span class="dim">GST 18%</span><span class="num">${money(Math.round((plan.price + 999) * 0.18))}</span></div>
          <div class="divider"></div>
          <div class="row between"><b>Due 27 Sep</b>
            <b class="display" style="font-size:var(--text-xl)">${money(Math.round((plan.price + 999) * 1.18))}</b></div>
          <div class="alert alert-info mt-2">${icon('info')}
            <div class="t-xs">Charged automatically to the UPI mandate. We email the invoice three days before.</div></div>
        </div>
      </section>

      <section class="col-12">
        <h3 class="mb-4">Plans</h3>
        <div class="grid-auto gap-4" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          ${T.plans.map((p) => `
            <div class="price-card" data-popular="${p.id === tenant.plan}">
              <div class="stack gap-1">
                <div class="row gap-2">
                  <b class="t-md">${esc(p.name)}</b>
                  ${p.id === tenant.plan ? '<span class="badge badge-brand">Current</span>' : ''}
                  ${p.popular && p.id !== tenant.plan ? '<span class="badge badge-accent">Popular</span>' : ''}
                </div>
                <div class="row ai-baseline gap-1">
                  <span class="price-amount">${p.price == null ? 'Custom' : money(p.price)}</span>
                  ${p.price != null ? '<span class="t-xs dim">/mo</span>' : ''}
                </div>
                <span class="t-xs dim">${p.outlets ? `up to ${p.outlets} outlets` : 'unlimited outlets'} ·
                  ${p.seats ? `${p.seats} seats` : 'unlimited seats'}</span>
              </div>
              <ul class="price-list">
                ${p.features.map((f) => `<li>${icon('check', 'icon-sm')}<span>${esc(f)}</span></li>`).join('')}
              </ul>
              <button class="btn ${p.id === tenant.plan ? 'btn-secondary' : 'btn-primary'} btn-block"
                      data-plan="${esc(p.id)}" ${p.id === tenant.plan ? 'disabled' : ''}>
                ${p.id === tenant.plan ? 'Current plan' : p.price == null ? 'Talk to sales' : 'Switch to ' + esc(p.name)}
              </button>
            </div>`).join('')}
        </div>
      </section>

      <section class="col-12 card">
        <div class="card-header"><h3>Invoice history</h3>
          <span class="ml-auto t-xs dim">GST invoices, downloadable as PDF</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Invoice</th><th>Date</th><th>Method</th><th>Status</th><th class="col-num">Amount</th><th></th></tr></thead>
            <tbody>
              ${invoices.map(([id, date, amt, status, method]) => `
                <tr>
                  <td class="mono t-sm">${esc(id)}</td>
                  <td class="t-sm dim">${esc(date)}</td>
                  <td class="t-sm">${esc(method)}</td>
                  <td><span class="badge badge-success badge-dot">${esc(status)}</span></td>
                  <td class="col-num num fw-semibold">${money(amt)}</td>
                  <td><button class="btn btn-ghost btn-sm">${icon('download', 'icon-sm')}PDF</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>`;
}
