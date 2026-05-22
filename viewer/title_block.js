/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
/**
 * title_block.js — Title Block, Scale Bar, North Arrow for Browser 2D Plans
 *
 * Extracts: building name from URL param / DB, storey name from storey selector.
 * Computes positions relative to structBbox (world metres) — never invents.
 *
 * API: window.TitleBlock = { render(opts) → entities[] }
 *   opts: { buildingName, storeyName, viewScale, structBbox, date }
 *
 * Log tags (§TB_ prefix):
 *   §TB_RENDER  — entity count + anchor position
 *
 * Pattern: plain script tag, no ES modules. Attaches to window.TitleBlock.
 * All coords in world metres (same space as section_cut contours).
 * Screen-fixed elements use screenR/screenH/screenFixed flags.
 */
(function () {
  'use strict';

  /**
   * Render title block, scale bar, north arrow.
   * Returns array of DXF-like entities to concatenate with section entities.
   *
   * @param {{
   *   buildingName: string,
   *   storeyName: string,
   *   viewScale: number,      — pixels per metre at render time (for scale bar label)
   *   structBbox: {minX,minY,maxX,maxY},
   *   date: string
   * }} opts
   * @returns {Array} entities
   */
  function render(opts) {
    var out = [];
    var bbox = opts.structBbox;
    if (!bbox || !isFinite(bbox.minX)) {
      console.log('[TitleBlock] §TB_RENDER skipped — no structBbox');
      return out;
    }

    var bldName   = opts.buildingName || 'BIM OOTB';
    var storeyName = opts.storeyName  || '';
    var viewScale  = opts.viewScale   || 20;
    var date       = opts.date        || new Date().toISOString().slice(0, 10);

    var w = bbox.maxX - bbox.minX;
    var h = bbox.maxY - bbox.minY;

    // ── Title block: bottom panel below drawing ───────────────────
    // Position: below bbox by 3m, full width of building + 20% margin each side
    var padX = Math.max(w * 0.20, 3);
    var tbLeft  = bbox.minX - padX;
    var tbRight = bbox.maxX + padX;
    var tbTop   = bbox.minY - 2.0;  // 2m below building bottom
    var tbBot   = tbTop - 3.5;      // 3.5m tall panel
    var tbMid   = (tbLeft + tbRight) / 2;
    var tbW     = tbRight - tbLeft;

    // Outer border
    out.push({
      type: 'LWPOLYLINE',
      vertices: [
        { x: tbLeft,  y: tbTop  },
        { x: tbRight, y: tbTop  },
        { x: tbRight, y: tbBot  },
        { x: tbLeft,  y: tbBot  },
      ],
      shape: true,
      layer: 'A-TTLB',
    });

    // Divider line (2/3 down)
    var divY = tbTop - 1.5;
    out.push({
      type: 'LINE',
      vertices: [{ x: tbLeft, y: divY }, { x: tbRight, y: divY }],
      layer: 'A-TTLB',
    });

    // Vertical divider — right third = logo/scale area
    var vDivX = tbLeft + tbW * 0.68;
    out.push({
      type: 'LINE',
      vertices: [{ x: vDivX, y: tbTop }, { x: vDivX, y: tbBot }],
      layer: 'A-TTLB',
    });

    // Building name (large, top-left cell)
    out.push({
      type: 'TEXT',
      startPoint: { x: tbLeft + 0.3, y: tbTop - 0.55 },
      text: bldName,
      textHeight: 16,
      screenH: true,
      layer: 'A-ANNO-TEXT',
    });

    // Storey name (smaller, below building name)
    out.push({
      type: 'TEXT',
      startPoint: { x: tbLeft + 0.3, y: tbTop - 1.0 },
      text: 'Floor Plan — ' + storeyName,
      textHeight: 11,
      screenH: true,
      layer: 'A-ANNO-TEXT',
    });

    // Date
    out.push({
      type: 'TEXT',
      startPoint: { x: tbLeft + 0.3, y: divY - 0.35 },
      text: date,
      textHeight: 9,
      screenH: true,
      layer: 'A-ANNO-TEXT',
    });

    // "BIM OOTB" label in right cell
    out.push({
      type: 'TEXT',
      startPoint: { x: vDivX + 0.3, y: tbTop - 0.55 },
      text: 'BIM OOTB',
      textHeight: 11,
      screenH: true,
      layer: 'A-ANNO-TEXT',
    });

    // ── Scale bar — bottom-left of title block ────────────────────
    // Compute a round-number bar length from viewScale
    // target ~80px wide on screen → world length = 80 / viewScale
    var targetPx   = 80;
    var worldLen   = targetPx / viewScale;
    // Round to nearest 0.5, 1, 2, 5, 10m
    var steps      = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];
    var barLen     = steps.reduce(function (best, s) {
      return Math.abs(s * viewScale - targetPx) < Math.abs(best * viewScale - targetPx) ? s : best;
    }, steps[0]);
    var barLabel   = barLen >= 1 ? barLen.toFixed(0) + 'm' : (barLen * 100).toFixed(0) + 'cm';

    var sbLeft  = tbLeft + 0.4;
    var sbRight = sbLeft + barLen;
    var sbY     = tbBot + 0.9;

    // Bar body
    out.push({
      type: 'LINE',
      vertices: [{ x: sbLeft, y: sbY }, { x: sbRight, y: sbY }],
      layer: 'A-ANNO-DIMS',
    });
    // Left tick
    out.push({
      type: 'LINE',
      vertices: [{ x: sbLeft, y: sbY - 0.1 }, { x: sbLeft, y: sbY + 0.1 }],
      layer: 'A-ANNO-DIMS',
    });
    // Right tick
    out.push({
      type: 'LINE',
      vertices: [{ x: sbRight, y: sbY - 0.1 }, { x: sbRight, y: sbY + 0.1 }],
      layer: 'A-ANNO-DIMS',
    });
    // "0" at left
    out.push({
      type: 'TEXT',
      startPoint: { x: sbLeft, y: sbY + 0.2 },
      text: '0',
      textHeight: 8,
      screenH: true,
      layer: 'A-ANNO-DIMS',
    });
    // Length label at right
    out.push({
      type: 'TEXT',
      startPoint: { x: sbRight, y: sbY + 0.2 },
      text: barLabel,
      textHeight: 8,
      screenH: true,
      layer: 'A-ANNO-DIMS',
    });

    // ── North arrow — top-right corner of drawing area ────────────
    // Fixed screen-space position: use world coords near bbox top-right + offset
    // Draw a simple N-arrow: vertical line + arrowhead + N text
    var nCx = bbox.maxX + padX * 0.6;   // right of building
    var nCy = bbox.maxY + 1.0;          // above building top
    var aLen = 1.2;                     // world metres arrow length (scales with zoom)

    // Arrow shaft
    out.push({
      type: 'LINE',
      vertices: [{ x: nCx, y: nCy - aLen / 2 }, { x: nCx, y: nCy + aLen / 2 }],
      layer: 'A-ANNO-DIMS',
    });
    // Arrowhead left line
    out.push({
      type: 'LINE',
      vertices: [{ x: nCx, y: nCy + aLen / 2 }, { x: nCx - aLen * 0.18, y: nCy + aLen * 0.1 }],
      layer: 'A-ANNO-DIMS',
    });
    // Arrowhead right line
    out.push({
      type: 'LINE',
      vertices: [{ x: nCx, y: nCy + aLen / 2 }, { x: nCx + aLen * 0.18, y: nCy + aLen * 0.1 }],
      layer: 'A-ANNO-DIMS',
    });
    // N label above arrow
    out.push({
      type: 'TEXT',
      startPoint: { x: nCx, y: nCy + aLen / 2 + 0.35 },
      text: 'N',
      textHeight: 13,
      screenH: true,
      align: 'center',
      layer: 'A-ANNO-TEXT',
    });

    console.log('[TitleBlock] §TB_RENDER entities=' + out.length +
                ' bld=' + bldName + ' storey=' + storeyName +
                ' barLen=' + barLen + 'm anchor=[' + tbLeft.toFixed(1) + ',' + tbBot.toFixed(1) + ']');
    return out;
  }

  if (typeof window !== 'undefined') {
    window.TitleBlock = { render: render };
  }
  if (typeof module !== 'undefined') {
    module.exports = { render: render };
  }

})();
