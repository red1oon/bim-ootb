/**
 * BIM OOTB — clash_matrix.js — Clash matrix grid + R-tree count
 * Extracted from measure.js (S278 Phase 2)
 * _showClashMatrix + _countClashesRtree
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// Implementing S278_REFACTOR_CLASH_PANELS.md §Phase 2 — Witness: W-CLASH_MATRIX
function setupClashMatrix(A) {
  var _isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var _panelBgStrong = _isMobile ? 'background:rgba(15,45,80,0.95);' : 'background:rgba(20,60,100,0.65);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';

  // §S278: Cache discipline element lists — reused across matrix count calls
  A._clashDiscCache = {};

  A._countClashesRtree = function(storey, rules, discA, discB) {
    var ignoreSet = {};
    rules.clash_rules.forEach(function(r) {
      (r.ignore_classes || []).forEach(function(c) { ignoreSet[c] = 1; });
    });
    var storeyFilter = storey ? " AND m.storey = '" + storey.replace(/'/g, "''") + "'" : "";
    var ignoreFilter = Object.keys(ignoreSet).length ?
      " AND m.ifc_class NOT IN (" + Object.keys(ignoreSet).map(function(c) { return "'" + c + "'"; }).join(',') + ")" : "";

    // §S278: Cache per-discipline element lists to avoid re-querying
    var cacheKey = discB + '|' + storeyFilter + ignoreFilter;
    var bMap;
    if (A._clashDiscCache[cacheKey]) {
      bMap = A._clashDiscCache[cacheKey];
    } else {
      bMap = {};
      A.dbQuery(
        "SELECT t.rowid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z, m.guid" +
        " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
        " WHERE m.discipline = '" + discB + "'" + storeyFilter + ignoreFilter + " AND t.bbox_x IS NOT NULL"
      ).forEach(function(r) { bMap[r[0]] = r; });
      A._clashDiscCache[cacheKey] = bMap;
    }

    var cacheKeyA = discA + '|' + storeyFilter + ignoreFilter;
    var rowsA;
    if (A._clashDiscCache[cacheKeyA + '_rows']) {
      rowsA = A._clashDiscCache[cacheKeyA + '_rows'];
    } else {
      rowsA = A.dbQuery(
        "SELECT t.rowid, m.guid, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z" +
        " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
        " WHERE m.discipline = '" + discA + "'" + storeyFilter + ignoreFilter + " AND t.bbox_x IS NOT NULL"
      );
      A._clashDiscCache[cacheKeyA + '_rows'] = rowsA;
    }

    var count = 0;
    var seen = {};
    for (var i = 0; i < rowsA.length; i++) {
      var ra = rowsA[i];
      var minX = ra[2] - ra[5]/2, maxX = ra[2] + ra[5]/2;
      var minY = ra[3] - ra[6]/2, maxY = ra[3] + ra[6]/2;
      var minZ = ra[4] - ra[7]/2, maxZ = ra[4] + ra[7]/2;
      var cands;
      try {
        cands = A.dbQuery("SELECT r.id FROM elements_rtree r WHERE " +
          "r.maxX >= " + minX + " AND r.minX <= " + maxX + " AND " +
          "r.maxY >= " + minY + " AND r.minY <= " + maxY + " AND " +
          "r.maxZ >= " + minZ + " AND r.minZ <= " + maxZ);
      } catch(e) { continue; }
      for (var ci = 0; ci < cands.length; ci++) {
        var rb = bMap[cands[ci][0]];
        if (!rb || rb[7] === ra[1]) continue;
        var key = ra[1] < rb[7] ? ra[1] + '|' + rb[7] : rb[7] + '|' + ra[1];
        if (seen[key]) continue;
        seen[key] = 1;
        var bMinX = rb[1] - rb[4]/2, bMaxX = rb[1] + rb[4]/2;
        var bMinY = rb[2] - rb[5]/2, bMaxY = rb[2] + rb[5]/2;
        var bMinZ = rb[3] - rb[6]/2, bMaxZ = rb[3] + rb[6]/2;
        if (maxX > bMinX && minX < bMaxX && maxY > bMinY && minY < bMaxY && maxZ > bMinZ && minZ < bMaxZ) {
          count++;
        }
      }
    }
    return count;
  };

  A._showClashMatrix = function(rules, anchorDiv) {
    // Already showing — do nothing
    if (A._clashMatrixDiv) return;
    // Full scene stays — S232 InstancedMesh batching keeps it light

    // Only show disciplines actually present in this building
    var dbDiscSet = {};
    var dbDiscs = A.dbQuery("SELECT DISTINCT discipline FROM elements_meta WHERE discipline IS NOT NULL AND discipline != ''");
    dbDiscs.forEach(function(r) { dbDiscSet[r[0]] = 1; });
    var discs = Object.keys(dbDiscSet).sort();
    if (discs.length < 2) {
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_matrix_need_discs||'Matrix needs 2+ disciplines (found: {d})').replace('{d}', discs.join(', '));
      return;
    }

    // Build lookup: "ARC|STR" → rule
    var ruleLookup = {};
    rules.clash_rules.forEach(function(r) {
      var k1 = r.source.discipline + '|' + r.target.discipline;
      var k2 = r.target.discipline + '|' + r.source.discipline;
      ruleLookup[k1] = r;
      ruleLookup[k2] = r;
    });

    var storey = A._currentClashStorey;

    // Inject pulse animation if not already present
    if (!document.getElementById('clash-pulse-style')) {
      var styleEl = document.createElement('style');
      styleEl.id = 'clash-pulse-style';
      styleEl.textContent = '@keyframes clash-pulse{0%,100%{box-shadow:0 0 4px rgba(79,195,247,0.3)}50%{box-shadow:0 0 12px rgba(79,195,247,0.9)}}';
      document.head.appendChild(styleEl);
    }

    // CSS sphere helper (larger, 20px)
    var _msphere = function(color, pulse) {
      var light = color === '#4caf50' ? '#8fef8f' : color === '#ff0000' ? '#ff8888' : color === '#ff2090' ? '#ff88cc' : color === '#ff8c00' ? '#ffc966' : '#ccc';
      var anim = pulse ? 'animation:clash-pulse 1.2s ease-in-out infinite;' : '';
      return '<span style="display:inline-block;width:20px;height:20px;border-radius:50%;' +
        'background:radial-gradient(circle at 35% 35%,' + light + ',' + color + ' 60%,#111);' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.4);' + anim + '"></span>';
    };

    // Cheap check: element count per discipline (no join, instant)
    var discCounts = {};
    var dcRows = A.dbQuery("SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline");
    dcRows.forEach(function(r) { discCounts[r[0]] = r[1]; });

    // Build table — pulsing sphere = pending check, green = clear
    // S251: mobile → true triangle: X top-right, export bottom-right, collapse green rows
    var cellSz = _isMobile ? 28 : 36;
    var triMode = _isMobile;
    var activePairs = [];
    var _buildCellHtml = function(rowDisc, colDisc, sz) {
      var key = rowDisc + '|' + colDisc;
      var rule = ruleLookup[key];
      var cellContent = '';
      if (!rule) {
        cellContent = '<span style="color:rgba(255,255,255,0.15);font-size:9px">—</span>';
      } else if (!discCounts[rowDisc] || !discCounts[colDisc]) {
        cellContent = _msphere('#4caf50');
      } else {
        cellContent = _msphere('#ccc', true);
        activePairs.push({ discA: rowDisc, discB: colDisc, key: key });
      }
      return '<div data-pair="' + key + '" style="display:inline-flex;align-items:center;justify-content:center;width:' + sz + 'px;height:' + sz + 'px;cursor:pointer;border:1px solid rgba(255,255,255,0.08)">' + cellContent + '</div>';
    };
    var html = '';
    if (triMode) {
      // S251: true triangle — X top-right, row labels RIGHT, col labels BOTTOM
      // X and export share the same rightmost column (28px wide)
      var rCol = 28;
      html = '<div id="clash-tri-wrap" style="display:flex;flex-direction:column;align-items:flex-end">';
      // X alone at top-right, same width as right column
      html += '<div style="width:' + rCol + 'px;text-align:center;pointer-events:auto"><span id="clash-matrix-close" style="cursor:pointer;color:#aaa;font-size:16px;line-height:1">\u2715</span></div>';
      for (var ri = 1; ri < discs.length; ri++) {
        html += '<div data-tri-row="' + discs[ri] + '" style="display:flex;align-items:center;pointer-events:auto">';
        for (var ci = 0; ci < ri; ci++) {
          html += _buildCellHtml(discs[ri], discs[ci], cellSz);
        }
        html += '<span style="width:' + rCol + 'px;font-size:8px;font-weight:bold;color:#fff;text-align:center;white-space:nowrap;writing-mode:vertical-rl">' + discs[ri] + '</span>';
        html += '</div>';
      }
      // Bottom row: col labels + export in same right column
      html += '<div style="display:flex;align-items:center;pointer-events:auto">';
      for (var ci = 0; ci < discs.length - 1; ci++) {
        html += '<div style="width:' + cellSz + 'px;font-size:8px;font-weight:bold;color:#888;text-align:center">' + discs[ci] + '</div>';
      }
      html += '<span id="clash-matrix-export" style="width:' + rCol + 'px;text-align:center;cursor:pointer;font-size:14px;opacity:0.8" title="Clash Report">\ud83d\udcca</span>';
      html += '</div></div>';
    } else {
      // Desktop: full square matrix as table
      html = '<table style="border-collapse:collapse">';
      html += '<tr><td></td>';
      discs.forEach(function(d) {
        html += '<td style="padding:2px 4px;font-size:10px;font-weight:bold;text-align:center;color:#fff">' + d + '</td>';
      });
      html += '</tr>';
      discs.forEach(function(rowDisc, ri) {
        html += '<tr>';
        html += '<td style="padding:2px 4px;font-size:10px;font-weight:bold;color:#fff;text-align:right">' + rowDisc + '</td>';
        discs.forEach(function(colDisc, ci) {
          if (rowDisc === colDisc) {
            html += '<td style="width:' + cellSz + 'px;height:' + cellSz + 'px;text-align:center;background:rgba(0,0,0,0.15)"></td>';
            return;
          }
          var key = rowDisc + '|' + colDisc;
          var rule = ruleLookup[key];
          var cellContent = '';
          if (!rule) {
            cellContent = '<span style="color:rgba(255,255,255,0.15);font-size:9px">—</span>';
          } else if (!discCounts[rowDisc] || !discCounts[colDisc]) {
            cellContent = _msphere('#4caf50');
          } else {
            cellContent = _msphere('#ccc', true);
            activePairs.push({ discA: rowDisc, discB: colDisc, key: key });
          }
          html += '<td data-pair="' + key + '" style="width:' + cellSz + 'px;height:' + cellSz + 'px;text-align:center;cursor:pointer;border:1px solid rgba(255,255,255,0.08)">' + cellContent + '</td>';
        });
        html += '</tr>';
      });
      html += '</table>';
    }

    var matDiv = document.createElement('div');
    matDiv.style.cssText = 'position:fixed;z-index:350;' + (_isMobile ? '' : _panelBgStrong) + 'color:#fff;padding:' + (_isMobile ? '0' : '10px') + ';border-radius:8px;' + (_isMobile ? 'background:transparent;border:none;pointer-events:none;' : 'border:1px solid rgba(79,195,247,0.5);pointer-events:auto;') + 'font-family:Segoe UI,sans-serif';

    // Position: mobile → left-side bottom corner (triangle layout, not draggable);
    //           desktop → below info card, draggable
    var anchorRect = anchorDiv.getBoundingClientRect();
    if (_isMobile) {
      matDiv.style.right = '4px';
      matDiv.style.bottom = '4px';
      matDiv.style.maxHeight = '60vh';
      matDiv.style.overflowY = 'auto';
    } else {
      matDiv.style.right = '10px';
    }
    var scopeLabel = storey ? storey : 'Whole Building';
    if (_isMobile) {
      // Mobile: X and export are inside the triangle layout itself
      matDiv.innerHTML = html;
    } else {
      matDiv.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<b style="color:#4fc3f7;font-size:12px">Clash Matrix \u2014 ' + scopeLabel + '</b>' +
        '<span style="display:flex;gap:8px;align-items:center">' +
        '<span id="clash-matrix-export" style="cursor:pointer;font-size:16px" title="Clash Report">\ud83d\udcca</span>' +
        '<span id="clash-matrix-close" style="cursor:pointer;color:#aaa;font-size:22px;line-height:1;padding:6px">\u2715</span></span></div>' +
        '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:4px 0">' + html;
    }
    document.body.appendChild(matDiv);
    // Adjust vertical to fit (desktop only — mobile uses bottom:6px)
    if (!_isMobile) {
      var matH = matDiv.offsetHeight;
      var topPos = anchorRect.bottom + 6;
      if (topPos + matH > window.innerHeight - 10) topPos = window.innerHeight - matH - 10;
      if (topPos < 10) topPos = 10;
      matDiv.style.top = topPos + 'px';
    }

    A._clashMatrixDiv = matDiv;
    A._makeDraggable(matDiv);
    A.measureLabels.push({ div: matDiv, mid: null });

    // Export from matrix
    var _matExport = function(ev) { ev.stopPropagation(); ev.preventDefault(); console.log('§MATRIX_EXPORT_TAP'); A._exportClashReport(); };
    var expBtn = matDiv.querySelector('#clash-matrix-export');
    if (expBtn) {
      expBtn.addEventListener('pointerup', _matExport);
      expBtn.addEventListener('click', _matExport);
      console.log('§MATRIX_EXPORT_WIRED');
    } else {
      console.warn('§MATRIX_EXPORT_BTN not found');
    }

    // Close X for matrix
    var _matClose = function(ev) {
      ev.stopPropagation();
      if (A._clashRevealActive) A._dismissClashes();
      if (A._clashMatrixDiv) { A._clashMatrixDiv.remove(); A._clashMatrixDiv = null; }
      // S245e: Exit clash DLOD mode when matrix closed via X
      if (A._clashModeActive && A._exitClashMode) A._exitClashMode();
    };
    matDiv.querySelector('#clash-matrix-close').addEventListener('pointerup', _matClose);
    matDiv.querySelector('#clash-matrix-close').addEventListener('click', _matClose);

    // Click cell → open filtered clash list for that pair
    matDiv.addEventListener('click', function(ev) {
      if (ev.target.id === 'clash-matrix-close') return;
      var cell = ev.target.closest('[data-pair]');
      if (!cell) return;
      ev.stopPropagation();
      var pair = cell.getAttribute('data-pair');
      var parts = pair.split('|');
      var discA = parts[0], discB = parts[1];
      var rule = ruleLookup[pair];
      if (!rule) return;
      // Dismiss previous list if any (keep matrix open)
      if (A._clashRevealActive) A._dismissClashes(true);
      // §S278: Reset offset when clicking a different pair
      var storey = A._currentClashStorey;
      var prevPair = A._currentClashPairLabel || '';
      var thisPair = discA + ' vs ' + discB;
      if (thisPair !== prevPair) A._clashPairOffset = 0;
      var offset = A._clashPairOffset || 0;
      var clashes = A._queryClashesPair(storey, rules, discA, discB, offset);
      if (!clashes.length && offset > 0) {
        A._clashPairOffset = 0;
        // Update cell to green — no more clashes
        cell.innerHTML = _msphere('#4caf50');
        return;
      }
      // Update cell sphere based on results
      if (clashes.length === 0) {
        cell.innerHTML = _msphere('#4caf50');
      } else {
        var hasHard = clashes.some(function(c) {
          return (typeof c[8] === 'number') && c[8] >= rules.severity.hard.min_overlap_m;
        });
        cell.innerHTML = hasHard ? _msphere('#ff0000') : _msphere('#ff8c00');
      }
      A._clashPairOffset = offset + A._CLASH_PAGE_SIZE;
      A._currentClashes = clashes;
      A._currentClashPairLabel = discA + ' vs ' + discB;
      var rect = matDiv.getBoundingClientRect();
      A._revealClashes(clashes, rules, rect.left, rect.top, discA + ' vs ' + discB, rule);
      // Progressive: load remaining storeys async + COUNT in background
      A._loadRemainingStoreys();
      if (!storey) A._countClashesAsync(rules, discA, discB);
      console.log('§CLASH_MATRIX_FILTER ' + discA + ' vs ' + discB + ' page=' + (offset / A._CLASH_PAGE_SIZE + 1));
    });

    // Background check — discipline envelope overlap (instant, 100% accurate for ruling out)
    // Step 1: compute spatial envelope per discipline (one GROUP BY, instant)
    var w = A._clashWhereParts(rules);
    var envelopes = {};
    var envSql = "SELECT m.discipline," +
      " MIN(t.center_x - t.bbox_x/2), MAX(t.center_x + t.bbox_x/2)," +
      " MIN(t.center_y - t.bbox_y/2), MAX(t.center_y + t.bbox_y/2)," +
      " MIN(t.center_z - t.bbox_z/2), MAX(t.center_z + t.bbox_z/2)" +
      " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
      " WHERE m.discipline IS NOT NULL" +
      (storey ? " AND m.storey = '" + storey.replace(/'/g, "''") + "'" : "") +
      " GROUP BY m.discipline";
    var envRows = A.dbQuery(envSql);
    envRows.forEach(function(r) {
      envelopes[r[0]] = { minX: r[1], maxX: r[2], minY: r[3], maxY: r[4], minZ: r[5], maxZ: r[6] };
    });
    // S246b: cache envelopes for export/radar reuse
    A._clashEnvelopes = envelopes;
    console.log('§CLASH_ENVELOPES ' + Object.keys(envelopes).length + ' disciplines');

    // Step 2: check each pair — envelopes don't overlap = guaranteed green, else orange (possible clash)
    var _qi = 0;
    var checked = {};
    // Collect pairs that have envelope overlap — will count these async
    var overlapPairs = [];

    function _bgCheck() {
      if (_qi >= activePairs.length) {
        // All envelope checks done — collapse all-green rows on mobile triangle
        if (triMode && matDiv) {
          var triRows = matDiv.querySelectorAll('[data-tri-row]');
          for (var ti = 0; ti < triRows.length; ti++) {
            var cells = triRows[ti].querySelectorAll('[data-pair]');
            var allGreen = true;
            for (var ci = 0; ci < cells.length; ci++) {
              // Green sphere = no clashes; check if sphere has #4caf50
              if (cells[ci].innerHTML.indexOf('#4caf50') < 0) { allGreen = false; break; }
            }
            if (allGreen && cells.length) triRows[ti].style.display = 'none';
          }
          console.log('§CLASH_TRI_COLLAPSE done');
        }
        // Start async count pass for orange pairs
        if (overlapPairs.length && A._clashRtreeReady) setTimeout(_countPass, 50);
        return;
      }
      if (!A._clashMatrixDiv) return;
      var p = activePairs[_qi++];
      var sortedKey = [p.discA, p.discB].sort().join('|');
      if (checked[sortedKey]) {
        var cell = matDiv.querySelector('[data-pair="' + p.key + '"]');
        if (cell) cell.innerHTML = checked[sortedKey];
        setTimeout(_bgCheck, 0);
        return;
      }
      var eA = envelopes[p.discA], eB = envelopes[p.discB];
      var overlaps = false;
      if (eA && eB) {
        overlaps = eA.minX < eB.maxX && eA.maxX > eB.minX &&
                   eA.minY < eB.maxY && eA.maxY > eB.minY &&
                   eA.minZ < eB.maxZ && eA.maxZ > eB.minZ;
      }
      var sphere = overlaps ? _msphere('#ff8c00') : _msphere('#4caf50');
      checked[sortedKey] = sphere;
      var cell1 = matDiv.querySelector('[data-pair="' + p.discA + '|' + p.discB + '"]');
      var cell2 = matDiv.querySelector('[data-pair="' + p.discB + '|' + p.discA + '"]');
      if (cell1) cell1.innerHTML = sphere;
      if (cell2) cell2.innerHTML = sphere;
      if (overlaps) overlapPairs.push(p);
      console.log('§CLASH_MATRIX_BG ' + p.discA + '|' + p.discB + ' = ' + (overlaps ? 'OVERLAP' : 'clear'));
      setTimeout(_bgCheck, 5);
    }

    // Phase 2: async COUNT per overlapping pair — sizes dots small/mid/max
    var _ci = 0;
    function _countPass() {
      if (_ci >= overlapPairs.length) return;
      if (!A._clashMatrixDiv) return;
      var p = overlapPairs[_ci++];
      var n = A._countClashesRtree(null, rules, p.discA, p.discB);
      // Dot size: small=8px (1-10), mid=14px (11-50), max=20px (51+)
      var sz = n > 50 ? 20 : n > 10 ? 14 : 8;
      var color = n > 50 ? '#ff0000' : n > 10 ? '#ff8c00' : '#ffcc00';
      var sphere = '<span title="' + n + ' clashes" style="display:inline-block;width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
        'background:radial-gradient(circle at 35% 35%,#fff,' + color + ' 60%,#111);vertical-align:middle"></span>';
      var cell1 = matDiv.querySelector('[data-pair="' + p.discA + '|' + p.discB + '"]');
      var cell2 = matDiv.querySelector('[data-pair="' + p.discB + '|' + p.discA + '"]');
      if (cell1) cell1.innerHTML = sphere;
      if (cell2) cell2.innerHTML = sphere;
      console.log('§CLASH_MATRIX_COUNT ' + p.discA + '|' + p.discB + ' = ' + n + ' size=' + sz + 'px');
      setTimeout(_countPass, 8);
    }

    setTimeout(_bgCheck, 50);

    console.log('§CLASH_MATRIX shown discs=' + discs.join(',') + ' rtree=' + A._clashRtreeReady);
  };

  console.log('§CLASH_MATRIX_INIT loaded');
}
