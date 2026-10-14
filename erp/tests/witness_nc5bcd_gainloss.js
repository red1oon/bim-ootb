#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-NC5BCD-GAINLOSS (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-5bcd; CARDINAL RULE: a foreign-currency receipt books exactly what legacy books).
//   READ THE LOG after every run: every verdict is a §NC5BCD line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: Doc_AllocationHdr.createInvoiceGainLoss (:893-1030) and createPaymentGainLoss (:1044-1135) — when a EUR invoice (rate R1 on its date) is settled by a
//   receipt whose rate R2 differs, legacy books the difference to C_AcctSchema_Default RealizedGain/Loss_Acct and re-adjusts the receivable. doc_poster.deriveAllocation had no such branch
//   (named "absent" in its header). Legacy facts = scripts/bridge/nc5bcd_legacy.js -> out/nc5bcd_legacy.json (V1 gain, V2 loss, V3 control, V5 USD receipt for a EUR invoice, 4 variants x 2 schemas
//   x invoice/payment/allocation). Each document is folded by the SHIPPED doc_poster over a scratch posting db built from the variant and compared per (schema, account, DR, CR) in cents.
//   INCONCLUSIVE when the legacy file is missing or a variant has no allocation facts. Negative control: the V3 control (R1 == R2) must book NO gain/loss account while V1 must.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var DP = require(path.join(ERP, 'doc_poster.js'));
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var LEG = process.env.NC5BCD_LEGACY || path.join('/home/red1/bim-compiler/scripts/bridge/out/nc5bcd_legacy.json');
var log = function (s) { console.log(s); }, fails = 0, judgedTotal = 0;
var EUR = 102, USD = 100;
// account ids as legacy printed them (same on both schemas); gain 767 / loss 723; valid-combination ids -> element for the C_AcctSchema_Default / _GL columns
var EL = { 518: 'Receivable', 511: 'UnallocatedCash', 509: 'InTransit', 758: 'Revenue', 767: 'RealizedGain', 723: 'RealizedLoss', 999221: 'CurrencyBalancing' };
var VC = { 245: 767, 246: 723, 200027: 767, 200028: 723, 221: 999221, 200020: 999221 };
var TOK = { '{BPartner.Receivable}': 518, '{Bank.UnallocatedCash}': 511, '{Bank.InTransit}': 509, '{Product.Revenue}': 758 };
var R = { resolve: function (d, token) { var id = TOK[token]; return id ? { acct: id, element: { id: id, value: String(id), name: EL[id] } } : { acct: null, element: null, token: token }; },
  elementOf: function (d, vc) { var id = VC[vc]; return id ? { id: id, value: String(id), name: EL[id] } : null; } };
function mkdb(SQL) {
  var sdb = new SQL.Database();
  function bind(st, p) { if (p == null) return; st.bind(Array.isArray(p) ? p : [p]); }
  return { raw: sdb, prepare: function (sql) { return {
    get: function (p) { var s = sdb.prepare(sql); try { bind(s, p); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
    all: function (p) { var s = sdb.prepare(sql), r = []; try { bind(s, p); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } },
    run: function (p) { var s = sdb.prepare(sql); try { bind(s, p); s.step(); } finally { s.free(); } } }; }, exec: function (q) { sdb.run(q); } };
}
function build(SQL, v, D1, D2) {
  var db = mkdb(SQL), day = function (n) { var d = new Date(D2 + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  db.exec("CREATE TABLE c_currency(c_currency_id INTEGER, stdprecision INTEGER);INSERT INTO c_currency VALUES(100,2),(102,2);" +
    "CREATE TABLE c_conversiontype(c_conversiontype_id INTEGER, isdefault TEXT);INSERT INTO c_conversiontype VALUES(114,'Y');" +
    "CREATE TABLE c_conversion_rate(c_conversion_rate_id INTEGER, c_currency_id INTEGER, c_currency_id_to INTEGER, c_conversiontype_id INTEGER, multiplyrate NUMERIC, validfrom TEXT, validto TEXT, ad_client_id INTEGER, ad_org_id INTEGER, isactive TEXT);" +
    "CREATE TABLE c_acctschema(c_acctschema_id INTEGER, c_currency_id INTEGER, taxcorrectiontype TEXT, ispostifclearingequal TEXT, isaccrual TEXT, stdprecision INTEGER);INSERT INTO c_acctschema VALUES(101,100,'N','Y','Y',2),(200000,102,'N','Y','Y',2);" +
    "CREATE TABLE c_acctschema_default(c_acctschema_id INTEGER, realizedgain_acct INTEGER, realizedloss_acct INTEGER);INSERT INTO c_acctschema_default VALUES(101,245,246),(200000,200027,200028);" +
    "CREATE TABLE c_acctschema_gl(c_acctschema_id INTEGER, usecurrencybalancing TEXT, currencybalancing_acct INTEGER);INSERT INTO c_acctschema_gl VALUES(101,'Y',221),(200000,'Y',200020);" +
    "CREATE TABLE c_invoice(c_invoice_id INTEGER, c_bpartner_id INTEGER, grandtotal NUMERIC, issotrx TEXT, c_currency_id INTEGER, dateacct TEXT, c_conversiontype_id INTEGER, ad_client_id INTEGER, ad_org_id INTEGER);" +
    "CREATE TABLE c_invoiceline(c_invoiceline_id INTEGER, c_invoice_id INTEGER, m_product_id INTEGER, linenetamt NUMERIC);CREATE TABLE c_invoicetax(c_invoice_id INTEGER, c_tax_id INTEGER, taxamt NUMERIC);" +
    "CREATE TABLE c_payment(c_payment_id INTEGER, c_bankaccount_id INTEGER, isreceipt TEXT, payamt NUMERIC, tendertype TEXT, c_currency_id INTEGER, dateacct TEXT, c_conversiontype_id INTEGER, ad_client_id INTEGER, ad_org_id INTEGER);" +
    "CREATE TABLE c_allocationhdr(c_allocationhdr_id INTEGER, c_currency_id INTEGER, dateacct TEXT, c_conversiontype_id INTEGER, ad_client_id INTEGER, ad_org_id INTEGER);" +
    "CREATE TABLE c_allocationline(c_allocationline_id INTEGER, c_allocationhdr_id INTEGER, c_invoice_id INTEGER, c_payment_id INTEGER, c_cashline_id INTEGER, c_bpartner_id INTEGER, amount NUMERIC, discountamt NUMERIC, writeoffamt NUMERIC);");
  [[EUR, USD, v.m1, day(-9), day(-1)], [USD, EUR, 1 / v.m1, day(-9), day(-1)], [EUR, USD, v.m2, day(0), day(9)], [USD, EUR, 1 / v.m2, day(0), day(9)]].forEach(function (r, i) {
    db.prepare("INSERT INTO c_conversion_rate VALUES(?,?,?,114,?,?,?,11,0,'Y')").run([i + 1, r[0], r[1], r[2], r[3], r[4]]); });
  var inv = v.invHdr.grand;
  db.prepare("INSERT INTO c_invoice VALUES(1,112,?,'Y',?,?,114,11,12)").run([inv, EUR, D1 + ' 00:00:00']);
  db.prepare("INSERT INTO c_invoiceline VALUES(1,1,137,?)").run([inv]);
  db.prepare("INSERT INTO c_payment VALUES(1,100,'Y',?,'X',?,?,114,11,12)").run([v.payHdr.amt, v.payCur, D2 + ' 00:00:00']);
  db.prepare("INSERT INTO c_allocationhdr VALUES(1,?,?,114,11,12)").run([v.payCur, D2 + ' 00:00:00']);
  db.prepare("INSERT INTO c_allocationline VALUES(1,1,1,1,NULL,112,?,0,0)").run([v.allocLines[0].amount]);
  return db;
}
function agg(rows) { var m = {}; rows.forEach(function (r) { var k = r.schema + ':' + r.account, x = m[k] || (m[k] = { dr: 0, cr: 0 }); x.dr += Math.round(r.acctDr * 100); x.cr += Math.round(r.acctCr * 100); }); return m; }
function fold(db, table, id, schema) {
  var d = DP.derivePostings(db, { table: table, id: id }, schema, R), rows = (d.lines || []).map(function (l) { return { schema: schema, account: l.account_id, acctDr: Number(l.amtacctdr || 0), acctCr: Number(l.amtacctcr || 0) }; });
  return { m: agg(rows), absent: d.absent || [] };
}
function fmt(m) { return Object.keys(m).sort().map(function (k) { return k + ' DR' + m[k].dr + ' CR' + m[k].cr; }).join(' | ') || 'none'; }
(async function () {
  if (!fs.existsSync(LEG)) { log('§NC5BCD-VERDICT INCONCLUSIVE reason="legacy file missing: ' + LEG + ' (run scripts/bridge/nc5bcd_legacy.js)"'); process.exit(3); }
  var L = JSON.parse(fs.readFileSync(LEG, 'utf8')), SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var gainLossSeen = {};
  L.variants.forEach(function (v) {
    if (!v.allocFacts || !v.allocFacts.length) { log('§NC5BCD case=' + v.k + ' INCONCLUSIVE (no legacy allocation facts: inv=' + (v.invError || '') + ' pay=' + (v.payError || '') + ')'); return; }
    var db = build(SQL, v, L.D1, L.D2), cks = [];
    [101, 200000].forEach(function (sc) {
      [['C_Invoice', 1, 'invFacts'], ['C_Payment', 1, 'payFacts'], ['C_AllocationHdr', 1, 'allocFacts']].forEach(function (t) {
        var want = agg(v[t[2]].filter(function (f) { return f.schema === sc; })), got = fold(db, t[0], t[1], sc);
        var ok = JSON.stringify(want) === JSON.stringify(got.m && Object.keys(got.m).sort().reduce(function (o, k) { o[k] = got.m[k]; return o; }, {}))
          || fmt(want) === fmt(got.m);
        judgedTotal++; if (!ok) fails++;
        log('  §NC5BCD-CHECK case=' + v.k + ' schema=' + sc + ' doc=' + t[0] + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : '\n      want: ' + fmt(want) + '\n      got:  ' + fmt(got.m) + (got.absent.length ? '\n      absent: ' + got.absent.join('; ') : '')));
        if (t[0] === 'C_AllocationHdr') gainLossSeen[v.k + ':' + sc] = [767, 723].some(function (a) { return got.m[sc + ':' + a]; });
      });
    });
  });
  // negative control: the control variant books no gain/loss on the allocation, the gain variant does (otherwise the comparison above could pass on an empty fold)
  var neg = gainLossSeen['V3same:101'] === false && gainLossSeen['V3same:200000'] === false;
  log('§NC5BCD-NEG-CONTROL V3same twin books no RGL=' + neg + ' ; legacy V1gain has an RGL line=' + L.variants.some(function (v) { return v.k === 'V1gain' && v.allocFacts.some(function (f) { return f.account === 767; }); }));
  var verdict = !judgedTotal ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§NC5BCD-VERDICT ' + verdict + ' judged=' + judgedTotal + ' failed=' + fails);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§NC5BCD-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
