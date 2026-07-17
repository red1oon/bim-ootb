#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FULL-CONNECTIVITY scope (READ THE LOG after every run)
 * SCOPE: common/room_graph.js's fullConnectivity() — answers the user's literal question
 * (2026-07-14): "is there a simple test where every door can go to any other door via a covered
 * path... is there no gap?" This is the FULL-GRAPH connectivity answer (all edge kinds E1-E8,
 * all nodes — rooms + circ/spine + stair + exit), as opposed to components() (pre-existing,
 * deliberately room-only via E1 doors alone — a different, narrower metric).
 * PASS BAR: this witness does NOT assert fullyConnected===true — that would be asserting a
 * property of the BUILDING DATA, not of the code. It reports the honest current state (component
 * count, sizes, and the actual isolated node names for every non-largest component) so the gap is
 * NAMED, not just counted — per the "tests expose issues" discipline. Green here means "the
 * function itself runs and its own internal invariants hold" (sizes sum to totalNodes, at least
 * one component exists, etc.), NOT "this building has no gaps."
 *
 * §ISLAND-SEVERITY (user, 2026-07-18): two additions on top of the original gap report —
 *  (1) islands are now sorted by REAL FOOTPRINT AREA (sum of each room's own rects), not member
 *      count — a large isolated space is a bigger red flag than a closet, but the old report gave
 *      no way to tell them apart at a glance.
 *  (2) for islands containing MORE THAN ONE room ("an island of rooms must have at least a door to
 *      another door outside it if there is more"): independently re-scans the RAW door data
 *      (elements_meta/element_transforms, same buffer/distance test buildGraph's own E1/E2 loop
 *      uses — RoomGraph.DOOR_BUFFER_SLACK, not a new number) for any real door near the island's
 *      rooms that ISN'T already accounted for as a graph edge. If one exists, the island is
 *      FIXABLE (a real door sits right there — commonly a storey mismatch, the same root cause
 *      OCCUPANT_PATHFINDER.md's C1 rescue targets). If none exists at all in the raw IFC data, the
 *      island is GENUINELY ISOLATED — confirmed absence, not a binding bug. A single-room island is
 *      NOT checked this way (a lone room legitimately having zero doors in the source data is
 *      common and not inherently a bug — see the Terminal/Clinic ⚠ SUSPECT_/zero-door-room findings
 *      already on record); the check only fires when "there is more" than one room, per the ask.
 * RUN: node witness_full_connectivity.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function roomArea(node) {
  if (!node || !node.rects) return 0;
  return node.rects.reduce((a, r) => a + Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0), 0);
}

// Same point-to-AABB distance formula room_graph.js's own buildGraph() uses internally (not
// exported — duplicated here, same convention common/room_habitability.js's own _rectDist already
// uses for the identical formula, per that file's own comment).
function rectDist(rc, px, py) {
  const dx = Math.max(rc.x0 - px, 0, px - rc.x1);
  const dy = Math.max(rc.y0 - py, 0, py - rc.y1);
  return Math.hypot(dx, dy);
}

// §ISLAND-SEVERITY check 2: for a multi-room island, is there a REAL door in the raw IFC data
// (regardless of storey — a mismatched storey is the most common reason a real nearby door isn't
// already an edge) sitting within buffer distance of any of the island's own room rects, that isn't
// already accounted for as a graph edge anywhere? Returns the candidates found (empty = genuinely
// isolated, confirmed against raw data, not just against what the graph happened to bind).
function findCandidateConnectors(dbQuery, islandRooms, alreadyEdgeDoorGuids) {
  const doorRows = dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.bbox_x, t.bbox_y" +
    " FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid" +
    " WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
  const out = [];
  doorRows.forEach(d => {
    const guid = d[0], name = d[1] || '', storey = d[2] || '(no storey)', dx = d[3], dy = d[4], bx = d[5] || 0, by = d[6] || 0;
    if (alreadyEdgeDoorGuids.has(guid)) return;
    if (!RoomGraph.isRoomDoor(name)) return;
    const buf = Math.max(bx, by) / 2 + RoomGraph.DOOR_BUFFER_SLACK;
    let best = Infinity, bestRoom = null;
    islandRooms.forEach(r => {
      (r.rects || []).forEach(rc => {
        const dist = rectDist(rc, dx, dy);
        if (dist < best) { best = dist; bestRoom = r; }
      });
    });
    if (best <= buf && bestRoom) out.push({ guid, name, storey, dist: best, nearRoom: bestRoom.name, roomStorey: bestRoom.storey });
  });
  return out;
}

function reportBuilding(name, dbPath) {
  console.log('\n§BUILDING ' + name + ' (' + dbPath + ')');
  const db = new Database(dbPath, { readonly: true });
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const fc = RoomGraph.fullConnectivity(graph);

  chk(name + ': fullConnectivity() ran and produced a self-consistent result',
    fc.sizes.reduce((a, b) => a + b, 0) === fc.totalNodes,
    'sizes sum=' + fc.sizes.reduce((a, b) => a + b, 0) + ' totalNodes=' + fc.totalNodes);
  chk(name + ': at least one node/component found (graph not empty)', fc.totalNodes > 0 && fc.components > 0);

  const doorEdgeCount = graph.edges.filter(e => e.doorGuid).length;
  console.log('  totalNodes=' + fc.totalNodes + ' components=' + fc.components +
    ' largestComponent=' + fc.largestComponent + ' (' + (100 * fc.largestComponent / fc.totalNodes).toFixed(1) + '%)' +
    ' doorEdges=' + doorEdgeCount + ' fullyConnected=' + fc.fullyConnected);

  if (!fc.fullyConnected) {
    const alreadyEdgeDoorGuids = new Set(graph.edges.filter(e => e.doorGuid).map(e => e.doorGuid));
    const byComp = {};
    Object.keys(fc.comp).forEach(g => { const c = fc.comp[g]; (byComp[c] = byComp[c] || []).push(g); });
    const allIslands = Object.keys(byComp).map(cid => {
      const members = byComp[cid].map(g => graph.nodesByGuid[g]).filter(Boolean);
      const rooms = members.filter(n => n.kind === 'room');
      const area = rooms.reduce((a, r) => a + roomArea(r), 0);
      return { cid, members, rooms, area };
    });
    // Identify the ONE main-mass component by member count (not by area — a huge isolated wing
    // could out-AREA the main mass on a small building) BEFORE re-sorting the rest for display.
    let mainMassIdx = 0;
    allIslands.forEach((isl, i) => { if (isl.members.length > allIslands[mainMassIdx].members.length) mainMassIdx = i; });
    const nonLargest = allIslands.filter((isl, i) => i !== mainMassIdx)
      .sort((a, b) => b.area - a.area); // §ISLAND-SEVERITY 1: biggest real footprint first

    console.log('  §GAP_REPORT ' + nonLargest.length + ' disconnected islands (excluding the largest), sorted by real footprint area:');
    nonLargest.forEach(isl => {
      const memberLabels = isl.members.map(n => n.kind + ':' + (n.name || n.guid) + '@' + (n.storey || '?'));
      console.log('    island(rooms=' + isl.rooms.length + ' members=' + isl.members.length +
        ' area=' + isl.area.toFixed(1) + 'm²): ' + memberLabels.slice(0, 8).join(', ') + (memberLabels.length > 8 ? ', ...' : ''));
      if (isl.rooms.length > 1) {
        const candidates = findCandidateConnectors(dbQuery, isl.rooms, alreadyEdgeDoorGuids);
        if (candidates.length) {
          console.log('      ⚠ FIXABLE — ' + candidates.length + ' real door(s) near this island are NOT a graph edge:');
          candidates.slice(0, 5).forEach(c => console.log('        door="' + c.name + '" storey="' + c.storey +
            '" (near room storey="' + c.roomStorey + '"' + (c.storey !== c.roomStorey ? ' — STOREY MISMATCH, likely cause' : '') +
            ') dist=' + c.dist.toFixed(2) + 'm nearRoom=' + c.nearRoom));
        } else {
          console.log('      ✓ GENUINELY ISOLATED — no real door found near this island\'s rooms in the raw IFC data (confirmed, not just a graph gap)');
        }
      }
    });
  }
  db.close();
}

// §ISLAND-SEVERITY self-test (synthetic, not a real building): findCandidateConnectors()'s
// multi-room branch never fires on Clinic/HHS/Duplex today (every real island there happens to be
// single-room) — an untested branch is not a proven one, so exercise it directly with a fabricated
// island + door set, same discipline as "tests expose issues."
function selfTestCandidateConnectors() {
  console.log('\n§SELF_TEST findCandidateConnectors (synthetic, no real building)');
  const roomA = { name: 'RoomA', storey: 'L1', rects: [{ x0: 0, x1: 2, y0: 0, y1: 2 }] };
  const roomB = { name: 'RoomB', storey: 'L1', rects: [{ x0: 5, x1: 7, y0: 0, y1: 2 }] };
  const islandRooms = [roomA, roomB];

  // Case 1: a real, unbound door sits right on RoomA's boundary with a MISMATCHED storey (the
  // classic C1-style cause) — must be caught as a fixable candidate.
  const fakeDbQueryHit = (sql) => [['DOOR_1', 'M_Single-Flush:test', 'Unknown', 2.05, 1.0, 0.9, 0.1]];
  const hits = findCandidateConnectors(fakeDbQueryHit, islandRooms, new Set());
  chk('self-test: unbound nearby door (storey-mismatched) is detected as a FIXABLE candidate',
    hits.length === 1 && hits[0].guid === 'DOOR_1' && hits[0].storey !== hits[0].roomStorey,
    'found=' + hits.length);

  // Case 2: the SAME door, but already accounted for as a graph edge (in alreadyEdgeDoorGuids) —
  // must NOT be re-reported (it's not "missing", it's already bound to something).
  const hitsAlreadyBound = findCandidateConnectors(fakeDbQueryHit, islandRooms, new Set(['DOOR_1']));
  chk('self-test: a door already used as a graph edge is NOT re-reported as a candidate',
    hitsAlreadyBound.length === 0, 'found=' + hitsAlreadyBound.length);

  // Case 3: no door anywhere near the island at all — must report GENUINELY isolated (empty array),
  // not a false positive.
  const fakeDbQueryMiss = (sql) => [['DOOR_2', 'M_Single-Flush:far', 'L1', 500, 500, 0.9, 0.1]];
  const misses = findCandidateConnectors(fakeDbQueryMiss, islandRooms, new Set());
  chk('self-test: a door far from the island is correctly NOT reported (no false positive)',
    misses.length === 0, 'found=' + misses.length);

  // Case 4: a lift/elevator door (isRoomDoor() excludes these) sitting right on the boundary must
  // still be excluded — same real-doors-only discipline the shipped E1/E2 loop already applies.
  const fakeDbQueryLift = (sql) => [['DOOR_3', 'Lift Door:test', 'Unknown', 2.05, 1.0, 0.9, 0.1]];
  const liftHits = findCandidateConnectors(fakeDbQueryLift, islandRooms, new Set());
  chk('self-test: a non-room door (lift/elevator) is correctly excluded, not a false candidate',
    liftHits.length === 0, 'found=' + liftHits.length);
}
selfTestCandidateConnectors();

reportBuilding('Clinic', '/home/red1/bim-ootb/buildings/Clinic_extracted.db');
reportBuilding('HHS (raw, pre-patch — see §HOW-TO-TEST-LIVE, real count differs live)', '/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db');
reportBuilding('Duplex', '/home/red1/bim-ootb/buildings/Duplex_extracted.db');

console.log('\n§W-FULL-CONNECTIVITY DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
