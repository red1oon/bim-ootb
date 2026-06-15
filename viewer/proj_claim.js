/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// proj_claim.js — BIM → Project FINANCE lane §F6: progress claim → C_Invoice + GL posting PREVIEW.
//
//   progressClaim(db, projectId, opts) — for the phases marked IsComplete='Y' that have NOT yet been
//     claimed, raise a progress C_Invoice (AP, DocBaseType API) for the earned portion (the EV delta);
//     one C_InvoiceLine per newly-complete phase (LineNetAmt == phase.PlannedAmt, linked C_ProjectPhase).
//     Moves C_Project.InvoicedAmt += claim (so EVM AC stops being 0 and CPI becomes computable).
//     IDEMPOTENT at phase granularity — a phase already on a BIM-claim line is never re-billed.
//   postingPreview(db, invoiceId) — the GL journal this claim WOULD post: Dr Cost/WIP (the product
//     category's p_wip_acct, else the schema default), Cr AP (the supplier BP-group v_liability, else the
//     schema default). Returns the lines + balance check. It does NOT write Fact_Acct — a folded BIM claim
//     is PREVIEWED honestly (posting is an explicit accountant DocAction in the ERP app), never fabricated.
// EXTRACT-only — amounts from phase PlannedAmt, accounts from the real chart (F3). Money via BigDecimal;
//   a preview that does not balance (Σ Dr ≠ Σ Cr) is returned with balances=false (the witness then FAILS).
(function (global) {
  'use strict';
  var BD = (typeof module !== 'undefined' && module.exports) ? require('../erp/bigdecimal.js') : (global.BigDecimal);
  var HALF_UP = BD.RoundingMode.HALF_UP;
  var BIM_BASE = 990000;

  function _scalar(db, sql, params) { var r = db.exec(sql, params || []); return (r.length && r[0].values.length) ? r[0].values[0][0] : null; }
  function _allocator(db) {
    var next = {};
    return function (table, idCol) {
      if (next[table] == null) next[table] = Math.max(Number(_scalar(db, 'SELECT COALESCE(MAX("' + idCol + '"),0) FROM "' + table + '"') || 0), BIM_BASE - 1) + 1;
      return next[table]++;
    };
  }
  function _uu() { try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {} return 'bim-clm-' + Math.abs((Date.now ? Date.now() : 0) ^ (Math.random() * 1e9 | 0)).toString(16); }

  function progressClaim(db, projectId, opts) {
    opts = opts || {};
    var CL = opts.clientId != null ? opts.clientId : 11, OG = opts.orgId != null ? opts.orgId : 11, U = opts.user != null ? opts.user : 100;
    var now = opts.now || (function () { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (e) { return '2026-01-01 00:00:00'; } })();
    var id = _allocator(db);
    var notes = [];

    var proj = db.exec("SELECT Value,C_Currency_ID,C_BPartner_ID FROM C_Project WHERE C_Project_ID=?", [projectId]);
    if (!proj.length) return { ok: false, reason: 'no-project', projectId: projectId };
    var building = proj[0].values[0][0], curId = proj[0].values[0][1];
    // the supplier: the project's PO bpartner (find-only; never invent one).
    var bpId = opts.bpartnerId != null ? opts.bpartnerId : _scalar(db, "SELECT C_BPartner_ID FROM C_Order WHERE Description=? AND C_BPartner_ID IS NOT NULL LIMIT 1", ['BIM PO: ' + building]);
    var poOrderId = _scalar(db, "SELECT C_Order_ID FROM C_Order WHERE Description=? LIMIT 1", ['BIM PO: ' + building]);

    // newly-complete phases not yet on a BIM progress-claim line.
    var phRes = db.exec("SELECT C_ProjectPhase_ID,Name,PlannedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + Number(projectId) + " AND IsComplete='Y' ORDER BY SeqNo");
    var phases = phRes.length ? phRes[0].values : [];
    var newPhases = phases.filter(function (p) {
      return _scalar(db, "SELECT 1 FROM C_InvoiceLine il JOIN C_Invoice i ON il.C_Invoice_ID=i.C_Invoice_ID WHERE il.C_ProjectPhase_ID=? AND i.Description LIKE 'BIM Progress Claim:%' LIMIT 1", [p[0]]) == null;
    });
    if (!newPhases.length) return { ok: true, idempotent: true, invoiceId: null, claimAmt: '0', projectId: projectId, notes: ['nothing newly earned (all complete phases already claimed)'] };

    var claim = BD.ZERO;
    newPhases.forEach(function (p) { claim = claim.add(BD.of(String(p[2] || 0))); });

    // the progress-claim invoice (AP Invoice doctype, DR draft — awaiting the accountant's post).
    var docType = _scalar(db, "SELECT C_DocType_ID FROM C_DocType WHERE DocBaseType='API' LIMIT 1") || 123;
    var invId = id('C_Invoice', 'C_Invoice_ID');
    var claimNo = Number(_scalar(db, "SELECT COUNT(*) FROM C_Invoice WHERE Description LIKE ?", ['BIM Progress Claim: ' + building + '%']) || 0) + 1;
    var docNo = 'CLAIM-' + building + '-' + ('00' + claimNo).slice(-3);
    db.run("INSERT INTO C_Invoice (C_Invoice_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
      "IsSOTrx,DocumentNo,DocStatus,DocAction,Processed,Posted,C_DocType_ID,C_DocTypeTarget_ID,Description,IsApproved," +
      "DateInvoiced,DateAcct,C_BPartner_ID,C_Currency_ID,C_Project_ID,C_Order_ID,GrandTotal,TotalLines,PaymentRule,IsPaid,C_Invoice_UU) " +
      "VALUES (?,?,?,'Y',?,?,?,?,'N',?,'DR','CO','N','N',?,?,?,'N',?,?,?,?,?,?,?,?,'P','N',?)",
      [invId, CL, OG, now, U, now, U, docNo, docType, docType, 'BIM Progress Claim: ' + building + ' #' + claimNo, now, now, bpId, curId, projectId, poOrderId, claim.toString(), claim.toString(), _uu()]);

    var lineNo = 10;
    newPhases.forEach(function (p) {
      var lnId = id('C_InvoiceLine', 'C_InvoiceLine_ID');
      // a representative product for the phase (the first project line's product) — for the Dr account map.
      var prodId = _scalar(db, "SELECT m_product_id FROM C_ProjectLine WHERE c_project_id=? AND c_projectphase_id=? LIMIT 1", [projectId, p[0]]);
      db.run("INSERT INTO C_InvoiceLine (C_InvoiceLine_ID,C_Invoice_ID,AD_Client_ID,AD_Org_ID,IsActive,Created,CreatedBy,Updated,UpdatedBy," +
        "Line,Description,M_Product_ID,QtyInvoiced,QtyEntered,PriceActual,PriceEntered,LineNetAmt,LineTotalAmt,C_Project_ID,C_ProjectPhase_ID,Processed,C_InvoiceLine_UU) " +
        "VALUES (?,?,?,?,'Y',?,?,?,?,?,?,?,1,1,?,?,?,?,?,?,'N',?)",
        [lnId, invId, CL, OG, now, U, now, U, lineNo, 'Progress: ' + p[1], prodId, p[2], p[2], p[2], p[2], projectId, p[0], _uu()]);
      lineNo += 10;
    });

    // move the actual cost onto the project (EVM AC) — BigDecimal.
    var prevInv = BD.of(String(_scalar(db, "SELECT COALESCE(InvoicedAmt,0) FROM C_Project WHERE C_Project_ID=?", [projectId]) || 0));
    db.run("UPDATE C_Project SET InvoicedAmt=?,ProjInvoiceRule='C',Updated=?,UpdatedBy=? WHERE C_Project_ID=?",
      [prevInv.add(claim).toString(), now, U, projectId]);

    return { ok: true, idempotent: false, invoiceId: invId, documentNo: docNo, claimAmt: claim.toString(), phasesClaimed: newPhases.length, projectId: projectId, bpartnerId: bpId, notes: notes };
  }

  // the primary accounting schema + its default WIP / AP combinations.
  function _acctCtx(db, bpId) {
    var as = Number(_scalar(db, "SELECT C_AcctSchema_ID FROM C_AcctSchema ORDER BY C_AcctSchema_ID LIMIT 1") || 101);
    var wipDef = _scalar(db, "SELECT p_wip_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    var expDef = _scalar(db, "SELECT p_expense_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    var ap = null;
    if (bpId != null) { var g = _scalar(db, "SELECT C_BP_Group_ID FROM C_BPartner WHERE C_BPartner_ID=?", [bpId]); if (g != null) ap = _scalar(db, "SELECT v_liability_acct FROM C_BP_Group_Acct WHERE C_BP_Group_ID=? AND C_AcctSchema_ID=?", [g, as]); }
    if (ap == null) ap = _scalar(db, "SELECT v_liability_acct FROM C_AcctSchema_Default WHERE C_AcctSchema_ID=?", [as]);
    return { acctSchemaId: as, wipDef: wipDef, expDef: expDef, ap: ap };
  }

  // GL posting preview for a progress-claim invoice (Dr Cost/WIP, Cr AP) — does NOT write Fact_Acct.
  function postingPreview(db, invoiceId) {
    var inv = db.exec("SELECT GrandTotal,C_BPartner_ID,C_Currency_ID FROM C_Invoice WHERE C_Invoice_ID=?", [invoiceId]);
    if (!inv.length) return { ok: false, reason: 'no-invoice', invoiceId: invoiceId };
    var grand = inv[0].values[0][0], bpId = inv[0].values[0][1];
    var ctx = _acctCtx(db, bpId);

    var lnRes = db.exec("SELECT il.LineNetAmt, p.M_Product_Category_ID FROM C_InvoiceLine il LEFT JOIN M_Product p ON il.M_Product_ID=p.M_Product_ID WHERE il.C_Invoice_ID=" + Number(invoiceId));
    var lns = lnRes.length ? lnRes[0].values : [];
    var by = {}; // account_id → {dr,cr}
    function add(side, acctId, amt) {
      if (acctId == null) return;
      var k = String(acctId);
      if (!by[k]) by[k] = { account: acctId, dr: BD.ZERO, cr: BD.ZERO };
      by[k][side] = by[k][side].add(BD.of(String(amt)));
    }
    // Dr — each line's cost to the product-category WIP account (else the schema default WIP).
    lns.forEach(function (l) {
      var net = l[0], catId = l[1];
      var wip = (catId != null ? _scalar(db, "SELECT p_wip_acct FROM M_Product_Category_Acct WHERE M_Product_Category_ID=? AND C_AcctSchema_ID=?", [catId, ctx.acctSchemaId]) : null) || ctx.wipDef;
      add('dr', wip, net);
    });
    // Cr — accounts payable for the whole claim.
    add('cr', ctx.ap, grand);

    var lines = Object.keys(by).map(function (k) {
      var v = by[k], val = _scalar(db, "SELECT ev.value FROM C_ValidCombination vc JOIN C_ElementValue ev ON vc.account_id=ev.c_elementvalue_id WHERE vc.c_validcombination_id=?", [v.account]);
      return { account: v.account, acctValue: val, dr: v.dr.setScale(2, HALF_UP).toString(), cr: v.cr.setScale(2, HALF_UP).toString() };
    });
    var sumDr = BD.ZERO, sumCr = BD.ZERO;
    Object.keys(by).forEach(function (k) { sumDr = sumDr.add(by[k].dr); sumCr = sumCr.add(by[k].cr); });
    sumDr = sumDr.setScale(2, HALF_UP); sumCr = sumCr.setScale(2, HALF_UP);
    return {
      ok: true, invoiceId: invoiceId, acctSchemaId: ctx.acctSchemaId, lines: lines,
      sumDr: sumDr.toString(), sumCr: sumCr.toString(), balances: sumDr.compareTo(sumCr) === 0,
      posted: false, note: 'PREVIEW only — a folded BIM progress claim is not auto-written to Fact_Acct; posting is an explicit accountant DocAction in the ERP app.'
    };
  }

  var API = { progressClaim: progressClaim, postingPreview: postingPreview };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ProjClaim = API;
})(typeof self !== 'undefined' ? self : this);
