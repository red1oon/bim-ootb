// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * post_resolver.js — the §3.5.1 account resolver (HOST GLUE for the POST verb).
 *   Implements PLUGIN_ARCHITECTURE.md §13.5: a manifest charge token `{Master.Role}` resolves to a
 *   REAL account, keyed by (master id, c_acctschema_id), reading ONLY real columns from ad_seed.db.
 *
 * NON-INVENT: every account is READ from a master column; the resolver never picks an account. An
 *   absent (master, acctschema) pair falls back to c_acctschema_default; a still-absent value is
 *   reported `absent` (caller decides), NEVER synthesized.
 *
 * The resolved value IS the master column's verbatim contents (a C_ValidCombination id, e.g. 234 —
 *   mirroring gl_journalline). For traceability we ALSO resolve the underlying C_ElementValue
 *   (natural account) via c_validcombination.account_id, so the witness can cite the real account.
 */

// token → {table, col, keyCol, [via]} — the ONLY place a token maps to a real column (§3.5.1 grammar).
var TOKENS = {
  '{BPartner.Receivable}': { table: 'c_bp_customer_acct',      col: 'c_receivable_acct', keyCol: 'c_bpartner_id' },
  '{Product.Revenue}':     { table: 'm_product_category_acct', col: 'p_revenue_acct',    keyCol: 'm_product_category_id', via: 'product->category' },
  '{Product.Cogs}':        { table: 'm_product_category_acct', col: 'p_cogs_acct',       keyCol: 'm_product_category_id', via: 'product->category' },
  '{Product.Asset}':       { table: 'm_product_category_acct', col: 'p_asset_acct',      keyCol: 'm_product_category_id', via: 'product->category' },
  '{Tax.Due}':             { table: 'c_tax_acct',               col: 't_due_acct',        keyCol: 'c_tax_id' },
  // AP-invoice (purchase) manifest: vendor payable (per-vendor, mirrors customer receivable) + matched-receipt
  // inventory-clearing DR (via product->category, mirrors {Product.Revenue}) + input-VAT credit.
  '{Vendor.V_Liability}':  { table: 'c_bp_vendor_acct',         col: 'v_liability_acct',  keyCol: 'c_bpartner_id' },
  '{Product.InventoryClearing}': { table: 'm_product_category_acct', col: 'p_inventoryclearing_acct', keyCol: 'm_product_category_id', via: 'product->category' },
  '{Product.AverageCostVariance}': { table: 'm_product_category_acct', col: 'p_averagecostvariance_acct', keyCol: 'm_product_category_id', via: 'product->category' },
  '{Tax.Credit}':          { table: 'c_tax_acct',               col: 't_credit_acct',     keyCol: 'c_tax_id' },
  '{Bank.InTransit}':      { table: 'c_bankaccount_acct',       col: 'b_intransit_acct',  keyCol: 'c_bankaccount_id' },
  '{Bank.UnallocatedCash}':{ table: 'c_bankaccount_acct',       col: 'b_unallocatedcash_acct', keyCol: 'c_bankaccount_id' },
  // Doc_AllocationHdr deps: discount/write-off are keyed by the BPartner's GROUP; cash-transfer by the cash book.
  '{BPGroup.PayDiscount}': { table: 'c_bp_group_acct',          col: 'paydiscount_exp_acct', keyCol: 'c_bp_group_id', via: 'bpartner->group' },
  '{BPGroup.WriteOff}':    { table: 'c_bp_group_acct',          col: 'writeoff_acct',        keyCol: 'c_bp_group_id', via: 'bpartner->group' },
  // M_MatchInv posting: Not-Invoiced-Receipts is the vendor BP-group clearing account (matches receipt NIR booking).
  '{BPGroup.NotInvoicedReceipts}': { table: 'c_bp_group_acct',   col: 'notinvoicedreceipts_acct', keyCol: 'c_bp_group_id', via: 'bpartner->group' },
  '{CashBook.CashTransfer}':{ table: 'c_cashbook_acct',         col: 'cb_cashtransfer_acct', keyCol: 'c_cashbook_id' }
};

function one(db, sql, params) { var r = db.prepare(sql).get(params || {}); return r || null; }

// map a master row's resolved value (a C_ValidCombination id) to its natural C_ElementValue, for the log.
function elementOf(db, validCombinationId) {
  if (validCombinationId == null) return null;
  var r = one(db,
    'SELECT ev.c_elementvalue_id AS id, ev.value AS value, ev.name AS name, ev.accounttype AS accounttype ' +
    'FROM c_validcombination vc JOIN c_elementvalue ev ON ev.c_elementvalue_id=vc.account_id ' +
    'WHERE vc.c_validcombination_id=@id', { id: validCombinationId });
  return r; // null if the value is not a validcombination (caller logs as-is)
}

/**
 * resolve(db, token, masterId, acctschema) -> {token, master_id, acct, source_col, element, fallback}
 *   acct      — the real column value (the account to post to), or null if absent.
 *   source_col— "table.col" the value came from (provenance).
 *   element   — the underlying C_ElementValue row {id,value,name,accounttype} (traceability), or null.
 *   fallback  — true if the exact (master,acctschema) pair was absent and c_acctschema_default was used.
 */
function resolve(db, token, masterId, acctschema) {
  var spec = TOKENS[token];
  if (!spec) throw new Error('post_resolver: unknown token ' + token);

  // {Product.Revenue}: the manifest binds a PRODUCT; hop product -> category before the acct lookup.
  var lookupId = masterId, keyCol = spec.keyCol;
  if (spec.via === 'product->category') {
    var p = one(db, 'SELECT m_product_category_id AS cat FROM m_product WHERE m_product_id=@id', { id: masterId });
    if (!p) return { token: token, master_id: masterId, acct: null, source_col: spec.table + '.' + spec.col, element: null, fallback: false, absent: 'product ' + masterId };
    lookupId = p.cat;
  } else if (spec.via === 'bpartner->group') {
    var bp = one(db, 'SELECT c_bp_group_id AS grp FROM c_bpartner WHERE c_bpartner_id=@id', { id: masterId });
    if (!bp) return { token: token, master_id: masterId, acct: null, source_col: spec.table + '.' + spec.col, element: null, fallback: false, absent: 'bpartner ' + masterId };
    lookupId = bp.grp;
  }

  var sql = 'SELECT ' + spec.col + ' AS acct FROM ' + spec.table + ' WHERE ' + keyCol + '=@k AND c_acctschema_id=@s';
  var row = one(db, sql, { k: lookupId, s: acctschema });
  var fallback = false;

  // §13.5 fallback: exact (master, acctschema) pair absent -> the schema's default acctschema row.
  if (!row) {
    var def = one(db, 'SELECT c_acctschema_id AS s FROM c_acctschema_default LIMIT 1');
    if (def && def.s !== acctschema) {
      row = one(db, sql, { k: lookupId, s: def.s });
      fallback = !!row;
    }
  }

  var acct = row ? row.acct : null;
  return {
    token: token, master_id: masterId, lookup_id: lookupId,
    acct: acct, source_col: spec.table + '.' + spec.col,
    element: elementOf(db, acct), fallback: fallback,
    absent: acct == null ? (spec.table + '.' + spec.col + ' [' + keyCol + '=' + lookupId + ', schema=' + acctschema + ']') : null
  };
}

var _api = { resolve: resolve, elementOf: elementOf, TOKENS: TOKENS };
// UMD tail — node (require) + browser live host (window.PostResolver). Additive: same exports, used by
// doc_poster / erp_preview in the browser. Logic UNCHANGED (FOLD witnesses re-run green).
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.PostResolver = _api; }
