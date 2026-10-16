// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/PackageCreate.js — org.compiere.process.PackageCreate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/PackageCreate.java) with MPackage.create/createPackage/ctor/beforeSave/afterSave
// (org.adempiere.base/src/org/compiere/model/MPackage.java), MPackageLine, MPackageMPS ported inline (no other lane owns them).
// Tables absent from the bundle (M_PackageMPS, M_ShipperLabels/Packaging/PickupTypes, X_PackageLineWeight, C_BP_ShippingAcct) log
// §PROC-UNPORTED-DEP: a SELECT over one reads as the empty result Java gets from an empty table; an INSERT into one throws.
// §CP-PROC-CORE family B — Witness: W-CP-PROC-ORACLE.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.PackageCreate', function (SvrProcess, X) {
    function G() { return P.PSUP.docgen; }
    var CTX = null;   // the running process's Ctx (single-threaded: set at doIt)
    function PackageCreate() { SvrProcess.call(this); this.p_M_Shipper_ID = 0; this.p_M_InOut_ID = 0; this.p_no_of_packages = 0; }
    PackageCreate.prototype = Object.create(SvrProcess.prototype);
    PackageCreate.prototype.prepare = function () {                                   // :50-66
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'M_Shipper_ID') this.p_M_Shipper_ID = para[i].getParameterAsInt();
        else if (name === 'M_InOut_ID') this.p_M_InOut_ID = para[i].getParameterAsInt();
        else if (name === 'NoOfPackages') this.p_no_of_packages = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA PackageCreate ' + name);
      }
    };
    // a SELECT over a table the bundle lacks = empty result (named); returns null when absent
    function sel(trx, what, sql, args) {
      try { return trx.q(sql, args || []); }
      catch (e) { trx.say('§PROC-UNPORTED-DEP ' + what + ' — table absent from the bundle (PackageCreate/MPackage), read as empty'); return null; }
    }
    // MPackage.beforeSave :218-231 — Weight from X_PackageLineWeight when null/0
    function beforeSave(trx, pkg, g) {
      var w = pkg.get('weight');
      if (w == null || g.T().D(w).signum() === 0) {
        var r = sel(trx, 'X_PackageLineWeight', 'SELECT SUM(LineWeight) AS s FROM X_PackageLineWeight plw WHERE plw.M_Package_ID=?', [pkg.id() || 0]);
        pkg.set('weight', r && r[0] && r[0].s != null ? r[0].s : 0);
      }
    }
    function pkgSave(trx, pkg, g) { beforeSave(trx, pkg, g); g.saveEx(pkg); return pkg; }   // afterSave (MPS per BoxCount) :233-253 — see boxCountMPS
    // MPackage.afterSave :233-253
    function afterSaveMPS(trx, pkg, g) {
      var boxCount = Number(pkg.get('boxcount') || 0);
      if (boxCount <= 0) return;
      var c = sel(trx, 'M_PackageMPS', 'SELECT COUNT(*) AS c FROM M_PackageMPS WHERE M_Package_ID = ?', [pkg.id()]);
      var n = c ? Number(c[0].c) : 0;
      if (boxCount - n > 0) {
        if (!c) throw new Error('PROC-UNPORTED-DEP M_PackageMPS (MPackage.afterSave needs to insert it)');
        for (var i = 0; i < boxCount - n; i++) { var mps = g.ML().newRecord(trx, 'm_packagemps', {}); mps.set('m_package_id', pkg.id()); mpsDefaults(trx, mps, pkg); g.saveEx(mps); }
      }
    }
    function clientInfo(trx, client) { return trx.q('SELECT * FROM AD_ClientInfo WHERE AD_Client_ID=?', [client])[0] || {}; }
    function mpsDefaults(trx, mps, pkg) {                                             // MPackageMPS.setInitialDefaults :68-72
      var ci = clientInfo(trx, pkg.get('ad_client_id'));
      mps.set('c_uom_weight_id', ci.c_uom_weight_id).set('c_uom_length_id', ci.c_uom_length_id);
      mps.set('ad_client_id', pkg.get('ad_client_id')).set('ad_org_id', pkg.get('ad_org_id'));
    }
    // new MPackage(shipment, shipper) :150-215 (ctor + setInitialDefaults :112-118)
    function newPackage(trx, shipment, shipper, g) {
      var A = X.A, T = g.T(), pkg = g.ML().newRecord(trx, 'm_package', {});
      var ci = clientInfo(trx, shipment.ad_client_id);
      pkg.set('shipdate', trx.env.date).set('c_uom_weight_id', ci.c_uom_weight_id).set('c_uom_length_id', ci.c_uom_length_id);   // setInitialDefaults (clock = recorded clock)
      pkg.set('ad_client_id', shipment.ad_client_id).set('ad_org_id', shipment.ad_org_id);                                       // setClientOrg(shipment)
      pkg.set('m_inout_id', shipment.m_inout_id).set('m_shipper_id', shipper.m_shipper_id);
      var order = null;
      if (T.nz(shipment.c_order_id)) order = trx.get('c_order', shipment.c_order_id);
      else {
        var mos = sel(trx, 'MMatchPO.getInOut', 'SELECT * FROM M_MatchPO WHERE M_InOutLine_ID IN (SELECT M_InOutLine_ID FROM M_InOutLine WHERE M_InOut_ID=?)', [shipment.m_inout_id]) || [];
        for (var i = 0; i < mos.length; i++) {
          var ol = trx.get('c_orderline', mos[i].c_orderline_id);
          if (ol && T.nz(ol.c_order_id)) { order = trx.get('c_order', ol.c_order_id); break; }
        }
      }
      var msg = 'Notification for shipment ' + shipment.documentno;
      if (order != null) msg += ' / order ' + order.documentno;
      pkg.set('notificationmessage', msg);
      pkg.set('c_currency_id', A.Env.getContextAsInt(CTX, '$C_Currency_ID'));   // shipment.getC_Currency_ID() = Env.C_CURRENCY_ID (MInOut.java:3039)
      var where = " AND IsDefault='Y' AND IsActive='Y'";
      var ids = sel(trx, 'MShipperLabels', 'SELECT M_ShipperLabels_ID AS i FROM M_ShipperLabels WHERE M_Shipper_ID = ' + Number(shipper.m_shipper_id) + where);
      if (ids && ids.length) pkg.set('m_shipperlabels_id', ids[0].i);
      ids = sel(trx, 'MShipperPackaging', 'SELECT M_ShipperPackaging_ID AS i FROM M_ShipperPackaging WHERE M_Shipper_ID = ' + Number(shipper.m_shipper_id) + where);
      if (ids && ids.length) pkg.set('m_shipperpackaging_id', ids[0].i);
      ids = sel(trx, 'MShipperPickupTypes', 'SELECT M_ShipperPickupTypes_ID AS i FROM M_ShipperPickupTypes WHERE M_Shipper_ID = ' + Number(shipper.m_shipper_id) + where);
      if (ids && ids.length) pkg.set('m_shipperpickuptypes_id', ids[0].i);
      var loc = findRecipientAccountLocationId(trx, shipper, shipment, T);
      if (loc > 0) pkg.set('c_bpartner_location_id', loc);
      var cfg = trx.get('m_shippercfg', shipper.m_shippercfg_id) || {};                // MShipper.isResidential/isSaturdayDelivery/getTrackingURL → MShipperCfg
      pkg.set('isresidential', cfg.isresidential || 'N').set('issaturdaydelivery', cfg.issaturdaydelivery || 'N').set('trackinginfo', cfg.trackingurl);
      if (shipment.freightcharges != null && shipment.freightcharges !== '') {          // :196-212
        var fc = shipment.freightcharges, shipperAccount = null, duties = null;
        if (fc === 'P' || fc === 'B') {   // FREIGHTCHARGES_Prepaid / PrepaidAndBill — ShippingUtil.getSenderShipperAccount needs C_BP_ShippingAcct
          trx.say('§PROC-UNPORTED-DEP ShippingUtil.getSenderShipperAccount — C_BP_ShippingAcct absent from the bundle');
        } else shipperAccount = shipment.shipperaccount;
        if (shipperAccount != null) pkg.set('shipperaccount', shipperAccount);
        if (duties != null) pkg.set('dutiesshipperaccount', duties);
      }
      return pkg;
    }
    // ShippingUtil.findRecipientAccountLocationId(shipper, bpartner, org, inout, 0) (ShippingUtil.java:76-130)
    function findRecipientAccountLocationId(trx, shipper, shipment, T) {
      var id = -1, r;
      r = sel(trx, 'C_BP_ShippingAcct', 'SELECT C_BPartner_Location_ID AS i FROM C_BP_ShippingAcct WHERE C_BPartner_ID = ? AND AD_Org_ID = ' + Number(shipper.ad_org_id) +
        ' AND M_ShippingProcessor_ID IN (SELECT DISTINCT M_ShippingProcessor_ID FROM M_Shipper WHERE M_Shipper_ID = ' + Number(shipper.m_shipper_id) + ') AND C_BPartner_Location_ID Is Not Null', [shipment.c_bpartner_id]);
      if (r && r.length) id = r[0].i;
      if (!(id > 0)) {
        r = sel(trx, 'C_BP_ShippingAcct', 'SELECT bps.C_BPartner_Location_ID AS i FROM C_BP_ShippingAcct bps, C_BPartner_Location bpl, C_Location l WHERE bps.C_BPartner_ID = ? AND bps.M_ShippingProcessor_ID IN (SELECT DISTINCT M_ShippingProcessor_ID FROM M_Shipper WHERE M_Shipper_ID = ' + Number(shipper.m_shipper_id) +
          ') AND bps.C_BPartner_Location_ID = bpl.C_BPartner_Location_ID AND bpl.C_Location_ID = l.C_Location_ID AND l.Postal IS NOT NULL', [shipment.c_bpartner_id]);
        if (r && r.length) id = r[0].i;
      }
      if (!(id > 0) && shipment.m_inout_id > 0) {
        r = trx.q('SELECT bpl.C_BPartner_Location_ID AS i FROM M_InOut io, C_Order o, C_BPartner_Location bpl, C_Location l WHERE io.M_InOut_ID = ? AND io.C_Order_ID = o.C_Order_ID AND o.Bill_Location_ID = bpl.C_BPartner_Location_ID AND bpl.C_Location_ID = l.C_Location_ID AND l.Postal IS NOT NULL', [shipment.m_inout_id]);
        if (r.length) id = r[0].i;
        if (!(id > 0)) {
          r = sel(trx, 'M_InOut.C_Invoice_ID', 'SELECT bpl.C_BPartner_Location_ID AS i FROM M_InOut io, C_Invoice i, C_BPartner_Location bpl, C_Location l WHERE io.M_InOut_ID = ? AND io.C_Invoice_ID = i.C_Invoice_ID AND i.C_BPartner_Location_ID = bpl.C_BPartner_Location_ID AND bpl.C_Location_ID = l.C_Location_ID AND l.Postal IS NOT NULL', [shipment.m_inout_id]);
          if (r && r.length) id = r[0].i;
        }
      }
      return id == null ? -1 : Number(id);
    }
    // MPackage.createPackage :104-114
    function createPackage(trx, shipment, shipper, shipDate, g) {
      var pkg = newPackage(trx, shipment, shipper, g);
      if (shipDate != null) pkg.set('shipdate', shipDate);
      pkg.set('boxcount', 0);
      pkgSave(trx, pkg, g); afterSaveMPS(trx, pkg, g);
      return pkg;
    }
    // MPackage.create :62-101
    function create(trx, shipment, shipper, shipDate, g) {
      var T = g.T(), retValue = createPackage(trx, shipment, shipper, shipDate, g);
      var chk = sel(trx, 'M_PackageMPS', 'SELECT 1 AS x FROM M_PackageMPS WHERE 1=0');
      if (chk == null) throw new Error('PROC-UNPORTED-DEP M_PackageMPS (MPackage.create inserts MPackageMPS SeqNo=10)');
      var mps = g.ML().newRecord(trx, 'm_packagemps', {});                             // :67-70
      mpsDefaults(trx, mps, retValue); mps.set('seqno', 10).set('m_package_id', retValue.id()); g.saveEx(mps);
      var ci = clientInfo(trx, shipment.ad_client_id);
      var lines = g.lines(trx, 'm_inoutline', 'm_inout_id', shipment.m_inout_id);      // :74
      for (var i = 0; i < lines.length; i++) {
        var sLine = lines[i];
        if (Number(sLine.m_product_id) > 0 && Number(sLine.m_product_id) !== Number(ci.m_productfreight_id)) {   // :79
          var product = trx.get('m_product', sLine.m_product_id);
          if (T.Y(product.isbom) && T.Y(product.isverified) && T.Y(product.ispicklistprintdetails)) {   // :82
            throw new Error('PROC-UNPORTED-DEP MPPProductBOM.getDefault/getLines (MPackage.create :84-96) — BOM pick-list expansion');
          }
          var pLine = g.ML().newRecord(trx, 'm_packageline', {});                      // new MPackageLine(retValue) MPackageLine.java:69-75
          pLine.set('qty', 0).set('ad_client_id', retValue.get('ad_client_id')).set('ad_org_id', retValue.get('ad_org_id')).set('m_package_id', retValue.id());
          pLine.set('m_inoutline_id', sLine.m_inoutline_id).set('qty', sLine.movementqty);   // setInOutLine
          pLine.set('m_product_id', sLine.m_product_id).set('m_packagemps_id', mps.id());
          g.saveEx(pLine);
        }
      }
      retValue.set('boxcount', 1);                                                     // :101
      pkgSave(trx, retValue, g); afterSaveMPS(trx, retValue, g);
      return retValue;
    }
    PackageCreate.prototype.doIt = function () {                                      // :74-113
      var g = G(), trx = this.get_TrxName(); CTX = this.getCtx();
      if (this.p_M_InOut_ID === 0) throw new Error('No Shipment');                     // :79
      if (this.p_M_Shipper_ID === 0) throw new Error('No Shipper');                    // :81
      var shipment = trx.get('m_inout', this.p_M_InOut_ID);                            // :83
      if (!shipment || Number(shipment.m_inout_id) !== this.p_M_InOut_ID) throw new Error('Cannot find Shipment ID=' + this.p_M_InOut_ID);
      var shipper = trx.get('m_shipper', this.p_M_Shipper_ID);                         // :86
      if (!shipper || Number(shipper.m_shipper_id) !== this.p_M_Shipper_ID) throw new Error('Cannot find Shipper ID=' + this.p_M_InOut_ID);
      if (this.p_no_of_packages === 0) this.p_no_of_packages = Number(shipment.nopackages || 0);   // :91
      if (this.p_no_of_packages <= 0) throw new Error('No of Packages should not be 0');
      var info = '';
      if (this.p_no_of_packages === 1) info += trx.get('m_package', create(trx, shipment, shipper, null, g).id()).documentno;   // :96-100
      else for (var i = 0; i < this.p_no_of_packages; i++) {                           // :102-110
        var pack = createPackage(trx, shipment, shipper, null, g);
        if (i !== 0) info += ', ';
        info += trx.get('m_package', pack.id()).documentno;
      }
      return info;                                                                      // :112
    };
    return PackageCreate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
