#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — OCCUPANT_PATHFINDER.md OPEN LANE C, C1+C2 POC GATE (READ THE LOG after every run)
 * SCOPE: calculation-only, engine NOT touched. Proves, against the REAL SHIPPED common/room_graph.js
 * buildGraph() output (not a reimplementation of the graph itself), that:
 *   C1 — rescuing Unknown-storey doors by center_z (reusing §STOREY-Z's own convention) makes the
 *        corridor edge at the curtain-wall glass door EXIST.
 *   C2 — a door-count metric (unit cost per real room-transition door, weighted by path_strategy.json's
 *        host-class + adjacent-room-privacy table, zero cost for corridor-internal E3/E5/E6/E8 hops)
 *        makes shortestPath PICK the corridor route instead of the distance-shorter room-thread.
 * Duplex is the no-regression control (door-connected, no corridor alternative — door-count path must
 * equal the existing distance path exactly, same rooms/doors in the same order).
 * RUN: node poc_lane_c_doorpref.js   (from this worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.js'));
const RoomGraph = require('./common/room_graph.js');
const STRATEGY = require('./prompts_path_strategy_snapshot.json');

const CLINIC_DB = path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Clinic_extracted.db');
const DUPLEX_DB = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');

async function openDb(SQL, dbPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  return function rawDbQuery(q, params) {
    const r = params ? db.exec(q, params) : db.exec(q);
    if (!r.length) return [];
    return r[0].values;
  };
}

// ── C1: storey-rescue wrapper ────────────────────────────────────────────────
// Reuses buildGraph's OWN §STOREY-Z convention (average real-room center_z per storey), computed
// independently here (calc-only — buildGraph doesn't expose it before the door query runs), then
// intercepts ONLY the exact door query buildGraph issues and reassigns storey='Unknown'/'' rows to
// the nearest storey by center_z. Every door that already has a real storey is untouched.
// §THIN-STOREY-GUARD (real data-quality landmine found running this POC): Clinic carries a
// "TOF Footing" IfcBuildingStorey with exactly ONE IfcSpace (a structural top-of-footing datum, not
// real occupiable space) whose lone room's center_z (0.80) happens to sit closer to the glass doors'
// z (~1.0) than the real, 67-room First Floor anchor (1.999, pulled up by real room-volume
// centroids). A single-sample average is not a trustworthy z-anchor next to a 50-67 sample one —
// excluding storeys below a minimum REAL room count (a measured signal, not a hand-picked z
// threshold) before taking "nearest" fixes this without hard-coding "TOF Footing" by name.
const MIN_STOREY_SAMPLE = 3;
function storeyZAnchors(rawDbQuery) {
  const rows = rawDbQuery("SELECT s.center_z, p.name FROM spatial_structure s LEFT JOIN spatial_structure p " +
    "ON p.guid = s.parent_guid WHERE s.type='IfcSpace' AND s.center_z IS NOT NULL");
  const sum = {}, n = {};
  rows.forEach(r => { const st = r[1] || '(no storey)'; sum[st] = (sum[st] || 0) + r[0]; n[st] = (n[st] || 0) + 1; });
  const z = {};
  Object.keys(sum).forEach(st => { if (n[st] >= MIN_STOREY_SAMPLE) z[st] = sum[st] / n[st]; });
  return z;
}

function nearestStorey(z, storeyZ) {
  let best = null, bestD = Infinity;
  Object.keys(storeyZ).forEach(s => { const d = Math.abs(storeyZ[s] - z); if (d < bestD) { bestD = d; best = s; } });
  return best;
}

// §COLUMN-LAYOUT-GUARD (real bug found running this POC, kept as a comment for the eventual engine
// port): buildGraph()'s own door query and hallway_backbone.js's TWO internal door queries all match
// the substring "ifc_class LIKE 'IfcDoor%'", but with DIFFERENT column layouts (buildGraph's carries
// t.center_z at index 5; hallway_backbone's two variants do NOT — index 5 there is bbox_x). A blind
// per-query column rewrite corrupts whichever query doesn't actually have z there. Fix: compute the
// guid->rescued-storey map ONCE via a dedicated query (buildGraph's own column shape, real z), then
// apply it to ANY door-query result by GUID (index 0) + storey (index 2) — both positions ARE
// consistent across all three query variants, verified by reading every one of them.
function buildRescueMap(rawDbQuery, log) {
  const storeyZ = storeyZAnchors(rawDbQuery);
  const doorRows = rawDbQuery('SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y' +
    ' FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid' +
    " WHERE m.ifc_class LIKE 'IfcDoor%' AND m.discipline='ARC' AND t.center_x IS NOT NULL");
  const map = {};
  doorRows.forEach(r => {
    const storey = r[2];
    if (storey && storey !== 'Unknown' && storey !== '') return;
    const cz = r[5];
    const assigned = (cz != null) ? nearestStorey(cz, storeyZ) : null;
    if (!assigned) return;
    map[r[0]] = assigned;
    log('§C1_RESCUE door=' + r[0] + ' name="' + (r[1] || '') + '" z=' + cz.toFixed(2) + ' -> storey="' + assigned + '"');
  });
  return map;
}

function makeC1DbQuery(rawDbQuery, log) {
  const map = buildRescueMap(rawDbQuery, log);
  return function c1DbQuery(q, params) {
    const rows = rawDbQuery(q, params);
    if (q.indexOf("ifc_class LIKE 'IfcDoor%'") === -1) return rows;
    return rows.map(r => {
      const assigned = map[r[0]];
      if (!assigned) return r;
      const r2 = r.slice(); r2[2] = assigned; return r2;
    });
  };
}

// ── C2: door-count metric, CORRIDOR-GATED (user decision, 2026-07-18) ───────────────────────────
// First pass (uniform door-count on every E1/E2/E7/E9 edge) fixed Clinic but broke 17/35 Duplex
// pairs — root cause: pure door-count also fires on plain room<->room ambiguous-door junctions that
// have NOTHING to do with a corridor (e.g. Duplex A204<->A205's 3-way junction), because "doors" and
// "meters" were both being minimized in the same currency everywhere. User's resolution: gate the
// door-count penalty to edges that actually TOUCH the corridor system (a real spine/circ node on at
// least one end) — matches the lane doc's own PRINCIPLE wording ("penalise room<->room transitions
// WHERE A CORRIDOR EDGE IS AVAILABLE", not everywhere). A pure room<->room edge (E1, or E9's
// door<->room residual rescue — neither touches spine/circ) keeps EXACTLY today's real-distance
// weight, byte-identical to the shipped formula — so Duplex's non-corridor junctions are untouched.
const CORRIDOR_INTERNAL_KINDS = { E3: 1, E5: 1, E6: 1, E8: 1 }; // always 0 doors (circulation-internal)
const DOOR_KINDS = { E1: 1, E2: 1, E7: 1, E9: 1 };               // real-door-carrying kinds
function touchesCorridor(graph, e) {
  const na = graph.nodesByGuid[e.a], nb = graph.nodesByGuid[e.b];
  return (na && (na.kind === 'spine' || na.kind === 'circ')) || (nb && (nb.kind === 'spine' || nb.kind === 'circ'));
}

function isCurtainWallDoor(doorName) {
  return /curtain\s*wall/i.test(doorName || '');
}
function roomPrivacy(node) {
  const label = ((node && node.label) || '') + ' ' + ((node && node.name) || '');
  if (/corridor|lobby|circulation|foyer|hall/i.test(label)) return 'public';
  if (/bedroom|restroom|toilet|office|\bwc\b|bath/i.test(label)) return 'private';
  return 'semi';
}
function privacyMult(cat) {
  const t = STRATEGY.door_priority.by_adjacent_room_privacy;
  return (t[cat] || t.semi).cost_mult;
}
function hostMult(doorName) {
  const t = STRATEGY.door_priority.by_host_class;
  return isCurtainWallDoor(doorName) ? t.IfcCurtainWall.cost_mult : t.IfcWall.cost_mult;
}

function doorEdgeCost(graph, e) {
  if (CORRIDOR_INTERNAL_KINDS[e.kind]) return STRATEGY.metric.corridor_traversal_cost;
  if (!DOOR_KINDS[e.kind]) return STRATEGY.metric.corridor_traversal_cost; // defensive — unknown kind, never invented as a door
  if (!touchesCorridor(graph, e)) return realEdgeDist(graph, e); // §CORRIDOR-GATE: plain room<->room, no corridor alternative here — today's exact distance weight
  const hm = hostMult(e.doorName);
  // adjacent room = the ROOM-kind endpoint (E1 may have two — use the more PRIVATE of the two, i.e.
  // the worse case, since punching into either private room is the thing being discouraged).
  const na = graph.nodesByGuid[e.a], nb = graph.nodesByGuid[e.b];
  const cats = [];
  if (na && na.kind === 'room') cats.push(roomPrivacy(na));
  if (nb && nb.kind === 'room') cats.push(roomPrivacy(nb));
  let pm;
  if (!cats.length) pm = privacyMult('public'); // orphan-door<->spine (E7): both circulation-side
  else {
    const mults = cats.map(privacyMult);
    pm = Math.max.apply(null, mults); // worst case wins — discourage the private leg
  }
  return 1 * hm * pm;
}

// Dijkstra over the SAME real graph.edges/nodesByGuid buildGraph() produced, weight = doorEdgeCost.
// Mirrors room_graph.js's own _buildAdjacency/_dijkstraCore shape exactly, only the weight differs.
function doorCountShortestPath(graph, fromGuid, toGuid) {
  if (fromGuid === toGuid) return { path: [fromGuid], doors: [], cost: 0 };
  const adj = {};
  Object.keys(graph.nodesByGuid).forEach(g => adj[g] = []);
  graph.edges.forEach(e => {
    if (!(e.a in adj) || !(e.b in adj)) return;
    const w = doorEdgeCost(graph, e);
    adj[e.a].push({ to: e.b, w, e });
    adj[e.b].push({ to: e.a, w, e });
  });
  if (!adj[fromGuid] || !adj[toGuid]) return null;
  const dist = {}, prev = {}, visited = {};
  Object.keys(adj).forEach(g => dist[g] = Infinity);
  dist[fromGuid] = 0;
  const pq = [fromGuid];
  while (pq.length) {
    pq.sort((a, b) => dist[a] - dist[b]);
    const u = pq.shift();
    if (visited[u]) continue;
    visited[u] = true;
    if (u === toGuid) break;
    (adj[u] || []).forEach(edge => {
      const nd = dist[u] + edge.w;
      if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e }; pq.push(edge.to); }
    });
  }
  if (dist[toGuid] === Infinity) return null;
  const path = [toGuid], doors = [];
  let cur = toGuid;
  while (cur !== fromGuid) {
    const p = prev[cur];
    if (!p) return null;
    if (p.edge.doorGuid && DOOR_KINDS[p.edge.kind]) doors.unshift({ guid: p.edge.doorGuid, name: p.edge.doorName, kind: p.edge.kind });
    path.unshift(p.from);
    cur = p.from;
  }
  return { path, doors, cost: dist[toGuid] };
}

function hopKinds(graph, path) {
  return path.map(g => (graph.nodesByGuid[g] || {}).kind || '?');
}

// ── DIAGNOSTIC ONLY (not part of C2's spec) — same door-count metric, plus a real-distance
// tie-break so small it can only resolve EQUAL-door-count ties, never override a genuine door-count
// difference (mirrors path_strategy.json's own "tiebreak is never a primary driver" rule, using
// real distance instead of collinearity angle since that's cheaper to compute here). Used to
// separate "tie resolved differently" mismatches from "genuinely fewer real doors" mismatches.
function realEdgeDist(graph, e) {
  if (e.kind === 'E1' || e.kind == null) {
    const ga = graph.nodesByGuid[e.a], gb = graph.nodesByGuid[e.b];
    return Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy);
  }
  return (typeof e.w === 'number') ? e.w : 0;
}
// §RAW-COMPARISON (representation-fairness fix): RoomGraph.shortestPath()'s OWN returned `path`
// substitutes CIRC nodes with a real door/stair waypoint for rendering (_publicHop) — comparing that
// substituted output against my Dijkstra's raw (unsubstituted) path produces FALSE mismatches
// whenever the underlying edge sequence is actually identical, just displayed differently. This
// mirrors _buildAdjacency/_dijkstraCore's EXACT today's-shipped weight formula but returns the raw
// internal path (no substitution) so it's a fair apples-to-apples baseline against doorCountShortestPath.
function distanceShortestPathRaw(graph, fromGuid, toGuid) {
  if (fromGuid === toGuid) return { path: [fromGuid], cost: 0 };
  const adj = {};
  Object.keys(graph.nodesByGuid).forEach(g => adj[g] = []);
  graph.edges.forEach(e => {
    if (!(e.a in adj) || !(e.b in adj)) return;
    const w = realEdgeDist(graph, e);
    adj[e.a].push({ to: e.b, w, e });
    adj[e.b].push({ to: e.a, w, e });
  });
  if (!adj[fromGuid] || !adj[toGuid]) return null;
  const dist = {}, prev = {}, visited = {};
  Object.keys(adj).forEach(g => dist[g] = Infinity);
  dist[fromGuid] = 0;
  const pq = [fromGuid];
  while (pq.length) {
    pq.sort((a, b) => dist[a] - dist[b]);
    const u = pq.shift();
    if (visited[u]) continue;
    visited[u] = true;
    if (u === toGuid) break;
    (adj[u] || []).forEach(edge => {
      const nd = dist[u] + edge.w;
      if (nd < dist[edge.to]) { dist[edge.to] = nd; prev[edge.to] = { from: u, edge: edge.e }; pq.push(edge.to); }
    });
  }
  if (dist[toGuid] === Infinity) return null;
  const path = [toGuid];
  let cur = toGuid;
  while (cur !== fromGuid) {
    const p = prev[cur];
    if (!p) return null;
    path.unshift(p.from);
    cur = p.from;
  }
  return { path, cost: dist[toGuid] };
}

(async () => {
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.wasm')) });

  // ── CLINIC ──────────────────────────────────────────────────────────────
  console.log('=== Clinic ===');
  const rawQC = await openDb(initSql, CLINIC_DB);
  const logLinesC = [];
  const logC = m => { logLinesC.push(m); };
  const baselineGraph = RoomGraph.buildGraph(rawQC, { log: () => {} }); // no C1, real shipped behavior
  const c1Query = makeC1DbQuery(rawQC, logC);
  const c1Graph = RoomGraph.buildGraph(c1Query, { log: () => {} });
  const rescuedCount = logLinesC.filter(l => l.indexOf('§C1_RESCUE') === 0).length;
  logLinesC.forEach(l => console.log(l));
  console.log('§POCPATH-C Clinic unknown_doors_rescued=' + rescuedCount);
  console.log('§POCPATH-C Clinic edges baseline=' + baselineGraph.edges.length + ' after_c1=' + c1Graph.edges.length +
    ' (+' + (c1Graph.edges.length - baselineGraph.edges.length) + ')');

  // Find a representative First Floor -> Second Floor sample pair whose DISTANCE-based route today
  // threads many doors (the reported "12 doors, 85.1m" shape) — search among real cross-storey
  // reachable pairs, take the one with the most E1/E2 door hops under the real shortestPath().
  const rooms = c1Graph.nodes;
  const firstFloor = rooms.filter(n => n.storey === 'First Floor');
  const secondFloor = rooms.filter(n => n.storey === 'Second Floor');
  let sample = null, sampleDoors = -1;
  firstFloor.forEach(a => {
    secondFloor.forEach(b => {
      const r = RoomGraph.shortestPath(c1Graph, a.guid, b.guid);
      if (r && r.doors.length > sampleDoors) { sampleDoors = r.doors.length; sample = { a, b, r }; }
    });
  });
  if (sample) {
    console.log('§POCPATH-C Clinic sample_pair: "' + sample.a.name + '" -> "' + sample.b.name + '"');
    console.log('§POCPATH-C Clinic hops_before(distance-metric) doors=' + sample.r.doors.length +
      ' distance=' + sample.r.distance.toFixed(1) + ' kinds=' + hopKinds(c1Graph, sample.r.path).join(','));

    const beforeC1 = RoomGraph.shortestPath(baselineGraph, sample.a.guid, sample.b.guid);
    console.log('§POCPATH-C Clinic hops_baseline(no-C1,distance-metric) ' +
      (beforeC1 ? ('doors=' + beforeC1.doors.length + ' distance=' + beforeC1.distance.toFixed(1)) : 'UNREACHABLE'));

    const afterC2 = doorCountShortestPath(c1Graph, sample.a.guid, sample.b.guid);
    console.log('§POCPATH-C Clinic hops_after(C1+C2 door-count metric) ' +
      (afterC2 ? ('doors=' + afterC2.doors.length + ' cost=' + afterC2.cost.toFixed(2) + ' kinds=' + hopKinds(c1Graph, afterC2.path).join(',')) : 'UNREACHABLE'));
    if (afterC2) {
      console.log('§POCPATH-C Clinic door_names_after=' + afterC2.doors.map(d => d.name).join(' | '));
    }
  } else {
    console.log('§POCPATH-C Clinic sample_pair: NO First Floor -> Second Floor pair reachable');
  }

  // ── DUPLEX regression: CORRIDOR-GATED door-count metric must pick the SAME raw route as today's
  // shipped distance formula, compared RAW-vs-RAW (both via distanceShortestPathRaw/
  // doorCountShortestPath's own internal traversal — no _publicHop substitution on either side, so a
  // rendering-only difference can never register as a false mismatch).
  console.log('=== Duplex regression (corridor-gated) ===');
  const rawQD = await openDb(initSql, DUPLEX_DB);
  const dupGraph = RoomGraph.buildGraph(rawQD, { log: () => {} });
  const dRooms = dupGraph.nodes;
  let checked = 0, mismatches = 0;
  for (let i = 0; i < dRooms.length; i++) for (let j = i + 1; j < dRooms.length; j++) {
    const r1 = distanceShortestPathRaw(dupGraph, dRooms[i].guid, dRooms[j].guid);
    if (!r1) continue;
    checked++;
    const r2 = doorCountShortestPath(dupGraph, dRooms[i].guid, dRooms[j].guid);
    if (!r2 || JSON.stringify(r1.path) !== JSON.stringify(r2.path)) {
      mismatches++;
      console.log('  MISMATCH', dRooms[i].name, '->', dRooms[j].name,
        'distance-path=' + JSON.stringify(r1.path), 'doorcount-path=' + JSON.stringify(r2 && r2.path));
    }
  }
  console.log('§POCPATH-C Duplex regression_pairs=' + checked + ' mismatches=' + mismatches);

  console.log('\n§W-PATH-POC-C DONE');
})().catch(e => { console.error(e); process.exit(1); });
