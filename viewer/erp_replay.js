// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_replay.js — W-OWNER + CAS (A3): the GUARDED replay path for the ERP `documents` projection.
// Spec: scripts/poc_distributed.js (G-SINGLE-WRITER owner-gate + set-if-unset CAS) + ERP.md §9-C/D/E,
// §4 (the guard set). This lives in the ERP layer — NOT in the BIM-shared kernel_ops.js — because
// owner/status/claimed_by are ERP-projection concerns (separation of concern). It READS the kernel
// op-log (kernel_ops, via KernelOps.replayOps) and folds it into the projection under the guards.
//
// Determinism (§7) / identity (§0.21, A1): actor, owner, op_uuid and timestamp are recorded INPUTS.
// The merge orders by (timestamp, op_uuid) — op_uuid makes the cross-device union clash-free; the
// owner-gate READS the recorded owner/actor, it never recomputes identity.
(function () {
  'use strict';
  var PROJ =
    'CREATE TABLE IF NOT EXISTS documents (' +
    ' uuid TEXT PRIMARY KEY, doc_type TEXT, owner TEXT, status TEXT, claimed_by TEXT, amount REAL)';

  function initProjection(db) { db.run(PROJ); }

  // mergeLogs(logA, logB, …) — union device op-logs into ONE deterministic total order: (timestamp,
  // op_uuid). op_uuid (A1) makes the union clash-free; both keys are recorded inputs → holder-irrelevant.
  function mergeLogs() {
    var all = [];
    for (var i = 0; i < arguments.length; i++) all = all.concat(arguments[i]);
    return all.slice().sort(function (a, b) {
      return a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1
           : (a.op_uuid < b.op_uuid ? -1 : a.op_uuid > b.op_uuid ? 1 : 0);
    });
  }

  // normalize — flatten a kernel_ops row {op_uuid,timestamp,op_type,parameters} (parameters may be a
  // JSON string OR an already-parsed object, as KernelOps.replayOps returns) into a flat ERP op.
  function normalize(row) {
    var p = (typeof row.parameters === 'string') ? JSON.parse(row.parameters) : (row.parameters || {});
    return { op_uuid: row.op_uuid, timestamp: row.timestamp, op_type: row.op_type,
             actor: p.actor, target: p.target, doc_type: p.doc_type, owner: p.owner, amount: p.amount };
  }

  // replayGuarded — fold the ordered ERP ops into `documents` under the guards. Mirrors
  // poc_distributed.replay(). Returns { applied, rejected:[{op,why}] }.
  //   CREATE   — INSERT OR IGNORE (idempotent; first writer of a uuid sets its owner)
  //   ALLOCATE — owner-gate (G-SINGLE-WRITER): only actor === documents.owner may allocate
  //   CLAIM    — CAS set-if-unset: first claim in total order wins; later claims rejected (no value lost)
  //   (any non-ERP op types — BIM/AD ops sharing the log — are simply not projected here)
  function replayGuarded(db, orderedOps) {
    initProjection(db);
    var applied = 0, rejected = [];
    orderedOps.forEach(function (op) {
      if (op.op_type === 'CREATE') {
        db.run('INSERT OR IGNORE INTO documents (uuid,doc_type,owner,status,amount) VALUES (?,?,?,?,?)',
               [op.target, op.doc_type, op.owner, 'drafted', op.amount || 0]);
        applied++;
      } else if (op.op_type === 'ALLOCATE') {
        var o = db.exec('SELECT owner,status FROM documents WHERE uuid=?', [op.target]);
        var row = o.length && o[0].values.length ? o[0].values[0] : null;
        if (!row) { rejected.push({ op: op, why: 'no such doc' }); return; }
        if (row[0] !== op.actor) { rejected.push({ op: op, why: 'non-owner (' + op.actor + '≠' + row[0] + ')' }); return; }
        db.run("UPDATE documents SET status='allocated' WHERE uuid=?", [op.target]);
        applied++;
      } else if (op.op_type === 'CLAIM') {
        var c = db.exec('SELECT claimed_by FROM documents WHERE uuid=?', [op.target]);
        var cur = c.length && c[0].values.length ? c[0].values[0][0] : null;
        if (cur) { rejected.push({ op: op, why: 'already claimed by ' + cur }); return; }
        db.run('UPDATE documents SET claimed_by=? WHERE uuid=?', [op.actor, op.target]);
        applied++;
      }
    });
    console.log('§OWNER replay applied=' + applied + ' rejected=' + rejected.length +
                (rejected.length ? ' [' + rejected.map(function (r) { return r.op.op_type + ':' + r.why; }).join('; ') + ']' : ''));
    return { applied: applied, rejected: rejected };
  }

  // projectionRows — the sorted projection, for a holder-irrelevant equality hash (caller hashes).
  function projectionRows(db) {
    var r = db.exec('SELECT uuid,doc_type,owner,status,claimed_by,amount FROM documents ORDER BY uuid');
    return r.length ? r[0].values : [];
  }

  var API = { initProjection: initProjection, mergeLogs: mergeLogs, normalize: normalize,
              replayGuarded: replayGuarded, projectionRows: projectionRows };
  if (typeof window !== 'undefined') window.ErpReplay = API;   // browser-pure (window-only, like kernel_ops.js — no `module` global, keeps the no-undef CI gate green)
  console.log('§OWNER_LOADED erp_replay.js (owner-gate + CAS guarded replay)');
})();
