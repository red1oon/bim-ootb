// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-28 "site progress is a fold over the Requests, shown in the model" + REVIEW LOG "OWNER'S MODEL NOTES" (Fold-back ideas, One sentence).
//   Witness: viewer/tests/witness_site_progress.js (W-SITE-PROGRESS). READ THE LOG after every run: §SITE_PROGRESS_FOLD  §SITE_PROGRESS  §SITE_PROGRESS_OFF.
// ISSUE: the Project Order says what is PLANNED; the Requests are the events of doing it; PROGRESS IS COMPUTED FROM THOSE ROWS, never stored a second time. This file is that one computation: a pure function
//        over a sql.js database (no DOM, no THREE, works under node), READ-ONLY (no table, no counter, no seed row is written).
// siteProgress(db, projectId, resolve[, o]) -> { elements, lines, totals }
//   resolve(request) -> [guid, ...]: the elements a Request covers. It is PASSED IN: the one owner of that rule is the viewer's processor (viewer/mission_processor.js A.requestResolver = its own elementsOf:
//        a product Value that is a GUID = that one element; a class = the class's elements inside the pushed set). `request` is the lower-cased r_request row. A Request that resolves to none covers none.
//   elements = { <guid>: { state, request: R_Request_ID, at } }   state ∈ verified | done | cannot | open | new
//   lines    = [ { line, line_id, product, planned, done, verified, cannot, open, new, covered, not_issued, excess, requests } ]  one per ACTIVE C_ProjectLine of the project, in Line order, then ONE entry
//              { line:null, ... } when some Request is tied to no line. Quantities are BigDecimal STRINGS (erp/bigdecimal.js; never a JS float): planned = PlannedQty.
//   totals   = { requests, unresolved, elements, verified, done, cannot, open, new, lines, line_null_requests, planned, not_issued, excess }  (elements counted by state; `done` here is state done only —
//              a line's `done` is done + verified, the line's own `verified` is the part of it that is Verified)
// STATE OF ONE ELEMENT OF ONE REQUEST (the precedence, first that holds wins):
//   1. verified  the Request is in a CLOSED status (R_Status.IsClosed = Y — the Site Task "Verified" is closed + final close).
//   2. done | cannot   the LATEST R_RequestUpdate that is for this element decides (highest R_RequestUpdate_ID). An Update is `cannot` when its Result starts "CANNOT PROCEED:", else `done`.
//                  Which Updates are for which element: a Request that covers ONE element — every Update of it; a Request that covers several (a class) — an Update whose FIRST line is the element's GUID (done), or
//                  whose first line is "CANNOT PROCEED: …" and second line is the GUID (cannot) — exactly how viewer/mission_processor.js applyMissionReport writes them. So cannot-then-done = done; done-then-cannot = cannot.
//   3. open      its Request is issued — its status is not the category's default open status (Prepared, On site, Reported …) — and none of the above.
//   4. new       its Request is still in the default open status (New).
//   An element covered by several Requests takes the state of the Request with the highest R_Request_ID (stated, not hidden: the count of such elements is in the §SITE_PROGRESS_FOLD line as `shared`).
// LINE TIE of a Request: AD_Table_ID = C_ProjectLine and Record_ID set -> that line; else M_Product_ID = a line's product (the first line, by Line, with that product); else line:null.
// LINE ARITHMETIC (BigDecimal): covered = distinct elements of the line's Requests; not_issued = max(0, planned - covered); excess = max(0, covered - planned) (the Requests cover MORE than planned: reported here,
//   never a negative not_issued). Hence done + cannot + open + new = covered, and covered + not_issued = planned whenever excess = 0.
// LOG: §SITE_PROGRESS_FOLD project= requests= unresolved= elements= shared= lines=
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(root);
  else root.SiteProgress = factory(root);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  // BigDecimal (erp/bigdecimal.js, a boot file) is read from the global at CALL time - the same pattern viewer/edit_delta.js uses - so this file has no load-order edge; under node the caller sets
  // globalThis.BigDecimal = require('erp/bigdecimal.js') first, or passes o.BigDecimal.
  var BD = null;
  function bdLib(o) { var B = (o && o.BigDecimal) || root.BigDecimal || (typeof globalThis !== 'undefined' ? globalThis.BigDecimal : null); if (!B) throw new Error('erp/bigdecimal.js is not loaded (BigDecimal)'); return B; }
  function rows(db, sql, p) { var r = db.exec(sql, p || []); if (!r.length) return []; var c = r[0].columns; return r[0].values.map(function (v) { var o = {}; c.forEach(function (n, i) { o[n.toLowerCase()] = v[i]; }); return o; }); }
  function bd(v) { return v == null || v === '' ? BD.ZERO : BD.fromString(String(v)); }   // BD is set at the top of siteProgress
  function str(b) { return b.toString(); }   // BigDecimal.toString is the plain form
  var CANNOT = /^CANNOT PROCEED:/, GUID_LINE = /^[0-9A-Za-z_$]{22}$/;

  function siteProgress(db, projectId, resolve, o) {
    o = o || {}; BD = bdLib(o);
    var out = { elements: {}, lines: [], totals: { requests: 0, unresolved: 0, elements: 0, verified: 0, done: 0, cannot: 0, open: 0, new: 0, lines: 0, line_null_requests: 0, planned: '0', not_issued: '0', excess: '0' } };
    var st = {}; rows(db, 'SELECT r_status_id, isdefault, isopen, isclosed FROM r_status').forEach(function (s) { st[s.r_status_id] = s; });
    var tbl = rows(db, "SELECT ad_table_id FROM ad_table WHERE lower(tablename) = 'c_projectline'")[0], lineTable = tbl ? tbl.ad_table_id : null;
    var lines = rows(db, "SELECT pl.c_projectline_id AS id, pl.line, pl.m_product_id, pl.plannedqty, p.value AS pvalue FROM c_projectline pl LEFT JOIN m_product p ON p.m_product_id = pl.m_product_id " +
      "WHERE pl.c_project_id = ? AND pl.isactive = 'Y' ORDER BY pl.line, pl.c_projectline_id", [projectId]);
    var reqs = rows(db, "SELECT * FROM r_request WHERE c_project_id = ? AND isactive = 'Y' ORDER BY r_request_id", [projectId]);
    var ups = {};   // request id -> [{ id, result, at }] in R_RequestUpdate_ID order
    if (reqs.length) rows(db, 'SELECT r_requestupdate_id AS id, r_request_id AS rid, result, created FROM r_requestupdate WHERE r_request_id IN (' + reqs.map(function () { return '?'; }).join(',') + ') ORDER BY r_requestupdate_id',
      reqs.map(function (r) { return r.r_request_id; })).forEach(function (u) { (ups[u.rid] = ups[u.rid] || []).push(u); });

    function lineOf(r) {
      var i;
      if (r.record_id != null && r.ad_table_id != null && lineTable != null && Number(r.ad_table_id) === Number(lineTable))
        for (i = 0; i < lines.length; i++) if (Number(lines[i].id) === Number(r.record_id)) return i;
      if (r.m_product_id != null) for (i = 0; i < lines.length; i++) if (lines[i].m_product_id != null && Number(lines[i].m_product_id) === Number(r.m_product_id)) return i;
      return -1;
    }
    function lines2(text) { return String(text == null ? '' : text).split(/\r?\n/); }

    var perLine = lines.map(function () { return { reqs: 0, guids: {} }; }), nullLine = { reqs: 0, guids: {} }, shared = 0, seen = {};
    reqs.forEach(function (r) {
      var guids = resolve(r) || [], n = guids.length, s = st[r.r_status_id] || {}, closed = s.isclosed === 'Y', isNew = s.isdefault === 'Y' && s.isopen === 'Y', U = ups[r.r_request_id] || [];
      var li = lineOf(r), L = li < 0 ? nullLine : perLine[li];
      out.totals.requests++; L.reqs++; if (li < 0) out.totals.line_null_requests++;
      if (!n) out.totals.unresolved++;
      guids.forEach(function (g) {
        var state, at = null, last = null;
        // 2. the latest Update that is for this element (highest R_RequestUpdate_ID)
        U.forEach(function (u) {
          var l = lines2(u.result), cannot = CANNOT.test(String(l[0] == null ? '' : l[0]).trim()), mine;
          if (n === 1) mine = true;
          else mine = cannot ? String(l[1] == null ? '' : l[1]).trim() === g : (GUID_LINE.test(String(l[0]).trim()) && String(l[0]).trim() === g);   // R3 marker: per-element state comes from the Update rows
          if (mine) last = { cannot: cannot, at: u.created };
        });
        if (closed) { state = 'verified'; at = last ? last.at : (r.closedate || null); }   // 1. (precedence: a closed Request is verified whatever its Updates say)
        else if (last) { state = last.cannot ? 'cannot' : 'done'; at = last.at; }            // R1 marker: the latest Update decides
        else { state = isNew ? 'new' : 'open'; at = isNew ? (r.created || null) : (r.updated || null); }
        if (seen[g]) shared++; seen[g] = 1;
        out.elements[g] = { state: state, request: r.r_request_id, at: at };   // ascending R_Request_ID: the highest wins
        L.guids[g] = 1;
      });
    });

    var T = out.totals;
    Object.keys(out.elements).forEach(function (g) { var e = out.elements[g]; T.elements++; T[e.state]++; });
    function lineRow(src, Lr, planned, lineNo, lineId, pvalue) {
      var cnt = { verified: 0, done: 0, cannot: 0, open: 0, new: 0 }, covered = Object.keys(Lr.guids);
      covered.forEach(function (g) { cnt[out.elements[g].state]++; });
      var pl = planned, cv = BD.of(covered.length), ni = pl.subtract(cv), ex = cv.subtract(pl);
      if (ni.signum() < 0) ni = BD.ZERO; if (ex.signum() < 0) ex = BD.ZERO;
      return { line: lineNo, line_id: lineId, product: pvalue, planned: str(pl), done: cnt.done + cnt.verified, verified: cnt.verified, cannot: cnt.cannot, open: cnt.open, new: cnt.new,
        covered: covered.length, not_issued: str(ni), excess: str(ex), requests: Lr.reqs };
    }
    var totPlanned = BD.ZERO, totNi = BD.ZERO, totEx = BD.ZERO;
    lines.forEach(function (l, i) {
      var row = lineRow(l, perLine[i], bd(l.plannedqty), l.line, l.id, l.pvalue);
      out.lines.push(row); totPlanned = totPlanned.add(bd(row.planned)); totNi = totNi.add(bd(row.not_issued)); totEx = totEx.add(bd(row.excess));
    });
    if (nullLine.reqs) { var nr = lineRow(null, nullLine, BD.ZERO, null, null, null); nr.not_issued = '0'; nr.excess = '0'; out.lines.push(nr); }   // no plan to exceed: the unplanned Requests are just listed
    T.lines = out.lines.length; T.planned = str(totPlanned); T.not_issued = str(totNi); T.excess = str(totEx);
    if (typeof console !== 'undefined' && !o.quiet) console.log('§SITE_PROGRESS_FOLD project=' + projectId + ' requests=' + T.requests + ' unresolved=' + T.unresolved + ' elements=' + T.elements + ' shared=' + shared + ' lines=' + T.lines);
    return out;
  }
  return { siteProgress: siteProgress, STATES: ['verified', 'done', 'cannot', 'open', 'new'] };
});
