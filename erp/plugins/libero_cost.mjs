// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_cost.mjs: HOT chunk of the Libero bundle, slice 3 (prompts/mfg/LIBERO_COST_SLICE3_SPEC.md; Witness W-LIBERO-COST). The PP_Cost_Collector model + DocAction for Component Issue (110) and Material
//   Receipt (100), StorageEngine.createTransaction, CostEngine.createCostDetail / createRateVariances. Core ports are REUSED (ModelTrade storage, ModelCost MCostDetail, ModelMaster acct schemas). Pure: no clock, no random.
//   Every type it does not port is REFUSED by name (never a silent no-op).
export const DEFERRED = [
  'MPPCostCollector Activity Control (160) completeIt + CostEngine.createActivityControl + RoutingService.getResourceBaseValue',
  'Usage / Method Change / Mix variance collectors (120/130/150) and CostEngine.createUsageVariances / createMethodVariances bodies',
  'MPPOrder.closeIt (order Close) - backflush with isCloseDocument is REFUSED by name',
  'MPPCostCollector.reverseCorrectIt / voidIt (voidIt is false upstream) and subcontracting createPO',
  'StorageEngine: MStorageOnHand.getWarehouse guarantee-date filter and MAttributeSetInstance.create lot/serial/guarantee generation',
  'Doc_PPCostCollector posting (M6) and MPPOrder.voidIt / closeIt / createVariances'
];
export const SOURCE = { calculateFG: true, perRow: true, scrapDivide: false };   // LBACK_BREAK=perrow|scrapdiv flip these to prove the backflush witness sees the storage-row and no-scrap-divide rules   // LCOST_BREAK=calcfg flips it to prove the witness sees the finished-goods cost rule
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
  function createRateVariances(trx, cc) {
    if (!isType(cc, T_ISSUE)) return null;
    const product = trx.get('m_product', trx.get('pp_order_bomline', cc.pp_order_bomline_id).m_product_id); let ccrv = null;
    for (const as of acctSchemas(trx, cc.ad_org_id)) for (const el of elements(trx)) {
      const cd = trx.find('m_costdetail', { pp_cost_collector_id: cc.pp_cost_collector_id, m_costelement_id: el.m_costelement_id }, ['m_costdetail_id'])[0]; if (!cd) continue;
      const qty = dec(cd.qty), std = standardPrice(trx, cc, product, as, el), act = actualPrice(trx, cc, product, as, el);
      if (el.costelementtype === 'M') trx.say('§LIBERO-RATE-CHECK collector=' + cc.documentno + ' schema=' + as.c_acctschema_id + ' element=' + el.m_costelement_id + ' std=' + std.toString() + ' actual=' + act.toString() + ' qty=' + qty.toString());
      const amtStd = roundCost(trx, std.multiply(qty), as), amtAct = roundCost(trx, act.multiply(qty), as);
      if (amtStd.compareTo(amtAct) === 0) continue;
      if (!ccrv) {   // createVarianceCostCollector :330-345 (copyValues of the issue, Drafted, type Rate Variance, no DocumentNo)
        const cp = Object.assign({}, trx.get('pp_cost_collector', cc.pp_cost_collector_id)); ['pp_cost_collector_id', 'pp_cost_collector_uu', 'documentno', 'created', 'updated', 'createdby', 'updatedby'].forEach((k) => delete cp[k]);
        Object.assign(cp, { processing: 'N', processed: 'N', docstatus: 'DR', docaction: 'CO', costcollectortype: T_RATE });
        const r = ML.newRecord(trx, 'pp_cost_collector', cp); if (!r.save()) return r.error; ccrv = r.row;
      }
      const vd = (amt, q) => {   // createVarianceCostDetail :347-380 (copy of the issue's detail, own collector, amt/qty set)
        const cp = Object.assign({}, cd); ['m_costdetail_id', 'm_costdetail_uu', 'created', 'updated', 'createdby', 'updatedby'].forEach((k) => delete cp[k]);
        Object.assign(cp, { processed: 'N', pp_cost_collector_id: ccrv.pp_cost_collector_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: el.m_costelement_id, amt: num(amt), qty: num(q), deltaamt: 0, deltaqty: 0 });
        const h = { row: cp, isNew: true }; MC().cdSave(trx, h); if (h.row.processed !== 'Y') MC().cdProcess(trx, h);
      };
      vd(amtAct.negate(), qty.negate()); vd(amtStd, qty);
      trx.say('§LIBERO-RATE-VARIANCE collector=' + cc.documentno + ' element=' + el.m_costelement_id + ' std=' + amtStd.toString() + ' actual=' + amtAct.toString());
    }
    if (ccrv) { const r = ML.processIt(trx, 'pp_cost_collector', ccrv.pp_cost_collector_id, 'CO'); if (!r.ok) return r.msg || 'rate variance collector not completed'; }
    return null;
  }

  // ── DocAction (MPPCostCollector.prepareIt :300-387 / completeIt :404-570), Issue + Receipt only ─────────────────────────
  const NOT_PORTED = (cc) => (isActivity(cc) ? 'DEFERRED: Activity Control collectors are not ported yet' : isType(cc, T_USAGE, T_METHOD) ? 'DEFERRED: ' + cc.costcollectortype + ' variance collectors are not ported yet (Usage / Method Change)' : null);   // Rate (140) and Mix (150) completions are a bomline/order update only
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
      const product = trx.get('m_product', d.m_product_id);
      if (isIssue(d) && Number(d.m_attributesetinstance_id || 0) === 0 && asiMandatory(trx, product, false)) { trx._msg = '@M_AttributeSet_ID@ @IsMandatory@ @M_Product_ID@=' + product.value; return 'IN'; }
      if (isReceipt(d) && Number(d.m_attributesetinstance_id || 0) === 0 && asiMandatory(trx, product, true)) { trx._msg = '@M_AttributeSet_ID@ @IsMandatory@ @M_Product_ID@=' + product.value; return 'IN'; }
      ch.docaction = 'CO'; trx.update('pp_cost_collector', d, ch); return 'IP';
    },
    completeIt(trx, d0) {
      const nm = NOT_PORTED(d0); if (nm) { trx._msg = nm; return 'IN'; }
      const cc = trx.get('pp_cost_collector', d0.pp_cost_collector_id);
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
            if (!o.get('datestart')) o.set('datestart', dateStart(cc));
            if (dec(o.get('qtyordered')).subtract(dec(o.get('qtydelivered'))).signum() <= 0) o.set('datefinish', cc.movementdate);
            if (!o.save()) throw new Error(o.error);
          }
        }
        let e = createRateVariances(trx, trx.get('pp_cost_collector', cc.pp_cost_collector_id)); if (e) throw new Error(e);
        trx.update('pp_cost_collector', trx.get('pp_cost_collector', cc.pp_cost_collector_id), { processed: 'Y', docaction: 'CL' });
      } catch (e) { trx._msg = e.message; return 'IN'; }
      return 'CO';
    },
    approveIt() { return true; }, rejectIt() { return true; },
    closeIt(trx, d) { trx.update('pp_cost_collector', d, { docaction: '--' }); return true; },   // :513-520
    voidIt() { return false; },                                                              // :506-511
    getSummary(trx, d) { return 'Cost Collector ' + (d && d.documentno); }
  };
  function dateStart(cc) { return cc.movementdate; }   // getDateStart(): DurationReal x the routing duration base; DurationReal is 0 for Issue/Receipt -> MovementDate

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


  // ── the Order Receipt & Issue FORM as a generic descriptor (ad_form_generic.js; AD_Form 53007 org.eevolution.form.VOrderReceiptIssue; WOrderReceiptIssue :598-604 defaults) ──
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

  return { models: { pp_cost_collector: { beforeSave } }, docActions: { pp_cost_collector: doc }, collectorFields, createCostDetail, calculateFG, createCollector, getStorages, createIssue, createReceipt, isQtyAvailable, backflushRows, backflush, formDescriptor };
}
export async function activate(ctx) {
  const m = create(ctx);
  Object.keys(m.models).forEach((t) => ctx.docAction.registerModel(t, m.models[t]));
  Object.keys(m.docActions).forEach((t) => ctx.docAction.registerDocAction(t, m.docActions[t]));
  // FSM entry of AD_Table PP_Cost_Collector 53035 (MPPCostCollector: voidIt returns false :506, reActivateIt false :628, reverseAccrualIt false :622; reverseCorrectIt is DEFERRED)
  if (ctx.form) ctx.form.register('org.eevolution.form.VOrderReceiptIssue', m.formDescriptor);   // AD_Form 53007: drawn by the generic form renderer, zero host code
  if (ctx.docFsm) ctx.docFsm.register(53035, { name: 'PP_Cost_Collector', reActivate: false, rc: false, ra: false, vo: {} });
}
export async function deactivate() {}
