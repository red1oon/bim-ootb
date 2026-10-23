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
  var API = { admit: admit };
  global.CommAdmit = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
