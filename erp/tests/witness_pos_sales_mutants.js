// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the mutant table of W-POS-SALES (witness_pos_sales.js, POSS_MUTANTS=1). Each entry rewrites the SHIPPED source in a mirror dir of COPIES (the text must be found exactly `count` times, default 1,
//   else NOT-APPLIED = proves nothing; ALL edits of one file are applied to ONE read of it - agent B's harness bug), then the witness re-runs in a child; one of the named checks ("case.key") must print FAIL.
//   A child that crashes without its § verdict line is NOT a kill. READ THE LOG: §POSS-MUTANT lines.
'use strict';
var CH = 'plugins/pos_import_sales.mjs', BU = 'plugins/pos_integration.mjs';
var LINK = "r.c_bpartner_id == null ? { c_invoice_id: inv.c_invoice_id, c_bpartner_id: inv.c_bpartner_id } : { c_invoice_id: inv.c_invoice_id }";
module.exports = [
 { name: 'M01-invoice-link-off', kills: ['SALE.ran', 'SALE.one-order'], what: 'the glue stamps the BPartner but not C_Invoice_ID: Import Payment makes receipts WITHOUT the invoice, the verification refuses the ticket',
   edits: [{ file: CH, from: LINK, to: "r.c_bpartner_id == null ? { c_bpartner_id: inv.c_bpartner_id } : {}" }] },
 { name: 'M02-invoice-link-and-verification-off', kills: ['SALE.allocated', 'SALE.invoice-link'], what: 'link off AND the receipt/paid verification off (3 edits on ONE file): the ticket "imports" with receipts that settle nothing',
   edits: [{ file: CH, from: LINK, to: "r.c_bpartner_id == null ? { c_bpartner_id: inv.c_bpartner_id } : {}" },
           { file: CH, from: "if (bad.length || new Set(payIds.map(String)).size !== trows.length) throw", to: "if (false) throw" },
           { file: CH, from: "if (!invNow || invNow.ispaid !== 'Y') throw", to: "if (false) throw" }] },
 { name: 'M03-all-or-none-off', kills: ['BATCH.all-or-none', 'BATCH.counts'], what: 'a refused ticket is not rolled back: the order Import Orders made stays without its payments',
   edits: [{ file: CH, from: "trx.rollbackTo(sp);", to: "void sp;" }] },
 { name: 'M04-total-check-off', kills: ['BATCH.overpay', 'BATCH.total-mismatch'], what: 'the tenders-vs-invoice total check is dropped: an overpaid ticket imports (Import Payment alone would settle the invoice and leave 10 unallocated)',
   edits: [{ file: CH, from: "if (tcents !== cents(inv.grandtotal)) throw refuse(", to: "if (false) throw refuse(" }] },
 { name: 'M05-no-ticket-scope', kills: ['ISO.untouched'], what: 'the per-ticket scope returns every pending row: the unmodified legacy processes import the other tickets too',
   edits: [{ file: CH, from: "if (ids[t] && (!where || !Object.keys(where).length)) {", to: "if (false) {" }] },
 { name: 'M06-orders-default-docaction', kills: ['SALE.ran', 'SALE.one-order'], what: 'Import Orders is run with its Prepare default (PR): no shipment, no invoice, nothing to link',
   edits: [{ file: CH, from: "const po = { AD_Client_ID: C, DocAction: 'CO', DeleteOldImported: 'N' };", to: "const po = { AD_Client_ID: C, DocAction: 'PR', DeleteOldImported: 'N' };" }] },
 { name: 'M07-payment-docaction-not-sent', kills: ['SALE.ran', 'SALE.two-receipts'], what: 'Import Payment is run without DocAction (legacy default null): the receipts are saved, never completed',
   edits: [{ file: CH, from: "C_BankAccount_ID: self.p_bank, DocAction: 'CO', DeleteOldImported: 'N' };", to: "C_BankAccount_ID: self.p_bank, DeleteOldImported: 'N' };" }] },
 { name: 'M08-view-counts-lines-as-tenders', kills: ['VIEW.one-sale'], what: 'the view\'s Tenders column counts the sale\'s lines',
   edits: [{ file: BU, from: "\"(SELECT COUNT(*) FROM i_payment p WHERE \" + SAME_SALE('p', 'g') + \") AS tenders, g.linestotal AS linestotal, \"", to: "\"g.lines AS tenders, g.linestotal AS linestotal, \"" }] },
 { name: 'M09-view-total-ignores-price', kills: ['VIEW.totals', 'VIEW.mismatch'], what: 'the view\'s lines total sums quantities only',
   edits: [{ file: BU, from: "SUM(COALESCE(o.qtyordered,0) * COALESCE(o.priceactual,0))", to: "SUM(COALESCE(o.qtyordered,0))" }] },
 { name: 'M10-stop-keeps-the-view', kills: ['STOP.removes-all'], what: 'deactivate() does not drop the view: Stop leaves i_possales behind',
   edits: [{ file: BU, from: "try { ctx.db.run('DROP VIEW IF EXISTS i_possales'); } catch (e) { /* the view may already be gone */ }", to: "" }] },
 { name: 'M11-access-widened-to-the-till-role', kills: ['PLUG.access'], what: 'role 103 (GardenWorld User) is granted the process and the window as well',
   edits: [{ file: BU, from: "ROLES = [[0, 0], [102, 11]];", to: "ROLES = [[0, 0], [102, 11], [103, 11]];" }] },
 { name: 'M12-error-text-not-written', kills: ['BATCH.total-mismatch', 'BATCH.overpay'], what: 'a refused ticket\'s rows are marked E but I_ErrorMsg is never written',
   edits: [{ file: CH, from: "const stamp = { i_isimported: 'E', i_errormsg: reason };", to: "const stamp = { i_isimported: 'E' };" }] },
 { name: 'M13-imported-rows-read-again', kills: ['RERUN.nothing-new'], what: 'the pending test no longer excludes I_IsImported=Y: a re-run re-"imports" K1 and K4',
   edits: [{ file: CH, from: "const pending = (r) => String(r.i_isimported) !== 'Y' && inClient(r);", to: "const pending = (r) => inClient(r);" }] },
 { name: 'M14-orphan-tenders-not-refused', kills: ['BATCH.orphan'], what: 'tenders without lines are no longer refused by name',
   edits: [{ file: CH, from: "if (!t.lines.length) throw refuse(", to: "if (false) throw refuse(" }] },
 { name: 'M15-dictionary-not-staged', kills: ['PLUG.process-row', 'PLUG.access', 'PLUG.menu'], what: 'the bundle ships no manifest.dictionary: no AD_Process / access / menu rows',
   edits: [{ file: BU, from: "  dictionary: [", to: "  dictionaryOff: [" }] },
 { name: 'M16-card-number-stamped', kills: ['SALE.card'], what: 'the glue writes a card number into the tender rows (PCI): it reaches the C_Payment',
   edits: [{ file: CH, from: LINK, to: "r.c_bpartner_id == null ? { c_invoice_id: inv.c_invoice_id, c_bpartner_id: inv.c_bpartner_id, creditcardnumber: '4111111111111111' } : { c_invoice_id: inv.c_invoice_id, creditcardnumber: '4111111111111111' }" }] },
 { name: 'M17-scope-never-lifted', kills: ['BATCH.ran'], what: 'the ticket scope is not lifted after the ticket: the next ticket reads the previous ticket\'s rows (none of its own)',
   edits: [{ file: CH, from: "return () => { if (own) trx.find = orig; else delete trx.find; };", to: "return () => {};" }] },
 { name: 'M18-parameter-not-read', kills: ['PLUG.process-row', 'ISO.untouched'], what: 'the DocumentNo parameter is renamed in prepare(): it is no longer read (dictionary X of N falls short, the run is not scoped to one ticket)',
   edits: [{ file: CH, from: "else if (name === 'DocumentNo') this.p_key", to: "else if (name === 'DocNo') this.p_key" }] },
 { name: 'M19-sw-precache-missing', kills: ['PLUG.wiring'], what: 'sw.js does not precache the bundle',
   edits: [{ file: 'sw.js', from: "  'plugins/pos_integration.mjs',    // ERP-side POS integration bundle, head office (POS_PLUGIN_LOCAL_FIRST.md §9/§11, W-POS-SALES)\n", to: "" }] },
 { name: 'M20-bp-not-taken-from-invoice', kills: ['SALE.ran', 'SALE.one-order'], what: 'deviation (e) removed: the tender keeps no BPartner, Import Payment\'s SQL cannot see the new invoice and refuses "No BPartner" (proves the stamp is needed)',
   edits: [{ file: CH, from: LINK, to: "{ c_invoice_id: inv.c_invoice_id }" }] }
];
