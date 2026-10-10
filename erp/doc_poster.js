// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * doc_poster.js — reusable per-document GL derivation (W-DOC-POSTER).
 *
 * GAP-A FIX (POSTING_PREVIEW_PANEL.md): the per-document posting manifest that turns a completed
 * document into journal lines lived ONLY inside the FOLD witnesses (poc_fold_complete.deriveInvoice,
 * duplicated in poc_post_harden.derive) — never a shipped verb. This module EXTRACTS that derivation
 * VERBATIM so the live Posting-Preview seam consumes the SAME logic the FOLD oracle proved — no fork,
 * no re-derive. Faithfulness is proven by scripts/poc_doc_poster.js (== real fact_acct(318), and ==
 * poc_fold_complete's own agg).
 *
 * PURE + db-agnostic: `db` is ANY handle exposing `.prepare(sql).get(params)` / `.all(params)`
 *   (better-sqlite3 native in node; the sql.js facade in erp_preview.js in the browser). `R` is the
 *   post_resolver seam (node require, or injected window.PostResolver). NEVER invents an account or an
 *   amount — accounts come from R.resolve (master columns), amounts from real document rows, integer
 *   cents, no Date.now/Math.random.
 *
 * Returns the per-account fold the readPostings VM shape expects:
 *   { lines:[{account_id,value,name,amtacctdr,amtacctcr}], balanced, sumDr, sumCr, absent:[token], basis }
 *   account_id = the natural C_ElementValue id (== fact_acct.account_id); amtacctdr/cr in DOLLARS (the VM
 *   formats to 2dp). basis ∈ {invoice, order, none} — which source rows the manifest was derived from.
 */

function cents(n) { return Math.round(Number(n || 0) * 100); }
function num(x) { return Number(x); }

// ── Case-insensitive row reads (NEW_CLIENT_MGMT.md BLOCKER fix, 2026-06-11) ──
// The deployed ad_seed.db stores DOCUMENT tables in canonical CamelCase (C_BPartner_ID, M_Product_ID); SQLite
// returns unaliased result keys in the DECLARED case, so the lowercase reads below (hdr.c_bpartner_id, l.m_product_id)
// come back `undefined` → receivable+revenue go absent → blank/coverage:partial preview. Expose lowercase key
// ALIASES on every row so reads resolve regardless of stored case. ADDITIVE + NON-INVENT: all-lowercase rows
// (ad_full/glassbowl/migrated shards) lowercase to themselves → no-op → every FOLD witness stays byte-green. One
// place covers node better-sqlite3 AND the browser sql.js facade (erp_preview.js), both flowing through this consumer.
function lc(row) {
  if (!row || typeof row !== 'object') return row;
  Object.keys(row).forEach(function (k) { var lk = k.toLowerCase(); if (lk !== k && !(lk in row)) row[lk] = row[k]; });
  return row;
}
function getRow(db, sql, params) { return lc(db.prepare(sql).get(params)); }
function allRows(db, sql, params) { return (db.prepare(sql).all(params) || []).map(lc); }

// ── INVOICE sales manifest — EXTRACTED VERBATIM from poc_fold_complete.deriveInvoice (W-FOLD-COMPLETE) ──
// DR {BPartner.Receivable}=grandtotal / CR {Product.Revenue}=linenetamt per line / CR {Tax.Due}=taxamt.
function deriveInvoice(db, R, invId, schema) {
  var hdr = getRow(db, 'SELECT c_invoice_id,c_bpartner_id,grandtotal,issotrx FROM c_invoice WHERE c_invoice_id=?', num(invId));
  if (!hdr) return null;
  if (String(hdr.issotrx) === 'N' && _apInvoiceBuilt(db, invId)) return deriveAPInvoice(db, R, invId, schema);   // §65.2 (F25)
  var lines = allRows(db, 'SELECT m_product_id,linenetamt FROM c_invoiceline WHERE c_invoice_id=?', num(invId));
  var taxes = allRows(db, 'SELECT c_tax_id,taxamt FROM c_invoicetax WHERE c_invoice_id=?', num(invId));
  var by = {}, absent = [];
  function add(side, el, amt) {
    var k = el.id;
    if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 };
    if (side === 'DR') by[k].dr += cents(amt); else by[k].cr += cents(amt);
    _part(by[k], side, cents(amt));   // §65.4 (F27): each fact line is converted on its own (FactLine.convert)
  }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  var rcv = el(R.resolve(db, '{BPartner.Receivable}', num(hdr.c_bpartner_id), schema));
  if (rcv) add('DR', rcv, hdr.grandtotal);
  lines.forEach(function (l) { var e = el(R.resolve(db, '{Product.Revenue}', num(l.m_product_id), schema)); if (e) add('CR', e, l.linenetamt); });
  taxes.forEach(function (t) { var e = el(R.resolve(db, '{Tax.Due}', num(t.c_tax_id), schema)); if (e) add('CR', e, t.taxamt); });
  convertToSchema(db, by, absent, invId, schema);
  return { by: by, absent: absent };
}

// ── AP INVOICE (API) — §65.2 (F25), Doc_Invoice.createFacts DOCTYPE_APInvoice (Doc_Invoice.java:605-760) ─────────────────────────────────────────────────────────
// Dr per tax {Tax.Credit} (APTaxType credit; a sales-tax/expense tax is not ported), Dr per line {Product.InventoryClearing} for an item / {Product.Expense} otherwise (amount = LineNetAmt), Cr {Vendor.V_Liability}
// = GrandTotal (all items, or PostServices off — the services-liability split is deprecated, :733-737); charges, landed cost, trade discount, credit memos (APC) and reversals named absent.
// Built only when the invoice row carries its C_DocType_ID and that doctype is API (older posting dbs keep the previous behaviour).
function _apInvoiceBuilt(db, invId) {
  if (!_hasCol(db, 'c_invoice', 'c_doctype_id')) return false;
  var r = getRow(db, 'SELECT d.docbasetype AS t FROM c_invoice i JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE i.c_invoice_id=?', num(invId));
  return !!(r && r.t === 'API');
}
function deriveAPInvoice(db, R, invId, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_invoice WHERE c_invoice_id=?', num(invId));
  var by = {}, absent = [];
  function add(side, el, amt) { if (!el) return; var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += cents(amt); else by[k].cr += cents(amt); _part(by[k], side, cents(amt)); }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  if (num(hdr.reversal_id)) { absent.push('AP invoice reversal not ported'); return { by: by, absent: absent }; }
  if (Number(hdr.chargeamt || 0) !== 0) { absent.push('AP invoice header charge not ported'); return { by: by, absent: absent }; }
  allRows(db, 'SELECT c_tax_id, taxamt FROM c_invoicetax WHERE c_invoice_id=?', num(invId)).forEach(function (t) { if (Number(t.taxamt) !== 0) add('DR', el(R.resolve(db, '{Tax.Credit}', num(t.c_tax_id), schema)), t.taxamt); });
  allRows(db, 'SELECT m_product_id, linenetamt' + (_hasCol(db, 'c_invoiceline', 'c_charge_id') ? ', c_charge_id' : '') + ' FROM c_invoiceline WHERE c_invoice_id=?', num(invId)).forEach(function (l) {
    if (num(l.c_charge_id)) { absent.push('AP invoice charge line not ported'); return; }
    var p = _hasCol(db, 'm_product', 'producttype') ? getRow(db, 'SELECT producttype FROM m_product WHERE m_product_id=?', num(l.m_product_id)) : null;
    if (!p) { absent.push('m_product.producttype#' + l.m_product_id); return; }
    if (p.producttype !== 'I') { absent.push('AP invoice service/expense line not ported'); return; }
    add('DR', el(R.resolve(db, '{Product.InventoryClearing}', num(l.m_product_id), schema)), l.linenetamt);
  });
  add('CR', el(R.resolve(db, '{Vendor.V_Liability}', num(hdr.c_bpartner_id), schema)), hdr.grandtotal);
  convertToSchema(db, by, absent, invId, schema);
  return { by: by, absent: absent };
}

// §46 (F12): FactLine.convert (FactLine.java:819-900) — each line's Dr/Cr × MConversionRate.getRate (MConversionRate.java:237-252) rounded HALF_UP to the schema currency's
// StdPrecision (:126-147). A document without currency is posted in the schema currency (:821-823) — so nothing happens unless the invoice row carries c_currency_id.
// Unbalanced after conversion ⇒ legacy Fact.balanceAccounting (Fact.java:548-630) — NOT ported: reported absent, never invented.
function _bigDec(v) { var t = String(v).trim(); if (/e/i.test(t)) t = Number(t).toFixed(20).replace(/0+$/, '').replace(/\.$/, ''); var neg = t[0] === '-'; if (neg) t = t.slice(1); var p = t.split('.'), f = p[1] || ''; return { n: BigInt((neg ? '-' : '') + (p[0] || '0') + f), k: f.length }; }
function _rhuB(n, d) { var neg = n < 0n, a = neg ? -n : n, q = a / d; if ((a % d) * 2n >= d) q += 1n; return neg ? -q : q; }
// §65.4 (F27): FactLine.convert works per FACT LINE (FactLine.java:819-900); the fold keeps each line's source amount next to the per-account sum so a second-currency schema
// converts line by line (legacy) instead of converting the sum (rounding differs on multi-line documents — found by the captured-books oracle, invoices 103 / 106 schema 200000).
function _part(acc, side, amt) { (acc.parts || (acc.parts = [])).push({ side: side, amt: amt }); }
function convertToSchema(db, by, absent, invId, schema, table, opts) {
  table = table || 'c_invoice';
  // table/column-guarded like every §29-§38 addition: a posting db without c_currency/c_conversion_rate/c_acctschema keeps the old (unconverted) fold; the
  // c_currency table for the shared posting db ships as build/erp/patches/glassbowl_data.db.sql (patch text; host loader = open item, spec §46.1)
  if (!_hasCol(db, table, 'c_currency_id') || !_hasCol(db, 'c_acctschema', 'c_currency_id') || !_hasCol(db, 'c_currency', 'stdprecision') || !_hasCol(db, 'c_conversion_rate', 'multiplyrate')) return;
  var ctCol = _hasCol(db, table, 'c_conversiontype_id') ? 'c_conversiontype_id' : 'NULL AS c_conversiontype_id';
  var h = getRow(db, 'SELECT c_currency_id, dateacct, ' + ctCol + ', ad_client_id, ad_org_id FROM ' + table + ' WHERE ' + table + '_id=?', num(invId));
  var sc = getRow(db, 'SELECT c_currency_id FROM c_acctschema WHERE c_acctschema_id=?', num(schema));
  if (!h || h.c_currency_id == null || !sc || num(h.c_currency_id) === num(sc.c_currency_id)) return;
  var ct = num(h.c_conversiontype_id);
  if (!ct) { var dt = getRow(db, "SELECT c_conversiontype_id FROM c_conversiontype WHERE isdefault='Y' ORDER BY c_conversiontype_id", []); ct = dt ? num(dt.c_conversiontype_id) : 0; }
  var date = String(h.dateacct || '').slice(0, 10);
  var rates = allRows(db, "SELECT multiplyrate, validfrom, validto, ad_client_id, ad_org_id FROM c_conversion_rate WHERE c_currency_id=? AND c_currency_id_to=? AND c_conversiontype_id=? AND isactive='Y'", [num(h.c_currency_id), num(sc.c_currency_id), ct])
    .filter(function (r) { return String(r.validfrom).slice(0, 10) <= date && date <= String(r.validto).slice(0, 10) && [0, num(h.ad_client_id || 0)].indexOf(num(r.ad_client_id)) >= 0 && [0, num(h.ad_org_id || 0)].indexOf(num(r.ad_org_id || 0)) >= 0; })
    .sort(function (a, b) { return (num(b.ad_client_id) - num(a.ad_client_id)) || (num(b.ad_org_id || 0) - num(a.ad_org_id || 0)) || String(b.validfrom).localeCompare(String(a.validfrom)); });
  if (!rates.length) { absent.push('NoCurrencyConversion ' + h.c_currency_id + '->' + sc.c_currency_id + ' type=' + ct + ' date=' + date); return; }
  var cr = getRow(db, 'SELECT stdprecision FROM c_currency WHERE c_currency_id=?', num(sc.c_currency_id)), prec = cr ? num(cr.stdprecision) : null;
  if (prec == null) { absent.push('NoCurrencyPrecision ' + sc.c_currency_id); return; }
  var r = _bigDec(rates[0].multiplyrate);
  var conv = function (cents) { return Number(_rhuB(BigInt(cents) * r.n, 10n ** BigInt(r.k)) ); };   // cents × rate, HALF_UP at precision 2
  if (prec !== 2) { absent.push('currency precision ' + prec + ' not ported'); return; }
  var dr = 0, crs = 0;
  Object.keys(by).forEach(function (k) {
    var x = by[k];
    if (x.parts && x.parts.length) { var d0 = 0, c0 = 0; x.parts.forEach(function (p) { if (p.side === 'DR') d0 += conv(p.amt); else c0 += conv(p.amt); }); x.dr = d0; x.cr = c0; }   // §65.4 (F27) per fact line
    else { x.dr = conv(x.dr); x.cr = conv(x.cr); }
    dr += x.dr; crs += x.cr;
  });
  if (dr !== crs && table === 'c_allocationhdr' && opts && opts.allocBalance) _allocBalanceAccounting(db, by, absent, schema, dr - crs);   // §68 (F32): the clearing leg is missing (getCashAcct NONE)
  else if (dr !== crs && table === 'c_allocationhdr') absent.push('allocation rounding correction not ported (Doc_AllocationHdr.java:1147-1900 runs before balanceAccounting; diff=' + (dr - crs) + ')');
  else if (dr !== crs) balanceAccounting(db, by, absent, schema, dr - crs);
}
// §68 (F32) Doc_AllocationHdr.balanceAccounting (Doc_AllocationHdr.java:1807-1828 @{u}; runs inside createFacts when the allocation currency ≠ the schema currency, :548-549):
// diff = ΣAmtAcctDr − ΣAmtAcctCr; currency balancing on and |diff| < TOLERANCE 0.02 (:78) ⇒ createLine(null, CurrencyBalancing_Acct, −diff) (negative ⇒ CR, Fact.java:206-212);
// else createLine(null, RealizedLoss, RealizedGain, schema currency, −diff): positive ⇒ DR loss, negative ⇒ CR gain (Fact.java:186-193); accounts from C_AcctSchema_Default. Missing config ⇒ absent by name.
function _allocBalanceAccounting(db, by, absent, schema, diff) {
  var R = _R(), amt = -diff, acct = null;
  var gl = _hasCol(db, 'c_acctschema_gl', 'usecurrencybalancing') ? getRow(db, 'SELECT usecurrencybalancing AS u, currencybalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
  if (gl && String(gl.u) === 'Y' && Math.abs(diff) < 2) acct = R && R.elementOf ? R.elementOf(db, gl.a) : null;
  else {
    var dft = _hasCol(db, 'c_acctschema_default', 'realizedloss_acct') ? getRow(db, 'SELECT realizedgain_acct AS g, realizedloss_acct AS l FROM c_acctschema_default WHERE c_acctschema_id=?', num(schema)) : null;
    if (!dft) { absent.push('C_AcctSchema_Default.RealizedGain/Loss_Acct'); return; }
    acct = R && R.elementOf ? R.elementOf(db, amt > 0 ? dft.l : dft.g) : null;
  }
  if (!acct) { absent.push('allocation balanceAccounting account unresolved'); return; }
  var k = acct.id; if (!by[k]) by[k] = { account_id: acct.id, value: acct.value, name: acct.name, dr: 0, cr: 0 };
  if (amt > 0) by[k].dr += amt; else by[k].cr += -amt;
}
// §68 (F32): MSysConfig.getValue(Name, default, AD_Client_ID, AD_Org_ID) (MSysConfig.java:595-640 @{u}) over the MIRRORED ad_sysconfig (state-synced from legacy, dict_spec):
// WHERE Name=? AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC; no table / no row ⇒ the caller's LEGACY default.
// Column-guarded: a posting db that has not been synced yet (name/value/ad_client_id only) is read as it is (no org / active filter it cannot express).
function sysConfig(db, name, dflt, client, org) {
  if (!_hasCol(db, 'ad_sysconfig', 'value')) return dflt;
  var hasOrg = _hasCol(db, 'ad_sysconfig', 'ad_org_id'), hasAct = _hasCol(db, 'ad_sysconfig', 'isactive');
  var r = getRow(db, 'SELECT value FROM ad_sysconfig WHERE name=? AND ad_client_id IN (0,?)' + (hasOrg ? ' AND COALESCE(ad_org_id,0) IN (0,?)' : '') + (hasAct ? " AND COALESCE(isactive,'Y')='Y'" : '') +
    ' ORDER BY ad_client_id DESC' + (hasOrg ? ', COALESCE(ad_org_id,0) DESC' : ''), hasOrg ? [name, num(client) || 0, num(org) || 0] : [name, num(client) || 0]);
  return r && r.value != null ? String(r.value) : dflt;
}
// MSysConfig.getBooleanValue (MSysConfig.java:452-464): empty ⇒ default; Y/N (any case); else Boolean.valueOf (only "true" is true)
function sysConfigBool(db, name, dflt, client, org) {
  var v = sysConfig(db, name, null, client, org);
  if (v == null || v === '') return dflt;
  if (/^y$/i.test(v)) return true; if (/^n$/i.test(v)) return false;
  return /^true$/i.test(v);
}
// §72 (F36) DocumentEngine.processIt → postIt after a completion when CLIENT_ACCOUNTING='I' (DocumentEngine.java:350-370 @{u}) → DocumentEngine.postImmediate only for a table WITH a Posted column (:1441-1442)
// → DefaultDocumentFactory.getDocument builds the class name Doc_<TableName without '_'> (prefix 'X_' dropped, :87-95) and THROWS AdempiereUserError "Doc Class invalid" when the class
// does not exist (:97-107) ⇒ the completion itself fails. The core accounting classes (org.idempiere.acct.doc, @{u}) are exactly these:
var LEGACY_DOC_CLASSES = ['AllocationHdr', 'AssetAddition', 'AssetDisposed', 'AssetReval', 'AssetTransfer', 'BankStatement', 'Cash', 'DepreciationEntry', 'GLJournal', 'InOut', 'Inventory', 'Invoice',
  'MatchInv', 'MatchPO', 'Movement', 'Order', 'Payment', 'Production', 'ProjectIssue', 'Requisition'];
function legacyDocClassOf(tableName) { var t = String(tableName); return 'Doc_' + (t.indexOf('_') === 1 ? t.substring(2) : t).replace(/_/g, ''); }
// → the refusal text legacy gives, or null. hasPostedColumn = the table's AD_Column 'Posted' exists (SQLite dictionary).
function immediatePostingRefusal(db, tableName, hasPostedColumn, client) {
  if (!hasPostedColumn || !isClientAccountingImmediate(db, client)) return null;
  var cls = legacyDocClassOf(tableName);
  return LEGACY_DOC_CLASSES.indexOf(cls.substring(4)) >= 0 ? null : 'Doc Class invalid: ' + cls;
}
// MClient.isClientAccountingImmediate (MClient.java:1094-1100 @{u}): CLIENT_ACCOUNTING equalsIgnoreCase 'I', default 'Q'
function isClientAccountingImmediate(db, client) { return /^i$/i.test(sysConfig(db, 'CLIENT_ACCOUNTING', 'Q', client, 0)); }
// Fact.balanceAccounting (Fact.java:548-615) — currency-balancing branch: diff = DR−CR; a line on C_AcctSchema_GL.CurrencyBalancing_Acct, CR |diff| when DR exceeds, DR |diff| otherwise,
// with sides switched (negative amount) when the biggest balance-sheet line's source balance is on the same side (:600-610). The "correct the biggest line" branch (no currency
// balancing) is not ported ⇒ absent by name.
function balanceAccounting(db, by, absent, schema, diff) {
  var gl = _hasCol(db, 'c_acctschema_gl', 'usecurrencybalancing') ? getRow(db, 'SELECT usecurrencybalancing AS u, currencybalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
  if (!gl || String(gl.u) !== 'Y') { absent.push('currency correction of the biggest line not ported (Fact.balanceAccounting, diff=' + diff + ')'); return; }
  var R = _R(), acct = R && R.elementOf ? R.elementOf(db, gl.a) : null;
  if (!acct) { absent.push('CurrencyBalancing_Acct unresolved'); return; }
  var bs = null, bsAmt = 0, isBS = function (id) { var e = getRow(db, 'SELECT accounttype FROM c_elementvalue WHERE c_elementvalue_id=?', num(id)); return e && ['A', 'L', 'O'].indexOf(String(e.accounttype)) >= 0; };
  Object.keys(by).forEach(function (k) { var x = by[k], amt = Math.abs(x.dr - x.cr); if (isBS(x.account_id) && amt > bsAmt) { bsAmt = amt; bs = x; } });
  var isDR = diff < 0, d = Math.abs(diff), drAmt = isDR ? d : 0, crAmt = isDR ? 0 : d;
  if (bs && (((bs.dr > bs.cr) && isDR) || (!(bs.dr > bs.cr) && !isDR))) { drAmt = isDR ? 0 : -d; crAmt = isDR ? -d : 0; }   // switchIt
  var k = acct.id; if (!by[k]) by[k] = { account_id: acct.id, value: acct.value, name: acct.name, dr: 0, cr: 0 };
  by[k].dr += drAmt; by[k].cr += crAmt;
}

// ── SALES SHIPMENT (MMS, IsSOTrx=Y) manifest — gap S11 (prompts/SQLiteIDEMPIERE.md §29/§30), EXTRACTED from org.compiere.acct.Doc_InOut.createFacts
// (the "Sales - Shipment" branch, Doc_InOut.java:208-300) + MProduct.getCostingMethod (MProduct.java:1080-1088) + ProductCost:
//   per line (non-reversal): costs = qty × current cost of the product under the schema's costing element;
//   zero cost & stocked ⇒ posting ERROR "No Costs for <product>" (Doc_InOut.java:244-258 — surfaced as `absent`, never invented); zero cost & service ⇒ skip;
//   Dr {Product.Cogs} costs / Cr {Product.Asset} costs.
// Costing method = category's CostingMethod when set, else the schema's (MProduct.getCostingMethod). The cost element is the m_costelement whose
// costingmethod equals it; the price is m_cost.currentcostprice for (product, schema, schema.m_costtype_id, element). NEVER guessed: when any link is
// missing the token is reported absent. Reversals / returns / receipts are NOT this slice (null ⇒ basis none).
function costingMethodOf(db, productId, schema) {
  var m = null;
  if (_hasCol(db, 'm_product_category_acct', 'costingmethod')) {
    var r = getRow(db, 'SELECT a.costingmethod AS cm FROM m_product_category_acct a JOIN m_product p ON p.m_product_category_id=a.m_product_category_id WHERE p.m_product_id=? AND a.c_acctschema_id=?', [num(productId), num(schema)]);
    if (r && r.cm) m = r.cm;
  }
  if (!m) { var as = schemaRow(db, schema); m = as && as.costingmethod ? as.costingmethod : null; }
  return m;
}
function currentCost(db, productId, schema) {
  var cm = costingMethodOf(db, productId, schema), as = schemaRow(db, schema);
  if (!cm || !as) return { price: null, why: 'no-costing-method' };
  var el = getRow(db, 'SELECT m_costelement_id FROM m_costelement WHERE costingmethod=? ORDER BY m_costelement_id LIMIT 1', cm);
  if (!el) return { price: null, why: 'no-cost-element-for-' + cm };
  var c = getRow(db, 'SELECT currentcostprice FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(productId), num(schema), num(as.m_costtype_id), num(el.m_costelement_id)]);
  return c ? { price: Number(c.currentcostprice), method: cm, element: el.m_costelement_id } : { price: null, why: 'no-m_cost-row' };
}
function deriveInOut(db, R, ioId, schema, opt) {
  var hdr = getRow(db, 'SELECT m_inout_id,issotrx,movementtype FROM m_inout WHERE m_inout_id=?', num(ioId));
  if (!hdr) return null;
  if (String(hdr.issotrx) === 'N' && String(hdr.movementtype) === 'V+') return deriveReceipt(db, R, ioId, schema);   // §65.1 (F24): the vendor receipt
  if (!(String(hdr.issotrx) === 'Y' && String(hdr.movementtype) === 'C-')) return null;       // only the sales-shipment class is built
  // Doc_InOut.loadLines (Doc_InOut.java:126-134): lines with no product or MovementQty 0 are not posted (§47, S14c)
  var lines = allRows(db, 'SELECT m_product_id,movementqty FROM m_inoutline WHERE m_inout_id=?', num(ioId)).filter(function (l) { return num(l.m_product_id) && Number(l.movementqty) !== 0; });
  var by = {}, absent = [];
  function add(side, el, amt) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  // REVERSAL shipment (prompts/SQLiteIDEMPIERE.md §33, F4): Doc_InOut.isReversal (Doc_InOut.java:1143-1145: header Reversal_ID AND line ReversalLine_ID) ⇒ each line takes
  // the ORIGINAL line's amounts with Dr/Cr swapped (FactLine.updateReverseLine, FactLine.java:1357-1359, called at Doc_InOut.java:288-296 / 317-325). Original not
  // derivable ⇒ legacy errors "Original Shipment/Receipt not posted yet" ⇒ reported absent, never invented.
  var rev = _hasCol(db, 'm_inout', 'reversal_id') ? getRow(db, 'SELECT reversal_id FROM m_inout WHERE m_inout_id=?', num(ioId)) : null;
  if (rev && num(rev.reversal_id) && _hasCol(db, 'm_inoutline', 'reversalline_id')) {
    var rl = allRows(db, 'SELECT reversalline_id FROM m_inoutline WHERE m_inout_id=?', num(ioId));
    if (rl.length && rl.every(function (x) { return num(x.reversalline_id); })) {
      var orig = deriveInOut(db, R, num(rev.reversal_id), schema, { amountsOnly: true });   // the original's AMOUNTS (legacy reads its posted books); no qty re-check (MCostDetail.java:1482-1485)
      if (!orig || orig.absent.length) { absent.push('Original Shipment/Receipt not posted yet (' + rev.reversal_id + ')'); return { by: by, absent: absent }; }
      Object.keys(orig.by).forEach(function (k) { var a = orig.by[k]; by[k] = { account_id: a.account_id, value: a.value, name: a.name, dr: a.cr, cr: a.dr }; });
      return { by: by, absent: absent };
    }
  }
  // §38 (F6): the Average costed-qty refusal — whole document refused, nothing posted (MCost.java:1919-1930 via MCostDetail.process). Only when the posting db carries
  // m_cost.currentqty (schema patch §37); otherwise unchanged. Reversal shipments skip the check (MCostDetail.java:1482-1485) — they returned above.
  var neg = (opt && opt.amountsOnly) ? null : costQtyRefusal(db, lines);
  if (neg) { absent.push(neg); return { by: by, absent: absent }; }
  lines.forEach(function (l) {
    // IsStocked decides service-vs-item ONLY when the cost is missing; a seed without the column cannot tell, so it is treated as an item and reported (never guessed)
    var prod = _hasCol(db, 'm_product', 'isstocked') ? getRow(db, 'SELECT isstocked FROM m_product WHERE m_product_id=?', num(l.m_product_id)) : null;
    var cc = currentCost(db, l.m_product_id, schema);
    var amt = 0; if (cc.price != null) { var pd0 = _bigDec(cc.price), qd0 = _bigDec(l.movementqty); amt = Number(_rhuB(pd0.n * qd0.n * 100n, 10n ** BigInt(pd0.k + qd0.k))); }   // exact HALF_UP (§56.1; float × could misround a .5 tie)
    if (cc.price == null || amt === 0) {
      if (prod && String(prod.isstocked) === 'N') return;                                      // service: ignored (Doc_InOut.java:257)
      absent.push('No Costs for product ' + l.m_product_id + (cc.why ? ' (' + cc.why + ')' : ''));  // Doc_InOut.java:253 posting error
      return;
    }
    var cogs = el(R.resolve(db, '{Product.Cogs}', num(l.m_product_id), schema));
    var asset = el(R.resolve(db, '{Product.Asset}', num(l.m_product_id), schema));
    if (cogs) add('DR', cogs, amt);
    if (asset) add('CR', asset, amt);
  });
  return { by: by, absent: absent };
}

// ── VENDOR RECEIPT (MMR, IsSOTrx=N, V+) — §65.1 (F24), Doc_InOut.createFacts "Vendor - Receipt" (Doc_InOut.java:676-880) ─────────────────────────────────────
// Average PO / Average Invoice / Last PO costing: costs = order line PriceCost (else PriceActual) × qty in the ORDER currency (:704-787); Dr {Product.Asset} / Cr {BPGroup.NotInvoicedReceipts};
// each fact line converted to the schema currency at the receipt DateAcct, HALF_UP at the schema currency precision (FactLine.convert). Not ported, reported by name: tax-included or
// tax-distributing order lines (:719-783), landed cost allocations (:692-699), Standard/FIFO costing (current cost path :791), services, reversals of a receipt (updateReverseLine).
function _fxConvertCents(db, cents, curFrom, schema, dateAcct, client, org, absent) {
  var as = schemaRow(db, schema); if (!as) { absent.push('schema ' + schema); return null; }
  if (num(curFrom) === num(as.c_currency_id)) return cents;
  var rate = fxRate(db, curFrom, as.c_currency_id, dateAcct, client, org);
  if (rate == null) { absent.push('NoCurrencyConversion ' + curFrom + '->' + as.c_currency_id); return null; }
  var r = _bigDec(rate); return Number(_rhuB(BigInt(cents) * r.n, 10n ** BigInt(r.k)));
}
function _poLineCost(db, ol, absent) {   // order line PriceCost, else PriceActual; tax corrections not ported (named)
  var price = ol.pricecost != null && Number(ol.pricecost) !== 0 ? ol.pricecost : ol.priceactual;
  if (num(ol.c_tax_id)) { var t = getRow(db, 'SELECT rate FROM c_tax WHERE c_tax_id=?', num(ol.c_tax_id)); if (!t) { absent.push('c_tax#' + ol.c_tax_id); return null; } if (Number(t.rate) !== 0) { absent.push('tax-corrected purchase cost not ported (Doc_InOut.java:719-783)'); return null; } }
  return price;
}
function deriveReceipt(db, R, ioId, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_inout WHERE m_inout_id=?', num(ioId));
  var by = {}, absent = [];
  function add(side, el, amt) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  if (num(hdr.reversal_id)) { absent.push('receipt reversal not ported (Doc_InOut.java:826-840 updateReverseLine)'); return { by: by, absent: absent }; }
  var lines = allRows(db, 'SELECT * FROM m_inoutline WHERE m_inout_id=?', num(ioId)).filter(function (l) { return num(l.m_product_id) && Number(l.movementqty) !== 0; });
  lines.forEach(function (l) {
    var cm = costingMethodOf(db, l.m_product_id, schema);
    if (['A', 'I', 'L'].indexOf(cm) < 0) { absent.push('receipt costing method ' + cm + ' not ported'); return; }
    var ol = num(l.c_orderline_id) ? getRow(db, 'SELECT ol.*, o.c_currency_id AS ocur FROM c_orderline ol LEFT JOIN c_order o ON o.c_order_id=ol.c_order_id WHERE ol.c_orderline_id=?', num(l.c_orderline_id)) : null;
    if (!ol) { absent.push('Resubmit - No Costs for ' + l.m_product_id + ' (required order line)'); return; }   // :789-792
    var price = _poLineCost(db, ol, absent); if (price == null) return;
    var pd = _bigDec(price), qd = _bigDec(l.movementqty), src = Number(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k)));
    if (src === 0 && Number(ol.priceactual) !== 0) { absent.push('Resubmit - No Costs for ' + l.m_product_id); return; }
    var cur = ol.c_currency_id != null ? ol.c_currency_id : ol.ocur; if (cur == null) { absent.push('order currency'); return; }
    var amt = _fxConvertCents(db, src, cur, schema, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id, absent); if (amt == null) return;
    var asset = el(R.resolve(db, '{Product.Asset}', num(l.m_product_id), schema));
    var nir = el(R.resolve(db, '{BPGroup.NotInvoicedReceipts}', num(hdr.c_bpartner_id), schema));
    if (asset) add('DR', asset, amt);
    if (nir) add('CR', nir, amt);
  });
  return { by: by, absent: absent };
}
// ── MATCH INVOICE — §65.2 (F25), Doc_MatchInv.createFacts (Doc_MatchInv.java:156-420), receipt-matched purchase case:
// Dr {BPGroup.NotInvoicedReceipts} (BP of the INVOICE, :170-172) = the receipt line's posted amount × (Qty / MovementQty); Cr {Product.InventoryClearing} = the invoice line's posted amount × (Qty / QtyInvoiced)
// (both read back from the posted documents: updateReverseLine :227-283 — here re-derived with the same folds); both legs removed when the accounts are equal and IsPostIfClearingEqual='N' (:362-372).
// An invoice price variance (IPV ≠ 0, :376-380), partial matches (multiplier ≠ 1), services, shipments (MMS) and credit memos are named absent — never posted by guess.
function _receiptLineAmt(db, line, hdr, schema, absent) {
  var ol = num(line.c_orderline_id) ? getRow(db, 'SELECT ol.*, o.c_currency_id AS ocur FROM c_orderline ol LEFT JOIN c_order o ON o.c_order_id=ol.c_order_id WHERE ol.c_orderline_id=?', num(line.c_orderline_id)) : null;
  if (!ol) { absent.push('receipt order line'); return null; }
  var price = _poLineCost(db, ol, absent); if (price == null) return null;
  var pd = _bigDec(price), qd = _bigDec(line.movementqty), src = Number(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k)));
  return _fxConvertCents(db, src, ol.c_currency_id != null ? ol.c_currency_id : ol.ocur, schema, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id, absent);
}
function deriveMatchInv(db, R, id, schema) {
  var mi = getRow(db, 'SELECT * FROM m_matchinv WHERE m_matchinv_id=?', num(id)); if (!mi) return null;
  var by = {}, absent = [];
  function add(side, el, amt) { if (!el) return; var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  if (!num(mi.m_product_id) || Number(mi.qty) === 0) return { by: by, absent: absent };
  var rl = getRow(db, 'SELECT * FROM m_inoutline WHERE m_inoutline_id=?', num(mi.m_inoutline_id)), il = getRow(db, 'SELECT * FROM c_invoiceline WHERE c_invoiceline_id=?', num(mi.c_invoiceline_id));
  if (!rl || !il) { absent.push(!rl ? 'credit-memo / no-receipt MatchInv not ported' : 'invoice line'); return { by: by, absent: absent }; }
  var rh = getRow(db, 'SELECT * FROM m_inout WHERE m_inout_id=?', num(rl.m_inout_id)), ih = getRow(db, 'SELECT * FROM c_invoice WHERE c_invoice_id=?', num(il.c_invoice_id));
  if (String(rh.movementtype) !== 'V+') { absent.push('MatchInv on a shipment not ported'); return { by: by, absent: absent }; }
  if (Number(mi.qty) !== Number(rl.movementqty) || Number(mi.qty) !== Number(il.qtyinvoiced)) { absent.push('partial MatchInv (multiplier) not ported'); return { by: by, absent: absent }; }
  var p = _hasCol(db, 'm_product', 'producttype') ? getRow(db, 'SELECT producttype FROM m_product WHERE m_product_id=?', num(mi.m_product_id)) : null;
  if (!p || p.producttype !== 'I') { absent.push('service MatchInv not ported'); return { by: by, absent: absent }; }
  var drAmt = _receiptLineAmt(db, rl, rh, schema, absent);
  var crAmt = _fxConvertCents(db, cents(il.linenetamt), ih.c_currency_id, schema, ih.dateacct, ih.ad_client_id, ih.ad_org_id, absent);
  if (drAmt == null || crAmt == null) return { by: by, absent: absent };
  var nir = el(R.resolve(db, '{BPGroup.NotInvoicedReceipts}', num(ih.c_bpartner_id), schema)), clr = el(R.resolve(db, '{Product.InventoryClearing}', num(mi.m_product_id), schema));
  if (!nir || !clr) return { by: by, absent: absent };
  var sch = getRow(db, 'SELECT ispostifclearingequal FROM c_acctschema WHERE c_acctschema_id=?', num(schema)) || {};
  if (!(String(sch.ispostifclearingequal) === 'N' && nir.id === clr.id && drAmt === crAmt)) { add('DR', nir, drAmt); add('CR', clr, crAmt); }
  if (drAmt !== crAmt) absent.push('invoice price variance not ported (Doc_MatchInv.java:376-380, ipv=' + (crAmt - drAmt) + ')');
  return { by: by, absent: absent };
}

// MatchPO → Average-PO cost (Doc_MatchPO.createFacts :285-410 + createMatchPOCostDetail :584-660 → MCostDetail.createOrder → process :1560-1576 → MCost.setWeightedAverage MCost.java:1696-1742).
// poCost = order line PriceCost else PriceActual (tax corrections named absent), × rate and HALF_UP at the currency COSTING precision when the order is in another currency;
// amount = Σ (other MatchPOs of the line with a receipt, same DateAcct) + poCost × qty, HALF_UP at the costing precision; weighted average: old = price × curQty / (curQty+qty), new = amt / (curQty+qty)
// (each at scale 12 HALF_UP), sum rounded to 2 × costing precision when longer; CumulatedAmt/Qty and CurrentQty += amt/qty. Returns the NEW m_cost values per schema for the
// Average-PO element only (other elements: named, not ported). Refuses (absent) on AverageCostingNegativeQty / ZeroQty exactly where legacy throws.
function _decStr(v) { return _bigDec(v); }
function _scaleTo(d, k) { return k >= d.k ? d.n * 10n ** BigInt(k - d.k) : _rhuB(d.n, 10n ** BigInt(d.k - k)); }
function _fmtDec(n, k) { var neg = n < 0n, a = neg ? -n : n, t = a.toString().padStart(k + 1, '0'); return (neg ? '-' : '') + (k ? t.slice(0, -k) + '.' + t.slice(-k) : t); }
function costUpdatesForMatchPO(db, matchPOId) {
  var mp = getRow(db, 'SELECT * FROM m_matchpo WHERE m_matchpo_id=?', num(matchPOId)); if (!mp || !num(mp.m_inoutline_id)) return [];
  var ol = getRow(db, 'SELECT ol.*, o.c_currency_id AS ocur, o.ad_client_id AS oclient, o.ad_org_id AS oorg FROM c_orderline ol LEFT JOIN c_order o ON o.c_order_id=ol.c_order_id WHERE ol.c_orderline_id=?', num(mp.c_orderline_id)); if (!ol) return [];
  var io = getRow(db, 'SELECT h.dateacct, h.ad_client_id, h.ad_org_id FROM m_inoutline l JOIN m_inout h ON h.m_inout_id=l.m_inout_id WHERE l.m_inoutline_id=?', num(mp.m_inoutline_id));
  var out = [], absent = [];
  allRows(db, 'SELECT c_acctschema_id AS id, m_costtype_id AS ct, c_currency_id AS cur FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : '') + ' ORDER BY c_acctschema_id', []).forEach(function (sc) {
    if (costingMethodOf(db, mp.m_product_id, sc.id) !== 'A') return;
    var el = getRow(db, "SELECT m_costelement_id FROM m_costelement WHERE costingmethod='A' ORDER BY m_costelement_id LIMIT 1", []); if (!el) return;
    var cp = getRow(db, 'SELECT ' + (_hasCol(db, 'c_currency', 'costingprecision') ? 'costingprecision' : 'NULL') + ' AS p FROM c_currency WHERE c_currency_id=?', num(sc.cur));
    if (!cp || cp.p == null) { absent.push('currency costing precision'); return; }
    var prec = num(cp.p), price = _poLineCost(db, ol, absent); if (price == null) return;
    var po = _decStr(price), cur = ol.c_currency_id != null ? ol.c_currency_id : ol.ocur;
    if (num(cur) !== num(sc.cur)) {   // Doc_MatchPO.java:391-408
      var rate = fxRate(db, cur, sc.cur, io && io.dateacct, ol.oclient || 11, ol.oorg || 0); if (rate == null) { absent.push('PurchaseOrderNotConvertible'); return; }
      var r = _decStr(rate), n = po.n * r.n, k = po.k + r.k; po = k > prec ? { n: _rhuB(n, 10n ** BigInt(k - prec)), k: prec } : { n: n, k: k };
    }
    var qd = _decStr(mp.qty), amtN = po.n * qd.n, amtK = po.k + qd.k;   // poCost × qty (other same-day MatchPOs of the line: none in scope ⇒ named below)
    var others = allRows(db, 'SELECT m_matchpo_id FROM m_matchpo WHERE c_orderline_id=? AND m_matchpo_id<>? AND m_inoutline_id IS NOT NULL', [num(mp.c_orderline_id), num(matchPOId)]);
    if (others.length) { absent.push('partial MatchPO accumulation not ported (Doc_MatchPO.java:596-640)'); return; }
    if (amtK > prec) { amtN = _rhuB(amtN, 10n ** BigInt(amtK - prec)); amtK = prec; }
    var c = getRow(db, 'SELECT * FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(mp.m_product_id), sc.id, sc.ct, num(el.m_costelement_id)]);
    var cq = _decStr(c && c.currentqty != null ? c.currentqty : 0), cpz = _decStr(c && c.currentcostprice != null ? c.currentcostprice : 0);
    var ca = _decStr(c && c.cumulatedamt != null ? c.cumulatedamt : 0), cuq = _decStr(c && c.cumulatedqty != null ? c.cumulatedqty : 0);
    var S = 12, q12 = _scaleTo(qd, S), cq12 = _scaleTo(cq, S), sum = cq12 + q12;
    if (qd.n === 0n && cq.n <= 0n) { absent.push('AverageCostingZeroQty'); return; }
    if (sum < 0n) { absent.push('AverageCostingNegativeQty'); return; }
    var price12 = _scaleTo(cpz, S);
    var newPrice = price12;
    if (sum !== 0n) {
      var oldSum = price12 * cq12;                                   // scale 24
      var oldCost = _rhuB(oldSum, sum);                              // (scale 24) / (scale 12) ⇒ scale 12, HALF_UP
      var amt12 = amtN * 10n ** BigInt(S - amtK);
      var newCost = _rhuB(amt12 * 10n ** 12n, sum);                  // scale 12, HALF_UP
      newPrice = oldCost + newCost;
      if (S > prec * 2) newPrice = _rhuB(newPrice, 10n ** BigInt(S - prec * 2)) * 10n ** BigInt(S - prec * 2);
    }
    var amtS = amtN * 10n ** BigInt(S - amtK);
    out.push({ m_product_id: num(mp.m_product_id), c_acctschema_id: sc.id, m_costtype_id: sc.ct, m_costelement_id: num(el.m_costelement_id),
      currentcostprice: Number(_fmtDec(newPrice, S)), currentqty: Number(_fmtDec(cq12 + q12, S)), cumulatedamt: Number(_fmtDec(_scaleTo(ca, S) + amtS, S)), cumulatedqty: Number(_fmtDec(_scaleTo(cuq, S) + q12, S)) });
  });
  if (absent.length) return [{ absent: absent }];
  return out;
}

// ── §38 (F6) costed quantity — MCostDetail.process (MCostDetail.java:1327-1400) + MCostElement.getCostingMethods (MCostElement.java:148-159) + MCost.setCurrentQty (:1919-1930)
function _costingElements(db) {
  var act = _hasCol(db, 'm_costelement', 'isactive') ? " AND isactive='Y'" : '';
  return allRows(db, "SELECT m_costelement_id AS id, costingmethod AS cm FROM m_costelement WHERE costelementtype='M' AND costingmethod IS NOT NULL AND costingmethod<>''" + act, []);
}
function _isStocked(db, pid) {
  if (!_hasCol(db, 'm_product', 'isstocked')) return true;
  var r = getRow(db, 'SELECT isstocked FROM m_product WHERE m_product_id=?', num(pid));
  return !r || String(r.isstocked) !== 'N';
}
function _curQty(db, pid, sch, ct, el) {
  var r = getRow(db, 'SELECT currentqty FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(pid), num(sch), num(ct), num(el)]);
  return r && r.currentqty != null ? Number(r.currentqty) : 0;     // MCost.get creates a missing row at 0
}
// lines = [{m_product_id, movementqty}] of a NON-reversal sales shipment; returns the refusal text or null
function costQtyRefusal(db, lines) {
  if (!_hasCol(db, 'm_cost', 'currentqty')) return null;
  var els = _costingElements(db).filter(function (e) { return e.cm === 'A' || e.cm === 'I'; });
  var schemas = allRows(db, 'SELECT c_acctschema_id AS id, m_costtype_id AS ct FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : '') + ' ORDER BY c_acctschema_id', []);
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i]; if (!_isStocked(db, l.m_product_id)) continue;
    for (var j = 0; j < schemas.length; j++) for (var k = 0; k < els.length; k++) {
      var cur = _curQty(db, l.m_product_id, schemas[j].id, schemas[j].ct, els[k].id), nq = cur - Number(l.movementqty);
      if (nq < 0) return 'AverageCostingNegativeQty: Product=' + l.m_product_id + ', Current Qty=' + cur + ', New Current Qty=' + nq + ', CostElement=' + els[k].id + ', Schema=' + schemas[j].id;
    }
  }
  return null;
}
// the CurrentQty deltas a committing host applies after the shipment posted (legacy: same transaction). Shipment C- ⇒ −qty, reversal (qty already negated) ⇒ +qty.
// §59 (F18): the same CurrentQty upkeep for a Physical Inventory line (cost detail qty = QtyCount − QtyBook, every active costing element × schema)
// §67.1 (F31) MCostDetail.process (MCostDetail.java:1700-1765), Average PO / Average Invoice element: a stock-INCREASING detail (qty > 0) goes through MCost.setWeightedAverage(amt, qty)
// (MCost.java:1696-1742 — the F24 arithmetic) so the PRICE moves; a decrease changes CurrentQty only. A customer-shipment reversal restores the cumulated qty/amt (no accumulation) — the host keeps them.
// Returned: the NEW CurrentCostPrice next to the qty delta; `state` chains several lines of one call.
function _costingPrecision(db, schema) {
  var as = schemaRow(db, schema); if (!as) return null;
  var r = _hasCol(db, 'c_currency', 'costingprecision') ? getRow(db, 'SELECT costingprecision AS p FROM c_currency WHERE c_currency_id=?', num(as.c_currency_id)) : null;
  return r && r.p != null ? num(r.p) : null;
}
function _wavg(price, curQty, amtDec, qtyDec, prec) {   // all decimal strings/numbers; returns the new price as a Number (2 × prec decimals max)
  var S = 12, cq = _scaleTo(_bigDec(curQty), S), q = _scaleTo(_bigDec(qtyDec), S), sum = cq + q;
  if (sum === 0n) return Number(price);
  var oldCost = _rhuB(_scaleTo(_bigDec(price), S) * cq, sum), newCost = _rhuB(_scaleTo(_bigDec(amtDec), S) * 10n ** 12n, sum), p = oldCost + newCost;
  if (S > prec * 2) p = _rhuB(p, 10n ** BigInt(S - prec * 2)) * 10n ** BigInt(S - prec * 2);
  return Number(_fmtDec(p, S));
}
function _costRow(db, state, pid, sch, ct, el) {
  var k = [pid, sch, ct, el].join('|');
  if (!state[k]) { var r = getRow(db, 'SELECT currentqty, currentcostprice FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(pid), num(sch), num(ct), num(el)]);
    state[k] = { qty: r && r.currentqty != null ? Number(r.currentqty) : 0, price: r && r.currentcostprice != null ? String(r.currentcostprice) : '0' }; }
  return state[k];
}
function _avgUpdate(db, state, out, pid, sc, e, delta, amtDecOf) {
  var u = { m_product_id: num(pid), c_acctschema_id: sc.id, m_costtype_id: sc.ct, m_costelement_id: e.id, delta: delta };
  var c = _costRow(db, state, pid, sc.id, sc.ct, e.id);
  if (delta > 0 && (e.cm === 'A' || e.cm === 'I')) {
    var prec = _costingPrecision(db, sc.id), amt = prec == null ? null : amtDecOf(c, prec);
    if (amt != null) { u.currentcostprice = _wavg(c.price, c.qty, amt, delta, prec); c.price = String(u.currentcostprice); }
  }
  c.qty += delta;
  out.push(u);
}
// §71 (F35) MCost.getCurrentCost (MCost.java:286-330 @{u}): current cost × qty, HALF_UP at the schema COSTING precision — decimal string, null without a cost (the host's MCost.getCost)
function costAt(db, productId, qty, schema) {
  var cc = currentCost(db, productId, schema), prec = _costingPrecision(db, schema);
  if (cc.price == null || prec == null || Number(cc.price) === 0) return null;
  var pd = _bigDec(cc.price), qd = _bigDec(qty);
  return _fmtDec(_rhuB(pd.n * qd.n * 10n ** BigInt(prec), 10n ** BigInt(pd.k + qd.k)), prec);
}
function costQtyUpdatesFor(db, table, id) {
  if (table === 'M_InOut') return costQtyUpdates(db, id);
  if (table === 'C_ProjectIssue' && _hasCol(db, 'm_cost', 'currentqty')) {   // §71 (F35): MCostDetail.createProjectIssue, qty −MovementQty ⇒ a decrease changes only CurrentQty (MCostDetail.process)
    var els0 = _costingElements(db), sch0 = allRows(db, 'SELECT c_acctschema_id AS id, m_costtype_id AS ct FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : '') + ' ORDER BY c_acctschema_id', []), out0 = [], st0 = {};
    var pi = getRow(db, 'SELECT m_product_id, movementqty FROM c_projectissue WHERE c_projectissue_id=?', num(id));
    if (pi && Number(pi.movementqty) && _isStocked(db, pi.m_product_id)) sch0.forEach(function (sc) { els0.forEach(function (e) { _avgUpdate(db, st0, out0, pi.m_product_id, sc, e, -Number(pi.movementqty), function () { return null; }); }); });
    return out0;
  }
  if (table !== 'M_Inventory' || !_hasCol(db, 'm_cost', 'currentqty')) return [];
  var els = _costingElements(db), schemas = allRows(db, 'SELECT c_acctschema_id AS id, m_costtype_id AS ct FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : '') + ' ORDER BY c_acctschema_id', []), out = [], state = {};
  allRows(db, 'SELECT m_product_id, qtybook, qtycount FROM m_inventoryline WHERE m_inventory_id=?', num(id)).forEach(function (l) {
    var d = Number(l.qtycount) - Number(l.qtybook); if (!d || !_isStocked(db, l.m_product_id)) return;
    // inventory gain: the cost detail amount = qty × current cost, HALF_UP at the costing precision (pilot history: 2 × 2.29763318 ⇒ 4.5953)
    schemas.forEach(function (sc) { els.forEach(function (e) { _avgUpdate(db, state, out, l.m_product_id, sc, e, d, function (c, prec) { var pr = _bigDec(c.price), q = _bigDec(d); return _fmtDec(_rhuB(pr.n * q.n * 10n ** BigInt(prec), 10n ** BigInt(pr.k + q.k)), prec); }); }); });
  });
  return out;
}
function costQtyUpdates(db, ioId) {
  if (!_hasCol(db, 'm_cost', 'currentqty')) return [];
  var lines = allRows(db, 'SELECT m_product_id, movementqty FROM m_inoutline WHERE m_inout_id=?', num(ioId));
  var els = _costingElements(db), schemas = allRows(db, 'SELECT c_acctschema_id AS id, m_costtype_id AS ct FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : '') + ' ORDER BY c_acctschema_id', []), out = [], state = {};
  lines.forEach(function (l) {
    if (!_isStocked(db, l.m_product_id)) return;
    schemas.forEach(function (sc) { els.forEach(function (e) {
      // a reversal line (qty already negated ⇒ +qty) re-adds at its POSTED amount = the original line's cost amount in this schema, cent-rounded (Doc_InOut reversal facts; pilot history 1 × 2.2976 ⇒ 2.30)
      _avgUpdate(db, state, out, l.m_product_id, sc, e, -Number(l.movementqty), function () { var cc = currentCost(db, l.m_product_id, sc.id); if (cc.price == null) return null;
        var pd = _bigDec(cc.price), qd = _bigDec(Math.abs(Number(l.movementqty))); return _fmtDec(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k)), 2); });
    }); });
  });
  return out;
}

// ── PAYMENT + ALLOCATION — §57, F16 ─────────────────────────────────────────────────────────────────────────────────────────────
// derivePayment = Doc_Payment.createFacts (Doc_Payment.java:110-170): ARR DR {Bank.InTransit} / CR {Bank.UnallocatedCash}; APP DR {Bank.PaymentSelect} / CR {Bank.InTransit};
// tender 'X' with sysconfig CASH_AS_PAYMENT='N' ⇒ no facts (:114-119; default true). Charge / prepayment branches not ported ⇒ absent.
function derivePayment(db, R, payId, schema) {
  var p = getRow(db, 'SELECT c_payment_id, c_bankaccount_id, isreceipt, payamt, tendertype' + (_hasCol(db, 'c_payment', 'c_charge_id') ? ', c_charge_id' : '') + (_hasCol(db, 'c_payment', 'isprepayment') ? ', isprepayment' : '') + ' FROM c_payment WHERE c_payment_id=?', num(payId));
  if (!p) return null;
  var by = {}, absent = [];
  function add(side, el, amt) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  if (String(p.tendertype) === 'X' && !sysConfigBool(db, 'CASH_AS_PAYMENT', true, _clientOf(db, 'c_payment', payId), 0)) return { by: by, absent: absent };   // Doc_Payment.java:114 via the mirrored sysconfig (§68)
  if (num(p.c_charge_id)) { absent.push('payment charge not ported'); return { by: by, absent: absent }; }
  if (String(p.isprepayment) === 'Y') { absent.push('prepayment not ported'); return { by: by, absent: absent }; }
  var amt = cents(p.payamt);
  if (String(p.isreceipt) !== 'N') { var a = el(R.resolve(db, '{Bank.InTransit}', num(p.c_bankaccount_id), schema)), b = el(R.resolve(db, '{Bank.UnallocatedCash}', num(p.c_bankaccount_id), schema)); if (a) add('DR', a, amt); if (b) add('CR', b, amt); }
  else { var x = el(R.resolve(db, '{Bank.PaymentSelect}', num(p.c_bankaccount_id), schema)), y = el(R.resolve(db, '{Bank.InTransit}', num(p.c_bankaccount_id), schema)); if (x) add('DR', x, amt); if (y) add('CR', y, amt); }
  convertToSchema(db, by, absent, payId, schema, 'c_payment');
  return { by: by, absent: absent };
}
// deriveAllocation = Doc_AllocationHdr.createFacts, SO-invoice branch (Doc_AllocationHdr.java:236-363 + Doc_AllocationTax; the fold proven against captured books in
// scripts/poc_alloc_post.js, now in the product): per line allocationSource = amount + discount + write-off;
//   DR clearing = {Bank.UnallocatedCash} (payment's bank account) or {CashBook.CashTransfer} (cash line) = amount — skipped when !IsPostIfClearingEqual and clearing == receivable (FR-1840016);
//   DR {BPGroup.PayDiscount} discount, DR {BPGroup.WriteOff} write-off, CR {BPartner.Receivable} allocationSource;
//   TaxCorrectionType B/D/W ⇒ per invoice tax: DR {Tax.Due} / CR discount|write-off account, amount = round(tax × corr / invoice total) (calcAmount, 10dp then 2dp ≡ exact rounding).
// The invoice tax base is the invoice's OWN tax rows (SQLite books are derived, not stored). AP invoices, realized gain/loss (rate differs between invoice and allocation) ⇒ absent by name.
// §65.3 (F26) Doc_AllocationHdr purchase-invoice branch (Doc_AllocationHdr.java:381-466), accrual: allocation source = −(Amount + Discount + WriteOff) (the AP line is negative, :409);
// Dr {Vendor.V_Liability} source; Cr discount / write-off (−amounts); Cr the payment account −Amount — getPaymentAcct (:728-783): AP Payment doctype ⇒ {Bank.PaymentSelect}, else {Bank.UnallocatedCash};
// a charge or prepayment payment, cash-journal lines, cash-based accounting and the discount-revenue account are named absent. Clearing-equal (payment account = liability, IsPostIfClearingEqual='N') ⇒ only discount + write-off (:397-404).
function _apAllocLine(db, R, l, schema, pice, add, el, absent) {
  var amount = cents(l.amount), disc = cents(l.discountamt), wo = cents(l.writeoffamt), src = -(amount + disc + wo);
  var liab = el(R.resolve(db, '{Vendor.V_Liability}', num(l.c_bpartner_id), schema)), pay = null;
  if (num(l.c_payment_id)) {
    var p = getRow(db, 'SELECT p.c_bankaccount_id' + (_hasCol(db, 'c_payment', 'c_charge_id') ? ', p.c_charge_id' : '') + (_hasCol(db, 'c_payment', 'isprepayment') ? ', p.isprepayment' : '') + ', d.docbasetype AS dbt FROM c_payment p LEFT JOIN c_doctype d ON d.c_doctype_id=p.c_doctype_id WHERE p.c_payment_id=?', num(l.c_payment_id));
    if (!p) { absent.push('payment#' + l.c_payment_id); return; }
    if (num(p.c_charge_id) || String(p.isprepayment) === 'Y') { absent.push('AP allocation with a charge/prepayment payment not ported'); return; }
    pay = el(R.resolve(db, p.dbt === 'APP' ? '{Bank.PaymentSelect}' : '{Bank.UnallocatedCash}', num(p.c_bankaccount_id), schema));
  } else if (num(l.c_cashline_id)) { absent.push('AP cash-journal allocation not ported'); return; }
  if (disc) { absent.push('AP discount revenue account not ported'); return; }
  var clearing = true;
  if (!pice && pay && liab && pay.id === liab.id) { src = -(disc + wo); clearing = false; }
  add('DR', liab, src);
  if (wo) add('CR', el(R.resolve(db, '{BPGroup.WriteOff}', num(l.c_bpartner_id), schema)), -wo);
  if (clearing && num(l.c_payment_id)) add('CR', pay, -amount);
}
function _clientOf(db, table, id) { return _hasCol(db, table, 'ad_client_id') ? num((getRow(db, 'SELECT ad_client_id AS c FROM ' + table + ' WHERE ' + table + '_id=?', num(id)) || {}).c) || 0 : 0; }
// §68 (F32): ref.cashJournalSameTrx = the cash journal of a cash line is created in the SAME transaction that completes it (one composite / one op-group). Legacy
// Doc_AllocationHdr.getCashAcct reads the cash book OUTSIDE the transaction (DB.getSQLValue(null, …), Doc_AllocationHdr.java:732-745 @{u}); the allocation is posted INSIDE that
// transaction only when CLIENT_ACCOUNTING='I' (DocumentEngine.java:350-370) ⇒ NONE ⇒ no clearing leg (Fact.createLine null account, Fact.java:116-122), then Doc.post balanceSource
// (same currency: SuspenseBalancing, Fact.java:298-322) or Doc_AllocationHdr.balanceAccounting (foreign schema). Measured: CASH1 (same trx) vs CASH1b (saved first) on the pilot, spec §68.
function deriveAllocation(db, R, hdrId, schema, ref) {
  var lines = allRows(db, 'SELECT * FROM c_allocationline WHERE c_allocationhdr_id=? ORDER BY c_allocationline_id', num(hdrId));
  if (!lines.length) return null;
  var cashNone = !!(ref && ref.cashJournalSameTrx) && isClientAccountingImmediate(db, _clientOf(db, 'c_allocationhdr', hdrId)), noCashAcct = false;
  var sch = getRow(db, 'SELECT taxcorrectiontype, ispostifclearingequal FROM c_acctschema WHERE c_acctschema_id=?', num(schema)) || {};
  var tcD = sch.taxcorrectiontype === 'B' || sch.taxcorrectiontype === 'D', tcW = sch.taxcorrectiontype === 'B' || sch.taxcorrectiontype === 'W', pice = sch.ispostifclearingequal === 'Y';
  var by = {}, absent = [];
  function add(side, el, amt) { if (!el || amt === 0) return; var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  lines.forEach(function (l) {
    var inv = num(l.c_invoice_id) ? getRow(db, 'SELECT c_invoice_id, issotrx, grandtotal FROM c_invoice WHERE c_invoice_id=?', num(l.c_invoice_id)) : null;
    if (inv && String(inv.issotrx) === 'N') { _apAllocLine(db, R, l, schema, pice, add, el, absent); return; }   // §65.3 (F26)
    var amount = cents(l.amount), disc = cents(l.discountamt), wo = cents(l.writeoffamt), src = amount + disc + wo;
    var receivable = el(R.resolve(db, '{BPartner.Receivable}', num(l.c_bpartner_id), schema));
    var clearing = null;
    if (num(l.c_payment_id)) { var p = getRow(db, 'SELECT c_bankaccount_id FROM c_payment WHERE c_payment_id=?', num(l.c_payment_id)); clearing = p ? el(R.resolve(db, '{Bank.UnallocatedCash}', num(p.c_bankaccount_id), schema)) : null; }
    else if (num(l.c_cashline_id) && cashNone) noCashAcct = true;   // §68 (F32): getCashAcct NONE for C_CashLine_ID (server log line), clearing stays null
    else if (num(l.c_cashline_id)) { var cl = (_hasCol(db, 'c_cash', 'c_cashbook_id') ? getRow(db, 'SELECT h.c_cashbook_id AS c_cashbook_id FROM c_cashline c JOIN c_cash h ON h.c_cash_id=c.c_cash_id WHERE c.c_cashline_id=?', num(l.c_cashline_id)) : null) || (_hasCol(db, 'c_cashline', 'c_cashbook_id') ? getRow(db, 'SELECT c_cashbook_id FROM c_cashline WHERE c_cashline_id=?', num(l.c_cashline_id)) : null); /* the cash JOURNAL's cash book */ clearing = cl ? el(R.resolve(db, '{CashBook.CashTransfer}', num(cl.c_cashbook_id), schema)) : null; }
    if (!pice && clearing && receivable && clearing.id === receivable.id) src = disc + wo; else add('DR', clearing, amount);
    if (disc) add('DR', el(R.resolve(db, '{BPGroup.PayDiscount}', num(l.c_bpartner_id), schema)), disc);
    if (wo) add('DR', el(R.resolve(db, '{BPGroup.WriteOff}', num(l.c_bpartner_id), schema)), wo);
    add('CR', receivable, src);
    if (inv && ((tcD && disc) || (tcW && wo))) {
      var total = cents(inv.grandtotal), taxes = allRows(db, 'SELECT c_tax_id, taxamt FROM c_invoicetax WHERE c_invoice_id=?', num(inv.c_invoice_id));
      taxes.forEach(function (t) {
        var tax = Math.abs(cents(t.taxamt)); if (!tax || !total) return;
        var tacct = el(R.resolve(db, '{Tax.Due}', num(t.c_tax_id), schema));
        var corr = function (x) { return Number(_rhuB(BigInt(tax) * BigInt(x), BigInt(Math.abs(total)))); };
        if (tcD && disc) { var a = corr(disc); add('DR', tacct, a); add('CR', el(R.resolve(db, '{BPGroup.PayDiscount}', num(l.c_bpartner_id), schema)), a); }
        if (tcW && wo) { var b = corr(wo); add('DR', tacct, b); add('CR', el(R.resolve(db, '{BPGroup.WriteOff}', num(l.c_bpartner_id), schema)), b); }
      });
    }
  });
  if (noCashAcct) {   // §68 (F32): the source is unbalanced by the missing clearing leg
    var bal = 0; Object.keys(by).forEach(function (k) { bal += by[k].dr - by[k].cr; });
    var hc = _hasCol(db, 'c_allocationhdr', 'c_currency_id') ? getRow(db, 'SELECT c_currency_id FROM c_allocationhdr WHERE c_allocationhdr_id=?', num(hdrId)) : null, scc = schemaRow(db, schema);
    var foreign = hc && hc.c_currency_id != null && scc && scc.c_currency_id != null && num(hc.c_currency_id) !== num(scc.c_currency_id);
    if (bal !== 0 && !foreign) {   // Doc.post → Fact.balanceSource (single-currency fact; multi-currency docs are balanced by definition, Fact.java:246-263)
      var gl = _hasCol(db, 'c_acctschema_gl', 'usesuspensebalancing') ? getRow(db, 'SELECT usesuspensebalancing AS u, suspensebalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
      var sus = gl && String(gl.u) === 'Y' && R.elementOf ? R.elementOf(db, gl.a) : null;
      if (!gl || String(gl.u) !== 'Y') absent.push('NotBalanced (no suspense balancing, Doc.java:852-856)');
      else if (!sus) absent.push('SuspenseBalancing_Acct');
      else add(bal < 0 ? 'DR' : 'CR', { id: sus.id, value: sus.value, name: sus.name }, Math.abs(bal));
    }
    convertToSchema(db, by, absent, hdrId, schema, 'c_allocationhdr', { allocBalance: foreign });
    return { by: by, absent: absent };
  }
  convertToSchema(db, by, absent, hdrId, schema, 'c_allocationhdr');
  return { by: by, absent: absent };
}

// ── INVENTORY MOVE (M_Movement) — §56, F15. Port of Doc_Movement.createFacts (Doc_Movement.java:128-232) + Fact.balanceSegments (Fact.java:405-480);
// the same fold was proven against the seed's captured books in scripts/poc_movement.js (W-FOLD-MOVEMENT, schema 101) and poc_movement_fx.js (schema 200000).
//   per line: costs = round(qty × current cost) (cost element per the costing method, full-precision cost, line rounded); CR {Product.Asset} at the FROM-locator org, DR {Product.Asset} at the TO-locator org;
//   zero cost ⇒ no line (createLine returns null). Organization segment balanced (C_AcctSchema_Element OO IsBalanced) ⇒ per org: credit balance ⇒ DR IntercompanyDueFrom, debit balance ⇒ CR IntercompanyDueTo.
//   Missing config ⇒ reported absent, never invented. Reversals / batch-lot / org costing level not ported (stated, §56.1).
function _orgOfLocator(db, loc) {
  var r = getRow(db, 'SELECT w.ad_org_id AS org FROM m_locator l JOIN m_warehouse w ON w.m_warehouse_id=l.m_warehouse_id WHERE l.m_locator_id=?', num(loc));
  return r ? num(r.org) : null;
}
function deriveMovement(db, R, movId, schema) {
  var lines = allRows(db, 'SELECT m_product_id,movementqty,m_locator_id,m_locatorto_id FROM m_movementline WHERE m_movement_id=?', num(movId));
  if (!lines.length && !getRow(db, 'SELECT m_movement_id FROM m_movement WHERE m_movement_id=?', num(movId))) return null;
  var by = {}, absent = [], orgBal = {};
  function add(side, el, amt, org) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += amt; else by[k].cr += amt; orgBal[org] = (orgBal[org] || 0) + (side === 'DR' ? amt : -amt); }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  lines.forEach(function (l) {
    if (Number(l.movementqty) === 0) return;
    var cc = currentCost(db, l.m_product_id, schema);
    if (cc.price == null) { absent.push('No cost for product ' + l.m_product_id + (cc.why ? ' (' + cc.why + ')' : '')); return; }
    var pd = _bigDec(cc.price), qd = _bigDec(l.movementqty);                       // exact decimal: cost carried at full precision, LINE rounded HALF_UP (poc_movement_fx rule)
    var amt = Number(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k)));
    if (amt === 0) return;
    var asset = el(R.resolve(db, '{Product.Asset}', num(l.m_product_id), schema)); if (!asset) return;
    var fromOrg = _orgOfLocator(db, l.m_locator_id), toOrg = _orgOfLocator(db, l.m_locatorto_id);
    if (fromOrg == null || toOrg == null) { absent.push('locator org unknown'); return; }
    // Fact.createLine single-amount form (Fact.java:206-212): from-line Amt = −costs, to-line Amt = +costs; negative ⇒ CREDIT side as the absolute value
    var single = function (a, org) { if (a < 0) add('CR', asset, -a, org); else if (a > 0) add('DR', asset, a, org); };
    single(-amt, fromOrg);
    single(amt, toOrg);
  });
  var orgs = Object.keys(orgBal).filter(function (o) { return orgBal[o] !== 0; });
  if (orgs.length) {
    var bal = _hasCol(db, 'c_acctschema_element', 'isbalanced') ? getRow(db, "SELECT isbalanced FROM c_acctschema_element WHERE c_acctschema_id=? AND elementtype='OO'", num(schema)) : null;
    if (!bal) absent.push('org segment balancing config absent (c_acctschema_element)');
    else if (String(bal.isbalanced) === 'Y') {
      var gl = getRow(db, 'SELECT intercompanydueto_acct AS dt, intercompanyduefrom_acct AS df FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema));
      var dueTo = gl && R.elementOf ? R.elementOf(db, gl.dt) : null, dueFrom = gl && R.elementOf ? R.elementOf(db, gl.df) : null;
      if (!dueTo || !dueFrom) absent.push('intercompany Due-To/Due-From accounts absent');
      else orgs.forEach(function (o) {
        var b = orgBal[o];
        if (b < 0) add('DR', { id: dueFrom.id, value: dueFrom.value, name: dueFrom.name }, -b, o);   // Fact.java: balance < 0 ⇒ DueFrom DR
        else add('CR', { id: dueTo.id, value: dueTo.value, name: dueTo.name }, b, o);              // balance > 0 ⇒ DueTo CR
      });
    }
  }
  return { by: by, absent: absent };
}

// the invoice an order generated — linked via the order line (NON-INVENT lineage; poc_fold_complete:75).
function invoiceForOrder(db, oid) {
  var r = getRow(db, 'SELECT DISTINCT il.c_invoice_id AS id FROM c_invoiceline il JOIN c_orderline ol ON ol.c_orderline_id=il.c_orderline_id WHERE ol.c_order_id=?', num(oid));
  return r ? r.id : null;
}

// projected manifest for a DRAFT order (no invoice yet) — SAME tokens, off the ORDER rows. Equals the
// invoice manifest when qtyinvoiced==qtyordered; for a true draft it is a PROJECTION (no fact_acct oracle).
function deriveOrder(db, R, oid, schema) {
  var hdr = getRow(db, 'SELECT c_order_id,c_bpartner_id,grandtotal FROM c_order WHERE c_order_id=?', num(oid));
  if (!hdr) return null;
  var lines = allRows(db, 'SELECT m_product_id,linenetamt FROM c_orderline WHERE c_order_id=?', num(oid));
  var taxes = [];
  try { taxes = allRows(db, 'SELECT c_tax_id,taxamt FROM c_ordertax WHERE c_order_id=?', num(oid)); } catch (e) { taxes = []; }
  var by = {}, absent = [];
  function add(side, el, amt) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += cents(amt); else by[k].cr += cents(amt); }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  var rcv = el(R.resolve(db, '{BPartner.Receivable}', num(hdr.c_bpartner_id), schema));
  if (rcv) add('DR', rcv, hdr.grandtotal);
  lines.forEach(function (l) { var e = el(R.resolve(db, '{Product.Revenue}', num(l.m_product_id), schema)); if (e) add('CR', e, l.linenetamt); });
  taxes.forEach(function (t) { var e = el(R.resolve(db, '{Tax.Due}', num(t.c_tax_id), schema)); if (e) add('CR', e, t.taxamt); });
  return { by: by, absent: absent };
}

// ── B-3 0-seed manifests (W-POST-B3 §W-3, prompts/FABLE5_B3_POSTING_ORACLE.md) ──────────────────────
// EXTRACTED from the org.compiere.acct posters (per-line citations below); oracle = the REAL compiled
// posters driven on a scratch clone by scripts/generate_post_oracle.sh → build/erp/oracle/
// post_b3_fixture.json. Accounts here are C_ValidCombination ids from per-asset/project acct config
// rows (not {Master.Role} tokens), resolved to the natural element via c_validcombination — the same
// hop the posters make (MAccount.get). NEVER invents: every id/amount is a captured row.

// combination -> element account id (c_validcombination.account_id)
function vcAcct(db, combo) {
  if (combo == null || num(combo) === 0) return null;
  var r = getRow(db, 'SELECT account_id FROM c_validcombination WHERE c_validcombination_id=?', num(combo));
  return r ? num(r.account_id) : null;
}
// element shape for the fold; c_elementvalue (value/name) is optional in the handle (fixture DBs)
function elOf(db, accountId, absent, token) {
  if (accountId == null) { absent.push(token); return null; }
  var e = null;
  try { e = getRow(db, 'SELECT c_elementvalue_id AS id, value, name FROM c_elementvalue WHERE c_elementvalue_id=?', accountId); } catch (err) { e = null; }
  return e || { id: accountId, value: '', name: '' };
}
// MAssetAcct.forA_Asset_ID:161-186 — acct row valid at dateAcct (ValidFrom<=date, ORDER BY ValidFrom
// DESC NULLS LAST). The transfer's completeIt creates a NEW row with ValidFrom=its DateAcct — this
// time-slice is what keeps pre-transfer documents derivable (order-dependence solved by data).
function assetAcctFor(db, assetId, schema, dateAcct) {
  return getRow(db,
    "SELECT * FROM a_asset_acct WHERE a_asset_id=? AND c_acctschema_id=? AND postingtype='A'" +
    " AND (validfrom IS NULL OR validfrom='' OR validfrom<=?)" +
    " ORDER BY (validfrom IS NULL OR validfrom='') ASC, validfrom DESC LIMIT 1",
    [num(assetId), num(schema), String(dateAcct || '9999-12-31')]);
}
// MConversionRate.getRate:243-252 VERBATIM shape (default Spot type): date BETWEEN ValidFrom AND
// ValidTo, IsActive='Y' (:251 — THE discriminator in this seed: the 0.8006 row is the SAME client 11
// but INACTIVE; the B-3 run-8 "tenant-vs-system" reading was wrong, corrected 2026-07-18),
// client/org-scoped, ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ValidFrom DESC.
function fxRate(db, curFrom, curTo, dateAcct, clientId, orgId) {
  if (num(curFrom) === num(curTo)) return 1;
  var r = getRow(db,
    "SELECT cr.multiplyrate AS rate FROM c_conversion_rate cr JOIN c_conversiontype ct" +
    " ON ct.c_conversiontype_id=cr.c_conversiontype_id AND ct.isdefault='Y'" +
    " WHERE cr.c_currency_id=? AND cr.c_currency_id_to=? AND ? BETWEEN cr.validfrom AND cr.validto" +
    " AND cr.isactive='Y' AND cr.ad_client_id IN (0,?) AND cr.ad_org_id IN (0,?)" +
    " ORDER BY cr.ad_client_id DESC, cr.ad_org_id DESC, cr.validfrom DESC LIMIT 1",
    [num(curFrom), num(curTo), String(dateAcct || '9999-12-31'), num(clientId || 0), num(orgId || 0)]);
  return r ? Number(r.rate) : null;
}
function schemaRow(db, schema) { return getRow(db, 'SELECT * FROM c_acctschema WHERE c_acctschema_id=?', num(schema)); }

function b3New() {
  var d = { by: {}, absent: [] };
  d.add = function (side, el, amtCents) {
    var k = el.id;
    if (!d.by[k]) d.by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 };
    if (side === 'DR') d.by[k].dr += amtCents; else d.by[k].cr += amtCents;
  };
  return d;
}

// Doc_AssetAddition.createFacts:60-93 — gate A_SourceType=IMP | A_CapvsExp=Exp → EMPTY facts (the
// config-gated zero); else DR a_asset_acct.A_Asset_Acct / CR getP_Asset_Acct, amt=AssetSourceAmt in
// DOC currency (getC_Currency_ID) → converted per schema (the ONLY B-3 poster that posts doc-currency).
function deriveAssetAddition(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_addition WHERE a_asset_addition_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (hdr.a_sourcetype === 'IMP' || hdr.a_capvsexp === 'Exp') return d;   // zero-by-config, Doc_AssetAddition:67-72
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  var as = schemaRow(db, schema);
  var rate = fxRate(db, hdr.c_currency_id, as ? as.c_currency_id : hdr.c_currency_id, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id);
  if (rate == null) { d.absent.push('fxrate#' + hdr.c_currency_id + '->' + (as && as.c_currency_id)); return d; }
  var amt = Math.round(cents(hdr.assetsourceamt) * rate);
  var drEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  if (drEl) d.add('DR', drEl, amt);
  // getP_Asset_Acct:107-136 — PRJ → project acct; MAN+charge → charge; INV+line-project → project;
  // else product expense (product 0 → DEFAULT category, ProductCost.getAccountDefault:250-298
  // ORDER BY IsDefault DESC, Created)
  var crComboRow = null;
  if (hdr.a_sourcetype === 'PRJ' && num(hdr.c_project_id) > 0) {
    var prj = getRow(db, 'SELECT projectcategory FROM c_project WHERE c_project_id=?', num(hdr.c_project_id));
    var col = (prj && prj.projectcategory === 'A') ? 'pj_asset_acct' : 'pj_wip_acct';
    var pa = getRow(db, 'SELECT ' + col + ' AS acct FROM c_project_acct WHERE c_project_id=? AND c_acctschema_id=?', [num(hdr.c_project_id), num(schema)]);
    crComboRow = pa && pa.acct;
  } else if (hdr.a_sourcetype === 'MAN' && num(hdr.c_charge_id) > 0) {
    var ch = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(hdr.c_charge_id), num(schema)]);
    crComboRow = ch && ch.acct;
  } else if (num(hdr.m_product_id) > 0) {
    var pc = getRow(db, 'SELECT a.p_expense_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(hdr.m_product_id)]);
    crComboRow = pc && pc.acct;
  } else {
    var dft = getRow(db, "SELECT a.p_expense_acct AS acct FROM m_product_category c JOIN m_product_category_acct a ON a.m_product_category_id=c.m_product_category_id AND a.c_acctschema_id=? ORDER BY c.isdefault DESC, c.created LIMIT 1", num(schema));
    crComboRow = dft && dft.acct;
  }
  var crEl = elOf(db, vcAcct(db, crComboRow), d.absent, '{Addition.SourceAcct}');
  if (crEl) d.add('CR', crEl, amt);
  return d;
}

// Doc_DepreciationEntry.createFacts:66-91 — other-acctschema → EMPTY; per depexp line of the entry
// (entry_id + the entry's schema) DR depexp.DR_Account_ID / CR CR_Account_ID at Expense (schema currency).
function deriveDepreciationEntry(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_depreciation_entry WHERE a_depreciation_entry_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.c_acctschema_id) !== num(schema)) return d;                 // other-schema ∅, Doc_DepreciationEntry:70-71
  var lines = allRows(db, 'SELECT * FROM a_depreciation_exp WHERE a_depreciation_entry_id=? AND c_acctschema_id=? ORDER BY a_depreciation_exp_id', [num(id), num(hdr.c_acctschema_id)]);
  lines.forEach(function (l) {
    var amt = cents(l.expense);
    var drEl = elOf(db, vcAcct(db, l.dr_account_id), d.absent, '{DepExp.DR}');
    var crEl = elOf(db, vcAcct(db, l.cr_account_id), d.absent, '{DepExp.CR}');
    if (drEl) d.add('DR', drEl, amt);
    if (crEl) d.add('CR', crEl, amt);
  });
  return d;
}

// Doc_AssetReval.createFacts:55-77 — pair1 DR AssetAcct / CR RevalCostOffset = (Cost_Change − A_Asset_Cost);
// pair2 DR RevalCostOffset / CR AccumDep = (Change_Acum_Depr − A_Accumulated_Depr). Doc columns, schema currency.
function deriveAssetReval(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_reval WHERE a_asset_reval_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  // §75 (F38): Doc_AssetReval takes MAccount.get(ctx, id) of the asset-acct columns; for an EMPTY column (id 0) MAccount.get returns an empty account, not null (MAccount.java:369-381 @{u}),
  // Fact.checkAccounts finds no element value (Fact.java:641-664) ⇒ Doc.postLogic STATUS_InvalidAccount 'i' (Doc.java:762-764): the WHOLE document gets no facts (measured: pilot reval, Posted=i).
  if (![acct.a_asset_acct, acct.a_reval_cost_offset_acct, acct.a_accumdepreciation_acct].every(function (c) { return c != null && c !== '' && num(c) !== 0; })) { d.postStatus = 'i'; return d; }
  var costDelta = cents(hdr.a_asset_cost_change) - cents(hdr.a_asset_cost);
  var acumDelta = cents(hdr.a_change_acumulated_depr) - cents(hdr.a_accumulated_depr);
  var assetEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  var offEl = elOf(db, vcAcct(db, acct.a_reval_cost_offset_acct), d.absent, '{AssetAcct.RevalCostOffset}');
  var accumEl = elOf(db, vcAcct(db, acct.a_accumdepreciation_acct), d.absent, '{AssetAcct.AccumDep}');
  if (assetEl && offEl) { d.add('DR', assetEl, costDelta); d.add('CR', offEl, costDelta); }
  if (offEl && accumEl) { d.add('DR', offEl, acumDelta); d.add('CR', accumEl, acumDelta); }
  return d;
}

// Doc_AssetTransfer.createFacts:44-72 — DR new/CR old AssetAcct at workfile A_Asset_Cost (only if they
// differ); DR old/CR new AccumDep at workfile A_Accumulated_Depr (only if they differ). The doc's OWN
// combo columns, workfile per (asset, postingtype, PRIMARY schema — MDepreciationWorkfile.get:351-364
// defaults C_AcctSchema_ID to the client's primary). Same lines for EVERY schema (the poster does not
// re-map combos per schema — replicated bug-compat).
function deriveAssetTransfer(db, id, schema, primarySchema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_transfer WHERE a_asset_transfer_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var wk = getRow(db, "SELECT * FROM a_depreciation_workfile WHERE a_asset_id=? AND postingtype='A' AND c_acctschema_id=?",
    [num(hdr.a_asset_id), num(primarySchema || 101)]);
  if (!wk) { d.absent.push('a_depreciation_workfile#' + hdr.a_asset_id); return d; }
  if (num(hdr.a_asset_new_acct) !== num(hdr.a_asset_acct)) {
    var drEl = elOf(db, vcAcct(db, hdr.a_asset_new_acct), d.absent, '{Transfer.AssetNew}');
    var crEl = elOf(db, vcAcct(db, hdr.a_asset_acct), d.absent, '{Transfer.AssetOld}');
    var amt = cents(wk.a_asset_cost);
    if (drEl) d.add('DR', drEl, amt);
    if (crEl) d.add('CR', crEl, amt);
  }
  if (num(hdr.a_accumdepreciation_new_acct) !== num(hdr.a_accumdepreciation_acct)) {
    var drEl2 = elOf(db, vcAcct(db, hdr.a_accumdepreciation_acct), d.absent, '{Transfer.AccumOld}');
    var crEl2 = elOf(db, vcAcct(db, hdr.a_accumdepreciation_new_acct), d.absent, '{Transfer.AccumNew}');
    var amt2 = cents(wk.a_accumulated_depr);
    if (drEl2) d.add('DR', drEl2, amt2);
    if (crEl2) d.add('CR', crEl2, amt2);
  }
  return d;
}

// Doc_AssetDisposed.createFacts:65-86 — from the A_Asset_Change 'DIS' row OF THIS SCHEMA (per-schema
// amounts, MAssetChange.get with C_AcctSchema_ID): CR AssetAcct=AssetValueAmt / DR AccumDep=
// AssetAccumDepreciationAmt / DR DisposalLoss=AssetBookValueAmt. Schema currency, no conversion.
function deriveAssetDisposed(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_disposed WHERE a_asset_disposed_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var ch = getRow(db, "SELECT * FROM a_asset_change WHERE a_asset_id=? AND changetype='DIS' AND c_acctschema_id=? ORDER BY a_asset_change_id LIMIT 1",
    [num(hdr.a_asset_id), num(schema)]);
  if (!ch) { d.absent.push('a_asset_change#DIS/' + hdr.a_asset_id + '/' + schema); return d; }
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  var assetEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  var accumEl = elOf(db, vcAcct(db, acct.a_accumdepreciation_acct), d.absent, '{AssetAcct.AccumDep}');
  var lossEl = elOf(db, vcAcct(db, acct.a_disposal_loss_acct), d.absent, '{AssetAcct.DisposalLoss}');
  if (assetEl) d.add('CR', assetEl, cents(ch.assetvalueamt));
  if (accumEl) d.add('DR', accumEl, cents(ch.assetaccumdepreciationamt));
  if (lossEl) d.add('DR', lossEl, cents(ch.assetbookvalueamt));
  return d;
}

// Doc_ProjectIssue.createFacts:125-199 — DR project WIP acct (Asset acct if ProjectCategory='A') /
// CR product Asset acct (Expense if service) at COST: m_inoutline POCost | timeexpense laborCost |
// else the product's current cost × qty (schema costingmethod → cost element → m_cost.currentcostprice,
// the W-FOLD-MOVEMENT hop). Per-schema cost, schema currency.
function deriveProjectIssue(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_projectissue WHERE c_projectissue_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.m_inoutline_id) > 0) { d.absent.push('POCost#m_inoutline=' + hdr.m_inoutline_id); return d; }
  if (num(hdr.s_timeexpenseline_id) > 0) { d.absent.push('LaborCost#tel=' + hdr.s_timeexpenseline_id); return d; }
  var as = schemaRow(db, schema);
  var cost = getRow(db,
    "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
    " AND e.costelementtype='M' AND e.costingmethod=? WHERE c.m_product_id=? AND c.c_acctschema_id=? AND c.m_costtype_id=?",
    [as ? String(as.costingmethod) : '', num(hdr.m_product_id), num(schema), as ? num(as.m_costtype_id) : 0]);
  // §71 (F35): Doc_ProjectIssue cost = MCost.getCurrentCost (MCost.java:286-330 @{u}) = price × qty HALF_UP at the schema COSTING precision, then the fact line HALF_UP to the currency precision (FactLine)
  var cprec = _costingPrecision(db, schema), amt;
  if (cost && cprec != null) { var pd = _bigDec(cost.p), qd = _bigDec(hdr.movementqty), c4 = _rhuB(pd.n * qd.n * 10n ** BigInt(cprec), 10n ** BigInt(pd.k + qd.k)); amt = Number(_rhuB(c4 * 100n, 10n ** BigInt(cprec))); }
  else amt = Math.round(cents(cost ? cost.p : 0) * Number(hdr.movementqty));   // no costing precision in this db: the earlier fold, unchanged
  var prj = getRow(db, 'SELECT projectcategory FROM c_project WHERE c_project_id=?', num(hdr.c_project_id));
  var col = (prj && prj.projectcategory === 'A') ? 'pj_asset_acct' : 'pj_wip_acct';
  var pa = getRow(db, 'SELECT ' + col + ' AS acct FROM c_project_acct WHERE c_project_id=? AND c_acctschema_id=?', [num(hdr.c_project_id), num(schema)]);
  var prod = getRow(db, 'SELECT producttype, m_product_category_id FROM m_product WHERE m_product_id=?', num(hdr.m_product_id));
  var isService = prod && prod.producttype === 'S';
  var pcol = isService ? 'p_expense_acct' : 'p_asset_acct';
  var pacct = prod ? getRow(db, 'SELECT ' + pcol + ' AS acct FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=?', [num(prod.m_product_category_id), num(schema)]) : null;
  var drEl = elOf(db, vcAcct(db, pa && pa.acct), d.absent, '{Project.' + (col === 'pj_asset_acct' ? 'Asset' : 'WIP') + '}');
  var crEl = elOf(db, vcAcct(db, pacct && pacct.acct), d.absent, '{Product.' + (isService ? 'Expense' : 'Asset') + '}');
  if (drEl) d.add('DR', drEl, amt);
  if (crEl) d.add('CR', crEl, amt);
  return d;
}

// ── W-POST-TAIL manifests (HARDEN_MATRIX.md §W-POST-TAIL, 2026-07-18) ───────────────────────────────

// Doc_BankStatement.createFacts:200-280 — per line (clearing accounts differ + IsPostIfClearingEqual=Y
// in this seed → the NORMAL branch): {Bank.Asset}=+StmtAmt · {Bank.InTransit}=−TrxAmt · charge leg
// (>0→CR, else DR .negate(); only when a charge account resolves and the amount ≠ 0 — Fact.createLine
// drops null-account/zero lines) · interest leg (<0→InterestExp else InterestRev, −InterestAmt).
// Legs post in DOC currency → per-schema conversion (fxRate) + the Fact.balanceAccounting
// CurrencyBalancing residual (c_acctschema_gl, the W-FOLD-ALLOC-FX rule).
function deriveBankStatement(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_bankstatement WHERE c_bankstatement_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var lines = allRows(db, 'SELECT * FROM c_bankstatementline WHERE c_bankstatement_id=? ORDER BY c_bankstatementline_id', num(id));
  var ba = getRow(db, 'SELECT * FROM c_bankaccount_acct WHERE c_bankaccount_id=? AND c_acctschema_id=?', [num(hdr.c_bankaccount_id), num(schema)]);
  if (!ba) { d.absent.push('c_bankaccount_acct#' + hdr.c_bankaccount_id + '/' + schema); return d; }
  var as = schemaRow(db, schema);
  var docCur = lines.length ? num(lines[0].c_currency_id) : (as ? num(as.c_currency_id) : 0);
  var rate = fxRate(db, docCur, as ? as.c_currency_id : docCur, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id);
  if (rate == null) { d.absent.push('fxrate#' + docCur + '->' + (as && as.c_currency_id)); return d; }
  function conv(c) { return Math.round(c * rate); }
  function leg(el, srcCents) {           // signed source cents → DR (+) / CR (−) accounted cents
    if (!el || srcCents === 0) return;
    if (srcCents > 0) d.add('DR', el, conv(srcCents)); else d.add('CR', el, conv(-srcCents));
  }
  var assetEl = elOf(db, vcAcct(db, ba.b_asset_acct), d.absent, '{Bank.Asset}');
  var transitEl = elOf(db, vcAcct(db, ba.b_intransit_acct), d.absent, '{Bank.InTransit}');
  lines.forEach(function (l) {
    leg(assetEl, cents(l.stmtamt));
    leg(transitEl, -cents(l.trxamt));
    var chg = cents(l.chargeamt);
    if (chg !== 0 && num(l.c_charge_id) > 0) {
      var ch = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      leg(elOf(db, vcAcct(db, ch && ch.acct), d.absent, '{Charge.Expense}'), -chg);   // >0→CR / <0→DR
    }
    var intr = cents(l.interestamt);
    if (intr !== 0) {
      var col = intr < 0 ? 'b_interestexp_acct' : 'b_interestrev_acct';
      leg(elOf(db, vcAcct(db, ba[col]), d.absent, '{Bank.' + (intr < 0 ? 'InterestExp' : 'InterestRev') + '}'), -intr);
    }
  });
  // Fact.balanceAccounting — the per-doc accounted imbalance lands on the schema CurrencyBalancing acct
  if (num(docCur) !== (as ? num(as.c_currency_id) : num(docCur))) {
    var dr = 0, cr = 0;
    Object.keys(d.by).forEach(function (k) { dr += d.by[k].dr; cr += d.by[k].cr; });
    if (dr !== cr) {
      var gl = getRow(db, 'SELECT currencybalancing_acct AS acct FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema));
      var balEl = elOf(db, vcAcct(db, gl && gl.acct), d.absent, '{Schema.CurrencyBalancing}');
      if (balEl) d.add(dr < cr ? 'DR' : 'CR', balEl, Math.abs(dr - cr));
    }
  }
  return d;
}

// Doc_MatchPO.createFacts:244-470 — the PPV pair posts ONLY under COSTINGMETHOD_StandardCosting
// (Doc_MatchPO.java:429); this seed costs at 'A' Average → the REAL engine posted the EMPTY set for
// all 37 docs (posted='Y', 0 fact rows — verified live 2026-07-18). ∅ is CONFIG-derived, not skipped:
// under 'S' the manifest opens the PPV path (poCost vs standard cost via m_cost — absent-token when
// the seed carries no standard-cost rows, which is itself the honest state).
function deriveMatchPO(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_matchpo WHERE m_matchpo_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.m_product_id) === 0 || Number(hdr.qty) === 0) return d;      // :248-254
  if (num(hdr.m_inoutline_id) === 0) return d;                             // :275-282 no shipment match
  var as = schemaRow(db, schema);
  var method = as ? String(as.costingmethod) : '';
  // product-level override (m_product_category_acct costingmethod not captured — schema-level method,
  // the same resolution the W-FOLD-MOVEMENT cost hop proved for this seed)
  if (method !== 'S') return d;                                            // :429 gate → ∅ under Average
  var cost = getRow(db,
    "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
    " AND e.costelementtype='M' AND e.costingmethod='S' WHERE c.m_product_id=? AND c.c_acctschema_id=?",
    [num(hdr.m_product_id), num(schema)]);
  if (!cost || Number(cost.p) === 0) { d.absent.push('{Product.StandardCost}#' + hdr.m_product_id); return d; }
  var ol = getRow(db, 'SELECT priceactual FROM c_orderline WHERE c_orderline_id=?', num(hdr.c_orderline_id));
  if (!ol) { d.absent.push('c_orderline#' + hdr.c_orderline_id); return d; }
  var ppv = Math.round((cents(ol.priceactual) - cents(cost.p)) * Number(hdr.qty));
  if (ppv !== 0) {
    var pc = getRow(db, 'SELECT a.p_purchasepricevariance_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(hdr.m_product_id)]);
    var ppvEl = elOf(db, vcAcct(db, pc && pc.acct), d.absent, '{Product.PPV}');
    var offEl = elOf(db, vcAcct(db, null), d.absent, '{Schema.PPVOffset}');  // c_acctschema_gl ppvoffset not captured — named absent
    if (ppvEl && offEl) { d.add(ppv > 0 ? 'DR' : 'CR', ppvEl, Math.abs(ppv)); d.add(ppv > 0 ? 'CR' : 'DR', offEl, Math.abs(ppv)); }
  }
  return d;
}

// Doc_Requisition.createFacts:121-156 — posts ONLY under MAcctSchema.isCreateReservation
// (commitmenttype 'B'/'A', MAcctSchema.java:662-669); this seed = 'N' → the REAL engine posted ∅ for
// the 1 posted doc. Under the flip: per line DR {Product.Expense}=LineNetAmt + CR CommitmentOffset=Σ.
function deriveRequisition(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_requisition WHERE m_requisition_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var as = schemaRow(db, schema);
  var ct = as ? String(as.commitmenttype) : 'N';
  if (ct !== 'B' && ct !== 'A') return d;                                  // isCreateReservation gate → ∅
  var lines = allRows(db, 'SELECT * FROM m_requisitionline WHERE m_requisition_id=? ORDER BY m_requisitionline_id', num(id));
  var total = 0;
  lines.forEach(function (l) {
    var amt = cents(l.linenetamt);
    total += amt;
    var pc = num(l.m_product_id) > 0
      ? getRow(db, 'SELECT a.p_expense_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(l.m_product_id)])
      : getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
    var el = elOf(db, vcAcct(db, pc && pc.acct), d.absent, '{Product.Expense}');
    if (el) d.add('DR', el, amt);
  });
  var offEl = elOf(db, vcAcct(db, null), d.absent, '{Schema.CommitmentOffset}');  // not captured — named absent under the flip
  if (offEl) d.add('CR', offEl, total);
  return d;
}

// Doc_Cash.createFacts:150-249 (HARDEN_MATRIX.md §W-POST-TAIL-2) — per c_cashline CashType leg + the
// header running assetAmt close. NOT oracle-diffable in THIS seed: both real c_cash docs (100/101) carry
// IsActive='N' — Doc.postIt's lock UPDATE (Doc.java:591-605) requires IsActive='Y' before createFacts
// ever runs, so the REAL engine posts ZERO rows for these two (verified live: DocManager.postDocument →
// "CannotPostInactiveDocument"). This manifest is a faithful, source-cited translation (reusable for any
// FUTURE active C_Cash doc) — its role HERE is only the falsifier: it computes REAL non-empty legs from
// the real line data, proving the ∅ is an IsActive-gate fact (Doc.postIt, outside createFacts), not a
// dead/no-op verb or a manifest bug. NEVER invents: IsActive is read, never flipped, on the real rows.
function deriveCash(db, id, schema) {
  // §66.2 (F30) — Doc_Cash.createFacts (Doc_Cash.java:150-249) as legacy posts it: a leg whose cash-book account is NOT configured is not created (Fact.createLine returns null for a null
  // account, Fact.java:116-122) — it is no longer reported absent; an unbalanced source is then balanced on the schema's SuspenseBalancing account (Doc.post → Fact.balanceSource
  // Fact.java:298-322, only when UseSuspenseBalancing='Y', else NotBalanced ⇒ absent); each line is converted to the schema currency on its own (FactLine.convert), then the currency
  // difference is balanced (Fact.balanceAccounting, the F16 helper). Lines carry the cash BOOK currency (DocLine_Cash: the line currency for invoice / transfer lines).
  var hdr = getRow(db, 'SELECT * FROM c_cash WHERE c_cash_id=?', num(id));
  if (!hdr) return null;
  var cb = getRow(db, 'SELECT * FROM c_cashbook WHERE c_cashbook_id=?', num(hdr.c_cashbook_id));
  var cbAcct = getRow(db, 'SELECT * FROM c_cashbook_acct WHERE c_cashbook_id=? AND c_acctschema_id=?', [num(hdr.c_cashbook_id), num(schema)]);
  var docCur = cb && cb.c_currency_id != null ? num(cb.c_currency_id) : null;
  var d = b3New(), parts = [];   // {el, side, src, cur}
  if (!cbAcct) { d.absent.push('c_cashbook_acct#' + hdr.c_cashbook_id + '/' + schema); return d; }
  var lines = allRows(db, 'SELECT * FROM c_cashline WHERE c_cash_id=? ORDER BY c_cashline_id', num(id));
  var assetAmt = 0;
  function acct(combo) { var a = vcAcct(db, combo); if (a == null) return null; return elOf(db, a, d.absent, 'acct'); }
  function line(el, amt, cur) { if (!el || !amt) return; parts.push({ el: el, side: amt > 0 ? 'DR' : 'CR', src: Math.abs(amt), cur: cur }); }   // single-amount createLine: negative ⇒ CR (Fact.java:206-212)
  function line2(el, dr, cr, cur) { if (!el) return; if (dr) parts.push({ el: el, side: 'DR', src: dr, cur: cur }); if (cr) parts.push({ el: el, side: 'CR', src: cr, cur: cur }); }
  lines.forEach(function (l) {
    var amt = cents(l.amount), lineCur = l.c_currency_id != null ? num(l.c_currency_id) : docCur;
    if (l.cashtype === 'E') { line2(acct(cbAcct.cb_expense_acct), -amt, 0, docCur); assetAmt -= -amt; }                 // Expense :174-181
    else if (l.cashtype === 'R') { assetAmt += amt; line2(acct(cbAcct.cb_receipt_acct), 0, amt, docCur); }             // Receipt :182-189
    else if (l.cashtype === 'C') {                                                                                  // Charge :190-197
      var chg = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      line(acct(chg && chg.acct), -amt, docCur); assetAmt -= -amt;
    } else if (l.cashtype === 'D') { line(acct(cbAcct.cb_differences_acct), -amt, docCur); assetAmt += amt; }           // Difference :198-205
    else if (l.cashtype === 'I') {                                                                                  // Invoice :206-219
      if (lineCur === docCur) assetAmt += amt; else line(acct(cbAcct.cb_asset_acct), amt, lineCur);
      line(acct(cbAcct.cb_cashtransfer_acct), -amt, lineCur);
    } else if (l.cashtype === 'T') {                                                                                // Transfer :220-236
      var ba = getRow(db, 'SELECT * FROM c_bankaccount_acct WHERE c_bankaccount_id=? AND c_acctschema_id=?', [num(l.c_bankaccount_id), num(schema)]);
      line(acct(ba && ba.b_intransit_acct), -amt, lineCur);
      if (lineCur === docCur) assetAmt += amt; else line(acct(cbAcct.cb_asset_acct), amt, lineCur);
    }
  });
  if (assetAmt !== 0) line(acct(cbAcct.cb_asset_acct), assetAmt, docCur);                                           // header close :239-243
  var bal = 0; parts.forEach(function (p) { bal += p.side === 'DR' ? p.src : -p.src; });
  var curs = {}; parts.forEach(function (p) { curs[p.cur] = 1; });
  if (bal !== 0 && Object.keys(curs).length <= 1) {                                                                  // Fact.isSourceBalanced / balanceSource
    var gl = _hasCol(db, 'c_acctschema_gl', 'usesuspensebalancing') ? getRow(db, 'SELECT usesuspensebalancing AS u, suspensebalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
    if (!gl || String(gl.u) !== 'Y') { d.absent.push('NotBalanced (no suspense balancing, Doc.java:852-856)'); return d; }
    var sus = acct(gl.a); if (!sus) { d.absent.push('SuspenseBalancing_Acct'); return d; }
    parts.push({ el: sus, side: bal < 0 ? 'DR' : 'CR', src: Math.abs(bal), cur: docCur });
  }
  var as = schemaRow(db, schema), dr = 0, cr = 0;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], amt = p.cur == null || !as || num(p.cur) === num(as.c_currency_id) ? p.src : _fxConvertCents(db, p.src, p.cur, schema, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id, d.absent);
    if (amt == null) return d;
    d.add(p.side, p.el, amt); if (p.side === 'DR') dr += amt; else cr += amt;
  }
  if (dr !== cr) balanceAccounting(db, d.by, d.absent, schema, dr - cr);
  return d;
}

// §69 (F33) Doc_GLJournal.createFacts (Doc_GLJournal.java:118-160 @{u}): ONLY the journal's own schema (another schema ⇒ no facts); per line createLine(account, source Dr/Cr) carrying the
// line's ACCOUNTED amounts (DocLine.setConvertedAmt, :83-87); then Doc.post → Fact.balanceSource (Fact.java:298-322): an unbalanced single-currency journal ⇒ SuspenseBalancing (diff < 0 ⇒ DR).
function deriveGLJournal(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM gl_journal WHERE gl_journal_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.c_acctschema_id) !== num(schema)) return d;
  var lines = allRows(db, 'SELECT * FROM gl_journalline WHERE gl_journal_id=? ORDER BY line, gl_journalline_id', num(id)), bal = 0;
  lines.forEach(function (l) {
    var el = elOf(db, num(l.account_id), d.absent, 'GL_JournalLine.Account_ID'); if (!el) return;
    var sd = cents(l.amtsourcedr), sc = cents(l.amtsourcecr), ad = cents(l.amtacctdr), ac = cents(l.amtacctcr);
    if (!sd && !sc) return;                                                                              // Fact.createLine: no amounts ⇒ no line
    if (ad) d.add('DR', el, ad); if (ac) d.add('CR', el, ac); bal += sd - sc;
  });
  if (bal !== 0) {
    var gl = _hasCol(db, 'c_acctschema_gl', 'usesuspensebalancing') ? getRow(db, 'SELECT usesuspensebalancing AS u, suspensebalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
    if (!gl || String(gl.u) !== 'Y') { d.absent.push('NotBalanced (no suspense balancing, Doc.java:852-856)'); return d; }
    var sus = elOf(db, vcAcct(db, gl.a), d.absent, 'SuspenseBalancing_Acct'); if (!sus) return d;
    d.add(bal < 0 ? 'DR' : 'CR', sus, Math.abs(bal));
  }
  return d;
}

// Doc_Inventory.createFacts:211-513 (HARDEN_MATRIX.md §W-POST-TAIL-2), physical-inventory branch only
// (this seed's docs are all DocSubTypeInv=PI). costs = the schema-costingmethod → cost-element →
// m_cost.currentcostprice hop (same lookup as deriveProjectIssue); if costs resolves to 0 AND no
// qualifying zero-cost-blessing M_CostDetail row exists (Doc_Inventory.java:319-336: Processed='Y',
// Amt=0, Qty>0, from an order/invoice line), the REAL engine REFUSES the whole doc ("No Costs for
// <product>") — createFacts returns null, ZERO fact rows, NOT a partial post. Verified live: product 147
// (doc 100's only line) has currentcostprice=0 everywhere and ZERO m_costdetail rows → the REAL engine
// refused doc 100 exactly this way (§TAILORACLE postErr="No Costs for TShirt - Red Large"). This manifest
// reproduces that SAME refusal (0==0, a genuine match, not a vacuous one) and the falsifier flips the
// blessing count to prove the gate — not the manifest — is what closes to ∅.
function deriveInventory(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_inventory WHERE m_inventory_id=?', num(id));
  if (!hdr) return null;
  var lines = allRows(db, 'SELECT * FROM m_inventoryline WHERE m_inventory_id=? AND isactive=\'Y\'', num(id));
  var d = b3New();
  if (lines.length === 0) { d.absent.push('@NoLines@#' + id); return d; }   // MInventory.prepareIt:401-406
  lines.forEach(function (l) {
    var as = schemaRow(db, schema);
    var cost = getRow(db,
      "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
      " AND e.costelementtype='M' AND e.costingmethod=? WHERE c.m_product_id=? AND c.c_acctschema_id=? AND c.m_costtype_id=?",
      [as ? String(as.costingmethod) : '', num(l.m_product_id), num(schema), as ? num(as.m_costtype_id) : 0]);
    var qtyDiff = Number(l.qtycount) - Number(l.qtybook);                  // PI branch :164-165
    var costCents = cents(cost ? cost.p : 0);
    if (costCents === 0) {
      var bless = getRow(db,
        "SELECT COUNT(*) AS n FROM m_costdetail WHERE m_product_id=? AND processed='Y' AND amt=0.00 AND qty>0" +
        " AND (c_orderline_id>0 OR c_invoiceline_id>0)", num(l.m_product_id));
      if (!bless || Number(bless.n) === 0) { d.absent.push('{Product.NoCosts}#' + l.m_product_id); return; }  // :332-335 refusal
    }
    // §59 (F18): the LINE is rounded, not the unit cost (Doc_Inventory costs = ProductCost qty × current cost; same rule as poc_movement_fx) — exact HALF_UP
    var amt = cost ? (function () { var pd = _bigDec(cost.p), qd = _bigDec(qtyDiff); return Number(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k))); })() : 0;
    var prod = getRow(db, 'SELECT producttype, m_product_category_id FROM m_product WHERE m_product_id=?', num(l.m_product_id));
    var isService = prod && prod.producttype === 'S';
    var pcol = isService ? 'p_expense_acct' : 'p_asset_acct';
    var pacct = prod ? getRow(db, 'SELECT ' + pcol + ' AS acct FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=?', [num(prod.m_product_category_id), num(schema)]) : null;
    var drEl = elOf(db, vcAcct(db, pacct && pacct.acct), d.absent, '{Product.' + (isService ? 'Expense' : 'Asset') + '}');
    // Fact.createLine(docLine, acct, cur, Amt) single-amount form (Fact.java:206-212): a NEGATIVE amount goes to the CREDIT side as its absolute value (§59, PI2 loss)
    // a ZERO amount keeps its line on the intended side (Fact.createLine keeps a zero line when the doc line has a quantity — the poc_post_tail blessing-flip falsifier)
    var single = function (el, a, zeroSide) { if (!el) return; if (a < 0) d.add('CR', el, -a); else if (a > 0) d.add('DR', el, a); else d.add(zeroSide, el, 0); };
    single(drEl, amt, 'DR');
    // CR: line.getChargeAccount if C_Charge_ID≠0, else M_Warehouse_Acct.W_Differences_Acct (:1505-1509)
    if (num(l.c_charge_id) > 0) {
      var chg = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      var chgEl = elOf(db, vcAcct(db, chg && chg.acct), d.absent, '{Charge.Expense}');
      single(chgEl, -amt, 'CR');
    } else {
      var loc = getRow(db, 'SELECT m_warehouse_id FROM m_locator WHERE m_locator_id=?', num(l.m_locator_id));
      var wa = loc ? getRow(db, 'SELECT w_differences_acct AS acct FROM m_warehouse_acct WHERE m_warehouse_id=? AND c_acctschema_id=?', [num(loc.m_warehouse_id), num(schema)]) : null;
      var crEl = elOf(db, vcAcct(db, wa && wa.acct), d.absent, '{Warehouse.Differences}');
      single(crEl, -amt, 'CR');
    }
  });
  return d;
}

// ── §P9 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §P4-OPEN item 7 — Witness: W-POST-GLCATEGORY) ──
// glCategoryFor — a faithful port of how iDempiere decides a document's GL_Category_ID, which FactLine.java:404
// (`setGL_Category_ID(m_doc.getGL_Category_ID())`, inside setDocumentInfo:364) then stamps on EVERY fact line of
// that document — a document-level constant, never per-line. Chain, in Doc.java's order:
//   0. the DOCUMENT'S OWN GL_Category_ID column wins when the table has one (Doc.getGL_Category_ID:1785-1793 —
//      this is the GL_Journal case, where the doc-level resolution is bypassed entirely);
//   a. by C_DocType_ID  — `SELECT DocBaseType, GL_Category_ID FROM C_DocType WHERE C_DocType_ID=?` (:996-1009);
//   b. still 0 → by (AD_Client_ID, DocBaseType) (:1030-1045). The Java has NO ORDER BY and takes whatever row
//      the DB hands back first; we take the LOWEST c_doctype_id so the port is DETERMINISTIC — stated, not hidden;
//   c. still 0 → `SELECT GL_Category_ID FROM GL_Category WHERE AD_Client_ID=? ORDER BY IsDefault DESC` (:1060-1071);
//   d. still 0 → iDempiere logs SEVERE "No default GL_Category" (:1085-1086) and POSTS ANYWAY with 0.
// GL_Category_ID is a 0-SENTINEL, never NULL (Doc.java:411 `int m_GL_Category_ID = 0`); the seed agrees — 14 of
// its 52 c_doctype rows carry 0. So every guard below tests `> 0`, the same idiom ad_modelval.js:561 already uses.
function _hasCol(db, table, col) {
  try { return (db.prepare('PRAGMA table_info(' + table + ')').all() || []).some(function (r) { return String(r.name).toLowerCase() === col; }); }
  catch (e) { return false; }
}
function glCategoryFor(db, table, id) {
  var t = String(table || '').toLowerCase(), pk = t + '_id', out = { id: 0, stage: 'none' };
  if (!t || !isFinite(Number(id))) return out;
  var hdr = null;
  try { hdr = getRow(db, 'SELECT * FROM ' + t + ' WHERE ' + pk + '=?', num(id)); } catch (e) { return { id: 0, stage: 'no-doc-table' }; }
  if (!hdr) return out;
  // 0 — the document's own column (Doc.getGL_Category_ID:1787-1793)
  if (_hasCol(db, t, 'gl_category_id') && Number(hdr.gl_category_id) > 0) return { id: Number(hdr.gl_category_id), stage: 'own-column' };
  var clientId = Number(hdr.ad_client_id);
  var dtId = Number(hdr.c_doctype_id) > 0 ? Number(hdr.c_doctype_id)
           : (Number(hdr.c_doctypetarget_id) > 0 ? Number(hdr.c_doctypetarget_id) : 0);
  // a — by C_DocType_ID. EVERY read below is guarded: this resolver runs against NARROW seeds too (the B-3 and
  //   W-POST-TAIL fixtures build a minimal db with no c_doctype at all, and some carry c_doctype without
  //   docbasetype). iDempiere's own behaviour when it cannot resolve a category is to log and POST ANYWAY with
  //   the 0 sentinel (Doc.java:1085-1086) — never to fail the posting — so a schema gap DEGRADES and is NAMED in
  //   `stage`, exactly the "our interpreter's limits, said out loud" convention §P3-SPEC P3.4 already uses.
  //   (Found by the regression run: an unguarded read threw `no such table: c_doctype` and took four witnesses
  //   down with it — a posting must not break because a fixture is narrow.)
  var docBaseType = null;
  if (dtId > 0) {
    var dt = null;
    try { dt = getRow(db, 'SELECT docbasetype, gl_category_id FROM c_doctype WHERE c_doctype_id=?', dtId); }
    catch (e) { return { id: 0, stage: 'no-doctype-table', doctype: dtId }; }
    if (dt) {
      docBaseType = dt.docbasetype;
      if (Number(dt.gl_category_id) > 0) return { id: Number(dt.gl_category_id), stage: 'doctype', docBaseType: docBaseType, doctype: dtId };
    }
  }
  // b — by (client, DocBaseType)
  if (docBaseType) {
    var byBase = null;
    try { byBase = getRow(db, 'SELECT gl_category_id FROM c_doctype WHERE ad_client_id=? AND docbasetype=? AND gl_category_id>0 ORDER BY c_doctype_id LIMIT 1',
                          [clientId, docBaseType]); } catch (e) { byBase = null; }
    if (byBase && Number(byBase.gl_category_id) > 0) return { id: Number(byBase.gl_category_id), stage: 'docbasetype', docBaseType: docBaseType };
  }
  // c — the client's default GL_Category
  try {
    var def = getRow(db, 'SELECT gl_category_id FROM gl_category WHERE ad_client_id=? ORDER BY isdefault DESC, gl_category_id LIMIT 1', clientId);
    if (def && Number(def.gl_category_id) > 0) return { id: Number(def.gl_category_id), stage: 'client-default', docBaseType: docBaseType };
  } catch (e) { /* a seed without gl_category — fall through to the 0 sentinel, as the Java does */ }
  return { id: 0, stage: 'none-severe', docBaseType: docBaseType };   // Doc.java:1085-1086 — log and post with 0
}

function finish(d, basis, glCat) {
  if (!d) return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
  var gl = glCat || { id: 0, stage: 'none' };
  var lines = Object.keys(d.by).map(function (k) {
    var a = d.by[k];
    // §P9 — FactLine.java:404: the SAME document-level category on every line, never per-line.
    return { account_id: a.account_id, value: a.value, name: a.name, amtacctdr: a.dr / 100, amtacctcr: a.cr / 100,
             gl_category_id: gl.id };
  });
  var sumDr = 0, sumCr = 0;
  Object.keys(d.by).forEach(function (k) { sumDr += d.by[k].dr; sumCr += d.by[k].cr; });
  return { lines: lines, balanced: lines.length > 0 && sumDr === sumCr, sumDr: sumDr, sumCr: sumCr, absent: d.absent, basis: basis,
           gl_category_id: gl.id, gl_category_stage: gl.stage, postStatus: d.postStatus };   // §75: a legacy Doc status other than posted ('i' InvalidAccount), when the fold knows it
}

/**
 * derivePostings(db, recordRef, schema, R) -> the fold for the doc the action would post.
 *   recordRef = { table:'C_Order'|'C_Invoice', id }. C_Order → its generated invoice manifest (oracle
 *   path); a true-draft order with no invoice → the projected order manifest (basis='order', no oracle).
 *   Shipment COGS/Inventory leg is the §8 follow-up (cost data named-deferred in seed) — NOT in this slice.
 */
function derivePostings(db, recordRef, schema, R) {
  R = R || _R();
  if (!R) throw new Error('doc_poster: post_resolver (R) unavailable');
  var table = recordRef.table || recordRef.doc_type;
  var id = num(recordRef.id != null ? recordRef.id : recordRef.record_id);
  // §P9 — the GL_Category is resolved from the document ACTUALLY POSTED, so an order that folds through its
  //   generated invoice takes the INVOICE's doctype (that is the Doc iDempiere builds), not the order's.
  var glOf = function (t, i) { return glCategoryFor(db, t, i); };
  if (table === 'C_Invoice') return finish(deriveInvoice(db, R, id, schema), 'invoice', glOf('c_invoice', id));
  if (table === 'C_Order') {
    var invId = invoiceForOrder(db, id);
    if (invId != null) return finish(deriveInvoice(db, R, invId, schema), 'invoice', glOf('c_invoice', invId));
    return finish(deriveOrder(db, R, id, schema), 'order', glOf('c_order', id));   // draft projection — no oracle
  }
  // B-3 0-seed classes (W-POST-B3 §W-3) — these read per-asset/project acct config, not R tokens
  if (table === 'M_InOut') return finish(deriveInOut(db, R, id, schema), 'inout', glOf('m_inout', id));
  if (table === 'M_Movement') return finish(deriveMovement(db, R, id, schema), 'movement', glOf('m_movement', id));
  if (table === 'C_Payment') return finish(derivePayment(db, R, id, schema), 'payment', glOf('c_payment', id));
  if (table === 'C_AllocationHdr') return finish(deriveAllocation(db, R, id, schema, recordRef), 'allocation', glOf('c_allocationhdr', id));
  if (table === 'A_Asset_Addition') return finish(deriveAssetAddition(db, id, schema), 'fa-addition', glOf('a_asset_addition', id));
  if (table === 'A_Depreciation_Entry') return finish(deriveDepreciationEntry(db, id, schema), 'fa-depreciation', glOf('a_depreciation_entry', id));
  if (table === 'A_Asset_Reval') return finish(deriveAssetReval(db, id, schema), 'fa-reval', glOf('a_asset_reval', id));
  if (table === 'A_Asset_Transfer') return finish(deriveAssetTransfer(db, id, schema, recordRef.primarySchema), 'fa-transfer', glOf('a_asset_transfer', id));
  if (table === 'A_Asset_Disposed') return finish(deriveAssetDisposed(db, id, schema), 'fa-disposal', glOf('a_asset_disposed', id));
  if (table === 'C_ProjectIssue') return finish(deriveProjectIssue(db, id, schema), 'project-issue', glOf('c_projectissue', id));
  // W-POST-TAIL classes (HARDEN_MATRIX.md §W-POST-TAIL)
  if (table === 'C_BankStatement') return finish(deriveBankStatement(db, id, schema), 'bank-statement', glOf('c_bankstatement', id));
  if (table === 'M_MatchPO') return finish(deriveMatchPO(db, id, schema), 'matchpo', glOf('m_matchpo', id));
  if (table === 'M_MatchInv') return finish(deriveMatchInv(db, R, id, schema), 'matchinv', glOf('m_matchinv', id));   // §65.2 (F25)
  if (table === 'M_Requisition') return finish(deriveRequisition(db, id, schema), 'requisition', glOf('m_requisition', id));
  if (table === 'C_Cash') return finish(deriveCash(db, id, schema), 'cash', glOf('c_cash', id));
  if (table === 'GL_Journal') return finish(deriveGLJournal(db, id, schema), 'gl-journal', glOf('gl_journal', id));   // §69 (F33)
  if (table === 'M_Inventory') return finish(deriveInventory(db, id, schema), 'inventory', glOf('m_inventory', id));
  return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
}

function _R() { try { return (typeof require !== 'undefined') ? require('./post_resolver') : null; } catch (e) { return null; } }

var _api = { derivePostings: derivePostings, deriveInvoice: deriveInvoice, deriveInOut: deriveInOut, costQtyUpdates: costQtyUpdates, costQtyUpdatesFor: costQtyUpdatesFor, deriveOrder: deriveOrder, invoiceForOrder: invoiceForOrder,
             glCategoryFor: glCategoryFor, fxRate: fxRate, costUpdatesForMatchPO: costUpdatesForMatchPO, sysConfig: sysConfig, sysConfigBool: sysConfigBool, costAt: costAt, immediatePostingRefusal: immediatePostingRefusal, isClientAccountingImmediate: isClientAccountingImmediate };   // §P9 (W-POST-GLCATEGORY): the Doc.setDocumentType GL_Category chain, exposed for the witness; fxRate (MConversionRate.getRate shape) for the FA host, spec §63
// UMD tail — node (require) + browser live host (window.DocPoster). erp_preview.js injects window.PostResolver as R.
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.DocPoster = _api; }
