#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-CORRIDOR-ROOM-BACKPROP scope (READ THE LOG after every run)
 * SCOPE: room_graph.js's §CORRIDOR-ROOM-BACKPROP — the hallway backbone (built from RAW doors+
 * walls, independent of room compilation) injects a real 'room' node for every joined bucket that
 * has NO compiled room there at all. User's own framing: "backward propagation" — evidence found
 * by the routing layer flows back into the room layer instead of staying siloed.
 * ISSUES THIS EXPOSES:
 *   B1 REAL-GAIN — HHS (sparse-wall federated, only 14 compiled rooms for the whole building)
 *       must show a MEASURED increase in reachable room-pairs, not just more total rooms.
 *   B2 NO-SHADOW — a real bug found+fixed same session: a centroid-only "already covered" test
 *       let a corridor rect (span+width) substantially overlap and steal a real room's own doors
 *       (RM_First_Floor_10 went from 1 edge to 0 before the fix). A real rect-overlap-area guard
 *       replaced it. This witness proves NO injected corridor room ever overlaps a real room by
 *       more than the guard's own threshold, on both buildings.
 *   B3 NO-REGRESSION — Clinic's already-verified R10->R5 real-stair path must still resolve.
 * RUN: node witness_corridor_room_backprop.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('../room_graph.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function rectOverlapArea(a, c) {
  const ox = Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0));
  const oy = Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
  return ox * oy;
}

function reachablePairs(graph) {
  const rooms = graph.nodes.map(n => n.guid);
  let reachable = 0, total = 0;
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    total++;
    if (RoomGraph.shortestPath(graph, rooms[i], rooms[j])) reachable++;
  }
  return { reachable, total };
}

function noShadowCheck(graph, label) {
  const corridorRooms = graph.nodes.filter(n => n.guid.indexOf('CORRIDOR_ROOM::') === 0);
  const realRooms = graph.nodes.filter(n => n.guid.indexOf('CORRIDOR_ROOM::') !== 0);
  let worstOverlap = 0;
  corridorRooms.forEach(cr => {
    realRooms.forEach(rr => {
      if (rr.storey !== cr.storey) return;
      rr.rects.forEach(rc => { worstOverlap = Math.max(worstOverlap, rectOverlapArea(rc, cr.rects[0])); });
    });
  });
  chk('B2 (' + label + ') no injected corridor room overlaps a real room by more than the 0.5m^2 guard threshold',
    worstOverlap <= 0.5, 'corridorRooms=' + corridorRooms.length + ' worstOverlap=' + worstOverlap.toFixed(2) + 'm^2');
}

console.log('§W-CORRIDOR-ROOM-BACKPROP');

// ── HHS: the real-gain case ──
{
  const db = new Database('/home/red1/bim-ootb/buildings/HHS_Office_Federated_extracted.db', { readonly: true });
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  const r = reachablePairs(graph);
  const pct = 100 * r.reachable / r.total;
  console.log('§HHS rooms=' + graph.nodes.length + ' reachable=' + r.reachable + '/' + r.total + ' (' + pct.toFixed(1) + '%)');
  chk('B1 HHS reachable-pair percentage measurably improved beyond the pre-backprop baseline (17.6%)', pct > 25, pct.toFixed(1) + '%');
  noShadowCheck(graph, 'HHS');
  db.close();
}

// ── Clinic: the no-regression + no-shadow case ──
{
  const db = new Database('/home/red1/bim-ootb/buildings/Clinic_extracted.db', { readonly: true });
  function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }
  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  noShadowCheck(graph, 'Clinic');
  const r10r5 = RoomGraph.shortestPath(graph, 'RM_First_Floor_10', 'RM_Second_Floor_5');
  chk('B3 Clinic\'s known real cross-floor pair (First Floor R10 -> Second Floor R5) still resolves via a real stair',
    !!(r10r5 && r10r5.path.some(g => graph.nodesByGuid[g].kind === 'stairwp')),
    r10r5 ? ('distance=' + r10r5.distance.toFixed(1) + ' hops=' + r10r5.path.length) : 'NULL');
  const r10 = graph.nodesByGuid['RM_First_Floor_10'];
  const r10Edges = graph.edges.filter(e => e.a === 'RM_First_Floor_10' || e.b === 'RM_First_Floor_10').length;
  chk('B3b RM_First_Floor_10 (the room that lost all its edges pre-fix) has real edges again', r10Edges > 0, 'edges=' + r10Edges);
  db.close();
}

console.log('\n§W-CORRIDOR-ROOM-BACKPROP DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
