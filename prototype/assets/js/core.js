/* ============================================================================
   RestrOS — core runtime
   Tiny helpers shared by every prototype page: DOM, formatting, storage,
   theming, toasts and the JSON data loader.

   ES module. Served over HTTP (XAMPP) — fetch + modules do not work from
   file://, and loadJSON() surfaces that as a readable banner rather than a
   silent blank screen.
   ========================================================================== */

/** prototype/ — resolved from this module's own URL so pages at any depth work. */
export const BASE = new URL('../../', import.meta.url);
export const DATA_URL = new URL('data/', BASE);
export const SPRITE = new URL('assets/icons/sprite.svg', BASE).href;

/* ------------------------------------------------------------------ DOM */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Escape untrusted text before it goes into an innerHTML template. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Icon markup for template strings. */
export const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="${SPRITE}#i-${name}"></use></svg>`;

/** Event delegation: on(root, 'click', '.btn', handler) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const match = ev.target.closest(selector);
    if (match && root.contains(match)) handler(ev, match);
  });
}

export const ready = (fn) =>
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once: true }) : fn();

/* ------------------------------------------------------------------ FORMAT */
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat('en-IN');

export function money(n, { paise = false, dash = '—' } = {}) {
  if (n == null || Number.isNaN(n)) return dash;
  return paise ? inr2.format(n) : inr.format(n);
}

/** Indian short scale — 1.2L, 48.6K — for dense tiles and axis labels. */
export function moneyShort(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `₹${Math.round(n)}`;
}

export const num = (n) => (n == null ? '—' : plain.format(n));
export const pct = (n, digits = 1) => `${n > 0 ? '+' : ''}${Number(n).toFixed(digits)}%`;

export const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

export const dateOf = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** "Now" for the prototype is pinned to the seeded business date. */
export const NOW = new Date('2026-08-27T20:12:00+05:30');

export function minsAgo(iso) {
  return Math.max(0, Math.round((NOW - new Date(iso)) / 60000));
}

export function timeAgo(iso) {
  const m = minsAgo(iso);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export const initials = (name) =>
  String(name).split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ------------------------------------------------------------------ STORAGE */
const NS = 'restros:';
export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
    catch { return false; }
  },
  del(key) { try { localStorage.removeItem(NS + key); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------------ THEME */
export const theme = {
  get() { return store.get('theme', 'system'); },
  apply(mode) {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
    store.set('theme', mode);
    document.dispatchEvent(new CustomEvent('restros:theme', { detail: { mode } }));
  },
  /** system → dark → light → system */
  cycle() {
    const order = ['system', 'dark', 'light'];
    const next = order[(order.indexOf(this.get()) + 1) % order.length];
    this.apply(next);
    return next;
  },
  init() { this.apply(this.get()); },
};
// Applied before first paint by the inline bootstrap in each page's <head>.
theme.init();

/* ------------------------------------------------------------------ TOAST */
let toastHost;
export function toast(message, { type = '', icon: ic = 'check-circle', timeout = 3200 } = {}) {
  if (!toastHost) {
    toastHost = $('.toast-stack') || el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast ${type ? 'toast-' + type : ''}`, html: `${icon(ic)}<span>${esc(message)}</span>` });
  toastHost.append(node);
  setTimeout(() => {
    node.dataset.leaving = 'true';
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }, timeout);
  return node;
}

/* ------------------------------------------------------------------ DATA */
const cache = new Map();

/**
 * Load a JSON file from prototype/data/. Results are cached per page load.
 * A failure renders an inline banner explaining the XAMPP requirement instead
 * of leaving an empty screen.
 */
export async function loadJSON(name) {
  if (cache.has(name)) return cache.get(name);
  const p = fetch(new URL(`${name}.json`, DATA_URL))
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    })
    .catch((err) => {
      cache.delete(name);
      showDataError(name, err);
      throw err;
    });
  cache.set(name, p);
  return p;
}

/** Load several files at once: const [menu, orders] = await loadAll('menu','orders') */
export const loadAll = (...names) => Promise.all(names.map(loadJSON));

function showDataError(name, err) {
  if ($('.data-error')) return;
  const banner = el('div', {
    class: 'data-error alert alert-danger',
    style: 'position:fixed;left:50%;top:16px;translate:-50% 0;z-index:100;max-width:min(640px,calc(100vw - 32px));box-shadow:var(--shadow-xl)',
    html: `${icon('warning')}<div><strong>Could not load ${esc(name)}.json</strong>
      ${esc(err.message)}. The prototype reads its demo data over HTTP — open it through
      <code>http://localhost/restros/prototype/</code> (XAMPP), not by double-clicking the file.</div>`,
  });
  document.body.append(banner);
}

/* ------------------------------------------------------------------ MISC */
export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + fn(b), 0);
export const groupBy = (arr, fn) =>
  arr.reduce((acc, item) => { const k = fn(item); (acc[k] ||= []).push(item); return acc; }, {});
export const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
export const uid = () => Math.random().toString(36).slice(2, 9);

/** Trap focus inside an open dialog/drawer. Returns a release function. */
export function trapFocus(container) {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  const onKey = (ev) => {
    if (ev.key !== 'Tab') return;
    const items = $$(sel, container).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => container.removeEventListener('keydown', onKey);
}
