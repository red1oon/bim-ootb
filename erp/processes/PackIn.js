// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// processes/PackIn.js — the Pack In process of window 50005 "Pack In" (AD_Package_Imp_Proc, AD_Process 50008, Classname org.adempiere.pipo.PackIn -> legacy runs org.adempiere.pipo2.PackInProcess):
//   PackInProcess.doIt :79-158 for Record_ID = AD_Package_Imp_Proc_ID: entry 0 of the record's attachment is the 2Pack; it is walked under the SESSION context (a client admin packs data into their client,
//   pipo_packin.js client-data path), AD_Package_Imp is written in the session client, DateProcessed + P_Msg are set on the record. The browser part is asynchronous (the attachment module, the zip's
//   deflate), so doIt hands it to the host as the process's continuation (pi.then, ad_process.js runJava), which the host awaits before it shows the message, as legacy's dialog shows doIt's return.
// bim-ootb prompts/CAPEX_DASHBOARD.md §5.70 — Witness: W-TD-PACKIN-WINDOW (capex/tests/witness_td_packin_window.js).
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  var NO_ATTACHMENT = 'Please attach the pack out archive before running the process';   // PackInProcess.java :104-111, verbatim
  P.defineProcess('org.adempiere.pipo.PackIn', function (SvrProcess, X) {
    function PackInProcess() { SvrProcess.call(this); this.p_PackIn_ID = 0; }
    PackInProcess.prototype = Object.create(SvrProcess.prototype);
    PackInProcess.prototype.prepare = function () { this.p_PackIn_ID = this.getRecord_ID(); };   // :55-67 (Name / Version parameters are not declared on AD_Process 50008)
    PackInProcess.prototype.doIt = function () {
      var R = X.A.RUNTIME, A = X.A, id = this.p_PackIn_ID;
      if (!id) throw new Error('No Record');
      var rows = R.DB.query('SELECT * FROM ad_package_imp_proc WHERE ad_package_imp_proc_id=?', [id]) || [], rec = {};
      if (!rows.length) throw new Error('No Record: AD_Package_Imp_Proc ' + id);
      Object.keys(rows[0]).forEach(function (k) { rec[k.toLowerCase()] = rows[0][k]; });
      var ctx = this.getCtx(), client = this.getAD_Client_ID(), org = A.Env.getAD_Org_ID ? A.Env.getAD_Org_ID(ctx) : 0, user = this.getAD_User_ID(), role = A.Env.getAD_Role_ID ? A.Env.getAD_Role_ID(ctx) : 0;
      var tableId = (R.DB.query("SELECT ad_table_id AS t FROM ad_table WHERE lower(tablename)='ad_package_imp_proc'") || [])[0];
      var cx = { tableId: tableId ? Number(tableId.t != null ? tableId.t : tableId.T) : 50008, tableName: 'AD_Package_Imp_Proc', recordId: id, recordUU: rec.ad_package_imp_proc_uu || null };
      var name = rec.name, oldDate = rec.dateprocessed == null ? null : rec.dateprocessed, oldMsg = rec.p_msg == null ? null : rec.p_msg;
      R.log('§PACKIN-PROCESS record=' + id + ' name=' + JSON.stringify(name) + ' client=' + client + ' org=' + org + ' user=' + user + ' (AD_Process 50008, continuation handed to the host)');
      this.m_pi.then = function () {
        var AT0 = global.__idmpAttach, PE = global.PluginEngine;
        if (!AT0 || !PE || !PE.packInClient) return Promise.resolve({ ok: false, summary: 'Pack In needs the attachment module and the plugin engine of this page' });
        return AT0.load().then(function (AT) {
          var host = AT0.host(), att = AT && AT.lookup(host, cx);
          if (!att) return { ok: true, summary: NO_ATTACHMENT, commitOps: [] };   // :104-106 returns the message (not an error)
          return AT.load(att).then(function (st) {
            var ent = st.entries[0];
            if (!ent) return { ok: true, summary: NO_ATTACHMENT, commitOps: [] };   // :108-111
            var bytesP = ent.data ? Promise.resolve(ent.data) : (AT.bytes ? AT.bytes(ent) : Promise.reject(new Error('attachment entry has no bytes')));
            return bytesP.then(function (bytes) {
              return PE.packInClient({ name: name || ent.name, bytes: bytes, clientId: client, orgId: org, userId: user, roleId: role, procId: id }).then(function (r) {
                var d = new Date(), pd = function (n) { return ('0' + n).slice(-2); }, now = d.getFullYear() + '-' + pd(d.getMonth() + 1) + '-' + pd(d.getDate()) + ' ' + pd(d.getHours()) + ':' + pd(d.getMinutes()) + ':' + pd(d.getSeconds());   // local clock (new Timestamp(System.currentTimeMillis()) on the server; never the UTC day, §5.33)
                // :144-150 / :152-155: DateProcessed + P_Msg on the record, success or not (the record is a window row: one signed update through the host)
                var ops = [{ op_type: 'CRUD_UPDATE', key: 'ad_package_imp_proc', table: 'ad_package_imp_proc', verb: 'update', id: id,
                  changes: { dateprocessed: { old: oldDate, new: r.ok ? now : oldDate }, p_msg: { old: oldMsg, new: r.summary } } }];
                if (!r.ok) delete ops[0].changes.dateprocessed;
                return { ok: r.ok, summary: r.summary, commitOps: ops };
              });
            });
          });
        });
      };
      return 'Pack In ' + (name || '') + ' ...';
    };
    return PackInProcess;
  }, { harm: 'writes' });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
