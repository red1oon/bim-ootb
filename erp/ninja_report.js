// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_report.js — NinjaExcel Report RUN verb for the pill: template .xlsx (Input/Process/Output/BACKUP) + From/To -> painted .xlsx + one-page PDF,
// all in the browser over the open client db (sql.js). Engine = ninja_template.js / ninja_template_xlsx.js / ninja_calc.js / ninja_pdf.js (== bim-compiler build/erp,
// source of truth: sync out, never edit the copies). Libraries (vendored, MIT): vendor/exceljs.min.js, vendor/pdfkit.standalone.js; fonts: fonts/ (SIL OFL).
// Spec: bim-compiler prompts/NINJAEXCEL_TEMPLATE_ENGINE.md §TB-DEMO / §TB-FILM. Witness: bim-compiler scripts/ninja_template/W40_BrowserReport.js.
// §-log: §NINJA_REPORT_LOAD / §NINJA_REPORT_RUN / §NINJA_REPORT_DONE (primary evidence).
(function (global) {
  'use strict';
  var _loaded = null, _fonts = null;
  function inject(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error(src + ' failed to load')); };
      document.head.appendChild(s);
    });
  }
  function seq(list) { return list.reduce(function (p, f) { return p.then(function () { return f(); }); }, Promise.resolve()); }
  function ensureLibs(base) {
    if (_loaded) return _loaded;
    var t0 = Date.now(), need = [];
    if (!global.ExcelJS) need.push('vendor/exceljs.min.js?v=1');
    if (!global.PDFDocument) need.push('vendor/pdfkit.standalone.js?v=1');
    if (!global.BigDecimal) need.push('bigdecimal.js?v=1');
    if (!global.NinjaCalc) need.push('ninja_calc.js?v=1');
    if (!global.NinjaTemplate) need.push('ninja_template.js?v=1');
    if (!global.NinjaTemplateXlsx) need.push('ninja_template_xlsx.js?v=1');
    if (!global.NinjaPdf) need.push('ninja_pdf.js?v=1');
    _loaded = seq(need.map(function (s) { return function () { return inject(base + s); }; })).then(function () {
      console.log('§NINJA_REPORT_LOAD scripts=' + need.length + ' ms=' + (Date.now() - t0)); return true;
    }).catch(function (e) { _loaded = null; throw e; });
    return _loaded;
  }
  var FONT_FILES = { lr: 'LiberationSans-Regular.ttf', lb: 'LiberationSans-Bold.ttf', tr: 'NotoSansThai-Regular.ttf', tb: 'NotoSansThai-Bold.ttf', ar: 'NotoSansLao-Regular.ttf', ab: 'NotoSansLao-Bold.ttf' };
  function ensureFonts(base) {
    if (_fonts) return _fonts;
    var keys = Object.keys(FONT_FILES);
    _fonts = Promise.all(keys.map(function (k) {
      return fetch(base + 'fonts/' + FONT_FILES[k]).then(function (r) { if (!r.ok) throw new Error('font ' + FONT_FILES[k] + ' HTTP ' + r.status); return r.arrayBuffer(); });
    })).then(function (bufs) { var m = {}; keys.forEach(function (k, i) { m[k] = new Uint8Array(bufs[i]); }); return m; }).catch(function (e) { _fonts = null; throw e; });
    return _fonts;
  }
  // font resolver: script-aware, returns the font bytes (pdfkit accepts Uint8Array) - Thai/Lao letters get their own face, everything else Liberation Sans (bold/regular)
  function resolver(F) {
    return { resolve: function (name, bold, italic, text) {
      if (/[ก-๛]/.test(text)) return bold ? F.tb : F.tr;
      if (/[຀-໿]/.test(text)) return bold ? F.ab : F.ar;
      return bold ? F.lb : F.lr;
    } };
  }
  // sql.js -> the better-sqlite3 surface the engine uses: db.prepare(sql).raw().all(...p) / .get(...p); db.function(name, opts, fn)
  function shim(sqljsDb) {
    function run(sql, params) {
      var st = sqljsDb.prepare(sql), rows = [];
      try { if (params && params.length) st.bind(params); while (st.step()) rows.push(st.get()); } finally { st.free(); }
      return rows;
    }
    return {
      prepare: function (sql) { return { raw: function () { return { all: function () { return run(sql, [].slice.call(arguments)); }, get: function () { return run(sql, [].slice.call(arguments))[0]; } }; } }; },
      function: function (name, opts, fn) {                    // sql.js takes the arity from fn.length: a variadic fn is registered for 1..6 arguments
        if (fn.length > 0) return sqljsDb.create_function(name, fn);
        var w = [function (a) { return fn(a); }, function (a, b) { return fn(a, b); }, function (a, b, c) { return fn(a, b, c); },
                 function (a, b, c, d) { return fn(a, b, c, d); }, function (a, b, c, d, e) { return fn(a, b, c, d, e); }, function (a, b, c, d, e, f) { return fn(a, b, c, d, e, f); }];
        w.forEach(function (f) { sqljsDb.create_function(name, f); });
      }
    };
  }
  function clientOf(sqljsDb) {
    var r = sqljsDb.exec('SELECT ad_client_id FROM ad_client WHERE ad_client_id>0 ORDER BY ad_client_id LIMIT 1');
    return r.length && r[0].values.length ? Number(r[0].values[0][0]) : null;
  }
  // opts: { db (sql.js Database), template (ArrayBuffer|Uint8Array), from:'YYYY-MM-DD', to:'YYYY-MM-DD', base:'' (url prefix of erp/), XLSX (SheetJS), clientId? }
  function run(opts) {
    var base = opts.base || '', t0 = Date.now();
    return Promise.all([ensureLibs(base), ensureFonts(base)]).then(function (all) {
      var F = all[1], H = global.NinjaTemplateXlsx, T = global.NinjaTemplate, C = global.NinjaCalc, R = global.NinjaPdf;
      var tpl = opts.template instanceof Uint8Array ? opts.template : new Uint8Array(opts.template);
      var withDb = opts.withDb || function (fn) { return fn(opts.db); };       // pill passes __crud.withTipDb so documents entered THIS session (signed op-log tip) are visible to the report's SQL
      var client = opts.clientId != null ? opts.clientId : clientOf(opts.db);   // ad_client rows are not touched by sales: main is enough
      if (client == null) throw new Error('no client in the open database (ad_client has no row > 0)');
      var from = opts.from + ' 00:00:00.0', to = opts.to + ' 00:00:00.0';
      return H.loadModel(global.ExcelJS, tpl).then(function (m) {
        var t1 = Date.now();
        var S = withDb(function (raw) {
          var db = shim(raw); T.registerPgBuiltins(function (n, f) { db.function(n, { varargs: true }, f); });
          return T.runTemplate(m, T.sqliteExecutor(db, global.BigDecimal), { XLSX: opts.XLSX || global.XLSX, clientId: client, orgId: 0, from: from, to: to });
        });
        var runMs = Date.now() - t1;
        console.log('§NINJA_REPORT_RUN client=' + client + ' from=' + opts.from + ' to=' + opts.to + ' statements=' + S.sqlcount + ' ms=' + runMs);
        var cs = C.evaluateSheet(m, 'Output');
        return H.saveModel(global.ExcelJS, m, tpl, ['Output', 'Process']).then(function (xl) {
          return R.renderSheet(global.PDFDocument, m, { profile: 'excel', fonts: resolver(F), formatNumber: function (f, v) { return (opts.XLSX || global.XLSX).SSF.format(f, v); } }).then(function (r) {
            var out = { xlsx: new Uint8Array(xl), pdf: new Uint8Array(r.pdf), model: m, facts: { client: client, statements: S.sqlcount, runMs: runMs, formulas: cs.evaluated, formulaErrors: cs.errors, pdfPage: r.page, pdfBytes: r.pdf.length, totalMs: Date.now() - t0 } };
            console.log('§NINJA_REPORT_DONE client=' + client + ' formulas=' + cs.evaluated + ' errors=' + cs.errors + ' xlsxBytes=' + out.xlsx.length + ' pdfBytes=' + out.pdf.length + ' page=' + r.page.map(function (x) { return x.toFixed(2); }).join('x') + ' totalMs=' + out.facts.totalMs);
            return out;
          });
        });
      });
    });
  }
  global.NinjaReport = { run: run, ensureLibs: ensureLibs, shim: shim, clientOf: clientOf };
})(typeof self !== 'undefined' ? self : this);
