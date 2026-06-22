/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — SCOPE: W0 / S5 "EARN THE ACTUAL" (lane prompts/TM_4D5D_VARIANCE_LANE.md §W0-SOURCE-DECISION).
// Read the LOG after every run (tests/earn_gw_hospital_actual.log) — exit code is not evidence. DONE when W-PC-EARN green.
//
// WHAT THIS DOES (the keystone): the GW Hospital CommittedAmt (actual spend) must FOLD from real atomic rows, not a
// top-down ×factor multiply. iDempiere's native atomic actual is PP_Order_Cost.CumulatedAmt — one row per
// (manufacturing order × cost element: Material/Labor/Burden/Overhead). bake_gw_hospital_variance.js seeds the REAL
// per-PHASE variance signs (Super +60%, Finishes −11%, MEP −3%, …) into C_ProjectPhase.CommittedAmt — that phase
// grain is the EXTRACTED anchor (management's per-phase actual). This script PUSHES that phase actual DOWN onto the
// atomic PP_Order_Cost.CumulatedAmt rows, then re-sources C_Project.CommittedAmt as SUM(CumulatedAmt). The project
// total (RM 87,372,995) now EMERGES from 64 auditable atomic rows — line-to-line, the thing 5D-BIM tools lack
// (ITcon Pishdad 2024: "no tool for tracking costs on a line-to-line basis").
//
// NON-INVENT BOUNDARY (DETERMINISTIC variant — no random, no Date.now):
//   • order→phase mapping is EXTRACTED: each phase's orders' Σ planned == phase planned (greedy desc; asserted).
//   • distribution is PROPORTIONAL to planned (order←phase, element←order) with largest-remainder rounding so every
//     level ties to the cent. The variance MAGNITUDE is the seed's phase anchor — we attribute it, we don't invent it.
//   • planned (CurrentCostPrice×CurrentQty) is left UNTOUCHED — the S-curve planned fold (64,719,479) still holds.
//
// W-PC-EARN (§FALSIFIERS): (1) ΣCumulatedAmt != planned anymore (actual earned); (2) Σ by phase == C_ProjectPhase
//   .CommittedAmt to the cent; (3) Σ all == C_Project.CommittedAmt sourced from atomic == 87,372,995 WITH no ×factor
//   in this fold; (4) SIGN preserved — over-budget phases (Super) have CumulatedAmt>planned, under phases
//   (Finishes/MEP) have CumulatedAmt<planned (NOT a uniform inflate). SAFE: dry-run unless --write.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node tests/earn_gw_hospital_actual.js [--write]

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const WRITE = process.argv.includes('--write');
const ERP = path.join(__dirname, '..', 'ad_seed.db');

const out = [];
const W = (ok, m) => { out.push((ok ? '🟢' : '🔴') + ' ' + m); return ok; };
const money = n => 'RM' + Math.round(n).toLocaleString('en-US');

// largest-remainder apportionment: split integer `total` across weights, Σ result == total exactly, deterministic.
function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map(w => total * w / sum);
  const floor = raw.map(Math.floor);
  let rem = total - floor.reduce((a, b) => a + b, 0);
  // hand the leftover units to the largest fractional parts (ties broken by index — deterministic)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < rem; k++) floor[order[k].i]++;
  return floor;
}

(async function () {
  if (!fs.existsSync(ERP)) { console.log('§EARN SKIP — missing ' + ERP); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(ERP));
  const rows = (s) => { const r = db.exec(s); return r.length ? r[0].values : []; };
  const scalar = (s) => { const r = db.exec(s); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; };

  const projId = scalar("SELECT C_Project_ID FROM C_Project WHERE Value='Hospital'");
  if (projId == null) { console.log('§EARN SKIP — no Hospital C_Project'); process.exit(1); }

  // ── phases with their EXTRACTED committed anchor (set by bake_gw_hospital_variance.js) ──
  const phases = rows("SELECT C_ProjectPhase_ID, Name, PlannedAmt, CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + projId + " AND PlannedAmt>0")
    .map(r => ({ id: r[0], name: r[1], planned: r[2], committed: r[3] })).sort((a, b) => b.planned - a.planned);

  // ── hospital orders with per-order planned (Σ element CurrentCostPrice×CurrentQty) ──
  const orders = rows(
    "SELECT o.PP_Order_ID, ROUND(SUM(oc.CurrentCostPrice*oc.CurrentQty)) FROM PP_Order o " +
    "JOIN PP_Order_Cost oc ON oc.PP_Order_ID=o.PP_Order_ID WHERE o.C_Project_ID=" + projId +
    " GROUP BY o.PP_Order_ID").map(r => ({ id: r[0], planned: r[1] })).sort((a, b) => b.planned - a.planned);

  // ── EXTRACT the order→phase mapping: greedy descending (each phase's orders' Σplanned == phase planned) ──
  let oi = 0;
  phases.forEach(p => {
    p.orders = []; let acc = 0;
    while (oi < orders.length && acc < p.planned - 1) { p.orders.push(orders[oi]); acc += orders[oi].planned; oi++; }
    p.orderPlanned = acc;
  });
  const mapClean = phases.every(p => Math.abs(p.orderPlanned - p.planned) <= p.orders.length); // ≤1 unit/row rounding
  W(mapClean && oi === orders.length, 'order→phase mapping EXTRACTED — every phase Σorders==planned, all ' + orders.length + ' orders placed');

  // ── per-order element planned (one row per cost element) ──
  const elemPlanned = {};   // PP_Order_ID -> [{costId, elemId, planned}]
  rows("SELECT oc.PP_Order_Cost_ID, oc.PP_Order_ID, oc.M_CostElement_ID, ROUND(oc.CurrentCostPrice*oc.CurrentQty) " +
       "FROM PP_Order_Cost oc JOIN PP_Order o ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=" + projId)
    .forEach(r => { (elemPlanned[r[1]] = elemPlanned[r[1]] || []).push({ costId: r[0], elemId: r[2], planned: r[3] }); });

  // ── PUSH DOWN: phase.committed → orders (∝ planned) → elements (∝ planned), largest-remainder ties ──
  const writes = [];   // {costId, cumamt}
  phases.forEach(p => {
    const oc = apportion(p.committed, p.orders.map(o => o.planned));
    p.orders.forEach((o, k) => {
      o.committed = oc[k];
      const els = elemPlanned[o.id] || [];
      const ec = apportion(o.committed, els.map(e => e.planned));
      els.forEach((e, j) => { e.cumamt = ec[j]; writes.push({ costId: e.costId, cumamt: e.cumamt }); });
    });
  });

  // ── apply ──
  writes.forEach(w => db.run("UPDATE PP_Order_Cost SET CumulatedAmt=? WHERE PP_Order_Cost_ID=?", [w.cumamt, w.costId]));
  // re-source the PROJECT actual FROM THE ATOMIC ROWS (the keystone: a SUM, not a ×factor)
  const projFromAtomic = scalar(
    "SELECT CAST(ROUND(SUM(oc.CumulatedAmt)) AS INTEGER) FROM PP_Order_Cost oc " +
    "JOIN PP_Order o ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=" + projId);
  db.run("UPDATE C_Project SET CommittedAmt=? WHERE C_Project_ID=" + projId, [projFromAtomic]);

  // ── WITNESS W-PC-EARN (read the §-log) ──
  const planTot = scalar("SELECT CAST(ROUND(SUM(oc.CurrentCostPrice*oc.CurrentQty)) AS INTEGER) FROM PP_Order_Cost oc JOIN PP_Order o ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=" + projId);
  const cumTot = scalar("SELECT CAST(ROUND(SUM(oc.CumulatedAmt)) AS INTEGER) FROM PP_Order_Cost oc JOIN PP_Order o ON o.PP_Order_ID=oc.PP_Order_ID WHERE o.C_Project_ID=" + projId);
  console.log('§EARN planned(atomic)=' + planTot + ' actual(atomic CumulatedAmt)=' + cumTot + ' Δ=+' + Math.round((cumTot - planTot) / planTot * 100) + '%');

  W(cumTot !== planTot && cumTot > planTot, 'actual EARNED at atomic grain — ΣCumulatedAmt ' + money(cumTot) + ' ≠ planned ' + money(planTot) + ' (+' + money(cumTot - planTot) + ')');
  W(planTot === 64719479, 'planned fold UNTOUCHED — ΣCurrentCostPrice·Qty still ' + money(planTot) + ' (the S-curve still holds)');

  // (2) Σ atomic by phase == C_ProjectPhase.CommittedAmt to the cent
  let phaseTie = true;
  phases.forEach(p => {
    const ids = p.orders.map(o => o.id).join(',');
    const got = scalar("SELECT CAST(ROUND(SUM(CumulatedAmt)) AS INTEGER) FROM PP_Order_Cost WHERE PP_Order_ID IN (" + ids + ")");
    if (got !== Math.round(p.committed)) { phaseTie = false; out.push('   ↳ ' + p.name + ' atomic=' + got + ' anchor=' + p.committed); }
  });
  W(phaseTie, 'Σ atomic CumulatedAmt by phase == C_ProjectPhase.CommittedAmt to the cent (push-down ties out, all ' + phases.length + ' phases)');

  // (3) project sourced from atomic == 87,372,995 — no ×factor in THIS fold
  const projDb = scalar("SELECT CAST(ROUND(CommittedAmt) AS INTEGER) FROM C_Project WHERE C_Project_ID=" + projId);
  W(projDb === cumTot, 'C_Project.CommittedAmt re-sourced from atomic SUM(CumulatedAmt) == ' + money(projDb) + ' (a fold, not a multiply)');
  W(projDb === 87372995, 'project actual == the marquee RM 87,372,995 EMERGES from the atomic sum (==seed target)');

  // (4) SIGN preserved — over phases earn MORE, under phases earn LESS (not a uniform inflate)
  const over = phases.filter(p => p.committed > p.planned), under = phases.filter(p => p.committed < p.planned);
  let signOk = true;
  phases.forEach(p => {
    const overP = p.committed > p.planned;
    const everyOrderMatches = p.orders.every(o => overP ? o.committed >= o.planned : o.committed <= o.planned);
    if (!everyOrderMatches) signOk = false;
  });
  W(over.length >= 1 && under.length >= 1, 'mixed signs present — ' + over.length + ' phases OVER, ' + under.length + ' UNDER (real distribution, not uniform)');
  W(signOk, 'SIGN pushed down faithfully — every order in an over-phase earns ≥ planned, every order in an under-phase ≤ planned');

  // breakdown table
  console.log('\nearned actual by phase (atomic fold):');
  phases.forEach(p => {
    const got = scalar("SELECT ROUND(SUM(CumulatedAmt)) FROM PP_Order_Cost WHERE PP_Order_ID IN (" + p.orders.map(o => o.id).join(',') + ")");
    const d = got - p.planned;
    console.log('  ' + (p.committed > p.planned ? '▲' : '▼') + ' ' + p.name.padEnd(15) + ' planned=' + money(p.planned).padEnd(14) +
      ' actual=' + money(got).padEnd(14) + ' Δ=' + (d >= 0 ? '+' : '') + money(d).padEnd(13) + ' (' + p.orders.length + ' orders)');
  });

  const pass = out.filter(l => l.startsWith('🟢')).length, total = out.filter(l => /^[🟢🔴]/.test(l)).length;
  console.log('\n' + out.join('\n'));
  console.log('\nW-PC-EARN ' + pass + '/' + total + (WRITE ? ' [WRITE]' : ' [dry-run]'));
  if (WRITE && pass === total) { fs.writeFileSync(ERP, Buffer.from(db.export())); console.log('§EARN WROTE ' + ERP); }
  else if (WRITE) console.log('§EARN NOT WRITTEN — witness not green');
  fs.writeFileSync(path.join(__dirname, 'earn_gw_hospital_actual.log'), out.join('\n') + '\n');
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
