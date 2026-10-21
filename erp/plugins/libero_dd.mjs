// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_dd.mjs: HOT chunk of the Libero bundle for DISTRIBUTION ORDERS (prompts/mfg/LIBERO_DD_SPEC.md §4; Witness W-LIBERO-DD = erp/tests/witness_libero_dd.js - READ THE LOG: §LDD lines).
//   The core models (MDDOrder / MDDOrderLine / MMovement, erp/model_dd.js + erp/model_movement.js) live in the base like in legacy; what THIS chunk adds is Libero's reaction to them:
//   MFG_Validator.initialize :70-115 registers PO_AFTER_NEW / PO_AFTER_CHANGE / PO_BEFORE_DELETE on DD_Order and DD_OrderLine and DOC_AFTER_COMPLETE on M_Movement; doHandleEvent :118-358 routes them to
//   MPPMRP.DD_Order / DD_OrderLine / deleteMRP and to the movement block :322-358. Pure: no clock (env.now), no random. Anything not ported is named (DEFERRED below), never silent.
export const DEFERRED = [
  'MPPMRP static C_Order_ID leak into the MRP ctor (MPPMRP :635-652) for DD rows - the order chunk keeps that state privately; §57 item 3 removes the leak, so DD rows are written without it (named, declared deviation)',
  'MFG_Validator PO_BEFORE_NEW on M_Movement is registered upstream (:73) but has no handler (doHandleEvent) - nothing to port (witnessed H9)',
  'DD_NetworkDistribution / DistributionRun / ReplenishReport / MovementGenerate (org.libero.process.MovementGenerate, 792 lines) / CalloutDistributionOrder - Libero processes and callouts, not model hooks; not in this chunk'
];

export function create(ctx) {
  const ML = ctx.docAction;                                   // the ModelLayer facade
  const D = ML.D, N = ML.N, Z = D(0);
  const dec = (v) => D(v == null ? 0 : v);
  const same = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
  const idSet = (v) => v != null && v !== '' && Number(v) !== 0;
  const DD = () => globalThis.ModelDD;                        // erp/model_dd.js (the core port: reserveStock is called by the movement hook, MFG_Validator :349)

  // MPPMRP.isChanged :462-482 over s_sourceColumnNames :421-436
  const SRC = { dd_order: ['docstatus', 'c_bpartner_id'],
    dd_orderline: ['ad_org_id', 'm_product_id', 'c_uom_id', 'datepromised', 'qtyordered', 'qtydelivered', 'confirmedqty', 'm_locator_id', 'm_locatorto_id'] };
  function isChanged(table, rec, old, isNew) {
    if (isNew) return true;
    if (old && !same(old.isactive, rec.isactive)) return true;
    return !!old && SRC[table].some((c) => !same(rec[c], old[c]));
  }
  // getQuery(po, typeMRP, orderType) :595-630 - rows of THIS client keyed by <table>_ID; firstOnly = the lowest PP_MRP_ID (the Java has no ORDER BY)
  function mrpQuery(trx, table, rec, typeMrp, orderType) {
    const w = { ad_client_id: rec.ad_client_id }; w[table + '_id'] = rec[table + '_id'];
    return trx.find('pp_mrp', w).filter((m) => (!typeMrp || m.typemrp === typeMrp) && (!orderType || m.ordertype === orderType)).sort((a, b) => Number(a.pp_mrp_id) - Number(b.pp_mrp_id));
  }
  function saveMrp(trx, row, fields) {   // new MPPMRP(ctx,0,trx) defaults (:637-643) then saveEx
    const p = row ? ML.po(trx, 'pp_mrp', row) : ML.newRecord(trx, 'pp_mrp', Object.assign({ value: 'MRP', name: 'MRP', isavailable: 'N', datesimulation: (trx.env || {}).now || null }, fields));
    if (row) Object.keys(fields).forEach((k) => p.set(k, fields[k]));
    return p.save() ? null : p.error;
  }
  // MPPMRP.DD_OrderLine :1061-1133
  function mrpDDOrderLine(trx, ol) {
    const parent = trx.get('dd_order', ol.dd_order_id), source = trx.get('m_locator', ol.m_locator_id), target = trx.get('m_locator', ol.m_locatorto_id);
    if (!source || !target) return 'MPPMRP.DD_OrderLine: locator ' + (!source ? ol.m_locator_id : ol.m_locatorto_id) + ' not found (legacy NullPointerException, :1067-1068)';
    const qty = N(dec(ol.qtyordered).subtract(dec(ol.qtydelivered))), common = { description: ol.description == null ? null : ol.description, datepromised: ol.datepromised, dateordered: ol.dateordered, m_product_id: ol.m_product_id, qty, docstatus: parent.docstatus };
    let d = mrpQuery(trx, 'dd_orderline', ol, 'D', 'DOO')[0] || null, e;
    if (d) e = saveMrp(trx, d, Object.assign({ ad_org_id: source.ad_org_id, name: 'DemandDistOrder', m_warehouse_id: source.m_warehouse_id }, common));                                    // :1069-1080
    else e = saveMrp(trx, null, Object.assign({ ad_org_id: source.ad_org_id, name: 'NewDemandDistOrder', dd_order_id: ol.dd_order_id, dd_orderline_id: ol.dd_orderline_id, m_warehouse_id: source.m_warehouse_id, ordertype: 'DOO', typemrp: 'D' }, common));   // :1082-1098
    if (e) return e;
    const s = mrpQuery(trx, 'dd_orderline', ol, 'S', 'DOO')[0] || null;
    if (s) e = saveMrp(trx, s, Object.assign({ ad_org_id: target.ad_org_id, name: 'SupplyDistOrder', m_warehouse_id: target.m_warehouse_id }, common));                                     // :1102-1113
    else e = saveMrp(trx, null, Object.assign({ ad_org_id: target.ad_org_id, name: 'NewSupplyDistOrder', dd_order_id: ol.dd_order_id, dd_orderline_id: ol.dd_orderline_id, m_warehouse_id: target.m_warehouse_id, ordertype: 'DOO', typemrp: 'S' }, common));   // :1115-1131
    if (e) return e;
    trx.say('§LDD-MRP DD_OrderLine line=' + ol.dd_orderline_id + ' DOO/D wh=' + source.m_warehouse_id + ' + DOO/S wh=' + target.m_warehouse_id + ' qty=' + qty + ' status=' + parent.docstatus);
    return null;
  }
  // MPPMRP.DD_Order :1034-1056
  function mrpDDOrder(trx, o, old) {
    if (o.docstatus === 'IP' || o.docstatus === 'CO') {                                                                                  // :1036-1043 InProgress / Completed -> every line (o.getLines(): ORDER BY Line)
      for (const l of trx.find('dd_orderline', { dd_order_id: o.dd_order_id }, ['line'])) { const e = mrpDDOrderLine(trx, l); if (e) return e; }
    }
    if (!old || !same(old.docstatus, o.docstatus) || !same(old.c_bpartner_id, o.c_bpartner_id)) {                                         // :1045-1053 setDD_Order on every row of the order
      for (const m of mrpQuery(trx, 'dd_order', o)) { const e = saveMrp(trx, m, { dd_order_id: o.dd_order_id, c_bpartner_id: o.c_bpartner_id, docstatus: o.docstatus }); if (e) return e; }
    }
    return null;
  }
  // MPPMRP.deleteMRP :493-583 for DD_Order / DD_OrderLine: the Ferry blocks are for MPPOrder / SO and MOrderLine (:497-540, :546-557); what runs is the final DELETE ... DocStatus DR or VO (:559-562)
  function deleteMrp(trx, table, rec) {
    const w = { ad_client_id: rec.ad_client_id }; w[table + '_id'] = rec[table + '_id'];
    trx.find('pp_mrp', w).filter((m) => m.docstatus === 'DR' || m.docstatus === 'VO').forEach((m) => trx.del('pp_mrp', m));
    trx.say('§LDD-MRP deleteMRP ' + table + '=' + rec[table + '_id']);
    return null;
  }
  // MFG_Validator.doHandleEvent :118-171 + :242-256 for the two DD tables
  const ddHook = (table, timing) => (c, info) => {
    const trx = c && c.trx, rec = info && info.record; if (!trx || !rec) return null;
    const isNew = timing === 'AFTER_NEW', isDel = timing === 'BEFORE_DELETE', old = info.recordOld || null;
    const isChange = isNew || (timing === 'AFTER_CHANGE' && isChanged(table, rec, old, false));                                          // :138
    const isVoided = table === 'dd_order' && rec.docstatus === 'VO';                                                                     // :143-157 only a DocAction (the header) can be voided; a DD line is neither DocAction nor MOrderLine
    if (isDel || isVoided || rec.isactive === 'N') return deleteMrp(trx, table, rec);                                                    // :168-172
    if (!isChange) return null;
    return table === 'dd_order' ? mrpDDOrder(trx, rec, old) : mrpDDOrderLine(trx, rec);                                                  // :242-256
  };
  // MFG_Validator :322-358 - M_Movement DOC_AFTER_COMPLETE "Update Distribution Order Line"
  const movementComplete = (c, info) => {
    const trx = c && c.trx, mv = info && info.record; if (!trx || !mv) return null;
    const lines = trx.find('m_movementline', { m_movement_id: mv.m_movement_id }, ['line', 'm_movementline_id']);   // move.getLines(false): ORDER BY Line, M_MovementLine_ID
    for (const line of lines) {
      if (!(Number(line.dd_orderline_id) > 0)) continue;                                                                                  // :328
      const oline = trx.get('dd_orderline', line.dd_orderline_id); if (!oline) return 'DD_OrderLine ' + line.dd_orderline_id + ' not found (MFG_Validator :330)';
      const locTo = trx.get('m_locator', line.m_locatorto_id), wh = locTo ? trx.get('m_warehouse', locTo.m_warehouse_id) : null;          // :331-332
      let ch;
      if (wh && wh.isintransit === 'Y') ch = { qtyintransit: N(dec(oline.qtyintransit).add(dec(line.movementqty))), confirmedqty: 0 };    // :333-337 into a transit warehouse
      else ch = { qtyintransit: N(dec(oline.qtyintransit).subtract(dec(line.movementqty))), qtydelivered: N(dec(oline.qtydelivered).add(dec(line.movementqty))) };   // :338-342 out of / not transit
      const r = ML.save(trx, 'dd_orderline', oline, ch); if (!r.ok) throw new Error(r.error);                                              // :343 oline.saveEx -> the DD_OrderLine hook re-fires (QtyDelivered is a source column)
      trx.say('§LDD-MOVE line=' + oline.dd_orderline_id + ' movement=' + mv.m_movement_id + ' qty=' + line.movementqty + ' toTransit=' + (wh && wh.isintransit === 'Y') + ' -> ' + JSON.stringify(ch));
    }
    if (Number(mv.dd_order_id) > 0) {                                                                                                     // :346-352
      const order = trx.get('dd_order', mv.dd_order_id); if (!order) return 'DD_Order ' + mv.dd_order_id + ' not found (MFG_Validator :347)';
      const ls = trx.find('dd_orderline', { dd_order_id: order.dd_order_id }, ['line']);
      const inTransit = ls.some((l) => dec(l.qtyintransit).signum() !== 0);                                                              // isInTransit(order) :362-371
      DD().reserveStock(trx, order, ls);                                                                                                  // order.reserveStock(order.getLines(true, null))
      const r = ML.save(trx, 'dd_order', trx.get('dd_order', order.dd_order_id), { isintransit: inTransit ? 'Y' : 'N' }); if (!r.ok) throw new Error(r.error);   // order.setIsInTransit (:349) -> reserveStock (:350) -> saveEx (:351)
      trx.say('§LDD-MOVE order=' + order.dd_order_id + ' isInTransit=' + (inTransit ? 'Y' : 'N'));
    }
    return null;
  };
  // Doc_DDOrder (org.compiere.acct, shipped by Libero; IDocFactory MFG_DocFactory): loadDocumentDetails returns STATUS_Posted ("P") as p_Error, and Doc.post returns a non-null p_Error before any fact (Doc.java:611-613):
  //   the completion succeeds and nothing is posted (Posted stays N). Hand-computed - the pilot has no Libero, so there is no oracle for this class.
  const docClass = { createFacts(trx, doc, as, F) { F.err = 'Doc_DDOrder.loadDocumentDetails returns STATUS_Posted as p_Error and Doc.post returns it before any fact (Doc.java:611-613): nothing posted - named'; return false; }, basis: 'dd_order' };

  const docClassPP = { createFacts(trx, doc, as, F) { F.err = 'Doc_PPOrder.loadDocumentDetails returns STATUS_Posted as p_Error and Doc.post returns it before any fact (Doc.java:611-613): nothing posted - named'; return false; }, basis: 'pp_order' };
  return {
    docClassPP, docClass, ddHook, movementComplete, isChanged, mrpDDOrderLine, mrpDDOrder, deleteMrp,
    validators: [
      ...['dd_order', 'dd_orderline'].flatMap((t) => ['AFTER_NEW', 'AFTER_CHANGE', 'BEFORE_DELETE'].map((tm) => [t, tm, 'Libero.MFG_Validator.' + t, ddHook(t, tm)])),
      ['m_movement', 'AFTER_COMPLETE', 'Libero.MFG_Validator.m_movement', movementComplete]
    ]
  };
}

// hot chunk contract (plugin_registry): activate registers the SYNC hooks before the bundle reports ACTIVE; the scope facades undo everything on stop.
export async function activate(ctx) {
  const m = create(ctx);
  m.validators.forEach((v) => ctx.modelval.registerValidator(v[0], v[1], v[2], v[3]));
  if (ctx.docClass) {   // MFG_DocFactory (Libero IDocFactory :46-70) hands out Doc_DDOrder / Doc_PPOrder / Doc_PPCostCollector; model_post finds them through DocPoster.docClassFor. pp_cost_collector: libero_cost.mjs.
    ctx.docClass.register('dd_order', m.docClass);
    ctx.docClass.register('pp_order', m.docClassPP);   // Doc_PPOrder is the same empty class for MPPOrder (Libero Doc_PPOrder.java). Registered HERE because the model_post strict rule (DefaultDocumentFactory "Doc Class invalid") needs it and libero_pporder.mjs is not ours to touch in this lane - move it there
  }
}
export async function deactivate() {}
