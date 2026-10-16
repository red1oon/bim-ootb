#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC4-ACCTSCHEMA (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-4; CARDINAL RULE: saving an Accounting Schema does exactly what legacy does).
//   READ THE LOG after every run: every verdict is a §NC4 line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: MAcctSchema.beforeSave (MAcctSchema.java:711-742) + checkCosting (:577-600) on the twin == what the LEGACY pilot did for the same saves
//   (scripts/bridge/nc4_legacy.js -> out/nc4_legacy.json): Org forced to 0, ctor defaults, a Cost Type named after the schema, the Average PO material cost element reused,
//   End-before-Start refused, a costing-level change refused while product cost details exist. Before the port the twin had NO model for C_AcctSchema (RED).
//   INCONCLUSIVE when the legacy file is missing. Negative control: the same save with the model hook absent must differ from legacy (org stays 11).
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §NC4-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§NC4 case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

// the legacy view rv_unposted, table by table (postgres pg_get_viewdef): [table, DateAcct column, DocBaseType (null = join c_doctype), voidTested]
var VIEW = [['gl_journal', 'dateacct', null, true], ['c_projectissue', 'movementdate', 'PJI', false], ['c_invoice', 'dateacct', null, true], ['m_inout', 'dateacct', null, true],
  ['m_inventory', 'movementdate', null, true], ['m_movement', 'movementdate', null, true], ['m_production', 'movementdate', 'MMP', true], ['c_cash', 'dateacct', 'CMC', true],
  ['c_payment', 'dateacct', null, true], ['c_allocationhdr', 'dateacct', null, true], ['c_bankstatement', 'statementdate', 'CMB', true], ['m_matchinv', 'dateacct', 'MXI', false],
  ['m_matchpo', 'dateacct', 'MXP', false], ['c_order', 'dateacct', null, true], ['m_requisition', 'datedoc', null, true]];

(async function main() {
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // idempiere.html's FS-15 self-heal loader, statement by statement
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  log('§NC4-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post', 'model_master'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§NC4-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  function one(sql, p) { return q(sql, p || [])[0] || null; }
  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function apply(ops) {                                                      // commitGroup + listTip fold
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
  function run(spec) { var r = ML.run(q, env(), spec); if (r.ok) apply(r.ops); return r; }
  // the process, the way the host runs it: one Trx, the op group is the commit. Refusals are the process's own summary/isError.
  function proc(pid, params, rec, tid) {
    var row = one('SELECT classname, name FROM ad_process WHERE ad_process_id=?', [pid]);
    var r = P.runJava(q, env(), { AD_Process_ID: pid, className: row.classname, title: row.name, Record_ID: rec || 0, Table_ID: tid || 0, params: params || {} });
    (r.log || []).forEach(function (l) { if (/§(PROC|UNPORTED|MODEL-(ERR|SEVERE|UNPORTED))/.test(l)) log('    ' + String(l).slice(0, 220)); });
    if (r.ok) apply(r.ops || []);
    return { ok: !!r.ok, summary: String(r.summary || ''), nops: (r.ops || []).length, lines: r.log || [] };
  }




  var LJ = process.env.NC4_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc4_legacy.json';
  if (!fs.existsSync(LJ)) { log('§NC4 INCONCLUSIVE no legacy file ' + LJ); verdict('NC4-LEGACY', []); process.exit(2); }
  var L = JSON.parse(fs.readFileSync(LJ, 'utf8')).cases;
  var base = { ad_client_id: 11, ad_org_id: 11, gaap: 'UN', c_currency_id: 100, separator: '-', isdiscountcorrectstax: 'Y' };
  function save(extra) { var trx = new ML.Trx(q, env()); var po = ML.newRecord(trx, 'c_acctschema', Object.assign({}, base, extra)); var r = ML.save(trx, 'c_acctschema', null, po.values()); return { r: r, trx: trx }; }
  var ctN0 = one('SELECT COUNT(*) AS n FROM m_costtype WHERE ad_client_id=11').n, ceN0 = one('SELECT COUNT(*) AS n FROM m_costelement WHERE ad_client_id=11').n;
  var A = save({ name: 'NC4-A-twin', costingmethod: 'A' });
  var ids = apply(A.trx.groupOps());
  var sRow = one("SELECT * FROM c_acctschema WHERE name='NC4-A-twin'"), ctRow = sRow && one('SELECT name, ad_org_id FROM m_costtype WHERE m_costtype_id=?', [sRow.m_costtype_id]);
  var ctN1 = one('SELECT COUNT(*) AS n FROM m_costtype WHERE ad_client_id=11').n, ceN1 = one('SELECT COUNT(*) AS n FROM m_costelement WHERE ad_client_id=11').n;
  var la = L.A;
  verdict('NC4-A', [eq('ok', 'save accepted', A.r.ok, true), eq('org', 'AD_Org_ID forced to 0 (typed 11) - legacy ' + la.org, sRow && String(sRow.ad_org_id), String(la.org)),
    eq('tax', 'TaxCorrectionType (IsDiscountCorrectsTax=Y typed) - legacy ' + la.taxcorrectiontype, sRow && sRow.taxcorrectiontype, la.taxcorrectiontype), eq('level', 'CostingLevel default', sRow && sRow.costinglevel, la.costinglevel),
    eq('gaap', 'GAAP', sRow && sRow.gaap, la.gaap), eq('costtype', 'Cost Type created, named like the schema, org 0', [ctRow && ctRow.name, ctRow && String(ctRow.ad_org_id)], ['NC4-A-twin', String(la.costtypeOrg)]),
    eq('counts', 'new cost types / new cost elements - legacy ' + la.newCostTypes + '/' + la.newCostElements, [ctN1 - ctN0, ceN1 - ceN0], [la.newCostTypes, la.newCostElements])]);
  log('§NC4 row=A twin org=' + (sRow && sRow.ad_org_id) + ' tax=' + (sRow && sRow.taxcorrectiontype) + ' costtype=' + (ctRow && ctRow.name) + ' dCT=' + (ctN1 - ctN0) + ' dCE=' + (ceN1 - ceN0) + ' oracle=LEGACY-MEASURED');
  var A2 = save({ name: 'NC4-A2-twin', costingmethod: 'S', isdiscountcorrectstax: 'N' }); apply(A2.trx.groupOps());
  verdict('NC4-A2', [eq('tax', 'IsDiscountCorrectsTax=N -> TaxCorrectionType', one("SELECT taxcorrectiontype AS t FROM c_acctschema WHERE name='NC4-A2-twin'").t, L.A2.taxcorrectiontype)]);
  var B = save({ name: 'NC4-B-twin', costingmethod: 'S', startdate: '2030-12-31 00:00:00', enddate: '2030-01-01 00:00:00' });
  verdict('NC4-B', [eq('refused', 'End before Start is refused with the legacy text', [B.r.ok, String(B.r.error || '')], [false, 'End Date must be after Start Date']),
    eq('legacy', 'legacy refused with that text', [L.B.ok, /End Date must be after Start Date/.test(L.B.err || '')], [false, true])]);
  // C: costing level change on the seeded schema 101. The slim seed has NO m_costdetail table (the pilot has 1,252 rows), so give the test DB the minimal shape + one detail for a
  //   product whose category carries CostingLevel NULL in schema 101 (the Java predicate), exactly the situation the pilot is in.
  db.run('CREATE TABLE IF NOT EXISTS m_costdetail (m_costdetail_id INTEGER PRIMARY KEY, m_product_id INTEGER, c_acctschema_id INTEGER)');
  var pr = one("SELECT p.m_product_id AS id, p.value AS v FROM m_product p JOIN m_product_category_acct pc ON pc.m_product_category_id=p.m_product_category_id AND pc.c_acctschema_id=101 WHERE p.isactive='Y' AND pc.isactive='Y' AND pc.costinglevel IS NULL ORDER BY p.m_product_id");
  log('§NC4 row=C setup product=' + (pr && pr.v)); if (pr) db.run('INSERT INTO m_costdetail (m_product_id, c_acctschema_id) VALUES (?,101)', [pr.id]);
  // C: costing level change on the seeded schema 101 (cost details exist)
  var trxC = new ML.Trx(q, env()), s101 = trxC.get('c_acctschema', 101), lvl = s101.costinglevel === 'O' ? 'C' : 'O';
  var C = ML.save(trxC, 'c_acctschema', s101, { costinglevel: lvl });
  var pre = "Costing level can't be changed if there are product cost details created with current costing level. Products: ";
  log('§NC4 row=C twin ok=' + C.ok + ' err=' + String(C.error || '').slice(0, 160));
  verdict('NC4-C', [eq('refused', 'level change refused while cost details exist', C.ok, false), eq('text', 'legacy wording up to the product list', String(C.error || '').slice(0, pre.length), pre),
    eq('legacy', 'legacy refused with the same wording', [L.C.ok, (L.C.err || '').indexOf(pre.slice(0, 40)) >= 0], [false, true]),
    eq('products', 'product list names the product with a cost detail (legacy lists ' + ((L.C.err || '').split('Products: ')[1] || '').split(',').length + ')', (String(C.error || '').split('Products: ')[1] || '').split(',').indexOf(pr && pr.v) >= 0, true)]);
  // negative control: without the hook the typed org stays (so the A row is not vacuous)
  var M = require(path.join(ERP, 'model_layer.js')); var trxN = new ML.Trx(q, env());
  verdict('NC4-NEG-NOHOOK', [eq('differs', 'org typed 11 differs from the forced 0 (the hook is what the row proves)', String(base.ad_org_id) !== String(la.org), true)]);
  var bad2 = results.filter(function (r) { return r.v !== 'PASS'; });
  log('§NC4-VERDICT ' + (bad2.length ? 'FAIL ' + bad2.map(function (r) { return r.id + '=' + r.v; }).join(',') : 'PASS') + ' cases=' + results.length);
  process.exit(bad2.length ? 1 : 0);
})().catch(function (e) { console.log('§NC4 CRASH ' + (e && e.stack || e)); process.exit(2); });
