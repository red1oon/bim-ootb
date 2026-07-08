#!/usr/bin/env node
// witness_arc_boxfallback_rotation.js -- SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §7/§9/§10: proves the
// CONFIRMED box-fallback double-rotation bug is fixed (arc_editable.js's `_localBoxSizeFromWorldYawOnly`).
//
// SYNTHETIC, clearly labeled as such: no ARC-only resident onboarded so far has a rotated (exact 90/270
// yaw) element with NO real geometry link (every tested resident's rotated elements all resolve to real
// geometry, boxFallback=0 per the M3 witness) -- so this bug has never actually rendered wrong in practice
// yet. This witness builds a minimal in-memory db with NO geometry tables at all (forcing the box-fallback
// path for every row) using the SAME real numbers §9 already confirmed (a real Duplex wall's own measured
// bbox_x/y/z=(0.417,17.383,3.1), rotation_z=-90deg) -- the INPUT numbers are real/measured, only the
// "this element has no geometry link" condition is synthesized.
'use strict';
var initSqlJs = require('sql.js');
var ArcEditable = require('../arc_editable.js');

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  // minimal schema arc_editable.js's buildSeedOps expects -- no geometry table at all (geomIdx.table stays
  // null), so every row takes the box-fallback path unconditionally.
  db.run('CREATE TABLE elements_meta (id INTEGER PRIMARY KEY, guid TEXT, ifc_class TEXT, discipline TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, ' +
    'bbox_x REAL, bbox_y REAL, bbox_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL)');
  // real, measured numbers (SPEC_MESH_FIT_GRAFT_HEAL_ENGINE.md §9's own hand-traced Duplex example)
  const REAL_BX = 0.417, REAL_BY = 17.383, REAL_BZ = 3.1, REAL_RZ = -Math.PI / 2;
  const REAL_CX = 8.5915, REAL_CY = -0.417, REAL_CZ = 0;
  db.run("INSERT INTO elements_meta VALUES (1, 'synthetic-guid-1', 'IfcWallStandardCase', 'ARC')");
  db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)',
    ['synthetic-guid-1', REAL_CX, REAL_CY, REAL_CZ, REAL_BX, REAL_BY, REAL_BZ, 0, 0, REAL_RZ]);

  const result = ArcEditable.buildSeedOps(db);
  if (!result.ops.length) { console.error('§W-BOXFALLBACK FATAL no ops produced'); process.exit(1); }
  const op = result.ops[0];
  console.log('§W-BOXFALLBACK op.params.bbox(local)=' + op.params.bbox.map(v => v.toFixed(4)).join(','));
  console.log('§W-BOXFALLBACK op.params.placement=' + JSON.stringify(op.params.placement));

  // replicate bonsai_library.js place()'s OWN documented ground-seat formula (cs*x-sn*y, sn*x+cs*y; rot in
  // DEGREES, matches arc_editable.js's own `rot: rz*180/Math.PI` conversion, quoted in this file's own
  // comments) -- an independent re-application of the SAME real formula, not a different assumption.
  const bb = op.params.bbox, pl = op.params.placement;
  const rad = (pl.rot || 0) * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  const corners = [];
  for (const x of [bb[0], bb[1]]) for (const y of [bb[2], bb[3]]) for (const z of [bb[4], bb[5]]) corners.push([x, y, z]);
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  corners.forEach(([x, y]) => {
    const wx = cs * x - sn * y + pl.x, wy = sn * x + cs * y + pl.y;
    if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
    if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
  });
  const worldWidthX = mxx - mnx, worldWidthY = mxy - mny;
  console.log('§W-BOXFALLBACK world_footprint X_width=' + worldWidthX.toFixed(4) + ' Y_width=' + worldWidthY.toFixed(4) +
    ' (true measured: X=' + REAL_BX.toFixed(4) + ' Y=' + REAL_BY.toFixed(4) + ')');

  // pre-fix, this would have reported X_width=17.383 (== REAL_BY) and Y_width=0.417 (== REAL_BX) --
  // axis-swapped, matching §9's own hand-traced "8.69m wide where the real building is 0.417m wide" finding
  // (half-width 8.6915 * 2 = 17.383). Post-fix: X_width must match REAL_BX, Y_width must match REAL_BY.
  const xOk = Math.abs(worldWidthX - REAL_BX) < 1e-6;
  const yOk = Math.abs(worldWidthY - REAL_BY) < 1e-6;
  const notSwapped = Math.abs(worldWidthX - REAL_BY) > 0.01;   // guard: didn't just coincidentally pass while still swapped
  const pass = xOk && yOk && notSwapped;
  console.log('§W-BOXFALLBACK RESULT ' + (pass ? 'PASS' : 'FAIL') + ' (xOk=' + xOk + ' yOk=' + yOk + ' notSwapped=' + notSwapped + ')');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-BOXFALLBACK FATAL', e); process.exit(1); });
