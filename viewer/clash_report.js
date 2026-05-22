// clash_report.js — Clash report HTML export and CSV background export (extracted from measure.js)
// S246b: async with progress bar, caches envelopes + pair counts
function setupClashReporter(A) {

  // ── State ──
  A._exportInProgress = false;
  A._csvExportInProgress = false;
  A._cachedPairCounts = null;
  A._reportPairCounts = null;
  A._currentClashPairLabel = '';

  // Export clash report — opens HTML analytics tab from loaded clashes
  // S246b: async with progress bar, caches envelopes + pair counts
  A._exportClashReport = function() {
    console.log('§EXPORT_ENTRY rules=' + !!A._currentClashRules + ' inProgress=' + !!A._exportInProgress);
    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_gen_report_start||'Preparing clash report\u2026';
    var rules = A._currentClashRules;
    if (!rules) { A.status.textContent = 'No clash rules loaded'; console.log('§EXPORT_ABORT no rules'); return; }
    if (A._exportInProgress) { A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_report_busy||'Report already generating...'; return; }
    A._exportInProgress = true;
    var building = A.activeBuilding || 'Building';
    var date = new Date().toISOString().slice(0, 10);
    var storey = A._currentClashStorey || 'All';
    var pairLabel = A._currentClashPairLabel || 'All Pairs';

    // Listing = whatever is currently loaded from cell click. Charts use counts.
    var MAX_REPORT = (rules.display && rules.display.max_report) || 200;
    var allClashes = (A._currentClashes || []).slice();
    // Count per pair — reuse cache, envelope check, async R-tree count
    var _pairCounts = {};
    // Reuse cached envelopes from matrix (avoid duplicate GROUP BY)
    var _envs = A._clashEnvelopes || {};
    if (!Object.keys(_envs).length) {
      A.dbQuery("SELECT m.discipline, MIN(t.center_x-t.bbox_x/2), MAX(t.center_x+t.bbox_x/2)," +
        " MIN(t.center_y-t.bbox_y/2), MAX(t.center_y+t.bbox_y/2)," +
        " MIN(t.center_z-t.bbox_z/2), MAX(t.center_z+t.bbox_z/2)" +
        " FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid" +
        " WHERE m.discipline IS NOT NULL GROUP BY m.discipline")
        .forEach(function(r) { _envs[r[0]] = { minX:r[1], maxX:r[2], minY:r[3], maxY:r[4], minZ:r[5], maxZ:r[6] }; });
      A._clashEnvelopes = _envs;
    }
    // Build work queue: only pairs that need R-tree counting (envelope overlap + not cached)
    var _pairQueue = [];
    var cache = A._cachedPairCounts || {};
    var t0 = performance.now();
    rules.clash_rules.forEach(function(r) {
      var key = r.source.discipline + '|' + r.target.discipline;
      var sortedKey = [r.source.discipline, r.target.discipline].sort().join('|');
      var eA = _envs[r.source.discipline], eB = _envs[r.target.discipline];
      if (!eA || !eB || eA.minX >= eB.maxX || eA.maxX <= eB.minX ||
          eA.minY >= eB.maxY || eA.maxY <= eB.minY ||
          eA.minZ >= eB.maxZ || eA.maxZ <= eB.minZ) {
        _pairCounts[key] = 0; return;
      }
      if (cache[sortedKey] !== undefined) {
        _pairCounts[key] = cache[sortedKey]; return;
      }
      _pairQueue.push({ key: key, discA: r.source.discipline, discB: r.target.discipline });
    });
    var total = rules.clash_rules.length, done = total - _pairQueue.length;
    A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_gen_report||'Generating report\u2026 {done}/{total} pairs').replace('{done}', done).replace('{total}', total);
    console.log('§EXPORT_START pairs=' + total + ' cached=' + done + ' toCount=' + _pairQueue.length);

    // Async storey-loop R-tree count — one pair per yield
    var qi = 0;
    function _nextPair() {
      if (qi >= _pairQueue.length) {
        A._reportPairCounts = _pairCounts;
        var ms = (performance.now() - t0).toFixed(0);
        console.log('§EXPORT_COUNTS done in ' + ms + 'ms');
        A._buildExportHtml(rules, building, date, storey, pairLabel, allClashes, _pairCounts, _envs, MAX_REPORT);
        return;
      }
      var p = _pairQueue[qi++];
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_counting_clashes||'Counting {a} vs {b}\u2026 {i}/{n}').replace('{a}', p.discA).replace('{b}', p.discB).replace('{i}', done + qi).replace('{n}', total);
      // S246b: single R-tree count across all storeys — no storey loop needed
      if (A._clashRtreeReady) {
        var count = A._countClashesRtree(null, rules, p.discA, p.discB);
        _pairCounts[p.key] = count;
        // Cache for future exports
        var sk = [p.discA, p.discB].sort().join('|');
        if (!A._cachedPairCounts) A._cachedPairCounts = {};
        A._cachedPairCounts[sk] = count;
      }
      setTimeout(_nextPair, 5);
    }
    if (_pairQueue.length > 0 && A._clashRtreeReady) {
      setTimeout(_nextPair, 5);
    } else {
      A._reportPairCounts = _pairCounts;
      A._buildExportHtml(rules, building, date, storey, pairLabel, allClashes, _pairCounts, _envs, MAX_REPORT);
    }
  };
  // S246b: separated HTML builder from count loop — called after async counts complete
  A._buildExportHtml = function(rules, building, date, storey, pairLabel, allClashes, _pairCounts, _envs, MAX_REPORT) {
    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_building_report||'Building report\u2026';
    // If no clashes loaded (no cell clicked), load from all pairs via R-tree
    if (!allClashes.length && A._clashRtreeReady) {
      var perPairCap = Math.max(20, Math.floor(MAX_REPORT / Math.max(Object.keys(_pairCounts).length, 1)));
      rules.clash_rules.forEach(function(r) {
        var key = r.source.discipline + '|' + r.target.discipline;
        if (!_pairCounts[key]) return;
        var oldPageSize = A._CLASH_PAGE_SIZE;
        A._CLASH_PAGE_SIZE = perPairCap;
        var rows = A._queryClashesPairRtree(null, rules, r.source.discipline, r.target.discipline, 0, null);
        A._CLASH_PAGE_SIZE = oldPageSize;
        rows.forEach(function(row) { allClashes.push(row); });
      });
      console.log('§EXPORT_AUTOLOAD loaded ' + allClashes.length + ' clashes from all pairs (cap=' + perPairCap + '/pair)');
    }
    if (allClashes.length > MAX_REPORT) allClashes = allClashes.slice(0, MAX_REPORT);
    // Total = sum of R-tree counts across all pairs (full building)
    var totalCount = 0;
    Object.keys(_pairCounts).forEach(function(k) { totalCount += _pairCounts[k]; });
    if (!totalCount) totalCount = allClashes.length;
    if (!allClashes.length && !totalCount) { A._exportInProgress = false; A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_no_clashes||'No clashes \u2014 open matrix first'; return; }
    // Sort by overlap desc (worst first), then Accepted last
    allClashes.sort(function(a, b) {
      var stA = A._clashStatuses[A._clashPairKey(a[0], a[1])] || '';
      var stB = A._clashStatuses[A._clashPairKey(b[0], b[1])] || '';
      if (stA === 'Accepted' && stB !== 'Accepted') return 1;
      if (stB === 'Accepted' && stA !== 'Accepted') return -1;
      var oa = (typeof a[8] === 'number') ? a[8] : 0;
      var ob = (typeof b[8] === 'number') ? b[8] : 0;
      return ob - oa;
    });
    if (allClashes.length > MAX_REPORT) allClashes = allClashes.slice(0, MAX_REPORT);
    pairLabel = 'All Pairs';

    // Snapshot matrix HTML from viewer (if open)
    var matrixSnapshot = '';
    if (A._clashMatrixDiv) {
      matrixSnapshot = A._clashMatrixDiv.innerHTML;
    }

    // Build pair summary — seed from ALL rules + R-tree counts, overlay with loaded clashes
    var pairSummary = [];
    var pairMap = {};
    // Seed every rule pair so none are missing from the summary table
    rules.clash_rules.forEach(function(r) {
      var key = r.source.discipline + '|' + r.target.discipline;
      var count = _pairCounts[key] || 0;
      if (!pairMap[key]) pairMap[key] = { src: r.source.discipline, tgt: r.target.discipline, count: count, reviewed: 0, resolved: 0, accepted: 0 };
    });
    // Overlay with loaded clash statuses
    allClashes.forEach(function(c) {
      var key = (c[4] || '?') + '|' + (c[5] || '?');
      if (!pairMap[key]) pairMap[key] = { src: c[4] || '?', tgt: c[5] || '?', count: 0, reviewed: 0, resolved: 0, accepted: 0 };
      var st = A._clashStatuses[A._clashPairKey(c[0], c[1])] || '';
      if (st === 'Reviewed') pairMap[key].reviewed++;
      else if (st === 'Resolved') pairMap[key].resolved++;
      else if (st === 'Accepted') pairMap[key].accepted++;
    });
    Object.keys(pairMap).forEach(function(k) {
      var p = pairMap[k];
      var rule = rules.clash_rules.find(function(r) {
        return (r.source.discipline === p.src && r.target.discipline === p.tgt) ||
               (r.source.discipline === p.tgt && r.target.discipline === p.src);
      });
      p.tolMm = rule ? (rule.tolerance_m * 1000).toFixed(0) : '25';
      pairSummary.push(p);
    });

    // Prepare data
    var sc = { 'New': 0, 'Reviewed': 0, 'Resolved': 0, 'Accepted': 0 };
    var sevCounts = {};
    var classCounts = {};
    var discPairCounts = {};
    var discInvolvement = {}; // how many clashes each discipline is involved in
    var elementFreq = {}; // which elements appear most often in clashes
    allClashes.forEach(function(c, i) {
      var overlap = (typeof c[8] === 'number') ? c[8] : 0;
      var sev = A._clashSeverity(overlap, rules);
      var status = A._clashStatuses[A._clashPairKey(c[0], c[1])] || '';
      sc[status || 'New']++;
      sevCounts[sev.label] = (sevCounts[sev.label] || 0) + 1;
      var clsA = (c[2] || '?').replace('Ifc', '').replace('StandardCase', '');
      var clsB = (c[3] || '?').replace('Ifc', '').replace('StandardCase', '');
      var classPair = clsA + ' vs ' + clsB;
      classCounts[classPair] = (classCounts[classPair] || 0) + 1;
      var discPair = (c[4] || '?') + ' vs ' + (c[5] || '?');
      discPairCounts[discPair] = (discPairCounts[discPair] || 0) + 1;
      // Also track disc pair key for merging R-tree counts later
      discPairCounts['_listed_' + (c[4]||'') + '|' + (c[5]||'')] = 1;
      // Per-discipline involvement
      var dA = c[4] || '?', dB = c[5] || '?';
      discInvolvement[dA] = (discInvolvement[dA] || 0) + 1;
      discInvolvement[dB] = (discInvolvement[dB] || 0) + 1;
      // Top offender elements
      var nameA = (c[6] || '').replace('Ifc', '') || c[0];
      var nameB = (c[7] || '').replace('Ifc', '') || c[1];
      elementFreq[nameA] = (elementFreq[nameA] || 0) + 1;
      elementFreq[nameB] = (elementFreq[nameB] || 0) + 1;
    });

    // Merge R-tree counts for all pairs (charts show full building, not just loaded pair)
    if (_pairCounts) {
      Object.keys(_pairCounts).forEach(function(k) {
        var parts = k.split('|');
        var label = parts[0] + ' vs ' + parts[1];
        if (!discPairCounts[label]) discPairCounts[label] = _pairCounts[k];
        else if (!discPairCounts['_listed_' + k]) discPairCounts[label] = _pairCounts[k];
      });
    }
    // Clean internal keys
    Object.keys(discPairCounts).forEach(function(k) { if (k.indexOf('_listed_') === 0) delete discPairCounts[k]; });
    var classPairs = Object.keys(classCounts).sort(function(a, b) { return classCounts[b] - classCounts[a]; });
    var discPairs = Object.keys(discPairCounts).sort(function(a, b) { return discPairCounts[b] - discPairCounts[a]; });
    // Radar: ALL disciplines — instant metrics, no clash cross-joins
    // Axis 1: element count, Axis 2: envelope overlap count (how many other discs it overlaps with)
    var radarDiscs = [];
    var radarElements = [];
    var radarOverlaps = [];
    var radarRules = [];
    var discElCounts = {};
    var dcR = A.dbQuery("SELECT discipline, COUNT(*) FROM elements_meta WHERE discipline IS NOT NULL GROUP BY discipline");
    dcR.forEach(function(r) { discElCounts[r[0]] = r[1]; });
    // S246b: reuse cached envelopes (passed in from async count phase)
    var envs = _envs;
    var allDiscs = Object.keys(discElCounts).sort();
    allDiscs.forEach(function(d) {
      radarDiscs.push(d);
      radarElements.push(discElCounts[d] || 0);
      // Count how many other disciplines this one overlaps with spatially
      var overlapN = 0;
      var eA = envs[d];
      if (eA) allDiscs.forEach(function(d2) {
        if (d2 === d) return;
        var eB = envs[d2];
        if (eB && eA.minX < eB.maxX && eA.maxX > eB.minX &&
            eA.minY < eB.maxY && eA.maxY > eB.minY &&
            eA.minZ < eB.maxZ && eA.maxZ > eB.minZ) overlapN++;
      });
      radarOverlaps.push(overlapN);
      // Count clash rules involving this discipline
      var ruleN = rules.clash_rules.filter(function(r) {
        return r.source.discipline === d || r.target.discipline === d;
      }).length;
      radarRules.push(ruleN);
    });
    // Top offenders: elements in most clashes (top 10)
    var topOffenders = Object.keys(elementFreq).sort(function(a, b) { return elementFreq[b] - elementFreq[a]; }).slice(0, 10);
    var topOffenderCounts = topOffenders.map(function(e) { return elementFreq[e]; });

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<title>Clash Report — ' + pairLabel + ' — ' + building + '</title>' +
      '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"><\/script>' +
      '<style>' +
      '* { margin:0; padding:0; box-sizing:border-box; }' +
      'body { background:#1a1a2e; color:#e0e0e0; font-family:Segoe UI,sans-serif; padding:20px; }' +
      'h1 { color:#4fc3f7; font-size:20px; margin-bottom:4px; }' +
      '.subtitle { color:#888; font-size:12px; margin-bottom:16px; }' +
      '.charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; max-width:1200px; }' +
      '.chart-box { background:rgba(255,255,255,0.05); border-radius:8px; padding:16px; border:1px solid rgba(255,255,255,0.08); }' +
      '.chart-box h2 { color:#4fc3f7; font-size:14px; margin-bottom:8px; }' +
      '.chart-box.full { grid-column:1/-1; }' +
      'canvas { max-width:100%; }' +
      'table { border-collapse:collapse; width:100%; font-size:11px; margin-top:8px; }' +
      'th { background:rgba(79,195,247,0.15); color:#4fc3f7; text-align:left; padding:4px 8px; position:sticky; top:0; }' +
      'td { padding:3px 8px; border-bottom:1px solid rgba(255,255,255,0.05); }' +
      'tr:hover td { background:rgba(255,255,255,0.05); }' +
      'td[contenteditable] { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); min-width:60px; }' +
      'td[contenteditable]:focus { outline:1px solid #4fc3f7; background:rgba(79,195,247,0.1); }' +
      '.toolbar { position:fixed; top:16px; right:16px; z-index:10; display:flex; gap:8px; }' +
      '.toolbar button { background:#333; color:#fff; border:1px solid #555; border-radius:4px; padding:6px 12px; cursor:pointer; font-size:12px; }' +
      '.toolbar button:hover { background:#4fc3f7; color:#000; }' +
      '.stat-cards { display:flex; gap:12px; margin-bottom:16px; }' +
      '.stat-card { background:rgba(255,255,255,0.05); border-radius:8px; padding:12px 20px; text-align:center; border:1px solid rgba(255,255,255,0.08); flex:1; }' +
      '.stat-card .num { font-size:28px; font-weight:bold; }' +
      '.stat-card .lbl { font-size:11px; color:#888; }' +
      '</style></head><body>' +
      '<div class="toolbar">' +
      '<button onclick="if(window.opener&&window.opener._bimApp&&window.opener._bimApp._exportCSVBackground){window.opener._bimApp._exportCSVBackground()}else{alert(\'Open from viewer to export CSV\')}">Download CSV</button>' +
      '<button onclick="_shareReport()">Share Report</button>' +
      '<button onclick="_copyUrl(this)" title="Copy shareable link">&#128203;</button>' +
      '</div>' +
      '<div style="display:flex;gap:20px;margin-bottom:16px;align-items:stretch">' +
      '<div style="flex:0 0 auto;max-width:280px">' +
      '<h1 style="font-size:24px;margin-bottom:6px;color:#4fc3f7">Clash Coordination Report</h1>' +
      '<div class="subtitle">' + pairLabel + '<br>' + building + '<br>' + date + '<br>Storey: ' + storey +
      '<br>' + totalCount + ' clashes' + (totalCount > allClashes.length ? ' (top ' + allClashes.length + ')' : '') + '</div>' +
      '</div>' +
      '<div style="flex:1;background:rgba(79,195,247,0.06);border:1px solid rgba(79,195,247,0.15);border-radius:8px;padding:20px 24px;line-height:2.2">' +
      '<b style="color:#4fc3f7;font-size:26px;display:block;margin-bottom:12px">Compliance &amp; Reference Standards</b>' +
      '<span style="font-size:18px;color:#ccc">' +
      'ISO 19650-1:2018 &mdash; Organization &amp; digitization of building information<br>' +
      'ISO 19650-2:2018 &mdash; Delivery phase clash avoidance &amp; coordination<br>' +
      'buildingSMART IFC4 &mdash; Spatial &amp; geometric intersection semantics<br>' +
      'BCF 3.0 &mdash; Clash topic exchange, viewpoint, GUID referencing<br>' +
      'PAS 1192-2 / BS EN ISO 19650 &mdash; UK BIM Level 2 coordination<br>' +
      'Singapore BIM Guide v2.0 &mdash; BCA/CORENET submission requirements<br>' +
      'NATSPEC BIM Reference Schedule &mdash; Tolerance definitions per discipline pair</span><br>' +
      '<span style="color:#888;font-size:11px">R-tree spatial index, O(n log N) per pair. Tolerances per clash_rules.json.</span>' +
      '</div>' +
      (matrixSnapshot ? '<div style="flex:0 0 auto" class="chart-box">' + matrixSnapshot + '</div>' : '') +
      '</div>' +
      '<div class="stat-cards">' +
      '<div class="stat-card" title="Total bbox overlaps detected across all discipline pairs"><div class="num" style="color:#ff4444">' + totalCount + '</div><div class="lbl">Total Clashes</div></div>' +
      '<div class="stat-card" title="Acknowledged clashes under investigation"><div class="num" style="color:#FFD700">' + sc['Reviewed'] + '</div><div class="lbl">Reviewed</div></div>' +
      '<div class="stat-card" title="Clashes fixed in the model — ready for re-check"><div class="num" style="color:#4caf50">' + sc['Resolved'] + '</div><div class="lbl">Resolved</div></div>' +
      '<div class="stat-card" title="Risk accepted — no design change needed (e.g. intentional penetration)"><div class="num" style="color:#888">' + sc['Accepted'] + '</div><div class="lbl">Accepted</div></div>' +
      '</div>' +
      '<div class="charts">' +
      '<div class="chart-box"><h2>By Discipline Pair</h2><canvas id="discChart"></canvas></div>' +
      '<div class="chart-box"><h2>Discipline Risk Profile</h2><canvas id="radarChart"></canvas></div>' +
      '<div class="chart-box"><h2>By Severity</h2><canvas id="sevChart"></canvas></div>' +
      '<div class="chart-box"><h2>By Status</h2><canvas id="statusChart"></canvas></div>' +
      '<div class="chart-box"><h2>Top Offenders — Fix These First</h2><canvas id="offenderChart"></canvas></div>' +
      '<div class="chart-box"><h2>By Element Class</h2><canvas id="classChart"></canvas></div>' +
      '<div class="chart-box full"><h2>Discipline Matrix Summary</h2>' +
      '<table><thead><tr><th>Source</th><th>Target</th><th>Tolerance</th><th>Clashes</th><th>Reviewed</th><th>Resolved</th><th>Accepted</th><th>Open</th></tr></thead><tbody>';

    pairSummary.forEach(function(ps) {
      var open = ps.count - ps.reviewed - ps.resolved - ps.accepted;
      var openColor = open > 0 ? '#ff4444' : '#4caf50';
      var pct = ps.count > 0 ? ((ps.resolved + ps.accepted) * 100 / ps.count).toFixed(0) : 100;
      var tip = ps.src + ' vs ' + ps.tgt + ': ' + ps.count + ' clashes found (tolerance ' + ps.tolMm + 'mm). ' +
        pct + '% resolved/accepted. ' + open + ' still need attention.';
      html += '<tr title="' + tip + '"><td>' + ps.src + '</td><td>' + ps.tgt + '</td><td>' + ps.tolMm + 'mm</td>' +
        '<td>' + ps.count + '</td><td>' + ps.reviewed + '</td><td>' + ps.resolved + '</td><td>' + ps.accepted + '</td>' +
        '<td style="color:' + openColor + ';font-weight:bold">' + open + '</td></tr>';
    });

    html += '</tbody></table>' +
      '<div style="margin-top:12px;text-align:right">' +
      '<button onclick="if(window.opener&&window.opener._bimApp&&window.opener._bimApp._exportCSVBackground){window.opener._bimApp._exportCSVBackground()}else{alert(\'Open from viewer to export CSV\')}" style="background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:8px 16px;cursor:pointer;font-size:12px">Download Full CSV</button>' +
      '</div></div>' +
      '</div>' +
      '<script>' +
      'function _shareReport(){' +
      'var html=document.documentElement.outerHTML;' +
      'var blob=new Blob([html],{type:"text/html"});' +
      'var a=document.createElement("a");' +
      'a.download="ClashReport_' + building.replace(/[^a-zA-Z0-9]/g, '_') + '_' + date.replace(/[^0-9-]/g, '') + '.html";' +
      'a.href=URL.createObjectURL(blob);a.click();' +
      'var d=document.createElement("div");' +
      'd.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(30,30,50,0.97);border-radius:12px;padding:24px 32px;border:1px solid rgba(79,195,247,0.5);text-align:center;font-family:Segoe UI,sans-serif";' +
      'd.innerHTML="<div style=\\"color:#4fc3f7;font-size:16px;font-weight:bold;margin-bottom:12px\\">Report Downloaded</div>"' +
      '+"<div style=\\"color:#ccc;font-size:13px;margin-bottom:16px;max-width:360px\\">HTML file saved. Share via WhatsApp, Email, or any medium.<br>Recipient opens it in any browser — full charts, no setup needed.</div>"' +
      '+"<button onclick=\\"this.parentElement.remove()\\" style=\\"padding:8px 24px;background:#4fc3f7;color:#000;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold\\">OK</button>";' +
      'document.body.appendChild(d)}' +
      'function _copyUrl(btn){' +
      'var url="' + (function() {
        var m = (typeof location !== 'undefined' ? location.href : '').match(/(https:\/\/objectstorage\.[^/]+\/n\/[^/]+\/b\/[^/]+\/o\/)/);
        var base = m ? m[1] : '';
        return base + 'clash_report.html?db=' + encodeURIComponent(A.DB_URL || '') + '&bld=' + encodeURIComponent(building);
      })() + '";' +
      'navigator.clipboard.writeText(url).then(function(){' +
      'var o=btn.innerHTML;btn.innerHTML="\\u2713";btn.style.color="#44cc44";' +
      'setTimeout(function(){btn.innerHTML=o;btn.style.color=""},1500)' +
      '}).catch(function(){prompt("Copy this URL:",url)})}' +
      'var sevData=' + JSON.stringify(sevCounts) + ';' +
      'var statusData=' + JSON.stringify(sc) + ';' +
      'var classPairs=' + JSON.stringify(classPairs) + ';' +
      'var classCounts=' + JSON.stringify(classCounts) + ';' +
      'var discPairs=' + JSON.stringify(discPairs) + ';' +
      'var discPairCounts=' + JSON.stringify(discPairCounts) + ';' +
      'new Chart(document.getElementById("sevChart"),{type:"doughnut",data:{labels:Object.keys(sevData),datasets:[{data:Object.values(sevData),backgroundColor:["#ff4444","#ff8c00","#4fc3f7"]}]},options:{cutout:"45%",plugins:{legend:{position:"top",align:"end",labels:{color:"#ccc",font:{size:14},padding:10}}}}});' +
      'new Chart(document.getElementById("statusChart"),{type:"doughnut",data:{labels:Object.keys(statusData),datasets:[{data:Object.values(statusData),backgroundColor:["#ff4444","#FFD700","#4caf50","#888"]}]},options:{cutout:"45%",plugins:{legend:{position:"top",align:"end",labels:{color:"#ccc",font:{size:14},padding:10}}}}});' +
      'new Chart(document.getElementById("discChart"),{type:"bar",data:{labels:discPairs,datasets:[{label:"Clashes",data:discPairs.map(function(p){return discPairCounts[p]}),backgroundColor:"#ff8c00"}]},options:{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#ccc"}},y:{ticks:{color:"#ccc"}}}}});' +
      'new Chart(document.getElementById("classChart"),{type:"bar",data:{labels:classPairs,datasets:[{label:"Clashes",data:classPairs.map(function(p){return classCounts[p]}),backgroundColor:"#4fc3f7"}]},options:{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#ccc"}},y:{ticks:{color:"#ccc"}}}}});' +
      'var radarDiscs=' + JSON.stringify(radarDiscs) + ';' +
      'var radarOverlaps=' + JSON.stringify(radarOverlaps) + ';' +
      'var radarRules=' + JSON.stringify(radarRules) + ';' +
      'var radarElements=' + JSON.stringify(radarElements) + ';' +
      'var maxEl=Math.max.apply(null,radarElements)||1;' +
      'new Chart(document.getElementById("radarChart"),{type:"radar",data:{labels:radarDiscs,datasets:[' +
      '{label:"Spatial overlaps",data:radarOverlaps,backgroundColor:"rgba(255,68,68,0.15)",borderColor:"#ff4444",pointBackgroundColor:"#ff4444"},' +
      '{label:"Clash rules",data:radarRules,backgroundColor:"rgba(255,140,0,0.15)",borderColor:"#ff8c00",pointBackgroundColor:"#ff8c00"},' +
      '{label:"Elements (scaled)",data:radarElements.map(function(e){return Math.round(e/maxEl*6)}),backgroundColor:"rgba(79,195,247,0.1)",borderColor:"#4fc3f7",pointBackgroundColor:"#4fc3f7"}' +
      ']},options:{scales:{r:{ticks:{color:"#888",backdropColor:"transparent"},grid:{color:"rgba(255,255,255,0.1)"},pointLabels:{color:"#ccc",font:{size:13}}}},plugins:{legend:{labels:{color:"#ccc"}}}}});' +
      'var topOff=' + JSON.stringify(topOffenders) + ';' +
      'var topOffC=' + JSON.stringify(topOffenderCounts) + ';' +
      'new Chart(document.getElementById("offenderChart"),{type:"bar",data:{labels:topOff,datasets:[{label:"Appears in N clashes",data:topOffC,backgroundColor:"#ff4444"}]},options:{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{ticks:{color:"#ccc"}},y:{ticks:{color:"#ccc",font:{size:10}}}}}});' +
      '<\/script></body></html>';

    // Expose app reference so the report window's Download CSV button can call back
    window._bimApp = A;
    var w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    A._exportInProgress = false;
    console.log('§CLASH_EXPORT html clashes=' + totalCount + ' (no detail table, CSV via background)');
    A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_report_opened||'Clash report opened in new tab';
  };

  // ── Background CSV export — queries one discipline pair at a time ──
  // Implementing S250 §3 — Background CSV: no DOM, yields between pairs
  A._exportCSVBackground = function() {
    var rules = A._currentClashRules;
    if (!rules || !A.db) { A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_no_clash_data||'No clash data \u2014 open matrix first'; return; }
    if (A._csvExportInProgress) { A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_csv_busy||'CSV export already in progress...'; return; }
    A._csvExportInProgress = true;

    var building = A.activeBuilding || 'Building';
    var date = new Date().toISOString().slice(0, 10);
    var csvLines = ['#,Element A,Class A,Disc A,Element B,Class B,Disc B,Overlap (m),Severity,Status'];
    var totalRows = 0;

    // Build pair queue from clash rules — only pairs with envelope overlap
    var envs = A._clashEnvelopes || {};
    if (!Object.keys(envs).length) {
      A.dbQuery("SELECT m.discipline, MIN(t.center_x-t.bbox_x/2), MAX(t.center_x+t.bbox_x/2)," +
        " MIN(t.center_y-t.bbox_y/2), MAX(t.center_y+t.bbox_y/2)," +
        " MIN(t.center_z-t.bbox_z/2), MAX(t.center_z+t.bbox_z/2)" +
        " FROM element_transforms t JOIN elements_meta m ON t.guid=m.guid" +
        " WHERE m.discipline IS NOT NULL GROUP BY m.discipline")
        .forEach(function(r) { envs[r[0]] = { minX:r[1], maxX:r[2], minY:r[3], maxY:r[4], minZ:r[5], maxZ:r[6] }; });
      A._clashEnvelopes = envs;
    }

    var pairQueue = [];
    var seen = {};
    rules.clash_rules.forEach(function(r) {
      var sortedKey = [r.source.discipline, r.target.discipline].sort().join('|');
      if (seen[sortedKey]) return;
      seen[sortedKey] = 1;
      var eA = envs[r.source.discipline], eB = envs[r.target.discipline];
      if (!eA || !eB || eA.minX >= eB.maxX || eA.maxX <= eB.minX ||
          eA.minY >= eB.maxY || eA.maxY <= eB.minY ||
          eA.minZ >= eB.maxZ || eA.maxZ <= eB.minZ) return;
      pairQueue.push({ discA: r.source.discipline, discB: r.target.discipline });
    });

    var totalPairs = pairQueue.length;
    var qi = 0;
    var savedPageSize = A._CLASH_PAGE_SIZE;

    function _nextPair() {
      if (qi >= pairQueue.length) {
        // Done — restore page size, build blob and auto-download
        A._CLASH_PAGE_SIZE = savedPageSize;
        var blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = building.replace(/\s+/g, '_') + '_clashes_' + date + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        A._csvExportInProgress = false;
        A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_csv_done||'CSV exported \u2014 {n} clashes').replace('{n}', totalRows);
        console.log('§CSV_EXPORT pairs=' + totalPairs + ' rows=' + totalRows);
        return;
      }

      var p = pairQueue[qi++];
      A.status.textContent = (typeof _TRL!=='undefined'&&_TRL.ui_exporting_csv||'Exporting CSV\u2026 pair {i}/{n}').replace('{i}', qi).replace('{n}', totalPairs);

      // Query all clashes for this pair — use large page size to get everything
      A._CLASH_PAGE_SIZE = 50000;
      var w = A._clashWhereParts(rules);
      var rows;
      if (A._clashRtreeReady) {
        rows = A._queryClashesPairRtree(null, rules, p.discA, p.discB, 0, w);
      } else {
        // Fallback: cross-join
        var pairCond = "(ma.discipline = '" + p.discA + "' AND mb.discipline = '" + p.discB + "')" +
          " OR (ma.discipline = '" + p.discB + "' AND mb.discipline = '" + p.discA + "')";
        var sql = "SELECT a.guid, b.guid, ma.ifc_class, mb.ifc_class, ma.discipline, mb.discipline," +
          " ma.element_name, mb.element_name," +
          " MIN((a.center_x + a.bbox_x/2) - (b.center_x - b.bbox_x/2)," +
          "     (a.center_y + a.bbox_y/2) - (b.center_y - b.bbox_y/2)," +
          "     (a.center_z + a.bbox_z/2) - (b.center_z - b.bbox_z/2)) AS overlap_m" +
          " FROM element_transforms a JOIN elements_meta ma ON a.guid = ma.guid" +
          " JOIN element_transforms b ON a.guid < b.guid JOIN elements_meta mb ON b.guid = mb.guid" +
          " WHERE (" + pairCond + ")" + w.ignoreClause + w.bboxJoin +
          " LIMIT 50000";
        rows = A.dbQuery(sql);
      }

      // Append rows to CSV lines (no DOM, pure string array)
      rows.forEach(function(c) {
        totalRows++;
        var overlap = (typeof c[8] === 'number') ? c[8] : 0;
        var sev = A._clashSeverity(overlap, rules);
        var status = A._clashStatuses[A._clashPairKey(c[0], c[1])] || 'New';
        var elA = ((c[6] || '').replace('Ifc', '') || c[0]).replace(/,/g, ' ');
        var clsA = (c[2] || '?').replace('Ifc', '').replace('StandardCase', '').replace(/,/g, ' ');
        var elB = ((c[7] || '').replace('Ifc', '') || c[1]).replace(/,/g, ' ');
        var clsB = (c[3] || '?').replace('Ifc', '').replace('StandardCase', '').replace(/,/g, ' ');
        csvLines.push(totalRows + ',' + elA + ',' + clsA + ',' + (c[4] || '') + ',' +
          elB + ',' + clsB + ',' + (c[5] || '') + ',' + overlap.toFixed(3) + ',' +
          sev.label + ',' + status);
      });

      // Yield to UI between pairs
      setTimeout(_nextPair, 8);
    }

    if (totalPairs === 0) {
      A._csvExportInProgress = false;
      A.status.textContent = typeof _TRL!=='undefined'&&_TRL.ui_no_clash_pairs||'No clash pairs to export';
      console.log('§CSV_EXPORT pairs=0 rows=0');
      return;
    }
    setTimeout(_nextPair, 8);
  };

  console.log('§CLASH_REPORT_MODULE loaded');
}
