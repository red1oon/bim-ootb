#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GESTURE-UNDO: §P8 (prompts/RESUME_MODELLER_POLISH_BATCH.md) node witness against the
 * REAL bonsai_oplog.js + REAL kernel_ops.js (sql.js chain, edge signer, verifyChain). Read the log after every run.
 *
 * Issue under test: a grid-stretch with a hosted rider used to commit GEOM_GRID_MOVE + N separate rider
 * GEOM_MOVEs ⇒ one user gesture needed N+1 Ctrl+Z, with a half-reverted stretch in between. commitGesture now
 * groups them under ONE 'gesture-grp-*' gid, and undo()/redo() toggle that whole gid together — while every
 * other gid keeps the one-row behaviour (the whole-building 'arcseed-*' group must NEVER mass-undo).
 *
 * Checks:
 *   U1 gesture-commit — commitGesture([3 ops]) ⇒ 3 rows share ONE gesture-grp gid, chain verifies
 *   U2 one-undo       — ONE undo() ⇒ all 3 gesture rows undone (active -3), singles before it untouched
 *   U3 one-redo       — ONE redo() ⇒ all 3 back (active +3)
 *   U4 single-op pin  — a plain commit() still undoes ALONE (active -1) — no behaviour change
 *   U5 arcseed pin    — an 'arcseed-*' group (commitSeedGroup) undoes ONE row only, never the whole seed
 *   U6 chain-intact   — verifyChain ok after every toggle (undone flag is outside the signed payload)
 *   U7 counter        — a fresh oplog over the same db restores _n past the gesture ordinal (no gid collision)
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
  author: async function () { return { triangleCount: 0 }; },   // LEAF optimistic-append path (commit() GEOM_EXTRUDE)
  clearKernelCache: function () {} };
require(path.join(ROOT, 'bonsai_oplog.js'));          // → window.Bonsai.oplog (REAL, node-shimmed)
var O = window.Bonsai.oplog;

var pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function activeIds() { return O._allGeom().filter(o => !o.undone).map(o => o.id); }

(async function () {
  console.log('═══ W-GESTURE-UNDO — §P8 one gesture = one undo (REAL oplog + kernel_ops chain) ═══');
  await O._ensureDb();

  // baseline: two plain single-op commits (a wall + an insert-ish box op type is irrelevant to grouping)
  var s1 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 1 } }, {});
  var s2 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 2 } }, {});

  // U1 — one gesture of 3 ops (shape mirrors gridmove: GRID_MOVE + 2 induced rider moves)
  var g = await O.commitGesture([
    { op_type: 'GEOM_GRID_MOVE', params: { gridId: 'gx1', delta: 0.6, commands: [{ featureId: s1.id, action: 'TRANSLATE' }] } },
    { op_type: 'GEOM_MOVE', params: { parent: s1.id, dx: 0.6, dy: 0, dz: 0, induced: 'hosted-by' } },
    { op_type: 'GEOM_MOVE', params: { parent: s2.id, dx: 0.6, dy: 0, dz: 0, induced: 'hosted-by' } }
  ]);
  var gidRows = O._allGeom().filter(o => o.gid === g.gid);
  chk('U1 gesture-commit 3 rows share ONE gesture gid', g.ids.length === 3 && gidRows.length === 3 && /^gesture-grp-/.test(g.gid),
    'gid=' + g.gid + ' verify=' + g.verify);
  chk('U1 chain verifies after gesture', g.verify === true);

  // U2 — ONE undo takes out the whole gesture
  var a0 = activeIds().length;
  var u = await O.undo();
  var a1 = activeIds().length;
  chk('U2 one-undo → all 3 gesture rows undone', a0 - a1 === 3 && u.group && u.group.length === 3,
    'active ' + a0 + '→' + a1 + ' group=' + JSON.stringify(u.group));
  chk('U2 singles untouched', activeIds().indexOf(s1.id) >= 0 && activeIds().indexOf(s2.id) >= 0);

  // U3 — ONE redo brings the whole gesture back
  var r = await O.redo();
  var a2 = activeIds().length;
  chk('U3 one-redo → all 3 back', a2 === a0 && r.group && r.group.length === 3, 'active ' + a1 + '→' + a2);

  // U4 — plain single op still undoes alone
  var s3 = await O.commit({ op_type: 'GEOM_EXTRUDE', parameters: { w: 3 } }, {});
  var b0 = activeIds().length;
  var u2 = await O.undo();
  chk('U4 single-op pin (one row only)', b0 - activeIds().length === 1 && u2.undone === s3.id && !u2.group,
    'undone=' + u2.undone);
  await O.redo();                                              // restore for the next check

  // U5 — an arcseed-style group must NOT mass-undo (regression pin for the whole-building seed)
  var seed = await O.commitSeedGroup([
    { op_type: 'GEOM_INSERT', params: { bbox: [0, 1, 0, 1, 0, 1], placement: { x: 0, y: 0, z: 0, rot: 0 } }, outputGuid: 'guid-seed-1' },
    { op_type: 'GEOM_INSERT', params: { bbox: [0, 1, 0, 1, 0, 1], placement: { x: 2, y: 0, z: 0, rot: 0 } }, outputGuid: 'guid-seed-2' },
    { op_type: 'GEOM_INSERT', params: { bbox: [0, 1, 0, 1, 0, 1], placement: { x: 4, y: 0, z: 0, rot: 0 } }, outputGuid: 'guid-seed-3' }
  ], 'arcseed-WitnessBuilding');
  var c0 = activeIds().length;
  var u3 = await O.undo();
  chk('U5 arcseed pin — ONE row only, never the seed group', c0 - activeIds().length === 1 && !u3.group,
    'seedRows=' + seed.ids.length + ' undone=' + u3.undone);
  await O.redo();

  // U6 — chain still verifies after all the toggling (undone is outside the signed payload)
  var v = await O.verify();
  chk('U6 chain-intact after undo/redo toggling', v.ok === true, 'tip=' + String(v.tip).slice(0, 12));

  // U7 — a FRESH oplog over the same persisted bytes restores _n PAST the gesture ordinal (no gid collision)
  var nBefore = O._n;
  O._save();
  var saved = O.db.export();
  var SQL = await window.initSqlJs();
  var O2 = Object.create(O);                                   // same methods, fresh instance state
  O2.db = new SQL.Database(saved); O2._n = 0; O2._cursor = 0; O2._opsCache = null;
  try { const r2 = O2.db.exec("SELECT gid FROM kernel_ops WHERE gid LIKE 'geom-grp-%' OR gid LIKE 'gesture-grp-%'"); if (r2.length) O2._n = r2[0].values.reduce((m, w) => Math.max(m, parseInt(String(w[0]).replace(/^(geom|gesture)-grp-/, '')) || 0), 0); } catch (e) { }
  chk('U7 counter restore spans gesture gids', O2._n === nBefore, '_n=' + O2._n + ' (want ' + nBefore + ')');

  console.log('W-GESTURE-UNDO ' + (fail ? 'FAIL' : 'PASS') + '  pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
