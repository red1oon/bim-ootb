// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * erp_engine.js — the §0.10 abstract engine, EXTRACTED into one module.
 *   BROWSER SUBSET (2026-11-03, W-ERP-ENGINE-SUBSET): only the verbs a shipped caller uses. The FULL engine, including the
 *   retired verbs (completeInOut/Payment/Cash/Journal/BankStatement, reverse*, voidOrder, fa*, match ...), lives in
 *   bim-compiler scripts/erp_engine.js; a verb needed in the browser is RE-PORTED from there, not re-invented.
 *   Spec: docs/ERP.md §0.9-0.10 (dispatch-by-form), §0.5 (decision tables),
 *   §18 (edges) + this session's POC findings (settlement = partition+polarity+order).
 *
 * Separation contract (this is the fix for the "engine smeared across probes" debt):
 *   - PURE logic only. No DB binding imported. The host injects `query(sql) -> rows[]`
 *     so the SAME core runs under sql.js (browser) AND better-sqlite3 (node tests).
 *   - No Date.now / Math.random / DOM / network — deterministic (replay/dry-run safe).
 *
 * The engine knows TWO things, per the unified model:
 *   GUARDS  — a predicate over an edge (validation / access / state-legality) -> bool.
 *   GENERATE— a predicate that produces edges (the matcher, derivation verbs) -> ops[].
 * Everything dispatches by `form`.
 */
'use strict';
// UMD (docs/ERP_BACKEND_SEPARATION audit (c): the browser copy is a UMD of THIS file, no silent fork) —
// node: module.exports (unchanged) · browser: window.ERPEngine (the POS lens consumes it, POS_ADDON_SPEC §P-2).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ERPEngine = api;
})(typeof window !== 'undefined' ? window : null, function () {

// ── GENERATE: derivation verbs (a BOM derivation = order→child document) ─────
// Verbs return ops[]; the kernel applies + commitOps them (handlers never write).
//
// Implementing ERP_MODEL_ARCHETYPE.md §MOrder — Witness: W-FOLD-BUILDDOC.
// buildDoc is the ARCHETYPE create-verb: stage CREATE_DOCUMENT + CREATE_LINE for a
// child doc, TABLE-PARAMETERISED. This is the single recursion createShipment /
// createInvoice / replenishment-PO all instantiate (FOLD-not-FORK: the two verbs below
// are now spec rows, NOT separate code). A `spec` carries the doc/line tables, the
// parent id field, the per-line source id field, and the qty field MAP (target←source).
//   spec = { docTable, lineTable, parentId, lineParentId, qtyTo, qtyFrom, header?(parent) }
function buildDoc(spec, parent, lines) {
  var doc = { op_type: 'CREATE_DOCUMENT', table: spec.docTable, source_id: parent[spec.parentId] };
  var hdr = spec.header ? spec.header(parent) : null;
  if (hdr) for (var k in hdr) doc[k] = hdr[k];
  var ops = [doc];
  lines.forEach(function (l) {
    var line = { op_type: 'CREATE_LINE', table: spec.lineTable, source_line_id: l[spec.lineParentId], m_product_id: l.m_product_id };
    line[spec.qtyTo] = l[spec.qtyFrom];
    ops.push(line);
  });
  return ops;
}
// The shipped trade verbs, now expressed as buildDoc specs (identical ops out).
var DOC_SPECS = {
  createShipment: { docTable: 'M_InOut', lineTable: 'M_InOutLine', parentId: 'c_order_id', lineParentId: 'c_orderline_id', qtyTo: 'movementqty', qtyFrom: 'qtyordered', header: function (o) { return { movementtype: o.issotrx === 'Y' ? 'C-' : 'V+' }; } },
  createInvoice: { docTable: 'C_Invoice', lineTable: 'C_InvoiceLine', parentId: 'c_order_id', lineParentId: 'c_orderline_id', qtyTo: 'qtyinvoiced', qtyFrom: 'qtyordered', header: function (o) { return { issotrx: o.issotrx }; } }
};
function createShipment(order, lines) { return buildDoc(DOC_SPECS.createShipment, order, lines); }
function createInvoice(order, lines) { return buildDoc(DOC_SPECS.createInvoice, order, lines); }
var VERBS = { createShipment: createShipment, createInvoice: createInvoice };

// ── GENERATE: the StorageOnHand qty spine — net on-hand = Σ signed movement ──────────────────────
// Implementing ERP_MODEL_ARCHETYPE.md §MStorageOnHand / §MTransaction — Witness: W-FOLD-QTYONHAND.
// iDempiere stores inventory qty NOWHERE as a master field — it is a FOLD of every MTransaction, and
// MStorageOnHand.qtyonhand is maintained in lockstep. The genuine engine logic is the SIGN CONVENTION:
// a MovementType code carries its polarity in its TRAILING CHAR ('+'=in, '-'=out), so receipt V+ adds and
// shipment C- subtracts the SAME positive line qty. movementSign extracts that; qtyOnHand reconstructs the
// signed contribution from (movementtype, |qty|) — NOT by trusting a pre-signed column — and accumulates
// per partition (product,locator,asi). This is the spine the backflush DECREMENT and replenishment trigger
// ride. Pure: the host injects the event rows; no DB, no clock.
function movementSign(movementtype) {
  var c = String(movementtype || '').slice(-1);
  if (c === '+') return 1;
  if (c === '-') return -1;
  throw new Error('unknown MovementType polarity: ' + movementtype);
}
// events: [{...}]; opts.keyOf(e)->partition key, opts.typeOf(e)->movementtype, opts.absQtyOf(e)->|qty|.
// Returns { key: netQty }. signedOf(e) (optional) lets the caller also collect the per-event signed value
// for an independent sign-rule check.
function qtyOnHand(events, opts) {
  var keyOf = opts.keyOf, typeOf = opts.typeOf, absQtyOf = opts.absQtyOf;
  var out = {};
  events.forEach(function (e) {
    var signed = movementSign(typeOf(e)) * Math.abs(absQtyOf(e));
    var k = keyOf(e);
    out[k] = (out[k] || 0) + signed;
  });
  return out;
}

// ── The cell handler: decision-table over policy flags -> verb ops ───────────
// completeOrder = state op + (flag-gated) verb fan-out. The flags are DATA
// (erp_rules DOCPOLICY), the verbs are the small registry above.
function completeOrder(order, lines, policy) {
  var ops = [{ op_type: 'SET_STATUS', table: 'C_Order', id: order.c_order_id, doc_status: 'CO' }];
  if (policy.isautogenerateinout === 'Y') ops = ops.concat(VERBS.createShipment(order, lines));
  if (policy.isautogenerateinvoice === 'Y') ops = ops.concat(VERBS.createInvoice(order, lines));
  return ops;
}

// completeInvoice — the standalone (direct) C_Invoice doc-action. Same shape as completeOrder: ONE state op
// + a config-gated fan-out. Implementing ERP_MODEL_ARCHETYPE.md §MInvoice — Witness: W-FOLD-INVOICE.
// The PO-side delta (MInvoice.completeIt:matchInv, line ~2075): for each vendor-invoice line that references a
// material receipt (`!IsSOTrx && M_InOutLine_ID<>0`) create ONE M_MatchInv junction (invoice-line ⋈ receipt-line
// @ qtyinvoiced). M_MatchInv is a single junction record (NOT a header+lines document), so it rides the existing
// CREATE_LINE kernel op — no buildDoc (which would wrongly emit a doc+line pair), no new engine verb. A sales
// invoice, or a direct PO invoice with no receipt link, emits the bare SET_STATUS CO; the GL posting itself is
// the already-proven Doc_Invoice fold (post_resolver), not re-derived by the doc-action.
function completeInvoice(invoice, lines, policy) {
  var ops = [{ op_type: 'SET_STATUS', table: 'C_Invoice', id: invoice.c_invoice_id, doc_status: 'CO' }];
  if (invoice.issotrx === 'N') {
    (lines || []).forEach(function (l) {
      if (l.m_inoutline_id) ops.push({ op_type: 'CREATE_LINE', table: 'M_MatchInv', c_invoiceline_id: l.c_invoiceline_id, m_inoutline_id: l.m_inoutline_id, m_product_id: l.m_product_id, qty: l.qtyinvoiced });
    });
  }
  return ops;
}

// replenishQtyToOrder — the ONE QtyToOrder calc of the Replenish Report (ReplenishReportProduction.fillTable :218-438 = ReplenishReport :294-327; ERP_FRIENDLY_OPS_LENS.md §64): the process port
// (processes/ReplenishReportProduction.js) and the POS lens (pos_core.js replenishSuggest) both call it. Exact decimals (Postgres NUMERIC), inputs decimal strings/numbers, result a decimal string.
//   type '1' reorder below min :326-336 · type '2' maintain max :339-345 · else (custom '9') 0 until the class sets it · Order_Min :348-356 (only 0 < q < Order_Min) · Order_Pack :359-366
//   (q - MOD(q,pack) + pack where MOD <> 0 and q > 0; MOD = truncated remainder, sign of the dividend). The T_Replenish "QtyToOrder < 1" delete (:430-436) stays with the caller.
function replenishQtyToOrder(p) {
  var f = ['onHand', 'reserved', 'ordered', 'levelMin', 'levelMax', 'orderMin', 'orderPack'].map(function (k) { return _dec(p[k] == null ? 0 : p[k]); });
  var K = f.reduce(function (m, x) { return Math.max(m, x.k); }, 0), U = function (x) { return x.n * 10n ** BigInt(K - x.k); };
  var oh = U(f[0]), rs = U(f[1]), od = U(f[2]), mn = U(f[3]), mx = U(f[4]), om = U(f[5]), op = U(f[6]), avail = oh - rs + od, q = 0n;
  if (p.type === '1') q = avail <= mn ? mx - oh + rs - od : 0n;
  else if (p.type === '2') q = mx - oh + rs - od;
  if (q < om && q > 0n) q = om;
  if (op !== 0n && q % op !== 0n && q > 0n) q = q - (q % op) + op;
  var neg = q < 0n, a = neg ? -q : q, s = a.toString().padStart(K + 1, '0'), ip = s.slice(0, s.length - K), fp = K ? s.slice(s.length - K).replace(/0+$/, '') : '';
  return (neg ? '-' : '') + ip + (fp ? '.' + fp : '');
}

// ── TAX (prompts/SQLiteIDEMPIERE.md §45, F11) — Witness: M3 T1 + the tax keys of every scenario ─────────────────────────────────────
// Integer-exact decimal helpers (BigInt): amounts in minor units (cents at precision 2); rates as decimal strings.
function _dec(str) { var t = String(str == null ? '0' : str).trim(), neg = t[0] === '-'; if (neg) t = t.slice(1); var p = t.split('.'), f = p[1] || ''; return { n: BigInt((neg ? '-' : '') + (p[0] || '0') + f), k: f.length }; }
function _rhu(n, d) { // HALF_UP (away from zero on .5), d > 0
  var neg = n < 0n, a = neg ? -n : n, q = a / d, r = a % d; if (r * 2n >= d) q += 1n; return neg ? -q : q;
}
// calcTax — MTax.calculateTax (MTax.java:340-372). THIN ADAPTER: the arithmetic lives in ONE place, BigDecimal.mtaxCalculate (bigdecimal.js). This only maps the engine's shape:
// tax {rate, issummary, c_tax_id}; children(taxId) → ACTIVE child taxes (summary); amountMinor = integer minor units at `prec` (default 2 = the currency StdPrecision); returns minor units (Number).
function calcTax(tax, amountMinor, included, children, prec) {
  var BD = typeof BigDecimal !== 'undefined' ? BigDecimal : require('./bigdecimal'), P = prec == null ? 2 : prec;
  var kids = String(tax.issummary) === 'Y' ? (children ? children(tax.c_tax_id) : []) : [];
  return Number(BD.mtaxCalculate(tax, new BD(BigInt(amountMinor), P), !!included, P, kids).setScale(P, BD.RoundingMode.HALF_UP).unscaledValue());
}
// taxLookup — Tax.getProduct + Tax.get (Tax.java:475-600, 679-697, 723-840). Pure: the host passes every row.
//   inp = { taxes:[c_tax rows of the client], postalsOf(taxId)→[{postal,postal_to,isactive}] (optional), groupHas(groupId,countryId)→bool (optional),
//           taxCategoryId, isSOTrx, billDate 'YYYY-MM-DD', billFrom/billTo/warehouse: {c_country_id,c_region_id,postal}, deliveryViaRule, bpTaxExempt }
function taxLookup(inp) {
  var z = function (v) { return v == null || v === '' ? 0 : Number(v); };
  var taxes = inp.taxes || [];
  if (String(inp.bpTaxExempt) === 'Y') {                               // getExemptTax :679-697 — active IsTaxExempt, highest rate first
    var ex = taxes.filter(function (t) { return String(t.istaxexempt) === 'Y' && String(t.isactive) === 'Y'; })
      .sort(function (a, b) { return Number(b.rate) - Number(a.rate); })[0];
    return ex ? { ok: true, c_tax_id: ex.c_tax_id, via: 'exempt' } : { ok: false, reason: 'TaxNoExemptFound' };
  }
  var from = inp.billFrom, to = inp.billTo;
  if (!inp.isSOTrx) { var tmp = from; from = to; to = tmp; }          // :541-549
  else if (inp.deliveryViaRule === 'P') to = inp.warehouse;            // :550-553 Pickup ⇒ warehouse location
  if (!from || !to) return { ok: false, reason: 'TaxCriteriaNotFound' };
  var keys = ['c_countrygroupfrom_id', 'c_country_id', 'c_region_id', 'c_countrygroupto_id', 'to_country_id', 'to_region_id'];
  var sorted = taxes.slice().sort(function (a, b) {                    // MTax.getAll ORDER BY … ValidFrom DESC (MTax.java:78-80), NULLs last (postgres ASC)
    for (var i = 0; i < keys.length; i++) {
      var x = a[keys[i]], y = b[keys[i]], xn = x == null || x === '', yn = y == null || y === '';
      if (xn && yn) continue; if (xn) return 1; if (yn) return -1; if (Number(x) !== Number(y)) return Number(x) - Number(y);
    }
    return String(b.validfrom || '').localeCompare(String(a.validfrom || ''));
  });
  var sopoOk = function (t) { return !((inp.isSOTrx && t.sopotype === 'P') || (!inp.isSOTrx && t.sopotype === 'S')); };
  var bd = String(inp.billDate).slice(0, 10);
  for (var i = 0; i < sorted.length; i++) {
    var t = sorted[i];
    if (z(t.c_taxcategory_id) !== z(inp.taxCategoryId) || String(t.isactive) !== 'Y' || z(t.parent_tax_id) !== 0) continue;
    if (!sopoOk(t)) continue;
    var grpOk = function (g, c) { return z(g) === 0 || (inp.groupHas ? inp.groupHas(z(g), z(c)) : false); };
    if (grpOk(t.c_countrygroupfrom_id, from.c_country_id) && (z(t.c_country_id) === z(from.c_country_id) || z(t.c_country_id) === 0)
      && (z(t.c_region_id) === z(from.c_region_id) || z(t.c_region_id) === 0)
      && grpOk(t.c_countrygroupto_id, to.c_country_id) && (z(t.to_country_id) === z(to.c_country_id) || z(t.to_country_id) === 0)
      && (z(t.to_region_id) === z(to.c_region_id) || z(t.to_region_id) === 0)
      && !(String(t.validfrom || '').slice(0, 10) > bd)) {
      var post = inp.postalsOf ? (inp.postalsOf(t.c_tax_id) || []) : [];
      if (!post.length) return { ok: true, c_tax_id: t.c_tax_id, via: 'match' };
      for (var j = 0; j < post.length; j++) {
        var pp = post[j];
        if (String(pp.isactive) === 'Y' && String(pp.postal || '').indexOf(String(from.postal || '')) === 0
          && (pp.postal_to == null || String(pp.postal_to).indexOf(String(to.postal || '')) === 0)) return { ok: true, c_tax_id: t.c_tax_id, via: 'postal' };
      }
    }
  }
  for (var d = 0; d < sorted.length; d++) {                            // default tax (:820-832) — NOT filtered by category, exactly as the Java
    var u = sorted[d];
    if (String(u.isdefault) !== 'Y' || String(u.isactive) !== 'Y' || z(u.parent_tax_id) !== 0 || !sopoOk(u)) continue;
    return { ok: true, c_tax_id: u.c_tax_id, via: 'default' };
  }
  return { ok: false, reason: 'TaxNotFound' };
}
// orderTaxes — StandardTaxProvider.calculateOrderTaxTotal (StandardTaxProvider.java:38-110) + MOrderTax.calculateTaxFromLines (MOrderTax.java:312-372).
//   lines [{c_tax_id, linenetamt (decimal string)}], taxById(id) → c_tax row, included = price list IsTaxIncluded. Amounts out in minor units (precision `prec`, default 2).
function orderTaxes(lines, taxById, included, children, prec) {   // prec (optional, default 2): the currency StdPrecision the amounts are in minor units of (§SD16: calcTax is linear in the minor unit, so 0-/3-decimal currencies work)
  var P = prec == null ? 2 : prec;
  var c = function (v) { var r = _dec(v); return Number(r.k <= P ? r.n * (10n ** BigInt(P - r.k)) : _rhu(r.n, 10n ** BigInt(r.k - P))); };
  var totalLines = 0, seen = [], rows = [];
  lines.forEach(function (l) { totalLines += c(l.linenetamt); var id = Number(l.c_tax_id); if (seen.indexOf(id) < 0) seen.push(id); });
  seen.forEach(function (id) {
    var t = taxById(id); if (!t) { rows.push({ c_tax_id: id, error: 'tax not found' }); return; }
    if (Number(t.c_taxprovider_id || 0)) { rows.push({ c_tax_id: id, error: 'external tax provider not ported' }); return; }
    var parent = Number(t.parent_tax_id || 0), base = 0, amt = 0, doc = String(t.isdocumentlevel) === 'Y';
    lines.forEach(function (l) { if (Number(l.c_tax_id) === id || (parent > 0 && Number(l.c_tax_id) === parent)) { base += c(l.linenetamt); if (!doc) amt += calcTax(t, c(l.linenetamt), included, children, P); } });
    if (doc) amt = calcTax(t, base, included, children, P);
    rows.push({ c_tax_id: id, taxbaseamt: included ? base - amt : base, taxamt: amt });
  });
  var out = [], grand = totalLines;
  rows.forEach(function (r) {
    if (r.error) { out.push(r); return; }
    var t = taxById(r.c_tax_id);
    if (String(t.issummary) === 'Y') {                                  // :75-99 one row per child, the summary row deleted
      (children ? children(r.c_tax_id) : []).forEach(function (ch) { var a = calcTax(ch, r.taxbaseamt, false, children, P); out.push({ c_tax_id: ch.c_tax_id, taxbaseamt: r.taxbaseamt, taxamt: a }); if (!included) grand += a; });
    } else { out.push(r); if (!included) grand += r.taxamt; }
  });
  return { rows: out, totalLines: totalLines, grandTotal: grand };
}

// orderPriceListDefault — MOrder.beforeSave:1282-1291 (@{u} org.compiere.model). Implementing prompts/SQLiteIDEMPIERE.md §SHOPDAY-RUN-2 R2.4 (G-SD6) — Witness: W-SHOPDAY-RUN2 + SD-12z.
// An order WITHOUT a price list takes the client's first ACTIVE price list whose IsSOPriceList equals the order's IsSOTrx, ORDER BY IsDefault DESC (ties: the database's order = lowest id here).
// DB.getSQLValueEx returns -1 when no row matches, and `ii != 0` lets -1 through to MOrder.setM_PriceList_ID (:908-917), whose MPriceList.get(ctx,-1) is null => NullPointerException "pl is null"
// => the save is refused. So "no such list" is a REFUSAL (legacy's text is a Java NPE; the reason here is the clear one). An explicit price list is kept as is.
// order = { m_pricelist_id, issotrx ('Y'|'N'), ad_client_id }, lists = [{ m_pricelist_id, issopricelist, isactive, isdefault, ad_client_id }] -> { ok, m_pricelist_id } | { ok:false, reason, msg }
function orderPriceListDefault(order, lists) {
  if ((Number(order.m_pricelist_id) || 0) !== 0) return { ok: true, m_pricelist_id: Number(order.m_pricelist_id), explicit: true };
  var want = String(order.issotrx) === 'Y' ? 'Y' : 'N';
  var c = (lists || []).filter(function (l) { return String(l.isactive) === 'Y' && String(l.issopricelist) === want && (order.ad_client_id == null || Number(l.ad_client_id) === Number(order.ad_client_id)); })
    .sort(function (a, b) { return (String(b.isdefault) === 'Y' ? 1 : 0) - (String(a.isdefault) === 'Y' ? 1 : 0) || Number(a.m_pricelist_id) - Number(b.m_pricelist_id); });
  if (!c.length) return { ok: false, reason: 'no-price-list', msg: 'No active ' + (want === 'Y' ? 'sales' : 'purchase') + ' price list for the client (legacy: NullPointerException "pl is null", MOrder.java:910-911)' };
  return { ok: true, m_pricelist_id: Number(c[0].m_pricelist_id), explicit: false };
}

// completeReceipt — the M_InOut doc-action's PO-side delta, the sibling completeInvoice() emits on the
// invoice side. Implementing ERP_P2P_INVOICE_MATCH.md §Fix 3 — Witness: W-FOLD-MATCHPO. Real Java
// (MInOut.completeIt(), line 2079-2096): for each receipt line linked to a PO line
// (`!IsSOTrx && C_OrderLine_ID<>0`), create ONE M_MatchPO junction (PO-line ⋈ receipt-line @
// MovementQty). Same shape as completeInvoice's M_MatchInv emission — a single junction record rides the
// existing CREATE_LINE kernel op, no buildDoc. The invoice-created-before-shipment edge case (real Java
// also emits M_MatchPO from MInvoice.completeIt() ~line 2134) is NAMED-DEFERRED — this lane's witness path
// is receipt-first (PO → Receipt → Invoice), the mainline order real users follow.
// ── GENERATE: stockMoves — the M_InOut Complete STOCK EFFECT ─────────────────────────────────────
// Implementing prompts/ERP_STOCK_EFFECT.md §E4.3 — Witness: W-STOCK-MOVE. Closes AGENT_QUEUE E-4
// ("a real signed shipment still cannot move stock" — m_storageonhand had ZERO shipped .js writers).
// Java home (EXTRACT, do NOT invent):
//   MInOut.getMovementType (MInOut.java:1275-1287) — the whole table, no defaulting:
//     DocBaseType 'MMS' (MaterialDelivery) -> SOTrx ? 'C-' : 'V-'
//     DocBaseType 'MMR' (MaterialReceipt)  -> SOTrx ? 'C+' : 'V+'      any other DocBaseType -> null
//   MInOut.completeIt:1688-1691 — Qty = sLine.MovementQty; if MovementType.charAt(1)=='-' Qty = Qty.negate()
//     (the polarity IS the trailing char — which is exactly what movementSign already extracts).
//   MInOut.completeIt:1939-1944 — new MTransaction(ctx, sLine.AD_Org_ID, MovementType, sLine.M_Locator_ID,
//     sLine.M_Product_ID, sLine.M_AttributeSetInstance_ID, Qty, MovementDate) + setM_InOutLine_ID.
// WHY THE TRANSACTION AND NOT A STORAGE UPSERT: M_StorageOnHand.add() is an upsert of a delta, and the op
// log is append-only (a `listTip` fold reads row-TIPS by key, so a delta row does not fit CREATE_LINE, and
// inventing a STORAGE_DELTA op type to make it fit would be inventing). M_Transaction IS append-only, and
// on-hand is the fold of it — the model qtyOnHand's own comment above already states: iDempiere keeps the
// qty nowhere as a master field; MStorageOnHand.qtyonhand is a cache maintained in lockstep with this sum.
// PURE: no DB, no clock — the host passes the doc, its lines, and the doctype's DocBaseType.

// movementTypeOf — MInOut.getMovementType verbatim. Returns null for any other DocBaseType (the caller
// must then emit NOTHING; a guessed polarity would be a silently wrong inventory sign).
function movementTypeOf(docBaseType, issotrx) {
  var so = (issotrx === true || issotrx === 'Y');
  if (docBaseType === 'MMS') return so ? 'C-' : 'V-';
  if (docBaseType === 'MMR') return so ? 'C+' : 'V+';
  return null;
}

// stockMoves(doc, lines, opts) -> { ops, movementtype, skipped, deferred, reason? }
//   doc   : the M_InOut header (needs issotrx + movementdate; ad_org_id used as the line fallback)
//   lines : its M_InOutLine rows (movementqty carried VERBATIM — the sign comes from the type, never
//           from trusting a pre-signed column)
//   opts.docBaseType : the C_DocType's DocBaseType (the host reads it; this verb never queries)
// A line with no product or no locator is SKIPPED AND COUNTED — not silently dropped.
function stockMoves(doc, lines, opts) {
  opts = opts || {};
  var deferred = ['costing(M_CostDetail)', 'reservation(MStorageReservation MInOut.completeIt:1919-1935)',
                  'asi-material-policy(dateMPolicy allocation loop MInOut.completeIt:1771-1830)'];
  var mt = movementTypeOf(opts.docBaseType, doc && doc.issotrx);
  if (!mt) {
    return { ops: [], movementtype: null, skipped: (lines || []).length, deferred: deferred,
             reason: 'DocBaseType ' + JSON.stringify(opts.docBaseType || null) + ' is neither MMS nor MMR — no movement type, so NO ops (a guessed polarity would be a wrong inventory sign)' };
  }
  var sign = movementSign(mt), ops = [], skipped = 0;
  (lines || []).forEach(function (l) {
    if (l == null || l.m_product_id == null || l.m_locator_id == null) { skipped++; return; }
    var q = l.movementqty != null ? l.movementqty : l.qtyentered;
    if (q == null) { skipped++; return; }
    ops.push({ op_type: 'CREATE_LINE', table: 'M_Transaction',
               movementtype: mt,
               m_locator_id: l.m_locator_id,
               m_product_id: l.m_product_id,
               m_attributesetinstance_id: l.m_attributesetinstance_id != null ? l.m_attributesetinstance_id : null,
               movementqty: sign * Math.abs(Number(q)),
               movementdate: doc.movementdate != null ? doc.movementdate : null,
               m_inoutline_id: l.m_inoutline_id,
               ad_org_id: l.ad_org_id != null ? l.ad_org_id : (doc.ad_org_id != null ? doc.ad_org_id : null) });
  });
  return { ops: ops, movementtype: mt, skipped: skipped, deferred: deferred };
}

function completeReceipt(receipt, lines, policy) {
  var ops = [{ op_type: 'SET_STATUS', table: 'M_InOut', id: receipt.m_inout_id, doc_status: 'CO' }];
  if (receipt.issotrx === 'N') {
    (lines || []).forEach(function (l) {
      if (l.c_orderline_id) ops.push({ op_type: 'CREATE_LINE', table: 'M_MatchPO', c_orderline_id: l.c_orderline_id, m_inoutline_id: l.m_inoutline_id, m_product_id: l.m_product_id, qty: l.movementqty });
    });
  }
  // §E4 (prompts/ERP_STOCK_EFFECT.md) — the STOCK EFFECT rides the same Complete fan-out, for BOTH
  // directions: a receipt adds and a shipment subtracts. Gated on the host supplying the doctype's
  // DocBaseType — without it stockMoves returns zero ops and a named reason rather than a guessed sign,
  // so an older caller that does not pass policy.docBaseType is byte-identical to before.
  var sm = stockMoves(receipt, lines, { docBaseType: policy && policy.docBaseType });
  sm.ops.forEach(function (o) { ops.push(o); });
  return ops;
}

// ── CUSTOMER RETURN (RMA) — §SD16 (prompts/SQLiteIDEMPIERE.md §SD16; Witness: scripts/bridge/shopday_return.js SD-16) ────────────────────────────────────────
// rmaCheckQty — MRMALine.checkQty (MRMALine.java checkQty): the shipment line must hold at least the RMA qty, and the qty of the OTHER RMA lines of that shipment line that belong to a
// COMPLETED/CLOSED RMA (Processed='Y' AND DocStatus IN ('CO','CL'), this line excluded) plus this qty must not exceed it. shipQty/qty/othersCompletedQty are numbers.
function rmaCheckQty(shipQty, qty, othersCompletedQty) {
  try {   // exact decimals (0.1 + 0.2 must equal 0.3): scaled BigInt compare, never float addition
    var a = _dec(shipQty), b = _dec(qty), c = _dec(othersCompletedQty || 0), K = Math.max(a.k, b.k, c.k), sc = function (x) { return x.n * (10n ** BigInt(K - x.k)); };
    if (sc(a) < sc(b)) return false;
    return sc(a) >= sc(c) + sc(b);
  } catch (e) { return false; }
}
// _minorStr — an integer count of minor units at `p` decimals as an exact decimal string.
function _minorStr(n, p) { var neg = n < 0, a = String(Math.abs(Number(n))); if (p > 0) { while (a.length <= p) a = '0' + a; a = a.slice(0, a.length - p) + '.' + a.slice(a.length - p); } return (neg ? '-' : '') + a; }
// rmaLineSave — MRMALine.beforeSave (MRMALine.java:305-398). Refusals, in the Java order: none of shipment line / charge / product => "FillShipLineOrProductOrCharge" (:313-318); product AND charge => "JustProductOrCharge" (:320-325);
// a shipment-line row: the qty must fit the shipped/returned quantity ("AmtReturned>Shipped", checkQty :402) and the shipment line may appear once per RMA ("InOutLineAlreadyEntered", :338-348); it takes product/charge from the
// shipment line, Amt = the unit price of the invoice line (else the order line) of it (init :130-230; none => legacy IllegalStateException, named ABSENT here), Qty = the line's own qty (the original qty only when 0 on a NEW line :376-377).
// A line WITHOUT a shipment line (product-only or charge-only) has NO qty/duplicate check; Qty <= 0 and 0 => 1, Amt 0 => getUnitAmt (:350-367) = src.unitamt (the product price / charge amount the host resolves; missing => named ABSENT, never guessed).
// LineNetAmt = Amt x Qty rounded HALF_UP at `precision` only when its scale is larger (getTotalAmt). line = { m_inoutline_id, qty, m_product_id, c_charge_id, amt, c_tax_id };
// src = { m_product_id, c_charge_id, shipqty, priceactual, c_tax_id, origqty, othersCompletedQty, unitamt }; sameRmaLines = other lines of this RMA. Result line carries `precision`.
function rmaLineSave(line, src, sameRmaLines, precision) {
  var prec = precision == null ? 2 : precision, ship = Number(line.m_inoutline_id || 0) !== 0, prod = Number(line.m_product_id || 0), chg = Number(line.c_charge_id || 0);
  if (!ship && !chg && !prod) return { ok: false, reason: 'FillShipLineOrProductOrCharge' };
  if (prod && chg) return { ok: false, reason: 'JustProductOrCharge' };
  src = src || {};
  var qty = line.qty == null ? 0 : line.qty, amtStr, out;
  if (ship) {
    if (src.shipqty == null) return { ok: false, reason: 'ABSENT:shipment line quantity (MRMALine.checkQty)' };
    if (src.priceactual == null) return { ok: false, reason: 'ABSENT:invoice/order line unit price (MRMALine.init :130-230)' };
    if (Number(qty) === 0) qty = src.origqty;
    if (!rmaCheckQty(src.shipqty, qty, src.othersCompletedQty)) return { ok: false, reason: 'AmtReturned>Shipped' };
    if ((sameRmaLines || []).some(function (o) { return Number(o.m_inoutline_id || 0) === Number(line.m_inoutline_id); })) return { ok: false, reason: 'InOutLineAlreadyEntered' };
    amtStr = String(src.priceactual);
    out = { m_inoutline_id: line.m_inoutline_id, m_product_id: src.m_product_id || null, c_charge_id: src.c_charge_id || null, c_tax_id: src.c_tax_id };
  } else {
    if (Number(qty) === 0) qty = 1;
    var own = line.amt == null ? '0' : String(line.amt);
    amtStr = _dec(own).n !== 0n ? own : (src.unitamt == null ? null : String(src.unitamt));
    if (amtStr == null) return { ok: false, reason: 'ABSENT:unit amount (MProduct price / MCharge.ChargeAmt, MRMALine.getUnitAmt)' };
    out = { m_inoutline_id: null, m_product_id: prod || null, c_charge_id: chg || null, c_tax_id: line.c_tax_id != null ? line.c_tax_id : src.c_tax_id };
  }
  var pd = _dec(amtStr), qd = _dec(qty), k = pd.k + qd.k, n = pd.n * qd.n;
  var net = k > prec ? _rhu(n, 10n ** BigInt(k - prec)) : n * (10n ** BigInt(prec - k));   // minor units at `precision`
  out.qty = qty; out.amt = amtStr; out.linenetamt = Number(net); out.precision = prec;
  return { ok: true, line: out };
}
// completeRMA — MRMA.prepareIt/completeIt (MRMA.java): no lines => "NoLines"; every line with a shipment line re-checks the qty ("AmtReturned>Shipped"); the tax total (StandardTaxProvider.calculateRMATaxTotal :293-365 —
// MRMATax per tax, summary taxes split per child) gives Amt = lines + taxes (taxes only when not tax-included); completeIt books NOTHING and moves NO stock/cost: it only approves, sets Processed and the status.
// lines = rmaLineSave results ({ok, line:{...}}) or the flat line, each + {shipqty, othersCompletedQty} for a shipment-line row; ctx = { taxById, taxChildren, taxIncluded, precision (default 2, must equal the lines') }.
// Returns { ok, docstatus, amt (minor units at precision), precision, taxes:[{c_tax_id, taxbaseamt, taxamt}] (minor units), ops }.
function completeRMA(rma, lines, ctx) {
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  var P = ctx.precision == null ? 2 : ctx.precision, div = Math.pow(10, P), ls = [];
  for (var i = 0; i < lines.length; i++) {
    var x = Object.assign({}, lines[i].line || {}, lines[i]);
    if (x.ok === false) return { ok: false, reason: x.reason || 'line-refused' };
    if (x.precision != null && Number(x.precision) !== P) return { ok: false, reason: 'precision-mismatch line=' + x.precision + ' ctx=' + P };
    if (x.linenetamt == null || isNaN(Number(x.linenetamt))) return { ok: false, reason: 'ABSENT:linenetamt on RMA line ' + (i + 1) };
    if (Number(x.m_inoutline_id || 0)) {
      if (x.shipqty == null) return { ok: false, reason: 'ABSENT:shipqty on RMA line ' + (i + 1) };
      if (!rmaCheckQty(x.shipqty, x.qty, x.othersCompletedQty)) return { ok: false, reason: 'AmtReturned>Shipped' };
    }
    ls.push(x);
  }
  var t = orderTaxes(ls.map(function (l) { return { linenetamt: _minorStr(l.linenetamt, P), c_tax_id: l.c_tax_id }; }), ctx.taxById, !!ctx.taxIncluded, ctx.taxChildren, P);
  var bad = t.rows.filter(function (x) { return x.error; })[0]; if (bad) return { ok: false, reason: 'tax-error', detail: bad.error };
  var ops = t.rows.map(function (x) { return { op_type: 'CREATE_LINE', table: 'M_RMATax', m_rma_id: rma.m_rma_id, c_tax_id: x.c_tax_id, taxbaseamt: x.taxbaseamt / div, taxamt: x.taxamt / div }; });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'M_RMA', id: rma.m_rma_id, field: 'amt', value: t.grandTotal / div });
  ops.push({ op_type: 'SET_STATUS', table: 'M_RMA', id: rma.m_rma_id, doc_status: 'CO' });
  return { ok: true, docstatus: 'CO', amt: t.grandTotal, precision: P, taxes: t.rows, ops: ops };
}
// rmaReceiptEffects — MInOut.completeIt "Update RMA Line Qty Delivered" (MInOut.java:1984-2002): a receipt/shipment line WITHOUT an order line but WITH an RMA line adds its qty to
// the RMA line's QtyDelivered when SOTrx (subtracts it otherwise). lines = [{m_rmaline_id, c_orderline_id, movementqty}]; rmaLines = [{m_rmaline_id, qtydelivered}].
function rmaReceiptEffects(inout, lines, rmaLines) {
  var by = {}, ops = [];
  (rmaLines || []).forEach(function (r) { by[r.m_rmaline_id] = { m_rmaline_id: r.m_rmaline_id, qtydelivered: Number(r.qtydelivered || 0) }; });
  (lines || []).forEach(function (l) {
    if (l.c_orderline_id || !l.m_rmaline_id || !by[l.m_rmaline_id]) return;
    var q = Number(l.movementqty || 0), sx = String(inout.movementtype).charAt(1) === '-' ? -q : q;     // MovementType C+ keeps the sign, C- negates (Qty = MovementQty x polarity)
    by[l.m_rmaline_id].qtydelivered += String(inout.issotrx) === 'Y' ? sx : -sx;
    ops.push({ op_type: 'UPDATE_LINE', table: 'M_RMALine', id: l.m_rmaline_id, qtydelivered: by[l.m_rmaline_id].qtydelivered });
  });
  return { ok: true, ops: ops };
}

return {
  rmaCheckQty: rmaCheckQty,
  rmaLineSave: rmaLineSave,
  completeRMA: completeRMA,
  rmaReceiptEffects: rmaReceiptEffects,
  calcTax: calcTax,
  taxLookup: taxLookup,
  orderTaxes: orderTaxes,
  buildDoc: buildDoc,
  qtyOnHand: qtyOnHand,
  replenishQtyToOrder: replenishQtyToOrder,
  completeOrder: completeOrder,
  completeInvoice: completeInvoice,
  completeReceipt: completeReceipt,
  orderPriceListDefault: orderPriceListDefault
};
});
