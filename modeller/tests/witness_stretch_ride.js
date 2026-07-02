#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-STRETCH-RIDE: §STRETCH-RIDE value witness (PURE NODE, REAL SampleHouse).
 * Implementing RESUME_CASCADE_INTO_STRETCH.md §STRETCH-RIDE — Witness: W-STRETCH-RIDE. Read the log after every run.
 *
 * Issue under test: gridmove.elementData() feeds EVERY authored mesh to the GridKinematicEngine tagged 'IfcWall' —
 * doors/windows included — so the engine classifies fillings INDEPENDENTLY of their host wall. A filling could
 * receive its own TRANSLATE (divorcing from a scaled host) or its own SCALE (a stretched door — wrong).
 * SdgCascade.stretchRide overrides the engine's independent view with the REAL rel_fills_host relation: strip the
 * rider's own commands, induce ONE move from the HOST's commands (anchored-min mapping, same as the fold).
 *
 * Substrate is REAL: SampleHouse_extracted.db rel_fills_host rows (CrossEdges), the §ARC-1 seed bridge
 * (ArcEditable.seedArc), and pre-stretch AABBs measured off the REAL foldInsert geometry (bonsai_library).
 *
 *   T1 TRANSLATE-EXACT — host TRANSLATE d ⇒ rider delta EXACTLY d on that axis (0 on others); rider−host offset
 *                        invariant under the ride (proves: no divorce on a translated host).
 *   T2 SCALE-PROPORTIONAL — host SCALE ⇒ rider centre remapped so (c−m)/extent is preserved math-exact; the rider
 *                        receives NO scale (extent unchanged — riders carry only dx/dy/dz); its own engine command
 *                        is STRIPPED; new centre stays inside the folded (production-fold) host footprint
 *                        (proves: no stretched door, no divorce, fold-consistent).
 *   T3 ROSETTA          — apply the stretch then its exact inverse ⇒ rider centre returns to start within 1e-9
 *                        (proves: the ride is invertible, no drift accumulates).
 *   T4 NON-INVENT       — an element with NO rel_fills_host edge gets NO induced move and keeps its own commands;
 *                        a filling whose HOST has no command keeps its own command too (attached on its own merit)
 *                        (proves: rides ONLY on recovered edges, never a heuristic).
 *   T5 STACKED          — TRANSLATE then SCALE on the same host, in order, compose to the closed-form expected
 *                        centre f·(c+d) + (m+d)(1−f) + t (proves: in-order composition matches the fold's replay).
 */
'use strict';
var fs = require('fs'), path = require('path');
global.window = global.window || {};
global.fetch = undefined;
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;

var ROOT = path.join(__dirname, '..');
var ArcEditable = require(path.join(ROOT, 'arc_editable.js'));
var SdgCascade = require(path.join(ROOT, 'sdg_cascade.js'));
var CrossEdges = require(path.join(ROOT, 'cross_edges.js'));
require(path.join(ROOT, 'kernel_ops.js'));
require(path.join(ROOT, 'bonsai_library.js'));
var KernelOps = global.window.KernelOps, Library = global.window.Bonsai.library;
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
var DBPATH = path.join(ROOT, 'SampleHouse_extracted.db');

var pass = 0, fail = 0;
function chk(n, c, e) { if (c) { pass++; console.log('  ✅ ' + n + (e ? '  ' + e : '')); } else { fail++; console.log('  ❌ ' + n + (e ? '  ' + e : '')); } }
function bboxOf(positions) {
  var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (var i = 0; i < positions.length; i += 3) for (var k = 0; k < 3; k++) { if (positions[i + k] < mn[k]) mn[k] = positions[i + k]; if (positions[i + k] > mx[k]) mx[k] = positions[i + k]; }
  return [mn[0], mx[0], mn[1], mx[1], mn[2], mx[2]];   // the _gateBoxes shape
}
function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
// withinXY — mirrors sdg_gate.js's own oracle (point-in-box on X AND Y, tol=0.05): a door's CENTRE inside its
// host's plan footprint. The T2c fix (2026-07-02) picks its host/door PAIR by this SAME pre-check the production
// gate uses, instead of blindly taking fills[0] — see witness header T2 note + RESUME_CASCADE_INTO_STRETCH.md
// §STRETCH-RIDE 2026-07-02 update (SampleHouse host=3 has TWO filling rows; door=13 fails this pre-check even
// BEFORE any edit — a real multi-segment-wall extraction characteristic the production gate would never flag
// either way, so it is the WRONG pair to test "stays inside" against; door=7 passes and is the honest pick).
function withinXY(box, pt, tol) {
  tol = tol || 0;
  return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol;
}

initSqlJs({ wasmBinary: wasmBinary }).then(async function (SQL) {
  console.log('═══ W-STRETCH-RIDE — openings ride grid-stretch via rel_fills_host (node, REAL SampleHouse) ═══');
  var bdb = new SQL.Database(fs.readFileSync(DBPATH));

  // §ARC-1 substrate: seed → ops + fid↔guid bridge; REAL fills edges from CrossEdges
  var oplog = new SQL.Database();
  var seed = await ArcEditable.seedArc(bdb, {
    commitGroup: function (ops, gid) { return KernelOps.commitGroup(oplog, ops, { gid: gid, baseTs: 1700000000000 }); },
    building: 'SampleHouse'
  });
  var fbg = seed.bridge.fidByGuid, gbf = seed.bridge.guidByFid;
  var opByFid = {}; seed.ops.forEach(function (o) { opByFid[fbg[o.outputGuid]] = o; });
  var fills = CrossEdges.deriveAll(bdb).fills;

  // REAL pre-stretch AABBs off the production fold (every seeded fid), the boxByFid input
  var boxByFid = {};
  Object.keys(opByFid).forEach(function (fid) {
    boxByFid[fid] = bboxOf(Library.foldInsert({ id: +fid, op_type: 'GEOM_INSERT', parameters: opByFid[fid].params }, null).positions);
  });
  // pick a REAL host→filling pair with both endpoints seeded AND genuinely hosted pre-stretch (T2c fix, 2026-07-02):
  // SampleHouse host=3 has TWO filling rows ({door=13} + {door=7}); fills[0] happened to be door=13, whose real AABB
  // centre sits ~0.44m outside host=3's own x-range even BEFORE any stretch — not a bug, a real multi-segment-wall
  // extraction characteristic the production gate's own pre-check (sdg_gate.js withinXY, tol=0.05) would also
  // decline to guard. Select programmatically the SAME way the gate does, so the witness stays robust to db changes.
  var edge = fills.find(function (e) {
    var hf = fbg[e.host_guid], rf = fbg[e.filling_guid];
    if (hf == null || rf == null || !boxByFid[hf] || !boxByFid[rf]) return false;
    return withinXY(boxByFid[hf], centreOf(boxByFid[rf]), 0.05);
  });
  var hostFid = fbg[edge.host_guid], doorFid = fbg[edge.filling_guid];
  var fillFids = {}; fills.forEach(function (e) { if (fbg[e.filling_guid] != null) fillFids[fbg[e.filling_guid]] = 1; if (fbg[e.host_guid] != null) fillFids[fbg[e.host_guid]] = 1; });
  var loneFid = +Object.keys(opByFid).find(function (f) { return !fillFids[f]; });
  chk('T0 substrate: seeded bridge + real fills + host/door/lone picked',
    seed.committed > 0 && fills.length > 0 && hostFid != null && doorFid != null && loneFid != null && boxByFid[hostFid] && boxByFid[doorFid],
    'seeded=' + seed.committed + ' fills=' + fills.length + ' host=' + hostFid + ' door=' + doorFid + ' lone=' + loneFid);

  var hb = boxByFid[hostFid], rb = boxByFid[doorFid];
  var c0 = centreOf(rb), h0 = centreOf(hb);

  // ── T1: host TRANSLATE d → rider delta EXACT; offset invariant ──────────────────────────────────
  var D = 1.25;
  var r1 = SdgCascade.stretchRide([{ featureId: hostFid, action: 'TRANSLATE', axis: 'x', delta: D }], gbf, fbg, fills, boxByFid);
  var rid1 = r1.riders.find(function (r) { return r.featureId === doorFid; });
  var hostKept = r1.commands.some(function (c) { return c.featureId === hostFid; });
  chk('T1 host TRANSLATE → rider delta EXACT (same axis, same d); host command kept; offset invariant',
    rid1 && rid1.dx === D && rid1.dy === 0 && rid1.dz === 0 && hostKept &&
    Math.abs(((c0[0] + rid1.dx) - (h0[0] + D)) - (c0[0] - h0[0])) === 0,
    'rider=' + JSON.stringify(rid1));

  // ── T2: host SCALE → rider proportional, NOT scaled, own command STRIPPED, inside folded host ───
  var f = 1.4, t = 0;                                       // far-edge stretch: newScale=f, translateDelta=0
  var scaleCmd = { featureId: hostFid, action: 'SCALE', axis: 'x', newScale: f, translateDelta: t, edge: 'far' };
  var engineDoorCmd = { featureId: doorFid, action: 'SCALE', axis: 'x', newScale: 1.2, translateDelta: 0, edge: 'far' };   // the BUG: the engine's independent view of the filling
  var r2 = SdgCascade.stretchRide([scaleCmd, engineDoorCmd], gbf, fbg, fills, boxByFid);
  var rid2 = r2.riders.find(function (r) { return r.featureId === doorFid; });
  var doorStripped = !r2.commands.some(function (c) { return c.featureId === doorFid; });
  // expected mapping: c' = f·c + m·(1−f) + t, m = host min x
  var m = hb[0], ext = hb[1] - hb[0];
  var cExp = f * c0[0] + m * (1 - f) + t;
  // ratio preserved: (c−m)/ext == (c'−m')/(f·ext), m' = m + t
  var ratio0 = (c0[0] - m) / ext, ratio1 = ((c0[0] + (rid2 ? rid2.dx : NaN)) - (m + t)) / (f * ext);
  // fold-consistency: fold the HOST through the PRODUCTION gridCmds branch → rider centre must land inside it
  var hostFolded = bboxOf(Library.foldInsert({ id: hostFid, op_type: 'GEOM_INSERT', parameters: opByFid[hostFid].params }, null, [scaleCmd]).positions);
  var cNew = c0[0] + (rid2 ? rid2.dx : NaN);
  chk('T2a host SCALE → rider centre remapped proportionally ((c−m)/extent preserved, math-exact)',
    rid2 && Math.abs(cNew - cExp) < 1e-12 && Math.abs(ratio0 - ratio1) < 1e-12,
    'c ' + c0[0].toFixed(4) + '→' + cNew.toFixed(4) + ' ratio ' + ratio0.toFixed(6) + '→' + ratio1.toFixed(6));
  chk('T2b rider receives NO scale (induced move only — extent can never change) + own engine cmd STRIPPED',
    rid2 && !('newScale' in rid2) && rid2.dy === 0 && rid2.dz === 0 && doorStripped &&
    r2.commands.length === 1 && r2.commands[0].featureId === hostFid,
    'riders carry only dx/dy/dz; commands=' + JSON.stringify(r2.commands.map(function (c) { return c.featureId + ':' + c.action; })));
  // T2c fix (2026-07-02): the door only receives a delta on the command's OWN axis (x here — T2b proved dy=dz=0),
  // so the honest containment check is TWO-axis point-in-box (mirrors sdg_gate.js withinXY, tol=0.05) — x against
  // the host's SCALED range, y against the host's (unchanged) y-range as a sanity that this pair is genuinely
  // hosted, not just x-lucky.
  var ptAfter = [cNew, c0[1], c0[2]];
  chk('T2c rider centre stays inside the PRODUCTION-fold stretched host footprint on BOTH axes (X scaled, Y unchanged sanity) — mirrors sdg_gate.js withinXY tol=0.05',
    rid2 && ptAfter[0] >= hostFolded[0] - 0.05 && ptAfter[0] <= hostFolded[1] + 0.05 &&
    ptAfter[1] >= hb[2] - 0.05 && ptAfter[1] <= hb[3] + 0.05 &&
    Math.abs((hostFolded[1] - hostFolded[0]) - f * ext) < 1e-6,
    'c\'=[' + ptAfter[0].toFixed(4) + ',' + ptAfter[1].toFixed(4) + '] hostFoldedX=[' + hostFolded[0].toFixed(4) + ',' + hostFolded[1].toFixed(4) + '] hostY=[' + hb[2].toFixed(4) + ',' + hb[3].toFixed(4) + ']');
  // T2d — the ACTUAL "no door-out RED" proof: replicate sdg_gate.js's own door-out oracle inline (line ~78:
  // `withinXY(before[h], centre(before[f]), 0.05) && !withinXY(after[h], centre(after[f]), 0.05)` ⇒ RED) over this
  // REAL host/door pair. The pair must (a) genuinely qualify pre-stretch (preHosted true — proves door=7 is the
  // honest pick, not door=13) and (b) the gate's own check must find it STILL hosted after the ride (no RED fires).
  var preHosted = withinXY(hb, c0, 0.05);
  var afterHosted = withinXY(hostFolded, ptAfter, 0.05);
  var gateWouldFireDoorOut = preHosted && !afterHosted;
  chk('T2d gate-equivalent (sdg_gate.js door-out oracle replicated inline): pair genuinely hosted pre-stretch AND stays hosted post-ride ⇒ no door-out RED for a legitimate stretch',
    preHosted && afterHosted && !gateWouldFireDoorOut,
    'preHosted=' + preHosted + ' afterHosted=' + afterHosted + ' doorOutRED=' + gateWouldFireDoorOut);

  // ── T3: rosetta — stretch then exact inverse → rider centre back to start within 1e-9 ──────────
  // post-stretch state: host box mapped by the anchored-min SCALE; rider box shifted by its induced delta
  var boxAfter = {}; Object.keys(boxByFid).forEach(function (k) { boxAfter[k] = boxByFid[k].slice(); });
  boxAfter[hostFid] = hostFolded;
  boxAfter[doorFid] = [rb[0] + rid2.dx, rb[1] + rid2.dx, rb[2], rb[3], rb[4], rb[5]];
  var inv = { featureId: hostFid, action: 'SCALE', axis: 'x', newScale: 1 / f, translateDelta: 0, edge: 'far' };
  var r3 = SdgCascade.stretchRide([inv], gbf, fbg, fills, boxAfter);
  var rid3 = r3.riders.find(function (r) { return r.featureId === doorFid; });
  var cBack = (boxAfter[doorFid][0] + boxAfter[doorFid][1]) / 2 + (rid3 ? rid3.dx : NaN);
  chk('T3 rosetta: stretch f then 1/f → rider centre returns to start (≤1e-9)',
    rid3 && Math.abs(cBack - c0[0]) <= 1e-9, 'err=' + Math.abs(cBack - c0[0]).toExponential(2));

  // ── T4: non-invent — no edge ⇒ no ride, no strip; filling whose host has NO command keeps its own ──
  var loneCmd = { featureId: loneFid, action: 'SCALE', axis: 'x', newScale: 1.3, translateDelta: 0 };
  var r4a = SdgCascade.stretchRide([loneCmd], gbf, fbg, fills, boxByFid);
  var r4b = SdgCascade.stretchRide([{ featureId: doorFid, action: 'TRANSLATE', axis: 'x', delta: 0.5 }], gbf, fbg, fills, boxByFid);
  chk('T4 non-invent: no rel_fills_host edge → no induced move + own commands NOT stripped; door whose host has NO command keeps its own command',
    r4a.riders.length === 0 && r4a.commands.length === 1 && r4a.commands[0] === loneCmd &&
    r4b.riders.length === 0 && r4b.commands.length === 1 && r4b.commands[0].featureId === doorFid,
    'lone kept=' + r4a.commands.length + ' doorOwn kept=' + r4b.commands.length);

  // ── T5: stacked TRANSLATE then SCALE on the same host, in order ─────────────────────────────────
  var r5 = SdgCascade.stretchRide([
    { featureId: hostFid, action: 'TRANSLATE', axis: 'x', delta: D },
    scaleCmd
  ], gbf, fbg, fills, boxByFid);
  var rid5 = r5.riders.find(function (r) { return r.featureId === doorFid; });
  var cExp5 = f * (c0[0] + D) + (m + D) * (1 - f) + t;      // closed form: translate both c and m, then anchored-min scale
  chk('T5 stacked TRANSLATE→SCALE compose in order to the closed-form centre',
    rid5 && Math.abs((c0[0] + rid5.dx) - cExp5) < 1e-12,
    'c\'=' + (c0[0] + (rid5 ? rid5.dx : NaN)).toFixed(6) + ' want=' + cExp5.toFixed(6));

  console.log('W-STRETCH-RIDE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}).catch(function (e) { console.error('WITNESS ERROR', e && e.stack || e); process.exit(1); });
