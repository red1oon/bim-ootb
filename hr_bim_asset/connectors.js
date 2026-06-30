// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR CONNECTOR SEAM (prompts/RESUME_HR_PAYROLL_KERNEL.md §STANDALONE/§OPS).
//   THIS FILE IS THE ONLY COUPLING POINT to ERP/kernel. Everything else in hr/ is self-contained
//   and depends ONLY on this interface. HR boots & runs a full pay cycle with these STUBS and ZERO
//   ERP/ad_full/other-suite loaded. To go live, REPLACE each stub body with the real binding — the
//   engine + witnesses never change. Read the log after every run.
//
//   STUB → REAL mapping (separation of concern; dotted lines only — §STANDALONE):
//     sign / verifyChain  →  erp/erp_kernel.js  sealChain/verifyChain (signed hash-chain)
//     persist             →  sql.js 5-table  (documents/document_lines/items/journal) — NEXT slice
//     glPost              →  erp/doc_poster.js  journal  (GL dotted line; only when ERP present)
//     resolveEmployee     →  C_BPartner WHERE isEmployee='Y'  (identity dotted line)
//     resolveGuid         →  viewer APP.guidMap  (unit_guid→mesh; MeshPort real impl = reverse lookup)
//     injectData          →  bim_orders_overlay band-overlay (HBA high-PK band → live ad_seed.db at boot)
'use strict';
var crypto = (typeof require !== 'undefined') ? require('crypto') : null;

function sha256(s) {
  if (crypto) return crypto.createHash('sha256').update(String(s)).digest('hex');
  var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8);
}
// stable, RECURSIVELY key-sorted serialization (don't use JSON.stringify's array arg — it acts as a
// nested allowlist and silently drops params.* → tamper-blind hashes). Mirrors redpill/connectors.
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) {
    return JSON.stringify(k) + ':' + stableStringify(v[k]);
  }).join(',') + '}';
}
// canonical serialization of the signable op body (hash/sig fields excluded)
function canonical(op) {
  return stableStringify({ id: op.id, ts: op.ts, period: op.period, actor: op.actor,
    cls: op.cls, verb: op.verb, target: op.target, params: op.params });
}

var Connectors = {
  _isStub: true,

  // ---- STUB: sign + hash-chain (REAL: erp_kernel.js sealChain) ---------------
  // chains op_hash = H(prev_hash + body); sig = H(actor + op_hash) as a stand-in signature.
  sign: function (op, prevHash) {
    var body = canonical(op);
    op.prev_hash = prevHash || 'GENESIS';
    op.op_hash = sha256(op.prev_hash + body);
    op.sig = sha256(op.actor + ':' + op.op_hash);
    return op;
  },
  // recompute the chain — any amended op/param breaks op_hash; any forged actor breaks sig.
  verifyChain: function (ops) {
    var prev = 'GENESIS';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], h = sha256(prev + canonical(o));
      if (o.op_hash !== h) return { ok: false, at: i, why: 'op_hash' };
      if (o.sig !== sha256(o.actor + ':' + o.op_hash)) return { ok: false, at: i, why: 'sig' };
      prev = o.op_hash;
    }
    return { ok: true };
  },

  // ---- STUB: persistence (REAL: sql.js 5-table — NEXT slice) -----------------
  // In-mem op-log + projection. The shape mirrors the ERP 5-table bridge:
  //   PAYRUN  → documents      · PAYSLIP → document_lines · employee/element → items
  //   GL post → journal.
  _log: [],
  persist: function (op) { this._log.push(op); return op; },
  log: function () { return this._log.slice(); },
  reset: function () { this._log = []; return this; },

  // ---- STUB: GL post (REAL: erp/doc_poster.js — only when ERP present) -------
  // Dotted line. Returns balanced journal lines; does NOT touch any ERP table in stub mode.
  glPost: function (journalLines) {
    var dr = 0, cr = 0;
    journalLines.forEach(function (l) { dr += (l.dr || 0); cr += (l.cr || 0); });
    return { posted: this._isStub ? 'STUB' : 'ERP', lines: journalLines,
             balanced: Math.abs(dr - cr) < 1e-9, dr: dr, cr: cr };
  },

  // ---- STUB: identity (REAL: C_BPartner WHERE isEmployee='Y') ----------------
  resolveEmployee: function (empId, roster) { return (roster || {})[empId] || null; },

  _util: { sha256: sha256, canonical: canonical, stableStringify: stableStringify }
};

if (typeof module === 'object' && module.exports) module.exports = Connectors;
else (typeof self !== 'undefined' ? self : this).HrConnectors = Connectors;
