/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// share.js — Unified Share (S265 Phase 3)
// Implementing S265_UI_AESTHETICS.md §Share refactor — navigator.share + buildShareUrl + hash restore
// Old WhatsApp/Email hardcodes REMOVED. One share path: system share sheet or clipboard.

function setupShare(A) {
  'use strict';

  // ── CSS injected once ──
  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '.share-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center}' +
      '.share-sheet{background:#1e1e1e;border:1px solid #444;border-radius:12px;padding:0;max-width:380px;width:90%;color:#eee;font-family:system-ui,sans-serif;overflow:hidden}' +
      '.share-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px 12px;border-bottom:1px solid #333}' +
      '.share-header h3{margin:0;font-size:15px;color:#fff}' +
      '.share-close{background:none;border:none;color:#888;font-size:18px;cursor:pointer;padding:4px 8px}' +
      '.share-close:hover{color:#fff}' +
      '.share-section{padding:8px 12px}' +
      '.share-section-label{font-size:10px;text-transform:uppercase;color:#666;letter-spacing:1px;padding:8px 8px 4px;margin:0}' +
      '.share-btn{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;background:transparent;border:none;color:#ddd;font-size:13px;cursor:pointer;border-radius:8px;text-align:left}' +
      '.share-btn:hover{background:rgba(255,255,255,0.06)}' +
      '.share-btn .share-icon{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}' +
      '.share-btn .share-label{flex:1}' +
      '.share-btn .share-sublabel{font-size:11px;color:#888;display:block}' +
      '.share-divider{border:none;border-top:1px solid #333;margin:0}' +
      '.share-status{padding:8px 20px 12px;font-size:11px;color:#888;text-align:center;min-height:20px}';
    document.head.appendChild(s);
  }

  // ── DB buffer helper — reads versioned or legacy ──
  function getDbBuffer(record) {
    if (record.versions && record.versions.length > 0) {
      return record.versions[record.latestVersion || 0].db;
    }
    return record.extractedDb;
  }

  // ── DB Integrity Validation (same as contribute.js) ──
  function validateDB(dbBytes) {
    try {
      var SQL_inst = new (window.SQL || window._SQL_CACHED).Database(new Uint8Array(dbBytes));
      var tables = SQL_inst.exec("SELECT name FROM sqlite_master WHERE type='table'");
      if (!tables.length) { SQL_inst.close(); return { valid: false, reason: 'No tables found' }; }
      var tableNames = tables[0].values.map(function(r) { return r[0]; });
      var required = ['meshes', 'elements', 'building'];
      var missing = required.filter(function(t) { return tableNames.indexOf(t) === -1; });
      if (missing.length > 0) { SQL_inst.close(); return { valid: false, reason: 'Missing tables: ' + missing.join(', ') }; }

      var sample = SQL_inst.exec("SELECT vertices FROM meshes LIMIT 3");
      if (sample.length && sample[0].values.length > 0) {
        for (var i = 0; i < sample[0].values.length; i++) {
          var blob = sample[0].values[i][0];
          if (blob && blob.byteLength % 4 !== 0) {
            SQL_inst.close();
            return { valid: false, reason: 'Mesh BLOB not aligned to Float32Array' };
          }
        }
      }

      var bldCount = SQL_inst.exec("SELECT COUNT(*) FROM building");
      if (!bldCount.length || bldCount[0].values[0][0] === 0) {
        SQL_inst.close();
        return { valid: false, reason: 'No building record found' };
      }

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

  // ── Save as DB (download) ──
  function saveAsDB(record, key, statusEl) {
    var dbBuf = getDbBuffer(record);
    if (!dbBuf) { statusEl.textContent = 'No DB data'; return; }
    var filename = (record.meta.filename || record.meta.name || key).replace(/\.[^.]+$/, '') + '_extracted.db';
    var blob = new Blob([dbBuf], { type: 'application/octet-stream' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    statusEl.textContent = 'Saved: ' + filename;
    console.log('§SHARE saveAsDB file=' + filename + ' size=' + (dbBuf.byteLength / 1024).toFixed(0) + 'KB');
    // S260b: Also download split DBs if present in record
    if (record.metaDb && record.geoDb) {
      var baseName = filename.replace('_extracted.db', '');
      var metaBlob = new Blob([record.metaDb], { type: 'application/octet-stream' });
      var ml = document.createElement('a');
      ml.href = URL.createObjectURL(metaBlob);
      ml.download = baseName + '_meta.db';
      ml.click();
      URL.revokeObjectURL(ml.href);
      var geoBlob = new Blob([record.geoDb], { type: 'application/octet-stream' });
      var gl = document.createElement('a');
      gl.href = URL.createObjectURL(geoBlob);
      gl.download = baseName + '_geo.db';
      gl.click();
      URL.revokeObjectURL(gl.href);
      console.log('§SHARE saveAsDB split: ' + baseName + '_meta.db + ' + baseName + '_geo.db');
    }
  }

  // ── Save as IFC (delegates to existing exportIFC) ──
  function saveAsIFC(key, statusEl) {
    statusEl.textContent = 'Exporting IFC...';
    if (A.exportIFC) {
      A.exportIFC(key);
      statusEl.textContent = 'IFC export started';
    } else {
      statusEl.textContent = 'IFC export not available';
    }
  }

  // ── Contribute to OOTB Gallery ──
  async function contributeToOOTB(record, key, statusEl) {
    if (!A.CONTRIBUTE_PAR) {
      statusEl.textContent = 'Contribute not configured (no PAR URL)';
      console.log('§SHARE contribute skip — no CONTRIBUTE_PAR');
      return null;
    }

    var dbBuf = getDbBuffer(record);
    if (!dbBuf) { statusEl.textContent = 'No DB data'; return null; }

    var meta = record.meta || {};
    var filename = (meta.filename || meta.name || key).replace(/\.[^.]+$/, '') + '_extracted.db';

    // Validate DB integrity
    statusEl.textContent = 'Validating DB integrity...';
    console.log('§SHARE validating key=' + key);
    var check = validateDB(dbBuf);
    if (!check.valid) {
      console.log('§SHARE_REJECT reason=' + check.reason);
      statusEl.textContent = 'Rejected: ' + check.reason;
      alert('This database did not pass integrity validation:\n\n' + check.reason +
            '\n\nOnly databases produced by the BIM OOTB extraction pipeline can be contributed.');
      return null;
    }
    console.log('§SHARE_VALID key=' + key);

    // Upload
    statusEl.textContent = 'Uploading to gallery...';
    var blob = new Blob([dbBuf], { type: 'application/octet-stream' });
    var url = A.CONTRIBUTE_PAR + filename;

    try {
      var resp = await fetch(url, { method: 'PUT', body: blob });
      if (!resp.ok) {
        statusEl.textContent = 'Upload failed: ' + resp.status;
        console.log('§SHARE contribute fail status=' + resp.status);
        return null;
      }

      console.log('§SHARE contribute ok file=' + filename + ' size=' + (dbBuf.byteLength / 1024).toFixed(0) + 'KB');

      // Upload metadata
      var metaBlob = new Blob([JSON.stringify({
        filename: filename,
        elements: meta.elementCount,
        disciplines: Object.keys(meta.disciplines || {}),
        date: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })], { type: 'application/json' });
      await fetch(A.CONTRIBUTE_PAR + filename + '.meta.json', { method: 'PUT', body: metaBlob });
      console.log('§SHARE meta ok file=' + filename + '.meta.json');

      // Update index.json
      var indexUrl = A.CONTRIBUTE_PAR + 'index.json';
      var existing = [];
      try {
        var idxResp = await fetch(indexUrl);
        if (idxResp.ok) existing = await idxResp.json();
      } catch(e) { console.log('§SHARE index.json fetch skip — ' + e.message); }
      existing.push({
        filename: filename,
        elements: meta.elementCount,
        disciplines: Object.keys(meta.disciplines || {}),
        date: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
      var idxBlob = new Blob([JSON.stringify(existing)], { type: 'application/json' });
      await fetch(indexUrl, { method: 'PUT', body: idxBlob });
      console.log('§SHARE index.json updated entries=' + existing.length);

      statusEl.textContent = 'Contributed! Sharing...';
      return filename;
    } catch(e) {
      statusEl.textContent = 'Upload error: ' + e.message;
      console.log('§SHARE contribute error ' + e.message);
      return null;
    }
  }

  // ── Build share URL with current scene state ──
  // Implementing S265_UI_AESTHETICS.md §Task 3b — camera + element + clash + TM + storey in URL hash
  A.buildShareUrl = function() {
    // Build base URL same way as _buildClashDeepLink — encodeURIComponent for ?db=
    var dbParam = new URLSearchParams(location.search).get('db') || '';
    var base = location.origin + location.pathname + (dbParam ? '?db=' + encodeURIComponent(dbParam) : '');
    var parts = [];

    // Camera position + target
    if (A.camera && A.controls) {
      var p = A.camera.position;
      var t = A.controls.target;
      parts.push('cam=' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ',' + p.z.toFixed(1));
      parts.push('tgt=' + t.x.toFixed(1) + ',' + t.y.toFixed(1) + ',' + t.z.toFixed(1));
    }

    // Picked element — read from info panel guid display
    var infoGuidEl = document.getElementById('info-guid');
    var infoPanel = document.getElementById('info-panel');
    if (infoGuidEl && infoPanel && infoPanel.style.display !== 'none') {
      var pickGuid = infoGuidEl.textContent;
      if (pickGuid && pickGuid !== '—' && pickGuid.length > 5) {
        parts.push('pick=' + encodeURIComponent(pickGuid));
      }
    }

    // Active storey filter
    if (A.activeStoreyFilter !== null && A.activeStoreyFilter !== undefined) {
      if (Array.isArray(A.activeStoreyFilter)) {
        parts.push('storey=' + encodeURIComponent(A.activeStoreyFilter.join(',')));
      } else {
        parts.push('storey=' + encodeURIComponent(A.activeStoreyFilter));
      }
    }

    // X-ray state
    if (A.xrayOn) {
      parts.push('xray=1');
    }

    // Clash pair — use _buildClashDeepLink (proven working, S246)
    if (A._currentClashes && A._currentClashes.length > 0 && A._buildClashDeepLink) {
      var viewIdx = A._currentClashViewIdx || 0;
      var clashUrl = A._buildClashDeepLink(A._currentClashes[viewIdx] || A._currentClashes[0]);
      if (clashUrl) {
        console.log('§SHARE_URL clash_deeplink=' + clashUrl);
        return clashUrl; // Use the proven clash URL format directly
      }
    }

    // Time Machine — expose via tmGetState if available
    if (typeof window.tmGetState === 'function') {
      var tm = window.tmGetState();
      if (tm.active) {
        parts.push('tm=' + tm.cursor);
      }
    }

    // Tour — cinematic storyboard playing
    if (A.flyActive) {
      parts.push('tour=play');
    }

    var hash = parts.length > 0 ? '#' + parts.join('&') : '';
    var shareUrl = base + hash;

    var state = parts.length > 0 ? parts.map(function(p) { return p.split('=')[0]; }).join(',') : 'none';
    // §-tagged diagnostic: show what was checked and why each context was included/skipped
    var diag = [];
    diag.push('cam=' + !!(A.camera && A.controls));
    var ip = document.getElementById('info-panel');
    diag.push('pick=' + (ip ? ip.style.display : 'null'));
    diag.push('storey=' + (A.activeStoreyFilter !== null && A.activeStoreyFilter !== undefined ? A.activeStoreyFilter : 'null'));
    diag.push('xray=' + !!A.xrayOn);
    diag.push('clash=' + (A._currentClashes ? A._currentClashes.length : 0));
    diag.push('tm=' + (typeof window.tmGetState === 'function' ? window.tmGetState().active : 'no_fn'));
    diag.push('fly=' + !!A.flyActive);
    diag.push('measure=' + !!A.measureActive);
    diag.push('walk=' + !!A.walkModeActive);
    console.log('§SHARE_URL state=' + state + ' ctx=[' + diag.join(',') + '] url=' + shareUrl);
    return shareUrl;
  };

  // ── Share URL helper (used by share sheet "Share/Copy Link" button) ──
  // Not used by quickShare — quickShare has its own inline navigator.share call.
  A.shareUrl = async function(url, title) {
    title = title || document.title || 'BIM OOTB';
    var text = title + '\n\nView in browser (no install):\n' + url;

    if (navigator.share && navigator.canShare) {
      var data = { title: title, text: text, url: url };
      if (navigator.canShare(data)) {
        try {
          await navigator.share(data);
          console.log('§SHARE_METHOD native');
          return;
        } catch (err) {
          if (err.name === 'AbortError') { console.log('§SHARE_METHOD native_abort'); return; }
          console.log('§SHARE_METHOD native_err=' + err.message);
        }
      }
    }

    // Desktop fallback: clipboard copy
    try {
      await navigator.clipboard.writeText(url);
      if (A.status) A.status.textContent = 'Link copied to clipboard!';
      console.log('§SHARE_METHOD clipboard');
    } catch(e) {
      var ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      if (A.status) A.status.textContent = 'Link copied!';
      console.log('§SHARE_METHOD clipboard_fallback');
    }
  };

  // ── URL shortener — TinyURL, no API key needed ──
  // Try to shorten; fall back to long URL if offline or error.
  function shortenUrl(longUrl, callback) {
    if (!navigator.onLine) { callback(longUrl); return; }
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 3000);
    fetch('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(longUrl), { signal: controller.signal })
      .then(function(r) { clearTimeout(timeout); return r.text(); })
      .then(function(short) {
        short = short.trim();
        if (short && short.startsWith('http')) {
          console.log('§SHARE_SHORT ok=' + short);
          callback(short);
        } else {
          console.log('§SHARE_SHORT bad_response=' + short);
          callback(longUrl);
        }
      })
      .catch(function(e) {
        clearTimeout(timeout);
        console.log('§SHARE_SHORT fallback reason=' + e.message);
        callback(longUrl);
      });
  }

  // ── Facebook-style share animation ──
  // Canvas snapshot shrinks to top, share details + URL appear below
  function showSharePreview(longUrl, title) {
    // Capture canvas as image
    var canvas = document.getElementById('canvas');
    var snapshot = null;
    try {
      if (canvas && canvas.toDataURL) snapshot = canvas.toDataURL('image/jpeg', 0.7);
    } catch(e) { console.log('§SHARE_SNAP_ERR ' + e.message); }

    // Build context line from current state
    var contextParts = [];
    if (A.activeBuilding) contextParts.push(A.activeBuilding);
    var infoClass = document.getElementById('info-class');
    var infoPanel = document.getElementById('info-panel');
    if (infoClass && infoPanel && infoPanel.style.display !== 'none') {
      var cls = infoClass.textContent;
      if (cls && cls !== '—') contextParts.push(cls);
    }
    if (A.activeStoreyFilter) {
      var st = Array.isArray(A.activeStoreyFilter) ? A.activeStoreyFilter.join(', ') : A.activeStoreyFilter;
      contextParts.push(st);
    }
    if (A._currentClashes && A._currentClashes.length > 0) contextParts.push('Clash view');
    if (A.xrayOn) contextParts.push('X-Ray');
    var contextLine = contextParts.join(' \u00b7 ') || 'BIM OOTB';

    // The URL that will be shared — starts as long, updated when short URL arrives
    var shareUrlFinal = longUrl;

    // Create overlay
    var overlay = document.createElement('div');
    overlay.id = 'share-preview-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'background:rgba(0,0,0,0.85);z-index:10000;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:flex-start;padding:24px 16px;' +
      'opacity:0;transition:opacity 0.3s ease';

    // Snapshot image — starts full size, shrinks via CSS transition
    var img = document.createElement('img');
    if (snapshot) {
      img.src = snapshot;
    }
    img.style.cssText = 'width:100%;max-width:480px;border-radius:12px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-top:20px;' +
      'transform:scale(1);transition:transform 0.5s cubic-bezier(0.25,0.46,0.45,0.94),' +
      'margin-top 0.5s cubic-bezier(0.25,0.46,0.45,0.94)';

    // Details card — appears below snapshot
    var card = document.createElement('div');
    card.style.cssText = 'background:#1e1e1e;border:1px solid #444;border-radius:12px;' +
      'max-width:480px;width:100%;margin-top:16px;padding:16px 20px;' +
      'font-family:system-ui,sans-serif;opacity:0;transform:translateY(20px);' +
      'transition:opacity 0.4s ease 0.3s,transform 0.4s ease 0.3s';

    // Context line
    var ctxEl = document.createElement('div');
    ctxEl.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:8px';
    ctxEl.textContent = contextLine;
    card.appendChild(ctxEl);

    // URL display — long URL (TinyURL links don't resolve reliably)
    var urlEl = document.createElement('div');
    urlEl.style.cssText = 'color:#4fc3f7;font-size:11px;word-break:break-all;' +
      'max-height:60px;overflow:hidden;margin-bottom:16px;line-height:1.4;' +
      'background:rgba(0,0,0,0.3);padding:8px 10px;border-radius:6px;font-family:monospace';
    urlEl.textContent = longUrl;
    card.appendChild(urlEl);

    // Action buttons row
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center';

    // Copy Link button — copies long URL to clipboard
    var shareBtn = document.createElement('button');
    shareBtn.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;' +
      'background:#4fc3f7;color:#000;font-size:14px;font-weight:600;cursor:pointer';
    shareBtn.textContent = 'Copy Link';
    shareBtn.onclick = function() {
      navigator.clipboard.writeText(longUrl).then(function() {
        shareBtn.textContent = 'Copied!';
        shareBtn.style.background = '#4caf50';
        console.log('§SHARE_METHOD clipboard_preview');
        setTimeout(function() {
          shareBtn.textContent = 'Copy Link';
          shareBtn.style.background = '#4fc3f7';
        }, 2000);
      });
    };
    btnRow.appendChild(shareBtn);

    // Cancel button
    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'padding:12px 20px;border:1px solid #555;border-radius:8px;' +
      'background:transparent;color:#aaa;font-size:14px;cursor:pointer';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closePreview;
    btnRow.appendChild(cancelBtn);
    card.appendChild(btnRow);

    overlay.appendChild(img);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function closePreview() {
      // Reverse animation
      img.style.transform = 'scale(1)';
      img.style.marginTop = '20px';
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      overlay.style.opacity = '0';
      setTimeout(function() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 400);
    }

    // Tap on overlay background = close
    overlay.onclick = function(e) { if (e.target === overlay) closePreview(); };

    // Animate in: fade overlay → shrink snapshot → reveal card
    requestAnimationFrame(function() {
      overlay.style.opacity = '1';
      requestAnimationFrame(function() {
        img.style.transform = 'scale(0.65)';
        img.style.marginTop = '10px';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      });
    });

    console.log('§SHARE_PREVIEW shown url_len=' + longUrl.length);
  }

  // ── Quick share (pill icon) — same flow as sitecam.js shareSitePhoto ──
  // CRITICAL: navigator.share() MUST be called in the same synchronous chain
  // as the user click. Pattern copied from sitecam.js line 456-501.
  // Mobile: canvas snapshot as file + URL in text → native share picker (with image attached)
  // Desktop (no Web Share API): show preview card with short URL + copy/share buttons
  A.quickShare = async function() {
    // Clash context: build same text + deep_link as _shareClashSnag (clash_snag.js:120-127)
    // WITHOUT opening the site camera markup UI (_snagClash opens it — wrong for pill share).
    // Data fields match _pendingClashSnag (clash_snag.js:36-52).
    if (A._currentClashes && A._currentClashes.length > 0 && A._buildClashDeepLink) {
      var c = A._currentClashes[A._currentClashViewIdx || 0];
      if (!c) c = A._currentClashes[0];
      var overlap = (typeof c[8] === 'number') ? c[8] : 0;
      var sev = A._clashSeverity ? A._clashSeverity(overlap, A._currentClashRules) : { label: 'clash' };
      var storeyRows = A.db ? A.dbQuery("SELECT storey FROM elements_meta WHERE guid = ?", [c[0]]) : [];
      var storey = storeyRows.length ? storeyRows[0][0] : '?';
      var deepLink = A._buildClashDeepLink(c);
      // Same text format as _shareClashSnag (clash_snag.js:123-127)
      var discA = c[4] || '?', discB = c[5] || '?';
      var title = 'Clash: ' + discA + ' vs ' + discB + ' \u2014 ' + (sev.label || 'clash');
      var text = 'Clash: ' + discA + ' vs ' + discB +
        '\n' + (c[6] || c[0]) + ' / ' + (c[7] || c[1]) +
        '\nStorey ' + storey + ' \u2014 ' + Math.round(overlap * 1000) + 'mm (' + (sev.label || 'clash') + ')' +
        '\n\n' + deepLink;
      console.log('§SHARE_CLASH title=' + title);

      // Capture canvas as JPEG (no markup UI) + share with photo like sitecam
      if (navigator.share && navigator.canShare) {
        A.renderer.render(A.scene, A.camera);
        var blob = await new Promise(function(r) { A.canvas.toBlob(function(b) { r(b); }, 'image/jpeg', 0.8); });
        if (blob) {
          var photoFile = new File([blob], 'Clash_' + discA + '_' + discB + '.jpg', { type: 'image/jpeg' });
          var data = { files: [photoFile], title: title, text: text };
          if (navigator.canShare(data)) {
            try { await navigator.share(data); console.log('§SHARE_METHOD native_clash'); return; }
            catch (err) { if (err.name === 'AbortError') { console.log('§SHARE_METHOD clash_abort'); return; } }
          }
        }
      }
      // Desktop fallback: preview card with clash deep-link
      showSharePreview(deepLink, title);
      return;
    }

    var longUrl = A.buildShareUrl();
    var title = (A.activeBuilding || 'BIM Model') + ' — BIM OOTB';
    var text = title + '\n\nView in browser (no install):\n' + longUrl;

    // Try native share with canvas snapshot as file (like sitecam.js)
    console.log('§SHARE_ATTEMPT navigator.share=' + !!navigator.share + ' canShare=' + !!navigator.canShare);
    if (navigator.share && navigator.canShare) {
      // Capture canvas as JPEG blob — same as sitecam._getMarkupBlob
      var canvas = document.getElementById('canvas');
      var blob = null;
      try {
        blob = await new Promise(function(resolve) {
          canvas.toBlob(function(b) { resolve(b); }, 'image/jpeg', 0.8);
        });
      } catch(e) { console.log('§SHARE_SNAP_ERR ' + e.message); }

      if (blob) {
        var fileName = 'BIM_' + (A.activeBuilding || 'view') + '.jpg';
        var photoFile = new File([blob], fileName, { type: 'image/jpeg' });
        var data = { files: [photoFile], title: title, text: text };
        if (navigator.canShare(data)) {
          try {
            await navigator.share(data);
            console.log('§SHARE_METHOD native_with_photo');
            return;
          } catch (err) {
            if (err.name === 'AbortError') { console.log('§SHARE_METHOD native_abort'); return; }
            console.log('§SHARE_METHOD native_photo_err=' + err.message);
          }
        }
      }

      // Photo share failed — try URL-only share
      var urlData = { title: title, text: text, url: longUrl };
      if (navigator.canShare(urlData)) {
        try {
          await navigator.share(urlData);
          console.log('§SHARE_METHOD native_url_only');
          return;
        } catch (err) {
          if (err.name === 'AbortError') { console.log('§SHARE_METHOD native_abort'); return; }
          console.log('§SHARE_METHOD native_url_err=' + err.message);
        }
      }
    }

    // Desktop fallback: show preview card with short URL
    showSharePreview(longUrl, title);
    console.log('§SHARE_METHOD preview_fallback');
  };

  // ── Share Sheet UI (for IndexedDB imports that need Contribute) ──
  A.openShareSheet = async function(key) {
    injectStyle();

    var record = await A._getImport(key);
    if (!record) { alert('Building not found in storage'); return; }

    var meta = record.meta || {};
    var displayName = (meta.filename || meta.name || key).replace(/\.[^.]+$/, '');

    // Build overlay
    var overlay = document.createElement('div');
    overlay.className = 'share-overlay';

    var sheet = document.createElement('div');
    sheet.className = 'share-sheet';

    sheet.innerHTML =
      '<div class="share-header">' +
        '<h3>Share: ' + displayName + '</h3>' +
        '<button class="share-close" data-share-close>&times;</button>' +
      '</div>' +

      // Save section
      '<p class="share-section-label">Save as</p>' +
      '<div class="share-section">' +
        '<button class="share-btn" data-share-ifc>' +
          '<span class="share-icon" style="background:rgba(79,195,247,0.15);color:#4fc3f7">IFC</span>' +
          '<span class="share-label">IFC File<span class="share-sublabel">Industry Foundation Classes (.ifc)</span></span>' +
        '</button>' +
        '<button class="share-btn" data-share-db>' +
          '<span class="share-icon" style="background:rgba(156,39,176,0.15);color:#ce93d8">DB</span>' +
          '<span class="share-label">SQLite Database<span class="share-sublabel">Extracted geometry + metadata (.db)</span></span>' +
        '</button>' +
        '<button class="share-btn" data-share-ootb>' +
          '<span class="share-icon" style="background:rgba(76,175,80,0.15);color:#4caf50">&#9729;</span>' +
          '<span class="share-label">Contribute to OOTB Gallery<span class="share-sublabel">Upload — then share via link</span></span>' +
        '</button>' +
      '</div>' +

      '<hr class="share-divider">' +

      // Share section — always active, builds URL with state
      '<p class="share-section-label">Share link</p>' +
      '<div class="share-section">' +
        '<button class="share-btn" data-share-link>' +
          '<span class="share-icon" style="background:rgba(79,195,247,0.15);color:#4fc3f7">&#128279;</span>' +
          '<span class="share-label">Share / Copy Link<span class="share-sublabel">Camera + element + state in URL</span></span>' +
        '</button>' +
      '</div>' +

      '<div class="share-status" data-share-status></div>';

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    // References
    var statusEl = sheet.querySelector('[data-share-status]');

    // Close handlers
    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    sheet.querySelector('[data-share-close]').onclick = close;
    overlay.onclick = function(e) { if (e.target === overlay) close(); };

    // Save as IFC
    sheet.querySelector('[data-share-ifc]').onclick = function() {
      saveAsIFC(key, statusEl);
    };

    // Save as DB
    sheet.querySelector('[data-share-db]').onclick = function() {
      saveAsDB(record, key, statusEl);
    };

    // Contribute to OOTB — uploads, then shares
    sheet.querySelector('[data-share-ootb]').onclick = async function() {
      var uploaded = await contributeToOOTB(record, key, statusEl);
      if (uploaded) {
        statusEl.textContent = 'Uploaded! Use Share Link to send.';
      }
    };

    // Share / Copy Link — uses navigator.share or clipboard
    sheet.querySelector('[data-share-link]').onclick = function() {
      var url = A.buildShareUrl();
      A.shareUrl(url, displayName + ' — BIM OOTB');
      statusEl.textContent = 'Shared!';
    };
  };

  console.log('§SHARE_LOADED share.js v2 (S265 Phase 3 — navigator.share + buildShareUrl)');
}
