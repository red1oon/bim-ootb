/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * grid_overlay.js — 3D Grid Overlay Mode (2D_022 spec)
 *
 * Implementing BBC.md §2D_022 — Witness: W-GRID-OVERLAY
 *
 * Shows architectural grid lines as Three.js scene objects overlaid on the 3D model.
 * Reuses GridDims.detectGrids() from grid_dims.js for column-based detection.
 * Self-contained: if this file fails to load or throws, the viewer is unaffected.
 *
 * API: setupGridOverlay(APP) — attaches APP.toggleGridOverlay
 *
 * Log tags:
 *   §GRID_MODE      — mode enter/exit
 *   §GRID_DETECT    — detection results
 *   §GRID_BBOX      — building envelope from DB
 *   §GRID_LINE      — each grid line created
 *   §GRID_ZOOM      — zoom-to-grid action
 *   §GRID_INIT      — setup/failure
 */
function setupGridOverlay(APP) {
  'use strict';
  var A = APP;

  // ── State ─────────────────────────────────────────────────────────
  var gridGroup = null;        // THREE.Group holding all grid lines + bubbles
  var gridPanel = null;        // DOM panel element
  var gridData = null;         // { xLines, yLines } from GridDims
  var dimsData = null;         // dimensions from GridDims.generateDimensions
  var active = false;
  var selectedLabel = null;    // currently highlighted grid label
  var lineMeshes = {};         // label -> { line, v0, v1 }
  var bubbleScale = 1.0;       // computed from building size
  var envCache = null;         // cached building envelope
  var zoomAnim = null;         // current zoom animation ID (for cancellation)
  var savedSections = [];      // rows from saved_sections table
  var currentPanelGrids = null; // last grids passed to buildPanel (ground or scissors)

  // View state is managed by GridViews (grid_views.js)

  // ── Constants ─────────────────────────────────────────────────────
  var COLOR_HIGHLIGHT = 0xff6600;     // bright orange on selection
  var LINE_OVERSHOOT_RATIO = 0.15;   // extend 15% of building dim past envelope
  var LINE_OVERSHOOT_MIN = 2.0;      // at least 2m overshoot
  var PANEL_ID = 'grid-overlay-panel';
  var BUBBLE_MAX_SCREEN_FRAC = 0.035; // max 3.5% of smaller screen dimension

  // ── Storey-aware cut height ────────────────────────────────────────

  /** Use detectStoreys() to find actual storey floor elevations instead of fixed offsets.
   *  floor → lowest storey + 1.2m, floor1 → second storey + 1.2m
   *  +1.2m clears typical slab thickness (0.15–0.3m) and cuts through walls cleanly */
  function computeStoreyAwareCutZ(mode) {
    if (!A.db || typeof SectionCut === 'undefined' || !SectionCut.detectStoreys) return null;
    var storeys = SectionCut.detectStoreys(A.db);
    if (!storeys.length) return null;
    var CUT_ABOVE = 1.2; // metres above storey floor — clears slabs
    // Filter out storeys with very few elements (e.g. "Ground Floor" with 1 element)
    var significant = storeys.filter(function(s) { return s.elementCount >= 5; });
    if (!significant.length) significant = storeys;

    // §GRID_STOREY door-aware ranking — Bug #1 fix.
    // Sub-grade element clusters (foundations, piles) pass elementCount≥5 but have no doors.
    // Habitable storeys always have doors. Rank by door count (desc) then by floorZ (asc).
    var storeyDoorCounts = {};
    try {
      var dr = A.db.exec(
        "SELECT m.storey, COUNT(*) FROM elements_meta m " +
        "WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') " +
        "AND m.storey IS NOT NULL GROUP BY m.storey"
      );
      if (dr.length && dr[0].values.length) {
        for (var di = 0; di < dr[0].values.length; di++) {
          storeyDoorCounts[dr[0].values[di][0]] = Number(dr[0].values[di][1]);
        }
      }
    } catch (e) { /* no door metadata — fall back to floorZ order */ }

    var hasDoorData = Object.keys(storeyDoorCounts).length > 0;
    if (hasDoorData) {
      significant = significant.slice().sort(function(a, b) {
        var da = storeyDoorCounts[a.name] || 0;
        var db2 = storeyDoorCounts[b.name] || 0;
        if (da !== db2) return db2 - da; // more doors first
        return a.floorZ - b.floorZ;      // then lower floor first
      });
      log('§GRID_STOREY door-aware sort storeyDoors=' + JSON.stringify(storeyDoorCounts));
    }

    if (mode === 'floor') {
      var cutZ = significant[0].floorZ + CUT_ABOVE;
      log('§GRID_STOREY GF cutZ=' + cutZ.toFixed(2) + ' storey="' + significant[0].name +
          '" floorZ=' + significant[0].floorZ.toFixed(2) +
          ' doors=' + (storeyDoorCounts[significant[0].name] || 0) +
          ' (n=' + significant[0].elementCount + ')');
      return cutZ;
    } else if (mode === 'floor1' && significant.length > 1) {
      var cutZ = significant[1].floorZ + CUT_ABOVE;
      log('§GRID_STOREY L1 cutZ=' + cutZ.toFixed(2) + ' storey="' + significant[1].name +
          '" floorZ=' + significant[1].floorZ.toFixed(2) +
          ' doors=' + (storeyDoorCounts[significant[1].name] || 0) +
          ' (n=' + significant[1].elementCount + ')');
      return cutZ;
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function log(msg) { console.log('[GridOverlay] ' + msg); }

  /** Theme-aware colors — flips with sunglasses */
  function isLight() { return !!A.lightTheme; }
  function lineColor() { return isLight() ? 0x444444 : 0xcccccc; }
  function bubbleStroke() { return isLight() ? '#333333' : '#666666'; }
  function bubbleText() { return isLight() ? '#222222' : '#444444'; }
  function panelBg() { return isLight() ? 'rgba(255,255,255,0.9)' : 'rgba(20,40,80,0.55)'; }
  function panelBorder() { return isLight() ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.15)'; }
  function panelText() { return isLight() ? '#000000' : '#4fc3f7'; }
  function panelDimText() { return isLight() ? '#000000' : '#4fc3f7'; }
  function panelSubText() { return isLight() ? '#444444' : '#aaaaaa'; }
  function panelTotalText() { return isLight() ? '#333333' : '#888888'; }
  function panelDivider() { return isLight() ? '#999999' : '#333333'; }

  /**
   * Get building envelope from DB in IFC coordinates.
   * Returns { xMin, xMax, yMin, yMax, zMin, zMax } in IFC metres.
   */
  function getBuildingEnvelopeIFC() {
    var fallback = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, zMin: 0, zMax: 6 };
    if (!A.db) return fallback;
    try {
      var r = A.db.exec(
        'SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms'
      );
      if (!r || !r.length || !r[0].values.length || r[0].values[0][0] == null) return fallback;
      var v = r[0].values[0];
      var env = { xMin: v[0], xMax: v[1], yMin: v[2], yMax: v[3], zMin: v[4], zMax: v[5] };
      log('§GRID_BBOX ifc x=[' + env.xMin.toFixed(1) + ',' + env.xMax.toFixed(1) +
          '] y=[' + env.yMin.toFixed(1) + ',' + env.yMax.toFixed(1) +
          '] z=[' + env.zMin.toFixed(1) + ',' + env.zMax.toFixed(1) + ']');
      return env;
    } catch (e) {
      log('§GRID_BBOX query error: ' + e.message);
      return fallback;
    }
  }

  /**
   * Implementing 2D_027 §10.2 — Witness: W-2D27-FLOORZ
   * Detect floor level from IfcSlab top, fallback to lowest wall, fallback to zMin.
   * Returns IFC Z of the floor surface (NOT including foundations/piles).
   */
  function _getFloorCutZ(db, envZMin) {
    if (!db) return envZMin;
    // Try lowest IfcSlab top surface (= floor level)
    try {
      var r = db.exec(
        "SELECT MIN(t.center_z + t.bbox_z * 0.5) " +
        "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
        "WHERE m.ifc_class = 'IfcSlab'"
      );
      if (r.length && r[0].values[0][0] != null) {
        var slabTop = Number(r[0].values[0][0]);
        log('§GRID_FLOORCUTZ source=slab top=' + slabTop.toFixed(3));
        return slabTop;
      }
    } catch (e) {}
    // Fallback: lowest wall center_z (walls never extend below floor)
    try {
      var r2 = db.exec(
        "SELECT MIN(t.center_z - t.bbox_z * 0.5) " +
        "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
        "WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase')"
      );
      if (r2.length && r2[0].values[0][0] != null) {
        var wallBottom = Number(r2[0].values[0][0]);
        log('§GRID_FLOORCUTZ source=wall bottom=' + wallBottom.toFixed(3));
        return wallBottom;
      }
    } catch (e) {}
    log('§GRID_FLOORCUTZ source=fallback zMin=' + envZMin.toFixed(3));
    return envZMin;
  }

  /** Create a circle sprite (billboard) for grid bubble */
  function createBubble(label, position, highlighted) {
    var canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.fillStyle = highlighted ? '#fff3e0' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = highlighted ? 5 : 3;
    ctx.strokeStyle = highlighted ? '#ff6600' : bubbleStroke();
    ctx.stroke();
    ctx.fillStyle = highlighted ? '#ff6600' : bubbleText();
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 32, 33);

    var texture = new THREE.CanvasTexture(canvas);
    var mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    var sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(bubbleScale, bubbleScale, 1);
    sprite.renderOrder = 1000;
    sprite.userData.gridLabel = label;
    return sprite;
  }

  /** Density filter + screen-space cap for bubbles and dim labels.
   *  Ceiling: bubbles never exceed BUBBLE_MAX_SCREEN_FRAC of visible width (prevents huge bubbles zoomed out).
   *  Floor: bubbles never shrink below bubbleScale (prevents tiny bubbles zoomed in).
   *  Density filter hides overlapping bubbles; zooming in reveals more. */
  function clampBubbleScales() {
    if (!active || !gridGroup) return;
    var cam = A.camera;
    var visW, visH;
    if (cam.isOrthographicCamera) {
      visW = (cam.right - cam.left) / (cam.zoom || 1);
      visH = (cam.top - cam.bottom) / (cam.zoom || 1);
    } else {
      var dist = cam.position.distanceTo(A.controls.target);
      var vFov = cam.fov * Math.PI / 180;
      visH = 2 * dist * Math.tan(vFov / 2);
      visW = visH * cam.aspect;
    }
    // Implementing 2D_027 §11.2 — Witness: W-2D27-BUBBLESCALE
    // Constant screen-space: scale inversely with zoom so bubbles stay same pixel size.
    var visDim = Math.min(visW, visH);
    var s;
    if (cam.isOrthographicCamera) {
      // visH shrinks as zoom increases → s shrinks → constant screen size
      s = visH * 0.03;
      s = Math.max(bubbleScale * 0.2, Math.min(bubbleScale * 4.0, s));
    } else {
      var dist = cam.position.distanceTo(A.controls ? A.controls.target : new THREE.Vector3());
      s = dist * 0.04;
      s = Math.max(bubbleScale * 0.2, Math.min(bubbleScale * 4.0, s));
    }

    // Collect bubble sprites grouped by label for density check
    var bubblesByLabel = {};
    gridGroup.traverse(function(obj) {
      if (obj.isSprite && obj.userData.gridLabel) {
        obj.scale.set(s, s, 1);
        var lbl = obj.userData.gridLabel;
        if (!bubblesByLabel[lbl]) bubblesByLabel[lbl] = [];
        bubblesByLabel[lbl].push(obj);
      }
    });

    // Screen-space density filter: project bubble midpoints to screen,
    // hide labels whose projected positions overlap across ALL axes.
    // This makes Z-axis grids disappear when the side face rotates edge-on.
    var hiddenLabels = {};
    var screenPts = []; // { label, sx, sy } — screen coords of each label's midpoint
    var cam = A.camera;
    var halfW = window.innerWidth / 2;
    var halfH = window.innerHeight / 2;
    for (var lbl in bubblesByLabel) {
      var sprites = bubblesByLabel[lbl];
      if (!sprites.length) continue;
      // Use midpoint of the grid line for projection
      var entry = lineMeshes[lbl];
      if (!entry) continue;
      var mid = new THREE.Vector3().addVectors(entry.v0, entry.v1).multiplyScalar(0.5);
      var projected = mid.clone().project(cam);
      screenPts.push({
        label: lbl,
        sx: (projected.x * halfW) + halfW,
        sy: -(projected.y * halfH) + halfH
      });
    }
    // Sort by screen X then Y for proximity check
    screenPts.sort(function(a, b) { return a.sx - b.sx || a.sy - b.sy; });
    // Min screen-pixel gap between bubbles (based on bubble screen size)
    var bubbleScreenPx = (s / visDim) * Math.min(window.innerWidth, window.innerHeight);
    var minScreenGap = bubbleScreenPx * 2.0;
    // Greedy: show first, hide if too close to last shown
    if (screenPts.length > 1) {
      var lastShown = screenPts[0];
      for (var pi = 1; pi < screenPts.length; pi++) {
        var dx = screenPts[pi].sx - lastShown.sx;
        var dy = screenPts[pi].sy - lastShown.sy;
        var screenDist = Math.sqrt(dx * dx + dy * dy);
        if (screenDist < minScreenGap) {
          hiddenLabels[screenPts[pi].label] = true;
        } else {
          lastShown = screenPts[pi];
        }
      }
    }

    // Face-direction check: compute camera direction relative to building centre
    // Back-facing grids → x-ray (opacity 0.15), edge-on → faded (0.4)
    var camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    // Face normals in Three.js coords: front(+Z)=yMax, back(-Z), left(-X)=xMin, right(+X)
    // XY ground grids: normal = up (+Y)
    var dotFront = -camDir.z;  // front face normal is +Z in Three.js
    var dotLeft  = -camDir.x;  // left face normal is -X in Three.js
    var dotUp    = -camDir.y;  // ground plane normal is +Y

    // Apply visibility + face-direction opacity
    for (var lbl2 in bubblesByLabel) {
      var vis = !hiddenLabels[lbl2];
      var spr = bubblesByLabel[lbl2];
      var entry2 = lineMeshes[lbl2];
      var axis2 = entry2 && entry2.line ? entry2.line.userData.gridAxis : '';

      // Compute opacity based on face direction
      var opacity = 1.0;
      if (axis2 === 'Z') {
        // Z grids: check which face they're on (label ends with 'f' or 'l')
        var isFront = lbl2.charAt(lbl2.length - 1) === 'f';
        var dot = isFront ? dotFront : dotLeft;
        if (dot < -0.1) {
          opacity = 0.12; // back-facing → x-ray ghost
        } else if (dot < 0.3) {
          opacity = 0.3;  // edge-on → faded
        }
      } else {
        // XY ground grids: fade when viewed from below
        if (dotUp < -0.1) opacity = 0.12;
        else if (dotUp < 0.2) opacity = 0.4;
      }

      for (var si = 0; si < spr.length; si++) {
        spr[si].visible = vis;
        if (vis) {
          spr[si].material.opacity = opacity;
          spr[si].material.transparent = (opacity < 1.0);
        }
      }
      if (entry2 && entry2.line) {
        entry2.line.visible = vis;
        if (vis) {
          entry2.line.material.opacity = opacity;
          entry2.line.material.transparent = (opacity < 1.0);
        }
      }
    }

    // Sync panel: dim hidden grid rows
    syncPanelVisibility(hiddenLabels);

    // Clamp dim chain labels + density filter
    if (typeof DimChains !== 'undefined' && DimChains.clampScales) {
      DimChains.clampScales(gridGroup, bubbleScale, s, visW);
    }
  }

  /** Sort labels by grid position, hide those too close to last visible */
  function filterAxisLabels(labels, minGap, hiddenLabels) {
    if (labels.length < 2) return;
    // Sort by IFC position
    labels.sort(function(a, b) {
      var pa = lineMeshes[a] ? lineMeshes[a].line.userData.gridPos : 0;
      var pb = lineMeshes[b] ? lineMeshes[b].line.userData.gridPos : 0;
      return pa - pb;
    });
    // Always show first and last
    var lastShownPos = lineMeshes[labels[0]] ? lineMeshes[labels[0]].line.userData.gridPos : 0;
    for (var i = 1; i < labels.length - 1; i++) {
      var pos = lineMeshes[labels[i]] ? lineMeshes[labels[i]].line.userData.gridPos : 0;
      if (Math.abs(pos - lastShownPos) < minGap) {
        hiddenLabels[labels[i]] = true;
      } else {
        lastShownPos = pos;
      }
    }
  }

  /** Dim/undim panel rows to match bubble visibility */
  function syncPanelVisibility(hiddenLabels) {
    if (!gridPanel) return;
    var rows = gridPanel.querySelectorAll('.grid-row');
    for (var i = 0; i < rows.length; i++) {
      var lbl = rows[i].getAttribute('data-label');
      var lblEnd = rows[i].getAttribute('data-label-end');
      var hidden = hiddenLabels[lbl] || hiddenLabels[lblEnd];
      rows[i].style.opacity = hidden ? '0.3' : '1';
    }
  }

  // ── Build Grid Scene Objects ──────────────────────────────────────

  function buildGridScene(grids, env) {
    if (gridGroup) {
      A.scene.remove(gridGroup);
      gridGroup.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
    }
    gridGroup = new THREE.Group();
    gridGroup.name = 'gridOverlay';
    lineMeshes = {};

    // Building dimensions in IFC coords
    var bldW = env.xMax - env.xMin;  // IFC X width
    var bldD = env.yMax - env.yMin;  // IFC Y depth
    var bldH = env.zMax - env.zMin;  // IFC Z height
    var maxDim = Math.max(bldW, bldD);

    // Overshoot: 15% of building dimension, min 2m
    var overshootX = Math.max(LINE_OVERSHOOT_MIN, bldD * LINE_OVERSHOOT_RATIO);
    var overshootY = Math.max(LINE_OVERSHOOT_MIN, bldW * LINE_OVERSHOOT_RATIO);

    // Bubble size: ~4% of max building dimension
    bubbleScale = Math.max(1.0, maxDim * 0.035);
    log('§GRID_BBOX bldW=' + bldW.toFixed(1) + ' bldD=' + bldD.toFixed(1) +
        ' bldH=' + bldH.toFixed(1) + ' bubbleScale=' + bubbleScale.toFixed(2));

    // Ground floor Y in Three.js (IFC Z=zMin → Three Y)
    var groundY = (env.zMin - A.modelOffset.z) - 0.05;

    // X-axis grids: constant IFC X, run along IFC Y direction
    var xLines = grids.xLines || [];
    for (var i = 0; i < xLines.length; i++) {
      var xPos = xLines[i].position;
      var p0 = A.ifc2three(xPos, env.yMin - overshootX, env.zMin);
      var p1 = A.ifc2three(xPos, env.yMax + overshootX, env.zMin);
      var v0 = new THREE.Vector3(p0.x, groundY, p0.z);
      var v1 = new THREE.Vector3(p1.x, groundY, p1.z);
      addGridLine(xLines[i].label, 'X', xPos, v0, v1);
    }

    // Y-axis grids: constant IFC Y, run along IFC X direction
    var yLines = grids.yLines || [];
    for (var j = 0; j < yLines.length; j++) {
      var yPos = yLines[j].position;
      var q0 = A.ifc2three(env.xMin - overshootY, yPos, env.zMin);
      var q1 = A.ifc2three(env.xMax + overshootY, yPos, env.zMin);
      var w0 = new THREE.Vector3(q0.x, groundY, q0.z);
      var w1 = new THREE.Vector3(q1.x, groundY, q1.z);
      addGridLine(yLines[j].label, 'Y', yPos, w0, w1);
    }

    // Z-axis grids: horizontal storey level lines on building faces
    buildZGrids(env, overshootX, overshootY);

    A.scene.add(gridGroup);
    A.markDirty();
    log('§GRID_MODE lines=' + Object.keys(lineMeshes).length + ' added to scene');
  }

  /** Build Z-axis (storey level) grid lines — horizontal lines at each storey elevation.
   *  Front face: runs along X at yMax. Left face: runs along Y at xMin.
   *  Labelled GF, L1, L2... from detectStoreys(). */
  function buildZGrids(env, overshootX, overshootY) {
    if (!A.db || typeof SectionCut === 'undefined' || !SectionCut.detectStoreys) return;
    var storeys = SectionCut.detectStoreys(A.db);
    if (storeys.length < 2) return;

    // Abbreviate storey names: "Ground Floor" → "GF", "1st Floor" → "L1", etc.
    var zLabels = [];
    for (var si = 0; si < storeys.length; si++) {
      var name = storeys[si].name || '';
      var abbr;
      if (/ground|gf/i.test(name)) abbr = 'GF';
      else if (/roof/i.test(name)) abbr = 'RF';
      else if (/basement|bsmt/i.test(name)) abbr = 'B' + (si + 1);
      else {
        // Extract floor number or use index
        var numMatch = name.match(/(\d+)/);
        abbr = 'L' + (numMatch ? numMatch[1] : si);
      }
      // Skip if too few elements (noise)
      if (storeys[si].elementCount < 5) continue;
      zLabels.push({ label: abbr, ifcZ: storeys[si].floorZ, name: name });
    }
    if (zLabels.length < 2) return;

    // Front face: lines run along IFC X at yMax (front of building)
    for (var fi = 0; fi < zLabels.length; fi++) {
      var zl = zLabels[fi];
      var fp0 = A.ifc2three(env.xMin - overshootY, env.yMax, zl.ifcZ);
      var fp1 = A.ifc2three(env.xMax + overshootY, env.yMax, zl.ifcZ);
      var fv0 = new THREE.Vector3(fp0.x, fp0.y, fp0.z);
      var fv1 = new THREE.Vector3(fp1.x, fp1.y, fp1.z);
      var fLabel = zl.label + 'f';
      addGridLine(fLabel, 'Z', zl.ifcZ, fv0, fv1);
    }

    // Left face: lines run along IFC Y at xMin (left side)
    for (var li = 0; li < zLabels.length; li++) {
      var zll = zLabels[li];
      var lp0 = A.ifc2three(env.xMin, env.yMin - overshootX, zll.ifcZ);
      var lp1 = A.ifc2three(env.xMin, env.yMax + overshootX, zll.ifcZ);
      var lv0 = new THREE.Vector3(lp0.x, lp0.y, lp0.z);
      var lv1 = new THREE.Vector3(lp1.x, lp1.y, lp1.z);
      var lLabel = zll.label + 'l';
      addGridLine(lLabel, 'Z', zll.ifcZ, lv0, lv1);
    }

    log('§GRID_Z storeys=' + zLabels.length + ' labels=' + zLabels.map(function(z) { return z.label; }).join(','));
  }

  function addGridLine(label, axis, ifcPos, v0, v1) {
    var geom = new THREE.BufferGeometry().setFromPoints([v0, v1]);
    var mat = new THREE.LineBasicMaterial({ color: lineColor() });
    var line = new THREE.Line(geom, mat);
    line.renderOrder = 999;
    line.userData = { gridLabel: label, gridAxis: axis, gridPos: ifcPos };
    gridGroup.add(line);
    lineMeshes[label] = { line: line, v0: v0.clone(), v1: v1.clone() };

    // Bubbles at both ends
    gridGroup.add(createBubble(label, v0, false));
    gridGroup.add(createBubble(label, v1, false));

    log('§GRID_LINE axis=' + axis + ' ifc=' + ifcPos.toFixed(3) + ' label=' + label +
        ' three=[(' + v0.x.toFixed(1) + ',' + v0.z.toFixed(1) + ')→(' + v1.x.toFixed(1) + ',' + v1.z.toFixed(1) + ')]');
  }

  // ── View Presets (delegated to GridViews) ───────────────────────────

  var VIEW_BTN_BASE = 'border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer';
  var VIEW_BTN_STYLE = 'background:#444;color:#ccc;border:1px solid #666;' + VIEW_BTN_BASE;
  var VIEW_BTN_ACTIVE = 'background:#4fc3f7;color:#000;border:1px solid #666;' + VIEW_BTN_BASE;
  // Color-coded button styles — citizen classes
  var VIEW_BTN_DEFAULT = 'background:#2a3a2a;color:#8c8;border:1px solid #4a6a4a;' + VIEW_BTN_BASE;  // light green — built-in views
  var VIEW_BTN_SAVED   = 'background:#3a3a1a;color:#cc8;border:1px solid #6a6a3a;' + VIEW_BTN_BASE;  // light yellow — previously saved
  var VIEW_BTN_LATEST  = 'background:#4a3010;color:#fc6;border:1px solid #8a6a2a;' + VIEW_BTN_BASE;  // orange — saved this session
  var latestSavedId = null; // track the most recently saved section ID this session

  /** Update active state on all view buttons */
  function updateViewButtons() {
    var av = GridViews.activeView();
    var btns = document.querySelectorAll('.grid-view-btn');
    for (var i = 0; i < btns.length; i++) {
      var v = btns[i].getAttribute('data-view');
      btns[i].style.cssText = (v === av) ? VIEW_BTN_ACTIVE : VIEW_BTN_DEFAULT;
    }
  }

  /** Handle view button click — orchestrates engines → renderer */
  function onViewBtnClick(e) {
    var mode = e.currentTarget.getAttribute('data-view');
    if (!mode) return;

    // Clear previous contours + door arcs/window openings/labels
    if (typeof GridContours !== 'undefined') GridContours.clear(A);
    if (typeof DoorArcs !== 'undefined' && DoorArcs.clearSceneObjects) DoorArcs.clearSceneObjects(A);

    if (mode === 'unlock') {
      GridViews.unlockView(A);
    } else {
      // Floor plans (GF, L1): keep scissors alive — slider controls cut height.
      // Elevation views (front, rear, left, right, roof): turn scissors off.
      var isFloor = (mode === 'floor' || mode === 'floor1');
      if (!isFloor && A.sectionOn && A.toggleSection) {
        log('§GRID_STOREY scissors off — elevation view mode=' + mode);
        A.toggleSection();
      }
      // If scissors is ON, use its current cut height for the floor plan.
      // Otherwise use storey-aware detection.
      var cutZ;
      if (isFloor && A.sectionOn && A.sectionPlane) {
        cutZ = A.sectionPlane.constant + (A.modelOffset ? A.modelOffset.z : 0);
        log('§GRID_STOREY using scissors cutZ=' + cutZ.toFixed(2) + ' for mode=' + mode);
      } else {
        cutZ = computeStoreyAwareCutZ(mode);
      }
      GridViews.lockView(A, mode, envCache, cutZ);
      renderContoursForView(mode, cutZ);
      clampBubbleScales();
    }
    updateViewButtons();
  }

  /** Orchestrate: read contourMode from config, call engine, pass to renderer.
   *  cutZOverride = storey-aware cut height (from computeStoreyAwareCutZ). */
  function renderContoursForView(mode, cutZOverride) {
    if (typeof GridConfig === 'undefined') return;
    var contourMode = GridConfig.contourModeFor(mode);
    if (!contourMode) return; // null = no contours (e.g. roof)

    if (contourMode === 'section' && typeof SectionCut !== 'undefined' && typeof GridContours !== 'undefined') {
      // Floor plan: section cut → contours + door arcs
      var cutZ;
      if (cutZOverride != null) {
        cutZ = cutZOverride;
      } else {
        var clipCfg = GridConfig.clipFor(mode);
        var bldH = envCache.zMax - envCache.zMin;
        if (clipCfg && clipCfg.offset_ratio) {
          // Ratio-based: relative to full building height (floor1, upper storeys)
          cutZ = envCache.zMin + bldH * clipCfg.offset_ratio;
        } else {
          // Implementing 2D_027 §10.2 — Witness: W-2D27-FLOORZ
          // Use floor slab top as reference — not raw zMin (which includes foundations)
          var floorZ = _getFloorCutZ(A.db, envCache.zMin);
          cutZ = floorZ + ((clipCfg && clipCfg.offset_m) || 1.0);
          log('§GRID_CUTZ_RESOLVED cutZ=' + cutZ.toFixed(3) + ' floorZ=' + floorZ.toFixed(3) + ' mode=' + mode);
        }
      }

      // Implementing 2D_028 §2.3 — Witness: W-2D28
      var rules = window._gridRules || {};
      var results = SectionCut.sectionCut(A.db, A.libDb, cutZ, null, { rules: rules });
      GridContours.renderContours(A, results, mode, cutZ);

      // Door arcs + window openings
      // IFC2x3 uses IfcDoor/IfcWindow/IfcStair; IFC4 adds StandardCase variants.
      // Both forms must be matched so SampleCastle and other IFC4 buildings get arcs.
      if (typeof DoorArcs !== 'undefined') {
        // Diagnostic: log all distinct IFC classes present in this section cut result.
        // If doors=0 on a building that should have them, look here for the actual class names.
        var classMap = {};
        for (var ci = 0; ci < results.length; ci++) { classMap[results[ci].ifcClass] = (classMap[results[ci].ifcClass] || 0) + 1; }
        log('§DOOR_ARC_CLASSES cutZ=' + cutZ.toFixed(2) + ' classes=' + JSON.stringify(classMap));

        var doors   = results.filter(function(r) {
          return r.ifcClass === 'IfcDoor' || r.ifcClass === 'IfcDoorStandardCase';
        });
        var walls   = results.filter(function(r) {
          return r.ifcClass === 'IfcWall' || r.ifcClass === 'IfcWallStandardCase';
        });
        var arcs = DoorArcs.generateArcs(doors, walls);
        GridContours.addDoorArcs(A, arcs, mode, cutZ);

        // Implementing 2D_027 §5.4 — Witness: W-2D27
        // IfcStairFlight = IFC4 sub-element of IfcStair; both must be checked.
        var stairElements  = results.filter(function(r) {
          return r.ifcClass === 'IfcStair' || r.ifcClass === 'IfcStairFlight';
        });
        var windowElements = results.filter(function(r) {
          return r.ifcClass === 'IfcWindow' || r.ifcClass === 'IfcWindowStandardCase';
        });
        // All 2D-only objects (stairs, windows, labels) go into the contour group
        // so GridContours.clear() disposes them on card switch or grid exit.
        var cGroup = GridContours.activeGroup ? GridContours.activeGroup() : null;
        DoorArcs.generateStairSymbol(stairElements, A, cutZ, cGroup);
        DoorArcs.generateWindowOpenings(windowElements, A, cutZ, cGroup);

        // Implementing 2D_029 §1.3 — Witness: W-2D29
        // Opening callout labels for doors and windows
        if (DoorArcs.addOpeningLabel && cGroup) {
          var openings = doors.concat(windowElements);
          for (var oi = 0; oi < openings.length; oi++) {
            var el = openings[oi];
            var b = el.bbox2d;
            if (!b) continue;
            var bw = b[2] - b[0], bd = b[3] - b[1];
            var openW = Math.max(bw, bd);
            var wallAxis = bw >= bd ? 'X' : 'Y';
            var ocx = (b[0] + b[2]) / 2, ocy = (b[1] + b[3]) / 2;
            var elName = el.element_name || el.elementName || '';
            var tag = elName.split(':')[0] || (el.ifcClass || '').replace('Ifc', '').toUpperCase();
            DoorArcs.addOpeningLabel(cGroup, A.ifc2three, ocx, ocy, cutZ, wallAxis, openW, tag, el.guid, rules);
          }
        }

        log('§DOOR_ARC_STOREY mode=' + mode + ' doors=' + doors.length + ' stairs=' + stairElements.length + ' windows=' + windowElements.length);
      }

      // Implementing 2D_031 §Next — Witness: W-2D31-FURNITURE
      // Furniture footprints: query furniture elements within Z-band, render as 2D rectangles
      if (typeof GridContours !== 'undefined' && GridContours.renderFurniture) {
        var furnBand = 1.5; // same band as section cut
        try {
          var furnRows = A.dbQuery(
            "SELECT m.guid, m.ifc_class, m.element_name, t.center_x, t.center_y, t.bbox_x, t.bbox_y " +
            "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
            "WHERE m.ifc_class IN ('IfcFurniture','IfcFurnishingElement') " +
            "AND t.center_z >= ? AND t.center_z <= ?",
            [cutZ - 0.5, cutZ + furnBand]
          );
          if (furnRows.length > 0) {
            var furnData = furnRows.map(function(r) {
              return { guid: r[0], ifcClass: r[1], elementName: r[2], cx: r[3], cy: r[4], bx: r[5], by: r[6] };
            });
            GridContours.renderFurniture(A, furnData, cutZ);
            log('§FURNITURE_QUERY cutZ=' + cutZ.toFixed(2) + ' found=' + furnRows.length);
          } else {
            log('§FURNITURE_QUERY cutZ=' + cutZ.toFixed(2) + ' found=0');
          }
        } catch (e) {
          log('§FURNITURE_QUERY_ERR ' + e.message);
        }
      }

      log('§GRID_VIEW contours=section mode=' + mode + ' cutZ=' + cutZ.toFixed(2));

    } else if (contourMode === 'elevation' && typeof Elevation !== 'undefined' && typeof GridContours !== 'undefined') {
      // Elevation: projected edges + level markers
      var face = mode; // front/rear/left/right map directly to Elevation face names
      var edgeData = Elevation.generateElevation(A.db, A.libDb, face);
      GridContours.renderEdges(A, edgeData, mode, envCache);

      // Level markers
      if (typeof SectionCut !== 'undefined') {
        var storeys = SectionCut.detectStoreys(A.db);
        GridContours.renderLevelMarkers(A, storeys, mode, envCache);
      }
      log('§GRID_VIEW contours=elevation mode=' + mode + ' edges=' + edgeData.length);
    }
  }

  // ── Dimension Chains (delegated to DimChains module) ───────────────

  function buildDimChains(grids, env) {
    if (typeof DimChains !== 'undefined') {
      DimChains.build(A, gridGroup, grids, env, { bubbleScale: bubbleScale });
    }
  }

  function removeDimChains() {
    if (typeof DimChains !== 'undefined') {
      DimChains.remove(gridGroup);
    }
  }

  // ── Saved Sections (D2) ──────────────────────────────────────────

  /** localStorage key scoped to building name */
  function lsKey() { return 'bim_saved_sections_' + (A.activeBuilding || 'default'); }

  /** Ensure saved_sections table exists in current building DB */
  function ensureSavedSectionsTable(db) {
    try {
      db.run(
        'CREATE TABLE IF NOT EXISTS saved_sections (' +
        '  id INTEGER PRIMARY KEY, name TEXT, cut_value REAL,' +
        '  plane_normal TEXT, crop_bbox TEXT, detected_grids TEXT, timestamp TEXT)'
      );
      // P1: Add view_state column (backward-compatible — NULL for legacy cards)
      try { db.run('ALTER TABLE saved_sections ADD COLUMN view_state TEXT'); } catch (e2) { /* already exists */ }
    } catch (e) { log('§SAVE_SECTION table error: ' + e.message); }
  }

  // Implementing 2D_031 §P1 — Witness: W-CARD-VIEW
  /** Capture current view state as JSON for card persistence */
  function captureViewState() {
    var mode = GridViews.activeView() || 'floor';
    var hidden = Object.keys(GridViews.HIDE_IN_FLOOR || {});
    var cam = GridViews.getCameraState(A);
    // Look up storey name from DB using current cut height
    var storey = '';
    if (A.db && A.sectionPlane && typeof SectionCut !== 'undefined' && SectionCut.detectStoreys) {
      var cutZ = A.sectionPlane.constant + (A.modelOffset ? A.modelOffset.z : 0);
      var storeys = SectionCut.detectStoreys(A.db);
      for (var si = 0; si < storeys.length; si++) {
        if (storeys[si].floorZ <= cutZ && cutZ <= storeys[si].floorZ + 10) {
          storey = storeys[si].name;
          break;
        }
      }
    }
    var state = {
      hidden_classes: hidden,
      camera: cam,
      storey: storey,
      mode: mode
    };
    log('§VIEW_CARD capture mode=' + mode + ' hidden=' + hidden.length +
        ' cam=' + (cam ? 'zoom=' + cam.zoom.toFixed(2) : 'null'));
    return state;
  }

  /** Load saved sections from DB into savedSections[]. Falls back to localStorage. */
  function loadSavedSections() {
    savedSections = [];
    if (!A.db) return;
    ensureSavedSectionsTable(A.db);
    try {
      var r = A.db.exec('SELECT id, name, cut_value, plane_normal, detected_grids, view_state FROM saved_sections ORDER BY id');
      if (r.length && r[0].values.length) {
        for (var i = 0; i < r[0].values.length; i++) {
          var row = r[0].values[i];
          var dwells = null;
          try { if (row[4]) dwells = JSON.parse(row[4]); } catch (e) { /* not JSON */ }
          var vs = null;
          try { if (row[5]) vs = JSON.parse(row[5]); } catch (e) { /* not JSON */ }
          savedSections.push({ id: row[0], name: row[1], cut_value: row[2], plane_normal: row[3], dwells: dwells, view_state: vs });
        }
      }
    } catch (e) { log('§SAVE_SECTION load db error: ' + e.message); }

    // Fall back to localStorage if DB has no rows (persists across reloads)
    if (!savedSections.length) {
      try {
        var lsData = localStorage.getItem(lsKey());
        if (lsData) {
          var lsRows = JSON.parse(lsData);
          for (var j = 0; j < lsRows.length; j++) {
            var ss = lsRows[j];
            try {
              A.db.run(
                'INSERT OR IGNORE INTO saved_sections (id,name,cut_value,plane_normal,detected_grids,timestamp,view_state) VALUES(?,?,?,?,?,?,?)',
                [ss.id, ss.name, ss.cut_value, ss.plane_normal, null, ss.timestamp || '', ss.view_state ? JSON.stringify(ss.view_state) : null]
              );
            } catch (e2) { /* skip duplicate */ }
          }
          savedSections = lsRows;
          log('§SAVE_SECTION restored ' + lsRows.length + ' from localStorage');
        }
      } catch (e) { log('§SAVE_SECTION localStorage read error: ' + e.message); }
    }
    log('§SAVE_SECTION loaded=' + savedSections.length);
  }

  /** Save current scissors cut to DB and localStorage.
   *  @param {string} name
   *  @param {Array}  [dwells] — dwell_points from smart save (optional)
   */
  function saveSectionToDb(name, dwells, viewStateOverride) {
    if (!A.db) return;
    ensureSavedSectionsTable(A.db);
    var cutVal = A.sectionPlane ? A.sectionPlane.constant : 0;
    var axis = A.sectionAxis || 'Y';
    var normal = axis === 'X' ? '[-1,0,0]' : axis === 'Z' ? '[0,0,-1]' : '[0,-1,0]';
    var ts = new Date().toISOString().slice(0, 10);
    // Store dwell points in detected_grids column (reused — was always null)
    var dwellJson = (dwells && dwells.length > 0) ? JSON.stringify(dwells) : null;
    // P1: capture view state (card-first persistence)
    var vs = viewStateOverride || captureViewState();
    var vsJson = JSON.stringify(vs);
    try {
      A.db.run(
        'INSERT INTO saved_sections (name,cut_value,plane_normal,detected_grids,timestamp,view_state) VALUES(?,?,?,?,?,?)',
        [name, cutVal, normal, dwellJson, ts, vsJson]
      );
      // Get the ID of what we just inserted
      try {
        var lastId = A.db.exec('SELECT last_insert_rowid()');
        if (lastId.length && lastId[0].values.length) latestSavedId = lastId[0].values[0][0];
      } catch (e2) { /* ignore */ }
      loadSavedSections();
      try { localStorage.setItem(lsKey(), JSON.stringify(savedSections)); } catch (e) { /* no-op */ }
      // User saved a card manually — re-enable auto-create for future
      try { localStorage.removeItem(lsKey() + '_noauto'); } catch (e) { /* no-op */ }
      log('§SAVE_SECTION saved name=' + name + ' cutVal=' + cutVal.toFixed(2) +
          ' axis=' + axis + ' dwells=' + (dwells ? dwells.length : 0) +
          ' latestId=' + latestSavedId);
    } catch (e) { log('§SAVE_SECTION save error: ' + e.message); }
  }

  /** Delete a saved section by id */
  function deleteSavedSection(id) {
    if (!A.db) return;
    try {
      A.db.run('DELETE FROM saved_sections WHERE id=?', [id]);
      // Clear localStorage backup so zombie re-import doesn't bring it back
      try { localStorage.removeItem(lsKey()); } catch (e) { /* no-op */ }
      loadSavedSections();
      // Update localStorage with whatever remains (may be empty)
      try { localStorage.setItem(lsKey(), JSON.stringify(savedSections)); } catch (e) { /* no-op */ }
      // If all cards deleted, suppress auto-create on next entry
      if (!savedSections.length) {
        try { localStorage.setItem(lsKey() + '_noauto', '1'); } catch (e) { /* no-op */ }
        log('§SAVE_SECTION all deleted — auto-create suppressed');
      }
      log('§SAVE_SECTION deleted id=' + id + ' remaining=' + savedSections.length);
    } catch (e) { log('§SAVE_SECTION delete error: ' + e.message); }
  }

  // Implementing 2D_031 §Card-First — Witness: W-CARD-COMPOSE
  /** Query DB for GUIDs belonging to a storey. One SQL, returns a lookup object.
   *  Uses storey name if available (exact), falls back to Z-band (spatial). */
  function queryStoreyGuids(ifcZ, storeyName) {
    var set = {};
    if (!A.db) return set;
    var t0 = performance.now();
    try {
      var r;
      if (storeyName) {
        r = A.db.exec(
          "SELECT m.guid FROM elements_meta m WHERE m.storey = '" +
          storeyName.replace(/'/g, "''") + "'"
        );
      } else {
        var lo = ifcZ - 2.0, hi = ifcZ + 3.5;
        r = A.db.exec(
          'SELECT guid FROM element_transforms WHERE center_z BETWEEN ' + lo + ' AND ' + hi
        );
      }
      if (r.length && r[0].values.length) {
        for (var i = 0; i < r[0].values.length; i++) set[r[0].values[i][0]] = 1;
      }
      // Include "Unknown" storey elements at same height — IFC often misassigns furniture storey.
      // Without this, IfcFurniture on storey "Unknown" is invisible in 2D cards.
      if (storeyName) {
        var lo2 = ifcZ - 2.0, hi2 = ifcZ + 3.5;
        var r2 = A.db.exec(
          "SELECT m.guid FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
          "WHERE m.storey IN ('Unknown','unknown','') AND t.center_z BETWEEN " + lo2 + " AND " + hi2
        );
        var unknownCount = 0;
        if (r2.length && r2[0].values.length) {
          for (var j = 0; j < r2[0].values.length; j++) { set[r2[0].values[j][0]] = 1; unknownCount++; }
        }
        if (unknownCount) log('§CARD_QUERY +unknown=' + unknownCount + ' (storey=Unknown in Z range)');
      }
    } catch (e) { log('§CARD_QUERY error: ' + e.message); }
    var ms = (performance.now() - t0).toFixed(1);
    log('§CARD_QUERY storey=' + (storeyName || 'z-band') +
        ' guids=' + Object.keys(set).length + ' ms=' + ms);
    return set;
  }

  /** Card-first restore. One DB query → one scene pass → contours.
   *  The card is a self-contained lens: it decides what is visible. */
  function restoreSection(sec) {
    var cutVal = sec.cut_value;
    var vs = sec.view_state || null;
    var cardMode = (vs && vs.mode) ? vs.mode : 'floor';
    var ifcZ = cutVal + (A.modelOffset ? A.modelOffset.z : 0);

    if (A.sectionOn && A.toggleSection) A.toggleSection();
    if (A.status) A.status.textContent = 'Card: ' + sec.name;
    log('§CARD_RESTORE id=' + sec.id + ' name=' + sec.name +
        ' cutVal=' + cutVal.toFixed(2) + ' mode=' + cardMode);

    // 1. Camera — ortho top-down, no clip (card handles visibility itself)
    if (envCache) GridViews.lockView(A, cardMode, envCache, ifcZ, null, true);

    // 2. Query DB — one SQL gets all GUIDs for this storey.
    //    If view_state has no storey (legacy card), detect it from cutZ to avoid
    //    Z-band fallback which leaks elements from adjacent storeys.
    var storeyName = (vs && vs.storey) ? vs.storey : null;
    if (!storeyName && A.db && typeof SectionCut !== 'undefined' && SectionCut.detectStoreys) {
      var allStoreys = SectionCut.detectStoreys(A.db);
      var closest = null, closestDist = Infinity;
      for (var si = 0; si < allStoreys.length; si++) {
        var dist = Math.abs(allStoreys[si].floorZ - (ifcZ - 1.2));
        if (dist < closestDist) { closestDist = dist; closest = allStoreys[si].name; }
      }
      if (closest) {
        storeyName = closest;
        log('§CARD_RESTORE storey inferred from cutZ=' + ifcZ.toFixed(2) + ' → "' + closest + '"');
      }
    }
    var guidSet = queryStoreyGuids(ifcZ, storeyName);

    // 3. One pass — card decides each mesh's fate
    //    Not in storey → hide. In storey → classify by IFC class.
    var hideClasses = (vs && vs.hidden_classes) || ['IfcRoof', 'IfcRoofing'];
    var hideSet = {};
    for (var hi = 0; hi < hideClasses.length; hi++) hideSet[hideClasses[hi]] = 1;
    var fadeSet = { 'IfcSlab': 1, 'IfcPlate': 1 };
    var retainSet = (typeof GridConfig !== 'undefined')
      ? GridConfig.retainSet(cardMode)
      : { 'IfcFurnishingElement': 1, 'IfcFurniture': 1 };

    var cutY = ifcZ - A.modelOffset.z;
    var clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), cutY);
    A.renderer.localClippingEnabled = true;

    // Restore previous card's faded meshes before starting fresh
    for (var pf = 0; pf < _cardFadedMeshes.length; pf++) {
      var pfm = _cardFadedMeshes[pf];
      if (pfm.userData._origOpacity != null) {
        pfm.material.opacity = pfm.userData._origOpacity;
        pfm.material.transparent = pfm.userData._origTransparent;
        pfm.material.needsUpdate = true;
        delete pfm.userData._origOpacity;
        delete pfm.userData._origTransparent;
      }
    }

    var counts = { shown: 0, hidden: 0, clipped: 0, faded: 0, retained: 0 };
    _cardHiddenMeshes = [];
    _cardFadedMeshes = [];

    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(obj) {
      // Skip contour overlay meshes — 2D lines rendered after this pass
      if (obj.userData && obj.userData.isContour) return;

      var guid = (obj.userData && obj.userData.guid) || '';
      var cls  = (obj.userData && obj.userData.ifcClass) || '';

      // No guid (ground plane, helpers, InstancedMesh batches) → hide
      if (!guid) {
        obj.visible = false;
        obj.material.clippingPlanes = null;
        obj.material.clipShadows = false;
        obj.material.needsUpdate = true;
        counts.hidden++;
        return;
      }

      // Not in this storey → hide + clear all stale state from previous card
      if (!guidSet[guid]) {
        obj.visible = false;
        obj.material.clippingPlanes = null;
        obj.material.clipShadows = false;
        obj.material.needsUpdate = true;
        counts.hidden++;
        return;
      }

      // In storey but class-excluded (roof) → hide
      if (hideSet[cls]) {
        obj.visible = false;
        obj.material.clippingPlanes = null;
        obj.material.clipShadows = false;
        obj.material.needsUpdate = true;
        _cardHiddenMeshes.push(obj);
        counts.hidden++;
        return;
      }

      // Slab → clip + near-transparent
      if (fadeSet[cls]) {
        obj.visible = true;
        obj.material.clippingPlanes = [clipPlane];
        obj.material.clipShadows = true;
        if (obj.userData._origOpacity == null) {
          obj.userData._origOpacity = obj.material.opacity;
          obj.userData._origTransparent = obj.material.transparent;
        }
        obj.material.opacity = 0.08;
        obj.material.transparent = true;
        obj.material.needsUpdate = true;
        _cardFadedMeshes.push(obj);
        counts.faded++;
        return;
      }

      // Furniture/equipment → show as-is, clear all stale state
      if (retainSet[cls]) {
        obj.visible = true;
        obj.material.clippingPlanes = null;
        obj.material.clipShadows = false;
        obj.material.needsUpdate = true;
        counts.retained++;
        return;
      }

      // Everything else (walls, columns, beams) → clip at cutZ
      obj.visible = true;
      obj.material.clippingPlanes = [clipPlane];
      obj.material.clipShadows = true;
      obj.material.needsUpdate = true;
      counts.clipped++;
    });

    log('§CARD_RESTORE mesh pass: shown=' + (counts.clipped + counts.retained + counts.faded) +
        ' hidden=' + counts.hidden + ' clipped=' + counts.clipped +
        ' faded=' + counts.faded + ' retained=' + counts.retained);

    // 4. Contours (clear disposes all: fills, strokes, arcs, stairs, windows, labels)
    if (typeof GridContours !== 'undefined') GridContours.clear(A);
    try { renderContoursForView('floor', ifcZ); } catch (e) {
      log('§CARD_RESTORE contour error: ' + e.message);
    }

    // 5. Camera restore
    if (vs && vs.camera) GridViews.applyCameraState(A, vs.camera);

    clampBubbleScales();
    updateViewButtons();
    log('§CARD_RESTORE done guids=' + Object.keys(guidSet).length);
  }

  // Card cleanup state — restored by clearStoreyBandVisibility (all visible=true)
  // and by toggleGridOverlay exit path
  var _cardHiddenMeshes = [];
  var _cardFadedMeshes = [];

  /** Undo card mesh treatment (called on grid mode exit) */
  function clearCardView() {
    for (var i = 0; i < _cardHiddenMeshes.length; i++) {
      _cardHiddenMeshes[i].visible = true;
    }
    for (var f = 0; f < _cardFadedMeshes.length; f++) {
      var fm = _cardFadedMeshes[f];
      if (fm.userData._origOpacity != null) {
        fm.material.opacity = fm.userData._origOpacity;
        fm.material.transparent = fm.userData._origTransparent;
        fm.material.needsUpdate = true;
        delete fm.userData._origOpacity;
        delete fm.userData._origTransparent;
      }
    }
    // Clear clip planes on all meshes
    A.collectMeshes(function(o) { return o.isMesh; }).forEach(function(obj) {
      obj.visible = true;
      obj.material.clippingPlanes = null;
      obj.material.clipShadows = false;
      obj.material.needsUpdate = true;
    });
    A.renderer.localClippingEnabled = false;
    _cardHiddenMeshes = [];
    _cardFadedMeshes = [];
  }

  // Implementing 2D_031 §P3 — Witness: W-CARD-AUTO
  /** Auto-create GF + L1 cards on first grid mode entry if no cards exist */
  function autoCreateCards() {
    if (!A.db || savedSections.length > 0) return;
    // If user manually deleted all cards, don't re-create (flag in localStorage)
    try {
      if (localStorage.getItem(lsKey() + '_noauto') === '1') {
        log('§VIEW_CARD auto-create suppressed (user cleared all)');
        return;
      }
    } catch(e) {}
    if (typeof SectionCut === 'undefined' || !SectionCut.detectStoreys) return;
    var storeys = SectionCut.detectStoreys(A.db);
    if (!storeys.length) return;
    var CUT_ABOVE = 1.2;
    // Filter significant storeys (≥5 elements)
    var significant = storeys.filter(function(s) { return s.elementCount >= 5; });
    if (!significant.length) return;

    // Door-count ranking — same as computeStoreyAwareCutZ.
    // Habitable storeys have doors. Foundation/basement usually has zero.
    var storeyDoorCounts = {};
    try {
      var dr = A.db.exec(
        "SELECT m.storey, COUNT(*) FROM elements_meta m " +
        "WHERE m.ifc_class IN ('IfcDoor','IfcDoorStandardCase') AND m.storey IS NOT NULL " +
        "GROUP BY m.storey"
      );
      if (dr.length && dr[0].values.length) {
        for (var di = 0; di < dr[0].values.length; di++) {
          storeyDoorCounts[dr[0].values[di][0]] = Number(dr[0].values[di][1]);
        }
      }
    } catch (e) { /* no door metadata — fall back to floorZ order */ }

    significant.sort(function(a, b) {
      var da = storeyDoorCounts[a.name] || 0;
      var db2 = storeyDoorCounts[b.name] || 0;
      if (da !== db2) return db2 - da;                         // more doors first
      return Math.abs(a.floorZ) - Math.abs(b.floorZ);         // then closest to z=0
    });
    log('§VIEW_CARD storey ranking: ' + significant.map(function(s) {
      return s.name + '(doors=' + (storeyDoorCounts[s.name] || 0) + ',z=' + s.floorZ.toFixed(1) + ')';
    }).join(', '));

    // GF card
    var gfZ = significant[0].floorZ + CUT_ABOVE;
    var gfState = {
      hidden_classes: Object.keys(GridViews.HIDE_IN_FLOOR || {}),
      camera: null,
      storey: significant[0].name || 'Ground Floor',
      mode: 'floor'
    };
    ensureSavedSectionsTable(A.db);
    var ts = new Date().toISOString().slice(0, 10);
    var gfCutVal = gfZ - (A.modelOffset ? A.modelOffset.z : 0);
    try {
      A.db.run(
        'INSERT INTO saved_sections (name,cut_value,plane_normal,timestamp,view_state) VALUES(?,?,?,?,?)',
        ['GF', gfCutVal, '[0,-1,0]', ts, JSON.stringify(gfState)]
      );
    } catch (e) { log('§VIEW_CARD auto GF error: ' + e.message); }

    // L1 card — only if building has >1 significant storey
    if (significant.length > 1) {
      var l1Z = significant[1].floorZ + CUT_ABOVE;
      var l1State = {
        hidden_classes: Object.keys(GridViews.HIDE_IN_FLOOR || {}),
        camera: null,
        storey: significant[1].name || 'Level 1',
        mode: 'floor1'
      };
      var l1CutVal = l1Z - (A.modelOffset ? A.modelOffset.z : 0);
      try {
        A.db.run(
          'INSERT INTO saved_sections (name,cut_value,plane_normal,timestamp,view_state) VALUES(?,?,?,?,?)',
          ['L1', l1CutVal, '[0,-1,0]', ts, JSON.stringify(l1State)]
        );
      } catch (e) { log('§VIEW_CARD auto L1 error: ' + e.message); }
    }

    loadSavedSections();
    log('§VIEW_CARD auto-created cards=' + savedSections.length +
        ' storeys=' + significant.length);
  }

  function buildPanel(grids) {
    currentPanelGrids = grids;
    if (gridPanel) gridPanel.remove();

    gridPanel = document.createElement('div');
    gridPanel.id = PANEL_ID;
    // Position below HUD so it doesn't cover building list/tools
    var _hudEl = document.getElementById('hud');
    var _gridTop = _hudEl ? (Math.round(_hudEl.getBoundingClientRect().bottom) + 8) : 56;
    gridPanel.style.cssText = 'position:fixed;top:' + _gridTop + 'px;left:16px;z-index:25;background:' + panelBg() + ';border-radius:8px;padding:0;border:1px solid ' + panelBorder() + ';backdrop-filter:blur(8px);min-width:180px;max-width:260px';
    gridPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px">' +
      '<b style="color:' + panelText() + ';font-size:12px;font-weight:bold;cursor:grab" onclick="togglePanel(\'grid-panel-body\')">Plan Grid</b>' +
      '<span id="grid-panel-close" style="color:#888;font-size:16px;cursor:pointer;padding:0 4px;line-height:1" title="Close grid panel">&times;</span></div>' +
      '<div id="grid-panel-body" class="panel-body" style="max-height:300px;overflow-y:auto;padding:4px 10px"></div>';
    document.body.appendChild(gridPanel);

    // Close button
    var closeBtn = document.getElementById('grid-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        if (gridPanel) gridPanel.style.display = 'none';
      });
    }
    if (A._makeDraggable) A._makeDraggable(gridPanel);

    // S251: Register grid panel for Tab/arrow navigation
    // View preset buttons auto-activate on cursor move (no Space needed)
    if (typeof window._registerPanel === 'function' && typeof window.makeListKeyNav === 'function') {
      var _gridGetItems = function() { return Array.from(gridPanel.querySelectorAll('button, .panel-toggle, input[type="range"]')); };
      var _gridNav = window.makeListKeyNav(
        _gridGetItems,
        function() {},
        function(idx) {
          var items = _gridGetItems();
          if (items[idx]) {
            // BUG-4 fix: view buttons listen on pointerup, not click
            items[idx].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            console.log('§GRID_ACTIVATE idx=' + idx + ' label="' + (items[idx].textContent || '').trim() + '"');
          }
        }
      );
      // Esc exits 2D overlay entirely (back to 3D)
      var _gridClose = function() { A.toggleGridOverlay(); };
      // Remove old grid registration before re-adding (buildPanel is called multiple times)
      if (window._panels) {
        for (var _pi = window._panels.length - 1; _pi >= 0; _pi--) {
          if (window._panels[_pi].id === 'grid') { window._panels.splice(_pi, 1); break; }
        }
      }
      window._registerPanel('grid', gridPanel, _gridNav, _gridClose);
      // Auto-focus grid panel when it opens
      if (typeof window._focusPanel === 'function') {
        setTimeout(function() { window._focusPanel('grid'); }, 100);
      }
      log('§LISTNAV_WIRE panel=grid');
    }

    var body = document.getElementById('grid-panel-body');
    if (!body) return;

    // View preset buttons at the top of the panel
    var viewHtml = '<div style="display:flex;gap:3px;margin:4px 0 6px;flex-wrap:wrap">';
    var views = [
      { key: 'floor', label: 'GF' },
      { key: 'floor1', label: 'L1' },
      { key: 'front', label: 'Front' },
      { key: 'rear', label: 'Back' },
      { key: 'left', label: 'Left' },
      { key: 'right', label: 'Right' },
      { key: 'roof', label: 'Roof' },
      { key: 'unlock', label: '\uD83D\uDD13' }
    ];
    for (var vi = 0; vi < views.length; vi++) {
      var vStyle = (views[vi].key === GridViews.activeView()) ? VIEW_BTN_ACTIVE : VIEW_BTN_DEFAULT;
      viewHtml += '<button class="grid-view-btn" data-view="' + views[vi].key + '" style="' + vStyle + '">' + views[vi].label + '</button>';
    }
    viewHtml += '</div>';

    // Saved Cuts removed — scissors is for grid detection only.

    // Saved section buttons (below view presets)
    if (savedSections.length > 0) {
      viewHtml += '<div style="display:flex;gap:3px;margin:0 0 4px;flex-wrap:wrap;align-items:center">';
      for (var si = 0; si < savedSections.length; si++) {
        var ss = savedSections[si];
        var sName = ss.name.length > 14 ? ss.name.slice(0, 12) + '\u2026' : ss.name;
        var ssStyle = (ss.id === latestSavedId) ? VIEW_BTN_LATEST : VIEW_BTN_SAVED;
        viewHtml += '<button class="saved-section-btn" data-id="' + ss.id + '" style="' +
          ssStyle + ';border-style:dashed" title="' + ss.name + '">' + sName + '</button>';
        viewHtml += '<button class="saved-section-del" data-id="' + ss.id +
          '" style="background:#a00;color:#fff;border:none;border-radius:3px;padding:1px 5px;font-size:10px;cursor:pointer;margin-left:-2px" title="Delete">&#x2715;</button>';
      }
      viewHtml += '</div>';
    }
    // BUG-2 fix: Save ✚ button — lets user save current view as a card from 2D mode
    // (section-slider-panel is hidden in 2D, so this is the only save path)
    viewHtml += '<button id="grid-save-section-btn" style="' + VIEW_BTN_DEFAULT +
      ';width:100%;margin:2px 0" title="Save current view as a card">Save ✚</button>';

    var html = viewHtml;

    var xLines = grids.xLines || [];
    if (xLines.length > 1) {
      html += '<div style="color:' + panelSubText() + ';font-size:10px;margin:4px 0 2px;border-bottom:1px solid ' + panelDivider() + '">X-Axis (1,2,3…)</div>';
      for (var i = 0; i < xLines.length - 1; i++) {
        var dist = Math.abs(xLines[i + 1].position - xLines[i].position);
        var lbl = xLines[i].label + '–' + xLines[i + 1].label;
        html += '<div class="grid-row" data-label="' + xLines[i].label + '" data-label-end="' + xLines[i + 1].label + '" style="padding:3px 4px;cursor:pointer;border-radius:3px;font-size:12px;display:flex;justify-content:space-between">' +
          '<span>' + lbl + '</span><span style="color:' + panelDimText() + '">' + (dist * 1000).toFixed(0) + ' mm</span></div>';
      }
      var totalX = Math.abs(xLines[xLines.length - 1].position - xLines[0].position);
      html += '<div style="padding:3px 4px;font-size:11px;color:' + panelTotalText() + ';display:flex;justify-content:space-between"><span>' +
        xLines[0].label + '–' + xLines[xLines.length - 1].label + ' total</span><span>' + (totalX * 1000).toFixed(0) + ' mm</span></div>';
    }

    var yLines = grids.yLines || [];
    if (yLines.length > 1) {
      html += '<div style="color:' + panelSubText() + ';font-size:10px;margin:8px 0 2px;border-bottom:1px solid ' + panelDivider() + '">Y-Axis (A,B,C…)</div>';
      for (var j = 0; j < yLines.length - 1; j++) {
        var dist2 = Math.abs(yLines[j + 1].position - yLines[j].position);
        var lbl2 = yLines[j].label + '–' + yLines[j + 1].label;
        html += '<div class="grid-row" data-label="' + yLines[j].label + '" data-label-end="' + yLines[j + 1].label + '" style="padding:3px 4px;cursor:pointer;border-radius:3px;font-size:12px;display:flex;justify-content:space-between">' +
          '<span>' + lbl2 + '</span><span style="color:' + panelDimText() + '">' + (dist2 * 1000).toFixed(0) + ' mm</span></div>';
      }
      var totalY = Math.abs(yLines[yLines.length - 1].position - yLines[0].position);
      html += '<div style="padding:3px 4px;font-size:11px;color:' + panelTotalText() + ';display:flex;justify-content:space-between"><span>' +
        yLines[0].label + '–' + yLines[yLines.length - 1].label + ' total</span><span>' + (totalY * 1000).toFixed(0) + ' mm</span></div>';
    }

    if (!html) html = '<div style="color:#888;font-size:11px;padding:8px">No grids detected</div>';

    body.innerHTML = html;

    var rows = body.querySelectorAll('.grid-row');
    for (var r = 0; r < rows.length; r++) {
      rows[r].addEventListener('pointerup', onPanelRowClick);
    }

    // View preset button listeners
    var vBtns = body.querySelectorAll('.grid-view-btn');
    for (var vb = 0; vb < vBtns.length; vb++) {
      vBtns[vb].addEventListener('pointerup', onViewBtnClick);
    }

    // Saved Cut buttons removed — scissors is for grid detection only.

    // Saved section restore buttons — pointerdown stops panel drag capture
    var ssBtns = body.querySelectorAll('.saved-section-btn');
    for (var ssb = 0; ssb < ssBtns.length; ssb++) {
      ssBtns[ssb].addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      ssBtns[ssb].addEventListener('pointerup', function(e) {
        e.stopPropagation();
        var id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        var sec = null;
        for (var si2 = 0; si2 < savedSections.length; si2++) {
          if (savedSections[si2].id === id) { sec = savedSections[si2]; break; }
        }
        if (sec) {
          log('§SAVE_SECTION restore clicked id=' + id + ' name=' + (sec.name || '?'));
          restoreSection(sec);
        }
      });
    }

    // Saved section delete buttons
    // pointerdown stopPropagation prevents _makeDraggable from calling setPointerCapture
    // on the panel when the delete button is within the drag strip — without this,
    // the pointer is captured by the panel and the button's pointerup never fires.
    var ssDels = body.querySelectorAll('.saved-section-del');
    for (var ssd = 0; ssd < ssDels.length; ssd++) {
      ssDels[ssd].addEventListener('pointerdown', function(e) { e.stopPropagation(); });
      ssDels[ssd].addEventListener('pointerup', function(e) {
        e.stopPropagation();
        var id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        deleteSavedSection(id);
        clearCardView();  // undo card mesh state if the active card was deleted
        if (GridViews.activeView()) GridViews.clearFloorClip(A);
        buildPanel(currentPanelGrids || gridData);
      });
    }

    // Save ✚ button — saves current 2D view as a card
    var saveSBtn = body.querySelector('#grid-save-section-btn');
    if (saveSBtn) {
      saveSBtn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        // In 2D mode scissors is OFF, so use storey-aware cutZ instead of sectionPlane
        var mode = GridViews.activeView();
        var cutZ = computeStoreyAwareCutZ(mode);
        var cutVal;
        if (cutZ != null) {
          cutVal = cutZ - (A.modelOffset ? A.modelOffset.z : 0);
        } else {
          cutVal = A.sectionPlane ? A.sectionPlane.constant : 0;
        }
        var defaultName = (mode || 'Section') + ' @' + cutVal.toFixed(1) + 'm';
        var name = window.prompt('Section name:', defaultName);
        if (!name) return;

        // Set sectionPlane so saveSectionToDb captures the right value
        if (A.sectionPlane) A.sectionPlane.constant = cutVal;
        saveSectionToDb(name, null);
        buildPanel(currentPanelGrids || gridData);
        log('§SAVE_SECTION from grid panel mode=' + mode + ' cutVal=' + cutVal.toFixed(2) + ' name=' + name);
      });
    }
  }

  // ── Click-to-Zoom + Orange Highlight ──────────────────────────────

  function onPanelRowClick(e) {
    var label = e.currentTarget.getAttribute('data-label');
    var labelEnd = e.currentTarget.getAttribute('data-label-end');
    if (!label) return;
    highlightGrid(label, labelEnd);
    zoomToGrid(label);
  }

  function highlightGrid(label, labelEnd) {
    // Reset all lines to theme-aware default
    var defColor = lineColor();
    for (var key in lineMeshes) {
      if (lineMeshes[key].line) {
        lineMeshes[key].line.material.color.setHex(defColor);
        lineMeshes[key].line.material.linewidth = 1;
      }
    }

    // Reset panel row highlights
    if (gridPanel) {
      var rows = gridPanel.querySelectorAll('.grid-row');
      for (var i = 0; i < rows.length; i++) {
        rows[i].style.background = '';
        rows[i].style.color = '';
      }
    }

    // Remove previous slab
    if (gridGroup) {
      var toRemove = [];
      gridGroup.traverse(function(obj) {
        if (obj.userData && obj.userData.isHighlightSlab) toRemove.push(obj);
      });
      for (var r = 0; r < toRemove.length; r++) {
        if (toRemove[r].geometry) toRemove[r].geometry.dispose();
        if (toRemove[r].material) toRemove[r].material.dispose();
        gridGroup.remove(toRemove[r]);
      }
    }

    selectedLabel = label;
    var highlightSet = {};
    highlightSet[label] = true;
    if (labelEnd) highlightSet[labelEnd] = true;

    // Highlight BOTH grid lines — bright orange, thicker
    for (var hl in highlightSet) {
      if (lineMeshes[hl] && lineMeshes[hl].line) {
        lineMeshes[hl].line.material.color.setHex(COLOR_HIGHLIGHT);
        lineMeshes[hl].line.material.linewidth = 3;
      }
    }

    // Orange transparent slab between the two grid lines
    if (labelEnd && lineMeshes[label] && lineMeshes[labelEnd] && gridGroup) {
      var a = lineMeshes[label];
      var b = lineMeshes[labelEnd];
      // Build quad from the 4 corners: a.v0, a.v1, b.v1, b.v0
      var slabGeo = new THREE.BufferGeometry();
      var positions = new Float32Array([
        a.v0.x, a.v0.y, a.v0.z,
        a.v1.x, a.v1.y, a.v1.z,
        b.v1.x, b.v1.y, b.v1.z,
        a.v0.x, a.v0.y, a.v0.z,
        b.v1.x, b.v1.y, b.v1.z,
        b.v0.x, b.v0.y, b.v0.z
      ]);
      slabGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      var slabMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthTest: false
      });
      var slab = new THREE.Mesh(slabGeo, slabMat);
      slab.renderOrder = 998;
      slab.userData.isHighlightSlab = true;
      gridGroup.add(slab);
    }

    // Highlight matching panel rows
    if (gridPanel) {
      var matching = gridPanel.querySelectorAll('.grid-row[data-label="' + label + '"]');
      for (var j = 0; j < matching.length; j++) {
        matching[j].style.background = 'rgba(255,102,0,0.25)';
        matching[j].style.color = '#ff6600';
      }
    }

    // Rebuild bubbles with highlight state
    if (gridGroup) {
      gridGroup.traverse(function(obj) {
        if (obj.isSprite && obj.userData.gridLabel) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
          var isHL = !!highlightSet[obj.userData.gridLabel];
          var fresh = createBubble(obj.userData.gridLabel, obj.position, isHL);
          obj.material = fresh.material;
        }
      });
    }

    A.markDirty();
    log('§GRID_ZOOM highlight=' + label + (labelEnd ? '+' + labelEnd : '') + ' slab=' + !!labelEnd);
  }

  function zoomToGrid(label) {
    var entry = lineMeshes[label];
    if (!entry) { log('§GRID_ZOOM FAIL label=' + label + ' not found'); return; }

    // Cancel any running zoom animation
    if (zoomAnim) { cancelAnimationFrame(zoomAnim); zoomAnim = null; }

    // Line midpoint (where we look at)
    var mid = new THREE.Vector3().addVectors(entry.v0, entry.v1).multiplyScalar(0.5);

    // Line length determines how far the camera should be
    var lineLen = entry.v0.distanceTo(entry.v1);

    // Camera: position slightly above and to the side, at a distance that frames the line
    // Keep roughly current viewing angle but re-target to grid midpoint
    var camDir = A.camera.position.clone().sub(A.controls.target).normalize();
    var dist = lineLen * 1.2;
    // Ensure minimum distance so we don't clip into the model
    dist = Math.max(dist, 10);
    var targetCamPos = mid.clone().add(camDir.multiplyScalar(dist));

    log('§GRID_ZOOM label=' + label +
        ' mid=(' + mid.x.toFixed(1) + ',' + mid.y.toFixed(1) + ',' + mid.z.toFixed(1) + ')' +
        ' lineLen=' + lineLen.toFixed(1) + ' camDist=' + dist.toFixed(1));

    // Animate (20 frames ≈ 330ms)
    var startPos = A.camera.position.clone();
    var startTarget = A.controls.target.clone();
    var frame = 0;
    var totalFrames = 20;

    function step() {
      frame++;
      var t = frame / totalFrames;
      t = t * (2 - t); // ease-out quadratic
      A.camera.position.lerpVectors(startPos, targetCamPos, t);
      A.controls.target.lerpVectors(startTarget, mid, t);
      A.controls.update();
      A.markDirty();
      if (frame < totalFrames) {
        zoomAnim = requestAnimationFrame(step);
      } else {
        zoomAnim = null;
      }
    }
    zoomAnim = requestAnimationFrame(step);
  }

  // ── Undo/Redo Buttons (bottom-right) ───────────────────────────────
  var undoRedoDiv = null;

  function showUndoRedo() {
    if (undoRedoDiv) { undoRedoDiv.style.display = 'flex'; return; }
    undoRedoDiv = document.createElement('div');
    undoRedoDiv.id = 'undo-redo-btns';
    undoRedoDiv.style.cssText = 'position:fixed;bottom:32px;right:16px;z-index:25;display:flex;gap:4px';

    var btnStyle = 'background:rgba(30,50,80,0.7);color:#4fc3f7;border:1px solid rgba(255,255,255,0.15);' +
      'border-radius:6px;padding:6px 10px;font-size:16px;cursor:pointer;backdrop-filter:blur(6px);' +
      'min-width:36px;text-align:center';

    var undoBtn = document.createElement('button');
    undoBtn.id = 'kernel-undo-btn';
    undoBtn.title = 'Undo (Ctrl+Z)';
    undoBtn.style.cssText = btnStyle;
    undoBtn.textContent = '\u21A9';
    undoBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      doUndo();
    });

    var redoBtn = document.createElement('button');
    redoBtn.id = 'kernel-redo-btn';
    redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    redoBtn.style.cssText = btnStyle;
    redoBtn.textContent = '\u21AA';
    redoBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      doRedo();
    });

    undoRedoDiv.appendChild(undoBtn);
    undoRedoDiv.appendChild(redoBtn);
    document.body.appendChild(undoRedoDiv);
    log('§UNDO_REDO buttons added');
  }

  function hideUndoRedo() {
    if (undoRedoDiv) undoRedoDiv.style.display = 'none';
  }

  // Op types that are undoable (user actions). Others are audit-only.
  var UNDOABLE_OPS = { 'GRID_MOVE': true };

  /** Dispatch undo — skip audit-only ops (GRID_DETECT, SESSION_START, etc.) */
  function doUndo() {
    if (!A.db || !window.KernelOps) return;
    // Keep undoing until we find an undoable op or run out
    var op = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      op = KernelOps.undoOp(A.db);
      if (!op) { log('§UNDO nothing to undo'); return; }
      if (UNDOABLE_OPS[op.op_type]) break;
      log('§UNDO skip audit op=' + op.op_type + ' id=' + op.id);
      op = null;
    }
    if (!op) { log('§UNDO no undoable ops found'); return; }
    log('§UNDO op=' + op.op_type + ' id=' + op.id);
    if (op.op_type === 'GRID_MOVE' && typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) {
      GridDrag.applyReplayedMove(op.parameters.axis, op.parameters.label, op.parameters.from);
    }
    A.markDirty();
  }

  /** Dispatch redo — skip audit-only ops */
  function doRedo() {
    if (!A.db || !window.KernelOps) return;
    var op = null;
    for (var attempt = 0; attempt < 10; attempt++) {
      op = KernelOps.redoOp(A.db);
      if (!op) { log('§REDO nothing to redo'); return; }
      if (UNDOABLE_OPS[op.op_type]) break;
      log('§REDO skip audit op=' + op.op_type + ' id=' + op.id);
      op = null;
    }
    if (!op) { log('§REDO no undoable ops found'); return; }
    log('§REDO op=' + op.op_type + ' id=' + op.id);
    if (op.op_type === 'GRID_MOVE' && typeof GridDrag !== 'undefined' && GridDrag.applyReplayedMove) {
      GridDrag.applyReplayedMove(op.parameters.axis, op.parameters.label, op.parameters.to);
    }
    A.markDirty();
  }

  // ── Toggle ────────────────────────────────────────────────────────

  A.toggleGridOverlay = function() {
    if (active) {
      active = false;
      if (zoomAnim) { cancelAnimationFrame(zoomAnim); zoomAnim = null; }
      if (typeof GridContours !== 'undefined') GridContours.clear(A);
      GridViews.clearFloorClip(A);
      if (GridViews.activeView()) GridViews.unlockView(A);
      // S250 §6: Dispose all canvas textures (bubbles + dim labels) to free GPU memory
      if (gridGroup) {
        var texCount = 0;
        gridGroup.traverse(function(obj) {
          if (obj.material && obj.material.map) {
            obj.material.map.dispose();
            texCount++;
          }
          if (obj.material) obj.material.dispose();
          if (obj.geometry) obj.geometry.dispose();
        });
        A.scene.remove(gridGroup);
        console.log('§GRID_TEARDOWN disposing ' + texCount + ' textures');
        gridGroup = null;
        gridData = null;
        lineMeshes = {};
      }
      if (gridPanel) { gridPanel.style.display = 'none'; }
      hideUndoRedo();
      // Restore all mesh visibility — card view + band filter hide meshes, must undo on exit
      clearCardView();
      clearStoreyBandVisibility();
      // Un-highlight 2D button, un-grey Measure button
      var btn2d = document.getElementById('grid-2d-btn');
      if (btn2d) { btn2d.style.background = '#444'; btn2d.style.borderColor = '#666'; }
      var mBtn = document.getElementById('measure-btn');
      if (mBtn) { mBtn.style.opacity = '1'; }
      A.markDirty();
      log('§GRID_MODE state=exit');
      return;
    }

    active = true;
    // Highlight 2D button, grey out Measure button
    var btn2d = document.getElementById('grid-2d-btn');
    if (btn2d) { btn2d.style.background = '#4fc3f7'; btn2d.style.borderColor = '#4fc3f7'; }
    var mBtn = document.getElementById('measure-btn');
    if (mBtn) { mBtn.style.opacity = '0.3'; }
    log('§GRID_MODE state=enter');

    // If already built, just show
    if (gridGroup && gridData) {
      gridGroup.visible = true;
      if (gridPanel) gridPanel.style.display = '';
      A.markDirty();
      return;
    }

    // Preflight
    if (typeof GridDims === 'undefined' || !GridDims.detectGrids) {
      log('§GRID_DETECT ERROR: GridDims not available');
      A.status.textContent = 'Grid detection unavailable';
      active = false;
      return;
    }
    if (!A.db) {
      log('§GRID_DETECT ERROR: no database loaded');
      A.status.textContent = 'Load a building first';
      active = false;
      return;
    }

    // Implementing 2D_028 §5.1 — Witness: W-2D28
    // Pass loaded rules to opportunity-vote algorithm
    var rules = window._gridRules || {};
    gridData = GridDims.detectGrids(A.db, null, rules);
    log('§GRID_DETECT xLines=' + (gridData.xLines || []).length + ' yLines=' + (gridData.yLines || []).length);

    // Implementing 2D_029 §2.4 — Witness: W-2D29
    // Session boundary + compact + replay saved ops
    if (window.KernelOps && A.db) {
      try {
        // Mark session start — compact uses these to prune old sessions
        KernelOps.sessionStart(A.db);
        // Compact: collapse duplicate GRID_MOVEs, prune undone ops, trim old sessions
        var compactResult = KernelOps.compact(A.db);
        log('§KERNEL_OP compact collapsed=' + compactResult.collapsed +
            ' pruned=' + compactResult.pruned + ' remaining=' + compactResult.total);
        // Replay saved GRID_MOVE ops to restore positions from previous session
        var savedMoves = KernelOps.replayOps(A.db, 'GRID_MOVE');
        savedMoves.forEach(function (op) {
          var p = op.parameters;
          // Update gridData positions first (needed before shiftLine)
          var lines = p.axis === 'X' ? gridData.xLines : gridData.yLines;
          if (!lines) return;
          var line = lines.find(function (l) { return l.label === p.label; });
          if (line) { line.position = p.to; line.rawPosition = p.to; }
          // Apply cascade element DB positions (meshes re-created from DB on load, so positions correct)
          if (p.cascade && p.cascade.length) {
            for (var ci = 0; ci < p.cascade.length; ci++) {
              var cm = p.cascade[ci];
              try {
                A.db.run('UPDATE element_transforms SET center_x = ?, center_y = ? WHERE guid = ?',
                         [cm.newX, cm.newY, cm.guid]);
              } catch (e) { /* element may not exist after re-extract */ }
            }
            log('§KERNEL_REPLAY_CASCADE op=' + op.id + ' elements=' + p.cascade.length);
          }
        });
        log('§KERNEL_OP replay moves=' + savedMoves.length);
      } catch (e) {
        log('§KERNEL_OP replay ERROR: ' + e.message);
      }
    } else {
      log('§KERNEL_OP skip — KernelOps=' + (!!window.KernelOps) + ' db=' + (!!A.db));
    }

    if ((!gridData.xLines || !gridData.xLines.length) && (!gridData.yLines || !gridData.yLines.length)) {
      A.status.textContent = 'No grid lines detected (need ≥2 columns)';
      active = false;
      return;
    }

    dimsData = GridDims.generateDimensions(gridData);

    // Get building envelope from DB — not from scene (scene has 50km ground plane)
    envCache = getBuildingEnvelopeIFC();
    buildGridScene(gridData, envCache);
    loadSavedSections();           // fill savedSections[] before buildPanel renders them
    autoCreateCards();             // P3: auto GF + L1 cards on first entry
    buildPanel(gridData);
    buildDimChains(gridData, envCache);
    showUndoRedo();

    A.status.textContent = 'Grid mode — ' + ((gridData.xLines || []).length + (gridData.yLines || []).length) + ' grid lines';
  };

  window.toggleGridOverlay = A.toggleGridOverlay;

  /** Public: save current scissors cut as a section card, rebuild panel.
   *  Called by tools.js Save Cut button when in 2D + scissors mode. */
  A.saveSectionFromScissors = function() {
    if (!A.db || !A.sectionOn) return;
    var cutVal = A.sectionPlane ? A.sectionPlane.constant : 0;
    var name = 'Section @' + cutVal.toFixed(1) + 'm';
    saveSectionToDb(name, null);
    buildPanel(currentPanelGrids || gridData);
    log('§SAVE_SECTION from scissors cutVal=' + cutVal.toFixed(2));
  };

  /** Public: is a 2D floor view currently active? */
  A.isIn2DView = function() {
    var v = GridViews.activeView();
    return v === 'floor' || v === 'floor1';
  };

  // React to theme changes (sunglasses toggle) — update line/bubble/panel colors
  var _origToggleTheme = A.toggleTheme;
  A.toggleTheme = function() {
    _origToggleTheme.call(A);
    if (!active || !gridGroup) return;
    var def = lineColor();
    for (var key in lineMeshes) {
      if (lineMeshes[key].line) {
        lineMeshes[key].line.material.color.setHex(key === selectedLabel ? COLOR_HIGHLIGHT : def);
      }
    }
    // Rebuild bubbles with new theme colors
    gridGroup.traverse(function(obj) {
      if (obj.isSprite && obj.userData.gridLabel) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
        var isHL = (obj.userData.gridLabel === selectedLabel);
        var fresh = createBubble(obj.userData.gridLabel, obj.position, isHL);
        obj.material = fresh.material;
      }
    });
    // Update panel colors — rebuild to pick up new theme text colors
    if (gridPanel && gridData) {
      gridPanel.style.background = panelBg();
      gridPanel.style.borderColor = panelBorder();
      buildPanel(gridData);
    }
    // Rebuild dimension text sprites with new theme colors
    if (gridGroup && gridData && envCache) {
      removeDimChains();
      buildDimChains(gridData, envCache);
    }
    A.markDirty();
  };

  // ── §3 3D Grid Planes ────────────────────────────────────────────
  // Implementing 2D_029 §3.1–§3.2 — Witness: W-2D29
  var gridPlanes3DGroup = null;

  function createGridPlane3D(axis, ifcPos, env, rules) {
    var p3d = (rules && rules.plane_3d) || {};
    var opacity = p3d.plane_opacity || 0.12;
    var colorX  = p3d.plane_color_x || '#ff4444';
    var colorY  = p3d.plane_color_y || '#4444ff';
    var color = axis === 'X' ? colorX : colorY;

    var height = env.zMax - env.zMin;
    var width  = axis === 'X' ? (env.yMax - env.yMin) : (env.xMax - env.xMin);

    var geo = new THREE.PlaneGeometry(width, height);
    var mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    var mesh = new THREE.Mesh(geo, mat);

    var midZ = (env.zMin + env.zMax) / 2;
    if (axis === 'X') {
      var p = A.ifc2three(ifcPos, (env.yMin + env.yMax) / 2, midZ);
      mesh.position.set(p.x, p.y, p.z);
      mesh.rotation.y = Math.PI / 2;
    } else {
      var p = A.ifc2three((env.xMin + env.xMax) / 2, ifcPos, midZ);
      mesh.position.set(p.x, p.y, p.z);
    }

    mesh.userData = { gridAxis: axis, gridPos: ifcPos, isGridPlane: true };
    mesh.renderOrder = -1;
    return mesh;
  }

  function renderGridPlanesIn3D(grids, env, rules) {
    removeGridPlanes3D();
    var group = new THREE.Group();
    group.name = 'gridPlanes3D';
    var count = 0;
    grids.xLines.forEach(function (line) {
      group.add(createGridPlane3D('X', line.position, env, rules));
      count++;
    });
    grids.yLines.forEach(function (line) {
      group.add(createGridPlane3D('Y', line.position, env, rules));
      count++;
    });
    A.scene.add(group);
    gridPlanes3DGroup = group;
    A.markDirty();
    log('§GRID_3D_PLANES count=' + count + ' mode=adjust');
    return group;
  }

  function removeGridPlanes3D() {
    if (gridPlanes3DGroup) {
      gridPlanes3DGroup.traverse(function (c) {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      A.scene.remove(gridPlanes3DGroup);
      gridPlanes3DGroup = null;
    }
  }

  // ── §6 Storey Band Visibility Filter ────────────────────────────
  // Implementing 2D_029 §6.1 — Witness: W-2D29
  function applyStoreyBandVisibility(bandMin, bandMax) {
    var shown = 0, hidden = 0;
    // Batch-load center_z for all elements — one query, not per-mesh
    var czMap = {};
    if (A.db) {
      try {
        var r = A.db.exec('SELECT guid, center_z FROM element_transforms');
        if (r.length && r[0].values.length) {
          for (var qi = 0; qi < r[0].values.length; qi++) {
            czMap[r[0].values[qi][0]] = Number(r[0].values[qi][1]);
          }
        }
      } catch (e) { log('§GRID_3D_BAND_VIS batch query error: ' + e.message); }
    }
    A.scene.traverse(function (obj) {
      if (!obj.isMesh || !obj.userData.guid) return;
      var cz = obj.userData.center_z;
      if (cz === undefined) {
        cz = czMap[obj.userData.guid];
        if (cz !== undefined) obj.userData.center_z = cz;
      }
      if (cz === undefined) return;
      if (cz >= bandMin && cz <= bandMax) {
        obj.visible = true;
        shown++;
      } else {
        obj.visible = false;
        hidden++;
      }
    });
    A.markDirty();
    log('§GRID_3D_BAND_VIS bandMin=' + bandMin.toFixed(2) +
        ' bandMax=' + bandMax.toFixed(2) + ' shown=' + shown + ' hidden=' + hidden);

    if (window.KernelOps && A.db) {
      KernelOps.commitOp(A.db, 'VIEW_FILTER', {
        mode: 'storey_band', bandMin: bandMin, bandMax: bandMax,
        shown: shown, hidden: hidden
      });
    }
  }

  function clearStoreyBandVisibility() {
    A.scene.traverse(function (obj) {
      if (obj.isMesh && obj.userData.guid) obj.visible = true;
    });
    A.markDirty();
    log('§GRID_3D_BAND_VIS cleared');
  }

  // ── State accessor for GridDrag ──────────────────────────────────
  // Exposes closure variables as a live-read object so grid_drag.js
  // can access scene state without coupling to internals.
  A._gridOverlayState = {
    get active()      { return active; },
    get gridGroup()   { return gridGroup; },
    get gridData()    { return gridData; },
    get envCache()    { return envCache; },
    get lineMeshes()  { return lineMeshes; },
    get bubbleScale() { return bubbleScale; },
    rebuildPanel:     function(grids) { buildPanel(grids); },
    createBubble:     createBubble,
    lineColor:        lineColor,
    removeDimChains:  removeDimChains,
    buildDimChains:   function(grids, env) { buildDimChains(grids, env); },
    LINE_OVERSHOOT_MIN:   LINE_OVERSHOOT_MIN,
    LINE_OVERSHOOT_RATIO: LINE_OVERSHOOT_RATIO,
    renderGridPlanesIn3D:      renderGridPlanesIn3D,
    removeGridPlanes3D:        removeGridPlanes3D,
    applyStoreyBandVisibility: applyStoreyBandVisibility,
    clearStoreyBandVisibility: clearStoreyBandVisibility
  };

  // Wire GridDrag if available
  if (typeof GridDrag !== 'undefined' && GridDrag.init) {
    GridDrag.init(A, A._gridOverlayState);
    log('§GRID_INIT GridDrag wired');
  }

  // Clamp bubble sizes on every camera change (zoom/pan in ortho views)
  A.controls.addEventListener('change', clampBubbleScales);

  // Wire GridScissors if available (adaptive grids at cut plane)
  if (typeof GridScissors !== 'undefined' && GridScissors.init) {
    GridScissors.init(A, A._gridOverlayState);
    log('§GRID_INIT GridScissors wired');
  }

  log('§GRID_INIT ready');
}
