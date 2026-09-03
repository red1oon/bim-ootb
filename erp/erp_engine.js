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
  resolveCtx: resolveCtx, dialectShim: dialectShim, evalGuard: evalGuard,
  match: match, buildDoc: buildDoc, DOC_SPECS: DOC_SPECS, explodeBOM: explodeBOM,
  movementSign: movementSign, qtyOnHand: qtyOnHand, reversePosting: reversePosting,
  VERBS: VERBS, completeOrder: completeOrder, completeInvoice: completeInvoice, completeReceipt: completeReceipt,
  movementTypeOf: movementTypeOf, stockMoves: stockMoves
};
});
