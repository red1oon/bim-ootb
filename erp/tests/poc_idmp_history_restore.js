// poc_idmp_history_restore.js — W-IDMP-HIST-RESTORE: per-page bar seeds from persisted WholeHistory
// Issue proved: idmp_history started _hist=[] each session — prior session dots were lost on reload.
'use strict';
var assert = require('assert');

function ok(cond, msg) {
  console.log((cond ? '  PASS' : '  FAIL') + ' ' + msg);
  assert.ok(cond, msg);
}

// ── Shim localStorage with 3 idempiere rows + 1 glassbowl row ──
var BASE_TS = 1750000000000;
var _store = {};
var ls = {
  getItem: function(k){ return _store[k]||null; },
  setItem: function(k,v){ _store[k]=v; },
  removeItem: function(k){ delete _store[k]; }
};
global.localStorage = ls;

// Pre-load bim.docHistory with 3 idempiere rows + 1 glassbowl row (old shape with source/type)
var preloaded = [
  { page: 'idempiere', ts: BASE_TS, label: 'Sales Order 1023', kind: 'nav', source: 'idempiere', type: 'nav',
    ref: { window: 143, tab: 0, table: 'C_Order', recordId: 1023 } },
  { page: 'idempiere', ts: BASE_TS + 60000, label: 'Invoice 42', kind: 'nav', source: 'idempiere', type: 'nav',
    ref: { window: 167, tab: 0, table: 'C_Invoice', recordId: 42 } },
  { page: 'idempiere', ts: BASE_TS + 120000, label: 'Product Widget', kind: 'nav', source: 'idempiere', type: 'nav',
    ref: { window: 140, tab: 0, table: 'M_Product', recordId: 7 } },
  { page: 'glassbowl', ts: BASE_TS + 180000, label: 'orbit', kind: 'view', source: 'glassbowl', type: 'view',
    ref: { yaw: 0.4 } }
];
ls.setItem('bim.docHistory', JSON.stringify(preloaded));

// Load WholeHistory first (whole_history.js needs global.localStorage)
delete require.cache[require.resolve('../../common/whole_history.js')];
var WH = require('../../common/whole_history.js');

// Confirm WholeHistory sees 4 entries (3 idempiere + 1 glassbowl)
var whEntries = WH.entries();
ok(whEntries.length === 4, '§IDMP-HIST-RESTORE pre: WholeHistory sees 4 entries, got=' + whEntries.length);
var idmpEntries = whEntries.filter(function(e){ return e.page === 'idempiere'; });
ok(idmpEntries.length === 3, '§IDMP-HIST-RESTORE pre: 3 idempiere entries in log, got=' + idmpEntries.length);

// Shim window + document for idmp_history.js (it calls render() which references document.body)
global.window = {
  WholeHistory: WH,
  performance: { now: function(){ return Date.now(); } },
  IdmpHistory: null
};
global.document = {
  getElementById: function(){ return null; },
  createElement: function(){ return { style: {}, classList: { add:function(){}, remove:function(){}, toggle:function(){} }, appendChild:function(){}, addEventListener:function(){}, querySelectorAll:function(){ return []; } }; },
  head: { appendChild: function(){} },
  body: { classList: { toggle: function(){} }, appendChild: function(){} }
};
// setTimeout needed by _seed() defer
var _pendingCb = null;
global.setTimeout = function(fn){ _pendingCb = fn; };

delete require.cache[require.resolve('../idmp_history.js')];
require('../idmp_history.js');

// Fire the deferred _seed()
if (_pendingCb) _pendingCb();

var IH = global.window.IdmpHistory;
ok(IH, '§IDMP-HIST-RESTORE IdmpHistory exposed on window');

var depth = IH.list().length;
ok(depth === 3, '§IDMP-HIST-RESTORE bar shows 3 idempiere dots (glassbowl excluded), got=' + depth);
console.log('§IDMP-HIST seed page=idempiere restored=' + depth + ' idx=' + (depth - 1));

var items = IH.list();
ok(items[0].label === 'Sales Order 1023', '§IDMP-HIST-RESTORE oldest dot = Sales Order 1023, got=' + items[0].label);
ok(items[2].label === 'Product Widget',   '§IDMP-HIST-RESTORE newest dot = Product Widget, got=' + items[2].label);

// canStep: idx=2 (tip), can go back, cannot go forward
var cs = IH.canStep();
ok(cs.back === true,  '§IDMP-HIST-RESTORE canStep.back=true (has history), got=' + cs.back);
ok(cs.front === false,'§IDMP-HIST-RESTORE canStep.front=false (at tip), got=' + cs.front);

// ── B2: empty log → bar empty, no throw ──
ls.removeItem('bim.docHistory');
delete require.cache[require.resolve('../../common/whole_history.js')];
var WH2 = require('../../common/whole_history.js');
global.window.WholeHistory = WH2;
global.window.IdmpHistory = null;
var _pendingCb2 = null;
global.setTimeout = function(fn){ _pendingCb2 = fn; };
delete require.cache[require.resolve('../idmp_history.js')];
require('../idmp_history.js');
if (_pendingCb2) _pendingCb2();
var IH2 = global.window.IdmpHistory;
ok(IH2.list().length === 0, '§IDMP-HIST-RESTORE B2 empty log → bar empty depth=0, got=' + IH2.list().length);

console.log('\n§W-IDMP-HIST-RESTORE 7/7 PASS — bar seeds from persisted log; glassbowl rows excluded; empty log=no throw');
