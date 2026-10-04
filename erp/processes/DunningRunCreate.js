// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// processes/DunningRunCreate.js — org.compiere.process.DunningRunCreate, verbatim
// (org.adempiere.base.process/src/org/compiere/process/DunningRunCreate.java) + the model code it drives: MDunningRun.getLevels/getEntries/
// deleteEntries/getEntry (M/MDunningRun.java), MDunningRunEntry.setBPartner (:~120-200), MDunningRunLine setInvoice/setPayment/setFee/
// beforeSave/updateEntry (M/MDunningRunLine.java), MDunningLevel.getPreviousLevels (:92-126). §CP-PROC-CORE — Witness: W-CP-PROC-ORACLE.
// Named equivalences: the SQL functions daysBetween / paymentTermDueDays / paymentAvailable (PL/pgSQL, not registered in the witness engine) are
// evaluated in JS from the same rows (paymentTermDueDays' IsDueFixed branch is §PROC-UNPORTED-DEP); the aliased/sub-select UPDATE in updateEntry runs as
// its computed result via trx.update.
(function (global) {
  'use strict';
  var P = (typeof module !== 'undefined' && module.exports) ? require('../ad_process.js') : global.AdProcess;
  P.defineProcess('org.compiere.process.DunningRunCreate', function (SvrProcess, X) {
    function DunningRunCreate() {
      SvrProcess.call(this); this.p_IncludeInDispute = false; this.p_OnlySOTrx = false; this.p_IsAllCurrencies = false; this.p_SalesRep_ID = 0; this.p_C_Currency_ID = 0;
      this.p_C_BPartner_ID = 0; this.p_C_BP_Group_ID = 0; this.p_C_DunningRun_ID = 0; this.p_AD_Org_ID = 0; this.m_run = null;
    }
    DunningRunCreate.prototype = Object.create(SvrProcess.prototype);
    DunningRunCreate.prototype.prepare = function () {                               // :74-99
      var para = this.getParameter();
      for (var i = 0; i < para.length; i++) {
        var name = para[i].getParameterName();
        if (para[i].getParameter() == null) ;
        else if (name === 'IncludeInDispute') this.p_IncludeInDispute = 'Y' === para[i].getParameter();
        else if (name === 'OnlySOTrx') this.p_OnlySOTrx = 'Y' === para[i].getParameter();
        else if (name === 'IsAllCurrencies') this.p_IsAllCurrencies = 'Y' === para[i].getParameter();
        else if (name === 'SalesRep_ID') this.p_SalesRep_ID = para[i].getParameterAsInt();
        else if (name === 'C_Currency_ID') this.p_C_Currency_ID = para[i].getParameterAsInt();
        else if (name === 'C_BPartner_ID') this.p_C_BPartner_ID = para[i].getParameterAsInt();
        else if (name === 'C_BP_Group_ID') this.p_C_BP_Group_ID = para[i].getParameterAsInt();
        else if (name === 'AD_Org_ID') this.p_AD_Org_ID = para[i].getParameterAsInt();
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA DunningRunCreate ' + name);
      }
      this.p_C_DunningRun_ID = this.getRecord_ID();
    };
    function day(ts) { return Date.UTC(+String(ts).slice(0, 4), +String(ts).slice(5, 7) - 1, +String(ts).slice(8, 10)) / 86400000; }
    function nzn(v) { return v == null ? 0 : Number(v); }
    // ── MDunningRun model ──
    DunningRunCreate.prototype.getEntriesRows = function () {                        // MDunningRun.getEntries(true) :104-130 (this Trx's view)
      return this.get_TrxName().find('c_dunningrunentry', { c_dunningrun_id: this.m_run.c_dunningrun_id }).sort(function (a, b) {
        return (nzn(a.c_dunninglevel_id) - nzn(b.c_dunninglevel_id)) || (String(a.c_dunningrunentry_id) < String(b.c_dunningrunentry_id) ? -1 : 1); });
    };
    DunningRunCreate.prototype.linesOf = function (entry) { return this.get_TrxName().find('c_dunningrunline', { c_dunningrunentry_id: entry.c_dunningrunentry_id }); };
    DunningRunCreate.prototype.deleteEntry = function (entry) {                       // PO.delete (+ the DB's ON DELETE CASCADE of the parent link)
      var trx = this.get_TrxName(); this.linesOf(entry).forEach(function (l) { trx.del('c_dunningrunline', l); }); trx.del('c_dunningrunentry', entry);
    };
    DunningRunCreate.prototype.doIt = function () {                                  // :107-142
      var A = X.A, trx = this.get_TrxName(), self = this;
      var runPO = X.get(trx, 'C_DunningRun', this.p_C_DunningRun_ID);
      if (runPO == null || runPO.get_ID() === 0) throw new Error('Not found MDunningRun');
      this.m_run = runPO.row;
      this.getEntriesRows().forEach(function (e) { self.deleteEntry(e); });           // deleteEntries(true)
      if (this.getEntriesRows().length !== 0) throw new Error('Cannot delete existing entries');
      if (this.p_SalesRep_ID === 0) throw new Error('No SalesRep');
      if (this.p_C_Currency_ID === 0) throw new Error('No Currency');
      var run = this.m_run, levels = trx.q(Number(run.c_dunninglevel_id || 0) > 0
        ? 'SELECT * FROM C_DunningLevel WHERE C_Dunning_ID=? AND C_DunningLevel_ID=? AND IsActive=? ORDER BY DaysAfterDue DESC, C_DunningLevel_ID'
        : 'SELECT * FROM C_DunningLevel WHERE C_Dunning_ID=? AND IsActive=? ORDER BY DaysAfterDue DESC, C_DunningLevel_ID',
        Number(run.c_dunninglevel_id || 0) > 0 ? [run.c_dunning_id, run.c_dunninglevel_id, 'Y'] : [run.c_dunning_id, 'Y']);
      levels.forEach(function (l) {
        self.addInvoices(l); self.addPayments(l);
        if (l.ischargefee === 'Y') self.addFees(l);
        self.checkDunningEntry(l);
      });
      var entries = self.getEntriesRows().length;                                     // :132 (this Trx's count)
      return '@C_DunningRunEntry_ID@ #' + entries;
    };
    // MDunningRun.getEntry(C_BPartner, C_Currency, SalesRep, C_DunningLevel) :170-200 → unsaved entry row (or the existing one)
    DunningRunCreate.prototype.getEntry = function (C_BPartner_ID, C_Currency_ID, SalesRep_ID, C_DunningLevel_ID) {
      var trx = this.get_TrxName(), run = this.m_run, found = this.getEntriesRows().filter(function (e) { return Number(e.c_bpartner_id) === C_BPartner_ID && Number(e.c_dunninglevel_id) === C_DunningLevel_ID; })[0];
      if (found) return { row: found, isNew: false };
      var bp = trx.get('c_bpartner', C_BPartner_ID), f = { ad_client_id: run.ad_client_id, ad_org_id: run.ad_org_id, c_dunningrun_id: run.c_dunningrun_id, amt: 0, qty: 0, processed: 'N' };
      this.entrySetBPartner(f, bp, true);
      if (!Number(f.salesrep_id || 0)) f.salesrep_id = SalesRep_ID;
      f.c_currency_id = C_Currency_ID; f.c_dunninglevel_id = C_DunningLevel_ID;
      return { row: f, isNew: true };
    };
    // MDunningRunEntry.setBPartner(bp, isSOTrx) :~118-205
    DunningRunCreate.prototype.entrySetBPartner = function (f, bp, isSOTrx) {
      var trx = this.get_TrxName(), A = X.A;
      f.c_bpartner_id = bp.c_bpartner_id;
      var locs = trx.q('SELECT * FROM C_BPartner_Location WHERE C_BPartner_ID=? ORDER BY C_BPartner_Location_ID', [bp.c_bpartner_id]);
      if (locs.length === 1) f.c_bpartner_location_id = locs[0].c_bpartner_location_id;
      else {
        var firstActive = null, firstBillTo = null;
        for (var i = 0; i < locs.length; i++) {
          var l = locs[i];
          if (l.isactive !== 'Y') continue; else if (firstActive == null) firstActive = l;
          if ((l.ispayfrom === 'Y' && isSOTrx) || (l.isremitto === 'Y' && !isSOTrx)) { f.c_bpartner_location_id = l.c_bpartner_location_id; break; }
          else if (firstBillTo == null && l.isbillto === 'Y') firstBillTo = l;
        }
        if (!Number(f.c_bpartner_location_id || 0)) {
          if (firstBillTo != null) f.c_bpartner_location_id = firstBillTo.c_bpartner_location_id;
          else if (firstActive != null) f.c_bpartner_location_id = firstActive.c_bpartner_location_id;
        }
      }
      if (!Number(f.c_bpartner_location_id || 0)) { var e = new Error('BPartnerNoAddressException'); e.noAddress = true; throw e; }
      var users = trx.q('SELECT * FROM AD_User WHERE C_BPartner_ID=? AND IsActive=? ORDER BY AD_User_ID', [bp.c_bpartner_id, 'Y']);   // MUser.getOfBPartner
      if (users.length === 1) f.ad_user_id = users[0].ad_user_id;
      else for (var j = 0; j < users.length; j++) if (String(users[j].c_bpartner_location_id) === String(f.c_bpartner_location_id)) { f.ad_user_id = users[j].ad_user_id; break; }
      if (Number(bp.salesrep_id || 0)) f.salesrep_id = bp.salesrep_id;
    };
    // MDunningRunLine.updateEntry :309-322
    DunningRunCreate.prototype.updateEntry = function (entryId) {
      var trx = this.get_TrxName(), e = trx.get('c_dunningrunentry', entryId); if (!e) return;
      var lines = trx.find('c_dunningrunline', { c_dunningrunentry_id: entryId }), S = P.PSTK, A = X.A, sum = A.Env.ZERO, qty = 0;
      lines.forEach(function (l) { sum = sum.add(S.bd(l.convertedamt)).add(S.bd(l.feeamt)).add(S.bd(l.interestamt)); if (l.c_invoice_id != null || l.c_payment_id != null) qty++; });
      trx.update('c_dunningrunentry', e, { amt: Number(sum.toString()), qty: qty });
    };
    // MConversionRate.convert(ctx, amt, from, to, client, org) — same currency is identity; else the currencyConvert function at the context date
    DunningRunCreate.prototype.convert = function (amt, from, to, client, org) {
      var A = X.A, trx = this.get_TrxName();
      if (amt == null || amt.signum() === 0 || from === to) return amt;
      var r = trx.q('SELECT currencyConvert(?, ?, ?, ?, NULL, ?, ?) AS v', [Number(amt.toString()), from, to, trx.env.date, client, org])[0];
      return r && r.v != null ? P.PSTK.bd(r.v) : null;
    };
    // MDunningRunLine.beforeSave :256-282 (unprocessed lines only here — see processed branch dep) + saveNew + afterSave updateEntry
    DunningRunCreate.prototype.saveLine = function (entryId, f, curFrom, curTo, existing) {
      var trx = this.get_TrxName(), S = P.PSTK, A = X.A, run = this.m_run;
      if (!Number(f.c_invoice_id || 0) && !Number(f.c_payment_id || 0)) { f.amt = 0; f.openamt = 0; }
      var open = S.bd(f.openamt), conv = S.bd(f.convertedamt);
      if (A.Env.ZERO.compareTo(open) === 0) f.convertedamt = 0;
      else if (A.Env.ZERO.compareTo(conv) === 0) { var c = this.convert(open, curFrom, curTo, run.ad_client_id, run.ad_org_id); f.convertedamt = c == null ? 0 : Number(c.toString()); }
      f.totalamt = Number(S.bd(f.convertedamt).add(S.bd(f.feeamt)).add(S.bd(f.interestamt)).toString());
      if (f.processed === 'Y') S.dep(trx, 'MDunningRunLine.beforeSave processed branch :262-279 (invoice dunning level) — not reached by DunningRunCreate');
      var r = existing ? X.save(trx, 'C_DunningRunLine', existing, f) : X.save(trx, 'C_DunningRunLine', null, X.newPO(trx, 'C_DunningRunLine', f));
      if (!r.ok) throw new Error('Cannot save MDunningRunLine');
      this.updateEntry(entryId);
      return r.row;
    };
    DunningRunCreate.prototype.saveEntry = function (entry) {
      var trx = this.get_TrxName(), S = P.PSTK, f = entry.row;
      if (!entry.isNew) return f;
      var cols = S.cols(trx, 'C_DunningRunEntry'), row = X.newPO(trx, 'C_DunningRunEntry', f);
      if (cols) ['processed', 'processing', 'posted'].forEach(function (c) { if (!cols[c] && !(c in f)) delete row[c]; });
      var r = X.save(trx, 'C_DunningRunEntry', null, row);
      if (!r.ok) throw new Error('Cannot save MDunningRunEntry');
      entry.row = r.row; entry.isNew = false; return r.row;
    };
    // paymentTermDueDays(PaymentTerm_ID, DocDate, PayDate) — the non-fixed branch of the PL/pgSQL function (DueDate = TRUNC(DocDate)+NetDays)
    DunningRunCreate.prototype.paymentTermDueDays = function (termId, docDate, payDate) {
      var trx = this.get_TrxName();
      if (!termId || docDate == null) return 0;
      var pay = payDate || trx.env.date, p = trx.q('SELECT * FROM C_PaymentTerm WHERE C_PaymentTerm_ID=?', [termId])[0];
      if (!p) return 0;
      if (p.isduefixed === 'Y') { P.PSTK.dep(trx, 'paymentTermDueDays IsDueFixed branch (PL/pgSQL) — days treated as 0'); return 0; }
      return day(pay) - (day(docDate) + nzn(p.netdays));
    };
    // addInvoices :148-299
    DunningRunCreate.prototype.addInvoices = function (level) {
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), self = this, run = this.m_run, S = P.PSTK, count = 0;
      R.M.ensureView('c_invoice_v');
      var sql = 'SELECT i.C_Invoice_ID, i.C_Currency_ID, i.GrandTotal*i.MultiplierAP, invoiceOpen(i.C_Invoice_ID,i.C_InvoicePaySchedule_ID)*MultiplierAP, ips.DueDate, i.C_PaymentTerm_ID, i.DateInvoiced, i.IsInDispute, i.C_BPartner_ID, i.C_InvoicePaySchedule_ID ' +
        'FROM C_Invoice_v i LEFT OUTER JOIN C_InvoicePaySchedule ips ON (i.C_InvoicePaySchedule_ID=ips.C_InvoicePaySchedule_ID) ' +
        "WHERE i.IsPaid='N' AND i.AD_Client_ID=? AND i.DocStatus IN ('CO','CL') AND (i.DunningGrace IS NULL OR i.DunningGrace<?) " +
        'AND EXISTS (SELECT * FROM C_DunningLevel dl WHERE dl.C_DunningLevel_ID=? AND dl.C_Dunning_ID IN (SELECT COALESCE(bp.C_Dunning_ID, bpg.C_Dunning_ID) FROM C_BPartner bp INNER JOIN C_BP_Group bpg ON (bp.C_BP_Group_ID=bpg.C_BP_Group_ID) WHERE i.C_BPartner_ID=bp.C_BPartner_ID AND (bp.DunningGrace IS NULL OR bp.DunningGrace<?)))';
      var args = [run.ad_client_id, run.dunningdate, level.c_dunninglevel_id, run.dunningdate];
      if (this.p_C_BPartner_ID !== 0) { sql += ' AND i.C_BPartner_ID=?'; args.push(this.p_C_BPartner_ID); }
      else if (this.p_C_BP_Group_ID !== 0) { sql += ' AND EXISTS (SELECT * FROM C_BPartner bp WHERE i.C_BPartner_ID=bp.C_BPartner_ID AND bp.C_BP_Group_ID=?)'; args.push(this.p_C_BP_Group_ID); }
      if (this.p_OnlySOTrx) sql += " AND i.IsSOTrx='Y'";
      if (!this.p_IsAllCurrencies) sql += ' AND i.C_Currency_ID=' + this.p_C_Currency_ID;
      if (this.p_AD_Org_ID !== 0) sql += ' AND i.AD_Org_ID=' + this.p_AD_Org_ID;
      var prev = null;
      if (level.c_dunning_id != null && trx.q('SELECT CreateLevelsSequentially AS s FROM C_Dunning WHERE C_Dunning_ID=?', [level.c_dunning_id])[0].s === 'Y') {   // :189-206
        prev = trx.q('SELECT * FROM C_DunningLevel WHERE C_Dunning_ID=? AND DaysAfterDue+DaysBetweenDunning<?', [level.c_dunning_id, Math.trunc(nzn(level.daysafterdue)) + nzn(level.daysbetweendunning)]);
        prev.forEach(function (el) {
          sql += ' AND i.C_Invoice_ID IN (SELECT C_Invoice_ID FROM C_DunningRunLine WHERE C_DunningRunEntry_ID IN (SELECT C_DunningRunEntry_ID FROM C_DunningRunEntry WHERE C_DunningRun_ID IN (SELECT C_DunningRun_ID FROM C_DunningRunEntry WHERE C_DunningLevel_ID=' + el.c_dunninglevel_id + ")) AND Processed<>'N')";
        });
      }
      var daysAfterDue = Math.trunc(nzn(level.daysafterdue)), daysBetweenDunning = nzn(level.daysbetweendunning);
      try {
        var rows = trx.q(sql, args);
        rows.forEach(function (r) {
          var keys = Object.keys(r), v = keys.map(function (k) { return r[k]; });
          var C_Invoice_ID = Number(v[0]), C_Currency_ID = Number(v[1]), GrandTotal = S.bd(v[2]), Open = S.bd(v[3]);
          var DaysDue = v[4] != null ? day(run.dunningdate) - day(v[4]) : self.paymentTermDueDays(Number(v[5] || 0), v[6], run.dunningdate);   // COALESCE(daysBetween(?,ips.DueDate), paymentTermDueDays(...))
          var IsInDispute = 'Y' === v[7], C_BPartner_ID = Number(v[8]), C_InvoicePaySchedule_ID = Number(v[9] || 0);
          if (!self.p_IncludeInDispute && IsInDispute) return;
          if (DaysDue < daysAfterDue && level.isshowalldue !== 'Y') return;
          if (A.Env.ZERO.compareTo(Open) === 0) return;
          var TimesDunned = 0, DaysAfterLast = 0;
          // sql2: COUNT(*), COALESCE(DAYSBETWEEN(MAX(dr2.DunningDate), MAX(dr.DunningDate)),0) — this run's lines for the invoice, in this Trx
          var dts = [];
          trx.find('c_dunningrunline', { c_invoice_id: C_Invoice_ID }).forEach(function (l) {     // dr JOIN dre JOIN drl WHERE drl.C_Invoice_ID — this Trx's view (deleted entries gone, earlier levels in)
            var en = trx.get('c_dunningrunentry', l.c_dunningrunentry_id), rr = en ? trx.get('c_dunningrun', en.c_dunningrun_id) : null;
            if (rr) dts.push(day(rr.dunningdate));
          });
          if (dts.length > 0) { TimesDunned = dts.length; DaysAfterLast = day(run.dunningdate) - dts.reduce(function (x, y) { return Math.max(x, y); }); }
          if (daysBetweenDunning !== 0 && TimesDunned > 0 && DaysAfterLast < daysBetweenDunning && level.isshowalldue !== 'Y' && level.isshownotdue !== 'Y') return;
          if (DaysDue <= 0 && level.isshownotdue !== 'Y') return;
          if (DaysAfterLast < daysBetweenDunning) TimesDunned = TimesDunned * -1;
          if (self.createInvoiceLine(C_Invoice_ID, C_InvoicePaySchedule_ID, C_Currency_ID, GrandTotal, Open, DaysDue, IsInDispute, C_BPartner_ID, TimesDunned, DaysAfterLast, Number(level.c_dunninglevel_id))) count++;
        });
      } catch (e) { trx.say('§PROC-SEVERE addInvoices ' + ((e && e.message) || e)); self.addLog(0, null, null, (e && e.message) || String(e)); }
      return count;
    };
    // createInvoiceLine :313-352
    DunningRunCreate.prototype.createInvoiceLine = function (C_Invoice_ID, C_InvoicePaySchedule_ID, C_Currency_ID, GrandTotal, Open, DaysDue, IsInDispute, C_BPartner_ID, TimesDunned, DaysAfterLast, levelId) {
      var A = X.A, trx = this.get_TrxName(), entry;
      try { entry = this.getEntry(C_BPartner_ID, this.p_C_Currency_ID, this.p_SalesRep_ID, levelId); }
      catch (e) {
        if (!e.noAddress) throw e;
        var inv = trx.get('c_invoice', C_Invoice_ID), bp = trx.get('c_bpartner', C_BPartner_ID);
        this.addLog(0, null, null, '@Skip@ @C_Invoice_ID@ ' + (inv ? inv.documentno : C_Invoice_ID) + ', @C_BPartner_ID@ ' + (bp ? bp.name : C_BPartner_ID) + ' @No@ @IsActive@ @C_BPartner_Location_ID@');
        return false;
      }
      var er = this.saveEntry(entry);
      var run = this.m_run, f = { ad_client_id: er.ad_client_id, ad_org_id: er.ad_org_id, c_dunningrunentry_id: er.c_dunningrunentry_id, amt: 0, openamt: 0, convertedamt: 0, feeamt: 0, interestamt: 0, totalamt: 0, daysdue: 0, timesdunned: 0, isindispute: 'N', processed: 'N' };
      var S = P.PSTK;
      f.c_invoice_id = C_Invoice_ID; f.amt = Number(GrandTotal.toString()); f.openamt = Number(Open.toString()); f.feeamt = 0;
      var cv = this.convert(Open, C_Currency_ID, Number(er.c_currency_id), er.ad_client_id, er.ad_org_id); f.convertedamt = cv == null ? 0 : Number(cv.toString());
      f.isindispute = IsInDispute ? 'Y' : 'N'; f.daysdue = DaysDue; f.timesdunned = TimesDunned;
      if (C_InvoicePaySchedule_ID) f.c_invoicepayschedule_id = C_InvoicePaySchedule_ID;
      this.saveLine(er.c_dunningrunentry_id, f, C_Currency_ID, Number(er.c_currency_id));
      return true;
    };
    // paymentAvailable(C_Payment_ID) — PL/pgSQL port: PayAmt (C_Payment_v) less allocations converted, ignore-rounding, ROUND to precision
    DunningRunCreate.prototype.paymentAvailable = function (payId) {
      var A = X.A, trx = this.get_TrxName(), S = P.PSTK;
      var ch = trx.q('SELECT MAX(PayAmt) AS m FROM C_Payment WHERE C_Payment_ID=? AND C_Charge_ID > 0', [payId])[0];
      if (ch && ch.m != null) return A.Env.ZERO;
      var p = trx.q('SELECT C_Currency_ID AS c, PayAmt AS a FROM C_Payment_v WHERE C_Payment_ID=?', [payId])[0];
      var avail = S.bd(p.a), prec = S.currencyStdPrecision(trx, p.c), min = A.BigDecimal.fromString(prec > 0 ? '0.' + new Array(prec).join('0') + '1' : '1');   // 1/10^prec
      trx.q('SELECT a.AD_Client_ID AS cl, a.AD_Org_ID AS org, al.Amount AS amt, a.C_Currency_ID AS cur, a.DateTrx AS d FROM C_AllocationLine al INNER JOIN C_AllocationHdr a ON (al.C_AllocationHdr_ID=a.C_AllocationHdr_ID) WHERE al.C_Payment_ID=? AND a.IsActive=?', [payId, 'Y'])
        .forEach(function (r) { var v = r.cur === p.c ? S.bd(r.amt) : S.bd(trx.q('SELECT currencyConvert(?, ?, ?, ?, NULL, ?, ?) AS v', [Number(r.amt), r.cur, p.c, r.d, r.cl, r.org])[0].v); avail = avail.subtract(v); });
      if (avail.compareTo(min.negate()) > 0 && avail.compareTo(min) < 0) avail = A.Env.ZERO;
      return avail.setScale(prec, A.RoundingMode.HALF_UP);
    };
    // addPayments :369-431
    DunningRunCreate.prototype.addPayments = function (level) {
      var A = X.A, R = A.RUNTIME, trx = this.get_TrxName(), self = this, S = P.PSTK, count = 0;
      R.M.ensureView('c_payment_v');
      var sql = 'SELECT C_Payment_ID, C_Currency_ID, PayAmt, C_Payment_ID, C_BPartner_ID FROM C_Payment_v p WHERE AD_Client_ID=? ' +
        "AND IsAllocated='N' AND C_BPartner_ID IS NOT NULL AND C_Charge_ID IS NULL AND DocStatus IN ('CO','CL') " +
        'AND EXISTS (SELECT * FROM C_DunningLevel dl WHERE dl.C_DunningLevel_ID=? AND dl.C_Dunning_ID IN (SELECT COALESCE(bp.C_Dunning_ID, bpg.C_Dunning_ID) FROM C_BPartner bp INNER JOIN C_BP_Group bpg ON (bp.C_BP_Group_ID=bpg.C_BP_Group_ID) WHERE p.C_BPartner_ID=bp.C_BPartner_ID))';
      var args = [this.getAD_Client_ID(), level.c_dunninglevel_id];
      if (this.p_C_BPartner_ID !== 0) { sql += ' AND C_BPartner_ID=?'; args.push(this.p_C_BPartner_ID); }
      else if (this.p_C_BP_Group_ID !== 0) { sql += ' AND EXISTS (SELECT * FROM C_BPartner bp WHERE p.C_BPartner_ID=bp.C_BPartner_ID AND bp.C_BP_Group_ID=?)'; args.push(this.p_C_BP_Group_ID); }
      var entryBps = this.getEntriesRows().map(function (e) { return Number(e.c_bpartner_id); });
      if (level.isstatement !== 'Y') sql += ' AND C_BPartner_ID IN (' + (entryBps.length ? entryBps.join(',') : 'NULL') + ')';   // "(SELECT … FROM C_DunningRunEntry WHERE C_DunningRun_ID=run)" — this Trx's entries
      if (this.p_OnlySOTrx) sql += " AND IsReceipt='Y'";
      if (this.p_AD_Org_ID !== 0) sql += ' AND p.AD_Org_ID=' + this.p_AD_Org_ID;
      try {
        trx.q(sql, args).forEach(function (r) {
          var keys = Object.keys(r), v = keys.map(function (k) { return r[k]; });
          var C_Payment_ID = Number(v[0]), C_Currency_ID = Number(v[1]), PayAmt = S.bd(v[2]).negate(), OpenAmt = self.paymentAvailable(C_Payment_ID).negate(), C_BPartner_ID = Number(v[4]);
          if (A.Env.ZERO.compareTo(OpenAmt) === 0) return;
          if (self.createPaymentLine(C_Payment_ID, C_Currency_ID, PayAmt, OpenAmt, C_BPartner_ID, Number(level.c_dunninglevel_id))) count++;
        });
      } catch (e) { trx.say('§PROC-SEVERE addPayments ' + ((e && e.message) || e)); self.addLog(0, null, null, (e && e.message) || String(e)); }
      return count;
    };
    // createPaymentLine :445-483
    DunningRunCreate.prototype.createPaymentLine = function (C_Payment_ID, C_Currency_ID, PayAmt, OpenAmt, C_BPartner_ID, levelId) {
      var trx = this.get_TrxName(), entry;
      try { entry = this.getEntry(C_BPartner_ID, this.p_C_Currency_ID, this.p_SalesRep_ID, levelId); }
      catch (e) { if (!e.noAddress) throw e; this.addLog(0, null, null, '@Skip@ @C_Payment_ID@ ' + C_Payment_ID + ' @No@ @IsActive@ @C_BPartner_Location_ID@'); return false; }
      var er = this.saveEntry(entry);
      var f = { ad_client_id: er.ad_client_id, ad_org_id: er.ad_org_id, c_dunningrunentry_id: er.c_dunningrunentry_id, amt: 0, openamt: 0, convertedamt: 0, feeamt: 0, interestamt: 0, totalamt: 0, daysdue: 0, timesdunned: 0, isindispute: 'N', processed: 'N' };
      f.c_payment_id = C_Payment_ID; f.amt = Number(PayAmt.toString()); f.openamt = Number(OpenAmt.toString());
      var cv = this.convert(OpenAmt, C_Currency_ID, Number(er.c_currency_id), er.ad_client_id, er.ad_org_id); f.convertedamt = cv == null ? 0 : Number(cv.toString());
      this.saveLine(er.c_dunningrunentry_id, f, C_Currency_ID, Number(er.c_currency_id));
      return true;
    };
    // addFees :490-513
    DunningRunCreate.prototype.addFees = function (level) {
      var A = X.A, self = this, S = P.PSTK, entries = this.getEntriesRows();
      // MDunningRun.getEntries(true, onlyInvoices) :111-118 adds an entry unless (onlyInvoices && it hasInvoices)
      if (level.isstatement === 'Y') entries = entries.filter(function (e) { return !self.hasInvoices(e); });
      entries.forEach(function (el) {
        if (level.isshowalldue === 'Y' && level.isshownotdue === 'Y' && S.bd(el.amt).compareTo(A.Env.ZERO) < 0) return;
        var fee = S.bd(level.feeamt), er = el;
        var f = { ad_client_id: er.ad_client_id, ad_org_id: er.ad_org_id, c_dunningrunentry_id: er.c_dunningrunentry_id, amt: Number(fee.toString()), openamt: Number(fee.toString()), convertedamt: 0, feeamt: Number(fee.toString()), interestamt: 0, totalamt: 0, daysdue: 0, timesdunned: 0, isindispute: 'N', processed: 'N' };
        var cv = self.convert(fee, self.p_C_Currency_ID, Number(er.c_currency_id), er.ad_client_id, er.ad_org_id); f.convertedamt = cv == null ? 0 : Number(cv.toString());
        self.saveLine(er.c_dunningrunentry_id, f, self.p_C_Currency_ID, Number(er.c_currency_id));
      });
    };
    DunningRunCreate.prototype.hasInvoices = function (entry) { return this.linesOf(entry).some(function (l) { return l.c_invoice_id != null; }); };
    // checkDunningEntry :522-555
    DunningRunCreate.prototype.checkDunningEntry = function (level) {
      var self = this, trx = this.get_TrxName();
      if (level.isshowalldue !== 'Y') return;
      this.getEntriesRows().forEach(function (el) {
        var entryDelete = true;
        self.linesOf(el).filter(function (l) { return l.c_invoice_id != null; }).forEach(function (l) {   // element.getLines(true) — only invoice lines
          if (nzn(l.timesdunned) < 0) { P.PSTK.saveEx(X, trx, 'C_DunningRunLine', l, { timesdunned: nzn(l.timesdunned) * -1 }); self.updateEntry(el.c_dunningrunentry_id); }
          else entryDelete = false;
        });
        if (entryDelete) self.deleteEntry(trx.get('c_dunningrunentry', el.c_dunningrunentry_id));
      });
    };
    return DunningRunCreate;
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
