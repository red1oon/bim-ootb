#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §12 witness (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md §12.1/§12.2/§12.3)
 * SCOPE: the two egress rules about ALTERNATE routes — common_path_of_egress_travel and
 * exit_remoteness — plus the sprinkler evidence they read. READ THE LOG; the exit code is not the
 * evidence, the per-claim lines are.
 *
 * Each claim names the issue it proves or disproves. Two RED CONTROLS are included on purpose:
 * Hospital PASSES exit_remoteness, so without a fixture that must fail, a green line there would
 * only prove the rule is silent. No pixel-derived evidence anywhere (W-ALT-9 asserts it).
 *
 * RUN:  BIM_BUILDINGS=/path/to/buildings node witness_egress_alternates.js
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('./tests/_sqljs.js').requireSqlJs();
const { resolveWitnessDb } = require('./tests/_witness_db.js');
const RoomGraph = require('./common/room_graph.js');
const EgressSanity = require('./viewer/egress_sanity.js');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §WEA ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §WEA WRONG ' + n + (x ? '   ' + x : '')); } };

const SCHEMA = `
CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
`;

(async () => {
  const SQL = await initSqlJs();
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/egress_rules.json'), 'utf8'));
  const byName = {}; rules.egress_rules.forEach(r => { byName[r.name] = r; });
  const cpRule = byName.common_path_of_egress_travel, remRule = byName.exit_remoteness;

  // ══ W-ALT-1 — the divergence maths, in isolation. ISSUE: "where two routes part" must be the
  // LAST SHARED node, and a route that merely extends another is NOT a choice point. Disproved by
  // any pair where it reports a divergence that does not exist, or misses one that does. ════════
  const D = RoomGraph.divergenceFrom;
  ck('W-ALT-1a two routes that part after 2 shared hops diverge at the 2nd',
     JSON.stringify(D(['r', 'a', 'b', 'c'], ['r', 'a', 'x', 'y'])) === '{"node":"a","index":1}',
     JSON.stringify(D(['r', 'a', 'b', 'c'], ['r', 'a', 'x', 'y'])));
  ck('W-ALT-1b one route being a PREFIX of the other is NOT a divergence — no choice exists',
     D(['r', 'a'], ['r', 'a', 'b']) === null && D(['r', 'a', 'b'], ['r', 'a']) === null);
  ck('W-ALT-1c identical routes are not a divergence either', D(['r', 'a'], ['r', 'a']) === null);
  ck('W-ALT-1d it never invents one from empty or missing input',
     D(null, ['r']) === null && D([], []) === null && D(['r'], []) === null);

  // §WITNESS_DB — Hospital first because every measured number quoted in ESCAPE_ROUTE_REVEAL.md
  // came off it, but ANY building with rooms + a raster proves the claims, and the resolver applies
  // the buildings/patches/<db>.sql self-heal so the one TRACKED building works on a fresh clone.
  const picked = resolveWitnessDb(SQL, { needRaster: true });
  if (!picked) {
    console.log('§EGRESS_ALTERNATES_WITNESS INCONCLUSIVE — no building with rooms AND a walkable' +
      ' raster is reachable. Every claim below needs a REAL room graph; a synthetic one would' +
      ' prove the fixture, not the rule.');
    process.exit(2);
  }
  const db = picked.db;
  const q = (s, p) => { const r = p ? db.exec(s, p) : db.exec(s); return r.length ? r[0].values : []; };
  const graph = RoomGraph.buildGraph(q, { log: () => {} });

  // ══ W-ALT-2 — escapeRoutes(): every exit, ranked, from ONE Dijkstra, and route[0] must agree
  // with the shipped escapeRoute(). ISSUE: a second entry point into pathfinding that disagrees
  // with the first would make two rules report different routes for the same room. ═════════════
  const SUBJ = 'RM_Level_4_1';
  const er = RoomGraph.escapeRoutes(graph, SUBJ, { log: () => {} });
  const one = RoomGraph.escapeRoute(graph, SUBJ, { log: () => {} });
  const exitNodes = Object.keys(graph.nodesByGuid).filter(g => graph.nodesByGuid[g].kind === 'exit');
  ck('W-ALT-2a it returns every reachable exit, not just the best',
     !!er && er.routes.length === exitNodes.length,
     (er ? er.routes.length : 0) + ' of ' + exitNodes.length + ' exit nodes');
  ck('W-ALT-2b ranked nearest-first', !!er && er.routes.every((r, i) => i === 0 || r.distance >= er.routes[i - 1].distance),
     er ? er.routes.map(r => r.distance.toFixed(1)).join(' ≤ ') : '');
  ck('W-ALT-2c route[0] IS the shipped escapeRoute() answer — one pathfinder, not two',
     !!er && !!one && er.routes[0].exitGuid === one.exitGuid &&
     Math.abs(er.routes[0].distance - one.distance) < 1e-9,
     'escapeRoutes→' + (er && er.routes[0].exitGuid) + '  escapeRoute→' + (one && one.exitGuid));
  ck('W-ALT-2d every returned path starts at the room and ends at its own exit',
     !!er && er.routes.every(r => r.path[0] === SUBJ && r.path[r.path.length - 1] === r.exitGuid));

  // ══ W-ALT-3 — the common path on real data. ISSUE: does it measure the stretch before a CHOICE,
  // or just re-measure the route? Disproved if it ever equals the full route length when a real
  // divergence exists. ═══════════════════════════════════════════════════════════════════════
  const div = RoomGraph.divergenceFrom(er.routes[0].path, er.routes[1].path);
  let cpM = 0;
  for (let i = 1; i <= div.index; i++) {
    const a = graph.nodesByGuid[er.routes[0].path[i - 1]], b = graph.nodesByGuid[er.routes[0].path[i]];
    if (a && b) cpM += Math.hypot(b.cx - a.cx, b.cy - a.cy, (b.cz || 0) - (a.cz || 0));
  }
  ck('W-ALT-3a the film\'s own subject room has a real divergence node', !!div,
     div ? div.node + ' at hop ' + div.index + ' of ' + er.routes[0].path.length : 'none');
  // ⚠ METRES against METRES. route.distance is a penalty-weighted COST, and comparing the two is
  // exactly the error ESCAPE_ROUTE_REVEAL.md §8 documents. The first cut of THIS CLAIM made it and
  // read "117.1m of a 108.7 route cost" — kept as a note because the rule under test made the same
  // slip on the same day and this line is what caught it.
  const mLen = (pathArr, upto) => { let m = 0;
    for (let i = 1; i <= upto; i++) { const a = graph.nodesByGuid[pathArr[i - 1]], b = graph.nodesByGuid[pathArr[i]];
      if (a && b) m += Math.hypot(b.cx - a.cx, b.cy - a.cy, (b.cz || 0) - (a.cz || 0)); } return m; };
  const routeM = mLen(er.routes[0].path, er.routes[0].path.length - 1);
  ck('W-ALT-3b its common path is a PROPER PREFIX of the route, measured metres against metres',
     cpM > 0 && cpM < routeM,
     cpM.toFixed(1) + 'm of a ' + routeM.toFixed(1) + 'm route (its cost, a different quantity, is ' +
     er.routes[0].distance.toFixed(1) + ')');
  ck('W-ALT-3c and it is over the cited limit — a 4th-floor room walks to GROUND before any choice',
     cpM > cpRule.critical_m,
     cpM.toFixed(1) + 'm vs ' + cpRule.critical_m + 'm (' + (cpM / cpRule.critical_m).toFixed(1) + 'x over)' +
     ' — divergence is on ' + (graph.nodesByGuid[div.node] || {}).storey);

  // ══ W-ALT-4 — thresholds come from the RULEBOOK, never typed into the evaluator. ═════════════
  const esrc = fs.readFileSync(path.join(__dirname, 'viewer/egress_sanity.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  ck('W-ALT-4a the evaluator reads the limits off the rule objects',
     /cpRule\.critical_m/.test(esrc) && /remRule\.ratio_unsprinklered/.test(esrc));
  ck('W-ALT-4b the rulebook and the FALLBACK literal agree, number for number (§RULE_FALLBACK_ONE_SOURCE)',
     (() => { const f = {}; EgressSanity.FALLBACK_RULES.egress_rules.forEach(r => { f[r.name] = r; });
       return f.common_path_of_egress_travel.critical_m === cpRule.critical_m &&
              f.common_path_of_egress_travel.critical_m_sprinklered === cpRule.critical_m_sprinklered &&
              f.exit_remoteness.ratio_unsprinklered === remRule.ratio_unsprinklered &&
              f.exit_remoteness.ratio_sprinklered === remRule.ratio_sprinklered; })(),
     'cp ' + cpRule.critical_m + '/' + cpRule.critical_m_sprinklered + 'm, rem ' +
     remRule.ratio_unsprinklered + '/' + remRule.ratio_sprinklered);
  ck('W-ALT-4c the cited figures are the real code numbers (100ft/75ft, 1/2 and 1/3 diagonal)',
     cpRule.critical_m_sprinklered === 30.5 && cpRule.critical_m === 22.9 &&
     remRule.ratio_unsprinklered === 0.5 && Math.abs(remRule.ratio_sprinklered - 1 / 3) < 0.001);

  // ══ W-ALT-5 — sprinkler evidence is REPORTED and relaxes NOTHING. ISSUE: head count proves
  // presence, never IBC's "equipped throughout". Disproved if a sprinklered model gets the laxer
  // threshold applied silently. ════════════════════════════════════════════════════════════════
  const logs = [];
  const rowsHosp = EgressSanity.evaluate(q, rules, { log: m => logs.push(m), witness: true });
  const spLine = logs.filter(l => l.indexOf('§EGRESS_SPRINKLER ') === 0)[0] || '';
  ck('W-ALT-5a real sprinkler heads are found and reported', /heads=(\d+)/.test(spLine) && +spLine.match(/heads=(\d+)/)[1] > 0,
     spLine.slice(0, 92));
  const cpRows = rowsHosp.filter(r => r.rule === 'common_path_of_egress_travel' && r.ratio != null);
  ck('W-ALT-5b despite heads being present, the STRICTER unsprinklered limit is what flagged',
     cpRows.length > 0 && cpRows.every(r => r.witness.limitM === cpRule.critical_m) &&
     cpRows.some(r => r.ratio < cpRule.critical_m_sprinklered),
     cpRows.length + ' rows at limitM=' + (cpRows[0] && cpRows[0].witness.limitM) + 'm; ' +
     cpRows.filter(r => r.ratio < cpRule.critical_m_sprinklered).length + ' of them would NOT flag at 30.5m');
  ck('W-ALT-5c and every row says so, rather than leaving the reader to assume',
     cpRows.every(r => /UNSPRINKLERED/.test(r.witness.reads) && /Occupancy class is not extracted/.test(r.witness.reads)));
  ck('W-ALT-5d the centroid approximation is disclosed on the row, not just in a comment',
     cpRows.every(r => /CENTROID/.test(r.witness.reads) && /UNDER-flags/.test(r.witness.reads)));
  ck('W-ALT-5e the penalty-weighted COSTS on the row are named as costs, never as metres (§8)',
     cpRows.every(r => r.witness.nearestExitCost != null && r.witness.routeM != null &&
                       r.witness.nearestExitM === undefined),
     'row carries routeM (metres) and nearestExitCost (cost) as separate, differently-named fields');

  // ══ W-ALT-6 — real Hospital counts, and the honest statement that remoteness PASSED. ═════════
  const remRows = rowsHosp.filter(r => r.rule === 'exit_remoteness');
  ck('W-ALT-6a common_path flagged a real population on Hospital', cpRows.length > 50,
     cpRows.length + ' rooms over ' + cpRule.critical_m + 'm');
  ck('W-ALT-6b exit_remoteness found nothing to flag on Hospital — a real PASS, not a silent rule',
     remRows.length === 0,
     'Hospital Level 1 holds all 8 exits and the widest pair clears 0.5 x the diagonal');

  // ══ W-ALT-7 — RED CONTROLS. Hospital passes remoteness, so the rule must be shown able to FAIL
  // on data that should fail it, or W-ALT-6b proves only that it is quiet. ═════════════════════
  function fixture(exitXs) {
    const d = new SQL.Database(); d.run(SCHEMA);
    const meta = (g, c, n) => [g, c, n, 'L1', 'ARC', '', '', 'Fixture'];
    const xf = (g, x, y, bx, by) => [g, x, y, 1, 0, 0, 0, bx, by, 2.1];
    // two rooms 100 m apart on one storey, joined by a corridor, with doors to the outside
    [['rA', 0], ['rB', 100]].forEach(([g, x]) => {
      d.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', meta(g, 'IfcSpace', 'Room ' + g, 'L1'));
      d.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', xf(g, x, 0, 10, 10));
    });
    exitXs.forEach((x, i) => {
      const g = 'exit' + i;
      d.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', meta(g, 'IfcDoor', 'Exit Door ' + i, 'L1'));
      d.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', xf(g, x, 0, 1.2, 0.2));
    });
    return (s, p) => { const r = p ? d.exec(s, p) : d.exec(s); return r.length ? r[0].values : []; };
  }
  // The evaluator's own exit DETECTION needs a walkable raster, which a synthetic fixture has no
  // way to produce — so driving this through evaluate() tested nothing (it silently found zero
  // exits and skipped the rule, which is how the first cut of W-ALT-7a came back green-looking and
  // was actually blind). exitRemoteness() is exported exactly so the rule can be handed a storey
  // directly. Graphs built by hand, in the shape buildGraph() really produces.
  const gFix = (exits, rects) => ({
    nodesByGuid: exits.reduce((o, e, i) => (o['EXIT::e' + i] = { guid: 'EXIT::e' + i, kind: 'exit', storey: 'L1', cx: e[0], cy: e[1] }, o), {}),
    roomRectsByStorey: { L1: rects }
  });
  const SPAN = [{ x0: 0, y0: 0, x1: 100, y1: 0 }];            // 100 m diagonal, so 0.5 x = 50 m required
  const oneExitRows = EgressSanity.exitRemoteness(gFix([[0, 0]], SPAN), remRule, { heads: 0, present: false }, true);
  const tooCloseRows = EgressSanity.exitRemoteness(gFix([[0, 0], [10, 0]], SPAN), remRule, { heads: 0, present: false }, true);
  const farEnoughRows = EgressSanity.exitRemoteness(gFix([[0, 0], [60, 0]], SPAN), remRule, { heads: 0, present: false }, true);
  const noFootprintRows = EgressSanity.exitRemoteness(gFix([[0, 0], [10, 0]], []), remRule, { heads: 0, present: false }, true);
  ck('W-ALT-7a RED CONTROL — a storey with a single exit is flagged, with a read that says why',
     oneExitRows.length === 1 && /only one exit/.test(oneExitRows[0].target) &&
     /cannot be satisfied/.test(oneExitRows[0].witness.reads),
     oneExitRows.length ? oneExitRows[0].target : 'NOT FLAGGED — the rule is silent where it should speak');
  ck('W-ALT-7b RED CONTROL — the single-exit row carries no ratio, rather than a fake 0',
     oneExitRows.length === 1 && oneExitRows[0].ratio === null);
  ck('W-ALT-7c RED CONTROL — two exits 10 m apart on a 100 m diagonal FAIL the 0.5 rule',
     tooCloseRows.length === 1 && Math.abs(tooCloseRows[0].ratio - 0.1) < 1e-9 &&
     tooCloseRows[0].witness.requiredSeparationM === 50,
     tooCloseRows.length ? 'ratio ' + tooCloseRows[0].ratio + ', needed 50m, got ' + tooCloseRows[0].witness.bestSeparationM + 'm' : 'NOT FLAGGED');
  ck('W-ALT-7d GREEN CONTROL — move one to 60 m and the same rule goes quiet (it discriminates)',
     farEnoughRows.length === 0);
  ck('W-ALT-7e a storey with exits but NO compiled footprint reports INCONCLUSIVE, never a pass',
     noFootprintRows.length === 1 && noFootprintRows[0].ratio === null &&
     /INCONCLUSIVE, not a pass/.test(noFootprintRows[0].witness.reads));

  // ══ W-ALT-8 — cost. The rule must not make the report unusable. ══════════════════════════════
  const t0 = Date.now();
  EgressSanity.evaluate(q, rules, { log: () => {} });
  const ms = Date.now() - t0;
  ck('W-ALT-8 the whole evaluator, all seven rules, stays inside a usable budget on 156 rooms',
     ms < 120000, ms + ' ms for the full Hospital report');

  // ══ W-ALT-9 — no pixel-derived evidence, asserted about this file's own bytes. ═══════════════
  const self = fs.readFileSync(__filename, 'utf8');
  const forbidden = ['createImage' + 'Bitmap', 'ff' + 'mpeg', 'Io' + 'U', '.pn' + 'g\'', '.mp' + '4\'', 'toBl' + 'ob'];
  const hits = forbidden.filter(n => self.indexOf(n) >= 0);
  ck('W-ALT-9 this witness opens no frame, image or video — every claim is a real predicate',
     hits.length === 0, hits.length ? 'found: ' + hits.join(', ') : 'none of ' + forbidden.length + ' markers');

  console.log('\n§EGRESS_ALTERNATES_WITNESS ' + (fail ? 'FAIL' : 'PASS') + ' checks=' + (pass + fail) +
    ' wrong=' + fail + ' — Hospital: common_path flags ' + cpRows.length + '/' + cpRows.length +
    ' measured, subject room ' + cpM.toFixed(1) + 'm before any choice; exit_remoteness clean');
  process.exit(fail ? 1 : 0);
})();
