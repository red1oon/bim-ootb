// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_pa.js: the PA_Goal MODEL CLASS of the twin (MGoal.afterSave), CORE. Implementing bim-ootb prompts/CAPEX_DASHBOARD.md §5.24 — Witness: W-PA-EDITOR (E3).
// Legacy (~/idempiere-dev-setup/idempiere/org.adempiere.base/src/org/compiere/model/MGoal.java:594-603): a new goal, or a save that changes MeasureTarget / MeasureScope, runs updateGoal(true)
//   → MMeasure.updateCalculatedGoals (:500-541): every active goal of the measure re-read OUTSIDE the save's transaction, its measure SQL run, MeasureActual / GoalPerformance / DateLastRun stored.
// Here: the ONE PA engine (goal_engine.js installModel → updateMeasureGoals) registered in the layered model registry as owner 'core'. The model run reads through crud_overlay's tip-shadowed
//   query (_modelQuery over _tipShadowOn) = the committed state the user sees, so a goal scores against its PREVIOUS committed target, as legacy (§5.4 b); the writes go into the save's own Trx.
// The env the model run carries (client, role, date, now) is the save's session; SYSDATE in a measure goes through the kernel converter (AdCallout.convertSql), as legacy's statements do.
(function (root) {
  'use strict';
  var ML = root.ModelLayer, GE = root.GoalEngine, A = root.AdCallout;
  if (!ML || !GE || typeof GE.installModel !== 'function') { if (root.console) console.log('§MODEL-PA not registered (ModelLayer=' + !!ML + ' GoalEngine=' + !!GE + ')'); return; }
  var installed = false;
  GE.installModel(ML, function (trx) {
    var e = (trx && trx.env) || {}, day = String(e.date || e.now || '').slice(0, 10);
    if (!installed && root.__idmpDb) { try { GE.install(root.__idmpDb); installed = true; } catch (x) {} }   // the stock measures' views / UDFs (invoiceopen, currencybase, the invoice views), once
    return { client: e.client, role: e.role, today: day, now: e.now || (day + ' 00:00:00'), convertSql: A && A.convertSql };
  });
  if (root.console) console.log('§MODEL-PA registered PA_Goal afterSave (MGoal.afterSave :594-603)');
})(typeof window !== 'undefined' ? window : globalThis);
