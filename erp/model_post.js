// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_post.js — DocumentEngine.postImmediate for the documents the model completes: Doc.post per ACCOUNTING SCHEMA
// (acct/Doc.java:246 — every schema of the client, GardenWorld = 101 USD + 200000 EUR) + the costing it triggers
// (Doc_InOut → MCostDetail.createShipment → process per costing element → M_Cost / M_CostHistory / M_CostQueue).
// bim-compiler prompts/ERP_MODEL_LAYER.md §CHANGE-LIST E1-E2 — Witness: W-MODEL-ORACLE (fact_acct + m_cost* judged).
// Facts are written through the SAME Trx (one signed group with the completion). Accounts are READ from the master
// *_acct rows (C_ValidCombination → C_ElementValue), amounts from document rows, FX from C_Conversion_Rate — none invented.
// Doc classes ported here: Doc_Order (no facts — commitment accounting off), Doc_InOut (customer shipment C- / vendor
// receipt V+ via NotInvoicedReceipts), Doc_Invoice (ARI/ARC/API), Doc_Payment, Doc_AllocationHdr (payment / cash line ↔ SO/PO invoice, discount,
// write-off, VAT tax correction; foreign-currency realized gain/loss lines (createInvoiceGainLoss / createPaymentGainLoss, W-NC5BCD-GAINLOSS); rounding corrections across several allocations stay NAMED — W-POST-ALLOCATION).
// Doc_Movement (§60) and Doc_Inventory (§67: Physical Inventory / Internal Use / Cost Adjustment) are ported below on the same Doc/DocLine/createLine framework.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelPost = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var TABLE_ID = { c_order: 259, m_inout: 319, c_invoice: 318, c_payment: 335, c_allocationhdr: 735, m_matchinv: 472, m_movement: 323, m_inventory: 321, gl_journal: 224, c_bankstatement: 392 };

  function schemas(trx) {                                                                 // MAcctSchema.getClientAcctSchema — primary first
    var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [trx.env.client])[0];
    var all = trx.q("SELECT * FROM c_acctschema WHERE ad_client_id=? AND isactive='Y' ORDER BY c_acctschema_id", [trx.env.client]);
    return all.sort(function (a, b) { return (ci && b.c_acctschema_id === ci.a) - (ci && a.c_acctschema_id === ci.a); });
  }
  function vc(trx, table, col, keyCol, key, schema) {
    var r = trx.q('SELECT ' + col + ' AS a FROM ' + table + ' WHERE ' + keyCol + '=? AND c_acctschema_id=?', [key, schema])[0];
    if (!r || r.a == null) { var d = trx.q('SELECT ' + col.replace(/^p_/, 'p_') + ' AS a FROM c_acctschema_default WHERE c_acctschema_id=?', [schema])[0]; r = d; }
    if (!r || r.a == null) return null;
    var v = trx.q('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=?', [r.a])[0];
    return v ? v.e : null;
  }
  function bpg(t, col, bp, s) { var b = nz(bp) ? t.get('c_bpartner', bp) : null; return b ? vc(t, 'c_bp_group_acct', col, 'c_bp_group_id', b.c_bp_group_id, s) : null; }
  var ACCT = {                                                                            // Doc*.getAccount sources (ProductCost/DocLine/Doc.getAccount)
    receivable: function (t, bp, s) { return vc(t, 'c_bp_customer_acct', 'c_receivable_acct', 'c_bpartner_id', bp, s); },
    liability: function (t, bp, s) { return vc(t, 'c_bp_vendor_acct', 'v_liability_acct', 'c_bpartner_id', bp, s); },
    revenue: function (t, p, s) { return vc(t, 'm_product_acct', 'p_revenue_acct', 'm_product_id', p, s); },
    expense: function (t, p, s) { return vc(t, 'm_product_acct', 'p_expense_acct', 'm_product_id', p, s); },
    cogs: function (t, p, s) { return vc(t, 'm_product_acct', 'p_cogs_acct', 'm_product_id', p, s); },
    asset: function (t, p, s) { return vc(t, 'm_product_acct', 'p_asset_acct', 'm_product_id', p, s); },
    nir: function (t, bp, s) { var g = t.get('c_bpartner', bp); return g ? vc(t, 'c_bp_group_acct', 'notinvoicedreceipts_acct', 'c_bp_group_id', g.c_bp_group_id, s) : null; },
    taxDue: function (t, x, s) { return vc(t, 'c_tax_acct', 't_due_acct', 'c_tax_id', x, s); },
    inventoryClearing: function (t, p, s) { return vc(t, 'm_product_acct', 'p_inventoryclearing_acct', 'm_product_id', p, s); },
    chargeExpense: function (t, c, s) { return vc(t, 'c_charge_acct', 'ch_expense_acct', 'c_charge_id', c, s); },
    taxCredit: function (t, x, s) { return vc(t, 'c_tax_acct', 't_credit_acct', 'c_tax_id', x, s); },
    inTransit: function (t, b, s) { return vc(t, 'c_bankaccount_acct', 'b_intransit_acct', 'c_bankaccount_id', b, s); },
    unallocated: function (t, b, s) { return vc(t, 'c_bankaccount_acct', 'b_unallocatedcash_acct', 'c_bankaccount_id', b, s); },
    paymentSelect: function (t, b, s) { return vc(t, 'c_bankaccount_acct', 'b_paymentselect_acct', 'c_bankaccount_id', b, s); },              // Doc.java:1434
    cashTransfer: function (t, cb, s) { return vc(t, 'c_cashbook_acct', 'cb_cashtransfer_acct', 'c_cashbook_id', cb, s); },                   // Doc.java:1493
    prepaymentC: function (t, bp, s) { return vc(t, 'c_bp_customer_acct', 'c_prepayment_acct', 'c_bpartner_id', bp, s); },                    // Doc.java:1418
    prepaymentV: function (t, bp, s) { return vc(t, 'c_bp_vendor_acct', 'v_prepayment_acct', 'c_bpartner_id', bp, s); },
    discountExp: function (t, bp, s) { return bpg(t, 'paydiscount_exp_acct', bp, s); },                                                       // Doc.java:1441-1456 (the BP's group)
    discountRev: function (t, bp, s) { return bpg(t, 'paydiscount_rev_acct', bp, s); },
    writeOff: function (t, bp, s) { return bpg(t, 'writeoff_acct', bp, s); }
  };
  var rate = T.rate;   // MConversionRate.getRate — one implementation (model_trade.js)
  function periodId(trx, date) {
    var d = String(date || '').slice(0, 10);
    var p = trx.q("SELECT p.c_period_id AS id FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN ad_clientinfo ci ON ci.c_calendar_id=y.c_calendar_id WHERE ci.ad_client_id=? AND p.periodtype='S' AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [trx.env.client, d, d])[0];
    return p ? p.id : null;
  }
  function locOfOrg(trx, org) { var r = trx.q('SELECT c_location_id AS l FROM ad_orginfo WHERE ad_org_id=?', [org])[0]; return r ? r.l : null; }
  function locOfWh(trx, wh) { var r = wh ? trx.get('m_warehouse', wh) : null; return r ? r.c_location_id : null; }
  function locOfBP(trx, bpl) { var r = nz(bpl) ? trx.get('c_bpartner_location', bpl) : null; return r ? r.c_location_id : null; }

  // ── a Fact (acct/Fact.java + FactLine.java): source amounts in the doc currency, accounted = source × rate rounded ──
  function Fact(trx, table, doc, as, glcat) { this.trx = trx; this.table = table; this.doc = doc; this.as = as; this.glcat = glcat; this.lines = []; this.err = null; }
  Fact.prototype.line = function (acct, cur, dr, cr, extra) {
    if (acct == null) { this.err = this.err || 'account not resolvable'; return; }
    dr = dr == null ? null : D(dr); cr = cr == null ? null : D(cr);
    if (!(this.as.isallownegativeposting && Y(this.as.isallownegativeposting))) {            // FactLine.setAmtSource :237-257 - without AllowNegativePosting a negative DR becomes a CR (and vice versa)
      if (dr != null && dr.signum() < 0) { cr = dr.abs ? dr.abs() : dr.negate(); dr = Z; }
      if (cr != null && cr.signum() < 0) { dr = cr.abs ? cr.abs() : cr.negate(); cr = Z; }
    }
    if ((dr == null || dr.signum() === 0) && (cr == null || cr.signum() === 0)) return;     // Fact.createLine: zero → no line
    var prec = T.precisionOf(this.trx, this.as.c_currency_id), r = rate(this.trx, cur, this.as.c_currency_id, this.doc.dateacct, this.doc.c_conversiontype_id);
    if (!r) { this.err = 'No conversion rate ' + cur + '→' + this.as.c_currency_id; return; }
    var src = T.precisionOf(this.trx, cur);
    this.lines.push(Object.assign({ c_acctschema_id: this.as.c_acctschema_id, account_id: acct, c_currency_id: cur, postingtype: 'A',
      amtsourcedr: dr ? N(dr.setScale(src, HU)) : 0, amtsourcecr: cr ? N(cr.setScale(src, HU)) : 0,
      amtacctdr: dr ? N(dr.multiply(r).setScale(prec, HU)) : 0, amtacctcr: cr ? N(cr.multiply(r).setScale(prec, HU)) : 0 }, extra || {}));
  };
  // Fact.balanceAccounting (acct/Fact.java:548-635): the accounted DR-CR difference is booked either as a Currency Balancing line on the schema's CurrencyBalancing_Acct (AcctSchemaGL.UseCurrencyBalancing=Y,
  //   switched to the other side when it would add to the biggest balance-sheet line's side) or, without it, onto the biggest BALANCE-SHEET line (else the biggest P&L line) by FactLine.currencyCorrect :792-813.
  //   Found by W-POST-INVOICE: legacy booked a -0.01 balancing line on schema 200000 where the old "larger line" shortcut adjusted the receivable instead.
  function isBalanceSheet(trx, accountId) { var e = nz(accountId) ? trx.get('c_elementvalue', accountId) : null; return !!e && (e.accounttype === 'A' || e.accounttype === 'L' || e.accounttype === 'O'); }   // MElementValue.isBalanceSheet
  Fact.prototype.balance = function () {
    var self = this, trx = this.trx, dr = Z, cr = Z; this.lines.forEach(function (l) { dr = dr.add(D(l.amtacctdr)); cr = cr.add(D(l.amtacctcr)); });
    var diff = dr.subtract(cr); if (diff.signum() === 0 || !this.lines.length) return;
    var BS = null, BSamt = Z, PL = null, PLamt = Z;
    this.lines.forEach(function (l) { var amt = D(l.amtacctdr).subtract(D(l.amtacctcr)).abs(), bs = isBalanceSheet(trx, l.account_id);
      if (bs && amt.compareTo(BSamt) > 0) { BSamt = amt; BS = l; } else if (!bs && amt.compareTo(PLamt) > 0) { PLamt = amt; PL = l; } });
    var gl = trx.q('SELECT usecurrencybalancing AS u, currencybalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', [this.as.c_acctschema_id])[0];
    if (gl && gl.u === 'Y') {
      var vcRow = nz(gl.a) ? trx.get('c_validcombination', gl.a) : null;
      if (!vcRow) { this.err = this.err || 'CurrencyBalancing_Acct not resolvable'; return; }
      var isDR = diff.signum() < 0, difference = diff.abs(), drAmt = isDR ? difference : Z, crAmt = isDR ? Z : difference;
      var bsDrSrc = BS ? D(BS.amtsourcedr).subtract(D(BS.amtsourcecr)).signum() !== -1 : false;
      if (BS && ((bsDrSrc && isDR) || (!bsDrSrc && !isDR))) { drAmt = Z; crAmt = Z; if (isDR) crAmt = difference.negate(); else drAmt = difference.negate(); }
      this.lines.push({ c_acctschema_id: this.as.c_acctschema_id, account_id: vcRow.account_id, c_currency_id: this.doc.c_currency_id != null ? this.doc.c_currency_id : this.as.c_currency_id, postingtype: 'A',
        amtsourcedr: 0, amtsourcecr: 0, amtacctdr: N(drAmt), amtacctcr: N(crAmt), ad_org_id: this.doc.ad_org_id, c_bpartner_id: this.doc.c_bpartner_id });
      return;
    }
    var line = BS || PL; if (!line) { this.err = this.err || 'No Line found'; return; }
    var negative = diff.signum() < 0, adjustDr = D(line.amtacctdr).abs().compareTo(D(line.amtacctcr).abs()) > 0;
    if (adjustDr) line.amtacctdr = N(D(line.amtacctdr).subtract(diff)); else line.amtacctcr = N(D(line.amtacctcr).add(diff));
    void negative;
  };

  // Fact.isSegmentBalanced(OO) :334-396 / balanceSegments :405-499 (Doc.postLogic :851-870, between balanceSource and balanceAccounting, EVERY Doc): with the OO element IsBalanced the SOURCE balance per org must be zero
  //   in all but one org; otherwise every org with a non-zero balance gets an IntercompanyDueTo / DueFrom line (AcctSchemaGL) on that org (Balance.isReversal: DR<=0 && CR<=0).
  Fact.prototype.segmentsBalanced = function () {
    var m = {}, n = 0; this.lines.forEach(function (l) { var k = Number(l.ad_org_id || 0); m[k] = (m[k] || Z).add(D(l.amtsourcedr)).subtract(D(l.amtsourcecr)); });
    Object.keys(m).forEach(function (k) { if (m[k].signum() !== 0) n++; }); return n <= 1;
  };
  Fact.prototype.balanceSegments = function (ctx) {
    var self = this, trx = this.trx, el = trx.q("SELECT isbalanced AS b FROM c_acctschema_element WHERE c_acctschema_id=? AND elementtype='OO'", [this.as.c_acctschema_id])[0];
    if (!el || !Y(el.b) || !this.lines.length || this.segmentsBalanced()) return;
    var gl = trx.q('SELECT intercompanydueto_acct AS t, intercompanyduefrom_acct AS f FROM c_acctschema_gl WHERE c_acctschema_id=?', [this.as.c_acctschema_id])[0], m = {}, keys = [];
    this.lines.forEach(function (l) { var k = Number(l.ad_org_id || 0); if (!m[k]) { m[k] = { dr: Z, cr: Z }; keys.push(k); } m[k].dr = m[k].dr.add(D(l.amtsourcedr)); m[k].cr = m[k].cr.add(D(l.amtsourcecr)); });
    keys.sort(function (a, b) { return a - b; }).forEach(function (k) {
      var b = m[k], bal = b.dr.subtract(b.cr); if (bal.signum() === 0) return;
      var rev = b.dr.signum() <= 0 && b.cr.signum() <= 0, post = rev ? bal.abs().negate() : bal.abs(), vcId = bal.signum() < 0 ? (rev ? gl && gl.t : gl && gl.f) : (rev ? gl && gl.f : gl && gl.t);
      var vcr = nz(vcId) ? trx.get('c_validcombination', vcId) : null; if (!vcr) { self.err = self.err || 'Intercompany Due account not resolvable'; return; }
      var fl = createLine(self, ctx, null, vcr.account_id, self.as.c_currency_id, bal.signum() < 0 ? post : null, bal.signum() < 0 ? null : post);   // setAmtSource(cur, DR|CR = getPostBalance) then convert(); AD_Org_ID = the segment key
      if (fl) fl.ad_org_id = k; });
  };
  var LBL_BREAK = (typeof process !== 'undefined' && process.env && process.env.LBL_BREAK) || '';   // witness negative controls only (W-ASI-BATCHREV): nofind = findReversalCostDetailAmt finds nothing; norevmas = the reversal line's MA rows are not read
  var BREAK_SEG = (typeof process !== 'undefined' && process.env && process.env.LMV_BREAK) === 'nosegments';   // witness negative control only (W-POST-MOVEMENT)

  // ══ Doc / DocLine / FactLine — the faithful framework (acct/Doc.java, DocLine.java, Fact.java :112-170, FactLine.java) ══
  // Used by the Doc ports below that were written against it (receipt, AP invoice, MatchPO, MatchInv); a FactLine is a
  // plain object of Fact_Acct columns pushed onto F.lines, so Doc.post (below) seals every Doc class the same way.
  var BASETYPE = { m_matchpo: 'MXP', m_matchinv: 'MXI', c_allocationhdr: 'CMA', c_cash: 'CMC', c_projectissue: 'PJI' };   // Doc.getC_DocType_ID :1911-1965
  function docTypeIdOf(trx, table, doc) {
    var cols = ML.columnsOf(trx, table);
    if (cols.c_doctype_id) { var v = doc.c_doctype_id; if (v != null && Number(v) === 0 && cols.c_doctypetarget_id) v = doc.c_doctypetarget_id; return v != null ? Number(v) : 0; }
    if (BASETYPE[table]) { var r = trx.q("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=? AND docbasetype=? AND isactive='Y' ORDER BY isdefault DESC, c_doctype_id", [trx.env.client, BASETYPE[table]])[0]; return r ? r.d : 0; }
    return 0;
  }
  // a Doc context = the header values FactLine.setDocumentInfo reads (Doc.get* read the PO column when the table has it)
  function Doc(trx, table, row, extra) {
    var c = Object.assign({ trx: trx, table: table, row: row, id: row[table + '_id'], documentno: row.documentno, description: row.description, dateAcct: row.dateacct,
      m_product_id: row.m_product_id, qty: row.qty != null ? D(row.qty) : null, c_bpartner_id: row.c_bpartner_id, m_warehouse_id: row.m_warehouse_id, ad_org_id: row.ad_org_id,
      ad_orgtrx_id: row.ad_orgtrx_id, c_project_id: row.c_project_id, c_campaign_id: row.c_campaign_id, c_activity_id: row.c_activity_id, c_charge_id: row.c_charge_id,
      m_attributesetinstance_id: row.m_attributesetinstance_id, user1_id: row.user1_id, user2_id: row.user2_id, c_costcenter_id: row.c_costcenter_id, c_department_id: row.c_department_id,
      c_conversiontype_id: row.c_conversiontype_id }, extra || {});
    return c;
  }
  // a DocLine from a line PO (DocLine ctor :88-150 — column reads)
  function DocLine(trx, table, l, extra) {
    var prod = nz(l.m_product_id) && l.c_uom_id == null ? trx.get('m_product', l.m_product_id) : null;   // DocLine.getC_UOM_ID :874-890 - the line's own C_UOM_ID, else the product's Storage UOM (a PO without the column, e.g. M_InventoryLine, books the product UOM)
    return Object.assign({ table: table, row: l, id: l[table + '_id'], line: l.line, description: l.description, m_product_id: l.m_product_id, c_uom_id: l.c_uom_id != null ? l.c_uom_id : (prod ? prod.c_uom_id : l.c_uom_id), c_tax_id: l.c_tax_id,
      c_bpartner_id: l.c_bpartner_id, m_warehouse_id: l.m_warehouse_id, m_locator_id: l.m_locator_id, ad_org_id: l.ad_org_id, ad_orgtrx_id: l.ad_orgtrx_id, c_project_id: l.c_project_id,
      c_projectphase_id: l.c_projectphase_id, c_projecttask_id: l.c_projecttask_id, c_campaign_id: l.c_campaign_id, c_activity_id: l.c_activity_id, c_charge_id: l.c_charge_id,
      a_asset_id: l.a_asset_id, m_attributesetinstance_id: l.m_attributesetinstance_id, user1_id: l.user1_id, user2_id: l.user2_id, c_costcenter_id: l.c_costcenter_id,
      c_department_id: l.c_department_id, c_orderline_id: l.c_orderline_id, qty: null }, extra || {});
  }
  var DIMCOLS = ['c_bpartner_id', 'ad_orgtrx_id', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_campaign_id', 'c_activity_id', 'a_asset_id', 'c_charge_id', 'm_warehouse_id',
    'c_costcenter_id', 'c_department_id', 'm_attributesetinstance_id', 'user1_id', 'user2_id'];
  // Fact.createLine(docLine, account, C_Currency_ID, dr, cr) :112-170 ∘ FactLine.setDocumentInfo :364-500 ∘ setAmtSource :235-270 ∘ convert :819-920
  function createLine(F, ctx, dl, acct, cur, dr, cr) {
    if (acct == null) return null;
    var trx = F.trx, as = F.as, fl = { c_acctschema_id: as.c_acctschema_id, account_id: acct, postingtype: 'A', line_id: dl ? dl.id : null, ad_org_id: 0 };
    fl.datetrx = (dl && dl.dateDoc) || ctx.dateDoc; fl.dateacct = (dl && dl.dateAcct) || ctx.dateAcct;
    if (dl) fl.c_tax_id = dl.c_tax_id;
    var d = String(ctx.documentno == null ? '' : ctx.documentno);
    if (dl) { d += ' #' + dl.line; if (dl.description != null) d += ' (' + dl.description + ')'; else if (ctx.description) d += ' (' + ctx.description + ')'; }
    else if (ctx.description) d += ' (' + ctx.description + ')';
    fl.description = d;
    fl.m_product_id = dl && nz(dl.m_product_id) ? dl.m_product_id : ctx.m_product_id;
    if (dl) fl.c_uom_id = dl.c_uom_id;
    fl.qty = ctx.qty != null ? N(ctx.qty) : null; if (dl) fl.qty = dl.qty != null ? N(dl.qty) : null;
    DIMCOLS.forEach(function (c) { var v = dl ? dl[c] : null; if (!nz(v)) v = ctx[c]; fl[c] = nz(v) ? v : null; });
    if (!as.isallownegativeposting || !Y(as.isallownegativeposting)) {                       // setAmtSource :237-257 fix Debit & Credit
      if (dr != null && D(dr).signum() < 0) { cr = D(dr).abs(); dr = Z; }
      if (cr != null && D(cr).signum() < 0) { dr = D(cr).abs(); cr = Z; }
    }
    var sprec = T.precisionOf(trx, cur), sdr0 = dr == null ? Z : D(dr), scr0 = cr == null ? Z : D(cr);      // setAmtSource :268-282 currency precision
    if (sdr0.scale() > sprec) sdr0 = sdr0.setScale(sprec, HU); if (scr0.scale() > sprec) scr0 = scr0.setScale(sprec, HU);
    fl.c_currency_id = cur; fl.amtsourcedr = N(sdr0); fl.amtsourcecr = N(scr0);
    if (D(fl.amtsourcedr).signum() === 0 && D(fl.amtsourcecr).signum() === 0 && (!dl || dl.qty == null || D(dl.qty).signum() === 0)) return null;
    if (String(cur) === String(as.c_currency_id)) { fl.amtacctdr = fl.amtsourcedr; fl.amtacctcr = fl.amtsourcecr; }
    else {
      var ct = (dl && nz(dl.c_conversiontype_id)) ? dl.c_conversiontype_id : ctx.c_conversiontype_id, r = rate(trx, cur, as.c_currency_id, fl.dateacct, ct, fl.ad_org_id), prec = T.precisionOf(trx, as.c_currency_id);
      if (!r) { F.err = 'No conversion from ' + cur + ' to ' + as.c_currency_id; return null; }
      fl.amtacctdr = N(D(fl.amtsourcedr).multiply(r).setScale(prec, HU)); fl.amtacctcr = N(D(fl.amtsourcecr).multiply(r).setScale(prec, HU));
    }
    fl._dl = dl; F.lines.push(fl);
    return fl;
  }
  function removeLine(F, fl) { var i = F.lines.indexOf(fl); if (i >= 0) F.lines.splice(i, 1); }
  function acctBalance(fl) { return D(fl.amtacctdr).subtract(D(fl.amtacctcr)); }
  function setLoc(trx, fl, locId, isFrom) { if (nz(locId)) fl[isFrom ? 'c_locfrom_id' : 'c_locto_id'] = locId; }                       // FactLine.setLocation
  function locFromLocator(trx, fl, locatorId, isFrom) { if (!nz(locatorId)) return; var l = trx.get('m_locator', locatorId), w = l ? trx.get('m_warehouse', l.m_warehouse_id) : null; if (w) setLoc(trx, fl, w.c_location_id, isFrom); }   // :639-670
  function locFromBPartner(trx, fl, bplId, isFrom) { if (!nz(bplId)) return; var b = trx.get('c_bpartner_location', bplId); if (b) setLoc(trx, fl, b.c_location_id, isFrom); }   // :674-705
  function locFromOrg(trx, fl, orgId, isFrom) { if (!nz(orgId)) return; var o = trx.q('SELECT c_location_id AS l FROM ad_orginfo WHERE ad_org_id=?', [orgId])[0]; if (o) setLoc(trx, fl, o.l, isFrom); }   // :708-738
  // FactLine.updateReverseLine :1301-1424 — copy the referenced document's posted line (reversed), times multiplier
  function updateReverseLine(F, fl, adTableId, recordId, lineId, mult, other) {
    var trx = F.trx, rows = trx.find('fact_acct', { c_acctschema_id: F.as.c_acctschema_id, ad_table_id: adTableId, record_id: recordId, account_id: fl.account_id }).filter(function (f) {
      // a line id is PRESENT when non-zero: a row created this session carries a NEGATIVE pk (−opId), which `> 0` read as "no line" and so never
      // found the original's posted line → the reversal Shipment of a Void stayed unposted (§ERP-DEPTH-FILM D9g, measured 2026-10-13)
      if (lineId != null && lineId !== '' && Number(lineId) !== 0) { if (String(f.line_id) !== String(lineId)) return false; } else if (f.line_id != null && f.line_id !== '') return false;
      if (adTableId === 323 && String(f.m_locator_id) !== String(fl.m_locator_id)) return false;   // MMovement.Table_ID
      if (other) { if (D(other.amtacctdr).signum() === 0 && D(other.amtacctcr).signum() !== 0) return D(f.amtacctdr).signum() === 0 && D(f.amtacctcr).signum() !== 0;
        if (D(other.amtacctdr).signum() !== 0 && D(other.amtacctcr).signum() === 0) return D(f.amtacctcr).signum() === 0 && D(f.amtacctdr).signum() !== 0; }
      return true;
    }).sort(function (a, b) { return Number(a.fact_acct_id) - Number(b.fact_acct_id); });
    var f = rows[0]; if (!f) { trx.say('§MODEL-POST updateReverseLine Not Found (try later) table=' + adTableId + ' record=' + recordId + ' line=' + lineId + ' account=' + fl.account_id); return false; }
    mult = D(mult);
    var adr = D(f.amtacctcr).multiply(mult), acr = D(f.amtacctdr).multiply(mult);                  // setAmtAcct(cur, cr*m, dr*m) :318-357
    if (adr.signum() < 0) { acr = adr.abs(); adr = Z; } if (acr.signum() < 0) { adr = acr.abs(); acr = Z; }
    var prec = T.precisionOf(trx, fl.c_currency_id);
    fl.amtacctdr = N(adr.scale() > prec ? adr.setScale(prec, HU) : adr); fl.amtacctcr = N(acr.scale() > prec ? acr.setScale(prec, HU) : acr);
    var sdr = D(f.amtsourcecr).multiply(mult), scr = D(f.amtsourcedr).multiply(mult);              // setAmtSource(fact cur, cr*m, dr*m)
    if (sdr.signum() < 0) { scr = sdr.abs(); sdr = Z; } if (scr.signum() < 0) { sdr = scr.abs(); scr = Z; }
    fl.c_currency_id = f.c_currency_id; fl.amtsourcedr = N(sdr); fl.amtsourcecr = N(scr);
    ['ad_orgtrx_id', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_activity_id', 'c_campaign_id', 'c_salesregion_id', 'c_locfrom_id', 'c_locto_id', 'm_product_id', 'm_locator_id',
     'a_asset_id', 'm_warehouse_id', 'c_tax_id', 'c_charge_id', 'c_costcenter_id', 'c_department_id', 'c_employee_id', 'user1_id', 'user2_id', 'c_uom_id', 'm_attributesetinstance_id',
     'customfieldtext1', 'customfieldtext2', 'customfieldtext3', 'customfieldtext4', 'ad_org_id'].forEach(function (c) { fl[c] = f[c] == null ? null : f[c]; });
    if (f.qty != null) { var q = D(f.qty).multiply(mult).negate(); if (nz(fl.c_uom_id)) { var u = trx.get('c_uom', fl.c_uom_id); q = q.setScale(u ? Number(u.stdprecision) : 0, HU); } fl.qty = N(q); }
    return true;
  }
  function productAcct(trx, productId, col, as) { return vc(trx, 'm_product_acct', col, 'm_product_id', productId, as.c_acctschema_id); }
  function isService(p) { return p && p.producttype !== 'I'; }                                         // MProduct.isService

  var MC = null; function mc() { return MC || (MC = (typeof module !== 'undefined' && module.exports) ? require('./model_cost') : (typeof window !== 'undefined' ? window.ModelCost : globalThis.ModelCost)); }
  // DocLine.getProductCosts(as, org, zeroCostsOK, whereClause) :791-808 ∘ (…, costDetail) :827-838
  function lineProductCosts(trx, F, ctx, dl, zeroOK, byCd) {
    var as = F.as, p = T.product(trx, dl.m_product_id), M = mc();
    function pc(cd) { var c = M.getProductCosts(trx, p, dl.pcAsi != null ? dl.pcAsi : (dl.m_attributesetinstance_id || 0), as, dl.ad_org_id, null, dl.pcQty, dl.c_orderline_id || 0, zeroOK, dl.dateAcct || ctx.dateAcct, cd, false); return c == null ? Z : c; }
    if (byCd && as.costingmethod !== 'S') {
      var cd = trx.find('m_costdetail', Object.assign({ m_attributesetinstance_id: dl.pcAsi != null ? dl.pcAsi : (dl.m_attributesetinstance_id || 0), c_acctschema_id: as.c_acctschema_id }, dl.cdKey || { m_inoutline_id: dl.id }))[0];   // dl.cdKey = the where clause of getProductCosts(as, org, zeroOK, "M_MovementLine_ID=? AND IsSOTrx='N'") :791-808
      if (cd) { var amt = D(cd.amt), pcost = pc(cd); if (amt.signum() !== 0 && pcost.signum() !== 0 && amt.signum() !== pcost.signum()) return amt.signum() > 0 ? pcost.negate() : pcost; return pcost; }
    }
    return pc(null);
  }
  // Doc_InOut.findReversalCostDetailAmt :1128-1139 - the Amt of the ORIGINAL line's cost detail for this instance (schema + ASI + M_InOutLine + product); null when there is none
  function findReversalCostDetailAmt(trx, as, productId, ma, reversalLineId) {
    var cd = trx.find('m_costdetail', { c_acctschema_id: as.c_acctschema_id, m_attributesetinstance_id: ma.m_attributesetinstance_id || 0, m_inoutline_id: reversalLineId, m_product_id: productId })[0];
    return cd && LBL_BREAK !== 'nofind' ? D(cd.amt) : null;
  }
  // Doc_InOut — loadDocumentDetails :84-113, loadLines :121-153, createFacts :185-1120 (MMS-SO, MMR-PO ported; MMR-SO / MMS-PO named)
  function Doc_InOut(trx, io, as, F) {
    var dt = T.dt(trx, docTypeIdOf(trx, 'm_inout', io)), so = Y(io.issotrx),   /* Doc.getC_DocType_ID :1911-1925 */ dbt = dt.docbasetype, M = mc();
    var ctx = Doc(trx, 'm_inout', io, { dateDoc: io.movementdate });
    var lines = trx.find('m_inoutline', { m_inout_id: io.m_inout_id }, ['line']).filter(function (l) { return !(Y(l.isdescription) || !nz(l.m_product_id) || D(l.movementqty).signum() === 0); })
      .map(function (l) { var dl = DocLine(trx, 'm_inoutline', l); dl.qty = dbt === 'MMS' ? D(l.movementqty).negate() : D(l.movementqty); dl.pcQty = D(l.movementqty); dl.reversalLine_ID = l.reversalline_id; return dl; });   // setQty(Qty, isShipment)
    var revId = nz(io.reversal_id) ? io.reversal_id : 0;
    function isReversalLine(l) { return !!revId && nz(l.reversalLine_ID) !== 0; }               // Doc_InOut.isReversal(line) :1143-1145
    // :389/:417 `line.get_ID() > line.getReversalLine_ID()` (a line created in this Trx is '#new:i' — later than every stored id)
    function laterThan(a, b) { var na = ML.isNewId(a) ? 1e15 + Number(String(a).slice(5)) : Number(a), nb = ML.isNewId(b) ? 1e15 + Number(String(b).slice(5)) : Number(b); return na > nb; }
    if (dbt === 'MMS' && so) {                                                               // *** Sales - Shipment :198-450
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i], p = T.product(trx, line.m_product_id), costs = null, mas = null, batchLot = M.costingLevel(trx, p, as) === 'B', rev = isReversalLine(line);
        if (!rev) {                                                                            // :206-265
          if (batchLot && !nz(line.m_attributesetinstance_id)) {
            mas = trx.find('m_inoutlinema', { m_inoutline_id: line.id });
            if (mas.length) { costs = Z; mas.forEach(function (ma) { line.pcQty = D(ma.movementqty); line.pcAsi = ma.m_attributesetinstance_id; var c = lineProductCosts(trx, F, ctx, line, true, true); ma._cost = c; costs = costs.add(c); }); }
          } else costs = lineProductCosts(trx, F, ctx, line, true, true);
          if (costs == null || costs.signum() === 0) {
            if (T.isStocked(p)) {
              var cnt = trx.q("SELECT COUNT(*) AS n FROM m_costdetail WHERE m_product_id=? AND processed='Y' AND amt=0 AND qty>0 AND (c_orderline_id>0 OR c_invoiceline_id>0)", [p.m_product_id])[0];
              if (cnt && Number(cnt.n) > 0) costs = Z; else { F.err = 'No Costs for ' + p.name; return false; }
            } else continue;
          }
        } else {
          costs = Z;                                                                           // :266-270 "temp to avoid NPE"
          if (batchLot && !nz(line.m_attributesetinstance_id) && LBL_BREAK !== 'norevmas') mas = trx.find('m_inoutlinema', { m_inoutline_id: line.id });   // :330-338 the reversal line's own (negated) MA rows
        }
        var dr = createLine(F, ctx, line, productAcct(trx, line.m_product_id, 'p_cogs_acct', as), as.c_currency_id, costs, null);
        if (!dr) { F.err = 'FactLine DR not created: ' + line.id; return false; }
        dr.m_locator_id = line.m_locator_id; locFromLocator(trx, dr, line.m_locator_id, true); locFromBPartner(trx, dr, io.c_bpartner_location_id, false);
        var ool = nz(line.c_orderline_id) ? trx.get('c_orderline', line.c_orderline_id) : null; dr.ad_org_id = ool && Number(ool.ad_org_id) > 0 ? ool.ad_org_id : line.ad_org_id;   // getOrder_Org_ID
        dr.qty = N(line.qty.negate());
        if (rev && !updateReverseLine(F, dr, TABLE_ID.m_inout, revId, line.reversalLine_ID, 1)) {   // :288-301 Set AmtAcctDr from Original Shipment/Receipt
          if (!T.isStocked(p)) { removeLine(F, dr); continue; }                                 // ignore service
          F.err = 'Original Shipment/Receipt not posted yet'; return false;
        }
        var cr = createLine(F, ctx, line, productAcct(trx, line.m_product_id, 'p_asset_acct', as), as.c_currency_id, null, costs);
        if (!cr) { F.err = 'FactLine CR not created: ' + line.id; return false; }
        cr.m_locator_id = line.m_locator_id; locFromLocator(trx, cr, line.m_locator_id, true); locFromBPartner(trx, cr, io.c_bpartner_location_id, false);
        if (rev) {                                                                             // :317-327 Set AmtAcctCr from Original Shipment/Receipt
          if (!updateReverseLine(F, cr, TABLE_ID.m_inout, revId, line.reversalLine_ID, 1, dr)) { F.err = 'Original Shipment/Receipt not posted yet'; return false; }
          costs = acctBalance(cr);                                                             // get original cost
        }
        var refCd = 0;                                                                         // :389-395 / :417-423 Ref_CostDetail_ID = the original line's shipment detail
        if (nz(line.reversalLine_ID) && laterThan(line.id, line.reversalLine_ID)) { var ocd = M.getShipment(trx, as, line.m_product_id, line.m_attributesetinstance_id || 0, line.reversalLine_ID, 0); if (ocd) refCd = ocd.m_costdetail_id; }
        if (batchLot && !nz(line.m_attributesetinstance_id) && mas && mas.length) {
          for (var j = 0; j < mas.length; j++) { var ma = mas[j], q = D(ma.movementqty); if (q.signum() !== line.qty.signum()) q = q.negate();
            var amt = ma._cost;                                                                // batchLotCostMap.get(ma) (non-reversal lines only)
            if (amt == null && rev) { amt = findReversalCostDetailAmt(trx, as, line.m_product_id, ma, line.reversalLine_ID); if (amt != null) amt = amt.negate(); }   // :342-348
            if (amt == null) amt = costs.divide(line.pcQty, costs.scale(), HU).multiply(q);
            else if (!rev && line.pcQty.signum() !== line.qty.signum() && amt.signum() !== costs.signum() * -1) amt = amt.negate();   // :357-363
            var refMa = 0; if (nz(line.reversalLine_ID) && laterThan(line.id, line.reversalLine_ID)) { var ocdMa = M.getShipment(trx, as, line.m_product_id, ma.m_attributesetinstance_id || 0, line.reversalLine_ID, 0); if (ocdMa) refMa = ocdMa.m_costdetail_id; }   // :363-370 per-MA Ref_CostDetail_ID
            if (!M.createShipment(trx, as, line.ad_org_id, line.m_product_id, ma.m_attributesetinstance_id, line.id, 0, amt, q, line.description, true, line.dateAcct || ctx.dateAcct, refMa)) { F.err = 'Failed to create cost detail record'; return false; } }
        } else {
          var amt2 = costs; if (line.pcQty.signum() !== line.qty.signum() && !rev) amt2 = amt2.negate();   // :386-387 / :414-415 (not for a reversal)
          if (!M.createShipment(trx, as, line.ad_org_id, line.m_product_id, line.m_attributesetinstance_id || 0, line.id, 0, amt2, line.qty, line.description, true, line.dateAcct || ctx.dateAcct, refCd)) { F.err = 'Failed to create cost detail record'; return false; }
        }
      }
      if (Y(as.isaccrual) && Y(as.iscreatesocommitment)) trx.say('§MODEL-UNPORTED-DEP Doc_Order.getCommitmentSalesRelease (Doc_InOut.java:440) — SO commitment accounting');
      return true;
    }
    if (dbt === 'MMR' && !so) {                                                              // *** Purchasing - Receipt :676-920
      for (var k = 0; k < lines.length; k++) {
        var ln = lines[k], C_Currency_ID = as.c_currency_id, pr = T.product(trx, ln.m_product_id), ol = null, landedCost = Z, cm = M.costingMethod(trx, pr, as), cst = null;
        if (nz(ln.c_orderline_id)) {
          ol = trx.get('c_orderline', ln.c_orderline_id);
          trx.find('c_orderlandedcostallocation', { c_orderline_id: ln.c_orderline_id }).forEach(function (al) { landedCost = landedCost.add(D(al.amt).multiply(ln.qty).divide(D(al.qty), Math.max(D(al.amt).multiply(ln.qty).scale(), 0), HU)); });
        }
        if (cm === 'A' || cm === 'I' || cm === 'p' || (cm === 'S' && M.costingLevel(trx, pr, as) === 'B')) {
          if (ol) {
            C_Currency_ID = ol.c_currency_id; cst = D(ol.pricecost);
            if (cst.signum() === 0) {
              cst = D(ol.priceactual);
              var oh = trx.get('c_order', ol.c_order_id), pl = oh ? (trx.get('m_pricelist', oh.m_pricelist_id) || {}) : {}, tax = nz(ol.c_tax_id) ? T.tax(trx, ol.c_tax_id) : null;
              if (Y(pl.istaxincluded) && tax) {                                               // Goodwill: correct included tax :724-760
                if (D(tax.rate).signum() !== 0) { var sp = T.precisionOf(trx, C_Currency_ID), costTax = T.calcTax(trx, tax, cst, true, sp);
                  if (Y(tax.issummary)) { var base = cst.subtract(costTax); trx.find('c_tax', { parent_tax_id: tax.c_tax_id }).filter(function (c) { return !Y(c.isdistributetaxwithlineitem); }).forEach(function (c) { cst = cst.subtract(T.calcTax(trx, c, base, false, sp)); }); }
                  else if (!Y(tax.isdistributetaxwithlineitem)) cst = cst.subtract(costTax); }
              } else if (tax) {
                if (Y(tax.issummary)) { var b2 = cst; trx.find('c_tax', { parent_tax_id: tax.c_tax_id }).forEach(function (c) { if (Y(c.isdistributetaxwithlineitem)) cst = cst.add(T.calcTax(trx, c, b2, false, 12)); }); }
                else if (Y(tax.isdistributetaxwithlineitem)) cst = cst.add(T.calcTax(trx, tax, cst, false, 12));
              }
            }
            cst = cst.multiply(ln.qty);
          } else { F.err = 'Resubmit - No Costs for ' + pr.name + ' (required order line)'; return false; }
        } else cst = lineProductCosts(trx, F, ctx, ln, false, false);
        if (cst == null || cst.signum() === 0) { if (ol && D(ol.priceactual).signum() === 0) cst = Z; else { F.err = 'Resubmit - No Costs for ' + pr.name; return false; } }
        var assets = productAcct(trx, ln.m_product_id, 'p_asset_acct', as);
        if (isService(pr)) assets = nz(ol && ol.pp_cost_collector_id) ? productAcct(trx, ln.m_product_id, 'p_wip_acct', as) : productAcct(trx, ln.m_product_id, 'p_expense_acct', as);
        var drAsset = cst; if (landedCost.signum() !== 0 && (cm === 'I' || cm === 'A')) drAsset = drAsset.add(landedCost);
        var d1 = createLine(F, ctx, ln, assets, C_Currency_ID, drAsset, null);
        if (!d1) { F.err = 'DR not created: ' + ln.id; return false; }
        d1.m_locator_id = ln.m_locator_id; locFromBPartner(trx, d1, io.c_bpartner_location_id, true); locFromLocator(trx, d1, ln.m_locator_id, false);
        var c1 = createLine(F, ctx, ln, ACCT.nir(trx, io.c_bpartner_id, as.c_acctschema_id), C_Currency_ID, null, cst);
        if (!c1) { F.err = 'CR not created: ' + ln.id; return false; }
        c1.m_locator_id = ln.m_locator_id; locFromBPartner(trx, c1, io.c_bpartner_location_id, true); locFromLocator(trx, c1, ln.m_locator_id, false); c1.qty = N(ln.qty.negate());
        if (landedCost.signum() !== 0 && !isBalancedAcct(F)) {
          var c2 = createLine(F, ctx, ln, productAcct(trx, ln.m_product_id, 'p_landedcostclearing_acct', as), C_Currency_ID, null, landedCost);
          if (!c2) { F.err = 'CR not created: ' + ln.id; return false; }
          c2.m_locator_id = ln.m_locator_id; locFromBPartner(trx, c2, io.c_bpartner_location_id, true); locFromLocator(trx, c2, ln.m_locator_id, false); c2.qty = N(ln.qty.negate());
        }
      }
      return true;
    }
    if (dbt === 'MMR' && so) {                                                               // *** Sales - Return :451-675 (SQLiteIDEMPIERE.md §POSTING-PARITY 5a-port)
      var MMR_BRK = (typeof process !== 'undefined' && process.env && process.env.LMV_BREAK) || '', MMR_SWAP = MMR_BRK === 'mmrswap', MMR_STOCKFLIP = MMR_BRK === 'mmrstocked';   // witness negative controls only (W-RMA-WINDOW-PATH RW-BOOKS-*)
      for (var r = 0; r < lines.length; r++) {
        var rl = lines[r], rp = T.product(trx, rl.m_product_id), rcosts = null, rmas = null, rBatch = M.costingLevel(trx, rp, as) === 'B', rrev = isReversalLine(rl), rMap = false;
        if (!rrev) {                                                                           // :459-503
          if (rBatch && !nz(rl.m_attributesetinstance_id)) {
            rmas = trx.find('m_inoutlinema', { m_inoutline_id: rl.id }); rcosts = Z;
            if (rmas.length) { rMap = true; rmas.forEach(function (ma) { rl.pcQty = D(ma.movementqty); rl.pcAsi = ma.m_attributesetinstance_id; var c = lineProductCosts(trx, F, ctx, rl, true, true); ma._cost = c; rcosts = rcosts.add(c); }); }
          } else rcosts = lineProductCosts(trx, F, ctx, rl, true, true);
          if (rcosts == null || rcosts.signum() === 0) {                                        // :492-503 zero costs: stocked -> error (no zero-cost-detail exemption here), service -> ignore
            if (T.isStocked(rp) !== MMR_STOCKFLIP) { F.err = 'No Costs for ' + rp.name; return false; }
            continue;
          }
        } else {
          rcosts = Z;                                                                          // :505-508
          if (rBatch && !nz(rl.m_attributesetinstance_id)) rmas = trx.find('m_inoutlinema', { m_inoutline_id: rl.id });
        }
        var rdr = createLine(F, ctx, rl, productAcct(trx, rl.m_product_id, MMR_SWAP ? 'p_cogs_acct' : 'p_asset_acct', as), as.c_currency_id, rcosts, null);   // :510-512 DR P_Asset
        if (!rdr) { F.err = 'FactLine DR not created: ' + rl.id; return false; }
        rdr.m_locator_id = rl.m_locator_id; locFromLocator(trx, rdr, rl.m_locator_id, true); locFromBPartner(trx, rdr, io.c_bpartner_location_id, false);   // :519-521
        if (rrev) {                                                                            // :522-537
          if (!updateReverseLine(F, rdr, TABLE_ID.m_inout, revId, rl.reversalLine_ID, 1)) {
            if (!T.isStocked(rp)) { removeLine(F, rdr); continue; }
            F.err = 'Original Shipment/Receipt not posted yet'; return false;
          }
          rcosts = acctBalance(rdr);                                                           // :536 get original cost
        }
        var rRef = 0; if (nz(rl.reversalLine_ID) && laterThan(rl.id, rl.reversalLine_ID)) { var rocd = M.getShipment(trx, as, rl.m_product_id, rl.m_attributesetinstance_id || 0, rl.reversalLine_ID, 0); if (rocd) rRef = rocd.m_costdetail_id; }
        if (rBatch && !nz(rl.m_attributesetinstance_id)) {                                     // :538-596
          if (rmas && rmas.length) for (var rj = 0; rj < rmas.length; rj++) { var rma = rmas[rj], rq = D(rma.movementqty); if (rq.signum() !== rl.qty.signum()) rq = rq.negate();
            var ramt = rMap ? rma._cost : null;
            if (ramt == null && rrev) { ramt = findReversalCostDetailAmt(trx, as, rl.m_product_id, rma, rl.reversalLine_ID); if (ramt != null) ramt = ramt.negate(); }
            if (ramt == null) ramt = rcosts.divide(rl.pcQty, rcosts.scale(), HU).multiply(rq);
            else if (!rrev && rl.pcQty.signum() !== rl.qty.signum() && ramt.signum() !== rcosts.signum() * -1) ramt = ramt.negate();
            var rRefMa = 0; if (nz(rl.reversalLine_ID) && laterThan(rl.id, rl.reversalLine_ID)) { var rocm = M.getShipment(trx, as, rl.m_product_id, rma.m_attributesetinstance_id || 0, rl.reversalLine_ID, 0); if (rocm) rRefMa = rocm.m_costdetail_id; }
            if (!M.createShipment(trx, as, rl.ad_org_id, rl.m_product_id, rma.m_attributesetinstance_id, rl.id, 0, ramt, rq, rl.description, true, rl.dateAcct || ctx.dateAcct, rRefMa)) { F.err = 'Failed to create cost detail record'; return false; } }
        } else if (nz(rl.m_product_id)) {                                                      // :597-640
          var ramt2 = rcosts; if (rl.pcQty.signum() !== rl.qty.signum() && !rrev) ramt2 = ramt2.negate();
          if (!M.createShipment(trx, as, rl.ad_org_id, rl.m_product_id, rl.m_attributesetinstance_id || 0, rl.id, 0, ramt2, rl.qty, rl.description, true, rl.dateAcct || ctx.dateAcct, rRef)) { F.err = 'Failed to create cost detail record'; return false; }
        }
        var rcr = createLine(F, ctx, rl, productAcct(trx, rl.m_product_id, MMR_SWAP ? 'p_asset_acct' : 'p_cogs_acct', as), as.c_currency_id, null, rcosts);   // :642-644 CR P_Cogs
        if (!rcr) { F.err = 'FactLine CR not created: ' + rl.id; return false; }
        rcr.m_locator_id = rl.m_locator_id; locFromLocator(trx, rcr, rl.m_locator_id, true); locFromBPartner(trx, rcr, io.c_bpartner_location_id, false);
        var rool = nz(rl.c_orderline_id) ? trx.get('c_orderline', rl.c_orderline_id) : null; rcr.ad_org_id = rool && Number(rool.ad_org_id) > 0 ? rool.ad_org_id : rl.ad_org_id;   // :654 Revenue X-Org (getOrder_Org_ID)
        rcr.qty = N(rl.qty.negate());                                                          // :655
        if (rrev && !updateReverseLine(F, rcr, TABLE_ID.m_inout, revId, rl.reversalLine_ID, 1, rdr)) { F.err = 'Original Shipment/Receipt not posted yet'; return false; }   // :656-664
      }
      return true;
    }
    F.err = 'Doc_InOut ' + dbt + (so ? ' SO' : ' PO (vendor return :922-1120)') + ' — §MODEL-UNPORTED-DEP not ported in this pass'; return false;
  }
  function isBalancedAcct(F) { var s = Z; F.lines.forEach(function (l) { s = s.add(D(l.amtacctdr)).subtract(D(l.amtacctcr)); }); return s.signum() === 0; }

  // Doc_Invoice.createFacts DOCTYPE_APInvoice (Doc_Invoice.java:605-775), W-POST-INVOICE (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §46): TaxCredit DR per tax; per line DR Product InventoryClearing (an item) /
  //   Product or Charge Expense (other), amount = LineNetAmt, Qty = +QtyInvoiced (DocLine.setQty, not a sales trx); Vendor Liability CR GrandTotal; locations from BPartner to Org; updateProductPO (:1534-1569).
  //   NAMED, never faked: tax-included invoices, summary / sales-expense taxes, header charge, reversals (updateReverseLine), landed cost (:landedCost), trade-discount posting and service-product cost details (MCostDetail.createInvoice).
  function Doc_InvoiceAPI(trx, inv, as, F, dt, base, hasDesc) {
    var cm = dt.docbasetype === 'APC', cur = inv.c_currency_id, sch = as.c_acctschema_id, named = function (m) { F.err = m + ' — named'; return false; };
    if (Y(inv.istaxincluded)) return named((cm ? 'APC ' : 'API ')+'tax-included invoice not ported (loadLines :213-300)');
    if (nz(inv.reversal_id)) return named((cm ? 'APC ' : 'API ')+'invoice reversal not ported (updateReverseLine)');
    if (nz(inv.chargeamt) && D(inv.chargeamt).signum() !== 0) return named((cm ? 'APC ' : 'API ')+'header charge not ported');
    if (Y(as.istradediscountposted)) return named((cm ? 'APC ' : 'API ')+'trade-discount posting not ported');
    var taxes = trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }), i;
    for (i = 0; i < taxes.length; i++) { var tx = trx.get('c_tax', taxes[i].c_tax_id); if (tx && (Y(tx.issummary) || Y(tx.issalestax))) return named((cm ? 'APC ' : 'API ')+'summary / sales-expense tax not ported'); }
    taxes.forEach(function (t) { F.line(ACCT.taxCredit(trx, t.c_tax_id, sch), cur, cm ? null : t.taxamt, cm ? t.taxamt : null, Object.assign({ c_tax_id: t.c_tax_id, qty: 0 }, base)); });   // APC: the same account on the CR side (:775-)
    var lines = trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }, ['line']).filter(function (l) { return !Y(l.isdescription); });
    for (i = 0; i < lines.length; i++) {
      var l = lines[i], prod = nz(l.m_product_id) ? T.product(trx, l.m_product_id) : null, item = !!prod && T.isItem(prod), acct;
      var lc = []; try { lc = trx.q('SELECT 1 AS x FROM c_landedcost WHERE c_invoiceline_id=?', [l.c_invoiceline_id]); } catch (e) { lc = []; }
      if (lc.length) return named((cm ? 'APC ' : 'API ')+'landed cost not ported');
      if (prod && !item) return named((cm ? 'APC ' : 'API ')+'service-product line (MCostDetail.createInvoice) not ported');
      if (item) acct = ACCT.inventoryClearing(trx, l.m_product_id, sch);
      else if (nz(l.c_charge_id)) acct = ACCT.chargeExpense(trx, l.c_charge_id, sch);
      else acct = ACCT.expense(trx, l.m_product_id, sch);
      F.line(acct, cur, cm ? null : l.linenetamt, cm ? l.linenetamt : null, Object.assign({}, base, { line_id: l.c_invoiceline_id, m_product_id: l.m_product_id, c_uom_id: l.c_uom_id, c_tax_id: l.c_tax_id, qty: N(cm ? D(l.qtyinvoiced).negate() : D(l.qtyinvoiced)),   // DocLine.setQty: credit memo negates, then a purchase keeps the sign
        description: inv.documentno + ' #' + l.line + (hasDesc(l.description) ? ' (' + l.description + ')' : hasDesc(inv.description) ? ' (' + inv.description + ')' : '') }));
    }
    var gross = D(inv.grandtotal), liab = ACCT.liability(trx, inv.c_bpartner_id, sch);          // payables == payablesServices (Doc_Invoice :713-718): the whole GrandTotal on one account
    var crSide = !cm;                                                                          // APC: Liability DR (:~875) instead of CR
    if (gross.signum() > 0) F.line(liab, cur, crSide ? null : gross, crSide ? gross : null, Object.assign({ qty: 0 }, base)); else if (gross.signum() < 0) F.line(liab, cur, crSide ? gross.negate() : null, crSide ? null : gross.negate(), Object.assign({ qty: 0 }, base));
    F.lines.forEach(function (f) { f.c_locfrom_id = locOfBP(trx, inv.c_bpartner_location_id); f.c_locto_id = locOfOrg(trx, f.ad_org_id); });   // setLocationFromBPartner(true) / setLocationFromOrg(false)
    var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [inv.ad_client_id])[0];
    if (!cm && ci && String(ci.a) === String(sch)) updateProductPO(trx, inv, lines);                   // updateProductPO :1534: only the client's FIRST schema
    return !F.err;
  }
  // Doc_Invoice.updateProductPO: M_Product_PO.PriceLastInv = the invoice's first line price per (product, vendor), converted to the PO's currency on the invoice date
  function updateProductPO(trx, inv, lines) {
    var seen = {};
    lines.forEach(function (l) { if (!nz(l.m_product_id) || seen[l.m_product_id]) return; seen[l.m_product_id] = 1;
      trx.find('m_product_po', { m_product_id: l.m_product_id, c_bpartner_id: inv.c_bpartner_id }).forEach(function (po) {
        var first = lines.filter(function (x) { return String(x.m_product_id) === String(l.m_product_id); }).sort(function (a, b) { return Number(a.c_invoiceline_id) - Number(b.c_invoiceline_id); })[0], px = D(first.priceactual);
        if (nz(po.c_currency_id) && String(po.c_currency_id) !== String(inv.c_currency_id)) { var r = rate(trx, inv.c_currency_id, po.c_currency_id, inv.dateinvoiced, inv.c_conversiontype_id); if (!r) return; px = px.multiply(r).setScale(T.precisionOf(trx, po.c_currency_id), HU); }
        trx.update('m_product_po', po, { pricelastinv: N(px) });
      }); });
  }

  // Doc_MatchInv.createFacts (Doc_MatchInv.java:145-430) ∘ processInvoicePriceVariance (:433-640) ∘ createMatchInvCostDetail (:642-760), W-POST-MATCHINV (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §48).
  //   DR NotInvoicedReceipts (BP group) copied from the receipt's posted fact; CR InventoryClearing (service: Expense) copied from the invoice's posted fact; IPV = the difference, booked per costing method.
  //   NAMED, never faked: reversal match, foreign-currency invoice WHEN gain/loss or rounding corrections would add lines (fxNoCorrection decides), cash-basis schema, credit-memo match, shipment match, PO commitment release, tax-included / distributed-tax and landed-cost cost-detail branches.
  function Doc_MatchInv(trx, mi, as, F) {
    var named = function (m) { F.err = m + ' - named'; return false; }, M = mc();
    var il = nz(mi.c_invoiceline_id) ? trx.get('c_invoiceline', mi.c_invoiceline_id) : null, rl = nz(mi.m_inoutline_id) ? trx.get('m_inoutline', mi.m_inoutline_id) : null, qty = D(mi.qty);
    if (!il) return named('MatchInv without an invoice line');
    var inv = trx.get('c_invoice', il.c_invoice_id), ctx = Doc(trx, 'm_matchinv', mi, { dateDoc: mi.datetrx, qty: qty, c_bpartner_id: inv.c_bpartner_id, c_currency_id: as.c_currency_id });
    if (!nz(mi.m_product_id) || qty.signum() === 0 || (rl && D(rl.movementqty).signum() === 0)) return true;               // :166-173 nothing to do
    if (!rl) { var idt = T.dt(trx, inv.c_doctype_id).docbasetype; if (idt === 'APC' || idt === 'ARC') return named('MatchInv credit memo (createCreditMemoFacts) not ported'); return true; }
    var rio = trx.get('m_inout', rl.m_inout_id), rdt = T.dt(trx, rio.c_doctype_id);
    if (rdt.docbasetype === 'MMS') return named('MatchInv shipment match (createMatShipmentFacts) not ported');
    if (nz(mi.reversal_id)) return named('MatchInv reversal not ported');
    var fx = String(inv.c_currency_id) !== String(as.c_currency_id);
    if (!Y(as.isaccrual)) return named('MatchInv cash-basis schema not ported');
    if (Y(as.iscreatepocommitment)) return named('MatchInv PO commitment release (Doc_Order.getCommitmentRelease) not ported');
    var prod = T.product(trx, mi.m_product_id), service = isService(prod), cur = as.c_currency_id;
    var mult = qty.divide(D(rl.movementqty), 12, HU);
    var dr = createLine(F, ctx, null, ACCT.nir(trx, inv.c_bpartner_id, as.c_acctschema_id), cur, D(1), null);                // NotInvoicedReceipts DR (amount 1, replaced by the receipt's posted line)
    if (!dr) { F.err = F.err || 'No Product Costs'; return false; }
    dr.qty = N(qty);
    if (!updateReverseLine(F, dr, TABLE_ID.m_inout, rl.m_inout_id, rl.m_inoutline_id, mult)) { F.err = 'Mat.Receipt not posted yet'; return false; }
    var expense = service ? productAcct(trx, mi.m_product_id, 'p_expense_acct', as) : productAcct(trx, mi.m_product_id, 'p_inventoryclearing_acct', as);
    var lineNet = D(il.linenetamt), mult2 = qty.divide(D(il.qtyinvoiced), 12, HU);
    if (mult2.compareTo(D(1)) !== 0) lineNet = lineNet.multiply(mult2);
    if (service) lineNet = acctBalance(dr);                                                                                    // book out the exact receipt amount
    var cr = createLine(F, ctx, null, expense, cur, null, lineNet);
    if (!cr) { cr = createLine(F, ctx, null, expense, cur, null, D(1)); if (cr) { cr.amtacctcr = 0; cr.amtsourcecr = 0; } else { F.err = F.err || 'InventoryClearing line not created'; return false; } }
    cr.qty = N(qty.negate());
    if (!updateReverseLine(F, cr, TABLE_ID.c_invoice, il.c_invoice_id, il.c_invoiceline_id, mult2)) { F.err = 'Invoice not posted yet'; return false; }
    ['c_activity_id', 'c_campaign_id', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_uom_id', 'c_charge_id', 'a_asset_id', 'user1_id', 'user2_id', 'c_costcenter_id', 'c_department_id', 'm_attributesetinstance_id']
      .forEach(function (c) { cr[c] = nz(il[c]) ? il[c] : null; });
    var el = trx.q("SELECT isbalanced AS b FROM c_acctschema_element WHERE c_acctschema_id=? AND elementtype='OO'", [as.c_acctschema_id])[0], interOrg = !!el && Y(el.b) && String(rl.ad_org_id) !== String(il.ad_org_id);
    if (!Y(as.ispostifclearingequal) && dr.account_id === cr.account_id && !interOrg && D(dr.amtsourcedr).compareTo(D(cr.amtsourcecr)) === 0) { removeLine(F, dr); removeLine(F, cr); }   // :388-401
    if (fx && !fxNoCorrection(trx, as, dr, cr, rl, il, mi)) return named('MatchInv foreign-currency gain/loss or rounding correction (createReceiptGainLoss / createInvoiceGainLoss / *RoundingCorrection) not ported');
    var ipv = acctBalance(cr).add(acctBalance(dr)).negate();                                                                   // :404
    if (ipv.signum() !== 0 && !invoicePriceVariance(trx, F, as, mi, il, rl, ctx, prod, service, ipv, qty)) return false;
    return costDetailInvoice(trx, F, as, mi, il, rl, inv, qty, M);
  }
  // Foreign-currency invoice: Java adds gain/loss + rounding-correction lines (createReceiptGainLoss :2282, createInvoiceGainLoss :1466, *RoundingCorrection :1592/:2398). Ported here is only the DECISION whether they add anything:
  //   a "full" source match with a non-zero accounted difference (receipt NIR account / invoice clearing account) books gain/loss lines; a line matched by more than one M_MatchInv is where the rounding corrections act.
  //   Either => false (the caller refuses by name); otherwise Java books nothing extra and the base path is the whole posting.
  function fxNoCorrection(trx, as, dr, cr, rl, il, mi) {
    function sums(tid, rec, acct) { var rows = trx.find('fact_acct', { c_acctschema_id: as.c_acctschema_id, ad_table_id: tid, record_id: rec, account_id: acct, postingtype: 'A' }); if (!rows.length) return null;
      var s = { sd: Z, ad: Z, sc: Z, ac: Z }; rows.forEach(function (f) { s.sd = s.sd.add(D(f.amtsourcedr)); s.ad = s.ad.add(D(f.amtacctdr)); s.sc = s.sc.add(D(f.amtsourcecr)); s.ac = s.ac.add(D(f.amtacctcr)); });
      return s.sd.signum() === 0 && s.ad.signum() === 0 ? { src: s.sc, acct: s.ac } : { src: s.sd, acct: s.ad }; }
    var r = sums(TABLE_ID.m_inout, rl.m_inout_id, dr.account_id), i = sums(TABLE_ID.c_invoice, il.c_invoice_id, cr.account_id);
    if (r && D(dr.amtsourcedr).compareTo(r.src) === 0 && D(dr.amtacctdr).abs().subtract(r.acct.abs()).signum() !== 0) return false;
    if (i && D(cr.amtsourcecr).compareTo(i.src) === 0 && D(cr.amtacctcr).abs().subtract(i.acct.abs()).signum() !== 0) return false;
    return trx.find('m_matchinv', { m_inoutline_id: rl.m_inoutline_id }).length <= 1 && trx.find('m_matchinv', { c_invoiceline_id: il.c_invoiceline_id }).length <= 1;
  }
  // processInvoicePriceVariance :433-640 (the non-reversal path)
  function invoicePriceVariance(trx, F, as, mi, il, rl, ctx, prod, service, ipv, qty) {
    var M = mc(), method = M.costingMethod(trx, prod, as), amtVariance = Z, amtAsset = Z, stock = false, cur = as.c_currency_id;
    if (method === 'A' && nz(il.m_product_id)) {                                                                                // AveragePO: stock coverage
      stock = true;
      var org = rl.ad_org_id, asi = mi.m_attributesetinstance_id || 0, lvl = as.costinglevel;
      if (lvl === 'C') { org = 0; asi = 0; } else if (lvl === 'O') asi = 0; else if (lvl === 'B') org = 0;
      var ce = M.getMaterialCostElement(trx, as, method), cd = M.getMatchInvoice(trx, as, mi.m_product_id, asi, mi.m_matchinv_id, 0), qtyCost;
      if (cd) qtyCost = D(cd.currentqty);
      else { var c = M.getCostInfo(trx, org, il.m_product_id, as.m_costtype_id, as.c_acctschema_id, ce.m_costelement_id, asi, ctx.dateAcct, null); qtyCost = c ? D(c.currentqty) : Z; }
      if (qtyCost.compareTo(qty) < 0) { amtAsset = qtyCost.multiply(ipv).divide(qty, M.costingPrecision(trx, as), HU); amtVariance = ipv.subtract(amtAsset); } else amtAsset = ipv;
    }
    var sp = trx.setSavepoint(), zeroQty = false;                                                                               // Trx savepoint around createMatchInvoice
    try { if (!M.createMatchInvoice(trx, as, il.ad_org_id, il.m_product_id, il.m_attributesetinstance_id || 0, mi.m_matchinv_id, 0, stock ? amtAsset : ipv, Z, 'Invoice Price Variance', ctx.dateAcct, 0)) { F.err = 'Failed to create cost detail record'; return false; } }
    catch (e) { if (e && e.jclass && /AverageCostingZeroQtyException/.test(e.jclass)) { zeroQty = true; trx.rollbackTo(sp); } else throw e; }
    var account = service ? productAcct(trx, mi.m_product_id, 'p_expense_acct', as) : productAcct(trx, mi.m_product_id, 'p_asset_acct', as);
    function book(acct, amt) {                                                                                                  // Fact.createLine(null, acct, cur, Balance): >= 0 DR, < 0 CR
      var f = createLine(F, ctx, null, acct, cur, amt.signum() >= 0 ? amt : null, amt.signum() < 0 ? amt.negate() : null); if (!f) return null;
      ['c_activity_id', 'c_campaign_id', 'c_project_id', 'c_projectphase_id', 'c_projecttask_id', 'c_uom_id', 'c_charge_id', 'a_asset_id', 'user1_id', 'user2_id', 'm_product_id', 'c_costcenter_id', 'c_department_id', 'm_attributesetinstance_id']
        .forEach(function (c) { f[c] = nz(il[c]) ? il[c] : null; }); f.qty = N(ctx.qty); return f; }                           // updateFactLine :655-671
    if (method === 'A') {
      if (amtVariance.signum() !== 0) book(productAcct(trx, mi.m_product_id, 'p_averagecostvariance_acct', as), amtVariance);
      if (amtAsset.signum() !== 0) book(account, amtAsset);
    } else if (method === 'I') { if (!zeroQty) book(account, ipv); }
    else book(productAcct(trx, mi.m_product_id, 'p_invoicepricevariance_acct', as), ipv);                                       // standard: the IPV account
    return !F.err;
  }
  // createMatchInvCostDetail :642-760 -> MCostDetail.createInvoice (the invoice-line cost detail by the matched total); plain-tax path only
  function costDetailInvoice(trx, F, as, mi, il, rl, inv, qty, M) {
    var tax = nz(il.c_tax_id) ? trx.get('c_tax', il.c_tax_id) : null;
    if (Y(inv.istaxincluded) || (tax && (Y(tax.issummary) || Y(tax.isdistributetaxwithlineitem)))) { F.err = 'MatchInv cost detail with included / distributed tax not ported - named'; return false; }
    var lc = []; try { lc = trx.q('SELECT 1 AS x FROM c_orderlandedcostallocation WHERE c_orderline_id=?', [rl.c_orderline_id || 0]); } catch (e) { lc = []; }
    if (lc.length) { F.err = 'MatchInv landed-cost allocation not ported - named'; return false; }
    var lineNet = D(il.linenetamt), mult = qty.divide(D(il.qtyinvoiced), 12, HU); if (mult.compareTo(D(1)) !== 0) lineNet = lineNet.multiply(mult);
    var tQty = Z, tAmt = Z;
    trx.find('m_matchinv', { c_invoiceline_id: il.c_invoiceline_id }).forEach(function (m) {
      if (Y(m.posted) && String(m.m_matchinv_id) !== String(mi.m_matchinv_id) && String(m.m_attributesetinstance_id || 0) === String(mi.m_attributesetinstance_id || 0) && String(m.dateacct).slice(0, 10) === String(mi.dateacct).slice(0, 10)) {
        tQty = tQty.add(D(m.qty)); tAmt = tAmt.add(D(il.linenetamt).multiply(D(m.qty).divide(D(il.qtyinvoiced), 12, HU))); } });
    tAmt = tAmt.add(lineNet);
    var rio = trx.get('m_inout', rl.m_inout_id); tQty = tQty.add(rio.movementtype === 'V-' ? qty.negate() : qty);               // vendor returns: negative qty
    if (!M.createInvoice(trx, as, mi.ad_org_id, mi.m_product_id, mi.m_attributesetinstance_id || 0, il.c_invoiceline_id, 0, tAmt, tQty, mi.description, mi.dateacct, 0)) { F.err = 'Failed to create cost detail record'; return false; }
    return !F.err;
  }

  // Doc_MatchPO (Doc_MatchPO.java:94-560), W-POST-MATCHPO (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §53). loadDocumentDetails: no receipt line -> look for one through the not-matched M_MatchPO of the
  //   same order line (MatchPOAutoMatch.getNotMatchedMatchPOList :40-140) -> still none and no Ref_MatchPO => DEFERRED (Doc.post :614-618, Posted='d'). createFacts: MCostDetail.createOrder (:584-690)
  //   for every costing method; ONLY under Standard costing a PPV pair P_PPV / PPVOffset of (poCost x qty - standard costs). NAMED, never faked: reversal, landed cost, foreign currency, a
  //   tax-included / summary / distribute-with-line tax on the order line, credit-memo M_MatchPO in the not-matched list.
  function glAcct(trx, col, schema) { var r = trx.q('SELECT ' + col + ' AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', [schema])[0]; if (!r || r.a == null) return null; var v = trx.q('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=?', [r.a])[0]; return v ? v.e : null; }
  function lineSigned(F, ctx, acct, cur, amt) { amt = D(amt); return amt.signum() < 0 ? createLine(F, ctx, null, acct, cur, null, amt.negate()) : createLine(F, ctx, null, acct, cur, amt, null); }   // Fact.createLine(dl, acct, cur, Amt)
  function docStatusOf(trx, table, id) { var h = trx.get(table, id); return h ? h.docstatus : null; }
  function matchPOInOutLine(trx, mp) {                                                        // loadDocumentDetails :115-196 - the receipt line this invoice-side match settles
    var named = null, mpos = trx.find('m_matchpo', { c_orderline_id: mp.c_orderline_id }), notMatched = [];
    mpos.forEach(function (m) {
      if (nz(m.reversal_id) || nz(m.ref_matchpo_id)) return;
      if (D(m.qty).signum() < 0 && nz(m.c_invoiceline_id) && !nz(m.m_inoutline_id)) { var il0 = trx.get('c_invoiceline', m.c_invoiceline_id), st0 = il0 ? docStatusOf(trx, 'c_invoice', il0.c_invoice_id) : null; if (st0 === 'CO' || st0 === 'CL') { named = 'Doc_MatchPO credit-memo match in getNotMatchedMatchPOList'; return; } }
      notMatched.push(m);
    });
    if (named) return { named: named };
    notMatched.sort(function (a, b) { return Number(a.m_matchpo_id) - Number(b.m_matchpo_id); });
    var noInvoice = [], noShip = [], postedNoShip = [];
    notMatched.forEach(function (m) {
      if (nz(m.m_inoutline_id) && !nz(m.c_invoiceline_id) && !nz(m.reversal_id)) { var iol = trx.get('m_inoutline', m.m_inoutline_id), st = iol ? docStatusOf(trx, 'm_inout', iol.m_inout_id) : null; if (st === 'CO' || st === 'CL') noInvoice.push(m); }
      else if (!nz(m.m_inoutline_id) && !nz(m.reversal_id)) { var il = trx.get('c_invoiceline', m.c_invoiceline_id), st2 = il ? docStatusOf(trx, 'c_invoice', il.c_invoice_id) : null;
        if (st2 === 'CO' || st2 === 'CL') (Y(m.posted) ? postedNoShip : noShip).push({ id: m.m_matchpo_id, q: D(m.qty) }); }
    });
    for (var i = 0; i < noInvoice.length; i++) {
      var qty = D(noInvoice[i].qty), found = 0;
      for (var a = 0; a < postedNoShip.length && qty.signum() !== 0; a++) { var h = postedNoShip[a]; if (h.q.compareTo(qty) >= 0) { h.q = h.q.subtract(qty); qty = Z; } else if (h.q.signum() > 0) { qty = qty.subtract(h.q); h.q = Z; } }
      if (qty.signum() === 0) continue;
      for (var b = 0; b < noShip.length; b++) { var g = noShip[b];
        if (g.q.compareTo(qty) >= 0) { g.q = g.q.subtract(qty); qty = Z; } else if (g.q.signum() > 0) { qty = qty.subtract(g.q); g.q = Z; }
        if (g.q.signum() === 0 && String(g.id) === String(mp.m_matchpo_id)) { found = noInvoice[i].m_inoutline_id; break; }
        if (qty.signum() === 0) break; }
      if (found) return { iol: found };
    }
    return { iol: 0 };
  }
  function Doc_MatchPO(trx, mp, as, F) {
    var named = function (m) { F.err = m + ' - named'; return false; }, M = mc(), qty = D(mp.qty);
    var iolId = nz(mp.m_inoutline_id) ? Number(mp.m_inoutline_id) : 0;
    if (!iolId) { var f = matchPOInOutLine(trx, mp); if (f.named) return named(f.named); iolId = f.iol; }
    if (!iolId && !nz(mp.ref_matchpo_id)) return 'DEFER';                                         // :198-202
    if (iolId && mp.posted === 'd') { var io0 = trx.get('m_inout', trx.get('m_inoutline', iolId).m_inout_id);   // :204-217 a deferred match takes the receipt's later DateAcct
      if (String(io0.dateacct).slice(0, 10) > String(mp.dateacct).slice(0, 10)) { trx.update('m_matchpo', mp, { dateacct: io0.dateacct, datetrx: io0.dateacct }); mp = trx.get('m_matchpo', mp.m_matchpo_id); } }
    var ol = trx.get('c_orderline', mp.c_orderline_id), ctx = Doc(trx, 'm_matchpo', mp, { dateDoc: mp.datetrx, qty: qty, c_currency_id: as.c_currency_id });
    if (!nz(mp.m_product_id) || qty.signum() === 0) return true;                                   // :247-254
    if (!iolId) {                                                                                  // :256-271
      trx.find('m_matchpo', { c_orderline_id: ol.c_orderline_id }).some(function (m) { if (nz(m.m_inoutline_id) && !nz(m.c_invoiceline_id)) { var l = trx.get('m_inoutline', m.m_inoutline_id), st = l ? docStatusOf(trx, 'm_inout', l.m_inout_id) : null;
        if ((st === 'CO' || st === 'CL') && D(m.qty).compareTo(qty) <= 0) { iolId = Number(m.m_inoutline_id); return true; } } return false; });
    }
    if (!iolId) { if (nz(mp.ref_matchpo_id)) return true; F.err = 'NoPostingIfNotMatchedToShipment'; return false; }   // :273-279
    if (nz(mp.reversal_id)) return named('Doc_MatchPO reversal (updateReverseLine) not ported');
    var lc = []; try { lc = trx.q('SELECT 1 AS x FROM c_orderlandedcostallocation WHERE c_orderline_id=?', [ol.c_orderline_id]); } catch (e) { lc = []; }
    if (lc.length) return named('Doc_MatchPO landed cost allocation not ported');
    var poCost = D(ol.pricecost || 0), tax = nz(ol.c_tax_id) ? trx.get('c_tax', ol.c_tax_id) : null, oh = trx.get('c_order', ol.c_order_id);
    if (poCost.signum() === 0) {                                                                   // :290-342
      poCost = D(ol.priceactual);
      if (tax && (Y(tax.issummary) || Y(tax.isdistributetaxwithlineitem) || (Y(oh.istaxincluded) && D(tax.rate).signum() !== 0))) return named('Doc_MatchPO tax-included / summary / distribute-with-line tax cost correction not ported');
    }
    var rl = trx.get('m_inoutline', iolId), io = trx.get('m_inout', rl.m_inout_id), isReturn = io.movementtype === 'V-';
    var prec = Number(as.costingprecision);
    if (String(ol.c_currency_id) !== String(as.c_currency_id)) {                                  // :383-399 Different currency: the order's rate on the receipt's DateAcct
      var fx = rate(trx, oh.c_currency_id, as.c_currency_id, io.dateacct, oh.c_conversiontype_id, ol.ad_org_id);
      if (fx == null) { F.err = 'PurchaseOrderNotConvertible ' + as.name; return false; }
      poCost = poCost.multiply(fx); if (poCost.scale() > prec) poCost = poCost.setScale(prec, HU);
    }
    // createMatchPOCostDetail :584-690 - total amount and qty of this order line's receipt matches on the same DateAcct + ASI
    var tQty = Z, tAmt = Z;
    trx.find('m_matchpo', { c_orderline_id: ol.c_orderline_id }).forEach(function (m) {
      if (String(m.m_attributesetinstance_id || 0) === String(mp.m_attributesetinstance_id || 0) && String(m.m_matchpo_id) !== String(mp.m_matchpo_id) && String(m.dateacct).slice(0, 10) === String(mp.dateacct).slice(0, 10) && nz(m.m_inoutline_id)) {
        var q2 = isReturn ? D(m.qty).negate() : D(m.qty); tQty = tQty.add(q2); tAmt = tAmt.add(poCost.multiply(q2)); } });
    var delivered = poCost.multiply(qty);
    tAmt = tAmt.add(isReturn ? delivered.negate() : delivered); tQty = tQty.add(isReturn ? qty.negate() : qty);
    if (tAmt.scale() > prec) tAmt = tAmt.setScale(prec, HU);
    if (!M.createOrder(trx, as, ol.ad_org_id, mp.m_product_id, mp.m_attributesetinstance_id || 0, ol.c_orderline_id, 0, tAmt, tQty, ol.description, mp.dateacct, 0)) { F.err = 'SaveError'; return false; }
    var totalCost = poCost.multiply(qty), prod = T.product(trx, mp.m_product_id);                 // :408-419
    var costs = M.getProductCosts(trx, prod, mp.m_attributesetinstance_id || 0, as, mp.ad_org_id, 'S', qty, ol.c_orderline_id, false, mp.dateacct, null, false);
    if (M.costingMethod(trx, prod, as) !== 'S') return true;                                     // :421 / :549-552 no PPV
    if (costs == null || D(costs).signum() === 0) { if (D(ol.priceactual).signum() === 0) costs = Z; else { F.err = 'Resubmit - No Costs for ' + prod.name; return false; } }
    var diff = totalCost.subtract(D(costs)); if (diff.signum() === 0) return true;
    var dims = { c_bpartner_id: ol.c_bpartner_id, c_activity_id: ol.c_activity_id, c_campaign_id: ol.c_campaign_id, c_project_id: ol.c_project_id, c_projectphase_id: ol.c_projectphase_id, c_projecttask_id: ol.c_projecttask_id,
      c_uom_id: ol.c_uom_id, user1_id: ol.user1_id, user2_id: ol.user2_id, c_charge_id: ol.c_charge_id, c_costcenter_id: ol.c_costcenter_id, c_department_id: ol.c_department_id, m_attributesetinstance_id: ol.m_attributesetinstance_id };
    var setDims = function (fl, q) { Object.keys(dims).forEach(function (c) { fl[c] = nz(dims[c]) ? dims[c] : null; }); fl.qty = N(q); };
    var cr = lineSigned(F, ctx, productAcct(trx, mp.m_product_id, 'p_purchasepricevariance_acct', as), as.c_currency_id, isReturn ? diff.negate() : diff);
    if (cr) setDims(cr, isReturn ? qty.negate() : qty);
    var dr = lineSigned(F, ctx, glAcct(trx, 'ppvoffset_acct', as.c_acctschema_id), as.c_currency_id, isReturn ? diff : diff.negate());
    if (dr) setDims(dr, isReturn ? qty : qty.negate());
    var el = trx.q("SELECT isbalanced AS b FROM c_acctschema_element WHERE c_acctschema_id=? AND elementtype='OO'", [as.c_acctschema_id])[0], interOrg = !!el && Y(el.b) && String(rl.ad_org_id) !== String(ol.ad_org_id);
    if (!Y(as.ispostifclearingequal) && dr && cr && dr.account_id === cr.account_id && !interOrg && D(dr.amtsourcedr).compareTo(D(cr.amtsourcecr)) === 0) { removeLine(F, dr); removeLine(F, cr); }   // :521-534
    return true;
  }

  // Doc_Movement (acct/Doc_Movement.java :60-330) - loadDocumentDetails :70-84, loadLines :90-110, createFacts :128-300. In-transit + MMovementConfirm and landed cost are NAMED (spec §60), not judged.
  function Doc_Movement(trx, mv, as, F) {
    var M = mc(), ctx = Doc(trx, 'm_movement', mv, { dateDoc: mv.movementdate, dateAcct: mv.movementdate, c_currency_id: as.c_currency_id, m_warehouse_id: null }), revId = nz(mv.reversal_id) ? Number(mv.reversal_id) : 0;
    var lines = trx.find('m_movementline', { m_movement_id: mv.m_movement_id }, ['line']).map(function (l) {                // loadLines: qty = MovementQty (setQty(…, false))
      var dl = DocLine(trx, 'm_movementline', l); dl.qty = D(l.movementqty); dl.pcQty = D(l.movementqty); dl.reversalLine_ID = l.reversalline_id; dl.cdKey = { m_movementline_id: l.m_movementline_id, issotrx: 'N' }; return dl; });
    var locOrg = function (id) { return locatorOrg(trx, id); };                                                           // FactLine.getAD_Org_ID :944-976 (the locator's org once the locator is set)
    var signed = function (dl, acct, amt) { return amt.signum() < 0 ? createLine(F, ctx, dl, acct, as.c_currency_id, null, amt.abs()) : createLine(F, ctx, dl, acct, as.c_currency_id, amt, null); };   // Fact.createLine(docLine, account, cur, Amt) :200-211
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], p = T.product(trx, line.m_product_id), costs = null, rev = !!revId && nz(line.reversalLine_ID) !== 0, ml = line.row;   // isReversal(line) :310-312
      if (!p) { F.err = 'Doc_Movement line without product - named'; return false; }
      if (!rev) {
        if (M.costingLevel(trx, p, as) === 'B' && !nz(line.m_attributesetinstance_id)) {                                   // :146-169 batch-lot without ASI: the MA rows' cost
          var mas = trx.find('m_movementlinema', { m_movementline_id: line.id });
          if (mas.length) { costs = Z; mas.forEach(function (ma) { var qa = D(ma.movementqty); if (qa.signum() !== line.qty.signum()) qa = qa.negate(); line.pcQty = qa; line.pcAsi = ma.m_attributesetinstance_id; costs = costs.add(lineProductCosts(trx, F, ctx, line, true, true)); }); line.pcAsi = null; line.pcQty = line.qty; }
        } else costs = lineProductCosts(trx, F, ctx, line, true, true);                                                    // :171-181 MZ Goodwill: the move's cost detail, else current cost
        if (costs == null) { F.err = 'Doc_Movement batch-lot line without MovementLineMA (legacy NPE, costs.negate()) - named'; return false; }
      } else costs = Z;                                                                                                    // :186
      var dr = signed(line, productAcct(trx, line.m_product_id, 'p_asset_acct', as), costs.negate());                     // ** Inventory DR CR :190-196 (from (-) CR)
      if (!dr) continue;
      dr.m_locator_id = line.m_locator_id; dr.ad_org_id = locOrg(line.m_locator_id); dr.m_attributesetinstance_id = nz(line.m_attributesetinstance_id) ? line.m_attributesetinstance_id : 0; dr.m_warehouse_id = null; dr.qty = N(line.qty.negate());
      if (rev && !updateReverseLine(F, dr, TABLE_ID.m_movement, revId, line.reversalLine_ID, 1)) { F.err = 'Original Inventory Move not posted yet'; return false; }   // :204-212
      var cr = signed(line, productAcct(trx, line.m_product_id, 'p_asset_acct', as), costs);                               // ** InventoryTo :216-222 (to (+) DR)
      if (!cr) continue;
      cr.m_locator_id = ml.m_locatorto_id; cr.ad_org_id = locOrg(ml.m_locatorto_id); cr.m_attributesetinstance_id = nz(ml.m_attributesetinstanceto_id) ? ml.m_attributesetinstanceto_id : 0; cr.m_warehouse_id = null; cr.qty = N(line.qty);
      if (rev) {
        if (!updateReverseLine(F, cr, TABLE_ID.m_movement, revId, line.reversalLine_ID, 1, dr)) { F.err = 'Original Inventory Move not posted yet'; return false; }   // :230-238
        costs = acctBalance(cr);                                                                                           // get original cost
      }
      if (String(dr.ad_org_id) !== String(cr.ad_org_id)) {                                                                 // :241 only for between-org movements
        if (M.costingLevel(trx, p, as) !== 'O') continue;
        var desc = line.description == null ? '' : line.description, refFrom = 0, refTo = 0, later = nz(line.reversalLine_ID) && Number(line.reversalLine_ID) > 0 && (ML.isNewId(line.id) || Number(line.id) > Number(line.reversalLine_ID));
        if (later) { var cf = M.getMovement(trx, as, line.m_product_id, line.m_attributesetinstance_id || 0, line.reversalLine_ID, 0, true); if (cf) refFrom = cf.m_costdetail_id; }
        if (!M.createMovement(trx, as, dr.ad_org_id, line.m_product_id, line.m_attributesetinstance_id || 0, line.id, 0, costs.negate(), line.qty.negate(), true, desc + '(|->)', ctx.dateAcct, refFrom)) { F.err = 'Failed to create cost detail record'; return false; }
        if (later) { var ct = M.getMovement(trx, as, line.m_product_id, line.m_attributesetinstance_id || 0, line.reversalLine_ID, 0, false); if (ct) refTo = ct.m_costdetail_id; }
        if (!M.createMovement(trx, as, cr.ad_org_id, line.m_product_id, line.m_attributesetinstance_id || 0, line.id, 0, costs, line.qty, false, desc + '(|<-)', ctx.dateAcct, refTo)) { F.err = 'Failed to create cost detail record'; return false; }
      }
    }
    return true;
  }


  // FactLine.getAD_Org_ID :944-976 Prio 1 - the org of the FactLine's locator once it is set (Doc_Movement, Doc_Inventory)
  function locatorOrg(trx, id) { var r = nz(id) ? trx.get('m_locator', id) : null; return r ? r.ad_org_id : null; }
  // Doc.getValidCombination_ID :1500-1590 has NO default fallback (a missing row = no account = no line): the warehouse differences account (ACCTTYPE_InvDifferences :1505-1510) and MCharge.getAccount :51-68
  function acctOf(trx, table, col, keyCol, key, schema) {
    var r = trx.q('SELECT ' + col + ' AS a FROM ' + table + ' WHERE ' + keyCol + '=? AND c_acctschema_id=?', [key, schema])[0];
    if (!r || !nz(r.a)) return null; var v = trx.q('SELECT account_id AS e FROM c_validcombination WHERE c_validcombination_id=?', [r.a])[0]; return v ? v.e : null;
  }
  var LINV_NOCLEARING = (typeof process !== 'undefined' && process.env && process.env.LINV_BREAK) === 'noclearing';   // witness negative control only (W-INVENTORY): the offset leg is booked on the asset account itself
  // Doc_Inventory (acct/Doc_Inventory.java :40-520) - loadDocumentDetails :80-104, loadLines :111-187, createFacts :212-518. Physical Inventory / Internal Use / Cost Adjustment (spec §67).
  //   DR Product Asset / CR (the line's Charge expense | the warehouse Inventory Differences account | for a Cost Adjustment the product Cost Adjustment account) at the line's cost x signed Qty
  //   (Cost Adjustment: the NewCost-CurrentCost difference x the cost's current Qty); the cost detail (MCostDetail.createInventory) is written for every line.
  function convertCosting(trx, M, amt, from, to, date) {   // MConversionRate.convert(.., isCosting=true) :126-148 - rate x amt, HALF_UP to the COSTING precision only when the scale exceeds it
    if (String(from) === String(to) || D(amt).signum() === 0) return D(amt);
    var r = rate(trx, from, to, date, 0); if (!r) return null; var v = r.multiply(D(amt)), p = M.costingPrecision(trx, { c_currency_id: to });
    return v.scale() > p ? v.setScale(p, HU) : v;
  }
  function Doc_Inventory(trx, inv, as, F) {
    var M = mc(), dtp = T.dt(trx, inv.c_doctype_id), parentSub = dtp ? dtp.docsubtypeinv : null, revId = nz(inv.reversal_id) ? Number(inv.reversal_id) : 0, CA = parentSub === 'CA';
    var docCur = CA ? (nz(inv.c_currency_id) ? inv.c_currency_id : M.caSchema(trx, { ad_client_id: inv.ad_client_id, c_currency_id: null }).c_currency_id) : as.c_currency_id;   // :88-97 / :217 a Cost Adjustment keeps the document currency (empty = the primary schema's), every other subtype books in the schema currency
    var ctx = Doc(trx, 'm_inventory', inv, { dateDoc: inv.movementdate, dateAcct: inv.movementdate, c_currency_id: docCur });                           // loadDocumentDetails: DateDoc = DateAcct = MovementDate
    if (CA && String(M.caSchema(trx, inv).c_acctschema_id) === String(as.c_acctschema_id)) {                                                                // loadLines :113-132 refresh the line's CurrentCostPrice when the cost moved since it was saved
      trx.find('m_inventoryline', { m_inventory_id: inv.m_inventory_id }, ['line']).forEach(function (l) { var ccp = M.currentCostPriceForCA(trx, inv, l); if (ccp != null && ccp.compareTo(D(l.currentcostprice)) !== 0) trx.update('m_inventoryline', l, { currentcostprice: N(ccp) }); });
    }
    var lines = trx.find('m_inventoryline', { m_inventory_id: inv.m_inventory_id }, ['line', 'm_inventoryline_id']).filter(function (l) { return Y(l.isactive); }).map(function (l) {   // loadLines :134-187
      var sub = parentSub || (D(l.qtyinternaluse).signum() !== 0 ? 'IU' : 'PI'), diff = Z, amtDiff = Z;                                                       // an empty parent subtype is the IDEMPIERE-675 backward compatibility
      if (sub === 'IU') diff = D(l.qtyinternaluse).negate(); else if (sub === 'PI') diff = D(l.qtycount).subtract(D(l.qtybook)); else if (sub === 'CA') amtDiff = D(l.newcostprice).subtract(D(l.currentcostprice));
      var dl = DocLine(trx, 'm_inventoryline', l); dl.qty = diff; dl.pcQty = diff; dl.amtSource = amtDiff; dl.reversalLine_ID = l.reversalline_id; dl.cdKey = { m_inventoryline_id: l.m_inventoryline_id }; return dl; });   // setQty(qtyDiff, false) = ProductCost qty too; setAmount(amtDiff); cost detail where "M_InventoryLine_ID=?"
    var cur = docCur, costMap = {}, docMethod = inv.costingmethod;
    var signed = function (dl, acct, amt) { return amt.signum() < 0 ? createLine(F, ctx, dl, acct, cur, null, amt.abs()) : createLine(F, ctx, dl, acct, cur, amt, null); };   // Fact.createLine(docLine, account, cur, Amt) :205-211
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i], p = T.product(trx, line.m_product_id), costs = null, adjustmentDiff = null, doPosting = true, level = null, rev = !!revId && nz(line.reversalLine_ID) !== 0, batch = p && M.costingLevel(trx, p, as) === 'B';   // isReversal(line) :519-521
      if (CA) {                                                                                                                                              // :224-247
        if (!T.isStocked(p)) doPosting = false; else { level = M.costingLevel(trx, p, as); if (docMethod !== M.costingMethod(trx, p, as)) doPosting = false; }
        var org = line.ad_org_id, asiId = line.m_attributesetinstance_id || 0; if (level === 'C') { org = 0; asiId = 0; } else if (level === 'O') asiId = 0; else if (level === 'B') org = 0;
        var ce = M.getMaterialCostElement(trx, as, docMethod), cd0 = ce ? M.getInventory(trx, as, p.m_product_id, asiId, line.id, ce.m_costelement_id) : null;
        var info = ce ? M.getCostInfo(trx, org, p.m_product_id, as.m_costtype_id, as.c_acctschema_id, ce.m_costelement_id, asiId, ctx.dateAcct, cd0) : null;      // MCost.getCostInfo(product, asi, as, org, ce, dateAcct, cd) :251-258
        if (!info) { F.err = 'Doc_Inventory Cost Adjustment: no cost info for ' + p.name + ' (legacy NullPointerException) - named'; return false; }
        adjustmentDiff = line.amtSource; costs = line.amtSource.multiply(D(info.currentqty));                                                                   // :259-261
      } else if (!rev) {                                                                                                                                     // :281-340
        if (batch && !nz(line.m_attributesetinstance_id)) {                                                                                                  // :284-306 batch-lot without ASI: the MA rows' cost
          var mas = trx.find('m_inventorylinema', { m_inventoryline_id: line.id });
          if (mas.length) { costs = Z; mas.forEach(function (ma) { line.pcQty = D(ma.movementqty).negate(); line.pcAsi = ma.m_attributesetinstance_id; var mc_ = lineProductCosts(trx, F, ctx, line, true, true); costMap[line.id + '_' + ma.m_attributesetinstance_id] = mc_; costs = costs.add(mc_); }); line.pcAsi = null; line.pcQty = line.qty; }
        } else costs = lineProductCosts(trx, F, ctx, line, true, true);                                                                                      // :307-320 MZ Goodwill: the line's cost detail, else the current cost
        if (costs == null || costs.signum() === 0) {                                                                                                         // :322-345
          if (T.isStocked(p)) {
            var cnt = trx.q("SELECT COUNT(*) AS n FROM m_costdetail WHERE m_product_id=? AND processed='Y' AND amt=0 AND qty>0 AND (c_orderline_id>0 OR c_invoiceline_id>0)", [p.m_product_id])[0];
            if (cnt && Number(cnt.n) > 0) costs = Z; else { F.err = 'No Costs for ' + p.name; return false; }
          } else continue;                                                                                                                                   // ignore service
        }
      } else costs = D(1);                                                                                                                                   // :346-350 updated below
      if (doPosting) {
        var dr = signed(line, productAcct(trx, line.m_product_id, 'p_asset_acct', as), costs);                                                               // :352-355 Inventory DR CR
        if (dr) {
          dr.m_locator_id = line.m_locator_id; dr.ad_org_id = locatorOrg(trx, line.m_locator_id);                                                            // :357 (+ FactLine.getAD_Org_ID)
          if (rev) {
            if (!updateReverseLine(F, dr, TABLE_ID.m_inventory, revId, line.reversalLine_ID, 1)) { F.err = 'Original Physical Inventory not posted yet'; return false; }   // :359-367
            costs = acctBalance(dr);                                                                                                                         // get original cost
          }
          var invDiff = nz(line.c_charge_id) ? acctOf(trx, 'c_charge_acct', 'ch_expense_acct', 'c_charge_id', line.c_charge_id, as.c_acctschema_id) : null;  // :372-384 InventoryDiff DR CR or Charge (MCharge.getAccount)
          if (invDiff == null) invDiff = CA ? productAcct(trx, line.m_product_id, 'p_costadjustment_acct', as) : acctOf(trx, 'm_warehouse_acct', 'w_differences_acct', 'm_warehouse_id', inv.m_warehouse_id, as.c_acctschema_id);   // :386-390 ProductCost P_CostAdjustment | Doc.getAccount(ACCTTYPE_InvDifferences)
          if (LINV_NOCLEARING) invDiff = productAcct(trx, line.m_product_id, 'p_asset_acct', as);
          var cr = signed(line, invDiff, costs.negate());                                                                                                    // :392-394
          if (cr) {
            cr.m_locator_id = line.m_locator_id; cr.qty = N(line.qty.negate());                                                                              // :397-399
            cr.ad_org_id = nz(line.c_charge_id) ? line.ad_org_id : locatorOrg(trx, line.m_locator_id);                                                       // :400-401 explicit overwrite for charge, else the locator's org
            if (rev && !updateReverseLine(F, cr, TABLE_ID.m_inventory, revId, line.reversalLine_ID, 1, dr)) { F.err = 'Original Physical Inventory not posted yet'; return false; }   // :402-413
          }
        }
      }
      var amt = CA ? adjustmentDiff : costs;                                                                                                                 // :417-424 costDetailAmt
      if (CA && String(docCur) !== String(as.c_currency_id)) { amt = convertCosting(trx, M, amt, docCur, as.c_currency_id, ctx.dateAcct); if (amt == null) { F.err = 'No conversion from ' + docCur + ' to ' + as.c_currency_id; return false; } }   // :418-424
      var refFor = function (asi) { var ref = 0; if (nz(line.reversalLine_ID) && Number(line.reversalLine_ID) > 0 && (ML.isNewId(line.id) || Number(line.id) > Number(line.reversalLine_ID))) { var ocd = M.getInventory(trx, as, line.m_product_id, asi, line.reversalLine_ID, 0); if (ocd) ref = ocd.m_costdetail_id; } return ref; };   // :437-446 / :462-471 / :486-495
      if (batch && !nz(line.m_attributesetinstance_id)) {                                                                                                    // :425-459 one cost detail per MA
        trx.find('m_inventorylinema', { m_inventoryline_id: line.id }).forEach(function (ma) {
          var q = D(ma.movementqty), maCost = costMap[line.id + '_' + ma.m_attributesetinstance_id]; if (q.signum() !== line.qty.signum()) q = q.negate(); if (maCost == null) return; if (maCost.signum() !== amt.signum()) maCost = maCost.negate();
          if (!M.createInventory(trx, as, line.ad_org_id, line.m_product_id, ma.m_attributesetinstance_id, line.id, 0, maCost, q, line.description, ctx.dateAcct, refFor(ma.m_attributesetinstance_id))) F.err = 'Failed to create cost detail record';
        });
        if (F.err) return false;
      } else if (!M.createInventory(trx, as, line.ad_org_id, line.m_product_id, line.m_attributesetinstance_id || 0, line.id, 0, amt, line.qty, line.description, ctx.dateAcct, refFor(line.m_attributesetinstance_id || 0))) { F.err = 'Failed to create cost detail record'; return false; }   // :474-503 Cost Detail (also when a Cost Adjustment line is not posted)
    }
    return true;
  }

  // Doc_GLJournal (acct/Doc_GLJournal.java :61-177) - loadLines :79-107, createFacts :140-177. Lines post DIRECTLY (account = the line's C_ValidCombination, source amounts, own currency);
  //   the inter-org Due-To/Due-From legs are NOT written here: Doc.postLogic's Fact.balanceSegments (Fact.java:405-499) books them for every Doc - the one helper post() already runs (spec GLJ_RESULT).
  function Doc_GLJournal(trx, j, as, F) {
    if (String(as.c_acctschema_id) !== String(j.c_acctschema_id)) return true;                                           // :145-146 other schema -> empty fact list
    var dt = nz(j.c_doctype_id) ? T.dt(trx, j.c_doctype_id) : null;
    if (!dt || dt.docbasetype !== 'GLJ') { F.err = 'DocumentType unknown: ' + (dt ? dt.docbasetype : j.c_doctype_id); return false; }   // :168-172 p_Error -> status E
    if (j.postingtype != null && j.postingtype !== 'A') { F.err = 'GL_Journal PostingType ' + j.postingtype + ' not ported - named'; return false; }   // Fact(this, as, m_PostingType) - twin books Actual only
    var ctx = Doc(trx, 'gl_journal', j, { dateDoc: j.datedoc || j.dateacct, dateAcct: j.dateacct, c_currency_id: j.c_currency_id }), cur = {}, nCur = 0, sb = Z;
    var lines = trx.find('gl_journalline', { gl_journal_id: j.gl_journal_id }, ['line', 'gl_journalline_id']).filter(function (l) { return l.isactive !== 'N'; }).map(function (l) {   // MJournal.getLines(false)
      var dl = DocLine(trx, 'gl_journalline', l, { c_conversiontype_id: l.c_conversiontype_id }); dl.qty = D(l.qty == null ? 0 : l.qty);                     // :88 setQty(line.getQty(), false)
      dl.cur = nz(l.c_currency_id) ? l.c_currency_id : j.c_currency_id;                                                  // DocLine.getC_Currency_ID :132-147
      var vcr = nz(l.c_validcombination_id) ? trx.get('c_validcombination', l.c_validcombination_id) : null; dl.acct = vcr ? vcr.account_id : null;             // :94-95 line.getAccount_Combi
      return dl; });
    lines.forEach(function (dl) { if (!(dl.cur in cur)) { cur[dl.cur] = 1; nCur++; } sb = sb.add(D(dl.row.amtsourcedr)).subtract(D(dl.row.amtsourcecr)); });
    if (nCur <= 1 && sb.signum() !== 0) { F.err = 'GL_Journal source-unbalanced (Fact.balanceSource suspense, Fact.java:298-322) not ported - named'; return false; }   // Doc.postLogic :846-853; >1 currency => balanced (Fact.java:255-262)
    for (var i = 0; i < lines.length; i++) {
      var dl = lines[i]; if (dl.acct == null) { F.err = 'GL_JournalLine ' + dl.id + ' account not resolvable - named'; return false; }
      createLine(F, ctx, dl, dl.acct, dl.cur, dl.row.amtsourcedr, dl.row.amtsourcecr);                                    // :160-164
    }
    return !F.err;
  }

  // Doc_BankStatement (acct/Doc_BankStatement.java :49-300, DocLine_Bank.java :39-123) - loadDocumentDetails :70-88, loadLines :102-120, getBalance :126-145, createFacts :160-285 (spec BST_RESULT).
  //   Per active line: DR/CR BankAsset = +StmtAmt, BankInTransit = -TrxAmt, Charge (ChargeAmt>0 -> CR, else DR -ChargeAmt), Interest (-InterestAmt on InterestExp when the interest is negative, else InterestRev).
  //   Accounts: C_BankAccount_Acct / C_Charge_Acct by schema with NO default fallback (Doc.getValidCombination_ID, MCharge.getAccount) = acctOf. DateAcct per line: DocLine_Bank :50.
  function sysConfigBool(trx, name, dflt) {                                                // MSysConfig.getBooleanValue(name, dflt, AD_Client_ID) - client row, else System row; no table = the default
    var r = null; try { r = trx.q("SELECT value FROM ad_sysconfig WHERE name=? AND ad_client_id IN (0,?) AND COALESCE(ad_org_id,0)=0 AND COALESCE(isactive,'Y')='Y' ORDER BY ad_client_id DESC", [name, trx.env.client])[0]; } catch (e) { r = null; }
    return r && r.value != null && r.value !== '' ? /^(y|true)$/i.test(String(r.value)) : dflt;
  }
  function Doc_BankStatement(trx, bs, as, F) {
    var sch = as.c_acctschema_id, ba = trx.get('c_bankaccount', bs.c_bankaccount_id), docCur = ba ? ba.c_currency_id : as.c_currency_id, bankOrg = ba && nz(ba.ad_org_id) ? Number(ba.ad_org_id) : 0;   // :76-83 / :291-298
    var ctx = Doc(trx, 'c_bankstatement', bs, { dateDoc: bs.statementdate, dateAcct: bs.dateacct, c_currency_id: docCur }), fromLine = sysConfigBool(trx, 'BANK_STATEMENT_POST_WITH_DATE_FROM_LINE', false);   // :73-74 / MBankStatement.java:801
    var lines = trx.find('c_bankstatementline', { c_bankstatement_id: bs.c_bankstatement_id }, ['line', 'c_bankstatementline_id']).filter(function (l) { return l.isactive !== 'N'; }).map(function (l) {   // :109
      var dl = DocLine(trx, 'c_bankstatementline', l, { c_conversiontype_id: l.c_conversiontype_id });
      dl.dateDoc = l.valutadate; dl.dateAcct = fromLine ? l.dateacct : bs.dateacct; dl.cur = nz(l.c_currency_id) ? l.c_currency_id : docCur;                    // DocLine_Bank :49-50 / DocLine.getC_Currency_ID :132-147
      dl.payOrg = nz(l.c_payment_id) ? (trx.q('SELECT ad_org_id AS o FROM c_payment WHERE c_payment_id=?', [l.c_payment_id])[0] || {}).o : null; return dl; });
    var diff = D(bs.statementdifference == null ? 0 : bs.statementdifference); lines.forEach(function (dl) { diff = diff.subtract(D(dl.row.stmtamt == null ? 0 : dl.row.stmtamt)); });
    if (diff.signum() !== 0) { F.err = 'C_BankStatement StatementDifference <> sum(StmtAmt) (Doc.isBalanced, STATUS_NotBalanced) not ported - named'; return false; }   // :126-145 / Doc.java:1097-1110 (single-currency document)
    var asset = acctOf(trx, 'c_bankaccount_acct', 'b_asset_acct', 'c_bankaccount_id', bs.c_bankaccount_id, sch), transit = acctOf(trx, 'c_bankaccount_acct', 'b_intransit_acct', 'c_bankaccount_id', bs.c_bankaccount_id, sch);
    var intExp = acctOf(trx, 'c_bankaccount_acct', 'b_interestexp_acct', 'c_bankaccount_id', bs.c_bankaccount_id, sch), intRev = acctOf(trx, 'c_bankaccount_acct', 'b_interestrev_acct', 'c_bankaccount_id', bs.c_bankaccount_id, sch);
    var signed = function (dl, acct, amt) { return amt.signum() < 0 ? createLine(F, ctx, dl, acct, dl.cur, null, amt.abs()) : createLine(F, ctx, dl, acct, dl.cur, amt, null); };   // Fact.createLine(docLine, account, cur, Amt) :205-211
    for (var i = 0; i < lines.length; i++) {
      var dl = lines[i], r = dl.row, fl, stmt = D(r.stmtamt == null ? 0 : r.stmtamt), trxAmt = D(r.trxamt == null ? 0 : r.trxamt), chg = D(r.chargeamt == null ? 0 : r.chargeamt), intr = D(r.interestamt == null ? 0 : r.interestamt);
      if (nz(r.c_depositbatch_id)) { F.err = 'C_BankStatementLine ' + dl.id + ' C_DepositBatch (:214-238) not ported - named'; return false; }
      if (!Y(as.ispostifclearingequal) && asset != null && String(asset) === String(transit)) {                                   // :184-198 one line: the difference
        var dif = stmt.subtract(trxAmt); if (dif.signum() !== 0) { fl = signed(dl, asset, dif); if (fl && bankOrg) fl.ad_org_id = bankOrg; }
      } else {
        fl = signed(dl, asset, stmt); if (fl && bankOrg) fl.ad_org_id = bankOrg;                                                   // :205-210
        fl = signed(dl, transit, trxAmt.negate()); if (fl) { var o = bankOrg || Number(dl.payOrg || 0) || Number(dl.ad_org_id || 0); if (o) fl.ad_org_id = o; }   // :240-249 org: bank, else the payment's (DocLine_Bank.getAD_Org_ID(true) :77-87)
      }
      var chAcct = nz(r.c_charge_id) ? acctOf(trx, 'c_charge_acct', 'ch_expense_acct', 'c_charge_id', r.c_charge_id, sch) : null;     // DocLine.getChargeAccount :485-491 / MCharge.getAccount
      if (chg.signum() > 0) createLine(F, ctx, dl, chAcct, dl.cur, null, chg); else createLine(F, ctx, dl, chAcct, dl.cur, chg.negate(), null);   // :256-264
      signed(dl, intr.signum() < 0 ? intExp : intRev, intr.negate());                                                              // :269-276
      if (F.err) return false;
    }
    var sd = Z, cur = {}, nCur = 0; F.lines.forEach(function (f) { sd = sd.add(D(f.amtsourcedr)).subtract(D(f.amtsourcecr)); if (!(f.c_currency_id in cur)) { cur[f.c_currency_id] = 1; nCur++; } });
    if (nCur <= 1 && sd.signum() !== 0) { F.err = 'C_BankStatement source-unbalanced (Fact.balanceSource suspense, Fact.java:298-322) not ported - named'; return false; }   // Doc.postLogic :846-853
    return !F.err;
  }

  // ── the Doc_* classes: createFacts(trx, doc, as, fact) ──
  var DOC = {
    c_order: function () { return true; },                                                  // Doc_Order: no commitment accounting → no facts, Posted='Y'
    m_inout: function (trx, io, as, F) { return Doc_InOut(trx, io, as, F); },
    m_matchinv: function (trx, mi, as, F) { return Doc_MatchInv(trx, mi, as, F); },
    m_matchpo: function (trx, mp, as, F) { return Doc_MatchPO(trx, mp, as, F); },
    m_movement: function (trx, mv, as, F) { return Doc_Movement(trx, mv, as, F); },
    m_inventory: function (trx, inv, as, F) { return Doc_Inventory(trx, inv, as, F); },
    gl_journal: function (trx, j, as, F) { return Doc_GLJournal(trx, j, as, F); },
    c_bankstatement: function (trx, bs, as, F) { return Doc_BankStatement(trx, bs, as, F); },
    c_invoice: function (trx, inv, as, F) {                                                  // Doc_Invoice.createFacts ARI :~360-460
      var dt = T.dt(trx, docTypeIdOf(trx, 'c_invoice', inv)), cur = inv.c_currency_id,   /* Doc.getC_DocType_ID :1911-1925: C_DocType_ID 0 (a draft) -> C_DocTypeTarget_ID */ from = locOfOrg(trx, inv.ad_org_id), to = locOfBP(trx, inv.c_bpartner_location_id);
      // FactLine.setDocumentInfo :364-500 — "<DocumentNo>" + (" #<Line>" + " (<line desc | doc desc>)" | " (<doc desc>)") — the reversal's "({->orig))" lands here
      var hasDesc = function (v) { return v != null && String(v).length > 0; };
      var base = { ad_org_id: inv.ad_org_id, c_bpartner_id: inv.c_bpartner_id, c_locfrom_id: from, c_locto_id: to, description: inv.documentno + (hasDesc(inv.description) ? ' (' + inv.description + ')' : '') };
      if (dt.docbasetype === 'API' || dt.docbasetype === 'APC') return Doc_InvoiceAPI(trx, inv, as, F, dt, base, hasDesc);
      if (dt.docbasetype !== 'ARI' && dt.docbasetype !== 'ARC') { F.err = 'Doc_Invoice ' + dt.docbasetype + ' not ported in model_post — named'; return false; }
      var cm = dt.docbasetype === 'ARC';                                                      // Doc_Invoice ARC :521-: the same lines on the opposite side; qty = +QtyInvoiced (DocLine.setQty negates twice)
      if (cm && (Y(inv.istaxincluded) || nz(inv.reversal_id) || (nz(inv.chargeamt) && D(inv.chargeamt).signum() !== 0) || Y(as.istradediscountposted))) { F.err = 'ARC tax-included / reversal / header charge / trade-discount posting not ported — named'; return false; }
      F.line(ACCT.receivable(trx, inv.c_bpartner_id, as.c_acctschema_id), cur, cm ? null : inv.grandtotal, cm ? inv.grandtotal : null, Object.assign({ qty: 0 }, base));
      trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }).forEach(function (t) {
        F.line(ACCT.taxDue(trx, t.c_tax_id, as.c_acctschema_id), cur, cm ? t.taxamt : null, cm ? null : t.taxamt, Object.assign({ c_tax_id: t.c_tax_id, qty: 0 }, base)); });
      trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }, ['line']).forEach(function (l) {
        if (!nz(l.m_product_id) && !nz(l.c_charge_id)) { F.err = 'description invoice line (no product, no charge) posting not ported — named'; return; }
        // DocLine.getAccount(P_Revenue) DocLine.java:447-461: a line with NO product and a charge posts to MCharge.getAccount (C_Charge_Acct.Ch_Expense_Acct), both SO and PO (W-IMPORT-INVOICE: the open-AR Opening Charge)
        F.line(nz(l.m_product_id) ? ACCT.revenue(trx, l.m_product_id, as.c_acctschema_id) : ACCT.chargeExpense(trx, l.c_charge_id, as.c_acctschema_id), cur, cm ? l.linenetamt : null, cm ? null : l.linenetamt, Object.assign({}, base, { line_id: l.c_invoiceline_id, m_product_id: l.m_product_id,
          c_uom_id: l.c_uom_id, c_tax_id: l.c_tax_id, qty: N(cm ? D(l.qtyinvoiced) : D(l.qtyinvoiced).negate()), description: inv.documentno + ' #' + l.line + (hasDesc(l.description) ? ' (' + l.description + ')' : hasDesc(inv.description) ? ' (' + inv.description + ')' : '') })); });
      return !F.err;
    },
    c_payment: function (trx, p, as, F) {                                                    // Doc_Payment.createFacts — receipt: DR BankInTransit / CR UnallocatedCash
      var base = { ad_org_id: p.ad_org_id, c_bpartner_id: p.c_bpartner_id, qty: 0, description: p.documentno };
      if (nz(p.c_charge_id)) { F.err = 'charge payment posting not ported — named'; return false; }
      var it = ACCT.inTransit(trx, p.c_bankaccount_id, as.c_acctschema_id), un = ACCT.unallocated(trx, p.c_bankaccount_id, as.c_acctschema_id);
      if (Y(p.isreceipt)) { F.line(it, p.c_currency_id, p.payamt, null, base); F.line(un, p.c_currency_id, null, p.payamt, base); }
      else { F.line(un, p.c_currency_id, p.payamt, null, base); F.line(it, p.c_currency_id, null, p.payamt, base); }
      return true;
    },
    c_allocationhdr: function (trx, h, as, F) {                                              // Doc_AllocationHdr.createFacts :193-555 — SO / PO invoice branches, discount, write-off, payment + cash-line legs, VAT tax correction
      var ls = trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }, ['c_allocationline_id']), sch = as.c_acctschema_id, cur = h.c_currency_id, named = function (m) { F.err = m + ' not ported - named'; return false; };
      if (ls.length === 2) {                                                                 // :199-213 "Do not create fact lines for reversal of invoice"
        var l1 = ls[0], l2 = ls[1], only = function (l) { return !nz(l.c_payment_id) && !nz(l.c_order_id) && !nz(l.c_cashline_id) && nz(l.c_invoice_id) > 0; };
        if (only(l1) && only(l2)) { var i1 = trx.get('c_invoice', l1.c_invoice_id), i2 = trx.get('c_invoice', l2.c_invoice_id);
          if (i1 && i2 && D(i1.grandtotal).compareTo(D(i2.grandtotal).negate()) === 0 && String(i2.reversal_id) === String(i1.c_invoice_id)) return true; }   // (BigDecimal.equals: same value; the scale of a stored REAL is not observable here — named)
      }
      if (!Y(as.isaccrual)) return named('allocation in a cash-based schema (createCashBasedAcct :686-719)');
      var pice = Y(as.ispostifclearingequal), tcType = as.taxcorrectiontype, tcOn = !!tcType && tcType !== 'N', tcD = tcType === 'D' || tcType === 'B', tcW = tcType === 'W' || tcType === 'B';   // MAcctSchema.isTaxCorrection / Discount / WriteOff
      var rows = ls.map(function (l) { return { l: l, pay: nz(l.c_payment_id) ? trx.get('c_payment', l.c_payment_id) : null, inv: nz(l.c_invoice_id) ? trx.get('c_invoice', l.c_invoice_id) : null,
        cl: nz(l.c_cashline_id) ? trx.get('c_cashline', l.c_cashline_id) : null, amt: D(l.amount), disc: D(l.discountamt), wo: D(l.writeoffamt), org: nz(l.ad_org_id) ? Number(l.ad_org_id) : Number(h.ad_org_id) }; });
      var oo = trx.q("SELECT isbalanced AS b FROM c_acctschema_element WHERE c_acctschema_id=? AND elementtype='OO'", [sch])[0], interOrg = false;   // isInterOrg :564-620
      if (oo && Y(oo.b) && rows.length) { var so = rows[0].org; rows.forEach(function (r) { var op = r.pay ? Number(r.pay.ad_org_id) : so, oi = r.inv ? Number(r.inv.ad_org_id) : so, oc = r.cl ? Number(r.cl.ad_org_id) : so, od = nz(r.l.c_order_id) ? Number((trx.get('c_order', r.l.c_order_id) || {}).ad_org_id) : so; if (r.org !== so || op !== so || oi !== so || oc !== so || od !== so) interOrg = true; }); }
      // getPaymentAcct :728-783 / getCashAcct :791-804 — the account a payment / cash line clears through (null = NONE: no bank account / no cash book)
      function payAcct(r) { var pr = trx.q('SELECT p.c_bankaccount_id AS b, d.docbasetype AS t, p.isreceipt AS rc, p.isprepayment AS pp, p.c_charge_id AS ch FROM c_payment p JOIN c_doctype d ON d.c_doctype_id=p.c_doctype_id WHERE p.c_payment_id=?', [r.pay.c_payment_id])[0];
        if (!pr || !nz(pr.b)) return null; if (nz(pr.ch)) return ACCT.chargeExpense(trx, pr.ch, sch);
        if (Y(pr.pp)) return Y(pr.rc) ? ACCT.prepaymentC(trx, r.l.c_bpartner_id, sch) : ACCT.prepaymentV(trx, r.l.c_bpartner_id, sch);
        return pr.t === 'APP' ? ACCT.paymentSelect(trx, pr.b, sch) : ACCT.unallocated(trx, pr.b, sch); }
      function cashAcct(r) { var cb = trx.q('SELECT c.c_cashbook_id AS b FROM c_cash c, c_cashline cl WHERE c.c_cash_id=cl.c_cash_id AND cl.c_cashline_id=?', [r.cl.c_cashline_id])[0]; return cb && nz(cb.b) ? ACCT.cashTransfer(trx, cb.b, sch) : null; }
      var fx = String(cur) !== String(as.c_currency_id), bad = null, isSOpay = function (q) { return !!q.inv && Y(q.inv.issotrx); };
      for (var i = 0; i < rows.length && !bad; i++) {
        var r = rows[i], l = r.l, bp = l.c_bpartner_id;
        if (r.pay && !r.inv && !nz(l.c_order_id) && !r.cl && !nz(bp) && r.disc.signum() === 0 && r.wo.signum() === 0) continue;   // :215-221 CashBankTransfer
        if (!r.inv) return named('allocation line without an invoice (charge only / payment only :257-285)');
        var base = { ad_org_id: r.org, c_bpartner_id: bp, line_id: l.c_allocationline_id, qty: 0, description: h.documentno + ' #0' + (h.description ? ' (' + h.description + ')' : '') };
        var withOrg = function (o) { return Object.assign({}, base, { ad_org_id: o }); }, payOrg = r.pay ? Number(r.pay.ad_org_id) : r.org, clrOrg = r.pay ? payOrg : (r.cl ? Number(r.cl.ad_org_id) : r.org);
        var src = r.amt.add(r.disc).add(r.wo), clr = r.pay ? payAcct(r) : r.cl ? cashAcct(r) : null, isSO = Y(r.inv.issotrx), mac = null;
        if (isSO) {                                                                          // :288-379
          var rec = ACCT.receivable(trx, bp, sch);
          if (!pice && clr != null && String(clr) === String(rec) && !interOrg) src = r.disc.add(r.wo);   // :303-308 avoid clearing accounts
          else if (r.pay || r.cl) F.line(clr, cur, r.amt, null, withOrg(clrOrg));            // :316-333 Payment / Cash DR (org = payment / cash line)
          if (r.disc.signum() !== 0) F.line(ACCT.discountExp(trx, bp, sch), cur, r.disc, null, withOrg(payOrg));   // :338 Discount DR
          if (r.wo.signum() !== 0) F.line(ACCT.writeOff(trx, bp, sch), cur, r.wo, null, withOrg(payOrg));         // :346 Write off DR
          F.line(rec, cur, null, src, withOrg(Number(r.inv.ad_org_id))); mac = rec;          // :357-365 AR Invoice Amount CR (org = invoice)
        } else {                                                                             // :381-466 purchase invoice
          var liab = ACCT.liability(trx, bp, sch), usingClearing = true;
          if (!pice && clr != null && String(clr) === String(liab) && !interOrg) { src = r.disc.add(r.wo); usingClearing = false; }   // :397-404
          F.line(liab, cur, src.negate(), null, withOrg(Number(r.inv.ad_org_id))); mac = liab;   // :409-424 AP Invoice Amount DR (the amount is negative)
          if (r.disc.signum() !== 0) F.line(ACCT.discountRev(trx, bp, sch), cur, null, r.disc.negate(), withOrg(payOrg));   // :441 Discount CR
          if (r.wo.signum() !== 0) F.line(ACCT.writeOff(trx, bp, sch), cur, null, r.wo.negate(), withOrg(payOrg));         // :449 Write off CR
          if (usingClearing && (r.pay || r.cl)) F.line(clr, cur, null, r.amt.negate(), withOrg(clrOrg));   // :455-470 Payment / Cash CR
        }
        if (tcOn && ((tcD && r.disc.signum() !== 0) || (tcW && r.wo.signum() !== 0))) {      // :469-490 VAT Tax Correction (createTaxCorrection :825-877, Doc_AllocationTax.createEntries :1991-2190)
          var dAmt = tcD ? r.disc : Z, wAmt = tcW ? r.wo : Z, discAcct = isSO ? ACCT.discountExp(trx, bp, sch) : ACCT.discountRev(trx, bp, sch), woAcct = ACCT.writeOff(trx, bp, sch);
          var facts = trx.find('fact_acct', { ad_table_id: TABLE_ID.c_invoice, record_id: r.inv.c_invoice_id, c_acctschema_id: sch }).filter(function (f) { return f.line_id == null || f.line_id === ''; }).sort(function (a, b) { return Number(a.fact_acct_id) - Number(b.fact_acct_id); });
          if (!facts.length) { F.err = 'Cannot create Tax correction'; return false; }   // "Invoice not posted yet" -> p_Error (status E)
          if (facts.length >= 2) {
            var total = Z, ti = 0; facts.forEach(function (f, k) { var sd = D(f.amtsourcedr), sc = D(f.amtsourcecr);
              if ((sd.signum() > 0 && sd.compareTo(total) > 0) || (sd.signum() < 0 && sd.compareTo(total) < 0)) { total = sd; ti = k; }
              if ((sc.signum() > 0 && sc.compareTo(total) > 0) || (sc.signum() < 0 && sc.compareTo(total) < 0)) { total = sc; ti = k; } });
            var dt = nz(r.inv.c_doctype_id) ? trx.get('c_doctype', r.inv.c_doctype_id) : null, dbt = dt ? dt.docbasetype : '', prec = T.precisionOf(trx, as.c_currency_id), sc2 = as.c_currency_id;
            var calc = function (tax, amt) { if (tax.signum() === 0 || total.signum() === 0 || amt.signum() === 0) return Z; var m = tax.divide(total, 10, HU).multiply(amt); return m.scale() > prec ? m.setScale(prec, HU) : m; };   // calcAmount :2202
            var pair = function (xAcct, taxAcct, amount, taxIsDr) {                            // SO: ARC negates; AP: APC is the un-negated one
              var cm = isSO ? dbt === 'ARC' : dbt !== 'APC', a = cm ? amount.negate() : amount;
              if (taxIsDr) { F.line(taxAcct, sc2, a, null, base); F.line(xAcct, sc2, null, a, base); } else { F.line(xAcct, sc2, a, null, base); F.line(taxAcct, sc2, null, a, base); } };
            facts.forEach(function (f, k) { if (k === ti) return; var tacct = f.account_id;
              [[dAmt, discAcct], [wAmt, woAcct]].forEach(function (pr) { if (pr[0].signum() === 0) return;
                var isDr = D(f.amtsourcedr).signum() !== 0, amount = calc(isDr ? D(f.amtsourcedr) : D(f.amtsourcecr), pr[0]); if (amount.signum() === 0) return;
                pair(pr[1], tacct, amount, !isDr); }); });
          }
        }
        r.mac = mac;
      }
      if (!pice && rows.length && !interOrg && F.lines.length && F.lines.every(function (x) { return String(x.account_id) === String(F.lines[0].account_id); })) {
        var net = Z; F.lines.forEach(function (x) { net = net.add(D(x.amtsourcedr)).subtract(D(x.amtsourcecr)); }); if (net.signum() === 0) return named('allocation net-zero clearing-equal removal (:522-538)'); }
      if (fx || rows.some(function (q) { return q.inv && String(q.inv.c_currency_id) !== String(cur); })) {   // :493-516 realized gain/loss + :541-548 rounding corrections: none of them adds a line when the allocation books exactly what the
        var sum = function (rs, acct) { var sd = Z, ad = Z, sc = Z, ac = Z; rs.forEach(function (x) { if (String(x.account_id) !== String(acct)) return; sd = sd.add(D(x.amtsourcedr)); ad = ad.add(D(x.amtacctdr)); sc = sc.add(D(x.amtsourcecr)); ac = ac.add(D(x.amtacctcr)); }); return { sd: sd, ad: ad, sc: sc, ac: ac }; };   //   invoice / payment stored (Java: acctDifference == 0 -> "No Difference"); anything else is named, never invented
        var prec2 = T.precisionOf(trx, as.c_currency_id), tol = D('0.02'), part = function (srcAmt, accAmt, rec) {      // the "partial or MC" arm :952-966 / :1092-1107: source converted at the document's own date + type
          var rt = rate(trx, cur, as.c_currency_id, rec.dateacct, rec.c_conversiontype_id); if (!rt) return null; var a0 = D(srcAmt).multiply(rt).setScale(prec2, HU); return { a0: a0 }; };
        var revPair = ls.length === 2 && rows[0].inv && rows[1].inv && (nz(rows[0].inv.reversal_id) ? String(rows[0].inv.reversal_id) === String(rows[1].inv.c_invoice_id) : (nz(rows[1].inv.reversal_id) && String(rows[1].inv.reversal_id) === String(rows[0].inv.c_invoice_id)));   // isReversedInvoice :1908-1930
        var payCount = {}; rows.forEach(function (q) { if (q.pay) payCount[q.pay.c_payment_id] = (payCount[q.pay.c_payment_id] || 0) + 1; });
        // the gain/loss lines (createInvoiceGainLoss :973-1029 / createPaymentGainLoss :1113-1134), booked in the SCHEMA currency on the allocation line (DocLine -> org / BPartner / Line_ID):
        //   Fact.createLine(line, acct, cur, amt) :205-212 = DR amt, or CR |amt| when negative; Fact.createLine(line, dr, cr, cur, amt) :186-193 = DR dr, or CR cr |amt| when negative.
        var GL_BRK = (typeof process !== 'undefined' && process.env && process.env.LMV_BREAK) === 'nogainloss';   // witness negative control only (W-NC5BCD-GAINLOSS)
        var gdf = trx.q('SELECT realizedgain_acct AS g, realizedloss_acct AS l FROM c_acctschema_default WHERE c_acctschema_id=?', [sch])[0] || {}, vcG = function (id) { var v = nz(id) ? trx.get('c_validcombination', id) : null; return v ? v.account_id : null; };
        var rgain = vcG(gdf.g), rloss = vcG(gdf.l), s2 = function (q, aDr, aCr, amt, desc) { if (GL_BRK) return; var b = { ad_org_id: q.org, c_bpartner_id: q.l.c_bpartner_id, line_id: q.l.c_allocationline_id, qty: 0, description: desc };
          if (amt.signum() < 0) F.line(aCr, as.c_currency_id, null, amt.abs(), b); else F.line(aDr, as.c_currency_id, amt, null, b); };
        var sc2s = function (x, c) { return D(x).setScale(T.precisionOf(trx, c), HU).toString(); };   // the description's amounts at the scale Java's BigDecimals carry (fact sums / accounted / difference: currency precision)
        var fwdHdr = !nz(h.reversal_id) || Number(h.c_allocationhdr_id) < Number(h.reversal_id);   // :983 alloc.getReversal_ID() == 0 || alloc.get_ID() < alloc.getReversal_ID()
        for (var j = 0; j < rows.length; j++) { var q = rows[j], mine = F.lines.filter(function (x) { return String(x.line_id) === String(q.l.c_allocationline_id); });
          if (q.inv) {                                                                         // createInvoiceGainLoss :892-1030
            var iso = Y(q.inv.issotrx), idt = nz(q.inv.c_doctype_id) ? trx.get('c_doctype', q.inv.c_doctype_id) : null, cm = !!idt && (idt.docbasetype === 'ARC' || idt.docbasetype === 'APC'), gt = D(q.inv.grandtotal);
            var hasDebit = (iso && gt.signum() >= 0 && !cm) || (iso && gt.signum() < 0 && cm) || (!iso && gt.signum() >= 0 && cm) || (!iso && gt.signum() < 0 && !cm);   // hasDebitTradeAmt :1896
            var ifacts = trx.find('fact_acct', { ad_table_id: TABLE_ID.c_invoice, record_id: q.inv.c_invoice_id, c_acctschema_id: sch, account_id: q.mac, postingtype: 'A' });
            if (!ifacts.length) { F.err = 'Gain/Loss - Invoice not posted yet'; return false; }   // :924-926 -> p_Error (status E)
            var iv = sum(ifacts, q.mac), useDr = (!nz(q.inv.reversal_id) || Number(q.inv.c_invoice_id) < Number(q.inv.reversal_id)) ? hasDebit : !hasDebit, iSrc = useDr ? iv.sd : iv.sc, iAcc = useDr ? iv.ad : iv.ac;
            var al = sum(mine, q.mac), aSrc = iso ? al.sc : al.sd, aAcc = iso ? al.ac : al.ad, diff;
            if (aSrc.abs().compareTo(iSrc.abs()) === 0) diff = iAcc.abs().subtract(aAcc.abs());
            else { var pr = part(aSrc, aAcc, q.inv); if (!pr) return named('foreign-currency allocation gain/loss (no conversion rate)'); diff = pr.a0.abs().subtract(aAcc.abs()); if (diff.abs().compareTo(tol) < 0) diff = Z; }
            if (diff.signum() !== 0) {                                                           // :973-1029
              var full = aSrc.abs().compareTo(iSrc.abs()) === 0, idesc = 'Invoice=(' + q.inv.c_currency_id + ')' + sc2s(iSrc, q.inv.c_currency_id) + '/' + sc2s(iAcc, as.c_currency_id) + ' - Allocation=(' + cur + ')' + aSrc.toString() + '/' + sc2s(aAcc, as.c_currency_id) + ' - (' + (full ? 'full' : 'partial') + ') = ' + sc2s(diff, as.c_currency_id);
              var ig = revPair ? q.mac : rgain, il_ = revPair ? q.mac : rloss;                  // :978-981 isReversedInvoice: gain = loss = acct
              if (fwdHdr) { if (hasDebit) { s2(q, il_, ig, diff, idesc); s2(q, q.mac, q.mac, diff.negate(), idesc); } else { s2(q, q.mac, q.mac, diff, idesc); s2(q, il_, ig, diff.negate(), idesc); } }
              else { if (hasDebit) { s2(q, q.mac, q.mac, diff, idesc); s2(q, ig, il_, diff.negate(), idesc); } else { s2(q, ig, il_, diff, idesc); s2(q, q.mac, q.mac, diff.negate(), idesc); } }
              trx.say('§MODEL-POST allocation gain/loss invoice=' + q.inv.c_invoice_id + ' schema=' + sch + ' acctDifference=' + diff.toString() + ' (' + (full ? 'full' : 'partial') + ')');
            }
            if (!revPair) { var others = trx.q("SELECT 1 AS x FROM c_allocationline al JOIN c_allocationhdr ah ON ah.c_allocationhdr_id=al.c_allocationhdr_id WHERE al.c_invoice_id=? AND ah.c_allocationhdr_id<>? AND ah.docstatus IN ('CO','CL')", [q.inv.c_invoice_id, h.c_allocationhdr_id]);
              if (others.length) return named('foreign-currency allocation rounding correction across several allocations of one invoice (createInvoiceRoundingCorrection :1147-1530)'); }
          }
          if (q.pay && fx) {                                                                   // createPaymentGainLoss :1045-1135 (+ createPaymentRoundingCorrection :1535: one payment on several lines is named)
            var pa = payAcct(q), pf = pa == null ? [] : trx.find('fact_acct', { ad_table_id: TABLE_ID.c_payment, record_id: q.pay.c_payment_id, c_acctschema_id: sch, account_id: pa, postingtype: 'A' });
            if (!pf.length) continue;                                                            // "Payment not posted yet" -> return null (:1074)
            if (payCount[q.pay.c_payment_id] > 1) return named('foreign-currency allocation: one payment on several lines (createPaymentRoundingCorrection :1535)');
            var pv = sum(pf, pa), pSrc = pv.sd.signum() === 0 && pv.ad.signum() === 0 ? pv.sc : pv.sd, pAcc = pv.sd.signum() === 0 && pv.ad.signum() === 0 ? pv.ac : pv.ad, pl = sum(mine, pa), lSrc = isSOpay(q) ? pl.sd : pl.sc, lAcc = isSOpay(q) ? pl.ad : pl.ac, pd;
            if (lSrc.abs().compareTo(pSrc.abs()) === 0) pd = lAcc.abs().subtract(pAcc.abs());
            else { var pp = part(lSrc, lAcc, q.pay); if (!pp) return named('foreign-currency allocation gain/loss (no conversion rate)'); pd = lAcc.abs().subtract(pp.a0.abs()); if (pd.abs().compareTo(tol) < 0) pd = Z; }
            if (pd.signum() !== 0) {                                                             // :1113-1134
              var pfull = lSrc.abs().compareTo(pSrc.abs()) === 0, pdesc = 'Payment=(' + q.pay.c_currency_id + ')' + sc2s(pSrc, q.pay.c_currency_id) + '/' + sc2s(pAcc, as.c_currency_id) + ' - Allocation=(' + cur + ')' + lSrc.toString() + '/' + sc2s(lAcc, as.c_currency_id) + ' - (' + (pfull ? 'full' : 'partial') + ') = ' + sc2s(pd, as.c_currency_id);
              var prc = Y(q.pay.isreceipt), pam = D(q.pay.payamt);
              if ((prc && pam.signum() >= 0) || (!prc && pam.signum() < 0)) { s2(q, pa, pa, pd.negate(), pdesc); s2(q, rloss, rgain, pd, pdesc); }
              else { s2(q, pa, pa, pd, pdesc); s2(q, rloss, rgain, pd.negate(), pdesc); }
              trx.say('§MODEL-POST allocation gain/loss payment=' + q.pay.c_payment_id + ' schema=' + sch + ' acctDifference=' + pd.toString() + ' (' + (pfull ? 'full' : 'partial') + ')');
            }
          }
        }
        // Doc_AllocationHdr.balanceAccounting :1866-1890 (called :550 when the document currency != the schema currency): an accounting imbalance (here the per-line rounding of the converted amounts)
        //   is booked through Fact.createLine(null, ...) in the SCHEMA currency: UseCurrencyBalancing and |diff| < TOLERANCE 0.02 -> CurrencyBalancing_Acct, else RealizedLoss (DR) / RealizedGain (CR).
        var dd = Z; F.lines.forEach(function (x) { dd = dd.add(D(x.amtacctdr)).subtract(D(x.amtacctcr)); });
        if (fx && dd.signum() !== 0) {
          var gl = trx.q('SELECT usecurrencybalancing AS u, currencybalancing_acct AS a FROM c_acctschema_gl WHERE c_acctschema_id=?', [sch])[0], sd = trx.q('SELECT realizedgain_acct AS g, realizedloss_acct AS l FROM c_acctschema_default WHERE c_acctschema_id=?', [sch])[0], vcA = function (id) { var v = nz(id) ? trx.get('c_validcombination', id) : null; return v ? v.account_id : null; };
          var amt = dd.negate(), useCb = gl && Y(gl.u) && dd.abs().compareTo(D('0.02')) < 0, acct = useCb ? vcA(gl.a) : (amt.signum() < 0 ? vcA(sd && sd.g) : vcA(sd && sd.l));
          var lastBp = rows.length ? rows[rows.length - 1].l.c_bpartner_id : null;            // Doc.setC_BPartner_ID(line) stays set until the end of the loop (:559 resets it AFTER the Fact is built... :550 runs before)
          F.line(acct, as.c_currency_id, amt.signum() >= 0 ? amt : null, amt.signum() < 0 ? amt.abs() : null, { ad_org_id: h.ad_org_id, c_bpartner_id: lastBp, qty: 0, description: h.documentno });
        }
      }
      return true;
    }
  };

  // Doc.post :541-760 on a non-Y/non-d result: DocManager rolled the savepoint back (nothing but the status survives), `save` writes Posted=<status>
  // (:514-524, also after an error), and Doc.post stores an MNote (:706-750) - AD_Message PostingError-<status>, AD_User = the document's UpdatedBy, the
  // document's client/org, Record = (table,id), Reference = Doc.toString() (= the PO's toString), TextMsg as built below. Ported for the document classes whose
  // getAmount()/toString() are read: m_inout (Doc_InOut: amount 0, MInOut[id-docno,DocStatus=xx]); any other table keeps the status but writes NO note (named).
  var NOTE_DOC = { m_inout: { cls: 'Doc_InOut', model: 'MInOut', amount: function () { return 0; } } };
  function msgOf(trx, v, dflt) { var r = trx.q('SELECT msgtext AS t FROM ad_message WHERE value=? AND isactive=?', [v, 'Y'])[0]; return r && r.t != null ? r.t : dflt; }
  function elOf(trx, c, dflt) { var r = trx.q('SELECT name AS n FROM ad_element WHERE lower(columnname)=?', [c.toLowerCase()])[0]; return r && r.n != null ? r.n : dflt; }
  function usDate(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); return m ? m[2] + '/' + m[3] + '/' + m[1] : String(d); }   // DisplayType.getDateFormat(Date) en_US
  function amt2(n) { var s = Number(n).toFixed(2).split('.'); return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + s[1]; }                // DisplayType.getNumberFormat(Amount) en_US
  function postError(trx, sp, table, id, dt, as, status, ex) {
    trx.rollbackTo(sp);                                                                       // the savepoint: facts/costs/cost details of this attempt are gone
    var doc = trx.get(table, id), key = table + '_id';
    trx.update(table, doc, { posted: status });
    trx.say('§MODEL-POST table=' + table + ' id=' + id + ' posted=' + status + ' error="' + String(ex).slice(0, 160) + '"');
    var nd = NOTE_DOC[table];
    if (!nd) { trx.say('§MODEL-UNPORTED-DEP AD_Note PostingError-' + status + ' for ' + table + ' not written — its Doc class text (getAmount/toString) is not ported (named)'); return false; }
    var cols = ML.columnsOf(trx, 'ad_note'), mid = trx.q('SELECT ad_message_id AS i FROM ad_message WHERE value=?', ['PostingError-' + status])[0];
    if (!Object.keys(cols).length || !mid) { trx.say('§MODEL-UNPORTED-DEP ad_note/ad_message absent — AD_Note not written (named)'); return false; }
    var T_ = T.periodOpen(trx, doc.dateacct, dt ? dt.docbasetype : null, doc.ad_org_id), docStatus = (trx.q("SELECT name AS n FROM ad_ref_list WHERE ad_reference_id=131 AND value=?", [doc.docstatus])[0] || {}).n || doc.docstatus;
    var yn = function (b) { return msgOf(trx, String(!!b), b ? 'Yes' : 'No'); };
    var text = msgOf(trx, 'PostingError-' + status, 'Posting Error') + ' (' + String(ex) + ')' +
      ' - .' + nd.cls + ' (' + (dt ? dt.docbasetype : '') + ' - ' + elOf(trx, 'DocumentNo', 'Document No') + '=' + doc.documentno +
      ' - ' + elOf(trx, 'DateAcct', 'Account Date') + '=' + usDate(doc.dateacct) + ' - ' + msgOf(trx, 'Amount', 'Amount') + '=' + amt2(nd.amount(doc)) +
      ' - ' + elOf(trx, 'DocStatus', 'Document Status') + '=' + docStatus + ' - ' + msgOf(trx, 'PeriodOpen', 'Period Open') + '=' + yn(T_) +
      ' - ' + elOf(trx, 'IsBalanced', 'Balanced') + '=' + yn(true) + ' - ' + elOf(trx, 'C_AcctSchema_ID', 'Accounting Schema') + '=' + as.name;
    var f = { ad_client_id: doc.ad_client_id, ad_org_id: doc.ad_org_id, ad_message_id: mid.i, ad_user_id: nz(doc.updatedby) ? doc.updatedby : trx.env.user, ad_table_id: TABLE_ID[table] || ML.tableIdOf(trx, table),
      record_id: id, reference: nd.model + '[' + id + '-' + doc.documentno + ',DocStatus=' + doc.docstatus + ']', textmsg: text, processed: 'N' };
    Object.keys(f).forEach(function (k) { if (!cols[k]) delete f[k]; });
    trx.insert('ad_note', ML.newPO(trx, 'ad_note', f));
    trx.say('§MODEL-POST AD_Note PostingError-' + status + ' table=' + table + ' id=' + id + ' text="' + text.slice(0, 200) + '"');
    return false;
  }
  // Doc.post (acct/Doc.java:246-420) for every schema; all-or-none per document: the doc is Posted='Y' only when every schema balanced.
  // DocManager.postDocument (acct/DocManager.java:390-470: every schema, all-or-none under one savepoint) ∘ Doc.post :560-700
  // (repost → deleteAcct :768-802 backs the schema's facts up into T_Fact_Acct_History first; deferred → Posted='d').
  function post(trx, table, doc, opts) {
    var plug = _DP() && _DP().docClassFor(table), fn = DOC[table] || (plug && typeof plug.createFacts === 'function' ? plug.createFacts : null), key = table + '_id';   // a bundle's posting class (legacy IDocFactory): DocPoster registry, ONE registry for preview and Trx posting
    if (!fn) {
      // DefaultDocumentFactory.getDocument :87-107 THROWS AdempiereUserError "Doc Class invalid" when legacy has no Doc_<Table> class at all (a table with a Posted column and no class in core, e.g. DD_Order without Libero's
      //   Doc_DDOrder - SQLiteIDEMPIERE.md §72.1 F36): the completion itself fails. A class legacy HAS but the twin has not ported stays the soft "no Doc class ported" note below.
      var dpx = _DP(), tcols = ML.columnsOf(trx, table); if (tcols.posted && dpx && typeof dpx.legacyDocClassExists === 'function' && !dpx.legacyDocClassExists(tcols.__tableName)) throw new Error('Doc Class invalid: ' + dpx.legacyDocClassOf(tcols.__tableName));
      trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=N reason="no Doc class ported"'); return false;
    }
    doc = trx.get(table, doc[key]);
    var repost = !opts || opts.repost !== false;                                              // DocumentEngine.postImmediate → repost=true (:249)
    if (!repost && (doc.posted === 'Y')) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' AlreadyPosted'); return false; }
    var dtId = docTypeIdOf(trx, table, doc), dt = dtId ? T.dt(trx, dtId) : null, glcat = dt ? dt.gl_category_id : null;
    if (!glcat && dt == null && BASETYPE[table] == null) { var g0 = trx.q("SELECT gl_category_id AS g FROM gl_category WHERE ad_client_id=? AND isdefault='Y'", [trx.env.client])[0]; glcat = g0 ? g0.g : null; }
    var tid = TABLE_ID[table] || ML.tableIdOf(trx, table), per = periodId(trx, doc.dateacct || doc.movementdate), why = null, deferred = false, out = [], exc = null, excAs = null;
    var sp = trx.setSavepoint();                                                              // DocManager.postDocument :390 - one savepoint around every schema
    schemas(trx).forEach(function (as) {
      if (why || deferred) return;
      if (repost) {                                                                            // Doc.deleteAcct :768-802
        var old = trx.find('fact_acct', { ad_table_id: tid, record_id: doc[key], c_acctschema_id: as.c_acctschema_id });
        if (old.length) {
          var hasHist = true; try { trx.q('SELECT 1 FROM t_fact_acct_history LIMIT 1'); } catch (e) { hasHist = false; }
          old.forEach(function (f) { if (hasHist) { var h = Object.assign({}, f); trx.insert('t_fact_acct_history', h); } trx.del('fact_acct', f); });
          if (!hasHist) trx.say('§MODEL-UNPORTED-DEP T_Fact_Acct_History table absent in this DB — repost backup of ' + old.length + ' facts not written');
          trx.say('§MODEL-POST repost table=' + table + ' id=' + doc[key] + ' schema=' + as.c_acctschema_id + ' deleted=' + old.length);
        }
      }
      var F = new Fact(trx, table, doc, as, glcat);
      var ok;
      try { ok = fn(trx, doc, as, F); }
      catch (e) { if (!e || !e.jclass) throw e; exc = e; excAs = as; why = String(e); return; }   // Doc.post :680-686 - a Java exception from postLogic => status E, p_Error = e.toString() (a twin-side JS error is NOT one: it propagates)
      if (ok === 'DEFER') { deferred = true; return; }
      if (!ok || F.err) { why = F.err || 'createFacts failed'; excAs = as; return; }
      F.lines.forEach(function (f) { if (!nz(f.ad_org_id)) f.ad_org_id = f._dl && nz(f._dl.ad_org_id) ? f._dl.ad_org_id : doc.ad_org_id; });   // FactLine.getAD_Org_ID default (line, else doc) - resolved BEFORE the segment check reads it
      if (!BREAK_SEG) F.balanceSegments(Doc(trx, table, doc, { dateDoc: doc.movementdate || doc.datetrx || doc.dateinvoiced || doc.dateacct, dateAcct: doc.dateacct || doc.movementdate, c_currency_id: as.c_currency_id }));   // Doc.postLogic :851-870 (balanceSource n/a: the twin books source = accounted base)
      if (F.err) { why = F.err; excAs = as; return; }
      F.balance();
      F.lines.forEach(function (f) {
        var dl = f._dl; delete f._dl;
        if (!nz(f.ad_org_id)) f.ad_org_id = dl && nz(dl.ad_org_id) ? dl.ad_org_id : doc.ad_org_id;
        out.push(f);
      });
    });
    if (deferred) { trx.rollbackTo(sp); trx.update(table, doc, { posted: 'd' });   // Doc.post :612-618 defers before deleteAcct
      trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=d (deferred)'); return false; }
    if (exc) return postError(trx, sp, table, doc[key], dt, excAs, 'E', exc);
    // Doc.postLogic :817-830 - createFacts returned null with p_Error set by the Doc class ("No Costs for X", "Original Shipment/Receipt not posted yet", ...) => status E, the
    //   same savepoint rollback + Posted + AD_Note as an exception (the note text carries p_Error alone, no class name). A twin-side "not ported - named" refusal is NOT a legacy
    //   status: it keeps the old behaviour (Posted untouched, §MODEL-UNPORTED-DEP) so a missing port never masquerades as a legacy E.
    if (why && !/not ported|UNPORTED|— named|- named/.test(why)) return postError(trx, sp, table, doc[key], dt, excAs, 'E', why);
    if (why) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=N reason="' + why + '" (AD_Note PostingError: §MODEL-UNPORTED-DEP MNote not written)'); return false; }
    out.forEach(function (f) {
      trx.insert('fact_acct', ML.newPO(trx, 'fact_acct', Object.assign({ ad_table_id: tid, record_id: doc[key], c_period_id: per, gl_category_id: glcat,
        dateacct: doc.dateacct || doc.movementdate, datetrx: doc.dateinvoiced || doc.movementdate || doc.datetrx || doc.dateacct }, f)));
    });
    trx.update(table, doc, { posted: 'Y' });
    trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=Y facts=' + out.length);
    return true;
  }
  // ── previewFacts — the Posting-Preview's data source (W-PREVIEW-IS-POSTING; replaces doc_poster.derivePostings in erp_preview.js): the REAL post() above, run on the
  //   caller's Trx, which is NEVER committed (the host seam crud_overlay.withModelTrx / a witness hands a Trx that is dropped afterwards - nothing reaches the db, no Posted flag,
  //   no fact_acct row, no AD_Note). facts = the fact_acct CREATEs of the group = exactly what Complete writes; refusal = the text post() itself logged (or threw) when it posts nothing.
  function hasDocClass(table) { var plug = _DP() && _DP().docClassFor(String(table).toLowerCase()); return !!(DOC[String(table).toLowerCase()] || (plug && typeof plug.createFacts === 'function')); }
  function previewFacts(trx, table, id) {
    table = String(table).toLowerCase();
    var doc = trx.get(table, id);
    if (!doc) return { state: 'absent', posted: false, facts: [], refusal: null, say: [] };
    var mark = trx.log.length, res = false, exc = null;
    try { res = post(trx, table, doc, { repost: true }); } catch (e) { exc = String(e && e.message || e); }
    var say = trx.log.slice(mark), facts = [], refusal = null;
    if (res === true) trx.groupOps().forEach(function (o) { if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') facts.push(o.fields); });
    else {
      var ln = say.filter(function (l) { return /^§MODEL-POST table=\S+ id=\S+ posted=\S+ (reason|error)="/.test(l); })[0] || say.filter(function (l) { return /^§MODEL-POST table=/.test(l); })[0] || '';
      var m = ln.match(/(?:reason|error)="([^"]*)"/);
      refusal = exc || (m ? m[1] : (ln.replace(/^§MODEL-POST table=\S+ id=\S+ /, '') || 'not posted'));
    }
    say.push('§PREVIEW-POST table=' + table + ' id=' + id + ' posted=' + (res === true ? 'Y' : 'N') + ' facts=' + facts.length + (refusal ? ' refusal="' + String(refusal).slice(0, 160) + '"' : '') + ' committed=N');
    /*PREVIEW-END*/
    return { state: res === true ? 'posted' : 'refused', posted: res === true, facts: facts, refusal: refusal, say: say };
  }
  function _DP() { try { return (typeof module !== 'undefined' && module.exports) ? require('./doc_poster') : (typeof window !== 'undefined' ? window : globalThis).DocPoster; } catch (e) { return null; } }
  ML.setPoster(post);
  return { post: post, previewFacts: previewFacts, hasDocClass: hasDocClass, DOC: DOC, rate: rate, schemas: schemas, Doc: Doc, DocLine: DocLine, createLine: createLine, updateReverseLine: updateReverseLine };
});
