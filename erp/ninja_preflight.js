// ninja_preflight.js — ADDITIVE safety layer for ninja_template.js (the engine itself is untouched; parity with the legacy plugin is unaffected).
//   preflight(model)  -> { errors:[], warnings:[] }   reports template faults the legacy flow only shows as silently wrong/blank output
//   selectOnly(exec)  -> executor that refuses anything but one SELECT/WITH statement (a Process sheet is SQL authored in Excel)
// Spec: prompts/NINJAEXCEL_TEMPLATE_ENGINE.md KERNEL PERMANENCE (1) safety, (2) template check.   Model = { SheetNames, Sheets } as built by ninja_template_xlsx.loadModel / SheetJS.
(function (g) {
  'use strict';
  var NEED = ['Input', 'Process', 'Output', 'BACKUP'];
  function cells(sh) { return Object.keys(sh || {}).filter(function (k) { return k[0] !== '!' && /^[A-Z]+\d+$/.test(k); }); }
  function val(c) { return !c || c.t === 'z' ? '' : (c.v == null ? '' : String(c.v)); }
  function rc(a) { var m = /^([A-Z]+)(\d+)$/.exec(a), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return { r: +m[2], c: c }; }
  function preflight(m) {
    var E = [], W = [], S = m.Sheets;
    NEED.forEach(function (n) { if (!S[n]) E.push('SHEET_MISSING ' + n + ' (a template needs ' + NEED.join(' / ') + ')'); });
    if (E.length) return { errors: E, warnings: W };
    var P = S.Process, I = S.Input, ann = {}, rows = {};
    cells(P).forEach(function (a) { var p = rc(a); if (p.r > 1) (rows[p.r] = rows[p.r] || {})[p.c] = P[a]; });
    Object.keys(rows).forEach(function (r) { var an = val(rows[r][1]); if (an) ann[an] = +r; });
    // 1. tag-looking Input cells that match no Process row (the silent "cell stays blank" fault)
    var used = {};
    cells(I).forEach(function (a) { var v = val(I[a]); if (!/^@.*@\d+$/.test(v)) return; if (ann[v] == null) E.push('UNMATCHED_TAG Input!' + a + ' "' + v + '" matches no Process row annotation - the cell would stay blank'); else used[v] = a; });
    // 2. Process rows that have a SELECT and are painted (Input cell found) but have no Direction
    Object.keys(rows).forEach(function (r) { var R = rows[r], an = val(R[1]), sel = val(R[3]), dir = val(R[8]).trim(); if (an && sel && used[an] && !dir) E.push('EMPTY_DIRECTION Process row ' + r + ' is linked from Input!' + used[an] + ' but Direction (col H) is empty - fill S, V, > or X+Y'); });
    // 3. duplicate annotations (two rows with the same SELECT text and row number cannot happen; same text different rows is fine) - none to check
    // 4. BACKUP-vs-Output drift: Output is discarded and re-cloned from BACKUP every run, so hand edits in Output are lost
    // FORMULAS only are compared: Output legitimately holds the previous run's data values
    // Row growth (`+` directions) legitimately inserts rows into Output and shifts every formula below them (W40 replay proved this on MOES cashflow: the saved Output equals BACKUP + growth).
    // So a formula comparison is only meaningful when Output and BACKUP have the SAME extent; otherwise say it cannot be judged (never a false alarm).
    function ext(sh) { var r = 0, c = 0; cells(sh).forEach(function (a) { var p = rc(a); if (p.r > r) r = p.r; if (p.c > c) c = p.c; }); return r + 'x' + c; }
    if (ext(S.Output) !== ext(S.BACKUP)) { W.push('DRIFT_NOT_CHECKABLE Output extent ' + ext(S.Output) + ' differs from BACKUP ' + ext(S.BACKUP) + ' (rows were inserted by a previous run, formulas shifted); hand edits cannot be told apart from growth'); }
    else {
      var seen = {}, drift = 0, list = [];
      cells(S.Output).concat(cells(S.BACKUP)).forEach(function (a) { if (seen[a]) return; seen[a] = 1; var o = S.Output[a], b = S.BACKUP[a]; if (((o && o.f) || '').replace(/\s+/g, '') !== ((b && b.f) || '').replace(/\s+/g, '')) { drift++; if (list.length < 5) list.push(a); } });
      if (drift) W.push('BACKUP_DRIFT ' + drift + ' formula(s) differ between Output and BACKUP (first: ' + list.join(', ') + '). Output is erased every run; make layout changes in BACKUP only');
    }
    return { errors: E, warnings: W };
  }
  function selectOnly(exec) {
    return function (sql) {
      var s = String(sql).trim().replace(/;+\s*$/, '');
      if (!/^(select|with)\b/i.test(s)) throw new Error('§SQL_REFUSED only SELECT is allowed in a template: ' + s.slice(0, 60));
      var q = s.replace(/'(?:[^']|'')*'/g, "''");                    // ignore quoted literals
      if (q.indexOf(';') >= 0) throw new Error('§SQL_REFUSED more than one statement: ' + s.slice(0, 60));
      if (/\b(insert|update|delete|drop|alter|create|truncate|attach|pragma|grant)\b/i.test(q)) throw new Error('§SQL_REFUSED write/DDL keyword in template SQL: ' + s.slice(0, 60));
      return exec(sql);
    };
  }
  // report(result, log) -> prints one §PREFLIGHT line per finding plus a summary line; returns true when there are no errors. Hosts call it on every run so the log always says what was judged.
  function report(res, log) { log = log || console.log; res.errors.forEach(function (e) { log('§PREFLIGHT ERROR ' + e); }); res.warnings.forEach(function (w) { log('§PREFLIGHT WARN ' + w); }); log('§PREFLIGHT_SUMMARY errors=' + res.errors.length + ' warnings=' + res.warnings.length + (res.errors.length ? ' - run refused' : ' - run allowed')); return res.errors.length === 0; }
  var api = { preflight: preflight, selectOnly: selectOnly, report: report };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.NinjaPreflight = api;
})(typeof window !== 'undefined' ? window : globalThis);
