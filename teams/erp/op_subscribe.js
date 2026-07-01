// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS ERP OP-SUBSCRIBE (teams/ROADMAP.md §S7, Phase D — the teams-side half).
//   The erp/ edit (kernel_ops.setOpEmitter) emits a kernel-neutral TEAM_OP; THIS file (in teams/, not
//   erp/) wires that emitter onto the team bus — BroadcastChannel('bim_teams') vocab TEAM_OP / TEAM_PRESENCE,
//   DISTINCT from the BIM highlight messages (GAP-BUS-SCOPE). Install is REVERSIBLE (uninstall → kernel
//   back to default-off) and default-off (nothing runs until installErpEmitter is called). PURE wiring —
//   no Date.now / Math.random. Witness: teams/tests/poc_teams_phase_d.js (§EMIT-BUS / §EMIT-UNINSTALL).
'use strict';

// installErpEmitter(KernelOps, bus, opts) — route the kernel's post-commit op-event onto the team bus as a
// TEAM_OP. opts.scope (a {role,org} tag) is attached so subscribers can scope-filter (GAP-PARTITION-KEY).
// Returns an uninstall() that restores the kernel to default-off (reversible — the Phase-D safety rule).
function installErpEmitter(KernelOps, bus, opts) {
  opts = opts || {};
  if (!KernelOps || typeof KernelOps.setOpEmitter !== 'function') throw new Error('op_subscribe: KernelOps.setOpEmitter required');
  KernelOps.setOpEmitter(function (evt) {
    try { bus.send('TEAM_OP', Object.assign({ scope: opts.scope != null ? opts.scope : null }, evt)); }
    catch (e) { /* a bus error must never break the commit — the kernel already wraps us too */ }
  });
  return function uninstall() { KernelOps.setOpEmitter(null); };
}

// subscribeErpOps(bus, cb) — receive TEAM_OP events. Optional opts.scope filters to a {role,org} partition
// (NON-INVENT: an event with no scope, or a matching scope, passes; a mismatching one is dropped).
function subscribeErpOps(bus, cb, opts) {
  opts = opts || {};
  bus.on('TEAM_OP', function (evt) {
    if (opts.scope && evt && evt.scope) {
      if (opts.scope.org != null && evt.scope.org != null && String(opts.scope.org) !== String(evt.scope.org)) return;
      if (opts.scope.role != null && evt.scope.role != null && String(opts.scope.role) !== String(evt.scope.role)) return;
    }
    cb(evt);
  });
}

var OS = { installErpEmitter: installErpEmitter, subscribeErpOps: subscribeErpOps };
if (typeof module === 'object' && module.exports) module.exports = OS;
else (typeof self !== 'undefined' ? self : this).TeamsErpOpSubscribe = OS;
