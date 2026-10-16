#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATTERN-MESHFOR scope (read the log after every run)
 * SCOPE: bim-compiler prompts/Modeller/PATTERN_REVIEW_2026-09-27.md §B1-ROW6.
 * ISSUE UNDER TEST: 16 modeller.html sites found a mesh by featureId with a linear `g.children.find(...)` — O(n) per
 * lookup (§SCALE_CHECK_FIX measured it per command per frame at 35,818 elements). The kernel now keeps a fid→mesh map
 * and every site calls Bonsai.meshFor(fid). A refactor like this can only be trusted if it returns the SAME object.
 * Real user path: Open panel → resident (e2e_harness t.open), oplog.scrubTo re-fold (the slider handler's call), the real Clear button.
 * CLAIMS:
 *   M0 NOT-VACUOUS   — the open folded ≥ 50 featureIds (else M1-M3 judged nothing).
 *   M1 SAME-AFTER-OPEN   — for EVERY featureId (+ a missing one), meshFor(fid) === g.children.find(...). 0 mismatches.
 *   M2 SAME-AFTER-REFOLD — same, after oplog.scrubTo back + forward (the slider's own call) (foldChainToScene rebuilds every mesh object);
 *                          and the returned objects are the NEW ones (a stale map would return the pre-scrub mesh).
 *   M3 SAME-AFTER-CLEAR  — after the real Clear button (a clear done OUTSIDE the kernel), meshFor returns what find
 *                          returns (undefined) for every old featureId — a stale map would hand back a detached mesh.
 *   M4 FASTER        — §MESHFOR timing: all-fid lookups via meshFor vs the old scan on the same scene (reported; asserted
 *                      only that the map is not slower).
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const KEY = process.argv[2] || 'SampleCastle';

const cmp = (t) => t.pg.evaluate(() => {
  const g = window.Bonsai.group(); const fids = [];
  g.children.forEach(o => { if (o.isMesh && o.userData.featureId != null && fids.indexOf(o.userData.featureId) < 0) fids.push(o.userData.featureId); });
  let mism = 0; const bad = [];
  for (const f of fids.concat([-987654])) {
    const a = window.Bonsai.meshFor(f), b = g.children.find(o => o.isMesh && o.userData.featureId === f);
    if (a !== b) { mism++; if (bad.length < 5) bad.push(f); }
  }
  const uuids = {}; fids.slice(0, 50).forEach(f => { const m = window.Bonsai.meshFor(f); uuids[f] = m && m.uuid; });
  return { n: fids.length, mism, bad, uuids, fids, stats: Object.assign({}, window.Bonsai._meshForStats) };
});

runE2E('W-PATTERN-MESHFOR ' + KEY, async (t) => {
  await t.open(KEY);
  await t.pg.evaluate(() => Promise.race([window.__arcSeedReady || Promise.resolve(), new Promise(r => setTimeout(r, 120000))]));
  await t.pg.waitForFunction(() => window.Bonsai.oplog.length > 0 && window.Bonsai.group().children.length > 0, { timeout: 120000 }).catch(() => {});
  await t.sleep(1500);
  t.slog.filter(l => /§STRWALK-OPEN|§GEO-SERVED|§WALK-AFTER-SEED|§BONSAI chain/.test(l)).slice(0, 8).forEach(l => console.log('    ' + l.slice(0, 180)));
  const a = await cmp(t);
  console.log('  §MESHFOR open fids=' + a.n + ' mismatches=' + a.mism + ' bad=' + JSON.stringify(a.bad) + ' stats=' + JSON.stringify(a.stats));
  t.assert('M0 NOT-VACUOUS (≥50 featureIds folded)', a.n >= 50, 'fids=' + a.n);
  t.assert('M1 SAME-AFTER-OPEN (meshFor === children.find for every fid + a missing one)', a.n > 0 && a.mism === 0, 'mismatches=' + a.mism + '/' + (a.n + 1));

  // timing on the open scene — same fid list, same scene, old scan vs map
  const tm = await t.pg.evaluate((fids) => {
    const g = window.Bonsai.group(); const R = 5;
    let t0 = performance.now(); let k = 0;
    for (let r = 0; r < R; r++) for (const f of fids) { if (g.children.find(o => o.isMesh && o.userData.featureId === f)) k++; }
    const scanMs = performance.now() - t0;
    t0 = performance.now(); let j = 0;
    for (let r = 0; r < R; r++) for (const f of fids) { if (window.Bonsai.meshFor(f)) j++; }
    const mapMs = performance.now() - t0;
    return { lookups: R * fids.length, children: g.children.length, scanMs: +scanMs.toFixed(1), mapMs: +mapMs.toFixed(1), k, j };
  }, a.fids);
  console.log('  §MESHFOR timing lookups=' + tm.lookups + ' children=' + tm.children + ' scanMs=' + tm.scanMs + ' mapMs=' + tm.mapMs + ' found=' + tm.k + '/' + tm.j);
  t.assert('M4 FASTER (map ≤ scan, same found count)', tm.lookups > 0 && tm.mapMs <= tm.scanMs && tm.k === tm.j, 'scan ' + tm.scanMs + 'ms vs map ' + tm.mapMs + 'ms over ' + tm.lookups + ' lookups');

  const o0 = await t.oplog();
  // Re-fold via bonsai_oplog.scrubTo — the SAME call the #hist-slider handler makes (scrubToShared → oplog.scrubTo →
  // foldChainToScene). The slider itself is not usable here: after a resident Open it reads max=0 (measured, logged below)
  // because the seed commit does not sync it; scrubTo is the re-fold under test either way.
  const sl = await t.pg.evaluate(() => { const s = document.getElementById('hist-slider'); return { min: +s.min, max: +s.max, value: +s.value }; });
  const nMesh = () => t.pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh && o.userData.featureId != null).length);
  await t.pg.evaluate(c => window.Bonsai.oplog.scrubTo(c), Math.max(0, o0.cur - 1));
  const nMid = await nMesh();
  await t.pg.evaluate(c => window.Bonsai.oplog.scrubTo(c), o0.cur);
  await t.sleep(1000);
  console.log('  §MESHFOR slider ' + JSON.stringify(sl) + ' oplog=' + JSON.stringify(o0) + ' meshes open=' + a.n + ' mid-scrub=' + nMid + ' after=' + (await nMesh()));
  const b = await cmp(t);
  const same = Object.keys(a.uuids).filter(f => b.uuids[f] && b.uuids[f] === a.uuids[f]).length;
  console.log('  §MESHFOR refold scrubTo ' + o0.cur + '→' + (o0.cur - 1) + '→' + o0.cur + ' fids=' + b.n + ' mismatches=' + b.mism + ' sameUuidAsPreScrub=' + same + ' stats=' + JSON.stringify(b.stats));
  t.assert('M2 SAME-AFTER-REFOLD (0 mismatches, and meshFor returns the NEW mesh objects)', b.mism === 0 && b.n > 0 && same === 0, 'mismatches=' + b.mism + ' fids=' + b.n + ' stale-uuid=' + same);

  const oldFids = b.fids;
  await t.clickSel('#b-clear'); await t.sleep(800);
  const c = await t.pg.evaluate((fids) => {
    const g = window.Bonsai.group(); let mism = 0, defined = 0;
    for (const f of fids) { const x = window.Bonsai.meshFor(f), y = g.children.find(o => o.isMesh && o.userData.featureId === f); if (x !== y) mism++; if (x) defined++; }
    return { children: g.children.length, mism, defined };
  }, oldFids);
  console.log('  §MESHFOR clear children=' + c.children + ' oldFids=' + oldFids.length + ' mismatches=' + c.mism + ' stillReturned=' + c.defined);
  t.assert('M3 SAME-AFTER-CLEAR (no detached mesh handed back)', c.mism === 0 && c.defined === 0 && oldFids.length > 0, JSON.stringify(c));
});
