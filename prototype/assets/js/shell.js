/* ============================================================================
   RestrOS — application shell
   Renders the sidebar, glass topbar and command palette so every console page
   stays a thin content file. Call initShell() once per page.
   ========================================================================== */
import { $, $$, el, esc, icon, on, store, theme, toast, loadJSON, BASE, initials } from './core.js';

/* Navigation is data, not markup — the same list feeds the sidebar, the command
   palette and the plan-gating story in the docs. */
export const NAV = [
  {
    label: 'Operate',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: 'app/dashboard.html' },
      { id: 'pos', label: 'POS Terminal', icon: 'pos', href: 'app/pos.html', kbd: 'P' },
      { id: 'kds', label: 'Kitchen Display', icon: 'kds', href: 'app/kds.html', badge: 16 },
      { id: 'orders', label: 'Orders', icon: 'orders', href: 'app/orders.html' },
      { id: 'tables', label: 'Tables', icon: 'tables', href: 'app/tables.html' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'menu', label: 'Menu', icon: 'menu-book', href: 'app/menu.html', badge: 11, badgeTone: 'warning' },
      { id: 'inventory', label: 'Inventory', icon: 'inventory', href: 'app/inventory.html', badge: 4, badgeTone: 'warning' },
      { id: 'customers', label: 'Customers', icon: 'customers', href: 'app/customers.html' },
      { id: 'staff', label: 'Staff & Roles', icon: 'staff', href: 'app/staff.html' },
    ],
  },
  {
    label: 'Insights',
    items: [{ id: 'reports', label: 'Reports', icon: 'reports', href: 'app/reports.html' }],
  },
  {
    label: 'Account',
    items: [
      { id: 'settings', label: 'Settings', icon: 'settings', href: 'app/settings.html' },
      { id: 'billing', label: 'Billing & Plan', icon: 'billing', href: 'app/billing.html' },
      { id: 'platform', label: 'Platform Console', icon: 'building', href: 'app/platform.html', role: 'superadmin' },
    ],
  },
];

const EXTRA_COMMANDS = [
  { id: 'guest', label: 'Open guest QR menu', icon: 'qr', href: 'guest/menu.html', meta: 'Public' },
  { id: 'style', label: 'Design system / style guide', icon: 'palette', href: 'styleguide.html', meta: 'Docs' },
  { id: 'site', label: 'Marketing site', icon: 'globe', href: 'index.html', meta: 'Public' },
  { id: 'theme', label: 'Toggle theme', icon: 'moon', action: 'theme' },
  { id: 'newOrder', label: 'New order', icon: 'plus', href: 'app/pos.html', meta: 'Action' },
  { id: 'logout', label: 'Sign out', icon: 'logout', href: 'login.html', meta: 'Account' },
];

const url = (href) => new URL(href, BASE).href;

/* ------------------------------------------------------------------ render */
export async function initShell({ page, title, crumb = '', actions = '' } = {}) {
  const app = $('#app');
  if (!app) throw new Error('initShell: #app not found');

  const [tenantsData, staff] = await Promise.all([loadJSON('tenants'), loadJSON('staff')]);
  const tenantId = store.get('tenant', 't_adda');
  const tenant = tenantsData.tenants.find((t) => t.id === tenantId) || tenantsData.tenants[0];
  const plan = tenantsData.plans.find((p) => p.id === tenant.plan);
  const me = staff.users[0];

  app.dataset.sidebar = store.get('sidebar', 'expanded');
  app.prepend(buildSidebar({ page, tenant, plan, me }));
  $('.app-col', app).prepend(buildTopbar({ title, crumb, actions, tenant, me }));

  wireSidebar(app);
  wireTopbar(app, { tenantsData, tenant });
  buildPalette();

  return { tenant, plan, me, tenants: tenantsData };
}

function buildSidebar({ page, tenant, plan, me }) {
  const groups = NAV.map((g) => {
    const items = g.items.map((it) => {
      const current = it.id === page;
      const badge = it.badge
        ? `<span class="pill ${it.badgeTone === 'warning' ? 'pill-muted' : ''}">${it.badge}</span>`
        : '';
      return `<a class="nav-item" href="${url(it.href)}" ${current ? 'aria-current="page"' : ''} data-nav="${it.id}">
        ${icon(it.icon)}<span>${esc(it.label)}</span>${badge}</a>`;
    }).join('');
    return `<div class="nav-group-label">${esc(g.label)}</div>${items}`;
  }).join('');

  return el('aside', {
    class: 'app-sidebar',
    'aria-label': 'Main navigation',
    html: `
      <button class="tenant-switch" id="tenantSwitch" aria-haspopup="listbox" aria-expanded="false">
        <span class="tenant-mark" style="background:${esc(tenant.brand.primary)}">${esc(tenant.logoText)}</span>
        <span class="tenant-meta">
          <span class="tenant-name">${esc(tenant.name)}</span>
          <span class="tenant-plan">${esc(plan.name)} · ${tenant.outlets} outlet${tenant.outlets > 1 ? 's' : ''}</span>
        </span>
        ${icon('selector')}
      </button>
      <nav class="nav">${groups}</nav>
      <div class="sidebar-foot">
        <a class="nav-item" href="${url('guest/menu.html')}" target="_blank" rel="noopener">
          ${icon('qr')}<span>Guest menu</span>${icon('external')}
        </a>
        <a class="nav-item" href="${url('styleguide.html')}">${icon('palette')}<span>Design system</span></a>
        <a class="nav-item" href="${url('login.html')}">${icon('logout')}<span>Sign out</span></a>
        <div class="divider" style="margin:var(--space-2) 0"></div>
        <div class="nav-item" style="cursor:default">
          <span class="avatar avatar-sm">${esc(initials(me.name))}</span>
          <span class="truncate">${esc(me.name)}</span>
        </div>
      </div>`,
  });
}

function buildTopbar({ title, crumb, actions, tenant, me }) {
  return el('header', {
    class: 'app-topbar',
    html: `
      <button class="btn btn-ghost btn-icon btn-sm sidebar-toggle-mobile" id="sidebarMobile" aria-label="Open navigation">
        ${icon('panel')}
      </button>
      <button class="btn btn-ghost btn-icon btn-sm hide-sm" id="sidebarToggle" aria-label="Collapse sidebar" data-tip="Collapse">
        ${icon('panel')}
      </button>
      <div class="topbar-title">
        ${crumb ? `<span class="crumb">${esc(crumb)}</span>` : ''}
        <h1>${esc(title)}</h1>
      </div>
      <div class="grow"></div>
      ${actions}
      <button class="searchbar hide-sm" id="paletteOpen" aria-label="Search or run a command">
        ${icon('search')}<span>Search…</span><kbd>Ctrl K</kbd>
      </button>
      <button class="outlet-pick hide-sm" id="outletPick">
        ${icon('pin')}<span>Shyambazar</span>${icon('chevron-down')}
      </button>
      <div class="shift-badge hide-sm" data-tip="Shift open since 15:00">
        <span class="dot-live"></span><span>Open</span>
      </div>
      <button class="btn btn-ghost btn-icon btn-sm" id="themeToggle" aria-label="Switch theme" data-tip="Theme">
        ${icon('moon')}
      </button>
      <button class="btn btn-ghost btn-icon btn-sm relative" aria-label="Notifications" data-tip="3 alerts">
        ${icon('bell')}
        <span style="position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:99px;background:var(--accent)"></span>
      </button>
      <span class="avatar" data-tip="${esc(me.name)}">${esc(initials(me.name))}</span>`,
  });
}

/* ------------------------------------------------------------------ wiring */
function wireSidebar(app) {
  $('#sidebarToggle')?.addEventListener('click', () => {
    const next = app.dataset.sidebar === 'collapsed' ? 'expanded' : 'collapsed';
    app.dataset.sidebar = next;
    store.set('sidebar', next);
  });
  $('#sidebarMobile')?.addEventListener('click', () => {
    app.dataset.sidebar = app.dataset.sidebar === 'open' ? 'expanded' : 'open';
  });
  // Tap outside closes the mobile drawer
  document.addEventListener('click', (ev) => {
    if (app.dataset.sidebar !== 'open') return;
    if (ev.target.closest('.app-sidebar, #sidebarMobile')) return;
    app.dataset.sidebar = 'expanded';
  });
}

function wireTopbar(app, { tenantsData, tenant }) {
  const themeBtn = $('#themeToggle');
  const syncThemeIcon = () => {
    const mode = theme.get();
    const name = mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'monitor';
    themeBtn.innerHTML = icon(name);
    themeBtn.dataset.tip = `Theme: ${mode}`;
  };
  syncThemeIcon();
  themeBtn?.addEventListener('click', () => { theme.cycle(); syncThemeIcon(); });

  $('#paletteOpen')?.addEventListener('click', () => openPalette());
  $('#outletPick')?.addEventListener('click', () => toast('Outlet switching is stubbed in the prototype', { icon: 'info' }));

  // Tenant switcher — swaps the active tenant and reloads so brand + data follow.
  $('#tenantSwitch')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const existing = $('#tenantMenu');
    if (existing) { existing.remove(); return; }
    const menu = el('div', {
      id: 'tenantMenu',
      class: 'menu',
      style: 'position:fixed;z-index:var(--z-dropdown);width:280px',
      html: `<div class="menu-label">Switch workspace</div>` +
        tenantsData.tenants.map((t) => `
          <button class="menu-item" data-tenant="${t.id}">
            <span class="tenant-mark" style="width:26px;height:26px;border-radius:7px;font-size:10px;background:${esc(t.brand.primary)}">${esc(t.logoText)}</span>
            <span class="stack" style="gap:0;min-width:0">
              <span class="truncate">${esc(t.name)}</span>
              <span class="t-xs faint">${esc(t.city)} · ${t.outlets} outlet${t.outlets > 1 ? 's' : ''}</span>
            </span>
            ${t.id === tenant.id ? icon('check') : ''}
          </button>`).join('') +
        `<div class="menu-sep"></div>
         <a class="menu-item" href="${url('app/platform.html')}">${icon('building')}Platform console</a>`,
    });
    document.body.append(menu);
    const r = ev.currentTarget.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 6}px`;
    on(menu, 'click', '[data-tenant]', (_e, btn) => {
      store.set('tenant', btn.dataset.tenant);
      location.reload();
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  });
}

/* ------------------------------------------------------------------ palette */
let palette, paletteList, paletteInput, paletteItems = [], cursor = 0;

function buildPalette() {
  const commands = [
    ...NAV.flatMap((g) => g.items.map((it) => ({ ...it, meta: g.label }))),
    ...EXTRA_COMMANDS,
  ];

  palette = el('div', {
    class: 'cmdk',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Command palette',
    html: `
      <input class="cmdk-input" id="cmdkInput" placeholder="Search screens, guests, orders or run a command…" autocomplete="off" spellcheck="false">
      <div class="cmdk-list" id="cmdkList" role="listbox"></div>
      <div class="cmdk-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>Esc</kbd> close</span>
        <span class="ml-auto">RestrOS prototype</span>
      </div>`,
  });
  const scrim = el('div', { class: 'scrim', id: 'cmdkScrim' });
  document.body.append(scrim, palette);
  paletteList = $('#cmdkList');
  paletteInput = $('#cmdkInput');

  const render = (q = '') => {
    const needle = q.trim().toLowerCase();
    paletteItems = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle));
    cursor = 0;
    paletteList.innerHTML = paletteItems.length
      ? paletteItems.map((c, i) => `
          <button class="cmdk-item" role="option" data-i="${i}" ${i === 0 ? 'aria-selected="true"' : ''}>
            ${icon(c.icon)}<span>${esc(c.label)}</span>
            <span class="meta">${esc(c.meta || '')}</span>
          </button>`).join('')
      : `<div class="empty" style="padding:var(--space-8)">${icon('search', 'icon-xl')}<p>No matches for “${esc(q)}”</p></div>`;
  };
  render();

  const move = (delta) => {
    if (!paletteItems.length) return;
    cursor = (cursor + delta + paletteItems.length) % paletteItems.length;
    $$('.cmdk-item', paletteList).forEach((n, i) => n.setAttribute('aria-selected', String(i === cursor)));
    $$('.cmdk-item', paletteList)[cursor]?.scrollIntoView({ block: 'nearest' });
  };

  const run = (cmd) => {
    closePalette();
    if (!cmd) return;
    if (cmd.action === 'theme') { theme.cycle(); toast(`Theme: ${theme.get()}`, { icon: 'sun' }); return; }
    if (cmd.href) location.href = url(cmd.href);
  };

  paletteInput.addEventListener('input', () => render(paletteInput.value));
  palette.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); run(paletteItems[cursor]); }
    else if (ev.key === 'Escape') closePalette();
  });
  on(paletteList, 'click', '.cmdk-item', (_e, btn) => run(paletteItems[Number(btn.dataset.i)]));
  scrim.addEventListener('click', closePalette);

  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); openPalette(); }
    if (ev.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { ev.preventDefault(); openPalette(); }
  });
}

export function openPalette() {
  palette.dataset.open = 'true';
  $('#cmdkScrim').dataset.open = 'true';
  paletteInput.value = '';
  paletteInput.dispatchEvent(new Event('input'));
  paletteInput.focus();
}
export function closePalette() {
  palette.dataset.open = 'false';
  $('#cmdkScrim').dataset.open = 'false';
}
