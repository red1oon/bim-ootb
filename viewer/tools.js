// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// tools.js — X-Ray, wireframe, section cut, screenshot, fullscreen, theme, 4D/5D export
function setupTools(A) {
  // §S260c: Ground Y calculation — shared by shadow + night mode
  // Strategy: find the ground-floor slab by storey name, fall back to lowest-storey largest slab.
  // Never picks roof/upper slabs. Ground = bottom face of the GF slab.
  A._calcGroundY = function() {
    // §S285: city mode anchors every building's ground floor to y=0 (offZ = modelOffset.z
    // - arcGroundZ in city.js). The per-building slab probe below uses the old
    // (z - modelOffset.z) convention, which would place the shadow/night ground plane at
    // the wrong height → buildings float above it. In city mode the plane is just y=0.
    if (A.CITY_URL) {
      if (A.ground) A.ground.position.y = 0;
      console.log('§GROUND_Y city y=0 (ground-anchored)');
      return;
    }
    if (!A.db || !A.ground) return;
    var _gLvl = 0, _gSrc = '?';
    try {
      // Step 1: Try storey name matching for ground floor slabs.
      // §GROUND_Y_LOWEST_GF (2026-07-17): among the largest few GF-named slabs, take the LOWEST,
      // not simply the largest-area one. A "ground floor" name can appear at multiple elevations
      // in federated / mixed-datum models — BimWhale_Advanced's "Level 1" slabs sit at z=27.85,
      // two-thirds up a building spanning -8..46, so the old largest-area pick placed the ground
      // plane mid-building and the model rendered half-buried (user-reported). Ground = the LOWEST
      // floor plate bearing a ground-floor name. Mirrors Step 2's lowest-of-top5 selection, just
      // scoped to the storey-name filter; identical result for normal buildings (their GF plate is
      // both largest AND lowest), only differs — correctly — in the mixed-datum case.
      var gfNames = "('Ground Floor','Ground','First Floor','1st Floor','Level 0','Level 00','Level 1','GF','L0','L00','L1','00','0','1F','EG','Erdgeschoss','Storey 1','Plan 1','VÅN 1','VÅNING 1','1. OG','Rez-de-chaussée','RC','Planta Baja','PB','Piso 0','Begane grond','BG','GROUND FLOOR LEVEL','Ground Lev','Aras Tanah','u.etg')";
      var zr = A.db.exec(
        "SELECT t.center_z - t.bbox_z/2 AS bottom, t.bbox_x * t.bbox_y AS area, t.center_z, m.storey " +
        "FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid " +
        "WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 " +
        "AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
        "AND m.storey IN " + gfNames + " ORDER BY area DESC LIMIT 5"
      );
      if (zr.length && zr[0].values.length > 0) {
        var gfBottom = null, gfCz = Infinity, gfStorey = '';
        for (var gi = 0; gi < zr[0].values.length; gi++) {
          var gfr = zr[0].values[gi];
          if (gfr[2] < gfCz) { gfCz = gfr[2]; gfBottom = gfr[0]; gfStorey = gfr[3]; }
        }
        if (gfBottom !== null) { _gLvl = gfBottom; _gSrc = 'gf-storey-slab(' + gfStorey + ')'; }
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
      // §CPE_GHOST_GROUND: the plane's own IFC datum, published so the buildup can ask "is anything
      // placed at or above the ground yet?" against the SAME number that positioned the plane. A
      // second, independently-derived ground height would be a way for the ghost to disagree with
      // what it is ghosting.
      A.groundIfcZ = _gLvl;
      console.log('§GROUND_Y src=' + _gSrc + ' z=' + _gLvl.toFixed(2) + ' y=' + p.y.toFixed(2));
    } catch(e) { console.warn('§GROUND_Y error', e); }
  };

  // §S280g: Ground texture engine — config-driven (ground_config.json), selectable in the
  // Palette/Sunglass panel. Default applies when Shadow is turned ON. Static photo on the
  // existing ground plane → zero per-frame cost. See docs/GROUND_SHADOW_BAKING.md §2.A.
  A._groundCfgDefault = {
    default: 'grass', repeat: 64, anisotropy: 8,
    options: [
      { key: 'none',  label: 'None',  src: null },
      { key: 'grass', label: 'Grass', src: 'textures/ground/grass_1k.jpg' },
      { key: 'earth', label: 'Earth', src: 'textures/ground/earth_1k.jpg' },
      { key: 'paved', label: 'Paved', src: 'textures/ground/paved_1k.jpg' }
    ]
  };
  A._groundConfig = null;
  A._groundTexCache = {};        // key -> THREE.Texture (lazy, cached after first load)
  A._groundTexKey = 'none';      // active option
  A._groundUserPicked = false;   // true once user clicks a Ground option (suppresses auto-default)
  A._groundSolidColor = 0x222233;// last mode-intended flat color (for 'none' / night dimming)

  A._loadGroundConfig = function() {
    if (A._groundConfig) return Promise.resolve(A._groundConfig);
    return fetch('ground_config.json?v=1')
      .then(function(r) { return r.json(); })
      .then(function(j) { A._groundConfig = j; return j; })
      .catch(function(e) {
        console.warn('§GROUND_CFG fallback (fetch failed: ' + (e && e.message) + ')');
        A._groundConfig = A._groundCfgDefault; return A._groundConfig;
      });
  };

  // Set ground flat color, but respect an active photo texture: color MULTIPLIES the map,
  // so keep it white (photo true) and only dim — never blacken — for night-dark targets.
  //
  // §GROUND_ALBEDO (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §GROUND_DARK_RETHINK idea 1,
  // 2026-07-28) — Witness: W-GROUND-ALBEDO. White here is the multiplicative IDENTITY, not a
  // ceiling: `diffuseColor = diffuse * map`, `diffuse` is a plain vec3 uniform and THREE.Color is
  // not clamped to 1, so a value above 1 raises the ground's ALBEDO. That matters because the
  // ground map's own measured linear-average luminance is 0.155 (paved_1k.jpg = Poly Haven
  // concrete_floor_01) while every Layer-3 material texture is renormalized to ~1.0 by its
  // TRIPLANAR_MAT.normFactor — so the ground is ~5.5x darker in albedo than the wall standing on
  // it, on top of the 9.5x from the 6-degree dusk sun. 0.155 is asphalt; the scene wants a plaza
  // (real dry concrete is 0.25-0.40).
  //
  // WHY A GAIN AND NOT MORE FILL LIGHT — this is the whole point, and both previous attempts got
  // it backwards. The emissive add (§PHOTO_GROUND_WHITE_REVERTED) and the hemi/ambient boost
  // (§PHOTO_CONTRAST_DIALBACK, 1.6/1.3 -> 1.25/1.15) are ADDITIVE: they add the same constant to
  // lit and shadowed pixels, so the shadow's contrast RATIO collapses — that is "Shadows? None on
  // the ground", reported both times. Albedo is MULTIPLICATIVE: lit and shadowed ground scale by
  // the SAME factor, so lit/shadow is algebraically unchanged (exactly, pre-tonemap; ACES then
  // compresses the top end, which softens the high values but never flattens the ratio).
  // Default 1.0 — navigation and day render byte-identical to before; only the photoshoot lifts it.
  A._groundAlbedoGain = 1.0;
  A._setGroundColor = function(hex) {
    if (!A.ground) return;
    A._groundSolidColor = hex;   // remember the mode's intended flat color (for 'none')
    var hasMap = A._groundTexKey && A._groundTexKey !== 'none';
    if (hasMap) {
      var sum = (hex & 0xff) + ((hex >> 8) & 0xff) + ((hex >> 16) & 0xff);
      A.ground.material.color.setHex(sum < 0x60 ? 0x555566 : 0xffffff);  // dim at night, else true
      // multiplyScalar, never a >1 hex: setHex runs the sRGB->linear transfer, so scaling AFTER it
      // is unambiguous linear gain. Only lifts the photo-true (white) branch — the night-dim
      // branch stays dim, since a dark ground at night is deliberate, not the complaint.
      var g = A._groundAlbedoGain;
      if (g && g !== 1.0 && sum >= 0x60) A.ground.material.color.multiplyScalar(g);
    } else {
      A.ground.material.color.setHex(hex);
    }
    A.ground.material.needsUpdate = true;
  };

  A._applyGroundTexture = function(key) {
    if (!A.ground) return;
    A._groundTexKey = key;
    var cfg = A._groundConfig || A._groundCfgDefault;
    var opt = (cfg.options || []).filter(function(o) { return o.key === key; })[0];
    if (!opt || !opt.src) {                 // 'none' → clear map, restore flat color
      A.ground.material.map = null;
      A._setGroundColor(A._groundSolidColor);
      console.log('§GROUND_MAP key=none map=cleared color=0x' + A._groundSolidColor.toString(16));
      if (A._refreshGroundBtns) A._refreshGroundBtns();
      if (A.markDirty) A.markDirty();
      return;
    }
    var repeat = cfg.repeat || 64, aniso = cfg.anisotropy || 8;
    function applyTex(tex) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      else if ('encoding' in tex) tex.encoding = THREE.sRGBEncoding;
      try { tex.anisotropy = Math.min(aniso, A.renderer.capabilities.getMaxAnisotropy()); } catch(e) {}
      A.ground.material.map = tex;
      A._setGroundColor(A._groundSolidColor);  // photo true (or dimmed at night)
      A.ground.material.needsUpdate = true;
      A.ground.visible = true;                 // preview even if shadow is off
      A._calcGroundY();
      console.log('§GROUND_MAP key=' + key + ' src=' + opt.src + ' repeat=' + repeat + ' aniso=' + (tex.anisotropy || 0));
      if (A._refreshGroundBtns) A._refreshGroundBtns();
      if (A.markDirty) A.markDirty();
    }
    if (A._groundTexCache[key]) { applyTex(A._groundTexCache[key]); return; }
    var loader = new THREE.TextureLoader();
    loader.load(opt.src, function(tex) { A._groundTexCache[key] = tex; applyTex(tex); },
      undefined, function() { console.warn('§GROUND_MAP load FAIL key=' + key + ' src=' + opt.src); });
  };

  // Public: pick a ground texture by key (Palette panel buttons call this).
  A.setGroundTexture = function(key) {
    A._groundUserPicked = (key != null);
    A._loadGroundConfig().then(function() { A._applyGroundTexture(key); });
  };

  // Apply config default (called when Shadow turns ON, unless user already picked).
  A.applyDefaultGroundTexture = function() {
    A._loadGroundConfig().then(function(cfg) {
      if (A._groundUserPicked) return;
      A._applyGroundTexture(cfg.default || 'grass');
    });
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

  // X-Ray — transparent blending on all materials
  // §S271b: Optimized — update unique materials via _matCache, disable sortObjects during X-Ray.
  A.xrayOn = false;
  A.toggleXray = function() {
    A.xrayOn = !A.xrayOn;
    var cache = A._matCache || {};
    var keys = Object.keys(cache);
    if (keys.length) {
      for (var i = 0; i < keys.length; i++) {
        var mat = cache[keys[i]];
        if (!mat) continue;
        if (A.xrayOn) {
          mat._origTransparent = mat.transparent;
          mat._origOpacity = mat.opacity;
          mat._origSide = mat.side;
          mat.transparent = true;
          mat.opacity = 0.3;
          mat.side = THREE.DoubleSide;
        } else {
          mat.transparent = mat._origTransparent !== undefined ? mat._origTransparent : false;
          mat.opacity = mat._origOpacity !== undefined ? mat._origOpacity : 1;
          mat.side = mat._origSide !== undefined ? mat._origSide : THREE.FrontSide;
        }
        mat.needsUpdate = true;
      }
    }
    if (!keys.length && A.scene) {
      A.scene.traverse(function(obj) {
        if (!obj.isMesh || !obj.material) return;
        var m = obj.material;
        if (A.xrayOn) {
          m._origTransparent = m.transparent;
          m._origOpacity = m.opacity;
          m._origSide = m.side;
          m.transparent = true; m.opacity = 0.3; m.side = THREE.DoubleSide;
        } else {
          m.transparent = m._origTransparent !== undefined ? m._origTransparent : false;
          m.opacity = m._origOpacity !== undefined ? m._origOpacity : 1;
          m.side = m._origSide !== undefined ? m._origSide : THREE.FrontSide;
        }
        m.needsUpdate = true;
      });
    }
    if (A.renderer) A.renderer.sortObjects = !A.xrayOn;
    if (A.markDirty) A.markDirty();
    A.status.textContent = A.xrayOn ? 'X-Ray ON' : 'X-Ray OFF';
    console.log('§XRAY on=' + A.xrayOn + ' mats=' + (keys.length || 'scene'));
  };

  // Alt+Z 3-state cycle: Off → X-Ray → Bbox(ghost) → Off. Replaces the old separate Alt+X
  // (deleted — X-Ray and Bbox are mutually exclusive views of the same "see through" concept,
  // no reason both could be on independently). toggleGhostXray lives in the lazy-loaded
  // navigate_find.js — same load-on-demand fallback as the old Alt+X handler used.
  A.cycleXrayBboxMode = function() {
    var ghostOn = typeof window.ghostXrayOn === 'function' && window.ghostXrayOn();
    var _toggleGhost = function() {
      if (typeof window.toggleGhostXray === 'function') window.toggleGhostXray();
      else if (A.loadNavigate) A.loadNavigate().then(function() { if (window.toggleGhostXray) window.toggleGhostXray(); });
    };
    if (!A.xrayOn && !ghostOn) {
      A.toggleXray();                       // Off → X-Ray
      console.log('§XRAY_CYCLE off→xray');
    } else if (A.xrayOn && !ghostOn) {
      A.toggleXray();                       // X-Ray → Bbox
      _toggleGhost();
      console.log('§XRAY_CYCLE xray→bbox');
    } else {
      if (A.xrayOn) A.toggleXray();         // Bbox (or any stray combo) → Off
      if (ghostOn) _toggleGhost();
      console.log('§XRAY_CYCLE →off');
    }
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
    // Implementing HISTORY_SESSION_EVENTS.md §RESUME — Witness: W-Z-EVENTS. The COMMON section path
    // (key 'x' / section-btn → toggleSection → here) never recorded; only saveCut did. One dot per real
    // toggle/axis apply; scrub-restores reach here too but are gated inside recordEvent (isApplying).
    if (window.UniversalHistory && UniversalHistory.recordEvent) {
      UniversalHistory.recordEvent('SECTION_CUT', 'Section ' + A.sectionAxis, { axis: A.sectionAxis });
    }
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
    // §FULLSCREEN: requestFullscreen()/exitFullscreen() return promises. F11 is
    // browser-reserved (Firefox does native fullscreen), so the programmatic request
    // from that same handler is denied → unhandled rejection ("Uncaught (in promise)
    // TypeError: Fullscreen request denied"). Swallow it — native F11 still works.
    try {
      var p = !document.fullscreenElement
        ? document.documentElement.requestFullscreen()
        : document.exitFullscreen();
      if (p && p.catch) p.catch(function(e) { console.warn('§FULLSCREEN denied: ' + (e && e.message)); });
    } catch (e) { console.warn('§FULLSCREEN error: ' + (e && e.message)); }
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
    if (!A._whiteBg) A._setGroundColor(A.lightTheme ? 0xdddddd : 0x222233);
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
    // §S281: legacy toolbar btn removed — pill registry now owns highlight (isActive→A.sunglassOn). Guard for null.
    var btn = document.getElementById('sunglass-btn');
    if (btn) {
      btn.style.background = visible ? '#444' : '#ff8c00';
      btn.style.color = visible ? '#fff' : '#000';
    }
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
    if (!mesh.material || !mesh.material.color) return;  // §S280f: restore S279 guard — skip ShaderMaterial (Sky), lines, colorless mats
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
    A._ambienceTick = tick;   // §-tap palette field reads this (one scalar = the whole palette state)
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
    if (A.markDirty) A.markDirty();  // §S287: palette recolor must wake the on-demand render gate (S286)
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
  // §SHADOW-GROUND MERGE (PILL_DRAWER_REORGANIZATION.md, 2026-07-05): A.toggleShadow is now a
  // 4-state cycle Off→Grass→Earth→Paved→Off — replaces the old boolean Shadow toggle AND the 4
  // separate Ground buttons with ONE function + one visual swatch (panels.js
  // _buildShadowGroundRow). id/key('h')/isActive wiring in panels.js is UNCHANGED — only this
  // function's BODY changed, so the 'h' shortcut keeps working untouched. The renderer/sun/sky/
  // SSAO/frustum/shadow-traverse setup below is verbatim from the old boolean version, just
  // gated to run on the Off→On and On→Off EDGES only (not on every Grass/Earth/Paved re-tint,
  // which only needs to swap the ground texture — shadow map itself doesn't change).
  A._shadowOn = false;
  A._shadowGroundKey = 'off';                 // 'off' | 'grass' | 'earth' | 'paved'
  var _SG_CYCLE = ['off', 'grass', 'earth', 'paved'];
  A.toggleShadow = function() {
    var prev = A._shadowGroundKey || 'off';
    var next = _SG_CYCLE[(_SG_CYCLE.indexOf(prev) + 1) % _SG_CYCLE.length];
    A._shadowGroundKey = next;
    var turningOn = (prev === 'off' && next !== 'off');
    var turningOff = (prev !== 'off' && next === 'off');
    A._shadowOn = (next !== 'off');

    if (turningOn) {
      // §S260: Full shadow setup on first enable — r160 needs this before any shadow render
      if (!A._shadowInited) {
        A.renderer.shadowMap.enabled = true;
        A.renderer.shadowMap.type = THREE.PCFShadowMap;
        // §S288 STATIC-SHADOW GATE: sun + building are static, yet THREE's default
        // shadowMap.autoUpdate=true re-rendered the 4096² shadow map as a full extra
        // geometry pass EVERY awake frame (orbit/damping/fly) → the CPU/GPU fan. Gate it
        // OFF so shadows render only when needsUpdate fires (toggle-on traverse §690,
        // TM sun-move/scene-step). window._shadowAutoUpdate=true restores the old
        // per-frame behavior for A/B measurement (§SHADOW_PERF).
        A.renderer.shadowMap.autoUpdate = (window._shadowAutoUpdate === true);
        A._shadowInited = true;
        console.log('§SHADOW_INIT shadowMap enabled + PCF autoUpdate=' + A.renderer.shadowMap.autoUpdate);
      }
      A.sun.castShadow = true;
      // §S276b: Show Sky shader when shadows enabled
      if (A._sky) { A._sky.visible = true; if (A.updateSky) A.updateSky(45, 180); }
      // §S277c: Enable SSAO with shadows
      if (A.toggleSSAO) A.toggleSSAO(true);
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
      // §S288: 2048² — quarters the texel cost of every shadow render (toggle-on +
      // TM sun-cycle, where the sun moves each tick so the map DOES re-render per frame).
      // Architecturally indistinguishable from 4096² at building scale.
      A.sun.shadow.mapSize.width = 2048;
      A.sun.shadow.mapSize.height = 2048;
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
        // §S288b: refresh the static shadow map after EVERY chunk, not just the last.
        // With autoUpdate=false the depth texture is only (re)rendered on needsUpdate;
        // a frame that renders mid-traverse — casters already tagged castShadow, materials
        // compiled with a shadow sampler — would otherwise sample an unrendered shadow map
        // ("not a depth texture with TEXTURE_COMPARE_MODE" WebGL warning, one frame of bad
        // shading). Setting needsUpdate per chunk guarantees the texture exists before sampling.
        A.renderer.shadowMap.needsUpdate = true;
        if (A.markDirty) A.markDirty();
        if (_si < _shadowList.length) setTimeout(_shadowChunk, 0);
        else { console.log('§SHADOW_TRAVERSE done count=' + _shadowList.length); }
      })();
    }
    if (turningOff) {
      A.sun.castShadow = false;
      // §S276b: Hide Sky when shadows off (unless TM sun cycle active)
      if (A._sky && !A._sunCycleActive) A._sky.visible = false;
      // §S277c: Disable SSAO with shadows
      if (A.toggleSSAO) A.toggleSSAO(false);
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
    // §SHADOW-GROUND MERGE: apply this cycle state's ground texture — Grass/Earth/Paved on,
    // or clear back to None on Off (matches the spec's "OFF = Ground=None + Shadow off").
    if (A.setGroundTexture) A.setGroundTexture(next === 'off' ? 'none' : next);
    var btn = document.getElementById('shadow-btn');
    if (btn) { btn.style.background = A._shadowOn ? '#ff8c00' : '#333'; btn.style.color = A._shadowOn ? '#000' : '#aaa'; }
    if (A.markDirty) A.markDirty();
    console.log('§SHADOW_GROUND cycle=' + next + ' shadow=' + A._shadowOn);
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
        A._setGroundColor(0xffffff);
      }
    } else {
      A.renderer.setClearColor(A._savedClearColor != null ? A._savedClearColor : 0x1a1a2e);
      if (A.ground) {
        A._setGroundColor(A._savedGroundColor != null ? A._savedGroundColor : 0x222233);
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
  // §NIGHT_STILL_LIGHTS (2026-07-27, user: "alt-s is quite impressive if more lights chances").
  // 12 is a NAVIGATION budget — every point light costs per-pixel work on every lit material every
  // frame, so 12 is what a 60fps orbit can carry. A frozen still has no frame budget to protect: it
  // renders once and then sits there. So the cap is a variable the still can raise, not a constant.
  // Read through A._nightMaxLights everywhere below so raising it and re-running _nightUpdateLights
  // is all that is needed.
  // §NIGHT_LIGHT_BUDGET_UP (2026-08-07, user: "can we increase them since we got speed? 24 be
  // good" / "during alt-s throw all in, up to 50 as it is baking") — raised from 12/48. Also
  // RE-ARMS A._nightStillBoost, which shipped OFF by default (§NIGHT_STILL_LIGHTS below in
  // effects.js — measured +2064ms on Hospital, judged not worth it at the time). User directive
  // this session explicitly accepts that cost ("we got speed... without DLOD we can scale with
  // some more cost") — so the still budget bump below is only real if this is also true.
  // §NIGHT_MOBILE_MIN_PL (2026-08-08, user: mobile hangs, "maybe just one set of PL") — mobile CPUs
  // pay the same per-light shader-recompile-on-count-change cost as desktop (see §RAM section above)
  // with far less headroom. One light (following the camera via the existing nearest-fixture
  // selection in _nightUpdateLights) instead of 24 removes 23/24 of that cost on mobile specifically;
  // desktop nav is unaffected. A._isMobile is set by setupStreaming, which runs before setupTools
  // (see main.js _mods order), so it's already valid here.
  A._nightMaxLightsNav = A._isMobile ? 1 : 30;   // navigation budget — the RESET target (effects.js
                                    // reads this, not a literal, so tuning this one number can't
                                    // silently break the still's nav-budget handback)
  A._nightMaxLights = A._nightMaxLightsNav;  // CURRENT budget — swapped to the still value during Alt+S
  A._nightMaxLightsStill = 50;     // frozen-still budget — paid once, no 60fps constraint
  A._nightStillBoost = true;       // re-armed 2026-08-07 — see effects.js §NIGHT_STILL_LIGHTS
  A._nightNearFadeFloor = 0.3;     // navigation: a light at the eye dims to 30% (anti-blowout)
  A._nightNearFadeFloorStill = 1.0;// still: no proximity penalty at all
  // §STAGED_PL_CUT (2026-08-16, user directive: staged lighting "too bright … reduce PLs or
  // intensity. As it also wipe out the ground slab shadow play during alt-c movie baking"):
  // point lights never cast shadows (NIGHT_AND_FIXTURE_LIGHTING.md §RAM), so during Alt+S/Alt+C
  // staging their light is pure additive shadow-fill on every slab in range — additive light is
  // exactly what collapses the lit/shadow ratio (§GROUND_ALBEDO's own multiplicative-vs-additive
  // analysis). NIGHT_LIGHT_INTENSITY's history is all "too bright" cuts (8.0→6.5→4.5→2.5→2.0)
  // yet nav Night Mode is now tuned and liked — so this cut is STAGING-SCOPED only: 0.5× during
  // the still/bake boost, reset to 1.0 at teardown. Nav Night Mode is byte-identical.
  A._nightPLScale = 1.0;           // CURRENT multiplier on every night PL's intensity
  A._nightPLScaleStill = 0.5;      // staging (Alt+S/Alt+C) value — §STAGED_PL_CUT
  // §NIGHT_LIGHT_MIX (2026-07-27, user: "if we can have a mix of amber, and bluish etc").
  // One flat 0xffe4b5 for every fixture is what makes a lit building read as a single lamp repeated
  // N times. Real interiors mix colour temperature by FITTING TYPE, so derive it from the fitting
  // rather than randomising: fluorescent/LED troffers and battens are cool, downlights/sconces/
  // pendants are warm, exit signage is its own green. Where the model states the temperature —
  // Terminal's families carry "cw" and "ww" in the name — that wins over the type default, because
  // stated data beats a convention. These are STATED constants, in Kelvin-ish sRGB, not tuned per
  // building; a fitting type that matches nothing keeps the original amber.
  var NIGHT_COOL   = 0xdce8ff;   // ~5000K, fluorescent/LED troffer
  var NIGHT_WARM   = 0xffdca8;   // ~2900K, downlight / sconce / pendant
  var NIGHT_AMBER  = 0xffe4b5;   // the original, and the fallback
  var NIGHT_EXIT   = 0x9bffc0;   // running-man signage green
  // §NIGHT_MIX_RATIO (2026-07-27, user: "and can we have say 20%/20% blue/amber?"). The type-derived
  // mix above follows the model, which on the Clinic lands ~71% cool / 28% warm — accurate, but a
  // corridor of identical troffers still reads uniform. This lays a DELIBERATE ratio over it: a
  // stated share of fixtures get a distinctly blue or amber cast regardless of type, which is what
  // gives an interior the mixed-temperature look real photographs have.
  //
  // Assignment is a stable hash of the fixture's own name+position, NOT Math.random and NOT the
  // query's row order: the same building must light the same way on every run, or two bakes of one
  // film disagree frame to frame and the whole thing shimmers. Set either share to 0 to switch that
  // colour off and fall back entirely to the type-derived mix.
  A._nightMixBlue  = 0.20;   // share of fixtures forced distinctly blue
  A._nightMixAmber = 0.20;   // share forced distinctly amber
  var NIGHT_MIX_BLUE  = 0xa8c8ff;   // cold cast, clearly blue against the warm
  var NIGHT_MIX_AMBER = 0xffb45c;   // strong amber, warmer than NIGHT_WARM
  // §NIGHT_MIX_WHITE (2026-07-27, user: "can we have 20/20/60 - amber/blue/white lighting?").
  // The 20/20 buckets already existed; the remaining 60% fell through to the TYPE-derived cool/warm
  // tints, so the mix was never actually 20/20/60 — it was 20/20/(a spread of warm and cool). This
  // makes the majority bucket explicitly white, which is also what a modern LED building looks like:
  // mostly neutral, with amber and blue as character rather than as the base note.
  // Pure 0xffffff reads clinical, and it would throw away temperature the model actually STATES
  // (Terminal's family names carry cw/ww), so the white bucket is neutral by default and tinted a
  // few points when the model says which it is. The 20/20/60 SHARES stay exact either way — the
  // stated data changes the shade of the white bucket, never which bucket a fixture lands in.
  var NIGHT_MIX_WHITE = 0xffffff;   // neutral — the 60%
  var NIGHT_WHITE_COOL = 0xf2f6ff;  // stated cw/cool — white with a touch of blue
  var NIGHT_WHITE_WARM = 0xfff4e4;  // stated ww/warm — white with a touch of amber
  function _mixHash(key) {
    // FNV-1a, then to [0,1). Deterministic across sessions and machines.
    var h = 2166136261;
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  // ONE test for "is this an exit sign", shared by the colour rule and by §PHOTO_GLOW_SPRITE's
  // brightness rule — they must never disagree about which fittings are signage.
  A.nightIsExitSign = function(name) {
    var n = String(name || '').toLowerCase();
    return n.indexOf('exit') >= 0 || n.indexOf('keluar') >= 0 || n.indexOf('signage') >= 0;
  };
  A.nightLightColor = function(name, key) {
    var n = String(name || '').toLowerCase();
    // Exit signage keeps its own colour whatever the ratio says — a green running-man sign that
    // came out blue would be wrong, not stylish.
    if (A.nightIsExitSign(n)) return NIGHT_EXIT;
    if (key !== undefined) {
      var h = _mixHash(String(key));
      if (h < A._nightMixBlue) return NIGHT_MIX_BLUE;                      // 20%
      if (h < A._nightMixBlue + A._nightMixAmber) return NIGHT_MIX_AMBER;  // 20%
      // §NIGHT_MIX_WHITE — the remaining 60%. FLAT white, user's call: the cw/ww tinting was offered
      // and declined, so stated temperature no longer changes the shade here either. 20/20/60 exact.
      return NIGHT_MIX_WHITE;
    }
    if (!n) return NIGHT_AMBER;
    if (/\bcw\b|cool/.test(n)) return NIGHT_COOL;      // stated in the model — outranks the type default
    if (/\bww\b|warm/.test(n)) return NIGHT_WARM;
    if (n.indexOf('troffer') >= 0 || n.indexOf('batten') >= 0 || n.indexOf('t8') >= 0 ||
        n.indexOf('recessed_mprl') >= 0 || n.indexOf('low bay') >= 0) return NIGHT_COOL;
    if (n.indexOf('downlight') >= 0 || n.indexOf('sconce') >= 0 || n.indexOf('pendant') >= 0 ||
        n.indexOf('surface mounted') >= 0) return NIGHT_WARM;
    return NIGHT_AMBER;
  };
  var NIGHT_LIGHT_RANGE = 0; // §S277d: 0 = infinite range — no artificial cutoff, inverse-square does the physics (restores overhang/doorway/corridor spillover when outside)
  var NIGHT_LIGHT_INTENSITY = 2.0; // §S277d, reduced 8.0->6.5->4.5->2.5 2026-08-08, ->2.0 2026-08-14 (user: -20%, indoor MEP-reveal bake still reads too bright)
  // §NIGHT_LIGHT_NEARFIELD (2026-08-13, user: "bright lighting up surrounding when afar, but when
  // near not evident"). Confirmed against three.module.min.js's own shader (not guessed):
  // `getDistanceAttenuation` = 1 / max(pow(lightDistance, decayExponent), 0.01) — no lower
  // distance clamp beyond that 0.01 floor (~4.6cm). At decay=1.5, falloff hits ~11.2x base
  // intensity at 0.2m and ~2.8x at 0.5m; under ACESFilmic tonemapping (exposure=0.45) that's
  // enough to clip a close surface to a flat/blown highlight instead of a readable graded glow —
  // reading as "nothing visible" up close for the opposite reason of being too dim. Lowered
  // 1.5->1.0 (linear): same maths at 0.2m/0.5m falls to ~5x/2x instead of ~11.2x/2.8x, AND at long
  // range decay=1.0 falls off SLOWER than 1.5 (reaches further, not less), so the "bright from
  // afar" character this is deliberately NOT trading away. First-pass value, like every other
  // constant in this file — verify live, no pixel-level A/B run (would need a real close-up bake).
  var NIGHT_LIGHT_DECAY = 1.0; // was 1.5 — between linear (1) and quadratic (2), reaches further than physics

  // §NIGHT_GLOW_REASSERT: extracted from toggleNightMode() so it can be re-called every frame
  // while night mode / photo-staging is active — see the comment at its call site below for why.
  // No-op (cheap) once every current matCache key has already been processed.
  A._applyNightGlowToMatCache = function() {
    if (!A._nightMode || !A._matCache || !A._nightGlowMatKeys) return;
    var mc = A._matCache;
    var _glowCount = 0, _windowGlowCount = 0;
    // KNOWN, PRE-EXISTING, DELIBERATELY NOT FIXED HERE: this asks "does the key contain one of the
    // glow CLASSES", and on the Clinic that list falls back to IfcFlowTerminal (the building has no
    // IfcLightFixture). IfcFlowTerminal is a grab-bag, so the '≈ Off-White|IfcFlowTerminal' material
    // — 1974 elements across 20 families: grab bars, towel dispensers, duplex receptacles, supply
    // diffusers, shower seats, an elevator — gets emissive 0xffe4b5 at 0.8 every night. That is the
    // "others got accidentally lighted" report, and it predates all of this work.
    // A fix was built (§LUM_VARIANT: split luminaires into their own materials by name, then key the
    // glow on that) and has been REMOVED along with everything else here that reshaped or wrote to
    // scene materials — the diffuser built on the same machinery turned 1151 Hospital fixtures into
    // black boxes. Worth redoing on its own, deliberately, not as a rider on a lighting change.
    for (var mk in mc) {
      if (A._nightGlowMatKeys[mk]) continue;
      A._nightGlowMatKeys[mk] = true;
      var m = mc[mk];
      if (!m || !m.emissive) continue;
      var isLight = false;
      for (var gi = 0; gi < A._nightGlowClasses.length; gi++) {
        if (mk.indexOf(A._nightGlowClasses[gi]) >= 0) { isLight = true; break; }
      }
      var isWindow = !isLight && A._nightWindowGlowClasses.some(function(c) { return mk.indexOf(c) >= 0; });
      if (!isLight && !isWindow && mk.indexOf('IfcPlate') >= 0 && m.transparent) isWindow = true;
      if (!isLight && !isWindow) continue;
      A._nightGlowMats.push({ mat: m, origE: m.emissive.getHex(), origEI: m.emissiveIntensity });
      if (isLight) { m.emissive.setHex(0xffe4b5); m.emissiveIntensity = 0.3; _glowCount++; } // reduced 0.8->0.65->0.45->0.3 2026-08-08
      else { m.emissive.setHex(0xfff8ec); m.emissiveIntensity = 0.55; _windowGlowCount++; }
      m.needsUpdate = true;
    }
    if (_glowCount || _windowGlowCount) {
      console.log('§NIGHT_GLOW_REASSERT +glowMeshes=' + _glowCount + ' +windowGlowMats=' + _windowGlowCount +
        ' totalGlowMats=' + A._nightGlowMats.length);
    }
  };
  // §NIGHT_FIXTURE_VOCAB / §PHOTO_GLOW_SPRITE — the ONE place luminaire POSITIONS are extracted.
  // Extracted out of toggleNightMode (2026-07-27) because a second consumer now needs the same
  // positions: the still's glow sprites. The spec's standing rule is that every path selecting
  // luminaires must share one vocabulary — two copies of this SQL is exactly how the '%light%'
  // filter ended up living in one query as a test and never as the selector. Returns the source
  // string ('IFC' | 'synthetic (N storeys)' | 'none') that §NIGHT_MODE reports.
  // force=true re-queries even when a list is already cached — what toggleNightMode does, because
  // more models may have streamed in since the last toggle. The sprite path passes nothing and
  // reuses whatever night mode already extracted.
  A._loadNightFixtures = function(force) {
    if (!force && A._nightFixtures && A._nightFixtures.length) return A._nightFixtureSource || 'IFC';
    A._nightFixtures = [];
    A._nightFixturePositions = null;   // world-space cache is derived from this list — invalidate together
    var source = 'none';
    if (A.db) {
      try {
        // §S277c: Include IfcFlowTerminal + IfcElectricAppliance — most models lack IfcLightFixture
        // §NIGHT_FIXTURE_VOCAB (2026-07-27): class alone is far too wide — on the Clinic,
        // IfcFlowTerminal covers 961 M_Duplex Receptacle and 236 M_Lighting Switches as well as
        // the real luminaires, so every power socket in the building became a light source.
        // Keep the class net (it is what finds luminaires in models with no IfcLightFixture) but
        // require the NAME to look like a luminaire and not like an accessory — the same
        // vocabulary §PHOTO_EMBER uses, and the "filter for 'light'" the user asked for. Measured
        // on the Clinic: 1105 naive name matches -> 841 real luminaires, 264 rejected.
        var r = A.db.exec(
          // §GLOW_LENS_QUAD (2026-08-07): bbox_x/bbox_y/rotation_z added so the still-render lens
          // quad (effects.js) can size and orient itself to the REAL fixture instead of a generic
          // round halo. Still-only consumer — the live round sprite ignores these three columns.
          // m.guid (glow-buildup-gate, merged in) kept alongside for that feature's own consumer.
          // §GLOW_TRUE_BOTTOM (2026-08-07): i.geometry_hash lets the drop calc below use the
          // fixture's REAL mesh bounding box instead of assuming center_z sits at the bbox
          // midpoint — see the drop comment further down for why that assumption was wrong.
          "SELECT t.center_x, t.center_y, t.center_z, m.element_name, t.bbox_z, t.bbox_x, t.bbox_y, t.rotation_z, m.guid, i.geometry_hash FROM elements_meta m " +
          "JOIN element_transforms t ON m.guid=t.guid " +
          "LEFT JOIN element_instances i ON m.guid=i.guid " +
          // §NIGHT_NAME_NOT_CLASS (2026-07-27, user: "anything that has 'light' name", "i dunno why
          // we keep missing 'light' in names"). THE ANSWER IS THE CLASS GATE, which used to read
          //     m.ifc_class IN ('IfcLightFixture','IfcFlowTerminal','IfcElectricAppliance') AND ...
          // and silently dropped any luminaire filed under a different class. Measured over all five
          // shipped buildings, removing it adds exactly 12 elements: 9 real (Terminal's
          // 'jkrME_fir-al_Flashing Light_Red & Green', class IfcAlarm) and 3 substring accidents
          // ('Life_FLIGHT_Helicopter', 'M_SkyLIGHT' x2) which the NOT clause below now names.
          // The class was never doing useful work anyway: inside those three classes, every family
          // the vocabulary rejects is a receptacle, diffuser, sink, grab bar, data outlet or
          // sprinkler — verified per family on all five DBs — so the NAME was always the selector
          // and the class was only ever hiding luminaires that lived elsewhere.
          // UNION, not intersection (user: "its easy to spot.. they are in ceilings, overheads,
          // walls as individual elements"). `IfcLightFixture` is unambiguous BY ITSELF — an element
          // of that class is a luminaire whatever it is called, so a model that names its fittings
          // 'Type A' still lights up. The name vocabulary then catches everything filed under some
          // OTHER class. The old query ANDed these two and so needed BOTH to be true, which is what
          // made a luminaire invisible if either its class or its name was unusual.
          "WHERE (m.ifc_class = 'IfcLightFixture' " +
          "  OR LOWER(m.element_name) LIKE '%light%' OR LOWER(m.element_name) LIKE '%troffer%' " +
          "  OR LOWER(m.element_name) LIKE '%downlight%' OR LOWER(m.element_name) LIKE '%luminaire%' " +
          "  OR LOWER(m.element_name) LIKE '%lamp%' OR LOWER(m.element_name) LIKE '%sconce%' " +
          "  OR LOWER(m.element_name) LIKE '%pendant%' " +
          // §NIGHT_EXIT_SIGNS (2026-07-27): an exit sign is a lit fixture and was ALWAYS intended to
          // be one — A.nightLightColor has carried an `exit 0x9bffc0` branch for exit/keluar/signage
          // since §NIGHT_LIGHT_MIX. It was never in the SELECTOR, so that branch could not fire and
          // the signs were dark. Same bug class as the '%light%' filter that existed only as a test.
          // Measured over all five shipped buildings: Clinic 841 -> 884 (+43 Exit Sign Ceiling/End
          // Mount), Hospital 1215 -> 1272 (+57 Exit Sign Ceiling Based, class IfcLightFixture),
          // Terminal/Duplex/HHS unchanged (their signs already carry the word 'Light'). ZERO false
          // positives: every element matching these three words in all five DBs is already in a
          // luminaire class. 'exit sign' not bare 'exit' — bare would reach exit corridors and doors.
          "  OR LOWER(m.element_name) LIKE '%exit sign%' OR LOWER(m.element_name) LIKE '%keluar%' " +
          "  OR LOWER(m.element_name) LIKE '%signage%') " +
          // The exclusions. First five are ACCESSORIES that carry the word 'lighting' but emit
          // nothing. Last two are SUBSTRING ACCIDENTS — 'flight' and 'skylight' both contain the
          // letters l-i-g-h-t and neither is a lamp; they are the only two found across all five
          // shipped buildings, and they are the price of selecting on the name, which is the right
          // price to pay.
          "AND NOT (LOWER(m.element_name) LIKE '%switch%' OR LOWER(m.element_name) LIKE '%receptacle%' " +
          "  OR LOWER(m.element_name) LIKE '%panelboard%' OR LOWER(m.element_name) LIKE '%socket%' " +
          "  OR LOWER(m.element_name) LIKE '%outlet%' " +
          "  OR LOWER(m.element_name) LIKE '%flight%' OR LOWER(m.element_name) LIKE '%skylight%' " +
          // §NIGHT_ROLE_EXCLUDE (2026-07-27, user: "others got accidentally lighted so look out for
          // those without semblance to lighting and clearly assigned other role"). Two guards:
          //
          // BY NAME — role words that a lighting word can collide with. '%lamp%' matches CLAMP,
          // which would turn every pipe clamp in a model into a luminaire; alarm/detector/sprinkler
          // are devices that live on the same ceiling and get named alongside lights. None of these
          // currently hit in the five shipped buildings — they are the latent traps, blocked before
          // the model that contains one arrives.
          "  OR LOWER(m.element_name) LIKE '%clamp%' OR LOWER(m.element_name) LIKE '%alarm%' " +
          "  OR LOWER(m.element_name) LIKE '%detector%' OR LOWER(m.element_name) LIKE '%sprinkler%') " +
          // BY ROLE — the class is not used to FIND luminaires any more (§NIGHT_NAME_NOT_CLASS), but
          // it is still the best statement of what an element IS FOR, so it is used to REJECT.
          // The live case: Terminal's 'jkrME_fir-al_Flashing Light_Red & Green' (IfcAlarm, 9) is a
          // fire-alarm beacon. It genuinely contains "Light" and it genuinely emits, but it is
          // assigned a fire-detection role and lighting a building by its alarm beacons is wrong.
          // Structural/opening/plumbing classes are here for the same reason skylight is excluded by
          // name — they can only ever match by accident. IfcBuildingElementProxy is deliberately NOT
          // in this list: it is the catch-all a model may legitimately file its luminaires under.
          "AND m.ifc_class NOT IN ('IfcAlarm','IfcSensor','IfcFireSuppressionTerminal'," +
          "  'IfcProtectiveDevice','IfcProtectiveDeviceTrippingUnit','IfcSanitaryTerminal'," +
          "  'IfcDuctSegment','IfcPipeSegment','IfcDuctFitting','IfcPipeFitting'," +
          "  'IfcWindow','IfcDoor','IfcSlab','IfcWall','IfcWallStandardCase'," +
          "  'IfcStair','IfcStairFlight','IfcMember','IfcBeam','IfcColumn','IfcRailing')");
        if (r.length && r[0].values.length > 0) {
          r[0].values.forEach(function(row) {
            A._nightFixtures.push({ x: row[0], y: row[1], z: row[2], name: row[3] || '', h: row[4] || 0,
              bw: row[5] || 0, bd: row[6] || 0, rz: row[7] || 0, guid: row[8] || null, ghash: row[9] || null });
          });
          source = 'IFC';
        }
      } catch(e) {}
      // §NIGHT_ROOM_FALLBACK (2026-08-07, user cascade: "1. fixtures on ceiling 2. any fixtures
      // 3. just per square empty per PL", refined same session after LTU corridors still read too
      // dark: "in rooms u can use flow terminal as been the only fixture around"). Uses REAL
      // room-containment data (rel_contained_in_space, already extracted — 181 real rooms on
      // LTU_AHouse) — for a ROOM with no real named/classed luminaire:
      //   a) if the room contains any IfcFlowTerminal (vents/diffusers/sprinklers — a plausible
      //      ceiling fixture class, and LTU has thousands: 4090 VENT + 1431 PLB), light EVERY ONE
      //      of them, not just one per room — a long corridor has several spaced along its
      //      ceiling, and one light for the whole corridor was exactly why it stayed dark at both
      //      ends. A._nightMaxLights culling (nearest-N to camera) already handles the resulting
      //      larger candidate pool, same as it does for real luminaires.
      //   b) otherwise, the single HIGHEST real element in the room (any class) — unchanged from
      //      before.
      // Tier 3 ("per square empty") stays moot: every room here has >=1 real member by construction.
      try {
        var litGuids = {};
        A._nightFixtures.forEach(function(f) { if (f.guid) litGuids[f.guid] = 1; });
        var rm = A.db.exec(
          "SELECT r.space_guid, r.element_guid, t.center_x, t.center_y, t.center_z, t.bbox_z, m.ifc_class " +
          "FROM rel_contained_in_space r JOIN element_transforms t ON r.element_guid = t.guid " +
          "JOIN elements_meta m ON r.element_guid = m.guid"
        );
        var byRoom = {};
        if (rm.length) {
          rm[0].values.forEach(function(row) {
            (byRoom[row[0]] = byRoom[row[0]] || []).push(
              { guid: row[1], x: row[2], y: row[3], z: row[4], bz: row[5] || 0, cls: row[6] || '' });
          });
        }
        var roomsLit = 0, ftLit = 0;
        for (var room in byRoom) {
          var members = byRoom[room];
          if (members.some(function(m) { return litGuids[m.guid]; })) continue;
          var flowTerms = members.filter(function(m) { return m.cls === 'IfcFlowTerminal'; });
          if (flowTerms.length) {
            flowTerms.forEach(function(ft) {
              A._nightFixtures.push({ x: ft.x, y: ft.y, z: ft.z, name: 'room-flowterm ' + room,
                h: ft.bz || 0.2, guid: null });
              ftLit++;
            });
          } else {
            var top = members[0];
            for (var mi = 1; mi < members.length; mi++) {
              if (members[mi].z + members[mi].bz / 2 > top.z + top.bz / 2) top = members[mi];
            }
            A._nightFixtures.push({ x: top.x, y: top.y, z: top.z, name: 'room-proxy ' + room,
              h: top.bz || 0.2, guid: null });
          }
          roomsLit++;
        }
        if (roomsLit) {
          source = (source === 'IFC' ? 'IFC+room-fallback(' : 'room-fallback(') +
            roomsLit + ' rooms, ' + ftLit + ' via flow-terminal)';
        }
      } catch(e) { console.warn('§NIGHT_ROOM_FALLBACK query failed', e); }
      // §NIGHT_CEILING_PLANT (2026-08-07, user: "if completely no fixture. then plant a quad and
      // PL on ceiling. This is not hurting IFC integrity but effect same as having night or sky or
      // ground mode" — explicitly sanctioned as PRESENTATION layer, same category as the ground
      // plane / procedural sky, not asserted as real extracted IFC data. Fires only when tiers 1+2
      // above found LITERALLY NOTHING — no real named luminaire anywhere, no room-containment data
      // (or a building with rooms but somehow zero elements in any of them, which tier 2 above
      // already can't produce given rel_contained_in_space's construction). One point per STOREY —
      // its centroid + near-top Z, not the old removed 15m grid — explicitly tagged
      // `presentation: true` so it's the ONLY tier besides real named fixtures that also gets a
      // still-render lens quad (effects.js checks this flag) — tier 2 above stays PL-only, per
      // user's own tiering ("take any overhead fixture... as source of lite" — light only, no quad).
      if (A._nightFixtures.length === 0) {
        try {
          var sr2 = A.db.exec(
            "SELECT m.storey, AVG(t.center_x), AVG(t.center_y), MAX(t.center_z + t.bbox_z/2) " +
            "FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
            "WHERE m.storey IS NOT NULL GROUP BY m.storey"
          );
          var storeysLit = 0;
          if (sr2.length) {
            sr2[0].values.forEach(function(row) {
              A._nightFixtures.push({ x: row[1], y: row[2], z: row[3] - 0.3, name: 'ceiling-plant ' + row[0],
                h: 0.2, guid: null, presentation: true });
              storeysLit++;
            });
          }
          if (storeysLit) source = 'ceiling-plant(' + storeysLit + ' storeys)';
        } catch(e) { console.warn('§NIGHT_CEILING_PLANT query failed', e); }
      }
    }
    A._nightFixtureSource = source;
    return source;
  };

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
      A.ambient.intensity = 0.2;  // §S277d: brighter moonlight — walls/floors visible everywhere
      A.hemi.intensity = 0.08;
      A.hemi.color.setHex(0x222244);
      A.renderer.toneMappingExposure = 0.8;
      A.renderer.setClearColor(0x080818);
      // §S277c: Night fog — dark blue
      if (A.scene.fog) A.scene.fog.color.setRGB(0.03, 0.03, 0.09);
      // Show ground plane for night scene
      if (A.ground) {
        A.ground.visible = true;
        if (!A._whiteBg) A._setGroundColor(0x0a0a15);
        A._calcGroundY();
      }
      // Update sliders to reflect
      document.getElementById('sl-sun').value = 0.15;
      document.getElementById('sl-sun-val').textContent = '0.2';
      document.getElementById('sl-ambient').value = 0.2;
      document.getElementById('sl-ambient-val').textContent = '0.2';
      document.getElementById('sl-hemi').value = 0.08;
      document.getElementById('sl-hemi-val').textContent = '0.1';
      document.getElementById('sl-exposure').value = 0.8;
      document.getElementById('sl-exposure-val').textContent = '0.8';
      // Load IFC light fixtures from DB — fallback to storey centroids if none.
      // The extraction itself lives in A._loadNightFixtures() (above) so the still's glow sprites
      // read the same list from the same vocabulary.
      var source = A._loadNightFixtures(true);
      // §S277d: Make light fixture materials emissive — glow at any distance, zero cost.
      // Uses matCache keys (rgba|ifcClass) — catches ALL material surfaces per fixture.
      A._nightGlowMats = [];
      A._nightGlowMatKeys = {};  // §NIGHT_GLOW_REASSERT below — tracks which matCache keys are done
      // Determine which IFC classes to glow
      A._nightGlowClasses = ['IfcLightFixture'];
      // Check if building has any IfcLightFixture — if not, fallback to FlowTerminal
      // §NIGHT_GLOW_CLASS_GATE (2026-07-27, user: "In Night mode, these were not identified, thus
      // the Alt-s also didn't pick it up nor alt-c" — reporting M_Troffer Light on the Clinic).
      // THE BUG: this test used to read
      //     ifc_class='IfcLightFixture' OR LOWER(element_name) LIKE '%light%' OR ...
      // which mixes two different questions. The Clinic HAS named lights (1105 rows match on name)
      // but ZERO IfcLightFixture — its luminaires are IfcFlowTerminal. So the gate came back true,
      // the IfcFlowTerminal widening was SKIPPED, _nightGlowClasses stayed ['IfcLightFixture'], and
      // nothing at all glowed. Having named lights disabled the very fallback that would have
      // caught them. The only question this gate should ask is whether the CLASS is present, since
      // the class list is all it controls.
      var _hasClassLights = false;
      if (A.db) {
        try {
          var lr = A.db.exec("SELECT COUNT(*) FROM elements_meta WHERE ifc_class='IfcLightFixture'");
          _hasClassLights = lr.length && lr[0].values[0][0] > 0;
        } catch(e) {}
      }
      if (!_hasClassLights) {
        A._nightGlowClasses.push('IfcFlowTerminal', 'IfcElectricAppliance');
        source += '+fallback';
      }
      // §NIGHT-WINDOW-GLOW (2026-07-15, user ask): facade glazing reads as "lit up from inside"
      // when viewed from outside at night — whitish emissive, distinct from the warm fixture
      // glow above. Class-based (IfcWindow/IfcCurtainWall), NOT a per-GUID exterior filter — same
      // zero-added-geometry _matCache mechanism as the fixture glow. Known imprecision: a building
      // with genuine INTERIOR glazed partitions tagged IfcCurtainWall would glow those too
      // (materials are shared by class+color, not by placement) — acceptable per user call.
      // §GLAZING-INFILL (verified live, HHS_Office_Federated): some curtain-wall systems author
      // the glass panels as IfcPlate (mullion+plate pattern), not IfcWindow/IfcCurtainWall — HHS
      // has ZERO materials of either class; its actual glass is `...,0.250|IfcPlate` (25% alpha).
      // IfcPlate alone is too ambiguous to glow unconditionally (also used for opaque steel
      // elsewhere) — gate it on the material's OWN real alpha (straight from the IFC rgba, "trust
      // IFC data" per §S265c above): only a genuinely transparent IfcPlate reads as glass.
      A._nightWindowGlowClasses = ['IfcWindow', 'IfcCurtainWall'];
      // §NIGHT_GLOW_REASSERT (2026-07-16, real bug found live — "cannot see the building lights
      // yet"): this used to be a ONE-TIME loop over A._matCache at the instant toggleNightMode()
      // fires. A._matCache is populated PROGRESSIVELY as streaming.js decodes real geometry — on
      // a still-loading building, toggleNightMode() firing early (the normal case: it's called
      // from _applyPhotoStaging() right after Alt+S, streaming can easily take 20s+) only ever
      // saw a handful of materials, most of the building's real glass/light materials hadn't been
      // created yet and were silently never glowed — confirmed live: 1 window-glow material at
      // trigger time on a building whose real curtain-wall/window count is far higher. Same bug
      // class already found+fixed twice this session for other systems (triplanar shader uniform
      // recompile, shadow/envMap streaming race) — extracted into A._applyNightGlowToMatCache()
      // so effects.js can re-call it every accumulation/orbit frame (see _reassertPhotoGlow),
      // same discipline. Cheap re-scan: skips any matCache key already processed.
      A._applyNightGlowToMatCache();
      console.log('§NIGHT_MODE on fixtures=' + A._nightFixtures.length + ' source=' + source +
        ' glowMats=' + A._nightGlowMats.length);
      // §S277d: 4 POL follow camera — subtle ambient on nearby walls/floor
      A._nightUpdateLights();
      // §NIGHT_MEM_WITNESS (2026-08-08, moved AFTER _nightUpdateLights() — placing it before, as
      // the first version did, made nightLights read 0 on every toggle-on since the light Map
      // hadn't been populated yet. Real numbers now.
      console.log('§NIGHT_MEM_WITNESS heapMB=' +
        (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 'n/a') +
        ' matCacheKeys=' + Object.keys(A._matCache || {}).length +
        ' glowMatKeys=' + Object.keys(A._nightGlowMatKeys || {}).length +
        ' nightLights=' + (A._nightLightByPos ? A._nightLightByPos.size : 0));
      // §GLOW_SPRITE_NAV_OFF (2026-08-07, user: "remove the others, no more those flimsy night
      // lights" — the round decorative sprite, not A._nightLights). Live nav now runs on the real
      // point lights ONLY (A._nightLights, bumped to 24 below) — no more static round dots. The
      // sprite mechanism itself stays (still-render exit-sign glow still uses it, see effects.js
      // startStillRefine), this just stops staging it for navigation.
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
        A._nightGlowMatKeys = null;
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
      A._nightLightByPos = null;   // stale pos-object keys otherwise survive the next toggle-on
      A._nightFixturePositions = null;
      // §PHOTO_GLOW_SPRITE: night's sprites must not survive night mode
      if (typeof A._glowUnstage === 'function') A._glowUnstage();
      // Unhook
      if (A.controls && A._nightControlsListener) {
        A.controls.removeEventListener('change', A._nightControlsListener);
        A._nightControlsListener = null;
      }
      // Restore ground
      if (A.ground && !A._shadowOn) {
        A.ground.visible = false;
        A._setGroundColor(A._whiteBg ? 0xffffff : 0x222233);
      }
      console.log('§NIGHT_MEM_WITNESS heapMB=' +
        (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 'n/a') +
        ' matCacheKeys=' + Object.keys(A._matCache || {}).length +
        ' glowMatKeys=' + Object.keys(A._nightGlowMatKeys || {}).length +
        ' nightLights=' + (A._nightLightByPos ? A._nightLightByPos.size : 0));
      console.log('§NIGHT_MODE off');
      btn.style.background = '#1a1a3e';
      btn.style.color = '#aac';
      label.textContent = 'Off';
    }
    if (A.markDirty) A.markDirty();
  };

  // Fixture positions in WORLD space, with their §NIGHT_LIGHT_MIX colour attached. Cached after the
  // first call and invalidated by A._loadNightFixtures(true). Two consumers: the point lights below
  // and §PHOTO_GLOW_SPRITE in effects.js — the sprite at a fixture and the light at that fixture
  // must be the same position and the same colour, so both read this one list.
  // A.ifc2three is the ONLY DB->world mapping; three attempts to reinvent it put a probe camera
  // inside walls (see NIGHT_AND_FIXTURE_LIGHTING.md).
  A._nightFixtureWorldPositions = function() {
    if (!A._nightFixturePositions) {
      A._loadNightFixtures();
      if (!A._nightFixtures.length) return [];
      A._nightFixturePositions = A._nightFixtures.map(function(f) {
        var p = A.ifc2three(f.x, f.y, f.z);
        // Key the ratio on name+position so it is stable per fixture and independent of row order.
        p.__color = A.nightLightColor(f.name, f.name + '|' + f.x.toFixed(2) + ',' + f.y.toFixed(2) + ',' + f.z.toFixed(2));
        p.__exit = A.nightIsExitSign(f.name);   // §GLOW_EXIT_SOFT — a sign is not a troffer
        // §GLOW_TRUE_BOTTOM (2026-08-07, replaces §GLOW_EMIT_DOWN's half-bbox-height guess — see
        // NIGHT_AND_FIXTURE_LIGHTING.md §GLOW_TRUE_BOTTOM for the numeric witness). The OLD formula
        // `bbox_z/2 + 0.12` assumed center_z sits at the bbox MIDPOINT. It doesn't: extractIFCtoDB.py
        // stores center_z as the IFC PLACEMENT ORIGIN translation, and bbox_z as the full world AABB
        // height — the two only coincide when a fixture's mesh happens to be symmetric about its own
        // origin. Measured on Hospital: a recessed troffer (symmetric mesh) was off by 4mm — noise.
        // A suspended linear pendant (origin at the ceiling attach point, mesh mostly BELOW it) was
        // off by 196mm — the pendant hangs from the origin, so almost none of its height is above it.
        // Real fix: read the ACTUAL local bounding box of the fixture's own mesh (already loaded for
        // rendering, same Y-axis convention as A.blobToGeometry — local Y === IFC Z, no extra math)
        // instead of guessing from a symmetric assumption. GLOW_LENS_CLEARANCE below is the same
        // small physical clearance effects.js already uses to clear the fixture's own depth-test —
        // reused here, not reinvented, for the same reason.
        var GLOW_LENS_CLEARANCE = 0.03;
        p.__drop = null;
        if (f.ghash && A.meshCache && A.meshCache[f.ghash]) {
          var _geo = A.meshCache[f.ghash];
          if (!_geo.boundingBox) _geo.computeBoundingBox();
          if (_geo.boundingBox && isFinite(_geo.boundingBox.min.y)) {
            p.__drop = -_geo.boundingBox.min.y + GLOW_LENS_CLEARANCE;
          }
        }
        if (p.__drop === null) {
          // Fallback only — mesh not streamed in yet, or a synthetic/room-fallback fixture with no
          // geometry_hash. Old heuristic, kept as a documented approximation, not a silent guess.
          p.__drop = (f.h || 0) / 2 + 0.12;
        }
        // §GLOW_LENS_QUAD — real fixture footprint + yaw, still-render lens only (see effects.js).
        p.__bw = f.bw || 0; p.__bd = f.bd || 0; p.__rz = f.rz || 0;
        // §GLOW_BUILDUP_GATE — null for synthetic per-storey fallback fixtures (no real element to
        // gate against); real IFC rows carry the guid so a buildup bake can withhold the glow until
        // Time Machine has actually placed that fixture (see effects.js A._tmIsVisible).
        p.__guid = f.guid || null;
        // §NIGHT_CEILING_PLANT — true only for the last-resort synthetic tier; gates the
        // still-render lens quad IN alongside real named fixtures (guid set), while tier-2's
        // any-overhead-element pick (guid null, presentation unset) stays PL-only.
        p.__presentation = !!f.presentation;
        return p;
      });
    }
    return A._nightFixturePositions;
  };

  A._nightUpdateLights = function() {
    if (!A._nightMode || !A._nightFixtures.length) return;
    var allPos = A._nightFixtureWorldPositions();
    var camPos = A.camera.position;
    var needed;
    // §NIGHT_STILL_BOOST_GATE_FIX (2026-08-08): A._nightStillBoost is set true ONCE at init and
    // never reset — it's a static "is the still-boost feature enabled" flag (effects.js reads it
    // the same way, correctly, to decide whether Alt+S is ALLOWED to raise the cap). Reading it
    // alone here as "are we in a still capture right now" meant plain navigation ALWAYS took the
    // frustum/200-cap branch below, never the nearest-N nav budget a few lines down — found via
    // live witness data: a bare 'n' toggle (no Alt+S) logged nightLights=200. A._stillRefineActive
    // (effects.js, true only between startStillRefine/stopStillRefine) is the actual per-session
    // state — AND it in alongside the feature flag.
    if (A._nightStillBoost && A._stillRefineActive) {
      // §NIGHT_STILL_FRUSTUM (2026-08-07, user: "during Alt-S and movie baking, place quads and
      // PLs on every noticeable source in the frame") — frustum-cull to what's actually in view
      // rather than a flat count cap; a still pays this cost once, not every frame. 200 is a
      // sanity ceiling against a pathological wide aerial shot with hundreds in frame at once —
      // not a deliberate creative limit.
      var frustum = new THREE.Frustum();
      var vpMatrix = new THREE.Matrix4().multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(vpMatrix);
      var inView = allPos.filter(function(p) {
        return frustum.containsPoint(new THREE.Vector3(p.x, p.y, p.z));
      });
      needed = inView.slice(0, 200).map(function(p) { return { pos: p }; });
    } else if (allPos.length <= A._nightMaxLights) {
      // Small building — place ALL fixtures, no culling
      needed = allPos.map(function(p) { return { pos: p }; });
    } else {
      // §S277d: MIXED selection — score by a point BETWEEN the eye and the look-at, so the
      // active lights sit near you AND extend down the hall you're flying toward (they
      // transfer ahead as you move). Pure camera-nearest clustered them all at the eye; pure
      // orbit-target clustered them at building centre. Debounced by the controls 'change'
      // listener (>5m move) so small orbits don't thrash the set.
      var _tgt = A.controls ? A.controls.target : camPos;
      var _aim = {
        x: camPos.x + (_tgt.x - camPos.x) * 0.5,
        y: camPos.y + (_tgt.y - camPos.y) * 0.5,
        z: camPos.z + (_tgt.z - camPos.z) * 0.5
      };
      var sorted = allPos.map(function(p) {
        var dx = p.x - _aim.x, dy = p.y - _aim.y, dz = p.z - _aim.z;
        return { pos: p, dist2: dx*dx + dy*dy + dz*dz };
      }).sort(function(a, b) { return a.dist2 - b.dist2; });
      // §NIGHT_SPREAD (2026-08-07, user: "not in dense area, if two sources nearby spread out to
      // cover further line of sight") — greedy nearest-first, but skip a candidate within
      // NIGHT_SPREAD_MIN_M of one already picked, so the 24-light budget reaches further down a
      // corridor instead of bunching on one dense cluster right at the camera. If spacing can't
      // fill the budget (not enough distant candidates), a second pass fills the rest ignoring
      // spacing — the budget is always fully used, spacing is a preference, not a hard cutoff.
      var NIGHT_SPREAD_MIN_M = 4;
      var picked = [];
      for (var si = 0; si < sorted.length && picked.length < A._nightMaxLights; si++) {
        var cand = sorted[si].pos;
        var tooClose = picked.some(function(pk) {
          var ddx = pk.x - cand.x, ddy = pk.y - cand.y, ddz = pk.z - cand.z;
          return (ddx * ddx + ddy * ddy + ddz * ddz) < NIGHT_SPREAD_MIN_M * NIGHT_SPREAD_MIN_M;
        });
        if (!tooClose) picked.push(cand);
      }
      if (picked.length < A._nightMaxLights) {
        for (var si2 = 0; si2 < sorted.length && picked.length < A._nightMaxLights; si2++) {
          if (picked.indexOf(sorted[si2].pos) === -1) picked.push(sorted[si2].pos);
        }
      }
      needed = picked.map(function(p) { return { pos: p }; });
    }
    // §NIGHT_LIGHT_CHURN_FIX (2026-08-08): this used to dispose EVERY light and rebuild the whole
    // set from scratch on every call — called on every 5m of camera travel while night mode is on,
    // so a normal orbit/fly repeatedly churned three.js's per-material light-uniform list (the
    // exact "shader recompile on light count change" cost this doc's own §RAM section already
    // named as the expensive part). Root cause of the "hiccups when lighting is on, smooth when
    // off" report — see §NIGHT_LIGHT_CHURN. Fix: `allPos` entries are stable object references
    // (memoized by A._nightFixtureWorldPositions), so a Map keyed on that reference tracks which
    // light belongs to which fixture across calls — reuse the light (just refresh its distance-fade
    // intensity) when a fixture is still wanted, only dispose/create the delta.
    if (!A._nightLightByPos) A._nightLightByPos = new Map();
    var stillWanted = new Set();
    // §S277d: camera-distance fade — lights near the eye (you're inside, next to them) dim to
    // 30%; lights far away (you're outside looking in) stay full strength for façade throw.
    // Fixes "inside too bright" without losing the exterior overhang/doorway spillover.
    needed.forEach(function(f) {
      var dist = camPos.distanceTo(f.pos);
      var fade = Math.min(1.0, dist / 15);              // 0 at the light, full at 15m+
      // §NIGHT_NEAR_FADE (2026-07-27, user: "They dont catch even lights right near to cam").
      // This fade cuts a light to 30% as you approach it — added to fix "inside too bright", and it
      // is exactly backwards for the complaint now being made: standing under a fixture gives the
      // WEAKEST light in the scene. Kept for navigation (it is what stops an interior orbit
      // blowing out) but lifted to full strength for the frozen still, where there is no exposure
      // to protect and where the whole point is that the fixture you are standing under reads as
      // lit. A._nightNearFadeFloor is raised by startStillRefine alongside the light count.
      var floor = A._nightNearFadeFloor;
      var intensity = NIGHT_LIGHT_INTENSITY * (floor + (1 - floor) * fade) * (A._nightPLScale || 1);   // §STAGED_PL_CUT
      stillWanted.add(f.pos);
      var light = A._nightLightByPos.get(f.pos);
      if (light) {
        light.intensity = intensity;   // position/colour are fixed per fixture — only fade moves
      } else {
        light = new THREE.PointLight(f.pos.__color || 0xffe4b5, intensity, NIGHT_LIGHT_RANGE, NIGHT_LIGHT_DECAY);
        light.position.copy(f.pos);
        A.scene.add(light);
        A._nightLightByPos.set(f.pos, light);
      }
    });
    A._nightLightByPos.forEach(function(light, pos) {
      if (stillWanted.has(pos)) return;
      A.scene.remove(light);
      if (light.shadow && light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      light.dispose();
      A._nightLightByPos.delete(pos);
    });
    A._nightLights = Array.from(A._nightLightByPos.values());
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
