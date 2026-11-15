// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/ImportProduct.js - org.compiere.process.ImportProduct, verbatim (org.adempiere.base.process/src/org/compiere/process/ImportProduct.java, 694 lines; AD_Process 196 Import_Product).
// bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md section 30 - Witness: W-IMPORT-PRODUCT (erp/tests/witness_import_product.js). Pattern: processes/ImportPayment.js / ImportOrder.js.
// Steps in legacy order: (1) the SQL phase :114-418 fills defaults and marks errors on the I_Product rows, (2) the product loop :443-653 (ONE row per I_IsImported='N': NEW product = new MProduct(X_I_Product) + save,
//   KNOWN product = the raw UPDATE of :496-527, then Product_PO, then the price list version), (3) the closing "not imported" reset and the answer logs :668-679.
// FACT THIS PORT KEEPS (read from the Java, not invented): the UPDATE of an existing product (:509-545) does NOT set ImageURL (nor DescriptionURL) - ImageURL is copied FROM the product INTO an I_Product row that has none (strFieldsToCopy :85-103, loop :232-246)
//   and reaches M_Product only on INSERT (MProduct(X_I_Product) -> MProduct.java:329 setImageURL). A twin that wrote ImageURL on update would diverge from legacy.
// HOW THE SQL PHASE RUNS: as ImportPayment.js - one JS step per Java statement on in-memory working copies of the I_Product rows (same WHERE with SQL three-valued logic, same SET, the subselects run through trx.q; a subselect that returns
//   more than one row fails the statement as PostgreSQL does: printed as the shipped log line PROC-SQL-ERROR), written back to the Trx (raw UPDATE, no model events) before the PO-level loop and read again after it.
// NAMED twin decisions: (a) a parameter not sent reaches the process as NULL: Java would throw NullPointerException for AD_Client_ID (:71); the twin takes the session client (printed PROC-PARAM), DeleteOldImported takes its
//   AD_Process_Para default; M_PriceList_Version_ID 0. (b) ModelValidationEngine.fireImportValidate has no listener in the twin: not modelled. (c) the per-row rollback()/commitEx() of the error arms are the Trx
//   savepoint of the unit. (d) PO.saveNew stores an empty String as NULL as everywhere in the twin. (f) the NOT NULL set of the INSERT is checked by the port (see the comment at the insert); (e) M_Product_PO_UU / UUID update (:620-625) is the twin's own uu fill at save.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.ImportProduct', function (SvrProcess, X) {
    function ML() { return X.ML; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function ne(a, b) { return a != null && b != null && String(a) !== String(b); }                       // SQL a<>b : NULL is unknown
    function eq(a, b) { return a != null && b != null && String(a) === String(b); }                       // SQL a=b
    function cat(v, s) { return v == null ? null : String(v) + s; }                                       // SQL v||s : NULL||x is NULL
    function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b) && (a == null) === (b == null); }
    function idNum(v) { return ML().isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v); }

    function ImportProduct() { SvrProcess.call(this); this.m_AD_Client_ID = 0; this.m_deleteOldImported = false; this.p_M_PriceList_Version_ID = 0; }   // :46-52
    ImportProduct.prototype = Object.create(SvrProcess.prototype);

    // -- prepare :65-84 ---------------------------------------------------------------------------------------
    ImportProduct.prototype.prepare = function () {
      var trx = this.get_TrxName(), para = this.getParameter(), pid = this.getProcessInfo().AD_Process_ID || 196, seen = {};
      function dflt(name) { var r = trx.q('SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=? AND columnname=? AND isactive=?', [pid, name, 'Y'])[0]; return r && r.d != null && r.d !== '' ? r.d : null; }
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName(), pv = para[i].getParameter();
        if (pv != null) seen[name] = 1;
        if (name === 'AD_Client_ID') this.m_AD_Client_ID = pv == null ? 0 : para[i].getParameterAsInt();                    // :73-74
        else if (name === 'DeleteOldImported') this.m_deleteOldImported = 'Y' === pv;                                         // :75-76
        else if (name === 'M_PriceList_Version_ID') this.p_M_PriceList_Version_ID = pv == null ? 0 : para[i].getParameterAsInt();   // :77-78
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportProduct ' + name);                                                     // :80
      }
      if (!seen.AD_Client_ID) { this.m_AD_Client_ID = Number((trx.env && trx.env.clientId) || 0); trx.say('§PROC-PARAM ImportProduct AD_Client_ID=' + this.m_AD_Client_ID + ' source=session client (Java would throw NullPointerException)'); }
      if (!seen.DeleteOldImported) { var d = dflt('DeleteOldImported'); this.m_deleteOldImported = 'Y' === d; if (d != null) trx.say('§PROC-PARAM ImportProduct DeleteOldImported=' + d + ' source=AD_Process_Para default'); }
    };

    // -- doIt :110-679 -----------------------------------------------------------------------------------------
    ImportProduct.prototype.doIt = function () {
      var self = this, trx = this.get_TrxName(), A = X.A, C = this.m_AD_Client_ID, pPLV = this.p_M_PriceList_Version_ID;
      try { trx.q('SELECT 1 AS x FROM i_product LIMIT 1'); } catch (e) { throw new Error('I_Product has no physical table on this host (AdImportTables.ensure, POS_PLUGIN_LOCAL_FIRST section 30)'); }
      var nowTs = A.Env.nowStamp(trx.env);   // getDate()
      var R = [];
      function load() { R = trx.find('i_product', {}).map(function (r) { return { id: r.i_product_id, base: Object.assign({}, r), cur: Object.assign({}, r) }; }); }
      function flush() {
        R.forEach(function (w) {
          var ch = {}; Object.keys(w.cur).forEach(function (c) { if (!same(w.cur[c], w.base[c])) ch[c] = w.cur[c]; });
          if (!Object.keys(ch).length) return;
          trx.update('i_product', trx.get('i_product', w.id), ch); w.base = Object.assign({}, trx.get('i_product', w.id));
        });
      }
      function cc(r) { return eq(r.ad_client_id, C); }                                                       // clientCheck getWhereClause() :688-692
      function notY(r) { return ne(r.i_isimported, 'Y'); }                                                    // I_IsImported<>'Y'
      function isN(r) { return eq(r.i_isimported, 'N'); }
      function step(label, where, set) {                                                                      // one Java statement; an exception inside = the statement failed (PG error): nothing changes, -1
        var ups = [];
        try { R.forEach(function (w) { if (where(w.cur)) ups.push([w, set(w.cur)]); }); }
        catch (e) { trx.say('§PROC-SQL-ERROR executeUpdate -> -1: ' + ((e && e.message) || e) + ' :: ImportProduct ' + label); return -1; }
        ups.forEach(function (u) { Object.keys(u[1]).forEach(function (c) { u[0].cur[c] = u[1][c]; }); });
        return ups.length;
      }
      function err(label, text, where, guard) {                                                               // I_IsImported='E', I_ErrorMsg=I_ErrorMsg||'...'
        var no = step(label, function (r) { return where(r) && guard(r) && cc(r); }, function (r) { return { i_isimported: 'E', i_errormsg: cat(r.i_errormsg, text) }; });
        if (no !== 0) trx.say('§IMPORT_PRODUCT_WARN ' + label + '=' + no + ' (log.warning)');
        return no;
      }
      function scalar(sql, params) { var rs = trx.q(sql, params.map(function (v) { return v === undefined ? null : v; })); if (rs.length > 1) throw new Error('more than one row returned by a subquery used as an expression'); return rs.length ? rs[0][Object.keys(rs[0])[0]] : null; }
      var no;

      //	****	Prepare	****
      load();
      if (this.m_deleteOldImported) {                                                                         // :118-125
        var del = R.filter(function (w) { return eq(w.cur.i_isimported, 'Y') && cc(w.cur); });
        del.forEach(function (w) { trx.del('i_product', trx.get('i_product', w.id)); }); R = R.filter(function (w) { return del.indexOf(w) < 0; });
      }
      step('Reset', function (r) { return ne(r.i_isimported, 'Y') || r.i_isimported == null; }, function (r) {   // :127-143 (no clientCheck here, as Java)
        return { ad_client_id: r.ad_client_id != null ? r.ad_client_id : C, ad_org_id: r.ad_org_id != null ? r.ad_org_id : 0, isactive: r.isactive != null ? r.isactive : 'Y',
                 created: r.created != null ? r.created : nowTs, createdby: r.createdby != null ? r.createdby : 0, updated: r.updated != null ? r.updated : nowTs, updatedby: r.updatedby != null ? r.updatedby : 0,
                 producttype: r.producttype != null ? r.producttype : 'I', i_errormsg: ' ', i_isimported: 'N' }; });

      //	Set Optional BPartner (:145-162)
      step('BPartner', function (r) { return r.c_bpartner_id == null && notY(r) && cc(r); }, function (r) {
        return { c_bpartner_id: scalar('SELECT c_bpartner_id FROM c_bpartner p WHERE ?=p.value AND ?=p.ad_client_id', [r.bpartner_value, r.ad_client_id]) }; });
      err('Invalid BPartner', 'ERR=Invalid BPartner,', function (r) { return r.c_bpartner_id == null && r.bpartner_value != null; }, notY);

      //	****	Find Product (:163-212)
      err('Not Unique UPC (existing)', 'ERR=more than one product with this UPC,', function (r) {
        return trx.q('SELECT 1 AS x FROM m_product mp JOIN m_product mp2 ON mp.ad_client_id=mp2.ad_client_id AND mp.upc=mp2.upc AND mp.m_product_id<>mp2.m_product_id WHERE ?=mp.ad_client_id AND ?=mp.upc', [r.ad_client_id, r.upc]).length > 0; }, notY);
      step('Product Existing UPC', function (r) { return r.m_product_id == null && isN(r) && cc(r); }, function (r) {
        return { m_product_id: scalar('SELECT m_product_id FROM m_product p WHERE ?=p.upc AND ?=p.ad_client_id', [r.upc, r.ad_client_id]) }; });
      step('Product Existing Value', function (r) { return r.m_product_id == null && isN(r) && cc(r); }, function (r) {
        return { m_product_id: scalar('SELECT m_product_id FROM m_product p WHERE ?=p.value AND ?=p.ad_client_id', [r.value, r.ad_client_id]) }; });
      step('Product Existing Vendor ProductNo', function (r) { return r.m_product_id == null && isN(r) && cc(r); }, function (r) {
        return { m_product_id: scalar('SELECT m_product_id FROM m_product_po p WHERE ?=p.c_bpartner_id AND ?=p.vendorproductno AND ?=p.ad_client_id', [r.c_bpartner_id, r.vendorproductno, r.ad_client_id]) }; });
      err('Product inactive', 'ERR=Product is not active,', function (r) {
        return r.m_product_id != null && trx.q("SELECT 1 AS x FROM m_product mp WHERE ?=mp.ad_client_id AND ?=mp.m_product_id AND mp.isactive='N'", [r.ad_client_id, r.m_product_id]).length > 0; }, notY);

      //	Set Product Category (:213-231)
      step('Set Category Default Value', function (r) { return r.productcategory_value == null && r.m_product_category_id == null && r.m_product_id == null && notY(r) && cc(r); }, function () {
        return { productcategory_value: scalar("SELECT MAX(value) FROM m_product_category WHERE isdefault='Y' AND ad_client_id=?", [C]) }; });
      step('Set Category', function (r) { return r.productcategory_value != null && r.m_product_category_id == null && notY(r) && cc(r); }, function (r) {
        return { m_product_category_id: scalar('SELECT m_product_category_id FROM m_product_category c WHERE ?=c.value AND ?=c.ad_client_id', [r.productcategory_value, r.ad_client_id]) }; });

      //	Copy From Product if Import does not have value (:232-258)
      ['Value', 'Name', 'Description', 'DocumentNote', 'Help', 'UPC', 'SKU', 'Classification', 'ProductType', 'Discontinued', 'DiscontinuedBy', 'DiscontinuedAt', 'ImageURL', 'DescriptionURL', 'CustomsTariffNumber', 'Group1', 'Group2'].forEach(function (f) {
        var col = f.toLowerCase();
        step('copy ' + f, function (r) { return r.m_product_id != null && r[col] == null && isN(r) && cc(r); }, function (r) {
          var o = {}; o[col] = scalar('SELECT ' + col + ' FROM m_product p WHERE ?=p.m_product_id AND ?=p.ad_client_id', [r.m_product_id, r.ad_client_id]); return o; }); });
      ['C_UOM_ID', 'M_Product_Category_ID', 'Volume', 'Weight', 'ShelfWidth', 'ShelfHeight', 'ShelfDepth', 'UnitsPerPallet'].forEach(function (f) {
        var col = f.toLowerCase();
        step('copy ' + f, function (r) { return r.m_product_id != null && (r[col] == null || Number(r[col]) === 0) && isN(r) && cc(r); }, function (r) {
          var o = {}; o[col] = scalar('SELECT ' + col + ' FROM m_product p WHERE ?=p.m_product_id AND ?=p.ad_client_id', [r.m_product_id, r.ad_client_id]); return o; }); });

      //	Copy From Product_PO if Import does not have value (:260-292)
      ['UPC', 'PriceEffective', 'VendorProductNo', 'VendorCategory', 'Manufacturer', 'Discontinued', 'DiscontinuedBy', 'DiscontinuedAt'].forEach(function (f) {
        var col = f.toLowerCase();
        step('copyPO ' + f, function (r) { return r.m_product_id != null && r.c_bpartner_id != null && r[col] == null && isN(r) && cc(r); }, function (r) {
          var o = {}; o[col] = scalar('SELECT ' + col + ' FROM m_product_po p WHERE ?=p.m_product_id AND ?=p.c_bpartner_id AND ?=p.ad_client_id', [r.m_product_id, r.c_bpartner_id, r.ad_client_id]); return o; }); });
      ['C_UOM_ID', 'C_Currency_ID', 'PriceList', 'PricePO', 'RoyaltyAmt', 'Order_Min', 'Order_Pack', 'CostPerOrder', 'DeliveryTime_Promised'].forEach(function (f) {
        var col = f.toLowerCase();
        step('copyPO ' + f, function (r) { return r.m_product_id != null && r.c_bpartner_id != null && (r[col] == null || Number(r[col]) === 0) && isN(r) && cc(r); }, function (r) {
          var o = {}; o[col] = scalar('SELECT ' + col + ' FROM m_product_po p WHERE ?=p.m_product_id AND ?=p.c_bpartner_id AND ?=p.ad_client_id', [r.m_product_id, r.c_bpartner_id, r.ad_client_id]); return o; }); });

      err('Invalid Category', 'ERR=Invalid ProdCategory,', function (r) { return r.m_product_category_id == null; }, notY);   // :294-302

      //	Set UOM (System/own) (:304-327)
      step('Set UOM Default', function (r) { return r.x12de355 == null && r.c_uom_id == null && notY(r) && cc(r); }, function (r) {
        return { x12de355: scalar("SELECT MAX(x12de355) FROM c_uom u WHERE u.isdefault='Y' AND u.ad_client_id IN (0,?)", [r.ad_client_id]) }; });
      step('Set UOM', function (r) { return r.c_uom_id == null && notY(r) && cc(r); }, function (r) {
        return { c_uom_id: scalar('SELECT c_uom_id FROM c_uom u WHERE u.x12de355=? AND u.ad_client_id IN (0,?)', [r.x12de355, r.ad_client_id]) }; });
      err('Invalid UOM', 'ERR=Invalid UOM, ', function (r) { return r.c_uom_id == null; }, notY);

      //	Set Currency (:329-354)
      step('Set Currency Default', function (r) { return r.c_currency_id == null && r.iso_code == null && notY(r) && cc(r); }, function (r) {
        return { iso_code: scalar('SELECT iso_code FROM c_currency c INNER JOIN c_acctschema a ON (a.c_currency_id=c.c_currency_id) INNER JOIN ad_clientinfo ci ON (a.c_acctschema_id=ci.c_acctschema1_id) WHERE ci.ad_client_id=?', [r.ad_client_id]) }; });
      step('Set Currency', function (r) { return r.c_currency_id == null && notY(r) && cc(r); }, function (r) {
        return { c_currency_id: scalar('SELECT c_currency_id FROM c_currency c WHERE ?=c.iso_code AND c.ad_client_id IN (0,?)', [r.iso_code, r.ad_client_id]) }; });
      err('Currency', 'ERR=Currency,', function (r) { return r.c_currency_id == null; }, notY);

      //	Verify ProductType (:356-363)
      err('Invalid ProductType', 'ERR=Invalid ProductType,', function (r) { return r.producttype != null && ['E', 'I', 'R', 'S', 'A'].indexOf(r.producttype) < 0; }, notY);

      //	Unique UPC/Value (:365-381)
      function dupOf(col) { return function (r) { return R.some(function (w) { var ii = w.cur; return eq(r.ad_client_id, ii.ad_client_id) && ne(r.i_product_id, ii.i_product_id) && eq(r[col], ii[col]); }); }; }
      err('Not Unique Value', 'ERR=Value not unique,', dupOf('value'), notY);
      err('Not Unique UPC', 'ERR=UPC not unique,', dupOf('upc'), notY);
      err('No Mandatory Value', 'ERR=No Mandatory Value,', function (r) { return r.value == null; }, notY);   // :382-390

      //	Vendor Product No (:391-408)
      step('VendorProductNo Set to Value', function (r) { return r.c_bpartner_id != null && r.vendorproductno == null && isN(r) && cc(r); }, function (r) { return { vendorproductno: r.value }; });
      err('Not Unique VendorProductNo', 'ERR=VendorProductNo not unique,', function (r) {
        return r.c_bpartner_id != null && R.some(function (w) { var ii = w.cur; return eq(r.ad_client_id, ii.ad_client_id) && eq(r.c_bpartner_id, ii.c_bpartner_id) && eq(r.vendorproductno, ii.vendorproductno) && ne(r.i_product_id, ii.i_product_id); }); }, notY);

      //	Get Default Tax Category (:409-433)
      var rsT = trx.q("SELECT c_taxcategory_id FROM c_taxcategory WHERE isdefault='Y' AND ad_client_id=?", [C]), C_TaxCategory_ID = rsT.length ? Number(rsT[0].c_taxcategory_id) : 0;
      flush();                                                                                               // commitEx() :435

      //	-------------------------------------------------------------------
      var noInsert = 0, noUpdate = 0, noInsertPO = 0, noUpdatePO = 0;
      var impRows = trx.find('i_product', {}).filter(function (r) { return eq(r.i_isimported, 'N') && cc(r); }).sort(function (a, b) { return idNum(a.i_product_id) - idNum(b.i_product_id); });   // :490 SELECT * WHERE I_IsImported='N' :443-449
      try {
        impRows.forEach(function (imp0) {
          var imp = trx.get('i_product', imp0.i_product_id), I_Product_ID = imp.i_product_id, M_Product_ID = nz(imp.m_product_id), C_BPartner_ID = nz(imp.c_bpartner_id), newProduct = M_Product_ID === 0;
          function markError(msg) { trx.update('i_product', trx.get('i_product', I_Product_ID), { i_isimported: 'E', i_errormsg: cat(trx.get('i_product', I_Product_ID).i_errormsg, msg) }); }
          if (newProduct) {                                                                                  //	Insert new Product :489-508
            var f = { ad_client_id: imp.ad_client_id, ad_org_id: imp.ad_org_id, updatedby: imp.updatedby, value: imp.value, name: imp.name, description: imp.description, documentnote: imp.documentnote, help: imp.help,
                      upc: imp.upc, sku: imp.sku, c_uom_id: imp.c_uom_id, m_product_category_id: imp.m_product_category_id, producttype: imp.producttype, imageurl: imp.imageurl, descriptionurl: imp.descriptionurl,
                      volume: imp.volume, weight: imp.weight, customstariffnumber: imp.customstariffnumber, group1: imp.group1, group2: imp.group2, m_attributeset_id: imp.m_attributeset_id };     // MProduct(X_I_Product) MProduct.java:313-337
            if (C_TaxCategory_ID) f.c_taxcategory_id = C_TaxCategory_ID;                                     // product.setC_TaxCategory_ID :493
            // PostgreSQL's NOT NULL on M_Product refuses the INSERT (-> product.save() false -> 'Insert Product failed'): ModelLayer.save carries that rule (ML.notNullError, CAPEX_DASHBOARD.md §5.73)
            var sp0 = trx.setSavepoint(), sv = ML().save(trx, 'm_product', null, ML().newPO(trx, 'm_product', f));
            if (sv.ok) { M_Product_ID = sv.row.m_product_id; noInsert++; }
            else { trx.rollbackTo(sp0); trx.say('§IMPORT_PRODUCT_SAVE_REFUSED row=' + I_Product_ID + ' value=' + imp.value + ' :: ' + String(sv.error).replace(/\s+/g, ' ').slice(0, 200)); markError('Insert Product failed'); return; }   // :495-507
          } else {                                                                                           //	Update Product :509-550 (raw UPDATE: ImageURL is NOT in the SET list)
            var cur = trx.get('m_product', M_Product_ID), ch = {};
            ['value', 'name', 'description', 'documentnote', 'help', 'upc', 'sku', 'c_uom_id', 'm_product_category_id', 'classification', 'producttype', 'volume', 'weight', 'shelfwidth', 'shelfheight', 'shelfdepth', 'unitsperpallet',
             'customstariffnumber', 'group1', 'group2', 'discontinued', 'discontinuedby', 'discontinuedat'].forEach(function (c) { ch[c] = imp[c] == null ? null : imp[c]; });
            ch.updated = nowTs; ch.updatedby = imp.updatedby;
            trx.update('m_product', cur, ch); noUpdate++;
          }
          //	Do we have PO Info :551-627
          if (C_BPartner_ID !== 0) {
            var n = 0, poCols = { c_uom_id: 1, c_currency_id: 1, upc: 1, pricelist: 1, pricepo: 1, royaltyamt: 1, priceeffective: 1, vendorproductno: 1, vendorcategory: 1, manufacturer: 1, discontinued: 1, discontinuedby: 1, discontinuedat: 1,
              order_min: 1, order_pack: 1, costperorder: 1, deliverytime_promised: 1 };
            if (!newProduct) {
              var po = trx.q('SELECT * FROM m_product_po WHERE m_product_id=? AND c_bpartner_id=?', [M_Product_ID, C_BPartner_ID]);
              po.forEach(function (p) { var pc = { iscurrentvendor: 'Y', updated: nowTs, updatedby: imp.updatedby }; Object.keys(poCols).forEach(function (c) { pc[c] = imp[c] == null ? null : imp[c]; }); trx.update('m_product_po', trx.get('m_product_po', p.m_product_po_id || p[Object.keys(p)[0]]), pc); n++; });
              if (n) noUpdatePO++;
            }
            if (n === 0) {                                                                                   //	Insert PO
              var pf = { m_product_id: M_Product_ID, c_bpartner_id: C_BPartner_ID, ad_client_id: imp.ad_client_id, ad_org_id: imp.ad_org_id, isactive: 'Y', createdby: imp.createdby, updatedby: imp.updatedby, iscurrentvendor: 'Y' };
              Object.keys(poCols).forEach(function (c) { pf[c] = imp[c]; });
              var sp1 = trx.setSavepoint(), sp = ML().save(trx, 'm_product_po', null, ML().newPO(trx, 'm_product_po', pf));
              if (!sp.ok) { trx.rollbackTo(sp1); if (newProduct) noInsert--; markError('Insert Product_PO: ' + sp.error); return; }
              noInsertPO++;
            }
          }
          //	Price List :628-646
          if (pPLV !== 0) {
            var PriceList = nz(imp.pricelist), PriceStd = nz(imp.pricestd), PriceLimit = nz(imp.pricelimit);
            if (PriceStd !== 0 || PriceLimit !== 0 || PriceList !== 0) {
              var pp = trx.find('m_productprice', { m_pricelist_version_id: pPLV, m_product_id: M_Product_ID })[0];
              if (pp) { var sp2 = ML().save(trx, 'm_productprice', pp, { pricelist: PriceList, pricestd: PriceStd, pricelimit: PriceLimit }); if (!sp2.ok) throw new Error('SaveError m_productprice: ' + sp2.error); }
              else { var sp3 = ML().save(trx, 'm_productprice', null, ML().newPO(trx, 'm_productprice', { ad_client_id: imp.ad_client_id, ad_org_id: imp.ad_org_id, m_pricelist_version_id: pPLV, m_product_id: M_Product_ID, pricelist: PriceList, pricestd: PriceStd, pricelimit: PriceLimit })); if (!sp3.ok) throw new Error('SaveError m_productprice: ' + sp3.error); }
            }
          }
          //	Update I_Product :647-652
          trx.update('i_product', trx.get('i_product', I_Product_ID), { i_isimported: 'Y', m_product_id: M_Product_ID, updated: nowTs, processed: 'Y' });
        });
      } catch (e) {                                                                                          // :655 catch (SQLException) {} - swallowed; the twin prints it
        trx.say('§IMPORT_PRODUCT_EXCEPTION ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 300));
      }

      //	Set Error to indicator to not imported (:668-679)
      load();
      no = step('Set not imported', function (r) { return notY(r) && cc(r); }, function () { return { i_isimported: 'N', updated: nowTs }; });
      flush();
      this.addLog(0, null, A.toBD(String(no)), '@Errors@');
      this.addLog(0, null, A.toBD(String(noInsert)), '@M_Product_ID@: @Inserted@');
      this.addLog(0, null, A.toBD(String(noUpdate)), '@M_Product_ID@: @Updated@');
      this.addLog(0, null, A.toBD(String(noInsertPO)), '@M_Product_ID@ @Purchase@: @Inserted@');
      this.addLog(0, null, A.toBD(String(noUpdatePO)), '@M_Product_ID@ @Purchase@: @Updated@');
      trx.say('§IMPORT_PRODUCT client=' + C + ' inserted=' + noInsert + ' updated=' + noUpdate + ' po_inserted=' + noInsertPO + ' po_updated=' + noUpdatePO + ' errors=' + no);
      return '';
    };
    return ImportProduct;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
