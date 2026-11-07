#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-WALKED-EXPORT-DB. SCOPE: bim-compiler prompts/MODELLER_MASTER.md §RESUME 2026-11-07 G2. Read the log after EVERY run; exit code alone is not evidence.
// ISSUE IT EXPOSES: "the IFC write-back exists" was built, never run on an imported ARC+STR file (witness_walked_export.js is
// INCONCLUSIVE when its marked shed set is absent). Does a real page walk reach the .ifc file, class by class, on ANY .db?
// Chain: open a local .db -> export IFC (PRE, the falsifier) -> Walk ALL Services -> export IFC (POST) -> count entities IN THE FILE TEXT.
// Claims: Y1 each walked class in the op-log has that many entities in POST (file text, not the writer's own counter)
//         Y2 PRE has fewer of them, so the count can fail; Y3 POST parses back; Y4 no page errors. Nothing walked = INCONCLUSIVE, never PASS.
// Usage: WALK_DB=<db> [WALK_IFC_OUT=<file>] node witness_walked_export_db.js   (software GL only: no GPU, no bake).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), SHARED = path.join(process.env.HOME, 'bim-ootb');
const DB = process.env.WALK_DB || path.join(SHARED, 'buildings', 'Duplex_extracted.db');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const TAG = '§W-EXPORT-DB';

(async () => {
  if (!fs.existsSync(DB)) { console.log(TAG + ' INCONCLUSIVE db absent, nothing judged'); process.exit(0); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wexpdb-')), local = path.join(tmp, path.basename(DB)); fs.copyFileSync(DB, local);   // source DB never written
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]), a = path.join(ROOT, p), b = path.join(SHARED, p);   // gitignored data lives only in the shared checkout
    const f = fs.existsSync(a) ? a : b; fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 3600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=8192'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 720 }); const errs = [];
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 300)); console.log('§PAGEERR ' + String(e).slice(0, 300)); });
  const conF = process.env.WALK_CONSOLE ? fs.openSync(process.env.WALK_CONSOLE, 'w') : null;   // the whole console, the § lines below are only a digest
  pg.on('console', m => { if (conF != null) fs.writeSync(conF, m.text().slice(0, 2000) + '\n'); });
  pg.on('console', m => { const t = m.text(); if (/§(WALK|DISC-WALK|DISCWALK-ALL|WALKALL|DW-LOD400|DW-RULES-MESH|DW-SCHED|DW-SPACE-TYPE|RW_INIT|IFC-SEED|IFC-SPATIAL|STRWALK-OPEN)/.test(t)) console.log('  [con] ' + t.slice(0, 900)); });
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction('window.__sceneReady===true && window.Bonsai && window.Bonsai.ifc && typeof window.discWalkAll==="function"', { timeout: 180000 });
  // The rules' mesh source stays the real one (object storage). Serving a stale local copy resolved 0 hashes and read as a product refusal: an instrument defect, seen 2026-11-07.
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
  const [fc] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await fc.accept([local]);
  // Heartbeat: a stall here must say where it stalled. Polls on a timer: rAF polling starves under software GL.
  const beat = setInterval(() => { pg.evaluate(() => ({ buf: !!window.__dwBuf, seedPromise: !!window.__arcSeedReady, ops: window.Bonsai && window.Bonsai.oplog ? window.Bonsai.oplog.length : -1, meshes: window.Bonsai && window.Bonsai.group ? window.Bonsai.group().children.length : -1, stat: (document.getElementById('status') || document.getElementById('stat') || {}).textContent, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) })).then(h => console.log(TAG + ' beat ' + JSON.stringify(h))).catch(() => {}); }, 60000);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 2400000, polling: 2000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(4000);
  const census = (label, doSave) => pg.evaluate(async (label, doSave) => {
    const t0 = performance.now(), built = await window.Bonsai.ifc.build(), byEnt = {}, td = new TextDecoder('latin1');
    // A walked file passes the 512 MB string limit, so count by line-bounded chunks, never one string.
    for (let at = 0; at < built.bytes.length;) {
      let end = Math.min(at + 33554432, built.bytes.length);
      while (end < built.bytes.length && built.bytes[end - 1] !== 10) end++;
      for (const m of td.decode(built.bytes.subarray(at, end)).matchAll(/=\s*(IFC[A-Z0-9]+)\(/g)) byEnt[m[1]] = (byEnt[m[1]] || 0) + 1;
      at = end;
    }
    let back = null; try { back = await window.Bonsai.ifc.reimport(built.bytes); } catch (e) { back = { error: String(e) }; }
    if (doSave) { window.__ifcBytes = built.bytes; }
    return { label, bytes: built.bytes.length, seeded: built.seeded, noMesh: built.seedNoMesh, proxy: built.seedProxy, byClass: built.seedByClass, byEnt, ms: Math.round(performance.now() - t0), spatial: back && back.spatial, backErr: back && back.error }; }, label, doSave);
  const pre = await census('PRE', false);
  console.log(TAG + ' PRE bytes=' + pre.bytes + ' seeded=' + pre.seeded + ' noMesh=' + pre.noMesh + ' ms=' + pre.ms);
  const rowOk = await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-all"]'));
  if (!rowOk) { console.log(TAG + ' INCONCLUSIVE no Walk ALL row after open, nothing judged'); await br.close(); srv.close(); process.exit(0); }
  await pg.evaluate(() => { window.__dwAllDone = false; }); await pg.click('[data-bnode="dw-all"]');
  const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 1800000, polling: 1000 }).then(() => true).catch(() => false); await sleep(4000);
  const walk = await pg.evaluate(() => { const w = window.__dwWalks || {}, placed = {}, cen = {}; let runs = 0; Object.keys(w).forEach(k => placed[k] = (w[k] || []).length);
    window.Bonsai.oplog._geomOps().forEach(x => { const d = x.parameters && x.parameters._dw; if (!d) return; if (d.ifc) cen[d.ifc] = (cen[d.ifc] || 0) + 1; else runs++; });
    return { placed, committed: cen, runs, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }; });
  console.log(TAG + ' walk done=' + done + ' placed=' + JSON.stringify(walk.placed) + ' committedByClass=' + JSON.stringify(walk.committed) + ' routedRuns=' + walk.runs + ' heapMB=' + walk.heapMB);
  const classes = Object.keys(walk.committed);
  if (!done || !classes.length) { console.log(TAG + ' INCONCLUSIVE the walk committed nothing (done=' + done + '), nothing judged'); await br.close(); srv.close(); process.exit(0); }
  const post = await census('POST', true);
  console.log(TAG + ' POST bytes=' + post.bytes + ' seeded=' + post.seeded + ' noMesh=' + post.noMesh + ' proxy=' + post.proxy + ' ms=' + post.ms + ' byClass=' + JSON.stringify(post.byClass));
  const nE = (c, o) => o.byEnt[c.toUpperCase()] || 0;
  classes.forEach(c => { console.log(TAG + ' FILE ' + c + ' committed=' + walk.committed[c] + ' PRE=' + nE(c, pre) + ' POST=' + nE(c, post));
    ok('Y1 ' + c + ': each committed fixture is an entity in the file text', nE(c, post) - nE(c, pre) === walk.committed[c], 'delta=' + (nE(c, post) - nE(c, pre)) + ' committed=' + walk.committed[c]); });
  ['IfcFireSuppressionTerminal', 'IfcAirTerminal', 'IfcDuctSegment', 'IfcDuctFitting'].forEach(c => console.log(TAG + ' COUNT ' + c + ' PRE=' + nE(c, pre) + ' POST=' + nE(c, post)));
  ok('Y2 falsifier: PRE holds fewer of the walked classes (Y1 can fail)', classes.every(c => nE(c, pre) < nE(c, post)), classes.map(c => c + ' ' + nE(c, pre) + '<' + nE(c, post)).join(', '));
  ok('Y3 POST parses back', !post.backErr && !!post.spatial, post.backErr || JSON.stringify(post.spatial));
  ok('Y4 no page errors', errs.length === 0, 'errors=' + errs.length);
  console.log(TAG + ' ENTITIES POST ' + JSON.stringify(Object.keys(post.byEnt).filter(k => post.byEnt[k] > 100 || /TERMINAL|DUCT|ALARM|STOREY|SWEPT|PIPE/.test(k)).sort((x, y) => post.byEnt[y] - post.byEnt[x]).slice(0, 24).map(k => k + ':' + post.byEnt[k])));
  if (process.env.WALK_IFC_OUT) {   // chunked: a walked file is too big for one base64 string
    const fd = fs.openSync(process.env.WALK_IFC_OUT, 'w'); await pg.exposeFunction('__wChunk', b => { fs.writeSync(fd, Buffer.from(b, 'base64')); });
    await pg.evaluate(async () => { const b = window.__ifcBytes; for (let at = 0; at < b.length; at += 16777215) { let s = ''; const sub = b.subarray(at, at + 16777215); for (let i = 0; i < sub.length; i += 32768) s += String.fromCharCode.apply(null, sub.subarray(i, i + 32768)); await window.__wChunk(btoa(s)); } });
    fs.closeSync(fd); console.log(TAG + ' saved bytes=' + fs.statSync(process.env.WALK_IFC_OUT).size);
  }
  clearInterval(beat);
  console.log(TAG + ' VERDICT judged=' + judged + ' fail=' + fails);
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})().catch(e => { console.log(TAG + ' ERROR ' + (e && e.stack || e)); process.exit(1); });
