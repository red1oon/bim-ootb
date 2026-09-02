// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS MAKER-CHECKER CO-SIGN (teams/ROADMAP.md §S10·C, Phase F — standalone, zero impact).
//   Segregation-of-duties / four-eyes for almost free, BECAUSE we keep one signed op-log (IDEAS.md §C):
//   a high-value action needs TWO signed ops on one doc — a maker SUBMIT and an eligible checker APPROVE.
//   The second signature carries OFFICE LEGALITY (a confirmed-memo text → saves paperwork) and flips
//   docStatus → Approved; non-repudiation comes from the op signatures (real PKI optional later, §C).
//
//   The fold ENFORCES (NON-INVENT — never flips on a guess):
//     · four-eyes      — checker.author ≠ maker.author (self-approval REFUSED, stays pending).
//     · eligible-role  — checker must hold an eligible role (opts.eligible(author,role) → bool).
//     · group match    — the APPROVE binds the SUBMIT via params.group (or same doc, latest SUBMIT).
//     · tamper-evident — the whole log chain must verify (else status 'tampered').
//   Low-value actions below the threshold POST single-signed (requireCoSign decides).
//
//   PURE + deterministic (no Date.now / Math.random — ids/ts are INPUTS). cls 'erp' ops, matching the
//   Dashboard optics vocab (SET_STATUS/POST/SUBMIT/APPROVE). Depends only on the connector seam (sign/
//   verifyChain). Witness: teams/tests/poc_teams_s10.js (W-COSIGN).
'use strict';
(function () {                                       // IIFE — keep `_op`/`_append`/`_order` OUT of global scope
var C = (typeof require !== 'undefined') ? require('../connectors') : self.TeamsConnectors;

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
// every co-sign action is a signed erp op chained off the log tip (tamper-evident, like any op).
function _append(log, op) {
  var tip = log.length ? log[log.length - 1].op_hash : 'GENESIS';
  C.sign(op, tip);                                  // sets prev_hash/op_hash/sig
  return log.concat([op]);
}
function _op(id, ts, author, role, verb, doc, params) {
  return { id: id, ts: ts, branch: null, author: author, role: role, cls: 'erp',
           verb: verb, target: doc, params: params || {} };
}

// requireCoSign(amount, threshold) — the policy: a value at/above the threshold needs four-eyes.
function requireCoSign(amount, threshold) {
  return (threshold != null) && (Number(amount) || 0) >= threshold;
}

// submit(log, args) — the MAKER proposes a high-value action. args:
//   { id, ts, author, role, doc, amount?, group?, legal?, fields? }. group defaults to the doc id.
//   Returns { ok, log, op, group }.
function submit(log, args) {
  var group = args.group != null ? args.group : args.doc;
  var op = _op(args.id, args.ts, args.author, args.role, 'SUBMIT', args.doc,
    { group: group, amount: args.amount, legal: args.legal != null ? args.legal : '',
      to: 'Submitted', fields: args.fields });
  if (args.attrib) op.params.attrib = args.attrib;   // T1: {emp, dev} PIN attribution — signed with the op
  return { ok: true, log: _append(log, op), op: op, group: group };
}

// approve(log, args) — the CHECKER co-signs. args:
//   { id, ts, author, role, doc, group?, legal? }. Returns { ok, log, op }. The fold (coSignState)
//   decides legality — approve() only records the second signed op (NON-INVENT: it never asserts validity).
function approve(log, args) {
  var op = _op(args.id, args.ts, args.author, args.role, 'APPROVE', args.doc,
    { group: args.group != null ? args.group : args.doc, legal: args.legal != null ? args.legal : '',
      to: 'Approved' });
  if (args.attrib) op.params.attrib = args.attrib;   // T1: {emp, dev} PIN attribution — signed with the op
  return { ok: true, log: _append(log, op), op: op };
}

// post(log, args) — a SINGLE-signed action (low-value path, below threshold). Returns { ok, log, op }.
function post(log, args) {
  var op = _op(args.id, args.ts, args.author, args.role, 'POST', args.doc,
    { amount: args.amount, to: 'Posted' });
  return { ok: true, log: _append(log, op), op: op };
}

// coSignState(ops, doc, opts) — fold the log → the co-sign verdict for `doc` (NON-INVENT).
//   opts = { eligible: fn(author, role) -> bool (default: any), threshold?, amount-from-op }.
//   Returns { doc, status, maker, checker, legal, approvedAt, amount, reason }:
//     status 'Approved'  — valid four-eyes: maker SUBMIT + eligible checker APPROVE (≠ maker), chain ok.
//     status 'Submitted' — pending (no APPROVE yet, self-approval, or ineligible checker) + a reason.
//     status 'tampered'  — the log chain failed verification.
function coSignState(ops, doc, opts) {
  opts = opts || {};
  var eligible = opts.eligible || function () { return true; };
  if (!C.verifyChain(ops).ok) return { doc: doc, status: 'tampered', reason: 'chain verify failed' };

  var ordered = _order(ops);
  var maker = null, approvals = [];
  ordered.forEach(function (op) {
    if (op.cls !== 'erp' || op.target !== doc) return;
    if (op.verb === 'SUBMIT') maker = op;                       // last SUBMIT wins (re-submit supersedes)
    else if (op.verb === 'APPROVE') approvals.push(op);
  });
  if (!maker) return { doc: doc, status: 'Submitted', reason: 'no maker submission' };

  var group = (maker.params || {}).group;
  var amount = (maker.params || {}).amount;
  var legal = (maker.params || {}).legal || '';
  var base = { doc: doc, maker: maker.author, group: group, amount: amount };

  // the binding checker: an APPROVE on the same group, after the maker, by a DIFFERENT eligible author.
  // T1 (W-T1-ATTRIB, FABLE5_WRAPUP §3): attribution-aware four-eyes. When BOTH ops carry recorded PIN
  // attribution (params.attrib = {emp, dev} — audit metadata, signed with the op), enforce at EMPLOYEE
  // and DEVICE grain: same emp = self-approval even across devices/typed names; same dev = one keyboard
  // typed both identities (the "two typed names" bypass the audit flagged). opts.attribRequired makes an
  // UNATTRIBUTED op ineligible entirely (PIN-at-action-time policy). Absent attribution + no flag →
  // behaviour identical to before (back-compat, W-COSIGN unchanged). NON-INVENT: never flips on a guess.
  var mA = (maker.params || {}).attrib || null;
  var checker = null, sawSelf = false, sawIneligible = false, sawSameDevice = false, sawUnattributed = false;
  approvals.forEach(function (op) {
    if (checker) return;
    if ((op.params || {}).group !== group) return;             // must bind THIS submission
    if (op.ts < maker.ts) return;                              // an approval can't precede its submission
    var cA = (op.params || {}).attrib || null;
    if (opts.attribRequired && (!mA || !cA)) { sawUnattributed = true; return; }   // PIN identity mandatory
    if (mA && cA && cA.emp === mA.emp) { sawSelf = true; return; }        // same employee (PIN) — four-eyes breach
    if (mA && cA && cA.dev === mA.dev) { sawSameDevice = true; return; }  // same device typed both identities
    if (op.author === maker.author) { sawSelf = true; return; }            // four-eyes breach (name grain)
    if (!eligible(op.author, op.role)) { sawIneligible = true; return; }    // not an eligible checker
    checker = op;
  });

  if (checker)
    return Object.assign(base, { status: 'Approved', checker: checker.author, role: checker.role,
      legal: (checker.params || {}).legal || legal, approvedAt: checker.ts,
      reason: 'co-signed: ' + maker.author + ' → ' + checker.author });
  return Object.assign(base, { status: 'Submitted',
    reason: sawSelf ? 'REFUSE: self-approval (four-eyes)'
      : sawSameDevice ? 'REFUSE: same device (four-eyes needs two devices)'
      : sawUnattributed ? 'REFUSE: checker/maker unattributed (PIN identity required)'
      : sawIneligible ? 'REFUSE: checker not eligible'
      : 'awaiting checker' });
}

var X = { requireCoSign: requireCoSign, submit: submit, approve: approve, post: post, coSignState: coSignState };
if (typeof module === 'object' && module.exports) module.exports = X;
else (typeof self !== 'undefined' ? self : this).TeamsCoSign = X;
})();
