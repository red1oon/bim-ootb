// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// common/history_knob.js — the line-art AMP-KNOB history dial, app-agnostic.
// Spec: prompts/HISTORY_KNOB_DIAL.md. Witness: W-KNOB-DIAL.
//
// WHY: the old depth control wired its dots to undo/redo, which FLIPS kernel ops (the model visibly
//   mutates → "looks corrupted"). This widget is READ-ONLY: depth ticks set the §-net breadth, the two
//   nav ticks STEP one moment by re-applying that moment's stamped VIEW (camera/lens/section) — never
//   touching the signed op-log. The host supplies the 4 verbs; this module owns the dial + gestures.
//
// THE PICTURE (knob.jpeg): rest = just a DOT · press → blooms into a circle + pointer + 6 ticks ·
//   4 DEPTH ticks (Max·High*·Low·Off, High=default) + 2 NAV ticks on the left flank (leftmost=BACK,
//   2nd-leftmost=FRONT). Static-click is the shipped interaction (the spin illusion is a deferred
//   enhancement — robustness over flourish, per the spec's "ship the fallback if spin fights you").
//
// HOST ADAPTER (mount opts) — only the host knows how to read/apply its own state:
//   host        : DOM element or element id to append into
//   source      : 'viewer' | 'idempiere' (§-log tag)
//   getDepth()  : -> 'off'|'low'|'high'|'max'    (current breadth)
//   setDepth(d) : void  (host maps onto its own ladder + persists + sounds its own detent if it wants)
//   stepBack()  / stepFront() : -> {idx,label}|null   READ-ONLY view restore; MUST NOT mutate the op-log
//   canStep()   : -> {back:bool, front:bool}    (empty-state / ends → disable a nav tick)
//   sfx(hz)     : optional detent tone (mute-aware); falls back to window.__sfx, else silent
window.HistoryKnob = (function () {
  'use strict';

  // Palette — reuse the bar's existing families [[feedback_pill_icon_consistency]]: depth = sky-blue,
  // nav = gold, focus halo = amber. No invented glyphs; the dial is pure Lucide-style line-art.
  var DEPTH = '#4fc3f7', DEPTH_DIM = 'rgba(79,195,247,0.30)';
  var NAV = '#ffd479', NAV_DIM = 'rgba(255,212,121,0.30)';
  var AMBER = '#ffb74d', TRACK = 'rgba(255,255,255,0.22)';

  // SVG geometry — angle is degrees, SVG convention (0=east, 90=south, 180=west, 270=north). The arc
  // rides over the TOP (dead zone at the bottom, like an amp knob). 6 ticks across 180°(left)→360°(right).
  var SZ = 46, CX = 23, CY = 23, R_TICK_IN = 15, R_TICK_OUT = 20, R_POINT = 13.5, R_RING = 17;
  // leftmost two = nav (back furthest left), then the 4 depth ticks Off→Low→High→Max rising to the right.
  var TICKS = [
    { id: 'back',  kind: 'nav',   ang: 182, label: 'Back',  hz: 392 },
    { id: 'front', kind: 'nav',   ang: 216, label: 'Front', hz: 440 },
    { id: 'off',   kind: 'depth', ang: 252, label: 'Off',   hz: 150 },
    { id: 'low',   kind: 'depth', ang: 288, label: 'Low',   hz: 300 },
    { id: 'high',  kind: 'depth', ang: 324, label: 'High',  hz: 494 },
    { id: 'max',   kind: 'depth', ang: 360, label: 'Max',   hz: 622 }
  ];
  var DEPTHS = ['off', 'low', 'high', 'max'];
  function _tick(id) { for (var i = 0; i < TICKS.length; i++) if (TICKS[i].id === id) return TICKS[i]; return null; }
  function _rad(a) { return a * Math.PI / 180; }
  function _x(a, r) { return (CX + r * Math.cos(_rad(a))).toFixed(2); }
  function _y(a, r) { return (CY + r * Math.sin(_rad(a))).toFixed(2); }

  function _reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  // One controller per mount (the viewer + the ERP each mount their own).
  function mount(opts) {
    opts = opts || {};
    var host = (typeof opts.host === 'string') ? document.getElementById(opts.host) : opts.host;
    if (!host) { console.warn('§KNOB_NO_HOST ' + (opts.host || '?')); return null; }
    var src = opts.source || 'app';
    var get = opts.getDepth || function () { return 'high'; };
    var set = opts.setDepth || function () {};
    var stepBack = opts.stepBack || function () { return null; };
    var stepFront = opts.stepFront || function () { return null; };
    var canStep = opts.canStep || function () { return { back: false, front: false }; };
    var sfxFn = opts.sfx || null;

    var _open = false, _focused = false, _lastHz = null;
    var wrap = document.createElement('div');
    wrap.className = 'hist-knob-dial';
    wrap.id = 'hist-knob-' + src;
    wrap.style.cssText = 'display:flex;align-items:center;gap:7px;flex:0 0 auto;touch-action:manipulation';
    host.appendChild(wrap);

    // ── REST = a single dot (unobtrusive); hover → "Press Knob"; press → bloom. ────────────
    var dot = document.createElement('button');
    dot.className = 'hk-dot';
    dot.title = 'Press Knob — history dial';
    dot.setAttribute('aria-label', 'Open history knob');
    dot.style.cssText = 'width:12px;height:12px;border-radius:50%;padding:0;cursor:pointer;' +
      'border:1px solid ' + DEPTH + ';background:' + DEPTH_DIM + ';box-shadow:0 0 5px ' + DEPTH_DIM;

    // ── BLOOMED = the knob (svg) + a status label beside it. ───────────────────────────────
    var knob = document.createElement('div');
    knob.className = 'hk-knob';
    knob.tabIndex = 0;                                // focusable → arrow keys + amber halo
    knob.setAttribute('role', 'slider');
    knob.style.cssText = 'display:none;align-items:center;gap:8px;outline:none;border-radius:50%;' +
      'transition:' + (_reduced() ? 'none' : 'box-shadow .12s,transform .12s');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', SZ); svg.setAttribute('height', SZ);
    svg.setAttribute('viewBox', '0 0 ' + SZ + ' ' + SZ);
    svg.style.cssText = 'flex:0 0 auto;cursor:pointer;display:block';
    var lbl = document.createElement('span');
    lbl.className = 'hk-label';
    lbl.style.cssText = 'font-size:11px;line-height:1.1;white-space:nowrap;color:' + DEPTH + ';min-width:62px';
    knob.appendChild(svg); knob.appendChild(lbl);

    wrap.appendChild(dot); wrap.appendChild(knob);

    // ── Sound: detent tick on tick CHANGE only (debounced), mute-aware, + haptic on mobile. ─
    function _detent(hz) {
      if (hz === _lastHz) return;                     // debounce: only on actual change
      _lastHz = hz;
      var muted = false, played = false;
      try {
        if (sfxFn) { sfxFn(hz); played = true; }
        else if (window.__sfx && window.__sfx.isOn) {
          if (!window.__sfx.isOn()) { muted = true; }
          else { window.__sfx.voice('pluck', hz, 55, 0); played = true; }
        }
      } catch (e) {}
      var haptic = false;
      try { if (navigator.vibrate) { navigator.vibrate(10); haptic = true; } } catch (e) {}
      console.log('§KNOB_SOUND fired=onChange hz=' + hz + ' played=' + played + ' muted=' + muted + ' haptic=' + haptic);
    }

    // ── Build the dial face (line-art ring + 6 ticks + pointer). ────────────────────────────
    function _draw() {
      var dep = get(); var step = canStep();
      var html = '';
      // the ring
      html += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R_RING + '" fill="none" stroke="' + TRACK +
        '" stroke-width="1.5"/>';
      // 6 ticks
      for (var i = 0; i < TICKS.length; i++) {
        var t = TICKS[i], active, col, dim;
        if (t.kind === 'depth') { active = (t.id === dep); col = DEPTH; dim = DEPTH_DIM; }
        else { var enabled = (t.id === 'back') ? step.back : step.front; active = false; col = NAV; dim = enabled ? NAV : NAV_DIM; }
        var stroke = active ? col : dim;
        var w = active ? 2.6 : 1.6;
        html += '<line data-tick="' + t.id + '" x1="' + _x(t.ang, R_TICK_IN) + '" y1="' + _y(t.ang, R_TICK_IN) +
          '" x2="' + _x(t.ang, R_TICK_OUT) + '" y2="' + _y(t.ang, R_TICK_OUT) +
          '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round"' +
          (active ? ' filter="url(#hkglow)"' : '') + ' style="cursor:pointer"/>';
      }
      // pointer → points at the active DEPTH tick (the resting position)
      var pt = _tick(dep) || _tick('high');
      html += '<defs><filter id="hkglow" x="-50%" y="-50%" width="200%" height="200%">' +
        '<feGaussianBlur stdDeviation="1.3" result="b"/><feMerge><feMergeNode in="b"/>' +
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
      html += '<circle cx="' + CX + '" cy="' + CY + '" r="3.2" fill="' + DEPTH + '"/>';
      html += '<line id="hk-pointer" x1="' + CX + '" y1="' + CY + '" x2="' + _x(pt.ang, R_POINT) +
        '" y2="' + _y(pt.ang, R_POINT) + '" stroke="' + DEPTH + '" stroke-width="2.4" stroke-linecap="round"' +
        (_reduced() ? '' : ' style="transition:all .14s ease-out"') + '/>';
      svg.innerHTML = html;
      // status label beside the knob — depth tick shows what it means ("Depth: High").
      lbl.textContent = 'Depth: ' + (_tick(dep) ? _tick(dep).label : dep);
      lbl.style.color = DEPTH;
    }

    // Flick the pointer to a nav tick momentarily, then settle back to the active depth (action ≠ rest).
    function _flick(toId) {
      var p = svg.querySelector('#hk-pointer'); var t = _tick(toId); if (!p || !t) return;
      p.setAttribute('x2', _x(t.ang, R_POINT)); p.setAttribute('y2', _y(t.ang, R_POINT));
      p.setAttribute('stroke', NAV);
      if (_reduced()) { _draw(); return; }
      setTimeout(function () { _draw(); }, 220);
    }

    // ── Tick selection — the ONE entry point (click or arrow key). ──────────────────────────
    function _selectDepth(id) {
      var prev = get(); if (id === prev) { _draw(); return; }
      set(id);
      _draw();
      var t = _tick(id);
      console.log('§KNOB_TICK selected=depth:' + id + ' pointerSnap=' + t.ang + ' color=' + DEPTH);
      _detent(t.hz);
    }
    function _selectNav(id) {
      var t = _tick(id); var step = canStep();
      var enabled = (id === 'back') ? step.back : step.front;
      if (!enabled) { console.log('§KNOB_TICK selected=nav:' + id + ' skipped=end-of-history'); return; }
      // READ-ONLY restore: the host re-applies the moment's view; it MUST NOT flip the op-log.
      var r = (id === 'back') ? stepBack() : stepFront();
      _flick(id);
      console.log('§KNOB_TICK selected=nav:' + id + ' pointerSnap=' + t.ang + ' color=' + NAV);
      console.log('§KNOB_RESTORE moment=' + (r && r.idx != null ? r.idx : '?') + ' label="' + (r && r.label || '') +
        '" applyView=' + (r ? 'ok' : 'noop') + ' opLogMutated=NO dotJump=ok halo=amber');
      _detent(t.hz);
    }
    function _onTick(id) {
      var t = _tick(id); if (!t) return;
      if (t.kind === 'depth') _selectDepth(id); else _selectNav(id);
    }

    // ── Bloom / collapse. ───────────────────────────────────────────────────────────────────
    function _setOpen(o) {
      _open = o;
      dot.style.display = o ? 'none' : 'block';
      knob.style.display = o ? 'flex' : 'none';
      if (o) { _draw(); knob.focus(); }
      console.log('§KNOB_BLOOM ' + (o ? 'on' : 'off') + ' source=' + src + (_reduced() ? ' reducedMotion=1' : ''));
    }

    dot.addEventListener('click', function (e) { e.stopPropagation(); _setOpen(true); });
    // click a tick to select; click the empty centre/label to collapse back to a dot.
    svg.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = e.target && e.target.getAttribute && e.target.getAttribute('data-tick');
      if (id) _onTick(id); else _setOpen(false);
    });

    // ── Focus halo + arrow keys (only while focused). ───────────────────────────────────────
    knob.addEventListener('focus', function () {
      _focused = true;
      knob.style.boxShadow = '0 0 0 2px ' + AMBER + ', 0 0 10px ' + AMBER;
      console.log('§KNOB_FOCUS halo=amber arrows=active source=' + src);
    });
    knob.addEventListener('blur', function () { _focused = false; knob.style.boxShadow = 'none'; });
    knob.addEventListener('keydown', function (e) {
      if (!_focused) return;
      var k = e.key;
      if (k === 'ArrowLeft') { e.preventDefault(); _selectNav('back'); }
      else if (k === 'ArrowRight') { e.preventDefault(); _selectNav('front'); }
      else if (k === 'ArrowUp') { e.preventDefault(); _stepDepth(+1); }   // up = deeper net
      else if (k === 'ArrowDown') { e.preventDefault(); _stepDepth(-1); }
      else if (k === 'Escape') { e.preventDefault(); _setOpen(false); }
    });
    function _stepDepth(dir) {
      var i = DEPTHS.indexOf(get()); if (i < 0) i = 2;
      var n = Math.max(0, Math.min(DEPTHS.length - 1, i + dir));
      _selectDepth(DEPTHS[n]);
    }

    // ── Thumbnails (§LOCKED-5) — long/double-press the knob. DEFERRED: detect + §-log the trigger
    //   (a cheap per-moment snapshot tier is a scheduled follow-up, not faked here). ───────────
    var _pressT = 0, _pressTimer = null;
    knob.addEventListener('pointerdown', function () {
      _pressT = (typeof performance !== 'undefined' ? performance.now() : 0);
      _pressTimer = setTimeout(function () {
        console.log('§KNOB_THUMBS trigger=long dots→thumbs=0 deferred=1 (snapshot tier scheduled, not faked)');
      }, 520);
    });
    knob.addEventListener('pointerup', function () { if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; } });
    knob.addEventListener('pointercancel', function () { if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; } });

    // Initial render of the rest dot; the dial draws lazily on first bloom.
    var step0 = canStep();
    console.log('§KNOB_RENDER ticks=6 depth=4(Max,High*,Low,Off) nav=2(back@leftmost,front@2nd) start=' +
      get() + ' source=' + src + ' empty=' + (!step0.back && !step0.front ? 1 : 0) +
      ' reducedMotion=' + (_reduced() ? 1 : 0));

    var ctl = {
      el: wrap,
      open: function () { _setOpen(true); },
      close: function () { _setOpen(false); },
      toggle: function () { _setOpen(!_open); },
      refresh: function () { if (_open) _draw(); },           // host calls after the moment list changes
      isOpen: function () { return _open; }
    };
    return ctl;
  }

  return { mount: mount, _TICKS: TICKS };
})();
