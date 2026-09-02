// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * kitchen_core.js — the Kitchen Display fold (RESUME_POS_KITCHEN_EINVOICE_OPS_PANELS.md §T2-SPEC).
 *
 * A kitchen queue is "ordered, not yet delivered" — on this event-sourced substrate that is a FOLD
 * over the op log, NOT a new table: buildDeliverLaterGroup births the shipment DR ("sent to kitchen"),
 * completeShipmentOps (pos_core.js §S-4, FSM-gated) completes it ("served"). This module adds ZERO
 * business verbs — it only folds kernel_ops rows into tickets and filters the open ones.
 *
 * Separation contract (same as pos_core.js): PURE. No DB import, no Date.now/Math.random/DOM.
 * The host feeds parsed op rows and renders the result (dumb-terminal rule).
 *
 * Witness: W-KDS-QUEUE (scripts/poc_kitchen_queue.js) — read build/erp/poc_kitchen_queue.log.
 */
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KitchenCore = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {

  // ── foldTickets: kernel_ops rows (id order) → tickets ─────────────────────────────────────────
  // rows = [{op_type, parameters, timestamp?}] — parameters JSON already parsed OR a string; the op
  // payload may sit at p or p.params (the logMovements precedent, pos_lens.js). Walk in id order:
  //   CREATE_DOCUMENT C_Order            → order info (c_bpartner_id, c_pos_id) by c_order_id
  //   CREATE_LINE C_OrderLine            → qtyordered by source_line_id (the doc's QtyOrdered side)
  //   CREATE_DOCUMENT M_InOut (mv 'C-')  → OPEN a ticket, docstatus DR by absence of SET_STATUS
  //   CREATE_LINE M_InOutLine            → attach to the ticket just opened (in-group order holds)
  //   SET_STATUS M_InOut                 → transition that ticket's docstatus (CO = served/delivered)
  function foldTickets(rows) {
    var orders = {}, tickets = [], byInout = {}, curTicket = null, seq = 0;
    (rows || []).forEach(function (row) {
      var p = row.parameters;
      if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return; } }
      p = p && p.params ? p.params : p;
      if (!p || !p.table) return;
      seq++;
      if (p.op_type === 'CREATE_DOCUMENT' && p.table === 'C_Order') {
        orders[p.c_order_id] = { c_bpartner_id: p.c_bpartner_id, c_pos_id: p.c_pos_id, c_doctype_id: p.c_doctype_id };
      } else if (p.op_type === 'CREATE_DOCUMENT' && p.table === 'M_InOut') {
        curTicket = {
          m_inout_id: p.m_inout_id, c_order_id: p.source_id, c_doctype_id: p.c_doctype_id,
          m_warehouse_id: p.m_warehouse_id, movementtype: p.movementtype,
          docstatus: 'DR', seq: seq, timestamp: row.timestamp != null ? row.timestamp : null, lines: []
        };
        tickets.push(curTicket);
        if (p.m_inout_id != null) byInout[p.m_inout_id] = curTicket;
      } else if (p.op_type === 'CREATE_LINE' && p.table === 'M_InOutLine' && curTicket) {
        curTicket.lines.push({ source_line_id: p.source_line_id, m_product_id: p.m_product_id, movementqty: p.movementqty });
      } else if (p.op_type === 'SET_STATUS' && p.table === 'M_InOut') {
        var t = byInout[p.id];
        if (t) t.docstatus = p.doc_status;
      }
    });
    // enrich each ticket with its order info (partner — the counterparty the ticket serves)
    tickets.forEach(function (t) {
      var o = orders[t.c_order_id];
      if (o) { t.c_bpartner_id = o.c_bpartner_id; t.c_pos_id = o.c_pos_id; }
    });
    return tickets;
  }

  // ── queue: the open kitchen — customer shipments (C-) still DR/IP, oldest first ────────────────
  // ≡ "WHERE QtyDelivered < QtyOrdered ORDER BY order date" projected onto the event-sourced substrate:
  // a WR cash-and-carry sale completes its M_InOut IN-group (SET_STATUS CO folds before queue() runs),
  // so only deliver-later shipments — the undelivered lines — remain. FSM order = op-log id order.
  function queue(tickets) {
    return (tickets || [])
      .filter(function (t) { return t.movementtype === 'C-' && (t.docstatus === 'DR' || t.docstatus === 'IP'); })
      .sort(function (a, b) { return a.seq - b.seq; });
  }

  // ── serveOps: "served" = complete the ticket's shipment through pos_core's OWN §S-4 verb ───────
  // POS injected (browser: window.POSCore; node: require) — no import here, no fork of the FSM gate:
  // confirm-demanding doctypes refuse (reason=confirm-gated), double-serve refuses (not-open).
  // Full-qty serve: pickedQtyOf omitted → completeShipmentOps takes each line's movementqty verbatim.
  function serveOps(POS, ticket, dtRow) {
    if (!ticket || ticket.m_inout_id == null) return { ok: false, reason: 'no-ticket' };
    return POS.completeShipmentOps(
      { m_inout_id: ticket.m_inout_id, docstatus: ticket.docstatus },
      ticket.lines, dtRow, {});
  }

  return { foldTickets: foldTickets, queue: queue, serveOps: serveOps };
});
