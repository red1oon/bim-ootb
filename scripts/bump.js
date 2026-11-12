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
//        add 1 to CACHE_VERSION of the sw.js in the folder of each changed page (once per sw); warn if the file is
//        not in that sw's PRECACHE_ASSETS; list `<name>?v=` mentions inside .js loaders as "check by hand".
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

const pages = listFiles('.html').filter(h => !/\/lib\//.test(h));
const edits = new Map();          // file -> new text
const hits = new Map([...want].map(w => [w, 0]));
const swBump = new Map();         // sw path -> [pages]
const REF = /((?:src|href)\s*=\s*")([^"?#]+)\?v=(\d+)(")/g;
for (const h of pages) {
  const src = fs.readFileSync(path.join(ROOT, h), 'utf8'); let changed = false;
  const out = src.replace(REF, (m, a, p, n, z) => {
    if (/^[a-z]+:|^\/\//i.test(p)) return m;
    const r = rel(path.resolve(ROOT, path.dirname(h), p));
    if (!want.has(r)) return m;
    hits.set(r, hits.get(r) + 1); changed = true;
    console.log(`§BUMP page=${h} ref=${p} v=${n}->${+n + 1}`);
    return a + p + '?v=' + (+n + 1) + z;
  });
  if (changed) {
    edits.set(h, out);
    const sw = path.posix.join(path.posix.dirname(h), 'sw.js');
    if (fs.existsSync(path.join(ROOT, sw))) { if (!swBump.has(sw)) swBump.set(sw, []); swBump.get(sw).push(h); }
    else console.log(`§BUMP_NOTE page=${h} has no sw.js beside it (no cache to bump)`);
  }
}
for (const [w, n] of hits) if (!n) { console.log(`§BUMP_ERR not_loaded_by_any_page=${w} written=0`); process.exit(2); }

for (const [sw, pg] of swBump) {
  const src = fs.readFileSync(path.join(ROOT, sw), 'utf8');
  const m = /(const CACHE_VERSION\s*=\s*'v)(\d+)(')/.exec(src);
  if (!m) { console.log(`§BUMP_WARN sw=${sw} CACHE_VERSION not found — bump it by hand`); continue; }
  edits.set(sw, src.slice(0, m.index) + m[1] + (+m[2] + 1) + m[3] + src.slice(m.index + m[0].length));
  console.log(`§BUMP sw=${sw} CACHE_VERSION v${m[2]}->v${+m[2] + 1} (pages: ${pg.join(', ')})`);
  const swDir = path.posix.dirname(sw);
  for (const w of want) {
    const inSw = path.posix.relative(swDir, w);
    if (!src.includes(`'${inSw}'`) && !src.includes(`"${inSw}"`)) console.log(`§BUMP_WARN not_precached file=${w} sw=${sw} (offline users will not get it)`);
  }
}

const loaders = listFiles('.js').filter(f => !/\/(lib|node_modules|tests)\/|\.min\.js$|witness|(^|\/)sw\.js$/.test(f));
for (const w of want) {
  const needle = path.posix.basename(w) + '?v=';
  for (const f of loaders) if (fs.readFileSync(path.join(ROOT, f), 'utf8').includes(needle)) console.log(`§BUMP_CHECK_BY_HAND loader=${f} mentions ${needle} (not changed)`);
}

if (WRITE) for (const [f, t] of edits) fs.writeFileSync(path.join(ROOT, f), t);
console.log(`§BUMP_DONE targets=${want.size} pages=${[...edits.keys()].filter(f => f.endsWith('.html')).length} sw=${swBump.size} mode=${WRITE ? 'write' : 'dry-run'} written=${WRITE ? edits.size : 0}`);
if (!WRITE) console.log('dry run — nothing written. Add --write to apply, then run: node tests/audit_sw_precache.js');
