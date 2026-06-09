// poc_whole_bar.js — WITNESS for HISTORY_WHOLE_TIMELINE.md W2 (CROSS-PAGE BAR).
// Issue proved: the aggregate bar shows every surface's entry (page-tagged, time-ordered) e.g.
// "viewer Opened Duplex → glassbowl orbit → idempiere Order 1023 → gravity lens"; the WHOLE|THIS
// toggle filters; clicking a FOREIGN-page entry stashes a read-only restore handoff + computes the
// correct deep-link URL (relative to the mounting page's rootPrefix); and the TARGET page consumes
// that handoff once on load. DETERMINISTIC: ts injected, no Date.now in the record path.
// Run: node tests/poc_whole_bar.js   (exit 0 + §WHOLE-BAR … foreignClick=ok = PASS)
'use strict';

var _store = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};
globalThis.BroadcastChannel = function () { return { postMessage: function () {} }; };
// NO `location`/`document` globals → onEntryClick exercises the handoff path without real navigation.

var WH = require('../common/whole_history.js');
WH.clear();

// seed across all four surfaces, out of order, injected ts
[ { page: 'gravity',   ts: 4000, label: 'lens · $',         kind: 'view', ref: { lens: 'aging' } },
  { page: 'viewer',    ts: 1000, label: 'Opened Duplex',    kind: 'op',   ref: { building: 'Duplex' } },
  { page: 'idempiere', ts: 3000, label: 'Sales Order 1023', kind: 'nav',  ref: { window: 143, tab: 0, table: 'C_Order', recordId: 1023 } },
  { page: 'glassbowl', ts: 2000, label: 'orbit',            kind: 'view', ref: { yaw: 0.4 } }
].forEach(function (e) { WH.record(e); });

// ── mount AS THE iDempiere page (nested under erp/, so rootPrefix '../') ──
WH.mount({ page: 'idempiere', rootPrefix: '../' });

// WHOLE mode → shows all 4; foreign flag set on everything except idempiere
WH.setMode('whole');
var whole = WH.buildItems('whole', 'idempiere');
var chain = whole.map(function (i) { return i.pageLabel + ' ' + i.label; }).join(' → ');
console.log('aggregate (whole): ' + chain);
var foreignCount = whole.filter(function (i) { return i.foreign; }).length;
var ownCount = whole.filter(function (i) { return !i.foreign; }).length;

// THIS mode → only idempiere rows
var thisOnly = WH.buildItems('this', 'idempiere');
var thisOK = thisOnly.length === 1 && thisOnly[0].page === 'idempiere';

// URL resolution from erp/idempiere.html: glassbowl is a sibling, viewer is ../viewer/…
var gItem = whole.filter(function (i) { return i.page === 'glassbowl'; })[0];
var vItem = whole.filter(function (i) { return i.page === 'viewer'; })[0];
var urlOK = gItem.url === '../erp/glassbowl.html' && vItem.url === '../viewer/viewer.html';

// ── click the FOREIGN glassbowl entry → handoff stashed (read-only) + url returned ──
var url = WH.onEntryClick(gItem);
var handoff = JSON.parse(localStorage.getItem('bim.wholeRestore') || 'null');
var clickOK = url === '../erp/glassbowl.html' && handoff && handoff.page === 'glassbowl' &&
  handoff.ref && handoff.ref.yaw === 0.4;

// ── target page (glassbowl) consumes the handoff ONCE on load ──
var applied = null;
var ref = WH.consumeRestore('glassbowl', function (r) { applied = r; });
var consumedOK = ref && applied && applied.yaw === 0.4 && localStorage.getItem('bim.wholeRestore') === null;
// consuming again → nothing (single-shot)
var again = WH.consumeRestore('glassbowl', function () {});

var pass = whole.length === 4 && foreignCount === 3 && ownCount === 1 && thisOK && urlOK && clickOK && consumedOK && again === null;
console.log('§WHOLE-BAR shown=' + whole.length + ' foreign=' + foreignCount + ' thisPage=' + thisOnly.length +
  ' urlOK=' + (urlOK ? 'Y' : 'N') + ' foreignClick=' + (clickOK ? 'ok' : 'FAIL') +
  ' consumeOnce=' + (consumedOK && again === null ? 'Y' : 'N') + ' => ' + (pass ? 'PASS' : 'FAIL'));

if (!pass) process.exit(1);
