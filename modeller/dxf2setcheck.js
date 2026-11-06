// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2setcheck.js — what a drawing set says about itself (prompts/DXF2BIM_ARCHITECT_REVIEW.md §D112). Pure, Node + browser. Rules and arithmetic, no AI.
// Reads only: nothing is modelled, nothing is decided for the author. Three questions, each on the set's own words:
//   sheets    the register lists it and it is not here: does the list say it was re-issued in this revision? (G6c: a revision package holds what changed; an older sheet is not "missing")
//   repeated  one tag printed on two rows, with different contents
//   sums      a printed relation between columns that does not hold (a rule row names the columns; no rule, no judgement)
// check(groups, o) groups = [{ name, sheets: [{ name, role, dxf, desc? }] }] -> { groups: [{ name, sheets, repeated, sums, truncated }], totals, status }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ T: require('./dxf2tables.js'), G: require('./dxf2gapguide.js'), REF: require('./element_defaults.json') });
  else root.Dxf2SetCheck = factory({ T: root.Dxf2Tables, G: root.Dxf2GapGuide, REF: null });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  var KEY = /(?:^|[\s/])(?:NO\.?|NUMBER|MARK|TAG)$/i, SHEETKEY = /^(?:SHEET|DRAWING)\s+(?:NUMBER|NO\.?)$/i, REV = /REV/i;
  // the rules are rows of element_defaults.json check.set: which columns, what must hold, the printed rounding as tolerance. Headings are patterns there, in plain text.
  function rulesOf(o) {
    var row = (o && o.ref ? o.ref : D.REF || { defaults: {} }).defaults['check.set']; if (o && o.rules) return o.rules; if (!row || row.value === 'off') return [];
    var rx = function (s) { return new RegExp(s, 'i'); };
    return row.rules.map(function (r) { var q = Object.assign({}, r); ['total', 'a', 'b', 'c'].forEach(function (k) { if (q[k]) q[k] = rx(q[k]); }); if (q.parts) q.parts = q.parts.map(rx); return q; });
  }
  function num(t) { var m = /[-+]?\d+(?:\.\d+)?/.exec(String(t || '').replace(/,/g, '')); return m ? parseFloat(m[0]) : null; }
  function col(cols, rx) { for (var i = 0; i < cols.length; i++) if (rx.test(cols[i])) return i; return -1; }
  function heldNames(sheets) { return (sheets || []).map(function (s) { return s.name; }); }
  function isHeld(no, names, heldBy) { if (heldBy && heldBy[no]) return true; var esc = String(no).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), re = new RegExp('(^|[^A-Za-z0-9])' + esc + '([^A-Za-z0-9]|$)'); return names.some(function (n) { return re.test(n); }); }
  // the register's own revision column, where it prints one: sheet number -> revision text
  function revColumns(tables) {
    var revs = {}, found = false;
    tables.forEach(function (t) { var k = col(t.columns, SHEETKEY), r = col(t.columns, REV); if (k < 0 || r < 0) return; found = true; t.rows.forEach(function (R) { if (R.cells[k] && R.cells[r]) revs[R.cells[k].replace(/\s*\(.*$/, '')] = R.cells[r]; }); });
    return found ? revs : null;
  }
  function sheetsOf(g, tables) {
    var names = heldNames(g.sheets), reg = D.G.readRegister(g.sheets, { any_list: true }), revs = revColumns(tables), heldBy = D.G.heldOf(g.sheets);
    if (!reg.rows.length) return { listed: 0, status: 'INCONCLUSIVE', reason: 'no register read in this group', absent: [] };
    var nums = revs ? Object.keys(revs).map(function (k) { return num(revs[k]); }).filter(function (v) { return v !== null; }) : [], top = nums.length ? Math.max.apply(null, nums) : null, absent = [], held = 0;
    reg.rows.forEach(function (r) {
      if (isHeld(r.base, names, heldBy)) { held++; return; }
      var says = 'no_statement', rev = revs && revs[r.base] !== undefined ? revs[r.base] : null, basis = null;
      if (r.marks_read && r.latest) { says = r.issued.indexOf(r.latest) >= 0 ? 'current_but_absent' : 'not_reissued'; rev = r.issued.join(','); basis = 'issue marks'; }
      else if (rev !== null && top !== null) { says = num(rev) < top ? 'not_reissued' : 'current_but_absent'; basis = 'revision column'; }
      absent.push({ no: r.no, title: r.title, rev: rev, says: says, basis: basis, heading: r.heading || null });
    });
    var n = function (k) { return absent.filter(function (a) { return a.says === k; }).length; };
    return { listed: reg.rows.length, held: held, absent: absent, not_reissued: n('not_reissued'), current_but_absent: n('current_but_absent'), no_statement: n('no_statement'), status: 'read' };
  }
  function repeatedOf(t, sheet) {
    var k = -1; for (var i = 0; i < t.columns.length && k < 0; i++) if (KEY.test(t.columns[i].trim())) k = i;
    if (k < 0) return { judged: 0, rows: [] };
    var seen = {}, judged = 0;
    t.rows.forEach(function (R) { var v = R.cells[k]; if (!v || R.filled[k]) return; judged++; (seen[v] = seen[v] || []).push(R); });
    return { judged: judged, rows: Object.keys(seen).filter(function (v) { var L = seen[v]; return L.length > 1 && L.some(function (R) { return R.cells.join('|') !== L[0].cells.join('|'); }); }).map(function (v) { return { sheet: sheet, column: t.columns[k], key: v, rows: seen[v].map(function (R) { return R.cells.filter(Boolean).slice(1, 8).join(', '); }) }; }) };
  }
  function sumsOf(t, sheet, rules) {
    var out = [];
    rules.forEach(function (ru) {
      var judged = 0, off = [];
      if (ru.kind === 'run_sum') {
        var P = ru.parts.map(function (x) { return col(t.columns, x); }), L = col(t.columns, ru.total); if (L < 0 || P.some(function (i) { return i < 0; })) return;
        var runs = [], open = {};   // rows sharing one merged total are one feeder; an unmerged total stands alone, whatever its neighbour prints
        t.rows.forEach(function (R) {
          var tot = num(R.cells[L]); if (tot === null || tot <= 0) return;
          var id = R.run[L], s = P.reduce(function (a, i) { return a + (num(R.cells[i]) || 0); }, 0), name = R.cells.slice(0, Math.min.apply(null, P)).filter(Boolean).slice(0, 2).join(' ');
          if (id && open[id]) open[id].sum += s; else { var r = { text: R.cells[L], total: tot, name: name, sum: s }; runs.push(r); if (id) open[id] = r; }
        });
        runs.forEach(function (r) { judged++; if (Math.abs(r.sum - r.total) > Math.max(ru.tol_abs, ru.tol_rel * r.total)) off.push({ row: r.name, found: Number(r.sum.toFixed(3)), printed: r.text }); });
      } else if (ru.kind === 'difference') {
        var a = col(t.columns, ru.a), b = col(t.columns, ru.b), c = col(t.columns, ru.c); if (a < 0 || b < 0 || c < 0) return;
        t.rows.forEach(function (R) { var x = num(R.cells[a]), y = num(R.cells[b]), z = num(R.cells[c]); if (x === null || y === null || z === null) return; judged++; if (Math.abs(x - y - z) > ru.tol_abs) off.push({ row: R.cells[0], found: Number((x - y).toFixed(3)), printed: R.cells[c] }); });
      }
      if (judged) out.push({ rule: ru.id, says: ru.says, sheet: sheet, judged: judged, off: off });
    });
    return out;
  }
  function check(groups, o) {
    var rules = rulesOf(o), totals = { listed: 0, held: 0, not_reissued: 0, current_but_absent: 0, no_statement: 0, tables: 0, keys_judged: 0, repeated: 0, sums_judged: 0, sums_off: 0, truncated: 0 };
    var out = (groups || []).map(function (g) {
      var tables = [], repeated = [], sums = [], truncated = [];
      g.sheets.forEach(function (sh) {
        var read = D.T.read(sh);
        read.tables.forEach(function (t) {
          tables.push(t); totals.tables++;
          var rp = repeatedOf(t, sh.name); totals.keys_judged += rp.judged; repeated = repeated.concat(rp.rows);
          sums = sums.concat(sumsOf(t, sh.name, rules));
          t.rows.forEach(function (R) { R.cells.forEach(function (c, i) { if (/\.\.\.$/.test(c)) truncated.push({ sheet: sh.name, column: t.columns[i], text: c }); }); });
        });
      });
      var sheets = sheetsOf(g, tables);
      if (sheets.status === 'read') ['listed', 'held', 'not_reissued', 'current_but_absent', 'no_statement'].forEach(function (k) { totals[k] += sheets[k]; });
      totals.repeated += repeated.length; totals.truncated += truncated.length;
      sums.forEach(function (s) { totals.sums_judged += s.judged; totals.sums_off += s.off.length; });
      return { name: g.name, sheets: sheets, repeated: repeated, sums: sums, truncated: truncated };
    });
    var status = totals.listed || totals.keys_judged || totals.sums_judged ? 'read' : 'INCONCLUSIVE';
    console.log('§SETCHECK ' + status + ' groups=' + out.length + ' listed=' + totals.listed + ' held=' + totals.held + ' not_reissued=' + totals.not_reissued + ' current_but_absent=' + totals.current_but_absent + ' no_statement=' + totals.no_statement + ' tables=' + totals.tables + ' keys_judged=' + totals.keys_judged + ' repeated=' + totals.repeated + ' sums_judged=' + totals.sums_judged + ' sums_off=' + totals.sums_off + ' truncated=' + totals.truncated);
    return { groups: out, totals: totals, status: status };
  }
  return { check: check };
});
