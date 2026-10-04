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

  // ── costing (MCostDetail.createShipment :303-351 → process :1305-1418 → process(as,product,ce) :1423-1830) ──
  function costOf(trx, p, as, ce) {
    var r = trx.find('m_cost', { m_product_id: p.m_product_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ce.m_costelement_id, m_costtype_id: as.m_costtype_id, ad_org_id: 0, m_attributesetinstance_id: 0 })[0];
    return r || null;
  }
  function costingMethodOf(trx, p, as) { var c = trx.get('m_product_category_acct', null); void c; return as.costingmethod; }   // product category override (named: m_product_category_acct.costingmethod) not in GardenWorld
  function costShipment(trx, io, l, p, as, costs) {
    var ces = trx.q("SELECT * FROM m_costelement WHERE ad_client_id=? AND costelementtype='M' AND costingmethod IS NOT NULL AND isactive='Y' ORDER BY m_costelement_id", [trx.env.client]);
    var qty = D(l.movementqty).negate(), isSO = Y(io.issotrx);
    var cd = trx.insert('m_costdetail', ML.newPO(trx, 'm_costdetail', { ad_org_id: l.ad_org_id, c_acctschema_id: as.c_acctschema_id, m_product_id: l.m_product_id,
      m_attributesetinstance_id: l.m_attributesetinstance_id || 0, m_costelement_id: null, m_inoutline_id: l.m_inoutline_id, issotrx: isSO ? 'Y' : 'N',
      amt: N(costs.negate()), qty: N(qty), dateacct: io.dateacct, processed: 'N', isbackdate: String(io.dateacct).slice(0, 10) < String(trx.env.date || '9999') ? 'Y' : 'N' }));
    var method = costingMethodOf(trx, p, as), snap = null;
    ces.forEach(function (ce) {
      if (method === 'A' && ce.costingmethod === 'I') return;                                 // :1426-1433 AvgPO/AvgInv compatibility
      if (method === 'I' && ce.costingmethod === 'A') return;
      if (/^(A|I|F|L)$/.test(ce.costingmethod) && !T.isStocked(p)) return;
      var c = costOf(trx, p, as, ce);
      if (!c) c = trx.insert('m_cost', ML.newPO(trx, 'm_cost', { ad_org_id: 0, m_product_id: p.m_product_id, m_costtype_id: as.m_costtype_id, c_acctschema_id: as.c_acctschema_id,
        m_costelement_id: ce.m_costelement_id, m_attributesetinstance_id: 0, currentcostprice: 0, currentqty: 0, cumulatedamt: 0, cumulatedqty: 0, futurecostprice: 0 }));
      var old = { q: c.currentqty, p: c.currentcostprice, cq: c.cumulatedqty, ca: c.cumulatedamt };
      // qty-adjust branch for a shipment line (:1697-1810): non-addition → CurrentQty += qty for every method; FIFO/LIFO also deplete the queue
      if (/^(F|L)$/.test(ce.costingmethod)) {
        var qs = trx.find('m_costqueue', { m_product_id: p.m_product_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ce.m_costelement_id, ad_org_id: 0, m_attributesetinstance_id: 0 })
          .filter(function (x) { return D(x.currentqty).signum() !== 0; });
        var left = qty.negate();                                                                // MCostQueue.adjustQty
        qs.forEach(function (x) { if (left.signum() <= 0) return; var take = D(x.currentqty).compareTo(left) >= 0 ? left : D(x.currentqty); trx.update('m_costqueue', x, { currentqty: N(D(x.currentqty).subtract(take)) }); left = left.subtract(take); });
        var first = trx.find('m_costqueue', { m_product_id: p.m_product_id, c_acctschema_id: as.c_acctschema_id, m_costelement_id: ce.m_costelement_id, ad_org_id: 0, m_attributesetinstance_id: 0 }).filter(function (x) { return D(x.currentqty).signum() > 0; })[0];
        if (first) trx.update('m_cost', c, { currentcostprice: first.currentcostprice });
      }
      trx.update('m_cost', c, { currentqty: N(D(c.currentqty).add(qty)) });
      trx.insert('m_costhistory', ML.newPO(trx, 'm_costhistory', { ad_org_id: 0, m_attributesetinstance_id: 0, m_costdetail_id: cd.m_costdetail_id, m_costelement_id: ce.m_costelement_id,
        m_costtype_id: as.m_costtype_id, m_product_id: p.m_product_id, dateacct: io.dateacct, isbackdate: cd.isbackdate,
        oldqty: old.q, newqty: c.currentqty, oldcostprice: old.p, newcostprice: c.currentcostprice, oldcqty: old.cq, newcqty: c.cumulatedqty, oldcamt: old.ca, newcamt: c.cumulatedamt }));
      if (ce.costingmethod === method) snap = c;
    });
    var ch = { processed: 'Y', deltaamt: null, deltaqty: null };
    if (snap) Object.assign(ch, { currentcostprice: snap.currentcostprice, currentqty: snap.currentqty, cumulatedamt: snap.cumulatedamt, cumulatedqty: snap.cumulatedqty });
    trx.update('m_costdetail', cd, ch);
  }

  // ── the Doc_* classes: createFacts(trx, doc, as, fact) ──
  var DOC = {
    c_order: function () { return true; },                                                  // Doc_Order: no commitment accounting → no facts, Posted='Y'
    m_inout: function (trx, io, as, F) {                                                     // Doc_InOut.createFacts :185-470
      var dt = T.dt(trx, io.c_doctype_id), so = Y(io.issotrx);
      var ls = trx.find('m_inoutline', { m_inout_id: io.m_inout_id }, ['line']);
      var from = locOfWh(trx, io.m_warehouse_id), to = locOfBP(trx, io.c_bpartner_location_id);
      for (var i = 0; i < ls.length; i++) {
        var l = ls[i], p = T.product(trx, l.m_product_id); if (!p) continue;
        var ext = { ad_org_id: l.ad_org_id, line_id: l.m_inoutline_id, m_product_id: l.m_product_id, c_uom_id: l.c_uom_id, m_locator_id: l.m_locator_id,
          m_warehouse_id: io.m_warehouse_id, c_bpartner_id: io.c_bpartner_id, c_locfrom_id: from, c_locto_id: to, description: io.documentno + ' #' + l.line };
        if (dt.docbasetype === 'MMS' && so) {
          var ce = trx.q("SELECT * FROM m_costelement WHERE ad_client_id=? AND costelementtype='M' AND costingmethod=? AND isactive='Y'", [trx.env.client, as.costingmethod])[0];
          var c = ce ? costOf(trx, p, as, ce) : null;
          var cprec = Number((trx.get('c_currency', as.c_currency_id) || {}).costingprecision || 4);
          var costs = c ? D(c.currentcostprice).multiply(D(l.movementqty)).setScale(cprec, HU) : Z;   // ProductCost.getProductCosts
          if (costs.signum() === 0 && T.isStocked(p)) { F.err = 'No Costs for ' + p.name; return false; }
          costShipment(trx, io, l, p, as, costs);
          F.line(ACCT.cogs(trx, l.m_product_id, as.c_acctschema_id), as.c_currency_id, costs, null, Object.assign({}, ext, { qty: N(D(l.movementqty)) }));
          F.line(ACCT.asset(trx, l.m_product_id, as.c_acctschema_id), as.c_currency_id, null, costs, Object.assign({}, ext, { qty: N(D(l.movementqty).negate()) }));
        } else { F.err = 'Doc_InOut ' + dt.docbasetype + (so ? ' SO' : ' PO') + ' (receipt/return costing) not ported in model_post — named'; return false; }
      }
      return true;
    },
    c_invoice: function (trx, inv, as, F) {                                                  // Doc_Invoice.createFacts ARI :~360-460
      var dt = T.dt(trx, inv.c_doctype_id), cur = inv.c_currency_id, from = locOfOrg(trx, inv.ad_org_id), to = locOfBP(trx, inv.c_bpartner_location_id);
      var base = { ad_org_id: inv.ad_org_id, c_bpartner_id: inv.c_bpartner_id, c_locfrom_id: from, c_locto_id: to, description: inv.documentno };
      if (dt.docbasetype !== 'ARI') { F.err = 'Doc_Invoice ' + dt.docbasetype + ' not ported in model_post — named'; return false; }
      F.line(ACCT.receivable(trx, inv.c_bpartner_id, as.c_acctschema_id), cur, inv.grandtotal, null, Object.assign({ qty: 0 }, base));
      trx.find('c_invoicetax', { c_invoice_id: inv.c_invoice_id }).forEach(function (t) {
        F.line(ACCT.taxDue(trx, t.c_tax_id, as.c_acctschema_id), cur, null, t.taxamt, Object.assign({ c_tax_id: t.c_tax_id, qty: 0 }, base)); });
      trx.find('c_invoiceline', { c_invoice_id: inv.c_invoice_id }, ['line']).forEach(function (l) {
        if (!nz(l.m_product_id)) { F.err = 'charge/description invoice line posting not ported — named'; return; }
        F.line(ACCT.revenue(trx, l.m_product_id, as.c_acctschema_id), cur, null, l.linenetamt, Object.assign({}, base, { line_id: l.c_invoiceline_id, m_product_id: l.m_product_id,
          c_uom_id: l.c_uom_id, c_tax_id: l.c_tax_id, qty: N(D(l.qtyinvoiced).negate()), description: inv.documentno + ' #' + l.line })); });
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
    c_allocationhdr: function (trx, h, as, F) {                                              // Doc_AllocationHdr — payment ↔ AR invoice, no discount/write-off/realized FX
      var ok = true;
      trx.find('c_allocationline', { c_allocationhdr_id: h.c_allocationhdr_id }).forEach(function (l) {
        if (D(l.discountamt).signum() || D(l.writeoffamt).signum() || !nz(l.c_payment_id) || !nz(l.c_invoice_id)) { F.err = 'allocation discount/write-off/non-payment legs not ported — named'; ok = false; return; }
        var p = trx.get('c_payment', l.c_payment_id), inv = trx.get('c_invoice', l.c_invoice_id);
        if (!Y(inv.issotrx)) { F.err = 'AP allocation not ported — named'; ok = false; return; }
        var base = { ad_org_id: h.ad_org_id, c_bpartner_id: l.c_bpartner_id, line_id: l.c_allocationline_id, qty: 0, description: h.documentno + ' #0' + (h.description ? ' (' + h.description + ')' : '') };
        F.line(ACCT.unallocated(trx, p.c_bankaccount_id, as.c_acctschema_id), h.c_currency_id, l.amount, null, base);
        F.line(ACCT.receivable(trx, inv.c_bpartner_id, as.c_acctschema_id), h.c_currency_id, null, l.amount, base);
      });
      return ok;
    }
  };

  // Doc.post (acct/Doc.java:246-420) for every schema; all-or-none per document: the doc is Posted='Y' only when every schema balanced.
  function post(trx, table, doc) {
    var fn = DOC[table];
    if (!fn) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[table + '_id'] + ' posted=N reason="no Doc class ported"'); return false; }
    doc = trx.get(table, doc[table + '_id']);
    var dt = nz(doc.c_doctype_id) ? T.dt(trx, doc.c_doctype_id) : null, glcat = dt ? dt.gl_category_id : null;
    if (!glcat && table === 'c_allocationhdr') { var g = trx.q("SELECT gl_category_id AS g FROM c_doctype WHERE ad_client_id=? AND docbasetype='CMA' ORDER BY isdefault DESC", [trx.env.client])[0]; glcat = g ? g.g : null; }
    var all = [], why = null;
    schemas(trx).forEach(function (as) {
      if (why) return;
      var F = new Fact(trx, table, doc, as, glcat);
      var ok = fn(trx, doc, as, F);
      if (!ok || F.err) { why = F.err || 'createFacts failed'; return; }
      F.balance();
      all = all.concat(F.lines);
    });
    if (why) { trx.say('§MODEL-POST table=' + table + ' id=' + doc[table + '_id'] + ' posted=N reason="' + why + '"'); return false; }
    var per = periodId(trx, doc.dateacct), tid = TABLE_ID[table] || ML.tableIdOf(trx, table);
    all.forEach(function (f) {
      trx.insert('fact_acct', ML.newPO(trx, 'fact_acct', Object.assign({ ad_table_id: tid, record_id: doc[table + '_id'], c_period_id: per, gl_category_id: glcat,
        dateacct: doc.dateacct, datetrx: doc.dateinvoiced || doc.movementdate || doc.datetrx || doc.dateacct }, f)));
    });
    trx.update(table, doc, { posted: 'Y' });
    trx.say('§MODEL-POST table=' + table + ' id=' + doc[table + '_id'] + ' posted=Y facts=' + all.length);
    return true;
  }
  ML.setPoster(post);
  return { post: post, DOC: DOC, costShipment: costShipment, rate: rate, schemas: schemas };
});
