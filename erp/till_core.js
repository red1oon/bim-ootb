// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_core.js: the pure business glue of the Unicenta-alike till. READ THE LOG (§TILL_* lines of erp/tests/witness_till.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §15.2-§15.3 - Witness: W-TILL-DEPOSIT. The till DEPOSITS: it builds I_Order / I_Payment rows and nothing else. Prices and taxes come from the ENGINE's own functions
//   (ERPEngine.taxLookup / orderTaxes, erp_engine.js:538,588): this file holds no tax formula. Pure UMD, no DOM.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TillCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // U8 sale tabs in Unicenta's order (uniCenta 5.0 JPaymentSelectReceipt.java:67-75, labels pos_messages.properties tab.* ; 3.81 had the first seven) -> I_Payment.TenderType (AD_Reference 214). §15.3. A tab with no mapping is DISABLED with its reason.
  var TENDERS = [
    { name: 'cash',   label: 'Cash',    tender: 'X', live: true },
    { name: 'cheque', label: 'Cheque',  tender: 'K', live: true },
    { name: 'paperin', label: 'Voucher', tender: null, live: false, reason: 'AD_Reference 214 has no voucher value; no extracted mapping' },
    { name: 'magcard', label: 'Card',   tender: 'C', live: true },
    { name: 'free',   label: 'Free',    tender: null, live: false, reason: 'a zero-amount settlement has no AD_Reference 214 value; no extracted mapping' },
    { name: 'debt',   label: 'Debt',    tender: null, live: false, reason: 'an on-credit ticket has no tender and Import POS Sales refuses a ticket without tenders; needs a customer (U12, slice 2)' },
    { name: 'bank',   label: 'Bank',    tender: 'A', live: true },
    { name: 'slip',   label: 'Slip',    tender: null, live: false, reason: 'no AD_Reference 214 value is a bank slip; no extracted mapping (uniCenta 5.0 JPaymentSlip.java:76)' }
  ];
  // U11 refund tabs (5.0 JPaymentSelectRefund.java:67-70 : Refund(cash), Cheque, Voucher, Card): names cashrefund/chequerefund/paperout/magcardrefund (PaymentInfo*Refund, 3.81 JPaymentSelect.java:467,503,539) -> the same TenderType as the sale tab; the PayAmt is NEGATIVE
  var REFUND_TENDERS = [
    { name: 'cashrefund',   label: 'Refund',  tender: 'X', live: true },
    { name: 'chequerefund', label: 'Cheque',  tender: 'K', live: true },
    { name: 'paperout',     label: 'Voucher', tender: null, live: false, reason: 'AD_Reference 214 has no voucher value; no extracted mapping' },
    { name: 'magcardrefund', label: 'Card',   tender: 'C', live: true }
  ];
  // U12 customer-payment tabs (5.0 JPaymentSelectCustomer.java:67-72): Cash, Cheque, Voucher, Bank, Card, Slip = the sale tabs minus Free and Debt
  var CUSTOMER_TENDERS = ['cash', 'cheque', 'paperin', 'bank', 'magcard', 'slip'];
  function tenderOf(name) { return TENDERS.concat(REFUND_TENDERS).filter(function (t) { return t.name === name; })[0] || null; }
  function tabsFor(kind) { return kind === 'R' ? REFUND_TENDERS : kind === 'P' ? CUSTOMER_TENDERS.map(tenderOf) : TENDERS; }
  // a ticket line list with its Line Discount lines (script.Linediscount.txt: a `disc` line follows its parent) folded into the parent's unit price: what travels (Import Orders needs a product per line) and what the totals are made of
  function foldLines(lines) {
    var out = [], last = null;
    lines.forEach(function (l) {
      if (l.disc && last) { last.price = (last.qty * last.price + l.qty * l.price) / last.qty; return; }
      last = { pid: l.pid, name: l.name, qty: l.qty, price: Number(l.price) }; out.push(last);
    });
    return out;
  }
  var cents = function (v) { return Math.round(Number(v || 0) * 100 + (Number(v) < 0 ? -1e-7 : 1e-7)); };
  var money = function (c) { return (c / 100).toFixed(2); };
  // MOrderLine.setLineNetAmt: QtyOrdered x PriceActual at currency precision
  var lineNetCents = function (qty, price) { return cents(Number(qty) * Number(price)); };

  // ── the ticket key (§15.2): <OrgValue>-<TillUserValue>-<T><n> ; n = max(local counter, highest deposited n of this till and type)+1
  function keyPrefix(org, till, type) { return org + '-' + till + '-' + type; }
  function nextNumber(prefix, localCounter, depositedDocNos) {
    var hi = Number(localCounter || 0), re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
    (depositedDocNos || []).forEach(function (d) { var m = re.exec(String(d)); if (m && Number(m[1]) > hi) hi = Number(m[1]); });
    return hi + 1;
  }

  // ── totals through the engine: lines [{pid, qty, price}], env { Eng, taxOf(pid) -> {ok,c_tax_id}, taxById, taxChildren, included }
  function totals(lines, env) {
    var soLines = [], err = null;
    lines.forEach(function (l) {
      var t = env.taxOf(l.pid); if (!t || !t.ok) { err = err || 'tax-not-found product ' + l.pid; return; }
      soLines.push({ c_tax_id: t.c_tax_id, linenetamt: lineNetCents(l.qty, l.price) / 100 });
    });
    if (err) return { ok: false, error: err };
    if (!soLines.length) return { ok: true, net: 0, tax: 0, gross: 0, rows: [] };
    var r = env.Eng.orderTaxes(soLines, env.taxById, !!env.included, env.taxChildren);
    var bad = r.rows.filter(function (x) { return x.error; })[0]; if (bad) return { ok: false, error: bad.error };
    return { ok: true, net: r.totalLines, tax: r.grandTotal - r.totalLines, gross: r.grandTotal, rows: r.rows };
  }

  // ── tenders: part payments [{name, tendered(cents), ref, auth}] against a gross; the amount APPLIED never exceeds what is left (over-payment is change, never deposited)
  function applyTenders(parts, gross) {
    var left = gross, out = [], change = 0;
    parts.forEach(function (p) {
      var t = tenderOf(p.name); if (!t || !t.live) { out.push({ name: p.name, error: 'tender-not-live' }); return; }
      var tendered = Number(p.tendered), applied = Math.min(tendered, Math.max(left, 0));
      if (applied < tendered) { if (p.name !== 'cash') { out.push({ name: p.name, error: 'over-tender-only-cash-gives-change' }); return; } change += tendered - applied; }
      left -= applied; out.push({ name: p.name, tender: t.tender, tendered: tendered, applied: applied, ref: p.ref || null, auth: p.auth || null });
    });
    return { parts: out, remaining: left, change: change, ok: out.every(function (o) { return !o.error; }) };
  }

  // ── the deposit rows (§15.2). ctx { client, org, iso, uomOf(pid), day, shiftTag }
  function depositRows(ticket, key, applied, ctx) {
    var sgn = ctx.sign || 1;
    var orders = ticket.lines.map(function (l) {
      var o = { ad_client_id: ctx.client, ad_org_id: ctx.org, isactive: 'Y', i_isimported: 'N', issotrx: 'Y', doctypename: 'POS Order', documentno: key, m_product_id: l.pid,
        qtyordered: l.qty, priceactual: l.price, c_uom_id: ctx.uomOf(l.pid), dateordered: ctx.day + ' 00:00:00', description: ctx.shiftTag };
      if (ctx.refundOf) o.linedescription = 'Refund of ' + ctx.refundOf;   // 5.0 JTicketsBagTicket.java:559 refundticket.setTicketStatus(original id): the link to the original ticket (I_Order has no PO reference column)
      return o;
    });
    var payments = applied.parts.filter(function (p) { return !p.error && p.applied > 0; }).map(function (p) {
      var f = { ad_client_id: ctx.client, ad_org_id: ctx.org, isactive: 'Y', i_isimported: 'N', isreceipt: 'Y', documentno: key, doctypename: 'AR Receipt', iso_code: ctx.iso,
        payamt: sgn * p.applied / 100, tendertype: p.tender, datetrx: ctx.day + ' 00:00:00', description: ctx.shiftTag };
      if (ctx.bpartnerValue) f.bpartnervalue = ctx.bpartnerValue;
      if (p.name === 'magcard' || p.name === 'magcardrefund') { f.isapproved = 'Y'; f.r_pnref = p.ref; f.r_authcode = p.auth; f.r_result = '0'; f.r_respmsg = 'APPROVED'; }   // the terminal's reply keyed by the cashier; the card NUMBER is never a column of this row
      return f;
    });
    return { orders: orders, payments: payments };
  }

  // ── receipt model: the fields of Printer.Ticket.xml:26-125 in their order (the card-number line is deliberately absent: PCI)
  function receiptModel(o) {   // o { type, number, date, terminal, user, lines:[{name, price, qty, value}], gross, applied, change }
    var f = [['Receipt', o.type === 'R' ? 'Refund' : o.type === 'P' ? 'Payment' : 'Receipt'], [o.type === 'R' ? 'Refund' : 'Receipt', o.number], ['Date', o.date], ['Terminal', o.terminal], ['Served by', o.user]];
    f = f.slice(1);
    f.push(['Item', 'Price', 'Qty', 'Value']);
    o.lines.forEach(function (l) { f.push(['line', l.name, money(l.price), 'x' + l.qty, money(l.value)]); });
    f.push(['Items count', String(o.lines.reduce(function (a, l) { return a + Number(l.qty); }, 0))]);
    f.push(['Total', money(o.gross)]);   // a refund prints a negative total
    o.applied.parts.forEach(function (p) {
      if (p.name === 'cash') { f.push(['Cash']); f.push(['Tendered', money(p.tendered)]); f.push(['Change', money(p.tendered - p.applied)]); }
      else if (p.name === 'cashrefund') { f.push(['Cash Refund']); f.push(['Refunded', money(p.applied)]); }
      else if (p.name === 'magcard' || p.name === 'magcardrefund') { f.push([p.name === 'magcard' ? 'CARD SALE' : 'CARD REFUND']); f.push(['AMOUNT', money(Math.abs(o.gross))]); f.push(['Tranx ID', p.ref || '']); f.push(['Auth Code', p.auth || '']); }
      else { f.push([tenderOf(p.name).label, money(p.applied)]); }
    });
    return f;
  }

  // ── Close Cash (§14.4): the Z is a QUERY over the shift's deposited rows. orders/payments = rows of the shift; taxEnv as totals().
  function zTotals(orders, payments, env, extra) {
    var byTicket = {}, order = [];
    orders.forEach(function (r) { var k = r.documentno; if (!byTicket[k]) { byTicket[k] = []; order.push(k); } byTicket[k].push(r); });
    var z = { tickets: order.length, units: 0, gross: 0, net: 0, tax: 0, taxes: {}, payments: 0, byTender: {}, ok: true };
    order.forEach(function (k) {
      var lines = byTicket[k].map(function (r) { return { pid: r.m_product_id, qty: Number(r.qtyordered), price: Number(r.priceactual) }; });
      lines.forEach(function (l) { z.units += l.qty; });
      var t = totals(lines, env); if (!t.ok) { z.ok = false; z.error = t.error; return; }
      z.gross += t.gross; z.net += t.net; z.tax += t.tax;
      t.rows.forEach(function (x) { var s = z.taxes[x.c_tax_id] = z.taxes[x.c_tax_id] || { base: 0, amount: 0 }; s.base += x.taxbaseamt; s.amount += x.taxamt; });
    });
    var TN = { X: 'cash', K: 'cheque', C: 'magcard', A: 'bank' }, TR = { X: 'cashrefund', K: 'chequerefund', C: 'magcardrefund' };
    payments.forEach(function (p) {
      z.payments++; var ref = /-R\d+$/.test(p.documentno || ''), n = (ref ? TR : TN)[p.tendertype] || TN[p.tendertype] || p.tendertype;
      z.byTender[n] = (z.byTender[n] || 0) + cents(p.payamt);
    });
    (extra || []).forEach(function (c) { z.payments++; z.byTender[c.reason] = (z.byTender[c.reason] || 0) + cents(c.amount); });   // PaymentsModel.java:201 : cash in / out are payment rows with NOTES
    return z;
  }

  // ── the tax inputs, ONE definition (POS_PLUGIN_LOCAL_FIRST.md §23): the till (till.js loadConfig, async) and Branch Day Close's audit gate (friendly_ops.mjs, sync) both drive this generator and hand the answers to
  //   taxEnv; neither holds a query or a tax formula of its own. The rows are the ones Import Orders uses (cash-trx partner, default SO price list, org / warehouse / bill-to locations).
  //   Yields { one: sql } | { many: sql } and receives the rows back; returns { r: inputs }.
  function* taxInputs(pos) {
    var c = Number(pos.ad_client_id), r = {};
    r.bpId = ((yield { one: 'SELECT c_bpartnercashtrx_id AS b FROM ad_clientinfo WHERE ad_client_id=' + c }) || {}).b;
    r.incl = ((yield { one: "SELECT istaxincluded AS t FROM m_pricelist WHERE m_pricelist_id=(SELECT MAX(m_pricelist_id) FROM m_pricelist WHERE isdefault='Y' AND issopricelist='Y' AND ad_client_id=" + c + ')' }) || {}).t === 'Y';
    r.taxes = yield { many: 'SELECT * FROM c_tax WHERE ad_client_id=' + c };
    var loc = function (id) { return id ? { one: 'SELECT c_country_id, c_region_id, postal FROM c_location WHERE c_location_id=' + Number(id) } : null; };
    r.bp = (r.bpId ? yield { one: 'SELECT istaxexempt, deliveryviarule FROM c_bpartner WHERE c_bpartner_id=' + Number(r.bpId) } : null) || {};
    var bl = r.bpId ? yield { one: "SELECT c_location_id AS l FROM c_bpartner_location WHERE c_bpartner_id=" + Number(r.bpId) + " AND isbillto='Y' AND isactive='Y' ORDER BY c_bpartner_location_id" } : null;
    var oi = yield { one: 'SELECT c_location_id AS l FROM ad_orginfo WHERE ad_org_id=' + Number(pos.ad_org_id) }, wl = yield { one: 'SELECT c_location_id AS l FROM m_warehouse WHERE m_warehouse_id=' + Number(pos.m_warehouse_id) };
    r.dv = yield { one: "SELECT c.defaultvalue AS d FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.columnname='DeliveryViaRule'" };
    var a = loc(oi && oi.l), b = loc(bl && bl.l), w = loc(wl && wl.l);
    r.locs = { from: a ? yield a : null, to: b ? yield b : null, wh: w ? yield w : null };
    return r;
  }
  function driveSync(gen, one, many) { var st = gen.next(); while (!st.done) { var q = st.value; st = gen.next(q.one ? (one(q.one) || null) : many(q.many)); } return st.value; }
  async function driveAsync(gen, one, many) { var st = gen.next(); while (!st.done) { var q = st.value; st = gen.next(q.one ? ((await one(q.one)) || null) : await many(q.many)); } return st.value; }
  // r = taxInputs result ; taxcatOf: product id -> C_TaxCategory_ID ; day 'YYYY-MM-DD'
  function taxEnv(Eng, r, taxcatOf, day) {
    var children = {}; r.taxes.forEach(function (t) { if (t.parent_tax_id) (children[t.parent_tax_id] = children[t.parent_tax_id] || []).push(t); });
    return { Eng: Eng, included: r.incl, taxById: function (id) { return r.taxes.filter(function (t) { return String(t.c_tax_id) === String(id); })[0]; },
      taxChildren: function (id) { return (children[id] || []).filter(function (t) { return t.isactive === 'Y'; }); },
      taxOf: function (pid) { return Eng.taxLookup({ taxes: r.taxes, taxCategoryId: taxcatOf[pid], isSOTrx: true, billDate: day, billFrom: r.locs.from, billTo: r.locs.to, warehouse: r.locs.wh, deliveryViaRule: r.bp.deliveryviarule || (r.dv && r.dv.d), bpTaxExempt: r.bp.istaxexempt }); } };
  }
  return { taxInputs: taxInputs, driveSync: driveSync, driveAsync: driveAsync, taxEnv: taxEnv, TENDERS: TENDERS, REFUND_TENDERS: REFUND_TENDERS, tabsFor: tabsFor, foldLines: foldLines, tenderOf: tenderOf, cents: cents, money: money, lineNetCents: lineNetCents, keyPrefix: keyPrefix, nextNumber: nextNumber, totals: totals, applyTenders: applyTenders, depositRows: depositRows, receiptModel: receiptModel, zTotals: zTotals };
});
