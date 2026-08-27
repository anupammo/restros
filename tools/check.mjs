/**
 * RestrOS prototype sanity checks.
 *   node tools/check.mjs
 *
 * 1. Parses every JS module (ESM) and reports syntax errors.
 * 2. Parses every JSON data file.
 * 3. Verifies every <link>/<script>/<use href> path in the HTML resolves.
 * 4. Verifies every icon referenced by name exists in the sprite.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(process.cwd());
const PROTO = join(ROOT, 'prototype');
let errors = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); errors++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(PROTO);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

/* ---------------------------------------------------------------- 1. JS --- */
console.log('\nJavaScript modules');
for (const f of files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))) {
  try {
    new vm.SourceTextModule(readFileSync(f, 'utf8'), { identifier: f });
    ok(rel(f));
  } catch (err) {
    fail(`${rel(f)} — ${err.message}`);
  }
}

/* -------------------------------------------------------------- 2. JSON --- */
console.log('\nJSON data');
for (const f of files.filter((f) => f.endsWith('.json'))) {
  try { JSON.parse(readFileSync(f, 'utf8')); ok(rel(f)); }
  catch (err) { fail(`${rel(f)} — ${err.message}`); }
}

/* -------------------------------------------------------------- 3. HTML --- */
console.log('\nHTML asset references');
const sprite = readFileSync(join(PROTO, 'assets/icons/sprite.svg'), 'utf8');
const spriteIds = new Set([...sprite.matchAll(/id="(i-[a-z0-9-]+)"/g)].map((m) => m[1]));

const htmlFiles = files.filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
  const src = readFileSync(f, 'utf8');
  const dir = dirname(f);
  const refs = [
    ...[...src.matchAll(/<link[^>]+href="([^"#]+\.css)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((m) => m[1]),
  ];
  for (const r of refs) {
    if (/^(https?:)?\/\//.test(r) || r.startsWith('data:')) continue;
    if (!existsSync(resolve(dir, r))) fail(`${rel(f)} → missing ${r}`);
  }
  for (const m of src.matchAll(/sprite\.svg#(i-[a-z0-9-]+)/g)) {
    if (!spriteIds.has(m[1])) fail(`${rel(f)} → unknown icon #${m[1]}`);
  }
  ok(`${rel(f)} (${refs.length} refs)`);
}

/* ------------------------------------------------------- 4. JS icon names -- */
console.log('\nIcon names used from JS');
const used = new Set();
for (const f of files.filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bicon\(\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/icon:\s*'([a-z0-9-]+)'/g)) used.add(m[1]);
}
const missing = [...used].filter((n) => !spriteIds.has(`i-${n}`));
if (missing.length) fail(`missing from sprite: ${missing.join(', ')}`);
else ok(`${used.size} icon names all present (${spriteIds.size} in sprite)`);

/* -------------------------------------------------------------- summary --- */
console.log(`\n${errors ? `${errors} problem(s) found` : 'All checks passed'}\n`);
process.exit(errors ? 1 : 0);
