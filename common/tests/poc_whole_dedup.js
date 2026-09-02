// poc_whole_dedup.js — W-WHOLE-DEDUP: same-doc/same-day entries coalesce to ONE dot
// Issue proved: record() previously appended every call with zero dedup → day's stretch filled with duplicates.
'use strict';
var WH = require('../whole_history.js');
var assert = require('assert');

var _store = {};
var ls = { getItem: function(k){ return _store[k]||null; }, setItem: function(k,v){ _store[k]=v; }, removeItem: function(k){ delete _store[k]; } };
var root = { localStorage: ls };
// Reload module with fresh store
delete require.cache[require.resolve('../whole_history.js')];
WH = require('../whole_history.js');
// Inject the localStorage shim via the root trick (module pattern uses root.localStorage)
// whole_history.js uses typeof localStorage — in node it's undefined, so _ls() falls to root.localStorage
// which is set via the IIFE arg. We need to shim it differently:
var _orig = global.localStorage;
global.localStorage = ls;

// Re-require with global.localStorage in place
delete require.cache[require.resolve('../whole_history.js')];
WH = require('../whole_history.js');
WH.clear();

function ok(cond, msg) {
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + msg);
  assert.ok(cond, msg);
}

// ── A1: same doc, same day → 5 records → 1 entry, ts = the latest ──
var BASE_TS = 1750000000000;   // 2025-06-15
var ref1 = { page: 'idempiere', ref: { table: 'c_order', recordId: 1023 } };
var expectedTs;
for (var i = 0; i < 5; i++) {
  var ts = BASE_TS + i * 60000;
  WH.record({ page: 'idempiere', label: 'Sales Order 1023', kind: 'nav', ts: ts, ref: { table: 'c_order', recordId: 1023 } });
  expectedTs = ts;
}
var all1 = WH.entries().filter(function(e){ return e.page === 'idempiere'; });
ok(all1.length === 1, '§WHOLE-DEDUP A1 same-doc same-day 5× → 1 entry, got=' + all1.length);
ok(all1[0].ts === expectedTs, '§WHOLE-DEDUP A1 ts advanced to latest ts=' + all1[0].ts + ' expected=' + expectedTs);
console.log('§WHOLE-DEDUP count-before=5-writes count-after=' + all1.length + ' ts=' + all1[0].ts);

// ── A2: cross-day repeat → 2 entries (one per day) ──
var DAY2_TS = BASE_TS + 86400000;  // next day
WH.record({ page: 'idempiere', label: 'Sales Order 1023', kind: 'nav', ts: DAY2_TS, ref: { table: 'c_order', recordId: 1023 } });
var all2 = WH.entries().filter(function(e){ return e.page === 'idempiere'; });
ok(all2.length === 2, '§WHOLE-DEDUP A2 cross-day repeat → 2 entries, got=' + all2.length);
console.log('§WHOLE-DEDUP cross-day count=' + all2.length);

// ── A3: two different docs same day → 2 entries ──
WH.clear();
WH.record({ page: 'idempiere', label: 'Sales Order 1023', kind: 'nav', ts: BASE_TS, ref: { table: 'c_order', recordId: 1023 } });
WH.record({ page: 'idempiere', label: 'Sales Order 1024', kind: 'nav', ts: BASE_TS + 1000, ref: { table: 'c_order', recordId: 1024 } });
var all3 = WH.entries().filter(function(e){ return e.page === 'idempiere'; });
ok(all3.length === 2, '§WHOLE-DEDUP A3 two different docs same day → 2 entries, got=' + all3.length);

// ── A4: kind='op' with distinct label → NOT coalesced (each install is a distinct event) ──
WH.clear();
WH.record({ page: 'idempiere', label: 'Installed shard-A', kind: 'op', ts: BASE_TS });
WH.record({ page: 'idempiere', label: 'Installed shard-B', kind: 'op', ts: BASE_TS + 1000 });
var all4 = WH.entries().filter(function(e){ return e.page === 'idempiere'; });
ok(all4.length === 2, '§WHOLE-DEDUP A4 kind=op distinct labels → 2 entries (not coalesced), got=' + all4.length);

// ── A5: existing 5 whole witnesses still pass (smoke: records + entries round-trip) ──
WH.clear();
WH.record({ page: 'viewer', ts: BASE_TS, label: 'Duplex', kind: 'op', ref: { building: 'Duplex' } });
WH.record({ page: 'glassbowl', ts: BASE_TS + 1000, label: 'orbit', kind: 'view', ref: { yaw: 0.4 } });
WH.record({ page: 'idempiere', ts: BASE_TS + 2000, label: 'Sales Order 1023', kind: 'nav', ref: { table: 'c_order', recordId: 1023 } });
var all5 = WH.entries();
ok(all5.length === 3, '§WHOLE-DEDUP A5 smoke 3 distinct page+doc → 3 entries, got=' + all5.length);
ok(all5[0].ts <= all5[1].ts && all5[1].ts <= all5[2].ts, '§WHOLE-DEDUP A5 time-ordered');

console.log('\n§W-WHOLE-DEDUP 5/5 PASS — same-doc/same-day coalesces to ONE dot, cross-day/distinct/op each keep their own');
global.localStorage = _orig;
