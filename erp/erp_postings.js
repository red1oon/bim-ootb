// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * erp_postings.js — readPostings(recordRef, ctx, dbs): the role-gated read-fold (§13.7).
 *   Implementing PLUGIN_ARCHITECTURE.md §13.7 / §13.7a — Witness: §POSTED-READ/GATE/COVERAGE.
 *   ENGINE_CONTRACT.md §1 `read` with role ctx; the gate + fold are ENGINE-side, never UI-trusted.
 *
 * THIN over proven data: reads ad_role.isshowacct (the gate), the erp_kernel projection's POST/journal
 * (the fold), and — only when present and record-keyed — real Fact_Acct (the §13.6 complete gate).
 * No new engine logic, no invented posting: absent history is REPORTED via source/coverage, never faked.
 *
 * dbs = { adQ, projQ, factQ } — each a fn(sql, params)->rows[] (binding-agnostic):
 *   adQ   master db (ad_role, c_validcombination, c_elementvalue) — the seed
 *   projQ erp_kernel projection (kernel_ops, journal) — the op-log fold source
 *   factQ optional Fact_Acct bundle; null when no local data is installed
 */

function cents(n) { return Math.round(Number(n || 0) * 100); }

// does the Fact_Acct table carry the per-record key columns? The bundled TOTALS extract does NOT
// (extract_fact_acct.sh selects no ad_table_id/record_id) → complete is unreachable until the §13.6
// re-extract. Detected, never assumed.
function factHasRecordKey(factQ) {
  if (!factQ) return false;
  try { factQ('SELECT ad_table_id, record_id FROM fact_acct LIMIT 0', []); return true; }
  catch (e) { return false; }
}

// account_id is a C_ValidCombination id (mirrors gl_journalline, §13.5). Join → C_ElementValue for
// display value/name. Fallback: treat the id as a C_ElementValue id directly. Never invents a name.
function resolveAcct(adQ, accId) {
  // journal.account_id is stored as TEXT; the master keys are INTEGER — coerce so the join hits.
  var key = /^\d+$/.test(String(accId)) ? Number(accId) : accId;
  var vc = adQ('SELECT account_id AS ev FROM c_validcombination WHERE c_validcombination_id=?', [key]);
  var evId = vc.length ? vc[0].ev : key;
  var ev = adQ('SELECT value AS value, name AS name FROM c_elementvalue WHERE c_elementvalue_id=?', [evId]);
  return ev.length ? { value: ev[0].value, name: ev[0].name } : { value: null, name: null };
}

// per-(account,side) cent map — the unit the §13.6 gate compares (totals-equal is necessary but not
// sufficient; same Σ can hide a swapped account).
function centMap(rows) {
  var m = {};
  rows.forEach(function (r) {
    var a = String(r.account_id);
    m[a + ':DR'] = (m[a + ':DR'] || 0) + cents(r.amtacctdr);
    m[a + ':CR'] = (m[a + ':CR'] || 0) + cents(r.amtacctcr);
  });
  // drop zero entries so a missing side doesn't spuriously differ from an explicit 0.
  Object.keys(m).forEach(function (k) { if (m[k] === 0) delete m[k]; });
  return m;
}
function mapsEqual(a, b) {
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(function (k) { return a[k] === b[k]; });
}

/**
 * readPostings — the §13.7 contract. Returns the EXACT shape:
 *   { visible, posted, lines[], balanced, source, coverage, note, reason }
 *   source   ∈ {fact_acct, oplog, none}    coverage ∈ {complete, partial, absent}
 */
function readPostings(recordRef, ctx, dbs) {
  var table = recordRef.table || recordRef.doc_type;
  var id = recordRef.record_id;
  var roleId = ctx && ctx.role && ctx.role.id;

  // ── 1) GATE: role accounting visibility, engine-resolved (not UI-trusted) ──────────────────────
  var rr = dbs.adQ('SELECT isshowacct FROM ad_role WHERE ad_role_id=?', [roleId]);
  var isshowacct = rr.length ? rr[0].isshowacct : null;
  if (isshowacct !== 'Y') {
    // forbidden → an empty/forbidden result, NEVER the rows (zero leak).
    return { visible: false, posted: false, lines: [], balanced: false,
             source: 'none', coverage: 'absent', note: null, reason: 'role-not-accounting' };
  }

  // ── 2) SCOPE: a record outside the role's orgs returns empty, never rows ────────────────────────
  var allow = ctx.allowOrgs;
  if (allow && allow !== '*' && recordRef.ad_org_id != null &&
      allow.map(Number).indexOf(Number(recordRef.ad_org_id)) < 0) {
    return { visible: false, posted: false, lines: [], balanced: false,
             source: 'none', coverage: 'absent', note: null, reason: 'out-of-scope' };
  }

  // ── 3) FOLD: the record's POST op journal rows (posted-status is DERIVED, not a column) ─────────
  var src = 'DOC:' + table + '#' + id;
  var jrn = dbs.projQ('SELECT account_id, amtacctdr, amtacctcr FROM journal WHERE source=? AND account_id IS NOT NULL', [src]);
  var hasPost = dbs.projQ("SELECT op_uuid FROM kernel_ops WHERE op_type='POST' AND output_guid=?",
                          ['POST:' + table + '#' + id]).length > 0 || jrn.length > 0;
  var lines = jrn.map(function (j) {
    var a = resolveAcct(dbs.adQ, j.account_id);
    return { account_id: j.account_id, value: a.value, name: a.name,
             amtacctdr: Number(j.amtacctdr || 0), amtacctcr: Number(j.amtacctcr || 0) };
  });
  var dr = lines.reduce(function (s, l) { return s + cents(l.amtacctdr); }, 0);
  var cr = lines.reduce(function (s, l) { return s + cents(l.amtacctcr); }, 0);
  var balanced = lines.length > 0 && dr === cr;

  // ── 4) FACT_ACCT degrade: complete only when real record-keyed rows are cent-equal to the fold ──
  var factRows = null;
  if (factHasRecordKey(dbs.factQ)) {
    factRows = dbs.factQ('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=? AND record_id=?',
                         [recordRef.ad_table_id, id]);
  }

  if (!hasPost) {
    // nothing posted in the op-log. (A fact-only complete path would need a from-Fact_Acct fold; the
    // bundle is TOTALS so we never reach it — honest absent.)
    return { visible: true, posted: false, lines: [], balanced: false,
             source: 'none', coverage: 'absent',
             note: 'install local data first to see Accts Posted', reason: null };
  }

  if (factRows && factRows.length && mapsEqual(centMap(jrn), centMap(factRows))) {
    // §13.6 cent-gate passes → the fold reproduces the operator's real Fact_Acct exactly.
    return { visible: true, posted: true, lines: lines, balanced: balanced,
             source: 'fact_acct', coverage: 'complete', note: null, reason: null };
  }

  // POST ops only (or fact mismatch) → render what we have, flagged partial.
  return { visible: true, posted: true, lines: lines, balanced: balanced,
           source: 'oplog', coverage: 'partial',
           note: 'showing op-log postings — run local install for the full posted history', reason: null };
}

var _api = { readPostings: readPostings, factHasRecordKey: factHasRecordKey, centMap: centMap, mapsEqual: mapsEqual };
// UMD tail — node tests + browser live host (window.ERPPostings).
if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
if (typeof window !== 'undefined') { window.ERPPostings = _api; }
