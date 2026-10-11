#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MASTER-SAVE-RULES (bim-compiler prompts/SQLiteIDEMPIERE.md §G-SD2-PORT; CARDINAL RULE: a master saved through the shipped model layer
//   yields the same defaults / child rows / sequence values as legacy iDempiere). READ THE LOG after every run: every verdict is a §-line, the exit code is not evidence.
// THE ISSUE it proves/disproves: before erp/model_master.js the shipped ModelLayer.save of a BP / Product / Bank account / Tax / Location / Cost element wrote ONLY the
//   row (no PO.insert_Accounting, no PO.insert_Tree, no MCost.create, no setInitialDefaults of MBPartner/MCost, no org-0 rule). Expected values are NOT taken from the code under
//   test: (1) ORACLE-LEGACY first proves the rule on rows LEGACY itself created in the shipped seed (every existing BP/product/bank account/tax account row equals its
//   group/category/default source row) -- the denominator is printed; (2) each case then computes the expected child rows with its own SQL from those source rows.
//   MS-*-NEG are negative controls (a table with no rule gets nothing; a re-fire adds nothing = NOT EXISTS). A case that cannot be driven prints INCONCLUSIVE, never PASS.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §MS-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§MS case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

(async function main() {
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // idempiere.html's FS-15 self-heal loader, statement by statement
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  log('§MS-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });   // crud_overlay.js:364 — the host registers the PL/pgSQL ports
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MV = require(path.join(ERP, 'ad_modelval.js'));

  function q(sql, params) {                                                  // crud_overlay._modelQuery: lower-case row keys
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  // apply an op-group the way commitGroup + the listTip fold do (CREATE gets a fresh key, {__opRef} resolved, UPDATE/DELETE by key)
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function apply(ops) {
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  function run(spec) { var r = ML.run(q, env(), spec); (r.log || []).forEach(function (l) { if (/§MODEL-(ERR|SEVERE|POST|NAMED|UNPORTED)/.test(l)) log('    ' + String(l).slice(0, 300)); }); if (r.ok) apply(r.ops); return r; }
  function one(sql, p) { return q(sql, p || [])[0] || null; }

  function all(sql, p) { return q(sql, p || []); }
  function sameRows(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function ACC(acctTable) { return all("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.ad_reference_id=25 AND c.isactive='Y' ORDER BY c.columnname", [acctTable]).map(function (r) { return r.c; }); }
  function pick(rows, cols) { return rows.map(function (r) { var o = {}; cols.forEach(function (c) { o[c] = r[c]; }); return o; }); }
  var schemas = all('SELECT * FROM c_acctschema WHERE ad_client_id=11 ORDER BY c_acctschema_id');
  var trees = function (tt) { return all("SELECT ad_tree_id FROM ad_tree WHERE ad_client_id=11 AND isactive='Y' AND isallnodes='Y' AND treetype=? ORDER BY ad_tree_id", [tt]).map(function (r) { return r.ad_tree_id; }); };
  var STD = { ad_org_id: 11 };

  // ── ORACLE-LEGACY: rows legacy created in the seed obey the rule the model is about to apply ──
  function oracle(id, rule, sql) { var r = one(sql); verdict(id, [eq('denominator', 'legacy-created rows exist to judge (else INCONCLUSIVE)', r.n > 0, true), eq('all_follow', rule, r.n - r.ok, 0)].slice(0, r.n > 0 ? 2 : 1)); log('§MS-ORACLE ' + id + ' rows=' + r.n + ' following=' + r.ok); }
  oracle('MS-ORACLE-BP', 'every legacy C_BP_Customer_Acct == its BP group acct (PO.insert_Accounting :4907)', "SELECT COUNT(*) n, SUM(a.c_receivable_acct IS g.c_receivable_acct AND a.c_receivable_services_acct IS g.c_receivable_services_acct AND a.c_prepayment_acct=g.c_prepayment_acct) ok FROM c_bp_customer_acct a JOIN c_bpartner b ON b.c_bpartner_id=a.c_bpartner_id JOIN c_bp_group_acct g ON g.c_bp_group_id=b.c_bp_group_id AND g.c_acctschema_id=a.c_acctschema_id WHERE b.ad_client_id=11");
  oracle('MS-ORACLE-PRODUCT', 'every legacy M_Product_Acct == its category acct', "SELECT COUNT(*) n, SUM(a.p_revenue_acct=g.p_revenue_acct AND a.p_asset_acct=g.p_asset_acct AND a.p_cogs_acct=g.p_cogs_acct AND a.p_purchasepricevariance_acct=g.p_purchasepricevariance_acct) ok FROM m_product_acct a JOIN m_product b ON b.m_product_id=a.m_product_id JOIN m_product_category_acct g ON g.m_product_category_id=b.m_product_category_id AND g.c_acctschema_id=a.c_acctschema_id WHERE b.ad_client_id=11");
  oracle('MS-ORACLE-BANK', 'every legacy C_BankAccount_Acct == C_AcctSchema_Default', "SELECT COUNT(*) n, SUM(a.b_asset_acct=g.b_asset_acct AND a.b_intransit_acct=g.b_intransit_acct AND a.b_unallocatedcash_acct=g.b_unallocatedcash_acct) ok FROM c_bankaccount_acct a JOIN c_acctschema_default g ON g.c_acctschema_id=a.c_acctschema_id WHERE a.ad_client_id=11");
  oracle('MS-ORACLE-TAX', 'every legacy C_Tax_Acct == C_AcctSchema_Default', "SELECT COUNT(*) n, SUM(a.t_due_acct=g.t_due_acct AND a.t_credit_acct=g.t_credit_acct) ok FROM c_tax_acct a JOIN c_acctschema_default g ON g.c_acctschema_id=a.c_acctschema_id WHERE a.ad_client_id=11");

  function save(table, fields) { var r = run({ table: table, timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), table, Object.assign({}, STD, fields)) }); var hasId = colsOf(table).indexOf(table + '_id') >= 0; r.id = r.ok && hasId ? one('SELECT MAX(' + table + '_id) AS id FROM ' + table).id : null; return r; }
  function acctExpect(acctTable, pkCol, id, baseSql, baseP) {   // the independent expectation: base rows copied for ref-25 columns only
    var cols = ACC(acctTable), want = all(baseSql, baseP).map(function (b) { var o = { c_acctschema_id: b.c_acctschema_id, ad_org_id: 0, isactive: 'Y', ad_client_id: 11 }; cols.forEach(function (c) { o[c] = b[c]; }); return o; });
    var keys = ['c_acctschema_id', 'ad_org_id', 'isactive', 'ad_client_id'].concat(cols), got = pick(all('SELECT * FROM ' + acctTable + ' WHERE ' + pkCol + '=? ORDER BY c_acctschema_id', [id]), keys);
    return { want: want, got: got, n: cols.length };
  }
  function treeExpect(node, id) { return trees(node === 'ad_treenodebp' ? 'BP' : 'PR').map(function (t) { return { ad_tree_id: t, node_id: id, parent_id: 0, seqno: 999, ad_org_id: 0, isactive: 'Y', ad_client_id: 11 }; }); }
  function treeGot(node, id) { return pick(all('SELECT * FROM ' + node + ' WHERE node_id=? ORDER BY ad_tree_id', [id]), ['ad_tree_id', 'node_id', 'parent_id', 'seqno', 'ad_org_id', 'isactive', 'ad_client_id']); }

  // ── MS-BP: MBPartner.setInitialDefaults + saveNew Value + DDL default + afterSave (tree, customer + vendor acct) ──
  var seqBP0 = one("SELECT currentnext AS n, incrementno AS i FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_C_BPartner'");
  var rb = save('c_bpartner', { name: 'MS Test Partner', c_bp_group_id: 103, value: '' }); var bpId = rb.id, bp = bpId ? one('SELECT * FROM c_bpartner WHERE c_bpartner_id=?', [bpId]) : null;
  if (!rb.ok) log('§MS-NOTE bp refused: ' + (rb.error || rb.msg));
  var cu = bp ? acctExpect('c_bp_customer_acct', 'c_bpartner_id', bpId, 'SELECT * FROM c_bp_group_acct WHERE ad_client_id=11 AND c_bp_group_id=103 ORDER BY c_acctschema_id') : null, ve = bp ? acctExpect('c_bp_vendor_acct', 'c_bpartner_id', bpId, 'SELECT * FROM c_bp_group_acct WHERE ad_client_id=11 AND c_bp_group_id=103 ORDER BY c_acctschema_id') : null;
  verdict('MS-BP', !bp ? [] : [
    eq('ctor_defaults', 'MBPartner.setInitialDefaults :276-304 (Customer+Prospect Y, Vendor N, credit status X, credit limit 0)', { c: bp.iscustomer, p: bp.isprospect, v: bp.isvendor, s: bp.socreditstatus, l: Number(bp.so_creditlimit) }, { c: 'Y', p: 'Y', v: 'N', s: 'X', l: 0 }),
    eq('ctor_beats_ddl', 'the class ctor wins over the physical DEFAULT (ad_ddl_default c_bpartner.socreditstatus is O, isprospect N) -- PO.doInsert omits only NULLs', bp.socreditstatus !== 'O' && bp.isprospect === 'Y', true),
    eq('ddl_fills_rest', 'a column the ctor leaves NULL takes its DB DEFAULT (is1099vendor N, ismanufacturer N)', [bp.is1099vendor, bp.ismanufacturer], ['N', 'N']),
    eq('value_sequence', 'PO.saveNew :3563-3605 Value from AD_Sequence DocumentNo_C_BPartner = CurrentNext at save', String(bp.value), String(seqBP0.n)),
    eq('sequence_advanced', 'CurrentNext += IncrementNo in the same group', one("SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_C_BPartner'").n, Number(seqBP0.n) + Number(seqBP0.i)),
    eq('tree_node', 'PO.insert_Tree(BP): one node (parent 0, seqno 999, org 0) per standard BP tree of the client', treeGot('ad_treenodebp', bpId), treeExpect('ad_treenodebp', bpId)),
    eq('customer_acct_rows', 'insert_Accounting(C_BP_Customer_Acct, C_BP_Group_Acct): one row per group-acct schema', cu.got.length, cu.want.length),
    eq('customer_acct_values', 'the Account columns equal the group row (' + cu.n + ' ref-25 columns)', cu.got, cu.want),
    eq('vendor_acct_values', 'insert_Accounting(C_BP_Vendor_Acct, C_BP_Group_Acct)', ve.got, ve.want),
    eq('denominator', 'not vacuous: the group has acct rows to copy', cu.want.length > 0 && ve.want.length > 0, true)]);
  // window path: BEFORE_SAVE (class defaults) -> host writes the row -> AFTER_SAVE (afterSave ops) must give the SAME children
  var recW = { ad_client_id: 11, ad_org_id: 11, isactive: 'Y', name: 'MS Window Partner', c_bp_group_id: 103, value: 'MS-WIN-1' }, bsv = run({ table: 'c_bpartner', timing: 'BEFORE_SAVE', record: recW, isNew: true });
  var wId = newId('c_bpartner'); db.run('INSERT INTO c_bpartner (c_bpartner_id, ad_client_id, ad_org_id, isactive, name, value, c_bp_group_id, iscustomer, isprospect, socreditstatus) VALUES (?,11,11,\'Y\',?,?,103,?,?,?)', [wId, recW.name, recW.value, bsv.derived.iscustomer, bsv.derived.isprospect, bsv.derived.socreditstatus]);
  var asv = run({ table: 'c_bpartner', timing: 'AFTER_SAVE', isNew: true, record: Object.assign({ c_bpartner_id: wId }, recW) });
  verdict('MS-BP-WINDOW-PATH', [eq('before_save_defaults', 'BEFORE_SAVE of a new BP fills the class defaults the form left empty', [bsv.derived.iscustomer, bsv.derived.isprospect, bsv.derived.socreditstatus], ['Y', 'Y', 'X']),
    eq('after_save_children', 'AFTER_SAVE of the host-written row creates tree + both acct sets exactly like the SAVE path', [treeGot('ad_treenodebp', wId).length, acctExpect('c_bp_customer_acct', 'c_bpartner_id', wId, 'SELECT * FROM c_bp_group_acct WHERE c_bp_group_id=103 ORDER BY c_acctschema_id').got.length, acctExpect('c_bp_vendor_acct', 'c_bpartner_id', wId, 'SELECT * FROM c_bp_group_acct WHERE c_bp_group_id=103 ORDER BY c_acctschema_id').got.length], [trees('BP').length, cu ? cu.want.length : -1, ve ? ve.want.length : -1])]);
  // NEG: re-firing the afterSave adds nothing (NOT EXISTS :5007-5013 / :5067-5086)
  var nT = one('SELECT COUNT(*) n FROM ad_treenodebp').n, nA = one('SELECT COUNT(*) n FROM c_bp_customer_acct').n;
  run({ table: 'c_bpartner', timing: 'AFTER_SAVE', isNew: true, record: Object.assign({ c_bpartner_id: wId }, recW) });
  verdict('MS-BP-NEG-IDEMPOTENT', [eq('no_dupes', 'NEG-CONTROL a second afterSave of the same record inserts no second tree node / acct row', [one('SELECT COUNT(*) n FROM ad_treenodebp').n - nT, one('SELECT COUNT(*) n FROM c_bp_customer_acct').n - nA], [0, 0])]);
  // NEG: a table with no registered master rule gets nothing (the hook is by registry, not by luck)
  var nC = one('SELECT COUNT(*) n FROM c_bp_customer_acct').n, rl = save('c_bpartner_location', { c_bpartner_id: bpId, c_location_id: one('SELECT MIN(c_location_id) AS l FROM c_location').l, name: 'MS loc' });
  verdict('MS-NEG-NO-RULE-TABLE', [eq('saved', 'the unregistered table saves', rl.ok, true), eq('no_acct', 'NEG-CONTROL saving a BP location creates no acct row (it has no afterSave rule)', one('SELECT COUNT(*) n FROM c_bp_customer_acct').n - nC, 0)]);

  // ── MS-PRODUCT: afterSave = M_Product_Acct from the category, PR tree, MCost.create (Standard Costing element) ──
  var seqP0 = one("SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_M_Product'");
  var rp = save('m_product', { name: 'MS Test Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: '' }); var pId = rp.id, pr = pId ? one('SELECT * FROM m_product WHERE m_product_id=?', [pId]) : null;
  if (!rp.ok) log('§MS-NOTE product refused: ' + (rp.error || rp.msg));
  var pa = pr ? acctExpect('m_product_acct', 'm_product_id', pId, 'SELECT * FROM m_product_category_acct WHERE ad_client_id=11 AND m_product_category_id=105 ORDER BY c_acctschema_id') : null;
  var ce = one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND costelementtype='M' AND costingmethod='S' AND isactive='Y' ORDER BY m_costelement_id");
  var wantCost = schemas.map(function (s) { return { m_costelement_id: ce && ce.id, c_acctschema_id: s.c_acctschema_id, m_costtype_id: s.m_costtype_id, ad_org_id: 0, ad_client_id: 11, m_attributesetinstance_id: 0, currentcostprice: 0, futurecostprice: 0, currentqty: 0, cumulatedamt: 0, cumulatedqty: 0, isactive: 'Y' }; });
  var gotCost = pr ? pick(all('SELECT * FROM m_cost WHERE m_product_id=? ORDER BY c_acctschema_id', [pId]), Object.keys(wantCost[0])) : [];
  verdict('MS-PRODUCT', !pr ? [] : [
    eq('ddl_defaults', 'DB DEFAULTs of the omitted columns (producttype I, issold Y, ispurchased Y, isstocked Y, unitsperpack 1)', [pr.producttype, pr.issold, pr.ispurchased, pr.isstocked, Number(pr.unitsperpack)], ['I', 'Y', 'Y', 'Y', 1]),
    eq('value_sequence', 'PO.saveNew Value from DocumentNo_M_Product', String(pr.value), String(seqP0.n)),
    eq('product_acct', 'insert_Accounting(M_Product_Acct, M_Product_Category_Acct): ' + pa.n + ' ref-25 columns per schema', pa.got, pa.want),
    eq('tree_node', 'insert_Tree(PR)', treeGot('ad_treenodepr', pId), treeExpect('ad_treenodepr', pId)),
    eq('mcost_create', 'MCost.create :775-852 (costing level Client): one zero Standard-Costing M_Cost per schema at org 0', gotCost, wantCost),
    eq('denominator', 'not vacuous: Standard element, schemas and category acct rows exist', !!ce && schemas.length > 0 && pa.want.length > 0, true)]);
  // costing level Organization ('O'): one record per non-summary org of the client (AD_OrgOnly 0); Batch/Lot ('B'): none; category change on an existing product: nothing new when present
  db.run("UPDATE c_acctschema SET costinglevel='O' WHERE ad_client_id=11"); var rpo = save('m_product', { name: 'MS Org-level Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: 'MS-ORG-1' });
  var orgsOK = all("SELECT ad_org_id FROM ad_org WHERE ad_client_id=11 AND isactive='Y' AND issummary<>'Y' ORDER BY ad_org_id").map(function (r) { return r.ad_org_id; });
  var gotO = rpo.ok ? all('SELECT c_acctschema_id, ad_org_id FROM m_cost WHERE m_product_id=? ORDER BY c_acctschema_id, ad_org_id', [rpo.id]) : [], wantO = []; schemas.forEach(function (s) { orgsOK.forEach(function (o) { wantO.push({ c_acctschema_id: s.c_acctschema_id, ad_org_id: o }); }); });
  db.run("UPDATE c_acctschema SET costinglevel='B' WHERE ad_client_id=11"); var rpb = save('m_product', { name: 'MS Batch-level Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: 'MS-BATCH-1' });
  var nB_ = rpb.ok ? one('SELECT COUNT(*) n FROM m_cost WHERE m_product_id=?', [rpb.id]).n : -1;
  db.run("UPDATE c_acctschema SET costinglevel='C' WHERE ad_client_id=11");
  verdict('MS-PRODUCT-COSTLEVEL', [eq('org_level', 'MCost.create :816-834: Organization level => a record per non-summary org of the client (' + orgsOK.length + ' orgs x ' + schemas.length + ' schemas)', gotO, wantO),
    eq('batch_level_none', 'NEG-CONTROL Batch/Lot level => "Not created" (:843-845), no M_Cost', nB_, 0), eq('denominator', 'orgs exist', orgsOK.length > 1, true)]);
  // MProduct.afterSave on a CHANGE: the category change re-runs MCost.create but the existing record is found (no duplicate)
  var nM = one('SELECT COUNT(*) n FROM m_cost WHERE m_product_id=?', [pId]).n, rch = run({ table: 'm_product', timing: 'SAVE', id: pId, changes: { m_product_category_id: 101 } });
  verdict('MS-PRODUCT-NEG-CATEGORY-CHANGE', [eq('saved', 'category change saves', rch.ok, true), eq('no_dupes', 'NEG-CONTROL MCost.get finds the existing record: no second M_Cost; no second acct/tree row (afterSave newRecord arms only)', [one('SELECT COUNT(*) n FROM m_cost WHERE m_product_id=?', [pId]).n - nM, one('SELECT COUNT(*) n FROM m_product_acct WHERE m_product_id=?', [pId]).n, one('SELECT COUNT(*) n FROM ad_treenodepr WHERE node_id=?', [pId]).n], [0, pa ? pa.want.length : -1, trees('PR').length])]);

  // ── MS-BANK / MS-TAX: acct rows from C_AcctSchema_Default (base has no WHERE) ──
  var seqB0 = one("SELECT currentnext AS n FROM ad_sequence WHERE ad_client_id=11 AND name='DocumentNo_C_BankAccount'");
  var rk = save('c_bankaccount', { c_bank_id: one('SELECT MIN(c_bank_id) AS b FROM c_bank WHERE ad_client_id=11').b, c_currency_id: 100, accountno: 'MS-001', bankaccounttype: 'C' }), ka = rk.ok ? acctExpect('c_bankaccount_acct', 'c_bankaccount_id', rk.id, 'SELECT * FROM c_acctschema_default WHERE ad_client_id=11 ORDER BY c_acctschema_id') : null;
  if (!rk.ok) log('§MS-NOTE bank account refused: ' + (rk.error || rk.msg));
  verdict('MS-BANK', !ka ? [] : [eq('acct', 'MBankAccount.afterSave :220-226 -> insert_Accounting(C_BankAccount_Acct, C_AcctSchema_Default): ' + ka.n + ' columns per schema', ka.got, ka.want), eq('ddl', 'DB DEFAULT isdefault N, creditlimit 0', [one('SELECT isdefault, creditlimit FROM c_bankaccount WHERE c_bankaccount_id=?', [rk.id]).isdefault, Number(one('SELECT creditlimit FROM c_bankaccount WHERE c_bankaccount_id=?', [rk.id]).creditlimit)], ['N', 0]),
    eq('denominator', 'defaults exist', ka.want.length > 0, true)]);
  var rt = save('c_tax', { name: 'MS Tax 10%', rate: 10, c_taxcategory_id: 107, validfrom: '1990-01-01 00:00:00', sopotype: 'B', c_country_id: 100, to_country_id: 100 }), ta = rt.ok ? acctExpect('c_tax_acct', 'c_tax_id', rt.id, 'SELECT * FROM c_acctschema_default WHERE ad_client_id=11 ORDER BY c_acctschema_id') : null;
  if (!rt.ok) log('§MS-NOTE tax refused: ' + (rt.error || rt.msg));
  verdict('MS-TAX', !ta ? [] : [eq('acct', 'MTax.afterSave :400-407 -> insert_Accounting(C_Tax_Acct, C_AcctSchema_Default): ' + ta.n + ' columns per schema', ta.got, ta.want), eq('denominator', 'defaults exist', ta.want.length > 0, true)]);

  // ── MS-ORG0: beforeSave org-0 rules (MLocation :721-722, MCostElement :360-361); NEG: an unregistered table keeps the caller's org ──
  var rloc = save('c_location', { address1: '1 MS Road', city: 'MS City', c_country_id: 100 }), rce = save('m_costelement', { name: 'MS Elem', costingmethod: 'F', costelementtype: 'M', iscalculated: 'N' }), rkeep = save('c_bpartner_location', { c_bpartner_id: bpId, c_location_id: rloc.id, name: 'MS keep org' });
  verdict('MS-ORG0', [eq('location_org0', 'MLocation.beforeSave: AD_Org_ID forced to 0', rloc.ok && one('SELECT ad_org_id o FROM c_location WHERE c_location_id=?', [rloc.id]).o, 0),
    eq('costelement_org0', 'MCostElement.beforeSave: AD_Org_ID forced to 0', rce.ok && one('SELECT ad_org_id o FROM m_costelement WHERE m_costelement_id=?', [rce.id]).o, 0),
    eq('neg_other_keeps_org', 'NEG-CONTROL C_BPartner_Location (no org rule) keeps org 11', rkeep.ok && one('SELECT ad_org_id o FROM c_bpartner_location WHERE c_bpartner_location_id=?', [rkeep.id]).o, 11)]);
  // MCost ctor defaults reach a hand-made M_Cost row (Product Costs window)
  var rmc = save('m_cost', { m_product_id: pId, m_costelement_id: one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND name='Average PO'").id, c_acctschema_id: schemas[0].c_acctschema_id, m_costtype_id: schemas[0].m_costtype_id, ad_org_id: 0, currentcostprice: 60 }), mc = rmc.ok ? one('SELECT * FROM m_cost WHERE m_cost_uu IS NOT NULL ORDER BY rowid DESC LIMIT 1') : null;
  verdict('MS-MCOST-CTOR', !mc ? [] : [eq('defaults', 'MCost.setInitialDefaults :1619-1627: ASI 0, CurrentQty/CumulatedAmt/CumulatedQty/FutureCostPrice 0; the caller\'s CurrentCostPrice 60 stays', [Number(mc.m_attributesetinstance_id), Number(mc.currentqty), Number(mc.cumulatedamt), Number(mc.cumulatedqty), Number(mc.futurecostprice), Number(mc.currentcostprice)], [0, 0, 0, 0, 0, 60])]);

  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§MS_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();
