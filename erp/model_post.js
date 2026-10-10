// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_post.js — DocumentEngine.postImmediate for the documents the model completes: Doc.post per ACCOUNTING SCHEMA
// (acct/Doc.java:246 — every schema of the client, GardenWorld = 101 USD + 200000 EUR) + the costing it triggers
// (Doc_InOut → MCostDetail.createShipment → process per costing element → M_Cost / M_CostHistory / M_CostQueue).
// bim-compiler prompts/ERP_MODEL_LAYER.md §CHANGE-LIST E1-E2 — Witness: W-MODEL-ORACLE (fact_acct + m_cost* judged).
// Facts are written through the SAME Trx (one signed group with the completion). Accounts are READ from the master
// *_acct rows (C_ValidCombination → C_ElementValue), amounts from document rows, FX from C_Conversion_Rate — none invented.
// Doc classes ported here: Doc_Order (no facts — commitment accounting off), Doc_InOut (customer shipment C- / vendor
// receipt V+ via NotInvoicedReceipts), Doc_Invoice (ARI/ARC/API), Doc_Payment, Doc_AllocationHdr (payment↔invoice,
// no discount/write-off/FX-gain legs — those return a NAMED refusal, the doc stays Posted='N').
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'), require('./bigdecimal'));
  else root.ModelPost = factory(root.ModelLayer, root.ModelTrade, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T, BigDecimal) {
  var D = T.D, N = T.N, Y = T.Y, nz = T.nz, HU = T.HU, Z = T.Z;
  var TABLE_ID = { c_order: 259, m_inout: 319, c_invoice: 318, c_payment: 335, c_allocationhdr: 735 };

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
  var ACCT = {                                                                            // Doc*.getAccount sources (ProductCost/DocLine/Doc.getAccount)
    receivable: function (t, bp, s) { return vc(t, 'c_bp_customer_acct', 'c_receivable_acct', 'c_bpartner_id', bp, s); },
    liability: function (t, bp, s) { return vc(t, 'c_bp_vendor_acct', 'v_liability_acct', 'c_bpartner_id', bp, s); },
    revenue: function (t, p, s) { return vc(t, 'm_product_acct', 'p_revenue_acct', 'm_product_id', p, s); },
    expense: function (t, p, s) { return vc(t, 'm_product_acct', 'p_expense_acct', 'm_product_id', p, s); },
    cogs: function (t, p, s) { return vc(t, 'm_product_acct', 'p_cogs_acct', 'm_product_id', p, s); },
    asset: function (t, p, s) { return vc(t, 'm_product_acct', 'p_asset_acct', 'm_product_id', p, s); },
    nir: function (t, bp, s) { var g = t.get('c_bpartner', bp); return g ? vc(t, 'c_bp_group_acct', 'notinvoicedreceipts_acct', 'c_bp_group_id', g.c_bp_group_id, s) : null; },
    taxDue: function (t, x, s) { return vc(t, 'c_tax_acct', 't_due_acct', 'c_tax_id', x, s); },
    taxCredit: function (t, x, s) { return vc(t, 'c_tax_acct', 't_credit_acct', 'c_tax_id', x, s); },
    inTransit: function (t, b, s) { return vc(t, 'c_bankaccount_acct', 'b_intransit_acct', 'c_bankaccount_id', b, s); },
    unallocated: function (t, b, s) { return vc(t, 'c_bankaccount_acct', 'b_unallocatedcash_acct', 'c_bankaccount_id', b, s); }
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
    if ((dr == null || dr.signum() === 0) && (cr == null || cr.signum() === 0)) return;     // Fact.createLine: zero → no line
    var prec = T.precisionOf(this.trx, this.as.c_currency_id), r = rate(this.trx, cur, this.as.c_currency_id, this.doc.dateacct, this.doc.c_conversiontype_id);
    if (!r) { this.err = 'No conversion rate ' + cur + '→' + this.as.c_currency_id; return; }
    var src = T.precisionOf(this.trx, cur);
    this.lines.push(Object.assign({ c_acctschema_id: this.as.c_acctschema_id, account_id: acct, c_currency_id: cur, postingtype: 'A',
      amtsourcedr: dr ? N(dr.setScale(src, HU)) : 0, amtsourcecr: cr ? N(cr.setScale(src, HU)) : 0,
      amtacctdr: dr ? N(dr.multiply(r).setScale(prec, HU)) : 0, amtacctcr: cr ? N(cr.multiply(r).setScale(prec, HU)) : 0 }, extra || {}));
  };
  // Fact.isBalanced/balanceSource — a rounding difference on the converted side is booked to the larger line (Fact.balanceAccounting)
  Fact.prototype.balance = function () {
    var dr = Z, cr = Z; this.lines.forEach(function (l) { dr = dr.add(D(l.amtacctdr)); cr = cr.add(D(l.amtacctcr)); });
    var diff = dr.subtract(cr); if (diff.signum() === 0 || !this.lines.length) return;
    var big = this.lines.slice().sort(function (a, b) { return Math.abs(b.amtacctdr + b.amtacctcr) - Math.abs(a.amtacctdr + a.amtacctcr); })[0];
    if (diff.signum() > 0) { if (big.amtacctcr) big.amtacctcr = N(D(big.amtacctcr).add(diff)); else big.amtacctdr = N(D(big.amtacctdr).subtract(diff)); }
    else { if (big.amtacctdr) big.amtacctdr = N(D(big.amtacctdr).subtract(diff)); else big.amtacctcr = N(D(big.amtacctcr).add(diff)); }
  };

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
    return Object.assign({ table: table, row: l, id: l[table + '_id'], line: l.line, description: l.description, m_product_id: l.m_product_id, c_uom_id: l.c_uom_id, c_tax_id: l.c_tax_id,
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
      var ct = (dl && nz(dl.c_conversiontype_id)) ? dl.c_conversiontype_id : ctx.c_conversiontype_id, r = rate(trx, cur, as.c_currency_id, fl.dateacct, ct), prec = T.precisionOf(trx, as.c_currency_id);
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
      if (Number(lineId) > 0) { if (String(f.line_id) !== String(lineId)) return false; } else if (f.line_id != null && f.line_id !== '') return false;
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
      var cd = trx.find('m_costdetail', { m_inoutline_id: dl.id, m_attributesetinstance_id: dl.pcAsi != null ? dl.pcAsi : (dl.m_attributesetinstance_id || 0), c_acctschema_id: as.c_acctschema_id })[0];
      if (cd) { var amt = D(cd.amt), pcost = pc(cd); if (amt.signum() !== 0 && pcost.signum() !== 0 && amt.signum() !== pcost.signum()) return amt.signum() > 0 ? pcost.negate() : pcost; return pcost; }
    }
    return pc(null);
  }
  // Doc_InOut — loadDocumentDetails :84-113, loadLines :121-153, createFacts :185-1120 (MMS-SO, MMR-PO ported; MMR-SO / MMS-PO named)
  function Doc_InOut(trx, io, as, F) {
    var dt = T.dt(trx, io.c_doctype_id), so = Y(io.issotrx), dbt = dt.docbasetype, M = mc();
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
          if (batchLot && !nz(line.m_attributesetinstance_id)) { F.err = 'Doc_InOut batch-lot reversal (findReversalCostDetailAmt, Doc_InOut.java:343-348) — §MODEL-UNPORTED-DEP'; return false; }
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
            var amt = ma._cost; if (amt == null) amt = costs.divide(line.pcQty, costs.scale(), HU).multiply(q);
            else if (line.pcQty.signum() !== line.qty.signum() && amt.signum() !== costs.signum() * -1) amt = amt.negate();
            if (!M.createShipment(trx, as, line.ad_org_id, line.m_product_id, ma.m_attributesetinstance_id, line.id, 0, amt, q, line.description, true, line.dateAcct || ctx.dateAcct, 0)) { F.err = 'Failed to create cost detail record'; return false; } }
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
    F.err = 'Doc_InOut ' + dbt + (so ? ' SO (customer return :452-675)' : ' PO (vendor return :922-1120)') + ' — §MODEL-UNPORTED-DEP not ported in this pass'; return false;
  }
  function isBalancedAcct(F) { var s = Z; F.lines.forEach(function (l) { s = s.add(D(l.amtacctdr)).subtract(D(l.amtacctcr)); }); return s.signum() === 0; }

  // ── the Doc_* classes: createFacts(trx, doc, as, fact) ──
  var DOC = {
    c_order: function () { return true; },                                                  // Doc_Order: no commitment accounting → no facts, Posted='Y'
    m_inout: function (trx, io, as, F) { return Doc_InOut(trx, io, as, F); },
    c_invoice: function (trx, inv, as, F) {                                                  // Doc_Invoice.createFacts ARI :~360-460
      var dt = T.dt(trx, inv.c_doctype_id), cur = inv.c_currency_id, from = locOfOrg(trx, inv.ad_org_id), to = locOfBP(trx, inv.c_bpartner_location_id);
      // FactLine.setDocumentInfo :364-500 — "<DocumentNo>" + (" #<Line>" + " (<line desc | doc desc>)" | " (<doc desc>)") — the reversal's "({->orig))" lands here
      var hasDesc = function (v) { return v != null && String(v).length > 0; };
      var base = { ad_org_id: inv.ad_org_id, c_bpartner_id: inv.c_bpartner_id, c_locfrom_id: from, c_locto_id: to, description: inv.documentno + (hasDesc(inv.description) ? ' (' + inv.description + ')' : '') };
      if (dt.docbasetype !== 'ARI') { F.err = 'Doc_Invoice ' + dt.docbasetype + ' not ported in model_post — named'; return false; }
      F.line(ACCT.receivable(trx, inv.c_bpartner_id, as.c_acctschema_id), cur, inv.grandtotal, null, Object.assign({ qty: 0 }, base));
      trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }).forEach(function (t) {
        F.line(ACCT.taxDue(trx, t.c_tax_id, as.c_acctschema_id), cur, null, t.taxamt, Object.assign({ c_tax_id: t.c_tax_id, qty: 0 }, base)); });
      trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }, ['line']).forEach(function (l) {
        if (!nz(l.m_product_id)) { F.err = 'charge/description invoice line posting not ported — named'; return; }
        F.line(ACCT.revenue(trx, l.m_product_id, as.c_acctschema_id), cur, null, l.linenetamt, Object.assign({}, base, { line_id: l.c_invoiceline_id, m_product_id: l.m_product_id,
          c_uom_id: l.c_uom_id, c_tax_id: l.c_tax_id, qty: N(D(l.qtyinvoiced).negate()), description: inv.documentno + ' #' + l.line + (hasDesc(l.description) ? ' (' + l.description + ')' : hasDesc(inv.description) ? ' (' + inv.description + ')' : '') })); });
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
    c_allocationhdr: function (trx, h, as, F) {                                              // Doc_AllocationHdr — payment ↔ AR invoice, AR invoice ↔ AR invoice; no discount/write-off/realized FX
      var ok = true, ls = trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }, ['c_allocationline_id']);
      if (ls.length === 2) {                                                                 // :199-213 "Do not create fact lines for reversal of invoice"
        var l1 = ls[0], l2 = ls[1], only = function (l) { return !nz(l.c_payment_id) && !nz(l.c_order_id) && !nz(l.c_cashline_id) && nz(l.c_invoice_id) > 0; };
        if (only(l1) && only(l2)) { var i1 = trx.get('c_invoice', l1.c_invoice_id), i2 = trx.get('c_invoice', l2.c_invoice_id);
          if (i1 && i2 && D(i1.grandtotal).compareTo(D(i2.grandtotal).negate()) === 0 && String(i2.reversal_id) === String(i1.c_invoice_id)) return true; }   // (BigDecimal.equals: same value; the scale of a stored REAL is not observable here — named)
      }
      ls.forEach(function (l) {
        if (D(l.discountamt).signum() || D(l.writeoffamt).signum() || nz(l.c_cashline_id) || !nz(l.c_invoice_id)) { F.err = 'allocation discount/write-off/cash/no-invoice legs not ported — named'; ok = false; return; }
        var p = nz(l.c_payment_id) ? trx.get('c_payment', l.c_payment_id) : null, inv = trx.get('c_invoice', l.c_invoice_id);
        if (!Y(inv.issotrx)) { F.err = 'AP allocation not ported — named'; ok = false; return; }
        var base = { ad_org_id: h.ad_org_id, c_bpartner_id: l.c_bpartner_id, line_id: l.c_allocationline_id, qty: 0, description: h.documentno + ' #0' + (h.description ? ' (' + h.description + ')' : '') };
        if (p) F.line(ACCT.unallocated(trx, p.c_bankaccount_id, as.c_acctschema_id), h.c_currency_id, l.amount, null, Object.assign({}, base, { ad_org_id: p.ad_org_id }));   // :308-321 Payment DR at the payment org (only with a payment)
        F.line(ACCT.receivable(trx, inv.c_bpartner_id, as.c_acctschema_id), h.c_currency_id, null, l.amount, Object.assign({}, base, { ad_org_id: inv.ad_org_id }));   // :347-357 AR CR at the invoice org
      });
      return ok;
    }
  };

  // Doc.post (acct/Doc.java:246-420) for every schema; all-or-none per document: the doc is Posted='Y' only when every schema balanced.
  // DocManager.postDocument (acct/DocManager.java:390-470: every schema, all-or-none under one savepoint) ∘ Doc.post :560-700
  // (repost → deleteAcct :768-802 backs the schema's facts up into T_Fact_Acct_History first; deferred → Posted='d').
  function post(trx, table, doc, opts) {
    var fn = DOC[table], key = table + '_id';
    if (!fn) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=N reason="no Doc class ported"'); return false; }
    doc = trx.get(table, doc[key]);
    var repost = !opts || opts.repost !== false;                                              // DocumentEngine.postImmediate → repost=true (:249)
    if (!repost && (doc.posted === 'Y')) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' AlreadyPosted'); return false; }
    var dtId = docTypeIdOf(trx, table, doc), dt = dtId ? T.dt(trx, dtId) : null, glcat = dt ? dt.gl_category_id : null;
    if (!glcat && dt == null && BASETYPE[table] == null) { var g0 = trx.q("SELECT gl_category_id AS g FROM gl_category WHERE ad_client_id=? AND isdefault='Y'", [trx.env.client])[0]; glcat = g0 ? g0.g : null; }
    var tid = TABLE_ID[table] || ML.tableIdOf(trx, table), per = periodId(trx, doc.dateacct), why = null, deferred = false, out = [];
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
      var ok = fn(trx, doc, as, F);
      if (ok === 'DEFER') { deferred = true; return; }
      if (!ok || F.err) { why = F.err || 'createFacts failed'; return; }
      F.balance();
      F.lines.forEach(function (f) {
        var dl = f._dl; delete f._dl;
        if (!nz(f.ad_org_id)) f.ad_org_id = dl && nz(dl.ad_org_id) ? dl.ad_org_id : doc.ad_org_id;   // FactLine.getAD_Org_ID default (line, else doc)
        out.push(f);
      });
    });
    if (deferred) { trx.update(table, doc, { posted: 'd' }); trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=d (deferred)'); return false; }
    if (why) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=N reason="' + why + '" (AD_Note PostingError: §MODEL-UNPORTED-DEP MNote not written)'); return false; }
    out.forEach(function (f) {
      trx.insert('fact_acct', ML.newPO(trx, 'fact_acct', Object.assign({ ad_table_id: tid, record_id: doc[key], c_period_id: per, gl_category_id: glcat,
        dateacct: doc.dateacct, datetrx: doc.dateinvoiced || doc.movementdate || doc.datetrx || doc.dateacct }, f)));
    });
    trx.update(table, doc, { posted: 'Y' });
    trx.say('§MODEL-POST table=' + table + ' id=' + doc[key] + ' posted=Y facts=' + out.length);
    return true;
  }
  ML.setPoster(post);
  return { post: post, DOC: DOC, rate: rate, schemas: schemas, Doc: Doc, DocLine: DocLine, createLine: createLine, updateReverseLine: updateReverseLine };
});
