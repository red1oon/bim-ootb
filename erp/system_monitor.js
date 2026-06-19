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
  function gather() {
    return Promise.all([swVersion(), storageEstimate()]).then(function (r) {
      var ver = r[0], est = r[1], h = heap(), tenants = residentTenants();
      var d = {
        release: ver || '(uncontrolled)',
        os: (navigator.platform || '—') + ' · ' + (navigator.hardwareConcurrency || '?') + ' cores',
        ua: (navigator.userAgent || '').replace(/^Mozilla\/\S+\s*/, '').slice(0, 60),
        heap: h ? (mb(h.used) + ' used / ' + mb(h.total) + ' heap · limit ' + mb(h.limit)) : 'n/a (this browser does not expose JS heap)',
        storage: est ? (mb(est.usage) + ' used of ' + mb(est.quota) + ' available') : 'n/a',
        tenants: tenants ? tenants.length : null,
        tenantNames: tenants ? tenants.map(function (c) { return c.name; }).join(', ') : null
      };
      console.log('§SYSTEM-MONITOR gather release=' + d.release + ' heap=' + (h ? 'real' : 'n/a') + ' storage=' + (est ? 'real' : 'n/a') + ' tenants=' + d.tenants);
      return d;
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  // a section row: label + value; reframe=true draws the "No longer needed" badge + Read-further link.
  function row(label, value, reframe) {
    return '<tr><th>' + esc(label) + '</th><td>' + (reframe ? '<span class="sm-badge">No longer needed</span> ' : '') + value
      + (reframe ? ' <a class="sm-rf" href="' + COMPARE + '">Read further&nbsp;&rsaquo;</a>' : '') + '</td></tr>';
  }

  function panelHTML(d) {
    var t =
      '<div class="sm-modal" role="dialog" aria-label="System Monitor">' +
      '<div class="sm-head"><b>System Monitor</b>' +
        '<span class="sm-sub">iDempiere-faithful · serverless kernel — this device</span>' +
        '<button class="sm-x" data-sm-close title="Close">&times;</button></div>' +
      '<div class="sm-body"><table class="sm-tbl">' +
        '<tr class="sm-grp"><td colspan="2">System</td></tr>' +
        row('Release', '<b>' + esc(d.release) + '</b> &middot; dictionary folded from the iDempiere oracle') +
        row('Environment', esc(d.os)) +
        row('Client', esc(d.ua)) +
        '<tr class="sm-grp"><td colspan="2">Memory</td></tr>' +
        row('Heap usage', esc(d.heap)) +
        '<tr class="sm-grp"><td colspan="2">Cache</td></tr>' +
        row('Local storage', esc(d.storage) + (d.tenants != null ? ' &middot; ' + d.tenants + ' resident tenant(s)' + (d.tenantNames ? ' (' + esc(d.tenantNames) + ')' : '') : '')) +
        row('Cache reset', '<button class="sm-reset" data-sm-reset>Reset to seed</button> <span class="sm-dim">drop the local cache &amp; re-fold from the shipped seed</span>') +
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
    '#sm-root .sm-dim{color:#8a95a3;font-size:11px}';

  function ensureCss() { if (document.getElementById('sm-css')) return; var s = document.createElement('style'); s.id = 'sm-css'; s.textContent = CSS; document.head.appendChild(s); }

  async function resetToSeed() {
    if (!global.confirm || !global.confirm('Reset to seed? This drops the local cache (resident tenants + edits) and re-folds from the shipped dictionary.')) return;
    console.log('§SYSTEM-MONITOR reset-to-seed start');
    try { await new Promise(function (r) { var q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = function () { r(); }; }); } catch (e) {}
    try { if (global.caches) { var ks = await caches.keys(); await Promise.all(ks.filter(function (k) { return /erp-ootb-/.test(k); }).map(function (k) { return caches.delete(k); })); } } catch (e) {}
    console.log('§SYSTEM-MONITOR reset-to-seed done — reloading');
    location.reload();
  }

  function close() { var r = document.getElementById('sm-root'); if (r) r.remove(); }
  function open() {
    ensureCss();
    close();
    var root = document.createElement('div'); root.id = 'sm-root';
    root.innerHTML = '<div class="sm-modal"><div class="sm-head"><b>System Monitor</b><span class="sm-sub">loading…</span></div></div><div class="sm-backdrop" data-sm-close></div>';
    document.body.appendChild(root);
    console.log('§SYSTEM-MONITOR open');
    gather().then(function (d) {
      root.innerHTML = panelHTML(d);
      root.querySelectorAll('[data-sm-close]').forEach(function (el) { el.addEventListener('click', close); });
      var rb = root.querySelector('[data-sm-reset]'); if (rb) rb.addEventListener('click', resetToSeed);
    });
  }

  global.SystemMonitor = { open: open, close: close, _gather: gather };
})(typeof window !== 'undefined' ? window : this);
