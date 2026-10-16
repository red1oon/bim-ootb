// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_callouts.mjs: HOT chunk of the Libero bundle - the window callouts the Manufacturing dictionary references. The AD names the classes
//   org.eevolution.model.CalloutOrder (PP_Order.M_Product_ID / QtyEntered) and org.eevolution.model.CalloutCostCollector (PP_Cost_Collector.PP_Order_ID / PP_Order_Node_ID / MovementQty);
//   the Libero source holds them as org.libero.callouts.CalloutOrder / CalloutCostCollector (an IColumnCallout factory maps the name), so they are registered here under the DICTIONARY's names.
//   Without them a New Manufacturing Order keeps QtyOrdered=1 whatever QtyEntered says and the Product does not fill the routing / BOM.
export async function activate(ctx) {
  const A = globalThis.AdCallout;
  const def = (fqcn, factory) => ctx.callout.defineCallout(fqcn, factory);
  def('org.eevolution.model.CalloutOrder', function (CalloutEngine, R) {
    const Env = R.Env, RM = R.RM, M = R.M;
    const BD = (v) => (v == null ? Env.ZERO : v);
    function CalloutOrder() { CalloutEngine.call(this); }
    CalloutOrder.prototype = Object.create(CalloutEngine.prototype);
    const P = CalloutOrder.prototype;
    // MPPOrder.updateQtyBatchs(ctx, order, override) :96-120 on the tab (the GridTabWrapper of I_PP_Order)
    function updateQtyBatchs(mTab, override) {
      let size = BD(mTab.getValue('QtyBatchSize'));
      if (size.signum() === 0 || override) {
        const wfId = Number(mTab.getValue('AD_Workflow_ID') || 0); if (wfId <= 0) return;
        const wf = R.DB.query('SELECT qtybatchsize FROM ad_workflow WHERE ad_workflow_id=?', [wfId])[0];
        size = BD(wf && wf.qtybatchsize != null ? R.toBD ? R.toBD(String(wf.qtybatchsize)) : Env.ZERO.add(String(wf.qtybatchsize)) : null).setScale(0, RM.UP);
        mTab.setValue('QtyBatchSize', size);
      }
      mTab.setValue('QtyBatchs', size.signum() === 0 ? Env.ONE : BD(mTab.getValue('QtyOrdered')).divide(size, 0, RM.UP));
    }
    // qty :58-124 - Entered <-> Ordered through the product UOM conversion, then qtyBatch
    P.qty = function (ctx2, WindowNo, mTab, mField, value) {
      if (value == null) return '';
      const M_Product_ID = Env.getContextAsInt(ctx2, WindowNo, 'M_Product_ID'); let QtyOrdered, QtyEntered;
      if (M_Product_ID === 0) { QtyEntered = mTab.getValue('QtyEntered'); mTab.setValue('QtyOrdered', QtyEntered); }
      else if (mField.getColumnName() === 'C_UOM_ID') {
        const To = value; QtyEntered = mTab.getValue('QtyEntered'); QtyOrdered = M.MUOMConversion.convertProductFrom(ctx2, M_Product_ID, To, QtyEntered); if (QtyOrdered == null) QtyOrdered = QtyEntered;
        Env.setContext(ctx2, WindowNo, 'UOMConversion', QtyEntered.compareTo(QtyOrdered) !== 0 ? 'Y' : 'N'); mTab.setValue('QtyOrdered', QtyOrdered);
      } else if (mField.getColumnName() === 'QtyEntered') {
        const To = Env.getContextAsInt(ctx2, WindowNo, 'C_UOM_ID'); QtyEntered = value; QtyOrdered = M.MUOMConversion.convertProductFrom(ctx2, M_Product_ID, To, QtyEntered); if (QtyOrdered == null) QtyOrdered = QtyEntered;
        Env.setContext(ctx2, WindowNo, 'UOMConversion', QtyEntered.compareTo(QtyOrdered) !== 0 ? 'Y' : 'N'); mTab.setValue('QtyOrdered', QtyOrdered);
      } else if (mField.getColumnName() === 'QtyOrdered') {
        const To = Env.getContextAsInt(ctx2, WindowNo, 'C_UOM_ID'); QtyOrdered = value; QtyEntered = M.MUOMConversion.convertProductTo(ctx2, M_Product_ID, To, QtyOrdered); if (QtyEntered == null) QtyEntered = QtyOrdered;
        Env.setContext(ctx2, WindowNo, 'UOMConversion', QtyOrdered.compareTo(QtyEntered) !== 0 ? 'Y' : 'N'); mTab.setValue('QtyEntered', QtyEntered);
      }
      return P.qtyBatch.call(this, ctx2, WindowNo, mTab, mField, value);
    };
    P.qtyBatch = function (ctx2, WindowNo, mTab) { updateQtyBatchs(mTab, true); return ''; };   // :126-131
    // product :133-153 - UOM from the product; routing + BOM from the Product Planning (org, warehouse, resource), else the product-named workflow and the default BOM
    P.product = function (ctx2, WindowNo, mTab) {
      if (this.isCalloutActive()) return '';
      const pid = Number(mTab.getValue('M_Product_ID') || 0), product = pid ? M.MProduct.get(ctx2, pid) : null; if (!product) return '';
      mTab.setValue('C_UOM_ID', product.getC_UOM_ID());
      const org = Number(mTab.getValue('AD_Org_ID') || 0), wh = Number(mTab.getValue('M_Warehouse_ID') || 0), res = Number(mTab.getValue('S_Resource_ID') || 0), cl = Env.getAD_Client_ID(ctx2);
      // MPPProductPlanning.find :157-172
      const pp = R.DB.query("SELECT * FROM pp_product_planning WHERE ad_client_id=? AND m_product_id=? AND (ad_org_id IN (0,?) OR ad_org_id IS NULL) AND (m_warehouse_id IN (0,?) OR m_warehouse_id IS NULL) AND (s_resource_id IN (0,?) OR s_resource_id IS NULL) AND isactive='Y' ORDER BY COALESCE(ad_org_id,0) DESC, COALESCE(m_warehouse_id,0) DESC, COALESCE(s_resource_id,0) DESC", [cl, pid, org, wh, res])[0] || {};
      let wf = Number(pp.ad_workflow_id || 0), bomId = Number(pp.pp_product_bom_id || 0);
      if (wf <= 0) { const w = R.DB.query('SELECT ad_workflow_id FROM ad_workflow WHERE value=? AND ad_client_id=?', [product.getValue(), cl])[0]; wf = w ? Number(w.ad_workflow_id) : 0; }          // MWorkflow.getWorkflowSearchKey :946-952
      if (bomId <= 0) { const b = R.DB.query("SELECT pp_product_bom_id FROM pp_product_bom WHERE m_product_id=? AND bomuse='A' AND bomtype='A' AND isactive='Y'", [pid]); bomId = b.length === 1 ? Number(b[0].pp_product_bom_id) : 0; }   // MPPProductBOM.getDefault
      mTab.setValue('AD_Workflow_ID', wf > 0 ? wf : null); mTab.setValue('PP_Product_BOM_ID', bomId > 0 ? bomId : null);
      if (bomId > 0) { const bom = R.DB.query('SELECT c_uom_id FROM pp_product_bom WHERE pp_product_bom_id=?', [bomId])[0]; if (bom && bom.c_uom_id) mTab.setValue('C_UOM_ID', Number(bom.c_uom_id)); }
      updateQtyBatchs(mTab, true); return '';
    };
    return CalloutOrder;
  });
  def('org.eevolution.model.CalloutCostCollector', function (CalloutEngine, R) {
    const Env = R.Env, RM = R.RM;
    function CalloutCostCollector() { CalloutEngine.call(this); }
    CalloutCostCollector.prototype = Object.create(CalloutEngine.prototype);
    const P = CalloutCostCollector.prototype;
    // order :46-60 -> MPPCostCollector.setPP_Order(cc, order) :144-160
    P.order = function (ctx2, WindowNo, mTab, mField, value) {
      const id = Number(value || 0); if (id <= 0) return '';
      const o = R.DB.query('SELECT * FROM pp_order WHERE pp_order_id=?', [id])[0]; if (!o) return '';
      const wf = R.DB.query('SELECT pp_order_workflow_id FROM pp_order_workflow WHERE pp_order_id=?', [id])[0];
      const set = (c, v) => { if (v !== undefined) mTab.setValue(c, v == null ? null : v); };
      set('PP_Order_Workflow_ID', wf ? wf.pp_order_workflow_id : null); set('AD_Org_ID', o.ad_org_id); set('M_Warehouse_ID', o.m_warehouse_id); set('AD_OrgTrx_ID', o.ad_orgtrx_id); set('C_Activity_ID', o.c_activity_id);
      set('C_Campaign_ID', o.c_campaign_id); set('C_Project_ID', o.c_project_id); set('Description', o.description); set('S_Resource_ID', o.s_resource_id); set('M_Product_ID', o.m_product_id);
      set('C_UOM_ID', o.c_uom_id); set('M_AttributeSetInstance_ID', o.m_attributesetinstance_id); set('MovementQty', o.qtyordered == null ? Env.ZERO : Env.ZERO.add(String(o.qtyordered)));
      return '';
    };
    // duration :86-106 with DefaultRoutingServiceImpl.estimateWorkingTime(cc) :91-97 = node Duration x ceil(MovementQty / UnitsCycles)
    P.duration = function (ctx2, WindowNo, mTab) {
      const nid = Number(mTab.getValue('PP_Order_Node_ID') || 0); if (nid <= 0) return '';
      const n = R.DB.query('SELECT duration, unitscycles FROM pp_order_node WHERE pp_order_node_id=?', [nid])[0]; if (!n) return '';
      const qty = mTab.getValue('MovementQty') || Env.ZERO, units = Number(n.unitscycles || 0);
      const cycles = units > 0 ? Number(qty.divide(Env.ZERO.add(String(units)), 0, RM.UP).toString()) : Math.trunc(Number(qty.toString()));
      mTab.setValue('DurationReal', Env.ZERO.add(String(Number(n.duration || 0) * cycles))); return '';
    };
    // node :62-84
    P.node = function (ctx2, WindowNo, mTab, mField, value) {
      const nid = Number(value || 0); if (nid <= 0) return '';
      const n = R.DB.query('SELECT s_resource_id, issubcontracting, qtyrequiered, qtydelivered FROM pp_order_node WHERE pp_order_node_id=?', [nid])[0]; if (!n) return '';
      mTab.setValue('S_Resource_ID', n.s_resource_id); mTab.setValue('IsSubcontracting', n.issubcontracting === 'Y' ? 'Y' : 'N');
      mTab.setValue('MovementQty', Env.ZERO.add(String(Number(n.qtyrequiered || 0) - Number(n.qtydelivered || 0))));
      return P.duration.call(this, ctx2, WindowNo, mTab, mField, value);
    };
    return CalloutCostCollector;
  });
  void A;
}
export async function deactivate() {}
