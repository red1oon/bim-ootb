// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * odoo_adapter.js — the Odoo↔iDempiere migration adapter (prompts/ODOO_FOLD_POC.md Step 1).
 *   Spec: docs/HolyGrail.md (migration solvent) · docs/ERP.md §0.12 (static oracle) / §0.17 / §0.19.
 *
 * PURE MAPPING, NO business logic. Maps Odoo's EXECUTED O2C chain (the static build/erp/odoo_oracle)
 * onto the generic 5-table bridge + the EXISTING kernel verb set (scripts/erp_kernel.js). The engine
 * does NOT change — this file is the only new code (the falsifier's premise). `newVerbs=[]` iff every
 * hop maps to an op_type the kernel already has.
 *
 * CLEAN-ROOM (LGPL hygiene): built from Odoo's BEHAVIOUR — the executed rows in odoo_oracle — never
 * from Odoo's source/schema. A verb Odoo needs that iDempiere lacks is a NAMED finding, not a copy.
 *
 * This adapter IS the downstream artifact the user flagged: the Odoo→iDempiere data dictionary
 * (SCHEMA_MAP) + the state-machine map (STATE_MAP), using the iDempiere C_ and M_ vocabulary as the
 * lingua franca every foreign ERP folds into.
 */

// ── (A) SCHEMA MAP — Odoo model → iDempiere 5-table bridge vocabulary ─────────
// "bridge" = which of the 5 projection tables; "doc_type" = the C_ and M_ lingua-franca name.
var SCHEMA_MAP = {
  'sale.order':             { bridge: 'documents',      doc_type: 'C_Order',         note: 'SO header' },
  'sale.order.line':        { bridge: 'document_lines', doc_type: 'C_OrderLine' },
  'stock.picking':          { bridge: 'documents',      doc_type: 'M_InOut',         note: 'delivery (outgoing)' },
  'stock.move':             { bridge: 'document_lines', doc_type: 'M_InOutLine',     qty: 'movementqty' },
  'account.move':           { bridge: 'documents',      doc_type: 'C_Invoice',       note: 'AR invoice (move_type=out_invoice)' },
  'account.move.line':      { bridge: 'journal',        doc_type: 'Fact_Acct',       note: 'GL double-entry line' },
  'account.payment':        { bridge: 'journal',        doc_type: 'C_Payment' },
  'account.full.reconcile': { bridge: 'journal',        doc_type: 'C_AllocationHdr', note: 'full reconciliation = FK-directed allocation edge' }
};

// ── (B) STATE MAP — Odoo (model, from→to) → the generic transition cell's verb ─
// The headline of the falsifier: every Odoo O2C transition maps to an EXISTING op_type.
var STATE_MAP = [
  { model: 'sale.order',      from: 'draft',    to: 'sale',   verb: 'SET_STATUS',      cell: 'C_Order:CO',         note: 'confirm SO (doc pre-exists → status flip)' },
  { model: 'stock.picking',   from: 'assigned', to: 'done',   verb: 'CREATE_DOCUMENT', cell: 'M_InOut:CO',         note: '+ CREATE_LINE per delivered move' },
  { model: 'account.move',    from: 'draft',    to: 'posted', verb: 'CREATE_DOCUMENT', cell: 'C_Invoice:CO',       note: '+ CREATE_LINE per invoice line' },
  { model: 'account.move',    from: 'posted',   to: 'posted', verb: 'POST',            cell: 'C_Invoice:POST',     note: 'GL double-entry; kernel enforces ΣDR==ΣCR (§13.1)' },
  { model: 'account.payment', from: 'draft',    to: 'posted', verb: 'ALLOCATE',        cell: 'C_AllocationHdr:CO', note: 'full reconcile = FK-directed allocation (matcher NOT needed; §0.19)' }
];

// the wfmc the kernel dispatch needs — the SAME generic transitions iDempiere uses (no Odoo specifics).
var WFMC = { transitions: [ ['DR', 'CO', 'CO'], ['CO', 'POST', 'CO'] ] };

var KNOWN_VERBS = ['CREATE_DOCUMENT', 'CREATE_LINE', 'SET_STATUS', 'ALLOCATE', 'MATCH', 'POST'];

// ── build the per-document-event op-GROUPS from the static oracle (pure shape map) ──
// Each event = (docType, action, status) + the op-group the handler returns. NONE invent a value:
// every qty/amount/account is read from odoo_oracle (Odoo's executed output).
function buildEvents(oracle) {
  var soId = oracle.meta.so_id, invId = oracle.meta.invoice_id;

  // delivery: aggregate by product (Odoo splits one move into >1 move_line when reservation is partial)
  var deliv = {};
  oracle.delivery_moves.forEach(function (m) { deliv[m.pid] = (deliv[m.pid] || 0) + m.qty; });
  var shipLines = Object.keys(deliv).map(function (pid, i) {
    return { op_type: 'CREATE_LINE', table: 'M_InOutLine', source_line_id: pid, line_no: i + 1, m_product_id: Number(pid), movementqty: deliv[pid] };
  });

  // invoice lines: qtyinvoiced + net amount, per the SO line (Odoo invoice_policy='delivery' → qty==delivered)
  var invLines = oracle.sale_order_lines.map(function (l, i) {
    return { op_type: 'CREATE_LINE', table: 'C_InvoiceLine', source_line_id: String(l.pid), line_no: i + 1, m_product_id: l.pid, qtyinvoiced: l.qty_invoiced, linenetamt: l.subtotal };
  });

  // POST lines = Odoo's RESOLVED + BALANCED GL double-entry. Account DETERMINATION is Odoo's (host data,
  // §13.1: the resolver is host glue) — the POST verb only owns the ΣDR==ΣCR invariant, account-logic-free.
  var postLines = oracle.invoice_gl_lines.map(function (a) {
    return { account_id: a.account, amtacctdr: a.debit, amtacctcr: a.credit, role: (a.is_tax ? 'TAX' : (a.debit > 0 ? 'AR' : 'REV')) };
  });

  return {
    wfmc: WFMC,
    events: [
      { name: 'confirm SO', d: { docType: 'C_Order', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'SET_STATUS', table: 'C_Order', id: soId, doc_status: 'CO' } ] },
      { name: 'deliver', d: { docType: 'M_InOut', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'M_InOut', source_id: soId, doc_status: 'CO' } ].concat(shipLines) },
      { name: 'invoice', d: { docType: 'C_Invoice', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: soId, doc_status: 'CO' } ].concat(invLines) },
      { name: 'post GL', d: { docType: 'C_Invoice', action: 'POST', status: 'CO' },
        ops: [ { op_type: 'POST', table: 'C_Invoice', id: invId, lines: postLines, acctschema: 1 } ] },
      { name: 'reconcile', d: { docType: 'C_AllocationHdr', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'ALLOCATE', payment_id: 'pay' + invId, invoice_id: invId, amount: oracle.meta.reconcile_amount } ] }
    ]
  };
}

// ── sell-side PARTIAL PAYMENT (f2) — the SAME chain, with a PARTIAL ALLOCATE ──────
// Stage 2 (prompts/MIGRATION_CAMPAIGN_RESUME.md): the sell-side O2C is already folded; the ONLY new
// thing is reconciliation that does NOT clear the invoice. Odoo registered a payment of
// meta.reconcile_amount < amount_total, leaving meta.amount_residual open (payment_state='partial').
// The fold reuses the EXISTING ALLOCATE verb with the smaller amount — the residual is total−allocated,
// reproduced to the cent. NOT a new verb, NOT even new behaviour (ALLOCATE already carries an amount):
// partial payment is the cleanest f2 result — newVerbs=[] AND no engine change. Delivery is full here,
// so shipLines derive from qty_delivered (this oracle freezes the partial-PAYMENT slice, not the moves).
function buildPayPartEvents(oracle) {
  var soId = oracle.meta.so_id, invId = oracle.meta.invoice_id;
  var shipLines = oracle.sale_order_lines.map(function (l, i) {
    return { op_type: 'CREATE_LINE', table: 'M_InOutLine', source_line_id: String(l.pid), line_no: i + 1, m_product_id: l.pid, movementqty: l.qty_delivered };
  });
  var invLines = oracle.sale_order_lines.map(function (l, i) {
    return { op_type: 'CREATE_LINE', table: 'C_InvoiceLine', source_line_id: String(l.pid), line_no: i + 1, m_product_id: l.pid, qtyinvoiced: l.qty_invoiced, linenetamt: l.subtotal };
  });
  var postLines = oracle.invoice_gl_lines.map(function (a) {
    return { account_id: a.account, amtacctdr: a.debit, amtacctcr: a.credit, role: (a.is_tax ? 'TAX' : (a.debit > 0 ? 'AR' : 'REV')) };
  });
  return {
    wfmc: WFMC,
    events: [
      { name: 'confirm SO', d: { docType: 'C_Order', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'SET_STATUS', table: 'C_Order', id: soId, doc_status: 'CO' } ] },
      { name: 'deliver', d: { docType: 'M_InOut', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'M_InOut', source_id: soId, doc_status: 'CO' } ].concat(shipLines) },
      { name: 'invoice', d: { docType: 'C_Invoice', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: soId, doc_status: 'CO' } ].concat(invLines) },
      { name: 'post GL', d: { docType: 'C_Invoice', action: 'POST', status: 'CO' },
        ops: [ { op_type: 'POST', table: 'C_Invoice', id: invId, lines: postLines, acctschema: 1 } ] },
      // PARTIAL reconcile: the SAME ALLOCATE verb, amount = the partial payment (< invoice total)
      { name: 'partial pay', d: { docType: 'C_AllocationHdr', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'ALLOCATE', payment_id: 'pay' + invId, invoice_id: invId, amount: oracle.meta.reconcile_amount } ] }
    ]
  };
}

// ── f1: DERIVE the GL accounts from extracted Odoo determination CONFIG (host glue, §13.1) ─────
// The standing honest bound was: the sell-side fold took Odoo's RESOLVED accounts as host data. This
// resolver DERIVES them from config — Odoo's standard determination model, learned clean-room (read the
// config, not the source): product income = product-template account ELSE product-category account; tax =
// the tax's repartition 'tax' account; receivable = the partner's property. It is host GLUE, not engine:
// POST still owns ONLY ΣDR==ΣCR (§13.1). Raises f1 from "reproduces GIVEN accounts" → "DERIVES the accounts";
// newVerbs=[] (POST only). buildDerivedPost assembles the BALANCED double-entry from the SO subtotals +
// the config tax rate, posting each line to its DERIVED account.
function resolveAccounts(cfg) {
  function incomeFor(pid) { var p = cfg.product_income[String(pid)] || {}; return p.tmpl_income || p.categ_income; }  // Odoo fallback chain
  return { incomeFor: incomeFor, tax: cfg.tax_account, receivable: cfg.partner_receivable };
}
function buildDerivedPost(oracle) {
  var cfg = oracle.account_config, R = resolveAccounts(cfg);
  var lines = oracle.sale_order_lines.map(function (l) {
    return { account_id: R.incomeFor(l.pid), amtacctdr: 0, amtacctcr: l.subtotal, role: 'REV' };   // revenue credit, derived income acct
  });
  var untaxed = oracle.sale_order_lines.reduce(function (s, l) { return s + l.subtotal; }, 0);
  var tax = Math.round(untaxed * cfg.tax_rate) / 100;     // untaxed * rate/100, cent-rounded
  var total = untaxed + tax;
  lines.push({ account_id: R.tax, amtacctdr: 0, amtacctcr: tax, role: 'TAX' });
  lines.push({ account_id: R.receivable, amtacctdr: total, amtacctcr: 0, role: 'AR' });             // receivable debit, derived AR acct
  return {
    wfmc: WFMC, resolved: R, untaxed: untaxed, tax: tax, total: total, postLines: lines,
    event: { name: 'post GL (derived accts)', d: { docType: 'C_Invoice', action: 'POST', status: 'CO' },
             ops: [ { op_type: 'POST', table: 'C_Invoice', id: oracle.meta.invoice_id, lines: lines, acctschema: 1 } ] }
  };
}

// ── buy-side (P2P) — exercises the 3-way MATCH verb the sell-side chain does not ──
// Same pure-mapping discipline. Returns the 4 non-match events + the raw line sets the runner
// feeds to the EXISTING matcher (erp_engine.match); the matcher emits the MATCH ops (poc_longtail
// Task-3 shape). State map: purchase.order draft→purchase = SET_STATUS; stock.picking(incoming)→done
// = CREATE_DOCUMENT+CREATE_LINE; account.move(in_invoice) draft→posted = CREATE_DOCUMENT+CREATE_LINE
// + POST; PO↔receipt↔bill reconciliation = MATCH (the settlement engine, NOT a new verb).
function buildBuyEvents(oracle) {
  var poId = oracle.meta.po_id, billId = oracle.meta.bill_id, bp = oracle.meta.partner_id;
  // the three line sets the matcher reconciles (qty is Odoo's executed: ordered / received / billed)
  var poLines      = oracle.po_lines.map(function (l, i) { return { id: 'POL' + i, pid: l.pid, qty: l.ordered, bp: bp }; });
  var receiptLines = oracle.receipt_moves.map(function (m, i) { return { id: 'RCV' + i, pid: m.pid, qty: m.qty, bp: bp }; });
  var billLines    = oracle.po_lines.map(function (l, i) { return { id: 'BILL' + i, pid: l.pid, qty: l.invoiced, bp: bp }; });

  var recvOps = receiptLines.map(function (m, i) { return { op_type: 'CREATE_LINE', table: 'M_InOutLine', source_line_id: String(m.pid), line_no: i + 1, m_product_id: m.pid, movementqty: m.qty }; });
  var billOps = billLines.map(function (l, i) { return { op_type: 'CREATE_LINE', table: 'C_InvoiceLine', source_line_id: String(l.pid), line_no: i + 1, m_product_id: l.pid, qtyinvoiced: l.qty }; });
  // AP double-entry (vendor bill): account determination is Odoo's; POST owns only ΣDR==ΣCR (§13.1)
  var postLines = oracle.bill_gl_lines.map(function (a) { return { account_id: a.account, amtacctdr: a.debit, amtacctcr: a.credit, role: (a.is_tax ? 'TAX' : (a.credit > 0 ? 'AP' : 'EXP')) }; });

  return {
    wfmc: WFMC,
    matchSets: { poLines: poLines, receiptLines: receiptLines, billLines: billLines },
    events: [
      { name: 'confirm PO', d: { docType: 'C_Order', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'SET_STATUS', table: 'C_Order', id: poId, doc_status: 'CO' } ] },
      { name: 'receive', d: { docType: 'M_InOut', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'M_InOut', source_id: poId, movementtype: 'V+', doc_status: 'CO' } ].concat(recvOps) },
      { name: 'vendor bill', d: { docType: 'C_Invoice', action: 'CO', status: 'DR' },
        ops: [ { op_type: 'CREATE_DOCUMENT', table: 'C_Invoice', source_id: poId, issotrx: 'N', doc_status: 'CO' } ].concat(billOps) },
      { name: 'post bill GL', d: { docType: 'C_Invoice', action: 'POST', status: 'CO' },
        ops: [ { op_type: 'POST', table: 'C_Invoice', id: billId, lines: postLines, acctschema: 1 } ] }
      // event 5 (MATCH) is emitted by the runner via erp_engine.match — see poc_odoo_fold_3way.js
    ]
  };
}

module.exports = { SCHEMA_MAP: SCHEMA_MAP, STATE_MAP: STATE_MAP, WFMC: WFMC, KNOWN_VERBS: KNOWN_VERBS, buildEvents: buildEvents, buildBuyEvents: buildBuyEvents, buildPayPartEvents: buildPayPartEvents, resolveAccounts: resolveAccounts, buildDerivedPost: buildDerivedPost };
