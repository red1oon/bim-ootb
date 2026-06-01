// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// clash_snag.js — Clash snag/annotation system (extracted from measure.js)
// S246 v1 — snap viewport, annotate, share deep-link, save to IndexedDB
function setupClashSnag(A) {

  // ── State ──
  A._pendingClashSnag = null;

  // S246: Snag a clash — capture viewport, composite metadata, open markup preview
  A._snagClash = function(idx) {
    var c = (A._currentClashes || [])[idx];
    if (!c) return;
    // Snap current user view as-is — user already orbited to desired angle
    // Render one frame to ensure current state is drawn
    if (A.renderer) A.renderer.render(A.scene, A.camera);

    // Acquire GPS (same as sitecam — non-blocking, result stored for share/save)
    A._camGpsPos = null;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(pos) { A._camGpsPos = pos; },
        function() {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }

    // Build clash metadata while canvas encodes (non-blocking)
    var clsA = (c[2] || '?').replace('Ifc', '').replace('StandardCase', '');
    var clsB = (c[3] || '?').replace('Ifc', '').replace('StandardCase', '');
    var overlap = (typeof c[8] === 'number') ? c[8] : 0;
    var sev = A._clashSeverity(overlap, A._currentClashRules);
    var storeyRows = A.dbQuery("SELECT storey FROM elements_meta WHERE guid = ?", [c[0]]);
    var storey = storeyRows.length ? storeyRows[0][0] : '?';
    var deepLink = A._buildClashDeepLink(c);

    // Store pending clash snag info for share/save
    A._pendingClashSnag = {
      type: 'clash',
      element_a_guid: c[0],
      element_b_guid: c[1],
      element_a_class: c[2] || '',
      element_b_class: c[3] || '',
      element_a_name: c[6] || '',
      element_b_name: c[7] || '',
      discipline_a: c[4] || '',
      discipline_b: c[5] || '',
      discipline_pair: (c[4] || '') + '|' + (c[5] || ''),
      overlap_mm: Math.round(overlap * 1000),
      severity: sev.label || 'unknown',
      storey: storey,
      camera_pos: { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z },
      camera_target: { x: A.controls.target.x, y: A.controls.target.y, z: A.controls.target.z },
      deep_link: deepLink
    };

    // Capture viewport — direct drawImage from WebGL canvas (no toBlob/Image roundtrip)
    var t0 = performance.now();
    var cW = A.canvas.width, cH = A.canvas.height;
    var stripTotal = 66;
    var c2 = document.createElement('canvas');
    c2.width = cW;
    c2.height = cH + stripTotal;
    var ctx = c2.getContext('2d');

    // Draw WebGL canvas directly — requires preserveDrawingBuffer OR render just happened (line 776)
    ctx.drawImage(A.canvas, 0, 0, cW, cH);

    // Metadata strip
    var gpsText = A._formatGps ? A._formatGps(A._camGpsPos) : '';
    var tsText = A._formatTimestamp ? A._formatTimestamp() : new Date().toLocaleString();

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, cH, cW, stripTotal);

    // Line 1: Clash severity + overlap
    ctx.font = 'bold 13px "Segoe UI", sans-serif';
    ctx.fillStyle = sev.color || '#ff8c00';
    ctx.fillText('CLASH: ' + clsA + ' \u2194 ' + clsB + '  ' + overlap.toFixed(3) + 'm (' + (sev.label || '') + ')', 10, cH + 16);

    // Line 2: Element names
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ccc';
    ctx.fillText((c[6] || c[0]).substring(0, 40) + ' / ' + (c[7] || c[1]).substring(0, 40), 10, cH + 32);

    // Line 3: Discipline + storey
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText((c[4] || '') + ' vs ' + (c[5] || '') + '  \u2014  Storey: ' + storey, 10, cH + 47);

    // Line 4: GPS + timestamp
    ctx.font = '11px monospace';
    ctx.fillStyle = '#00ff00';
    ctx.fillText(gpsText, 10, cH + 62);
    var tw = ctx.measureText(tsText).width;
    ctx.fillText(tsText, cW - tw - 10, cH + 62);

    // Open markup preview
    var mc = document.getElementById('site-cam-markup');
    mc.width = c2.width;
    mc.height = c2.height;
    mc.getContext('2d').drawImage(c2, 0, 0);
    A._markupBaseImage = c2;
    A._markupStrokes = [];
    A._camPhotoBlob = null;
    A._markupListenersSet = false;
    document.getElementById('site-cam-preview').classList.add('active');
    history.pushState({ sitePreview: true }, '');
    A._initMarkupListeners(mc);

    var ms = (performance.now() - t0).toFixed(0);
    console.log('§CLASH_SNAG idx=' + idx + ' guidA=' + c[0] + ' guidB=' + c[1] + ' overlap=' + overlap.toFixed(3) + 'm snap=' + ms + 'ms');
  };

  // S246: Share clash snag — override for clash-specific text + deep-link
  A._shareClashSnag = async function() {
    var cs = A._pendingClashSnag;
    if (!cs) { if (A.shareSitePhoto) A.shareSitePhoto(); return; }

    var blob = await A._getMarkupBlob();
    if (!blob) return;

    var title = 'Clash: ' + cs.discipline_pair.replace('|', ' vs ') + ' \u2014 ' + cs.severity;
    var gpsLine = A._camGpsPos ? '\nGPS: ' + A._formatGps(A._camGpsPos) : '';
    var mapsLink = A._camGpsPos ? '\nhttps://maps.google.com/?q=' + A._camGpsPos.coords.latitude + ',' + A._camGpsPos.coords.longitude : '';
    var text = 'Clash: ' + cs.discipline_a + ' vs ' + cs.discipline_b +
      '\n' + cs.element_a_name + ' / ' + cs.element_b_name +
      '\nStorey ' + cs.storey + ' \u2014 ' + cs.overlap_mm + 'mm (' + cs.severity + ')' +
      gpsLine + mapsLink +
      '\n\n' + cs.deep_link;

    var fileName = 'Clash_' + cs.discipline_pair.replace('|', '_') + '_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.jpg';
    var photoFile = new File([blob], fileName, { type: 'image/jpeg' });

    var shared = false;
    if (navigator.share && navigator.canShare) {
      var data = { files: [photoFile], title: title, text: text };
      if (navigator.canShare(data)) {
        try {
          await navigator.share(data);
          shared = true;
          console.log('§CLASH_SNAG_SHARE OK');
        } catch (err) {
          if (err.name === 'AbortError') {
            A.closeSitePreview();
            A._pendingClashSnag = null;
            console.log('§CLASH_SNAG_SHARE_ABORT');
            return;
          }
          console.log('§CLASH_SNAG_SHARE_ERR ' + err.message);
        }
      }
    }
    if (!shared) {
      // S246b: Desktop share panel — Copy + WhatsApp + Email buttons
      var waUrl = 'https://wa.me/?text=' + encodeURIComponent(title + '\n' + text);
      var emailUrl = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(text);
      var panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(30,30,50,0.97);border-radius:12px;padding:20px 24px;border:1px solid rgba(79,195,247,0.5);font-family:Segoe UI,sans-serif;text-align:center;backdrop-filter:blur(8px)';
      panel.innerHTML = '<div style="color:#4fc3f7;font-size:14px;margin-bottom:12px;font-weight:bold">Share Clash Snag</div>' +
        '<button id="share-copy" style="display:block;width:100%;margin:6px 0;padding:10px;background:#333;color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:13px">🔗 Copy URL</button>' +
        '<button id="share-wa" style="display:block;width:100%;margin:6px 0;padding:10px;background:#25d366;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">💬 WhatsApp</button>' +
        '<div style="color:#888;font-size:10px;margin:-4px 0 4px;font-style:italic">Paste copied image before sending</div>' +
        '<button id="share-email" style="display:block;width:100%;margin:6px 0;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">📧 Email</button>' +
        '<div style="color:#888;font-size:10px;margin:-4px 0 4px;font-style:italic">Paste copied image before sending</div>' +
        '<button id="share-qr" style="display:block;width:100%;margin:6px 0;padding:10px;background:#555;color:#fff;border:1px solid #777;border-radius:6px;cursor:pointer;font-size:13px">📱 QR Code</button>' +
        '<button id="share-close" style="display:block;width:100%;margin:10px 0 0;padding:8px;background:transparent;color:#888;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:12px">Cancel</button>';
      document.body.appendChild(panel);
      var _dismiss = function() {
        panel.remove();
        A._saveClashIssue(cs, blob);
        A.closeSitePreview();
        A._pendingClashSnag = null;
      };
      // Copy URL to clipboard with confirmation dialog
      panel.querySelector('#share-copy').addEventListener('click', async function() {
        try {
          await navigator.clipboard.writeText(cs.deep_link);
          console.log('§CLASH_SNAG_CLIPBOARD url OK');
        } catch(e) {
          console.log('§CLASH_SNAG_CLIPBOARD err: ' + e.message);
        }
        panel.remove();
        var dlg = document.createElement('div');
        dlg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;background:rgba(30,30,50,0.97);border-radius:12px;padding:24px 32px;border:1px solid rgba(79,195,247,0.5);text-align:center;font-family:Segoe UI,sans-serif;backdrop-filter:blur(8px)';
        dlg.innerHTML = '<div style="color:#4fc3f7;font-size:16px;font-weight:bold;margin-bottom:10px">🔗 URL Copied</div>' +
          '<div style="color:#ccc;font-size:13px;margin-bottom:16px;max-width:340px">Clash deep-link copied to clipboard.<br>Paste in WhatsApp, Email, or any medium to share.</div>' +
          '<button style="padding:8px 24px;background:#4fc3f7;color:#000;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold">OK</button>';
        dlg.querySelector('button').onclick = function() { dlg.remove(); _dismiss(); };
        document.body.appendChild(dlg);
      });
      panel.querySelector('#share-wa').addEventListener('click', async function() {
        try {
          var img = new Image(); var pngBlob = await new Promise(function(resolve) {
            img.onload = function() { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); c.toBlob(function(b) { resolve(b); }, 'image/png'); };
            img.src = URL.createObjectURL(blob);
          });
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          console.log('§CLASH_SNAG_WA image copied');
        } catch(e) { console.log('§CLASH_SNAG_WA image copy failed: ' + e.message); }
        window.open(waUrl, '_blank'); _dismiss(); console.log('§CLASH_SNAG_WA');
      });
      panel.querySelector('#share-email').addEventListener('click', async function() {
        try {
          var img = new Image(); var pngBlob = await new Promise(function(resolve) {
            img.onload = function() { var c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); c.toBlob(function(b) { resolve(b); }, 'image/png'); };
            img.src = URL.createObjectURL(blob);
          });
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          console.log('§CLASH_SNAG_EMAIL image copied');
        } catch(e) { console.log('§CLASH_SNAG_EMAIL image copy failed: ' + e.message); }
        window.open(emailUrl, '_blank'); _dismiss(); console.log('§CLASH_SNAG_EMAIL');
      });
      panel.querySelector('#share-qr').addEventListener('click', async function() {
        panel.remove();
        // Copy deep-link to clipboard, then show QR overlay with confirmation dialog
        var label = 'Clash: ' + cs.discipline_pair.replace('|', ' vs ');
        try { await navigator.clipboard.writeText(cs.deep_link); } catch(e) {}
        if (A.showQRShare) {
          A.showQRShare(cs.deep_link, label);
        }
        // Show confirmation dialog over QR
        var dlg = document.createElement('div');
        dlg.style.cssText = 'position:fixed;bottom:20%;left:50%;transform:translateX(-50%);z-index:10001;background:rgba(30,30,50,0.97);border-radius:12px;padding:20px 28px;border:1px solid rgba(79,195,247,0.5);text-align:center;font-family:Segoe UI,sans-serif';
        dlg.innerHTML = '<div style="color:#4fc3f7;font-size:15px;font-weight:bold;margin-bottom:8px">QR/URL Link Copied</div>' +
          '<div style="color:#ccc;font-size:12px;margin-bottom:14px;max-width:300px">Paste in WhatsApp, Email, or any medium to share.<br>Or scan the QR code above.</div>' +
          '<button style="padding:8px 20px;background:#4fc3f7;color:#000;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold">OK</button>';
        dlg.querySelector('button').onclick = function() { dlg.remove(); };
        document.body.appendChild(dlg);
        console.log('§CLASH_SNAG_QR shown+copied deepLink=' + (cs.deep_link || '').substring(0, 60));
      });
      panel.querySelector('#share-close').addEventListener('click', _dismiss);
      console.log('§CLASH_SNAG_SHARE_PANEL shown (desktop fallback)');
      return; // Don't close preview yet — user picks from panel
    }

    // Save to IndexedDB
    A._saveClashIssue(cs, blob);
    A.closeSitePreview();
    A._pendingClashSnag = null;
    A.status.textContent = '\uD83D\uDCF8 ' + (typeof _TRL!=='undefined'&&_TRL.ui_clash_shared||'Clash snag shared');
  };

  // S246: Download clash snag (save annotated image to file)
  A._downloadClashSnag = async function() {
    var cs = A._pendingClashSnag;
    if (!cs) { if (A.downloadSitePhoto) A.downloadSitePhoto(); return; }
    var blob = await A._getMarkupBlob();
    if (!blob) return;
    var fileName = 'Clash_' + cs.discipline_pair.replace('|', '_') + '_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.jpg';
    var link = document.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(blob);
    link.click();
    A._saveClashIssue(cs, blob);
    A._pendingClashSnag = null;
    console.log('§CLASH_SNAG_DOWNLOAD ' + fileName);
  };

  // S246: Save clash snag to IndexedDB (extended issue record)
  A._saveClashIssue = async function(cs, blob) {
    try {
      var db = await A._openIssuesDB();
      var tx = db.transaction('issues', 'readwrite');
      tx.objectStore('issues').add({
        type: 'clash',
        jpeg_blob: blob,
        timestamp: new Date().toISOString(),
        element_guid: cs.element_a_guid,
        element_class: cs.element_a_class,
        element_name: cs.element_a_name,
        building: A.activeBuilding || '',
        storey: cs.storey || '',
        discipline: cs.discipline_pair,
        notes: '',
        // Clash-specific fields
        element_b_guid: cs.element_b_guid,
        element_b_class: cs.element_b_class,
        element_b_name: cs.element_b_name,
        discipline_pair: cs.discipline_pair,
        overlap_mm: cs.overlap_mm,
        severity: cs.severity,
        tolerance_mm: cs.overlap_mm, // tolerance used at query time
        camera_pos: JSON.stringify(cs.camera_pos),
        camera_target: JSON.stringify(cs.camera_target),
        deep_link: cs.deep_link,
        gps_lat: A._camGpsPos ? A._camGpsPos.coords.latitude : null,
        gps_lng: A._camGpsPos ? A._camGpsPos.coords.longitude : null,
        gps_accuracy: A._camGpsPos ? A._camGpsPos.coords.accuracy : null,
        compass_heading: A._camHeading || null
      });
      await new Promise(function(resolve, reject) { tx.oncomplete = resolve; tx.onerror = reject; });
      db.close();
      console.log('§CLASH_SNAG_SAVED guid_a=' + cs.element_a_guid + ' guid_b=' + cs.element_b_guid);
    } catch (err) {
      console.error('§CLASH_SNAG_SAVE_ERR ' + err.message);
    }
  };

  console.log('§CLASH_SNAG_MODULE loaded');
}
