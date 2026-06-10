// ⚠ DO NOT REMOVE — Witness: W-BOMB-WORLD
// Issue PROVED/DISPROVED: "the bomb (clear history) wipes the per-page TIMELINE but NOT the cross-page
//   WORLD History." World History is its own store (WholeHistory.KEY = bim.docHistory). The viewer bomb
//   only removed bim.hist.tree.* keys; iDempiere's bomb removed bim.hist*/idmp.hist* — neither matches
//   bim.docHistory. This test reproduces the survival under the OLD filter, then proves the NEW path
//   (filter + WholeHistory.clear()) leaves the World store empty.
// Deterministic: injected integer ts, no Date.now in the assert path. Node-run, localStorage shim.

// localStorage shim (whole_history.js is node-testable per its header).
var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  key: function (i) { return Object.keys(store)[i]; },
  get length() { return Object.keys(store).length; }
};
Object.keys = (function (orig) { return orig; })(Object.keys); // (no-op; keep native)

var WholeHistory = require('../../common/whole_history.js');

var fail = 0;
function ok(cond, msg) { console.log((cond ? '§W-BOMB-WORLD PASS ' : '§W-BOMB-WORLD FAIL ') + msg); if (!cond) fail++; }

// ── seed both stores ───────────────────────────────────────────────────────
// per-page TIMELINE (what the bomb already cleared)
localStorage.setItem('bim.hist.tree.SampleCastle', JSON.stringify([{ id: 'a' }]));
// cross-page WORLD log (what the bomb MISSED) — write via the real public writer
WholeHistory.record({ page: 'viewer', ts: 1700000000000, label: 'SampleCastle', kind: 'BUILDING_OPEN' });
WholeHistory.record({ page: 'idempiere', ts: 1700000001000, label: 'Sales Order', kind: 'DOC_OPEN' });
ok(WholeHistory.entries().length === 2, 'seed world entries=' + WholeHistory.entries().length + ' (want 2)');
ok(WholeHistory.KEY === 'bim.docHistory', 'world store KEY=' + WholeHistory.KEY);

// ── OLD viewer bomb path: remove only bim.hist.tree.* ───────────────────────
function oldViewerBomb() {
  Object.keys(store).filter(function (k) { return k.indexOf('bim.hist.tree') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
}
oldViewerBomb();
ok(store['bim.hist.tree.SampleCastle'] === undefined, 'OLD bomb cleared the per-page timeline');
ok(WholeHistory.entries().length === 2, 'OLD bomb LEFT World History behind (the bug) entries=' + WholeHistory.entries().length);

// ── OLD iDempiere bomb path: bim.hist* / idmp.hist* prefix does NOT match bim.docHistory ──
ok('bim.docHistory'.indexOf('bim.hist') !== 0, 'idmp prefix bim.hist does NOT prefix-match bim.docHistory');

// ── NEW path: the fix calls WholeHistory.clear() too ────────────────────────
function newBomb() {
  Object.keys(store).filter(function (k) { return k.indexOf('bim.hist.tree') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
  if (WholeHistory && WholeHistory.clear) WholeHistory.clear();
}
newBomb();
ok(WholeHistory.entries().length === 0, 'NEW bomb cleared World History entries=' + WholeHistory.entries().length + ' (want 0)');
ok(store['bim.docHistory'] === undefined, 'NEW bomb removed the bim.docHistory store key');

console.log(fail === 0 ? '§W-BOMB-WORLD ALL PASS' : ('§W-BOMB-WORLD ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
