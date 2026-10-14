// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// model_master.js -- the MASTER-RECORD save rules of the iDempiere model classes (bim-compiler prompts/SQLiteIDEMPIERE.md §G-SD2-PORT;
// CARDINAL RULE: a master created through the shipped window/ModelLayer.save path yields the same child records, defaults and
// sequence values as legacy). ONE table-driven registry (MASTER) feeding ModelLayer.registerModel -- the generic mechanism
// model_order.js / model_invoice.js already use (initialDefaults / beforeSave / afterSave per table, keyed on the model's table
// name exactly as legacy keys them on the M* class). No branch on a table name in the save path: the save path only calls the
// registered hooks. Helpers below are the PO methods the Java classes call (PO.insert_Accounting / PO.insert_Tree) and MCost.create.
//   Java root org.adempiere.base/src/org/compiere/model/.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'));
  else root.ModelMaster = factory(root.ModelLayer);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML) {

  function nz(v) { return v != null && v !== '' && Number(v) !== 0; }
  function same(a, b) { return String(a == null ? '' : a) === String(b == null ? '' : b); }

  // MTree_Base.getNodeTableName(treeType) (MTree_Base.java) -- the standard master trees
  var NODE_TABLE = { BP: 'ad_treenodebp', PR: 'ad_treenodepr', OO: 'ad_treenode' };

  // PO.insert_Accounting(acctTable, baseTable, where) PO.java:4907-4990 -- for every row of the base table of the client (optionally
  // restricted by `by` = {col: value}, the Java "p.<col>=<id>" clause) copy the Account-type columns (AD_Column.AD_Reference_ID=25,
  // active, ORDER BY ColumnName, :4911-4918) into a new <acctTable> row for this record, unless that (record, schema) row exists.
  var _acctCols = {};   // dictionary read once per accounting table (like model_layer's _ddl/_cc caches)
  function accountColumns(trx, acctTable) {
    if (_acctCols[acctTable]) return _acctCols[acctTable];
    var cols = trx.q("SELECT c.columnname AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' AND c.ad_reference_id=25 ORDER BY c.columnname", [acctTable])
      .map(function (r) { return String(r.c).toLowerCase(); });
    if (cols.length) _acctCols[acctTable] = cols;   // an empty answer is not cached (a slim bundle may gain the dictionary)
    return cols;
  }
  function insertAccounting(trx, table, row, acctTable, baseTable, by) {
    var acctCols = accountColumns(trx, acctTable);
    if (!acctCols.length) { trx.say('§MASTER-ACCT no Account columns for ' + acctTable + ' (:4936 "No Columns" -> insert_Accounting false)'); return false; }
    var idc = trx.idCol(table), id = row[idc], pk = table + '_id', where = { ad_client_id: row.ad_client_id };
    if (by) Object.keys(by).forEach(function (k) { where[k] = by[k]; });
    var bk = baseTable + '|' + JSON.stringify(where), cache = (trx._mmBase = trx._mmBase || {});   // the base rows are read once per Trx (BP customer + vendor share them)
    var bases = cache[bk] || (cache[bk] = trx.find(baseTable, where, ['c_acctschema_id'])), n = 0;
    bases.forEach(function (p) {
      var ex = { c_acctschema_id: p.c_acctschema_id }; ex[pk] = id;
      if (trx.find(acctTable, ex).length) return;   // NOT EXISTS (:5007-5013)
      var f = { ad_org_id: 0, isactive: 'Y', ad_client_id: p.ad_client_id, c_acctschema_id: p.c_acctschema_id };   // :4964-4965 p.AD_Client_ID, org 0, 'Y'
      f[pk] = id;
      acctCols.forEach(function (c) { f[c] = p[c]; });
      var uu = acctTable + '_uu'; if (trx.env.uuid) f[uu] = trx.env.uuid();                                        // :4954-4958 generate_uuid()
      trx.insert(acctTable, f); n++;
    });
    trx.say('§MASTER-ACCT ' + acctTable + ' from ' + baseTable + ' for ' + table + ' ' + id + ' rows=' + n);
    return n > 0;
  }

  // PO.insert_Tree(treeType) PO.java:5030-5099 -- a node (parent 0, SeqNo 999) in every active IsAllNodes tree of the client
  // with that TreeType, unless the node exists (:5067-5086).
  function insertTree(trx, table, row, treeType) {
    var node = NODE_TABLE[treeType], id = row[trx.idCol(table)], n = 0;
    if (!node) { trx.say('§MASTER-TREE treeType=' + treeType + ' has no node table in this port'); return false; }
    trx.find('ad_tree', { ad_client_id: row.ad_client_id, isactive: 'Y', isallnodes: 'Y', treetype: treeType }, ['ad_tree_id']).forEach(function (t) {
      if (trx.find(node, { ad_tree_id: t.ad_tree_id, node_id: id }).length) return;
      var f = { ad_client_id: t.ad_client_id, ad_org_id: 0, isactive: 'Y', ad_tree_id: t.ad_tree_id, node_id: id, parent_id: 0, seqno: 999 };
      if (trx.env.uuid) f[node + '_uu'] = trx.env.uuid();
      trx.insert(node, f); n++;
    });
    trx.say('§MASTER-TREE ' + node + ' for ' + table + ' ' + id + ' rows=' + n);
    return n > 0;
  }

  // MAcctSchema.getClientAcctSchema(ctx, AD_Client_ID) MAcctSchema.java:132-186: the AD_ClientInfo.C_AcctSchema1 schema FIRST (added when it exists, unfiltered :152-154),
  // then every ACTIVE schema of the client that has BOTH a C_AcctSchema_GL and a C_AcctSchema_Default row (:156-162), ORDER BY C_AcctSchema_ID, skipping the primary (:172-179).
  function clientAcctSchemas(trx, client) {
    var out = [], prim = 0;
    try { var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [client])[0]; prim = ci ? Number(ci.a || 0) : 0; } catch (e) { prim = 0; }
    if (prim) { var p = trx.get('c_acctschema', prim); if (p) out.push(p); }
    var has = function (t, id) { try { return trx.q('SELECT 1 AS x FROM ' + t + ' WHERE c_acctschema_id=?', [id]).length > 0; } catch (e) { return false; } };
    trx.find('c_acctschema', { ad_client_id: client, isactive: 'Y' }, ['c_acctschema_id']).forEach(function (a) {
      if (Number(a.c_acctschema_id) === prim) return;
      if (has('c_acctschema_gl', a.c_acctschema_id) && has('c_acctschema_default', a.c_acctschema_id)) out.push(a);
    });
    return out;
  }

  // MCost.create(MProduct) MCost.java:775-852 + createCostingRecord :881-896 + MCost.get/ctor :1442-1455, :1649-1661. Standard-costing
  // element = the client's active Material element with CostingMethod 'S' (MCostElement.getCostingMethods :148-159). Per client acct schema:
  // MProduct.getCostingLevel(as) :1064-1073 (category acct override, else the schema) -> Client 'C': one record at org 0; Organization 'O':
  // one per non-summary org of the client (AD_OrgOnly filter :818-827); a summary AD_OrgOnly (tree walk :806-815) and Batch/Lot are named.
  function mcostCreate(trx, prod) {
    var ce = trx.find('m_costelement', { ad_client_id: prod.ad_client_id, costelementtype: 'M', isactive: 'Y' }, ['m_costelement_id']).filter(function (e) { return e.costingmethod === 'S'; })[0];
    if (!ce) { trx.say('§MASTER-MCOST no Standard Costing element in the client (MCost.java:783-787)'); return; }
    var pid = prod[trx.idCol('m_product')], made = 0;
    clientAcctSchemas(trx, prod.ad_client_id).forEach(function (as) {
      var pca = trx.find('m_product_category_acct', { m_product_category_id: prod.m_product_category_id, c_acctschema_id: as.c_acctschema_id })[0];
      var cl = (pca && pca.costinglevel) || as.costinglevel, orgs = [];
      if (cl === 'C') orgs = [0];
      else if (cl === 'O') {
        var only = Number(as.ad_orgonly_id || 0);
        if (only > 0) { var oo = trx.get('ad_org', only); if (oo && oo.issummary === 'Y') { trx.say('§MASTER-MCOST-NOT-PORTED AD_OrgOnly is a summary org (MCost.createForChildOrg :806-815)'); return; } }
        orgs = trx.find('ad_org', { ad_client_id: prod.ad_client_id, isactive: 'Y' }, ['ad_org_id']).filter(function (o) { return o.issummary !== 'Y' && (only === Number(o.ad_org_id) || only === 0); }).map(function (o) { return o.ad_org_id; });
      } else { trx.say('§MASTER-MCOST Not created: Std.Cost for ' + prod.name + ' - Costing Level on Batch/Lot'); return; }   // :843-845
      orgs.forEach(function (org) {
        var key = { ad_client_id: prod.ad_client_id, ad_org_id: org, m_product_id: pid, m_costtype_id: as.m_costtype_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ce.m_costelement_id, m_attributesetinstance_id: 0 };
        if (trx.find('m_cost', key).length) return;                                                                                       // MCost.get found it: not is_new
        ML.newRecord(trx, 'm_cost', key).saveEx(); made++;
      });
    });
    trx.say('§MASTER-MCOST product ' + pid + ' std-cost records=' + made);
  }

  // The afterSave work Java does on a CHANGED/new record that this port does NOT do is logged, numbered, with the number of rows it would touch (never silently skipped):
  //  NP-1 PO.update_Tree (PO.java:5105-): re-parents only inside an AD_Tree flagged IsTreeDrivenByValue; NP-2 MAccount.updateValueDescription (MAccount.java:391-401)
  //  re-derives C_ValidCombination Combination/Description; NP-3 MProduct A_Asset Name/Description (MProduct.afterSave :878-890).
  function notPorted(trx, tag, why, table, where, params) {
    var n = 0; try { n = trx.q('SELECT COUNT(*) AS n FROM ' + table + (where ? ' WHERE ' + where : ''), params || [])[0].n; } catch (e) { n = 0; }
    if (n > 0) trx.say('§MASTER-NOT-PORTED ' + tag + ' ' + why + ' rows=' + n);
  }
  function np1(trx, row, treeType) {   // newRecord || is_ValueChanged(Value) (MBPartner.afterSave :992, MProduct.afterSave :898)
    notPorted(trx, 'NP-1', 'update_Tree(' + treeType + ') value-driven trees', 'ad_tree', "ad_client_id=? AND isactive='Y' AND treetype=? AND istreedrivenbyvalue='Y'", [row.ad_client_id, treeType]);
  }
  function changed(old, row, c) { return !!old && !same(old[c], row[c]); }
  // the error an afterSave rule returns makes PO.save fail (PO.java:2773-2780); MBankAccount.afterSave returns insert_Accounting's boolean (:222-225)
  function bankAcct(trx, r) { return insertAccounting(trx, 'c_bankaccount', r, 'c_bankaccount_acct', 'c_acctschema_default', null) ? null : 'Error: insert_Accounting(C_BankAccount_Acct, C_AcctSchema_Default) inserted no row'; }

  // MBPartner.beforeSave :959-973 (new, or C_BP_Group_ID changed): getBPGroup() = the group by id, or when 0 the client's IsDefault group (:877-886, MBPGroup.getDefault
  // :110-); none => "@NotFound@: @C_BP_Group_ID@" refusal. setBPGroup :892-908 then copies, UNCONDITIONALLY, every NON-ZERO of C_Dunning_ID, M_PriceList_ID, PO_PriceList_ID,
  // M_DiscountSchema_ID, PO_DiscountSchema_ID from the group onto the partner (and C_BP_Group_ID itself).
  var GROUP_COPY = ['c_dunning_id', 'm_pricelist_id', 'po_pricelist_id', 'm_discountschema_id', 'po_discountschema_id'];
  function bpGroupDefaults(trx, r, isNew, old) {
    if (!(isNew || changed(old, r, 'c_bp_group_id'))) return null;
    var g = nz(r.c_bp_group_id) ? trx.get('c_bp_group', r.c_bp_group_id)
      : trx.find('c_bp_group', { ad_client_id: r.ad_client_id != null ? r.ad_client_id : trx.env.client, isdefault: 'Y' }, ['c_bp_group_id'])[0] || null;
    if (!g) return 'Error: @NotFound@: @C_BP_Group_ID@';
    r.c_bp_group_id = g.c_bp_group_id;
    GROUP_COPY.forEach(function (c) { if (nz(g[c])) r[c] = g[c]; });
    return null;
  }

  // ── THE REGISTRY: one entry per model class, each hook citing its Java. Order inside afterNew = the order in the Java afterSave. ──────────
  // init = X_*(ctx,0) / M*.setInitialDefaults (applied by newPO and by BEFORE_SAVE of a new record); before = M*.beforeSave piece (returns an error string to refuse);
  // afterNew = afterSave(newRecord) steps; afterChange = afterSave steps for a changed record. A step returning a string refuses the save.
  var MASTER = {
    c_bpartner: {
      init: { iscustomer: 'Y', isprospect: 'Y', sendemail: 'N', isonetime: 'N', isvendor: 'N', issummary: 'N', isemployee: 'N', issalesrep: 'N', istaxexempt: 'N', ispotaxexempt: 'N', isdiscountprinted: 'N',   // MBPartner.setInitialDefaults :276-304
        so_creditlimit: 0, so_creditused: 0, totalopenbalance: 0, socreditstatus: 'X', actuallifetimevalue: 0, potentiallifetimevalue: 0, acqusitioncost: 0, shareofcustomer: 0, salesvolume: 0 },
      before: bpGroupDefaults,
      afterNew: [   // MBPartner.afterSave :976-990
        function (trx, r) { insertTree(trx, 'c_bpartner', r, 'BP'); np1(trx, r, 'BP'); },
        function (trx, r) { insertAccounting(trx, 'c_bpartner', r, 'c_bp_customer_acct', 'c_bp_group_acct', { c_bp_group_id: r.c_bp_group_id }); },
        function (trx, r) { insertAccounting(trx, 'c_bpartner', r, 'c_bp_vendor_acct', 'c_bp_group_acct', { c_bp_group_id: r.c_bp_group_id }); } ],
      afterChange: [function (trx, r, old) {   // :992-1000 (Value changed: update_Tree; Value or Name changed: MAccount.updateValueDescription)
        if (changed(old, r, 'value')) np1(trx, r, 'BP');
        if (changed(old, r, 'value') || changed(old, r, 'name')) notPorted(trx, 'NP-2', 'MAccount.updateValueDescription C_BPartner_ID', 'c_validcombination', 'c_bpartner_id=?', [r.c_bpartner_id]); }] },
    m_cost: { init: { m_attributesetinstance_id: 0, currentcostprice: 0, futurecostprice: 0, currentqty: 0, cumulatedamt: 0, cumulatedqty: 0 } },                     // MCost.setInitialDefaults :1619-1627
    c_location: { before: function (trx, r) { r.ad_org_id = 0; } },                                                                                                    // MLocation.beforeSave :721-722 (unconditional: setAD_Org_ID(0) when != 0)
    c_acctschema: { init: { autoperiodcontrol: 'Y', period_openfuture: 2, period_openhistory: 2, costingmethod: 'S', costinglevel: 'C', isadjustcogs: 'N', gaap: 'UN', hasalias: 'Y', hascombination: 'N',
                            isaccrual: 'Y', commitmenttype: 'N', isdiscountcorrectstax: 'N', taxcorrectiontype: 'N', istradediscountposted: 'N', ispostservices: 'N', isexplicitcostadjustment: 'N', separator: '-' },   // MAcctSchema.setInitialDefaults :221-239
                    before: function (trx, r, isNew, old) { return acctSchemaBefore(trx, r, isNew, old); } },                                                                                       // MAcctSchema.beforeSave :711-742
    // ── setup masters (NC-6/7/8; every message is the AD_Message text measured on the legacy pilot by scripts/bridge/nc6_legacy.js) ──
    c_conversion_rate: { before: function (trx, r, isNew, old) { return convRateBefore(trx, r, isNew); },                                                                             // MConversionRate.beforeSave
                         afterNew: [convRateReciprocal], afterChange: [convRateReciprocal] },                                                                                         // MConversionRate.afterSave (reverse rate)
    m_warehouse: { before: function (trx, r, isNew, old) { return warehouseBefore(trx, r, isNew, old); },                                                                             // MWarehouse.beforeSave
                   afterNew: [function (trx, r) { insertAccounting(trx, 'm_warehouse', r, 'm_warehouse_acct', 'c_acctschema_default', null); }] },                                      // MWarehouse.afterSave
    m_product_category: { before: function (trx, r, isNew) { return productCategoryBefore(trx, r, isNew); },                                                                         // MProductCategory.beforeSave
                          afterNew: [function (trx, r) { insertAccounting(trx, 'm_product_category', r, 'm_product_category_acct', 'c_acctschema_default', null); }] },               // MProductCategory.afterSave
    c_bp_group: { afterNew: [function (trx, r) { insertAccounting(trx, 'c_bp_group', r, 'c_bp_group_acct', 'c_acctschema_default', null); }] },                                       // MBPGroup.afterSave
    c_charge: { afterNew: [function (trx, r) { insertAccounting(trx, 'c_charge', r, 'c_charge_acct', 'c_acctschema_default', null); }] },                                             // MCharge.afterSave
    c_paymentterm: { before: function (trx, r, isNew) { return paymentTermBefore(trx, r, isNew); } },                                                                                 // MPaymentTerm.beforeSave
    m_pricelist_version: { before: function (trx, r) { if (!r.validfrom) r.validfrom = trx.env.date; if (!r.name) r.name = fmtDateUS(r.validfrom); return null; } },                   // MPriceListVersion.setName :177-187 (en_US DisplayType.Date)
    c_uom_conversion: { before: function (trx, r) { return uomConversionBefore(trx, r); } },                                                                                         // MUOMConversion.beforeSave
    c_year: { before: function (trx, r) { return yearBefore(r); } },                                                                                                                  // MYear.beforeSave
    ad_role: { before: function (trx, r) { return roleBefore(r); }, afterNew: [function (trx, r) { roleAfterNew(trx, r); }] },                                                          // MRole.beforeSave / afterSave (new role)
    ad_org: { afterNew: [function (trx, r) { orgAfterNew(trx, r); }] },                                                                                                               // MOrg.afterSave (new org block)
    ad_sequence: { before: function (trx, r) { if (r.startnewmonth === 'Y' && r.startnewyear !== 'Y') r.startnewmonth = 'N'; return null; } },                                       // MSequence.beforeSave
    m_costelement: { before: function (trx, r) { r.ad_org_id = 0; } },                                                                                                 // MCostElement.beforeSave :360-361
    c_bankaccount: { afterNew: [bankAcct] },                                                                                                                            // MBankAccount.afterSave :220-226
    c_tax: { afterNew: [function (trx, r) { insertAccounting(trx, 'c_tax', r, 'c_tax_acct', 'c_acctschema_default', null); }] },                                       // MTax.afterSave :400-407 (result ignored in Java)
    m_product: {
      afterNew: [   // MProduct.afterSave :866-905: accounting + tree for a new product, update_Tree, then MCost.create (new, or category changed)
        function (trx, r) { insertAccounting(trx, 'm_product', r, 'm_product_acct', 'm_product_category_acct', { m_product_category_id: r.m_product_category_id }); },
        function (trx, r) { insertTree(trx, 'm_product', r, 'PR'); np1(trx, r, 'PR'); },
        function (trx, r) { mcostCreate(trx, r); } ],
      afterChange: [function (trx, r, old) {
        if (changed(old, r, 'value')) np1(trx, r, 'PR');                                                                                                               // :898
        if (changed(old, r, 'value') || changed(old, r, 'name')) notPorted(trx, 'NP-2', 'MAccount.updateValueDescription M_Product_ID', 'c_validcombination', 'm_product_id=?', [r.m_product_id]);   // :868-869
        if (changed(old, r, 'name') || changed(old, r, 'description')) notPorted(trx, 'NP-3', 'A_Asset Name/Description', 'a_asset', "isactive='Y' AND m_product_id=?", [r.m_product_id]);              // :872-883
        if (changed(old, r, 'm_product_category_id')) mcostCreate(trx, r); }] }                                                                                        // :902-903
  };


  // MAcctSchema.beforeSave (MAcctSchema.java:711-742) + checkCosting (:577-600). Messages = AD_Message EndDateAfterStartDate / ChangeCostingLevelError (legacy wording, measured on the pilot).
  function acctSchemaBefore(trx, r, isNew, old) {
    r.ad_org_id = 0;                                                                            // :713-714
    if (r.taxcorrectiontype == null || r.taxcorrectiontype === '') r.taxcorrectiontype = r.isdiscountcorrectstax === 'Y' ? 'B' : 'N';   // :715-717 ('B' = Write_OffAndDiscount, 'N' = None: X_C_AcctSchema.java:896-902)
    // checkCosting :577-600
    if (!nz(r.m_costtype_id)) {                                                                 // :581-588 Cost Type named like the schema
      var ct = trx.insert('m_costtype', { ad_client_id: r.ad_client_id, ad_org_id: 0, name: r.name });
      r.m_costtype_id = ct.m_costtype_id;
    }
    var method = r.costingmethod;
    if (method) {                                                                               // MCostElement.getMaterialCostElement(po, method) :56-85 (get or create)
      var have = trx.q("SELECT m_costelement_id FROM m_costelement WHERE ad_client_id=? AND costingmethod=? AND costelementtype='M' ORDER BY ad_org_id", [r.ad_client_id, method])[0];
      if (!have) {
        var nm = trx.q("SELECT name FROM ad_ref_list WHERE ad_reference_id=122 AND value=?", [method])[0];
        trx.insert('m_costelement', { ad_client_id: r.ad_client_id, ad_org_id: 0, name: (nm && nm.name) || method, costelementtype: 'M', costingmethod: method });
      }
    }
    if (r.costinglevel == null || r.costinglevel === '') r.costinglevel = 'C';                  // :594-599
    if (r.costingmethod == null || r.costingmethod === '') r.costingmethod = 'S';
    if (r.gaap == null || r.gaap === '') r.gaap = 'UN';
    if (nz(r.ad_orgonly_id)) {                                                                  // :719-724 the primary schema is never org-only
      var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [r.ad_client_id])[0];
      if (ci && String(ci.a) === String(r.c_acctschema_id)) r.ad_orgonly_id = 0;
    }
    if (!isNew && old && String(old.costinglevel) !== String(r.costinglevel)) {                 // :726-733 + getProductsWithCost :745-765
      var prods; try { prods = trx.q("SELECT DISTINCT p.value AS v FROM m_product p JOIN m_costdetail d ON p.m_product_id=d.m_product_id JOIN m_product_category_acct pc ON p.m_product_category_id=pc.m_product_category_id AND d.c_acctschema_id=pc.c_acctschema_id " +
        "WHERE p.isactive='Y' AND pc.isactive='Y' AND pc.costinglevel IS NULL AND d.c_acctschema_id=? LIMIT 50", [r.c_acctschema_id]).map(function (x) { return x.v; }); } catch (e) { prods = []; trx.say('§MODEL-UNPORTED-DEP MAcctSchema.getProductsWithCost: no m_costdetail table in this bundle - no cost details to protect'); }
      if (prods.length) return "Costing level can't be changed if there are product cost details created with current costing level. Products: " + prods.join(',');
    }
    if (r.startdate && r.enddate && String(r.startdate).slice(0, 10) > String(r.enddate).slice(0, 10)) return 'End Date must be after Start Date';   // :735-739
    return null;
  }


  // ── setup-master save rules (see MASTER entries above). Messages: pilot AD_Message / AD_Element texts, measured. ──
  function fmtDateUS(d) { var x = String(d).slice(0, 10).split('-'); return x[1] + '/' + x[2] + '/' + x[0]; }          // DisplayType.getDateFormat(Date) in en_US = MM/dd/yyyy
  function ts0(d) { var t = String(d); return t.length === 10 ? t + ' 00:00:00' : t; }
  function convRateBefore(trx, r, isNew) {
    if (String(r.c_currency_id) === String(r.c_currency_id_to)) return 'Currency = Currency';                           // :  @C_Currency_ID@ = @C_Currency_ID@
    if (!(Number(r.multiplyrate) > 0)) return 'Multiply Rate <= 0';
    if (!r.validto) return 'Fill mandatory fields: Valid to';
    var from = r.validfrom, to = r.validto;
    if (String(to).slice(0, 10) < String(from).slice(0, 10)) return fmtDateUS(to) + ' < ' + fmtDateUS(from);
    if (r.isactive !== 'N') {
      var ov = trx.q("SELECT c_conversion_rate_id AS id, validfrom AS vf FROM c_conversion_rate WHERE ((date(?) BETWEEN date(validfrom) AND date(validto)) OR (date(?) BETWEEN date(validfrom) AND date(validto))) AND c_currency_id=? AND c_currency_id_to=? AND c_conversiontype_id=? AND ad_client_id=? AND ad_org_id=? AND isactive='Y'",
        [from, to, r.c_currency_id, r.c_currency_id_to, r.c_conversiontype_id, r.ad_client_id, r.ad_org_id || 0]).filter(function (x) { return String(x.id) !== String(r.c_conversion_rate_id); });
      if (ov.length) return 'Conversion rate overlaps with: ' + ts0(ov[0].vf) + '.0';
    }
    return null;
  }
  function convRateReciprocal(trx, r, old) {                                                                              // MConversionRate.afterSave: the reverse rate (guarded: the reciprocal's own save does not recurse)
    if (trx._fxRecip) return null;
    var rev = trx.q('SELECT c_conversion_rate_id AS id FROM c_conversion_rate WHERE date(validfrom)=date(?) AND date(validto)=date(?) AND c_currency_id=? AND c_currency_id_to=? AND c_conversiontype_id=? AND ad_client_id=? AND ad_org_id=?',
      [r.validfrom, r.validto, r.c_currency_id_to, r.c_currency_id, r.c_conversiontype_id, r.ad_client_id, r.ad_org_id || 0])[0];
    var div = r.dividerate != null && Number(r.dividerate) !== 0 ? r.dividerate : Math.round((1 / Number(r.multiplyrate)) * 1e12) / 1e12;
    trx._fxRecip = true;
    try {
      if (rev) trx.update('c_conversion_rate', trx.get('c_conversion_rate', rev.id), { dividerate: r.multiplyrate, multiplyrate: div });
      else trx.insert('c_conversion_rate', { ad_client_id: r.ad_client_id, ad_org_id: r.ad_org_id || 0, c_conversiontype_id: r.c_conversiontype_id, validfrom: r.validfrom, validto: r.validto,
        c_currency_id: r.c_currency_id_to, c_currency_id_to: r.c_currency_id, dividerate: r.multiplyrate, multiplyrate: div });
    } finally { trx._fxRecip = false; }
    return null;
  }
  function warehouseBefore(trx, r, isNew, old) {
    if (r.isdisallownegativeinv === 'Y' && (!old || old.isdisallownegativeinv !== 'Y')) {                               // :  negative on-hand exists
      var neg; try { neg = trx.q('SELECT m_product_id FROM m_storageonhand s WHERE s.m_locator_id IN (SELECT m_locator_id FROM m_locator l WHERE m_warehouse_id=?) GROUP BY m_product_id, m_locator_id, m_attributesetinstance_id HAVING SUM(s.qtyonhand) < 0 LIMIT 1', [r.m_warehouse_id])[0]; } catch (e) { neg = null; }
      if (neg) return 'Negative on hand exists in this warehouse';
    }
    if (!Number(r.ad_org_id)) {                                                                                         // org 0 -> the context org, else refused
      if (Number(trx.env.org)) r.ad_org_id = trx.env.org; else return 'Organization * (0) not allowed';
    }
    return null;
  }
  function productCategoryBefore(trx, r, isNew) {                                                                       // hasLoopInTree: follow the parent chain back to this category
    var seen = {}, cur = r.m_product_category_parent_id, me = String(r.m_product_category_id);
    while (cur != null && cur !== '' && Number(cur) !== 0 && !seen[cur]) {
      if (String(cur) === me) return 'A loop in the product category tree has been detected - the old value will be restored';
      seen[cur] = 1; var p = trx.q('SELECT m_product_category_parent_id AS p FROM m_product_category WHERE m_product_category_id=?', [cur])[0]; cur = p ? p.p : null;
    }
    return null;
  }
  function paymentTermBefore(trx, r, isNew) {
    if (r.isduefixed === 'Y') {
      var dd = Number(r.fixmonthday || 0); if (dd < 1 || dd > 31) return 'Invalid: Fix month day';
      dd = Number(r.fixmonthcutoff || 0); if (dd < 1 || dd > 31) return 'Invalid: Fix month cutoff';
    }
    if (Number(r.netdays || 0) < 0) return 'Net Days Must be a positive number!';
    var n = 0; if (r.c_paymentterm_id != null && !/^#new/.test(String(r.c_paymentterm_id))) { try { n = trx.q('SELECT COUNT(*) AS n FROM c_paymentschedule WHERE c_paymentterm_id=?', [r.c_paymentterm_id])[0].n; } catch (e) { n = 0; } }
    if (!n) r.isvalid = 'Y';                                                                                            // MPaymentTerm.validate(): no schedule => valid
    return null;
  }
  function uomConversionBefore(trx, r) {
    if (String(r.c_uom_id) === String(r.c_uom_to_id)) return 'UOM = UoM To';
    var mul = Number(r.multiplyrate || 0), div = Number(r.dividerate || 0);
    function opp(x) { return Math.round((1 / x) * 1e12) / 1e12; }                                                       // getOppositeRate: scale 12
    if (mul !== 0) { if (div === 0) r.dividerate = opp(mul); } else if (div !== 0) { r.multiplyrate = opp(div); mul = Number(r.multiplyrate); }
    if (!(Number(r.multiplyrate || 0) > 0)) return 'Multiply Rate <= 0';
    return null;
  }
  function yearBefore(r) {                                                                                              // MYear.getYearAsInt: parseInt, else the first token's digits (2 digits -> 20xx)
    var fy = String(r.fiscalyear || ''), y = 0;
    if (/^\s*-?\d+\s*$/.test(fy)) y = parseInt(fy, 10); else { var tok = fy.split(/[\/\-, \t\n\r\f]+/).filter(Boolean)[0]; if (tok && /^\d+$/.test(tok)) { y = parseInt(tok, 10); if (tok.length === 2) y += 2000; } }
    return y === 0 ? 'Fill mandatory fields: Year' : null;
  }


  // MOrg.afterSave for a NEW org: AD_OrgInfo (MOrgInfo(MOrg): DUNS '?', TaxID '?'), AD_Role_OrgAccess for every non-manual role of the client (MRoleOrgAccess.createForOrg :99-114),
  // the Organization tree node (insert_Tree(TREETYPE_Organization): parent 0, seq 999). Measured on the pilot (scripts/bridge/nc8_legacy.js). Value-change update_Tree and the
  // C_ValidCombination description refresh are not ported (named).
  function orgAfterNew(trx, r) {
    var oi = { ad_client_id: r.ad_client_id, ad_org_id: r.ad_org_id, duns: '?', taxid: '?' };
    trx.insert('ad_orginfo', oi);
    trx.q("SELECT ad_role_id AS id FROM ad_role WHERE ad_client_id=? AND ismanual='N' AND isactive='Y' ORDER BY ad_role_id", [r.ad_client_id]).forEach(function (ro) {
      var f = { ad_client_id: r.ad_client_id, ad_org_id: r.ad_org_id, ad_role_id: ro.id, isreadonly: 'N' };
      if (trx.env.uuid) f.ad_role_orgaccess_uu = trx.env.uuid();
      trx.insert('ad_role_orgaccess', f);
    });
    insertTree(trx, 'ad_org', r, 'OO');
  }


  // MRole.beforeSave :  a client role may not carry User Level System (AD_Message AccessTableNoUpdate, shown by the WS as "User Level"); measured.
  function roleBefore(r) {
    if (r.ismasterrole === 'Y') return null;
    if (Number(r.ad_client_id) === 0) { r.userlevel = 'S  '; return null; }
    if (r.userlevel === 'S  ') return 'User Level';
    if (r.userlevel == null || String(r.userlevel).trim() === '') return 'Fill mandatory fields: User Level';
    return null;
  }
  // MRole.afterSave (new role) :480-505 + updateAccessRecords :529-640: assign the role to SuperUser (100), then INSERT the window / process / form / workflow / document-action / info-window
  // access rows the role's User Level allows (the six SELECTs of the Java, evaluated on the twin's dictionary; each access row is a CRUD op in the role's own op group).
  // AD_Workflow is not in the slim seed (named). Pilot counts for ' CO' (331 / 383 / 41 / 40 / 840 / 15) equal the same predicates evaluated on the pilot (nc9_legacy.js predicateEqualsMeasured).
  function roleAfterNew(trx, r) {
    if (r.ismasterrole === 'Y') return;
    function ins(t, f) { if (trx.env.uuid) f[t + '_uu'] = trx.env.uuid(); f.ad_client_id = r.ad_client_id; f.isactive = 'Y'; trx.insert(t, f); }
    ins('ad_user_roles', { ad_org_id: 0, ad_user_id: 100, ad_role_id: r.ad_role_id });
    if (r.ismanual === 'Y') return;
    var lv = r.userlevel, al = lv === 'S  ' ? "('4','7','6')" : lv === ' C ' ? "('7','6','3','2')" : lv === ' CO' ? "('7','6','3','2','1')" : "('3','1','7')";
    var alw = (lv !== 'S  ' && lv !== ' C ' && lv !== ' CO') ? al + " AND w.name NOT LIKE '%(all)%'" : al, n = {};
    function tab(t) { try { return trx.q('SELECT 1 AS x FROM ' + t + ' LIMIT 1') && true; } catch (e) { return false; } }
    function has(t, rid) { return trx.q('SELECT 1 AS x FROM ' + t + ' WHERE ad_role_id=? AND ' + rid.col + '=?', [r.ad_role_id, rid.id]).length > 0; }
    if (tab('ad_window_access')) { n.window = 0; trx.q("SELECT DISTINCT w.ad_window_id AS id FROM ad_window w JOIN ad_tab t ON w.ad_window_id=t.ad_window_id JOIN ad_table tt ON t.ad_table_id=tt.ad_table_id WHERE w.isactive='Y' AND t.seqno=(SELECT MIN(seqno) FROM ad_tab xt WHERE xt.ad_window_id=w.ad_window_id) AND tt.accesslevel IN " + alw + ' ORDER BY w.ad_window_id')
      .forEach(function (x) { if (!has('ad_window_access', { col: 'ad_window_id', id: x.id })) { ins('ad_window_access', { ad_org_id: r.ad_org_id, ad_window_id: x.id, ad_role_id: r.ad_role_id, isreadwrite: 'Y' }); n.window++; } }); }
    if (tab('ad_process_access')) { n.process = 0; trx.q("SELECT DISTINCT p.ad_process_id AS id FROM ad_process p WHERE p.isactive='Y' AND accesslevel IN " + al + ' ORDER BY p.ad_process_id')
      .forEach(function (x) { if (!has('ad_process_access', { col: 'ad_process_id', id: x.id })) { ins('ad_process_access', { ad_org_id: r.ad_org_id, ad_process_id: x.id, ad_role_id: r.ad_role_id, isreadwrite: 'Y' }); n.process++; } }); }
    if (tab('ad_form_access')) { n.form = 0; trx.q("SELECT f.ad_form_id AS id FROM ad_form f WHERE f.isactive='Y' AND accesslevel IN " + al + ' ORDER BY f.ad_form_id')
      .forEach(function (x) { if (!has('ad_form_access', { col: 'ad_form_id', id: x.id })) { ins('ad_form_access', { ad_org_id: r.ad_org_id, ad_form_id: x.id, ad_role_id: r.ad_role_id, isreadwrite: 'Y' }); n.form++; } }); }
    if (tab('ad_document_action_access')) { n.docaction = 0;
      trx.q("SELECT d.c_doctype_id AS dt, a.ad_ref_list_id AS act FROM c_doctype d JOIN ad_ref_list a ON a.ad_reference_id=135 WHERE d.isactive='Y' AND d.ad_client_id=? ORDER BY d.c_doctype_id, a.ad_ref_list_id", [r.ad_client_id])
        .forEach(function (x) { if (!trx.q('SELECT 1 AS x FROM ad_document_action_access WHERE ad_role_id=? AND c_doctype_id=? AND ad_ref_list_id=?', [r.ad_role_id, x.dt, x.act]).length) { ins('ad_document_action_access', { ad_org_id: 0, c_doctype_id: x.dt, ad_ref_list_id: x.act, ad_role_id: r.ad_role_id }); n.docaction++; } }); }
    if (tab('ad_infowindow_access')) { n.info = 0; trx.q("SELECT i.ad_infowindow_id AS id FROM ad_infowindow i JOIN ad_table tt ON i.ad_table_id=tt.ad_table_id WHERE i.isactive='Y' AND i.ad_client_id IN (0,?) AND tt.accesslevel IN " + al + ' ORDER BY i.ad_infowindow_id', [r.ad_client_id])
      .forEach(function (x) { if (!has('ad_infowindow_access', { col: 'ad_infowindow_id', id: x.id })) { ins('ad_infowindow_access', { ad_org_id: r.ad_org_id, ad_infowindow_id: x.id, ad_role_id: r.ad_role_id }); n.info++; } }); }
    trx.say('§MASTER-ROLE-ACCESS role=' + r.ad_role_id + ' level=' + lv + ' ' + JSON.stringify(n) + ' (AD_Workflow_Access not in this bundle)');
  }

  function install(registry) {
    Object.keys(registry).forEach(function (table) {
      var spec = registry[table], impl = {};
      if (spec.init) impl.initialDefaults = spec.init;
      if (spec.before) impl.beforeSave = function (trx, rec, isNew, old) { return spec.before(trx, rec, isNew, old) || null; };
      if (spec.afterNew || spec.afterChange) impl.afterSave = function (trx, row, isNew, old) {
        var steps = isNew ? spec.afterNew || [] : spec.afterChange || [];
        for (var i = 0; i < steps.length; i++) { var e = steps[i](trx, row, old); if (typeof e === 'string') return e; }
        return null;
      };
      ML.registerModel(table, impl);
    });
    return Object.keys(registry);
  }
  var installed = install(MASTER);

  return { MASTER: MASTER, install: install, installed: installed, insertAccounting: insertAccounting, insertTree: insertTree, mcostCreate: mcostCreate, clientAcctSchemas: clientAcctSchemas };
});
