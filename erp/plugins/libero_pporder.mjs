// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_pporder.mjs: HOT chunk of the Libero bundle, slice 1 (prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md; Witness W-LIBERO-BUNDLE).
//   Model classes written THROUGH Trx (real tables pp_order_bom, pp_order_bomline, pp_mrp) - NOT the 5-table kernel path. Every rule below is a verbatim port with its Java cite; anything NOT ported is listed in DEFERRED
//   and printed by the witness (§LIBERO-DEFERRED) so no omission is silent. Pure: no clock (env.now), no random.
const RM_UP = 'UP', RM_HALF_UP = 'HALF_UP';
export const DEFERRED = [
  'RoutingService variants other than DefaultRoutingServiceImpl (estimateWorkingTime for cost collectors) - cost side',
  'MPPOrderBOMLine.explodePhantom - fixtures carry no phantom',
  'MPPOrderBOMLine.reserveStock - the MStorageOnHand.add(...,0) touch (the QtyReserved update IS ported)',
  'MPPOrder.beforeSave #M_Warehouse_ID context default',
  'MPPMRP.deleteMRP: voiding draft Requisitions and MResourceAssignment cleanup (no requisition/resource-assignment port yet)'
];
// the three constants the SEED-vs-SOURCE decision rests on (spec "DECISION RECORDED"); LIBERO_BREAK flips them to prove the witness sees them.
export const SOURCE = { uomPrecision: true, bomUseCopied: true, mrpFinishFromOrder: true, mrpDelete: true, cyclesRounded: true, orderStock: 'reservation' };

export function create(ctx) {
  const ML = ctx.docAction;                                  // the ModelLayer facade (D, N, registerModel inherited)
  const D = ML.D, BD = D(0).constructor, ZERO = D(0), ONE = D(1), HUNDRED = D(100);
  const lc = (v) => (v == null ? v : String(v));
  // java.sql.Timestamp compare: canonical 'YYYY-MM-DD HH:MM:SS' orders chronologically as a string (== M4's ts())
  const ts = (v) => { if (v == null || v === '') return ''; const t = String(v).replace('T', ' ').replace(/Z$/, '').replace(/\.\d+$/, ''); return t.length === 10 ? t + ' 00:00:00' : t; };
  // MPPProductBOM.isValidFromTo :362-371 / MPPProductBOMLine.isValidFromTo :304-313 (identical bodies)
  const isValidFromTo = (from, to, date) => { const f = ts(from), t = ts(to), d = ts(date); if (f && d < f) return false; if (t && d > t) return false; return true; };
  const active = (r) => r.isactive == null || r.isactive === '' || r.isactive === 'Y';
  const dec = (v) => D(v == null ? 0 : v);
  const num = (v) => ML.N(v);

  // MUOM.getPrecision (StdPrecision of the line's UOM)
  function precisionOf(trx, uomId) { if (!SOURCE.uomPrecision) return 8; const u = uomId ? trx.get('c_uom', uomId) : null; return u && u.stdprecision != null ? Number(u.stdprecision) : 2; }

  // ── MPPOrderBOMLine ─────────────────────────────────────────────────────────────────────────────────
  // getQtyMultiplier :280-293
  function qtyMultiplier(l) { return l.isqtypercentage === 'Y' ? dec(l.qtybatch).divide(HUNDRED, 8, RM_HALF_UP) : dec(l.qtybom); }
  // setQtyRequired override :330-340 - scaled to the UOM precision, HALF_UP, only when a UOM is set
  function setQtyRequired(trx, l, q) { l.qtyrequiered = (q != null && l.c_uom_id) ? q.setScale(precisionOf(trx, l.c_uom_id), RM_HALF_UP) : q; }
  // setQtyPlusScrap :298-330 (verbatim order of operations)
  function setQtyPlusScrap(trx, l, qtyOrdered) {
    const mult = qtyMultiplier(l), qty = qtyOrdered.multiply(mult).setScale(8, RM_UP), ct = l.componenttype;
    if (['CO', 'PH', 'PK', 'BY', 'CP'].indexOf(ct) >= 0) setQtyRequired(trx, l, qty);
    else if (ct === 'TL') setQtyRequired(trx, l, mult);
    else throw new Error('@NotSupported@ @ComponentType@ ' + ct);
    let scrap = dec(l.scrap);
    if (scrap.signum() !== 0) {
      scrap = scrap.divide(HUNDRED, 8, RM_UP);
      const div = ONE.subtract(scrap);
      setQtyRequired(trx, l, dec(l.qtyrequiered).divide(div, 8, RM_HALF_UP));
    }
  }
  // MPPOrderBOMLine.beforeSave :120-170 (phantom + reserveStock deferred)
  function bomLineBeforeSave(trx, rec, isNew, old) {
    if (!active(rec)) return 'De-Activating an BOM Line is not allowed';
    if (!isNew && old && lc(old.m_product_id) !== lc(rec.m_product_id)) return 'Changing Product is not allowed';
    if (!rec.line) {   // Line = COALESCE(MAX(Line),0)+10 per PP_Order (:134-140), over base + pending rows of this Trx
      let mx = 0; trx.find('pp_order_bomline', { pp_order_id: rec.pp_order_id }).forEach((r) => { mx = Math.max(mx, Number(r.line || 0)); });
      rec.line = mx + 10;
    }
    if (isNew || (old && (lc(old.c_uom_id) !== lc(rec.c_uom_id) || lc(old.qtyentered) !== lc(rec.qtyentered) || lc(old.qtyrequiered) !== lc(rec.qtyrequiered)))) {
      const p = precisionOf(trx, rec.c_uom_id);
      rec.qtyentered = num(dec(rec.qtyentered).setScale(p, RM_UP));          // :163-168 UP
      rec.qtyrequiered = num(dec(rec.qtyrequiered).setScale(p, RM_UP));
    }
    reserveStock(trx, rec, old, isNew);
    return null;
  }
  // reserveStock :506-544 (the row-visible part): header warehouse enforced; for a STOCKED product QtyReserved += (QtyRequired - QtyReserved - QtyDelivered). DEFERRED, named: the MStorageOnHand.add(..., 0) touch.
  function reserveStock(trx, rec, old, isNew) {
    if (!(isNew || (old && (lc(old.qtydelivered) !== lc(rec.qtydelivered) || lc(old.qtyrequiered) !== lc(rec.qtyrequiered))))) return;
    const parent = trx.get('pp_order', rec.pp_order_id), wh = parent ? Number(parent.m_warehouse_id || 0) : 0;
    if (wh !== 0 && wh !== Number(rec.m_warehouse_id || 0)) rec.m_warehouse_id = wh;
    const diff = dec(rec.qtyrequiered).subtract(dec(rec.qtyreserved)).subtract(dec(rec.qtydelivered));
    if (diff.signum() === 0) return;
    const p = trx.get('m_product', rec.m_product_id);
    if (!p || p.isstocked !== 'Y') return;
    rec.qtyreserved = num(dec(rec.qtyreserved).add(diff));
  }

  // ── MPPOrder ────────────────────────────────────────────────────────────────────────────────────────
  // updateQtyBatchs :96-120
  function updateQtyBatchs(trx, rec, override) {
    let size = dec(rec.qtybatchsize);
    if (size.signum() === 0 || override) {
      const wfId = Number(rec.ad_workflow_id || 0);
      if (wfId <= 0) return;
      const wf = trx.get('ad_workflow', wfId);
      size = dec(wf && wf.qtybatchsize).setScale(0, RM_UP); rec.qtybatchsize = num(size);
    }
    rec.qtybatchs = size.signum() === 0 ? 1 : num(dec(rec.qtyordered).divide(size, 0, RM_UP));
  }
  // ── storage / costing helpers (core ports reused: ModelTrade.storageAdd/reservationAdd, ModelCost) ──────────────────────────────────────────────────────
  const T = () => { if (!globalThis.ModelTrade) throw new Error('Libero: ModelTrade (core model_trade.js) is not loaded'); return globalThis.ModelTrade; };
  const isStocked = (p) => !!p && p.isstocked === 'Y' && p.producttype === 'I';   // MProduct.isStocked() = IsStocked && isItem()
  function defaultLocator(trx, whId) {      // MWarehouse.getDefaultLocator: the active default locator, else the first
    const ls = trx.find('m_locator', { m_warehouse_id: whId }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id));
    return ls[0] || null;
  }
  // MPPOrder.orderStock :606-657 (fork divergence: see spec; reservation semantics by default). Mutates `rec.qtyreserved`; returns an error string or null.
  function orderStock(trx, rec) {
    const p = trx.get('m_product', rec.m_product_id); if (!isStocked(p) || SOURCE.orderStock === 'none') return null;
    const diff = dec(rec.qtyordered).subtract(dec(rec.qtyreserved)).subtract(dec(rec.qtydelivered));
    if (diff.signum() === 0) return null;
    let e;
    if (SOURCE.orderStock === 'onhand') { const loc = defaultLocator(trx, rec.m_warehouse_id); e = loc ? T().storageAdd(trx, loc.m_locator_id, rec.m_product_id, rec.m_attributesetinstance_id, diff, null) : 'no locator for warehouse ' + rec.m_warehouse_id; }
    else e = T().reservationAdd(trx, rec.m_warehouse_id, rec.m_product_id, rec.m_attributesetinstance_id, diff, false, null);
    if (e) return e;
    trx.say('§LIBERO-ORDERSTOCK order=' + rec.documentno + ' mode=' + SOURCE.orderStock + ' diff=' + diff.toString());
    rec.qtyreserved = num(dec(rec.qtyreserved).add(diff));
    return null;
  }
  function orderBeforeSave(trx, rec, isNew, old) {
    const env = trx.env || {};
    if (Number(rec.ad_client_id == null ? env.client : rec.ad_client_id) === 0) return 'AD_Client_ID = 0';
    if (!rec.ad_org_id) { const o = Number(env.org || 0); if (!o) return 'AD_Org_ID = 0'; rec.ad_org_id = o; }
    if (!(Number(rec.c_uom_id || 0) > 0) && Number(rec.m_product_id || 0) > 0) { const p = trx.get('m_product', rec.m_product_id); rec.c_uom_id = p ? p.c_uom_id : rec.c_uom_id; }
    if (!rec.datefinishschedule) rec.datefinishschedule = rec.datepromised;
    if (isNew ? (rec.qtyordered != null || rec.qtydelivered != null) : (old && (lc(old.qtyordered) !== lc(rec.qtyordered) || lc(old.qtydelivered) !== lc(rec.qtydelivered)))) { const e = orderStock(trx, rec); if (e) return e; }   // :425-430
    updateQtyBatchs(trx, rec, false);
    if (isNew) trx._libSet = { pp_order: { qtyentered: rec.qtyentered != null } };   // PO.is_ValueChanged tracks only what the CALLER set, not DB defaults filled in at insert
    return null;
  }
  // changed(col): PO.is_ValueChanged inside afterSave. For a NEW record every set (non-null) column is changed (old = null); for an update, against the old row.
  const changed = (rec, old, isNew, c, trx) => { if (isNew) { const u = trx && trx._libSet && trx._libSet.pp_order; return u && c in u ? u[c] : rec[c] != null; } return old != null && lc(rec[c]) !== lc(old[c]); };
  function isDelivered(rec) { return dec(rec.qtydelivered).signum() > 0; }
  // deletePO(table, where, params) (MPPOrder :520-540): each row deleted THROUGH the model layer so beforeDelete + BEFORE_DELETE validators (the MRP cleanup below) fire.
  function deletePO(trx, t, w) { trx.find(t, w).forEach((r) => ML.po(trx, t, r).deleteEx()); }
  function deleteWorkflowAndBOM(trx, rec) {   // MPPOrder.deleteWorkflowAndBOM :497-519 (order of deletes verbatim; `AD_Client_ID` guard = the order's client)
    if (ML.isNewId(rec.pp_order_id) && !trx._p('pp_order')[String(rec.pp_order_id)]) return null;   // get_ID() <= 0: a new record, nothing to do
    const w = { pp_order_id: rec.pp_order_id, ad_client_id: rec.ad_client_id };
    try {
      trx.find('pp_order_workflow', w).forEach((r) => { if (r.pp_order_node_id != null) trx.update('pp_order_workflow', r, { pp_order_node_id: null }); });   // "Reset workflow start node"
      ['pp_order_node_asset', 'pp_order_node_product', 'pp_order_nodenext', 'pp_order_node', 'pp_order_workflow', 'pp_order_bomline', 'pp_order_bom'].forEach((t) => deletePO(trx, t, w));
    } catch (e) { return e.message; }
    return null;
  }
  // MPPOrder.beforeDelete :478-494: a Drafted/In-Progress order removes its cost rows and its snapshot, then "Un-Order Stock"
  function orderBeforeDelete(trx, row) {
    if (row.docstatus === 'DR' || row.docstatus === 'IP') { try { deletePO(trx, 'pp_order_cost', { pp_order_id: row.pp_order_id, ad_client_id: row.ad_client_id }); } catch (e) { return e.message; } const e0 = deleteWorkflowAndBOM(trx, row); if (e0) return e0; }
    return orderStock(trx, Object.assign({}, row, { qtyordered: 0 }));   // "Un-Order Stock" :490-492
  }
  // explosion() :1028-1051 BOM half + expandBOM :1100-1138
  function explosion(trx, rec) {
    const bom = trx.get('pp_product_bom', rec.pp_product_bom_id);
    if (!bom) return 'PP_Product_BOM ' + rec.pp_product_bom_id + ' not found';
    if (lc(rec.m_product_id) !== lc(bom.m_product_id)) return '@NotMatch@ @PP_Product_BOM_ID@ , @M_Product_ID@';
    const product = trx.get('m_product', bom.m_product_id);
    if (!product || product.isverified !== 'Y') return 'Product BOM Configuration not verified. Please verify the product first - ' + (product ? product.value : bom.m_product_id);
    const start = rec.datestartschedule;
    if (!isValidFromTo(bom.validfrom, bom.validto, start)) return 'BOMExpired: PP_Product_BOM ' + bom.pp_product_bom_id + ' not valid at ' + ts(start) + ' (from=' + ts(bom.validfrom) + ' to=' + ts(bom.validto) + ')';
    // new MPPOrderBOM(PP_Product_BOM, PP_Order_ID) :70-93
    const hdr = ML.newRecord(trx, 'pp_order_bom', {
      bomtype: bom.bomtype, bomuse: SOURCE.bomUseCopied ? bom.bomuse : 'M', m_changenotice_id: bom.m_changenotice_id, help: bom.help, processing: bom.processing, description: bom.description,
      m_attributesetinstance_id: bom.m_attributesetinstance_id, m_product_id: bom.m_product_id, name: bom.name, revision: bom.revision, validfrom: bom.validfrom, validto: bom.validto,
      value: bom.value, documentno: bom.value, c_uom_id: bom.c_uom_id, pp_order_id: rec.pp_order_id, ad_org_id: rec.ad_org_id });
    if (!hdr.save()) return hdr.error;
    const hrow = hdr.row, parentQty = dec(rec.qtyordered);
    const lines = trx.find('pp_product_bomline', { pp_product_bom_id: bom.pp_product_bom_id }).filter(active).sort((a, b) => Number(a.line) - Number(b.line));
    for (const pl of lines) {
      if (!isValidFromTo(pl.validfrom, pl.validto, start)) continue;       // log.fine("BOM Line skiped")
      // new MPPOrderBOMLine(PP_Product_BOMline, PP_Order_ID, PP_Order_BOM_ID, M_Warehouse_ID) :73-102 - NOTE: `line` is NOT copied; beforeSave assigns MAX+10
      const l = { pp_order_bom_id: hrow.pp_order_bom_id, pp_order_id: rec.pp_order_id, m_warehouse_id: rec.m_warehouse_id, m_changenotice_id: pl.m_changenotice_id, description: pl.description, help: pl.help,
        assay: pl.assay, qtybatch: pl.qtybatch, qtybom: pl.qtybom, isqtypercentage: pl.isqtypercentage, componenttype: pl.componenttype, c_uom_id: pl.c_uom_id, forecast: pl.forecast,
        iscritical: pl.iscritical, issuemethod: pl.issuemethod, leadtimeoffset: pl.leadtimeoffset, m_attributesetinstance_id: pl.m_attributesetinstance_id, m_product_id: pl.m_product_id,
        scrap: pl.scrap, validfrom: pl.validfrom, validto: pl.validto, backflushgroup: pl.backflushgroup, ad_org_id: rec.ad_org_id };
      try { setQtyPlusScrap(trx, l, parentQty); } catch (e) { return e.message; }
      l.qtyrequiered = l.qtyrequiered == null ? null : num(l.qtyrequiered);
      const ob = ML.newRecord(trx, 'pp_order_bomline', l);
      if (!ob.save()) return ob.error;
    }
    return explodeRouting(trx, rec);
  }
  // ── routing half of explosion() :1052-1098 ───────────────────────────────────────────────────────────────────
  // RoutingService (DefaultRoutingServiceImpl :74-80, :106-114): working time = node.Duration x cycles, cycles = ceil(qty / UnitsCycles) when UnitsCycles > 0 else qty
  function estimateWorkingTime(node, qty) {
    const units = Number(node.unitscycles || 0);
    const cycles = units > 0 ? Number(num(dec(qty).divide(D(units), 0, SOURCE.cyclesRounded ? RM_UP : 'DOWN'))) : Math.trunc(Number(num(dec(qty))));
    return Number(node.duration || 0) * cycles;
  }
  function explodeRouting(trx, rec) {
    const start = rec.datestartschedule, env = trx.env || {};
    const wf = rec.ad_workflow_id ? trx.get('ad_workflow', rec.ad_workflow_id) : null;
    if (!wf) return 'Routing (AD_Workflow ' + rec.ad_workflow_id + ') not found';
    if (wf.isvalid !== 'Y') return 'Routing is not valid. Please validate it first - ' + wf.value;
    if (!isValidFromTo(wf.validfrom, wf.validto, start)) return 'RoutingExpired: AD_Workflow ' + wf.ad_workflow_id + ' not valid at ' + ts(start);
    // new MPPOrderWorkflow(AD_Workflow, PP_Order_ID) :104-139 (every field the peer ctor copies)
    const WF_COPY = ['value', 'workflowtype', 'qtybatchsize', 'name', 'accesslevel', 'author', 'durationunit', 'duration', 'entitytype', 'isdefault', 'publishstatus', 'version', 'cost', 'waitingtime', 'workingtime',
      'ad_wf_responsible_id', 'ad_workflow_id', 'limit', 'priority', 's_resource_id', 'queuingtime', 'setuptime', 'movingtime', 'processtype', 'ad_table_id', 'ad_wf_node_id', 'ad_workflowprocessor_id', 'description', 'validfrom', 'validto'];
    const wfFields = { pp_order_id: rec.pp_order_id, ad_org_id: rec.ad_org_id };
    WF_COPY.forEach((c) => { wfFields[c] = wf[c] === undefined ? null : wf[c]; });
    const owf = ML.newRecord(trx, 'pp_order_workflow', wfFields);
    if (!owf.save()) return owf.error;
    const clientOk = (r) => Number(r.ad_client_id || 0) === 0 || Number(r.ad_client_id) === Number(rec.ad_client_id);
    const envClient = Number(env.client == null ? rec.ad_client_id : env.client);
    // MWorkflow.loadNodes :361-366: AD_Client_ID IN (0, env client), active; no ORDER BY in the Query (heap order) -> ordered by key here
    const wfNodes = trx.find('ad_wf_node', { ad_workflow_id: wf.ad_workflow_id }).filter((n) => active(n) && (Number(n.ad_client_id || 0) === 0 || Number(n.ad_client_id) === envClient))
      .sort((a, b) => Number(a.ad_wf_node_id) - Number(b.ad_wf_node_id));
    const NODE_COPY = ['action', 'ad_wf_node_id', 'ad_wf_responsible_id', 'ad_workflow_id', 'issubcontracting', 'ismilestone', 'c_bpartner_id', 'cost', 'duration', 'overlapunits', 'entitytype', 'iscentrallymaintained',
      'joinelement', 'limit', 'name', 'priority', 'splitelement', 'subflowexecution', 'value', 's_resource_id', 'setuptime', 'movingtime', 'waitingtime', 'workingtime', 'queuingtime', 'xposition', 'yposition',
      'docaction', 'ad_column_id', 'ad_form_id', 'ad_image_id', 'ad_window_id', 'ad_process_id', 'attributename', 'attributevalue', 'startmode', 'finishmode', 'validfrom', 'validto', 'hr_requirement_id', 'isemployee'];
    const nodeCols = ML.columnsOf(trx, 'pp_order_node'), qtyOrdered = dec(rec.qtyordered);
    for (const wn of wfNodes) {
      if (!isValidFromTo(wn.validfrom, wn.validto, start)) continue;
      const nf = { pp_order_id: owf.row.pp_order_id, pp_order_workflow_id: owf.row.pp_order_workflow_id, ad_org_id: rec.ad_org_id, docstatus: 'DR' };
      NODE_COPY.forEach((c) => { if (c in nodeCols && c in wn) nf[c] = wn[c]; });
      nf.unitscycles = wn.unitscycles == null ? null : Math.trunc(Number(wn.unitscycles));   // getUnitsCycles().intValueExact()
      nf.setuptimerequiered = wn.setuptime;                                                    // setSetupTimeRequired(wfNode.getSetupTime())
      nf.qtyrequiered = num(qtyOrdered);                                                       // setQtyOrdered -> setQtyRequired
      nf.durationrequiered = estimateWorkingTime({ duration: wn.duration, unitscycles: nf.unitscycles }, qtyOrdered);   // setDurationRequired(workingTime.intValueExact())
      const on = ML.newRecord(trx, 'pp_order_node', nf);
      if (!on.save()) return on.error;
      const nodeRow = on.row;
      // MWFNode.getTransitions(client) (MWFNode :334-347; loadNext orders by SeqNo): copy each active next of the AD node
      const nexts = trx.find('ad_wf_nodenext', { ad_wf_node_id: wn.ad_wf_node_id }).filter((x) => active(x) && clientOk(x)).sort((a, b) => Number(a.seqno) - Number(b.seqno) || Number(a.ad_wf_nodenext_id) - Number(b.ad_wf_nodenext_id));
      for (const wnn of nexts) {   // new MPPOrderNodeNext(MWFNodeNext, MPPOrderNode) :84-98 (pp_order_next_id set later by setPP_Order_Next_ID)
        const nn = ML.newRecord(trx, 'pp_order_nodenext', { ad_org_id: rec.ad_org_id, pp_order_id: nodeRow.pp_order_id, pp_order_node_id: nodeRow.pp_order_node_id, ad_wf_node_id: wnn.ad_wf_node_id, ad_wf_next_id: wnn.ad_wf_next_id,
          description: wnn.description, entitytype: wnn.entitytype, isstduserworkflow: wnn.isstduserworkflow, seqno: wnn.seqno, transitioncode: wnn.transitioncode });
        if (!nn.save()) return nn.error;
      }
      for (const np of trx.find('pp_wf_node_product', { ad_wf_node_id: wn.ad_wf_node_id }).filter(active).sort((a, b) => Number(a.seqno) - Number(b.seqno))) {   // MPPOrderNodeProduct(np, node) :60-75 + beforeSave
        let qty = dec(np.qty); if (qty.signum() === 0 && np.issubcontracting === 'Y') qty = ONE;
        const x = ML.newRecord(trx, 'pp_order_node_product', { ad_org_id: rec.ad_org_id, seqno: np.seqno, isactive: np.isactive, m_product_id: np.m_product_id, qty: num(qty), issubcontracting: np.issubcontracting,
          pp_order_id: nodeRow.pp_order_id, pp_order_workflow_id: nodeRow.pp_order_workflow_id, pp_order_node_id: nodeRow.pp_order_node_id });
        if (!x.save()) return x.error;
      }
      for (const na of trx.find('pp_wf_node_asset', { ad_wf_node_id: wn.ad_wf_node_id }).filter(active).sort((a, b) => Number(a.seqno) - Number(b.seqno))) {   // MPPOrderNodeAsset(na, node) :55-66
        const x = ML.newRecord(trx, 'pp_order_node_asset', { ad_org_id: rec.ad_org_id, a_asset_id: na.a_asset_id, pp_order_id: nodeRow.pp_order_id, pp_order_workflow_id: nodeRow.pp_order_workflow_id, pp_order_node_id: nodeRow.pp_order_node_id });
        if (!x.save()) return x.error;
      }
    }
    // "Update transitions nexts and set first node" :1076-1094 (requery: active nodes of the order workflow, client 0 or the order's)
    let first = null;
    for (const on of trx.find('pp_order_node', { pp_order_workflow_id: owf.row.pp_order_workflow_id }).filter((n) => active(n) && clientOk(n))) {
      if (Number(owf.row.ad_wf_node_id) === Number(on.ad_wf_node_id)) first = on.pp_order_node_id;
      for (const nx of trx.find('pp_order_nodenext', { pp_order_node_id: on.pp_order_node_id }).filter((x) => active(x) && clientOk(x)).sort((a, b) => Number(a.seqno) - Number(b.seqno))) {
        // MPPOrderNodeNext.setPP_Order_Next_ID :164-170: the order node with that AD_WF_Node in this order and client, else 0
        const tgt = trx.find('pp_order_node', { pp_order_id: nx.pp_order_id }).filter((n) => Number(n.ad_wf_node_id) === Number(nx.ad_wf_next_id) && Number(n.ad_client_id) === Number(nx.ad_client_id))[0];
        const p = ML.po(trx, 'pp_order_nodenext', nx); p.set('pp_order_next_id', tgt ? tgt.pp_order_node_id : 0); if (!p.save()) return p.error;
      }
    }
    if (first != null) { const p = ML.po(trx, 'pp_order_workflow', owf.row); p.set('pp_order_node_id', first); if (!p.save()) return p.error; }
    return null;
  }
  function orderAfterSave(trx, live, isNew, old) {
    if (live.docaction === 'CL' || live.docaction === 'VO') return null;   // :451-455
    let e;
    if (changed(live, old, isNew, 'qtyentered', trx) && !isDelivered(live)) { if ((e = deleteWorkflowAndBOM(trx, live))) return e; if ((e = explosion(trx, live))) return e; }
    if (changed(live, old, isNew, 'qtyentered', trx) && isDelivered(live)) return 'Cannot Change Quantity, Only for Draft or In-Progess Status';
    if (!isNew) return null;
    return explosion(trx, live);   // :466-475 - second explosion for a new record (faithful, see spec §LIBERO-DOUBLE-EXPLODE)
  }

  // ── MPPMRP (MFG_Validator AFTER_NEW/AFTER_CHANGE -> MPPMRP.PP_Order / PP_Order_BOMLine) ──────────────
  const SRC_COLS = { pp_order: ['ad_org_id', 'm_product_id', 'c_uom_id', 'datepromised', 'qtyordered', 'qtydelivered', 'pp_product_bom_id', 'ad_workflow_id', 'docstatus'],
    pp_order_bomline: ['m_product_id', 'c_uom_id', 'm_warehouse_id', 'qtyentered', 'qtydelivered'] };
  function isChanged(table, rec, old, isNew) {   // MPPMRP.isChanged :462-482
    const cols = SRC_COLS[table]; if (isNew) return true;
    if (old && lc(old.isactive) !== lc(rec.isactive)) return true;
    return !!old && cols.some((c) => lc(rec[c]) !== lc(old[c]));
  }
  function mrpDocStatus(s) { return s === 'CL' ? 'CO' : s === 'CO' ? 'IP' : s; }   // setPP_Order :680-695 (Ferry)
  function setPPOrder(m, o) {   // MPPMRP.setPP_Order :670-697
    m.pp_order_id = o.pp_order_id; m.ordertype = 'MOP'; m.name = o.documentno; m.description = o.description; m.datepromised = o.datepromised; m.dateordered = o.dateordered;
    m.datestartschedule = o.datestartschedule; m.datefinishschedule = SOURCE.mrpFinishFromOrder ? o.datefinishschedule : o.datestartschedule; m.s_resource_id = o.s_resource_id; m.docstatus = mrpDocStatus(o.docstatus);
  }
  function mrpFor(trx, o, extra, firstWhere) { return trx.find('pp_mrp', Object.assign({ ad_client_id: o.ad_client_id }, firstWhere)).filter((r) => r.ordertype === 'MOP')[0] || null; }
  function saveMrp(trx, row, fields) {   // new MPPMRP(ctx,0) defaults (:640-650) then saveEx
    const p = row ? ML.po(trx, 'pp_mrp', row) : ML.newRecord(trx, 'pp_mrp', Object.assign({ value: 'MRP', isavailable: 'N', datesimulation: (trx.env || {}).now || null }, fields));
    if (row) Object.keys(fields).forEach((k) => p.set(k, fields[k]));
    return p.save() ? null : p.error;
  }
  function mrpPPOrder(trx, o) {   // MPPMRP.PP_Order :946-985
    const sup = trx.find('pp_mrp', { ad_client_id: o.ad_client_id, pp_order_id: o.pp_order_id, typemrp: 'S', ordertype: 'MOP' }).filter((r) => r.pp_order_bomline_id == null)[0] || null;
    const f = {}; const tmp = {}; setPPOrder(tmp, o);
    Object.assign(f, tmp, { ad_org_id: sup ? sup.ad_org_id : o.ad_org_id, typemrp: 'S', m_product_id: o.m_product_id, m_warehouse_id: o.m_warehouse_id, qty: num(dec(o.qtyordered).subtract(dec(o.qtydelivered))), c_order_id: null, c_orderline_id: null });
    let e = saveMrp(trx, sup, f); if (e) return e;
    for (const d of trx.find('pp_mrp', { ad_client_id: o.ad_client_id, pp_order_id: o.pp_order_id, typemrp: 'D', ordertype: 'MOP' })) { const t2 = {}; setPPOrder(t2, o); e = saveMrp(trx, d, t2); if (e) return e; }
    return null;
  }
  function mrpBomLine(trx, obl) {   // MPPMRP.PP_Order_BOMLine :990-1030
    let typeMrp = 'D', qty = dec(obl.qtyrequiered).subtract(dec(obl.qtydelivered));
    if (obl.componenttype === 'CP' || obl.componenttype === 'BY') { typeMrp = 'S'; qty = qty.negate(); }
    const existing = trx.find('pp_mrp', { ad_client_id: obl.ad_client_id, pp_order_bomline_id: obl.pp_order_bomline_id }).filter((r) => r.ordertype === 'MOP')[0] || null;
    const parent = trx.get('pp_order', obl.pp_order_id), f = {}; setPPOrder(f, parent);
    Object.assign(f, { c_order_id: null, c_orderline_id: null, ad_org_id: obl.ad_org_id, typemrp: typeMrp, m_warehouse_id: obl.m_warehouse_id, m_product_id: obl.m_product_id, qty: num(qty) });
    if (!existing) f.pp_order_bomline_id = obl.pp_order_bomline_id;
    return saveMrp(trx, existing, f);
  }
  // MFG_Validator PO_BEFORE_DELETE -> MPPMRP.deleteMRP :493-583. BOM line: the final DELETE only (the Ferry blocks are for MPPOrder/MOrder). DEFERRED, named: voiding draft Requisitions and the MResourceAssignment cleanup.
  function mrpDeleteBomLine(trx, obl) {
    if (!SOURCE.mrpDelete) return null;
    trx.find('pp_mrp', { pp_order_bomline_id: obl.pp_order_bomline_id, ad_client_id: obl.ad_client_id }).filter((m) => m.docstatus === 'DR' || m.docstatus === 'VO').forEach((m) => trx.del('pp_mrp', m));
    return null;
  }
  function mrpDeleteOrder(trx, o) {
    const w = { pp_order_id: o.pp_order_id, ad_client_id: o.ad_client_id };
    let set = trx.find('pp_mrp', w).filter((m) => m.ordertype === 'SOP');
    if (!set.length) set = trx.find('pp_mrp', w).filter((m) => m.ordertype === 'MOP' && m.typemrp === 'S');   // "MO created manually"
    set.forEach((m) => { trx.update('pp_mrp', m, { pp_order_id: null }); });                                       // mrp.setPP_Order_ID(0): the supply row is KEPT, detached
    trx.find('pp_mrp', w).filter((m) => m.docstatus === 'DR' || m.docstatus === 'VO').forEach((m) => trx.del('pp_mrp', m));
    trx.find('pp_mrp', w).filter((m) => m.docstatus === 'IP' && String(m.description || '').indexOf('** Voided Ordered Quantity') === 0).forEach((m) => trx.del('pp_mrp', m));
    return null;
  }
  const validator = (table, fn) => (c, info) => {
    const trx = c && c.trx; if (!trx || !info || !info.record) return null;
    const isNew = !info.recordOld; if (!isChanged(table, info.record, info.recordOld, isNew)) return null;
    return fn(trx, info.record);
  };

  // ── MPPOrder DocAction (DocumentEngine contract: fn(trx, doc) -> status; the engine writes DocStatus) ─────────────────────────────────────────────────
  function reserveLine(trx, row) {          // MPPOrderBOMLine.reserveStock() called directly (prepareIt :640-648): no changed-column gate
    const rec = Object.assign({}, row), parent = trx.get('pp_order', rec.pp_order_id);
    const wh = parent ? Number(parent.m_warehouse_id || 0) : 0; if (wh !== 0 && wh !== Number(rec.m_warehouse_id || 0)) rec.m_warehouse_id = wh;
    const diff = dec(rec.qtyrequiered).subtract(dec(rec.qtyreserved)).subtract(dec(rec.qtydelivered)), p = trx.get('m_product', rec.m_product_id);
    if (diff.signum() !== 0 && isStocked(p)) rec.qtyreserved = num(dec(rec.qtyreserved).add(diff));
    const ch = {}; ['m_warehouse_id', 'qtyreserved'].forEach((c) => { if (lc(rec[c]) !== lc(row[c])) ch[c] = rec[c]; });
    if (Object.keys(ch).length) ML.po(trx, 'pp_order_bomline', row).set('m_warehouse_id', rec.m_warehouse_id).set('qtyreserved', rec.qtyreserved).save();
  }
  function orderLines(trx, orderId) { return trx.find('pp_order_bomline', { pp_order_id: orderId }, ['line']); }
  const orderDoc = {
    prepareIt(trx, doc) {                                                                   // :547-604
      const lines = orderLines(trx, doc.pp_order_id);
      if (!lines.length) { trx._msg = '@NoLines@'; return 'IN'; }
      if (Number(doc.c_doctype_id || 0) !== 0 && lines.some((l) => Number(l.m_warehouse_id || 0) !== Number(doc.m_warehouse_id || 0))) { trx._msg = '@CannotChangeDocType@'; return 'IN'; }
      const ch = {};
      if (['DR', 'IP', 'IN'].indexOf(doc.docstatus) >= 0 || Number(doc.c_doctype_id || 0) === 0) ch.c_doctype_id = doc.c_doctypetarget_id;
      const dt = trx.get('c_doctype', ch.c_doctype_id || doc.c_doctype_id);
      if (!dt || dt.docbasetype !== 'MQO') {                                               // ManufacturingOrder, MaintenanceOrder (a Quality Order does nothing)
        lines.forEach((l) => reserveLine(trx, l));
        const rec = Object.assign({}, doc, ch), e = orderStock(trx, rec); if (e) { trx._msg = e; return 'IN'; }
        if (lc(rec.qtyreserved) !== lc(doc.qtyreserved)) ch.qtyreserved = rec.qtyreserved;
      }
      if (Object.keys(ch).length) trx.update('pp_order', doc, ch);
      return 'IP';
    },
    approveIt(trx, doc) { trx.update('pp_order', doc, { isapproved: 'Y' }); return true; },   // :659-668 (non-quality)
    rejectIt(trx, doc) { trx.update('pp_order', doc, { isapproved: 'N' }); return true; },
    completeIt(trx, doc) {                                                                  // :686-730
      if (doc.docaction === 'PR') return 'IP';                                             // "Just prepare"
      const cur = trx.get('pp_order', doc.pp_order_id);
      if (cur.isapproved !== 'Y') orderDoc.approveIt(trx, cur);
      const e = createStandardCosts(trx, trx.get('pp_order', doc.pp_order_id)); if (e) { trx._msg = e; return 'IN'; }
      const ms = trx.find('pp_order_node', { pp_order_id: doc.pp_order_id }).filter((n) => n.ismilestone === 'Y');   // autoReportActivities :1455-1491 - milestone routings NOT ported
      if (ms.length) { trx._msg = 'DEFERRED: milestone activity auto-reporting (Activity Control collectors) is not ported yet'; return 'IN'; }
      trx.update('pp_order', trx.get('pp_order', doc.pp_order_id), { docaction: 'CL' });
      return 'CO';
    },
    getSummary(trx, doc) { return 'Manufacturing Order ' + (doc && doc.documentno); }
  };
  // MPPOrder.createStandardCosts :1495-1580 - the standard-cost snapshot (PP_Order_Cost) of the finished product, every BOM-line product and every routing resource product
  function costDim(trx, product, as, org, asi) { const lvl = globalThis.ModelCost.costingLevel(trx, product, as); return { org: lvl === 'C' || lvl === 'B' ? 0 : org, asi: lvl === 'C' || lvl === 'O' ? 0 : asi }; }   // CostDimension.updateForProduct
  function createStandardCosts(trx, order) {
    const as = globalThis.ModelMaster.clientAcctSchemas(trx, order.ad_client_id)[0]; if (!as) return 'no accounting schema for client ' + order.ad_client_id;
    const done = {};
    const add = (productId, org, asi) => {
      if (done[productId]) return; done[productId] = 1;
      const product = trx.get('m_product', productId), d = costDim(trx, product, as, Number(org || 0), Number(asi || 0));
      trx.find('m_cost', { ad_client_id: order.ad_client_id, ad_org_id: d.org, m_product_id: productId, m_attributesetinstance_id: d.asi, c_acctschema_id: as.c_acctschema_id, m_costtype_id: as.m_costtype_id }, ['m_costelement_id']).forEach((c) => {
        const oc = ML.newRecord(trx, 'pp_order_cost', { ad_client_id: c.ad_client_id, ad_org_id: c.ad_org_id, pp_order_id: order.pp_order_id, c_acctschema_id: c.c_acctschema_id, m_costtype_id: c.m_costtype_id,
          cumulatedamt: c.cumulatedamt, cumulatedqty: c.cumulatedqty, currentcostprice: c.currentcostprice, currentcostpricell: c.currentcostpricell, m_product_id: c.m_product_id, m_attributesetinstance_id: c.m_attributesetinstance_id, m_costelement_id: c.m_costelement_id });
        if (!oc.save()) throw new Error(oc.error);
      });
    };
    try {
      add(order.m_product_id, order.ad_org_id, order.m_attributesetinstance_id);
      orderLines(trx, order.pp_order_id).forEach((l) => add(l.m_product_id, l.ad_org_id, l.m_attributesetinstance_id));
      const wf = trx.find('pp_order_workflow', { pp_order_id: order.pp_order_id })[0];
      if (wf) trx.find('pp_order_node', { pp_order_workflow_id: wf.pp_order_workflow_id }).filter(active).sort((a, b) => Number(a.pp_order_node_id) - Number(b.pp_order_node_id)).forEach((n) => {
        if (!(Number(n.s_resource_id) > 0)) return;
        const rp = trx.find('m_product', { s_resource_id: n.s_resource_id })[0]; if (!rp) throw new Error('no product for resource ' + n.s_resource_id + ' (MProduct.forS_Resource_ID)');
        add(rp.m_product_id, n.ad_org_id, 0);
      });
    } catch (e) { return e.message; }
    return null;
  }

  return {
    docActions: { pp_order: orderDoc }, createStandardCosts,
    models: { pp_order: { beforeSave: orderBeforeSave, afterSave: orderAfterSave, beforeDelete: orderBeforeDelete }, pp_order_bomline: { beforeSave: bomLineBeforeSave } },
    validators: [
      ['pp_order', 'AFTER_NEW', 'Libero.MPPMRP.PP_Order', validator('pp_order', mrpPPOrder)],
      ['pp_order', 'AFTER_CHANGE', 'Libero.MPPMRP.PP_Order', validator('pp_order', mrpPPOrder)],
      ['pp_order_bomline', 'AFTER_NEW', 'Libero.MPPMRP.PP_Order_BOMLine', validator('pp_order_bomline', mrpBomLine)],
      ['pp_order_bomline', 'AFTER_CHANGE', 'Libero.MPPMRP.PP_Order_BOMLine', validator('pp_order_bomline', mrpBomLine)],
      ['pp_order', 'BEFORE_DELETE', 'Libero.MPPMRP.deleteMRP', (c, info) => (c && c.trx && info && info.record ? mrpDeleteOrder(c.trx, info.record) : null)],
      ['pp_order_bomline', 'BEFORE_DELETE', 'Libero.MPPMRP.deleteMRP', (c, info) => (c && c.trx && info && info.record ? mrpDeleteBomLine(c.trx, info.record) : null)]
    ]
  };
}

// hot chunk contract (plugin_registry): activate registers the SYNC hooks before the bundle reports ACTIVE; the scope facades undo everything on stop.
export async function activate(ctx) {
  const m = create(ctx);
  Object.keys(m.models).forEach((t) => ctx.docAction.registerModel(t, m.models[t]));
  Object.keys(m.docActions || {}).forEach((t) => ctx.docAction.registerDocAction(t, m.docActions[t]));
  // the document-action FSM entry (ad_docfsm DOC_FAMILY) of AD_Table PP_Order 53027: prepare/complete are ported; void/close/reverse/re-activate are DEFERRED (MPPOrder.voidIt/closeIt/reActivateIt), so no Void arm is offered (vo: {}).
  if (ctx.docFsm) ctx.docFsm.register(53027, { name: 'PP_Order', reActivate: false, rc: false, ra: false, vo: {} });
  m.validators.forEach((v) => ctx.modelval.registerValidator(v[0], v[1], v[2], v[3]));
}
export async function deactivate() {}
