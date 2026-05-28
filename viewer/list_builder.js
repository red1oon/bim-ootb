/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * list_builder.js — §S282b: Reorderable list builder extracted from PillBuilder.
 *
 * Implementing S282b_LISTBUILDER_PANEL_NAV.md §Phase 2b — Witness: W-LISTBUILDER
 *
 * Usage:
 *   ListBuilder({
 *     container: el,
 *     items: [{id, ...}],
 *     getId: function(item) { return item.id; },
 *     render: function(item) { return rowDOM; },
 *     idAttr: 'data-action-id',     // optional, default 'data-list-id'
 *     onReorder: function(newIds) { ... }
 *   });
 */
(function() {
  'use strict';

  function ListBuilder(opts) {
    var container = opts.container;
    var items = opts.items || [];
    var getId = opts.getId || function(item) { return item.id; };
    var render = opts.render;
    var idAttr = opts.idAttr || 'data-list-id';
    var onReorder = opts.onReorder;

    // Render all items
    items.forEach(function(item) {
      var row = render(item);
      row.setAttribute(idAttr, getId(item));
      container.appendChild(row);

      // Drag-to-reorder via pointer events
      var _placeholder = null;
      row.addEventListener('pointerdown', function(e) {
        // Skip if target is a button/input (toggle clicks, etc.)
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        row.style.background = 'rgba(108,159,255,0.1)';
        row.setPointerCapture(e.pointerId);

        _placeholder = document.createElement('div');
        _placeholder.style.cssText = 'height:2px;background:#4fc3f7;margin:0 12px;border-radius:1px;';

        function onMove(ev) {
          var rows = Array.from(container.querySelectorAll('[' + idAttr + ']'));
          if (_placeholder.parentNode) _placeholder.parentNode.removeChild(_placeholder);
          var insertBefore = null;
          for (var i = 0; i < rows.length; i++) {
            var rect = rows[i].getBoundingClientRect();
            if (ev.clientY < rect.top + rect.height / 2) { insertBefore = rows[i]; break; }
          }
          if (insertBefore && insertBefore !== row) container.insertBefore(_placeholder, insertBefore);
          else if (!insertBefore) container.appendChild(_placeholder);
        }
        function onUp(ev) {
          row.releasePointerCapture(ev.pointerId);
          row.removeEventListener('pointermove', onMove);
          row.removeEventListener('pointerup', onUp);
          row.style.background = '';
          if (_placeholder && _placeholder.parentNode) {
            container.insertBefore(row, _placeholder);
            _placeholder.parentNode.removeChild(_placeholder);
          }
          // Read new order from DOM
          if (onReorder) {
            var newOrder = [];
            container.querySelectorAll('[' + idAttr + ']').forEach(function(el) {
              newOrder.push(el.getAttribute(idAttr));
            });
            onReorder(newOrder);
            console.log('§LISTBUILDER_REORDER items=' + newOrder.length);
          }
          _placeholder = null;
        }
        row.addEventListener('pointermove', onMove);
        row.addEventListener('pointerup', onUp);
      });
    });

    console.log('§LISTBUILDER ready items=' + items.length);
    return container;
  }

  window.ListBuilder = ListBuilder;
})();
