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
  // ── B0.9 marked sheets ── a mark = its text without the @BY suffix + its insertion point to 0.01 drawing units
  function readMarks(text, DxfParser, Dxf2Marks) {
    var dxf = new DxfParser().parseSync(text);
    return Dxf2Marks.readMarks(dxf.entities).map(function (m) { return { t: m.raw.replace(/\s+@BY=\S+$/, ''), x: Number(m.x.toFixed(2)), y: Number(m.y.toFixed(2)) }; });
  }
  function sheetKey(name) { return String(name).split(/[\\/]/).pop().replace(/\.dxf$/i, '').replace(/_marked$/i, ''); }
  // tester / reference: { fileName: dxfText }. Rules (§5.84): every mark equal (text + position) except @BODYZ (one statement for the set, compared over the set)
  // and @EXCLUDE (a drag: its box must lie inside tol = { x0:[lo,hi], x1:[lo,hi], y0max, y1min } on the sheet that holds it)
  function compareMarked(tester, reference, deps, tol) {
    var T = {}, R = {}, diffs = [], exclude = [], bzT = [], bzR = [];
    Object.keys(tester).forEach(function (n) { T[sheetKey(n)] = tester[n]; });
    Object.keys(reference).forEach(function (n) { R[sheetKey(n)] = reference[n]; });
    var names = Object.keys(R).sort(), missing = names.filter(function (n) { return !T[n]; }), extra = Object.keys(T).filter(function (n) { return !R[n]; });
    var special = function (m) { return /^@(EXCLUDE|BODYZ)=/.test(m.t); }, K = function (m) { return m.t + ' @' + m.x + ',' + m.y; };
    names.forEach(function (n) {
      if (!T[n]) return;
      var a = readMarks(T[n], deps.DxfParser, deps.Dxf2Marks), b = readMarks(R[n], deps.DxfParser, deps.Dxf2Marks);
      var ka = a.filter(function (m) { return !special(m); }).map(K).sort(), kb = b.filter(function (m) { return !special(m); }).map(K).sort();
      ka.filter(function (x) { return kb.indexOf(x) < 0; }).forEach(function (x) { diffs.push(n + ': extra ' + x); });
      kb.filter(function (x) { return ka.indexOf(x) < 0; }).forEach(function (x) { diffs.push(n + ': missing ' + x); });
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
    return { verdict: !judged ? 'NOT GIVEN' : diffs.length ? 'FAIL' : 'PASS', sheets: judged, of: names.length, extra: extra, diffs: diffs, exclude: exclude };
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
  // ── B2.9 / B3.1 lines read off the Viewer ── numbers compared without their digit grouping (96,839 = 96.839 = 96 839), words as given
  function normLine(s) { return String(s || '').replace(/\(\d+ instanced groups?\)\.?/i, '').replace(/(\d)[,.   ](?=\d{3}\b)/g, '$1').replace(/\s+/g, ' ').trim(); }
  function compareLine(expected, given, pick) {
    if (!given || !String(given).trim()) return { verdict: 'NOT GIVEN', expected: expected };
    var e = normLine(expected), g = normLine(given);
    if (pick) { var me = pick.exec(e), mg = pick.exec(g); e = me ? me[0] : e; g = mg ? mg[0] : null; }
    return { verdict: g !== null && e === g ? 'PASS' : 'FAIL', expected: expected, yours: given };
  }
  var ELEMENTS = /SHED \d+ elements/, COST = /[A-Z]{2,4} \d+ \([A-Z]{2,4} \d+\)/;
  // ── the whole marking ── manifest = the pack's manifest.json; inputs = { marked: {name:text}|null, refMarked: {name:text}, db: summary|null, refDb: summary, viewerLine, costLine }
  function judge(manifest, inputs, deps) {
    var E = manifest.expected, rows = [];
    var m = inputs.marked && Object.keys(inputs.marked).length ? compareMarked(inputs.marked, inputs.refMarked, deps, manifest.exclude_tolerance) : { verdict: 'NOT GIVEN' };
    rows.push({ row: 'B0.9', stage: 'Marked sheets (Save marked copies)', expected: 'the pack\'s marked/ set, mark for mark', verdict: m.verdict, detail: m });
    var d = inputs.db ? compareDb(inputs.db, inputs.refDb) : { verdict: 'NOT GIVEN' };
    rows.push({ row: 'B2.8', stage: 'Viewer database (Export ▸ Viewer database)', expected: inputs.refDb ? inputs.refDb.rows.length + ' element rows, every table equal' : '—', verdict: d.verdict, detail: d });
    var v = compareLine(E['B2.9'], inputs.viewerLine, ELEMENTS); rows.push({ row: 'B2.9', stage: 'Viewer status line after Ctrl+O', expected: E['B2.9'], verdict: v.verdict, detail: v });
    var c = compareLine(E['B3.1'], inputs.costLine, COST); rows.push({ row: 'B3.1', stage: 'Find ▸ total cost (shipped rates)', expected: E['B3.1'], verdict: c.verdict, detail: c });
    var given = rows.filter(function (r) { return r.verdict !== 'NOT GIVEN'; }), failed = given.filter(function (r) { return r.verdict === 'FAIL'; });
    return { format: 'capex-uat-result/1', pack: { built: manifest.built, commit: manifest.commit }, verdict: !given.length ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : given.length < rows.length ? 'PARTIAL PASS' : 'PASS', rows: rows };
  }
  return { FORMAT: FORMAT, readMarks: readMarks, sheetKey: sheetKey, compareMarked: compareMarked, ROWS_SQL: ROWS_SQL, summarizeDb: summarizeDb, multisetDiff: multisetDiff, compareDb: compareDb, normLine: normLine, compareLine: compareLine, judge: judge };
});
