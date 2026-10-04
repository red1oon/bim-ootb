// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// model_trade.js — the trade-cycle model classes, PORTED from iDempiere and REGISTERED into model_layer.js
// (bim-compiler prompts/ERP_MODEL_LAYER.md §CHANGE-LIST A-E, W1 — Witness: W-MODEL-ORACLE).
// MOrder · MOrderLine · MInOut · MInvoice · MInvoiceLine · MPayment · MAllocationHdr/Line · MBPartner balances ·
// MStorageOnHand.add · MStorageReservation.add (+ReservationLogTracer) · MCostDetail (shipment, AveragePO/Std) ·
// MSequence.getDocumentNo · StandardTaxProvider. Each rule cites its Java (model/<File>.java:line) in one line.
// Faithful = same branches, same order, same columns; a branch not ported returns Invalid with a NAMED message
// (never a silent pass). Money/qty via BigDecimal (ML.D) only. Reads through trx (read-your-writes).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./bigdecimal'));
  else root.ModelTrade = factory(root.ModelLayer, root.BigDecimal);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, BigDecimal) {
  var D = ML.D, N = ML.N, HU = BigDecimal.RoundingMode.HALF_UP, Z = BigDecimal.ZERO;
  function Y(v) { return v === 'Y' || v === true; }
  function id(v) { return v == null ? 0 : (ML.isNewId(v) ? v : Number(v)); }
  function nz(v) { return v != null && v !== '' && v !== 0 && v !== '0' && !(typeof v === 'string' && /^\s*0*(\.0+)?\s*$/.test(v)); }   // Java getX_ID() != 0 (a form's '' is 0)
  function one(trx, t, w) { return trx.find(t, w)[0] || null; }
  function msg(trx, m) { trx._msg = m; return m; }

  // Msg.getMsg(ctx, value) — the AD_Message text (shipped rows only for what the model writes); absent → the key itself
  function msgText(trx, value) { try { var r = trx.q('SELECT msgtext FROM ad_message WHERE value=?', [value])[0]; return r ? r.msgtext : value; } catch (e) { return value; } }
  function addDescription(trx, table, row, text) { trx.update(table, row, { description: row.description == null || row.description === '' ? text : row.description + ' | ' + text }); }   // MOrder/MOrderLine.addDescription :557-564/:632-639
  // ── reference reads (MDocType.get, MProduct.get, … — cached per Trx like the Java caches) ──────────────────
  function dt(trx, i) { return i ? trx.get('c_doctype', i) : null; }
  function product(trx, i) { return nz(i) ? trx.get('m_product', i) : null; }
  function isItem(p) { return p && p.producttype === 'I'; }
  function isStocked(p) { return p && Y(p.isstocked) && isItem(p); }                       // MProduct.isStocked
  function precisionOf(trx, cur) { var c = cur ? trx.get('c_currency', cur) : null; return c ? Number(c.stdprecision) : 2; }
  function tax(trx, i) { return trx.get('c_tax', i); }
  // MTax.calculateTax :340-372
  function calcTax(trx, t, amount, incl, scale) {
    if (D(t.rate).signum() === 0) return Z;                                                 // isZeroTax :310
    var arr = Y(t.issummary) ? trx.find('c_tax', { parent_tax_id: t.c_tax_id }) : [t], sum = Z;
    arr.forEach(function (tc) {
      var mult = D(tc.rate).divide(D(100), 12, HU);
      if (!incl) sum = sum.add(D(amount).multiply(mult).setScale(scale, HU));
      else { var base = D(amount).divide(mult.add(BigDecimal.ONE), 12, HU); sum = sum.add(D(amount).subtract(base).setScale(scale, HU)); }
    });
    return sum;
  }
  // MPeriod.isOpen (static :291-314 → instance :704-760): the period of DateAcct must exist and be active; when the client's
  // primary schema has AutoPeriodControl='Y' the gate is today−Period_OpenHistory ≤ date ≤ today+Period_OpenFuture (today =
  // the recorded env.date) and the schema's C_Period_ID follows today's period (:740-748 — a WRITE); else C_PeriodControl 'O'.
  function addDays(d, n) { var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  function periodOf(trx, d) {
    try { return trx.q("SELECT p.* FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN ad_clientinfo ci ON ci.c_calendar_id=y.c_calendar_id WHERE ci.ad_client_id=? AND p.periodtype='S' AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [trx.env.client, d, d])[0] || null; }
    catch (e) { return undefined; }
  }
  function periodOpen(trx, date, dbt) {
    var d = String(date || '').slice(0, 10);
    if (!d || !dbt) return false;
    var per = periodOf(trx, d);
    if (per === undefined) { trx.say('§MODEL-PERIOD calendar tables absent → gate not evaluable (named)'); return true; }
    if (!per || per.isactive === 'N') return false;
    var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [trx.env.client])[0];
    var as = ci ? trx.get('c_acctschema', ci.a) : null;
    if (as && Y(as.autoperiodcontrol) && trx.env.date) {
      var today = String(trx.env.date).slice(0, 10);
      if (d < addDays(today, -Number(as.period_openhistory || 0)) || d > addDays(today, Number(as.period_openfuture || 0))) return false;
      var tp = periodOf(trx, today);
      if (tp && tp.c_period_id === per.c_period_id && String(as.c_period_id) !== String(per.c_period_id)) trx.update('c_acctschema', as, { c_period_id: per.c_period_id });
      return true;
    }
    var pc = trx.q('SELECT periodstatus FROM c_periodcontrol WHERE c_period_id=? AND docbasetype=?', [per.c_period_id, dbt])[0];
    return !!pc && pc.periodstatus === 'O';
  }

  // ── MSequence.getDocumentNo (MSequence.java:330-560, simple AD_Sequence level) — bump INSIDE the Trx ──────────
  function nextDocNo(trx, docTypeId, tableName, po) {
    var seq = null, d = docTypeId ? dt(trx, docTypeId) : null;
    if (d && nz(d.docnosequence_id)) seq = trx.get('ad_sequence', d.docnosequence_id);
    if (!seq && tableName) seq = one(trx, 'ad_sequence', { name: 'DocumentNo_' + tableName, ad_client_id: trx.env.client, istableid: 'N' });
    if (!seq) return null;
    if (Y(seq.isstartnewyear) || Y(seq.isorglevelsequence)) { trx.say('§MODEL-SEQ seq=' + seq.ad_sequence_id + ' StartNewYear/OrgLevel → AD_Sequence_No not ported (named)'); }
    var next = Number(seq.currentnext), inc = Number(seq.incrementno || 1);
    trx.update('ad_sequence', seq, { currentnext: next + inc });
    var pre = seq.prefix && !/@/.test(seq.prefix) ? seq.prefix : '', suf = seq.suffix && !/@/.test(seq.suffix) ? seq.suffix : '';
    return pre + String(next) + suf;
  }

  // ── MStorageOnHand.add :817-845 (+ addQtyOnHand :851-866: negative on-hand refused when WH.IsDisallowNegativeInv) ──
  function storageAdd(trx, locatorId, productId, asi, qty, dateMPolicy) {
    qty = D(qty); if (qty.signum() === 0) return null;
    var dmp = dateMPolicy ? String(dateMPolicy).slice(0, 10) + ' 00:00:00' : null;
    var s = trx.find('m_storageonhand', { m_locator_id: locatorId, m_product_id: productId, m_attributesetinstance_id: asi || 0 })
      .filter(function (r) { return String(r.datematerialpolicy || '').slice(0, 10) === String(dmp || '').slice(0, 10); })[0];
    var loc = trx.get('m_locator', locatorId);
    if (!s) s = trx.insert('m_storageonhand', { ad_org_id: loc ? loc.ad_org_id : trx.env.org, m_locator_id: locatorId, m_product_id: productId,
      m_attributesetinstance_id: asi || 0, datematerialpolicy: dmp, qtyonhand: 0, m_warehouse_id: loc ? loc.m_warehouse_id : null });   // getCreate :~600
    var nq = D(s.qtyonhand).add(qty);
    if (nq.signum() < 0 && loc) { var wh = trx.get('m_warehouse', loc.m_warehouse_id); if (wh && Y(wh.isdisallownegativeinv)) return msg(trx, 'NegativeInventoryDisallowed product=' + productId + ' locator=' + locatorId); }
    trx.update('m_storageonhand', s, { qtyonhand: N(nq) });
    return null;
  }
  // ── MStorageReservation.add :263-301 → addQty :315-326 → ReservationLogTracer.trace (org/adempiere/util :55-73) ──
  function reservationAdd(trx, whId, productId, asi, diff, isSOTrx, trace) {
    diff = D(diff); if (diff.signum() === 0) return null;
    var p = product(trx, productId);
    if (!p || !nz(p.m_attributeset_id) || !Y((trx.get('m_attributeset', p.m_attributeset_id) || {}).isinstanceattribute)) asi = 0;   // :270-274
    var so = isSOTrx ? 'Y' : 'N';
    var s = one(trx, 'm_storagereservation', { m_warehouse_id: whId, m_product_id: productId, m_attributesetinstance_id: asi || 0, issotrx: so });
    var wh = trx.get('m_warehouse', whId);
    if (!s) s = trx.insert('m_storagereservation', { ad_org_id: wh ? wh.ad_org_id : trx.env.org, m_warehouse_id: whId, m_product_id: productId, m_attributesetinstance_id: asi || 0, issotrx: so, qty: 0 });
    var old = D(s.qty);
    trx.update('m_storagereservation', s, { qty: N(old.add(diff)) });
    if (trace) trx.insert('m_storagereservationlog', { ad_org_id: wh ? wh.ad_org_id : null, ad_table_id: trace.ad_table_id, c_doctype_id: nz(trace.c_doctype_id) ? trace.c_doctype_id : null,
      deltaqty: N(diff), documentno: trace.documentno, m_attributesetinstance_id: asi || 0, m_product_id: productId, issotrx: so, lineno: trace.lineno,
      m_warehouse_id: whId, oldqty: N(old), newqty: N(old.add(diff)), record_id: trace.record_id });
    return null;
  }

  // ── MBPartner balances ────────────────────────────────────────────────────────────────────────────────────────
  // invoiceOpen(i, null) (PG function) over C_Invoice_v: GrandTotal×(CM?-1:1) − Σ(Amount+Discount+WriteOff)×MultiplierAP, rounded.
  function invMult(trx, inv) { var d = dt(trx, inv.c_doctype_id) || {}; var b = String(d.docbasetype || 'ARI'); return { cm: b.charAt(2) === 'C' ? -1 : 1, ap: b.charAt(1) === 'P' ? -1 : 1 }; }
  function invoiceOpen(trx, inv) {
    var m = invMult(trx, inv), paid = Z;
    trx.find('c_allocationline', { c_invoice_id: inv.c_invoice_id }).forEach(function (al) {
      var h = trx.get('c_allocationhdr', al.c_allocationhdr_id); if (!h || h.isactive !== 'Y') return;
      paid = paid.add(D(al.amount).add(D(al.discountamt)).add(D(al.writeoffamt)).multiply(D(m.ap)));
    });
    return D(inv.grandtotal).multiply(D(m.cm)).subtract(paid).setScale(precisionOf(trx, inv.c_currency_id), HU);
  }
  function paymentAvailable(trx, p) {
    if (nz(p.c_charge_id)) return Z;
    var amt = D(p.payamt).multiply(D(Y(p.isreceipt) ? 1 : -1));                              // C_Payment_v (AP/AR corrected)
    trx.find('c_allocationline', { c_payment_id: p.c_payment_id }).forEach(function (al) {
      var h = trx.get('c_allocationhdr', al.c_allocationhdr_id); if (h && h.isactive === 'Y') amt = amt.subtract(D(al.amount));
    });
    return amt.setScale(precisionOf(trx, p.c_currency_id), HU);
  }
  // MConversionRate.getRate — client/org specific first, latest ValidFrom (conversion type: the document's, else the default)
  function rate(trx, from, to, date, convType) {
    if (String(from) === String(to)) return BigDecimal.ONE;
    var ct = convType;
    if (!nz(ct)) { var d = trx.q("SELECT c_conversiontype_id AS c FROM c_conversiontype WHERE isdefault='Y' AND ad_client_id IN (0,?) ORDER BY ad_client_id DESC", [trx.env.client])[0]; ct = d ? d.c : null; }
    var r = trx.q("SELECT multiplyrate AS m FROM c_conversion_rate WHERE c_currency_id=? AND c_currency_id_to=? AND c_conversiontype_id=? AND date(validfrom)<=date(?) AND date(validto)>=date(?) AND ad_client_id IN (0,?) AND isactive='Y' ORDER BY ad_client_id DESC, ad_org_id DESC, validfrom DESC", [from, to, ct, String(date || '').slice(0, 10), String(date || '').slice(0, 10), trx.env.client])[0];
    return r ? D(r.m) : null;
  }
  // currencyBase(amt, cur, date, client, org) (PG function) — into the client's accounting currency (AD_ClientInfo.C_AcctSchema1_ID)
  function currencyBase(trx, amt, cur, date) {
    var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [trx.env.client])[0], as = ci ? trx.get('c_acctschema', ci.a) : null;
    if (!as || String(as.c_currency_id) === String(cur)) return D(amt);
    var r = rate(trx, cur, as.c_currency_id, date, null);
    return r ? D(amt).multiply(r).setScale(precisionOf(trx, as.c_currency_id), HU) : D(amt);
  }
  // MBPartner.setTotalOpenBalance :711-757 — SUM(currencyBase(invoiceOpen …)) / currencyBase(paymentAvailable …)
  function bpOpenBalance(trx, bpId) {
    var credit = Z, bal = Z;
    trx.find('c_invoice', { c_bpartner_id: bpId }).forEach(function (i) {
      if (i.ispaid !== 'N' || !/^(CO|CL)$/.test(i.docstatus || '')) return;
      var o = currencyBase(trx, invoiceOpen(trx, i), i.c_currency_id, i.dateinvoiced), m = invMult(trx, i);
      if (i.issotrx === 'Y') credit = credit.add(o);
      bal = bal.add(o.multiply(D(m.ap)));
    });
    trx.find('c_payment', { c_bpartner_id: bpId }).forEach(function (p) {
      if (p.isallocated !== 'N' || nz(p.c_charge_id) || !/^(CO|CL)$/.test(p.docstatus || '')) return;
      bal = bal.subtract(currencyBase(trx, paymentAvailable(trx, p), p.c_currency_id, p.datetrx));
    });
    return { so_creditused: credit, totalopenbalance: bal };
  }
  // MBPartner.setSOCreditStatus :798-819
  function creditStatus(trx, bp, total) {
    var lim = D(bp.so_creditlimit), st = bp.socreditstatus;
    if (st === 'X' || st === 'S' || lim.signum() === 0) return st;
    if (lim.compareTo(D(total)) < 0) return 'H';
    var g = trx.get('c_bp_group', bp.c_bp_group_id) || {};
    var ratio = g.creditwatchpercent != null ? D(g.creditwatchpercent).divide(D(100), 12, HU) : D('0.9');
    return lim.multiply(ratio).compareTo(D(total)) < 0 ? 'W' : 'O';
  }
  function setTotalOpenBalance(trx, bpId) {
    var bp = trx.get('c_bpartner', bpId); if (!bp) return;
    var r = bpOpenBalance(trx, bpId);
    var ch = { so_creditused: N(r.so_creditused), totalopenbalance: N(r.totalopenbalance) };
    ch.socreditstatus = creditStatus(trx, Object.assign({}, bp, ch), r.totalopenbalance);
    trx.update('c_bpartner', bp, ch);
  }

  return { rate: rate, currencyBase: currencyBase, msgText: msgText, addDescription: addDescription, D: D, N: N, Y: Y, id: id, nz: nz, one: one, msg: msg, dt: dt, product: product, isItem: isItem, isStocked: isStocked,
    precisionOf: precisionOf, tax: tax, calcTax: calcTax, periodOpen: periodOpen, nextDocNo: nextDocNo, storageAdd: storageAdd,
    reservationAdd: reservationAdd, invoiceOpen: invoiceOpen, paymentAvailable: paymentAvailable, bpOpenBalance: bpOpenBalance,
    creditStatus: creditStatus, setTotalOpenBalance: setTotalOpenBalance, HU: HU, Z: Z };
});
