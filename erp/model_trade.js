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

  // ══ MSequence — DocumentNo allocation, ported verbatim (model/MSequence.java). Every bump is a write through the Trx
  // (CRUD_UPDATE of AD_Sequence / CRUD_CREATE|UPDATE of AD_Sequence_No) → it rides the document's own signed op-group.
  // The FOR UPDATE row lock (:383-389) has no analogue in a single-writer op-group (named in §MODEL-SEQ when org/key level).
  var KEY_CONTEXT_VARIABLE = '/K', NoYearNorMonth = '-', SEQUENCE_NO_KEY_SEPARATOR = '-';   // MSequence.java:64,70,72
  function isEmpty(v, trim) { return v == null || (trim ? String(v).trim() : String(v)) === ''; }   // Util.isEmpty
  // DefaultEvaluatee.get_ValueAsString (util/DefaultEvaluatee.java:150-340) over a PO row + the session context (env):
  // <format> operator, '.' reference operator (X_ID.Column → the referenced row), ':' default, '#'/'$' globals.
  function evalVar(trx, po, variableName) {
    var format = '', f = variableName.indexOf('<');                                           // :160-164 format
    if (f > 0 && /\>$/.test(variableName)) { format = variableName.slice(f + 1, -1); variableName = variableName.slice(0, f); }
    var foreignColumn = ''; f = variableName.indexOf('.');                                    // :167-174 reference column
    if (f > 0) { var t0 = variableName.slice(0, f); if (/.*[_]ID([:].+)?$/.test(t0)) { foreignColumn = variableName.slice(f + 1); variableName = t0; } }
    var defaultValue = null, idx = variableName.indexOf(':');                                 // :177-182 default value
    if (idx >= 0) { defaultValue = variableName.slice(idx + 1); variableName = variableName.slice(0, idx); }
    var value = null, globalVariable = /^[#$]/.test(variableName);                           // Env.isGlobalVariable
    if (po && !globalVariable) { var dv = po[variableName.toLowerCase()]; value = dv != null ? String(dv) : null; }   // :188-192 data provider
    if (isEmpty(value) && globalVariable) {                                                   // :216-219 global context
      var ctxName = variableName.slice(1), env = trx.env || {}, ctx = env.ctx || {};
      value = ctx[ctxName] != null ? String(ctx[ctxName]) : ctxName === 'AD_Client_ID' ? (env.client != null ? String(env.client) : null)
        : ctxName === 'AD_Org_ID' ? (env.org != null ? String(env.org) : null) : ctxName === 'AD_User_ID' ? (env.user != null ? String(env.user) : null)
        : ctxName === 'Date' ? (env.date || null) : null;
    }
    if (isEmpty(value) && defaultValue != null) value = defaultValue;                         // :259-260
    if (!isEmpty(value) && !isEmpty(foreignColumn) && /_ID$/.test(variableName)) {           // :270-301 reference(.) operator
      var id = parseInt(value, 10);
      if (id > 0) { var ft = variableName.slice(0, -3), fc = foreignColumn, ti = fc.indexOf('.');
        if (ti > 0) { if (fc.slice(0, ti).toLowerCase() === ft.toLowerCase()) fc = fc.slice(ti + 1); else ft = null; }
        if (ft) { var rr = null; try { rr = trx.get(ft.toLowerCase(), id); } catch (e) { rr = null; }
          var cv = rr ? rr[fc.toLowerCase()] : null; value = cv == null ? '' : String(cv); } }
    }
    if (format && !isEmpty(value)) {                                                          // :303-340 format operator — dates (SimpleDateFormat subset)
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) value = sdf(format, value);
      else trx.say('§MODEL-UNPORTED-DEP DefaultEvaluatee format "<' + format + '>" on non-date value (DecimalFormat/reference display) — value used raw');
    }
    return value;
  }
  function sdf(pattern, ts) {                                                                 // java.text.SimpleDateFormat for yyyy/yy/MM/dd/HH/mm/ss
    var s = String(ts); var m = { yyyy: s.slice(0, 4), yy: s.slice(2, 4), MM: s.slice(5, 7), dd: s.slice(8, 10), HH: s.slice(11, 13) || '00', mm: s.slice(14, 16) || '00', ss: s.slice(17, 19) || '00' };
    return pattern.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, function (k) { return m[k]; });
  }
  // Env.parseVariable(expression, po, trxName, keepUnparseable=false) — util/Env.java:2070-2131
  function parseVariable(trx, expression, po) {
    if (expression == null || expression.length === 0) return '';
    var inStr = String(expression), out = '', i = inStr.indexOf('@');
    while (i !== -1) {
      out += inStr.slice(0, i); inStr = inStr.slice(i + 1);
      var j = inStr.indexOf('@');
      if (j < 0) return '';                                                                   // no second tag
      if (j === 0) { out += '@'; inStr = inStr.slice(1); i = inStr.indexOf('@'); continue; }
      var token = inStr.slice(0, j), value = evalVar(trx, po, token);
      if (!isEmpty(value)) out += value;
      inStr = inStr.slice(j + 1); i = inStr.indexOf('@');
    }
    return out + inStr;
  }
  // SequenceNoKeyParts.parseKeys (MSequence.java:1416-1458) — only the @…/K@ variables form the AD_Sequence_No key
  function parseKeys(trx, input, po) {
    if (input == null || input === '') return null;
    var results = [], startIndex = 0;
    while (true) {
      var start = input.indexOf('@', startIndex); if (start === -1) break;
      var end = input.indexOf('@', start + 1); if (end === -1) break;
      var v = input.slice(start, end + 1), isKey = false;
      if (v.slice(0, -1).endsWith(KEY_CONTEXT_VARIABLE)) { isKey = true; var k = v.lastIndexOf(KEY_CONTEXT_VARIABLE); v = v.slice(0, k) + v.slice(k + KEY_CONTEXT_VARIABLE.length); }
      if (isKey) { var value = parseVariable(trx, v, po); if (!isEmpty(value, true)) results.push(value); }
      startIndex = end + 1;
    }
    return results;
  }
  function seqUsePrefixAsKey(seq) { return !isEmpty(seq.prefix) && String(seq.prefix).indexOf(KEY_CONTEXT_VARIABLE + '@') >= 0; }   // :605-612
  function seqUseSuffixAsKey(seq) { return !isEmpty(seq.suffix) && String(seq.suffix).indexOf(KEY_CONTEXT_VARIABLE + '@') >= 0; }   // :619-626
  function seqIsSequenceNoLevel(seq) { return seqUsePrefixAsKey(seq) || seqUseSuffixAsKey(seq) || Y(seq.startnewyear) || Y(seq.isorglevelsequence); }   // :590-598
  // java.text.DecimalFormat(pattern).format(int) — integer patterns: '0' = mandatory digit, '#' = optional, ',' = grouping
  function decimalFormat(pattern, n) {
    var p = String(pattern).split(';')[0], intPart = p.split('.')[0], digits = intPart.replace(/[^0#,]/g, '');
    var pre = intPart.slice(0, intPart.search(/[0#,]/)), post = intPart.slice(intPart.search(/[0#,][^0#,]*$/) + 1);
    var minInt = (digits.match(/0/g) || []).length, lastComma = digits.lastIndexOf(','), group = lastComma >= 0 ? digits.length - lastComma - 1 : 0;
    var s = String(Math.abs(n)); while (s.length < minInt) s = '0' + s;
    if (group > 0) { var g = []; for (var e = s.length; e > 0; e -= group) g.unshift(s.slice(Math.max(0, e - group), e)); s = g.join(','); }
    return (n < 0 ? '-' : '') + pre.replace(/'/g, '') + s + post.replace(/'/g, '');
  }
  // MSequence.getDocumentNoFromSeq (MSequence.java:330-581)
  function getDocumentNoFromSeq(trx, seq, po) {
    var AD_Sequence_ID = seq.ad_sequence_id, isStartNewYear = Y(seq.startnewyear), isStartNewMonth = Y(seq.startnewmonth), dateColumn = seq.datecolumn;
    var isUseOrgLevel = Y(seq.isorglevelsequence), orgColumn = seq.orgcolumn, startNo = Number(seq.startno || 0), incrementNo = Number(seq.incrementno || 1), decimalPattern = seq.decimalpattern;
    var prefixValue = null, suffixValue = null, prefixKeys = null, suffixKeys = null;
    if (!isEmpty(seq.prefix)) { prefixValue = parseVariable(trx, String(seq.prefix).split(KEY_CONTEXT_VARIABLE + '@').join('@'), po); prefixKeys = parseKeys(trx, seq.prefix, po); }   // :358-361
    if (!isEmpty(seq.suffix)) { suffixValue = parseVariable(trx, String(seq.suffix).split(KEY_CONTEXT_VARIABLE + '@').join('@'), po); suffixKeys = parseKeys(trx, seq.suffix, po); }   // :362-365
    var calendarYearMonth = NoYearNorMonth, docOrg_ID = 0, next = -1;
    if (isStartNewYear) {                                                                     // :425-440
      var fmt = isStartNewMonth ? 'yyyyMM' : 'yyyy';
      var dval = (po && !isEmpty(dateColumn)) ? po[String(dateColumn).toLowerCase()] : null;
      calendarYearMonth = sdf(fmt, (po && !isEmpty(dateColumn)) ? dval : (trx.env.date || ''));
    }
    if (isUseOrgLevel && po && !isEmpty(orgColumn)) docOrg_ID = Number(po[String(orgColumn).toLowerCase()] || 0);   // :442-449
    // SequenceNoKeyParts.parseSequenceNoKey (MSequence.java:1500-1530)
    function key() {
      var k = '';
      if (seqUsePrefixAsKey(seq) && prefixKeys) { k = prefixKeys.join(SEQUENCE_NO_KEY_SEPARATOR); }
      if (isStartNewYear) { if (k.length) k += SEQUENCE_NO_KEY_SEPARATOR; k += calendarYearMonth; }
      if (seqUseSuffixAsKey(seq) && suffixKeys) { if (k.length) k += SEQUENCE_NO_KEY_SEPARATOR; k += suffixKeys.join(SEQUENCE_NO_KEY_SEPARATOR); }
      return k;
    }
    var keyed = isStartNewYear || seqUsePrefixAsKey(seq) || seqUseSuffixAsKey(seq);
    if (seqIsSequenceNoLevel(seq)) {                                                          // :367-376 AD_Sequence_No level
      var sOk = seq.isactive !== 'N' && !Y(seq.istableid) && seq.isautosequence !== 'N';      // :374-375 the join's s.IsActive/IsTableID/IsAutoSequence filter
      var w = { ad_sequence_id: AD_Sequence_ID }; if (isUseOrgLevel) w.ad_org_id = docOrg_ID; if (keyed) w.sequencekey = key();
      var y = sOk ? (trx.find('ad_sequence_no', w)[0] || null) : null;
      if (y) { next = Number(y.currentnext); trx.update('ad_sequence_no', y, { currentnext: next + incrementNo }); }   // :486-512
      else {                                                                                  // :523-534 create (CurrentNext = StartNo + IncrementNo), first number = StartNo
        next = startNo;
        trx.insert('ad_sequence_no', { ad_sequence_id: AD_Sequence_ID, ad_org_id: docOrg_ID, sequencekey: key(), currentnext: startNo + incrementNo });
      }
      trx.say('§MODEL-SEQ seq=' + AD_Sequence_ID + ' level=AD_Sequence_No org=' + docOrg_ID + ' key=' + (keyed ? key() : '') + ' next=' + next + ' (FOR UPDATE row lock: none in a single-writer op-group)');
    } else {                                                                                  // :378-381 standard
      if (seq.isactive === 'N' || Y(seq.istableid) || seq.isautosequence === 'N') { trx.say('§MODEL-SEQ (Sequence)- no record found - ' + AD_Sequence_ID); return null; }
      next = Number(seq.currentnext);
      trx.update('ad_sequence', seq, { currentnext: next + incrementNo });
    }
    if (next < 0) return null;
    var doc = '';                                                                             // :551-561 create DocumentNo
    if (!isEmpty(prefixValue, true)) doc += prefixValue;
    doc += (decimalPattern != null && String(decimalPattern).length > 0) ? decimalFormat(decimalPattern, next) : String(next);
    if (!isEmpty(suffixValue, true)) doc += suffixValue;
    return doc;
  }
  // MSequence.getDocumentNo(C_DocType_ID, trxName, definite, po) — MSequence.java:674-708
  function getDocumentNoByDocType(trx, C_DocType_ID, definite, po) {
    if (!nz(C_DocType_ID)) { trx.say('§MODEL-SEQ C_DocType_ID=0'); return null; }
    var d = dt(trx, C_DocType_ID);
    if (d && !Y(d.isdocnocontrolled)) return null;
    if (definite && !Y(d.isoverwriteseqoncomplete)) return null;
    if (!d || !nz(d.docnosequence_id)) { trx.say('§MODEL-SEQ No Sequence for DocType - ' + C_DocType_ID); return null; }
    if (definite && !nz(d.definitesequence_id)) return null;
    var seq = trx.get('ad_sequence', definite ? d.definitesequence_id : d.docnosequence_id);
    return seq ? getDocumentNoFromSeq(trx, seq, po) : null;
  }
  // MSequence.getDocumentNo(AD_Client_ID, TableName, trxName, po) — MSequence.java:306-323 → MSequence.get(ctx, TableName, false) :864
  function getDocumentNoByTable(trx, tableName, po) {
    var seq = trx.q("SELECT * FROM ad_sequence WHERE UPPER(name)=UPPER(?) AND istableid='N' AND ad_client_id=? ORDER BY ad_sequence_id", ['DocumentNo_' + tableName, trx.env.client])[0] || null;
    if (seq) seq = trx.get('ad_sequence', seq.ad_sequence_id);
    if (!seq) { trx.say('§MODEL-UNPORTED-DEP MSequence.createTableSequence (MSequence.java:314) — no DocumentNo_' + tableName + ' sequence for client ' + trx.env.client); return null; }
    return getDocumentNoFromSeq(trx, seq, po);
  }
  // PO.saveNew :3563-3583 — the DocumentNo of a new row: from C_DocTypeTarget_ID (when the table has it) else C_DocType_ID, else the table sequence
  function nextDocNo(trx, docTypeId, tableName, po) {
    var v = docTypeId != null ? getDocumentNoByDocType(trx, docTypeId, false, po) : null;
    if (v == null) v = getDocumentNoByTable(trx, tableName, po);
    return v;
  }
  ML.setDocNoAllocator({ byDocType: getDocumentNoByDocType, byTable: getDocumentNoByTable });

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
    precisionOf: precisionOf, tax: tax, calcTax: calcTax, periodOpen: periodOpen, nextDocNo: nextDocNo, getDocumentNoByDocType: getDocumentNoByDocType, getDocumentNoByTable: getDocumentNoByTable, getDocumentNoFromSeq: getDocumentNoFromSeq, parseVariable: parseVariable, decimalFormat: decimalFormat, storageAdd: storageAdd,
    reservationAdd: reservationAdd, invoiceOpen: invoiceOpen, paymentAvailable: paymentAvailable, bpOpenBalance: bpOpenBalance,
    creditStatus: creditStatus, setTotalOpenBalance: setTotalOpenBalance, HU: HU, Z: Z };
});
