/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * pill_builder.js — §S281: Declarative pill icon + panel builder.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  THE ONE CANONICAL BUILDER (PILLS_CONSOLIDATION_REVIEW_2026-07-03)
 * ═══════════════════════════════════════════════════════════════════
 *  This file superseded the silently-forked erp/pill_builder.js + viewer/pill_builder.js pair.
 *  ALL pill surfaces (viewer.html, erp.html, idempiere.html, glassbowl.html, glassbowl_gravity.html,
 *  index.html) load THIS module. Do not copy it back into erp/ or viewer/ — the witness
 *  erp/tests/witness_pill_canonical.js fails on any second PillBuilder definition (anti-re-fork).
 *
 *  Contract decided 2026-07-03 (see that prompt's §DECISIONS for the evidence):
 *    · CLOSE: only a deliberate ⋯ (trigger) tap collapses the rail — NO outside-tap close, on
 *      EVERY surface. (User decree 2026-07-02: "outside-tap-to-close was too easy to trigger by
 *      accident" — supersedes the 2026-06-09 wrap; the old opts.persistent knob had zero callers
 *      and is DELETED.)
 *    · HOVER: btn.title = act.title || act.name || act.id — `name` is populated by every manifest,
 *      `title` is the optional richer override (e.g. "Verify Ledger — hash-chain tamper check").
 *    · LAYOUT: default = CSS flow inside the pill container (the erp strips). opts.layout:'rail'
 *      opts in the viewer's L-PATH position:fixed rail (stack UP the right edge, wrap along the
 *      top) — it REQUIRES the surface CSS to declare the buttons position:fixed (viewer.html does;
 *      the erp surfaces deliberately keep flow layout).
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
 *    name      Friendly label — the hover tooltip (all manifests populate it).
 *    title     Optional richer hover override (wins over name when set).
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
   * @param {string}      [opts.layout]  'rail' = L-PATH position:fixed layout (viewer); default = CSS flow
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
    var _rail = opts.layout === 'rail';   // viewer L-PATH rail (buttons position:fixed); erp strips stay CSS flow
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
        var _label = act.title || act.name || act.id;   // canonical hover contract (title = rich override, name = manifest label)
        btn.title = _label;
        btn.id = 'pill-' + act.id;
        if (act.img) btn.innerHTML = '<img src="' + act.img + '" width="20" height="20" style="pointer-events:none">';
        else if (act.icon) btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + act.icon + '</svg>';

        // Platform gating
        var _wrongPlatform = (act.platform === 'mobile' && !_onMobile) ||
                             (act.platform === 'desktop' && _onMobile);
        if (_wrongPlatform) {
          btn.style.opacity = '0.35'; btn.style.cursor = 'not-allowed';
          var _msg = act.platform === 'mobile' ? 'Mobile use' : 'Desktop use';
          btn.title = _label + ' — ' + _msg;
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
    // L-PATH layout (rail mode only — ported from the Modeller addd8fe layoutRail): buttons are
    // position:fixed — stack UP the right edge from the ⋯, then turn the corner and flow LEFT along
    // the top when the column fills. Per-index transitionDelay drives the sequential roll-out
    // (forward out, reverse in). Requires the surface CSS to declare the buttons position:fixed.
    function _layoutRail() {
      var btns = pill.querySelectorAll('button');
      var S = 40, G = 7, M = 16, startBottom = 70;                 // clear the ⋯ trigger cluster bottom-right
      var upRoom = window.innerHeight - M - 40 - startBottom;      // headroom before the top edge
      var colN = Math.max(1, Math.floor(upRoom / (S + G)) + 1);    // how many fit up the right edge
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (i < colN) { b.style.right = M + 'px'; b.style.bottom = (startBottom + i * (S + G)) + 'px'; b.style.top = 'auto'; b.style.left = 'auto'; }
        else { var k = i - colN; b.style.top = M + 'px'; b.style.right = (M + (k + 1) * (S + G)) + 'px'; b.style.bottom = 'auto'; b.style.left = 'auto'; }
        b.style.transitionDelay = (_pillOpen ? i * 26 : (btns.length - i) * 14) + 'ms';
      }
    }
    function _close() {
      _pillOpen = false;
      pill.classList.remove('pill-revealing');
      if (_rail) { _layoutRail(); setTimeout(function(){ if (!_pillOpen) pill.style.display = 'none'; }, 360); }
      else pill.style.display = 'none';
    }
    function _toggle() {
      _pillOpen = !_pillOpen;
      if (_pillOpen) {
        pill.style.display = 'block';
        _sync();
        // Reveal cue (user wrap 2026-06-09 — consistent across ALL pill surfaces): on every open the
        // strip RISES into view from behind the bottom-anchored ⋯, so the user sees what was hidden.
        // Re-trigger by reflow so the animation replays each open. The surface CSS defines
        // `.pill-revealing` + its @keyframes (no second animation system).
        if (_rail) _layoutRail();                                   // place buttons + stage per-index delays
        pill.classList.remove('pill-revealing'); void pill.offsetWidth; pill.classList.add('pill-revealing');
      } else {
        pill.classList.remove('pill-revealing');
        if (_rail) { _layoutRail(); setTimeout(function(){ if (!_pillOpen) pill.style.display = 'none'; }, 360); }  // let the roll-IN finish
        else pill.style.display = 'none';
      }
      console.log('§PILL open=' + _pillOpen);
    }
    // Reposition on resize so the L-PATH wrap recomputes (Modeller parity).
    if (_rail) window.addEventListener('resize', function() { if (_pillOpen) _layoutRail(); });

    // Once expanded, the rail stays open — ONLY a deliberate ⋯ press (_toggle) closes it, on EVERY
    // surface. (User decree 2026-07-02: outside-tap-to-close was too easy to trigger by accident.
    // Supersedes the 2026-06-09 outside-close wrap; the dead opts.persistent knob was deleted with it —
    // no caller ever passed it. See PILLS_CONSOLIDATION_REVIEW_2026-07-03 §DECISIONS.) No outside-close.

    // ── Init ──
    _initPanels();
    _build();
    console.log('§PILL_BUILDER ready actions=' + _actions.length + ' layout=' + (_rail ? 'rail' : 'flow'));

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
