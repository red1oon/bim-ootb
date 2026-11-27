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
  // timed(exec, log, opts) -> executor that logs one §SQL_MS line per statement and a §SQL_SUMMARY (statements / distinct / duplicates / total ms) via summary().
  // opts.slowMs=N flags any statement over N ms (§SQL_SLOW #n ms sql-head) and a statement the DB cancelled for timeout (§SQL_SLOW ... TIMEOUT, then rethrown); verdict() -> PASS / FAIL(slow>0) / INCONCLUSIVE(no statement judged).
  // opts.memo=true answers a repeated IDENTICAL statement from this run's first result (read-only SQL, same text => same rows; templates repeat ~22% of their statements). Off by default.
  function timed(exec, log, opts) {
    opts = opts || {}; log = log || function () {}; var st = { n: 0, dup: 0, ms: 0, saved: 0, seen: {}, slow: 0, timeouts: 0 }; var head = function (q) { return String(q).replace(/\s+/g, ' ').slice(0, 160); };
    var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
    var f = function (sql) {
      var key = String(sql); st.n++; var dup = st.seen[key]; if (dup) st.dup++;
      if (opts.memo && dup && dup.rows) { st.saved += dup.ms; log('§SQL_MS #' + st.n + ' ms=0 rows=' + dup.rows.length + ' MEMO(first=' + dup.ms.toFixed(1) + 'ms)'); return dup.rows; }
      var t0 = now(), rows; try { rows = exec(sql); } catch (e) { if (/timeout|canceling statement/i.test(String(e && e.message))) { st.slow++; st.timeouts++; log('§SQL_SLOW #' + st.n + ' TIMEOUT after ms=' + (now() - t0).toFixed(1) + ' ' + head(sql)); } throw e; } var ms = now() - t0; st.ms += ms;
      if (opts.slowMs && ms > opts.slowMs) { st.slow++; log('§SQL_SLOW #' + st.n + ' ms=' + ms.toFixed(1) + ' limit=' + opts.slowMs + ' ' + head(sql)); } if (!dup) st.seen[key] = { rows: rows, ms: ms };
      log('§SQL_MS #' + st.n + ' ms=' + ms.toFixed(1) + ' rows=' + (rows ? rows.length : 0) + (dup ? ' DUPLICATE' : '')); return rows;
    };
    f.summary = function () { var d = Object.keys(st.seen).length; var line = '§SQL_SUMMARY statements=' + st.n + ' distinct=' + d + ' duplicates=' + st.dup + ' totalMs=' + st.ms.toFixed(1) + (opts.slowMs ? ' slow=' + st.slow : '') + (opts.memo ? ' memoSavedMs=' + st.saved.toFixed(1) : ''); log(line); return { statements: st.n, distinct: d, duplicates: st.dup, totalMs: st.ms, memoSavedMs: st.saved }; };
    f.verdict = function () { var v = st.slow ? 'FAIL' : st.n ? 'PASS' : 'INCONCLUSIVE'; log('§SLOW_GUARD_VERDICT ' + v + ' statements=' + st.n + ' slow=' + st.slow + ' timeouts=' + st.timeouts + ' limitMs=' + (opts.slowMs || 0)); return v; };
    return f;
  }
  var api = { preflight: preflight, selectOnly: selectOnly, report: report, timed: timed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.NinjaPreflight = api;
})(typeof window !== 'undefined' ? window : globalThis);
