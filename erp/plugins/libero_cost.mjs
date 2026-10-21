// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_cost.mjs: HOT chunk of the Libero bundle, slice 3 (prompts/mfg/LIBERO_COST_SLICE3_SPEC.md; Witness W-LIBERO-COST). The PP_Cost_Collector model + DocAction for Component Issue (110) and Material
//   Receipt (100), StorageEngine.createTransaction, CostEngine.createCostDetail / createRateVariances. Core ports are REUSED (ModelTrade storage, ModelCost MCostDetail, ModelMaster acct schemas). Pure: no clock, no random.
//   Every type it does not port is REFUSED by name (never a silent no-op).
export const DEFERRED = [
  'Mix variance (150) completion beyond the bomline update',
  'MPPOrder.closeIt (order Close) - backflush with isCloseDocument is REFUSED by name',
  'MPPCostCollector.reverseCorrectIt / voidIt (voidIt is false upstream) and subcontracting createPO',
  'StorageEngine: MStorageOnHand.getWarehouse guarantee-date filter and MAttributeSetInstance.create lot/serial/guarantee generation',
  'Doc_PPCostCollector Receipt scrap branch (named refusal). Milestones and subcontracting (createPO) ARE ported, incl. two upstream quirks (spec slice 6 §MILESTONE, §SUBCONTRACT)'
];
export const SOURCE = { traceByLot: true, activityRate: true, routeBase: true, batchMult: true, closeNode: true, detailsPerSchema: false, calculateFG: true, perRow: true, scrapDivide: false };   // LBACK_BREAK=perrow|scrapdiv flip these to prove the backflush witness sees the storage-row and no-scrap-divide rules   // LCOST_BREAK=calcfg flips it to prove the witness sees the finished-goods cost rule
const T_RECEIPT = '100', T_ISSUE = '110', T_USAGE = '120', T_METHOD = '130', T_RATE = '140', T_MIX = '150', T_ACTIVITY = '160';

export function create(ctx) {
  const ML = ctx.docAction, D = ML.D, ZERO = D(0), D100 = D(100), BDc = D(0).constructor, RM_HALF_UP = 'HALF_UP', RM_HALF_EVEN = 'HALF_EVEN';
  const MC = () => globalThis.ModelCost, T = () => globalThis.ModelTrade, MM = () => globalThis.ModelMaster;
  const asiOf = (v) => (v == null || v === '' ? 0 : v);   // an ASI created in this Trx is a '#new:i' placeholder: NEVER Number() it
  const dec = (v) => D(v == null ? 0 : v), num = (v) => ML.N(v), lc = (v) => (v == null ? v : String(v)), active = (r) => r.isactive == null || r.isactive === '' || r.isactive === 'Y';

  // ── type predicates (MPPCostCollector :894-960) ─────────────────────────────────────────────────────────────────
  const isType = (cc, ...ts) => ts.indexOf(String(cc.costcollectortype)) >= 0;
  const idSet = (v) => v != null && v !== '' && Number(v) !== 0;   // a record created in this session carries a NEGATIVE key until its op group is folded: 'set' means non-zero, not > 0
  const isIssue = (cc) => isType(cc, T_ISSUE) || (isType(cc, T_METHOD) && idSet(cc.pp_order_bomline_id)) || (isType(cc, T_MIX) && idSet(cc.pp_order_bomline_id));
  const isReceipt = (cc) => isType(cc, T_RECEIPT), isActivity = (cc) => isType(cc, T_ACTIVITY), isVariance = (cc) => isType(cc, T_METHOD, T_USAGE, T_RATE, T_MIX);
  const movementType = (cc) => (isReceipt(cc) ? 'W+' : isIssue(cc) ? 'W-' : null);

  // ── MPPCostCollector.setPP_Order(cc, order) :144-160 + createCollector :73-142 (the field population; the caller saves and completes it) ──
  function collectorFields(trx, order, p) {
    const wf = trx.find('pp_order_workflow', { pp_order_id: order.pp_order_id })[0];
    const f = { pp_order_id: order.pp_order_id, pp_order_workflow_id: wf ? wf.pp_order_workflow_id : null, ad_org_id: order.ad_org_id, m_warehouse_id: order.m_warehouse_id, ad_orgtrx_id: order.ad_orgtrx_id,
      c_activity_id: order.c_activity_id, c_campaign_id: order.c_campaign_id, c_project_id: order.c_project_id, description: order.description, s_resource_id: order.s_resource_id, m_product_id: order.m_product_id,
      c_uom_id: order.c_uom_id, m_attributesetinstance_id: order.m_attributesetinstance_id, movementqty: order.qtyordered,
      docstatus: 'DR', docaction: 'CO', isactive: 'Y', posted: 'N', processing: 'N', processed: 'N' };
    return Object.assign(f, {
      pp_order_bomline_id: p.bomLineId || null, pp_order_node_id: p.nodeId || null, c_doctype_id: p.docTypeId, c_doctypetarget_id: p.docTypeId, costcollectortype: p.type,
      m_locator_id: p.locatorId, m_attributesetinstance_id: p.asiId || 0, s_resource_id: p.resourceId || order.s_resource_id, movementdate: p.movementDate, dateacct: p.movementDate,
      movementqty: num(dec(p.qty)), scrappedqty: num(dec(p.scrap)), qtyreject: num(dec(p.reject)), setuptimereal: p.durationSetup || 0, durationreal: num(dec(p.duration)), m_product_id: p.productId || order.m_product_id,
      user1_id: order.user1_id, user2_id: order.user2_id, c_uom_id: p.bomLineId ? null : order.c_uom_id });   // an issue takes the BOM line's UOM in beforeSave (:100-103)
  }

  // ── model class: MPPCostCollector.beforeSave :712-745 ───────────────────────────────────────────────────────────
  function beforeSave(trx, rec) {
    if (!(Number(rec.m_locator_id || 0) > 0) && Number(rec.m_warehouse_id || 0) > 0) {
      const l = trx.find('m_locator', { m_warehouse_id: rec.m_warehouse_id }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id))[0];
      if (l) rec.m_locator_id = l.m_locator_id;
    }
    if (isIssue(rec)) {
      if (!idSet(rec.pp_order_bomline_id)) return 'FillMandatory: PP_Order_BOMLine_ID';
      const bl = trx.get('pp_order_bomline', rec.pp_order_bomline_id);
      if (!(Number(rec.c_uom_id || 0) > 0)) rec.c_uom_id = bl.c_uom_id;
      if (Number(rec.c_uom_id) !== Number(bl.c_uom_id)) return '@PP_Cost_Collector_ID@ @C_UOM_ID@ <> @PP_Order_BOMLine_ID@ @C_UOM_ID@';
    }
    if (isActivity(rec) && !idSet(rec.pp_order_node_id)) return 'FillMandatory: PP_Order_Node_ID';
    return null;
  }

  // ── StorageEngine ───────────────────────────────────────────────────────────────────────────────────────────────
  const stocked = (p) => !!p && p.isstocked === 'Y' && p.producttype === 'I';
  function mmPolicyFifo(trx, p) { const cat = trx.get('m_product_category', p.m_product_category_id) || {}, cl = trx.get('ad_client', trx.env.client) || {}; return (cat.mmpolicy || cl.mmpolicy || 'F') === 'F'; }
  function newAsi(trx, product) {   // MAttributeSetInstance.create (lot/serial/guarantee generation DEFERRED)
    const r = ML.newRecord(trx, 'm_attributesetinstance', { ad_client_id: product.ad_client_id, ad_org_id: 0, m_attributeset_id: product.m_attributeset_id || 0 }); if (!r.save()) throw new Error(r.error); return r.row.m_attributesetinstance_id;
  }
  // MStorageOnHand.getWarehouse(wh, product, asi, minGuaranteeDate, fifo, positiveOnly, locator) :398-533 (guarantee-date filter DEFERRED)
  function getWarehouse(trx, whId, productId, asi, fifo, positiveOnly, locatorId) {
    let rows = trx.find('m_storageonhand', { m_product_id: productId }).filter((s) => {
      const loc = trx.get('m_locator', s.m_locator_id); if (!loc) return false;
      if (locatorId > 0 ? Number(s.m_locator_id) !== Number(locatorId) : Number(loc.m_warehouse_id) !== Number(whId)) return false;
      if (asi && Number(s.m_attributesetinstance_id || 0) !== Number(asi)) return false;
      const q = dec(s.qtyonhand); return positiveOnly ? q.signum() > 0 : q.signum() !== 0;
    });
    const pri = (s) => Number((trx.get('m_locator', s.m_locator_id) || {}).priorityno || 0), dmp = (s) => String(s.datematerialpolicy || '');
    rows.sort((a, b) => (pri(b) - pri(a)) || (fifo ? (dmp(a) < dmp(b) ? -1 : dmp(a) > dmp(b) ? 1 : Number(a.m_attributesetinstance_id) - Number(b.m_attributesetinstance_id))
      : (dmp(a) < dmp(b) ? 1 : dmp(a) > dmp(b) ? -1 : Number(b.m_attributesetinstance_id) - Number(a.m_attributesetinstance_id))));
    return rows;
  }
  function createMA(trx, cc, asi, qty) { const r = ML.newRecord(trx, 'pp_cost_collectorma', { ad_org_id: cc.ad_org_id, pp_cost_collector_id: cc.pp_cost_collector_id, m_attributesetinstance_id: asi, movementqty: num(qty) }); if (!r.save()) throw new Error(r.error); }
  // StorageEngine.checkMaterialPolicy :146-250 on the collector; returns the updated asi (or unchanged)
  function checkMaterialPolicy(trx, cc, mt, date, whId, product) {
    trx.find('pp_cost_collectorma', { pp_cost_collector_id: cc.pp_cost_collector_id }).forEach((r) => ML.po(trx, 'pp_cost_collectorma', r).deleteEx());   // deleteMA
    const incoming = mt.charAt(1) === '+', fifo = mmPolicyFifo(trx, product), qty = dec(cc.movementqty); let asi = asiOf(cc.m_attributesetinstance_id);
    if (asi === 0) {
      if (incoming) {
        const neg = getWarehouse(trx, whId, cc.m_product_id, 0, fifo, false, cc.m_locator_id).filter((s) => dec(s.qtyonhand).signum() < 0)[0];   // "auto balance negative on hand"
        asi = neg ? neg.m_attributesetinstance_id : newAsi(trx, product);                                                              // "always create asi so fifo/lifo work"
        cc.m_attributesetinstance_id = asi; createMA(trx, cc, asi, qty);
      } else {
        let left = qty;
        for (const st of getWarehouse(trx, whId, cc.m_product_id, 0, fifo, true, cc.m_locator_id)) {
          const oh = dec(st.qtyonhand);
          if (oh.compareTo(left) >= 0) { createMA(trx, cc, st.m_attributesetinstance_id, left); left = ZERO; } else { createMA(trx, cc, st.m_attributesetinstance_id, oh); left = left.subtract(oh); }
          if (left.signum() === 0) break;
        }
        if (left.signum() !== 0) createMA(trx, cc, newAsi(trx, product), left);                                                                 // "deliver using new asi"
      }
    } else if (!incoming) createMA(trx, cc, asi, qty);
    if (String(asiOf(cc.m_attributesetinstance_id)) !== String(asiOf(trx.get('pp_cost_collector', cc.pp_cost_collector_id).m_attributesetinstance_id))) trx.update('pp_cost_collector', trx.get('pp_cost_collector', cc.pp_cost_collector_id), { m_attributesetinstance_id: cc.m_attributesetinstance_id });
  }
  function acctSchemas(trx, org) { return MM().clientAcctSchemas(trx, trx.env.client).filter((as) => !isSkipOrg(trx, as, org)); }
  function isSkipOrg(trx, as, org) { const only = Number(as.ad_orgonly_id || 0); if (only === 0 || only === Number(org)) return false; const o = trx.get('ad_org', only); return !o || o.issummary !== 'Y' ? true : false; }
  // StorageEngine.createTransaction :49-140. Throws on a storage failure (Java: AdempiereException).
  function createTransaction(trx, cc, mt, date, qty, whId) {
    const product = trx.get('m_product', cc.m_product_id), incoming = mt.charAt(1) === '+'; if (!stocked(product)) return;
    if (!(Number(cc.m_locator_id || 0) > 0)) throw new Error('M_Locator_ID is mandatory for a stock transaction (MTransaction)');   // beforeSave defaults it from the warehouse; a record that skipped beforeSave has none
    checkMaterialPolicy(trx, cc, mt, date, whId, product);
    const cur = trx.get('pp_cost_collector', cc.pp_cost_collector_id), tr = ML.D;
    const move = (asi, q, dmp) => {
      const qq = incoming ? q : q.negate(), e = T().storageAdd(trx, cc.m_locator_id, cc.m_product_id, asi, qq, dmp || date); if (e) throw new Error(e);
      const mtrx = ML.newRecord(trx, 'm_transaction', { ad_org_id: cc.ad_org_id, movementtype: mt, m_locator_id: cc.m_locator_id, m_product_id: cc.m_product_id, m_attributesetinstance_id: asi, movementqty: num(qq), movementdate: date, pp_cost_collector_id: cc.pp_cost_collector_id });
      if (!mtrx.save()) throw new Error(mtrx.error);
      createCostDetail(trx, cc, mtrx.row);
    };
    if (String(asiOf(cur.m_attributesetinstance_id)) === '0') {
      trx.find('pp_cost_collectorma', { pp_cost_collector_id: cc.pp_cost_collector_id }, ['pp_cost_collectorma_id']).forEach((ma) => {
        const st = trx.find('m_storageonhand', { m_locator_id: cc.m_locator_id, m_product_id: cc.m_product_id, m_attributesetinstance_id: asiOf(ma.m_attributesetinstance_id) })[0];
        move(asiOf(ma.m_attributesetinstance_id), dec(ma.movementqty), st ? st.datematerialpolicy : null);
      });
    } else move(cur.m_attributesetinstance_id, qty, null);
    void tr;
  }

  // ── CostEngine ──────────────────────────────────────────────────────────────────────────────────────────────────
  const libMethod = (trx, product, as) => { const a = trx.find('m_product_category_acct', { m_product_category_id: product.m_product_category_id, c_acctschema_id: as.c_acctschema_id })[0]; return a && a.costingmethod ? a.costingmethod : 'S'; };   // getCostingMethod :55-65
  const roundCost = (trx, price, as) => { const prec = MC().costingPrecision(trx, as); return price.scale() > prec ? price.setScale(prec, RM_HALF_UP) : price; };
  const elements = (trx) => trx.find('m_costelement', { ad_client_id: trx.env.client, costingmethod: 'S' }, ['m_costelement_id']).filter(active);   // MCostElement.getByCostingMethod(ctx,'S')
  function costDim(trx, product, as, org, asi) { const lvl = MC().costingLevel(trx, product, as); return { org: lvl === 'C' || lvl === 'B' ? 0 : org, asi: lvl === 'C' || lvl === 'O' ? 0 : asi }; }
  function actualPrice(trx, cc, product, as, element) {      // getProductActualCostPrice :105-125
    const d = costDim(trx, product, as, Number(cc.ad_org_id || 0), Number(product.m_attributesetinstance_id || 0));
    const c = trx.find('m_cost', { ad_client_id: trx.env.client, ad_org_id: d.org, m_product_id: product.m_product_id, m_attributesetinstance_id: d.asi, c_acctschema_id: as.c_acctschema_id, m_costtype_id: as.m_costtype_id, m_costelement_id: element.m_costelement_id })[0];
    return c ? roundCost(trx, dec(c.currentcostprice).add(dec(c.currentcostpricell)), as) : ZERO;
  }
  function standardPrice(trx, cc, product, as, element) {    // getProductStandardCostPrice :127-147 (the PP_Order_Cost snapshot of the order)
    const d = costDim(trx, product, as, Number(cc.ad_org_id || 0), Number(product.m_attributesetinstance_id || 0));
    const oc = trx.find('pp_order_cost', { pp_order_id: cc.pp_order_id, ad_client_id: trx.env.client, ad_org_id: d.org, m_product_id: product.m_product_id, m_attributesetinstance_id: d.asi, c_acctschema_id: as.c_acctschema_id, m_costtype_id: as.m_costtype_id, m_costelement_id: element.m_costelement_id })[0];
    return oc ? roundCost(trx, dec(oc.currentcostprice).add(dec(oc.currentcostpricell)), as) : ZERO;
  }
  // CostEngine.getCostDetail(cc) is `.first()` with no ORDER BY = the first row INSERTED = the first acct schema x the first Standard element (the creation loops' order). Key order is NOT used: a sidecar-projected row carries a negative synthetic key, so ascending key order would be reverse creation order.
  const firstDetail = (trx, ccId) => { const ds = trx.find('m_costdetail', { pp_cost_collector_id: ccId }); if (!ds.length) return null; const sch = acctSchemas(trx, ds[0].ad_org_id).map((a) => String(a.c_acctschema_id)), els = elements(trx).map((e) => String(e.m_costelement_id));
    const rank = (d) => (sch.indexOf(String(d.c_acctschema_id)) + 1 || 99) * 1000 + (els.indexOf(String(d.m_costelement_id)) + 1 || 999); return ds.slice().sort((a, b) => rank(a) - rank(b))[0]; };
  function calculateFG(trx, current, isVar) {                // :220-272
    const mo = trx.get('pp_order', current.pp_order_id); let amtIssue = ZERO, delivered = ZERO, foh = ZERO;
    for (const cc of trx.find('pp_cost_collector', { pp_order_id: current.pp_order_id, docstatus: 'CO' })) {
      const cd = firstDetail(trx, cc.pp_cost_collector_id); if (!cd) continue;
      const a = dec(cd.amt).abs();
      if (cc.costcollectortype === T_ISSUE) amtIssue = amtIssue.add(a); else if (cc.costcollectortype === T_RECEIPT) delivered = delivered.add(a);
      else if (cc.costcollectortype === T_ACTIVITY) foh = foh.add(a); else if (cc.costcollectortype === T_MIX) amtIssue = amtIssue.add(a);
    }
    const remaining = amtIssue.add(foh).subtract(delivered);
    if (isVar) return remaining;
    const open = dec(mo.qtyentered).subtract(dec(mo.qtydelivered));
    if (open.signum() === 0) throw new Error('BigDecimal divide by zero: order QtyEntered - QtyDelivered = 0 (CostEngine.calculateFG :258; set QtyEntered on the order)');
    return dec(current.movementqty).abs().divide(open, 8, RM_HALF_EVEN).multiply(remaining);
  }
  // CostEngine.createCostDetail :258-320 (called once per M_Transaction)
  function createCostDetail(trx, cc, mtrx) {
    const M = MC();
    for (const as of acctSchemas(trx, mtrx.ad_org_id)) {
      const product = trx.get('m_product', mtrx.m_product_id), method = M.costingMethod(trx, product, as);
      if (libMethod(trx, product, as) !== method) throw new Error('Costing method not supported - ' + method);
      for (const el of elements(trx)) {
        // deleteCostDetail: unprocessed zero differences of this collector/schema/asi/element
        trx.find('m_costdetail', { pp_cost_collector_id: cc.pp_cost_collector_id, c_acctschema_id: as.c_acctschema_id, m_attributesetinstance_id: mtrx.m_attributesetinstance_id, m_costelement_id: el.m_costelement_id })
          .filter((r) => r.processed === 'N' && dec(r.deltaamt).signum() === 0 && dec(r.deltaqty).signum() === 0).forEach((r) => ML.po(trx, 'm_costdetail', r).deleteEx());
        const qty = dec(mtrx.movementqty), price = actualPrice(trx, cc, product, as, el);
        let amt = roundCost(trx, price.multiply(qty), as);
        if (SOURCE.calculateFG && el.costelementtype === 'M' && cc.costcollectortype === T_RECEIPT) amt = calculateFG(trx, cc, false);
        const ex = trx.find('m_costdetail', { ad_client_id: mtrx.ad_client_id, ad_org_id: mtrx.ad_org_id, pp_cost_collector_id: cc.pp_cost_collector_id, m_product_id: mtrx.m_product_id,
          m_attributesetinstance_id: mtrx.m_attributesetinstance_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: el.m_costelement_id })[0];
        if (!ex) {   // new MCostDetail(as, org, product, asi, element, amt, qty, desc, trx) ; setPP_Cost_Collector_ID
          const h = M.cdNew(trx, as, mtrx.ad_org_id, mtrx.m_product_id, mtrx.m_attributesetinstance_id, el.m_costelement_id, amt, qty, cc.description, null, 0);
          h.row.pp_cost_collector_id = cc.pp_cost_collector_id; M.cdSave(trx, h); if (h.row.processed !== 'Y') M.cdProcess(trx, h);
        } else {
          const h = { row: ex, isNew: false, changes: {} };
          M.cdSet(h, 'deltaamt', num(amt.subtract(dec(ex.amt)))); M.cdSet(h, 'deltaqty', num(qty.subtract(dec(ex.qty))));
          if (M.isDelta(h.row)) { M.cdSet(h, 'processed', 'N'); M.cdSet(h, 'amt', num(amt)); M.cdSet(h, 'qty', num(qty)); }
          M.cdSave(trx, h); if (h.row.processed !== 'Y') M.cdProcess(trx, h);
        }
      }
    }
  }
  // CostEngine.createRateVariances :520-585 (Component Issue only here: Activity Control is deferred)
  // CostEngine.createVarianceCostCollector :330-345 - a copy of the source collector (copyValues), Drafted, the variance type, no DocumentNo
  function varianceCollector(trx, cc, type) {
    const cp = Object.assign({}, trx.get('pp_cost_collector', cc.pp_cost_collector_id)); ['pp_cost_collector_id', 'pp_cost_collector_uu', 'documentno', 'created', 'updated', 'createdby', 'updatedby'].forEach((k) => delete cp[k]);
    Object.assign(cp, { processing: 'N', processed: 'N', docstatus: 'DR', docaction: 'CO', costcollectortype: type });
    const r = ML.newRecord(trx, 'pp_cost_collector', cp); if (!r.save()) throw new Error(r.error); return r.row;
  }
  // CostEngine.createVarianceCostDetail :411-440 - a copy of `cd` (when given) or a fresh detail of `product` (ASI 0), on the variance collector, amt/qty set, then processed
  function varianceDetail(trx, ccv, amt, q, cd, product, as, el) {
    let h;
    if (cd) { const cp = Object.assign({}, cd); ['m_costdetail_id', 'm_costdetail_uu', 'created', 'updated', 'createdby', 'updatedby'].forEach((k) => delete cp[k]);
      Object.assign(cp, { processed: 'N', deltaamt: 0, deltaqty: 0 }); if (product) Object.assign(cp, { m_product_id: product.m_product_id, m_attributesetinstance_id: 0 }); h = { row: cp, isNew: true }; }
    else h = MC().cdNew(trx, as, ccv.ad_org_id, product.m_product_id, 0, el.m_costelement_id, amt, q, '', null, 0);
    Object.assign(h.row, { pp_cost_collector_id: ccv.pp_cost_collector_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: el.m_costelement_id, amt: num(amt), qty: num(q) });
    MC().cdSave(trx, h); if (h.row.processed !== 'Y') MC().cdProcess(trx, h);
  }
  const wfNodeResource = (trx, cc) => { const n = trx.get('pp_order_node', cc.pp_order_node_id), w = n && trx.get('ad_wf_node', n.ad_wf_node_id); return w ? w.s_resource_id : null; };   // getPP_Order_Node().getAD_WF_Node().getS_Resource_ID()
  // CostEngine.createRateVariances :525-581 - Activity Control (the routing resource's product) and Component Issue (the BOM line product): std vs actual per element
  function createRateVariances(trx, cc) {
    let product;
    if (isActivity(cc)) { if (!SOURCE.activityRate) return null; product = resourceProduct(trx, wfNodeResource(trx, cc)); trx.say('§LIBERO-RATE-ACT collector=' + cc.documentno + ' wfResource=' + wfNodeResource(trx, cc) + ' product=' + (product && product.m_product_id)); if (!product) return null; }
    else if (isType(cc, T_ISSUE)) product = trx.get('m_product', trx.get('pp_order_bomline', cc.pp_order_bomline_id).m_product_id);
    else return null;
    let ccrv = null;
    for (const as of acctSchemas(trx, cc.ad_org_id)) for (const el of elements(trx)) {
      const cd = trx.find('m_costdetail', { pp_cost_collector_id: cc.pp_cost_collector_id, m_costelement_id: el.m_costelement_id }, ['m_costdetail_id'])[0]; if (!cd) continue;
      const qty = dec(cd.qty), std = standardPrice(trx, cc, product, as, el), act = actualPrice(trx, cc, product, as, el);
      if (el.costelementtype === 'M' || isActivity(cc)) trx.say('§LIBERO-RATE-CHECK collector=' + cc.documentno + ' schema=' + as.c_acctschema_id + ' element=' + el.m_costelement_id + ' std=' + std.toString() + ' actual=' + act.toString() + ' qty=' + qty.toString());
      const amtStd = roundCost(trx, std.multiply(qty), as), amtAct = roundCost(trx, act.multiply(qty), as);
      if (amtStd.compareTo(amtAct) === 0) continue;
      if (!ccrv) ccrv = varianceCollector(trx, cc, T_RATE);
      varianceDetail(trx, ccrv, amtAct.negate(), qty.negate(), cd, null, as, el); varianceDetail(trx, ccrv, amtStd, qty, cd, null, as, el);
      trx.say('§LIBERO-RATE-VARIANCE collector=' + cc.documentno + ' type=' + cc.costcollectortype + ' element=' + el.m_costelement_id + ' std=' + amtStd.toString() + ' actual=' + amtAct.toString());
    }
    if (ccrv) { const r = ML.processIt(trx, 'pp_cost_collector', ccrv.pp_cost_collector_id, 'CO'); if (!r.ok) return r.msg || 'rate variance collector not completed'; }
    return null;
  }
  // CostEngine.createMethodVariances :583-656 - (a) a Method Change collector books its own product at the ACTUAL price per element; (b) an Activity reported on a resource other than the
  //   routing's books actual - standard resource cost on a new Method Change collector (std/actual priced as ACTUAL cost of each resource's product, qty = the resource base value)
  function createMethodVariances(trx, cc) {
    if (isType(cc, T_METHOD)) {
      const product = trx.get('m_product', cc.m_product_id), qty = dec(cc.movementqty);
      for (const as of acctSchemas(trx, cc.ad_org_id)) for (const el of elements(trx)) {
        const amt = actualPrice(trx, cc, product, as, el).multiply(qty);                       // not rounded upstream
        varianceDetail(trx, cc, amt, qty, null, product, as, el);
      }
      trx.say('§LIBERO-METHOD-VARIANCE collector=' + cc.documentno + ' (method change) product=' + product.m_product_id + ' qty=' + qty.toString());
      return null;
    }
    if (!isActivity(cc)) return null;
    const stdRes = wfNodeResource(trx, cc), actRes = cc.s_resource_id;
    if (Number(stdRes) === Number(actRes)) return null;
    let ccmv = null; const fg = trx.get('m_product', cc.m_product_id), pStd = resourceProduct(trx, stdRes), pAct = resourceProduct(trx, actRes);
    for (const as of acctSchemas(trx, cc.ad_org_id)) for (const el of elements(trx)) {
      void fg;
      const ps = actualPrice(trx, cc, pStd, as, el), pa = actualPrice(trx, cc, pAct, as, el);
      if (ps.compareTo(pa) === 0) continue;
      if (!ccmv) ccmv = varianceCollector(trx, cc, T_METHOD);
      const qty = getResourceBaseValue(trx, actRes, cc);
      varianceDetail(trx, ccmv, pa.multiply(qty), qty, null, pAct, as, el); varianceDetail(trx, ccmv, ps.multiply(qty).negate(), qty.negate(), null, pStd, as, el);
      trx.say('§LIBERO-METHOD-VARIANCE collector=' + cc.documentno + ' resource std=' + stdRes + ' actual=' + actRes + ' element=' + el.m_costelement_id + ' std=' + ps.toString() + ' actual=' + pa.toString() + ' qty=' + qty.toString());
    }
    if (ccmv) { const r = ML.processIt(trx, 'pp_cost_collector', ccmv.pp_cost_collector_id, 'CO'); if (!r.ok) return r.msg || 'method variance collector not completed'; }
    return null;
  }


  // ── DocAction (MPPCostCollector.prepareIt :300-387 / completeIt :404-570), Issue + Receipt only ─────────────────────────
  const NOT_PORTED = () => null;   // every collector type is ported (Method Change 130: createMethodVariances; Rate 140 / Mix 150 completions are a bomline/order update only)
  function asiMandatory(trx, product, isSO) {   // MProduct.isASIMandatory
    for (const as of MM().clientAcctSchemas(trx, product.ad_client_id)) if (MC().costingLevel(trx, product, as) === 'B') return true;
    if (!Number(product.m_attributeset_id || 0)) return false;
    const set = trx.get('m_attributeset', product.m_attributeset_id); if (!set || set.isinstanceattribute !== 'Y') return false;
    return isSO ? set.mandatorytype === 'Y' : set.mandatorytype === 'Y';   // Always only (isMandatoryAlways); the 'S' sales-only type is not an incoming requirement
  }
  const doc = {
    prepareIt(trx, d) {
      const nm = NOT_PORTED(d); if (nm) { trx._msg = nm; return 'IN'; }
      if (!T().periodOpen(trx, d.dateacct, 'MCC', d.ad_org_id)) { trx._msg = '@PeriodClosed@'; return 'IN'; }
      const ch = { c_doctype_id: d.c_doctypetarget_id };
      if (isActivity(d)) { try { activityPrepare(trx, d); } catch (e) { trx._msg = e.message; return 'IN'; } }
      const product = trx.get('m_product', d.m_product_id);
      if (isIssue(d) && Number(d.m_attributesetinstance_id || 0) === 0 && asiMandatory(trx, product, false)) { trx._msg = '@M_AttributeSet_ID@ @IsMandatory@ @M_Product_ID@=' + product.value; return 'IN'; }
      if (isReceipt(d) && Number(d.m_attributesetinstance_id || 0) === 0 && asiMandatory(trx, product, true)) { trx._msg = '@M_AttributeSet_ID@ @IsMandatory@ @M_Product_ID@=' + product.value; return 'IN'; }
      ch.docaction = 'CO'; trx.update('pp_cost_collector', d, ch); return 'IP';
    },
    completeIt(trx, d0) {
      const nm = NOT_PORTED(d0); if (nm) { trx._msg = nm; return 'IN'; }
      const cc = trx.get('pp_cost_collector', d0.pp_cost_collector_id);
      if (isActivity(cc) && Number(cc.pp_order_node_id || 0) !== 0) { const sn = trx.get('pp_order_node', cc.pp_order_node_id); if (sn && sn.issubcontracting === 'Y') {   // :483-510 returns before every other branch
        if (nodeProcessed(sn)) { trx._msg = 'Order Activity Already Processed - ' + nodeStr(sn); return 'IN'; }
        try { return subcontractComplete(trx, cc); } catch (e) { trx._msg = e.message; return 'IN'; } } }
      try {
        const qty = dec(cc.movementqty), scrap = dec(cc.scrappedqty), rej = dec(cc.qtyreject);
        if (isIssue(cc) || isReceipt(cc)) {
          const product = trx.get('m_product', cc.m_product_id);
          if (stocked(product) && !isVariance(cc)) createTransaction(trx, cc, movementType(cc), cc.movementdate, qty, cc.m_warehouse_id);
          if (isIssue(cc)) {          // update the PP Order Line :430-440
            const bl = ML.po(trx, 'pp_order_bomline', trx.get('pp_order_bomline', cc.pp_order_bomline_id));
            bl.set('qtydelivered', num(dec(bl.get('qtydelivered')).add(qty))).set('qtyscrap', num(dec(bl.get('qtyscrap')).add(scrap))).set('qtyreject', num(dec(bl.get('qtyreject')).add(rej))).set('datedelivered', cc.movementdate);
            if (!bl.save()) throw new Error(bl.error);
          }
          if (isReceipt(cc)) {        // update the PP Order :442-460
            const o = ML.po(trx, 'pp_order', trx.get('pp_order', cc.pp_order_id));
            o.set('qtydelivered', num(dec(o.get('qtydelivered')).add(qty))).set('qtyscrap', num(dec(o.get('qtyscrap')).add(scrap))).set('qtyreject', num(dec(o.get('qtyreject')).add(rej))).set('datedelivered', cc.movementdate);
            if (!o.get('datestart')) o.set('datestart', dateStart(trx, cc));
            if (dec(o.get('qtyordered')).subtract(dec(o.get('qtydelivered'))).signum() <= 0) o.set('datefinish', cc.movementdate);
            if (!o.save()) throw new Error(o.error);
          }
        }
        if (isActivity(cc)) activityComplete(trx, cc);
        else if (isType(cc, T_USAGE)) usageComplete(trx, cc);
        let e = createRateVariances(trx, trx.get('pp_cost_collector', cc.pp_cost_collector_id)); if (e) throw new Error(e);
        e = createMethodVariances(trx, trx.get('pp_cost_collector', cc.pp_cost_collector_id)); if (e) throw new Error(e);   // :555-556
        trx.update('pp_cost_collector', trx.get('pp_cost_collector', cc.pp_cost_collector_id), { processed: 'Y', docaction: 'CL' });
      } catch (e) { trx._msg = e.message; trx.say('§LIBERO-COMPLETE-REFUSED collector=' + d0.documentno + ' type=' + d0.costcollectortype + ' ' + e.message + (e.stack ? ' @' + String(e.stack).split('\n').slice(1, 4).join(' <- ') : '')); return 'IN'; }
      return 'CO';
    },
    approveIt() { return true; }, rejectIt() { return true; },
    closeIt(trx, d) { trx.update('pp_cost_collector', d, { docaction: '--' }); return true; },   // :513-520
    voidIt() { return false; },                                                              // :506-511
    getSummary(trx, d) { return 'Cost Collector ' + (d && d.documentno); }
  };
  // ══ SLICE 6 - Activity Control (prompts/mfg/LIBERO_ACTIVITY_SLICE6_SPEC.md) ═══════════════════════════════════════════════════════════
  // RoutingService = DefaultRoutingServiceImpl. Durations are doubles in Java (BigDecimal.valueOf(double)); String(n) of a JS number is Double.toString, bar the trailing ".0".
  const DUR_SEC = { s: 1, m: 60, h: 3600, D: 86400, M: 2592000, Y: 31536000 };   // :707-722 (AD_Workflow.DurationUnit)
  const durationBaseSec = (unit) => (unit == null ? 0 : (DUR_SEC[unit] || 0));
  const TIME_X12 = ['03', 'MJ', 'HR', 'DA', 'WD', 'WK', 'MO', 'WM', 'YR'];                 // :767-780 isTime
  function uomBaseSec(uom) {                                                              // :730-760 - only week, day, hour, minute, second
    const x = String(uom.x12de355);
    if (x === 'WK') return 604800; if (x === 'DA') return 86400; if (x === 'HR') return 3600; if (x === 'MJ') return 60; if (x === '03') return 1;
    throw new Error('@NotSupported@ @C_UOM_ID@=' + uom.name);
  }
  const bdValueOf = (n) => { let t = String(n); if (/e/i.test(t)) t = Number(n).toFixed(20).replace(/0+$/, ''); if (t.indexOf('.') < 0) t += '.0'; return D(t); };   // BigDecimal.valueOf(double)
  const parseTs = (t) => Date.parse(String(t).replace(' ', 'T').replace(/Z?$/, 'Z')), fmtTs = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
  function orderWorkflowOf(trx, orderId) { return trx.find('pp_order_workflow', { pp_order_id: orderId })[0] || {}; }
  // MPPCostCollector.getDateStart/getDateFinish :808-836
  function dateStart(trx, cc) {
    const dur = Number(cc.durationreal || 0);
    if (dur === 0) return cc.movementdate;
    return fmtTs(parseTs(cc.movementdate) - Math.trunc(dur * durationBaseSec(orderWorkflowOf(trx, cc.pp_order_id).durationunit) * 1000.0));
  }
  const dateFinishCC = (cc) => cc.movementdate;
  // DefaultRoutingServiceImpl.calculateDuration(node, cc) :124-180 with a collector
  function calculateDuration(trx, wfNode, cc) {
    if (!wfNode) throw new Error('calculateDuration not supported using Node null!!!');
    const wf = trx.get('ad_workflow', wfNode.ad_workflow_id) || {}, batchSize = Number(wf.qtybatchsize || 0), qwm = Number(wfNode.queuingtime || 0) + Number(wfNode.waitingtime || 0) + Number(wfNode.movingtime || 0);
    const setup = Number(cc.setuptimereal || 0), duration = Number(cc.durationreal || 0), batchS = Number(trx.get('pp_order', cc.pp_order_id).qtybatchs);
    if (Number.isNaN(batchS)) throw new Error('PP_Order.QtyBatchs is null (NullPointerException in calculateDuration :158)');
    const total = batchSize > 1 ? (qwm * (SOURCE.batchMult ? batchS : 1)) + setup + duration : qwm + setup + duration;
    return bdValueOf(total);
  }
  function convertDuration(duration, fromUnit, uom) { const fromMult = durationBaseSec(fromUnit), toDiv = uomBaseSec(uom); return bdValueOf(Number(duration.toString()) * fromMult / toDiv); }   // :789-801
  function resourceProduct(trx, resourceId) { return trx.find('m_product', { s_resource_id: resourceId }).filter(active)[0] || null; }   // MProduct.forS_Resource_ID
  function getResourceBaseValue(trx, resourceId, cc) {                                    // :666-694
    const on = trx.get('pp_order_node', cc.pp_order_node_id), wfNode = on ? trx.get('ad_wf_node', on.ad_wf_node_id) : null;
    const rp = resourceProduct(trx, resourceId), uom = rp ? trx.get('c_uom', rp.c_uom_id) : null;
    if (!uom) throw new Error('S_Resource ' + resourceId + ' has no product / UOM');
    if (TIME_X12.indexOf(String(uom.x12de355)) < 0) throw new Error('@NotSupported@ @C_UOM_ID@ - ' + uom.name);
    const duration = calculateDuration(trx, wfNode, cc), wf = trx.get('ad_workflow', wfNode.ad_workflow_id);
    return SOURCE.routeBase ? convertDuration(duration, wf.durationunit, uom) : duration;
  }
  // CostEngine.createActivityControl :442-483
  function createActivityControl(trx, cc) {
    if (!isType(cc, T_ACTIVITY)) return;
    const M = MC(), product = resourceProduct(trx, cc.s_resource_id); if (!product) throw new Error('No product for S_Resource_ID=' + cc.s_resource_id);
    const qty = getResourceBaseValue(trx, cc.s_resource_id, cc);
    for (const as of acctSchemas(trx, cc.ad_org_id)) {
      const method = M.costingMethod(trx, product, as);
      if (libMethod(trx, product, as) !== method) throw new Error('Costing method not supported - ' + method);
      for (const el of elements(trx)) {
        if (['R', 'O', 'B'].indexOf(el.costelementtype) < 0) continue;      // isActivityControlElement :350-356
        const price = Number(cc.s_resource_id) > 0 ? actualPrice(trx, cc, product, as, el) : ZERO, costs = roundCost(trx, price.multiply(qty), as);
        const h = M.cdNew(trx, as, cc.ad_org_id, product.m_product_id, product.m_attributesetinstance_id || 0, el.m_costelement_id, costs.negate(), qty.negate(), '', null, 0);
        h.row.pp_cost_collector_id = cc.pp_cost_collector_id; M.cdSave(trx, h); if (h.row.processed !== 'Y') M.cdProcess(trx, h);
      }
    }
  }
  // MPPOrderNode (:377-451, :486-515)
  const nodeProcessed = (n) => n.docstatus === 'CO' || n.docstatus === 'CL';
  const nodeStr = (n) => 'MPPOrderNode[' + n.pp_order_node_id + '-' + n.name + ']';
  function nodeSetDateFinish(trx, node, override) {
    if (!nodeProcessed(node)) throw new Error('Calling setDateFinish when the activity is not completed/closed is not allowed');
    if (!override && node.datefinish) return;
    const rows = trx.find('pp_cost_collector', { pp_order_node_id: node.pp_order_node_id, costcollectortype: T_ACTIVITY }).filter((c) => ['IP', 'CO', 'CL'].indexOf(c.docstatus) >= 0);
    if (!rows.length) { trx.say('§LIBERO-WARN Activity Completed/Closed but no cost collectors found!'); return; }
    const max = rows.map((c) => c.movementdate).sort().pop(); ML.po(trx, 'pp_order_node', trx.get('pp_order_node', node.pp_order_node_id)).set('datefinish', max).save();
  }
  function nodeCloseIt(trx, nodeId) {
    const po = ML.po(trx, 'pp_order_node', trx.get('pp_order_node', nodeId)), n = po.row;
    po.set('docstatus', 'CL').set('docaction', '--'); if (!po.save()) throw new Error(po.error);
    nodeSetDateFinish(trx, trx.get('pp_order_node', nodeId), false);
    const fresh = ML.po(trx, 'pp_order_node', trx.get('pp_order_node', nodeId)), old = Number(fresh.row.durationrequiered || 0);
    if (old !== Number(fresh.row.durationreal || 0)) {
      fresh.set('description', (fresh.row.description ? fresh.row.description + ' | ' : '') + 'closed ( Duration :' + old + ') ( QtyRequired :' + fresh.row.qtyrequiered + ')');
      fresh.set('durationrequiered', Number(fresh.row.durationreal || 0)).set('qtyrequiered', fresh.row.qtydelivered);
    }
    if (!fresh.save()) throw new Error(fresh.error); void n;
  }
  function activityNode(trx, cc) { const n = Number(cc.pp_order_node_id) !== 0 && cc.pp_order_node_id != null ? trx.get('pp_order_node', cc.pp_order_node_id) : null; if (!n) throw new Error('FillMandatory: PP_Order_Node_ID'); return n; }
  function activityGuards(trx, node) {
  }
  function nodesInOrder(trx, o) {
    const wf = trx.find('pp_order_workflow', { pp_order_id: o.pp_order_id })[0]; if (!wf) return [];
    const client = (n) => Number(n.ad_client_id || 0) === 0 || Number(n.ad_client_id) === Number(o.ad_client_id);
    const all = trx.find('pp_order_node', { pp_order_workflow_id: wf.pp_order_workflow_id }).filter((n) => active(n) && client(n)), byId = {}; all.forEach((n) => { byId[n.pp_order_node_id] = n; });
    const list = [];
    const add = (id) => {
      const n = byId[id]; if (!n) return; if (list.indexOf(n) < 0) list.push(n);
      const nexts = []; trx.find('pp_order_nodenext', { pp_order_node_id: n.pp_order_node_id }).filter((x) => active(x) && client(x)).sort((a, b) => Number(a.seqno) - Number(b.seqno) || Number(a.pp_order_nodenext_id) - Number(b.pp_order_nodenext_id)).forEach((x) => {
        const c = byId[x.pp_order_next_id]; if (c && list.indexOf(c) < 0) { list.push(c); nexts.push(x.pp_order_next_id); }
      });
      nexts.forEach(add);
    };
    add(wf.pp_order_node_id);
    all.forEach((n) => { if (list.indexOf(n) < 0) list.push(n); });
    return list;
  }  // MPPOrderWorkflow.closeActivities(activity, movementDate, milestone) :583-640 - from the reporting activity BACK through getPrevious (= the previous node in getNodesInOrder, :435-448);
  //   milestone=true stops at an EARLIER milestone. fromNodeId 0 = the last node (MPPOrder.closeIt :830 closeActivities(getLastNode, getUpdated(), false)).
  function closeActivities(trx, o, fromNodeId, when, milestone) {
    const nodes = nodesInOrder(trx, o); if (!nodes.length) return;
    let i = fromNodeId ? nodes.findIndex((n) => Number(n.pp_order_node_id) === Number(fromNodeId)) : nodes.length - 1;
    if (i < 0) throw new Error('Activity and Order Workflow not matching');
    for (; i >= 0; i--) {
      let node = trx.get('pp_order_node', nodes[i].pp_order_node_id);
      if (milestone && node.ismilestone === 'Y' && Number(node.pp_order_node_id) !== Number(fromNodeId)) break;   // :596-599 break the cycle
      if (node.docstatus === 'DR') {
        const qtyToDeliver = dec(node.qtyrequiered).subtract(dec(node.qtydelivered)); if (qtyToDeliver.signum() <= 0) continue;
        const setup = Number(node.setuptimerequiered || 0) - Number(node.setuptimereal || 0), dur = estimateWorkingTime(node, qtyToDeliver);
        const loc = trx.find('m_locator', { m_warehouse_id: o.m_warehouse_id }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id))[0];
        createCollector(trx, o, { type: '160', docTypeId: mccDocType(trx), locatorId: loc ? loc.m_locator_id : 0, asiId: o.m_attributesetinstance_id || 0, resourceId: node.s_resource_id, bomLineId: 0, nodeId: node.pp_order_node_id, productId: o.m_product_id, movementDate: when, qty: qtyToDeliver, scrap: 0, reject: 0, durationSetup: setup, duration: dur });
        nodeCloseIt(trx, node.pp_order_node_id); trx.say('§LIBERO-CLOSEACT from=' + fromNodeId + ' milestone=' + milestone + ' reported=' + node.pp_order_node_id + ' qty=' + qtyToDeliver.toString());
      } else if (node.docstatus === 'CO' || node.docstatus === 'IP') { nodeCloseIt(trx, node.pp_order_node_id); trx.say('§LIBERO-CLOSEACT from=' + fromNodeId + ' milestone=' + milestone + ' closed=' + node.pp_order_node_id); }
    }
  }
  // ── Usage Variance collectors (120) - MPPCostCollector.completeIt :528-554 + CostEngine.createUsageVariances :485-519 ───────────────────────────────────
  function usageComplete(trx, cc) {
    if (idSet(cc.pp_order_bomline_id)) {                                  // material
      const bl = ML.po(trx, 'pp_order_bomline', trx.get('pp_order_bomline', cc.pp_order_bomline_id));
      bl.set('qtydelivered', num(dec(bl.get('qtydelivered')).add(dec(cc.movementqty)))).set('qtyscrap', num(dec(bl.get('qtyscrap')).add(dec(cc.scrappedqty)))).set('qtyreject', num(dec(bl.get('qtyreject')).add(dec(cc.qtyreject))));
      if (!bl.save()) throw new Error(bl.error);
      createUsageVariances(trx, cc);
    } else if (idSet(cc.pp_order_node_id)) {                              // resource
      const node = ML.po(trx, 'pp_order_node', trx.get('pp_order_node', cc.pp_order_node_id));
      node.set('durationreal', Number(node.get('durationreal') || 0) + Math.trunc(Number(cc.durationreal || 0))).set('setuptimereal', Number(node.get('setuptimereal') || 0) + Math.trunc(Number(cc.setuptimereal || 0)));
      if (!node.save()) throw new Error(node.error);
      createUsageVariances(trx, cc);
    }
  }
  function createUsageVariances(trx, cc) {
    if (!isType(cc, T_USAGE)) throw new Error('Cost Collector is not Material Usage Variance');
    const M = MC(); let product, qty;
    if (idSet(cc.pp_order_bomline_id)) { product = trx.get('m_product', cc.m_product_id); qty = dec(cc.movementqty); }
    else { product = resourceProduct(trx, cc.s_resource_id); if (!product) throw new Error('No product for S_Resource_ID=' + cc.s_resource_id); qty = getResourceBaseValue(trx, cc.s_resource_id, cc); }
    for (const as of acctSchemas(trx, cc.ad_org_id)) {
      const method = M.costingMethod(trx, product, as); if (libMethod(trx, product, as) !== method) throw new Error('Costing method not supported - ' + method);
      for (const el of elements(trx)) {
        const amt = roundCost(trx, actualPrice(trx, cc, product, as, el).multiply(qty), as);   // price x qty (createVarianceCostDetail :405-439: amt and qty as computed, NOT negated)
        const h = M.cdNew(trx, as, cc.ad_org_id, product.m_product_id, 0, el.m_costelement_id, amt, qty, '', null, 0);
        h.row.pp_cost_collector_id = cc.pp_cost_collector_id; M.cdSave(trx, h); if (h.row.processed !== 'Y') M.cdProcess(trx, h);
      }
    }
  }
  // DefaultRoutingServiceImpl.estimateWorkingTime(PP_Order_Node, qty) :74-80 + calculateCycles :101-110 (cycles = qty / UnitsCycles rounded UP when UnitsCycles > 0, else qty; intValue)
  function estimateWorkingTime(node, qty) {
    const uc = Number(node.unitscycles || 0); let cycles = dec(qty);
    if (uc > 0) cycles = cycles.divide(D(uc), 0, 'UP');
    return bdValueOf(Number(node.duration || 0) * Math.trunc(Number(cycles.toString())));
  }
  // MPPCostCollector.createPO :843-944 - one Purchase Order per vendor of the activity's SUBCONTRACTING products, a line per product of MovementQty x node-product Qty (Order_Min, Order_Pack)
  //   UPSTREAM ORDER kept: setBPartner runs BEFORE setIsSOTrx(false), so the new order takes the partner's SALES payment term / price list / payment rule (named quirk, spec §SUBCONTRACT).
  const MO = () => globalThis.ModelOrder, MI = () => globalThis.ModelInvoice;   // MI().inTrxRuntime: the session Ctx + the callout runtime bound to this Trx (MOrder.beforeSave reads Env)
  function createPO(trx, cc, activity) {
    const orders = {}, cur = () => trx.get('pp_cost_collector', cc.pp_cost_collector_id); let msg = '';
    const subs = trx.find('pp_order_node_product', { pp_order_node_id: activity.pp_order_node_id }).filter((r) => active(r) && r.issubcontracting === 'Y');
    const elName = (col) => { const e = trx.find('ad_element', { columnname: col })[0]; return e ? e.name : col; };   // Msg.translate(ctx, ColumnName)
    for (const sub of subs) {
      const product = trx.get('m_product', sub.m_product_id);
      if (product.ispurchased !== 'Y' || product.producttype !== 'S') throw new Error('The Product: ' + product.name + ' Do not is Purchase or Service Type');
      let bpId = Number(activity.c_bpartner_id || 0), ppo = null;
      const ppos = trx.find('m_product_po', { m_product_id: product.m_product_id }).filter(active).sort((a, b) => (b.iscurrentvendor === 'Y') - (a.iscurrentvendor === 'Y'));
      for (const p of ppos) { if (bpId === Number(p.c_bpartner_id)) { ppo = p; break; } if (p.iscurrentvendor === 'Y' && Number(p.c_bpartner_id || 0) !== 0) { bpId = Number(p.c_bpartner_id); ppo = p; break; } }
      if (bpId <= 0 || !ppo) throw new Error('NoVendorForProductException: ' + product.name);
      const today = String(trx.env.date || '').slice(0, 10), dp = new Date(today + 'T00:00:00Z'); dp.setUTCDate(dp.getUTCDate() + Number(ppo.deliverytime_promised || 0));
      const datePromised = dp.toISOString().slice(0, 10) + ' 00:00:00';
      let order = orders[bpId];
      if (!order) {
        const vendor = trx.get('c_bpartner', bpId), o = MO().MOrder_new(trx), ppOrder = trx.get('pp_order', cc.pp_order_id);
        o.set('ad_org_id', cc.ad_org_id); MO().MOrder_setBPartner(trx, o, vendor); o.set('issotrx', 'N'); MO().MOrder_setDocTypeTargetDefault(trx, o);
        o.set('datepromised', datePromised).set('description', elName('PP_Order_ID') + ':' + ppOrder.documentno).set('docstatus', 'DR').set('docaction', 'CO')
          .set('ad_user_id', cc.ad_user_id || null).set('m_warehouse_id', cc.m_warehouse_id);
        const saved = MI().inTrxRuntime(trx, (ctx) => { MO().MOrder_beforeSaveNew(trx, o, ctx); return o.save(); });
        if (!saved) throw new Error(o.error || 'Could not create Purchase Order');
        order = orders[bpId] = o; { const so = trx.get('c_order', o.id()); trx.say('§LIBERO-CREATEPO-HDR order=' + so.c_order_id + ' docno=' + so.documentno + ' pricelist=' + so.m_pricelist_id + ' dt=' + so.c_doctypetarget_id + ' bp=' + so.c_bpartner_id + ' term=' + so.c_paymentterm_id + ' rule=' + so.paymentrule + ' so=' + so.issotrx); }
        const docno = trx.get('c_order', o.id()).documentno, c0 = cur();
        trx.update('pp_cost_collector', c0, { description: c0.description ? c0.description + ' | ' + elName('C_Order_ID') + ': ' + docno : elName('C_Order_ID') + ': ' + docno });
        msg += elName('C_Order_ID') + ' : ' + docno + ' - ' + elName('C_BPartner_ID') + ' : ' + vendor.name + ' , ';
      }
      let qty = dec(cc.movementqty).multiply(dec(sub.qty));
      if (dec(ppo.order_min).signum() > 0 && qty.compareTo(dec(ppo.order_min)) < 0) qty = dec(ppo.order_min);   // BigDecimal.max
      if (dec(ppo.order_pack).signum() > 0 && qty.signum() > 0) qty = dec(ppo.order_pack).multiply(qty.divide(dec(ppo.order_pack), 0, 'UP'));
      const ol = MO().MOrderLine_new(trx, order);
      ol.set('m_product_id', product.m_product_id).set('description', activity.description == null ? null : activity.description).set('m_warehouse_id', cc.m_warehouse_id)
        .set('qtyentered', num(qty)).set('qtyordered', num(qty)).set('pp_cost_collector_id', cc.pp_cost_collector_id).set('datepromised', datePromised);
      if (!MI().inTrxRuntime(trx, () => ol.save())) throw new Error(ol.error || 'Could not create Purchase Order Line');
      trx.update('pp_cost_collector', cur(), { processed: 'Y' });                          // setProcessed(true) :941
      trx.say('§LIBERO-CREATEPO collector=' + cc.pp_cost_collector_id + ' vendor=' + bpId + ' order=' + order.id() + ' product=' + product.m_product_id + ' qty=' + qty.toString());
    }
    return msg;
  }
  // completeIt :483-510 - a subcontracting activity completes only when every PO line of this collector is delivered; then the activity is Completed
  function subcontractComplete(trx, cc) {
    const lines = trx.find('c_orderline', { pp_cost_collector_id: cc.pp_cost_collector_id });
    let st = 'CO', m = 'The quantity do not is complete for next Purchase Order : ';
    for (const l of lines) { if (dec(l.qtydelivered).compareTo(dec(l.qtyordered)) < 0) st = 'IP'; m += trx.get('c_order', l.c_order_id).documentno + ','; }
    if (st === 'IP') { trx._msg = m; return 'IP'; }
    trx.update('pp_cost_collector', trx.get('pp_cost_collector', cc.pp_cost_collector_id), { processed: 'Y', docaction: 'CL', docstatus: 'CO' });
    const node = trx.get('pp_order_node', cc.pp_order_node_id), po = ML.po(trx, 'pp_order_node', node);
    po.set('docstatus', 'CO').set('docaction', '--'); if (!po.save()) throw new Error(po.error);   // MPPOrderNode.completeIt :377-382
    nodeSetDateFinish(trx, trx.get('pp_order_node', node.pp_order_node_id), true);
    return 'CO';
  }
  // MPPCostCollector.prepareIt activity branch :327-366
  function activityPrepare(trx, cc) {
    const node = activityNode(trx, cc);
    if (node.docstatus === 'CO') throw new Error('Order Activity Already Processed - ' + nodeStr(node));
    activityGuards(trx, node);
    if (node.issubcontracting === 'Y') {                                                   // :322-339 subcontracting: a purchase order per vendor, the activity In Progress, the collector waits
      if (node.docstatus === 'IP' && cc.docstatus === 'IP') return;
      if (node.docstatus === 'IP' && (cc.docstatus == null || cc.docstatus === 'DR')) throw new Error('Order Activity Already Processed - ' + nodeStr(node));
      const msg = createPO(trx, cc, node);
      const po = ML.po(trx, 'pp_order_node', trx.get('pp_order_node', node.pp_order_node_id));
      if (nodeProcessed(po.row)) throw new Error('Cannot change status from ' + po.row.docstatus + ' to IP');   // setInProgress :427-442
      po.set('docstatus', 'IP').set('docaction', 'CO'); if (!po.row.datestart) po.set('datestart', dateStart(trx, cc)); if (!po.save()) throw new Error(po.error);
      trx._subMsg = msg; return;
    }
    if (nodeProcessed(node)) throw new Error('Cannot change status from ' + node.docstatus + ' to IP');
    const po = ML.po(trx, 'pp_order_node', node);
    po.set('docstatus', 'IP').set('docaction', 'CO'); if (!node.datestart) po.set('datestart', dateStart(trx, cc));
    po.set('qtydelivered', num(dec(node.qtydelivered).add(dec(cc.movementqty)))).set('qtyscrap', num(dec(node.qtyscrap).add(dec(cc.scrappedqty)))).set('qtyreject', num(dec(node.qtyreject).add(dec(cc.qtyreject))));
    po.set('durationreal', Number(node.durationreal || 0) + Math.trunc(Number(cc.durationreal || 0))).set('setuptimereal', Number(node.setuptimereal || 0) + Math.trunc(Number(cc.setuptimereal || 0)));
    if (!po.save()) throw new Error(po.error);
    // :349-354 a MILESTONE reports every earlier activity back to the previous milestone. UPSTREAM QUIRK (named, kept - prompts/mfg/LIBERO_ACTIVITY_SLICE6_SPEC.md §MILESTONE): the loop starts AT this
    //   activity, so it closes the milestone node itself, and completeIt (:478-482) then refuses it as processed - the report and the collectors it made roll back.
    if (node.ismilestone === 'Y') closeActivities(trx, trx.get('pp_order', cc.pp_order_id), node.pp_order_node_id, cc.movementdate, true);
  }
  // MPPCostCollector.completeIt activity branch :474-526
  function activityComplete(trx, cc) {
    const node = activityNode(trx, cc);
    if (nodeProcessed(node)) throw new Error('Order Activity Already Processed - ' + nodeStr(node));
    activityGuards(trx, node);
    createActivityControl(trx, cc);
    const n2 = trx.get('pp_order_node', node.pp_order_node_id);
    if (SOURCE.closeNode && dec(n2.qtydelivered).compareTo(dec(n2.qtyrequiered)) >= 0) nodeCloseIt(trx, node.pp_order_node_id);
  }

  // ══ M9 TRACE - lot genealogy derived from the collectors (prompts/mfg/LIBERO_TRACE_M9_SPEC.md; Witness: W-MFG-TRACE) ═══════════════════════════════════════════
  // Upstream never writes PP_Cost_CollectorMA (only MFG_ModelFactory names it), so the lot of each move is the M_Transaction the collector wrote (StorageEngine: an issue takes the storage row's ASI,
  //   a receipt gets a fresh ASI). An edge = (order, collector, type, product, lot, qty, date). Backward from a finished lot: its receipt collector(s) -> the order -> the order's ISSUE collectors
  //   (stock-moving: isIssue && !isVariance) -> their lots -> recurse. Forward: the reverse. Read-only; nothing is written.
  function lotMoves(trx, productId, asiId) {
    return trx.find('m_transaction', SOURCE.traceByLot ? { m_product_id: productId, m_attributesetinstance_id: asiId } : { m_product_id: productId }).filter((t) => idSet(t.pp_cost_collector_id)).map((t) => ({ t, cc: trx.get('pp_cost_collector', t.pp_cost_collector_id) }))
      .filter((x) => x.cc && (x.cc.docstatus === 'CO' || x.cc.docstatus === 'CL'));
  }
  function edgesOf(trx, cc) { return trx.find('m_transaction', { pp_cost_collector_id: cc.pp_cost_collector_id }).map((t) => ({ order: Number(cc.pp_order_id), collector: String(cc.documentno), type: String(cc.costcollectortype),
    product: Number(t.m_product_id), lot: Number(t.m_attributesetinstance_id || 0), qty: dec(t.movementqty).toString(), ccQty: dec(cc.movementqty).toString(), date: String(t.movementdate || '').slice(0, 19) })).sort((a, b) => (a.product - b.product) || (a.lot - b.lot) || a.collector.localeCompare(b.collector)); }
  function genealogy(trx, productId, asiId, dir, depth) {
    depth = depth == null ? 8 : depth; const seen = {};
    const walk = (p, a, d) => {
      const key = p + '@' + a; if (seen[key] || d > depth) return { product: p, lot: a, cycle: !!seen[key], links: [] }; seen[key] = 1;
      const links = [];
      for (const m of lotMoves(trx, p, a)) {
        const wantSelf = dir === 'back' ? isReceipt(m.cc) : (isIssue(m.cc) && !isVariance(m.cc)); if (!wantSelf) continue;
        const others = trx.find('pp_cost_collector', { pp_order_id: m.cc.pp_order_id }).filter((x) => (x.docstatus === 'CO' || x.docstatus === 'CL') && (dir === 'back' ? (isIssue(x) && !isVariance(x)) : isReceipt(x)))
          .sort((x, y) => String(x.documentno).localeCompare(String(y.documentno)));
        for (const o of others) for (const e of edgesOf(trx, o)) links.push(Object.assign({ via: String(m.cc.documentno) }, e, { from: walk(e.product, e.lot, d + 1) }));
      }
      return { product: p, lot: a, links };
    };
    const tree = walk(Number(productId), Number(asiId || 0), 0);
    trx.say('§LIBERO-TRACE dir=' + dir + ' root=' + productId + '@' + (asiId || 0) + ' links=' + tree.links.length);
    return tree;
  }
  // the exported slice: canonical JSON (sorted keys) of BOTH directions of one lot; verifySlice recomputes it from the collectors and names the first difference
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
  function exportSlice(trx, productId, asiId) { const s = { kind: 'libero-lot-genealogy', v: 1, product: Number(productId), lot: Number(asiId || 0), backward: genealogy(trx, productId, asiId, 'back'), forward: genealogy(trx, productId, asiId, 'fwd') }; return { slice: s, text: canon(s) }; }
  function verifySlice(trx, slice) {
    const now = exportSlice(trx, slice.product, slice.lot).text, was = canon(slice);
    if (now === was) return { ok: true };
    let i = 0; while (i < now.length && now[i] === was[i]) i++;
    return { ok: false, at: i, was: was.slice(Math.max(0, i - 60), i + 60), now: now.slice(Math.max(0, i - 60), i + 60) };
  }
  // ══ SLICE 4 - the legacy ONE-STEP entry points (prompts/mfg/LIBERO_BACKFLUSH_SLICE4_SPEC.md) ═══════════════════════
  const mccDocType = (trx) => { const d = trx.find('c_doctype', { docbasetype: 'MCC' }).filter((r) => active(r) && (r.ad_client_id == null || Number(r.ad_client_id) === Number(trx.env.client)))
    .sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.c_doctype_id) - Number(b.c_doctype_id))[0]; if (!d) throw new Error('No Manufacturing Cost Collector document type (MDocType.getDocType MCC)'); return d.c_doctype_id; };
  // MPPCostCollector.createCollector :73-156 - build, save, then processIt(CO) in the SAME transaction; a refused DocAction throws its message (:151-153)
  function createCollector(trx, order, p) {
    const f = collectorFields(trx, order, p); f.ad_client_id = order.ad_client_id;
    const r = ML.newRecord(trx, 'pp_cost_collector', f); if (!r.save()) throw new Error(r.error);
    const id = r.row.pp_cost_collector_id, res = ML.processIt(trx, 'pp_cost_collector', id, 'CO'); (trx._lcc = trx._lcc || []).push(id);
    if (!res.ok) throw new Error(res.msg || ('DocAction CO refused, status ' + res.status));
    return trx.get('pp_cost_collector', id);
  }
  // MPPOrder.getStorages :206-251 (guarantee-date filter DEFERRED)
  function getStorages(trx, productId, whId, asiId) {
    const pr = trx.get('m_product', productId); if (!stocked(pr)) return [];
    return getWarehouse(trx, whId, productId, Number(pr.m_attributesetinstance_id || 0) === 0 ? (asiId || 0) : 0, mmPolicyFifo(trx, pr), true, 0);
  }
  const onHandOf = (storages) => storages.reduce((a, s) => a.add(dec(s.qtyonhand)), ZERO);
  // MPPOrder.createIssue :1256-1330
  function createIssue(trx, order, bomLineId, movementDate, qty, qtyScrap, qtyReject, storages, forceIssue) {
    if (dec(qty).signum() === 0) return;
    const bl = trx.get('pp_order_bomline', bomLineId), dt = mccDocType(trx);
    let toIssue = dec(qty).add(dec(qtyScrap));
    const mk = (type, loc, asi, q, sc, rj) => createCollector(trx, order, { type, docTypeId: dt, locatorId: loc, asiId: asi, movementDate, qty: q, scrap: sc, reject: rj, bomLineId, productId: bl.m_product_id, nodeId: 0, durationSetup: 0, duration: 0 });
    if (!SOURCE.perRow && storages.length) { const st0 = storages[0]; mk(T_ISSUE, st0.m_locator_id, st0.m_attributesetinstance_id, toIssue, qtyScrap, qtyReject); return; }   // BREAK only
    for (const st of storages) {
      const oh = dec(st.qtyonhand); if (oh.signum() === 0) continue;
      const qtyIssue = toIssue.compareTo(oh) <= 0 ? toIssue : oh;                                       // toIssue.min(onHand) :1273
      if (qtyIssue.signum() !== 0 || dec(qtyScrap).signum() !== 0 || dec(qtyReject).signum() !== 0) {
        let type = T_ISSUE;
        if (dec(bl.qtybatch).signum() === 0 && dec(bl.qtybom).signum() === 0) type = T_METHOD;           // :1280-1283
        else if (bl.componenttype === 'CP') type = T_MIX;                                               // :1284-1287
        mk(type, st.m_locator_id, st.m_attributesetinstance_id, qtyIssue, qtyScrap, qtyReject);        // scrap/reject repeat on EVERY row (legacy quirk, kept)
      }
      toIssue = toIssue.subtract(qtyIssue);
      if (toIssue.signum() === 0) break;
    }
    if (forceIssue && toIssue.signum() !== 0) { mk(T_ISSUE, bl.m_locator_id, bl.m_attributesetinstance_id, toIssue, ZERO, ZERO); return; }
    if (toIssue.signum() !== 0) throw new Error('Should not happen toIssue=' + toIssue.toString());   // :1327
  }
  // MPPOrder.createReceipt :1190-1245
  function createReceipt(trx, order, movementDate, qtyDelivered, qtyToDeliver, qtyScrap, qtyReject, locatorId, asiId) {
    if (dec(qtyToDeliver).signum() !== 0 || dec(qtyScrap).signum() !== 0 || dec(qtyReject).signum() !== 0)
      createCollector(trx, order, { type: T_RECEIPT, docTypeId: mccDocType(trx), locatorId, asiId: asiId || 0, movementDate, qty: qtyToDeliver, scrap: qtyScrap, reject: qtyReject, bomLineId: 0, nodeId: 0, productId: order.m_product_id, durationSetup: 0, duration: 0 });
    const o = ML.po(trx, 'pp_order', trx.get('pp_order', order.pp_order_id));          // re-read: the completed receipt already moved QtyDelivered; PO saves only the columns set here
    o.set('datedelivered', movementDate);
    if (!o.row.datestart) o.set('datestart', movementDate);
    if (dec(qtyDelivered).add(dec(qtyScrap)).compareTo(dec(qtyToDeliver)) >= 0) o.set('datefinish', movementDate);   // :1235-1240 - qtyDelivered is the quantity BEFORE this receipt
    if (!o.save()) throw new Error(o.error);
  }
  // MPPOrder.isQtyAvailable :126-190 on the selected rows
  function isQtyAvailable(trx, order, rows, movementDate) {
    for (const r of rows) {
      if (!r.selected) continue;
      const pr = trx.get('m_product', r.productId); if (!stocked(pr)) continue;
      const bl = trx.get('pp_order_bomline', r.bomLineId), asi = bl ? bl.m_attributesetinstance_id : 0;
      const oh = onHandOf(getStorages(trx, r.productId, order.m_warehouse_id, asi || 0, movementDate));
      if (oh.compareTo(dec(r.toDeliver).add(dec(r.scrap))) < 0) return false;
    }
    return true;
  }
  // OrderReceiptIssue.executeQuery :309-540 - the form's default rows. p: { rule, toDeliver, scrap }
  function backflushRows(trx, order, p) {
    const isBack = p.rule === 'BackFlush', rows = [], openQtyOrder = dec(order.qtyordered).subtract(dec(order.qtydelivered));
    const toDeliver = dec(p.toDeliver == null ? openQtyOrder : p.toDeliver), scrapQty = dec(p.scrap || 0);
    for (const bl of trx.find('pp_order_bomline', { pp_order_id: order.pp_order_id }).sort((a, b) => Number(a.line) - Number(b.line))) {
      const req = dec(bl.qtyrequiered), delv = dec(bl.qtydelivered), open = req.subtract(delv), bom = dec(bl.qtybom), batch = dec(bl.qtybatch), pct = bl.isqtypercentage === 'Y';
      const oh = onHandOf(trx.find('m_storageonhand', { m_product_id: bl.m_product_id }).filter((s) => { const l = trx.get('m_locator', s.m_locator_id); return l && Number(l.m_warehouse_id) === Number(bl.m_warehouse_id); }));
      const row = { bomLineId: bl.pp_order_bomline_id, productId: bl.m_product_id, selected: false, toDeliver: ZERO, scrap: ZERO, required: req };
      if (bl.componenttype === 'CO' || bl.componenttype === 'PK') {
        row.selected = oh.signum() > 0 && req.signum() > 0;                                             // :401-402
        if (pct) {
          const perc = batch.divide(D100, 8, RM_HALF_UP);
          if (isBack) {
            let c = (req.signum() === 0 || open.signum() === 0) ? ZERO : toDeliver.multiply(perc);
            if (!(req.signum() === 0 || open.signum() === 0) && (req.subtract(delv).signum() < 0 || c.signum() === 0)) c = req.subtract(delv);
            row.toDeliver = c;
          } else row.toDeliver = open;
          row.scrap = scrapQty.signum() !== 0 ? scrapQty.multiply(perc) : ZERO;
        } else {
          row.toDeliver = isBack ? (SOURCE.scrapDivide ? toDeliver.multiply(bom).divide(D(1).subtract(dec(bl.scrap).divide(D100, 8, RM_HALF_UP)), 8, RM_HALF_UP) : toDeliver.multiply(bom)) : open;
          row.scrap = scrapQty.signum() !== 0 ? scrapQty.multiply(bom) : ZERO;
        }
      } else if (bl.componenttype === 'TL') row.toDeliver = bom;                                          // :482-489 (Tools: not selected)
      rows.push(row);
    }
    return rows;
  }
  // WOrderReceiptIssue.cmd_process :895-950, ONE transaction. p: { rule, movementDate, toDeliver, scrap, reject, locatorId, asiId, rows, closeDocument }
  function backflush(trx, orderId, p) {
    const order = trx.get('pp_order', orderId); if (!order) throw new Error('PP_Order ' + orderId + ' not found');
    const rule = p.rule || 'BackFlush', mdate = p.movementDate;
    if (!mdate) throw new Error('NoDate');   // WOrderReceiptIssue.onEvent :452-456
    const wh = trx.get('m_warehouse', order.m_warehouse_id) || {};
    const locator = p.locatorId || (trx.find('m_locator', { m_warehouse_id: order.m_warehouse_id }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id))[0] || {}).m_locator_id || 0;
    if ((rule === 'OnlyReceipt' || rule === 'BackFlush') && !(Number(locator) > 0)) throw new Error('NoLocator');
    if (p.closeDocument) throw new Error('DEFERRED: MPPOrder.closeIt is not ported (order Close); nothing was written');
    const open = dec(order.qtyordered).subtract(dec(order.qtydelivered)), toDeliver = dec(p.toDeliver == null ? open : p.toDeliver), scrap = dec(p.scrap || 0), reject = dec(p.reject || 0);
    const rows = p.rows || backflushRows(trx, order, { rule, toDeliver, scrap });
    if (rule === 'BackFlush' || rule === 'OnlyIssue') {
      const avail = isQtyAvailable(trx, order, rows, mdate);   // OrderReceiptIssue.createIssue :237-238 computes this flag and then IGNORES it (kept): the real stop is createIssue's "Should not happen" below, which rolls the transaction back
      trx.say('§LBACK-AVAIL isQtyAvailable=' + avail + ' (legacy ignores the flag)');
      for (const r of rows) {
        if (!r.selected) continue;
        const pr = trx.get('m_product', r.productId); if (!stocked(pr)) continue;
        const bl = trx.get('pp_order_bomline', r.bomLineId);
        createIssue(trx, order, r.bomLineId, mdate, dec(r.toDeliver), dec(r.scrap), ZERO, getStorages(trx, r.productId, order.m_warehouse_id, bl.m_attributesetinstance_id || 0, mdate), false);
      }
    }
    if (rule === 'OnlyReceipt' || rule === 'BackFlush') createReceipt(trx, order, mdate, dec(order.qtydelivered), toDeliver, scrap, reject, locator, p.asiId || 0);
    void wh;
    return { ok: true, rows };
  }


  // ── the Order Receipt & Issue FORM as a generic descriptor (ad_form_generic.js; AD_Form 53007 org.libero.form.VOrderReceiptIssue (org.eevolution.* before 2Pack_1.0.2); WOrderReceiptIssue :598-604 defaults) ──

  // ══ SLICE 5 - M6: Doc_PPCostCollector posting (acct/Doc_PPCostCollector.java @ b2adfea0; DocLine_CostCollector.java account lookup) ═══════════════════════
  // Registered as the posting class of PP_Cost_Collector (ctx.docClass.register); model_post.js Doc.post calls createFacts once per accounting schema.
  const ACCT_COL = { WIP: 'p_wip_acct', MethodChangeVariance: 'p_methodchangevariance_acct', UsageVariance: 'p_usagevariance_acct', RateVariance: 'p_ratevariance_acct', MixVariance: 'p_mixvariance_acct',
    FloorStock: 'p_floorstock_acct', Scrap: 'p_scrap_acct' };   // DocLine_CostCollector.s_acctName :39-53 (the types it maps)
  const SOURCE_ACCT = (trx, col, productId, schemaId) => {   // C_ValidCombination -> account element, the way every Doc class resolves a MAccount
    const vcId = col; if (vcId == null) return null; const v = trx.q('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=?', [vcId])[0]; return v ? v.e : null; };
  // DocLine_CostCollector.getAccount(acctName, as) :107-125 - COALESCE(product, product category, schema default); INNER JOINs: a product without an M_Product_Acct row for the schema has NO account
  function lineAccount(trx, productId, schemaId, col) {
    const r = trx.q('SELECT COALESCE(pa.' + col + ', pca.' + col + ', asd.' + col + ') AS v FROM m_product p JOIN m_product_acct pa ON pa.m_product_id=p.m_product_id JOIN m_product_category_acct pca ON pca.m_product_category_id=p.m_product_category_id AND pca.c_acctschema_id=pa.c_acctschema_id JOIN c_acctschema_default asd ON asd.c_acctschema_id=pa.c_acctschema_id WHERE pa.m_product_id=? AND pa.c_acctschema_id=?', [productId, schemaId])[0];
    return r ? SOURCE_ACCT(trx, r.v) : null;
  }
  // DocLine.getAccount(ProductCost.ACCTTYPE_P_Asset, as): the product's own P_Asset_Acct, else the schema default (ProductCost.getAccount)
  function assetAccount(trx, productId, schemaId) {
    const pa = trx.q('SELECT p_asset_acct AS v FROM m_product_acct WHERE m_product_id=? AND c_acctschema_id=?', [productId, schemaId])[0];
    let v = pa ? pa.v : null; if (v == null) { const d = trx.q('SELECT p_asset_acct AS v FROM c_acctschema_default WHERE c_acctschema_id=?', [schemaId])[0]; v = d ? d.v : null; }
    return SOURCE_ACCT(trx, v);
  }
  function createFacts(trx, cc, as, F) {
    const cur = as.c_currency_id, prec = Number((trx.get('c_currency', cur) || {}).stdprecision == null ? 2 : trx.get('c_currency', cur).stdprecision);
    const rnd = (v) => (v.scale() > prec ? v.setScale(prec, RM_HALF_UP) : v);
    // getCostDetails() :384-392 is NOT filtered by accounting schema (Libero/ADempiere/logilite forks all read): with two schemas every cost detail of BOTH feeds each schema's fact. Kept (twin rule);
    // SOURCE.detailsPerSchema=true filters by the schema being posted (the correct books). Measured on GardenWorld (2 schemas): the Receipt posts twice -> Work in Process credited 35080 vs debited 17540 (witness B10, named Q-M6-1).
    const details = trx.find('m_costdetail', { pp_cost_collector_id: cc.pp_cost_collector_id }).filter((cd) => !SOURCE.detailsPerSchema || Number(cd.c_acctschema_id) === Number(as.c_acctschema_id)).sort((a, b) => Number(a.m_costdetail_id) - Number(b.m_costdetail_id));
    const el = (id) => trx.get('m_costelement', id) || {};
    const type = String(cc.costcollectortype);
    // createLines :139-166 - nothing when cost/accounts are missing; a zero cost writes no line
    function createLines(element, debit, credit, cost, qty) {
      if (cost == null || debit == null || credit == null) return;
      if (cost.signum() === 0) return;
      const extra = { qty: num(dec(qty)), m_product_id: cc.m_product_id, line_id: cc.pp_cost_collector_id, ad_org_id: cc.ad_org_id, description: (cc.description ? cc.description + ' | ' : '') + (element.name || ''),
        c_project_id: cc.c_project_id, c_activity_id: cc.c_activity_id, c_campaign_id: cc.c_campaign_id, m_locator_id: cc.m_locator_id };
      F.line(debit, cur, cost, null, extra); F.line(credit, cur, null, cost, extra);
    }
    const wip = lineAccount(trx, cc.m_product_id, as.c_acctschema_id, ACCT_COL.WIP), asset = assetAccount(trx, cc.m_product_id, as.c_acctschema_id);
    if (type === T_RECEIPT) {                                        // createMaterialReceipt :192-222 - DR product asset / CR WIP per cost element
      if (dec(cc.scrappedqty).signum() !== 0) throw new Error('DEFERRED: Receipt scrap posting (Doc_PPCostCollector.createMaterialReceipt scrap branch needs MCostDetail.getPrice) - nothing was posted');
      for (const cd of details) {
        if (dec(cc.movementqty).signum() !== 0) createLines(el(cd.m_costelement_id), asset, wip, rnd(dec(cd.amt)), cc.movementqty);
      }
    } else if (type === T_ISSUE) {                                   // createComponentIssue :243-265 - DR WIP / CR product asset (or floor stock) per cost element, cost = -detail amount
      const credit = cc.isfloorstock === 'Y' ? lineAccount(trx, cc.m_product_id, as.c_acctschema_id, ACCT_COL.FloorStock) : asset;
      for (const cd of details) createLines(el(cd.m_costelement_id), wip, credit, rnd(dec(cd.amt).negate()), cc.movementqty);
    } else if (type === T_METHOD || type === T_USAGE || type === T_RATE || type === T_MIX) {   // createVariance :299-316 - DR variance account / CR WIP, cost = -amount, qty = -detail qty
      const col = ACCT_COL[{ [T_METHOD]: 'MethodChangeVariance', [T_USAGE]: 'UsageVariance', [T_RATE]: 'RateVariance', [T_MIX]: 'MixVariance' }[type]], debit = lineAccount(trx, cc.m_product_id, as.c_acctschema_id, col);
      for (const cd of details) createLines(el(cd.m_costelement_id), debit, wip, rnd(dec(cd.amt).negate()), dec(cd.qty).negate());
    } else if (isActivity(cc)) {                                      // createActivityControl :221-241 - DR WIP / CR the element's account; cost = the detail amount as stored (negative), NOT negated
      const ELACC = { R: 'p_labor_acct', B: 'p_burden_acct', O: 'p_overhead_acct', X: 'p_outsideprocessing_acct' };
      for (const cd of details) {
        const costs = dec(cd.amt); if (costs.signum() === 0) continue;
        const element = el(cd.m_costelement_id), t = String(element.costelementtype);
        const credit = t === 'M' ? asset : (ELACC[t] ? lineAccount(trx, cc.m_product_id, as.c_acctschema_id, ELACC[t]) : (() => { throw new Error('@NotSupported@ ' + element.name); })());
        createLines(element, wip, credit, costs, cc.movementqty);
      }
    }
    return true;
  }
  const docClass = { createFacts, basis: 'pp_cost_collector' };

  const nv = (v) => (v === '' || v == null ? null : v), numOf = (v) => num(dec(v == null || v === '' ? 0 : v));
  const openOrders = (trx) => trx.find('pp_order', { ad_client_id: trx.env.client }).filter((o) => (o.docstatus === 'CO' || o.docstatus === 'IP') && dec(o.qtyordered).compareTo(dec(o.qtydelivered)) > 0).sort((a, b) => String(a.documentno).localeCompare(String(b.documentno)));
  const ordOf = (trx, p) => (p && p.PP_Order_ID != null && p.PP_Order_ID !== '' && Number(p.PP_Order_ID) !== 0 ? trx.get('pp_order', Number(p.PP_Order_ID)) : null);   // a new order carries a NEGATIVE key until its op group is folded
  const openQtyOf = (o) => num(dec(o.qtyordered).subtract(dec(o.qtydelivered)));
  const defLocator = (trx, o) => { const l = trx.find('m_locator', { m_warehouse_id: o.m_warehouse_id }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id))[0]; return l ? l.m_locator_id : null; };
  const formDescriptor = {
    title: 'Order Receipt & Issue',
    params: [
      { name: 'PP_Order_ID', label: 'Manufacturing Order', type: 'list', mandatory: true, options: (trx) => openOrders(trx).map((o) => ({ value: o.pp_order_id, label: o.documentno + ' - ' + ((trx.get('m_product', o.m_product_id) || {}).name || o.m_product_id) + ' (open ' + openQtyOf(o) + ')' })), default: (trx) => { const o = openOrders(trx)[0]; return o ? o.pp_order_id : null; } },
      { name: 'DeliveryRule', label: 'Delivery Rule', type: 'list', mandatory: true, options: [{ value: 'BackFlush', label: 'Backflush' }, { value: 'OnlyIssue', label: 'Only Issue' }, { value: 'OnlyReceipt', label: 'Only Receipt' }], default: () => 'BackFlush' },
      { name: 'MovementDate', label: 'Movement Date', type: 'date', mandatory: true, default: (trx) => String(trx.env.date || '').slice(0, 10) },
      { name: 'QtyToDeliver', label: 'Quantity To Deliver', type: 'number', default: (trx, p) => { const o = ordOf(trx, p); return o ? openQtyOf(o) : 0; } },
      { name: 'QtyScrap', label: 'Scrap', type: 'number', default: () => 0 }, { name: 'QtyReject', label: 'Reject', type: 'number', default: () => 0 },
      { name: 'M_Locator_ID', label: 'Locator', type: 'list', options: (trx, p) => { const o = ordOf(trx, p); return o ? trx.find('m_locator', { m_warehouse_id: o.m_warehouse_id }).filter(active).map((l) => ({ value: l.m_locator_id, label: l.value })) : []; }, default: (trx, p) => { const o = ordOf(trx, p); return o ? defLocator(trx, o) : null; } },
      { name: 'IsCloseDocument', label: 'Close Document', type: 'yesno', default: () => 'N' }
    ],
    columns: [{ key: 'product', label: 'Component', type: 'string' }, { key: 'required', label: 'Required', type: 'number' }, { key: 'delivered', label: 'Delivered', type: 'number' }, { key: 'onhand', label: 'On Hand', type: 'number' },
      { key: 'toDeliver', label: 'To Deliver', type: 'number', editable: true }, { key: 'scrap', label: 'Scrap', type: 'number', editable: true }],
    rows(trx, p) {
      const o = ordOf(trx, p); if (!o || p.DeliveryRule === 'OnlyReceipt') return [];
      return backflushRows(trx, o, { rule: p.DeliveryRule || 'BackFlush', toDeliver: nv(p.QtyToDeliver), scrap: nv(p.QtyScrap) || 0 }).map((r) => {
        const bl = trx.get('pp_order_bomline', r.bomLineId), pr = trx.get('m_product', r.productId) || {};
        return { key: r.bomLineId, selected: r.selected, product: pr.name || r.productId, required: num(dec(bl.qtyrequiered)), delivered: num(dec(bl.qtydelivered)), onhand: num(onHandOf(trx.find('m_storageonhand', { m_product_id: r.productId }).filter((s) => { const l = trx.get('m_locator', s.m_locator_id); return l && Number(l.m_warehouse_id) === Number(bl.m_warehouse_id); }))), toDeliver: num(r.toDeliver), scrap: num(r.scrap) };
      });
    },
    run(trx, p, rows) {
      const o = ordOf(trx, p); if (!o) throw new Error('@FillMandatory@ PP_Order_ID');
      const rr = (rows || []).map((r) => ({ bomLineId: r.key, productId: (trx.get('pp_order_bomline', r.key) || {}).m_product_id, selected: !!r.selected, toDeliver: numOf(r.toDeliver), scrap: numOf(r.scrap) }));
      backflush(trx, o.pp_order_id, { rule: p.DeliveryRule || 'BackFlush', movementDate: String(p.MovementDate || '').slice(0, 10) + ' 00:00:00', toDeliver: nv(p.QtyToDeliver), scrap: nv(p.QtyScrap), reject: nv(p.QtyReject), locatorId: nv(p.M_Locator_ID) ? Number(p.M_Locator_ID) : 0, closeDocument: p.IsCloseDocument === 'Y', rows: rr.length ? rr : undefined });
      const made = (trx._lcc || []).map((id) => trx.get('pp_cost_collector', id)).filter(Boolean);
      return made.length + ' cost collector(s) completed: ' + made.map((c) => '#' + c.documentno + ' ' + ({ '110': 'Issue', '100': 'Receipt', '130': 'Method variance', '150': 'Mix variance' }[String(c.costcollectortype)] || c.costcollectortype) + ' ' + c.movementqty).join(', ');
    }
  };

  return { models: { pp_cost_collector: { beforeSave } }, docActions: { pp_cost_collector: doc }, collectorFields, createCostDetail, calculateFG, createCollector, getStorages, createIssue, createReceipt, isQtyAvailable, backflushRows, backflush, formDescriptor, docClass, createActivityControl, getResourceBaseValue, calculateDuration, convertDuration, createUsageVariances, estimateWorkingTime, nodeCloseIt, mccDocType, nodesInOrder, closeActivities, genealogy, exportSlice, verifySlice };
}
export async function activate(ctx) {
  const m = create(ctx);
  Object.keys(m.models).forEach((t) => ctx.docAction.registerModel(t, m.models[t]));
  Object.keys(m.docActions).forEach((t) => ctx.docAction.registerDocAction(t, m.docActions[t]));
  // FSM entry of AD_Table PP_Cost_Collector 53035 (MPPCostCollector: voidIt returns false :506, reActivateIt false :628, reverseAccrualIt false :622; reverseCorrectIt is DEFERRED)
  ctx.libero = Object.assign(ctx.libero || {}, { cost: m });   // the order chunk (close) reaches the collector entry points through the shared bundle ctx
  if (ctx.docClass) ctx.docClass.register('pp_cost_collector', m.docClass);   // M6: Doc_PPCostCollector, found by model_post Doc.post through DocPoster.docClassFor
  if (ctx.form) ctx.form.register('org.libero.form.VOrderReceiptIssue', m.formDescriptor);   // AD_Form 53007 (Classname after Libero 2Pack_1.0.2): drawn by the generic form renderer, zero host code
  if (ctx.docFsm) ctx.docFsm.register(53035, { name: 'PP_Cost_Collector', reActivate: false, rc: false, ra: false, vo: {} });
}
export async function deactivate(ctx) { if (ctx && ctx.libero) delete ctx.libero.cost; }
