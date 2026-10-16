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
  var cols = {}, nextId = {}, dropped = [];   // dropped = fields an op carried for a column the table does not have (the host fold would carry them as dead data): the witness FAILS on any
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function apply(ops) {
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) { dropped.push(t + '.' + k); delete f[k]; } });
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
  function oracle(id, rule, sql) { var r = one(sql); log('§MS-ORACLE ' + id + ' rows=' + r.n + ' following=' + r.ok); verdict(id, r.n > 0 ? [eq('denominator', 'legacy-created rows exist to judge', true, true), eq('all_follow', rule, r.n - r.ok, 0)] : []); }
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
  // window path -- the REAL host route: BEFORE_SAVE (ML.run, as crud_overlay.fireBeforeSaveHooks) -> derived values ride the op's fields (CREATE keeps every derived value, crud_overlay :1148)
  // -> the fold stamps Client/Org/IsActive/... from stdDefaults ONLY when the field is missing (crud_core.js :438-452) -> AFTER_SAVE through crud_overlay's OWN _modelAfterSave
  // (its source is extracted from the shipped file and run against this db; the form supplies NO ad_client_id / ad_org_id, as a real window does).
  var OV = fs.readFileSync(path.join(ERP, 'crud_overlay.js'), 'utf8'), vm = require('vm');
  function fnSrc(name) { var i = OV.indexOf('  function ' + name + '('); if (i < 0) return null; var d = 0, j = OV.indexOf('{', i); for (var k = j; k < OV.length; k++) { if (OV[k] === '{') d++; else if (OV[k] === '}' && --d === 0) return OV.slice(i, k + 1); } return null; }
  var ovSrc = ['_modelQuery', '_modelEnv', '_needThen', '_noteTouched', '_modelRunNow', 'modelRun', '_modelAfterSave'].map(fnSrc);   // + the lazy-activation seam helpers modelRun now calls (Host work H2)
  var ovOk = ovSrc.every(Boolean), hostLogs = [], HOSTCTX = null;
  if (ovOk) { HOSTCTX = vm.createContext({ console: { log: function (l) { hostLogs.push(String(l)); }, warn: function () {} }, SIDE: null, _tipShadowOn: function () { return []; }, _tipShadowOff: function () {},
    withBundle: function (cb) { cb(db); }, Date: Date, global: { ModelLayer: ML, AdModelVal: MV, APP: { clientId: 11, orgId: 11, actor: 100 }, crypto: require('crypto').webcrypto } });
    vm.runInContext(ovSrc.join('\n') + '\nthis._modelAfterSave = _modelAfterSave;', HOSTCTX); }
  // the window save of a NEW row: returns { before, rowId, afterOps }. fields = what the FORM typed (no tenant columns).
  function windowSave(table, fields) {
    var bs = run({ table: table, timing: 'BEFORE_SAVE', record: Object.assign({}, fields), isNew: true }), vals = Object.assign({}, fields, bs.derived || {});
    var cs = colsOf(table), have = {}; Object.keys(vals).forEach(function (k) { have[k] = 1; });
    var row = Object.assign({}, vals);                                                         // crud_core fold stamping, only-when-missing
    if (cs.indexOf('ad_client_id') >= 0 && !have.ad_client_id) row.ad_client_id = 11; if (cs.indexOf('ad_org_id') >= 0 && !have.ad_org_id) row.ad_org_id = 11;
    if (cs.indexOf('isactive') >= 0 && !have.isactive) row.isactive = 'Y';
    row[table + '_id'] = -1;                                                                    // the fold's synthetic key (-opId) = rec[pk] = -nextId in _modelAfterSave
    var ks = Object.keys(row).filter(function (k) { if (cs.indexOf(k) < 0) { dropped.push(table + '.' + k); return false; } return true; });
    db.run('INSERT INTO ' + table + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return row[k] === undefined ? null : row[k]; }));
    var res = null; HOSTCTX._cb = function (ops) { res = ops; };
    vm.runInContext('_modelAfterSave({ op_type: "CRUD_CREATE", table: ' + JSON.stringify(table) + ', fields: ' + JSON.stringify(fields) + ' }, { exec: function () { throw new Error("no kernel_ops"); } }, _cb)', HOSTCTX);
    var ops = res || []; apply(ops);
    return { before: bs, rowId: -1, afterOps: ops, row: row, fields: fields };
  }
  var ww = ovOk ? windowSave('c_bpartner', { name: 'MS Window Partner', c_bp_group_id: 103, value: 'MS-WIN-1' }) : null, wId = -1;
  var cuW = ww ? acctExpect('c_bp_customer_acct', 'c_bpartner_id', wId, 'SELECT * FROM c_bp_group_acct WHERE c_bp_group_id=103 ORDER BY c_acctschema_id') : null, veW = ww ? acctExpect('c_bp_vendor_acct', 'c_bpartner_id', wId, 'SELECT * FROM c_bp_group_acct WHERE c_bp_group_id=103 ORDER BY c_acctschema_id') : null;
  verdict('MS-BP-WINDOW-PATH', !ww ? [] : [eq('before_save_defaults', 'BEFORE_SAVE of a new BP fills the class defaults the form left empty', [ww.before.derived.iscustomer, ww.before.derived.isprospect, ww.before.derived.socreditstatus], ['Y', 'Y', 'X']),
    eq('no_tenant_cols_supplied', 'the form supplied no ad_client_id/ad_org_id (the window path has none until the fold stamps it from stdDefaults)', ['ad_client_id', 'ad_org_id'].filter(function (k) { return k in ww.fields; }), []),
    eq('tree', 'AFTER_SAVE through crud_overlay._modelAfterSave creates the BP tree node(s)', treeGot('ad_treenodebp', wId), treeExpect('ad_treenodebp', wId)),
    eq('customer_acct', 'customer acct rows == group rows (same as the SAVE path)', cuW.got, cuW.want), eq('vendor_acct', 'vendor acct rows == group rows', veW.got, veW.want),
    eq('denominator', 'not vacuous: ops were produced and the group has acct rows', ww.afterOps.length > 0 && cuW.want.length > 0, true)]);
  var wl = ovOk ? windowSave('c_location', { address1: '2 Window Road', city: 'MS City', c_country_id: 100 }) : null;
  verdict('MS-ORG0-WINDOW', !wl ? [] : [eq('derived_org0', 'MLocation.beforeSave sets org 0 unconditionally: BEFORE_SAVE derives ad_org_id 0 although the form had none', wl.before.derived.ad_org_id, 0),
    eq('row_org0', 'the fold stamps org 11 only when the field is missing: the model-set 0 survives', one('SELECT ad_org_id o FROM c_location WHERE c_location_id=-1').o, 0)]);
  // NEG: re-firing the afterSave adds nothing (NOT EXISTS :5007-5013 / :5067-5086)
  var nT = one('SELECT COUNT(*) n FROM ad_treenodebp').n, nA = one('SELECT COUNT(*) n FROM c_bp_customer_acct').n;
  run({ table: 'c_bpartner', timing: 'AFTER_SAVE', isNew: true, record: { c_bpartner_id: wId, name: 'MS Window Partner', c_bp_group_id: 103, value: 'MS-WIN-1' } });
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
  var lv0 = all('SELECT c_acctschema_id AS id, costinglevel AS l FROM c_acctschema WHERE ad_client_id=11 ORDER BY c_acctschema_id'), catOverride = all('SELECT COUNT(*) AS n FROM m_product_category_acct WHERE ad_client_id=11 AND costinglevel IS NOT NULL')[0].n;
  db.run("UPDATE c_acctschema SET costinglevel='O' WHERE ad_client_id=11"); var rpo = save('m_product', { name: 'MS Org-level Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: 'MS-ORG-1' });
  var orgsOK = all("SELECT ad_org_id FROM ad_org WHERE ad_client_id=11 AND isactive='Y' AND issummary<>'Y' ORDER BY ad_org_id").map(function (r) { return r.ad_org_id; });
  var gotO = rpo.ok ? all('SELECT c_acctschema_id, ad_org_id FROM m_cost WHERE m_product_id=? ORDER BY c_acctschema_id, ad_org_id', [rpo.id]) : [], wantO = []; schemas.forEach(function (s) { orgsOK.forEach(function (o) { wantO.push({ c_acctschema_id: s.c_acctschema_id, ad_org_id: o }); }); });
  db.run("UPDATE c_acctschema SET costinglevel='B' WHERE ad_client_id=11"); var rpb = save('m_product', { name: 'MS Batch-level Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: 'MS-BATCH-1' });
  var nB_ = rpb.ok ? one('SELECT COUNT(*) n FROM m_cost WHERE m_product_id=?', [rpb.id]).n : -1;
  lv0.forEach(function (x) { db.run('UPDATE c_acctschema SET costinglevel=? WHERE c_acctschema_id=?', [x.l, x.id]); });   // restore the ORIGINAL level of each schema
  verdict('MS-PRODUCT-COSTLEVEL', [eq('seed_level', 'precondition: the seed schemas are Client level (so MS-PRODUCT expected rows are right) and no category overrides it (MProduct.getCostingLevel :1064-1073)', [lv0.map(function (x) { return x.l; }), catOverride], [lv0.map(function () { return 'C'; }), 0]), eq('org_level', 'MCost.create :816-834: Organization level => a record per non-summary org of the client (' + orgsOK.length + ' orgs x ' + schemas.length + ' schemas)', gotO, wantO),
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
  var rmc = save('m_cost', { m_product_id: pId, m_costelement_id: one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND name='Average PO'").id, c_acctschema_id: schemas[0].c_acctschema_id, m_costtype_id: schemas[0].m_costtype_id, ad_org_id: 0, currentcostprice: 60 }), mc = rmc.ok ? one('SELECT * FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costelement_id=?', [pId, schemas[0].c_acctschema_id, one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND name='Average PO'").id]) : null;
  verdict('MS-MCOST-CTOR', !mc ? [] : [eq('defaults', 'MCost.setInitialDefaults :1619-1627: ASI 0, CurrentQty/CumulatedAmt/CumulatedQty/FutureCostPrice 0; the caller\'s CurrentCostPrice 60 stays', [Number(mc.m_attributesetinstance_id), Number(mc.currentqty), Number(mc.cumulatedamt), Number(mc.cumulatedqty), Number(mc.futurecostprice), Number(mc.currentcostprice)], [0, 0, 0, 0, 0, 60])]);

  // ── MS-ACCTSCHEMA (finding 3): MCost.create walks MAcctSchema.getClientAcctSchema (:132-186) ──
  var prim = Number((one('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=11') || {}).a || 0);
  function cloneRow(t, newId, extraSet) { db.run('CREATE TEMP TABLE _cl AS SELECT * FROM ' + t + ' WHERE c_acctschema_id=?', [schemas[0].c_acctschema_id]); db.run('UPDATE _cl SET c_acctschema_id=?' + (extraSet || ''), [newId]); db.run('INSERT INTO ' + t + ' SELECT * FROM _cl'); db.run('DROP TABLE _cl'); }
  function cloneSchema(newId, active, withGl, withDef) { cloneRow('c_acctschema', newId, ", isactive='" + active + "', name='MS clone " + newId + "'"); if (withGl) cloneRow('c_acctschema_gl', newId); if (withDef) cloneRow('c_acctschema_default', newId); }
  cloneSchema(900001, 'N', true, true); cloneSchema(900002, 'Y', false, false); cloneSchema(900003, 'Y', true, true);
  var rsx = run({ table: 'm_product', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'm_product', Object.assign({}, STD, { name: 'MS Schema Product', m_product_category_id: 105, c_uom_id: 100, c_taxcategory_id: 107, value: 'MS-SCHEMA-1' })) });
  var sxId = rsx.ok ? one('SELECT MAX(m_product_id) AS id FROM m_product').id : null;
  var wantSch = all("SELECT c_acctschema_id AS id FROM c_acctschema a WHERE ad_client_id=11 AND isactive='Y' AND EXISTS (SELECT 1 FROM c_acctschema_gl g WHERE g.c_acctschema_id=a.c_acctschema_id) AND EXISTS (SELECT 1 FROM c_acctschema_default d WHERE d.c_acctschema_id=a.c_acctschema_id) ORDER BY c_acctschema_id").map(function (r) { return r.id; });
  if (prim) wantSch = [prim].concat(wantSch.filter(function (x) { return x !== prim; }));
  var gotSch = rsx.ok ? rsx.ops.filter(function (o) { return o.table === 'm_cost'; }).map(function (o) { return o.fields.c_acctschema_id; }) : [];
  verdict('MS-ACCTSCHEMA', !rsx.ok ? [] : [eq('schemas_and_order', 'primary C_AcctSchema1 first, then active schemas WITH GL and Default rows by id; the inactive clone (900001) and the clone without GL/Default (900002) get no M_Cost, the complete clone (900003) does', gotSch, wantSch),
    eq('neg_inactive_excluded', 'NEG-CONTROL 900001 (inactive) and 900002 (no GL/Default) absent', gotSch.filter(function (x) { return x === 900001 || x === 900002; }), []), eq('complete_clone_included', 'positive control 900003 present', gotSch.indexOf(900003) >= 0, true),
    eq('denominator', 'a primary schema exists and the clone is not the only schema', prim > 0 && wantSch.length >= 2, true)]);
  ['c_acctschema', 'c_acctschema_gl', 'c_acctschema_default'].forEach(function (t) { db.run('DELETE FROM ' + t + ' WHERE c_acctschema_id IN (900001,900002,900003)'); });

  // ── MS-BP-GROUP (finding 4): MBPartner.beforeSave :959-973 + setBPGroup :892-908 ──
  var pl = all("SELECT m_pricelist_id AS id FROM m_pricelist WHERE ad_client_id=11 ORDER BY m_pricelist_id").map(function (r) { return r.id; }), gOld = one('SELECT * FROM c_bp_group WHERE c_bp_group_id=104');
  db.run('UPDATE c_bp_group SET m_pricelist_id=?, po_pricelist_id=? WHERE c_bp_group_id=104', [pl[0], pl[1]]);
  var rg = save('c_bpartner', { name: 'MS Group Partner', c_bp_group_id: 104, value: 'MS-GRP-1', m_pricelist_id: pl[1] }), bg = rg.ok ? one('SELECT * FROM c_bpartner WHERE c_bpartner_id=?', [rg.id]) : null;
  var nBpg = one('SELECT COUNT(*) n FROM c_bpartner').n, rbad = save('c_bpartner', { name: 'MS No Group', c_bp_group_id: 999999, value: 'MS-GRP-2' }), nBpg2 = one('SELECT COUNT(*) n FROM c_bpartner').n;
  var dflt = one("SELECT c_bp_group_id AS id FROM c_bp_group WHERE ad_client_id=11 AND isdefault='Y' ORDER BY isactive DESC"), rdf = save('c_bpartner', { name: 'MS Default Group Partner', value: 'MS-GRP-3' }), bdf = rdf.ok ? one('SELECT c_bp_group_id g FROM c_bpartner WHERE c_bpartner_id=?', [rdf.id]) : null;
  db.run('UPDATE c_bp_group SET m_pricelist_id=?, po_pricelist_id=? WHERE c_bp_group_id=104', [gOld.m_pricelist_id, gOld.po_pricelist_id]);
  verdict('MS-BP-GROUP', !bg ? [] : [eq('copied_unconditionally', 'setBPGroup copies the group\'s non-zero M_PriceList_ID / PO_PriceList_ID over the partner\'s own value (the form typed list ' + pl[1] + ')', [bg.m_pricelist_id, bg.po_pricelist_id], [pl[0], pl[1]]),
    eq('zero_not_copied', 'NEG-CONTROL a zero group value is not copied (C_Dunning_ID stays NULL/0)', Number(bg.c_dunning_id || 0), Number(gOld.c_dunning_id || 0) === 0 ? 0 : -1),
    eq('refused', 'unknown group => "@NotFound@: @C_BP_Group_ID@" refusal, nothing written', [rbad.ok, /NotFound/.test(String(rbad.error || rbad.msg)), nBpg2 - nBpg], [false, true, 0]),
    eq('default_group', 'no group typed => the client\'s IsDefault group (MBPGroup.getDefault :110-)', bdf && bdf.g, dflt && dflt.id), eq('denominator', 'prices lists and a default group exist', pl.length >= 2 && !!dflt, true)]);

  // ── MS-BANK-REFUSE (finding 5): MBankAccount.afterSave returns insert_Accounting's boolean (:222-225); MTax.afterSave ignores it (:400-407) ──
  db.run('CREATE TEMP TABLE _ms_def AS SELECT * FROM c_acctschema_default'); db.run('DELETE FROM c_acctschema_default');
  var nBa = one('SELECT COUNT(*) n FROM c_bankaccount').n, rkr = save('c_bankaccount', { c_bank_id: one('SELECT MIN(c_bank_id) AS b FROM c_bank WHERE ad_client_id=11').b, c_currency_id: 100, accountno: 'MS-REFUSE', bankaccounttype: 'C' }), nBa2 = one('SELECT COUNT(*) n FROM c_bankaccount').n;
  var rtn = save('c_tax', { name: 'MS Tax no defaults', rate: 5, c_taxcategory_id: 107, validfrom: '1990-01-01 00:00:00', sopotype: 'B', c_country_id: 100, to_country_id: 100 });
  db.run('INSERT INTO c_acctschema_default SELECT * FROM _ms_def'); db.run('DROP TABLE _ms_def');
  verdict('MS-BANK-REFUSE', [eq('bank_refused', 'no C_AcctSchema_Default rows => insert_Accounting false => the bank account save FAILS and writes nothing', [rkr.ok, /insert_Accounting/.test(String(rkr.error || rkr.msg)), nBa2 - nBa], [false, true, 0]),
    eq('tax_ignores', 'NEG-CONTROL MTax.afterSave ignores the result: the tax still saves', rtn.ok, true), eq('denominator', 'the default rows were really restored', one('SELECT COUNT(*) n FROM c_acctschema_default').n > 0, true)]);

  // ── MS-NOT-PORTED-LOG (finding 6): the afterSave work on a CHANGED record that this port does not do is logged, numbered ──
  var bpTree = one("SELECT ad_tree_id AS id FROM ad_tree WHERE ad_client_id=11 AND treetype='BP' AND isallnodes='Y'").id, vc0 = all('SELECT COUNT(*) AS n FROM c_validcombination WHERE c_bpartner_id=?', [bpId])[0].n;
  db.run("UPDATE ad_tree SET istreedrivenbyvalue='Y' WHERE ad_tree_id=?", [bpTree]);
  db.run('INSERT INTO c_validcombination (c_validcombination_id, ad_client_id, ad_org_id, isactive, c_acctschema_id, account_id, c_bpartner_id, combination) VALUES (?,11,0,\'Y\',?,?,?,\'MS\')', [newId('c_validcombination'), schemas[0].c_acctschema_id, one('SELECT MIN(account_id) AS a FROM c_validcombination').a, bpId]);
  var rv = run({ table: 'c_bpartner', timing: 'SAVE', id: bpId, changes: { value: 'MS-CHANGED', name: 'MS Test Partner 2' } }), lg = (rv.log || []).join('\n');
  db.run("UPDATE ad_tree SET istreedrivenbyvalue='N' WHERE ad_tree_id=?", [bpTree]);
  var rv2 = run({ table: 'c_bpartner', timing: 'SAVE', id: bpId, changes: { value: 'MS-CHANGED-2' } }), lg2 = (rv2.log || []).join('\n');
  var rv3 = run({ table: 'c_bpartner', timing: 'SAVE', id: bpId, changes: { description: 'only a description' } }), lg3 = (rv3.log || []).join('\n');
  db.run('DELETE FROM c_validcombination WHERE combination=\'MS\' AND c_bpartner_id=?', [bpId]);
  verdict('MS-NOT-PORTED-LOG', !rv.ok ? [] : [eq('np1_on_value_change', 'Value changed + a value-driven BP tree => NP-1 named', /§MASTER-NOT-PORTED NP-1 /.test(lg), true), eq('np2_on_value_or_name_change', 'Value/Name changed + a C_ValidCombination row for the BP => NP-2 named with rows=1', /§MASTER-NOT-PORTED NP-2 .*rows=1/.test(lg), true),
    eq('neg_no_driven_tree', 'NEG-CONTROL without a value-driven tree the value change names no NP-1', /NP-1/.test(lg2), false), eq('neg_unrelated_change', 'NEG-CONTROL a description-only change names nothing', /NOT-PORTED/.test(lg3), false), eq('denominator', 'precondition rows existed', vc0 === 0 && !!bpTree, true)]);

  // finding 8: a field an op carries for a column the table does not have is dead data on the host fold -- none of this witness's saves may produce one
  var inDict = function (tc) { var t = tc.split('.')[0], c = tc.split('.')[1]; return all('SELECT 1 AS x FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)=?', [t, c]).length > 0; };
  var gap = dropped.filter(inDict), dead = dropped.filter(function (x) { return !inDict(x); }), gapSet = {}; gap.forEach(function (x) { gapSet[x] = (gapSet[x] || 0) + 1; });
  log('§MS-NOTE seed-physical-gap (column is in the AD dictionary, absent from the shipped seed\'s slim physical table; a real DB has it): ' + JSON.stringify(gapSet));
  verdict('MS-NO-DROPPED-FIELDS', [eq('no_dead_fields', 'every field of every op group (SAVE and window path) is a column of the AD dictionary (a typo or invented column would be dead data on the host fold)', dead, []), eq('denominator', 'ops were applied', dropped.length >= 0 && results.length > 5, true)]);

  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§MS_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();
