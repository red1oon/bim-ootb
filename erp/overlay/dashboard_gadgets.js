// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// dashboard_gadgets.js — HOME DASHBOARD GADGET MODELS (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D2b; Witness: W-DASH-PERF).
// One pure model per gadget kind (view-models only, no DOM). performance(): DPPerformance -> WPAPanel.loadGoal -> MGoal.getUserGoals (active goals of the client whose user AND role are empty, or whose
// user is this user, or whose role is one this user holds; ORDER BY SeqNo) with the goal engine's actual; WPerformanceIndicator.init text: title "<Name>: <percent>%" (goal has a target) else
// "<Name>: <actual>", tooltip "<Description>: <actual> of <target>"; colour MGoal.getColor -> MColorSchema.getColor(percent) (:231-258: marks 1-3 pick colour 1-3, beyond them colour 4, and an
// empty colour falls back to colour 3, then 2, then 1, else black) -> MPrintColor.getColor (code & 0xFFFFFF). Numbers use DisplayType.Integer = #,##0 (HALF_EVEN).
(function (global) {
  'use strict';
  function fmtInt(n) {                                   // java.text.DecimalFormat("#,##0"), RoundingMode.HALF_EVEN
    var neg = Number(n) < 0, a = Math.abs(Number(n)), f = Math.floor(a), d = a - f, r = d > 0.5 + 1e-9 ? f + 1 : d < 0.5 - 1e-9 ? f : (f % 2 === 0 ? f : f + 1);
    return (neg && r !== 0 ? '-' : '') + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function colorOf(q, schemaId, percent) {
    var cs = schemaId ? q('SELECT * FROM pa_colorschema WHERE pa_colorschema_id=?', [schemaId])[0] : null;
    if (!cs) return '#000000';
    var n = function (k) { return Number(cs[k] || 0); }, c = [n('ad_printcolor1_id'), n('ad_printcolor2_id'), n('ad_printcolor3_id'), n('ad_printcolor4_id')], id;
    if (percent <= n('mark1percent') || n('mark2percent') === 0) id = c[0];
    else if (percent <= n('mark2percent') || n('mark3percent') === 0) id = c[1];
    else if (percent <= n('mark3percent') || n('mark4percent') === 0) id = c[2];
    else id = c[3];
    if (!id) id = c[2] || c[1] || c[0] || 0;
    if (!id) return '#000000';
    var pc = q('SELECT code FROM ad_printcolor WHERE ad_printcolor_id=?', [id])[0];
    if (!pc || pc.code == null || String(pc.code) === '.') return '#000000';
    var rgb = (Number(pc.code) & 0xFFFFFF) >>> 0; return '#' + ('000000' + rgb.toString(16)).slice(-6);
  }
  // session = { client, user, role, today, access:{clientIds, orgIds} }; GE = the goal engine
  function performance(q, session, GE) {
    var goals = GE.userGoals(q, session);
    return goals.map(function (g) {
      // MGoal.getUserGoals → updateGoal(false) (MGoal.java:60-108, :383-415): a goal not due for refresh shows its STORED row (WPerformanceIndicator.init → getPercent()); a due one is what legacy
      //   would compute now (bim-ootb prompts/CAPEX_DASHBOARD.md §5.24 — the gadget drew a live value where legacy draws the stored one, e.g. right after a target edit). This model only reads: home.js stores
      //   the due goals after the draw (ModelPA.storeDue, §5.32), with the same value this draws.
      var due = GE.refreshDue ? GE.refreshDue(q, g, { client: session.client, now: session.now }).due : true;
      var r = due ? GE.evaluate(q, g.pa_goal_id, { today: session.today, access: session.access, env: session.env })   // env: the login context, as MMeasure reads getCtx() (@$C_Currency_ID@, CAPEX_DASHBOARD.md §5.68)
        : { ok: true, actual: Number(g.measureactual || 0), percent: Math.trunc(Number(g.goalperformance || 0) * 100), stored: true };
      if (global.console) console.log('§DASH-GOAL id=' + g.pa_goal_id + ' source=' + (due ? 'live' : 'stored') + ' actual=' + r.actual + ' percent=' + r.percent);
      if (!r.ok) return { id: Number(g.pa_goal_id), name: g.name, error: r.reason, title: g.name + ': ?', tooltip: r.reason, percent: 0, color: '#000000' };
      var target = Number(g.measuretarget || 0), hasTarget = target !== 0;
      return { id: Number(g.pa_goal_id), name: g.name, actual: r.actual, target: target, percent: r.percent, color: colorOf(q, g.pa_colorschema_id, r.percent),
        title: g.name + ': ' + (hasTarget ? r.percent + '%' : fmtInt(r.actual)),
        tooltip: (g.description ? g.description + ': ' : '') + fmtInt(r.actual) + (hasTarget ? ' of ' + fmtInt(target) : '') };
    });
  }
  var api = { performance: performance, fmtInt: fmtInt, colorOf: colorOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.DashboardGadgets = api;
})(typeof window !== 'undefined' ? window : this);
