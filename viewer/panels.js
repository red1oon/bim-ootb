/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// panels.js — Panel collapse, storey/disc filters, building list, HUD, swipe
// ── S265 Phase 5: ICONS registry — single source of truth for all Lucide icons ──
// Implementing S265_UI_AESTHETICS.md §Implementation — Witness: W-PANEL
var ICONS = {
  clock:     { svg: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', trl: 'ui_tt_tm', key: 'T', desc: 'Time Machine' },
  ruler:     { svg: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>', trl: 'ui_tt_measure', key: null, desc: 'Measure' },
  search:    { svg: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', trl: 'ui_tt_find', key: null, desc: 'Find' },
  share:     { svg: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>', trl: 'ui_tt_share', key: null, desc: 'Share' },
  lifeBuoy:  { svg: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>', trl: 'ui_tt_help', key: 'F1', desc: 'Help' },
  moreVert:  { svg: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>', trl: null, key: null, desc: 'More' },
  scissors:  { svg: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>', trl: 'ui_tt_section', key: null, desc: 'Section Cut' },
  eye:       { svg: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="1"/><path d="M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"/>', trl: 'ui_tt_xray', key: 'X', desc: 'X-Ray' },
  clipboard: { svg: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>', trl: 'ui_tt_issues', key: 'I', desc: 'Issues' },
  triangle:  { svg: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', trl: 'ui_tt_clash', key: null, desc: 'Clash Matrix' },
  plane:     { svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', trl: 'ui_tt_fly', key: 'L', desc: 'Fly Tour' },
  layout:    { svg: '<rect width="18" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/>', trl: 'ui_tt_2d', key: '2', desc: '2D Plans' },
  palette:   { svg: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>', trl: 'ui_tt_sunglass', key: 'P', desc: 'Color Studio' },
  moon:      { svg: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>', trl: 'ui_tt_night', key: 'N', desc: 'Night' },
  cloud:     { svg: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', trl: 'ui_tt_shadow', key: 'H', desc: 'Shadow' },
  contrast:  { svg: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z"/>', trl: 'ui_tt_bg', key: 'B', desc: 'Background' },
  maximize:  { svg: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>', trl: 'ui_tt_fullscreen', key: null, desc: 'Fullscreen' },
  camera:    { svg: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>', trl: 'ui_tt_screenshot', key: 'S', desc: 'Screenshot' },
  barChart:  { svg: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>', trl: 'ui_tt_export', key: null, desc: '4D/5D Export' },
  home:      { svg: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', trl: 'ui_tt_home', key: null, desc: 'Home' },
  // S266: Doc pill icons — New From Reference designer
  doc:       { svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>', trl: 'ui_tt_doc', key: 'D', desc: 'Document' },
  grid:      { svg: '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/>', trl: 'ui_tt_grid', key: null, desc: 'Grid' },
  next:      { svg: '<path d="m9 18 6-6-6-6"/>', trl: 'ui_tt_next', key: null, desc: 'Next Phase' },
  save:      { svg: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>', trl: 'ui_tt_save', key: null, desc: 'Save Design' },
  folderOpen: { svg: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>', trl: 'ui_tt_open', key: null, desc: 'Open Design' },
  // S266: MEP pipe icon (elbow pipe shape) + UBBL compliance checklist
  pipe:      { svg: '<path d="M12 2v6"/><path d="M12 8a4 4 0 0 1 4 4v0"/><path d="M16 12h6"/><path d="M10 8h4"/><path d="M16 10v4"/>', trl: 'ui_tt_mep', key: null, desc: 'MEP Routes' },
  checkList: { svg: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>', trl: 'ui_tt_ubbl', key: null, desc: 'UBBL Compliance' },
  // S266: Rosetta Stone — diamond gem icon (distinctive, calibration = precious)
  rosetta:   { svg: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M12 21 6 9"/><path d="M12 21l6-12"/><path d="M8 3l4 6 4-6"/>', trl: 'ui_tt_rosetta', key: null, desc: 'Rosetta Stone' },
  // S266: Discipline selector — hub icon + per-discipline icons
  disciplines: { svg: '<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="20" cy="12" r="2"/><circle cx="6.34" cy="6.34" r="2"/><circle cx="17.66" cy="6.34" r="2"/><circle cx="6.34" cy="17.66" r="2"/><circle cx="17.66" cy="17.66" r="2"/><line x1="12" y1="7" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="17"/><line x1="7" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="17" y2="12"/>', trl: 'ui_tt_disc', key: null, desc: 'Disciplines' },
  discSTR:   { svg: '<rect x="10" y="2" width="4" height="20"/><path d="M6 4h12"/><path d="M6 20h12"/>', trl: null, key: null, desc: 'Structural' },
  discARC:   { svg: '<path d="M3 21V8l9-6 9 6v13"/><path d="M9 21v-6h6v6"/>', trl: null, key: null, desc: 'Architectural' },
  discFP:    { svg: '<path d="M12 2v4"/><circle cx="12" cy="10" r="4"/><path d="M8 13l-2 6"/><path d="M16 13l2 6"/><path d="M12 14v5"/><circle cx="12" cy="10" r="1" fill="currentColor"/>', trl: null, key: null, desc: 'Fire Protection' },
  discACMV:  { svg: '<path d="M2 12c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/><path d="M2 17c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/><path d="M2 7c2-3 4-4 6-4s4 2 6 0 4-4 6-4"/>', trl: null, key: null, desc: 'ACMV' },
  discELEC:  { svg: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', trl: null, key: null, desc: 'Electrical' },
  discPLMB:  { svg: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>', trl: null, key: null, desc: 'Plumbing' },
  discMEP:   { svg: '<path d="M12 2v6"/><path d="M12 8a4 4 0 0 1 4 4v0"/><path d="M16 12h6"/><path d="M10 8h4"/><path d="M16 10v4"/>', trl: null, key: null, desc: 'MEP General' },
  // P1 sunglass slider icons
  sun:       { svg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>', trl: 'ui_sun', key: null, desc: 'Sun intensity' },
  sunDim:    { svg: '<circle cx="12" cy="12" r="4"/><path d="M12 4h.01"/><path d="M20 12h.01"/><path d="M12 20h.01"/><path d="M4 12h.01"/><path d="M17.66 6.34h.01"/><path d="M17.66 17.66h.01"/><path d="M6.34 17.66h.01"/><path d="M6.34 6.34h.01"/>', trl: 'ui_exposure', key: null, desc: 'Exposure' },
  lightbulb: { svg: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>', trl: 'ui_ambient', key: null, desc: 'Ambient' },
  sunrise:   { svg: '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="M16 18a4 4 0 0 0-8 0"/>', trl: 'ui_hemisphere', key: null, desc: 'Hemisphere' }
};

function setupPanels(A) {
  // ── S265 Phase 5: A.icon() — standard icon button factory ──
  A.icon = function(name, opts) {
    opts = opts || {};
    var ic = ICONS[name];
    if (!ic) { console.warn('§ICON_MISS name=' + name); return document.createElement('button'); }
    var btn = document.createElement('button');
    var size = opts.size || 20;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ic.svg + '</svg>';
    btn.title = (typeof _TRL !== 'undefined' && ic.trl && _TRL[ic.trl]) || opts.title || ic.desc || '';
    if (ic.trl) btn.setAttribute('data-trl-title', ic.trl);
    if (opts.active) btn.classList.add('active');
    if (opts.id) btn.id = opts.id;
    if (opts.onClick) btn.addEventListener('pointerup', function(e) { e.stopPropagation(); opts.onClick(e); });
    return btn;
  };

  // ── S265 Phase 5: A.createPanel() — reusable panel factory ──
  A.createPanel = function(id, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.id = id;
    el.className = 'bim-panel';
    if (opts.style) Object.assign(el.style, opts.style);
    // Close button
    if (opts.closable !== false) {
      var closeBtn = document.createElement('span');
      closeBtn.className = 'bim-panel-close';
      closeBtn.innerHTML = '&times;';
      closeBtn.addEventListener('pointerup', function(e) {
        e.stopPropagation();
        el.style.display = 'none';
        if (opts.onClose) opts.onClose();
      });
      el.appendChild(closeBtn);
    }
    // Content
    if (opts.content) {
      if (typeof opts.content === 'string') { el.insertAdjacentHTML('beforeend', opts.content); }
      else { el.appendChild(opts.content); }
    }
    // Draggable
    if (opts.draggable !== false && A._makeDraggable) {
      A._makeDraggable(el);
    }
    // Pointer isolation (prevent canvas pick-through)
    el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    // Register with focus system
    if (typeof _registerPanel === 'function') {
      var closeFn = opts.onClose || function() { el.style.display = 'none'; };
      _registerPanel(id.replace(/-/g, ''), el, null, closeFn);
    }
    el.style.display = 'none';
    document.body.appendChild(el);
    console.log('§PANEL_CREATE id=' + id);
    return el;
  };

  // ── S265 Phase 5 P1: Build Color Palette slider panel ──
  A._buildSunglassPanel = function() {
    var existing = document.getElementById('sunglass-slider-panel');
    if (!existing) return;
    // Replace the placeholder with a proper bim-panel
    existing.className = 'bim-panel';
    existing.style.cssText = 'display:none; top:90px; right:70px; min-width:220px; max-width:280px;';

    // Close button
    var closeBtn = document.createElement('span');
    closeBtn.className = 'bim-panel-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (typeof window.toggleSunglass === 'function') toggleSunglass();
    });
    existing.appendChild(closeBtn);

    // Slider row helper — icon + range + fade-value
    function sliderRow(iconName, sliderId, valId, min, max, val, step, onInput) {
      var row = document.createElement('div');
      row.className = 'bim-slider-row';
      // Icon button
      var btn = A.icon(iconName, { size: 18 });
      row.appendChild(btn);
      // Slider
      var inp = document.createElement('input');
      inp.type = 'range'; inp.id = sliderId;
      inp.min = String(min); inp.max = String(max); inp.step = String(step);
      inp.value = String(val);
      row.appendChild(inp);
      // Value label (hidden until drag)
      var valSpan = document.createElement('span');
      valSpan.className = 'bim-slider-val';
      valSpan.id = valId;
      valSpan.textContent = Number(val).toFixed(step < 1 ? 2 : 0);
      row.appendChild(valSpan);

      var fadeTimer = null;
      inp.addEventListener('input', function() {
        valSpan.classList.add('visible');
        if (fadeTimer) clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function() { valSpan.classList.remove('visible'); }, 1000);
        if (onInput) onInput(inp.value);
      });
      // Show value on pointerdown too
      inp.addEventListener('pointerdown', function() { valSpan.classList.add('visible'); });
      return row;
    }

    // Row 1: Palette / Color Studio (ambience 0-100)
    existing.appendChild(sliderRow('palette', 'sunglass-slider', 'sunglass-val', 0, 100, 0, 1, function(v) {
      if (typeof updateAmbience === 'function') updateAmbience(v);
    }));

    // Separator
    var sep = document.createElement('hr');
    sep.style.cssText = 'border:none;border-top:1px solid rgba(255,255,255,0.1);margin:4px 0';
    existing.appendChild(sep);

    // Row 2: Sun (0-5.0)
    existing.appendChild(sliderRow('sun', 'sl-sun', 'sl-sun-val', 0, 5.0, 1.4, 0.05, function(v) {
      if (typeof updateLighting === 'function') updateLighting('sun', v);
    }));
    // Row 3: Aperture / Exposure (0.1-3.0)
    existing.appendChild(sliderRow('sunDim', 'sl-exposure', 'sl-exposure-val', 0.1, 3.0, 0.45, 0.05, function(v) {
      if (typeof updateLighting === 'function') updateLighting('exposure', v);
    }));
    // Row 4: Ambient (0-2.0)
    existing.appendChild(sliderRow('lightbulb', 'sl-ambient', 'sl-ambient-val', 0, 2.0, 0.25, 0.01, function(v) {
      if (typeof updateLighting === 'function') updateLighting('ambient', v);
    }));
    // Row 5: Hemisphere (0-2.0)
    existing.appendChild(sliderRow('sunrise', 'sl-hemi', 'sl-hemi-val', 0, 2.0, 0.40, 0.01, function(v) {
      if (typeof updateLighting === 'function') updateLighting('hemi', v);
    }));

    // Draggable + pointer isolation
    if (A._makeDraggable) A._makeDraggable(existing);
    existing.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    console.log('§COLOR_PALETTE built with bim-panel + icon slider rows');
  };

  // Build the sunglass panel immediately
  A._buildSunglassPanel();

  // §S265c: Reset overflow state — bfcache/SW can restore stale class from previous session
  var _sb = document.getElementById('search-box');
  if (_sb) _sb.classList.remove('overflow-open');
  var _sc = document.getElementById('overflow-scrim');
  if (_sc) _sc.classList.remove('active');

  // Prevent touch/click on floating panels from reaching canvas underneath
  // S265 Phase 4: storey-panel/disc-panel removed (inside HUD now)
  ['hud','search-box','info-panel','issues-panel','status'].forEach(function(pid) {
    var el = document.getElementById(pid);
    if (el) el.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  });

  // Panel collapse
  A.togglePanel = function(id) {
    const body = document.getElementById(id);
    body.classList.toggle('collapsed');
  };

  // ══════════════════════════════════════════════════════════════
  // S251 §8: ListKeyNav — universal keyboard navigator for list panels
  // Implementing S251_keyboard_modes.md — Witness: W-KBD
  // ══════════════════════════════════════════════════════════════
  function makeListKeyNav(getItems, onToggle, onActivate, onCursorMove) {
    var cursor = -1;
    var anchor = -1;
    var selected = new Set();
    var _taBuffer = '';
    var _taTimer = null;

    function scrollTo(i) {
      var items = getItems();
      if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
    }

    function moveCursor(delta) {
      var items = getItems();
      if (!items.length) { console.log('§LISTNAV_MOVE empty list, no-op'); return; }
      var prev = cursor;
      cursor = Math.max(0, Math.min(items.length - 1, cursor + delta));
      scrollTo(cursor);
      // Visual highlight
      items.forEach(function(el, j) {
        el.style.outline = (j === cursor) ? '2px solid #4fc3f7' : '';
      });
      var label = items[cursor] ? (items[cursor].textContent || '').trim().slice(0, 20) : '?';
      console.log('§LISTNAV_MOVE prev=' + prev + ' now=' + cursor + ' label="' + label + '" total=' + items.length);
      if (onCursorMove) onCursorMove(cursor);
    }

    function extendRange(delta) {
      if (anchor < 0) anchor = cursor >= 0 ? cursor : 0;
      moveCursor(delta);
      var lo = Math.min(anchor, cursor), hi = Math.max(anchor, cursor);
      selected = new Set();
      for (var i = lo; i <= hi; i++) selected.add(i);
      console.log('§LISTNAV_RANGE anchor=' + anchor + ' cursor=' + cursor + ' lo=' + lo + ' hi=' + hi);
      _emit();
    }

    function _emit() {
      onToggle(Array.from(selected));
      console.log('§LISTNAV_SELECT count=' + selected.size + ' indices=[' + Array.from(selected).join(',') + ']');
    }

    return {
      onKey: function(e) {
        var items = getItems();
        // If cursor is on a slider, ←→ steps the slider value
        var curItem = items[cursor];
        if (curItem && curItem.tagName === 'INPUT' && curItem.type === 'range') {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            var step = parseFloat(curItem.step) || 1;
            var val = parseFloat(curItem.value) + (e.key === 'ArrowRight' ? step : -step);
            val = Math.max(parseFloat(curItem.min), Math.min(parseFloat(curItem.max), val));
            curItem.value = val;
            // Fire oninput handler
            curItem.dispatchEvent(new Event('input'));
            console.log('§LISTNAV_SLIDER val=' + val.toFixed(2));
            return;
          }
          // ↑↓ moves cursor off the slider to next/prev item
          if (e.key === 'ArrowUp') { moveCursor(-1); return; }
          if (e.key === 'ArrowDown') { moveCursor(+1); return; }
        }
        // Shift+Arrow must be checked BEFORE plain Arrow
        if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowLeft'))   { console.log('§LISTNAV_KEY shift+up'); extendRange(-1); return; }
        if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) { console.log('§LISTNAV_KEY shift+down'); extendRange(+1); return; }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')   { moveCursor(-1); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { moveCursor(+1); return; }
        if (e.key === 'PageUp')    { console.log('§LISTNAV_KEY pageup'); moveCursor(-5); return; }
        if (e.key === 'PageDown')  { console.log('§LISTNAV_KEY pagedown'); moveCursor(+5); return; }
        if (e.key === 'Home')      { console.log('§LISTNAV_KEY home'); cursor = -1; moveCursor(1); return; }
        if (e.key === 'End')       { console.log('§LISTNAV_KEY end'); cursor = items.length; moveCursor(-1); return; }
        if (e.ctrlKey && e.key === 'a') {
          selected = new Set();
          items.forEach(function(_, i) { selected.add(i); });
          console.log('§LISTNAV_KEY ctrl+a selectAll=' + selected.size);
          _emit();
          return;
        }
        if (e.key === ' ' && !e.ctrlKey) {
          selected = new Set([cursor]); anchor = cursor;
          console.log('§LISTNAV_KEY space activate cursor=' + cursor);
          _emit();
          if (onActivate) onActivate(cursor);
          return;
        }
        if (e.ctrlKey && e.key === ' ') {
          var action = selected.has(cursor) ? 'remove' : 'add';
          if (selected.has(cursor)) selected.delete(cursor); else selected.add(cursor);
          anchor = cursor;
          console.log('§LISTNAV_KEY ctrl+space ' + action + ' cursor=' + cursor);
          _emit();
          return;
        }
        if (e.key === 'Enter' && onActivate) { console.log('§LISTNAV_KEY enter cursor=' + cursor); onActivate(cursor); return; }
      },
      onTypeahead: function(ch) {
        clearTimeout(_taTimer);
        _taBuffer += ch.toLowerCase();
        var items = getItems();
        var labels = [];
        items.forEach(function(el) { labels.push((el.textContent || '').trim().toLowerCase()); });
        var matches = [];
        labels.forEach(function(l, i) { if (l.indexOf(_taBuffer) === 0) matches.push(i); });
        if (matches.length) {
          var next = matches[0];
          var cycled = false;
          if (_taBuffer.length === 1 && matches.indexOf(cursor) >= 0) {
            next = matches[(matches.indexOf(cursor) + 1) % matches.length];
            cycled = true;
          }
          cursor = next;
          scrollTo(cursor);
          var items2 = getItems();
          items2.forEach(function(el, j) {
            el.style.outline = (j === cursor) ? '2px solid #4fc3f7' : '';
          });
          var label = items2[cursor] ? (items2[cursor].textContent || '').trim().slice(0, 20) : '?';
          console.log('§LISTNAV_TYPEAHEAD buf="' + _taBuffer + '" matches=[' + matches.join(',') + '] cursor=' + cursor + ' label="' + label + '" cycled=' + cycled);
        } else {
          console.log('§LISTNAV_TYPEAHEAD buf="' + _taBuffer + '" NO MATCH items=' + items.length);
        }
        _taTimer = setTimeout(function() { console.log('§LISTNAV_TYPEAHEAD_RESET'); _taBuffer = ''; }, 600);
      },
      onClick: function(index, e) {
        if (e.ctrlKey || e.metaKey) {
          if (selected.has(index)) selected.delete(index); else selected.add(index);
          anchor = index;
        } else if (e.shiftKey && anchor >= 0) {
          var lo = Math.min(anchor, index), hi = Math.max(anchor, index);
          selected = new Set();
          for (var i = lo; i <= hi; i++) selected.add(i);
        } else {
          selected = new Set([index]); anchor = index; cursor = index;
        }
        _emit();
      },
      getSelected: function() { return Array.from(selected); }
    };
  }

  // Expose for dynamic panel registration (clash matrix, etc.)
  window.makeListKeyNav = makeListKeyNav;

  // Wire ListKeyNav to storey + DISC panels after populate
  var _storeyNav = null, _discNav = null;
  A._wireListKeyNav = function() {
    // S265 Phase 4: storey/disc now inside HUD accordion sections
    var storeyPanel = document.getElementById('hud-storey-section');
    var discPanel = document.getElementById('hud-disc-section');

    if (storeyPanel && !_storeyNav) {
      _storeyNav = makeListKeyNav(
        function() { return Array.from(document.querySelectorAll('#storey-body button')); },
        function(indices) {
          var btns = Array.from(document.querySelectorAll('#storey-body button'));
          // Multi-select: show all selected storeys, hide the rest
          if (indices.length >= 1) {
            // Extract storey names from button onclick
            var selectedStoreys = [];
            indices.forEach(function(i) {
              if (!btns[i]) { console.log('§STOREY_TOGGLE btn[' + i + '] missing, total=' + btns.length); return; }
              var m = btns[i].onclick ? btns[i].onclick.toString().match(/filterStorey\('(.+?)'\)/) : null;
              if (m) selectedStoreys.push(m[1]);
              else selectedStoreys.push(null); // "All Storeys" button
            });
            console.log('§STOREY_TOGGLE indices=[' + indices.join(',') + '] storeys=[' + selectedStoreys.join(',') + ']');
            // If "All Storeys" is in selection, show all
            if (selectedStoreys.indexOf(null) >= 0) {
              console.log('§STOREY_TOGGLE → all (null in selection)');
              A.filterStorey(null);
            } else if (selectedStoreys.length === 1) {
              console.log('§STOREY_TOGGLE → single: ' + selectedStoreys[0]);
              A.filterStorey(selectedStoreys[0]);
              if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'VIEW_FILTER', {type:'storey',storeys:selectedStoreys});
            } else {
              // Multi-storey: show meshes matching any selected storey
              A.activeStoreyFilter = selectedStoreys;
              A.collectMeshes(function(o) { return o.isMesh && o.userData.storey !== undefined; }).forEach(function(obj) {
                obj.visible = selectedStoreys.indexOf(obj.userData.storey) >= 0;
              });
              A.collectMeshes(function(o) { return o.isInstancedMesh; }).forEach(function(mesh) {
                A.filterInstancedMesh(mesh, function(meta) {
                  return selectedStoreys.indexOf(meta.storey) >= 0;
                });
              });
              // §S260: BatchedMesh multi-storey filter
              A.collectMeshes(function(o) { return o.isBatchedMesh; }).forEach(function(mesh) {
                A.filterBatchedMesh(mesh, function(meta) {
                  return selectedStoreys.indexOf(meta.storey) >= 0;
                });
              });
              // Highlight selected buttons
              btns.forEach(function(btn, j) { btn.className = indices.indexOf(j) >= 0 ? 'active' : ''; });
              console.log('§STOREY_MULTI storeys=' + selectedStoreys.join(','));
              if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'VIEW_FILTER', {type:'storey',storeys:selectedStoreys});
              if (A.markDirty) A.markDirty();
            }
          }
        },
        function(idx) {
          var btns = Array.from(document.querySelectorAll('#storey-body button'));
          if (btns[idx]) btns[idx].click();
        }
      );
      if (typeof _registerPanel === 'function') _registerPanel('storey', storeyPanel, _storeyNav);
      // §S260c: Intercept Shift+click on storey buttons for accumulating multi-select.
      // Shift+click = toggle individual storeys (accumulate). Without this, inline
      // onclick="filterStorey('...')" fires directly, replacing the selection.
      var stBody = document.getElementById('storey-body');
      if (stBody && !stBody._s260cWired) {
        stBody._s260cWired = true;
        stBody.addEventListener('click', function(e) {
          var btn = e.target.closest('button');
          if (!btn) return;
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          var btns = Array.from(stBody.querySelectorAll('button'));
          var idx = btns.indexOf(btn);
          if (idx < 0) return;
          // Accumulate: treat Shift as Ctrl (toggle individual item)
          _storeyNav.onClick(idx, { shiftKey: false, ctrlKey: true, metaKey: false });
          console.log('§STOREY_SHIFT_CLICK idx=' + idx + ' accumulate selected=' + _storeyNav.getSelected().join(','));
        }, true);
      }
      console.log('§LISTNAV_WIRE panel=storey');
    }

    if (discPanel && !_discNav) {
      _discNav = makeListKeyNav(
        function() { return Array.from(document.querySelectorAll('#disc-body button')); },
        function(indices) {
          var btns = Array.from(document.querySelectorAll('#disc-body button'));
          // Multi-select: toggle each selected disc
          if (indices.length >= 1) {
            // Get all disc names
            var allDiscs = [];
            btns.forEach(function(btn) {
              var m = btn.onclick ? btn.onclick.toString().match(/toggleDisc\('(.+?)'\)/) : null;
              if (m) allDiscs.push(m[1]);
            });
            // Show only selected, hide rest
            var selectedDiscs = [];
            indices.forEach(function(i) {
              if (allDiscs[i]) selectedDiscs.push(allDiscs[i]);
            });
            // Reset all hidden, then hide non-selected
            A.hiddenDiscs = new Set();
            allDiscs.forEach(function(d) {
              if (selectedDiscs.indexOf(d) < 0) A.hiddenDiscs.add(d);
            });
            // Apply visibility
            A.collectMeshes(function(o) { return o.isMesh && o.userData.disc; }).forEach(function(obj) {
              var discVisible = !A.hiddenDiscs.has(obj.userData.disc);
              var storeyVisible = A.activeStoreyFilter === null ||
                (Array.isArray(A.activeStoreyFilter) ? A.activeStoreyFilter.indexOf(obj.userData.storey) >= 0 : obj.userData.storey === A.activeStoreyFilter);
              obj.visible = discVisible && storeyVisible;
            });
            A.collectMeshes(function(o) { return o.isInstancedMesh; }).forEach(function(mesh) {
              A.filterInstancedMesh(mesh, function(meta) {
                return !A.hiddenDiscs.has(meta.disc) &&
                  (A.activeStoreyFilter === null ||
                   (Array.isArray(A.activeStoreyFilter) ? A.activeStoreyFilter.indexOf(meta.storey) >= 0 : meta.storey === A.activeStoreyFilter));
              });
            });
            // §S260: BatchedMesh multi-disc filter
            A.collectMeshes(function(o) { return o.isBatchedMesh; }).forEach(function(mesh) {
              A.filterBatchedMesh(mesh, function(meta) {
                return !A.hiddenDiscs.has(meta.disc) &&
                  (A.activeStoreyFilter === null ||
                   (Array.isArray(A.activeStoreyFilter) ? A.activeStoreyFilter.indexOf(meta.storey) >= 0 : meta.storey === A.activeStoreyFilter));
              });
            });
            btns.forEach(function(btn, j) { btn.className = indices.indexOf(j) >= 0 ? 'active' : ''; });
            console.log('§DISC_MULTI selected=' + selectedDiscs.join(',') + ' hidden=' + A.hiddenDiscs.size);
            if (window.KernelOps && A.db) KernelOps.commitOp(A.db, 'VIEW_FILTER', {type:'disc',discs:selectedDiscs});
            if (A.markDirty) A.markDirty();
          }
        },
        function(idx) {
          var btns = Array.from(document.querySelectorAll('#disc-body button'));
          if (btns[idx]) btns[idx].click();
        }
      );
      if (typeof _registerPanel === 'function') _registerPanel('disc', discPanel, _discNav);
      console.log('§LISTNAV_WIRE panel=disc');
    }

    // Toolbar — horizontal, ←→ traversal, Space/Enter clicks
    var toolbox = document.getElementById('search-box');
    if (toolbox && !A._toolbarNav) {
      A._toolbarNav = makeListKeyNav(
        function() { return Array.from(document.querySelectorAll('#search-body button')); },
        function() { /* no multi-select for toolbar */ },
        function(idx) {
          var btns = Array.from(document.querySelectorAll('#search-body button'));
          if (btns[idx]) btns[idx].click();
        }
      );
      if (typeof _registerPanel === 'function') _registerPanel('toolbar', toolbox, A._toolbarNav);
      console.log('§LISTNAV_WIRE panel=toolbar');
    }

    // Section slider panel — buttons, sliders, AND close toggle
    var secPanel = document.getElementById('section-slider-panel');
    if (secPanel && !A._sectionNav) {
      A._sectionNav = makeListKeyNav(
        function() { return Array.from(secPanel.querySelectorAll('button, input[type="range"], .panel-toggle')); },
        function() {},
        function(idx) {
          var items = Array.from(secPanel.querySelectorAll('button, input[type="range"], .panel-toggle'));
          if (items[idx]) items[idx].click();
        }
      );
      var secClose = function() { if (typeof window.toggleSection === 'function') window.toggleSection(); };
      if (typeof _registerPanel === 'function') _registerPanel('section', secPanel, A._sectionNav, secClose);
      console.log('§LISTNAV_WIRE panel=section');
    }

    // Sunglasses slider panel — register with close
    var sunPanel = document.getElementById('sunglass-slider-panel');
    if (sunPanel && !A._sunglassNav) {
      A._sunglassNav = makeListKeyNav(
        function() { return Array.from(sunPanel.querySelectorAll('button, input[type="range"], .panel-toggle')); },
        function() {},
        function(idx) {
          var items = Array.from(sunPanel.querySelectorAll('button, input[type="range"], .panel-toggle'));
          if (items[idx]) items[idx].click();
        }
      );
      var sunClose = function() { if (typeof window.toggleSunglass === 'function') window.toggleSunglass(); };
      if (typeof _registerPanel === 'function') _registerPanel('sunglass', sunPanel, A._sunglassNav, sunClose);
      console.log('§LISTNAV_WIRE panel=sunglass');
    }
  };

  // Storey isolator
  A.activeStoreyFilter = null;
  A.storeyMeshGroups = {};

  A.populateStoreys = function(building) {
    return; // §S280: HUD removed — storey/disc in Find outliner
    const rows = A.dbQuery(`
      SELECT DISTINCT storey FROM elements_meta
      WHERE building = ? AND storey IS NOT NULL
      ORDER BY storey
    `, [building]);
    const section = document.getElementById('hud-storey-section');
    const body = document.getElementById('storey-body');
    if (!rows.length) { if (section) section.style.display = 'none'; return; }

    const storeys = rows.map(r => r[0]);
    body.innerHTML = `<button class="${A.activeStoreyFilter === null ? 'active' : ''}"
      onclick="filterStorey(null);resetHudAutoCollapse()" style="margin-top:4px">${typeof _TRL!=='undefined'&&_TRL.ui_all_storeys||'All Storeys'}</button>` +
      storeys.map(s => `<button class="${A.activeStoreyFilter === s ? 'active' : ''}"
        onclick="filterStorey('${s}');resetHudAutoCollapse()">${s}</button>`).join('');
    if (section) section.style.display = 'block';

    // Start with storey body collapsed inside HUD accordion
    setTimeout(() => { if (body) body.classList.add('collapsed'); }, 100);
    // S251: Wire ListKeyNav after buttons are populated
    if (A._wireListKeyNav) A._wireListKeyNav();
    console.log('§HUD_STOREY populated storeys=' + storeys.length);
  };

  A.filterStorey = function(storey) {
    A.activeStoreyFilter = storey;
    // S239: Regular meshes — show/hide by storey
    A.collectMeshes(o => o.isMesh && o.userData.storey !== undefined).forEach(obj => {
      obj.visible = storey === null || obj.userData.storey === storey;
    });
    // S232/S239: InstancedMesh — per-instance storey filter via zero-scale matrix
    A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
      A.filterInstancedMesh(mesh, meta => storey === null || meta.storey === storey);
    });
    // §S260: BatchedMesh — per-element storey filter via setVisibleAt
    A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
      A.filterBatchedMesh(mesh, meta => storey === null || meta.storey === storey);
    });
    document.querySelectorAll('#storey-body button').forEach(btn => {
      const btnStorey = btn.onclick.toString().match(/filterStorey\('(.+?)'\)/)?.[1] || null;
      btn.className = (btnStorey === storey || (storey === null && !btn.onclick.toString().includes("'"))) ? 'active' : '';
    });
    console.log(`[S200] §STOREY_FILTER ${storey || 'ALL'}`);
    if (A.markDirty) A.markDirty();
  };

  // Discipline toggle
  A.hiddenDiscs = new Set();

  A.populateDiscs = function(building) {
    return; // §S280: HUD removed — storey/disc in Find outliner
    const rows = A.dbQuery(`
      SELECT discipline, COUNT(*) FROM elements_meta
      WHERE building = ? AND discipline IS NOT NULL
      GROUP BY discipline ORDER BY COUNT(*) DESC
    `, [building]);
    const section = document.getElementById('hud-disc-section');
    const body = document.getElementById('disc-body');
    if (!rows.length) { if (section) section.style.display = 'none'; return; }

    body.innerHTML = rows.map(([d, cnt]) => {
      const hex = '#' + (A.DISC_COLORS[d] || A.DEFAULT_COLOR).toString(16).padStart(6, '0');
      const on = !A.hiddenDiscs.has(d);
      return `<button class="${on ? 'active' : ''}" onclick="toggleDisc('${d}');resetHudAutoCollapse()" style="margin-top:2px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${hex};margin-right:4px"></span>
        ${d} <span style="color:#888;font-size:10px">${cnt.toLocaleString()}</span></button>`;
    }).join('');
    if (section) section.style.display = 'block';

    // Start with disc body collapsed inside HUD accordion
    setTimeout(() => { if (body) body.classList.add('collapsed'); }, 100);
    // S251: Wire ListKeyNav after buttons are populated
    if (A._wireListKeyNav) A._wireListKeyNav();
    console.log('§HUD_DISC populated disciplines=' + rows.length);
  };

  A.toggleDisc = function(disc) {
    if (A.hiddenDiscs.has(disc)) {
      A.hiddenDiscs.delete(disc);
    } else {
      A.hiddenDiscs.add(disc);
    }
    // S239: Regular meshes — show/hide by disc + storey
    A.collectMeshes(o => o.isMesh && o.userData.disc).forEach(obj => {
      const discVisible = !A.hiddenDiscs.has(obj.userData.disc);
      const storeyVisible = A.activeStoreyFilter === null || obj.userData.storey === A.activeStoreyFilter;
      obj.visible = discVisible && storeyVisible;
    });
    // S232/S239: InstancedMesh — per-instance disc+storey filter
    A.collectMeshes(o => o.isInstancedMesh).forEach(mesh => {
      A.filterInstancedMesh(mesh, meta => {
        return !A.hiddenDiscs.has(meta.disc) &&
          (A.activeStoreyFilter === null || meta.storey === A.activeStoreyFilter);
      });
    });
    // §S260: BatchedMesh — per-element disc+storey filter
    A.collectMeshes(o => o.isBatchedMesh).forEach(mesh => {
      A.filterBatchedMesh(mesh, meta => {
        return !A.hiddenDiscs.has(meta.disc) &&
          (A.activeStoreyFilter === null || meta.storey === A.activeStoreyFilter);
      });
    });
    document.querySelectorAll('#disc-body button').forEach(btn => {
      const m = btn.onclick.toString().match(/toggleDisc\('(.+?)'\)/);
      if (m) btn.className = A.hiddenDiscs.has(m[1]) ? '' : 'active';
    });
    if (A.markDirty) A.markDirty();
  };

  // Building list
  A.allBuildingCards = [];

  A.populateBuildingList = function() {
    const list = document.getElementById('building-list');
    // Dedupe: strip grid prefix (S0_0_, T0_, etc.) → group by archetype, keep first instance
    const seen = {};
    for (const [name, bc] of Object.entries(A.buildingCentres)) {
      const arch = name.replace(/^[ST]\d+_\d*_?/, '');
      if (!seen[arch] || bc.count > seen[arch].count) {
        seen[arch] = { name, count: bc.count };
      }
    }
    const sorted = Object.entries(seen)
      .sort((a, b) => b[1].count - a[1].count);
    A.allBuildingCards = [];
    list.innerHTML = '';
    for (const [arch, info] of sorted) {
      const card = document.createElement('div');
      card.className = 'bld-card';
      card.innerHTML = `<span>${arch}</span><span class="cnt">${info.count.toLocaleString()}</span>`;
      card.onclick = () => A.flyTo(info.name);
      list.appendChild(card);
      A.allBuildingCards.push({ name: arch.toLowerCase(), el: card });
    }
  };

  // Search filter
  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    for (const card of A.allBuildingCards) {
      card.el.style.display = (!q || card.name.includes(q)) ? '' : 'none';
    }
  });

  // HUD
  A.updateHUD = function() {
    const barsEl = document.getElementById('disc-bars');
    const total = Object.values(A.discCounts).reduce((a, b) => a + b, 0);
    barsEl.innerHTML = Object.entries(A.discCounts).map(([disc, cnt]) => {
      const pct = (cnt / total * 100).toFixed(1);
      const color = '#' + (A.DISC_COLORS[disc] || A.DEFAULT_COLOR).toString(16).padStart(6, '0');
      return `<span class="disc-bar" style="background:${color};width:${Math.max(pct*1.5, 3)}px" title="${disc}: ${cnt.toLocaleString()} (${pct}%)"></span>`;
    }).join('') + '<br><small style="color:#888">' +
      Object.entries(A.discCounts).slice(0, 6).map(([d, c]) => `${d}:${c.toLocaleString()}`).join(' ') + '</small>';
  };

  // ── S265: Icon Pill overflow toggle + §-tags ──
  window.toggleOverflow = function() {
    var box = document.getElementById('search-box');
    var scrim = document.getElementById('overflow-scrim');
    var moreBtn = document.getElementById('more-btn');
    if (!box) return;
    var opening = !box.classList.contains('overflow-open');
    box.classList.toggle('overflow-open', opening);
    if (scrim) scrim.classList.toggle('active', opening);
    if (moreBtn) moreBtn.classList.toggle('active', opening);
    // S265: sync active state on open
    if (opening) {
      var _s = function(id, on) { var b = document.getElementById(id); if (b) b.classList.toggle('active', !!on); };
      _s('xray-btn', A.xrayOn);
      _s('section-btn', A.sectionOn);
      _s('sunglass-btn', A.sunglassOn);
      _s('fly-btn', A.flyActive);
      _s('shadow-overflow-btn', A._shadowOn);
      _s('bg-overflow-btn', A._whiteBg);
      _s('grid-2d-btn', A._gridOverlayState && A._gridOverlayState.active);
    }
    console.log('§UI_OVERFLOW ' + (opening ? 'open' : 'close'));
  };
  // §-tag: pill rendered
  var pill = document.getElementById('icon-pill');
  if (pill) {
    var pillBtns = pill.querySelectorAll('button');
    var visCount = 0;
    pillBtns.forEach(function(b) { if (b.offsetParent !== null) visCount++; });
    console.log('§UI_PILL rendered=true icons=' + visCount + ' total=' + pillBtns.length);
  }
  // Sync pill-measure active state with overflow measure-btn
  var pillMeasure = document.getElementById('pill-measure');
  if (pillMeasure) {
    var origToggleMeasure = window.toggleMeasure;
    if (origToggleMeasure) {
      window.toggleMeasure = function() {
        origToggleMeasure();
        var active = A.measureActive;
        pillMeasure.classList.toggle('active', !!active);
      };
    }
  }

  // ── S266: Doc Pill — swap icon-pill between main mode and doc (red) mode ──
  var _docMode = false;
  var _mainPillHTML = ''; // stash main pill innerHTML for restore
  window.toggleDocPill = function() {
    var pill = document.getElementById('icon-pill');
    if (!pill) return;
    if (_docMode) {
      // restore main pill + deactivate canvas
      if (window.DocCanvas) DocCanvas.deactivate(A);
      pill.innerHTML = _mainPillHTML;
      pill.classList.remove('doc-mode');
      _docMode = false;
      console.log('§DOC_PILL mode=main');
    } else {
      // stash main pill and swap to doc mode
      _mainPillHTML = pill.innerHTML;
      pill.innerHTML = '';
      pill.classList.add('doc-mode');
      // 1. Home — return to main pill
      var btnHome = A.icon('home', { size: 24, title: 'Home', onClick: function() { toggleDocPill(); } });
      btnHome.id = 'doc-home-btn';
      pill.appendChild(btnHome);
      // 2. Grid — 2D grid + lengths + bubbles toggle
      var _gridOn = true;  // grid starts ON
      var btnGrid = A.icon('grid', { size: 24, title: 'Grid', onClick: function() {
        if (window.DocCanvas) _gridOn = DocCanvas.toggleGrid();
        else _gridOn = !_gridOn;
        btnGrid.classList.toggle('active', _gridOn);
      }});
      btnGrid.classList.add('active');  // starts ON
      btnGrid.id = 'doc-grid-btn';
      pill.appendChild(btnGrid);
      // §S273: TM removed from doc pill — timeline slider is permanent, TM goes back to main pill
      // 4. Next — advance one construction phase
      var btnNext = A.icon('next', { size: 24, title: 'Next Phase', onClick: function() {
        if (window.DocCanvas) DocCanvas.nextPhase(A);
      }});
      btnNext.id = 'doc-next-btn';
      pill.appendChild(btnNext);
      // 5. Discipline selector — replaces MEP icon. Hub icon opens popup with all
      //    disciplines in the building. Selected disc drives what Next reveals.
      //    Active disc shown in top-right status badge.
      var _discPopup = null;
      var _discIconMap = {
        STR: 'discSTR', ARC: 'discARC', MEP: 'discMEP',
        FP: 'discFP', ELEC: 'discELEC', ACMV: 'discACMV', PLMB: 'discPLMB'
      };
      var _discColorMap = {
        STR: '#e57373', ARC: '#64b5f6', MEP: '#81c784',
        FP: '#ff8a65', ELEC: '#fff176', ACMV: '#4dd0e1', PLMB: '#ba68c8'
      };
      var btnDisc = A.icon('disciplines', { size: 24, title: 'Disciplines', onClick: function() {
        if (_discPopup) { _discPopup.remove(); _discPopup = null; return; }
        // Build popup from BOM disciplines
        var discs = [];
        if (A._bom && A._bom.storeys) {
          var seen = {};
          for (var si = 0; si < A._bom.storeys.length; si++) {
            for (var di = 0; di < A._bom.storeys[si].disciplines.length; di++) {
              var dn = A._bom.storeys[si].disciplines[di].name;
              if (!seen[dn]) { seen[dn] = true; discs.push(dn); }
            }
          }
        }
        if (!discs.length) { APP.status.textContent = 'No disciplines found'; return; }
        _discPopup = document.createElement('div');
        _discPopup.className = 'bim-panel';
        _discPopup.style.cssText = 'position:fixed;top:60px;right:10px;z-index:1100;padding:8px;min-width:140px;';
        var activeDisc = window.DocCanvas ? DocCanvas.getActiveDisc() : 'ARC';
        for (var k = 0; k < discs.length; k++) {
          (function(d) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;border-radius:6px;' +
              (d === activeDisc ? 'background:rgba(255,255,255,0.15);' : '');
            // Discipline icon
            var ic = A.icon(_discIconMap[d] || 'discMEP', { size: 20 });
            ic.style.color = _discColorMap[d] || '#aaa';
            ic.style.minWidth = '24px';
            row.appendChild(ic);
            // Label
            var lbl = document.createElement('span');
            lbl.textContent = d;
            lbl.style.cssText = 'color:' + (_discColorMap[d] || '#ccc') + ';font:bold 13px monospace;';
            row.appendChild(lbl);
            // Active indicator
            if (d === activeDisc) {
              var dot = document.createElement('span');
              dot.textContent = ' \u25CF';
              dot.style.color = '#4caf50';
              row.appendChild(dot);
            }
            row.onpointerup = function() {
              if (window.DocCanvas) DocCanvas.setActiveDisc(d, A);
              btnDisc.style.color = _discColorMap[d] || '';
              _discPopup.remove(); _discPopup = null;
              console.log('§DOC_DISC selected=' + d);
            };
            _discPopup.appendChild(row);
          })(discs[k]);
        }
        document.body.appendChild(_discPopup);
        // Auto-close on outside tap
        setTimeout(function() {
          document.addEventListener('pointerup', function _closeDisc(ev) {
            if (_discPopup && !_discPopup.contains(ev.target) && ev.target !== btnDisc) {
              _discPopup.remove(); _discPopup = null;
              document.removeEventListener('pointerup', _closeDisc);
            }
          });
        }, 100);
      }});
      btnDisc.id = 'doc-disc-btn';
      btnDisc.style.color = _discColorMap['ARC'];  // default ARC color
      pill.appendChild(btnDisc);
      // 6. Open — list saved designs and restore selected
      var btnOpen = A.icon('folderOpen', { size: 24, title: 'Open Design', onClick: function() {
        if (!window.DocCanvas || !DocCanvas.listDesigns) return;
        DocCanvas.listDesigns(function(err, list) {
          if (err || !list.length) {
            if (window.APP && APP.status) {
              APP.status.textContent = err ? 'Error listing designs' : 'No saved designs found';
            }
            console.log('§DOC_OPEN ' + (err ? 'ERROR: ' + err : 'no_designs'));
            return;
          }
          // Show picker: most recent first
          list.sort(function(a, b) { return b.savedAt - a.savedAt; });
          var names = list.map(function(d, i) {
            var date = new Date(d.savedAt).toLocaleString();
            return (i + 1) + '. ' + d.key + ' (' + date + ', ' + d.ops + ' ops)';
          });
          var choice = prompt('Select design to open:\\n' + names.join('\\n') + '\\n\\nEnter number or name:');
          if (!choice) return;
          var idx = parseInt(choice) - 1;
          var key = (idx >= 0 && idx < list.length) ? list[idx].key : choice;
          DocCanvas.openDesign(A, key);
        });
      }});
      btnOpen.id = 'doc-open-btn';
      pill.appendChild(btnOpen);
      // 7. Save — serialize grid state + kernel_ops to IndexedDB
      var btnSave = A.icon('save', { size: 24, title: 'Save Design', onClick: function() {
        if (!window.DocCanvas || !DocCanvas.saveDesign) return;
        var key = prompt('Design name:', 'Design_' + new Date().toISOString().slice(0, 10));
        if (!key) return;
        DocCanvas.saveDesign(A, key);
      }});
      btnSave.id = 'doc-save-btn';
      pill.appendChild(btnSave);
      // 8. UBBL — compliance check
      var btnUBBL = A.icon('checkList', { size: 24, title: 'UBBL Compliance', onClick: function() {
        console.log('§DOC_UBBL compliance check');
        // TODO S266: wire to ubbl_rules.json checker
      }});
      btnUBBL.id = 'doc-ubbl-btn';
      pill.appendChild(btnUBBL);
      // 9. Rosetta Stone — grid calibration mode
      var _rosettaOn = false;
      var btnRosetta = A.icon('rosetta', { size: 24, title: 'Rosetta Stone', onClick: function() {
        _rosettaOn = !_rosettaOn;
        btnRosetta.classList.toggle('active', _rosettaOn);
        if (window.DocCanvas) DocCanvas.setCalibrationMode(_rosettaOn);
        console.log('§DOC_ROSETTA calibration=' + _rosettaOn);
      }});
      btnRosetta.id = 'doc-rosetta-btn';
      pill.appendChild(btnRosetta);
      _docMode = true;
      console.log('§DOC_PILL mode=doc icons=9');
      // S266: extract BOM on Doc pill entry, then activate canvas
      if (window.BOMExtract && A.db) {
        var bld = A.activeBuilding || 'unknown';
        BOMExtract.loadCached(bld, function(cached) {
          if (cached) {
            A._bom = cached;
            console.log('§DOC_BOM cached building=' + bld + ' storeys=' + cached.storeys.length);
          } else {
            A._bom = BOMExtract.extract(A);
            if (A._bom) BOMExtract.applySTDMEP(A._bom);
          }
          // Activate Doc canvas after BOM is ready
          if (A._bom && window.DocCanvas) DocCanvas.activate(A);
          // §S267: Lazy-fetch BOM.db for verb expansion (OOTB fleet only)
          _fetchBomDb(A, bld);
        });
      }
    }
  };

  // Panel toggle (S250 §5 — hides ALL UI chrome for clean screenshots)
  // S265 Phase 4: HUD auto-collapse on mobile (5s after last interaction)
  // §S280: HUD removed — no-op stubs to avoid errors from callers
  var _hudAutoCollapseTimer = null;
  window.resetHudAutoCollapse = function() { return;
    if (_hudAutoCollapseTimer) clearTimeout(_hudAutoCollapseTimer);
    if (!window._isMobile) return; // desktop: no auto-collapse
    _hudAutoCollapseTimer = setTimeout(function() {
      var hudBody = document.getElementById('hud-body');
      if (hudBody && !hudBody.classList.contains('collapsed')) {
        hudBody.classList.add('collapsed');
        console.log('§HUD_AUTOCOLLAPSE 5s idle');
      }
    }, 5000);
  };

  // S265 Phase 4: storey-panel/disc-panel removed (now inside HUD accordion)
  var panelIds = ['hud','search-box','icon-pill','info-panel',
                  'status','grid-overlay-panel','dev-banner',
                  'section-slider-panel'];
  var panelsHidden = false;
  // §S280: toggleAllPanels = old +/- behavior, now triggered by double-tap []
  window.toggleAllPanels = function() {
    panelsHidden = !panelsHidden;
    panelIds.forEach(function(pid) {
      if (pid === 'status' && panelsHidden && A._clashMatrixDiv) return;
      var el = document.getElementById(pid);
      if (el) el.classList.toggle('swipe-hidden', panelsHidden);
    });
    var extras = document.querySelectorAll('.glass-panel, #issues-panel, #find-panel, #nlp-bar, #nlp-chips, #nav-hud');
    extras.forEach(function(el) { el.classList.toggle('swipe-hidden', panelsHidden); });
    if (panelsHidden) {
      if (A._infoCardDiv) { A._infoCardDiv.remove(); A._infoCardDiv = null; }
      if (A._clashListDiv) { A._clashListDiv.remove(); A._clashListDiv = null; }
      if (A.measureLabels) A.measureLabels = A.measureLabels.filter(function(m) { return m.div === A._clashMatrixDiv; });
    }
    console.log('§PANEL_TOGGLE panelsHidden=' + panelsHidden);
  };

  // §S280: [] button — single tap = fullscreen (F11), double tap = close all except latest
  var _focusOnlyHidden = []; // stash panels hidden by double-tap, for restore
  window.focusOnlyLatest = function() {
    if (_focusOnlyHidden.length) {
      // Restore — show everything we hid
      _focusOnlyHidden.forEach(function(el) { el.classList.remove('swipe-hidden'); });
      console.log('§MINMAX_DBL restore count=' + _focusOnlyHidden.length);
      _focusOnlyHidden = [];
      return;
    }
    // Find the latest visible panel (last in focus stack or currently focused)
    var latestId = null;
    if (window._panels) {
      // Use focus stack — last entry is the most recent
      var stack = window._focusStack || [];
      for (var si = stack.length - 1; si >= 0; si--) {
        for (var pi = 0; pi < window._panels.length; pi++) {
          if (window._panels[pi].id === stack[si] && window._panels[pi].el.style.display !== 'none') {
            latestId = stack[si]; break;
          }
        }
        if (latestId) break;
      }
    }
    // Hide all panels + HUD except the latest
    _focusOnlyHidden = [];
    panelIds.forEach(function(pid) {
      var el = document.getElementById(pid);
      if (!el) return;
      // Don't hide if this is the latest panel's container
      if (latestId && el.querySelector && el.contains(document.getElementById(latestId))) return;
      if (el.style.display === 'none' || el.classList.contains('swipe-hidden')) return;
      el.classList.add('swipe-hidden');
      _focusOnlyHidden.push(el);
    });
    var extras = document.querySelectorAll('.glass-panel, #issues-panel, #find-panel, #nlp-bar, #nlp-chips, #nav-hud');
    extras.forEach(function(el) {
      if (el.style.display === 'none' || el.classList.contains('swipe-hidden')) return;
      // Check if this is the latest panel
      if (latestId && el.id === latestId) return;
      el.classList.add('swipe-hidden');
      _focusOnlyHidden.push(el);
    });
    console.log('§MINMAX_DBL focus-only latest=' + (latestId || 'none') + ' hidden=' + _focusOnlyHidden.length);
  };

  (function() {
    var mmBtn = document.getElementById('minmax-btn');
    if (!mmBtn) return;
    var _tapTimer = 0;
    var _DBL_MS = 300;
    mmBtn.addEventListener('pointerup', function(e) {
      e.stopPropagation();
      if (_tapTimer) {
        // Double tap — cancel pending fullscreen, focus on latest panel only
        clearTimeout(_tapTimer);
        _tapTimer = 0;
        window.focusOnlyLatest();
      } else {
        // First tap — wait for possible second
        _tapTimer = setTimeout(function() {
          _tapTimer = 0;
          // Single tap — fullscreen
          if (typeof A.toggleFullscreen === 'function') A.toggleFullscreen();
          else if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
          console.log('§MINMAX single-tap → fullscreen');
        }, _DBL_MS);
      }
    });
  })();

  // §S280: Mobile + Desktop — ESC cascades close, panels stack normally

  // §S280: Scrollable pill — ⋯ trigger, full-height, native scroll (both platforms)
  (function() {
    var pill = document.getElementById('mobile-pill');
    var trigger = document.getElementById('mobile-trigger');
    if (!pill || !trigger) return;

    // Icon actions — sorted by last-used (most recent at bottom, nearest to thumb)
    var _LS_KEY = 'bim_mobile_pill_order';
    var _actions = [
      { id: 'undo',      icon: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 0 1 3-6.36A8.97 8.97 0 0 1 12 4c5 0 9 4 9 9s-4 9-9 9a9 9 0 0 1-7.74-4.41"/>', fn: function() { _doUndo(); } },
      { id: 'find',      icon: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>', fn: function() { if (A.openFindPanel) A.openFindPanel(''); } },
      { id: 'help',      icon: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>', fn: function() { if (typeof showCommandPalette === 'function') showCommandPalette(); } },
      { id: 'walk',      icon: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-3.9 2.5-4.5a5.32 5.32 0 0 1 3-1c3 0 4.5 2.02 5 4 1.12 0 1.44.93 1.44 2H14a3 3 0 0 1 3 3v2"/><path d="M2 22h20"/><path d="M7.5 22v-1.5a2.5 2.5 0 0 1 5 0V22"/><path d="M14.5 22v-1.5a2.5 2.5 0 0 1 5 0V22"/>', fn: function() { if (typeof toggleWalkMode === 'function') toggleWalkMode(); } },
      { id: 'share',     icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>', fn: function() { if (A.quickShare) A.quickShare(); } },
      { id: 'measure',   icon: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>', fn: function() { if (typeof A.toggleMeasure === 'function') A.toggleMeasure(); } },
      { id: 'clash',     icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', fn: function() { if (A._loadClashRules) A._loadClashRules(function(r) { A._currentClashRules = r; A._showClashMatrix(r, document.body); }); } },
      { id: 'tm',        icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', fn: function() { if (typeof toggleTimeMachine === 'function') toggleTimeMachine(); } },
      { id: 'section',   icon: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>', fn: function() { if (A.toggleSection) A.toggleSection(); } },
      { id: 'screenshot', icon: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>', fn: function() { if (A.screenshot) A.screenshot(); } },
      { id: 'night',     icon: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>', fn: function() { if (typeof toggleNightMode === 'function') toggleNightMode(); } },
      { id: 'palette',   icon: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>', fn: function() { if (typeof toggleSunglass === 'function') toggleSunglass(); } },
      { id: 'shadow',    icon: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', fn: function() { if (typeof toggleShadow === 'function') toggleShadow(); } },
      { id: 'fly',       icon: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>', fn: function() { if (typeof toggleFlyAround === 'function') toggleFlyAround(); } },
      { id: 'home',      icon: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', fn: function() { location.href = '../index.html'; } }
    ];

    // Default order: undo, find, help at bottom (nearest thumb), rest above
    var _defaultOrder = ['home','fly','shadow','palette','night','screenshot','section','tm','clash','measure','share','walk','help','find','undo'];

    function _getOrder() {
      try {
        var saved = localStorage.getItem(_LS_KEY);
        if (saved) return JSON.parse(saved);
      } catch(e) {}
      return _defaultOrder.slice();
    }
    function _bumpAction(id) {
      var order = _getOrder();
      var idx = order.indexOf(id);
      if (idx >= 0) order.splice(idx, 1);
      order.push(id); // most recent = bottom
      try { localStorage.setItem(_LS_KEY, JSON.stringify(order)); } catch(e) {}
      return order;
    }

    function _buildPill() {
      pill.innerHTML = '';
      var order = _getOrder();
      var sorted = _actions.slice().sort(function(a, b) {
        var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai < 0) ai = -1;
        if (bi < 0) bi = -1;
        return ai - bi;
      });
      sorted.forEach(function(act) {
        var btn = document.createElement('button');
        btn.title = act.id;
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + act.icon + '</svg>';
        btn.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          _bumpAction(act.id);
          act.fn();
          if (act.id !== 'undo') _closePill();
          console.log('§PILL action=' + act.id);
        });
        pill.appendChild(btn);
      });
    }

    // Build once at startup
    _buildPill();

    var _pillOpen = false;
    function _closePill() {
      pill.style.display = 'none';
      _pillOpen = false;
    }
    window.toggleMobilePill = function() {
      _pillOpen = !_pillOpen;
      pill.style.display = _pillOpen ? 'block' : 'none';
      console.log('§PILL open=' + _pillOpen);
    };
    // Close on tap outside
    document.addEventListener('pointerdown', function(e) {
      if (_pillOpen && !pill.contains(e.target) && e.target !== trigger) _closePill();
    });

    // §S280: Undo via kernel_ops
    var _redoBtn = null;
    function _doUndo() {
      if (!window.KernelOps || !A.db) { A.status.textContent = 'No ops to undo'; return; }
      var op = KernelOps.undoOp(A.db);
      if (!op) { A.status.textContent = 'Nothing to undo'; return; }
      A.status.textContent = 'Undo: ' + op.op_type;
      // Replay scene from clean state
      if (op.op_type === 'VIEW_FILTER' || op.op_type === 'ELEMENT_PICK') {
        // Replay all non-undone VIEW_FILTER ops to restore visibility
        var vfOps = KernelOps.replayOps(A.db, 'VIEW_FILTER');
        if (vfOps.length === 0 && A._resetAllVisibility) A._resetAllVisibility();
        else if (A._applyViewFilter) A._applyViewFilter(vfOps[vfOps.length - 1].parameters);
      }
      // Show redo button in pill
      if (!_redoBtn) {
        _redoBtn = document.createElement('button');
        _redoBtn.title = 'redo';
        _redoBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 0 0-3-6.36A8.97 8.97 0 0 0 12 4c-5 0-9 4-9 9s4 9 9 9a9 9 0 0 0 7.74-4.41"/></svg>';
        _redoBtn.style.color = '#4fc3f7';
        _redoBtn.addEventListener('pointerup', function(e) {
          e.stopPropagation();
          _doRedo();
        });
      }
      // Insert redo after undo in the pill scroll
      var undoBtn = scroll.querySelector('[title="undo"]');
      if (undoBtn && !_redoBtn.parentNode) {
        undoBtn.parentNode.insertBefore(_redoBtn, undoBtn.nextSibling);
      }
      console.log('§MOBILE_UNDO type=' + op.op_type + ' id=' + op.id);
    }
    function _doRedo() {
      if (!window.KernelOps || !A.db) return;
      var op = KernelOps.redoOp(A.db);
      if (!op) {
        A.status.textContent = 'Nothing to redo';
        if (_redoBtn && _redoBtn.parentNode) _redoBtn.parentNode.removeChild(_redoBtn);
        return;
      }
      A.status.textContent = 'Redo: ' + op.op_type;
      // Re-apply the op
      if (op.op_type === 'VIEW_FILTER' && A._applyViewFilter) {
        A._applyViewFilter(op.parameters);
      }
      // Check if more redos available
      var nextRedo = A.db.exec('SELECT id FROM kernel_ops WHERE undone = 1 ORDER BY id ASC LIMIT 1');
      if (!nextRedo.length || !nextRedo[0].values.length) {
        if (_redoBtn && _redoBtn.parentNode) _redoBtn.parentNode.removeChild(_redoBtn);
      }
      console.log('§MOBILE_REDO type=' + op.op_type + ' id=' + op.id);
    }

    console.log('§MOBILE_BAR_READY actions=' + _actions.length);
  })();

  // Register static panels immediately (don't wait for building to load)
  // §S267: Lazy-fetch BOM.db for OOTB fleet buildings (verb expansion)
  // BOM.db lives at buildings/{PREFIX}_BOM.db alongside the extracted DB.
  // Fetched once on Red Pill press, opened via sql.js, stored on A._bomDb.
  // IFC Drop buildings won't have BOM.db — 404 is expected, silently ignored.
  var BOM_IDB_STORE = 'bim_ootb_bomdb';
  function _fetchBomDb(A, buildingName) {
    if (A._bomDb) return; // already loaded
    if (!buildingName || !window.initSqlJs) return;

    // Derive BOM name: strip IFC schema prefix + _extracted/_meta suffixes
    // Ifc2x3_SampleCastle → SampleCastle, HITOS_extracted → HITOS
    var bomName = buildingName
      .replace(/^Ifc2x3_/i, '').replace(/^Ifc4_/i, '')
      .replace(/_extracted$/, '').replace(/_meta$/, '');

    // Try IndexedDB cache first
    _idbGet(BOM_IDB_STORE, bomName + '_BOM', function(cached) {
      if (cached) {
        _openBomDb(A, cached, bomName, 'cache');
        return;
      }
      // Resolve URL: same base as building DB, replace _extracted.db → _BOM.db
      var dbUrl = A.DB_URL || '';
      var bomUrl = '';
      if (dbUrl.indexOf('_extracted.db') !== -1) {
        // Direct replacement: SampleCastle_extracted.db → SampleCastle_BOM.db
        bomUrl = dbUrl.replace(/_extracted\.db.*$/, '_BOM.db');
      } else if (dbUrl.indexOf('buildings/') !== -1) {
        bomUrl = dbUrl.replace(/\/[^/]+$/, '/' + bomName + '_BOM.db');
      } else {
        bomUrl = 'buildings/' + bomName + '_BOM.db';
      }
      console.log('§BOM_DB_FETCH url=' + bomUrl);
      fetch(bomUrl).then(function(resp) {
        if (!resp.ok) {
          console.log('§BOM_DB_FETCH 404 — no BOM.db for ' + prefix + ' (IFC Drop path)');
          return;
        }
        return resp.arrayBuffer();
      }).then(function(buf) {
        if (!buf) return;
        // Cache in IndexedDB
        _idbPut(BOM_IDB_STORE, bomName + '_BOM', new Uint8Array(buf));
        _openBomDb(A, new Uint8Array(buf), bomName, 'fetch');
      }).catch(function(e) {
        console.log('§BOM_DB_FETCH err=' + e.message);
      });
    });
  }

  function _openBomDb(A, buf, bomName, source) {
    initSqlJs({ locateFile: function(f) { return 'lib/' + f; } }).then(function(SQL) {
      A._bomDb = new SQL.Database(buf);
      console.log('§BOM_DB_READY name=' + bomName + ' source=' + source +
        ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB');
      // §S267: BOM.db loaded after Doc canvas activated — reload phases
      if (window.DocCanvas && DocCanvas.isActive()) {
        // Deactivate and reactivate to rebuild envelope + phases from BOM
        DocCanvas.deactivate(A);
        DocCanvas.activate(A);
        console.log('§BOM_DB_RELOAD reactivated Doc canvas with BOM.db');
      }
    }).catch(function(e) {
      console.warn('§BOM_DB_OPEN err=' + e.message);
    });
  }

  // Minimal IndexedDB get/put for BOM.db cache
  function _idbGet(store, key, cb) {
    try {
      var req = indexedDB.open(store, 1);
      req.onupgradeneeded = function(e) { e.target.result.createObjectStore('data'); };
      req.onsuccess = function(e) {
        var tx = e.target.result.transaction('data', 'readonly');
        var get = tx.objectStore('data').get(key);
        get.onsuccess = function() { cb(get.result || null); };
        get.onerror = function() { cb(null); };
      };
      req.onerror = function() { cb(null); };
    } catch(e) { cb(null); }
  }
  function _idbPut(store, key, val) {
    try {
      var req = indexedDB.open(store, 1);
      req.onupgradeneeded = function(e) { e.target.result.createObjectStore('data'); };
      req.onsuccess = function(e) {
        var tx = e.target.result.transaction('data', 'readwrite');
        tx.objectStore('data').put(val, key);
      };
    } catch(e) { /* ignore */ }
  }

  // These exist in HTML from page load — section, sunglasses, toolbar
  setTimeout(function() {
    if (A._wireListKeyNav) A._wireListKeyNav();
    // S265 Phase 4: make info-panel draggable so it doesn't obscure pill
    var infoP = document.getElementById('info-panel');
    if (infoP && A._makeDraggable && !infoP._draggableWired) { A._makeDraggable(infoP); infoP._draggableWired = true; }
    console.log('§PANELS_INIT static panels registered');
  }, 500);
}
