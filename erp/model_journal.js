// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — model_journal.js: the DocAction classes of GL_Journal (MJournal) and GL_JournalBatch (MJournalBatch), ported and REGISTERED into model_layer.js.
//   Spec: bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-SPEC §3 (Opening journal) / §5 E3a. Witness: erp/tests/witness_import_gljournal.js (W-IMPORT-GLJOURNAL, READ THE LOG: §IGLJ lines).
//   Why it exists (MEASURED 2026-11-10): ML.processIt(trx,'gl_journal',id,'CO') answered "no DocAction class registered for gl_journal" - the twin had the GL journal MODEL pieces (model_trade.js MJournal/MJournalLine
//   hooks, copyLinesFrom) and the POSTING (model_post.js Doc_GLJournal) but no Prepare/Complete, so an imported or hand-entered journal could never be completed and posted. Ported from
//   org.adempiere.base/src/org/compiere/model/MJournal.java (prepareIt :463-580, validatePeriod :582-614, approveIt :616, completeIt :640-677, setDefiniteDocumentNo :679-702, voidIt :704-748, closeIt :750-780)
//   and MJournalBatch.java (prepareIt :313-413, approveIt :416, completeIt :440-517, setDefiniteDocumentNo :519-538, closeIt :560-615). Posting = DOC.gl_journal (Doc_GLJournal) in model_post.js, fired by
//   ML.processIt after a CO exactly as for every other document.
//   NOT PORTED = no method on the class, so ML.processIt answers "DocAction x not implemented by the table class (named, not faked)": reverseCorrectIt / reverseAccrualIt of both classes (MJournal :782 / :858,
//   MJournalBatch :617 / :703), reActivateIt (MJournal :932, MJournalBatch :788: MFactAcct.deleteEx + canReactivateThisDocType), and the batch voidIt (:540, Java answers false: a batch cannot be voided).
//   Twin decisions: dates in the period messages print as MM/DD/YYYY (DisplayType.getDateFormat of the en_US session); the DocAction validators (fireDocValidate) go through ML.fire like model_inventory.js.
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model_layer'), require('./model_trade'));
  else root.ModelJournal = factory(root.ModelLayer, root.ModelTrade);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (ML, T) {
  var D = T.D, Y = T.Y, nz = T.nz, Z = T.Z;
  var fire = function (trx, timing, table, row) { return ML.fire(trx, timing, table, row); };
  function dfmt(v) { var s = String(v == null ? '' : v).slice(0, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? m[2] + '/' + m[3] + '/' + m[1] : s; }
  function dayOf(v) { return String(v == null ? '' : v).slice(0, 10); }
  function jLines(trx, j) { return trx.find('gl_journalline', { gl_journal_id: j.gl_journal_id }, ['line', 'gl_journalline_id']); }          // MJournal.getLines ORDER BY Line
  function jBatchJournals(trx, jb) { return trx.find('gl_journal', { gl_journalbatch_id: jb.gl_journalbatch_id }, ['documentno', 'gl_journal_id']); }   // MJournalBatch.getJournals ORDER BY DocumentNo
  function setProcessedJ(trx, j, flag) {                                                                                                  // MJournal.setProcessed :285-295 (+ the lines, raw UPDATE)
    var ch = { processed: flag }; if (flag === 'Y' && !Number(j.processedon) && trx.env.nowMillis != null) ch.processedon = trx.env.nowMillis;
    trx.update('gl_journal', j, ch);
    trx.find('gl_journalline', { gl_journal_id: j.gl_journal_id }).forEach(function (l) { trx.update('gl_journalline', l, { processed: flag }); });
  }
  function summaryJ(trx, j) {                                                                                                             // MJournal.getSummary :966-980
    var s = (j.documentno == null ? '' : j.documentno) + ': TotalDr=' + (j.totaldr == null ? '0' : j.totaldr) + ' TotalCR=' + (j.totalcr == null ? '0' : j.totalcr) + ' (#' + jLines(trx, j).length + ')';
    return j.description ? s + ' - ' + j.description : s;
  }
  // MJournal.validatePeriod(dateAcct) :582-614 - null or the message
  function validatePeriod(trx, j, dateAcct) {
    var dt = T.dt(trx, j.c_doctype_id), period = nz(j.c_period_id) ? trx.get('c_period', j.c_period_id) : null, d = dayOf(dateAcct);
    var inP = period && dayOf(period.startdate) <= d && d <= dayOf(period.enddate);                                                       // MPeriod.isInPeriod
    if (!inP) {
      period = T.periodOf(trx, d, j.ad_org_id);                                                                                          // MPeriod.get(ctx, dateAcct, AD_Org_ID, trx)
      if (!period) { trx.say('§MODEL-WARN MJournal.validatePeriod No Period for ' + d); return '@PeriodNotFound@ -> ' + dfmt(d); }
      if (Number(period.c_period_id) !== nz(j.c_period_id) && period.periodtype === 'S') { trx.say('§MODEL-WARN MJournal.validatePeriod No Period for ' + d); return '@PeriodNotValid@ -> ' + dfmt(d); }
    }
    if (!T.periodOpen(trx, d, dt.docbasetype, j.ad_org_id)) { trx.say('§MODEL-WARN ' + period.name + ': Not open for ' + dt.docbasetype + ' (' + d + ')'); return '@PeriodClosed@ -> ' + dfmt(d); }
    return null;
  }
  function accountOf(trx, line) { var vc = nz(line.c_validcombination_id) ? trx.get('c_validcombination', line.c_validcombination_id) : null; return vc && nz(vc.account_id) ? trx.get('c_elementvalue', vc.account_id) : null; }   // MJournalLine.getAccountElementValue
  function evText(ev) { return ev.value + ' - ' + ev.name; }                                                                              // MElementValue.toString

  var MJournal = {
    prepareIt: function (trx, j) {   // MJournal.prepareIt :463-580
      var m = fire(trx, 'BEFORE_PREPARE', 'gl_journal', j); if (m) { T.msg(trx, m); return 'IN'; }
      m = validatePeriod(trx, j, j.dateacct); if (m) { T.msg(trx, m); return 'IN'; }
      var lines = jLines(trx, j); if (!lines.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      var dr = Z, cr = Z, pt = j.postingtype;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (j.isactive === 'N') continue;                                                                                                  // if (!isActive()) - the JOURNAL's flag, as Java
        if (String(line.dateacct) !== String(j.dateacct)) { m = validatePeriod(trx, j, line.dateacct); if (m) { T.msg(trx, m); return 'IN'; } }   // !line.getDateAcct().equals(getDateAcct())
        var ev = accountOf(trx, line);
        if (ev && ev.isactive === 'N') { T.msg(trx, '@InActiveAccount@ - @Line@=' + line.line + ' - ' + evText(ev)); return 'IN'; }
        if (ev && Y(ev.isdoccontrolled) && (pt === 'A' || pt === 'E' || pt === 'R')) { T.msg(trx, '@DocControlledError@ - @Line@=' + line.line + ' - ' + evText(ev)); return 'IN'; }   // Actual / Commitment / Reservation
        if (pt === 'A' && ev && !Y(ev.postactual)) { T.msg(trx, '@PostingTypeActualError@ - @Line@=' + line.line + ' - ' + evText(ev)); return 'IN'; }
        if (pt === 'B' && ev && !Y(ev.postbudget)) { T.msg(trx, '@PostingTypeBudgetError@ - @Line@=' + line.line + ' - ' + evText(ev)); return 'IN'; }
        if (pt === 'S' && ev && !Y(ev.poststatistical)) { T.msg(trx, '@PostingTypeStatisticalError@ - @Line@=' + line.line + ' - ' + evText(ev)); return 'IN'; }
        dr = dr.add(D(line.amtacctdr == null ? 0 : line.amtacctdr)); cr = cr.add(D(line.amtacctcr == null ? 0 : line.amtacctcr));         // multi-currency: the accounted amounts
      }
      trx.update('gl_journal', j, { totaldr: ML.N(dr), totalcr: ML.N(cr) }); j = trx.get('gl_journal', j.gl_journal_id);
      var ca = D(j.controlamt == null ? 0 : j.controlamt);
      if (Z.compareTo(ca) !== 0 && ca.compareTo(D(j.totaldr)) !== 0) { T.msg(trx, '@ControlAmtError@'); return 'IN'; }
      if (dr.compareTo(cr) !== 0) {                                                                                                        // unbalanced and not suspense balancing
        var gl = trx.q('SELECT usesuspensebalancing AS u FROM c_acctschema_gl WHERE c_acctschema_id=?', [j.c_acctschema_id])[0];
        if (!gl || !Y(gl.u)) { T.msg(trx, '@UnbalancedJornal@'); return 'IN'; }
      }
      if (j.docaction !== 'CO') trx.update('gl_journal', j, { docaction: 'CO' });
      m = fire(trx, 'AFTER_PREPARE', 'gl_journal', trx.get('gl_journal', j.gl_journal_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = 'gl_journal:' + j.gl_journal_id;                                                                                 // m_justPrepared
      return 'IP';
    },
    completeIt: function (trx, j) {   // MJournal.completeIt :640-677
      if (trx._justPrepared !== 'gl_journal:' + j.gl_journal_id) { var st = MJournal.prepareIt(trx, j); if (st !== 'IP') return st; }      // re-check
      trx._justPrepared = null; j = trx.get('gl_journal', j.gl_journal_id);
      var d = T.dt(trx, j.c_doctype_id);                                                                                                   // setDefiniteDocumentNo :679-702
      if (Y(d.isoverwritedateoncomplete) && !Number(j.processedon)) {
        var today = String(trx.env.date).slice(0, 10) + ' 00:00:00', ch = { datedoc: today };
        if (dayOf(j.dateacct) < dayOf(today)) { ch.dateacct = today; if (!T.periodOpen(trx, today, d.docbasetype, j.ad_org_id)) throw new Error('@PeriodClosed@ @Date@=' + today + '.0, @DocBaseType@=' + d.docbasetype); }
        trx.update('gl_journal', j, ch); j = trx.get('gl_journal', j.gl_journal_id);
      }
      if (Y(d.isoverwriteseqoncomplete) && !Number(j.processedon)) { var dn = T.getDocumentNoByDocType(trx, j.c_doctype_id, true, j); if (dn != null) { trx.update('gl_journal', j, { documentno: dn }); j = trx.get('gl_journal', j.gl_journal_id); } }
      var m = fire(trx, 'BEFORE_COMPLETE', 'gl_journal', j); if (m) { T.msg(trx, m); return 'IN'; }
      if (!Y(j.isapproved)) trx.update('gl_journal', j, { isapproved: 'Y' });                                                              // implicit approval
      m = fire(trx, 'AFTER_COMPLETE', 'gl_journal', trx.get('gl_journal', j.gl_journal_id)); if (m) { T.msg(trx, m); return 'IN'; }
      setProcessedJ(trx, trx.get('gl_journal', j.gl_journal_id), 'Y');
      trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docaction: 'CL' });                                               // DOCACTION_Close
      return 'CO';
    },
    voidIt: function (trx, j) {   // MJournal.voidIt :704-748
      var m = fire(trx, 'BEFORE_VOID', 'gl_journal', j); if (m) { T.msg(trx, m); return false; }
      if (j.docstatus === 'DR' || j.docstatus === 'IN') {
        jLines(trx, j).forEach(function (l) {                                                                                              // set lines to 0
          if (Number(l.amtacctdr) !== 0 || Number(l.amtacctcr) !== 0) { var r = ML.save(trx, 'gl_journalline', l, { amtacctdr: 0, amtacctcr: 0, amtsourcedr: 0, amtsourcecr: 0, qty: 0 }); if (!r.ok) throw new Error('SaveError gl_journalline: ' + r.error); }
        });
        setProcessedJ(trx, trx.get('gl_journal', j.gl_journal_id), 'Y'); trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docaction: '--' });
      } else return false;
      m = fire(trx, 'AFTER_VOID', 'gl_journal', trx.get('gl_journal', j.gl_journal_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'VO' });                                               // DocumentEngine.voidIt
      return true;
    },
    closeIt: function (trx, j) {   // MJournal.closeIt :750-780
      var m = fire(trx, 'BEFORE_CLOSE', 'gl_journal', j); if (m) { T.msg(trx, m); return false; }
      if (j.docstatus === 'CO') { setProcessedJ(trx, j, 'Y'); trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docaction: '--' }); } else return false;
      m = fire(trx, 'AFTER_CLOSE', 'gl_journal', trx.get('gl_journal', j.gl_journal_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'CL' });                                               // DocumentEngine.closeIt
      return true;
    },
    approveIt: function (trx, j) { trx.update('gl_journal', j, { isapproved: 'Y' }); return true; },                                       // MJournal.approveIt :616 (Java mutates, the engine saves)
    rejectIt: function (trx, j) { trx.update('gl_journal', j, { isapproved: 'N' }); return true; },
    getSummary: function (trx, j) { return summaryJ(trx, j); }
  };

  var MJournalBatch = {
    prepareIt: function (trx, jb) {   // MJournalBatch.prepareIt :313-413
      var m = fire(trx, 'BEFORE_PREPARE', 'gl_journalbatch', jb); if (m) { T.msg(trx, m); return 'IN'; }
      var dt = T.dt(trx, jb.c_doctype_id);
      if (!T.periodOpen(trx, jb.dateacct, dt.docbasetype, jb.ad_org_id)) { T.msg(trx, '@PeriodClosed@'); return 'IN'; }                      // Std Period open?
      var js = jBatchJournals(trx, jb); if (!js.length) { T.msg(trx, '@NoLines@'); return 'IN'; }
      var dr = Z, cr = Z;
      for (var i = 0; i < js.length; i++) {
        var j = js[i]; if (j.isactive === 'N') continue;
        if (!/^(CL|VO|RE|CO)$/.test(j.docstatus || '')) {                                                                                  // prepare if not closed
          var status = MJournal.prepareIt(trx, j);
          if (status !== 'IP') { trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: status }); return status; }  // the process message stays on the Trx
          trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'IP' });
        }
        j = trx.get('gl_journal', j.gl_journal_id);
        dr = dr.add(D(j.totaldr == null ? 0 : j.totaldr)); cr = cr.add(D(j.totalcr == null ? 0 : j.totalcr));
      }
      trx.update('gl_journalbatch', jb, { totaldr: ML.N(dr), totalcr: ML.N(cr) }); jb = trx.get('gl_journalbatch', jb.gl_journalbatch_id);
      var ca = D(jb.controlamt == null ? 0 : jb.controlamt);
      if (Z.compareTo(ca) !== 0 && ca.compareTo(D(jb.totaldr)) !== 0) { T.msg(trx, '@ControlAmtError@'); return 'IN'; }
      js.forEach(function (j0) {                                                                                                           // Bug 1353695: currency rate and conversion type copied from journal to lines
        var j = trx.get('gl_journal', j0.gl_journal_id);
        if (j.currencyrate != null && Number(j.currencyrate) !== 0) jLines(trx, j).forEach(function (l) { var r = ML.save(trx, 'gl_journalline', l, { currencyrate: j.currencyrate }); if (!r.ok) throw new Error('SaveError gl_journalline: ' + r.error); });
        if (ML.idSet(j.c_conversiontype_id)) jLines(trx, j).forEach(function (l) { var r = ML.save(trx, 'gl_journalline', l, { c_conversiontype_id: j.c_conversiontype_id }); if (!r.ok) throw new Error('SaveError gl_journalline: ' + r.error); });
      });
      m = fire(trx, 'AFTER_PREPARE', 'gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx._justPrepared = 'gl_journalbatch:' + jb.gl_journalbatch_id;
      return 'IP';
    },
    completeIt: function (trx, jb) {   // MJournalBatch.completeIt :440-517
      if (trx._justPrepared !== 'gl_journalbatch:' + jb.gl_journalbatch_id) { var st = MJournalBatch.prepareIt(trx, jb); if (st !== 'IP') return st; }
      trx._justPrepared = null; jb = trx.get('gl_journalbatch', jb.gl_journalbatch_id);
      var d = T.dt(trx, jb.c_doctype_id);                                                                                                  // setDefiniteDocumentNo :519-538
      if (Y(d.isoverwritedateoncomplete)) {
        var today = String(trx.env.date).slice(0, 10) + ' 00:00:00', ch = { datedoc: today };
        if (dayOf(jb.dateacct) < dayOf(today)) { ch.dateacct = today; if (!T.periodOpen(trx, today, d.docbasetype, jb.ad_org_id)) throw new Error('@PeriodClosed@ @Date@=' + today + '.0, @DocBaseType@=' + d.docbasetype); }
        trx.update('gl_journalbatch', jb, ch); jb = trx.get('gl_journalbatch', jb.gl_journalbatch_id);
      }
      if (Y(d.isoverwriteseqoncomplete)) { var dn = T.getDocumentNoByDocType(trx, jb.c_doctype_id, true, jb); if (dn != null) { trx.update('gl_journalbatch', jb, { documentno: dn }); jb = trx.get('gl_journalbatch', jb.gl_journalbatch_id); } }
      var m = fire(trx, 'BEFORE_COMPLETE', 'gl_journalbatch', jb); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('gl_journalbatch', jb, { isapproved: 'Y' });                                                                              // approveIt() always
      var dr = Z, cr = Z, js = jBatchJournals(trx, jb);
      for (var i = 0; i < js.length; i++) {
        var j = js[i];
        if (j.isactive === 'N') { setProcessedJ(trx, j, 'Y'); trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'VO', docaction: '--' }); continue; }
        if (!/^(CL|VO|RE|CO)$/.test(j.docstatus || '')) {
          var res = ML.processIt(trx, 'gl_journal', j.gl_journal_id, 'CO');                                                                // journal.processIt(Complete)
          if (!res.ok) throw new Error('Failed Processing Document - ' + (res.msg || res.status));                                         // AdempiereException
          var cur = trx.get('gl_journal', j.gl_journal_id);
          if (cur.docstatus !== 'CO') { return cur.docstatus; }
        }
        j = trx.get('gl_journal', j.gl_journal_id);
        dr = dr.add(D(j.totaldr == null ? 0 : j.totaldr)); cr = cr.add(D(j.totalcr == null ? 0 : j.totalcr));
      }
      trx.update('gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id), { totaldr: ML.N(dr), totalcr: ML.N(cr) });
      m = fire(trx, 'AFTER_COMPLETE', 'gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id)); if (m) { T.msg(trx, m); return 'IN'; }
      trx.update('gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id), { processed: 'Y', docaction: 'CL' });              // setProcessed(true); setDocAction(Close)
      return 'CO';
    },
    closeIt: function (trx, jb) {   // MJournalBatch.closeIt :560-615
      var m = fire(trx, 'BEFORE_CLOSE', 'gl_journalbatch', jb); if (m) { T.msg(trx, m); return false; }
      var js = jBatchJournals(trx, jb);
      for (var i = 0; i < js.length; i++) {
        var j = js[i];
        if (j.isactive === 'N' && j.processed !== 'Y') { setProcessedJ(trx, j, 'Y'); trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'VO', docaction: '--' }); continue; }
        if (/^(DR|IP|IN)$/.test(j.docstatus || '')) { T.msg(trx, 'Journal not Completed: ' + summaryJ(trx, j)); return false; }
        if (!/^(CL|VO|RE)$/.test(j.docstatus || '')) {
          if (!MJournal.closeIt(trx, j)) { T.msg(trx, 'Cannot close: ' + summaryJ(trx, j)); return false; }
          trx.update('gl_journal', trx.get('gl_journal', j.gl_journal_id), { docstatus: 'CL' });
        }
      }
      m = fire(trx, 'AFTER_CLOSE', 'gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id)); if (m) { T.msg(trx, m); return false; }
      trx.update('gl_journalbatch', trx.get('gl_journalbatch', jb.gl_journalbatch_id), { docaction: '--', docstatus: 'CL' });
      return true;
    },
    approveIt: function (trx, jb) { trx.update('gl_journalbatch', jb, { isapproved: 'Y' }); return true; },
    rejectIt: function (trx, jb) { trx.update('gl_journalbatch', jb, { isapproved: 'N' }); return true; },
    getSummary: function (trx, jb) { return (jb.documentno == null ? '' : jb.documentno) + ': TotalDr=' + (jb.totaldr == null ? '0' : jb.totaldr) + ' TotalCR=' + (jb.totalcr == null ? '0' : jb.totalcr) + ' (#' + jBatchJournals(trx, jb).length + ')' + (jb.description ? ' - ' + jb.description : ''); }
  };

  ML.registerDocAction('gl_journal', MJournal);
  ML.registerDocAction('gl_journalbatch', MJournalBatch);
  return { MJournal: MJournal, MJournalBatch: MJournalBatch };
});
