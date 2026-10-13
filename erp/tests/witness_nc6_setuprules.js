#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC6-SETUPRULES (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-6/7/8; CARDINAL RULE: a setup master saved in a window does exactly what legacy does).
//   READ THE LOG after every run: every verdict is a §NC6 line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: the save rules of MConversionRate (currency/rate/date/overlap refusals + the auto-created REVERSE rate), MWarehouse (org 0 -> context org, Warehouse_Acct per
//   accounting schema), MProductCategory (loop refusal + Category_Acct), MBPGroup / MCharge (Acct rows), MPaymentTerm (fixed-day/cutoff/NetDays refusals), MPriceListVersion (Name from ValidFrom),
//   MUOMConversion (opposite rate, refusals), MYear (FiscalYear mandatory) on the twin == what the LEGACY pilot did for the same saves (scripts/bridge/nc6_legacy.js -> out/nc6_legacy.json,
//   19 probes). Refusal texts are compared VERBATIM. Before the port the twin had no model for any of these tables (RED). INCONCLUSIVE when the legacy file is missing.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §NC6-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§NC6 case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
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
  log('§NC6-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post', 'model_master'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§NC6-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

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





  var LJ = process.env.NC6_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc6_legacy.json';
  if (!fs.existsSync(LJ)) { log('§NC6 INCONCLUSIVE no legacy file ' + LJ); verdict('NC6-LEGACY', []); process.exit(2); }
  var LG = JSON.parse(fs.readFileSync(LJ, 'utf8')), L = LG.cases, defaultsTwin = one('SELECT COUNT(*) AS n FROM c_acctschema_default WHERE ad_client_id=11').n;
  function save(table, fields, id) { var trx = new ML.Trx(q, env()), r; if (id == null) { var po = ML.newRecord(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 0 }, fields)); r = ML.save(trx, table, null, po.values()); }
    else r = ML.save(trx, table, trx.get(table, id), fields); if (r.ok) apply(trx.groupOps()); return { r: r, trx: trx }; }
  function refused(id, res) { var w = L[id]; verdict('NC6-' + id, [eq('refused', 'twin refuses like legacy', [res.r.ok, String(res.r.error || '')], [false, w.err]), eq('legacy', 'legacy refused', w.ok, false)]); }
  var CR = { c_currency_id: 100, c_currency_id_to: 116, c_conversiontype_id: 114 };
  var cr1 = save('c_conversion_rate', Object.assign({ multiplyrate: 1.5, dividerate: 0.666666666667, validfrom: '2040-01-01 00:00:00', validto: '2040-12-31 00:00:00' }, CR));
  var rec = q("SELECT multiplyrate AS m, dividerate AS d, ad_org_id AS o FROM c_conversion_rate WHERE c_currency_id=116 AND c_currency_id_to=100 AND date(validfrom)='2040-01-01'");
  verdict('NC6-CR1', [eq('ok', 'save accepted', cr1.r.ok, true), eq('reciprocal', 'a REVERSE rate row is created (mult = divide, div = mult) - legacy ' + JSON.stringify(L.CR1.reciprocal),
    rec.map(function (x) { return { mult: String(x.m), div: String(x.d), org: String(x.o) }; }), L.CR1.reciprocal.map(function (x) { return { mult: String(Number(x.mult)), div: String(Number(x.div)), org: x.org }; }))]);
  refused('CR2', save('c_conversion_rate', Object.assign({}, CR, { c_currency_id_to: 100, multiplyrate: 1, validfrom: '2041-01-01 00:00:00', validto: '2041-12-31 00:00:00' })));
  refused('CR3', save('c_conversion_rate', Object.assign({ multiplyrate: 0, validfrom: '2041-01-01 00:00:00', validto: '2041-12-31 00:00:00' }, CR)));
  refused('CR4', save('c_conversion_rate', Object.assign({ multiplyrate: 1.1, validfrom: '2041-06-30 00:00:00', validto: '2041-01-01 00:00:00' }, CR)));
  refused('CR5', save('c_conversion_rate', Object.assign({ multiplyrate: 1.6, dividerate: 0.625, validfrom: '2040-06-01 00:00:00', validto: '2040-08-31 00:00:00' }, CR)));
  // acct rows per schema default
  var nAcct = function (t, col, id) { return one('SELECT COUNT(*) AS n FROM ' + t + ' WHERE ' + col + '=?', [id]).n; };
  var wh = save('m_warehouse', { value: 'NC6T', name: 'NC6-WH', c_location_id: one('SELECT c_location_id AS c FROM c_location WHERE ad_client_id=11 ORDER BY 1').c }), whRow = one("SELECT m_warehouse_id AS id, ad_org_id AS o FROM m_warehouse WHERE name='NC6-WH'");
  verdict('NC6-WH1', [eq('ok', 'save accepted', wh.r.ok, true), eq('org', 'AD_Org_ID 0 typed -> the context org (legacy ' + L.WH1.org + ')', String(whRow && whRow.o), L.WH1.org),
    eq('acct', 'Warehouse_Acct rows == one per C_AcctSchema_Default (twin ' + defaultsTwin + ', legacy ' + LG.defaultRows + ' defaults / ' + L.WH1.acctRows + ' rows)', [nAcct('m_warehouse_acct', 'm_warehouse_id', whRow && whRow.id), L.WH1.acctRows], [defaultsTwin, LG.defaultRows])]);
  var pc = save('m_product_category', { value: 'NC6T', name: 'NC6-PC', isdefault: 'N' }), pcRow = one("SELECT m_product_category_id AS id FROM m_product_category WHERE name='NC6-PC'");
  verdict('NC6-PC1', [eq('ok', 'save accepted', pc.r.ok, true), eq('acct', 'Product_Category_Acct rows == one per default', [nAcct('m_product_category_acct', 'm_product_category_id', pcRow && pcRow.id), L.PC1.acctRows], [defaultsTwin, LG.defaultRows])]);
  refused('PC2', save('m_product_category', { m_product_category_parent_id: pcRow.id }, pcRow.id));
  var bg = save('c_bp_group', { value: 'NC6T', name: 'NC6-BG', isdefault: 'N' }), bgRow = one("SELECT c_bp_group_id AS id FROM c_bp_group WHERE name='NC6-BG'");
  verdict('NC6-BG1', [eq('acct', 'C_BP_Group_Acct rows == one per default', [nAcct('c_bp_group_acct', 'c_bp_group_id', bgRow && bgRow.id), L.BG1.acctRows], [defaultsTwin, LG.defaultRows])]);
  var ch = save('c_charge', { name: 'NC6-CH', chargeamt: 5, c_taxcategory_id: one('SELECT c_taxcategory_id AS c FROM c_taxcategory WHERE ad_client_id=11 ORDER BY 1').c }), chRow = one("SELECT c_charge_id AS id FROM c_charge WHERE name='NC6-CH'");
  verdict('NC6-CH1', [eq('acct', 'C_Charge_Acct rows == one per default', [nAcct('c_charge_acct', 'c_charge_id', chRow && chRow.id), L.CH1.acctRows], [defaultsTwin, LG.defaultRows])]);
  var PT = { isduefixed: 'N', netdays: 30, fixmonthday: 0, fixmonthcutoff: 0, fixmonthoffset: 0, isdefault: 'N' };
  var pt1 = save('c_paymentterm', Object.assign({}, PT, { value: 'NC6A', name: 'NC6-PT-A' })), ptRow = one("SELECT isvalid AS v FROM c_paymentterm WHERE name='NC6-PT-A'");
  verdict('NC6-PT1', [eq('ok', 'save accepted', pt1.r.ok, true), eq('valid', 'IsValid after save (legacy ' + L.PT1.isvalid + ')', ptRow && ptRow.v, L.PT1.isvalid)]);
  refused('PT2', save('c_paymentterm', Object.assign({}, PT, { value: 'NC6B', name: 'NC6-PT-B', isduefixed: 'Y', fixmonthday: 0, fixmonthcutoff: 5 })));
  refused('PT3', save('c_paymentterm', Object.assign({}, PT, { value: 'NC6C', name: 'NC6-PT-C', isduefixed: 'Y', fixmonthday: 15, fixmonthcutoff: 40 })));
  refused('PT4', save('c_paymentterm', Object.assign({}, PT, { value: 'NC6D', name: 'NC6-PT-D', netdays: -1 })));
  refused('UC1', save('c_uom_conversion', { c_uom_id: 100, c_uom_to_id: 100, multiplyrate: 2 }));
  var uc2 = save('c_uom_conversion', { c_uom_id: 100, c_uom_to_id: 101, multiplyrate: 3 }), ucRow = one('SELECT multiplyrate AS m, dividerate AS d FROM c_uom_conversion WHERE c_uom_id=100 AND c_uom_to_id=101 AND multiplyrate=3');
  verdict('NC6-UC2', [eq('ok', 'save accepted', uc2.r.ok, true), eq('divide', 'DivideRate = opposite rate at scale 12 (legacy ' + L.UC2.divide + ')', String(ucRow && ucRow.d), String(Number(L.UC2.divide)))]);
  refused('UC3', save('c_uom_conversion', { c_uom_id: 100, c_uom_to_id: 102, multiplyrate: 0, dividerate: 0 }));
  var pv = save('m_pricelist_version', { m_pricelist_id: 101, m_discountschema_id: one('SELECT m_discountschema_id AS d FROM m_discountschema WHERE ad_client_id=11 ORDER BY 1').d, validfrom: '2042-03-05 00:00:00' }), pvRow = one("SELECT name FROM m_pricelist_version WHERE date(validfrom)='2042-03-05'");
  verdict('NC6-PV1', [eq('ok', 'save accepted', pv.r.ok, true), eq('name', 'Name omitted -> ValidFrom formatted (legacy ' + L.PV1.name + ')', pvRow && pvRow.name, L.PV1.name)]);
  refused('YR1', save('c_year', { c_calendar_id: one('SELECT c_calendar_id AS c FROM c_calendar ORDER BY 1').c, fiscalyear: 'abc' }));
  var bad2 = results.filter(function (r) { return r.v !== 'PASS'; });
  log('§NC6-VERDICT ' + (bad2.length ? 'FAIL ' + bad2.map(function (r) { return r.id + '=' + r.v; }).join(',') : 'PASS') + ' cases=' + results.length);
  process.exit(bad2.length ? 1 : 0);
})().catch(function (e) { console.log('§NC6 CRASH ' + (e && e.stack || e)); process.exit(2); });
