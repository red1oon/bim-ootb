// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* precision_cam.js — Precision Camera
   👁 toolbar button opens mini-panel with:
     🪶 Fine (toggle slow controls) — Caps Lock shortcut on desktop
     🎯 Reset (re-anchor orbit center so zoom resets)
     🛰 Pivot (sticky toggle — auto re-centre orbit pivot on the scene centre each drag)
   Long-press the feather pill expands Reset + Pivot chips sideways (§S281). */

(function() {
  'use strict';
  function A() { return window.APP || window.A; }
  var _fine = false;
  var _defaults = { rotateSpeed: 0.8, zoomSpeed: 1.2, panSpeed: 1.5 };
  var _slow = { rotateSpeed: 0.15, zoomSpeed: 0.2, panSpeed: 0.15 };
  var _indicator, _panel, _pivotInd;

  function fineOn() {
    if (_fine) return;
    if (!A() || !A().controls) return;
    _fine = true;
    var c = A().controls;
    c.rotateSpeed = _slow.rotateSpeed;
    c.zoomSpeed = _slow.zoomSpeed;
    c.panSpeed = _slow.panSpeed;
    c.minDistance = 0.001;
    _indicator.style.display = 'flex';
    var fb = document.getElementById('prec-fine-btn');
    if (fb) { fb.style.background = '#4fc3f7'; fb.style.color = '#000'; } // active highlight (matches pill)
    console.log('§precision FINE on');
  }

  function fineOff() {
    if (!_fine) return;
    if (!A() || !A().controls) return;
    _fine = false;
    var c = A().controls;
    c.rotateSpeed = _defaults.rotateSpeed;
    c.zoomSpeed = _defaults.zoomSpeed;
    c.panSpeed = _defaults.panSpeed;
    c.minDistance = 0.1;
    _indicator.style.display = 'none';
    var fb = document.getElementById('prec-fine-btn');
    if (fb) { fb.style.background = 'rgba(255,255,255,0.1)'; fb.style.color = '#e0e0e0'; } // back to inactive
    console.log('§precision FINE off');
  }

  function toggleFine() { _fine ? fineOff() : fineOn(); }

  // Reset = camera stays, re-plant orbit target 10 units ahead
  // As if you just started navigating from this spot
  function resetOrbit() {
    if (!A() || !A().controls) return;
    var c = A().controls;
    var cam = c.object;

    var dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // Plant target 10 units ahead — gives fresh zoom range from here
    c.target.copy(cam.position).addScaledVector(dir, 10);
    c.minDistance = 0;
    c.update();
    if (A().markDirty) A().markDirty();

    // Flash
    var rb = document.getElementById('prec-reset-btn');
    if (rb) {
      rb.style.background = '#4fc3f7';
      setTimeout(function() { rb.style.background = 'rgba(255,255,255,0.1)'; }, 300);
    }

    console.log('§precision RESET — target replanted 10 units ahead');
  }

  // PRECISION_PIVOT — Auto-Pivot: re-anchor orbit target to the scene centre on drag-end.
  // Same mechanism as resetOrbit (move controls.target + update → no view jump), but the target
  // lands on the NEAREST surface to screen-centre — sampled over concentric NDC rings so a
  // dead-centre miss still captures something just off-centre.
  var _pivot = false, _onEnd = null;

  // Lucide "orbit" — a satellite circling a centre = pivot around the scene centre
  function _orbitIcon(sz) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/>' +
      '<circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/></svg>';
  }

  function _pivotPaint() {
    ['prec-pivot-btn', 'prec-pivot-chip'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.background = _pivot ? '#4fc3f7' : 'rgba(255,255,255,0.1)';
        el.style.color = _pivot ? '#000' : (id === 'prec-pivot-chip' ? '#4fc3f7' : '#e0e0e0');
      }
    });
  }

  function recenterPivot() {
    if (!A() || !A().controls) return;
    var c = A().controls;
    var cam = c.object;
    var scene = A().scene;
    var mode = null;
    // Prefer the SELECTED element — deterministic, no aiming (Revit/Navisworks-style).
    // hit=pick. Falls through to the screen-centre ring-raycast when nothing is selected.
    if (A()._lastPickGuid && A()._lastPickCenter) {
      c.target.copy(A()._lastPickCenter);
      mode = 'pick';
    }
    if (!mode && scene) {
      var ray = new THREE.Raycaster();
      // Building geometry only (same filter the picker uses) — never the hidden sky dome /
      // ground at ~50000, which would fling the pivot far away. Collect once, not per ray.
      var meshes = (A().collectMeshes
        ? A().collectMeshes(function(o) { return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible; })
        : scene.children);
      // Fixed cheap fan: centre + one ring (9 rays, once per drag-end — no loop, no fan).
      // Centre hit → orbit what you point at. Centre empty but walls around → centroid of the
      // surrounding hits = the enclosure centre ("the walls tell you the centre").
      var dirs = [[0, 0]];
      for (var a = 0; a < 8; a++) { var ang = a * Math.PI / 4; dirs.push([Math.cos(ang) * 0.14, Math.sin(ang) * 0.14]); }
      var centreHit = null, sx = 0, sy = 0, sz = 0, n = 0;
      for (var s = 0; s < dirs.length; s++) {
        ray.setFromCamera(new THREE.Vector2(dirs[s][0], dirs[s][1]), cam);
        var hh = ray.intersectObjects(meshes, false);
        if (hh.length) { var pt = hh[0].point; sx += pt.x; sy += pt.y; sz += pt.z; n++; if (s === 0) centreHit = pt; }
      }
      if (centreHit) { c.target.copy(centreHit); mode = 'mesh'; }
      else if (n) { c.target.set(sx / n, sy / n, sz / n); mode = 'room'; }  // enclosure centre
      if (!mode) {
        var box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) { box.getCenter(c.target); mode = 'bbox'; }
      }
    }
    if (!mode) {  // empty view → fall back to Reset's point-ahead so it never throws
      var dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      c.target.copy(cam.position).addScaledVector(dir, 10);
      mode = 'ahead';
    }
    c.update();
    if (A().markDirty) A().markDirty();
    console.log('§pivot recenter target=(' + c.target.x.toFixed(2) + ',' +
      c.target.y.toFixed(2) + ',' + c.target.z.toFixed(2) + ') hit=' + mode);
  }

  function pivotOn() {
    if (_pivot) return;
    if (!A() || !A().controls) return;
    _pivot = true;
    window._autoPivot = true;  // exposed for Help-row isActive highlight
    _onEnd = function() { if (_pivot) recenterPivot(); };
    A().controls.addEventListener('end', _onEnd);
    _pivotPaint();
    if (_pivotInd) _pivotInd.style.display = 'flex';  // top-centre orbit-icon notice
    recenterPivot();  // anchor immediately
    console.log('§pivot ON');
  }

  function pivotOff() {
    if (!_pivot) return;
    _pivot = false;
    window._autoPivot = false;
    if (A() && A().controls && _onEnd) A().controls.removeEventListener('end', _onEnd);
    _onEnd = null;
    _pivotPaint();
    if (_pivotInd) _pivotInd.style.display = 'none';
    console.log('§pivot OFF');
  }

  function togglePivot() { _pivot ? pivotOff() : pivotOn(); }

  // Caps Lock toggles fine mode (desktop)
  document.addEventListener('keydown', function(e) {
    if (e.code === 'CapsLock') toggleFine();
  });

  // Toggle panel visibility
  function togglePanel() {
    if (!_panel) return;
    var vis = _panel.style.display === 'none';
    _panel.style.display = vis ? 'flex' : 'none';
    var tb = document.getElementById('precision-btn');
    if (tb) tb.style.background = vis ? '#1a6b8a' : '#444';
  }

  function init() {
    // §S287c: top-centre active-mode notices — ICON ONLY, no words. Fine = feather, Pivot = orbit.
    var _indWrap = document.createElement('div');
    _indWrap.id = 'precision-indwrap';
    _indWrap.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:300;' +
      'display:flex;gap:6px;pointer-events:none;';
    var _badgeCss = 'display:none;align-items:center;justify-content:center;width:28px;height:22px;' +
      'background:rgba(79,195,247,0.9);color:#002;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.3);';
    var _featherSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/></svg>';
    _indicator = document.createElement('div');   // Fine notice — feather icon, no word
    _indicator.id = 'precision-indicator';
    _indicator.style.cssText = _badgeCss;
    _indicator.innerHTML = _featherSvg;
    _pivotInd = document.createElement('div');     // Pivot notice — orbit icon, no word
    _pivotInd.id = 'pivot-indicator';
    _pivotInd.style.cssText = _badgeCss;
    _pivotInd.innerHTML = _orbitIcon(15);
    _indWrap.appendChild(_indicator);
    _indWrap.appendChild(_pivotInd);
    document.body.appendChild(_indWrap);

    // Mini panel — two buttons, glassmorphism
    _panel = document.createElement('div');
    _panel.id = 'precision-panel';
    _panel.style.cssText =
      'position:fixed;bottom:80px;right:12px;z-index:200;display:none;' +
      'flex-direction:column;gap:6px;padding:8px;' +
      'background:rgba(20,20,40,0.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-radius:10px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.4);';

    // §S281: icon-only chooser — no word labels. Two icons, highlight when active.
    var btnCss = 'display:flex;align-items:center;justify-content:center;border:none;' +
      'border-radius:8px;width:44px;height:44px;background:rgba(255,255,255,0.1);' +
      'color:#e0e0e0;cursor:pointer;';
    var _svg = function(paths) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ' +
        'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    };
    // Fine = crosshair (precision); Reset = recenter/locate target
    var _fineIcon = '<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="3"/>';
    var _resetIcon = '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/>';
    _panel.innerHTML =
      '<button id="prec-fine-btn" title="Fine precision" style="' + btnCss + '">' + _svg(_fineIcon) + '</button>' +
      '<button id="prec-reset-btn" title="Reset camera" style="' + btnCss + '">' + _svg(_resetIcon) + '</button>' +
      '<button id="prec-pivot-btn" title="Auto-pivot on scene centre" style="' + btnCss + '">' + _orbitIcon(22) + '</button>';
    _panel.style.flexDirection = 'row'; // icons side by side
    document.body.appendChild(_panel);

    // Button handlers
    document.getElementById('prec-fine-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); toggleFine();
    });
    document.getElementById('prec-reset-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); resetOrbit();
    });
    document.getElementById('prec-pivot-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); togglePivot();
    });

    // If fine is active, reflect in panel button
    if (_fine) document.getElementById('prec-fine-btn').style.background = '#1a6b8a';
    if (_pivot) _pivotPaint();

    // S265: Precision Camera button — Lucide focus icon, matches overflow grid style
    var toolbar = document.querySelector('#search-body > div');
    if (!toolbar) return;
    var btn = document.createElement('button');
    btn.id = 'precision-btn';
    btn.title = 'Precision Camera';
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.914A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/></svg>';
    btn.style.cssText =
      'background:transparent;color:#ddd;border:none;border-radius:8px;' +
      'cursor:pointer;padding:10px;display:flex;align-items:center;justify-content:center';
    btn.addEventListener('pointerup', function(e) {
      e.stopPropagation(); togglePanel();
    });
    var homeBtn = document.getElementById('header-flag-btn');
    if (homeBtn) toolbar.insertBefore(btn, homeBtn);
    else toolbar.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.togglePrecisionCam = toggleFine;
  window.resetCamOrbit = resetOrbit;

  // §S281: feather interaction — tap toggles Fine (button highlights); long-press
  // expands a Reset icon sideways from the feather. Standard tap/hold pattern.
  window.togglePrecisionFine = function() {
    toggleFine();
    var b = document.getElementById('pill-precision');
    if (b) { b.classList.toggle('active', _fine); }
  };

  var _chips = [];
  function _clearChips() { _chips.forEach(function(c) { c.remove(); }); _chips = []; }
  var _resetIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/><line x1="12" y1="1" x2="12" y2="4"/>' +
    '<line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></svg>';

  // §S281 long-press drawer — expands chips sideways from the feather. Reset (one-shot) +
  // Pivot (sticky toggle: auto-re-centre orbit on the scene centre each drag).
  window.revealPrecisionReset = function(btn) {
    if (!btn) return;
    if (_chips.length) { _clearChips(); return; } // toggle off if showing
    var r = btn.getBoundingClientRect();
    var defs = [
      { id: 'prec-reset-chip', title: 'Reset camera', icon: _resetIconSvg,
        tap: function() { resetOrbit(); _clearChips(); } },
      { id: 'prec-pivot-chip', title: 'Auto-pivot on scene centre', icon: _orbitIcon(20),
        tap: function() { togglePivot(); } }  // sticky — stay open, chip recolours via _pivotPaint
    ];
    defs.forEach(function(d, i) {
      var chip = document.createElement('button');
      chip.id = d.id;
      chip.title = d.title;
      chip.innerHTML = d.icon;
      chip.style.cssText =
        'position:fixed;z-index:10000;width:44px;height:44px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:8px;background:rgba(20,20,40,0.85);color:#4fc3f7;cursor:pointer;' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.4);' +
        'top:' + r.top + 'px;left:' + (r.left - 52 * (i + 1)) + 'px;';  // stack leftward
      chip.addEventListener('pointerup', function(e) { e.stopPropagation(); d.tap(); });
      document.body.appendChild(chip);
      _chips.push(chip);
    });
    if (_pivot) _pivotPaint();  // reflect active pivot state on the freshly-built chip
    // Auto-dismiss on any tap elsewhere
    setTimeout(function() {
      var _dismiss = function(ev) {
        if (_chips.length && !_chips.some(function(c) { return c === ev.target || c.contains(ev.target); })) {
          _clearChips();
          document.removeEventListener('pointerdown', _dismiss, true);
        }
      };
      document.addEventListener('pointerdown', _dismiss, true);
    }, 0);
    console.log('§precision DRAWER revealed (long-press) chips=' + _chips.length);
  };

  window.toggleCamPivot = togglePivot;
})();
