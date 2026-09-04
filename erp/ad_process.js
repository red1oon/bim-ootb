// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_process.js — AD_Process dispatch spine (W-PROC). The "SvrProcess runner" leg of the
// coverage matrix: read AD_Process + AD_Process_Para, resolve classname against a small JS
// HANDLER REGISTRY, validate the supplied params against the para rows, run the handler, log.
// Self-contained, no kernel dep (mirrors ad_access.js / ad_evaluator.js shape).
// Implementing ERP_COVERAGE_MATRIX.md §AD_Process — Witness: W-PROC
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPEC (EXTRACT, do NOT invent) — the process rows + params ARE the data; this engine only dispatches them.
//   AD_Process / AD_Process_Para come from build/erp/ad_full.db (lowercase: ad_process, ad_process_para).
//   We DO NOT port the 476 Java SvrProcess classes (54k LOC) — we build the *mechanism* (AD-row →
//   classname → registered JS handler → result), and the report handlers RESOLVE TO report_overlay.js's
//   existing folds (foldReceipt/foldTrialBalance/foldPnL) rather than reinventing them. Unported classnames
//   return an explicit "absent handler" result (NOT a silent no-op) — the matrix counts dispatched vs total.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// Java home — iDempiere dispatch semantics, ported faithfully (cited by line range):
//   - org.adempiere.util.ProcessUtil.startJavaProcess (ProcessUtil.java:156-205):
//       className = pi.getClassName();  process = Core.getProcess(className);
//       if (process == null) -> pi.setSummary("Failed to create new process instance for "+className, true);
//                               return false;                  ← our "absent-handler" branch (the §FALSIFIER)
//       else success = process.startProcess(ctx, pi, trx);
//   - org.compiere.process.SvrProcess.startProcess (SvrProcess.java:132-232) -> process() (238) ->
//       prepare() (346, reads getParameter() at 328/582) -> doIt() (the body). We mirror prepare→doIt:
//       validate params (prepare) THEN run the handler (doIt).
//   - org.compiere.process.ProcessInfo: getAD_Process_ID (517), getClassName (535), getParameter (717) —
//       the carrier we model as { AD_Process_ID, classname, params:{} }.
//   - org.compiere.process.DocumentEngine.processIt (DocumentEngine.java:305-) — the doc-action dispatch
//       table (ACTION_Complete/Post/ReActivate/…); our doc-action handlers mirror the action→method routing.
//   Param type validation mirrors GridField/DisplayType off ad_process_para.ad_reference_id
//     (ad_reference: 10/14=String/Text, 11=Integer, 12=Amount, 22=Number, 29=Quantity, 15/16=Date,
//      17=List, 18/19=Table[Direct], 13=ID, 20=Yes-No, 28=Button).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // ── ad_reference_id → coarse JS type class (DisplayType buckets we can validate headless) ──────────────
  var REF_TYPE = {
    10: 'string', 14: 'string',                                  // String / Text
    11: 'integer', 13: 'integer', 18: 'integer', 19: 'integer',  // Integer / ID / Table / TableDirect (all *_ID)
    12: 'number', 22: 'number', 29: 'number',                    // Amount / Number / Quantity
    15: 'date', 16: 'date',                                      // Date / Date+Time
    17: 'list', 20: 'yesno', 28: 'button'
  };
  function refType(ad_reference_id) { return REF_TYPE[Number(ad_reference_id)] || 'string'; }

  // typeOk — does a supplied value satisfy the para's reference type? (prepare-time shape check, faithful
  // to the coarse DisplayType validation; FK membership / list-validation are named-deferred like crud_overlay).
  function typeOk(type, v) {
    if (v == null || v === '') return true;                      // emptiness is a mandatory concern, handled separately
    switch (type) {
      case 'integer': return Number.isFinite(Number(v)) && Math.floor(Number(v)) === Number(v);
      case 'number':  return Number.isFinite(Number(v));
      case 'date':    return !isNaN(Date.parse(String(v))) || /^\d{4}-\d{2}-\d{2}/.test(String(v));
      case 'yesno':   return v === 'Y' || v === 'N' || v === true || v === false;
      default:        return true;                               // string/list/button: accept (list values are AD-checked elsewhere)
    }
  }

  // ── HANDLER REGISTRY — classname (or report-key) → JS handler ─────────────────────────────────────────
  // Each handler: function(ctx, info) -> { ok, message, rows, result }. ctx carries data accessors the
  // handler needs (e.g. ctx.report = report_overlay CORE, ctx.fetch = a row-fetcher) so the spine stays
  // data-source-agnostic (node witness injects sqlite fetchers; browser injects the bundle).
  // REPORT handlers resolve to report_overlay.js folds — NOT reinvented here.
  var REGISTRY = {};

  // registerHandler(classname, fn[, meta]) — meta.kind ∈ {report, docaction}; meta.reportKey wires to REPORT_MAP.
  function registerHandler(classname, fn, meta) {
    REGISTRY[classname] = { fn: fn, meta: meta || {} };
  }
  function hasHandler(classname) { return !!REGISTRY[classname]; }
  function registeredClassnames() { return Object.keys(REGISTRY); }

  // ── Default registry: the report/fold procs (resolve to report_overlay) + a few doc-action procs ───────
  // These keys are the REAL classnames / report-keys found in ad_full.db (see scripts/poc_proc.js audit):
  //   110 Rpt C_Order  (classname '' , report)  -> report:c_order  (foldReceipt)
  //   116 Rpt C_Invoice(classname '' , report)  -> report:c_invoice(foldReceipt)
  //   310 FinTrialBalance  classname org.compiere.report.TrialBalance -> foldTrialBalance
  //   175 Fact_Acct_Reset  classname org.compiere.process.FactAcctReset  -> doc-action (resubmit posting)
  //   233 DocumentTypeVerify classname org.compiere.process.DocumentTypeVerify -> doc-action (verify)
  // A report proc with a blank classname is dispatched by a synthesized "report:<headerTable>" key
  // (resolveClassname below), exactly the JASPER_STARTER fallback shape in ProcessUtil:158-162.
  function installDefaultHandlers(reportCore) {
    var RC = reportCore || null;

    // report:c_order / report:c_invoice — fold ONE document's receipt via report_overlay.foldReceipt.
    function receiptHandler(reportKey) {
      return function (ctx, info) {
        if (!RC || typeof RC.foldReceipt !== 'function') return { ok: false, message: 'report core unavailable', rows: 0 };
        var map = RC.REPORT_MAP[reportKey];
        var hdr = ctx.fetchHeader ? ctx.fetchHeader(reportKey, info) : null;
        var lines = ctx.fetchLines ? ctx.fetchLines(reportKey, info) : [];
        if (!hdr) return { ok: false, message: 'no header row for ' + reportKey, rows: 0 };
        var rec = RC.foldReceipt(map, hdr, lines, ctx.names ? ctx.names(reportKey, hdr, lines) : {});
        return { ok: true, message: 'receipt folded', rows: rec.lines.length, result: rec };
      };
    }
    registerHandler('report:c_order',   receiptHandler('c_order'),   { kind: 'report', reportKey: 'c_order' });
    registerHandler('report:c_invoice', receiptHandler('c_invoice'), { kind: 'report', reportKey: 'c_invoice' });
    // report:m_inout — "Rpt M_InOut" (AD_Process 117, "Delivery Note / Shipment Print"). KIND-1, the print
    // sibling of InOutGenerate (§P2-leg1 makes the M_InOut; this prints it). Folds via the SAME foldReceipt over
    // the ALREADY-PRESENT REPORT_MAP.m_inout — ZERO new fold code. A shipment is a NON-FINANCIAL document
    // (amount:null → subtotal/tax/total stay null, qty=MovementQty carried) — honest, never a fabricated total.
    // AD_PROCESS_FOLD_LANE §P2-tail-leg1 — Witness: W-PROC-MINOUT.
    registerHandler('report:m_inout',   receiptHandler('m_inout'),   { kind: 'report', reportKey: 'm_inout' });
    // report:m_inoutconfirm — "Rpt M_InOutConfirm" (AD_Process 292, "Shipment Confirmation"). KIND-1, the LINE-SORT +
    // PRODUCT-JOIN variant (AD_PROCESS_FOLD_LANE §P2-tail-leg6): the confirm-line m_inoutlineconfirm has no `line` col
    // and no m_product_id → REPORT_MAP.m_inoutconfirm carries lineSort + lineProductVia, and the db-aware ctx
    // (host _procCtx / witness) resolves the ORDER BY + the parent-line product join before folding. foldReceipt is
    // UNCHANGED — NO new fold verb. A confirmation is NON-FINANCIAL (qty=ConfirmedQty; partner/total/amount/price null).
    registerHandler('report:m_inoutconfirm', receiptHandler('m_inoutconfirm'), { kind: 'report', reportKey: 'm_inoutconfirm' });
    // report:m_movement — "Rpt M_Movement" (AD_Process 290, "Inventory Move Print"). KIND-1, the warehouse sibling
    // of report:m_inout (AD_PROCESS_FOLD_LANE §P2-tail-leg2): folds an M_Movement → a NON-FINANCIAL receipt via the
    // SAME report_overlay.foldReceipt over REPORT_MAP.m_movement — ZERO new fold code, zero host change.
    registerHandler('report:m_movement',receiptHandler('m_movement'),{ kind: 'report', reportKey: 'm_movement' });
    // report:m_inventory — "Rpt M_Inventory" (AD_Process 291, "Physical Inventory Print"). KIND-1, the third
    // inventory-document print (AD_PROCESS_FOLD_LANE §P2-tail-leg3): folds an M_Inventory → a NON-FINANCIAL receipt
    // (qty=QtyCount) via the SAME report_overlay.foldReceipt over REPORT_MAP.m_inventory — ZERO new fold code.
    registerHandler('report:m_inventory',receiptHandler('m_inventory'),{ kind: 'report', reportKey: 'm_inventory' });
    // report:pp_order — "Rpt PP_Order" (AD_Process 53028, "Manufacturing Order"). KIND-1, a 4th document family
    // (manufacturing, AD_PROCESS_FOLD_LANE §P2-tail-leg4): folds a PP_Order → a NON-FINANCIAL receipt (qty=
    // QtyRequiered over PP_Order_BOMLine) via the SAME report_overlay.foldReceipt — ZERO new fold code.
    registerHandler('report:pp_order',  receiptHandler('pp_order'),  { kind: 'report', reportKey: 'pp_order' });
    // report:c_project — "Rpt C_Project" (AD_Process 217, Project Print). KIND-1, folds via the SAME foldReceipt
    // (REPORT_MAP.c_project), no new fold code. AD_PROCESS_FOLD_LANE §P2-leg3 — Witness: W-PROC-PROJPRINT.
    registerHandler('report:c_project', receiptHandler('c_project'), { kind: 'report', reportKey: 'c_project' });
    // report:c_payment — "Rpt C_Payment" (AD_Process 313, "Payment Print"). KIND-1, but a HEADER-ONLY financial
    // document (a payment has NO line table) → folded via report_overlay.foldVoucher, NOT foldReceipt (whose
    // subtotal=Σline model would yield tax=PayAmt on an unapplied payment). AD_PROCESS_FOLD_LANE §P2-tail-leg5.
    function voucherHandler(reportKey) {
      return function (ctx, info) {
        if (!RC || typeof RC.foldVoucher !== 'function') return { ok: false, message: 'report core unavailable', rows: 0 };
        var map = RC.REPORT_MAP[reportKey];
        var hdr = ctx.fetchHeader ? ctx.fetchHeader(reportKey, info) : null;
        if (!hdr) return { ok: false, message: 'no header row for ' + reportKey, rows: 0 };
        var rec = RC.foldVoucher(map, hdr, ctx.names ? ctx.names(reportKey, hdr, []) : {});
        return { ok: true, message: 'voucher folded', rows: 0, result: rec };
      };
    }
    registerHandler('report:c_payment', voucherHandler('c_payment'), { kind: 'report', reportKey: 'c_payment' });

    // org.compiere.report.TrialBalance -> report_overlay.foldTrialBalance over the posted journal.
    registerHandler('org.compiere.report.TrialBalance', function (ctx, info) {
      if (!RC || typeof RC.foldTrialBalance !== 'function') return { ok: false, message: 'report core unavailable', rows: 0 };
      var facts = ctx.fetchFacts ? ctx.fetchFacts(info) : [];
      var accts = ctx.fetchAccounts ? ctx.fetchAccounts() : {};
      var tb = RC.foldTrialBalance(facts, accts);
      return { ok: true, message: 'trial balance: balanced=' + tb.balanced, rows: tb.lines.length, result: tb };
    }, { kind: 'report' });

    // doc-action: FactAcctReset (Resubmit Posting) — mirrors DocumentEngine ACTION_Post re-queue. The spine
    // proves the dispatch + param validate; the actual GL re-derivation is the named-deferred Doc_* corpus.
    registerHandler('org.compiere.process.FactAcctReset', function (ctx, info) {
      var n = ctx.countFacts ? ctx.countFacts(info) : 0;
      return { ok: true, message: 'posting reset queued (rows marked for re-post)', rows: n, result: { action: 'Post-reset', queued: n } };
    }, { kind: 'docaction', action: 'Post' });

    // doc-action: DocumentTypeVerify — mirrors a verify SvrProcess; counts the rows it would check.
    registerHandler('org.compiere.process.DocumentTypeVerify', function (ctx, info) {
      var n = ctx.countDocTypes ? ctx.countDocTypes() : 0;
      return { ok: true, message: 'document types verified', rows: n, result: { verified: n } };
    }, { kind: 'docaction', action: 'Verify' });
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // KIND-2 process handler — ProjectGenOrder (AD_Process 164 "Generate Order", classname
  //   org.compiere.process.ProjectGenOrder, isReport=N, 0 params). The effect IS an engine verb: ASSEMBLE a
  //   C_Order op-group via the EXISTING erp_engine.buildDoc archetype — newVerbs=0, NOT a Java port.
  // Java home (EXTRACT, do NOT invent):
  //   org.compiere.process.ProjectGenOrder.doIt (ProjectGenOrder.java:62-111) — generates a SALES order
  //     (Env.setSOTrx(ctx,true); class doc "Generate Sales Order from Project"), ONE C_OrderLine per
  //     C_ProjectLine: Qty = PlannedQty − InvoicedQty (line 96); Price = PlannedPrice when non-zero, else the
  //     price-list price (ol.setPrice() = MProductPricing — NAMED-DEFERRED, like crud_overlay's FK membership).
  //   org.compiere.model.MOrder(MProject,IsSOTrx,DocSubTypeSO) (MOrder.java:487-522) — the header: SO on the
  //     On-Credit doctype (DocSubTypeSO_OnCredit="WI", MOrder.java:654); BP/BP-Loc/User/SalesRep/Campaign/
  //     Warehouse/PriceList/PaymentTerm copied from the project; description=project name; dateordered=
  //     datecontract, datepromised=datefinish.
  //   ProjectGenOrder.getProject (line 120-132) — GATES on M_PriceList_Version + M_Warehouse + C_BPartner +
  //     C_BPartner_Location, throwing IllegalArgumentException otherwise. We mirror that as an HONEST
  //     'project-not-ready' rejection (NOT a fabricated order) — the HONESTY INVARIANT for thin/PoC seeds.
  //   MProject.getM_PriceList_ID (MProject.java:168-178) — pricelist = the version's M_PriceList_ID (resolved
  //     by the host fetcher, keeping this module DB-agnostic).
  // Implementing AD_PROCESS_FOLD_LANE.md §P1 — Witness: W-PROC-GENPO
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════

  // projectGenGate — ProjectGenOrder.getProject's four IllegalArgumentException checks, as a returnable verdict.
  function projectGenGate(p) {
    if (!p || !p.c_project_id)                       return { ok: false, missing: 'C_Project_ID',          message: 'Project not found' };
    if (!p.m_pricelist_version_id)                   return { ok: false, missing: 'M_PriceList_Version_ID', message: 'Project has no Price List' };
    if (!p.m_warehouse_id)                           return { ok: false, missing: 'M_Warehouse_ID',         message: 'Project has no Warehouse' };
    if (!p.c_bpartner_id || !p.c_bpartner_location_id) return { ok: false, missing: 'C_BPartner(_Location)_ID', message: 'Project has no Business Partner/Location' };
    return { ok: true };
  }

  // genOrderLines — per C_ProjectLine → the order-line shape: Qty = PlannedQty − InvoicedQty; PriceActual =
  // PlannedPrice when non-zero (the price-list branch is named-deferred → priceactual:null = "from price list").
  // No money arithmetic here (qty/price are carried verbatim from the source row; the kernel does the cent math
  // via bigdecimal.js downstream) — staging only, EXTRACT-not-invent.
  function genOrderLines(lines) {
    return (lines || []).map(function (l) {
      var qty = Number(l.plannedqty || 0) - Number(l.invoicedqty || 0);
      var fromPlanned = Number(l.plannedprice || 0) !== 0;
      return {
        c_projectline_id: l.c_projectline_id, m_product_id: l.m_product_id,
        qtyordered: qty, line: l.line, description: l.description,
        priceactual: fromPlanned ? l.plannedprice : null, _priceFromPlanned: fromPlanned
      };
    });
  }

  // GENORDER_SPEC — the buildDoc archetype spec for a project→SalesOrder fold (table-parameterised, no new verb).
  var GENORDER_SPEC = {
    docTable: 'C_Order', lineTable: 'C_OrderLine',
    parentId: 'c_project_id', lineParentId: 'c_projectline_id',
    qtyTo: 'qtyordered', qtyFrom: 'qtyordered',
    header: function (p) {
      return {
        issotrx: 'Y', docsubtypeso: 'WI',                 // SO, On-Credit (MOrder.DocSubTypeSO_OnCredit)
        c_doctypetarget_id: p._c_doctypetarget_id || null, // resolved on-credit SO doctype (host-supplied)
        ad_client_id: p.ad_client_id, ad_org_id: p.ad_org_id,
        c_bpartner_id: p.c_bpartner_id, c_bpartner_location_id: p.c_bpartner_location_id,
        ad_user_id: p.ad_user_id, salesrep_id: p.salesrep_id, c_campaign_id: p.c_campaign_id,
        m_warehouse_id: p.m_warehouse_id, m_pricelist_id: p.m_pricelist_id,
        c_paymentterm_id: p.c_paymentterm_id,
        description: p.name, dateordered: p.datecontract, datepromised: p.datefinish,
        c_project_id: p.c_project_id
      };
    }
  };

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // KIND-2 process handler — InOutGenerate (AD_Process 118/199 "Generate Shipments", classname
  //   org.compiere.process.InOutGenerate, isReport=N). The order-to-cash sibling of ProjectGenOrder: a
  //   Completed Sales Order → an M_InOut (shipment) op-group via the EXISTING erp_engine.buildDoc archetype.
  // Java home (EXTRACT, do NOT invent) — org.compiere.process.InOutGenerate:
  //   doIt/generate — selects DocStatus='CO' AND IsSOTrx='Y' orders (line 158); per order line:
  //     toDeliver = QtyOrdered − QtyDelivered (line 278-279); SKIP if toDeliver.signum()==0 ("Nothing to
  //     Deliver", line 281-283) or over-delivered with QtyOrdered>0. The DeliveryRule then caps the qty:
  //       'F' Force        → deliver = toDeliver               (createLine force=true, line 408-416)
  //       'A' Availability → deliver = min(toDeliver, onHand)  (line 397-405: if deliver>onHand → deliver=onHand)
  //       'O' CompleteOrder / 'L' CompleteLine / 'M' Manual / '5' AfterPayment → NAMED-DEFERRED (not in this
  //         seed's data; honest deferral, NOT a silent skip — flagged in the result).
  //   createLine (line ~470-520) — the M_InOut header is new MInOut(order,...): warehouse/BPartner/BP-Location
  //     from the order, MovementType 'C-' (customer shipment, SO) / 'V+' (vendor receipt); MInOutLine.setOrderLine
  //     + setQty(deliver). EXACTLY the existing DOC_SPECS.createShipment shape (W-FOLD-BUILDDOC) — newVerbs=0.
  // Implementing AD_PROCESS_FOLD_LANE.md §P2 — Witness: W-PROC-SHIP
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════

  // inoutGenGate — InOutGenerate's selection predicate as a per-order verdict (DocStatus='CO' AND IsSOTrx='Y').
  function inoutGenGate(o) {
    if (!o || !o.c_order_id)  return { ok: false, missing: 'C_Order_ID', message: 'Order not found' };
    if (o.docstatus !== 'CO') return { ok: false, missing: 'DocStatus', message: 'Order is not Completed (Generate Shipments ships CO orders only)' };
    if (o.issotrx !== 'Y')    return { ok: false, missing: 'IsSOTrx',   message: 'Order is not a Sales Order (Generate Shipments is the SO path)' };
    return { ok: true };
  }

  // genShipmentLines — per C_OrderLine → the shipment-line shape: MovementQty = the DeliveryRule-capped toDeliver.
  // toDeliver = QtyOrdered − QtyDelivered (signum-0 → nothing to deliver → skip). onHandOf(productId)->qty is
  // host-injected (keeps this module DB-agnostic). Non-F/A rules are NAMED-DEFERRED (deferredRule carries the code).
  function genShipmentLines(orderLines, deliveryRule, onHandOf) {
    var out = [], deferredRule = null;
    (orderLines || []).forEach(function (l) {
      var toDeliver = Number(l.qtyordered || 0) - Number(l.qtydelivered || 0);
      if (toDeliver === 0) return;                                            // "Nothing to Deliver"
      if (toDeliver < 0 && Number(l.qtyordered || 0) > 0) return;             // over-delivered, ordered>0 → skip
      var deliver;
      if (deliveryRule === 'F') deliver = toDeliver;                          // Force
      else if (deliveryRule === 'A') {                                        // Availability — cap at on-hand
        var onHand = onHandOf ? Number(onHandOf(l.m_product_id) || 0) : 0;
        deliver = Math.min(toDeliver, onHand);
      } else { deferredRule = deliveryRule; return; }                         // O/L/M/5 — named-deferred (honest)
      if (deliver <= 0) return;
      out.push({ c_orderline_id: l.c_orderline_id, m_product_id: l.m_product_id, movementqty: deliver, line: l.line, toDeliver: toDeliver });
    });
    return { lines: out, deferredRule: deferredRule };
  }

  // SHIPMENT_SPEC — the buildDoc archetype spec for an order→shipment fold (the createShipment shape).
  var SHIPMENT_SPEC = {
    docTable: 'M_InOut', lineTable: 'M_InOutLine',
    parentId: 'c_order_id', lineParentId: 'c_orderline_id',
    qtyTo: 'movementqty', qtyFrom: 'movementqty',
    header: function (o) {
      return {
        issotrx: o.issotrx, movementtype: o.issotrx === 'Y' ? 'C-' : 'V+',
        ad_client_id: o.ad_client_id, ad_org_id: o.ad_org_id,
        c_bpartner_id: o.c_bpartner_id, c_bpartner_location_id: o.c_bpartner_location_id,
        m_warehouse_id: o.m_warehouse_id, c_order_id: o.c_order_id
      };
    }
  };

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // KIND-2 process handler — InvoiceGenerate (AD_Process 119 "Generate Invoices", classname
  //   org.compiere.process.InvoiceGenerate, isReport=N). The order-to-cash CLOSER + sibling of InOutGenerate: a
  //   Completed Sales Order → a C_Invoice (invoice) op-group via the EXISTING erp_engine.buildDoc archetype
  //   (KIND 2, newVerbs=0 — the DOC_SPECS.createInvoice shape). InvoiceRule is the sibling of DeliveryRule.
  // Java home (EXTRACT, do NOT invent) — org.compiere.process.InvoiceGenerate:
  //   doIt/generate — selects DocStatus IN('CO','CL') AND IsSOTrx='Y' orders that have a line with
  //     QtyOrdered<>QtyInvoiced (line 159/167/176). Then branches on the order's InvoiceRule (X_C_Order:1546-1552:
  //       'I' Immediate, 'D' AfterDelivery, 'O' AfterOrderDelivered, 'S' CustomerScheduleAfterDelivery):
  //       'I' Immediate → the DIRECT order-line fold (the "After Order Delivered, Immediate" else-branch,
  //          line 293-337): per order line toInvoice = QtyOrdered − QtyInvoiced (line 299); SKIP if
  //          toInvoice.signum()==0 AND M_Product_ID != 0 ("nothing to invoice", line 300-301); createLine
  //          (order,oLine,toInvoice,...) (line 325). EXACTLY the DOC_SPECS.createInvoice shape — newVerbs=0.
  //       'D'/'O'/'S' → invoice from SHIPMENT lines (order.getShipments(), line 271-291 / 340-360) or an
  //          MInvoiceSchedule (line 248-268). Those ride the SHIPMENT/SCHEDULE corpus (itself the InOutGenerate
  //          output) — NAMED-DEFERRED here (honest, flagged in the result), the same law as InOutGenerate's
  //          O/L/M/5 DeliveryRules. NOT a silent skip, NEVER a fabricated invoice.
  //   createLine (line 388-413) — m_invoice = new MInvoice(order,...): Bill BPartner/Location, PriceList,
  //     PaymentTerm, Currency, the SOO target doctype copied from the order; MInvoiceLine.setOrderLine +
  //     setQtyInvoiced(toInvoice). Header copied from the order EXACTLY like createShipment's M_InOut header.
  // Implementing AD_PROCESS_FOLD_LANE.md §P2-leg2 — Witness: W-PROC-INV
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════

  // invoiceGenGate — InvoiceGenerate's selection predicate as a per-order verdict (DocStatus IN('CO','CL') AND
  // IsSOTrx='Y'). The "has an un-invoiced line" requirement is enforced by the empty-result branch downstream.
  function invoiceGenGate(o) {
    if (!o || !o.c_order_id)                       return { ok: false, missing: 'C_Order_ID', message: 'Order not found' };
    if (o.docstatus !== 'CO' && o.docstatus !== 'CL') return { ok: false, missing: 'DocStatus', message: 'Order is not Completed/Closed (Generate Invoices invoices CO/CL orders only)' };
    if (o.issotrx !== 'Y')                         return { ok: false, missing: 'IsSOTrx',   message: 'Order is not a Sales Order (Generate Invoices is the SO path)' };
    return { ok: true };
  }

  // genInvoiceLines — per C_OrderLine → the invoice-line shape: QtyInvoiced = toInvoice (Immediate rule only).
  // toInvoice = QtyOrdered − QtyInvoiced (signum-0 with a product → "nothing to invoice" → skip, source line 300).
  // Non-Immediate rules ('D'/'O'/'S') invoice from the shipment/schedule corpus → NAMED-DEFERRED (deferredRule
  // carries the code), exactly InOutGenerate's non-F/A deferral. EXTRACT-not-invent (qty carried verbatim).
  function genInvoiceLines(orderLines, invoiceRule) {
    var out = [], deferredRule = null;
    if (invoiceRule !== 'I') {                                                 // D/O/S — shipment/schedule corpus
      return { lines: out, deferredRule: invoiceRule || null };               //   named-deferred (honest)
    }
    (orderLines || []).forEach(function (l) {
      var toInvoice = Number(l.qtyordered || 0) - Number(l.qtyinvoiced || 0);
      if (toInvoice === 0 && Number(l.m_product_id || 0) !== 0) return;        // "nothing to invoice" (source 300)
      if (toInvoice <= 0) return;                                              // over-invoiced / zero charge → skip
      out.push({ c_orderline_id: l.c_orderline_id, m_product_id: l.m_product_id, qtyinvoiced: toInvoice, line: l.line, toInvoice: toInvoice });
    });
    return { lines: out, deferredRule: deferredRule };
  }

  // INVOICE_SPEC — the buildDoc archetype spec for an order→invoice fold (the createInvoice shape). The header
  // is copied from the order EXACTLY like SHIPMENT_SPEC (Bill_Location is the invoice's C_BPartner_Location).
  var INVOICE_SPEC = {
    docTable: 'C_Invoice', lineTable: 'C_InvoiceLine',
    parentId: 'c_order_id', lineParentId: 'c_orderline_id',
    qtyTo: 'qtyinvoiced', qtyFrom: 'qtyinvoiced',
    header: function (o) {
      return {
        issotrx: o.issotrx,
        ad_client_id: o.ad_client_id, ad_org_id: o.ad_org_id,
        c_bpartner_id: o.c_bpartner_id,
        c_bpartner_location_id: o.bill_location_id || o.c_bpartner_location_id,  // MInvoice uses Bill_Location
        c_currency_id: o.c_currency_id, c_paymentterm_id: o.c_paymentterm_id,
        m_pricelist_id: o.m_pricelist_id, c_order_id: o.c_order_id
      };
    }
  };

  // registerInvoiceGenerate(engine) — wire the KIND-2 handler. ctx: fetchOrder(info)->C_Order row,
  //   fetchOrderLines(info)->C_OrderLine rows. info.Record_ID = the C_Order_ID.
  function registerInvoiceGenerate(engine) {
    registerHandler('org.compiere.process.InvoiceGenerate', function (ctx, info) {
      var order = ctx.fetchOrder ? ctx.fetchOrder(info) : null;
      var gate = invoiceGenGate(order);
      if (!gate.ok) return { ok: false, reason: 'order-not-invoiceable', message: gate.message, rows: 0, result: { gate: gate } };
      var built = genInvoiceLines(ctx.fetchOrderLines ? ctx.fetchOrderLines(info) : [], order.invoicerule);
      if (!built.lines.length) {
        // Honest empty — every ordered qty already invoiced (or the rule is named-deferred). NOT a fake invoice.
        return {
          ok: true, rows: 0,
          message: '@Created@ = 0' + (built.deferredRule ? ' (InvoiceRule ' + built.deferredRule + ' invoices from shipments/schedule — named-deferred)' : ' (nothing to invoice — ordered qty already invoiced)'),
          result: { ops: [], lineCount: 0, deferredRule: built.deferredRule }
        };
      }
      var ops = engine.buildDoc(INVOICE_SPEC, order, built.lines);
      var li = 0;
      ops.forEach(function (op) { if (op.op_type === 'CREATE_LINE') { op.line = built.lines[li++].line; } });
      return {
        ok: true, rows: built.lines.length,
        message: '@Created@ = 1 (' + built.lines.length + ' invoice line' + (built.lines.length === 1 ? '' : 's') + ')',
        // §KIND2-READBACK (prompts/AGENT_QUEUE.md §K2RB.4) — crudMap publishes the spec's OWN engine-internal→
        // real-column names so the commit seam can translate this op-group into the CRUD vocabulary
        // crud_core.listTip folds. buildDoc writes `source_id`/`source_line_id` (engine names, not columns);
        // the spec already knows the columns they stand for. EXTRACT — nothing new is decided here.
        result: { ops: ops, lineCount: built.lines.length, header: ops[0], issotrx: ops[0].issotrx, deferredRule: built.deferredRule,
                  crudMap: { docParent: INVOICE_SPEC.parentId, lineParent: INVOICE_SPEC.lineParentId } }
      };
    }, { kind: 'process', action: 'GenerateInvoice' });
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §Fix5 (prompts/ERP_P2P_INVOICE_MATCH.md §Fix5.3) — CreateFromInvoice (AD_Process 200143,
  //   value 'C_Invoice_CreateFromProcess', classname org.compiere.process.CreateFromInvoice, isReport=N,
  //   mandatory para C_Invoice_ID — all four read from ad_seed.db, not assumed). The P2P line-maker: it ADDS
  //   lines to an EXISTING drafted vendor invoice, so it is NOT a buildDoc archetype like InvoiceGenerate.
  //   This is the piece that unblocks M_MatchInv: erp_engine.completeInvoice already emits one M_MatchInv per
  //   invoice line carrying m_inoutline_id, and crud_overlay.completeFanoutInvoice already runs it live — the
  //   lane's measured `§INVOICE-FANOUT … lines=1 matchInvOps=0` was a line with no m_inoutline_id, because
  //   nothing could create one (AD_Field locks M_InOutLine_ID/C_OrderLine_ID IsReadOnly='Y' on AD_Tab 291 —
  //   a faithful port: in real iDempiere those columns are only ever set by THIS process).
  // Java home (EXTRACT, do NOT invent):
  //   CreateFromInvoice.createLines() — per selected row calls
  //     invoice.createLineFrom(C_OrderLine_ID, M_InOutLine_ID, M_RMALine_ID, M_Product_ID, C_UOM_ID, QtyEntered)
  //   MInvoice.createLineFrom (MInvoice.java:3262) — new MInvoiceLine, setQty(Qty)/setQtyInvoiced, resolve the
  //     receipt line, then invoiceLine.setShipLine(inoutLine) ("overwrites", its own comment).
  //   MInvoiceLine.setShipLine — the entire field-copy rule ported verbatim by shipLineFields() below.
  //   MInOutLine.sameOrderLineUOM() — C_OrderLine_ID > 0 && oLine.C_UOM_ID == sLine.C_UOM_ID.
  // Implementing ERP_P2P_INVOICE_MATCH.md §Fix 2026-09-04 — Witness: W-CREATEFROM-INVOICE
  // ════════════════════════════════════════════════════════════════════════════════════════════════════════

  // createFromInvoiceGate — the process's own preconditions as a verdict. Every branch names its source.
  function createFromInvoiceGate(invoice, selection) {
    // CreateFromInvoice.doIt: `if (p_C_Invoice_ID == 0) throw new AdempiereUserError("@NotFound@ @C_Invoice_ID@")`
    if (!invoice || invoice.c_invoice_id == null) return { ok: false, missing: 'C_Invoice_ID', message: '@NotFound@ @C_Invoice_ID@' };
    // Real iDempiere reaches CreateFrom only from a DRAFTED invoice's toolbar (the tab goes read-only once
    // Processed='Y'); adding lines to a completed invoice would be a screen the product does not have.
    if (String(invoice.processed || 'N').toUpperCase() === 'Y' || (invoice.docstatus && invoice.docstatus !== 'DR' && invoice.docstatus !== 'IP'))
      return { ok: false, missing: 'DocStatus', message: 'Invoice is not drafted (CreateFrom is reachable only on a DR/IP invoice)' };
    // CreateFromInvoice.doIt: `if (getProcessInfo().getAD_InfoWindow_ID() > 0) return createLines(); else throw "@NotSupported@"`
    // — the Info Window IS the selection. No selection ⇒ the same refusal, never an invented line.
    if (!selection || !selection.length) return { ok: false, missing: 'selection', message: '@NotSupported@ (no line selection — CreateFrom needs an Info-Window selection)' };
    return { ok: true };
  }

  // sameOrderLineUOM — MInOutLine.sameOrderLineUOM() verbatim.
  function sameOrderLineUOM(sLine, oLine) {
    if (!sLine || Number(sLine.c_orderline_id || 0) <= 0) return false;
    if (!oLine) return false;
    return Number(oLine.c_uom_id || 0) === Number(sLine.c_uom_id || 0);
  }

  // shipLineFields — MInvoiceLine.setShipLine(sLine) ported field-for-field. `oLine` is the receipt line's
  // C_OrderLine (null when it has none). Returns {fields, deferred[]} — a branch we cannot port is DECLARED,
  // never silently skipped (the same law InOutGenerate's non-F/A DeliveryRules follow).
  function shipLineFields(sLine, oLine, product) {
    var f = {}, deferred = [];
    // VERBATIM COPY, including 0. setShipLine calls the plain setters — it does not translate 0 to NULL, and
    // `x || null` would: W-CREATEFROM-INVOICE caught exactly that on all 10 fixture rows
    // (m_attributesetinstance_id op=null src=0). 0 and NULL are different values in the AD dictionary.
    // Only the BRANCH tests below use the Java's own `== 0` semantics.
    function copy(v) { return v != null ? v : null; }
    f.m_inoutline_id = sLine.m_inoutline_id;
    f.c_orderline_id = copy(sLine.c_orderline_id);
    f.m_rmaline_id   = copy(sLine.m_rmaline_id);
    f.line           = sLine.line;
    f.isdescription  = sLine.isdescription || 'N';
    f.description    = copy(sLine.description);
    f.m_product_id   = copy(sLine.m_product_id);
    // setC_UOM_ID: sLine's UOM when sameOrderLineUOM() OR there is no product; else the PRODUCT's UOM.
    if (sameOrderLineUOM(sLine, oLine) || !Number(f.m_product_id || 0)) f.c_uom_id = sLine.c_uom_id;
    else if (product && product.c_uom_id != null)          f.c_uom_id = product.c_uom_id;
    else { f.c_uom_id = sLine.c_uom_id; deferred.push('product-uom-unavailable(cross-UOM: MUOMConversion)'); }
    f.m_attributesetinstance_id = copy(sLine.m_attributesetinstance_id);
    if (!Number(f.m_product_id || 0)) f.c_charge_id = copy(sLine.c_charge_id);   // `if (getM_Product_ID() == 0) setC_Charge_ID(...)`
    if (Number(f.c_orderline_id || 0) !== 0 && oLine) {
      // PriceEntered = oLine.PriceEntered when sameOrderLineUOM(), else oLine.PriceActual.
      f.priceentered = sameOrderLineUOM(sLine, oLine) ? oLine.priceentered : oLine.priceactual;
      f.priceactual  = oLine.priceactual;
      f.pricelimit   = oLine.pricelimit;
      f.pricelist    = oLine.pricelist;
      f.c_tax_id     = oLine.c_tax_id;
      f.linenetamt   = oLine.linenetamt;
      f.c_project_id = oLine.c_project_id != null ? oLine.c_project_id : null;
    } else if (Number(f.m_rmaline_id || 0) !== 0) {
      deferred.push('rma-line-pricing(MRMALine — the RMA corpus)');     // setRMALine() branch
    } else {
      deferred.push('no-order-line(setPrice()/setTax() — the price-list engine)');
    }
    return { fields: f, deferred: deferred };
  }

  // registerCreateFromInvoice(engine) — wire the handler. ctx seams (same shape as the KIND-2 handlers):
  //   fetchInvoice(info) -> the C_Invoice row · fetchReceiptLines(info) -> the SELECTED M_InOutLine rows
  //   fetchOrderLine(id) -> a C_OrderLine row  · fetchProduct(id) -> a M_Product row (optional)
  // info.params.selection (optional) = [{m_inoutline_id, qty}] — a per-row qty override, exactly the
  // Info-Window's Qty column. Absent ⇒ each receipt line's own qtyentered, carried verbatim (non-invent).
  function registerCreateFromInvoice(engine) {
    registerHandler('org.compiere.process.CreateFromInvoice', function (ctx, info) {
      var invoice = ctx.fetchInvoice ? ctx.fetchInvoice(info) : null;
      var sLines  = (ctx.fetchReceiptLines ? ctx.fetchReceiptLines(info) : []) || [];
      var gate = createFromInvoiceGate(invoice, sLines);
      if (!gate.ok) return { ok: false, reason: 'createfrom-refused', message: gate.message, rows: 0, result: { gate: gate, ops: [] } };
      var qtyBy = {};
      ((info && info.params && info.params.selection) || []).forEach(function (sel) {
        if (sel && sel.m_inoutline_id != null && sel.qty != null) qtyBy[String(sel.m_inoutline_id)] = sel.qty;
      });
      var ops = [], deferred = [];
      sLines.forEach(function (sLine) {
        var oLine = (Number(sLine.c_orderline_id || 0) !== 0 && ctx.fetchOrderLine) ? ctx.fetchOrderLine(sLine.c_orderline_id) : null;
        var product = (sLine.m_product_id && ctx.fetchProduct) ? ctx.fetchProduct(sLine.m_product_id) : null;
        var built = shipLineFields(sLine, oLine, product);
        built.deferred.forEach(function (d) { if (deferred.indexOf(d) === -1) deferred.push(d); });
        // createLineFrom: setQty(Qty) → QtyEntered, and QtyInvoiced = Qty unless a UOM conversion applies
        // (MUOMConversion — named-deferred above, so the two stay equal here rather than being invented).
        var qty = qtyBy[String(sLine.m_inoutline_id)];
        if (qty == null) qty = (sLine.qtyentered != null ? sLine.qtyentered : sLine.movementqty);
        var op = { op_type: 'CREATE_LINE', table: 'C_InvoiceLine', c_invoice_id: invoice.c_invoice_id,
                   qtyentered: qty, qtyinvoiced: qty };
        Object.keys(built.fields).forEach(function (k) { op[k] = built.fields[k]; });
        ops.push(op);
      });
      // invoice.updateFrom(order) copies PaymentRule/C_PaymentTerm_ID/SalesRep_ID and the payment SCHEDULE.
      // The schedule needs MOrderPaySchedule/MInvoicePaySchedule — declared, not silently skipped.
      deferred.push('updateFrom(order)-payment-schedule(MOrderPaySchedule)');
      console.log('§CREATEFROM-INVOICE invoice=' + invoice.c_invoice_id + ' selected=' + sLines.length +
                  ' linesCreated=' + ops.length + ' withInOutLine=' + ops.filter(function (o) { return o.m_inoutline_id != null; }).length +
                  ' withOrderLine=' + ops.filter(function (o) { return o.c_orderline_id != null; }).length +
                  ' deferred=' + JSON.stringify(deferred));
      return { ok: true, rows: ops.length,
               message: '@Created@ = ' + ops.length,
               result: { ops: ops, lineCount: ops.length, deferred: deferred } };
    }, { kind: 'process', action: 'CreateFromInvoice' });
  }

  // registerInOutGenerate(engine) — wire the KIND-2 handler. ctx: fetchOrder(info)->C_Order row,
  //   fetchOrderLines(info)->C_OrderLine rows, onHandOf(productId)->on-hand qty in the order's warehouse.
  function registerInOutGenerate(engine) {
    registerHandler('org.compiere.process.InOutGenerate', function (ctx, info) {
      var order = ctx.fetchOrder ? ctx.fetchOrder(info) : null;
      var gate = inoutGenGate(order);
      if (!gate.ok) return { ok: false, reason: 'order-not-shippable', message: gate.message, rows: 0, result: { gate: gate } };
      var built = genShipmentLines(
        ctx.fetchOrderLines ? ctx.fetchOrderLines(info) : [],
        order.deliveryrule,
        function (pid) { return ctx.onHandOf ? ctx.onHandOf(pid, order.m_warehouse_id) : 0; }
      );
      if (!built.lines.length) {
        // Honest empty — every ordered qty already delivered (or the rule is named-deferred). NOT a fake shipment.
        return {
          ok: true, rows: 0,
          message: '@Created@ = 0' + (built.deferredRule ? ' (DeliveryRule ' + built.deferredRule + ' is named-deferred)' : ' (nothing to deliver — ordered qty already delivered)'),
          result: { ops: [], lineCount: 0, deferredRule: built.deferredRule }
        };
      }
      var ops = engine.buildDoc(SHIPMENT_SPEC, order, built.lines);
      var li = 0;
      ops.forEach(function (op) { if (op.op_type === 'CREATE_LINE') { op.line = built.lines[li++].line; } });
      return {
        ok: true, rows: built.lines.length,
        message: '@Created@ = 1 (' + built.lines.length + ' shipment line' + (built.lines.length === 1 ? '' : 's') + ')',
        // §KIND2-READBACK (prompts/AGENT_QUEUE.md §K2RB.4) — crudMap publishes the spec's OWN engine-internal→
        // real-column names so the commit seam can translate this op-group into the CRUD vocabulary
        // crud_core.listTip folds. buildDoc writes `source_id`/`source_line_id` (engine names, not columns);
        // the spec already knows the columns they stand for. EXTRACT — nothing new is decided here.
        result: { ops: ops, lineCount: built.lines.length, header: ops[0], movementtype: ops[0].movementtype, deferredRule: built.deferredRule,
                  crudMap: { docParent: SHIPMENT_SPEC.parentId, lineParent: SHIPMENT_SPEC.lineParentId } }
      };
    }, { kind: 'process', action: 'GenerateShipment' });
  }

  // registerProjectGenOrder(engine) — wire the KIND-2 handler; engine = erp_engine API (its buildDoc archetype).
  // ctx the handler consumes: fetchProject(info)->project row (with m_pricelist_id + _c_doctypetarget_id
  //   resolved), fetchProjectLines(info)->C_ProjectLine rows. info.Record_ID = the C_Project_ID (prepare()).
  function registerProjectGenOrder(engine) {
    registerHandler('org.compiere.process.ProjectGenOrder', function (ctx, info) {
      var project = ctx.fetchProject ? ctx.fetchProject(info) : null;
      var gate = projectGenGate(project);
      if (!gate.ok) {
        // getProject's IllegalArgumentException — honest rejection, NEVER a fabricated order.
        return { ok: false, reason: 'project-not-ready', message: gate.message, rows: 0, result: { gate: gate } };
      }
      var norm = genOrderLines(ctx.fetchProjectLines ? ctx.fetchProjectLines(info) : []);
      // KIND-2: the op-group rides the buildDoc archetype (CREATE_DOCUMENT + N CREATE_LINE), newVerbs=0.
      var ops = engine.buildDoc(GENORDER_SPEC, project, norm);
      // Decorate each CREATE_LINE with the source line's Line/Description/PriceActual (buildDoc carries only
      // m_product_id + qtyordered). All EXTRACTED from the C_ProjectLine row — nothing invented.
      var li = 0;
      ops.forEach(function (op) {
        if (op.op_type !== 'CREATE_LINE') return;
        var n = norm[li++];
        op.line = n.line; op.description = n.description; op.priceactual = n.priceactual;
      });
      return {
        ok: true, rows: norm.length,
        message: '@C_Order_ID@ generated from project (' + norm.length + ' line' + (norm.length === 1 ? '' : 's') + ')',
        // §KIND2-READBACK (prompts/AGENT_QUEUE.md §K2RB.4) — crudMap publishes the spec's OWN engine-internal→
        // real-column names so the commit seam can translate this op-group into the CRUD vocabulary
        // crud_core.listTip folds. buildDoc writes `source_id`/`source_line_id` (engine names, not columns);
        // the spec already knows the columns they stand for. EXTRACT — nothing new is decided here.
        result: { ops: ops, lineCount: norm.length, header: ops[0], issotrx: 'Y', docsubtypeso: 'WI',
                  crudMap: { docParent: GENORDER_SPEC.parentId, lineParent: GENORDER_SPEC.lineParentId } }
      };
    }, { kind: 'process', action: 'GenerateOrder' });
  }

  // ── Read the AD rows for a process: header + ordered params (the ProcessInfo source). ─────────────────
  function readProcess(db, ad_process_id) {
    var p = db.prepare('SELECT ad_process_id,value,name,classname,isreport,procedurename,jasperreport,ad_reportview_id FROM ad_process WHERE ad_process_id=?').get(ad_process_id);
    if (!p) throw new Error('no ad_process row for ' + ad_process_id);
    var paras = db.prepare('SELECT name,columnname,ismandatory,ad_reference_id,isrange,defaultvalue,seqno FROM ad_process_para WHERE ad_process_id=? ORDER BY seqno').all(ad_process_id);
    return {
      AD_Process_ID: p.ad_process_id, value: p.value, name: p.name,
      classname: p.classname || '', isReport: p.isreport === 'Y',
      jasperReport: p.jasperreport, ad_reportview_id: p.ad_reportview_id,
      paras: paras.map(function (r) {
        return {
          name: r.name, columnName: r.columnname, mandatory: r.ismandatory === 'Y',
          ad_reference_id: r.ad_reference_id, type: refType(r.ad_reference_id),
          isRange: r.isrange === 'Y', defaultValue: r.defaultvalue, seqno: r.seqno
        };
      })
    };
  }

  // resolveClassname — ProcessUtil:157-162 semantics: a non-blank classname is used as-is; a BLANK classname
  // on a report proc falls back to a synthesized report key (the JASPER_STARTER analogue) so the receipt
  // folds can run. The report key derives from the proc's value/name (e.g. "Rpt C_Order" -> report:c_order).
  function resolveClassname(proc) {
    if (proc.classname) return proc.classname;
    if (proc.isReport) {
      var hay = ((proc.value || '') + ' ' + (proc.name || '')).toLowerCase();
      // map known report procs to the report_overlay header tables (extracted, not invented)
      if (/c_order\b|order print|rpt c_order/.test(hay) && !/invoice/.test(hay)) return 'report:c_order';
      if (/c_invoice|invoice print|rpt c_invoice/.test(hay)) return 'report:c_invoice';
      // "Rpt M_InOutConfirm" (292, "Shipment Confirmation") — CHECKED FIRST + CONFIRM-SPECIFIC: m_inoutconfirm\b |
      // "shipment confirmation" (§P2-tail-leg6). It does NOT catch 117 "Rpt M_InOut" ("shipment print", no "confirm");
      // the report-VIEWs 284 RV_InOutLineConfirm / 285 RV_InOutConfirm ("rv_inout*confirm", names "Open Confirmation(s)")
      // carry no literal "m_inoutconfirm" + no "shipment confirmation" → stay absent-handler; 280 M_InOutConfirm_Process
      // is isReport=N → never reaches here. Must precede the m_inout rule (though m_inout\b alone would not catch it).
      if (/m_inoutconfirm\b|shipment confirmation/.test(hay)) return 'report:m_inoutconfirm';
      // "Rpt M_InOut" (117) — M_InOut-SPECIFIC: m_inout\b (word-boundary) so the RV_InOutDetails report-VIEWs (293/294)
      // stay absent-handler. "delivery note"/"shipment print" are the print-format name; "...details" do NOT match.
      if (/m_inout\b|delivery note|shipment print/.test(hay)) return 'report:m_inout';
      // "Rpt M_Movement" (290) — M_Movement-SPECIFIC: m_movement\b (word-boundary) so the imperative M_Movement
      // procs ("M_Movement_Process"/"M_MovementConfirm_Process", 122/286 — isReport=N, never reach here anyway) and
      // any future RV_Movement* report-VIEW stay absent-handler. "inventory move print" is the unique print name.
      if (/m_movement\b|inventory move print/.test(hay)) return 'report:m_movement';
      // "Rpt M_Inventory" (291) — M_Inventory-SPECIFIC: m_inventory\b (word-boundary) | "physical inventory print"
      // so the imperative M_Inventory procs (105/106 carry non-blank classnames; 107 "M_Inventory Process" is
      // isReport=N → never reaches here) stay absent-handler. "inventory" alone is NOT matched (too broad).
      if (/m_inventory\b|physical inventory print/.test(hay)) return 'report:m_inventory';
      // "Rpt PP_Order" (53028) — PP_Order-SPECIFIC with WORD-BOUNDARIES on both alternatives: `pp_order\b` does NOT
      // match "rv_pp_order_transactions" (120 — `_` is a word char, no boundary after "pp_order"); `manufacturing
      // order\b` does NOT match "manufacturing orders review" (53030 — the trailing "s" breaks the boundary). Both
      // those report-view procs (+ the isReport=N "PP_Order" process 53026) thus stay the honest absent-handler.
      if (/pp_order\b|manufacturing order\b/.test(hay)) return 'report:pp_order';
      // "Rpt C_Project" (217) — SPECIFIC match (c_project / project print), NOT the broad "project" so the other
      // RV_Project* report-VIEW procs (218 RV_ProjectCycle, 226/228/229/234) stay absent-handler (no foldReceipt
      // for a report view — those are a later report-view fold, not this leg).
      if (/c_project|project print|rpt c_project/.test(hay)) return 'report:c_project';
      // "Rpt C_Payment" (313, "Payment Print") — match the SPECIFIC report value/name only (`rpt c_payment\b` |
      // "payment print"), NOT a bare `c_payment` — else "C_Payment NotAllocated" (317, UnAllocated Payments) and
      // the other RV_* payment report-VIEWs (146/148/318) would be wrongly caught. Those stay absent-handler.
      if (/rpt c_payment\b|payment print/.test(hay)) return 'report:c_payment';
    }
    return proc.classname || '';     // blank -> no handler -> absent-handler result downstream
  }

  // validateParams — the prepare() step: every mandatory para must be supplied (non-empty); every supplied
  // value must satisfy its reference type. Returns { ok, required:[], supplied:[], missing:[], badType:[] }.
  function validateParams(proc, params) {
    params = params || {};
    var required = [], supplied = [], missing = [], badType = [];
    proc.paras.forEach(function (pp) {
      var has = Object.prototype.hasOwnProperty.call(params, pp.columnName) && params[pp.columnName] != null && params[pp.columnName] !== '';
      if (pp.mandatory) {
        required.push(pp.columnName);
        if (!has) missing.push(pp.columnName);
      }
      if (has) {
        supplied.push(pp.columnName);
        if (!typeOk(pp.type, params[pp.columnName])) badType.push(pp.columnName + ':' + pp.type);
      }
    });
    return { ok: missing.length === 0 && badType.length === 0, required: required, supplied: supplied, missing: missing, badType: badType };
  }

  // dispatch — the full spine: read → resolve classname → validate params → run handler → result.
  //   db   = better-sqlite3 handle on ad_full.db (for the AD rows)
  //   info = { AD_Process_ID, params:{columnName:value}, ...handler-specific (Record_ID etc.) }
  //   ctx  = data accessors the handler needs (fetchHeader/fetchLines/fetchFacts/...). Optional.
  // Returns a ProcessResult: { ad_process_id, classname, dispatched, validate, result|reason }.
  function dispatch(db, info, ctx) {
    ctx = ctx || {};
    var proc = readProcess(db, info.AD_Process_ID);
    var classname = resolveClassname(proc);
    var validate = validateParams(proc, info.params);

    // prepare(): reject before doIt() if params are invalid — faithful to SvrProcess.process() aborting
    // when prepare() throws / parameters are missing.
    if (!validate.ok) {
      return {
        ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
        dispatched: false, reason: 'param-validation-failed', validate: validate,
        message: 'missing mandatory: [' + validate.missing.join(',') + '] badType: [' + validate.badType.join(',') + ']'
      };
    }

    // Core.getProcess(className) == null branch (ProcessUtil:166-170): explicit absent-handler, NOT a no-op.
    if (!classname || !hasHandler(classname)) {
      return {
        ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
        dispatched: false, reason: 'absent-handler', validate: validate,
        message: 'Failed to create new process instance for ' + (classname || '(blank classname)') +
                 ' — classname not in registry (54k-LOC SvrProcess corpus is named-deferred, not ported)'
      };
    }

    // doIt(): run the registered handler.
    var entry = REGISTRY[classname];
    var out;
    try { out = entry.fn(ctx, info) || {}; }
    catch (e) { out = { ok: false, message: 'handler threw: ' + (e && e.message), rows: 0 }; }
    return {
      ad_process_id: proc.AD_Process_ID, name: proc.name, classname: classname,
      kind: entry.meta.kind || 'process', dispatched: true,
      ok: out.ok !== false, reason: out.ok === false ? (out.reason || 'handler-failed') : 'ok',
      validate: validate, rows: out.rows || 0, message: out.message, result: out.result
    };
  }

  // ── pickUsedProcesses — the P3 ON-DEMAND PICKER (GAP_CLOSURE_LANE §P3.5) ─────────────────────────────
  // Returns the ACTUALLY-USED subset of AD_Process via TWO lenses, unioned:
  //   byAccess  — AD_Process ⋈ AD_Process_Access (processes granted to at least one active role)
  //   byWorkflow— AD_Process ⋈ AD_WF_Node        (processes that appear in a workflow node)
  // This IS the mechanism; the 337-classname corpus is NOT pre-ported.
  // opts.roles  — array of ad_role_id to narrow the access lens (default: all active roles)
  // opts.includeWfNodes — false to skip the workflow lens (default: true)
  // Implements GAP_CLOSURE_LANE.md §P3.5 — Witness: W-PROC-PICKER
  function pickUsedProcesses(db, opts) {
    opts = opts || {};
    var roleClause = '';
    if (opts.roles && opts.roles.length > 0) {
      roleClause = ' AND pa.ad_role_id IN (' + opts.roles.map(Number).join(',') + ')';
    }

    // lens 1: access grants — AD_Process ⋈ AD_Process_Access
    var byAccess = db.prepare(
      "SELECT DISTINCT p.ad_process_id, p.value, p.classname, p.isreport " +
      "FROM ad_process p " +
      "JOIN ad_process_access pa ON pa.ad_process_id=p.ad_process_id AND pa.isactive='Y' " +
      "WHERE p.isactive='Y'" + roleClause +
      " ORDER BY p.ad_process_id"
    ).all();

    // lens 2: workflow nodes — AD_WF_Node ⋈ AD_Process (processes referenced as node actions)
    var byWorkflow = [];
    if (opts.includeWfNodes !== false) {
      byWorkflow = db.prepare(
        "SELECT DISTINCT p.ad_process_id, p.value, p.classname, p.isreport " +
        "FROM ad_process p " +
        "JOIN ad_wf_node n ON n.ad_process_id=p.ad_process_id AND n.isactive='Y' " +
        "WHERE p.isactive='Y' ORDER BY p.ad_process_id"
      ).all();
    }

    // union by ad_process_id (deterministic sort for oracle diff)
    var seen = Object.create(null), union = [];
    byAccess.concat(byWorkflow).forEach(function (r) {
      if (!seen[r.ad_process_id]) { seen[r.ad_process_id] = true; union.push(r); }
    });
    union.sort(function (a, b) { return a.ad_process_id - b.ad_process_id; });

    return { byAccess: byAccess, byWorkflow: byWorkflow, union: union };
  }

  var API = {
    REGISTRY: REGISTRY, registerHandler: registerHandler, hasHandler: hasHandler,
    registeredClassnames: registeredClassnames, installDefaultHandlers: installDefaultHandlers,
    registerProjectGenOrder: registerProjectGenOrder, projectGenGate: projectGenGate,
    genOrderLines: genOrderLines, GENORDER_SPEC: GENORDER_SPEC,
    registerInOutGenerate: registerInOutGenerate, inoutGenGate: inoutGenGate,
    genShipmentLines: genShipmentLines, SHIPMENT_SPEC: SHIPMENT_SPEC,
    registerInvoiceGenerate: registerInvoiceGenerate, invoiceGenGate: invoiceGenGate,
    genInvoiceLines: genInvoiceLines, INVOICE_SPEC: INVOICE_SPEC,
    registerCreateFromInvoice: registerCreateFromInvoice, createFromInvoiceGate: createFromInvoiceGate,
    shipLineFields: shipLineFields, sameOrderLineUOM: sameOrderLineUOM,
    readProcess: readProcess, resolveClassname: resolveClassname,
    validateParams: validateParams, dispatch: dispatch,
    pickUsedProcesses: pickUsedProcesses,
    refType: refType, typeOk: typeOk, REF_TYPE: REF_TYPE
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdProcess = API;                    // browser
  else if (global) global.AdProcess = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
