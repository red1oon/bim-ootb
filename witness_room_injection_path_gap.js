#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-INJECTION-PATH-GAP scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59.7 ONLY — the two independent defects
 * that keep §59.4's "longest distance to exit — Xs / ~Ysteps" sub-text from EVER rendering on a
 * real building, despite §59.5's synthetic witness passing 20/20. Node, no browser.
 * RUN: node witness_room_injection_path_gap.js
 *
 * ISSUES THIS WITNESS EXPOSES (each check names the defect it proves or disproves):
 *   P1 D1-LATE-BIND — viewer/egress_sanity.js bound `window.RoomGraph` at FACTORY time while it is
 *      a static <script> running at page boot and common/room_graph.js is lazy-loaded later by
 *      APP.loadNavigate(). The capture froze as `undefined`, so egress rules 2/3 were skipped on
 *      every real browser run and every silent bake. Proven in the BROWSER branch specifically:
 *      the file is evaluated in a vm with `module` absent and a fake `window`, RoomGraph attached
 *      only AFTER evaluation. Rules 2/3 must still run. FAILS against the pre-fix file.
 *   P2 D1-STILL-HONEST-WHEN-ABSENT — RoomGraph never attached at all: §EGRESS_NO_ROOMGRAPH must
 *      still be logged and rule-1 (door_clear_width) rows still returned. Proves the fix replaced a
 *      frozen binding with a live read, NOT an honest skip with a throw.
 *   P3 D2-LOAD-ORDER — common/storey_footprint.js must appear in viewer/main.js's lazy-load
 *      `modules` array at an index BEFORE common/room_graph.js (which binds window.StoreyFootprint
 *      at factory time). A source/order assertion, not a mock: the defect IS the missing line, the
 *      same §HALLWAY-BACKBONE-NOT-LOADED class main.js already documents.
 *   P4 D2-REAL-EXITS — real buildings/HHS_Office_Federated_silent.db (the canonical ~/Downloads
 *      file by symlink, §59.6b) through RoomGraph.buildGraph() with StoreyFootprint present:
 *      exits > 0 and noRaster === 0. DISPROVES "HHS has no derivable exits" as a property of the
 *      building — the real bake's `exits=0 noRaster=133 of 133` was a module gap, not a data gap.
 *   P5 DISTANCE-IS-MEASURED-NOT-FABRICATED — every circulation_distance row's `ratio` is a finite
 *      positive number that came from escapeRoute()/shortestPath(); a room with no path at all
 *      emits an isolated_room row instead, never a fabricated 0 (§59.4's "dropped, never 0s/0 steps").
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const RoomGraph = require('./common/room_graph.js');
const DB_PATH = path.join(__dirname, 'buildings', 'HHS_Office_Federated_silent.db');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
function finish() {
  console.log('\n§W-ROOM-INJECTION-PATH-GAP pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

const EGRESS_RULES = {
  egress_rules: [
    { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' },
    { name: 'circulation_distance', applies_to: ['room_graph_node'], target: 'exit_or_own_storey_circ', warning_m: 30, critical_m: 45, max_severity: 'WARNING' },
    { name: 'isolated_room', applies_to: ['room_graph_node'], target: 'own_storey_circ' }
  ]
};

// Load viewer/egress_sanity.js the way a BROWSER loads it: no `module`, a real `window` object.
// This is the whole point of P1/P2 — the Node require() branch has no lazy-loading and therefore
// could never have exposed D1, which is exactly why 20/20 passed while the feature never ran.
function loadEgressSanityAsBrowser() {
  const src = fs.readFileSync(path.join(__dirname, 'viewer', 'egress_sanity.js'), 'utf8');
  const fakeWindow = {};
  const sandbox = { window: fakeWindow, console: console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'viewer/egress_sanity.js' });
  return fakeWindow;
}

// ── P3: pure source assertion, no DB needed — run it first so it reports even if the DB is absent ──
(function P3() {
  const main = fs.readFileSync(path.join(__dirname, 'viewer', 'main.js'), 'utf8');
  const iFoot = main.indexOf("'../common/storey_footprint.js");
  const iGraph = main.indexOf("'../common/room_graph.js");
  chk('P3a D2 — storey_footprint.js is in viewer/main.js\'s load list at all', iFoot !== -1,
    'index=' + iFoot);
  chk('P3b D2 — it loads BEFORE room_graph.js (which factory-binds window.StoreyFootprint)',
    iFoot !== -1 && iGraph !== -1 && iFoot < iGraph, 'foot=' + iFoot + ' graph=' + iGraph);
})();

(async () => {
  if (!fs.existsSync(DB_PATH)) {
    console.log('§W-ROOM-INJECTION-PATH-GAP SKIP-DB — ' + DB_PATH + ' not present; P1/P2/P4/P5 not run');
    return finish();
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  function dbQuery(sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }
  console.log('§W-ROOM-INJECTION-PATH-GAP building=' + DB_PATH);

  // Provenance: the injected rooms this whole feature depends on really are in this DB.
  const injected = dbQuery("SELECT COUNT(*) FROM spatial_structure WHERE type='IfcSpace' AND guid LIKE 'RM_%'");
  console.log('§INJECTED_ROOMS n=' + (injected.length ? injected[0][0] : 0));

  // ── P1: browser branch, RoomGraph attached AFTER the file is evaluated ──
  let p1Rows = [];
  (function P1() {
    const w = loadEgressSanityAsBrowser();
    w.RoomGraph = RoomGraph;                       // the lazy-load, arriving late — as it really does
    const lines = [];
    const rows = w.EgressSanity.evaluate(dbQuery, EGRESS_RULES, { log: (m) => lines.push(m) });
    const skipped = lines.some(l => l.indexOf('§EGRESS_NO_ROOMGRAPH') === 0);
    const ranCirc = lines.some(l => l.indexOf('§EGRESS rule=circulation_distance') === 0);
    chk('P1a D1 — rules 2/3 NOT skipped when RoomGraph arrives after factory time', !skipped,
      skipped ? 'still logged §EGRESS_NO_ROOMGRAPH — binding still frozen' : '');
    chk('P1b D1 — circulation_distance rule actually ran', ranCirc,
      lines.filter(l => l.indexOf('§EGRESS') === 0).join(' | '));
    p1Rows = rows;
  })();

  // ── P2: browser branch, RoomGraph never attached ──
  (function P2() {
    const w = loadEgressSanityAsBrowser();          // no w.RoomGraph, ever
    const lines = [];
    let rows, threw = null;
    try { rows = w.EgressSanity.evaluate(dbQuery, EGRESS_RULES, { log: (m) => lines.push(m) }); }
    catch (e) { threw = e; }
    chk('P2a D1 — absent RoomGraph does not throw', !threw, threw ? threw.message : '');
    chk('P2b D1 — absent RoomGraph still logs the honest §EGRESS_NO_ROOMGRAPH skip',
      lines.some(l => l.indexOf('§EGRESS_NO_ROOMGRAPH') === 0));
    chk('P2c D1 — rule 1 (door_clear_width) rows still returned when 2/3 are skipped',
      !!rows && rows.every(r => r.rule === 'door_clear_width'),
      'rows=' + (rows ? rows.length : 'none'));
  })();

  // ── P4: real exits with StoreyFootprint present (Node require branch supplies it) ──
  const glines = [];
  const graph = RoomGraph.buildGraph(dbQuery, { log: (m) => glines.push(m) });
  const exitLine = glines.find(l => l.indexOf('§ROOM_GRAPH_EXITS') === 0) || '';
  console.log('  ' + exitLine);
  const mE = exitLine.match(/exits=(\d+) noRaster=(\d+) of (\d+)/);
  chk('P4a D2 — §ROOM_GRAPH_EXITS was emitted', !!mE, exitLine);
  chk('P4b D2 — noRaster === 0 (no door skipped for a missing footprint)',
    !!mE && +mE[2] === 0, mE ? 'noRaster=' + mE[2] + ' of ' + mE[3] : '');
  chk('P4c D2 — exits > 0: HHS DOES have derivable exits, the bake\'s exits=0 was a module gap',
    !!mE && +mE[1] > 0, mE ? 'exits=' + mE[1] : '');

  // ── P5: measured, never fabricated ──
  (function P5() {
    const rows = p1Rows || [];
    const circ = rows.filter(r => r.rule === 'circulation_distance');
    const iso = rows.filter(r => r.rule === 'isolated_room');
    console.log('  §EGRESS_ROWS circulation_distance=' + circ.length + ' isolated_room=' + iso.length +
      ' door_clear_width=' + rows.filter(r => r.rule === 'door_clear_width').length);
    chk('P5a every circulation_distance ratio is a finite positive measured distance',
      circ.every(r => Number.isFinite(r.ratio) && r.ratio > 0),
      circ.length ? 'max=' + Math.max.apply(null, circ.map(r => r.ratio)).toFixed(2) + 'm n=' + circ.length : 'n=0');
    chk('P5b a room with no path emits isolated_room with ratio null, never a fabricated 0',
      iso.every(r => r.ratio === null), 'n=' + iso.length);
    chk('P5c §59.4 distance-to-exit has a real Math.max to take (or is honestly dropped)',
      circ.length === 0 || Number.isFinite(Math.max.apply(null, circ.map(r => r.ratio))),
      circ.length === 0 ? 'no circ rows — card correctly DROPPED, not zeroed' : 'card would render');
  })();

  finish();
})();
