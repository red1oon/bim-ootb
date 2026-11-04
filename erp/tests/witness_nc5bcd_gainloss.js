#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC5BCD-GAINLOSS (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-5bcd + prompts/SQLiteIDEMPIERE.md §POSTING-PARITY 5b; CARDINAL RULE: a foreign-currency
//   receipt books exactly what legacy books). READ THE LOG after every run: every verdict is a §NC5BCD line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: Doc_AllocationHdr.createInvoiceGainLoss (:892-1030) and createPaymentGainLoss (:1045-1135) — when a EUR invoice (rate R1 on its date) is settled
//   by a receipt whose rate R2 differs, legacy books the difference to C_AcctSchema_Default RealizedGain/Loss_Acct and re-adjusts the receivable. The REAL poster (model_post) refused
//   these allocations ("not ported - named"), so they stayed Posted=N in the app. (Until §POSTING-PARITY 5b this witness judged the retired doc_poster fold on a scratch schema.)
//   Legacy facts = bim-compiler scripts/bridge/nc5bcd_legacy.js -> out/nc5bcd_legacy.json (V1 gain, V2 loss, V3 control, V5 USD receipt for a EUR invoice; 2 schemas).
//   Per variant, on the shipped seed (+ patch), through the shipped model layer: the invoice, the receipt and the allocation are built as the pilot had them, each POSTED by the real
//   poster (ML.getPoster) and committed in order (the allocation reads the invoice/payment facts), then compared per (schema, account, DR, CR) in cents to legacy.
//   NEG-CONTROL: V3 (R1 == R2) books no RealizedGain/Loss account while V1 / V2 / V5 do. MUTANT: LMV_BREAK=nogainloss (the new lines dropped) must FAIL. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_nc5bcd_gainloss.js   (node + sql.js)
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var LEG = process.env.NC5BCD_LEGACY || '/home/red1/bim-compiler/scripts/bridge/out/nc5bcd_legacy.json';
var log = function (s) { console.log(s); }, fails = 0, judgedTotal = 0, cents = function (v) { return Math.round(Number(v || 0) * 100); };
var EUR = 102, USD = 100, BP = 112, BPL = 108, PROD = 137, TAX0 = 109, DT_ARI = 116, DT_ARR = 119, DT_CMA = 137, BANK = 100, ORG = 11;

function agg(rows) { var m = {}; rows.forEach(function (r) { var k = r.schema + ':' + r.account, x = m[k] || (m[k] = { dr: 0, cr: 0 }); x.dr += cents(r.dr); x.cr += cents(r.cr); }); return m; }
function fmt(m) { return Object.keys(m).sort().map(function (k) { return k + ' DR' + m[k].dr + ' CR' + m[k].cr; }).join(' | ') || 'none'; }

(async function () {
  if (!fs.existsSync(LEG)) { log('§NC5BCD-VERDICT INCONCLUSIVE reason="legacy file missing: ' + LEG + ' (run scripts/bridge/nc5bcd_legacy.js)"'); process.exit(3); }
  var L = JSON.parse(fs.readFileSync(LEG, 'utf8')), SQL = await initSqlJs();
  var SEED = new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))), PATCH = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8');
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var poster = ML.getPoster();
  var gainLossSeen = {};
  L.variants.forEach(function (v) {
    if (!v.allocFacts || !v.allocFacts.length) { log('§NC5BCD case=' + v.k + ' INCONCLUSIVE (no legacy allocation facts)'); return; }
    var db = new SQL.Database(SEED); PATCH.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) { } });
    A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
    function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (x) { return x === undefined ? null : x; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
    var cols = {}, colsOf = function (t) { return cols[t] || (cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); })); }, nid = {};
    function newId(t) { if (nid[t] == null) nid[t] = Math.max(Number((q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0] || {}).m || 0), 9000000); return ++nid[t]; }
    function ins(t, f) { var cs = colsOf(t); f = Object.assign({}, f); if (cs.indexOf(t + '_id') >= 0 && f[t + '_id'] == null) f[t + '_id'] = newId(t); var ks = Object.keys(f).filter(function (k) { return cs.indexOf(k) >= 0; });
      db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; })); return f[t + '_id']; }
    function commit(ops) { ops.forEach(function (o) { var t = o.table, cs = colsOf(t); if (!cs.length) return;
      if (o.op_type === 'CRUD_CREATE') { var f = Object.assign({}, o.fields); if (cs.indexOf(t + '_id') >= 0 && (f[t + '_id'] == null || ML.isNewId(f[t + '_id']))) f[t + '_id'] = newId(t); ins(t, f); }
      else if (o.op_type === 'CRUD_UPDATE') { var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; }); if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return o.changes[k].new; }).concat([o.id])); }
      else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [o.id]); }); }
    var uu = 0, env = function () { return { client: 11, org: ORG, user: 100, role: 102, date: L.D2 + ' 00:00:00', now: L.D2 + ' 09:00:00', nowMillis: Date.parse(L.D2 + 'T09:00:00Z'), uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; };
    function post(table, id) { var trx = new ML.Trx(q, env()), say = []; trx.say = function (l) { say.push(String(l)); }; var exc = null, res;
      try { res = poster(trx, table, trx.get(table, id), { repost: true }); } catch (e) { exc = String(e).slice(0, 200); }
      var ops = JSON.parse(JSON.stringify(trx.groupOps())), facts = ops.filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { return o.fields; });
      if (res === true) commit(ops);
      log('    §NC5BCD-POST case=' + v.k + ' ' + table + '=' + id + ' res=' + res + ' facts=' + facts.length + (exc ? ' EXC=' + exc : '') + ' ' + say.filter(function (l) { return /§MODEL-POST/.test(l); }).join(' ; ').slice(0, 400));
      return facts; }
    // the pilot's state for this variant: EUR->USD at m1 before D2 (the invoice date D1), at m2 from D2 (both directions, like the legacy script)
    var day = function (n) { var d = new Date(L.D2 + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) + ' 00:00:00'; };
    [[EUR, USD, v.m1, day(-9), day(-1)], [USD, EUR, 1 / v.m1, day(-9), day(-1)], [EUR, USD, v.m2, day(0), day(9)], [USD, EUR, 1 / v.m2, day(0), day(9)]].forEach(function (r) {
      ins('c_conversion_rate', { ad_client_id: 11, ad_org_id: 0, isactive: 'Y', c_currency_id: r[0], c_currency_id_to: r[1], c_conversiontype_id: 114, multiplyrate: r[2], dividerate: 1 / r[2], validfrom: r[3], validto: r[4] }); });
    var D1 = L.D1 + ' 00:00:00', D2 = L.D2 + ' 00:00:00', grand = v.invHdr.grand;
    var inv = ins('c_invoice', { ad_client_id: 11, ad_org_id: ORG, issotrx: 'Y', documentno: 'NC5' + v.k, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: DT_ARI, c_doctypetarget_id: DT_ARI, c_bpartner_id: BP, c_bpartner_location_id: BPL,
      c_currency_id: EUR, c_conversiontype_id: 114, dateinvoiced: D1, dateacct: D1, grandtotal: grand, totallines: grand, ispaid: 'N', isapproved: 'Y', posted: 'N', paymentrule: 'P', istaxincluded: 'N', m_pricelist_id: 101, c_paymentterm_id: 105, description: 'NC5BCD ' + v.k });
    ins('c_invoiceline', { ad_client_id: 11, ad_org_id: ORG, c_invoice_id: inv, line: 10, m_product_id: PROD, c_uom_id: 100, qtyentered: 1, qtyinvoiced: 1, priceentered: grand, priceactual: grand, linenetamt: grand, c_tax_id: TAX0 });
    var pay = ins('c_payment', { ad_client_id: 11, ad_org_id: ORG, isreceipt: 'Y', documentno: 'NC5P' + v.k, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: DT_ARR, c_bankaccount_id: BANK, c_bpartner_id: BP,
      c_currency_id: v.payCur, c_conversiontype_id: 114, datetrx: D2, dateacct: D2, payamt: v.payHdr.amt, tendertype: 'X', isprepayment: 'N', isallocated: 'Y', posted: 'N', description: 'NC5BCD ' + v.k });
    var hdr = ins('c_allocationhdr', { ad_client_id: 11, ad_org_id: ORG, documentno: 'NC5A' + v.k, docstatus: 'CO', docaction: 'CL', processed: 'Y', c_doctype_id: DT_CMA, c_currency_id: v.payCur, c_conversiontype_id: 114, datetrx: D2, dateacct: D2, posted: 'N', isapproved: 'Y' });
    var al = v.allocLines[0]; ins('c_allocationline', { ad_client_id: 11, ad_org_id: ORG, c_allocationhdr_id: hdr, c_invoice_id: inv, c_payment_id: pay, c_bpartner_id: BP, amount: al.amount, discountamt: al.discount || 0, writeoffamt: al.writeoff || 0, overunderamt: 0, datetrx: D2 });
    var got = { inv: post('c_invoice', inv), pay: post('c_payment', pay), alloc: post('c_allocationhdr', hdr) };
    [101, 200000].forEach(function (sc) {
      [['C_Invoice', 'inv', 'invFacts'], ['C_Payment', 'pay', 'payFacts'], ['C_AllocationHdr', 'alloc', 'allocFacts']].forEach(function (t) {
        var want = agg(v[t[2]].filter(function (f) { return f.schema === sc; }).map(function (f) { return { schema: sc, account: f.account, dr: f.acctDr, cr: f.acctCr }; }));
        var have = agg(got[t[1]].filter(function (f) { return Number(f.c_acctschema_id) === sc; }).map(function (f) { return { schema: sc, account: f.account_id, dr: f.amtacctdr, cr: f.amtacctcr }; }));
        var ok = fmt(want) === fmt(have) && fmt(want) !== 'none'; judgedTotal++; if (!ok) fails++;
        log('  §NC5BCD-CHECK case=' + v.k + ' schema=' + sc + ' doc=' + t[0] + ' ' + (ok ? 'OK' : 'FAIL') + '  legacy: ' + fmt(want) + (ok ? '' : '\n      twin:   ' + fmt(have)));
        if (t[0] === 'C_AllocationHdr') gainLossSeen[v.k + ':' + sc] = Object.keys(have).some(function (k) { return /:(767|723)$/.test(k); });
      });
    });
    var gl = got.alloc.filter(function (f) { return /^(767|723)$/.test(String(f.account_id)); });
    gl.forEach(function (f) { var lg = v.allocFacts.filter(function (x) { return x.schema === Number(f.c_acctschema_id) && x.account === Number(f.account_id); })[0];
      log('  §NC5BCD-DESC case=' + v.k + ' schema=' + f.c_acctschema_id + ' acct=' + f.account_id + ' twin="' + f.description + '" legacy="' + (lg && lg.desc) + '"' + (lg && lg.desc === f.description ? ' EQUAL' : lg && lg.desc.replace(/Allocation=\((\d+)\)([\d.]+)\//, function (m, c, n) { return 'Allocation=(' + c + ')' + Number(n) + '/'; }) === f.description ? ' EQUAL-but-allocation-source-scale (SQLite REAL keeps no numeric scale: legacy 273.0 = twin 273)' : ' DIFF')); });
  });
  var neg = gainLossSeen['V3same:101'] === false && gainLossSeen['V3same:200000'] === false, pos = gainLossSeen['V1gain:101'] === true && gainLossSeen['V2loss:101'] === true && gainLossSeen['V5usdPay:200000'] === true;
  log('§NC5BCD-NEG-CONTROL V3same twin books no RGL=' + neg + ' ; V1/V2 (schema 101) + V5 (schema 200000) twin book an RGL line=' + pos);
  if (!neg || !pos) fails++;
  var verdict = !judgedTotal ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§NC5BCD-VERDICT ' + verdict + ' judged=' + judgedTotal + ' failed=' + fails + ' mutant=' + (process.env.LMV_BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§NC5BCD-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
