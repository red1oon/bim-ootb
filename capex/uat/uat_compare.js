// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// uat_compare.js — the UAT's stage comparisons, ONE implementation for the checker page (capex/uat/check.html) and the witness W-UAT-CHAIN.
// Spec: prompts/CAPEX_DASHBOARD.md §5.87 (rules from §5.84 marks, §5.86 database). No DOM, no file system: callers hand in texts and a query function.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UatCompare = factory();
})(this, function () {
  'use strict';
  var FORMAT = 'capex-uat-pack/1';
  var NO_ZLINE = typeof process !== 'undefined' && process.env && process.env.UAT_ZLINE_BREAK === '1';   // the falsifier of the §D114 datum rule (the earlier exact-position compare)
  // ── B0.9 marked sheets ── a mark = its text without the @BY suffix + its insertion point to 0.01 drawing units
  function readMarks(text, DxfParser, Dxf2Marks) {
    var dxf = new DxfParser().parseSync(text);
    return Dxf2Marks.readMarks(dxf.entities).map(function (m) { return { t: m.raw.replace(/\s+@BY=\S+$/, ''), x: Number(m.x.toFixed(2)), y: Number(m.y.toFixed(2)) }; });
  }
  // §D114 (bim-ootb prompts/DXF2BIM_ARCHITECT_REVIEW.md): a level datum @Z is the statement "the drawn line at this y is height z". Two @Z marks of one text are the SAME mark when
  // both y's name the same horizontal LINE of the reference sheet: each y's nearest line y, within half the gap to the next distinct line y (a distance the sheet's own geometry gives).
  // So a datum typed to 0.1 (the 2026-11-22 pack: -4446.6) and the same line read exactly (-4446.5812) agree; a datum on another line does not.
  function lineYs(text, DxfParser) {
    var ys = []; new DxfParser().parseSync(text).entities.forEach(function (e) { if (e.type === 'LINE' && e.layer !== 'DXF2BIM-MARK' && e.vertices && e.vertices.length >= 2 && Math.abs(e.vertices[0].y - e.vertices[1].y) <= 1e-9) ys.push(e.vertices[0].y); });
    ys.sort(function (a, b) { return a - b; }); return ys.filter(function (y, i) { return !i || Math.abs(y - ys[i - 1]) > 1e-6; }); }
  function lineOf(ys, y) {   // index of the line y names, or -1
    var best = -1, bd = Infinity; ys.forEach(function (v, i) { var d = Math.abs(v - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return -1; var gap = Math.min(best > 0 ? ys[best] - ys[best - 1] : Infinity, best < ys.length - 1 ? ys[best + 1] - ys[best] : Infinity);
    return bd <= gap / 2 ? best : -1; }
  function sheetKey(name) { return String(name).split(/[\\/]/).pop().replace(/\.dxf$/i, '').replace(/_marked$/i, ''); }
  // tester / reference: { fileName: dxfText }. Rules (§5.84): every mark equal (text + position) except @BODYZ (one statement for the set, compared over the set)
  // and @EXCLUDE (a drag: its box must lie inside tol = { x0:[lo,hi], x1:[lo,hi], y0max, y1min } on the sheet that holds it)
  function compareMarked(tester, reference, deps, tol) {
    var T = {}, R = {}, diffs = [], exclude = [], bzT = [], bzR = [], zline = [];
    Object.keys(tester).forEach(function (n) { T[sheetKey(n)] = tester[n]; });
    Object.keys(reference).forEach(function (n) { R[sheetKey(n)] = reference[n]; });
    var names = Object.keys(R).sort(), missing = names.filter(function (n) { return !T[n]; }), extra = Object.keys(T).filter(function (n) { return !R[n]; });
    var special = function (m) { return /^@(EXCLUDE|BODYZ)=/.test(m.t); }, K = function (m) { return m.t + ' @' + m.x + ',' + m.y; };
    names.forEach(function (n) {
      if (!T[n]) return;
      var a = readMarks(T[n], deps.DxfParser, deps.Dxf2Marks), b = readMarks(R[n], deps.DxfParser, deps.Dxf2Marks);
      var ka = a.filter(function (m) { return !special(m); }).map(K).sort(), kb = b.filter(function (m) { return !special(m); }).map(K).sort();
      var ex = a.filter(function (m) { return !special(m) && kb.indexOf(K(m)) < 0; }), mi = b.filter(function (m) { return !special(m) && ka.indexOf(K(m)) < 0; });
      if (!NO_ZLINE && ex.some(function (m) { return /^@Z=/.test(m.t); }) && mi.some(function (m) { return /^@Z=/.test(m.t); })) {   // §D114 the same datum, the same drawn line
        var ys = lineYs(R[n], deps.DxfParser);
        ex = ex.filter(function (m) { if (!/^@Z=/.test(m.t)) return true; var li = lineOf(ys, m.y), j = li < 0 ? -1 : mi.findIndex(function (q) { return q.t === m.t && lineOf(ys, q.y) === li; });
          if (j < 0) return true; zline.push({ sheet: n, mark: m.t, yours: m.y, reference: mi[j].y, line: Number(ys[li].toFixed(4)) }); mi.splice(j, 1); return false; }); }
      ex.forEach(function (m) { diffs.push(n + ': extra ' + K(m)); });
      mi.forEach(function (m) { diffs.push(n + ': missing ' + K(m)); });
      a.filter(function (m) { return /^@BODYZ=/.test(m.t); }).forEach(function (m) { bzT.push(m.t); });
      b.filter(function (m) { return /^@BODYZ=/.test(m.t); }).forEach(function (m) { bzR.push(m.t); });
      var ea = a.filter(function (m) { return /^@EXCLUDE=/.test(m.t); }), eb = b.filter(function (m) { return /^@EXCLUDE=/.test(m.t); });
      if (ea.length !== eb.length) diffs.push(n + ': ' + ea.length + ' exclude box(es), the reference has ' + eb.length);
      ea.forEach(function (m) { var v = m.t.split('=')[1].split(',').map(Number), ok = !!tol && v[0] > tol.x0[0] && v[0] < tol.x0[1] && v[2] > tol.x1[0] && v[2] < tol.x1[1] && v[1] < tol.y0max && v[3] > tol.y1min;
        exclude.push({ sheet: n, box: v, inside: ok }); if (!ok) diffs.push(n + ': exclude box ' + v.join(',') + ' is outside the tolerance'); });
    });
    if (JSON.stringify(bzT.sort()) !== JSON.stringify(bzR.sort())) diffs.push('body heights over the set: ' + JSON.stringify(bzT) + ', the reference has ' + JSON.stringify(bzR));
    missing.forEach(function (n) { diffs.push(n + ': not given'); });
    var judged = names.length - missing.length;
    return { verdict: !judged ? 'NOT GIVEN' : diffs.length ? 'FAIL' : 'PASS', sheets: judged, of: names.length, extra: extra, diffs: diffs, exclude: exclude, zline: zline };
  }
  // ── B2.8 Viewer database ── q(sql) -> array of row arrays (sql.js: db.exec(sql)[0].values)
  var ROWS_SQL = "SELECT m.ifc_class, coalesce(m.material_name,''), b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ FROM elements_meta m LEFT JOIN element_world_bbox b ON b.guid = m.guid";
  var TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name";
  var OLD_COUNT = typeof process !== 'undefined' && process.env && process.env.UAT_OPT_BREAK === '1';   // W-UAT-COMPARE-OPTIONAL's break switch only (the pre-§5.90 count)
  function r3(v) { return v === null || v === undefined ? null : Math.round(Number(v) * 1000) / 1000; }
  function summarizeDb(q) {
    var rows = q(ROWS_SQL).map(function (r) { return [r[0], r[1]].concat(r.slice(2).map(r3)); }), tables = {};
    // §5.90: project_metadata's building_type is written only when the type is STATED (guide B2.2c's optional Accept all), so it is not counted: a tester who skips that optional step is not failed for it
    q(TABLES_SQL).forEach(function (t) { tables[t[0]] = Number((q('SELECT COUNT(*) FROM "' + t[0] + '"' + (t[0] === 'project_metadata' && !OLD_COUNT ? " WHERE key <> 'building_type'" : ''))[0] || [0])[0]); });
    return { rows: rows, tables: tables };
  }
  function multisetDiff(a, b) {
    var key = function (r) { return r.join('|'); }, m = {}, onlyB = [], onlyA = [];
    a.forEach(function (r) { m[key(r)] = (m[key(r)] || 0) + 1; });
    b.forEach(function (r) { var k = key(r); if (m[k]) m[k]--; else onlyB.push(r); });
    a.forEach(function (r) { var k = key(r); if (m[k] > 0) { onlyA.push(r); m[k]--; } });
    return { onlyA: onlyA, onlyB: onlyB };
  }
  function compareDb(tester, reference) {
    if (!tester) return { verdict: 'NOT GIVEN' };
    var d = multisetDiff(reference.rows, tester.rows), names = Object.keys(Object.assign({}, tester.tables, reference.tables)).sort();
    var tables = names.filter(function (k) { return tester.tables[k] !== reference.tables[k]; }).map(function (k) { return { table: k, reference: reference.tables[k], yours: tester.tables[k] }; });
    var ok = d.onlyA.length === 0 && d.onlyB.length === 0 && tables.length === 0 && tester.rows.length > 0;
    return { verdict: ok ? 'PASS' : 'FAIL', elements: tester.rows.length, reference: reference.rows.length, onlyReference: d.onlyA, onlyYours: d.onlyB, tables: tables };
  }
  // ── B2.9 / B3.1 lines read off the Viewer ── numbers compared without their digit grouping (96,839 = 96.839 = 96 839), words as given;
  //    cents (one cost basis, CAPEX_DASHBOARD.md §COST-ONE-BASIS): a decimal mark ',' before 1-2 digits reads as '.' (355,097.98 = 355.097,98)
  function normLine(s) { return String(s || '').replace(/\(\d+ instanced groups?\)\.?/i, '').replace(/(\d)[,.   ](?=\d{3}\b)/g, '$1').replace(/(\d),(\d{1,2})\b/g, '$1.$2').replace(/\s+/g, ' ').trim(); }
  function compareLine(expected, given, pick) {
    if (!given || !String(given).trim()) return { verdict: 'NOT GIVEN', expected: expected };
    var e = normLine(expected), g = normLine(given);
    if (pick) { var me = pick.exec(e), mg = pick.exec(g); e = me ? me[0] : e; g = mg ? mg[0] : null; }
    return { verdict: g !== null && e === g ? 'PASS' : 'FAIL', expected: expected, yours: given };
  }
  // B3.1: judged PER THE TESTER'S RATE PACK (prompts/CAPEX_DASHBOARD.md 2026-11-24 SPEC "the Run Checker judges B3.1 per the tester's rate pack").
  //   The line's first figure is `CUR amount` in the pricing currency of the pack the tester priced with; the bracket is display (it follows the language) but must be there.
  //   Expected = a table { pack: { currency, primary: 'CUR amount', ... } } MEASURED with the real Viewer (capex/tools/uat_measure_packs.js -> uat_packs.js); no pack name or figure lives in this file.
  var ELEMENTS = /SHED \d+ elements/, COST = /([A-Z]{2,4}) (\d+(?:\.\d{1,2})?)(?= \([A-Z]{2,4} \d+(?:\.\d{1,2})?\))/;
  // -> { table: {pack: {currency, primary, ...}}, variant } | { table: null, why } | null (no table at all).
  //   A VARIANT is one reference model (the Shed with one footing depth): the pack's manifest states its own B3.1 line, so the variant is the one whose measured figure that line names
  //   (or manifest.reference_variant when a pack says so). A re-based reference pack therefore needs no change here: its manifest line names the new variant.
  function packTable(manifest, inputs) {
    if (inputs.byPack) return { table: inputs.byPack, variant: 'given' };
    if (manifest.expected_by_pack) return { table: manifest.expected_by_pack, variant: 'manifest' };
    var doc = typeof UatPacks !== 'undefined' && UatPacks ? UatPacks : null;
    if (!doc && typeof module === 'object' && typeof require === 'function') { try { doc = require('./uat_packs.js'); } catch (e) { doc = null; } }
    if (!doc || !doc.variants) return null;
    var names = Object.keys(doc.variants), stated = /^([A-Z]{2,4} [\d,.\u00a0\u202f ]*\d)/.exec(String(manifest.expected['B3.1'] || '')), want = stated ? normLine(stated[1]) : null, v = manifest.reference_variant || null;
    if (!v) { var hit = names.filter(function (n) { return Object.keys(doc.variants[n].packs).some(function (p) { return normLine(doc.variants[n].packs[p].primary) === want; }); }); v = hit[0] || null; }
    if (!v || !doc.variants[v]) return { table: null, why: 'the reference table has no variant whose total is the pack\'s own B3.1 figure (' + (stated ? stated[1] : 'none stated') + '); variants: ' + names.join(', ') };
    return { table: doc.variants[v].packs, variant: v, label: doc.variants[v].label };
  }
  // -> { verdict, expected, yours, pack, reason }   pack = the pack(s) the line matched, or the pack the caller named
  function compareCost(manifest, line, tb, declared) {
    var table = tb && tb.table, variant = tb && tb.variant;
    var E = manifest.expected['B3.1'];
    if (!line || !String(line).trim()) return { verdict: 'NOT GIVEN', expected: E };
    if (tb && !table) return { verdict: 'INCONCLUSIVE', expected: E, yours: line, reason: tb.why };
    if (!tb)  // no table beside the comparer: the manifest's one line (the pre-2026-11-24 rule)
      return compareLine(E, line, /[A-Z]{2,4} \d+(\.\d{1,2})?(?= \([A-Z]{2,4} \d+(\.\d{1,2})?\))/);
    var g = COST.exec(normLine(line));
    if (!g) return { verdict: 'INCONCLUSIVE', expected: E, yours: line, reason: 'no readable "CUR amount (CUR amount)" in the line, so no rate pack can be told: nothing was judged' };
    var cur = g[1], amt = g[1] + ' ' + g[2], names = Object.keys(table);
    if (declared) {
      if (!table[declared]) return { verdict: 'INCONCLUSIVE', expected: E, yours: line, pack: declared, reason: 'the reference has no figures for the pack "' + declared + '": nothing was judged' };
      names = [declared];
    }
    var same = names.filter(function (n) { return table[n].currency === cur; });
    if (!same.length) {
      return { verdict: 'FAIL', expected: declared ? table[declared].primary : E, yours: line, pack: declared || null, variant: variant, reason: declared ? 'the pack ' + declared + ' prices in ' + table[declared].currency + ', your figure is in ' + cur : 'no rate pack of the reference prices in ' + cur };
    }
    var hit = same.filter(function (n) { return normLine(table[n].primary) === amt; });
    if (hit.length) return { verdict: 'PASS', expected: table[hit[0]].primary, yours: line, pack: hit.join(' or '), variant: variant };
    return { verdict: 'FAIL', expected: same.map(function (n) { return table[n].primary + ' (' + n + ')'; }).join(' or '), yours: line, pack: same.join(' or '), variant: variant, reason: 'your ' + cur + ' figure ' + g[2] + ' is not the reference total for ' + (same.length > 1 ? 'any of ' + same.join(', ') : same[0]) };
  }
  // ── the whole marking ── manifest = the pack's manifest.json; inputs = { marked: {name:text}|null, refMarked: {name:text}, db: summary|null, refDb: summary, viewerLine, costLine }
  function judge(manifest, inputs, deps) {
    var E = manifest.expected, rows = [];
    var m = inputs.marked && Object.keys(inputs.marked).length ? compareMarked(inputs.marked, inputs.refMarked, deps, manifest.exclude_tolerance) : { verdict: 'NOT GIVEN' };
    rows.push({ row: 'B0.9', stage: 'Marked sheets (Save marked copies)', expected: 'the pack\'s marked/ set, mark for mark', verdict: m.verdict, detail: m });
    var d = inputs.db ? compareDb(inputs.db, inputs.refDb) : { verdict: 'NOT GIVEN' };
    rows.push({ row: 'B2.8', stage: 'Viewer database (Export ▸ Viewer database)', expected: inputs.refDb ? inputs.refDb.rows.length + ' element rows, every table equal' : '—', verdict: d.verdict, detail: d });
    var v = compareLine(E['B2.9'], inputs.viewerLine, ELEMENTS); rows.push({ row: 'B2.9', stage: 'Viewer status line after Ctrl+O', expected: E['B2.9'], verdict: v.verdict, detail: v });
    var c = compareCost(manifest, inputs.costLine, packTable(manifest, inputs), inputs.pack); rows.push({ row: 'B3.1', stage: 'Find ▸ total cost (your rate pack)', expected: c.expected || E['B3.1'], verdict: c.verdict, detail: c });
    var given = rows.filter(function (r) { return r.verdict !== 'NOT GIVEN'; }), failed = given.filter(function (r) { return r.verdict === 'FAIL'; }), unjudged = given.filter(function (r) { return r.verdict === 'INCONCLUSIVE'; });
    return { format: 'capex-uat-result/1', pack: { built: manifest.built, commit: manifest.commit }, verdict: !given.length ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : unjudged.length ? 'INCONCLUSIVE' : given.length < rows.length ? 'PARTIAL PASS' : 'PASS', rows: rows };
  }
  return { FORMAT: FORMAT, readMarks: readMarks, sheetKey: sheetKey, compareMarked: compareMarked, ROWS_SQL: ROWS_SQL, summarizeDb: summarizeDb, multisetDiff: multisetDiff, compareDb: compareDb, normLine: normLine, compareLine: compareLine, compareCost: compareCost, judge: judge };
});
