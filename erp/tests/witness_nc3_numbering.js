#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC3-NUMBERING (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-3; CARDINAL RULE: document numbers across calendar years/months are exactly legacy's).
//   READ THE LOG after every run: every verdict is a §NC3 line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: MSequence.getDocumentNoFromSeq (MSequence.java:330-581) on the twin == the numbers the LEGACY pilot issued
//   (scripts/bridge/nc3_legacy.js -> out/nc3_legacy.json): StartNewYear keyed by the year of the DateColumn (DateOrdered), StartNewYear+StartNewMonth keyed by yyyyMM,
//   StartNewYear with NO DateColumn keyed by today's year. Same sequence settings, same DateOrdered order, DocumentNo compared position by position.
//   INCONCLUSIVE when the legacy file is missing. Negative control: a deliberately year-blind numbering (one counter) must DISAGREE with legacy on seq A.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §NC3-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§NC3 case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
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
  log('§NC3-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§NC3-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

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



  var LJ = process.env.NC3_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc3_legacy.json';
  if (!fs.existsSync(LJ)) { log('§NC3 INCONCLUSIVE no legacy file ' + LJ); verdict('NC3-LEGACY', []); process.exit(2); }
  var L = JSON.parse(fs.readFileSync(LJ, 'utf8'));
  var cfgs = { A: { sny: 'Y', snm: 'N', dc: 'dateordered', prefix: 'A-', dp: '0000' }, B: { sny: 'Y', snm: 'Y', dc: 'dateordered', prefix: 'B', dp: '000' }, C: { sny: 'Y', snm: 'N', dc: null, prefix: 'C', dp: '00' } };
  var sid0 = 9100000, got = {};
  Object.keys(cfgs).forEach(function (k, ix) {
    var c = cfgs[k], sid = sid0 + ix;
    db.run("INSERT INTO ad_sequence (ad_sequence_id,ad_client_id,ad_org_id,isactive,name,isautosequence,incrementno,startno,currentnext,currentnextsys,istableid,prefix,startnewyear,datecolumn,decimalpattern,startnewmonth,isorglevelsequence) VALUES (?,11,0,'Y',?,'Y',1,1,1,100,'N',?,?,?,?,?,'N')", [sid, 'NC3-' + k, c.prefix, c.sny, c.dc, c.dp, c.snm]);
    var dts = L.seqs[k].dates; got[k] = [];
    dts.forEach(function (d) {
      var trx = new ML.Trx(q, env());
      var seq = trx.get('ad_sequence', sid);
      var dn = MT.getDocumentNoFromSeq(trx, seq, { dateordered: d + ' 00:00:00' });
      apply(trx.ops.filter(Boolean)); got[k].push(dn);
    });
  });
  var wrong = [];
  Object.keys(cfgs).forEach(function (k) {
    var lg = L.seqs[k].numbers, tw = got[k], bad = 0, first = null;
    for (var i = 0; i < Math.max(lg.length, tw.length); i++) if (lg[i] !== tw[i]) { bad++; first = first || { i: i, date: L.seqs[k].dates[i], legacy: lg[i], twin: tw[i] }; }
    log('§NC3 seq=' + k + ' legacy=' + JSON.stringify(lg) + ' twin=' + JSON.stringify(tw) + ' diff=' + bad + ' oracle=LEGACY-MEASURED' + (first ? ' first=' + JSON.stringify(first) : ''));
    verdict('NC3-' + k, [eq('numbers', 'DocumentNo sequence per DateOrdered order == legacy (' + lg.length + ' documents)', [lg.length, bad], [tw.length, 0])]);
  });
  // negative control: a year-blind single counter disagrees with legacy on A (so the A row is not vacuous)
  var blind = L.seqs.A.dates.map(function (d, i) { return 'A-' + ('0000' + (i + 1)).slice(-4); });
  verdict('NC3-NEG-YEARBLIND', [eq('differs', 'year-blind numbering != legacy on seq A (the year reset is what the row proves)', JSON.stringify(blind) !== JSON.stringify(L.seqs.A.numbers), true)]);
  verdict('NC3-TODAY', [eq('env_year', 'seq C keyed by TODAY (' + L.today + ') in legacy; twin env date year ' + TODAY.slice(0, 4), L.today.slice(0, 4), TODAY.slice(0, 4))]);
  var bad2 = results.filter(function (r) { return r.v !== 'PASS'; });
  log('§NC3-VERDICT ' + (bad2.length ? 'FAIL ' + bad2.map(function (r) { return r.id + '=' + r.v; }).join(',') : 'PASS') + ' cases=' + results.length);
  process.exit(bad2.length ? 1 : 0);
})().catch(function (e) { console.log('§NC3 CRASH ' + (e && e.stack || e)); process.exit(2); });
