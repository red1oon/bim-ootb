// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
'use strict';
/**
 * erp_seam.js — C0: the five-call engine↔UI seam (ENGINE_CONTRACT.md §1 + §6 C0 / §6.1).
 *   A THIN engine-side wrapper exposing read·dispatch·manifest·verbs·verify over the EXISTING proven
 *   fns — NO new engine logic. Each call maps to a function that already exists; the contract NAMES
 *   them, it does not reimplement them (ENGINE_CONTRACT §7.5).
 *
 *   read     → erp_kernel.query + org-scope filter (mirror poc_wire WIRE-4 / I3)
 *   dispatch → role-gate + owner-gate → erp_kernel.dispatch/apply  ({ok,op_uuid,before,after}|{rejected,why})
 *   manifest → the D2 build/erp/shards/manifest.json (build_shard_manifest.js)
 *   verbs    → erp_kernel.handlers registry reflection, capability-filtered
 *   verify   → erp_kernel.replay ×2 (§1 "check the chain / replay hash") → {chainOk,len,tip}
 *
 * makeSeam(cfg) where cfg = {
 *   projDb,         // the erp_kernel projection (sql.js db) — kernel_ops + journal (dispatch/verify)
 *   adQ,            // fn(sql,params)->rows[] over the master db (read)
 *   factQ,          // optional fn(sql,params)->rows[] over the Fact_Acct bundle
 *   manifestPath,   // path to the D2 shard manifest.json
 *   wfmc,           // the state machine (for dispatch legality) — supplied, not owned
 *   newDb           // () -> fresh empty sql.js db (verify replays into it)
 * }
 */
// node: require fs + the kernel. browser: fs is absent (manifest() then needs cfg.manifestObj) and the
// kernel arrives as window.ERPKernel. Guarded so a browser <script> load doesn't throw on require.
var fs = (typeof require !== 'undefined') ? require('fs') : null;
var K = (typeof require !== 'undefined') ? require('./erp_kernel')
        : (typeof window !== 'undefined' ? window.ERPKernel : null);
// BigDecimal for EXACT money/qty compare in the admission guard (never raw JS Number). Browser: window.BigDecimal.
var BD = (typeof window !== 'undefined' && window.BigDecimal) ? window.BigDecimal
       : ((typeof require !== 'undefined') ? (function () { try { return require('./bigdecimal'); } catch (e) { return null; } })() : null);

function projQ(db, sql, params) { return K.query(db, sql, params || []); }

function makeSeam(cfg) {
  var projDb = cfg.projDb, adQ = cfg.adQ, factQ = cfg.factQ || null;
  var manifestPath = cfg.manifestPath, wfmc = cfg.wfmc, newDb = cfg.newDb;

  // ── read(query, ctx) — master/projection rows, SCOPED to ctx.allowOrgs (I3) ──────────────────────
  // query = { table, columns?, where?, params?, orderBy?, db? }. Out-of-scope rows are dropped
  // (post-fetch partition, mirror poc_wire) so a role with no access to the data org gets [] — the UI
  // cannot widen its own scope. A table the manifest marks unresident, with no rows, returns a STUB (I5).
  function read(query, ctx) {
    ctx = ctx || {};
    var cols = query.columns || '*';
    var sql = 'SELECT ' + cols + ' FROM ' + query.table +
              (query.where ? ' WHERE ' + query.where : '') +
              (query.orderBy ? ' ORDER BY ' + query.orderBy : '');
    var q = (query.db === 'proj') ? function (s, p) { return projQ(projDb, s, p); } : adQ;
    var rows = q(sql, query.params || []);
    var allow = ctx.allowOrgs;
    if (allow && allow !== '*' && rows.length) {
      // locate the org column case-insensitively (bindings return the declared case: ad_org_id/AD_Org_ID).
      var orgKey = Object.keys(rows[0]).filter(function (k) { return /^ad_org_id$/i.test(k); })[0];
      if (orgKey) {
        var set = allow.map(Number);
        rows = rows.filter(function (r) { return set.indexOf(Number(r[orgKey])) >= 0; });
      }
    }
    if (rows.length === 0 && query.coldStub) {
      return [{ __stub: true, table: query.table, reason: 'cold-fetching' }];   // never a guessed value (I5)
    }
    return rows;
  }

  // ── dispatch(intent, ctx) — the SOLE write path; gated engine-side, deterministic+signed (I4) ────
  // Returns {ok, op_uuid, before, after} or {rejected, why}. ctx{actor,pubKey,roleId,allowOrgs,role}.
  // current threshold of an admission rule = the last SET_RULE for that rule on the SAME signed op-log.
  function currentRuleT(ruleId) {
    var rows = projQ(projDb, "SELECT parameters FROM kernel_ops WHERE op_type='SET_RULE' AND undone=0 ORDER BY rowid");
    var T = null;
    rows.forEach(function (r) { try { var p = JSON.parse(r.parameters); var pl = p.payload || p; if (pl && pl.rule === ruleId && pl.T != null) T = pl.T; } catch (e) {} });
    return T;
  }

  function dispatch(intent, ctx) {
    ctx = ctx || {};
    var table = intent.table, action = intent.action;
    // (a) role capability gate (mirror poc_wire.mayRun): ctx.role.actions = ["table:action", …]
    if (ctx.role && ctx.role.actions) {
      var key = table + ':' + action;
      if (ctx.role.actions.indexOf(key) < 0) return { rejected: true, why: 'role-no-grant', detail: key };
    }
    // (a2) ADMISSION RULE (gated lifecycle): an editable, SIGNED rule may gate this transition. Read the
    // rule's current threshold from the SAME signed op-log (last SET_RULE) and compare the doc's attribute
    // EXACTLY (BigDecimal). Engine-side → the UI cannot bypass it. No rule set → ungated (default-allow).
    var ar = cfg.admissionRules && cfg.admissionRules[table + ':' + action];
    if (ar) {
      var T = currentRuleT(ar.ruleId);
      if (T != null) {
        var vr = adQ('SELECT ' + ar.col + ' AS v FROM ' + ar.table + ' WHERE ' + ar.key + ' = ?', [intent.id]);
        var val = vr.length ? vr[0].v : null;
        if (val != null) {
          var pass = BD ? (ar.cmp === 'lte' ? BD.of(String(val)).compareTo(BD.of(String(T))) <= 0
                                            : BD.of(String(val)).compareTo(BD.of(String(T))) >= 0)
                        : (ar.cmp === 'lte' ? Number(val) <= Number(T) : Number(val) >= Number(T));
          if (!pass) return { rejected: true, why: 'rule-guard',
            detail: ar.ruleId + ' ' + ar.col + '=' + val + (ar.cmp === 'lte' ? ' > T=' : ' < T=') + T };
        }
      }
    }
    // (b) owner-gate (G-SINGLE-WRITER): a mutation on an already-owned doc by a different actor is refused.
    if (intent.uuid) {
      var own = projQ(projDb, 'SELECT user_tag FROM kernel_ops WHERE output_guid=? ORDER BY rowid ASC LIMIT 1', [intent.uuid]);
      if (own.length && own[0].user_tag != null && own[0].user_tag !== ctx.actor) {
        return { rejected: true, why: 'owner-gate', detail: 'owner=' + own[0].user_tag + ' actor=' + ctx.actor };
      }
    }
    // (c) apply through the kernel (state-machine legal → handler → kernel-owned write).
    var cellCtx = { wfmc: wfmc, guards: [], query: function (s, p) { return projQ(projDb, s, p); },
                    actor: ctx.actor || 'local', baseTs: intent.baseTs || 5000 };
    var doc = {}; Object.keys(intent).forEach(function (k) { doc[k] = intent[k]; });
    var r = K.dispatch(projDb, cellCtx, doc);
    if (!r.ok) return { rejected: true, why: r.stage + ':' + r.reason };
    var guid = r.ids[r.ids.length - 1];
    var row = projQ(projDb, 'SELECT op_uuid, parameters FROM kernel_ops WHERE output_guid=? ORDER BY rowid DESC LIMIT 1', [guid]);
    var rich = row.length ? JSON.parse(row[0].parameters) : {};
    return { ok: true, op_uuid: row.length ? row[0].op_uuid : null, before: rich.before != null ? rich.before : null,
             after: rich.after != null ? rich.after : null, to: r.to };
  }

  // ── manifest(ctx) — the D2 gravity-ranked shard manifest (engine-side policy; UI only fetches) ──
  function manifest(ctx) {
    // browser passes the parsed manifest as cfg.manifestObj (no fs); node reads the file.
    var m = cfg.manifestObj || JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // NB: facet name is `menuGroup` here vs §1's `gravityRank` — JOINT re-freeze flag (ENGINE_CONTRACT §6.1).
    return { version: m.version, axis: m.axis, shards: m.shards, tables: m.tables };
  }

  // ── verbs(ctx) — the legal actions from the handler registry, capability-filtered ────────────────
  function verbs(ctx, docType) {
    var hs = K.handlers(docType);
    if (ctx && ctx.role && ctx.role.actions) {
      hs = hs.filter(function (h) { return ctx.role.actions.indexOf(h.docType + ':' + h.action) >= 0; });
    }
    return hs.map(function (h) { return { action: h.action, label: h.action, docType: h.docType }; });
  }

  // ── verify(ctx) — replay the op-log twice; trust == identical rebuild (§1 replay hash) ───────────
  function verify(ctx) {
    var fa = newDb(); var ra = K.replay(projDb, fa);
    var fb = newDb(); var rb = K.replay(projDb, fb);
    if (fa.close) fa.close(); if (fb.close) fb.close();
    return { chainOk: ra.hash === rb.hash, len: ra.ops, tip: ra.hash };
  }

  function surface() {
    return [
      { call: 'read',     maps: 'erp_kernel.query + allowOrgs scope (poc_wire WIRE-4)' },
      { call: 'dispatch', maps: 'role-gate + owner-gate -> erp_kernel.dispatch/apply' },
      { call: 'manifest', maps: 'D2 build_shard_manifest.js (shards/manifest.json)' },
      { call: 'verbs',    maps: 'erp_kernel.handlers registry reflection' },
      { call: 'verify',   maps: 'erp_kernel.replay x2 (replay-hash equality)' }
    ];
  }

  return { read: read, dispatch: dispatch, manifest: manifest, verbs: verbs, verify: verify, surface: surface };
}

// UMD tail — node tests + browser live host (window.ERPSeam).
if (typeof module !== 'undefined' && module.exports) { module.exports = { makeSeam: makeSeam }; }
if (typeof window !== 'undefined') { window.ERPSeam = { makeSeam: makeSeam }; }
