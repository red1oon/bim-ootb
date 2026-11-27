// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_report.js — NinjaExcel Report RUN verb for the pill: template .xlsx (Input/Process/Output/BACKUP) + From/To -> painted .xlsx, and a one-page PDF ONLY when asked for,
// all in the browser over the open client db (sql.js). Engine = ninja_template.js / ninja_template_xlsx.js / ninja_calc.js / ninja_preflight.js / ninja_pdf.js (source of truth:
// bim-compiler build/erp, synced out byte for byte, never edited in a copy). Libraries (vendored, MIT): ExcelJS, PDFKit; fonts SIL OFL. Where each lives is the host's choice (opts.paths).
// Spec: bim-compiler prompts/NINJAEXCEL_TEMPLATE_ENGINE.md §TB-PORT, prompts/SHEET_FRONT_DOOR.md §19. Witnesses: bim-compiler scripts/ninja_template/W40/W41/W48, bim-ootb erp/tests/witness_ninja_pdf.js.
// §-log: §NINJA_REPORT_LOAD (what was fetched, when) / §NINJA_REPORT_RUN / §NINJA_REPORT_DONE / §NINJA_REPORT_PDF (primary evidence).
(function (global) {
  'use strict';
  var _engine = null, _pdf = null, _fonts = null;
  function inject(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error(src + ' failed to load')); };
      document.head.appendChild(s);
    });
  }
  function seq(list) { return list.reduce(function (p, f) { return p.then(function () { return f(); }); }, Promise.resolve()); }
  // opts.base = url prefix of the engine files; opts.paths = { exceljs, pdfkit, fonts (folder, ends in /), bigdecimal } - defaults keep the old one-folder layout (base + vendor/, fonts/)
  function paths(opts) {
    var b = (opts && opts.base) || '', p = (opts && opts.paths) || {};
    return { base: b, exceljs: p.exceljs || b + 'vendor/exceljs.min.js', pdfkit: p.pdfkit || b + 'vendor/pdfkit.standalone.js', fonts: p.fonts || b + 'fonts/', bigdecimal: p.bigdecimal || b + 'bigdecimal.js' };
  }
  function load(kind, list) {
    var t0 = Date.now(), need = list.filter(function (x) { return !global[x[0]]; });
    return seq(need.map(function (x) { return function () { return inject(x[1]); }; })).then(function () {
      console.log('§NINJA_REPORT_LOAD part=' + kind + ' scripts=' + need.length + ' ms=' + (Date.now() - t0) + (need.length ? ' files=' + need.map(function (x) { return x[1].split('/').pop(); }).join(',') : '')); return true;
    });
  }
  // the report itself: ExcelJS + the engine (no PDF writer, no fonts)
  function ensureLibs(opts) {
    if (typeof opts === 'string') opts = { base: opts };
    if (_engine) return _engine;
    var P = paths(opts);
    _engine = load('engine', [['ExcelJS', P.exceljs], ['BigDecimal', P.bigdecimal], ['NinjaCalc', P.base + 'ninja_calc.js'], ['NinjaTemplate', P.base + 'ninja_template.js'],
      ['NinjaTemplateXlsx', P.base + 'ninja_template_xlsx.js'], ['NinjaPreflight', P.base + 'ninja_preflight.js']]).catch(function (e) { _engine = null; throw e; });
    return _engine;
  }
  // the PDF writer + its fonts: fetched the first time a PDF is asked for, never before
  var FONT_FILES = { lr: 'LiberationSans-Regular.ttf', lb: 'LiberationSans-Bold.ttf', tr: 'NotoSansThai-Regular.ttf', tb: 'NotoSansThai-Bold.ttf', ar: 'NotoSansLao-Regular.ttf', ab: 'NotoSansLao-Bold.ttf' };
  function ensurePdf(opts) {
    if (_pdf) return _pdf;
    var P = paths(opts), keys = Object.keys(FONT_FILES);
    _fonts = Promise.all(keys.map(function (k) {
      return fetch(P.fonts + FONT_FILES[k]).then(function (r) { if (!r.ok) throw new Error('font ' + FONT_FILES[k] + ' HTTP ' + r.status); return r.arrayBuffer(); });
    })).then(function (bufs) { var m = {}, n = 0; keys.forEach(function (k, i) { m[k] = new Uint8Array(bufs[i]); n += bufs[i].byteLength; }); console.log('§NINJA_REPORT_LOAD part=fonts files=' + keys.length + ' bytes=' + n); return m; });
    _pdf = Promise.all([load('pdf', [['PDFDocument', P.pdfkit], ['NinjaPdf', P.base + 'ninja_pdf.js']]), _fonts]).then(function (all) { return all[1]; })
      .catch(function (e) { _pdf = null; _fonts = null; throw e; });
    return _pdf;
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
  // the PDF of a finished run (res from run()): loads the writer + fonts on first use
  function toPdf(res, opts) {
    opts = opts || {}; var t0 = Date.now(), X = opts.XLSX || global.XLSX;
    return ensurePdf(opts).then(function (F) {
      return global.NinjaPdf.renderSheet(global.PDFDocument, res.model, { profile: 'excel', fonts: resolver(F), formatNumber: function (f, v) { return X.SSF.format(f, v); } }).then(function (r) {
        res.pdf = new Uint8Array(r.pdf); res.facts.pdfPage = r.page; res.facts.pdfBytes = res.pdf.length;
        console.log('§NINJA_REPORT_PDF client=' + res.facts.client + ' pdfBytes=' + res.pdf.length + ' page=' + r.page.map(function (x) { return x.toFixed(2); }).join('x') + ' ms=' + (Date.now() - t0));
        return res;
      });
    });
  }
  // opts: { db (sql.js Database), template (ArrayBuffer|Uint8Array), from:'YYYY-MM-DD', to:'YYYY-MM-DD', base, paths, XLSX (SheetJS), clientId?, withDb?, pdf (default true; false = no PDF until toPdf) }
  function run(opts) {
    var t0 = Date.now();
    return ensureLibs(opts).then(function () {
      var H = global.NinjaTemplateXlsx, T = global.NinjaTemplate, C = global.NinjaCalc, P = global.NinjaPreflight;
      var tpl = opts.template instanceof Uint8Array ? opts.template : new Uint8Array(opts.template);
      var withDb = opts.withDb || function (fn) { return fn(opts.db); };       // the pill passes a tip reader so documents entered THIS session (signed op-log tip) are visible to the report's SQL
      var client = opts.clientId != null ? opts.clientId : clientOf(opts.db);   // ad_client rows are not touched by sales: main is enough
      if (client == null) throw new Error('no client in the open database (ad_client has no row > 0)');
      var from = opts.from + ' 00:00:00.0', to = opts.to + ' 00:00:00.0';
      return H.loadModel(global.ExcelJS, tpl).then(function (m) {
        var pre = P.preflight(m); var okPre = P.report(pre);        // §PREFLIGHT lines: template faults (missing sheet, mistyped Input tag, empty Direction) stop the run with a clear message instead of a silently wrong report
        if (!okPre) throw new Error('TEMPLATE CHECK FAILED: ' + pre.errors.join(' | '));
        var t1 = Date.now();
        var tex = null;
        var S = withDb(function (raw) {
          var db = shim(raw); T.registerPgBuiltins(function (n, f) { db.function(n, { varargs: true }, f); });
          tex = P.timed(T.sqliteExecutor(db, global.BigDecimal), function (l) { console.log(l); });   // §SQL_MS per statement + §SQL_SUMMARY: where the time goes (the legacy plugin ran minutes with no timing at all)
          return T.runTemplate(m, P.selectOnly(tex), { XLSX: opts.XLSX || global.XLSX, clientId: client, orgId: 0, from: from, to: to });
        });
        var runMs = Date.now() - t1; if (tex) tex.summary();
        console.log('§NINJA_REPORT_RUN client=' + client + ' from=' + opts.from + ' to=' + opts.to + ' statements=' + S.sqlcount + ' ms=' + runMs);
        var cs = C.evaluateSheet(m, 'Output');
        return H.saveModel(global.ExcelJS, m, tpl, ['Output', 'Process']).then(function (xl) {
          var out = { xlsx: new Uint8Array(xl), pdf: null, model: m, facts: { client: client, statements: S.sqlcount, runMs: runMs, formulas: cs.evaluated, formulaErrors: cs.errors, pdfPage: null, pdfBytes: 0 } };
          console.log('§NINJA_REPORT_DONE client=' + client + ' formulas=' + cs.evaluated + ' errors=' + cs.errors + ' xlsxBytes=' + out.xlsx.length + ' pdf=' + (opts.pdf === false ? 'on-demand' : 'now'));
          return (opts.pdf === false ? Promise.resolve(out) : toPdf(out, opts)).then(function (o) { o.facts.totalMs = Date.now() - t0; return o; });
        });
      });
    });
  }
  global.NinjaReport = { run: run, toPdf: toPdf, ensureLibs: ensureLibs, ensurePdf: ensurePdf, shim: shim, clientOf: clientOf };
})(typeof self !== 'undefined' ? self : this);
