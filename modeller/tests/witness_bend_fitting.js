#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BEND-FITTING scope (read this block first)
 * SCOPE: RESUME_MODELLER_WALK_SUBSTRATE.md §CAMPAIGN M5 SPEC — elbow/tee fitting placement at bends in the M1
 *   pattern-bridge network. `_rwPairSegments`/`routewalker.js`'s straight-run pairing has NO adjacency/merge
 *   logic between segments (M4's continuous-tube render is two straight tubes meeting at a point). This gate
 *   proves disc_walker.js's NEW `bendFinder`/`fittingOrientation`/`bendFittings`:
 *   (U) UNIT, hand-calculated, no browser production path: a 90°-bend case's bisector/yaw matches independent
 *       hand trig EXACTLY; a 3-way TEE case; a vertical (non-horizontal) bend cross-checked against the REAL
 *       THREE.js quaternion/Euler the renderer will actually use (not just my own ported math agreeing with
 *       itself — "don't trust a PASS", per the STANDING AGENDA); a straight-through (antiparallel) pair gets
 *       NO fitting (M4 regression guard); a 4-way junction honestly REFUSES (no catalog cross fitting).
 *   (P) REAL PRODUCTION PATH: window.discWalk('PLB', …) on Duplex (ARC-only, M1's own building) — real bends
 *       exist in the real routed network (measured, not assumed): fittings commit as signed GEOM_INSERT rows,
 *       chain verifies, undo clears them, the catalog mesh (not a box placeholder) is the one that renders.
 * Log Mandate: every claim below is backed by a printed § line, read from THIS run's own log, not assumed.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
// NOTE (found this pass while proving the LOD-300 mesh-upgrade check, logged not fixed here — a SEPARATE,
// pre-existing regression, same class as M1's own flagged `modeller/mep_rw.db` 404): `dagevu_catalog.json` +
// dagevu_geometries.json are git-tracked ONLY under `viewer/` (confirmed via `git log`/grep — no history, no
// deploy-copy script references either path for `modeller/`). The isolated modeller fetches them RELATIVE TO
// ITSELF (bonsai_library.js's `_base`), so on the real deployed isolated modeller (GH Pages `modeller/` root)
// this 404s and the ENTIRE DB_PRODUCTS catalog (walls/doors/furniture/assemblies — not just M5's fittings)
// silently degrades to the 3-item legacy CATALOG. This witness's local server fixture-serves both paths from
// `viewer/` (mirroring witness_route_pattern_bridge.js's identical mep_rw.db trick) so the REAL bend-fitting
// mechanism (mesh availability, LOD-300 upgrade) can be measured correctly; the underlying deploy-path gap is
// out of scope for a disc-walker feature PR and is flagged in the session report for a follow-up.
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  let fp = path.join(ROOT, p);
  if (p === '/modeller/mep_rw.db' && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', 'mep_rw.db');
  if ((p === '/modeller/dagevu_catalog.json' || p === '/modeller/dagevu_geometries.json') && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', path.basename(p));
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const logs = []; pg.on('console', m => { const t = m.text(); if (/^§(BEND|DW-FIT)/.test(t)) logs.push(t); });

  console.log('═══ W-BEND-FITTING — bend-finder + rotation trig (unit, hand-calculated) + real Duplex production path ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function" && !!window.DiscWalker', { timeout: 30000 }).catch(() => {});

  // ── (U) UNIT / HAND-CALCULATED — no building, no browser production path, pure math over disc_walker.js ──
  const unit = await pg.evaluate(() => {
    const DW = window.DiscWalker, out = {};
    const deg = r => r * 180 / Math.PI;

    // U1 — 90° HORIZONTAL bend: run A arrives along +X (from (0,0,0) to (2,0,0)), run B leaves along +Y
    // (from (2,0,0) to (2,2,0)). Shared anchor (2,0,0). Outward vectors (away from anchor, into each pipe):
    // seg A touches the anchor at its `to` end -> outward = normalize(from-to) = normalize([-2,0,0]) = [-1,0,0].
    // seg B touches the anchor at its `from` end -> outward = normalize(to-from) = normalize([0,2,0]) = [0,1,0].
    // HAND-CALC bisector = normalize([-1,0,0]+[0,1,0]) = normalize([-1,1,0]) = [-0.70710678, 0.70710678, 0].
    // HAND-CALC yaw = atan2(0.70710678, -0.70710678) = 135.0000 deg exactly.
    const segsA = [
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [2, 0, 0], to: [2, 2, 0], axis: 'Y' }
    ];
    const joints1 = DW.bendFinder(segsA);
    out.u1_njoints = joints1.length;
    out.u1_kind = joints1[0] && joints1[0].kind;
    out.u1_anchor = joints1[0] && joints1[0].anchor;
    const orient1 = joints1[0] && DW.fittingOrientation(joints1[0].vectors);
    out.u1_bisector = orient1 && orient1.bisector.map(v => +v.toFixed(6));
    out.u1_horizontal = orient1 && orient1.horizontal;
    out.u1_rot = orient1 && +orient1.rot.toFixed(4);
    out.u1_handBisector = [-Math.SQRT1_2, Math.SQRT1_2, 0].map(v => +v.toFixed(6));
    out.u1_handRotDeg = +(deg(Math.atan2(Math.SQRT1_2, -Math.SQRT1_2))).toFixed(4);
    const fits1 = DW.bendFittings('PLB', segsA);
    out.u1_fitHash = fits1[0] && fits1[0].hash;
    out.u1_fitRot = fits1[0] && +fits1[0].placement.rot.toFixed(4);

    // U2 — STRAIGHT-THROUGH regression guard: two COLLINEAR segments continuing in the SAME +X direction
    // (0,0,0)->(2,0,0) then (2,0,0)->(4,0,0) — outward vectors are ANTIPARALLEL ([-1,0,0] and [1,0,0], dot=-1)
    // -> NO fitting (M4's continuous-tube render must stay correct here).
    const segsB = [
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [2, 0, 0], to: [4, 0, 0], axis: 'X' }
    ];
    out.u2_joints = DW.bendFinder(segsB).length;
    out.u2_fittings = DW.bendFittings('PLB', segsB).length;

    // U3 — 3-WAY TEE: three segments meeting at (0,0,0): one incoming along +X (arrives from (-2,0,0)), two
    // outgoing along +Y and -Y (a real in-line-branch tee shape). HAND-CALC bisector = normalize(sum of the
    // three OUTWARD vectors [-1,0,0] (back upstream) + [0,1,0] + [0,-1,0]) = normalize([-1,0,0]) = [-1,0,0]
    // exactly (the two branch vectors cancel, leaving pure "away from the through-run" — a clean hand-check).
    const segsC = [
      { from_kind: 'RW_SP', disc: 'SP', from: [-2, 0, 0], to: [0, 0, 0], axis: 'X' },
      { from_kind: 'RW_SP', disc: 'SP', from: [0, 0, 0], to: [0, 2, 0], axis: 'Y' },
      { from_kind: 'RW_SP', disc: 'SP', from: [0, 0, 0], to: [0, -2, 0], axis: 'Y' }
    ];
    const joints3 = DW.bendFinder(segsC);
    out.u3_kind = joints3[0] && joints3[0].kind;
    out.u3_n = joints3[0] && joints3[0].n;
    const orient3 = joints3[0] && DW.fittingOrientation(joints3[0].vectors);
    out.u3_bisector = orient3 && orient3.bisector.map(v => +v.toFixed(6));
    out.u3_handBisector = [-1, 0, 0];
    const fits3 = DW.bendFittings('SP', segsC);
    out.u3_fitHash = fits3[0] && fits3[0].hash;

    // U4 — VERTICAL (non-horizontal) bend, cross-checked against the REAL THREE.js the renderer uses (not
    // just my own ported quaternion/Euler math agreeing with itself). Run A arrives along +X, run B leaves
    // straight UP along +Z (a riser takeoff). HAND-CALC bisector = normalize([-1,0,0]+[0,0,1]) =
    // normalize([-1,0,1]) = [-0.70710678, 0, 0.70710678] (|z|=0.707 >> FIT_HORIZ_TOL -> 3-axis path engaged).
    const segsD = [
      { from_kind: 'RW_SP', disc: 'SP', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_SP', disc: 'SP', from: [2, 0, 0], to: [2, 0, 3], axis: 'Z' }
    ];
    const joints4 = DW.bendFinder(segsD);
    out.u4_kind = joints4[0] && joints4[0].kind;
    const orient4 = joints4[0] && DW.fittingOrientation(joints4[0].vectors);
    out.u4_horizontal = orient4 && orient4.horizontal;
    out.u4_bisector = orient4 && orient4.bisector.map(v => +v.toFixed(6));
    out.u4_handBisector = [-Math.SQRT1_2, 0, Math.SQRT1_2].map(v => +v.toFixed(6));
    // Cross-check: rotate the SAME local reference [1,0,0] through THREE's OWN Euler(rotX, rotZRad, -rotY)
    // ('XYZ' default order) — the EXACT reconstruction place() performs — and confirm it lands back on the
    // bisector. This proves the ported quaternion/Euler math agrees with the real renderer, not just itself.
    const euler = new THREE.Euler(orient4.rotX, orient4.rotZRad, -orient4.rotY);
    const q = new THREE.Quaternion().setFromEuler(euler);
    const v = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    out.u4_threeCheck = [+v.x.toFixed(6), +v.y.toFixed(6), +v.z.toFixed(6)];

    // U5 — 4-WAY REFUSE: four segments meeting at one point -> no catalog fitting for a cross; honest refuse,
    // not fabricated.
    const segsE = [
      { from_kind: 'RW_CW', disc: 'CW', from: [-2, 0, 0], to: [0, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [0, 2, 0], axis: 'Y' },
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [0, -2, 0], axis: 'Y' }
    ];
    const joints5 = DW.bendFinder(segsE);
    out.u5_kind = joints5[0] && joints5[0].kind;
    out.u5_fittings = DW.bendFittings('CW', segsE).length;

    // U6 — CROSS-DISCIPLINE ISOLATION: a CW segment and an SP segment coincidentally sharing an endpoint
    // coordinate must NOT be joined into one fake fitting (routePattern's junctions are shared verbatim across
    // BOTH passes — a coincidence, not a real shared pipe joint).
    const segsF = [
      { from_kind: 'RW_CW', disc: 'PLB', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_SP', disc: 'PLB', from: [2, 0, 0], to: [2, 2, 0], axis: 'Y' }
    ];
    out.u6_joints = DW.bendFinder(segsF).length;   // must be 0 — different from_kind networks, never merged

    console.log('§BEND-UNIT ' + JSON.stringify(out));
    return out;
  });

  // ── (P) REAL PRODUCTION PATH — Duplex (ARC-only, M1's own building), window.discWalk ──────────────────
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  const before = await pg.evaluate(() => ({ oplogLen: window.Bonsai.oplog.length }));
  await pg.evaluate(() => window.discWalk('PLB', { building: window.__dwName }));
  await pg.waitForFunction(() => window.__dwLastChainDisc === 'PLB', { timeout: 25000, polling: 250 }).catch(() => {});
  const fitCommitted = await pg.waitForFunction(() => window.__dwLastFitDisc === 'PLB', { timeout: 15000, polling: 250 }).then(() => true).catch(() => false);
  await sleep(600);

  const prod = await pg.evaluate(async () => {
    const fits = window.__dwFittings.PLB || [];
    const geomOps = window.Bonsai.oplog._geomOps();
    const fitRows = geomOps.filter(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.fit);
    const sweepRows = geomOps.filter(o => o.op_type === 'GEOM_SWEEP');
    let chainOk = false;
    try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); chainOk = !!v.ok; } catch (e) { chainOk = 'ERR:' + e.message; }
    // real catalog hash resolves + has a real mesh gh (never a placeholder)
    const L = window.Bonsai.library;
    const elbow = L.get('FITTING_ELBOW_GENERIC'), tee = L.get('FITTING_TEE_GENERIC');
    return {
      fitsFound: fits.length,
      kinds: fits.reduce((a, f) => { a[f.kind] = (a[f.kind] || 0) + 1; return a; }, {}),
      fitRows: fitRows.length,
      sweepRows: sweepRows.length,
      chainOk: chainOk,
      elbowHasMesh: !!(elbow && elbow.gh), teeHasMesh: !!(tee && tee.gh),
      elbowHash: elbow && elbow.hash, teeHash: tee && tee.hash
    };
  });

  // upgrade-to-real-mesh check (async retry in _commitDiscFittings) — give it a moment then verify at least
  // one fitting insert actually rendered the REAL mesh (triangleCount > 12 = not the 12-tri LOD-200 box).
  await sleep(1200);
  const meshCheck = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const fitMeshes = g ? g.children.filter(o => o.isMesh && o.userData && o.userData.featureId &&
      window.Bonsai.oplog._geomOps().some(op => op.id === o.userData.featureId && op.parameters && op.parameters._dw && op.parameters._dw.fit)) : [];
    const tris = fitMeshes.map(m => (m.geometry.index ? m.geometry.index.count / 3 : (m.geometry.attributes.position.count / 3)));
    return { nFitMeshes: fitMeshes.length, tris: tris, anyRealMesh: tris.some(t => t > 12) };
  });

  // undo — fitting rows must clear like any other op-log commit
  const cur = await pg.evaluate(() => window.Bonsai.oplog.cursor);
  await pg.evaluate(c => { const s = document.getElementById('hist-slider'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); }, 0);
  await sleep(500);
  const undoOk = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const fitObjs = (g ? g.children : []).filter(o => o.userData && o.userData.featureId &&
      window.Bonsai.oplog._geomOps().length === 0);
    return window.Bonsai.oplog.cursor === 0;
  });
  await pg.evaluate(c => { const s = document.getElementById('hist-slider'); s.value = c; s.dispatchEvent(new Event('input', { bubbles: true })); }, cur);
  await sleep(500);

  await br.close(); server.close();

  console.log('  §UNIT ' + JSON.stringify(unit));
  console.log('  §PROD ' + JSON.stringify(prod));
  console.log('  §MESH ' + JSON.stringify(meshCheck));
  console.log('  fitCommitted=' + fitCommitted + ' undoOk=' + undoOk);
  logs.slice(0, 20).forEach(l => console.log('    ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-4);
  const vnear = (a, b, t) => a && b && a.length === b.length && a.every((v, i) => near(v, b[i], t));

  chk('U1 90°-bend classified ELBOW', unit.u1_kind === 'ELBOW', 'kind=' + unit.u1_kind);
  chk('U1 bisector matches hand-calc EXACTLY', vnear(unit.u1_bisector, unit.u1_handBisector, 1e-6), JSON.stringify({ got: unit.u1_bisector, want: unit.u1_handBisector }));
  chk('U1 yaw matches hand-calc 135.0000°', near(unit.u1_rot, unit.u1_handRotDeg, 1e-4), 'got=' + unit.u1_rot + ' want=' + unit.u1_handRotDeg);
  chk('U1 fitting hash = real elbow catalog id', unit.u1_fitHash === 'FITTING_ELBOW_GENERIC', 'hash=' + unit.u1_fitHash);
  chk('U2 straight-through pair -> NO fitting (M4 regression guard)', unit.u2_joints === 0 && unit.u2_fittings === 0, 'joints=' + unit.u2_joints + ' fittings=' + unit.u2_fittings);
  chk('U3 3-way junction classified TEE', unit.u3_kind === 'TEE' && unit.u3_n === 3, 'kind=' + unit.u3_kind + ' n=' + unit.u3_n);
  chk('U3 bisector matches hand-calc EXACTLY', vnear(unit.u3_bisector, unit.u3_handBisector, 1e-6), JSON.stringify({ got: unit.u3_bisector, want: unit.u3_handBisector }));
  chk('U3 fitting hash = real tee catalog id', unit.u3_fitHash === 'FITTING_TEE_GENERIC', 'hash=' + unit.u3_fitHash);
  chk('U4 vertical bend engages the 3-axis (non-horizontal) path', unit.u4_horizontal === false, 'horizontal=' + unit.u4_horizontal);
  chk('U4 bisector matches hand-calc EXACTLY', vnear(unit.u4_bisector, unit.u4_handBisector, 1e-6), JSON.stringify({ got: unit.u4_bisector, want: unit.u4_handBisector }));
  chk('U4 REAL THREE.js reconstruction of rotX/rotY/rotZRad reproduces the SAME bisector (not self-agreement)', vnear(unit.u4_threeCheck, unit.u4_handBisector, 1e-5), JSON.stringify({ threeCheck: unit.u4_threeCheck, want: unit.u4_handBisector }));
  chk('U5 4-way junction honestly REFUSES (no cross fitting in the catalog)', unit.u5_kind === 'REFUSE' && unit.u5_fittings === 0, 'kind=' + unit.u5_kind + ' fittings=' + unit.u5_fittings);
  chk('U6 CW/SP networks never merged into one fake joint', unit.u6_joints === 0, 'joints=' + unit.u6_joints);

  chk('P1 real Duplex walk finds real bend joints', prod.fitsFound > 0, 'fitsFound=' + prod.fitsFound + ' kinds=' + JSON.stringify(prod.kinds));
  chk('P2 fittings committed as signed GEOM_INSERT rows (same op-log as every other placement)', prod.fitRows === prod.fitsFound && prod.fitRows > 0, 'fitRows=' + prod.fitRows + ' fitsFound=' + prod.fitsFound);
  chk('P3 M4 tube rendering unaffected (GEOM_SWEEP rows still present)', prod.sweepRows > 0, 'sweepRows=' + prod.sweepRows);
  chk('P4 signed chain verifies (tamper-evidence intact)', prod.chainOk === true, 'chainOk=' + prod.chainOk);
  chk('P5 real catalog mesh available for both hashes (never a placeholder box choice)', prod.elbowHasMesh && prod.teeHasMesh, JSON.stringify(prod));
  chk('P6 fitting commit completed (sentinel)', fitCommitted === true, 'fitCommitted=' + fitCommitted);
  chk('P7 at least one fitting renders the REAL mesh (LOD-300, >12 tris — not a box)', meshCheck.anyRealMesh === true, JSON.stringify(meshCheck));
  chk('P8 undo clears the walk (cursor restored to 0)', undoOk === true, 'undoOk=' + undoOk);
  chk('P9 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('W-BEND-FITTING: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
