// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — pos_import_sales.mjs: HOT chunk of the POS integration bundle (plugins/pos_integration.mjs). The process "Import POS Sales" (AD_Process 9538001).
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §9 (owner: "a one liner SQLView ... the POS import on ERP side unravels to correct models") + §11 (the plugin lives on the admin side) + §12.5/§12.7 (what the
//   legacy processes do and do not do) - Witness: W-POS-SALES (erp/tests/witness_pos_sales.js). READ THE LOG: §POSS-TICKET lines.
// WHAT IT IS: a head-office process that unravels each deposited ticket (I_Order lines + I_Payment tenders sharing the ticket key in DocumentNo) through the LEGACY processes only, ALL-OR-NONE PER TICKET:
//   1. Import Orders (AD_Process 206) over the ticket's lines, DocAction CO (legacy default is Prepare, ImportOrder.java:55: no shipment, no invoice) -> ONE completed POS order (WR also makes shipment + invoice);
//   2. the glue: the order's completed invoice must be exactly one; the tenders must add up to its GrandTotal to the cent; each tender row gets C_Invoice_ID stamped (an id link, no business rule - legacy Import Payment
//      accepts an unknown InvoiceDocumentNo silently, ImportPayment.java:270-277, so the id is stamped here and VERIFIED after);
//   3. Import Payment (AD_Process 343) over the ticket's tenders, DocAction CO (legacy default is null = saved, never completed, ImportPayment.java:52), bank account = the process parameter;
//   4. verified, or UNDONE: every row Import Orders/Import Payment wrote is read back; the ticket is accepted only when all lines and tenders are Y, one order, one completed invoice, every receipt completed on THAT invoice and the
//      invoice paid. Any failure rolls the whole ticket back to the savepoint taken before step 1 (no order, no invoice, no shipment, no receipt, no allocation, no posting) and writes I_IsImported='E' + I_ErrorMsg on its rows.
// TWIN DEVIATIONS NAMED (not legacy behaviour, because legacy has none of this):
//   (a) legacy Import Orders is NOT all-or-none per ticket (a failure abandons the rest of the batch and earlier orders stay, ImportOrder.java:786-790) and Import Payment logs and continues; per-ticket atomicity is this process's job.
//   (b) the unmodified legacy processes read EVERY pending row of the client, so each is run inside a per-ticket SCOPE: for the duration of the call this transaction's row enumeration of i_order / i_payment (trx.find with no
//       WHERE, the only way the two ports list rows) returns only the ticket's rows. No data is masked or rewritten to isolate a ticket; the scope is lifted in a finally.
//   (c) legacy tenders are tied to an order only through the invoice; the receipts carry C_Invoice_ID and no C_Order_ID (MOrder.java:2374 comment "to avoid the prepayment flag").
//   (e) Import Payment's "Set BP from Invoice" (ImportPayment.java:289-296) reads C_Invoice with raw SQL, which the twin answers from COMMITTED rows only; the invoice was made in this very transaction, so the glue
//       stamps the tender's C_BPartner_ID from that invoice (the value the statement would set) together with C_Invoice_ID. Every later check of the port reads the invoice through the transaction and sees it.
//   (d) the card-number columns are never read, copied or written by this process; the till leaves them empty (POS_PLUGIN_LOCAL_FIRST §5) and the legacy port copies them verbatim if a site fills them.
// Deterministic: no clock, no random.
export const CLASSNAME = 'org.kernel.pos.ImportPOSSales';

export function activate(ctx) {
  const AP = ctx.process;
  AP.defineProcess(CLASSNAME, function (SvrProcess, X) {
    const nz = (v) => (v == null || v === '' ? 0 : Number(v));
    const idNum = (v) => (X.ML.isNewId(v) ? 1e15 + Number(String(v).slice(5)) : Number(v));
    const cents = (v) => Math.round(Number(v == null ? 0 : v) * 100);
    const money = (c) => (c / 100).toFixed(2);
    const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    const refuse = (msg) => { const e = new Error(msg); e.refusal = true; return e; };

    function ImportPOSSales() {
      SvrProcess.call(this);
      this.p_client = null; this.p_org = null; this.p_bank = 0; this.p_key = null;
    }
    ImportPOSSales.prototype = Object.create(SvrProcess.prototype);

    // prepare: the four AD_Process_Para of AD_Process 9538001
    ImportPOSSales.prototype.prepare = function () {
      const para = this.getParameter();
      for (let i = 0; i < para.length; i++) {
        const name = para[i].getParameterName(), pv = para[i].getParameter();
        if (name === 'AD_Client_ID') this.p_client = pv == null ? null : para[i].getParameterAsInt();
        else if (name === 'AD_Org_ID') this.p_org = pv == null ? null : para[i].getParameterAsInt();
        else if (name === 'C_BankAccount_ID') this.p_bank = pv == null ? 0 : para[i].getParameterAsInt();
        else if (name === 'DocumentNo') this.p_key = pv == null || String(pv) === '' ? null : String(pv);
        else X.A.RUNTIME.log('§PROC-UNKNOWN-PARA ImportPOSSales ' + name);
      }
    };

    ImportPOSSales.prototype.doIt = function () {
      const self = this, trx = this.get_TrxName(), A = X.A, C = this.p_client != null ? this.p_client : this.getAD_Client_ID();
      try { trx.q('SELECT 1 AS x FROM i_order LIMIT 1'); trx.q('SELECT 1 AS x FROM i_payment LIMIT 1'); } catch (e) { throw new Error('I_Order / I_Payment have no physical table on this host (AdImportTables.ensure)'); }
      if (!this.p_bank) throw new Error('@NotFound@ @C_BankAccount_ID@ - ' + this.p_bank);               // the same refusal text Import Payment gives (ImportPayment.java:89-90), raised before any ticket is touched
      const inClient = (r) => r.ad_client_id == null || String(r.ad_client_id) === String(C);
      const pending = (r) => String(r.i_isimported) !== 'Y' && inClient(r);
      const keyOf = (r) => String(nz(r.ad_org_id)) + '|' + (r.documentno == null ? '' : String(r.documentno));

      // the pending population, read BEFORE any scope is set
      const tickets = {}, order = [];
      function T(r) { const kk = keyOf(r); if (!tickets[kk]) { tickets[kk] = { key: kk, docno: r.documentno == null ? '' : String(r.documentno), org: nz(r.ad_org_id), lines: [], tenders: [], first: Infinity }; order.push(tickets[kk]); } return tickets[kk]; }
      trx.find('i_order', {}).filter(pending).sort((a, b) => idNum(a.i_order_id) - idNum(b.i_order_id)).forEach((r) => { const t = T(r); t.lines.push(r.i_order_id); t.first = Math.min(t.first, idNum(r.i_order_id)); });
      trx.find('i_payment', {}).filter(pending).sort((a, b) => idNum(a.i_payment_id) - idNum(b.i_payment_id)).forEach((r) => { const t = T(r); t.tenders.push(r.i_payment_id); if (t.first === Infinity) t.first = 1e17 + idNum(r.i_payment_id); });
      const todo = order.filter((t) => !self.p_key || t.docno === self.p_key).sort((a, b) => a.first - b.first);

      // per-ticket SCOPE (deviation b): lists only the ticket's rows to the legacy ports; lifted by the caller's finally
      function scope(ids) {
        const own = Object.prototype.hasOwnProperty.call(trx, 'find'), orig = trx.find;
        trx.find = function (table, where, orderBy) {
          const rows = orig.call(this, table, where, orderBy), t = String(table).toLowerCase();
          if (ids[t] && (!where || !Object.keys(where).length)) { const idc = this.idCol(t); return rows.filter((r) => ids[t][String(r[idc])]); }
          return rows;
        };
        return () => { if (own) trx.find = orig; else delete trx.find; };
      }
      const asSet = (a) => { const o = {}; a.forEach((x) => { o[String(x)] = 1; }); return o; };
      const rowsOf = (table, ids) => ids.map((id) => trx.get(table, id)).filter(Boolean);
      const msgOf = (rows) => rows.map((r) => clean(r.i_errormsg)).filter((m) => m && m !== ' ').filter((m, i, a) => a.indexOf(m) === i).join(' ');
      const innerLogs = (from) => trx.log.slice(from).filter((l) => /^§IMPORT_ORDER_COLLISION|^§IMPORT_(ORDER|PAYMENT)_(EXCEPTION|SAVE_REFUSED)/.test(l)).map((l) => clean(l).slice(0, 160));

      let nOk = 0, nRefused = 0, nOrders = 0, nReceipts = 0;
      todo.forEach(function (t) {
        const sp = trx.setSavepoint(), log0 = trx.log.length;
        let released = null, orderId = null, orderIds = [], inv = null, payIds = [], reason = null;
        try {
          if (!t.docno) throw refuse('ERR=ticket key (DocumentNo) is empty');
          if (!t.lines.length) throw refuse('ERR=no ticket lines: ' + t.tenders.length + ' tender row(s) without I_Order lines for this ticket key');
          if (!t.tenders.length) throw refuse('ERR=no tenders: ' + t.lines.length + ' ticket line(s) without I_Payment tender rows for this ticket key');
          released = scope({ i_order: asSet(t.lines), i_payment: asSet(t.tenders) });
          // 1. Import Orders (206), DocAction CO
          const po = { AD_Client_ID: C, DocAction: 'CO', DeleteOldImported: 'N' };
          if (self.p_org != null) po.AD_Org_ID = self.p_org;
          const ro = AP.runInTrx(trx, 206, { params: po });
          let lrows = rowsOf('i_order', t.lines);
          orderIds = lrows.map((r) => r.c_order_id).filter((v) => v != null && v !== '').filter((v, i, a) => a.indexOf(v) === i);
          orderId = orderIds.length ? orderIds[0] : null;
          if (!ro.ok) throw refuse('ERR=Import Orders failed: ' + clean(ro.summary));
          const notY = lrows.filter((r) => r.i_isimported !== 'Y');
          if (notY.length) throw refuse('ERR=Import Orders imported ' + (lrows.length - notY.length) + ' of ' + lrows.length + ' ticket lines. ' + msgOf(lrows) + ' ' + innerLogs(log0).join(' '));
          if (orderIds.length !== 1) throw refuse('ERR=the ticket became ' + orderIds.length + ' orders (one expected: BPartner, bill-to, location and DocumentNo must be the same on every line)');
          const ord = trx.get('c_order', orderId);
          if (!ord || ord.docstatus !== 'CO') throw refuse('ERR=the order is not completed (DocStatus ' + (ord && ord.docstatus) + '). ' + innerLogs(log0).join(' '));
          const invs = trx.find('c_invoice', { c_order_id: orderId }).filter((i) => i.docstatus === 'CO');
          if (invs.length !== 1) throw refuse('ERR=the order has ' + invs.length + ' completed invoice(s), one expected');
          inv = invs[0];
          // 2. the glue: total check, then the invoice link
          const tenders = rowsOf('i_payment', t.tenders), tcents = tenders.reduce((a, r) => a + cents(r.payamt), 0);
          if (tcents !== cents(inv.grandtotal)) throw refuse('ERR=Tenders total ' + money(tcents) + ' <> invoice total ' + money(cents(inv.grandtotal)));
          tenders.forEach((r) => trx.update('i_payment', r, r.c_bpartner_id == null ? { c_invoice_id: inv.c_invoice_id, c_bpartner_id: inv.c_bpartner_id } : { c_invoice_id: inv.c_invoice_id }));   // deviation (e): the BP is what ImportPayment.java:289-296 would take from the invoice
          // 3. Import Payment (343), DocAction CO, bank account from the parameter
          const pp = { AD_Org_ID: self.p_org != null ? self.p_org : t.org, C_BankAccount_ID: self.p_bank, DocAction: 'CO', DeleteOldImported: 'N' };
          const rp = AP.runInTrx(trx, 343, { params: pp });
          const trows = rowsOf('i_payment', t.tenders);
          if (!rp.ok) throw refuse('ERR=Import Payment failed: ' + clean(rp.summary));
          const tNotY = trows.filter((r) => r.i_isimported !== 'Y' || r.c_payment_id == null);
          if (tNotY.length) throw refuse('ERR=Import Payment imported ' + (trows.length - tNotY.length) + ' of ' + trows.length + ' tenders. ' + msgOf(trows) + ' ' + innerLogs(log0).join(' '));
          // 4. verify
          payIds = trows.map((r) => r.c_payment_id);
          const pays = payIds.map((id) => trx.get('c_payment', id));
          const bad = pays.filter((p) => !p || p.docstatus !== 'CO' || String(p.c_invoice_id) !== String(inv.c_invoice_id));
          if (bad.length || new Set(payIds.map(String)).size !== trows.length) throw refuse('ERR=' + bad.length + ' receipt(s) not completed on invoice ' + inv.c_invoice_id);
          const invNow = trx.get('c_invoice', inv.c_invoice_id);
          if (!invNow || invNow.ispaid !== 'Y') throw refuse('ERR=the receipts do not settle invoice ' + inv.c_invoice_id);
        } catch (e) {
          reason = clean(e && e.refusal ? e.message : 'ERR=' + ((e && e.message) || e)).slice(0, 1900);
        } finally { if (released) released(); }
        if (reason == null) {
          nOk++; nOrders++; nReceipts += payIds.length;
          trx.say('§POSS-TICKET key=' + t.docno + ' org=' + t.org + ' lines=' + t.lines.length + ' tenders=' + t.tenders.length + ' result=IMPORTED order=' + orderId + ' invoice=' + inv.c_invoice_id + ' receipts=' + payIds.join(','));
          return;
        }
        trx.rollbackTo(sp);                                                                                       // the whole ticket, or nothing
        const stamp = { i_isimported: 'E', i_errormsg: reason };
        t.lines.forEach((id) => { const r = trx.get('i_order', id); if (r) trx.update('i_order', r, stamp); });
        t.tenders.forEach((id) => { const r = trx.get('i_payment', id); if (r) trx.update('i_payment', r, stamp); });
        nRefused++;
        trx.say('§POSS-TICKET key=' + t.docno + ' org=' + t.org + ' lines=' + t.lines.length + ' tenders=' + t.tenders.length + ' result=REFUSED undone_order=' + (orderId == null ? 'none' : orderId) + ' reason="' + reason.slice(0, 240) + '"');
      });

      this.addLog(0, null, A.toBD(String(nRefused)), '@Errors@');
      this.addLog(0, null, A.toBD(String(nOrders)), '@C_Order_ID@: @Inserted@');
      this.addLog(0, null, A.toBD(String(nReceipts)), '@C_Payment_ID@: @Inserted@');
      trx.say('§POSS client=' + C + ' bank=' + this.p_bank + ' key=' + (this.p_key || '*') + ' tickets=' + todo.length + ' imported=' + nOk + ' refused=' + nRefused + ' receipts=' + nReceipts);
      return '#' + nOk + '/' + nRefused;
    };
    return ImportPOSSales;
  });
}
export function deactivate() { /* ctx.process.defineProcess is owner-scoped: the registry's Stop removes the class */ }
