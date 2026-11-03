// ad_charts.js — Implementing ERP_AD_UI.md §7 — Witness: W-ERP-ADUI
// Treemap canvas renderer for the erp.html home heatmap (bar/pie/overlay/completeness charts retired 2026-11-03).
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
(function () {
  'use strict';

  var PALETTE = ['#6c9fff', '#ff9f43', '#54d9a8', '#ff6b6b', '#a78bfa',
                  '#38d9d9', '#ffd93d', '#ff85a2', '#7bed9f', '#ff7043'];

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a pie chart on a canvas element.
   * @param {HTMLCanvasElement} canvas
   * @param {Array} labels
   * @param {Array} values
   * @param {string} title
   */

  /**
   * Get prebuilt queries for a table name.
   */

  /**
   * Render chart overlay into a container element.
   * @param {Element} containerEl
   * @param {Object}  db
   * @param {string}  tableName
   */


  // ── §16. Treemap / heatmap ─────────────────────────────────────────

  /**
   * Draw a treemap on a canvas. Items sized by value, coloured by group.
   * @param {HTMLCanvasElement} canvas
   * @param {Array}  items  [{label, value, colour}] sorted by value desc
   * @param {string} title
   * @returns {Array} hit regions [{x,y,w,h,item}] for tap handling
   */
  function drawTreemap(canvas, items, title) {
    var ctx = canvas.getContext('2d');
    // DPR handling — same as drawBarChart
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var cssW = canvas.width, cssH = canvas.height;
    if (canvas.dataset.scaled !== '1' && dpr > 1) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.scale(dpr, dpr);
      canvas.dataset.scaled = '1';
    }
    var W = cssW, H = cssH;
    ctx.clearRect(0, 0, W, H);

    if (!items.length) {
      ctx.fillStyle = '#555';
      ctx.font = '13px system-ui';
      ctx.fillText('No data', 10, 30);
      return [];
    }

    // Title
    var titleH = title ? 26 : 0;
    if (title) {
      ctx.fillStyle = '#e8e8ed';
      ctx.font = 'bold 13px system-ui';
      ctx.fillText(title, 8, 18);
    }

    // Simple grid layout — guaranteed visible cells, no slivers
    var gap = 4;
    var padX = 4, padY = titleH + 4;
    var areaW = W - padX * 2, areaH = H - padY - 4;
    var n = items.length;
    var cols = Math.ceil(Math.sqrt(n * (areaW / areaH)));
    var rows = Math.ceil(n / cols);
    var cellW = Math.floor((areaW - gap * (cols - 1)) / cols);
    var cellH = Math.floor((areaH - gap * (rows - 1)) / rows);

    var hitRegions = [];
    for (var i = 0; i < n; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var cx = padX + col * (cellW + gap);
      var cy = padY + row * (cellH + gap);
      var item = items[i];

      // Filled cell — full opacity, vivid colour
      ctx.fillStyle = item.colour || PALETTE[i % PALETTE.length];
      _roundRect(ctx, cx, cy, cellW, cellH, 6);

      // Inner shadow for depth
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      _roundRect(ctx, cx, cy + cellH * 0.7, cellW, cellH * 0.3, 3);

      // Label — centered
      var label = String(item.label || '').substring(0, Math.floor(cellW / 7));
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.max(10, Math.min(14, Math.floor(cellW / 8))) + 'px system-ui';
      ctx.fillText(label, cx + cellW / 2, cy + cellH / 2 - 2);

      // Value below label
      if (item.value !== undefined) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = Math.max(9, Math.min(12, Math.floor(cellW / 10))) + 'px system-ui';
        ctx.fillText(String(item.value), cx + cellW / 2, cy + cellH / 2 + 14);
      }
      ctx.textAlign = 'left';

      hitRegions.push({ x: cx, y: cy, w: cellW, h: cellH, item: item });
    }

    console.log('§AD_CHARTS drawTreemap title=' + title + ' cells=' + n + ' grid=' + cols + 'x' + rows);
    return hitRegions;
  }

  /**
   * Draw a field completeness heatmap (horizontal bars, red-to-green).
   * @param {HTMLCanvasElement} canvas
   * @param {Array} items [{fieldName, pct}]
   * @param {string} title
   */

  // ── Public API ─────────────────────────────────────────────────────

  var ADCharts = {
    drawTreemap:     drawTreemap
  };

  if (typeof window !== 'undefined') window.ADCharts = ADCharts;
  if (typeof module !== 'undefined' && module.exports) module.exports = ADCharts;

  console.log('§AD_CHARTS_LOADED v1');
})();
