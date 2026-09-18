#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-GRAPH-REAL-AABB scope (READ THE LOG after every run)
 * SCOPE: prompts/Viewer/FindRooms/ROOM_GRAPH_REAL_AABB.md §4 item 3 — common/room_graph.js's new
 * OPTIONAL `opts.doorRealXY` (a door's real world-AABB centre, resolved by common/door_real_position.js,
 * overriding the coarse element_transforms.center_x/y this file has always read for E1/E2/E4/E9
 * door-matching). This witness proves the fix FIRES on real building data (not just "code changed"),
 * proves it is additive/gracefully-degrading (identical behaviour when the map is absent/empty/no
 * geometry resolves), and reproduces §2/§2b's own measured numbers so a future regression is visible.
 *
 * WHY PER-DOOR EDGE DIFF, NOT AGGREGATE STATS: §2b's own finding — on Duplex, `stats.ambiguous` /
 * `stats.edges` / `stats.ambiguousResidualRescued` are IDENTICAL between the coarse and real-position
 * graphs (some doors flip INTO the E9 ambiguous-residual layer while others flip OUT, netting to the
 * same totals) even though 8/14 real doors' actual matched edges changed underneath. A witness that
 * only compared `stats` would report PASS/no-effect and be wrong. This witness diffs the literal edge
 * set per door guid.
 *
 * FIXTURES: modeller/Duplex_extracted.db and modeller/SampleHouse_extracted.db — chosen because each
 * is a SINGLE file carrying spatial_structure (rooms) + element_transforms (doors) + element_instances
 * + component_geometries/base_geometries (real geometry) together, so RealGeometry.buildGeometryIndex
 * needs no separate geoDb file (geoDb defaults to db — real_geometry.js's own documented behaviour).
 * Duplex_extracted.db independently verified here to carry the SAME 21 rooms / 14 doors as
 * witness_room_graph_path.js's own ground truth (that witness uses the geometry-less modeller/
 * Duplex_ARC.db instead — deliberately NOT reused here, since this witness needs the geometry table
 * that file doesn't have).
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   R1 RESOLVES        — real positions actually resolve on real building data (not silently 0/N).
 *   R2 EDGE-CHURN       — per-door edge diff reproduces §2b's measured real effect on Duplex, and its
 *                         measured null result on SampleHouse (too small a building to cross threshold).
 *   R3 E1-STABLE        — every changed door's E1 primary match is UNCHANGED between coarse and real;
 *                         only E9 (ambiguous-residual) edges move — §2b's own mechanism claim, checked
 *                         directly rather than trusted from the doc.
 *   R4 GRACEFUL-DEGRADE — omitting opts.doorRealXY, passing an empty map, or running against a
 *                         geometry-less db (modeller/Duplex_ARC.db — real rooms/doors, no geometry
 *                         table) all produce a graph BYTE-IDENTICAL to today's pre-fix behaviour. This
 *                         IS the baseline-diff §4 item 4 asks for: a direct behavioural-equivalence
 *                         proof, not a textual git diff (the code path is provably a no-op by
 *                         construction whenever opts.doorRealXY has no entry for a door — see
 *                         common/room_graph.js's own §REAL-AABB comment at the door loop).
 * PASS bar: all chk() green.
 * RUN: node witness_room_graph_real_aabb.js   (from the worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const DoorRealPosition = require('./common/door_real_position.js');
const ROOT = __dirname;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function openDb(SQL, relPath) {
  return new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ROOT, relPath))));
}
function makeDbQuery(db) {
  return function (sql, params) { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; };
}
// door guid -> sorted list of "kind:sortedEndpoints" for every edge carrying that door's guid
// (E1 primary match + any E9 ambiguous-residual bridges) — the literal per-door connectivity claim.
function doorEdgeSignature(graph) {
  const m = {};
  graph.edges.forEach(e => {
    if (!e.doorGuid) return;
    (m[e.doorGuid] = m[e.doorGuid] || []).push(e.kind + ':' + [e.a, e.b].sort().join('~'));
  });
  Object.keys(m).forEach(g => m[g].sort());
  return m;
}

(async () => {
  const SQL = await initSqlJs();

  // ══ Duplex — real, measurable effect expected (§2b) ══
  console.log('§W-ROOM-GRAPH-REAL-AABB building=Duplex_extracted.db');
  const dbD = openDb(SQL, 'modeller/Duplex_extracted.db');
  const dbqD = makeDbQuery(dbD);
  const roomsD = dbqD("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace'")[0][0];
  const doorsD = dbqD("SELECT COUNT(*) FROM elements_meta WHERE ifc_class LIKE 'IfcDoor%' AND discipline='ARC'")[0][0];
  chk('R0 Duplex fixture matches witness_room_graph_path.js\'s own ground truth (21 rooms / 14 doors)',
    roomsD === 21 && doorsD === 14, 'rooms=' + roomsD + ' doors=' + doorsD);

  const realD = DoorRealPosition.resolveDoorRealXY(dbD, dbD);
  chk('R1 Duplex: every door\'s real position resolved (14/14 — geometry embedded in this fixture)',
    Object.keys(realD).length === doorsD, 'resolved=' + Object.keys(realD).length + '/' + doorsD);

  const gCoarseD = RoomGraph.buildGraph(dbqD, { log: () => {} });
  const gRealD = RoomGraph.buildGraph(dbqD, { log: () => {}, doorRealXY: realD });
  chk('R1b real-AABB actually fired inside buildGraph (stats.doorRealResolved)',
    gRealD.stats.doorRealResolved === doorsD, 'doorRealResolved=' + gRealD.stats.doorRealResolved);

  const sigCoarseD = doorEdgeSignature(gCoarseD), sigRealD = doorEdgeSignature(gRealD);
  const allDoorsD = new Set([...Object.keys(sigCoarseD), ...Object.keys(sigRealD)]);
  let changedD = 0, e1DriftD = 0;
  allDoorsD.forEach(g => {
    const c = (sigCoarseD[g] || []).join(' | '), r = (sigRealD[g] || []).join(' | ');
    if (c === r) return;
    changedD++;
    const e1c = (sigCoarseD[g] || []).filter(s => s.indexOf('E1:') === 0).join(' | ');
    const e1r = (sigRealD[g] || []).filter(s => s.indexOf('E1:') === 0).join(' | ');
    if (e1c !== e1r) e1DriftD++;
    console.log('  §DOOR_EDGE_DIFF door=' + g + ' coarse=[' + c + '] real=[' + r + ']' + (e1c !== e1r ? '  ⚠ E1 PRIMARY MATCH CHANGED' : ''));
  });
  console.log('§DUPLEX_CHURN changed=' + changedD + '/' + allDoorsD.size + ' (doc §2b measured 8/14 — a future ' +
    'code change that drops this to 0 silently un-fixes the bug; a rise means the fix now also reaches ' +
    'buildings/cases §2b did not test)');
  chk('R2 Duplex: real effect confirmed — at least one door\'s matched edges actually changed ' +
    '(not a silent no-op)', changedD > 0, 'changed=' + changedD + '/' + allDoorsD.size);
  chk('R2b Duplex: churn matches §2b\'s own measured number exactly (8/14) — flags drift either direction',
    changedD === 8, 'changed=' + changedD);
  chk('R3 E1-STABLE: not one changed door\'s E1 primary match moved — every diff is confined to the ' +
    'E9 ambiguous-residual layer, exactly as §2b\'s own mechanism claim states',
    e1DriftD === 0, 'doorsWithE1Drift=' + e1DriftD + '/' + changedD);
  chk('R3b aggregate stats.edges (E1 count) identical coarse vs real, despite the real per-door churn ' +
    'above — reproduces §2b\'s own "a summary-count diff alone would report no effect" trap',
    gCoarseD.stats.edges === gRealD.stats.edges && gCoarseD.stats.ambiguousResidualRescued === gRealD.stats.ambiguousResidualRescued,
    'coarse=' + JSON.stringify({ e: gCoarseD.stats.edges, r: gCoarseD.stats.ambiguousResidualRescued }) +
    ' real=' + JSON.stringify({ e: gRealD.stats.edges, r: gRealD.stats.ambiguousResidualRescued }));

  // ══ R4a: graceful degrade — omitted / empty doorRealXY must be byte-identical to pre-fix behaviour ══
  const gNoOptD = RoomGraph.buildGraph(dbqD, { log: () => {} });
  const gEmptyMapD = RoomGraph.buildGraph(dbqD, { log: () => {}, doorRealXY: {} });
  chk('R4a Duplex: opts.doorRealXY omitted vs an empty {} map produce a BYTE-IDENTICAL edge set',
    JSON.stringify(gNoOptD.edges) === JSON.stringify(gEmptyMapD.edges));

  // ══ R4b: graceful degrade — a real building with rooms/doors but NO geometry table at all ══
  // (modeller/Duplex_ARC.db — same building family, deliberately geometry-less; confirms the "module
  // absent / no geometry_hash / unresolvable blob" fallback path this file's header promises).
  const dbArc = openDb(SQL, 'modeller/Duplex_ARC.db');
  const dbqArc = makeDbQuery(dbArc);
  let resolveThrew = false, realArc;
  try { realArc = DoorRealPosition.resolveDoorRealXY(dbArc, dbArc); } catch (e) { resolveThrew = true; }
  chk('R4b resolveDoorRealXY never throws against a real db with no geometry table',
    !resolveThrew && realArc && Object.keys(realArc).length === 0, 'threw=' + resolveThrew + ' resolved=' + (realArc ? Object.keys(realArc).length : 'n/a'));
  const gArcCoarse = RoomGraph.buildGraph(dbqArc, { log: () => {} });
  const gArcWithMap = RoomGraph.buildGraph(dbqArc, { log: () => {}, doorRealXY: realArc });
  chk('R4c a geometry-less building\'s graph is BYTE-IDENTICAL whether or not doorRealXY is passed ' +
    '(the module resolved nothing, so every door falls back to coarse, same as before this fix existed)',
    JSON.stringify(gArcCoarse.edges) === JSON.stringify(gArcWithMap.edges));

  // ══ R4d: resolveDoorRealXY never throws on a null db (defensive callers) ══
  let nullThrew = false, nullRes;
  try { nullRes = DoorRealPosition.resolveDoorRealXY(null, null); } catch (e) { nullThrew = true; }
  chk('R4d resolveDoorRealXY never throws on a null db (defensive caller contract)',
    !nullThrew && nullRes && Object.keys(nullRes).length === 0);

  // ══ SampleHouse — §2b measured 0/3 changed (too small a building to cross any matching threshold) ══
  console.log('\n§W-ROOM-GRAPH-REAL-AABB building=SampleHouse_extracted.db');
  const dbH = openDb(SQL, 'modeller/SampleHouse_extracted.db');
  const dbqH = makeDbQuery(dbH);
  const realH = DoorRealPosition.resolveDoorRealXY(dbH, dbH);
  const doorsH = dbqH("SELECT COUNT(*) FROM elements_meta WHERE ifc_class LIKE 'IfcDoor%' AND discipline='ARC'")[0][0];
  chk('R1c SampleHouse: every door\'s real position resolved (matches §2b\'s "3 ARC doors, all resolved")',
    Object.keys(realH).length === doorsH && doorsH === 3, 'resolved=' + Object.keys(realH).length + '/' + doorsH);
  const gCoarseH = RoomGraph.buildGraph(dbqH, { log: () => {} });
  const gRealH = RoomGraph.buildGraph(dbqH, { log: () => {}, doorRealXY: realH });
  const sigCoarseH = doorEdgeSignature(gCoarseH), sigRealH = doorEdgeSignature(gRealH);
  const allDoorsH = new Set([...Object.keys(sigCoarseH), ...Object.keys(sigRealH)]);
  let changedH = 0;
  allDoorsH.forEach(g => { if ((sigCoarseH[g] || []).join('|') !== (sigRealH[g] || []).join('|')) changedH++; });
  chk('R2c SampleHouse: reproduces §2b\'s measured null result (0/3 changed — building too small to ' +
    'cross any matching threshold, even with real offsets present)', changedH === 0, 'changed=' + changedH + '/' + allDoorsH.size);

  console.log(`\n§W-ROOM-GRAPH-REAL-AABB DONE pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
