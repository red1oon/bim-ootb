// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
// system_monitor.js — SYSTEM_ADMIN_LANE §6 (serverless reframe). iDempiere's System Monitor (the
//   /idempiere-monitor servlet, AdempiereMonitor.java) — same sections (Memory · Cache · Logs/Trace · Servers ·
//   Cluster/Threads · Database) — but on a serverless browser kernel: every section shows OUR REAL LOCAL value
//   where one exists (heap via performance.memory, idb/cache via Storage API + the SW release), and an HONEST
//   "No longer needed" reframe where the server is gone (background processors, cluster, thread pool, Postgres
//   host), each carrying "Read further →" into the Migrate/Compare paper. NON-INVENT: real device numbers, real
//   sw CACHE_VERSION; nothing faked (heap shows "n/a" where the browser doesn't expose it). W-SYSTEM-MONITOR-LIVE.
(function (global) {
  'use strict';
  var COMPARE = 'migrate_compare.html';   // the MigrateComparison paper (same erp/ folder, ships in PRECACHE)

  function mb(n) { return (n == null) ? null : (n / 1048576).toFixed(1) + ' MB'; }

  // sw CACHE_VERSION = our RELEASE tag — asked over the live SW (GET_PRECACHE → {version}); null if no controller.
  function swVersion() {
    return new Promise(function (res) {
      try {
        if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return res(null);
        var ch = new MessageChannel();
        ch.port1.onmessage = function (e) { res(e.data && e.data.version || null); };
        navigator.serviceWorker.controller.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]);
        setTimeout(function () { res(null); }, 800);
      } catch (e) { res(null); }
    });
  }
  function storageEstimate() {
    try { if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate(); } catch (e) {}
    return Promise.resolve(null);
  }
  function heap() {
    try { var m = (global.performance && global.performance.memory); if (m) return { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit }; } catch (e) {}
    return null;
  }
  function residentTenants() {
    try { if (global.SES && global.SES.listClients && global.__idmpDb) return global.SES.listClients(global.__idmpDb); } catch (e) {}
    return null;
  }

  // ── data gather (all real / honest) ─────────────────────────────────────────────────────────────────────────
  // SYSTEM_MONITOR_WIDGETS §H — fold the 4 paradigm field-health widgets from REAL live signals (NON-INVENT).
  //   field_errors ← window.__ERR_BEACON__ (error_beacon.js)  ·  durability ← offline queue (na if absent)
  //   db_size_gauge ← window.ERP.opDb (the live signed op-log)  ·  environment ← window.ERP.VFS.detect()
  function persistedP() {
    try { if (navigator.storage && navigator.storage.persisted) return navigator.storage.persisted(); } catch (e) {}
    return Promise.resolve(null);
  }
  function foldFieldHealth(est, persisted) {
    var FH = global.ERP && global.ERP.FieldHealth;
    if (!FH || typeof FH.fold !== 'function') return null;
    var vfs = null; try { vfs = global.ERP.VFS && global.ERP.VFS.detect(); } catch (e) {}
    var r = FH.fold({
      beacon: global.__ERR_BEACON__,
      queue: global.ERP && global.ERP.offlineQueue,            // present only if the app instantiated one
      db: global.ERP && global.ERP.opDb,                       // the live signed op-log db
      vfs: vfs,
      storageEstimate: est ? { usage: est.usage, quota: est.quota } : null,
      persisted: persisted
    });
    return r;
  }

  function gather() {
    return Promise.all([swVersion(), storageEstimate(), persistedP()]).then(function (r) {
      var ver = r[0], est = r[1], persisted = r[2], h = heap(), tenants = residentTenants();
      var d = {
        release: ver || '(uncontrolled)',
        os: (navigator.platform || '—') + ' · ' + (navigator.hardwareConcurrency || '?') + ' cores',
        ua: (navigator.userAgent || '').replace(/^Mozilla\/\S+\s*/, '').slice(0, 60),
        heap: h ? (mb(h.used) + ' used / ' + mb(h.total) + ' heap · limit ' + mb(h.limit)) : 'n/a (this browser does not expose JS heap)',
        storage: est ? (mb(est.usage) + ' used of ' + mb(est.quota) + ' available') : 'n/a',
        tenants: tenants ? tenants.length : null,
        tenantNames: tenants ? tenants.map(function (c) { return c.name; }).join(', ') : null,
        fieldHealth: foldFieldHealth(est, persisted)
      };
      console.log('§SYSTEM-MONITOR gather release=' + d.release + ' heap=' + (h ? 'real' : 'n/a') + ' storage=' + (est ? 'real' : 'n/a') + ' tenants=' + d.tenants + ' fieldHealth=' + (d.fieldHealth ? d.fieldHealth.overall : 'n/a'));
      return d;
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  // a section row: label + value; reframe=true draws the "No longer needed" badge + Read-further link.
  function row(label, value, reframe) {
    return '<tr><th>' + esc(label) + '</th><td>' + (reframe ? '<span class="sm-badge">No longer needed</span> ' : '') + value
      + (reframe ? ' <a class="sm-rf" href="' + COMPARE + '">Read further&nbsp;&rsaquo;</a>' : '') + '</td></tr>';
  }

  // field-health rows — one per widget, with a status dot (paradigm vitals; the G2 observability remedy)
  var FH_DOT = { ok: '#2e9e4f', warn: '#d98a00', alert: '#d23b3b', na: '#9aa4b1' };
  function fhRows(fh) {
    if (!fh || !fh.widgets) return '';
    var rows = fh.widgets.map(function (w) {
      var dot = '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + FH_DOT[w.status] + ';margin-right:7px;vertical-align:middle"></span>';
      return '<tr><th>' + dot + esc(w.label) + '</th><td><b style="color:' + FH_DOT[w.status] + '">' + esc(String(w.value)) + '</b> <span class="sm-dim">' + esc(w.detail) + '</span></td></tr>';
    }).join('');
    return '<tr class="sm-grp"><td colspan="2">Field health · paradigm vitals</td></tr>' + rows;
  }

  function panelHTML(d) {
    var t =
      '<div class="sm-modal" role="dialog" aria-label="System Monitor">' +
      '<div class="sm-head"><img class="sm-mark" src="doublebubble.jpg?v=2" alt="" width="22" height="22"><b>System Monitor</b>' +
        '<span class="sm-sub">iDempiere-faithful · serverless kernel — this device</span>' +
        '<button class="sm-x" data-sm-close title="Close">&times;</button></div>' +
      '<div class="sm-body"><table class="sm-tbl">' +
        '<tr class="sm-grp"><td colspan="2">System</td></tr>' +
        row('Release', '<b>' + esc(d.release) + '</b> &middot; dictionary folded from the iDempiere oracle') +
        row('Environment', esc(d.os)) +
        row('Client', esc(d.ua)) +
        fhRows(d.fieldHealth) +
        '<tr class="sm-grp"><td colspan="2">Memory</td></tr>' +
        row('Heap usage', esc(d.heap)) +
        '<tr class="sm-grp"><td colspan="2">Cache</td></tr>' +
        row('Local storage', esc(d.storage) + (d.tenants != null ? ' &middot; ' + d.tenants + ' resident tenant(s)' + (d.tenantNames ? ' (' + esc(d.tenantNames) + ')' : '') : '')) +
        row('Reset demo / seed ERPs', '<button class="sm-reset" data-sm-reset-seed>Reset demo / seed ERPs</button> <span class="sm-dim">restore the shipped tenants (System &middot; GardenWorld &middot; demo band) to initial, clear the World history + op-log &mdash; <b>keeps the tenants you created</b></span>') +
        row('Cache reset', '<button class="sm-reset sm-nuke" data-sm-reset>Reset to seed (full)</button> <span class="sm-dim">nuclear &mdash; drops the WHOLE local footprint: all your tenants, op-log, World history, plugins &amp; device key</span>') +
        '<tr class="sm-grp"><td colspan="2">Logs &amp; Trace</td></tr>' +
        row('Trace', 'the signed <b>op-log</b> is the trace &mdash; replayable, per-tenant (git-for-data). No server log file.') +
        '<tr class="sm-grp"><td colspan="2">Servers &amp; Cluster</td></tr>' +
        row('Background processors', 'Accounting / Alert / Scheduler / Workflow run <b>on-open or on-sync</b> &mdash; no always-on daemon to babysit.', true) +
        row('Cluster &amp; threads', 'one browser kernel &mdash; no cluster nodes, no JVM thread pool to tune.', true) +
        '<tr class="sm-grp"><td colspan="2">Database</td></tr>' +
        row('Engine', '<b>SQLite-wasm</b>, in-page &mdash; no Postgres host, no DB connection pool.', true) +
      '</table></div></div>' +
      '<div class="sm-backdrop" data-sm-close></div>';
    return t;
  }

  var CSS =
    '#sm-root{position:fixed;inset:0;z-index:1400;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}' +
    '#sm-root .sm-backdrop{position:absolute;inset:0;background:rgba(8,12,20,.55)}' +
    '#sm-root .sm-modal{position:relative;z-index:1;background:#fff;color:#1b2430;width:560px;max-width:94vw;max-height:88vh;overflow:auto;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.45)}' +
    '#sm-root .sm-head{display:flex;align-items:center;gap:9px;padding:13px 16px;background:#0a4ea3;color:#fff;border-radius:10px 10px 0 0;position:sticky;top:0}' +
    '#sm-root .sm-head b{font-size:15px}' +
    '#sm-root .sm-mark{border-radius:5px;object-fit:cover;background:#eef0f2;display:block;flex:0 0 auto}' +
    '#sm-root .sm-sub{font-size:11px;opacity:.82;flex:1}' +
    '#sm-root .sm-x{background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}' +
    '#sm-root .sm-body{padding:6px 16px 16px}' +
    '#sm-root .sm-tbl{width:100%;border-collapse:collapse;font-size:12.5px}' +
    '#sm-root .sm-tbl th{text-align:left;width:150px;color:#5a6675;font-weight:600;vertical-align:top;padding:7px 10px 7px 0;border-bottom:1px solid #eef1f5}' +
    '#sm-root .sm-tbl td{padding:7px 0;border-bottom:1px solid #eef1f5;vertical-align:top}' +
    '#sm-root .sm-grp td{padding:12px 0 4px;color:#0a4ea3;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #0a4ea3}' +
    '#sm-root .sm-badge{display:inline-block;background:#eef4ff;color:#0a4ea3;border:1px solid #cfe0ff;border-radius:4px;font-size:10px;font-weight:700;padding:1px 6px;vertical-align:middle}' +
    '#sm-root .sm-rf{color:#0a4ea3;text-decoration:none;font-weight:600;white-space:nowrap}' +
    '#sm-root .sm-rf:hover{text-decoration:underline}' +
    '#sm-root .sm-reset{background:#0a4ea3;color:#fff;border:0;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer}' +
    '#sm-root .sm-nuke{background:#b23030}' +
    '#sm-root .sm-dim{color:#8a95a3;font-size:11px}';

  function ensureCss() { if (document.getElementById('sm-css')) return; var s = document.createElement('style'); s.id = 'sm-css'; s.textContent = CSS; document.head.appendChild(s); }

  // delIdb — delete an IndexedDB database by name (resolves even if blocked/absent).
  function delIdb(name) { return new Promise(function (r) { try { var q = indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; } catch (e) { r(); } }); }
  // the World history (whole-history timeline scrubber) is the shared localStorage log — NOT the kernel op-log.
  var WORLD_HISTORY_KEYS = ['bim.docHistory', 'bim.wholeRestore', 'bim.whole.mode'];
  // the kernel op-log (signed CRUD truth = git-for-data) lives in its OWN idb, separate from the data cache.
  var OPLOG_IDB = 'glassbowl_kernel_ops';
  // nuclear full-wipe set: data cache · kernel op-log · installed plugins · device signing key.
  var FULL_WIPE_IDB = ['erp_cache', 'glassbowl_kernel_ops', 'fold_plugins', 'bim_erp_signer'];
  function clearWorldHistory() { try { var ls = global.localStorage; if (ls) WORLD_HISTORY_KEYS.forEach(function (k) { try { ls.removeItem(k); } catch (e) {} }); } catch (e) {} }

  // idbPutBlob — write a blob under erp_cache/blobs (the SAME store/key idempiere.html loads the live db from).
  function idbPutBlob(key, val) {
    return new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('erp_cache', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('blobs'); };
        req.onsuccess = function () {
          var tx = req.result.transaction('blobs', 'readwrite');
          tx.objectStore('blobs').put(val, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        };
        req.onerror = function () { reject(req.error); };
      } catch (e) { reject(e); }
    });
  }

  // resetSeedClients — SURGICAL reset (user 2026-06-19): restore the SHIPPED seed/demo ERP clients to their
  //   initial state WITHOUT touching the tenants the user created. The mutated/dirty state lives in the
  //   persisted ad_seed_v16 blob (whole-db cache); pristine ad_seed.db carries only System(0)+GardenWorld(11),
  //   the demo band (12-16) re-installs from shards on demand, and born/resident tenants start at AD_Client_ID
  //   >= 17 (genesis nextClientId floor). So: snapshot every row >= 17 → re-fetch pristine ad_seed.db → re-insert
  //   the snapshot (col-INTERSECT, INSERT OR IGNORE, like Genesis.mergeGenesisInto) → replace ad_seed_v16.
  //   Net: seed clients pristine · demo installs gone (re-installable) · born tenants + their data intact.
  //   The op-log/overlay scoped to seed clients 0-16 is carried IN ad_seed_v16, so the wholesale replace drops it;
  //   the separate glassbowl demo sidecar (its own idb) is a different surface and is left alone. W-SEED-RESET-LIVE.
  var SEED_FLOOR = 17;

  // _rebuildSeed — the PURE transform (testable headless): snapshot every resident row (AD_Client_ID >= floor)
  //   from `live` across `tables`, then re-insert it into `fresh` (the pristine seed) column-INTERSECT +
  //   INSERT OR IGNORE. Mutates `fresh` in place; returns the counts the witness asserts on. No globals/fetch/idb.
  function _rebuildSeed(live, fresh, tables, floor) {
    var snapshot = [], snapRows = 0, snapTbls = 0;
    tables.forEach(function (t) {
      try {
        var r = live.exec('SELECT * FROM "' + t + '" WHERE AD_Client_ID >= ' + floor);
        if (r.length && r[0].values.length) { snapshot.push({ table: t, cols: r[0].columns, rows: r[0].values }); snapRows += r[0].values.length; snapTbls++; }
      } catch (e) {}
    });
    var reins = 0, reinsTbls = 0;
    snapshot.forEach(function (s) {
      var ti; try { ti = fresh.exec('PRAGMA table_info("' + s.table + '")'); } catch (e) { return; }
      if (!ti.length) return;                          // table absent in pristine seed → could not have held resident data
      var fcol = {}; ti[0].values.forEach(function (c) { fcol[String(c[1]).toLowerCase()] = c[1]; });
      var keep = [], idx = [];
      s.cols.forEach(function (c, i) { var k = fcol[String(c).toLowerCase()]; if (k) { keep.push(k); idx.push(i); } });
      if (!keep.length) return;
      var sql = 'INSERT OR IGNORE INTO "' + s.table + '" (' + keep.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + keep.map(function () { return '?'; }).join(',') + ')';
      var stmt; try { stmt = fresh.prepare(sql); } catch (e) { return; }
      s.rows.forEach(function (rw) { try { stmt.run(idx.map(function (i) { return rw[i]; })); reins++; } catch (e) {} });
      stmt.free(); reinsTbls++;
    });
    return { snapTbls: snapTbls, snapRows: snapRows, reinsTbls: reinsTbls, reins: reins };
  }

  async function resetSeedClients() {
    var db = global.__idmpDb, SQL = global.SQL, SES = global.IdmpSession;
    if (!db || !SQL || !SES || !SES.clientTables) {
      console.log('§SEED-RESET unavailable db=' + !!db + ' SQL=' + !!SQL + ' SES=' + !!(SES && SES.clientTables));
      if (global.alert) global.alert('Seed reset is only available inside the iDempiere window.');
      return;
    }
    if (!global.confirm || !global.confirm(
      'Reset demo / seed ERPs?\n\nThe shipped tenants — System, GardenWorld, and any demo-band installs (Odoo · iDempiere · SAP · Oracle · Dynamics) — return to their INITIAL state. Dirty / edited / demo data is removed.\n\nThe tenants YOU created (and all their data) are KEPT untouched.')) return;
    console.log('§SEED-RESET start floor=' + SEED_FLOOR);

    // 1+2. re-fetch the PRISTINE shipped seed, then rebuild it with the resident (>= floor) snapshot.
    var fresh;
    try { var buf = await (await fetch('ad_seed.db', { cache: 'reload' })).arrayBuffer(); fresh = new SQL.Database(new Uint8Array(buf)); }
    catch (e) { console.log('§SEED-RESET fetch-fail ' + (e && e.message)); if (global.alert) global.alert('Could not fetch the shipped seed — reset aborted (your data is untouched).'); return; }
    var c = _rebuildSeed(db, fresh, SES.clientTables(db), SEED_FLOOR);
    console.log('§SEED-RESET snapshot residentTables=' + c.snapTbls + ' residentRows=' + c.snapRows);
    console.log('§SEED-RESET reinsert residentRows=' + c.reins + ' tables=' + c.reinsTbls);

    // 3. persist the rebuilt base as the live cache (replaces the mutated blob).
    try { await idbPutBlob('ad_seed_v16', fresh.export().buffer); console.log('§SEED-RESET persisted key=ad_seed_v16 pristine+resident'); }
    catch (e) { console.log('§SEED-RESET persist-fail ' + (e && e.message)); }
    try { fresh.close(); } catch (e) {}
    // 4. clear the World history (whole-history timeline) + the kernel op-log so the reset is a clean slate.
    //    (born-tenant DATA is preserved above; only the audit/history trail is reset — the user's call.)
    clearWorldHistory(); await delIdb(OPLOG_IDB);
    console.log('§SEED-RESET cleared world-history + op-log (' + OPLOG_IDB + ')');
    console.log('§SEED-RESET done — reloading');
    location.reload();
  }

  async function resetToSeed() {
    if (!global.confirm || !global.confirm('Reset to seed (full)? This drops EVERYTHING local — all tenants you created + edits, the kernel op-log, the World history timeline, installed plugins, and the device key — and re-folds from the shipped seed.')) return;
    console.log('§SYSTEM-MONITOR reset-to-seed start');
    // the WHOLE local footprint: data cache · op-log · plugins · device signer · World history · SW asset caches
    clearWorldHistory();
    for (var i = 0; i < FULL_WIPE_IDB.length; i++) { try { await delIdb(FULL_WIPE_IDB[i]); console.log('§SYSTEM-MONITOR wiped idb=' + FULL_WIPE_IDB[i]); } catch (e) {} }
    try { if (global.caches) { var ks = await caches.keys(); await Promise.all(ks.filter(function (k) { return /erp-ootb-/.test(k); }).map(function (k) { return caches.delete(k); })); } } catch (e) {}
    console.log('§SYSTEM-MONITOR reset-to-seed done (world-history + op-log + plugins + signer cleared) — reloading');
    location.reload();
  }

  function close() { var r = document.getElementById('sm-root'); if (r) r.remove(); }
  function open() {
    ensureCss();
    close();
    var root = document.createElement('div'); root.id = 'sm-root';
    root.innerHTML = '<div class="sm-modal"><div class="sm-head"><img class="sm-mark" src="doublebubble.jpg?v=2" alt="" width="22" height="22"><b>System Monitor</b><span class="sm-sub">loading…</span></div></div><div class="sm-backdrop" data-sm-close></div>';
    document.body.appendChild(root);
    console.log('§SYSTEM-MONITOR open');
    gather().then(function (d) {
      root.innerHTML = panelHTML(d);
      root.querySelectorAll('[data-sm-close]').forEach(function (el) { el.addEventListener('click', close); });
      var rb = root.querySelector('[data-sm-reset]'); if (rb) rb.addEventListener('click', resetToSeed);
      var rsb = root.querySelector('[data-sm-reset-seed]'); if (rsb) rsb.addEventListener('click', resetSeedClients);
    });
  }

  global.SystemMonitor = { open: open, close: close, _gather: gather, _resetSeedClients: resetSeedClients, _rebuildSeed: _rebuildSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.SystemMonitor;
})(typeof window !== 'undefined' ? window : this);
