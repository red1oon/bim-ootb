#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ARC-3AXIS: the §ARC-3AXIS seed rotation reaches the rendered mesh, on real data.
 *
 * THE ISSUE THIS PROVES OR DISPROVES (MODELLER_MASTER.md row 28): the shipped `SampleCastle_ARC.db`
 * carries 293 elements with a non-zero `rotation_y`, and a live measurement on 2026-07-10 reported them
 * "rendering with IDENTITY transforms" while `§ARC-3AXIS` code sat on main — a code-vs-measurement
 * contradiction nobody had resolved. This witness resolves it, and then GUARDS it.
 *
 * WHY THE OBVIOUS TEST IS WRONG (and was tried first, 2026-09-15): comparing the rendered world AABB
 * against `element_transforms.bbox_*` proves NOTHING. extractIFCtoDB.py:181 defines those columns as the
 * WORLD AABB extent (`maxK-minK`), so they already include the rotation — the two sides agree whether or
 * not the renderer applied anything. That is a green computed over the wrong quantity, the §PRIME LESSON
 * shape. The discriminating quantity is the PRE-PLACEMENT mesh: the real geo-db mesh's own stored bbox.
 *
 *   localExt  = the registered real mesh's stored bbox extent, BEFORE place()
 *   worldExt  = the rendered mesh's world AABB, AFTER fold
 *   authored  = element_transforms.bbox_* (the extractor's world AABB — ground truth)
 *
 *   localExt ≈ authored                    → PRE-ROTATED: nothing to apply, carries no information
 *   localExt ≉ authored ∧ worldExt ≈ authored → the rotation WAS applied (correct)
 *   localExt ≉ authored ∧ worldExt ≈ localExt → the rotation was DROPPED (row 28's defect) ⇒ RED
 *
 *   R1 SUBSTRATE   — every sampled element resolves a REAL per-element mesh (no box fallback, else the
 *                    whole measurement is meaningless: a box has no orientation to lose).
 *   R2 CONTROL     — the ~2.3k same-class elements with rotation_y=0 are ALL pre-rotated and carry NO
 *                    rotation in their op. If this fails the instrument cannot tell the cases apart and
 *                    NOTHING below may be reported.
 *   R3 SEEDED      — every rotation_y≠0 element's GEOM_INSERT carries placement.rotX/rotY.
 *   R4 NOT-DROPPED — ZERO tilted elements render at their un-rotated local extent. ← the row-28 assertion
 *   R5 NON-VACUOUS — at least 100 tilted elements GENUINELY needed the rotation (localExt ≉ authored),
 *                    so R4 is a real constraint and not a tautology. A witness that cannot fail is not a
 *                    witness: falsify R4 by neutering bonsai_library.js place()'s `pl.rotX || pl.rotY`
 *                    branch — R4 then reports the exact count that regressed.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
const TOL = 0.02;                       // 2% of the authored extent — the geo mesh is the same solid, re-tessellated
const CLASSES = "('IfcCovering','IfcWindow','IfcWall','IfcDoor','IfcWallStandardCase','IfcRailing')";

runE2E('W-ARC-3AXIS', async (t) => {
  await t.open('SampleCastle');

  const R = await t.pg.evaluate((tol, classes) => {
    if (!window.__dwBuf || !window.SQL) return { err: 'no __dwBuf / window.SQL' };
    const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const q = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
    const rows = (where) => q(
      "SELECT t.guid, t.bbox_x, t.bbox_y, t.bbox_z FROM element_transforms t " +
      "JOIN elements_meta m ON m.guid = t.guid WHERE m.ifc_class IN " + classes + " AND " + where);
    const tilted = rows("abs(COALESCE(t.rotation_y,0)) > 1e-6");
    const flat   = rows("abs(COALESCE(t.rotation_y,0)) <= 1e-6");
    db.close();

    const g = window.Bonsai.group(), FB = window.__arcFidByGuid || {}, L = window.Bonsai.library;
    const byFid = {}; for (const o of window.Bonsai.oplog._geomOps()) byFid[o.id] = o;
    const rel = (a, b) => Math.max.apply(null, [0, 1, 2].map(i =>
      b[i] > 1e-6 ? Math.abs(a[i] - b[i]) / b[i] : (a[i] < 1e-6 ? 0 : 9)));

    function scan(list) {
      const out = { n: list.length, real: 0, seeded: 0, pre: 0, applied: 0, dropped: 0, other: 0, missing: 0 };
      for (const v of list) {
        const guid = v[0], authored = [v[1], v[2], v[3]];
        const fid = FB[guid]; if (fid == null) { out.missing++; continue; }
        const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
        if (!m) { out.missing++; continue; }
        const P = byFid[fid] ? byFid[fid].parameters : null;
        const store = (P && P.realGeomHash && L && L._geom) ? L._geom['rg:' + P.realGeomHash] : null;
        if (!store || !store.bbox) continue;                 // no real mesh → not counted as real
        out.real++;
        if (P.placement && (P.placement.rotX || P.placement.rotY)) out.seeded++;
        const bb = store.bbox, localExt = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
        const b3 = new window.THREE.Box3().setFromObject(m), sz = new window.THREE.Vector3(); b3.getSize(sz);
        const worldExt = [sz.x, sz.y, sz.z];
        if (rel(localExt, authored) <= tol) out.pre++;
        else if (rel(worldExt, authored) <= tol) out.applied++;
        else if (rel(worldExt, localExt) <= tol) out.dropped++;
        else out.other++;
      }
      return out;
    }
    return { tilted: scan(tilted), flat: scan(flat) };
  }, TOL, CLASSES);

  t.assert('R0 QUERYABLE (the open building\'s own DB is readable in-page)', !R.err, R.err || 'ok');
  if (R.err) return;
  const T = R.tilted, F = R.flat;
  console.log('  §ARC3AXIS-TILTED ' + JSON.stringify(T));
  console.log('  §ARC3AXIS-FLAT   ' + JSON.stringify(F));

  t.assert('R1 SUBSTRATE (every tilted element resolves a REAL mesh — not a box, which has no orientation to lose)',
    T.n > 0 && T.real === T.n, 'tilted n=' + T.n + ' real=' + T.real + ' missing=' + T.missing);
  t.assert('R2 CONTROL (every rotation_y=0 element is pre-rotated and carries NO op rotation — the instrument discriminates)',
    F.real > 100 && F.pre === F.real && F.seeded === 0 && F.dropped === 0,
    'flat real=' + F.real + ' pre=' + F.pre + ' seeded=' + F.seeded + ' dropped=' + F.dropped);
  t.assert('R3 SEEDED (§ARC-3AXIS: every tilted element\'s GEOM_INSERT carries placement.rotX/rotY)',
    T.seeded === T.real, 'seeded=' + T.seeded + ' of real=' + T.real);
  t.assert('R4 NOT-DROPPED (row 28: ZERO tilted elements render at their un-rotated local extent)',
    T.dropped === 0 && T.other === 0, 'dropped=' + T.dropped + ' other=' + T.other + ' applied=' + T.applied + ' pre=' + T.pre);
  t.assert('R5 NON-VACUOUS (R4 is a real constraint — ≥100 tilted elements genuinely needed the rotation)',
    T.applied >= 100, 'genuinely-rotated=' + T.applied + ' (pre-rotated, carry no information=' + T.pre + ')');
});
