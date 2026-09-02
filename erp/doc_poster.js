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

function finish(d, basis) {
  if (!d) return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
  var lines = Object.keys(d.by).map(function (k) {
    var a = d.by[k];
    return { account_id: a.account_id, value: a.value, name: a.name, amtacctdr: a.dr / 100, amtacctcr: a.cr / 100 };
  });
  var sumDr = 0, sumCr = 0;
  Object.keys(d.by).forEach(function (k) { sumDr += d.by[k].dr; sumCr += d.by[k].cr; });
  return { lines: lines, balanced: lines.length > 0 && sumDr === sumCr, sumDr: sumDr, sumCr: sumCr, absent: d.absent, basis: basis };
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
  if (table === 'C_Invoice') return finish(deriveInvoice(db, R, id, schema), 'invoice');
  if (table === 'C_Order') {
    var invId = invoiceForOrder(db, id);
    if (invId != null) return finish(deriveInvoice(db, R, invId, schema), 'invoice');
    return finish(deriveOrder(db, R, id, schema), 'order');           // draft projection — no oracle
  }
  return { lines: [], balanced: false, sumDr: 0, sumCr: 0, absent: [], basis: 'none' };
}

function _R() { try { return (typeof require !== 'undefined') ? require('./post_resolver') : null; } catch (e) { return null; } }

var _api = { derivePostings: derivePostings, deriveInvoice: deriveInvoice, deriveOrder: deriveOrder, invoiceForOrder: invoiceForOrder };
// UMD tail — node (require) + browser live host (window.DocPoster). erp_preview.js injects window.PostResolver as R.
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.DocPoster = _api; }
