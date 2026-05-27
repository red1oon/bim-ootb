/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// input_registry.js — §S281: unified "control panel navigation" contract.
// Single source of truth for keyboard routing: Tab focus order, arrow/Enter
// traversal within the focused panel, Esc LIFO release, and icon highlight.
//
// P0 (this commit) is a FACADE over the existing scene.js focus state
// (window._panels / _focusStack / _getFocusedPanel / _registerPanel /
// _focusPanel / _blurPanel / _cyclePanel). It adds the InputReg API surface
// WITHOUT changing any focus/Tab/Esc behaviour — scene.js still owns the logic.
// Later phases migrate ownership in and retire the scattered Esc handlers.
//
// Loads BEFORE scene.js wiring runs; methods read window.* lazily so the
// facade tolerates being defined before scene.js finishes its IIFE.
(function () {
  'use strict';

  // ── Icon subscribers (kind:'icon') — state-only, not in Tab/Esc stack ──
  // Panels continue to live in scene.js's _panels[] via the delegators below.
  // Icons register here so syncActiveButtons() is the single highlight authority.
  var _icons = []; // { id, btnId, isActive, release }

  function _focusedPanel() {
    return (typeof window._getFocusedPanel === 'function') ? window._getFocusedPanel() : null;
  }
  function _panels() { return window._panels || []; }

  var InputReg = {
    // ── Panel registration: delegates to scene.js (byte-compatible) ──
    // sub = { id, el, kind, onKey, onTypeahead, isActive, release, tabbable }
    register: function (sub) {
      if (!sub || !sub.id) { console.log('§INPUTREG register SKIP (no id)'); return; }
      if (sub.kind === 'icon') {
        // Replace existing icon with same id (idempotent re-register)
        for (var i = _icons.length - 1; i >= 0; i--) {
          if (_icons[i].id === sub.id) _icons.splice(i, 1);
        }
        _icons.push({
          id: sub.id,
          btnId: sub.btnId || null,
          isActive: sub.isActive || function () { return false; },
          release: sub.release || function () {}
        });
        console.log('§INPUTREG register icon id=' + sub.id + ' total=' + _icons.length);
        return;
      }
      // Panel → scene.js registry. nav carries onKey/onTypeahead.
      var nav = (sub.onKey || sub.onTypeahead)
        ? { onKey: sub.onKey, onTypeahead: sub.onTypeahead, active: false }
        : null;
      if (typeof window._registerPanel === 'function') {
        window._registerPanel(sub.id, sub.el, nav, sub.release || null);
      } else {
        console.log('§INPUTREG register DEFER panel id=' + sub.id + ' (scene not ready)');
      }
    },

    unregister: function (id) {
      for (var i = _icons.length - 1; i >= 0; i--) {
        if (_icons[i].id === id) { _icons.splice(i, 1); }
      }
      var ps = _panels();
      for (var j = ps.length - 1; j >= 0; j--) {
        if (ps[j].id === id) { ps.splice(j, 1); }
      }
      console.log('§INPUTREG unregister id=' + id);
    },

    focus: function (id) { if (window._focusPanel) window._focusPanel(id); },
    blur: function () { if (window._blurPanel) window._blurPanel(); },
    cycle: function (dir) { if (window._cyclePanel) window._cyclePanel(dir); },

    // CURRENT focused panel (top of focus). null when nothing focused.
    focusTop: function () { return _focusedPanel(); },

    // Ordered ids: previous-focus stack (oldest→newest) + current on top.
    focusStackIds: function () {
      var stack = (window._focusStack || []).slice();
      var cur = _focusedPanel();
      if (cur && stack[stack.length - 1] !== cur.id) stack.push(cur.id);
      return stack;
    },

    // Esc LIFO peel: release the current focused panel, pop to previous.
    // Returns true if something was released (caller does preventDefault).
    // P0: panels only — icons are not on the Esc stack yet (see plan).
    releaseTop: function () {
      var top = _focusedPanel();
      if (!top) return false;
      console.log('§INPUTREG releaseTop id=' + top.id + ' hasRelease=' + !!top.close);
      if (top.close) top.close();
      if (window._blurPanel) window._blurPanel();
      return true;
    },

    // Single authority for icon button highlight — replaces panels.js manual sync.
    syncActiveButtons: function () {
      var n = 0;
      for (var i = 0; i < _icons.length; i++) {
        var ic = _icons[i];
        if (!ic.btnId) continue;
        var b = document.getElementById(ic.btnId);
        if (!b) continue;
        var on = false;
        try { on = !!ic.isActive(); } catch (err) { on = false; }
        b.classList.toggle('active', on);
        n++;
      }
      console.log('§INPUTREG syncActiveButtons synced=' + n + '/' + _icons.length);
      return n;
    },

    // §S281: runtime shortcut self-check. Emits ONE line PER shortcut with a uniform,
    // greppable signature (matches the codebase §TAG key=val convention):
    //   §SHORTCUT key=<k> status=ok|dead|inline target=<fn|->
    // then a summary:
    //   §SHORTCUT_AUDIT total=N ok=N dead=N deadKeys=<k,k>
    // status=dead = a shortcut whose target fn is missing/unreachable (silent-dead-key bug).
    // status=inline = no resolvable fn call (pure inline DOM logic) — not checkable, not failed.
    // Call anytime: InputReg.checkShortcuts(). Returns array of dead keys.
    checkShortcuts: function (shortcuts) {
      var map = shortcuts || window._shortcuts || {};
      var keys = Object.keys(map);
      var dead = [], okN = 0, inlineN = 0;
      var KEYWORDS = ['if','typeof','function','then','else','for','while','return','catch','switch'];
      var OBJS = ['window','A','APP'];
      // DOM / built-in calls are legitimate inline logic, not dead-fn candidates.
      var DOM_BUILTINS = ['getElementById','querySelector','querySelectorAll','click','remove',
        'getAttribute','setAttribute','dispatchEvent','focus','blur','contains','closest',
        'preventDefault','stopPropagation','forEach','indexOf','slice','push','toLowerCase',
        'classList','add','toggle','removeChild','appendChild'];
      keys.forEach(function (k) {
        var fn = map[k], status, target = '-';
        if (typeof fn !== 'function') {
          status = 'dead'; target = 'not-fn'; dead.push(k);
        } else {
          var body = Function.prototype.toString.call(fn);
          var names = [], re = /(?:\b(?:window|A|APP)\.)?([a-zA-Z_$][\w$]*)\s*\(/g, mm;
          while ((mm = re.exec(body)) !== null) {
            var n = mm[1];
            if (KEYWORDS.indexOf(n) < 0 && OBJS.indexOf(n) < 0 && DOM_BUILTINS.indexOf(n) < 0) names.push(n);
          }
          if (!names.length) { status = 'inline'; inlineN++; }
          else {
            var hit = names.filter(function (n) {
              return typeof window[n] === 'function'
                || (window.APP && typeof window.APP[n] === 'function')
                || (window.A && typeof window.A[n] === 'function');
            });
            if (hit.length) { status = 'ok'; target = hit[0]; okN++; }
            else { status = 'dead'; target = names.join(','); dead.push(k); }
          }
        }
        // one uniform line per shortcut — grep `status=dead` to see exactly which fail
        (status === 'dead' ? console.warn : console.log)(
          '§SHORTCUT key=' + k + ' status=' + status + ' target=' + target);
      });
      console.log('§SHORTCUT_AUDIT total=' + keys.length + ' ok=' + okN +
        ' inline=' + inlineN + ' dead=' + dead.length + ' deadKeys=' + (dead.join(',') || '-'));
      return dead;
    },

    // Test/debug surface
    _icons: _icons
  };

  window.InputReg = InputReg;
  console.log('§INPUTREG ready (facade over scene.js focus state)');
  // Auto self-check shortcuts shortly after load (gives scene.js time to define _shortcuts + fns).
  // §S281: _shortcuts is exported late (inside async setupScene, gated on renderer+DB init).
  // Poll until it exists rather than fire on a blind timer that races the async setup
  // (a fixed 2.5s timer reported a false total=0 on slow DB loads). Cap at ~30s.
  (function pollAudit(tries) {
    if (window._shortcuts && Object.keys(window._shortcuts).length) {
      try { InputReg.checkShortcuts(); } catch (e) { console.warn('§SHORTCUT_AUDIT error=' + e.message); }
      return;
    }
    if (tries <= 0) { console.warn('§SHORTCUT_AUDIT error=_shortcuts never appeared (scene init incomplete)'); return; }
    setTimeout(function () { pollAudit(tries - 1); }, 1000);
  })(30);
})();
