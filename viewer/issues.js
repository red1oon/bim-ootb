/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// issues.js — Issue Log (IndexedDB persistence), export to Excel
function setupIssues(A) {

  A._openIssuesDB = function() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('bim_ootb_issues', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('issues')) {
          db.createObjectStore('issues', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onblocked = () => { console.warn('[S209] IDB blocked — close other tabs'); reject(new Error('DB blocked by another tab')); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  A._saveIssueToLog = async function() {
    try {
      const blob = await A._getMarkupBlob();
      if (!blob) return;
      const info = A._getCamBimInfo();
      const issue = {
        jpeg_blob: blob,
        gps_lat: A._camGpsPos ? A._camGpsPos.coords.latitude : null,
        gps_lng: A._camGpsPos ? A._camGpsPos.coords.longitude : null,
        gps_accuracy: A._camGpsPos ? A._camGpsPos.coords.accuracy : null,
        compass_heading: A._camHeading,
        timestamp: new Date().toISOString(),
        element_guid: info.guid || '',
        element_class: info.cls || '',
        element_name: info.name || '',
        building: info.building || '',
        storey: info.storey || '',
        discipline: info.disc || '',
        notes: ''
      };
      const db = await A._openIssuesDB();
      const tx = db.transaction('issues', 'readwrite');
      var addReq = tx.objectStore('issues').add(issue);
      addReq.onerror = function() { console.error('[S205] §ISSUE_ADD_ERR', addReq.error); };
      await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
      db.close();
      console.log('[S205] §ISSUE_SAVED', issue.element_class, issue.storey);
    } catch (err) {
      console.error('[S205] Failed to save issue', err);
    }
  };

  A._getAllIssues = async function() {
    const db = await A._openIssuesDB();
    const tx = db.transaction('issues', 'readonly');
    const store = tx.objectStore('issues');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  };

  A._blobToThumbUrl = function(blob) {
    return new Promise(resolve => {
      const img = new Image();
      const blobUrl = URL.createObjectURL(blob);
      img.onload = () => {
        const w = 100, h = Math.round(img.height * (100 / img.width));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(blobUrl);
        resolve(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(null);
      };
      img.src = blobUrl;
    });
  };

  A._formatIssueGps = function(lat, lng, acc) {
    if (lat == null || lng == null) return 'N/A';
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lng >= 0 ? 'E' : 'W';
    const accStr = acc ? ' \u00b1' + Math.round(acc) + 'm' : '';
    return Math.abs(lat).toFixed(4) + '\u00b0' + ns + ', ' + Math.abs(lng).toFixed(4) + '\u00b0' + ew + accStr;
  };

  A._renderIssueList = async function() {
    const list = document.getElementById('issues-list');
    const detail = document.getElementById('issue-detail-view');
    detail.classList.remove('active');
    list.style.display = '';
    var allIssues = await A._getAllIssues();
    // Filter to active building — each building sees only its own issues
    var bld = A.activeBuilding || '';
    var issues = bld ? allIssues.filter(function(i) { return !i.building || i.building === bld; }) : allIssues;
    if (issues.length === 0) {
      list.innerHTML = '<div class="issues-empty">No issues for ' + (bld || 'this building') + '.<br>Use Site Camera to snap and save photos.</div>';
      return;
    }
    list.innerHTML = '';
    for (const iss of issues.reverse()) {
      const status = iss.status || 'open';
      const statusIcon = status === 'fixed' ? '✅' : '🔴';
      const card = document.createElement('div');
      card.className = 'issue-card';
      card.onclick = () => A._showIssueDetail(iss);
      const thumbUrl = iss.jpeg_blob ? await A._blobToThumbUrl(iss.jpeg_blob) : '';
      const ts = iss.timestamp ? new Date(iss.timestamp).toLocaleString() : '';
      const gps = A._formatIssueGps(iss.gps_lat, iss.gps_lng, iss.gps_accuracy);
      card.innerHTML =
        (thumbUrl ? '<img src="' + thumbUrl + '">' : '') +
        '<div class="issue-meta">' +
          '<div class="issue-class">' + statusIcon + ' ' + (iss.element_class || '-') + '</div>' +
          '<div>' + (iss.element_name || '-') + '</div>' +
          '<div>' + (iss.storey || '-') + ' / ' + (iss.discipline || '-') + '</div>' +
          '<div class="issue-ts">' + ts + '</div>' +
        '</div>';
      list.appendChild(card);
    }
  };

  A._showIssueDetail = async function(iss) {
    const list = document.getElementById('issues-list');
    const detail = document.getElementById('issue-detail-view');
    list.style.display = 'none';
    detail.classList.add('active');
    const imgEl = document.getElementById('issue-detail-img');
    if (iss.jpeg_blob) {
      imgEl.src = URL.createObjectURL(iss.jpeg_blob);
    } else {
      imgEl.src = '';
    }
    document.getElementById('issue-d-class').textContent = iss.element_class || '-';
    document.getElementById('issue-d-name').textContent = iss.element_name || '-';
    document.getElementById('issue-d-guid').textContent = iss.element_guid || '-';
    document.getElementById('issue-d-building').textContent = iss.building || '-';
    document.getElementById('issue-d-storey').textContent = iss.storey || '-';
    document.getElementById('issue-d-disc').textContent = iss.discipline || '-';
    document.getElementById('issue-d-gps').textContent = A._formatIssueGps(iss.gps_lat, iss.gps_lng, iss.gps_accuracy);
    document.getElementById('issue-d-compass').textContent = iss.compass_heading != null ? iss.compass_heading + '\u00b0' : '-';
    document.getElementById('issue-d-time').textContent = iss.timestamp ? new Date(iss.timestamp).toLocaleString() : '-';
    document.getElementById('issue-d-notes').textContent = iss.notes || '-';

    // Deep-link (clash snags have it, regular snags don't)
    const linkRow = document.getElementById('issue-d-link-row');
    const linkEl = document.getElementById('issue-d-link');
    if (iss.deep_link) {
      linkRow.style.display = '';
      linkEl.href = '#';
      linkEl.textContent = 'Fly to clash';
      linkEl.onclick = function(ev) {
        ev.preventDefault();
        // Parse deep-link hash and fly in-place
        var url = iss.deep_link;
        var hashPart = url.indexOf('#') >= 0 ? url.substring(url.indexOf('#') + 1) : '';
        var hp = {};
        hashPart.split('&').forEach(function(p) { var kv = p.split('='); if (kv[0]) hp[kv[0]] = decodeURIComponent(kv[1] || ''); });
        var clash = hp.clash;
        if (clash && A._flyToClash && A._loadClashRules) {
          var parts = clash.split('~');
          if (parts.length === 2) {
            var metaRows = A.dbQuery("SELECT m.guid, m.ifc_class, m.discipline, m.element_name FROM elements_meta m WHERE m.guid IN (?, ?)", [parts[0], parts[1]]);
            var mA = metaRows.find(function(r) { return r[0] === parts[0]; }) || [parts[0], '?', '?', '?'];
            var mB = metaRows.find(function(r) { return r[0] === parts[1]; }) || [parts[1], '?', '?', '?'];
            A._loadClashRules(function(rules) {
              A._currentClashRules = rules;
              A._currentClashes = [[parts[0], parts[1], mA[1], mB[1], mA[2], mB[2], mA[3], mB[3], 0]];
              A._clashHighlights = [];
              // Activate measure mode properly (button + status)
              if (!A.measureActive) A.toggleMeasure();
              if (hp.cam && hp.tgt) {
                var cam = hp.cam.split(',').map(Number);
                var tgt = hp.tgt.split(',').map(Number);
                if (cam.length === 3 && tgt.length === 3) A._deepLinkCamOverride = { pos: cam, tgt: tgt };
              }
              A._flyToClash(0);
              // Close issues panel + restore toolbox (toggleIssues hides it)
              var panel = document.getElementById('issues-panel');
              if (panel) panel.classList.remove('active');
              var tb = document.getElementById('search-box');
              if (tb) tb.style.display = '';
              A.status.textContent = 'Clash: ' + (mA[3] || parts[0]).substring(0, 20) + ' \u2194 ' + (mB[3] || parts[1]).substring(0, 20);
            });
          }
        }
      };
      // Share button — Web Share API or clipboard
      const shareBtn = document.getElementById('issue-d-share');
      shareBtn.onclick = async function() {
        var title = 'Clash: ' + (iss.element_class || '') + ' \u2194 ' + (iss.element_b_class || '');
        var text = title + '\n' + (iss.element_name || '') + ' / ' + (iss.element_b_name || '') + '\nStorey: ' + (iss.storey || '') + '\n\n' + iss.deep_link;
        if (navigator.share) {
          try { await navigator.share({ title: title, text: text }); return; } catch(e) { if (e.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(iss.deep_link); A.status.textContent = 'Link copied'; } catch(e) {}
      };
    } else {
      linkRow.style.display = 'none';
    }

    // Status toggle button
    const statusBtn = document.getElementById('issue-d-status-btn');
    const status = iss.status || 'open';
    statusBtn.textContent = status === 'fixed' ? '✅ Fixed — tap to reopen' : '🔴 Open — tap to mark Fixed';
    statusBtn.style.background = status === 'fixed' ? '#2e7d32' : '#c62828';
    statusBtn.onclick = async () => {
      const newStatus = (iss.status || 'open') === 'open' ? 'fixed' : 'open';
      iss.status = newStatus;
      try {
        const db = await A._openIssuesDB();
        const tx = db.transaction('issues', 'readwrite');
        tx.objectStore('issues').put(iss);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
        db.close();
        statusBtn.textContent = newStatus === 'fixed' ? '✅ Fixed — tap to reopen' : '🔴 Open — tap to mark Fixed';
        statusBtn.style.background = newStatus === 'fixed' ? '#2e7d32' : '#c62828';
        // Re-render list behind detail so card icon updates immediately
        A._renderIssueList();
        console.log('[S210] §STATUS_TOGGLE id=' + iss.id + ' to=' + newStatus);
      } catch(err) {
        iss.status = (newStatus === 'fixed') ? 'open' : 'fixed'; // revert on failure
        statusBtn.textContent = iss.status === 'fixed' ? '✅ Fixed — tap to reopen' : '🔴 Open — tap to mark Fixed';
        statusBtn.style.background = iss.status === 'fixed' ? '#2e7d32' : '#c62828';
        console.error('[S227] §STATUS_ERR id=' + iss.id + ' ' + err.message);
      }
    };
  };

  A._issueBackToList = function() {
    document.getElementById('issue-detail-view').classList.remove('active');
    document.getElementById('issues-list').style.display = '';
    console.log('[S210] §ISSUE_BACK list refreshed');
  };

  A.toggleIssues = function() {
    const panel = document.getElementById('issues-panel');
    const toolbar = document.getElementById('search-box');
    if (panel.classList.contains('active')) {
      panel.classList.remove('active');
      if (toolbar) toolbar.style.display = '';
    } else {
      panel.classList.add('active');
      if (toolbar) toolbar.style.display = 'none';
      // S265 Phase 4: make issues panel draggable (once)
      if (!panel._draggableWired && A._makeDraggable) { A._makeDraggable(panel); panel._draggableWired = true; }
      A._renderIssueList();
      if (A._cacheIssuesForExport) A._cacheIssuesForExport();
    }
  };

  // exportIssuesExcel moved to excel.js

  A.clearAllIssues = async function() {
    if (!confirm('Delete all logged issues? This cannot be undone.')) return;
    const db = await A._openIssuesDB();
    const tx = db.transaction('issues', 'readwrite');
    tx.objectStore('issues').clear();
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
    db.close();
    A._renderIssueList();
    console.log('[S205] All issues cleared');
  };
}
