// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_valrule.js — AD_Val_Rule SQL-where interpreter (W-VALRULE). The "AD_Val_Rule" leg of the coverage
// matrix: read AD_Val_Rule.Code (Type S = a SQL where-clause fragment), substitute @Context@/@Field@
// tokens, and APPLY the clause as a real WHERE against the bound table for list/FK filtering — exactly
// how iDempiere's MValRule appends the where-clause to a lookup query. Self-contained, no kernel dep
// (mirrors ad_process.js / ad_access.js / ad_evaluator.js shape).
//
// SEAM (pinned in docs/ERP_BACKEND_SEPARATION.md §3 ❷): a val-rule VALIDATES / FILTERS — given a field +
// context it decides which values are LEGAL (a where-clause over a candidate set). It is the READ verb. It
// must NOT derive a value (that is the callout, A-3). This module returns a boolean/row-set, never a value
// map. It extends ad_evaluator.js (boolean display/readonly/mandatory logic) as a DISTINCT sibling surface —
// SQL-validation ≠ boolean logic — it does not replace it.
//
// EXTRACT, DON'T INVENT: the where-clause IS the AD data (build/erp/ad_full.db: ad_val_rule, lowercase). We
// run it verbatim (after token substitution) against the real db; we never author or rewrite a rule. An
// unresolved token / unsafe clause is reported DEFERRED (explicit), never silently passed. (AD_Rule is a
// SEPARATE surface — 4 SQL ruletype-Q Fact_Reconciliation rules, n/a-in-seed; not this module's concern.)
// Determinism: read-only query, no Date.now/Math.random. Implementing ERP_COVERAGE_MATRIX.md §AD_Val_Rule
// (ranked GAP #7) — Witness: W-VALRULE
(function (global) {
  'use strict';

  // ── classify a clause: what can we evaluate headless, and what must be deferred? ───────────────────────
  // unsafe  = multi-statement / comment markers (defensive — these are AD-authored, but we only ever embed
  //           the fragment inside a SELECT…WHERE, so reject anything that could break out of that context).
  function classify(code) {
    if (code == null || String(code).trim() === '') return 'empty';
    var c = String(code);
    if (/;|--|\/\*|\bunion\b/i.test(c)) return 'unsafe';     // never embed a breakout fragment
    if (/@SQL=/i.test(c)) return 'sql-token';                // dynamic subselect token — named-deferred
    if (c.indexOf('@') >= 0) return 'token';                 // @Field@/@#Global@ context tokens present
    return 'static';                                         // a literal where-clause, directly applicable
  }

  // tokens present in a clause, e.g. "AD_Tab.AD_Table_ID=@AD_Table_ID@" -> ["AD_Table_ID"] (strips @#…@/@…@).
  function tokensIn(code) {
    var out = [], m, re = /@([#$]?[A-Za-z0-9_]+)@/g;
    while ((m = re.exec(String(code)))) out.push(m[1]);
    return out;
  }

  // quote a value SQL-style: numbers bare, everything else single-quoted (escaped). RETAINED as public API
  // for callers that need to build a literal — it is deliberately NOT the val-rule substitution path (see
  // envValue/substitute below; using it there was ERP_IDEMPIERE_UX_PARITY.md §P3-DEFECT).
  function quote(v) {
    if (v == null) return 'NULL';
    if (typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(String(v)))) return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  // envValue — the substitution semantics of Env.parseContext(…, forSQL=true), EXTRACTED from the source, not
  // assumed (Env.java:1636-1639, and its own javadoc :1540-1543): the context value is appended VERBATIM with
  // only ' -> '' escaping. It is NOT wrapped in quotes — the RULE AUTHOR writes them, which is why 25 of the
  // 332 Type-S rules read  IsSOTrx='@IsSOTrx@' . Auto-quoting those emitted  ''Y''  — a SQL syntax error, so
  // the filter could not run at all (measured: 6 of the 43 in-seed val-rule fields on the five document tabs).
  // An EMPTY value is not a value: Env.java:1641-1645 treats it as an unparsable token and returns "" for the
  // WHOLE expression; MLookup.java:1128-1140 then clears the lookup — no rows, NOT an unfiltered list.
  function envValue(v) {
    if (v == null) return '';
    var s = String(v);
    return s.indexOf("'") >= 0 ? s.replace(/'/g, "''") : s;
  }

  // substitute(code, ctx) -> { sql, unresolved:[] }. ctx keys may be bare ("AD_Table_ID") or global
  // ("#AD_Client_ID"); a token with no ctx value — or an EMPTY one (Env: same thing) — is LEFT in place and
  // recorded unresolved, so the caller defers rather than filtering on a half-substituted clause.
  function substitute(code, ctx) {
    ctx = ctx || {};
    var unresolved = [];
    var sql = String(code).replace(/@([#$]?[A-Za-z0-9_]+)@/g, function (whole, name) {
      var key = name.replace(/^[#$]/, '');
      var hit = Object.prototype.hasOwnProperty.call(ctx, name) ? name
              : (Object.prototype.hasOwnProperty.call(ctx, key) ? key : null);
      var sv = hit === null ? '' : envValue(ctx[hit]);
      if (sv === '') { unresolved.push(name); return whole; }
      return sv;
    });
    return { sql: sql, unresolved: unresolved };
  }

  // inferTable — a qualified clause "C_Invoice.IsPaid<>'Y'" names its table; bare clauses ("IsSOTrx='Y'")
  // rely on the caller-bound table (opts.table). Returns lowercase table name or null.
  function inferTable(code) {
    var m = /([A-Za-z_][A-Za-z0-9_]*)\s*\./.exec(String(code));
    return m ? m[1].toLowerCase() : null;
  }

  // evalValRule(db, valRuleId, opts) — the full interpreter.
  //   opts.ctx        : context map for token substitution
  //   opts.table      : bound lookup table (fallback when the clause is unqualified)
  //   opts.candidatePk: {col, id} — membership test: is THIS row admitted by the filter?
  // Returns { id, name, type, code, sql, table, rows, ok, member?, deferred?, unresolved? }.
  function evalValRule(db, valRuleId, opts) {
    opts = opts || {};
    var row = db.prepare('SELECT ad_val_rule_id,name,type,code FROM ad_val_rule WHERE ad_val_rule_id=?').get(valRuleId);
    if (!row) throw new Error('no ad_val_rule ' + valRuleId);
    var base = { id: row.ad_val_rule_id, name: row.name, type: row.type, code: row.code };

    var kind = classify(row.code);
    if (kind !== 'static' && kind !== 'token')
      return Object.assign(base, { ok: false, deferred: kind });   // empty/unsafe/sql-token → explicit defer

    var sub = substitute(row.code, opts.ctx);
    if (sub.unresolved.length)
      return Object.assign(base, { ok: false, deferred: 'unresolved-tokens', unresolved: sub.unresolved, sql: sub.sql });

    var table = opts.table || inferTable(row.code);
    if (!table)
      return Object.assign(base, { ok: false, deferred: 'no-bound-table', sql: sub.sql });

    // APPLY the where-clause as a real filter (the MValRule semantics). Read-only.
    var n = db.prepare('SELECT COUNT(*) AS n FROM ' + table + ' WHERE ' + sub.sql).get().n;
    var out = Object.assign(base, { sql: sub.sql, table: table, rows: n, ok: true });

    // membership test: does a specific candidate row survive the filter? (list/FK admission)
    if (opts.candidatePk && opts.candidatePk.col) {
      var hit = db.prepare('SELECT 1 AS m FROM ' + table + ' WHERE ' + opts.candidatePk.col + '=? AND (' + sub.sql + ')').get(opts.candidatePk.id);
      out.member = !!hit;
    }
    return out;
  }

  // coverageScan(db) — classify all Type-S rules: directly applicable (static) vs token-bearing vs deferred.
  function coverageScan(db) {
    var rows = db.prepare("SELECT ad_val_rule_id,code FROM ad_val_rule WHERE type='S'").all();
    var tally = { total: rows.length, static: 0, token: 0, 'sql-token': 0, unsafe: 0, empty: 0 };
    rows.forEach(function (r) { tally[classify(r.code)]++; });
    return tally;
  }

  var API = {
    classify: classify, tokensIn: tokensIn, substitute: substitute, quote: quote, envValue: envValue,
    inferTable: inferTable, evalValRule: evalValRule, coverageScan: coverageScan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdValRule = API;                    // browser
  else if (global) global.AdValRule = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
