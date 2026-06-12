// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_rule.js — NinjaExcel RULE tier: compile a closed business phrase into Process-row SQL candidates,
// deterministically, from the AD dictionary already in the client db. Reduces SQL crafting to a business
// vocabulary the substrate itself declares — entity=ad_table, measure/filter=ad_column, status=ad_ref_list.
//
// Implementing internal/NinjaExcelAdaptation.md §7 (v1 grammar, pinned 2026-06-12) — Witness: W-NINJA-RULE.
//
// ZERO-LLM + EXTRACT-DON'T-INVENT: every word resolves against dictionary rows or it is an explicit error —
// no fuzzy matching, no scoring, no model. AMBIGUITY IS NEVER AUTO-PICKED: a date range fans out to one
// candidate per date column of the entity; pickByExample() runs them all and the filled BACKUP sample
// falsifies the wrong ones (§5.1); a surviving tie is REPORTED for the human (confirm-each, §9.1).
// v1 boundaries (named, not silent): named periods need C_Period (absent in the ad_full extraction) —
// literal ISO dates only; group-by deferred (data-point scope); literal date strings, not #n binds.
//
// SEAM: dependency-free — loadDict takes an injected query(sql, params) → rows (node: better-sqlite3;
// browser: sql.js). Determinism: no Date.now/Math.random; money compared in integer cents.
(function (global) {
  'use strict';

  function cents(n) { return Math.round(Number(n || 0) * 100); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // AD_Reference display types that make a column a DATE / a YES-NO / a LIST (iDempiere DisplayType ids).
  var DATE_REFS = { 15: 1, 16: 1 };          // Date, DateTime
  var YESNO_REF = 20;
  function esc(v) { return String(v).replace(/'/g, "''"); }

  // ── loadDict(query) — read the vocabulary the substrate declares ────────────────────────────────────
  // Every selected column carries an explicit lowercase ALIAS: SQLite reports bare-column result keys
  // in the DECLARED case (ad_full=lowercase, ad_seed=MixedCase) but reports aliases verbatim — without
  // them the dict reads `undefined` on a mixed-case seed (the make_ninja_fixture.js trap, same fix).
  function loadDict(query) {
    var tables = query('SELECT ad_table_id AS ad_table_id, tablename AS tablename, name AS name, isview AS isview FROM ad_table', []);
    var byTableName = {}, byName = {};
    tables.forEach(function (t) {
      byTableName[norm(t.tablename)] = t;
      (byName[norm(t.name)] = byName[norm(t.name)] || []).push(t);
    });
    // resolve(key): exact TableName wins; among display-Name matches, isview='N' beats a report view
    // (RV_C_Invoice and C_Invoice BOTH carry Name 'Invoice' — isview is the dictionary's own tiebreak);
    // >1 surviving base table = AMBIGUOUS → null + list (compile refuses explicitly, never picks).
    function resolve(key) {
      if (byTableName[key]) return { table: byTableName[key] };
      var hits = byName[key] || [];
      var base = hits.filter(function (t) { return t.isview !== 'Y'; });
      if (base.length === 1) return { table: base[0] };
      if (base.length > 1) return { ambiguous: base.map(function (t) { return t.tablename; }) };
      if (hits.length) return { ambiguous: hits.map(function (t) { return t.tablename + '(view)'; }) };
      return null;
    }
    return {
      query: query,
      tableCount: tables.length,
      findTable: function (words) {
        var key = norm(words);
        var r = resolve(key) || (/s$/.test(key) ? resolve(key.slice(0, -1)) : null);     // plural-insensitive
        return r || null;
      },
      columns: function (tableId) {
        return query('SELECT columnname AS columnname, name AS name, ad_reference_id AS ad_reference_id, ' +
                     'ad_reference_value_id AS ad_reference_value_id FROM ad_column WHERE ad_table_id = ?', [tableId]);
      },
      refList: function (refId) {
        return query('SELECT value AS value, name AS name FROM ad_ref_list WHERE ad_reference_id = ?', [refId]);
      }
    };
  }

  function findColumn(cols, words) {
    var key = norm(words);
    for (var i = 0; i < cols.length; i++)
      if (norm(cols[i].columnname) === key || norm(cols[i].name) === key) return cols[i];
    return null;
  }

  // ── compile(dict, phrase) → { ok, errors, entity, measure, filters, dateRange, candidates } ─────────
  // RULE := MEASURE ['of'] ENTITY (',' QUALIFIER)*   — §7 v1 grammar, closed.
  function compile(dict, phrase) {
    var errors = [], parts = String(phrase).split(',').map(function (s) { return s.trim(); });
    var head = /^(SUM|AVG|COUNT)?\s*(.*?)\s+of\s+(.+)$/i.exec(parts[0]) ||
               /^(SUM|AVG|COUNT)\s+(.*?)\s+(\S+)$/i.exec(parts[0]);
    if (!head) return { ok: false, errors: ['cannot parse MEASURE/ENTITY from "' + parts[0] + '" (RULE := MEASURE [of] ENTITY, QUALIFIER*)'] };
    var agg = (head[1] || '').toUpperCase(), measureWords = head[2].trim(), entityWords = head[3].trim();

    var found = dict.findTable(entityWords);
    if (!found) return { ok: false, errors: ['unknown entity "' + entityWords + '" — no ad_table Name/TableName matches'] };
    if (found.ambiguous) return { ok: false, errors: ['ambiguous entity "' + entityWords + '" — matches ' + found.ambiguous.join('/') + '; use the TableName'] };
    var table = found.table;
    var cols = dict.columns(table.ad_table_id);
    var tname = table.tablename.toLowerCase();

    var select;
    if (agg === 'COUNT' && !measureWords) select = 'COUNT(*)';
    else {
      var mcol = findColumn(cols, measureWords);
      if (!mcol) errors.push('unknown measure column "' + measureWords + '" on ' + table.tablename);
      else select = agg ? agg + '(' + mcol.columnname.toLowerCase() + ')' : mcol.columnname.toLowerCase();
    }

    var filters = [], dateRange = null;
    var listCols = cols.filter(function (c) { return c.ad_reference_value_id != null; });
    parts.slice(1).forEach(function (q) {
      var m;
      if ((m = /^from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/i.exec(q))) {
        dateRange = { from: m[1], to: m[2] };
      } else if ((m = /^(is|not)\s+(.+)$/i.exec(q))) {
        var ycol = findColumn(cols, m[2]);
        if (!ycol || ycol.ad_reference_id !== YESNO_REF) errors.push('"' + q + '": no Yes-No column matches "' + m[2] + '"');
        else filters.push(ycol.columnname.toLowerCase() + "='" + (m[1].toLowerCase() === 'is' ? 'Y' : 'N') + "'");
      } else if ((m = /^(.+?)\s*=\s*(.+)$/.exec(q))) {
        var fcol = findColumn(cols, m[1]);
        if (!fcol) errors.push('"' + q + '": unknown column "' + m[1] + '" on ' + table.tablename);
        else filters.push(fcol.columnname.toLowerCase() + "='" + esc(m[2]) + "'");
      } else {
        // STATUS word: search the ref-lists of the entity's list-reference columns (extracted vocabulary)
        var hits = [];
        listCols.forEach(function (c) {
          dict.refList(c.ad_reference_value_id).forEach(function (rl) {
            if (norm(rl.name) === norm(q)) hits.push({ col: c.columnname.toLowerCase(), value: rl.value, list: rl.name });
          });
        });
        if (hits.length === 1) filters.push(hits[0].col + "='" + hits[0].value + "'");
        else if (hits.length === 0) errors.push('"' + q + '": matches no qualifier form and no ad_ref_list status of ' + table.tablename);
        else errors.push('"' + q + '": ambiguous across list columns ' + hits.map(function (h) { return h.col; }).join('/') + ' — qualify explicitly');
      }
    });
    if (errors.length) return { ok: false, errors: errors, entity: table.tablename };

    // candidates: a date range fans out over EVERY date column — the sample falsifies (§5.1), never us.
    var candidates = [];
    if (dateRange) {
      cols.filter(function (c) { return DATE_REFS[c.ad_reference_id]; }).forEach(function (c) {
        var d = c.columnname.toLowerCase();
        candidates.push({
          select: select, table: tname + ' i', dateColumn: d,
          where: filters.map(function (f) { return 'i.' + f; })
            .concat(["i." + d + " >= '" + dateRange.from + "'", "i." + d + " <= '" + dateRange.to + " 23:59:59'"]).join(' AND ')
        });
      });
      if (!candidates.length) return { ok: false, errors: ['date range given but ' + table.tablename + ' has no date columns'], entity: table.tablename };
    } else {
      candidates.push({ select: select, table: tname + ' i',
                        where: filters.map(function (f) { return 'i.' + f; }).join(' AND ') });
    }
    return { ok: true, errors: [], entity: table.tablename, select: select, filters: filters,
             dateRange: dateRange, candidates: candidates };
  }

  function toSql(cand) { return 'SELECT ' + cand.select + ' FROM ' + cand.table + (cand.where ? ' WHERE ' + cand.where : ''); }

  // ── pickByExample(candidates, execScalar, sample) — the §5.1 oracle over the fan-out ────────────────
  // Numbers equal in integer cents; strings exact. Returns accepted/rejected and tie (>1 survivor →
  // confirm-each: the HUMAN picks; this function never does).
  function pickByExample(candidates, execScalar, sample) {
    var accepted = [], rejected = [];
    candidates.forEach(function (cand) {
      var got, err = null;
      try { got = execScalar(toSql(cand), []); }
      catch (e) { err = String(e.message || e); }                // unrunnable candidate = explicit rejection
      var equal = !err && ((typeof got === 'number' && typeof sample === 'number')
        ? cents(got) === cents(sample) : String(got) === String(sample));
      (equal ? accepted : rejected).push({ candidate: cand, got: err ? 'SQL-ERROR: ' + err : got });
    });
    return { accepted: accepted, rejected: rejected, tie: accepted.length > 1 };
  }

  var API = { loadDict: loadDict, compile: compile, toSql: toSql, pickByExample: pickByExample, norm: norm, cents: cents };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaRule = API;
})(typeof self !== 'undefined' ? self : this);
