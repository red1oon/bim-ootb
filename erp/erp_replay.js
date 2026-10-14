// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
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

  var LEASES = 'CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, resource TEXT, from_ts TEXT, to_ts TEXT, order_uuid TEXT, state TEXT, granted INTEGER, ttl INTEGER)';
  function initProjection(db) { db.run(PROJ); db.run(LEASES); }

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
             actor: p.actor, target: p.target, doc_type: p.doc_type, owner: p.owner, amount: p.amount, to: p.to, status: p.status,
             resource: p.resource, from: p.from, order: p.order, ttl: p.ttl };
  }

  // replayGuarded — fold the ordered ERP ops into `documents` under the guards. Mirrors
  // poc_distributed.replay(). Returns { applied, rejected:[{op,why}] }.
  //   CREATE   — INSERT OR IGNORE (idempotent; first writer of a uuid sets its owner)
  //   ALLOCATE — owner-gate (G-SINGLE-WRITER): only actor === documents.owner may allocate
  //   SET_STATUS / HANDOFF — the same owner-gate; HANDOFF transfers ownership (G-ORDERED-HANDOFF, W-MFG-OWN)
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
      } else if (op.op_type === 'ALLOCATE' || op.op_type === 'SET_STATUS' || op.op_type === 'HANDOFF') {
        // ONE owner-gate for every owner-only mutation (G-SINGLE-WRITER). HANDOFF = G-ORDERED-HANDOFF: ownership moves only by this op,
        // applied in the merged total order, so there is never a window with two owners.
        var o = db.exec('SELECT owner,status FROM documents WHERE uuid=?', [op.target]);
        var row = o.length && o[0].values.length ? o[0].values[0] : null;
        if (!row) { rejected.push({ op: op, why: 'no such doc' }); return; }
        if (row[0] !== op.actor) { rejected.push({ op: op, why: 'non-owner (' + op.actor + '≠' + row[0] + ')' }); return; }
        if (op.op_type === 'HANDOFF') {
          if (!op.to) { rejected.push({ op: op, why: 'handoff without target' }); return; }
          db.run('UPDATE documents SET owner=? WHERE uuid=?', [op.to, op.target]);
        } else if (op.op_type === 'SET_STATUS') {
          db.run('UPDATE documents SET status=? WHERE uuid=?', [op.status, op.target]);
        } else {
          db.run("UPDATE documents SET status='allocated' WHERE uuid=?", [op.target]);
        }
        applied++;
      } else if (op.op_type === 'LEASE' || op.op_type === 'USE' || op.op_type === 'EXPIRE') {
        // G-RESERVATION + G-LEASE-EXPIRY (W-MFG-LEASE): exclusive, time-boxed claims on a pooled resource window. Expiry is an ORDERED op - replay reads no clock.
        var why = null;
        if (op.op_type === 'LEASE') {
          var od = db.exec('SELECT owner FROM documents WHERE uuid=?', [op.order]);
          if (!od.length || !od[0].values.length) why = 'no such order';
          else if (od[0].values[0][0] !== op.actor) why = 'non-owner (' + op.actor + '≠' + od[0].values[0][0] + ')';
          else if (!(op.from && op.to && String(op.from) < String(op.to))) why = 'bad window';
          else { var cf = API.leaseConflict(db, op); if (cf) why = 'slot held by ' + cf.order_uuid; }
          if (why) { rejected.push({ op: op, why: why }); return; }
          db.run("INSERT INTO leases (id,resource,from_ts,to_ts,order_uuid,state,granted,ttl) VALUES (?,?,?,?,?,'held',?,?)", [op.target, op.resource, op.from, op.to, op.order, op.timestamp, op.ttl == null ? 0 : op.ttl]);
        } else {
          var lr = db.exec('SELECT order_uuid,state,granted,ttl FROM leases WHERE id=?', [op.target]), L = lr.length && lr[0].values.length ? lr[0].values[0] : null;
          if (!L) { rejected.push({ op: op, why: 'no such lease' }); return; }
          if (op.op_type === 'USE') {
            var ow = db.exec('SELECT owner FROM documents WHERE uuid=?', [L[0]]), cur = ow.length && ow[0].values.length ? ow[0].values[0][0] : null;
            if (L[1] === 'expired') why = 'lease expired'; else if (L[1] === 'used') why = 'already used'; else if (cur !== op.actor) why = 'non-owner (' + op.actor + '≠' + cur + ')';
            if (why) { rejected.push({ op: op, why: why }); return; }
            db.run("UPDATE leases SET state='used' WHERE id=?", [op.target]);
          } else {
            if (L[1] === 'used') why = 'in use'; else if (L[1] === 'expired') why = 'already expired'; else if (!(op.timestamp >= L[2] + L[3])) why = 'not yet expired';
            if (why) { rejected.push({ op: op, why: why }); return; }
            db.run("UPDATE leases SET state='expired' WHERE id=?", [op.target]);
          }
        }
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

  // leaseConflict — a LIVE (held|used) lease on the same resource whose window overlaps [from,to) (half-open: back-to-back windows do not conflict). null = free.
  function leaseConflict(db, op) {
    var r = db.exec("SELECT order_uuid,id FROM leases WHERE resource=? AND state IN ('held','used') AND from_ts < ? AND ? < to_ts ORDER BY id LIMIT 1", [op.resource, op.to, op.from]);
    return r.length && r[0].values.length ? { order_uuid: r[0].values[0][0], id: r[0].values[0][1] } : null;
  }
  function leaseRows(db) { var r = db.exec('SELECT id,resource,from_ts,to_ts,order_uuid,state,granted,ttl FROM leases ORDER BY id'); return r.length ? r[0].values : []; }

  // projectionRows — the sorted projection, for a holder-irrelevant equality hash (caller hashes).
  function projectionRows(db) {
    var r = db.exec('SELECT uuid,doc_type,owner,status,claimed_by,amount FROM documents ORDER BY uuid');
    return r.length ? r[0].values : [];
  }

  var API = { leaseConflict: leaseConflict, leaseRows: leaseRows, initProjection: initProjection, mergeLogs: mergeLogs, normalize: normalize,
              replayGuarded: replayGuarded, projectionRows: projectionRows };
  if (typeof window !== 'undefined') window.ErpReplay = API;   // browser-pure (window-only, like kernel_ops.js — no `module` global, keeps the no-undef CI gate green)
  console.log('§OWNER_LOADED erp_replay.js (owner-gate + CAS guarded replay)');
})();
