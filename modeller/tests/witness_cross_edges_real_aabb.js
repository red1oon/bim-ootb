#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-XEDGE-REAL-AABB scope
 * SCOPE: RESUME_SESSION_2026-07-04_GATE_BACKPROP.md §OPEN item 3 — cross_edges.js's `_readBoxes()` read the
 * COARSE `element_transforms.center_xyz`/`bbox_xyz` convention directly, which disagrees with the REAL
 * per-element geometry `bonsai_library.js`'s `foldInsert` actually renders (measured via the real browser
 * open path: SampleCastle showed 924/9817, 9.4%, of its abuts pairs disagreeing — real architectural
 * elements, not a furniture-only edge case; SampleHouse's 2 editable pairs were BOTH false positives, ~215mm
 * and ~391mm actually separated in the live render, not touching at all). Fix: `_readBoxes()` now computes
 * the TRUE world AABB from the real per-element vertex blob (rotate by yaw + translate by center_xyz —
 * `real_geometry.js`'s own documented ground truth) when resolvable, falling back to the coarse bbox
 * otherwise. This is a HEADLESS BROWSER witness (drives the real Open flow, real live-mesh AABBs) — the
 * value witness `witness_sdg_gate.js`/pure-node scripts can't see the REAL render (registerRealGeometry is
 * browser-wired only). Read the §-log after every run.
 *
 * CLAIMS:
 *   G1 OPEN-OK        — SampleHouse .db-open lands editable meshes + swXEdges.
 *   G2 NO-FALSE-TOUCH  — SampleHouse's 2 OLD (pre-fix) editable abuts pairs (wall↔furniture, fid 1/30 and
 *                        5/32) are GONE from the corrected edge set — the live render confirms they are NOT
 *                        actually touching (both genuinely separated, ~215-391mm, confirmed by direct AABB
 *                        gap measurement on the real meshes).
 *   G3 REAL-PAIRS-FOUND — the corrected edge set finds >0 editable-editable pairs (the true wall/floor/
 *                        wall-corner adjacency a small house actually has — completely missing pre-fix).
 *   G4 LIVE-AGREEMENT  — EVERY editable-editable pair the corrected cross_edges.js reports is ALSO confirmed
 *                        touching (|overlap| <= 30mm + 1mm floating-point boundary slack on the touch axis)
 *                        when measured DIRECTLY on the live rendered meshes (_gateBoxes()-equivalent) — the
 *                        exact property item 3 found broken (was 924/9817, 9.4%, on SampleCastle pre-fix,
 *                        real mismatches of 65-391mm; post-fix 0 real disagreements — the only pairs sitting
 *                        near the tolerance boundary are within 0.0007mm of it, confirmed float noise, not a
 *                        real gap, hence the slack).
 *   G5 NO-ERROR        — zero pageerror.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

function overlaps(a, b) { const ov = []; for (let k = 0; k < 3; k++) { const lo = Math.max(a[2*k], b[2*k]), hi = Math.min(a[2*k+1], b[2*k+1]); ov.push(hi - lo); } return ov; }
function touchAxis(a, b) { const ov = overlaps(a, b); let k = 0; for (let i = 1; i < 3; i++) if (Math.abs(ov[i]) < Math.abs(ov[k])) k = i; return { axis: k, ov: ov[k] }; }
const TOL = 0.03;
// Boundary slack: cross_edges.js's derivation and the live THREE.js mesh's own computeBoundingBox() are two
// INDEPENDENT float computations of the same real quantity — pairs sitting almost exactly ON the 30mm
// threshold can land a sub-millimetre's width of floating-point noise on either side of it (confirmed via a
// direct SampleCastle probe: 75/13282 pairs "disagreed" post-fix, every one within 0.0007mm of the boundary,
// none anywhere close to a real mismatch — pre-fix real mismatches were 65-391mm, orders of magnitude larger).
// 1mm is generous slack for that noise while still failing on anything resembling a real disagreement.
const BOUNDARY_SLACK = 0.001;

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  console.log('═══ W-XEDGE-REAL-AABB — cross_edges.js real per-element AABB correction (headless, real render) ═══');

  for (const building of ['SampleHouse', 'SampleCastle']) {
    console.log('--- ' + building + ' ---');
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    await pg.click(`.mo-row[data-key="${building}"]`);
    await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => false);
    await sleep(building === 'SampleCastle' ? 3500 : 2000);

    const result = await pg.evaluate(() => {
      const g = window.Bonsai.group(); const boxes = {};
      g.children.forEach(m => { if (m.isMesh && m.userData && m.userData.featureId != null) {
        m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
        boxes[m.userData.featureId] = [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
      }});
      const X = window.swXEdges || {}, fbg = window.__arcFidByGuid || {};
      const editablePairs = (X.abuts || []).map(e => ({ e, a: fbg[e.a], b: fbg[e.b] })).filter(p => p.a != null && p.b != null);
      return { totalMeshes: Object.keys(boxes).length, boxes, editablePairs, dwName: window.__dwName, abutsTotal: (X.abuts || []).length };
    });

    chk('G1 OPEN-OK (' + building + ', editable meshes + swXEdges present)',
      result.dwName === building && result.totalMeshes > 0 && result.abutsTotal > 0,
      'meshes=' + result.totalMeshes + ' abutsTotal=' + result.abutsTotal);

    if (building === 'SampleHouse') {
      const hasFalsePair = result.editablePairs.some(p => (p.a === 1 && p.b === 30) || (p.a === 30 && p.b === 1) || (p.a === 5 && p.b === 32) || (p.a === 32 && p.b === 5));
      chk('G2 NO-FALSE-TOUCH (the 2 pre-fix wall↔furniture false positives are GONE)', !hasFalsePair,
        'editablePairs=' + result.editablePairs.length);
    }

    chk('G3 REAL-PAIRS-FOUND (' + building + ' — corrected edge set finds real adjacency)',
      result.editablePairs.length > 10, 'editablePairs=' + result.editablePairs.length);

    let disagree = 0, checked = 0; const disagreements = [];
    result.editablePairs.forEach(p => {
      if (!result.boxes[p.a] || !result.boxes[p.b]) return;
      checked++;
      const t = touchAxis(result.boxes[p.a], result.boxes[p.b]);
      if (Math.abs(t.ov) > TOL + BOUNDARY_SLACK) { disagree++; disagreements.push('a=' + p.a + ' b=' + p.b + ' ov_mm=' + (t.ov * 1000).toFixed(1)); }
    });
    chk('G4 LIVE-AGREEMENT (' + building + ' — every corrected abuts pair confirmed touching on the LIVE render, 0 disagreement)',
      disagree === 0 && checked > 0, 'checked=' + checked + ' disagree=' + disagree + (disagreements.length ? ' ' + disagreements.slice(0, 3).join(' | ') : ''));

    chk('G5 NO-ERROR (' + building + ' — zero pageerror)', errs.length === 0, errs.slice(0, 2).join(' | '));
    await pg.close();
  }

  console.log('W-XEDGE-REAL-AABB: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
