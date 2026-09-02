#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-MODELLER-REDO-ORDER: node witness against the REAL bonsai_oplog.js + REAL
 * kernel_ops.js (sql.js chain). Read the log after every run — exit code alone is not evidence.
 * Spec: prompts/MODELLER_GIT_FAITHFUL_HISTORY.md Phase 1.
 *
 * Issue under test: redo() picked `undoneRows[undoneRows.length-1]` — the HIGHEST-id undone row
 * ("most recently created"), the OPPOSITE of correct LIFO redo order. The proven invariant, already
 * live in both viewer/kernel_ops.js redoOp and erp/kernel_ops.js redoOp, is "redo the LOWEST-id undone
 * row" (the one nearest the active/undone boundary — the one undo() removed MOST RECENTLY). Fixed to
 * `undoneRows[0]`.
 *
 * Checks:
 *   R1 baseline   — 3 standalone commits (ids rising), all active
 *   R2 undo-twice — undo() ×2 ⇒ the two HIGHEST ids are undone, lowest survives active
 *   R3 redo-order — ONE redo() reactivates the LOWER of the two undone ids first (not the higher one)
 *   R4 redo-again — a SECOND redo() brings back the remaining (higher) id — full restore, correct order
 *   R5 chain      — verifyChain ok throughout (undone flag is outside the signed payload)
 */
'use strict';
var fs = require('fs'), path = require('path');

// ── node shims for the window-IIFE modules ──
global.window = global.window || {};
global.location = { href: 'http://localhost/' };
if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;
var _store = {};
global.localStorage = { getItem: k => (k in _store ? _store[k] : null), setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; } };

var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'kernel_ops.js'));            // → window.KernelOps
var initSqlJs = require(path.join(ROOT, 'lib', 'sql-wasm.js'));
var wasmBinary = fs.readFileSync(path.join(ROOT, 'lib', 'sql-wasm.wasm'));
window.initSqlJs = function () { return initSqlJs({ wasmBinary: wasmBinary }); };
window.Bonsai = { foldChainToScene: async function (ops) { return { solids: ops.length, triangleCount: 0 }; },
  author: async function () { return { triangleCount: 0 }; },
  clearKernelCache: function () {} };
require(path.join(ROOT, 'bonsai_oplog.js'));          // → window.Bonsai.oplog (REAL, node-shimmed)
var O = window.Bonsai.oplog;

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function activeIds() { return O._allGeom().filter(o => !o.undone).map(o => o.id).sort((a, b) => a - b); }
function undoneIds() { return O._allGeom().filter(o => o.undone).map(o => o.id).sort((a, b) => a - b); }

(async function () {
  console.log('═══ W-MODELLER-REDO-ORDER — redo() picks lowest-id-undone first (REAL oplog + kernel_ops chain) ═══');
  await O._ensureDb();

  // R1 — 3 standalone commits, no gesture/parent relation between them
  var s1 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 1 } }, {});
  var s2 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 2 } }, {});
  var s3 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 3 } }, {});
  chk('R1 baseline all 3 active', JSON.stringify(activeIds()) === JSON.stringify([s1.id, s2.id, s3.id]),
    'active=' + JSON.stringify(activeIds()));

  // R2 — undo the two most recent (LIFO: highest-id active goes first, each undo())
  await O.undo();   // removes s3 (highest active)
  await O.undo();   // removes s2 (now-highest active)
  chk('R2 undo-twice leaves lowest (s1) active, {s2,s3} undone',
    JSON.stringify(activeIds()) === JSON.stringify([s1.id]) && JSON.stringify(undoneIds()) === JSON.stringify([s2.id, s3.id]),
    'active=' + JSON.stringify(activeIds()) + ' undone=' + JSON.stringify(undoneIds()));

  // R3 — the FIRST redo must bring back s2 (lowest undone id = nearest the active boundary),
  //      NOT s3 (highest undone id = "most recently created", the pre-fix bug's pick).
  var r1 = await O.redo();
  chk('R3 redo-order picks LOWER undone id (s2) first, not higher (s3)', r1.redone === s2.id,
    'redone=' + r1.redone + ' want=' + s2.id + ' (bug would redone=' + s3.id + ')');
  chk('R3 s3 still undone after first redo', undoneIds().indexOf(s3.id) >= 0 && activeIds().indexOf(s2.id) >= 0);

  // R4 — the second redo brings back s3, completing correct-order full restore
  var r2 = await O.redo();
  chk('R4 redo-again completes restore in order', r2.redone === s3.id && JSON.stringify(activeIds()) === JSON.stringify([s1.id, s2.id, s3.id]),
    'redone=' + r2.redone + ' active=' + JSON.stringify(activeIds()));

  // R5 — chain still verifies after all the toggling
  var v = await O.verify();
  chk('R5 chain-intact after undo/redo toggling', v.ok === true, 'tip=' + String(v.tip).slice(0, 12));

  console.log('W-MODELLER-REDO-ORDER ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
