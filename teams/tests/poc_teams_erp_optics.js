#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ERP-GATE + W-ERP-FLOW + W-INVOLVE + W-ORGANISER (teams/ROADMAP.md §S5, Phase C — read-only).
//   Node-only over teams/erp/erp_optics.js: the four ERP Dashboard optics as PURE folds of a SEEDED op-log.
//   ZERO erp/ runtime edits (reads a fixture). Deterministic (fixed ids/ts/now, no Date.now). NON-INVENT.
//     §GATE-RED      — unbalanced POST → verified-red; §GATE-ORANGE over-limit → verified-orange;
//                      §GATE-GREEN clean official → verified-green; §GATE-CLASH same-doc two branches.
//     §FLOW-PATH     — per-case actual path discovered from the log (case=doc, activity=verb).
//     §FLOW-VARIANT  — distinct variants with counts (the skipped-approval variant surfaces).
//     §FLOW-BOTTLE   — bottleneck = the slowest transition (max avg dwell).
//     §FLOW-CONFORM  — conformance vs an AD_Workflow to-be: the skip-case is flagged non-conforming.
//     §INVOLVE       — per-doc participants + per-role headcount + hot (most-participants) cell.
//     §INVOLVE-ACTIVE— who's active now = touched within the presence window (now is an INPUT).
//     §ORG-SCOPE     — mine↔anyone + role/project filters narrow the op set (the anti-overwhelm dial).
//     §ORG-CHARTS    — multi-select charts compose over the scoped ops; broadcast annot surfaces.
//   Run: node teams/tests/poc_teams_erp_optics.js 2>&1 | tee teams/logs/erp_optics.log — then READ the log.
'use strict';
var path = require('path');
var O = require(path.join(__dirname, '..', 'erp', 'erp_optics.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000, S = 1000;     // S = one second
function erp(id, ts, author, role, branch, verb, target, params, extra) {
  return Object.assign({ id: id, ts: ts, author: author, role: role, branch: branch, cls: 'erp',
                         verb: verb, target: target, params: params || {} }, extra || {});
}

(function () {
  console.log('\n═══ W-ERP-GATE + W-ERP-FLOW + W-INVOLVE + W-ORGANISER — ERP Dashboard optics = pure log folds ═══\n');

  // ════ W-ERP-GATE ════ — official + one speculative branch; balanced/unbalanced/over-limit.
  var gateOps = [
    erp('g1', T + 10, 'alice', 'Sales', null,        'SET_STATUS', 'SO-1', { from: 'DR', to: 'CO', GrandTotal: 5000 }),
    erp('g2', T + 15, 'erin',  'Sales', null,        'SET_STATUS', 'SO-2', { from: 'DR', to: 'CO', GrandTotal: 8000 }),
    erp('g3', T + 20, 'bob',   'AP',    null,        'POST',       'INV-1', { lines: [{ dr: 5000, cr: 0 }, { dr: 0, cr: 5000 }] }),
    erp('g4', T + 25, 'carol', 'Finance', 'blue-carol', 'SET_STATUS', 'SO-1', { from: 'DR', to: 'CO', GrandTotal: 5000 }),
    erp('g5', T + 30, 'carol', 'Finance', 'blue-carol', 'POST',       'INV-1', { lines: [{ dr: 5000, cr: 0 }, { dr: 0, cr: 4000 }] })
  ];
  var gate = O.evaluateGate(gateOps, {
    rules: [{ verb: 'SET_STATUS', to: 'CO', field: 'GrandTotal', max: 6000 }],
    fsm: { transitions: [['DR', 'SET_STATUS', 'CO']] }
  });
  var byId = {}; gate.verdicts.forEach(function (v) { byId[v.id] = v; });
  verdict(byId['g5'].verdict === 'verified-red' && /unbalanced/.test(byId['g5'].why),
    '§GATE-RED  unbalanced POST → verified-red', byId['g5'].why);
  verdict(byId['g2'].verdict === 'verified-orange' && /GrandTotal=8000/.test(byId['g2'].why),
    '§GATE-ORANGE  over-limit → verified-orange', byId['g2'].why);
  verdict(byId['g1'].verdict === 'verified-green' && byId['g3'].verdict === 'verified-green',
    '§GATE-GREEN  clean official → verified-green', 'g1=' + byId['g1'].verdict + ' g3=' + byId['g3'].verdict);
  var so1 = gate.clashes.filter(function (c) { return c.doc === 'SO-1'; })[0];
  verdict(so1 && so1.branches.length === 2, '§GATE-CLASH  same-doc two branches', 'SO-1 branches=' + (so1 && so1.branches.join(',')));

  // ════ W-ERP-FLOW ════ — 3 order cases; O2 slow APPROVE→POST; O3 skips APPROVE.
  var flowOps = [
    erp('o1a', T + 0 * S, 'alice', 'Sales', null, 'CREATE',  'O1'), erp('o1b', T + 1 * S, 'alice', 'Sales', null, 'SUBMIT', 'O1'),
    erp('o1c', T + 2 * S, 'bob',   'Mgr',   null, 'APPROVE', 'O1'), erp('o1d', T + 3 * S, 'cara', 'AP',   null, 'POST',   'O1'),
    erp('o2a', T + 0 * S, 'alice', 'Sales', null, 'CREATE',  'O2'), erp('o2b', T + 1 * S, 'alice', 'Sales', null, 'SUBMIT', 'O2'),
    erp('o2c', T + 2 * S, 'bob',   'Mgr',   null, 'APPROVE', 'O2'), erp('o2d', T + 20 * S, 'cara', 'AP',  null, 'POST',   'O2'),
    erp('o3a', T + 0 * S, 'dave',  'Sales', null, 'CREATE',  'O3'), erp('o3b', T + 1 * S, 'dave',  'Sales', null, 'SUBMIT', 'O3'),
    erp('o3c', T + 2 * S, 'dave',  'Sales', null, 'POST',    'O3')   // skipped APPROVE
  ];
  var flow = O.flowLens(flowOps, { toBe: ['CREATE', 'SUBMIT', 'APPROVE', 'POST'] });
  verdict(flow.cases['O1'].map(function (s) { return s.activity; }).join('→') === 'CREATE→SUBMIT→APPROVE→POST',
    '§FLOW-PATH  actual case path from the log', 'O1=' + flow.cases['O1'].map(function (s) { return s.activity; }).join('→'));
  var topVariant = flow.variants[0];
  verdict(flow.variants.length === 2 && topVariant.count === 2 && topVariant.seq === 'CREATE→SUBMIT→APPROVE→POST',
    '§FLOW-VARIANT  distinct variants + counts', 'variants=' + flow.variants.length + ' top=' + topVariant.seq + '×' + topVariant.count);
  verdict(flow.bottleneck && flow.bottleneck.from === 'APPROVE' && flow.bottleneck.to === 'POST',
    '§FLOW-BOTTLE  bottleneck = slowest transition', 'bottleneck=' + (flow.bottleneck && (flow.bottleneck.from + '→' + flow.bottleneck.to)) + ' avg=' + (flow.bottleneck && flow.bottleneck.avgMs) + 'ms');
  verdict(flow.conformance['O3'].conforms === false && flow.conformance['O3'].missing.indexOf('APPROVE') >= 0 &&
          flow.conformance['O1'].conforms === true,
    '§FLOW-CONFORM  conformance vs to-be (skip flagged)', 'O3 missing=' + flow.conformance['O3'].missing.join(',') + ' O1 conforms=' + flow.conformance['O1'].conforms);

  // ════ W-INVOLVE ════ — same flow log; participants + roles + presence.
  var inv = O.involvement(flowOps, { now: T + 20 * S, activeMs: 1 * S });   // active = touched within 1s of now
  verdict(inv.perDoc['O1'].count === 3 && inv.perDoc['O1'].roles['Sales'] === 1 && inv.perDoc['O1'].roles['Mgr'] === 1 && inv.perDoc['O1'].roles['AP'] === 1,
    '§INVOLVE  per-doc participants + per-role headcount', 'O1 participants=' + inv.perDoc['O1'].count + ' roles=' + JSON.stringify(inv.perDoc['O1'].roles));
  verdict(inv.hot[0].count === 3 && (inv.hot[0].doc === 'O1' || inv.hot[0].doc === 'O2'),
    '§INVOLVE hot  most-participants cell', 'hot=' + inv.hot[0].doc + '(' + inv.hot[0].count + ')');
  // only O2's POST (t=20s) is within 1s of now → cara active there.
  verdict(inv.perDoc['O2'].active.indexOf('cara') >= 0 && inv.perDoc['O1'].active.length === 0,
    '§INVOLVE-ACTIVE  who is active now (presence window)', 'O2.active=[' + inv.perDoc['O2'].active.join(',') + '] O1.active=[]');

  // ════ W-ORGANISER ════ — scope dial + multi-select charts + broadcast.
  var orgOps = flowOps.concat([
    Object.assign(erp('p1', T + 1 * S, 'alice', 'Sales', null, 'CREATE', 'O4'), { project: 'PX' }),
    { id: 'bc1', ts: T + 5 * S, author: 'admin', role: 'SysAdmin', branch: null, cls: 'annot', verb: 'PIN',
      target: 'broadcast:all', params: { anchor: { kind: 'broadcast', ref: 'all' }, msg: 'period close Friday' } }
  ]);
  var mine = O.scope(orgOps, { mode: 'mine', viewer: 'dave' });
  var anyone = O.scope(orgOps, { mode: 'anyone' });
  var sales = O.scope(orgOps, { mode: 'anyone', role: 'Sales' });
  verdict(mine.every(function (o) { return o.author === 'dave'; }) && mine.length === 3 && anyone.length === orgOps.length && sales.every(function (o) { return o.role === 'Sales'; }),
    '§ORG-SCOPE  mine↔anyone + role filter', 'mine(dave)=' + mine.length + ' anyone=' + anyone.length + ' sales=' + sales.length);
  var org = O.organiser(orgOps, { mode: 'anyone' }, ['involvement', 'flow', 'presence', 'nudges'], { now: T + 20 * S, activeMs: 1 * S, nudgeThreshold: 2 });
  var chartsOk = org.charts.involvement && org.charts.flow && org.charts.presence && Array.isArray(org.charts.nudges);
  var bcOk = org.broadcasts.length === 1 && org.broadcasts[0].msg === 'period close Friday';
  verdict(chartsOk && bcOk, '§ORG-CHARTS  multi-select charts + broadcast surfaces',
    'charts=[involvement,flow,presence,nudges] broadcasts=' + org.broadcasts.length);

  var n = 13;
  console.log('\n' + (fails === 0 ? '✅ W-ERP-GATE + W-ERP-FLOW + W-INVOLVE + W-ORGANISER ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
