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


  // ══ process-lane M-class statics — MOVED here from processes/support_copy.js / support_proc.js / YearCreatePeriods.js / AcctSchemaCopyAcct.js
  // (one implementation per responsibility, §CP-OPEN 4b). nz() below is the numeric Java getXxx_ID() form; the code is the process lane's verbatim port.
  var PXT = (function (MLo) {
    var NODE = typeof module !== 'undefined' && module.exports, GL = typeof window !== 'undefined' ? window : globalThis;
    function A() { return NODE ? require('./ad_callout.js') : GL.AdCallout; }
    function R() { return A().RUNTIME; }
    function ML() { return MLo; }
    function nz(v) { return v == null || v === '' ? 0 : Number(v); }
    function Y(v) { return v === 'Y' || v === true; }
    function bd(v) { if (v == null) return null; var a = A(); return v instanceof a.BigDecimal ? v : a.toBD(String(v)); }
    function HU() { return A().RoundingMode.HALF_UP; }
    function ZERO() { return A().Env.ZERO; }
    function say(trx, m) { if (trx && trx.say) trx.say(m); }
    function dayTS(v) { return v == null ? null : A().Timestamp.of(v); }
    var S = { copyValues: MLo.copyValues };
    // the process lane's PO_HELPERS subset the moved code uses: Java-typed value → store value, then ModelLayer.save / newPO
    function plain(v) { var a = A(); if (v instanceof a.BigDecimal) return MLo.N(v); if (v instanceof a.Timestamp) return v.toString(); if (typeof v === 'boolean') return v ? 'Y' : 'N'; return v; }
    function plainMap(m) { var o = {}; for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k.toLowerCase()] = plain(m[k]); return o; }
    S.plainMap = plainMap;
    // new X(ctx,0,trx) + saveEx — PO.saveNew through the model layer (ctor defaults, DocumentNo/Value sequences, hooks)
    S.createRow = function (trx, table, fields) {
      var r = MLo.save(trx, table.toLowerCase(), null, MLo.newPO(trx, table.toLowerCase(), plainMap(fields || {})));
      if (!r.ok) throw new Error('SaveError ' + table + ': ' + (r.error || ''));
      return r.row;
    };
    S.saveRow = function (trx, table, po, changes) {
      var r = MLo.save(trx, table.toLowerCase(), po ? (po.row || po) : null, plainMap(changes || {}));
      if (!r.ok) throw new Error('SaveError ' + table + ': ' + (r.error || ''));
      return r.row;
    };

    // MSysConfig.getValue / getBooleanValue / getIntValue (M/MSysConfig.java getValue(Name, default, AD_Client_ID, AD_Org_ID))
    S.sysConfig = function (name, dflt, client, org) {
      try {
        var r = R().DB.query("SELECT Value AS v FROM AD_SysConfig WHERE Name=? AND AD_Client_ID IN (0,?) AND AD_Org_ID IN (0,?) AND IsActive='Y' ORDER BY AD_Client_ID DESC, AD_Org_ID DESC", [name, client || 0, org || 0])[0];
        return r ? r.v : dflt;
      } catch (e) { R().unportedDep('MSysConfig.getValue(' + name + ')', 'AD_SysConfig absent from the bundle — Java default ' + dflt); return dflt; }
    };
    S.sysConfigBool = function (name, dflt, client, org) { var v = S.sysConfig(name, dflt ? 'Y' : 'N', client, org); return v == null ? dflt : 'Y' === String(v); };
    S.sysConfigInt = function (name, dflt, client, org) { var v = S.sysConfig(name, dflt == null ? null : String(dflt), client, org); return v == null ? dflt : parseInt(v, 10); };
  // MPeriod.hasUnpostedDocs (M/MPeriod.java:1024-1072)
  S.hasUnpostedDocs = function (ctx, period, periodControlID) {
    var Env = A().Env, DB = R().DB;
    var cal = DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM C_Year WHERE C_Year_ID=?', period.getC_Year_ID());
    var clientCal = DB.getSQLValue(null, 'SELECT C_Calendar_ID FROM AD_ClientInfo WHERE AD_Client_ID=?', Env.getAD_Client_ID(ctx));
    var sql = "SELECT 1 FROM RV_UnPosted up WHERE up.DocStatus IN('CO', 'CL', 'RE', 'VO') AND up.AD_Client_ID=? AND up.DateAcct BETWEEN ? AND ? " +
      ' AND AD_Org_ID IN (SELECT AD_Org_ID FROM AD_OrgInfo WHERE AD_Client_ID=? AND (C_Calendar_ID=?' + (cal === clientCal ? ' OR C_Calendar_ID IS NULL' : '') + ')) ';
    var args = [Env.getAD_Client_ID(ctx), period.getStartDate(), period.getEndDate(), Env.getAD_Client_ID(ctx), cal];
    if (periodControlID > 0) { sql += ' AND up.DocBaseType = ? '; args.push(R().PO.get('C_PeriodControl', periodControlID).getDocBaseType()); }
    sql += ' LIMIT 1';
    try { return DB.query(sql, args).length > 0; }
    catch (e) { R().unportedDep('MPeriod.hasUnpostedDocs', 'view RV_UnPosted (absent from the bundle) — treated as no unposted docs'); return false; }
  };

  // ══ GL Journal ═══════════════════════════════════════════════════════════════════════════════════════════════
  var DIM_COLS = ['account_id', 'c_subacct_id', 'm_product_id', 'c_bpartner_id', 'ad_orgtrx_id', 'c_locfrom_id', 'c_locto_id', 'c_salesregion_id', 'c_project_id', 'c_campaign_id', 'c_activity_id', 'user1_id', 'user2_id'];
  function jlParent(trx, line) { return trx.get('gl_journal', line.get('gl_journal_id')); }
  // MJournalLine.updateJournalTotal :371-397 (raw SQL sums → computed from the Trx's rows; IsActive='Y' lines; batch sums every journal)
  function updateJournalTotal(trx, journalId) {
    var Mm = ML(), dr = ZERO(), cr = ZERO();
    trx.find('gl_journalline', { gl_journal_id: journalId }).filter(function (l) { return l.isactive === 'Y'; }).forEach(function (l) { dr = dr.add(bd(l.amtacctdr) || ZERO()); cr = cr.add(bd(l.amtacctcr) || ZERO()); });
    var j = trx.get('gl_journal', journalId);
    trx.update('gl_journal', j, { totaldr: Mm.N(dr), totalcr: Mm.N(cr) });
    j = trx.get('gl_journal', journalId);
    if (nz(j.gl_journalbatch_id) !== 0) {
      var bdr = ZERO(), bcr = ZERO();
      trx.find('gl_journal', { gl_journalbatch_id: j.gl_journalbatch_id }).forEach(function (x) { bdr = bdr.add(bd(x.totaldr) || ZERO()); bcr = bcr.add(bd(x.totalcr) || ZERO()); });
      trx.update('gl_journalbatch', trx.get('gl_journalbatch', j.gl_journalbatch_id), { totaldr: Mm.N(bdr), totalcr: Mm.N(bcr) });
    }
  }
  // MJournalLine.beforeSave :279-339 (+ fillDimensionsFromCombination :345-368)
  function jlBeforeSave(trx, ctx, line, isNew) {
    var par = jlParent(trx, line);
    if (isNew && par && Y(par.processed)) return 'ParentComplete';                              // :282-285
    if (nz(line.get('ad_org_id')) <= 0) line.set('ad_org_id', par.ad_org_id);                   // :289-290
    if (nz(line.get('line')) === 0) {                                                           // :292-293 (includes this Trx's pending lines)
      var mx = 0; trx.find('gl_journalline', { gl_journal_id: line.get('gl_journal_id') }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); });
      line.set('line', mx + 10);
    }
    if (nz(line.get('c_currency_id')) === 0) line.set('c_currency_id', par.c_currency_id);      // :295-296
    if (nz(line.get('c_conversiontype_id')) === 0) line.set('c_conversiontype_id', par.c_conversiontype_id);   // :297-298
    if (nz(line.get('c_validcombination_id')) === 0) {                                          // :299-300 getOrCreateCombination (MAccount.get/create) — not in the bundle
      say(trx, '§PROC-UNPORTED-DEP MJournalLine.getOrCreateCombination (MAccount.get, MAcctSchemaElement mandatory dims) — C_ValidCombination_ID=0');
      return 'SaveError: @FillMandatory@@C_ValidCombination_ID@';
    }
    var vc = trx.get('c_validcombination', line.get('c_validcombination_id'));                  // :303 fillDimensionsFromCombination
    if (vc) {
      DIM_COLS.forEach(function (c) { line.set(c, nz(vc[c]) > 0 ? vc[c] : null); });
      if (nz(vc.ad_org_id) > 0) line.set('ad_org_id', vc.ad_org_id);
    }
    var prec = 2, rate = bd(line.get('currencyrate')), amt = rate.multiply(bd(line.get('amtsourcedr')));   // :304-312 (m_precision stays 2 unless setC_Currency_ID ran)
    if (amt.scale() > prec) amt = amt.setScale(prec, HU());
    line.set('amtacctdr', amt);
    amt = rate.multiply(bd(line.get('amtsourcecr'))); if (amt.scale() > prec) amt = amt.setScale(prec, HU());
    line.set('amtacctcr', amt);
    return null;
  }
  // MJournal.setDateAcct :174-184
  function jSetDateAcct(trx, ctx, j, d) {
    j.set('dateacct', d); if (d == null) return;
    var pid = R().M.MPeriod.getC_Period_ID(ctx, dayTS(d), nz(j.get('ad_org_id')));
    if (pid === 0) say(trx, '§MODEL-SEVERE MJournal.setDateAcct PeriodNotFound : ' + d);
    else if (pid !== nz(j.get('c_period_id'))) j.set('c_period_id', pid);
  }
  // MJournal.beforeSave :299-364
  function jBeforeSave(trx, ctx, j, isNew) {
    var M = R().M;
    if (nz(j.get('gl_journalbatch_id')) > 0) { var par = trx.get('gl_journalbatch', j.get('gl_journalbatch_id')); if (isNew && par && Y(par.processed)) return 'ParentComplete'; }
    if (j.get('datedoc') == null) { if (j.get('dateacct') == null) j.set('datedoc', trx.env.date); else j.set('datedoc', j.get('dateacct')); }
    if (j.get('dateacct') == null) jSetDateAcct(trx, ctx, j, j.get('datedoc'));
    else if (!Y(j.get('processed'))) {
      var pid = M.MPeriod.getC_Period_ID(ctx, dayTS(j.get('dateacct')), nz(j.get('ad_org_id')));
      if (pid === 0) return 'PeriodNotFound';
      else if (pid !== nz(j.get('c_period_id'))) {
        var cp = nz(j.get('c_period_id')) ? trx.get('c_period', j.get('c_period_id')) : null;
        if (cp == null) throw new Error('NullPointerException: MPeriod.get(ctx, ' + nz(j.get('c_period_id')) + ') is null (MJournal.java:339)');
        if (cp.periodtype === 'S') j.set('c_period_id', pid);
      }
    }
    if (nz(j.get('gl_category_id')) === 0 && nz(j.get('c_doctype_id')) > 0) { var dt = trx.get('c_doctype', j.get('c_doctype_id')); if (dt) j.set('gl_category_id', dt.gl_category_id); }   // :343-344
    if (nz(j.get('c_acctschema_id')) === 0) { var ci = trx.q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=?', [j.get('ad_client_id')])[0]; if (ci) j.set('c_acctschema_id', ci.a); }   // :346-347
    if (nz(j.get('c_conversiontype_id')) === 0) j.set('c_conversiontype_id', M.MConversionType.getDefault(nz(j.get('ad_client_id'))));   // :349-350
    // :365-371 propagate DateAcct change to lines: UPDATE GL_JournalLine … WHERE GL_Journal_ID=<new id> matches no row for a new journal
    return null;
  }
  // MJournal.updateBatch :412-424 (IsActive='Y' journals)
  function jUpdateBatch(trx, j) {
    if (nz(j.gl_journalbatch_id) === 0) return;
    var dr = ZERO(), cr = ZERO();
    trx.find('gl_journal', { gl_journalbatch_id: j.gl_journalbatch_id }).filter(function (x) { return x.isactive === 'Y'; }).forEach(function (x) { dr = dr.add(bd(x.totaldr) || ZERO()); cr = cr.add(bd(x.totalcr) || ZERO()); });
    trx.update('gl_journalbatch', trx.get('gl_journalbatch', j.gl_journalbatch_id), { totaldr: ML().N(dr), totalcr: ML().N(cr) });
  }

  // ══ MJournal.copyLinesFrom(fromJournal, dateAcct, typeCR) (MJournal.java:243-277) ════════════════════════════
  S.MJournal_copyLinesFrom = function (trx, ctx, to, from, dateAcct, typeCR) {
    if (Y(to.processed) || from == null) return 0;                                               // :245
    var m = ML(), fromLines = trx.find('gl_journalline', { gl_journal_id: from.gl_journal_id }, ['line', 'gl_journalline_id']);   // getLines ORDER BY Line,GL_JournalLine_ID :228
    var count = 0;
    for (var i = 0; i < fromLines.length; i++) {
      var fl = fromLines[i], tl = ML().newRecord(trx, 'gl_journalline', {});
      tl.set('line', 0).set('amtacctcr', 0).set('amtacctdr', 0).set('amtsourcecr', 0).set('amtsourcedr', 0).set('currencyrate', 1).set('dateacct', trx.env.date).set('isgenerated', 'Y');   // setInitialDefaults :64-72
      S.copyValues(trx, 'gl_journalline', fl, tl, to.ad_client_id, to.ad_org_id);                // :252
      tl.set('gl_journal_id', to.gl_journal_id);                                                 // :253
      if (dateAcct != null) tl.set('dateacct', dateAcct);                                        // :255-256
      if (typeCR === 'C') { tl.set('amtsourcedr', bd(fl.amtsourcedr).negate()).set('amtsourcecr', bd(fl.amtsourcecr).negate()); }   // :258-262
      else if (typeCR === 'R') { tl.set('amtsourcedr', fl.amtsourcecr).set('amtsourcecr', fl.amtsourcedr); }                         // :263-267
      tl.set('isgenerated', 'Y').set('processed', 'N');                                          // :268-269
      var err = jlBeforeSave(trx, ctx, tl, true);                                                // :270 save() → beforeSave
      if (err) { say(trx, '§MODEL-PO save gl_journalline refused: ' + err); continue; }
      if (tl.save()) { count++; updateJournalTotal(trx, tl.get('gl_journal_id')); }              // afterSave → updateJournalTotal :353-359
    }
    if (fromLines.length !== count) say(trx, '§MODEL-SEVERE MJournal.copyLinesFrom Line difference - JournalLines=' + fromLines.length + ' <> Saved=' + count);   // :275
    return count;
  };

  // ══ MJournalBatch.copyDetailsFrom(jb) (MJournalBatch.java:231-265) ════════════════════════════════════════════
  S.MJournalBatch_copyDetailsFrom = function (trx, ctx, to, jb) {
    if (Y(to.processed) || jb == null) return 0;                                                 // :233
    var m = ML(), count = 0, lineCount = 0;
    var fromJournals = trx.find('gl_journal', { gl_journalbatch_id: jb.gl_journalbatch_id }).sort(function (a, b) { return String(a.documentno) < String(b.documentno) ? -1 : String(a.documentno) > String(b.documentno) ? 1 : 0; });   // ORDER BY DocumentNo :199
    for (var i = 0; i < fromJournals.length; i++) {
      var fj = fromJournals[i], tj = ML().newRecord(trx, 'gl_journal', {});
      tj.set('currencyrate', 1).set('datedoc', trx.env.date).set('docaction', 'CO').set('docstatus', 'DR').set('postingtype', 'A').set('totalcr', 0).set('totaldr', 0)
        .set('isapproved', 'N').set('isprinted', 'N').set('posted', 'N').set('processed', 'N');   // setInitialDefaults :90-102
      S.copyValues(trx, 'gl_journal', fj, tj, to.ad_client_id, to.ad_org_id);                    // :241
      tj.set('gl_journalbatch_id', to.gl_journalbatch_id);                                       // :242
      tj.set('documentno', null).set('c_period_id', null);                                       // :243-244
      tj.set('datedoc', to.datedoc);                                                             // :245
      jSetDateAcct(trx, ctx, tj, to.dateacct);                                                   // :246 MJournal.setDateAcct
      tj.set('docstatus', 'DR').set('docaction', 'CO').set('totalcr', 0).set('totaldr', 0).set('isapproved', 'N').set('isprinted', 'N').set('posted', 'N').set('processed', 'N');   // :247-254
      var err = jBeforeSave(trx, ctx, tj, true);
      if (err) { say(trx, '§MODEL-PO save gl_journal refused: ' + err); continue; }
      if (tj.save()) {                                                                           // :255
        count++; jUpdateBatch(trx, tj.row);                                                      // MJournal.afterSave → updateBatch
        lineCount += S.MJournal_copyLinesFrom(trx, ctx, tj.row, fj, to.dateacct, 'x');           // :258
      }
    }
    if (fromJournals.length !== count) say(trx, '§MODEL-SEVERE MJournalBatch.copyDetailsFrom Line difference - Journals=' + fromJournals.length + ' <> Saved=' + count);   // :262
    return count + lineCount;
  };
  S._jBeforeSave = jBeforeSave;

  // ══ MBankStatementLine (MBankStatementLine.java) ═════════════════════════════════════════════════════════════
  // new MBankStatementLine(statement) :100-107 (+ setStatementLineDate :135-140)
  S.MBankStatementLine_new = function (trx, stmt) {
    var l = ML().newRecord(trx, 'c_bankstatementline', {});
    l.set('stmtamt', 0).set('trxamt', 0).set('interestamt', 0).set('chargeamt', 0).set('isreversal', 'N');   // setInitialDefaults :88-94
    l.set('ad_client_id', stmt.ad_client_id).set('ad_org_id', stmt.ad_org_id).set('c_bankstatement_id', stmt.c_bankstatement_id);
    l.set('statementlinedate', stmt.statementdate).set('valutadate', stmt.statementdate).set('dateacct', stmt.statementdate);
    return l;
  };
  // setPayment :146-163 — payment.getPayAmt(true): receipt → PayAmt, else negated (MPayment)
  S.MBankStatementLine_setPayment = function (line, pay) {
    line.set('c_payment_id', pay.c_payment_id).set('c_currency_id', pay.c_currency_id);
    var amt = bd(pay.payamt) || ZERO(); if (!Y(pay.isreceipt)) amt = amt.negate();
    var charge = line.get('chargeamt') == null ? ZERO() : bd(line.get('chargeamt')), interest = line.get('interestamt') == null ? ZERO() : bd(line.get('interestamt'));
    line.set('trxamt', amt).set('stmtamt', amt.add(charge).add(interest)).set('description', pay.description);
  };
  // isDateConsistentIfUsedForPosting :310-327
  function bslDateConsistent(trx, ctx, line, stmt) {
    if (!S.sysConfigBool('BANK_STATEMENT_POST_WITH_DATE_FROM_LINE', false, nz(line.get('ad_client_id')), 0)) return true;
    var M = R().M, hp = M.MPeriod.get(ctx, dayTS(stmt.dateacct), nz(stmt.ad_org_id)), lp = M.MPeriod.get(ctx, dayTS(line.get('dateacct')), nz(stmt.ad_org_id));
    return hp != null && lp != null && hp.getC_Period_ID() === lp.getC_Period_ID();
  }
  // beforeSave :166-260
  function bslBeforeSave(trx, ctx, line, isNew) {
    var stmt = trx.get('c_bankstatement', line.get('c_bankstatement_id'));
    if (isNew && stmt && Y(stmt.processed)) return 'ParentComplete';                               // :168-171
    if (isNew && !bslDateConsistent(trx, ctx, line, stmt)) return 'SaveError BankStatementLinePeriodNotSameAsHeader';   // :174-179
    if (nz(line.get('c_payment_id')) !== 0 && nz(line.get('c_depositbatch_id')) !== 0) return 'SaveError EitherPaymentOrDepositBatch';   // :181-184
    if (nz(line.get('c_depositbatch_id')) !== 0) { var db = trx.get('c_depositbatch', line.get('c_depositbatch_id')); if (!db || !Y(db.processed)) return 'SaveError DepositBatchIsNotProcessed'; }   // :186-189
    var amt = bd(line.get('stmtamt')).subtract(bd(line.get('trxamt'))).subtract(bd(line.get('interestamt')));   // :192-196
    if (amt.compareTo(bd(line.get('chargeamt'))) !== 0) line.set('chargeamt', amt);
    if (bd(line.get('chargeamt')).signum() !== 0 && nz(line.get('c_charge_id')) === 0) return 'FillMandatory C_Charge_ID';   // :198-202
    if (bd(line.get('trxamt')).signum() === 0 && nz(line.get('c_payment_id')) > 0) { line.set('c_payment_id', null).set('c_invoice_id', null); }   // :204-208
    if (nz(line.get('line')) === 0) {                                                            // :210-214 MAX(Line)+10 (incl. this Trx's pending lines)
      var mx = 0; trx.find('c_bankstatementline', { c_bankstatement_id: line.get('c_bankstatement_id') }).forEach(function (x) { mx = Math.max(mx, Number(x.line) || 0); });
      line.set('line', mx + 10);
    }
    if (nz(line.get('c_payment_id')) !== 0 && nz(line.get('c_bpartner_id')) === 0) {              // :216-223
      var pay = trx.get('c_payment', line.get('c_payment_id'));
      line.set('c_bpartner_id', pay.c_bpartner_id); if (nz(pay.c_invoice_id) !== 0) line.set('c_invoice_id', pay.c_invoice_id);
    }
    if (nz(line.get('c_invoice_id')) !== 0 && nz(line.get('c_bpartner_id')) === 0) { var inv = trx.get('c_invoice', line.get('c_invoice_id')); line.set('c_bpartner_id', inv.c_bpartner_id); }   // :225-229
    return null;
  }
  // updateHeader :262-287
  function bslUpdateHeader(trx, stmtId) {
    var sum = ZERO(); trx.find('c_bankstatementline', { c_bankstatement_id: stmtId }).filter(function (l) { return l.isactive === 'Y'; }).forEach(function (l) { sum = sum.add(bd(l.stmtamt) || ZERO()); });
    var st = trx.get('c_bankstatement', stmtId);
    trx.update('c_bankstatement', st, { statementdifference: ML().N(sum) });
    st = trx.get('c_bankstatement', stmtId);
    trx.update('c_bankstatement', st, { endingbalance: ML().N((bd(st.beginningbalance) || ZERO()).add(bd(st.statementdifference) || ZERO())) });
  }
  // saveEx of a bank statement line: beforeSave → insert → afterSave(updateHeader)
  S.MBankStatementLine_saveEx = function (trx, ctx, line) {
    var err = bslBeforeSave(trx, ctx, line, true);
    if (err) throw new Error('SaveError c_bankstatementline: ' + err);
    line.saveEx(); bslUpdateHeader(trx, line.get('c_bankstatement_id'));
  };

  // ══ MProductPrice.setPrices (MProductPrice.java:setPrices) ═══════════════════════════════════════════════════
  S.MProductPrice_setPrices = function (trx, pp, list, std, limit) {
    var plv = trx.get('m_pricelist_version', pp.get('m_pricelist_version_id')), pl = plv ? trx.get('m_pricelist', plv.m_pricelist_id) : null;
    var prec = pl ? Number(pl.priceprecision) : 0;
    pp.set('pricelimit', bd(limit).setScale(prec, HU())).set('pricelist', bd(list).setScale(prec, HU())).set('pricestd', bd(std).setScale(prec, HU()));
  };

  // ══ MAccount (M/MAccount.java) — was inline in AcctSchemaCopyAcct.js
    S.getAcctSchemaElements = function (trx, asId) { return elements(trx, asId); };
    function elements(trx, asId) {                                                  // MAcctSchemaElement.getAcctSchemaElements :65-69
      return trx.q('SELECT * FROM C_AcctSchema_Element WHERE C_AcctSchema_ID=? AND IsActive=? ORDER BY SeqNo', [asId, 'Y']);
    }
    // createAccount :174-237
    S.MAccount_create = function (trx, targetAS, sourceAcct) {
      var o = { AD_Org_ID: 0, Account_ID: 0, C_SubAcct_ID: 0, M_Product_ID: 0, C_BPartner_ID: 0, AD_OrgTrx_ID: 0, C_LocFrom_ID: 0, C_LocTo_ID: 0, C_SalesRegion_ID: 0, C_Project_ID: 0, C_Campaign_ID: 0, C_Activity_ID: 0, User1_ID: 0, User2_ID: 0, UserElement1_ID: 0, UserElement2_ID: 0 };
      function v(c) { var x = sourceAcct[c.toLowerCase()]; return x == null ? 0 : Number(x); }
      elements(trx, targetAS.c_acctschema_id).forEach(function (ase) {
        var t = ase.elementtype;
        if (t === 'OO') o.AD_Org_ID = v('AD_Org_ID');
        else if (t === 'AC') o.Account_ID = v('Account_ID');
        else if (t === 'SA') o.C_SubAcct_ID = v('C_SubAcct_ID');
        else if (t === 'BP') o.C_BPartner_ID = v('C_BPartner_ID');
        else if (t === 'PR') o.M_Product_ID = v('M_Product_ID');
        else if (t === 'AY') o.C_Activity_ID = v('C_Activity_ID');
        else if (t === 'LF') o.C_LocFrom_ID = v('C_LocFrom_ID');
        else if (t === 'LT') o.C_LocTo_ID = v('C_LocTo_ID');
        else if (t === 'MC') o.C_Campaign_ID = v('C_Campaign_ID');
        else if (t === 'OT') o.AD_OrgTrx_ID = v('AD_OrgTrx_ID');
        else if (t === 'PJ') o.C_Project_ID = v('C_Project_ID');
        else if (t === 'SR') o.C_SalesRegion_ID = v('C_SalesRegion_ID');
        else if (t === 'U1') o.User1_ID = v('User1_ID');
        else if (t === 'U2') o.User2_ID = v('User2_ID');
        else if (t === 'X1') o.UserElement1_ID = v('UserElement1_ID');
        else if (t === 'X2') o.UserElement2_ID = v('UserElement2_ID');
      });
      return S.MAccount_get(trx, targetAS.ad_client_id, targetAS.c_acctschema_id, o);
    };
    // MAccount.get(ctx, client, org, as, account, …, trxName) :72-235 — find the active combination, else create it
    S.MAccount_get = function (trx, clientId, asId, o) {
      var optional = ['C_SubAcct_ID', 'M_Product_ID', 'C_BPartner_ID', 'AD_OrgTrx_ID', 'C_LocFrom_ID', 'C_LocTo_ID', 'C_SalesRegion_ID', 'C_Project_ID', 'C_Campaign_ID', 'C_Activity_ID', 'User1_ID', 'User2_ID', 'UserElement1_ID', 'UserElement2_ID'];
      var where = { ad_client_id: clientId, ad_org_id: o.AD_Org_ID, c_acctschema_id: asId, account_id: o.Account_ID, isactive: 'Y' };
      optional.forEach(function (c) { where[c.toLowerCase()] = o[c] === 0 ? null : o[c]; });
      var existing = trx.find('c_validcombination', where, ['c_validcombination_id'])[0];
      if (existing) return existing;
      var f = { ad_client_id: clientId, ad_org_id: o.AD_Org_ID, c_acctschema_id: asId, account_id: o.Account_ID, isfullyqualified: 'N' };     // MAccount(ctx,0) setInitialDefaults :434-436
      optional.forEach(function (c) { if (o[c] !== 0) f[c.toLowerCase()] = o[c]; });
      // beforeSave :846-851 — setValueDescription + validate
      var vd = S.MAccount_setValueDescription(trx, asId, f);
      f.combination = vd.combi; f.description = vd.descr; f.isfullyqualified = vd.fq ? 'Y' : 'N';
      if (f.c_subacct_id) {
        var sa = trx.q('SELECT C_ElementValue_ID AS e FROM C_SubAcct WHERE C_SubAcct_ID=?', [f.c_subacct_id])[0];
        if (!sa || Number(sa.e) !== Number(f.account_id)) { trx.say('§MODEL-PO Could not create new account - C_SubAcct.C_ElementValue_ID<>Account_ID'); return null; }
      }
      var row = MLo.newPO(trx, 'c_validcombination', plainMap(f)), r = MLo.save(trx, 'c_validcombination', null, row);
      if (!r.ok) { trx.say('§MODEL-PO Could not create new account - ' + r.error); return null; }
      return r.row;
    };
    // setValueDescription :623-835
    S.MAccount_setValueDescription = function (trx, asId, a) {
      var as = trx.q('SELECT Separator AS sep FROM C_AcctSchema WHERE C_AcctSchema_ID=?', [asId])[0], sep = as ? as.sep : '', combi = '', descr = '', fq = true;
      function look(tbl, id, vc, nc) { var r = trx.q('SELECT ' + vc + ' AS v, ' + nc + ' AS n FROM ' + tbl + ' WHERE ' + tbl + '_ID=?', [id])[0]; return r ? [r.v, r.n] : [null, null]; }
      elements(trx, asId).forEach(function (el, i) {
        if (i > 0) { combi += sep; descr += sep; }
        var cs = '_', ds = '_', t = el.elementtype, mand = el.ismandatory === 'Y', x;
        function need(name) { if (mand) { trx.say('§MODEL-PO Mandatory Element missing: ' + name); fq = false; } }
        if (t === 'OO') { if (Number(a.ad_org_id) !== 0) { x = look('AD_Org', a.ad_org_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else { cs = '*'; ds = '*'; } }
        else if (t === 'AC') { if (a.account_id) { x = look('C_ElementValue', a.account_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Account'); }
        else if (t === 'SA') { if (a.c_subacct_id) { x = look('C_SubAcct', a.c_subacct_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        else if (t === 'PR') { if (a.m_product_id) { x = look('M_Product', a.m_product_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Product'); }
        else if (t === 'BP') { if (a.c_bpartner_id) { x = look('C_BPartner', a.c_bpartner_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Business Partner'); }
        else if (t === 'OT') { if (a.ad_orgtrx_id) { x = look('AD_Org', a.ad_orgtrx_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Trx Org'); }
        else if (t === 'LF') { if (a.c_locfrom_id) { x = look('C_Location', a.c_locfrom_id, 'Postal', 'City'); cs = x[0]; ds = x[1]; } else need('Location From'); }
        else if (t === 'LT') { if (a.c_locto_id) { x = look('C_Location', a.c_locfrom_id, 'Postal', 'City'); cs = x[0]; ds = x[1]; } else need('Location To'); }   // :763 reads getC_LocFrom_ID() — verbatim
        else if (t === 'SR') { if (a.c_salesregion_id) { x = look('C_SalesRegion', a.c_salesregion_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('SalesRegion'); }
        else if (t === 'PJ') { if (a.c_project_id) { x = look('C_Project', a.c_project_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Project'); }
        else if (t === 'MC') { if (a.c_campaign_id) { x = look('C_Campaign', a.c_campaign_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Campaign'); }
        else if (t === 'AY') { if (a.c_activity_id) { x = look('C_Activity', a.c_activity_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } else need('Campaign'); }
        else if (t === 'U1') { if (a.user1_id) { x = look('C_ElementValue', a.user1_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        else if (t === 'U2') { if (a.user2_id) { x = look('C_ElementValue', a.user2_id, 'Value', 'Name'); cs = x[0]; ds = x[1]; } }
        combi += cs; descr += ds;
      });
      return { combi: combi, descr: descr, fq: fq };
    };

  // ══ MYear.createStdPeriods / MPeriod — was inline in YearCreatePeriods.js ═══
    // MYear.getYearAsInt :121-147 (the Integer.parseInt path; the StringTokenizer fallback takes the first token's digits)
    function yearAsInt(fy) {
      if (/^\s*-?\d+\s*$/.test(fy)) return parseInt(fy, 10);
      var tok = String(fy || '').split(/[\/\-, \t\n\r\f]+/).filter(Boolean)[0];
      if (tok) { if (/^\d+$/.test(tok)) { var y = parseInt(tok, 10); return tok.length === 2 ? 2000 + y : y; } }
      return 0;
    }
    S.MYear_createStdPeriods = function (trx, ctx, year, startDate, dateFormat0) {                                  // MYear.createStdPeriods :209-285
      var dateFormat = dateFormat0;
      if (dateFormat == null || dateFormat === '') dateFormat = 'MMM-yy';                // :223
      var yr = yearAsInt(year.getFiscalYear());
      var sd = startDate, y, m, d;
      if (sd != null) { var dt = new Date(sd.getTime()); y = dt.getUTCFullYear(); m = dt.getUTCMonth(); d = dt.getUTCDate(); }   // :230-236 start date wins
      else { y = yr; m = 0; d = 1; }                                                    // :237-242
      for (var month = 0; month < 12; month++) {                                        // :250
        var start = new Date(Date.UTC(y, m, d));
        var name = PXS_.formatDate(trx, dateFormat, start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        var endD = new Date(Date.UTC(y, m + 1, d - 1));                                 // :256-258 +1 month, -1 day
        var startS = ts(start), endS = ts(endD);
        // MPeriod.findByCalendar(ctx, start, calendar, trx) :169 — the period of this calendar that contains the date
        var found = trx.q('SELECT p.c_period_id AS id FROM C_Period p INNER JOIN C_Year y ON (p.C_Year_ID=y.C_Year_ID) WHERE y.C_Calendar_ID=? AND p.IsActive=? AND p.PeriodType=? AND date(?) BETWEEN date(p.StartDate) AND date(p.EndDate) ORDER BY p.C_Period_ID',
          [year.getC_Calendar_ID(), 'Y', 'S', startS])[0];
        if (found == null) {
          // MPeriod(MYear, PeriodNo, name, start, end) :564-574 — new MPeriod(ctx,0,trx) (PeriodType 'S' :541-543) + setClientOrg(year)
          S.MPeriod_save(trx, null, { ad_client_id: year.getAD_Client_ID(), ad_org_id: year.getAD_Org_ID(), periodtype: 'S', c_year_id: year.getC_Year_ID(), periodno: month + 1, name: name, startdate: startS, enddate: endS }, year);
        } else {
          var cur = trx.get('c_period', found.id);                                    // :267-272 MPeriod.getCopy + setters
          S.MPeriod_save(trx, cur.row || cur, { c_year_id: year.getC_Year_ID(), periodno: month + 1, name: name, startdate: startS, enddate: endS }, year);
        }
        y = start.getUTCFullYear(); m = start.getUTCMonth();
        var nx = new Date(Date.UTC(y, m + 1, d)); y = nx.getUTCFullYear(); m = nx.getUTCMonth(); d = nx.getUTCDate();   // :280 first day of next month (end+1)
      }
      return true;
    };
    function ts(dt) { function p(n) { return n < 10 ? '0' + n : '' + n; } return dt.getUTCFullYear() + '-' + p(dt.getUTCMonth() + 1) + '-' + p(dt.getUTCDate()) + ' 00:00:00'; }
    // MPeriod.saveEx = beforeSave :799-846 → write → afterSave :849-873 (new: one C_PeriodControl per distinct DocBaseType of the client's active doc types)
    S.MPeriod_save = function (trx, row, fields, year) {
      var isNew = row == null;
      var sd = fields.startdate != null ? fields.startdate : row.startdate, ed = fields.enddate != null ? fields.enddate : row.enddate;
      if (sd == null) throw new Error('SaveError C_Period');                              // :803-806
      if (String(ed) < String(sd)) throw new Error('SaveError C_Period: ' + ed + ' < ' + sd);   // :815-820
      var cal = year.getC_Calendar_ID(), pid = isNew ? 0 : row.c_period_id;              // :824-843 overlap with another period of the calendar
      var ov = trx.q('SELECT p.c_period_id AS id, p.name AS name FROM C_Period p WHERE p.C_Year_ID IN (SELECT y.C_Year_ID FROM C_Year y WHERE y.C_Calendar_ID=?) AND (date(?) BETWEEN date(p.StartDate) AND date(p.EndDate) OR date(?) BETWEEN date(p.StartDate) AND date(p.EndDate)) AND p.PeriodType=?',
        [cal, sd, ed, isNew ? fields.periodtype : row.periodtype]).filter(function (r) { return r.id !== pid; });
      if (ov.length) throw new Error('SaveError C_Period: Period overlaps with: ' + ov[0].name);
      var saved = isNew ? S.createRow(trx, 'C_Period', fields) : S.saveRow(trx, 'C_Period', row, fields);
      if (isNew) {                                                                       // :849-873
        var types = trx.q('SELECT DISTINCT docbasetype FROM C_DocType WHERE AD_Client_ID=? AND IsActive=?', [year.getAD_Client_ID(), 'Y']);
        types.forEach(function (t) {
          // MPeriodControl(period, DocBaseType) :71-77 + initial defaults PeriodAction 'N' + PeriodStatus NeverOpened 'N' (M/MPeriodControl.java:67-70); setClientOrg(AD_Client_ID, 0)
          S.createRow(trx, 'C_PeriodControl', { ad_client_id: year.getAD_Client_ID(), ad_org_id: 0, c_period_id: saved.c_period_id, docbasetype: t.docbasetype, periodaction: 'N', periodstatus: 'N' });
        });
      }
    };

    return S;
  })(ML);

  // ── numbers / inventory-line / date-format statics — MOVED here from processes/support_stock_proc.js (stock flavour: bd(null) = ZERO)
  var PXS_ = null;
  var PXS = (function (PX) {
    var NODE = typeof module !== 'undefined' && module.exports, GL = typeof window !== 'undefined' ? window : globalThis;
    var S = {};
    // the pieces of the process lane's X these bodies use
    var X = { plainMap: PX.plainMap, save: function (trx, table, po, changes) { return ML.save(trx, String(table).toLowerCase(), po ? (po.row || po) : null, PX.plainMap(changes || {})); } };
  // new BigDecimal(double) — the exact binary expansion (java.math.BigDecimal(double)); toFixed(100) is exact for doubles of price magnitude
  S.bdFromDouble = function (d) {
    var A = AA();
    if (!isFinite(d)) throw new Error('NumberFormatException: Infinite or NaN');
    var s = d.toFixed(100).replace(/0+$/, '').replace(/\.$/, '');
    return A.BigDecimal.fromString(s === '-0' ? '0' : s);
  };
  // MCurrency.getStdPrecision (cached by C_Currency_ID)
  S.currencyStdPrecision = function (trx, curId) { var r = trx.q('SELECT StdPrecision AS p FROM C_Currency WHERE C_Currency_ID=?', [curId])[0]; return r ? Number(r.p) : 0; };
  S.dep = function (trx, what) { trx.say('§PROC-UNPORTED-DEP ' + what); };
  function AA() { return (typeof module !== 'undefined' && module.exports) ? require('./ad_callout.js') : GL.AdCallout; }
  function bd(v) { var A = AA(); return v == null ? A.Env.ZERO : (v instanceof A.BigDecimal ? v : A.toBD(String(v))); }
  S.bd = bd;
  // MProduct.getUOMPrecision (M/MProduct.java:520-530) via the callout runtime's port
  S.uomPrecision = function (trx, productId) {
    if (!productId) return null;
    var p = AA().RUNTIME.PO.get('M_Product', productId);
    return p ? AA().RUNTIME.M.MProduct.getUOMPrecision(p) : null;
  };
  // MInventoryLine.setQtyCount / setQtyInternalUse (M/MInventoryLine.java:231-262) — product UOM precision, HALF_UP
  S.invQty = function (trx, productId, q) {
    if (q == null) return q;
    var prec = S.uomPrecision(trx, productId);
    return prec == null ? q : bd(q).setScale(prec, AA().RoundingMode.HALF_UP);
  };
  // MInventoryLine.beforeSave (M/MInventoryLine.java:327-446) for the Physical Inventory / Internal Use doc subtypes;
  // Cost Adjustment lines are the CostAdjustmentLine callout lane's, not these processes' — named dep.
  S.invLineBeforeSave = function (trx, rec, isNew, parent) {
    if (isNew && parent.processed === 'Y') throw new Error('SaveError M_InventoryLine: ParentComplete');            // :329-333
    if (!rec.line) {                                                                                               // :335-340
      var mx = 0; trx.find('m_inventoryline', { m_inventory_id: rec.m_inventory_id }).forEach(function (l) { if (Number(l.line || 0) > mx) mx = Number(l.line); });
      rec.line = mx + 10;
    }
    if (isNew) { rec.qtycount = Number(S.invQty(trx, rec.m_product_id, bd(rec.qtycount)).toString());
      rec.qtyinternaluse = Number(S.invQty(trx, rec.m_product_id, bd(rec.qtyinternaluse)).toString()); }       // :346-347              // :342-346
    var dt = trx.get('c_doctype', parent.c_doctype_id), sub = dt ? dt.docsubtypeinv : null;
    if (sub === 'PI') {                                                                                            // :378-396
      if (rec.inventorytype === 'C') { if (!Number(rec.c_charge_id || 0)) throw new Error('SaveError M_InventoryLine: FillMandatory C_Charge_ID'); }
      else if (Number(rec.c_charge_id || 0) !== 0) rec.c_charge_id = 0;
      if (bd(rec.qtyinternaluse).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
    } else if (sub === 'ID') {                                                                                     // :351-377
      if (rec.inventorytype !== 'C') rec.inventorytype = 'C';
      if (!Number(rec.c_charge_id || 0)) throw new Error('SaveError M_InventoryLine: InternalUseNeedsCharge');
      if (bd(rec.qtybook).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
      if (bd(rec.qtycount).signum() !== 0) throw new Error('SaveError M_InventoryLine: Quantity');
      if (bd(rec.qtyinternaluse).signum() === 0 && parent.docaction !== 'VO') throw new Error('SaveError M_InventoryLine: FillMandatory QtyInternalUse');
    } else if (sub === 'CA') { S.dep(trx, 'MInventoryLine.beforeSave Cost Adjustment branch :397-438 (costing — CostAdjustmentLine lane)'); }
    else throw new Error('SaveError M_InventoryLine: Document inventory subtype not configured, cannot complete');   // :439-443
    if (!Number(rec.c_charge_id || 0)) rec.ad_org_id = parent.ad_org_id;                                           // :447-449
  };
  // new MInventoryLine(inventory, M_Locator_ID, M_Product_ID, M_AttributeSetInstance_ID, QtyBook, QtyCount) :134-168 + saveEx path
  S.newInventoryLine = function (trx, inventory, locatorId, productId, asiId, qtyBook, qtyCount) {
    var f = { m_inventory_id: inventory.m_inventory_id, ad_client_id: inventory.ad_client_id, ad_org_id: inventory.ad_org_id,
      m_locator_id: locatorId, m_product_id: productId, m_attributesetinstance_id: asiId,
      line: 0, inventorytype: 'D', qtybook: AA().Env.ZERO, qtycount: AA().Env.ZERO, processed: 'N',
      qtycsv: 0, currentcostprice: 0, newcostprice: 0 };      // + the physical column DEFAULTs (pg information_schema: QtyCsv 0, CurrentCostPrice 0, NewCostPrice 0)           // setInitialDefaults :103-110
    if (qtyBook != null) f.qtybook = qtyBook;
    if (qtyCount != null && qtyCount.signum() !== 0) f.qtycount = S.invQty(trx, productId, qtyCount);
    var rec = X.plainMap(f);
    S.invLineBeforeSave(trx, rec, true, inventory);
    var r = X.save(trx, 'M_InventoryLine', null, rec);
    return r.ok ? r.row : (trx.say('§MODEL-PO save m_inventoryline refused: ' + r.error), null);
  };
  S.saveInventoryLine = function (trx, line, changes, inventory) {
    var rec = Object.assign({}, line, X.plainMap(changes));
    S.invLineBeforeSave(trx, rec, false, inventory);
    var ch = {}; Object.keys(rec).forEach(function (k) { if (rec[k] !== line[k]) ch[k] = rec[k]; });
    var r = X.save(trx, 'M_InventoryLine', line, ch);
    if (!r.ok) throw new Error('SaveError M_InventoryLine: ' + r.error);
    return r.row;
  };
  // java.text.SimpleDateFormat subset (en_US): y M d literals — any other pattern letter is a named dep
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  S.formatDate = function (trx, pattern, y, m0, d) {
    function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
    var out = '', i = 0;
    while (i < pattern.length) {
      var ch = pattern.charAt(i), j = i;
      if (ch === "'") { var k = pattern.indexOf("'", i + 1); if (k < 0) k = pattern.length; out += k === i + 1 ? "'" : pattern.slice(i + 1, k); i = k + 1; continue; }
      if (!/[A-Za-z]/.test(ch)) { out += ch; i++; continue; }
      while (j < pattern.length && pattern.charAt(j) === ch) j++;
      var n = j - i;
      if (ch === 'y') out += n === 2 ? pad(y % 100, 2) : pad(y, n);
      else if (ch === 'M') out += n >= 4 ? MONL[m0] : n === 3 ? MON[m0] : pad(m0 + 1, n);
      else if (ch === 'd') out += pad(d, n);
      else { trx.say('§PROC-UNPORTED-DEP SimpleDateFormat letter "' + ch + '" in "' + pattern + '" not ported'); out += pattern.slice(i, j); }
      i = j;
    }
    return out;
  };

    return S;
  })(PXT);
  PXS_ = PXS;

  return Object.assign({}, PXT, PXS, { rate: rate, currencyBase: currencyBase, msgText: msgText, addDescription: addDescription, D: D, N: N, Y: Y, id: id, nz: nz, one: one, msg: msg, dt: dt, product: product, isItem: isItem, isStocked: isStocked,
    precisionOf: precisionOf, tax: tax, calcTax: calcTax, periodOpen: periodOpen, nextDocNo: nextDocNo, getDocumentNoByDocType: getDocumentNoByDocType, getDocumentNoByTable: getDocumentNoByTable, getDocumentNoFromSeq: getDocumentNoFromSeq, parseVariable: parseVariable, decimalFormat: decimalFormat, storageAdd: storageAdd,
    reservationAdd: reservationAdd, invoiceOpen: invoiceOpen, paymentAvailable: paymentAvailable, bpOpenBalance: bpOpenBalance,
    creditStatus: creditStatus, setTotalOpenBalance: setTotalOpenBalance, HU: HU, Z: Z });
});
