// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * doc_poster.js — reusable per-document GL derivation (W-DOC-POSTER).
 *
 * SCOPE NOW (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY step 5, 2026-11-04): the REAL poster (model_post.js) owns every document it
 * has a Doc class for — C_Invoice, M_InOut, M_Movement, C_AllocationHdr, C_BankStatement, C_Payment, M_MatchInv/PO, GL_Journal, M_Inventory —
 * for Complete AND the Posting-Preview (W-PREVIEW-IS-POSTING); their folds here are retired. What stays: derivePostings for the tables
 * model_post has no class for (A_Asset_*, C_ProjectIssue, M_Requisition, C_Cash, a bundle's derive-only class) and the draft-order
 * projection; the cost-engine verbs (costQtyUpdates & co.); the posting-class registry model_post and the plugins consult.
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

// §46 (F12): FactLine.convert (FactLine.java:819-900) — each line's Dr/Cr × MConversionRate.getRate (MConversionRate.java:237-252) rounded HALF_UP to the schema currency's
// StdPrecision (:126-147). A document without currency is posted in the schema currency (:821-823) — so nothing happens unless the invoice row carries c_currency_id.
// Unbalanced after conversion ⇒ legacy Fact.balanceAccounting (Fact.java:548-630) — NOT ported: reported absent, never invented.
function _bigDec(v) { var t = String(v).trim(); if (/e/i.test(t)) t = Number(t).toFixed(20).replace(/0+$/, '').replace(/\.$/, ''); var neg = t[0] === '-'; if (neg) t = t.slice(1); var p = t.split('.'), f = p[1] || ''; return { n: BigInt((neg ? '-' : '') + (p[0] || '0') + f), k: f.length }; }
function _rhuB(n, d) { var neg = n < 0n, a = neg ? -n : n, q = a / d; if ((a % d) * 2n >= d) q += 1n; return neg ? -q : q; }
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
// DOC CLASS REGISTRY (Host work H1; legacy IDocFactory): a plugin bundle (Libero: PP_Order / PP_Cost_Collector / DD_Order) registers the posting class for its table; layered + removable like every registry (layered_registry.js).
//   impl = { derive(db, id, schema, R, recordRef) -> { by:{key:{account_id,value,name,dr,cr}}, absent:[] } (the same internal shape the built-in derive* return, amounts in cents), basis? }.
//   derivePostings consults it before the 'basis none' fallback; immediatePostingRefusal treats a registered table as having a Doc class (legacy: the factory finds the class).
var _DOCC = (typeof require !== 'undefined' ? require('./layered_registry') : (typeof window !== 'undefined' ? window.LayeredRegistry : null)).create();
function registerDocClass(table, impl, opts) { _DOCC.add(String(table).toLowerCase(), impl, opts); }
function unregisterDocClass(table, owner) { return _DOCC.remove(String(table).toLowerCase(), owner); }
function removeDocClassOwner(owner) { return _DOCC.removeOwner(owner); }
function docClassFor(table) { var t = _DOCC.top(String(table || '').toLowerCase()); return t ? t.value : null; }
function describeDocClasses() { var o = {}; _DOCC.keys().sort().forEach(function (k) { o[k] = _DOCC.layers(k).map(function (r) { return r.owner + '@' + r.rank; }); }); return o; }
function legacyDocClassOf(tableName) { var t = String(tableName); return 'Doc_' + (t.indexOf('_') === 1 ? t.substring(2) : t).replace(/_/g, ''); }
function legacyDocClassExists(tableName) { return LEGACY_DOC_CLASSES.indexOf(legacyDocClassOf(tableName).substring(4)) >= 0; }   // the core accounting classes (a bundle's IDocFactory class is docClassFor)
// → the refusal text legacy gives, or null. hasPostedColumn = the table's AD_Column 'Posted' exists (SQLite dictionary).
function immediatePostingRefusal(db, tableName, hasPostedColumn, client) {
  if (!hasPostedColumn || !isClientAccountingImmediate(db, client)) return null;
  var cls = legacyDocClassOf(tableName);
  return (LEGACY_DOC_CLASSES.indexOf(cls.substring(4)) >= 0 || docClassFor(tableName)) ? null : 'Doc Class invalid: ' + cls;
}
// MClient.isClientAccountingImmediate (MClient.java:1094-1100 @{u}): CLIENT_ACCOUNTING equalsIgnoreCase 'I', default 'Q'
function isClientAccountingImmediate(db, client) { return /^i$/i.test(sysConfig(db, 'CLIENT_ACCOUNTING', 'Q', client, 0)); }
// Fact.balanceAccounting (Fact.java:548-615) — currency-balancing branch: diff = DR−CR; a line on C_AcctSchema_GL.CurrencyBalancing_Acct, CR |diff| when DR exceeds, DR |diff| otherwise,
// with sides switched (negative amount) when the biggest balance-sheet line's source balance is on the same side (:600-610). The "correct the biggest line" branch (no currency
// balancing) is not ported ⇒ absent by name.
function balanceAccounting(db, R, by, absent, schema, diff) {
  var gl = _hasCol(db, 'c_acctschema_gl', 'usecurrencybalancing') ? getRow(db, 'SELECT usecurrencybalancing AS u, currencybalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema)) : null;
  if (!gl || String(gl.u) !== 'Y') { absent.push('currency correction of the biggest line not ported (Fact.balanceAccounting, diff=' + diff + ')'); return; }
  R = R || _R(); var acct = R && R.elementOf ? R.elementOf(db, gl.a) : null;
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
// §78 (F9): dateAcct (optional, 'YYYY-MM-DD…') = the document's DateAcct. With a cost history in the db the price is the history's NewCostPrice at that date, replacing a NON-ZERO current price
// (MCost.getCost :290-300 `historyCostPrice` — a back-dated shipment is booked at the cost of its day, not today's). No history table/rows or no date ⇒ the m_cost price, as before.
function currentCost(db, productId, schema, dateAcct) {
  var cm = costingMethodOf(db, productId, schema), as = schemaRow(db, schema);
  if (!cm || !as) return { price: null, why: 'no-costing-method' };
  var el = getRow(db, 'SELECT m_costelement_id FROM m_costelement WHERE costingmethod=? ORDER BY m_costelement_id LIMIT 1', cm);
  if (!el) return { price: null, why: 'no-cost-element-for-' + cm };
  var c = getRow(db, 'SELECT currentcostprice FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(productId), num(schema), num(as.m_costtype_id), num(el.m_costelement_id)]);
  if (!c) return { price: null, why: 'no-m_cost-row' };
  var price = Number(c.currentcostprice), src = 'm_cost';
  if (dateAcct && price !== 0) { var h = costHistoryAt(db, productId, schema, as.m_costtype_id, el.m_costelement_id, dateAcct); if (h && h.hid != null) { price = Number(h.newcostprice); src = 'history'; } }
  return { price: price, method: cm, element: el.m_costelement_id, source: src };
}
// ── §78 (F9) COST HISTORY — MCostHistory.get(by DateAcct) (MCostHistory.java:193-290) + MCost.getCostInfo (MCost.java:1542-1573).
// Table m_costhistory (handover; columns of M_CostHistory + c_acctschema_id taken from its cost detail, processed details only). Rule: the history of (product, schema, cost type, element, ASI 0)
// with the HIGHEST M_CostHistory_ID whose DateAcct ≤ the date; none ⇒ the EARLIEST one (DateAcct asc, id asc) with New* := Old*; none/absent table ⇒ null (the plain m_cost row is the base).
function _dayOf(d) { return String(d).slice(0, 10); }
function costHistoryAt(db, productId, schema, costType, element, dateAcct) {
  if (!dateAcct || !_hasCol(db, 'm_costhistory', 'm_costhistory_id')) return null;
  var k = [num(productId), num(schema), num(costType), num(element)], day = _dayOf(dateAcct);
  // F9.4: the shipped ad_seed m_costhistory (model layer, erp/model_cost.js) has no c_acctschema_id column — the schema is that of its cost detail (MCostHistory.get "of the detail", spec §78 rule 3).
  var T = 'm_costhistory';
  if (!_hasCol(db, 'm_costhistory', 'c_acctschema_id')) { if (!_hasCol(db, 'm_costdetail', 'c_acctschema_id')) return null; T = '(SELECT x.*, d.c_acctschema_id AS c_acctschema_id FROM m_costhistory x JOIN m_costdetail d ON d.m_costdetail_id=x.m_costdetail_id)'; }
  var h = getRow(db, 'SELECT * FROM ' + T + ' WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=? AND COALESCE(m_attributesetinstance_id,0)=0 AND substr(dateacct,1,10)<=? ORDER BY m_costhistory_id DESC LIMIT 1', k.concat([day]));
  if (!h) {
    h = getRow(db, 'SELECT * FROM ' + T + ' WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=? AND COALESCE(m_attributesetinstance_id,0)=0 ORDER BY substr(dateacct,1,10) ASC, m_costhistory_id ASC LIMIT 1', k);
    if (!h) return null;
    h.newqty = h.oldqty; h.newcostprice = h.oldcostprice; h.newcamt = h.oldcamt; h.newcqty = h.oldcqty;   // "simulate": the first record after the date, before its own effect
  }
  return { hid: h.m_costhistory_id, dateacct: h.dateacct, newqty: h.newqty, newcostprice: h.newcostprice, newcqty: h.newcqty, newcamt: h.newcamt };   // RAW stored values: exact decimals are the consumer's job (_decStr), never Number()
}
// The state a cost detail starts from (MCostDetail.process :1424-1441): the history's New* values when a history applies (Standard costing: qty and cumulated qty always, price / cumulated amt only when
// non-zero), else the m_cost row. cm = the element's costing method. Strings keep full decimal precision.
function _costBase(db, pid, sch, ct, el, cm, dateAcct) {
  var cc = _hasCol(db, 'm_cost', 'cumulatedqty') && _hasCol(db, 'm_cost', 'cumulatedamt');   // old-schema dbs carry currentqty only
  var r = getRow(db, 'SELECT currentqty, currentcostprice' + (cc ? ', cumulatedqty, cumulatedamt' : '') + ' FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', [num(pid), num(sch), num(ct), num(el)]);
  // qty / cumqty are carried RAW (the stored value; consumers convert: Number() for arithmetic, _decStr() for exact decimals) — same precision the pre-§78 MatchPO path read
  var b = { qty: r && r.currentqty != null ? r.currentqty : 0, price: r && r.currentcostprice != null ? String(r.currentcostprice) : '0', cumqty: r && r.cumulatedqty != null ? r.cumulatedqty : 0, cumamt: r && r.cumulatedamt != null ? String(r.cumulatedamt) : '0', source: 'm_cost' };
  var h = costHistoryAt(db, pid, sch, ct, el, dateAcct);
  if (!h) return b;
  b.source = 'history'; b.hid = h.hid; b.qty = h.newqty; b.cumqty = h.newcqty;
  if (cm === 'S') { if (Number(h.newcostprice) !== 0) b.price = String(h.newcostprice); if (Number(h.newcamt) !== 0) b.cumamt = String(h.newcamt); }
  else { b.price = String(h.newcostprice); b.cumamt = String(h.newcamt); }
  return b;
}
// ONE way a host applies a cost update (§78): absolute new values (u.set) when present, else the legacy delta shape; and APPENDS the history row (MCostHistory, written by MCostDetail.process) so a
// later date lookup sees this change. Without the history append, any host would make costHistoryAt stale — every witness host calls this, none writes m_cost by hand.
function _insertRow(db, table, obj) {   // insert only the columns the table has (handover and shipped shapes differ)
  var have = (db.prepare('PRAGMA table_info(' + table + ')').all() || []).map(function (r) { return String(r.name).toLowerCase(); });
  var ks = Object.keys(obj).filter(function (k) { return have.indexOf(k) >= 0; });
  db.prepare('INSERT INTO ' + table + '(' + ks.join(',') + ') VALUES(' + ks.map(function () { return '?'; }).join(',') + ')').run(ks.map(function (k) { return obj[k]; }));
}
function _nextId(db, table, col) { return (getRow(db, 'SELECT COALESCE(MAX(' + col + '),0) AS m FROM ' + table, []) || { m: 0 }).m + 1; }
function applyCostUpdate(db, u, dateAcct) {
  var w = u.set, hasCostCols = _hasCol(db, 'm_cost', 'cumulatedqty');
  if (!w && !(typeof u.delta === 'number' && isFinite(u.delta))) throw new Error('applyCostUpdate: update has neither .set (absolute state) nor a numeric .delta — refused, not applied as NULL');
  var key = [num(u.m_product_id), num(u.c_acctschema_id), num(u.m_costtype_id), num(u.m_costelement_id)];
  var row = getRow(db, 'SELECT * FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?', key);
  if (!row) db.prepare('INSERT INTO m_cost(m_product_id,c_acctschema_id,m_costtype_id,m_costelement_id,currentcostprice,cumulatedamt,cumulatedqty,currentqty) VALUES(?,?,?,?,0,0,0,0)').run(key);
  if (w) db.prepare('UPDATE m_cost SET currentqty=?, currentcostprice=?' + (hasCostCols ? ', cumulatedqty=?, cumulatedamt=?' : '') + ' WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?')
    .run([w.currentqty, w.currentcostprice].concat(hasCostCols ? [w.cumulatedqty, w.cumulatedamt] : [], key));
  else db.prepare('UPDATE m_cost SET currentqty=COALESCE(currentqty,0)+?, currentcostprice=COALESCE(?, currentcostprice) WHERE m_product_id=? AND c_acctschema_id=? AND m_costtype_id=? AND m_costelement_id=?').run([u.delta, u.currentcostprice == null ? null : u.currentcostprice].concat(key));
  var h = u.history;
  if (h && dateAcct && _hasCol(db, 'm_costhistory', 'm_costhistory_id')) {
    var day = _dayOf(dateAcct) + ' 00:00:00', client = row && row.ad_client_id != null ? row.ad_client_id : 0, org = row && row.ad_org_id != null ? row.ad_org_id : 0, cdId = 0;
    if (!_hasCol(db, 'm_costhistory', 'c_acctschema_id')) {
      // SHIPPED shape (erp/model_cost.js:99-103,505-507): the history row hangs off a processed cost detail that carries the schema (MCostDetail.process -> new MCostHistory)
      if (!_hasCol(db, 'm_costdetail', 'c_acctschema_id')) return;
      cdId = _nextId(db, 'm_costdetail', 'm_costdetail_id');
      _insertRow(db, 'm_costdetail', { m_costdetail_id: cdId, c_acctschema_id: num(u.c_acctschema_id), m_product_id: num(u.m_product_id), m_costelement_id: num(u.m_costelement_id), m_costtype_id: num(u.m_costtype_id),
        m_attributesetinstance_id: 0, dateacct: day, processed: 'Y', isactive: 'Y', ad_client_id: client, ad_org_id: org, isbackdate: 'N' });
    }
    _insertRow(db, 'm_costhistory', { m_costhistory_id: _nextId(db, 'm_costhistory', 'm_costhistory_id'), m_costdetail_id: cdId, c_acctschema_id: num(u.c_acctschema_id), m_product_id: num(u.m_product_id), m_costtype_id: num(u.m_costtype_id),
      m_costelement_id: num(u.m_costelement_id), m_attributesetinstance_id: 0, ad_client_id: client, ad_org_id: org, isactive: 'Y', isbackdate: 'N', dateacct: day,
      oldqty: h.oldqty, newqty: h.newqty, oldcostprice: h.oldcostprice, newcostprice: h.newcostprice, oldcamt: h.oldcamt, newcamt: h.newcamt, oldcqty: h.oldcqty, newcqty: h.newcqty });
  }
}
// F9.2 (numbered gap, spec §78): inside the BackDateDay window legacy RE-POSTS every later document (DocManager.startBackDateProcess :640-900). Not ported — named, so the posting is refused
// instead of silently diverging. BackDateDay NULL/0 (every pilot schema) ⇒ never inside the window ⇒ null. today = the host calendar day ('YYYY-MM-DD').
function costBackDateGap(db, dateAcct, today) {
  if (!today) { var n = new Date(); today = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }   // host calendar day (the legacy server's local day)
  if (!dateAcct || !_hasCol(db, 'c_acctschema', 'backdateday') || _dayOf(dateAcct) >= _dayOf(today)) return null;
  var sch = allRows(db, 'SELECT c_acctschema_id AS id, backdateday AS bd FROM c_acctschema' + (_hasCol(db, 'c_acctschema', 'isactive') ? " WHERE isactive='Y'" : ''), []);
  for (var i = 0; i < sch.length; i++) {
    var bd = Number(sch[i].bd) || 0; if (bd <= 0) continue;
    var lim = new Date(_dayOf(today) + 'T00:00:00Z'); lim.setUTCDate(lim.getUTCDate() - bd);
    if (_dayOf(dateAcct) >= lim.toISOString().slice(0, 10)) return 'back-date re-processing within BackDateDay=' + bd + ' not ported (DocManager.startBackDateProcess; spec §78 F9.2), Schema=' + sch[i].id;
  }
  return null;
}
// §REVIEW-FIX-2026-10-11 D5 — the ORIGINAL document's posted books. Doc_InOut reverses by copying the original's facts with Dr/Cr swapped (FactLine.updateReverseLine,
// FactLine.java:1357-1359; Doc_InOut.java:288-301): the amounts are what was POSTED, never a re-derive at today's cost. The SQLite books are fact_acct rows the host wrote when the original
// posted (line-tagged). Returns null when the db carries no such rows (then the caller keeps its recompute and says so — reversalBasis). cents; per account and per original line.
function _postedFacts(db, table_id, recordId, schema) {
  if (!_hasCol(db, 'fact_acct', 'record_id') || !_hasCol(db, 'fact_acct', 'ad_table_id')) return null;
  var rows = allRows(db, 'SELECT account_id, line_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=? AND record_id=? AND c_acctschema_id=?', [table_id, num(recordId), num(schema)]);
  if (!rows.length) return null;
  var byAcct = {}, byLine = {};
  rows.forEach(function (r) {
    var dr = cents(r.amtacctdr), cr = cents(r.amtacctcr), k = num(r.account_id);
    if (!byAcct[k]) { var ev = _hasCol(db, 'c_elementvalue', 'c_elementvalue_id') ? getRow(db, 'SELECT value, name FROM c_elementvalue WHERE c_elementvalue_id=?', k) : null; byAcct[k] = { account_id: k, value: ev ? ev.value : null, name: ev ? ev.name : null, dr: 0, cr: 0 }; }
    byAcct[k].dr += dr; byAcct[k].cr += cr;
    var lk = num(r.line_id); if (lk) byLine[lk] = (byLine[lk] || 0) + dr;   // the line's cost amount = its Dr leg (Dr COGS / Cr Asset of a sales shipment)
  });
  return { by: byAcct, line: byLine };
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
// MTax.calculateTax (MTax.java:340-372): THIN ADAPTER over the ONE port, BigDecimal.mtaxCalculate (bigdecimal.js). Shape only: amt12 = amount as a BigInt at scale 12, `scale` = rounding scale, returns the tax as a BigInt at `scale`.
function _mtaxCalc(t, kids, amt12, incl, scale) {
  var BD = typeof BigDecimal !== 'undefined' ? BigDecimal : require('./bigdecimal');
  return BD.mtaxCalculate(t, new BD(amt12, 12), incl, scale, kids).setScale(scale, BD.RoundingMode.HALF_UP).unscaledValue();
}
// Doc_InOut.createFacts:719-783 (@{u} org.compiere.acct): the per-unit receipt cost of an order line = PriceCost, else PriceActual corrected for tax: included tax is taken OUT unless the tax is
// distributed with the line item (TaxPostingIndicator '1'); an excluded tax is ADDED only when distributed (calculated at scale 12, not rounded to the currency before x Qty). Returns a decimal string.
function _poLineCost(db, ol, absent) {
  var hasCost = ol.pricecost != null && Number(ol.pricecost) !== 0, price = hasCost ? ol.pricecost : ol.priceactual;
  if (hasCost || !num(ol.c_tax_id)) return price;
  var t = getRow(db, 'SELECT * FROM c_tax WHERE c_tax_id=?', num(ol.c_tax_id)); if (!t) { absent.push('c_tax#' + ol.c_tax_id); return null; }
  var dist = function (x) { return String(x.taxpostingindicator) === '1'; };
  // MTax.getChildTaxes:254-259: parent_tax_id=?, setOnlyActiveRecords(true), setClient_ID() (the line's client)
  var kidSql = "SELECT * FROM c_tax WHERE parent_tax_id=?", kidArgs = [num(ol.c_tax_id)];
  if (_hasCol(db, 'c_tax', 'isactive')) kidSql += " AND isactive='Y'";
  if (_hasCol(db, 'c_tax', 'ad_client_id') && ol.ad_client_id != null) { kidSql += ' AND ad_client_id=?'; kidArgs.push(num(ol.ad_client_id)); }
  var kids = String(t.issummary) === 'Y' ? allRows(db, kidSql, kidArgs) : [];
  // MOrderLine.isTaxIncluded:697-707 -- ONLY the order's price list (IsTaxIncluded); no price list / no row => legacy NPE => refused (absent), never a guessed flag
  var o = num(ol.c_order_id) ? getRow(db, 'SELECT m_pricelist_id, c_currency_id FROM c_order WHERE c_order_id=?', num(ol.c_order_id)) : null;
  if (!o || !num(o.m_pricelist_id) || !_hasCol(db, 'm_pricelist', 'istaxincluded')) { absent.push('order price list (MOrderLine.isTaxIncluded:697-707)'); return null; }
  var pl = getRow(db, 'SELECT istaxincluded FROM m_pricelist WHERE m_pricelist_id=?', num(o.m_pricelist_id));
  if (!pl) { absent.push('m_pricelist#' + o.m_pricelist_id); return null; }
  var incl = String(pl.istaxincluded) === 'Y';
  // Doc_InOut:727 MCurrency.getStdPrecision(orderLine.getC_Currency_ID()) -- no currency / no precision => absent (no invented 2)
  var cur = ol.c_currency_id != null ? ol.c_currency_id : (ol.ocur != null ? ol.ocur : o.c_currency_id);
  var sp = cur != null && _hasCol(db, 'c_currency', 'stdprecision') ? getRow(db, 'SELECT stdprecision AS p FROM c_currency WHERE c_currency_id=?', num(cur)) : null;
  if (!sp || sp.p == null) { absent.push('currency std precision (c_currency#' + cur + ')'); return null; }
  var std = num(sp.p), up = function (x, sc) { return x * 10n ** BigInt(12 - sc); }, costs = _scaleTo(_bigDec(price), 12);
  if (incl) {
    if (Number(t.rate) !== 0) {
      var costTax = up(_mtaxCalc(t, kids, costs, true, std), std);
      if (String(t.issummary) === 'Y') {
        var sub = kids.filter(function (c) { return !dist(c); });
        if (sub.length) { var base = costs - costTax; sub.forEach(function (c) { costs -= up(_mtaxCalc(c, [], base, false, std), std); }); }
      } else if (!dist(t)) costs -= costTax;
    }
  } else if (String(t.issummary) === 'Y') {
    var base0 = costs; kids.forEach(function (c) { if (dist(c)) costs += _mtaxCalc(c, [], base0, false, 12); });
  } else if (dist(t)) costs += _mtaxCalc(t, [], costs, false, 12);
  return _fmtDec(costs, 12);
}
// MatchPO → Average-PO cost (Doc_MatchPO.createFacts :285-410 + createMatchPOCostDetail :584-660 → MCostDetail.createOrder → process :1560-1576 → MCost.setWeightedAverage MCost.java:1696-1742).
// poCost = order line PriceCost else PriceActual (tax corrections named absent), × rate and HALF_UP at the currency COSTING precision when the order is in another currency;
// amount = Σ (other MatchPOs of the line with a receipt, same DateAcct) + poCost × qty, HALF_UP at the costing precision; weighted average: old = price × curQty / (curQty+qty), new = amt / (curQty+qty)
// (each at scale 12 HALF_UP), sum rounded to 2 × costing precision when longer; CumulatedAmt/Qty and CurrentQty += amt/qty. Returns the NEW m_cost values per schema for the
// Average-PO element only (other elements: named, not ported). Refuses (absent) on AverageCostingNegativeQty / ZeroQty exactly where legacy throws.
function _decStr(v) { return _bigDec(v); }
function _scaleTo(d, k) { return k >= d.k ? d.n * 10n ** BigInt(k - d.k) : _rhuB(d.n, 10n ** BigInt(d.k - k)); }
function _fmtDec(n, k) { var neg = n < 0n, a = neg ? -n : n, t = a.toString().padStart(k + 1, '0'); return (neg ? '-' : '') + (k ? t.slice(0, -k) + '.' + t.slice(-k) : t); }
// the active accounting schemas the costing walks (every one posts; IsActive only where the column exists) — one definition for all of the cost-quantity code
// The schemas legacy costs and posts in — MAcctSchema.getClientAcctSchema (MAcctSchema.java:150-153): ACTIVE and with BOTH a C_AcctSchema_GL and a
//   C_AcctSchema_Default row (the model layer ports the whole rule: model_master.js:70 clientAcctSchemas). Without this a half-made schema (the pilot's
//   NC4 test schemas: active, no GL row) made the twin refuse a shipment legacy posted (BIMCompiler prompts/SQLiteIDEMPIERE.md §S-SCHEMASET). Table-guarded;
//   callers pass no client, so the client filter / primary-first order of the legacy method are not applied here.
function _activeSchemas(db, withCur) {
  var w = [], hasT = function (t) { return !!getRow(db, "SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?", t); };
  if (_hasCol(db, 'c_acctschema', 'isactive')) w.push("s.isactive='Y'");
  if (hasT('c_acctschema_gl')) w.push('EXISTS (SELECT 1 FROM c_acctschema_gl gl WHERE gl.c_acctschema_id=s.c_acctschema_id)');
  if (hasT('c_acctschema_default')) w.push('EXISTS (SELECT 1 FROM c_acctschema_default d WHERE d.c_acctschema_id=s.c_acctschema_id)');
  return allRows(db, 'SELECT s.c_acctschema_id AS id, s.m_costtype_id AS ct' + (withCur ? ', s.c_currency_id AS cur' : '') + ' FROM c_acctschema s' + (w.length ? ' WHERE ' + w.join(' AND ') : '') + ' ORDER BY s.c_acctschema_id', []);
}
function costUpdatesForMatchPO(db, matchPOId) {   // → { updates:[new m_cost values], absent:[names] } — ONE shape (§REVIEW2 R6): a caller loops .updates, never meets a {absent} pseudo-record
  var mp = getRow(db, 'SELECT * FROM m_matchpo WHERE m_matchpo_id=?', num(matchPOId)); if (!mp || !num(mp.m_inoutline_id)) return { updates: [], absent: [] };
  var ol = getRow(db, 'SELECT ol.*, o.c_currency_id AS ocur, o.ad_client_id AS oclient, o.ad_org_id AS oorg FROM c_orderline ol LEFT JOIN c_order o ON o.c_order_id=ol.c_order_id WHERE ol.c_orderline_id=?', num(mp.c_orderline_id)); if (!ol) return { updates: [], absent: [] };
  var io = getRow(db, 'SELECT h.dateacct, h.ad_client_id, h.ad_org_id FROM m_inoutline l JOIN m_inout h ON h.m_inout_id=l.m_inout_id WHERE l.m_inoutline_id=?', num(mp.m_inoutline_id));
  var out = [], absent = [], poPrice, poPriceDone = false;   // _poLineCost does not depend on the schema: once per order line
  _activeSchemas(db, true).forEach(function (sc) {
    if (costingMethodOf(db, mp.m_product_id, sc.id) !== 'A') return;
    var el = getRow(db, "SELECT m_costelement_id FROM m_costelement WHERE costingmethod='A' ORDER BY m_costelement_id LIMIT 1", []); if (!el) return;
    var cp = getRow(db, 'SELECT ' + (_hasCol(db, 'c_currency', 'costingprecision') ? 'costingprecision' : 'NULL') + ' AS p FROM c_currency WHERE c_currency_id=?', num(sc.cur));
    if (!cp || cp.p == null) { absent.push('currency costing precision'); return; }
    var prec = num(cp.p); if (!poPriceDone) { poPrice = _poLineCost(db, ol, absent); poPriceDone = true; } var price = poPrice; if (price == null) return;
    var po = _decStr(price), cur = ol.c_currency_id != null ? ol.c_currency_id : ol.ocur;
    if (num(cur) !== num(sc.cur)) {   // Doc_MatchPO.java:391-408
      var rate = fxRate(db, cur, sc.cur, io && io.dateacct, ol.oclient || 11, ol.oorg || 0); if (rate == null) { absent.push('PurchaseOrderNotConvertible'); return; }
      var r = _decStr(rate), n = po.n * r.n, k = po.k + r.k; po = k > prec ? { n: _rhuB(n, 10n ** BigInt(k - prec)), k: prec } : { n: n, k: k };
    }
    var qd = _decStr(mp.qty), amtN = po.n * qd.n, amtK = po.k + qd.k;   // poCost × qty (other same-day MatchPOs of the line: none in scope ⇒ named below)
    var others = allRows(db, 'SELECT m_matchpo_id FROM m_matchpo WHERE c_orderline_id=? AND m_matchpo_id<>? AND m_inoutline_id IS NOT NULL', [num(mp.c_orderline_id), num(matchPOId)]);
    if (others.length) { absent.push('partial MatchPO accumulation not ported (Doc_MatchPO.java:596-640)'); return; }
    if (amtK > prec) { amtN = _rhuB(amtN, 10n ** BigInt(amtK - prec)); amtK = prec; }
    var c = _costBase(db, mp.m_product_id, sc.id, sc.ct, el.m_costelement_id, 'A', io && io.dateacct);   // §78: base = cost history at the receipt's DateAcct, else the m_cost row
    var cq = _decStr(c.qty), cpz = _decStr(c.price), ca = _decStr(c.cumamt), cuq = _decStr(c.cumqty);
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
    var uo = { m_product_id: num(mp.m_product_id), c_acctschema_id: sc.id, m_costtype_id: sc.ct, m_costelement_id: num(el.m_costelement_id),
      currentcostprice: Number(_fmtDec(newPrice, S)), currentqty: Number(_fmtDec(cq12 + q12, S)), cumulatedamt: Number(_fmtDec(_scaleTo(ca, S) + amtS, S)), cumulatedqty: Number(_fmtDec(_scaleTo(cuq, S) + q12, S)) };
    _extra(uo, { currentqty: uo.currentqty, currentcostprice: uo.currentcostprice, cumulatedqty: uo.cumulatedqty, cumulatedamt: uo.cumulatedamt },
      { oldqty: Number(c.qty), newqty: uo.currentqty, oldcostprice: Number(c.price), newcostprice: uo.currentcostprice, oldcqty: Number(c.cumqty), newcqty: uo.cumulatedqty, oldcamt: Number(c.cumamt), newcamt: uo.cumulatedamt }, c.source);
    out.push(uo);
  });
  if (absent.length) return { updates: [], absent: absent };   // legacy throws / skips the whole document where a link is missing: no partial update list
  return { updates: out, absent: [] };
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
function _costRow(db, state, pid, sch, ct, el, cm, dateAcct) {
  var k = [pid, sch, ct, el].join('|');
  if (!state[k]) state[k] = _costBase(db, pid, sch, ct, el, cm, dateAcct);   // §78: base = the cost history at the detail's DateAcct, else the m_cost row
  return state[k];
}
// The §78 additions (u.set absolute new state, u.history the MCostHistory row, u.baseSource 'history'|'m_cost') are plain ENUMERABLE fields: an update that is JSON-serialised, structuredClone'd or
// spread still carries them, so applyCostUpdate applies the same state (a host that cloned an update and silently lost them used to fall into the delta path). Goldens that print whole updates
// strip them (poc_review2 R6/R7 `J(...)` helpers).
function _extra(u, set, history, baseSource) { u.set = set; u.history = history; u.baseSource = baseSource; }
function _avgUpdate(db, state, out, pid, sc, e, delta, amtDecOf, dateAcct, noCum) {   // noCum: MCostDetail.isShipment() (SO trx + inout line) -- a customer-shipment reversal/return does NOT accumulate (MCostDetail.java:1728-1734, 1759-1765)
  var u = { m_product_id: num(pid), c_acctschema_id: sc.id, m_costtype_id: sc.ct, m_costelement_id: e.id, delta: delta };
  var c = _costRow(db, state, pid, sc.id, sc.ct, e.id, e.cm, dateAcct), old = { qty: Number(c.qty), price: c.price, cumqty: Number(c.cumqty), cumamt: c.cumamt };
  if (delta > 0 && (e.cm === 'A' || e.cm === 'I')) {
    var prec = _costingPrecision(db, sc.id), amt = prec == null ? null : amtDecOf(c, prec);
    if (amt != null) {
      u.currentcostprice = _wavg(c.price, c.qty, amt, delta, prec); c.price = String(u.currentcostprice);
      // MCost.setWeightedAverage (MCost.java:1740-1741): CumulatedAmt += amt, CumulatedQty += qty (Physical Inventory gain, project/other additions; found by the shop-day P2P cost key 30@20/600 vs 30@20/0)
      if (!noCum) { var S12 = 12, add = function (a, b) { return Number(_fmtDec(_scaleTo(_bigDec(a), S12) + _scaleTo(_bigDec(b), S12), S12)); }; c.cumamt = add(c.cumamt, amt); c.cumqty = add(c.cumqty, delta); }
    }
  }
  c.qty = Number(c.qty) + delta;
  // absolute new state + the MCostHistory row (old = the base this detail started from) — applied by applyCostUpdate (§78)
  _extra(u, { currentqty: c.qty, currentcostprice: Number(c.price), cumulatedqty: Number(c.cumqty), cumulatedamt: Number(c.cumamt) },
    { oldqty: old.qty, newqty: c.qty, oldcostprice: Number(old.price), newcostprice: Number(c.price), oldcqty: old.cumqty, newcqty: Number(c.cumqty), oldcamt: Number(old.cumamt), newcamt: Number(c.cumamt) }, c.source);
  out.push(u);
}
// §71 (F35) MCost.getCurrentCost (MCost.java:286-330 @{u}): current cost × qty, HALF_UP at the schema COSTING precision — decimal string, null without a cost (the host's MCost.getCost)
function costAt(db, productId, qty, schema, dateAcct) {   // dateAcct optional: MCost.getCost reads the history of the document's DateAcct (DocLine.java:833-838)
  var cc = currentCost(db, productId, schema, dateAcct), prec = _costingPrecision(db, schema);
  if (cc.price == null || prec == null || Number(cc.price) === 0) return null;
  var pd = _bigDec(cc.price), qd = _bigDec(qty);
  return _fmtDec(_rhuB(pd.n * qd.n * 10n ** BigInt(prec), 10n ** BigInt(pd.k + qd.k)), prec);
}
function costQtyUpdatesFor(db, table, id) {
  if (table === 'M_InOut') return costQtyUpdates(db, id);
  if (table === 'C_ProjectIssue' && _hasCol(db, 'm_cost', 'currentqty')) {   // §71 (F35): MCostDetail.createProjectIssue, qty −MovementQty ⇒ a decrease changes only CurrentQty (MCostDetail.process)
    var els0 = _costingElements(db), sch0 = _activeSchemas(db), out0 = [], st0 = {};
    var pi = getRow(db, 'SELECT m_product_id, movementqty FROM c_projectissue WHERE c_projectissue_id=?', num(id));
    if (pi && Number(pi.movementqty) && _isStocked(db, pi.m_product_id)) sch0.forEach(function (sc) { els0.forEach(function (e) { _avgUpdate(db, st0, out0, pi.m_product_id, sc, e, -Number(pi.movementqty), function () { return null; }); }); });
    return out0;
  }
  if (table !== 'M_Inventory' || !_hasCol(db, 'm_cost', 'currentqty')) return [];
  if (inventoryPostRefused(db, id)) return [];   // §SHOPDAY-RUN-2 R2.1: posting refused ("No Costs", Posted=E) => no cost detail, cost state unchanged
  var els = _costingElements(db), schemas = _activeSchemas(db), out = [], state = {};
  allRows(db, 'SELECT m_product_id, qtybook, qtycount FROM m_inventoryline WHERE m_inventory_id=?', num(id)).forEach(function (l) {
    var d = Number(l.qtycount) - Number(l.qtybook); if (!d || !_isStocked(db, l.m_product_id)) return;
    // inventory gain: the cost detail amount = qty × current cost, HALF_UP at the costing precision (pilot history: 2 × 2.29763318 ⇒ 4.5953)
    schemas.forEach(function (sc) { els.forEach(function (e) { _avgUpdate(db, state, out, l.m_product_id, sc, e, d, function (c, prec) { var pr = _bigDec(c.price), q = _bigDec(d); return _fmtDec(_rhuB(pr.n * q.n * 10n ** BigInt(prec), 10n ** BigInt(pr.k + q.k)), prec); }); }); });
  });
  return out;
}
// §REVIEW2 R3 — the sign follows the DOCUMENT TYPE, as Doc_InOut does: loadLines :139 DocLine.setQty(qty, isSOTrx = MatShipment) negates the qty of a shipment (MMS: C-, V-) and keeps a receipt's (MMR);
// the cost detail (MCostDetail.createShipment, qty = line.getQty()) is created only in the shipment branches (:198-300, :922-) and the sales-RETURN receipt branch (:452-640, movement C+);
// the PURCHASE receipt branch (:676, movement V+) creates none — the quantity reaches the cost row through MatchPO / MatchInv (Doc_MatchPO / Doc_MatchInv). movementtype absent ⇒ the C- default.
function _costQtySign(movementtype) {
  var mt = String(movementtype || 'C-');
  if (mt === 'V+') return 0;                       // vendor receipt: no cost detail from Doc_InOut
  return mt.charAt(1) === '+' ? 1 : -1;            // C+ sales return +qty; C- / V- shipments -qty
}
function costQtyUpdates(db, ioId) {
  if (!_hasCol(db, 'm_cost', 'currentqty')) return [];
  var lines = allRows(db, 'SELECT m_product_id, movementqty' + (_hasCol(db, 'm_inoutline', 'reversalline_id') ? ', reversalline_id' : '') + ' FROM m_inoutline WHERE m_inout_id=?', num(ioId));
  var hcols = ['movementtype', 'reversal_id', 'dateacct'].filter(function (c) { return _hasCol(db, 'm_inout', c); });
  var hdr = hcols.length ? getRow(db, 'SELECT ' + hcols.join(', ') + ' FROM m_inout WHERE m_inout_id=?', num(ioId)) : null, origIo = hdr && num(hdr.reversal_id) ? num(hdr.reversal_id) : null;
  var sign = _costQtySign(hdr && hdr.movementtype);
  if (!sign) return [];
  // §SD16 (finding 10): a customer-return REVERSAL (C+ with Reversal_ID) has no books (the retired doc_poster return fold named it absent, gap G-SD10 — the REAL poster now books it from the original, §POSTING-PARITY 5e), so it must move no cost either -- books and cost detail agree.
  if (sign > 0 && origIo) return [];
  var els = _costingElements(db), schemas = _activeSchemas(db), out = [], state = {};
  // neither the posted facts (per schema) nor the current cost (per product, schema) depend on the costing element or the line count: read once per call (§REVIEW2 R7)
  var pfCache = {}, ccCache = {};
  function posted(schId) { if (!(schId in pfCache)) pfCache[schId] = _postedFacts(db, 319, origIo, schId); return pfCache[schId]; }
  var dAcct = hdr && hdr.dateacct ? hdr.dateacct : null;   // §78: the shipment's DateAcct selects the cost history
  // §SD16 (finding 6): a customer-return receipt (C+) whose stocked line has NO current cost is the posting error "No Costs for X" (Doc_InOut.java:535-545) -- the document is not posted, so legacy creates NO cost detail;
  // the cost update agrees with the books (the retired doc_poster return fold). Only C+ is touched; every other movement keeps its previous path.
  if (sign > 0) {
    var refused = lines.some(function (l) { return Number(l.movementqty) !== 0 && _isStocked(db, l.m_product_id) && schemas.some(function (sc) { var c0 = currentCost(db, l.m_product_id, sc.id, dAcct); return c0.price == null || Number(c0.price) === 0; }); });
    if (refused) return [];
  }
  function costOf(pid, schId) { var k = pid + '|' + schId; if (!(k in ccCache)) ccCache[k] = currentCost(db, pid, schId, dAcct); return ccCache[k]; }
  lines.forEach(function (l) {
    if (!_isStocked(db, l.m_product_id)) return;
    schemas.forEach(function (sc) { els.forEach(function (e) {
      // a reversal line (qty already negated ⇒ +qty) re-adds at its POSTED amount = the original line's cost amount in this schema, cent-rounded (Doc_InOut reversal facts; pilot history 1 × 2.2976 ⇒ 2.30)
      _avgUpdate(db, state, out, l.m_product_id, sc, e, sign * Number(l.movementqty), function () {
        // §REVIEW-FIX D5: a reversal line re-adds at the amount the ORIGINAL line POSTED (its books), not at today's cost; no posted original ⇒ the previous recompute
        if (origIo && num(l.reversalline_id)) { var pf = posted(sc.id); if (pf && pf.line[num(l.reversalline_id)]) return _fmtDec(BigInt(pf.line[num(l.reversalline_id)]), 2); }
        // §SD16 (R-MMR5): an ADDITION (customer return, C+) moves the weighted average by the cost detail amount = qty x current cost at the schema COSTING precision (MCost.getCost, costAt), not the 2-decimal books amount
        if (sign > 0) { var ca = costAt(db, l.m_product_id, Math.abs(Number(l.movementqty)), sc.id, dAcct); if (ca != null) return ca; }   // null (no costing precision): fall through to the previous 2-decimal amount
        var cc = costOf(l.m_product_id, sc.id); if (cc.price == null) return null;
        var pd = _bigDec(cc.price), qd = _bigDec(Math.abs(Number(l.movementqty))); return _fmtDec(_rhuB(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k)), 2); }, dAcct, true);
    }); });
  });
  return out;
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
function deriveCash(db, R, id, schema) {
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
  if (dr !== cr) balanceAccounting(db, R, d.by, d.absent, schema, dr - cr);
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
// Doc_Inventory.createFacts:300-335 -- the line's cost = the schema-costing-method material element's CurrentCostPrice; zero AND no zero-cost-blessing M_CostDetail => "No Costs for <product>".
function _inventoryLineCost(db, l, schema) {
  var as = schemaRow(db, schema);
  return getRow(db,
    "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
    " AND e.costelementtype='M' AND e.costingmethod=? WHERE c.m_product_id=? AND c.c_acctschema_id=? AND c.m_costtype_id=?",
    [as ? String(as.costingmethod) : '', num(l.m_product_id), num(schema), as ? num(as.m_costtype_id) : 0]);
}
// Doc_Inventory.createFacts: `costs == null || costs.signum() == 0` (exact decimal sign, a sub-cent price is NOT zero) => only `product.isStocked()` lines refuse; a service is ignored (`continue`).
// MProduct.isStocked:602-605 = IsStocked AND isItem (ProductType 'I'); a missing column is read as stocked (nothing to test it with).
function _legacyStocked(db, pid) {
  var hs = _hasCol(db, 'm_product', 'isstocked'), ht = _hasCol(db, 'm_product', 'producttype');
  if (!hs && !ht) return true;
  var r = getRow(db, 'SELECT ' + (hs ? 'isstocked' : "'Y' AS isstocked") + ', ' + (ht ? 'producttype' : "'I' AS producttype") + ' FROM m_product WHERE m_product_id=?', num(pid));
  return !r || (String(r.isstocked) === 'Y' && String(r.producttype) === 'I');
}
function _inventoryNoCosts(db, l, schema) {
  var cost = _inventoryLineCost(db, l, schema);
  if (cost && cost.p != null && _bigDec(cost.p).n !== 0n) return false;
  if (!_legacyStocked(db, l.m_product_id)) return false;     // service / non-stocked: ignored, never refused
  var bless = getRow(db,
    "SELECT COUNT(*) AS n FROM m_costdetail WHERE m_product_id=? AND processed='Y' AND amt=0.00 AND qty>0" +
    " AND (c_orderline_id>0 OR c_invoiceline_id>0)", num(l.m_product_id));
  return !bless || Number(bless.n) === 0;
}
// §SHOPDAY-RUN-2 R2.1: Doc.post rolls the whole document back when ANY active schema's createFacts fails, and the MCostDetail (cost qty/amt) is created at the END of
// Doc_Inventory.createFacts (never reached on "No Costs") => a refused Physical Inventory changes NO cost state. true when any line is refused in any active schema.
function inventoryPostRefused(db, id) {
  var lines = allRows(db, 'SELECT * FROM m_inventoryline WHERE m_inventory_id=? AND isactive=\'Y\'', num(id)), sch = _activeSchemas(db);
  return lines.some(function (l) { return sch.some(function (sc) { return _inventoryNoCosts(db, l, sc.id); }); });
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
// Column probe, cached per (db, table, col) -- positives AND negatives -- and invalidated whenever the database's schema_version changes (ANY DDL, e.g. a patch adding a column mid-run),
// so a negative can never go stale. A db that cannot report schema_version caches positives only (the old behaviour). resetSchemaCache(db) drops the cache for a host that wants it explicitly.
var _colCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function resetSchemaCache(db) { if (_colCache && db && typeof db === 'object') _colCache.delete(db); }
function _schemaVersion(db) { try { var r = db.prepare('PRAGMA schema_version').get(); return r ? r.schema_version : null; } catch (e) { return null; } }
function _hasCol(db, table, col) {
  var m = null, k = table + '.' + col, sv = null;
  if (_colCache && db && typeof db === 'object') {
    sv = _schemaVersion(db); m = _colCache.get(db);
    if (!m || (sv != null && m.__sv !== sv)) { m = { __sv: sv }; _colCache.set(db, m); }
    if (m[k] === true || (m[k] === false && sv != null)) return m[k];
  }
  var ok;
  try { ok = (db.prepare('PRAGMA table_info(' + table + ')').all() || []).some(function (r) { return String(r.name).toLowerCase() === col; }); }
  catch (e) { ok = false; }
  if (m && (ok || sv != null)) m[k] = ok;
  return ok;
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
           gl_category_id: gl.id, gl_category_stage: gl.stage, postStatus: d.postStatus, reversalBasis: d.reversalBasis };   // §75: a legacy Doc status other than posted ('i' InvalidAccount), when the fold knows it
}

/**
 * derivePostings(db, recordRef, schema, R) -> the fold for the doc the action would post.
 *   recordRef = { table:'C_Order'|'C_Invoice', id }. C_Order → its generated invoice manifest (oracle
 *   path); a true-draft order with no invoice → the projected order manifest (basis='order', no oracle).
 *   Shipment COGS/Inventory leg is the §8 follow-up (cost data named-deferred in seed) — NOT in this slice.
 *   W-PREVIEW-IS-POSTING: the Posting-Preview no longer derives through here for any table model_post has a Doc class for (it renders ModelPost.previewFacts —
 *   the real poster on a never-committed Trx). The C_Payment / M_MatchInv / M_MatchPO / GL_Journal / M_Inventory branches were deleted with their derive*; the
 *   remaining branches serve genesis.html, the --engine-dir parity scripts, witnesses, classes with no model_post equivalent and the draft-order projection.
 */
function derivePostings(db, recordRef, schema, R) {
  R = R || _R();
  if (!R) throw new Error('doc_poster: post_resolver (R) unavailable');
  var table = recordRef.table || recordRef.doc_type;
  var id = num(recordRef.id != null ? recordRef.id : recordRef.record_id);
  // §P9 — the GL_Category is resolved from the document ACTUALLY POSTED, so an order that folds through its
  //   generated invoice takes the INVOICE's doctype (that is the Doc iDempiere builds), not the order's.
  var glOf = function (t, i) { return glCategoryFor(db, t, i); };
  if (table === 'C_Order') {
    var invId = invoiceForOrder(db, id);
    if (invId != null) return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };   // the order's invoice posts through the REAL poster (erp_preview routes it; §POSTING-PARITY 5g)
    return finish(deriveOrder(db, R, id, schema), 'order', glOf('c_order', id));   // draft projection — no oracle
  }
  // B-3 0-seed classes (W-POST-B3 §W-3) — these read per-asset/project acct config, not R tokens
  if (table === 'A_Asset_Addition') return finish(deriveAssetAddition(db, id, schema), 'fa-addition', glOf('a_asset_addition', id));
  if (table === 'A_Depreciation_Entry') return finish(deriveDepreciationEntry(db, id, schema), 'fa-depreciation', glOf('a_depreciation_entry', id));
  if (table === 'A_Asset_Reval') return finish(deriveAssetReval(db, id, schema), 'fa-reval', glOf('a_asset_reval', id));
  if (table === 'A_Asset_Transfer') return finish(deriveAssetTransfer(db, id, schema, recordRef.primarySchema), 'fa-transfer', glOf('a_asset_transfer', id));
  if (table === 'A_Asset_Disposed') return finish(deriveAssetDisposed(db, id, schema), 'fa-disposal', glOf('a_asset_disposed', id));
  if (table === 'C_ProjectIssue') return finish(deriveProjectIssue(db, id, schema), 'project-issue', glOf('c_projectissue', id));
  // W-POST-TAIL classes (HARDEN_MATRIX.md §W-POST-TAIL)
  if (table === 'M_Requisition') return finish(deriveRequisition(db, id, schema), 'requisition', glOf('m_requisition', id));
  if (table === 'C_Cash') return finish(deriveCash(db, R, id, schema), 'cash', glOf('c_cash', id));
  var dc = docClassFor(table);   // a bundle's posting class (IDocFactory) - after every built-in class, before the empty fallback
  if (dc && typeof dc.derive === 'function') return finish(dc.derive(db, id, schema, R, recordRef), dc.basis || String(table).toLowerCase(), glOf(String(table).toLowerCase(), id));
  return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
}

function _R() { try { return (typeof require !== 'undefined') ? require('./post_resolver') : null; } catch (e) { return null; } }

var _api = { legacyDocClassExists: legacyDocClassExists, legacyDocClassOf: legacyDocClassOf, registerDocClass: registerDocClass, unregisterDocClass: unregisterDocClass, removeDocClassOwner: removeDocClassOwner, docClassFor: docClassFor, describeDocClasses: describeDocClasses, derivePostings: derivePostings, costQtyUpdates: costQtyUpdates, costQtyUpdatesFor: costQtyUpdatesFor, deriveOrder: deriveOrder, invoiceForOrder: invoiceForOrder,
             glCategoryFor: glCategoryFor, fxRate: fxRate, costUpdatesForMatchPO: costUpdatesForMatchPO, costHistoryAt: costHistoryAt, costBase: _costBase, resetSchemaCache: resetSchemaCache, applyCostUpdate: applyCostUpdate, costBackDateGap: costBackDateGap, sysConfig: sysConfig, sysConfigBool: sysConfigBool, costAt: costAt, immediatePostingRefusal: immediatePostingRefusal, isClientAccountingImmediate: isClientAccountingImmediate };   // §P9 (W-POST-GLCATEGORY): the Doc.setDocumentType GL_Category chain, exposed for the witness; fxRate (MConversionRate.getRate shape) for the FA host, spec §63
// UMD tail — node (require) + browser live host (window.DocPoster). erp_preview.js injects window.PostResolver as R.
// Internal helpers for witnesses, exposed on the Node module ONLY (never on window.DocPoster): the public _api is not widened.
if (typeof module !== 'undefined' && module.exports) { module.exports = Object.assign({}, _api, { _test: { poLineCost: _poLineCost, mtaxCalc: _mtaxCalc, inventoryPostRefused: inventoryPostRefused } }); }
if (typeof window !== 'undefined') { window.DocPoster = _api; }
