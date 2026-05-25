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
  // §S279: Restore original materials — clear isolation first so origMats are clean
  A._restoreSunglass = function() {
    if (A._pickIsolated && A._restoreIsolation) A._restoreIsolation();
    A._sunglassBackups.forEach(function(b) { b.mesh.material = b.origMat; });
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

  // §S279: Single-pass collection — one scene traverse instead of two
  A._collectAllMeshes = function() {
    return A.collectMeshes(function(o) {
      return (o.isMesh && !o.userData.isInstanced) || o.isInstancedMesh;
    });
  };

  // §S279: Clone material for palette — reset isolation dimming on clone so colors show
  A._recolorMesh = function(mesh, color) {
    if (!mesh.material || !mesh.material.color) return;  // skip ShaderMaterial, lines, etc.
    A._sunglassBackups.push({ mesh: mesh, origMat: mesh.material });
    var newMat = mesh.material.clone();
    newMat.color.copy(color);
    // If source was isolation-dimmed, restore full opacity on the palette clone
    if (newMat.userData && newMat.userData._pickDimmed) {
      newMat.opacity = 1;
      newMat.transparent = false;
      delete newMat.userData._pickDimmed;
    }
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

    // §S279: Boosted saturation palettes — visible from tick 1 on white/grey buildings
    var warmPastel = [
      [0.05, 0.40, 0.78], [0.12, 0.40, 0.74], [0.08, 0.45, 0.71],  // peach, sand, cream
      [0.55, 0.35, 0.76], [0.42, 0.40, 0.72], [0.15, 0.37, 0.80],  // sage, olive, wheat
      [0.02, 0.35, 0.66], [0.58, 0.43, 0.68], [0.10, 0.50, 0.64],  // coral, teal, amber
      [0.48, 0.37, 0.74]                                              // moss
    ];
    var coolPastel = [
      [0.55, 0.45, 0.74], [0.62, 0.40, 0.71], [0.50, 0.50, 0.68],  // sky, steel, seafoam
      [0.45, 0.43, 0.76], [0.58, 0.47, 0.66], [0.68, 0.37, 0.72],  // mint, teal, slate
      [0.52, 0.40, 0.64], [0.60, 0.45, 0.70], [0.48, 0.50, 0.62],  // ocean, mist, stone
      [0.65, 0.43, 0.68]                                              // ice
    ];
    var earthTone = [
      [0.08, 0.55, 0.62], [0.05, 0.60, 0.52], [0.10, 0.50, 0.67],  // terracotta, sienna, tan
      [0.12, 0.65, 0.47], [0.15, 0.48, 0.57], [0.03, 0.58, 0.55],  // rust, clay, bronze
      [0.07, 0.52, 0.59], [0.55, 0.45, 0.55], [0.20, 0.60, 0.49],  // copper, olive, khaki
      [0.02, 0.70, 0.42]                                              // mahogany
    ];

    // §S279: sub starts at 2 so tick=1 already has visible contrast
    function applyPalette(groups, keys, palette, sub) {
      sub = sub + 2;
      keys.forEach(function(k, i) {
        var p = palette[i % palette.length];
        var color = new THREE.Color().setHSL(p[0], Math.min(p[1] + sub * 0.04, 1), Math.max(p[2] - sub * 0.025, 0.3));
        groups[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
    }

    // §S279: Compressed ranges — every tick position visually distinct
    //  1-8   Warm/class     9-16  Cool/class    17-24 Earth/class
    // 25-32  Warm/storey   33-40  Cool/storey   41-48 Earth/storey
    // 49-56  Warm/disc     57-64  Cool/disc     65-72 Earth/disc
    // 73-82  Zebra         83-90  Mono          91-96 Gradient
    // 97-100 HARD

    if (tick <= 8) {
      phase = 'Warm'; strategy = 'type';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, warmPastel, tick - 1);
      strategy = keys.length + ' types';

    } else if (tick <= 16) {
      phase = 'Cool'; strategy = 'type';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, coolPastel, tick - 9);
      strategy = keys.length + ' types';

    } else if (tick <= 24) {
      phase = 'Earth'; strategy = 'type';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      applyPalette(g, keys, earthTone, tick - 17);
      strategy = keys.length + ' types';

    } else if (tick <= 32) {
      phase = 'Storey warm';
      var g = A._groupBy(allMeshes, 'storey');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, warmPastel, tick - 25);
      strategy = keys.length + ' storeys';

    } else if (tick <= 40) {
      phase = 'Storey cool';
      var g = A._groupBy(allMeshes, 'storey');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, coolPastel, tick - 33);
      strategy = keys.length + ' storeys';

    } else if (tick <= 48) {
      phase = 'Storey earth';
      var g = A._groupBy(allMeshes, 'storey');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, earthTone, tick - 41);
      strategy = keys.length + ' storeys';

    } else if (tick <= 56) {
      phase = 'Disc warm';
      var g = A._groupBy(allMeshes, 'disc');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, warmPastel, tick - 49);
      strategy = keys.length + ' discs';

    } else if (tick <= 64) {
      phase = 'Disc cool';
      var g = A._groupBy(allMeshes, 'disc');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, coolPastel, tick - 57);
      strategy = keys.length + ' discs';

    } else if (tick <= 72) {
      phase = 'Disc earth';
      var g = A._groupBy(allMeshes, 'disc');
      var keys = Object.keys(g).sort();
      applyPalette(g, keys, earthTone, tick - 65);
      strategy = keys.length + ' discs';

    } else if (tick <= 82) {
      // ── Zebra — IFC class alternates warm/cool ──
      phase = 'Zebra';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      var t = (tick - 73) / 9;
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
      // ── Monochrome — single hue, IFC class by lightness ──
      phase = 'Mono';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      var hue = ((tick - 83) / 7) * 0.15;
      keys.forEach(function(k, i) {
        var l = 0.30 + (i / Math.max(keys.length - 1, 1)) * 0.50;
        var color = new THREE.Color().setHSL(hue, 0.50, l);
        g[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
      strategy = keys.length + ' types';

    } else if (tick <= 96) {
      // ── Gradient — smooth hue sweep across all classes ──
      phase = 'Gradient';
      var g = A._groupBy(allMeshes, 'ifcClass');
      var keys = Object.keys(g).sort(function(a, b) { return g[b].length - g[a].length; });
      var hueStart = (tick - 91) * 0.17;  // each tick shifts base hue
      keys.forEach(function(k, i) {
        var h = (hueStart + i / Math.max(keys.length, 1)) % 1;
        var color = new THREE.Color().setHSL(h, 0.55, 0.60);
        g[k].forEach(function(m) { A._recolorMesh(m, color); });
      });
      strategy = keys.length + ' types';

    } else {
      // ── 97-100: HARD — full saturation, dark, punchy, golden-angle spacing ──
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
  var NIGHT_MAX_LIGHTS = 12; // §S277d: 12 POL — fills rooms properly
  var NIGHT_LIGHT_RANGE = 30; // §S277d: 30m radius
  var NIGHT_LIGHT_INTENSITY = 1.5; // §S277d: brighter — 4 lights need to cover more
  var NIGHT_LIGHT_DECAY = 1.5; // §S277d: gentler decay — reaches further per light

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
      A.ambient.intensity = 0.35;  // §S279: brighter moonlight — exterior surfaces visible from outside
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
      document.getElementById('sl-ambient').value = 0.35;
      document.getElementById('sl-ambient-val').textContent = '0.4';
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
      // §S277d: Make light fixture materials emissive — glow at any distance, zero cost.
      // Uses matCache keys (rgba|ifcClass) — catches ALL material surfaces per fixture.
      var _glowCount = 0;
      A._nightGlowMats = [];
      // §S279: Glow ALL classes that contain light/LED/lamp elements — not just IfcLightFixture
      var _glowClasses = ['IfcLightFixture'];
      if (A.db) {
        try {
          var lr = A.db.exec("SELECT DISTINCT ifc_class FROM elements_meta WHERE LOWER(element_name) LIKE '%light%' OR LOWER(element_name) LIKE '%lamp%' OR LOWER(element_name) LIKE '%led%' OR LOWER(element_name) LIKE '%luminaire%' OR LOWER(element_name) LIKE '%ceiling fan%'");
          if (lr.length && lr[0].values.length > 0) {
            lr[0].values.forEach(function(row) {
              if (row[0] && _glowClasses.indexOf(row[0]) < 0) _glowClasses.push(row[0]);
            });
          }
        } catch(e) {}
      }
      // Fallback if no named lights found at all
      if (_glowClasses.length === 1) {
        _glowClasses.push('IfcFlowTerminal', 'IfcElectricAppliance');
        source += '+fallback';
      }
      // Apply emissive to ALL matCache entries matching glow classes
      var mc = A._matCache || {};
      for (var mk in mc) {
        var isLight = false;
        for (var gi = 0; gi < _glowClasses.length; gi++) {
          if (mk.indexOf(_glowClasses[gi]) >= 0) { isLight = true; break; }
        }
        if (!isLight) continue;
        var m = mc[mk];
        if (m && m.emissive) {
          A._nightGlowMats.push({ mat: m, origE: m.emissive.getHex(), origEI: m.emissiveIntensity });
          m.emissive.setHex(0xffe4b5);
          m.emissiveIntensity = 0.8;
          m.needsUpdate = true;
          _glowCount++;
        }
      }
      console.log('§NIGHT_MODE on fixtures=' + A._nightFixtures.length + ' source=' + source + ' glowMeshes=' + _glowCount);
      // §S277d: 4 POL follow camera — subtle ambient on nearby walls/floor
      A._nightUpdateLights();
      if (A.controls && !A._nightControlsListener) {
        var _nightLastCamPos = A.camera.position.clone();
        A._nightControlsListener = function() {
          var d2 = A.camera.position.distanceToSquared(_nightLastCamPos);
          if (d2 < 25) return;
          _nightLastCamPos.copy(A.camera.position);
          A._nightUpdateLights();
        };
        A.controls.addEventListener('change', A._nightControlsListener);
      }
      btn.style.background = '#ff8c00';
      btn.style.color = '#000';
      label.textContent = 'On — ' + A._nightFixtures.length + ' fixtures';
    } else {
      // §S277d: Restore fixture emissive glow
      if (A._nightGlowMats) {
        A._nightGlowMats.forEach(function(g) {
          g.mat.emissive.setHex(g.origE);
          g.mat.emissiveIntensity = g.origEI;
          g.mat.needsUpdate = true;
        });
        A._nightGlowMats = null;
      }
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
      A._nightLights.forEach(function(l) {
        A.scene.remove(l);
        if (l.shadow && l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
        l.dispose();
      });
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
    var _tgt = A.controls ? A.controls.target : camPos;
    var needed;
    if (allPos.length <= NIGHT_MAX_LIGHTS - 2) {
      // Small building — place ALL fixtures, no culling
      needed = allPos.map(function(p) { return { pos: p }; });
    } else {
      // §S277d: Nearest 10 fixtures to orbit target (stable)
      var sorted = allPos.map(function(p) {
        var dx = p.x - _tgt.x, dy = p.y - _tgt.y, dz = p.z - _tgt.z;
        return { pos: p, dist2: dx*dx + dy*dy + dz*dz };
      }).sort(function(a, b) { return a.dist2 - b.dist2; });
      needed = sorted.slice(0, NIGHT_MAX_LIGHTS - 2);
    }
    // Remove old lights
    A._nightLights.forEach(function(l) {
      A.scene.remove(l);
      if (l.shadow && l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
      l.dispose();
    });
    A._nightLights = [];
    // §S277d: Fixed intensity at fixture positions
    needed.forEach(function(f) {
      var light = new THREE.PointLight(0xffe4b5, NIGHT_LIGHT_INTENSITY, NIGHT_LIGHT_RANGE, NIGHT_LIGHT_DECAY);
      light.position.copy(f.pos);
      A.scene.add(light);
      A._nightLights.push(light);
    });
    // §S279: Camera-near POL — lights what you're staring at (exterior and interior)
    // Place at orbit target = the surface you're looking at
    var tgtLight = new THREE.PointLight(0xffe4b5, NIGHT_LIGHT_INTENSITY, NIGHT_LIGHT_RANGE, NIGHT_LIGHT_DECAY);
    tgtLight.position.copy(_tgt);
    A.scene.add(tgtLight);
    A._nightLights.push(tgtLight);
    // §S279: Cam-room POL — 2m ahead of camera toward target, lights the room you're in
    var camLight = new THREE.PointLight(0xffe4b5, 0.8, 12, 1.5);
    var dir = _tgt.clone().sub(camPos);
    var len = dir.length();
    if (len > 2) dir.multiplyScalar(2 / len);  // clamp to 2m ahead
    camLight.position.copy(camPos).add(dir);
    A.scene.add(camLight);
    A._nightLights.push(camLight);
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
