// ad_ui.js — Implementing ERP_AD_UI.md §2–§5, §10, §12, §14, §16 — Witness: W-ERP-ADUI
// AD-driven UI renderer: bottom nav, menu screen, window/tab/field cards.
// Depends on: ad_parser.js, ad_data.js, ad_charts.js, kernel_ops.js
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var _db = null;
  var _dbReady = false;           // true after hydrate() completes
  var _contentEl = null;
  var _navEl = null;
  var _breadcrumbEl = null;
  var _currentScreen = 'home';   // always 'home' (window screens live in idempiere.html)
  var _heatmapHitRegions = [];    // for tap-to-drill on treemap
  var _graphAutoMaxed = false;    // auto-maximize globe on first load
  var _graphIsMaxed = false;      // track current maximized state
  var _currentClient = 'gardenworld';  // 'system' | 'gardenworld'
  var GW_WINDOW_SET = null; // built on init from tables that actually have rows

  // ── §2. Bottom navigation bar — RETIRED (user wrap 2026-06-10) ──────
  // The emoji bottom-button bar (Home/List/New/Charts/More) belonged to the in-app record UI that the
  // §IDEMPIERE-ROUTE launcher model replaced. It was the "old deprecated format" that reappeared on some
  // back-from-idempiere paths. _renderBottomNav + _navHandler are DELETED; erp.html is bubbles + pill ONLY.

  // ── §3. Menu screen (Home) ─────────────────────────────────────────

  function showMenu() {
    _currentScreen = 'home';
    _contentEl.innerHTML = '';

    // Breadcrumb — reset style from window view
    _breadcrumbEl.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10;' +
      'background:rgba(18,18,24,0.92);backdrop-filter:blur(12px);' +
      '-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.06);' +
      'padding:12px 16px;min-height:48px;display:flex;align-items:center;gap:8px;';
    _breadcrumbEl.innerHTML = '<span style="font-size:16px;font-weight:bold;color:#eee">' +
      '\u2630 ERP OOTB</span>';

    // §IDEMPIERE-ROUTE (user wrap 2026-06-10) — erp.html is the bubble LAUNCHER, ALWAYS. Render only the
    // curated globe skeleton; the old DB-ready home chrome (bottom-button nav + recent list + menu tree)
    // is RETIRED — drilling now launches idempiere.html. Guarantees "clean bubbles only, no bottom buttons"
    // on every entry (incl. back-from-idempiere), regardless of _dbReady.
    if (typeof ADGraph !== 'undefined' && typeof INIT_BUBBLES !== 'undefined') {
      _renderHomeGraph();  // initFromBubbles path; graphHydrate already enabled drill once DB ready
      console.log('§AD_UI showMenu bubbles dbReady=' + _dbReady);
    } else {
      _contentEl.innerHTML = '<div style="text-align:center;color:#666;padding:40px">' +
        'Loading ERP\u2026</div>';
      console.log('§AD_UI showMenu waiting');
    }
  }


  // ── Data constellation (graph view on home) ────────────────────────

  var _graphCanvas = null;
  var _graphContainer = null;  // the div that goes fullscreen

  // §IDEMPIERE-ROUTE — resolve a table's PK value from a raw record row (case-insensitive col match).
  function _recPk(record, tableName) {
    if (!record) return null;
    var want = (tableName + '_ID').toLowerCase();
    for (var k in record) { if (k.toLowerCase() === want) return record[k]; }
    return null;
  }

  // §IDEMPIERE-ROUTE — the in-app accordion/grid record view is RETIRED. Drilling a record or
  // requesting the table view now opens the REAL iDempiere (idempiere.html) → login → client/role-scoped
  // records (wrong client → blank, the familiar iDempiere behavior). Deep-links ?window=&record= survive login.
  function _openInIdempiere(windowId, tableName, recordId) {
    var wid = windowId;
    if (!wid && tableName) {
      try {
        var wr = _db.exec(
          'SELECT w.AD_Window_ID FROM AD_Window w ' +
          'JOIN AD_Tab t ON w.AD_Window_ID = t.AD_Window_ID ' +
          'JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID ' +
          "WHERE tbl.TableName = ? AND w.IsActive = 'Y' LIMIT 1", [tableName]);
        if (wr.length && wr[0].values.length) wid = Number(wr[0].values[0][0]);
      } catch (e) { /* no window */ }
    }
    if (!wid) { _showToast('No iDempiere window for ' + (tableName || '?')); return; }
    var url = 'idempiere.html?window=' + wid + (recordId != null && recordId !== '' ? '&record=' + encodeURIComponent(recordId) : '');
    console.log('§AD_UI open-in-idempiere table=' + tableName + ' url=' + url);
    window.location.href = url;
  }

  function _graphDrillCallback(tableName, windowId, record, filterMode) {
    console.log('§AD_UI drill table=' + tableName + ' windowId=' + windowId +
                ' filterMode=' + (filterMode || 'none') + ' hasRecord=' + !!record);
    // Open the record (or the window's table view) in the real iDempiere — see §IDEMPIERE-ROUTE.
    _openInIdempiere(windowId, tableName, record ? _recPk(record, tableName) : null);
  }

  // §1.3–1.4 Fields as columns, data as rows (CSS Grid)

  // Case-insensitive record field getter (SQLite may return lowercase columns)

  // §4.3 Resolve FK value → Name/DocumentNo. Returns display string.

  // Get AD_Field metadata for a table (header tab only — TabLevel=0, deduplicated)
  // §S262: enriched with referenceType, isReadOnly, isMandatory, isKey, referenceId, defaultValue

  // Fallback: use record keys as field list (skip system + _ID PKs)

  // Resolve title from record

  // Discover FK child tabs for a record

  // Load child records for a child tab


  function _graphLongPressCallback(node) {
    // §IDEMPIERE-ROUTE — long-press a bubble → open it in the real iDempiere (login → records).
    // Table bubble → window only; record bubble → that record (node.recordId).
    _openInIdempiere(node.windowId, node.tableName, (node.recordId != null ? node.recordId : null));
  }

  function _renderHomeGraph() {
    if (typeof ADGraph === 'undefined') {
      // Fallback to heatmap if ad_graph.js not loaded
      _renderHeatmap('home');
      return;
    }

    var container = document.createElement('div');
    container.dataset.graphContainer = '1';
    container.style.cssText = 'background:linear-gradient(135deg,#0e0e14,#1a1a28);' +
      'border:1px solid rgba(255,255,255,0.06);border-radius:14px;' +
      'margin-bottom:16px;overflow:hidden;position:relative;';

    var canvas = document.createElement('canvas');
    // Use viewport dimensions — always available, never 0
    var vw = (typeof window !== 'undefined' && window.innerWidth > 100) ? window.innerWidth : 480;
    var vh = (typeof window !== 'undefined' && window.innerHeight > 100) ? window.innerHeight : 600;
    // In landscape (vw > vh), make canvas square-ish using vh as reference
    // In portrait, use full width, 70% height
    var cw = Math.min(vw, 960);  // cap at 960 for desktop
    var ch = (vw > vh) ? Math.round(vh * 0.6) : Math.round(cw * 0.7);
    ch = Math.max(ch, 280);
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.cssText = 'display:block;width:100%;height:' + ch + 'px;' +
      'cursor:grab;touch-action:none;';
    container.appendChild(canvas);
    _graphCanvas = canvas;
    _graphContainer = container;

    // Fullscreen toggle — uses browser Fullscreen API (hides URL bar)
    var fsBtn = document.createElement('button');
    fsBtn.textContent = '\u26F6';  // ⛶
    fsBtn.style.cssText = 'position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.5);' +
      'border:1px solid rgba(255,255,255,0.15);color:#aaa;font-size:16px;' +
      'cursor:pointer;width:28px;height:28px;border-radius:6px;z-index:5;' +
      'display:flex;align-items:center;justify-content:center;line-height:1;';

    function _resizeGraph(fullscreen) {
      _graphIsMaxed = fullscreen;
      if (fullscreen) {
        container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:60;' +
          'background:#0a0a12;border:none;border-radius:0;margin:0;overflow:hidden;';
        // Match actual viewport — no distortion in landscape
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        canvas.width = vw;
        canvas.height = vh;
        canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none;';
        fsBtn.textContent = '\u2212';
        fsBtn.style.top = '10px';
        fsBtn.style.right = '10px';
        fsBtn.style.width = '36px';
        fsBtn.style.height = '36px';
        fsBtn.style.fontSize = '20px';
      } else {
        container.style.cssText = 'background:linear-gradient(135deg,#0e0e14,#1a1a28);' +
          'border:1px solid rgba(255,255,255,0.06);border-radius:14px;' +
          'margin-bottom:16px;overflow:hidden;position:relative;';
        var rvw = window.innerWidth || 480;
        var rvh = window.innerHeight || 600;
        var rw = Math.min(rvw, 960);
        var rh = (rvw > rvh) ? Math.round(rvh * 0.6) : Math.round(rw * 0.7);
        rh = Math.max(rh, 280);
        canvas.width = rw;
        canvas.height = rh;
        canvas.style.cssText = 'display:block;width:100%;height:' + rh + 'px;cursor:grab;touch-action:none;';
        fsBtn.textContent = '\u26F6';
        fsBtn.style.top = '6px';
        fsBtn.style.right = '6px';
        fsBtn.style.width = '28px';
        fsBtn.style.height = '28px';
        fsBtn.style.fontSize = '16px';
      }
      // §INSTANT — resize the EXISTING globe in place (no destroy()+re-init). The
      // canvas element is reused (only width/height changed above), so the animation
      // loop, listeners and drill state survive — this kills the second "bubble burst"
      // the 100ms auto-maximize used to cause by tearing the graph down and rebuilding.
      if (ADGraph.resize) {
        ADGraph.resize(canvas.width, canvas.height);
      } else {
        // Legacy fallback: full rebuild (keeps the curated skeleton authoritative).
        ADGraph.destroy();
        if (typeof INIT_BUBBLES !== 'undefined' && ADGraph.initFromBubbles) {
          ADGraph.initFromBubbles(canvas, INIT_BUBBLES, _currentClient,
            _graphDrillCallback, _graphLongPressCallback, _toggleSearchOverlay);
          if (_dbReady && _db && ADGraph.graphHydrate) ADGraph.graphHydrate(_db);
        } else {
          ADGraph.init(canvas, _db, _currentClient,
            _graphDrillCallback, _graphLongPressCallback, _toggleSearchOverlay);
        }
      }
      console.log('§AD_UI graphFullscreen=' + fullscreen +
        ' w=' + canvas.width + ' h=' + canvas.height);
    }

    fsBtn.addEventListener('pointerup', function (e) {
      e.stopPropagation();
      if (!document.fullscreenElement) {
        // Enter true fullscreen (hides URL bar)
        var target = container;
        var rfs = target.requestFullscreen || target.webkitRequestFullscreen;
        if (rfs) {
          rfs.call(target).then(function () { _resizeGraph(true); })
            .catch(function () { _resizeGraph(true); }); // fallback if promise rejected
        } else {
          _resizeGraph(true); // fallback: no Fullscreen API
        }
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
    });

    // Listen for fullscreen exit (ESC or browser back)
    document.addEventListener('fullscreenchange', function () {
      if (!document.fullscreenElement && container.dataset.graphContainer) {
        _resizeGraph(false);
      }
    });

    // §HUD-DEDUP — top-right ⛶ maximize + 🔍 search icons REMOVED from the graph HUD.
    // Both live in the pill rail now (erp_pills.js: id=find → search, id=maximize → fullscreen),
    // so the in-container duplicates are gone. fsBtn stays DEFINED (not appended) because
    // _resizeGraph mutates its label/style during the globe auto-maximize; it's just no longer shown.
    console.log('§AD_UI hud-dedup removed=[maximize,search] keptInPill=[find,maximize]');

    // Companion links (🫧 Glassbowl · ✦ Gravity · 📖 Read) REMOVED from the graph HUD — they were
    // buttons OUTSIDE the pill rail. All in the pill now: glassbowl/gravity already in pills.json;
    // the ERP-doc link moved to the registry as id=erpdoc. No controls live outside the pill.
    console.log('§AD_UI gbHud-removed movedToPill=[glassbowl,gravity,erpdoc]');

    _contentEl.appendChild(container);

    // §INSTANT — always render the curated skeleton (initFromBubbles); graphHydrate(db)
    // enables drill on it, so we never rebuild from _buildHomeNodes (no destroy/reset flash).
    if (typeof INIT_BUBBLES !== 'undefined' && ADGraph.initFromBubbles) {
      ADGraph.initFromBubbles(canvas, INIT_BUBBLES, _currentClient,
        _graphDrillCallback, _graphLongPressCallback, _toggleSearchOverlay);
      // initFromBubbles resets the graph's _db to null; re-attach so tap-drill still queries records.
      if (_dbReady && _db && ADGraph.graphHydrate) ADGraph.graphHydrate(_db);
    } else {
      ADGraph.init(canvas, _db, _currentClient,
        _graphDrillCallback, _graphLongPressCallback);
    }

    // Auto-maximize globe — first load or if was maximized before client switch.
    // §INIT-REBURST fix: maximize SYNCHRONOUSLY (same tick as initFromBubbles, before the first rAF paint)
    // so the globe's first visible frame is already at final size. The old setTimeout(…,100) painted the
    // canvas at its small height (360) then grew it to viewport (600) ~100ms later — a visible size/position
    // JUMP on every load + refresh (witness tests/poc_init_reburst.js: resizedAfterPaint Y→N). resize-in-place
    // (ADGraph.resize) means no destroy/reinit, so this does NOT reintroduce the old bubble-burst.
    if (!_graphAutoMaxed || _graphIsMaxed) {
      _graphAutoMaxed = true;
      _graphIsMaxed = true;
      _resizeGraph(true);
    }

    console.log('§AD_UI graphView rendered client=' + _currentClient);
  }

  // ── §16. Context-aware heatmap panel ────────────────────────────────


  function _renderHeatmap(context) {
    // context = 'home' | 'window'
    var container = document.createElement('div');
    container.style.cssText = 'background:linear-gradient(135deg,#1e1e2a,#252535);' +
      'border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:12px;' +
      'margin-bottom:16px;animation:fadeIn 0.3s ease;';

    var canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 260;
    canvas.style.cssText = 'display:block;width:100%;height:auto;cursor:pointer;';
    container.appendChild(canvas);

    if (context === 'home') _drawHomeHeatmap(canvas);

    _contentEl.appendChild(container);
  }

  function _drawHomeHeatmap(canvas) {
    var items = [];

    if (_currentClient === 'system') {
      // System: AD metadata volumes
      var sysQueries = [
        { label: 'Columns', table: 'AD_Column', colour: '#6c9fff' },
        { label: 'Fields', table: 'AD_Field', colour: '#54d9a8' },
        { label: 'Tables', table: 'AD_Table', colour: '#a78bfa' },
        { label: 'Tabs', table: 'AD_Tab', colour: '#ff9f43' },
        { label: 'Windows', table: 'AD_Window', colour: '#38d9d9' },
        { label: 'Menus', table: 'AD_Menu', colour: '#ffd93d' },
        { label: 'References', table: 'AD_Reference', colour: '#ff85a2' },
        { label: 'Ref Lists', table: 'AD_Ref_List', colour: '#7bed9f' }
      ];
      for (var si = 0; si < sysQueries.length; si++) {
        var cnt = ADData.countRecords(_db, sysQueries[si].table);
        if (cnt > 0) items.push({
          label: sysQueries[si].label + ' (' + cnt + ')',
          value: cnt, colour: sysQueries[si].colour,
          tableName: sysQueries[si].table, windowId: null
        });
      }
    } else {
      // GardenWorld: semantic business categories
      var custCnt = 0, vendCnt = 0;
      try {
        var cr = _db.exec("SELECT COUNT(*) FROM C_BPartner WHERE IsCustomer='Y'");
        custCnt = cr.length ? Number(cr[0].values[0][0]) : 0;
      } catch (e) {}
      try {
        var vr = _db.exec("SELECT COUNT(*) FROM C_BPartner WHERE IsVendor='Y'");
        vendCnt = vr.length ? Number(vr[0].values[0][0]) : 0;
      } catch (e) {}
      var prodCnt = ADData.countRecords(_db, 'M_Product');
      var catCnt = ADData.countRecords(_db, 'M_Product_Category');
      var priceCnt = ADData.countRecords(_db, 'M_ProductPrice');
      var contactCnt = ADData.countRecords(_db, 'AD_User');

      if (custCnt > 0) items.push({ label: 'Customers (' + custCnt + ')', value: custCnt,
        colour: '#6c9fff', tableName: 'C_BPartner', windowId: 123 });
      if (vendCnt > 0) items.push({ label: 'Vendors (' + vendCnt + ')', value: vendCnt,
        colour: '#ff9f43', tableName: 'C_BPartner', windowId: 123 });
      if (prodCnt > 0) items.push({ label: 'Products (' + prodCnt + ')', value: prodCnt,
        colour: '#54d9a8', tableName: 'M_Product', windowId: 140 });
      if (catCnt > 0) items.push({ label: 'Categories (' + catCnt + ')', value: catCnt,
        colour: '#a78bfa', tableName: 'M_Product_Category', windowId: null });
      if (priceCnt > 0) items.push({ label: 'Prices (' + priceCnt + ')', value: priceCnt,
        colour: '#ffd93d', tableName: 'M_ProductPrice', windowId: null });
      if (contactCnt > 0) items.push({ label: 'Contacts (' + contactCnt + ')', value: contactCnt,
        colour: '#38d9d9', tableName: 'AD_User', windowId: null });
    }

    var title = (_currentClient === 'system' ? 'System' : 'GardenWorld') + ' — Data Landscape';
    _heatmapHitRegions = ADCharts.drawTreemap(canvas, items, title);

    // Tap to drill
    canvas.addEventListener('pointerup', function (e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var cx = (e.clientX - rect.left) * scaleX;
      var cy = (e.clientY - rect.top) * scaleY;
      for (var i = 0; i < _heatmapHitRegions.length; i++) {
        var r = _heatmapHitRegions[i];
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
          console.log('§AD_UI heatmapTap label=' + r.item.label);
          if (r.item.windowId) {
            openWindow(r.item.windowId);
          } else {
            _drillToTable(r.item.tableName);
          }
          break;
        }
      }
    });

    console.log('§AD_UI heatmap home items=' + items.length + ' client=' + _currentClient);
  }

  function _drillToTable(tableName) {
    // Find a window whose header tab uses this table
    try {
      var r = _db.exec(
        'SELECT w.AD_Window_ID FROM AD_Window w ' +
        'JOIN AD_Tab t ON w.AD_Window_ID = t.AD_Window_ID ' +
        'JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID ' +
        'WHERE tbl.TableName = ? AND t.TabLevel = 0 AND w.IsActive = \'Y\' LIMIT 1',
        [tableName]);
      if (r.length && r[0].values.length) {
        openWindow(Number(r[0].values[0][0]));
      } else {
        _showToast(tableName + ': no window found');
      }
    } catch (e) {
      _showToast('Drill failed: ' + e.message);
    }
  }

  var _systemWindowSet = {};

  function _buildWindowSets() {
    // Find all windows whose header tab points to a table with rows
    GW_WINDOW_SET = {};
    _systemWindowSet = {};
    try {
      var r = _db.exec(
        'SELECT DISTINCT w.AD_Window_ID, tbl.TableName ' +
        'FROM AD_Window w JOIN AD_Tab t ON w.AD_Window_ID = t.AD_Window_ID ' +
        'JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID ' +
        'WHERE w.IsActive = \'Y\' AND t.IsActive = \'Y\' AND t.TabLevel = 0'
      );
      if (!r.length) return;
      for (var i = 0; i < r[0].values.length; i++) {
        var wid = r[0].values[i][0];
        var tbl = r[0].values[i][1];
        try {
          var cnt = _db.exec('SELECT COUNT(*) FROM [' + tbl + ']');
          if (cnt.length && Number(cnt[0].values[0][0]) > 0) {
            // AD_ tables = system, others = GardenWorld
            if (tbl.indexOf('AD_') === 0) {
              _systemWindowSet[wid] = true;
            } else {
              GW_WINDOW_SET[wid] = true;
            }
          }
        } catch (e) { /* table doesn't exist */ }
      }
    } catch (e) {
      console.log('§AD_UI _buildWindowSets error: ' + e.message);
    }
    console.log('§AD_UI windowSets system=' + Object.keys(_systemWindowSet).length +
                ' gw=' + Object.keys(GW_WINDOW_SET).length);
  }



  // ── §4. Window screen — records, tabs and master-detail live in idempiere.html (§IDEMPIERE-ROUTE); the in-app
  //    renderer here was unreachable (_currentWindow is never set) and was removed with the §GT tab layer.

  // §INSTANT — shimmer toast when DB still loading
  function _showHydrating() {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:80;' +
      'padding:16px 28px;border-radius:14px;font-size:14px;font-weight:600;color:#fff;' +
      'background:rgba(12,12,18,0.8);backdrop-filter:blur(12px);' +
      '-webkit-backdrop-filter:blur(12px);border:1px solid rgba(108,159,255,0.3);' +
      'box-shadow:0 0 24px rgba(108,159,255,0.15);pointer-events:none;' +
      'animation:fadeInOut 1.5s ease forwards;';
    t.textContent = 'Loading data\u2026';
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 1500);
  }

  // §IDEMPIERE-ROUTE (user wrap 2026-06-10) — the in-app window/grid view + its bottom-button bar are
  // RETIRED. erp.html is the bubble LAUNCHER; opening a window now launches the REAL iDempiere renderer
  // (idempiere.html → login → client/role-scoped records). Every caller (FTS hit, recent, deep-link)
  // funnels through here so the deprecated grid/_renderBottomNav can never repaint.
  function openWindow(windowId) {
    if (!_dbReady) { _showHydrating(); return; }
    console.log('§AD_UI openWindow id=' + windowId + ' → idempiere');
    _openInIdempiere(Number(windowId), null, null);
  }

  // ── §18. Arrow key navigation ─────────────────────────────────────

  // ── Client switching ────────────────────────────────────────────

  var _clients = ['system', 'gardenworld'];

  function _switchClient(direction) {
    var idx = _clients.indexOf(_currentClient);
    var next = (idx + direction + _clients.length) % _clients.length;
    if (_clients[next] === _currentClient) return;
    _currentClient = _clients[next];
    // Toast showing new client name
    _showClientToast(_currentClient);
    showMenu();
    console.log('§AD_UI switchClient client=' + _currentClient + ' dir=' + direction);
  }

  function _showClientToast(client) {
    var label = client === 'system' ? 'System' : 'GardenWorld';
    var colour = client === 'system' ? '#6c9fff' : '#ff9f43';
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:80;padding:16px 32px;border-radius:14px;font-size:18px;font-weight:700;' +
      'color:#fff;letter-spacing:1px;pointer-events:none;' +
      'background:rgba(12,12,18,0.6);backdrop-filter:blur(16px);' +
      '-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid ' + colour + ';' +
      'box-shadow:0 0 24px ' + colour + '33;' +
      'animation:fadeInOut 1s ease forwards;';
    toast.textContent = label;
    // Inject animation if not already present
    if (!document.getElementById('client-toast-style')) {
      var s = document.createElement('style');
      s.id = 'client-toast-style';
      s.textContent = '@keyframes fadeInOut{0%{opacity:0;transform:translate(-50%,-50%) scale(0.9)}' +
        '20%{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
        '80%{opacity:1;transform:translate(-50%,-50%) scale(1)}' +
        '100%{opacity:0;transform:translate(-50%,-50%) scale(0.95)}}';
      document.head.appendChild(s);
    }
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 1000);
  }

  // ── Edge swipe for mobile client switching ─────────────────────

  function _initEdgeSwipe() {
    if (typeof document === 'undefined') return;
    var EDGE = 30;    // px from screen edge to trigger
    var MIN_DRAG = 80; // px minimum horizontal drag
    var _swipeState = null;

    document.addEventListener('pointerdown', function (e) {
      var x = e.clientX;
      var w = window.innerWidth;
      if (x < EDGE || x > w - EDGE) {
        _swipeState = { startX: x, startY: e.clientY, edge: x < EDGE ? 'left' : 'right' };
      }
    });

    document.addEventListener('pointermove', function (e) {
      if (!_swipeState) return;
      // Cancel if vertical movement is dominant (scroll)
      var dy = Math.abs(e.clientY - _swipeState.startY);
      var dx = Math.abs(e.clientX - _swipeState.startX);
      if (dy > dx * 1.5) { _swipeState = null; }
    });

    document.addEventListener('pointerup', function (e) {
      if (!_swipeState) return;
      var dx = e.clientX - _swipeState.startX;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(e.clientY - _swipeState.startY);

      if (absDx > MIN_DRAG && absDx > absDy * 1.5) {
        // Valid horizontal swipe from edge
        if (_swipeState.edge === 'left' && dx > 0) {
          // Left edge, swiped right → next client
          _switchClient(1);
        } else if (_swipeState.edge === 'right' && dx < 0) {
          // Right edge, swiped left → previous client
          _switchClient(-1);
        }
      }
      _swipeState = null;
    });

    console.log('§AD_UI edgeSwipe init edge=' + EDGE + 'px min=' + MIN_DRAG + 'px');
  }

  function _initKeyboard() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', function (e) {
      // Alt+S — toggle search overlay (works on any screen, even in inputs)
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        _toggleSearchOverlay();
        return;
      }

      // Don't capture if user is typing
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // Arrow keys on home screen → switch client
      if (_currentScreen === 'home') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          _switchClient(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          _switchClient(1);
        }
        return;
      }

    });
    console.log('§AD_UI keyboard init');
  }


  // ── BroadcastChannel §10 ──────────────────────────────────────────

  function _initBroadcast() {
    if (typeof BroadcastChannel === 'undefined') return;
    var ch = new BroadcastChannel('bim_erp');
    ch.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'ERP_ELEMENT_PICKED') {
        console.log('§AD_UI broadcast ERP_ELEMENT_PICKED guid=' + e.data.guid);
        // Could focus a record by GUID — future enhancement
      }
    });
    console.log('§AD_UI broadcast channel open');
  }

  // ── Helpers ───────────────────────────────────────────────────────


  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                     .replace(/"/g, '&quot;');
  }







  // ── Toast notification ────────────────────────────────────────────

  function _showToast(msg) {
    var toast = document.createElement('div');
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
      'background:#333;color:#ff9800;padding:10px 20px;border-radius:8px;font-size:13px;' +
      'z-index:100;border:1px solid #555;max-width:80%;text-align:center;';
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // ── Floating Search Overlay (Alt+S) ────────────────────────────────
  // Glass panel with orange-bordered inner search box.
  // Lives inside _graphContainer so it's visible during fullscreen.

  var _searchOverlay = null;
  var _searchInput = null;
  var _searchResultsEl = null;
  var _searchTimer = null;
  var _dragState = null;

  function _ensureSearchOverlay() {
    if (_searchOverlay) return;

    _searchOverlay = document.createElement('div');
    _searchOverlay.id = 'search-overlay';
    // Outer glass panel
    _searchOverlay.style.cssText = 'display:none;position:absolute;top:48px;right:12px;z-index:70;' +
      'width:340px;max-width:calc(100vw - 24px);padding:10px;' +
      'background:rgba(12,12,18,0.45);' +
      'border:1px solid rgba(255,255,255,0.08);border-radius:18px;' +
      'box-shadow:0 1px 0 rgba(255,255,255,0.05) inset,' +
      '0 20px 60px rgba(0,0,0,0.5);' +
      'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);';

    // Inner orange-bordered frame (glass gap = the 10px padding above)
    var inner = document.createElement('div');
    inner.style.cssText = 'border:1px solid rgba(232,167,53,0.5);border-radius:12px;' +
      'overflow:hidden;background:rgba(12,12,18,0.3);';

    // Drag handle — minimal, just a thin grip line
    var grip = document.createElement('div');
    grip.style.cssText = 'height:20px;cursor:grab;display:flex;align-items:center;' +
      'justify-content:center;user-select:none;';
    grip.innerHTML = '<div style="width:32px;height:3px;border-radius:2px;' +
      'background:rgba(255,255,255,0.12)"></div>';

    // Drag logic — uses absolute positioning within container
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      grip.style.cursor = 'grabbing';
      var rect = _searchOverlay.getBoundingClientRect();
      var parentRect = _searchOverlay.parentElement.getBoundingClientRect();
      _dragState = {
        startX: e.clientX, startY: e.clientY,
        origLeft: rect.left - parentRect.left,
        origTop: rect.top - parentRect.top
      };
      _searchOverlay.style.right = 'auto';
      _searchOverlay.style.left = _dragState.origLeft + 'px';
      _searchOverlay.style.top = _dragState.origTop + 'px';
    });
    document.addEventListener('pointermove', function (e) {
      if (!_dragState) return;
      var dx = e.clientX - _dragState.startX;
      var dy = e.clientY - _dragState.startY;
      _searchOverlay.style.left = (_dragState.origLeft + dx) + 'px';
      _searchOverlay.style.top = (_dragState.origTop + dy) + 'px';
    });
    document.addEventListener('pointerup', function () {
      if (_dragState) {
        _dragState = null;
        grip.style.cursor = 'grab';
      }
    });

    inner.appendChild(grip);

    // Search input — glass, no background, orange caret
    _searchInput = document.createElement('input');
    _searchInput.type = 'search';
    _searchInput.placeholder = 'Search\u2026';
    _searchInput.style.cssText = 'width:100%;padding:12px 14px;background:transparent;' +
      'color:#fff;border:none;font-size:17px;font-weight:500;outline:none;min-height:44px;' +
      'caret-color:#e8a735;letter-spacing:0.3px;' +
      'border-bottom:1px solid rgba(232,167,53,0.12);';
    inner.appendChild(_searchInput);

    // Results container
    _searchResultsEl = document.createElement('div');
    _searchResultsEl.style.cssText = 'max-height:240px;overflow-y:auto;';
    // Thin scrollbar
    _searchResultsEl.innerHTML = '<style>#search-overlay ::-webkit-scrollbar{width:3px}' +
      '#search-overlay ::-webkit-scrollbar-thumb{background:rgba(232,167,53,0.3);border-radius:2px}</style>';
    inner.appendChild(_searchResultsEl);

    _searchOverlay.appendChild(inner);

    // Input handler — FTS5 debounced
    _searchInput.addEventListener('input', function () {
      var q = this.value.trim();
      clearTimeout(_searchTimer);
      if (!q || q.length < 2) {
        _searchResultsEl.innerHTML = '';
        return;
      }
      _searchTimer = setTimeout(function () {
        _doFTSSearch(q, _searchResultsEl, _currentClient);
      }, 300);
    });

    // Keyboard nav
    _searchInput.addEventListener('keydown', function (e) {
      var items = _searchResultsEl.querySelectorAll('[data-search-hit]');
      if (e.key === 'Escape') {
        _toggleSearchOverlay();
        return;
      }
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _selectedIdx = Math.min(_selectedIdx + 1, items.length - 1);
        _highlightSearchItem(items, _selectedIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _selectedIdx = Math.max(_selectedIdx - 1, 0);
        _highlightSearchItem(items, _selectedIdx);
      } else if (e.key === 'Enter' && _selectedIdx >= 0 && _selectedIdx < items.length) {
        e.preventDefault();
        items[_selectedIdx].click();
      }
    });

    // Tap outside search → close it
    document.addEventListener('pointerdown', function (e) {
      if (!_searchOverlay || _searchOverlay.style.display === 'none') return;
      if (_searchOverlay.contains(e.target)) return;
      // Don't close if tapping the search button itself
      if (e.target.title === 'Search (Alt+S)') return;
      _searchOverlay.style.display = 'none';
      _glassChime(false);
      console.log('§AD_UI search dismiss tap-outside');
    });

    // Append to graph container if available (visible during fullscreen), else body
    var host = _graphContainer || document.body;
    host.appendChild(_searchOverlay);
    console.log('§AD_UI searchOverlay created host=' + (host === document.body ? 'body' : 'graphContainer'));
  }

  // Glass chime — synthesised with Web Audio API (no file needed)
  function _glassChime(opening) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(opening ? 1800 : 1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(opening ? 2800 : 800, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      setTimeout(function () { ctx.close(); }, 300);
    } catch (e) { /* no audio context — silent */ }
  }

  function _toggleSearchOverlay() {
    _ensureSearchOverlay();
    // Re-parent to graph container if it changed
    if (_graphContainer && _searchOverlay.parentElement !== _graphContainer) {
      _graphContainer.appendChild(_searchOverlay);
    }
    var visible = _searchOverlay.style.display !== 'none';
    if (visible) {
      _searchOverlay.style.display = 'none';
      _glassChime(false);
      console.log('§AD_UI search hide');
    } else {
      _searchOverlay.style.right = '12px';
      _searchOverlay.style.left = 'auto';
      _searchOverlay.style.top = '48px';
      _searchOverlay.style.display = 'block';
      _searchInput.value = '';
      _searchResultsEl.innerHTML = '';
      _searchInput.focus();
      _glassChime(true);
      console.log('§AD_UI search show');
    }
  }

  // ── FTS5 Smart Search (R1) ──────────────────────────────────────

  function _doFTSSearch(query, resultsEl, client) {
    if (typeof ERPSearch === 'undefined' || !ERPSearch.isIndexed()) {
      _hideSearchResults();
      return;
    }

    var hits = ERPSearch.search(query, 15, client);
    if (!hits.length) {
      resultsEl.innerHTML = '<div style="padding:16px;color:#666;font-size:13px;text-align:center">' +
        'No results for "' + _esc(query) + '"</div>';
      resultsEl.style.display = 'block';
      console.log('§AD_UI search query="' + query + '" hits=0');
      return;
    }

    // Single exact match → auto-jump to window
    if (hits.length === 1 && hits[0].window_id) {
      _hideSearchResults();
      console.log('§AD_UI search auto-jump window=' + hits[0].window_id +
                  ' record=' + hits[0].record_id);
      openWindow(Number(hits[0].window_id));
      return;
    }

    // Render results — white bold names, thin glass drawer, no borders
    var html = '';
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var dotColour = ERPSearch.statusColour(h.doc_status);
      var label = ERPSearch.tableLabel(h.table_name);
      html += '<div data-search-hit="1" data-window-id="' + (h.window_id || 0) +
        '" data-table="' + _esc(h.table_name) + '" data-record-id="' + h.record_id + '"' +
        ' style="padding:8px 14px;cursor:pointer;transition:background 0.12s;' +
        'display:flex;align-items:center;gap:8px">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:' + dotColour +
        ';flex-shrink:0"></span>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="color:#fff;font-weight:600;font-size:13px;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis">' +
        _esc(h.display_text) + '</div>' +
        '<div style="color:#666;font-size:10px;font-weight:400">' + _esc(label) +
        (h.doc_status ? ' \u00b7 ' + h.doc_status : '') +
        '</div></div></div>';
    }
    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
    _selectedIdx = -1;

    // Click handlers — §1.3 deep navigate then open card after globe animation
    var items = resultsEl.querySelectorAll('[data-search-hit]');
    var _hitFired = false;
    function _searchHitAction(el) {
      if (_hitFired) return; // guard double-fire (pointerup + click)
      _hitFired = true;
      setTimeout(function () { _hitFired = false; }, 300);
      var wid = Number(el.dataset.windowId);
      var table = el.dataset.table;
      var rid = el.dataset.recordId;
      _hideSearchResults();
      if (wid) {
        console.log('§AD_UI search activate window=' + wid + ' record=' + rid + ' table=' + table);
        openWindow(wid);
      }
    }
    for (var j = 0; j < items.length; j++) {
      // pointerup for mobile, click for keyboard Enter (.click() doesn't fire pointerup)
      items[j].addEventListener('pointerup', function () { _searchHitAction(this); });
      items[j].addEventListener('click', function () { _searchHitAction(this); });
      items[j].addEventListener('pointerenter', function () {
        this.style.background = 'rgba(255,255,255,0.06)';
        // §1.1 Hover correlation — pulse bubble on globe
        var table = this.dataset.table;
        var rid = this.dataset.recordId;
        if (table && typeof ADGraph !== 'undefined' && ADGraph.focusNode) {
          ADGraph.focusNode(table, rid ? Number(rid) : null);
        }
      });
      items[j].addEventListener('pointerleave', function () {
        this.style.background = 'none';
      });
    }

    console.log('§AD_UI search query="' + query + '" hits=' + hits.length);
  }

  function _hideSearchResults() {
    var el = document.getElementById('search-results');
    if (el) el.style.display = 'none';
    _selectedIdx = -1;
  }

  var _selectedIdx = -1;

  function _highlightSearchItem(items, idx) {
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = (i === idx) ? 'rgba(108,159,255,0.15)' : 'none';
    }
    if (items[idx]) {
      items[idx].scrollIntoView({ block: 'nearest' });
      // §1.1 Search↔Globe correlation — pulse bubble, auto-navigate if needed
      var table = items[idx].dataset.table;
      var rid = items[idx].dataset.recordId;
      if (table && typeof ADGraph !== 'undefined' && ADGraph.focusNode) {
        ADGraph.focusNode(table, rid ? Number(rid) : null);
      }
    }
  }

  // ── Init ──────────────────────────────────────────────────────────

  /**
   * Init AD UI renderer — instant shell mode (no DB required).
   * Renders menu from MENU_SEED immediately. Call hydrate(db) when DB is ready.
   * @param {Object|null} db         sql.js database (null for instant shell)
   * @param {Element}     contentEl  main content container
   * @param {Element}     navEl      bottom nav container
   * @param {Element}     breadcrumbEl  breadcrumb bar
   */
  function init(db, contentEl, navEl, breadcrumbEl) {
    _contentEl = contentEl;
    _navEl = navEl;
    _breadcrumbEl = breadcrumbEl;

    _initBroadcast();
    _initKeyboard();
    _initEdgeSwipe();

    if (db) {
      // Legacy full-init path (DB already available)
      _hydrate(db);
    } else {
      // §INSTANT shell — render from MENU_SEED, no DB
      showMenu();
      console.log('§AD_UI init INSTANT (no db, shell only)');
    }
  }

  /**
   * Hydrate with full database — called when WASM + DB are ready.
   * If user is still on home screen, silently refreshes with full data.
   */
  function _hydrate(db) {
    _db = db;
    _dbReady = true;
    ADParser.init(db);

    // Wire the compiled manifest (curated windows render from manifest, not DB).
    if (typeof window !== 'undefined' && window.AD_MANIFEST && ADParser.setManifest) {
      ADParser.setManifest(window.AD_MANIFEST);
    }

    // Upgrade graph with real DB — NO destroy/rebuild, just enable drill
    if (typeof ADGraph !== 'undefined' && ADGraph.graphHydrate) {
      ADGraph.graphHydrate(db);
    }

    // Build FTS5 search index — DEFERRED + chunked so it never freezes the globe.
    // §INSTANT — search isn't needed for the opening burst; index hydrates behind it,
    // one table per macrotask. (Was a single ~1s synchronous block; see W-INSTANT-FTS.)
    if (typeof ERPSearch !== 'undefined' && ERPSearch.buildIndexChunked) {
      var _kick = function () {
        ERPSearch.buildIndexChunked(db, function (idx) {
          console.log('§AD_UI fts5 indexed rows=' + idx.rows + ' ms=' + idx.ms + ' (deferred)');
        });
      };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(_kick, { timeout: 1500 });
      else setTimeout(_kick, 0);
    }

    // Build window sets silently — don't rebuild the globe (no flash)
    _buildWindowSets();

    console.log('§AD_UI hydrate done — db ready');
  }

  // ── Public API ─────────────────────────────────────────────────────

  // §19 Set client before showMenu (for URL param)
  function _setClient(client) {
    if (_clients.indexOf(client) >= 0 && client !== _currentClient) {
      _currentClient = client;
      console.log('§AD_UI setClient client=' + client);
    }
  }

  // §SHARE — capture the live context as the deep-link params erp.html restores on load. erp.html is the bubble
  // launcher only (§IDEMPIERE-ROUTE): no in-app window/record exists, so the context is client + 'home'; a
  // window/record link is forwarded to idempiere.html by erp.html's _restoreDeepLink, never held here.
  function _getContext() {
    return { client: _currentClient, screen: _currentScreen };
  }

  function _buildShareUrl() {
    var ctx = _getContext();
    var base = (typeof location !== 'undefined') ? (location.origin + location.pathname) : 'erp.html';
    var qs = [];
    if (ctx.client) qs.push('client=' + encodeURIComponent(ctx.client));
    if (ctx.window !== undefined && ctx.window !== null) qs.push('window=' + encodeURIComponent(ctx.window));
    if (ctx.record !== undefined && ctx.record !== null) qs.push('record=' + encodeURIComponent(ctx.record));
    var url = base + (qs.length ? '?' + qs.join('&') : '');
    console.log('§AD_UI buildShareUrl ' + url + ' (client=' + (ctx.client || '') +
      ' window=' + (ctx.window != null ? ctx.window : '-') + ' record=' + (ctx.record != null ? ctx.record : '-') + ')');
    return url;
  }

  var ADUI = {
    init:       init,
    hydrate:    _hydrate,
    showMenu:   showMenu,
    openWindow: openWindow,
    // §19 Deep-link helpers
    setClient:  _setClient,
    // §SHARE — capture/restore full context (docs/ERP_SHARE_SPEC.md)
    getContext: _getContext,
    buildShareUrl: _buildShareUrl
  };

  if (typeof window !== 'undefined') window.ADUI = ADUI;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADUI;

  console.log('§AD_UI_LOADED v10');
})();
