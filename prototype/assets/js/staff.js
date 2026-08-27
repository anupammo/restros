/* ============================================================================
   Staff & Roles — people, the RBAC matrix and the audit trail.
   The permission matrix is the honest way to show a multi-tenant authorisation
   model: roles are rows of capability, not job titles.
   ========================================================================== */
import { $, $$, esc, icon, money, num, loadAll, ready, on, toast, timeAgo, groupBy } from './core.js';
import { initShell } from './shell.js';

let S, FLOOR, tab = 'people';

ready(async () => {
  await initShell({ page: 'staff', title: 'Staff & Roles', crumb: 'Manage' });
  [S, FLOOR] = await loadAll('staff', 'floor');
  const active = S.users.filter((u) => u.status === 'active');
  const onShift = S.users.filter((u) => u.shift?.clockedIn);
  $('#staffSub').textContent = `${active.length} active · ${onShift.length} clocked in · ${S.roles.length} roles`;
  render();

  on($('#staffTabs'), 'click', '[data-t]', (_e, btn) => {
    tab = btn.dataset.t;
    $$('#staffTabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t === btn)));
    render();
  });
  $('#btnInvite').addEventListener('click', () => toast('Invite sends an email + a 4-digit POS PIN', { icon: 'mail' }));
  $('#btnRole').addEventListener('click', () => toast('Custom roles clone an existing role, then you toggle capabilities', { icon: 'shield' }));
});

function render() {
  if (tab === 'people') renderPeople();
  else if (tab === 'roles') renderRoles();
  else renderAudit();
}

/* ------------------------------------------------------------------ people */
function renderPeople() {
  const byRole = groupBy(S.users, (u) => u.role);

  $('#staffPanel').innerHTML = `
    <div class="bento mb-5">
      ${[
        ['On shift now', S.users.filter((u) => u.shift?.clockedIn).length, 'clocked in', 'shift'],
        ['Team size', S.users.filter((u) => u.status === 'active').length, `${S.users.filter((u) => u.status === 'invited').length} invited`, 'staff'],
        ['Roles', S.roles.length, `${S.roles.filter((r) => !r.system).length} custom`, 'shield'],
        ['Sales today', money(S.users.reduce((s, u) => s + (u.salesToday || 0), 0)), 'attributed to servers', 'rupee'],
      ].map(([l, v, f, ic]) => `
        <div class="col-3 stat">
          <div class="stat-label">${icon(ic, 'icon-sm')}${esc(l)}</div>
          <div class="stat-value">${esc(String(v))}</div>
          <div class="stat-foot">${esc(f)}</div>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Person</th><th>Role</th><th>Outlets</th><th>Shift</th>
            <th>POS PIN</th><th>Last active</th><th class="col-num">Today</th><th></th>
          </tr></thead>
          <tbody>
            ${Object.entries(byRole).flatMap(([roleId, users]) => {
              const role = S.roles.find((r) => r.id === roleId);
              return users.map((u) => userRow(u, role));
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  on($('#staffPanel'), 'click', '[data-user]', (_e, btn) => {
    const u = S.users.find((x) => x.id === btn.dataset.user);
    toast(`${u.name} · ${S.roles.find((r) => r.id === u.role).name}${u.station ? ` · ${u.station}` : ''}`, { icon: 'user' });
  });
}

function userRow(u, role) {
  const outlets = u.outlets.map((o) => FLOOR.outlets.find((x) => x.id === o)?.name.split(' - ')[1] || o);
  return `<tr>
    <td>
      <span class="row gap-3">
        <span class="avatar">${esc(u.initials)}</span>
        <span class="stack" style="gap:0">
          <b class="t-sm">${esc(u.name)}</b>
          <span class="t-2xs faint">${esc(u.email)}</span>
        </span>
        ${u.status === 'invited' ? '<span class="badge badge-info">Invited</span>' : ''}
      </span>
    </td>
    <td><span class="badge badge-${role.color === 'brand' ? 'brand' : role.color === 'neutral' ? '' : role.color}">${esc(role.name)}</span></td>
    <td class="t-xs dim">${esc(outlets.join(', '))}</td>
    <td class="t-sm">
      ${u.shift
        ? `<span class="row gap-2">${u.shift.clockedIn ? '<span class="dot-live"></span>' : ''}
             <span class="num">${esc(u.shift.from)}–${esc(u.shift.to)}</span></span>`
        : '<span class="faint">—</span>'}
    </td>
    <td>${u.pin === 'set'
      ? '<span class="badge badge-success badge-dot">Set</span>'
      : '<span class="badge badge-warning">Not set</span>'}</td>
    <td class="t-xs dim">${u.lastActive ? esc(timeAgo(u.lastActive)) : '<span class="faint">never</span>'}</td>
    <td class="col-num">${u.salesToday ? `<b class="num">${money(u.salesToday)}</b><div class="t-2xs faint">${u.covers} covers</div>` : '<span class="faint">—</span>'}</td>
    <td><button class="btn btn-ghost btn-icon btn-sm" data-user="${esc(u.id)}" aria-label="Manage">${icon('more', 'icon-sm')}</button></td>
  </tr>`;
}

/* ------------------------------------------------------------------ roles */
function renderRoles() {
  const groups = groupBy(S.permissions, (p) => p.group);

  $('#staffPanel').innerHTML = `
    <div class="alert alert-info mb-5">
      ${icon('shield')}
      <div><strong>Least privilege by default</strong>
      <span class="t-xs">Every capability is denied unless a role grants it. Owner is the only role that can
      change billing or publish a menu version — that boundary is enforced server-side, not just hidden in the UI.</span></div>
    </div>

    <div class="grid-auto gap-4 mb-6">
      ${S.roles.map((r) => `
        <div class="card card-pad stack gap-2">
          <div class="row gap-2">
            <b class="t-sm">${esc(r.name)}</b>
            ${r.system ? '<span class="badge">System</span>' : '<span class="badge badge-brand">Custom</span>'}
          </div>
          <p class="t-xs muted" style="line-height:var(--leading-relaxed)">${esc(r.description)}</p>
          <div class="row between mt-2">
            <span class="t-xs dim">${r.members} member${r.members > 1 ? 's' : ''}</span>
            <span class="t-xs dim num">${S.permissions.filter((p) => p.roles.includes(r.id)).length} of ${S.permissions.length} caps</span>
          </div>
        </div>`).join('')}
    </div>

    <div class="card">
      <div class="card-header"><h3>Permission matrix</h3>
        <span class="ml-auto t-xs dim">tap a cell to toggle (prototype only)</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th style="min-width:260px">Capability</th>
            ${S.roles.map((r) => `<th class="center" style="text-align:center">${esc(r.name.replace(' (custom)', ''))}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${Object.entries(groups).map(([group, perms]) => `
              <tr><td colspan="${S.roles.length + 1}" style="background:var(--bg-inset);font-weight:600;font-size:var(--text-xs);
                  text-transform:uppercase;letter-spacing:var(--tracking-wide);color:var(--text-tertiary)">${esc(group)}</td></tr>
              ${perms.map((p) => `<tr>
                <td><b class="t-sm">${esc(p.label)}</b><div class="t-2xs faint mono">${esc(p.key)}</div></td>
                ${S.roles.map((r) => `<td style="text-align:center">
                  <button class="btn btn-ghost btn-icon btn-sm" data-perm="${esc(p.key)}" data-role="${esc(r.id)}"
                          aria-pressed="${p.roles.includes(r.id)}"
                          aria-label="${esc(p.label)} for ${esc(r.name)}">
                    ${p.roles.includes(r.id)
                      ? `<span style="color:var(--success)">${icon('check')}</span>`
                      : `<span style="color:var(--text-quaternary)">${icon('minus')}</span>`}
                  </button></td>`).join('')}
              </tr>`).join('')}`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  on($('#staffPanel'), 'click', '[data-perm]', (_e, btn) => {
    const perm = S.permissions.find((p) => p.key === btn.dataset.perm);
    const role = S.roles.find((r) => r.id === btn.dataset.role);
    const has = perm.roles.includes(role.id);
    if (has) perm.roles = perm.roles.filter((x) => x !== role.id);
    else perm.roles.push(role.id);
    renderRoles();
    toast(`${role.name} ${has ? 'can no longer' : 'can now'} ${perm.label.toLowerCase()}`,
      { type: has ? 'warning' : 'success', icon: 'shield' });
  });
}

/* ------------------------------------------------------------------ audit */
function renderAudit() {
  const tone = { info: '', notice: 'info', warning: 'warning', danger: 'danger' };
  $('#staffPanel').innerHTML = `
    <div class="alert mb-5">${icon('database')}
      <div><strong>Every privileged action is recorded</strong>
      <span class="t-xs">Voids, discounts, price changes, 86s, till events and refunds are append-only and
      scoped to the tenant. Retained 24 months on Growth, 7 years on Scale.</span></div></div>

    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>Severity</th></tr></thead>
          <tbody>
            ${S.auditLog.map((a) => {
              const u = S.users.find((x) => x.id === a.user);
              return `<tr>
                <td class="t-xs dim nowrap">${esc(timeAgo(a.at))}</td>
                <td><span class="row gap-2"><span class="avatar avatar-sm">${esc(u?.initials || '??')}</span>
                    <span class="t-sm">${esc(u?.name || a.user)}</span></span></td>
                <td><code class="t-xs">${esc(a.action)}</code></td>
                <td class="t-sm">${esc(a.detail)}</td>
                <td><span class="badge badge-${tone[a.severity]}">${esc(a.severity)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="card-footer t-xs dim">Showing the most recent 5 events. Full log exports as CSV or streams to a webhook.</div>
    </div>`;
}
