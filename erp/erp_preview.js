// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * erp_preview.js — the Posting-Preview seam (POSTING_PREVIEW_PANEL.md §3).
 *   previewDocAction(recordRef, ctx, dbs) returns the readPostings-shaped VM with source:'preview' — the journal the
 *   DocAction WOULD generate, BEFORE/at Complete, WITHOUT writing a row. W-PREVIEW-IS-POSTING: for every table that has a
 *   model_post Doc class the lines ARE what the REAL poster writes (ModelPost.previewFacts: post() on a Trx that is never
 *   committed) and a named refusal of the real poster is shown as the refusal text. ONE implementation: doc_poster's
 *   derive* is consulted ONLY for what model_post has no class for (A_Asset_*, C_ProjectIssue, M_Requisition, C_Cash,
 *   derive-only plugin classes) and for the draft-order projection (basis='order', "projected — no oracle"; legacy
 *   Doc_Order writes no facts, so there is nothing real to show).
 *
 *   REUSE, don't fork: render via window.AcctsPosted.buildPostedVM/mount (the SAME renderer the Accts-
 *   Posted panel uses); post via window.ModelPost (+ window.ModelLayer.Trx from dbs.withTrx). The gate MIRRORS
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
  function noData(why) {
    return { visible: true, posted: false, lines: [], balanced: false, source: 'preview', coverage: 'absent',
             note: why || 'preview needs GardenWorld data (document + acct config) in the loaded db', reason: null };
  }

  /**
   * previewDocAction(recordRef, ctx, dbs, opts) -> readPostings-shaped VM result (source:'preview').
   *   recordRef = { table:'C_Order'|'C_Invoice', id, ad_org_id? }
   *   ctx       = { role:{id}, allowOrgs }      (AcctsPosted.buildCtx output — SAME ctx as readPostings)
   *   dbs       = { adQ: fn(sql,params)->rows[], docDb: <.prepare handle>, withTrx: fn(cb(query, env)) }   (withTrx = crud_overlay.withModelTrx: the Trx it builds is never committed)
   *   opts      = { schema?, R?, DocPoster?, ModelPost?, ModelLayer? }    (injected for tests; else window.*)
   */
  function previewDocAction(recordRef, ctx, dbs, opts) {
    opts = opts || {};
    var schema = opts.schema || 101;
    var W = (typeof window !== 'undefined') ? window : {};
    var MP = opts.ModelPost || W.ModelPost, ML = opts.ModelLayer || W.ModelLayer;

    // ── GATE — mirrors erp_postings.js:71-85 (same SQL, same reasons, same verdict; zero-leak). ──
    var roleId = ctx && ctx.role && ctx.role.id;
    var rr = dbs.adQ('SELECT isshowacct FROM ad_role WHERE ad_role_id=?', [roleId]);
    var isshowacct = rr.length ? rr[0].isshowacct : null;
    if (isshowacct !== 'Y') return refused('role-not-accounting');
    var allow = ctx.allowOrgs;
    if (allow && allow !== '*' && recordRef.ad_org_id != null &&
        allow.map(Number).indexOf(Number(recordRef.ad_org_id)) < 0) return refused('out-of-scope');

    var table = String(recordRef.table || recordRef.doc_type), lc = table.toLowerCase();
    var id = Number(recordRef.id != null ? recordRef.id : recordRef.record_id);
    var withTrx = dbs.withTrx;

    // ── REAL POSTER — every table model_post has a Doc class for. A C_Order has no posting of its own (Doc_Order writes no facts):
    //   it previews its generated invoice, exactly as before; with no invoice it falls through to the draft projection below. ──
    var DPo = opts.DocPoster || W.DocPoster, postTable = lc, postId = id, basis = lc;
    if (lc === 'c_order' && DPo && dbs.docDb) { var inv = null; try { inv = DPo.invoiceForOrder(dbs.docDb, id); } catch (e) { inv = null; } if (inv != null) { postTable = 'c_invoice'; postId = Number(inv); basis = 'invoice'; } else postTable = null; }
    if (postTable && MP && typeof MP.hasDocClass === 'function' && MP.hasDocClass(postTable)) {
      if (typeof withTrx !== 'function' || !ML) return noData('posting engine (model layer) not available — the Preview shows what the real poster writes, never a second derivation');
      var out = null;
      try {
        out = withTrx(function (q, env) {                                     // a Trx that is dropped: NEVER committed (withModelTrx / witness seam)
          var trx = new ML.Trx(q, env), pf = MP.previewFacts(trx, postTable, postId);
          if (pf.state === 'absent') return { absent: true };
          var bySch = {}, order = []; pf.facts.forEach(function (f) { var k = String(f.c_acctschema_id); if (!bySch[k]) { bySch[k] = []; order.push(k); } bySch[k].push(f); });
          var use = bySch[String(schema)] ? String(schema) : (order.length ? order[0] : null), elem = {};
          var lines = (use ? bySch[use] : []).map(function (f) {
            var e = elem[f.account_id]; if (!e) { var r = trx.q('SELECT value, name FROM c_elementvalue WHERE c_elementvalue_id=?', [f.account_id])[0] || {}; e = elem[f.account_id] = { value: r.value != null ? r.value : String(f.account_id), name: r.name || '' }; }
            return { account_id: f.account_id, value: e.value, name: e.name, amtacctdr: Number(f.amtacctdr || 0), amtacctcr: Number(f.amtacctcr || 0), gl_category_id: f.gl_category_id };
          });
          return { pf: pf, lines: lines, schema: use == null ? null : Number(use), others: order.length - (use ? 1 : 0), requested: Number(schema) };
        });
      } catch (e) { return noData(); }
      if (!out) return noData();
      if (out.absent) return noData();
      if (typeof console !== 'undefined') console.log(out.pf.say[out.pf.say.length - 1]);
      var pf = out.pf;
      if (!pf.posted) return { visible: true, posted: false, lines: [], balanced: false, source: 'preview', coverage: 'absent',
        note: 'PREVIEW — Complete would not post this document: ' + pf.refusal, reason: null, schema: null };
      if (!out.lines.length) return { visible: true, posted: false, lines: [], balanced: false, source: 'preview', coverage: 'complete',
        note: 'PREVIEW — Complete posts this document with no accounting facts', reason: null, schema: null };
      var c = function (x) { return Math.round(x * 100); }, dr = out.lines.reduce(function (a, l) { return a + c(l.amtacctdr); }, 0), cr = out.lines.reduce(function (a, l) { return a + c(l.amtacctcr); }, 0);
      return { visible: true, posted: true, lines: out.lines, balanced: dr === cr, source: 'preview', coverage: 'complete', reason: null, schema: out.schema,
        note: 'PREVIEW — not yet posted' + (basis === 'invoice' ? ' (the order\'s generated invoice)' : '') +
              (out.schema !== out.requested ? ' · schema ' + out.schema + ' (none posted for ' + out.requested + ')' : '') + (out.others > 0 ? ' · ' + out.others + ' more schema(s) posted' : '') };
    }

    // ── NO model_post class (A_Asset_*, C_ProjectIssue, M_Requisition, C_Cash, derive-only plugin classes) and the draft-order projection: the
    //   doc_poster fold is the only source - it has NO model_post equivalent, so it is not a second implementation of anything the real poster does. ──
    //   Residual, named: a host WITHOUT window.ModelPost (headless poc_preview_demo.js; no shipped host) also lands here for every table - idempiere.html always loads
    //   model_post.js, so the live Preview never takes this path for a model_post-handled table (witness_preview_is_posting P6). ──
    var R = opts.R || W.PostResolver;
    if (!R || !DPo) throw new Error('erp_preview: PostResolver/DocPoster unavailable');
    var res;
    try { res = DPo.derivePostings(dbs.docDb, recordRef, schema, R); }
    catch (e) { return noData(); }
    if (!res || !res.lines.length) return noData();

    var coverage = res.absent.length ? 'partial' : 'complete';
    var note = 'PREVIEW — not yet posted' +
      (res.basis === 'order' ? ' (projected from draft order — no oracle)' : (MP ? ' (no model_post class — doc_poster fold)' : ' (model layer not loaded — doc_poster fold)')) +
      (res.absent.length ? ' · unresolved: ' + res.absent.join(',') : '');
    return { visible: true, posted: true, lines: res.lines, balanced: res.balanced,
             source: 'preview', coverage: coverage, note: note, reason: null, schema: schema };
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
    // mount() returns a DOM node; mountAccordion() returns a CONTROLLER {node,header,body,…}. The live host
    // (idempiere.openPreviewFor) appendChild's `.node` directly, so ALWAYS hand back a real DOM node — unwrap
    // the controller. Without this, the accordion path passed the controller object to appendChild → the
    // preview drawer threw on render and never showed (J6 surfacing bug). Keep the controller available too.
    var rendered = render(vm, opts);
    var node = (rendered && rendered.nodeType) ? rendered : (rendered && rendered.node) || rendered;
    return { result: result, vm: vm, node: node, controller: (rendered && rendered.node) ? rendered : null };
  }

  var _api = { previewDocAction: previewDocAction, openPreview: openPreview, facade: facade };
  if (typeof window !== 'undefined') window.ERPPreview = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
})();
