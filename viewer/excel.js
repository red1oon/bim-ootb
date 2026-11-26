// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// excel.js — Excel export for issues/punch list
function setupExcel(A) {

  // Cache issues when panel opens so export can run synchronously
  A._cachedIssues = [];

  A._cacheIssuesForExport = async function() {
    // §P3 SPEC 3: a phone skipped SheetJS at boot (loader.js) — fetch it now, the same URL loader.js uses, so the
    // synchronous export (user gesture kept) finds XLSX defined by the time the user taps Export.
    if (typeof XLSX === 'undefined' && !A._xlsxRequested) {
      A._xlsxRequested = true;
      var s = document.createElement('script'); s.src = 'lib/xlsx.full.min.js';
      s.onload = function() { console.log('§SHEETJS_ON_DEMAND loaded'); };
      s.onerror = function() { console.warn('§SHEETJS_ON_DEMAND failed'); };
      document.head.appendChild(s);
    }
    try {
      A._cachedIssues = await A._getAllIssues();
    } catch(e) { A._cachedIssues = []; }
  };

  // Synchronous — no async/await, no lost user gesture
  A.exportIssuesExcel = function() {
    if (typeof XLSX === 'undefined') {
      A.status.textContent = 'SheetJS not loaded';
      return;
    }
    const issues = A._cachedIssues;
    if (!issues || issues.length === 0) {
      A.status.textContent = 'No issues to export (open Issues panel first)';
      return;
    }
    const rows = issues.map(iss => ({
      'ID': iss.id,
      'Status': (iss.status || 'open').toUpperCase(),
      'Timestamp': iss.timestamp ? new Date(iss.timestamp).toLocaleString() : '',
      'Building': iss.building || '',
      'Storey': iss.storey || '',
      'Discipline': iss.discipline || '',
      'IFC Class': iss.element_class || '',
      'Element Name': iss.element_name || '',
      'GUID': iss.element_guid || '',
      'GPS Lat': iss.gps_lat != null ? iss.gps_lat : '',
      'GPS Lng': iss.gps_lng != null ? iss.gps_lng : '',
      'Compass': iss.compass_heading != null ? iss.compass_heading : '',
      'Notes': iss.notes || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issues');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fname = 'BIM_Issues_' + ts + '.xlsx';
    console.log('[S209] §EXCEL before writeFile, issues=' + issues.length);
    A.status.textContent = 'Writing ' + fname + '...';
    XLSX.writeFile(wb, fname);
    console.log('[S209] §EXCEL after writeFile');
    A.status.textContent = `Exported ${issues.length} issues`;
    console.log('[S209] §EXCEL exported', issues.length, 'issues');
  };
}
