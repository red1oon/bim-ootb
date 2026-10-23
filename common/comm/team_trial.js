// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* team_trial.js — the one-cycle trial rule (TEAMWORK_FRAMEWORK §13.8 T4). PURE: no storage, no network.
 *   status(envs, opts) → { finished, reason, businessOps, cycles }
 *   envs  = the placed business envelopes of the space (identity ops already excluded by the caller)
 *   opts  = { trial:Boolean, cycles:Number (default 1), cap:Number (default 60) }
 * A cycle = one document SET_STATUS to 'CO' (order → line → Complete). A user on their own repo/key (trial:false) is never limited.
 * Soft limit (client side); the hard limit is the trial token's expiry. */
(function (g) {
  'use strict';
  function status(envs, opts) {
    opts = opts || {}; envs = envs || [];
    var cycles = 0, ops = envs.length, want = opts.cycles == null ? 1 : opts.cycles, cap = opts.cap == null ? 60 : opts.cap;
    envs.forEach(function (e) { var b = e && e.body; if (b && b.op_type === 'SET_STATUS' && b.params && b.params.to === 'CO') cycles++; });
    if (!opts.trial) return { finished: false, reason: 'not-a-trial', businessOps: ops, cycles: cycles };
    if (cycles >= want) return { finished: true, reason: 'trial-finished', businessOps: ops, cycles: cycles };
    if (ops >= cap) return { finished: true, reason: 'trial-cap', businessOps: ops, cycles: cycles };
    return { finished: false, reason: 'trial-open', businessOps: ops, cycles: cycles };
  }
  var API = { status: status };
  g.TeamTrial = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
