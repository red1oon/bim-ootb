#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-FILESTORE, prompts/BIMDOC_OPEN_FILE_STORE.md §4. Read the log after every run; exit code is not evidence.
// ISSUES IT EXPOSES: (D) the same attachment bytes stored twice; (H) a store that hands back bytes whose hash is not their name, or opens
// an absent entry; (S) a row delete that removes bytes another row still needs, or a sweep that leaves orphans; (O) "Open in Viewer /
// Modeller" that does not reach the app's own open route, or that opens a refused entry anyway; (Z) a page with no ?open= that changes.
// Real OPFS in headless Chrome, one origin for every page (OPFS is per origin). Software GL. Fixtures public: IFC/Duplex_ARC.ifc and a one-LINE DXF.
// A claim prints INCONCLUSIVE, never PASS, when nothing was judged. Usage: node common/tests/witness_file_store.js > log 2>&1
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
const puppeteer = require(process.env.PUPPETEER_PATH || path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer'));
const log = console.log;
let pass = 0, fail = 0, inc = 0;
const ok = (id, c, m) => { log('§' + (c ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + (m || '')); c ? pass++ : fail++; return c; };
const incon = (id, why) => { log('§INCONCLUSIVE ' + id + ' | ' + why); inc++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IFC = [path.join(ROOT, 'IFC', 'Duplex_ARC.ifc'), path.join(os.homedir(), 'bim-ootb', 'IFC', 'Duplex_ARC.ifc')].find(f => fs.existsSync(f) && fs.statSync(f).size > 1e5);
const DXF = '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nA-WALL\n10\n0.0\n20\n0.0\n30\n0.0\n11\n5000.0\n21\n0.0\n31\n0.0\n0\nENDSEC\n0\nEOF\n';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ifc': 'application/octet-stream', '.db': 'application/octet-stream', '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2' };

(async () => {
  if (!IFC) { incon('ALL', 'IFC/Duplex_ARC.ifc absent'); log('§W-FILESTORE INCONCLUSIVE'); return; }
  const ifcBytes = fs.readFileSync(IFC), IFC_SHA = sha(ifcBytes), DXF_SHA = sha(Buffer.from(DXF));
  const srv = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split('?')[0]);
    const f = u === '/__wfs/model.ifc' ? IFC : (u === '/__wfs/blank.html' ? null : path.join(ROOT, u.replace(/^\/+/, '')));
    if (u === '/__wfs/blank.html') { s.writeHead(200, { 'Content-Type': 'text/html' }); s.end('<!doctype html><meta charset="utf-8"><title>wfs</title>'); return; }
    if (f !== IFC && !f.startsWith(ROOT)) { s.writeHead(403); s.end(); return; }
    fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }); s.end(b); }); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'wfs-prof-'));   // ONE profile = one OPFS for every page of the run
  const br = await puppeteer.launch({ headless: true, userDataDir: prof, protocolTimeout: 1800000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720', '--js-flags=--max-old-space-size=6144'] });
  const page = async (url, tag) => { const pg = await br.newPage(), L = [], E = []; await pg.setViewport({ width: 1280, height: 720 });
    pg.on('console', m => { const t = m.text(); L.push(t); if (/§(FILESTORE|OPEN_IFC|MODELLER-OPEN|DXF-IMPORT sheet)/.test(t)) log('  [' + tag + '] ' + t.slice(0, 260)); });
    pg.on('pageerror', e => E.push(String(e && e.message || e).slice(0, 200))); await pg.goto(base + url, { waitUntil: 'domcontentloaded', timeout: 120000 }); return { pg, L, E }; };
  const waitLine = async (P, rx, ms) => { for (let t = 0; t < ms; t += 500) { const l = P.L.find(x => rx.test(x)); if (l) return l; await sleep(500); } return null; };
  try {
    // ── store-level claims, on a blank page of the same origin ──
    const B = await page('/__wfs/blank.html', 'store');
    await B.pg.addScriptTag({ url: base + '/common/file_store.js' });
    const S = await B.pg.evaluate(async (DXF) => {
      const FS = window.FileStore, r = {};
      const ifc = new Blob([await (await fetch('/__wfs/model.ifc')).arrayBuffer()]);
      r.p1 = await FS.put(ifc); r.p2 = await FS.put(ifc); r.listAfterDup = (await FS.list()).length;
      r.pd = await FS.put(new Blob([DXF]));
      const g = await FS.get(r.p1.sha256, 'Duplex_ARC.ifc'); r.getSha = await FS.sha256Hex(await g.arrayBuffer()); r.getName = g.name;
      const tmp = await FS.put(new Blob(['altered-fixture-' + Date.now()]));
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle(FS.DIR), w = await (await d.getFileHandle(tmp.sha256)).createWritable(); await w.write(new Blob(['tampered'])); await w.close();
      try { await FS.get(tmp.sha256, 'x'); r.alt = 'opened'; } catch (e) { r.alt = e.refused; }
      r.altSha = tmp.sha256;
      try { await FS.get('0'.repeat(64), 'x'); r.abs = 'opened'; } catch (e) { r.abs = e.refused; }
      return r; }, DXF);
    log('§W-FS store ' + JSON.stringify({ p1: S.p1, p2: S.p2, n: S.listAfterDup, alt: S.alt, abs: S.abs }));
    ok('S1 same bytes put twice give ONE entry (second is dedup)', S.p1.sha256 === S.p2.sha256 && !S.p1.dedup && S.p2.dedup && S.listAfterDup === 1, 'entries after 2 puts=' + S.listAfterDup);
    ok('S1b the store name is the sha256 of the bytes (= Node crypto on the same file)', S.p1.sha256 === IFC_SHA && S.pd.sha256 === DXF_SHA, S.p1.sha256.slice(0, 12) + ' = ' + IFC_SHA.slice(0, 12));
    ok('S2 get returns the bytes whose hash is their name', S.getSha === IFC_SHA && S.getName === 'Duplex_ARC.ifc', S.getSha.slice(0, 12));
    ok('S3 RED an altered entry is refused (mismatch)', S.alt === 'mismatch', 'got ' + S.alt);
    ok('S4 RED an absent entry is refused (absent)', S.abs === 'absent', 'got ' + S.abs);
    // S5 sweep with reference sets: rows {r1:A, r2:A, r3:B}; the caller passes what is still referenced.
    const W = await B.pg.evaluate(async (a, b, alt) => { const FS = window.FileStore, refs = rows => new Set(Object.values(rows));
      await FS.sweep(new Set([a, b]));   // drop the tampered fixture entry first
      const rows = { r1: a, r2: a, r3: b }, out = {};
      delete rows.r3; out.s1 = await FS.sweep(refs(rows)); out.hasA1 = await FS.has(a); out.hasB1 = await FS.has(b);
      delete rows.r1; out.s2 = await FS.sweep(refs(rows)); out.hasA2 = await FS.has(a);
      delete rows.r2; out.s3 = await FS.sweep(refs(rows)); out.hasA3 = await FS.has(a);
      return out; }, IFC_SHA, DXF_SHA, S.altSha);
    ok('S5 sweep: B unreferenced is removed, A (2 rows) stays', W.hasA1 && !W.hasB1 && W.s1.removed === 1, JSON.stringify(W.s1));
    ok('S5b one of A\'s two rows deleted: the bytes stay', W.hasA2 && W.s2.removed === 0, JSON.stringify(W.s2));
    ok('S5c A\'s last row deleted: the sweep removes it', !W.hasA3 && W.s3.removed === 1, JSON.stringify(W.s3));
    ok('S6 the store logs its same-origin limit (once)', B.L.filter(x => /^§FILESTORE-ORIGIN origin=/.test(x)).length === 1, (B.L.find(x => /§FILESTORE-ORIGIN/.test(x)) || 'none').slice(0, 120));
    // re-seed for the app opens
    await B.pg.evaluate(async () => { const FS = window.FileStore; await FS.put(new Blob([await (await fetch('/__wfs/model.ifc')).arrayBuffer()])); });
    await B.pg.evaluate(async (DXF) => { await window.FileStore.put(new Blob([DXF])); }, DXF);
    await B.pg.close();
    // ── O5: no ?open= → no §FILESTORE line ──
    const Z = await page('/viewer/viewer.html', 'viewer-plain'); await sleep(8000);
    ok('O5 a Viewer page without ?open= prints no §FILESTORE line (unchanged)', !Z.L.some(x => /§FILESTORE/.test(x)), 'lines=' + Z.L.filter(x => /§FILESTORE/.test(x)).length); await Z.pg.close();
    // ── O1 Viewer IFC ──
    const V = await page('/viewer/viewer.html?open=store:' + IFC_SHA + '&name=Duplex_ARC.ifc', 'viewer');
    const vOpen = await waitLine(V, /§FILESTORE-OPEN sha=/, 180000), vIfc = await waitLine(V, /§OPEN_IFC files=1 names=Duplex_ARC\.ifc/, 180000);
    const vPer = await waitLine(V, /^§FILESTORE-PERSIST granted=/, 20000);
    ok('O1p the open asks the browser to keep the store (persist) and logs the answer', !!vPer, vPer || 'no §FILESTORE-PERSIST line');
    ok('O1 Viewer: ?open=store: reaches the Viewer\'s own IFC route with the attachment\'s hash', !!vOpen && vOpen.indexOf('sha=' + IFC_SHA.slice(0, 12)) > 0 && /route=ifc/.test(vOpen) && !!vIfc, (vOpen || 'no §FILESTORE-OPEN') + ' | ' + (vIfc || 'no §OPEN_IFC'));
    await V.pg.close();
    // ── O1 RED: tamper the IFC entry, the Viewer refuses and never imports ──
    const T = await page('/__wfs/blank.html', 'tamper'); await T.pg.addScriptTag({ url: base + '/common/file_store.js' });
    await T.pg.evaluate(async (s) => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_files'), w = await (await d.getFileHandle(s)).createWritable(); await w.write(new Blob(['tampered'])); await w.close(); }, IFC_SHA);
    await T.pg.close();
    const VR = await page('/viewer/viewer.html?open=store:' + IFC_SHA + '&name=Duplex_ARC.ifc', 'viewer-red');
    const vRef = await waitLine(VR, /§FILESTORE-OPEN REFUSED/, 120000); await sleep(3000);
    ok('O1 RED Viewer: an altered entry is refused and no import runs', !!vRef && /reason=mismatch/.test(vRef) && !VR.L.some(x => /§OPEN_IFC files=/.test(x)), vRef || 'no refusal line');
    await VR.pg.close();
    // restore the IFC entry for the Modeller legs
    const R = await page('/__wfs/blank.html', 'restore'); await R.pg.addScriptTag({ url: base + '/common/file_store.js' });
    await R.pg.evaluate(async (s) => { const FS = window.FileStore; await (await (await navigator.storage.getDirectory()).getDirectoryHandle(FS.DIR)).removeEntry(s); await FS.put(new Blob([await (await fetch('/__wfs/model.ifc')).arrayBuffer()])); }, IFC_SHA);
    await R.pg.close();
    // ── O2 Modeller IFC ──
    const M = await page('/modeller/modeller.html?open=store:' + IFC_SHA + '&name=Duplex_ARC.ifc', 'modeller');
    const mOpen = await waitLine(M, /§FILESTORE-OPEN sha=/, 180000), mIfc = await waitLine(M, /§MODELLER-OPEN store pick local=Duplex_ARC\.ifc/, 60000);
    ok('O2 Modeller: ?open=store: IFC reaches the Open panel\'s own call (SW._openIfcFile)', !!mOpen && mOpen.indexOf('sha=' + IFC_SHA.slice(0, 12)) > 0 && /route=ifc/.test(mOpen) && !!mIfc, (mOpen || 'none') + ' | ' + (mIfc || 'none'));
    await M.pg.close();
    // ── O3 Modeller DXF ──
    const D = await page('/modeller/modeller.html?open=store:' + DXF_SHA + '&name=WFS_PLAN.dxf', 'modeller-dxf');
    const dOpen = await waitLine(D, /§FILESTORE-OPEN sha=/, 120000), dSheet = await waitLine(D, /§DXF-IMPORT sheet=WFS_PLAN\.dxf .*sha=/, 120000);
    const dSha = dSheet && (/sha=([0-9a-f]+)/.exec(dSheet) || [])[1];
    ok('O3 Modeller: ?open=store: DXF reaches the DXF chooser\'s own call, and its sheet hash = the store\'s', !!dOpen && /route=dxf/.test(dOpen) && !!dSha && DXF_SHA.indexOf(dSha) === 0, (dOpen || 'none') + ' | ' + (dSheet || 'no §DXF-IMPORT sheet line'));
    await D.pg.close();
    // ── O4 RED Modeller: missing entry ──
    const MR = await page('/modeller/modeller.html?open=store:' + 'f'.repeat(64) + '&name=missing.ifc', 'modeller-red');
    const mRef = await waitLine(MR, /§FILESTORE-OPEN REFUSED/, 120000); await sleep(2000);
    ok('O4 RED Modeller: a missing entry is refused and no open runs', !!mRef && /reason=absent/.test(mRef) && !MR.L.some(x => /§MODELLER-OPEN store pick/.test(x)), mRef || 'no refusal line');
    log('§W-FS pageErrors modeller=' + MR.E.length + (MR.E[0] ? ' first=' + MR.E[0] : ''));
    await MR.pg.close();
  } catch (e) { log('§W-FS CRASH ' + (e.stack || e)); fail++; }
  finally { await br.close(); srv.close(); }
  const v = fail ? 'FAIL' : (pass ? (inc ? 'PASS-WITH-INCONCLUSIVE' : 'PASS') : 'INCONCLUSIVE');
  log('§W-FILESTORE ' + v + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
})();
