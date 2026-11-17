// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — help_actions.js: the two ACTIONS of the How To box, `#<number>` (open a document) and New (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 step 6a; design prompts/HELP_QUERY_CORE_DESIGN.md D6).
// Witnesses W-HQ-DOC and W-HQ-NEW (common/help/tests/). READ THE LOG after every run; an exit code is not evidence.
// PURE (no DOM, no DB handle): it holds the DICTIONARY's questions and the shaping of the answer; erp/idempiere.html runs them over its own reader (`_sqlRows`, the real window query of AdGridTab) and its own role gate.
//   TARGETS_SQL          the (window, header table) pairs of the dictionary whose table has a DocumentNo column: N comes from here, no hand list (design D6 "X of N")
//   targets(rows)        -> [{win, winName, table}]
//   likeEsc(s)           the typed number as the body of a LIKE pattern (legacy DocumentSearchController: UPPER(col) LIKE UPPER('<typed>%'))
//   probeSql(t, number)  -> does the table hold the number at all (cheap), before the window's own query is built
//   hitSql(t, keyCol, where, number) -> the SELECT for one target, over the window's own query `where` (GridTab: WhereClause + client + org access)
//   rank(rows, number, nameOf) -> {hits, total, more, exact}: an EXACT DocumentNo (case-insensitive) answers alone; else every prefix match; sorted by window name, then DocumentNo, then key; at most MAX shown
//   canNew(winSet, win)  -> New is offered only where the role holds the window READ-WRITE (idmp_session winSet[w].rw, from AdAccess ctx.win)
// Falsifier: HQ_BREAK=nogate (read the way help_query.js reads it) makes the page skip the role's menu gate for documents and the read-write test for New -> W-HQ-DOC and W-HQ-NEW FAIL.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HelpActions = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var MAX = 20;
  function brk() { return (typeof process !== 'undefined' && process.env && process.env.HQ_BREAK) || (typeof window !== 'undefined' && window.__HQ_BREAK) || ''; }
  var TARGETS_SQL = "SELECT DISTINCT w.ad_window_id AS win, w.name AS winname, t.tablename AS tablename FROM ad_window w " +
    "JOIN ad_tab b ON b.ad_window_id = w.ad_window_id AND b.isactive = 'Y' JOIN ad_table t ON t.ad_table_id = b.ad_table_id " +
    "WHERE w.isactive = 'Y' AND b.tablevel = 0 AND b.seqno = (SELECT MIN(b2.seqno) FROM ad_tab b2 WHERE b2.ad_window_id = w.ad_window_id AND b2.isactive = 'Y') " +
    "AND EXISTS (SELECT 1 FROM ad_column c WHERE c.ad_table_id = t.ad_table_id AND c.isactive = 'Y' AND LOWER(c.columnname) = 'documentno') ORDER BY w.ad_window_id";
  function targets(rows) { return (rows || []).map(function (r) { return { win: Number(r.win), winName: String(r.winname), table: String(r.tablename) }; }); }
  function likeEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "''"); }
  function hitSql(t, keyCol, where, number) {
    return 'SELECT ' + keyCol + ' AS pk, documentno AS docno FROM ' + t.table + ' WHERE ' + (where ? '(' + where + ') AND ' : '') +
      "UPPER(documentno) LIKE UPPER('" + likeEsc(number) + "%') ESCAPE '\\' LIMIT " + (MAX + 1);
  }
  function probeSql(t, number) { return 'SELECT 1 AS x FROM ' + t.table + " WHERE UPPER(documentno) LIKE UPPER('" + likeEsc(number) + "%') ESCAPE '\\' LIMIT 1"; }   // cheap: does this table hold the number at all (before the window's own query is built)
  function rank(rows, number, nameOf) {
    var up = function (s) { return String(s).toUpperCase(); }, all = (rows || []).slice(), exact = all.filter(function (r) { return up(r.docno) === up(number); }), list = exact.length ? exact : all;
    list.sort(function (a, b) { var an = nameOf(a.win), bn = nameOf(b.win); return an < bn ? -1 : an > bn ? 1 : String(a.docno) < String(b.docno) ? -1 : String(a.docno) > String(b.docno) ? 1 : (Number(a.pk) - Number(b.pk)) || 0; });
    return { hits: list.slice(0, MAX), total: list.length, more: Math.max(0, list.length - MAX), exact: exact.length > 0 };
  }
  function canNew(winSet, win) { return brk() === 'nogate' ? true : !!(winSet && winSet[win] && winSet[win].rw); }
  return { MAX: MAX, TARGETS_SQL: TARGETS_SQL, targets: targets, likeEsc: likeEsc, hitSql: hitSql, probeSql: probeSql, rank: rank, canNew: canNew, nogate: function () { return brk() === 'nogate'; } };
});
