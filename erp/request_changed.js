// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-25 "The desktop processor", build step 3 (status move + History). Witness: viewer/tests/witness_mission_processor.js (W-MISSION-PREPARE, Q7).
// ISSUE: a Request changes (here: its Status moves New -> Prepared) and legacy writes its History: one R_RequestAction row that holds the PREVIOUS value of every column that changed.
//        The Kernel's R_Request save rules (erp/model_master.js requestBefore) port only the "Current Info" block; the change log (R2 there) is not ported. This is ONE small function that does it on a
//        plain sql.js database; WO-27 will make it the Kernel's generic handler (the generic save layer calls it from requestBefore instead of the caller calling it by hand).
// requestChanged(db, requestId, changes[, o]) -> { ok, error?, action_id, update_id, changed:[col...], null_columns }
//   changes = { <column>: <new value>, ... } (column names as in the Kernel table, any case). Nothing is written when no tracked column changes (legacy: `if (r.is_Changed()) ra.saveEx()`).
//   o = { now:'YYYY-MM-DD HH:MM:SS', user:<AD_User_ID>, alloc:function(table, idCol)->id, uu:function()->uuid, update_uu:<uuid of the R_RequestUpdate row> }  (all optional)
// WHAT LEGACY DOES (org.adempiere.base/src/org/, read 2026-11-28):
//   adempiere/base/event/RequestEventHandler.java beforeSaveRequest :109-219 — on a CHANGE (not a new request) `MRequestAction ra = new MRequestAction(r, false)` (:118) copies only client, org and R_Request_ID
//     (compiere/model/MRequestAction.java:77-82); each tracked column is passed to checkChange (:242-262): changed -> the OLD value is put in the action (`set_ValueNoCheck`), or, when the old value was NULL,
//     the column NAME is appended to NullColumns (`addNullColumn`, MRequestAction.java:87-93, ';'-joined); the list is :120-186, in that order. `if (r.is_Changed()) ra.saveEx()` (:188-189).
//     R_RequestAction has NO CloseDate column: a changed CloseDate leaves only its NullColumns entry (set_ValueNoCheck of an unknown column stores nothing).
//   compiere/model/MRequest.java beforeSave :725-805 runs BEFORE the event, so its effects are part of "changed": status Open -> StartDate if empty, CloseDate cleared; status Closed -> CloseDate if empty;
//     status FinalClose -> Processed = Y (:756-770).
//   The same handler's "Current Info" block (:198-215) runs when the status or another notified column changed: DateLastAction = the row's Updated (before this save stamps it), LastResult = Result,
//     ConfidentialTypeEntry = ConfidentialType, EndTime / R_StandardResponse_ID / R_MailText_ID / Result cleared. The Kernel's requestBefore does the same for a Result (model_master.js requestCurrentInfo).
//   A REQUEST THAT CARRIES A RESULT (WO-31; read 2026-11-28): legacy does NOT refuse a change of such a request. After the History row (:188-189) `MRequestUpdate update = new MRequestUpdate(r); if (update.isNewInfo()) update.saveEx();`
//     (:192-194) — isNewInfo = `getResult() != null` (MRequestUpdate.java) — writes one R_RequestUpdate row copied from the request (every non-standard, non-key, non-UU column of R_RequestUpdate that the request has:
//     ConfidentialTypeEntry, StartTime, EndTime, QtySpent, QtyInvoiced, M_ProductSpent_ID, Result; ConfidentialTypeEntry defaults to 'A' = Public, MRequestUpdate.beforeSave), and the Current Info block (:198-215) then runs
//     (`update != null || sendInfo.size() > 0`) and clears Result. So a Standard Response pasted into Result (CalloutRequest.copyResponse :88-103) is carried into an Update row by the first change of the request. (On a NEW
//     request legacy already wrote that row, MRequest.afterSave :827-831; creating requests is not this function.) The Kernel does the same here, in the same savepoint as the History row.
//   NOT PORTED, refused by name (never silently half-done): a change of SalesRep_ID (:131-154 writes a transfer message through Msg/MUser). Notifications (sendNotices :204) are not sent.
// Everything runs inside one SAVEPOINT: a failure rolls the request and its History back together.
// LOG: §REQ_CHANGED request= changed=[...] null_columns= action= (and §REQ_CHANGED_REFUSED request= why=)
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RequestChanged = factory();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // RequestEventHandler.java :120-186, in the order of the checkChange calls (legacy column names; used verbatim in NullColumns)
  var TRACKED = ['R_RequestType_ID', 'R_Group_ID', 'R_Category_ID', 'R_Status_ID', 'R_Resolution_ID', 'SalesRep_ID', 'AD_Role_ID', 'Priority', 'PriorityUser', 'IsEscalated', 'ConfidentialType', 'Summary',
    'IsSelfService', 'C_BPartner_ID', 'AD_User_ID', 'C_Project_ID', 'A_Asset_ID', 'C_Order_ID', 'C_Invoice_ID', 'M_Product_ID', 'C_Payment_ID', 'M_InOut_ID', 'M_RMA_ID', 'IsInvoiced', 'C_Activity_ID',
    'DateNextAction', 'M_ProductSpent_ID', 'QtySpent', 'QtyInvoiced', 'StartDate', 'CloseDate', 'TaskStatus', 'DateStartPlan', 'DateCompletePlan'];

  function _two(n) { return (n < 10 ? '0' : '') + n; }
  function _now() { var d = new Date(); return d.getFullYear() + '-' + _two(d.getMonth() + 1) + '-' + _two(d.getDate()) + ' ' + _two(d.getHours()) + ':' + _two(d.getMinutes()) + ':' + _two(d.getSeconds()); }   // legacy stamps server-local time
  function _uu() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function _rows(db, sql, p) { var r = db.exec(sql, p || []); if (!r.length) return []; var cols = r[0].columns; return r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c.toLowerCase()] = v[i]; }); return o; }); }
  function _empty(v) { return v == null || v === ''; }
  function _same(a, b) { return (_empty(a) && _empty(b)) || String(a) === String(b); }
  function _log(s) { if (typeof console !== 'undefined') console.log(s); }
  function _refuse(id, why) { _log('§REQ_CHANGED_REFUSED request=' + id + ' why=' + why); return { ok: false, error: why }; }

  function requestChanged(db, id, changes, o) {
    o = o || {}; changes = changes || {};
    var rows = _rows(db, 'SELECT * FROM r_request WHERE r_request_id=?', [id]);
    if (!rows.length) return _refuse(id, 'no such request');
    var old = rows[0], now = o.now || _now(), neu = {}, k;
    Object.keys(old).forEach(function (c) { neu[c] = old[c]; });
    for (k in changes) if (Object.prototype.hasOwnProperty.call(changes, k)) { if (!(k.toLowerCase() in old)) return _refuse(id, 'unknown column ' + k); neu[k.toLowerCase()] = changes[k]; }
    if (!_same(neu.salesrep_id, old.salesrep_id)) return _refuse(id, 'SalesRep_ID transfer is not ported (RequestEventHandler.java :131-154)');
    var hasResult = !_empty(neu.result);   // MRequestUpdate.isNewInfo (getResult() != null)
    // MRequest.beforeSave :756-770 (the status rules; it runs before the change log, so what it sets is logged too)
    var st = _empty(neu.r_status_id) ? null : _rows(db, 'SELECT * FROM r_status WHERE r_status_id=?', [neu.r_status_id])[0];
    if (st) {
      if (st.isopen === 'Y') { if (_empty(neu.startdate)) neu.startdate = now; if (!_empty(neu.closedate)) neu.closedate = null; }
      if (st.isclosed === 'Y' && _empty(neu.closedate)) neu.closedate = now;
      if (st.isfinalclose === 'Y') neu.processed = 'Y';
    }
    // RequestEventHandler.beforeSaveRequest :120-186 -> checkChange :242-262
    var haveCols = {}; _rows(db, 'PRAGMA table_info(r_requestaction)').forEach(function (c) { haveCols[String(c.name).toLowerCase()] = 1; });
    var ra = {}, nulls = [], changed = [];
    TRACKED.forEach(function (name) {
      var c = name.toLowerCase();
      if (_same(neu[c], old[c])) return;
      changed.push(name);
      if (_empty(old[c])) nulls.push(name);                 // addNullColumn
      else if (haveCols[c]) ra[c] = old[c];                  // set_ValueNoCheck(column, old value)
    });
    if (!changed.length && !hasResult) { _log('§REQ_CHANGED request=' + id + ' changed=[] null_columns= action=none (nothing tracked changed: no History row)'); return { ok: true, action_id: null, update_id: null, changed: [], null_columns: '' }; }
    // the "Current Info" block :198-215 (a notified column changed: here the Status)
    var notified = changed.indexOf('R_Status_ID') >= 0 || changed.indexOf('R_RequestType_ID') >= 0 || changed.indexOf('R_Group_ID') >= 0 || changed.indexOf('R_Category_ID') >= 0 || changed.indexOf('R_Resolution_ID') >= 0 ||
      changed.indexOf('PriorityUser') >= 0 || changed.indexOf('IsEscalated') >= 0;
    var updRow = null;   // :192-194 MRequestUpdate(r) — taken BEFORE the reset below, from the request as it is saved
    if (hasResult) {
      var haveUpd = {}; _rows(db, 'PRAGMA table_info(r_requestupdate)').forEach(function (c) { haveUpd[String(c.name).toLowerCase()] = 1; });
      var STD = { r_requestupdate_id: 1, ad_client_id: 1, ad_org_id: 1, isactive: 1, created: 1, createdby: 1, updated: 1, updatedby: 1, r_request_id: 1, r_requestupdate_uu: 1 };
      updRow = {}; Object.keys(haveUpd).forEach(function (c) { if (!STD[c] && c in neu) updRow[c] = neu[c]; });
      if (_empty(updRow.confidentialtypeentry)) updRow.confidentialtypeentry = 'A';   // MRequestUpdate.beforeSave: PublicInformation
    }
    if (notified || hasResult) { neu.datelastaction = old.updated; neu.lastresult = neu.result; neu.confidentialtypeentry = neu.confidentialtype; neu.endtime = null; neu.r_standardresponse_id = null; neu.r_mailtext_id = null; neu.result = null; }
    neu.updated = now; if (o.user != null) neu.updatedby = o.user;
    var alloc = o.alloc || function (table, idCol) { var m = Number((db.exec('SELECT COALESCE(MAX("' + idCol + '"),0) FROM "' + table + '"')[0].values[0][0]) || 0); return Math.max(m, 989999) + 1; };
    var uu = o.uu || _uu;
    db.run('SAVEPOINT req_changed');
    try {
      var aid = null;
      if (changed.length) {   // :188-189 `if (r.is_Changed()) ra.saveEx()`
        aid = alloc('r_requestaction', 'r_requestaction_id');
        var cols = ['r_requestaction_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'r_request_id', 'nullcolumns', 'r_requestaction_uu'],
          vals = [aid, old.ad_client_id, old.ad_org_id, 'Y', now, o.user != null ? o.user : old.updatedby, now, o.user != null ? o.user : old.updatedby, id, nulls.length ? nulls.join(';') : null, uu()];
        Object.keys(ra).forEach(function (c) { cols.push(c); vals.push(ra[c]); });
        db.run('INSERT INTO r_requestaction (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', vals);
      }
      var uid = null;
      if (updRow) {
        uid = alloc('r_requestupdate', 'r_requestupdate_id');
        var ucols = ['r_requestupdate_id', 'ad_client_id', 'ad_org_id', 'isactive', 'created', 'createdby', 'updated', 'updatedby', 'r_request_id', 'r_requestupdate_uu'],
          uvals = [uid, old.ad_client_id, old.ad_org_id, 'Y', now, o.user != null ? o.user : old.updatedby, now, o.user != null ? o.user : old.updatedby, id, o.update_uu || uu()];   // WO-15: o.update_uu = the UU the caller gives the Update row (a site report's own id: HQ de-duplicates on it)
        Object.keys(updRow).forEach(function (c) { ucols.push(c); uvals.push(updRow[c]); });
        db.run('INSERT INTO r_requestupdate (' + ucols.join(',') + ') VALUES (' + ucols.map(function () { return '?'; }).join(',') + ')', uvals);
      }
      var sets = [], params = [];
      Object.keys(neu).forEach(function (c) { if (c === 'r_request_id' || _same(neu[c], old[c]) && !(c === 'updated')) return; sets.push('"' + c + '"=?'); params.push(neu[c]); });
      params.push(id);
      db.run('UPDATE r_request SET ' + sets.join(',') + ' WHERE r_request_id=?', params);
      db.run('RELEASE req_changed');
      _log('§REQ_CHANGED request=' + id + ' changed=[' + changed.join(',') + '] null_columns=' + nulls.join(';') + ' action=' + aid + ' update=' + uid + (updRow ? ' update_result_chars=' + String(updRow.result).length : '') + ' previous=' + JSON.stringify(ra));
      return { ok: true, action_id: aid, update_id: uid, changed: changed, null_columns: nulls.join(';'), previous: ra };
    } catch (e) {
      try { db.run('ROLLBACK TO req_changed'); db.run('RELEASE req_changed'); } catch (e2) { /* nothing open */ }
      return _refuse(id, 'write failed: ' + (e && e.message));
    }
  }

  return { requestChanged: requestChanged, TRACKED: TRACKED };
});
