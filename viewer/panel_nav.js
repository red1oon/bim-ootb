/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * panel_nav.js — §S282b: Universal zone-based keyboard navigation for panels.
 *
 * Implementing S282b_LISTBUILDER_PANEL_NAV.md §Phase 2a — Witness: W-PANELNAV
 *
 * Zone types:
 *   { id, el, type:'input' }                    — single input element
 *   { id, header, items(), onSelect, onExpand }  — accordion: header + item list
 *   { id, items(), onSelect }                    — flat list (no header)
 */
(function() {
  'use strict';

  function PanelNav(opts) {
    var panel = opts.panel;
    var zones = opts.zones || [];
    var onClose = opts.onClose;
    var panelId = opts.id || panel.id || 'panel';
    var _zi = 0;   // current zone index
    var _ii = -1;  // item index within zone (-1 = on header/input)

    function _getItems(z) {
      if (!z || !z.items) return [];
      var r = z.items();
      return r ? Array.from(r) : [];
    }

    function _highlightItem(z, idx) {
      var items = _getItems(z);
      items.forEach(function(el, i) {
        el.classList.toggle('active', i === idx);
        el.style.outline = (i === idx) ? '2px solid #4fc3f7' : '';
      });
      if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
    }

    function _clearItems(z) {
      _getItems(z).forEach(function(el) {
        el.classList.remove('active');
        el.style.outline = '';
      });
    }

    function _highlightHeaders() {
      zones.forEach(function(z, i) {
        var el = z.type === 'input' ? z.el : z.header;
        if (!el) return;
        el.style.outline = (i === _zi) ? '2px solid #4fc3f7' : '';
        el.style.background = (i === _zi) ? 'rgba(79,195,247,0.2)' : '';
      });
    }

    function _focusZone(zi) {
      if (zones[_zi]) _clearItems(zones[_zi]);
      _zi = Math.max(0, Math.min(zones.length - 1, zi));
      _ii = -1;
      var z = zones[_zi];
      if (!z) return;
      if (z.type === 'input') z.el.focus();
      else if (z.header) z.header.focus();
      _highlightHeaders();
      console.log('§PANEL_NAV zone=' + z.id + ' idx=' + _zi);
    }

    function _moveItem(delta) {
      var z = zones[_zi];
      if (!z) return;
      // Input zone: ArrowDown → next zone, ArrowUp → prev zone
      if (z.type === 'input') {
        if (delta > 0 && _zi < zones.length - 1) _focusZone(_zi + 1);
        else if (delta < 0 && _zi > 0) _focusZone(_zi - 1);
        return;
      }
      var items = _getItems(z);
      if (!items.length) {
        // Empty zone — skip to next/prev
        if (delta > 0 && _zi < zones.length - 1) _focusZone(_zi + 1);
        else if (delta < 0 && _zi > 0) _focusZone(_zi - 1);
        return;
      }
      // Expand accordion on first ArrowDown into items
      if (z.onExpand && _ii < 0 && delta > 0) z.onExpand(z, true);
      var newIdx = _ii + delta;
      if (newIdx < -1) {
        // Past top of zone → previous zone
        if (_zi > 0) _focusZone(_zi - 1);
        return;
      }
      if (newIdx < 0) {
        // Back to header
        _ii = -1;
        _clearItems(z);
        if (z.header) z.header.focus();
        _highlightHeaders();
        console.log('§PANEL_NAV header zone=' + z.id);
        return;
      }
      if (newIdx >= items.length) {
        // Past bottom of zone → next zone
        if (_zi < zones.length - 1) _focusZone(_zi + 1);
        return;
      }
      _ii = newIdx;
      _highlightItem(z, _ii);
      console.log('§PANEL_NAV item zone=' + z.id + ' idx=' + _ii + '/' + items.length);
    }

    function _cycleHeader(delta) {
      var headers = [];
      zones.forEach(function(z, i) {
        if (z.type === 'input' || z.header) headers.push(i);
      });
      if (!headers.length) return;
      var cur = headers.indexOf(_zi);
      if (cur < 0) cur = 0;
      var next = (cur + delta + headers.length) % headers.length;
      _focusZone(headers[next]);
    }

    var nav = {
      onKey: function(e) {
        if (e.key === 'ArrowDown') { _moveItem(1); return; }
        if (e.key === 'ArrowUp') { _moveItem(-1); return; }
        if (e.key === 'ArrowRight') { _cycleHeader(1); return; }
        if (e.key === 'ArrowLeft') { _cycleHeader(-1); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          var z = zones[_zi];
          if (!z) return;
          if (_ii >= 0) {
            var items = _getItems(z);
            if (items[_ii] && z.onSelect) z.onSelect(items[_ii]);
            else if (items[_ii]) items[_ii].click();
            return;
          }
          // On header → toggle expand/collapse
          if (z.onExpand) z.onExpand(z);
          return;
        }
      },
      // Allow external callers to reset state
      reset: function() { _zi = 0; _ii = -1; }
    };

    // Auto-register with panel system
    if (typeof window._registerPanel === 'function') {
      window._registerPanel(panelId, panel, nav, onClose);
      console.log('§PANEL_NAV_WIRE id=' + panelId + ' zones=' + zones.length);
    }

    return nav;
  }

  window.PanelNav = PanelNav;
})();
