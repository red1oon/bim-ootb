#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-LOD-MATCH scope (read this block first)
 * SCOPE: Bug-2 "Terminal load stall + illegal LOD200 geometry" — proves the HONEST PARTIAL FIX (user-approved
 * scope: match seeded ARC elements against the EXISTING 3 real-mesh catalog items — Column/Beam/Door — in
 * bonsai_library.js's CATALOG, via arc_editable.js's LOD300_CATALOG/matchLod300). Real production path: this
 * drives t.open() (the real "Open" button → resident chooser → the SAME §ARC-SEED-WIRE seeding the live app
 * runs), not an engine seam. "tris>0"/"mesh exists" is NOT sufficient (a box has tris too) — every assertion
 * below is a STRUCTURAL vert/face-count signature: a box proxy is ALWAYS exactly 8 verts / 12 tris
 * (bonsai_library.js boxArrays()); a real catalog mesh has a different count (Column vc=16/fc=24, Beam
 * vc=16/fc=24, Door vc=32/fc=52 — read directly off bonsai_library.js's CATALOG, non-invent).
 *
 * Target: SampleHouse IfcDoor guid 3cUkl32yn9qRSPvBJVyWYp — the ONE structural match found by measuring every
 * IfcColumn/IfcBeam/IfcDoor element across Duplex/SampleHouse/SampleCastle_extracted.db against the 3 catalog
 * items (sorted-dims relative-L1 distance): reldist=0.034, more than 2× closer than the next-nearest candidate
 * (SampleCastle IfcBeam, reldist=0.074) — see arc_editable.js's "§LOD-300 CATALOG MIRROR" comment for the full
 * data-driven tolerance derivation (LOD300_TOL=0.05). Not cherry-picked: it is simply the best-matching element
 * in any resident building.
 *
 * CLAIMS:
 *   A1 OPEN-REAL       — SampleHouse opens as editable meshes (real production 'Open' path, not a seam).
 *   A2 SEEDED          — the async §ARC-SEED-WIRE substrate seed lands; the target guid resolves to a real featureId.
 *   A3 MATCHED-REAL    — the target door's folded mesh is NOT the 8-vert/12-tri box signature; its vert/face
 *                         counts equal the matched catalog Door entry's own vc/fc (32/52) exactly.
 *   A4 UNMATCHED-BOX   — regression guard: a DIFFERENT (unmatched-class) ARC element in the SAME building still
 *                         renders the 8-vert/12-tri box signature — the partial fix did not silently touch
 *                         unrelated geometry.
 *   A5 HONEST-COUNT    — a §LOD300-MATCH console line reports the whole building's matched/unmatched tally
 *                         (matched ≥1, unmatched >0 — the gap stays visible, never silently "fixed").
 *   A6 NO-ERROR        — clean run (e2e_harness's own default assertion), no pageerror across the sequence.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const TARGET_GUID = '3cUkl32yn9qRSPvBJVyWYp';   // SampleHouse IfcDoor — the ONE structural LOD-300 match (reldist=0.034)
const DOOR_VC = 32, DOOR_FC = 52;               // catalog "Double glassdoor" vc/fc — copied from bonsai_library.js CATALOG (non-invent)

runE2E('W-E2E-LOD-MATCH', async (t) => {
  await t.open('SampleHouse');

  // A1 — real open (editable meshes present)
  const editable = await t.pg.evaluate(() =>
    window.Bonsai.group().children.filter(o => o.isMesh && o.userData && o.userData.featureId != null).length);
  t.assert('A1 OPEN-REAL (editable meshes)', editable > 0, 'meshes=' + editable);

  // the ARC substrate seed (§ARC-SEED-WIRE) runs async after open — wait for the bridge to carry the target guid
  await t.pg.waitForFunction(
    (guid) => !!(window.__arcFidByGuid && (guid in window.__arcFidByGuid)),
    { timeout: 15000 }, TARGET_GUID
  ).catch(() => {});
  await t.sleep(300);

  const bridge = await t.pg.evaluate(() => (window.__arcFidByGuid || null));
  const targetFid = bridge ? bridge[TARGET_GUID] : null;
  t.assert('A2 SEEDED (target guid resolves to a real featureId)', targetFid != null, 'fid=' + targetFid);

  // structural signature reader: verts + tris of a fid's LIVE folded mesh (the real scene graph, not computed-then-passed)
  const sig = (fid) => t.pg.evaluate((f) => {
    const g = window.Bonsai.group();
    const m = g.children.find(o => o.isMesh && o.userData && o.userData.featureId === f);
    if (!m) return null;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    return { verts: pos ? pos.count : 0, tris: idx ? idx.count / 3 : (pos ? pos.count / 3 : 0), hash: m.userData.hash || null };
  }, fid);

  const doorSig = targetFid != null ? await sig(targetFid) : null;
  t.assert('A3 MATCHED-REAL (door mesh NOT the 8-vert/12-tri box signature; verts/tris == catalog Door vc/fc)',
    !!doorSig && !(doorSig.verts === 8 && doorSig.tris === 12) && doorSig.verts === DOOR_VC && doorSig.tris === DOOR_FC,
    'doorSig=' + JSON.stringify(doorSig) + ' expected verts=' + DOOR_VC + ' tris=' + DOOR_FC);

  // A4 — regression guard: some OTHER (unmatched-class) ARC element in the SAME building still renders the box signature
  const other = await t.pg.evaluate((skipFid) => {
    const g = window.Bonsai.group();
    for (const o of g.children) {
      if (!o.isMesh || !o.userData || o.userData.featureId == null || o.userData.featureId === skipFid) continue;
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      const verts = pos ? pos.count : 0, tris = idx ? idx.count / 3 : 0;
      if (verts === 8 && tris === 12) return { fid: o.userData.featureId, verts, tris };
    }
    return null;
  }, targetFid);
  t.assert('A4 UNMATCHED-BOX (a different ARC element still renders the 8/12 box signature — regression guard)',
    !!other, JSON.stringify(other));

  // A5 — honest matched/unmatched tally logged for the WHOLE building (never silently claimed "fixed")
  const matchLine = t.slog.find(l => /§LOD300-MATCH building=SampleHouse/.test(l));
  const mm = matchLine && matchLine.match(/matched=(\d+) unmatched=(\d+)/);
  t.assert('A5 HONEST-COUNT (§LOD300-MATCH matched/unmatched line for the whole building)',
    !!mm && +mm[1] >= 1 && +mm[2] > 0, matchLine || '(no §LOD300-MATCH line captured)');

  console.log('  §LOD-MATCH doorSig=' + JSON.stringify(doorSig) + ' otherBoxSig=' + JSON.stringify(other) +
    ' matchLine=' + (matchLine || 'MISSING'));
});
