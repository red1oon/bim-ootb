/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// main.js — initViewer() orchestrator: creates APP, calls each module's setup, starts render loop
// DEV version — adds setupNlp (S211 voice command / NLP query)
console.log('§MAIN_JS v23 loaded — S277b WebGL-only + cinematic effects');
async function initViewer() {
  const APP = window.APP = {};

  // §S276: setupScene is async (WebGPURenderer.init), run first
  if (typeof setupConfig === 'function') setupConfig(APP);
  if (typeof setupScene === 'function') await setupScene(APP);
  var _mods = [setupHelpers, setupStreaming, setupPanels, setupTools,
    setupPicking, setupTour, setupMeasure, setupSitecam, setupShare, setupIssues, setupExcel, setupWalk, setupCity];
  _mods.forEach(function(fn) { if (typeof fn === 'function') fn(APP); });
  if (typeof setupDLOD === 'function') setupDLOD(APP);
  if (typeof setupNlp === 'function') setupNlp(APP);
  if (typeof setupGhostGlass === 'function') setupGhostGlass(APP);
  // navigate.js lazy-loaded on demand (78KB saved on first paint)
  APP._navigateLoaded = false;
  APP.loadNavigate = function() {
    if (APP._navigatePromise) return APP._navigatePromise;
    APP._navigatePromise = new Promise(function(resolve, reject) {
      if (typeof setupNavigate === 'function') {
        // All sub-modules already cached — wire immediately
        setupNavigate(APP);
        APP._navigateLoaded = true;
        resolve();
        return;
      }
      // Load sub-modules in dependency order, then the bootstrap
      var modules = [
        'navigate_find.js?v=9',
        'navigate_grid.js?v=1',
        'navigate_path.js?v=1',
        'navigate_engine.js?v=1',
        'navigate_controls.js?v=1',
        'navigate.js?v=10'
      ];
      function loadNext(i) {
        if (i >= modules.length) {
          if (typeof setupNavigate === 'function') setupNavigate(APP);
          APP._navigateLoaded = true;
          console.log('[S239] §NAVIGATE_LAZY_LOADED');
          resolve();
          return;
        }
        var s = document.createElement('script');
        s.src = modules[i];
        s.onload = function() { loadNext(i + 1); };
        s.onerror = function() { reject(new Error('Failed to load ' + modules[i])); };
        document.head.appendChild(s);
      }
      loadNext(0);
    });
    return APP._navigatePromise;
  };
  // Proxy so nlp.js "typeof A.openFindPanel === 'function'" finds it immediately.
  // setupNavigate() overwrites APP.openFindPanel with the real implementation.
  var _navProxy = function(searchTerm) {
    console.log('[S275] §FIND_PROXY loading navigate modules…');
    if (APP.status) APP.status.textContent = 'Loading Find…';
    APP.loadNavigate().then(function() {
      // After load, APP.openFindPanel is the real function (set by setupNavigate)
      if (APP.openFindPanel !== _navProxy) APP.openFindPanel(searchTerm);
      else console.warn('[S275] §FIND_PROXY_FAIL openFindPanel still proxy after load');
    }).catch(function(e) {
      console.warn('[S275] §FIND_PROXY_ERR', e);
      if (APP.status) APP.status.textContent = 'Find failed to load';
    });
  };
  APP.openFindPanel = _navProxy;
  // wizard.js lazy-loaded on demand (70KB saved on first paint)
  APP._wizardLoaded = false;
  APP.loadWizard = function() {
    if (APP._wizardPromise) return APP._wizardPromise;
    APP._wizardPromise = new Promise(function(resolve, reject) {
      if (typeof startWizard === 'function') {
        APP._wizardLoaded = true;
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = 'wizard.js?v=2';
      s.onload = function() {
        APP._wizardLoaded = true;
        console.log('[S239] §WIZARD_LAZY_LOADED');
        resolve();
      };
      s.onerror = function() { reject(new Error('Failed to load wizard.js')); };
      document.head.appendChild(s);
    });
    return APP._wizardPromise;
  };
  if (typeof GridAssembler !== 'undefined') GridAssembler.init(APP);
  else if (typeof setupGridOverlay === 'function') setupGridOverlay(APP);
  if (typeof setupImport === 'function') setupImport(APP);
  if (typeof setupDiff === 'function') setupDiff(APP);

  // Expose functions to HTML onclick handlers
  window.togglePanel = APP.togglePanel;
  window.clearStreamed = APP.clearStreamed;
  window.toggleXray = APP.toggleXray;
  window.screenshot = APP.screenshot;
  window.toggleFullscreen = APP.toggleFullscreen;
  window.toggleTheme = APP.toggleTheme;
  window.toggleFlyAround = APP.toggleFlyAround;
  window.filterStorey = APP.filterStorey;
  window.toggleDisc = APP.toggleDisc;
  window.export4D5D = APP.export4D5D;
  window.flyTo = APP.flyTo;
  window.openSiteCamera = APP.openSiteCamera;
  window.closeSiteCamera = APP.closeSiteCamera;
  window.snapSitePhoto = APP.snapSitePhoto;
  window.closeSitePreview = APP.closeSitePreview;
  // S246: If clash snag pending, use clash-specific share/save flow
  window.shareSitePhoto = function() { return APP._pendingClashSnag ? APP._shareClashSnag() : APP.shareSitePhoto(); };
  window.downloadSitePhoto = function() { return APP._pendingClashSnag ? APP._downloadClashSnag() : APP.downloadSitePhoto(); };
  window.setMarkupTool = APP.setMarkupTool;
  window.setMarkupColor = APP.setMarkupColor;
  window.undoMarkup = APP.undoMarkup;
  window.toggleMeasure = APP.toggleMeasure;
  window.clearMeasures = APP.clearMeasures;
  window.toggleSection = APP.toggleSection;
  window.setSectionAxis = APP.setSectionAxis;
  window.updateSectionPlane = APP.updateSectionPlane;
  window.toggleSunglass = APP.toggleSunglass;
  window.closeSunglass = APP.closeSunglass;
  window.updateAmbience = APP.updateAmbience;
  window.updateLighting = APP.updateLighting;
  window.toggleNightMode = APP.toggleNightMode;
  window.toggleShadow = APP.toggleShadow;
  window.toggleBackground = APP.toggleBackground;
  window.toggleIssues = APP.toggleIssues;
  window.exportIssuesExcel = APP.exportIssuesExcel;
  window.clearAllIssues = APP.clearAllIssues;
  window._issueBackToList = APP._issueBackToList;
  window.toggleWalkMode = APP.toggleWalkMode;
  window.setWalkAnchor = APP.setWalkAnchor;
  window.cancelWalkAnchor = APP.cancelWalkAnchor;
  window.cycleWalkSpeed = APP.cycleWalkSpeed;
  if (APP.toggleNlp) window.toggleNlp = APP.toggleNlp;
  window.toggleVariance = function() { if (APP.toggleVariance) APP.toggleVariance(); };
  // 2D button: toggle grid overlay in same scene (no new tab)
  window._isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  window.open2DPlans = function() {
    if (window._isMobile) { APP.status.textContent = '2D views are desktop-only'; console.log('§2D_GATE skip — mobile'); return; }
    // Block if Measure is active
    if (APP.measureActive) {
      APP.status.textContent = 'Close Measure first';
      return;
    }
    if (typeof APP.toggleGridOverlay === 'function') {
      APP.toggleGridOverlay();
    } else {
      console.warn('§2D_OPEN grid_overlay.js not loaded — falling back to 2d.html');
      const p = new URLSearchParams(location.search);
      const db = p.get('db') || '';
      const lib = p.get('lib') || '';
      const bld = APP.activeBuilding || '';
      window.open('2d.html?db=' + encodeURIComponent(db) + '&lib=' + encodeURIComponent(lib) + '&bld=' + encodeURIComponent(bld), '_blank');
    }
  };

  // S240: BroadcastChannel listener — 4D Gantt→Viewer highlight sync
  var _4dHighlights = [];
  try {
    var _bim4d = new BroadcastChannel('bim_4d');
    _bim4d.onmessage = function(evt) {
      var msg = evt.data;
      if (!msg || !msg.type) return;

      // Ping/pong for connectivity check
      if (msg.type === '4D_PING') {
        _bim4d.postMessage({ type: '4D_PONG', from: 'viewer', ts: Date.now() });
        console.log('§4D_RECV type=4D_PING → sent PONG');
        return;
      }
      // Resource messages — no highlight reset needed
      if (msg.type === '4D_RESOURCES' || msg.type === '4D_RESOURCES_HIDE') {
        // handled below, skip highlight reset
      } else {
        // Reset previous highlights (only for 4D scene messages)
        _4dHighlights.forEach(function(obj) {
          if (obj.material && obj._4dOrigEmissive !== undefined) {
            obj.material.emissive.setHex(obj._4dOrigEmissive);
            delete obj._4dOrigEmissive;
            delete obj._4dColor;
          }
        });
        _4dHighlights = [];
      }

      if (msg.type === '4D_RESET') {
        if (APP._ghostGlass) APP._ghostGlass.reset();
        console.log('§4D_RECV type=4D_RESET');
        APP.markDirty();
        return;
      }

      // S240b: Ghost glass animation messages — delegate to ghostglass.js
      if (msg.type === '4D_PLAY') {
        console.log('§4D_RECV type=4D_PLAY tasks=' + (msg.tasks||[]).length + ' ghostGlass=' + !!APP._ghostGlass);
        if (APP._ghostGlass) APP._ghostGlass.play(msg.tasks || [], msg.speed || 1.0);
        else console.warn('§4D_RECV ghostglass NOT READY — setupGhostGlass not called');
        return;
      }
      if (msg.type === '4D_PAUSE' && APP._ghostGlass) {
        APP._ghostGlass.pause();
        return;
      }
      if (msg.type === '4D_RESUME' && APP._ghostGlass) {
        APP._ghostGlass.resume(msg.speed);
        return;
      }
      if (msg.type === '4D_SEEK') {
        if (APP._ghostGlass) APP._ghostGlass.seek(msg.taskIndex);
        console.log('§4D_RECV type=4D_SEEK task=' + msg.taskIndex + ' ghostGlass=' + !!APP._ghostGlass);
        return;
      }

      // S253: QTO data relay — boq_charts asks viewer to run queries on its already-loaded DB
      if (msg.type === '4D_QTO_REQUEST') {
        if (!APP.db || !APP.activeBuilding) {
          _bim4d.postMessage({ type: '4D_QTO_RESPONSE', error: 'no_db' });
          return;
        }
        var bld = APP.activeBuilding.replace(/'/g, "''");
        try {
          var countRows = APP.db.exec(
            "SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) as cnt, COUNT(DISTINCT i.geometry_hash) as meshes " +
            "FROM elements_meta m LEFT JOIN element_instances i ON m.guid = i.guid " +
            "WHERE m.building = '" + bld + "' GROUP BY m.discipline, m.ifc_class, m.storey " +
            "ORDER BY m.discipline, m.storey, cnt DESC"
          );
          var dimRows = APP.db.exec(
            "SELECT m.discipline, m.ifc_class, m.storey, " +
            "SUM(MAX(t.bbox_x, t.bbox_y, t.bbox_z)) as total_length, " +
            "SUM(MAX(t.bbox_x, t.bbox_y, t.bbox_z) * " +
            "CASE WHEN t.bbox_x >= t.bbox_y AND t.bbox_x >= t.bbox_z THEN MAX(t.bbox_y, t.bbox_z) " +
            "WHEN t.bbox_y >= t.bbox_x AND t.bbox_y >= t.bbox_z THEN MAX(t.bbox_x, t.bbox_z) " +
            "ELSE MAX(t.bbox_x, t.bbox_y) END) as total_area " +
            "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
            "WHERE m.building = '" + bld + "' AND t.bbox_x IS NOT NULL AND t.bbox_x > 0 " +
            "GROUP BY m.discipline, m.ifc_class, m.storey"
          );
          // S253d: Also relay per-element GUIDs for ghostglass GUID resolution
          var guidRows = APP.db.exec(
            "SELECT guid, ifc_class, storey FROM elements_meta WHERE building = '" + bld + "'"
          );
          _bim4d.postMessage({
            type: '4D_QTO_RESPONSE',
            building: APP.activeBuilding,
            countRows: countRows.length ? countRows[0].values : [],
            dimRows: dimRows.length ? dimRows[0].values : [],
            guidRows: guidRows.length ? guidRows[0].values : []
          });
          console.log('§4D_QTO_RELAY sent count=' + (countRows.length ? countRows[0].values.length : 0) +
            ' dims=' + (dimRows.length ? dimRows[0].values.length : 0) +
            ' guids=' + (guidRows.length ? guidRows[0].values.length : 0));
        } catch (e) {
          _bim4d.postMessage({ type: '4D_QTO_RESPONSE', error: e.message });
          console.log('§4D_QTO_RELAY error: ' + e.message);
        }
        return;
      }

      // S253d: Schedule relay — boq_charts asks for kernel_ops so Gantt uses same schedule as hourglass
      if (msg.type === '4D_SCHEDULE_REQUEST') {
        if (!APP.db) {
          _bim4d.postMessage({ type: '4D_SCHEDULE_RESPONSE', error: 'no_db' });
          return;
        }
        try {
          var opsResult = APP.db.exec(
            'SELECT timestamp, op_type, parameters, output_guid ' +
            'FROM kernel_ops WHERE undone = 0 ORDER BY timestamp'
          );
          var ops = [];
          if (opsResult.length && opsResult[0].values.length) {
            ops = opsResult[0].values.map(function(row) {
              var p = row[2] ? JSON.parse(row[2]) : {};
              return {
                start_ts: row[0], op_type: row[1], guid: row[3],
                phase: p.phase || '', cls: p.cls || '', name: p.name || '',
                storey: p.storey || '', resource: p.resource || '',
                end_ts: p._end_ts || (row[0] + 60000)
              };
            });
          }
          _bim4d.postMessage({ type: '4D_SCHEDULE_RESPONSE', ops: ops });
          console.log('§4D_SCHEDULE_RELAY sent ops=' + ops.length);
        } catch (e) {
          _bim4d.postMessage({ type: '4D_SCHEDULE_RESPONSE', error: e.message });
          console.log('§4D_SCHEDULE_RELAY error: ' + e.message);
        }
        return;
      }

      if (msg.type === '4D_HIGHLIGHT') {
        // Single task highlight — all GUIDs in one phase color
        var guidSet = new Set(msg.guids || []);
        var color = parseInt((msg.color || '#888888').replace('#',''), 16);
        APP.collectMeshes(function(o) { return o.isMesh; }).forEach(function(obj) {
          var g = APP.guidMap[obj.id] || obj.userData.guid;
          if (g && guidSet.has(g)) {
            obj._4dOrigEmissive = obj.material.emissive.getHex();
            obj._4dColor = color;
            obj.material.emissive.setHex(color);
            _4dHighlights.push(obj);
          }
        });
        console.log('§4D_RECV type=4D_HIGHLIGHT task="' + msg.taskName + '" meshes=' + _4dHighlights.length + '/' + guidSet.size + ' color=' + msg.color);
        APP.markDirty();
      }

      // S240c §P5: Resource legend panel — rendered in viewer, data from charts
      if (msg.type === '4D_RESOURCES') {
        var panel = document.getElementById('res-legend');
        if (!panel) {
          panel = document.createElement('div');
          panel.id = 'res-legend';
          panel.style.cssText = 'position:fixed;bottom:60px;right:20px;min-width:280px;max-width:360px;' +
            'background:rgba(20,25,35,0.55);color:#eee;border-radius:16px;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.35),0 2px 8px rgba(0,0,0,0.2);' +
            'padding:0;font-family:system-ui,-apple-system,sans-serif;font-size:13px;' +
            'z-index:9999;cursor:grab;user-select:none;' +
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
            'border:1px solid rgba(255,255,255,0.08);overflow:hidden;';
          // Title bar
          // Status banner
          var statusBar = document.createElement('div');
          statusBar.id = 'res-status';
          statusBar.style.cssText = 'padding:10px 16px;text-align:center;font-weight:900;font-size:16px;letter-spacing:1.5px;text-transform:uppercase;';
          panel.appendChild(statusBar);
          // Donut charts — progress + cost
          var donutRow = document.createElement('div');
          donutRow.id = 'res-donuts';
          donutRow.style.cssText = 'display:flex;justify-content:center;gap:20px;padding:12px 16px 8px;border-bottom:1px solid rgba(255,255,255,0.06);';
          donutRow.innerHTML =
            '<div style="text-align:center;">' +
            '<div id="donut-progress" style="width:90px;height:90px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"></div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:0.5px;">Time</div></div>' +
            '<div style="text-align:center;">' +
            '<div id="donut-cost" style="width:90px;height:90px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 4px;"></div>' +
            '<div style="font-size:10px;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:0.5px;">Progress</div></div>';
          panel.appendChild(donutRow);
          // Title bar
          var titleBar = document.createElement('div');
          titleBar.style.cssText = 'padding:8px 16px 8px;border-bottom:1px solid rgba(255,255,255,0.1);';
          titleBar.innerHTML = '<div style="font-weight:700;font-size:13px;color:rgba(255,255,255,0.6);letter-spacing:0.5px;">' +
            '\ud83d\udea7 Site Resources</div>';
          panel.appendChild(titleBar);
          // Body
          var body = document.createElement('div');
          body.id = 'res-body';
          body.style.cssText = 'padding:8px 16px;';
          panel.appendChild(body);
          // Footer
          var footer = document.createElement('div');
          footer.id = 'res-footer';
          footer.style.cssText = 'padding:8px 16px 10px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:rgba(255,255,255,0.5);';
          panel.appendChild(footer);
          // Grand total bar
          var grandBar = document.createElement('div');
          grandBar.id = 'res-grand';
          grandBar.style.cssText = 'padding:10px 16px;background:rgba(0,0,0,0.2);' +
            'border-top:1px solid rgba(255,255,255,0.06);text-align:center;';
          panel.appendChild(grandBar);
          document.body.appendChild(panel);
          // Draggable
          var _rdX=0,_rdY=0,_rDrag=false;
          panel.addEventListener('pointerdown', function(e) {
            _rDrag=true; _rdX=e.clientX-panel.offsetLeft; _rdY=e.clientY-panel.offsetTop;
            panel.style.cursor='grabbing'; e.preventDefault();
          });
          document.addEventListener('pointermove', function(e) {
            if(!_rDrag)return;
            panel.style.left=(e.clientX-_rdX)+'px';
            panel.style.top=(e.clientY-_rdY)+'px';
            panel.style.right='auto'; panel.style.bottom='auto';
          });
          document.addEventListener('pointerup', function() { _rDrag=false; panel.style.cursor='grab'; });
        }
        // Render trades with bars
        var body = document.getElementById('res-body');
        var maxCrew = msg.maxCrew || 1;
        var html = '';
        var trades = msg.trades || [];
        for (var ti = 0; ti < trades.length; ti++) {
          var tr = trades[ti];
          var barPct = maxCrew > 0 ? Math.round((tr.crew / maxCrew) * 100) : 0;
          var opacity = '1';
          html += '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;opacity:' + opacity + ';">' +
            '<span style="font-size:18px;width:26px;text-align:center;flex-shrink:0;">' + tr.icon + '</span>' +
            '<span style="width:80px;font-size:11px;color:' + tr.color + ';font-weight:600;flex-shrink:0;">' + tr.label + '</span>' +
            '<div style="flex:1;height:20px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;position:relative;">' +
            '<div style="height:100%;width:' + barPct + '%;background:' + tr.color + ';border-radius:4px;transition:width 0.3s;"></div>' +
            '</div>' +
            '<span style="width:36px;text-align:right;font-size:16px;font-weight:800;color:' + tr.color + ';flex-shrink:0;">' +
            tr.crew + '</span></div>';
        }
        // Equipment
        var machines = msg.machines || [];
        if (machines.length) {
          html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.05);">';
          for (var mi = 0; mi < machines.length; mi++) {
            html += '<div style="display:flex;align-items:center;gap:6px;padding:1px 0;color:rgba(255,255,255,0.5);">' +
              '<span style="font-size:14px;width:26px;text-align:center;">\ud83d\ude9c</span>' +
              '<span style="font-size:11px;">' + machines[mi] + '</span></div>';
          }
          html += '</div>';
        }
        body.innerHTML = html;
        // Footer
        document.getElementById('res-footer').innerHTML =
          '<strong style="color:rgba(255,255,255,0.8);">' + msg.totalCrew + '</strong> workers \u00b7 ' +
          '<strong style="color:rgba(255,255,255,0.8);">' + machines.length + '</strong> machines \u00b7 Day ' + msg.day + '/' + msg.maxDay +
          ' \u00b7 ' + msg.pct + '% complete';
        // Project status banner — mock: first third=ahead, middle=delays, last=on time
        var statusEl = document.getElementById('res-status');
        if (statusEl) {
          var dayRatio = msg.maxDay > 0 ? msg.day / msg.maxDay : 0;
          var statusText, statusBg, statusColor;
          if (dayRatio < 0.33) {
            statusText = '\u25b2 AHEAD OF TIME'; statusBg = 'rgba(76,175,80,0.2)'; statusColor = '#66bb6a';
          } else if (dayRatio < 0.66) {
            statusText = '\u25bc DELAYS'; statusBg = 'rgba(244,67,54,0.2)'; statusColor = '#ef5350';
          } else {
            statusText = '\u25c6 ON TIME'; statusBg = 'rgba(66,165,245,0.2)'; statusColor = '#42a5f5';
          }
          statusEl.style.background = statusBg;
          statusEl.style.color = statusColor;
          statusEl.textContent = statusText;
        }
        // Donut charts — Time Elapsed vs Physical Progress
        var timePct = msg.maxDay > 0 ? Math.round(msg.day / msg.maxDay * 100) : 0;
        timePct = Math.min(timePct, 100);
        var progPct = msg.progressPct || 0;
        var cur = msg.cur || 'RM';
        var gt = msg.grandTotal || 0;
        var costToDate = Math.round(gt * progPct / 100);
        // Left: Time elapsed (blue)
        var dp = document.getElementById('donut-progress');
        if (dp) {
          dp.style.background = 'conic-gradient(#42a5f5 0% ' + timePct + '%, rgba(255,255,255,0.08) ' + timePct + '% 100%)';
          dp.innerHTML = '<div style="width:62px;height:62px;border-radius:50%;background:rgba(20,25,35,0.85);display:flex;align-items:center;justify-content:center;' +
            'font-size:18px;font-weight:900;color:#42a5f5;">' + timePct + '%</div>';
        }
        // Right: Physical progress (green)
        var dc = document.getElementById('donut-cost');
        if (dc) {
          dc.style.background = 'conic-gradient(#66bb6a 0% ' + progPct + '%, rgba(255,255,255,0.08) ' + progPct + '% 100%)';
          dc.innerHTML = '<div style="width:62px;height:62px;border-radius:50%;background:rgba(20,25,35,0.85);display:flex;align-items:center;justify-content:center;' +
            'font-size:18px;font-weight:900;color:#66bb6a;">' + progPct + '%</div>';
        }
        // Grand total footer
        var grand = document.getElementById('res-grand');
        grand.innerHTML = '<span style="color:rgba(255,255,255,0.4);">' + cur + ' ' + costToDate.toLocaleString() + ' / ' + cur + ' ' + gt.toLocaleString() + '</span>';
        panel.style.display = '';
        return;
      }
      if (msg.type === '4D_RESOURCES_HIDE') {
        var p = document.getElementById('res-legend');
        if (p) p.style.display = 'none';
        return;
      }

      if (msg.type === '4D_HIGHLIGHT_ALL') {
        // All phases — each GUID gets its phase color
        var phases = msg.phases || {};
        var guidToColor = {};
        for (var phase in phases) {
          var c = parseInt((phases[phase].color || '#888').replace('#',''), 16);
          (phases[phase].guids || []).forEach(function(g) { guidToColor[g] = c; });
        }
        APP.collectMeshes(function(o) { return o.isMesh; }).forEach(function(obj) {
          var g = APP.guidMap[obj.id] || obj.userData.guid;
          if (g && guidToColor[g] !== undefined) {
            obj._4dOrigEmissive = obj.material.emissive.getHex();
            obj._4dColor = guidToColor[g];
            obj.material.emissive.setHex(guidToColor[g]);
            _4dHighlights.push(obj);
          }
        });
        console.log('§4D_RECV type=4D_HIGHLIGHT_ALL meshes=' + _4dHighlights.length + ' phases=' + Object.keys(phases).length);
        APP.markDirty();
      }
    };
    console.log('§4D_CHANNEL_READY listener=viewer');
  } catch(e) {
    console.log('§4D_CHANNEL_FAIL ' + e.message);
  }

  // Render loop — on-demand: only render when camera moves or streaming is active
  let _needsRender = true;
  APP.controls.addEventListener('change', () => { _needsRender = true; });
  APP.markDirty = () => { _needsRender = true; };

  // §S260b: Reduce pixel ratio during orbit for smoother interaction on heavy scenes
  var _fullDPR = Math.min(window.devicePixelRatio || 1, 2);
  var _orbitDPR = window._isMobile ? 0.75 : Math.min(_fullDPR, 1);  // §S274: mobile=0.75x during drag
  var _orbiting = false;
  APP.controls.addEventListener('start', function() {
    if (!_orbiting && APP.streamedCount > 5000) {
      _orbiting = true;
      APP.renderer.setPixelRatio(_orbitDPR);
    }
  });
  APP.controls.addEventListener('end', function() {
    if (_orbiting) {
      _orbiting = false;
      APP.renderer.setPixelRatio(_fullDPR);
      _needsRender = true;
    }
  });

  // §S271: Pause rAF when tab backgrounded — saves battery, avoids WebGL context kill
  var _tabVisible = true;
  document.addEventListener('visibilitychange', function() {
    _tabVisible = !document.hidden;
    if (_tabVisible) { _needsRender = true; _rafId = requestAnimationFrame(animate); }
    else if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    console.log('§TAB_VISIBILITY visible=' + _tabVisible);
  });

  var _rafId;
  // §S276: WebGPURenderer compiles shader pipelines per material. On 122K scenes with 100+
  // materials, synchronous compilation during render() times out the main thread.
  // Fix: after streaming adds all materials, call compileAsync() to pre-warm pipelines
  // asynchronously, then allow render. During streaming bbox phase, rendering is fine
  // (only 8 simple MeshBasicMaterial pipelines).
  var _pipelinesCompiling = false;
  APP._onStreamDone = function() {
    if (!APP._isWebGPU || !APP.renderer.compileAsync) return;
    _pipelinesCompiling = true;
    if (APP.status) APP.status.textContent = 'Compiling GPU shaders — please wait...';
    console.log('§S276_COMPILE_ASYNC starting pipeline pre-compilation...');
    var t0 = performance.now();
    APP.renderer.compileAsync(APP.scene, APP.camera).then(function() {
      var ms = (performance.now() - t0).toFixed(0);
      _pipelinesCompiling = false;
      // §S276: Now safe to clear bboxes — real geometry pipelines are warm
      if (APP._clearBboxPlaceholders) {
        APP._clearBboxPlaceholders();
        console.log('§S276_BBOX_CLEAR bboxes removed after pipeline compilation');
      }
      _needsRender = true;
      if (APP.status) APP.status.textContent = 'GPU shaders compiled in ' + ms + 'ms — rendering';
      console.log('§S276_COMPILE_ASYNC done ms=' + ms);
    });
  };
  function animate() {
    _rafId = requestAnimationFrame(animate);
    if (!APP.walkModeActive) {
      APP.controls.update();
      if (APP.walkMode) { APP.walkTick(); } else { APP.flyTick(); }
    }
    APP.streamTick();
    // §6.8 Ray-blast DLOD — visibility culling for large buildings
    if (APP.dlodTick) APP.dlodTick();
    // S245e: Clash DLOD proximity LOD update (throttled internally to 100ms)
    if (APP._clashModeActive && APP._updateClashLOD) APP._updateClashLOD();
    APP.walkModeGpsTick();
    // Device orientation LAST — nothing may overwrite the quaternion after this
    if (APP.walkModeActive) APP.walkOrientTick();
    APP.updateMeasureLabels();
    if (APP.ground && APP.ground.visible) {
      APP.ground.material.visible = APP.camera.position.y > APP.ground.position.y;
    }
    // §S277b: WebGL only — no pipeline compilation gate needed
    if (_pipelinesCompiling) return;
    if (window._isMobile) {
      // §S276b: Throttle continuous streaming renders — every 10th frame only.
      // But always honor explicit _needsRender (bbox chunks, user interaction).
      if (APP.streaming && !_needsRender && !_orbiting) {
        if (!APP._mobileRenderSkip) APP._mobileRenderSkip = 0;
        if (++APP._mobileRenderSkip < 10) return;
        APP._mobileRenderSkip = 0;
      }
      if (_needsRender || APP.streaming || APP.walkModeActive || _orbiting) {
        // §S278: Mobile — ALWAYS direct render, never EffectComposer (SSAO/Outline too expensive)
        APP.renderer.render(APP.scene, APP.camera);
        _needsRender = false;
      }
    } else {
      if (APP._composer && APP._composerEnabled) APP._composer.render();
      else APP.renderer.render(APP.scene, APP.camera);
    }
  }

  // Go
  animate();
  APP.init().then(async function() {
    // S223: Load diff DB if ?diffdb= param present (variation comparison)
    const diffDbUrl = new URLSearchParams(location.search).get('diffdb');
    console.log('[S223] §DIFF_PARAM diffdb=' + (diffDbUrl || 'none') + ' db_ready=' + !!APP.db + ' computeDiff=' + (typeof APP.computeDiff));
    if (diffDbUrl && APP.db && typeof APP.computeDiff === 'function') {
      try {
        console.log('[S223] §DIFF_FETCH_START url=' + diffDbUrl);
        const buf = await APP.cachedFetch(diffDbUrl);
        console.log('[S223] §DIFF_FETCH_DONE bytes=' + buf.byteLength);
        // Reuse SQL instance from A.init() — avoids re-downloading WASM
        var SQL = APP._SQL || await initSqlJs({ locateFile: f => 'lib/' + f });
        APP.diffDb = new SQL.Database(new Uint8Array(buf));
        // §S260c: Validate diff DB has elements_meta
        try {
          var diffCheck = APP.diffDb.exec("SELECT COUNT(*) FROM elements_meta");
          var diffCount = (diffCheck.length && diffCheck[0].values.length) ? diffCheck[0].values[0][0] : 0;
          console.log('[S223] §DIFF_DB_LOADED url=' + diffDbUrl + ' elements=' + diffCount);
        } catch(ve) {
          console.log('[S223] §DIFF_DB_INVALID url=' + diffDbUrl + ' err=' + ve.message);
        }
        APP.computeDiff();
        // Delay overlay until meshes are streamed (check every 2s, up to 30s)
        var checks = 0;
        var diffTimer = setInterval(function() {
          checks++;
          var meshCount = 0;
          APP.scene.traverse(function(o) { if (o.isMesh && o.userData.guid) meshCount++; });
          console.log('[S225] §DIFF_OVERLAY_WAIT check=' + checks + ' meshes=' + meshCount);
          if (meshCount > 10 || checks > 15) {
            clearInterval(diffTimer);
            APP.applyDiffOverlay();
            // S225: Don't auto-popup — show Variance button in HUD, user clicks to see list
            var vBtn = document.getElementById('variance-btn');
            if (vBtn) { vBtn.style.display = 'block'; vBtn.textContent = '\u0394 ' + (typeof _TRL!=='undefined'&&_TRL.ui_variance||'Variance') + ' (' + (APP.diffResult.added.length + APP.diffResult.removed.length + APP.diffResult.changed.length) + ')'; }
            console.log('[S225] §DIFF_OVERLAY_READY meshes=' + meshCount);
          }
        }, 2000);
      } catch(e) {
        console.log('[S223] §DIFF_DB_ERROR ' + e.message);
      }
    }

    // S230: Auto-start wizard if ?wizard=1 param present
    var wizP = new URLSearchParams(location.search);
    var wizardFlag = wizP.get('wizard');
    var wizardKey = wizP.get('wizardKey');
    var wizDbUrl = wizP.get('db');
    if (wizardFlag === '1' && wizDbUrl) {
      console.log('[S230] §WIZARD_VIEWER_START key=' + wizardKey + ' db=' + wizDbUrl);
      try {
        await APP.loadWizard();
        // Fetch DB buffer from cache (IndexedDB)
        var wizBuf = await APP.cachedFetch(wizDbUrl);
        if (wizBuf) {
          startWizard(wizardKey || wizDbUrl, wizBuf, {}, null);
        } else {
          console.warn('[S230] §WIZARD_NO_DB url=' + wizDbUrl);
        }
      } catch(wizErr) {
        console.warn('[S230] §WIZARD_START_ERR ' + wizErr.message);
      }
    }

    // S246: Deep-link clash auto-fly — #clash=guidA~guidB&cam=x,y,z&tgt=tx,ty,tz&tol=mm
    const hashParams = {};
    location.hash.slice(1).split('&').forEach(function(p) { const kv = p.split('='); if (kv[0]) hashParams[kv[0]] = decodeURIComponent(kv[1] || ''); });
    console.log('§HASH_PARSE keys=' + Object.keys(hashParams).join(',') + ' clash=' + (hashParams.clash || 'none') + ' db=' + !!APP.db);
    const clashParam = hashParams.clash;
    if (clashParam && APP.db) {
      const [guidA, guidB] = clashParam.split('~');
      if (guidA && guidB) {
        let clashChecks = 0;
        const clashTimer = setInterval(function() {
          clashChecks++;
          if (APP.streamedCount > 10 || clashChecks > 20) {
            clearInterval(clashTimer);
            try {
            // Query element metadata to build a clash entry for _flyToClash
            const metaRows = APP.dbQuery(
              "SELECT m.guid, m.ifc_class, m.discipline, m.element_name FROM elements_meta m WHERE m.guid IN (?, ?)",
              [guidA, guidB]
            );
            var mA = metaRows.find(function(r) { return r[0] === guidA; }) || [guidA, '?', '?', '?'];
            var mB = metaRows.find(function(r) { return r[0] === guidB; }) || [guidB, '?', '?', '?'];
            // Build clash array: [guidA, guidB, clsA, clsB, discA, discB, nameA, nameB, overlap]
            var clashEntry = [guidA, guidB, mA[1], mB[1], mA[2], mB[2], mA[3], mB[3], 0];
            // Load clash rules for _flyToClash
            APP._loadClashRules(function(rules) {
              APP._currentClashRules = rules;
              APP._currentClashes = [clashEntry];
              APP._clashHighlights = [];
              APP.measureActive = true;
              // Set exact saved cam position BEFORE fly — so _flyToClash flies TO the saved view
              const camStr = hashParams.cam;
              const tgtStr = hashParams.tgt;
              if (camStr && tgtStr) {
                const cam = camStr.split(',').map(Number);
                const tgt = tgtStr.split(',').map(Number);
                if (cam.length === 3 && tgt.length === 3) {
                  APP._deepLinkCamOverride = { pos: cam, tgt: tgt };
                }
              }
              APP._flyToClash(0);
              const storeyParam = hashParams.st || '';
              const tolMm = hashParams.tol || '25';
              APP.status.textContent = 'Clash: ' + (mA[3] || guidA).substring(0, 20) + ' \u2194 ' + (mB[3] || guidB).substring(0, 20) + ' | Storey: ' + storeyParam + ' | Tol: ' + tolMm + 'mm';
              console.log('§CLASH_DEEPLINK guidA=' + guidA + ' guidB=' + guidB + ' storey=' + storeyParam + ' tol=' + tolMm);
            });
            } catch(err) { console.error('§CLASH_DEEPLINK_ERR', err); }
          }
        }, 1500);
      }
    }

    // S265 Phase 3: Restore shared state from hash — pick, storey, xray, tour, camera
    // Runs after clash handler (clash has its own cam restore). Non-clash params handled here.
    if (!clashParam && Object.keys(hashParams).length > 0) {
      var shareRestoreChecks = 0;
      var shareRestoreTimer = setInterval(function() {
        shareRestoreChecks++;
        if (APP.streamedCount > 10 || shareRestoreChecks > 20) {
          clearInterval(shareRestoreTimer);
          var restored = [];

          // Camera position
          var camStr = hashParams.cam;
          var tgtStr = hashParams.tgt;
          if (camStr && tgtStr) {
            var cam = camStr.split(',').map(Number);
            var tgt = tgtStr.split(',').map(Number);
            if (cam.length === 3 && tgt.length === 3) {
              APP.camera.position.set(cam[0], cam[1], cam[2]);
              APP.controls.target.set(tgt[0], tgt[1], tgt[2]);
              APP.controls.update();
              restored.push('camera');
            }
          }

          // Storey filter
          var storeyParam = hashParams.storey;
          if (storeyParam) {
            var storeys = decodeURIComponent(storeyParam).split(',');
            APP.activeStoreyFilter = storeys.length === 1 ? storeys[0] : storeys;
            // Re-apply visibility
            APP.scene.traverse(function(obj) {
              if (obj.isMesh && obj.userData && obj.userData.storey) {
                var vis = Array.isArray(APP.activeStoreyFilter)
                  ? APP.activeStoreyFilter.indexOf(obj.userData.storey) >= 0
                  : obj.userData.storey === APP.activeStoreyFilter;
                obj.visible = vis;
              }
            });
            restored.push('storey=' + storeyParam);
          }

          // X-ray
          if (hashParams.xray === '1' && typeof APP.toggleXray === 'function') {
            if (!APP.xrayOn) APP.toggleXray();
            restored.push('xray');
          }

          // Pick element — highlight + show info
          var pickGuid = hashParams.pick;
          if (pickGuid && APP.db) {
            try {
              var rows = APP.dbQuery(
                "SELECT m.ifc_class, m.element_name, m.guid, m.building, m.storey, m.discipline, m.material_rgba FROM elements_meta m WHERE m.guid = ?",
                [pickGuid]
              );
              if (rows.length) {
                var r = rows[0];
                document.getElementById('info-class').textContent = r[0] || '—';
                document.getElementById('info-name').textContent = r[1] || '—';
                document.getElementById('info-guid').textContent = r[2] || '—';
                document.getElementById('info-building').textContent = r[3] || '—';
                document.getElementById('info-storey').textContent = r[4] || '—';
                document.getElementById('info-disc').textContent = r[5] || '—';
                document.getElementById('info-material').textContent = r[6] || '—';
                document.getElementById('info-panel').style.display = 'block';
                restored.push('pick=' + pickGuid);
              }
            } catch(e) { console.log('§SHARE_PARSE pick_err=' + e.message); }
          }

          // Tour auto-play
          if (hashParams.tour === 'play' && typeof APP.startFlyTour === 'function') {
            APP.startFlyTour();
            restored.push('tour');
          }

          // Time Machine cursor
          if (hashParams.tm && typeof window.toggleTimeMachine === 'function') {
            window.toggleTimeMachine();
            restored.push('tm=' + hashParams.tm);
          }

          console.log('§SHARE_PARSE ' + (restored.length > 0 ? restored.join(' ') : 'none'));
        }
      }, 1500);
    }
  }).catch(e => {
    APP.status.textContent = `Error: ${e.message}`;
    console.error(`[S192] §INIT_ERROR`, e);
  });

  // S243: Offline/online status notification
  function showNetStatus(online) {
    var id = 'net-status-toast';
    var old = document.getElementById(id);
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:10px 24px;border-radius:8px;font-size:13px;font-family:Segoe UI,sans-serif;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:opacity 0.5s;pointer-events:none;';
    if (online) {
      div.style.background = 'rgba(39,174,96,0.92)';
      div.style.color = '#fff';
      div.textContent = 'Back online';
      console.log('[S243] §NET_STATUS online');
    } else {
      div.style.background = 'rgba(230,126,34,0.92)';
      div.style.color = '#fff';
      div.textContent = 'Offline mode — cached buildings still available';
      console.log('[S243] §NET_STATUS offline');
    }
    document.body.appendChild(div);
    setTimeout(function() { div.style.opacity = '0'; }, online ? 3000 : 5000);
    setTimeout(function() { if (div.parentNode) div.remove(); }, online ? 3500 : 5500);
  }
  // Persistent OFFLINE badge — sits right of the mic button, stays until online
  function _offlineBadge(show) {
    var id = 'offline-badge';
    var old = document.getElementById(id);
    if (!show) { if (old) old.remove(); return; }
    if (old) return; // already showing
    var mic = document.getElementById('nlp-btn');
    var badge = document.createElement('span');
    badge.id = id;
    badge.textContent = 'OFFLINE';
    badge.style.cssText = 'position:fixed;top:10px;z-index:21;padding:2px 7px;' +
      'background:rgba(200,30,30,0.85);color:#fff;font-size:10px;font-family:Segoe UI,sans-serif;' +
      'border-radius:4px;letter-spacing:0.5px;pointer-events:none;opacity:0.9;';
    // Place just right of mic
    if (mic) {
      var r = mic.getBoundingClientRect();
      badge.style.left = Math.round(r.right + 6) + 'px';
    } else {
      badge.style.left = 'calc(50% + 30px)';
    }
    document.body.appendChild(badge);
  }

  window.addEventListener('offline', function() { showNetStatus(false); _offlineBadge(true); });
  window.addEventListener('online', function() { showNetStatus(true); _offlineBadge(false); });
  if (!navigator.onLine) { showNetStatus(false); _offlineBadge(true); }
}
