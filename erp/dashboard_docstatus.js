// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// dashboard_docstatus.js — HOME "ACTIVITIES" GADGET: DOCUMENT STATUS INDICATORS (bim-compiler prompts/ERP_DEPTH_FILM.md §DASHBOARD-PARITY D3; Witness: W-DASH-DOCSTATUS).
// docstatus.zul -> DPDocumentStatus -> MDocumentStatus. getDocumentStatusIndicators (MDocumentStatus.java:141-186): active PA_DocumentStatus rows of client 0 / the session client ORDER BY SeqNo, kept when
// canAccess (:272-289: no PA_DocumentStatusAccess row = everyone; else a row matching role AND user, role with no user, or user with no role) AND the role can open its window (else its form).
// evaluate (:192-202) + getSQLFilter (:234-258): SELECT COUNT(*) FROM <table> WHERE <table>.AD_Client_ID=<client> [AND C_Project_ID] [AND AD_Org_ID] AND ( <WhereClause> ) with @#AD_Client_ID@ / @#AD_User_ID@ /
// @#AD_Role_ID@ / @#AD_Org_ID@ substituted and SysDate = the session's now, then MRole.addAccessSQL's client / org where. The SQL is BUILT FROM THE DICTIONARY - a new PA_DocumentStatus row works with zero code.
// Postgres-isms in the stored WhereClauses (SysDate, TRUNC(x)) are rewritten for SQLite; rv_unprocessed is created over the base tables the bundle HAS (the omitted ones are returned by name).
(function (global) {
  'use strict';
  var RVU = [   // adempiere.rv_unprocessed (pg_get_viewdef, 11 UNION branches): casts removed, <> ALL(ARRAY[..]) -> NOT IN, the *_UU column dropped (no indicator reads it)
    ["gl_journal", "SELECT gl_journal.ad_client_id, gl_journal.ad_org_id, gl_journal.created, gl_journal.createdby, gl_journal.updated, gl_journal.updatedby, gl_journal.isactive, gl_journal.documentno, gl_journal.datedoc, gl_journal.dateacct, 224 AS ad_table_id, gl_journal.gl_journal_id AS record_id, 'N' AS issotrx, gl_journal.posted, gl_journal.processing, gl_journal.processed, gl_journal.docstatus FROM gl_journal WHERE (gl_journal.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_invoice", "SELECT c_invoice.ad_client_id, c_invoice.ad_org_id, c_invoice.created, c_invoice.createdby, c_invoice.updated, c_invoice.updatedby, c_invoice.isactive, c_invoice.documentno, c_invoice.dateinvoiced AS datedoc, c_invoice.dateacct, 318 AS ad_table_id, c_invoice.c_invoice_id AS record_id, c_invoice.issotrx, c_invoice.posted, c_invoice.processing, c_invoice.processed, c_invoice.docstatus FROM c_invoice WHERE (c_invoice.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["m_inout", "SELECT m_inout.ad_client_id, m_inout.ad_org_id, m_inout.created, m_inout.createdby, m_inout.updated, m_inout.updatedby, m_inout.isactive, m_inout.documentno, m_inout.movementdate AS datedoc, m_inout.dateacct, 319 AS ad_table_id, m_inout.m_inout_id AS record_id, m_inout.issotrx, m_inout.posted, m_inout.processing, m_inout.processed, m_inout.docstatus FROM m_inout WHERE (m_inout.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["m_inventory", "SELECT m_inventory.ad_client_id, m_inventory.ad_org_id, m_inventory.created, m_inventory.createdby, m_inventory.updated, m_inventory.updatedby, m_inventory.isactive, m_inventory.documentno, m_inventory.movementdate AS datedoc, m_inventory.movementdate AS dateacct, 321 AS ad_table_id, m_inventory.m_inventory_id AS record_id, 'N' AS issotrx, m_inventory.posted, m_inventory.processing, m_inventory.processed, m_inventory.docstatus FROM m_inventory WHERE (m_inventory.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["m_movement", "SELECT m_movement.ad_client_id, m_movement.ad_org_id, m_movement.created, m_movement.createdby, m_movement.updated, m_movement.updatedby, m_movement.isactive, m_movement.documentno, m_movement.movementdate AS datedoc, m_movement.movementdate AS dateacct, 323 AS ad_table_id, m_movement.m_movement_id AS record_id, 'N' AS issotrx, m_movement.posted, m_movement.processing, m_movement.processed, m_movement.docstatus FROM m_movement WHERE (m_movement.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_cash", "SELECT c_cash.ad_client_id, c_cash.ad_org_id, c_cash.created, c_cash.createdby, c_cash.updated, c_cash.updatedby, c_cash.isactive, c_cash.name AS documentno, c_cash.statementdate AS datedoc, c_cash.dateacct, 407 AS ad_table_id, c_cash.c_cash_id AS record_id, 'N' AS issotrx, c_cash.posted, c_cash.processing, c_cash.processed, c_cash.docstatus FROM c_cash WHERE (c_cash.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_payment", "SELECT c_payment.ad_client_id, c_payment.ad_org_id, c_payment.created, c_payment.createdby, c_payment.updated, c_payment.updatedby, c_payment.isactive, c_payment.documentno, c_payment.datetrx AS datedoc, c_payment.datetrx AS dateacct, 335 AS ad_table_id, c_payment.c_payment_id AS record_id, 'N' AS issotrx, c_payment.posted, c_payment.processing, c_payment.processed, c_payment.docstatus FROM c_payment WHERE (c_payment.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_allocationhdr", "SELECT c_allocationhdr.ad_client_id, c_allocationhdr.ad_org_id, c_allocationhdr.created, c_allocationhdr.createdby, c_allocationhdr.updated, c_allocationhdr.updatedby, c_allocationhdr.isactive, c_allocationhdr.documentno, c_allocationhdr.datetrx AS datedoc, c_allocationhdr.datetrx AS dateacct, 735 AS ad_table_id, c_allocationhdr.c_allocationhdr_id AS record_id, 'N' AS issotrx, c_allocationhdr.posted, c_allocationhdr.processing, c_allocationhdr.processed, c_allocationhdr.docstatus FROM c_allocationhdr WHERE (c_allocationhdr.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_bankstatement", "SELECT c_bankstatement.ad_client_id, c_bankstatement.ad_org_id, c_bankstatement.created, c_bankstatement.createdby, c_bankstatement.updated, c_bankstatement.updatedby, c_bankstatement.isactive, c_bankstatement.name AS documentno, c_bankstatement.statementdate AS datedoc, c_bankstatement.statementdate AS dateacct, 392 AS ad_table_id, c_bankstatement.c_bankstatement_id AS record_id, 'N' AS issotrx, c_bankstatement.posted, c_bankstatement.processing, c_bankstatement.processed, c_bankstatement.docstatus FROM c_bankstatement WHERE (c_bankstatement.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["c_order", "SELECT c_order.ad_client_id, c_order.ad_org_id, c_order.created, c_order.createdby, c_order.updated, c_order.updatedby, c_order.isactive, c_order.documentno, c_order.dateordered AS datedoc, c_order.dateacct, 259 AS ad_table_id, c_order.c_order_id AS record_id, c_order.issotrx, c_order.posted, c_order.processing, c_order.processed, c_order.docstatus FROM c_order WHERE (c_order.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"],
    ["m_requisition", "SELECT m_requisition.ad_client_id, m_requisition.ad_org_id, m_requisition.created, m_requisition.createdby, m_requisition.updated, m_requisition.updatedby, m_requisition.isactive, m_requisition.documentno, m_requisition.datedoc, m_requisition.datedoc AS dateacct, 702 AS ad_table_id, m_requisition.m_requisition_id AS record_id, 'N' AS issotrx, m_requisition.posted, m_requisition.processing, m_requisition.processed, m_requisition.docstatus FROM m_requisition WHERE (m_requisition.docstatus NOT IN ('CO', 'CL', 'VO', 'RE'))"]
  ];
  function has(q, t) { try { return q("SELECT 1 AS x FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=?", [t]).length > 0; } catch (e) { return false; } }
  // install(db, q): (re)create the rv_unprocessed view from the branches whose base table exists. -> { included:[tables], omitted:[tables] }
  function install(db, q) {
    var inc = [], omit = [], parts = [];
    RVU.forEach(function (b) { if (has(q, b[0])) { inc.push(b[0]); parts.push(b[1]); } else omit.push(b[0]); });
    db.run('DROP VIEW IF EXISTS rv_unprocessed');
    if (parts.length) db.run('CREATE VIEW rv_unprocessed AS ' + parts.join(' UNION '));
    return { included: inc, omitted: omit };
  }
  // PG -> SQLite for the stored WhereClauses: SysDate-N, TRUNC(SysDate), TRUNC(col), SysDate
  function dialect(sql, nowIso) {
    var now = String(nowIso).replace('T', ' ').slice(0, 19);
    return sql.replace(/\bTRUNC\(\s*SYSDATE\s*\)/gi, "date('" + now + "')")
      .replace(/\bSYSDATE\s*-\s*(\d+(?:\.\d+)?)/gi, function (m, n) { return "datetime('" + now + "','-" + Math.round(Number(n) * 86400) + " seconds')"; })
      .replace(/\bSYSDATE\b/gi, "'" + now + "'")
      .replace(/\bTRUNC\(\s*([\w\.]+)\s*\)/gi, 'date($1)');
  }
  function accessWhere(access) {          // MRole.getClientWhere(false) / getOrgWhere(false), unqualified (addAccessSQL fullyQualified=false)
    var s = ''; if (!access) return s;
    if (access.clientIds && access.clientIds.length) s += access.clientIds.length === 1 ? ' AND AD_Client_ID=' + access.clientIds[0] : ' AND AD_Client_ID IN (' + access.clientIds.join(',') + ')';
    if (access.orgIds) { var o = access.orgIds.filter(function (x, i, a) { return a.indexOf(x) === i; }); s += o.length === 1 ? ' AND AD_Org_ID=' + o[0] : ' AND (AD_Org_ID IN (' + o.join(',') + '))'; }
    return s;
  }
  function canAccess(q, ds, s) {
    if (!has(q, 'pa_documentstatusaccess')) return true;
    var rows = q("SELECT * FROM pa_documentstatusaccess WHERE pa_documentstatus_id=? AND ad_client_id IN (0,?) AND isactive='Y'", [ds.pa_documentstatus_id, s.client]);
    if (!rows.length) return true;
    return rows.some(function (a) { var r = Number(a.ad_role_id || 0), u = Number(a.ad_user_id || 0); return (r === s.role && u === s.user) || (r === s.role && u === 0) || (r === 0 && u === s.user); });
  }
  function roleOpens(q, ds, s) {          // MRole.getWindowAccess / getFormAccess non-null (the role holds an active access row)
    if (Number(ds.ad_window_id) > 0) return has(q, 'ad_window_access') && q("SELECT 1 AS x FROM ad_window_access WHERE ad_role_id=? AND ad_window_id=? AND isactive='Y'", [s.role, ds.ad_window_id]).length > 0;
    if (Number(ds.ad_form_id) > 0) return has(q, 'ad_form_access') && q("SELECT 1 AS x FROM ad_form_access WHERE ad_role_id=? AND ad_form_id=? AND isactive='Y'", [s.role, ds.ad_form_id]).length > 0;
    return false;
  }
  // s = { client, user, role, now, access:{clientIds, orgIds} } -> [{id, name, count, windowId, formId, table, sql}]
  function indicators(q, s) {
    if (!has(q, 'pa_documentstatus')) return [];
    var list = q("SELECT * FROM pa_documentstatus WHERE isactive='Y' AND ad_client_id IN (0,?) ORDER BY seqno, pa_documentstatus_id", [s.client]), out = [];
    list.forEach(function (ds) {
      if (!canAccess(q, ds, s) || !roleOpens(q, ds, s)) return;
      var tn = (q('SELECT tablename FROM ad_table WHERE ad_table_id=?', [ds.ad_table_id])[0] || {}).tablename;
      if (!tn) { out.push({ id: Number(ds.pa_documentstatus_id), name: ds.name, count: null, error: 'AD_Table ' + ds.ad_table_id + ' not in this bundle' }); return; }
      var where = ' ' + tn + '.AD_Client_ID=' + s.client + (Number(ds.c_project_id) > 0 ? ' AND ' + tn + '.C_Project_ID=' + ds.c_project_id : '') + (Number(ds.ad_org_id) > 0 ? ' AND ' + tn + '.AD_Org_ID=' + ds.ad_org_id : '');
      var extra = String(ds.whereclause || '').trim(); if (extra) where += ' AND ( ' + extra + ' ) ';
      where = where.replace(/@#AD_Client_ID@/g, s.client).replace(/@#AD_User_ID@/g, s.user).replace(/@#AD_Role_ID@/g, s.role).replace(/@#AD_Org_ID@/g, 0);
      var sql = dialect('SELECT COUNT(*) AS n FROM ' + tn + ' WHERE ' + where + accessWhere(s.access), s.now), n = null, err = null;
      try { n = Number(q(sql)[0].n); } catch (e) { err = String(e.message).slice(0, 100); }
      out.push({ id: Number(ds.pa_documentstatus_id), name: ds.name, count: n, error: err, windowId: Number(ds.ad_window_id) || 0, formId: Number(ds.ad_form_id) || 0, table: tn, sql: sql });
    });
    return out;
  }
  var api = { install: install, indicators: indicators, dialect: dialect, RVU: RVU };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.DashboardDocStatus = api;
})(typeof window !== 'undefined' ? window : this);
