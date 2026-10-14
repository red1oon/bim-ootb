// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only  (ported from org.idempiere.mfg / Libero, GPLv2; file:line cites are into pshepetko/org.idempiere.mfg @ b2adfea0)
// ⚠ DO NOT REMOVE — libero_pporder.mjs: HOT chunk of the Libero bundle, slice 1 (prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md; Witness W-LIBERO-BUNDLE).
//   Model classes written THROUGH Trx (real tables pp_order_bom, pp_order_bomline, pp_mrp) - NOT the 5-table kernel path. Every rule below is a verbatim port with its Java cite; anything NOT ported is listed in DEFERRED
//   and printed by the witness (§LIBERO-DEFERRED) so no omission is silent. Pure: no clock (env.now), no random.
const RM_UP = 'UP', RM_HALF_UP = 'HALF_UP';
export const DEFERRED = [
  'MPPOrder.orderStock (M_Storage QtyOrdered) - needs StorageEngine, cost side',
  'MPPOrder.explosion routing half (PP_Order_Workflow/Node/NodeNext/NodeProduct/NodeAsset) - RESUME 5 item 3',
  'MPPOrderBOMLine.explodePhantom - fixtures carry no phantom',
  'MPPOrderBOMLine.reserveStock - the MStorageOnHand.add(...,0) touch (the QtyReserved update IS ported)',
  'MPPOrder.beforeSave #M_Warehouse_ID context default'
];
// the three constants the SEED-vs-SOURCE decision rests on (spec "DECISION RECORDED"); LIBERO_BREAK flips them to prove the witness sees them.
export const SOURCE = { uomPrecision: true, bomUseCopied: true, mrpFinishFromOrder: true };

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
  function orderBeforeSave(trx, rec, isNew, old) {
    const env = trx.env || {};
    if (Number(rec.ad_client_id == null ? env.client : rec.ad_client_id) === 0) return 'AD_Client_ID = 0';
    if (!rec.ad_org_id) { const o = Number(env.org || 0); if (!o) return 'AD_Org_ID = 0'; rec.ad_org_id = o; }
    if (!(Number(rec.c_uom_id || 0) > 0) && Number(rec.m_product_id || 0) > 0) { const p = trx.get('m_product', rec.m_product_id); rec.c_uom_id = p ? p.c_uom_id : rec.c_uom_id; }
    if (!rec.datefinishschedule) rec.datefinishschedule = rec.datepromised;
    // orderStock(): DEFERRED (see DEFERRED)
    updateQtyBatchs(trx, rec, false);
    if (isNew) trx._libSet = { pp_order: { qtyentered: rec.qtyentered != null } };   // PO.is_ValueChanged tracks only what the CALLER set, not DB defaults filled in at insert
    return null;
  }
  // changed(col): PO.is_ValueChanged inside afterSave. For a NEW record every set (non-null) column is changed (old = null); for an update, against the old row.
  const changed = (rec, old, isNew, c, trx) => { if (isNew) { const u = trx && trx._libSet && trx._libSet.pp_order; return u && c in u ? u[c] : rec[c] != null; } return old != null && lc(rec[c]) !== lc(old[c]); };
  function isDelivered(rec) { return dec(rec.qtydelivered).signum() > 0; }
  function deleteWorkflowAndBOM(trx, rec) {   // :495-515 (BOM half; the workflow rows are the deferred routing half)
    trx.find('pp_order_bomline', { pp_order_id: rec.pp_order_id }).forEach((r) => trx.del('pp_order_bomline', r));
    trx.find('pp_order_bom', { pp_order_id: rec.pp_order_id }).forEach((r) => trx.del('pp_order_bom', r));
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
    return null;
  }
  function orderAfterSave(trx, live, isNew, old) {
    if (live.docaction === 'CL' || live.docaction === 'VO') return null;   // :451-455
    let e;
    if (changed(live, old, isNew, 'qtyentered', trx) && !isDelivered(live)) { deleteWorkflowAndBOM(trx, live); if ((e = explosion(trx, live))) return e; }
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
  const validator = (table, fn) => (c, info) => {
    const trx = c && c.trx; if (!trx || !info || !info.record) return null;
    const isNew = !info.recordOld; if (!isChanged(table, info.record, info.recordOld, isNew)) return null;
    return fn(trx, info.record);
  };

  return {
    models: { pp_order: { beforeSave: orderBeforeSave, afterSave: orderAfterSave }, pp_order_bomline: { beforeSave: bomLineBeforeSave } },
    validators: [
      ['pp_order', 'AFTER_NEW', 'Libero.MPPMRP.PP_Order', validator('pp_order', mrpPPOrder)],
      ['pp_order', 'AFTER_CHANGE', 'Libero.MPPMRP.PP_Order', validator('pp_order', mrpPPOrder)],
      ['pp_order_bomline', 'AFTER_NEW', 'Libero.MPPMRP.PP_Order_BOMLine', validator('pp_order_bomline', mrpBomLine)],
      ['pp_order_bomline', 'AFTER_CHANGE', 'Libero.MPPMRP.PP_Order_BOMLine', validator('pp_order_bomline', mrpBomLine)]
    ]
  };
}

// hot chunk contract (plugin_registry): activate registers the SYNC hooks before the bundle reports ACTIVE; the scope facades undo everything on stop.
export async function activate(ctx) {
  const m = create(ctx);
  Object.keys(m.models).forEach((t) => ctx.docAction.registerModel(t, m.models[t]));
  m.validators.forEach((v) => ctx.modelval.registerValidator(v[0], v[1], v[2], v[3]));
}
export async function deactivate() {}
