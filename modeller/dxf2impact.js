// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2impact.js — rank the defaults a model USES by what each one moves (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D99 P2). Pure, Node + browser.
// For every used default with options (and not stated by the drawing / the user), the set is judged again with each other option chosen and the bill + load are read from
// their owners; the setting's impact is the largest |Δ bill|. A setting whose options move nothing (bill, own weight, bodies) is INERT (P3: one collapsed line).
// It computes nothing itself: `run(choices)` is the caller's own pipeline (the CLI's run(), the page's structure gate) returning { bodies, total, kN }. Log tag §IMPACT.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Dxf2Impact = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var EPS = 1e-6;
  // table: the defaults table in force (rows: key, value, source, used, options); base: the choices already made; run(choices) -> { bodies, total, kN }
  function rank(table, base, run, log) {
    var say = log || function () {}, t0 = Date.now(), b0 = run(Object.assign({}, base)), rows = [], skipped = [];
    (table || []).forEach(function (r) {
      if (!r.used) return;
      if (/^(file|sheet)$/.test(r.source)) { skipped.push({ key: r.key, why: 'stated by the drawing' }); return; }
      var opts = (r.options || []).filter(function (o) { return String(o) !== String(r.value); });
      if (!opts.length) { skipped.push({ key: r.key, why: 'no option to try' }); return; }
      var tries = opts.map(function (o) {
        var c = {}; c[r.key] = String(o); var x = run(Object.assign({}, base, c));
        var d = { option: o, dBill: x.total - b0.total, dKN: x.kN - b0.kN, dBodies: x.bodies - b0.bodies };
        say('§IMPACT key=' + r.key + ' from=' + r.value + ' option=' + o + ' dBill=' + d.dBill.toFixed(2) + ' dKN=' + d.dKN.toFixed(2) + ' dBodies=' + d.dBodies);
        return d;
      });
      var top = tries.reduce(function (m, d) { return Math.abs(d.dBill) > Math.abs(m.dBill) ? d : m; }, tries[0]);
      var inert = tries.every(function (d) { return Math.abs(d.dBill) < EPS && Math.abs(d.dKN) < EPS && d.dBodies === 0; });
      rows.push({ key: r.key, value: r.value, source: r.source, kind: r.kind, impact: Math.abs(top.dBill), top: top, tries: tries, inert: inert });
    });
    rows.sort(function (a, b) { return b.impact - a.impact || (a.inert - b.inert) || (a.key < b.key ? -1 : 1); });
    var active = rows.filter(function (r) { return !r.inert; }), inert = rows.filter(function (r) { return r.inert; }), sum = active.reduce(function (s, r) { return s + r.impact; }, 0);
    say('§IMPACT_RANK base_total=' + b0.total.toFixed(2) + ' tried=' + rows.length + ' active=' + active.length + ' inert=' + inert.length + ' skipped=' + skipped.length +
      ' top=' + active.slice(0, 3).map(function (r) { return r.key + ':' + r.top.dBill.toFixed(0); }).join(',') + ' ms=' + (Date.now() - t0));
    return { base: b0, rows: rows, active: active, inert: inert, skipped: skipped, share: function (r) { return sum > 0 ? r.impact / sum : 0; } };
  }
  // §D99 P2 step 2: the page's run(choices), the Modeller's own call chain without touching its state: every sheet re-read with the choices (DxfMetaEditor.effSheet's call),
  // judged as structureGate judges (Dxf2Structure.judge with the page's complete / ref / defaultsRef), priced by RegReport.billAndLoad (the CLI's and the Regulatory Report's one path).
  // D: { I, B, ST, RG, LS, BL, effText(sheet), prep (Node only: the browser's readSheet finds self.Dxf2Prep), complete, ref, defaultsRef, pack, packName }
  function pageRun(D, sheets) {
    return function (choices) {
      var eff = sheets.map(function (sh) { return D.I.readSheet(sh.name, D.effText(sh), D.I.sha256Hex, { prep: D.prep, prepChoices: choices }); });
      var R = D.ST.judge(eff, { I: D.I, B: D.B, choices: choices, complete: D.complete ? {} : null, ref: D.ref || null, defaultsRef: D.defaultsRef || null }).gate.R;
      var bl = D.RG.billAndLoad(R && R.els, R && R.defaults_table, { LS: D.LS, BL: D.BL, ref: D.ref, pack: D.pack, packName: D.packName });
      return { bodies: R && R.els ? R.els.length : 0, total: bl.bill ? bl.bill.totals.amount : 0, kN: bl.loadSummary ? bl.loadSummary.total_kN : 0 };
    };
  }
  return { rank: rank, pageRun: pageRun };
});
