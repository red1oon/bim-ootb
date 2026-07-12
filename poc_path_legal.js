#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-LEG-POC scope (READ THE LOG after every run)
 * SCOPE: PATH_LEGAL_SEGMENTS.md POC GATE — calculation-only, no engine edits. Classifies the
 * SHIPPED shortestPath()'s same-storey chords (HHS R18->R31, Duplex) against G3's walkable-space
 * union (room rects + floor-slab footprints), then builds G4's visibility-graph detour for any
 * illegal chord. Every claim is a §POCLEG log line.
 * RUN: node poc_path_legal.js   (from this worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.js'));
const RoomGraph = require('./common/room_graph.js');

const HHS_DB = path.join(__dirname, 'buildings', 'HHS_Office_Federated_extracted.db');
const HHS_PATCH = path.join(__dirname, 'buildings', 'patches', 'HHS_Office_Federated_extracted.db.sql');
const DUPLEX_DB = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');

async function loadDb(SQL, dbPath, patchPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  if (patchPath) db.exec(fs.readFileSync(patchPath, 'utf8'));
  return function dbQuery(q, params) {
    const r = params ? db.exec(q, params) : db.exec(q);
    if (!r.length) return [];
    return r[0].values;
  };
}

// §G3 walkable-space union: room rects (from the graph's own room nodes) + floor-slab footprints
// (elements_meta/element_transforms, IfcSlab%, z within [storeyZ-2, storeyZ+1] — wall-center
// storey z sits above the slab, PR #763's gap-relative note).
function walkableUnion(graph, dbQuery, storey, log) {
  const rects = [];
  graph.nodes.forEach(n => {
    if (n.storey !== storey) return;
    n.rects.forEach(rc => rects.push(rc));
  });
  // storeyZ: mean cz of this storey's rooms — same derivation room_graph.js's buildGraph uses
  // internally (not exposed), recomputed here identically from the same graph.nodes data.
  const roomsHere = graph.nodes.filter(n => n.storey === storey);
  const storeyZ = roomsHere.reduce((s, n) => s + n.cz, 0) / (roomsHere.length || 1);
  let slabRows = [];
  try {
    slabRows = dbQuery("SELECT t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, m.element_name FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class LIKE 'IfcSlab%' AND t.center_x IS NOT NULL " +
      "AND t.center_z >= ? AND t.center_z <= ?", [storeyZ - 2, storeyZ + 1]) || [];
  } catch (e) { log('§POCLEG_SLAB_ERR ' + e.message); }
  const slabRects = slabRows.map(r => ({
    x0: r[0] - r[3] / 2, x1: r[0] + r[3] / 2, y0: r[1] - r[4] / 2, y1: r[1] + r[4] / 2
  }));
  // §ROOT-CAUSE PROBE: any single slab whose own AABB already spans most of the storey's full
  // room-rect extent is a concave (U/L-shaped) slab stored as ONE bounding box — its AABB
  // necessarily overreaches into any notch/courtyard, same failure mode as a concave room's AABB.
  if (rects.length) {
    const rx0 = Math.min(...rects.map(r => r.x0)), rx1 = Math.max(...rects.map(r => r.x1));
    const ry0 = Math.min(...rects.map(r => r.y0)), ry1 = Math.max(...rects.map(r => r.y1));
    const fullSpan = (rx1 - rx0) * (ry1 - ry0);
    slabRows.forEach((r, i) => {
      const sr = slabRects[i], area = (sr.x1 - sr.x0) * (sr.y1 - sr.y0);
      if (area > 0.7 * fullSpan) {
        log('§POCLEG_ROOTCAUSE storey=' + storey + ' slab="' + r[5] + '" bbox=' + (sr.x1 - sr.x0).toFixed(1) +
          'x' + (sr.y1 - sr.y0).toFixed(1) + 'm covers ' + (100 * area / fullSpan).toFixed(0) +
          '% of the storey\'s room-rect extent — a concave slab stored as one AABB, overreaching into any notch.');
      }
    });
  }
  log('§POCLEG walkable storey=' + storey + ' roomRects=' + rects.length + ' slabRects=' + slabRects.length +
    ' storeyZ=' + storeyZ.toFixed(2));
  return { rects: rects.concat(slabRects) };
}

function pointInUnion(union, px, py) {
  for (let i = 0; i < union.rects.length; i++) {
    const rc = union.rects[i];
    if (px >= rc.x0 && px <= rc.x1 && py >= rc.y0 && py <= rc.y1) return true;
  }
  return false;
}

// Sample a straight segment a->b @0.25m; return { illegal, sampled } counts.
function classifyChord(union, ax, ay, bx, by, step) {
  step = step || 0.25;
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / step));
  let illegal = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
    if (!pointInUnion(union, px, py)) illegal++;
  }
  return { illegal, sampled: n + 1, len };
}

// §G4 visibility-graph detour: nodes = this storey's door centers (doorwp nodes already in the
// graph) + the two chord endpoints; edge iff the straight segment between two points is legal
// per G3 (sample @0.25m). Dijkstra over that graph.
function buildDetour(graph, union, storey, ax, ay, bx, by, log) {
  const pts = [{ id: 'A', x: ax, y: ay }, { id: 'B', x: bx, y: by }];
  graph.nodes.forEach(() => {}); // no-op, doors come from nodesByGuid below
  Object.keys(graph.nodesByGuid).forEach(g => {
    const n = graph.nodesByGuid[g];
    if (n.kind === 'doorwp' && n.storey === storey) pts.push({ id: g, x: n.cx, y: n.cy });
  });
  const adj = pts.map(() => []);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const c = classifyChord(union, pts[i].x, pts[i].y, pts[j].x, pts[j].y);
      if (c.illegal === 0) {
        const w = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
        adj[i].push({ to: j, w }); adj[j].push({ to: i, w });
      }
    }
  }
  const dist = pts.map(() => Infinity), prev = pts.map(() => -1), visited = pts.map(() => false);
  dist[0] = 0;
  const pq = [0];
  while (pq.length) {
    pq.sort((a, b) => dist[a] - dist[b]);
    const u = pq.shift();
    if (visited[u]) continue;
    visited[u] = true;
    if (u === 1) break;
    adj[u].forEach(e => {
      const nd = dist[u] + e.w;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; pq.push(e.to); }
    });
  }
  if (dist[1] === Infinity) { log('§POCLEG detour NO_PATH doorCandidates=' + (pts.length - 2)); return null; }
  const hopIdx = [];
  let cur = 1;
  while (cur !== -1) { hopIdx.unshift(cur); cur = prev[cur]; }
  const hops = hopIdx.map(i => pts[i]);
  // sanity: every leg of the reconstructed detour must itself be legal (0 illegal points).
  let allLegal = 0, illegalPts = 0;
  for (let i = 0; i + 1 < hops.length; i++) {
    const c = classifyChord(union, hops[i].x, hops[i].y, hops[i + 1].x, hops[i + 1].y);
    illegalPts += c.illegal;
  }
  log('§POCLEG detour hops=' + (hops.length - 2) + ' len=' + dist[1].toFixed(1) + ' illegal_pts=' + illegalPts);
  return { hops, len: dist[1], illegalPts };
}

async function run() {
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.wasm')) });

  console.log('=== HHS (patched) — R18 -> R31, Level 1 ===');
  const hhsQuery = await loadDb(initSql, HHS_DB, HHS_PATCH);
  const hhsLog = m => console.log(m);
  const hhsGraph = RoomGraph.buildGraph(hhsQuery, { log: hhsLog });
  const r18 = hhsGraph.nodes.find(n => n.name === '≈ Level 1 R18');
  const r31 = hhsGraph.nodes.find(n => n.name === '≈ Level 1 R31');
  if (!r18 || !r31) { console.log('§POCLEG HHS_ROOMS_NOT_FOUND r18=' + !!r18 + ' r31=' + !!r31); process.exit(1); }
  const route = RoomGraph.shortestPath(hhsGraph, r18.guid, r31.guid);
  if (!route) { console.log('§POCLEG HHS_NO_ROUTE'); process.exit(1); }
  const hopNames = route.path.map(g => { const n = hhsGraph.nodesByGuid[g]; return n ? n.kind + ':' + n.name : g; });
  console.log('§POCLEG HHS route doors=' + route.doors.length + ' distance=' + route.distance.toFixed(1) + 'm path=' + hopNames.join(' | '));

  const hhsUnion = walkableUnion(hhsGraph, hhsQuery, 'Level 1', hhsLog);
  let hhsIllegalChords = 0;
  let firstIllegal = null;
  for (let i = 0; i + 1 < route.path.length; i++) {
    const a = hhsGraph.nodesByGuid[route.path[i]], b = hhsGraph.nodesByGuid[route.path[i + 1]];
    if (!a || !b || a.storey !== 'Level 1' || b.storey !== 'Level 1') continue; // same-storey chords only
    const c = classifyChord(hhsUnion, a.cx, a.cy, b.cx, b.cy);
    console.log('§POCLEG chord=' + a.name + '->' + b.name + ' len=' + c.len.toFixed(1) + 'm illegal_pts=' + c.illegal + '/' + c.sampled);
    if (c.illegal > 0) { hhsIllegalChords++; if (!firstIllegal) firstIllegal = { a, b }; }
  }
  console.log('§POCLEG HHS_SUMMARY illegal_chords=' + hhsIllegalChords + ' (expect >0 — the courtyard chord)');

  if (hhsIllegalChords === 0) {
    console.log('§POCLEG STOP: HHS courtyard chord did NOT classify illegal — walkable-space definition misfires on the primary control case. Reporting numbers, not improvising.');
    // Diagnostic only (not a fix, not applied): does dropping slabs from the union (room rects
    // alone) correctly flag this same chord illegal? Reported for the coordinator's decision.
    const roomOnlyRects = [];
    hhsGraph.nodes.forEach(n => { if (n.storey === 'Level 1') n.rects.forEach(rc => roomOnlyRects.push(rc)); });
    const roomsOnlyUnion = { rects: roomOnlyRects };
    const a0 = hhsGraph.nodesByGuid[route.path.find(g => { const n = hhsGraph.nodesByGuid[g]; return n && n.kind === 'doorwp'; })];
    const bEnd = r31;
    const diag = classifyChord(roomsOnlyUnion, a0.cx, a0.cy, bEnd.cx, bEnd.cy);
    console.log('§POCLEG DIAGNOSTIC room-rects-only (no slabs) for the same chord: illegal_pts=' + diag.illegal + '/' + diag.sampled +
      ' (' + (100 * diag.illegal / diag.sampled).toFixed(1) + '%) — reported for the coordinator, not applied as a fix.');
  } else {
    const d = buildDetour(hhsGraph, hhsUnion, 'Level 1', firstIllegal.a.cx, firstIllegal.a.cy, firstIllegal.b.cx, firstIllegal.b.cy, hhsLog);
    if (d) console.log('§POCLEG HHS detour vs chord: detourLen=' + d.len.toFixed(1) + 'm (chord was ' +
      Math.hypot(firstIllegal.b.cx - firstIllegal.a.cx, firstIllegal.b.cy - firstIllegal.a.cy).toFixed(1) + 'm — a lie)');
  }

  console.log('\n=== Duplex — all same-unit chords (control: convex, expect 0 illegal) ===');
  const dupQuery = await loadDb(initSql, DUPLEX_DB, null);
  const dupLog = m => console.log(m);
  const dupGraph = RoomGraph.buildGraph(dupQuery, { log: dupLog });
  const dupStoreys = Array.from(new Set(dupGraph.nodes.map(n => n.storey)));
  let dupTotalChords = 0, dupIllegalChords = 0;
  dupStoreys.forEach(storey => {
    const union = walkableUnion(dupGraph, dupQuery, storey, dupLog);
    const roomsHere = dupGraph.nodes.filter(n => n.storey === storey);
    for (let i = 0; i < roomsHere.length; i++) {
      for (let j = i + 1; j < roomsHere.length; j++) {
        const res = RoomGraph.shortestPath(dupGraph, roomsHere[i].guid, roomsHere[j].guid);
        if (!res) continue;
        for (let k = 0; k + 1 < res.path.length; k++) {
          const a = dupGraph.nodesByGuid[res.path[k]], b = dupGraph.nodesByGuid[res.path[k + 1]];
          if (!a || !b || a.storey !== storey || b.storey !== storey) continue;
          dupTotalChords++;
          const c = classifyChord(union, a.cx, a.cy, b.cx, b.cy);
          if (c.illegal > 0) {
            dupIllegalChords++;
            console.log('§POCLEG Duplex chord=' + a.name + '->' + b.name + ' storey=' + storey + ' illegal_pts=' + c.illegal + '/' + c.sampled);
          }
        }
      }
    }
  });
  console.log('§POCLEG Duplex_SUMMARY chords_checked=' + dupTotalChords + ' illegal_chords=' + dupIllegalChords + ' (expect 0)');

  console.log('\n§W-LEG-POC DONE hhs_illegal=' + hhsIllegalChords + ' duplex_illegal=' + dupIllegalChords);
  if (hhsIllegalChords === 0 || dupIllegalChords !== 0) {
    console.log('§W-LEG-POC GATE_FAIL — see preamble: STOP, do not improvise, report to coordinator.');
    process.exit(1);
  }
  console.log('§W-LEG-POC GATE_PASS');
}

run().catch(e => { console.error(e); process.exit(1); });
