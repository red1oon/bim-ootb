#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SEED-COSTHISTORY (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY item 1c; CARDINAL RULE: twin == legacy). READ THE LOG: §WCH lines; exit code is not evidence.
// THE ISSUE: the seed carried the m_costdetail / m_costhistory DDL but NO rows, so MCost.getCostInfo(..., dateAcct) (MCost.java:1542-1572) found no as-of-date history and M_MatchInv #100 / M_InOut #100 posted
//   at the CURRENT price (legacy 742 Cr 70.00 + 58800 Cr 30.00 ; 430 Dr 30.00) instead of the history price. DATA fix, no code change: the 84 details of the SHIPPED documents (document line < 1000000) + their 172 history rows,
//   through patches/build_dict_patch.py (TABLES + ROW_WHERE). The pilot gave even that original costing ids >= 1000000, so the tie is the document line, not the detail id (see spec).
//   H1 M_MatchInv #100 + M_InOut #100 post through the REAL poster == stored legacy Fact_Acct per schema x account x side (cents, maxDiff 0)
//   H2 every client-11 seed document equal to legacy on the pinned baseline patch is STILL equal (per doc type before/after equal-counts; a newly diverging doc = FAIL)
//   H3 docs whose twin facts changed: listed with before/after vs legacy; only "now equals legacy" is allowed
//   H4 the patch applies idempotently (twice -> 84 / 172 rows, same bytes)
//   H5 every added row exists in the pilot with identical values (read-only SELECT), its document line < 1000000 AND exists in the seed, nothing of a pilot-only document
//   BASELINE=1 (pinned patch @PIN) must FAIL H1; MUT=nohistory (history rows dropped) and MUT=drift (one pilot test-traffic detail added) must FAIL. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_seed_cost_history.js   (node + read-only docker psql; sql.js)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), PIN = '25cfdb6d', MUT = process.env.MUT || '', BASELINE = !!process.env.BASELINE;
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
var pg = function (sql) { return cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-tA', '-c', 'set search_path=adempiere;' + sql], { maxBuffer: 1 << 28 }).toString().split('\n').filter(function (l) { return l && l !== 'SET'; }); };
var CUR = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8'), OLD;
try { OLD = cp.execFileSync('git', ['show', PIN + ':erp/patches/ad_seed.db.sql'], { cwd: ERP, maxBuffer: 1 << 28 }).toString(); } catch (e) { OLD = null; }
var split = function (P) { return P.split(/;\s*\n/).map(function (st) { return st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); }).filter(Boolean); };
var TBL = [['c_invoice', 318], ['m_inout', 319], ['c_payment', 335], ['c_allocationhdr', 735], ['m_movement', 323], ['gl_journal', 224], ['m_matchinv', 472], ['m_matchpo', 473], ['m_inventory', 321], ['c_cash', 407], ['c_bankstatement', 392]];
(async function main() {
  var SQL = await initSqlJs(), SEED = new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function mk(P) { var db = new SQL.Database(SEED); split(P).forEach(function (st) { try { db.run(st); } catch (e) { } }); return db; }
  function mkq(db) { return function (sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }; }
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var poster = ML.getPoster();
  var dbOld = OLD ? mk(OLD) : null, dbNew = mk(BASELINE ? OLD : CUR);
  if (!OLD) { log('§WCH CRASH pinned baseline patch unavailable (git show ' + PIN + ')'); process.exit(2); }
  [dbOld, dbNew].forEach(function (d) { A.RUNTIME.registerSqlFunctions(function (n, f) { d.create_function(n, f); }); });
  var qo = mkq(dbOld), qn = mkq(dbNew);
  if (MUT === 'nohistory') dbNew.run('DELETE FROM m_costhistory');
  if (MUT === 'drift') { var dr = pg("select row_to_json(x)::text from (select m_costdetail_id::text, ad_client_id::text, ad_org_id::text, c_acctschema_id::text, m_product_id::text, isactive, created, createdby::text, updated, updatedby::text, m_inoutline_id::text, amt::text, qty::text, dateacct from m_costdetail where m_costdetail_id=1000089) x").map(JSON.parse)[0];
    var ks = Object.keys(dr); dbNew.run('INSERT OR IGNORE INTO m_costdetail (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return dr[k]; })); }
  var DAY = '2026-11-05 00:00:00';
  function env() { var uu = 0; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: '2026-11-05 09:00:00', nowMillis: Date.parse('2026-11-05T09:00:00Z'), uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  function twinOf(q, table, id) {
    var trx = new ML.Trx(q, env()), doc = trx.get(table, id), exc = null, tw = {}; trx.say = function () { };
    try { poster(trx, table, doc, { repost: true }); } catch (e) { exc = String(e).slice(0, 160); }
    JSON.parse(JSON.stringify(trx.groupOps())).forEach(function (o) { if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') { var f = o.fields;
      if (cents(f.amtacctdr)) { var k = f.c_acctschema_id + ':' + f.account_id + ':DR'; tw[k] = (tw[k] || 0) + cents(f.amtacctdr); } if (cents(f.amtacctcr)) { var k2 = f.c_acctschema_id + ':' + f.account_id + ':CR'; tw[k2] = (tw[k2] || 0) + cents(f.amtacctcr); } } });
    return { tw: tw, exc: exc };
  }
  var legacy = {};
  TBL.forEach(function (t) { qn('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=' + t[1] + ' AND ad_client_id=11').forEach(function (f) {
    var b = legacy[t[0] + '#' + f.r] || (legacy[t[0] + '#' + f.r] = {}); if (cents(f.d)) { var k = f.s + ':' + f.a + ':DR'; b[k] = (b[k] || 0) + cents(f.d); } if (cents(f.c)) { var k2 = f.s + ':' + f.a + ':CR'; b[k2] = (b[k2] || 0) + cents(f.c); } }); });
  var diffOf = function (tw, lg) { var keys = {}, md = 0, bad = []; Object.keys(tw).concat(Object.keys(lg)).forEach(function (k) { keys[k] = 1; }); Object.keys(keys).sort().forEach(function (k) { var d = Math.abs((tw[k] || 0) - (lg[k] || 0)); if (d > md) md = d; if (d) bad.push(k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0)); }); return { md: md, bad: bad }; };
  var cn = qn('SELECT count(*) AS n FROM m_costdetail')[0].n, hn = qn('SELECT count(*) AS n FROM m_costhistory')[0].n;
  log('§WCH config pin=' + PIN + ' baseline=' + (BASELINE ? 'Y' : 'N') + ' mutant=' + (MUT || 'none') + ' costdetail=' + cn + ' costhistory=' + hn + ' (pinned baseline: ' + qo('SELECT count(*) AS n FROM m_costdetail')[0].n + '/' + qo('SELECT count(*) AS n FROM m_costhistory')[0].n + ')');
  // H1 / H2 / H3 over every client-11 document with stored legacy facts
  var per = {}, judged = 0, chg = [], regress = [], h1 = {};
  TBL.forEach(function (t) {
    var ids = qn('SELECT ' + t[0] + '_id AS id FROM ' + t[0] + ' WHERE ad_client_id=11 ORDER BY ' + t[0] + '_id').map(function (r) { return r.id; });
    var p = per[t[0]] = { docs: ids.length, legacy: 0, eqBefore: 0, eqAfter: 0, changed: 0 };
    ids.forEach(function (id) { var key = t[0] + '#' + id, lg = legacy[key]; if (!lg || !Object.keys(lg).length) return; judged++; p.legacy++;
      var b = twinOf(qo, t[0], id), a = twinOf(qn, t[0], id), db_ = diffOf(b.tw, lg), da = diffOf(a.tw, lg), eb = db_.md === 0 && !b.exc && Object.keys(b.tw).length > 0, ea = da.md === 0 && !a.exc && Object.keys(a.tw).length > 0;
      if (eb) p.eqBefore++; if (ea) p.eqAfter++; if (JSON.stringify(a.tw) !== JSON.stringify(b.tw)) { p.changed++; chg.push({ key: key, eb: eb, ea: ea, before: db_.bad, after: da.bad }); }
      if (eb && !ea) regress.push(key);
      if ((t[0] === 'm_matchinv' || t[0] === 'm_inout') && id === 100) { h1[key] = { md: da.md, bad: da.bad, n: Object.keys(a.tw).length, legN: Object.keys(lg).length, exc: a.exc }; log('§WCH H1 ' + key + ' twinKeys=' + Object.keys(a.tw).length + ' legacyKeys=' + Object.keys(lg).length + ' maxDiff=' + da.md + 'c' + (a.exc ? ' exc=' + a.exc : '')); Object.keys(Object.assign({}, a.tw, lg)).sort().forEach(function (k) { log('§WCH   ' + key + ' ' + k + ' twin=' + (a.tw[k] || 0) + ' legacy=' + (lg[k] || 0) + ((a.tw[k] || 0) === (lg[k] || 0) ? '' : '  <-- DIFF')); }); } }); });
  log('§WCH-PER-TYPE ' + Object.keys(per).map(function (t) { var p = per[t]; return t + '[docs=' + p.docs + ' withLegacy=' + p.legacy + ' equalBefore=' + p.eqBefore + ' equalAfter=' + p.eqAfter + ' changed=' + p.changed + ']'; }).join(' '));
  var need = ['m_matchinv#100', 'm_inout#100'], h1ok = need.every(function (k) { return h1[k] && h1[k].legN > 0 && h1[k].n > 0 && h1[k].md === 0 && !h1[k].exc; });
  ok('H1', 'M_MatchInv #100 and M_InOut #100 post through the real poster == stored legacy Fact_Acct per schema x account x side, 0c', need.every(function (k) { return h1[k]; }) ? h1ok : null, need.map(function (k) { return k + ':' + (h1[k] ? 'maxDiff=' + h1[k].md + 'c' : 'absent'); }).join(' ') + (h1ok ? '' : ' ' + need.map(function (k) { return h1[k] ? h1[k].bad.slice(0, 3).join('; ') : ''; }).join(' | ')));
  ok('H2', 'no client-11 document equal to legacy on the pinned baseline diverges after the patch (' + judged + ' documents with legacy facts)', judged ? regress.length === 0 : null, judged ? (regress.length ? 'DIVERGED ' + regress.join(' ') : 'equal-before=' + Object.keys(per).reduce(function (s, t) { return s + per[t].eqBefore; }, 0) + ' equal-after=' + Object.keys(per).reduce(function (s, t) { return s + per[t].eqAfter; }, 0)) : 'VACUOUS: no documents judged');
  chg.forEach(function (c) { log('§WCH H3 ' + c.key + ' before-vs-legacy=' + (c.eb ? 'EQUAL' : '[' + c.before.slice(0, 4).join('; ') + ']') + ' after-vs-legacy=' + (c.ea ? 'EQUAL' : '[' + c.after.slice(0, 4).join('; ') + ']')); });
  ok('H3', chg.length + ' document(s) changed; every change is a move to "equals legacy"', judged ? chg.every(function (c) { return c.ea; }) : null, chg.map(function (c) { return c.key + (c.eb ? '(was equal)' : '(was diff)') + '->' + (c.ea ? 'equal' : 'DIFF'); }).join(' ') || 'none');
  // H4 idempotency of the costing statements
  var stm = split(CUR).filter(function (st) { return /^(INSERT OR IGNORE INTO (m_costdetail|m_costhistory) \(|CREATE UNIQUE INDEX IF NOT EXISTS uq_m_cost(detail|history)_pk )/.test(st); });
  var snap = function (d) { return JSON.stringify([d.exec('SELECT * FROM m_costdetail ORDER BY m_costdetail_id')[0], d.exec('SELECT * FROM m_costhistory ORDER BY m_costhistory_id')[0]]); };
  var d4 = mk(OLD); stm.forEach(function (st) { d4.run(st); }); var s1 = snap(d4); stm.forEach(function (st) { d4.run(st); }); var s2 = snap(d4), c4 = d4.exec('SELECT (SELECT count(*) FROM m_costdetail),(SELECT count(*) FROM m_costhistory)')[0].values[0];
  ok('H4', 'cost statements applied twice -> same bytes, 84 details / 172 history rows', s1 === s2 && c4[0] === 84 && c4[1] === 172 && stm.length > 0, 'statements=' + stm.length + ' rows=' + c4.join('/'));
  // H5 provenance against the pilot (read-only) + seed membership
  var rowsCd = qn('SELECT * FROM m_costdetail ORDER BY m_costdetail_id'), rowsCh = qn('SELECT * FROM m_costhistory ORDER BY m_costhistory_id');
  var norm = function (v) { if (v === null || v === undefined || v === '') return ''; var s = String(v); return /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s; };
  var LINE = [['m_inoutline_id', 'm_inoutline'], ['c_invoiceline_id', 'c_invoiceline'], ['c_orderline_id', 'c_orderline'], ['m_matchinv_id', 'm_matchinv'], ['m_movementline_id', 'm_movementline'], ['m_inventoryline_id', 'm_inventoryline']];
  var bad5 = [], cmp = function (tbl, rows, idc) { if (!rows.length) return; var cols = Object.keys(rows[0]), ids = rows.map(function (r) { return r[idc]; });
    var pil = {}; pg("select row_to_json(x)::text from (select " + cols.map(function (c) { return c + '::text as ' + c; }).join(',') + " from " + tbl + " where " + idc + " in (" + ids.join(',') + ")) x").forEach(function (l) { var o = JSON.parse(l); pil[o[idc]] = o; });
    rows.forEach(function (r) { var p = pil[String(r[idc])]; if (!p) { bad5.push(tbl + '#' + r[idc] + ' absent-in-pilot'); return; } cols.forEach(function (c) { if (norm(p[c]) !== norm(r[c])) bad5.push(tbl + '#' + r[idc] + '.' + c + ' seed=' + r[c] + ' pilot=' + p[c]); }); }); };
  cmp('m_costdetail', rowsCd, 'm_costdetail_id'); cmp('m_costhistory', rowsCh, 'm_costhistory_id');
  rowsCd.forEach(function (r) { var tied = 0; LINE.forEach(function (l) { var v = r[l[0]]; if (v !== null && v !== '' && v !== undefined) { tied++; var ex = qn('SELECT count(*) AS n FROM ' + l[1] + ' WHERE ' + l[1] + '_id=?', [v])[0].n; if (Number(v) >= 1000000 || !ex) bad5.push('m_costdetail#' + r.m_costdetail_id + ' ' + l[0] + '=' + v + (Number(v) >= 1000000 ? ' >=1e6' : ' not-in-seed')); } }); if (!tied) bad5.push('m_costdetail#' + r.m_costdetail_id + ' tied to no seed document line'); });
  var cdIds = {}; rowsCd.forEach(function (r) { cdIds[r.m_costdetail_id] = 1; }); rowsCh.forEach(function (r) { if (!cdIds[r.m_costdetail_id]) bad5.push('m_costhistory#' + r.m_costhistory_id + ' references detail ' + r.m_costdetail_id + ' not in seed'); });
  log('§WCH H5 detail ids ' + (rowsCd.length ? rowsCd[0].m_costdetail_id + '..' + rowsCd[rowsCd.length - 1].m_costdetail_id : '-') + ' history ids ' + (rowsCh.length ? rowsCh[0].m_costhistory_id + '..' + rowsCh[rowsCh.length - 1].m_costhistory_id : '-') + ' violations=' + bad5.length);
  ok('H5', 'every added row identical to the pilot, tied to a seed document line < 1e6 that exists in the seed, history only of seed details (' + rowsCd.length + ' details, ' + rowsCh.length + ' history)', rowsCd.length ? bad5.length === 0 && rowsCd.length === 84 && rowsCh.length === 172 : null, bad5.slice(0, 4).join('; ') || 'clean');
  // H6-H8 (§POSTING-PARITY 5f — the BOOK claims of W-F9-COSTHISTORY, moved off the retired doc_poster shipment/movement folds onto the REAL poster): mutate the history the lookup reads
  //   (MCost.getCurrentCost :145-162 -> MCostHistory.get by cost detail :104-142, else as of DateAcct :188-260) and the books MUST follow; with no history they fall back to m_cost (MCost.getCost).
  function freshQ() { var d = mk(CUR); A.RUNTIME.registerSqlFunctions(function (n, f) { d.create_function(n, f); }); return { db: d, q: mkq(d) }; }
  var acct430 = function (tw) { return tw['101:430:DR'] || 0; };
  var F0 = freshQ(), io0 = twinOf(F0.q, 'm_inout', 100), mv0 = twinOf(F0.q, 'm_movement', 100);
  var F1 = freshQ(); F1.db.run("UPDATE m_costhistory SET newcostprice=newcostprice+0.01 WHERE m_costdetail_id IN (SELECT m_costdetail_id FROM m_costdetail WHERE m_product_id IN (130,123) AND c_acctschema_id=101) AND m_costelement_id=103");
  var io1 = twinOf(F1.q, 'm_inout', 100), mv1 = twinOf(F1.q, 'm_movement', 100), mvSum = function (tw) { return Object.keys(tw).filter(function (k) { return /^101:/.test(k) && /:DR$/.test(k); }).reduce(function (a, k) { return a + tw[k]; }, 0); };
  log('§WCH H6 m_inout#100 430 Dr base=' + acct430(io0.tw) + 'c history+0.01=' + acct430(io1.tw) + 'c ; m_movement#100 schema-101 Dr base=' + mvSum(mv0.tw) + 'c history+0.01=' + mvSum(mv1.tw) + 'c keys=' + JSON.stringify(mv1.tw) + (io1.exc ? ' EXC ' + io1.exc : '') + (mv1.exc ? ' EXC ' + mv1.exc : ''));
  var mvDr = Object.keys(mv0.tw).filter(function (k) { return /^101:/.test(k) && /:DR$/.test(k); });
  ok('H6', 'history price +0.01 moves the books: shipment #100 (qty 1) 430 Dr 3000c -> 3001c; movement #100 (qty 4, product 123) +4c on EVERY schema-101 Dr leg - the books read the history, not a constant', acct430(io0.tw) === 3000 && acct430(io1.tw) === 3001 && mvDr.length > 0 && mvDr.every(function (k) { return mv1.tw[k] - mv0.tw[k] === 4; }), 'inout ' + acct430(io0.tw) + '->' + acct430(io1.tw) + ' movement ' + mvSum(mv0.tw) + '->' + mvSum(mv1.tw));
  var F2 = freshQ(); F2.db.run("DELETE FROM m_costhistory WHERE m_costdetail_id IN (SELECT m_costdetail_id FROM m_costdetail WHERE m_product_id=130)");
  var cur130 = F2.q("SELECT currentcostprice AS p FROM m_cost WHERE m_product_id=130 AND c_acctschema_id=101 AND m_costelement_id=103")[0], io2 = twinOf(F2.q, 'm_inout', 100);
  log('§WCH H7 m_inout#100 with NO history for product 130: 430 Dr=' + acct430(io2.tw) + 'c m_cost.currentcostprice=' + (cur130 && cur130.p) + (io2.exc ? ' EXC ' + io2.exc : ''));
  ok('H7', 'no history rows -> the m_cost price (MCost.getCost, history null): 1 x 37.36842105 -> 3737c, not the history 3000c', cur130 ? acct430(io2.tw) === Math.round(Number(cur130.p) * 100) && acct430(io2.tw) !== 3000 : null, acct430(io2.tw) + 'c vs m_cost ' + (cur130 && cur130.p));
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§WCH-SUMMARY ' + verdict + ' mutant=' + (MUT || 'none') + ' baseline=' + (BASELINE ? 'Y' : 'N') + ' documentsJudged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : verdict === 'INCONCLUSIVE' ? 3 : 0);
})().catch(function (e) { console.log('§WCH CRASH ' + (e && e.stack || e)); process.exit(2); });
