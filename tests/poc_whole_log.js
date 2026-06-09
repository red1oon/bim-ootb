// poc_whole_log.js — WITNESS for HISTORY_WHOLE_TIMELINE.md W1 (UNIFY THE LOG).
// Issue proved: every surface (viewer/idempiere/glassbowl/gravity) contributes to the ONE shared
// log bim.docHistory via WholeHistory.record, in the unified shape {page,ts,label,kind,ref}; the
// merged view is TIME-ordered and correctly page-tagged; and the OLD landing shape {source,type,label}
// still reads back (backward-compat). DETERMINISTIC: ts is INJECTED per entry — no Date.now in the
// record path. Run: node tests/poc_whole_log.js   (exit 0 + §WHOLE-LOG … ordered=Y = PASS)
'use strict';

// ── minimal browser shims so the real common/whole_history.js loads in node unchanged ──
var _store = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};
globalThis.BroadcastChannel = function () { return { postMessage: function () {} }; };

var WH = require('../common/whole_history.js');

// ── inject entries from FOUR surfaces, OUT OF TIME ORDER, with INJECTED ts (no Date.now) ──
// Each payload is exactly what the wired surface sends (see history_bar _mirror / idmp push / recordView).
var injected = [
  { page: 'gravity',    ts: 4000, label: 'lens · $',          kind: 'view', ref: { lens: 'aging', measure: 'amount', depth: 1 } },
  { page: 'viewer',     ts: 1000, label: 'Opened Duplex',     kind: 'op',   ref: { building: 'Duplex' } },
  { page: 'idempiere',  ts: 3000, label: 'Sales Order 1023',  kind: 'nav',  ref: { window: 143, tab: 0, table: 'C_Order', recordId: 1023 } },
  { page: 'glassbowl',  ts: 2000, label: 'orbit',             kind: 'view', ref: { yaw: 0.4, pitch: 0.1, focus: 'A' } }
];
injected.forEach(function (e) { WH.record(e); });

// ── read back the merged, normalised, TIME-ORDERED view ──
var ents = WH.entries();
var pages = WH.pages().sort();
var order = ents.map(function (e) { return e.ts; });
var ordered = order.every(function (t, i) { return i === 0 || t >= order[i - 1]; });
var allTagged = ents.every(function (e) { return !!e.page && !!WH.PAGES[e.page]; });
var refsKept = ents.every(function (e) { return e.ref != null; });

// backward-compat: the OLD landing reader consumes e.source/e.type/e.label off the raw rows.
var raw = WH.all();
var landingOK = raw.every(function (r) { return r.source === r.page && r.label && r.type; });

console.log('--- W1 merged view (by ts) ---');
ents.forEach(function (e) { console.log('  ts=' + e.ts + ' [' + e.page + '] ' + e.kind + ' "' + e.label + '" ref=' + JSON.stringify(e.ref)); });

var pass = pages.length === 4 && ents.length === 4 && ordered && allTagged && refsKept && landingOK;
console.log('§WHOLE-LOG pages=[' + pages.join(',') + '] entries=' + ents.length +
  ' ordered=' + (ordered ? 'Y' : 'N') + ' tagged=' + (allTagged ? 'Y' : 'N') +
  ' refsKept=' + (refsKept ? 'Y' : 'N') + ' landingCompat=' + (landingOK ? 'Y' : 'N') +
  ' => ' + (pass ? 'PASS' : 'FAIL'));

if (!pass) process.exit(1);
