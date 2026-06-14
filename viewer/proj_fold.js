/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// proj_fold.js — BIM → Project Order fold engine (docs/BIMtoProject.md §C, prompts/BIM_TO_PROJECT.md TASK C)
// Folds a priced selection (the apply5DRates rows) into an iDempiere C_Project tree:
//   C_Project (find-or-create by Value=building) → C_ProjectPhase (per 4D phase, seqno+dates) →
//   C_ProjectTask (per resource) → C_ProjectLine (per IFC type, find-or-create M_Product/Category).
// EXTRACT/COMPILE ONLY: phase/seqno/resource from sequence_rules.json, price from the rate pack, qty
//   from QTO. Money via BigDecimal (erp/bigdecimal.js) — never raw Number arithmetic on amounts.
// IDEMPOTENT: every row is find-or-create on a natural key → a second fold adds 0 rows (W-PROJ-PUSH +0).
// Dual export: node (require → witness tests/poc_proj_push.js) + browser (window.ProjFold → the > to ERP button).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports)
    ? require('../erp/bigdecimal.js')
    : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;

  // BIM-folded rows live in a high PK band so they never collide with seed / real iDempiere IDs.
  var BIM_BASE = 990000;

  function _scalar(db, sql, params) {
    var r = db.exec(sql, params || []);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }
  // per-table monotonic id allocator, seeded above max(existing, BIM_BASE-1)
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

  // ── the fold ──────────────────────────────────────────────────────────────────────────────────
  // priced: [{disc,cls,storey,count,unit,qty,rate,cost}]  (apply5DRates output, already scoped)
  // opts: { seqRules, laborRates, packCurrencyISO, now, clientId=11, orgId=11, user=100, bpartnerId=null }
  function foldProjectOrder(db, building, priced, opts) {
    opts = opts || {};
    var SR = opts.seqRules || {}, LR = opts.laborRates || {};
    var CL = opts.clientId != null ? opts.clientId : 11;
    var OG = opts.orgId != null ? opts.orgId : 11;
    var U = opts.user != null ? opts.user : 100;
    var now = opts.now || (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })();
    var id = _allocator(db);
    var created = { projects: 0, phases: 0, tasks: 0, lines: 0, products: 0, categories: 0, order: 0 };
    var notes = [];

    // currency: match the pack (§F). Look up; fall back to seed default with a logged gap.
    var curISO = opts.packCurrencyISO || 'USD';
    var curId = _scalar(db, "SELECT C_Currency_ID FROM C_Currency WHERE ISO_Code=?", [curISO]);
    if (curId == null) { curId = 100; notes.push('CUR_FALLBACK pack=' + curISO + '→USD(100) (seed lacks ' + curISO + ')'); }

    // ── C_Project (find-or-create by Value) ──
    var projId = _scalar(db, "SELECT C_Project_ID FROM C_Project WHERE Value=?", [building]);
    if (projId == null) {
      projId = id('C_Project', 'C_Project_ID');
      db.run("INSERT INTO C_Project (C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
        "Value,Name,IsSummary,C_Currency_ID,PlannedAmt,PlannedQty,IsCommitment,ProjInvoiceRule,ProjectLineLevel,Processed,C_Project_UU) " +
        "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?,0,0,'N','-','P','N',?)",
        [projId, CL, OG, now, U, now, U, building, 'BIM: ' + building, curId, _uu()]);
      created.projects = 1;
    }

    // canonical phase→seqno from the FULL sequence_rules (min sequence over ALL classes of a phase) —
    // stable across buildings, NOT dependent on which classes a given selection happens to contain.
    var phaseSeq = {};
    Object.keys(SR).forEach(function (c) {
      var p = SR[c].phase, s = SR[c].sequence;
      if (p == null || s == null) return;
      if (phaseSeq[p] == null || s < phaseSeq[p]) phaseSeq[p] = s;
    });

    // group priced rows by 4D phase (sequence_rules), seqno = the canonical phase sequence
    var phases = {};   // phaseName → { seqno, resources:{res:[rows]}, rows:[] }
    priced.forEach(function (r) {
      var sr = SR[r.cls] || {};
      var ph = sr.phase || 'Unsequenced';
      var res = sr.resource || 'GENERAL';
      var p = phases[ph] || (phases[ph] = { seqno: (phaseSeq[ph] != null ? phaseSeq[ph] : (sr.sequence != null ? sr.sequence : 99)), resources: {}, rows: [] });
      (p.resources[res] || (p.resources[res] = [])).push(r);
      p.rows.push(r);
    });
    var phaseNames = Object.keys(phases).sort(function (a, b) { return phases[a].seqno - phases[b].seqno; });

    // forward-pass schedule: duration(days) per phase = Σ ceil(count / productivity) over its classes
    var startDate = opts.now ? opts.now.slice(0, 10) : '2026-01-01';
    var cursor = new Date(startDate + 'T00:00:00');
    function fmt(d) { return d.toISOString().slice(0, 10) + ' 00:00:00'; }

    var projAmt = BD.ZERO, projQty = 0;
    var seqLog = [];

    phaseNames.forEach(function (ph) {
      var P = phases[ph];
      // duration
      var days = 0;
      P.rows.forEach(function (r) {
        var lr = LR[(SR[r.cls] || {}).resource];
        var prod = lr && lr.productivity && lr.productivity[r.cls];
        days += prod ? Math.ceil(r.count / prod) : Math.max(1, Math.ceil(r.count / 20));
      });
      days = Math.max(1, days);
      var sDate = fmt(cursor);
      cursor.setDate(cursor.getDate() + days);
      var eDate = fmt(cursor);

      // find-or-create C_ProjectPhase (Project + Name)
      var phId = _scalar(db, "SELECT C_ProjectPhase_ID FROM C_ProjectPhase WHERE C_Project_ID=? AND Name=?", [projId, ph]);
      if (phId == null) {
        phId = id('C_ProjectPhase', 'C_ProjectPhase_ID');
        db.run("INSERT INTO C_ProjectPhase (C_ProjectPhase_ID,C_Project_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "Name,SeqNo,StartDate,EndDate,IsComplete,PlannedAmt,Qty,C_ProjectPhase_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,'N',0,0,?)",
          [phId, projId, CL, OG, now, U, now, U, ph, P.seqno, sDate, eDate, _uu()]);
        created.phases++;
      } else {
        db.run("UPDATE C_ProjectPhase SET SeqNo=?,StartDate=?,EndDate=? WHERE C_ProjectPhase_ID=?", [P.seqno, sDate, eDate, phId]);
      }
      seqLog.push({ phase: ph, seqno: P.seqno, start: sDate.slice(0, 10), end: eDate.slice(0, 10) });

      // tasks per resource
      var taskByRes = {};
      Object.keys(P.resources).forEach(function (res) {
        var tId = _scalar(db, "SELECT C_ProjectTask_ID FROM C_ProjectTask WHERE C_ProjectPhase_ID=? AND Name=?", [phId, res]);
        if (tId == null) {
          tId = id('C_ProjectTask', 'C_ProjectTask_ID');
          db.run("INSERT INTO C_ProjectTask (C_ProjectTask_ID,C_ProjectPhase_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Name,SeqNo,PlannedAmt,Qty,C_ProjectTask_UU) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,0,0,?)",
            [tId, phId, CL, OG, now, U, now, U, res, P.seqno, _uu()]);
          created.tasks++;
        }
        taskByRes[res] = tId;
      });

      // lines per IFC class (the BoQ line); roll the cls's per-group rounded costs (BigDecimal)
      var phAmt = BD.ZERO;
      var byCls = {};
      P.rows.forEach(function (r) { (byCls[r.cls] || (byCls[r.cls] = [])).push(r); });
      var lineNo = 10;
      Object.keys(byCls).forEach(function (cls) {
        var rows = byCls[cls];
        var unit = rows[0].unit, rate = rows[0].rate, disc = rows[0].disc, res = (SR[cls] || {}).resource || 'GENERAL';
        var qty = 0, amt = BD.ZERO, cnt = 0;
        rows.forEach(function (r) {
          qty += r.qty; cnt += r.count;
          // money via BigDecimal: round(rate × qty) per group, HALF_UP to 0dp (== apply5DRates basis)
          amt = amt.add(BD.of(String(rate)).multiply(BD.of(String(r.qty))).setScale(0, HALF_UP));
        });
        phAmt = phAmt.add(amt);

        // find-or-create M_Product_Category (by discipline) + M_Product (by Value=cls)
        var catId = _scalar(db, "SELECT M_Product_Category_ID FROM M_Product_Category WHERE Value=?", ['BIM-' + disc]);
        if (catId == null) {
          catId = id('M_Product_Category', 'M_Product_Category_ID');
          db.run("INSERT INTO M_Product_Category (M_Product_Category_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Value,Name,IsDefault,M_Product_Category_UU) VALUES (?,?,?,'Y',?,?,?,?,?,?,'N',?)",
            [catId, CL, OG, now, U, now, U, 'BIM-' + disc, 'BIM ' + disc, _uu()]);
          created.categories++;
        }
        var uomId = _scalar(db, "SELECT C_UOM_ID FROM C_UOM WHERE X12DE355=?", [unit]) || 100; // seed lacks M/M2/M3 → EA
        if (uomId === 100 && unit !== 'EA') notes.push('UOM_FALLBACK ' + cls + ' ' + unit + '→EA (seed lacks ' + unit + ')');
        var prodId = _scalar(db, "SELECT M_Product_ID FROM M_Product WHERE Value=?", [cls]);
        if (prodId == null) {
          prodId = id('M_Product', 'M_Product_ID');
          db.run("INSERT INTO M_Product (M_Product_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
            "Value,Name,Description,M_Product_Category_ID,C_UOM_ID,ProductType,IsSummary,IsStocked,IsSold,IsPurchased,M_Product_UU) " +
            "VALUES (?,?,?,'Y',?,?,?,?,?,?,?,?,?,'I','N','Y','Y','Y',?)",
            [prodId, CL, OG, now, U, now, U, cls, cls + ' (BIM)', 'BIM type · billed per ' + unit, catId, uomId, _uu()]);
          created.products++;
        }

        // find-or-create C_ProjectLine (Project + Product)
        var lnId = _scalar(db, "SELECT c_projectline_id FROM C_ProjectLine WHERE c_project_id=? AND m_product_id=?", [projId, prodId]);
        var amtStr = amt.toString(), qtyStr = String(Math.round(qty * 1000) / 1000), rateStr = String(rate);
        if (lnId == null) {
          lnId = id('C_ProjectLine', 'c_projectline_id');
          db.run("INSERT INTO C_ProjectLine (c_projectline_id,c_project_id,ad_client_id,ad_org_id,isactive,created,createdby,updated,updatedby," +
            "line,description,plannedqty,plannedprice,plannedamt,m_product_id,m_product_category_id,c_projectphase_id,c_projecttask_id," +
            "isprinted,processed,dopricing,c_projectline_uu) VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,?,?,?,?,?,?,'Y','N','Y',?)",
            [lnId, projId, CL, OG, now, U, now, U, lineNo, cls + ' · ' + cnt + ' ea · per ' + unit,
             qtyStr, rateStr, amtStr, prodId, catId, phId, taskByRes[res], _uu()]);
          created.lines++;
        } else {
          db.run("UPDATE C_ProjectLine SET plannedqty=?,plannedprice=?,plannedamt=?,c_projectphase_id=?,c_projecttask_id=? WHERE c_projectline_id=?",
            [qtyStr, rateStr, amtStr, phId, taskByRes[res], lnId]);
        }
        lineNo += 10;
        projQty += cnt;
      });

      // roll up phase amount
      db.run("UPDATE C_ProjectPhase SET PlannedAmt=? WHERE C_ProjectPhase_ID=?", [phAmt.toString(), phId]);
      projAmt = projAmt.add(phAmt);
    });

    // roll up project
    db.run("UPDATE C_Project SET PlannedAmt=?,PlannedQty=? WHERE C_Project_ID=?", [projAmt.toString(), projQty, projId]);

    // PO gate (§C step 5): only with a supplier — else plan-only (non-invent)
    var orderId = null;
    if (opts.bpartnerId) {
      orderId = _scalar(db, "SELECT C_Order_ID FROM C_Order WHERE Description=?", ['BIM PO: ' + building]);
      if (orderId == null) {
        orderId = id('C_Order', 'C_Order_ID');
        db.run("INSERT INTO C_Order (C_Order_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
          "C_BPartner_ID,Description,IsSOTrx,DocStatus,GrandTotal,C_Currency_ID,DateOrdered,C_Order_UU) " +
          "VALUES (?,?,?,'Y',?,?,?,?,?,?,'N','DR',?,?,?,?)",
          [orderId, CL, OG, now, U, now, U, opts.bpartnerId, 'BIM PO: ' + building, projAmt.toString(), curId, now, _uu()]);
        created.order = 1;
      }
    } else { notes.push('PLAN_ONLY no supplier → no C_Order PO'); }

    return {
      projectId: projId, created: created, plannedAmt: projAmt.toString(), plannedQty: projQty,
      orderId: orderId, seqLog: seqLog, notes: notes, currencyId: curId
    };
  }

  var API = { foldProjectOrder: foldProjectOrder, BIM_BASE: BIM_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ProjFold = API;
})(typeof self !== 'undefined' ? self : this);
