// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * pos_core.js — the POS addon's fold glue (docs/POS_ADDON_SPEC.md §P-1..§P-4).
 *
 * Implementing POS_ADDON_SPEC.md §1 "four registries and zero engines" — this module is the
 * ENGINE-SIDE of the addon: it composes the EXISTING erp_engine verbs (buildDoc / completeOrder /
 * completeInvoice / explodeBOM / qtyOnHand / movementSign) into the 2012 Unicenta loop. It adds
 * NO verb (newVerbs=[] is the witnessed gate, prompts/POS_LENS_SESSION.md §engine-hardening).
 *
 * Separation contract (same as erp_engine.js): PURE. No DB import, no Date.now/Math.random/DOM.
 * The host injects a ctx of DATA + resolvers:
 *   ctx = {
 *     pos        : the c_pos row (station)            — c_doctype_id, m_warehouse_id, m_pricelist_id,
 *                                                       c_bpartnercashtrx_id, c_poskeylayout_id
 *     priceOf(pid)  -> {pricestd} | null              — the SEALED master price (m_productprice row of
 *                                                       the station pricelist version) — POSLens "you
 *                                                       key the master, never the sale"
 *     bomOf(pid)    -> [{comp_id, qtybom}]            — pp_product_bom(line) resolver (explodeBOM's)
 *     wrPolicy      -> {isautogenerateinout,isautogenerateinvoice}
 *                      derived from C_DocType.docsubtypeso='WR' (the dictionary, NOT POS code —
 *                      POS_ADDON_SPEC §P-2 "the WR semantics come from the dictionary")
 *   }
 *
 * DUMB TERMINAL rule (POS_LENS_SESSION §guardrails): the LENS calls these and renders the result —
 * every price, total, consumption and PO qty here traces to a master row or a BOM recipe.
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../../scripts/erp_engine'), require('./bigdecimal'));
  } else {
    root.POSCore = factory(root.ERPEngine, root.BigDecimal);
  }
})(typeof window !== 'undefined' ? window : this, function (E, BigDecimal) {

  var HALF_UP = BigDecimal.RoundingMode.HALF_UP;
  function bd(v) { return (v == null || v === '') ? BigDecimal.ZERO : BigDecimal.of(String(v)); }

  // The six verbs this addon is ALLOWED to ride (the W-POS gate list — anything else = fork).
  var ALLOWED_VERBS = ['buildDoc', 'explodeBOM', 'qtyOnHand', 'movementSign', 'completeOrder', 'completeInvoice'];

  // ── §P-1 ring: resolve a product to its SEALED master price; REFUSE when absent ──────────
  // Witness W-POS-RING. §FALSIFIER: a product absent from the price list must refuse —
  // "every ringed line traces to a c_poskey→m_product→m_productprice row" (no invented price).
  function ringLine(ctx, productId, qty) {
    if (!(qty > 0)) return { ok: false, reason: 'bad-qty', m_product_id: productId };
    var p = ctx.priceOf(productId);
    if (!p || p.pricestd == null) return { ok: false, reason: 'no-price', m_product_id: productId };
    var price = bd(p.pricestd).setScale(2, HALF_UP);
    return {
      ok: true, m_product_id: productId, qty: qty,
      priceactual: price.toString(),                                       // the sealed master price, verbatim
      linenetamt: price.multiply(bd(qty)).setScale(2, HALF_UP).toString()  // MOrderLine.setLineNetAmt = qty×price
    };
  }

  // display-only cart total (BigDecimal fold of the sealed line amounts — never a posted figure)
  function cartTotal(cart) {
    return cart.reduce(function (s, l) { return s.add(bd(l.linenetamt)); }, BigDecimal.ZERO)
      .setScale(2, HALF_UP).toString();
  }

  // ── §P-2 Complete = ONE signed group (the sacred transaction) ─────────────────────────────
  // Witness W-POS-WR. Composition, not new machinery (POS_ADDON_SPEC §3 "the sequence IS the addon"):
  //   E.buildDoc(order spec)            → CREATE_DOCUMENT C_Order + CREATE_LINE per cart line
  //   E.completeOrder(order, lines, WR) → SET_STATUS CO + createShipment + createInvoice fan-out
  //                                       (policy flags DERIVED from docsubtypeso='WR', see wrPolicy)
  //   E.explodeBOM (§P-3)               → CONSUME leaf components (only when the product is a BOM)
  //   E.completeInvoice / SET_STATUS    → the WR on-the-fly docs complete in the same group
  // opts = { orderId (deterministic, host-supplied), c_bpartner_id, inoutId, invoiceId, warehouseId? }
  function buildSaleGroup(ctx, cart, opts) {
    var bad = cart.filter(function (l) { return !l.ok; });
    if (bad.length) return { ok: false, reason: 'unpriced-line', lines: bad };
    var bp = opts.c_bpartner_id != null ? opts.c_bpartner_id : ctx.pos.c_bpartnercashtrx_id;
    if (bp == null) return { ok: false, reason: 'no-bpartner' };   // seed c_pos.c_bpartnercashtrx_id is NULL — never invent a counterparty
    var wh = opts.warehouseId != null ? opts.warehouseId : ctx.pos.m_warehouse_id;

    var order = { c_order_id: opts.orderId, issotrx: 'Y', c_doctype_id: ctx.pos.c_doctype_id, m_warehouse_id: wh, c_bpartner_id: bp };
    // order lines in the shape EVERY downstream verb consumes (c_orderline_id deterministic per slot)
    var soLines = cart.map(function (l, i) {
      return { c_orderline_id: opts.orderId * 100 + (i + 1) * 10, m_product_id: l.m_product_id, qtyordered: l.qty, priceactual: l.priceactual, linenetamt: l.linenetamt };
    });

    // CREATE the order through the archetype verb (POS_ORDER_SPEC is DATA, like REPLENISH_PO_SPEC)
    var POS_ORDER_SPEC = {
      docTable: 'C_Order', lineTable: 'C_OrderLine', parentId: 'c_pos_id', lineParentId: 'c_orderline_id',
      qtyTo: 'qtyordered', qtyFrom: 'qtyordered',
      header: function () { return { c_order_id: opts.orderId, issotrx: 'Y', c_doctype_id: ctx.pos.c_doctype_id, m_warehouse_id: wh, c_bpartner_id: bp, c_pos_id: ctx.pos.c_pos_id }; }
    };
    var ops = E.buildDoc(POS_ORDER_SPEC, { c_pos_id: ctx.pos.c_pos_id }, soLines);
    // annotate each CREATE_LINE with the sealed master price (annotation of the verb's output, not a verb)
    ops.slice(1).forEach(function (op, i) { op.priceactual = soLines[i].priceactual; op.linenetamt = soLines[i].linenetamt; });

    // COMPLETE via the engine's own decision-table handler; WR policy comes from the dictionary
    var policy = ctx.wrPolicy || { isautogenerateinout: 'Y', isautogenerateinvoice: 'Y' };
    var completeOps = E.completeOrder(order, soLines, policy);
    // stamp the WR children with their deterministic ids + the shipping locator (host-resolved)
    completeOps.forEach(function (op) {
      if (op.op_type === 'CREATE_DOCUMENT' && op.table === 'M_InOut') { op.m_inout_id = opts.inoutId; op.m_warehouse_id = wh; }
      if (op.op_type === 'CREATE_DOCUMENT' && op.table === 'C_Invoice') { op.c_invoice_id = opts.invoiceId; }
    });
    ops = ops.concat(completeOps);

    // §P-3 backflush (AutoBOMOrder reborn): recursive recipe explosion → CONSUME leaves, SAME group.
    // movementtype 'P-' = production issue (the qty-spine polarity the fold lane proved on P±/I±).
    var consumed = {};
    soLines.forEach(function (l) {
      var leaves = E.explodeBOM(ctx.bomOf, l.m_product_id, l.qtyordered);
      if (leaves) Object.keys(leaves).forEach(function (c) { consumed[c] = (consumed[c] || 0) + leaves[c]; });
    });
    Object.keys(consumed).sort(function (a, b) { return a - b; }).forEach(function (c) {
      ops.push({ op_type: 'CONSUME', table: 'M_Transaction', m_product_id: Number(c), movementtype: 'P-', movementqty: consumed[c], m_warehouse_id: wh });
    });

    // the WR on-the-fly children complete in the same group (completeInvoice = the engine's own verb;
    // sales path emits the bare SET_STATUS — M_InOut mirrors it with the same kernel op shape)
    ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: opts.inoutId, doc_status: 'CO' });
    ops = ops.concat(E.completeInvoice({ c_invoice_id: opts.invoiceId, issotrx: 'Y' }, [], {}));

    return { ok: true, ops: ops, order: order, soLines: soLines, consumed: consumed, newVerbs: [], verbsUsed: ALLOWED_VERBS.slice(0, 2).concat(['completeOrder', 'completeInvoice']) };
  }

  // The group's movement events, as qtyOnHand-foldable rows — "the fold over the NEW ledger state"
  // (§P-4). Shipment C- per line + the CONSUME P- rows; both polarities ride movementSign.
  function saleMovements(group) {
    var ev = [];
    group.soLines.forEach(function (l) { ev.push({ m_product_id: l.m_product_id, movementtype: 'C-', movementqty: l.qtyordered }); });
    group.ops.forEach(function (op) { if (op.op_type === 'CONSUME') ev.push({ m_product_id: op.m_product_id, movementtype: op.movementtype, movementqty: op.movementqty }); });
    return ev;
  }

  // ── §P-4 replenishment (the loop closes) — ReplenishReport:294-327, the W-FOLD-REPLENISH port ──
  // rctx = { replenishRows (m_replenish of ONE warehouse), txns (warehouse-scoped ledger events),
  //          reservation(pid, soTrx) -> centi-qty }. saleEvents (optional) = pending group movements.
  // Centi-unit integers throughout (the poc_replenish discipline). Suggest-only: the PO is built
  // by buildReplenishPO on explicit call (POS_ADDON_SPEC §P-4 "suggest by default").
  function ci(n) { return Math.round(Number(n || 0) * 100); }
  function replenishSuggest(rctx, saleEvents) {
    var events = rctx.txns.concat(saleEvents || []);
    var onhand = E.qtyOnHand(events, {
      keyOf: function (t) { return t.m_product_id; },
      typeOf: function (t) { return t.movementtype; },
      absQtyOf: function (t) { return Math.abs(ci(t.movementqty)); }
    });
    var out = [];
    rctx.replenishRows.forEach(function (r) {
      if (r.replenishtype === '0') return;
      var available = (onhand[r.m_product_id] || 0) - rctx.reservation(r.m_product_id, 'Y') + rctx.reservation(r.m_product_id, 'N');
      var max = ci(r.level_max), min = ci(r.level_min), qto = null;
      if (r.replenishtype === '1') qto = (available <= min) ? (max - available) : 0;       // reorder-below-min
      else if (r.replenishtype === '2') qto = (max - available);                            // maintain-max
      if (qto != null && qto >= 100) out.push({ m_product_id: r.m_product_id, m_warehouse_id: r.m_warehouse_id, qtytoorder: qto / 100 });
    });
    return out;
  }
  // PO through the SAME archetype verb + spec poc_replenish proved (newVerbs=[])
  var REPLENISH_PO_SPEC = {
    docTable: 'C_Order', lineTable: 'C_OrderLine', parentId: 'm_warehouse_id', lineParentId: 'm_product_id',
    qtyTo: 'qtyordered', qtyFrom: 'qtytoorder',
    header: function (p) { return { issotrx: 'N', m_warehouse_id: p.m_warehouse_id }; }
  };
  function buildReplenishPO(warehouseId, suggestions) {
    return E.buildDoc(REPLENISH_PO_SPEC, { m_warehouse_id: warehouseId }, suggestions);
  }

  return {
    ringLine: ringLine, cartTotal: cartTotal, buildSaleGroup: buildSaleGroup,
    saleMovements: saleMovements, replenishSuggest: replenishSuggest,
    buildReplenishPO: buildReplenishPO, REPLENISH_PO_SPEC: REPLENISH_PO_SPEC,
    ALLOWED_VERBS: ALLOWED_VERBS
  };
});
