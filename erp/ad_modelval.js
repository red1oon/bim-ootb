// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_modelval.js — Model-validator timing-hook engine (W-MODELVAL). The "Model Validators" leg of the
// coverage matrix: dispatch registered validators around a record/document action at named TIMINGS
// (BEFORE/AFTER × NEW/SAVE/DELETE + the doc-timings PREPARE/COMPLETE/VOID). Faithful port of iDempiere's
// ModelValidationEngine.fireModelChange / fireDocValidate: a validator that returns a non-null error string
// ABORTS the operation. Self-contained, no kernel dep (mirrors ad_process.js / ad_callout.js shape).
//
// SEAM (docs/ERP_BACKEND_SEPARATION.md §2 A-4): this engine GATES an action (may BLOCK before-COMPLETE); it
// does NOT post. The GL derivation (A-1) is DOWNSTREAM and ignorant of why a doc was admitted — fireHooks
// runs FIRST on the doc-action path; only if it returns ok does derive(A-1)→fold(layer-3) proceed. A hook
// reads the record/ctx and returns a verdict; it never derives a posting or routes a workflow.
//
// EXTRACT, DON'T INVENT: the 3 registered classes come from ad_full.db (ad_modelvalidator) — their Java
// bodies are named-deferred (no port); the 2–3 hooks here are faithful ports of documented M*.beforeSave /
// completeIt invariants (qty>0; a doc must have lines), each computed from real record/db columns. An
// un-hooked (table,timing) is an explicit no-op result, never a hidden pass. Determinism: pure checks +
// read-only lookups, no Date.now/Math.random. Implementing ERP_COVERAGE_MATRIX.md §AD_ModelValidator /
// §beforeSave-afterSave (ranked GAP #9) — Witness: W-MODELVAL
(function (global) {
  'use strict';

  // iDempiere timing constants we model (ModelValidator TYPE_* + docValidate TIMING_*).
  var TIMINGS = ['BEFORE_NEW', 'AFTER_NEW', 'BEFORE_SAVE', 'AFTER_SAVE', 'BEFORE_DELETE', 'AFTER_DELETE',
                 'BEFORE_PREPARE', 'BEFORE_COMPLETE', 'AFTER_COMPLETE', 'BEFORE_VOID', 'AFTER_VOID'];

  // REGISTRY[table][timing] = [ {name, fn} ]  — fn(ctx, info) -> null | "error string" (iDempiere semantics).
  var REGISTRY = {};
  function registerValidator(table, timing, name, fn) {
    var t = table.toLowerCase();
    (REGISTRY[t] = REGISTRY[t] || {});
    (REGISTRY[t][timing] = REGISTRY[t][timing] || []).push({ name: name, fn: fn });
  }
  function registeredCount() {
    var n = 0, t, ti; for (t in REGISTRY) for (ti in REGISTRY[t]) n += REGISTRY[t][ti].length; return n;
  }

  // readValidators(db) — the AD source: the registered ModelValidator classes (Java bodies named-deferred).
  function readValidators(db) {
    return db.prepare('SELECT ad_modelvalidator_id,name,modelvalidationclass,entitytype FROM ad_modelvalidator ORDER BY ad_modelvalidator_id').all();
  }

  // installDefaultHooks — faithful ports of real M*.beforeSave / completeIt invariants.
  function installDefaultHooks() {
    // MOrderLine.beforeSave: a line must carry a positive quantity (TYPE_BEFORE_NEW/CHANGE).
    function qtyPositive(ctx, info) {
      var r = info.record || {};
      var q = Number(r.QtyOrdered != null ? r.QtyOrdered : r.qtyordered);
      if (!(q > 0)) return 'QtyOrdered must be > 0 (got ' + q + ')';
      return null;
    }
    registerValidator('C_OrderLine', 'BEFORE_SAVE', 'MOrderLine.qtyPositive', qtyPositive);
    registerValidator('C_InvoiceLine', 'BEFORE_SAVE', 'MInvoiceLine.qtyPositive', function (ctx, info) {
      var r = info.record || {}; var q = Number(r.QtyInvoiced != null ? r.QtyInvoiced : r.qtyinvoiced);
      return q > 0 ? null : 'QtyInvoiced must be > 0 (got ' + q + ')';
    });

    // MOrder.completeIt precondition: the document must have at least one line (docValidate BEFORE_COMPLETE).
    registerValidator('C_Order', 'BEFORE_COMPLETE', 'MOrder.hasLines', function (ctx, info) {
      var n = ctx.lineCount ? ctx.lineCount(info) : (info.lineCount || 0);
      return n > 0 ? null : 'Cannot complete an order with no lines';
    });
    // a second BEFORE_COMPLETE hook to prove ordered multi-hook dispatch (grand total must be non-negative).
    registerValidator('C_Order', 'BEFORE_COMPLETE', 'MOrder.totalNonNegative', function (ctx, info) {
      var r = info.record || {}; var g = Number(r.GrandTotal != null ? r.GrandTotal : r.grandtotal);
      return g >= 0 ? null : 'GrandTotal must be >= 0 (got ' + g + ')';
    });
  }

  // installMOrderSaveHooks(db) — faithful port of MOrder.beforeSave (MOrder.java:1183-1396), the H-1.3
  // archetype delta. Each hook cites its Java lines. iDempiere's beforeSave BOTH derives defaults (setters)
  // and gates (return false): here a hook writes derived values into info.derived (the caller applies them —
  // same seam as the callout's derived map) and returns an error string only for the Java reject paths.
  // Non-blocking Java log.saveWarning paths land in info.warnings. ADDITIVE: registers under
  // ('C_Order','BEFORE_SAVE'); the existing generic hooks are untouched. Reads ONLY layer-1 (db) — no sibling.
  function installMOrderSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function w(info) { return (info.warnings = info.warnings || []); }
    function chg(info, col) { // is_ValueChanged: only meaningful on a non-new record with an old image
      return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col]));
    }
    var H = [
      ['MOrder.clientNotZero', function (ctx, info) {        // :1195-1199  "AD_Client_ID = 0" → reject
        return Number(info.record.ad_client_id) === 0 ? 'AD_Client_ID = 0' : null;
      }],
      ['MOrder.warehouseMandatory', function (ctx, info) {   // :1206-1215  ctx fallback else FillMandatoryException
        if (Number(info.record.m_warehouse_id) > 0) return null;
        if (ctx && Number(ctx.m_warehouse_id) > 0) { d(info).m_warehouse_id = Number(ctx.m_warehouse_id); return null; }
        return 'FillMandatory M_Warehouse_ID';
      }],
      ['MOrder.warehouseOrgCheck', function (ctx, info) {    // :1216-1223  org conflict = WARNING, not reject
        var wh = db.prepare('SELECT ad_org_id FROM m_warehouse WHERE m_warehouse_id=?').get(Number(info.record.m_warehouse_id));
        if (wh && Number(wh.ad_org_id) !== Number(info.record.ad_org_id)) w(info).push('WarehouseOrgConflict');
        return null;
      }],
      ['MOrder.bpLocationConsistency', function (ctx, info) {// :1239-1252  cleared (set null), not rejected
        var r = info.record;
        if (Number(r.c_bpartner_location_id) > 0) {
          var loc = db.prepare('SELECT c_bpartner_id FROM c_bpartner_location WHERE c_bpartner_location_id=?').get(Number(r.c_bpartner_location_id));
          if (!loc || Number(loc.c_bpartner_id) !== Number(r.c_bpartner_id)) d(info).c_bpartner_location_id = null;
        }
        if (Number(r.ad_user_id) > 0) {
          var u = db.prepare('SELECT c_bpartner_id FROM ad_user WHERE ad_user_id=?').get(Number(r.ad_user_id));
          if (!u || Number(u.c_bpartner_id) !== Number(r.c_bpartner_id)) d(info).ad_user_id = null;
        }
        return null;
      }],
      ['MOrder.bpLocationDefault', function (ctx, info) {    // :1269-1270 ∘ setBPartner :752-774 — location 0 → the BP's own
        // §P1 P1.5 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §IMPL — W-PARITY-FIELDSET / W-MORDER-SAVE).
        // Java: `if (getC_BPartner_Location_ID() == 0) setBPartner(new MBPartner(...))` (:1269-1270) — it also runs
        // right after :1239-1252 cleared a foreign location. setBPartner: BP SalesRep_ID if non-zero (:752-753);
        // loop over the BP's locations — isShipTo → C_BPartner_Location_ID, isBillTo → Bill_Location_ID, each
        // iteration overwriting (:756-763, so the LAST match wins); still 0 → the first location (:766-769);
        // no location at all → BPartnerNoShipToAddressException (:772-774). ONLY this slice is ported here — the
        // payment-term / price-list parts of setBPartner ride the existing :1282/:1315 hooks below.
        var r = info.record, dd = d(info);
        var locNow = (dd.c_bpartner_location_id !== undefined) ? dd.c_bpartner_location_id : r.c_bpartner_location_id;
        if (Number(locNow) > 0 || !(Number(r.c_bpartner_id) > 0)) return null;
        var bp = null;   // a slimmed bundle without c_bpartner.salesrep_id (bim-compiler's glassbowl_data.db fixture) → no BP sales rep: conservative, never invented
        try { bp = db.prepare('SELECT salesrep_id FROM c_bpartner WHERE c_bpartner_id=?').get(Number(r.c_bpartner_id)); } catch (eGap) { bp = null; }
        if (bp && Number(bp.salesrep_id) > 0 && !(Number(r.salesrep_id) > 0)) dd.salesrep_id = Number(bp.salesrep_id);
        var locs = db.prepare("SELECT c_bpartner_location_id, isshipto, isbillto FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id").all(Number(r.c_bpartner_id)) || [];
        if (!locs.length) return 'BPartnerNoShipToAddress';
        var ship = null, bill = null;
        locs.forEach(function (l) {
          if (String(l.isshipto) === 'Y') ship = Number(l.c_bpartner_location_id);
          if (String(l.isbillto) === 'Y') bill = Number(l.c_bpartner_location_id);
        });
        dd.c_bpartner_location_id = ship != null ? ship : Number(locs[0].c_bpartner_location_id);
        if (bill != null) dd.bill_location_id = bill;
        else if (!(Number(r.bill_location_id) > 0)) dd.bill_location_id = Number(locs[0].c_bpartner_location_id);
        return null;
      }],
      ['MOrder.billDefaults', function (ctx, info) {         // :1272-1279  Bill_* default to the BP/location
        var r = info.record, dd = d(info);
        // §P1: read the EFFECTIVE location — Java's :1269 setBPartner already set it before :1272 reads it.
        var loc = (dd.c_bpartner_location_id !== undefined && dd.c_bpartner_location_id !== null) ? dd.c_bpartner_location_id : r.c_bpartner_location_id;
        var billLoc = (dd.bill_location_id !== undefined && dd.bill_location_id !== null) ? dd.bill_location_id : r.bill_location_id;
        if (!Number(r.bill_bpartner_id)) { dd.bill_bpartner_id = Number(r.c_bpartner_id); dd.bill_location_id = Number(loc); }
        else if (!Number(billLoc)) dd.bill_location_id = Number(loc);
        return null;
      }],
      ['MOrder.priceListDefault', function (ctx, info) {     // :1282-1290  IsSOPriceList=IsSOTrx ORDER BY IsDefault DESC
        var r = info.record;                                 //   (tie past IsDefault is unspecified in Java; pk-ordered here)
        if (!Number(r.m_pricelist_id)) {
          var pl = db.prepare("SELECT m_pricelist_id FROM m_pricelist WHERE issopricelist=? AND isactive='Y' ORDER BY isdefault DESC, m_pricelist_id").get(r.issotrx === 'Y' ? 'Y' : 'N');
          if (pl) d(info).m_pricelist_id = pl.m_pricelist_id;
        }
        return null;
      }],
      ['MOrder.currencyFromPriceList', function (ctx, info) {// :1292-1300  currency follows the price list
        var r = info.record;
        if (!Number(r.c_currency_id)) {
          var plId = (info.derived && info.derived.m_pricelist_id) || Number(r.m_pricelist_id);
          var pl = db.prepare('SELECT c_currency_id FROM m_pricelist WHERE m_pricelist_id=?').get(Number(plId));
          if (pl && pl.c_currency_id) d(info).c_currency_id = pl.c_currency_id;
        }
        return null;
      }],
      ['MOrder.salesRepFromCtx', function (ctx, info) {      // :1302-1307  SalesRep 0 → Env.SALESREP_ID (the login user); ctx fallback only
        // §P1 P1.5 — the MOrder twin of MInvoice.salesRepFromCtx (:1183-1188) below; the host feeds ctx.salesrep_id
        // from window.APP.actor (crud_overlay.js _docCtx). Never overrides a set value (Java defaults ONLY a zero column).
        var r = info.record, dd = d(info);
        var srNow = (dd.salesrep_id !== undefined && dd.salesrep_id !== null) ? dd.salesrep_id : r.salesrep_id;
        if (!(Number(srNow) > 0) && ctx && Number(ctx.salesrep_id) > 0) dd.salesrep_id = Number(ctx.salesrep_id);
        return null;
      }],
      ['MOrder.docTypeTargetDefault', function (ctx, info) { // :1311-1312  default = the Standard SO doctype ('SO')
        // §DOCTYPE-PER-WINDOW (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-21) — real iDempiere lets the WINDOW
        // (via its AD_Window/tab context) override this default to the Purchase side; this port previously
        // always fell back to the client's Standard SALES doctype regardless of which window authored the
        // record, so a "Purchase Order" created here got a Sales doctype (and thus a wrong/absent IsSOTrx)
        // underneath. ctx.issotrx (threaded from the AD_Tab's own WhereClause, e.g. window 181's
        // "C_Order.IsSOTrx='N'") picks the matching side; absent/ambiguous ctx keeps the original
        // Standard-Sales fallback (never a behavior change for a caller that supplies no hint).
        var r = info.record;
        if (!Number(r.c_doctypetarget_id)) {
          var dt = (ctx && ctx.issotrx === 'N')
            ? db.prepare("SELECT c_doctype_id, issotrx FROM c_doctype WHERE docbasetype='POO' AND docsubtypeso IS NULL AND isactive='Y' ORDER BY c_doctype_id").get()
            : db.prepare("SELECT c_doctype_id, issotrx FROM c_doctype WHERE docbasetype='SOO' AND docsubtypeso='SO' AND isactive='Y' ORDER BY c_doctype_id").get();
          if (dt) {
            d(info).c_doctypetarget_id = dt.c_doctype_id;
            // IsSOTrx has no form field anywhere in this UI (crud_ops.json's c_order entry never declares it) —
            // this beforeSave slice is the ONLY place it can ever be derived in this engine. Real iDempiere sets
            // it from the chosen DocType at record construction; ported here since that seam doesn't exist yet.
            if (!r.issotrx) d(info).issotrx = dt.issotrx;
          }
        }
        return null;
      }],
      ['MOrder.deliveryInvoiceRuleDefault', function (ctx, info) {
        // §DR-IR-LAST-MILE (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-21, "DeliveryRule/InvoiceRule undeclared") —
        // NOT a beforeSave line in real MOrder.java: DeliveryRule/InvoiceRule are AD_Column DefaultValue
        // fields, applied at NEW-record time by the window layer, not by the model's beforeSave. This engine
        // has no such "apply AD_Column default at NEW" seam yet, and c_order's crud_ops.json entry (like
        // M_Warehouse_ID/IsSOTrx above) declares no visible field for either — genShipmentLines/
        // genInvoiceLines (ad_process.js) silently treat an undefined rule as "named-deferred", so every
        // freshly-created order produced zero shippable/invoiceable lines regardless of DocStatus/IsSOTrx/
        // Warehouse all being correct. Values are the REAL AD_Column.DefaultValue rows for C_Order in the
        // seed (queried live: DeliveryRule='F' Force, InvoiceRule='I' Immediate — confirmed, not assumed;
        // Availability was the initial guess and would have been WRONG).
        var r = info.record;
        if (!r.deliveryrule) d(info).deliveryrule = 'F';
        if (!r.invoicerule) d(info).invoicerule = 'I';
        return null;
      }],
      ['MOrder.paymentTermDefault', function (ctx, info) {   // :1315-1327  IsDefault='Y' payment term
        var r = info.record;
        if (!Number(r.c_paymentterm_id)) {
          var pt = db.prepare("SELECT c_paymentterm_id FROM c_paymentterm WHERE isdefault='Y' AND isactive='Y' ORDER BY c_paymentterm_id").get();
          if (pt) d(info).c_paymentterm_id = pt.c_paymentterm_id;
        }
        return null;
      }],
      ['MOrder.prepayNoCash', function (ctx, info) {         // :1373-1379  PrepayOrder('PR') + PAYMENTRULE_Cash('B') → reject
        var r = info.record;
        var dt = db.prepare('SELECT docsubtypeso FROM c_doctype WHERE c_doctype_id=?').get(Number(r.c_doctypetarget_id));
        if (dt && dt.docsubtypeso === 'PR' && r.paymentrule === 'B') return 'Invalid PaymentRule (Prepay Order must not be Cash)';
        return null;
      }],
      ['MOrder.priceListImmutable', function (ctx, info) {   // :1352-1359  IDEMPIERE-1597 CannotChangePl when product lines exist
        if (!info.recordOld || !chg(info, 'm_pricelist_id')) return null;
        var n = db.prepare('SELECT count(*) n FROM c_orderline WHERE c_order_id=? AND m_product_id>0').get(Number(info.record.c_order_id)).n;
        return n > 0 ? 'CannotChangePl' : null;
        // the :1361-1369 DateOrdered/price-list-VERSION twin needs m_pricelist_version (not in capture) — named-deferred
      }]
    ];
    H.forEach(function (h) { registerValidator('C_Order', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // ── H-2 deep-delta beforeSave ports (prompts/FABLE5_H2_DELTAS.md) — ADDITIVE, one installer per class,
  // every hook citing its Java lines; same derived/warnings seam as installMOrderSaveHooks. ──────────────

  // installMInOutSaveHooks(db) — faithful port of MInOut.beforeSave (MInOut.java:1304-1370).
  function installMInOutSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function w(info) { return (info.warnings = info.warnings || []); }
    function chg(info, col) { return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col])); }
    var H = [
      ['MInOut.movementTypeFromWindow', function (ctx, info) {
        // Implementing ERP_P2P_INVOICE_MATCH.md §Fix 2 — Witness: W-RECEIPT-MOVEMENTTYPE. Mirrors
        // MOrder.docTypeTargetDefault's ctx.issotrx thread (ad_modelval.js ~line 131): crud_ops.json's
        // m_inout entry declares no C_DocType_ID field, so movementTypeDerive below (which reads an
        // already-set C_DocType_ID) can never fire for a manually-created record — this is the ONLY seam
        // where the per-window signal (ctx.movementtype, threaded from the AD_Tab's own WhereClause, e.g.
        // Material Receipt tab 296's "MovementType IN ('V+')") can reach the new row at all.
        var r = info.record;
        if (!r.movementtype && /^[A-Z][+-]$/.test((ctx && ctx.movementtype) || '')) {
          d(info).movementtype = ctx.movementtype;
          if (!r.issotrx) d(info).issotrx = ctx.movementtype.charAt(0) === 'C' ? 'Y' : 'N';
        }
        return null;
      }],
      ['MInOut.movementTypeDerive', function (ctx, info) {   // :1306-1308 ∘ getMovementType:1275-1287
        var r = info.record;
        if (info.recordOld && !chg(info, 'c_doctype_id')) return null;   // fires on new record or doctype change
        if (!(Number(r.c_doctype_id) > 0)) { w(info).push('FillMandatory C_DocType_ID'); return null; }  // :1294-1297 logs, does not abort
        var dt = db.prepare('SELECT docbasetype,issotrx FROM c_doctype WHERE c_doctype_id=?').get(Number(r.c_doctype_id));
        var mt = null;
        if (dt && dt.docbasetype === 'MMS') mt = dt.issotrx === 'Y' ? 'C-' : 'V-';        // :1281-1282 Delivery → CustomerShipment/VendorReturns
        else if (dt && dt.docbasetype === 'MMR') mt = dt.issotrx === 'Y' ? 'C+' : 'V+';   // :1283-1284 Receipt → CustomerReturns/VendorReceipts
        if (mt) d(info).movementtype = mt;
        return null;
      }],
      ['MInOut.warehouseOrgConflict', function (ctx, info) { // :1310-1318 NEW record only → reject
        if (info.recordOld) return null;
        var wh = db.prepare('SELECT ad_org_id FROM m_warehouse WHERE m_warehouse_id=?').get(Number(info.record.m_warehouse_id));
        return (wh && Number(wh.ad_org_id) !== Number(info.record.ad_org_id)) ? 'WarehouseOrgConflict' : null;
      }],
      ['MInOut.deliveryRuleDefault', function (ctx, info) {  // :1319-1324 Force→Availability when neg-inv disallowed; empty→Availability
        var r = info.record;
        var wh = db.prepare('SELECT isdisallownegativeinv FROM m_warehouse WHERE m_warehouse_id=?').get(Number(r.m_warehouse_id));
        var rule = r.deliveryrule;
        if ((wh && wh.isdisallownegativeinv === 'Y' && rule === 'F') || rule == null || rule === '') d(info).deliveryrule = 'A';
        return null;
      }],
      ['MInOut.orderXorRMA', function (ctx, info) {          // :1326-1331 Order and RMA are mutually exclusive
        var r = info.record;
        return (Number(r.c_order_id) > 0 && Number(r.m_rma_id) > 0) ? 'OrderOrRMA' : null;
      }],
      ['MInOut.salesRepFromOrder', function (ctx, info) {    // :1356-1366 SalesRep defaults from the order (RMA leg n/a in seed, named)
        var r = info.record;
        if (Number(r.salesrep_id) > 0 || !(Number(r.c_order_id) > 0)) return null;
        var o = db.prepare('SELECT salesrep_id FROM c_order WHERE c_order_id=?').get(Number(r.c_order_id));
        if (o && Number(o.salesrep_id) > 0) d(info).salesrep_id = Number(o.salesrep_id);
        return null;
      }]
      // :1333-1338 RMA→shipment-doctype derive + :1340-1355 shipper-account/freight = data-absent in seed (no m_rma,
      // no CustomerAccount freightcostrule) — named-deferred, never synthesized.
    ];
    H.forEach(function (h) { registerValidator('M_InOut', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMInvoiceSaveHooks(db) — faithful port of MInvoice.beforeSave (MInvoice.java:1144-1283).
  function installMInvoiceSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function chg(info, col) { return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col])); }
    function pick(r, info, col) { var dv = info.derived && info.derived[col]; return dv != null ? dv : r[col]; }
    var H = [
      ['MInvoice.issotrxFromWindow', function (ctx, info) {
        // Implementing ERP_P2P_INVOICE_MATCH.md §Fix 4 — Witness: W-INVOICE-ISSOTRX. c_invoice's real
        // AD_Tab family (263 "IsSOTrx='Y'", 290/470 "IsSOTrx='N'") already matches the EXISTING
        // window.APP._createIsSOTrx regex (ERP_BUSINESS_CYCLE_E2E.md §Fix 2026-07-21) — but crud_ops.json's
        // c_invoice entry declares no IsSOTrx field, so nothing ever wrote ctx.issotrx onto the new record
        // itself (MOrder's docTypeTargetDefault derives BOTH doctype AND issotrx together; MInvoice's own
        // docTypeTargetDefault below only READS r.issotrx, assuming something upstream already set it — for
        // an auto-generated invoice that's DOC_SPECS.createInvoice's header(); for a MANUAL create (only
        // possible via the Create-Lines-From-PO/Receipt picker, §Fix 4) this hook is that missing seam.
        var r = info.record;
        if (!r.issotrx && (ctx && (ctx.issotrx === 'Y' || ctx.issotrx === 'N'))) d(info).issotrx = ctx.issotrx;
        return null;
      }],
      ['MInvoice.bpDefaults', function (ctx, info) {         // :1147-1149 ∘ setBPartner:631-673 — location + term/pricelist/rule from the BP
        var r = info.record;
        if (Number(r.c_bpartner_location_id) > 0) return null;
        // Implementing ERP_P2P_INVOICE_MATCH.md §Fix 4 — pick() (not bare r.issotrx) sees issotrxFromWindow's
        // derived value too, same-pass (hooks share one `info`, only `info.record` itself stays the static
        // pre-hook snapshot — this is the existing derived-fallback convention priceListDefault already uses).
        var so = pick(r, info, 'issotrx') === 'Y';
        var bp = db.prepare('SELECT paymentrule,c_paymentterm_id,po_paymentterm_id,m_pricelist_id,po_pricelist_id FROM c_bpartner WHERE c_bpartner_id=?').get(Number(r.c_bpartner_id));
        if (!bp) return null;
        var pt = so ? bp.c_paymentterm_id : bp.po_paymentterm_id;      // :638-644
        if (Number(pt) > 0) d(info).c_paymentterm_id = Number(pt);
        var pl = so ? bp.m_pricelist_id : bp.po_pricelist_id;          // :646-651
        if (Number(pl) > 0) d(info).m_pricelist_id = Number(pl);
        if (bp.paymentrule) d(info).paymentrule = bp.paymentrule;      // :653-655
        var locs = db.prepare("SELECT c_bpartner_location_id,isbillto,ispayfrom FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id").all(Number(r.c_bpartner_id));
        var loc = 0;                                                   // :659-667 ascending loop overwrites → LAST match wins
        locs.forEach(function (l) { if ((l.isbillto === 'Y' && so) || (l.ispayfrom === 'Y' && !so)) loc = l.c_bpartner_location_id; });
        if (!loc && locs.length) loc = locs[0].c_bpartner_location_id; // :669-670 fall back to first
        if (loc) d(info).c_bpartner_location_id = Number(loc);
        return null;                                                   // :675+ contact (AD_User) derive = named residual
      }],
      ['MInvoice.priceListDefault', function (ctx, info) {   // :1151-1169 ctx (SO-flag must match) else client default
        var r = info.record;
        if (Number(pick(r, info, 'm_pricelist_id')) > 0) return null;
        if (ctx && Number(ctx.m_pricelist_id) > 0) {
          var cpl = db.prepare('SELECT issopricelist FROM m_pricelist WHERE m_pricelist_id=?').get(Number(ctx.m_pricelist_id));
          if (cpl && (cpl.issopricelist === 'Y') === (r.issotrx === 'Y')) { d(info).m_pricelist_id = Number(ctx.m_pricelist_id); return null; }
        }
        var pl = db.prepare("SELECT m_pricelist_id FROM m_pricelist WHERE issopricelist=? AND isactive='Y' ORDER BY isdefault DESC, m_pricelist_id").get(r.issotrx === 'Y' ? 'Y' : 'N');
        if (pl) d(info).m_pricelist_id = pl.m_pricelist_id;            // tie past IsDefault unspecified in Java; pk-ordered (H-1 convention)
        return null;
      }],
      ['MInvoice.currencyFromPriceList', function (ctx, info) {  // :1171-1180 currency follows the price list, else ctx
        var r = info.record;
        if (Number(r.c_currency_id) > 0) return null;
        var plId = pick(r, info, 'm_pricelist_id');
        var pl = db.prepare('SELECT c_currency_id FROM m_pricelist WHERE m_pricelist_id=?').get(Number(plId));
        if (pl && pl.c_currency_id) d(info).c_currency_id = pl.c_currency_id;
        else if (ctx && Number(ctx.c_currency_id) > 0) d(info).c_currency_id = Number(ctx.c_currency_id);
        return null;
      }],
      ['MInvoice.salesRepFromCtx', function (ctx, info) {    // :1183-1188 ctx fallback only
        var r = info.record;
        if (!(Number(r.salesrep_id) > 0) && ctx && Number(ctx.salesrep_id) > 0) d(info).salesrep_id = Number(ctx.salesrep_id);
        return null;
      }],
      ['MInvoice.docTypeTargetDefault', function (ctx, info) {  // :1190-1194 ∘ setC_DocTypeTarget_ID:804-822 — ARI/API by SO flag
        var r = info.record;
        if (Number(r.c_doctypetarget_id) > 0) return null;
        // Implementing ERP_P2P_INVOICE_MATCH.md §Fix 4 — pick() sees issotrxFromWindow's derived value (same
        // convention as bpDefaults above); without it a manually-created Purchase invoice always fell through
        // to the bare r.issotrx (undefined) branch, which is truthy-false too but for the WRONG reason.
        var dt = db.prepare("SELECT c_doctype_id FROM c_doctype WHERE docbasetype=? AND ad_org_id IN (0,?) AND isactive='Y' ORDER BY isdefault DESC, ad_org_id DESC, c_doctype_id").get(pick(r, info, 'issotrx') === 'Y' ? 'ARI' : 'API', Number(r.ad_org_id));
        if (dt) d(info).c_doctypetarget_id = dt.c_doctype_id;
        return null;
      }],
      ['MInvoice.paymentTermDefault', function (ctx, info) { // :1196-1209 ctx else IsDefault='Y'
        var r = info.record;
        if (Number(pick(r, info, 'c_paymentterm_id')) > 0) return null;
        if (ctx && Number(ctx.c_paymentterm_id) > 0) { d(info).c_paymentterm_id = Number(ctx.c_paymentterm_id); return null; }
        var pt = db.prepare("SELECT c_paymentterm_id FROM c_paymentterm WHERE isdefault='Y' AND isactive='Y' ORDER BY c_paymentterm_id").get();
        if (pt) d(info).c_paymentterm_id = pt.c_paymentterm_id;
        return null;
      }],
      ['MInvoice.priceListImmutable', function (ctx, info) { // :1219-1239 IDEMPIERE-1597 CannotChangePlIn when product lines exist
        if (!info.recordOld || !chg(info, 'm_pricelist_id')) return null;
        var n = db.prepare('SELECT count(*) n FROM c_invoiceline WHERE c_invoice_id=? AND m_product_id>0').get(Number(info.record.c_invoice_id)).n;
        return n > 0 ? 'CannotChangePlIn' : null;
        // the :1230-1237 DateInvoiced/price-list-VERSION twin needs m_pricelist_version (not in capture) — named-deferred (H-1 pattern)
      }],
      ['MInvoice.currencyRateOverride', function (ctx, info) {  // :1256-1283 primary-schema FX override gate (skipped when Processed)
        var r = info.record;
        if (r.processed === 'Y') return null;
        var s1 = db.prepare('SELECT c_acctschema1_id FROM ad_clientinfo WHERE ad_client_id=?').get(Number(r.ad_client_id));
        if (!s1) return null;
        var sc = db.prepare('SELECT c_currency_id FROM c_acctschema WHERE c_acctschema_id=?').get(Number(s1.c_acctschema1_id));
        if (sc && Number(sc.c_currency_id) !== Number(r.c_currency_id)) {
          if (r.isoverridecurrencyrate === 'Y') {
            if (!(Number(r.currencyrate) > 0)) return 'FillMandatory CurrencyRate';   // :1267-1271
          } else d(info).currencyrate = null;                                          // :1274-1276
        } else d(info).currencyrate = null;                                            // :1279-1281
        return null;
      }]
      // :1211-1217 cash-plan line (no c_cashplanline in seed) + :1242-1254 payment-term re-apply (write-path
      // schedule rebuild, out of beforeSave verdict scope) = named residuals.
    ];
    H.forEach(function (h) { registerValidator('C_Invoice', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMPaymentSaveHooks(db) — faithful port of MPayment.beforeSave (MPayment.java:670-830).
  function installMPaymentSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function chg(info, col) { return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col])); }
    function cashAsPayment(r) {  // MSysConfig.CASH_AS_PAYMENT, Java default true (MPayment.java:238)
      var row = db.prepare('SELECT value FROM ad_sysconfig WHERE name=? AND ad_client_id IN (0,?) ORDER BY ad_client_id DESC').get('CASH_AS_PAYMENT', Number(r.ad_client_id));
      return row ? row.value === 'Y' : true;
    }
    function isCashTrx(r) { return r.tendertype === 'X'; }              // :228-231 TENDERTYPE_Cash
    function isCashbookTrx(r) { return isCashTrx(r) && !cashAsPayment(r); }  // :237-239
    var H = [
      ['MPayment.processedImmutable', function (ctx, info) { // :672-687 financial fields frozen once Processed
        var r = info.record;
        if (r.processed !== 'Y' || chg(info, 'processed')) return null;
        var cols = ['c_bankaccount_id', 'c_bpartner_id', 'c_charge_id', 'c_currency_id', 'c_doctype_id', 'dateacct', 'datetrx', 'discountamt', 'payamt', 'writeoffamt'];
        for (var i = 0; i < cols.length; i++) if (chg(info, cols[i])) return 'PaymentAlreadyProcessed';
        return null;
      }],
      ['MPayment.bankOrCashbookMandatory', function (ctx, info) {  // :689-701 cashbook XOR bank account
        var r = info.record;
        if (isCashbookTrx(r)) return Number(r.c_cashbook_id) > 0 ? null : 'Mandatory: C_CashBook_ID';
        return Number(r.c_bankaccount_id) > 0 ? null : 'Mandatory: C_BankAccount_ID';
      }],
      ['MPayment.chargeResets', function (ctx, info) {       // :705-717 charge payment resets order/invoice/amount flags
        var r = info.record;
        if (!(Number(r.c_charge_id) > 0) || (info.recordOld && !chg(info, 'c_charge_id'))) return null;
        d(info).c_order_id = 0; d(info).c_invoice_id = 0; d(info).writeoffamt = 0; d(info).discountamt = 0;
        d(info).isoverunderpayment = 'N'; d(info).overunderamt = 0; d(info).isprepayment = 'N';
        return null;
      }],
      ['MPayment.bpartnerRequired', function (ctx, info) {   // :719-730 BP or invoice/order required (non-cash)
        var r = info.record;
        if (Number(r.c_charge_id) > 0 || Number(r.c_bpartner_id) > 0 || isCashTrx(r)) return null;
        return (Number(r.c_invoice_id) > 0 || Number(r.c_order_id) > 0) ? null : 'NotFound: C_BPartner_ID';
      }],
      ['MPayment.prepaymentDerive', function (ctx, info) {   // :732-749 IsPrepayment from charge/BP/order/project (reversal leg n/a in seed)
        var r = info.record;
        if (info.recordOld && !(chg(info, 'c_charge_id') || chg(info, 'c_invoice_id') || chg(info, 'c_order_id') || chg(info, 'c_project_id'))) return null;
        if (Number(r.reversal_id) > 0) return null;          // :737-741 copies the reversal's flag — no reversal in seed, named
        var pre = !(Number(r.c_charge_id) > 0) && Number(r.c_bpartner_id) > 0 &&
                  (Number(r.c_order_id) > 0 || (Number(r.c_project_id) > 0 && !(Number(r.c_invoice_id) > 0)));
        d(info).isprepayment = pre ? 'Y' : 'N';
        return null;
      }],
      ['MPayment.docTypeReceipt', function (ctx, info) {     // :763-770 ∘ setC_DocType_ID(boolean):1545-1563
        var r = info.record;
        if (!(Number(r.c_doctype_id) > 0)) {
          var dt = db.prepare("SELECT c_doctype_id FROM c_doctype WHERE isactive='Y' AND docbasetype=? ORDER BY isdefault DESC, c_doctype_id").get(r.isreceipt === 'Y' ? 'ARR' : 'APP');
          if (dt) d(info).c_doctype_id = dt.c_doctype_id;
        } else {
          var dt2 = db.prepare('SELECT issotrx FROM c_doctype WHERE c_doctype_id=?').get(Number(r.c_doctype_id));
          if (dt2) d(info).isreceipt = dt2.issotrx;
        }
        return null;
      }],
      ['MPayment.dateAcctDefault', function (ctx, info) {    // :773-774 DateAcct defaults to DateTrx
        var r = info.record;
        if (r.dateacct == null || r.dateacct === '') d(info).dateacct = r.datetrx;
        return null;
      }],
      ['MPayment.overUnderZero', function (ctx, info) {      // :776-777 not over/under → amount zeroed
        var r = info.record;
        if (r.isoverunderpayment !== 'Y' && Number(r.overunderamt) !== 0) d(info).overunderamt = 0;
        return null;
      }],
      ['MPayment.orgFromBankAccount', function (ctx, info) { // :780-787 payment org follows the bank account's org (when set)
        var r = info.record;
        if (Number(r.c_charge_id) > 0 || (info.recordOld && !chg(info, 'c_bankaccount_id'))) return null;
        var ba = db.prepare('SELECT ad_org_id FROM c_bankaccount WHERE c_bankaccount_id=?').get(Number(r.c_bankaccount_id));
        if (ba && Number(ba.ad_org_id) !== 0) d(info).ad_org_id = Number(ba.ad_org_id);
        return null;
      }],
      ['MPayment.bpMatchesInvoiceOrder', function (ctx, info) {  // :790-806 BP must equal the invoice's / order's BP
        var r = info.record;
        if (!(Number(r.c_bpartner_id) > 0)) return null;
        if (Number(r.c_invoice_id) > 0) {
          var inv = db.prepare('SELECT c_bpartner_id FROM c_invoice WHERE c_invoice_id=?').get(Number(r.c_invoice_id));
          if (inv && Number(inv.c_bpartner_id) !== Number(r.c_bpartner_id)) return 'BPDifferentFromBPInvoice';
        }
        if (Number(r.c_order_id) > 0) {
          var ord = db.prepare('SELECT c_bpartner_id FROM c_order WHERE c_order_id=?').get(Number(r.c_order_id));
          if (ord && Number(ord.c_bpartner_id) !== Number(r.c_bpartner_id)) return 'BPDifferentFromBPOrder';
        }
        return null;
      }]
      // :751-761 prepay resets (no prepayment in seed) · :758-762 setDocumentNo (write-path numbering) ·
      // :808-830 credit-card encryption (crypto write-path) = named residuals.
    ];
    H.forEach(function (h) { registerValidator('C_Payment', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMMovementSaveHooks(db) — faithful port of MMovement.beforeSave (MMovement.java:210-224).
  function installMMovementSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    var H = [
      ['MMovement.docTypeDefault', function (ctx, info) {    // :212-222 ∘ MDocType.getOfDocBaseType:68-77 — first MMM doctype
        var r = info.record;
        if (Number(r.c_doctype_id) > 0) return null;
        var dt = db.prepare("SELECT c_doctype_id FROM c_doctype WHERE docbasetype='MMM' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id").get();
        if (!dt) return 'NotFound C_DocType_ID';             // :218-221 (unreachable in this seed — MMM exists)
        d(info).c_doctype_id = dt.c_doctype_id;
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('M_Movement', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // ── H2_ISOMORPH_TAIL beforeSave ports (prompts/H2_ISOMORPH_TAIL.md) — ADDITIVE, one installer per
  // class, every hook citing its Java lines; same derived/warnings seam as the H-1/H-2 installers. ──────

  // shared cent-exact add (REAL columns; the balances are 2dp money columns)
  function addMoney(a, b) { return (Math.round(Number(a || 0) * 100) + Math.round(Number(b || 0) * 100)) / 100; }
  // shared standard-period lookup (MPeriod.getC_Period_ID: the client-calendar period containing the date)
  function periodOf(db, date) {
    if (date == null || date === '') return null;
    var d = String(date).slice(0, 10);
    return db.prepare("SELECT c_period_id FROM c_period WHERE periodtype='S' AND date(?)>=date(startdate) AND date(?)<=date(enddate) ORDER BY c_period_id").get(d, d);
  }

  // installMJournalSaveHooks(db) — faithful port of MJournal.beforeSave (MJournal.java:298-380).
  function installMJournalSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function chg(info, col) { return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col])); }
    var H = [
      ['MJournal.parentNotProcessed', function (ctx, info) { // :300-306 new journal in a Processed batch → reject
        var r = info.record;
        if (info.recordOld || !(Number(r.gl_journalbatch_id) > 0)) return null;
        var b = db.prepare('SELECT processed FROM gl_journalbatch WHERE gl_journalbatch_id=?').get(Number(r.gl_journalbatch_id));
        return (b && b.processed === 'Y') ? 'ParentComplete GL_JournalBatch_ID' : null;
      }],
      ['MJournal.dateDocDefault', function (ctx, info) {     // :308-315 DateDoc ← DateAcct (the today-arm needs the clock — named)
        var r = info.record;
        if ((r.datedoc == null || r.datedoc === '') && r.dateacct != null && r.dateacct !== '') d(info).datedoc = r.dateacct;
        return null;
      }],
      ['MJournal.dateAcctDefault', function (ctx, info) {    // :316-321 DateAcct ← DateDoc
        var r = info.record;
        if (r.dateacct == null || r.dateacct === '') d(info).dateacct = r.datedoc;
        return null;
      }],
      ['MJournal.periodValidate', function (ctx, info) {     // :322-338 PeriodNotFound reject + standard-period reassign
        var r = info.record;
        if (r.processed === 'Y') return null;
        var da = (info.derived && info.derived.dateacct) != null ? info.derived.dateacct : r.dateacct;
        var p = periodOf(db, da);
        if (!p) return 'PeriodNotFound: ' + da;
        if (Number(p.c_period_id) !== Number(r.c_period_id)) {  // :333-337 reassign ONLY off a standard period
          var cur = db.prepare('SELECT periodtype FROM c_period WHERE c_period_id=?').get(Number(r.c_period_id));
          if (!cur || cur.periodtype === 'S') d(info).c_period_id = Number(p.c_period_id);
        }
        return null;
      }],
      ['MJournal.glCategoryDefault', function (ctx, info) {  // :340-342 GL_Category ← doctype's
        var r = info.record;
        if (Number(r.gl_category_id) > 0 || !(Number(r.c_doctype_id) > 0)) return null;
        var dt = db.prepare('SELECT gl_category_id FROM c_doctype WHERE c_doctype_id=?').get(Number(r.c_doctype_id));
        if (dt && Number(dt.gl_category_id) > 0) d(info).gl_category_id = Number(dt.gl_category_id);
        return null;
      }],
      ['MJournal.acctSchemaDefault', function (ctx, info) {  // :343-345 C_AcctSchema ← client's primary
        var r = info.record;
        if (Number(r.c_acctschema_id) > 0) return null;
        var ci = db.prepare('SELECT c_acctschema1_id FROM ad_clientinfo WHERE ad_client_id=?').get(Number(r.ad_client_id));
        if (ci) d(info).c_acctschema_id = Number(ci.c_acctschema1_id);
        return null;
      }],
      ['MJournal.conversionTypeDefault', function (ctx, info) {  // :346-348 ∘ MConversionType.getDefault — IsDefault row
        var r = info.record;
        if (Number(r.c_conversiontype_id) > 0) return null;
        var ct = db.prepare("SELECT c_conversiontype_id FROM c_conversiontype WHERE isdefault='Y' ORDER BY c_conversiontype_id").get();
        if (ct) d(info).c_conversiontype_id = Number(ct.c_conversiontype_id);
        return null;
      }],
      ['MJournal.processedDocFrozen', function (ctx, info) { // :350-370 IDEMPIERE-63 doctype/date frozen once ProcessedOn
        if (!info.recordOld || !(Number(info.recordOld.processedon) > 0)) return null;
        var prev = db.prepare('SELECT isoverwriteseqoncomplete,isoverwritedateoncomplete FROM c_doctype WHERE c_doctype_id=?').get(Number(info.recordOld.c_doctype_id));
        if (chg(info, 'c_doctype_id') && prev && prev.isoverwriteseqoncomplete === 'Y') return 'CannotChangeProcessedDocType';
        if (chg(info, 'datedoc') && prev && prev.isoverwritedateoncomplete === 'Y') return 'CannotChangeProcessedDate';
        return null;
      }]
      // :372-379 DateAcct propagation to lines = write-path (UPDATE GL_JournalLine) — named residual.
    ];
    H.forEach(function (h) { registerValidator('GL_Journal', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMJournalBatchSaveHooks(db) — faithful port of MJournalBatch.beforeSave (MJournalBatch.java:946-978):
  // the SAME date-default + period-validate spine as the journal, nothing else (batch = header-of-headers).
  function installMJournalBatchSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    var H = [
      ['MJournalBatch.dateDocDefault', function (ctx, info) {   // :948-955 DateDoc ← DateAcct (today-arm named)
        var r = info.record;
        if ((r.datedoc == null || r.datedoc === '') && r.dateacct != null && r.dateacct !== '') d(info).datedoc = r.dateacct;
        return null;
      }],
      ['MJournalBatch.dateAcctDefault', function (ctx, info) {  // :956-961 DateAcct ← DateDoc
        var r = info.record;
        if (r.dateacct == null || r.dateacct === '') d(info).dateacct = r.datedoc;
        return null;
      }],
      ['MJournalBatch.periodValidate', function (ctx, info) {   // :962-977 PeriodNotFound + standard-period reassign
        var r = info.record;
        if (r.processed === 'Y') return null;
        var da = (info.derived && info.derived.dateacct) != null ? info.derived.dateacct : r.dateacct;
        var p = periodOf(db, da);
        if (!p) return 'PeriodNotFound: ' + da;
        if (Number(p.c_period_id) !== Number(r.c_period_id)) {
          var cur = db.prepare('SELECT periodtype FROM c_period WHERE c_period_id=?').get(Number(r.c_period_id));
          if (!cur || cur.periodtype === 'S') d(info).c_period_id = Number(p.c_period_id);
        }
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('GL_JournalBatch', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMAllocationHdrSaveHooks(db) — faithful port of MAllocationHdr.beforeSave (MAllocationHdr.java:305-313).
  // K=1 IS the whole override: the IsActive re-activation guard. STATED, not padded.
  function installMAllocationHdrSaveHooks(db) {
    function chg(info, col) { return !!(info.recordOld && info.record && String(info.recordOld[col]) !== String(info.record[col])); }
    var H = [
      ['MAllocationHdr.noReactivate', function (ctx, info) {  // :307-312 deactivated allocation cannot be re-activated
        if (info.recordOld && chg(info, 'isactive') && info.record.isactive === 'Y') return 'Cannot Re-Activate deactivated Allocations';
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('C_AllocationHdr', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMCashSaveHooks(db) — faithful port of MCash.beforeSave (MCash.java:321-331).
  function installMCashSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    var H = [
      ['MCash.orgFromCashbook', function (ctx, info) {       // :323-328 AD_Org ← cashbook's; 0 → reject @AD_Org_ID@
        var r = info.record;
        var cb = db.prepare('SELECT ad_org_id FROM c_cashbook WHERE c_cashbook_id=?').get(Number(r.c_cashbook_id));
        var org = cb ? Number(cb.ad_org_id) : 0;
        if (org === 0) return 'AD_Org_ID mandatory (cashbook org is 0)';
        if (org !== Number(r.ad_org_id)) d(info).ad_org_id = org;
        return null;
      }],
      ['MCash.endingBalance', function (ctx, info) {         // :330 EndingBalance = Beginning + StatementDifference
        var r = info.record;
        var end = addMoney(r.beginningbalance, r.statementdifference);
        if (end !== Number(r.endingbalance)) d(info).endingbalance = end;
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('C_Cash', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMBankStatementSaveHooks(db) — faithful port of MBankStatement.beforeSave (MBankStatement.java:258-272).
  function installMBankStatementSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    var H = [
      ['MBankStatement.docTypeDefault', function (ctx, info) {  // :260-262 ∘ MDocType.getDocType(CMB)
        var r = info.record;
        if (Number(r.c_doctype_id) > 0) return null;
        var dt = db.prepare("SELECT c_doctype_id FROM c_doctype WHERE docbasetype='CMB' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id").get();
        if (dt) d(info).c_doctype_id = Number(dt.c_doctype_id);
        return null;
      }],
      ['MBankStatement.beginningBalance', function (ctx, info) {  // :264-269 ← bank account CurrentBalance (unprocessed + zero)
        var r = info.record;
        if (r.processed === 'Y' || Number(r.beginningbalance) !== 0) return null;
        var ba = db.prepare('SELECT currentbalance FROM c_bankaccount WHERE c_bankaccount_id=?').get(Number(r.c_bankaccount_id));
        if (ba && Number(ba.currentbalance) !== 0) d(info).beginningbalance = Number(ba.currentbalance);
        return null;
      }],
      ['MBankStatement.endingBalance', function (ctx, info) {  // :271 Ending = Beginning(+derived) + StatementDifference
        var r = info.record;
        var beg = (info.derived && info.derived.beginningbalance != null) ? info.derived.beginningbalance : r.beginningbalance;
        var end = addMoney(beg, r.statementdifference);
        if (end !== Number(r.endingbalance)) d(info).endingbalance = end;
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('C_BankStatement', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMRMASaveHooks(db) — faithful port of MRMA.beforeSave (MRMA.java:256-297). The shipment
  // (m_rma.inout_id → m_inout, captured FULL) is the derive source for BP/currency/salesrep.
  function installMRMASaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    function shipment(r) { return Number(r.inout_id) > 0 ? db.prepare('SELECT c_bpartner_id,c_order_id,c_invoice_id,issotrx,salesrep_id FROM m_inout WHERE m_inout_id=?').get(Number(r.inout_id)) : null; }
    var H = [
      ['MRMA.orderCleared', function (ctx, info) {           // :258-259 a NEW RMA never carries C_Order_ID
        if (!info.recordOld && Number(info.record.c_order_id) !== 0) d(info).c_order_id = 0;
        return null;
      }],
      ['MRMA.bpFromShipment', function (ctx, info) {         // :262-266 BP ← shipment's
        var r = info.record, io = shipment(r);
        if (!(Number(r.c_bpartner_id) > 0) && io && Number(io.c_bpartner_id) > 0) d(info).c_bpartner_id = Number(io.c_bpartner_id);
        return null;
      }],
      ['MRMA.currencyFromShipment', function (ctx, info) {   // :268-283 currency ← order else invoice (through the shipment)
        var r = info.record, io = shipment(r);
        if (Number(r.c_currency_id) > 0 || !io) return null;
        if (Number(io.c_order_id) > 0) {
          var o = db.prepare('SELECT c_currency_id FROM c_order WHERE c_order_id=?').get(Number(io.c_order_id));
          if (o) d(info).c_currency_id = Number(o.c_currency_id);
        } else if (Number(io.c_invoice_id) > 0) {
          var inv = db.prepare('SELECT c_currency_id FROM c_invoice WHERE c_invoice_id=?').get(Number(io.c_invoice_id));
          if (inv) d(info).c_currency_id = Number(inv.c_currency_id);
        }
        return null;
      }],
      ['MRMA.soTrxMatchesShipment', function (ctx, info) {   // :285-290 RMA.IsSOTrx must equal InOut.IsSOTrx → reject
        var r = info.record, io = shipment(r);
        return (io && io.issotrx !== r.issotrx) ? 'RMA.IsSOTrx <> InOut.IsSOTrx' : null;
      }],
      ['MRMA.salesRepFromShipment', function (ctx, info) {   // :292-295 SalesRep ← shipment's (when set there)
        var r = info.record, io = shipment(r);
        if (!(Number(r.salesrep_id) > 0) && io && Number(io.salesrep_id) > 0) d(info).salesrep_id = Number(io.salesrep_id);
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('M_RMA', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // installMRequisitionSaveHooks(db) — faithful port of MRequisition.beforeSave (MRequisition.java:198-203
  // ∘ MPriceList.getDefault:111-140: IsDefault='Y' + IsSOPriceList=N first, FALLBACK to the SO default).
  // K=1 IS the whole override. (MTimeExpense has NO beforeSave override — no installer exists, stated.)
  function installMRequisitionSaveHooks(db) {
    function d(info) { return (info.derived = info.derived || {}); }
    var H = [
      ['MRequisition.priceListDefault', function (ctx, info) {
        var r = info.record;
        if (Number(r.m_pricelist_id) > 0) return null;
        var pl = db.prepare("SELECT m_pricelist_id FROM m_pricelist WHERE isdefault='Y' AND issopricelist='N' AND isactive='Y' ORDER BY m_pricelist_id").get()
              || db.prepare("SELECT m_pricelist_id FROM m_pricelist WHERE isdefault='Y' AND issopricelist='Y' AND isactive='Y' ORDER BY m_pricelist_id").get();
        if (pl) d(info).m_pricelist_id = Number(pl.m_pricelist_id);
        return null;
      }]
    ];
    H.forEach(function (h) { registerValidator('M_Requisition', 'BEFORE_SAVE', h[0], h[1]); });
    return H.length;
  }

  // fireHooks(timing, info, ctx) — run every validator registered for (info.table, timing) IN ORDER; the
  // FIRST non-null error aborts (the iDempiere fireModelChange/fireDocValidate semantics). Returns
  // { timing, table, fired, ok, blocked?, error? }.
  function fireHooks(timing, info, ctx) {
    ctx = ctx || {};
    var t = (info.table || '').toLowerCase();
    var hooks = (REGISTRY[t] && REGISTRY[t][timing]) || [];
    for (var i = 0; i < hooks.length; i++) {
      var err;
      try { err = hooks[i].fn(ctx, info); }
      catch (e) { err = 'hook threw: ' + (e && e.message); }
      if (err) return { timing: timing, table: info.table, fired: i + 1, ok: false, blocked: hooks[i].name, error: err };
    }
    return { timing: timing, table: info.table, fired: hooks.length, ok: true };
  }

  // hooksFor(table) — which timings carry a hook (coverage introspection).
  function hooksFor(table) {
    var t = (table || '').toLowerCase(), r = REGISTRY[t] || {}, out = {};
    Object.keys(r).forEach(function (ti) { out[ti] = r[ti].map(function (h) { return h.name; }); });
    return out;
  }

  var API = {
    TIMINGS: TIMINGS, REGISTRY: REGISTRY, registerValidator: registerValidator, registeredCount: registeredCount,
    readValidators: readValidators, installDefaultHooks: installDefaultHooks,
    installMOrderSaveHooks: installMOrderSaveHooks, fireHooks: fireHooks, hooksFor: hooksFor,
    installMInOutSaveHooks: installMInOutSaveHooks, installMInvoiceSaveHooks: installMInvoiceSaveHooks,
    installMPaymentSaveHooks: installMPaymentSaveHooks, installMMovementSaveHooks: installMMovementSaveHooks,
    installMJournalSaveHooks: installMJournalSaveHooks, installMJournalBatchSaveHooks: installMJournalBatchSaveHooks,
    installMAllocationHdrSaveHooks: installMAllocationHdrSaveHooks, installMCashSaveHooks: installMCashSaveHooks,
    installMBankStatementSaveHooks: installMBankStatementSaveHooks, installMRMASaveHooks: installMRMASaveHooks,
    installMRequisitionSaveHooks: installMRequisitionSaveHooks
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdModelVal = API;                   // browser
  else if (global) global.AdModelVal = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
