// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * doc_poster.js — reusable per-document GL derivation (W-DOC-POSTER).
 *
 * GAP-A FIX (POSTING_PREVIEW_PANEL.md): the per-document posting manifest that turns a completed
 * document into journal lines lived ONLY inside the FOLD witnesses (poc_fold_complete.deriveInvoice,
 * duplicated in poc_post_harden.derive) — never a shipped verb. This module EXTRACTS that derivation
 * VERBATIM so the live Posting-Preview seam consumes the SAME logic the FOLD oracle proved — no fork,
 * no re-derive. Faithfulness is proven by scripts/poc_doc_poster.js (== real fact_acct(318), and ==
 * poc_fold_complete's own agg).
 *
 * PURE + db-agnostic: `db` is ANY handle exposing `.prepare(sql).get(params)` / `.all(params)`
 *   (better-sqlite3 native in node; the sql.js facade in erp_preview.js in the browser). `R` is the
 *   post_resolver seam (node require, or injected window.PostResolver). NEVER invents an account or an
 *   amount — accounts come from R.resolve (master columns), amounts from real document rows, integer
 *   cents, no Date.now/Math.random.
 *
 * Returns the per-account fold the readPostings VM shape expects:
 *   { lines:[{account_id,value,name,amtacctdr,amtacctcr}], balanced, sumDr, sumCr, absent:[token], basis }
 *   account_id = the natural C_ElementValue id (== fact_acct.account_id); amtacctdr/cr in DOLLARS (the VM
 *   formats to 2dp). basis ∈ {invoice, order, none} — which source rows the manifest was derived from.
 */

function cents(n) { return Math.round(Number(n || 0) * 100); }
function num(x) { return Number(x); }

// ── Case-insensitive row reads (NEW_CLIENT_MGMT.md BLOCKER fix, 2026-06-11) ──
// The deployed ad_seed.db stores DOCUMENT tables in canonical CamelCase (C_BPartner_ID, M_Product_ID); SQLite
// returns unaliased result keys in the DECLARED case, so the lowercase reads below (hdr.c_bpartner_id, l.m_product_id)
// come back `undefined` → receivable+revenue go absent → blank/coverage:partial preview. Expose lowercase key
// ALIASES on every row so reads resolve regardless of stored case. ADDITIVE + NON-INVENT: all-lowercase rows
// (ad_full/glassbowl/migrated shards) lowercase to themselves → no-op → every FOLD witness stays byte-green. One
// place covers node better-sqlite3 AND the browser sql.js facade (erp_preview.js), both flowing through this consumer.
function lc(row) {
  if (!row || typeof row !== 'object') return row;
  Object.keys(row).forEach(function (k) { var lk = k.toLowerCase(); if (lk !== k && !(lk in row)) row[lk] = row[k]; });
  return row;
}
function getRow(db, sql, params) { return lc(db.prepare(sql).get(params)); }
function allRows(db, sql, params) { return (db.prepare(sql).all(params) || []).map(lc); }

// ── INVOICE sales manifest — EXTRACTED VERBATIM from poc_fold_complete.deriveInvoice (W-FOLD-COMPLETE) ──
// DR {BPartner.Receivable}=grandtotal / CR {Product.Revenue}=linenetamt per line / CR {Tax.Due}=taxamt.
function deriveInvoice(db, R, invId, schema) {
  var hdr = getRow(db, 'SELECT c_invoice_id,c_bpartner_id,grandtotal,issotrx FROM c_invoice WHERE c_invoice_id=?', num(invId));
  if (!hdr) return null;
  var lines = allRows(db, 'SELECT m_product_id,linenetamt FROM c_invoiceline WHERE c_invoice_id=?', num(invId));
  var taxes = allRows(db, 'SELECT c_tax_id,taxamt FROM c_invoicetax WHERE c_invoice_id=?', num(invId));
  var by = {}, absent = [];
  function add(side, el, amt) {
    var k = el.id;
    if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 };
    if (side === 'DR') by[k].dr += cents(amt); else by[k].cr += cents(amt);
  }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  var rcv = el(R.resolve(db, '{BPartner.Receivable}', num(hdr.c_bpartner_id), schema));
  if (rcv) add('DR', rcv, hdr.grandtotal);
  lines.forEach(function (l) { var e = el(R.resolve(db, '{Product.Revenue}', num(l.m_product_id), schema)); if (e) add('CR', e, l.linenetamt); });
  taxes.forEach(function (t) { var e = el(R.resolve(db, '{Tax.Due}', num(t.c_tax_id), schema)); if (e) add('CR', e, t.taxamt); });
  return { by: by, absent: absent };
}

// the invoice an order generated — linked via the order line (NON-INVENT lineage; poc_fold_complete:75).
function invoiceForOrder(db, oid) {
  var r = getRow(db, 'SELECT DISTINCT il.c_invoice_id AS id FROM c_invoiceline il JOIN c_orderline ol ON ol.c_orderline_id=il.c_orderline_id WHERE ol.c_order_id=?', num(oid));
  return r ? r.id : null;
}

// projected manifest for a DRAFT order (no invoice yet) — SAME tokens, off the ORDER rows. Equals the
// invoice manifest when qtyinvoiced==qtyordered; for a true draft it is a PROJECTION (no fact_acct oracle).
function deriveOrder(db, R, oid, schema) {
  var hdr = getRow(db, 'SELECT c_order_id,c_bpartner_id,grandtotal FROM c_order WHERE c_order_id=?', num(oid));
  if (!hdr) return null;
  var lines = allRows(db, 'SELECT m_product_id,linenetamt FROM c_orderline WHERE c_order_id=?', num(oid));
  var taxes = [];
  try { taxes = allRows(db, 'SELECT c_tax_id,taxamt FROM c_ordertax WHERE c_order_id=?', num(oid)); } catch (e) { taxes = []; }
  var by = {}, absent = [];
  function add(side, el, amt) { var k = el.id; if (!by[k]) by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 }; if (side === 'DR') by[k].dr += cents(amt); else by[k].cr += cents(amt); }
  function el(res) { if (res.acct == null || !res.element) { absent.push(res.token); return null; } return res.element; }
  var rcv = el(R.resolve(db, '{BPartner.Receivable}', num(hdr.c_bpartner_id), schema));
  if (rcv) add('DR', rcv, hdr.grandtotal);
  lines.forEach(function (l) { var e = el(R.resolve(db, '{Product.Revenue}', num(l.m_product_id), schema)); if (e) add('CR', e, l.linenetamt); });
  taxes.forEach(function (t) { var e = el(R.resolve(db, '{Tax.Due}', num(t.c_tax_id), schema)); if (e) add('CR', e, t.taxamt); });
  return { by: by, absent: absent };
}

// ── B-3 0-seed manifests (W-POST-B3 §W-3, prompts/FABLE5_B3_POSTING_ORACLE.md) ──────────────────────
// EXTRACTED from the org.compiere.acct posters (per-line citations below); oracle = the REAL compiled
// posters driven on a scratch clone by scripts/generate_post_oracle.sh → build/erp/oracle/
// post_b3_fixture.json. Accounts here are C_ValidCombination ids from per-asset/project acct config
// rows (not {Master.Role} tokens), resolved to the natural element via c_validcombination — the same
// hop the posters make (MAccount.get). NEVER invents: every id/amount is a captured row.

// combination -> element account id (c_validcombination.account_id)
function vcAcct(db, combo) {
  if (combo == null || num(combo) === 0) return null;
  var r = getRow(db, 'SELECT account_id FROM c_validcombination WHERE c_validcombination_id=?', num(combo));
  return r ? num(r.account_id) : null;
}
// element shape for the fold; c_elementvalue (value/name) is optional in the handle (fixture DBs)
function elOf(db, accountId, absent, token) {
  if (accountId == null) { absent.push(token); return null; }
  var e = null;
  try { e = getRow(db, 'SELECT c_elementvalue_id AS id, value, name FROM c_elementvalue WHERE c_elementvalue_id=?', accountId); } catch (err) { e = null; }
  return e || { id: accountId, value: '', name: '' };
}
// MAssetAcct.forA_Asset_ID:161-186 — acct row valid at dateAcct (ValidFrom<=date, ORDER BY ValidFrom
// DESC NULLS LAST). The transfer's completeIt creates a NEW row with ValidFrom=its DateAcct — this
// time-slice is what keeps pre-transfer documents derivable (order-dependence solved by data).
function assetAcctFor(db, assetId, schema, dateAcct) {
  return getRow(db,
    "SELECT * FROM a_asset_acct WHERE a_asset_id=? AND c_acctschema_id=? AND postingtype='A'" +
    " AND (validfrom IS NULL OR validfrom='' OR validfrom<=?)" +
    " ORDER BY (validfrom IS NULL OR validfrom='') ASC, validfrom DESC LIMIT 1",
    [num(assetId), num(schema), String(dateAcct || '9999-12-31')]);
}
// MConversionRate.getRate:243-252 VERBATIM shape (default Spot type): date BETWEEN ValidFrom AND
// ValidTo, IsActive='Y' (:251 — THE discriminator in this seed: the 0.8006 row is the SAME client 11
// but INACTIVE; the B-3 run-8 "tenant-vs-system" reading was wrong, corrected 2026-07-18),
// client/org-scoped, ORDER BY AD_Client_ID DESC, AD_Org_ID DESC, ValidFrom DESC.
function fxRate(db, curFrom, curTo, dateAcct, clientId, orgId) {
  if (num(curFrom) === num(curTo)) return 1;
  var r = getRow(db,
    "SELECT cr.multiplyrate AS rate FROM c_conversion_rate cr JOIN c_conversiontype ct" +
    " ON ct.c_conversiontype_id=cr.c_conversiontype_id AND ct.isdefault='Y'" +
    " WHERE cr.c_currency_id=? AND cr.c_currency_id_to=? AND ? BETWEEN cr.validfrom AND cr.validto" +
    " AND cr.isactive='Y' AND cr.ad_client_id IN (0,?) AND cr.ad_org_id IN (0,?)" +
    " ORDER BY cr.ad_client_id DESC, cr.ad_org_id DESC, cr.validfrom DESC LIMIT 1",
    [num(curFrom), num(curTo), String(dateAcct || '9999-12-31'), num(clientId || 0), num(orgId || 0)]);
  return r ? Number(r.rate) : null;
}
function schemaRow(db, schema) { return getRow(db, 'SELECT * FROM c_acctschema WHERE c_acctschema_id=?', num(schema)); }

function b3New() {
  var d = { by: {}, absent: [] };
  d.add = function (side, el, amtCents) {
    var k = el.id;
    if (!d.by[k]) d.by[k] = { account_id: el.id, value: el.value, name: el.name, dr: 0, cr: 0 };
    if (side === 'DR') d.by[k].dr += amtCents; else d.by[k].cr += amtCents;
  };
  return d;
}

// Doc_AssetAddition.createFacts:60-93 — gate A_SourceType=IMP | A_CapvsExp=Exp → EMPTY facts (the
// config-gated zero); else DR a_asset_acct.A_Asset_Acct / CR getP_Asset_Acct, amt=AssetSourceAmt in
// DOC currency (getC_Currency_ID) → converted per schema (the ONLY B-3 poster that posts doc-currency).
function deriveAssetAddition(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_addition WHERE a_asset_addition_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (hdr.a_sourcetype === 'IMP' || hdr.a_capvsexp === 'Exp') return d;   // zero-by-config, Doc_AssetAddition:67-72
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  var as = schemaRow(db, schema);
  var rate = fxRate(db, hdr.c_currency_id, as ? as.c_currency_id : hdr.c_currency_id, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id);
  if (rate == null) { d.absent.push('fxrate#' + hdr.c_currency_id + '->' + (as && as.c_currency_id)); return d; }
  var amt = Math.round(cents(hdr.assetsourceamt) * rate);
  var drEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  if (drEl) d.add('DR', drEl, amt);
  // getP_Asset_Acct:107-136 — PRJ → project acct; MAN+charge → charge; INV+line-project → project;
  // else product expense (product 0 → DEFAULT category, ProductCost.getAccountDefault:250-298
  // ORDER BY IsDefault DESC, Created)
  var crComboRow = null;
  if (hdr.a_sourcetype === 'PRJ' && num(hdr.c_project_id) > 0) {
    var prj = getRow(db, 'SELECT projectcategory FROM c_project WHERE c_project_id=?', num(hdr.c_project_id));
    var col = (prj && prj.projectcategory === 'A') ? 'pj_asset_acct' : 'pj_wip_acct';
    var pa = getRow(db, 'SELECT ' + col + ' AS acct FROM c_project_acct WHERE c_project_id=? AND c_acctschema_id=?', [num(hdr.c_project_id), num(schema)]);
    crComboRow = pa && pa.acct;
  } else if (hdr.a_sourcetype === 'MAN' && num(hdr.c_charge_id) > 0) {
    var ch = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(hdr.c_charge_id), num(schema)]);
    crComboRow = ch && ch.acct;
  } else if (num(hdr.m_product_id) > 0) {
    var pc = getRow(db, 'SELECT a.p_expense_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(hdr.m_product_id)]);
    crComboRow = pc && pc.acct;
  } else {
    var dft = getRow(db, "SELECT a.p_expense_acct AS acct FROM m_product_category c JOIN m_product_category_acct a ON a.m_product_category_id=c.m_product_category_id AND a.c_acctschema_id=? ORDER BY c.isdefault DESC, c.created LIMIT 1", num(schema));
    crComboRow = dft && dft.acct;
  }
  var crEl = elOf(db, vcAcct(db, crComboRow), d.absent, '{Addition.SourceAcct}');
  if (crEl) d.add('CR', crEl, amt);
  return d;
}

// Doc_DepreciationEntry.createFacts:66-91 — other-acctschema → EMPTY; per depexp line of the entry
// (entry_id + the entry's schema) DR depexp.DR_Account_ID / CR CR_Account_ID at Expense (schema currency).
function deriveDepreciationEntry(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_depreciation_entry WHERE a_depreciation_entry_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.c_acctschema_id) !== num(schema)) return d;                 // other-schema ∅, Doc_DepreciationEntry:70-71
  var lines = allRows(db, 'SELECT * FROM a_depreciation_exp WHERE a_depreciation_entry_id=? AND c_acctschema_id=? ORDER BY a_depreciation_exp_id', [num(id), num(hdr.c_acctschema_id)]);
  lines.forEach(function (l) {
    var amt = cents(l.expense);
    var drEl = elOf(db, vcAcct(db, l.dr_account_id), d.absent, '{DepExp.DR}');
    var crEl = elOf(db, vcAcct(db, l.cr_account_id), d.absent, '{DepExp.CR}');
    if (drEl) d.add('DR', drEl, amt);
    if (crEl) d.add('CR', crEl, amt);
  });
  return d;
}

// Doc_AssetReval.createFacts:55-77 — pair1 DR AssetAcct / CR RevalCostOffset = (Cost_Change − A_Asset_Cost);
// pair2 DR RevalCostOffset / CR AccumDep = (Change_Acum_Depr − A_Accumulated_Depr). Doc columns, schema currency.
function deriveAssetReval(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_reval WHERE a_asset_reval_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  var costDelta = cents(hdr.a_asset_cost_change) - cents(hdr.a_asset_cost);
  var acumDelta = cents(hdr.a_change_acumulated_depr) - cents(hdr.a_accumulated_depr);
  var assetEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  var offEl = elOf(db, vcAcct(db, acct.a_reval_cost_offset_acct), d.absent, '{AssetAcct.RevalCostOffset}');
  var accumEl = elOf(db, vcAcct(db, acct.a_accumdepreciation_acct), d.absent, '{AssetAcct.AccumDep}');
  if (assetEl && offEl) { d.add('DR', assetEl, costDelta); d.add('CR', offEl, costDelta); }
  if (offEl && accumEl) { d.add('DR', offEl, acumDelta); d.add('CR', accumEl, acumDelta); }
  return d;
}

// Doc_AssetTransfer.createFacts:44-72 — DR new/CR old AssetAcct at workfile A_Asset_Cost (only if they
// differ); DR old/CR new AccumDep at workfile A_Accumulated_Depr (only if they differ). The doc's OWN
// combo columns, workfile per (asset, postingtype, PRIMARY schema — MDepreciationWorkfile.get:351-364
// defaults C_AcctSchema_ID to the client's primary). Same lines for EVERY schema (the poster does not
// re-map combos per schema — replicated bug-compat).
function deriveAssetTransfer(db, id, schema, primarySchema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_transfer WHERE a_asset_transfer_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var wk = getRow(db, "SELECT * FROM a_depreciation_workfile WHERE a_asset_id=? AND postingtype='A' AND c_acctschema_id=?",
    [num(hdr.a_asset_id), num(primarySchema || 101)]);
  if (!wk) { d.absent.push('a_depreciation_workfile#' + hdr.a_asset_id); return d; }
  if (num(hdr.a_asset_new_acct) !== num(hdr.a_asset_acct)) {
    var drEl = elOf(db, vcAcct(db, hdr.a_asset_new_acct), d.absent, '{Transfer.AssetNew}');
    var crEl = elOf(db, vcAcct(db, hdr.a_asset_acct), d.absent, '{Transfer.AssetOld}');
    var amt = cents(wk.a_asset_cost);
    if (drEl) d.add('DR', drEl, amt);
    if (crEl) d.add('CR', crEl, amt);
  }
  if (num(hdr.a_accumdepreciation_new_acct) !== num(hdr.a_accumdepreciation_acct)) {
    var drEl2 = elOf(db, vcAcct(db, hdr.a_accumdepreciation_acct), d.absent, '{Transfer.AccumOld}');
    var crEl2 = elOf(db, vcAcct(db, hdr.a_accumdepreciation_new_acct), d.absent, '{Transfer.AccumNew}');
    var amt2 = cents(wk.a_accumulated_depr);
    if (drEl2) d.add('DR', drEl2, amt2);
    if (crEl2) d.add('CR', crEl2, amt2);
  }
  return d;
}

// Doc_AssetDisposed.createFacts:65-86 — from the A_Asset_Change 'DIS' row OF THIS SCHEMA (per-schema
// amounts, MAssetChange.get with C_AcctSchema_ID): CR AssetAcct=AssetValueAmt / DR AccumDep=
// AssetAccumDepreciationAmt / DR DisposalLoss=AssetBookValueAmt. Schema currency, no conversion.
function deriveAssetDisposed(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM a_asset_disposed WHERE a_asset_disposed_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var ch = getRow(db, "SELECT * FROM a_asset_change WHERE a_asset_id=? AND changetype='DIS' AND c_acctschema_id=? ORDER BY a_asset_change_id LIMIT 1",
    [num(hdr.a_asset_id), num(schema)]);
  if (!ch) { d.absent.push('a_asset_change#DIS/' + hdr.a_asset_id + '/' + schema); return d; }
  var acct = assetAcctFor(db, hdr.a_asset_id, schema, hdr.dateacct);
  if (!acct) { d.absent.push('a_asset_acct#' + hdr.a_asset_id + '/' + schema); return d; }
  var assetEl = elOf(db, vcAcct(db, acct.a_asset_acct), d.absent, '{AssetAcct.Asset}');
  var accumEl = elOf(db, vcAcct(db, acct.a_accumdepreciation_acct), d.absent, '{AssetAcct.AccumDep}');
  var lossEl = elOf(db, vcAcct(db, acct.a_disposal_loss_acct), d.absent, '{AssetAcct.DisposalLoss}');
  if (assetEl) d.add('CR', assetEl, cents(ch.assetvalueamt));
  if (accumEl) d.add('DR', accumEl, cents(ch.assetaccumdepreciationamt));
  if (lossEl) d.add('DR', lossEl, cents(ch.assetbookvalueamt));
  return d;
}

// Doc_ProjectIssue.createFacts:125-199 — DR project WIP acct (Asset acct if ProjectCategory='A') /
// CR product Asset acct (Expense if service) at COST: m_inoutline POCost | timeexpense laborCost |
// else the product's current cost × qty (schema costingmethod → cost element → m_cost.currentcostprice,
// the W-FOLD-MOVEMENT hop). Per-schema cost, schema currency.
function deriveProjectIssue(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_projectissue WHERE c_projectissue_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.m_inoutline_id) > 0) { d.absent.push('POCost#m_inoutline=' + hdr.m_inoutline_id); return d; }
  if (num(hdr.s_timeexpenseline_id) > 0) { d.absent.push('LaborCost#tel=' + hdr.s_timeexpenseline_id); return d; }
  var as = schemaRow(db, schema);
  var cost = getRow(db,
    "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
    " AND e.costelementtype='M' AND e.costingmethod=? WHERE c.m_product_id=? AND c.c_acctschema_id=? AND c.m_costtype_id=?",
    [as ? String(as.costingmethod) : '', num(hdr.m_product_id), num(schema), as ? num(as.m_costtype_id) : 0]);
  var amt = Math.round(cents(cost ? cost.p : 0) * Number(hdr.movementqty));
  var prj = getRow(db, 'SELECT projectcategory FROM c_project WHERE c_project_id=?', num(hdr.c_project_id));
  var col = (prj && prj.projectcategory === 'A') ? 'pj_asset_acct' : 'pj_wip_acct';
  var pa = getRow(db, 'SELECT ' + col + ' AS acct FROM c_project_acct WHERE c_project_id=? AND c_acctschema_id=?', [num(hdr.c_project_id), num(schema)]);
  var prod = getRow(db, 'SELECT producttype, m_product_category_id FROM m_product WHERE m_product_id=?', num(hdr.m_product_id));
  var isService = prod && prod.producttype === 'S';
  var pcol = isService ? 'p_expense_acct' : 'p_asset_acct';
  var pacct = prod ? getRow(db, 'SELECT ' + pcol + ' AS acct FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=?', [num(prod.m_product_category_id), num(schema)]) : null;
  var drEl = elOf(db, vcAcct(db, pa && pa.acct), d.absent, '{Project.' + (col === 'pj_asset_acct' ? 'Asset' : 'WIP') + '}');
  var crEl = elOf(db, vcAcct(db, pacct && pacct.acct), d.absent, '{Product.' + (isService ? 'Expense' : 'Asset') + '}');
  if (drEl) d.add('DR', drEl, amt);
  if (crEl) d.add('CR', crEl, amt);
  return d;
}

// ── W-POST-TAIL manifests (HARDEN_MATRIX.md §W-POST-TAIL, 2026-07-18) ───────────────────────────────

// Doc_BankStatement.createFacts:200-280 — per line (clearing accounts differ + IsPostIfClearingEqual=Y
// in this seed → the NORMAL branch): {Bank.Asset}=+StmtAmt · {Bank.InTransit}=−TrxAmt · charge leg
// (>0→CR, else DR .negate(); only when a charge account resolves and the amount ≠ 0 — Fact.createLine
// drops null-account/zero lines) · interest leg (<0→InterestExp else InterestRev, −InterestAmt).
// Legs post in DOC currency → per-schema conversion (fxRate) + the Fact.balanceAccounting
// CurrencyBalancing residual (c_acctschema_gl, the W-FOLD-ALLOC-FX rule).
function deriveBankStatement(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_bankstatement WHERE c_bankstatement_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var lines = allRows(db, 'SELECT * FROM c_bankstatementline WHERE c_bankstatement_id=? ORDER BY c_bankstatementline_id', num(id));
  var ba = getRow(db, 'SELECT * FROM c_bankaccount_acct WHERE c_bankaccount_id=? AND c_acctschema_id=?', [num(hdr.c_bankaccount_id), num(schema)]);
  if (!ba) { d.absent.push('c_bankaccount_acct#' + hdr.c_bankaccount_id + '/' + schema); return d; }
  var as = schemaRow(db, schema);
  var docCur = lines.length ? num(lines[0].c_currency_id) : (as ? num(as.c_currency_id) : 0);
  var rate = fxRate(db, docCur, as ? as.c_currency_id : docCur, hdr.dateacct, hdr.ad_client_id, hdr.ad_org_id);
  if (rate == null) { d.absent.push('fxrate#' + docCur + '->' + (as && as.c_currency_id)); return d; }
  function conv(c) { return Math.round(c * rate); }
  function leg(el, srcCents) {           // signed source cents → DR (+) / CR (−) accounted cents
    if (!el || srcCents === 0) return;
    if (srcCents > 0) d.add('DR', el, conv(srcCents)); else d.add('CR', el, conv(-srcCents));
  }
  var assetEl = elOf(db, vcAcct(db, ba.b_asset_acct), d.absent, '{Bank.Asset}');
  var transitEl = elOf(db, vcAcct(db, ba.b_intransit_acct), d.absent, '{Bank.InTransit}');
  lines.forEach(function (l) {
    leg(assetEl, cents(l.stmtamt));
    leg(transitEl, -cents(l.trxamt));
    var chg = cents(l.chargeamt);
    if (chg !== 0 && num(l.c_charge_id) > 0) {
      var ch = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      leg(elOf(db, vcAcct(db, ch && ch.acct), d.absent, '{Charge.Expense}'), -chg);   // >0→CR / <0→DR
    }
    var intr = cents(l.interestamt);
    if (intr !== 0) {
      var col = intr < 0 ? 'b_interestexp_acct' : 'b_interestrev_acct';
      leg(elOf(db, vcAcct(db, ba[col]), d.absent, '{Bank.' + (intr < 0 ? 'InterestExp' : 'InterestRev') + '}'), -intr);
    }
  });
  // Fact.balanceAccounting — the per-doc accounted imbalance lands on the schema CurrencyBalancing acct
  if (num(docCur) !== (as ? num(as.c_currency_id) : num(docCur))) {
    var dr = 0, cr = 0;
    Object.keys(d.by).forEach(function (k) { dr += d.by[k].dr; cr += d.by[k].cr; });
    if (dr !== cr) {
      var gl = getRow(db, 'SELECT currencybalancing_acct AS acct FROM c_acctschema_gl WHERE c_acctschema_id=?', num(schema));
      var balEl = elOf(db, vcAcct(db, gl && gl.acct), d.absent, '{Schema.CurrencyBalancing}');
      if (balEl) d.add(dr < cr ? 'DR' : 'CR', balEl, Math.abs(dr - cr));
    }
  }
  return d;
}

// Doc_MatchPO.createFacts:244-470 — the PPV pair posts ONLY under COSTINGMETHOD_StandardCosting
// (Doc_MatchPO.java:429); this seed costs at 'A' Average → the REAL engine posted the EMPTY set for
// all 37 docs (posted='Y', 0 fact rows — verified live 2026-07-18). ∅ is CONFIG-derived, not skipped:
// under 'S' the manifest opens the PPV path (poCost vs standard cost via m_cost — absent-token when
// the seed carries no standard-cost rows, which is itself the honest state).
function deriveMatchPO(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_matchpo WHERE m_matchpo_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  if (num(hdr.m_product_id) === 0 || Number(hdr.qty) === 0) return d;      // :248-254
  if (num(hdr.m_inoutline_id) === 0) return d;                             // :275-282 no shipment match
  var as = schemaRow(db, schema);
  var method = as ? String(as.costingmethod) : '';
  // product-level override (m_product_category_acct costingmethod not captured — schema-level method,
  // the same resolution the W-FOLD-MOVEMENT cost hop proved for this seed)
  if (method !== 'S') return d;                                            // :429 gate → ∅ under Average
  var cost = getRow(db,
    "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
    " AND e.costelementtype='M' AND e.costingmethod='S' WHERE c.m_product_id=? AND c.c_acctschema_id=?",
    [num(hdr.m_product_id), num(schema)]);
  if (!cost || Number(cost.p) === 0) { d.absent.push('{Product.StandardCost}#' + hdr.m_product_id); return d; }
  var ol = getRow(db, 'SELECT priceactual FROM c_orderline WHERE c_orderline_id=?', num(hdr.c_orderline_id));
  if (!ol) { d.absent.push('c_orderline#' + hdr.c_orderline_id); return d; }
  var ppv = Math.round((cents(ol.priceactual) - cents(cost.p)) * Number(hdr.qty));
  if (ppv !== 0) {
    var pc = getRow(db, 'SELECT a.p_purchasepricevariance_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(hdr.m_product_id)]);
    var ppvEl = elOf(db, vcAcct(db, pc && pc.acct), d.absent, '{Product.PPV}');
    var offEl = elOf(db, vcAcct(db, null), d.absent, '{Schema.PPVOffset}');  // c_acctschema_gl ppvoffset not captured — named absent
    if (ppvEl && offEl) { d.add(ppv > 0 ? 'DR' : 'CR', ppvEl, Math.abs(ppv)); d.add(ppv > 0 ? 'CR' : 'DR', offEl, Math.abs(ppv)); }
  }
  return d;
}

// Doc_Requisition.createFacts:121-156 — posts ONLY under MAcctSchema.isCreateReservation
// (commitmenttype 'B'/'A', MAcctSchema.java:662-669); this seed = 'N' → the REAL engine posted ∅ for
// the 1 posted doc. Under the flip: per line DR {Product.Expense}=LineNetAmt + CR CommitmentOffset=Σ.
function deriveRequisition(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_requisition WHERE m_requisition_id=?', num(id));
  if (!hdr) return null;
  var d = b3New();
  var as = schemaRow(db, schema);
  var ct = as ? String(as.commitmenttype) : 'N';
  if (ct !== 'B' && ct !== 'A') return d;                                  // isCreateReservation gate → ∅
  var lines = allRows(db, 'SELECT * FROM m_requisitionline WHERE m_requisition_id=? ORDER BY m_requisitionline_id', num(id));
  var total = 0;
  lines.forEach(function (l) {
    var amt = cents(l.linenetamt);
    total += amt;
    var pc = num(l.m_product_id) > 0
      ? getRow(db, 'SELECT a.p_expense_acct AS acct FROM m_product p JOIN m_product_category_acct a ON a.m_product_category_id=p.m_product_category_id AND a.c_acctschema_id=? WHERE p.m_product_id=?', [num(schema), num(l.m_product_id)])
      : getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
    var el = elOf(db, vcAcct(db, pc && pc.acct), d.absent, '{Product.Expense}');
    if (el) d.add('DR', el, amt);
  });
  var offEl = elOf(db, vcAcct(db, null), d.absent, '{Schema.CommitmentOffset}');  // not captured — named absent under the flip
  if (offEl) d.add('CR', offEl, total);
  return d;
}

// Doc_Cash.createFacts:150-249 (HARDEN_MATRIX.md §W-POST-TAIL-2) — per c_cashline CashType leg + the
// header running assetAmt close. NOT oracle-diffable in THIS seed: both real c_cash docs (100/101) carry
// IsActive='N' — Doc.postIt's lock UPDATE (Doc.java:591-605) requires IsActive='Y' before createFacts
// ever runs, so the REAL engine posts ZERO rows for these two (verified live: DocManager.postDocument →
// "CannotPostInactiveDocument"). This manifest is a faithful, source-cited translation (reusable for any
// FUTURE active C_Cash doc) — its role HERE is only the falsifier: it computes REAL non-empty legs from
// the real line data, proving the ∅ is an IsActive-gate fact (Doc.postIt, outside createFacts), not a
// dead/no-op verb or a manifest bug. NEVER invents: IsActive is read, never flipped, on the real rows.
function deriveCash(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM c_cash WHERE c_cash_id=?', num(id));
  if (!hdr) return null;
  var cb = getRow(db, 'SELECT * FROM c_cashbook WHERE c_cashbook_id=?', num(hdr.c_cashbook_id));
  var cbAcct = getRow(db, 'SELECT * FROM c_cashbook_acct WHERE c_cashbook_id=? AND c_acctschema_id=?', [num(hdr.c_cashbook_id), num(schema)]);
  var docCur = cb ? num(cb.c_currency_id) : null;
  var d = b3New();
  if (!cbAcct) { d.absent.push('c_cashbook_acct#' + hdr.c_cashbook_id + '/' + schema); return d; }
  var lines = allRows(db, 'SELECT * FROM c_cashline WHERE c_cash_id=? ORDER BY c_cashline_id', num(id));
  var assetAmt = 0;
  function cbEl(col, token) { return elOf(db, vcAcct(db, cbAcct[col]), d.absent, token); }
  lines.forEach(function (l) {
    var amt = cents(l.amount);
    var lineCur = num(l.c_currency_id);
    if (l.cashtype === 'E') {                                              // Expense :174-181
      var expEl = cbEl('cb_expense_acct', '{CashBook.CashExpense}');
      if (expEl) d.add('DR', expEl, -amt);
      assetAmt -= -amt;
    } else if (l.cashtype === 'R') {                                       // Receipt :182-189
      assetAmt += amt;
      var rcvEl = cbEl('cb_receipt_acct', '{CashBook.CashReceipt}');
      if (rcvEl) d.add('CR', rcvEl, amt);
    } else if (l.cashtype === 'C') {                                       // Charge :190-197
      var chg = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      var chgEl = elOf(db, vcAcct(db, chg && chg.acct), d.absent, '{Charge.Expense}');
      if (chgEl) d.add('DR', chgEl, -amt);
      assetAmt -= -amt;
    } else if (l.cashtype === 'D') {                                       // Difference :198-205
      var diffEl = cbEl('cb_differences_acct', '{CashBook.CashDifference}');
      if (diffEl) d.add('DR', diffEl, -amt);
      assetAmt += amt;
    } else if (l.cashtype === 'I') {                                       // Invoice :206-219
      if (lineCur === docCur) assetAmt += amt;
      else { var caEl = cbEl('cb_asset_acct', '{CashBook.CashAsset}'); if (caEl) d.add('DR', caEl, amt); }
      var trEl = cbEl('cb_cashtransfer_acct', '{CashBook.CashTransfer}');
      if (trEl) d.add('CR', trEl, amt);                                    // amount.negate() → CR |amt|
    } else if (l.cashtype === 'T') {                                       // Transfer :220-236
      var ba = getRow(db, 'SELECT * FROM c_bankaccount_acct WHERE c_bankaccount_id=? AND c_acctschema_id=?', [num(l.c_bankaccount_id), num(schema)]);
      var itEl = elOf(db, vcAcct(db, ba && ba.b_intransit_acct), d.absent, '{BankAccount.InTransit}');
      if (itEl) d.add('DR', itEl, -amt);
      if (lineCur === docCur) assetAmt += amt;
      else { var caEl2 = cbEl('cb_asset_acct', '{CashBook.CashAsset}'); if (caEl2) d.add('DR', caEl2, amt); }
    }
  });
  if (assetAmt !== 0) {                                                    // header close :239-243
    var assetEl = cbEl('cb_asset_acct', '{CashBook.CashAsset}');
    if (assetEl) d.add(assetAmt > 0 ? 'DR' : 'CR', assetEl, Math.abs(assetAmt));
  }
  return d;
}

// Doc_Inventory.createFacts:211-513 (HARDEN_MATRIX.md §W-POST-TAIL-2), physical-inventory branch only
// (this seed's docs are all DocSubTypeInv=PI). costs = the schema-costingmethod → cost-element →
// m_cost.currentcostprice hop (same lookup as deriveProjectIssue); if costs resolves to 0 AND no
// qualifying zero-cost-blessing M_CostDetail row exists (Doc_Inventory.java:319-336: Processed='Y',
// Amt=0, Qty>0, from an order/invoice line), the REAL engine REFUSES the whole doc ("No Costs for
// <product>") — createFacts returns null, ZERO fact rows, NOT a partial post. Verified live: product 147
// (doc 100's only line) has currentcostprice=0 everywhere and ZERO m_costdetail rows → the REAL engine
// refused doc 100 exactly this way (§TAILORACLE postErr="No Costs for TShirt - Red Large"). This manifest
// reproduces that SAME refusal (0==0, a genuine match, not a vacuous one) and the falsifier flips the
// blessing count to prove the gate — not the manifest — is what closes to ∅.
function deriveInventory(db, id, schema) {
  var hdr = getRow(db, 'SELECT * FROM m_inventory WHERE m_inventory_id=?', num(id));
  if (!hdr) return null;
  var lines = allRows(db, 'SELECT * FROM m_inventoryline WHERE m_inventory_id=? AND isactive=\'Y\'', num(id));
  var d = b3New();
  if (lines.length === 0) { d.absent.push('@NoLines@#' + id); return d; }   // MInventory.prepareIt:401-406
  lines.forEach(function (l) {
    var as = schemaRow(db, schema);
    var cost = getRow(db,
      "SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id" +
      " AND e.costelementtype='M' AND e.costingmethod=? WHERE c.m_product_id=? AND c.c_acctschema_id=? AND c.m_costtype_id=?",
      [as ? String(as.costingmethod) : '', num(l.m_product_id), num(schema), as ? num(as.m_costtype_id) : 0]);
    var qtyDiff = Number(l.qtycount) - Number(l.qtybook);                  // PI branch :164-165
    var costCents = cents(cost ? cost.p : 0);
    if (costCents === 0) {
      var bless = getRow(db,
        "SELECT COUNT(*) AS n FROM m_costdetail WHERE m_product_id=? AND processed='Y' AND amt=0.00 AND qty>0" +
        " AND (c_orderline_id>0 OR c_invoiceline_id>0)", num(l.m_product_id));
      if (!bless || Number(bless.n) === 0) { d.absent.push('{Product.NoCosts}#' + l.m_product_id); return; }  // :332-335 refusal
    }
    var amt = Math.round(costCents * qtyDiff);
    var prod = getRow(db, 'SELECT producttype, m_product_category_id FROM m_product WHERE m_product_id=?', num(l.m_product_id));
    var isService = prod && prod.producttype === 'S';
    var pcol = isService ? 'p_expense_acct' : 'p_asset_acct';
    var pacct = prod ? getRow(db, 'SELECT ' + pcol + ' AS acct FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=?', [num(prod.m_product_category_id), num(schema)]) : null;
    var drEl = elOf(db, vcAcct(db, pacct && pacct.acct), d.absent, '{Product.' + (isService ? 'Expense' : 'Asset') + '}');
    if (drEl) d.add('DR', drEl, amt);
    // CR: line.getChargeAccount if C_Charge_ID≠0, else M_Warehouse_Acct.W_Differences_Acct (:1505-1509)
    if (num(l.c_charge_id) > 0) {
      var chg = getRow(db, 'SELECT ch_expense_acct AS acct FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=?', [num(l.c_charge_id), num(schema)]);
      var chgEl = elOf(db, vcAcct(db, chg && chg.acct), d.absent, '{Charge.Expense}');
      if (chgEl) d.add('CR', chgEl, amt);
    } else {
      var loc = getRow(db, 'SELECT m_warehouse_id FROM m_locator WHERE m_locator_id=?', num(l.m_locator_id));
      var wa = loc ? getRow(db, 'SELECT w_differences_acct AS acct FROM m_warehouse_acct WHERE m_warehouse_id=? AND c_acctschema_id=?', [num(loc.m_warehouse_id), num(schema)]) : null;
      var crEl = elOf(db, vcAcct(db, wa && wa.acct), d.absent, '{Warehouse.Differences}');
      if (crEl) d.add('CR', crEl, amt);
    }
  });
  return d;
}

// ── §P9 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §P4-OPEN item 7 — Witness: W-POST-GLCATEGORY) ──
// glCategoryFor — a faithful port of how iDempiere decides a document's GL_Category_ID, which FactLine.java:404
// (`setGL_Category_ID(m_doc.getGL_Category_ID())`, inside setDocumentInfo:364) then stamps on EVERY fact line of
// that document — a document-level constant, never per-line. Chain, in Doc.java's order:
//   0. the DOCUMENT'S OWN GL_Category_ID column wins when the table has one (Doc.getGL_Category_ID:1785-1793 —
//      this is the GL_Journal case, where the doc-level resolution is bypassed entirely);
//   a. by C_DocType_ID  — `SELECT DocBaseType, GL_Category_ID FROM C_DocType WHERE C_DocType_ID=?` (:996-1009);
//   b. still 0 → by (AD_Client_ID, DocBaseType) (:1030-1045). The Java has NO ORDER BY and takes whatever row
//      the DB hands back first; we take the LOWEST c_doctype_id so the port is DETERMINISTIC — stated, not hidden;
//   c. still 0 → `SELECT GL_Category_ID FROM GL_Category WHERE AD_Client_ID=? ORDER BY IsDefault DESC` (:1060-1071);
//   d. still 0 → iDempiere logs SEVERE "No default GL_Category" (:1085-1086) and POSTS ANYWAY with 0.
// GL_Category_ID is a 0-SENTINEL, never NULL (Doc.java:411 `int m_GL_Category_ID = 0`); the seed agrees — 14 of
// its 52 c_doctype rows carry 0. So every guard below tests `> 0`, the same idiom ad_modelval.js:561 already uses.
function _hasCol(db, table, col) {
  try { return (db.prepare('PRAGMA table_info(' + table + ')').all() || []).some(function (r) { return String(r.name).toLowerCase() === col; }); }
  catch (e) { return false; }
}
function glCategoryFor(db, table, id) {
  var t = String(table || '').toLowerCase(), pk = t + '_id', out = { id: 0, stage: 'none' };
  if (!t || !isFinite(Number(id))) return out;
  var hdr = null;
  try { hdr = getRow(db, 'SELECT * FROM ' + t + ' WHERE ' + pk + '=?', num(id)); } catch (e) { return { id: 0, stage: 'no-doc-table' }; }
  if (!hdr) return out;
  // 0 — the document's own column (Doc.getGL_Category_ID:1787-1793)
  if (_hasCol(db, t, 'gl_category_id') && Number(hdr.gl_category_id) > 0) return { id: Number(hdr.gl_category_id), stage: 'own-column' };
  var clientId = Number(hdr.ad_client_id);
  var dtId = Number(hdr.c_doctype_id) > 0 ? Number(hdr.c_doctype_id)
           : (Number(hdr.c_doctypetarget_id) > 0 ? Number(hdr.c_doctypetarget_id) : 0);
  // a — by C_DocType_ID. EVERY read below is guarded: this resolver runs against NARROW seeds too (the B-3 and
  //   W-POST-TAIL fixtures build a minimal db with no c_doctype at all, and some carry c_doctype without
  //   docbasetype). iDempiere's own behaviour when it cannot resolve a category is to log and POST ANYWAY with
  //   the 0 sentinel (Doc.java:1085-1086) — never to fail the posting — so a schema gap DEGRADES and is NAMED in
  //   `stage`, exactly the "our interpreter's limits, said out loud" convention §P3-SPEC P3.4 already uses.
  //   (Found by the regression run: an unguarded read threw `no such table: c_doctype` and took four witnesses
  //   down with it — a posting must not break because a fixture is narrow.)
  var docBaseType = null;
  if (dtId > 0) {
    var dt = null;
    try { dt = getRow(db, 'SELECT docbasetype, gl_category_id FROM c_doctype WHERE c_doctype_id=?', dtId); }
    catch (e) { return { id: 0, stage: 'no-doctype-table', doctype: dtId }; }
    if (dt) {
      docBaseType = dt.docbasetype;
      if (Number(dt.gl_category_id) > 0) return { id: Number(dt.gl_category_id), stage: 'doctype', docBaseType: docBaseType, doctype: dtId };
    }
  }
  // b — by (client, DocBaseType)
  if (docBaseType) {
    var byBase = null;
    try { byBase = getRow(db, 'SELECT gl_category_id FROM c_doctype WHERE ad_client_id=? AND docbasetype=? AND gl_category_id>0 ORDER BY c_doctype_id LIMIT 1',
                          [clientId, docBaseType]); } catch (e) { byBase = null; }
    if (byBase && Number(byBase.gl_category_id) > 0) return { id: Number(byBase.gl_category_id), stage: 'docbasetype', docBaseType: docBaseType };
  }
  // c — the client's default GL_Category
  try {
    var def = getRow(db, 'SELECT gl_category_id FROM gl_category WHERE ad_client_id=? ORDER BY isdefault DESC, gl_category_id LIMIT 1', clientId);
    if (def && Number(def.gl_category_id) > 0) return { id: Number(def.gl_category_id), stage: 'client-default', docBaseType: docBaseType };
  } catch (e) { /* a seed without gl_category — fall through to the 0 sentinel, as the Java does */ }
  return { id: 0, stage: 'none-severe', docBaseType: docBaseType };   // Doc.java:1085-1086 — log and post with 0
}

function finish(d, basis, glCat) {
  if (!d) return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
  var gl = glCat || { id: 0, stage: 'none' };
  var lines = Object.keys(d.by).map(function (k) {
    var a = d.by[k];
    // §P9 — FactLine.java:404: the SAME document-level category on every line, never per-line.
    return { account_id: a.account_id, value: a.value, name: a.name, amtacctdr: a.dr / 100, amtacctcr: a.cr / 100,
             gl_category_id: gl.id };
  });
  var sumDr = 0, sumCr = 0;
  Object.keys(d.by).forEach(function (k) { sumDr += d.by[k].dr; sumCr += d.by[k].cr; });
  return { lines: lines, balanced: lines.length > 0 && sumDr === sumCr, sumDr: sumDr, sumCr: sumCr, absent: d.absent, basis: basis,
           gl_category_id: gl.id, gl_category_stage: gl.stage };
}

/**
 * derivePostings(db, recordRef, schema, R) -> the fold for the doc the action would post.
 *   recordRef = { table:'C_Order'|'C_Invoice', id }. C_Order → its generated invoice manifest (oracle
 *   path); a true-draft order with no invoice → the projected order manifest (basis='order', no oracle).
 *   Shipment COGS/Inventory leg is the §8 follow-up (cost data named-deferred in seed) — NOT in this slice.
 */
function derivePostings(db, recordRef, schema, R) {
  R = R || _R();
  if (!R) throw new Error('doc_poster: post_resolver (R) unavailable');
  var table = recordRef.table || recordRef.doc_type;
  var id = num(recordRef.id != null ? recordRef.id : recordRef.record_id);
  // §P9 — the GL_Category is resolved from the document ACTUALLY POSTED, so an order that folds through its
  //   generated invoice takes the INVOICE's doctype (that is the Doc iDempiere builds), not the order's.
  var glOf = function (t, i) { return glCategoryFor(db, t, i); };
  if (table === 'C_Invoice') return finish(deriveInvoice(db, R, id, schema), 'invoice', glOf('c_invoice', id));
  if (table === 'C_Order') {
    var invId = invoiceForOrder(db, id);
    if (invId != null) return finish(deriveInvoice(db, R, invId, schema), 'invoice', glOf('c_invoice', invId));
    return finish(deriveOrder(db, R, id, schema), 'order', glOf('c_order', id));   // draft projection — no oracle
  }
  // B-3 0-seed classes (W-POST-B3 §W-3) — these read per-asset/project acct config, not R tokens
  if (table === 'A_Asset_Addition') return finish(deriveAssetAddition(db, id, schema), 'fa-addition', glOf('a_asset_addition', id));
  if (table === 'A_Depreciation_Entry') return finish(deriveDepreciationEntry(db, id, schema), 'fa-depreciation', glOf('a_depreciation_entry', id));
  if (table === 'A_Asset_Reval') return finish(deriveAssetReval(db, id, schema), 'fa-reval', glOf('a_asset_reval', id));
  if (table === 'A_Asset_Transfer') return finish(deriveAssetTransfer(db, id, schema, recordRef.primarySchema), 'fa-transfer', glOf('a_asset_transfer', id));
  if (table === 'A_Asset_Disposed') return finish(deriveAssetDisposed(db, id, schema), 'fa-disposal', glOf('a_asset_disposed', id));
  if (table === 'C_ProjectIssue') return finish(deriveProjectIssue(db, id, schema), 'project-issue', glOf('c_projectissue', id));
  // W-POST-TAIL classes (HARDEN_MATRIX.md §W-POST-TAIL)
  if (table === 'C_BankStatement') return finish(deriveBankStatement(db, id, schema), 'bank-statement', glOf('c_bankstatement', id));
  if (table === 'M_MatchPO') return finish(deriveMatchPO(db, id, schema), 'matchpo', glOf('m_matchpo', id));
  if (table === 'M_Requisition') return finish(deriveRequisition(db, id, schema), 'requisition', glOf('m_requisition', id));
  if (table === 'C_Cash') return finish(deriveCash(db, id, schema), 'cash', glOf('c_cash', id));
  if (table === 'M_Inventory') return finish(deriveInventory(db, id, schema), 'inventory', glOf('m_inventory', id));
  return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
}

function _R() { try { return (typeof require !== 'undefined') ? require('./post_resolver') : null; } catch (e) { return null; } }

var _api = { derivePostings: derivePostings, deriveInvoice: deriveInvoice, deriveOrder: deriveOrder, invoiceForOrder: invoiceForOrder,
             glCategoryFor: glCategoryFor };   // §P9 (W-POST-GLCATEGORY): the Doc.setDocumentType GL_Category chain, exposed for the witness
// UMD tail — node (require) + browser live host (window.DocPoster). erp_preview.js injects window.PostResolver as R.
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.DocPoster = _api; }
