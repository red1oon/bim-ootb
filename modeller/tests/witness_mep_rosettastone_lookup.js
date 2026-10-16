#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MEP-ROSETTASTONE scope (read this block first)
 * SCOPE: prompts/Modeller/DISC_Walker/DISC_ROSETTASTONE_MEP_MINISET.md Task 4 + docs/internal/WalkerDoctrine.md
 *   §7 — disc_walker.js's `bendFittings` now checks a REAL mini-BOM RosettaStone lookup
 *   (`lookupRealFitting`/`MEP_REAL_FITTINGS`) BEFORE falling back to `fittingOrientation`'s bisector trig.
 *   This gate proves TWO things, each naming the issue it disproves/proves:
 *   (a) LANDED PATH REAL: a discovered TEE joint (3-way, bendFinder's own classification) gets the REAL
 *       extracted rotation from mep_rosettastone_miniset.db's tee row (rotX=π/2 exactly, not the ~-45°
 *       bisector M5 would have computed) — i.e. the "replay, don't recompute" mechanism actually fires and
 *       the numbers match the ground-truth artifact exactly, not approximately.
 *   (b) FALLBACK IS HONEST, NOT DEAD CODE: a discovered ELBOW joint (2-way, a REAL directional turn) has NO
 *       matching real reference in this tiny (2-piece) set — lookupRealFitting('ELBOW',2,..) genuinely
 *       returns null — so it falls back to the bisector AND is flagged low-confidence
 *       (prov='computed:bisector-lowconfidence', landed=false). This is proven BOTH at the unit level and on
 *       the REAL Duplex production walk (window.discWalk('PLB',...)), so the fallback is a reachable live
 *       path, not a synthetic-only branch.
 *   Also proves: the COAXIAL/transition real reference (not reachable via bendFinder's own detection today —
 *   a real, disclosed gap, see disc_walker.js's own comment above MEP_REAL_FITTINGS) is directly callable and
 *   returns the exact real compound rotation; a topology mismatch (kind OR n differs) never cross-matches;
 *   diameter-band narrowing works when >1 candidate ties on topology (exercised via a temporary in-process
 *   fixture candidate, restored after — the real dataset has no such ambiguity today, disclosed not hidden).
 * Log Mandate: every claim below is backed by a printed § line, read from THIS run's own log, not assumed.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
// Same local-server fixture trick as witness_bend_fitting.js (mep_rw.db / dagevu_catalog isolated-modeller
// deploy-path gap, documented there — reused verbatim here, not re-derived).
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  let fp = path.join(ROOT, p);
  if (p === '/modeller/mep_rw.db' && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', 'mep_rw.db');
  if ((p === '/modeller/dagevu_catalog.json' || p === '/modeller/dagevu_geometries.json') && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', path.basename(p));
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

// Ground-truth constants — read directly from prompts/Modeller/DISC_Walker/mep_rosettastone_miniset.db
// (mep_run_piece id=3 tee, id=4 transition), quoted here for the assertion, not re-derived.
const GT = {
  tee: { rotation_x: 1.5707963267949, rotation_y: 0, rotation_z: 0, guid: 'T0_Terminal_1c33yVIIL358EhW_$Ep9bA' },
  transition: { rotation_x: -1.5707963267949, rotation_y: 1.5707963267949, rotation_z: 0, guid: 'T0_Terminal_1c33yVIIL358EhW_$Ep9bx' }
};

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const logs = []; pg.on('console', m => { const t = m.text(); if (/^§(DW-FIT-COMMIT|BEND|MEP-RS)/.test(t)) logs.push(t); });

  console.log('═══ W-MEP-ROSETTASTONE — real mini-BOM lookup ahead of bisector fallback ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function" && !!window.DiscWalker', { timeout: 30000 }).catch(() => {});

  // ── UNIT / HAND-CALCULATED — pure math over disc_walker.js, no building ────────────────────────────────
  const unit = await pg.evaluate((GT) => {
    const DW = window.DiscWalker, out = {};

    // L1 — 3-way TEE (identical synthetic segs to M5's own U3 case): a real in-line-branch tee shape. Before
    // this task, bendFittings would have used fittingOrientation's bisector (normalize([-1,0,0]) here, a
    // near-miss vs the real ~135deg-off case documented in WalkerDoctrine.md §7). Now it must be LANDED.
    const segsC = [
      { from_kind: 'RW_SP', disc: 'SP', from: [-2, 0, 0], to: [0, 0, 0], axis: 'X' },
      { from_kind: 'RW_SP', disc: 'SP', from: [0, 0, 0], to: [0, 2, 0], axis: 'Y' },
      { from_kind: 'RW_SP', disc: 'SP', from: [0, 0, 0], to: [0, -2, 0], axis: 'Y' }
    ];
    const fitsTee = DW.bendFittings('SP', segsC);
    out.l1_n = fitsTee.length;
    out.l1_landed = fitsTee[0] && fitsTee[0].landed;
    out.l1_prov = fitsTee[0] && fitsTee[0].prov;
    out.l1_realMatch = fitsTee[0] && fitsTee[0].realMatch;
    out.l1_realGuid = fitsTee[0] && fitsTee[0].realSourceGuid;
    out.l1_rotX = fitsTee[0] && fitsTee[0].placement.rotX;
    out.l1_rotZRad = fitsTee[0] && fitsTee[0].placement.rotZRad;
    out.l1_rotY = fitsTee[0] && fitsTee[0].placement.rotY;

    // L2 — 2-way ELBOW with a REAL directional turn (M5's own U1 case, 90° horizontal bend). The tiny real
    // reference set has NO turning-elbow entry (only a TEE and a COAXIAL/no-turn transition) — this MUST
    // fall back to the bisector, unchanged from M5's original behaviour, and be flagged low-confidence.
    const segsA = [
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [2, 0, 0], to: [2, 2, 0], axis: 'Y' }
    ];
    const fitsElbow = DW.bendFittings('CW', segsA);
    out.l2_n = fitsElbow.length;
    out.l2_landed = fitsElbow[0] && fitsElbow[0].landed;
    out.l2_prov = fitsElbow[0] && fitsElbow[0].prov;
    out.l2_rot = fitsElbow[0] && +fitsElbow[0].placement.rot.toFixed(4);
    out.l2_bisector = fitsElbow[0] && fitsElbow[0].bisector.map(v => +v.toFixed(6));

    // L3 — direct lookup of the COAXIAL/transition reference (not reachable via bendFinder's own detection
    // today — disclosed gap, see disc_walker.js comment above MEP_REAL_FITTINGS). Proves the real value is
    // there and correct, callable directly, not silently dropped from the mini-set.
    const trans = DW.lookupRealFitting('COAXIAL', 2, null);
    out.l3_found = !!trans;
    out.l3_key = trans && trans.key;
    out.l3_rotation = trans && [trans.rotation_x, trans.rotation_y, trans.rotation_z];
    out.l3_guid = trans && trans.source_guid;

    // L4 — topology mismatch never cross-matches: no real ELBOW (turning, n=2) reference exists.
    out.l4_null = DW.lookupRealFitting('ELBOW', 2, null) === null;
    // L5 — n mismatch: the real TEE is n=3, never matches a bare n=2 query even with the same 'TEE' label
    // (there is no n=2 TEE in the set, but assert the shape check is n-strict, not label-only).
    out.l5_null = DW.lookupRealFitting('TEE', 2, null) === null;

    // L6 — diameter-band narrowing, exercised via a TEMPORARY in-process fixture candidate (the real
    // dataset has exactly one COAXIAL entry today, so there is no live ambiguity to narrow — disclosed, not
    // hidden). Push a second fake COAXIAL candidate with a disjoint diameter band, confirm the hint correctly
    // picks between them, then restore the array exactly (no persisted change).
    const beforeLen = DW.MEP_REAL_FITTINGS.length;
    DW.MEP_REAL_FITTINGS.push({ key: 'FAKE_TEST_ONLY_NOT_REAL', kind: 'COAXIAL', n: 2, diaMin: 0.5, diaMax: 0.9,
      rotation_x: 9, rotation_y: 9, rotation_z: 9, source_guid: 'TEST-FIXTURE', source: 'unit-test-only, not a real extraction' });
    out.l6_matchReal = DW.lookupRealFitting('COAXIAL', 2, 0.05).key;   // inside real transition's band [0.0056,0.1132]
    out.l6_matchFake = DW.lookupRealFitting('COAXIAL', 2, 0.7).key;    // inside fake's band [0.5,0.9]
    DW.MEP_REAL_FITTINGS.length = beforeLen;                            // restore — no persisted mutation
    out.l6_restored = DW.MEP_REAL_FITTINGS.length === beforeLen;

    // L7 — regression guard: straight-through pair (M5's U2 case) still yields ZERO fittings; the new lookup
    // must not turn a genuine no-fitting continuation into a spurious match.
    const segsB = [
      { from_kind: 'RW_CW', disc: 'CW', from: [0, 0, 0], to: [2, 0, 0], axis: 'X' },
      { from_kind: 'RW_CW', disc: 'CW', from: [2, 0, 0], to: [4, 0, 0], axis: 'X' }
    ];
    out.l7_fittings = DW.bendFittings('CW', segsB).length;

    console.log('§MEP-RS-UNIT ' + JSON.stringify(out));
    return out;
  }, GT);

  // ── REAL PRODUCTION PATH — Duplex (M5's own building), window.discWalk ─────────────────────────────────
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(1500);

  await pg.evaluate(() => window.discWalk('PLB', { building: window.__dwName }));
  await pg.waitForFunction(() => window.__dwLastChainDisc === 'PLB', { timeout: 25000, polling: 250 }).catch(() => {});
  const fitCommitted = await pg.waitForFunction(() => window.__dwLastFitDisc === 'PLB', { timeout: 15000, polling: 250 }).then(() => true).catch(() => false);
  await sleep(600);

  const prod = await pg.evaluate((GT) => {
    const fits = window.__dwFittings.PLB || [];
    const teeFits = fits.filter(f => f.kind === 'TEE');
    const elbowFits = fits.filter(f => f.kind === 'ELBOW');
    const geomOps = window.Bonsai.oplog._geomOps();
    const fitOps = geomOps.filter(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw && o.parameters._dw.fit);
    return {
      fitsFound: fits.length,
      teeCount: teeFits.length, elbowCount: elbowFits.length,
      teeAllLanded: teeFits.length > 0 && teeFits.every(f => f.landed === true && f.prov === 'landed:mep-rosettastone'),
      teeRotMatchesGT: teeFits.length > 0 && teeFits.every(f =>
        Math.abs(f.placement.rotX - GT.tee.rotation_x) < 1e-9 &&
        Math.abs(f.placement.rotZRad - GT.tee.rotation_y) < 1e-9 &&
        Math.abs(f.placement.rotY - (-GT.tee.rotation_z)) < 1e-9),
      elbowAllComputed: elbowFits.length > 0 && elbowFits.every(f => f.landed === false && f.prov === 'computed:bisector-lowconfidence'),
      opRowsCarryProvenance: fitOps.length > 0 && fitOps.every(o => 'landed' in o.parameters._dw && 'prov' in o.parameters._dw),
      opLandedCount: fitOps.filter(o => o.parameters._dw.landed === true).length,
      opComputedCount: fitOps.filter(o => o.parameters._dw.landed === false).length
    };
  }, GT);

  await br.close(); server.close();

  console.log('  §UNIT ' + JSON.stringify(unit));
  console.log('  §PROD ' + JSON.stringify(prod));
  console.log('  fitCommitted=' + fitCommitted);
  logs.slice(0, 20).forEach(l => console.log('    ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  const near = (a, b, t) => Math.abs(a - b) <= (t || 1e-9);

  // (a) LANDED PATH REAL — proves the mechanism replaces a would-be-wrong bisector with the real value
  chk('L1 TEE joint gets a REAL match (landed=true)', unit.l1_landed === true, 'landed=' + unit.l1_landed);
  chk('L1 prov flagged landed:mep-rosettastone', unit.l1_prov === 'landed:mep-rosettastone', 'prov=' + unit.l1_prov);
  chk('L1 realMatch key = the real tee reference', unit.l1_realMatch === 'TEE_THREADED_FP', 'realMatch=' + unit.l1_realMatch);
  chk('L1 realSourceGuid = the real extracted GUID', unit.l1_realGuid === GT.tee.guid, 'guid=' + unit.l1_realGuid);
  chk('L1 rotX EXACTLY matches ground-truth mep_run_piece.rotation_x (π/2)', near(unit.l1_rotX, GT.tee.rotation_x), 'got=' + unit.l1_rotX + ' want=' + GT.tee.rotation_x);
  chk('L1 rotZRad EXACTLY matches ground-truth rotation_y (0)', near(unit.l1_rotZRad, GT.tee.rotation_y), 'got=' + unit.l1_rotZRad);
  chk('L1 rotY EXACTLY matches -ground-truth rotation_z (-0)', near(unit.l1_rotY, -GT.tee.rotation_z), 'got=' + unit.l1_rotY);

  // (b) FALLBACK IS HONEST, NOT DEAD CODE — a real, live gap (no turning-elbow reference), not fabricated
  chk('L2 ELBOW joint has NO real match -> falls back (landed=false)', unit.l2_landed === false, 'landed=' + unit.l2_landed);
  chk('L2 prov flagged computed:bisector-lowconfidence', unit.l2_prov === 'computed:bisector-lowconfidence', 'prov=' + unit.l2_prov);
  chk('L2 fallback rotation UNCHANGED from M5 (135° bisector, no regression)', unit.l2_rot === 135, 'rot=' + unit.l2_rot);

  chk('L3 COAXIAL/transition real reference directly callable + correct', unit.l3_found && unit.l3_key === 'TRANSITION_REDUCER_FP', JSON.stringify({ found: unit.l3_found, key: unit.l3_key }));
  chk('L3 transition rotation EXACTLY matches ground-truth (-π/2, π/2, 0)', unit.l3_rotation && near(unit.l3_rotation[0], GT.transition.rotation_x) && near(unit.l3_rotation[1], GT.transition.rotation_y) && near(unit.l3_rotation[2], GT.transition.rotation_z), JSON.stringify(unit.l3_rotation));
  chk('L3 realSourceGuid = the real extracted transition GUID', unit.l3_guid === GT.transition.guid, 'guid=' + unit.l3_guid);
  chk('L4 topology KIND mismatch never cross-matches (no real turning ELBOW exists)', unit.l4_null === true, 'l4_null=' + unit.l4_null);
  chk('L5 topology N mismatch never cross-matches (TEE is n=3, not n=2)', unit.l5_null === true, 'l5_null=' + unit.l5_null);
  chk('L6 diameter-band narrows correctly among ties (real vs fixture)', unit.l6_matchReal === 'TRANSITION_REDUCER_FP' && unit.l6_matchFake === 'FAKE_TEST_ONLY_NOT_REAL', JSON.stringify({ real: unit.l6_matchReal, fake: unit.l6_matchFake }));
  chk('L6 test fixture candidate fully restored (no persisted mutation)', unit.l6_restored === true, 'restored=' + unit.l6_restored);
  chk('L7 straight-through regression guard (M5 U2) unaffected — still 0 fittings', unit.l7_fittings === 0, 'fittings=' + unit.l7_fittings);

  chk('P1 real Duplex walk finds both TEE and ELBOW joints (both paths exercised live)', prod.teeCount > 0 && prod.elbowCount > 0, JSON.stringify({ tee: prod.teeCount, elbow: prod.elbowCount }));
  chk('P2 EVERY real TEE joint landed from the real reference (not bisector)', prod.teeAllLanded === true, 'teeAllLanded=' + prod.teeAllLanded);
  chk('P3 every landed TEE rotation matches ground-truth exactly', prod.teeRotMatchesGT === true, 'teeRotMatchesGT=' + prod.teeRotMatchesGT);
  chk('P4 EVERY real ELBOW joint honestly fell back to bisector, flagged low-confidence (fallback reachable in production, not dead code)', prod.elbowAllComputed === true, 'elbowAllComputed=' + prod.elbowAllComputed);
  chk('P5 committed GEOM_INSERT op-log rows carry landed/prov provenance', prod.opRowsCarryProvenance === true, 'opRowsCarryProvenance=' + prod.opRowsCarryProvenance);
  chk('P6 committed op counts match in-memory landed/computed split', prod.opLandedCount === prod.teeCount && prod.opComputedCount === prod.elbowCount, JSON.stringify(prod));
  chk('P7 fitting commit completed (sentinel)', fitCommitted === true, 'fitCommitted=' + fitCommitted);
  chk('P8 NO-ERROR', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('W-MEP-ROSETTASTONE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
