// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ws_kernel_web.js - the BROWSER SHELL of the headless kernel (ws_kernel.js). Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §9 (slice S3b) -
//   Witness: W-FILE-IT (erp/tests/witness_file_it.js). It holds NO kernel logic: it answers the few calls ws_kernel.js makes on its shell
//   (need / load / processes / sha256 / uuid / nowMs / perfMs / sqljs / seed / patch / extra) with a browser's means: fetch for the seed and its patch,
//   the script globals for the modules, a synchronous SHA-256 (the kernel hashes inside its synchronous commit; WebCrypto is async only).
//   boot() -> a kernel exactly as ws_kernel.load() gives in node. Nothing is loaded until boot() is called (a page that never files pays nothing).
// The module list is the require closure of ONE filing through the node kernel with ONE process (Import Invoice), in erp/idempiere.html's own order,
// plus processes/support_docgen.js: Import Invoice reaches it through AdProcess.PSUP.docgen, not through a require (node gets it from the folder listing).
(function (global) {
  'use strict';
  var NODE = typeof module !== 'undefined' && module.exports;

  // ── SHA-256 (FIPS 180-4), synchronous, UTF-8 input, hex out. W-FILE-IT F3: equal to node crypto on the kernel's own hashed texts. ──
  var K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(text) {
    var src = new TextEncoder().encode(String(text)), n = src.length, total = (((n + 8) >> 6) + 1) << 6, m = new Uint8Array(total), dv = new DataView(m.buffer);
    m.set(src); m[n] = 0x80;
    dv.setUint32(total - 8, Math.floor(n / 0x20000000)); dv.setUint32(total - 4, (n << 3) >>> 0);
    var h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
    for (var o = 0; o < total; o += 64) {
      var i;
      for (i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        w[i] = (w[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (i = 0; i < 64; i++) {
        var t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
        var t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    var out = '';
    for (var k = 0; k < 8; k++) out += ('0000000' + h[k].toString(16)).slice(-8);
    return out;
  }
  if (NODE) { module.exports = { sha256: sha256 }; return; }   // node needs only the hash (the witness compares it with node crypto)

  var BASE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');   // erp/, wherever the page sits
  // sql.js: the build the ERP page itself runs (erp/idempiere.html boot)
  var SQLJS = 'lib/sql-wasm-fts5.js', WASM = 'lib/sql-wasm-fts5.wasm';
  var FILES = ['layered_registry.js?v=f7c99fea', 'ad_modelval.js?v=ed5acd16', 'ad_rule.js?v=23e6f71b', 'ad_official_indexes.js?v=7c4d4c74', 'ad_index_overlay.js?v=23838774',
    'ad_docvalue_wf.js?v=466ea9c2', 'ad_docvalue_overlay.js?v=bab49af2', 'ad_taxcat_overlay.js?v=30db8713', 'ad_site_task_overlay.js?v=178c8e39', 'seed_patch.js?v=f4fc39bb', 'ad_import_tables.js?v=dc1f904c',
    'ad_process.js?v=26c9c329', 'doc_poster.js?v=0227e96f', 'db_export_safe.js?v=0ed2183f', 'bigdecimal.js?v=5a328efd', 'ad_workflow.js?v=833e0f7c', 'ad_ddl_notnull.js?v=1ac81663',
    'model_layer.js?v=1cab4ae8', 'model_initial_defaults.js?v=a37abb38', 'model_trade.js?v=6ff95ea1', 'model_ctor.js?v=21733d48', 'model_cost.js?v=de6f988e', 'model_match.js?v=3c75280a',
    'model_order.js?v=a840a494', 'model_invoice.js?v=7bca140e', 'model_master.js?v=f42b9f8a', 'model_project.js?v=e3457624', 'model_bankstatement.js?v=54ca47ce',
    'model_requisition.js?v=8d274c75', 'model_banktransfer.js?v=15bdbba8', 'model_depositbatch.js?v=c084831b', 'model_inoutconfirm.js?v=a5f57b3e', 'model_post.js?v=596bb42e',
    'ad_callout.js?v=6f4d6a38', 'callouts/support.js?v=1b96f470', 'callouts/support_stock.js?v=d70887c4', 'callouts/views.js?v=96caec96', 'callouts/currency.js?v=6db32288',
    'callouts/uom.js?v=e0a221fe', 'callouts/pricing.js?v=733047df', 'callouts/tax.js?v=b0d0de46', 'callouts/sqlfn.js?v=bcba3268', 'processes/ImportInvoice.js?v=260e71b6', 'processes/support_docgen.js?v=ec55707a',
    'ws_kernel.js?v=744857ac'];
  // the kernel asks for a module's API by file name; in a page that is the global its script made
  var GLOBALS = { ad_callout: 'AdCallout', ad_rule: 'AdRule', ad_import_tables: 'AdImportTables', ad_index_overlay: 'AdIndexOverlay', ad_docvalue_overlay: 'AdDocValueOverlay',
    ad_taxcat_overlay: 'AdTaxCatOverlay', ad_site_task_overlay: 'AdSiteTaskOverlay', db_export_safe: 'ErpExportSafe', model_layer: 'ModelLayer', ad_modelval: 'AdModelVal' };
  var LOADED = {}, COST = { scripts: 0, scriptsMs: 0, bytes: 0, boots: 0, last: null }, scriptsReady = null;

  function addScript(rel) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + rel; s.async = false;                                      // fetched together, run in list order
      s.onload = function () { LOADED[rel.replace(/\?.*$/, '')] = 1; res(); };
      s.onerror = function () { rej(new Error('could not load ' + rel)); };
      document.head.appendChild(s);
    });
  }
  function scripts() {
    if (!scriptsReady) {
      var t0 = performance.now();
      scriptsReady = Promise.all([SQLJS].concat(FILES).map(addScript)).then(function () {
        COST.scripts = FILES.length + 1; COST.scriptsMs = Math.round(performance.now() - t0);
        if (!global.WsKernel.shell()) global.WsKernel.shell(webShell);         // verifyJournal works as soon as the scripts are in, before any boot()
      },
        function (e) { scriptsReady = null; throw e; });
    }
    return scriptsReady;
  }
  function get(rel, kind) {
    return fetch(BASE + rel).then(function (r) {
      if (!r.ok) { if (kind === 'text' && r.status === 404) return null; throw new Error(rel + ': HTTP ' + r.status); }
      return kind === 'text' ? r.text() : r.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }).then(function (v) { if (v) COST.bytes += v.length; return v; });
  }
  var webShell = {
    need: function (file) {                                                   // the kernel asks by file ('./model_layer.js'): the API its script made, or true for a side-effect module
      var name = String(file).replace(/^\.\//, '').replace(/\.js$/, ''), g = GLOBALS[name] && global[GLOBALS[name]];
      if (!g && !LOADED[name + '.js']) throw new Error('kernel module ' + name + ' is not loaded in this page');
      return g || true;
    },
    processes: function () { /* the ports this page loaded are already registered (FILES); a process not loaded stays unregistered, named by the process answer */ },
    sha256: sha256,
    uuid: function () {
      if (global.crypto.randomUUID) return global.crypto.randomUUID();
      var b = global.crypto.getRandomValues(new Uint8Array(16)), h = []; b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      for (var i = 0; i < 16; i++) h.push(('0' + b[i].toString(16)).slice(-2));
      return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
    },
    nowMs: function () { return Date.now(); }, perfMs: function () { return performance.now(); },
    sqljs: function () { return global.initSqlJs({ locateFile: function () { return BASE + WASM; } }); },
    seed: function () { return get('ad_seed.db', 'bytes'); },
    patch: function () { return get('patches/ad_seed.db.sql', 'text'); },
    extra: function () { return []; }
  };

  // boot() -> Promise<kernel>: a FRESH kernel each call (seed + patch + overlays + build), like ws_kernel.load() in node. The seed is fetched again
  //   (the browser's HTTP cache answers), never kept in memory beside the database made from it (PERF BUDGET: no second copy of a big buffer).
  function boot() {
    var t0 = performance.now(), b0 = COST.bytes, s0 = COST.scriptsMs;
    return scripts().then(function () {
      var K = global.WsKernel, t1 = performance.now();
      K.shell(Object.assign({}, webShell, api.over || {}));                    // api.over: a witness fixes the clock and the ids (ws_kernel shell(over))
      return K.load().then(function (k) {
        var mem = global.performance && performance.memory;
        COST.boots++;
        COST.last = { scripts: COST.scripts, scriptsMs: s0 ? 0 : COST.scriptsMs, bootMs: Math.round(performance.now() - t1), totalMs: Math.round(performance.now() - t0),
          bytes: COST.bytes - b0, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null };
        console.log('§KRN-BROWSER-BOOT n=' + COST.boots + ' scripts=' + COST.last.scripts + ' scriptsMs=' + COST.last.scriptsMs + ' seedAndPatchBytes=' + COST.last.bytes +
          ' bootMs=' + COST.last.bootMs + ' totalMs=' + COST.last.totalMs + ' jsHeapMB=' + COST.last.heapMB);
        return k;
      });
    });
  }

  // shellOnly(): a page that already holds the kernel's file (ws_kernel.js) and only verifies or replays a journal: the shell without loading a script or booting a kernel (§10)
  function shellOnly() { if (!global.WsKernel.shell()) global.WsKernel.shell(webShell); }

  var api = global.WsKernelWeb = { boot: boot, scripts: scripts, shellOnly: shellOnly, sha256: sha256, over: null, cost: COST, FILES: FILES };
})(typeof window !== 'undefined' ? window : this);
