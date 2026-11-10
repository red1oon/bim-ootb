#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SAPBC-OPEN (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §SAP-BC-OPEN-SPEC). READ THE LOG after every run: every verdict is a §SBO line, the shipped loader's own §MIG-* lines are
//   printed with it, the exit code is not evidence. INCONCLUSIVE (never PASS) when nothing was judged.
// THE ISSUE it proves/disproves: after the open-balances READERS (erp/sap_agent/open_reader.js for SAP Business One, erp/migrate/connectors/bc_open.mjs for Business Central) read a vendor-shaped ledger and the
//   neutral loader (plugins/open_balances.mjs) loads the sheets of migrate/templates/{sap-b1-10,bc-w1}-open.json into a born twin tenant, are the twin's books the ledger at the cut-over: trial balance account by
//   account, every clearing account at exactly the amount the spec says is left on it (0.00 when nothing is), open AR/AP per partner, bank per account?
// WHAT THIS CANNOT PROVE (said, not hidden): there is NO SAP and NO Business Central here. The SOURCE is a TEST-SUPPLIED ledger (tests/fixtures/sapbc_open, made by tools/gen_sapbc_open_fixture.js, values invented, field
//   names from SAP's $metadata / Microsoft BCApps) served by a mock Service Layer / written as a BC package. The ORACLE below re-reads those raw rows by its own code and states the leftover from the documents and
//   the fixture's stated intent (the on-account payment), never from the reader, the template or the loader. §SBO-CONN is INCONCLUSIVE by construction. No claim of real-company validation, and every UNCLEAR row of the
//   spec (S8 S11 S12 S13 S15 B7 B9 and the vendors' real field shapes) is unwitnessed.
// CASES per ERP: SOURCE · READER (+ read-only, missing field) · FROZEN (SAP) / DATE (BC) · SHEETS · LOAD · MUTANT. Plus UNTOUCHED (Odoo/iDempiere/masters files byte-identical) and MODEL (bc_model: old tables unchanged).
// Command: node erp/tests/witness_sapbc_open.js 2>&1 | tee /tmp/count_logs/sapbc_open.log
'use strict';
var fs = require('fs'), path = require('path'), url = require('url'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|IMPORT_|PROC-|SAP-OPEN|BC-OPEN)/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SBO-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1800))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SBO-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };
var FXD = path.join(__dirname, 'fixtures', 'sapbc_open'), SAPX = JSON.parse(fs.readFileSync(path.join(FXD, 'sap_rows.json'), 'utf8')), BCX = JSON.parse(fs.readFileSync(path.join(FXD, 'bc_rows.json'), 'utf8'));
var CUT = '2026-11-10', EARLY = '2026-06-30', LCY = 'USD';
var ONACCOUNT = { C1: -15000 };   // the fixture's stated intent: C1 paid 150.00 on account (no document); every other partner's ledger equals its documents
var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
var cmpKeys = function (a, b) { return Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort(); };

// ═══ the ORACLES: raw fixture rows → the numbers the books must show (own code, own order of operations) ═══
// brought-in rule (spec): local currency, posted, partner has an address, right sign for its kind, an invoice/credit-note kind.
function oracleSap(D) {
  var S = SAPX.sets, O = { onAccount: Object.keys(ONACCOUNT).reduce(function (n, c) { return n + ONACCOUNT[c]; }, 0), cur: SAPX.admin.LocalCurrency, tb: {}, cls: {}, open: {}, bank: {}, bankIso: {}, nonBrought: { AR: 0, AP: 0 }, after: { journal_lines: 0, documents: 0 } };
  S.JournalEntries.forEach(function (je) { je.JournalEntryLines.forEach(function (l) { if (je.ReferenceDate > D) { O.after.journal_lines++; return; } O.tb[l.AccountCode] = (O.tb[l.AccountCode] || 0) + cents(l.Debit) - cents(l.Credit); }); });
  var bp = {}; S.BusinessPartners.forEach(function (b) { bp[b.CardCode] = b; if (b.CardType === 'cCustomer') O.cls[b.DebitorAccount] = 'AR'; if (b.CardType === 'cSupplier') O.cls[b.DebitorAccount] = 'AP'; });
  S.HouseBankAccounts.forEach(function (h) { O.cls[h.GLAccount] = 'BANK'; });
  var kinds = { Invoices: ['ARI', 1], CreditNotes: ['ARC', -1], PurchaseInvoices: ['API', 1], PurchaseCreditNotes: ['APC', -1] };
  Object.keys(kinds).forEach(function (set) { S[set].forEach(function (d) {
    if (d.DocDate > D) { O.after.documents++; return; }
    if (d.Cancelled === 'tYES' || d.DocumentStatus !== 'bost_Open') return;
    var amt = cents(d.DocTotal) - cents(d.PaidToDate); if (amt === 0) return;
    var hasAd = (bp[d.CardCode].BPAddresses || []).length > 0, local = d.DocCurrency === O.cur, b = kinds[set][0], signed = amt * kinds[set][1], side = b[0] === 'A' && b[1] === 'R' ? 'AR' : 'AP';
    var brought = local && !!d.TransNum && hasAd && amt > 0;
    O.open[String(d.DocNum)] = { base: b, bp: d.CardCode, iso: local ? O.cur : d.DocCurrency, amt: amt, signed: signed, date: d.DocDate, brought: brought, side: side };
    if (!brought) O.nonBrought[side] += (side === 'AR' ? signed : -signed) * (side === 'AR' ? 1 : 1); }); });
  // per-partner GL tie: GL(control, tagged with the partner) minus the partner's open documents must be exactly the stated on-account amount
  var gl = {}; S.JournalEntries.forEach(function (je) { if (je.ReferenceDate > D) return; je.JournalEntryLines.forEach(function (l) { if (l.ShortName !== l.AccountCode && O.cls[l.AccountCode] && O.cls[l.AccountCode] !== 'BANK') gl[l.ShortName] = (gl[l.ShortName] || 0) + cents(l.Debit) - cents(l.Credit); }); });
  var docSum = {}; Object.keys(O.open).forEach(function (n) { var d = O.open[n]; docSum[d.bp] = (docSum[d.bp] || 0) + (d.side === 'AR' ? d.signed : -d.signed); });
  O.resid = {}; cmpKeys(gl, docSum).forEach(function (c) { var r = (gl[c] || 0) - (docSum[c] || 0); if (r) O.resid[c] = r; });
  S.HouseBankAccounts.forEach(function (h) { var ch = S.ChartOfAccounts.filter(function (a) { return a.Code === h.GLAccount; })[0]; O.bank[h.AccNo] = O.tb[h.GLAccount] || 0; O.bankIso[h.AccNo] = ch.AcctCurrency === O.cur ? O.cur : ch.AcctCurrency; });
  return finish(O);
}
function oracleBc(D) {
  var R = BCX.rows, O = { cur: R['98'][0]['LCY Code'], tb: {}, cls: {}, open: {}, bank: {}, bankIso: {}, nonBrought: { AR: 0, AP: 0 }, after: { gl_entries: 0 } };
  R['17'].forEach(function (e) { if (e['Posting Date'] > D) { O.after.gl_entries++; return; } O.tb[e['G/L Account No.']] = (O.tb[e['G/L Account No.']] || 0) + cents(e.Amount); });
  var pg = function (tab, f, g) { var m = {}; R[tab].forEach(function (x) { m[x.Code] = x[f]; }); return m; };
  var ar = pg('92', 'Receivables Account'), ap = pg('93', 'Payables Account'), bk = pg('277', 'G/L Account No.');
  R['18'].forEach(function (c) { O.cls[ar[c['Customer Posting Group']]] = 'AR'; }); R['23'].forEach(function (c) { O.cls[ap[c['Vendor Posting Group']]] = 'AP'; }); R['270'].forEach(function (b) { O.cls[bk[b['Bank Acc. Posting Group']]] = 'BANK'; });
  var party = {}; R['18'].forEach(function (c) { party[c['No.']] = c; }); R['23'].forEach(function (c) { party[c['No.']] = c; });
  var doTab = function (led, det, link, nof, cust) { var rem = {}; R[det].forEach(function (d) { if (d['Posting Date'] > D) return; rem[d[link]] = (rem[d[link]] || 0) + cents(d['Amount (LCY)']); });
    R[led].forEach(function (e) { var r = rem[e['Entry No.']] || 0; if (e['Posting Date'] > D || !r) return; var t = e['Document Type'], b = t === 'Invoice' ? (cust ? 'ARI' : 'API') : t === 'Credit Memo' ? (cust ? 'ARC' : 'APC') : '';
      var p = party[e[nof]], hasAd = !!(p.Address || p.City || p['Post Code'] || p['Country/Region Code']), local = !e['Currency Code'], side = cust ? 'AR' : 'AP', amt = cust ? r : -r, brought = !!b && local && hasAd && ((b === 'ARI' || b === 'API') ? amt > 0 : amt < 0);
      O.open[e['Document No.']] = { base: b, bp: e[nof], iso: local ? O.cur : e['Currency Code'], amt: Math.abs(amt), signed: amt, date: e['Posting Date'], brought: brought, side: side, kind: t };
      if (!brought) O.nonBrought[side] += cust ? amt : -amt; }); };
  doTab('21', '379', 'Cust. Ledger Entry No.', 'Customer No.', true); doTab('25', '380', 'Vendor Ledger Entry No.', 'Vendor No.', false);
  R['270'].forEach(function (b) { var s = 0; R['271'].forEach(function (e) { if (e['Bank Account No.'] === b['No.'] && e['Posting Date'] <= D) s += cents(e.Amount); }); O.bank[b['Bank Account No.'] || b['No.']] = s; O.bankIso[b['Bank Account No.'] || b['No.']] = b['Currency Code'] || O.cur; });
  return finish(O);
}
function finish(O) {
  O.clsTotal = { AR: 0, AP: 0, BANK: 0 }; Object.keys(O.tb).forEach(function (a) { if (O.cls[a]) O.clsTotal[O.cls[a]] += O.tb[a]; });
  var stmtLocal = 0, foreignBankGl = 0; Object.keys(O.bank).forEach(function (a) { if (O.bankIso[a] === O.cur) stmtLocal += O.bank[a]; });
  // what stays on each clearing account: AR = documents not brought (foreign, no address, payment kinds) + the stated on-account amount; AP likewise; BANK = the class total minus the statements brought in
  var on = O.onAccount || 0;   // SAP: a payment on account is no document, it sits in the control account (stated intent of the fixture); BC: it is an open ledger entry of a payment kind, already in nonBrought
  O.left = { AR: O.nonBrought.AR + on, AP: O.clsTotal.AP + Object.keys(O.open).reduce(function (n, k) { return n + (O.open[k].side === 'AP' && O.open[k].brought ? O.open[k].signed : 0); }, 0), BANK: O.clsTotal.BANK - stmtLocal };
  O.stmtLocal = stmtLocal; return O;
}
// ── comparators over the NEUTRAL sets (the reader's output); each returns a list of differences, empty = equal ──
function mk(O) { return {
  tb: function (sets) { var got = {}; sets.tb.forEach(function (r) { got[r.code] = cents(r.balance); }); return cmpKeys(got, O.tb).filter(function (a) { return (got[a] || 0) !== (O.tb[a] || 0); }).map(function (a) { return a + ' reader ' + money(got[a] || 0) + ' oracle ' + money(O.tb[a] || 0); }); },
  cls: function (sets) { return sets.tb.filter(function (r) { return (r.class || '') !== (O.cls[r.code] || ''); }).map(function (r) { return r.code + ' reader ' + r.class + ' oracle ' + (O.cls[r.code] || ''); }); },
  open: function (sets) { var got = {}; sets.open_items.forEach(function (r) { got[r.documentno] = r; }); var d = [];
    cmpKeys(got, O.open).forEach(function (n) { var g = got[n], o = O.open[n];
      if (!g || !o) { d.push(n + ' reader ' + (g ? money(cents(g.open_amount)) : 'absent') + ' oracle ' + (o ? money(o.signed * (o.side === 'AP' ? -1 : 1)) : 'absent')); return; }
      var sg = o.base ? ({ ARI: 1, ARC: -1, API: 1, APC: -1 })[o.base] : 0;
      var wantAmt = o.base ? o.amt * sg : (o.side === 'AR' ? o.signed : -o.signed);
      if (cents(g.open_amount) !== wantAmt || (g.base || '') !== o.base || g.bp_value !== o.bp || g.iso !== o.iso || g.dateinvoiced !== o.date) d.push(n + ' reader ' + money(cents(g.open_amount)) + '/' + g.base + '/' + g.bp_value + '/' + g.iso + '/' + g.dateinvoiced + ' oracle ' + money(wantAmt) + '/' + o.base + '/' + o.bp + '/' + o.iso + '/' + o.date); });
    return d; },
  bank: function (sets) { var got = {}; sets.banks.forEach(function (r) { got[r.accountno] = cents(r.currentbalance); }); return cmpKeys(got, O.bank).filter(function (a) { return got[a] !== O.bank[a]; }).map(function (a) { return a + ' reader ' + money(got[a] || 0) + ' oracle ' + money(O.bank[a] || 0); }); }
}; }

(async function main() {
  var OB = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'open_balances.mjs')).href);
  var SC = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'sap_open_convert.mjs')).href), BO = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_open_convert.mjs')).href);
  var BCM = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_migrate_convert.mjs')).href), MODEL = (await import(url.pathToFileURL(path.join(ERP, 'plugins', 'bc_model.mjs')).href)).default;
  var XLSX = require(path.join(ERP, 'xlsx.mini.min.js')), SR = require(path.join(ERP, 'sap_agent', 'open_reader.js')), MOCK = require(path.join(__dirname, 'sap_sl_open_mock.js'));
  var OS = oracleSap(CUT), OBC = oracleBc(CUT), CS = mk(OS), CB = mk(OBC);

  // ═══ SOURCE: the fixtures are balanced and exercise every peculiarity the cases below claim ═══
  var sum = function (o) { return Object.keys(o.tb).reduce(function (n, a) { return n + o.tb[a]; }, 0); };
  var feat = function (O) { var o = Object.keys(O.open).map(function (k) { return O.open[k]; }); return { credit: o.some(function (d) { return d.base === 'ARC' || d.base === 'APC'; }), foreign: o.some(function (d) { return d.iso !== O.cur; }),
    partly: true, foreignBank: Object.keys(O.bankIso).some(function (a) { return O.bankIso[a] !== O.cur; }) }; };
  say('§SBO-SOURCE sap: tb_accounts=' + Object.keys(OS.tb).length + ' tb_sum=' + money(sum(OS)) + ' AR=' + money(OS.clsTotal.AR) + ' AP=' + money(OS.clsTotal.AP) + ' BANK=' + money(OS.clsTotal.BANK) + ' open_docs=' + Object.keys(OS.open).length + ' brought=' + Object.keys(OS.open).filter(function (n) { return OS.open[n].brought; }).length + ' expected_left=' + J({ AR: money(OS.left.AR), AP: money(OS.left.AP), BANK: money(OS.left.BANK) }));
  say('§SBO-SOURCE bc:  tb_accounts=' + Object.keys(OBC.tb).length + ' tb_sum=' + money(sum(OBC)) + ' AR=' + money(OBC.clsTotal.AR) + ' AP=' + money(OBC.clsTotal.AP) + ' BANK=' + money(OBC.clsTotal.BANK) + ' open_docs=' + Object.keys(OBC.open).length + ' brought=' + Object.keys(OBC.open).filter(function (n) { return OBC.open[n].brought; }).length + ' expected_left=' + J({ AR: money(OBC.left.AR), AP: money(OBC.left.AP), BANK: money(OBC.left.BANK) }));
  check('SOURCE', 'balanced', 'both fixtures have a balanced trial balance at the cut-over (sum 0)', sum(OS) === 0 && sum(OBC) === 0, { sap: sum(OS), bc: sum(OBC) });
  check('SOURCE', 'features', 'each fixture contains a credit note, a foreign-currency item, a foreign bank account (else the leftover rules below would be vacuous)', feat(OS).credit && feat(OS).foreign && feat(OS).foreignBank && feat(OBC).credit && feat(OBC).foreign && feat(OBC).foreignBank, { sap: feat(OS), bc: feat(OBC) });
  check('SOURCE', 'nonzero-left', 'the expected leftover is non-zero on AR and BANK (foreign / no address / on-account / foreign bank), zero on AP - so "left" is exercised and 0.00 is also judged', OS.left.AR === 20000 && OS.left.BANK === 32000 && OS.left.AP === 0 && OBC.left.AR === 20000 && OBC.left.BANK === 32000 && OBC.left.AP === 0, { sap: OS.left, bc: OBC.left });
  check('SOURCE', 'sap-gl-ties-docs', 'SAP: per partner, GL (journal lines tagged with the CardCode) minus the partner\'s open documents == the stated on-account amount only (C1 -150.00); every other partner ties to 0 - the documents and the journal agree', J(OS.resid) === J(ONACCOUNT), OS.resid);
  var chartBal = {}; SAPX.sets.ChartOfAccounts.forEach(function (a) { chartBal[a.Code] = cents(a.Balance); });
  check('SOURCE', 'sap-chart-balance', 'SAP: ChartOfAccounts.Balance (the server\'s own as-of-now balance, a different path) equals the journal sum per account at a cut-over after the last posting', cmpKeys(chartBal, OS.tb).every(function (a) { return (chartBal[a] || 0) === (OS.tb[a] || 0); }), chartBal);
  var arLed = 0; BCX.rows['379'].forEach(function (d) { arLed += cents(d['Amount (LCY)']); });
  check('SOURCE', 'bc-ledger-ties-gl', 'BC: the sum of ALL detailed customer ledger entries (LCY, incl. payments) equals the G/L balance of the receivables account - the sub-ledger and the G/L agree', arLed === OBC.clsTotal.AR, { ledger: arLed, gl: OBC.clsTotal.AR });
  verdict('SOURCE');

  // ═══ SAP READER (mock Service Layer) ═══
  var mk1 = await MOCK.start(SAPX), SEXP = await SR.run({ url: mk1.url, company: 'TESTDB', user: 'manager', password: 'mock', page: 3, cutover: CUT }, null, function (l) { SHIPPED.push(l); }); mk1.close();
  SHIPPED.filter(function (l) { return /^§SAP-OPEN/.test(l); }).slice(-3).forEach(function (l) { say('  shipped> ' + l.slice(0, 380)); });
  var srcR = fs.readFileSync(path.join(ERP, 'sap_agent', 'open_reader.js'), 'utf8');
  check('SAP-READER', 'tb', 'the reader\'s trial balance == the oracle account by account (' + Object.keys(OS.tb).length + ' accounts, ReferenceDate <= ' + CUT + '), and sums to zero', CS.tb(SEXP.sets).length === 0 && SEXP.sets.tb.reduce(function (n, r) { return n + cents(r.balance); }, 0) === 0, CS.tb(SEXP.sets));
  check('SAP-READER', 'classes', 'each account is classed AR / AP / BANK / plain as the oracle (BusinessPartners.DebitorAccount by CardType, HouseBankAccounts.GLAccount) says', CS.cls(SEXP.sets).length === 0, CS.cls(SEXP.sets));
  check('SAP-READER', 'open-items', 'the reader\'s open items == the oracle\'s per document: number, kind, partner, currency, date, signed open amount (' + Object.keys(OS.open).length + ' documents; the cancelled invoice and the paid one are absent)', CS.open(SEXP.sets).length === 0, CS.open(SEXP.sets));
  check('SAP-READER', 'banks', 'the reader\'s bank accounts == the oracle\'s GL balance per house bank account (' + Object.keys(OS.bank).length + ', one of them in EUR)', CS.bank(SEXP.sets).length === 0, CS.bank(SEXP.sets));
  check('SAP-READER', 'no-problem', 'a cut-over after the last posting raises no problem', SEXP.manifest.problems.length === 0 && J(SEXP.manifest.after_cutover) === J({ journal_lines: 0, documents: 0 }), SEXP.manifest.problems);
  check('SAP-READER', 'read-only', 'the mock Service Layer saw only GET and POST Login / Logout / CompanyService_GetAdminInfo (' + mk1.calls.length + ' calls); the manifest says read_only=Y', mk1.calls.every(function (c) { return /^GET /.test(c) || /^POST \/b1s\/v1\/(Login|Logout|CompanyService_GetAdminInfo)$/.test(c); }) && SEXP.manifest.read_only === true, mk1.calls.filter(function (c) { return !/^GET /.test(c); }));
  check('SAP-READER', 'paging', 'with 3 rows per page the reader followed odata.nextLink to the end: JournalEntries 19 rows in 7 pages, $count == rows on every set', SEXP.manifest.sets.JournalEntries.rows === 19 && SEXP.manifest.sets.JournalEntries.pages === 7 && Object.keys(SEXP.manifest.sets).every(function (s) { return SEXP.manifest.sets[s].count === SEXP.manifest.sets[s].rows; }), SEXP.manifest.sets.JournalEntries);
  var pw = cp.spawnSync('node', [path.join(ERP, 'sap_agent', 'agent.js'), '--url', 'http://127.0.0.1:1', '--company', 'X', '--user', 'u', '--password', 'p', '--cutover', CUT], { encoding: 'utf8' });
  check('SAP-READER', 'password-never-a-flag', 'the agent refuses --password with --cutover before any connection (non-zero exit, the message says so); the reader source has no password flag and no write verb (only GET / Login / Logout / AdminInfo)', pw.status !== 0 && /--password is not accepted/.test(pw.stderr) && !/'--password'|"--password"/.test(srcR.replace(/\/\/.*$/mg, '')) && !/method:\s*'(PUT|PATCH|DELETE)'/.test(srcR), { status: pw.status, err: pw.stderr.slice(0, 160) });
  // FIELD: drop PaidToDate from the mock's $metadata of the document type: named, not asked
  var mk2 = await MOCK.start(SAPX, { dropField: { set: 'Invoices', field: 'PaidToDate' } }), X2 = await SR.run({ url: mk2.url, company: 'TESTDB', user: 'manager', password: 'mock', cutover: CUT }, null, function (l) { SHIPPED.push(l); }); mk2.close();
  check('SAP-READER', 'missing-field-named', 'PaidToDate absent from the server\'s Document type => manifest names it (fields_missing), a "field-missing" PROBLEM stops the load, and no $select asked for it (the mock answers 400 to an unknown property)', X2.manifest.sets.Invoices.fields_missing.indexOf('PaidToDate') >= 0 && X2.manifest.problems.some(function (p) { return /^field-missing: Invoices\.PaidToDate/.test(p); }) && !mk2.calls.some(function (c) { return /\$select=[^&]*PaidToDate(,|&|$)/.test(c); }), X2.manifest.problems);
  var mk3 = await MOCK.start(SAPX, { noAdmin: true }), X3 = await SR.run({ url: mk3.url, company: 'TESTDB', user: 'manager', password: 'mock', cutover: CUT }, null, function (l) { SHIPPED.push(l); }); mk3.close();
  check('SAP-READER', 'currency-not-guessed', 'a server that does not declare CompanyService_GetAdminInfo gives a PROBLEM local-currency-unknown, not a guessed currency', X3.manifest.problems.some(function (p) { return /^local-currency-unknown/.test(p); }) && X3.manifest.currency === '', X3.manifest.problems);
  verdict('SAP-READER');

  // ═══ SAP FROZEN ═══
  var OSE = oracleSap(EARLY), mk4 = await MOCK.start(SAPX), SEARLY = await SR.run({ url: mk4.url, company: 'TESTDB', user: 'manager', password: 'mock', cutover: EARLY }, null, function (l) { SHIPPED.push(l); }); mk4.close();
  var fp = SEARLY.manifest.problems.filter(function (p) { return /^source-not-frozen/.test(p); });
  check('SAP-FROZEN', 'counts', 'a cut-over (' + EARLY + ') before later postings raises source-not-frozen naming the oracle\'s counts: journal lines ' + OSE.after.journal_lines + ', documents ' + OSE.after.documents, fp.length === 1 && J(SEARLY.manifest.after_cutover) === J(OSE.after) && OSE.after.journal_lines > 0 && OSE.after.documents > 0, { problems: SEARLY.manifest.problems, after: SEARLY.manifest.after_cutover, oracle: OSE.after });
  check('SAP-FROZEN', 'tb-still-cut', 'the trial balance is still cut at the early date (== the oracle at ' + EARLY + '), though the open amounts cannot be trusted', mk(OSE).tb(SEARLY.sets).length === 0, mk(OSE).tb(SEARLY.sets));
  verdict('SAP-FROZEN');

  // ═══ BC package → reader ═══
  var buf = require(path.join(__dirname, 'bc_package_writer.js')).write(XLSX, MODEL, BCX, 'TEST-BC'), PKG = BCM.readPackage(XLSX.read(buf), MODEL);
  var BEXP = BO.readOpen(PKG, MODEL, { cutover: CUT, say: function (l) { SHIPPED.push(l); } });
  SHIPPED.filter(function (l) { return /^§BC-OPEN/.test(l); }).slice(-2).forEach(function (l) { say('  shipped> ' + l.slice(0, 380)); });
  var srcB = fs.readFileSync(path.join(ERP, 'migrate', 'connectors', 'bc_open.mjs'), 'utf8').replace(/\/\/.*$/mg, '');
  check('BC-READER', 'package', 'the written package is read back with every sheet identified by its table id and 0 unknown headers over the ' + Object.keys(PKG.tables).length + ' tables', Object.keys(BCX.rows).every(function (id) { return PKG.tables[id]; }) && PKG.unknown.length === 0 && PKG.skipped.length === 0, { unknown: PKG.unknown.slice(0, 5), skipped: PKG.skipped });
  check('BC-READER', 'tb', 'the reader\'s trial balance == the oracle account by account (G/L Entry Amount, Posting Date <= ' + CUT + '), and sums to zero', CB.tb(BEXP.sets).length === 0 && BEXP.sets.tb.reduce(function (n, r) { return n + cents(r.balance); }, 0) === 0, CB.tb(BEXP.sets));
  check('BC-READER', 'classes', 'each account is classed AR / AP / BANK / plain as the oracle (posting groups 92 / 93 / 277) says', CB.cls(BEXP.sets).length === 0, CB.cls(BEXP.sets));
  check('BC-READER', 'open-items', 'the reader\'s open items == the oracle\'s per ledger entry: document, kind, partner, currency, date, remaining at the cut-over from the DETAILED entries (' + Object.keys(OBC.open).length + ' entries incl. the open payment; closed pairs absent)', CB.open(BEXP.sets).length === 0, CB.open(BEXP.sets));
  check('BC-READER', 'banks', 'the reader\'s bank accounts == the oracle\'s bank ledger sum per account (' + Object.keys(OBC.bank).length + ', one in EUR)', CB.bank(BEXP.sets).length === 0, CB.bank(BEXP.sets));
  check('BC-READER', 'no-problem', 'no problem on a complete package (BC needs no frozen source)', BEXP.manifest.problems.length === 0, BEXP.manifest.problems);
  check('BC-READER', 'pure', 'the reader is pure: bc_open.mjs imports only bc_package.mjs and has no fs / fetch / network / clock', !/\bfs\b|fetch\(|XMLHttp|Date\.now|new Date|Math\.random|require\(/.test(srcB) && (srcB.match(/^import .*$/mg) || []).length === 1, (srcB.match(/^import .*$/mg) || []));
  // MISSING: a package without the bank ledger (271): named, nothing guessed
  var PKG2 = clone({ code: PKG.code, tables: PKG.tables, skipped: PKG.skipped, unknown: PKG.unknown }); delete PKG2.tables[271]; var BM = BO.readOpen(PKG2, MODEL, { cutover: CUT });
  check('BC-READER', 'missing-table-named', 'a package without table 271 (Bank Account Ledger Entry) gives the PROBLEM table-missing naming it, and no sets (nothing guessed)', BM.manifest.problems.length === 1 && /^table-missing:.*271 Bank Account Ledger Entry/.test(BM.manifest.problems[0]) && BM.sets.tb.length === 0, BM.manifest.problems);
  verdict('BC-READER');

  // ═══ BC DATE: an earlier cut-over is date-exact (an invoice paid after it is still open at it; no frozen problem) ═══
  var OBE = oracleBc(EARLY), BE = BO.readOpen(PKG, MODEL, { cutover: EARLY }), CBE = mk(OBE), rem101 = (BE.sets.open_items.filter(function (r) { return r.documentno === 'SI-101'; })[0] || {}).open_amount;
  check('BC-DATE', 'oracle-equal', 'at ' + EARLY + ' the reader\'s TB, open items and banks equal the oracle at that date (SI-101 is open for 1000.00 then, 600.00 at ' + CUT + '; SI-105 does not exist yet)', CBE.tb(BE.sets).length + CBE.open(BE.sets).length + CBE.bank(BE.sets).length === 0 && Number(rem101) === 1000 && !BE.sets.open_items.some(function (r) { return r.documentno === 'SI-105'; }) && BEXP.sets.open_items.filter(function (r) { return r.documentno === 'SI-101'; })[0].open_amount === 600, { rem101: rem101 });
  check('BC-DATE', 'no-frozen-problem', 'no source-not-frozen problem (BC states what was open on that date); the G/L entries after it are counted (' + OBE.after.gl_entries + ') as information only', BE.manifest.problems.length === 0 && BE.manifest.after_cutover.gl_entries === OBE.after.gl_entries && OBE.after.gl_entries > 0, BE.manifest);
  verdict('BC-DATE');

  // ═══ SHEETS (both) ═══
  function sheetsCase(tag, CV, O, C, EXP, exp, sidePrefix) {
    var sheet = function (t) { var b = CV.book.filter(function (x) { return x.name.replace(/^\d\d/, '') === t; })[0]; if (!b) return []; var H = b.rows[0]; return b.rows.slice(1).map(function (r) { var o = {}; H.forEach(function (h, i) { o[h] = r[i]; }); return o; }); };
    var gl = sheet('I_GLJournal'), inv = sheet('I_Invoice'), stm = sheet('I_BankStatement'), glDr = gl.reduce(function (n, r) { return n + cents(r.AmtSourceDr); }, 0), glCr = gl.reduce(function (n, r) { return n + cents(r.AmtSourceCr); }, 0);
    var VARS = CV.TEMPLATE ? CV.TEMPLATE.variables : null, CLR = { AR: VARS.AR_CLEARING, AP: VARS.AP_CLEARING, BANK: VARS.BANK_CLEARING }, glBy = {}; gl.forEach(function (r) { glBy[r.AccountValue] = (glBy[r.AccountValue] || 0) + cents(r.AmtSourceDr) - cents(r.AmtSourceCr); });
    var plain = Object.keys(O.tb).filter(function (a) { return !O.cls[a] && O.tb[a] !== 0; });
    check(tag, 'journal-balanced', 'the opening journal balances (Dr == Cr) at ' + money(glDr), gl.length > 0 && glDr === glCr, { dr: glDr, cr: glCr });
    check(tag, 'journal-plain', 'every plain account is a journal line under its OWN value with the oracle balance (' + plain.length + ' accounts: inventory, capital, sales, purchases ...)', plain.every(function (a) { return glBy[a] === O.tb[a]; }), plain.filter(function (a) { return glBy[a] !== O.tb[a]; }));
    check(tag, 'journal-clearing', 'every AR / AP / BANK control account is routed to its ONE clearing account: the clearing line == the oracle class total (AR ' + money(O.clsTotal.AR) + ', AP ' + money(O.clsTotal.AP) + ', BANK ' + money(O.clsTotal.BANK) + ') and no control account value is in the journal (S1/B1)',
      glBy[CLR.AR] === O.clsTotal.AR && glBy[CLR.AP] === O.clsTotal.AP && glBy[CLR.BANK] === O.clsTotal.BANK && Object.keys(O.cls).every(function (a) { return !(a in glBy) || plain.indexOf(a) >= 0; }), glBy);
    var want = Object.keys(O.open).filter(function (n) { return O.open[n].brought; }).sort(), got = inv.map(function (r) { return r.DocumentNo; }).sort();
    var SG = { ARI: 1, ARC: -1, API: 1, APC: -1 };
    check(tag, 'invoices', 'the invoice sheet == the oracle\'s brought-in documents (' + want.length + '): number, kind, partner, own date, ONE charge line at |open|, no tax', J(got) === J(want) && inv.every(function (r) { var o = O.open[r.DocumentNo]; return o && cents(r.PriceActual) === o.amt && r.BPartnerValue === o.bp && r.DateInvoiced === o.date && r.QtyOrdered === '1' && r.ISO_Code === O.cur && r.TaxIndicator === VARS.TAX_NONE; }), { got: got, want: want });
    var rf = (CV.manifest.refused || []).filter(function (x) { return x.sheet === 'I_Invoice'; }), nb = Object.keys(O.open).filter(function (n) { return !O.open[n].brought; });
    check(tag, 'refusals-named', 'the ' + nb.length + ' documents NOT brought in (' + J(nb) + ') are NAMED refusals whose reason says the amount stays on the clearing account - none silently dropped (refused total ' + rf.reduce(function (n, x) { return n + x.n; }, 0) + ')', rf.reduce(function (n, x) { return n + x.n; }, 0) === nb.length && rf.every(function (x) { return /clearing/.test(x.why); }), rf);
    check(tag, 'left', 'manifest.left == the amount the SOURCE says stays on each clearing account (AR ' + money(O.left.AR) + ' = foreign + no address - on-account, AP ' + money(O.left.AP) + ', BANK ' + money(O.left.BANK) + ' = the EUR bank), computed from the documents and the stated on-account payment - not from the template',
      cents(CV.manifest.left.AR) === O.left.AR && cents(CV.manifest.left.AP) === O.left.AP && cents(CV.manifest.left.BANK) === O.left.BANK, { got: CV.manifest.left, want: O.left });
    var stmNos = Object.keys(O.bank).filter(function (a) { return O.bank[a] !== 0 && O.bankIso[a] === O.cur; }).sort();
    check(tag, 'statements', 'one opening bank statement per LOCAL-currency bank account with a balance (' + J(stmNos) + '), amount == the oracle; the EUR account has none (S7/B6)', J(stm.map(function (r) { return r.BankAccountNo; }).sort()) === J(stmNos) && stm.every(function (r) { return cents(r.StmtAmt) === O.bank[r.BankAccountNo]; }), stm);
    check(tag, 'no-vendor-words', 'the sheets carry no iDempiere / Odoo wording: the description fields name ' + sidePrefix, inv.concat(stm).every(function (r) { return !/iDempiere|Odoo/.test(J(r)); }), null);
    return { plain: plain, stmNos: stmNos, VARS: VARS, CLR: CLR };
  }
  var CVS = SC.convert(SEXP), CVB = BO.convert(PKG, MODEL, { cutover: CUT });
  var SHS = sheetsCase('SAP-SHEETS', Object.assign({ TEMPLATE: SC.TEMPLATE }, CVS), OS, CS, SEXP, SEXP, 'SAP Business One'), SHB = sheetsCase('BC-SHEETS', Object.assign({ TEMPLATE: BO.TEMPLATE }, CVB), OBC, CB, BEXP, BEXP, 'Business Central');
  verdict('SAP-SHEETS'); verdict('BC-SHEETS');

  // ═══ UNTOUCHED / MODEL ═══
  var diffFiles = ['migrate/templates/odoo-17.json', 'migrate/templates/sap-b1-10.json', 'migrate/templates/bc-w1.json', 'migrate/templates/idempiere-identity.json', 'plugins/sap_migrate_convert.mjs', 'plugins/bc_migrate_convert.mjs', 'plugins/odoo_migrate_convert.mjs', 'plugins/open_balances.mjs', 'migrate/engine.mjs', 'migrate/workbook.mjs', 'idempiere_agent', 'odoo_agent'];
  var gd = cp.spawnSync('git', ['-C', ERP, 'diff', '--quiet', 'origin/main', '--'].concat(diffFiles), { encoding: 'utf8' });
  check('UNTOUCHED', 'other-sources', 'the Odoo / iDempiere files, the SAP + BC masters templates and converters (so the masked alpha reports), the engine, the workbook contract and the loader are byte-identical to origin/main (' + diffFiles.length + ' paths)', gd.status === 0, gd.stderr || 'diff exit ' + gd.status);
  var AGS = fs.readFileSync(path.join(ERP, 'sap_agent', 'agent.js'), 'utf8');
  check('UNTOUCHED', 'agent-masters-path', 'sap_agent/agent.js: the masters path is unchanged - SETS and run() are as before (9 sets), the open reading is only reached through the new --cutover flag', Object.keys(require(path.join(ERP, 'sap_agent', 'agent.js')).SETS).length === 9 && /if \(f\.cutover\)/.test(AGS) && !/open_reader/.test(AGS.split('if (require.main')[0] || ''), null);
  var old = JSON.parse(cp.execFileSync('git', ['-C', ERP, 'show', '7b1ed3a5:erp/plugins/bc_model.mjs'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('export default ')[1].replace(/;\s*$/, ''));
  check('MODEL', 'old-tables-unchanged', 'bc_model.mjs: the ' + Object.keys(old.tables).length + ' tables it had are byte-identical in the regenerated model (same commit ' + String(MODEL.commit).slice(0, 8) + '); ' + (Object.keys(MODEL.tables).length - Object.keys(old.tables).length) + ' ledger tables added (the BCM witness re-checks every added field against the .al)', old.commit === MODEL.commit && Object.keys(old.tables).every(function (id) { return J(old.tables[id]) === J(MODEL.tables[id]); }) && Object.keys(MODEL.tables).length > Object.keys(old.tables).length, null);
  verdict('UNTOUCHED'); verdict('MODEL');

  // ═══ the twin (born tenants, the neutral loader) - once per ERP ═══
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'ImportBankStatement.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§SBO-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: LCY, currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: CUT, countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: CUT + ' 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:sapbc-open' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');   // binds the process engine the shared loader runs through
  var FORM = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_form.mjs')).href); FORM.bindProcess(AP);
  var regd = {};
  function formFor(cls, plan) {   // a test-side form over the SAME shared pieces the shipped forms use (convert -> OB.openOf/problems -> FORM.load -> OB.complete): no mapping, no verifier of its own
    if (regd[cls]) return; regd[cls] = 1;
    AF.register(cls, { title: 'Test: migrate open balances', params: [{ name: 'Files', label: 'open balances', type: 'file', multiple: true, mandatory: true }], columns: [{ key: 'item', label: 'Item' }], rows: function () { return []; },
      run: function (trx, params) { var p = plan(trx, params); if (p.problems.length) throw new Error('Not migrated: ' + p.problems.join(' ')); var r = FORM.load(trx, p.cv.book, p.open); if (!r.ok) throw new Error(String(r.summary || 'The load was refused.') + ' ' + J(r.refusals).slice(0, 400)); return 'loaded ' + J(r.perTable); },
      after: function (trx, params) { var p = plan(trx, params); return OB.complete(trx, AP, p.open); } });
  }
  function session(S, loginDate, cls) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); };
    return { execute: function (params) { var r = AF.execute(withT, cls, params, []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'sapbc_open' }); return r; },
      after: function (params) { var r = AF.executeAfter(withT, cls, params, []); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'sapbc_open' }); return r; } };
  }
  function twin(C, O, CLR) {
    var books = {}; q('SELECT ev.value AS v, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.value', [C]).forEach(function (r) { books[r.v] = cents(r.dr) - cents(r.cr); });
    var ctl = { AR: 0, AP: 0 }, clr = [CLR.AR, CLR.AP, CLR.BANK];
    q('SELECT ev.value AS v, dt.docbasetype AS b, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id JOIN c_invoice i ON i.c_invoice_id=f.record_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE f.ad_client_id=? AND f.ad_table_id=318 GROUP BY ev.value, dt.docbasetype', [C])
      .forEach(function (r) { if (clr.indexOf(r.v) >= 0 || (O.tb[r.v] !== undefined && !O.cls[r.v])) return; ctl[r.b[1] === 'R' ? 'AR' : 'AP'] += cents(r.dr) - cents(r.cr); });
    var invs = q('SELECT i.documentno AS no, i.docstatus AS s, i.posted AS p, i.ispaid AS paid, i.grandtotal AS total, substr(i.dateinvoiced,1,10) AS d, bp.value AS bp, dt.docbasetype AS b FROM c_invoice i JOIN c_bpartner bp ON bp.c_bpartner_id=i.c_bpartner_id JOIN c_doctype dt ON dt.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=?', [C]);
    var bAcc = q('SELECT ba.accountno AS no, ba.currentbalance AS cb FROM c_bankaccount ba WHERE ba.ad_client_id=? ORDER BY ba.accountno', [C]);
    var asset = (q('SELECT ev.value AS v FROM c_acctschema_default d JOIN c_validcombination vc ON vc.c_validcombination_id=d.b_asset_acct JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id WHERE d.ad_client_id=?', [C])[0] || {}).v;
    return { books: books, ctl: ctl, invs: invs, bAcc: bAcc, asset: asset, total: Object.keys(books).reduce(function (s, a) { return s + books[a]; }, 0) };
  }
  // the SAME comparators judge the real load and the mutants: a list of differences, empty = the twin is the source
  function cmpTwin(C, O, SH) {
    var t = twin(C, O, SH.CLR), d = [], SGN = { ARI: 1, ARC: -1, API: -1, APC: 1 }, CLR = SH.CLR, L = O.left;
    SH.plain.forEach(function (a) { if (t.books[a] !== O.tb[a]) d.push('TB plain ' + a + ' twin ' + money(t.books[a] || 0) + ' source ' + money(O.tb[a])); });
    ['AR', 'AP'].forEach(function (s) { var clr = t.books[CLR[s]] || 0; if (clr !== L[s]) d.push('CLEAR ' + s + ' ' + CLR[s] + ' is ' + money(clr) + ' source says ' + money(L[s])); if (t.ctl[s] + clr !== O.clsTotal[s]) d.push('TB ' + s + ' control ' + money(t.ctl[s]) + ' + clearing ' + money(clr) + ' != source class total ' + money(O.clsTotal[s])); });
    var bc = t.books[CLR.BANK] || 0, bank = t.books[t.asset] || 0; if (bc !== L.BANK) d.push('CLEAR BANK is ' + money(bc) + ' source says ' + money(L.BANK)); if (bank + bc !== O.clsTotal.BANK) d.push('TB BANK asset ' + money(bank) + ' + clearing ' + money(bc) + ' != source ' + money(O.clsTotal.BANK));
    if (t.total !== 0) d.push('books do not sum to zero: ' + money(t.total));
    var got = {}, want = {}; t.invs.forEach(function (i) { var k2 = (i.b[1] === 'R' ? 'AR' : 'AP') + '|' + i.bp; got[k2] = (got[k2] || 0) + cents(i.total) * SGN[i.b]; });
    Object.keys(O.open).forEach(function (no) { var o = O.open[no]; if (!o.brought) return; var k2 = (o.base[1] === 'R' ? 'AR' : 'AP') + '|' + o.bp; want[k2] = (want[k2] || 0) + o.amt * SGN[o.base]; });
    cmpKeys(got, want).forEach(function (p) { if ((got[p] || 0) !== (want[p] || 0)) d.push('OPEN ' + p + ' twin ' + money(got[p] || 0) + ' source ' + money(want[p] || 0)); });
    t.invs.forEach(function (i) { var o = O.open[i.no]; if (!o || !o.brought || o.base !== i.b || o.bp !== i.bp || o.date !== i.d || i.s !== 'CO' || i.p !== 'Y' || i.paid === 'Y') d.push('DOC ' + i.no + ' ' + i.s + '/' + i.p + '/' + i.paid); });
    SH.stmNos.forEach(function (no) { var a = t.bAcc.filter(function (x) { return x.no === no; })[0]; if (!a || cents(a.cb) !== O.bank[no]) d.push('BANK ' + no + ' twin ' + (a ? money(cents(a.cb)) : 'absent') + ' source ' + money(O.bank[no])); });
    return d;
  }
  function loadInto(name, cls, files, params) {
    var T = birth(name), ses = session(T, '2026-11-11', cls), mark = SHIPPED.length, r1 = ses.execute(files), r2 = r1.ok ? ses.after(files) : { ok: false, msg: 'stage 1 refused: ' + r1.msg };
    return { C: T.clientId, r1: r1, r2: r2, ship: SHIPPED.slice(mark).filter(function (l) { return /^§(MIG-|PROC-UNPORTED|PROC-SQL)/.test(l); }) };
  }
  var ES = clone(SEXP);
  formFor('org.test.SapOpen', function (trx, params) { var cv = SC.convert(params.Files[0].data), open = OB.openOf(cv.book, cv.manifest); return { cv: cv, open: open, problems: cv.manifest.problems.concat(OB.problems(trx, open)) }; });
  formFor('org.test.BcOpen', function (trx, params) { var cv = BO.convert(params.Files[0].data, MODEL, { cutover: CUT }); var open = OB.openOf(cv.book, cv.manifest); return { cv: cv, open: open, problems: cv.manifest.problems.concat(OB.problems(trx, open)) }; });
  var sapFiles = function (exp) { return { Files: [{ name: 'sap_open.json', size: 1, data: exp }] }; }, bcFiles = function (pkg) { return { Files: [{ name: 'package.xlsx', size: 1, data: pkg }] }; };

  function loadCase(tag, who, cls, files, O, SH) {
    var L = loadInto(who + ' Open Co', cls, files), ver = L.ship.filter(function (l) { return /^§MIG-VERIFY/.test(l); }).pop() || '';
    say('§SBO-LOAD ' + tag + ' client=' + L.C + ' stage1=' + L.r1.ok + ' stage2=' + L.r2.ok + ' msg=' + String(L.r2.msg).slice(0, 300)); L.ship.forEach(function (l) { say('  shipped> ' + l.slice(0, 330)); });
    check(tag, 'stages', 'stage 1 (masters + import rows + prerequisites) and stage 2 (Import GL Journal 220 -> Complete, Import Invoice 207 CO, Import Bank Statement 221 -> Complete, verifier) end without a refusal', L.r1.ok && L.r2.ok && /Open balances completed/.test(String(L.r2.msg)), { r1: L.r1.msg, r2: L.r2.msg });
    check(tag, 'shipped-verifier', 'the loader\'s own verifier printed §MIG-VERIFY verdict=PASS with > 0 checks judged', /verdict=PASS judged=[1-9]/.test(ver), ver);
    var dif = L.r2.ok ? cmpTwin(L.C, O, SH) : ['load did not complete'];
    check(tag, 'books-are-the-source', 'the twin\'s own tables vs the oracle: plain accounts exact (' + SH.plain.length + '), AR / AP / BANK control + clearing == the source class total, each clearing == the leftover the source implies (AR ' + money(O.left.AR) + ', AP ' + money(O.left.AP) + ', BANK ' + money(O.left.BANK) + '), open amount per partner, every brought document CO/posted/unpaid with its number and own date, bank balance per account', dif.length === 0, dif);
    var t0 = L.r2.ok ? twin(L.C, O, SH.CLR) : { books: {} };
    check(tag, 'clearing-values', 'AR Clearing holds exactly ' + money(O.left.AR) + ' (read from the twin\'s Fact_Acct), AP Clearing 0.00, Bank Clearing ' + money(O.left.BANK) + ' (the foreign bank)', (t0.books[SH.CLR.AR] || 0) === O.left.AR && t0.books[SH.CLR.AP] === 0 && (t0.books[SH.CLR.BANK] || 0) === O.left.BANK, { ar: t0.books[SH.CLR.AR], ap: t0.books[SH.CLR.AP], bank: t0.books[SH.CLR.BANK] });
    return L;
  }
  loadCase('SAP-LOAD', 'SAP', 'org.test.SapOpen', sapFiles(SEXP), OS, SHS); verdict('SAP-LOAD');
  loadCase('BC-LOAD', 'BC', 'org.test.BcOpen', bcFiles(PKG), OBC, SHB); verdict('BC-LOAD');

  // ═══ MUTANTS: each must make a comparator FAIL (a witness that cannot fail is no witness) ═══
  function mutants(tag, C, O, SH, EXP, mkFiles, cls, mutateSets) {
    var m1 = clone(EXP), pa = m1.sets.tb.filter(function (r) { return !r.class && cents(r.balance) !== 0; })[0]; pa.balance = Number(pa.balance) + 10;
    var d1 = C.tb(m1.sets); check(tag, 'flip-tb-amount', 'a trial-balance amount flipped by 10.00 on ' + pa.code + ' is caught by the reader comparator, naming that account', d1.length === 1 && d1[0].indexOf(pa.code) === 0, d1);
    var m2 = clone(EXP), oi = m2.sets.open_items.filter(function (r) { return r.iso === O.cur && r.base; })[0]; oi.open_amount = Number(oi.open_amount) + (cents(oi.open_amount) < 0 ? -7 : 7);
    var d2 = C.open(m2.sets); check(tag, 'flip-open-amount', 'an open amount flipped by 7.00 on ' + oi.documentno + ' is caught by the open-item comparator', d2.length === 1 && d2[0].indexOf(oi.documentno) === 0, d2);
    var m3 = clone(EXP), dropped = m3.sets.open_items.filter(function (r) { return r.iso === O.cur && r.base && O.open[r.documentno] && O.open[r.documentno].brought; })[0]; m3.sets.open_items = m3.sets.open_items.filter(function (r) { return r !== dropped; });
    var d3 = C.open(m3.sets); check(tag, 'drop-open-item', 'a dropped open item (' + dropped.documentno + ') is caught by the open-item comparator', d3.length === 1 && d3[0].indexOf(dropped.documentno) === 0 && /absent/.test(d3[0]), d3);
    var m4 = clone(EXP), da = m4.sets.tb.filter(function (r) { return !r.class && cents(r.balance) !== 0; })[1]; m4.sets.tb = m4.sets.tb.filter(function (r) { return r !== da; });
    var d4 = C.tb(m4.sets); check(tag, 'drop-tb-account', 'a dropped trial-balance account (' + da.code + ') is caught by the reader comparator', d4.length === 1 && d4[0].indexOf(da.code) === 0, d4);
    var m5 = clone(EXP), ca = m5.sets.tb.filter(function (r) { return r.class === 'AR'; })[0]; ca.class = '';
    var d5 = C.cls(m5.sets); check(tag, 'wrong-class', 'a control account read as plain (' + ca.code + ') is caught by the class comparator', d5.length === 1 && d5[0].indexOf(ca.code) === 0, d5);
    // through a REAL load: the loader checks the sheets against themselves, so a dropped / flipped item passes the loader and MUST be caught by the oracle comparator on the twin's tables
    var L6 = loadInto(tag + ' Mutant Drop Co', cls, mkFiles(m3)), dd6 = L6.r2.ok ? cmpTwin(L6.C, O, SH) : ['(load refused) ' + L6.r2.msg];
    say('§SBO-MUTANT ' + tag + ' drop-open-item-load stage2=' + L6.r2.ok + ' oracle_differences=' + J(dd6).slice(0, 420));
    check(tag, 'drop-item-through-load', 'with ' + dropped.documentno + ' removed from the file the loader (self-consistent) completes, but the twin\'s books differ from the oracle: clearing and OPEN per partner FAIL', dd6.length > 0 && dd6.some(function (x) { return /^CLEAR|^OPEN|^TB/.test(x); }), dd6);
    var L7 = loadInto(tag + ' Mutant Flip Co', cls, mkFiles(m2)), dd7 = L7.r2.ok ? cmpTwin(L7.C, O, SH) : ['(load refused) ' + L7.r2.msg];
    say('§SBO-MUTANT ' + tag + ' flip-open-amount-load stage2=' + L7.r2.ok + ' oracle_differences=' + J(dd7).slice(0, 420));
    check(tag, 'flip-amount-through-load', 'with ' + oi.documentno + ' flipped by 7.00 the loader completes, but the twin\'s open amount / clearing differ from the oracle', dd7.length > 0 && dd7.some(function (x) { return /^OPEN|^CLEAR/.test(x); }), dd7);
  }
  mutants('SAP-MUTANT', CS, OS, SHS, SEXP, sapFiles, 'org.test.SapOpen');
  formFor('org.test.BcOpenSets', function (trx, params) { var cv = BO.fromOpen(params.Files[0].data), open = OB.openOf(cv.book, cv.manifest); return { cv: cv, open: open, problems: cv.manifest.problems.concat(OB.problems(trx, open)) }; });
  mutants('BC-MUTANT', CB, OBC, SHB, BEXP, sapFiles, 'org.test.BcOpenSets');   // the mutated NEUTRAL sets go through the BC template (a package cannot be flipped cell by cell without re-writing it)
  verdict('SAP-MUTANT'); verdict('BC-MUTANT');

  say('§SBO-COVERAGE witnessed: credit note, partly paid, foreign invoice, no address, on-account payment, cancelled invoice (SAP), fully paid, foreign bank, earlier cut-over (frozen SAP / date-exact BC), missing field, missing table. NOT witnessed: documents numbered alike across kinds (docno-reused note), bank-gl-shared, control-account-unknown, unknown-account, an unposted document (TransNum empty), a wrong-signed open amount, Currency-Code spelling (S13), and every UNCLEAR row of §SAP-BC-OPEN-SPEC');
  say('§SBO-CONN verdict=INCONCLUSIVE - no live SAP Business One and no live Business Central here: the oracle is test-supplied rows in the vendors\' field names. A tester\'s run on a real company closes this; nothing here claims real-company validation.');
  var vs = Object.keys(CASES).map(function (c) { return c + '=' + (CASES[c].failed ? 'FAIL' : 'PASS'); }).join(' ');
  var final = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§SBO-VERDICT ' + final + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' (' + vs + ') (CONN INCONCLUSIVE by construction)');
  process.exit(final === 'FAIL' ? 1 : 0);
})().catch(function (e) { say('§SBO-ERROR ' + (e && e.stack || e)); say('§SBO-VERDICT FAIL judged=' + ALL.judged + ' failed=' + (ALL.failed + 1)); process.exit(1); });
