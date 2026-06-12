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
  //
  // The sale = ORDER ops + COMPLETION ops. Both halves are shared verbatim with §P-13 hold/recall
  // (park = the order half alone → DR; recall-complete = the completion half alone on the HELD order)
  // — replay-equality by CONSTRUCTION, not by parallel code.

  // ── the order half: CREATE C_Order + lines through the archetype verb (docstatus DR by absence
  //    of SET_STATUS — the engine's own convention: buildDoc creates, SET_STATUS transitions) ──
  function buildOrderOps(ctx, cart, opts) {
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
    return { ok: true, ops: ops, order: order, soLines: soLines };
  }

  // ── the completion half: CO + WR fan-out + backflush, on an EXISTING order (created OR held) ──
  function completionOps(ctx, order, soLines, opts) {
    var wh = order.m_warehouse_id;
    // COMPLETE via the engine's own decision-table handler; WR policy comes from the dictionary
    var policy = ctx.wrPolicy || { isautogenerateinout: 'Y', isautogenerateinvoice: 'Y' };
    var ops = E.completeOrder(order, soLines, policy);
    // stamp the WR children with their deterministic ids + the shipping locator (host-resolved)
    ops.forEach(function (op) {
      if (op.op_type === 'CREATE_DOCUMENT' && op.table === 'M_InOut') { op.m_inout_id = opts.inoutId; op.m_warehouse_id = wh; }
      if (op.op_type === 'CREATE_DOCUMENT' && op.table === 'C_Invoice') { op.c_invoice_id = opts.invoiceId; }
    });

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
    if (policy.isautogenerateinout === 'Y') ops.push({ op_type: 'SET_STATUS', table: 'M_InOut', id: opts.inoutId, doc_status: 'CO' });
    if (policy.isautogenerateinvoice === 'Y') ops = ops.concat(E.completeInvoice({ c_invoice_id: opts.invoiceId, issotrx: 'Y' }, [], {}));
    return { ops: ops, consumed: consumed };
  }

  function buildSaleGroup(ctx, cart, opts) {
    var built = buildOrderOps(ctx, cart, opts);
    if (!built.ok) return built;
    var tail = completionOps(ctx, built.order, built.soLines, opts);
    return { ok: true, ops: built.ops.concat(tail.ops), order: built.order, soLines: built.soLines, consumed: tail.consumed, newVerbs: [], verbsUsed: ALLOWED_VERBS.slice(0, 2).concat(['completeOrder', 'completeInvoice']) };
  }

  // ── §P-13 hold: park the in-progress cart as a real DR C_Order — the ORDER half alone ──────────
  // Witness W-POS-HOLD. NOT a private store: the parked row is a ledger C_Order (DR), the same row the
  // Sales Order window + Kanban already read (POS_ADDON_SPEC §P-13 fold-not-fork requirement).
  function buildHoldGroup(ctx, cart, opts) {
    var built = buildOrderOps(ctx, cart, opts);
    if (!built.ok) return built;
    return { ok: true, ops: built.ops, order: built.order, soLines: built.soLines, docstatus: 'DR', newVerbs: [], verbsUsed: ['buildDoc'] };
  }

  // ── §P-13 recall→Complete: CO the HELD order — the COMPLETION half alone, NEVER a re-build ─────
  // "the group must DOC_ACTION CO the EXISTING DR C_Order and build ship/invoice FOR IT … never
  // re-run buildSaleGroup into a second order" (POS_ADDON_SPEC §P-13, Fable5 review 2026-06-12).
  // heldOrder/heldLines = the parked rows read back from the ledger (recall is a plain query).
  function buildRecallCompleteGroup(ctx, heldOrder, heldLines, opts) {
    if (!heldOrder || heldOrder.c_order_id == null) return { ok: false, reason: 'no-held-order' };
    if (heldOrder.docstatus != null && heldOrder.docstatus !== 'DR') {
      return { ok: false, reason: 'not-draft', docstatus: heldOrder.docstatus };   // only a DR order recalls
    }
    if (!heldLines || !heldLines.length) return { ok: false, reason: 'no-held-lines' };
    var tail = completionOps(ctx, heldOrder, heldLines, opts);
    return { ok: true, ops: tail.ops, order: heldOrder, soLines: heldLines, consumed: tail.consumed, newVerbs: [], verbsUsed: ['completeOrder', 'completeInvoice'] };
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

  // ══ §3b DIY master data — §P-9 register / §P-10 edit (POS_ADDON_SPEC.md, decisions §P-9.1-.4) ══
  // Master data rides the SAME signed path as a sale: CRUD_CREATE/CRUD_UPDATE ops (the #268 CRUD-rails
  // shapes, crud_overlay.js buildOp) through kernel_ops.commitGroup. Register ctx additions (host-injected,
  // ALL EXTRACTED — witness scripts/poc_pos_register.js shows the extraction queries the lens copies):
  //   ctx.priceListVersionId      — the station's m_pricelist_version_id (the one the lens reads)
  //   ctx.registerDefaults() -> {
  //     dict   : {col: literal}   — AD_Column.defaultvalue literals for M_Product (IsActive=Y, ProductType=I,
  //                                 …); host resolves @#AD_Client_ID@/@#AD_Org_ID@ from the station context
  //     product: {col: value}     — mandatory cols with NO dictionary default (c_uom_id, c_taxcategory_id,
  //                                 m_product_category_id, issummary, …): mode over the STATION LAYOUT's
  //                                 own products ("the rows the seed's own POS products use", §P-9.4)
  //     price  : {ad_client_id, ad_org_id}              — mode over the station price-version's own rows
  //     image  : {ad_client_id, ad_org_id, entitytype}  — existing ad_image rows; entitytype from the
  //                                 dictionary default (get_sysconfig DEFAULT_ENTITYTYPE → 'U', non-sys)
  //     poskey : {ad_client_id, ad_org_id, qty, nextseqno} — the layout's own keys; nextseqno per the
  //                                 dictionary's OWN SeqNo default (MAX(SeqNo)+10 on the layout)
  //   }
  //   ctx.productByBarcode(upc) -> {m_product_id, name} | null   — the §P-9 collision probe
  //   ctx.priorCreateCount()    -> N  — CRUD_CREATE ops already in the op log (deterministic-id discipline)

  // §P-9.1 plumbing bound: the op-log is the sync spine — binarydata carries a DOWNSCALED thumbnail only.
  // Cap = ~32KB of DECODED image bytes; over-cap registers are REFUSED (no fat ops in the chain).
  var IMAGE_CAP_BYTES = 32768;
  // approx decoded byte size of a dataURL's base64 payload (4 b64 chars → 3 bytes)
  function dataUrlBytes(dataUrl) {
    var s = String(dataUrl), i = s.indexOf('base64,');
    if (i < 0) return s.length;
    return Math.floor((s.length - i - 7) * 3 / 4);
  }

  // §P-9.3 deterministic PKs: count prior CRUD_CREATE ops (the nextIds pattern, pos_lens.js sale band
  // = 910000+n*10; register band = 920000, stride 10 > ops-per-group, clear of every seed PK).
  function registerNextIds(priorCreateCount) {
    var base = 920000 + priorCreateCount * 10;
    return { productId: base + 1, priceId: base + 2, imageId: base + 3, poskeyId: base + 4 };
  }

  // ── §P-9 register: scan + snap + keyed price → ONE signed group of CRUD_CREATE ops ─────────
  // Witness W-POS-REGISTER. spec = { stationId, barcode, name, price /*string*/, imageThumb /*dataURL|null*/,
  // imageKey /*content address|null*/ } → { ok:true, ops, productId, poskeyId, priceId, imageId|null }
  // or an HONEST refusal { ok:false, reason } — no-barcode · no-name · price-not-keyed · image-over-cap ·
  // barcode-exists (PROPOSE-MERGE decision: upc uniqueness is NOT enforced in real iDempiere, but the §P-8
  // scan path resolves barcode→ONE product to ring — a duplicate would make scan resolution nondeterministic,
  // so a second register of the same barcode refuses and HANDS BACK the existing product to merge into).
  function buildRegisterGroup(ctx, spec) {
    spec = spec || {};
    var barcode = spec.barcode == null ? '' : String(spec.barcode).trim();
    var name = spec.name == null ? '' : String(spec.name).trim();
    if (!barcode) return { ok: false, reason: 'no-barcode' };
    if (!name) return { ok: false, reason: 'no-name' };
    if (spec.price == null || String(spec.price).trim() === '') return { ok: false, reason: 'price-not-keyed' };
    var price;
    try { price = bd(spec.price).setScale(2, HALF_UP); } catch (e) { return { ok: false, reason: 'price-not-keyed' }; }
    if (price.signum() < 0) return { ok: false, reason: 'price-not-keyed' };   // a negative price is not a keyed price
    var hasImg = spec.imageThumb != null;
    if (hasImg) {
      var bytes = dataUrlBytes(spec.imageThumb);
      if (bytes > IMAGE_CAP_BYTES) return { ok: false, reason: 'image-over-cap', bytes: bytes, cap: IMAGE_CAP_BYTES };
    }
    var dup = ctx.productByBarcode(barcode);
    if (dup) return { ok: false, reason: 'barcode-exists', existing: dup };

    var d = ctx.registerDefaults();
    var ids = registerNextIds(ctx.priorCreateCount());
    var p = price.toString();

    // M_Product: dictionary literals + station-product extraction + the operator's keyed values.
    // Seed convention (§-named in the witness): Value = the human mnemonic (the one UPC-bearing seed
    // product keeps Value as its name) — the barcode lives in UPC only.
    var productFields = Object.assign({}, d.dict, d.product, {
      m_product_id: ids.productId, value: name, name: name, upc: barcode
    });
    var ops = [{ op_type: 'CRUD_CREATE', table: 'M_Product', fields: productFields }];

    // m_productprice on the STATION's price-list version at the KEYED price. PriceList/PriceStd/PriceLimit
    // are ALL dictionary-mandatory with no default → all three = the keyed price (the seed's own flat-keyed
    // rows use the same convention, e.g. product 146 = 10/10/10).
    ops.push({
      op_type: 'CRUD_CREATE', table: 'M_ProductPrice', fields: Object.assign({
        m_productprice_id: ids.priceId, m_pricelist_version_id: ctx.priceListVersionId,
        m_product_id: ids.productId, pricestd: p, pricelist: p, pricelimit: p, isactive: 'Y'
      }, d.price)
    });

    // AD_Image (§P-9.1 DECIDED): name + imageurl = content key + binarydata = the CAPPED thumbnail.
    if (hasImg) {
      ops.push({
        op_type: 'CRUD_CREATE', table: 'AD_Image', fields: Object.assign({
          ad_image_id: ids.imageId, name: name, imageurl: spec.imageKey || null,
          binarydata: spec.imageThumb, isactive: 'Y'
        }, d.image)
      });
    }

    // c_poskey on the station's layout → the tile appears; ad_image_id wired when a photo ships.
    ops.push({
      op_type: 'CRUD_CREATE', table: 'C_POSKey', fields: {
        c_poskey_id: ids.poskeyId, c_poskeylayout_id: ctx.pos.c_poskeylayout_id,
        name: name, m_product_id: ids.productId, qty: d.poskey.qty, seqno: d.poskey.nextseqno,
        ad_image_id: hasImg ? ids.imageId : null, isactive: 'Y',
        ad_client_id: d.poskey.ad_client_id, ad_org_id: d.poskey.ad_org_id
      }
    });

    return {
      ok: true, ops: ops, productId: ids.productId, poskeyId: ids.poskeyId,
      priceId: ids.priceId, imageId: hasImg ? ids.imageId : null, newVerbs: []
    };
  }

  // ── §P-10 edit: UPDATE ops, CHANGED COLS ONLY, through the same signed path ────────────────
  // Witness W-POS-EDIT. spec = { productId, name?, price?, imageThumb?, imageKey? } — a key present means
  // the operator touched that field; each is diffed against the CURRENT row and only real changes emit ops
  // (the #268 no-op-suppression discipline). Edit ctx additions (host-injected):
  //   ctx.productById(pid)  -> {m_product_id, name, upc} | null
  //   ctx.priceRowOf(pid)   -> {m_productprice_id, pricestd, pricelist, pricelimit} | null  (station version)
  //   ctx.poskeyOf(pid)     -> {c_poskey_id, name, ad_image_id} | null                      (station layout)
  //   ctx.imageById(imgId)  -> {ad_image_id, name, imageurl} | null
  function buildEditGroup(ctx, spec) {
    spec = spec || {};
    var prod = ctx.productById(spec.productId);
    if (!prod) return { ok: false, reason: 'no-such-product', productId: spec.productId };
    var ops = [];
    var pk = ctx.poskeyOf(spec.productId);

    // name edit → M_Product.name (+ the tile's own label, seed convention name == product name)
    if (spec.name != null) {
      var nm = String(spec.name).trim();
      if (!nm) return { ok: false, reason: 'no-name' };
      if (nm !== prod.name) {
        ops.push({ op_type: 'CRUD_UPDATE', table: 'M_Product', id: prod.m_product_id, changes: { name: { old: prod.name, new: nm } } });
        if (pk && pk.name !== nm) ops.push({ op_type: 'CRUD_UPDATE', table: 'C_POSKey', id: pk.c_poskey_id, changes: { name: { old: pk.name, new: nm } } });
      }
    }

    // price edit → the station price row, changed price cols only
    if (spec.price != null) {
      if (String(spec.price).trim() === '') return { ok: false, reason: 'price-not-keyed' };
      var price;
      try { price = bd(spec.price).setScale(2, HALF_UP); } catch (e) { return { ok: false, reason: 'price-not-keyed' }; }
      if (price.signum() < 0) return { ok: false, reason: 'price-not-keyed' };
      var row = ctx.priceRowOf(spec.productId);
      if (!row) return { ok: false, reason: 'no-price-row', productId: spec.productId };  // cannot edit a row that does not exist
      var pc = {}, pNew = price.toString();
      ['pricestd', 'pricelist', 'pricelimit'].forEach(function (c) {
        if (!bd(row[c]).eq(price)) pc[c] = { old: row[c], new: pNew };
      });
      if (Object.keys(pc).length) ops.push({ op_type: 'CRUD_UPDATE', table: 'M_ProductPrice', id: row.m_productprice_id, changes: pc });
    }

    // photo swap/add (cap enforced — same §P-9.1 bound)
    if (spec.imageThumb != null) {
      var bytes = dataUrlBytes(spec.imageThumb);
      if (bytes > IMAGE_CAP_BYTES) return { ok: false, reason: 'image-over-cap', bytes: bytes, cap: IMAGE_CAP_BYTES };
      if (pk && pk.ad_image_id != null) {
        var img = ctx.imageById(pk.ad_image_id) || {};
        // old binarydata is NOT duplicated into the diff (blobs stay in their own ops — the O.c bytes rule)
        ops.push({
          op_type: 'CRUD_UPDATE', table: 'AD_Image', id: pk.ad_image_id, changes: {
            binarydata: { old: null, new: spec.imageThumb },
            imageurl: { old: img.imageurl != null ? img.imageurl : null, new: spec.imageKey || null }
          }
        });
      } else if (pk) {
        // product had no photo: CREATE the AD_Image + wire the tile to it (same deterministic-id band)
        var ids2 = registerNextIds(ctx.priorCreateCount());
        var d2 = ctx.registerDefaults();
        ops.push({
          op_type: 'CRUD_CREATE', table: 'AD_Image', fields: Object.assign({
            ad_image_id: ids2.imageId, name: prod.name, imageurl: spec.imageKey || null,
            binarydata: spec.imageThumb, isactive: 'Y'
          }, d2.image)
        });
        ops.push({ op_type: 'CRUD_UPDATE', table: 'C_POSKey', id: pk.c_poskey_id, changes: { ad_image_id: { old: null, new: ids2.imageId } } });
      }
    }

    if (!ops.length) return { ok: true, noop: true, ops: [], productId: prod.m_product_id };  // §FALSIFIER: no-change edit emits NO ops
    return { ok: true, ops: ops, productId: prod.m_product_id, newVerbs: [] };
  }

  return {
    ringLine: ringLine, cartTotal: cartTotal, buildSaleGroup: buildSaleGroup,
    saleMovements: saleMovements, replenishSuggest: replenishSuggest,
    buildReplenishPO: buildReplenishPO, REPLENISH_PO_SPEC: REPLENISH_PO_SPEC,
    buildRegisterGroup: buildRegisterGroup, buildEditGroup: buildEditGroup,
    buildHoldGroup: buildHoldGroup, buildRecallCompleteGroup: buildRecallCompleteGroup,
    registerNextIds: registerNextIds, dataUrlBytes: dataUrlBytes, IMAGE_CAP_BYTES: IMAGE_CAP_BYTES,
    ALLOWED_VERBS: ALLOWED_VERBS
  };
});
