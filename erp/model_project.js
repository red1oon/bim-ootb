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

  // MProjectLine.getLimitPrice :170-182 - the price LIMIT of the product on the project's price list (IProductPricing.setProjectLine, the project's partner, qty = PlannedQty); the planned price itself when
  //   there is no product, no project or the price is not calculated. The pricing runtime reads through the Trx for the call and is put back afterwards (as MOrderLine's, model_order.js).
  function getLimitPrice(trx, l) {
    var limit = D(l.plannedprice);
    if (!nz(l.m_product_id)) return limit;
    var pj = nz(l.c_project_id) ? trx.get('c_project', l.c_project_id) : null; if (!pj) return limit;
    var node = typeof module !== 'undefined' && module.exports, a = node ? require('./ad_callout.js') : (typeof window !== 'undefined' ? window : globalThis).AdCallout, RT = a.RUNTIME;
    if (node && !RT.M.MProductPricing) ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require('./callouts/' + m + '.js'); });
    if (!RT.M.MProductPricing) { trx.say('§MODEL-UNPORTED-DEP MProjectLine.getLimitPrice :170-182 needs callouts/pricing.js, not loaded on this host: PlannedMarginAmt left as entered'); return limit; }
    var sDB = RT.DB, sPO = RT.PO, sNow = RT.now, sEnvNow = a.Env.now;
    a.bind(function (sql, params) { return trx.q(sql, params); });
    try {
      var plv = nz(pj.m_pricelist_version_id) ? trx.q('SELECT m_pricelist_id AS p FROM m_pricelist_version WHERE m_pricelist_version_id=?', [pj.m_pricelist_version_id])[0] : null;   // MProject.getM_PriceList_ID :168-178
      var pp = RT.M.Core.getProductPricing();
      pp.setProjectLine({ getM_Product_ID: function () { return Number(l.m_product_id) || 0; }, getC_Project_ID: function () { return Number(l.c_project_id) || 0; }, getPlannedQty: function () { return D(l.plannedqty); } }, trx);
      pp.setM_PriceList_ID(plv && nz(plv.p) ? Number(plv.p) : 0);
      var calc = pp.calculatePrice(); if (calc) limit = pp.getPriceLimit();
    } finally { RT.DB = sDB; RT.PO = sPO; RT.now = sNow; a.Env.now = sEnvNow; }
    return limit;
  }
  function beforeSave(trx, l, isNew, old) {
    if (!nz(l.line)) { var mx = 0; trx.find('c_projectline', { c_project_id: l.c_project_id }).forEach(function (x) { mx = Math.max(mx, Number(x.line || 0)); }); l.line = mx + 10; }   // :208-209 setLine
    l.plannedamt = N(D(l.plannedqty).multiply(D(l.plannedprice)));                                                                                                                  // :212
    if (changed(l, old, 'm_product_id') || changed(l, old, 'm_product_category_id') || changed(l, old, 'plannedqty') || changed(l, old, 'plannedprice')) {                         // :215-216
      if (nz(l.m_product_id)) l.plannedmarginamt = N(D(l.plannedprice).subtract(getLimitPrice(trx, l)).multiply(D(l.plannedqty)));   // :222-225 marginEach = PlannedPrice - getLimitPrice(); x PlannedQty
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

  // ── MProject.beforeSave (MProject.java:408-422; bim-ootb prompts/CAPEX_DASHBOARD.md §5.67): AD_User_ID -1 (summary project in dimensions) -> 0; when M_PriceList_Version_ID changed and is set,
  //    the project's currency follows that version's price list (getM_PriceList_ID :168-178 reads M_PriceList_Version.M_PriceList_ID; MPriceList.get -> C_Currency_ID). A Pack In of a project that carries
  //    only its price list version lands in that price list's currency, on legacy (GenericPOElementHandler saves through the model class) and here alike. Logs §PROJECT-CURRENCY when it sets one.
  function projectBeforeSave(trx, p, isNew, old) {
    if (Number(p.ad_user_id) === -1) p.ad_user_id = 0;
    var v = Number(p.m_pricelist_version_id) || 0, changed = !old || String(old.m_pricelist_version_id == null ? '' : old.m_pricelist_version_id) !== String(p.m_pricelist_version_id == null ? '' : p.m_pricelist_version_id);
    if (changed && v) {
      var plv = trx.q('SELECT m_pricelist_id AS l FROM m_pricelist_version WHERE m_pricelist_version_id=?', [v])[0], pl = plv && Number(plv.l) ? trx.q('SELECT c_currency_id AS c FROM m_pricelist WHERE m_pricelist_id=?', [plv.l])[0] : null;
      if (pl && pl.c != null) { p.c_currency_id = pl.c; if (typeof console !== 'undefined') console.log('§PROJECT-CURRENCY project=' + (p.value || p.c_project_id) + ' from price list version ' + v + ' -> C_Currency_ID=' + pl.c); }
    }
    return null;
  }
  ML.registerModel('c_project', { beforeSave: projectBeforeSave });

  // ── MProject.setProjectType(MProjectType) MProject.java:370-378 and copyPhasesFrom(MProjectType) :385-405 (+ MProjectPhase(project, typePhase) MProjectPhase.java:107-119,
  //    copyTasksFrom(MProjectTypePhase) :240-258, MProjectTask(phase, typeTask) MProjectTask.java:109-121). Phases and tasks are copied ONLY for a Service project ('S').
  //    MProjectType.getPhases :166 / MProjectTypePhase.getTasks :94: IsActive='Y' ORDER BY SeqNo, <id>. Returns { category, phases, tasks }; logs §PROJECT-SETTYPE.
  function bySeq(rows, idc) { return rows.filter(function (r) { return r.isactive !== 'N'; }).sort(function (a, b) { return (Number(a.seqno) - Number(b.seqno)) || (Number(a[idc]) - Number(b[idc])); }); }
  function copyPhasesFrom(trx, project, type) {
    var phases = 0, tasks = 0;
    bySeq(trx.find('c_phase', { c_projecttype_id: type.c_projecttype_id }), 'c_phase_id').forEach(function (tp) {
      var ph = ML.newRecord(trx, 'c_projectphase', {});
      ph.set('ad_client_id', project.ad_client_id).set('ad_org_id', project.ad_org_id).set('c_project_id', project.c_project_id)
        .set('c_phase_id', tp.c_phase_id).set('name', tp.name).set('seqno', tp.seqno).set('description', tp.description).set('help', tp.help).set('qty', tp.standardqty);
      if (nz(tp.m_product_id)) ph.set('m_product_id', tp.m_product_id);
      if (!ph.save()) return;
      phases++;
      bySeq(trx.find('c_task', { c_phase_id: tp.c_phase_id }), 'c_task_id').forEach(function (tt) {
        var tk = ML.newRecord(trx, 'c_projecttask', {});
        tk.set('ad_client_id', ph.get('ad_client_id')).set('ad_org_id', ph.get('ad_org_id')).set('c_projectphase_id', ph.id())
          .set('c_task_id', tt.c_task_id).set('seqno', tt.seqno).set('name', tt.name).set('description', tt.description).set('help', tt.help).set('qty', tt.standardqty);
        if (nz(tt.m_product_id)) tk.set('m_product_id', tt.m_product_id);
        if (tk.save()) tasks++;
      });
    });
    return { phases: phases, tasks: tasks };
  }
  function setProjectType(trx, project, type) {
    var c = { phases: 0, tasks: 0 };
    if (String(type.projectcategory) === 'S') c = copyPhasesFrom(trx, project, type);   // PROJECTCATEGORY_ServiceChargeProject
    var r = ML.save(trx, 'c_project', project, { c_projecttype_id: type.c_projecttype_id, projectcategory: type.projectcategory });
    if (!r.ok) throw new Error(r.error || 'SaveError c_project');
    trx.say('§PROJECT-SETTYPE project=' + project.c_project_id + ' type=' + type.c_projecttype_id + ' category=' + type.projectcategory + ' phases=' + c.phases + ' tasks=' + c.tasks);
    return { category: type.projectcategory, phases: c.phases, tasks: c.tasks };
  }

  // ── MProject readers: getLines :194-206 (ORDER BY Line,C_ProjectLine_ID, NO IsActive filter), getPhaseLines :213-223 (ORDER BY Line), getPhases :248-258 (ORDER BY SeqNo);
  //    MProjectPhase.getTasks :125 (ORDER BY SeqNo), getLines :263-274; MProjectTask.getLines :125-136 (ORDER BY Line,C_ProjectLine_ID). bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §PROJ-PROCS.
  function getLines(trx, projectId) { return trx.find('c_projectline', { c_project_id: projectId }, ['line', 'c_projectline_id']); }
  function getPhaseLines(trx, projectId, phaseId) { return trx.find('c_projectline', { c_project_id: projectId, c_projectphase_id: phaseId }, ['line', 'c_projectline_id']); }
  function getPhases(trx, projectId) { return trx.find('c_projectphase', { c_project_id: projectId }, ['seqno', 'c_projectphase_id']); }
  function phaseTasks(trx, phaseId) { return trx.find('c_projecttask', { c_projectphase_id: phaseId }, ['seqno', 'c_projecttask_id']); }
  function taskLines(trx, phaseId, taskId) { return trx.find('c_projectline', { c_projectphase_id: phaseId, c_projecttask_id: taskId }, ['line', 'c_projectline_id']); }
  function copyOf(trx, table, from, client, org) { var n = ML.newRecord(trx, table, {}); ML.copyValues(trx, table, from, n, client, org); return n; }   // new M<X>(ctx,0,trx) + PO.copyValues(from, to, client, org)
  function saveEx(po) { if (!po.save()) throw new Error(po.error || 'SaveError'); return po; }

  // MProjectTask.copyLinesFrom :144-169 - every line of the source task (its Phase+Task), no filter
  function taskCopyLinesFrom(trx, toTask, fromTask) {
    if (!fromTask) return 0;
    var count = 0, ph = trx.get('c_projectphase', toTask.get('c_projectphase_id')), pid = ph ? ph.c_project_id : 0;                     // getC_Project_ID(false) :172-178: the project of the task's phase
    taskLines(trx, fromTask.c_projectphase_id, fromTask.c_projecttask_id).forEach(function (fl) {
      var to = copyOf(trx, 'c_projectline', fl, toTask.get('ad_client_id'), toTask.get('ad_org_id'));
      to.set('c_project_id', pid).set('c_projectphase_id', toTask.get('c_projectphase_id')).set('c_projecttask_id', toTask.id());
      saveEx(to); count++;
    });
    return count;
  }
  // MProjectPhase.copyLinesFrom :160-185 - the source phase's lines that have NO task (task lines come with their task)
  function phaseCopyLinesFrom(trx, toPhase, fromPhase) {
    if (!fromPhase) return 0;
    var count = 0;
    getPhaseLines(trx, fromPhase.c_project_id, fromPhase.c_projectphase_id).forEach(function (fl) {
      if (nz(fl.c_projecttask_id)) return;                                                                                              // :170 BF 3067850
      var to = copyOf(trx, 'c_projectline', fl, toPhase.get('ad_client_id'), toPhase.get('ad_org_id'));
      to.set('c_project_id', toPhase.get('c_project_id')).set('c_projectphase_id', toPhase.id());
      saveEx(to); count++;
    });
    return count;
  }
  // MProjectPhase.copyTasksFrom(MProjectPhase) :189-233 - a task whose non-zero C_Task_ID the target phase already holds (read ONCE, :196) is ignored
  function phaseCopyTasksFrom(trx, toPhase, fromPhase) {
    if (!fromPhase) return 0;
    var count = 0, countLine = 0, mine = phaseTasks(trx, toPhase.id());
    phaseTasks(trx, fromPhase.c_projectphase_id).forEach(function (ft) {
      var exists = nz(ft.c_task_id) && mine.some(function (m) { return String(m.c_task_id) === String(ft.c_task_id); });
      if (exists) return;                                                                                                               // :221 "Task already exists here, ignored"
      var tt = copyOf(trx, 'c_projecttask', ft, toPhase.get('ad_client_id'), toPhase.get('ad_org_id'));
      tt.set('c_projectphase_id', toPhase.id());
      saveEx(tt); count++;
      countLine += taskCopyLinesFrom(trx, tt, ft);                                                                                      // BF 3067850
    });
    return count + countLine;
  }
  // MProject.copyLinesFrom :281-307 - only lines with neither phase nor task (:290-292); Invoiced*/OrderPO/Order/Processed reset (:297-301); a refused save is logged SEVERE, not counted
  function copyLinesFrom(trx, to, from) {
    if (String(to.processed) === 'Y' || !from) return 0;
    var count = 0, fromLines = getLines(trx, from.c_project_id);
    fromLines.forEach(function (fl) {
      if (nz(fl.c_projectphase_id) || nz(fl.c_projecttask_id)) return;
      var line = copyOf(trx, 'c_projectline', fl, to.ad_client_id, to.ad_org_id);
      line.set('c_project_id', to.c_project_id).set('invoicedamt', 0).set('invoicedqty', 0).set('c_orderpo_id', null).set('c_order_id', null).set('processed', 'N');
      if (line.save()) count++;
    });
    if (fromLines.length !== count) trx.say('§MODEL-SEVERE MProject.copyLinesFrom Lines difference - Project=' + fromLines.length + ' <> Saved=' + count);   // :304-305 compares ALL source lines: a log line only (it also fires for the skipped phase/task lines, as in Java)
    return count;
  }
  // MProject.copyPhasesFrom(MProject) :315-361 - phases the target already holds by non-zero C_Phase_ID (read ONCE at the start, :323) are ignored; returns phases + tasks + task lines + phase lines
  function copyPhasesFromProject(trx, to, from) {
    if (String(to.processed) === 'Y' || !from) return 0;
    var count = 0, taskCount = 0, lineCount = 0, mine = getPhases(trx, to.c_project_id), fromPhases = getPhases(trx, from.c_project_id);
    fromPhases.forEach(function (fp) {
      var exists = nz(fp.c_phase_id) && mine.some(function (m) { return String(m.c_phase_id) === String(fp.c_phase_id); });
      if (exists) return;                                                                                                               // :346 "Phase already exists here, ignored"
      var tp = copyOf(trx, 'c_projectphase', fp, to.ad_client_id, to.ad_org_id);
      tp.set('c_project_id', to.c_project_id).set('c_order_id', null).set('iscomplete', 'N');
      saveEx(tp); count++;
      taskCount += phaseCopyTasksFrom(trx, tp, fp);
      lineCount += phaseCopyLinesFrom(trx, tp, fp);                                                                                     // BF 3067850
    });
    if (fromPhases.length !== count) trx.say('§MODEL-WARNING MProject.copyPhasesFrom Count difference - Project=' + fromPhases.length + ' <> Saved=' + count);   // :357-358
    return count + taskCount + lineCount;
  }
  // MProject.copyDetailsFrom :267-274 - lines first, then phases/tasks
  function copyDetailsFrom(trx, to, from) {
    if (String(to.processed) === 'Y' || !from) return 0;
    return copyLinesFrom(trx, to, from) + copyPhasesFromProject(trx, trx.get('c_project', to.c_project_id) || to, from);
  }
  // ProjectClose.doIt (org.compiere.process, org.adempiere.base/src/.../ProjectClose.java:57-85) - every line (active or not) Processed, saveEx; then the project Processed, saveEx. Returns the number of lines closed.
  function close(trx, project) {
    var lines = getLines(trx, project.c_project_id);
    lines.forEach(function (l) { saveEx(ML.po(trx, 'c_projectline', trx.get('c_projectline', l.c_projectline_id)).set('processed', 'Y')); });
    saveEx(ML.po(trx, 'c_project', trx.get('c_project', project.c_project_id)).set('processed', 'Y'));
    return lines.length;
  }
  return { beforeSave: beforeSave, projectBeforeSave: projectBeforeSave, updateHeader: updateHeader, setProjectType: setProjectType, copyPhasesFrom: copyPhasesFrom,
           getLines: getLines, getPhaseLines: getPhaseLines, getPhases: getPhases, copyLinesFrom: copyLinesFrom, copyPhasesFromProject: copyPhasesFromProject, copyDetailsFrom: copyDetailsFrom, close: close };
});
