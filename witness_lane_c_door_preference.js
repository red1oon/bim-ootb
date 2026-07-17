#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — OCCUPANT_PATHFINDER.md OPEN LANE C witness (READ THE LOG after every run)
 * SCOPE: exercises the SHIPPED common/room_graph.js's opts.metric='doors' (corridor-gated door-count
 * routing, added OPEN LANE C, 2026-07-18) directly through RoomGraph.shortestPath() — no
 * reimplementation. Two assertions:
 *   W1 — Clinic's reported live case (First Floor -> Second Floor, 12-door room-thread past a glass
 *        corridor door) collapses under opts.metric='doors' vs the default distance metric.
 *   W2 — Duplex regression: opts.metric='doors' must route every E1-reachable room pair through the
 *        SAME real doors as today's default distance metric (Duplex has no corridor for these pairs
 *        to prefer — the corridor-gate exists precisely so this stays byte-identical).
 * RUN: node witness_lane_c_door_preference.js   (from this worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.js'));
const RoomGraph = require('./common/room_graph.js');
const CLINIC_DB = path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Clinic_extracted.db');
const DUPLEX_DB = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');

async function openDb(SQL, dbPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  return (q, p) => { const r = p ? db.exec(q, p) : db.exec(q); return r.length ? r[0].values : []; };
}

let pass = 0, fail = 0;
function check(cond, label, detail) {
  if (cond) { pass++; console.log('  ✅ ' + label + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '  ' + detail : '')); }
}

(async () => {
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, 'modeller', 'lib', 'sql-wasm.wasm')) });

  console.log('=== W1: Clinic corridor-preference (shipped engine) ===');
  const dbQ = await openDb(initSql, CLINIC_DB);
  const graph = RoomGraph.buildGraph(dbQ, { log: () => {} });
  const a = graph.nodes.find(n => n.name === '≈ First Floor R23');
  const b = graph.nodes.find(n => n.name === '≈ Second Floor R1');
  check(!!(a && b), 'W1 pre-check: sample rooms exist in Clinic');
  if (a && b) {
    const distDefault = RoomGraph.shortestPath(graph, a.guid, b.guid);
    const distDoors = RoomGraph.shortestPath(graph, a.guid, b.guid, { metric: 'doors' });
    console.log('§W_LANE_C Clinic default-metric doors=' + distDefault.doors.length + ' distance=' + distDefault.distance.toFixed(1));
    console.log('§W_LANE_C Clinic doors-metric doors=' + distDoors.doors.length + ' cost=' + distDoors.distance.toFixed(2) +
      ' names=' + distDoors.doors.map(d => d.name).join(' | '));
    check(distDoors.doors.length < distDefault.doors.length,
      'W1a doors-metric route uses FEWER real-door hops than the default distance metric',
      'default=' + distDefault.doors.length + ' doors-metric=' + distDoors.doors.length);
    const kinds = distDoors.path.map(g => (graph.nodesByGuid[g] || {}).kind || '?');
    check(kinds.indexOf('circ') !== -1 || kinds.indexOf('spine') !== -1,
      'W1b doors-metric route includes a real corridor hop (circ/spine)', 'kinds=' + kinds.join(','));
  }

  console.log('=== W2: Duplex regression (shipped engine, default vs opts.metric=doors) ===');
  const dbQD = await openDb(initSql, DUPLEX_DB);
  const dupGraph = RoomGraph.buildGraph(dbQD, { log: () => {} });
  const rooms = dupGraph.nodes;
  let checked = 0, mismatches = 0;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const r1 = RoomGraph.shortestPath(dupGraph, rooms[i].guid, rooms[j].guid);
    if (!r1) continue;
    checked++;
    const r2 = RoomGraph.shortestPath(dupGraph, rooms[i].guid, rooms[j].guid, { metric: 'doors' });
    if (!r2 || JSON.stringify(r1.doors) !== JSON.stringify(r2.doors)) {
      mismatches++;
      console.log('  MISMATCH', rooms[i].name, '->', rooms[j].name);
    }
  }
  console.log('§W_LANE_C Duplex regression_pairs=' + checked + ' mismatches=' + mismatches);
  check(mismatches === 0, 'W2 Duplex doors-metric route == default-metric route for every reachable pair',
    'pairs=' + checked + ' mismatches=' + mismatches);

  console.log('\n§W-LANE-C-DOOR-PREFERENCE DONE pass=' + pass + ' fail=' + fail);
  if (fail > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
