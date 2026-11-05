// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_project.js -- MProjectLine (org.adempiere.base/src/org/compiere/model/MProjectLine.java), registered into the generic ModelLayer like every other M* class. bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §DEL D4.
//   beforeSave :206-257 (Line, PlannedAmt, PlannedMarginAmt, Phase from Task, Project from Phase); afterSave :260-266 and afterDelete :269-275 -> updateHeader :280-327.
//   updateHeader's three SQL statements read the lines of the row being saved: active lines only, COALESCE(...,0), exactly as the Java. A line moved to another phase refreshes only the new phase, as the Java does.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'));
  else root.ModelProject = factory(root.ModelLayer);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML) {
  var D = ML.D, N = ML.N;
  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }
  function sum(rows, col) { var s = D(0); rows.forEach(function (r) { s = s.add(D(r[col])); }); return s; }
  function changed(l, old, col) { return !old || !same(l[col], old[col]); }   // PO.is_ValueChanged

  function beforeSave(trx, l, isNew, old) {
    if (!nz(l.line)) { var mx = 0; trx.find('c_projectline', { c_project_id: l.c_project_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line || 0)); }); l.line = mx + 10; }   // :208-209 setLine
    l.plannedamt = N(D(l.plannedqty).multiply(D(l.plannedprice)));                                                                                                                  // :212
    if (changed(l, old, 'm_product_id') || changed(l, old, 'm_product_category_id') || changed(l, old, 'plannedqty') || changed(l, old, 'plannedprice')) {                         // :215-216
      if (nz(l.m_product_id)) trx.say('§MODEL-UNPORTED-DEP MProjectLine.getLimitPrice :170-182: IProductPricing.setProjectLine not ported; PlannedMarginAmt left as entered');
      else if (nz(l.m_product_category_id)) { var cat = trx.get('m_product_category', l.m_product_category_id);
        l.plannedmarginamt = N(D(cat ? cat.plannedmargin : 0).multiply(D(l.plannedqty))); }
    }
    if (changed(l, old, 'c_projecttask_id') && nz(l.c_projecttask_id)) {
      var pt = trx.get('c_projecttask', l.c_projecttask_id); if (!pt) return 'Project Task Not Found - ID=' + l.c_projecttask_id;
      l.c_projectphase_id = pt.c_projectphase_id;
    }
    if (changed(l, old, 'c_projectphase_id') && nz(l.c_projectphase_id)) {
      var pp = trx.get('c_projectphase', l.c_projectphase_id); if (!pp) return 'Project Phase Not Found - ' + l.c_projectphase_id;
      l.c_project_id = pp.c_project_id;
    }
    return null;
  }
  function updateHeader(trx, l) {
    var p = trx.get('c_project', l.c_project_id);
    if (p) { var ls = trx.find('c_projectline', { c_project_id: l.c_project_id, isactive: 'Y' });
      trx.update('c_project', p, { plannedamt: N(sum(ls, 'plannedamt')), plannedqty: N(sum(ls, 'plannedqty')), plannedmarginamt: N(sum(ls, 'plannedmarginamt')),
        committedamt: N(sum(ls, 'committedamt')), committedqty: N(sum(ls, 'committedqty')), invoicedamt: N(sum(ls, 'invoicedamt')), invoicedqty: N(sum(ls, 'invoicedqty')) }); }
    else trx.say('§MODEL-PROJECT updateHeader project - #0 id=' + l.c_project_id);
    if (nz(l.c_projectphase_id)) { var ph = trx.get('c_projectphase', l.c_projectphase_id);
      if (ph && same(ph.c_project_id, l.c_project_id)) { var lp = trx.find('c_projectline', { c_project_id: l.c_project_id, c_projectphase_id: l.c_projectphase_id, isactive: 'Y' });
        trx.update('c_projectphase', ph, { plannedamt: N(sum(lp, 'plannedamt')), committedamt: N(sum(lp, 'committedamt')) }); } }
    if (nz(l.c_projecttask_id)) { var t = trx.get('c_projecttask', l.c_projecttask_id);
      if (t && same(t.c_projectphase_id, l.c_projectphase_id)) { var lt = trx.find('c_projectline', { c_projectphase_id: l.c_projectphase_id, c_projecttask_id: l.c_projecttask_id, isactive: 'Y' });
        trx.update('c_projecttask', t, { plannedamt: N(sum(lt, 'plannedamt')), committedamt: N(sum(lt, 'committedamt')) }); } }
    return null;
  }
  ML.registerModel('c_projectline', {
    initialDefaults: { line: 0, isprinted: 'Y', processed: 'N', invoicedamt: 0, invoicedqty: 0, plannedamt: 0, plannedmarginamt: 0, plannedprice: 0, plannedqty: 1 },   // setInitialDefaults :81-92
    beforeSave: beforeSave,
    afterSave: function (trx, l) { return updateHeader(trx, l); },
    afterDelete: function (trx, l) { return updateHeader(trx, l); }
  });
  return { beforeSave: beforeSave, updateHeader: updateHeader };
});
