#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EGRESS-TRAVEL scope (READ THE LOG after every run)
 * SCOPE: prompts/EGRESS_SANITY.md T1 — validate the travel-distance rule against REAL
 * Hospital data using common/room_graph.js directly (Node, no browser needed — the module
 * is schema-only, dbQuery in, same code path viewer/navigate_find.js calls at runtime).
 * RUN: node witness_egress_travel_distance.js
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   E1 NO-EXIT-YET — RoomGraph.escapeRoute() (nearest EXIT node) returns null for every room,
 *                    fleet-wide, by the module's own documented design (§G1-EXIT-IS-A-LIFT-DOOR,
 *                    exits=0 until a real exterior-door test lands) — confirmed here on Hospital,
 *                    not assumed from the comment alone. The original "distance to exit" framing
 *                    in EGRESS_SANITY.md cannot be built on escapeRoute() today.
 *   E2 CIRC-SPINE-REACHABLE — the achievable v1 proxy instead: shortestPath(room, CIRC::<storey>)
 *                    — distance from a room to its own storey's circulation spine. Real, computed,
 *                    non-invented.
 *   E3 ISOLATED-ROOMS — rooms with NO path to their own storey's spine at all are a real,
 *                    directly life-safety-relevant finding in their own right (worse than a long
 *                    travel distance — no measured route out at all).
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const DB_PATH = path.join(__dirname, 'buildings', 'Hospital_meta.db');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  console.log('§W-EGRESS-TRAVEL building=' + DB_PATH);
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  function dbQuery(sql, params) {
    const r = params ? db.exec(sql, params) : db.exec(sql);
    if (!r.length) return [];
    return r[0].values;
  }

  const graph = RoomGraph.buildGraph(dbQuery, { log: () => {} });
  console.log('§GRAPH nodes=' + graph.nodes.length + ' edges=' + graph.edges.length);
  chk('G0 real graph built from real Hospital data', graph.nodes.length > 0);

  // E1 — confirm escapeRoute is a real dead end today, not assumed from the source comment.
  const escAll = graph.nodes.map(r => RoomGraph.escapeRoute(graph, r.guid, { log: () => {} }));
  const escReachable = escAll.filter(Boolean).length;
  console.log('§ESCAPE_ROUTE reachable=' + escReachable + '/' + graph.nodes.length);
  chk('E1 escapeRoute (nearest EXIT) is null for every room — confirms exits=0 blocks the ' +
    'original "distance to exit" rule as speced, not usable until real exterior-door detection lands',
    escReachable === 0, 'reachable=' + escReachable);

  // E2 — real v1 proxy: distance to own-storey circulation spine.
  let reachable = 0, unreachable = 0;
  const dists = [];
  graph.nodes.forEach(r => {
    const circGuid = 'CIRC::' + r.storey;
    if (!graph.nodesByGuid[circGuid]) { unreachable++; return; }
    const sp = RoomGraph.shortestPath(graph, r.guid, circGuid);
    if (!sp) { unreachable++; return; }
    reachable++;
    dists.push({ room: r.label || r.guid, storey: r.storey, distance: sp.distance });
  });
  dists.sort((a, b) => b.distance - a.distance);
  console.log('§EGRESS_TRAVEL rooms=' + graph.nodes.length + ' reachable_to_own_circ=' + reachable +
    ' unreachable=' + unreachable);
  dists.slice(0, 5).forEach(x => console.log('  farthest: ' + x.distance.toFixed(1) + 'm  ' + x.room +
    ' (' + x.storey + ')'));
  const median = dists.length ? dists[Math.floor(dists.length / 2)].distance : null;
  console.log('§EGRESS_MEDIAN ' + (median !== null ? median.toFixed(1) : 'n/a') + 'm');
  chk('E2 room-to-own-circulation-spine distance is computable for the large majority of rooms',
    reachable / graph.nodes.length > 0.9, 'reachable=' + reachable + '/' + graph.nodes.length);

  // E3 — isolated rooms are themselves a real, separate life-safety finding.
  console.log('§ISOLATED_ROOMS count=' + unreachable);
  chk('E3 isolated-room count is a small minority, not a graph-building failure',
    unreachable < graph.nodes.length * 0.2, 'unreachable=' + unreachable + '/' + graph.nodes.length);

  // Sanity flag (not pass/fail — a note for the reader): the farthest outliers exceed what's
  // plausible for a simple room-to-corridor hop and warrant a manual look before trusting them
  // as a real threshold input, same discipline as Structural Sanity's validated numbers.
  const suspicious = dists.filter(x => x.distance > 100).length;
  console.log('§SUSPICIOUS_OUTLIERS over_100m=' + suspicious +
    ' — NOT yet root-caused (real sprawling floor plate vs. a routing artifact); before ' +
    'trusting warning_m/critical_m defaults, inspect these specific rooms in the viewer.');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
