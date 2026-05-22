/* precision_cam.js — Precision Camera
   👁 toolbar button opens mini-panel with:
     🪶 Fine (toggle slow controls) — Caps Lock shortcut on desktop
     🎯 Reset (re-anchor orbit center so zoom resets) */

(function() {
  'use strict';
  function A() { return window.APP || window.A; }
  var _fine = false;
  var _defaults = { rotateSpeed: 0.8, zoomSpeed: 1.2, panSpeed: 1.5 };
  var _slow = { rotateSpeed: 0.15, zoomSpeed: 0.2, panSpeed: 0.15 };
  var _indicator, _panel;

  function fineOn() {
    if (_fine) return;
    if (!A() || !A().controls) return;
    _fine = true;
    var c = A().controls;
    c.rotateSpeed = _slow.rotateSpeed;
    c.zoomSpeed = _slow.zoomSpeed;
    c.panSpeed = _slow.panSpeed;
    c.minDistance = 0.001;
    _indicator.style.display = 'block';
    var fb = document.getElementById('prec-fine-btn');
    if (fb) fb.style.background = '#1a6b8a';
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
    if (fb) fb.style.background = 'rgba(255,255,255,0.1)';
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
    // Indicator badge (top center when fine is active)
    _indicator = document.createElement('div');
    _indicator.id = 'precision-indicator';
    _indicator.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:300;' +
      'background:rgba(79,195,247,0.85);color:#000;font-size:10px;font-weight:bold;' +
      'padding:2px 8px;border-radius:8px;display:none;pointer-events:none;';
    _indicator.textContent = '🪶 FINE';
    document.body.appendChild(_indicator);

    // Mini panel — two buttons, glassmorphism
    _panel = document.createElement('div');
    _panel.id = 'precision-panel';
    _panel.style.cssText =
      'position:fixed;bottom:80px;right:12px;z-index:200;display:none;' +
      'flex-direction:column;gap:6px;padding:8px;' +
      'background:rgba(20,20,40,0.8);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(79,195,247,0.3);border-radius:10px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.4);';

    var btnCss = 'display:flex;align-items:center;gap:6px;padding:8px 12px;border:none;' +
      'border-radius:6px;background:rgba(255,255,255,0.1);color:#e0e0e0;' +
      'font-size:14px;cursor:pointer;white-space:nowrap;min-height:40px;';

    _panel.innerHTML =
      '<button id="prec-fine-btn" style="' + btnCss + '">🪶 <span style="font-size:11px">Fine</span></button>' +
      '<button id="prec-reset-btn" style="' + btnCss + '">🎯 <span style="font-size:11px">Reset</span></button>';
    document.body.appendChild(_panel);

    // Button handlers
    document.getElementById('prec-fine-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); toggleFine();
    });
    document.getElementById('prec-reset-btn').addEventListener('pointerup', function(e) {
      e.stopPropagation(); resetOrbit();
    });

    // If fine is active, reflect in panel button
    if (_fine) document.getElementById('prec-fine-btn').style.background = '#1a6b8a';

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
})();
