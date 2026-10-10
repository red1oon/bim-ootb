// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * erp_engine.js — the §0.10 abstract engine, EXTRACTED into one module.
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

// ── Gap closers (the two breakages the probe found) ──────────────────────────
// @ctx@ substitution: iDempiere injects record/global context into rule SQL.
function resolveCtx(body, ctx) {
  var miss = [];
  var sql = String(body).replace(/@(#?\w+)@/g, function (m, k) {
    if (ctx[k] != null) { var v = ctx[k]; return typeof v === 'number' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'"; }
    miss.push(k); return 'NULL';
  });
  return { sql: sql, miss: miss };
}
// PG -> SQLite dialect (sql.js is SQLite). Extend as new PG-isms surface.
function dialectShim(sql) {
  return String(sql)
    .replace(/\bleast\s*\(/gi, 'min(')
    .replace(/\bgreatest\s*\(/gi, 'max(')
    .replace(/::[a-z_]+/gi, '');
}

// ── GUARD: evaluate a predicate rule (form=sql) over an edge -> bool ──────────
function evalGuard(query, rule, ctx) {
  if (rule.form !== 'sql') return { ok: true, skipped: 'non-sql guard form=' + rule.form };
  var r = resolveCtx(rule.body, ctx);
  if (r.miss.length) return { ok: false, reason: 'unresolved-ctx', miss: r.miss };
  try {
    var rows = query(dialectShim(r.sql));
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, reason: 'sql-error', error: e.message }; }
}

// ── GENERATE: the GENERIC matcher — the whole Detail⋈Detail class ────────────
// One function for 3-way-match / allocation / costing / bank-rec. Edges are paired
// within a PARTITION (the trading-partner account, optionally narrowed by role/org
// access), on a KEY, with qty agreeing within TOLERANCE, disambiguated by an ORDERING
// POLICY (FIFO/LIFO/…), greedy first-fit. Returns [[idL,idR],…] — the settlement edges.
//
// opts = {
//   idL, idR        : field names for the line identities to pair
//   keyOf(row)      : the match key (default row.m_product_id)
//   qtyL, qtyR      : qty field names on left/right
//   tol             : qty tolerance (default 1e-4)
//   partition(row)  : the settlement partition key (e.g. row.bp)         REQUIRED
//   orgOf(row)      : the row's org (for access scoping)                 optional
//   allowOrgs       : Set of orgs the role may see; null/absent = all    optional
//   order           : 'FIFO'|'LIFO' over `dateOf`, or a comparator(a,b)  optional
//   dateOf(row)     : the date used by FIFO/LIFO                         optional
//   partial         : false (default) = exact-qty greedy, returns [[idL,idR],…];
//                     true = partial-QUANTITY matching, returns [{l,r,qty},…]   optional
// }
//
// PARTIAL-QUANTITY matching (opts.partial=true) — Implementing docs/ERP.md §0.17/§0.19
//   (settlement re-derivation; bill≠receipt) — Witness: §MATCH-PARTIAL / §ODOO-FOLD-F8.
//   The exact-qty fast path pairs L↔R only when |qtyL−qtyR|≤tol, so receipt(12) vs
//   bill(8) yields NO pair (finding f8, poc_odoo_fold_f8.js). Partial mode pairs
//   min(remainingL, remainingR) and CARRIES the remainder, so over/under-billing and
//   disputed/damaged-goods reconcile to the unit — still emitting the SAME MATCH verb
//   (newVerbs=[]; the bound was matcher BEHAVIOUR, not a new verb). A row may pair more
//   than once (until its remainder drains); partition/key/access/FIFO-LIFO all preserved.
function match(leftRows, rightRows, opts) {
  var keyOf = opts.keyOf || function (r) { return r.m_product_id; };
  var orgOf = opts.orgOf || function () { return null; };
  var dateOf = opts.dateOf || function () { return 0; };
  var tol = opts.tol == null ? 1e-4 : opts.tol;
  var allow = opts.allowOrgs || null;
  function visible(r) { return !allow || allow.has(orgOf(r)); }

  // comparator for disambiguation when >1 candidate matches. Type-agnostic compare so
  // ISO date STRINGS (how dates arrive from sql.js) order correctly, not just numbers.
  function asc(a, b) { var x = dateOf(a), y = dateOf(b); return x < y ? -1 : x > y ? 1 : 0; }
  var cmp = (typeof opts.order === 'function') ? opts.order
    : opts.order === 'LIFO' ? function (a, b) { return -asc(a, b); }
      : opts.order === 'FIFO' ? asc
        : null;

  // group visible right rows by partition.
  var byPart = {};
  rightRows.forEach(function (R, i) {
    if (!visible(R)) return;
    R.__k = i; var p = opts.partition(R);
    (byPart[p] = byPart[p] || []).push(R);
  });
  // process left rows in policy order too (stable, deterministic).
  var lefts = leftRows.filter(visible);
  if (cmp) lefts = lefts.slice().sort(cmp);

  // ── PARTIAL-QUANTITY mode: pair min(qty), carry the remainder (§0.17/§0.19, f8) ──
  if (opts.partial) {
    var rem = {}; // remaining unmatched qty per right row, keyed by __k
    rightRows.forEach(function (R) { if (visible(R)) rem[R.__k] = R[opts.qtyR]; });
    var partPairs = [];
    lefts.forEach(function (L) {
      var lq = L[opts.qtyL];
      var cands = (byPart[opts.partition(L)] || []).filter(function (R) {
        return keyOf(L) === keyOf(R) && rem[R.__k] > tol;
      });
      if (cmp && cands.length > 1) cands = cands.slice().sort(cmp);
      cands.forEach(function (R) {
        if (lq <= tol || rem[R.__k] <= tol) return;
        var m = Math.min(lq, rem[R.__k]);
        partPairs.push({ l: L[opts.idL], r: R[opts.idR], qty: m });
        lq -= m; rem[R.__k] -= m;
      });
    });
    return partPairs;
  }

  // ── EXACT-QTY mode (default, unchanged): greedy first-fit, one R per L ──
  var used = {}, pairs = [];
  lefts.forEach(function (L) {
    var cands = (byPart[opts.partition(L)] || []).filter(function (R) {
      return !used[R.__k] && keyOf(L) === keyOf(R) && Math.abs(L[opts.qtyL] - R[opts.qtyR]) <= tol;
    });
    if (!cands.length) return;
    if (cmp && cands.length > 1) cands = cands.slice().sort(cmp);
    var R = cands[0];
    used[R.__k] = 1;
    pairs.push([L[opts.idL], R[opts.idR]]);
  });
  return pairs;
}

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

// ── GENERATE: recursive BOM explosion — backflush = deterministic replay of the BOM ─────────────
// Implementing docs/POSLens.md §6 (AutoBOMOrder backflush) — Witness: W-FOLD-BACKFLUSH.
// The SAME recursive verb that compiles a building, run at point of sale: ring a finished good →
// fold down the recipe → consume leaf components. bomOf(productId) -> [{comp_id, qtybom}] is
// HOST-INJECTED (keeps the engine pure, per the separation contract). A product is a BOM iff
// bomOf returns lines; otherwise it is a LEAF and is consumed. Returns leaf consumption
// { comp_id: qty }, summed over every root→leaf path × the root qty. Cycle-guarded.
function explodeBOM(bomOf, productId, qty, _seen) {
  var lines = bomOf(productId);
  if (!lines || !lines.length) return null;                 // leaf — the caller consumes it
  if (_seen && _seen[productId]) throw new Error('BOM cycle at product ' + productId);
  var seen = Object.assign({}, _seen || {}); seen[productId] = 1;
  var out = {};
  lines.forEach(function (l) {
    var childQty = qty * l.qtybom;
    var sub = explodeBOM(bomOf, l.comp_id, childQty, seen);
    if (sub === null) { out[l.comp_id] = (out[l.comp_id] || 0) + childQty; }   // l is a leaf component
    else { Object.keys(sub).forEach(function (p) { out[p] = (out[p] || 0) + sub[p]; }); } // l is a sub-BOM
  });
  return out;
}

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

// ── GENERATE: reverseCorrect / reverseAccrual — the DocAction reversal family ─────────────────────
// Implementing ERP_MODEL_ARCHETYPE.md §Reversal (Doc.reverseCorrectIt / reverseAccrualIt) — Witness: W-FOLD-REVERSE.
// iDempiere's reverseCorrect emits a posting that ANNIHILATES the original document's posting: every Dr leg
// becomes a Cr and vice-versa, on the SAME accounts at the SAME amounts (MFactReversal: Fact.reverse swaps the
// FactLine sides). reverseAccrual is the identical negation booked in the NEXT period — the reversal DATE is
// the ONLY delta (the host supplies it; reverseCorrect keeps the original dateacct). PURE: the host passes the
// document's FORWARD posting (re-derived from source via post_resolver) — this verb NEVER reads the books, so
// "reversal annihilates the real fact_acct" is a genuine test of the rule, not a copy of the oracle. `facts`
// are integer-cents lines [{account, dr, cr}]; returns the swapped lines, carrying the reversal date.
function reversePosting(facts, opts) {
  opts = opts || {};
  return facts.map(function (f) {
    var date = opts.mode === 'accrual'
      ? (opts.reversalDate != null ? opts.reversalDate : null)            // next-period date (host-supplied)
      : (f.dateacct != null ? f.dateacct : (opts.dateacct != null ? opts.dateacct : null)); // correct = same date
    return { account: f.account, dr: f.cr || 0, cr: f.dr || 0, dateacct: date };
  });
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

// voidOrder — the C_Order VO doc-action of a SALES order, as ops. Implementing prompts/SQLiteIDEMPIERE.md §33 (S12, fix F4) — Witness: M3 S12.
// Port of MOrder.voidIt (MOrder.java:2680-2760) + createReversals (:2766-2840) + the reversal DOCUMENT shape of MInOut/MInvoice.reverseCorrectIt
// (measured on the legacy pilot 2026-10-09: reversal doc = same type, same order link, quantities/amounts NEGATED, both original and reversal 'RE').
//   per shipment / invoice: CL|RE|VO ⇒ skipped (:2780-2783 / :2810-2813); not CO ⇒ SET_STATUS VO (:2785-2789); CO ⇒ reversal doc + both RE (:2790-2794).
//   per order line with qty≠0: qty 0, linenetamt 0, description += msg + " (" + old + ")" (:2701-2713, line :2709; MOrderLine.addDescription ' | ' join :632-639).
//   order: description += msg (:2733), totallines = grandtotal = 0 (:2745-2746), status VO.
// PURE: the host passes the completed sale (docs with their lines), the AD_Message 'Voided' text (dictionary, never hard-coded) and an id allocator.
//   sale = { order:{c_order_id, description}, lines:[{c_orderline_id, qtyordered, description}],
//            shipments:[{m_inout_id, docstatus, movementtype, lines:[{m_inoutline_id, m_product_id, movementqty, c_orderline_id}]}],
//            invoices:[{c_invoice_id, docstatus, grandtotal, lines:[{c_invoiceline_id, m_product_id, qtyinvoiced, linenetamt, c_orderline_id}]}] }
//   opts = { voidedMsg, newId: function(table) -> id, orderLines (optional: the order lines' current {c_orderline_id, qtyordered, qtyreserved, qtydelivered} for the shipment-reversal quantity rule) }
//   sale.orderTaxes (optional) = [{c_tax_id}] — the order's C_OrderTax rows, zeroed after the lines (:2724-2728)
// _reversalInvoiceDocOps — the reversal DOCUMENT of a completed invoice (MInvoice.reverse :2690-2760: deep copy, quantities / amounts / tax NEGATED, both 'RE', Reversal_ID both ways).
// Shared by voidOrder (POS void, F4/F14) and reverseInvoice (Reverse-Correct, F22) — one implementation (AD-LAYER rule 5).
function _neg(v) { return v == null ? v : -Number(v); }
function _reversalInvoiceDocOps(iv, orderId, rid) {
  var ops = [];
  var cdoc = { op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: orderId, c_invoice_id: rid, grandtotal: _neg(iv.grandtotal), reversal_id: iv.c_invoice_id };
  if (iv.iscreditmemo != null) cdoc.iscreditmemo = iv.iscreditmemo;   // §REVIEW-FIX D2: the reversal is a copy (MInvoice.copyFrom) — a credit memo reverses into a credit memo
  ops.push(cdoc);
  (iv.lines || []).forEach(function (l) {
    ops.push({ op_type: 'CREATE_LINE', table: 'C_InvoiceLine', c_invoice_id: rid, m_product_id: l.m_product_id, qtyinvoiced: _neg(l.qtyinvoiced), linenetamt: _neg(l.linenetamt), c_orderline_id: l.c_orderline_id, reversalline_id: l.c_invoiceline_id });
  });
  (iv.taxes || []).forEach(function (t) {   // §48 (F14): the reversal invoice carries the original's tax rows negated (MInvoice.reverseCorrectIt; pilot S12/S12b)
    ops.push({ op_type: 'CREATE_LINE', table: 'C_InvoiceTax', c_invoice_id: rid, c_tax_id: t.c_tax_id, taxbaseamt: _neg(t.taxbaseamt), taxamt: _neg(t.taxamt) });
  });
  ops.push({ op_type: 'SET_STATUS', table: 'C_Invoice', id: rid, doc_status: 'RE' });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: iv.c_invoice_id, field: 'reversal_id', value: rid });
  ops.push({ op_type: 'SET_STATUS', table: 'C_Invoice', id: iv.c_invoice_id, doc_status: 'RE' });
  return ops;
}
// reverseInvoice — Reverse-Correct of a COMPLETED invoice (MInvoice.reverseCorrectIt :2599-2619 → reverse(accrual=false) :2627-2815). Implementing prompts/SQLiteIDEMPIERE.md §64.3 (F22) — Witness: M3 O2C5-RC-INV.
//   1. the invoice's ACTIVE allocations are reversed first (reverseAllocations :2821-2833 → MAllocationHdr.reverseIt non-accrual :845-935): header inactive + 'RE', every line amount /
//      discount / write-off 0 and inactive (its books are deleted, MFactAcct.deleteEx :906); the payments on those lines are re-tested (MPayment.testAllocation: allocated = payamt ⇒ Y);
//   2. the reversal document (_reversalInvoiceDocOps), completed — its lines carry negated quantities, so the order-line rule (invoiceOrderLineEffects) undoes QtyInvoiced;
//   3. reversal IsPaid=Y (:2754), original IsPaid=Y (:2788), shipment lines un-invoiced (:2765-2775);
//   4. a NEW allocation (:2785-2812) at the original's DateAcct: original line GrandTotal (purchase: negated), reversal line −GrandTotal, completed.
// iv = { c_invoice_id, c_order_id, issotrx, grandtotal, dateacct, c_currency_id, c_bpartner_id, lines:[{c_invoiceline_id, m_product_id, qtyinvoiced, linenetamt, c_orderline_id, m_inoutline_id}], taxes }
// st = { allocations:[{c_allocationhdr_id, isactive, lines:[{c_allocationline_id, c_invoice_id, c_payment_id, amount}]}], payments:[{c_payment_id, payamt}] } (amounts in the units the host stores)
// opts = { newId(table), orderLines (optional, for the quantity rule), periodOpen:{ok} (optional, :2633) }
function reverseInvoice(iv, st, opts) {
  opts = opts || {};
  if (iv.docstatus && iv.docstatus !== 'CO' && iv.docstatus !== 'CL') return { ok: false, reason: 'not-completed', docstatus: iv.docstatus };
  if (opts.periodOpen && !opts.periodOpen.ok) return { ok: false, reason: 'period-closed' };
  var ops = [], touched = {};
  (st.allocations || []).forEach(function (h) {
    if (h.isactive === 'N' || !(h.lines || []).some(function (l) { return Number(l.c_invoice_id) === Number(iv.c_invoice_id); })) return;
    ops.push({ op_type: 'UPDATE_FIELD', table: 'C_AllocationHdr', id: h.c_allocationhdr_id, field: 'isactive', value: 'N' });
    ops.push({ op_type: 'SET_STATUS', table: 'C_AllocationHdr', id: h.c_allocationhdr_id, doc_status: 'RE' });
    h.lines.forEach(function (l) {
      ops.push({ op_type: 'UPDATE_LINE', table: 'C_AllocationLine', id: l.c_allocationline_id, amount: 0, discountamt: 0, writeoffamt: 0, overunderamt: 0, isactive: 'N' });
      if (l.c_payment_id) touched[l.c_payment_id] = true;
    });
  });
  var inactive = {}; ops.forEach(function (o) { if (o.table === 'C_AllocationHdr' && o.field === 'isactive') inactive[o.id] = true; });
  (st.payments || []).forEach(function (p) {
    if (!touched[p.c_payment_id]) return;
    var alloc = 0; (st.allocations || []).forEach(function (h) { if (h.isactive === 'N' || inactive[h.c_allocationhdr_id]) return; (h.lines || []).forEach(function (l) { if (Number(l.c_payment_id) === Number(p.c_payment_id)) alloc += Number(l.amount || 0); }); });
    ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Payment', id: p.c_payment_id, field: 'isallocated', value: Math.abs(alloc) === Math.abs(Number(p.payamt)) ? 'Y' : 'N' });
  });
  var rid = opts.newId('C_Invoice');
  ops = ops.concat(_reversalInvoiceDocOps(iv, iv.c_order_id, rid));
  var rLines = (iv.lines || []).map(function (l) { return { m_product_id: l.m_product_id, qtyinvoiced: _neg(l.qtyinvoiced), c_orderline_id: l.c_orderline_id }; });
  if (opts.orderLines) ops = ops.concat(invoiceOrderLineEffects({ issotrx: iv.issotrx, iscreditmemo: String(iv.iscreditmemo) === 'Y' ? 'Y' : 'N' }, rLines, opts.orderLines).ops);
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: rid, field: 'ispaid', value: 'Y' });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: iv.c_invoice_id, field: 'ispaid', value: 'Y' });
  (iv.lines || []).forEach(function (l) { if (l.m_inoutline_id) ops.push({ op_type: 'UPDATE_LINE', table: 'M_InOutLine', id: l.m_inoutline_id, isinvoiced: 'N' }); });
  // §REVIEW-FIX-2026-10-11 D2: gt = getGrandTotal(true) (credit memo negated, MInvoice.java:844-853), then AP negated (MInvoice.java:2799-2802)
  var gt = Number(iv.grandtotal) * (String(iv.iscreditmemo) === 'Y' ? -1 : 1) * (String(iv.issotrx) === 'N' ? -1 : 1), hid = opts.newId('C_AllocationHdr');
  ops.push({ op_type: 'CREATE_DOCUMENT', table: 'C_AllocationHdr', c_allocationhdr_id: hid, c_currency_id: iv.c_currency_id, dateacct: iv.dateacct });
  ops.push({ op_type: 'CREATE_LINE', table: 'C_AllocationLine', c_allocationline_id: hid * 10 + 1, c_allocationhdr_id: hid, c_invoice_id: iv.c_invoice_id, c_bpartner_id: iv.c_bpartner_id, amount: gt, discountamt: 0, writeoffamt: 0, overunderamt: 0 });
  ops.push({ op_type: 'CREATE_LINE', table: 'C_AllocationLine', c_allocationline_id: hid * 10 + 2, c_allocationhdr_id: hid, c_invoice_id: rid, c_bpartner_id: iv.c_bpartner_id, amount: -gt, discountamt: 0, writeoffamt: 0, overunderamt: 0 });
  ops.push({ op_type: 'SET_STATUS', table: 'C_AllocationHdr', id: hid, doc_status: 'CO' });
  return { ok: true, ops: ops, reversalId: rid, allocationId: hid };
}
// _reversalInOutDocOps — the reversal DOCUMENT of a completed shipment/receipt (MInOut.reverse :2743-2880: copy, QtyEntered / MovementQty NEGATED, ReversalLine_ID, both 'RE', Reversal_ID both ways).
// Shared by voidOrder (POS void, F4) and reverseInOut (Reverse-Correct, F23).
function _reversalInOutDocOps(s, orderId, rid) {
  var ops = [];
  ops.push({ op_type: 'CREATE_DOCUMENT', table: 'M_InOut', source_id: orderId, m_inout_id: rid, movementtype: s.movementtype, reversal_id: s.m_inout_id });
  (s.lines || []).forEach(function (l) {
    ops.push({ op_type: 'CREATE_LINE', table: 'M_InOutLine', m_inout_id: rid, m_product_id: l.m_product_id, movementqty: _neg(l.movementqty), c_orderline_id: l.c_orderline_id, reversalline_id: l.m_inoutline_id });
  });
  ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: rid, doc_status: 'RE' });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'M_InOut', id: s.m_inout_id, field: 'reversal_id', value: rid });
  ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: s.m_inout_id, doc_status: 'RE' });
  return ops;
}
// reverseInOut — Reverse-Correct of a COMPLETED shipment/receipt (MInOut.reverseCorrectIt :2714-2740 → reverse(accrual=false) :2743-2880). Implementing prompts/SQLiteIDEMPIERE.md §64.4 (F23) — Witness: M3 O2C6-RC-SHIP.
// The reversal is COMPLETED (:2851) — completeIt with negated MovementQty: storage at the line locator −= signed qty (a C- reversal puts goods back), the order-line rule
// (inoutOrderLineEffects: delivered back, reservation restored); invoice lines pointing at the original lines lose the link (:2812-2836); both 'RE'.
// Costs/books are the posting layer's (Doc_InOut reversal copies the original's facts swapped, :287-300; cost quantities follow the posted reversal).
// io = { m_inout_id, c_order_id, movementtype, issotrx, docstatus, lines:[{m_inoutline_id, m_product_id, movementqty, c_orderline_id, m_locator_id}] }
// opts = { newId(table), orderLines (optional), invoiceLines (optional [{c_invoiceline_id, m_inoutline_id}]), periodOpen:{ok} (optional, :2750) }
function reverseInOut(io, opts) {
  opts = opts || {};
  if (io.docstatus && io.docstatus !== 'CO' && io.docstatus !== 'CL') return { ok: false, reason: 'not-completed', docstatus: io.docstatus };
  if (opts.periodOpen && !opts.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };
  var rid = opts.newId('M_InOut'), ops = _reversalInOutDocOps(io, io.c_order_id, rid), out = String(io.movementtype).charAt(1) === '-';
  var rLines = (io.lines || []).map(function (l) { return { m_product_id: l.m_product_id, movementqty: _neg(l.movementqty), c_orderline_id: l.c_orderline_id, m_locator_id: l.m_locator_id }; });
  rLines.forEach(function (l) { if (l.m_product_id) ops.push({ op_type: 'MOVE_STOCK', table: 'M_Storage', m_product_id: l.m_product_id, m_locator_id: l.m_locator_id, qty: out ? -Number(l.movementqty) : Number(l.movementqty) }); });
  if (opts.orderLines) ops = ops.concat(inoutOrderLineEffects({ issotrx: io.issotrx, movementtype: io.movementtype }, rLines, opts.orderLines).ops);
  var orig = {}; (io.lines || []).forEach(function (l) { orig[l.m_inoutline_id] = true; });
  (opts.invoiceLines || []).forEach(function (il) { if (orig[il.m_inoutline_id]) ops.push({ op_type: 'UPDATE_LINE', table: 'C_InvoiceLine', id: il.c_invoiceline_id, m_inoutline_id: null }); });
  return { ok: true, ops: ops, reversalId: rid };
}
function voidOrder(sale, opts) {
  var ops = [], skip = { CL: 1, RE: 1, VO: 1 };
  function neg(v) { return v == null ? v : -Number(v); }
  function addDesc(old, txt) { return old == null || old === '' ? txt : old + ' | ' + txt; }
  (sale.shipments || []).forEach(function (s) {
    if (skip[s.docstatus]) return;
    if (s.docstatus !== 'CO') { ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: s.m_inout_id, doc_status: 'VO' }); return; }
    // §64.4: shared with reverseInOut (same ops, same order). §REVIEW-FIX-2026-10-11 D3: MInOut.reverse COMPLETES the reversal (MInOut.java:~2851) ⇒ the storage effect and the order-line
    // quantity rule (delivered back, reservation restored) ride with the document, exactly as reverseInOut emits them — one implementation. MOVE_STOCK is the storage effect a host applies
    // (document rows are not summed by storage hosts), so there is no double count; the order-line effect needs the line state, so it is emitted only when the host supplies opts.orderLines.
    ops = ops.concat(reverseInOut(Object.assign({}, s, { c_order_id: sale.order.c_order_id, issotrx: s.issotrx || 'Y' }), { newId: opts.newId, orderLines: opts.orderLines }).ops);
  });
  (sale.invoices || []).forEach(function (iv) {
    if (skip[iv.docstatus]) return;
    if (iv.docstatus !== 'CO') { ops.push({ op_type: 'SET_STATUS', table: 'C_Invoice', id: iv.c_invoice_id, doc_status: 'VO' }); return; }
    // §66.3 (F28): MOrder.voidIt → MInvoice.reverseCorrectIt (MOrder.java:2808-2830) — the FULL invoice Reverse-Correct (F22): reversal document, both IsPaid, the invoice's allocations reversed,
    // the invoice-vs-reversal allocation. Was the reversal document only (F4/F14), which left the reversed pair open on the BP and no allocation (measured on the pilot, S12).
    ops = ops.concat(reverseInvoice(Object.assign({}, iv, { c_order_id: sale.order.c_order_id, issotrx: iv.issotrx || 'Y' }), { allocations: iv.allocations || [], payments: iv.payments || [] }, { newId: opts.newId }).ops);
  });
  (sale.lines || []).forEach(function (l) {
    if (Number(l.qtyordered) === 0) return;
    // line.setQty(0) = QtyEntered AND QtyOrdered (MOrderLine.setQty, MOrder.voidIt :2709); reserveStock(null) (:2735-2740) then releases whatever is still reserved (product lines only)
    var up = { op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: l.c_orderline_id, qtyordered: 0, qtyentered: 0, linenetamt: 0,
      description: addDesc(l.description, opts.voidedMsg + ' (' + l.qtyordered + ')') };
    if (l.m_product_id) up.qtyreserved = 0;
    ops.push(up);
  });
  // MOrder.voidIt :2724-2728 — every C_OrderTax row is recalculated from the (now zero) lines. sale.orderTaxes = the order's tax rows [{c_tax_id}] when the host has them.
  (sale.orderTaxes || []).forEach(function (t) {
    ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderTax', c_order_id: sale.order.c_order_id, c_tax_id: t.c_tax_id, taxbaseamt: 0, taxamt: 0 });
  });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Order', id: sale.order.c_order_id, field: 'description', value: addDesc(sale.order.description, opts.voidedMsg) });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Order', id: sale.order.c_order_id, field: 'totallines', value: 0 });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Order', id: sale.order.c_order_id, field: 'grandtotal', value: 0 });
  ops.push({ op_type: 'SET_STATUS', table: 'C_Order', id: sale.order.c_order_id, doc_status: 'VO' });
  return ops;
}

// completeMovement — the Inventory Move doc-action CO as ops. Implementing prompts/SQLiteIDEMPIERE.md §56 (F15) — Witness: M3 MV1.
// Port of MMovement.prepareIt/completeIt (MMovement.java:290-320 no lines ⇒ @NoLines@; :455-520 per STOCKED product line: storage FROM locator −qty, TO locator +qty).
//   movement = { m_movement_id }, lines [{ m_product_id, movementqty, m_locator_id, m_locatorto_id }], opts = { isStocked(pid) → bool (default true), periodCheck() → {ok} (optional, :296-302) }
function completeMovement(movement, lines, opts) {
  opts = opts || {};
  if (opts.periodCheck) { var pc = opts.periodCheck(); if (!pc.ok) return { ok: false, reason: 'PeriodClosed' }; }
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  var ops = [];
  lines.forEach(function (l) {
    if (opts.isStocked && !opts.isStocked(l.m_product_id)) return;
    ops.push({ op_type: 'MOVE_STOCK', table: 'M_Storage', m_product_id: l.m_product_id, m_locator_id: l.m_locator_id, qty: -Number(l.movementqty) });
    ops.push({ op_type: 'MOVE_STOCK', table: 'M_Storage', m_product_id: l.m_product_id, m_locator_id: l.m_locatorto_id, qty: Number(l.movementqty) });
  });
  ops.push({ op_type: 'SET_STATUS', table: 'M_Movement', id: movement.m_movement_id, doc_status: 'CO' });
  return { ok: true, ops: ops };
}

// completePayment — C_Payment CO with the invoice allocation. Implementing prompts/SQLiteIDEMPIERE.md §57 (F16) — Witness: M3 PAY1.
// MPayment.completeIt → allocateIt (MPayment.java:2298-2304) → allocateInvoice (:2369-2420); MInvoice.testAllocation (:1433-1455); MPayment.testAllocation (:966-982).
//   pay = { c_payment_id, c_bpartner_id, c_invoice_id, payamt, isreceipt, discountamt, writeoffamt, overunderamt, c_currency_id, dateacct }
//   invoice = { c_invoice_id, grandtotal, issotrx ('Y' default), iscreditmemo, allocatedamt (the RAW SIGNED sum of the invoice's existing active allocation lines, AP negative — MInvoice.getAllocatedAmt :1393; default 0), dateacct }   opts = { newId() }
function completePayment(pay, invoice, opts) {
  var c = function (v) { return Math.round(Number(v || 0) * 100); };
  var ops = [{ op_type: 'SET_STATUS', table: 'C_Payment', id: pay.c_payment_id, doc_status: 'CO' }];
  if (!pay.c_invoice_id) return { ok: true, ops: ops };                        // payment-selection / order / multi-allocation paths not ported (stated)
  if (!invoice) return { ok: false, reason: 'invoice not found' };
  var amt = c(pay.payamt), over = c(pay.overunderamt);
  if (over < 0 && amt > 0) amt += over;                                         // :2373-2375 overpayment (negative)
  var sign = String(pay.isreceipt) === 'N' ? -1 : 1;                            // :2386-2391 AP negated
  var hid = opts.newId();
  var da = [pay.dateacct, invoice.dateacct].filter(Boolean).sort().pop() || null;   // :2380-2382 header DateAcct = later of payment/invoice
  ops.push({ op_type: 'CREATE_DOCUMENT', table: 'C_AllocationHdr', c_allocationhdr_id: hid, c_currency_id: pay.c_currency_id, dateacct: da });
  ops.push({ op_type: 'CREATE_LINE', table: 'C_AllocationLine', c_allocationline_id: hid * 10 + 1, c_allocationhdr_id: hid, c_payment_id: pay.c_payment_id, c_invoice_id: invoice.c_invoice_id,
    c_bpartner_id: pay.c_bpartner_id, amount: sign * amt / 100, discountamt: sign * c(pay.discountamt) / 100, writeoffamt: sign * c(pay.writeoffamt) / 100, overunderamt: sign * over / 100 });
  ops.push({ op_type: 'SET_STATUS', table: 'C_AllocationHdr', id: hid, doc_status: 'CO' });
  // §REVIEW-FIX-2026-10-11 D6: MInvoice.testAllocation (MInvoice.java:1433-1455) compares the RAW SIGNED sum of the invoice's active allocation lines (getAllocatedAmt :1393 =
  // Σ Amount+DiscountAmt+WriteOffAmt) with GrandTotal, negated for AP and for a credit memo. The allocation lines THIS verb creates are already sign-adjusted (AP payment ⇒ negative,
  // :2386-2391), so `invoice.allocatedamt` is that same raw signed sum of the EXISTING lines (AP: negative) and the new line is added as written — no second AP flip, no abs().
  var invAlloc = c(invoice.allocatedamt) + sign * (amt + c(pay.discountamt) + c(pay.writeoffamt));
  var total = c(invoice.grandtotal) * (String(invoice.issotrx) === 'N' ? -1 : 1) * (String(invoice.iscreditmemo) === 'Y' ? -1 : 1);
  if (invAlloc === total) ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: invoice.c_invoice_id, field: 'ispaid', value: 'Y' });
  if (amt === c(pay.payamt)) ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Payment', id: pay.c_payment_id, field: 'isallocated', value: 'Y' });
  return { ok: true, ops: ops };
}

// prepareInvoice — a stand-alone (direct) invoice: line pricing, line tax, invoice tax rows, totals, as ops. Implementing prompts/SQLiteIDEMPIERE.md §58 (F17) — Witness: M3 INV1/INV2.
// MInvoiceLine.beforeSave (MInvoiceLine.java:877-950): price from the invoice's price list at DateInvoiced when PriceActual = PriceList = 0 (:899-903) — NO price-list refusal for invoices (unlike
// MOrderLine :846-849), an unpriced product stays at 0; tax via Tax.get when C_Tax_ID = 0 (:917-918); LineNetAmt = PriceEntered × QtyEntered HALF_UP (:941); totals = StandardTaxProvider.calculateInvoiceTaxTotal
// (StandardTaxProvider.java:166-230 — the order algorithm, `orderTaxes`). ctx = { priceOf(pid, date), taxOf(pid) → {ok,c_tax_id}, taxById, taxChildren, taxIncluded, mutCents (test only) }.
function prepareInvoice(hdr, lines, ctx) {
  var out = [], ops = [{ op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', c_invoice_id: hdr.c_invoice_id, issotrx: hdr.issotrx, c_bpartner_id: hdr.c_bpartner_id, dateinvoiced: hdr.dateinvoiced }];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i], p = ctx.priceOf(l.m_product_id, hdr.dateinvoiced), price = p && p.pricestd != null ? String(p.pricestd) : '0';
    var t = ctx.taxOf(l.m_product_id); if (!t || !t.ok) return { ok: false, reason: 'TaxNotFound', m_product_id: l.m_product_id };
    var pd = _dec(price), qd = _dec(l.qtyinvoiced), net = Number(_rhu(pd.n * qd.n * 100n, 10n ** BigInt(pd.k + qd.k))) + (i === 0 ? (ctx.mutCents || 0) : 0);
    var line = { c_invoiceline_id: l.c_invoiceline_id, m_product_id: l.m_product_id, qtyinvoiced: l.qtyinvoiced, priceactual: price, linenetamt: (net / 100).toFixed(2), c_tax_id: t.c_tax_id };
    out.push(line); ops.push(Object.assign({ op_type: 'CREATE_LINE', table: 'C_InvoiceLine', c_invoice_id: hdr.c_invoice_id }, line));
  }
  var r = orderTaxes(out, ctx.taxById, !!ctx.taxIncluded, ctx.taxChildren);
  var bad = r.rows.filter(function (x) { return x.error; })[0]; if (bad) return { ok: false, reason: 'tax-error', detail: bad.error };
  r.rows.forEach(function (x) { ops.push({ op_type: 'CREATE_LINE', table: 'C_InvoiceTax', c_invoice_id: hdr.c_invoice_id, c_tax_id: x.c_tax_id, taxbaseamt: x.taxbaseamt / 100, taxamt: x.taxamt / 100 }); });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: hdr.c_invoice_id, field: 'totallines', value: r.totalLines / 100 });
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: hdr.c_invoice_id, field: 'grandtotal', value: r.grandTotal / 100 });
  return { ok: true, ops: ops, lines: out, taxes: r.rows, totalLines: r.totalLines, grandTotal: r.grandTotal };
}

// completeInventory — M_Inventory CO as ops. Implementing prompts/SQLiteIDEMPIERE.md §59 (F18) — Witness: M3 PI1/PI2.
// MInventory.completeIt (MInventory.java:525-540): per line qtyDiff = QtyCount − QtyBook (Physical Inventory) or −QtyInternalUse (Internal Use); 0 ⇒ no movement (:587);
// storage at the line locator += qtyDiff. No lines ⇒ @NoLines@ (prepareIt). inventory = { m_inventory_id, docsubtypeinv 'PI'|'IU' }.
function completeInventory(inventory, lines, opts) {
  opts = opts || {};
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  var ops = [];
  lines.forEach(function (l) {
    var diff = inventory.docsubtypeinv === 'IU' ? -Number(l.qtyinternaluse || 0) : Number(l.qtycount || 0) - Number(l.qtybook || 0);
    if (diff === 0 || (opts.isStocked && !opts.isStocked(l.m_product_id))) return;
    ops.push({ op_type: 'MOVE_STOCK', table: 'M_Storage', m_product_id: l.m_product_id, m_locator_id: l.m_locator_id, qty: diff });
  });
  ops.push({ op_type: 'SET_STATUS', table: 'M_Inventory', id: inventory.m_inventory_id, doc_status: 'CO' });
  return { ok: true, ops: ops };
}

// ── TAX (prompts/SQLiteIDEMPIERE.md §45, F11) — Witness: M3 T1 + the tax keys of every scenario ─────────────────────────────────────
// Integer-exact decimal helpers (BigInt): amounts in minor units (cents at precision 2); rates as decimal strings.
function _dec(str) { var t = String(str == null ? '0' : str).trim(), neg = t[0] === '-'; if (neg) t = t.slice(1); var p = t.split('.'), f = p[1] || ''; return { n: BigInt((neg ? '-' : '') + (p[0] || '0') + f), k: f.length }; }
function _rhu(n, d) { // HALF_UP (away from zero on .5), d > 0
  var neg = n < 0n, a = neg ? -n : n, q = a / d, r = a % d; if (r * 2n >= d) q += 1n; return neg ? -q : q;
}
// calcTax — MTax.calculateTax (MTax.java:340-367). tax {rate, issummary, c_tax_id}; children(taxId) → child taxes (summary). amount in minor units at `scale`.
function calcTax(tax, amountMinor, included, children) {
  var list = String(tax.issummary) === 'Y' ? (children ? children(tax.c_tax_id) : []) : [tax];
  var a = BigInt(amountMinor), total = 0n;
  list.forEach(function (t) {
    var r = _dec(t.rate); if (r.n === 0n) return;                       // isZeroTax ⇒ 0 (per child too: 0 adds nothing)
    var den = 100n * (10n ** BigInt(r.k));                              // rate/100 = r.n / den
    if (!included) total += _rhu(a * r.n, den);                         // amount × rate/100, HALF_UP at scale (:355-358)
    else {                                                              // base = amount / (1+rate/100) at 12 decimals, tax = amount − base, HALF_UP at scale (:360-365)
      var S = 10n ** 10n, base12 = _rhu(a * S * den, den + r.n); total += _rhu(a * S - base12, S);
    }
  });
  return Number(total);
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
//   lines [{c_tax_id, linenetamt (decimal string)}], taxById(id) → c_tax row, included = price list IsTaxIncluded. Amounts out in minor units (precision 2).
function orderTaxes(lines, taxById, included, children) {
  var c = function (v) { var r = _dec(v); return Number(r.k <= 2 ? r.n * (10n ** BigInt(2 - r.k)) : _rhu(r.n, 10n ** BigInt(r.k - 2))); };
  var totalLines = 0, seen = [], rows = [];
  lines.forEach(function (l) { totalLines += c(l.linenetamt); var id = Number(l.c_tax_id); if (seen.indexOf(id) < 0) seen.push(id); });
  seen.forEach(function (id) {
    var t = taxById(id); if (!t) { rows.push({ c_tax_id: id, error: 'tax not found' }); return; }
    if (Number(t.c_taxprovider_id || 0)) { rows.push({ c_tax_id: id, error: 'external tax provider not ported' }); return; }
    var parent = Number(t.parent_tax_id || 0), base = 0, amt = 0, doc = String(t.isdocumentlevel) === 'Y';
    lines.forEach(function (l) { if (Number(l.c_tax_id) === id || (parent > 0 && Number(l.c_tax_id) === parent)) { base += c(l.linenetamt); if (!doc) amt += calcTax(t, c(l.linenetamt), included, children); } });
    if (doc) amt = calcTax(t, base, included, children);
    rows.push({ c_tax_id: id, taxbaseamt: included ? base - amt : base, taxamt: amt });
  });
  var out = [], grand = totalLines;
  rows.forEach(function (r) {
    if (r.error) { out.push(r); return; }
    var t = taxById(r.c_tax_id);
    if (String(t.issummary) === 'Y') {                                  // :75-99 one row per child, the summary row deleted
      (children ? children(r.c_tax_id) : []).forEach(function (ch) { var a = calcTax(ch, r.taxbaseamt, false, children); out.push({ c_tax_id: ch.c_tax_id, taxbaseamt: r.taxbaseamt, taxamt: a }); if (!included) grand += a; });
    } else { out.push(r); if (!included) grand += r.taxamt; }
  });
  return { rows: out, totalLines: totalLines, grandTotal: grand };
}

// acctSetupGap — which ACTIVE accounting schemas have no product-category accounting row for a category. Implementing prompts/SQLiteIDEMPIERE.md §43 (S5, F10).
// Legacy: MOrder.prepareIt ASI loop (MOrder.java:1633-1637) → MProduct.isASIMandatoryFor over every active client schema (MProduct.java:1028-1037) → getCostingLevel →
// MProductCategoryAcct.get(...) null ⇒ NPE (MProduct.java:1066-1067): the order cannot be prepared. SQLite refuses with a NAMED error instead (same outcome). Pure.
function acctSetupGap(categoryId, activeSchemaIds, categoryAcctRows) {
  var have = {}; (categoryAcctRows || []).forEach(function (r) { if (String(r.m_product_category_id) === String(categoryId)) have[String(r.c_acctschema_id)] = true; });
  return (activeSchemaIds || []).filter(function (sid) { return !have[String(sid)]; });
}

// periodOpen — MPeriod.isOpen(DateAcct, DocBaseType, Org) as a pure function. Implementing prompts/SQLiteIDEMPIERE.md §42 (F7) — Witness: M3 S8c.
// data = { schema: { autoperiodcontrol, period_openhistory, period_openfuture } (client primary schema),
//          periods: [{ c_period_id, startdate, enddate, isactive, periodtype, control: { <DocBaseType>: <PeriodStatus> } }] (the org calendar's periods) }
// MPeriod.get (MPeriod.java:180-195): standard ('S') ACTIVE period with TRUNC(StartDate) <= date <= TRUNC(EndDate); none ⇒ closed (:304-308).
// Auto period control (:735-770): open iff today-history <= date <= today+future. Else C_PeriodControl status 'O' for the DocBaseType (:772-785, MPeriodControl.java:157-164).
// Dates as 'YYYY-MM-DD…' strings; today supplied by the host (legacy: the server clock).
function periodOpen(data, dateAcct, docBaseType, today) {
  var d = String(dateAcct).slice(0, 10);
  if (!docBaseType) return { ok: false, reason: 'no-docbasetype' };
  var p = (data.periods || []).filter(function (x) {
    return String(x.isactive) === 'Y' && String(x.periodtype || 'S') === 'S' && String(x.startdate).slice(0, 10) <= d && d <= String(x.enddate).slice(0, 10);
  })[0];
  if (!p) return { ok: false, reason: 'period-closed', why: 'no period for ' + d };
  var sc = data.schema || {};
  if (String(sc.autoperiodcontrol) === 'Y') {
    var t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10)), day = 86400000;
    var first = new Date(t - Number(sc.period_openhistory || 0) * day).toISOString().slice(0, 10);
    var last = new Date(t + Number(sc.period_openfuture || 0) * day).toISOString().slice(0, 10);
    if (d < first) return { ok: false, reason: 'period-closed', why: 'before first day ' + first };
    if (d > last) return { ok: false, reason: 'period-closed', why: 'after last day ' + last };
    return { ok: true, c_period_id: p.c_period_id };
  }
  var st = p.control && p.control[docBaseType];
  if (st == null) return { ok: false, reason: 'period-closed', why: 'no period control for ' + docBaseType };
  return st === 'O' ? { ok: true, c_period_id: p.c_period_id } : { ok: false, reason: 'period-closed', why: 'status ' + st };
}

// priceAt — the price-list VERSION valid at a date. Implementing prompts/SQLiteIDEMPIERE.md §41 (F8) — Witness: M3 S8b/S8d.
// Port of MProductPricing.calculatePL (MProductPricing.java:236-300): rows = the product's prices in ACTIVE versions of ONE price list (active price rows),
// each { validfrom, pricestd, pricelist, pricelimit }; ordered ValidFrom DESC, the first with ValidFrom <= date (null ValidFrom always qualifies) wins; none ⇒ null.
// date: 'YYYY-MM-DD…' (the order's DateOrdered; the caller passes today when the order has none, :262-263). Pure.
function priceAt(rows, date) {
  var d = String(date).slice(0, 10);
  var sorted = (rows || []).slice().sort(function (a, b) { return String(b.validfrom || '').localeCompare(String(a.validfrom || '')); });
  for (var i = 0; i < sorted.length; i++) {
    var vf = sorted[i].validfrom;
    if (vf == null || String(vf).slice(0, 10) <= d) return sorted[i];
  }
  return null;
}

// creditCheckOrder — the SO credit gate of MOrder.prepareIt. Implementing prompts/SQLiteIDEMPIERE.md §36 (S13, fix F5) — Witness: M3 S13a/b/c.
// Port of CreditManagerOrder.checkCreditStatus (CreditManagerOrder.java:48-98) + MBPartner.getSOCreditStatus(additionalAmt) (MBPartner.java:826-850).
//   order = { issotrx, docsubtypeso, paymentrule, grandtotal (base currency) }, bp = { socreditstatus, so_creditlimit, totalopenbalance },
//   sys = { CHECK_CREDIT_ON_CASH_POS_ORDER, CHECK_CREDIT_ON_PREPAY_ORDER } ('Y'|'N'; absent ⇒ true, MSysConfig.getBooleanValue default).
// Returns { ok:true } or { ok:false, reason:'credit-stop'|'credit-hold'|'credit-over-hold', msg, … } — the LAST matching branch wins, as in the Java (errorMsg overwritten).
function creditCheckOrder(order, bp, sys) {
  sys = sys || {};
  var on = function (k) { return sys[k] == null ? true : String(sys[k]) === 'Y'; };
  if (String(order.issotrx) !== 'Y') return { ok: true };
  if (order.docsubtypeso === 'WR' && order.paymentrule === 'B' && !on('CHECK_CREDIT_ON_CASH_POS_ORDER')) return { ok: true, skipped: 'cash-pos' };
  if (order.docsubtypeso === 'PR' && !on('CHECK_CREDIT_ON_PREPAY_ORDER')) return { ok: true, skipped: 'prepay' };
  var gt = Number(order.grandtotal || 0);
  if (!(gt > 0) || !bp) return { ok: true };
  var st = bp.socreditstatus, lim = Number(bp.so_creditlimit || 0), open = Number(bp.totalopenbalance || 0), err = null;
  if (st === 'S') err = { reason: 'credit-stop', msg: 'BPartnerCreditStop' };
  if (st === 'H') err = { reason: 'credit-hold', msg: 'BPartnerCreditHold' };
  // getSOCreditStatus(add) (MBPartner.java:838-849): nothing-to-do ⇒ the BP's OWN status; otherwise Hold only when (limit − add) < open, else Watch/OK — never the BP's own Hold
  // (§REVIEW-FIX-2026-10-11 D7: a BP already on Hold with headroom left keeps the BPartnerCreditHold message, CreditManagerOrder.java:75-85).
  var withAdd = (st === 'X' || st === 'S' || lim === 0) ? st : ((lim - gt) < open ? 'H' : 'O');
  if (withAdd === 'H') err = { reason: 'credit-over-hold', msg: 'BPartnerOverOCreditHold' };
  return err ? { ok: false, reason: err.reason, msg: err.msg, totalOpenBalance: open, grandTotal: gt, creditLimit: lim } : { ok: true };
}

// ── ORDER-LINE QUANTITIES (prompts/SQLiteIDEMPIERE.md §64.1, F20) — Witness: M3 cycle O2C1..O2C6 key ol_qty ───────────────────────────
// Each verb returns UPDATE_LINE ops on C_OrderLine with the new qtyreserved / qtydelivered / qtyinvoiced; lines = the order lines {c_orderline_id, m_product_id, qtyordered,
// qtyreserved, qtydelivered, qtyinvoiced}. Quantities are plain numbers (UOM precision is the host's).
// orderReserve — MOrder.reserveStock (MOrder.java:1930-2023): target = QtyOrdered when the document is binding (not a proposal, not being voided) else 0;
// difference = max(target − QtyDelivered, 0) − QtyReserved; nothing when difference = 0, or when QtyOrdered < 0 and nothing is reserved; QtyOrdered < 0 with a
// reservation ⇒ release it all; product lines only (charges have no product). order = { binding (default true) }.
function orderReserve(order, lines) {
  var ops = [], binding = order.binding !== false;
  (lines || []).forEach(function (l) {
    if (!l.m_product_id) return;
    var ordered = Number(l.qtyordered || 0), res = Number(l.qtyreserved || 0), del = Number(l.qtydelivered || 0);
    var target = binding ? ordered : 0, diff = (target > del ? target - del : 0) - res;
    if (diff === 0 || ordered < 0) {
      if (diff === 0 || res === 0) return;
      if (ordered < 0 && res > 0) diff = -res;
    }
    ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: l.c_orderline_id, qtyreserved: res + diff });
  });
  return { ok: true, ops: ops };
}
// inoutOrderLineEffects — MInOut.completeIt per line (MInOut.java:1686-1690 Qty = MovementQty, negated for a '-' movement; :1959-1971 reservation; :1973-1985 delivered):
// QtyOrdered >= 0 ⇒ QtyReserved −= MovementQty, floored at 0, and 0 when QtyDelivered already exceeds QtyOrdered; SO (or no product) ⇒ QtyDelivered −= Qty (SO) / += Qty.
// The same rule completes a reversal (its lines carry the negated MovementQty), which is how a Reverse-Correct restores the reservation. Closed orders are skipped (opts.orderClosed).
function inoutOrderLineEffects(inout, sLines, orderLines, opts) {
  opts = opts || {};
  var ops = [], by = {};
  (orderLines || []).forEach(function (l) { by[l.c_orderline_id] = { c_orderline_id: l.c_orderline_id, qtyordered: Number(l.qtyordered || 0), qtyreserved: Number(l.qtyreserved || 0), qtydelivered: Number(l.qtydelivered || 0) }; });
  (sLines || []).forEach(function (s) {
    var o = by[s.c_orderline_id]; if (!o) return;
    var mq = Number(s.movementqty || 0), qty = String(inout.movementtype).charAt(1) === '-' ? -mq : mq;
    if (s.m_product_id && !opts.orderClosed && o.qtyordered >= 0) {
      o.qtyreserved -= mq;
      if (o.qtyreserved < 0) o.qtyreserved = 0; else if (o.qtydelivered > o.qtyordered) o.qtyreserved = 0;
    }
    if (String(inout.issotrx) === 'Y' || !s.m_product_id) o.qtydelivered = String(inout.issotrx) === 'Y' ? o.qtydelivered - qty : o.qtydelivered + qty;
    ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: o.c_orderline_id, qtyreserved: o.qtyreserved, qtydelivered: o.qtydelivered });
  });
  return { ok: true, ops: ops };
}
// invoiceOrderLineEffects — MInvoice.completeIt (MInvoice.java:2111-2125): an invoice line linked to an order line, on a sales invoice (or without product) ⇒
// QtyInvoiced += QtyInvoiced (credit memo: −). A reversal invoice completes with negated quantities, so the same rule undoes it. Purchase lines go through MatchPO (not here).
function invoiceOrderLineEffects(invoice, iLines, orderLines) {
  var ops = [], by = {};
  (orderLines || []).forEach(function (l) { by[l.c_orderline_id] = { c_orderline_id: l.c_orderline_id, qtyinvoiced: Number(l.qtyinvoiced || 0) }; });
  (iLines || []).forEach(function (il) {
    var o = by[il.c_orderline_id]; if (!o) return;
    if (!(String(invoice.issotrx) === 'Y' || !il.m_product_id)) return;
    var q = Number(il.qtyinvoiced || 0); o.qtyinvoiced += String(invoice.iscreditmemo) === 'Y' ? -q : q;
    ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: o.c_orderline_id, qtyinvoiced: o.qtyinvoiced });
  });
  return { ok: true, ops: ops };
}

// completeInOut — a shipment/receipt doc-action CO (MInOut.completeIt MInOut.java:1640-2140), the parts the cycles measure. Implementing prompts/SQLiteIDEMPIERE.md §65.1 (F24) — Witness: M3 P2P2-RCPT.
// per line with a product: storage at the line locator += qty (a '-' movement: −qty, :1686-1690); the order-line rule (inoutOrderLineEffects); for a PURCHASE receipt (IsSOTrx=N, not a reversal)
// with an order line: MatchPO (MMatchPO.create(null, sLine, MovementDate, MovementQty) :2076-2090) whose afterSave adds the qty to QtyDelivered (MMatchPO.java:1185-1195). Status CO.
// io = { m_inout_id, issotrx, movementtype, docstatus, reversal_id }; lines [{m_inoutline_id, m_product_id, movementqty, c_orderline_id, m_locator_id}]; opts = { orderLines, newId(table) }
function completeInOut(io, lines, opts) {
  opts = opts || {};
  if (io.docstatus && io.docstatus !== 'DR' && io.docstatus !== 'IP') return { ok: false, reason: 'not-open', docstatus: io.docstatus };
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  var out = String(io.movementtype).charAt(1) === '-', ops = [];
  lines.forEach(function (l) { if (l.m_product_id && Number(l.movementqty)) ops.push({ op_type: 'MOVE_STOCK', table: 'M_Storage', m_product_id: l.m_product_id, m_locator_id: l.m_locator_id, qty: out ? -Number(l.movementqty) : Number(l.movementqty) }); });
  if (opts.orderLines) {
    var eff = inoutOrderLineEffects(io, lines, opts.orderLines).ops; ops = ops.concat(eff);
    if (String(io.issotrx) === 'N' && !io.reversal_id) {
      var cur = {}; opts.orderLines.forEach(function (o) { cur[o.c_orderline_id] = Number(o.qtydelivered || 0); });
      eff.forEach(function (o) { if (o.qtydelivered != null) cur[o.id] = o.qtydelivered; });
      lines.forEach(function (l) {
        if (!l.m_product_id || !l.c_orderline_id || !(l.c_orderline_id in cur)) return;
        var mid = opts.newId('M_MatchPO');
        ops.push({ op_type: 'CREATE_DOCUMENT', table: 'M_MatchPO', m_matchpo_id: mid, c_orderline_id: l.c_orderline_id, m_inoutline_id: l.m_inoutline_id, c_invoiceline_id: null, m_product_id: l.m_product_id, qty: Number(l.movementqty) });
        cur[l.c_orderline_id] += Number(l.movementqty);
        ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: l.c_orderline_id, qtydelivered: cur[l.c_orderline_id] });
      });
    }
  }
  ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: io.m_inout_id, doc_status: 'CO' });
  return { ok: true, ops: ops };
}

// matchFromInvoice — the matching a PURCHASE invoice completion creates (MInvoice.completeIt MInvoice.java:2075-2160, not for a reversal). Implementing prompts/SQLiteIDEMPIERE.md §65.2 (F25) — Witness: M3 P2P3-INV.
//  · invoice line with a receipt line (receipt processed): MatchInv qty = invoiced qty (credit memo −), capped at the receipt's signed MovementQty (:2083-2110);
//  · invoice line with an order line: MMatchPO.create(iLine, null, …) (:2131-2140 → MMatchPO.create :294-500): every NOT-yet-invoiced MatchPO of the order line whose qty fits the remaining invoiced qty
//    gets the invoice line; MMatchPO.afterSave adds its qty to QtyInvoiced (MMatchPO.java:1203-1209); nothing to attach ⇒ a new invoice-only MatchPO for the qty. A partial attach
//    (remaining qty smaller than a MatchPO's qty) is NOT ported ⇒ reported in `absent`.
// opts = { matchPO:[{m_matchpo_id, c_orderline_id, m_inoutline_id, c_invoiceline_id, qty}], orderLines, receiptLines:[{m_inoutline_id, movementqty, movementtype}], newId(table) }
function matchFromInvoice(invoice, iLines, opts) {
  opts = opts || {};
  var ops = [], absent = [];
  if (String(invoice.issotrx) !== 'N' || invoice.reversal_id) return { ok: true, ops: ops, absent: absent };
  var cm = String(invoice.iscreditmemo) === 'Y' ? -1 : 1, inv = {};
  (opts.orderLines || []).forEach(function (o) { inv[o.c_orderline_id] = Number(o.qtyinvoiced || 0); });
  var mpos = (opts.matchPO || []).map(function (m) { var o = {}; for (var k in m) o[k] = m[k]; return o; });
  (iLines || []).forEach(function (il) {
    if (!il.m_product_id) return;
    var q = Number(il.qtyinvoiced || 0) * cm;
    if (il.m_inoutline_id) {
      var rl = (opts.receiptLines || []).filter(function (r) { return Number(r.m_inoutline_id) === Number(il.m_inoutline_id); })[0];
      if (rl) {
        var mq = String(rl.movementtype || 'V+').charAt(1) === '-' ? -Number(rl.movementqty) : Number(rl.movementqty), matchQty = mq < q ? mq : q;
        ops.push({ op_type: 'CREATE_DOCUMENT', table: 'M_MatchInv', m_matchinv_id: opts.newId('M_MatchInv'), c_invoiceline_id: il.c_invoiceline_id, m_inoutline_id: il.m_inoutline_id, m_product_id: il.m_product_id, qty: matchQty });
      }
    }
    if (!il.c_orderline_id) return;
    var rem = q, attached = false;
    mpos.forEach(function (m) {
      if (rem <= 0 || Number(m.c_orderline_id) !== Number(il.c_orderline_id) || m.c_invoiceline_id) return;
      if (rem < Number(m.qty)) { absent.push('partial MatchPO attach not ported (MMatchPO.create :370-470)'); return; }
      m.c_invoiceline_id = il.c_invoiceline_id; attached = true;
      ops.push({ op_type: 'UPDATE_FIELD', table: 'M_MatchPO', id: m.m_matchpo_id, field: 'c_invoiceline_id', value: il.c_invoiceline_id });
      inv[il.c_orderline_id] = (inv[il.c_orderline_id] || 0) + Number(m.qty);
      ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: il.c_orderline_id, qtyinvoiced: inv[il.c_orderline_id] });
      rem -= Number(m.qty);
    });
    if (!attached && rem !== 0) {
      ops.push({ op_type: 'CREATE_DOCUMENT', table: 'M_MatchPO', m_matchpo_id: opts.newId('M_MatchPO'), c_orderline_id: il.c_orderline_id, m_inoutline_id: null, c_invoiceline_id: il.c_invoiceline_id, m_product_id: il.m_product_id, qty: rem });
      inv[il.c_orderline_id] = (inv[il.c_orderline_id] || 0) + rem;
      ops.push({ op_type: 'UPDATE_LINE', table: 'C_OrderLine', id: il.c_orderline_id, qtyinvoiced: inv[il.c_orderline_id] });
    }
  });
  return { ok: true, ops: ops, absent: absent };
}

// prepareRequisition — MRequisition.prepareIt (MRequisition.java:260-310) + MRequisitionLine.setPrice/setLineNetAmt (MRequisitionLine.java:234-276). Implementing prompts/SQLiteIDEMPIERE.md §66.1 (F29) — Witness: M3 REQ1/REQ-REJ.
// No requester, price list or warehouse ⇒ Invalid (:269-274); no lines ⇒ @NoLines@ (:276-279); period open (:282, host-supplied); line price = the price list's standard price at DateRequired when PriceActual is 0
// (MProductPricing via setRequisitionLine — host-supplied priceOf(pid, date)); LineNetAmt = Qty × PriceActual HALF_UP at the price list's standard precision (:290-291); TotalLines = Σ.
// completion (MRequisition.completeIt :342-377) sets CO and posts nothing here (Doc_Requisition books only with commitment accounting — the posting fold decides).
// hdr = { m_requisition_id, ad_user_id, m_pricelist_id, m_warehouse_id, daterequired }; lines [{m_requisitionline_id, m_product_id, qty, priceactual}]; ctx = { priceOf(pid, date) → {pricestd}|null, precision (default 2), periodOpen:{ok} }
function prepareRequisition(hdr, lines, ctx) {
  ctx = ctx || {};
  if (!Number(hdr.ad_user_id) || !Number(hdr.m_pricelist_id) || !Number(hdr.m_warehouse_id)) return { ok: false, reason: 'Invalid' };
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };
  var prec = ctx.precision == null ? 2 : Number(ctx.precision), total = 0, out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i], price = l.priceactual != null && Number(l.priceactual) !== 0 ? String(l.priceactual) : null;
    if (price == null && l.m_product_id) { var p = ctx.priceOf ? ctx.priceOf(l.m_product_id, hdr.daterequired) : null; price = p && p.pricestd != null ? String(p.pricestd) : '0'; }
    if (price == null) price = '0';
    var pd = _dec(price), qd = _dec(l.qty), net = Number(_rhu(pd.n * qd.n * 10n ** BigInt(prec), 10n ** BigInt(pd.k + qd.k)));   // minor units at the price-list precision
    total += net;
    out.push({ m_requisitionline_id: l.m_requisitionline_id, m_product_id: l.m_product_id, qty: l.qty, priceactual: price, linenetamt: net });
  }
  return { ok: true, lines: out, totalLines: total, ops: [{ op_type: 'SET_STATUS', table: 'M_Requisition', id: hdr.m_requisition_id, doc_status: 'CO' }] };
}

// completeCash — MCash.completeIt (MCash.java:completeIt): per Invoice cash line the invoice must be CO/CL/RE/VO (else @InvoiceCreateDocNotCompleted@, whole journal refused), and a NEW allocation
// (cash DateAcct, the line currency) with one line (Amount, Discount, WriteOff; invoice + cash line) is created and completed; the invoice IsPaid follows MInvoice.testAllocation (allocated = GrandTotal).
// Bank-transfer lines (a payment) and the other cash types' side documents are not ported ⇒ refused by name. Implementing §66.2 (F30) — Witness: M3 CASH1/CASH-REJ.
// cash = { c_cash_id, dateacct }; lines [{c_cashline_id, cashtype, c_invoice_id, amount, discountamt, writeoffamt, c_currency_id}]; ctx = { invoiceOf(id) → {docstatus, grandtotal, allocated}, newId(table) }
function completeCash(cash, lines, ctx) {
  ctx = ctx || {};
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };     // MCash.prepareIt: Cash Journal period open
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };
  var ops = [], diff = 0;
  for (var i = 0; i < (lines || []).length; i++) {
    var l = lines[i];
    if (l.c_currency_id != null && cash.c_currency_id != null && Number(l.c_currency_id) !== Number(cash.c_currency_id)) return { ok: false, reason: 'foreign-currency cash line not ported (MCash.prepareIt conversion)' };
    diff += Number(l.amount || 0);   // StatementDifference = Σ line amounts (MCash.prepareIt)
    if (l.cashtype === 'T') return { ok: false, reason: 'bank-transfer cash line not ported' };
    if (l.cashtype !== 'I') continue;
    var inv = ctx.invoiceOf(l.c_invoice_id);
    if (!inv || ['CO', 'CL', 'RE', 'VO'].indexOf(inv.docstatus) < 0) return { ok: false, reason: 'InvoiceCreateDocNotCompleted' };
    var hid = ctx.newId('C_AllocationHdr');
    ops.push({ op_type: 'CREATE_DOCUMENT', table: 'C_AllocationHdr', c_allocationhdr_id: hid, c_currency_id: l.c_currency_id, dateacct: cash.dateacct });
    ops.push({ op_type: 'CREATE_LINE', table: 'C_AllocationLine', c_allocationline_id: hid * 10 + 1, c_allocationhdr_id: hid, c_invoice_id: l.c_invoice_id, c_cashline_id: l.c_cashline_id, c_bpartner_id: inv.c_bpartner_id,
      amount: Number(l.amount || 0), discountamt: Number(l.discountamt || 0), writeoffamt: Number(l.writeoffamt || 0), overunderamt: 0 });
    ops.push({ op_type: 'SET_STATUS', table: 'C_AllocationHdr', id: hid, doc_status: 'CO' });
    var allocated = Math.round((Number(inv.allocated || 0) + Number(l.amount || 0) + Number(l.discountamt || 0) + Number(l.writeoffamt || 0)) * 100);
    if (allocated === Math.round(Number(inv.grandtotal) * 100)) ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Invoice', id: l.c_invoice_id, field: 'ispaid', value: 'Y' });
  }
  ops.push({ op_type: 'SET_STATUS', table: 'C_Cash', id: cash.c_cash_id, doc_status: 'CO' });
  return { ok: true, ops: ops, statementDifference: diff };
}

// completeJournal — GL Journal (spec §69, F33): MJournal.prepareIt (MJournal.java:463-576 @{u}) + MJournalLine.beforeSave (MJournalLine.java:338-347) + completeIt (:640-672).
// journal = { gl_journal_id, dateacct, postingtype, isactive, controlamt, c_acctschema_id }; lines [{ gl_journalline_id, line, account_id, amtsourcedr, amtsourcecr, currencyrate, dateacct, precision }]
// ctx = { periodOpen:{ok} (header DateAcct, DocBaseType GLJ), periodOpenAt(date) → {ok} (a line dated otherwise), accountOf(id) → { isactive, isdoccontrolled, postactual, postbudget, poststatistical },
//         suspenseBalancing: bool (C_AcctSchema_GL.UseSuspenseBalancing of the journal schema) }. Amounts: decimal strings in, minor units (cents) out.
function completeJournal(journal, lines, ctx) {
  ctx = ctx || {};
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };                        // validatePeriod(DateAcct) :470-472
  if (!lines || !lines.length) return { ok: false, reason: 'NoLines' };                                          // :476-480
  var pt = journal.postingtype || 'A', dr = 0, cr = 0, out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    var prec = l.precision == null ? 2 : Number(l.precision), rd = _dec(l.currencyrate == null ? '1' : l.currencyrate);
    var acct = function (src) { var sd = _dec(src == null ? '0' : src), k = rd.k + sd.k;                         // beforeSave :339-347: rate × source, HALF_UP only when the scale exceeds the precision
      return k > prec ? Number(_rhu(rd.n * sd.n * 10n ** BigInt(prec), 10n ** BigInt(k))) : Number(rd.n * sd.n * 10n ** BigInt(prec - k)); };
    var ad = acct(l.amtsourcedr), ac = acct(l.amtsourcecr);
    out.push({ gl_journalline_id: l.gl_journalline_id, account_id: l.account_id, amtacctdr: ad, amtacctcr: ac });
    if (journal.isactive === 'N') continue;                                                                      // :488 (the HEADER flag, as legacy reads it)
    if (l.dateacct && journal.dateacct && String(l.dateacct).slice(0, 10) !== String(journal.dateacct).slice(0, 10) && ctx.periodOpenAt && !ctx.periodOpenAt(l.dateacct).ok) return { ok: false, reason: 'PeriodClosed' };   // :491-495
    var a = ctx.accountOf ? ctx.accountOf(l.account_id) : null;
    if (!a) return { ok: false, reason: 'account ' + l.account_id + ' unknown' };
    var ln = ' - @Line@=' + (l.line == null ? i + 1 : l.line);
    if (a.isactive === 'N') return { ok: false, reason: '@InActiveAccount@' + ln };                               // :498-503
    if (a.isdoccontrolled === 'Y' && ['A', 'E', 'R'].indexOf(pt) >= 0) return { ok: false, reason: '@DocControlledError@' + ln };   // :506-516
    if (pt === 'A' && a.postactual === 'N') return { ok: false, reason: '@PostingTypeActualError@' + ln };         // :520-525
    if (pt === 'B' && a.postbudget === 'N') return { ok: false, reason: '@PostingTypeBudgetError@' + ln };         // :527-532
    if (pt === 'S' && a.poststatistical === 'N') return { ok: false, reason: '@PostingTypeStatisticalError@' + ln };   // :534-539
    dr += ad; cr += ac;                                                                                         // :542-543 (accounted amounts)
  }
  var control = journal.controlamt == null ? 0 : Number(_rhu(_dec(journal.controlamt).n * 100n, 10n ** BigInt(_dec(journal.controlamt).k)));
  if (control !== 0 && control !== dr) return { ok: false, reason: '@ControlAmtError@' };                       // :549-554
  if (dr !== cr && !ctx.suspenseBalancing) return { ok: false, reason: '@UnbalancedJornal@' };                  // :557-565
  return { ok: true, totalDr: dr, totalCr: cr, lines: out, ops: [{ op_type: 'SET_STATUS', table: 'GL_Journal', id: journal.gl_journal_id, doc_status: 'CO' }] };   // completeIt :669-671
}

// completeBankStatement — Bank Statement (spec §70, F34): MBankStatementLine.beforeSave (MBankStatementLine.java:180-262 @{u}), MBankStatement.beforeSave (:258-275), prepareIt (:322-364), completeIt (:395-460).
// stmt = { c_bankstatement_id, c_bankaccount_id, dateacct, beginningbalance (decimal; 0/absent ⇒ the bank account's current balance) }; lines [{ c_bankstatementline_id, line, isactive, dateacct, stmtamt, trxamt, interestamt, c_charge_id, c_payment_id }]
// ctx = { periodOpen:{ok} (DocBaseType CMB), postWithDateFromLine: bool (sysconfig BANK_STATEMENT_POST_WITH_DATE_FROM_LINE, default false), samePeriod(lineDate, headerDate) → bool,
//         bankBalance (minor units, the account's CurrentBalance), paymentOf(id) → { isreconciled } }. Amounts in minor units out.
function completeBankStatement(stmt, lines, ctx) {
  ctx = ctx || {};
  var m = function (v) { var d = _dec(v == null ? '0' : v); return Number(_rhu(d.n * 100n, 10n ** BigInt(d.k))); };
  var out = [];
  for (var i = 0; i < (lines || []).length; i++) {                                                               // line beforeSave (at save time, before any doc-action)
    var l = lines[i], stmtAmt = m(l.stmtamt), trx = m(l.trxamt), intr = m(l.interestamt), chg = stmtAmt - trx - intr;
    if (ctx.postWithDateFromLine && ctx.samePeriod && !ctx.samePeriod(l.dateacct || stmt.dateacct, stmt.dateacct)) return { ok: false, reason: 'BankStatementLinePeriodNotSameAsHeader' };
    if (chg !== 0 && !Number(l.c_charge_id)) return { ok: false, reason: 'FillMandatory C_Charge_ID' };
    out.push({ c_bankstatementline_id: l.c_bankstatementline_id, isactive: l.isactive || 'Y', stmtamt: stmtAmt, trxamt: trx, interestamt: intr, chargeamt: chg, c_charge_id: l.c_charge_id || null,
      c_payment_id: trx === 0 ? null : (l.c_payment_id || null) });
  }
  var begin = stmt.beginningbalance != null && m(stmt.beginningbalance) !== 0 ? m(stmt.beginningbalance) : Number(ctx.bankBalance || 0);   // header beforeSave :264-269
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };                         // prepareIt :330 MPeriod.testPeriodOpen
  if (!out.length) return { ok: false, reason: 'NoLines' };                                                        // :332-336
  var diff = 0; out.forEach(function (x) { if (x.isactive !== 'N') diff += x.stmtamt; });                       // :338-352
  var ops = [];
  for (var j = 0; j < out.length; j++) {                                                                          // completeIt :415-430
    var pid = out[j].c_payment_id; if (!pid) continue;
    var p = ctx.paymentOf ? ctx.paymentOf(pid) : null;
    if (p && p.isreconciled === 'Y') return { ok: false, reason: 'PaymentIsAlreadyReconciled' };
    ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Payment', id: pid, field: 'isreconciled', value: 'Y' });
  }
  ops.push({ op_type: 'UPDATE_FIELD', table: 'C_BankAccount', id: stmt.c_bankaccount_id, field: 'currentbalance', delta: diff });   // :445-449
  ops.push({ op_type: 'SET_STATUS', table: 'C_BankStatement', id: stmt.c_bankstatement_id, doc_status: 'CO' });
  return { ok: true, lines: out, beginningBalance: begin, statementDifference: diff, endingBalance: begin + diff, ops: ops };
}

// completeProjectIssue — Project Issue (spec §71, F35): MProjectIssue.doComplete (MProjectIssue.java:181-289 @{u}) + updateBalanceAmt (:555-590). No C_DocType_ID ⇒ no period test (DocActionDelegate.prepareIt).
// issue = { c_projectissue_id, c_project_id, m_product_id, m_locator_id, movementqty }; ctx = { productOf(id) → { isstocked }, disallowNegative (the locator warehouse's IsDisallowNegativeInv), onHand (locator qty),
//         cost → MCost.getCost (qty × current cost, HALF_UP at the costing precision, decimal string; null when no cost) }
function completeProjectIssue(issue, ctx) {
  ctx = ctx || {};
  if (!Number(issue.m_product_id)) return { ok: false, reason: 'No Product' };                                       // :184-188
  var prod = ctx.productOf ? ctx.productOf(issue.m_product_id) : null, ops = [], qty = Number(issue.movementqty || 0);
  if (prod && prod.isstocked !== 'N') {                                                                            // :200-283 stocked: W+ transaction, storage −qty at the locator
    if (ctx.disallowNegative && Number(ctx.onHand || 0) - qty < 0) return { ok: false, reason: 'NegativeInventoryDisallowed' };
    ops.push({ op_type: 'STOCK', table: 'M_Transaction', movementtype: 'W+', m_locator_id: issue.m_locator_id, m_product_id: issue.m_product_id, qty: -qty });
  }
  if (ctx.cost != null) ops.push({ op_type: 'UPDATE_FIELD', table: 'C_Project', id: issue.c_project_id, field: 'projectbalanceamt', delta: String(ctx.cost) });   // updateBalanceAmt
  ops.push({ op_type: 'SET_STATUS', table: 'C_ProjectIssue', id: issue.c_projectissue_id, doc_status: 'CO' });
  return { ok: true, ops: ops };
}

// completeDDOrder — Distribution Order (spec §72, F36): MDDOrder.prepareIt (org.eevolution MDDOrder.java:786-849 @{u}) + reserveStock (:857-929) + completeIt (:963-1010). No books, no stock quantity change.
// order = { dd_order_id, deliveryrule }; lines [{ dd_orderline_id, line, m_product_id, qtyordered, qtyreserved, qtydelivered, m_attributesetinstance_id }]
// ctx = { periodOpen:{ok} (DateOrdered, DOO), productOf(id) → { isexcludeautodelivery, asimandatory (attribute set MandatoryType 'Y'), volume, weight }, postingRefusal (text or null) }
function completeDDOrder(order, lines, ctx) {
  ctx = ctx || {};
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: '@PeriodClosed@' };                       // :795-799
  if (!lines || !lines.length) return { ok: false, reason: '@NoLines@' };                                          // :802-807
  var prod = function (id) { return (ctx.productOf && id ? ctx.productOf(id) : null) || {}; };
  if (order.deliveryrule === 'O') for (var i = 0; i < lines.length; i++) if (prod(lines[i].m_product_id).isexcludeautodelivery === 'Y') return { ok: false, reason: '@M_Product_ID@ @IsExcludeAutoDelivery@' };   // :810-822
  var noAsi = lines.filter(function (l) { return prod(l.m_product_id).asimandatory && !Number(l.m_attributesetinstance_id); }).length;
  if (noAsi) return { ok: false, reason: '@LinesWithoutProductAttribute@ (' + noAsi + ')' };                         // :826-839
  var vol = 0, wt = 0, out = [];
  lines.forEach(function (l) {                                                                                     // reserveStock :864-920
    var q = Number(l.qtyordered || 0), res = Number(l.qtyreserved || 0), del = Number(l.qtydelivered || 0), p = prod(l.m_product_id);
    var add = q - res - del;
    out.push({ dd_orderline_id: l.dd_orderline_id, m_product_id: l.m_product_id, qtyordered: q, qtyreserved: res + (l.m_product_id ? add : 0), qtydelivered: del });
    if (l.m_product_id) { vol += Number(p.volume || 0) * q; wt += Number(p.weight || 0) * q; }
  });
  if (ctx.postingRefusal) return { ok: false, reason: ctx.postingRefusal };                                       // DocumentEngine postIt after complete (I): no Doc_DDOrder class ⇒ the completion fails (doc_poster.immediatePostingRefusal)
  return { ok: true, lines: out, volume: vol, weight: wt, ops: [{ op_type: 'SET_STATUS', table: 'DD_Order', id: order.dd_order_id, doc_status: 'CO' }] };
}

// ── BP OPEN ITEM (prompts/SQLiteIDEMPIERE.md §64.2, F21) — Witness: M3 cycle O2C key bp_delta ─────────────────────────────────────────
// bpOpenBalance — MBPartner.setTotalOpenBalance (MBPartner.java:711-757) over the documents the host holds for ONE business partner, amounts in minor units of the base currency
// (currencyBase is the host's: pass toBase(amount, doc) when a document is not in the base currency; absent ⇒ amounts are taken as base).
//   SO_CreditUsed   = Σ invoiceOpen(i)               over IsSOTrx='Y', IsPaid='N', DocStatus CO/CL
//   TotalOpenBalance = Σ invoiceOpen(i) × MultiplierAP over IsPaid='N', DocStatus CO/CL  −  Σ paymentAvailable(p) over IsAllocated='N', no charge, DocStatus CO/CL
// invoiceOpen (DB function invoiceopen): C_Invoice_v.GrandTotal (credit memo ⇒ negated: 3rd DocBaseType letter 'C') − Σ ACTIVE allocation lines (Amount+Discount+WriteOff) × MultiplierAP
// (AP ⇒ −1: 2nd letter 'P'); paymentAvailable (DB function paymentavailable): 0 with a charge, else C_Payment_v.PayAmt (payment ⇒ negated) − Σ ACTIVE allocation line Amount.
//   st = { invoices:[{c_invoice_id, issotrx, docbasetype, docstatus, ispaid, grandtotal}], payments:[{c_payment_id, isreceipt, payamt, isallocated, docstatus, c_charge_id}],
//          allocations:[{isactive, lines:[{c_invoice_id, c_payment_id, amount, discountamt, writeoffamt}]}] }
function bpOpenBalance(st, opts) {
  opts = opts || {}; var toBase = opts.toBase || function (a) { return a; };
  var live = { CO: 1, CL: 1 }, lines = [];
  (st.allocations || []).forEach(function (h) { if (h.isactive === 'N') return; (h.lines || []).forEach(function (l) { lines.push(l); }); });
  var dbt = function (i) { return i.docbasetype || (String(i.issotrx) === 'N' ? 'API' : 'ARI'); };
  var credit = 0, open = 0;
  (st.invoices || []).forEach(function (i) {
    if (!live[i.docstatus] || String(i.ispaid) === 'Y') return;
    var t = dbt(i), cm = t.charAt(2) === 'C' ? -1 : 1, ap = t.charAt(1) === 'P' ? -1 : 1;
    var paid = 0; lines.forEach(function (l) { if (Number(l.c_invoice_id) === Number(i.c_invoice_id)) paid += (Number(l.amount || 0) + Number(l.discountamt || 0) + Number(l.writeoffamt || 0)) * ap; });
    var o = toBase(Number(i.grandtotal) * cm - paid, i);
    if (String(i.issotrx) === 'Y') credit += o;
    open += o * ap;
  });
  (st.payments || []).forEach(function (p) {
    if (!live[p.docstatus] || String(p.isallocated) === 'Y' || Number(p.c_charge_id || 0) > 0) return;
    var av = Number(p.payamt) * (String(p.isreceipt) === 'N' ? -1 : 1);
    lines.forEach(function (l) { if (Number(l.c_payment_id) === Number(p.c_payment_id)) av -= Number(l.amount || 0); });
    open -= toBase(av, p);
  });
  return { open: open, credit: credit };
}

// ── FIXED ASSETS (prompts/SQLiteIDEMPIERE.md §63, F19) — Witness: scripts/bridge/witness_fa_gap.js (FA1, FA0, FA-REJ*, NEG) ──────────────────
// Pure ports of the legacy asset lifecycle. Amounts are integers in MINOR units (cents, precision 2 — MDepreciation.m_precision=2, MDepreciation.java:103);
// dates are 'YYYY-MM-DD' strings. The host supplies the rows and persists what comes back (no DB binding here).
function _faMonthEnd(date, addMonths) {   // TimeUtil.getMonthLastDay(TimeUtil.addMonths(date, n)) — the day never matters after the month end
  var d = String(date).slice(0, 10), y = +d.slice(0, 4), m = +d.slice(5, 7) + (addMonths || 0);
  y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + '-' + (m < 10 ? '0' : '') + m + '-' + new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function _faMonth(date) { return String(date).slice(0, 7); }
function _faDiv(numMinor, periods) {      // BigDecimal.divide(periods, 2, HALF_UP) on a minor-unit amount
  var n = BigInt(numMinor), d = BigInt(periods); if (d < 0n) { n = -n; d = -d; } return Number(_rhu(n, d));
}
// MDepreciation.invoke (MDepreciation.java:222-279) for the types ported here; anything else is refused by NAME (never guessed).
// SL = apply_SL (:330-341): (cost − salvage − accum) / (life − (period − 1)), 0 when no remaining periods. ARH_ZERO = apply_ARH_ZERO (:316-320) = 0.
var _FA_TYPES = { SL: true, ARH_ZERO: true };
function _faInvoke(type, life, period, costMinor, accumMinor) {
  if (type === 'ARH_ZERO') return 0;
  var rp = life - (period - 1);
  return rp !== 0 ? _faDiv(costMinor - accumMinor, rp) : 0;
}
function _faRequireLast(type) { return type !== 'ARH_ZERO'; }   // MDepreciation.requireLastPeriodAdjustment (:196-199)

// faRegisterAsset — MAsset.afterSave new record (MAsset.java:426-456). group = A_Asset_Group row, groupAccts = ALL its A_Asset_Group_Acct rows
// (MAssetGroupAcct.forA_Asset_Group_ID :78-90, no active filter). Per row with org 0 or the asset org: an A_Asset_Acct copy (MAssetAcct(asset, grpacct)
// MAssetAcct.java:194-211: all group values, A_Period_Start 1, A_Period_End = asset UseLifeMonths) and a workfile whose use life is the GROUP's
// (:446-449 overwrite the asset's own life), A_Life_Period = UseLifeMonths (MDepreciationWorkfile.beforeSave :146-151), cost/accum/period 0.
function faRegisterAsset(asset, group, groupAccts) {
  if (!group) return { ok: false, reason: 'unknown-asset-group' };
  var a = {}; for (var k in asset) a[k] = asset[k];
  a.a_asset_status = 'NW'; a.isdepreciated = group.isdepreciated; a.isowned = group.isowned;   // :430-436
  var accts = [], workfiles = [];
  (groupAccts || []).forEach(function (g) {
    if (!(Number(g.ad_org_id) === 0 || Number(g.ad_org_id) === Number(asset.ad_org_id))) return;
    var acct = {}; for (var c in g) acct[c] = g[c];
    acct.a_asset_id = asset.a_asset_id; acct.ad_org_id = asset.ad_org_id; acct.a_period_start = 1; acct.a_period_end = Number(asset.uselifemonths || 0);
    accts.push(acct);
    workfiles.push({ a_asset_id: asset.a_asset_id, ad_org_id: asset.ad_org_id, c_acctschema_id: g.c_acctschema_id, postingtype: g.postingtype || 'A', isdepreciated: group.isdepreciated,
      a_asset_cost: 0, a_qty_current: 0, a_accumulated_depr: 0, a_accumulated_depr_f: 0, a_salvage_value: 0, a_current_period: 0, dateacct: null, assetdepreciationdate: null,
      uselifemonths: Number(g.uselifemonths || 0), uselifemonths_f: Number(g.uselifemonths_f || 0), a_life_period: Number(g.uselifemonths || 0), a_life_period_f: Number(g.uselifemonths_f || 0),
      a_asset_remaining: 0, a_asset_remaining_f: 0, processed: 'N' });
  });
  return { ok: true, asset: a, accts: accts, workfiles: workfiles };
}

// faBuildDepreciation — MDepreciationWorkfile.buildDepreciation (MDepreciationWorkfile.java:649-785) with NO IDepreciationMethod factory (none ships in
// core: Core.getDepreciationMethod returns null, Core.java:811-838). The host deletes the workfile's UNPROCESSED rows with A_Period >= current first
// (truncDepreciation :791-808). acct = the asset acct of the workfile's schema; typeOf(a_depreciation_id) → DepreciationType.
function faBuildDepreciation(wk, acct, typeOf) {
  if (String(wk.isdepreciated) !== 'Y') return { ok: true, rows: [] };
  var tC = typeOf(acct.a_depreciation_id), tF = typeOf(acct.a_depreciation_f_id);
  if (!_FA_TYPES[tC] || !_FA_TYPES[tF]) return { ok: false, reason: 'depreciation-type-not-ported:' + (!_FA_TYPES[tC] ? tC : tF) };
  var cost = Number(wk.a_asset_cost) - Number(wk.a_salvage_value || 0);   // getActualCost
  var accC = Number(wk.a_accumulated_depr || 0), accF = Number(wk.a_accumulated_depr_f || 0);
  var lifeC = Number(wk.uselifemonths || 0), lifeF = Number(wk.uselifemonths_f || 0), life = lifeC > lifeF ? lifeC : lifeF;
  var cur = Number(wk.a_current_period || 0), start = wk.dateacct, dd = wk.assetdepreciationdate;
  if (dd && String(dd).slice(0, 10) >= String(wk.dateacct).slice(0, 10)) {   // :706-717
    if (_faMonthEnd(start) === String(dd).slice(0, 10)) { start = _faMonthEnd(dd, 1); ++cur; } else start = dd;
  }
  var rows = [];
  for (var p = cur; p <= life; p++) {
    var eC = 0, eF = 0;
    if (lifeC > p || !_faRequireLast(tC)) { eC = _faInvoke(tC, lifeC, p, cost, accC); accC += eC; }
    else if (lifeC === p) { eC = cost - accC; accC = cost; }
    if (lifeF > p || !_faRequireLast(tF)) { eF = _faInvoke(tF, lifeF, p, cost, accF); accF += eF; }
    else if (lifeF === p) { eF = cost - accF; accF = cost; }
    rows.push({ a_asset_id: wk.a_asset_id, ad_org_id: wk.ad_org_id, c_acctschema_id: wk.c_acctschema_id, postingtype: wk.postingtype, a_entry_type: 'DEP',
      a_period: p, dateacct: _faMonthEnd(start, p - cur), expense: eC, expense_f: eF, a_accumulated_depr: accC, a_accumulated_depr_f: accF,
      a_accumulated_depr_delta: eC, a_accumulated_depr_f_delta: eF,   // MDepreciationExp.createDepreciation :167-200
      dr_account_id: acct.a_depreciation_acct, cr_account_id: acct.a_accumdepreciation_acct,
      a_asset_cost: Number(wk.a_asset_cost), uselifemonths: lifeC, uselifemonths_f: lifeF, a_asset_remaining: Number(wk.a_asset_remaining), a_asset_remaining_f: Number(wk.a_asset_remaining_f),
      processed: 'N', a_depreciation_entry_id: null });
  }
  return { ok: true, rows: rows };
}

// faCompleteAddition — MAssetAddition.beforeSave/prepareIt/completeIt (MAssetAddition.java:112-138, 559-640, 659-800) for a non-imported addition.
// ctx = { periodOpen:{ok}, baseAmount (AssetValueAmt = AssetSourceAmt in the client base currency, minor units), priorCreateAdditions (count, :1199-1230),
//         amountFor(schema) → AssetSourceAmt converted to the schema currency at DateAcct (minor units; MConversionRate.convert HALF_UP at std precision),
//         acctOf(schema) → asset acct row, typeOf(id) → DepreciationType, unprocessedBefore(assetId, date, postingType) → bool (MDepreciationExp :312-327) }
function faCompleteAddition(add, asset, workfiles, ctx) {
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'period-closed' };                         // :570 MPeriod.testPeriodOpen (GL Journal)
  if (Number(ctx.baseAmount) === 0) return { ok: false, reason: 'Invalid AssetValueAmt=0' };                    // :573-577
  var createAsset = add.a_sourcetype === 'IMP' || !(ctx.priorCreateAdditions > 0);                             // setA_CreateAsset
  if (createAsset && Number(ctx.baseAmount) <= 0) return { ok: false, reason: 'New document has nulls' };        // :582-585 hasZeroValues
  if (createAsset && asset.a_asset_status !== 'NW' && add.a_sourcetype !== 'IMP') return { ok: false, reason: 'Only new assets can be activated' };   // :588-592
  var qty = Number(add.a_qty_current || 0); if (createAsset && qty === 0) qty = 1;                               // beforeSave :115-118
  var capex = createAsset ? 'Cap' : (add.a_capvsexp || 'Cap');                                                   // beforeSave :128-131
  var a = {}; for (var k in asset) a[k] = asset[k];
  if (createAsset) a.assetservicedate = String(add.datedoc).slice(0, 10);                                        // :699-702
  a.a_asset_status = 'AC'; a.assetactivationdate = String(add.dateacct).slice(0, 10);                            // changeStatus MAsset.java:541-544
  var outWk = [], schedules = {};
  for (var i = 0; i < workfiles.length; i++) {
    var w = {}; for (var c in workfiles[i]) w[c] = workfiles[i][c];
    w.dateacct = _faMonthEnd(add.dateacct);                                                                     // :728/:766 + workfile beforeSave month end :163-166
    var amt = ctx.amountFor(w.c_acctschema_id); if (amt == null) return { ok: false, reason: 'no-conversion-rate' };
    w.a_asset_cost = (createAsset ? 0 : Number(w.a_asset_cost)) + amt; w.a_qty_current = (createAsset ? 0 : Number(w.a_qty_current)) + qty;   // adjustCost :439-455
    if (capex === 'Cap') {
      if (ctx.unprocessedBefore && ctx.unprocessedBefore(a.a_asset_id, add.dateacct, w.postingtype)) return { ok: false, reason: 'There are unprocessed records to date' };
      if (Number(add.a_salvage_value || 0) > 0) w.a_salvage_value = ctx.salvageFor ? ctx.salvageFor(w.c_acctschema_id) : Number(add.a_salvage_value);
      w.processed = 'Y';
    }
    if (createAsset && Number(w.a_current_period) === 0) w.a_current_period = 1;                                 // :770-777
    w.a_asset_remaining = w.a_asset_cost - Number(w.a_accumulated_depr); w.a_asset_remaining_f = w.a_asset_cost - Number(w.a_accumulated_depr_f);   // workfile beforeSave :168-172
    var b = faBuildDepreciation(w, ctx.acctOf(w.c_acctschema_id), ctx.typeOf);
    if (!b.ok) return b;
    schedules[w.c_acctschema_id] = b.rows; outWk.push(w);
  }
  return { ok: true, asset: a, workfiles: outWk, schedules: schedules, createAsset: createAsset, a_capvsexp: capex };
}

// _faSetCurrentPeriod — MDepreciationWorkfile.setA_Current_Period (:615-641): the latest PROCESSED active row of the workfile (asset, posting type,
// schema) by A_Period DESC, DateAcct DESC ⇒ period = its A_Period + 1, DateAcct = month end of its DateAcct + 1 month; none ⇒ unchanged.
function _faSetCurrentPeriod(w, rows) {
  var last = null;
  rows.forEach(function (r) {
    if (Number(r.a_asset_id) !== Number(w.a_asset_id) || r.postingtype !== w.postingtype || Number(r.c_acctschema_id) !== Number(w.c_acctschema_id) || r.processed !== 'Y' || r.isactive === 'N') return;
    if (!last || r.a_period > last.a_period || (r.a_period === last.a_period && String(r.dateacct) > String(last.dateacct))) last = r;
  });
  if (last) { w.a_current_period = Number(last.a_period) + 1; w.dateacct = _faMonthEnd(last.dateacct, 1); }
}
// faCompleteDepreciationEntry — MDepreciationEntry.afterSave selectLines (MDepreciationEntry.java:174-190): unassigned rows of the entry's MONTH, client,
// org and schema; prepareIt :251-275 period open for its doc type; completeIt :291-340: each unprocessed selected row (ORDER BY asset, posting type, period,
// entry type) must lie in the entry's period, then MDepreciationExp.process (MDepreciationExp.java:205-253): no unprocessed EARLIER-month row of the asset
// (any schema, :312-327), asset Activated, workfile accum += Expense / Expense_F, current period + DateAcct (twice, before and after the row is processed),
// row DateAcct = the workfile's, row refreshed from the workfile (updateFrom :143-152). Any row error ⇒ the whole document fails (AssetArrayException).
// rows = every exp row the host holds for the client; workfiles = those of the involved assets; assetStatus(id) → status.
function faCompleteDepreciationEntry(entry, rows, workfiles, assetStatus, ctx) {
  ctx = ctx || {};
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'period-closed' };
  var R = rows.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; });
  var W = workfiles.map(function (w) { var o = {}; for (var k in w) o[k] = w[k]; return o; });
  var sel = R.filter(function (r) { return r.a_depreciation_entry_id == null && _faMonth(r.dateacct) === _faMonth(entry.dateacct) && Number(r.ad_client_id || entry.ad_client_id) === Number(entry.ad_client_id)
    && Number(r.ad_org_id) === Number(entry.ad_org_id) && Number(r.c_acctschema_id) === Number(entry.c_acctschema_id); });
  sel.forEach(function (r) { r.a_depreciation_entry_id = entry.a_depreciation_entry_id; });
  var todo = sel.filter(function (r) { return r.processed !== 'Y'; }).sort(function (x, y) {
    return (x.a_asset_id - y.a_asset_id) || String(x.postingtype).localeCompare(String(y.postingtype)) || (x.a_period - y.a_period) || String(x.a_entry_type).localeCompare(String(y.a_entry_type)); });
  var errors = [];
  todo.forEach(function (r) {
    var d = String(r.dateacct).slice(0, 10);
    if (ctx.periodStart && (d < String(ctx.periodStart).slice(0, 10) || d > String(ctx.periodEnd).slice(0, 10))) { errors.push('The date is not within this Period'); return; }
    var w = W.filter(function (x) { return Number(x.a_asset_id) === Number(r.a_asset_id) && x.postingtype === r.postingtype && Number(x.c_acctschema_id) === Number(r.c_acctschema_id); })[0];
    if (!w) { errors.push('@NotFound@ @A_Depreciation_Workfile_ID@'); return; }
    if (r.a_entry_type === 'DEP') {
      var early = R.some(function (o) { return Number(o.a_asset_id) === Number(r.a_asset_id) && o.postingtype === r.postingtype && o.processed !== 'Y' && _faMonth(o.dateacct) < _faMonth(r.dateacct); });
      if (early) { errors.push('There are unprocessed records to date'); return; }
      if (assetStatus(r.a_asset_id) !== 'AC') { errors.push('AssetNotActive ' + r.a_asset_id); return; }
      w.a_accumulated_depr = Number(w.a_accumulated_depr) + Number(r.expense); w.a_accumulated_depr_f = Number(w.a_accumulated_depr_f) + Number(r.expense_f);
      _faSetCurrentPeriod(w, R);
      w.a_asset_remaining = Number(w.a_asset_cost) - w.a_accumulated_depr; w.a_asset_remaining_f = Number(w.a_asset_cost) - w.a_accumulated_depr_f;   // workfile beforeSave :168-172 (cost, not actual cost)
      r.dateacct = w.dateacct;
    }
    r.processed = 'Y';
    r.a_asset_cost = Number(w.a_asset_cost); r.a_accumulated_depr = w.a_accumulated_depr; r.a_accumulated_depr_f = w.a_accumulated_depr_f;
    r.uselifemonths = Number(w.uselifemonths); r.uselifemonths_f = Number(w.uselifemonths_f); r.a_asset_remaining = w.a_asset_remaining; r.a_asset_remaining_f = w.a_asset_remaining_f;
    _faSetCurrentPeriod(w, R);
  });
  if (errors.length) return { ok: false, reason: errors.join('; ') };
  return { ok: true, docstatus: 'CO', rows: R, workfiles: W, selected: sel.length };
}

// faCompleteDisposal — Asset Disposal (spec §74, F37): MAssetDisposed.beforeSave / prepareIt / updateFromAsset / completeIt / createDisposal (MAssetDisposed.java:181-305, 383-430, 477-521 @{u}).
// disp = { a_asset_disposed_id, a_asset_id, dateacct, a_disposed_method, postingtype }; asset = { a_asset_status, isdisposed }; workfiles = the asset's workfiles (minor units); rows = the asset's expense rows
// ctx = { periodOpen:{ok} (GLD), primarySchema, primaryCurrency, currencyOf(schema) }. → asset status, disposal amounts, change rows per schema, workfiles after, ids of the expense rows deleted.
function faCompleteDisposal(disp, asset, workfiles, rows, ctx) {
  ctx = ctx || {};
  var pt = disp.postingtype || 'A';
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };                                                    // prepareIt :189
  var prim = workfiles.filter(function (w) { return Number(w.c_acctschema_id) === Number(ctx.primarySchema) && (w.postingtype || 'A') === pt; })[0];   // updateFromAsset :413-428
  var cost = prim ? Number(prim.a_asset_cost) : 0, accum = prim ? Number(prim.a_accumulated_depr) : 0;
  if (prim && prim.dateacct && String(disp.dateacct).slice(0, 10) <= _faMonthEnd(prim.dateacct, -1)) return { ok: false, reason: 'AssetAlreadyDepreciatedException' };   // isDepreciated :385-402
  var m0 = _faMonth(disp.dateacct);
  if ((rows || []).some(function (r) { return Number(r.a_asset_id) === Number(disp.a_asset_id) && (r.postingtype || 'A') === pt && r.processed !== 'Y' && _faMonth(r.dateacct) < m0; }))
    return { ok: false, reason: 'There are unprocessed records to date' };                                                                  // checkExistsNotProcessedEntries :312-327
  if (asset.isdisposed === 'Y') return { ok: false, reason: 'asset re-activation not ported' };                                              // isDisposal() false ⇒ A_Activation_Method branch
  var method = disp.a_disposed_method, a = {}; for (var k in asset) a[k] = asset[k];
  if (method === 'PR') { a.a_asset_status = 'PR'; return { ok: true, docstatus: 'CO', asset: a, disposalAmt: 0, accumDelta: 0, expense: 0, changes: [], workfiles: workfiles, deleteExp: [] }; }
  if (method !== 'S' && method !== 'T1') return { ok: false, reason: 'AssetNotSupportedException A_Disposed_Method=' + method + ' (PD not ported)' };
  a.a_asset_status = 'DI';
  var disposalAmt = cost, delta = accum, expense = cost - accum, changes = [], W = [];
  workfiles.forEach(function (w0) {                                                                                                       // createDisposal :479-513
    var w = {}; for (var c in w0) w[c] = w0[c];
    var other = Number(ctx.currencyOf(w.c_acctschema_id)) !== Number(ctx.primaryCurrency);
    var dAmt = other ? Number(w.a_asset_cost) : disposalAmt, acc = other ? Number(w.a_accumulated_depr) : delta;
    changes.push({ c_acctschema_id: w.c_acctschema_id, postingtype: w.postingtype, changetype: 'DIS', assetvalueamt: dAmt, assetbookvalueamt: Number(w.a_asset_remaining), assetaccumdepreciationamt: acc, isdisposed: 'Y', assetdisposaldate: String(disp.dateacct).slice(0, 10) });
    w.a_asset_cost = Number(w.a_asset_cost) - dAmt; w.a_accumulated_depr = Number(w.a_accumulated_depr) - acc; w.a_accumulated_depr_f = Number(w.a_accumulated_depr_f) - acc;   // adjustCost / adjustAccumulatedDepr
    w.a_asset_remaining = w.a_asset_cost - w.a_accumulated_depr; w.a_asset_remaining_f = w.a_asset_cost - w.a_accumulated_depr_f;            // workfile beforeSave :168-172
    W.push(w);
  });
  var del = (rows || []).filter(function (r) { return Number(r.a_asset_id) === Number(disp.a_asset_id) && (r.postingtype || 'A') === pt && r.processed !== 'Y'; }).map(function (r) { return r.a_depreciation_exp_id; });   // :515-520
  return { ok: true, docstatus: 'CO', asset: a, disposalAmt: disposalAmt, accumDelta: delta, expense: expense, changes: changes, workfiles: W, deleteExp: del };
}

// faCompleteReval — Asset Revaluation (spec §75, F38): MAssetReval.prepareIt / isLastDepreciated / completeIt (MAssetReval.java @{u}). wk = the PRIMARY workfile (minor units); amounts in minor units.
// reval = { a_asset_reval_id, dateacct, a_asset_cost, a_accumulated_depr, a_asset_cost_change, a_change_acumulated_depr }; ctx = { periodOpen:{ok} (GLJ) }
function faCompleteReval(reval, wk, ctx) {
  ctx = ctx || {};
  if (ctx.periodOpen && !ctx.periodOpen.ok) return { ok: false, reason: 'PeriodClosed' };
  if (!wk) return { ok: false, reason: '@NotFound@ @A_Asset_ID@' };
  var last = wk.dateacct ? _faMonthEnd(wk.dateacct, -1) : null, d = String(reval.dateacct).slice(0, 10);
  if (!last || d > last) return { ok: false, reason: 'Asset is not depreciated at this moment' };                       // isDepreciated
  var cEq = Number(wk.a_asset_cost) === Number(reval.a_asset_cost_change), aEq = Number(wk.a_accumulated_depr) === Number(reval.a_change_acumulated_depr);
  if (cEq && aEq) return { ok: false, reason: 'Nothing has changed' };
  if (cEq && !aEq) return { ok: false, reason: 'It has changed the cost of Asset' };
  if (!cEq && aEq) return { ok: false, reason: 'It has changed the cumulative depreciation' };
  if (_faMonthEnd(d) !== last) return { ok: false, reason: 'It can only review the last month processed' };            // isLastDepreciated
  var w = {}; for (var k in wk) w[k] = wk[k];
  w.a_asset_cost = Number(reval.a_asset_cost_change); w.a_accumulated_depr = Number(reval.a_change_acumulated_depr);
  w.a_asset_remaining = w.a_asset_cost - w.a_accumulated_depr; w.a_asset_remaining_f = w.a_asset_cost - Number(w.a_accumulated_depr_f);   // workfile beforeSave :168-172
  return { ok: true, docstatus: 'CO', workfile: w, revaldate: d };
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

return {
  completeCash: completeCash, completeJournal: completeJournal, completeBankStatement: completeBankStatement, completeProjectIssue: completeProjectIssue, completeDDOrder: completeDDOrder, prepareRequisition: prepareRequisition, matchFromInvoice: matchFromInvoice, completeInOut: completeInOut, reverseInOut: reverseInOut, reverseInvoice: reverseInvoice, bpOpenBalance: bpOpenBalance, orderReserve: orderReserve, inoutOrderLineEffects: inoutOrderLineEffects, invoiceOrderLineEffects: invoiceOrderLineEffects,
  faRegisterAsset: faRegisterAsset, faCompleteAddition: faCompleteAddition, faBuildDepreciation: faBuildDepreciation, faCompleteDepreciationEntry: faCompleteDepreciationEntry, faCompleteDisposal: faCompleteDisposal, faCompleteReval: faCompleteReval, faMonthEnd: _faMonthEnd,
  resolveCtx: resolveCtx, dialectShim: dialectShim, evalGuard: evalGuard, voidOrder: voidOrder, completeMovement: completeMovement, completePayment: completePayment, prepareInvoice: prepareInvoice, completeInventory: completeInventory, creditCheckOrder: creditCheckOrder, priceAt: priceAt, periodOpen: periodOpen, acctSetupGap: acctSetupGap, calcTax: calcTax, taxLookup: taxLookup, orderTaxes: orderTaxes,
  match: match, buildDoc: buildDoc, DOC_SPECS: DOC_SPECS, explodeBOM: explodeBOM,
  movementSign: movementSign, qtyOnHand: qtyOnHand, reversePosting: reversePosting,
  VERBS: VERBS, completeOrder: completeOrder, completeInvoice: completeInvoice, completeReceipt: completeReceipt,
  movementTypeOf: movementTypeOf, stockMoves: stockMoves
};
});
