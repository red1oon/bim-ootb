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
  function tenderOf(name) { return TENDERS.filter(function (t) { return t.name === name; })[0] || null; }
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
    var orders = ticket.lines.map(function (l) {
      return { ad_client_id: ctx.client, ad_org_id: ctx.org, isactive: 'Y', i_isimported: 'N', issotrx: 'Y', doctypename: 'POS Order', documentno: key, m_product_id: l.pid,
        qtyordered: l.qty, priceactual: l.price, c_uom_id: ctx.uomOf(l.pid), dateordered: ctx.day + ' 00:00:00', description: ctx.shiftTag };
    });
    var payments = applied.parts.filter(function (p) { return !p.error && p.applied > 0; }).map(function (p) {
      var f = { ad_client_id: ctx.client, ad_org_id: ctx.org, isactive: 'Y', i_isimported: 'N', isreceipt: 'Y', documentno: key, doctypename: 'AR Receipt', iso_code: ctx.iso,
        payamt: p.applied / 100, tendertype: p.tender, datetrx: ctx.day + ' 00:00:00' };
      if (p.name === 'magcard') { f.isapproved = 'Y'; f.r_pnref = p.ref; f.r_authcode = p.auth; f.r_result = '0'; f.r_respmsg = 'APPROVED'; }   // the terminal's reply keyed by the cashier; the card NUMBER is never a column of this row
      return f;
    });
    return { orders: orders, payments: payments };
  }

  // ── receipt model: the fields of Printer.Ticket.xml:26-125 in their order (the card-number line is deliberately absent: PCI)
  function receiptModel(o) {   // o { type, number, date, terminal, user, lines:[{name, price, qty, value}], gross, applied, change }
    var f = [['Receipt', o.type === 'R' ? 'Refund' : 'Receipt'], [o.type === 'R' ? 'Refund' : 'Receipt', o.number], ['Date', o.date], ['Terminal', o.terminal], ['Served by', o.user]];
    f = f.slice(1);
    f.push(['Item', 'Price', 'Qty', 'Value']);
    o.lines.forEach(function (l) { f.push(['line', l.name, money(l.price), 'x' + l.qty, money(l.value)]); });
    f.push(['Items count', String(o.lines.reduce(function (a, l) { return a + Number(l.qty); }, 0))]);
    f.push(['Total', money(o.gross)]);
    o.applied.parts.forEach(function (p) {
      if (p.name === 'cash') { f.push(['Cash']); f.push(['Tendered', money(p.tendered)]); f.push(['Change', money(p.tendered - p.applied)]); }
      else if (p.name === 'magcard') { f.push(['CARD SALE']); f.push(['AMOUNT', money(o.gross)]); f.push(['Tranx ID', p.ref || '']); f.push(['Auth Code', p.auth || '']); }
      else { f.push([tenderOf(p.name).label, money(p.applied)]); }
    });
    return f;
  }

  // ── Close Cash (§14.4): the Z is a QUERY over the shift's deposited rows. orders/payments = rows of the shift; taxEnv as totals().
  function zTotals(orders, payments, env) {
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
    var TN = { X: 'cash', K: 'cheque', C: 'magcard', A: 'bank' };
    payments.forEach(function (p) { z.payments++; var n = TN[p.tendertype] || p.tendertype; z.byTender[n] = (z.byTender[n] || 0) + cents(p.payamt); });
    return z;
  }
  return { TENDERS: TENDERS, tenderOf: tenderOf, cents: cents, money: money, lineNetCents: lineNetCents, keyPrefix: keyPrefix, nextNumber: nextNumber, totals: totals, applyTenders: applyTenders, depositRows: depositRows, receiptModel: receiptModel, zTotals: zTotals };
});
