// SPDX-License-Identifier: MIT
// X0 Navigator — "what will this cost if deployed", first version (static bytes only).
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12a · issue #2943. Pure node, no `vscode` import.
//
// For every top-level folder that has a service worker (sw.js):
//   offline-cache bytes = the files named by string literals in its PRECACHE_ASSETS
//   start-up bytes      = the local files loaded by <script src> in the .html pages that list names
//                         (all of the app's pages together: one user opens one page, so this is the upper bound)
// measured for the working tree and for a git ref, then compared. Raw bytes, not minified. No budgets, no browser.
// This module holds no list of apps or pages: both come from the files themselves.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const J = require('./js_facts');

const norm = p => path.posix.normalize(p.split(path.sep).join('/'));
const clean = u => u.split('?')[0].split('#')[0];
const isLocal = u => !/^([a-z]+:)?\/\//i.test(u) && !u.startsWith('data:');

/** Reads the working tree. */
function fsReader(root) {
  return {
    label: 'working tree',
    dirs() { return fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules').map(e => e.name).sort(); },
    size(rel) { try { const st = fs.statSync(path.join(root, rel)); return st.isFile() ? st.size : null; } catch (e) { return null; } },
    read(rel) { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { return null; } }
  };
}
/** Reads a commit, without checking it out: one `git ls-tree` for every size, `git show` for the few files that are parsed. */
function gitReader(root, ref) {
  const out = cp.execFileSync('git', ['ls-tree', '-r', '-l', ref], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const sizes = new Map();
  for (const l of out.split('\n')) { const m = /^\S+ blob \S+\s+(\d+)\t(.+)$/.exec(l); if (m) sizes.set(m[2], Number(m[1])); }
  return {
    label: ref,
    dirs() { return Array.from(new Set(Array.from(sizes.keys()).filter(k => k.includes('/')).map(k => k.split('/')[0]))).filter(d => !d.startsWith('.')).sort(); },
    size(rel) { return sizes.has(rel) ? sizes.get(rel) : null; },
    read(rel) { if (!sizes.has(rel)) return null; try { return cp.execFileSync('git', ['show', ref + ':' + rel], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { return null; } }
  };
}

/**
 * @returns {{apps: Object<string, object>, parser: boolean}}
 *   apps[name] = { boot: Map<rel, bytes>, precache: Map<rel, bytes>, pages: string[], nonliteral: number, missing: number }
 */
function measure(root, reader) {
  const ts = J.loadTs(root);
  if (!ts) return { apps: {}, parser: false };
  const apps = {};
  for (const dir of reader.dirs()) {
    const sw = reader.read(dir + '/sw.js');
    if (sw === null) continue;
    const list = J.stringArray(ts, sw, 'PRECACHE_ASSETS');
    if (!list) continue;
    const precache = new Map(), boot = new Map(), pages = [];
    let missing = 0;
    for (const item of list.items) {
      if (!isLocal(item)) continue;
      const rel = norm(path.posix.join(dir, clean(item)));
      const size = reader.size(rel);
      if (size === null) { missing++; continue; }
      precache.set(rel, size);
      if (rel.endsWith('.html')) pages.push(rel);
    }
    for (const page of pages) {
      const html = reader.read(page) || '';
      const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;      // an HTML attribute, not JavaScript
      let m;
      while ((m = re.exec(html))) {
        if (!isLocal(m[1])) continue;
        const rel = norm(path.posix.join(path.posix.dirname(page), clean(m[1])));
        const size = reader.size(rel);
        if (size !== null) boot.set(rel, size);
      }
    }
    apps[dir] = { boot, precache, pages, nonliteral: list.nonliteral, missing };
  }
  return { apps, parser: true };
}
const sum = m => Array.from(m.values()).reduce((a, b) => a + b, 0);

/** Compare `now` against `base`. One row per app. */
function compare(now, base) {
  const rows = [];
  for (const name of Object.keys(now.apps).sort()) {
    const a = now.apps[name], b = base.apps[name] || { boot: new Map(), precache: new Map() };
    const movedToBoot = Array.from(a.boot.keys()).filter(f => !b.boot.has(f) && b.precache.has(f));
    const newBoot = Array.from(a.boot.keys()).filter(f => !b.boot.has(f) && !b.precache.has(f));
    rows.push({ app: name, bootFiles: a.boot.size, bootBytes: sum(a.boot), bootDelta: sum(a.boot) - sum(b.boot),
      precacheFiles: a.precache.size, precacheBytes: sum(a.precache), precacheDelta: sum(a.precache) - sum(b.precache),
      movedToBoot, newBoot, nonliteral: a.nonliteral, missing: a.missing, pages: a.pages.length });
  }
  return rows;
}
const signed = n => (n > 0 ? '+' : '') + n;
function formatRow(r, vs) {
  return '§DEPLOY_COST app=' + r.app + ' boot_files=' + r.bootFiles + ' boot_bytes=' + r.bootBytes + ' boot_delta=' + signed(r.bootDelta)
    + ' precache_files=' + r.precacheFiles + ' precache_bytes=' + r.precacheBytes + ' precache_delta=' + signed(r.precacheDelta)
    + ' pages=' + r.pages + ' moved_to_boot=' + r.movedToBoot.length + ' new_boot=' + r.newBoot.length + ' not_plain_strings=' + r.nonliteral + ' vs=' + vs;
}
/** How one file is loaded, from a measure() result: [{app, how: 'start-up'|'offline cache', bytes}] (empty = not loaded at start). */
function fileClass(result, rel) {
  const out = [];
  for (const name of Object.keys(result.apps)) {
    const a = result.apps[name];
    if (a.boot.has(rel)) out.push({ app: name, how: 'start-up', bytes: a.boot.get(rel) });
    else if (a.precache.has(rel)) out.push({ app: name, how: 'offline cache', bytes: a.precache.get(rel) });
  }
  return out;
}
const kb = n => (n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 102400 ? 1 : 0) + ' KB');

module.exports = { fsReader, gitReader, measure, compare, formatRow, fileClass, kb, sum };
