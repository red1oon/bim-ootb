/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// main.js — initViewer() orchestrator: creates APP, calls each module's setup, starts render loop
// DEV version — adds setupNlp (S211 voice command / NLP query)
console.log('§MAIN_JS v38 loaded — S287b single-owner render loop');
async function initViewer() {
  const APP = window.APP = {};

  // §S276: setupScene is async (WebGPURenderer.init), run first
  if (typeof setupConfig === 'function') setupConfig(APP);
  if (typeof setupScene === 'function') await setupScene(APP);
  var _mods = [setupHelpers, setupStreaming, setupPanels, setupTools,
    setupPicking, setupHoverName, setupTour, setupMeasure, setupSitecam, setupShare, setupIssues, setupExcel, setupWalk, setupCity];
  _mods.forEach(function(fn) { if (typeof fn === 'function') fn(APP); });
  // BIM_EMBED_WINDOW_SESSION §B2 — chromeless when ?embedded=true (reuses A.EMBEDDED, config.js) +
  // announce readiness to the host (iDempiere) so the embed panel can §-log it (W-BIM-EMBED).
  if (APP.EMBEDDED) {
    try { document.documentElement.classList.add('bim-embedded'); } catch (e) {}
    try {
      if (window.parent && window.parent !== window)
        window.parent.postMessage({ type: 'bim:ready', bld: (new URLSearchParams(location.search)).get('bld') || null }, '*');
    } catch (e) {}
    console.log('§BIM-EMBEDDED chromeless mode on; ready posted to host');
  }
  // BIM_EMBED_WINDOW_SESSION §B3 — bidirectional cross-highlight contract (host-agnostic postMessage).
  //   ERP(parent) → viewer(iframe): {type:'bim:highlight', ifcClass|guid} | {type:'bim:clearHighlight'}.
  //   viewer → ERP: {type:'bim:highlighted', ifcClass, guid, count} (ACK) and {type:'bim:focusRecord', guid,
  //   ifcClass} on a pick (emitted from picking.js in A.EMBEDDED). NON-INVENT: every class/guid is read from
  //   elements_meta — no fabricated line↔element map. Render reuses A.focusElement (the SAME yellow-silhouette
  //   renderer the Find drill / pick / history-restore use); match-count is the GPU-independent witness assertion.
  function _bimPostParent(msg) {
    try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch (e) {}
  }
  APP._bimPostFocus = function (guid, ifcClass) {
    if (!guid) return;
    _bimPostParent({ type: 'bim:focusRecord', guid: guid, ifcClass: ifcClass || null });
    // CONNECT_SCENE_SPEC.md P1 — generalise the bim:* pick-emit onto the shared 'selection' channel so the
    // Modeller (and any connected surface) lands on the SAME signed entity, not just the ERP host. Anchored on
    // signed identity: guid + ifcClass (ERP product Value == ifc_class; component ifc_class). NON-INVENT: both
    // read from elements_meta — no fabricated map. _connectApplying guards the remote→local→remote echo loop.
    if (window.Connect && window.Connect.on && !APP._connectApplying)
      window.Connect.publish('selection', { guid: guid, ifcClass: ifcClass || null, surface: 'viewer' });
    console.log('§BIM-FOCUSREC guid=' + String(guid).slice(0, 12) + ' class=' + (ifcClass || '?'));
  };
  APP._bimGuidsForClass = function (ifcClass) {
    if (!APP.db || !ifcClass) return [];
    try {
      var rows = APP.dbQuery('SELECT guid FROM elements_meta WHERE ifc_class = ?', [ifcClass]) || [];
      return rows.map(function (r) { return r[0]; }).filter(Boolean);
    } catch (e) { console.log('§BIM-HL-ERR ' + e.message); return []; }
  };
  APP._bimHighlight = function (o) {
    o = o || {};
    var guids = [], cls = o.ifcClass || null;
    if (o.guid) {
      guids = [o.guid];
      if (!cls && APP.db) { try { var r = APP.dbQuery('SELECT ifc_class FROM elements_meta WHERE guid = ?', [o.guid]); if (r && r.length) cls = r[0][0]; } catch (e) {} }
    } else if (cls) {
      guids = APP._bimGuidsForClass(cls);
    }
    var n = guids.length;
    console.log('§BIM-HL ' + (o.guid ? ('guid=' + String(o.guid).slice(0, 12)) : ('class=' + cls)) + ' match=' + n);
    if (n) {
      var apply = function () { if (APP.focusElement) APP.focusElement(guids, { item: !!o.guid, frame: o.frame !== false }); };
      if (APP.focusElement) apply();
      else if (APP.loadNavigate) APP.loadNavigate().then(apply).catch(function () {});
    }
    _bimPostParent({ type: 'bim:highlighted', ifcClass: cls, guid: o.guid || null, count: n });
    return n;
  };
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object') return;
    if (d.type === 'bim:highlight') APP._bimHighlight(d);
    else if (d.type === 'bim:clearHighlight') { if (APP.clearFocusElement) APP.clearFocusElement(); console.log('§BIM-HL clear'); }
  });
  // CONNECT_SCENE_SPEC.md P1 — the viewer joins the shared scene as surface 'viewer'. An incoming 'selection'
  // (from the Modeller or ERP) highlights the SAME signed entity here via the existing focusElement path; the
  // _connectApplying flag stops that highlight from re-publishing (echo guard). Opt-in: auto-enable on ?connect=1.
  if (window.Connect) {
    window.Connect.register('viewer');
    window.Connect.subscribe('selection', function (sel) {
      if (!sel) return;
      console.log('§CONNECT-SEL-IN viewer guid=' + String(sel.guid || '').slice(0, 12) + ' class=' + (sel.ifcClass || '?') + ' from=' + (sel.surface || '?'));
      APP._connectApplying = true;
      try { APP._bimHighlight({ guid: sel.guid || null, ifcClass: sel.ifcClass || null }); }
      finally { APP._connectApplying = false; }
    });
    try { if ((new URLSearchParams(location.search)).get('connect') === '1') window.Connect.enable(); } catch (e) {}
  }
  // §ZOOM-SCOPE auto-apply (ZOOM_ACROSS_SCOPE_SESSION §SPEC) — the ERP "Zoom Across" pill cold-opens the viewer
  // with ?find=<scope> (a single IFC class or a comma-separated guid set). On boot we wait for the model db, then
  // lazy-load Navigate and run the INCUMBENT Find on that scope (applyFindScope opens the Find panel + selects +
  // highlights via focusElement — the warm correlation, reusing Find, no parallel highlighter). Query survives
  // (the hash is rewritten with live camera coords). Best-effort: a missing scope/model just leaves a clean open.
  (function () {
    try {
      var _zm = /[?&]find=([^&]+)/.exec(location.search);
      if (!_zm) return;
      var scope = decodeURIComponent(_zm[1].replace(/\+/g, ' '));
      var tries = 0, poll = setInterval(function () {
        tries++;
        if (!APP.db) { if (tries > 300) clearInterval(poll); return; } // wait for the model db (runSearch needs it)
        clearInterval(poll);
        var go = function () {
          if (typeof APP.applyFindScope === 'function') { try { APP.applyFindScope(scope); } catch (e) { console.log('§ZOOM-SCOPE err=' + (e && e.message)); } }
          else { console.log('§ZOOM-SCOPE skip=no-applyFindScope'); }
        };
        // give geometry a beat to stream (so focusElement can light), then load Navigate + apply.
        setTimeout(function () {
          if (typeof APP.applyFindScope === 'function') return go();
          if (APP.loadNavigate) APP.loadNavigate().then(go).catch(function (e) { console.log('§ZOOM-SCOPE err=' + (e && e.message)); });
          else go();
        }, 600);
      }, 300);
    } catch (e) { /* never block boot */ }
  })();
  if (typeof setupDLOD === 'function') setupDLOD(APP);
  if (typeof setupNlp === 'function') setupNlp(APP);
  if (typeof setupGhostGlass === 'function') setupGhostGlass(APP);
  if (typeof setupErrorReporter === 'function') setupErrorReporter(APP);
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
      // VIEWER_FIND_PANEL_ROOM_ACCURACY.md §2 Task 1 — room_habitability.js first: navigate_find.js's
      // _allRoomVolumes() calls window.RoomHabitability.spaceHabitable() when the Room Lens opens.
      // Lazy-loaded here (not a static viewer.html <script>) since it's only ever needed alongside
      // navigate_find.js itself — no reason to spend the bytes on every boot.
      var modules = [
        // v2 (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22): classifyUtilityRooms/utilityContentClass
        // gain an additive opts.ignoreDoorExemption (default false = identical display behavior); the
        // routing caller (room_graph.js) passes true. A stale v1 cache would ignore the new arg.
        '../common/room_habitability.js?v=2',
        // PATH_LEGAL_SEGMENTS.md §G3-REVISED — pack/unpack + lookup for the offline-precomputed
        // per-storey walkable raster; must load BEFORE room_graph.js (buildGraph() references
        // window.StoreyRaster when it reads storey_walkable_raster).
        '../common/storey_raster.js?v=1',
        // VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7 — room-to-room adjacency graph + pathfinding,
        // consumed by navigate_find.js's Room axis "Path" sub-mode. Same lazy-load rationale as
        // room_habitability.js above (only needed alongside navigate_find.js itself).
        // v3 (PATH_LEGAL_SEGMENTS.md, 2026-07-13): same-storey chord legality + visibility-graph
        // detour — a returning browser's cached v2 never draws the courtyard-void fix without this bump.
        // v4 (2026-07-15, §ISLAND_BRIDGE): ambiguous-residual-candidate rescue (E9) + circ-per-chain
        // bridge (E6) — a returning browser's cached v3 would keep reporting the pre-fix island counts.
        // v5 (FLY_TOUR_CORRIDOR_GRAPH.md, 2026-07-16): expose chordIllegalCount witness helper.
        // v6 (VIEWER_FIND_PANEL_ROOM_ACCURACY.md §10, 2026-07-22): §UTILITY-ROUTING-PENALTY — buildGraph()
        // tags utility rooms via RoomHabitability.classifyUtilityRooms; _buildAdjacency() penalises
        // (x8, never removes) any edge touching one so room→room routing prefers corridors.
        // v7 (same doc §10, 2026-07-22): pass ignoreDoorExemption:true so real door-carrying service
        // rooms are tagged too (the door-exempt display default missed them); exclude CORRIDOR_ROOM nodes.
        '../common/room_graph.js?v=12',
        // §HALLWAY-BACKBONE-NOT-LOADED (2026-07-14, real bug found via live browser check — every
        // corridor/spine/Hall-Corridor-label feature built this session had been silently no-oping
        // in the browser, despite passing every Node-based witness, because this line never
        // existed): room_graph.js's buildGraph() reads window.HallwayBackbone (used for E5/E6/E7/E8
        // spine wiring, corridor-room backprop, and classifyCorridorRooms' Type-tree label) but the
        // script that DEFINES it was never added to this load list. Must load AFTER room_graph.js
        // (room_graph.js's HallwayBackbone read happens inside buildGraph(), called later — fine)
        // but hallway_backbone.js itself reads window.RoomGraph at its OWN top-level IIFE execution
        // (getStairGroups() reuse), so room_graph.js must already exist by the time this runs.
        '../common/hallway_backbone.js?v=1',
        // v49 (FLY_TOUR_CORRIDOR_GRAPH.md, 2026-07-16): A.ensureRooms + A.getRoomGraph extraction.
        'navigate_find.js?v=57',
        'navigate_grid.js?v=1',
        'navigate_path.js?v=1',
        'navigate_engine.js?v=1',
        'navigate_controls.js?v=2',
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
  window.filterByGuids = APP.filterByGuids;
  window.listRooms = APP.listRooms;
  window.isolateRoom = APP.isolateRoom;
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
  // §S282b: _isMobile now set in config.js (before pill_builder reads it)
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
      // 2d.html retired 2026-07-12 (Modeller 3D grid / grid_overlay.js is the only 2D path)
      console.error('§2D_OPEN grid_overlay.js not loaded — 2D unavailable');
      APP.status.textContent = '2D grid unavailable — reload the app';
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

      // §SE-4 / §SE-D: a Schedule Editor tab broadcast a signed schedule op → REPLAY it on this
      // viewer's db via the same ScheduleAuthor verb ("both are folds of one log"), then re-fold the
      // open Time Machine via the shipped toggle (same path the authoring wizard's Apply-to-4D uses).
      // Safe-additive: an op whose task isn't in this db is a graceful no-op, never throws.
      if (msg.type === '4D_SCHED_EDIT') {
        try {
          if (window.ScheduleSync && APP.db) {
            var _r = window.ScheduleSync.applyOp(APP.db, msg);
            var _ok = !!(_r && _r.ok !== false);
            console.log('§4D_RECV 4D_SCHED_EDIT op=' + msg.op + ' applied=' + _ok);
            // Re-fold the TM off the LIVE (now-edited) tasks. tmRefoldSchedule invalidates the stale gantt
            // cache + kernel_ops places so activate() re-reads the edit — the old toggle-off→setTimeout(on,60)
            // both raced the async activate AND replayed the stale cached schedule. Fallback kept for older viewers.
            if (_ok && APP._tmOn && typeof window.tmRefoldSchedule === 'function') {
              window.tmRefoldSchedule();
            } else if (_ok && APP._tmOn && typeof window.toggleTimeMachine === 'function') {
              window.toggleTimeMachine();
              setTimeout(function() { window.toggleTimeMachine(); }, 60);
            }
          }
        } catch (e) { console.warn('§4D_SCHED_EDIT replay', e); }
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
  let _idleLogged = false; // §S286: whitebox — true once the desktop loop has parked idle

  // §FPS_MODE: frame_ms sampler tagged by nav-DLOD/xray-cycle/fly/orbit state — landed to settle
  // whether nav-DLOD ('o') actually helps frame time while flying vs dragging vs bbox-cycle mode
  // (bbox mode gates nav-DLOD off via activeGuidFilter, see dlod_nav.js _gateBlockReason). Only
  // accumulates on frames that actually did work (post-_awake) — idle-parked gaps aren't real cost.
  var _fpsSum = 0, _fpsN = 0, _fpsMax = 0, _fpsLastT = 0, _fpsLastLogT = 0;
  function _fpsSample(now) {
    if (_fpsLastT) {
      var dt = now - _fpsLastT;
      _fpsSum += dt; _fpsN++;
      if (dt > _fpsMax) _fpsMax = dt;
    }
    _fpsLastT = now;
    if (_fpsN && (now - _fpsLastLogT) >= 2000) {
      var mean = +(_fpsSum / _fpsN).toFixed(1);
      var disp = APP.xrayOn ? 'xray' : ((typeof window.ghostXrayOn === 'function' && window.ghostXrayOn()) ? 'bbox' : 'solid');
      // dlod= reads _dlodNavEngaged (actually classifying/boxing), not the pill-pressed _dlodNavOn —
      // a gate-blocked press (streaming/find-isolation/etc, see dlod_nav.js _gateBlockReason) does
      // nothing at all, and tagging those frames "on" would silently poison this exact comparison.
      console.log('§FPS_MODE mean=' + mean + ' max=' + _fpsMax.toFixed(1) + ' n=' + _fpsN +
        ' dlod=' + (window._dlodNavEngaged ? 'on' : 'off') + ' disp=' + disp +
        ' fly=' + (APP.flyActive ? 1 : 0) + ' orbit=' + (_orbiting ? 1 : 0));
      _fpsSum = 0; _fpsN = 0; _fpsMax = 0; _fpsLastLogT = now;
    }
  }
  // §IDLE-PARK: these are the wake points. markDirty/controls-change now also REVIVE the
  // rAF chain (the loop self-parks when idle — see animate()). _startLoop is hoisted + guarded
  // (no-op if already running), so calling it on every change is cheap.
  APP.controls.addEventListener('change', () => { _needsRender = true; _startLoop(); });
  APP.markDirty = () => { _needsRender = true; _startLoop(); };

  // §S260b: Reduce pixel ratio during orbit for smoother interaction on heavy scenes
  var _fullDPR = Math.min(window.devicePixelRatio || 1, 2);
  var _orbitDPR = window._isMobile ? 0.75 : Math.min(_fullDPR, 1);  // §S274: mobile=0.75x during drag
  var _orbiting = false;
  APP.controls.addEventListener('start', function() {
    // §STILL_REFINE: a real drag/touch beginning is the "touching canvas" signal the still-refine
    // spec asked for — cancel here, NOT from the generic _startLoop choke point (that also fires
    // from keydown/markDirty on things unrelated to touching the canvas, e.g. the history bar's
    // own event-sniffer refreshing itself right after logging the Alt+S keypress that started the
    // refine — confirmed live, 2026-07-15: start->cancelled within the same event, nothing the
    // user actually touched in between).
    // §STAGE1 (sandbox spike): OrbitControls 'start' is unambiguously pure camera movement, never
    // a selection — soft-cancel only (keeps staging), not the full teardown.
    // §STAGE2_MIDDRAG_FIX (review finding 6): also fire during soft-park (_photoAutoStageOn) so
    // every new drag re-arms/reset the Stage-2 idle timer — gating on _stillRefineActive alone
    // made the re-arm branch dead code and let Stage 2 fire mid-gesture (the ghosting report).
    if ((APP._stillRefineActive || APP._photoAutoStageOn) && typeof APP.softStopStillRefine === 'function') APP.softStopStillRefine();
    _startLoop(); // §IDLE-PARK: drag begins → revive the loop if parked
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
      _startLoop(); // §IDLE-PARK: keep painting through the damping tail
    }
  });

  // §S271: Pause rAF when tab backgrounded — saves battery, avoids WebGL context kill
  var _tabVisible = true;
  var _rafId, _loopStarts = 0;
  // §S287b: SINGLE-OWNER render loop. Every (re)start routes through here; the _rafId guard
  // guarantees exactly ONE rAF chain — fixes the S287 focus/pageshow + async-init double-loop
  // (which ran render twice per frame). Witness: §RENDER_LOOP start total= must stay 1.
  var _idleCycles = 0;   // §LOG_SPAM_THROTTLE — the idle gate's cycle count, logged instead of each cycle
  function _startLoop() {
    if (_rafId) return;                       // already running — never double
    _loopStarts++;
    _needsRender = true;
    _rafId = requestAnimationFrame(animate);
    // §LOG_SPAM_THROTTLE (user, 2026-07-27: "solve the spam too"). This trio — RENDER_LOOP start,
    // IDLE_GATE park, IDLE_GATE wake — fires once per idle cycle, and the idle gate cycles on every
    // pointer twitch: their Hospital console ran to `total=189` with hundreds of interleaved
    // park/wake pairs, burying every §-line that carries information. The COUNT is the signal here,
    // not each occurrence, so log the first few in full and then only every 25th, carrying the
    // running total (which is what the §RENDER_LOOP witness asserts on anyway).
    if (_loopStarts <= 3 || _loopStarts % 25 === 0)
      console.log('§RENDER_LOOP start total=' + _loopStarts + (_loopStarts > 3 ? ' (throttled: every 25th)' : ''));
  }
  function _ensureLoop() { _tabVisible = true; _startLoop(); }
  document.addEventListener('visibilitychange', function() {
    _tabVisible = !document.hidden;
    if (_tabVisible) _startLoop();
    else if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    console.log('§TAB_VISIBILITY visible=' + _tabVisible);
  });
  // §S287: revive a loop cancelled while hidden — refocus, or bfcache restore (persisted).
  // Both go through _startLoop's guard, so they can never start a second chain.
  window.addEventListener('focus', _ensureLoop);
  window.addEventListener('pageshow', function(e) { if (e.persisted) _ensureLoop(); });
  // §IDLE-PARK: belt-and-suspenders — ANY user input revives a parked loop, regardless of
  // which feature it triggers (fly/walk/streaming started by a click after idle). _startLoop
  // is guarded, and these fire only on real interaction, so a truly idle scene stays parked.
  // §STILL_REFINE: cancel on the actual touch/scroll signal — deliberately NOT on keydown (that
  // fires for every key including Alt+S itself, and for incidental logging-triggered wakes).
  // §STAGE2_MIDDRAG_FIX (review finding 6): both cancel paths must also fire during soft-park
  // (photo staging kept alive, Stage-2 idle timer armed, _stillRefineActive=false) — gating on
  // _stillRefineActive alone made every soft-park interaction a no-op, so the idle timer counted
  // from the FIRST move only and Stage 2 re-fired mid-gesture (the "ghosting has returned" report).
  // §AUTO_STAGE2_DISABLED (2026-07-16, user directive): with the Stage-2 idle auto-refire off,
  // soft-park is signalled by the kept-alive staging alone (APP._photoStagingOn, mirrored by
  // effects.js) — _photoAutoStageOn is permanently false now, and without the staging term a
  // tap/UI-click during kept-staging would never reach the full teardown (dusk mood stuck on).
  function _photoCycleEngaged() { return !!(APP._stillRefineActive || APP._photoAutoStageOn || APP._photoStagingOn); }
  function _cancelStillRefine() { if (_photoCycleEngaged() && typeof APP.stopStillRefine === 'function') APP.stopStillRefine(); }
  // §STAGE1 (sandbox spike, feat/ssgi-composer-poc — NOT shipped): a pointerdown ON THE 3D CANVAS
  // is camera-orbit-drag-start territory (soft-cancel, keep staging) — a pointerdown ANYWHERE ELSE
  // (Find panel, toolbar, any UI chrome) is a real selection/action (full teardown, matches "when i
  // select an item it breaks to old nature" exactly, unchanged from today's behavior for UI clicks).
  function _cancelStillRefineSoft() { if (_photoCycleEngaged() && typeof APP.softStopStillRefine === 'function') APP.softStopStillRefine(); }
  // §PANEL_REGISTRY_SOFT_CANCEL (2026-07-17, user: "during flight we cannot disturb the panel as
  // closing it stops the Alt-S and it be recording onwards non S... Pill registry is an abstract
  // handling"): this was a blind binary check — canvas = soft, EVERYTHING else = full teardown —
  // which never consulted window._panels (scene.js's own registry, populated via InputReg.register
  // from every pill-built panel, Sunglass/Cinema included). Touching any registered UI panel (tune
  // HUD, Sunglass, future panels) doesn't need to fully exit photo mode/cinema recording any more
  // than a camera-drag does — soft-cancel (keep staging, only restart the TAA polish) is the right
  // default for panel interaction in general. Find-panel's own "selecting a result exits photo
  // mode" behavior is untouched — that comes from focusElement's own separate teardown path when a
  // real result is clicked, not from this generic listener, so this stays general/abstract instead
  // of a one-off allowlist of panel ids.
  function _insideRegisteredPanel(target) {
    var panels = window._panels || [];
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].el && panels[i].el.contains(target)) return true;
    }
    return false;
  }
  var _photoCanvasDown = null;
  window.addEventListener('pointerdown', function(e) {
    if (APP.renderer && e.target === APP.renderer.domElement) {
      _photoCanvasDown = { x: e.clientX, y: e.clientY };
      _cancelStillRefineSoft();
    } else if (_insideRegisteredPanel(e.target)) {
      _photoCanvasDown = null;
      _cancelStillRefineSoft();
    } else {
      _photoCanvasDown = null;
      _cancelStillRefine();
    }
    _startLoop();
  });
  // §STAGE1_TAP_SELECT (review finding 1): canvas click-to-select IS a live core feature —
  // picking.js selects on pointerup when the pointer moved ≤5px (tap), so pointerdown on the
  // canvas is ambiguous between drag-start and tap-select. Classify at pointerup with picking.js's
  // own tap-vs-drag test and escalate a tap to the FULL teardown ("when i select an item it
  // breaks to old nature"); a real drag stays soft (staging kept), unchanged.
  window.addEventListener('pointerup', function(e) {
    if (!_photoCanvasDown) return;
    var dx = e.clientX - _photoCanvasDown.x, dy = e.clientY - _photoCanvasDown.y;
    _photoCanvasDown = null;
    if (Math.sqrt(dx * dx + dy * dy) <= 5) _cancelStillRefine();
  });
  window.addEventListener('wheel', function() { _cancelStillRefineSoft(); _startLoop(); }, { passive: true });
  window.addEventListener('keydown', _startLoop);
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
    // §IDLE-PARK: self-parking loop. The §S286 gate only skipped the GPU paint — the rAF chain
    // still ran ~60×/s, executing controls.update() + the tick fan-out on a static scene (idle
    // CPU, worst on the large Terminal model). Now: when nothing needs CONTINUOUS frames, STOP
    // the chain (null _rafId, no reschedule). markDirty()/controls/input revive it via _startLoop.
    var _awake = _needsRender || APP.streaming || APP.walkModeActive || APP.walkMode ||
                 APP.flyActive || _orbiting || _pipelinesCompiling;
    if (!_awake) {
      _rafId = null;
      if (!_idleLogged) {
        _idleCycles = (_idleCycles || 0) + 1;
        if (_idleCycles <= 3 || _idleCycles % 25 === 0)
          console.log('§IDLE_GATE park — rAF chain stopped (self-parking, 0 frames) cycles=' + _idleCycles +
            (_idleCycles > 3 ? ' (throttled: every 25th)' : ''));
        _idleLogged = true;
      }
      return;
    }
    _rafId = requestAnimationFrame(animate);
    _fpsSample(performance.now()); // §FPS_MODE — elapsed since previous awake-frame start = full per-frame cost
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
        // §S277c: EffectComposer replaces direct render when enabled (SSAO/Outline active)
        if (APP._giComposer && APP._giComposerActive) APP._giComposer.render();
        else if (APP._composer && APP._composerEnabled) APP._composer.render();
        else APP.renderer.render(APP.scene, APP.camera);
        _needsRender = false;
      }
    } else {
      // §S286: Desktop on-demand render — restores the gate S280c reverted. Memory
      // (project_s280c_perf.md) traced that era's sluggishness to an NVIDIA/Intel driver
      // mismatch, NOT this gate. Idle static scene now parks at 0 GPU frames (was ~60 fps
      // forever → fans). No TM exception: Time Machine self-renders via its own setTimeout
      // timer → renderAtTime() (markDirty + direct render), so the loop is redundant even
      // for TM. Every other camera path already calls markDirty.
      if (_needsRender || APP.streaming || APP.walkModeActive || _orbiting) {
        if (APP._giComposer && APP._giComposerActive) APP._giComposer.render();
        else if (APP._composer && APP._composerEnabled) APP._composer.render();
        else APP.renderer.render(APP.scene, APP.camera);
        _needsRender = false;
        if (_idleLogged) {
          if ((_idleCycles || 0) <= 3 || (_idleCycles || 0) % 25 === 0) console.log('§IDLE_GATE wake cycles=' + (_idleCycles || 0));
          _idleLogged = false;
        }
      } else if (!_idleLogged) {
        console.log('§IDLE_GATE park — desktop loop idle, 0 GPU frames (static scene)');
        _idleLogged = true;
      }
    }
  }

  // Go — §S287b: single guarded kickoff (no double loop if focus/pageshow fired during init)
  _startLoop();
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
            // §NAV_FIND_002: filterStorey now accepts an array and covers
            // regular + instanced + batched meshes via A._storeyVisible.
            if (APP.filterStorey) APP.filterStorey(storeys);
            else APP.activeStoreyFilter = storeys.length === 1 ? storeys[0] : storeys;
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
    // §PWA_RESUME recovery (2026-06-12): a RESUMED db (no explicit ?db=) that no longer fetches —
    // e.g. an OCI-era pwa_last_db after the building dbs moved into the repo (GH Pages) — must not
    // brick the viewer. Clear the stale resume key and reload ONCE onto the default db.
    try {
      var _qs = new URLSearchParams(location.search);
      if (!_qs.get('db') && localStorage.getItem('pwa_last_db') && !sessionStorage.getItem('pwa_resume_retry')) {
        console.log('§PWA_RESUME_CLEAR stale db=' + localStorage.getItem('pwa_last_db') + ' — back to the landing');
        localStorage.removeItem('pwa_last_db');
        sessionStorage.setItem('pwa_resume_retry', '1');
        // the landing (bubbles) is the only door that knows where every building db lives —
        // the viewer's bare default is not guaranteed on GH Pages (buildings ride OCI/_prodBase)
        location.replace('../index.html');
      }
    } catch (e2) {}
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
