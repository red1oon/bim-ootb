#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FULL-CONNECTIVITY scope (READ THE LOG after every run)
 * SCOPE: common/room_graph.js's NEW fullConnectivity() — answers the user's literal question
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
 * RUN: node witness_full_connectivity.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('../room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

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
    // Name every component's members (not just its size) so the actual gap is identified —
    // group node guids by component id, sorted smallest-first (the islands, not the main mass).
    const byComp = {};
    Object.keys(fc.comp).forEach(g => { const c = fc.comp[g]; (byComp[c] = byComp[c] || []).push(g); });
    const compIds = Object.keys(byComp).sort((a, b) => byComp[a].length - byComp[b].length);
    console.log('  §GAP_REPORT ' + fc.components + ' disconnected islands (excluding the largest):');
    compIds.slice(0, -1).forEach(cid => {
      const members = byComp[cid].map(g => {
        const n = graph.nodesByGuid[g];
        return n ? (n.kind + ':' + (n.name || g) + '@' + (n.storey || '?')) : g;
      });
      console.log('    island(size=' + members.length + '): ' + members.slice(0, 8).join(', ') + (members.length > 8 ? ', ...' : ''));
    });
  }
  db.close();
}

reportBuilding('Clinic', '/home/red1/bim-ootb/buildings/Clinic_extracted.db');
reportBuilding('HHS (raw, pre-patch — see §HOW-TO-TEST-LIVE, real count differs live)', '/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db');
reportBuilding('Duplex', '/home/red1/bim-ootb/buildings/Duplex_extracted.db');

console.log('\n§W-FULL-CONNECTIVITY DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
