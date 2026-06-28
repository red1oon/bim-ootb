#!/usr/bin/env node
/**
 * W-ARC-EDITABLE — §ARC-1 value witness (RESUME_ARC_EDITABLE_SUBSTRATE.md). PURE NODE (sql.js, no browser):
 * prove the REAL ARC building seeds as gizmo-editable, guid-carrying GEOM_INSERT op-rows, landing on the MEASURED
 * geometry with NO invention. Exercises the REAL foldInsert (raw-bbox path) + REAL KernelOps.commitGroup.
 *
 * Issue under test: the modeller's editable scene was synthetic-only — real walls/doors were never editable meshes,
 * so the SDG cascade had no wall to grab. This proves the substrate now exists AND the featureId↔guid bridge is real.
 *
 * Checks (all assert the canvas-visible / data fact, no compute-then-pass):
 *   A1 count          — N ARC seedable elements in db ⇒ N GEOM_INSERT ops committed (skips logged + counted)
 *   A2 bridge         — every output_guid ∈ db guids; fid↔guid bijective; round-trips
 *   A3 position       — folded mesh WORLD CENTRE == element_transforms.center_xyz within 1e-6 (NO constant offset)
 *   A4 bbox           — seed op box extent == measured (bbox_x,y,z) exact; folded AABB extent == measured for rot≈0
 *   A5 gizmo-ready    — folded mesh featureId == its op id (selectable + GEOM_MOVE-able)
 *   A6 persisted guid — kernel_ops.output_guid == the real guid (replay-stable bridge, queryable by featureId)
 *   A7 idempotent     — re-seed (same gid) ⇒ same op count, idempotent flag, bridge unchanged
 *   A8 honest skip    — an element with NULLed bbox is SKIPPED (not boxed), logged, excluded from the count
 */
'use strict';
var fs = require('fs'), path = require('path');

// ── node shims so the window-IIFE modules load + the catalog fetch stays inert (no network) ──
global.window = global.window || {};
global.fetch = undefined;                 // bonsai_library: typeof fetch!=='function' ⇒ catalog Promise.resolve(false)
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;   // node 18: webcrypto not global

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
require(path.join(ROOT, 'kernel_ops.js'));            // → window.KernelOps
require(path.join(ROOT, 'bonsai_library.js'));        // → window.Bonsai.library
var KernelOps = global.window.KernelOps;
var Library = global.window.Bonsai.library;

var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function approx(a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-6 : tol); }

// AABB centre + full extent of a foldInsert position buffer (Float32 x,y,z).
function aabb(positions) {
  var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (var i = 0; i < positions.length; i += 3) for (var k = 0; k < 3; k++) {
    var c = positions[i + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c;
  }
  return { cx: (mn[0] + mx[0]) / 2, cy: (mn[1] + mx[1]) / 2, cz: (mn[2] + mx[2]) / 2,
           ex: mx[0] - mn[0], ey: mx[1] - mn[1], ez: mx[2] - mn[2] };
}

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-ARC-EDITABLE — §ARC-1 editable ARC substrate + guid bridge (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));

  // ground truth: measured ARC elements (with bbox) + their transforms, keyed by guid
  var truth = {}, guidSet = {};
  var gr = bdb.exec("SELECT m.guid, m.ifc_class, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y,t.bbox_z, t.rotation_z " +
    "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='ARC'");
  var arcTotal = 0;
  if (gr.length) gr[0].values.forEach(function (v) {
    guidSet[v[0]] = 1;
    if (v[5] > 0 && v[6] > 0 && v[7] > 0 && v[2] != null) {
      arcTotal++;
      truth[v[0]] = { cls: v[1], cx: v[2], cy: v[3], cz: v[4], bx: v[5], by: v[6], bz: v[7], rz: v[8] || 0 };
    }
  });
  // all db guids (for output_guid ⊆ db-guids membership)
  var allGuids = {}; var ar = bdb.exec("SELECT guid FROM elements_meta"); if (ar.length) ar[0].values.forEach(function (v) { allGuids[v[0]] = 1; });

  // ── seed via the REAL KernelOps.commitGroup on a fresh oplog db ──
  var oplog = new SQL.Database();
  var commitGroup = function (opsArray, gid) {
    return KernelOps.commitGroup(oplog, opsArray, { gid: gid, baseTs: 1700000000000 });
  };
  var seed = await ArcEditable.seedArc(bdb, { commitGroup: commitGroup, building: 'SampleHouse' });

  // A1 — count
  chk('A1 every ARC element seeded (N db ⇒ N GEOM_INSERT ops, no silent drop)',
    arcTotal > 0 && seed.committed === arcTotal && seed.ops.length === arcTotal,
    'arcTotal=' + arcTotal + ' committed=' + seed.committed);

  // A2 — bridge bijective + membership + round-trip
  var fids = Object.values(seed.bridge.fidByGuid), guids = Object.keys(seed.bridge.fidByGuid);
  var allMembers = guids.every(function (g) { return allGuids[g] === 1; });
  var bijective = new Set(fids).size === fids.length && new Set(guids).size === guids.length && fids.length === seed.committed;
  var roundTrips = guids.every(function (g) { return seed.bridge.guidByFid[seed.bridge.fidByGuid[g]] === g; });
  chk('A2 featureId↔guid bridge bijective + all guids real + round-trips',
    allMembers && bijective && roundTrips, 'fids=' + fids.length + ' guids=' + guids.length);

  // A3/A4/A5 — fold every seed op through the REAL foldInsert (raw-bbox path) and check geometry fidelity
  var posOk = 0, boxConstrOk = 0, foldExtentOk = 0, fidOk = 0, rotZeroN = 0, n = seed.ops.length;
  seed.ops.forEach(function (op) {
    var g = op.outputGuid, T = truth[g], fid = seed.bridge.fidByGuid[g];
    var d = Library.foldInsert({ id: fid, op_type: 'GEOM_INSERT', parameters: op.params });
    var bb = aabb(d.positions);
    if (approx(bb.cx, T.cx) && approx(bb.cy, T.cy) && approx(bb.cz, T.cz)) posOk++;        // world centre == measured (rot-invariant)
    // construction-level: the seed box extent == measured bbox (exact)
    var pe = op.params.bbox;
    if (approx(pe[1] - pe[0], T.bx) && approx(pe[3] - pe[2], T.by) && approx(pe[5] - pe[4], T.bz)) boxConstrOk++;
    // geometry-level extent: only axis-aligned (rot≈0) boxes keep AABB == measured
    if (approx(T.rz % 360, 0, 1e-3) || approx(Math.abs(T.rz % 360), 360, 1e-3)) {
      rotZeroN++;
      if (approx(bb.ex, T.bx) && approx(bb.ey, T.by) && approx(bb.ez, T.bz)) foldExtentOk++;
    }
    if (d.featureId === fid) fidOk++;
  });
  chk('A3 folded mesh world-centre == measured center_xyz within 1e-6 (NO invented offset)', posOk === n, posOk + '/' + n);
  chk('A4 seed box extent == measured bbox (exact) + rot≈0 AABB extent == measured', boxConstrOk === n && foldExtentOk === rotZeroN && rotZeroN > 0,
    'boxConstr=' + boxConstrOk + '/' + n + ' foldExtent=' + foldExtentOk + '/' + rotZeroN);
  chk('A5 each folded mesh carries featureId == its op id (gizmo-selectable + GEOM_MOVE-able)', fidOk === n, fidOk + '/' + n);

  // A6 — output_guid persisted on kernel_ops, queryable by featureId(=id)
  var persisted = 0, persistOk = true;
  seed.ops.forEach(function (op) {
    var fid = seed.bridge.fidByGuid[op.outputGuid];
    var r = oplog.exec('SELECT output_guid FROM kernel_ops WHERE id=' + fid);
    var og = r.length ? r[0].values[0][0] : null;
    if (og === op.outputGuid) persisted++; else persistOk = false;
  });
  chk('A6 kernel_ops.output_guid == real guid for every seed op (replay-stable bridge)', persistOk && persisted === n, persisted + '/' + n);

  // A7 — idempotent re-seed (same gid → no double-seed, bridge unchanged)
  var seed2 = await ArcEditable.seedArc(bdb, { commitGroup: commitGroup, building: 'SampleHouse' });
  var rowCount = oplog.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0];
  var bridgeSame = JSON.stringify(seed2.bridge.fidByGuid) === JSON.stringify(seed.bridge.fidByGuid);
  chk('A7 idempotent re-seed: same op count, idempotent flag, bridge unchanged',
    seed2.committed === seed.committed && rowCount === n && bridgeSame, 'rows=' + rowCount + ' committed2=' + seed2.committed);

  // A8 — honest skip: NULL a bbox on a clone → that element is skipped (not boxed), count drops by 1
  var cdb = new SQL.Database(fs.readFileSync(DBPATH));
  var victim = Object.keys(truth)[0];
  cdb.run("UPDATE element_transforms SET bbox_x=NULL WHERE guid='" + victim + "'");
  var built2 = ArcEditable.buildSeedOps(cdb);
  var skippedVictim = built2.skipped.some(function (s) { return s.guid === victim && s.reason === 'no-bbox'; });
  chk('A8 NULL-bbox element SKIPPED (not fabricated), logged, excluded from count',
    skippedVictim && built2.ops.length === arcTotal - 1, 'ops=' + built2.ops.length + ' (was ' + arcTotal + ') skipped=' + built2.skipped.length);

  console.log('W-ARC-EDITABLE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
