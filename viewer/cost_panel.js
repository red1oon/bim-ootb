// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// cost_panel.js — Implementing 2D_029 §5 — Witness: W-2D29
// Live BOQ panel: spatial query scoped to current grid positions.
// Refreshes on grid drag; shows element counts + VARIANCE from previous state.
(function () {
  'use strict';

  var panel = null;
  var body  = null;   // content div (innerHTML goes here, not on panel)
  var prev  = null;   // previous snapshot {qty, area, vol} per class for variance

  // Default unit rates (cost per m³) by IFC class — generic construction estimates
  var UNIT_RATES = {
    'IfcWall': 250, 'IfcWallStandardCase': 250,
    'IfcSlab': 200, 'IfcColumn': 400, 'IfcBeam': 350,
    'IfcDoor': 800, 'IfcDoorStandardCase': 800,
    'IfcWindow': 900, 'IfcCurtainWall': 600,
    'IfcCovering': 120, 'IfcRailing': 180,
    'IfcStair': 500, 'IfcRoof': 300, 'IfcFooting': 150
  };
  var defaultRate = 100; // fallback for unlisted classes

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'costPanel';
    panel.style.cssText =
      'position:fixed; bottom:60px; right:12px; width:300px; ' +
      'max-height:320px; overflow-y:auto; background:rgba(30,30,30,0.92); ' +
      'color:#eee; font:11px/1.4 monospace; padding:10px; border-radius:6px; ' +
      'pointer-events:auto; z-index:800; display:none;';
    // Close button — lives outside innerHTML so it is never overwritten
    var closeBtn = document.createElement('span');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText =
      'position:absolute; top:4px; right:8px; cursor:pointer; font-size:14px; ' +
      'color:#888; z-index:801;';
    closeBtn.title = 'Close cost panel';
    closeBtn.addEventListener('pointerup', function (e) { e.stopPropagation(); hide(); });
    panel.appendChild(closeBtn);
    // Content div — innerHTML updates go here
    body = document.createElement('div');
    panel.appendChild(body);
    document.body.appendChild(panel);
    return panel;
  }

  /** Format a delta value: green +, red -, grey 0 */
  function fmtDelta(val) {
    if (val === 0 || val === undefined) return '<span style="color:#666">-</span>';
    var sign = val > 0 ? '+' : '';
    var color = val > 0 ? '#4caf50' : '#ff5252';
    return '<span style="color:' + color + '">' + sign + val + '</span>';
  }
  function fmtDeltaF(val, dp) {
    if (val === 0 || val === undefined) return '<span style="color:#666">-</span>';
    var sign = val > 0 ? '+' : '';
    var color = val > 0 ? '#4caf50' : '#ff5252';
    return '<span style="color:' + color + '">' + sign + val.toFixed(dp) + '</span>';
  }

  /**
   * Refresh cost panel with BOQ scoped to current grid bounding box.
   * Shows current totals AND variance (delta) from previous drag.
   */
  function refresh(APP, gridData) {
    if (!APP || !APP.db || !gridData) return;
    if (!panel) createPanel();

    var xs = gridData.xLines.map(function (l) { return l.position; });
    var ys = gridData.yLines.map(function (l) { return l.position; });
    if (!xs.length || !ys.length) {
      body.innerHTML = '<i>No grid lines detected</i>';
      panel.style.display = 'block';
      return;
    }
    var x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs);
    var y1 = Math.min.apply(null, ys), y2 = Math.max.apply(null, ys);

    var sql =
      'SELECT m.ifc_class, COUNT(*) AS qty, ' +
      'ROUND(SUM(t.bbox_x * t.bbox_y), 2) AS area_m2, ' +
      'ROUND(SUM(t.bbox_x * t.bbox_y * t.bbox_z), 3) AS vol_m3 ' +
      'FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid ' +
      'WHERE t.center_x BETWEEN ? AND ? AND t.center_y BETWEEN ? AND ? ' +
      'GROUP BY m.ifc_class ORDER BY vol_m3 DESC';

    var r;
    try { r = APP.db.exec(sql, [x1, x2, y1, y2]); }
    catch (e) { body.innerHTML = '<i>Query error: ' + e.message + '</i>'; panel.style.display = 'block'; return; }

    if (!r.length || !r[0].values.length) {
      body.innerHTML = '<i>No elements in grid scope</i>';
      panel.style.display = 'block';
      return;
    }

    // Build current snapshot for variance comparison
    var curr = {};
    var totalQty = 0, totalArea = 0, totalVol = 0;
    r[0].values.forEach(function (row) {
      var cls = row[0] || '';
      var qty = row[1] || 0, area = row[2] || 0, vol = row[3] || 0;
      curr[cls] = { qty: qty, area: area, vol: vol };
      totalQty  += qty;
      totalArea += area;
      totalVol  += vol;
    });

    // Compute bay dimensions for header
    var bayW = (x2 - x1) * 1000, bayD = (y2 - y1) * 1000;
    var html = '<b>Grid Scope</b> ' + bayW.toFixed(0) + ' \u00D7 ' + bayD.toFixed(0) + ' mm<br>';
    html += '<span style="color:#888;font-size:9px">X[' + x1.toFixed(1) + '\u2013' + x2.toFixed(1) +
            '] Y[' + y1.toFixed(1) + '\u2013' + y2.toFixed(1) + ']</span><br><br>';

    // Table with variance column
    var hasPrev = prev !== null;
    html += '<table style="width:100%;border-collapse:collapse">' +
            '<tr style="color:#888"><th style="text-align:left">Class</th><th>Qty</th>' +
            '<th>Area</th><th>Vol</th>' +
            (hasPrev ? '<th>\u0394 Qty</th><th>\u0394 Vol</th><th>\u0394 Cost</th>' : '') + '</tr>';

    r[0].values.forEach(function (row) {
      var cls = row[0] || '';
      var short = cls.replace('Ifc', '').replace('StandardCase', '');
      var qty = row[1] || 0, area = row[2] || 0, vol = row[3] || 0;
      var p = (hasPrev && prev[cls]) ? prev[cls] : null;
      html += '<tr><td>' + short + '</td>' +
              '<td style="text-align:right">' + qty + '</td>' +
              '<td style="text-align:right">' + area + '</td>' +
              '<td style="text-align:right">' + vol + '</td>';
      if (hasPrev) {
        var dq = p ? qty - p.qty : qty;
        var dv = p ? vol - p.vol : vol;
        var rate = UNIT_RATES[cls] || defaultRate;
        var deltaCost = dv * rate;
        html += '<td style="text-align:right">' + fmtDelta(dq) + '</td>' +
                '<td style="text-align:right">' + fmtDeltaF(dv, 2) + '</td>' +
                '<td style="text-align:right">' + fmtDeltaF(deltaCost, 0) + '</td>';
      }
      html += '</tr>';
    });

    // Show classes that disappeared (in prev but not in curr)
    if (hasPrev) {
      for (var pc in prev) {
        if (!curr[pc]) {
          var short = pc.replace('Ifc', '').replace('StandardCase', '');
          var pcRate = UNIT_RATES[pc] || defaultRate;
          var pcDeltaCost = -prev[pc].vol * pcRate;
          html += '<tr style="color:#ff5252"><td>' + short + '</td>' +
                  '<td style="text-align:right">0</td><td>-</td><td>-</td>' +
                  '<td style="text-align:right">' + fmtDelta(-prev[pc].qty) + '</td>' +
                  '<td style="text-align:right">' + fmtDeltaF(-prev[pc].vol, 2) + '</td>' +
                  '<td style="text-align:right">' + fmtDeltaF(pcDeltaCost, 0) + '</td></tr>';
        }
      }
    }

    // Totals row
    var prevTotQty = 0, prevTotVol = 0;
    if (hasPrev) {
      for (var pk in prev) { prevTotQty += prev[pk].qty; prevTotVol += prev[pk].vol; }
    }
    html += '<tr style="border-top:1px solid #666"><td><b>Total</b></td>' +
            '<td style="text-align:right"><b>' + totalQty + '</b></td>' +
            '<td style="text-align:right"><b>' + totalArea.toFixed(1) + '</b></td>' +
            '<td style="text-align:right"><b>' + totalVol.toFixed(2) + '</b></td>';
    if (hasPrev) {
      // Compute total Δ Cost across all classes
      var totalDeltaCost = 0;
      for (var ck in curr) {
        var pv = prev[ck] ? prev[ck].vol : 0;
        totalDeltaCost += (curr[ck].vol - pv) * (UNIT_RATES[ck] || defaultRate);
      }
      for (var dk in prev) {
        if (!curr[dk]) totalDeltaCost += -prev[dk].vol * (UNIT_RATES[dk] || defaultRate);
      }
      html += '<td style="text-align:right"><b>' + fmtDelta(totalQty - prevTotQty) + '</b></td>' +
              '<td style="text-align:right"><b>' + fmtDeltaF(totalVol - prevTotVol, 2) + '</b></td>' +
              '<td style="text-align:right"><b>' + fmtDeltaF(totalDeltaCost, 0) + '</b></td>';
    }
    html += '</tr></table>';

    console.log('§GRID_3D_BOQ elements=' + totalQty +
                ' area=' + totalArea.toFixed(2) + ' vol=' + totalVol.toFixed(3) +
                (hasPrev ? ' dQty=' + (totalQty - prevTotQty) + ' dVol=' + (totalVol - prevTotVol).toFixed(3) : ' (baseline)'));

    body.innerHTML = html;
    panel.style.display = 'block';

    // Store current as previous for next drag
    prev = curr;
  }

  function hide() {
    if (panel) panel.style.display = 'none';
  }

  function isVisible() {
    return panel && panel.style.display !== 'none';
  }

  function reset() {
    prev = null; // clear baseline on mode exit
  }

  window.CostPanel = { refresh: refresh, hide: hide, isVisible: isVisible, reset: reset };
})();
