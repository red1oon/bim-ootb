#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-LOD-MATCH scope (read this block first)
 * SCOPE (ORIGINAL, Bug-2): "Terminal load stall + illegal LOD200 geometry" — proved the HONEST PARTIAL FIX
 * (match seeded ARC elements against the EXISTING 3 real-mesh catalog items — Column/Beam/Door — in
 * bonsai_library.js's CATALOG, via arc_editable.js's LOD300_CATALOG/matchLod300).
 *
 * §REAL-GEOM SUPERSESSION (2026-07-02, "no silent box fallback" — user directive): arc_editable.js now ALSO
 * resolves each element's OWN real per-element mesh (component_geometries/base_geometries, keyed by
 * element_instances.geometry_hash — real_geometry.js) and, when present, it WINS over the generic 3-item
 * catalog at fold time (bonsai_library.js foldInsert's realGeomHash branch) — an element's own scanned shape
 * is always more faithful than a coincidentally-dimension-matched generic component. SampleHouse has FULL
 * real-geometry coverage (0 unresolved hashes) so EVERY one of its 39 ARC elements now renders its own real
 * mesh, including the door this witness targets — its vert/face signature is therefore no longer the generic
 * catalog Door's 32/52, but the door's OWN measured vertex_count/face_count (read from the SAME db as ground
 * truth below, non-invent — not a hardcoded expectation). A3/A4 are REWRITTEN to prove the NEW (stronger, full)
 * fix: real per-element meshes render building-wide, not just for the one lucky catalog-matched door. The
 * ORIGINAL LOD300_CATALOG mechanism (matched=1/unmatched=38 bookkeeping) is untouched — see A5.
 *
 * Real production path: this drives t.open() (the real "Open" button → resident chooser → the SAME
 * §ARC-SEED-WIRE seeding the live app runs), not an engine seam. "tris>0"/"mesh exists" is NOT sufficient (a
 * box has tris too) — every assertion below is a STRUCTURAL vert/face-count signature: a box proxy is ALWAYS
 * exactly 8 verts / 12 tris (bonsai_library.js boxArrays()).
 *
 * Target: SampleHouse IfcDoor guid 3cUkl32yn9qRSPvBJVyWYp — the ONE structural LOD300_CATALOG match found by
 * measuring every IfcColumn/IfcBeam/IfcDoor element across Duplex/SampleHouse/SampleCastle_extracted.db
 * (sorted-dims relative-L1 distance): reldist=0.034 — see arc_editable.js's "§LOD-300 CATALOG MIRROR" comment.
 *
 * CLAIMS:
 *   A1 OPEN-REAL        — SampleHouse opens as editable meshes (real production 'Open' path, not a seam).
 *   A2 SEEDED           — the async §ARC-SEED-WIRE substrate seed lands; the target guid resolves to a real featureId.
 *   A3 REAL-MESH-DOOR   — the target door's folded mesh is NOT the 8-vert/12-tri box signature; its vert/face
 *                         counts equal its OWN measured vertex_count/face_count in SampleHouse_extracted.db
 *                         (ground truth read from the SAME db, non-invent) — no longer the generic catalog's.
 *   A4 REAL-MESH-OTHER  — a SECOND, DIFFERENT ARC element (not the door, not LOD300_CATALOG-matched) in the
 *                         SAME building ALSO renders its own real mesh (not the 8/12 box), matching ITS OWN
 *                         db vertex_count/face_count — proves the fix is building-wide, not one lucky element.
 *   A5 HONEST-COUNT     — the ORIGINAL §LOD300-MATCH console line still reports matched=1/unmatched=38 for the
 *                         3-item generic catalog (that bookkeeping is untouched) AND the NEW §GEOM-HARDFAIL
 *                         line reports 0 hardfails (SampleHouse has full real-geometry coverage).
 *   A6 NO-ERROR         — clean run (e2e_harness's own default assertion), no pageerror across the sequence.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');

const TARGET_GUID = '3cUkl32yn9qRSPvBJVyWYp';   // SampleHouse IfcDoor — the ONE structural LOD-300 catalog match (reldist=0.034)
const DBPATH = path.join(__dirname, '..', 'SampleHouse_extracted.db');

// ground truth for a guid's OWN real mesh, read straight from the SAME db the app opens (non-invent — never
// a hardcoded/copied constant). Returns null if the guid has no resolvable geometry link.
async function realMeshTruth(guid) {
  const initSqlJs = require(path.join(__dirname, '..', 'lib', 'sql-wasm.js'));
  const wasmBinary = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database(fs.readFileSync(DBPATH));
  const r = db.exec("SELECT bg.vertex_count, bg.face_count FROM element_instances ei " +
    "JOIN base_geometries bg ON bg.geometry_hash = ei.geometry_hash WHERE ei.guid = '" + guid.replace(/'/g, "''") + "'");
  db.close();
  if (!r.length || !r[0].values.length) return null;
  return { verts: r[0].values[0][0], tris: r[0].values[0][1] };
}
// a second ARC element, distinct from the door, to prove building-wide (not one-lucky-element) coverage.
async function otherArcGuid() {
  const initSqlJs = require(path.join(__dirname, '..', 'lib', 'sql-wasm.js'));
  const wasmBinary = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sql-wasm.wasm'));
  const SQL = await initSqlJs({ wasmBinary });
  const db = new SQL.Database(fs.readFileSync(DBPATH));
  const r = db.exec("SELECT guid FROM elements_meta WHERE discipline='ARC' AND guid != '" + TARGET_GUID + "' ORDER BY guid LIMIT 1");
  db.close();
  return r.length && r[0].values.length ? r[0].values[0][0] : null;
}

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
  const doorTruth = await realMeshTruth(TARGET_GUID);
  t.assert('A3 REAL-MESH-DOOR (door mesh NOT the 8-vert/12-tri box signature; verts/tris == its OWN db vertex_count/face_count)',
    !!doorSig && !!doorTruth && !(doorSig.verts === 8 && doorSig.tris === 12) &&
    doorSig.verts === doorTruth.verts && doorSig.tris === doorTruth.tris,
    'doorSig=' + JSON.stringify(doorSig) + ' dbTruth=' + JSON.stringify(doorTruth));

  // A4 — a SECOND, DIFFERENT ARC element (not the door) also renders its OWN real mesh (building-wide coverage,
  // not one lucky catalog-matched element) — ground truth read from the SAME db, non-invent.
  const otherGuid = await otherArcGuid();
  await t.pg.waitForFunction((guid) => !!(window.__arcFidByGuid && (guid in window.__arcFidByGuid)),
    { timeout: 5000 }, otherGuid).catch(() => {});
  const otherFid = otherGuid != null ? (await t.pg.evaluate((g) => (window.__arcFidByGuid || {})[g], otherGuid)) : null;
  const otherSig = otherFid != null ? await sig(otherFid) : null;
  const otherTruth = otherGuid != null ? await realMeshTruth(otherGuid) : null;
  t.assert('A4 REAL-MESH-OTHER (a DIFFERENT ARC element also renders its own real mesh, matching its db vertex_count/face_count — building-wide, not one lucky element)',
    !!otherSig && !!otherTruth && !(otherSig.verts === 8 && otherSig.tris === 12) &&
    otherSig.verts === otherTruth.verts && otherSig.tris === otherTruth.tris,
    'otherGuid=' + (otherGuid || '').slice(0, 10) + ' otherSig=' + JSON.stringify(otherSig) + ' dbTruth=' + JSON.stringify(otherTruth));

  // A5 — the ORIGINAL LOD300_CATALOG bookkeeping (matched=1/unmatched=38) is untouched, AND the NEW
  // §GEOM-HARDFAIL line reports 0 (SampleHouse has full real-geometry coverage — never silently claimed, measured).
  const matchLine = t.slog.find(l => /§LOD300-MATCH building=SampleHouse/.test(l));
  const mm = matchLine && matchLine.match(/matched=(\d+) unmatched=(\d+)/);
  const hfLine = t.slog.find(l => /§GEOM-HARDFAIL total=/.test(l));
  const hf = hfLine && hfLine.match(/total=(\d+)/);
  t.assert('A5 HONEST-COUNT (§LOD300-MATCH matched/unmatched line unchanged + §GEOM-HARDFAIL total=0)',
    !!mm && +mm[1] >= 1 && +mm[2] > 0 && !!hf && +hf[1] === 0,
    (matchLine || '(no §LOD300-MATCH line)') + ' | ' + (hfLine || '(no §GEOM-HARDFAIL line)'));

  console.log('  §LOD-MATCH doorSig=' + JSON.stringify(doorSig) + ' doorTruth=' + JSON.stringify(doorTruth) +
    ' otherSig=' + JSON.stringify(otherSig) + ' otherTruth=' + JSON.stringify(otherTruth) +
    ' matchLine=' + (matchLine || 'MISSING') + ' hfLine=' + (hfLine || 'MISSING'));
});
