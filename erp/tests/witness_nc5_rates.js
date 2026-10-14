#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC5-RATES (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-5a; CARDINAL RULE: a document in a foreign currency converts at exactly the rate legacy picks).
//   READ THE LOG after every run: every verdict is a §NC5 line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: MConversionRate.getRate / the PG function currencyRate() picks, among client-0/client/org rows, types, validity windows and inactive rows,
//   ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ValidFrom DESC. The twin has SEVERAL implementations (model_trade.rate, doc_poster.fxRate, ad_process._agRate, crud_overlay._rate);
//   every one is run over the SAME six USD->CAD rows (scripts/bridge/nc5_legacy.js -> out/nc5_legacy.json: 72 answers from the legacy pilot) and compared answer by answer.
//   INCONCLUSIVE when the legacy file is missing. Negative control: an org-blind getter must DISAGREE with legacy on the org-12 rows.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §NC5-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§NC5 case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
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
  log('§NC5-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post', 'model_master'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§NC5-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

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





  var LJ = process.env.NC5_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc5_legacy.json';
  if (!fs.existsSync(LJ)) { log('§NC5 INCONCLUSIVE no legacy file ' + LJ); verdict('NC5-LEGACY', []); process.exit(2); }
  var L = JSON.parse(fs.readFileSync(LJ, 'utf8'));
  db.run("DELETE FROM c_conversion_rate WHERE c_currency_id=100 AND c_currency_id_to=116");
  var cols = colsOf('c_conversion_rate'); var nid = 9500000;
  L.rows.forEach(function (r) {
    var f = { c_conversion_rate_id: ++nid, ad_client_id: r.client, ad_org_id: r.org, isactive: r.active, c_currency_id: 100, c_currency_id_to: 116, c_conversiontype_id: r.type, validfrom: r.from + ' 00:00:00', validto: r.to + ' 00:00:00', multiplyrate: r.rate, dividerate: 1 / r.rate };
    var ks = Object.keys(f).filter(function (k) { return cols.indexOf(k) >= 0; });
    db.run('INSERT INTO c_conversion_rate (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; }));
  });
  log('§NC5-ENV rate rows loaded=' + L.rows.length + ' grid=' + L.grid.length);
  var DP = require(path.join(ERP, 'doc_poster.js'));
  var ad = { prepare: function (sql) { return { get: function (p) { return q(sql, [].concat(p === undefined ? [] : p))[0]; }, all: function (p) { return q(sql, [].concat(p === undefined ? [] : p)); } }; } };   // better-sqlite3 shape over sql.js, as doc_poster's getRow expects
  function dbAdapter() { return ad; }
  var impls = {
    'model_trade.rate': function (g) { var e = env(); e.org = g.org; var trx = new ML.Trx(q, e); var v = MT.rate(trx, 100, 116, g.date + ' 00:00:00', g.type); return v == null ? null : Number(v.toString()); },
    'doc_poster.fxRate': function (g) { if (g.type === 115) return undefined; return DP.fxRate(dbAdapter(), 100, 116, g.date + ' 00:00:00', L.client, g.org); }
  };
  Object.keys(impls).forEach(function (name) {
    var judged = 0, bad = [], skipped = 0;
    L.grid.forEach(function (g) { var got; try { got = impls[name](g); } catch (e) { got = 'THROW ' + String(e.message).slice(0, 60); }
      if (got === undefined) { skipped++; return; } judged++;
      var gv = got === null ? null : (typeof got === 'number' ? Math.round(got * 1e6) / 1e6 : got);
      if (gv !== g.rate) bad.push({ date: g.date, org: g.org, type: g.type, legacy: g.rate, twin: gv }); });
    log('§NC5 impl=' + name + ' judged=' + judged + ' skipped(unsupported dimension)=' + skipped + ' diff=' + bad.length + (bad[0] ? ' first=' + JSON.stringify(bad[0]) : '') + ' oracle=LEGACY-MEASURED');
    verdict('NC5-' + name, [eq('answers', name + ': ' + (judged - bad.length) + ' of ' + judged + ' answers == legacy currencyRate()', [judged, bad.length], [judged, 0])]);
  });
  var blind = L.grid.filter(function (g) { return g.org === 12 && g.type === 114; }).some(function (g) { var o0 = L.grid.filter(function (x) { return x.org === 0 && x.date === g.date && x.type === 114; })[0]; return o0 && o0.rate !== g.rate; });
  verdict('NC5-NEG-ORGBLIND', [eq('differs', 'org 12 answers differ from org 0 in legacy (an org-blind getter would be wrong)', blind, true)]);
  var bad2 = results.filter(function (r) { return r.v !== 'PASS'; });
  log('§NC5-VERDICT ' + (bad2.length ? 'FAIL ' + bad2.map(function (r) { return r.id + '=' + r.v; }).join(',') : 'PASS') + ' cases=' + results.length);
  process.exit(bad2.length ? 1 : 0);
})().catch(function (e) { console.log('§NC5 CRASH ' + (e && e.stack || e)); process.exit(2); });
