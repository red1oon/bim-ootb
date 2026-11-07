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
  pg.on('console', m => { const t = m.text(); if (/§(WALK-BAND-NOHOST|WALK-AREAHOST|DISC-WALK-COMMIT|DISC-WALK |WALK-MAINS)/.test(t)) { lines.push(t); console.log(t.slice(0, 600)); } });
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
    const chains = {}; Object.keys(window.__dwChains || {}).forEach(d => { chains[d] = (window.__dwChains[d] || []).length; }); return { held, comm, chains, stats: window.__stats, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
  console.log(TAG + ' done=' + done + ' heldByDisc=' + JSON.stringify(seen.held) + ' committedByDisc=' + JSON.stringify(seen.comm) + ' heapMB=' + seen.heapMB);
  const walked = lines.filter(l => /§WALK-BAND-NOHOST/.test(l) && !/VACUOUS/.test(l)).map(l => { const g = k => +(l.match(new RegExp(' ' + k + '=(\\d+)')) || [])[1]; return { disc: (l.match(/disc=(\S+)/) || [])[1], input: g('input'), bound: g('bound'), unhosted: g('unhosted'), notJudged: g('notJudged'), refused: g('refused'), noMain: g('noMain') }; });
  const last = {}; walked.forEach(w => { last[w.disc] = w; });
  if (!done || !Object.keys(last).length) { console.log(TAG + ' INCONCLUSIVE no walk had band devices (done=' + done + '), nothing judged'); await br.close(); srv.close(); process.exit(0); }
  Object.keys(last).forEach(d => { const w = last[d], h = seen.held[d] || {}, c = seen.comm[d] || {}, commitLine = lines.filter(l => new RegExp('§DISC-WALK-COMMIT disc=' + d + ' ').test(l)).pop() || '', committedN = +(commitLine.match(/committed=(\d+)/) || [])[1];
    ok('B7a ' + d + ': the page holds what the walker counted', h.bound === w.bound && h.unhosted === w.unhosted && h.not_judged === w.notJudged, 'log bound=' + w.bound + ' unhosted=' + w.unhosted + ' notJudged=' + w.notJudged + ' held=' + JSON.stringify(h));
    ok('B7b ' + d + ': committed rows carry the labels, same counts', c.bound === w.bound && c.unhosted === w.unhosted && c.not_judged === w.notJudged, 'committed=' + JSON.stringify(c) + ' §commit=' + committedN);
    ok('B7c ' + d + ': every placement the page holds is a committed row', committedN === h.all, 'held=' + h.all + ' §commit=' + committedN);
    const st = seen.stats.filter(t => t.indexOf(d + ' — ') === 0).pop() || '', want = w.bound + ' on a host, ' + w.unhosted + ' unhosted';
    ok('B7d ' + d + ': the status a user reads says the same', st.indexOf(want) >= 0 && (!w.notJudged || st.indexOf(w.notJudged + ' not judged') >= 0) && (!(w.refused - w.noMain) || st.indexOf((w.refused - w.noMain) + ' not placed, no host') >= 0) && (!w.noMain || st.indexOf(w.noMain + ' duct or pipe pieces not placed, no main') >= 0), JSON.stringify(st.slice(0, 170)));
  });
  // §WALK-MAINS (DISC_WALK_DRAWN_MAINS.md §9): the user is told, the model holds no run. A file holding the service would say real=, so this only judges walks that said none.
  const ruled = lines.filter(l => /§WALK-MAINS disc=\S+ .*none reason=no sheet held/.test(l)).map(l => (l.match(/disc=(\S+)/) || [])[1]);
  [...new Set(ruled)].forEach(d => { const st = seen.stats.filter(t => t.indexOf(d + ' — ') === 0).pop() || '', runs = seen.chains[d] || 0; ok('B7f ' + d + ': no run, and the status says why', runs === 0 && st.indexOf('no main: no sheet held') >= 0, 'runs=' + runs + ' ' + JSON.stringify(st.slice(0, 170))); });
  if (!ruled.length) console.log(TAG + ' B7f INCONCLUSIVE no walk said none');
  // ── §11 P4 on the page: every consumer of a count leaves provisional rows out, and the label travels. ──
  const pg4 = await pg.evaluate(async () => {
    const W = window.__dwWalks || {}, held = {}; Object.keys(W).forEach(d => { const L = W[d] || []; held[d] = { all: L.length, prov: L.filter(p => p.provisional).length }; });
    const all = window.__dwAllResult || {}, tree = window.DWInstancesOutliner ? window.DWInstancesOutliner._tree() : [], leaves = [];
    (function walk(n) { (n || []).forEach(x => { if (x.kind === 'element') leaves.push(x.label); walk(x.children); }); })(tree);
    const body = document.body.innerText || '';
    return { held, provTotal: all.provisionalTotal, placedTotal: all.placedTotal, leaves: leaves.length, provLeaves: leaves.filter(l => /provisional/.test(l)).length, outlinerText: (body.match(/\d+ placed · \d+ provisional ▶/g) || []).slice(0, 6) };
  });
  const heldProv = Object.keys(pg4.held).reduce((a, d) => a + pg4.held[d].prov, 0), heldAll = Object.keys(pg4.held).reduce((a, d) => a + pg4.held[d].all, 0);
  ok('P4a walk-all total leaves provisional out and reports it apart', pg4.provTotal === heldProv && pg4.placedTotal === heldAll - heldProv && heldProv > 0, 'placedTotal=' + pg4.placedTotal + ' provisionalTotal=' + pg4.provTotal + ' held=' + heldAll + '/' + heldProv);
  ok('P4b every provisional device says so where it is identified (Walked Fixtures leaves)', pg4.provLeaves === heldProv, 'leaves=' + pg4.leaves + ' labelled provisional=' + pg4.provLeaves);
  Object.keys(last).forEach(d => { const st = seen.stats.filter(t => t.indexOf(d + ' — ') === 0).pop() || '', h = pg4.held[d] || { all: 0, prov: 0 };
    ok('P4c ' + d + ': the status says N placed · M provisional', st.indexOf((h.all - h.prov) + ' placed · ' + h.prov + ' provisional') === d.length + 3, JSON.stringify(st.slice(0, 90))); });
  // The Outliner's discipline row (modeller.html, the Disciplines category): its count, read from the rendered tree text.
  if (pg4.outlinerText.length) ok('P4f the Outliner discipline rows say N placed · M provisional', pg4.outlinerText.every(t => / 0 placed · \d+ provisional/.test(t) || /\d+ placed · \d+ provisional/.test(t)) && pg4.outlinerText.some(t => new RegExp('0 placed · (' + Object.keys(pg4.held).map(d => pg4.held[d].prov).join('|') + ') provisional').test(t)), JSON.stringify(pg4.outlinerText));
  else console.log(TAG + ' P4f INCONCLUSIVE the Outliner discipline rows are not in the rendered page text (panel collapsed?)');
  // IFC: export, read the walk set back out of the file text, re-open. Red controls: the writer switch off writes no set; a walked fixture with the flag off reads false.
  const readWalkSets = () => pg.evaluate(async () => {
    const b = await window.Bonsai.ifc.build(), txt = new TextDecoder('latin1').decode(b.bytes), L = {}, re = /^#(\d+)=\s*([A-Z0-9]+)\((.*)\);\s*$/gm; let m;
    while ((m = re.exec(txt))) L[m[1]] = { t: m[2], a: m[3] };
    const sv = {}; Object.keys(L).forEach(k => { if (L[k].t === 'IFCPROPERTYSINGLEVALUE' && /^'Provisional'/.test(L[k].a)) sv[k] = /IFCBOOLEAN\(\.T\.\)/.test(L[k].a); });
    let prov = 0, notProv = 0, sets = 0;
    Object.keys(L).forEach(k => { if (L[k].t !== 'IFCPROPERTYSET' || !/'BIMOOTB_Walk'/.test(L[k].a)) return; sets++;
      const pv = (L[k].a.match(/#(\d+)/g) || []).map(x => x.slice(1)).filter(x => x in sv)[0];
      Object.keys(L).forEach(r => { if (L[r].t !== 'IFCRELDEFINESBYPROPERTIES' || !new RegExp(',#' + k + '$').test(L[r].a)) return; const n = ((L[r].a.match(/\(([^()]*)\),#\d+$/) || [])[1] || '').split(',').filter(Boolean).length; if (sv[pv]) prov += n; else notProv += n; }); });
    let back = null; try { back = await window.Bonsai.ifc.reimport(b.bytes); } catch (e) { back = { error: String(e) }; }
    return { sets, prov, notProv, reopened: !!back && !back.error, walkProvisional: b.walkProvisional };
  });
  const ifc1 = await readWalkSets();
  ok('P4d IFC: the file carries the label, and its provisional count equals the walk\'s', ifc1.sets > 0 && ifc1.prov === heldProv && ifc1.reopened, 'sets=' + ifc1.sets + ' provisional in file=' + ifc1.prov + ' held=' + heldProv + ' reopened=' + ifc1.reopened);
  await pg.evaluate(() => { window.__ifcNoWalkSet = true; }); const ifcOff = await readWalkSets(); await pg.evaluate(() => { window.__ifcNoWalkSet = false; });
  ok('P4d RED: with the writer switch off the file has no walk set', ifcOff.sets === 0, 'sets=' + ifcOff.sets);
  const flagOff = await pg.evaluate(async () => { const O = window.Bonsai.oplog, src = O._geomOps().find(x => x.parameters && x.parameters._dw && x.parameters._dw.provisional); if (!src) return null;
    const p = JSON.parse(JSON.stringify(src.parameters)); p._dw.provisional = false; p._dw.prov = 'sched:witness-flag-off'; await O.commitSeedGroup([{ op_type: 'GEOM_INSERT', params: p }], 'p4-flagoff-' + O.length); return true; });
  const ifc2 = flagOff ? await readWalkSets() : null;
  ok('P4d RED: a walked fixture with the flag off reads false', !!ifc2 && ifc2.notProv === ifc1.notProv + 1 && ifc2.prov === ifc1.prov, ifc2 ? 'notProvisional ' + ifc1.notProv + '→' + ifc2.notProv : 'no walked op to clone');
  // Viewer DB export: the same label lands in element_pset_common.
  const vdb = await pg.evaluate(async () => { const r = await window.Bonsai.exportViewerDb({ download: false, carry: false }); if (!r || !r.bytes) return null;
    const d = new window.SQL.Database(r.bytes), q = s => { const x = d.exec(s); return x.length ? x[0].values : []; };
    const out = { t: q("SELECT value, COUNT(*) FROM element_pset_common WHERE pset='BIMOOTB_Walk' AND name='Provisional' GROUP BY value"), elements: r.elements }; d.close(); return out; });
  const vT = vdb ? ((vdb.t.find(v => v[0] === 'TRUE') || [0, 0])[1]) : -1;
  ok('P4e the label travels into an exported Viewer DB', !!vdb && vT === ifc2.prov, vdb ? 'TRUE rows=' + vT + ' (file ' + (ifc2 && ifc2.prov) + ') ' + JSON.stringify(vdb.t) : 'export returned nothing');
  ok('B7e no page errors', errs.length === 0, 'errors=' + errs.length);
  console.log(TAG + ' VERDICT judged=' + judged + ' fail=' + fails);
  await br.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(fails ? 1 : 0);
})().catch(e => { console.log(TAG + ' ERROR ' + (e && e.stack || e)); process.exit(1); });
