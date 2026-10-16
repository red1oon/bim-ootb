#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PVS-CORRECT scope (READ THE LOG after every run)
 * SCOPE: FLY_TOUR_DLOD_SCALE.md §16 — exercises the SHIPPED common/room_graph.js's buildRoomPVS()
 * via sql.js against real LTU_AHouse + Terminal graphs (pure Node, no browser). Proves: (1) every
 * room's own PVS always contains itself, (2) an INDEPENDENT from-scratch 0-1 BFS reimplementation
 * agrees with the shipped function exactly, (3) sane, reportable size numbers (rooms, avg visible,
 * max visible) — not just "it ran".
 * RUN: node witness/w_pvs_correct.js   (from this worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const RoomGraph = require('../common/room_graph.js');

const BUILDINGS = [
  { name: 'LTU_AHouse', db: path.join(__dirname, '..', 'buildings', 'LTU_AHouse_extracted.db'), patch: null },
  { name: 'Terminal', db: path.join(process.env.HOME, 'bim-ootb', 'buildings', 'Terminal_extracted.db'),
    patch: path.join(process.env.HOME, 'bim-ootb', 'buildings', 'patches', 'Terminal_extracted.db.sql') },
];

async function loadDb(SQL, dbPath, patchPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  if (patchPath && fs.existsSync(patchPath)) db.exec(fs.readFileSync(patchPath, 'utf8'));
  return function dbQuery(q, params) {
    const r = params ? db.exec(q, params) : db.exec(q);
    if (!r.length) return [];
    return r[0].values;
  };
}

// Independent reimplementation of the SAME 0-1 BFS rule (E1/E3 cost 1, everything else free,
// E4 excluded), written separately from common/room_graph.js's buildRoomPVS — a genuine
// cross-check, not the same code asking itself if it's right.
function referencePVS(graph, maxCross) {
  const adj = {};
  const add = (a, b, cost) => {
    if (!a || !b || a === b) return;
    (adj[a] = adj[a] || []).push([b, cost]);
    (adj[b] = adj[b] || []).push([a, cost]);
  };
  for (const e of graph.edges) {
    if (e.kind === 'E4') continue;
    add(e.a, e.b, (e.kind === 'E1' || e.kind === 'E3') ? 1 : 0);
  }
  const roomKind = {};
  for (const n of graph.nodes) roomKind[n.guid] = true;
  const pvs = {};
  for (const start of graph.nodes.map(n => n.guid)) {
    const dist = { [start]: 0 };
    const stack = [start]; // plain DFS-with-relax is fine at this scale for an independent check
    let changed = true;
    while (changed) {
      changed = false;
      for (const u of Object.keys(dist)) {
        for (const [v, cost] of (adj[u] || [])) {
          const nd = dist[u] + cost;
          if (nd <= maxCross && (dist[v] === undefined || nd < dist[v])) { dist[v] = nd; changed = true; }
        }
      }
    }
    const visible = {};
    for (const g of Object.keys(dist)) if (roomKind[g]) visible[g] = true;
    pvs[start] = visible;
  }
  return pvs;
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  let allPass = true;
  for (const b of BUILDINGS) {
    if (!fs.existsSync(b.db)) { console.log('§PVS_CORRECT_SKIP building=' + b.name + ' (db not found)'); continue; }
    const dbQuery = await loadDb(SQL, b.db, b.patch);
    const graph = RoomGraph.buildGraph(dbQuery, {});
    const shipped = RoomGraph.buildRoomPVS(graph, { maxDoorCrossings: 1 });
    const reference = referencePVS(graph, 1);

    // Check 1: self-membership
    let selfMissing = 0;
    for (const g of Object.keys(shipped)) if (!shipped[g][g]) selfMissing++;

    // Check 2: shipped === reference, room-by-room, guid-by-guid
    let mismatchRooms = 0, mismatchDetail = [];
    const allRoomGuids = new Set([...Object.keys(shipped), ...Object.keys(reference)]);
    for (const g of allRoomGuids) {
      const sSet = new Set(Object.keys(shipped[g] || {}));
      const rSet = new Set(Object.keys(reference[g] || {}));
      if (sSet.size !== rSet.size || [...sSet].some(x => !rSet.has(x))) {
        mismatchRooms++;
        if (mismatchDetail.length < 3) mismatchDetail.push({ room: g, shipped: [...sSet].sort(), reference: [...rSet].sort() });
      }
    }

    // Size stats
    const sizes = Object.keys(shipped).map(g => Object.keys(shipped[g]).length);
    const avg = sizes.length ? (sizes.reduce((a, c) => a + c, 0) / sizes.length) : 0;
    const max = sizes.length ? Math.max(...sizes) : 0;
    const min = sizes.length ? Math.min(...sizes) : 0;
    const edgeCounts = {};
    for (const e of graph.edges) edgeCounts[e.kind] = (edgeCounts[e.kind] || 0) + 1;

    const pass = (selfMissing === 0 && mismatchRooms === 0);
    allPass = allPass && pass;
    console.log('§PVS_CORRECT building=' + b.name + ' rooms=' + graph.nodes.length +
      ' edges=' + JSON.stringify(edgeCounts) + ' selfMissing=' + selfMissing +
      ' mismatchRooms=' + mismatchRooms + ' avgVisible=' + avg.toFixed(1) +
      ' minVisible=' + min + ' maxVisible=' + max + ' verdict=' + (pass ? 'PASS' : 'FAIL'));
    if (mismatchDetail.length) console.log('§PVS_CORRECT_MISMATCH_DETAIL ' + JSON.stringify(mismatchDetail));
  }
  console.log('§PVS_CORRECT_OVERALL verdict=' + (allPass ? 'PASS' : 'FAIL'));
  process.exit(allPass ? 0 : 1);
})().catch(e => { console.error('ERR', e.stack); process.exit(1); });
