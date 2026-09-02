// ⚠ DO NOT REMOVE — FAST node WHITEBOX §-witness for the BLUE DOT state machine (blue_future.js skin legs).
// Spec: FRONTEND_LANE_MASTER §OUTSTANDING item 0 + HISTORY_KNOB_SIGNAL_TAP. Issue it proves/disproves:
//   "the Blue Dot gestures (long-press → enter / accept-up-to / discard-all) drive the shipped branch ENGINE
//    correctly, the read-VIEW seam exposes the branch ONLY while blue (official reads never see speculative
//    ops), and accepting the LAST blue dot drops the unofficial skin." Pure code — NO Playwright, NO browser:
//   load the REAL erp/blue_future.js with a tolerant document stub + a spy KernelOps, drive the gestures, and
//   read the §BLUE-LIVE log + the seam return values. Fast + deterministic; the log IS the proof.
// Run:  node erp/tests/poc_blue_future_unit.js 2>&1 | tee erp/tests/poc_blue_future_unit.log   (cwd = bim-ootb)
'use strict';

// ── tolerant DOM stub so the skin's _render/_applyTreatment/_ensureRail no-op without throwing ──
function _el() {
  var e = { style: {}, classList: { add: function(){}, remove: function(){}, toggle: function(){} },
            appendChild: function(){}, setAttribute: function(){}, addEventListener: function(){},
            querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
            innerHTML: '', textContent: '', className: '', id: '', title: '' };
  return e;
}
global.window = global;
global.CustomEvent = function(){ };
global.window.dispatchEvent = function(){};
global.window.confirm = function(){ return true; };
global.document = { body: _el(), head: _el(), readyState: 'complete',
  getElementById: function(){ return null; }, createElement: function(){ return _el(); },
  querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
  addEventListener: function(){} };

// ── spy ENGINE (the shipped kernel_ops branch API) + a fake kernel db ──
var calls = { accept: [], discard: 0 };
var BRANCH_OPS = [ { id: 10, gid: 'g1', op_type: 'UPDATE_LINE' },   // dot 1 (group g1, maxId 11)
                   { id: 11, gid: 'g1', op_type: 'SET_STATUS' },
                   { id: 12, gid: 'g2', op_type: 'CREATE_DOCUMENT' } ]; // dot 2 (group g2, maxId 12)
global.window.KernelOps = {
  branchOps: function(){ return BRANCH_OPS.slice(); },
  acceptBranchUpTo: function(db, b, maxId){ calls.accept.push({ b: b, maxId: maxId });
    var remaining = (maxId >= 12) ? 0 : 1;                 // accept ≥12 → nothing blue left
    return { accepted: (maxId >= 12 ? 2 : 1), remaining: remaining, chain: { ok: true } }; },
  discardBranch: function(db, b){ calls.discard++; return { discarded: 2, chain: { ok: true } }; },
  replayOps: function(){ return []; }
};
global.window.__crud = { kernelDb: function(){ return { exec: function(){ return [{ values: [[9]] }]; } }; } };  // MAX(id)=9 → tip

require(require('path').join(__dirname, '..', 'blue_future.js'));                 // attaches window.BlueFuture
var BF = global.window.BlueFuture;

var fails = 0;
function ok(name, cond, detail){ console.log('§W ' + (cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : '')); if (!cond) fails++; }

(async () => {
  // W-BLUE-INIT — official by default: not blue, the seam exposes NO branch (official reads unpolluted).
  ok('W-BLUE-INIT not-blue', BF.isBlue() === false);
  ok('W-BLUE-INIT seam null', BF.readBranch() === null && JSON.stringify(BF.groupMeta()) === '{}');

  // W-BLUE-ENTER — long-press white anchor → enter blue; branch seeded from official tip (MAX id=9).
  var br = BF.enter();
  ok('W-BLUE-ENTER branch seeded from tip', br === 'blue-9-1', 'branch=' + br);
  ok('W-BLUE-ENTER seam now exposes branch', BF.isBlue() === true && BF.readBranch() === br && BF.groupMeta().branch_id === br);
  ok('W-BLUE-ENTER idempotent (re-enter = same branch)', BF.enter() === br);

  // W-BLUE-GROUPS — dots = speculative moments grouped by gid; each carries its MAX op id (accept-up-to key).
  var groups = BF.groups();
  ok('W-BLUE-GROUPS 2 dots', groups.length === 2, 'n=' + groups.length);
  ok('W-BLUE-GROUPS maxIds [11,12]', groups[0].maxId === 11 && groups[1].maxId === 12, JSON.stringify(groups.map(function(g){return g.maxId;})));

  // W-BLUE-ACCEPT-PARTIAL — long-press the FIRST blue dot → accept ops ≤11; later blue (g2) stays blue.
  var r1 = await BF.acceptUpTo(11);
  ok('W-BLUE-ACCEPT-PARTIAL engine got maxId=11', calls.accept[0] && calls.accept[0].maxId === 11 && calls.accept[0].b === br);
  ok('W-BLUE-ACCEPT-PARTIAL still blue (remaining>0)', r1.remaining === 1 && BF.isBlue() === true);

  // W-BLUE-ACCEPT-ALL — accept the LAST dot (≤12) → remaining 0 → unofficial skin DROPS (auto-exit).
  var r2 = await BF.acceptUpTo(12);
  ok('W-BLUE-ACCEPT-ALL remaining 0 → exited', r2.remaining === 0 && BF.isBlue() === false && BF.readBranch() === null);

  // W-BLUE-DISCARD — re-enter, long-press white anchor → discard the whole branch (engine discardBranch).
  BF.enter();
  var rd = BF.discardAll(true);   // skipConfirm
  ok('W-BLUE-DISCARD engine discardBranch called', calls.discard === 1 && rd.discarded === 2);
  ok('W-BLUE-DISCARD exited + seam null (official untouched)', BF.isBlue() === false && BF.readBranch() === null);

  console.log('§W SUMMARY fails=' + fails);
  process.exit(fails ? 1 : 0);
})().catch(function(e){ console.error('HARNESS ERROR', e && e.stack || e); process.exit(2); });
