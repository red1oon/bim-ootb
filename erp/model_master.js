// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
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
  var NODE_TABLE = { BP: 'ad_treenodebp', PR: 'ad_treenodepr' };

  // PO.insert_Accounting(acctTable, baseTable, where) PO.java:4907-4990 -- for every row of the base table of the client (optionally
  // restricted by `by` = {col: value}, the Java "p.<col>=<id>" clause) copy the Account-type columns (AD_Column.AD_Reference_ID=25,
  // active, ORDER BY ColumnName, :4911-4918) into a new <acctTable> row for this record, unless that (record, schema) row exists.
  function insertAccounting(trx, table, row, acctTable, baseTable, by) {
    var acctCols = trx.q("SELECT c.columnname AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y' AND c.ad_reference_id=25 ORDER BY c.columnname", [acctTable])
      .map(function (r) { return String(r.c).toLowerCase(); });
    if (!acctCols.length) { trx.say('§MASTER-ACCT no Account columns for ' + acctTable + ' (:4936 "No Columns" -> insert_Accounting false)'); return false; }
    var idc = trx.idCol(table), id = row[idc], pk = table + '_id', where = { ad_client_id: row.ad_client_id };
    if (by) Object.keys(by).forEach(function (k) { where[k] = by[k]; });
    var bases = trx.find(baseTable, where, ['c_acctschema_id']), n = 0;
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

  // PO.update_Tree (PO.java:5105-) re-parents ONLY inside a tree flagged "driven by value" (MTree_Base.isTreeDrivenByValue); a bundle without
  // that AD_Tree column has none, MSetup trees are not. Named, not guessed: when a driven tree exists the port says so instead of faking it.
  function updateTreeNotPorted(trx, row, treeType) {
    var driven = []; try { driven = trx.q("SELECT 1 AS x FROM ad_tree WHERE ad_client_id=? AND isactive='Y' AND treetype=? AND istreedrivenbyvalue='Y'", [row.ad_client_id, treeType]); } catch (e) { driven = []; }
    if (driven.length) trx.say('§MASTER-UPDATE-TREE-NOT-PORTED treeType=' + treeType + ' (a value-driven tree exists: PO.update_Tree re-parenting is not modelled)');
  }

  // MCost.create(MProduct) MCost.java:775-852 + createCostingRecord :881-896 + MCost.get/ctor :1442-1455, :1649-1661. Standard-costing
  // element = the client's active Material element with CostingMethod 'S' (MCostElement.getCostingMethods :148-159). Per client acct schema:
  // MProduct.getCostingLevel(as) :1064-1073 (category acct override, else the schema) -> Client 'C': one record at org 0; Organization 'O':
  // one per non-summary org of the client (AD_OrgOnly filter :818-827); a summary AD_OrgOnly (tree walk :806-815) and Batch/Lot are named.
  function mcostCreate(trx, prod) {
    var ce = trx.find('m_costelement', { ad_client_id: prod.ad_client_id, costelementtype: 'M', isactive: 'Y' }, ['m_costelement_id']).filter(function (e) { return e.costingmethod === 'S'; })[0];
    if (!ce) { trx.say('§MASTER-MCOST no Standard Costing element in the client (MCost.java:783-787)'); return; }
    var pid = prod[trx.idCol('m_product')], made = 0;
    trx.find('c_acctschema', { ad_client_id: prod.ad_client_id }, ['c_acctschema_id']).forEach(function (as) {
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

  // ── THE REGISTRY: one entry per model class, each hook citing its Java. Order inside afterNew = the order in the Java afterSave. ──────────
  // init = X_*(ctx,0) / M*.setInitialDefaults (applied by newPO and by BEFORE_SAVE of a new record); before = M*.beforeSave piece;
  // afterNew = afterSave(newRecord) steps; afterChange = afterSave steps for a changed record.
  var MASTER = {
    c_bpartner: {
      init: { iscustomer: 'Y', isprospect: 'Y', sendemail: 'N', isonetime: 'N', isvendor: 'N', issummary: 'N', isemployee: 'N', issalesrep: 'N', istaxexempt: 'N', ispotaxexempt: 'N', isdiscountprinted: 'N',   // MBPartner.setInitialDefaults :276-304
        so_creditlimit: 0, so_creditused: 0, totalopenbalance: 0, socreditstatus: 'X', actuallifetimevalue: 0, potentiallifetimevalue: 0, acqusitioncost: 0, shareofcustomer: 0, salesvolume: 0 },
      afterNew: [   // MBPartner.afterSave :976-990
        function (trx, r) { insertTree(trx, 'c_bpartner', r, 'BP'); updateTreeNotPorted(trx, r, 'BP'); },
        function (trx, r) { insertAccounting(trx, 'c_bpartner', r, 'c_bp_customer_acct', 'c_bp_group_acct', { c_bp_group_id: r.c_bp_group_id }); },
        function (trx, r) { insertAccounting(trx, 'c_bpartner', r, 'c_bp_vendor_acct', 'c_bp_group_acct', { c_bp_group_id: r.c_bp_group_id }); } ] },
    m_cost: { init: { m_attributesetinstance_id: 0, currentcostprice: 0, futurecostprice: 0, currentqty: 0, cumulatedamt: 0, cumulatedqty: 0 } },                     // MCost.setInitialDefaults :1619-1627
    c_location: { before: function (trx, r) { if (nz(r.ad_org_id)) r.ad_org_id = 0; } },                                                                              // MLocation.beforeSave :721-722
    m_costelement: { before: function (trx, r) { if (nz(r.ad_org_id)) r.ad_org_id = 0; } },                                                                            // MCostElement.beforeSave :360-361
    c_bankaccount: { afterNew: [function (trx, r) { insertAccounting(trx, 'c_bankaccount', r, 'c_bankaccount_acct', 'c_acctschema_default', null); }] },              // MBankAccount.afterSave :220-226
    c_tax: { afterNew: [function (trx, r) { insertAccounting(trx, 'c_tax', r, 'c_tax_acct', 'c_acctschema_default', null); }] },                                       // MTax.afterSave :400-407
    m_product: {
      afterNew: [   // MProduct.afterSave :866-905: accounting + tree for a new product, then MCost.create (new, or category changed)
        function (trx, r) { insertAccounting(trx, 'm_product', r, 'm_product_acct', 'm_product_category_acct', { m_product_category_id: r.m_product_category_id }); },
        function (trx, r) { insertTree(trx, 'm_product', r, 'PR'); updateTreeNotPorted(trx, r, 'PR'); },
        function (trx, r) { mcostCreate(trx, r); } ],
      afterChange: [function (trx, r, old) { if (old && !same(old.m_product_category_id, r.m_product_category_id)) mcostCreate(trx, r); }] }
  };

  function install(registry) {
    Object.keys(registry).forEach(function (table) {
      var spec = registry[table], impl = {};
      if (spec.init) impl.initialDefaults = spec.init;
      if (spec.before) impl.beforeSave = function (trx, rec, isNew, old) { spec.before(trx, rec, isNew, old); return null; };
      if (spec.afterNew || spec.afterChange) impl.afterSave = function (trx, row, isNew, old) {
        (isNew ? spec.afterNew || [] : spec.afterChange || []).forEach(function (step) { step(trx, row, old); });
        return null;
      };
      ML.registerModel(table, impl);
    });
    return Object.keys(registry);
  }
  var installed = install(MASTER);

  return { MASTER: MASTER, install: install, installed: installed, insertAccounting: insertAccounting, insertTree: insertTree, mcostCreate: mcostCreate };
});
