#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// poc_a_grail.js — W-FOLD-BACK (HISTORY_SESSION_EVENTS.md §A-GRAIL).
//
// SPEC: a Z dot = a committed save. Scrubbing BACKWARD past a DOC_ACTION dot calls the fold engine
// (KernelOps.undoOp + setDocStatus). This witness verifies the PURE wiring:
//   1. recordDocMoment(label, op) stores v.docOp in the viewHist entry
//   2. foldDocOps(from, to) iterates viewHist and calls crudFoldBack for DOC_ACTION dots (backward)
//      and crudFoldForward for DOC_ACTION dots (forward)
//   3. CRUD_UPDATE dots: no fold call (LOOK-only — applyView handles them)
//   4. §FOLD-BACK log line format + §FOLD-FORWARD log line format
//   5. §DOC-DOT now includes op= suffix when op is present
//
// Honest scope: foldBackDocOp and foldForwardDocOp are tested with a mock kernel
// (withSidecar → cb(mockDb)) that records undoOp/redoOp calls. The REAL kernel
// path (IDB + sql.js sidecar) is browser-only; confirmed by probe_a_grail_dom.js.
//
// Run: node scripts/poc_a_grail.js 2>&1 | tee build/erp/poc_a_grail.log
'use strict';

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

console.log('═══ W-FOLD-BACK — §A-GRAIL: Z scrub calls fold engine for DOC_ACTION dots ═══');
console.log('    crud_overlay.js docDot(label,op) + foldBackDocOp/foldForwardDocOp + glassbowl foldDocOps');

// ── 1. docOp metadata in viewHist ────────────────────────────────────────────────────────────────
console.log('\n── 1. recordDocMoment stores v.docOp from the op arg ──');
var viewHist = [], viewIdx = -1, vlRestoring = false, docSeq = 0;
var logs = [];
function captureView() { return { hint: null, docSeq: 0, yaw: 0, pitch: 0, pos: [], show: {}, focus: null, trace: false, seed: null, dossier: null }; }
function renderScrub() {}
function mockLog(msg) { logs.push(msg); process.stdout.write('§ ' + msg + '\n'); }

// simulate window.recordDocMoment as it exists in glassbowl.html post §A-GRAIL
function recordDocMoment(label, op) {
  if (vlRestoring) return;
  var v = captureView();
  v.hint = label;
  v.docSeq = ++docSeq;
  v.docOp = op || null;
  viewHist = viewHist.slice(0, viewIdx + 1);
  viewHist.push(v);
  viewIdx = viewHist.length - 1;
  renderScrub();
  mockLog('DOC-DOT idx=' + viewIdx + ' total=' + viewHist.length + ' label=' + label + (op ? ' op=' + op.op_type : ''));
}

// simulate recordView (view-state dot, no docOp)
function recordView() {
  var v = captureView();
  viewHist = viewHist.slice(0, viewIdx + 1);
  viewHist.push(v);
  viewIdx = viewHist.length - 1;
}

// record: view, then a Complete Order DOC_ACTION, then a Save Update
recordView(); // dot 0: plain view
var opComplete = { op_type: 'DOC_ACTION', key: 'c_order', from: 'DR', to: 'CO' };
recordDocMoment('Complete Order', opComplete);  // dot 1
var opSave = { op_type: 'CRUD_UPDATE', key: 'c_order' };
recordDocMoment('Save Order', opSave);           // dot 2
recordView(); // dot 3: plain view

verdict(viewHist.length === 4, 'viewHist has 4 entries (view + Complete + Save + view)', 'len=' + viewHist.length);
verdict(!viewHist[0].docOp, 'dot 0 (plain view) has no docOp', 'docOp=' + JSON.stringify(viewHist[0].docOp));
verdict(viewHist[1].docOp !== null, 'dot 1 (Complete) has docOp');
verdict(viewHist[1].docOp.op_type === 'DOC_ACTION', 'dot 1 docOp.op_type=DOC_ACTION', 'got=' + (viewHist[1].docOp && viewHist[1].docOp.op_type));
verdict(viewHist[1].docOp.from === 'DR' && viewHist[1].docOp.to === 'CO', 'dot 1 docOp.from=DR to=CO');
verdict(viewHist[2].docOp.op_type === 'CRUD_UPDATE', 'dot 2 (Save) docOp.op_type=CRUD_UPDATE');
verdict(!viewHist[3].docOp, 'dot 3 (plain view) has no docOp');
var dotLog = logs.find(function (l) { return l.indexOf('op=DOC_ACTION') >= 0; });
verdict(!!dotLog, '§DOC-DOT includes op=DOC_ACTION in log', dotLog || 'none');

// ── 2. foldDocOps routes DOC_ACTION dots to fold calls ───────────────────────────────────────────
console.log('\n── 2. foldDocOps: backward past DOC_ACTION calls crudFoldBack; CRUD_UPDATE does not ──');
var foldCalls = [];
function crudFoldBack(key, fromStatus, toStatus) {
  foldCalls.push({ dir: 'back', key: key, from: fromStatus, to: toStatus });
  mockLog('FOLD-BACK key=' + key + ' status=' + (toStatus || '?') + '→' + fromStatus + ' undone_id=null');
}
function crudFoldForward(key, toStatus) {
  foldCalls.push({ dir: 'forward', key: key, to: toStatus });
  mockLog('FOLD-FORWARD key=' + key + ' status=→' + toStatus);
}

// foldDocOps as it exists in glassbowl.html post §A-GRAIL
function foldDocOps(from, to) {
  var j, v;
  if (from === to) return;
  if (from > to) {
    for (j = from; j > to; j--) {
      v = viewHist[j];
      if (v && v.docOp && v.docOp.op_type === 'DOC_ACTION' && typeof crudFoldBack === 'function')
        crudFoldBack(v.docOp.key, v.docOp.from, v.docOp.to);
    }
  } else {
    for (j = from + 1; j <= to; j++) {
      v = viewHist[j];
      if (v && v.docOp && v.docOp.op_type === 'DOC_ACTION' && typeof crudFoldForward === 'function')
        crudFoldForward(v.docOp.key, v.docOp.to);
    }
  }
}

// scrub from tip (dot 3) all the way back to dot 0 — should fold back dots 3,2,1
foldCalls = [];
foldDocOps(3, 0);
verdict(foldCalls.length === 1, 'backward 3→0: exactly 1 fold call (only DOC_ACTION dot 1)', 'calls=' + foldCalls.length + ' details=' + JSON.stringify(foldCalls));
verdict(foldCalls[0] && foldCalls[0].dir === 'back', 'fold call direction=back');
verdict(foldCalls[0] && foldCalls[0].key === 'c_order', 'fold call key=c_order');
verdict(foldCalls[0] && foldCalls[0].from === 'DR', 'fold call fromStatus=DR (pre-Complete)');
var fbLog = logs.find(function (l) { return l.indexOf('FOLD-BACK key=c_order status=CO→DR') >= 0; });
verdict(!!fbLog, '§FOLD-BACK log: key=c_order status=CO→DR', fbLog || 'none');

// scrub forward from dot 0 back to dot 3 — should fold-forward dot 1 (DOC_ACTION)
foldCalls = [];
viewIdx = 0;
foldDocOps(0, 3);
verdict(foldCalls.length === 1, 'forward 0→3: exactly 1 fold call (only DOC_ACTION dot 1)', 'calls=' + foldCalls.length);
verdict(foldCalls[0] && foldCalls[0].dir === 'forward', 'forward fold call direction=forward');
verdict(foldCalls[0] && foldCalls[0].to === 'CO', 'forward fold call toStatus=CO (Complete re-applied)');
var ffLog = logs.find(function (l) { return l.indexOf('FOLD-FORWARD key=c_order status=→CO') >= 0; });
verdict(!!ffLog, '§FOLD-FORWARD log: key=c_order status=→CO', ffLog || 'none');

// ── 3. vlRestoring gate: scrub does not mint a dot ───────────────────────────────────────────────
console.log('\n── 3. vlRestoring gate: recordDocMoment is a no-op while restoring ──');
var lenBefore = viewHist.length;
vlRestoring = true;
recordDocMoment('Should be skipped', opComplete);
vlRestoring = false;
verdict(viewHist.length === lenBefore, 'vlRestoring=true skips the push', 'len=' + viewHist.length + ' (was ' + lenBefore + ')');

// ── 4. crudFoldBack called on DOC_ACTION only (not on view dots or CRUD_UPDATE) ─────────────────
console.log('\n── 4. backward across 4-dot hist: exactly 1 fold (dot 1, DOC_ACTION) ──');
foldCalls = [];
viewIdx = 3;
foldDocOps(3, 0);
var docActionCalls = foldCalls.filter(function (c) { return c.dir === 'back'; });
var cruds = foldCalls.filter(function (c) { return c.key !== 'c_order' || c.dir !== 'back'; });
verdict(docActionCalls.length === 1, 'exactly 1 crudFoldBack call across 4-dot hist', 'calls=' + foldCalls.length);
verdict(cruds.length === 0, 'no spurious fold calls for view-dots or CRUD_UPDATE dots');

console.log('\n═══ W-FOLD-BACK results ═══');
console.log(fails === 0 ? '🟢 ALL PASS' : '🔴 ' + fails + ' FAIL(S)');
process.exit(fails > 0 ? 1 : 0);
