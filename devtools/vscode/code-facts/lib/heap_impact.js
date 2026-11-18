#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Code Facts — "Memory of the three pages": the browser heap each app page holds after boot, working tree vs a git ref.
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.31 (decisions F-20 code only, F-21 button only, F-22 Code Facts panel + PR body).
// Pure node, no `vscode` import. Also a CLI:  node devtools/vscode/code-facts/lib/heap_impact.js <bim-ootb root> [ref] [--runs N] [--pages a,b]
// Dev side only: nothing here reaches the browser of a user. It never installs a browser (lib/find_browser.js) and never edits the tree.
//
// How the two trees are served, so the delta is the CODE's (F-20):
//   work = the files on disk (plus an in-memory `overlay`, used only by the witness).
//   base = the same, except files whose tracked content differs from <ref>: those answer their <ref> bytes (`git show`), and a new
//          untracked, not-ignored file (new code) answers 404. Ignored files (building data: .db, .bin) are the same bytes on both sides.
// Per page and tree, `runs` fresh contexts (service worker blocked, software GL): load, network idle (60 s cap), 3 s settle,
// HeapProfiler.collectGarbage, then Performance.getMetrics JSHeapUsedSize. The median is reported; noise = the larger spread + 0.2 MB.
// Prints  §HEAP_IMPACT page= tree= jsMB= spreadMB= scriptKB= requests= loadMs=  and  §HEAP_IMPACT_DELTA page= jsMB= scriptKB= noiseMB= verdict=
// verdict SAME|GREW|SHRANK, or INCONCLUSIVE (no browser, or a page did not load). No budget is applied (F-2 sets budgets after 2026-11-30).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), cp = require('child_process');
const { findBrowser } = require('./find_browser');

const DEFAULT_PAGES = ['viewer/viewer.html', 'erp/idempiere.html', 'modeller/modeller.html'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const MB = 1048576;

function git(root, args) {
  const r = cp.spawnSync('git', args, { cwd: root, maxBuffer: 1 << 28, timeout: 60000 });
  return { ok: r.status === 0, out: r.stdout || Buffer.alloc(0) };
}
const lines = buf => String(buf).split('\n').map(s => s.trim()).filter(Boolean);

// The base tree as a lookup: path -> Buffer (its ref bytes), null (404), or undefined (same as disk).
function baseView(root, ref) {
  const changed = new Set(lines(git(root, ['diff', '--name-only', '--no-renames', ref]).out));
  const added = new Set(lines(git(root, ['ls-files', '--others', '--exclude-standard']).out));
  const cache = new Map();
  return {
    changed: changed.size, added: added.size,
    lookup(rel) {
      if (added.has(rel)) return null;
      if (!changed.has(rel)) return undefined;
      if (!cache.has(rel)) { const r = git(root, ['show', ref + ':' + rel]); cache.set(rel, r.ok ? r.out : null); }
      return cache.get(rel);
    }
  };
}

// One static server. view(rel) -> Buffer | null (404) | undefined (read the disk).
function serve(root, view) {
  return new Promise(resolve => {
    const srv = http.createServer((q, res) => {
      const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '');
      const send = b => { res.writeHead(200, { 'Content-Type': MIME[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b); };
      const v = view ? view(rel) : undefined;
      if (v === null) { res.writeHead(404); return res.end(); }
      if (v !== undefined) return send(v);
      const f = path.join(root, rel);
      if (!f.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } send(b); });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function measurePage(browser, port, page) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const pg = await ctx.newPage(), cdp = await ctx.newCDPSession(pg);
    await cdp.send('Performance.enable');
    const got = { requests: 0, scriptBytes: 0 }, pending = [];
    pg.on('response', res => {
      got.requests++;
      if (res.request().resourceType() === 'script') pending.push(res.body().then(b => { got.scriptBytes += b.length; }, () => {}));
    });
    const t0 = Date.now();
    const resp = await pg.goto('http://127.0.0.1:' + port + '/' + page, { waitUntil: 'load', timeout: 90000 });
    const loadMs = Date.now() - t0;
    if (!resp || !resp.ok()) return { ok: false, reason: 'HTTP ' + (resp ? resp.status() : 'none') };
    await pg.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await pg.waitForTimeout(3000);
    await Promise.all(pending);
    await cdp.send('HeapProfiler.collectGarbage');
    const m = {};
    for (const x of (await cdp.send('Performance.getMetrics')).metrics) m[x.name] = x.value;
    return { ok: true, jsMB: m.JSHeapUsedSize / MB, scriptKB: got.scriptBytes / 1024, requests: got.requests, loadMs };
  } catch (e) {
    return { ok: false, reason: String(e.message).split('\n')[0].slice(0, 120) };
  } finally { await ctx.close(); }
}

const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const fx = (n, d) => (n >= 0 ? '+' : '') + n.toFixed(d);

// measure({ root, ref, pages, runs, overlay, findOpts, log }) -> { verdict, lines, pages: [{page, work, base, delta}] }
async function measure(o) {
  const root = path.resolve(o.root), ref = o.ref || 'origin/main', pages = o.pages || DEFAULT_PAGES, runs = o.runs || 3;
  const out = [], say = l => { out.push(l); if (o.log) o.log(l); };
  const found = findBrowser(root, o.findOpts);
  if (!found) {
    say('§HEAP_IMPACT verdict=INCONCLUSIVE reason="no headless browser: run npm install in tests/ once, or set PLAYWRIGHT to a playwright package"');
    return { verdict: 'INCONCLUSIVE', lines: out, pages: [] };
  }
  const base = baseView(root, ref), overlay = o.overlay || {};
  say('§HEAP_IMPACT start root=' + root + ' ref=' + ref + ' changed=' + base.changed + ' added=' + base.added + ' runs=' + runs + ' browser=' + found.from);
  const work = await serve(root, rel => (rel in overlay ? Buffer.from(overlay[rel]) : undefined));
  const baseSrv = await serve(root, rel => base.lookup(rel));
  const browser = await found.chromium.launch({ args: ['--disable-gpu', '--use-gl=swiftshader', '--enable-precise-memory-info'] });
  const result = [];
  let verdict = 'MEASURED';
  try {
    for (const page of pages) {
      const row = { page };
      for (const [tree, srv] of [['work', work], [ref, baseSrv]]) {
        const rs = [];
        for (let i = 0; i < runs; i++) rs.push(await measurePage(browser, srv.address().port, page));
        const bad = rs.find(r => !r.ok);
        if (bad) { row[tree === 'work' ? 'work' : 'base'] = { ok: false, reason: bad.reason }; say('§HEAP_IMPACT page=' + page + ' tree=' + tree + ' verdict=INCONCLUSIVE reason=' + JSON.stringify(bad.reason)); continue; }
        const js = rs.map(r => r.jsMB);
        const s = { ok: true, jsMB: median(js), spreadMB: Math.max.apply(null, js) - Math.min.apply(null, js), scriptKB: median(rs.map(r => r.scriptKB)), requests: median(rs.map(r => r.requests)), loadMs: median(rs.map(r => r.loadMs)) };
        row[tree === 'work' ? 'work' : 'base'] = s;
        say('§HEAP_IMPACT page=' + page + ' tree=' + tree + ' jsMB=' + s.jsMB.toFixed(1) + ' spreadMB=' + s.spreadMB.toFixed(1) + ' scriptKB=' + Math.round(s.scriptKB) + ' requests=' + s.requests + ' loadMs=' + s.loadMs);
      }
      if (row.work && row.work.ok && row.base && row.base.ok) {
        const d = row.work.jsMB - row.base.jsMB, noise = Math.max(row.work.spreadMB, row.base.spreadMB) + 0.2;
        row.delta = { jsMB: d, scriptKB: row.work.scriptKB - row.base.scriptKB, noiseMB: noise, verdict: Math.abs(d) <= noise ? 'SAME' : d > 0 ? 'GREW' : 'SHRANK' };
      } else { row.delta = { verdict: 'INCONCLUSIVE' }; verdict = 'INCONCLUSIVE'; }
      const dl = row.delta;
      say('§HEAP_IMPACT_DELTA page=' + page + (dl.jsMB === undefined ? '' : ' jsMB=' + fx(dl.jsMB, 1) + ' scriptKB=' + fx(dl.scriptKB, 0) + ' noiseMB=' + dl.noiseMB.toFixed(1)) + ' verdict=' + dl.verdict);
      result.push(row);
    }
  } finally { await browser.close(); work.close(); baseSrv.close(); }
  say('§HEAP_IMPACT done pages=' + result.length + ' verdict=' + verdict + ' (median of ' + runs + ' runs; JS heap after a forced GC; no budget applied, F-2)');
  return { verdict, lines: out, pages: result };
}

// "MB V 18.3 · E 4.2 · M 10.9" for the status bar; a delta beside a page that is not SAME.
function statusText(res) {
  if (!res || !res.pages.length) return null;
  return 'MB ' + res.pages.map(r => {
    const k = r.page.split('/')[0].charAt(0).toUpperCase();
    if (!r.work || !r.work.ok) return k + ' ?';
    return k + ' ' + r.work.jsMB.toFixed(1) + (r.delta && (r.delta.verdict === 'GREW' || r.delta.verdict === 'SHRANK') ? ' (' + fx(r.delta.jsMB, 1) + ')' : '');
  }).join(' · ');
}

module.exports = { measure, baseView, serve, statusText, DEFAULT_PAGES };

if (require.main === module) {
  const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : null; };
  const runs = +opt('--runs') || 3, pages = opt('--pages');
  const [root, ref] = a;
  if (!root) { console.log('usage: node heap_impact.js <bim-ootb root> [ref] [--runs N] [--pages a,b]'); process.exit(1); }
  measure({ root, ref, runs, pages: pages ? pages.split(',') : null, log: l => console.log(l) })
    .then(r => { if (r.verdict === 'INCONCLUSIVE') process.exitCode = 2; })
    .catch(e => { console.log('§HEAP_IMPACT verdict=INCONCLUSIVE reason=' + JSON.stringify(String(e.message).split('\n')[0])); process.exitCode = 2; });
}
