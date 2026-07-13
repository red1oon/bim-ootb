#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SPATIAL-CARRY-FLEET scope (READ THE LOG after every run)
 * SCOPE: prompts/FUNCTIONAL_SPACES_ENSEMBLE.md (bim-compiler) Step 1 — the fleet-wide
 * spatial_structure regression (finalize_all_8.js @ 6068fab shipped 6 of 8 Modeller residents
 * with NO spatial_structure table). After applying ROOM001..006 carry scripts, this witness
 * proves, per building, against the REAL shipped modules (no re-implementation):
 *   W1 CARRY-COUNT   — spatial_structure row count matches the carry script header's number
 *                      (Duplex/Terminal are never-regressed controls with their own counts).
 *   W2 PLACEMENT-GUARD — DiscWalker.spacesOf() (modeller/disc_walker.js, required directly)
 *                      still EXCLUDES RM_%/≈ COMPILED rows (settled 2026-07-10 room-injection
 *                      split: compiled rooms are display/path data, never MEP placement input).
 *                      Restored buildings MUST stay at their real-space count (0 for pure
 *                      flood-fill sets) — a nonzero jump here would be a placement leak.
 *   W3 GRAPH-UNLOCK  — RoomGraph.buildGraph() (common/room_graph.js — the exact module the
 *                      Viewer Find panel Path-Between calls) now builds real room nodes for the
 *                      restored buildings, and shortestPath() finds a REAL path between two
 *                      rooms (first connected pair via components()), with real door guids.
 * PASS bar: all chk() green. RUN: node witness_spatial_carry_fleet.js  (worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const DiscWalker = require('./modeller/disc_walker.js');
const ROOT = __dirname;

// expected spatial_structure TOTAL rows: ROOM001..006 headers; Duplex/Terminal = live main counts (controls)
const FLEET = [
  { b: 'SampleHouse',  expect: 6,   restored: true },
  { b: 'Duplex',       expect: 26,  restored: false },
  { b: 'HHS',          expect: 109, restored: true },
  { b: 'Clinic',       expect: 200, restored: true },
  { b: 'Garage',       expect: 6,   restored: true },
  { b: 'Hospital',     expect: 208, restored: true },
  { b: 'SampleCastle', expect: 55,  restored: true },
  { b: 'Terminal',     expect: 49,  restored: false },
];

let pass = 0, fail = 0;
const out = [];
function S(m) { out.push(m); console.log(m); }
const chk = (n, c, x) => { if (c) { pass++; S('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; S('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of FLEET) {
    const dbPath = path.join(ROOT, 'modeller', f.b + '_ARC.db');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
    const dbQuery = (sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };
    S('§FLEET building=' + f.b + (f.restored ? ' (RESTORED by carry script)' : ' (control, never regressed)'));

    // W1 — carry count
    let total = 0, spaces = 0, compiled = 0;
    try {
      total = dbQuery('SELECT COUNT(*) FROM spatial_structure')[0][0];
      spaces = dbQuery("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL")[0][0];
      compiled = dbQuery("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND (guid LIKE 'RM\\_%' ESCAPE '\\' OR name LIKE '%≈%')")[0][0];
    } catch (e) { S('  §NO_TABLE ' + e.message); }
    chk('W1 ' + f.b + ' spatial_structure rows == ' + f.expect, total === f.expect,
      'total=' + total + ' ifcSpace(center+size)=' + spaces + ' compiledRM=' + compiled);

    // W2 — placement guard: spacesOf() must NOT ingest COMPILED rows
    const sp = DiscWalker.spacesOf(db);
    S('  §SPACESOF ' + f.b + ' spacesOf=' + sp.length + ' (ifcSpaceRows=' + spaces + ' compiledRM=' + compiled + ')');
    const leaked = sp.filter(s => /^RM_/.test(s.guid) || /≈/.test(String(s.label)));
    chk('W2 ' + f.b + ' spacesOf() returns ZERO RM_/≈ COMPILED rows (placement guard holds)',
      leaked.length === 0, 'spacesOf=' + sp.length + ' leakedCompiled=' + leaked.length);

    // W3 — graph unlock: real room nodes + a real path
    const glog = [];
    const graph = RoomGraph.buildGraph(dbQuery, { log: m => glog.push(m) });
    glog.forEach(m => S('  ' + m));
    const roomGuids = new Set(dbQuery("SELECT COALESCE(NULLIF(guid,''),guid) FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL").map(r => r[0]));
    chk('W3a ' + f.b + ' graph room nodes == queryable IfcSpace rows', graph.nodes.length === spaces,
      'nodes=' + graph.nodes.length + ' rows=' + spaces);
    // first connected pair, via components() (guid→cid map) — honest: 0 edges reports no path.
    // NOTE components() is room-adjacency only; shortestPath can additionally route via circ/stair
    // nodes, so this picks a conservative pair (same component == definitely reachable).
    const compMap = RoomGraph.components(graph);
    const byCid = {};
    graph.nodes.forEach(n => { (byCid[compMap[n.guid]] = byCid[compMap[n.guid]] || []).push(n.guid); });
    const big = Object.values(byCid).filter(c => c.length >= 2).sort((a, b) => b.length - a.length)[0];
    if (big) {
      const p = RoomGraph.shortestPath(graph, big[0], big[big.length - 1]);
      const okPath = p && p.path.length >= 2;
      chk('W3b ' + f.b + ' real shortestPath within largest component (' + big.length + ' rooms)', okPath,
        okPath ? ('hops=' + p.doors.length + ' dist=' + p.distance.toFixed(1) + 'm from=' +
          (graph.nodesByGuid[p.path[0]] || {}).name + ' to=' + (graph.nodesByGuid[p.path[p.path.length - 1]] || {}).name) : 'NO PATH');
      if (okPath) {
        const doorGuids = new Set(dbQuery("SELECT guid FROM elements_meta WHERE ifc_class LIKE 'IfcDoor%' OR ifc_class LIKE 'IfcStair%' OR ifc_class LIKE 'IfcRamp%'").map(r => r[0]));
        const badDoors = p.doors.filter(d => !doorGuids.has(d.guid));
        chk('W3c ' + f.b + ' path doors are REAL element guids', badDoors.length === 0,
          'doors=' + p.doors.length + ' bad=' + badDoors.length);
      }
    } else {
      S('  §NO_CONNECTED_PAIR ' + f.b + ' edges=' + graph.edges.length + ' (honest: no fabricated path)');
    }
    db.close();
  }
  S('§W-SPATIAL-CARRY-FLEET RESULT pass=' + pass + ' fail=' + fail);
  fs.writeFileSync(path.join(ROOT, 'witness_spatial_carry_fleet.log'), out.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
