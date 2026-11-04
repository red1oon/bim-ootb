// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportInventory.js - org.compiere.process.ImportInventory, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportInventory.java, 586 lines; AD_Process 219 Import_Inventory, table I_Inventory = AD_Table 572).
// bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md section 37 (branch blind stocktake) - Witness: W-IMPORT-INVENTORY (erp/tests/witness_import_inventory.js). Pattern: processes/ImportPayment.js (working copies of the rows, one JS step per Java statement).
// Steps in legacy order: (1) the SQL phase :139-344, (2) the inventory loop :353-485 (ONE MInventory header per Warehouse / DocType / day / internal-use flag, ONE MInventoryLine per row with QtyBook, QtyCount, QtyInternalUse COPIED FROM THE ROW :422-424;
//   the row is marked imported :436-440; DocAction, when given, completes each header :379-390, :460-468), (3) the closing "not imported" reset and the answer logs :491-499.
// QtyBook is NOT computed here (legacy: the importer supplies it). Who supplies it in the branch stocktake is HQ's Day Close step (section 37.2 point 5a), never this process.
// NAMED twin decisions: (a) a parameter not sent reaches the process as NULL: AD_Client_ID takes the session client (Java reads it from the dialog, always sent), AD_Org_ID 0, DeleteOldImported its AD_Process_Para default.
//   (b) NOT PORTED, refused by name (never silent): IsUpdateCosting=Y (updateCosting :524-572, MCost) and a row with Lot/SerNo on an instance-attribute product (generateASI :503-522). (c) an exception of the loop fails the process (:486-489 AdempiereException): the
//   caller's Trx rolls back, as legacy's.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ImportInventory', function (SvrProcess, X) {
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }

    function ImportInventory() {
      SvrProcess.call(this);
      this.p_AD_Client_ID = 0; this.p_AD_Org_ID = 0; this.p_M_Locator_ID = 0; this.p_MovementDate = null; this.p_DeleteOldImported = false; this.p_UpdateCosting = false;
      this.p_C_AcctSchema_ID = 0; this.p_M_CostType_ID = 0; this.p_M_CostElement_ID = 0; this.p_AD_OrgTrx_ID = 0; this.m_docAction = null; this.p_C_DocType_ID = 0;          // :63-90
    }
    ImportInventory.prototype = Object.create(SvrProcess.prototype);

    // -- prepare :94-129 -----------------------------------------------------------------------------------------
    ImportInventory.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 219, seen = {};
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv == null) continue;                                                                                   // :101 getParameter() == null : nothing
        seen[name] = 1;
        if (name === 'AD_Client_ID') this.p_AD_Client_ID = para[i].getParameterAsInt();                              // :102-103
        else if (name === 'AD_Org_ID') this.p_AD_Org_ID = para[i].getParameterAsInt();                              // :104-105
        else if (name === 'M_Locator_ID') this.p_M_Locator_ID = para[i].getParameterAsInt();                        // :106-107
        else if (name === 'MovementDate') this.p_MovementDate = String(pv).slice(0, 10);                            // :108-109
        else if (name === 'DeleteOldImported') this.p_DeleteOldImported = 'Y' === pv;                               // :110-111
        else if (name === 'IsUpdateCosting') this.p_UpdateCosting = 'Y' === pv;                                     // :112-113
        else if (name === 'C_AcctSchema_ID') this.p_C_AcctSchema_ID = para[i].getParameterAsInt();                  // :114-115
        else if (name === 'M_CostType_ID') this.p_M_CostType_ID = para[i].getParameterAsInt();                      // :116-117
        else if (name === 'M_CostElement_ID') this.p_M_CostElement_ID = para[i].getParameterAsInt();                // :118-119
        else if (name === 'AD_OrgTrx_ID') this.p_AD_OrgTrx_ID = para[i].getParameterAsInt();                        // :120-121
        else if (name === 'DocAction') this.m_docAction = pv;                                                       // :122-123
        else if (name === 'C_DocType_ID') this.p_C_DocType_ID = para[i].getParameterAsInt();                        // :124-125
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportInventory ' + name);                                           // MProcessPara.validateUnknownParameter :127
      }
      if (!seen.AD_Client_ID) { this.p_AD_Client_ID = Number(this.getAD_Client_ID()); trx.say('§PROC-PARAM ImportInventory AD_Client_ID=' + this.p_AD_Client_ID + ' source=session client (not sent)'); }
      if (!seen.DeleteOldImported) { var d2 = dflt('DeleteOldImported'); this.p_DeleteOldImported = 'Y' === d2; }
    };

    // -- doIt :137-501 ---------------------------------------------------------------------------------------------
    ImportInventory.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A, C = this.p_AD_Client_ID, O = this.p_AD_Org_ID;
      try { trx.q('SELECT 1 AS x FROM i_inventory LIMIT 1'); } catch (e) { throw new Error('I_Inventory has no physical table on this host (AdImportTables.ensure, POS_PLUGIN_LOCAL_FIRST section 37)'); }
      trx.say('§IMPORT_INVENTORY_START M_Locator_ID=' + this.p_M_Locator_ID + ' MovementDate=' + this.p_MovementDate + ' docAction=' + this.m_docAction);   // :139-140
      if (this.p_UpdateCosting) throw new Error('Import Inventory IsUpdateCosting=Y (updateCosting :524-572, MCost) not ported - named');                 // (b)
      var nowTs = trx.env.now || (trx.env.nowMillis != null ? new Date(trx.env.nowMillis).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' '));
      var today = String(trx.env.date || nowTs).slice(0, 10);
      var R = [];
      function load() { R = trx.find('i_inventory', {}).map(function (r) { return { id: r.i_inventory_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() { R.forEach(function (w) { var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; }); if (!Object.keys(ch).length) return; trx.update('i_inventory', trx.get('i_inventory', w.id), ch); w.base = Object.assign({}, trx.get('i_inventory', w.id)); }); }
      function cc(r) { return eq(r.ad_client_id, C); }                                                          // clientCheck :163
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                      // I_IsImported<>'Y'
      function step(label, where, set) {
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportInventory ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        return ups.length;
      }
      function err(label, text, where) {                                                                         // SET I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'...' WHERE <where> AND I_IsImported<>'Y' AND client
        var no = step(label, function (r) { return where(r) && notY(r) && cc(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_INVENTORY_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params.map(function (v) { return v === undefined ? null : v; })); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      var no;

      //	****	Prepare	****
      load();
      if (this.p_DeleteOldImported) {                                                                            // :167-174
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_inventory', trx.get('i_inventory', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
        trx.say('§IMPORT_INVENTORY_DELETE_OLD ' + del.length);
      }
      var md = this.p_MovementDate;
      no = step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }, function (r) {  // :176-192 Set Client, Org, Location, IsActive, Created/Updated
        var ch = { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_org_id: nz(r.ad_org_id) === 0 ? O : r.ad_org_id,
          isactive: r.isactive != null ? r.isactive : 'Y', created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0, updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0,
          i_errormsg: ' ', m_warehouse_id: null, i_isimported: 'N' };
        if (md != null) ch.movementdate = r.movementdate != null ? r.movementdate : md + ' 00:00:00';
        return ch; });
      trx.say('§IMPORT_INVENTORY_RESET ' + no);

      err('Invalid Org', 'ERR=Invalid Org, ', function (r) {                                                      // :196-203
        return r.ad_org_id == null || Number(r.ad_org_id) === 0 || trx.q("SELECT 1 AS x FROM ad_org oo WHERE oo.ad_org_id=? AND (oo.issummary='Y' OR oo.isactive='N')", [r.ad_org_id]).length > 0; });

      //	Document Type :205-219
      step('Set DocType', function (r) { return r.c_doctype_id == null && r.doctypename != null && notY(r) && cc(r); }, function (r) {
        return { c_doctype_id: scalar("SELECT d.c_doctype_id FROM c_doctype d WHERE d.name=? AND d.docbasetype='MMI' AND ?=d.ad_client_id", [r.doctypename, r.ad_client_id]) }; });
      err('Invalid DocType', 'ERR=Invalid DocType, ', function (r) { return r.c_doctype_id == null && r.doctypename != null; });

      //	Locator :221-251
      step('Set Locator from Value', function (r) { return r.m_locator_id == null && r.locatorvalue != null && notY(r) && cc(r); }, function (r) {
        return { m_locator_id: scalar('SELECT MAX(m_locator_id) FROM m_locator l WHERE ?=l.value AND ?=l.ad_client_id', [r.locatorvalue, r.ad_client_id]) }; });
      step('Set Locator from X,Y,Z', function (r) { return r.m_locator_id == null && r.x != null && r.y != null && r.z != null && notY(r) && cc(r); }, function (r) {
        return { m_locator_id: scalar('SELECT MAX(m_locator_id) FROM m_locator l WHERE ?=l.x AND ?=l.y AND ?=l.z AND ?=l.ad_client_id', [r.x, r.y, r.z, r.ad_client_id]) }; });
      if (this.p_M_Locator_ID !== 0) { var pl = this.p_M_Locator_ID; step('Set Locator from Parameter', function (r) { return r.m_locator_id == null && notY(r) && cc(r); }, function () { return { m_locator_id: pl }; }); }
      err('No Location', 'ERR=No Location, ', function (r) { return r.m_locator_id == null; });

      //	Set M_Warehouse_ID :253-266
      step('Set Warehouse', function (r) { return r.m_locator_id != null && notY(r) && cc(r); }, function (r) { return { m_warehouse_id: scalar('SELECT m_warehouse_id FROM m_locator l WHERE ?=l.m_locator_id', [r.m_locator_id]) }; });
      err('No Warehouse', 'ERR=No Warehouse, ', function (r) { return r.m_warehouse_id == null; });
      // IDEMPIERE-590 do not allow locator/wh from different org :268-275 (ported as written: the inner AND belongs to the subselect, so a NULL answer changes nothing)
      step('Locator not from Org', function (r) {
        var o = notY(r) ? scalar('SELECT ad_org_id FROM m_warehouse WHERE m_warehouse_id=? AND ?=ad_client_id', [r.m_warehouse_id, r.ad_client_id]) : null;   // the subselect carries "I_IsImported<>'Y' AND client"
        return ne(r.ad_org_id, o); },
        function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, 'ERR=Locator not from Org, ') }; });

      //	Product :277-298
      step('Set Product from Value', function (r) { return r.m_product_id == null && r.value != null && notY(r) && cc(r); }, function (r) {
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.value AND ?=p.ad_client_id', [r.value, r.ad_client_id]) }; });
      step('Set Product from UPC', function (r) { return r.m_product_id == null && r.upc != null && notY(r) && cc(r); }, function (r) {
        return { m_product_id: scalar('SELECT MAX(m_product_id) FROM m_product p WHERE ?=p.upc AND ?=p.ad_client_id', [r.upc, r.ad_client_id]) }; });
      err('No Product', 'ERR=No Product, ', function (r) { return r.m_product_id == null; });

      //	Charge :300-313
      step('Set Charge', function (r) { return r.c_charge_id == null && r.chargename != null && notY(r) && cc(r); }, function (r) {
        return { c_charge_id: scalar('SELECT c_charge_id FROM c_charge p WHERE ?=p.name AND ?=p.ad_client_id', [r.chargename, r.ad_client_id]) }; });
      err('Invalid Charge', 'ERR=Invalid Charge, ', function (r) { return r.c_charge_id == null && r.chargename != null; });

      err('No Qty Count or Internal Use', 'ERR=No Qty Count or Internal Use, ', function (r) { return r.qtycount == null && r.qtyinternaluse == null; });                                   // :315-322
      err('Excluding quantities', 'ERR=Excluding quantities, ', function (r) { return nz(r.qtyinternaluse) !== 0 && (nz(r.qtycount) !== 0 || nz(r.qtybook) !== 0); });                      // :324-331
      err('Required charge', 'ERR=Required charge, ', function (r) { return nz(r.qtyinternaluse) !== 0 && nz(r.c_charge_id) === 0; });                                                      // :333-340
      flush();                                                                                                    // commitEx() :344

      /*********************************************************************/
      var noInsert = 0, noInsertLine = 0, inventory = null, xWh = -1, xDt = -1, xDay = null, xIu = -1, line = 0;
      function day(v) { return v == null ? today : String(v).slice(0, 10); }
      function complete(inv) {                                                                                    // :383-390 / :461-468
        if (this_docAction == null || !String(this_docAction).length) return;
        var pr = ML().processIt(trx, 'm_inventory', inv.m_inventory_id, this_docAction);
        if (!pr || !pr.ok) throw new Error('Inventory Process Failed: ' + inv.m_inventory_id + ' - ' + (pr && pr.msg));                                                                   // :386 IllegalStateException
      }
      var this_docAction = this.m_docAction;
      var todo = trx.find('i_inventory', {}).filter(function (r) { return String(r.i_isimported) === 'N' && eq(r.ad_client_id, C); })   // :354-356 ORDER BY M_Warehouse_ID, TRUNC(MovementDate), I_Inventory_ID
        .sort(function (a, b) { return nz(a.m_warehouse_id) - nz(b.m_warehouse_id) || (day(a.movementdate) < day(b.movementdate) ? -1 : day(a.movementdate) > day(b.movementdate) ? 1 : 0) || nz(a.i_inventory_id) - nz(b.i_inventory_id); });
      trx.say('§IMPORT_INVENTORY_LOOP rows=' + todo.length);
      for (var i = 0; i < todo.length; i++) {
        var imp = todo[i], mdate = day(imp.movementdate), iu = nz(imp.qtyinternaluse) !== 0 ? 1 : 0;
        if (inventory == null || nz(imp.m_warehouse_id) !== xWh || nz(imp.c_doctype_id) !== xDt || mdate !== xDay || iu !== xIu) {      // :373-377
          if (inventory != null) complete(inventory);
          var hf = { ad_client_id: imp.ad_client_id, ad_org_id: imp.ad_org_id, description: 'I ' + imp.m_warehouse_id + ' ' + mdate + ' 00:00:00.0', m_warehouse_id: imp.m_warehouse_id, movementdate: mdate + ' 00:00:00' };   // :392-398
          if (nz(imp.c_doctype_id) > 0) hf.c_doctype_id = imp.c_doctype_id;                                       // :393-394
          var hs = ML().save(trx, 'm_inventory', null, ML().newPO(trx, 'm_inventory', hf));                       // inventory.save() :402
          if (!hs.ok) { var li = trx.get('i_inventory', imp.i_inventory_id); ML().save(trx, 'i_inventory', li, { i_errormsg: String(hs.error) }); trx.say('§IMPORT_INVENTORY_HEADER_REFUSED row=' + imp.i_inventory_id + ' :: ' + String(hs.error).replace(/\s+/g, ' ').slice(0, 200)); break; }   // :404-410
          inventory = hs.row; xWh = nz(imp.m_warehouse_id); xDt = nz(imp.c_doctype_id); xDay = mdate; xIu = iu; noInsert++;                  // :412-416
        }
        var product = trx.get('m_product', imp.m_product_id) || {};
        if ((imp.lot != null && String(imp.lot).length) || (imp.serno != null && String(imp.serno).length)) {      // generateASI :505-520
          if (String(product.isinstanceattribute) === 'Y') throw new Error('Import Inventory Lot/SerNo -> attribute set instance (generateASI :503-522) not ported - named');
        }
        var lf = { ad_client_id: inventory.ad_client_id, ad_org_id: inventory.ad_org_id, m_inventory_id: inventory.m_inventory_id, m_locator_id: imp.m_locator_id, m_product_id: imp.m_product_id, m_attributesetinstance_id: 0,
          qtybook: nz(imp.qtybook), description: imp.description, c_charge_id: imp.c_charge_id, inventorytype: nz(imp.c_charge_id) > 0 ? 'C' : 'D' };                                  // :422-430
        if (nz(imp.qtycount) !== 0) lf.qtycount = nz(imp.qtycount);                                               // MInventoryLine ctor :150-151
        if (nz(imp.qtyinternaluse) !== 0) lf.qtyinternaluse = nz(imp.qtyinternaluse);                             // :152-153
        var ls = ML().save(trx, 'm_inventoryline', null, ML().newPO(trx, 'm_inventoryline', lf));                  // line.save() :434
        if (ls.ok) {
          var live = trx.get('i_inventory', imp.i_inventory_id), s2 = ML().save(trx, 'i_inventory', live, { i_isimported: 'Y', m_inventory_id: ls.row.m_inventory_id, m_inventoryline_id: ls.row.m_inventoryline_id, processed: 'Y' });   // :436-440
          if (!s2.ok) throw new Error('SaveError i_inventory: ' + s2.error);
          noInsertLine++;                                                                                         // :441
        } else {
          var lv = trx.get('i_inventory', imp.i_inventory_id); ML().save(trx, 'i_inventory', lv, { i_errormsg: String(ls.error) });                                               // :447-454
          trx.say('§IMPORT_INVENTORY_LINE_REFUSED row=' + imp.i_inventory_id + ' :: ' + String(ls.error).replace(/\s+/g, ' ').slice(0, 200)); break;
        }
      }
      if (inventory != null) complete(inventory);                                                                 // :460-468

      //	Set Error to indicator to not imported (:491-496)
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');                                                       // :496
      this.addLog(0, null, A.toBD(String(noInsert)), '@M_Inventory_ID@: @Inserted@');                              // :498
      this.addLog(0, null, A.toBD(String(noInsertLine)), '@M_InventoryLine_ID@: @Inserted@');                      // :499
      trx.say('§IMPORT_INVENTORY client=' + C + ' org=' + O + ' docAction=' + this.m_docAction + ' inventories=' + noInsert + ' lines=' + noInsertLine + ' errors=' + no);
      return '';                                                                                                  // :500
    };
    return ImportInventory;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
