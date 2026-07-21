#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-UTIL-PENALTY scope (READ THE LOG after every run)
 * SCOPE: common/room_graph.js §UTILITY-ROUTING-PENALTY (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10,
 * 2026-07-22). buildGraph() tags utility rooms via RoomHabitability.classifyUtilityRooms();
 * _buildAdjacency() multiplies (never removes) any edge touching a tagged node by
 * UTILITY_EDGE_PENALTY (=8). Both shortestPath() and escapeRoute() consume that adjacency.
 *
 * ISSUES THIS PROVES / DISPROVES (each check names its issue):
 *   A1 CLASSIFY-WIRED  — real Clinic: classifyUtilityRooms is actually called from buildGraph and
 *                        tags the 7 utility rooms onto the graph's own room nodes (node.isUtility).
 *   A2 STRUCTURAL-FINDING (honest) — on ALL current real fixtures every utility-classified room is a
 *                        DOORLESS sealed void (classifyUtilityRooms excludes any room with a nearby
 *                        door; graph edges REQUIRE a nearby door), so those rooms carry ZERO routing
 *                        edges and the penalty is a present-day NO-OP for them. Reported, not hidden —
 *                        the screenshot's door-carrying through-hop rooms are NOT flagged by this
 *                        classifier by design (§10 point 4). Follow-up named in the doc.
 *   B1 MULTIPLIER-MATH — a directly-connected real room pair's shortest-path distance is exactly
 *                        ×UTILITY_EDGE_PENALTY when one endpoint is tagged utility (the weighting is
 *                        the real multiplier, computed from real center-to-center distance).
 *   B2 REROUTE / B2b COST+REACHABLE — a real Clinic through-hop room, force-tagged utility (the
 *                        "clearest available real-data reproduction" §10's witness section asks for,
 *                        since no real utility room has an edge): a room→room query that USED it as a
 *                        mid-hop now AVOIDS it when a corridor/alternative exists (B2), or — when it is
 *                        the only route — still resolves at higher cost, never null (B2b). Proves both
 *                        "prefer circulation" AND "stays reachable".
 *   B3 REACHABLE-AS-DEST — a path whose DESTINATION is the (force-tagged) utility room still returns a
 *                        valid non-null result (single arrival-edge penalty), never unreachable.
 *   C  NO-REGRESSION    — a building with no utility rooms in play (Duplex): NEW module's paths are
 *                        byte-identical (path array + distance) to the origin/main "before" module.
 *
 * RUN: node witness_room_graph_utility_penalty.js   (from the worktree root)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const cp = require('child_process');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
// "before" = room_graph.js at the pinned pre-change commit (origin/main at dispatch). Regenerated
// on demand next to the live siblings so its own require('./storey_raster.js') etc. resolve; the
// file is gitignored (never committed). Pinning a SHA keeps this deterministic across future merges.
const BEFORE_SHA = '0269cec';
const BEFORE_PATH = path.join(__dirname, 'common', '_room_graph_before.js');
if (!fs.existsSync(BEFORE_PATH)) {
  fs.writeFileSync(BEFORE_PATH, cp.execSync('git show ' + BEFORE_SHA + ':common/room_graph.js', { cwd: __dirname, maxBuffer: 1 << 24 }));
}
const RG = require('./common/room_graph.js');                 // NEW (under test)
const RGbefore = require('./common/_room_graph_before.js');   // origin/main "before" (gitignored, regenerated)
const RH = require('./common/room_habitability.js');

const CLINIC = '/home/red1/bim-ootb/buildings/Clinic_extracted.db';
const DUPLEX = '/home/red1/bim-ootb/buildings/Duplex_extracted.db';
const PEN = 8; // UTILITY_EDGE_PENALTY — kept in sync with room_graph.js's own constant, asserted below

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
function openQ(p) { const db = new Database(p, { readonly: true }); return { db: db, q: (sql, prm) => db.prepare(sql).raw(true).all(...(prm || [])) }; }
const roomList = (g, p) => p.filter(x => g.nodesByGuid[x] && g.nodesByGuid[x].kind === 'room');

console.log('§W-UTIL-PENALTY');

// ─────────────────────────────────────────────────────────────────────────────
// Part A — real Clinic classification + honest structural finding
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n§CLINIC classification + structural finding');
{
  const { db, q } = openQ(CLINIC);
  const logs = [];
  const g = RG.buildGraph(q, { log: m => { logs.push(m); } });
  const utilLine = logs.find(l => l.indexOf('§ROOM_GRAPH_UTILITY ') === 0) || '(none)';
  console.log('  §log: ' + utilLine);

  const tagged = g.nodes.filter(n => n.isUtility);
  chk('A1 CLASSIFY-WIRED buildGraph tagged the real utility rooms via classifyUtilityRooms',
    tagged.length === 7, 'tagged=' + tagged.length + ' [' + tagged.map(n => n.guid).join(',') + ']');

  // cross-check: same set the classifier returns directly
  const descs = g.nodes.map(n => {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    n.rects.forEach(r => { a = Math.min(a, r.x0); b = Math.max(b, r.x1); c = Math.min(c, r.y0); d = Math.max(d, r.y1); });
    return { guid: n.guid, cx: (a + b) / 2, cy: (c + d) / 2, sx: b - a, sy: d - c, storey: n.storey };
  });
  const direct = RH.classifyUtilityRooms(descs, q);
  chk('A1b tags match classifyUtilityRooms output exactly',
    tagged.every(n => direct[n.guid]) && Object.keys(direct).length === tagged.length,
    'directKeys=' + Object.keys(direct).length);

  const edgeCount = g2 => n => g2.edges.filter(e => e.a === n.guid || e.b === n.guid).length;
  const withEdges = tagged.filter(n => edgeCount(g)(n) > 0);
  console.log('  §UTIL_EDGELESS ' + tagged.map(n => n.guid + '(edges=' + edgeCount(g)(n) + ',' + n.utilityWhy + ')').join(' '));
  chk('A2 STRUCTURAL-FINDING every real utility room is a doorless void with ZERO routing edges → penalty is a present-day no-op for them (reported honestly, see doc §10 follow-up)',
    withEdges.length === 0, 'utilityRoomsWithEdges=' + withEdges.length + '/' + tagged.length);
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Part B — penalty MECHANISM on the real Clinic graph (constructed real-data reproduction)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n§CLINIC penalty mechanism (force-tag on the real graph)');
{
  const { db, q } = openQ(CLINIC);
  const g = RG.buildGraph(q, { log: () => {} });

  // B1 — MULTIPLIER MATH: a directly-connected real room pair, 1 E1 edge, exact ×PEN.
  //   Find an E1 edge whose two endpoints are rooms and whose direct edge is their shortest path.
  let e1 = g.edges.find(e => e.kind === 'E1' && g.nodesByGuid[e.a].kind === 'room' && g.nodesByGuid[e.b].kind === 'room');
  const A = e1.a, B = e1.b;
  const before = RG.shortestPath(g, A, B);
  g.nodesByGuid[A].isUtility = true;
  const after = RG.shortestPath(g, A, B);
  delete g.nodesByGuid[A].isUtility;
  const ratio = after.distance / before.distance;
  console.log('  §MULTIPLIER pair=' + A + '->' + B + ' d_before=' + before.distance.toFixed(4) + ' d_after=' + after.distance.toFixed(4) + ' ratio=' + ratio.toFixed(4));
  chk('B1 MULTIPLIER-MATH tagging one endpoint multiplies the touching edge weight by exactly UTILITY_EDGE_PENALTY',
    Math.abs(ratio - PEN) < 1e-6 && !!after, 'ratio=' + ratio.toFixed(4) + ' expected=' + PEN);

  // B2 — REROUTE / B2b COST+REACHABLE around a real through-hop.
  //   M is the degree-37 real hub RM_First_Floor_20; RM_First_Floor_29->RM_First_Floor_39 routes
  //   THROUGH it. Force-tag M utility (the honest constructed repro — no real utility room has an edge).
  const M = 'RM_First_Floor_20', pA = 'RM_First_Floor_29', pB = 'RM_First_Floor_39';
  const p0 = RG.shortestPath(g, pA, pB);
  const wentThrough = p0 && p0.path.indexOf(M) >= 0;
  g.nodesByGuid[M].isUtility = true;
  const p1 = RG.shortestPath(g, pA, pB);
  g.nodesByGuid[M].isUtility = false;
  console.log('  §THRUHOP ' + pA + '->' + pB + ' before rooms=[' + roomList(g, p0.path).join(',') + '] d=' + p0.distance.toFixed(2));
  console.log('  §THRUHOP ' + pA + '->' + pB + ' M=' + M + ' tagged: rooms=[' + roomList(g, p1.path).join(',') + '] d=' + p1.distance.toFixed(2) + ' avoidsM=' + (p1.path.indexOf(M) < 0));
  chk('B2-pre confirms the OLD route used the (to-be-tagged) room as a mid through-hop', wentThrough, 'through=' + wentThrough);
  const avoided = p1 && p1.path.indexOf(M) < 0;
  const costlierButReachable = p1 && p1.path.indexOf(M) >= 0 && p1.distance > p0.distance;
  chk('B2 REROUTE/B2b either the route now AVOIDS the tagged utility room, or (M being the only route) it stays reachable at higher cost — never null',
    !!p1 && (avoided || costlierButReachable), avoided ? 'REROUTED-around-M' : (costlierButReachable ? 'costlier+reachable(only-route)' : 'FAIL'));

  // B2c — an explicit real REROUTE: RM_First_Floor_1 -> RM_First_Floor_2 normally threads through
  //   RM_First_Floor_9 as a mid-hop; tagging RF9 utility makes the route AVOID it (hub RF20 -> RF2
  //   direct) — a real "prefer circulation over cutting through" reroute, slightly longer, non-null.
  const rrA = 'RM_First_Floor_1', rrB = 'RM_First_Floor_2', rrM = 'RM_First_Floor_9';
  const rr0 = RG.shortestPath(g, rrA, rrB);
  g.nodesByGuid[rrM].isUtility = true;
  const rr1 = RG.shortestPath(g, rrA, rrB);
  g.nodesByGuid[rrM].isUtility = false;
  console.log('  §REROUTE_EXAMPLE ' + rrA + '->' + rrB + ' before=[' + roomList(g, rr0.path).join(',') + '](d=' + rr0.distance.toFixed(2) + ') after=[' + roomList(g, rr1.path).join(',') + '](d=' + rr1.distance.toFixed(2) + ') avoids ' + rrM + '=' + (rr1.path.indexOf(rrM) < 0));
  chk('B2c REROUTE-EXAMPLE a real room→room route that used a room as a mid through-hop now AVOIDS it (in favour of a corridor/direct alternative) once it is tagged utility, and still resolves',
    rr0.path.indexOf(rrM) >= 0 && !!rr1 && rr1.path.indexOf(rrM) < 0,
    'before-through=' + (rr0.path.indexOf(rrM) >= 0) + ' after-avoids=' + (rr1 && rr1.path.indexOf(rrM) < 0));

  // B3 — REACHABLE-AS-DESTINATION: path whose destination IS the tagged utility room resolves non-null.
  g.nodesByGuid[M].isUtility = true;
  const dest = RG.shortestPath(g, pA, M);
  g.nodesByGuid[M].isUtility = false;
  const destUntagged = RG.shortestPath(g, pA, M);
  console.log('  §DEST_REACHABLE ' + pA + '->' + M + '(tagged) d=' + (dest ? dest.distance.toFixed(2) : 'null') + ' vs untagged d=' + (destUntagged ? destUntagged.distance.toFixed(2) : 'null'));
  chk('B3 REACHABLE-AS-DEST a maintenance-access query whose destination is the utility room still returns a valid non-null path (higher cost, never unreachable)',
    !!dest && dest.distance >= destUntagged.distance, dest ? ('d=' + dest.distance.toFixed(2)) : 'NULL');
  db.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Part C — no-regression on a building with no utility rooms in play (Duplex)
// ─────────────────────────────────────────────────────────────────────────────
function noRegression(dbPath, label, limit) {
  const { db, q } = openQ(dbPath);
  const gNew = RG.buildGraph(q, { log: () => {} });
  const gOld = RGbefore.buildGraph(q, { log: () => {} });
  const util = gNew.nodes.filter(n => n.isUtility);
  const utilWithEdges = util.filter(n => gNew.edges.some(e => e.a === n.guid || e.b === n.guid));
  console.log('  §NOREG_' + label + ' utilityRooms=' + util.length + ' ofWhichWithEdges=' + utilWithEdges.length);
  // Invariant that makes this a real no-regression, not luck: any utility room present is edgeless,
  // so the penalty branch is inert and paths cannot change (the structural finding, re-confirmed).
  chk('C0-' + label + ' utility rooms present (if any) are edgeless → penalty branch is inert here',
    utilWithEdges.length === 0, 'utilityRooms=' + util.length + ' withEdges=' + utilWithEdges.length);

  const rooms = gNew.nodes.map(n => n.guid);
  let compared = 0, identical = 0, firstDiff = null;
  const LIMIT = Math.min(rooms.length, limit);
  for (let i = 0; i < LIMIT; i++) for (let j = i + 1; j < LIMIT; j++) {
    const pN = RG.shortestPath(gNew, rooms[i], rooms[j]);
    const pO = RGbefore.shortestPath(gOld, rooms[i], rooms[j]);
    compared++;
    const same = (pN === null && pO === null) ||
      (pN && pO && JSON.stringify(pN.path) === JSON.stringify(pO.path) && Math.abs(pN.distance - pO.distance) < 1e-9);
    if (same) identical++; else if (!firstDiff) firstDiff = rooms[i] + '->' + rooms[j];
  }
  console.log('  §NOREG_' + label + ' compared=' + compared + ' identical=' + identical + (firstDiff ? ' firstDiff=' + firstDiff : ''));
  chk('C1-' + label + ' every path byte-identical (path + distance) to the origin/main module',
    identical === compared && compared > 0, identical + '/' + compared + ' identical');
  db.close();
}
// Duplex: 2 edgeless utility rooms present → proves the penalty stays inert even when a building
// DOES carry utility rooms (as long as they're the doorless voids the classifier flags).
noRegression(DUPLEX, 'DUPLEX', 22);
// JKR: a building with genuinely ZERO utility rooms in play — the literal "no utility rooms" case.
noRegression('/home/red1/bim-ootb/buildings/JKR_extracted.db', 'JKR', 20);

console.log('\n§W-UTIL-PENALTY DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
