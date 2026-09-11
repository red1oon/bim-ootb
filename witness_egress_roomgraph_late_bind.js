#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EGRESS-ROOMGRAPH-LATE-BIND (READ THE LOG after every run)
 * SCOPE: real bug found by a sibling session baking Structural Sanity + Egress into a movie
 * (bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59.7, "§EGRESS_ROOMGRAPH_LATE_BIND") and fixed
 * here independently on THIS branch (feat/structural-sanity). `viewer/egress_sanity.js` is a
 * static <script> loaded at page boot; `common/room_graph.js` is lazy-loaded LATER by
 * APP.loadNavigate() (viewer/main.js). Reading `window.RoomGraph` once at module-load time
 * captured `undefined` permanently — a later loadNavigate() populates window.RoomGraph, but the
 * frozen binding never looks again, so rules 2/3 (circulation_distance, isolated_room) silently
 * no-op'd in every real browser run despite every Node witness passing (Node's require() branch
 * was never the broken half — this witness proves the BROWSER branch specifically, loading
 * egress_sanity.js in a vm with `module` absent and a fake `window`, same technique the sibling
 * session's own witness_room_injection_path_gap.js uses for the identical reason).
 * RUN: node witness_egress_roomgraph_late_bind.js
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   L1 LATE-BIND-FIXED — window.RoomGraph UNSET when egress_sanity.js first loads (module-load
 *      time), set AFTERWARDS, then evaluate() called: rules 2/3 must still run. Fails against the
 *      pre-fix file (factory-time capture would have frozen `undefined`).
 *   L2 STILL-HONEST-WHEN-ABSENT — window.RoomGraph never set at all: §EGRESS_NO_ROOMGRAPH must
 *      still be logged and rule 1 (door width) rows still returned — the fix must not turn an
 *      honest skip into a crash.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const SRC = fs.readFileSync(path.join(__dirname, 'viewer/egress_sanity.js'), 'utf8');
const RoomGraphReal = require('./common/room_graph.js');

// A single door-width-only fixture (no room graph needed for rule 1) so both scenarios below can
// assert something concrete beyond "did rules 2/3 run".
function dbQuery(sql) {
  if (/IfcDoor/.test(sql)) return [['d1', 'D1', 'L1', 0.5, 0.2]]; // narrow door, room-graph tables intentionally return nothing below
  return [];
}

function loadInBrowserVm(windowRoomGraphAtLoadTime) {
  const fakeWindow = {};
  if (windowRoomGraphAtLoadTime) fakeWindow.RoomGraph = windowRoomGraphAtLoadTime;
  const ctx = { window: fakeWindow, console: console };
  vm.createContext(ctx);
  // `module`/`require` intentionally NOT in this context — forces the BROWSER branch
  // (`typeof module !== 'undefined' && module.exports` is false), the only place the bug lived.
  vm.runInContext(SRC, ctx, { filename: 'egress_sanity.js' });
  return { EgressSanity: ctx.window.EgressSanity, fakeWindow: fakeWindow };
}

(function L1() {
  console.log('§L1 window.RoomGraph unset at module-load, set AFTERWARDS');
  const { EgressSanity, fakeWindow } = loadInBrowserVm(null); // NOT set yet when the script "loads"
  fakeWindow.RoomGraph = RoomGraphReal; // populated later, as APP.loadNavigate() would do
  const logs = [];
  const rows = EgressSanity.evaluate(dbQuery, { egress_rules: [
    { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' },
    { name: 'circulation_distance', applies_to: ['room_graph_node'], warning_m: 30, critical_m: 45, max_severity: 'WARNING' },
    { name: 'isolated_room', applies_to: ['room_graph_node'] }
  ] }, { log: (m) => logs.push(m) });
  chk('L1a rule 1 (door width) still runs', rows.some(r => r.rule === 'door_clear_width'));
  chk('L1b §EGRESS_NO_ROOMGRAPH is NOT logged (RoomGraph was found, late-bound correctly)',
    !logs.some(l => l.indexOf('§EGRESS_NO_ROOMGRAPH') >= 0), JSON.stringify(logs));
})();

(function L2() {
  console.log('§L2 window.RoomGraph NEVER set — must degrade honestly, not crash');
  const { EgressSanity, fakeWindow } = loadInBrowserVm(null);
  // fakeWindow.RoomGraph intentionally left unset for this whole scenario.
  const logs = [];
  let threw = null, rows = [];
  try {
    rows = EgressSanity.evaluate(dbQuery, { egress_rules: [
      { name: 'door_clear_width', applies_to: ['IfcDoor'], warning_m: 0.85, critical_m: 0.80, max_severity: 'WARNING' }
    ] }, { log: (m) => logs.push(m) });
  } catch (e) { threw = e; }
  chk('L2a evaluate() does not throw when RoomGraph is absent', !threw, threw && threw.message);
  chk('L2b §EGRESS_NO_ROOMGRAPH IS logged (honest skip, not silent)',
    logs.some(l => l.indexOf('§EGRESS_NO_ROOMGRAPH') >= 0), JSON.stringify(logs));
  chk('L2c rule 1 rows still returned even though rules 2/3 were skipped', rows.some(r => r.rule === 'door_clear_width'));
})();

(function D2() {
  // §STOREY_FOOTPRINT_NOT_LOADED (same §59.7 spec, D2) — a verbatim repeat of the historical
  // §HALLWAY-BACKBONE-NOT-LOADED bug in this same file: common/storey_footprint.js is required by
  // common/room_graph.js's buildGraph() (window.StoreyFootprint) but must reach the browser via
  // viewer/main.js's lazy-load `modules` list, not just a Node require() — a Node witness passing
  // is not evidence the browser path ever loads it. Assert the load ORDER, not just presence: the
  // defect IS the missing/misordered line, so this is a string/order assertion by design.
  console.log('§D2 viewer/main.js loads storey_footprint.js BEFORE room_graph.js');
  const src = require('fs').readFileSync(require('path').join(__dirname, 'viewer/main.js'), 'utf8');
  const iFoot = src.indexOf('storey_footprint.js');
  const iGraph = src.indexOf("room_graph.js?v=");
  chk('D2 storey_footprint.js present in the lazy-load list, before room_graph.js',
    iFoot >= 0 && iGraph >= 0 && iFoot < iGraph, 'footprintIdx=' + iFoot + ' roomGraphIdx=' + iGraph);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
