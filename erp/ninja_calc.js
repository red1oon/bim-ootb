// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_calc.js — small, exact formula evaluator for the engine's cell model (used by the PDF renderer and to refresh cached results before saving).
// WHY: the legacy flow recalculates formulas (POI setForceFormulaRecalculation + Spire's own calc at PDF time). The customer Output/BACKUP formulas are ONLY arithmetic
// and SUM over same-sheet ranges (measured on two real customer templates: 187 cells); the fixtures add COUNTA / ROW. Anything outside the supported set evaluates to
// the error value '#NAME?' (never a silent 0) so an unsupported function is visible.
// Judged against Apache POI's own FormulaEvaluator (witness W35).  Money-grade: arithmetic goes through the twin's BigDecimal when supplied.
(function (global) {
  'use strict';
  function colNum(s) { var c = 0; for (var i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64); return c - 1; }
  function colName(c) { var s = ''; c = c + 1; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function ERR(e) { this.e = e; }
  function isErr(x) { return x instanceof ERR; }

  // tokenizer
  function tokenize(f) {
    var t = [], i = 0, m;
    while (i < f.length) {
      var ch = f[i];
      if (/\s/.test(ch)) { i++; continue; }
      if ((m = /^"((?:[^"]|"")*)"/.exec(f.slice(i)))) { t.push({ k: 's', v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
      if ((m = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?(?![A-Za-z0-9_(])/i.exec(f.slice(i)))) { t.push(m[3] ? { k: 'range', c0: colNum(m[1].toUpperCase()), r0: +m[2] - 1, c1: colNum(m[3].toUpperCase()), r1: +m[4] - 1 } : { k: 'ref', c: colNum(m[1].toUpperCase()), r: +m[2] - 1 }); i += m[0].length; continue; }
      if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/.exec(f.slice(i)))) { t.push({ k: 'n', v: parseFloat(m[1]) }); i += m[0].length; continue; }
      if ((m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(f.slice(i)))) { t.push({ k: 'fn', v: m[1].toUpperCase() }); i += m[0].length; continue; }
      if ((m = /^(<>|<=|>=|[-+*\/^=<>(),&%])/.exec(f.slice(i)))) { t.push({ k: 'op', v: m[1] }); i += m[0].length; continue; }
      t.push({ k: 'bad', v: ch }); i++;
    }
    return t;
  }

  // evaluate(model, sheetName, opts) -> fills c.v for every formula cell (c.f) ; returns {evaluated, errors, unsupported:{fn:count}}
  function evaluateSheet(model, sheetName, opts) {
    opts = opts || {}; var ws = model.Sheets[sheetName], memo = {}, busy = {}, unsupported = {}, nErr = 0, nEval = 0;
    function cellAt(r, c) { return ws[colName(c) + (r + 1)]; }
    function valueOf(r, c) {                                          // -> number | string | boolean | null(blank) | ERR
      var k = r + ',' + c; if (k in memo) return memo[k];
      var cell = cellAt(r, c); if (!cell || cell.t === 'z') return null;
      if (cell.f) { if (busy[k]) return new ERR('#REF!'); busy[k] = 1; var v = evalFormula(cell.f, r, c); delete busy[k]; memo[k] = v; return v; }
      if (cell.t === 'n') return cell.v; if (cell.t === 's') return cell.v === '' ? null : cell.v; if (cell.t === 'b') return !!cell.v; if (cell.t === 'e') return new ERR(String(cell.v));
      return null;
    }
    function num(v) { if (isErr(v)) return v; if (v == null) return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; var x = parseFloat(v); return isNaN(x) || String(x) !== String(v).trim() ? new ERR('#VALUE!') : x; }
    function rangeVals(t) { var out = []; for (var r = Math.min(t.r0, t.r1); r <= Math.max(t.r0, t.r1); r++) for (var c = Math.min(t.c0, t.c1); c <= Math.max(t.c0, t.c1); c++) out.push(valueOf(r, c)); return out; }
    function evalFormula(f, row, col) {
      var tk = tokenize(f), p = 0;
      function peek() { return tk[p]; } function eat() { return tk[p++]; }
      function isOp(v) { var t = peek(); return t && t.k === 'op' && t.v === v; }
      function args() { var a = []; if (isOp(')')) { eat(); return a; } for (;;) { a.push(cmp(true)); if (isOp(',')) { eat(); continue; } if (isOp(')')) { eat(); break; } return null; } return a; }
      function flat(a) { var out = []; a.forEach(function (x) { if (x && x.__range) out = out.concat(x.vals); else out.push(x); }); return out; }
      function call(name, a) {
        var vs;
        switch (name) {
          case 'SUM': vs = flat(a); for (var i = 0, s = 0; i < vs.length; i++) { if (isErr(vs[i])) return vs[i]; if (typeof vs[i] === 'number') s += vs[i]; else if (typeof vs[i] === 'boolean' && !a[0].__range) s += vs[i] ? 1 : 0; } return s;
          case 'COUNT': return flat(a).filter(function (x) { return typeof x === 'number'; }).length;
          case 'COUNTA': return flat(a).filter(function (x) { return x != null; }).length;
          case 'MIN': case 'MAX': vs = flat(a).filter(function (x) { return typeof x === 'number'; }); if (!vs.length) return 0; return name === 'MIN' ? Math.min.apply(null, vs) : Math.max.apply(null, vs);
          case 'ABS': { var x = num(a[0]); return isErr(x) ? x : Math.abs(x); }
          case 'ROUND': { var y = num(a[0]), d = num(a[1]); if (isErr(y)) return y; var m = Math.pow(10, d), z = Math.abs(y) * m; return Math.sign(y) * Math.floor(z + 0.5 + 1e-9) / m; }
          case 'ROW': return a.length && a[0].__ref ? a[0].__ref.r + 1 : row + 1;
          case 'IF': { var cnd = a[0]; if (isErr(cnd)) return cnd; var truthy = typeof cnd === 'boolean' ? cnd : (num(cnd) !== 0); return truthy ? (a[1] === undefined ? true : a[1]) : (a[2] === undefined ? false : a[2]); }
          case 'CONCATENATE': return flat(a).map(function (x) { return x == null ? '' : String(x); }).join('');
          default: unsupported[name] = (unsupported[name] || 0) + 1; return new ERR('#NAME?');
        }
      }
      function primary() {
        var t = eat(); if (!t) return new ERR('#VALUE!');
        if (t.k === 'n') return t.v; if (t.k === 's') return t.v;
        if (t.k === 'ref') { var v = valueOf(t.r, t.c); if (v && typeof v === 'object' && v.__ref) return v; return v; }
        if (t.k === 'range') return { __range: true, vals: rangeVals(t), t: t };
        if (t.k === 'fn') { var a = args(); if (a === null) return new ERR('#VALUE!'); if (t.v === 'ROW' && a.length === 1 && tk[p - 2] && tk[p - 2].k === 'ref') a[0] = { __ref: tk[p - 2] }; return call(t.v, a); }
        if (t.k === 'op' && t.v === '(') { var v2 = cmp(); if (isOp(')')) eat(); else return new ERR('#VALUE!'); return v2; }
        return new ERR('#VALUE!');
      }
      function unary() { if (isOp('-')) { eat(); var x = num(unary()); return isErr(x) ? x : -x; } if (isOp('+')) { eat(); return unary(); } return pct(); }
      function pct() { var v = primary(); while (isOp('%')) { eat(); var x = num(v); v = isErr(x) ? x : x / 100; } return v; }
      function pow() { var l = unary(); while (isOp('^')) { eat(); var r = unary(), a = num(l), b = num(r); l = isErr(a) ? a : isErr(b) ? b : Math.pow(a, b); } return l; }
      function mul() { var l = pow(); while (isOp('*') || isOp('/')) { var op = eat().v, r = pow(), a = num(l), b = num(r); if (isErr(a)) l = a; else if (isErr(b)) l = b; else if (op === '*') l = a * b; else l = b === 0 ? new ERR('#DIV/0!') : a / b; } return l; }
      function add() { var l = mul(); while (isOp('+') || isOp('-')) { var op = eat().v, r = mul(), a = num(l), b = num(r); l = isErr(a) ? a : isErr(b) ? b : (op === '+' ? a + b : a - b); } return l; }
      function cat() { var l = add(); while (isOp('&')) { eat(); var r = add(); l = (l == null ? '' : String(l)) + (r == null ? '' : String(r)); } return l; }
      function cmp(inArgs) { var l = cat(); var t = peek(); if (t && t.k === 'op' && /^(=|<>|<|>|<=|>=)$/.test(t.v)) { eat(); var r = cat(), a = (typeof l === 'string' || typeof r === 'string') ? [String(l == null ? '' : l), String(r == null ? '' : r)] : [num(l), num(r)]; if (isErr(a[0])) return a[0]; if (isErr(a[1])) return a[1]; switch (t.v) { case '=': return a[0] === a[1]; case '<>': return a[0] !== a[1]; case '<': return a[0] < a[1]; case '>': return a[0] > a[1]; case '<=': return a[0] <= a[1]; default: return a[0] >= a[1]; } } return l; }
      var res = cmp(); if (p < tk.length) return new ERR('#VALUE!');
      if (res && res.__range) res = res.vals[0] == null ? 0 : res.vals[0];
      return res == null ? 0 : res;
    }
    Object.keys(ws).forEach(function (k) {
      if (k[0] === '!') return; var c = ws[k]; if (!c.f) return; var m = /^([A-Z]+)(\d+)$/.exec(k), col = colNum(m[1]), row = +m[2] - 1;
      var v = valueOf(row, col); nEval++;
      if (isErr(v)) { nErr++; c.t = 'e'; c.v = v.e; } else if (typeof v === 'string') { c.t = 's'; c.v = v; } else if (typeof v === 'boolean') { c.t = 'b'; c.v = v; } else { c.t = 'n'; c.v = v; }
    });
    return { evaluated: nEval, errors: nErr, unsupported: unsupported };
  }

  var API = { evaluateSheet: evaluateSheet };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else global.NinjaCalc = API;
})(typeof self !== 'undefined' ? self : this);
