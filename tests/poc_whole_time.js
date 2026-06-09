// poc_whole_time.js — WITNESS for HISTORY_WHOLE_TIMELINE.md W3 (TIME SCROLLER).
// Issue proved: entries bucket by DAY from ts; the scroller starts at the LATEST day; long-press-back
// (stepBackDay) steps DAY→DAY (not entry→entry) and clamps at the earliest; landing on a day yields its
// STRETCH = every page's entries that day, time-ordered, spanning >1 surface (scrollable). DETERMINISTIC:
// ts INJECTED via args (full-day multiples) — NO Date.now in the record path.
// Run: node tests/poc_whole_time.js   (exit 0 + §WHOLE-TIME … jumpedBackDay=ok = PASS)
'use strict';

var _store = {};
globalThis.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};
globalThis.BroadcastChannel = function () { return { postMessage: function () {} }; };

var WH = require('../common/whole_history.js');
WH.clear();

var DAY = 86400000, BASE = 1700000000000, NOON = 12 * 3600000;   // injected timestamps span 3 calendar days
// day A: TWO surfaces (viewer + glassbowl) · day B: idempiere · day C: gravity
[ { page: 'viewer',    ts: BASE + NOON,            label: 'Opened Duplex',    kind: 'op',   ref: { building: 'Duplex' } },
  { page: 'glassbowl', ts: BASE + NOON + 60000,    label: 'orbit',            kind: 'view', ref: { yaw: 0.4 } },
  { page: 'idempiere', ts: BASE + DAY + NOON,      label: 'Sales Order 1023', kind: 'nav',  ref: { window: 143, recordId: 1023 } },
  { page: 'gravity',   ts: BASE + 2 * DAY + NOON,  label: 'lens · $',         kind: 'view', ref: { lens: 'aging' } }
].forEach(function (e) { WH.record(e); });

WH.mount({ page: 'idempiere', rootPrefix: '../' });
WH.setMode('whole');

var days = WH.buildDays('whole', 'idempiere');
var dayKeys = days.map(function (d) { return d.key; });
console.log('days: ' + days.map(function (d) { return d.key + '(' + d.items.length + ')'; }).join(' '));

// start at the LATEST day (day C, gravity)
var start = WH.selectedDay('whole', 'idempiere');
var startIsLatest = start === dayKeys[dayKeys.length - 1];

// long-press-back twice → crosses two day boundaries to day A
var b1 = WH.stepBackDay('whole', 'idempiere');   // → day B
var b2 = WH.stepBackDay('whole', 'idempiere');   // → day A
var b3 = WH.stepBackDay('whole', 'idempiere');   // clamps at day A (earliest)
var jumpedBackDay = (b1 === dayKeys[1]) && (b2 === dayKeys[0]) && (b3 === dayKeys[0]);

// the earliest day's STRETCH = both surfaces, time-ordered
var st = WH.stretch('whole', 'idempiere');
var stPages = {}; st.forEach(function (i) { stPages[i.page] = 1; });
var stretchOrdered = st.every(function (e, i) { return i === 0 || e.ts >= st[i - 1].ts; });
var multiSurface = Object.keys(stPages).length >= 2;

var pass = days.length === 3 && days[0].items.length === 2 && startIsLatest &&
  jumpedBackDay && st.length === 2 && multiSurface && stretchOrdered;
console.log('§WHOLE-TIME days=[' + dayKeys.join(',') + '] startLatest=' + (startIsLatest ? 'Y' : 'N') +
  ' jumpedBackDay=' + (jumpedBackDay ? 'ok' : 'FAIL') + ' stretchEntries=' + st.length +
  ' stretchPages=[' + Object.keys(stPages).join(',') + '] ordered=' + (stretchOrdered ? 'Y' : 'N') +
  ' scrollable=Y => ' + (pass ? 'PASS' : 'FAIL'));

if (!pass) process.exit(1);
