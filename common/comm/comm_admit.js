// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_admit.js — admission at fold time: may THIS op, from THIS device, change THIS record?
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.6 + §12.7 (CL4) — Witness: W-ADMIT-FOLD.
 * Runs on every device, for every business op, against the folded roster (comm_roster.js). Fail-closed: anything it
 * cannot establish (role, table, record scope) is REFUSED, never assumed. An op from a device the roster doesn't know
 * yet is PARKED (its ENROLL may still arrive). The access rule itself is the AD layer's MRole.canUpdate port
 * (erp/ad_access.js RoleContext.canUpdate), reached through ctx.access — no rule lives here.
 *   ctx = { sigOk: bool, access(roleId, client, org, table) → {allowed, reason}, scope: {client, org} | null }
 */
(function (global) {
  'use strict';
  function admit(env, roster, ctx) {
    var d = roster.devices[env.author];
    if (!d) return { verdict: 'PARKED', reason: 'unknown-device' };
    if (!ctx.sigOk) return { verdict: 'REFUSED', reason: 'signature' };
    var cut = roster.revokes[env.author];
    if (cut != null && env.seq > cut) return { verdict: 'REFUSED', reason: 'revoked' };
    var role = roster.roleAt(env.author, env.seq);
    if (role.ad_role_id == null) return { verdict: 'REFUSED', reason: 'no-role' };
    if (!ctx.scope) return { verdict: 'REFUSED', reason: 'scope-unknown' };
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

  var API = { admit: admit, admitClaim: admitClaim, claimSpec: claimSpec, formatDocNo: formatDocNo, docNoOf: docNoOf, blockOf: blockOf, stationCode: stationCode };
  global.CommAdmit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
