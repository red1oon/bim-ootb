// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2gapguide.js — the Gap Guide (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D110). Pure, Node + browser. Rules and arithmetic, no AI: same input, same bytes.
// A set's own register says which sheets exist. The table `guide.gap_sheets.needs` (element_defaults.json, the user's to edit) says which title words might answer each gap or declared limit.
// The guide names only a sheet the register holds, and says it might help, never that it will. Held = its number is a @SHEETNO of this set.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ BM: require('./dxf2beams.js') });
  else root.Dxf2GapGuide = factory({ BM: root.Dxf2Beams });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var clean = D.BM.parts.clean, HEAD = /^(?:SHEET|DRAWING)\s+(?:NUMBER|NO\.?)$/i, NUM = /^[A-Z]{1,3}-?\d{1,4}[A-Z]?(?:\s*\([A-Z0-9]+\))?$/, TOTAL = /\btotal\s*:?\s*(\d+)$/i, LIST_WORDS = /^(?:(?:DRAWING|SHEET)S? (?:LIST|REGISTER|INDEX)\b|(?:LIST|INDEX) OF (?:DRAWINGS|SHEETS)$)/i, MARK = /^[\u25cf\u2022]$/, LEGEND = /\bBLANK FIELDS?\b/i;
  var plainNo = function (n) { return String(n).replace(/\s*\(.*$/, ''); };
  var textsOf = function (s) { return ((s.dxf && s.dxf.entities) || []).filter(function (e) { return e.type === 'TEXT' || e.type === 'MTEXT'; }).map(function (e) { var q = e.position || e.startPoint || {}; return { t: clean(e.text), x: q.x, y: q.y, handle: String(e.handle || '') }; }); };
  // G6d the one test of a sheet that holds a drawing list: the words and a number header together. PR-VIEW uses it too.
  function isListSheet(sh) { var T = textsOf(sh); return T.some(function (q) { return HEAD.test(q.t); }) && T.some(function (q) { return LIST_WORDS.test(q.t); }); }
  // G1 a register is the column under a number header, on a sheet read as a drawing. A number's title is the nearest text to its right on its row; the row height is the column's own spacing.
  function readRegister(sheets, o) {
    var minRows = (o && o.min_rows) || 3, rows = [], registers = [], seen = {};
    (sheets || []).filter(function (s) { return s.role === 'drawing' || (o && o.any_list && isListSheet(s)); }).slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }).forEach(function (sh) {
      var T = textsOf(sh), heads = T.filter(function (q) { return HEAD.test(q.t); }).sort(function (a, b) { return a.x - b.x; }), one = { sheet: sh.name, rows: 0, stated_total: null, agrees: null };
      heads.forEach(function (h, i) {
        var right = heads[i + 1] ? heads[i + 1].x : Infinity, left = i ? heads[i - 1].x : -Infinity, below = T.filter(function (q) { return q.y < h.y && NUM.test(q.t) && q.x < right && q.x > left; }), cols = {};
        below.forEach(function (q) { var c = Math.round(q.x); (cols[c] = cols[c] || []).push(q); });
        var keys = Object.keys(cols).map(Number).sort(function (a, b) { return Math.abs(a - h.x) - Math.abs(b - h.x) || a - b; }), key = keys.filter(function (c) { return cols[c].length >= minRows; })[0]; if (key === undefined) return;
        // G6b a column of marks under a heading is a revision column; it speaks only with the sheet's own legend
        var hasLegend = T.some(function (o2) { return LEGEND.test(o2.t); }), firstY = Math.max.apply(null, cols[key].map(function (q) { return q.y; })), mx = {}; T.forEach(function (o2) { if (MARK.test(o2.t) && o2.x > h.x && o2.x < right && o2.y <= firstY) mx[Math.round(o2.x)] = 1; });
        var revCols = Object.keys(mx).map(Number).sort(function (a, b) { return a - b; }).map(function (x) { var head = T.filter(function (o2) { return Math.round(o2.x) === x && o2.y > firstY && !MARK.test(o2.t); }).sort(function (a, b) { return a.y - b.y; })[0]; return { x: x, label: head ? head.t : String(x) }; });
        var col = cols[key].slice().sort(function (a, b) { return b.y - a.y; }), pitch = col.slice(1).map(function (q, n) { return col[n].y - q.y; }).filter(function (g) { return g > 0; }).sort(function (a, b) { return a - b; })[0], tolY = pitch / 2, n = 0;
        col.forEach(function (q) {
          var title = T.filter(function (o2) { return o2 !== q && Math.abs(o2.y - q.y) < tolY && o2.x > q.x && o2.x < right && /[A-Za-z]/.test(o2.t) && !NUM.test(o2.t); }).sort(function (a, b) { return a.x - b.x; })[0];
          if (seen[q.t]) return; seen[q.t] = 1; n++;
          var issued = revCols.filter(function (c) { return T.some(function (o2) { return MARK.test(o2.t) && Math.round(o2.x) === c.x && Math.abs(o2.y - q.y) < tolY; }); }).map(function (c) { return c.label; });
          var hd = T.filter(function (o2) { return Math.round(o2.x) === key && o2.y > q.y && o2.y < h.y && !NUM.test(o2.t) && /[A-Za-z]/.test(o2.t) && !TOTAL.test(o2.t); }).sort(function (a, b) { return a.y - b.y; })[0];
          rows.push({ heading: hd ? hd.t : null, no: q.t, base: plainNo(q.t), title: title ? title.t : '', sheet: sh.name, handle: q.handle, x: q.x, y: q.y, h: pitch, issued: issued, marks_read: hasLegend && revCols.length > 0 });
        });
        var tot = T.filter(function (o2) { return Math.round(o2.x) === key && TOTAL.test(o2.t); }).map(function (o2) { return Number(TOTAL.exec(o2.t)[1]); })[0];
        one.rows += n; if (tot !== undefined) one.stated_total = tot;
      });
      var mine = rows.filter(function (r) { return r.sheet === sh.name && r.marks_read; }), allM = {}; mine.forEach(function (r) { r.issued.forEach(function (l) { allM[l] = 1; }); }); var labs = Object.keys(allM).sort();
      one.latest = labs.length ? labs[labs.length - 1] : null; one.legend = mine.length ? (T.filter(function (o2) { return LEGEND.test(o2.t); })[0] || {}).t || null : null;
      rows.filter(function (r) { return r.sheet === sh.name; }).forEach(function (r) { r.latest = one.latest; });
      if (one.rows) { one.agrees = one.stated_total === null ? null : one.stated_total === one.rows; registers.push(one); }   // a total counts the whole table, however many columns it runs to
    });
    return { rows: rows, registers: registers };
  }
  var wordsOf = function (t) { return String(t).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean); };
  var phraseIn = function (phrase, words) { return wordsOf(phrase).every(function (w) { return words.indexOf(w) >= 0; }); };
  // G2 how much of each need the run has. A gap: its rows. A limit: counted from the run alone.
  var LIMITS = {
    'limit:wall_top': function (r) { return r.els.filter(function (e) { return e.class === 'IfcWall' && e.height_source !== 'elevation'; }).length; },
    'limit:wall_type': function (r) { return r.els.filter(function (e) { return e.class === 'IfcWall' && !(e.size && e.size.type); }).length; },
    'limit:roof_edge': function (r) { return r.report && r.report.roof && r.report.roof.spots ? 1 : 0; },
    'limit:stair_short': function (r) { var s = r.report && r.report.stairs && r.report.stairs.short_m; return s ? Object.keys(s).filter(function (k) { return s[k] > 0; }).length : 0; },
    'limit:glazing': function (r) { return r.els.filter(function (e) { return e.class === 'IfcCurtainWall'; }).length; },
    'limit:pad_thickness': function (r) { return r.els.filter(function (e) { return e.class === 'IfcFooting' && e.thick_source === 'default'; }).length; }
  };
  function countOf(res, need) {
    if (LIMITS[need]) return LIMITS[need]({ els: res.els || [], report: res.report });
    return (res.gaps || []).filter(function (g) { return g.code === need; }).length;
  }
  // G3 rows { need, count, sheets: [{ no, title, held }] }. Register order within a row; needs in sorted order.
  function guide(res, register, held, needs, o) {
    var rows = [], hasReg = register && register.rows && register.rows.length > 0, ask = {}, inHand = {};
    Object.keys(needs || {}).sort().forEach(function (need) {
      var n = countOf(res, need); if (!n) return;
      var sheets = !hasReg ? [] : register.rows.filter(function (r) { var w = wordsOf(r.title); return (needs[need] || []).some(function (p) { return phraseIn(p, w); }); }).map(function (r) { var h = !!(held && held[r.base]); (h ? inHand : ask)[r.no] = r.title; var row = { no: r.no, title: r.title, held: h }; if (h && held[r.base] === 'aside') row.read = false; return row; });
      rows.push({ need: need, count: n, sheets: sheets });
    });
    var refused = !!(o && o.refused), status = !hasReg ? 'INCONCLUSIVE' : refused ? 'INCONCLUSIVE' : 'read', reason = !hasReg ? 'no register in this set: no sheet can be named' : refused ? 'the set is refused: nothing judged' : null;
    var regRows = hasReg ? register.rows : [], isHeld = function (r) { return !!(held && held[r.base]); }, saysOf = function (r) { return !r.marks_read || !r.latest ? 'no_statement' : r.issued.indexOf(r.latest) >= 0 ? 'issued_not_loaded' : 'not_issued'; };
    var missingList = regRows.filter(function (r) { return !isHeld(r); }).map(function (r) { return { no: r.no, title: r.title, says: saysOf(r), latest: r.latest || null, issued: r.issued || [], heading: r.heading || null, sheet: r.sheet, handle: r.handle, x: r.x, y: r.y, h: r.h }; });
    var nSays = function (k) { return missingList.filter(function (r) { return r.says === k; }).length; }, counts = hasReg ? { listed: regRows.length, loaded: regRows.length - missingList.length, missing: missingList.length, not_issued: nSays('not_issued'), issued_not_loaded: nSays('issued_not_loaded'), no_statement: nSays('no_statement') } : null;
    return { counts: counts, missing_list: missingList, status: status, reason: reason, says: 'might help', registers: hasReg ? register.registers : [], register_rows: hasReg ? register.rows.length : 0, rows: refused ? [] : rows,
      ask: refused ? [] : Object.keys(ask).sort().map(function (k) { return { no: k, title: ask[k] }; }), held: refused ? [] : Object.keys(inHand).sort().map(function (k) { return { no: k, title: inHand[k] }; }), set_aside: refused ? [] : (res.gaps || []).filter(function (g) { return g.code === 'GAP:sheet_set_aside'; }).map(function (g) { return { sheet: g.sheet, why: g.detail }; }).sort(function (a, b) { return a.sheet < b.sheet ? -1 : 1; }) };
  }
  function heldOf(sheets) { var h = {}; (sheets || []).forEach(function (s) { var n = s.desc && s.desc.sheetno; if (!n) return; h[n] = !s.role && h[n] !== 1 ? 'aside' : 1; }); return h; }   // a sheet held but set aside is in hand and not read
  // what the judge calls. off = null. No yellow row without a register, so a set that holds none keeps its rows.
  function run(sheets, res, DF, o) {
    if (!DF || !DF.has('guide.gap_sheets') || String(DF.get('guide.gap_sheets')) !== 'read') return null;
    var m = DF.meta('guide.gap_sheets') || {}, reg = readRegister(sheets, { min_rows: m.min_rows });
    if (reg.rows.length) DF.use('guide.gap_sheets');
    return addWhere(guide(res, reg, heldOf(sheets), m.needs || {}, o), sheets, res);
  }
  // G6d before any gate: what the lists say, from raw sheets. held: { number: 1 } from the sheets' own numbers. Gaps not judged.
  function fromRaw(sheets, held, o) {
    var reg = readRegister(sheets, { min_rows: o && o.min_rows, any_list: true }), g = guide({ gaps: [], els: [] }, reg, held, {}, { refused: 1 }); g.reason = reg.rows.length ? 'no gate has judged this set yet' : g.reason; return g;
  }
  // G6f where a missing sheet is called up, from a real spot on a loaded plan, and what its title names that the set already holds. Read, never guessed: no match, no place.
  var NOIN = /(?:^|[^A-Za-z0-9.-])([A-Z]{1,3}-\d{1,4})(?![0-9A-Za-z])/g, STOREY = /\b(LEVEL\s*0?\d+|GROUND)\b/i, normStorey = function (q) { return q.toUpperCase().replace(/\s+/g, ' ').replace('LEVEL 0', 'LEVEL '); };
  function addWhere(g, sheets, res) {
    if (!g || !g.missing_list || !g.missing_list.length) return g;
    var plans = (sheets || []).filter(function (s) { return s.role === 'plan'; }), byNo = {}, lv = {}; g.missing_list.forEach(function (m) { m.pointers = []; (byNo[plainNo(m.no)] = byNo[plainNo(m.no)] || []).push(m); });
    plans.forEach(function (ps) {
      textsOf(ps).forEach(function (q) { var m; NOIN.lastIndex = 0; while ((m = NOIN.exec(q.t))) { (byNo[m[1]] || []).forEach(function (r) { r.pointers.push({ sheet: ps.name, x: q.x, y: q.y, handle: q.handle, level: ps.level }); }); } });
      var nm = ps.desc && ps.desc.name, st = nm && STOREY.exec(nm); if (st) { var k = normStorey(st[1]); (lv[k] = lv[k] || {})[ps.level] = 1; }
    });
    var built = {}; Object.keys((res && res.report && res.report.stairs && res.report.stairs.short_m) || {}).forEach(function (k) { built[k.split('@')[0].toUpperCase()] = 1; });
    g.missing_list.forEach(function (r) { var t = String(r.title).toUpperCase(), st = STOREY.exec(t), k = st && normStorey(st[1]), lvs = k && lv[k] ? Object.keys(lv[k]) : []; if (lvs.length === 1) r.place = { storey: k, level: Number(lvs[0]) }; Object.keys(built).forEach(function (n) { if (t.indexOf(n) >= 0) r.place = Object.assign({}, r.place, { stair: n }); }); });
    return g;
  }
  function logLines(g) {
    if (!g) return [];
    var L = g.registers.map(function (r) { return '§REGISTER sheet=' + r.sheet + ' rows=' + r.rows + ' stated_total=' + r.stated_total + ' agrees=' + r.agrees + ' latest=' + r.latest + ' legend=' + !!r.legend; });
    if (g.counts) L.push('§GAPGUIDE listed=' + g.counts.listed + ' loaded=' + g.counts.loaded + ' missing=' + g.counts.missing + ' not_issued=' + g.counts.not_issued + ' issued_not_loaded=' + g.counts.issued_not_loaded + ' no_statement=' + g.counts.no_statement);
    L.push('§GAPGUIDE ' + g.status + (g.reason ? ' (' + g.reason + ')' : '') + ' register_rows=' + g.register_rows + ' needs=' + g.rows.length + ' ask=' + g.ask.length + ' held=' + g.held.length + ' set_aside=' + g.set_aside.length);
    g.rows.forEach(function (r) { L.push('§GAPGUIDE ' + r.need + ' count=' + r.count + ' might_help=' + r.sheets.map(function (s) { return s.no + (s.read === false ? ':set_aside' : s.held ? ':held' : ':missing'); }).join(',')); });
    return L;
  }
  return { addWhere: addWhere, LIST_WORDS: LIST_WORDS, isListSheet: isListSheet, fromRaw: fromRaw, readRegister: readRegister, guide: guide, run: run, heldOf: heldOf, logLines: logLines, countOf: countOf };
});
