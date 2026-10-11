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

  return { MASTER: MASTER, install: install, installed: installed, insertAccounting: insertAccounting, insertTree: insertTree, mcostCreate: mcostCreate };
});
