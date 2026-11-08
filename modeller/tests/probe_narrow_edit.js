// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// probe_narrow_edit.js — MEASURED PROBE, not a witness, ships nothing. bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §20.2.
// ISSUE IT PROVES OR DISPROVES: the edit report's overlap row counts WORLD BOXES (sdg_gate.js pairsOver). Can the Viewer's mesh narrow phase
// (viewer/clash_narrow.js testPair, loaded UNCHANGED) sit behind that row, and what does it cost per edit?
// Drives the real Modeller page headless on SwiftShader (no GPU) through the same commit path edit_cli uses, takes the box pairs the report
// counts AFTER the edit, and runs testPair on exactly those pairs with the Modeller's own mesh geometries. Nothing in the app changes: the
// probe injects clash_narrow.js and three-mesh-bvh@0.8.0 into the page by itself.
// Prints § lines: §NARROW_PROBE_FRAME, _EDIT, _PAIR, _SUMMARY. Verdict INCONCLUSIVE when no box pair was judged.
//   node modeller/tests/probe_narrow_edit.js [--building HospitalGarage] [--edit shift:gy11:-1.49 ...] [--max-pairs 100000]
// Needs puppeteer (NODE_PATH ok). Public buildings only: the residents the repo already ships.
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
const args = process.argv.slice(2); let building = 'HospitalGarage', maxPairs = 100000; const edits = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--building') building = args[++i];
  else if (args[i] === '--max-pairs') maxPairs = +args[++i];
  else if (args[i] === '--edit') { const [k, g, m] = args[++i].split(':'); edits.push({ shift: k === 'shift', grid: g, move: +m }); }
}
if (!edits.length) [{ shift: true, grid: 'gy11', move: -1.49 }, { shift: true, grid: 'gy10', move: 1.49 }, { shift: true, grid: 'gy9', move: 1.51 },
  { shift: false, grid: 'gy12', move: 0.6 }, { shift: true, grid: 'gy20', move: 3 }].forEach(e => edits.push(e));
const ROOT = path.join(__dirname, '..', '..'), sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const server = http.createServer((q, r) => { fs.readFile(path.join(ROOT, decodeURIComponent(q.url.split('?')[0])), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' }); r.end(b); }); });
const L = (s) => console.log(s);

(async () => {
  await new Promise(res => server.listen(0, res));
  const url = 'http://localhost:' + server.address().port + '/modeller/modeller.html';
  const puppeteer = require('puppeteer');
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const summary = { edits: 0, boxPairs: 0, meshClash: 0, meshClear: 0, unknown: 0 }; let failed = null;
  try {
    const errs = [];
    const openFresh = async (first) => {
    const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 860 });
    pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    const slog = []; pg.on('console', m => { const x = m.text(); if (/^§/.test(x)) slog.push(x); if (/^§(BVH|CLASH_NARROW)/.test(x) && first) L('  page ' + x.slice(0, 200)); });
    await pg.goto(url, { waitUntil: 'load', timeout: 120000 });
    await pg.waitForFunction('window.__sceneReady===true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 60000 });
    await pg.click('#b-open'); await sleep(200);
    await pg.click('#m-open-panel .mo-row[data-key="' + building + '"]');
    await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 120000 }).catch(() => {}); await sleep(2200);
    let settled = false;
    for (let i = 0; i < 480 && !settled; i++) { settled = await pg.evaluate(() => !!window.__saveGateBaseline && Object.keys(window.__saveGateBaseline).length > 0); if (!settled) await sleep(500); }
    if (!settled) throw new Error('building did not open');
    const framed = await pg.evaluate(() => { const i = window.swbGateInfo && window.swbGateInfo(); return !!(i && i.system === 'column-framed'); });
    if (framed) { for (let i = 0; i < 120 && !slog.some(l => /§STRWALK-OL §GEO-SERVED/.test(l)); i++) await sleep(500); await sleep(5000); await pg.click   /* same readiness edit_cli waits for: the real geometry served */('#b-gridmove'); await sleep(600); } else await sleep(1500);
    await pg.evaluate(() => { window.__editReportKeepBoxes = true; });

    // inject the Viewer's module UNCHANGED + the BVH library the Viewer uses (loader.js:196)
    await pg.addScriptTag({ url: '/viewer/clash_narrow.js' });
    const inj = await pg.evaluate(async () => {
      const t0 = performance.now();
      const bvh = await import('https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.8.0/+esm');
      THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree; THREE.BufferGeometry.prototype.disposeBoundsTree = bvh.disposeBoundsTree;
      window._bvhReady = true; const msLib = performance.now() - t0;
      window.A.ifc2three = window.A.ifc2three || ((x, y, z) => ({ x, y: z, z: -y }));   // unused here: the probe passes each mesh's own matrixWorld
      setupClashNarrow(window.A);
      return { msLib: +msLib.toFixed(0), hasTestPair: typeof window.A.clashNarrow.testPair };
    });
    if (first) L('§NARROW_PROBE_LOAD clash_narrow.js loaded unchanged; seam used = window.A.clashNarrow.testPair (' + inj.hasTestPair + '); three-mesh-bvh@0.8.0 import ms=' + inj.msLib + ' (one-off, CDN)');

    const frame = !first ? null : await pg.evaluate(() => { const g = window.Bonsai.group(); let n = 0, nonId = 0, verts = 0; g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null && !m.userData.anchor) { n++; m.updateWorldMatrix(true, false); if (m.matrixWorld.elements.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-9)) nonId++; verts += m.geometry.attributes.position.count; } }); return { n, nonId, verts }; });
    if (first) L('§NARROW_PROBE_FRAME building=' + building + ' meshes=' + frame.n + ' nonIdentityMatrixWorld=' + frame.nonId + ' verts=' + frame.verts + (frame.nonId ? ' (geometry NOT in world frame: gate boxes ignore the matrix)' : ' (geometry is in the world frame, the same frame the gate boxes use)'));

    return pg;
    };
    let firstRun = true;
    for (const e of edits) {
      const pg = await openFresh(firstRun); firstRun = false;   // a FRESH Open per edit, as edit_cli does: undo in one page drifted the Before count (2186 -> 2202 -> 2218)
      const tag = (e.shift ? 'shift ' : 'stretch ') + e.grid + ' ' + e.move;
      const res = await pg.evaluate(async (e, maxPairs) => {
        const known = window.Bonsai.gridmove.gridLines().map(l => l.id);
        if (known.indexOf(e.grid) < 0) return { refused: 'no grid line ' + e.grid };
        const before = window.__lastEditReport || null; window.gc && window.gc();
        const heap0 = performance.memory.usedJSHeapSize;
        await (e.shift ? window.__gridShift : window.__gridStretch)(e.grid, e.move);
        const rep = window.__lastEditReport; if (!rep || rep === before) return { refused: ((document.getElementById('stat') || {}).textContent || 'no report') };
        const bx = window.__editReportBoxes; if (!bx) return { refused: 'no boxes kept' };
        const SG = window.SdgGate, rel = window.__gateRel(), tol = SG.CLASH_TOL;
        const b0 = SG.pairsOver(bx.before, bx.moved, rel), a0 = SG.pairsOver(bx.after, bx.moved, rel);
        const had = {}; b0.pairs.forEach(p => { had[p.a + '|' + p.b] = p.depth; });
        const pairs = a0.pairs.slice(0, maxPairs), NT = window.A.clashNarrow;
        const newer = a0.pairs.filter(p => had[p.a + '|' + p.b] == null || p.depth > had[p.a + '|' + p.b] + 1e-6);   // the pairs the row's "new or deeper" is about
        const gd = window.__lastGateDetail || {}, gateClash = (gd.red || []).filter(x => x.kind === 'clash').map(x => ({ a: Math.min(x.a, x.b), b: Math.max(x.a, x.b), depth: x.depth }));
        const byFid = {}; window.Bonsai.group().children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null && !m.userData.anchor) byFid[m.userData.featureId] = m; });
        window.gc && window.gc(); const heapA = performance.memory.usedJSHeapSize;
        const run = (list) => {
          const out = []; const tA = performance.now();
          list.forEach(p => { const ma = byFid[p.a], mb = byFid[p.b]; if (!ma || !mb) { out.push({ a: p.a, b: p.b, verdict: 'UNKNOWN', reason: 'NO_MESH', ms: 0 }); return; }
            ma.updateWorldMatrix(true, false); mb.updateWorldMatrix(true, false);
            const r = NT.testPair(ma.geometry, ma.matrixWorld, mb.geometry, mb.matrixWorld, { ctx: { bvhReused: 0, bvhBuiltNew: 0 } });
            out.push({ a: p.a, b: p.b, boxDepth: p.depth, isNew: had[p.a + '|' + p.b] == null || p.depth > had[p.a + '|' + p.b] + 1e-6, verdict: r.verdict, reason: r.reason, stage: r.stage, obbDepthM: r.obbDepthM, ms: +r.ms.toFixed(3), triPairs: r.triPairs }); });
          return { out, ms: performance.now() - tA };
        };
        const freeBvh = (list) => { list.forEach(p => [byFid[p.a], byFid[p.b]].forEach(m => { try { m && m.geometry.disposeBoundsTree && m.geometry.disposeBoundsTree(); } catch (x) {} })); };
        const tally = (r) => { const k = { CLASH: 0, CLEAR: 0, UNKNOWN: 0 }; r.out.forEach(x => k[x.verdict]++); return k; };
        // (1) the report-scoped set: new or deeper pairs, cold BVH (what the row would pay per edit)
        window.gc && window.gc(); const hN0 = performance.memory.usedJSHeapSize;
        const rNew = run(newer); const hN1 = performance.memory.usedJSHeapSize; const nGeo = new Set(); newer.forEach(p => [byFid[p.a], byFid[p.b]].forEach(m => m && nGeo.add(m.geometry)));
        let nVerts = 0; nGeo.forEach(g => { nVerts += g.attributes.position.count; });
        const scoped = { n: newer.length, ms: +rNew.ms.toFixed(1), k: tally(rNew), heapMB: +((hN1 - hN0) / 1048576).toFixed(2), geoms: nGeo.size, verts: nVerts, detail: rNew.out.slice(0, 8) };
        const rGate = run(gateClash); const gate = { n: gateClash.length, k: tally(rGate), ms: +rGate.ms.toFixed(1), detail: rGate.out };
        freeBvh(newer); freeBvh(gateClash);
        window.gc && window.gc(); const heapA2 = performance.memory.usedJSHeapSize;
        const cold = run(pairs); const heapB = performance.memory.usedJSHeapSize; const warm = run(pairs);
        const geos = new Set(); pairs.forEach(p => { [byFid[p.a], byFid[p.b]].forEach(m => { if (m) geos.add(m.geometry); }); });
        let verts = 0, tris = 0, withBvh = 0; geos.forEach(g => { verts += g.attributes.position.count; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; if (g.boundsTree) withBvh++; });
        // release what the probe built (nothing is shipped): the BVHs go with the geometries the app already owns
        geos.forEach(g => { try { g.disposeBoundsTree && g.disposeBoundsTree(); } catch (x) {} });
        return { reportClash: (rep.newRows.filter(r => r.id === 'clash')[0] || {}).count, reportAbuts: (rep.newRows.filter(r => r.id === 'abuts-clash')[0] || {}).count, gateRed: (gd.red || []).length, scoped, gate, report: { newPairs: rep.newPairs.length, overlapRow: rep.rows[0] }, boxPairsAfter: a0.count, boxPairsBefore: b0.count, tested: pairs.length, cold, warm, heapDeltaMB: +((heapB - heapA2) / 1048576).toFixed(2), heapEditMB: +((heapA - heap0) / 1048576).toFixed(2), geoms: geos.size, verts, tris, withBvhAfterCold: withBvh };
      }, e, maxPairs);
      if (res.refused) { L('§NARROW_PROBE_EDIT ' + tag + ' REFUSED ' + res.refused); await pg.close(); continue; }
      const k = { CLASH: 0, CLEAR: 0, UNKNOWN: 0 }, why = {}; res.cold.out.forEach(r => { k[r.verdict]++; why[r.reason] = (why[r.reason] || 0) + 1; });
      const newK = { CLASH: 0, CLEAR: 0, UNKNOWN: 0 }; res.cold.out.filter(r => r.isNew).forEach(r => newK[r.verdict]++);
      const sumMs = (a) => +a.reduce((s, r) => s + r.ms, 0).toFixed(1), maxMs = Math.max(0, ...res.cold.out.map(r => r.ms));
      summary.edits++; summary.boxPairs += res.tested; summary.meshClash += k.CLASH; summary.meshClear += k.CLEAR; summary.unknown += k.UNKNOWN;
      L('§NARROW_PROBE_EDIT ' + tag + ' boxPairsBefore=' + res.boxPairsBefore + ' boxPairsAfter=' + res.boxPairsAfter + ' tested=' + res.tested + ' reportNewPairs=' + res.report.newPairs +
        ' | mesh: CLASH=' + k.CLASH + ' CLEAR=' + k.CLEAR + ' UNKNOWN=' + k.UNKNOWN + ' (new pairs only: CLASH=' + newK.CLASH + ' CLEAR=' + newK.CLEAR + ' UNKNOWN=' + newK.UNKNOWN + ') reasons=' + JSON.stringify(why) +
        ' | cost: cold ms=' + res.cold.ms.toFixed(1) + ' (testPair sum ' + sumMs(res.cold.out) + ', max pair ' + maxMs.toFixed(1) + ') warm ms=' + res.warm.ms.toFixed(1) + ' per pair cold=' + (res.tested ? (res.cold.ms / res.tested).toFixed(2) : 'n/a') + ' warm=' + (res.tested ? (res.warm.ms / res.tested).toFixed(3) : 'n/a') +
        ' | heap: BVH delta=' + res.heapDeltaMB + ' MB geoms=' + res.geoms + ' verts=' + res.verts + ' tris=' + Math.round(res.tris) + ' (verts touched; BVH adds no vertices, builds a node tree over the existing ones) | edit heap=' + res.heapEditMB + ' MB');
      const S = res.scoped, G = res.gate;
      L('§NARROW_PROBE_SCOPED ' + tag + ' newOrDeeperBoxPairs=' + S.n + ' mesh CLASH=' + S.k.CLASH + ' CLEAR=' + S.k.CLEAR + ' UNKNOWN=' + S.k.UNKNOWN + ' cold ms=' + S.ms + ' geoms=' + S.geoms + ' verts=' + S.verts + ' BVH heap=' + S.heapMB + ' MB | report row New-or-deeper-box-overlap=' + res.reportClash + ' (abuts-clash=' + res.reportAbuts + ', gate.red total=' + res.gateRed + ') | gate kind=clash pairs=' + G.n + ' mesh CLASH=' + G.k.CLASH + ' CLEAR=' + G.k.CLEAR + ' UNKNOWN=' + G.k.UNKNOWN + ' ms=' + G.ms + (S.n === 0 && G.n === 0 ? ' INCONCLUSIVE-for-this-edit (no new/deeper pair to judge)' : ''));
      G.detail.forEach(r => L('§NARROW_PROBE_GATEPAIR ' + tag + ' ' + r.a + '|' + r.b + ' boxDepth=' + r.boxDepth + ' -> ' + r.verdict + ' ' + r.reason + ' obbDepth=' + (r.obbDepthM == null ? 'null' : r.obbDepthM.toFixed(3)) + ' ms=' + r.ms));
      res.cold.out.slice(0, 3).forEach(r => L('§NARROW_PROBE_PAIR ' + tag + ' ' + r.a + '|' + r.b + ' boxDepth=' + r.boxDepth + ' ' + r.verdict + ' ' + r.reason + ' stage=' + r.stage + ' obbDepth=' + (r.obbDepthM == null ? 'null' : r.obbDepthM.toFixed(3)) + ' ms=' + r.ms));
      await pg.close();
    }
    if (errs.length) L('§NARROW_PROBE_PAGEERR ' + errs.slice(0, 3).join(' | '));
  } catch (e) { failed = String(e && e.stack || e); }
  await br.close().catch(() => {}); server.close();
  if (failed) L('§NARROW_PROBE_FAIL ' + failed);
  const judged = summary.boxPairs > 0;
  L('§NARROW_PROBE_SUMMARY building=' + building + ' edits=' + summary.edits + ' boxPairs=' + summary.boxPairs + ' meshClash=' + summary.meshClash + ' meshClear=' + summary.meshClear + ' unknown=' + summary.unknown + ' verdict=' + (failed ? 'FAIL' : judged ? 'MEASURED' : 'INCONCLUSIVE (no box pair was judged)'));
  process.exit(failed ? 1 : judged ? 0 : 4);
})();
