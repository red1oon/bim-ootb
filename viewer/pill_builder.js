/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * pill_builder.js — §S281: Declarative pill icon + panel builder.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  HOW TO USE (for developers adding new icons/panels)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  1. ICON ONLY (no panel) — e.g. a link or one-shot action:
 *
 *     { id: 'home', icon: '<path d="..."/>', fn: function() { location.href = '/'; } }
 *
 *  2. ICON + AUTO PANEL — one entry creates icon, panel, toggle, highlight:
 *
 *     { id: 'settings', icon: '<path d="..."/>',
 *       panel: { title: 'Settings', content: '<p>Hello</p>', width: '280px' } }
 *
 *     That's it. The builder will:
 *       - Create a draggable, closable panel via A.createPanel()
 *       - Auto-generate fn: tap toggles panel visibility
 *       - Auto-generate isActive: returns true when panel is visible
 *       - Register with InputReg (Esc close, Tab focus)
 *       - Sync highlight via _syncPillHighlights()
 *
 *  3. ICON + CUSTOM FN + isActive — full control:
 *
 *     { id: 'xray', icon: '<path d="..."/>',
 *       fn: function() { toggleXray(); },
 *       isActive: function() { return !!A._xrayOn; } }
 *
 *  4. PLATFORM GATING — greyed on wrong platform:
 *
 *     { id: 'walk', platform: 'mobile', icon: '...', fn: ... }
 *     { id: 'redpill', platform: 'desktop', img: 'redpill.png', fn: ... }
 *
 *  5. LONG-PRESS SECONDARY — tap = primary, hold = reveal chip:
 *
 *     { id: 'measure', icon: '...', fn: function() { toggleMeasure(); },
 *       hold: function(btn) { _revealChip(btn, 'clash', '...', clashFn); } }
 *
 *  PROPERTIES:
 *    id        (required) Unique string. Button gets id="pill-{id}", panel gets id="{id}-panel".
 *    icon      SVG inner markup (inside <svg viewBox="0 0 24 24">).
 *    img       PNG/image path (used instead of icon SVG if set).
 *    fn        Function called on tap. Auto-generated if panel is set.
 *    panel     { title, content, width } — auto-creates a closable draggable panel.
 *              content can be HTML string or DOM element.
 *    isActive  Function returning boolean — drives .active highlight. Auto-generated if panel is set.
 *    platform  'mobile' | 'desktop' | undefined (both). Wrong platform = greyed + blocked.
 *    hold      Function(btn) for long-press (450ms). Receives the button DOM element.
 *    keepOpen  (legacy) Ignored — pill always stays open now.
 *
 * ═══════════════════════════════════════════════════════════════════
 */
(function() {
  'use strict';

  /**
   * PillBuilder — create a scrollable icon pill from a declarative action list.
   *
   * @param {Object} opts
   * @param {HTMLElement} opts.pill       The scroll container element
   * @param {HTMLElement} opts.trigger    The ⋯ toggle button
   * @param {Object}      opts.APP       The APP object (for createPanel, status, etc.)
   * @param {Array}       opts.actions    Array of action descriptors (see HOW TO USE above)
   * @param {Array}       [opts.order]   Default icon order (array of id strings)
   * @param {string}      [opts.storageKey] localStorage key for persisted order
   * @returns {Object}     { build, sync, actions, isOpen, toggle, close }
   */
  function PillBuilder(opts) {
    var pill = opts.pill;
    var trigger = opts.trigger;
    var A = opts.APP || {};
    var _actions = opts.actions || [];
    var _defaultOrder = opts.order || _actions.map(function(a) { return a.id; });
    var _CFG_KEY = opts.storageKey || 'bim_pill_config';
    var _pillOpen = false;
    var HOLD_MS = 450;

    // ── Config persistence: { order: [], hidden: [] } ──
    function _getConfig() {
      try {
        var s = localStorage.getItem(_CFG_KEY);
        if (s) {
          var cfg = JSON.parse(s);
          // Migration: old format was plain array (order only)
          if (Array.isArray(cfg)) return { order: cfg, hidden: [] };
          return { order: cfg.order || _defaultOrder.slice(), hidden: cfg.hidden || [] };
        }
      } catch(e) {}
      return { order: _defaultOrder.slice(), hidden: [] };
    }
    function _setConfig(cfg) {
      try { localStorage.setItem(_CFG_KEY, JSON.stringify(cfg)); } catch(e) {}
      console.log('§SETTINGS_SAVE items=' + cfg.order.length + ' hidden=' + (cfg.hidden ? cfg.hidden.length : 0));
    }
    function _getOrder() { return _getConfig().order; }
    function _bumpAction(id) {
      var cfg = _getConfig();
      var idx = cfg.order.indexOf(id);
      if (idx >= 0) cfg.order.splice(idx, 1);
      cfg.order.push(id);
      _setConfig(cfg);
      return cfg.order;
    }
    function _resetConfig() {
      try { localStorage.removeItem(_CFG_KEY); } catch(e) {}
      console.log('§SETTINGS_RESET defaults restored');
    }

    // ── Chip (long-press secondary) ──
    var _activeChip = null;
    function _revealChip(srcBtn, id, iconSvg, onTap) {
      if (!srcBtn) return;
      if (_activeChip) { _activeChip.remove(); _activeChip = null; return; }
      var chip = document.createElement('button');
      chip.id = 'chip-' + id;
      chip.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + iconSvg + '</svg>';
      var r = srcBtn.getBoundingClientRect();
      chip.style.cssText =
        'position:fixed;z-index:10000;width:44px;height:44px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:8px;background:rgba(20,20,40,0.85);color:#4fc3f7;cursor:pointer;' +
        'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,0.4);' +
        'top:' + r.top + 'px;left:' + (r.left - 52) + 'px;';
      chip.addEventListener('pointerup', function(e) { e.stopPropagation(); onTap(); if (_activeChip){ _activeChip.remove(); _activeChip=null; } });
      document.body.appendChild(chip); _activeChip = chip;
      setTimeout(function() {
        var d = function(ev){ if (_activeChip && ev.target !== _activeChip && !_activeChip.contains(ev.target)) { _activeChip.remove(); _activeChip=null; document.removeEventListener('pointerdown', d, true); } };
        document.addEventListener('pointerdown', d, true);
      }, 0);
      console.log('§PILL_CHIP reveal=' + id);
    }
    // Expose for actions that define hold with _revealChip
    window._revealChip = _revealChip;

    // ── Auto-panel: wire act.panel → DOM + InputReg + fn + isActive ──
    function _initPanels() {
      _actions.forEach(function(act) {
        if (!act.panel) return;
        var panelId = act.id + '-panel';
        // Auto-generate fn: toggle panel visibility
        if (!act.fn) {
          act.fn = function() {
            var p = document.getElementById(panelId);
            if (p) { p.style.display = p.style.display === 'none' ? '' : 'none'; _sync(); return; }
            // First tap: create panel
            var cfg = act.panel;
            p = A.createPanel(panelId, {
              closable: true,
              style: { position:'fixed', top:'60px', right:'60px', zIndex:'1100', width: cfg.width || '280px', padding:'16px' },
              content: (cfg.title ? '<h3 style="margin:0 0 12px;color:#4fc3f7;font-size:14px">' + cfg.title + '</h3>' : '') +
                       (typeof cfg.content === 'string' ? cfg.content : ''),
              onClose: function() { _sync(); }
            });
            if (cfg.content && typeof cfg.content !== 'string') p.appendChild(cfg.content);
            document.body.appendChild(p);
            if (window.InputReg) InputReg.register({ id: act.id, el: p, kind: 'panel', release: function() { p.style.display = 'none'; } });
            console.log('§PILL_PANEL created id=' + panelId);
          };
        }
        // Auto-generate isActive: panel visible
        if (!act.isActive) {
          act.isActive = function() { var p = document.getElementById(panelId); return p && p.style.display !== 'none'; };
        }
      });
    }

    // ── Highlight sync ──
    function _sync() {
      var n = 0;
      _actions.forEach(function(act) {
        if (!act.isActive) return;
        var btn = document.getElementById('pill-' + act.id);
        if (!btn) return;
        var on = false;
        try { on = !!act.isActive(); } catch(e) {}
        btn.classList.toggle('active', on);
        n++;
      });
      console.log('§PILL_SYNC synced=' + n);
    }

    // ── Build pill DOM ──
    function _build() {
      pill.innerHTML = '';
      var cfg = _getConfig();
      var order = cfg.order;
      var hidden = cfg.hidden || [];
      var sorted = _actions.slice().sort(function(a, b) {
        var ai = order.indexOf(a.id), bi = order.indexOf(b.id);
        if (ai < 0) ai = -1; if (bi < 0) bi = -1;
        return ai - bi;
      });
      var _onMobile = !!window._isMobile;
      sorted.forEach(function(act) {
        // §S282: skip hidden actions and pill:false entries
        if (act.pill === false) return;
        if (hidden.indexOf(act.id) >= 0) return;
        var btn = document.createElement('button');
        btn.title = act.id;
        btn.id = 'pill-' + act.id;
        if (act.img) btn.innerHTML = '<img src="' + act.img + '" width="20" height="20" style="pointer-events:none">';
        else if (act.icon) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + act.icon + '</svg>';

        // Platform gating
        var _wrongPlatform = (act.platform === 'mobile' && !_onMobile) ||
                             (act.platform === 'desktop' && _onMobile);
        if (_wrongPlatform) {
          btn.style.opacity = '0.35'; btn.style.cursor = 'not-allowed';
          var _msg = act.platform === 'mobile' ? 'Mobile use' : 'Desktop use';
          btn.title = act.id + ' — ' + _msg;
          btn.addEventListener('pointerup', function(e) {
            e.stopPropagation();
            if (A.status) A.status.textContent = _msg;
            console.log('§PILL_BLOCKED action=' + act.id + ' platform=' + act.platform);
          });
          pill.appendChild(btn); return;
        }

        // Long-press + tap wiring
        if (act.hold) {
          var _holdTimer = 0, _held = false;
          btn.addEventListener('pointerdown', function(e) {
            e.stopPropagation(); _held = false;
            _holdTimer = setTimeout(function() { _held = true; act.hold(btn); }, HOLD_MS);
          });
          var _cancelHold = function() { if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = 0; } };
          btn.addEventListener('pointerup', function(e) {
            e.stopPropagation(); _cancelHold();
            if (_held) { _held = false; return; }
            _bumpAction(act.id); act.fn(); _sync();
            console.log('§PILL action=' + act.id);
          });
          btn.addEventListener('pointerleave', _cancelHold);
          btn.addEventListener('pointercancel', _cancelHold);
        } else if (act.fn) {
          btn.addEventListener('pointerup', function(e) {
            e.stopPropagation(); _bumpAction(act.id);
            act.fn(); _sync();
            console.log('§PILL action=' + act.id);
          });
        }
        pill.appendChild(btn);
      });
    }

    // ── Open/close ──
    function _close() { pill.style.display = 'none'; _pillOpen = false; }
    function _toggle() {
      _pillOpen = !_pillOpen;
      pill.style.display = _pillOpen ? 'block' : 'none';
      if (_pillOpen) _sync();
      console.log('§PILL open=' + _pillOpen);
    }

    // Close on outside tap
    document.addEventListener('pointerdown', function(e) {
      if (_pillOpen && !pill.contains(e.target) && e.target !== trigger) _close();
    });

    // ── Init ──
    _initPanels();
    _build();
    console.log('§PILL_BUILDER ready actions=' + _actions.length);

    return {
      build:   _build,
      sync:    _sync,
      actions: _actions,
      isOpen:  function() { return _pillOpen; },
      toggle:  _toggle,
      close:   _close,
      revealChip: _revealChip,
      getConfig:   _getConfig,
      setConfig:   function(cfg) { _setConfig(cfg); _build(); _sync(); },
      resetConfig: function() { _resetConfig(); _build(); _sync(); }
    };
  }

  window.PillBuilder = PillBuilder;
})();
