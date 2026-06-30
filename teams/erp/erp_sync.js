// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS ERP SYNC (teams/ROADMAP.md §S8, Phase E — the ERP edge transport, zero erp/ edits).
//   Points the EXISTING teams/transport.js (makeHttpFacilitator over GitHub/OCI) at a real ERP kernel_ops
//   log: one branch per role/branch_id, masters shared content-addressed (CAS). The transport already
//   store-and-forwards SIGNED ops + rejects tamper/rewrite — it just needs the ERP chain VERIFIER (the
//   kernel_ops canonical), which §S8 made injectable. ERP_CONTEXT §6 (DistributedERP "dumb post office").
//
//   This file imports NOTHING from erp/ (host = {KernelOps, ERPKernel} is INJECTED, like erp_bridge.js).
//   It reuses connectors' standard SHA-256 VERBATIM so an array verified here is byte-identical to the
//   kernel's own sealChain/verifyChain (same algorithm, same canonical, same '|' separators).
//   Witness: teams/tests/poc_teams_erp_sync.js (W-ERP-SYNC).
'use strict';
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;
var Transport = (typeof require !== 'undefined') ? require('../transport') : self.TeamsTransport;

var GENESIS = '0'.repeat(64);
var sha256 = C._util.sha256;   // the SAME standard SHA-256 the kernel uses (cross-env deterministic)

// the kernel_ops canonical (kernel_ops.js _canonical) — every mutating field, fixed order, '|'-joined.
function _canonical(op) {
  return op.id + '|' + op.timestamp + '|' + op.op_type + '|' +
         (op.parameters || '') + '|' + (op.input_guids || '') + '|' + (op.output_guid || '');
}

// erpVerifyChain(ops) — recompute the kernel_ops hash chain over an ARRAY (the transport's unit) and
// check each prev_hash link + op_hash. Returns {ok,len,tip} or {ok:false, at, why} (the shape the
// facilitator's pushOps/pullOps expect). Chain-only tamper-evidence (W-CHAIN); a present sig is
// authenticity (W-SIGN) layered on top, not required for the chain to verify across devices.
function erpVerifyChain(ops) {
  ops = ops || [];
  var prev = GENESIS;
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    if (o.op_hash == null) return { ok: false, at: i, why: 'unsealed' };
    if (o.prev_hash !== prev) return { ok: false, at: i, why: 'prev_hash link' };
    if (sha256(prev + '|' + _canonical(o)) !== o.op_hash) return { ok: false, at: i, why: 'payload altered' };
    prev = o.op_hash;
  }
  return { ok: true, len: ops.length, tip: prev };
}

// exportBranch(db, opts) — the role's WHOLE sealed kernel_ops log as a signed op array (a chain from
// GENESIS, the transport's branch unit). opts.branchId: '*'/null → all rows; a value → that branch_id
// only (a speculative blue branch). Rows are the raw stored columns so _canonical re-hashes identically.
function exportBranch(db, opts) {
  opts = opts || {};
  var where = '';
  if (opts.branchId != null && opts.branchId !== '*') where = ' WHERE branch_id = ' + JSON.stringify(String(opts.branchId));
  var r = db.exec('SELECT id,op_uuid,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig,gid,branch_id FROM kernel_ops' + where + ' ORDER BY id');
  if (!r.length) return [];
  var cols = r[0].columns;
  return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}

// importBranch(ops, host, makeDb) — a remote peer materialises a pulled branch: rebuild its kernel_ops
// rows verbatim, then erp_kernel.replay → projectionHash. The replay re-applies the stored rich payloads
// (frozen effects) so the rebuilt World is byte-identical to the origin's. Returns {projectionHash, ops}.
function importBranch(ops, host, makeDb) {
  host = host || (typeof window !== 'undefined' ? window : {});
  var KernelOps = host.KernelOps, ERPKernel = host.ERPKernel;
  if (!ERPKernel) throw new Error('erp_sync: host.ERPKernel required for importBranch');
  var logDb = makeDb();
  if (KernelOps && KernelOps.ensureTable) KernelOps.ensureTable(logDb);
  else logDb.run('CREATE TABLE IF NOT EXISTS kernel_ops (id INTEGER PRIMARY KEY, op_uuid TEXT, timestamp INTEGER, op_type TEXT, parameters TEXT, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0, prev_hash TEXT, op_hash TEXT, sig TEXT, gid TEXT, branch_id TEXT)');
  (ops || []).forEach(function (o) {
    logDb.run('INSERT INTO kernel_ops (id,op_uuid,timestamp,op_type,parameters,input_guids,output_guid,prev_hash,op_hash,sig,gid,branch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [o.id, o.op_uuid, o.timestamp, o.op_type, o.parameters, o.input_guids, o.output_guid, o.prev_hash, o.op_hash, o.sig, o.gid, o.branch_id]);
  });
  var projDb = makeDb();
  var rep = ERPKernel.replay(logDb, projDb);
  return { projectionHash: rep.hash, ops: rep.ops, projDb: projDb };
}

// makeErpTransport(opts) — the SAME makeHttpFacilitator, pre-wired with the ERP chain verifier. Every
// existing teams caller is unchanged; an ERP caller gets a transport that store-and-forwards a real
// kernel_ops branch. CAS (putBlob/getBlob) carries the shared masters (BPartner/Product/acctschema).
function makeErpTransport(opts) {
  opts = opts || {};
  var merged = {}; Object.keys(opts).forEach(function (k) { merged[k] = opts[k]; });
  merged.verifyChain = opts.verifyChain || erpVerifyChain;
  return Transport.makeHttpFacilitator(merged);
}

var S = { erpVerifyChain: erpVerifyChain, exportBranch: exportBranch, importBranch: importBranch, makeErpTransport: makeErpTransport };
if (typeof module === 'object' && module.exports) module.exports = S;
else (typeof self !== 'undefined' ? self : this).TeamsErpSync = S;
