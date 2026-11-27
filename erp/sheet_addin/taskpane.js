// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// taskpane.js - wires the four menu actions of the Sheet Door task pane (spec: bim-compiler prompts/SHEET_FRONT_DOOR.md sections 8 and 11: Excel and WPS Spreadsheets open this one page).
// Shows the verdict; all work is in host_shim.js over excel_host.js. The books engine for File it is `window.SheetAddinRunner` (a runner with
// file(tpl, cells, ledgerLines) -> { result, ledgerLine }): runner.js over the browser kernel (ws_kernel_web.js boot(), section 9 slice S3b). The kernel and
// its demo books load on the FIRST File it, not with the pane.
(function () {
  'use strict';
  var out = document.getElementById('verdict'), shim = null, host = null;
  function show(s) { out.textContent = s; }
  function boot() {
    if (!window.SheetAddinRunner && window.SheetRunner && window.WsKernelWeb) window.SheetAddinRunner = window.SheetRunner.create({ boot: window.WsKernelWeb.boot, SheetDoor: window.SheetDoor, AP: function () { return window.AdProcess; } });
    host = inWps() ? window.SheetAddinWps.create(window.Application, { ex: window.SheetAddinExcel }) : window.SheetAddinExcel.create(window.Excel);   // the host is chosen by what exists (spec section 11)
    shim = window.SheetAddin.create(host, { SheetDoor: window.SheetDoor, SheetHistory: window.SheetHistory, runner: window.SheetAddinRunner || null });
    shim.actions.forEach(function (id) { document.getElementById('b-' + id).addEventListener('click', function () { act(id); }); });
    if (host.setUserName) document.getElementById('who').addEventListener('change', function (e) { host.setUserName(e.target.value).then(function () { show('Name saved in this workbook.'); }, fail); });
    else { document.getElementById('who').readOnly = true; document.getElementById('who-label').textContent = 'Your name (from WPS; written next to every Stamp)'; }   // WPS keeps the user name itself
    host.userName().then(function (n) { if (n !== 'unknown') document.getElementById('who').value = n; }, function () { /* a pane outside the spreadsheet: the name box stays empty */ });
    var q = /[?&]action=([a-z]+)/.exec(location.search);
    if (q && shim.actions.indexOf(q[1]) >= 0) act(q[1]);
  }
  function fail(e) { show('Could not do that: ' + (e && e.message || e)); }
  function act(id) {
    show(id === 'fileit' && window.SheetAddinRunner && !window.SheetAddinRunner.ready() ? 'Loading the books engine (first time, about 30 MB)...' : 'Working...');
    shim.run(id).then(function (r) { show(r.verdict + '\n' + r.text + (r.checksLine ? '\n' + r.checksLine : '')); }, fail);
  }
  function inWps() { return !!(window.Application && window.Application.PluginStorage && window.SheetAddinWps); }
  if (inWps()) boot();                                               // WPS Spreadsheets: the page was given its own Application, no Office.js
  else if (window.Office && window.Office.onReady) window.Office.onReady(function (info) {
    if (info && info.host && info.host !== window.Office.HostType.Excel) { show('This menu works in Excel only.'); return; }
    boot();
  });
  else show('Office.js did not load: open this page from the Excel add-in (or the WPS add-in).');
})();
