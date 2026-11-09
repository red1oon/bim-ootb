// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — doc_actions.js: the legal document actions of ONE record, from the engine's own pieces (bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §0.4 detail 2, lane B).
// Spec: lane B SPEC item 1-2. Read the §DOC_ACTIONS line after every run; an exit code is not evidence.
// WHAT: DocumentEngine.getValidActions (ad_docfsm.js legalActionsOrder / legalActionsFor) and then MRole.checkActionAccess (ad_access.js, the step WDocActionPanel.java:185-205 runs right after),
//   joined for one record. The join used to live only inside erp/idempiere.html _fsmCtx (:3417, browser). This module is the SAME join for any host (the seam's verbs(ctx), the door's erp.actions); it
//   adds no rule: the legality is ad_docfsm's, the role filter is ad_access's. NO table is named here (AD-LAYER LAW): the table is an AD_Table id, the walked set is ad_docfsm's DOC_FAMILY.
// DELETION BUDGET (stated, not claimed): idempiere.html still carries its own copy of the period probe (_periodOpen :3379) and the join (_fsmCtx); folding the page onto this module is a follow-up.
// b = a better-sqlite3-style handle: prepare(sql).get(...args) / .all(...args), lower-case column names (idempiere.html _b3w is one; common/door/erp_cli.js builds one over sql.js).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./ad_docfsm'), require('./ad_access'));
  else root.DocActions = factory(root.AdDocFsm, root.AdAccess);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FSM, ACC) {
  'use strict';
  var ORDER_TABLE_ID = 259;
  // idempiere.html _periodOpen :3379-3391, line for line (same answers; the page keeps its copy until it calls this one)
  function periodOpen(b, dateacct, doctypeId) {
    try {
      var d = String(dateacct || '').slice(0, 10);
      if (!d) return { open: true, why: 'no-dateacct→assume-open' };
      var p = b.prepare("SELECT c_period_id FROM c_period WHERE periodtype='S' AND date(?)>=date(startdate) AND date(?)<=date(enddate) ORDER BY c_period_id").get(d, d);
      if (!p) return { open: false, why: 'no-period(' + d + ')' };
      var dbt = doctypeId ? b.prepare('SELECT docbasetype FROM c_doctype WHERE c_doctype_id=?').get(Number(doctypeId)) : null;
      if (!dbt) return { open: true, why: 'no-doctype→assume-open' };
      var pc = b.prepare('SELECT periodstatus FROM c_periodcontrol WHERE c_period_id=? AND docbasetype=?').get(Number(p.c_period_id), dbt.docbasetype);
      return { open: !!(pc && pc.periodstatus === 'O'), why: 'period=' + p.c_period_id + ' ' + dbt.docbasetype + '=' + (pc ? pc.periodstatus : 'absent') };
    } catch (e) { return { open: true, why: 'probe-error(' + e.message + ')→assume-open' }; }
  }
  // rec = the record's row (lower-case columns). opts = { roleId, clientId }. Returns { walked, status, doctypeId, accessDoctypeId, period, legal, offered, role }.
  //   legal = DocumentEngine.getValidActions; offered = legal after the role's Document Action Access (equal to legal when no role is given or the role walk finds no access table).
  function legal(b, adTableId, rec, opts) {
    opts = opts || {};
    var status = rec.docstatus, out = { walked: false, status: status == null ? null : status, legal: [], offered: [], role: null };
    if (status == null || status === '') { out.why = 'the record carries no DocStatus'; return out; }
    var tid = Number(adTableId);
    if (tid !== ORDER_TABLE_ID && !(FSM.DOC_FAMILY && FSM.DOC_FAMILY[tid])) { out.why = 'ad_table_id ' + tid + ' is not a walked DocAction table (ad_docfsm DOC_FAMILY)'; return out; }
    var doctypeId = Number(rec.c_doctype_id) || Number(rec.c_doctypetarget_id) || null, po = periodOpen(b, rec.dateacct, doctypeId);
    var fsmRec = { docStatus: status, doctypeId: doctypeId, processing: rec.processing === 'Y' ? 'Y' : 'N', periodOpen: po.open, isBackDateTrxAllowed: true, isSOTrx: rec.issotrx || 'N' };
    out.walked = true; out.doctypeId = doctypeId; out.period = po.why;
    out.legal = tid === ORDER_TABLE_ID ? FSM.legalActionsOrder(b, fsmRec) : FSM.legalActionsFor(b, tid, fsmRec);
    out.offered = out.legal.slice();
    if (opts.roleId != null) {
      var accDt = Number(rec.c_doctypetarget_id) || Number(rec.c_doctype_id) || null;   // WDocActionPanel: C_DocTypeTarget_ID first, then C_DocType_ID; no doctype = no access check (:197)
      out.accessDoctypeId = accDt; out.role = Number(opts.roleId);
      if (accDt) {
        var rc = ACC.buildRole(b, Number(opts.roleId));
        if (rc && typeof rc.checkActionAccess === 'function') out.offered = rc.checkActionAccess(Number(opts.clientId != null ? opts.clientId : rec.ad_client_id), accDt, out.legal);
      }
    }
    return out;
  }
  return { legal: legal, periodOpen: periodOpen };
});
