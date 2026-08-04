#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATH-POC scope (READ THE LOG after every run)
 * SCOPE: OCCUPANT_PATHFINDER.md — exercises the SHIPPED common/room_graph.js (not the python POC
 * prototype) via sql.js against the three real corpora named in the spec's §GIVEN G5, reproducing
 * the POC-gate reachability numbers so the acceptance bar is checked against the ACTUAL engine that
 * ships, not just the calculation-only prototype it was ported from.
 * RUN: node witness_occupant_pathfinder.js   (from this worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const RoomGraph = require('../room_graph.js');

const TERMINAL_DB = path.join(__dirname, '..', '..', 'buildings', 'Terminal_extracted.db');
const TERMINAL_PATCH = path.join(__dirname, '..', '..', 'buildings', 'patches', 'Terminal_extracted.db.sql');
const JKR_DB = path.join(process.env.HOME, 'bim-ootb', 'buildings', 'JKR_extracted.db');
const DUPLEX_DB = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');

async function loadDb(SQL, dbPath, patchPath) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  if (patchPath) {
    const sql = fs.readFileSync(patchPath, 'utf8');
    db.exec(sql);
  }
  function dbQuery(q, params) {
    const r = params ? db.exec(q, params) : db.exec(q);
    if (!r.length) return [];
    return r[0].values;
  }
  return dbQuery;
}

function reachablePct(graph, edgeKinds) {
  const rooms = graph.nodes; // room-only, per API-compat
  const adj = {};
  rooms.forEach(n => adj[n.guid] = []);
  graph.edges.forEach(e => {
    if (edgeKinds && !edgeKinds.has(e.kind)) return;
    // For E1-only view, both endpoints are rooms already seeded; for full view, circ/exit nodes
    // aren't in `rooms`/`adj` (room-only per API-compat) so we need a wider adjacency including them.
  });
  // Build full adjacency across nodesByGuid for correct connectivity, then measure room-pairs.
  const allAdj = {};
  Object.keys(graph.nodesByGuid).forEach(g => allAdj[g] = []);
  graph.edges.forEach(e => {
    if (edgeKinds && !edgeKinds.has(e.kind)) return;
    if (!(e.a in allAdj) || !(e.b in allAdj)) return;
    allAdj[e.a].push(e.b); allAdj[e.b].push(e.a);
  });
  const comp = {}; let cid = 0;
  Object.keys(allAdj).forEach(g => {
    if (g in comp) return;
    const stack = [g]; comp[g] = cid;
    while (stack.length) {
      const u = stack.pop();
      (allAdj[u] || []).forEach(v => { if (!(v in comp)) { comp[v] = cid; stack.push(v); } });
    }
    cid++;
  });
  let total = 0, ok = 0, crossTotal = 0, crossOk = 0;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    total++;
    const same = comp[rooms[i].guid] === comp[rooms[j].guid];
    if (same) ok++;
    if (rooms[i].storey !== rooms[j].storey) { crossTotal++; if (same) crossOk++; }
  }
  return { pct: total ? 100 * ok / total : 0, crossPct: crossTotal ? 100 * crossOk / crossTotal : 0, crossTotal, comp };
}

async function run(name, SQL, dbPath, patchPath) {
  const dbQuery = await loadDb(SQL, dbPath, patchPath);
  const logLines = [];
  const graph = RoomGraph.buildGraph(dbQuery, { log: m => { logLines.push(m); console.log('[' + name + '] ' + m); } });
  const e1Only = reachablePct(graph, new Set(['E1']));
  const full = reachablePct(graph, null);
  console.log('§POCPATH ' + name + ' reachable_room_pairs=' + full.pct.toFixed(1) + '% (was ' + e1Only.pct.toFixed(1) +
    '% with E1 only) cross_storey_pairs_reachable=' + full.crossPct.toFixed(1) + '% (was ' + e1Only.crossPct.toFixed(1) +
    '%, n_cross_storey_pairs=' + full.crossTotal + ')');
  // zero-door ceiling (honesty check, see POC log/spec discussion)
  const deg = {};
  graph.nodes.forEach(n => deg[n.guid] = 0);
  graph.edges.forEach(e => { if (e.kind === 'E1' || e.kind === 'E2') { if (e.a in deg) deg[e.a]++; if (e.b in deg) deg[e.b]++; } });
  const doored = graph.nodes.filter(n => deg[n.guid] > 0);
  let dOk = 0, dTotal = 0;
  for (let i = 0; i < doored.length; i++) for (let j = i + 1; j < doored.length; j++) {
    dTotal++;
    if (full.comp[doored[i].guid] === full.comp[doored[j].guid]) dOk++;
  }
  const pctDoored = dTotal ? 100 * dOk / dTotal : 0;
  console.log('§POCPATH ' + name + ' zero_door_rooms=' + (graph.nodes.length - doored.length) +
    ' reachable_pct_of_doored_rooms=' + pctDoored.toFixed(1) + '%');
  return { graph, e1Only, full, pctDoored };
}

(async () => {
  const initSql = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  console.log('=== Terminal (patched) ===');
  const term = await run('Terminal', initSql, TERMINAL_DB, TERMINAL_PATCH);
  console.log('=== JKR ===');
  const jkr = await run('JKR', initSql, JKR_DB, null);
  console.log('=== Duplex ===');
  const dup = await run('Duplex', initSql, DUPLEX_DB, null);

  // W-PATH-DUPLEX-REGRESSION: E1-only shortest paths must be byte-identical before/after.
  console.log('=== Duplex E1-path regression (real shortestPath()) ===');
  const rooms = dup.graph.nodes;
  const compE1 = dup.e1Only.comp;
  let checked = 0, mismatches = 0;
  // Build an E1-only sub-graph (same shape) to compare against the full graph's shortestPath().
  const e1Graph = { nodes: dup.graph.nodes, nodesByGuid: dup.graph.nodesByGuid,
    edges: dup.graph.edges.filter(e => e.kind === 'E1') };
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    if (compE1[rooms[i].guid] !== compE1[rooms[j].guid]) continue;
    checked++;
    const r1 = RoomGraph.shortestPath(e1Graph, rooms[i].guid, rooms[j].guid);
    const r2 = RoomGraph.shortestPath(dup.graph, rooms[i].guid, rooms[j].guid);
    if (!r1 || !r2 || JSON.stringify(r1.path) !== JSON.stringify(r2.path) || Math.abs(r1.distance - r2.distance) > 1e-6) {
      mismatches++;
      console.log('  MISMATCH', rooms[i].name, '->', rooms[j].name, JSON.stringify(r1), JSON.stringify(r2));
    }
  }
  console.log('§POCPATH Duplex regression_checked_pairs=' + checked + ' mismatches=' + mismatches);

  // W-PATH-TERMINAL sample cross-storey path + W-PATH-ESCAPE
  console.log('=== Terminal cross-storey sample + escape route ===');
  const tRooms = term.graph.nodes;
  const tanah = tRooms.filter(n => n.storey === 'Aras Tanah');
  const aras04 = tRooms.filter(n => n.storey === 'Aras 04');
  let sampleA = null, sampleB = null;
  outer:
  for (const a of tanah) for (const b of aras04) {
    if (term.full.comp[a.guid] === term.full.comp[b.guid]) { sampleA = a; sampleB = b; break outer; }
  }
  if (sampleA && sampleB) {
    const res = RoomGraph.shortestPath(term.graph, sampleA.guid, sampleB.guid);
    const hopNames = res.path.map(g => {
      const n = term.graph.nodesByGuid[g];
      return n ? (n.kind + ':' + n.name) : g;
    });
    console.log('§POCPATH Terminal sample: ' + sampleA.name + ' -> ' + sampleB.name +
      ' hops=' + res.doors.length + ' total=' + res.distance.toFixed(1) + 'm');
    console.log('§POCPATH Terminal sample path: ' + hopNames.join(' | '));
  } else {
    console.log('§POCPATH Terminal sample: NO cross-storey Tanah->Aras04 pair reachable');
  }
  const escFrom = tRooms.find(n => term.full.comp[n.guid] != null);
  const esc = RoomGraph.escapeRoute(term.graph, escFrom.guid, { log: console.log });
  console.log('§POCPATH Terminal escape: from=' + escFrom.name + ' result=' + (esc ? ('exit=' + esc.exitGuid + ' hops=' + esc.doors.length + ' distance=' + esc.distance.toFixed(1)) : 'NONE'));

  console.log('\n§W-PATH-POC DONE');
})().catch(e => { console.error(e); process.exit(1); });
