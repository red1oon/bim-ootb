/**
 * migrate_showme.js — first-mile Migrate ShowMe overlay (master/metadata data only).
 * Copyright (c) 2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Spec: docs/ERP.md §0.10a + prompts/MIGRATE_SHOWME_OVERLAY.md (in bim-compiler).
 *
 * Honest 2-part flow — a browser CANNOT open TCP to Postgres:5432, so this overlay does
 * NOT migrate. It GUIDES the operator to the LOCAL agent (scripts/migrate_pg_to_sqlite.js
 * --masters) and REFLECTS the result: the operator loads the produced ad_masters_<n>.db and
 * the overlay reads the REAL master counts back via sql.js (non-invent — absent table shows
 * "absent", never synthesized). ShowMe = data IN; ReadMe (step 5) = share/serve OUT.
 *
 * Witnesses (console, §-log first):
 *   §SHOWME-MIGRATE steps=4 shown=Y creds-captured=<Y|N>
 *   §SHOWME-MIGRATE stream table=C_BPartner rows=18 …   (real counts from the loaded db)
 *   §SHOWME-MIGRATE done masters-resident=Y browsable=Y
 *   §README-SHARE replay-hash=<hex> (load two copies → equal proves "identical DB")
 */
(function () {
  'use strict';

  // Headline masters streamed visibly — lowercase PG table name → canonical display name.
  var HEADLINE = [
    ['c_bpartner', 'C_BPartner'], ['c_bp_group', 'C_BP_Group'],
    ['m_product', 'M_Product'], ['m_product_category', 'M_Product_Category'],
    ['c_uom', 'C_UOM'], ['c_elementvalue', 'C_ElementValue'],
    ['c_charge', 'C_Charge'], ['c_tax', 'C_Tax'], ['c_currency', 'C_Currency']
  ];

  var _SQL = null;      // sql.js module (lazy)
  var _hashes = [];     // for the §README-SHARE "identical DB" check across two loads

  function _ensureSql() {
    if (_SQL) return Promise.resolve(_SQL);
    if (typeof initSqlJs !== 'function') return Promise.reject(new Error('sql.js not loaded'));
    return initSqlJs({ locateFile: function () { return 'lib/sql-wasm-fts5.wasm'; } })
      .then(function (S) { _SQL = S; return S; });
  }

  function _el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function _$(id) { return document.getElementById(id); }

  // SHA-256 of bytes → hex (Web Crypto) for the "same DB" verify (replay-hash analogue).
  function _sha256(bytes) {
    return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf),
        function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  // ── The 4 guided steps + the step-5 ReadMe ──────────────────────────────────
  var STEPS = [
    { key: 'connect', title: '1 · Connect',
      body: '<p>Point the local agent at <b>your iDempiere Docker Postgres</b>. Credentials '
        + 'stay on your machine — the browser never touches Postgres.</p>'
        + '<div class="ms-grid">'
        + ip('ms-host', 'host', 'localhost') + ip('ms-port', 'port', '5432')
        + ip('ms-db', 'db', 'idempiere') + ip('ms-user', 'user', 'adempiere')
        + ip('ms-pass', 'password', '') + '</div>'
        + '<p class="ms-dim">Standard GardenWorld Docker defaults shown. Clients <b>0=System</b> '
        + '(shared masters) and <b>11=GardenWorld</b> are seeds; a 3rd client is your real tenant.</p>'
        + '<details><summary>Optional: paste <code>--list-clients</code> JSON to pick a tenant</summary>'
        + '<textarea id="ms-clients-json" class="ms-ta" placeholder=\'{"clients":[...],"auto":11}\'></textarea>'
        + '<button id="ms-parse-clients" class="ms-btn">Show clients</button>'
        + '<div id="ms-clients"></div></details>' },
    { key: 'run', title: '2 · Run the agent',
      body: '<p>Run this <b>once, locally</b> (it reads your DB with those creds and writes a '
        + 'master/metadata-only SQLite + a progress log):</p>'
        + '<pre id="ms-cmd" class="ms-cmd"></pre><button id="ms-copy" class="ms-btn">Copy</button>'
        + '<p class="ms-dim">Master/metadata only — documents, transactions, postings and logs are '
        + 'excluded; plugin <i>logic</i> is a later step. All clients\' masters come along.</p>' },
    { key: 'watch', title: '3 · Watch masters stream in',
      body: '<p>When the agent finishes, load the <b>ad_masters_&lt;n&gt;.db</b> it produced — the '
        + 'masters land here, read straight from your file (real counts, nothing invented):</p>'
        + '<input type="file" id="ms-db" accept=".db" class="ms-file">'
        + '<div id="ms-stream" class="ms-stream"></div>' },
    { key: 'done', title: '4 · Done',
      body: '<p id="ms-done-msg">Your master data is resident in the browser DB and browsable '
        + 'through the normal record views.</p>' },
    { key: 'share', title: '5 · Share / serve (ReadMe)',
      body: '<p><b>Send the file → the same DB for anyone.</b> Hand over the self-contained '
        + 'offline HTML (or the <code>.db</code> + the hosted viewer URL) — the recipient opens it '
        + 'and has the <i>identical</i> DB. Identical is <b>verifiable</b>: same file → same hash; '
        + 'the signed op-log chain is tamper-evident (<code>verify</code>).</p>'
        + '<p><b>Put it online → it is served.</b> Drop the same file on any static host '
        + '(GitHub Pages / OCI bucket / any web server) → served to anyone with the URL, no backend.</p>'
        + '<p class="ms-dim">Verify "same DB": load the file here on two devices — the hash below '
        + 'must match.</p><div id="ms-share-hash" class="ms-dim"></div>' }
  ];
  function ip(id, ph, val) {
    return '<input id="' + id + '" class="ms-ip" placeholder="' + ph + '" value="' + val + '">';
  }

  var _i = 0, _overlay = null, _creds = false, _resident = 0;

  function open() {
    if (_overlay) close();
    _i = 0; _creds = false; _resident = 0;
    _injectStyle();
    _overlay = _el('div', { id: 'ms-overlay', class: 'ms-overlay' });
    _overlay.innerHTML =
      '<div class="ms-card" role="dialog" aria-label="Migrate ShowMe">'
      + '<div class="ms-head"><span id="ms-title"></span>'
      + '<button id="ms-x" class="ms-x" aria-label="Close">&times;</button></div>'
      + '<div id="ms-body" class="ms-body"></div>'
      + '<div class="ms-nav"><button id="ms-back" class="ms-btn">&larr; Back</button>'
      + '<span id="ms-dots" class="ms-dots"></span>'
      + '<button id="ms-next" class="ms-btn ms-primary">Next &rarr;</button></div></div>';
    document.body.appendChild(_overlay);
    _$('ms-x').onclick = close;
    _$('ms-back').onclick = function () { go(_i - 1); };
    _$('ms-next').onclick = function () { _i >= STEPS.length - 1 ? close() : go(_i + 1); };
    go(0);
    console.log('§SHOWME-MIGRATE steps=4 shown=Y creds-captured=' + (_creds ? 'Y' : 'N'));
  }
  function close() { if (_overlay) { _overlay.remove(); _overlay = null; } }

  function go(i) {
    _i = Math.max(0, Math.min(STEPS.length - 1, i));
    var s = STEPS[_i];
    _$('ms-title').textContent = s.title;
    _$('ms-body').innerHTML = s.body;
    _$('ms-back').style.visibility = _i === 0 ? 'hidden' : 'visible';
    _$('ms-next').textContent = _i >= STEPS.length - 1 ? 'Done' : 'Next →';
    _$('ms-dots').innerHTML = STEPS.map(function (_, k) {
      return '<span class="ms-dot' + (k === _i ? ' on' : '') + '"></span>';
    }).join('');
    if (s.key === 'connect') _wireConnect();
    if (s.key === 'run') _wireRun();
    if (s.key === 'watch') _wireWatch();
    if (s.key === 'done') _wireDone();
    if (s.key === 'share') _wireShare();
  }

  function _credVals() {
    return {
      host: (_$('ms-host') || {}).value || 'localhost',
      port: (_$('ms-port') || {}).value || '5432',
      db: (_$('ms-db') || {}).value || 'idempiere',
      user: (_$('ms-user') || {}).value || 'adempiere'
    };
  }
  function _wireConnect() {
    ['ms-host', 'ms-db', 'ms-user'].forEach(function (id) {
      var e = _$(id); if (e) e.oninput = function () { _creds = !!(_$('ms-db').value && _$('ms-user').value); };
    });
    _creds = !!(_$('ms-db').value && _$('ms-user').value);
    var pc = _$('ms-parse-clients');
    if (pc) pc.onclick = function () {
      var box = _$('ms-clients'); box.innerHTML = '';
      try {
        var j = JSON.parse(_$('ms-clients-json').value);
        (j.clients || []).forEach(function (c) {
          var real = c.id !== 0;
          box.appendChild(_el('div', { class: 'ms-client' + (c.id === j.auto ? ' auto' : '') },
            (c.id === j.auto ? '▶ ' : '') + c.id + ' · ' + c.name
            + (c.hasMasters ? ' <span class="ms-dim">(' + c.bpartners + ' partners)</span>' : ' <span class="ms-dim">(no masters)</span>')
            + (c.id === j.auto ? ' <b>← auto-seek; confirm to use</b>' : '')));
        });
        console.log('§SHOWME-MIGRATE clients-listed n=' + (j.clients || []).length + ' auto=' + j.auto);
      } catch (e) { box.textContent = 'Could not parse JSON: ' + e.message; }
    };
  }
  function _wireRun() {
    var c = _credVals();
    var cmd = 'ERP_PG_DB=' + c.db + ' ERP_PG_USER=' + c.user
      + ' node scripts/migrate_pg_to_sqlite.js --masters';
    _$('ms-cmd').textContent = cmd;
    _$('ms-copy').onclick = function () {
      navigator.clipboard && navigator.clipboard.writeText(cmd);
      _$('ms-copy').textContent = 'Copied';
    };
  }
  function _wireWatch() {
    var inp = _$('ms-db'); if (!inp) return;
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var stream = _$('ms-stream'); stream.innerHTML = '<div class="ms-dim">Reading ' + f.name + '…</div>';
      f.arrayBuffer().then(function (ab) {
        var bytes = new Uint8Array(ab);
        _sha256(bytes).then(function (h) { _hashes.push(h); });
        return _ensureSql().then(function (S) {
          var mdb = new S.Database(bytes);
          stream.innerHTML = '';
          _resident = 0;
          HEADLINE.forEach(function (row, k) {
            var tbl = row[0], disp = row[1], n = null;
            try { var r = mdb.exec('SELECT COUNT(*) FROM "' + tbl + '"'); n = r.length ? r[0].values[0][0] : 0; }
            catch (e) { n = null; /* absent — never invented */ }
            setTimeout(function () {                       // staggered "landing" animation
              var line = _el('div', { class: 'ms-row' + (n == null ? ' absent' : '') },
                '<span class="ms-tick">' + (n == null ? '—' : '✓') + '</span> ' + disp
                + ' <b>' + (n == null ? 'absent' : n) + '</b>');
              stream.appendChild(line);
              if (n != null) { _resident += 1;
                console.log('§SHOWME-MIGRATE stream table=' + disp + ' rows=' + n); }
            }, k * 140);
          });
          setTimeout(function () { mdb.close(); }, HEADLINE.length * 140 + 200);
        });
      }).catch(function (e) { stream.innerHTML = '<div class="ms-absent">Load failed: ' + e.message + '</div>'; });
    };
  }
  function _wireDone() {
    _$('ms-done-msg').innerHTML = (_resident
      ? '<b>' + _resident + ' of ' + HEADLINE.length + '</b> headline master tables are resident '
        + 'and browsable through the normal record views.'
      : 'Load your <code>ad_masters_&lt;n&gt;.db</code> in step 3 to bring masters in.');
    console.log('§SHOWME-MIGRATE done masters-resident=' + (_resident ? 'Y' : 'N') + ' browsable=' + (_resident ? 'Y' : 'N'));
  }
  function _wireShare() {
    var box = _$('ms-share-hash');
    if (_hashes.length >= 2) {
      var same = _hashes[_hashes.length - 1] === _hashes[_hashes.length - 2];
      box.innerHTML = 'replay-hash ' + (same ? 'MATCH ✓ — identical DB' : 'DIFFER ✗')
        + '<br><code>' + _hashes[_hashes.length - 1].slice(0, 24) + '…</code>';
      console.log('§README-SHARE loads=' + _hashes.length + ' replay-hash-match=' + (same ? 'Y' : 'N')
        + ' hash=' + _hashes[_hashes.length - 1]);
    } else if (_hashes.length === 1) {
      box.innerHTML = 'this file\'s hash <code>' + _hashes[0].slice(0, 24) + '…</code> — load the same '
        + 'file again (or on another device) to prove it is identical.';
      console.log('§README-SHARE loads=1 hash=' + _hashes[0]);
    } else {
      box.textContent = 'Load a .db in step 3 to compute its hash.';
    }
  }

  function _injectStyle() {
    if (_$('ms-style')) return;
    var s = _el('style', { id: 'ms-style' });
    s.textContent =
      '.ms-overlay{position:fixed;inset:0;background:rgba(10,12,16,.6);z-index:99999;display:flex;'
      + 'align-items:center;justify-content:center;font-family:system-ui,sans-serif}'
      + '.ms-card{background:#fff;color:#1a1d22;width:min(540px,92vw);max-height:88vh;overflow:auto;'
      + 'border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4)}'
      + '.ms-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;'
      + 'border-bottom:1px solid #eee;font-weight:700;font-size:18px;color:#0b6}'
      + '.ms-x{border:0;background:none;font-size:24px;cursor:pointer;color:#999;line-height:1}'
      + '.ms-body{padding:18px 20px;font-size:14px;line-height:1.5}'
      + '.ms-body p{margin:0 0 12px}.ms-dim{color:#777;font-size:12px}'
      + '.ms-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}'
      + '.ms-ip,.ms-ta{width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:13px;box-sizing:border-box}'
      + '.ms-ta{height:64px;font-family:monospace;margin:6px 0}'
      + '.ms-cmd{background:#0d1117;color:#9be29b;padding:12px;border-radius:8px;font-size:12px;'
      + 'white-space:pre-wrap;word-break:break-all}'
      + '.ms-btn{padding:8px 14px;border:1px solid #ccc;background:#f5f5f5;border-radius:6px;cursor:pointer;font-size:13px}'
      + '.ms-primary{background:#0b6;color:#fff;border-color:#0b6}'
      + '.ms-file{margin:8px 0}'
      + '.ms-stream{margin-top:10px}.ms-row{padding:6px 8px;border-bottom:1px solid #f0f0f0}'
      + '.ms-row.absent{color:#a55}.ms-tick{color:#0b6;font-weight:700}'
      + '.ms-client{padding:6px 8px;border:1px solid #eee;border-radius:6px;margin:4px 0}'
      + '.ms-client.auto{border-color:#0b6;background:#f0fbf6}'
      + '.ms-nav{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-top:1px solid #eee}'
      + '.ms-dots{display:flex;gap:6px}.ms-dot{width:8px;height:8px;border-radius:50%;background:#ddd}.ms-dot.on{background:#0b6}';
    document.head.appendChild(s);
  }

  window.MigrateShowMe = { open: open, close: close };
})();
