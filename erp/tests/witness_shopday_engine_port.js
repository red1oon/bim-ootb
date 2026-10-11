#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHOPDAY-ENGINE-PORT (bim-compiler prompts/SQLiteIDEMPIERE.md §SHOPDAY-RUN-2; CARDINAL RULE: the shipped ERP must book and refuse exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: erp/doc_poster.js + erp/erp_engine.js lacked, versus legacy: (R2.1) the Physical Inventory "No Costs" refusal leaving cost state untouched
//   (Doc_Inventory.createFacts:300-335) and PI gain accumulating CumulatedAmt/Qty (MCost.setWeightedAverage:1740-1741); (R2.2) the tax-corrected receipt cost
//   (Doc_InOut.createFacts:719-783); (R2.4) the order price-list default/refusal (MOrder.beforeSave:1282-1291, pure chooser; the shipped save path is witnessed in witness_shopday_model_path.js).
//   Period-closed refusals of payment/shipment are done by the shipped model layer (T.periodOpen) and witnessed there, not duplicated in the engine. Drives the SHIPPED engine on scratch sql.js dbs (no better-sqlite3). Each section ends judged=N; judged=0 => INCONCLUSIVE.
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
  if (typeof (DP._test && DP._test.poLineCost) !== 'function') { check('R2.2', 'poLineCost exported', 'missing', 'function'); return verdict('R2.2', 0); }
  var db = mkdb();
  db.exec("CREATE TABLE c_tax(c_tax_id INTEGER, rate NUMERIC, issummary TEXT, taxpostingindicator TEXT, parent_tax_id INTEGER, isactive TEXT, ad_client_id INTEGER);" +
    "CREATE TABLE c_order(c_order_id INTEGER, m_pricelist_id INTEGER, c_currency_id INTEGER, istaxincluded TEXT);" +
    "CREATE TABLE m_pricelist(m_pricelist_id INTEGER, istaxincluded TEXT);CREATE TABLE c_currency(c_currency_id INTEGER, stdprecision INTEGER);" +
    "INSERT INTO c_currency VALUES(100,2),(101,0),(102,NULL);INSERT INTO m_pricelist VALUES(1,'N'),(2,'Y');INSERT INTO c_order VALUES(1,1,100,'N'),(2,2,100,'Y'),(3,1,100,'Y'),(4,0,100,'Y'),(5,99,100,'Y'),(6,2,101,'Y'),(7,2,102,'Y'),(8,2,103,'Y');" +
    "INSERT INTO c_tax(c_tax_id,rate,issummary,taxpostingindicator,parent_tax_id,isactive) VALUES(10,10,'N','N',NULL,'Y'),(11,10,'N','1',NULL,'Y'),(20,10,'Y','N',NULL,'Y'),(21,5,'N','N',20,'Y'),(22,5,'N','1',20,'Y'),(30,0,'Y','N',NULL,'Y'),(31,5,'N','1',30,'Y'),(32,50,'N','1',30,'Y');");
  db.exec("UPDATE c_tax SET ad_client_id=5"); db.exec("UPDATE c_tax SET ad_client_id=6 WHERE c_tax_id=32");
  var n = 0, c = function (name, ol, want) { var ab = []; var got = DP._test.poLineCost(db, ol, ab); n++; check('R2.2', name, got == null ? { absent: ab } : Number(got), want); };
  c('excluded 10%, not distributed: tax is NOT in the cost (price 30 -> 30)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 10 }, 30);
  c('excluded 10%, distributed (TaxPostingIndicator 1): +tax at scale 12 (30 -> 33)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 11 }, 33);
  c('included 10%, not distributed: tax taken OUT (33 - (33-33/1.1) = 30)', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 10 }, 30);
  c('included 10%, distributed: unchanged (33)', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 11 }, 33);
  c('included summary (children 5% plain + 5% distributed): 33 - 1.49 = 31.51', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 20 }, 31.51);
  c('excluded summary: only the distributed child is added (30 + 1.5 = 31.5)', { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 20 }, 31.5);
  c('PriceCost wins and is never tax-corrected', { c_order_id: 2, c_currency_id: 100, priceactual: 33, pricecost: 28, c_tax_id: 10 }, 28);
  c('no tax on the line: PriceActual as is', { c_order_id: 1, c_currency_id: 100, priceactual: 12.34, pricecost: null, c_tax_id: null }, 12.34);
  // finding 5: IsTaxIncluded is the ORDER'S PRICE LIST's flag (MOrderLine.isTaxIncluded:697-707) -- c_order.istaxincluded is never consulted; no price list / no row => legacy NPE => absent
  c('F5 price list says NOT included, c_order.istaxincluded=Y: the price list wins (30 stays 30)', { c_order_id: 3, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 10 }, 30);
  c('F5 order without a price list: refused (absent), not guessed', { c_order_id: 4, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 10 }, { absent: ['order price list (MOrderLine.isTaxIncluded:697-707)'] });
  c('F5 price list id set but row missing: refused (absent)', { c_order_id: 5, c_currency_id: 100, priceactual: 33, pricecost: 0, c_tax_id: 10 }, { absent: ['m_pricelist#99'] });
  c('F5 NEG-CONTROL a line with PriceCost never needs the price list (order 4 still 28)', { c_order_id: 4, c_currency_id: 100, priceactual: 33, pricecost: 28, c_tax_id: 10 }, 28);
  // finding 6: the currency's StdPrecision is read, never defaulted to 2 (Doc_InOut:727)
  c('F6 0-decimal currency (precision 0): included 10% of 33 -> tax 3 -> 30', { c_order_id: 6, c_currency_id: 101, priceactual: 33, pricecost: 0, c_tax_id: 10 }, 30);
  c('F6 included 10% of 35 at precision 0: tax round(3.18)=3 -> 32 (precision 2 would give 31.82)', { c_order_id: 6, c_currency_id: 101, priceactual: 35, pricecost: 0, c_tax_id: 10 }, 32);
  c('F6 currency row with NULL StdPrecision: refused (absent), no invented 2', { c_order_id: 7, c_currency_id: 102, priceactual: 33, pricecost: 0, c_tax_id: 10 }, { absent: ['currency std precision (c_currency#102)'] });
  c('F6 currency row missing: refused (absent)', { c_order_id: 8, c_currency_id: 103, priceactual: 33, pricecost: 0, c_tax_id: 10 }, { absent: ['currency std precision (c_currency#103)'] });
  // finding 7: MTax.getChildTaxes:254-259 filters the line's client (setClient_ID) -- child 32 (client 6) must not be added
  c('F7 summary child of ANOTHER client ignored: 30 + 5% = 31.5 (child 32, 50%, client 6, would give 46.5)', { c_order_id: 1, c_currency_id: 100, ad_client_id: 5, priceactual: 30, pricecost: 0, c_tax_id: 30 }, 31.5);
  c('F7 NEG-CONTROL the same child counts for a client-6 line: 30 + 50% = 45', { c_order_id: 1, c_currency_id: 100, ad_client_id: 6, priceactual: 30, pricecost: 0, c_tax_id: 30 }, 45);
  // finding 7: a column added mid-run must be seen (negative probes are cached per schema_version, invalidated by DDL)
  (function () {
    var d2 = mkdb(); d2.exec("CREATE TABLE c_tax(c_tax_id INTEGER, rate NUMERIC, issummary TEXT, taxpostingindicator TEXT, parent_tax_id INTEGER);INSERT INTO c_tax VALUES(30,0,'Y','N',NULL),(31,5,'N','1',30),(33,10,'N','1',30);" +
      "CREATE TABLE c_order(c_order_id INTEGER, m_pricelist_id INTEGER, c_currency_id INTEGER);INSERT INTO c_order VALUES(1,1,100);CREATE TABLE m_pricelist(m_pricelist_id INTEGER, istaxincluded TEXT);INSERT INTO m_pricelist VALUES(1,'N');CREATE TABLE c_currency(c_currency_id INTEGER, stdprecision INTEGER);INSERT INTO c_currency VALUES(100,2);");
    var ol = { c_order_id: 1, c_currency_id: 100, priceactual: 100, pricecost: 0, c_tax_id: 30 };
    var a = Number(DP._test.poLineCost(d2, ol, [])); n++; check('R2.2', 'F7 no isactive column: both children count (100 + 5 + 10 = 115)', a, 115);
    d2.exec("ALTER TABLE c_tax ADD COLUMN isactive TEXT DEFAULT 'Y'; UPDATE c_tax SET isactive='N' WHERE c_tax_id=33");
    var b = Number(DP._test.poLineCost(d2, ol, [])); n++; check('R2.2', 'F7 isactive column ADDED mid-run is seen (stale negative probe would still say 115): inactive child dropped -> 105', b, 105);
  })();
  verdict('R2.2', n);
})();

// ---- R2.1: Doc_Inventory.createFacts:300-335 "No Costs" refusal leaves the cost state untouched; R2.1b: PI gain accumulates CumulatedAmt/Qty (MCost.setWeightedAverage) ----
(function () {
  if (typeof (DP._test && DP._test.inventoryPostRefused) !== 'function') { check('R2.1', 'inventoryPostRefused exported', 'missing', 'function'); return verdict('R2.1', 0); }
  function mk(cost, bless, extra) {
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
    if (extra) db.exec(extra);
    return db;
  }
  var n = 0;
  var z = mk(0, false); n++; check('R2.1', 'zero cost, no blessing: PI refused', DP._test.inventoryPostRefused(z, 9), true);
  n++; check('R2.1', 'refused PI changes NO cost state (costQtyUpdatesFor -> [])', DP.costQtyUpdatesFor(z, 'M_Inventory', 9).length, 0);
  var b = mk(0, true); n++; check('R2.1', 'zero cost WITH a processed zero-amount order/invoice cost detail: not refused (Doc_Inventory.java:319-331)', DP._test.inventoryPostRefused(b, 9), false);
  var ok = mk(60, false); n++; check('R2.1', 'cost 60: not refused', DP._test.inventoryPostRefused(ok, 9), false);
  var u = DP.costQtyUpdatesFor(ok, 'M_Inventory', 9); n++; check('R2.1', 'cost 60: one cost update (1 schema x 1 element)', u.length, 1);
  if (u.length) {
    n++; check('R2.1b', 'PI gain 20 @60: CurrentQty 20', u[0].set.currentqty, 20);
    n++; check('R2.1b', 'PI gain 20 @60: CumulatedAmt += 20 x 60 = 1200 (legacy 30@20/600 after 20 x 30)', u[0].set.cumulatedamt, 1200);
    n++; check('R2.1b', 'PI gain 20 @60: CumulatedQty += 20', u[0].set.cumulatedqty, 20);
    n++; check('R2.1b', 'price stays 60 (weighted average of 60 and 60)', u[0].set.currentcostprice, 60);
  }
  // finding 1: only a STOCKED product refuses on zero cost (Doc_Inventory.createFacts: product.isStocked() else `continue`; MProduct.isStocked:602-605 = IsStocked AND ProductType Item)
  var svc = "INSERT INTO m_product VALUES(6,'N','S',1);INSERT INTO m_inventoryline VALUES(2,9,6,1,0,3,'Y');";
  var m1 = mk(60, false, svc); n++; check('R2.1', 'F1 stocked line (cost 60) + SERVICE line with no m_cost row: PI NOT refused', DP._test.inventoryPostRefused(m1, 9), false);
  var u1 = DP.costQtyUpdatesFor(m1, 'M_Inventory', 9); n++; check('R2.1', 'F1 the stocked line still gets its cost update (service ignored)', u1.map(function (x) { return x.m_product_id; }), [5]);
  var m2 = mk(60, false, "INSERT INTO m_product VALUES(6,'Y','I',1);INSERT INTO m_inventoryline VALUES(2,9,6,1,0,3,'Y');"); n++; check('R2.1', 'F1 NEG-CONTROL the same second line STOCKED with no cost: PI refused, no update at all', [DP._test.inventoryPostRefused(m2, 9), DP.costQtyUpdatesFor(m2, 'M_Inventory', 9).length], [true, 0]);
  var m3 = mk(60, false, "INSERT INTO m_product VALUES(6,'Y','S',1);INSERT INTO m_inventoryline VALUES(2,9,6,1,0,3,'Y');"); n++; check('R2.1', 'F1 IsStocked=Y but ProductType Service is not stocked (MProduct.isStocked && isItem): not refused', DP._test.inventoryPostRefused(m3, 9), false);
  // finding 8: Costs.signum() is exact -- a sub-cent unit cost is NOT "No Costs"
  var sc = mk(0.004, false); n++; check('R2.1', 'F8 stocked, cost 0.004 (sub-cent, no blessing): NOT refused (cents rounding would call it zero)', DP._test.inventoryPostRefused(sc, 9), false);
  var sz = mk(0.0, false); n++; check('R2.1', 'F8 NEG-CONTROL cost exactly 0: refused', DP._test.inventoryPostRefused(sz, 9), true);
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

// ---- finding 7: _poLineCost depends on the order line only -- costUpdatesForMatchPO computes it ONCE for N schemas (counted on the c_tax read) ----
(function () {
  var raw = mkdb(), cnt = { tax: 0 }, db = { prepare: function (q) { if (/FROM c_tax WHERE c_tax_id=\?/.test(q)) cnt.tax++; return raw.prepare(q); }, exec: function (q) { raw.exec(q); } }, n = 0;
  raw.exec("CREATE TABLE c_acctschema(c_acctschema_id,m_costtype_id,costingmethod,c_currency_id,isactive);INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y'),(2,1,'A',100,'Y');" +
    "CREATE TABLE c_currency(c_currency_id,costingprecision,stdprecision);INSERT INTO c_currency VALUES(100,4,2);CREATE TABLE m_costelement(m_costelement_id,costingmethod,costelementtype,isactive);INSERT INTO m_costelement VALUES(1,'A','M','Y');" +
    "CREATE TABLE m_product(m_product_id,m_product_category_id,isstocked,producttype);INSERT INTO m_product VALUES(7,1,'Y','I');" +
    "CREATE TABLE m_cost(m_product_id,c_acctschema_id,m_costtype_id,m_costelement_id,currentcostprice,currentqty,cumulatedqty,cumulatedamt);INSERT INTO m_cost VALUES(7,1,1,1,2,10,10,20),(7,2,1,1,2,10,10,20);" +
    "CREATE TABLE c_tax(c_tax_id,rate,issummary,taxpostingindicator,parent_tax_id,isactive);INSERT INTO c_tax VALUES(10,10,'N','1',NULL,'Y');" +
    "CREATE TABLE c_order(c_order_id,m_pricelist_id,c_currency_id,ad_client_id,ad_org_id);INSERT INTO c_order VALUES(1,1,100,11,0);CREATE TABLE m_pricelist(m_pricelist_id,istaxincluded);INSERT INTO m_pricelist VALUES(1,'N');" +
    "CREATE TABLE c_orderline(c_orderline_id,c_order_id,c_currency_id,priceactual,pricecost,c_tax_id);INSERT INTO c_orderline VALUES(1,1,100,30,0,10);" +
    "CREATE TABLE m_inout(m_inout_id,dateacct,ad_client_id,ad_org_id);INSERT INTO m_inout VALUES(1,'2026-10-01 00:00:00',11,0);CREATE TABLE m_inoutline(m_inoutline_id,m_inout_id);INSERT INTO m_inoutline VALUES(1,1);" +
    "CREATE TABLE m_matchpo(m_matchpo_id,m_inoutline_id,c_orderline_id,m_product_id,qty);INSERT INTO m_matchpo VALUES(1,1,1,7,5);");
  var r = DP.costUpdatesForMatchPO(db, 1);
  n++; check('F7-ONCE', 'two active schemas both cost the receipt (judged, not vacuous)', r.updates.length, 2);
  n++; check('F7-ONCE', 'the c_tax row of the order line is read ONCE for 2 schemas (was once per schema)', cnt.tax, 1);
  n++; check('F7-ONCE', 'tax distributed with the line: cost 30 -> 33 x 5 = 165 on the 10 @ 2.00 base -> new price (20+165)/15=12.33333333 at 2x costing precision', r.updates.map(function (u) { return Number(u.currentcostprice); }), [12.33333333, 12.33333333]);
  verdict('F7-ONCE', n);
})();

// ---- SR2-NEG-CONTROL: change one input by one unit and the outcome MUST move ----
(function () {
  var db = mkdb(), n = 0;
  db.exec("CREATE TABLE c_tax(c_tax_id INTEGER, rate NUMERIC, issummary TEXT, taxpostingindicator TEXT, parent_tax_id INTEGER, isactive TEXT);INSERT INTO c_tax VALUES(11,10,'N','1',NULL,'Y');INSERT INTO c_tax VALUES(10,10,'N','N',NULL,'Y');" +
    "CREATE TABLE c_order(c_order_id INTEGER, m_pricelist_id INTEGER, c_currency_id INTEGER);INSERT INTO c_order VALUES(1,1,100);CREATE TABLE m_pricelist(m_pricelist_id INTEGER, istaxincluded TEXT);INSERT INTO m_pricelist VALUES(1,'N');CREATE TABLE c_currency(c_currency_id INTEGER, stdprecision INTEGER);INSERT INTO c_currency VALUES(100,2);");
  var a = Number(DP._test.poLineCost(db, { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 11 }, [])), b = Number(DP._test.poLineCost(db, { c_order_id: 1, c_currency_id: 100, priceactual: 30, pricecost: 0, c_tax_id: 10 }, []));
  n++; check('SR2-NEG-CONTROL', 'distributed vs not distributed tax must give different costs (33 vs 30)', [a, b], [33, 30]);
  n++; check('SR2-NEG-CONTROL', 'a different price moves the corrected cost (31 -> 34.1)', Number(DP._test.poLineCost(db, { c_order_id: 1, c_currency_id: 100, priceactual: 31, pricecost: 0, c_tax_id: 11 }, [])), 34.1);
  verdict('SR2-NEG-CONTROL', n);
})();
log('§SR2_VERDICT ' + (fails ? 'FAIL' : incs ? 'INCONCLUSIVE' : 'PASS') + ' fails=' + fails + ' inconclusive=' + incs);
process.exit(fails ? 1 : incs ? 2 : 0);
})();
