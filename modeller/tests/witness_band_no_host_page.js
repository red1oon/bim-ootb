#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-BAND-NO-HOST B7, prompts/DISC_WALK_BAND_NO_HOST.md §6. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: the host accounting is proven in node; does the REAL page carry it? Open a public building, Walk ALL, then compare the walker's own § line, the placements the page holds,
// the rows it committed, and the status text a user reads. Nothing walked with band devices = INCONCLUSIVE, never PASS.
// Usage: [WALK_DB=<db>] node witness_band_no_host_page.js   (software GL only: no GPU, no bake).
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..'), SHARED = path.join(process.env.HOME, 'bim-ootb');
const DB = process.env.WALK_DB || path.join(SHARED, 'modeller', 'Clinic_ARC.db');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0, judged = 0; const ok = (id, c, m) => { judged++; console.log((c ? '§PASS ' : '§FAIL ') + id + (m ? '  ' + m : '')); if (!c) fails++; };
const TAG = '§W-BAND-PAGE';
(async () => {
  if (!fs.existsSync(DB)) { console.log(TAG + ' INCONCLUSIVE db absent, nothing judged'); process.exit(0); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wband-')), local = path.join(tmp, path.basename(DB)); fs.copyFileSync(DB, local);   // the source DB is never written
  const srv = http.createServer((q, s) => { const p = decodeURIComponent(q.url.split('?')[0]), a = path.join(ROOT, p), b = path.join(SHARED, p), f = fs.existsSync(a) ? a : b; fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 3600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 720 }); const errs = [], lines = [];
  pg.on('pageerror', e => { errs.push(String(e).slice(0, 300)); console.log('§PAGEERR ' + String(e).slice(0, 300)); });
  pg.on('console', m => { const t = m.text(); if (/§(WALK-BAND-NOHOST|WALK-AREAHOST|DISC-WALK-COMMIT|DISC-WALK )/.test(t)) { lines.push(t); console.log(t.slice(0, 600)); } });
  await pg.goto(base + '/modeller/modeller.html', { waitUntil: 'load', timeout: 180000 });
  await pg.waitForFunction('window.__sceneReady===true && typeof window.discWalkAll==="function"', { timeout: 180000 });
  await pg.click('#b-open'); await pg.waitForSelector('#m-open-panel .mo-row[data-key="__local"]', { visible: true });
  const [fc] = await Promise.all([pg.waitForFileChooser(), pg.click('#m-open-panel .mo-row[data-key="__local"]')]); await fc.accept([local]);
  await pg.waitForFunction('!!window.__dwBuf && !!window.__arcSeedReady', { timeout: 2400000, polling: 2000 }); await pg.evaluate(async () => { await window.__arcSeedReady; }); await sleep(4000);
  if (!await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-all"]'))) { console.log(TAG + ' INCONCLUSIVE no Walk ALL row after open, nothing judged'); await br.close(); srv.close(); process.exit(0); }
  // The status text a user reads, every value it takes, kept per discipline.
  await pg.evaluate(() => { const seen = window.__stats = [], el = document.getElementById('stat'); window.__statObs = new MutationObserver(() => { seen.push(el.textContent); }); window.__statObs.observe(el, { childList: true, characterData: true, subtree: true }); });
  await pg.evaluate(() => { window.__dwAllDone = false; }); await pg.click('[data-bnode="dw-all"]');
  const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 1800000, polling: 1000 }).then(() => true).catch(() => false); await sleep(4000);
  const seen = await pg.evaluate(() => { window.__statObs.disconnect(); const w = window.__dwWalks || {}, held = {}, comm = {};
    Object.keys(w).forEach(d => { const h = held[d] = { all: (w[d] || []).length, bound: 0, unhosted: 0, not_judged: 0, none: 0 }; (w[d] || []).forEach(p => { if (/^placed:|^shim:host/.test(p.prov || '')) { h[p.hostState || 'none']++; } else h.none++; }); });
    window.Bonsai.oplog._geomOps().forEach(x => { const d = x.parameters && x.parameters._dw; if (!d || !d.ifc) return; const c = comm[d.disc] = comm[d.disc] || { rows: 0, bound: 0, unhosted: 0, not_judged: 0, none: 0 }; c.rows++; c[d.hostState || 'none']++; });
    return { held, comm, stats: window.__stats, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
  console.log(TAG + ' done=' + done + ' heldByDisc=' + JSON.stringify(seen.held) + ' committedByDisc=' + JSON.stringify(seen.comm) + ' heapMB=' + seen.heapMB);
  const walked = lines.filter(l => /§WALK-BAND-NOHOST/.test(l) && !/VACUOUS/.test(l)).map(l => { const g = k => +(l.match(new RegExp(' ' + k + '=(\\d+)')) || [])[1]; return { disc: (l.match(/disc=(\S+)/) || [])[1], input: g('input'), bound: g('bound'), unhosted: g('unhosted'), notJudged: g('notJudged'), refused: g('refused') }; });
  const last = {}; walked.forEach(w => { last[w.disc] = w; });
  if (!done || !Object.keys(last).length) { console.log(TAG + ' INCONCLUSIVE no walk had band devices (done=' + done + '), nothing judged'); await br.close(); srv.close(); process.exit(0); }
  Object.keys(last).forEach(d => { const w = last[d], h = seen.held[d] || {}, c = seen.comm[d] || {}, commitLine = lines.filter(l => new RegExp('§DISC-WALK-COMMIT disc=' + d + ' ').test(l)).pop() || '', committedN = +(commitLine.match(/committed=(\d+)/) || [])[1];
    ok('B7a ' + d + ': the page holds what the walker counted', h.bound === w.bound && h.unhosted === w.unhosted && h.not_judged === w.notJudged, 'log bound=' + w.bound + ' unhosted=' + w.unhosted + ' notJudged=' + w.notJudged + ' held=' + JSON.stringify(h));
    ok('B7b ' + d + ': committed rows carry the labels, same counts', c.bound === w.bound && c.unhosted === w.unhosted && c.not_judged === w.notJudged, 'committed=' + JSON.stringify(c) + ' §commit=' + committedN);
    ok('B7c ' + d + ': every placement the page holds is a committed row', committedN === h.all, 'held=' + h.all + ' §commit=' + committedN);
    const st = seen.stats.filter(t => t.indexOf(d + ' — ') === 0).pop() || '', want = w.bound + ' on a host, ' + w.unhosted + ' unhosted';
    ok('B7d ' + d + ': the status a user reads says the same', st.indexOf(want) >= 0 && (!w.notJudged || st.indexOf(w.notJudged + ' not judged') >= 0) && (!w.refused || st.indexOf(w.refused + ' not placed') >= 0), JSON.stringify(st.slice(0, 170)));
  });
  ok('B7e no page errors', errs.length === 0, 'errors=' + errs.length);
  console.log(TAG + ' VERDICT judged=' + judged + ' fail=' + fails);
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})().catch(e => { console.log(TAG + ' ERROR ' + (e && e.stack || e)); process.exit(1); });
