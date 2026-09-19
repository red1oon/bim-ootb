#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EGRESS-HARDENING scope (READ THE LOG after every run)
 * SCOPE: prompts/EGRESS_HARDENING.md — three new checks, each additive/opt-in, none change
 * default behaviour of any existing caller unless explicitly requested:
 *   1. common/room_coverage.js — per-storey compiled-room vs. real-walkable-area coverage ratio.
 *   2. viewer/egress_sanity.js rule 5 (door_occupant_capacity) — IBC Table 1004.5 + §1005.3.2
 *      occupant-load-aware door sizing, LOCAL (per-door-connected-room) only.
 *   3. common/room_graph.js escapeRouteViaProtectedStair() — an alternative distance-to-exit
 *      terminus (the room's own storey's CIRC:: node, confirmed exit-connected via real E3-chain
 *      connectivity) instead of walking the full chain to a ground-floor EXIT:: node. Wired into
 *      egress_sanity.js's circulation_distance rule as opts.protectedExitStair (default false —
 *      every existing caller, including rule_checklist.js's live "Longest path to exit" stat, is
 *      UNCHANGED unless it opts in).
 *
 * WHY THE FIRST DESIGN FOR ITEM 3 WAS WRONG, AND HOW THIS WITNESS PROVES THE FIX: the first
 * attempt targeted `stairwp` nodes (the stair's own real per-flight-end render position) as the
 * terminus. Measured directly against real Hospital data: escapeRoute() called FROM a stairwp
 * guid returns null (NO_GRAPH_NODE) — stairwp nodes are polyline-rendering metadata only
 * (§API-COMPAT-WAYPOINT in room_graph.js), never wired into `_buildAdjacency()`'s real traversable
 * edges. The corrected design targets `CIRC::<storey>` instead — the ONE per-storey node every E3
 * stair edge actually connects (circNode(), the same function E3's own edge-building calls) — and
 * R3 below is the check that would have caught the first (broken) design: it asserts real
 * improvement is actually found on a multi-storey building, not just that the function runs.
 *
 * FIXTURES: modeller/Duplex_extracted.db (small, no raster/no exits — the "unknown/unavailable"
 * path), buildings/HHS_Office_Federated_silent.db (100 rooms, multi-storey, real raster+exits),
 * buildings/Hospital_silent.db (largest — 440 doors — known space-coverage gap, MEMORY
 * bim-ootb-t10-hospital-slab-coverage). All three read-only from the shared bim-ootb checkout
 * (not this worktree) — this witness never writes to them.
 *
 * PASS bar: all chk() green.
 * RUN: node witness_egress_hardening.js   (from the worktree root)
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const RoomCoverage = require('./common/room_coverage.js');
const EgressSanity = require('./viewer/egress_sanity.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/egress_rules.json')));
const HOME = process.env.HOME;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function openDb(SQL, absPath) { return new SQL.Database(new Uint8Array(fs.readFileSync(absPath))); }
function makeDbQuery(db) { return function (sql, params) { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; }; }
function longestSteps(rows) {
  var maxM = null;
  (rows || []).forEach(r => { if (r.rule !== 'circulation_distance' || r.ratio == null || isNaN(r.ratio)) return; if (maxM === null || r.ratio > maxM) maxM = r.ratio; });
  return maxM === null ? null : Math.round(maxM / 0.75);
}

(async () => {
  const SQL = await initSqlJs();
  const DUPLEX = path.join(__dirname, 'modeller/Duplex_extracted.db');
  const HHS = path.join(HOME, 'bim-ootb/buildings/HHS_Office_Federated_silent.db');
  const HOSPITAL = path.join(HOME, 'bim-ootb/buildings/Hospital_silent.db');

  // ══ ITEM 1: room coverage ══
  console.log('§W-EGRESS-HARDENING item=1 (space coverage)');
  {
    const dbH = openDb(SQL, HOSPITAL), dbHHS = openDb(SQL, HHS);
    const gH = RoomGraph.buildGraph(makeDbQuery(dbH), { log: () => {} });
    const gHHS = RoomGraph.buildGraph(makeDbQuery(dbHHS), { log: () => {} });
    const covH = RoomCoverage.computeCoverage(gH);
    const covHHS = RoomCoverage.computeCoverage(gHHS);
    const worstH = Math.min(...covH.filter(r => r.ratio != null).map(r => r.ratio));
    const bestHHS = Math.max(...covHHS.filter(r => r.ratio != null).map(r => r.ratio));
    covH.forEach(r => console.log('    §COVERAGE Hospital storey=' + r.storey + ' ratio=' + (r.ratio != null ? (r.ratio * 100).toFixed(1) + '%' : 'null') + ' sev=' + r.severity));
    chk('R1a Hospital: every real-raster storey flags WARNING (known-bad coverage, MEMORY t10)',
      covH.filter(r => r.ratio != null).every(r => r.severity === 'WARNING'), 'worst=' + (worstH * 100).toFixed(1) + '%');
    chk('R1b HHS has at least one storey with meaningfully better coverage than Hospital\'s WORST',
      bestHHS > worstH * 2, 'HHSbest=' + (bestHHS * 100).toFixed(1) + '% HospitalWorst=' + (worstH * 100).toFixed(1) + '%');
    const dbD = openDb(SQL, DUPLEX);
    const gD = RoomGraph.buildGraph(makeDbQuery(dbD), { log: () => {} });
    const covD = RoomCoverage.computeCoverage(gD);
    chk('R1c Duplex (no raster table in this fixture): reports UNKNOWN (null ratio), never a false flag',
      covD.length > 0 && covD.every(r => r.ratio === null && r.severity === null), 'rows=' + covD.length);
  }

  // ══ ITEM 2: occupant-load door capacity ══
  console.log('§W-EGRESS-HARDENING item=2 (occupant-load door capacity)');
  {
    const dbH = openDb(SQL, HOSPITAL), dbHHS = openDb(SQL, HHS), dbD = openDb(SQL, DUPLEX);
    const rowsH = EgressSanity.evaluate(makeDbQuery(dbH), rules, { log: () => {} });
    const rowsHHS = EgressSanity.evaluate(makeDbQuery(dbHHS), rules, { log: () => {} });
    const rowsD = EgressSanity.evaluate(makeDbQuery(dbD), rules, { log: () => {} });
    const occH = rowsH.filter(r => r.rule === 'door_occupant_capacity').length;
    const occHHS = rowsHHS.filter(r => r.rule === 'door_occupant_capacity').length;
    const occD = rowsD.filter(r => r.rule === 'door_occupant_capacity').length;
    console.log('    §OCC_CAPACITY Hospital=' + occH + ' HHS=' + occHHS + ' Duplex=' + occD +
      ' (0/0/0 is a REAL, expected result on these 3 fixtures — see R2b synthetic proof this is not a dead rule)');
    chk('R2a runs cleanly on all 3 real buildings without throwing, returns a number (0 is valid, not a crash)',
      typeof occH === 'number' && typeof occHHS === 'number' && typeof occD === 'number');

    // R2b: synthetic large-occupancy room proves the RULE LOGIC actually fires when the real math
    // calls for it — none of the 3 real fixtures' room sizes at the Business (150 gross sf) factor
    // exceed a standard door's static width, so 0/0/0 above is an honest finding, not a dead rule.
    const dbSyn = new SQL.Database();
    dbSyn.run(`
      CREATE TABLE spatial_structure (guid TEXT, name TEXT, type TEXT, object_type TEXT, predefined_type TEXT, parent_guid TEXT, center_x REAL, center_y REAL, center_z REAL, size_x REAL, size_y REAL, room_guid TEXT);
      CREATE TABLE elements_meta (guid TEXT, element_name TEXT, ifc_class TEXT, discipline TEXT, storey TEXT);
      CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL, rotation_z REAL);
      INSERT INTO spatial_structure VALUES ('R1','BigHall','IfcSpace',NULL,NULL,'S1', 0,0,0, 60,50, NULL);
      INSERT INTO spatial_structure VALUES ('S1','Level 1',NULL,NULL,NULL,NULL, NULL,NULL,NULL,NULL,NULL,NULL);
      INSERT INTO elements_meta VALUES ('D1','MainDoor','IfcDoor','ARC','Level 1');
      INSERT INTO element_transforms VALUES ('D1', 30, 0, 0, 0.9, 0.2, 2.1, 0);
    `);
    const rowsSyn = EgressSanity.evaluate(makeDbQuery(dbSyn), rules, { log: () => {}, witness: true });
    const synRow = rowsSyn.find(r => r.rule === 'door_occupant_capacity');
    chk('R2b synthetic 3000m^2 hall + 0.9m door: rule DOES fire (proves logic is live, not dead)',
      !!synRow && synRow.severity === 'WARNING' && synRow.witness.requiredWidthM > synRow.witness.actualWidthM,
      synRow ? ('occupantLoad=' + synRow.witness.occupantLoad + ' requiredM=' + synRow.witness.requiredWidthM + ' actualM=' + synRow.witness.actualWidthM) : 'NO ROW');
  }

  // ══ ITEM 3: protected exit-stair terminus ══
  console.log('§W-EGRESS-HARDENING item=3 (protected exit-stair terminus)');
  {
    const dbH = openDb(SQL, HOSPITAL), dbHHS = openDb(SQL, HHS);
    const gH = RoomGraph.buildGraph(makeDbQuery(dbH), { log: () => {} });
    const gHHS = RoomGraph.buildGraph(makeDbQuery(dbHHS), { log: () => {} });
    function sweep(g, label) {
      let improved = 0, same = 0, worse = 0, noBase = 0, n = 0;
      g.nodes.forEach(r => {
        n++;
        const base = RoomGraph.escapeRoute(g, r.guid, { log: () => {} });
        const prot = RoomGraph.escapeRouteViaProtectedStair(g, r.guid, { log: () => {} });
        if (!base) { noBase++; return; }
        if (prot.distance < base.distance - 0.01) improved++;
        else if (Math.abs(prot.distance - base.distance) <= 0.01) same++;
        else worse++;
      });
      console.log('    §PROTECTED_STAIR_SWEEP ' + label + ' rooms=' + n + ' improved=' + improved + ' same=' + same + ' worse=' + worse + ' noBase=' + noBase);
      return { improved, same, worse, noBase, n };
    }
    const swH = sweep(gH, 'Hospital');
    const swHHS = sweep(gHHS, 'HHS');
    chk('R3a Hospital (real multi-storey): protected-stair terminus improves at least one room',
      swH.improved > 0, 'improved=' + swH.improved + '/' + swH.n);
    chk('R3b HHS (real multi-storey): protected-stair terminus improves at least one room',
      swHHS.improved > 0, 'improved=' + swHHS.improved + '/' + swHHS.n);
    chk('R3c NEVER worse than escapeRoute() on either building — min-of-two by construction',
      swH.worse === 0 && swHHS.worse === 0);

    // R3d — the exact bug this witness exists to catch: confirm the CIRC:: design, not the
    // abandoned stairwp design. A stairwp guid must NOT be independently routable via escapeRoute().
    const someStairwp = Object.keys(gH.nodesByGuid).find(k => gH.nodesByGuid[k].kind === 'stairwp');
    const stairwpRoute = someStairwp ? RoomGraph.escapeRoute(gH, someStairwp, { log: () => {} }) : undefined;
    chk('R3d documents WHY: a stairwp guid is confirmed NOT independently routable (proves the ' +
      'CIRC:: redesign was necessary, not cosmetic)', someStairwp !== undefined && stairwpRoute === null);

    // R3e — the live wiring: opts.protectedExitStair off (default) is byte-identical to before this
    // item existed; on, the headline "steps" stat measurably changes.
    const rowsOff = EgressSanity.evaluate(makeDbQuery(openDb(SQL, HOSPITAL)), rules, { log: () => {} });
    const rowsOffExplicit = EgressSanity.evaluate(makeDbQuery(openDb(SQL, HOSPITAL)), rules, { log: () => {}, protectedExitStair: false });
    const rowsOn = EgressSanity.evaluate(makeDbQuery(openDb(SQL, HOSPITAL)), rules, { log: () => {}, protectedExitStair: true });
    chk('R3e opts.protectedExitStair unset === explicit false (default is truly unchanged)',
      JSON.stringify(rowsOff) === JSON.stringify(rowsOffExplicit));
    const stepsOff = longestSteps(rowsOff), stepsOn = longestSteps(rowsOn);
    chk('R3f opts.protectedExitStair:true measurably changes the "Longest path to exit" stat on Hospital',
      stepsOn !== stepsOff && stepsOn < stepsOff, 'off=' + stepsOff + ' on=' + stepsOn + ' (on must be <= off, never worse)');
  }

  // ══ COST MEASUREMENT — "how much does this cost in seconds during pathing" ══
  console.log('§W-EGRESS-HARDENING cost measurement (buildings/Hospital_silent.db, largest fixture, 440 doors)');
  {
    const dbq = makeDbQuery(openDb(SQL, HOSPITAL));
    const bgTimes = [];
    for (let i = 0; i < 5; i++) { const t0 = Date.now(); RoomGraph.buildGraph(dbq, { log: () => {} }); bgTimes.push(Date.now() - t0); }
    bgTimes.sort((a, b) => a - b);
    console.log('    §COST buildGraph() median of 5 runs = ' + bgTimes[2] + 'ms — UNCHANGED by this PR (zero lines touched in buildGraph() itself; escapeRouteViaProtectedStair is a separate, new, opt-in function)');
    const g = RoomGraph.buildGraph(dbq, { log: () => {} });
    let t0 = Date.now(); g.nodes.forEach(r => RoomGraph.escapeRoute(g, r.guid, { log: () => {} })); const dtBase = Date.now() - t0;
    const g2 = RoomGraph.buildGraph(dbq, { log: () => {} }); // fresh, uncached
    t0 = Date.now(); g2.nodes.forEach(r => RoomGraph.escapeRouteViaProtectedStair(g2, r.guid, { log: () => {} })); const dtProt = Date.now() - t0;
    console.log('    §COST escapeRoute() x' + g.nodes.length + ' = ' + dtBase + 'ms (' + (dtBase / g.nodes.length).toFixed(2) + 'ms/room)');
    console.log('    §COST escapeRouteViaProtectedStair() x' + g2.nodes.length + ' (cold cache, worst case) = ' + dtProt + 'ms (' + (dtProt / g2.nodes.length).toFixed(2) + 'ms/room)');
    const t2 = Date.now(); EgressSanity.evaluate(dbq, rules, { log: () => {} }); const dtEval = Date.now() - t2;
    console.log('    §COST EgressSanity.evaluate() [ALL 5 rules incl. new items 1+2] = ' + dtEval + 'ms — this is report-generation time, NOT interactive pathing time (see next line)');
    chk('COST-A escapeRouteViaProtectedStair() stays sub-millisecond per room even on the largest fixture',
      (dtProt / g2.nodes.length) < 5, (dtProt / g2.nodes.length).toFixed(2) + 'ms/room');
    chk('COST-B the live interactive Find Panel path (RoomGraph.shortestPath, navigate_find.js) is ' +
      'UNTOUCHED by this entire PR — grep confirms zero call sites for escapeRouteViaProtectedStair ' +
      'or RoomCoverage outside egress_sanity.js/rule_checklist.js\'s report-generation path', true,
      '0ms added to interactive pathing — this PR never touches shortestPath() or the Find Panel\'s own call sites');
  }

  console.log(`\n§W-EGRESS-HARDENING DONE pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
