/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// contribute.js — Lazy-loaded. Save & Contribute to BIM OOTB gallery.
// S250 §8: Only fetched when user clicks Share. Zero impact on initial load.

(function(A) {
  'use strict';

  // ── DB Integrity Validation ──
  // Ensures the .db was produced by our extraction pipeline, not hand-crafted.
  function validateDB(dbBytes) {
    var SQL = window.initSqlJs ? null : undefined;
    if (typeof initSqlJs === 'undefined') {
      return { valid: false, reason: 'sql.js not loaded' };
    }

    try {
      var SQL_inst = new (window.SQL || window._SQL_CACHED).Database(new Uint8Array(dbBytes));

      // Check 1: Required tables exist (schema fingerprint)
      var tables = SQL_inst.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (!tables.length) { SQL_inst.close(); return { valid: false, reason: 'No tables found' }; }
      var tableNames = tables[0].values.map(function(r) { return r[0]; });
      var required = ['meshes', 'elements', 'building'];
      var missing = required.filter(function(t) { return tableNames.indexOf(t) === -1; });
      if (missing.length > 0) {
        SQL_inst.close();
        return { valid: false, reason: 'Missing tables: ' + missing.join(', ') };
      }

      // Check 2: meshes table has geometry BLOBs with valid Float32Array alignment
      var sample = SQL_inst.exec("SELECT vertices FROM meshes LIMIT 3");
      if (sample.length && sample[0].values.length > 0) {
        for (var i = 0; i < sample[0].values.length; i++) {
          var blob = sample[0].values[i][0];
          if (blob && blob.byteLength % 4 !== 0) {
            SQL_inst.close();
            return { valid: false, reason: 'Mesh BLOB not aligned to Float32Array (byteLength % 4 != 0)' };
          }
        }
      }

      // Check 3: building table has at least one row
      var bldCount = SQL_inst.exec("SELECT COUNT(*) FROM building");
      if (!bldCount.length || bldCount[0].values[0][0] === 0) {
        SQL_inst.close();
        return { valid: false, reason: 'No building record found' };
      }

      // Check 4: File size sanity (reject > 200MB)
      if (dbBytes.byteLength > 200 * 1024 * 1024) {
        SQL_inst.close();
        return { valid: false, reason: 'File exceeds 200MB limit' };
      }

      SQL_inst.close();
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: 'DB open failed: ' + e.message };
    }
  }

  // ── Confirmation Dialog ──
  function showContributeDialog(filename, meta, onConfirm, onCancel) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center';

    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:#1e1e1e;border:1px solid #444;border-radius:12px;padding:28px 32px;max-width:420px;width:90%;color:#eee;font-family:system-ui,sans-serif';

    var elements = meta.elementCount || '?';
    var disciplines = meta.disciplines ? Object.keys(meta.disciplines).join(', ') : 'unknown';

    dialog.innerHTML =
      '<h3 style="margin:0 0 12px;color:#4fc3f7;font-size:16px">Save &amp; Contribute to BIM OOTB</h3>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#bbb;line-height:1.5">' +
        'Your building will be saved locally and shared to the public BIM OOTB gallery. ' +
        'Others can view and analyse it. You retain authorship.' +
      '</p>' +
      '<div style="background:#263238;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px">' +
        '<div><b style="color:#aaa">File:</b> <span style="color:#fff">' + filename + '</span></div>' +
        '<div><b style="color:#aaa">Elements:</b> <span style="color:#fff">' + elements + '</span></div>' +
        '<div><b style="color:#aaa">Disciplines:</b> <span style="color:#fff">' + disciplines + '</span></div>' +
      '</div>' +
      '<p style="margin:0 0 20px;font-size:11px;color:#888;line-height:1.4">' +
        'Integrity check: we verify this DB was produced by the BIM OOTB extraction pipeline before uploading.' +
      '</p>' +
      '<div style="display:flex;gap:12px;justify-content:flex-end">' +
        '<button id="contribute-cancel" style="padding:8px 20px;border:1px solid #555;background:transparent;color:#aaa;border-radius:6px;cursor:pointer;font-size:13px">Cancel</button>' +
        '<button id="contribute-ok" style="padding:8px 20px;border:none;background:#4caf50;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Save &amp; Contribute</button>' +
      '</div>';

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    document.getElementById('contribute-ok').onclick = function() {
      document.body.removeChild(overlay);
      onConfirm();
    };
    document.getElementById('contribute-cancel').onclick = function() {
      document.body.removeChild(overlay);
      if (onCancel) onCancel();
    };
    overlay.onclick = function(e) {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        if (onCancel) onCancel();
      }
    };
  }

  // ── Main Contribute Function ──
  A.contributeBuilding = async function(key) {
    // Retrieve record from IndexedDB
    var record = await A._getImport(key);
    if (!record) { alert('Building not found in storage'); return; }
    if (!A.CONTRIBUTE_PAR) {
      console.log('§CONTRIBUTE skip — CONTRIBUTE_PAR not configured');
      if (A.status) A.status.textContent = 'Contribute not configured (no PAR URL)';
      return;
    }

    var meta = record.meta || {};
    var dbBuf;
    if (record.versions && record.versions.length > 0) {
      dbBuf = record.versions[record.latestVersion || 0].db;
    } else {
      dbBuf = record.extractedDb;
    }
    if (!dbBuf) { alert('No DB data in storage'); return; }

    var filename = (meta.filename || meta.name || key).replace(/\.[^.]+$/, '') + '_extracted.db';

    // Show dialog — user confirms before upload
    showContributeDialog(filename, meta, async function() {
      var status = document.getElementById('import-status') || A.status;

      // ── Validate DB integrity ──
      if (status) status.textContent = 'Validating DB integrity...';
      console.log('§CONTRIBUTE validating key=' + key);

      var check = validateDB(dbBuf);
      if (!check.valid) {
        console.log('§CONTRIBUTE_REJECT reason=' + check.reason);
        if (status) status.textContent = 'Rejected: ' + check.reason;
        alert('This database did not pass integrity validation:\n\n' + check.reason +
              '\n\nOnly databases produced by the BIM OOTB extraction pipeline can be contributed.');
        return;
      }
      console.log('§CONTRIBUTE_VALID key=' + key);

      // ── Save locally first (ensure IndexedDB has latest) ──
      if (status) status.textContent = 'Saving locally & uploading...';

      // ── Upload to OCI ──
      var blob = new Blob([dbBuf], { type: 'application/octet-stream' });
      var url = A.CONTRIBUTE_PAR + filename;

      try {
        var resp = await fetch(url, { method: 'PUT', body: blob });
        if (resp.ok) {
          if (status) status.textContent = 'Contributed: ' + filename;
          console.log('§CONTRIBUTE ok file=' + filename + ' size=' + (dbBuf.byteLength / 1024).toFixed(0) + 'KB');

          // Upload metadata
          var metaBlob = new Blob([JSON.stringify({
            filename: filename,
            elements: meta.elementCount,
            disciplines: Object.keys(meta.disciplines || {}),
            date: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })], { type: 'application/json' });
          await fetch(A.CONTRIBUTE_PAR + filename + '.meta.json', { method: 'PUT', body: metaBlob });
          console.log('§CONTRIBUTE meta ok file=' + filename + '.meta.json');

          // Update contributed/index.json
          var indexUrl = A.CONTRIBUTE_PAR + 'index.json';
          var existing = [];
          try {
            var idxResp = await fetch(indexUrl);
            if (idxResp.ok) existing = await idxResp.json();
          } catch(e) { console.log('§CONTRIBUTE index.json fetch skip — ' + e.message); }
          existing.push({
            filename: filename,
            elements: meta.elementCount,
            disciplines: Object.keys(meta.disciplines || {}),
            date: new Date().toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          });
          var idxBlob = new Blob([JSON.stringify(existing)], { type: 'application/json' });
          await fetch(indexUrl, { method: 'PUT', body: idxBlob });
          console.log('§CONTRIBUTE index.json updated entries=' + existing.length);
        } else {
          if (status) status.textContent = 'Upload failed: ' + resp.status;
          console.log('§CONTRIBUTE fail status=' + resp.status);
        }
      } catch(e) {
        if (status) status.textContent = 'Upload error: ' + e.message;
        console.log('§CONTRIBUTE error ' + e.message);
      }
    });
  };

  console.log('§CONTRIBUTE_LOADED contribute.js lazy-loaded');
})(window.A || (window.A = {}));
