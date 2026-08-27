/* ============================================================================
   RestrOS — chart primitives
   Hand-rolled inline SVG. No chart library: the prototype ships zero external
   requests, and these five shapes cover every screen.

   Every chart is theme-aware (colours come from CSS custom properties via
   currentColor / var()) and responsive (viewBox + preserveAspectRatio none on
   the plot area, with text kept at a fixed size).
   ========================================================================== */
import { esc, moneyShort } from './core.js';

const PALETTE = [
  'var(--brand)',
  'var(--accent)',
  'var(--info)',
  'var(--warning)',
  'var(--success)',
  'color-mix(in oklch, var(--brand) 55%, var(--info))',
  'color-mix(in oklch, var(--accent) 55%, var(--warning))',
];
export const seriesColor = (i) => PALETTE[i % PALETTE.length];

/** Catmull-Rom → cubic bezier, so trend lines curve without overshooting. */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Area + line trend chart.
 * @param {number[]} values
 * @param {{labels?:string[], height?:number, fmt?:Function, id?:string}} opts
 */
export function areaChart(values, { labels = [], height = 180, fmt = moneyShort, id = 'a' + Math.random().toString(36).slice(2, 7) } = {}) {
  const W = 720, H = height, padL = 46, padR = 8, padT = 12, padB = 22;
  const max = Math.max(...values) * 1.08;
  const min = Math.min(0, ...values);
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(values.length - 1, 1);
  const y = (v) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${x(values.length - 1)},${H - padB} L${padL},${H - padB} Z`;

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = min + ((max - min) * i) / ticks;
    const yy = y(v);
    return `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>
            <text class="axis-label" x="${padL - 8}" y="${yy + 3}" text-anchor="end">${esc(fmt(v))}</text>`;
  }).join('');

  const step = Math.ceil(labels.length / 8) || 1;
  const xLabels = labels.map((l, i) =>
    i % step === 0 ? `<text class="axis-label" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : ''
  ).join('');

  const last = pts[pts.length - 1];

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend chart">
    <defs>
      <linearGradient id="grad-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}${xLabels}
    <path d="${area}" fill="url(#grad-${id})"/>
    <path class="line" d="${line}"/>
    <circle class="dot" cx="${last[0]}" cy="${last[1]}" r="4"/>
  </svg>`;
}

/**
 * Vertical bar chart. Pass `highlight` to tint one bar with the accent.
 */
export function barChart(values, { labels = [], height = 180, fmt = moneyShort, highlight = -1, color = 'var(--brand)' } = {}) {
  const W = 720, H = height, padL = 46, padR = 8, padT = 12, padB = 22;
  const max = Math.max(...values, 1) * 1.1;
  const innerW = W - padL - padR;
  const slot = innerW / values.length;
  const bw = Math.min(slot * 0.62, 42);
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);

  const grid = Array.from({ length: 5 }, (_, i) => {
    const v = (max * i) / 4;
    const yy = y(v);
    return `<line class="grid-line" x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}"/>
            <text class="axis-label" x="${padL - 8}" y="${yy + 3}" text-anchor="end">${esc(fmt(v))}</text>`;
  }).join('');

  const bars = values.map((v, i) => {
    const cx = padL + slot * i + slot / 2;
    const h = Math.max(H - padB - y(v), 1.5);
    const fill = i === highlight ? 'var(--accent)' : color;
    return `<rect x="${cx - bw / 2}" y="${y(v)}" width="${bw}" height="${h}" rx="4" fill="${fill}">
      <title>${esc(labels[i] || '')}: ${esc(fmt(v))}</title></rect>`;
  }).join('');

  const step = Math.ceil(values.length / 12) || 1;
  const xLabels = labels.map((l, i) =>
    i % step === 0 ? `<text class="axis-label" x="${padL + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>` : ''
  ).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bar chart">${grid}${bars}${xLabels}</svg>`;
}

/** Horizontal ranked bars — for top items, categories, channels. */
export function rankedBars(rows, { fmt = moneyShort, max = null } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return `<div class="stack gap-3">${rows.map((r, i) => `
    <div class="meter-row">
      <span class="t-sm truncate">${esc(r.label)}</span>
      <span class="t-sm fw-semibold num">${esc(fmt(r.value))}</span>
      <span class="meter-bar"><span style="width:${(r.value / top) * 100}%;background:${r.color || seriesColor(i)}"></span></span>
    </div>`).join('')}</div>`;
}

/** Donut / ring chart with a centred label. */
export function donut(rows, { size = 168, thickness = 22, centerLabel = '', centerSub = '' } = {}) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = rows.map((row, i) => {
    const frac = row.value / total;
    const dash = `${frac * c} ${c - frac * c}`;
    const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${row.color || seriesColor(i)}"
      stroke-width="${thickness}" stroke-dasharray="${dash}" stroke-dashoffset="${-offset * c}">
      <title>${esc(row.label)}: ${(frac * 100).toFixed(1)}%</title></circle>`;
    offset += frac;
    return seg;
  }).join('');

  return `<div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0">
    <svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Share chart">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--bg-inset)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>
    <div style="position:absolute;inset:0;display:grid;place-content:center;text-align:center">
      <div class="display" style="font-size:var(--text-xl)">${esc(centerLabel)}</div>
      <div class="t-2xs faint">${esc(centerSub)}</div>
    </div>
  </div>`;
}

/** Inline sparkline that inherits colour from its parent. */
export function sparkline(values, { height = 32, fill = true } = {}) {
  const W = 120, H = height;
  const max = Math.max(...values), min = Math.min(...values);
  const x = (i) => (i * W) / Math.max(values.length - 1, 1);
  const y = (v) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const d = smoothPath(pts);
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<path class="fill" d="${d} L${W},${H} L0,${H} Z"/>` : ''}
    <path d="${d}"/>
  </svg>`;
}

/** Legend rows that pair with donut()/rankedBars(). */
export function legend(rows, { fmt = moneyShort } = {}) {
  return `<div class="stack gap-2 grow">${rows.map((r, i) => `
    <div class="row gap-3">
      <span class="legend-swatch" style="background:${r.color || seriesColor(i)}"></span>
      <span class="t-sm grow truncate">${esc(r.label)}</span>
      <span class="t-sm fw-semibold num">${esc(fmt(r.value))}</span>
    </div>`).join('')}</div>`;
}
