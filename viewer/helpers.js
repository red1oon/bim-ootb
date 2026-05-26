/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// helpers.js — Shared scene + DB utilities (S239)
// Prevents: 29x scene.traverse duplication, raw db.exec without null-guard,
//           repeated InstancedMesh filter boilerplate across panels/picking/walk/nlp
// Loaded after scene.js, before streaming.js so all modules can use A.collectMeshes etc.

function setupHelpers(A) {

  // ── A.collectMeshes(predicate) ─────────────────────────────────────────────
  // Returns array of scene objects matching predicate. Excludes ground plane.
  // Replaces 17+ inline scene.traverse() mesh-collection loops.
  //
  // Usage: A.collectMeshes(o => o.isMesh && o.userData.disc === 'ARC')
  //        A.collectMeshes(o => o.isInstancedMesh)
  //        A.collectMeshes(o => o.isLineSegments && o.userData.building)
  A.collectMeshes = function(predicate) {
    const result = [];
    if (!A.scene) return result;
    A.scene.traverse(function(obj) {
      if (obj === A.ground) return;
      if (predicate(obj)) result.push(obj);
    });
    return result;
  };

  // ── A.filterInstancedMesh(mesh, filterFn) ─────────────────────────────────
  // Show/hide individual instances via zero-scale matrix (S232 pattern).
  // filterFn(meta) → true = visible, false = hidden
  // meta = { storey, disc, guid, ... } from A._instanceMeta[mesh.id][i]
  //
  // Replaces duplicated blocks in panels.js:42-62, panels.js:111-129
  A.filterInstancedMesh = function(mesh, filterFn) {
    if (!mesh.isInstancedMesh) return;
    const meta = A._instanceMeta && A._instanceMeta[mesh.id];
    if (!meta) return;
    const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let anyVisible = false;
    for (let i = 0; i < meta.length; i++) {
      if (filterFn(meta[i])) {
        if (meta[i]._origMatrix) mesh.setMatrixAt(i, meta[i]._origMatrix);
        anyVisible = true;
      } else {
        if (!meta[i]._origMatrix) {
          meta[i]._origMatrix = new THREE.Matrix4();
          mesh.getMatrixAt(i, meta[i]._origMatrix);
        }
        mesh.setMatrixAt(i, _zero);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = anyVisible;
  };

  // ── A.filterBatchedMesh(mesh, filterFn) ─────────────────────────────────
  // §S260: Show/hide individual elements within a BatchedMesh via setVisibleAt().
  // filterFn(meta) → true = visible, false = hidden
  // meta = { storey, disc, guid, slotId, ... } from A._batchMeta[mesh.id][i]
  A.filterBatchedMesh = function(mesh, filterFn) {
    if (!mesh.isBatchedMesh) return;
    const meta = A._batchMeta && A._batchMeta[mesh.id];
    if (!meta) return;
    let anyVisible = false;
    for (let i = 0; i < meta.length; i++) {
      const vis = filterFn(meta[i]);
      mesh.setVisibleAt(meta[i].slotId, vis);
      if (vis) anyVisible = true;
    }
    mesh.visible = anyVisible;
  };

  // ── A.dbQuery(sql, params) ────────────────────────────────────────────────
  // Safe db.exec wrapper. Returns [] if db not ready or no results.
  // Each item in the returned array is a row-values array (same shape as db.exec rows[0].values).
  //
  // Usage: A.dbQuery('SELECT guid FROM elements_meta WHERE building=?', [A.activeBuilding])
  //        → [ ['guid1'], ['guid2'], ... ]
  A.dbQuery = function(sql, params) {
    if (!A.db) return [];
    try {
      const rows = A.db.exec(sql, params || []);
      if (!rows || !rows.length) return [];
      return rows[0].values || [];
    } catch(e) {
      console.warn('§HELPERS_QUERY_ERR', e.message, sql.slice(0, 80));
      return [];
    }
  };

  // ── A.dbQueryFirst(sql, params) ───────────────────────────────────────────
  // Convenience: returns first row as array, or null.
  A.dbQueryFirst = function(sql, params) {
    const rows = A.dbQuery(sql, params);
    return rows.length ? rows[0] : null;
  };

  // ── Console log capture + IndexedDB persistence for bug reports ───────────
  // Hooks console.log/warn/error to buffer §-tagged lines in memory + IndexedDB.
  // IndexedDB store: 'bim_ootb_logs' / 'entries' — survives tab close.
  // Memory buffer: last 100 lines (fast access for reportBug).
  // Called once at setup — guards against double-hook.
  if (!window._bimLogBuffer) {
    window._bimLogBuffer = [];
    window._bimLogDb = null;

    // Open/create IndexedDB for logs
    try {
      var logReq = indexedDB.open('bim_ootb_logs', 1);
      logReq.onupgradeneeded = function() {
        var db = logReq.result;
        if (!db.objectStoreNames.contains('entries')) {
          var store = db.createObjectStore('entries', { keyPath: 'id', autoIncrement: true });
          store.createIndex('ts', 'ts');
        }
      };
      logReq.onsuccess = function() { window._bimLogDb = logReq.result; };
      logReq.onerror = function() {}; // silent — memory buffer still works
    } catch(e) {}

    var _origLog = console.log, _origWarn = console.warn, _origErr = console.error;
    var _idbQueue = [];   // batch queue for IndexedDB writes
    var _idbTimer = null;
    var _flushIdb = function() {
      _idbTimer = null;
      if (!window._bimLogDb || _idbQueue.length === 0) return;
      try {
        var tx = window._bimLogDb.transaction('entries', 'readwrite');
        var store = tx.objectStore('entries');
        var batch = _idbQueue.splice(0, _idbQueue.length);
        for (var i = 0; i < batch.length; i++) store.add(batch[i]);
      } catch(e) {}
    };
    var _repeatCounts = {};  // dedup counter for repetitive § tags
    var _capture = function(level, args) {
      var line = Array.prototype.slice.call(args).join(' ');
      if (line.indexOf('§') >= 0 || level !== 'log') {
        // Throttle repetitive § tags — keep 1st, every 10th, warn/error always
        if (level === 'log') {
          var tagMatch = line.match(/§\w+/);
          if (tagMatch) {
            var tag = tagMatch[0];
            _repeatCounts[tag] = (_repeatCounts[tag] || 0) + 1;
            var n = _repeatCounts[tag];
            if (n > 1 && n % 10 !== 0) return; // skip 2-9, 11-19, etc.
          }
        }
        var ts = new Date().toISOString();
        var buf = window._bimLogBuffer;
        buf.push(ts + ' [' + level + '] ' + line);
        if (buf.length > 100) buf.shift();
        _idbQueue.push({ ts: ts, level: level, msg: line });
        if (!_idbTimer) _idbTimer = setTimeout(_flushIdb, 2000);
      }
    };
    console.log = function() { _capture('log', arguments); _origLog.apply(console, arguments); };
    console.warn = function() { _capture('WARN', arguments); _origWarn.apply(console, arguments); };
    console.error = function() { _capture('ERROR', arguments); _origErr.apply(console, arguments); };
    // Flush on page unload
    window.addEventListener('beforeunload', _flushIdb);
  }

  // ── A.reportBug() — one-click bug report to GitHub ─────────────────────────
  // 1. Captures canvas screenshot → clipboard
  // 2. Collects browser, OS, building, element count, last §-tagged console lines
  // 3. Opens pre-filled GitHub issue with all context
  A.reportBug = function() {
    // Show confirmation dialog
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10000;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;justify-content:center;align-items:center';
    overlay.onclick = function(e) { if (e.target === overlay) { overlay.remove(); } };
    overlay.innerHTML = '<div style="background:rgba(10,10,30,0.97);border-radius:14px;padding:24px 28px;border:1px solid rgba(255,138,101,0.4);font-family:\'Segoe UI\',sans-serif;color:#e0e0e0;max-width:400px;width:90%;text-align:center">' +
      '<img src="help.png" alt="Help" style="height:40px;margin-bottom:10px">' +
      '<div style="font-size:16px;font-weight:700;color:#ff8a65;margin-bottom:8px">Report a Bug</div>' +
      '<div style="color:#aaa;font-size:12px;margin-bottom:12px;line-height:1.6">' +
        'Your report will include:<br>' +
        '&#10003; Browser &amp; screen info<br>' +
        '&#10003; Building &amp; element count<br>' +
        '&#10003; Console debug log (last 50 lines)<br>' +
        'You can paste a screenshot in the report if needed.' +
      '</div>' +
      '<div style="margin-bottom:12px"><textarea id="_bug_desc" placeholder="Describe the problem (optional)..." style="width:90%;height:60px;background:#222;color:#eee;border:1px solid #555;border-radius:6px;padding:8px;font-size:12px;resize:vertical"></textarea></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<button id="_bug_github" style="padding:8px 18px;background:#ff8a65;color:#000;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Submit to GitHub</button>' +
        '<button id="_bug_email" style="padding:8px 18px;background:#4fc3f7;color:#000;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">Send via Email</button>' +
        '<button id="_bug_cancel" style="padding:8px 18px;background:#333;color:#aaa;border:1px solid #555;border-radius:8px;font-size:12px;cursor:pointer">Cancel</button>' +
      '</div>' +
      '<div style="color:#555;font-size:9px;margin-top:10px">No GitHub account? Use Email.</div>' +
    '</div>';
    document.body.appendChild(overlay);
    document.getElementById('_bug_cancel').onclick = function() { overlay.remove(); };
    document.getElementById('_bug_github').onclick = function() {
      var desc = document.getElementById('_bug_desc').value;
      overlay.remove();
      A._doReportBug('github', desc);
    };
    document.getElementById('_bug_email').onclick = function() {
      var desc = document.getElementById('_bug_desc').value;
      overlay.remove();
      A._doReportBug('email', desc);
    };
  };

  A._doReportBug = function(mode, userDesc) {

    // Collect context
    var ua = navigator.userAgent;
    var platform = navigator.platform || 'unknown';
    var screen = window.screen ? window.screen.width + 'x' + window.screen.height : 'unknown';
    var building = '';
    var elementCount = 0;
    try {
      if (A.db) {
        var r = A.dbQueryFirst("SELECT value FROM project_metadata WHERE key='building_name'");
        if (r) building = r[0];
        var c = A.dbQueryFirst("SELECT COUNT(*) FROM elements_meta");
        if (c) elementCount = c[0];
      }
    } catch(e) {}

    // Pull logs — try IndexedDB first (has previous sessions), fallback to memory
    var _openIssue = function(logs) {
      var desc = userDesc ? userDesc : '(no description provided)';
      var envBlock = [
        'Browser: ' + ua,
        'Platform: ' + platform,
        'Screen: ' + screen,
        'Building: ' + (building || '(none loaded)'),
        'Elements: ' + elementCount,
        'URL: ' + location.href,
      ].join('\n');

      if (mode === 'email') {
        // Email — plain text, screenshot auto-downloaded separately
        var subject = 'BIM OOTB Bug Report — ' + (building || 'no building');
        var emailBody = [
          'Bug Report',
          '==========',
          '',
          'Description: ' + desc,
          '',
          'Environment:',
          envBlock,
          '',
          'Console Log (last 50 lines):',
          logs || '(no logs captured)',
          '',
          '---',
          'Please attach a screenshot if needed (use PrtScn or snipping tool).',
          'Auto-generated by BIM OOTB bug reporter',
        ].join('\n');

        window.location.href = 'mailto:red1org@gmail.com?subject=' +
          encodeURIComponent(subject) + '&body=' + encodeURIComponent(emailBody);
      } else {
        // GitHub issue — markdown
        var body = [
          '## What happened?',
          desc,
          '',
          '## Environment',
          '| | |',
          '|---|---|',
          '| Browser | ' + ua + ' |',
          '| Platform | ' + platform + ' |',
          '| Screen | ' + screen + ' |',
          '| Building | ' + (building || '(none loaded)') + ' |',
          '| Elements | ' + elementCount + ' |',
          '| URL | ' + location.href + ' |',
          '',
          '**Screenshot** — paste here if needed (use PrtScn or snipping tool, then Ctrl+V):',
          '',
          '<details><summary>Console log (last 50 lines)</summary>',
          '',
          '```',
          logs || '(no logs captured)',
          '```',
          '</details>',
          '',
          '---',
          '_Auto-generated by BIM OOTB bug reporter_',
        ].join('\n');

        var title = encodeURIComponent('Bug: ' + (userDesc ? userDesc.slice(0, 60) : ''));
        var url = 'https://github.com/red1oon/BIMCompiler/issues/new?title=' + title +
                  '&body=' + encodeURIComponent(body) + '&labels=bug';

        // GitHub URL limit ~8KB — truncate logs if needed
        if (url.length > 8000) {
          var shortLogs = logs.split('\n').slice(-20).join('\n');
          body = body.replace(/```[\s\S]*?```/, '```\n' + shortLogs + '\n```');
          url = 'https://github.com/red1oon/BIMCompiler/issues/new?title=' + title +
                '&body=' + encodeURIComponent(body) + '&labels=bug';
        }

        // §S280: Use location.href — window.open is popup-blocked on mobile
        window.location.href = url;
      }
    };

    // Try IndexedDB for full history (includes previous sessions)
    if (window._bimLogDb) {
      try {
        var tx = window._bimLogDb.transaction('entries', 'readonly');
        var store = tx.objectStore('entries');
        var all = store.getAll();
        all.onsuccess = function() {
          var entries = all.result || [];
          // Last 50 entries from IndexedDB
          var idbLogs = entries.slice(-50).map(function(e) {
            return e.ts + ' [' + e.level + '] ' + e.msg;
          }).join('\n');
          _openIssue(idbLogs);
        };
        all.onerror = function() {
          _openIssue((window._bimLogBuffer || []).slice(-50).join('\n'));
        };
      } catch(e) {
        _openIssue((window._bimLogBuffer || []).slice(-50).join('\n'));
      }
    } else {
      _openIssue((window._bimLogBuffer || []).slice(-50).join('\n'));
    }
  };

  // bug-fab replaced by toolbar ❓ button (S250 §4) — idle-timer removed

  // ── §11 QR Code Sharing ──────────────────────────────────────────────────
  // Implementing S250 §11 — QR Code Sharing

  // QR generation (requires qrcode.min.js)
  A.generateQR = function(url, size) {
    if (typeof qrcode !== 'function') { console.log('§QR_GEN no qrcode lib'); return null; }
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    var canvas = document.createElement('canvas');
    var cellSize = Math.floor(size / qr.getModuleCount());
    var totalSize = cellSize * qr.getModuleCount();
    canvas.width = totalSize;
    canvas.height = totalSize;
    var ctx = canvas.getContext('2d');
    for (var r = 0; r < qr.getModuleCount(); r++) {
      for (var c = 0; c < qr.getModuleCount(); c++) {
        ctx.fillStyle = qr.isDark(r, c) ? '#000000' : '#ffffff';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
    console.log('§QR_GEN size=' + totalSize + ' url=' + url.substring(0, 60));
    return canvas;
  };

  A.addQRBorder = function(canvas, borderColor) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  };

  A.showQRShare = function(url, label) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;' +
      'justify-content:center;flex-direction:column;cursor:pointer';
    var canvas = A.generateQR(url, 280);
    if (!canvas) return;
    canvas.style.cssText = 'border:12px solid white;border-radius:8px;cursor:pointer';
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.appendChild(canvas);
    overlay.appendChild(link);
    var lbl = document.createElement('div');
    lbl.style.cssText = 'color:white;margin-top:12px;font-size:14px;text-align:center';
    lbl.textContent = (label || 'Scan to share') + ' \u00B7 Tap to open';
    overlay.appendChild(lbl);
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    console.log('§QR_SHARE shown label=' + (label || 'none'));
  };

  A.printQRSheet = function(spots) {
    var html = '<html><head><style>' +
      'body{font-family:sans-serif;margin:20px}' +
      '.card{display:inline-block;width:180px;border:1px solid #ccc;' +
      'padding:12px;margin:8px;text-align:center;page-break-inside:avoid}' +
      '.label{font-weight:bold;font-size:12px}' +
      '.meta{font-size:9px;color:#666;margin-top:4px}' +
      '</style></head><body>';
    spots.forEach(function(s) {
      html += '<div class="card">' +
        '<div class="label">' + (s.label || '') + '</div>' +
        '<div class="meta">' + (s.building || '') + ' \u00B7 ' + (s.date || '') + '</div></div>';
    });
    html += '</body></html>';
    var w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
    console.log('§QR_PRINT spots=' + spots.length);
  };

  // ── Issue Snags DB table + 3D rendering ─────────────────────────────────
  A._initSnagTable = function() {
    if (!A.db) return;
    A.db.run('CREATE TABLE IF NOT EXISTS issue_snags (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'guid TEXT,' +
      'ifc_x REAL, ifc_y REAL, ifc_z REAL,' +
      'cam_x REAL, cam_y REAL, cam_z REAL,' +
      'tgt_x REAL, tgt_y REAL, tgt_z REAL,' +
      'label TEXT,' +
      "status TEXT DEFAULT 'open'," +
      'deep_link TEXT,' +
      'qr_png BLOB,' +
      "created_at TEXT DEFAULT (datetime('now'))," +
      'clash_pair TEXT)');
    console.log('§SNAG_TABLE initialized');
  };

  A._snagGroup = null;

  A._renderSnagStamps = function() {
    if (!A.db || typeof THREE === 'undefined') return;
    if (!A._snagGroup) {
      A._snagGroup = new THREE.Group();
      A._snagGroup.name = 'snagStamps';
      if (A.scene) A.scene.add(A._snagGroup);
    }
    // Clear existing
    while (A._snagGroup.children.length) {
      var c = A._snagGroup.children[0];
      if (c.material && c.material.map) c.material.map.dispose();
      if (c.material) c.material.dispose();
      A._snagGroup.remove(c);
    }
    var rows = A.dbQuery('SELECT id, ifc_x, ifc_y, ifc_z, label, status, deep_link FROM issue_snags');
    if (!rows || !rows.length) return;
    rows.forEach(function(r) {
      var pos = A.ifc2three(r[1], r[2], r[3]);
      var canvas = A.generateQR(r[6], 128);
      if (!canvas) return;
      var borderColor = r[5] === 'resolved' ? '#4caf50' : r[5] === 'reviewed' ? '#ffeb3b' : '#f44336';
      A.addQRBorder(canvas, borderColor);
      var texture = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      var sprite = new THREE.Sprite(mat);
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.scale.set(0.5, 0.5, 1);
      sprite.renderOrder = 1002;
      sprite.userData = { snagId: r[0], deepLink: r[6], label: r[4] };
      A._snagGroup.add(sprite);
    });
    console.log('§SNAG_STAMPS rendered count=' + rows.length);
  };

  A.createSnag = function(opts) {
    if (!A.db) return;
    var cam = A.camera ? A.camera.position : {x:0,y:0,z:0};
    var tgt = A.controls ? A.controls.target : {x:0,y:0,z:0};
    var baseUrl = window.location.href.split('#')[0];
    var deepLink = baseUrl + '#issue=new&cam=' + cam.x.toFixed(2) + ',' + cam.y.toFixed(2) + ',' + cam.z.toFixed(2) +
      '&tgt=' + tgt.x.toFixed(2) + ',' + tgt.y.toFixed(2) + ',' + tgt.z.toFixed(2);
    if (opts.guid) deepLink += '&guid=' + opts.guid;

    A.db.run('INSERT INTO issue_snags (guid, ifc_x, ifc_y, ifc_z, cam_x, cam_y, cam_z, tgt_x, tgt_y, tgt_z, label, deep_link, clash_pair) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [opts.guid || null, opts.ifc_x || 0, opts.ifc_y || 0, opts.ifc_z || 0,
       cam.x, cam.y, cam.z, tgt.x, tgt.y, tgt.z,
       opts.label || '', deepLink, opts.clashPair || null]);

    A._renderSnagStamps();
    A.showQRShare(deepLink, opts.label);
    console.log('§SNAG_CREATE label=' + (opts.label || 'none') + ' guid=' + (opts.guid || 'none'));
  };

  // ── S275: Shared yellow bbox highlight material — one definition for all callers ──
  A._bboxMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3, depthTest: false });

  console.log('§HELPERS_READY collectMeshes+filterInstancedMesh+dbQuery+reportBug+QR+snags');
}
