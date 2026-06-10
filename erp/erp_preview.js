// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * erp_preview.js — the Posting-Preview seam (POSTING_PREVIEW_PANEL.md §3).
 *   previewDocAction(recordRef, ctx, dbs) runs the FROZEN, oracle-anchored fold verb (doc_poster, W-DOC-
 *   POSTER) against the loaded db and returns the readPostings-shaped VM with source:'preview' — the
 *   to-the-cent journal the DocAction WOULD generate, BEFORE/at Complete, WITHOUT writing a row.
 *
 *   Class A claim only (the audit's grail tier): the manifest is fold-vs-`fact_acct` (W-DOC-POSTER ==
 *   fact_acct(318) to the cent). The draft path (basis='order') is labeled "projected — no oracle".
 *
 *   REUSE, don't fork: render via window.AcctsPosted.buildPostedVM/mount (the SAME renderer the Accts-
 *   Posted panel uses); derive via window.DocPoster; resolve via window.PostResolver. The gate MIRRORS
 *   erp_postings.js:71-85 verbatim (same SQL, same reason strings, same verdict) — a later cleanup may
 *   extract a shared gate; replicated here to avoid editing the frozen read-fold.
 *
 *   PURE: no commitGroup, no row write, no Date.now/Math.random — a read-only projection.
 */
(function () {

  // ── sql.js facade: wrap a sql.js Database as a better-sqlite3-style { prepare(sql).get/.all }. ──
  // doc_poster / post_resolver are written against .prepare().get/.all (better-sqlite3 in node tests);
  // this lets the SAME verbs run unchanged over the browser's sql.js handle. Positional (?) AND named
  // (@name) params both supported; named keys get the '@' sigil sql.js expects.
  function facade(sdb) {
    function bind(stmt, params) {
      if (params == null) return;
      if (Array.isArray(params)) { stmt.bind(params); return; }                 // positional [a,b]
      if (typeof params === 'object') {                                          // named {k:v} -> @k
        var o = {}; Object.keys(params).forEach(function (k) { o['@' + k] = params[k]; }); stmt.bind(o); return;
      }
      stmt.bind([params]);                                                       // scalar -> single positional ?
    }
    return {
      prepare: function (sql) {
        return {
          get: function (params) { var s = sdb.prepare(sql); try { bind(s, params); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
          all: function (params) { var s = sdb.prepare(sql); var r = []; try { bind(s, params); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } }
        };
      }
    };
  }

  function refused(reason) {
    return { visible: false, posted: false, lines: [], balanced: false, source: 'none', coverage: 'absent', note: null, reason: reason };
  }
  function noData() {
    return { visible: true, posted: false, lines: [], balanced: false, source: 'preview', coverage: 'absent',
             note: 'preview needs GardenWorld data (document + acct config) in the loaded db', reason: null };
  }

  /**
   * previewDocAction(recordRef, ctx, dbs, opts) -> readPostings-shaped VM result (source:'preview').
   *   recordRef = { table:'C_Order'|'C_Invoice', id, ad_org_id? }
   *   ctx       = { role:{id}, allowOrgs }      (AcctsPosted.buildCtx output — SAME ctx as readPostings)
   *   dbs       = { adQ: fn(sql,params)->rows[],  docDb: <.prepare handle> }
   *   opts      = { schema?, R?, DocPoster? }    (R/DocPoster injected for tests; else window.*)
   */
  function previewDocAction(recordRef, ctx, dbs, opts) {
    opts = opts || {};
    var schema = opts.schema || 101;
    var R = opts.R || (typeof window !== 'undefined' && window.PostResolver);
    var DP = opts.DocPoster || (typeof window !== 'undefined' && window.DocPoster);
    if (!R || !DP) throw new Error('erp_preview: PostResolver/DocPoster unavailable');

    // ── GATE — mirrors erp_postings.js:71-85 (same SQL, same reasons, same verdict; zero-leak). ──
    var roleId = ctx && ctx.role && ctx.role.id;
    var rr = dbs.adQ('SELECT isshowacct FROM ad_role WHERE ad_role_id=?', [roleId]);
    var isshowacct = rr.length ? rr[0].isshowacct : null;
    if (isshowacct !== 'Y') return refused('role-not-accounting');
    var allow = ctx.allowOrgs;
    if (allow && allow !== '*' && recordRef.ad_org_id != null &&
        allow.map(Number).indexOf(Number(recordRef.ad_org_id)) < 0) return refused('out-of-scope');

    // ── DERIVE — consume the shipped, oracle-anchored doc_poster verb (Gap-A); NEVER re-derive. ──
    var res;
    try { res = DP.derivePostings(dbs.docDb, recordRef, schema, R); }
    catch (e) { return noData(); }
    if (!res || !res.lines.length) return noData();

    var coverage = res.absent.length ? 'partial' : 'complete';
    var note = 'PREVIEW — not yet posted' +
      (res.basis === 'order' ? ' (projected from draft order — no oracle)' : '') +
      (res.absent.length ? ' · unresolved: ' + res.absent.join(',') : '');
    return { visible: true, posted: true, lines: res.lines, balanced: res.balanced,
             source: 'preview', coverage: coverage, note: note, reason: null };
  }

  /**
   * openPreview — the live-host entry: session+ref → ctx → previewDocAction → VM → DOM. Reuses
   * AcctsPosted for buildCtx + buildPostedVM + mount/mountAccordion (NO new render code).
   */
  function openPreview(recordRef, session, dbs, opts) {
    opts = opts || {};
    var AP = opts.AcctsPosted || (typeof window !== 'undefined' && window.AcctsPosted);
    if (!AP) throw new Error('erp_preview: AcctsPosted unavailable');
    var ctx = AP.buildCtx(session);
    var result = previewDocAction(recordRef, ctx, dbs, opts);
    var vm = AP.buildPostedVM(result);
    var render = opts.accordion ? AP.mountAccordion : AP.mount;
    return { result: result, vm: vm, node: render(vm, opts) };
  }

  var _api = { previewDocAction: previewDocAction, openPreview: openPreview, facade: facade };
  if (typeof window !== 'undefined') window.ERPPreview = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
})();
