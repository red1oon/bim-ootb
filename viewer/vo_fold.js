/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// vo_fold.js — BIM → Variation Order fold engine (docs/BIMtoProject.md §H1, BIM_TO_PROJECT TASK F)
//
// Folds a model-DELTA (the IFC diff: added / removed / changed) into a signed iDempiere
// C_Order AMENDMENT against the building's existing C_Project:
//   C_Order (find-or-create by Project + delta digest; Ref_Order_ID → the project's PO if any;
//            DocStatus=DR, signed numbered VO doc) → C_OrderLine (one per status×IFC-class,
//            find-or-create M_Product/Category, signed QtyOrdered, loaded PriceActual, LineNetAmt).
//
// COST MODEL — the SAME engine as viewer/variation_order.js (FIDIC Clause 12 + AACE change-order
//   costing), but money via BigDecimal (erp/bigdecimal.js), never raw Number:
//     factor:  ADDED=1.0 (install) · REMOVED=0.3 (demo+disposal, negative qty) · CHANGED=1.3 (rip+reinstall)
//     loaded unit price = rate × factor × (1+overhead+markup) × (1+disruption)
//     LineNetAmt = QtyOrdered(±count) × loaded unit price   → GrandTotal = Σ LineNetAmt (net, can be < 0)
//   So the line keeps iDempiere's invariant qty×price == net while carrying the full VO loading.
//
// EXTRACT/COMPILE ONLY: status+class+count from the diff, rate from the 5D pack, factors from VO_CONFIG.
//   Never invent a class, count or rate.
// IDEMPOTENT: C_Order find-or-create on (C_Project_ID, POReference=delta digest) → a re-fold of the
//   same delta adds 0 rows (W-VO-FOLD +0). A DIFFERENT delta = a new VO doc (next VO seq).
// Dual export: node (require → tests/poc_vo_fold.js) + browser (window.VoFold → the diff panel's VO button).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports)
    ? require('../erp/bigdecimal.js')
    : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;

  // BIM-folded rows live in a high PK band so they never collide with seed / real iDempiere IDs.
  var BIM_BASE = 990000;

  // FIDIC/AACE change-order multipliers — mirror viewer/variation_order.js VO_CONFIG (the ONE cost model).
  var VO_CONFIG = {
    addFactor: 1.0, removeFactor: 0.3, changeFactor: 1.3,
    overheadPct: 0.10, markupPct: 0.15, disruptionPct: 0.05
  };
  function _factor(status, C) {
    if (status === 'REMOVED') return C.removeFactor;
    if (status === 'CHANGED') return C.changeFactor;
    return C.addFactor; // ADDED / default
  }

  function _scalar(db, sql, params) {
    var r = db.exec(sql, params || []);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }
  function _allocator(db) {
    var next = {};
    return function (table, idCol) {
      if (next[table] == null) {
        var mx = Number(_scalar(db, 'SELECT COALESCE(MAX("' + idCol + '"),0) FROM "' + table + '"') || 0);
        next[table] = Math.max(mx, BIM_BASE - 1) + 1;
      }
      return next[table]++;
    };
  }
  function _uu() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'bim-' + Math.abs((Date.now ? Date.now() : 0) ^ (Math.random() * 1e9 | 0)).toString(16);
  }
  // §F1 W-FIN-CURRENCY — resolve a currency by ISO_Code first, then CurSymbol (packs carry 'RM', not 'MYR';
  // MYR.CurSymbol='RM' bridges them). ISO-exact wins. EXTRACT-only — never invent a currency.
  function _resolveCurrency(db, code) {
    if (code == null) return null;
    return _scalar(db, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code=? OR CurSymbol=? " +
      "ORDER BY (ISO_Code=?) DESC, C_Currency_ID LIMIT 1", [code, code, code]);
  }
  // a deterministic, order-independent digest of the delta → the VO's natural key (idempotency).
  function _digest(voRows) {
    var keys = voRows.map(function (r) {
      return r.status + '|' + r.cls + '|' + (r.disc || '') + '|' + (r.storey || '') + '|' + r.count + '|' + r.rate;
    }).sort();
    var s = keys.join(';'), h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h) ^ s.charCodeAt(i); h |= 0; }
    return 'VO-' + (h >>> 0).toString(16) + '-' + voRows.length;
  }

  // ── the fold ───────────────────────────────────────────────────────────────────────────────────
  // voRows: [{status:'ADDED'|'REMOVED'|'CHANGED', cls, disc, storey, count, rate, unit}]  (per status×class)
  // opts: { voConfig, packCurrencyISO, now, clientId=11, orgId=11, user=100 }
  function foldVariationOrder(db, building, voRows, opts) {
    opts = opts || {};
    var C = opts.voConfig || VO_CONFIG;
    var CL = opts.clientId != null ? opts.clientId : 11;
    var OG = opts.orgId != null ? opts.orgId : 11;
    var U = opts.user != null ? opts.user : 100;
    var now = opts.now || (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })();
    var id = _allocator(db);
    var created = { orders: 0, lines: 0, products: 0, categories: 0 };
    var notes = [];
    if (!voRows || !voRows.length) { notes.push('EMPTY_DELTA no rows to fold'); return { orderId: null, created: created, grandTotal: '0', notes: notes }; }

    // currency (§F1): resolve the pack currency by ISO_Code OR CurSymbol (== proj_fold §F1).
    var curCode = opts.packCurrencyISO || 'USD';
    var curId = _resolveCurrency(db, curCode);
    if (curId == null) { curId = 100; notes.push('CUR_FALLBACK pack=' + curCode + '→USD(100) (seed lacks ' + curCode + ')'); }

    // the project this VO amends (find-only — a VO presupposes an existing project; never invent one).
    var projId = _scalar(db, "SELECT C_Project_ID FROM C_Project WHERE Value=?", [building]);
    if (projId == null) notes.push('NO_PROJECT building=' + building + ' (VO not linked to a C_Project — fold base order first)');
    // the project's PO (if folded) → the amendment references it (Ref_Order_ID).
    var refOrderId = _scalar(db, "SELECT C_Order_ID FROM C_Order WHERE Description=?", ['BIM PO: ' + building]);

    // loading multiplier (1+OH+markup)(1+disruption) — BigDecimal.
    var load = BD.of('1').add(BD.of(String(C.overheadPct))).add(BD.of(String(C.markupPct)))
      .multiply(BD.of('1').add(BD.of(String(C.disruptionPct))));

    // ── C_Order amendment: find-or-create by (project, delta digest) → idempotent ──
    var digest = _digest(voRows);
    var orderId = _scalar(db, "SELECT C_Order_ID FROM C_Order WHERE POReference=? AND Description LIKE ?", [digest, 'BIM VO: ' + building + '%']);
    if (orderId != null) {
      notes.push('IDEMPOTENT existing VO order=' + orderId + ' digest=' + digest);
      var gt0 = _scalar(db, "SELECT GrandTotal FROM C_Order WHERE C_Order_ID=?", [orderId]);
      return { orderId: orderId, projectId: projId, refOrderId: refOrderId, created: created, grandTotal: String(gt0), digest: digest, notes: notes, currencyId: curId };
    }
    // next VO sequence number for this building (how many VO docs already exist).
    var voSeq = Number(_scalar(db, "SELECT COUNT(*) FROM C_Order WHERE Description LIKE ?", ['BIM VO: ' + building + '%']) || 0) + 1;
    var docNo = 'VO-' + building + '-' + ('00' + voSeq).slice(-3);
    orderId = id('C_Order', 'C_Order_ID');
    // signed amendment: DR draft, IsSOTrx=N (purchase-side change), references the base PO + the project.
    db.run("INSERT INTO C_Order (C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
      "DocumentNo,Description,POReference,IsSOTrx,DocStatus,DocAction,Processed,IsApproved,GrandTotal,TotalLines," +
      "C_Currency_ID,DateOrdered,C_Project_ID,Ref_Order_ID,C_Order_UU) " +
      "VALUES (?,?,?,'Y',?,?,?,?,?,?,?,'N','DR','CO','N','N',0,0,?,?,?,?,?)",
      [orderId, CL, OG, now, U, now, U, docNo, 'BIM VO: ' + building + ' #' + voSeq, digest, curId, now, projId, refOrderId, _uu()]);
    created.orders = 1;

    // ── lines: one per (status × IFC class), signed; loaded unit price keeps qty×price == net ──
    var grand = BD.ZERO, lineNo = 10;
    voRows.forEach(function (r) {
      var f = _factor(r.status, C);
      // loaded unit price = rate × factor × loading, money scale 2
      var unitPrice = BD.of(String(r.rate)).multiply(BD.of(String(f))).multiply(load).setScale(2, HALF_UP);
      var sign = (r.status === 'REMOVED') ? -1 : 1;
      var qtySigned = sign * r.count;
      var lineNet = unitPrice.multiply(BD.of(String(qtySigned))).setScale(2, HALF_UP);
      grand = grand.add(lineNet);

      // find-or-create M_Product_Category (by discipline) + M_Product (by Value=cls) — == proj_fold.
      var disc = r.disc || '_';
      var catId = _scalar(db, "SELECT M_Product_Category_ID FROM M_Product_Category WHERE Value=?", ['BIM-' + disc]);
      if (catId == null) {
        catId = id('M_Product_Category', 'M_Product_Category_ID');
        db.run("INSERT INTO M_Product_Category (M_Product_Category_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "Value,Name,IsDefault,M_Product_Category_UU) VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?)",
          [catId, CL, OG, now, U, now, U, 'BIM-' + disc, 'BIM ' + disc, _uu()]);
        created.categories++;
      }
      var unit = r.unit || 'EA';
      var uomId = _scalar(db, "SELECT C_UOM_ID FROM C_UOM WHERE X12DE355=?", [unit]) || 100;
      if (uomId === 100 && unit !== 'EA') notes.push('UOM_FALLBACK ' + r.cls + ' ' + unit + '→EA (seed lacks ' + unit + ')');
      var prodId = _scalar(db, "SELECT M_Product_ID FROM M_Product WHERE Value=?", [r.cls]);
      if (prodId == null) {
        prodId = id('M_Product', 'M_Product_ID');
        db.run("INSERT INTO M_Product (M_Product_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "Value,Name,Description,M_Product_Category_ID,C_UOM_ID,ProductType,IsSummary,IsStocked,IsSold,IsPurchased,M_Product_UU) " +
          "VALUES (?,?,?,'Y',?,?,?,?,?,?,?,?,?,'I','N','Y','Y','Y',?)",
          [prodId, CL, OG, now, U, now, U, r.cls, r.cls + ' (BIM)', 'BIM type · billed per ' + unit, catId, uomId, _uu()]);
        created.products++;
      }

      var lnId = id('C_OrderLine', 'C_OrderLine_ID');
      db.run("INSERT INTO C_OrderLine (C_OrderLine_ID,C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
        "Line,Description,M_Product_ID,C_UOM_ID,QtyOrdered,QtyEntered,PriceActual,PriceEntered,PriceList,LineNetAmt," +
        "C_Currency_ID,C_Project_ID,Processed,C_OrderLine_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'N',?)",
        [lnId, orderId, CL, OG, now, U, now, U, lineNo,
         r.status + ' · ' + r.cls + ' · ' + r.count + ' ea · ×' + f + ' (' + r.status.toLowerCase() + ')',
         prodId, uomId, qtySigned, qtySigned, unitPrice.toString(), unitPrice.toString(), unitPrice.toString(),
         lineNet.toString(), curId, projId, _uu()]);
      created.lines++;
      lineNo += 10;
    });

    // roll up the amendment total (== Σ LineNetAmt; net, may be negative if removals dominate).
    db.run("UPDATE C_Order SET GrandTotal=?,TotalLines=? WHERE C_Order_ID=?", [grand.toString(), grand.toString(), orderId]);

    return {
      orderId: orderId, projectId: projId, refOrderId: refOrderId, docNo: docNo, voSeq: voSeq,
      created: created, grandTotal: grand.toString(), digest: digest, notes: notes, currencyId: curId
    };
  }

  var API = { foldVariationOrder: foldVariationOrder, VO_CONFIG: VO_CONFIG, BIM_BASE: BIM_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.VoFold = API;
})(typeof self !== 'undefined' ? self : this);
