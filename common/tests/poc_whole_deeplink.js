// ⚠ DO NOT REMOVE — Witness: W-WHOLE-DEEPLINK
// Issue PROVED/DISPROVED: a foreign World-history card "sometimes" reached the doc/building and sometimes
//   not — because buildItems navigated to a BARE page URL and relied on a load-timing consumeRestore.
//   Fix: buildItems bakes the ref into the URL so each page's PROVEN deferred deep-link handles it.
//   This asserts the URL each card carries.
// Deterministic: injected integer ts, no Date.now in the assert path.

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  key: function (i) { return Object.keys(store)[i]; },
  get length() { return Object.keys(store).length; }
};

var WH = require('../whole_history.js');

var fail = 0;
function ok(c, m) { console.log((c ? '§W-WHOLE-DEEPLINK PASS ' : '§W-WHOLE-DEEPLINK FAIL ') + m); if (!c) fail++; }

// Seed cross-page entries with realistic refs.
var DBURL = 'https://objectstorage.example.com/n/x/b/bim-ootb/o/buildings/SampleCastle_extracted.db';
WH.record({ page: 'viewer',    ts: 1700000000000, label: 'SampleCastle', kind: 'op',   ref: { building: 'SampleCastle', db: DBURL } });
WH.record({ page: 'idempiere', ts: 1700000001000, label: 'Sales Order', kind: 'record', ref: { window: 143, tab: 0, table: 'C_Order', recordId: 104 } });
WH.record({ page: 'idempiere', ts: 1700000002000, label: 'Orders window', kind: 'window', ref: { window: 143, tab: 0, table: 'C_Order' } });        // no record
WH.record({ page: 'gravity',   ts: 1700000003000, label: 'partner · $', kind: 'view', ref: { lens: 'partner' } });                                   // no deep-link field
WH.record({ page: 'viewer',    ts: 1700000004000, label: 'NoDbBuilding', kind: 'op',   ref: { building: 'NoDbBuilding' } });                          // viewer entry w/o db

// Build items as seen from the LANDING page (everything is foreign there).
var items = WH.buildItems('whole', 'landing');
function urlFor(label) { return (items.filter(function (i) { return i.label === label; })[0] || {}).url; }

ok(urlFor('SampleCastle') === 'viewer/viewer.html?db=' + DBURL + '&ghost=1', 'viewer building → ?db deep-link: ' + urlFor('SampleCastle'));
ok(urlFor('Sales Order') === 'erp/idempiere.html?window=143&record=104', 'idempiere record → ?window&record: ' + urlFor('Sales Order'));
ok(urlFor('Orders window') === 'erp/idempiere.html?window=143', 'idempiere window (no record) → ?window only: ' + urlFor('Orders window'));
ok(urlFor('partner · $') === 'erp/glassbowl_gravity.html', 'gravity view (no deep-link field) → bare URL: ' + urlFor('partner · $'));
ok(urlFor('NoDbBuilding') === 'viewer/viewer.html', 'viewer w/o db → bare URL (RESTORE_KEY fallback): ' + urlFor('NoDbBuilding'));

// All items still carry foreign=true + a ref (the handoff fallback is untouched).
ok(items.every(function (i) { return i.foreign === true; }), 'all foreign from landing');

console.log(fail === 0 ? '§W-WHOLE-DEEPLINK ALL PASS' : ('§W-WHOLE-DEEPLINK ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
