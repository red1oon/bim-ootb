// measure.js — Measurement tool (two-point distance, area, clash detection)
// S246 v1 — Clash Snag: snap viewport, annotate, share deep-link
function setupMeasure(A) {
  console.log('§MEASURE_VERSION S245e-v1');

  // Mobile detection — disable backdrop-filter blur (GPU-expensive on mobile)
  var _isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var _panelBg = _isMobile ? 'background:rgba(15,45,80,0.92);' : 'background:rgba(20,60,100,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
  var _panelBgStrong = _isMobile ? 'background:rgba(15,45,80,0.95);' : 'background:rgba(20,60,100,0.65);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';

  // ── Draggable panels ──
  A._makeDraggable = function(el) {
    var ox, oy, sx, sy, dragging = false;
    var dragStrip = _isMobile ? 50 : 30;
    el.style.cursor = 'grab';
    // On mobile, intercept touch BEFORE the browser claims it for scroll/pan.
    // Only preventDefault in the drag zone; elsewhere let browser handle normally.
    if (_isMobile) {
      el.addEventListener('touchstart', function(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.target.closest('[data-clash-idx]') || e.target.closest('[data-pair]')) return;
        // Don't block close/export buttons
        var tgt = e.target;
        if (tgt.id && (tgt.id.indexOf('close') >= 0 || tgt.id.indexOf('export') >= 0)) return;
        if (tgt.className && typeof tgt.className === 'string' && tgt.className.indexOf('close') >= 0) return;
        var rect = el.getBoundingClientRect();
        var t = e.touches[0];
        if (t.clientY - rect.top <= dragStrip) e.preventDefault();
      }, { passive: false });
    }
    el.addEventListener('pointerdown', function(e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.target.id && (e.target.id.indexOf('close') >= 0 || e.target.id.indexOf('export') >= 0)) return;
      if (e.target.className && typeof e.target.className === 'string' && e.target.className.indexOf('close') >= 0) return;
      if (e.target.closest('[data-clash-idx]') || e.target.closest('[data-pair]')) return;
      var rect = el.getBoundingClientRect();
      if (e.clientY - rect.top > dragStrip) return;
      dragging = true;
      ox = e.clientX; oy = e.clientY;
      sx = rect.left; sy = rect.top;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      el.style.left = (sx + e.clientX - ox) + 'px';
      el.style.top = (sy + e.clientY - oy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    el.addEventListener('pointerup', function() { dragging = false; });
  };

  // ── Clash detection (bbox overlap from DB, rules from clash_rules.json) ──
  A._clashRules = null;
  A._clashRulesLoading = false;

  A._loadClashRules = function(cb) {
    if (A._clashRules) { cb(A._clashRules); return; }
    if (A._clashRulesLoading) return;
    A._clashRulesLoading = true;
    fetch('clash_rules.json?v=2').then(function(r) { return r.json(); }).then(function(j) {
      A._clashRules = j;
      A._clashRulesLoading = false;
      if (j.display && j.display.max_report) A._CLASH_PAGE_SIZE = j.display.max_report;
      console.log('§CLASH_RULES loaded ' + j.clash_rules.length + ' rules pageSize=' + A._CLASH_PAGE_SIZE);
      cb(j);
    }).catch(function(e) {
      A._clashRulesLoading = false;
      console.warn('§CLASH_RULES failed', e);
    });
  };

  // Clash query helpers
  // bbox_x/y/z are FULL widths, centered at center_x/y/z
  A._CLASH_PAGE_SIZE = 200; // Updated from clash_rules.json display.max_report on load

  // Ensure indexes exist for clash queries — one-time cost per session
  A._clashIndexesReady = false;
  A._clashRtreeReady = false;
  A._clashRtreeBuilding = false;

  // Async index+R-tree builder — yields between each step to avoid blocking UI
  // Called eagerly after DB loads (not lazily on first clash open)
  A._ensureClashIndexes = function() {
    if (A._clashIndexesReady || !A.db) return;
    A._clashIndexesReady = true; // prevent re-entry

    // Step through indexes one at a time with yields
    var idxSteps = [
      "CREATE INDEX IF NOT EXISTS idx_meta_disc ON elements_meta(discipline)",
      "CREATE INDEX IF NOT EXISTS idx_meta_storey ON elements_meta(storey)",
      "CREATE INDEX IF NOT EXISTS idx_trans_cx ON element_transforms(center_x)"
    ];
    var si = 0;
    function _nextIndex() {
      if (si >= idxSteps.length) {
        console.log('§CLASH_INDEXES created');
        _startRtree();
        return;
      }
      try { A.db.run(idxSteps[si]); } catch(e) { console.warn('§CLASH_INDEX_SKIP', e.message); }
      si++;
      setTimeout(_nextIndex, 5);
    }

    function _startRtree() {
      if (A._clashRtreeReady || A._clashRtreeBuilding) return;
      try {
        A.db.run("DROP TABLE IF EXISTS elements_rtree");
        A.db.run("CREATE VIRTUAL TABLE elements_rtree USING rtree(id, minX, maxX, minY, maxY, minZ, maxZ)");
        A._clashRtreeBuilding = true;
        console.log('§CLASH_RTREE table created, populating async...');
        _buildRtreeBatches();
      } catch(e) {
        A._clashRtreeReady = false;
        A._clashRtreeBuilding = false;
        console.warn('§CLASH_RTREE FAILED — ' + e.message);
      }
    }

    var RTREE_BATCH = 5000;
    function _buildRtreeBatches() {
      var total = A.dbQuery("SELECT COUNT(*) FROM element_transforms");
      var n = total.length ? total[0][0] : 0;
      var offset = 0;
      var t0 = performance.now();
      function _insertBatch() {
        if (!A.db) { A._clashRtreeBuilding = false; return; }
        try {
          A.db.run("BEGIN");
          A.db.run("INSERT INTO elements_rtree SELECT rowid, center_x - bbox_x/2, center_x + bbox_x/2, center_y - bbox_y/2, center_y + bbox_y/2, center_z - bbox_z/2, center_z + bbox_z/2 FROM element_transforms LIMIT " + RTREE_BATCH + " OFFSET " + offset);
          A.db.run("COMMIT");
          offset += RTREE_BATCH;
          if (offset < n) {
            console.log('§CLASH_RTREE batch ' + offset + '/' + n);
            setTimeout(_insertBatch, 10);
          } else {
            var ms = (performance.now() - t0).toFixed(0);
            A._clashRtreeReady = true;
            A._clashRtreeBuilding = false;
            if (A.status && A.status.textContent.indexOf('spatial index') >= 0) A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_index_ready||'Spatial index ready';
            console.log('§CLASH_RTREE ready ' + n + ' rows in ' + ms + 'ms');
          }
        } catch(e) {
          try { A.db.run("ROLLBACK"); } catch(re) {}
          A._clashRtreeBuilding = false;
          console.warn('§CLASH_RTREE batch failed at offset=' + offset + ' — ' + e.message);
        }
      }
      setTimeout(_insertBatch, 10);
    }

    setTimeout(_nextIndex, 5);
  };

  // §S260b: Build R-tree eagerly once A.db has element_transforms (meta.db loaded)
  // Uses setTimeout batches so it yields to geo.db download in parallel
  setTimeout(function _waitForDb() {
    if (A.db) { A._ensureClashIndexes(); }
    else { setTimeout(_waitForDb, 500); }
  }, 1000);

  // Build the shared WHERE clause parts (also ensures indexes)
  A._clashWhereParts = function(rules) {
    A._ensureClashIndexes();
    var ignoreSet = {};
    rules.clash_rules.forEach(function(r) {
      (r.ignore_classes || []).forEach(function(c) { ignoreSet[c] = 1; });
    });
    var ignoreWhere = Object.keys(ignoreSet).map(function(c) { return "'" + c + "'"; }).join(',');
    return {
      ignoreClause: ignoreWhere ? ' AND ma.ifc_class NOT IN (' + ignoreWhere + ') AND mb.ifc_class NOT IN (' + ignoreWhere + ')' : '',
      bboxJoin: " AND (a.center_x - a.bbox_x/2) < (b.center_x + b.bbox_x/2)" +
        " AND (a.center_x + a.bbox_x/2) > (b.center_x - b.bbox_x/2)" +
        " AND (a.center_y - a.bbox_y/2) < (b.center_y + b.bbox_y/2)" +
        " AND (a.center_y + a.bbox_y/2) > (b.center_y - b.bbox_y/2)" +
        " AND (a.center_z - a.bbox_z/2) < (b.center_z + b.bbox_z/2)" +
        " AND (a.center_z + a.bbox_z/2) > (b.center_z - b.bbox_z/2)"
    };
  };

  // Quick EXISTS check per discipline pair — for matrix spheres
  // S246perf: R-tree probe when ready (was O(n²) cross-join LIMIT 1)
  A._clashExistsPerPair = function(storey, rules) {
    if (!A._hasBbox) return {};
    var discCounts = {};
    var dcRows = A.dbQuery("SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline");
    dcRows.forEach(function(r) { discCounts[r[0]] = r[1]; });

    var result = {};
    rules.clash_rules.forEach(function(r) {
      var key = r.source.discipline + '|' + r.target.discipline;
      var key2 = r.target.discipline + '|' + r.source.discipline;
      if (!discCounts[r.source.discipline] || !discCounts[r.target.discipline]) {
        result[key] = 0; result[key2] = 0;
        return;
      }

      if (A._clashRtreeReady) {
        // R-tree EXISTS: probe with PAGE_SIZE=1 — stops at first hit
        var w = A._clashWhereParts(rules);
        var savedPS = A._CLASH_PAGE_SIZE;
        A._CLASH_PAGE_SIZE = 1;
        var hits = A._queryClashesPairRtree(storey, rules, r.source.discipline, r.target.discipline, 0, w);
        A._CLASH_PAGE_SIZE = savedPS;
        var hasClash = hits.length > 0 ? 1 : 0;
        result[key] = hasClash;
        result[key2] = hasClash;
        console.log('§CLASH_EXISTS_RTREE ' + key + ' = ' + hasClash);
      } else {
        // Fallback: cross-join LIMIT 1
        var w = A._clashWhereParts(rules);
        var storeyClause = storey ? "ma.storey = '" + storey.replace(/'/g, "''") + "' AND mb.storey = ma.storey" : '1=1';
        var pairCond = "(ma.discipline = '" + r.source.discipline + "' AND mb.discipline = '" + r.target.discipline + "')" +
          " OR (ma.discipline = '" + r.target.discipline + "' AND mb.discipline = '" + r.source.discipline + "')";
        var sql = "SELECT 1 FROM element_transforms a" +
          " JOIN elements_meta ma ON a.guid = ma.guid" +
          " JOIN element_transforms b ON a.guid < b.guid" +
          " JOIN elements_meta mb ON b.guid = mb.guid" +
          " WHERE " + storeyClause + " AND (" + pairCond + ")" + w.ignoreClause + w.bboxJoin +
          " LIMIT 1";
        var rows = A.dbQuery(sql);
        var hasClash = rows.length > 0 ? 1 : 0;
        result[key] = hasClash;
        result[key2] = hasClash;
        console.log('§CLASH_EXISTS ' + key + ' = ' + hasClash);
      }
    });
    return result;
  };

  // Query clashes for a SPECIFIC discipline pair — first storey only when whole-building
  // Remaining storeys are stored in A._pendingClashStoreys for progressive async loading
  A._queryClashesPair = function(storey, rules, discA, discB, offset) {
    if (!A._hasBbox) return [];
    var w = A._clashWhereParts(rules);
    A._pendingClashStoreys = [];
    A._pendingClashArgs = null;

    // ── R-tree accelerated clash query (S245e) ──
    // Instead of O(n²) cross-join, iterate elements of discA and use R-tree
    // to find overlapping elements of discB. O(n log n) total.
    if (A._clashRtreeReady) {
      return A._queryClashesPairRtree(storey, rules, discA, discB, offset, w);
    }

    // Fallback: original cross-join (only if R-tree not ready)
    // No storey → auto-pick storeys with both disciplines (two GROUP BY, no cross-join)
    if (!storey) {
      var storeysA = {};
      A.dbQuery("SELECT storey, COUNT(*) FROM elements_meta WHERE discipline = '" + discA + "' AND storey IS NOT NULL GROUP BY storey")
        .forEach(function(r) { storeysA[r[0]] = r[1]; });
      var both = [];
      A.dbQuery("SELECT storey, COUNT(*) FROM elements_meta WHERE discipline = '" + discB + "' AND storey IS NOT NULL GROUP BY storey")
        .forEach(function(r) { if (storeysA[r[0]]) both.push([r[0], storeysA[r[0]] + r[1]]); });
      both.sort(function(a, b) { return b[1] - a[1]; });
      if (!both.length) {
        console.log('§CLASH_QUERY ' + discA + ' vs ' + discB + ' no shared storeys → 0');
        return [];
      }
      var firstStorey = both[0][0];
      A._pendingClashStoreys = both.slice(1).map(function(b) { return b[0]; });
      A._pendingClashArgs = { rules: rules, discA: discA, discB: discB, w: w };
      var stClause = "ma.storey = '" + firstStorey.replace(/'/g, "''") + "' AND mb.storey = ma.storey";
      var pairCond = "(ma.discipline = '" + discA + "' AND mb.discipline = '" + discB + "')" +
        " OR (ma.discipline = '" + discB + "' AND mb.discipline = '" + discA + "')";
      var sql = "SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
        " ma.element_name, mb.element_name," +
        " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
        "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
        "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
        " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
        " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
        " WHERE " + stClause + " AND (" + pairCond + ")" + w.ignoreClause + w.bboxJoin +
        " LIMIT " + A._CLASH_PAGE_SIZE;
      var allRows = A.dbQuery(sql);
      console.log('§CLASH_QUERY fallback ' + discA + ' vs ' + discB + ' storey=' + firstStorey + ' got=' + allRows.length);
      return allRows;
    }
    var storeyClause = "ma.storey = '" + storey.replace(/'/g, "''") + "' AND mb.storey = ma.storey";
    var pairCond = "(ma.discipline = '" + discA + "' AND mb.discipline = '" + discB + "')" +
      " OR (ma.discipline = '" + discB + "' AND mb.discipline = '" + discA + "')";
    var sql = "SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
      " ma.element_name, mb.element_name," +
      " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
      "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
      "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
      " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
      " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
      " WHERE " + storeyClause + " AND (" + pairCond + ")" + w.ignoreClause + w.bboxJoin +
      " LIMIT " + A._CLASH_PAGE_SIZE + " OFFSET " + (offset || 0);
    var rows = A.dbQuery(sql);
    console.log('§CLASH_QUERY fallback ' + discA + ' vs ' + discB + ' offset=' + (offset || 0) + ' got=' + rows.length);
    return rows;
  };

  // ── R-tree accelerated clash pair query ──────────────────────────────────
  // S246b: Single SQL R-tree join — same pattern as _countClashesRtree but returns rows.
  // Hybrid: pre-load discB into JS map, then N small R-tree queries (one per discA element).
  // Each R-tree query is O(log N) so total is O(A * log N). Proven fast in production.
  A._queryClashesPairRtree = function(storey, rules, discA, discB, offset, w) {
    var t0 = performance.now();
    var ignoreSet = {};
    rules.clash_rules.forEach(function(r) {
      (r.ignore_classes || []).forEach(function(c) { ignoreSet[c] = 1; });
    });
    var storeyFilter = storey ? " AND m.storey = '" + storey.replace(/'/g, "''") + "'" : "";
    var ignoreFilter = Object.keys(ignoreSet).length ?
      " AND m.ifc_class NOT IN (" + Object.keys(ignoreSet).map(function(c) { return "'" + c + "'"; }).join(',') + ")" : "";

    // Pre-load ALL discB elements into a JS map keyed by rowid — ONE query
    var bMap = {};
    var rowsB = A.dbQuery(
      "SELECT t.rowid, m.guid, m.ifc_class, m.element_name," +
      " t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z" +
      " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
      " WHERE m.discipline = '" + discB + "'" + storeyFilter + ignoreFilter +
      " AND t.bbox_x IS NOT NULL"
    );
    for (var bi = 0; bi < rowsB.length; bi++) {
      bMap[rowsB[bi][0]] = rowsB[bi];
    }

    var rowsA = A.dbQuery(
      "SELECT t.rowid, m.guid, m.ifc_class, m.element_name, m.storey," +
      " t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z" +
      " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
      " WHERE m.discipline = '" + discA + "'" + storeyFilter + ignoreFilter +
      " AND t.bbox_x IS NOT NULL"
    );

    var results = [];
    var seen = {};
    var skip = offset || 0;
    var limit = A._CLASH_PAGE_SIZE;

    for (var i = 0; i < rowsA.length && results.length < limit; i++) {
      var ra = rowsA[i];
      var minX = ra[5] - ra[8]/2, maxX = ra[5] + ra[8]/2;
      var minY = ra[6] - ra[9]/2, maxY = ra[6] + ra[9]/2;
      var minZ = ra[7] - ra[10]/2, maxZ = ra[7] + ra[10]/2;

      var candidates;
      try { candidates = A.dbQuery("SELECT r.id FROM elements_rtree r WHERE " +
        "r.maxX >= " + minX + " AND r.minX <= " + maxX + " AND " +
        "r.maxY >= " + minY + " AND r.minY <= " + maxY + " AND " +
        "r.maxZ >= " + minZ + " AND r.minZ <= " + maxZ);
      } catch(e) { continue; }

      for (var ci = 0; ci < candidates.length && results.length < limit; ci++) {
        var rb = bMap[candidates[ci][0]];
        if (!rb) continue;
        if (rb[1] === ra[1]) continue;
        var key = ra[1] < rb[1] ? ra[1] + '|' + rb[1] : rb[1] + '|' + ra[1];
        if (seen[key]) continue;
        seen[key] = 1;

        var bMinX = rb[4] - rb[7]/2, bMaxX = rb[4] + rb[7]/2;
        var bMinY = rb[5] - rb[8]/2, bMaxY = rb[5] + rb[8]/2;
        var bMinZ = rb[6] - rb[9]/2, bMaxZ = rb[6] + rb[9]/2;
        if (maxX <= bMinX || minX >= bMaxX) continue;
        if (maxY <= bMinY || minY >= bMaxY) continue;
        if (maxZ <= bMinZ || minZ >= bMaxZ) continue;

        var ox = Math.min(maxX, bMaxX) - Math.max(minX, bMinX);
        var oy = Math.min(maxY, bMaxY) - Math.max(minY, bMinY);
        var oz = Math.min(maxZ, bMaxZ) - Math.max(minZ, bMinZ);
        var overlap = Math.min(ox, oy, oz);

        if (skip > 0) { skip--; continue; }
        results.push([ra[1], rb[1], ra[2], rb[2], discA, discB, ra[3], rb[3], overlap]);
      }
    }

    var ms = (performance.now() - t0).toFixed(0);
    console.log('§CLASH_QUERY_RTREE ' + discA + ' vs ' + discB +
      (storey ? ' storey=' + storey : ' whole') +
      ' A=' + rowsA.length + ' B=' + rowsB.length + ' hits=' + results.length +
      ' time=' + ms + 'ms');
    return results;
  };

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

  // Progressive async loader — queries remaining storeys one at a time with UI yields
  // S246perf: Uses R-tree path when ready (was hardcoded O(n²) cross-join)
  A._loadRemainingStoreys = function() {
    if (!A._pendingClashStoreys || !A._pendingClashStoreys.length) return;
    if (!A._clashRevealActive || !A._clashListDiv) return;
    var args = A._pendingClashArgs;
    if (!args) return;
    var storeys = A._pendingClashStoreys.slice();
    A._pendingClashStoreys = [];
    var qi = 0;
    function _nextStorey() {
      if (qi >= storeys.length || !A._clashRevealActive || !A._clashListDiv) return;
      var st = storeys[qi++];
      // Route through the same path as initial query — uses R-tree when ready
      var rows = A._clashRtreeReady
        ? A._queryClashesPairRtree(st, args.rules, args.discA, args.discB, 0, args.w)
        : (function() {
            var stClause = "ma.storey = '" + st.replace(/'/g, "''") + "' AND mb.storey = ma.storey";
            var pairCond = "(ma.discipline = '" + args.discA + "' AND mb.discipline = '" + args.discB + "')" +
              " OR (ma.discipline = '" + args.discB + "' AND mb.discipline = '" + args.discA + "')";
            return A.dbQuery("SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
              " ma.element_name, mb.element_name," +
              " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
              "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
              "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
              " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
              " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
              " WHERE " + stClause + " AND (" + pairCond + ")" + args.w.ignoreClause + args.w.bboxJoin +
              " LIMIT " + A._CLASH_PAGE_SIZE);
          })();
      if (rows.length && A._currentClashes) {
        A._currentClashes = A._currentClashes.concat(rows);
        if (A._renderClashList && A._clashListDiv) {
          var rendered = A._renderClashList();
          var hdrEl = A._clashListDiv.querySelector('#clash-list-header');
          var bodyEl = A._clashListDiv.querySelector('#clash-list-body');
          if (hdrEl) hdrEl.innerHTML = rendered.hdr;
          if (bodyEl) bodyEl.innerHTML = rendered.body;
        }
      }
      console.log('§CLASH_PROGRESSIVE storey=' + st + ' +' + rows.length + ' total=' + (A._currentClashes ? A._currentClashes.length : 0) + ' rtree=' + A._clashRtreeReady);
      setTimeout(_nextStorey, 16);
    }
    setTimeout(_nextStorey, 16);
  };

  // Async COUNT per storey — S246perf: R-tree counting, no cross-join
  // S246b: R-tree path = single query, no storey loop. Fallback still loops for cross-join.
  A._countClashesAsync = function(rules, discA, discB) {
    if (A._clashRtreeReady) {
      // Single R-tree COUNT across all storeys — instant
      var total = A._countClashesRtree(null, rules, discA, discB);
      if (A._clashListDiv) {
        var el = A._clashListDiv.querySelector('#clash-total-count');
        if (el) el.textContent = 'Total: ' + total;
      }
      if (!A._cachedPairCounts) A._cachedPairCounts = {};
      var key = [discA, discB].sort().join('|');
      A._cachedPairCounts[key] = total;
      console.log('§CLASH_COUNT total=' + total + ' rtree=true cached=' + key);
      return;
    }
    // Fallback: storey-by-storey cross-join (R-tree not ready)
    var stA = {};
    A.dbQuery("SELECT storey FROM elements_meta WHERE discipline = '" + discA + "' AND storey IS NOT NULL GROUP BY storey")
      .forEach(function(r) { stA[r[0]] = 1; });
    var storeys = [];
    A.dbQuery("SELECT storey FROM elements_meta WHERE discipline = '" + discB + "' AND storey IS NOT NULL GROUP BY storey")
      .forEach(function(r) { if (stA[r[0]]) storeys.push(r[0]); });
    var total = 0, qi = 0;
    function _nextCount() {
      if (qi >= storeys.length) {
        if (A._clashListDiv) {
          var el = A._clashListDiv.querySelector('#clash-total-count');
          if (el) el.textContent = 'Total: ' + total;
        }
        if (!A._cachedPairCounts) A._cachedPairCounts = {};
        var key = [discA, discB].sort().join('|');
        A._cachedPairCounts[key] = total;
        console.log('§CLASH_COUNT total=' + total + ' storeys=' + storeys.length + ' rtree=false cached=' + key);
        return;
      }
      if (!A._clashRevealActive || !A._clashListDiv) return;
      var st = storeys[qi++];
      var w = A._clashWhereParts(rules);
      var stClause = "ma.storey = '" + st.replace(/'/g, "''") + "' AND mb.storey = ma.storey";
      var pairCond = "(ma.discipline = '" + discA + "' AND mb.discipline = '" + discB + "')" +
        " OR (ma.discipline = '" + discB + "' AND mb.discipline = '" + discA + "')";
      var sql = "SELECT COUNT(*) FROM element_transforms a" +
        " JOIN elements_meta ma ON a.guid = ma.guid" +
        " JOIN element_transforms b ON a.guid < b.guid" +
        " JOIN elements_meta mb ON b.guid = mb.guid" +
        " WHERE " + stClause + " AND (" + pairCond + ")" + w.ignoreClause + w.bboxJoin;
      var cRows = A.dbQuery(sql);
      if (cRows.length) total += cRows[0][0];
      if (A._clashListDiv) {
        var el = A._clashListDiv.querySelector('#clash-total-count');
        if (el) el.textContent = 'Total: ' + total + (qi < storeys.length ? '...' : '');
      }
      setTimeout(_nextCount, 8);
    }
    setTimeout(_nextCount, 50);
  };

  // Query ALL clashes for a pair — S246b: single R-tree query (was storey-by-storey cross-join)
  A._queryClashesPairAll = function(rules, discA, discB) {
    if (!A._hasBbox) return [];
    if (A._clashRtreeReady) {
      // Single R-tree join — no storey loop, no page limit
      return A._queryClashesPairRtree(null, rules, discA, discB, 0, null);
    }
    // Fallback: storey-by-storey cross-join (R-tree not ready)
    var w = A._clashWhereParts(rules);
    var pairCond = "(ma.discipline = '" + discA + "' AND mb.discipline = '" + discB + "')" +
      " OR (ma.discipline = '" + discB + "' AND mb.discipline = '" + discA + "')";
    var stA = {};
    A.dbQuery("SELECT storey FROM elements_meta WHERE discipline = '" + discA + "' AND storey IS NOT NULL GROUP BY storey")
      .forEach(function(r) { stA[r[0]] = 1; });
    var sRows = [];
    A.dbQuery("SELECT storey FROM elements_meta WHERE discipline = '" + discB + "' AND storey IS NOT NULL GROUP BY storey")
      .forEach(function(r) { if (stA[r[0]]) sRows.push([r[0]]); });
    var allRows = [];
    sRows.forEach(function(sr) {
      var stClause = "ma.storey = '" + sr[0].replace(/'/g, "''") + "' AND mb.storey = ma.storey";
      var sql = "SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
        " ma.element_name, mb.element_name," +
        " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
        "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
        "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
        " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
        " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
        " WHERE " + stClause + " AND (" + pairCond + ")" + w.ignoreClause + w.bboxJoin;
      allRows = allRows.concat(A.dbQuery(sql));
    });
    console.log('§CLASH_QUERY_ALL ' + discA + ' vs ' + discB + ' storeys=' + sRows.length + ' total=' + allRows.length);
    return allRows;
  };

  // Fast check: any clashes at all? (for info card sphere — just yes/no)
  A._queryClashes = function(storey, rules) {
    if (!A._hasBbox) return [];
    var w = A._clashWhereParts(rules);
    var pairConds = rules.clash_rules.map(function(r) {
      return "(ma.discipline = '" + r.source.discipline + "' AND mb.discipline = '" + r.target.discipline + "')" +
             " OR (ma.discipline = '" + r.target.discipline + "' AND mb.discipline = '" + r.source.discipline + "')";
    }).join(' OR ');
    if (!pairConds) return [];
    var storeyClause = storey ? "ma.storey = '" + storey.replace(/'/g, "''") + "' AND mb.storey = ma.storey" : '1=1';
    var sql = "SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
      " ma.element_name, mb.element_name," +
      " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
      "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
      "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
      " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
      " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
      " WHERE " + storeyClause + " AND (" + pairConds + ")" + w.ignoreClause + w.bboxJoin +
      " LIMIT 1";
    var rows = A.dbQuery(sql);
    console.log('§CLASH_EXISTS_ANY storey=' + (storey || 'ALL') + ' found=' + rows.length);
    return rows;
  };

  // Classify clash severity from rules
  A._clashSeverity = function(overlap, rules) {
    var sev = rules.severity;
    if (overlap >= sev.hard.min_overlap_m) return { level: 'hard', color: sev.hard.color, label: sev.hard.label };
    if (overlap >= sev.soft.min_overlap_m) return { level: 'soft', color: sev.soft.color, label: sev.soft.label };
    return { level: 'clearance', color: sev.clearance.color, label: sev.clearance.label };
  };

  // Reveal clashes — dim scene, show itemised list
  A._clashRevealActive = false;
  A._clashBackups = [];

  // Status cycle: (none) → Reviewed → Resolved → Accepted → (none)
  A._clashStatusCycle = ['', 'Reviewed', 'Resolved', 'Accepted'];
  A._clashStatusStyles = {
    '':         { icon: '',  style: '' },
    'Reviewed': { icon: '\u{1F7E1}', style: 'opacity:0.7' },
    'Resolved': { icon: '\u{1F7E2}', style: 'text-decoration:line-through;opacity:0.6' },
    'Accepted': { icon: '\u26AA', style: 'font-style:italic;color:#888' }
  };

  // Load/save statuses from localStorage
  A._clashStatusKey = function() {
    return 'bim-clash-statuses-' + (A.activeBuilding || 'default');
  };
  A._clashStatuses = {};
  A._loadClashStatuses = function() {
    try {
      var raw = localStorage.getItem(A._clashStatusKey());
      A._clashStatuses = raw ? JSON.parse(raw) : {};
    } catch(e) { A._clashStatuses = {}; }
  };
  A._saveClashStatuses = function() {
    try { localStorage.setItem(A._clashStatusKey(), JSON.stringify(A._clashStatuses)); } catch(e) {}
  };
  A._clashPairKey = function(guidA, guidB) { return guidA + '|' + guidB; };

  // Fly to a specific clash by index — extracted for pointerup (mobile) and click (desktop)
  A._flyToClash = function(idx) {
    var c = (A._currentClashes || [])[idx];
    if (!c) return;
    A._currentClashViewIdx = idx;
    var rules = A._currentClashRules;
    if (!rules) return;
    // Full scene stays — S232 InstancedMesh batching, no DLOD needed
    // Highlight selected row
    if (A._clashListDiv) {
      A._clashListDiv.querySelectorAll('[data-clash-idx]').forEach(function(el) { el.style.background = ''; });
      var rowEl = A._clashListDiv.querySelector('[data-clash-idx="' + idx + '"]');
      if (rowEl) rowEl.style.background = 'rgba(79,195,247,0.25)';
    }
    // Fly to pair — get positions from DB
    var posRows = A.dbQuery(
      "SELECT t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM element_transforms t WHERE t.guid IN (?, ?)",
      [c[0], c[1]]
    );
    if (posRows.length < 2) return;
    var pA = A.ifc2three(posRows[0][0], posRows[0][1], posRows[0][2]);
    var pB = A.ifc2three(posRows[1][0], posRows[1][1], posRows[1][2]);
    var mid = new THREE.Vector3().addVectors(
      new THREE.Vector3(pA.x, pA.y, pA.z),
      new THREE.Vector3(pB.x, pB.y, pB.z)
    ).multiplyScalar(0.5);

    // §S278: Clear any pick isolation — clash view needs full-opacity scene
    if (typeof _restoreIsolation === 'function') _restoreIsolation(A);
    // Remove previous clash highlights
    if (A._clashHighlights) {
      A._clashHighlights.forEach(function(h) { A.measureGroup.remove(h); });
    }
    A._clashHighlights = [];

    // Overlap zone
    var rA = posRows[0], rB = posRows[1];
    var oxMin = Math.max(rA[0] - rA[3]/2, rB[0] - rB[3]/2);
    var oxMax = Math.min(rA[0] + rA[3]/2, rB[0] + rB[3]/2);
    var oyMin = Math.max(rA[1] - rA[4]/2, rB[1] - rB[4]/2);
    var oyMax = Math.min(rA[1] + rA[4]/2, rB[1] + rB[4]/2);
    var ozMin = Math.max(rA[2] - rA[5]/2, rB[2] - rB[5]/2);
    var ozMax = Math.min(rA[2] + rA[5]/2, rB[2] + rB[5]/2);

    if (oxMin < oxMax && oyMin < oyMax && ozMin < ozMax) {
      var oMinT = A.ifc2three(oxMin, oyMin, ozMin);
      var oMaxT = A.ifc2three(oxMax, oyMax, ozMax);
      var tXmin = Math.min(oMinT.x, oMaxT.x), tXmax = Math.max(oMinT.x, oMaxT.x);
      var tYmin = Math.min(oMinT.y, oMaxT.y), tYmax = Math.max(oMinT.y, oMaxT.y);
      var tZmin = Math.min(oMinT.z, oMaxT.z), tZmax = Math.max(oMinT.z, oMaxT.z);
      var PAD = 0.3;
      var cx = (tXmin+tXmax)/2, cy = (tYmin+tYmax)/2, cz = (tZmin+tZmax)/2;
      if (tXmax-tXmin < PAD) { tXmin = cx-PAD/2; tXmax = cx+PAD/2; }
      if (tYmax-tYmin < PAD) { tYmin = cy-PAD/2; tYmax = cy+PAD/2; }
      if (tZmax-tZmin < PAD) { tZmin = cz-PAD/2; tZmax = cz+PAD/2; }

      var clipPlanes = [
        new THREE.Plane(new THREE.Vector3( 1, 0, 0), -tXmin),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0),  tXmax),
        new THREE.Plane(new THREE.Vector3( 0, 1, 0), -tYmin),
        new THREE.Plane(new THREE.Vector3( 0,-1, 0),  tYmax),
        new THREE.Plane(new THREE.Vector3( 0, 0, 1), -tZmin),
        new THREE.Plane(new THREE.Vector3( 0, 0,-1),  tZmax)
      ];

      var hashRows = A.dbQuery("SELECT i.guid, i.geometry_hash, m.discipline FROM element_instances i JOIN elements_meta m ON i.guid = m.guid WHERE i.guid IN (?, ?)", [c[0], c[1]]);
      var meshColors = [0xff2222, 0x2266ff];  // §S277c: red A + blue B (was orange)
      hashRows.forEach(function(hr, hi) {
        var geo = A.meshCache[hr[1]];
        if (!geo) {
          var gRows = A.dbQuery("SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?", [hr[1]]);
          if (gRows.length && gRows[0][0] && gRows[0][1]) {
            geo = A.blobToGeometry(gRows[0][0], gRows[0][1]);
            if (geo) A.meshCache[hr[1]] = geo;
          }
        }
        if (!geo) return;
        var tRow = A.dbQuery("SELECT center_x, center_y, center_z, rotation_x, rotation_y, rotation_z FROM element_transforms WHERE guid = ?", [hr[0]]);
        if (!tRow.length) return;
        var pos = A.ifc2three(tRow[0][0], tRow[0][1], tRow[0][2]);
        var disc = hr[2] || '';
        var discColor = (A.DISC_COLORS && A.DISC_COLORS[disc]) || meshColors[hi];

        // §S278: Full unclipped mesh — red/blue tint (not discipline color) so pair is obvious
        var fullMat = new THREE.MeshBasicMaterial({
          color: meshColors[hi], transparent: true, opacity: 0.2,
          side: THREE.DoubleSide, depthWrite: false, depthTest: false
        });
        var fullMesh = new THREE.Mesh(geo.clone(), fullMat);
        fullMesh.position.set(pos.x, pos.y, pos.z);
        if (tRow[0][3] || tRow[0][4] || tRow[0][5]) {
          fullMesh.rotation.set(tRow[0][3] || 0, tRow[0][5] || 0, -(tRow[0][4] || 0));
        }
        fullMesh.frustumCulled = false;
        fullMesh.renderOrder = 996 + hi;
        fullMesh.userData._isClashViz = true; // §S278: exclude from picking
        A.measureGroup.add(fullMesh);
        A._clashHighlights.push(fullMesh);

        // Clipped mesh at overlap — bright red/blue, shine through everything
        var mat = new THREE.MeshBasicMaterial({
          color: meshColors[hi], transparent: true, opacity: 0.7,
          side: THREE.DoubleSide, depthTest: false, depthWrite: false,
          clippingPlanes: clipPlanes, clipShadows: true
        });
        var mesh = new THREE.Mesh(geo.clone(), mat);
        mesh.position.set(pos.x, pos.y, pos.z);
        if (tRow[0][3] || tRow[0][4] || tRow[0][5]) {
          mesh.rotation.set(tRow[0][3] || 0, tRow[0][5] || 0, -(tRow[0][4] || 0));
        }
        mesh.frustumCulled = false;
        mesh.renderOrder = 998 + hi; // A=998, B=999 — both draw, B on top
        mesh.userData._isClashViz = true; // §S278: exclude from picking
        A.measureGroup.add(mesh);
        A._clashHighlights.push(mesh);
      });
      // No bbox wireframes — full material meshes + red/orange overlap are clear enough
      if (A.renderer) A.renderer.localClippingEnabled = true;
      var sx = tXmax - tXmin, sy = tYmax - tYmin, sz = tZmax - tZmin;
      console.log('§CLASH_VIZ overlap=' + sx.toFixed(2) + 'x' + sy.toFixed(2) + 'x' + sz.toFixed(2) + 'm meshes=' + hashRows.length);
    }

    // Fly camera to overlap centre
    var overlapMax = 0.5;
    if (oxMin < oxMax && oyMin < oyMax && ozMin < ozMax) {
      overlapMax = Math.max(oxMax - oxMin, oyMax - oyMin, ozMax - ozMin, 0.5);
      var oCenter = A.ifc2three((oxMin+oxMax)/2, (oyMin+oyMax)/2, (ozMin+ozMax)/2);
      mid.set(oCenter.x, oCenter.y, oCenter.z);
    }
    var dist = Math.max(overlapMax * 3, 2);
    if (A.controls && A.controls.target) {
      var endTarget, endPos;
      // Deep-link override: fly to exact saved camera position
      if (A._deepLinkCamOverride) {
        var ov = A._deepLinkCamOverride;
        endPos = new THREE.Vector3(ov.pos[0], ov.pos[1], ov.pos[2]);
        endTarget = new THREE.Vector3(ov.tgt[0], ov.tgt[1], ov.tgt[2]);
        A._deepLinkCamOverride = null;
      } else {
        endTarget = mid.clone();
        endPos = new THREE.Vector3(mid.x + dist * 0.6, mid.y + dist * 0.5, mid.z + dist * 0.6);
      }
      var startTarget = A.controls.target.clone();
      var startPos = A.camera.position.clone();
      var duration = 2000; // ms
      var t0 = performance.now();
      function _animFly() {
        var t = Math.min((performance.now() - t0) / duration, 1);
        // Ease-in-out cubic — smooth start and end
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        A.camera.position.lerpVectors(startPos, endPos, e);
        A.controls.target.lerpVectors(startTarget, endTarget, e);
        A.controls.update();
        if (A.markDirty) A.markDirty();
        if (t < 1) requestAnimationFrame(_animFly);
      }
      _animFly();
    }
    // §S277c: OutlinePass on clash meshes — white edge on both for crisp silhouette
    if (A.setOutline && A._clashHighlights && A._clashHighlights.length) {
      A.setOutline(A._clashHighlights.filter(function(m) { return m.isMesh; }), 0xffffff);
    }
    console.log('§CLASH_DETAIL guidA=' + c[0] + ' guidB=' + c[1] + ' overlap=' + ((typeof c[8] === 'number') ? c[8].toFixed(3) : '?') + 'm');
  };

  // S246: Build deep-link URL for a clash pair
  A._buildClashDeepLink = function(c) {
    if (!c) return '';
    var p = A.camera.position;
    var t = A.controls.target;
    var rules = A._currentClashRules;
    var firstRule = rules && rules.clash_rules && rules.clash_rules[0];
    var tolMm = firstRule ? Math.round((firstRule.tolerance_m || 0.025) * 1000) : 25;
    // Find storey for this clash pair
    var storeyRows = A.dbQuery("SELECT storey FROM elements_meta WHERE guid = ?", [c[0]]);
    var storey = storeyRows.length ? storeyRows[0][0] : '';
    // Short deep-link using hash fragment — avoids repeating the long OCI base URL
    var dbParam = new URLSearchParams(location.search).get('db') || '';
    var hash = '#clash=' + c[0] + '~' + c[1] +
      '&st=' + encodeURIComponent(storey || '') +
      '&cam=' + p.x.toFixed(2) + ',' + p.y.toFixed(2) + ',' + p.z.toFixed(2) +
      '&tgt=' + t.x.toFixed(2) + ',' + t.y.toFixed(2) + ',' + t.z.toFixed(2) +
      '&tol=' + tolMm;
    return location.origin + location.pathname + (dbParam ? '?db=' + encodeURIComponent(dbParam) : '') + hash;
  };

  // Clash snag functions loaded from clash_snag.js via setupClashSnag(A)

  A._revealClashes = function(clashes, rules, cardX, cardY, pairLabel, pairRule) {
    if (A._clashRevealActive) A._dismissClashes(true);
    A._clashRevealActive = true;
    A._loadClashStatuses();
    A._currentClashes = clashes;
    A._currentClashRules = rules;
    var display = rules.display || {};
    var dimOpacity = display.dim_opacity || 0.1;
    var maxVisible = display.max_visible || 20;

    // Dimming removed — was cloning every mesh material (expensive, didn't visibly work).
    // Clash elements are shown via red/blue overlap meshes + fly-to camera instead.

    // Build itemised list
    var shown = Math.min(A._currentClashes.length, maxVisible);
    var listDiv = document.createElement('div');
    listDiv.style.cssText = 'position:fixed;z-index:400;' + _panelBg + 'color:#fff;font-size:11px;padding:0;border-radius:8px;border:1px solid rgba(255,140,0,0.6);font-family:Segoe UI,sans-serif;line-height:1.5;min-width:180px;max-width:240px;max-height:40vh;display:flex;flex-direction:column;pointer-events:auto';
    // Position: right-aligned, above matrix corner on both mobile and desktop
    listDiv.style.right = _isMobile ? '6px' : '10px';
    if (A._clashMatrixDiv) {
      var matRect = A._clashMatrixDiv.getBoundingClientRect();
      listDiv.style.bottom = (window.innerHeight - matRect.top + 6) + 'px';
      listDiv.style.top = 'auto';
    } else {
      listDiv.style.top = Math.min(Math.max(cardY - 50, 10), window.innerHeight - 300) + 'px';
    }

    A._renderClashList = function() {
      // Sticky header
      var hdr = '';
      if (pairLabel) {
        var tolMm = pairRule ? (pairRule.tolerance_m * 1000).toFixed(0) : '25';
        hdr += '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b style="color:#4fc3f7;font-size:12px">' + pairLabel + '</b>' +
          '<span id="clash-list-close" style="cursor:pointer;color:#aaa;font-size:22px;line-height:1;padding:6px">\u2715</span></div>';
        hdr += '<div style="display:flex;align-items:center;gap:4px;margin:2px 0">' +
          '<span style="font-size:9px;color:#aaa">1</span>' +
          '<input id="clash-tol-slider" type="range" min="1" max="100" value="' + tolMm + '" ' +
          'style="flex:1;height:4px;accent-color:#4fc3f7;cursor:pointer">' +
          '<span style="font-size:9px;color:#aaa">100</span>' +
          '<span id="clash-tol-val" style="font-size:10px;color:#fff;min-width:30px">' + tolMm + 'mm</span></div>';
      }
      var cc = A._currentClashes || [];
      var sCounts = { '': 0, 'Reviewed': 0, 'Resolved': 0, 'Accepted': 0 };
      for (var si = 0; si < cc.length; si++) {
        var sk = A._clashPairKey(cc[si][0], cc[si][1]);
        sCounts[A._clashStatuses[sk] || '']++;
      }
      hdr += '<span style="color:#fff;font-size:11px">' + cc.length + ' <span id="clash-total-count" style="color:#888;font-size:10px"></span></span>';
      hdr += '<div style="display:flex;gap:8px;margin:2px 0;font-size:11px;color:#aaa">' +
        '<span>\u{1F7E1}' + sCounts['Reviewed'] + ' RVW</span>' +
        '<span>\u{1F7E2}' + sCounts['Resolved'] + ' SLV</span>' +
        '<span>\u26AA' + sCounts['Accepted'] + ' ACC</span></div>';
      hdr += '<hr style="border:none;border-top:1px solid #555;margin:3px 0">';

      // Scrollable body
      var shown = Math.min(cc.length, maxVisible);
      var body = '';
      for (var i = 0; i < shown; i++) {
        var c = cc[i];
        var clsA = (c[2] || '?').replace('Ifc', '').replace('StandardCase', '');
        var clsB = (c[3] || '?').replace('Ifc', '').replace('StandardCase', '');
        var overlap = (typeof c[8] === 'number') ? c[8] : 0;
        var sev = A._clashSeverity(overlap, rules);
        var pairKey = A._clashPairKey(c[0], c[1]);
        var status = A._clashStatuses[pairKey] || '';
        var ss = A._clashStatusStyles[status];
        body +=
          '<span data-clash-idx="' + i + '" style="cursor:pointer;display:block;padding:1px 0;' + ss.style + '">' +
          (ss.icon ? ss.icon : '<span style="color:#888">' + (i + 1) + '</span>') +
          ' ' + clsA + '\u2194' + clsB +
          ' <b style="color:' + sev.color + '">' + overlap.toFixed(2) + 'm</b>' +
          '</span>';
      }
      if (cc.length > maxVisible) {
        body += '<span style="color:#888;font-size:9px">+' + (cc.length - maxVisible) + ' more</span>';
      }
      return { hdr: hdr, body: body };
    };

    var rendered = A._renderClashList();
    listDiv.innerHTML =
      '<div id="clash-list-header" style="padding:8px 10px 0;flex-shrink:0">' + rendered.hdr + '</div>' +
      '<div id="clash-list-body" style="padding:0 10px 8px;overflow-y:auto;flex:1;touch-action:pan-y">' + rendered.body + '</div>';
    document.body.appendChild(listDiv);
    A._clashListDiv = listDiv;
    A._makeDraggable(listDiv);
    A.measureLabels.push({ div: listDiv, mid: null });

    // Tolerance slider — re-query on change
    var slider = listDiv.querySelector('#clash-tol-slider');
    if (slider && pairRule) {
      slider.addEventListener('input', function() {
        var valEl = listDiv.querySelector('#clash-tol-val');
        if (valEl) valEl.textContent = slider.value + 'mm';
      });
      slider.addEventListener('change', function() {
        pairRule.tolerance_m = parseInt(slider.value) / 1000;
        console.log('§CLASH_TOL_SLIDER ' + (pairLabel || '') + ' to ' + slider.value + 'mm');
        // Re-query with new tolerance (keep matrix open)
        A._dismissClashes(true);
        A._clashPairOffset = 0;
        var parts = (pairLabel || '').split(' vs ');
        if (parts.length === 2) {
          var newClashes = A._queryClashesPair(A._currentClashStorey, rules, parts[0], parts[1], 0);
          A._currentClashes = newClashes;
          A._clashPairOffset = A._CLASH_PAGE_SIZE;
          var rect = A._clashMatrixDiv ? A._clashMatrixDiv.getBoundingClientRect() : { left: cardX, top: cardY };
          A._revealClashes(newClashes, rules, rect.left, rect.top, pairLabel, pairRule);
          A._loadRemainingStoreys();
          if (!A._currentClashStorey) A._countClashesAsync(rules, parts[0], parts[1]);
        }
      });
    }

    // Click handler — left-click row to fly, right-click/long-press/double-tap row to toggle status
    var statusLongPress = null;
    var statusLongFired = false;
    var statusMovedTooFar = false;
    var statusStartX = 0, statusStartY = 0;

    // Suppress context menu on clash rows (mobile shows native menu otherwise)
    listDiv.addEventListener('contextmenu', function(ev) {
      var target = ev.target.closest('[data-clash-idx]');
      if (!target) return;
      ev.preventDefault();
      var idx = parseInt(target.getAttribute('data-clash-idx'));
      A._toggleClashStatus(idx);
    });

    listDiv.addEventListener('pointerdown', function(ev) {
      var target = ev.target.closest('[data-clash-idx]');
      if (!target) return;
      statusLongFired = false;
      statusMovedTooFar = false;
      statusStartX = ev.clientX;
      statusStartY = ev.clientY;
      var idx = parseInt(target.getAttribute('data-clash-idx'));
      statusLongPress = setTimeout(function() {
        if (statusMovedTooFar) return;
        statusLongFired = true;
        statusLongPress = null;
        // S246: Long-press → Snag (capture + annotate + share)
        target.style.background = 'rgba(244,67,54,0.3)';
        setTimeout(function() { target.style.background = ''; }, 200);
        A._snagClash(idx);
      }, 350);
    });
    listDiv.addEventListener('pointermove', function(ev) {
      // Cancel long-press if finger moves too far (scroll, not press)
      if (statusLongPress) {
        var dx = ev.clientX - statusStartX, dy = ev.clientY - statusStartY;
        if (dx * dx + dy * dy > 100) { // 10px threshold
          statusMovedTooFar = true;
          clearTimeout(statusLongPress);
          statusLongPress = null;
        }
      }
    });
    listDiv.addEventListener('pointerup', function(ev) {
      if (statusLongPress) { clearTimeout(statusLongPress); statusLongPress = null; }
      // Quick tap (not long-press, not moved) → fly to clash immediately (no 300ms click delay)
      if (!statusLongFired && !statusMovedTooFar) {
        var target = ev.target.closest('[data-clash-idx]');
        if (target) {
          var idx = parseInt(target.getAttribute('data-clash-idx'));
          A._flyToClash(idx);
        }
      }
    });
    listDiv.addEventListener('pointercancel', function() {
      if (statusLongPress) { clearTimeout(statusLongPress); statusLongPress = null; }
    });

    // Double-tap row → toggle status (mobile-friendly alternative to long-press)
    listDiv.addEventListener('dblclick', function(ev) {
      var target = ev.target.closest('[data-clash-idx]');
      if (!target) return;
      ev.preventDefault();
      var idx = parseInt(target.getAttribute('data-clash-idx'));
      A._toggleClashStatus(idx);
    });

    // pointerup on close/export — fires before click, no 300ms delay on mobile
    listDiv.addEventListener('pointerup', function(ev) {
      if (ev.target.id === 'clash-list-close') { ev.stopPropagation(); A._dismissClashes(true); return; }
      if (ev.target.id === 'clash-export-btn' || ev.target.closest('#clash-export-btn')) { ev.stopPropagation(); A._exportClashReport(); return; }
    });
    listDiv.addEventListener('click', function(ev) {
      if (statusLongFired) { statusLongFired = false; return; }
      // Close X
      if (ev.target.id === 'clash-list-close') {
        A._dismissClashes(true);
        return;
      }
      // Export button
      if (ev.target.id === 'clash-export-btn' || ev.target.closest('#clash-export-btn')) {
        A._exportClashReport();
        return;
      }
      // On desktop, click also triggers fly-to (mobile uses pointerup above)
      if (!_isMobile) {
        var target = ev.target.closest('[data-clash-idx]');
        if (target) A._flyToClash(parseInt(target.getAttribute('data-clash-idx')));
      }
    });

    // Dismiss via close X only — no auto-dismiss on canvas click
    // (user needs to orbit around clash mesh without losing it)

    console.log('§CLASH_REVEAL storey=' + (A._currentClashes.length ? 'active' : 'none') + ' showing=' + shown);
    if (A.markDirty) A.markDirty();
  };

  // Toggle status: (none) → Reviewed → Resolved → Accepted → (none)
  A._toggleClashStatus = function(idx) {
    var c = A._currentClashes[idx];
    if (!c) return;
    var pairKey = A._clashPairKey(c[0], c[1]);
    var current = A._clashStatuses[pairKey] || '';
    var cycle = A._clashStatusCycle;
    var nextIdx = (cycle.indexOf(current) + 1) % cycle.length;
    var next = cycle[nextIdx];
    if (next) {
      A._clashStatuses[pairKey] = next;
    } else {
      delete A._clashStatuses[pairKey];
    }

    // Accepted applies to all clashes with same IFC class pair (session cache)
    if (next === 'Accepted') {
      var clsA = c[2], clsB = c[3];
      var applied = 0;
      for (var i = 0; i < A._currentClashes.length; i++) {
        var ci = A._currentClashes[i];
        if ((ci[2] === clsA && ci[3] === clsB) || (ci[2] === clsB && ci[3] === clsA)) {
          var pk = A._clashPairKey(ci[0], ci[1]);
          if (!A._clashStatuses[pk]) { A._clashStatuses[pk] = 'Accepted'; applied++; }
        }
      }
      if (applied) console.log('§CLASH_ACCEPT_ALL class=' + clsA + '|' + clsB + ' applied=' + applied);
    }

    A._saveClashStatuses();
    if (A._clashListDiv && A._renderClashList) {
      var r = A._renderClashList();
      var hdrEl = A._clashListDiv.querySelector('#clash-list-header');
      var bodyEl = A._clashListDiv.querySelector('#clash-list-body');
      if (hdrEl) hdrEl.innerHTML = r.hdr;
      if (bodyEl) bodyEl.innerHTML = r.body;
    }
    console.log('§CLASH_STATUS guidA=' + c[0] + ' guidB=' + c[1] + ' status=' + (next || 'none'));
  };

  // Clash report functions loaded from clash_report.js via setupClashReporter(A)

  // ── Clash Matrix — visual grid of discipline pair rules ──
  A._clashMatrixDiv = null;

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
      // X and 📊 share the same rightmost column (28px wide)
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
      // Bottom row: col labels + 📊 in same right column
      html += '<div style="display:flex;align-items:center;pointer-events:auto">';
      for (var ci = 0; ci < discs.length - 1; ci++) {
        html += '<div style="width:' + cellSz + 'px;font-size:8px;font-weight:bold;color:#888;text-align:center">' + discs[ci] + '</div>';
      }
      html += '<span id="clash-matrix-export" style="width:' + rCol + 'px;text-align:center;cursor:pointer;font-size:14px;opacity:0.8" title="Clash Report">📊</span>';
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
        '<b style="color:#4fc3f7;font-size:12px">Clash Matrix — ' + scopeLabel + '</b>' +
        '<span style="display:flex;gap:8px;align-items:center">' +
        '<span id="clash-matrix-export" style="cursor:pointer;font-size:16px" title="Clash Report">📊</span>' +
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
      var color = n > 50 ? '#ff0000' : n > 10 ? '#ff4400' : '#ff8c00';
      var sphere = '<span title="' + n + ' clashes" style="display:inline-block;width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;' +
        'background:' + color + ';box-shadow:0 0 4px ' + color + ';vertical-align:middle"></span>';
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

  A._dismissClashes = function(keepMatrix) {
    if (!A._clashRevealActive) return;
    // Restore materials
    A._clashBackups.forEach(function(b) { b.mesh.material = b.origMat; });
    A._clashBackups = [];
    A._clashRevealActive = false;
    // Always remove list + highlights
    if (A._clashListDiv) {
      A._clashListDiv.remove();
      A._clashListDiv = null;
    }
    if (A._clashHighlights) {
      A._clashHighlights.forEach(function(h) { A.measureGroup.remove(h); });
      A._clashHighlights = [];
    }
    // §S277c: Clear outline on clash dismiss
    if (A.setOutline) A.setOutline([], 0xff8c00);
    // Only remove matrix when not keeping it
    if (!keepMatrix && A._clashMatrixDiv) {
      A._clashMatrixDiv.remove();
      A._clashMatrixDiv = null;
      A._clashDiscCache = {}; // §S278: clear discipline element cache
      if (A._clashModeActive && A._exitClashMode) A._exitClashMode();
    }
    if (A.markDirty) A.markDirty();
    console.log('§CLASH_DISMISS' + (keepMatrix ? ' (kept matrix+list)' : ''));
  };

  A.toggleMeasure = function() {
    // Block if 2D grid overlay is active
    if (!A.measureActive && typeof GridViews !== 'undefined' && GridViews.activeView()) {
      A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_close_2d||'Close 2D view first';
      return;
    }
    A.measureActive = !A.measureActive;
    const btn = document.getElementById('measure-btn');
    btn.style.background = A.measureActive ? '#4fc3f7' : '#444';
    btn.style.color = A.measureActive ? '#000' : '#fff';
    // Grey out / restore 2D button
    var g2d = document.getElementById('grid-2d-btn');
    if (g2d) { g2d.style.opacity = A.measureActive ? '0.3' : '1'; }
    var isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    A.status.textContent = A.measureActive
      ? (isMobile ? (typeof _TRL!=='undefined'&&_TRL.ui_measure_hint_mobile||'Tap for dimensions. Long-press for Info. Tap here to exit.') : (typeof _TRL!=='undefined'&&_TRL.ui_measure_hint||'Click for dimensions. Right-click for Info'))
      : '';
    // Mobile: tap status bar to exit measure mode
    if (A.measureActive && isMobile) {
      A.status.style.cursor = 'pointer';
      A.status.onclick = function() { if (A.measureActive) A.toggleMeasure(); };
    } else {
      A.status.style.cursor = '';
      A.status.onclick = null;
    }
    if (!A.measureActive) {
      if (A._measureClickTimer) { clearTimeout(A._measureClickTimer); A._measureClickTimer = null; }
      if (A._longPressTimer) { clearTimeout(A._longPressTimer); A._longPressTimer = null; }
      A._longPressFired = false;
      A.clearMeasures(true);
    }
    console.log(`§MEASURE mode ${A.measureActive ? 'ON' : 'OFF'}`);
  };

  // S251: exitMode=true (measure OFF) closes everything including matrix
  //       exitMode=false (right-click clear) preserves matrix
  A.clearMeasures = function(exitMode) {
    try {
      while (A.measureGroup.children.length) {
        A.measureGroup.remove(A.measureGroup.children[0]);
      }
      A.measureLabels.forEach(m => {
        if (!exitMode && m.div === A._clashMatrixDiv) return;
        try { m.div.remove(); } catch(e) {}
      });
      A.measureLabels = exitMode ? [] : A.measureLabels.filter(m => m.div === A._clashMatrixDiv);
      A.measureFirstPoint = null;
      A.measureFirstMarker = null;
      if (A._areaBackups) {
        A._areaBackups.forEach(b => { try { b.mesh.material = b.origMat; } catch(e) {} });
        A._areaBackups = [];
      }
      if (exitMode) {
        // Force-remove clash list + matrix even if _clashRevealActive is already false
        if (A._clashListDiv) { try { A._clashListDiv.remove(); } catch(e2) {} }
        if (A._clashMatrixDiv) { try { A._clashMatrixDiv.remove(); } catch(e2) {} }
        A._dismissClashes();
      }
    } catch(e) {
      console.warn('§MEASURE_CLEAR_ERR', e.message);
    }
    A._guidToMesh = null;
    A._infoCardDiv = null;
    if (exitMode) {
      A._clashMatrixDiv = null;
      A._clashListDiv = null;
      A._clashRevealActive = false;
    }
    // Ensure toolbox is visible (issues.js hides it, clash flow may not restore it)
    var tb = document.getElementById('search-box');
    if (tb) tb.style.display = '';
    console.log('§MEASURE cleared all');
  };

  A._measureClickTimer = null;
  A.handleMeasureClick = function(e) {
    if (!A.measureActive) return false;
    // S246b: clash panels open → fall through to normal IFC pick (yellow highlight + info panel)
    if (A._clashMatrixDiv || A._clashListDiv) return false;
    // Debounce: wait 250ms to see if double-click follows
    if (A._measureClickTimer) { clearTimeout(A._measureClickTimer); A._measureClickTimer = null; }
    var ev = { clientX: e.clientX, clientY: e.clientY };
    A._measureClickTimer = setTimeout(function() { A._doMeasureClick(ev); }, 250);
    return true;
  };

  A._doMeasureClick = function(e) {
    // S246b: use canvas bounds for NDC — correct when DevTools/chrome shrinks viewport
    var canvas = A.renderer ? A.renderer.domElement : null;
    var rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    A.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    A.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    A.raycaster.setFromCamera(A.mouse, A.camera);

    const meshes = [];
    A.scene.traverse(obj => { if (obj.isMesh && obj !== A.ground && obj.visible) meshes.push(obj); });
    const hits = A.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return true;

    const point = hits[0].point.clone();
    const hitMesh = hits[0].object;

    if (!A.measureFirstPoint) {
      A.measureFirstPoint = point;
      A._measureFirstMesh = hitMesh;
      const markerGeo = new THREE.SphereGeometry(0.15, 8, 8);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7 });
      A.measureFirstMarker = new THREE.Mesh(markerGeo, markerMat);
      A.measureFirstMarker.position.copy(point);
      A.measureGroup.add(A.measureFirstMarker);
      A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_measure_tap||'Tap another spot for length, same spot for Area';
      console.log('§MEASURE dot placed — tap same dot for area, or tap elsewhere for distance');
    } else if (point.distanceTo(A.measureFirstPoint) < 0.5) {
      // Second tap on same spot → area of that element
      var mesh = A._measureFirstMesh;
      var area = A._meshArea(mesh);
      var label = area.toFixed(2) + ' m²';
      var cls = mesh.userData.ifcClass || '';
      if (cls) label = cls.replace('Ifc', '') + ': ' + label;
      A._highlightMesh(mesh, null, 0xff8c00);
      // Fixed-position label at click point
      var labelDiv = document.createElement('div');
      labelDiv.className = 'measure-label';
      labelDiv.style.cssText = 'position:fixed;z-index:100;' + _panelBg + 'color:#cc6600;font-size:14px;font-weight:bold;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,140,0,0.6);pointer-events:none;white-space:nowrap;font-family:Segoe UI,sans-serif';
      labelDiv.textContent = label;
      labelDiv.style.left = Math.min(e.clientX + 10, window.innerWidth - 200) + 'px';
      labelDiv.style.top = Math.min(Math.max(e.clientY - 30, 10), window.innerHeight - 50) + 'px';
      document.body.appendChild(labelDiv);
      A.measureLabels.push({ div: labelDiv, mid: null });
      A.status.textContent = label;
      console.log('§MEASURE_AREA ' + label + ' mesh=' + (mesh.userData.guid || mesh.id));
      // Remove the first-point marker
      if (A.measureFirstMarker) A.measureGroup.remove(A.measureFirstMarker);
      A.measureFirstPoint = null;
      A.measureFirstMarker = null;
      A._measureFirstMesh = null;
    } else {
      const p1 = A.measureFirstPoint;
      const p2 = point;
      const dist = p1.distanceTo(p2).toFixed(2) + 'm';

      const markerGeo2 = new THREE.SphereGeometry(0.15, 8, 8);
      const markerMat2 = new THREE.MeshBasicMaterial({ color: 0x4fc3f7 });
      const marker2 = new THREE.Mesh(markerGeo2, markerMat2);
      marker2.position.copy(p2);
      A.measureGroup.add(marker2);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x4fc3f7, dashSize: 0.3, gapSize: 0.15, linewidth: 1
      });
      const line = new THREE.Line(lineGeo, lineMat);
      line.computeLineDistances();
      A.measureGroup.add(line);

      const labelDiv = document.createElement('div');
      labelDiv.className = 'measure-label';
      labelDiv.textContent = dist;
      document.body.appendChild(labelDiv);

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      A.measureLabels.push({ div: labelDiv, p1: p1.clone(), p2: p2.clone(), mid: mid });

      console.log(`§MEASURE ${dist} from (${p1.x.toFixed(1)},${p1.y.toFixed(1)},${p1.z.toFixed(1)}) to (${p2.x.toFixed(1)},${p2.y.toFixed(1)},${p2.z.toFixed(1)})`);

      A.measureFirstPoint = null;
      A.measureFirstMarker = null;
      A._measureFirstMesh = null;
    }
    return true;
  };

  // ── Area from mesh geometry (world-space, cached by geometry UUID) ──
  A._areaCache = {};
  A._meshArea = function(mesh) {
    var geo = mesh.geometry;
    if (!geo) return 0;
    var cacheKey = geo.uuid;
    if (A._areaCache[cacheKey] !== undefined) {
      console.log('§MEASURE_AREA cache hit geo=' + cacheKey);
      return A._areaCache[cacheKey];
    }
    var pos = geo.attributes.position;
    if (!pos) return 0;
    var idx = geo.index;
    // Transform vertices to world space via mesh.matrixWorld
    mesh.updateMatrixWorld(true);
    var mat = mesh.matrixWorld;
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    var ab = new THREE.Vector3(), ac = new THREE.Vector3();
    var area = 0;
    if (idx) {
      for (var i = 0; i < idx.count; i += 3) {
        a.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(mat);
        b.fromBufferAttribute(pos, idx.getX(i + 1)).applyMatrix4(mat);
        c.fromBufferAttribute(pos, idx.getX(i + 2)).applyMatrix4(mat);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        area += ab.cross(ac).length() * 0.5;
      }
    } else {
      for (var i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i).applyMatrix4(mat);
        b.fromBufferAttribute(pos, i + 1).applyMatrix4(mat);
        c.fromBufferAttribute(pos, i + 2).applyMatrix4(mat);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        area += ab.cross(ac).length() * 0.5;
      }
    }
    A._areaCache[cacheKey] = area;
    return area;
  };

  // ── Volume from bounding box (practical for rooms — covers openings) ──
  A._meshVolume = function(mesh) {
    var box = new THREE.Box3().setFromObject(mesh);
    var size = new THREE.Vector3();
    box.getSize(size);
    return size.x * size.y * size.z;
  };

  // ── Highlight mesh and show label ──
  A._areaBackups = [];
  A._highlightMesh = function(mesh, text, color) {
    A._areaBackups.push({ mesh: mesh, origMat: mesh.material });
    var newMat = mesh.material.clone();
    newMat.color.set(color);
    newMat.transparent = true;
    newMat.opacity = 0.6;
    newMat.needsUpdate = true;
    mesh.material = newMat;
    if (!text) return;
    var box = new THREE.Box3().setFromObject(mesh);
    var center = new THREE.Vector3();
    box.getCenter(center);
    var labelDiv = document.createElement('div');
    labelDiv.className = 'measure-label';
    labelDiv.style.cssText = 'position:fixed;z-index:100;' + _panelBg + 'color:#cc6600;font-size:14px;font-weight:bold;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,140,0,0.6);pointer-events:none;white-space:nowrap;font-family:Segoe UI,sans-serif';
    labelDiv.textContent = text;
    document.body.appendChild(labelDiv);
    A.measureLabels.push({ div: labelDiv, mid: center, p1: center, p2: center });
  };

  // ── Double-click: area of hit element → orange highlight ──
  A.handleMeasureDblClick = function(e) {
    if (!A.measureActive) return;
    // Cancel pending single-click
    if (A._measureClickTimer) { clearTimeout(A._measureClickTimer); A._measureClickTimer = null; }
    A.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    A.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    A.raycaster.setFromCamera(A.mouse, A.camera);
    var meshes = [];
    A.scene.traverse(function(obj) { if (obj.isMesh && obj !== A.ground && obj.visible) meshes.push(obj); });
    var hits = A.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return;
    var mesh = hits[0].object;
    var area = A._meshArea(mesh);
    var label = area.toFixed(2) + ' m²';
    var cls = mesh.userData.ifcClass || '';
    if (cls) label = cls.replace('Ifc', '') + ': ' + label;
    A._highlightMesh(mesh, label, 0xff8c00);
    A.status.textContent = label;
    console.log('§MEASURE_AREA ' + label + ' mesh=' + (mesh.userData.guid || mesh.id));
  };

  // ── Right-click: bounding box wireframe + info card ──
  A._infoCardDiv = null;
  A.handleMeasureRightClick = function(e) {
    if (!A.measureActive) return false;
    // Block heavy info card while clash panels are open — user has normal IFC pick via click
    if (A._clashMatrixDiv || A._clashListDiv) return false;
    // Dismiss existing info card before opening new one
    if (A._infoCardDiv && A._infoCardDiv.parentNode) A._infoCardDiv.remove();
    A._infoCardDiv = null;
    e.preventDefault();
    A.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    A.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    A.raycaster.setFromCamera(A.mouse, A.camera);
    var meshes = [];
    A.scene.traverse(function(obj) { if (obj.isMesh && obj !== A.ground && obj.visible) meshes.push(obj); });
    var hits = A.raycaster.intersectObjects(meshes, false);
    var hitMesh = hits.length ? hits[0].object : null;
    var storey = null;
    var storeyLabel = 'Whole Building';
    if (hitMesh) {
      storey = hitMesh.userData.storey;
      if (storey === undefined || storey === null) storey = 'Unknown';
      storeyLabel = storey || 'All Elements';
    }
    // Class counts from DB (instant GROUP BY)
    var counts = {};
    var dbRows;
    if (storey) {
      dbRows = A.dbQuery(
        "SELECT REPLACE(m.ifc_class,'Ifc','') AS cls, COUNT(*) AS n FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid WHERE m.storey = ? AND m.ifc_class != 'IfcOpeningElement' GROUP BY cls ORDER BY n DESC",
        [storey]
      );
    } else {
      dbRows = A.dbQuery(
        "SELECT REPLACE(m.ifc_class,'Ifc','') AS cls, COUNT(*) AS n FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid WHERE m.ifc_class != 'IfcOpeningElement' GROUP BY cls ORDER BY n DESC LIMIT 20"
      );
    }
    var totalFromDb = 0;
    dbRows.forEach(function(r) { counts[r[0] || 'Other'] = r[1]; totalFromDb += r[1]; });

    // Bounding box — DB envelope for whole building (instant), scene traverse for storey
    var size = new THREE.Vector3();
    var volume = 0, floorArea = 0;
    if (storey) {
      var roomMeshes = [];
      A.scene.traverse(function(obj) {
        if (obj.isMesh && obj !== A.ground && obj.visible && obj.userData.storey === storey) roomMeshes.push(obj);
      });
      var roomBox = new THREE.Box3();
      roomMeshes.forEach(function(m) { roomBox.expandByObject(m); });
      roomBox.getSize(size);
      volume = size.x * size.y * size.z;
      floorArea = size.x * size.z;
      var boxHelper = new THREE.Box3Helper(roomBox, 0xff8c00);
      A.measureGroup.add(boxHelper);
    } else {
      // Whole building — use DB envelope, no scene traverse
      var envRow = A.dbQuery(
        "SELECT MIN(center_x - bbox_x/2), MAX(center_x + bbox_x/2)," +
        " MIN(center_y - bbox_y/2), MAX(center_y + bbox_y/2)," +
        " MIN(center_z - bbox_z/2), MAX(center_z + bbox_z/2) FROM element_transforms"
      );
      if (envRow.length) {
        var r = envRow[0];
        size.set(r[1] - r[0], r[5] - r[4], r[3] - r[2]); // ifc: x=x, y→z, z→y in three
        volume = (r[1]-r[0]) * (r[3]-r[2]) * (r[5]-r[4]);
        floorArea = (r[1]-r[0]) * (r[3]-r[2]);
      }
    }
    // Build info card
    var lines = [];
    lines.push('<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<b style="color:#4fc3f7;font-size:15px">' + storeyLabel + '</b>' +
      '<span class="clash-card-close" style="cursor:pointer;color:#aaa;font-size:22px;line-height:1;padding:6px">\u2715</span></div>');
    lines.push('<hr style="border:none;border-top:1px solid #555;margin:4px 0">');
    lines.push('Vol: <b style="color:#ff8c00">' + volume.toFixed(1) + ' m\u00B3</b>');
    lines.push('Floor: <b>' + floorArea.toFixed(1) + ' m\u00B2</b> &nbsp; H: <b>' + size.y.toFixed(1) + 'm</b>');
    lines.push('<hr style="border:none;border-top:1px solid #555;margin:4px 0">');
    var sorted = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    sorted.forEach(function(cls) {
      lines.push(cls + ': <b style="color:#4fc3f7">' + counts[cls] + '</b>');
    });
    lines.push('<hr style="border:none;border-top:1px solid #555;margin:4px 0">');
    lines.push('<span style="color:#888;font-size:10px">Total: ' + totalFromDb + ' elements</span>');
    // Clash count — async load rules then query
    var clashPlaceholder = '<span id="clash-count-line" style="color:#888;font-size:10px">Checking clashes...</span>';
    lines.push('<hr style="border:none;border-top:1px solid #555;margin:4px 0">');
    lines.push(clashPlaceholder);
    var cardDiv = document.createElement('div');
    cardDiv.style.cssText = 'position:fixed;z-index:200;' + _panelBg + 'color:#fff;font-size:12px;padding:10px 14px;border-radius:8px;border:1px solid rgba(79,195,247,0.6);pointer-events:auto;font-family:Segoe UI,sans-serif;line-height:1.6;min-width:180px';
    // Position at click location, then adjust to fit in viewport
    cardDiv.innerHTML = lines.join('<br>');
    document.body.appendChild(cardDiv);
    var cx = Math.min(e.clientX + 10, window.innerWidth - 220);
    var cy = Math.max(e.clientY - 100, 10);
    var cardH = cardDiv.offsetHeight;
    if (cy + cardH > window.innerHeight - 10) cy = window.innerHeight - cardH - 10;
    if (cy < 10) cy = 10;
    cardDiv.style.left = cx + 'px';
    cardDiv.style.top = cy + 'px';
    // Store for cleanup — no 3D tracking needed, fixed position
    A.measureLabels.push({ div: cardDiv, mid: null });
    A._makeDraggable(cardDiv);
    A._infoCardDiv = cardDiv;
    // Close X
    var closeBtn = cardDiv.querySelector('.clash-card-close');
    if (closeBtn) {
      var _closeCard = function(ev) {
        ev.stopPropagation();
        cardDiv.remove();
        A._infoCardDiv = null;
        var idx = A.measureLabels.findIndex(function(m) { return m.div === cardDiv; });
        if (idx >= 0) A.measureLabels.splice(idx, 1);
      };
      closeBtn.addEventListener('pointerup', _closeCard);
      closeBtn.addEventListener('click', _closeCard);
    }
    A.status.textContent = storeyLabel + ' — ' + volume.toFixed(1) + ' m\u00B3';
    console.log('§MEASURE_VOLUME ' + storeyLabel + ' vol=' + volume.toFixed(1) + 'm\u00B3 elements=' + totalFromDb + ' counts=' + JSON.stringify(counts));

    // Clash indicator — lazy LIMIT 1 per pair, async, stops at first hit
    // S251: enabled on both mobile and desktop (R-tree EXISTS is fast enough)
    A._loadClashRules(function(rules) {
      var clashEl = cardDiv.querySelector('#clash-count-line');
      if (!clashEl) return;
      A._currentClashRules = rules;
      A._currentClashStorey = storey;
      A._currentClashes = [];
      A._clashPairOffset = 0;

      var _sphere = function(color, size) {
        var s = size || 14;
        var light = color === '#4caf50' ? '#8fef8f' : color === '#ff0000' ? '#ff8888' : color === '#ff2090' ? '#ff88cc' : '#ffc966';
        return '<span style="display:inline-block;width:' + s + 'px;height:' + s + 'px;border-radius:50%;' +
          'background:radial-gradient(circle at 35% 35%,' + light + ',' + color + ' 60%,#111);' +
          'vertical-align:middle;margin-right:4px;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>';
      };

      // Show placeholder sphere while checking
      var _openMatrix = function() { A._showClashMatrix(rules, cardDiv); };
      var _updateSphere = function(color) {
        clashEl.innerHTML = '<span id="clash-tap-trigger" style="cursor:pointer;padding:6px 0">' +
          'CLASHES ' + _sphere(color, _isMobile ? 22 : 18) + '</span>';
        var trigger = cardDiv.querySelector('#clash-tap-trigger');
        if (trigger) {
          trigger.addEventListener('pointerup', _openMatrix);
          trigger.addEventListener('click', _openMatrix);
        }
      };
      _updateSphere('#aaa'); // grey while checking

      // Check discipline counts first (instant)
      var discCounts = {};
      var dcRows = A.dbQuery("SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline");
      dcRows.forEach(function(r) { discCounts[r[0]] = r[1]; });

      // Filter rules to those with both sides present
      var activeRules = rules.clash_rules.filter(function(r) {
        return discCounts[r.source.discipline] && discCounts[r.target.discipline];
      });

      if (!activeRules.length) {
        _updateSphere('#4caf50'); // green — no applicable rules
        return;
      }

      // Quick check: discipline envelope overlap (instant, no cross-join)
      var w = A._clashWhereParts(rules);
      var envSql = "SELECT m.discipline," +
        " MIN(t.center_x - t.bbox_x/2), MAX(t.center_x + t.bbox_x/2)," +
        " MIN(t.center_y - t.bbox_y/2), MAX(t.center_y + t.bbox_y/2)," +
        " MIN(t.center_z - t.bbox_z/2), MAX(t.center_z + t.bbox_z/2)" +
        " FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid" +
        " WHERE m.discipline IS NOT NULL" +
        (storey ? " AND m.storey = '" + storey.replace(/'/g, "''") + "'" : "") +
        " GROUP BY m.discipline";
      var envRows = A.dbQuery(envSql);
      var envMap = {};
      envRows.forEach(function(r) {
        envMap[r[0]] = { minX: r[1], maxX: r[2], minY: r[3], maxY: r[4], minZ: r[5], maxZ: r[6] };
      });
      var anyOverlap = activeRules.some(function(r) {
        var eA = envMap[r.source.discipline], eB = envMap[r.target.discipline];
        if (!eA || !eB) return false;
        return eA.minX < eB.maxX && eA.maxX > eB.minX &&
               eA.minY < eB.maxY && eA.maxY > eB.minY &&
               eA.minZ < eB.maxZ && eA.maxZ > eB.minZ;
      });
      if (anyOverlap) {
        _updateSphere('#ff8c00');
        console.log('§CLASH_QUICK envelope overlap found');
      } else {
        _updateSphere('#4caf50');
        console.log('§CLASH_QUICK no envelope overlap');
      }
    });

    return true;
  };

  A.updateMeasureLabels = function() {
    if (!A.measureActive && !A.measureLabels.length && !A.measureGroup.children.length) return;
    A.measureLabels.forEach(m => {
      if (!m.mid) return;  // fixed-position labels (info cards)
      const projected = m.mid.clone().project(A.camera);
      if (projected.z > 1) {
        m.div.style.display = 'none';
        return;
      }
      m.div.style.display = '';
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      m.div.style.left = x + 'px';
      m.div.style.top = y + 'px';
    });
    // Constant-size marker dots — scale based on camera distance
    if (A.measureGroup.children.length) {
      A.measureGroup.children.forEach(function(child) {
        if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
          var dist = A.camera.position.distanceTo(child.position);
          var s = Math.max(dist * 0.05, 0.15);
          child.scale.setScalar(s);
        }
      });
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // S245e — Clash DLOD: Lightweight Clash Analysis Mode
  // Implementing S245e_clash_dlod.md §Level 0-3
  // ══════════════════════════════════════════════════════════════════════════

  A._clashModeActive = false;
  A._clashBboxCloud = [];        // InstancedMesh array for bbox wireframe cloud
  A._clashLodUpdateFreq = 100;   // ms — throttle proximity queries
  A._lastClashLodUpdate = 0;
  A._clashProxSet = new Set();   // GUIDs currently rendered as real mesh in LOD
  A._clashProxMeshes = [];       // Real meshes loaded for proximity LOD

  // ── Enter Clash Mode ──────────────────────────────────────────────────────
  // Hides full scene geometry, renders bbox wireframe cloud (one InstancedMesh per discipline)
  A._enterClashMode = function() {
    if (A._clashModeActive) return;
    if (!A.db || !A._hasBbox) {
      console.warn('§CLASH_DLOD cannot enter — no bbox data');
      return;
    }
    if (!A._clashRtreeReady) {
      A._ensureClashIndexes();
      A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_building_index||'Building spatial index\u2026';
      console.log('§CLASH_DLOD R-tree not ready yet — building...');
    }

    // Hide all streamed geometry (meshes + instanced meshes + batched + merged)
    A.collectMeshes(function(o) {
      return (o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLineSegments) &&
             !o.userData.isBboxPlaceholder && o !== A.ground;
    }).forEach(function(o) {
      o.userData._clashHidden = true;
      o.visible = false;
    });

    // Query all elements with bbox data
    var t0 = performance.now();
    var rows = A.dbQuery(
      "SELECT m.guid, m.discipline, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
      "FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid " +
      "WHERE m.building = ? AND t.bbox_x IS NOT NULL",
      [A.activeBuilding]
    );
    if (!rows.length) {
      console.warn('§CLASH_DLOD no elements found');
      return;
    }

    // Group by discipline
    var byDisc = {};
    for (var i = 0; i < rows.length; i++) {
      var disc = rows[i][1] || '_';
      if (!byDisc[disc]) byDisc[disc] = [];
      byDisc[disc].push(rows[i]);
    }

    // Build one InstancedMesh per discipline (wireframe boxes)
    // Also build guid→instance map so proximity LOD can hide nearby bboxes
    A._clashBboxMap = {}; // guid → { iMesh, idx, matrix }
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var _m4 = new THREE.Matrix4();
    var _pos = new THREE.Vector3();
    var _scl = new THREE.Vector3();
    var _quat = new THREE.Quaternion();
    var _zeroM4 = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(0, 0, 0));
    var totalInstances = 0;

    for (var disc in byDisc) {
      var drows = byDisc[disc];
      var color = A.DISC_COLORS[disc] || A.DEFAULT_COLOR;
      var mat = new THREE.MeshBasicMaterial({
        color: color, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false
      });
      var iMesh = new THREE.InstancedMesh(geo, mat, drows.length);
      iMesh.frustumCulled = false;
      iMesh.renderOrder = -1;
      iMesh.userData.isClashBbox = true;
      iMesh.userData.disc = disc;

      for (var j = 0; j < drows.length; j++) {
        var r = drows[j];
        var p = A.ifc2three(r[2], r[3], r[4]);
        var bx = r[5] || 0.3, by = r[6] || 0.3, bz = r[7] || 0.3;
        _pos.set(p.x, p.y, p.z);
        _scl.set(bx, bz, by);
        _m4.compose(_pos, _quat, _scl);
        iMesh.setMatrixAt(j, _m4);
        // Store original matrix for restoring when proximity mesh leaves
        A._clashBboxMap[r[0]] = { iMesh: iMesh, idx: j, matrix: _m4.clone() };
      }
      iMesh.instanceMatrix.needsUpdate = true;
      A.scene.add(iMesh);
      A._clashBboxCloud.push(iMesh);
      totalInstances += drows.length;
    }

    A._clashModeActive = true;
    A._clashProxSet = new Set();
    A._clashProxMeshes = [];
    var ms = (performance.now() - t0).toFixed(0);
    console.log('§CLASH_DLOD_ENTER elements=' + totalInstances + ' discs=' + Object.keys(byDisc).length + ' time=' + ms + 'ms');
    if (A.markDirty) A.markDirty();
  };

  // ── Exit Clash Mode ───────────────────────────────────────────────────────
  A._exitClashMode = function() {
    if (!A._clashModeActive) return;

    // Remove bbox cloud
    for (var i = 0; i < A._clashBboxCloud.length; i++) {
      A.scene.remove(A._clashBboxCloud[i]);
      A._clashBboxCloud[i].material.dispose();
    }
    if (A._clashBboxCloud.length) A._clashBboxCloud[0].geometry.dispose();
    A._clashBboxCloud = [];

    // Remove proximity LOD meshes
    for (var j = 0; j < A._clashProxMeshes.length; j++) {
      A.scene.remove(A._clashProxMeshes[j]);
      // Don't dispose geometry — it's from meshCache
    }
    A._clashProxMeshes = [];
    A._clashProxSet = new Set();

    // Restore hidden geometry
    A.collectMeshes(function(o) {
      return o.userData._clashHidden;
    }).forEach(function(o) {
      delete o.userData._clashHidden;
      // Respect storey/disc filters
      var storeyOk = A.activeStoreyFilter === null || o.userData.storey === A.activeStoreyFilter;
      var discOk = !A.hiddenDiscs.has(o.userData.disc);
      o.visible = storeyOk && discOk;
    });

    A._clashModeActive = false;
    console.log('§CLASH_DLOD_EXIT');
    if (A.markDirty) A.markDirty();
  };

  // ── Camera Proximity LOD (Level 2) ────────────────────────────────────────
  // Called from animate loop (throttled). Loads real meshes near camera target.
  var _zeroM4 = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3(0, 0, 0));
  A._updateClashLOD = function() {
    if (!A._clashModeActive || !A._clashRtreeReady || !A.db) return;
    var now = performance.now();
    if (now - A._lastClashLodUpdate < A._clashLodUpdateFreq) return;
    A._lastClashLodUpdate = now;

    // Query frustum around controls.target (where camera is looking)
    var target = A.controls.target;
    // Convert Three.js target back to IFC coords for R-tree query
    // ifc2three: x = ix - offset.x, y = iz - offset.z, z = -(iy - offset.y)
    // Inverse: ix = x + offset.x, iy = -(z) + offset.y, iz = y + offset.z
    var ix = target.x + A.modelOffset.x;
    var iy = -target.z + A.modelOffset.y;
    var iz = target.y + A.modelOffset.z;

    // Proximity radius — scale with camera distance (closer = smaller query area)
    var camDist = A.camera.position.distanceTo(target);
    var radius = Math.max(camDist * 0.5, 2); // At least 2m, scales with distance
    var maxRadius = 20; // Cap at 20m
    if (radius > maxRadius) radius = maxRadius;

    var sql = "SELECT id FROM elements_rtree WHERE " +
      "maxX >= " + (ix - radius) + " AND minX <= " + (ix + radius) + " AND " +
      "maxY >= " + (iy - radius) + " AND minY <= " + (iy + radius) + " AND " +
      "maxZ >= " + (iz - radius) + " AND minZ <= " + (iz + radius);

    var rtreeRows;
    try { rtreeRows = A.dbQuery(sql); }
    catch(e) { return; }

    if (!rtreeRows.length) return;

    // Limit to 50 nearest elements
    var rowids = rtreeRows.slice(0, 50).map(function(r) { return r[0]; });

    // Get GUIDs for these rowids
    var ph = rowids.map(function() { return '?'; }).join(',');
    var guidRows = A.dbQuery(
      "SELECT t.guid, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, m.discipline, m.material_rgba " +
      "FROM element_transforms t JOIN elements_meta m ON t.guid = m.guid WHERE t.rowid IN (" + ph + ")", rowids
    );

    // Determine which GUIDs are new (not already loaded)
    var newGuids = [];
    var currentSet = new Set();
    for (var i = 0; i < guidRows.length; i++) {
      currentSet.add(guidRows[i][0]);
      if (!A._clashProxSet.has(guidRows[i][0])) newGuids.push(guidRows[i]);
    }

    // Remove meshes for GUIDs no longer in proximity — restore their bbox instances
    var toRemove = [];
    A._clashProxMeshes = A._clashProxMeshes.filter(function(mesh) {
      if (!currentSet.has(mesh.userData.guid)) {
        A.scene.remove(mesh);
        // Restore bbox instance
        var bInfo = A._clashBboxMap && A._clashBboxMap[mesh.userData.guid];
        if (bInfo) {
          bInfo.iMesh.setMatrixAt(bInfo.idx, bInfo.matrix);
          bInfo.iMesh.instanceMatrix.needsUpdate = true;
        }
        toRemove.push(mesh.userData.guid);
        return false;
      }
      return true;
    });
    toRemove.forEach(function(g) { A._clashProxSet.delete(g); });

    // Load real meshes for new GUIDs
    if (!newGuids.length) return;
    var guidsToLoad = newGuids.map(function(r) { return r[0]; });
    var ph2 = guidsToLoad.map(function() { return '?'; }).join(',');
    var hashRows = A.dbQuery(
      "SELECT guid, geometry_hash FROM element_instances WHERE guid IN (" + ph2 + ")", guidsToLoad
    );
    var hashMap = {};
    hashRows.forEach(function(r) { hashMap[r[0]] = r[1]; });

    var loaded = 0;
    for (var k = 0; k < newGuids.length; k++) {
      var guid = newGuids[k][0];
      var hash = hashMap[guid];
      if (!hash) continue;
      var geo = A.meshCache[hash];
      if (!geo) {
        // Load from DB — just enough nearby pieces for context
        var gRows = A.dbQuery("SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?", [hash]);
        if (gRows.length && gRows[0][0] && gRows[0][1]) {
          geo = A.blobToGeometry(gRows[0][0], gRows[0][1]);
          if (geo) A.meshCache[hash] = geo;
        }
      }
      if (!geo) continue;

      var pos = A.ifc2three(newGuids[k][1], newGuids[k][2], newGuids[k][3]);
      // Use original color but force opaque — avoids transparency sorting artifacts
      var rgba = newGuids[k][8] || null;
      var baseMat = A._getMaterial ? A._getMaterial(rgba) : null;
      var mat = new THREE.MeshPhongMaterial({
        color: baseMat ? baseMat.color : 0xaaaaaa,
        transparent: false, flatShading: true, side: THREE.DoubleSide
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, pos.y, pos.z);
      if (newGuids[k][4] || newGuids[k][5] || newGuids[k][6]) {
        mesh.rotation.set(newGuids[k][4] || 0, newGuids[k][6] || 0, -(newGuids[k][5] || 0));
      }
      mesh.userData.guid = guid;
      mesh.userData.isClashProx = true;
      mesh.renderOrder = 10;
      A.scene.add(mesh);
      A._clashProxMeshes.push(mesh);
      A._clashProxSet.add(guid);
      // Hide corresponding bbox instance
      var bInfo = A._clashBboxMap && A._clashBboxMap[guid];
      if (bInfo) {
        bInfo.iMesh.setMatrixAt(bInfo.idx, _zeroM4);
        bInfo.iMesh.instanceMatrix.needsUpdate = true;
      }
      loaded++;
    }

    if (loaded > 0) {
      console.log('§CLASH_LOD prox=' + A._clashProxSet.size + ' new=' + loaded + ' radius=' + radius.toFixed(1) + 'm');
      if (A.markDirty) A.markDirty();
    }
  };

  // ── Toggle (for UI button / keyboard shortcut) ─────────────────────────────
  A.toggleClashMode = function() {
    if (A._clashModeActive) A._exitClashMode();
    else A._enterClashMode();
  };

  // ── Load extracted modules if present ──
  if (typeof setupClashReporter === 'function') setupClashReporter(A);
  if (typeof setupClashSnag === 'function') setupClashSnag(A);
}
