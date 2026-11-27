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
      list.innerHTML = '<div class="issues-empty">No issues for ' + (bld || 'this building') + '.<br>To log one: start a Walk, tap the element, then 📸 Snag.</div>';   // the route that exists (MOBILE_PERF §2026-11-28 finding 4): Snag shows only during a Walk, and #site-cam-btn is never shown
      if (A._renderTeamRows) await A._renderTeamRows();
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
          '<div class="issue-ts">' + ts + (iss.src_code ? ' \u00b7 from ' + iss.src_code : '') + '</div>' +
        '</div>';
      list.appendChild(card);
    }
    if (A._renderTeamRows) await A._renderTeamRows();
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

  // ── SEND TO HQ (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEPS 1–2 BUILD SPEC) ─────────────────────────────
  // Step 1, local first: one bundle = the Issue Log (IndexedDB) + the walk trace (history-tree WALK events, with the
  // camera a scrub restores). Step 2, relay: the share sheet with the files attached (the user picks Mail and sends);
  // no share-with-files → the files download. Nothing leaves the phone without the user's OK; nothing is deleted.
  function _hqBuildingName() {
    var db = new URLSearchParams(location.search).get('db') || (A.DB_URL || 'model');
    return String(db).split('/').pop().replace(/\.db$/i, '').replace(/_extracted$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_') || 'model';
  }
  function _hqWalk() {
    var out = [];
    try {
      var t = window.HistoryBar && window.HistoryBar.serialize ? window.HistoryBar.serialize() : null;
      (function walk(nodes) { (nodes || []).forEach(function (n) {
        if (n.type === 'WALK') out.push({ seq: n.seq, label: n.label, ref: n.ref || null, viewState: n.viewState || null });
        walk(n.kids); }); })(t && t.kids);
    } catch (e) { console.warn('§HQ_BUNDLE walk_read_err ' + e.message); }
    out.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    return out;
  }
  A.buildHqBundle = async function () {
    var issues = A._getAllIssues ? await A._getAllIssues() : [];
    var walk = _hqWalk(), bld = _hqBuildingName();
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '_');
    var files = [], recs = [], photos = 0, bytes = 0;
    issues.forEach(function (it) {
      if (it.src_kid) return;   // a row merged from the team (F3 step 4) is someone else's: HQ never re-sends it as its own
      var r = {}; for (var k in it) if (k !== 'jpeg_blob') r[k] = it[k];
      var b = it.jpeg_blob;
      if (b && b.size) {   // the stored blob's own type names the file (site photos are JPEG, some snags PNG — bcf_export.js note)
        var ext = /png/i.test(b.type) ? 'png' : 'jpg', name = 'issue_' + it.id + '_' + bld + '.' + ext;
        files.push(new File([b], name, { type: b.type || ('image/' + (ext === 'png' ? 'png' : 'jpeg')) })); r.photo = name; photos++; bytes += b.size;
      } else r.photo = null;
      recs.push(r);
    });
    var report = { v: 1, kind: 'bim-site-report', building: bld, made_at: new Date().toISOString(), issues: recs, walk: walk };
    var json = new File([JSON.stringify(report, null, 1)], 'bim_site_report_' + bld + '_' + stamp + '.json', { type: 'application/json' });
    files.unshift(json); bytes += json.size;
    console.log('§HQ_BUNDLE issues=' + recs.length + ' photos=' + photos + ' walk=' + walk.length + ' files=' + files.length + ' bytes=' + bytes);
    return { report: report, files: files };
  };
  A.sendToHq = async function () {
    var B = await A.buildHqBundle();
    if (!B.report.issues.length && !B.report.walk.length) {
      if (A.status) A.status.textContent = 'Nothing to send yet: no issues and no walk.';
      console.log('§HQ_SEND empty'); return 'empty';
    }
    if (await _hqTeam()) {   // F3 step 3: a paired browser sends to its team folder, silently; queued first, so offline loses nothing
      var qid = await _hqOutbox('put', B);
      console.log('§HQ_TEAM queued id=' + qid + ' files=' + B.files.length);
      var fr = await A.flushHqOutbox();
      if (fr.sent.indexOf(qid) >= 0) { if (A.status) A.status.textContent = 'Sent to your team folder.'; return 'team'; }
      if (fr.reason !== 'nokey') { if (A.status) A.status.textContent = 'Saved on this phone — it goes to your team folder when you are online.'; return 'queued'; }
      await _hqOutbox('del', qid);   // paired but no team key yet: never send in plain text, use the email route below
    }
    var title = 'BIM site report · ' + B.report.building;
    var text = B.report.issues.length + ' issue(s), ' + B.report.walk.length + ' walk point(s). Attached: report + photos.';
    if (navigator.share && navigator.canShare && navigator.canShare({ files: B.files })) {
      try { await navigator.share({ files: B.files, title: title, text: text }); console.log('§HQ_SEND via=share ok files=' + B.files.length); return 'share'; }
      catch (e) { if (e && e.name === 'AbortError') { console.log('§HQ_SEND via=share cancelled (kept on the phone)'); return 'cancelled'; }
        console.log('§HQ_SEND via=share err=' + (e && e.message) + ' → download'); }
    }
    B.files.forEach(function (f) { var a = document.createElement('a'); a.download = f.name; a.href = URL.createObjectURL(f);
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); });
    if (A.status) A.status.textContent = 'Saved ' + B.files.length + ' file(s) — attach them to an email to HQ.';
    console.log('§HQ_SEND via=download files=' + B.files.length);
    return 'download';
  };

  // ── SEND TO HQ, TEAM FOLDER (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 3 BUILD SPEC — Witness: W-SEND-HQ-TEAM) ──
  // Paired = the same-origin IndexedDB 'comm_phone' (written by the Team panel / pairing page) holds a device, a space and a key
  // (cfg.token, or ?pipe= for a plain folder host). The files are the email bundle's, sealed + signed by common/comm/team_drop.js
  // into this device's own drawer. The comm scripts load only on this path (zero boot bytes). No default target: an unpaired browser never gets here.
  function _kv(k) { return new Promise(function (res) {
    var r = indexedDB.open('comm_phone', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onerror = function () { res(undefined); };
    r.onsuccess = function () { try { var q = r.result.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; } catch (e) { res(undefined); } };
  }); }
  function _kvPut(k, v) { return new Promise(function (res) {
    var r = indexedDB.open('comm_phone', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onerror = function () { res(false); };
    r.onsuccess = function () { var t = r.result.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = function () { res(true); }; t.onerror = function () { res(false); }; };
  }); }
  function _pipeUrl() { return new URLSearchParams(location.search).get('pipe'); }
  async function _hqTeam() {
    var dev = await _kv('device'), cfg = (await _kv('cfg')) || {};
    return (dev && dev.kid && cfg.space && (cfg.token || _pipeUrl())) ? { dev: dev, cfg: cfg } : null;
  }
  // the outbox: IndexedDB 'bim_hq_outbox' / 'q' — { id, made_at, files:[{name, type, blob}] }; an entry leaves only after the pipe confirmed it
  function _hqOutbox(op, arg) { return new Promise(function (res, rej) {
    var r = indexedDB.open('bim_hq_outbox', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('q', { keyPath: 'id' }); };
    r.onerror = function () { rej(r.error); };
    r.onsuccess = function () {
      var t = r.result.transaction('q', op === 'all' ? 'readonly' : 'readwrite'), s = t.objectStore('q'), out;
      if (op === 'put') { out = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        s.put({ id: out, made_at: new Date().toISOString(), files: arg.files.map(function (f) { return { name: f.name, type: f.type, blob: f }; }) }); }
      else if (op === 'del') s.delete(arg);
      else { var q = s.getAll(); q.onsuccess = function () { out = q.result || []; }; }
      t.oncomplete = function () { res(out); }; t.onerror = function () { rej(t.error); };
    };
  }); }
  var _commP = null;
  function _loadComm() {
    if (_commP) return _commP;
    var list = ['comm_envelope', 'comm_order', 'team_keys', 'comm_roster', 'comm_admit', 'comm_pipe', 'comm_store', 'team_drop'];
    _commP = list.reduce(function (p, n) { return p.then(function () { return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '../common/comm/' + n + '.js'; s.onload = res; s.onerror = function () { rej(new Error('load ' + n)); }; document.head.appendChild(s); }); }); }, Promise.resolve());
    _commP.catch(function () { _commP = null; });
    return _commP;
  }
  // one open + sync of this browser's own comm store (bytes under comm_phone 'viewer_db'), shared by send (step 3) and get (step 4)
  async function _teamOpen(T) {
    await _loadComm();
    var SQL = A._SQL || await initSqlJs({ locateFile: function (f) { return (f === 'sql-wasm.wasm' ? '../common/lib/' : 'lib/') + f; } });
    var dev = T.dev, cfg = T.cfg, own = await _kv('viewer_db'), seed = own ? null : await _kv('db');
    var S = window.CommStore.open(new SQL.Database(own || seed || undefined), { SQL: SQL, space: cfg.space, self: dev,
      access: function () { return { allowed: true, reason: 'viewer-holds-no-records' }; }, tableId: function () { return null; }, log: function () {} });
    var pipe = _pipeUrl() ? window.CommPipe.httpPipe(_pipeUrl()) : window.CommPipe.ghPipe({ owner: cfg.owner, repo: cfg.repo, token: cfg.token, self: dev.kid });
    await S.sync(pipe);
    await _kvPut('viewer_db', S.db.export());
    return { S: S, pipe: pipe };
  }
  var _teamChain = Promise.resolve();   // send and get never open the store at the same time
  function _teamExclusive(fn) { var p = _teamChain.then(fn, fn); _teamChain = p.catch(function () {}); return p; }
  var _flushing = null;
  A.flushHqOutbox = function () { if (!_flushing) _flushing = _teamExclusive(_flush).finally(function () { _flushing = null; }); return _flushing; };
  async function _flush() {
    var res = { sent: [], left: 0, reason: '' }, items = await _hqOutbox('all'), T = await _hqTeam();
    res.left = items.length;
    if (!items.length || !T) { res.reason = items.length ? 'unpaired' : 'empty'; return res; }
    if (navigator.onLine === false) { res.reason = 'offline'; console.log('§HQ_TEAM flushed sent=0 left=' + res.left + ' reason=offline'); return res; }
    try {
      var O = await _teamOpen(T), S = O.S, pipe = O.pipe, dev = T.dev, cfg = T.cfg;
      var nk = window.TeamDrop.newestKey(await S.keyring());
      if (!nk) { res.reason = 'nokey'; console.log('§HQ_TEAM nokey — this device holds no team key yet (not approved?); nothing sent in plain text'); return res; }
      for (var it of items) {
        var files = [];
        for (var f of it.files) files.push({ name: f.name, type: f.type, bytes: new Uint8Array(await f.blob.arrayBuffer()) });
        var d = await window.TeamDrop.seal(files, { space: cfg.space, epoch: nk.epoch, key: nk.key, signer: dev, label: 'bim-site-report' });
        if (pipe.putMany) await pipe.putMany(d.entries);
        else { for (var k = d.entries.length - 1; k >= 0; k--) { if (!(await pipe.put(d.entries[k].name, d.entries[k].bytes))) throw new Error('put ' + d.entries[k].name); } }   // parts first, the manifest last
        await _hqOutbox('del', it.id); res.sent.push(it.id); res.left--;
        console.log('§HQ_SEND via=team drop=' + d.id + ' parts=' + (d.entries.length - 1) + ' epoch=' + nk.epoch + ' kid=' + dev.kid);
      }
    } catch (e) { res.reason = 'error'; console.log('§HQ_TEAM flush_err ' + (e && e.message)); }
    console.log('§HQ_TEAM flushed sent=' + res.sent.length + ' left=' + res.left + (res.reason ? ' reason=' + res.reason : ''));
    return res;
  }

  // ── HQ VIEW (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 4 BUILD SPEC — Witness: W-HQ-VIEW) ───────────────────
  // "Get from team": every device's drops → ONE Issue Log. Key = (author device, the issue's id on that device): a phone
  // re-sends its whole log, so the same key replaces its row in place. A drop that does not open is refused whole.
  function _codeOf(kid) { return String(kid).slice(0, 4).toUpperCase() + '-' + String(kid).slice(4, 8).toUpperCase(); }
  A.getFromTeam = function () { return _teamExclusive(_getFromTeam); };
  async function _getFromTeam() {
    var res = { drops: 0, fresh: 0, added: 0, updated: 0, walks: 0, refused: [], reason: '' }, T = await _hqTeam();
    if (!T) { res.reason = 'unpaired'; return res; }
    try {
      var O = await _teamOpen(T), TD = window.TeamDrop, space = T.cfg.space;
      var roster = (await O.S.order()).roster, ring = await O.S.keyring();
      var seen = (await _kv('viewer_drops')) || {}, walks = (await _kv('viewer_walks')) || {};
      var list = (await TD.list(O.pipe, space)).filter(function (d) { return d.kid !== T.dev.kid; });
      res.drops = list.length;
      var opened = [];
      for (var d of list) {
        if (seen[d.kid + '/' + d.id]) continue;
        var o = await TD.open(O.pipe, { space: space, kid: d.kid, id: d.id, roster: roster, ring: ring });
        if (!o.ok) { res.refused.push({ kid: d.kid, id: d.id, reason: o.reason }); console.log('§HQ_GET refused drop=' + d.id + ' kid=' + d.kid + ' reason=' + o.reason); continue; }
        opened.push({ d: d, o: o });
      }
      opened.sort(function (a, b) { return String(a.o.manifest.made_at) < String(b.o.manifest.made_at) ? -1 : 1; });
      for (var x of opened) {
        var byName = {}; x.o.files.forEach(function (f) { byName[f.name] = f; });
        var jf = x.o.files.filter(function (f) { return /\.json$/.test(f.name); })[0], rep = null;
        try { rep = jf ? JSON.parse(new TextDecoder().decode(jf.bytes)) : null; } catch (e) { rep = null; }
        if (!rep || rep.kind !== 'bim-site-report') { res.refused.push({ kid: x.d.kid, id: x.d.id, reason: 'not-a-site-report' }); console.log('§HQ_GET refused drop=' + x.d.id + ' kid=' + x.d.kid + ' reason=not-a-site-report'); continue; }
        var have = {}; (await A._getAllIssues()).forEach(function (r) { if (r.src_kid === x.d.kid) have[r.src_id] = r.id; });
        var db = await A._openIssuesDB(), tx = db.transaction('issues', 'readwrite'), st = tx.objectStore('issues');
        (rep.issues || []).forEach(function (it) {
          var row = {}; for (var k in it) if (k !== 'id' && k !== 'photo') row[k] = it[k];
          var ph = it.photo && byName[it.photo]; if (ph) row.jpeg_blob = new Blob([ph.bytes], { type: ph.type });
          row.src_kid = x.d.kid; row.src_id = it.id; row.src_code = _codeOf(x.d.kid); row.src_drop = x.d.id;
          if (have[it.id] != null) { row.id = have[it.id]; st.put(row); res.updated++; } else { st.add(row); res.added++; }
        });
        await new Promise(function (ok, no) { tx.oncomplete = ok; tx.onerror = function () { no(tx.error); }; }); db.close();
        if (rep.walk && rep.walk.length) walks[x.d.kid] = { code: _codeOf(x.d.kid), made_at: x.o.manifest.made_at, drop: x.d.id, building: rep.building, walk: rep.walk };
        seen[x.d.kid + '/' + x.d.id] = 1; res.fresh++;
      }
      await _kvPut('viewer_drops', seen); await _kvPut('viewer_walks', walks); res.walks = Object.keys(walks).length;
    } catch (e) { res.reason = 'error'; console.log('§HQ_GET err ' + (e && e.message)); }
    console.log('§HQ_GET drops=' + res.drops + ' new=' + res.fresh + ' issues_added=' + res.added + ' issues_updated=' + res.updated + ' walks=' + res.walks + ' refused=' + res.refused.length + (res.reason ? ' reason=' + res.reason : ''));
    if (A.status) A.status.textContent = res.reason === 'error' ? 'Could not reach your team folder — try again when online.'
      : 'From your team: ' + res.added + ' new, ' + res.updated + ' updated' + (res.refused.length ? ', ' + res.refused.length + ' refused' : '') + '.';
    if (document.getElementById('issues-panel').classList.contains('active')) A._renderIssueList();
    return res;
  }
  // Replay a device's walk: its points enter the history bar as WALK events carrying the PHONE's recorded view; scrubbing restores each camera.
  A.replayTeamWalk = async function (kid) {
    var w = ((await _kv('viewer_walks')) || {})[kid], HB = window.HistoryBar;
    if (!w || !HB || !HB.push) { console.log('§HQ_REPLAY kid=' + kid + ' points=0'); return 0; }
    var t0 = Date.now();
    w.walk.forEach(function (pt, i) { var ref = {}; for (var k in (pt.ref || {})) ref[k] = pt.ref[k]; ref.from = w.code; ref.drop = w.drop;
      HB.push({ bucket: 'event', kind: 'event', type: 'WALK', label: w.code + ' · ' + (pt.label || 'walk'), readonly: true, fromTap: true,
        viewState: pt.viewState || null, ref: ref, ts: t0 + i * 1000, sigKey: 'event:WALK:' + w.drop + ':' + i }); });
    // the bar's own open() (idempotent: an already-open bar stays open) — the walk was shown only after the user found key Z
    var bar = 'none'; if (HB.open) { HB.open(); var hb = document.getElementById('universal-hist-btns'); bar = hb && hb.style.display !== 'none' ? 'open' : 'closed'; }
    console.log('§HQ_REPLAY kid=' + kid + ' points=' + w.walk.length + ' from=' + w.code + ' bar=' + bar);
    // phone: the Issue Log is a bottom sheet over the bar's own strip — the walk is there to be scrubbed, so the sheet steps aside
    var ip = document.getElementById('issues-panel');
    if (A.sheets && A.sheets.active && ip && ip.classList.contains('active')) { A.toggleIssues(); console.log('§HQ_REPLAY sheet=issues-panel closed (bar under it)'); }
    if (A.status) A.status.textContent = 'Walk from ' + w.code + ' is on the history bar — scrub to replay it.';
    return w.walk.length;
  };
  // the team rows of the Issue Log: the Get button (paired browsers only) and one Replay row per device with a walk
  A._renderTeamRows = async function () {
    var btn = document.getElementById('issues-get-team'), paired = !!(await _hqTeam());
    if (btn) { btn.style.display = paired ? '' : 'none'; btn.onclick = function (e) { e.stopPropagation(); A.getFromTeam(); }; }
    var list = document.getElementById('issues-list'); if (!list) return;
    var old = list.querySelectorAll('.issue-walk-row'); for (var i = 0; i < old.length; i++) old[i].remove();
    if (!paired) return;
    var walks = (await _kv('viewer_walks')) || {};
    Object.keys(walks).forEach(function (kid) { var w = walks[kid], row = document.createElement('div');
      row.className = 'issue-card issue-walk-row'; row.setAttribute('data-kid', kid);
      row.innerHTML = '<div class="issue-meta"><div class="issue-class">\ud83d\udeb6 Walk \u00b7 ' + w.code + '</div><div>' + w.walk.length + ' points \u00b7 tap to replay</div></div>';
      row.onclick = function () { A.replayTeamWalk(kid); };
      list.insertBefore(row, list.firstChild); });
  };
  window.addEventListener('online', function () { A.flushHqOutbox(); });
  setTimeout(function () { _hqOutbox('all').then(function (q) { if (q && q.length) A.flushHqOutbox(); }).catch(function () {}); }, 4000);
}
