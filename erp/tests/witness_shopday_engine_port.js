#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHOPDAY-ENGINE-PORT (bim-compiler prompts/SQLiteIDEMPIERE.md §SHOPDAY-RUN-2; CARDINAL RULE: the shipped ERP must book and refuse exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: erp/doc_poster.js + erp/erp_engine.js lacked, versus legacy: (R2.1) the Physical Inventory "No Costs" refusal leaving cost state untouched
//   (Doc_Inventory.createFacts:300-335) and PI gain accumulating CumulatedAmt/Qty (MCost.setWeightedAverage:1740-1741); (R2.2) the tax-corrected receipt cost
//   (Doc_InOut.createFacts:719-783); (R2.4) the order price-list default/refusal (MOrder.beforeSave:1282-1291); (R2.5) period-closed refusal of payment (MPayment.prepareIt:1917-1923)
//   and shipment (MInOut.prepareIt:1453-1457). Drives the SHIPPED engine on scratch sql.js dbs (no better-sqlite3). Each section ends judged=N; judged=0 => INCONCLUSIVE.
//   SR2-NEG-CONTROL flips an input by one unit and the verdict MUST change (a witness that cannot fail is not a witness).
'use strict';
var path = require('path'), fs = require('fs');
var DP = require(path.join(__dirname, '..', 'doc_poster.js')), E = require(path.join(__dirname, '..', 'erp_engine.js'));
var initSqlJs = null, sqlWhy = '';
try { initSqlJs = require('sql.js'); } catch (e1) {
  try { var vend = require(path.join(__dirname, '..', 'sqljs', 'sql-wasm.js')), wasm = fs.readFileSync(path.join(__dirname, '..', 'sqljs', 'sql-wasm.wasm')); initSqlJs = function () { return vend({ wasmBinary: wasm }); }; }
  catch (e2) { sqlWhy = 'sql.js not installed (' + e1.message.split('\n')[0] + ') and vendored erp/sqljs not loadable (' + e2.message.split('\n')[0] + ')'; }
}
if (!initSqlJs) { console.log('§SR2_VERDICT INCONCLUSIVE reason="' + sqlWhy + '"'); process.exit(3); }
var fails = 0, incs = 0, log = console.log, SQL = null;
function mkdb() {
  var sdb = new SQL.Database();
  function bind(st, p) { if (p == null) return; st.bind(Array.isArray(p) ? p : [p]); }
  return { prepare: function (sql) { return {
    get: function (p) { var s = sdb.prepare(sql); try { bind(s, p); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
    all: function (p) { var s = sdb.prepare(sql), r = []; try { bind(s, p); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } },
    run: function (p) { var s = sdb.prepare(sql); try { bind(s, p); s.step(); } finally { s.free(); } } }; }, exec: function (q) { sdb.run(q); } };
}
function check(sec, name, got, want) { var ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; log('§SR2 ' + sec + ' ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); return ok; }
function verdict(sec, judged) { if (!judged) { incs++; log('§SR2 ' + sec + ' INCONCLUSIVE judged=0'); } else log('§SR2 ' + sec + ' judged=' + judged); }
(async function () {
SQL = await initSqlJs();
// ---- R2.2: Doc_InOut.createFacts:719-783 per-unit receipt cost of an order line ----
(function () {
  if (typeof DP.poLineCost !== 'function') { check('R2.2', 'poLineCost exported', typeof DP.poLineCost, 'function'); return verdict('R2.2', 0); }
  var db = mkdb();
  db.exec("CREATE TABLE c_tax(c_tax_id INTEGER, rate NUMERIC, issummary TEXT, taxpostingindicator TEXT, parent_tax_id INTEGER, isactive TEXT);" +
    "CREATE TABLE c_order(c_order_id INTEGER, m_pricelist_id INTEGER, c_currency_id INTEGER, istaxincluded TEXT);" +
    "CREATE TABLE m_pricelist(m_pricelist_id INTEGER, istaxincluded TEXT);CREATE TABLE c_currency(c_currency_id INTEGER, stdprecision INTEGER);" +
    "INSERT INTO c_currency VALUES(100,2);INSERT INTO m_pricelist VALUES(1,'N'),(2,'Y');INSERT INTO c_order VALUES(1,1,100,'N'),(2,2,100,'Y');" +
    "INSERT INTO c_tax VALUES(10,10,'N','N',NULL,'Y'),(11,10,'N','1',NULL,'Y'),(20,10,'Y','N',NULL,'Y'),(21,5,'N','N',20,'Y'),(22,5,'N','1',20,'Y');");
  var n = 0, c = function (name, ol, want) { var ab = []; var got = DP.poLineCost(db, ol, ab); n++; check('R2.2', name, got == null ? { absent: ab } : Number(got), want); };
  c('excluded 10%, not distributed: tax is NOT in the cost (price 30 -> 30)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 10 }, 30);
  c('excluded 10%, distributed (TaxPostingIndicator 1): +tax at scale 12 (30 -> 33)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 11 }, 33);
  c('included 10%, not distributed: tax taken OUT (33 - (33-33/1.1) = 30)', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 10 }, 30);
  c('included 10%, distributed: unchanged (33)', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 11 }, 33);
  c('included summary (children 5% plain + 5% distributed): 33 - 1.49 = 31.51', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 20 }, 31.51);
  c('excluded summary: only the distributed child is added (30 + 1.5 = 31.5)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 20 }, 31.5);
  c('PriceCost wins and is never tax-corrected', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 28, c_tax_id: 10 }, 28);
  c('no tax on the line: PriceActual as is', { c_order_id: 1, c_currency_id: 100, priceactual: 12.34, pricecost: null, c_tax_id: null }, 12.34);
  verdict('R2.2', n);
})();

// ---- R2.1: Doc_Inventory.createFacts:300-335 "No Costs" refusal leaves the cost state untouched; R2.1b: PI gain accumulates CumulatedAmt/Qty (MCost.setWeightedAverage) ----
(function () {
  if (typeof DP.inventoryPostRefused !== 'function') { check('R2.1', 'inventoryPostRefused exported', typeof DP.inventoryPostRefused, 'function'); return verdict('R2.1', 0); }
  function mk(cost, bless) {
    var db = mkdb();
    db.exec("CREATE TABLE c_acctschema(c_acctschema_id INTEGER, m_costtype_id INTEGER, costingmethod TEXT, c_currency_id INTEGER, isactive TEXT);" +
      "CREATE TABLE c_currency(c_currency_id INTEGER, costingprecision INTEGER, stdprecision INTEGER);" +
      "CREATE TABLE m_costelement(m_costelement_id INTEGER, costelementtype TEXT, costingmethod TEXT, isactive TEXT);" +
      "CREATE TABLE m_product(m_product_id INTEGER, isstocked TEXT, producttype TEXT, m_product_category_id INTEGER);" +
      "CREATE TABLE m_cost(m_product_id INTEGER, c_acctschema_id INTEGER, m_costtype_id INTEGER, m_costelement_id INTEGER, currentcostprice NUMERIC, currentqty NUMERIC, cumulatedamt NUMERIC, cumulatedqty NUMERIC);" +
      "CREATE TABLE m_costdetail(m_product_id INTEGER, processed TEXT, amt NUMERIC, qty NUMERIC, c_orderline_id INTEGER, c_invoiceline_id INTEGER);" +
      "CREATE TABLE m_inventoryline(m_inventoryline_id INTEGER, m_inventory_id INTEGER, m_product_id INTEGER, m_locator_id INTEGER, qtybook NUMERIC, qtycount NUMERIC, isactive TEXT);" +
      "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');INSERT INTO c_currency VALUES(100,4,2);INSERT INTO m_costelement VALUES(7,'M','A','Y');INSERT INTO m_product VALUES(5,'Y','I',1);" +
      "INSERT INTO m_cost VALUES(5,1,1,7," + cost + ",0,0,0);INSERT INTO m_inventoryline VALUES(1,9,5,1,0,20,'Y');");
    if (bless) db.exec("INSERT INTO m_costdetail VALUES(5,'Y',0,10,77,NULL)");
    return db;
  }
  var n = 0;
  var z = mk(0, false); n++; check('R2.1', 'zero cost, no blessing: PI refused', DP.inventoryPostRefused(z, 9), true);
  n++; check('R2.1', 'refused PI changes NO cost state (costQtyUpdatesFor -> [])', DP.costQtyUpdatesFor(z, 'M_Inventory', 9).length, 0);
  var b = mk(0, true); n++; check('R2.1', 'zero cost WITH a processed zero-amount order/invoice cost detail: not refused (Doc_Inventory.java:319-331)', DP.inventoryPostRefused(b, 9), false);
  var ok = mk(60, false); n++; check('R2.1', 'cost 60: not refused', DP.inventoryPostRefused(ok, 9), false);
  var u = DP.costQtyUpdatesFor(ok, 'M_Inventory', 9); n++; check('R2.1', 'cost 60: one cost update (1 schema x 1 element)', u.length, 1);
  if (u.length) {
    n++; check('R2.1b', 'PI gain 20 @60: CurrentQty 20', u[0].set.currentqty, 20);
    n++; check('R2.1b', 'PI gain 20 @60: CumulatedAmt += 20 x 60 = 1200 (legacy 30@20/600 after 20 x 30)', u[0].set.cumulatedamt, 1200);
    n++; check('R2.1b', 'PI gain 20 @60: CumulatedQty += 20', u[0].set.cumulatedqty, 20);
    n++; check('R2.1b', 'price stays 60 (weighted average of 60 and 60)', u[0].set.currentcostprice, 60);
  }
  verdict('R2.1', n);
})();

// ---- R2.4: MOrder.beforeSave:1282-1291 default price list ----
(function () {
  if (typeof E.orderPriceListDefault !== 'function') { check('R2.4', 'orderPriceListDefault exported', typeof E.orderPriceListDefault, 'function'); return verdict('R2.4', 0); }
  var L = [{ m_pricelist_id: 1000000, issopricelist: 'N', isactive: 'Y', isdefault: 'Y', ad_client_id: 5 }, { m_pricelist_id: 1000001, issopricelist: 'N', isactive: 'Y', isdefault: 'N', ad_client_id: 5 },
    { m_pricelist_id: 11, issopricelist: 'Y', isactive: 'Y', isdefault: 'Y', ad_client_id: 6 }];
  var n = 0, r;
  r = E.orderPriceListDefault({ m_pricelist_id: 0, issotrx: 'Y', ad_client_id: 5 }, L); n++; check('R2.4', 'fresh client (only IsSOPriceList=N lists): sales order REFUSED', [r.ok, r.reason], [false, 'no-price-list']);
  r = E.orderPriceListDefault({ m_pricelist_id: 0, issotrx: 'N', ad_client_id: 5 }, L); n++; check('R2.4', 'purchase order takes the IsDefault=Y list first', [r.ok, r.m_pricelist_id], [true, 1000000]);
  r = E.orderPriceListDefault({ m_pricelist_id: 0, issotrx: 'Y', ad_client_id: 5 }, L.concat([{ m_pricelist_id: 1000009, issopricelist: 'Y', isactive: 'N', isdefault: 'Y', ad_client_id: 5 }])); n++; check('R2.4', 'an INACTIVE sales list is ignored', r.ok, false);
  r = E.orderPriceListDefault({ m_pricelist_id: 0, issotrx: 'Y', ad_client_id: 5 }, L.concat([{ m_pricelist_id: 1000010, issopricelist: 'Y', isactive: 'Y', isdefault: 'N', ad_client_id: 5 }, { m_pricelist_id: 1000011, issopricelist: 'Y', isactive: 'Y', isdefault: 'Y', ad_client_id: 5 }])); n++; check('R2.4', 'IsDefault DESC: the default sales list wins', r.m_pricelist_id, 1000011);
  r = E.orderPriceListDefault({ m_pricelist_id: 1000099, issotrx: 'Y', ad_client_id: 5 }, L); n++; check('R2.4', 'an explicit price list is kept', [r.ok, r.m_pricelist_id], [true, 1000099]);
  verdict('R2.4', n);
})();

// ---- R2.5: period-closed refusal for payment (MPayment.prepareIt:1917-1923) and shipment (MInOut.prepareIt:1453-1457) ----
(function () {
  var n = 0, closed = { ok: false, reason: 'period-closed' }, open = { ok: true }, r;
  var pay = { c_payment_id: 1, payamt: 10, isreceipt: 'Y' }, io = { m_inout_id: 1, movementtype: 'C-', docstatus: 'DR' }, ln = [{ m_product_id: 5, movementqty: 1, m_locator_id: 1 }];
  r = E.completePayment(pay, null, { periodOpen: closed, newId: function () { return 1; } }); n++; check('R2.5', 'payment in a closed period REFUSED', [r.ok, r.reason], [false, 'PeriodClosed']);
  r = E.completePayment(pay, null, { periodOpen: open, newId: function () { return 1; } }); n++; check('R2.5', 'NEG-CONTROL payment, period open: completes', r.ok, true);
  r = E.completeInOut(io, ln, { periodOpen: closed }); n++; check('R2.5', 'shipment in a closed period REFUSED', [r.ok, r.reason], [false, 'PeriodClosed']);
  r = E.completeInOut(io, ln, { periodOpen: open }); n++; check('R2.5', 'NEG-CONTROL shipment, period open: completes', r.ok, true);
  r = E.completeInOut(io, ln, {}); n++; check('R2.5', 'no periodOpen supplied (every shipped caller today): unchanged behaviour, completes', r.ok, true);
  r = E.completePayment(pay, null, { newId: function () { return 1; } }); n++; check('R2.5', 'no periodOpen supplied: payment unchanged, completes', r.ok, true);
  verdict('R2.5', n);
})();

// ---- SR2-NEG-CONTROL: change one input by one unit and the outcome MUST move ----
(function () {
  var db = mkdb(), n = 0;
  db.exec("CREATE TABLE c_tax(c_tax_id INTEGER, rate NUMERIC, issummary TEXT, taxpostingindicator TEXT, parent_tax_id INTEGER, isactive TEXT);INSERT INTO c_tax VALUES(11,10,'N','1',NULL,'Y');INSERT INTO c_tax VALUES(10,10,'N','N',NULL,'Y');");
  var a = Number(DP.poLineCost(db, { priceactual: 30, pricecost: 0, c_tax_id: 11 }, [])), b = Number(DP.poLineCost(db, { priceactual: 30, pricecost: 0, c_tax_id: 10 }, []));
  n++; check('SR2-NEG-CONTROL', 'distributed vs not distributed tax must give different costs (33 vs 30)', [a, b], [33, 30]);
  n++; check('SR2-NEG-CONTROL', 'a different price moves the corrected cost (31 -> 34.1)', Number(DP.poLineCost(db, { priceactual: 31, pricecost: 0, c_tax_id: 11 }, [])), 34.1);
  verdict('SR2-NEG-CONTROL', n);
})();
log('§SR2_VERDICT ' + (fails ? 'FAIL' : incs ? 'INCONCLUSIVE' : 'PASS') + ' fails=' + fails + ' inconclusive=' + incs);
process.exit(fails ? 1 : incs ? 2 : 0);
})();
