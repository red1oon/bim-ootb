// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_ctor.js — the M-class CONSTRUCTORS + record setters other code builds documents with, ported VERBATIM (ONE
// implementation: MOrder.createShipment/createInvoice, InOutGenerate, InvoiceGenerate, AllocationAuto, PaySelection* all
// call these). Exposed as ModelTrade.ctor.* (browser) / require('./model_ctor') (node). Each returns an UNSAVED ModelLayer.PO
// handle (get/set/save/saveEx through the Trx → hooks, DocumentNo, one op-group). Java root org.adempiere.base/src/org/compiere/model/.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelCtor = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  function V(x, c) { return x instanceof ML.PO ? x.get(c) : (x ? x[c] : null); }               // read a PO handle or a plain row alike
  function row(x) { return x instanceof ML.PO ? x.values() : x; }
  function today(trx) { return trx.env.date; }
  function uomPrecision(trx, uomId) { var u = nz(uomId) ? trx.get('c_uom', uomId) : null; return u ? Number(u.stdprecision) : 0; }   // MUOM.getPrecision
  function productUOMPrecision(trx, productId) { var p = T.product(trx, productId); return p ? uomPrecision(trx, p.c_uom_id) : null; }   // MProduct.getUOMPrecision
  function clientOrg(rec, src) { rec.set('ad_client_id', V(src, 'ad_client_id')); rec.set('ad_org_id', V(src, 'ad_org_id')); }   // PO.setClientOrg(po) :2170-2185

  // ══ MInOut ════════════════════════════════════════════════════════════════════════════════════════════════════
  // setInitialDefaults :585-605 (MovementDate/DateAcct = today = the recorded clock)
  function MInOutNew(trx) {
    var r = ML.newRecord(trx, 'm_inout', {});
    r.set('issotrx', 'N').set('movementdate', today(trx)).set('dateacct', today(trx)).set('deliveryrule', 'A').set('deliveryviarule', 'P').set('freightcostrule', 'I')
      .set('docstatus', 'DR').set('docaction', 'CO').set('priorityrule', '5').set('nopackages', 0).set('isintransit', 'N').set('isprinted', 'N').set('sendemail', 'N')
      .set('isindispute', 'N').set('isapproved', 'N').set('processed', 'N').set('processing', 'N').set('posted', 'N');
    return r;
  }
  // MInOut.getMovementType(ctx, C_DocType_ID, issotrx) :1275-1287 — from the DOC TYPE's DocBaseType + IsSOTrx
  function getMovementType(trx, dtId) { var d = T.dt(trx, dtId); if (!d) return null;
    if (d.docbasetype === 'MMS') return Y(d.issotrx) ? 'C-' : 'V-'; if (d.docbasetype === 'MMR') return Y(d.issotrx) ? 'C+' : 'V+'; return null; }
  // new MInOut(MOrder order, int C_DocTypeShipment_ID, Timestamp movementDate) :624-680
  function MInOutFromOrder(trx, order, C_DocTypeShipment_ID, movementDate) {
    var r = MInOutNew(trx); clientOrg(r, order);
    r.set('c_bpartner_id', V(order, 'c_bpartner_id')).set('c_bpartner_location_id', V(order, 'c_bpartner_location_id')).set('ad_user_id', V(order, 'ad_user_id'));
    r.set('m_warehouse_id', V(order, 'm_warehouse_id')).set('issotrx', V(order, 'issotrx'));
    if (!nz(C_DocTypeShipment_ID)) { var dto = T.dt(trx, V(order, 'c_doctype_id')); C_DocTypeShipment_ID = dto ? dto.c_doctypeshipment_id : 0;
      if (!nz(C_DocTypeShipment_ID)) throw new Error('@NotFound@ @C_DocTypeShipment_ID@ - @C_DocType_ID@:' + (dto ? dto.name : '')); }
    r.set('c_doctype_id', C_DocTypeShipment_ID);
    r.set('movementtype', getMovementType(trx, C_DocTypeShipment_ID));                          // setMovementType :1292-1301
    if (movementDate != null) r.set('movementdate', movementDate);
    r.set('dateacct', r.get('movementdate'));
    ['c_order_id', 'deliveryrule', 'deliveryviarule', 'm_shipper_id', 'freightcostrule', 'freightamt', 'salesrep_id', 'c_activity_id', 'c_campaign_id', 'c_charge_id', 'chargeamt',
     'c_project_id', 'dateordered', 'description', 'poreference', 'ad_orgtrx_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id', 'priorityrule',
     'isdropship', 'dropship_bpartner_id', 'dropship_location_id', 'dropship_user_id'].forEach(function (c) { r.set(c, V(order, c)); });
    return r;
  }
  // MInOut.setC_DocType_ID(String DocBaseType) :1107-1125 / setC_DocType_ID() :1131-1137
  function ioSetDocTypeBase(trx, r, dbt) {
    var d = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype=? AND isactive='Y' AND issotrx=? ORDER BY isdefault DESC", [r.get('ad_client_id'), dbt, Y(r.get('issotrx')) ? 'Y' : 'N'])[0];
    if (!d) { trx.say('§MODEL-CTOR C_DocType Not found for AD_Client_ID=' + r.get('ad_client_id') + ' - ' + dbt); return; }
    r.set('c_doctype_id', d.d).set('issotrx', dbt === 'MMS' ? 'Y' : 'N');
  }
  // new MInOut(MInvoice invoice, int C_DocTypeShipment_ID, Timestamp movementDate, int M_Warehouse_ID) :689-750
  function MInOutFromInvoice(trx, inv, C_DocTypeShipment_ID, movementDate, M_Warehouse_ID) {
    var r = MInOutNew(trx); clientOrg(r, inv);
    r.set('c_bpartner_id', V(inv, 'c_bpartner_id')).set('c_bpartner_location_id', V(inv, 'c_bpartner_location_id')).set('ad_user_id', V(inv, 'ad_user_id'));
    r.set('m_warehouse_id', M_Warehouse_ID).set('issotrx', V(inv, 'issotrx')).set('movementtype', Y(V(inv, 'issotrx')) ? 'C-' : 'V+');
    var order = nz(V(inv, 'c_order_id')) ? trx.get('c_order', V(inv, 'c_order_id')) : null;
    if (!nz(C_DocTypeShipment_ID) && order != null) { var od = T.dt(trx, order.c_doctype_id); C_DocTypeShipment_ID = od ? od.c_doctypeshipment_id : 0; }
    if (nz(C_DocTypeShipment_ID)) r.set('c_doctype_id', C_DocTypeShipment_ID); else ioSetDocTypeBase(trx, r, Y(r.get('issotrx')) ? 'MMS' : 'MMR');
    if (movementDate != null) r.set('movementdate', movementDate);
    r.set('dateacct', r.get('movementdate'));
    ['c_order_id', 'salesrep_id', 'c_activity_id', 'c_campaign_id', 'c_charge_id', 'chargeamt', 'c_project_id', 'dateordered', 'description', 'poreference', 'ad_orgtrx_id',
     'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id'].forEach(function (c) { r.set(c, V(inv, c)); });
    if (order) ['deliveryrule', 'deliveryviarule', 'm_shipper_id', 'freightcostrule', 'freightamt', 'isdropship', 'dropship_bpartner_id', 'dropship_location_id', 'dropship_user_id']
      .forEach(function (c) { r.set(c, order[c]); });
    return r;
  }

  // ══ MInOutLine ════════════════════════════════════════════════════════════════════════════════════════════════
  // new MInOutLine(MInOut inout) :187-195 ∘ setInitialDefaults :162-170 (M_Warehouse_ID is a field, not a column)
  function MInOutLine(trx, inout) {
    var r = ML.newRecord(trx, 'm_inoutline', {});
    r.set('m_attributesetinstance_id', 0).set('confirmedqty', 0).set('pickedqty', 0).set('scrappedqty', 0).set('targetqty', 0).set('isinvoiced', 'N').set('isdescription', 'N');
    clientOrg(r, inout); r.set('m_inout_id', V(inout, 'm_inout_id')); r.p.m_warehouse_id = V(inout, 'm_warehouse_id'); r.set('c_project_id', V(inout, 'c_project_id'));
    return r;
  }
  // MStorageOnHand.getM_Locator_ID(wh, product, asi, qty) :891-946
  function storageLocator(trx, whId, productId, asi, qty) {
    var p = T.product(trx, productId), as = p && nz(p.m_attributeset_id) ? trx.get('m_attributeset', p.m_attributeset_id) : null;
    var rows = trx.q('SELECT s.m_locator_id AS l, s.qtyonhand AS q, s.m_attributesetinstance_id AS a FROM m_storageonhand s JOIN m_locator l ON s.m_locator_id=l.m_locator_id WHERE l.m_warehouse_id=? AND s.m_product_id=? AND l.isactive=\'Y\' ORDER BY l.priorityno DESC, s.qtyonhand DESC', [whId, productId])
      .filter(function (x) { return !(asi >= 0) || !as || as.isinstanceattribute == null || as.isinstanceattribute === 'N' || String(x.a) === String(asi); });
    var first = 0;
    for (var i = 0; i < rows.length; i++) { if (rows[i].q != null && D(qty).compareTo(D(rows[i].q)) <= 0) return rows[i].l; if (!first) first = rows[i].l; }
    return first;
  }
  // MWarehouse.getDefaultLocator :248-283 (no locator at all → MLocator "Standard" auto-create is named, not faked)
  function defaultLocator(trx, whId) {
    var ls = trx.q("SELECT * FROM m_locator WHERE m_warehouse_id=? AND isactive='Y' ORDER BY x, y, z", [whId]);   // MWarehouse.getLocators :226-240 (ORDER BY X,Y,Z)
    for (var i = 0; i < ls.length; i++) if (Y(ls[i].isdefault) && ls[i].isactive === 'Y') return ls[i].m_locator_id;
    if (ls.length) return ls[0].m_locator_id;
    trx.say('§MODEL-UNPORTED-DEP MWarehouse.getDefaultLocator auto-create "Standard" locator (MWarehouse.java:277) — warehouse ' + whId); return 0;
  }
  // MInOutLine.setM_Locator_ID(BigDecimal Qty) :348-370
  function ioSetLocatorByQty(trx, r, qty) {
    if (nz(r.get('m_locator_id'))) return;
    if (!nz(r.get('m_product_id'))) { r.set('m_locator_id', null); return; }
    var wh = r.p.m_warehouse_id != null ? r.p.m_warehouse_id : (trx.get('m_inout', r.get('m_inout_id')) || {}).m_warehouse_id;
    var loc = storageLocator(trx, wh, r.get('m_product_id'), Number(r.get('m_attributesetinstance_id') || 0), qty);
    if (!loc) loc = defaultLocator(trx, wh);
    r.set('m_locator_id', loc);
  }
  // MInOutLine.setOrderLine(MOrderLine oLine, int M_Locator_ID, BigDecimal Qty) :222-263
  function ioSetOrderLine(trx, r, oLine, M_Locator_ID, qty) {
    r.set('c_orderline_id', V(oLine, 'c_orderline_id')).set('line', V(oLine, 'line')).set('c_uom_id', V(oLine, 'c_uom_id'));
    var product = T.product(trx, V(oLine, 'm_product_id'));
    if (product == null) { r.set('m_product_id', null).set('m_attributesetinstance_id', null).set('m_locator_id', null); }
    else {
      r.set('m_product_id', V(oLine, 'm_product_id')).set('m_attributesetinstance_id', V(oLine, 'm_attributesetinstance_id') || 0);
      if (T.isItem(product)) { if (!nz(M_Locator_ID)) ioSetLocatorByQty(trx, r, qty); else r.set('m_locator_id', M_Locator_ID); }
      else r.set('m_locator_id', null);
    }
    ['c_charge_id', 'description', 'isdescription', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'ad_orgtrx_id', 'user1_id', 'user2_id',
     'c_costcenter_id', 'c_department_id'].forEach(function (c) { r.set(c, V(oLine, c)); });
  }
  // MInOutLine.setInvoiceLine(MInvoiceLine iLine, int M_Locator_ID, BigDecimal Qty) :272-307
  function ioSetInvoiceLine(trx, r, iLine, M_Locator_ID, qty) {
    r.set('c_orderline_id', V(iLine, 'c_orderline_id')).set('line', V(iLine, 'line')).set('c_uom_id', V(iLine, 'c_uom_id'));
    if (!nz(V(iLine, 'm_product_id'))) r.set('m_product_id', null).set('m_locator_id', null).set('m_attributesetinstance_id', null);
    else { r.set('m_product_id', V(iLine, 'm_product_id')).set('m_attributesetinstance_id', V(iLine, 'm_attributesetinstance_id') || 0);
      if (!nz(M_Locator_ID)) ioSetLocatorByQty(trx, r, qty); else r.set('m_locator_id', M_Locator_ID); }
    ['c_charge_id', 'description', 'isdescription', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'ad_orgtrx_id', 'user1_id', 'user2_id',
     'c_costcenter_id', 'c_department_id'].forEach(function (c) { r.set(c, V(iLine, c)); });
  }
  // setQty :377-381 = setQtyEntered (UOM precision :388-396) + setMovementQty (product UOM precision :403-412)
  function ioSetQtyEntered(trx, r, q) { q = D(q); if (nz(r.get('c_uom_id'))) q = q.setScale(uomPrecision(trx, r.get('c_uom_id')), HU); r.set('qtyentered', q); }
  function ioSetMovementQty(trx, r, q) { q = D(q); var pp = productUOMPrecision(trx, r.get('m_product_id')); if (pp != null) q = q.setScale(pp, HU); r.set('movementqty', q); }
  function ioSetQty(trx, r, q) { ioSetQtyEntered(trx, r, q); ioSetMovementQty(trx, r, D(r.get('qtyentered'))); }

  // ══ MInvoice ══════════════════════════════════════════════════════════════════════════════════════════════════
  // setInitialDefaults :438-465
  function MInvoiceNew(trx) {
    var r = ML.newRecord(trx, 'c_invoice', {});
    r.set('docstatus', 'DR').set('docaction', 'CO').set('paymentrule', 'P').set('dateinvoiced', today(trx)).set('dateacct', today(trx)).set('chargeamt', 0).set('totallines', 0).set('grandtotal', 0)
      .set('issotrx', 'Y').set('istaxincluded', 'N').set('isapproved', 'N').set('isdiscountprinted', 'N').set('ispaid', 'N').set('sendemail', 'N').set('isprinted', 'N')
      .set('istransferred', 'N').set('isselfservice', 'N').set('ispayschedulevalid', 'N').set('isindispute', 'N').set('posted', 'N').set('processed', 'N').set('processing', 'N');
    return r;
  }
  // MInvoice.setOrder(MOrder) :685-715
  function invSetOrder(trx, r, order) {
    if (order == null) return;
    r.set('c_order_id', V(order, 'c_order_id'));
    ['issotrx', 'isdiscountprinted', 'isselfservice', 'sendemail', 'm_pricelist_id', 'istaxincluded', 'c_currency_id', 'c_conversiontype_id', 'paymentrule', 'c_paymentterm_id',
     'poreference', 'description', 'dateordered', 'ad_orgtrx_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id']
      .forEach(function (c) { r.set(c, V(order, c)); });
  }
  // MInvoice.setBPartner(MBPartner) :631-679
  function invSetBPartner(trx, r, bp) {
    if (bp == null) return;
    r.set('c_bpartner_id', bp.c_bpartner_id);
    var so = Y(r.get('issotrx')), ii = so ? bp.c_paymentterm_id : bp.po_paymentterm_id; if (nz(ii)) r.set('c_paymentterm_id', ii);
    ii = so ? bp.m_pricelist_id : bp.po_pricelist_id; if (nz(ii)) r.set('m_pricelist_id', ii);
    if (bp.paymentrule != null) r.set('paymentrule', bp.paymentrule);
    var locs = trx.q("SELECT * FROM c_bpartner_location WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bpartner_location_id", [bp.c_bpartner_id]);
    locs.forEach(function (l) { if ((Y(l.isbillto) && so) || (Y(l.ispayfrom) && !so)) r.set('c_bpartner_location_id', l.c_bpartner_location_id); });
    if (!nz(r.get('c_bpartner_location_id')) && locs.length) r.set('c_bpartner_location_id', locs[0].c_bpartner_location_id);
    if (!nz(r.get('c_bpartner_location_id'))) trx.say('§MODEL-CTOR BPartnerNoAddressException bp=' + bp.c_bpartner_id);
    var u = trx.q("SELECT ad_user_id AS u FROM ad_user WHERE c_bpartner_id=? AND isactive='Y' ORDER BY ad_user_id", [bp.c_bpartner_id])[0];
    if (u) r.set('ad_user_id', u.u);
  }
  // MInvoice.setShipment(MInOut) :721-798
  function invSetShipment(trx, r, ship) {
    if (ship == null) return;
    r.set('issotrx', V(ship, 'issotrx'));
    invSetBPartner(trx, r, trx.get('c_bpartner', V(ship, 'c_bpartner_id')));
    ['ad_user_id', 'sendemail', 'poreference', 'description', 'dateordered', 'ad_orgtrx_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id',
     'c_costcenter_id', 'c_department_id'].forEach(function (c) { r.set(c, V(ship, c)); });
    if (nz(V(ship, 'c_order_id'))) {
      r.set('c_order_id', V(ship, 'c_order_id'));
      var o = trx.get('c_order', V(ship, 'c_order_id'));
      ['isdiscountprinted', 'm_pricelist_id', 'istaxincluded', 'c_currency_id', 'c_conversiontype_id', 'paymentrule', 'c_paymentterm_id'].forEach(function (c) { r.set(c, o[c]); });
      var dt = T.dt(trx, o.c_doctype_id); if (dt && nz(dt.c_doctypeinvoice_id)) r.set('c_doctypetarget_id', dt.c_doctypeinvoice_id);
      r.set('c_bpartner_id', o.bill_bpartner_id).set('c_bpartner_location_id', o.bill_location_id).set('ad_user_id', o.bill_user_id).set('salesrep_id', o.salesrep_id);
    }
    if (nz(V(ship, 'm_rma_id'))) {
      r.set('m_rma_id', V(ship, 'm_rma_id'));
      var rma = trx.get('m_rma', V(ship, 'm_rma_id')), rdt = rma ? T.dt(trx, rma.c_doctype_id) : null;
      if (rdt && nz(rdt.c_doctypeinvoice_id)) r.set('c_doctypetarget_id', rdt.c_doctypeinvoice_id);
      if (rma) r.set('issotrx', rma.issotrx);
      var io = rma && nz(rma.inout_id) ? trx.get('m_inout', rma.inout_id) : null, ro = io && nz(io.c_order_id) ? trx.get('c_order', io.c_order_id) : null;   // MRMA.getOriginalOrder
      if (ro) { ['m_pricelist_id', 'istaxincluded', 'c_currency_id', 'c_conversiontype_id', 'paymentrule', 'c_paymentterm_id'].forEach(function (c) { r.set(c, ro[c]); }); r.set('c_bpartner_location_id', ro.bill_location_id); }
    }
  }
  // MInvoice.setC_DocTypeTarget_ID(DocBaseType) :804-822 / () :828-836
  function invSetDocTypeTargetBase(trx, r, dbt) {
    var d = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND ad_org_id IN (0,?) AND docbasetype=? AND isactive='Y' ORDER BY isdefault DESC, ad_org_id DESC", [r.get('ad_client_id'), r.get('ad_org_id'), dbt])[0];
    if (!d) { trx.say('§MODEL-CTOR C_DocType Not found for AD_Client_ID=' + r.get('ad_client_id') + ' - ' + dbt); return; }
    r.set('c_doctypetarget_id', d.d).set('issotrx', (dbt === 'ARI' || dbt === 'ARC') ? 'Y' : 'N');
  }
  function invSetDocTypeTarget(trx, r) { if (nz(r.get('c_doctypetarget_id'))) return; invSetDocTypeTargetBase(trx, r, Y(r.get('issotrx')) ? 'ARI' : 'API'); }
  // new MInvoice(MOrder order, int C_DocTypeTarget_ID, Timestamp invoiceDate) :484-510
  function MInvoiceFromOrder(trx, order, C_DocTypeTarget_ID, invoiceDate) {
    var r = MInvoiceNew(trx); clientOrg(r, order); invSetOrder(trx, r, order);
    if (!(Number(C_DocTypeTarget_ID) > 0)) { var odt = T.dt(trx, V(order, 'c_doctype_id'));
      if (odt) { C_DocTypeTarget_ID = odt.c_doctypeinvoice_id; if (!(Number(C_DocTypeTarget_ID) > 0)) throw new Error('@NotFound@ @C_DocTypeInvoice_ID@ - @C_DocType_ID@:' + odt.name); } }
    r.set('c_doctypetarget_id', C_DocTypeTarget_ID);
    if (invoiceDate != null) r.set('dateinvoiced', invoiceDate);
    r.set('dateacct', r.get('dateinvoiced'));
    r.set('salesrep_id', V(order, 'salesrep_id')).set('c_bpartner_id', V(order, 'bill_bpartner_id')).set('c_bpartner_location_id', V(order, 'bill_location_id')).set('ad_user_id', V(order, 'bill_user_id'));
    return r;
  }
  // new MInvoice(MInOut ship, Timestamp invoiceDate) :517-530
  function MInvoiceFromInOut(trx, ship, invoiceDate) {
    var r = MInvoiceNew(trx); clientOrg(r, ship); invSetShipment(trx, r, ship); invSetDocTypeTarget(trx, r);
    if (invoiceDate != null) r.set('dateinvoiced', invoiceDate);
    r.set('dateacct', r.get('dateinvoiced'));
    if (!nz(r.get('salesrep_id'))) r.set('salesrep_id', V(ship, 'salesrep_id'));
    return r;
  }

  // ══ MInvoiceLine ══════════════════════════════════════════════════════════════════════════════════════════════
  // new MInvoiceLine(MInvoice invoice) :169-177 ∘ setInitialDefaults :150-163 (setInvoice caches header fields — the PO handle's p)
  function MInvoiceLine(trx, invoice) {
    if (!V(invoice, 'c_invoice_id')) throw new Error('Header not saved');
    var r = ML.newRecord(trx, 'c_invoiceline', {});
    r.set('isdescription', 'N').set('isprinted', 'Y').set('linenetamt', 0).set('priceentered', 0).set('priceactual', 0).set('pricelimit', 0).set('pricelist', 0)
      .set('m_attributesetinstance_id', 0).set('taxamt', 0).set('qtyentered', 0).set('qtyinvoiced', 0);
    r.set('ad_client_id', V(invoice, 'ad_client_id')).set('ad_org_id', V(invoice, 'ad_org_id')).set('c_invoice_id', V(invoice, 'c_invoice_id'));
    r.p.invoice = row(invoice);
    return r;
  }
  // MInvoiceLine.setOrderLine(MOrderLine) :286-323
  function ilSetOrderLine(trx, r, oLine) {
    r.set('c_orderline_id', V(oLine, 'c_orderline_id')).set('line', V(oLine, 'line')).set('isdescription', V(oLine, 'isdescription')).set('description', V(oLine, 'description'));
    if (!nz(V(oLine, 'm_product_id'))) r.set('c_charge_id', V(oLine, 'c_charge_id'));
    ['m_product_id', 'm_attributesetinstance_id', 's_resourceassignment_id', 'c_uom_id', 'priceentered', 'priceactual', 'pricelimit', 'pricelist', 'c_tax_id', 'linenetamt',
     'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'ad_orgtrx_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id',
     'rramt', 'rrstartdate'].forEach(function (c) { r.set(c, V(oLine, c)); });
  }
  // MInOutLine.sameOrderLineUOM — same UOM as its order line (no order line → true)
  function sameOrderLineUOM(trx, sLine) { if (!nz(V(sLine, 'c_orderline_id'))) return true; var ol = trx.get('c_orderline', V(sLine, 'c_orderline_id')); return !ol || String(ol.c_uom_id) === String(V(sLine, 'c_uom_id')); }
  // MInvoiceLine.setShipLine(MInOutLine) :330-398
  function ilSetShipLine(trx, r, sLine) {
    r.set('m_inoutline_id', V(sLine, 'm_inoutline_id')).set('c_orderline_id', V(sLine, 'c_orderline_id')).set('m_rmaline_id', V(sLine, 'm_rmaline_id'));
    r.set('line', V(sLine, 'line')).set('isdescription', V(sLine, 'isdescription')).set('description', V(sLine, 'description')).set('m_product_id', V(sLine, 'm_product_id'));
    var prod = T.product(trx, r.get('m_product_id'));
    r.set('c_uom_id', (sameOrderLineUOM(trx, sLine) || prod == null) ? V(sLine, 'c_uom_id') : prod.c_uom_id);
    r.set('m_attributesetinstance_id', V(sLine, 'm_attributesetinstance_id'));
    if (!nz(r.get('m_product_id'))) r.set('c_charge_id', V(sLine, 'c_charge_id'));
    if (nz(V(sLine, 'c_orderline_id'))) {
      var ol = trx.get('c_orderline', V(sLine, 'c_orderline_id'));
      r.set('s_resourceassignment_id', ol.s_resourceassignment_id).set('priceentered', sameOrderLineUOM(trx, sLine) ? ol.priceentered : ol.priceactual)
        .set('priceactual', ol.priceactual).set('pricelimit', ol.pricelimit).set('pricelist', ol.pricelist).set('c_tax_id', ol.c_tax_id).set('linenetamt', ol.linenetamt).set('c_project_id', ol.c_project_id);
    } else if (nz(V(sLine, 'm_rmaline_id'))) {
      var rl = trx.get('m_rmaline', V(sLine, 'm_rmaline_id'));
      trx.say('§MODEL-UNPORTED-DEP MInvoiceLine.setPrice() → MProductPricing (MInvoiceLine.java:377) — RMA line pricing'); r.set('priceactual', rl.amt).set('priceentered', rl.amt);
      r.set('c_tax_id', rl.c_tax_id).set('linenetamt', rl.linenetamt);
    } else trx.say('§MODEL-UNPORTED-DEP MInvoiceLine.setPrice()/setTax() → MProductPricing + Tax.get (MInvoiceLine.java:384-385) — shipment line without order line');
    ['c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'ad_orgtrx_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id']
      .forEach(function (c) { r.set(c, V(sLine, c)); });
  }
  // setQtyEntered (UOM precision :611-619) / setQtyInvoiced (product UOM precision :626-635) / setQty :600-604
  function ilSetQtyEntered(trx, r, q) { q = D(q); if (nz(r.get('c_uom_id'))) q = q.setScale(uomPrecision(trx, r.get('c_uom_id')), HU); r.set('qtyentered', q); }
  function ilSetQtyInvoiced(trx, r, q) { q = D(q); var pp = productUOMPrecision(trx, r.get('m_product_id')); if (pp != null) q = q.setScale(pp, HU); r.set('qtyinvoiced', q); }
  function ilSetQty(trx, r, q) { ilSetQtyEntered(trx, r, q); ilSetQtyInvoiced(trx, r, D(r.get('qtyentered'))); }

  // ══ MAllocationHdr / MAllocationLine ══════════════════════════════════════════════════════════════════════════
  // new MAllocationHdr(ctx, IsManual, DateTrx, C_Currency_ID, description) :213-227 ∘ setInitialDefaults :189-202
  function MAllocationHdr(trx, isManual, dateTrx, C_Currency_ID, description) {
    var r = ML.newRecord(trx, 'c_allocationhdr', {});
    var cma = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype='CMA' AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [trx.env.client])[0];   // MDocType.getDocType("CMA") :56-60
    r.set('datetrx', today(trx)).set('dateacct', today(trx)).set('docaction', 'CO').set('docstatus', 'DR').set('approvalamt', 0).set('isapproved', 'N').set('ismanual', 'N')
      .set('posted', 'N').set('processed', 'N').set('processing', 'N').set('c_doctype_id', cma ? cma.d : 0);
    r.set('ismanual', isManual ? 'Y' : 'N');
    if (dateTrx != null) r.set('datetrx', dateTrx).set('dateacct', dateTrx);
    r.set('c_currency_id', C_Currency_ID);
    if (description != null) r.set('description', description);
    return r;
  }
  // new MAllocationLine(parent) :94-101 / (parent, Amount, DiscountAmt, WriteOffAmt, OverUnderAmt) :111-119 ∘ setInitialDefaults :72-77
  function MAllocationLine(trx, parent, amount, discountAmt, writeOffAmt, overUnderAmt) {
    var r = ML.newRecord(trx, 'c_allocationline', {});
    r.set('amount', 0).set('discountamt', 0).set('writeoffamt', 0).set('overunderamt', 0);
    clientOrg(r, parent); r.set('c_allocationhdr_id', V(parent, 'c_allocationhdr_id'));
    if (arguments.length > 2) { r.set('amount', D(amount)).set('discountamt', discountAmt == null ? Z : D(discountAmt)).set('writeoffamt', writeOffAmt == null ? Z : D(writeOffAmt))
      .set('overunderamt', overUnderAmt == null ? Z : D(overUnderAmt)); }
    return r;
  }
  function alSetDocInfo(r, C_BPartner_ID, C_Order_ID, C_Invoice_ID) { r.set('c_bpartner_id', C_BPartner_ID).set('c_order_id', C_Order_ID).set('c_invoice_id', C_Invoice_ID); }   // :164-169
  function alSetPaymentInfo(r, C_Payment_ID, C_CashLine_ID, C_BankTransfer_ID) {               // :187-195
    if (nz(C_Payment_ID)) r.set('c_payment_id', C_Payment_ID); if (nz(C_CashLine_ID)) r.set('c_cashline_id', C_CashLine_ID); if (nz(C_BankTransfer_ID)) r.set('c_banktransfer_id', C_BankTransfer_ID);
  }

  // ══ MPaySelection / MPaySelectionLine / MPaySelectionCheck ════════════════════════════════════════════════════
  function MPaySelection(trx) {                                                                // setInitialDefaults :68-73
    return ML.newRecord(trx, 'c_payselection', {}).set('totalamt', 0).set('isapproved', 'N').set('processed', 'N').set('processing', 'N');
  }
  // new MPaySelectionLine(ps, Line, PaymentRule) :96-103 ∘ setInitialDefaults :69-77
  function MPaySelectionLine(trx, ps, line, paymentRule) {
    var r = ML.newRecord(trx, 'c_payselectionline', {});
    r.set('issotrx', 'N').set('openamt', 0).set('payamt', 0).set('discountamt', 0).set('writeoffamt', 0).set('differenceamt', 0).set('ismanual', 'N');
    clientOrg(r, ps); r.set('c_payselection_id', V(ps, 'c_payselection_id')).set('line', line).set('paymentrule', paymentRule);
    return r;
  }
  // MPaySelectionLine.setInvoice(C_Invoice_ID, isSOTrx, OpenAmt, PayAmt, DiscountAmt, WriteOffAmt) :117-127
  function pslSetInvoice(r, C_Invoice_ID, isSOTrx, openAmt, payAmt, discountAmt, writeOffAmt) {
    r.set('c_invoice_id', C_Invoice_ID).set('issotrx', isSOTrx ? 'Y' : 'N').set('openamt', D(openAmt)).set('payamt', D(payAmt)).set('discountamt', D(discountAmt)).set('writeoffamt', D(writeOffAmt));
    r.set('differenceamt', D(openAmt).subtract(D(payAmt)).subtract(D(discountAmt)).subtract(D(writeOffAmt)));
  }
  // MPaySelectionLine.beforeSave :141-152 / afterSave :156-165 / afterDelete :167-174 → setHeader :176-186
  function pslSetHeader(trx, psId) {
    var ps = trx.get('c_payselection', psId); if (!ps) return; var s = Z;
    trx.find('c_payselectionline', { c_payselection_id: psId }).forEach(function (l) { if (l.isactive === 'Y') s = s.add(D(l.payamt)); });
    trx.update('c_payselection', ps, { totalamt: N(s) });
  }
  ML.registerModel('c_payselectionline', {
    beforeSave: function (trx, l, isNew) { var ps = trx.get('c_payselection', l.c_payselection_id); if (isNew && ps && Y(ps.processed)) return 'ParentComplete';
      l.differenceamt = N(D(l.openamt).subtract(D(l.payamt)).subtract(D(l.discountamt)).subtract(D(l.writeoffamt))); return null; },
    afterSave: function (trx, l) { pslSetHeader(trx, l.c_payselection_id); return null; },
    afterDelete: function (trx, l) { pslSetHeader(trx, l.c_payselection_id); return null; }
  });
  function pscNew(trx) { return ML.newRecord(trx, 'c_payselectioncheck', {}).set('payamt', 0).set('discountamt', 0).set('writeoffamt', 0).set('isprinted', 'N').set('isreceipt', 'N').set('qty', 0); }   // :542-550
  // new MPaySelectionCheck(MPaySelectionLine line, String PaymentRule) :567-607
  function MPaySelectionCheckFromLine(trx, line, paymentRule) {
    var r = pscNew(trx); clientOrg(r, line); r.set('c_payselection_id', V(line, 'c_payselection_id'));
    var inv = trx.get('c_invoice', V(line, 'c_invoice_id')), bp = inv ? inv.c_bpartner_id : null; r.set('c_bpartner_id', bp);
    if (paymentRule === 'D' || paymentRule === 'T') {                                         // DirectDebit / DirectDeposit → MBPBankAccount.getOfBPartner
      var bas = trx.q("SELECT * FROM c_bp_bankaccount WHERE c_bpartner_id=? AND isactive='Y' ORDER BY c_bp_bankaccount_id", [bp]);
      for (var i = 0; i < bas.length; i++) if (Y(paymentRule === 'D' ? bas[i].isdirectdebit : bas[i].isdirectdeposit)) { r.set('c_bp_bankaccount_id', bas[i].c_bp_bankaccount_id); break; }
    }
    r.set('paymentrule', paymentRule).set('isreceipt', V(line, 'issotrx')).set('payamt', V(line, 'payamt')).set('discountamt', V(line, 'discountamt')).set('writeoffamt', V(line, 'writeoffamt')).set('qty', 1);
    return r;
  }
  // new MPaySelectionCheck(MPaySelection ps, String PaymentRule) :615-621
  function MPaySelectionCheckFromSelection(trx, ps, paymentRule) { var r = pscNew(trx); clientOrg(r, ps); r.set('c_payselection_id', V(ps, 'c_payselection_id')).set('paymentrule', paymentRule); return r; }
  // MPaySelectionCheck.addLine(MPaySelectionLine) :630-648
  function pscAddLine(trx, r, line) {
    var inv = trx.get('c_invoice', V(line, 'c_invoice_id'));
    if (String(r.get('c_bpartner_id')) !== String(inv && inv.c_bpartner_id)) throw new Error('Line for different BPartner');
    var same = (r.get('isreceipt') === 'Y') === Y(V(line, 'issotrx')), op = same ? 'add' : 'subtract';
    r.set('payamt', D(r.get('payamt'))[op](D(V(line, 'payamt')))).set('discountamt', D(r.get('discountamt'))[op](D(V(line, 'discountamt')))).set('writeoffamt', D(r.get('writeoffamt'))[op](D(V(line, 'writeoffamt'))));
    r.set('qty', Number(r.get('qty') || 0) + 1);
  }
  function pscIsDirect(r) { return r.get('paymentrule') === 'T' || r.get('paymentrule') === 'D'; }   // :671-675
  function pscIsValid(r) { return nz(r.get('c_bp_bankaccount_id')) ? true : !pscIsDirect(r); }       // :660-665

  var ctor = { ioSetDocTypeBase: ioSetDocTypeBase, MInOutFromOrder: MInOutFromOrder, MInOutFromInvoice: MInOutFromInvoice, getMovementType: getMovementType, MInOutLine: MInOutLine,
    ioSetOrderLine: ioSetOrderLine, ioSetInvoiceLine: ioSetInvoiceLine, ioSetLocatorByQty: ioSetLocatorByQty, ioSetQty: ioSetQty, ioSetQtyEntered: ioSetQtyEntered, ioSetMovementQty: ioSetMovementQty,
    storageLocator: storageLocator, defaultLocator: defaultLocator,
    MInvoiceFromOrder: MInvoiceFromOrder, MInvoiceFromInOut: MInvoiceFromInOut, invSetOrder: invSetOrder, invSetShipment: invSetShipment, invSetBPartner: invSetBPartner,
    invSetDocTypeTarget: invSetDocTypeTarget, invSetDocTypeTargetBase: invSetDocTypeTargetBase,
    MInvoiceLine: MInvoiceLine, ilSetOrderLine: ilSetOrderLine, ilSetShipLine: ilSetShipLine, ilSetQty: ilSetQty, ilSetQtyEntered: ilSetQtyEntered, ilSetQtyInvoiced: ilSetQtyInvoiced, sameOrderLineUOM: sameOrderLineUOM,
    MAllocationHdr: MAllocationHdr, MAllocationLine: MAllocationLine, alSetDocInfo: alSetDocInfo, alSetPaymentInfo: alSetPaymentInfo,
    MPaySelection: MPaySelection, MPaySelectionLine: MPaySelectionLine, pslSetInvoice: pslSetInvoice, MPaySelectionCheckFromLine: MPaySelectionCheckFromLine,
    MPaySelectionCheckFromSelection: MPaySelectionCheckFromSelection, pscAddLine: pscAddLine, pscIsDirect: pscIsDirect, pscIsValid: pscIsValid };
  if (T) T.ctor = ctor;
  return ctor;
});
