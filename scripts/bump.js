#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-BUMP), bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8 S5
// ISSUE: a precached file edited by hand is served STALE, with no error, unless three other edits are made too:
//        its `?v=N` in every page that loads it, and `CACHE_VERSION` in that page's service worker. Doing that by
//        hand is the commonest way a by-hand fix "doesn't work" (MODELLER_MASTER: "check the service-worker
//        CACHE_VERSION and whether the file is precached").
// WHAT:  for each file given, find every tracked .html whose src=/href= resolves to it and add 1 to its ?v=N;
//        also each `'<path>?v=N'` in a .js loader's lazy list (viewer/main.js modules[]) — and then the changed loader's
//        own ?v= (it is precached); add 1 to CACHE_VERSION of each sw.js involved (once per sw). Lazy loading is kept as
//        is: a not-precached file gets a NOTE (normal for lazy modules), never an edit to PRECACHE_ASSETS.
//        DRY RUN by default — prints what it would change. --write applies. Touches nothing else.
// USE:   node scripts/bump.js viewer/still_fault.js            (dry run)
//        node scripts/bump.js viewer/still_fault.js --write    (apply; then run tests/audit_sw_precache.js)
//        --root DIR   operate on another tree (the witness uses a temp copy)
// EXIT:  0 ok · 2 a file does not exist or no page loads it (nothing written) · 1 bad usage
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const ri = argv.indexOf('--root');
const ROOT = path.resolve(ri >= 0 ? argv[ri + 1] : path.join(__dirname, '..'));
const targets = argv.filter((a, i) => !a.startsWith('--') && !(ri >= 0 && i === ri + 1));
if (!targets.length) { console.error('usage: node scripts/bump.js <file…> [--write] [--root DIR]'); process.exit(1); }

function listFiles(ext) {
  try {
    return cp.execSync(`git ls-files "*${ext}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().split('\n').filter(Boolean);
  } catch (e) {   // not a git tree (temp copy): walk it
    const out = [];
    (function w(d) {
      for (const n of fs.readdirSync(path.join(ROOT, d))) {
        if (n === 'node_modules' || n === '.git') continue;
        const r = d ? d + '/' + n : n; const st = fs.statSync(path.join(ROOT, r));
        if (st.isDirectory()) w(r); else if (r.endsWith(ext)) out.push(r);
      }
    })('');
    return out;
  }
}
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

const want = new Set();
for (const t of targets) {
  const abs = path.resolve(ROOT, t);
  if (!fs.existsSync(abs)) { console.log(`§BUMP_ERR missing=${t} written=0`); process.exit(2); }
  want.add(rel(abs));
}

const edits = new Map();          // file -> new text
const hits = new Map([...want].map(w => [w, 0]));
const swBump = new Map();         // sw path -> [files whose change needs it]
const text = f => (edits.has(f) ? edits.get(f) : fs.readFileSync(path.join(ROOT, f), 'utf8'));
function swFor(f, besideOnly) {   // a page uses the sw beside it; a .js loader the nearest sw.js above it
  let d = path.posix.dirname(f);
  for (;;) {
    const sw = path.posix.join(d === '.' ? '' : d, 'sw.js');
    if (fs.existsSync(path.join(ROOT, sw))) return sw;
    if (besideOnly || d === '.' || d === '') return null;
    d = path.posix.dirname(d);
  }
}
function needSw(f, besideOnly) {
  const sw = swFor(f, besideOnly);
  if (sw) { if (!swBump.has(sw)) swBump.set(sw, []); swBump.get(sw).push(f); }
  else console.log(`§BUMP_NOTE file=${f} has no sw.js for it (no cache to bump)`);
}
// LAZY LOADING IS KEPT AS IS (bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §14 N2): a lazy module's ?v= lives in a
// .js loader's string list (viewer/main.js modules[]: 'nf_room.js?v=1'), not in a page. Those literals are bumped too —
// resolved from the loader's own folder, exact path only — and nothing is ever added to PRECACHE_ASSETS.
const pages = listFiles('.html').filter(h => !/\/lib\//.test(h));
const loaders = listFiles('.js').filter(f => !/^scripts\/|\/(lib|node_modules|tests)\/|\.min\.js$|witness|(^|\/)sw\.js$/.test(f));   // scripts/ = tooling, never loaded by a page
const PAGE_REF = /((?:src|href)\s*=\s*")([^"?#]+)\?v=(\d+)(")/g;
const JS_REF = /((['"]))([^'"\s?#]+\.(?:js|css|json|wasm))\?v=(\d+)(\2)/g;
let queue = [...want]; const done = new Set();
for (let depth = 0; queue.length && depth < 4; depth++) {
  const round = new Set(queue.filter(q => !done.has(q))); queue = [];
  round.forEach(q => done.add(q));
  if (!round.size) break;
  for (const h of pages) {
    let changed = false;
    const out = text(h).replace(PAGE_REF, (m, a, p, n, z) => {
      if (/^[a-z]+:|^\/\//i.test(p)) return m;
      const r = rel(path.resolve(ROOT, path.dirname(h), p));
      if (!round.has(r)) return m;
      if (hits.has(r)) hits.set(r, hits.get(r) + 1); changed = true;
      console.log(`§BUMP page=${h} ref=${p} v=${n}->${+n + 1}`);
      return a + p + '?v=' + (+n + 1) + z;
    });
    if (changed) { edits.set(h, out); needSw(h, true); }
  }
  for (const f of loaders) {
    if (round.has(f)) continue;   // a file never bumps a reference to itself
    let changed = false;
    const out = text(f).replace(JS_REF, (m, a, q, p, n, z) => {
      if (/^[a-z]+:|^\/\//i.test(p)) return m;
      const r = rel(path.resolve(ROOT, path.dirname(f), p));
      if (!round.has(r)) return m;
      if (hits.has(r)) hits.set(r, hits.get(r) + 1); changed = true;
      console.log(`§BUMP loader=${f} ref=${p} v=${n}->${+n + 1} (lazy load list)`);
      return a + p + '?v=' + (+n + 1) + z;
    });
    if (changed) {
      edits.set(f, out); needSw(f, false);
      queue.push(f);   // the loader itself changed: its own ?v= must go up too (it is precached, e.g. viewer/main.js)
    }
  }
}
for (const [w, n] of hits) if (!n) { console.log(`§BUMP_ERR not_loaded_by_any_page_or_loader=${w} written=0`); process.exit(2); }

for (const [sw, why] of swBump) {
  const src = text(sw);
  const m = /(const CACHE_VERSION\s*=\s*'v)(\d+)(')/.exec(src);
  if (!m) { console.log(`§BUMP_WARN sw=${sw} CACHE_VERSION not found — bump it by hand`); continue; }
  edits.set(sw, src.slice(0, m.index) + m[1] + (+m[2] + 1) + m[3] + src.slice(m.index + m[0].length));
  console.log(`§BUMP sw=${sw} CACHE_VERSION v${m[2]}->v${+m[2] + 1} (for: ${[...new Set(why)].join(', ')})`);
  const swDir = path.posix.dirname(sw);
  for (const w of want) {
    const inSw = path.posix.relative(swDir, w);
    if (!inSw.startsWith('..') && !src.includes(`'${inSw}'`) && !src.includes(`"${inSw}"`))
      console.log(`§BUMP_NOTE not_precached file=${w} sw=${sw} — normal for a lazy module (viewer/sw.js v1078 note: network-first online); add it to PRECACHE_ASSETS only if it must work offline`);
  }
}

for (const w of want) {   // mentions the exact-path rule could not resolve (e.g. a page-relative path in a sub-folder loader)
  const needle = path.posix.basename(w) + '?v=';
  for (const f of loaders) if (!edits.has(f) && text(f).includes(needle)) console.log(`§BUMP_CHECK_BY_HAND loader=${f} mentions ${needle} (not changed: path did not resolve to ${w})`);
}

if (WRITE) for (const [f, t] of edits) fs.writeFileSync(path.join(ROOT, f), t);
console.log(`§BUMP_DONE targets=${want.size} pages=${[...edits.keys()].filter(f => f.endsWith('.html')).length} loaders=${[...edits.keys()].filter(f => f.endsWith('.js') && !/(^|\/)sw\.js$/.test(f)).length} sw=${swBump.size} mode=${WRITE ? 'write' : 'dry-run'} written=${WRITE ? edits.size : 0}`);
if (!WRITE) console.log('dry run — nothing written. Add --write to apply, then run: node tests/audit_sw_precache.js');
