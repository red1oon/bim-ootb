// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_cost.mjs: HOT chunk of the Libero bundle, slice 3 (prompts/mfg/LIBERO_COST_SLICE3_SPEC.md; Witness W-LIBERO-COST). The PP_Cost_Collector model + DocAction for Component Issue (110) and Material
//   Receipt (100), StorageEngine.createTransaction, CostEngine.createCostDetail / createRateVariances. Core ports are REUSED (ModelTrade storage, ModelCost MCostDetail, ModelMaster acct schemas). Pure: no clock, no random.
//   Every type it does not port is REFUSED by name (never a silent no-op).
export const DEFERRED = [
  'MPPCostCollector Activity Control (160) completeIt + CostEngine.createActivityControl + RoutingService.getResourceBaseValue',
  'Usage / Method Change / Mix variance collectors (120/130/150) and CostEngine.createUsageVariances / createMethodVariances bodies',
  'MPPCostCollector.reverseCorrectIt / voidIt (voidIt is false upstream) and subcontracting createPO',
  'StorageEngine: MStorageOnHand.getWarehouse guarantee-date filter and MAttributeSetInstance.create lot/serial/guarantee generation',
  'Doc_PPCostCollector posting (M6) and MPPOrder.voidIt / closeIt / createVariances'
];
export const SOURCE = { calculateFG: true };   // LCOST_BREAK=calcfg flips it to prove the witness sees the finished-goods cost rule
const T_RECEIPT = '100', T_ISSUE = '110', T_USAGE = '120', T_METHOD = '130', T_RATE = '140', T_MIX = '150', T_ACTIVITY = '160';

export function create(ctx) {
  const ML = ctx.docAction, D = ML.D, ZERO = D(0), BDc = D(0).constructor, RM_HALF_UP = 'HALF_UP', RM_HALF_EVEN = 'HALF_EVEN';
  const MC = () => globalThis.ModelCost, T = () => globalThis.ModelTrade, MM = () => globalThis.ModelMaster;
  const asiOf = (v) => (v == null || v === '' ? 0 : v);   // an ASI created in this Trx is a '#new:i' placeholder: NEVER Number() it
  const dec = (v) => D(v == null ? 0 : v), num = (v) => ML.N(v), lc = (v) => (v == null ? v : String(v)), active = (r) => r.isactive == null || r.isactive === '' || r.isactive === 'Y';

  // ── type predicates (MPPCostCollector :894-960) ─────────────────────────────────────────────────────────────────
  const isType = (cc, ...ts) => ts.indexOf(String(cc.costcollectortype)) >= 0;
  const isIssue = (cc) => isType(cc, T_ISSUE) || (isType(cc, T_METHOD) && Number(cc.pp_order_bomline_id) > 0) || (isType(cc, T_MIX) && Number(cc.pp_order_bomline_id) > 0);
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
      if (!(Number(rec.pp_order_bomline_id || 0) > 0)) return 'FillMandatory: PP_Order_BOMLine_ID';
      const bl = trx.get('pp_order_bomline', rec.pp_order_bomline_id);
      if (!(Number(rec.c_uom_id || 0) > 0)) rec.c_uom_id = bl.c_uom_id;
      if (Number(rec.c_uom_id) !== Number(bl.c_uom_id)) return '@PP_Cost_Collector_ID@ @C_UOM_ID@ <> @PP_Order_BOMLine_ID@ @C_UOM_ID@';
    }
    if (isActivity(rec) && !(Number(rec.pp_order_node_id || 0) > 0)) return 'FillMandatory: PP_Order_Node_ID';
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

  return { models: { pp_cost_collector: { beforeSave } }, docActions: { pp_cost_collector: doc }, collectorFields, createCostDetail, calculateFG };
}
export async function activate(ctx) {
  const m = create(ctx);
  Object.keys(m.models).forEach((t) => ctx.docAction.registerModel(t, m.models[t]));
  Object.keys(m.docActions).forEach((t) => ctx.docAction.registerDocAction(t, m.docActions[t]));
  // FSM entry of AD_Table PP_Cost_Collector 53035 (MPPCostCollector: voidIt returns false :506, reActivateIt false :628, reverseAccrualIt false :622; reverseCorrectIt is DEFERRED)
  if (ctx.docFsm) ctx.docFsm.register(53035, { name: 'PP_Cost_Collector', reActivate: false, rc: false, ra: false, vo: {} });
}
export async function deactivate() {}
