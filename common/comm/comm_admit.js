// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_admit.js — admission at fold time: may THIS op, from THIS device, change THIS record?
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.6 + §12.7 (CL4) — Witness: W-ADMIT-FOLD.
 * Runs on every device, for every business op, against the folded roster (comm_roster.js). Fail-closed: anything it
 * cannot establish (role, table, record scope) is REFUSED, never assumed. An op from a device the roster doesn't know
 * yet is PARKED (its ENROLL may still arrive). The access rule itself is the AD layer's MRole.canUpdate port
 * (erp/ad_access.js RoleContext.canUpdate), reached through ctx.access — no rule lives here.
 *   ctx = { sigOk: bool, access(roleId, client, org, table) → {allowed, reason}, scope: {client, org} | null, base?: 'b:<sha12>' | null, baseMissing?: bool }
 *   §13.12.J.3: admitEscrow/escrowSpec/deskOwner — the device-level admission and the structural check of the three escrow ops (the semantic rules live in comm_store.js escrowPass).
 *   §13.12.I.1: base = the stamp every op of a space-with-a-base must carry in `manifest` (else base-skew); baseMissing = the host's base-row lookup answered "no such row".
 */
(function (global) {
  'use strict';
  function admit(env, roster, ctx) {
    var d = roster.devices[env.author];
    if (!d) return { verdict: 'PARKED', reason: 'unknown-device' };
    if (!ctx.sigOk) return { verdict: 'REFUSED', reason: 'signature' };
    if (ctx.base && env.manifest !== ctx.base) return { verdict: 'REFUSED', reason: 'base-skew' };      // §13.12.I.1: the op was authored on another base (only spaces WITH a base set ctx.base)
    var cut = roster.revokes[env.author];
    if (cut != null && env.seq > cut) return { verdict: 'REFUSED', reason: 'revoked' };
    var role = roster.roleAt(env.author, env.seq);
    if (role.ad_role_id == null) return { verdict: 'REFUSED', reason: 'no-role' };
    if (!ctx.scope) return { verdict: 'REFUSED', reason: ctx.baseMissing ? 'base-row-missing' : 'scope-unknown' };
    var a = ctx.access(role.ad_role_id, ctx.scope.client, ctx.scope.org, env.target.table);
    if (!a || !a.allowed) return { verdict: 'REFUSED', reason: 'access:' + (a ? a.reason : 'none') };
    return { verdict: 'MERGED', reason: 'role ' + role.ad_role_id + ' ' + a.reason };
  }

  // ── claims (§13.12.2 KEYCLAIM, §13.12.F.1 BOOKING): device-level admission — a claim writes no table, so no AD access check ──
  var HEX64 = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function pint(x, lo) { return Number.isInteger(x) && x >= lo; }
  // → { key, until, takes, payload } | { problem }.  BOOKING claims the key BOOKING:<seq>:<n> (one number) or BLOCK:<seq>:<j> (a block of numbers).
  function claimSpec(env) {
    var t = env.body.op_type, p = env.body.params || {};
    if (t === 'KEYCLAIM') {
      if (typeof p.key !== 'string' || !p.key.length || p.key.length > 200) return { problem: 'key' };
      if (p.until !== undefined && !pint(p.until, 1)) return { problem: 'until' };
      if (p.takes !== undefined && !HEX64.test(String(p.takes))) return { problem: 'takes' };
      return { key: p.key, until: p.until === undefined ? null : p.until, takes: p.takes || null, payload: null };
    }
    if (t === 'BOOKING') {
      if (!UUID.test(String(p.seq || ''))) return { problem: 'seq' };
      if (p.block !== undefined) { if (!pint(p.block, 0) || !pint(p.from, 1) || !pint(p.to, p.from)) return { problem: 'block' };
        return { key: 'BLOCK:' + p.seq + ':' + p.block, until: null, takes: null, payload: { seq: p.seq, block: p.block, from: p.from, to: p.to } }; }
      if (!pint(p.n, 1) || !UUID.test(String(p.doc || ''))) return { problem: 'n' };
      return { key: 'BOOKING:' + p.seq + ':' + p.n, until: null, takes: null, payload: { seq: p.seq, n: p.n, doc: String(p.doc).toLowerCase() } };
    }
    return { problem: 'op_type' };
  }
  function admitClaim(env, roster, ctx) {
    var d = roster.devices[env.author];
    if (!d) return { verdict: 'PARKED', reason: 'unknown-device' };
    if (!ctx.sigOk) return { verdict: 'REFUSED', reason: 'signature' };
    var cut = roster.revokes[env.author];
    if (cut != null && env.seq > cut) return { verdict: 'REFUSED', reason: 'revoked' };
    if (roster.roleAt(env.author, env.seq).ad_role_id == null) return { verdict: 'REFUSED', reason: 'no-role' };
    var sp = claimSpec(env); if (sp.problem) return { verdict: 'REFUSED', reason: 'bad-claim:' + sp.problem };
    return { verdict: 'MERGED', reason: 'claim' };
  }
  // ── escrow (§13.12.J.3): ESCROW_OPEN / ESCROW_USE / ESCROW_TRANSFER — the claim family: device-level admission, no table access check ──
  var DESKRE = /^[A-Za-z0-9_.:@\/-]{1,64}$/, QMAX = 1e12;
  var DESK = { test: function (x) { return DESKRE.test(x) && x !== '__proto__'; } };
  // → { kind:'open', resource, slices } | { kind:'use', resource, desk, qty, doc } | { kind:'transfer', resource, from, to, qty } | { problem }
  function escrowSpec(env) {
    var t = env.body.op_type, p = env.body.params || {};
    if (typeof p.resource !== 'string' || !p.resource.length || p.resource.length > 200) return { problem: 'resource' };
    if (t === 'ESCROW_OPEN') {
      if (!p.slices || typeof p.slices !== 'object' || Array.isArray(p.slices)) return { problem: 'slices' };
      var ks = Object.keys(p.slices); if (!ks.length) return { problem: 'slices' };
      for (var i = 0; i < ks.length; i++) if (!DESK.test(ks[i]) || !pint(p.slices[ks[i]], 0) || p.slices[ks[i]] > QMAX) return { problem: 'slices' };
      return { kind: 'open', resource: p.resource, slices: p.slices };
    }
    if (t === 'ESCROW_USE') {
      if (typeof p.desk !== 'string' || !DESK.test(p.desk)) return { problem: 'desk' };
      if (!pint(p.qty, 1) || p.qty > QMAX) return { problem: 'qty' };
      if (typeof p.doc !== 'string' || !p.doc.length || p.doc.length > 200) return { problem: 'doc' };
      return { kind: 'use', resource: p.resource, desk: p.desk, qty: p.qty, doc: p.doc };
    }
    if (t === 'ESCROW_TRANSFER') {
      if (typeof p.from !== 'string' || !DESK.test(p.from)) return { problem: 'from' };
      if (typeof p.to !== 'string' || !DESK.test(p.to) || p.to === p.from) return { problem: 'to' };
      if (!pint(p.qty, 1) || p.qty > QMAX) return { problem: 'qty' };
      return { kind: 'transfer', resource: p.resource, from: p.from, to: p.to, qty: p.qty };
    }
    return { problem: 'op_type' };
  }
  function admitEscrow(env, roster, ctx) {
    var d = roster.devices[env.author];
    if (!d) return { verdict: 'PARKED', reason: 'unknown-device' };
    if (!ctx.sigOk) return { verdict: 'REFUSED', reason: 'signature' };
    var cut = roster.revokes[env.author];
    if (cut != null && env.seq > cut) return { verdict: 'REFUSED', reason: 'revoked' };
    if (roster.roleAt(env.author, env.seq).ad_role_id == null) return { verdict: 'REFUSED', reason: 'no-role' };
    var sp = escrowSpec(env); if (sp.problem) return { verdict: 'REFUSED', reason: 'bad-escrow:' + sp.problem };
    return { verdict: 'MERGED', reason: 'escrow' };
  }
  // does the device `kid` serve `desk`? the policy's desks map names a kid or a person uuid (§13.12.J.3 rule 4)
  function deskOwner(roster, kid, desk) {
    var m = roster.policy && roster.policy.params.desks, o = m && Object.prototype.hasOwnProperty.call(m, desk) ? m[desk] : null, d = roster.devices[kid];
    return !!o && !!d && (o === kid || o.toLowerCase() === String(d.person).toLowerCase());
  }
  // ── document numbers (§13.12.F.1): cfg = an AD_Sequence-like object { uu, tables, mode, prefix, suffix, pad, start_no, increment_no, block_size, station(kid) }
  function stationCode(cfg, kid) { return typeof cfg.station === 'function' ? cfg.station(kid) : String(kid).slice(0, 4); }
  function formatDocNo(cfg, n, kid) {
    var d = String(n); if (cfg.pad) while (d.length < cfg.pad) d = '0' + d;
    return (cfg.prefix || '') + (cfg.mode === 'S' ? stationCode(cfg, kid) : '') + d + (cfg.suffix || '');
  }
  // the DocumentNo an op sets (CREATE fields / UPDATE changes), or null
  function docNoOf(env) {
    var p = env.body.params || {}, v = null;
    if (env.body.op_type === 'CRUD_CREATE') v = (p.fields || {}).documentno;
    else if (env.body.op_type === 'CRUD_UPDATE') { var c = (p.changes || {}).documentno; v = c && Object.prototype.hasOwnProperty.call(c, 'new') ? c.new : c; }
    return v == null || v === '' ? null : String(v);
  }
  function blockOf(cfg, n) { var span = (cfg.block_size || 50) * (cfg.increment_no || 1); return Math.floor((n - (cfg.start_no || 1)) / span); }

  // §13.12.I.1 — the short form of a base's hash an op carries in its `manifest`
  function baseStamp(b) { return b && b.sha256 ? 'b:' + String(b.sha256).slice(0, 12) : null; }

  var API = { baseStamp: baseStamp, admit: admit, admitClaim: admitClaim, claimSpec: claimSpec, admitEscrow: admitEscrow, escrowSpec: escrowSpec, deskOwner: deskOwner, formatDocNo: formatDocNo, docNoOf: docNoOf, blockOf: blockOf, stationCode: stationCode };
  global.CommAdmit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
