// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// libero_mto.mjs - Make-to-Order / Make-to-Kit (bim-ootb prompts/mfg/LIBERO_MTO_SPEC.md; Witness: W-LIBERO-MTO). Verbatim ports from pshepetko/org.idempiere.mfg @ b2adfea0:
//   MPPMRP.createMOMakeTo :85-316 + createMO :330-381, DefaultRoutingServiceImpl.calculateDuration(mrp, wf, plant, qty, demandStart) :274-342 + calculateMillisFor(AD_WF_Node) :376-398 +
//   createResourceAssign(mrp, ctx, BigDecimal, node, Timestamp, BigDecimal) :469-541 + getDurationBaseSec(String) :707-724, CRP.scheduleBackward :437-536 + getAvailableDurationMillis :345-355,
//   CRPReasoner.isAvailable(r) :187-191 / getAvailableDate(r, d, backward) :200-271, MFG_Validator.updateMPPOrder :376-445 + MPPOrder.updateMakeToKit :1709-1812.
//   Core (iDempiere org.adempiere.base): MPPProductPlanning.find :157-172 / getPlantForWarehouse :179-188, MWorkflow.getWorkflowSearchKey :946-952, MResourceType getDayStart/getDayEnd :211-237 /
//   isDayAvailable :304-332 / isAvailable :356-364, TimeUtil.getDayBorder :673-710.
// Dates are wall-clock 'YYYY-MM-DD HH:MM:SS' strings (the twin's store); arithmetic is done on them as UTC so no timezone shift enters (Java Calendar works in the server zone).
// NAMED, not ported: createWFActivity (:626-660, the MRP dashboard workflow thread - upstream swallows its failure, nothing else reads it); unavailability in getAvailableDate (the upstream loop
//   recomputes from the ORIGINAL date at the end, so S_ResourceUnAvailable never moves the date - the port keeps that result).
export const SOURCE = { kit: true };

export function create(ctx) {
  const ML = ctx.docAction;
  const BD = () => globalThis.ModelTrade.D;
  const dec = (v) => BD()(v == null ? 0 : v), num = (v) => ML.N(v);
  const active = (r) => r.isactive == null || r.isactive === '' || r.isactive === 'Y';
  // ── wall-clock time ──
  const ms = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(String(s)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) : NaN; };
  const ts = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  const addDays = (t, n) => t + n * 86400000;
  const hms = (t) => { const d = new Date(t); return [d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()]; };
  const setHms = (t, h) => { const d = new Date(t); d.setUTCHours(h[0], h[1], h[2], h[3] || 0); return d.getTime(); };
  function dayBorder(t, slot, end) {                                                     // TimeUtil.getDayBorder :673-710
    if (slot != null) return setHms(t, hms(ms(slot)));
    return end ? setHms(t, [23, 59, 59, 999]) : setHms(t, [0, 0, 0, 0]);
  }
  // ── MResourceType ──
  const rtOf = (trx, r) => trx.get('s_resourcetype', r.s_resourcetype_id);
  const isY = (v) => v === 'Y';
  function rtDayStart(rt, t) { return isY(rt.istimeslot) ? dayBorder(t, rt.timeslotstart, false) : dayBorder(t, null, false); }
  function rtDayEnd(rt, t) { return isY(rt.istimeslot) ? dayBorder(t, rt.timeslotend, true) : dayBorder(t, null, true); }
  function rtDayAvailable(rt, t) {                                                       // :304-332
    if (!active(rt)) return false; if (!isY(rt.isdateslot)) return true;
    return isY(rt[['onsunday', 'onmonday', 'ontuesday', 'onwednesday', 'onthursday', 'onfriday', 'onsaturday'][new Date(t).getUTCDay()]]);
  }
  function rtAvailable(rt) {                                                             // :356-364 (getAvailableDaysWeek > 0 && getTimeSlotHours > 0)
    if (!active(rt)) return false;
    const days = isY(rt.isdateslot) ? ['onmonday', 'ontuesday', 'onwednesday', 'onthursday', 'onfriday', 'onsaturday', 'onsunday'].filter((c) => isY(rt[c])).length : 7;
    const hours = isY(rt.istimeslot) ? Math.trunc((ms(rt.timeslotend) - ms(rt.timeslotstart)) / 3600000) : 24;
    return days > 0 && hours > 0;
  }
  function availableDate(rt, t, backward) { let d = t; for (let i = 0; i < 7; i++) { if (rtDayAvailable(rt, d)) return d; d = addDays(d, backward ? -1 : 1); } return d; }   // CRPReasoner :200-213
  // ── CRP.scheduleBackward :437-516 ──
  function scheduleBackward(trx, endT, nodeMillis, r) {
    const rt = rtOf(trx, r), maxIt = sysInt(trx, 'CRP.MaxIterationsNo', 1000);
    let start = null, cur = endT, remaining = nodeMillis, it = 0;
    do {
      const keep = hms(cur); cur = setHms(availableDate(rt, cur, true), keep);           // Ferry: reasoner returns 00:00:00, the hour is restored
      let dayEnd = rtDayEnd(rt, cur); if (it === 0 && cur < dayEnd) dayEnd = cur;          // Ferry: the first day ends at the given end
      const dayStart = rtDayStart(rt, cur), avail = dayEnd - dayStart;
      if (avail < 0) throw new Error('@TimeSlotStart@ > @TimeSlotEnd@ (' + ts(dayEnd) + ' > ' + ts(dayStart) + ')');
      if (avail >= remaining) { start = dayEnd - remaining; remaining = 0; break; }
      cur = addDays(dayBorder(cur, null, true), -1); remaining -= avail;
      if (++it > maxIt) throw new Error('Maximum number of iterations exceeded (' + maxIt + ') - Date:' + start + ', RemainingMillis:' + remaining);
    } while (remaining > 0);
    return start;
  }
  function sysInt(trx, name, dflt) { const r = trx.find('ad_sysconfig', { name }).filter((x) => active(x) && (Number(x.ad_client_id || 0) === 0 || Number(x.ad_client_id) === Number(trx.env.client)))
    .sort((a, b) => Number(b.ad_client_id || 0) - Number(a.ad_client_id || 0))[0]; const v = r ? parseInt(r.value, 10) : NaN; return isNaN(v) ? dflt : v; }
  // ── DefaultRoutingServiceImpl ──
  const DUR = { s: 1, m: 60, h: 3600, D: 86400, M: 2592000, Y: 31536000 };                 // getDurationBaseSec(String) :707-724
  function estimateWorkingTime(node, qty) { const uc = Number(node.unitscycles || 0); let c = dec(qty); if (uc > 0) c = c.divide(dec(uc), 0, 'UP'); return Number(node.duration || 0) * Math.trunc(Number(c.toString())); }   // :74-80 + calculateCycles
  function millisFor(node, wf, base, qty) {                                              // calculateMillisFor(AD_WF_Node, base, qty) :376-398
    let total = Number(node.queuingtime || 0) + Number(node.setuptime || 0) + Number(node.movingtime || 0) + Number(node.waitingtime || 0);
    const bs = dec(wf.qtybatchsize || 0); if (bs.compareTo(dec(1)) > 0) total = total * Math.trunc(Number(dec(qty).divide(bs, 0, 'UP').toString()));
    total += estimateWorkingTime(node, qty);
    return Math.trunc(total * base * 1000);
  }
  let startAssignTime = null;
  function nodesOrdered(trx, wf) {                                                       // MWorkflow.getNodes(true, client): start node, then the transitions
    const all = trx.find('ad_wf_node', { ad_workflow_id: wf.ad_workflow_id }).filter((n) => active(n) && (Number(n.ad_client_id || 0) === 0 || Number(n.ad_client_id) === Number(trx.env.client)));
    const byId = {}; all.forEach((n) => { byId[n.ad_wf_node_id] = n; }); const list = [];
    const add = (id) => { const n = byId[id]; if (!n || list.indexOf(n) >= 0) return; list.push(n);
      trx.find('ad_wf_nodenext', { ad_wf_node_id: id }).filter(active).sort((a, b) => Number(a.seqno) - Number(b.seqno)).forEach((x) => add(x.ad_wf_next_id)); };
    add(wf.ad_wf_node_id); all.forEach((n) => { if (list.indexOf(n) < 0) list.push(n); }); return list;
  }
  function mrpName(trx, mrp) {
    let n = 'MRP:' + mrp.pp_mrp_id; const so = mrp.c_order_id ? trx.get('c_order', mrp.c_order_id) : null, mo = mrp.pp_order_id ? trx.get('pp_order', mrp.pp_order_id) : null;
    if (so && so.documentno != null) n += ' Order:' + so.documentno; else if (mo && mo.documentno != null) n += ' MO:' + mo.documentno; return n;
  }
  function createResourceAssign(trx, mrp, duration, node, startT, durationRealMinutes) {   // :469-541
    const name = mrpName(trx, mrp), found = trx.find('s_resourceassignment', { s_resource_id: node.s_resource_id, name })[0];
    startAssignTime = startT;
    const res = trx.get('s_resource', node.s_resource_id), rt = rtOf(trx, res), uom = rt ? trx.get('c_uom', rt.c_uom_id) : null, sym = uom ? String(uom.uomsymbol || '').trim() : '';
    const base = DUR[sym] || 0; if (!base) throw new Error('@NotSupported@ @C_UOM_ID@ - ' + sym);
    const ol = mrp.c_orderline_id ? trx.get('c_orderline', mrp.c_orderline_id) : null, olp = ol && ol.m_product_id ? trx.get('m_product', ol.m_product_id) : null, mp = trx.get('m_product', mrp.m_product_id);
    const desc = olp && dec(ol.qtyordered).signum() !== 0 ? olp.name + ' ' + dec(ol.qtyordered).toString() : (mp ? mp.name : '') + ' ' + dec(mrp.qty).toString();
    const qty = dec(durationRealMinutes).multiply(dec(60)).divide(dec(base), 8, 'UP');
    const f = { ad_org_id: mrp.ad_org_id, name, assigndatefrom: ts(startT), assigndateto: ts(startT + Math.trunc(Number(duration)) * 60000), s_resource_id: node.s_resource_id, description: desc, qty: num(qty) };
    const po = found ? ML.po(trx, 's_resourceassignment', found) : ML.newRecord(trx, 's_resourceassignment', { isconfirmed: 'N' });
    Object.keys(f).forEach((k) => po.set(k, f[k])); if (!po.save()) throw new Error(po.error || 'S_ResourceAssignment save failed');
    trx.say('§LIBERO-MTO resource-assign ' + name + ' resource=' + node.s_resource_id + ' ' + f.assigndatefrom + ' .. ' + f.assigndateto + ' qty=' + f.qty);
    return po.row;
  }
  function calculateDuration(trx, mrp, wf, plant, qty, demandStart) {                  // :274-342
    if (!plant) return 0;
    let duration = 0, counter = ms(demandStart); const nodes = nodesOrdered(trx, wf).reverse(), seen = {};
    for (const node of nodes) {
      if (seen[node.ad_wf_node_id]) throw new Error('Cyclic transition found ' + node.name); seen[node.ad_wf_node_id] = 1;
      const r = node.s_resource_id ? trx.get('s_resource', node.s_resource_id) : null; if (!r) continue;
      if (!rtAvailable(rtOf(trx, r))) throw new Error('@ResourceNotInSlotDay@');
      const nodeMillis = millisFor(node, wf, DUR[wf.durationunit] || 0, qty), dateStart = scheduleBackward(trx, counter, nodeMillis, r);
      trx.say('§LIBERO-MTO createWFActivity (MRP dashboard thread) not ported - named');
      const realMin = Math.trunc(nodeMillis / 1000 / 60), thisMin = Math.trunc((counter - dateStart) / 1000 / 60);
      createResourceAssign(trx, mrp, thisMin, node, dateStart, realMin);
      duration += thisMin;
      const row = trx.get('pp_mrp', mrp.pp_mrp_id); ML.po(trx, 'pp_mrp', row).set('datestartschedule', ts(dateStart)).set('datefinishschedule', demandStart).save(); mrp = trx.get('pp_mrp', mrp.pp_mrp_id);
      counter = dateStart;
    }
    return duration;
  }
  // ── core planning ──
  function plantForWarehouse(trx, whId) {                                                // MPPProductPlanning.getPlantForWarehouse :179-188 (MIN, no client filter upstream)
    const ids = trx.find('s_resource', { ismanufacturingresource: 'Y', manufacturingresourcetype: 'PT', m_warehouse_id: whId }).map((r) => Number(r.s_resource_id)); return ids.length ? Math.min(...ids) : 0;
  }
  function planningFind(trx, org, wh, res, prod) {                                       // :157-172
    const inZ = (v, x) => v == null || Number(v) === 0 || Number(v) === Number(x);
    return trx.find('pp_product_planning', { ad_client_id: trx.env.client, m_product_id: prod }).filter((p) => active(p) && inZ(p.ad_org_id, org) && inZ(p.m_warehouse_id, wh) && inZ(p.s_resource_id, res))
      .sort((a, b) => Number(b.ad_org_id || 0) - Number(a.ad_org_id || 0) || Number(b.m_warehouse_id || 0) - Number(a.m_warehouse_id || 0) || Number(b.s_resource_id || 0) - Number(a.s_resource_id || 0))[0] || null;
  }
  const workflowSearchKey = (trx, product) => { const w = trx.find('ad_workflow', { value: product.value, ad_client_id: trx.env.client })[0]; return w ? w.ad_workflow_id : 0; };   // MWorkflow :946-952
  function tr(trx, text) { const m = trx.find('ad_message', { value: text })[0]; if (m && m.msgtext) return m.msgtext; const e = trx.find('ad_element', { columnname: text })[0]; return e ? e.name : text; }   // Msg.translate
  function listName(trx, table, column, value) {                                         // MRefList.getListName(ctx, AD_Reference_ID, value)
    const c = trx.q('SELECT c.ad_reference_value_id AS r FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND lower(c.columnname)=?', [table, column])[0];
    const l = c ? trx.find('ad_ref_list', { ad_reference_id: c.r, value })[0] : null; return l ? l.name : '';
  }
  // MPPMRP.createMO :330-381
  function createMO(trx, mrp, pp, olId, asiId, qty, dateOrdered, datePromised, description) {
    const bom = pp.pp_product_bom_id ? trx.get('pp_product_bom', pp.pp_product_bom_id) : null, wf = pp.ad_workflow_id ? trx.get('ad_workflow', pp.ad_workflow_id) : null;
    if (!(Number(pp.s_resource_id) > 0 && bom && wf)) return null;
    const plant = trx.get('s_resource', pp.s_resource_id), duration = calculateDuration(trx, mrp, wf, plant, qty, datePromised), start = startAssignTime;
    const prod = trx.get('m_product', pp.m_product_id);
    const o = ML.newRecord(trx, 'pp_order', { ad_org_id: pp.ad_org_id, description, c_orderline_id: olId, s_resource_id: pp.s_resource_id, m_warehouse_id: pp.m_warehouse_id, m_product_id: pp.m_product_id,
      m_attributesetinstance_id: asiId || 0, pp_product_bom_id: pp.pp_product_bom_id, ad_workflow_id: pp.ad_workflow_id, planner_id: pp.planner_id, line: 10, dateordered: dateOrdered, datepromised: datePromised,
      datestartschedule: start != null ? ts(start) : null, datefinishschedule: start != null ? ts(start + duration * 60000) : null, c_uom_id: prod.c_uom_id, qtyentered: num(dec(qty)), qtyordered: num(dec(qty)), priorityrule: '3' });
    if (!o.save()) throw new Error(o.error || 'MO save failed');
    const id = o.row.pp_order_id; const o2 = ML.po(trx, 'pp_order', trx.get('pp_order', id)); o2.set('docaction', 'CO'); if (!o2.save()) throw new Error(o2.error);
    const isMoDemand = mrp.typemrp === 'D' && mrp.ordertype === 'MOP';                    // materialDemandOfMO :1481
    const ch = { docstatus: 'IP' }; if (!isMoDemand) ch.pp_order_id = id;
    ML.po(trx, 'pp_mrp', trx.get('pp_mrp', mrp.pp_mrp_id)).set('docstatus', ch.docstatus).set('pp_order_id', ch.pp_order_id != null ? ch.pp_order_id : mrp.pp_order_id).save();
    trx.say('§LIBERO-MTO createMO order=' + trx.get('pp_order', id).documentno + ' product=' + pp.m_product_id + ' qty=' + dec(qty).toString() + ' start=' + (start != null ? ts(start) : null) + ' minutes=' + duration);
    return trx.get('pp_order', id);
  }
  // MPPMRP.createMOMakeTo :85-316 -> the S_Resource_ID for the SO's MRP row (0 when an MO was made / updated)
  function createMOMakeTo(trx, mrp, ol, qty, ferry) {
    const product = trx.get('m_product', ol.m_product_id); if (product.isbom !== 'Y') return 0;
    let bom = trx.q("SELECT * FROM pp_product_bom WHERE bomtype IN ('O','K') AND bomuse='M' AND value=? AND ad_client_id=? ORDER BY pp_product_bom_id", [product.value, trx.env.client])[0] || null;   // :97-110 setClient_ID, firstOnly
    const wfId = workflowSearchKey(trx, product); let wf = wfId > 0 ? trx.get('ad_workflow', wfId) : null;
    const plantId = plantForWarehouse(trx, ol.m_warehouse_id); let pp = null;
    if (!bom || !wf) {
      if (plantId <= 0) throw new Error('NoPlantForWarehouseException: M_Warehouse_ID=' + ol.m_warehouse_id);
      pp = planningFind(trx, ol.ad_org_id, ol.m_warehouse_id, plantId, ol.m_product_id); if (!pp) throw new Error('@NotFound@ @PP_Product_Planning_ID@');
    }
    if (!bom && pp) { bom = pp.pp_product_bom_id ? trx.get('pp_product_bom', pp.pp_product_bom_id) : null;
      if (bom && bom.bomtype !== 'O' && bom.bomtype !== 'K') { if (bom.bomtype === 'A') return Number(pp.s_resource_id || 0); throw new Error('@NotFound@ @PP_ProductBOM_ID@'); } }
    let order = trx.find('pp_order', { c_orderline_id: ol.c_orderline_id, m_product_id: ol.m_product_id })[0] || null;      // MPPOrder.forC_OrderLine_ID :82-88
    if (!wf && pp) { wf = pp.ad_workflow_id ? trx.get('ad_workflow', pp.ad_workflow_id) : null; if (!wf) throw new Error('@NotFound@ @AD_Workflow_ID@'); }
    if (!order) {
      if (plantId > 0 && wf) {
        const so = trx.get('c_order', ol.c_order_id), bomTypeName = tr(trx, listName(trx, 'pp_order_bom', 'bomtype', bom.bomtype));
        const desc = bomTypeName + ' ' + tr(trx, 'C_Order_ID') + ' : ' + so.documentno;
        const plan = { ad_org_id: ol.ad_org_id, m_product_id: product.m_product_id, planner_id: so.salesrep_id, pp_product_bom_id: bom.pp_product_bom_id, ad_workflow_id: wf.ad_workflow_id, m_warehouse_id: ol.m_warehouse_id, s_resource_id: plantId };   // a NEW MPPProductPlanning, never saved
        ferry(true);
        try { order = createMO(trx, mrp, plan, ol.c_orderline_id, ol.m_attributesetinstance_id, qty, ol.dateordered, ol.datepromised, desc); } finally { ferry(false); }
        if (order) {
          const d2 = (ol.description == null ? '' : ol.description) + ' ' + bomTypeName + ' ' + tr(trx, 'PP_Order_ID') + ' : ' + order.documentno;
          const lp = ML.po(trx, 'c_orderline', trx.get('c_orderline', ol.c_orderline_id)); lp.set('description', d2); if (!lp.save()) throw new Error(lp.error);
        }
      }
    } else {
      const noEdit = order.docstatus === 'CO' || order.docstatus === 'CL';
      if (order.processed !== 'Y' && !noEdit) {
        if (Number(order.m_product_id) !== Number(ol.m_product_id)) return 'DEFERRED: createMOMakeTo product change of an existing MO (voidIt of the generated order) is not ported - nothing was written';
        if (dec(order.qtyentered).compareTo(dec(ol.qtyentered)) !== 0) { const p = ML.po(trx, 'pp_order', order); p.set('qtyentered', num(dec(ol.qtyentered))).set('qtyordered', num(dec(ol.qtyentered))); if (!p.save()) throw new Error(p.error); }
        const cur = trx.get('pp_order', order.pp_order_id);
        if (String(cur.datepromised).slice(0, 19) !== String(ol.datepromised).slice(0, 19)) { const p = ML.po(trx, 'pp_order', cur); p.set('datepromised', ol.datepromised); if (!p.save()) throw new Error(p.error); }
      }
    }
    return 0;
  }
  // MFG_Validator.updateMPPOrder :376-445 + MPPOrder.updateMakeToKit :1709-1812 (a customer shipment of a Make-to-Kit order completes, issues and receives it)
  function updateMPPOrder(trx, outline, cost, orderDoc) {
    const io = trx.get('m_inout', outline.m_inout_id); let olId = 0, qtyShip = dec(0);
    if (io.movementtype === 'C-') { olId = outline.c_orderline_id; qtyShip = dec(outline.movementqty); }
    else if (io.movementtype === 'C+') { const rl = trx.get('m_rmaline', outline.m_rmaline_id), sl = rl ? trx.get('m_inoutline', rl.m_inoutline_id) : null; olId = sl ? sl.c_orderline_id : 0; qtyShip = dec(outline.movementqty).negate(); }
    const order = trx.find('pp_order', { c_orderline_id: olId }).filter((o) => (o.docstatus === 'IP' || o.docstatus === 'CO') && trx.find('pp_order_bom', { pp_order_id: o.pp_order_id }).some((b) => b.bomtype === 'K'))[0];
    if (!order) return null;
    if (order.docstatus === 'IP') { orderDoc.completeIt(trx, order); trx.update('pp_order', trx.get('pp_order', order.pp_order_id), { docstatus: 'CO', docaction: 'CL' }); }   // :407-413 the returned status is ignored upstream
    let cur = trx.get('pp_order', order.pp_order_id);
    if (cur.docstatus === 'CO') {
      const desc = cur.description != null ? cur.description : '' + tr(trx, 'M_InOut_ID') + ' : ' + tr(trx, 'DocumentNo');   // upstream operator precedence kept: an existing description stays as is
      const p = ML.po(trx, 'pp_order', cur); p.set('description', desc); if (!p.save()) throw new Error(p.error);
      updateMakeToKit(trx, trx.get('pp_order', order.pp_order_id), qtyShip, cost);
      cur = trx.get('pp_order', order.pp_order_id);
    }
    if (dec(cur.qtyordered).subtract(dec(cur.qtydelivered)).signum() === 0) {
      const r = ML.processIt(trx, 'pp_order', cur.pp_order_id, 'CL'); if (!r.ok) throw new Error(r.msg || 'MO close refused');
    }
    trx.say('§LIBERO-MTO updateMPPOrder kit order=' + cur.documentno + ' shipped=' + qtyShip.toString() + ' status=' + trx.get('pp_order', order.pp_order_id).docstatus);
    return null;
  }
  function updateMakeToKit(trx, order, qtyShipment, cost) {
    const obom = trx.find('pp_order_bom', { pp_order_id: order.pp_order_id })[0]; if (!obom || obom.bomtype !== 'K' || obom.bomuse !== 'M') return;
    const today = (trx.env && trx.env.now) || null, lines = trx.find('pp_order_bomline', { pp_order_id: order.pp_order_id }).sort((a, b) => Number(a.line) - Number(b.line));
    const mult = (l) => (l.isqtypercentage === 'Y' ? dec(l.qtybatch).divide(dec(100), 8, 'HALF_UP') : dec(l.qtybom));   // MPPOrderBOMLine.getQtyMultiplier
    const rows = lines.map((l) => ({ bomLineId: l.pp_order_bomline_id, selected: l.issuemethod === 'B', productId: l.m_product_id, toDeliver: qtyShipment.multiply(mult(l)), scrap: dec(0) }));
    const so = trx.get('c_order', trx.get('c_orderline', order.c_orderline_id).c_order_id); let force = false;
    if (so.deliveryrule === 'L' || so.deliveryrule === 'O') { if (!cost.isQtyAvailable(trx, order, rows, today)) throw new Error('@NoQtyAvailable@'); }
    else if (so.deliveryrule === 'A' || so.deliveryrule === 'M') throw new Error('@ActionNotSupported@');
    else if (so.deliveryrule === 'F') force = true;
    for (const r of rows) {
      const bl = trx.get('pp_order_bomline', r.bomLineId), st = cost.getStorages(trx, r.productId, order.m_warehouse_id, bl.m_attributesetinstance_id || 0, today);
      cost.createIssue(trx, order, r.bomLineId, today, r.toDeliver, r.scrap, dec(0), st, force);
    }
    const loc = trx.find('m_locator', { m_warehouse_id: order.m_warehouse_id }).filter(active).sort((a, b) => (b.isdefault === 'Y') - (a.isdefault === 'Y') || Number(a.m_locator_id) - Number(b.m_locator_id))[0];
    const o = trx.get('pp_order', order.pp_order_id);
    cost.createReceipt(trx, o, today, o.qtydelivered, qtyShipment, o.qtyscrap, o.qtyreject, loc ? loc.m_locator_id : 0, o.m_attributesetinstance_id);
  }
  return { createMOMakeTo, createMO, calculateDuration, scheduleBackward, updateMPPOrder, plantForWarehouse, planningFind };
}

export async function activate(ctx) { ctx.libero = Object.assign(ctx.libero || {}, { mto: create(ctx) }); }
export async function deactivate(ctx) { if (ctx && ctx.libero) delete ctx.libero.mto; }
