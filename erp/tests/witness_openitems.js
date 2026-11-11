#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-OPENITEMS (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §OPENITEMS-SPEC). READ THE LOG after every run: every verdict is a §OPENITEMS line; the exit code is not evidence.
//   INCONCLUSIVE (never PASS) when nothing was judged or the legacy DB is unreachable.
// THE ISSUE it proves/disproves: do the twin's Open Items (AD_Process 145, view RV_OpenItem) and Aging (AD_Process 238, T_Aging) give the legacy's figures - per partner/currency
//   (and per invoice/pay schedule), every one of the 20 buckets + open + invoiced + days due + due date - at the statement dates that put each open item ON each bucket boundary?
// ORACLE = the legacy `idempiere_test` postgres (docker `postgres`), client 11: its live view rv_openitem + its OWN SQL port of MAging.add's bucket table (SQL FILTER sums,
//   statement dates swept to every boundary). Never the twin's JS. MUTANTS (must FAIL): a bucket boundary off by one, a dropped item, a flipped (credit-memo) sign.
// Command: node erp/tests/witness_openitems.js 2>&1 | tee /tmp/count_logs/openitems.log
'use strict';
var path = require('path'), cp = require('child_process');
if (!global.window) global.window = {};
var ERP = path.join(__dirname, '..');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(AGING|OPENITEMS-VIEW)/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §OPENITEMS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1200))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§OPENITEMS-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var DB = process.env.IDEMPIERE_TEST_DB || 'idempiere_test', CLIENT = 11, CONT = process.env.IDEMPIERE_PG_CONTAINER || 'postgres';
function pg(sql) {
  var env = Object.assign({}, process.env, { PGPASSWORD: process.env.IDEMPIERE_PGPASSWORD || process.env.PGPASSWORD || 'adempiere' });
  var out = cp.execFileSync('docker', ['exec', '-e', 'PGPASSWORD', CONT, 'psql', '-X', '-q', '-At', '-F', '|', '-U', 'adempiere', '-d', DB, '-c', 'SET search_path TO adempiere; ' + sql], { env: env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
  return out.split('\n').filter(function (l) { return l && l !== 'SET'; }).map(function (l) { return l.split('|'); });
}
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
var NUM = ['invoicedamt', 'openamt', 'dueamt', 'due0', 'due0_7', 'due0_30', 'due1_7', 'due8_30', 'due31_60', 'due31_plus', 'due61_90', 'due61_plus', 'due91_plus',
  'pastdueamt', 'pastdue1_7', 'pastdue1_30', 'pastdue8_30', 'pastdue31_60', 'pastdue31_plus', 'pastdue61_90', 'pastdue61_plus', 'pastdue91_plus'];
// the oracle's bucket table = MAging.add :173-234, written as SQL (d = daysDue)
var BKT = { dueamt: 'd<=0', due0: 'd=0', due0_7: 'd<=0 and d>=-7', due0_30: 'd<=0 and d>=-30', due1_7: 'd<=-1 and d>=-7', due8_30: 'd<=-8 and d>=-30', due31_60: 'd<=-31 and d>=-60', due31_plus: 'd<=-31',
  due61_90: 'd<=-61 and d>=-90', due61_plus: 'd<=-61', due91_plus: 'd<=-91', pastdueamt: 'd>=1', pastdue1_7: 'd>=1 and d<=7', pastdue1_30: 'd>=1 and d<=30', pastdue8_30: 'd>=8 and d<=30',
  pastdue31_60: 'd>=31 and d<=60', pastdue31_plus: 'd>=31', pastdue61_90: 'd>=61 and d<=90', pastdue61_plus: 'd>=61', pastdue91_plus: 'd>=91' };
function oracleAging(offs, so, list, where) {
  var sel = NUM.slice(2).map(function (k) { return "coalesce(sum(oi.openamt) filter (where " + BKT[k] + "),0)"; }).join(',');
  var sql = 'SELECT o.off, oi.c_bpartner_id, oi.c_currency_id, ' + (list ? 'oi.c_invoice_id, coalesce(oi.c_invoicepayschedule_id,0)' : '0,0') + ', sum(oi.grandtotal), sum(oi.openamt), ' + sel +
    ", (sum(oi.daysdue+o.off)/count(*))::int, to_char(min(oi.duedate),'YYYY-MM-DD') FROM (SELECT oi.*, oi.daysdue+o.off AS d FROM rv_openitem oi CROSS JOIN (SELECT unnest(ARRAY[" + offs.join(',') + "]) AS off) o) oi " +
    'JOIN (SELECT unnest(ARRAY[' + offs.join(',') + ']) AS off) o ON o.off=oi.d-oi.daysdue JOIN c_bpartner bp ON bp.c_bpartner_id=oi.c_bpartner_id WHERE oi.ad_client_id=' + CLIENT + " AND oi.issotrx='" + so + "'" + (where || '') +
    ' GROUP BY o.off, oi.c_bpartner_id, oi.c_currency_id' + (list ? ', oi.c_invoice_id, coalesce(oi.c_invoicepayschedule_id,0)' : '') + ' ORDER BY 1,2,3,4,5';
  var m = {}; pg(sql).forEach(function (r) { var key = r.slice(0, 5).join('|'), o = {}; NUM.forEach(function (k, i) { o[k] = cents(r[5 + i]); }); o.daysdue = Number(r[5 + NUM.length]); o.duedate = r[6 + NUM.length]; m[key] = o; });
  return m;
}
function twinKey(off, r, list) { return [off, r.c_bpartner_id, r.c_currency_id, list ? r.c_invoice_id : 0, list ? (r.c_invoicepayschedule_id || 0) : 0].join('|'); }
function cmpAging(got, want) {   // got: {key:row(twin)}, want: oracle map; returns mismatch strings
  var bad = [], ks = {}; Object.keys(got).concat(Object.keys(want)).forEach(function (k) { ks[k] = 1; });
  Object.keys(ks).sort().forEach(function (k) { var g = got[k], w = want[k]; if (!g || !w) { bad.push(k + (g ? ' only in twin' : ' missing in twin')); return; }
    NUM.forEach(function (f) { if (cents(g[f]) !== w[f]) bad.push(k + ' ' + f + ' twin ' + cents(g[f]) + ' legacy ' + w[f]); });
    if (Number(g.daysdue) !== w.daysdue) bad.push(k + ' daysdue twin ' + g.daysdue + ' legacy ' + w.daysdue);
    if (String(g.duedate).slice(0, 10) !== w.duedate) bad.push(k + ' duedate twin ' + g.duedate + ' legacy ' + w.duedate); });
  return bad;
}
(async function main() {
  var base, today, items0;
  try { today = pg('SELECT current_date')[0][0]; items0 = pg('SELECT c_invoice_id, coalesce(c_invoicepayschedule_id,0), daysdue FROM rv_openitem WHERE ad_client_id=' + CLIENT); }
  catch (e) { say('§OPENITEMS-SOURCE unreachable: ' + String(e.message).split('\n')[0]); say('§OPENITEMS-VERDICT INCONCLUSIVE judged=0 failed=0 (legacy postgres not reachable: docker ' + CONT + ', db ' + DB + ')'); return; }
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), AP = require(path.join(ERP, 'ad_process.js'));
  AP.installDefaultHandlers(null);
  var day = function (s) { return Math.floor(Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 86400000); }, iso = function (d) { return new Date(d * 86400000).toISOString().slice(0, 10); };
  var ctx = { query: k.q, today: today, clientId: CLIENT };
  say('§OPENITEMS-SOURCE db=' + DB + ' client=' + CLIENT + ' today=' + today + ' rv_openitem_rows=' + items0.length);
  check('SOURCE', 'reachable', 'legacy answers with open items', items0.length > 0, { rows: items0.length });
  verdict('SOURCE');
  // OI: openItems() == rv_openitem per invoice/schedule
  var wantOI = {}; pg("SELECT c_invoice_id, coalesce(c_invoicepayschedule_id,0), issotrx, c_bpartner_id, c_currency_id, round(openamt*100)::bigint, round(grandtotal*100)::bigint, daysdue, to_char(duedate,'YYYY-MM-DD'), documentno, to_char(dateacct,'YYYY-MM-DD'), coalesce(invoicecollectiontype,''), c_paymentterm_id FROM rv_openitem WHERE ad_client_id=" + CLIENT).forEach(function (r) { wantOI[r[0] + '/' + r[1]] = r; });
  var oi = AP.openItems(k.q, { today: today, clientId: CLIENT }), gotOI = {}; oi.forEach(function (x) { gotOI[x.c_invoice_id + '/' + (x.c_invoicepayschedule_id || 0)] = x; });
  var oiBad = []; Object.keys(Object.assign({}, wantOI, gotOI)).forEach(function (key) { var g = gotOI[key], w = wantOI[key]; if (!g || !w) { oiBad.push(key + (g ? ' only twin' : ' missing in twin')); return; }
    var chk = [['issotrx', g.issotrx, w[2]], ['bp', g.c_bpartner_id, w[3]], ['cur', g.c_currency_id, w[4]], ['openamt', cents(g.openamt), Number(w[5])], ['grandtotal', cents(g.grandtotal), Number(w[6])], ['daysdue', g.daysdue, Number(w[7])],
      ['duedate', String(g.duedate).slice(0, 10), w[8]], ['documentno', g.documentno, w[9]], ['dateacct', String(g.dateacct).slice(0, 10), w[10]], ['collection', g.invoicecollectiontype || '', w[11]], ['term', g.c_paymentterm_id, Number(w[12])]];
    chk.forEach(function (c) { if (String(c[1]) !== String(c[2])) oiBad.push(key + ' ' + c[0] + ' twin ' + c[1] + ' legacy ' + c[2]); }); });
  check('OPENITEMS', 'rv_openitem', 'twin openItems() == legacy rv_openitem for every invoice / pay schedule (' + Object.keys(wantOI).length + ' rows, 11 columns)', Object.keys(wantOI).length > 0 && !oiBad.length, oiBad.slice(0, 6));
  verdict('OPENITEMS');
  // AGING: sweep statement dates to each item's every bucket boundary
  var B = [-100, -92, -91, -90, -62, -61, -60, -32, -31, -30, -9, -8, -7, -2, -1, 0, 1, 2, 7, 8, 30, 31, 60, 61, 90, 91, 100], offSet = {};
  Array.from(new Set(items0.map(function (r) { return Number(r[2]); }))).forEach(function (dd) { B.forEach(function (b) { offSet[b - dd] = 1; }); });
  var offs = Object.keys(offSet).map(Number).sort(function (a, b) { return a - b; });
  function twinAging(off, so, list, extra) {
    var stmt = iso(day(today) + off), res = AP.REGISTRY['org.compiere.process.Aging'].fn(ctx, { params: Object.assign({ StatementDate: stmt, IsSOTrx: so, IsListInvoices: list ? 'Y' : 'N' }, extra || {}) }), m = {};
    ((res.result && res.result.aging) || []).forEach(function (r) { m[twinKey(off, r, list)] = r; }); return m;
  }
  var RUNS = [['SO', 'Y', false, ''], ['SO-list', 'Y', true, ''], ['PO', 'N', false, '']];
  var oracleCache = {};
  RUNS.forEach(function (R) {
    var want = oracleAging(offs, R[1], R[2], R[3]); oracleCache[R[0]] = want; var got = {}; offs.forEach(function (off) { Object.assign(got, twinAging(off, R[1], R[2])); });
    var bad = cmpAging(got, want);
    check('AGING', R[0], 'process 238 at ' + offs.length + ' statement dates (every item on every bucket boundary): ' + Object.keys(want).length + ' (stmt,partner,currency' + (R[2] ? ',invoice,schedule' : '') + ') rows x 24 fields == legacy', Object.keys(want).length > 0 && !bad.length, bad.slice(0, 6)); });
  // filters: partner / group
  var bpRow = pg("SELECT oi.c_bpartner_id, bp.c_bp_group_id FROM rv_openitem oi JOIN c_bpartner bp USING (c_bpartner_id) WHERE oi.ad_client_id=" + CLIENT + " AND oi.issotrx='Y' ORDER BY 1 LIMIT 1")[0];
  var wantBP = oracleAging(offs, 'Y', false, ' AND oi.c_bpartner_id=' + bpRow[0]), gotBP = {}; offs.forEach(function (off) { Object.assign(gotBP, twinAging(off, 'Y', false, { C_BPartner_ID: Number(bpRow[0]) })); });
  var bBP = cmpAging(gotBP, wantBP); check('AGING', 'bpartner-filter', 'C_BPartner_ID=' + bpRow[0] + ' limits to that partner exactly like Aging.java :156-159', Object.keys(wantBP).length > 0 && !bBP.length, bBP.slice(0, 6));
  var wantGR = oracleAging(offs, 'Y', false, ' AND bp.c_bp_group_id=' + bpRow[1]), gotGR = {}; offs.forEach(function (off) { Object.assign(gotGR, twinAging(off, 'Y', false, { C_BP_Group_ID: Number(bpRow[1]) })); });
  var bGR = cmpAging(gotGR, wantGR); check('AGING', 'group-filter', 'C_BP_Group_ID=' + bpRow[1] + ' (Aging.java :160-163)', Object.keys(wantGR).length > 0 && !bGR.length, bGR.slice(0, 6));
  verdict('AGING');
  // P145: the report view with each parameter
  function oracleView(where) { return pg("SELECT c_invoice_id, coalesce(c_invoicepayschedule_id,0), round(openamt*100)::bigint, daysdue, to_char(duedate,'YYYY-MM-DD'), documentno, coalesce(invoicecollectiontype,'') FROM rv_openitem oi WHERE ad_client_id=" + CLIENT + (where || '') + ' ORDER BY 1,2').map(function (r) { return r.join('|'); }); }
  function twinView(params) { var r = AP.REGISTRY['reportview:rv_openitem'].fn(ctx, { params: params }); return r.result.view.rows.map(function (x) { return [x.c_invoice_id, x.c_invoicepayschedule_id || 0, cents(x.openamt), x.daysdue, String(x.duedate).slice(0, 10), x.documentno, x.invoicecollectiontype || ''].join('|'); }).sort(function (a, b) { var p = a.split('|'), q = b.split('|'); return (p[0] - q[0]) || (p[1] - q[1]); }); }
  var minD = Math.min.apply(null, items0.map(function (r) { return Number(r[2]); })), maxD = Math.max.apply(null, items0.map(function (r) { return Number(r[2]); })), midD = Math.floor((minD + maxD) / 2);
  [['none', {}, ''], ['IsSOTrx=Y', { IsSOTrx: 'Y' }, " AND issotrx='Y'"], ['IsSOTrx=N', { IsSOTrx: 'N' }, " AND issotrx='N'"], ['C_BPartner_ID', { C_BPartner_ID: Number(bpRow[0]) }, ' AND c_bpartner_id=' + bpRow[0]],
   ['InvoiceCollectionType=' + 'D', { InvoiceCollectionType: 'D' }, " AND invoicecollectiontype='D'"],
   ['DaysDue range', { DaysDue: { v: midD, vTo: maxD } }, ' AND daysdue BETWEEN ' + midD + ' AND ' + maxD], ['DaysDue lower only', { DaysDue: { v: midD, vTo: null } }, ' AND daysdue>=' + midD]].forEach(function (c) {
    var w = oracleView(c[2]), g = twinView(c[1]);
    if (!w.length) { say('§OPENITEMS-VACUOUS case=P145 key=' + c[0] + ' legacy has no row for this filter: not judged (INCONCLUSIVE, not PASS)'); return; }
    check('P145', c[0], 'process 145 rows == legacy rv_openitem rows for the parameter (' + w.length + ' rows)', J(g) === J(w), { twin: g.slice(0, 3), legacy: w.slice(0, 3) }); });
  verdict('P145');
  // VACUOUS control: a customer with no open item must NOT verify
  var none = pg("SELECT c_bpartner_id FROM c_bpartner WHERE ad_client_id=" + CLIENT + " AND c_bpartner_id NOT IN (SELECT c_bpartner_id FROM rv_openitem) ORDER BY 1 LIMIT 1")[0][0];
  var wantV = oracleAging([0], 'Y', false, ' AND oi.c_bpartner_id=' + none), gotV = twinAging(0, 'Y', false, { C_BPartner_ID: Number(none) });
  say('§OPENITEMS-VACUOUS case=control bp=' + none + ' legacy_rows=' + Object.keys(wantV).length + ' twin_rows=' + Object.keys(gotV).length + ' verdict=' + (Object.keys(wantV).length ? 'JUDGED' : 'INCONCLUSIVE'));
  check('VACUOUS', 'empty-population-detected', 'a partner with nothing open leaves the judged population empty (the harness says INCONCLUSIVE for it, never PASS)', Object.keys(wantV).length === 0 && Object.keys(gotV).length === 0, null);
  verdict('VACUOUS');
  // MUTANTS: the SAME comparator over a mutated twin fold must FAIL
  var foldSrc = AP.agingFold.toString(), rnd = function (x, p) { var f = Math.pow(10, p == null ? 2 : p), v = Number(x) || 0; return Math.round(v * f + (v < 0 ? -1e-9 : 1e-9)) / f; };
  function mkFold(src) { return new Function('AGING_BUCKETS', '_agRound', 'return ' + src)(AP.AGING_BUCKETS, rnd); }
  function runFold(fold, itemsMut) {
    var got = {}; offs.forEach(function (off) { var its = oi.filter(function (x) { return x.issotrx === 'Y'; }).map(function (x) { return Object.assign({}, x, { c_bp_group_id: 0 }); }); if (itemsMut) its = itemsMut(its);
      fold(its, { statementOffset: off, isListInvoices: false }).forEach(function (r) { got[twinKey(off, r, false)] = r; }); }); return got;
  }
  var wantM = oracleCache['SO'];
  var ctlBad = cmpAging(runFold(mkFold(foldSrc)), wantM);
  check('MUTANT', 'control-unmutated-copy', 'the harness\'s own copy of the fold, unmutated, == legacy (else the mutants prove nothing)', Object.keys(wantM).length > 0 && !ctlBad.length, ctlBad.slice(0, 4));
  [['boundary 7 -> <7 (PastDue1_7)', function () { if (foldSrc.indexOf('daysDue <= 7') < 0) throw new Error('mutation site gone'); return runFold(mkFold(foldSrc.replace('daysDue <= 7', 'daysDue < 7'))); }],
   ['boundary -91 -> < -91 (Due91_Plus)', function () { if (foldSrc.indexOf('daysDue <= -91') < 0) throw new Error('mutation site gone'); return runFold(mkFold(foldSrc.replace('daysDue <= -91', 'daysDue < -91'))); }],
   ['dropped item', function () { return runFold(mkFold(foldSrc), function (its) { return its.slice(1); }); }],
   ['credit-memo sign lost (an open item enters with the wrong sign)', function () { return runFold(mkFold(foldSrc), function (its) { its[0] = Object.assign({}, its[0], { openamt: -its[0].openamt, grandtotal: -its[0].grandtotal }); return its; }); }]].forEach(function (m) {
    var bad; try { bad = cmpAging(m[1](), wantM); } catch (e) { check('MUTANT', m[0], 'mutation applied', false, e.message); return; }
    check('MUTANT', m[0], 'the comparator FAILS on this mutant (' + bad.length + ' mismatches)', bad.length > 0, null); });
  verdict('MUTANT');
  say('§OPENITEMS-COVERAGE legacy sample: credit_memos_open=' + pg("SELECT count(*) FROM rv_openitem oi JOIN c_invoice i USING (c_invoice_id) JOIN c_doctype d ON d.c_doctype_id=i.c_doctypetarget_id WHERE i.ad_client_id=" + CLIENT + " AND d.docbasetype IN ('ARC','APC')")[0][0] +
    ' foreign_currency_items=' + pg('SELECT count(*) FROM rv_openitem WHERE ad_client_id=' + CLIENT + ' AND c_currency_id<>100')[0][0] + ' fixed_day_terms=' + pg("SELECT count(*) FROM c_paymentterm WHERE ad_client_id IN (0," + CLIENT + ") AND isduefixed='Y'")[0][0] +
    ' refused_by_name: DateAcct=Y (RV_OpenItemToDate/invoiceOpenToDate), ConvertAmountsInCurrency_ID (currencyConvertInvoice) - not witnessed, not claimed');
  SHIPPED.slice(0, 3).forEach(function (l) { say('  shipped> ' + l.slice(0, 300)); });
  var v = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§OPENITEMS-VERDICT ' + v + ' judged=' + ALL.judged + ' failed=' + ALL.failed); process.exitCode = v === 'PASS' ? 0 : 1;
})().catch(function (e) { say('§OPENITEMS-VERDICT FAIL judged=0 failed=1 harness: ' + (e && e.stack || e)); process.exitCode = 1; });
