// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/invoice_open.js — the pg functions invoiceopen() / currency rate pick, as the goal engine needs them.
// VERBATIM copy of erp/ad_process.js `_agRate` / `_agInvoiceOpen` / `_agRound` (read from the core file at commit b2fa278b, NOT modified there). It is copied, not imported, because the
// overlay may not touch core files (prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW): core exports nothing of these. KEEP IN SYNC; when the owner allows a core change, replace this file with an
// import of the core function (one implementation per responsibility, AD-LAYER LAW 5). The goal engine's witness (W-GOAL-ENGINE: Open Invoices 816,050.95 incl. multi-currency + pay schedules == the
// legacy pilot) is what proves this copy.
(function (global) {
  'use strict';
  function _agRound(x, p) { var f = Math.pow(10, p == null ? 2 : p); var v = Number(x) || 0; return Math.round(v * f + (v < 0 ? -1e-9 : 1e-9)) / f; }
  function _agRate(q, from, to, when, client, org) {          // MConversionRate.getRate(…, default type, client, org) == currencyRate(): the SAME pick as model_trade.rate / doc_poster.fxRate (W-NC5-RATES, legacy-measured)
      if (!Number(from) || !Number(to) || Number(from) === Number(to)) return 1;
      var r = q('SELECT cr.multiplyrate FROM c_conversion_rate cr JOIN c_conversiontype ct ON ct.c_conversiontype_id=cr.c_conversiontype_id AND ct.isdefault=' + "'Y'" + ' WHERE cr.c_currency_id=' + Number(from) + ' AND cr.c_currency_id_to=' + Number(to) +
        " AND date('" + String(when || '').slice(0, 10) + "') BETWEEN date(cr.validfrom) AND date(cr.validto) AND upper(cr.isactive)='Y'" +
        (client != null ? ' AND cr.ad_client_id IN (0,' + Number(client) + ')' : '') + ' AND cr.ad_org_id IN (0,' + Number(org || 0) + ') ORDER BY cr.ad_client_id DESC, cr.ad_org_id DESC, cr.validfrom DESC LIMIT 1')[0];
      return r && r.multiplyrate != null ? Number(r.multiplyrate) : null;
    }
  function _agInvoiceOpen(q, inv, ipsId) {
      var base = String(inv.docbasetype || ''), mulCM = base.charAt(2) === 'C' ? -1 : 1, mulAP = base.charAt(1) === 'P' ? -1 : 1;
      var cur = Number(inv.c_currency_id || 0), pc = q('SELECT stdprecision FROM c_currency WHERE c_currency_id=' + cur)[0];
      var prec = pc ? Number(pc.stdprecision) : 2, min = Math.pow(10, -prec);
      var sched = String(inv.ispayschedulevalid || 'N') === 'Y'
        ? q("SELECT c_invoicepayschedule_id, dueamt FROM c_invoicepayschedule WHERE c_invoice_id=" + Number(inv.c_invoice_id) + " AND isvalid='Y' ORDER BY duedate") : null;
      var total = sched ? sched.reduce(function (a, s) { return a + Number(s.dueamt || 0) * mulCM; }, 0) : Number(inv.grandtotal || 0) * mulCM;
      var paid = 0;
      q("SELECT al.amount, al.discountamt, al.writeoffamt, a.c_currency_id, a.datetrx FROM c_allocationline al JOIN c_allocationhdr a ON a.c_allocationhdr_id=al.c_allocationhdr_id " +
        "WHERE al.c_invoice_id=" + Number(inv.c_invoice_id) + " AND a.isactive='Y'").forEach(function (a) {
        var t = (Number(a.amount || 0) + Number(a.discountamt || 0) + Number(a.writeoffamt || 0)) * mulAP;
        var rt = _agRate(q, a.c_currency_id, cur, a.datetrx, inv.ad_client_id, inv.ad_org_id); paid += rt == null ? t : t * rt;
      });
      var open;
      if (Number(ipsId) > 0 && sched) {
        var rem = paid; open = total - paid;
        sched.forEach(function (s) {
          if (Number(s.c_invoicepayschedule_id) === Number(ipsId)) { open = Number(s.dueamt) * mulCM - rem; if (Number(s.dueamt) - rem < 0) open = 0; }
          else { rem = rem - Number(s.dueamt); if (rem < 0) rem = 0; }
        });
      } else open = total - paid;
      if (open > -min && open < min) open = 0;
      return _agRound(open, prec);
    }
  var api = { invoiceOpen: _agInvoiceOpen, conversionRate: _agRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.OverlayInvoiceOpen = api;
})(typeof window !== 'undefined' ? window : this);
