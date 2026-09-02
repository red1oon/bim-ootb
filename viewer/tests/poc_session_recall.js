// ⚠ DO NOT REMOVE — Witness: W-SESSION-RECALL (HISTORY_SESSION_EVENTS.md A2 [VIEWER], user 2026-06-13
//   "land a history without making a new dot, but recall all the dots that were in that session — is
//   that still the case?"). The A2 re-home is supposed to (a) gate recording OFF (no new dot) AND
//   (b) RECALL every dot the session recorded. W-VIEWER-SESSION proves (a) + the card wiring; this
//   proves (b) — the persisted-tree RECALL — and PINS the failure mode behind an empty re-homed Z.
// Issue PROVED/DISPROVED, against the REAL common/history_bar.js persistence layer:
//   1. RECALL round-trips: a session pushes N dots under treeKey K → persisted → a FRESH load that
//      configures the SAME K lists all N (re-home recalls the session's dots).
//   2. DIVERGENCE = empty: configuring a DIFFERENT treeKey (the exact bug — the session SAVED under one
//      db string but the W card re-homes under another) lists ZERO. This is "fresh back zero".
//   3. The treeKey is `bim.hist.tree.<db>.<session>` — so the db string MUST be identical at record time
//      and at re-home for recall to work (the universal_history _treeKey ?db= vs _openDbUrl A.DB_URL hole).
// Deterministic: shared localStorage across two HistoryBar evals; no Date.now in the assert path.
'use strict';
var fs = require('fs'), path = require('path');

// ── shared browser shims (one `store` survives BOTH module evals = a page reload) ──
var store = {};
function mkLS() { return { getItem:function(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},
  setItem:function(k,v){store[k]=String(v);}, removeItem:function(k){delete store[k];},
  key:function(i){return Object.keys(store)[i];}, get length(){return Object.keys(store).length;} }; }

function freshHistoryBar() {
  // fresh window/document each "page load"; SAME localStorage `store`.
  var ls = mkLS();
  var win = { ICONS:{}, localStorage: ls, addEventListener:function(){}, location:{ search:'' } };
  var doc = { createElement:function(){return { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){}},
    appendChild:function(){}, addEventListener:function(){}, querySelector:function(){return null;},
    querySelectorAll:function(){return [];}, setAttribute:function(){} };},
    getElementById:function(){return null;}, addEventListener:function(){}, body:{appendChild:function(){}}, head:{appendChild:function(){}} };
  global.window = win; global.document = doc; global.localStorage = ls; global.BroadcastChannel = undefined;
  var src = fs.readFileSync(path.join(__dirname, '../../common/history_bar.js'), 'utf8');
  (0, eval)(src.replace(/\bwindow\./g,'global.window.').replace(/\bdocument\b/g,'global.document')
    .replace(/\blocalStorage\b/g,'global.localStorage').replace(/\bBroadcastChannel\b/g,'global.window.BroadcastChannel'));
  return global.window.HistoryBar;
}

var PROFILES = { low:{op:{'BUILDING_OPEN':true},view:{},event:{}}, mid:{op:{'BUILDING_OPEN':true},view:{},event:{}},
  high:{op:{'BUILDING_OPEN':true,'SECTION_CUT':true},view:{},event:{'SECTION_CUT':true}},
  max:{op:{'BUILDING_OPEN':true,'ELEMENT_PICK':true},view:{},event:{'SECTION_CUT':true}} };
PROFILES.all = PROFILES.high; PROFILES.doc = PROFILES.mid;
function cfg(HB, key) {
  HB.configure({ profiles:PROFILES, defaultDepth:function(){return 'max';}, source:'test', treeKey:key,
    depthKey:'bim.test.depth', sharedKey:'bim.test.shared', channel:'bim_test',
    restore:function(){}, restoreView:function(){}, afterApply:function(){}, iconFn:function(){return 'search';} });
}

var fail = 0;
function ok(c, m){ console.log((c?'§W-SESSION-RECALL PASS ':'§W-SESSION-RECALL FAIL ')+m); if(!c) fail++; }

var DB = 'https://oci.example/o/buildings/Terminal_extracted.db';
var SESS = 's1700000000000';
var K_REAL = 'bim.hist.tree.' + DB.replace(/[^A-Za-z0-9_.-]/g,'_') + '.' + SESS;   // what _treeKey makes WHEN ?db= present
var K_DEFAULT = 'bim.hist.tree.default.' + SESS;                                    // what it makes WHEN ?db= ABSENT (the hole)

// ── 1. a live session records 3 dots under K_REAL, persisted ──
var HB1 = freshHistoryBar();
cfg(HB1, K_REAL);
HB1.push({ bucket:'op', kind:'op', type:'BUILDING_OPEN', label:'Opened Terminal', readonly:false, sigKey:'op:BUILDING_OPEN:Terminal' });
HB1.push({ bucket:'event', kind:'event', type:'SECTION_CUT', label:'Section Y', readonly:true, sigKey:'event:SECTION_CUT:a' });
HB1.push({ bucket:'op', kind:'pick', type:'ELEMENT_PICK', label:'Pick wall', readonly:true, guids:['g1'], sigKey:'pick:g1' });
var savedN = HB1.list().length;
ok(savedN === 3, 'live session recorded 3 dots under K_REAL: ' + savedN);
ok(!!store[K_REAL], 'the session tree PERSISTED to localStorage[K_REAL]');

// ── 2. RE-HOME (fresh page load, SAME localStorage) configures the SAME key → RECALLS all 3 ──
var HB2 = freshHistoryBar();
cfg(HB2, K_REAL);
var recalled = HB2.list().length;
console.log('DIAG recall under K_REAL: dots=' + recalled + ' labels=' + JSON.stringify(HB2.list().map(function(e){return e.label;})));
ok(recalled === 3, 're-home under the SAME key RECALLS all 3 session dots (no new dot minted): ' + recalled);

// ── 3. DIVERGENCE: a fresh load under K_DEFAULT (session saved real, card re-homes default-or-vice-versa) → EMPTY ──
var HB3 = freshHistoryBar();
cfg(HB3, K_DEFAULT);
var diverged = HB3.list().length;
console.log('DIAG recall under K_DEFAULT (divergent db): dots=' + diverged);
ok(diverged === 0, 'a DIVERGENT treeKey lists ZERO = "fresh back zero" (the empty-Z failure mode): ' + diverged);

// ── 4. THE FIX (behavioral): a bare open keys 'default' at configure, then RE-KEYS to the authoritative
//      key BEFORE the first record → the dots land where the W card (ref.db=_openDbUrl) re-homes. Prove
//      the re-key sequence makes record-key == re-home-key so recall is no longer "fresh back zero". ──
store = {};   // clean localStorage for the fix scenario
var HB4 = freshHistoryBar();
cfg(HB4, K_DEFAULT);                          // configure-time: ?db= absent → 'default' (A.DB_URL not set yet)
HB4.setTreeKey(K_REAL);                       // _ensureAuthoritativeTreeKey() once the building loads (A.DB_URL live)
HB4.push({ bucket:'op', kind:'op', type:'BUILDING_OPEN', label:'Opened Terminal', readonly:false, sigKey:'op:BUILDING_OPEN:Terminal' });
HB4.push({ bucket:'event', kind:'event', type:'SECTION_CUT', label:'Section X', readonly:true, sigKey:'event:SECTION_CUT:x' });
ok(!!store[K_REAL] && !store[K_DEFAULT], 'after re-key the session persists under K_REAL, NOT K_DEFAULT');
var HB5 = freshHistoryBar();
cfg(HB5, K_REAL);                             // the W card re-homes here (ref.db = authoritative db)
var afterFix = HB5.list().length;
console.log('DIAG recall after re-key fix: dots=' + afterFix);
ok(afterFix === 2, 're-home now RECALLS the bare-open session (record-key == re-home-key): ' + afterFix);

// ── 5. source: the fix is wired — _treeKey keys off _openDbUrl (authoritative), and the three record
//      entry points re-key via _ensureAuthoritativeTreeKey before the first moment (never on re-home). ──
var uh = fs.readFileSync(path.join(__dirname, '../universal_history.js'), 'utf8');
var treeKeyFn = (uh.match(/function _treeKey\(\)\s*\{[\s\S]*?\n\s*\}/) || [''])[0];
ok(/_openDbUrl\(\)\s*\|\|\s*'default'/.test(treeKeyFn), '_treeKey keys the tree off _openDbUrl() (A.DB_URL-authoritative), matching the card ref.db');
ok(/db:\s*_openDbUrl\(\)/.test(uh), 'the W card ref.db uses _openDbUrl() — same source as _treeKey → no divergence');
ok(/function _ensureAuthoritativeTreeKey\(\)/.test(uh) && /HB\.setTreeKey\(_treeKey\(\)\)/.test(uh), '_ensureAuthoritativeTreeKey re-keys the tree via HB.setTreeKey before the first record');
ok((uh.match(/_ensureAuthoritativeTreeKey\(\);/g) || []).length >= 3, 'all 3 record entry points (op / view / event) re-key before pushing: ' + (uh.match(/_ensureAuthoritativeTreeKey\(\);/g) || []).length);
var recOpBody = (uh.match(/function _recordOp\([\s\S]*?_ensureAuthoritativeTreeKey/) || [''])[0];
ok(/_isReHome\(\)\) return;[\s\S]*_ensureAuthoritativeTreeKey/.test(recOpBody), 're-key runs AFTER the _isReHome gate (re-home never re-keys → read-only "no new dot" intact)');

console.log(fail === 0 ? '§W-SESSION-RECALL ALL PASS' : ('§W-SESSION-RECALL ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
