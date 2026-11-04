#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-BANKSTATEMENT (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY RECONCILED 2026-11-03 item 1a; CARDINAL RULE: twin == legacy). READ THE LOG: §WBST lines; exit code is not evidence.
// THE ISSUE: the shipped posting path (ML.setPoster -> model_post.post) had NO Doc_BankStatement in its DOC registry: a Completed C_BankStatement logged "no Doc class ported" and Posted stayed N,
//   where legacy (Doc_BankStatement.java:160-285) books BankAsset/BankInTransit/Charge/Interest per line and sets Posted='Y'.
//   B1  every client-11 C_BankStatement of ad_seed.db WITH stored legacy Fact_Acct posts through the REAL poster == legacy per schema x account x side (integer cents, maxDiff 0), Posted='Y'
//   B1b a statement WITHOUT stored legacy facts: the Java expectation only (no lines -> no facts; the doc_poster comparator retired, §POSTING-PARITY 5c) - labelled "no legacy oracle", never PASS (INCONCLUSIVE); plus a synthetic clearing-equal case (Java :184-198)
//   B2  per-line DateAcct: SysConfig BANK_STATEMENT_POST_WITH_DATE_FROM_LINE=N -> header DateAcct, =Y -> the line's DateAcct (DocLine_Bank.java:50)
//   B3  every OTHER doc type (incl. GL journals) posts byte-identically to the pinned baseline (git show BASE:erp/model_post.js)
//   MUTANTS: MUT=notransit (InTransit leg dropped), MUT=flip (one line's side flipped) must FAIL B1; BST_BASELINE=1 (baseline poster) must FAIL B1. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_post_bankstatement.js   (node only; sql.js)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module');
var ERP = path.join(__dirname, '..'), BASE = '1d36c3af', MUT = process.env.MUT || '', BASELINE = !!process.env.BST_BASELINE;
if (MUT === 'noseg') process.env.LMV_BREAK = 'nosegments';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
(async function main() {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { } });
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var src; try { src = cp.execFileSync('git', ['show', BASE + ':erp/model_post.js'], { cwd: ERP, maxBuffer: 1 << 26 }).toString(); } catch (e) { src = null; }
  var PB = null; if (src) { var m = new Module(path.join(ERP, '__model_post_baseline.js'), module); m.filename = path.join(ERP, '__model_post_baseline.js'); m.paths = Module._nodeModulePaths(ERP); m._compile(src, m.filename); PB = m.exports; }
  var PN = require(path.join(ERP, 'model_post.js'));
  var P = BASELINE ? PB : PN; if (BASELINE && PB) ML.setPoster(PB.post);
  if (MUT === 'flip') { var o1 = P.DOC.c_bankstatement; if (o1) P.DOC.c_bankstatement = function (trx, j, as, F) { var r = o1(trx, j, as, F); if (F.lines.length) { var l = F.lines[0], t = l.amtsourcedr; l.amtsourcedr = l.amtsourcecr; l.amtsourcecr = t; t = l.amtacctdr; l.amtacctdr = l.amtacctcr; l.amtacctcr = t; } return r; }; }
  if (MUT === 'notransit') { var o2 = P.DOC.c_bankstatement; if (o2) P.DOC.c_bankstatement = function (trx, j, as, F) { var r = o2(trx, j, as, F); var tr = trx.q('SELECT b_intransit_acct AS a FROM c_bankaccount_acct WHERE c_bankaccount_id=? AND c_acctschema_id=?', [j.c_bankaccount_id, as.c_acctschema_id])[0], v = tr ? trx.q('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=?', [tr.a])[0] : null; if (v) F.lines = F.lines.filter(function (l) { return String(l.account_id) !== String(v.e); }); return r; }; }
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var DAY = '2026-11-04 00:00:00';
  function env() { var uu = 0, clock = Date.parse('2026-11-04T09:00:00Z'); return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: '2026-11-04 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  function postWith(poster, table, id, opts) {
    var trx = new ML.Trx(q, env()), lines = [], doc = trx.get(table, id), res, exc = null; trx.say = function (l) { lines.push(String(l)); };
    try { res = poster(trx, table, doc, opts || { repost: true }); } catch (e) { exc = String(e).slice(0, 200); }
    return { res: res, exc: exc, ops: JSON.stringify(trx.groupOps()), log: lines, trx: trx };
  }
  function facts(r) { var tw = {}, dates = {}, byLine = {}, n = 0; JSON.parse(r.ops).forEach(function (o) { if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') { var f = o.fields; n++; dates[String(f.dateacct).slice(0, 10)] = 1; var lk = (f.line_id ? 'L' : 'H') + ':' + String(f.dateacct).slice(0, 10); byLine[lk] = (byLine[lk] || 0) + 1;
      if (cents(f.amtacctdr)) { var k = f.c_acctschema_id + ':' + f.account_id + ':DR'; tw[k] = (tw[k] || 0) + cents(f.amtacctdr); } if (cents(f.amtacctcr)) { var k2 = f.c_acctschema_id + ':' + f.account_id + ':CR'; tw[k2] = (tw[k2] || 0) + cents(f.amtacctcr); } } }); return { tw: tw, n: n, dates: Object.keys(dates).sort(), byLine: byLine }; }
  function diffMaps(a, b) { var keys = {}, md = 0, bad = []; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { keys[k] = 1; }); Object.keys(keys).forEach(function (k) { var d = Math.abs((a[k] || 0) - (b[k] || 0)); if (d > md) md = d; if (d) bad.push(k + ' ' + (a[k] || 0) + '/' + (b[k] || 0)); }); return { md: md, bad: bad }; }
  var poster = ML.getPoster();
  log('§WBST config baseline=' + BASE + (PB ? '' : ' (BASELINE UNAVAILABLE)') + ' mutant=' + (MUT || 'none') + ' poster=' + (BASELINE ? 'baseline' : 'candidate') + ' DOC.c_bankstatement=' + (P.DOC.c_bankstatement ? 'present' : 'ABSENT'));

  // ── B1 / B1b ──
  var legacy = {}, ss = q('SELECT c_bankstatement_id AS id, posted FROM c_bankstatement WHERE ad_client_id=11 ORDER BY c_bankstatement_id');
  q('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=392 AND ad_client_id=11').forEach(function (f) {
    var b = legacy[f.r] || (legacy[f.r] = {}); if (cents(f.d)) { var k = f.s + ':' + f.a + ':DR'; b[k] = (b[k] || 0) + cents(f.d); } if (cents(f.c)) { var k2 = f.s + ':' + f.a + ':CR'; b[k2] = (b[k2] || 0) + cents(f.c); } });
  log('§WBST POPULATION statements(client 11)=' + ss.length + ' with legacy facts=' + Object.keys(legacy).length + ' (filtered by ad_client_id)');
  var judged = 0, noOracle = 0;
  ss.forEach(function (s) {
    var r = postWith(poster, 'c_bankstatement', s.id), fx = facts(r), posted = r.trx.get('c_bankstatement', s.id).posted, lg = legacy[s.id] || {}, legN = Object.keys(lg).length, d = diffMaps(fx.tw, lg);
    log('§WBST stmt=' + s.id + ' legacyKeys=' + legN + ' twinKeys=' + Object.keys(fx.tw).length + ' facts=' + fx.n + ' maxDiff=' + d.md + 'c posted=' + posted + ' dates=' + fx.dates.join(',') + (r.exc ? ' EXC=' + r.exc : '') + (d.bad.length ? ' DIFF ' + d.bad.join(' | ') : '') + ' log=' + r.log.filter(function (l) { return /§MODEL-POST/.test(l); }).join(' ; ').slice(0, 240));
    if (legN) { judged++; ok('B1-' + s.id, 'statement ' + s.id + ': twin facts == stored legacy Fact_Acct per schema x account x side, Posted=Y', d.md === 0 && fx.n > 0 && posted === 'Y', 'maxDiff=' + d.md + 'c posted=' + posted + ' facts=' + fx.n); }
    else {                                                                             // B1b: no legacy oracle - the Java expectation only, never a PASS (the old comparator was doc_poster.deriveBankStatement, retired: §POSTING-PARITY step 5c)
      var nl = q('SELECT count(*) AS n FROM c_bankstatementline WHERE c_bankstatement_id=?', [s.id])[0].n, expect0 = Number(nl) === 0;   // Doc_BankStatement.createFacts :160-285 loops p_lines: no lines -> no facts
      log('§WBST B1b stmt=' + s.id + ' NO LEGACY ORACLE; statement lines=' + nl + ' twin keys=' + Object.keys(fx.tw).length + ' facts=' + fx.n + ' posted=' + posted);
      noOracle++; var bad1b = expect0 && fx.n !== 0; log((bad1b ? '  ❌ ' : '  ◻ ') + 'B1b-' + s.id + ' NO LEGACY ORACLE (not a PASS, not counted as one): ' + (expect0 ? 'no statement lines -> Java books no facts; twin facts=' + fx.n : 'statement has ' + nl + ' lines and no legacy facts - not judged') + '; posted=' + posted); if (bad1b) fail++; }
  });

  // ── synthetic cases (rows inserted into the witness's own in-memory copy; no legacy oracle: expectations come from the Java text) ──
  function lineRow(id, stmt, ln, extra) { return Object.assign({ c_bankstatementline_id: id, ad_client_id: 11, ad_org_id: 11, isactive: 'Y', c_bankstatement_id: stmt, line: ln, isreversal: 'N', valutadate: '2002-02-22 00:00:00', c_currency_id: 100, c_bankstatementline_uu: 'x' + id }, extra); }
  function ins(table, o) { var ks = Object.keys(o); db.run('INSERT INTO ' + table + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return o[k]; })); }
  var hdr100 = q('SELECT * FROM c_bankstatement WHERE c_bankstatement_id=100')[0], l100 = q('SELECT * FROM c_bankstatementline WHERE c_bankstatement_id=100 ORDER BY line');
  function mkStmt(id, dateacct) { var h = Object.assign({}, hdr100); h.c_bankstatement_id = id; h.dateacct = dateacct; h.documentno = 'SYN' + id; if ('c_bankstatement_uu' in h) h.c_bankstatement_uu = 'syn' + id; ins('c_bankstatement', h);
    l100.forEach(function (l, i) { var c = Object.assign({}, l); c.c_bankstatementline_id = id * 10 + i; c.c_bankstatement_id = id; c.dateacct = '2002-03-05 00:00:00'; if ('c_bankstatementline_uu' in c) c.c_bankstatementline_uu = 'synl' + id + i; ins('c_bankstatementline', c); }); }
  mkStmt(9001, '2002-02-22 00:00:00');
  var SYNJUDGED = 0;
  // B2: sysconfig N (no table) vs Y
  var rN = postWith(poster, 'c_bankstatement', 9001), fN = facts(rN);
  db.run("CREATE TABLE IF NOT EXISTS ad_sysconfig (ad_sysconfig_id INTEGER, ad_client_id INTEGER, ad_org_id INTEGER, isactive TEXT, name TEXT, value TEXT)"); ins('ad_sysconfig', { ad_sysconfig_id: 1, ad_client_id: 11, ad_org_id: 0, isactive: 'Y', name: 'BANK_STATEMENT_POST_WITH_DATE_FROM_LINE', value: 'Y' });
  var rY = postWith(poster, 'c_bankstatement', 9001), fY = facts(rY);
  log('§WBST B2 header DateAcct=2002-02-22 line DateAcct=2002-03-05; N: ' + JSON.stringify(fN.byLine) + ' Y: ' + JSON.stringify(fY.byLine) + ' (L = fact of a statement line, H = header-level line e.g. Fact.balanceAccounting CurrencyBalancing, createLine(null,..))');
  var onlyL = function (f, d) { return Object.keys(f.byLine).filter(function (k) { return k[0] === 'L'; }).every(function (k) { return k === 'L:' + d; }) && Object.keys(f.byLine).some(function (k) { return k[0] === 'L'; }); }, onlyH = function (f) { return Object.keys(f.byLine).filter(function (k) { return k[0] === 'H'; }).every(function (k) { return k === 'H:2002-02-22'; }); };
  ok('B2', 'per-line DateAcct (DocLine_Bank.java:50): N -> header date 2002-02-22 on every fact; Y -> every statement-line fact carries the LINE date 2002-03-05, header-level (no docLine) facts keep the header date; amounts unchanged', fN.n > 0 && fY.n > 0 ? (onlyL(fN, '2002-02-22') && onlyH(fN) && onlyL(fY, '2002-03-05') && onlyH(fY) && diffMaps(fN.tw, fY.tw).md === 0) : null, 'N=' + JSON.stringify(fN.byLine) + ' Y=' + JSON.stringify(fY.byLine));
  db.run("DELETE FROM ad_sysconfig");
  // B1b-synthetic: clearing-equal branch (Java :184-198): schema IsPostIfClearingEqual=N and asset==transit -> ONE line per statement line = Stmt-Trx (-0.50 -> CR asset 0.50 on line 1; line 2 = 0 -> no line)
  var as1 = q('SELECT ispostifclearingequal AS p FROM c_acctschema WHERE c_acctschema_id=101')[0].p, ba1 = q('SELECT b_intransit_acct AS t FROM c_bankaccount_acct WHERE c_bankaccount_id=100 AND c_acctschema_id=101')[0].t;
  db.run("UPDATE c_acctschema SET ispostifclearingequal='N' WHERE c_acctschema_id=101"); db.run('UPDATE c_bankaccount_acct SET b_intransit_acct=b_asset_acct WHERE c_bankaccount_id=100 AND c_acctschema_id=101');
  var rE = postWith(poster, 'c_bankstatement', 9001), fE = facts(rE), e101 = Object.keys(fE.tw).filter(function (k) { return k.indexOf('101:') === 0; }).map(function (k) { return k + '=' + fE.tw[k]; });
  log('§WBST B1b-clearing-equal schema101 facts: ' + e101.join(' ') + ' (Java: asset CR 50c, charge DR 25c, interest DR 25c; no transit/asset 98/50 legs)');
  var ev = function (vcid) { return q('SELECT account_id AS a FROM c_validcombination WHERE c_validcombination_id=?', [vcid])[0].a; }, want = {}; want['101:' + ev(258) + ':CR'] = 50; want['101:' + ev(267) + ':DR'] = 25; want['101:' + ev(261) + ':DR'] = 25; var dw = diffMaps(Object.keys(fE.tw).filter(function (k) { return k.indexOf('101:') === 0; }).reduce(function (o, k) { o[k] = fE.tw[k]; return o; }, {}), want);
  ok('B1b-equal', 'IsPostIfClearingEqual=N + asset==transit: only the Stmt-Trx difference posts (no legacy oracle; expectation = Doc_BankStatement.java:184-198)', fE.n > 0 ? dw.md === 0 : null, 'maxDiff=' + dw.md + 'c ' + dw.bad.join(' | '));
  db.run("UPDATE c_acctschema SET ispostifclearingequal='" + as1 + "' WHERE c_acctschema_id=101"); db.run('UPDATE c_bankaccount_acct SET b_intransit_acct=? WHERE c_bankaccount_id=100 AND c_acctschema_id=101', [ba1]);

  // ── B3: every other doc type, candidate vs pinned baseline, byte-identical (result, ops, log) ──
  // c_allocationhdr deliberately NOT here: Doc_AllocationHdr gained its legs (W-POST-ALLOCATION owns that judgement, PIN f4cdcdf8)
  var TABLES = ['c_order', 'm_inout', 'c_invoice', 'c_payment', 'm_matchinv', 'm_matchpo', 'm_movement', 'm_inventory', 'gl_journal'], n3 = 0, d3 = [], per = {};
  if (!PB) ok('B3', 'baseline model_post loadable via git show ' + BASE, null, 'git show failed - INCONCLUSIVE');
  else {
    TABLES.forEach(function (t) {
      q('SELECT ' + t + '_id AS id FROM ' + t + ' WHERE ad_client_id=11 ORDER BY ' + t + '_id').forEach(function (d) {
        var b = postWith(PB.post, t, d.id), c = postWith(PN.post, t, d.id), same = b.res === c.res && b.exc === c.exc && b.ops === c.ops && JSON.stringify(b.log) === JSON.stringify(c.log);
        n3++; per[t] = per[t] || { n: 0, f: 0 }; per[t].n++; if (!same) { per[t].f++; d3.push(t + '#' + d.id); } });
    });
    log('§WBST-B3 per table: ' + TABLES.map(function (t) { return t + '=' + (per[t] ? per[t].n : 0) + (per[t] && per[t].f ? '(DIFF ' + per[t].f + ')' : ''); }).join(' '));
    ok('B3', n3 + ' non-bank-statement documents post byte-identically (result+ops+log) candidate vs baseline ' + BASE, n3 ? d3.length === 0 : null, n3 ? d3.slice(0, 8).join(' ') : 'VACUOUS: no documents');
  }
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§WBST-SUMMARY ' + verdict + ' mutant=' + (MUT || 'none') + ' baseline=' + (BASELINE ? 'Y' : 'N') + ' statementsJudged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noLegacyOracle=' + noOracle + ' (reported separately, never counted as PASS)');
  process.exit(fail ? 1 : verdict === 'INCONCLUSIVE' ? 3 : 0);
})().catch(function (e) { log('§WBST-ERROR ' + e.stack); process.exit(2); });
