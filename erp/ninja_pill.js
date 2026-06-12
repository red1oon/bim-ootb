/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * ninja_pill.js — the NinjaExcel lens (window.NinjaPill): Excel-as-report-binder over the loaded
 * client db. Drop a workbook:
 *   BACKUP only        → MAKE: analyze the filled sample, scaffold Input+Process, download
 *                        (the user finishes the Process sheet in Excel — confirm-each);
 *   Input + Process    → RUN: §5.5 gate → fold each Process row over the page's sql.js db →
 *                        write values into the addressed cells → if BACKUP present,
 *                        verify-by-example (integer cents) → download the filled workbook.
 * The browser never tries to BE Excel — no grid render, no chart engine; formatting/subtotals/
 * graphs stay the user's own workbook (Excel recalcs its preserved formulas on open).
 *
 * Implementing internal/NinjaExcelAdaptation.md §6.2 (browser pill) — Witness: W-NINJA-PILL
 * (scripts/poc_ninja_pill.js). Engine = ninja_excel.js (same module the headless W-NINJA witnesses
 * prove); SheetJS (xlsx.mini.min.js, vendored) is LAZY-loaded on first open (lazy-init pattern).
 * Lucide icons only, via OverlayKit.ico over icons.js (§PILL-REGISTRY; no unicode glyphs).
 * Source of truth: bim-compiler/build/erp/ninja_pill.js — sync out, never edit the copies.
 */
(function (global) {
  'use strict';

  var _db = null, _xlsxReady = null;

  function ico(n, s) { return (global.OverlayKit && OverlayKit.ico) ? OverlayKit.ico(n, s || 14) : ''; }
  function el(tag, attrs, html) {
    if (global.OverlayKit && OverlayKit.el) return OverlayKit.el(tag, attrs, html);
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }

  // lazy SheetJS — one script inject per page, promise-cached (lazy-init pattern)
  function ensureXlsx() {
    if (global.XLSX) return Promise.resolve(global.XLSX);
    if (_xlsxReady) return _xlsxReady;
    _xlsxReady = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'xlsx.mini.min.js?v=1';
      s.onload = function () { console.log('§NINJA-PILL xlsx=loaded'); res(global.XLSX); };
      s.onerror = function () { _xlsxReady = null; rej(new Error('xlsx.mini.min.js failed to load')); };
      document.head.appendChild(s);
    });
    return _xlsxReady;
  }

  // sql.js executor seam — the SAME contract the headless witnesses prove with better-sqlite3.
  function exec(sql, params) {
    var r = _db.exec(sql, params);
    return (r.length && r[0].values.length) ? r[0].values[0][0] : null;
  }

  // ── panel ───────────────────────────────────────────────────────────────────────────────────────
  function close() { var p = document.getElementById('ninja-panel'); if (p) p.remove(); }

  function open(opts) {
    opts = opts || {};
    _db = opts.db;
    close();
    if (!_db) { console.log('§NINJA-PILL refused: no client db loaded'); return; }

    var p = el('div', { id: 'ninja-panel' });
    p.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(10,12,18,0.55);font-family:system-ui,sans-serif;';
    var box = el('div', null);
    box.style.cssText = 'width:min(560px,94vw);max-height:86vh;overflow:auto;border-radius:12px;padding:18px 20px;' +
      'background:rgba(40,44,58,0.97);color:#cdd6e4;border:1px solid rgba(255,255,255,0.1);box-shadow:0 12px 40px rgba(0,0,0,0.5);';
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        ico('grid', 18) + '<b style="font-size:15px;">Excel Report</b>' +
        '<span style="font-size:11px;opacity:0.6;">NinjaExcel — your workbook is the report</span>' +
        '<button id="np-close" style="margin-left:auto;background:none;border:none;color:#cdd6e4;cursor:pointer;padding:4px;">' + ico('xmark', 16) + '</button>' +
      '</div>' +
      '<div style="font-size:12px;line-height:1.5;opacity:0.85;margin-bottom:10px;">' +
        'Drop a filled sample (<b>BACKUP</b> sheet) to scaffold the query sheets — or drop your authored workbook ' +
        '(<b>Input</b>+<b>Process</b>) to run it against the open tenant and download it filled. ' +
        'Formatting, subtotals and charts stay yours: Excel recalculates them on open.' +
      '</div>' +
      '<div id="np-drop" style="border:2px dashed rgba(255,255,255,0.25);border-radius:10px;padding:26px 12px;text-align:center;' +
        'cursor:pointer;font-size:13px;">' + ico('download', 16) + ' drop .xlsx here / tap to choose</div>' +
      '<input id="np-file" type="file" accept=".xlsx" style="display:none;">' +
      '<div style="margin-top:8px;font-size:12px;"><a id="np-sample" href="ninja_sample.xlsx" download ' +
        'style="color:#7fb3ff;text-decoration:none;cursor:pointer;">' + ico('doc', 13) + ' sample workbook (GardenWorld invoice summary — runnable as-is)</a></div>' +
      '<div id="np-out" style="margin-top:12px;font-size:12px;"></div>';
    p.appendChild(box);
    document.body.appendChild(p);
    p.addEventListener('pointerup', function (ev) { if (ev.target === p) close(); });
    box.querySelector('#np-close').addEventListener('pointerup', close);

    var drop = box.querySelector('#np-drop'), file = box.querySelector('#np-file');
    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('dragover', function (ev) { ev.preventDefault(); drop.style.borderColor = '#7fb3ff'; });
    drop.addEventListener('dragleave', function () { drop.style.borderColor = 'rgba(255,255,255,0.25)'; });
    drop.addEventListener('drop', function (ev) {
      ev.preventDefault(); drop.style.borderColor = 'rgba(255,255,255,0.25)';
      if (ev.dataTransfer.files.length) _onFile(ev.dataTransfer.files[0]);
    });
    file.addEventListener('change', function () { if (file.files.length) _onFile(file.files[0]); });
    console.log('§NINJA-PILL open db=Y engine=' + (global.NinjaExcel ? 'Y' : 'MISSING'));
  }

  function _onFile(f) {
    var out = document.getElementById('np-out');
    out.innerHTML = '<span style="opacity:0.7;">reading ' + f.name + '…</span>';
    ensureXlsx().then(function (XLSX) {
      return f.arrayBuffer().then(function (buf) { handleWorkbook(XLSX.read(buf, { type: 'array' }), f.name); });
    }).catch(function (e) { out.innerHTML = '<span style="color:#ff9b9b;">' + String(e.message || e) + '</span>'; });
  }

  // exposed seam for the witness (same path _onFile takes, minus the File object)
  function handleBuffer(buf, name) {
    return ensureXlsx().then(function (XLSX) { return handleWorkbook(XLSX.read(buf, { type: 'array' }), name || 'witness.xlsx'); });
  }

  function handleWorkbook(wb, name) {
    var N = global.NinjaExcel, out = document.getElementById('np-out');
    var hasProc = wb.SheetNames.indexOf('Process') >= 0 && wb.SheetNames.indexOf('Input') >= 0;
    var hasBackup = wb.SheetNames.indexOf('BACKUP') >= 0;
    if (hasProc) return runFlow(N, wb, name, out, hasBackup);
    if (hasBackup) return makeFlow(N, wb, name, out);
    console.log('§NINJA-PILL refused file=' + name + ' (no BACKUP, no Input+Process)');
    out.innerHTML = '<span style="color:#ff9b9b;">No <b>BACKUP</b> sheet (sample) and no <b>Input</b>+<b>Process</b> sheets — nothing to make or run.</span>';
    return { mode: 'refused' };
  }

  // MAKE — analyze the sample, scaffold, hand back (the user finishes in Excel)
  function makeFlow(N, wb, name, out) {
    var a = N.makeScaffold(wb);
    console.log('§NINJA-PILL make tables=' + a.tables.length + ' dynamic=' + a.dynamicCells.length +
      ' preserved=' + a.preservedFormulas.length);
    var props = {};
    a.dynamicCells.forEach(function (d) { props[d.selectProposal] = true; });
    out.innerHTML =
      '<div style="border-left:3px solid #7fb3ff;padding-left:10px;">' +
        '<b>MAKE</b> — found ' + a.tables.length + ' grid(s), ' + a.dynamicCells.length + ' data cells, ' +
        a.preservedFormulas.length + ' preserved formula(s).<br>' +
        'SELECT proposals: <code>' + Object.keys(props).join('</code>, <code>') + '</code><br>' +
        '<span style="opacity:0.8;">Finish the <b>Process</b> sheet in Excel (TABLE/WHERE — proposals are not answers), then drop it back here to run.</span>' +
      '</div>';
    download(wb, name.replace(/\.xlsx$/i, '') + '_scaffold.xlsx', out);
    return { mode: 'make', analysis: a };
  }

  // RUN — gate → fold over the page db → write back → verify-by-example if the sample travels along
  function runFlow(N, wb, name, out, hasBackup) {
    var man = N.readManifest(wb), g = N.gate(man);
    if (!g.ok) {
      console.log('§NINJA-PILL gate=REFUSED errors=' + g.errors.length);
      out.innerHTML = '<div style="border-left:3px solid #ff9b9b;padding-left:10px;"><b>Gate refused</b> (fix and re-drop):' +
        '<ul style="margin:6px 0 0 14px;padding:0;">' + g.errors.slice(0, 12).map(function (e) { return '<li>' + e + '</li>'; }).join('') +
        (g.errors.length > 12 ? '<li>… ' + (g.errors.length - 12) + ' more</li>' : '') + '</ul></div>';
      return { mode: 'run', gate: g };
    }
    var results = N.run(man, exec);
    N.writeBack(wb, 'Input', results);
    var v = hasBackup ? N.verifyByExample(wb, 'BACKUP', results) : null;
    console.log('§NINJA-PILL run rows=' + results.length +
      (v ? ' verify cells=' + v.cells + ' maxDiff=' + v.maxDiffCents + 'c strings=' + v.stringMismatches + ' pass=' + (v.pass ? 'Y' : 'N') : ' verify=n/a(no BACKUP)'));
    var rows = results.map(function (r) {
      var pv = v && v.per.filter(function (x) { return x.address === r.address; })[0];
      var okc = pv ? ((pv.diffCents === 0 || pv.equal) ? '#9be29b' : '#ff9b9b') : '#cdd6e4';
      return '<tr><td style="padding:2px 8px 2px 0;opacity:0.7;">' + r.address + '</td>' +
        '<td style="padding:2px 8px;color:' + okc + ';">' + r.value + '</td>' +
        (pv ? '<td style="padding:2px 8px;opacity:0.6;">sample ' + pv.sample + '</td>' : '') + '</tr>';
    }).join('');
    out.innerHTML =
      '<div style="border-left:3px solid ' + (v ? (v.pass ? '#9be29b' : '#ff9b9b') : '#7fb3ff') + ';padding-left:10px;">' +
        '<b>RUN</b> — ' + results.length + ' cells folded from the open tenant.' +
        (v ? ' Verify-by-example: <b>' + (v.pass ? 'PASS' : 'FAIL') + '</b> (maxDiff ' + v.maxDiffCents + 'c, ' + v.stringMismatches + ' string mismatches vs BACKUP).' : '') +
        '<table style="margin-top:6px;border-collapse:collapse;font-size:12px;">' + rows + '</table>' +
      '</div>';
    download(wb, name.replace(/(_scaffold)?\.xlsx$/i, '') + '_filled.xlsx', out);
    return { mode: 'run', results: results, verify: v };
  }

  function download(wb, fname, out) {
    var data = global.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    var url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = el('a', { href: url, download: fname });
    a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:7px 14px;border-radius:8px;' +
      'background:#2d3550;color:#cdd6e4;text-decoration:none;font-size:13px;border:1px solid rgba(255,255,255,0.12);';
    a.innerHTML = ico('save', 14) + ' download ' + fname;
    out.appendChild(a);
    console.log('§NINJA-PILL download=' + fname);
  }

  global.NinjaPill = { open: open, close: close, handleBuffer: handleBuffer };
  console.log('§NINJA-PILL loaded');
})(typeof self !== 'undefined' ? self : this);
