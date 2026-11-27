// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// taskpane.js - wires the four menu actions of the Sheet Door task pane (spec: bim-compiler prompts/SHEET_FRONT_DOOR.md section 8).
// Shows the verdict; all work is in host_shim.js over excel_host.js. The books engine for File it is `window.SheetAddinRunner` (a runner with
// file(tpl, cells, ledgerLines) -> { result, ledgerLine }); no browser build of the signed kernel exists yet (slice S3b), so without it File it says so.
(function () {
  'use strict';
  var out = document.getElementById('verdict'), shim = null, host = null;
  function show(s) { out.textContent = s; }
  function boot() {
    host = window.SheetAddinExcel.create(window.Excel);
    shim = window.SheetAddin.create(host, { SheetDoor: window.SheetDoor, SheetHistory: window.SheetHistory, runner: window.SheetAddinRunner || null });
    shim.actions.forEach(function (id) { document.getElementById('b-' + id).addEventListener('click', function () { act(id); }); });
    document.getElementById('who').addEventListener('change', function (e) { host.setUserName(e.target.value).then(function () { show('Name saved in this workbook.'); }, fail); });
    host.userName().then(function (n) { if (n !== 'unknown') document.getElementById('who').value = n; }, function () { /* a pane outside Excel: the name box stays empty */ });
    var q = /[?&]action=([a-z]+)/.exec(location.search);
    if (q && shim.actions.indexOf(q[1]) >= 0) act(q[1]);
  }
  function fail(e) { show('Could not do that: ' + (e && e.message || e)); }
  function act(id) {
    show('Working...');
    shim.run(id).then(function (r) { show(r.verdict + '\n' + r.text); }, fail);
  }
  if (window.Office && window.Office.onReady) window.Office.onReady(function (info) {
    if (info && info.host && info.host !== window.Office.HostType.Excel) { show('This menu works in Excel only.'); return; }
    boot();
  });
  else show('Office.js did not load: open this page from the Excel add-in.');
})();
