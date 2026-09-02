// ⚠ DO NOT REMOVE — Witness: W-WORLD-DBREF (CRUD_EDIT_PERSIST.md Item 3). Read the log, not the exit code.
// Issue PROVED/DISPROVED: a World building-card "sometimes" failed to transport to the building. Root
// cause (the card's named suspect (a)): the BUILDING_OPEN ref carried db = `?db=` query param, which is
// ABSENT on any open path without ?db= in the URL → ref.db null → whole_history._deepUrl fell back to a
// BARE url → no deterministic deep-link. FIX: universal_history._openDbUrl now prefers the AUTHORITATIVE
// A.DB_URL (the db the viewer actually loaded), so ref.db is ALWAYS stamped when a building is open →
// _deepUrl always bakes ?db=<url>&ghost=1 → the page reopens the building from its OWN url (no load-timing
// consumeRestore race). import:// dbs (tab-local IndexedDB) stay null on purpose (not cross-page openable).
//
// This drives the REAL record path: it wraps a stub KernelOps.commitOp (as the module does), fires a
// BUILDING_OPEN with NO ?db= in location.search, and captures the ref the module pushes — then feeds that
// ref into the REAL whole_history._deepUrl. No fixtures for the logic under test.
// Run: node viewer/tests/poc_world_card_dbref.js
'use strict';
var path = require('path');

var fail = 0;
function ok(c, m) { console.log((c ? '§W-WORLD-DBREF PASS ' : '§W-WORLD-DBREF FAIL ') + m); if (!c) fail++; }

// ── minimal browser-ish globals the module touches at mount + on the BUILDING_OPEN record path ──
var pushed = [];                                   // capture every HB.push (the ref lives here)
var HB = {
  configure: function () {}, list: function () { return []; }, isEnabled: function () { return true; },
  tipInfo: function () { return null; }, push: function (e) { pushed.push(e); },
  setEnabled: function () {}, setDepth: function () {}, cycleDepth: function () {}, getDepth: function () {},
  clear: function () {}, open: function () {}, toggleOpen: function () {}, significant: function () {},
  undo: function () {}, redo: function () {}, jumpTo: function () {}, switchToId: function () {},
  tips: function () {}, dumpTree: function () {}, setTreeKey: function () {}, combineFromId: function () {}
};
var store = {}, sess = {};
function mapLS(s) { return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(s, k) ? s[k] : null; },
  setItem: function (k, v) { s[k] = String(v); }, removeItem: function (k) { delete s[k]; } }; }
var DBURL = 'https://oci.example.com/o/buildings/SampleCastle_extracted.db';
var commitImpls = [];
global.window = {
  HistoryBar: HB,
  A: { DB_URL: DBURL, activeBuilding: 'SampleCastle' },        // authoritative loaded db — NO ?db= in the URL
  KernelOps: { commitOp: function (db, t, p, g) { commitImpls.push([t, p]); return 'op1'; } },
  location: { search: '' },                                    // <-- the bug trigger: no ?db=
  sessionStorage: mapLS(sess)
};
global.location = global.window.location;
global.sessionStorage = global.window.sessionStorage;
global.localStorage = mapLS(store);
global.URLSearchParams = URLSearchParams;
global.KernelOps = global.window.KernelOps;   // browser: window IS global → the module reads bare `KernelOps`

// load the REAL module (mounts: wraps commitOp, defines _openDbUrl, sets window.UniversalHistory)
require(path.join(__dirname, '..', 'universal_history.js'));
var UH = global.window.UniversalHistory;
ok(!!UH && typeof UH.openDbUrl === 'function', 'module mounted + exposes openDbUrl');

// ── A · _openDbUrl resolves to the AUTHORITATIVE A.DB_URL even with NO ?db= in the URL (the fix) ──
console.log('§WHOLE-DBREF openDbUrl(noQuery)=' + UH.openDbUrl() + ' A.DB_URL=' + DBURL);
ok(UH.openDbUrl() === DBURL, 'openDbUrl() returns A.DB_URL when ?db= is absent (was null → the bug)');

// ── B · the REAL BUILDING_OPEN record path now stamps a NON-NULL ref.db ──
pushed.length = 0;
global.window.KernelOps.commitOp(null, 'BUILDING_OPEN', { name: 'SampleCastle' }, []);   // wrapped → _recordOp → HB.push
var rec = pushed.filter(function (e) { return e.type === 'BUILDING_OPEN'; }).pop();
console.log('§WHOLE-DBREF recorded ref=' + JSON.stringify(rec && rec.ref));
ok(rec && rec.ref && rec.ref.db === DBURL, 'BUILDING_OPEN ref.db is stamped from A.DB_URL (deterministic re-open key)');
ok(rec && rec.ref && rec.ref.building === 'SampleCastle' && rec.ref.session, 'ref also carries building + session (unchanged)');

// ── C · feed that ref into the REAL _deepUrl → a building card now DEEP-LINKS (not bare) ──
global.localStorage = mapLS({});   // fresh LS for the whole_history module
var WH = require(path.join(__dirname, '..', '..', 'common', 'whole_history.js'));
WH.record({ page: 'viewer', ts: 1700000000000, label: 'SampleCastle', kind: 'op', ref: rec.ref });
var item = WH.buildItems('whole', 'landing').filter(function (i) { return i.label === 'SampleCastle'; })[0];
console.log('§WHOLE-DBREF deepUrl=' + (item && item.url));
// the url carries db + the v638 session re-home + ghost; sess id is Date.now()-derived → assert structure.
var url = (item && item.url) || '';
ok(url.indexOf('viewer/viewer.html?db=' + DBURL) === 0 && /&sess=s\d+/.test(url) && /&ghost=1$/.test(url),
   'the building card deep-links ?db=<A.DB_URL>&sess=…&ghost=1 → deterministic transport (no bare-url fallback)');

// ── D · CONTROL — the OLD bug shape (ref WITHOUT db) still falls back to bare url (regression guard) ──
WH.record({ page: 'viewer', ts: 1700000001000, label: 'OldNoDb', kind: 'op', ref: { building: 'OldNoDb' } });
var bad = WH.buildItems('whole', 'landing').filter(function (i) { return i.label === 'OldNoDb'; })[0];
ok(bad && bad.url === 'viewer/viewer.html', 'control: a db-less ref still yields the bare url (the pre-fix symptom)');

// ── E · CONTROL — import:// db is NOT deep-linked (tab-local; bare-url + same-session RESTORE_KEY only) ──
global.window.A.DB_URL = 'import://dropped-ifc-1234';
console.log('§WHOLE-DBREF openDbUrl(import)=' + UH.openDbUrl());
ok(UH.openDbUrl() === null, 'import:// db → openDbUrl null (not cross-page deep-linkable; bare-url fallback)');

// ── F · CONTROL — A absent → falls back to the ?db= query param (back-compat preserved) ──
global.window.A = null; global.window.location.search = '?db=' + DBURL;
ok(UH.openDbUrl() === DBURL, 'A absent → falls back to the ?db= query param (back-compat)');

console.log(fail === 0 ? '§W-WORLD-DBREF ALL PASS' : ('§W-WORLD-DBREF ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
