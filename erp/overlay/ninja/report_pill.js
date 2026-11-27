// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// overlay/ninja/report_pill.js — the NinjaExcel REPORT flow on the "Excel Report" pill, as an OVERLAY (prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW): the core pill (ninja_pill.js,
//   window.NinjaPill) is not edited. This module wraps its two published entry points, open() and handleBuffer(): the panel gains two sample report links, and a workbook with
//   Input + Process + Output + BACKUP sheets (the legacy ExpenseReport template grammar) goes to the report flow - dates, Run report, a preview, the painted .xlsx and, only when
//   asked, the PDF. Any other workbook is handed to the core's own handleBuffer unchanged. Spec: bim-compiler prompts/SHEET_FRONT_DOOR.md §19 + prompts/NINJAEXCEL_TEMPLATE_ENGINE.md.
//   Witness: erp/tests/witness_ninja_pdf.js (W-NINJA-PDF); bim-compiler scripts/ninja_template/W41_PillReport.js, W48_PillPreflight.js.
// Reads the core only through published seams: window.NinjaPill, window.__idmpDb, window.__crud.withTipQuery (documents entered this session live in the signed op-log tip; the
//   tip query shadows them into TEMP tables on the same connection while the report runs). Writes nothing to the database: the report SQL passes a SELECT-only guard.
// Loading cost: this file only, at boot. The engine + ExcelJS load on "Run report"; PDFKit + the fonts on the first "Download PDF" (§NINJA_REPORT_LOAD lines).
(function () {
  'use strict';
  var NP = window.NinjaPill;
  if (!NP || typeof NP.open !== 'function') { console.log('§NINJA-REPORT-PILL core pill absent - report flow not offered'); return; }
  if (NP.__report) return;
  var me = document.currentScript && document.currentScript.src, BASE = me ? me.replace(/[^\/]*(\?.*)?$/, '') : 'overlay/ninja/';
  var PATHS = { exceljs: BASE + '../../../viewer/lib/exceljs.min.js', pdfkit: BASE + '../../../common/lib/pdfkit.standalone.js', fonts: BASE + '../../../common/fonts/', bigdecimal: BASE + '../../bigdecimal.js' };
  var SAMPLES = [{ id: 'tb', file: 'ninja_tb_sample.xlsx', label: 'sample report: Thai trial balance (opening, movement, closing)' },
                 { id: 'reg', file: 'ninja_register_sample.xlsx', label: 'sample report: Thai sales register (grows as you sell)' }];
  var _db = null, last = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ico(n, s) { return (window.OverlayKit && window.OverlayKit.ico) ? window.OverlayKit.ico(n, s || 14) : ''; }
  function inject(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src + ' failed to load')); }; document.head.appendChild(s); }); }
  function xlsx() { return window.XLSX ? Promise.resolve(window.XLSX) : inject(BASE + '../../xlsx.mini.min.js').then(function () { return window.XLSX; }); }
  function report() { return window.NinjaReport ? Promise.resolve(window.NinjaReport) : inject(BASE + 'ninja_report.js').then(function () { return window.NinjaReport; }); }
  function isReportTemplate(X, buf) { var n = X.read(buf, { type: 'array', bookSheets: true }).SheetNames; return ['Input', 'Process', 'Output', 'BACKUP'].every(function (s) { return n.indexOf(s) >= 0; }); }
  function say(out, html) { if (out) out.innerHTML = html; }
  function fail(out, e) { var m = String((e && e.message) || e); console.log('§NINJA-REPORT-PILL ERROR ' + m); say(out, '<span style="color:#ff9b9b;">' + esc(m) + '</span>'); }
  // the report reads the committed state the user sees (base + signed tip): the core's own tip query, the raw connection inside it
  function tipDb(db) { return function (fn) { var c = window.__crud; return (c && typeof c.withTipQuery === 'function') ? c.withTipQuery(function () { return fn(db); }) : fn(db); }; }

  function previewHtml(m, X) {
    var ws = m.Sheets.Output, styles = m._styles || {}, R = 0, C = 0;
    Object.keys(ws).forEach(function (k) { if (k[0] === '!') return; var p = X.utils.decode_cell(k), c = ws[k]; if (c.t !== 'z' && !(c.t === 's' && c.v === '')) { if (p.r > R) R = p.r; if (p.c > C) C = p.c; } });
    var rows = [];
    for (var r = 0; r <= R; r++) {
      var tds = '';
      for (var c = 0; c <= C; c++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })], txt = '', al = 'left';
        if (cell && cell.t !== 'z') {
          if (cell.t === 'n') { var st = cell.s != null ? styles[cell.s] : null; txt = X.SSF.format((st && st.numFmt) || cell.z || 'General', cell.v); al = 'right'; }
          else txt = String(cell.v == null ? '' : cell.v);
        }
        tds += '<td style="padding:1px 6px;text-align:' + al + ';border-bottom:1px solid rgba(255,255,255,0.07);white-space:nowrap;">' + esc(txt) + '</td>';
      }
      rows.push('<tr>' + tds + '</tr>');
    }
    return '<div style="max-height:240px;overflow:auto;margin-top:8px;border:1px solid rgba(255,255,255,0.12);border-radius:6px;"><table id="np-preview" style="border-collapse:collapse;font-size:11.5px;">' + rows.join('') + '</table></div>';
  }
  function link(id, fname, label) {
    var a = document.createElement('a'); a.id = id; a.download = fname; a.href = '#';
    a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:10px 8px 0 0;padding:7px 14px;border-radius:8px;background:#2d3550;color:#cdd6e4;text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,0.12);';
    a.innerHTML = ico('save', 14) + ' ' + esc(label); return a;
  }
  function reportFlow(buf, name, out) {
    var y = 2000, db = _db || window.__idmpDb;
    try { var r0 = db.exec('SELECT substr(max(dateacct),1,4) FROM fact_acct'); if (r0.length && r0[0].values[0][0]) y = r0[0].values[0][0]; } catch (e) { /* no fact_acct: the dates stay at the default */ }
    console.log('§NINJA-PILL report template=' + name + ' bytes=' + buf.byteLength);
    say(out, '<div style="border-left:3px solid #7fb3ff;padding-left:10px;"><b>Report template</b> — ' + esc(name) + '<br>' +
      '<label style="font-size:12px;">From <input id="np-from" type="date" value="' + y + '-01-01" style="margin:0 8px 0 4px;"></label>' +
      '<label style="font-size:12px;">To <input id="np-to" type="date" value="' + y + '-12-31" style="margin:0 8px 0 4px;"></label>' +
      '<button id="np-run" style="padding:5px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:#2d3550;color:#cdd6e4;cursor:pointer;">Run report</button>' +
      '<div id="np-rep" style="margin-top:8px;"></div></div>');
    out.querySelector('#np-run').addEventListener('click', function () {
      var rep = out.querySelector('#np-rep'), from = out.querySelector('#np-from').value, to = out.querySelector('#np-to').value, stem = name.replace(/\.xlsx$/i, '');
      say(rep, '<span style="opacity:0.7;">running…</span>');
      Promise.all([xlsx(), report()]).then(function (L) {
        var X = L[0], NR = L[1];
        return NR.run({ db: db, template: buf, from: from, to: to, base: BASE, paths: PATHS, XLSX: X, withDb: tipDb(db), pdf: false }).then(function (res) {
          var f = res.facts; last = res;
          say(rep, '<div id="np-rep-sum"><b>Report ready</b> — ' + f.statements + ' queries, ' + f.runMs + ' ms, ' + f.formulas + ' formulas (' + f.formulaErrors + ' errors).</div>' + previewHtml(res.model, X));
          var xl = link('np-dl-xlsx', stem + '_report.xlsx', 'download ' + stem + '_report.xlsx');
          xl.href = URL.createObjectURL(new Blob([res.xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          var pdf = link('np-dl-pdf', stem + '_report.pdf', 'Download PDF');
          pdf.addEventListener('click', function (ev) {     // the PDF writer and its fonts are fetched here, the first time a PDF is asked for
            if (res.pdf) return;
            ev.preventDefault(); pdf.style.opacity = '0.6';
            NR.toPdf(res, { base: BASE, paths: PATHS, XLSX: X }).then(function () {
              pdf.href = URL.createObjectURL(new Blob([res.pdf], { type: 'application/pdf' })); pdf.style.opacity = '';
              console.log('§NINJA-PILL report pdf ready bytes=' + res.pdf.length); pdf.click();
            }).catch(function (e) { pdf.style.opacity = ''; fail(rep, e); });
          });
          rep.appendChild(xl); rep.appendChild(pdf);
          console.log('§NINJA-PILL report done statements=' + f.statements + ' ms=' + f.runMs + ' formulaErrors=' + f.formulaErrors);
        });
      }).catch(function (e) { fail(rep, e); });
    });
    return { mode: 'report' };
  }
  // a workbook from the panel (file chooser, drop, the witness seam): a report template goes to the report flow, anything else to the core unchanged
  var coreHandle = NP.handleBuffer;
  function route(buf, name) {
    var out = document.getElementById('np-out');
    return xlsx().then(function (X) {
      if (isReportTemplate(X, buf)) return reportFlow(buf, name || 'report.xlsx', out);
      return coreHandle.call(NP, buf, name);
    }).catch(function (e) { fail(out, e); });
  }
  function take(file) { var out = document.getElementById('np-out'); say(out, '<span style="opacity:0.7;">reading ' + esc(file.name) + '…</span>'); file.arrayBuffer().then(function (b) { return route(b, file.name); }); }
  function decorate() {
    var out = document.getElementById('np-out'), file = document.getElementById('np-file'), drop = document.getElementById('np-drop');
    if (!out || out.__report) return; out.__report = true;
    SAMPLES.forEach(function (s) {
      var d = document.createElement('div'); d.style.cssText = 'margin-top:6px;font-size:12px;';
      d.innerHTML = '<a id="np-sample-' + s.id + '" style="color:#7fb3ff;text-decoration:none;cursor:pointer;">' + ico('doc', 13) + ' ' + esc(s.label) + '</a>';
      out.parentNode.insertBefore(d, out);
      d.firstChild.addEventListener('click', function () {
        fetch(BASE + 'samples/' + s.file).then(function (r) { if (!r.ok) throw new Error(s.file + ' HTTP ' + r.status); return r.arrayBuffer(); })
          .then(function (b) { return reportFlow(b, s.file, document.getElementById('np-out')); }).catch(function (e) { fail(document.getElementById('np-out'), e); });
      });
    });
    // capture phase on the same element runs before the core's own listener: the file is routed here, the core still gets every workbook that is not a report template
    if (file) file.addEventListener('change', function (ev) { if (!file.files.length) return; ev.stopImmediatePropagation(); take(file.files[0]); }, true);
    if (drop) drop.addEventListener('drop', function (ev) { if (!ev.dataTransfer || !ev.dataTransfer.files.length) return; ev.preventDefault(); ev.stopImmediatePropagation(); drop.style.borderColor = 'rgba(255,255,255,0.25)'; take(ev.dataTransfer.files[0]); }, true);
    console.log('§NINJA-REPORT-PILL panel samples=' + SAMPLES.length);
  }
  var coreOpen = NP.open;
  NP.open = function (opts) {
    _db = (opts && opts.db) || window.__idmpDb;
    var r = coreOpen.apply(this, arguments);
    try { decorate(); } catch (e) { console.log('§NINJA-REPORT-PILL decorate failed (core pill unaffected): ' + String(e && e.message).slice(0, 160)); }
    return r;
  };
  NP.handleBuffer = function (buf, name) { return route(buf, name); };
  NP.__report = { last: function () { return last; }, paths: PATHS, base: BASE };
  console.log('§NINJA-REPORT-PILL loaded base=' + BASE.replace(location.origin, ''));
})();
