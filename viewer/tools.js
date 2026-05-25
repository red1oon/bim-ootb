// tools.js — X-Ray, wireframe, section cut, screenshot, fullscreen, theme, 4D/5D export
function setupTools(A) {
  // §S260c: Ground Y calculation — shared by shadow + night mode
  // Strategy: find the ground-floor slab by storey name, fall back to lowest-storey largest slab.
  // Never picks roof/upper slabs. Ground = bottom face of the GF slab.
  A._calcGroundY = function() {
    if (!A.db || !A.ground) return;
    var _gLvl = 0, _gSrc = '?';
    try {
      // Step 1: Try storey name matching for ground floor slabs
      var gfNames = "('Ground Floor','Ground','First Floor','1st Floor','Level 0','Level 00','Level 1','GF','L0','L00','L1','00','0','1F','EG','Erdgeschoss','Storey 1','Plan 1','VÅN 1','VÅNING 1','1. OG','Rez-de-chaussée','RC','Planta Baja','PB','Piso 0','Begane grond','BG','GROUND FLOOR LEVEL','Ground Lev','Aras Tanah','u.etg')";
      var zr = A.db.exec(
        "SELECT t.center_z - t.bbox_z/2 AS bottom, t.bbox_x * t.bbox_y AS area, m.storey " +
        "FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid " +
        "WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 " +
        "AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
        "AND m.storey IN " + gfNames + " ORDER BY area DESC LIMIT 3"
      );
      if (zr.length && zr[0].values.length > 0) {
        _gLvl = zr[0].values[0][0]; _gSrc = 'gf-storey-slab(' + zr[0].values[0][2] + ')';
      }

      // Step 2: If no storey match, find ground-level slab.
      // §S260c: Strategy — get the top 5 largest slabs (floor plates), then pick the one
      // with the lowest center_z. Large slabs exist at every level; the lowest is most
      // likely ground. This avoids false positives from upper-floor slabs that happen
      // to be slightly larger than the GF slab.
      if (_gSrc === '?') {
        zr = A.db.exec(
          "SELECT t.center_z - t.bbox_z/2 AS bottom, t.bbox_x * t.bbox_y AS area, t.center_z, m.storey " +
          "FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid " +
          "WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 " +
          "AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
          "ORDER BY area DESC LIMIT 5"
        );
        if (zr.length && zr[0].values.length > 0) {
          // Among the top 5 largest slabs, pick the one with lowest center_z
          var bestBottom = null, bestCz = Infinity;
          for (var si = 0; si < zr[0].values.length; si++) {
            var row = zr[0].values[si];
            if (row[2] < bestCz) { bestCz = row[2]; bestBottom = row[0]; _gSrc = 'lowest-of-top5(' + row[3] + ')'; }
          }
          if (bestBottom !== null) _gLvl = bestBottom;
        }
      }

      // Step 3: Fallback — average bottom of all elements on named ground floor
      if (_gSrc === '?') {
        zr = A.db.exec("SELECT AVG(t.center_z - COALESCE(t.bbox_z/2, 0)) FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid WHERE m.storey='Ground Floor'");
        if (zr.length && zr[0].values[0][0] != null) { _gLvl = zr[0].values[0][0]; _gSrc = 'GF-avg'; }
      }

      // Step 4: Last resort — minimum z
      if (_gSrc === '?') {
        zr = A.db.exec('SELECT MIN(center_z) FROM element_transforms');
        if (zr.length && zr[0].values[0][0] != null) { _gLvl = zr[0].values[0][0]; _gSrc = 'min-z'; }
      }
      var p = A.ifc2three(0, 0, _gLvl);
      A.ground.position.y = p.y;
      console.log('§GROUND_Y src=' + _gSrc + ' z=' + _gLvl.toFixed(2) + ' y=' + p.y.toFixed(2));
    } catch(e) { console.warn('§GROUND_Y error', e); }
  };

  // Wireframe
  A.wireOn = false;
  A.toggleWireframe = function() {
    A.wireOn = !A.wireOn;
    const btn = document.getElementById('wire-btn');
    btn.style.background = A.wireOn ? '#4fc3f7' : '#444';
    btn.style.color = A.wireOn ? '#000' : '#fff';
    A.collectMeshes(o => o.isMesh).forEach(obj => {
      obj.material.wireframe = A.wireOn;
      obj.material.needsUpdate = true;
    });
    if (A.markDirty) A.markDirty();
  };

  // X-Ray
  // §S271b: Optimized — update unique materials via _matCache, disable sortObjects during X-Ray.
  // Old approach iterated all meshes (120K) and set mat.needsUpdate on each = GPU stall + per-frame sort.
  A.xrayOn = false;
  A.toggleXray = function() {
    A.xrayOn = !A.xrayOn;
    const btn = document.getElementById('xray-btn');
    btn.style.background = A.xrayOn ? '#4fc3f7' : '#444';
    btn.style.color = A.xrayOn ? '#000' : '#fff';

    // §S271b: Update unique materials only (via _matCache) — O(unique mats) not O(all meshes)
    // No scene.traverse — _matCache has all streaming materials, ground/helpers are negligible.
    var updated = 0;
    var seen = new Set();
    var mats = [];
    if (A._matCache) {
      for (var k in A._matCache) {
        var m = A._matCache[k];
        if (m && !seen.has(m)) { seen.add(m); mats.push(m); }
      }
    }
    // Ground material
    if (A.ground && A.ground.material && !seen.has(A.ground.material)) {
      mats.push(A.ground.material);
    }

    // §S276b: Batch material updates across frames to avoid GPU shader recompile stutter.
    // Set properties immediately (cheap), but stagger needsUpdate in batches via rAF.
    var BATCH = Math.ceil(mats.length / 3);
    for (var i = 0; i < mats.length; i++) {
      var mat = mats[i];
      if (A.xrayOn) {
        if (mat.userData.origOpacity === undefined) mat.userData.origOpacity = mat.opacity;
        if (mat.userData.origTransparent === undefined) mat.userData.origTransparent = mat.transparent;
        if (mat.userData.origSide === undefined) mat.userData.origSide = mat.side;
        mat.transparent = true;
        mat.opacity = 0.15;
        mat.side = THREE.DoubleSide;
      } else {
        if (mat.userData.origOpacity !== undefined) {
          mat.opacity = mat.userData.origOpacity;
          mat.transparent = mat.userData.origTransparent;
          mat.side = mat.userData.origSide;
          delete mat.userData.origOpacity;
          delete mat.userData.origTransparent;
          delete mat.userData.origSide;
        }
      }
      updated++;
    }
    // Stagger needsUpdate across 3 frames
    function _batchNeedsUpdate(start) {
      var end = Math.min(start + BATCH, mats.length);
      for (var j = start; j < end; j++) mats[j].needsUpdate = true;
      if (end < mats.length) requestAnimationFrame(function() { _batchNeedsUpdate(end); });
    }
    _batchNeedsUpdate(0);

    // §S271b: Disable transparent sort during X-Ray — uniform opacity doesn't need back-to-front order.
    // Saves O(n log n) sort per frame on 122K elements.
    A.renderer.sortObjects = !A.xrayOn;

    console.log(`[S200] §XRAY ${A.xrayOn ? 'ON' : 'OFF'} materials=${updated} sortObjects=${A.renderer.sortObjects} batch=${BATCH}`);
    if (A.markDirty) A.markDirty();
  };

  // Section Cut
  A.sectionOn = false;
  A.sectionAxis = 'Y';
  A.sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  A.sectionMin = -100;
  A.sectionMax = 200;

  A.toggleSection = function() {
    A.sectionOn = !A.sectionOn;
    const btn = document.getElementById('section-btn');
    btn.style.background = A.sectionOn ? '#4fc3f7' : '#444';
    btn.style.color = A.sectionOn ? '#000' : '#fff';
    const panel = document.getElementById('section-slider-panel');
    panel.style.display = A.sectionOn ? 'block' : 'none';
    if (A.sectionOn) {
      A.applySectionAxis();
      // No Save button on section slider — scissors in 3D is just cut + Esc.
      // Save lives in the 2D grid panel (grid-save-section-btn) only.
    } else {
      A.renderer.localClippingEnabled = false;
      A.collectMeshes(o => o.isMesh).forEach(obj => {
        obj.material.clippingPlanes = [];
        obj.material.needsUpdate = true;
      });
      console.log('[S205] §SECTION OFF');
      if (A.onSectionOff) A.onSectionOff();
    }
    if (A.markDirty) A.markDirty();
  };

  A.setSectionAxis = function(axis) {
    A.sectionAxis = axis;
    ['X', 'Y', 'Z'].forEach(a => {
      const b = document.getElementById('sec-axis-' + a.toLowerCase());
      b.style.background = (a === axis) ? '#4fc3f7' : '#444';
      b.style.color = (a === axis) ? '#000' : '#fff';
    });
    if (axis === 'Y') A.sectionPlane.normal.set(0, -1, 0);
    else if (axis === 'X') A.sectionPlane.normal.set(-1, 0, 0);
    else A.sectionPlane.normal.set(0, 0, -1);
    if (A.sectionOn) A.applySectionAxis();
  };

  A.applySectionAxis = function() {
    let axMin = Infinity, axMax = -Infinity;
    // §S277c: Use building centres envelope for section range — reliable, no ground/sky contamination
    var _bc = Object.values(A.buildingCentres || {})[0];
    if (_bc) {
      var _ctr = A.ifc2three(_bc.ix, _bc.iy, _bc.iz);
      var _env = _bc.envelope || 50;
      if (A.sectionAxis === 'Y') { axMin = _ctr.y - _env * 0.3; axMax = _ctr.y + _env * 0.6; }
      else if (A.sectionAxis === 'X') { axMin = _ctr.x - _env; axMax = _ctr.x + _env; }
      else { axMin = _ctr.z - _env; axMax = _ctr.z + _env; }
    } else {
      // Fallback: scan meshes, exclude ground/sky
      A.collectMeshes(o => o.isMesh && o !== A.ground && o.visible).forEach(obj => {
        if (obj.geometry && obj.geometry.parameters && obj.geometry.parameters.width >= 10000) return;
        const box = new THREE.Box3().setFromObject(obj);
        if (!isFinite(box.min.x)) return;
        if (A.sectionAxis === 'Y') { axMin = Math.min(axMin, box.min.y); axMax = Math.max(axMax, box.max.y); }
        else if (A.sectionAxis === 'X') { axMin = Math.min(axMin, box.min.x); axMax = Math.max(axMax, box.max.x); }
        else { axMin = Math.min(axMin, box.min.z); axMax = Math.max(axMax, box.max.z); }
      });
    }
    if (!isFinite(axMin)) { axMin = -100; axMax = 200; }
    A.sectionMin = axMin;
    A.sectionMax = axMax;
    const slider = document.getElementById('section-slider');
    slider.min = axMin.toFixed(1);
    slider.max = axMax.toFixed(1);
    slider.step = ((axMax - axMin) / 500).toFixed(3);
    slider.value = axMax.toFixed(1);
    A.sectionPlane.constant = axMax;
    A.renderer.localClippingEnabled = true;
    A.collectMeshes(o => o.isMesh).forEach(obj => {
      obj.material.clippingPlanes = [A.sectionPlane];
      obj.material.clipShadows = true;
      obj.material.needsUpdate = true;
    });
    document.getElementById('section-val').textContent = axMax.toFixed(1) + ' m';
    console.log(`[S205] §SECTION ON axis=${A.sectionAxis} range=[${axMin.toFixed(1)}, ${axMax.toFixed(1)}]`);
  };

  A.updateSectionPlane = function(val) {
    const v = parseFloat(val);
    A.sectionPlane.constant = v;
    document.getElementById('section-val').textContent = v.toFixed(1) + ' m';
    if (A.onSectionSliderChange) A.onSectionSliderChange(v);
    if (A.markDirty) A.markDirty();
  };

  // 4D/5D Export
  A.export4D5D = function() {
    if (!A.db || !A.activeBuilding) { A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_select_building||'Select a building first.'; return; }
    const bld = A.activeBuilding;
    const dbParam = new URLSearchParams(location.search).get('db') || 'yourproject_extracted.db';
    // S224: pass diffdb to boq_charts when viewer has diff data
    // boq_charts.html is a sibling in the same directory (sandbox/ on OCI, deploy/dev/ locally)
    var diffParam = '';
    var diffDbUrl = new URLSearchParams(location.search).get('diffdb');
    if (diffDbUrl) diffParam = '&diffdb=' + encodeURIComponent(diffDbUrl);

    var cacheBust = '&v=' + Date.now();
    var chartsUrl = 'boq_charts.html?db=' + encodeURIComponent(dbParam) + '&bld=' + bld + diffParam + cacheBust;
    window.open(chartsUrl, '_blank');
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_analytics_opened||'4D/5D analytics opened for {name}').replace('{name}', bld);
  };

  // Screenshot — in 2D grid mode, produces A3 print sheet with title block
  A.screenshot = function() {
    // If in 2D view and PrintSheet is available, use A3 print sheet
    if (typeof GridViews !== 'undefined' && GridViews.activeView() &&
        typeof PrintSheet !== 'undefined') {
      PrintSheet.capture(A);
      return;
    }
    // Fallback: regular screenshot
    A.renderer.render(A.scene, A.camera);
    const link = document.createElement('a');
    link.download = `BIM_OOTB_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
    link.href = A.canvas.toDataURL('image/png');
    link.click();
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:white;opacity:0.7;z-index:999;pointer-events:none';
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; flash.style.transition = 'opacity 0.3s'; }, 50);
    setTimeout(() => document.body.removeChild(flash), 400);
    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_screenshot_saved||'Screenshot saved to Downloads/';
  };

  // Fullscreen
  A.toggleFullscreen = function() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Theme — reverse background (light/dark)
  A.lightTheme = false;
  A.toggleTheme = function() {
    A.lightTheme = !A.lightTheme;
    const bg = A.lightTheme ? 0xf0f0f0 : 0x1a1a2e;
    const textColor = A.lightTheme ? '#222' : '#e0e0e0';
    const panelBg = A.lightTheme ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.3)';
    const statColor = A.lightTheme ? '#555' : '#ccc';
    const boldColor = A.lightTheme ? '#000' : '#fff';
    document.body.style.background = '#' + bg.toString(16).padStart(6, '0');
    document.body.style.color = textColor;
    A.renderer.setClearColor(bg);
    if (!A._whiteBg) A.ground.material.color.setHex(A.lightTheme ? 0xdddddd : 0x222233);
    document.querySelectorAll('#hud,#search-box,#icon-pill,#info-panel,#status').forEach(el => {
      el.style.background = panelBg;
      el.style.borderColor = A.lightTheme ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.08)';
    });
    document.querySelectorAll('.stat').forEach(el => el.style.color = statColor);
    document.querySelectorAll('.stat b').forEach(el => el.style.color = boldColor);
    document.querySelectorAll('#info-panel .label').forEach(el => el.style.color = A.lightTheme ? '#666' : '#888');
    document.querySelectorAll('#info-panel .value').forEach(el => el.style.color = A.lightTheme ? '#000' : '#fff');
    document.getElementById('status').style.color = A.lightTheme ? '#0077cc' : '#4fc3f7';
    document.querySelector('#hud h2').style.color = A.lightTheme ? '#0077cc' : '#4fc3f7';
    A.collectMeshes(o => o.isLineSegments && o.userData.building).forEach(obj => {
      obj.visible = !A.lightTheme;
    });
  };

  // Sunglasses — click: toggle slider, slider: recolor whites by IFC class
  A.sunglassOn = false;
  A._sunglassBackups = [];  // [{mesh, origMat}]

  A.toggleSunglass = function() {
    // §S259: toggle just shows/hides panel — settings persist
    var panel = document.getElementById('sunglass-slider-panel');
    var visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    var btn = document.getElementById('sunglass-btn');
    btn.style.background = visible ? '#444' : '#ff8c00';
    btn.style.color = visible ? '#fff' : '#000';
    A.sunglassOn = !visible;
  };

  A._sunglassBackups = [];
  A._restoreSunglass = function() {
    A._sunglassBackups.forEach(b => { b.mesh.material = b.origMat; });
    A._sunglassBackups = [];
  };

  A._isWhiteMat = function(mat) {
    if (!mat || !mat.color) return false;
    return mat.color.r > 0.75 && mat.color.g > 0.75 && mat.color.b > 0.75;
  };

  // Generate a color for class index at given intensity
  // Uses golden-angle hue spacing so adjacent classes always contrast
  // Golden-angle hue for index — max contrast between neighbors
  A._goldenHue = function(idx) { return ((idx * 137.508) % 360) / 360; };

  A._collectAllMeshes = function() {
    var all = [];
    A.collectMeshes(function(o) { return o.isMesh && !o.userData.isInstanced; }).forEach(function(m) { all.push(m); });
    A.collectMeshes(function(o) { return o.isInstancedMesh; }).forEach(function(m) { all.push(m); });
    return all;
  };

  A._recolorMesh = function(mesh, color) {
    A._sunglassBackups.push({ mesh: mesh, origMat: mesh.material });
    var newMat = mesh.material.clone();
    newMat.color.copy(color);
    newMat.needsUpdate = true;
    mesh.material = newMat;
  };

  // Group helper
  A._groupBy = function(meshes, key) {
    var g = {};
    meshes.forEach(function(m) {
      var k = m.userData[key] || 'Unknown';
      if (!g[k]) g[k] = [];
      g[k].push(m);
    });
    return g;
  };

  A.updateAmbience = function(val) {
    var tick = Math.round(Number(val));
    A._restoreSunglass();
    if (tick === 0) {
      document.getElementById('sunglass-val').textContent = 'Off';
      console.log('[S200] §SUNGLASS off');
      return;
    }
    var allMeshes = A._collectAllMeshes();
    var label = document.getElementById('sunglass-val');
    var strategy, phase;

    // ── Professional warm/cool palettes (no purple) ──
    var warmPastel = [
      [0.05, 0.25, 0.82], [0.12, 0.25, 0.78], [0.08, 0.30, 0.75],  // peach, sand, cream
      [0.55, 0.20, 0.80], [0.42, 0.25, 0.76], [0.15, 0.22, 0.84],  // sage, olive, wheat
      [0.02, 0.20, 0.70], [0.58, 0.28, 0.72], [0.10, 0.35, 0.68],  // coral, teal, amber
      [0.48, 0.22, 0.78]                                              // moss
    ];
    var coolPastel = [
      [0.55, 0.30, 0.78], [0.62, 0.25, 0.75], [0.50, 0.35, 0.72],  // sky, steel, seafoam
      [0.45, 0.28, 0.80], [0.58, 0.32, 0.70], [0.68, 0.22, 0.76],  // mint, teal, slate
      [0.52, 0.25, 0.68], [0.60, 0.30, 0.74], [0.48, 0.35, 0.66],  // ocean, mist, stone
      [0.65, 0.28, 0.72]                                              // ice
    ];
    var earthTone = [
      [0.08, 0.45, 0.65], [0.05, 0.50, 0.55], [0.10, 0.40, 0.70],  // terracotta, sienna, tan
      [0.12, 0.55, 0.50], [0.15, 0.38, 0.60], [0.03, 0.48, 0.58],  // rust, clay, bronze
      [0.07, 0.42, 0.62], [0.55, 0.35, 0.58], [0.20, 0.50, 0.52],  // copper, olive, khaki
      [0.02, 0.60, 0.45]                                              // mahogany
    ];

    function applyPalette(groups, keys, palette, sub) {
      keys.forEach(function(k, i) {
        var p = palette[i % palette.length];
        var color = new THREE.Color().setHSL(p[0], p[1] + sub * 0.05, p[2] - sub * 0.03);
        groups[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
    }

    if (tick <= 10) {
      // ── 1-10: Warm pastels by IFC class, subtle contrast growing ──
      phase = 'Warm';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, warmPastel, tick - 1);
      strategy = keys.length + ' types';

    } else if (tick <= 20) {
      // ── 11-20: Cool pastels by IFC class ──
      phase = 'Cool';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, coolPastel, tick - 11);
      strategy = keys.length + ' types';

    } else if (tick <= 30) {
      // ── 21-30: Earth tones by IFC class ──
      phase = 'Earth';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, earthTone, tick - 21);
      strategy = keys.length + ' types';

    } else if (tick <= 45) {
      // ── 31-45: Warm pastels by storey ──
      phase = 'Storey warm';
      var g = A._groupBy(allMeshes, 'storey');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, warmPastel, tick - 31);
      strategy = keys.length + ' storeys';

    } else if (tick <= 55) {
      // ── 46-55: Cool pastels by storey ──
      phase = 'Storey cool';
      var g = A._groupBy(allMeshes, 'storey');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, coolPastel, tick - 46);
      strategy = keys.length + ' storeys';

    } else if (tick <= 65) {
      // ── 56-65: Earth by discipline ──
      phase = 'Discipline';
      var g = A._groupBy(allMeshes, 'disc');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, earthTone, tick - 56);
      strategy = keys.length + ' discs';

    } else if (tick <= 80) {
      // ── 66-80: Zebra — IFC class alternates warm/cool ──
      phase = 'Zebra';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      var t = (tick - 66) / 14;
      keys.forEach(function(k, i) {
        var w = warmPastel[i % warmPastel.length];
        var c = coolPastel[i % coolPastel.length];
        var warm = new THREE.Color().setHSL(w[0], w[1] + t * 0.15, w[2] - t * 0.05);
        var cool = new THREE.Color().setHSL(c[0], c[1] + t * 0.15, c[2] - t * 0.05);
        g[k].forEach(function(m, j) {
          A._recolorMesh(m, j % 2 === 0 ? warm : cool);
        });
      });
      strategy = keys.length + ' types';

    } else if (tick <= 90) {
      // ── 81-90: Monochrome — single hue, IFC class by lightness ──
      phase = 'Mono';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      var hue = ((tick - 81) / 9) * 0.15;  // cycle through warm hues only
      keys.forEach(function(k, i) {
        var l = 0.35 + (i / Math.max(keys.length - 1, 1)) * 0.45;
        var color = new THREE.Color().setHSL(hue, 0.4, l);
        g[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
      strategy = keys.length + ' types';

    } else if (tick <= 97) {
      // ── 91-97: Random pastel per mesh ──
      phase = 'Random';
      allMeshes.forEach(function(m) {
        var h = Math.random();
        var color = new THREE.Color().setHSL(h, 0.3, 0.65 + Math.random() * 0.15);
        A._recolorMesh(m, color);
      });
      strategy = allMeshes.length + ' meshes';

    } else {
      // ── 98-100: HARD — full saturation, dark, punchy ──
      phase = 'HARD';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      keys.forEach(function(k, i) {
        var h = A._goldenHue(i);
        var color = new THREE.Color().setHSL(h, 1.0, 0.35);
        g[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
      strategy = keys.length + ' types';
    }

    label.textContent = phase + ' — ' + strategy;
    console.log('[S200] §SUNGLASS tick=' + tick + ' phase=' + phase + ' ' + strategy);
  };

  // §S259: Lighting sliders in Sunglass panel
  A.updateLighting = function(which, val) {
    val = parseFloat(val);
    if (!A.renderer || !A.sun || !A.ambient || !A.hemi) return;
    if (which === 'exposure') {
      A.renderer.toneMappingExposure = val;
      document.getElementById('sl-exposure-val').textContent = val.toFixed(2);
    } else if (which === 'sun') {
      A.sun.intensity = val;
      document.getElementById('sl-sun-val').textContent = val.toFixed(2);
    } else if (which === 'ambient') {
      A.ambient.intensity = val;
      document.getElementById('sl-ambient-val').textContent = val.toFixed(2);
    } else if (which === 'hemi') {
      A.hemi.intensity = val;
      document.getElementById('sl-hemi-val').textContent = val.toFixed(2);
    }
    if (A.markDirty) A.markDirty();
    console.log('§LIGHTING ' + which + '=' + val.toFixed(2));
  };

  // §S259: Shadow toggle — user-controlled in Sunglass panel
  A._shadowOn = false;
  A.toggleShadow = function() {
    A._shadowOn = !A._shadowOn;
    if (A._shadowOn) {
      // §S260: Full shadow setup on first enable — r160 needs this before any shadow render
      if (!A._shadowInited) {
        A.renderer.shadowMap.enabled = true;
        A.renderer.shadowMap.type = THREE.PCFShadowMap;
        A._shadowInited = true;
        console.log('§SHADOW_INIT shadowMap enabled + PCF');
      }
      A.sun.castShadow = true;
      // §S276b: Show Sky shader when shadows enabled
      if (A._sky) { A._sky.visible = true; if (A.updateSky) A.updateSky(45, 180); }
      // §S277c: Enable SSAO with shadows
      if (A.toggleSSAO) A.toggleSSAO(true);
    } else {
      A.sun.castShadow = false;
      // §S276b: Hide Sky when shadows off (unless TM sun cycle active)
      if (A._sky && !A._sunCycleActive) A._sky.visible = false;
      // §S277c: Disable SSAO with shadows
      if (A.toggleSSAO) A.toggleSSAO(false);
    }
    if (A._shadowOn) {
      // §S276b: Scale shadow frustum to full building envelope — no reduction.
      // LTU is 426m wide — 0.7x was clipping shadow edges.
      var _env = 300;
      var _bc = Object.values(A.buildingCentres)[0];
      if (_bc && _bc.envelope) _env = Math.ceil(_bc.envelope);
      _env = Math.max(_env, 50);  // minimum 50m frustum
      // Position sun relative to building centre — high enough for full coverage
      var _ctr = A.controls.target;
      A.sun.position.set(_ctr.x + _env * 0.8, _ctr.y + _env * 2, _ctr.z + _env * 0.6);
      A.sun.target.position.copy(_ctr);
      A.sun.target.updateMatrixWorld();
      var _sunDist = A.sun.position.distanceTo(_ctr);
      A.sun.shadow.mapSize.width = 4096;
      A.sun.shadow.mapSize.height = 4096;
      A.sun.shadow.camera.near = _sunDist * 0.05;
      A.sun.shadow.camera.far = _sunDist * 4;
      A.sun.shadow.camera.left = -_env;
      A.sun.shadow.camera.right = _env;
      A.sun.shadow.camera.top = _env;
      A.sun.shadow.camera.bottom = -_env;
      A.sun.shadow.bias = -0.0005;
      A.sun.shadow.camera.updateProjectionMatrix();
      console.log('§SHADOW_FRUSTUM env=' + _env + ' sunDist=' + _sunDist.toFixed(0) + ' near=' + (A.sun.shadow.camera.near).toFixed(0) + ' far=' + (A.sun.shadow.camera.far).toFixed(0));
      // Show ground plane at building base
      if (A.ground) {
        A.ground.visible = true;
        A.ground.receiveShadow = true;
        A._calcGroundY();
      }
      // §S277b: Chunked shadow traverse — don't block main thread on 122K scenes
      var _shadowList = [];
      A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _shadowList.push(o); });
      var _si = 0;
      (function _shadowChunk() {
        var end = Math.min(_si + 5000, _shadowList.length);
        for (; _si < end; _si++) { var o = _shadowList[_si]; if (o.visible) { o.castShadow = true; o.receiveShadow = true; } }
        if (_si < _shadowList.length) setTimeout(_shadowChunk, 0);
        else { A.renderer.shadowMap.needsUpdate = true; console.log('§SHADOW_TRAVERSE done count=' + _shadowList.length); }
      })();
    } else {
      var _unshadowList = [];
      A.scene.traverse(function(o) { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) _unshadowList.push(o); });
      var _ui = 0;
      (function _unshadowChunk() {
        var end = Math.min(_ui + 5000, _unshadowList.length);
        for (; _ui < end; _ui++) { _unshadowList[_ui].castShadow = false; _unshadowList[_ui].receiveShadow = false; }
        if (_ui < _unshadowList.length) setTimeout(_unshadowChunk, 0);
      })();
      if (A.ground) A.ground.visible = false;
    }
    var btn = document.getElementById('shadow-btn');
    btn.style.background = A._shadowOn ? '#ff8c00' : '#333';
    btn.style.color = A._shadowOn ? '#000' : '#aaa';
    if (A.markDirty) A.markDirty();
    console.log('§SHADOW toggle=' + A._shadowOn);
  };

  // §S260: Background toggle — white background for print/presentation
  A._whiteBg = false;
  A._savedClearColor = null;
  A.toggleBackground = function() {
    A._whiteBg = !A._whiteBg;
    if (A._whiteBg) {
      A._savedClearColor = A.renderer.getClearColor(new THREE.Color()).getHex();
      A.renderer.setClearColor(0xffffff);
      // §S260b: Ground also white for seamless print look, shadow still visible
      if (A.ground) {
        A._savedGroundColor = A.ground.material.color.getHex();
        A.ground.material.color.setHex(0xffffff);
      }
    } else {
      A.renderer.setClearColor(A._savedClearColor != null ? A._savedClearColor : 0x1a1a2e);
      if (A.ground) {
        A.ground.material.color.setHex(A._savedGroundColor != null ? A._savedGroundColor : 0x222233);
      }
    }
    var btn = document.getElementById('bg-btn');
    btn.style.background = A._whiteBg ? '#fff' : '#333';
    btn.style.color = A._whiteBg ? '#000' : '#aaa';
    if (A.markDirty) A.markDirty();
    console.log('§BACKGROUND toggle=' + A._whiteBg);
  };

  // §S259: Night Mode — moonlight outside, IFC light fixtures inside
  A._nightMode = false;
  A._nightLights = [];       // active THREE.PointLight objects
  A._nightFixtures = [];     // [{x,y,z}] from DB — IFC coordinates
  A._nightSaved = null;      // saved day settings
  var NIGHT_MAX_LIGHTS = 40; // §S277d: 40 lights — enough to cover visible storey
  var NIGHT_LIGHT_RANGE = 0; // §S277d: 0 = infinite range, decay handles falloff
  var NIGHT_LIGHT_INTENSITY = 5.0; // §S277d: fixed at fixture, no cam fade
  var NIGHT_LIGHT_DECAY = 1.2; // §S277d: gentle decay — lights reach far across halls

  A.toggleNightMode = function() {
    A._nightMode = !A._nightMode;
    var btn = document.getElementById('night-btn');
    var label = document.getElementById('night-val');

    if (A._nightMode) {
      // Save current lighting
      A._nightSaved = {
        sunI: A.sun.intensity, ambI: A.ambient.intensity, hemiI: A.hemi.intensity,
        exposure: A.renderer.toneMappingExposure,
        clearColor: A.renderer.getClearColor(new THREE.Color()).getHex(),
        sunColor: A.sun.color.getHex(), hemiSky: A.hemi.color.getHex(),
        ambColor: A.ambient.color.getHex()
      };
      // Moonlight: original values — worked well for SH
      A.sun.intensity = 0.15;
      A.sun.color.setHex(0x8899cc);
      A.ambient.intensity = 0.1;
      A.hemi.intensity = 0.08;
      A.hemi.color.setHex(0x222244);
      A.renderer.toneMappingExposure = 0.8;
      A.renderer.setClearColor(0x080818);
      // §S277c: Night fog — dark blue
      if (A.scene.fog) A.scene.fog.color.setRGB(0.03, 0.03, 0.09);
      // Show ground plane for night scene
      if (A.ground) {
        A.ground.visible = true;
        if (!A._whiteBg) A.ground.material.color.setHex(0x0a0a15);
        A._calcGroundY();
      }
      // Update sliders to reflect
      document.getElementById('sl-sun').value = 0.15;
      document.getElementById('sl-sun-val').textContent = '0.2';
      document.getElementById('sl-ambient').value = 0.1;
      document.getElementById('sl-ambient-val').textContent = '0.1';
      document.getElementById('sl-hemi').value = 0.08;
      document.getElementById('sl-hemi-val').textContent = '0.1';
      document.getElementById('sl-exposure').value = 0.8;
      document.getElementById('sl-exposure-val').textContent = '0.8';
      // Load IFC light fixtures from DB — fallback to storey centroids if none
      A._nightFixtures = [];
      var source = 'none';
      if (A.db) {
        try {
          // §S277c: Include IfcFlowTerminal + IfcElectricAppliance — most models lack IfcLightFixture
          var r = A.db.exec("SELECT t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance')");
          if (r.length && r[0].values.length > 0) {
            r[0].values.forEach(function(row) {
              A._nightFixtures.push({ x: row[0], y: row[1], z: row[2] });
            });
            source = 'IFC';
          }
        } catch(e) {}
        // §S259: Fallback — generate synthetic lights from storey centroids
        if (A._nightFixtures.length === 0) {
          try {
            var sr = A.db.exec("SELECT m.storey, AVG(t.center_x), AVG(t.center_y), AVG(t.center_z), MIN(t.center_x), MAX(t.center_x), MIN(t.center_y), MAX(t.center_y) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid GROUP BY m.storey");
            if (sr.length) {
              sr[0].values.forEach(function(row) {
                var cx = row[1], cy = row[2], cz = row[3];
                var xMin = row[4], xMax = row[5], yMin = row[6], yMax = row[7];
                var dx = (xMax - xMin) || 10, dy = (yMax - yMin) || 10;
                // Place a grid of lights per storey — one every ~15m
                var nx = Math.max(1, Math.ceil(dx / 15));
                var ny = Math.max(1, Math.ceil(dy / 15));
                for (var ix = 0; ix < nx; ix++) {
                  for (var iy = 0; iy < ny; iy++) {
                    var fx = xMin + (ix + 0.5) * (dx / nx);
                    var fy = yMin + (iy + 0.5) * (dy / ny);
                    A._nightFixtures.push({ x: fx, y: fy, z: cz + 1.5 });
                  }
                }
              });
              source = 'synthetic (' + sr[0].values.length + ' storeys)';
            }
          } catch(e) { console.warn('§NIGHT fallback query failed', e); }
        }
      }
      console.log('§NIGHT_MODE on fixtures=' + A._nightFixtures.length + ' source=' + source);
      // Place initial proximity lights
      A._nightUpdateLights();
      // Hook camera change to update proximity lights
      if (A.controls && !A._nightControlsListener) {
        var _nightLastCamPos = A.camera.position.clone();
        A._nightControlsListener = function() {
          var d2 = A.camera.position.distanceToSquared(_nightLastCamPos);
          if (d2 < 25) return;  // only update when camera moves >5m
          _nightLastCamPos.copy(A.camera.position);
          A._nightUpdateLights();
        };
        A.controls.addEventListener('change', A._nightControlsListener);
      }
      btn.style.background = '#ff8c00';
      btn.style.color = '#000';
      label.textContent = 'On — ' + A._nightFixtures.length + ' fixtures';
    } else {
      // Restore day
      if (A._nightSaved) {
        A.sun.intensity = A._nightSaved.sunI;
        A.sun.color.setHex(A._nightSaved.sunColor);
        A.ambient.intensity = A._nightSaved.ambI;
        A.ambient.color.setHex(A._nightSaved.ambColor);
        A.hemi.intensity = A._nightSaved.hemiI;
        A.hemi.color.setHex(A._nightSaved.hemiSky);
        A.renderer.toneMappingExposure = A._nightSaved.exposure;
        A.renderer.setClearColor(A._nightSaved.clearColor);
        // §S277c: Restore fog color to default
        if (A.scene.fog) A.scene.fog.color.setHex(0x1a1a2e);
        // Restore sliders
        document.getElementById('sl-sun').value = A._nightSaved.sunI;
        document.getElementById('sl-sun-val').textContent = A._nightSaved.sunI.toFixed(1);
        document.getElementById('sl-ambient').value = A._nightSaved.ambI;
        document.getElementById('sl-ambient-val').textContent = A._nightSaved.ambI.toFixed(1);
        document.getElementById('sl-hemi').value = A._nightSaved.hemiI;
        document.getElementById('sl-hemi-val').textContent = A._nightSaved.hemiI.toFixed(1);
        document.getElementById('sl-exposure').value = A._nightSaved.exposure;
        document.getElementById('sl-exposure-val').textContent = A._nightSaved.exposure.toFixed(1);
      }
      // Remove point lights
      A._nightLights.forEach(function(l) { A.scene.remove(l); l.dispose(); });
      A._nightLights = [];
      A._nightFixturePositions = null;
      // Unhook
      if (A.controls && A._nightControlsListener) {
        A.controls.removeEventListener('change', A._nightControlsListener);
        A._nightControlsListener = null;
      }
      // Restore ground
      if (A.ground && !A._shadowOn) {
        A.ground.visible = false;
        A.ground.material.color.setHex(A._whiteBg ? 0xffffff : 0x222233);
      }
      console.log('§NIGHT_MODE off');
      btn.style.background = '#1a1a3e';
      btn.style.color = '#aac';
      label.textContent = 'Off';
    }
    if (A.markDirty) A.markDirty();
  };

  A._nightUpdateLights = function() {
    if (!A._nightMode || !A._nightFixtures.length) return;
    // Convert all fixture positions to Three.js coords (cached after first call)
    if (!A._nightFixturePositions) {
      A._nightFixturePositions = A._nightFixtures.map(function(f) {
        return A.ifc2three(f.x, f.y, f.z);
      });
    }
    var allPos = A._nightFixturePositions;
    var camPos = A.camera.position;
    var needed;
    if (allPos.length <= NIGHT_MAX_LIGHTS) {
      // Small building — place ALL fixtures, no culling
      needed = allPos.map(function(p) { return { pos: p }; });
    } else {
      // §S277d: Spatial spread — pick evenly distributed fixtures, not just nearest to camera.
      // Sort by distance, then stride-sample so lights spread across the building.
      var sorted = allPos.map(function(p) {
        var dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
        return { pos: p, dist2: dx*dx + dy*dy + dz*dz };
      }).sort(function(a, b) { return a.dist2 - b.dist2; });
      // Take 10 nearest (room fill) + stride-sample the rest for distant coverage
      var nearCount = Math.min(10, sorted.length);
      needed = sorted.slice(0, nearCount);
      var remaining = sorted.slice(nearCount);
      var stride = Math.max(1, Math.floor(remaining.length / (NIGHT_MAX_LIGHTS - nearCount)));
      for (var si = 0; si < remaining.length && needed.length < NIGHT_MAX_LIGHTS; si += stride) {
        needed.push(remaining[si]);
      }
    }
    // Remove old lights
    A._nightLights.forEach(function(l) { A.scene.remove(l); l.dispose(); });
    A._nightLights = [];
    // §S277d: Fixed intensity at fixture positions — no camera-distance fade
    needed.forEach(function(f) {
      var light = new THREE.PointLight(0xffe4b5, NIGHT_LIGHT_INTENSITY, NIGHT_LIGHT_RANGE, NIGHT_LIGHT_DECAY);
      light.position.copy(f.pos);
      A.scene.add(light);
      A._nightLights.push(light);
    });
    if (A.markDirty) A.markDirty();
  };

  // Hover highlight
  A.hoverHighlight = null;
  const hoverMouse = new THREE.Vector2();
  let lastHoverTime = 0;
  function onMouseMove(e) {
    const now = performance.now();
    if (now - lastHoverTime < 100) return;
    lastHoverTime = now;

    hoverMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    hoverMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    A.raycaster.setFromCamera(hoverMouse, A.camera);

    const meshes = A.collectMeshes(o => o.isMesh && o.visible);
    const hits = A.raycaster.intersectObjects(meshes, false);

    if (A.hoverHighlight) {
      // S240: restore 4D phase colour if active, otherwise reset to black
      var _restoreHex = A.hoverHighlight._4dColor !== undefined ? A.hoverHighlight._4dColor : 0x000000;
      A.hoverHighlight.material.emissive.setHex(_restoreHex);
      A.hoverHighlight = null;
    }

    if (hits.length > 0 && A.guidMap[hits[0].object.id]) {
      A.hoverHighlight = hits[0].object;
      A.hoverHighlight.material.emissive.setHex(0x222222);
      A.canvas.style.cursor = 'pointer';
    } else {
      A.canvas.style.cursor = 'default';
    }
  }
  A.canvas.addEventListener('mousemove', onMouseMove);
}
