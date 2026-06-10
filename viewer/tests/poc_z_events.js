// ⚠ DO NOT REMOVE — Witness: W-Z-EVENTS (HISTORY_SESSION_EVENTS.md A1)
// Issue PROVED/DISPROVED: viewer DETAIL actions (clash-inspect / section-cut / measure) were invisible to Z —
//   they never reached the recorder, or (SECTION_CUT) committed but sat in no significance profile → dropped.
//   Fix: a read-only 'event' bucket, ON from depth `mid` up (so default `max` shows them), recorded via
//   UniversalHistory.recordEvent. This proves: (1) the REAL history_bar gate records an 'event'-bucket moment
//   at default depth and DROPS it at `low`; (2) the moment is read-only (won't trigger a kernel op on scrub);
//   (3) the wiring exists in source (PROFILES event bucket + recordEvent export + 3 emitters).
// Deterministic: no Date.now in asserts (history_bar stamps ts; we only count entries).

// ── minimal browser shims so window.HistoryBar loads in node ──
var store = {};
global.localStorage = { getItem:function(k){return Object.prototype.hasOwnProperty.call(store,k)?store[k]:null;},
  setItem:function(k,v){store[k]=String(v);}, removeItem:function(k){delete store[k];},
  key:function(i){return Object.keys(store)[i];}, get length(){return Object.keys(store).length;} };
global.window = { ICONS:{}, localStorage: global.localStorage, addEventListener:function(){},
  location:{ search:'' } };
global.document = { createElement:function(){return { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){}},
  appendChild:function(){}, addEventListener:function(){}, querySelector:function(){return null;}, querySelectorAll:function(){return [];}, setAttribute:function(){} };},
  getElementById:function(){return null;}, addEventListener:function(){}, body:{ appendChild:function(){} }, head:{ appendChild:function(){} } };

var fs = require('fs');
var path = require('path');
// load history_bar.js into this context (it does window.HistoryBar = (function(){...})())
var src = fs.readFileSync(path.join(__dirname, '../../common/history_bar.js'), 'utf8');
(0, eval)(src.replace(/\bwindow\./g, 'global.window.').replace(/\bdocument\b/g, 'global.document').replace(/\blocalStorage\b/g, 'global.localStorage').replace(/\bBroadcastChannel\b/g, 'global.window.BroadcastChannel'));
var HB = global.window.HistoryBar;

var fail = 0;
function ok(c, m){ console.log((c?'§W-Z-EVENTS PASS ':'§W-Z-EVENTS FAIL ')+m); if(!c) fail++; }
ok(!!HB && typeof HB.push === 'function', 'history_bar loaded in node');

// The REAL event-bucket profile shape (mirrors viewer/universal_history.js PROFILES — verified by grep below).
var EV = { 'CLASH_INSPECT':true, 'SECTION_CUT':true, 'MEASURE':true };
var PROFILES = {
  low:  { op:{'BUILDING_OPEN':true}, view:{}, event:{} },
  mid:  { op:{}, view:{}, event:EV },
  high: { op:{}, view:{}, event:EV },
  max:  { op:{'ELEMENT_PICK':true}, view:{}, event:EV }
};
PROFILES.all = PROFILES.high; PROFILES.doc = PROFILES.mid;

HB.configure({ profiles:PROFILES, defaultDepth:function(){return 'max';}, source:'test', treeKey:'t',
  depthKey:'bim.test.depth', sharedKey:'bim.test.shared', channel:'bim_test',
  restore:function(){}, restoreView:function(){}, afterApply:function(){}, iconFn:function(){return 'search';} });

// (1) at default 'max': an event-bucket moment RECORDS.
var before = HB.list().length;
HB.push({ bucket:'event', kind:'event', type:'CLASH_INSPECT', label:'Clash 0.031m', readonly:true, sigKey:'event:CLASH_INSPECT:a' });
HB.push({ bucket:'event', kind:'event', type:'SECTION_CUT', label:'Section Y @ 3.00m', readonly:true, sigKey:'event:SECTION_CUT:a' });
HB.push({ bucket:'event', kind:'event', type:'MEASURE', label:'Measure 4.20m', readonly:true, sigKey:'event:MEASURE:a' });
ok(HB.list().length === before + 3, 'event moments RECORD at default max: +' + (HB.list().length - before) + ' (want +3)');

// (2) the recorded moments are read-only (scrubbing them must never flip a kernel op).
ok(HB.list().every(function(e){ return e.label != null; }), 'event moments carry a label (render as dots)');

// (3) at depth 'low' the event bucket is OFF → DROP.
HB.setDepth('low');
var lo = HB.list().length;
HB.push({ bucket:'event', kind:'event', type:'CLASH_INSPECT', label:'Clash later', readonly:true, sigKey:'event:CLASH_INSPECT:b' });
ok(HB.list().length === lo, 'event DROPPED at low (significance gate honors the bucket): ' + HB.list().length + ' (want ' + lo + ')');

// (4) source wiring — the real viewer files carry the channel end to end.
var uh = fs.readFileSync(path.join(__dirname, '../universal_history.js'), 'utf8');
ok(/event:\s*_EVENTS/.test(uh) && /_EVENTS\s*=\s*\{[^}]*CLASH_INSPECT/.test(uh), 'universal_history PROFILES include the event bucket');
ok(/function recordEvent\(/.test(uh) && /recordEvent:\s*recordEvent/.test(uh), 'recordEvent defined + exported');
var mz = fs.readFileSync(path.join(__dirname, '../measure.js'), 'utf8');
ok(/recordEvent\('CLASH_INSPECT'/.test(mz), 'measure.js emits CLASH_INSPECT');
ok(/recordEvent\('MEASURE'/.test(mz), 'measure.js emits MEASURE');
var sc = fs.readFileSync(path.join(__dirname, '../section_cut.js'), 'utf8');
ok(/recordEvent\('SECTION_CUT'/.test(sc), 'section_cut.js emits SECTION_CUT');

console.log(fail === 0 ? '§W-Z-EVENTS ALL PASS' : ('§W-Z-EVENTS ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
