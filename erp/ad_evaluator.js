// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ad_evaluator.js — AD logic-expression evaluator (W-LOGIC-EVAL).
// Implementing ERP_COVERAGE_MATRIX.md §DisplayLogic/§ReadOnlyLogic/§MandatoryLogic — Witness: W-LOGIC-EVAL
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// SPEC (EXTRACT, do NOT invent) — the grammar is iDempiere's, ported faithfully; cite the source lines.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// Java home: Evaluator.evaluateLogic (org.compiere.util.Evaluator.java:101-104) DELEGATES to
//   LogicEvaluator.evaluateLogic (org.idempiere.expression.logic.LogicEvaluator.java:68-86), which parses with
//   the ANTLR grammar SimpleBoolean.g4 (org.adempiere.base/antlr/SimpleBoolean.g4:1-61) and walks it with
//   EvaluationVisitor.java:1-308. This file is a hand-rolled recursive-descent port of THAT grammar (no ANTLR dep).
//
// Tokens (SimpleBoolean.g4:36-59):
//   AND '&' | OR '|' | NOT '$!' | TRUE 'true' | FALSE 'false'
//   GT '>' | GE '>=' | LT '<' | LE '<=' | EQ '=' | NE [!^] | RE '~'
//   LPAREN '(' | RPAREN ')'
//   DECIMAL '-'?[0-9]+('.'[0-9]+)?  | VARIABLE '@'(.*?)'@'  | QTEXT '...' | DQTEXT "..." | TEXT [a-zA-Z_0-9,.@]+
//   WS skipped.
// Expression precedence (SimpleBoolean.g4:9-22, ANTLR alternatives = top->bottom binding strength):
//   parenExpression > notExpression > comparatorExpression > binaryExpression(& |) > bool|VARIABLE|text|DECIMAL.
//   i.e. a comparator binds TIGHTER than & / | ; & and | are EQUAL precedence, LEFT-to-RIGHT
//   (EvaluationVisitor.visitBinaryExpression:229-236). '()' overrides the order (g4 comment, LogicEvaluator:61).
// Atom / comparison semantics (EvaluationVisitor.java):
//   - @ctx@  -> evaluatee.get_ValueAsString(inner); empty value whose name ends with '_ID' -> "0"
//     (visitContextVariables:260-271). The '#'/'$' global-context prefixes are PART of the inner name.
//   - 'x' / "x" -> quotes stripped (visitQuotedText:74-87).
//   - EQ (isEqual:148-186): if right is a CSV list (QCSVTEXT/DQCSVTEXT, or a TEXT containing a comma) -> isIn()
//     membership (188-226); else String/BigDecimal/Timestamp cross-coercion; null==null -> true; one null -> false.
//   - NE: !isEqual (134). RE '~': Pattern.matches(right, left) full-match regex (142-146).
//   - LT/GT/LE/GE: asComparable both sides (BigDecimal, else Timestamp, else String); any null -> FALSE (109-132).
//   - asComparable (279-307): JDBC-timestamp pattern -> Timestamp; else try BigDecimal; else String.
// parseDepends (Evaluator.java:111-136): collect @var@ names; strip leading '~', a leading 'NN|' tab-no, and
//   anything after '.' or ':'.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

(function (global) {
  'use strict';

  // -- Tokenizer -----------------------------------------------------------------------------------------
  function tokenize(s) {
    var toks = [], i = 0, n = s.length;
    while (i < n) {
      var c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') { i++; continue; }
      if (c === '@') {                                       // VARIABLE '@'(.*?)'@' (g4:51) - lazy to next '@'
        var j = s.indexOf('@', i + 1);
        if (j === -1) throw new Error('unterminated @variable@ in: ' + s);
        toks.push({ t: 'VAR', v: s.substring(i + 1, j) }); i = j + 1; continue;
      }
      if (c === "'") {
        var k = s.indexOf("'", i + 1);
        if (k === -1) throw new Error("unterminated 'quote in: " + s);
        var end = scanQuotedList(s, i, "'");
        if (end > k) { toks.push({ t: 'CSV', v: s.substring(i, end + 1), q: "'" }); i = end + 1; }
        else { toks.push({ t: 'TXT', v: s.substring(i + 1, k) }); i = k + 1; }
        continue;
      }
      if (c === '"') {
        var k2 = s.indexOf('"', i + 1);
        if (k2 === -1) throw new Error('unterminated "quote in: ' + s);
        var end2 = scanQuotedList(s, i, '"');
        if (end2 > k2) { toks.push({ t: 'CSV', v: s.substring(i, end2 + 1), q: '"' }); i = end2 + 1; }
        else { toks.push({ t: 'TXT', v: s.substring(i + 1, k2) }); i = k2 + 1; }
        continue;
      }
      if (c === '$' && s[i + 1] === '!') { toks.push({ t: 'NOT' }); i += 2; continue; }            // NOT '$!'
      if (c === '&') { toks.push({ t: 'AND' }); i++; continue; }
      if (c === '|') { toks.push({ t: 'OR' }); i++; continue; }
      if (c === '(') { toks.push({ t: 'LP' }); i++; continue; }
      if (c === ')') { toks.push({ t: 'RP' }); i++; continue; }
      if (c === '>') { if (s[i + 1] === '=') { toks.push({ t: 'GE' }); i += 2; } else { toks.push({ t: 'GT' }); i++; } continue; }
      if (c === '<') { if (s[i + 1] === '=') { toks.push({ t: 'LE' }); i += 2; } else { toks.push({ t: 'LT' }); i++; } continue; }
      if (c === '=') { toks.push({ t: 'EQ' }); i++; continue; }
      if (c === '!' || c === '^') { toks.push({ t: 'NE' }); i++; continue; }                       // NE [!^]
      if (c === '~') { toks.push({ t: 'RE' }); i++; continue; }
      if (/[A-Za-z0-9_,.\-]/.test(c)) {
        var m = i;
        while (m < n && /[A-Za-z0-9_,.\-]/.test(s[m])) m++;
        toks.push({ t: 'TEXT', v: s.substring(i, m) }); i = m; continue;
      }
      throw new Error('unexpected char "' + c + '" at ' + i + ' in: ' + s);
    }
    return toks;
  }

  function scanQuotedList(s, i, q) {
    var p = i, n = s.length, count = 0, sawComma = false, lastClose = i;
    while (p < n) {
      if (s[p] === q) {
        var e = s.indexOf(q, p + 1);
        if (e === -1) return i;
        count++; lastClose = e; p = e + 1;
        while (p < n && /\s/.test(s[p])) p++;
        if (s[p] === ',') { sawComma = true; p++; while (p < n && /\s/.test(s[p])) p++; if (s[p] !== q) break; }
        else break;
      } else break;
    }
    return (sawComma && count >= 2) ? lastClose : i;
  }

  // -- Parser (recursive descent, precedence per g4) -----------------------------------------------------
  function parse(toks, src) {
    var pos = 0;
    function peek() { return toks[pos]; }
    function next() { return toks[pos++]; }
    function expect(t) { var k = next(); if (!k || k.t !== t) throw new Error('expected ' + t + ' in: ' + src); return k; }

    function parseBinary() {
      var left = parseComparator();
      while (peek() && (peek().t === 'AND' || peek().t === 'OR')) {
        var op = next().t;
        var right = parseComparator();
        left = { k: 'bin', op: op, l: left, r: right };
      }
      return left;
    }
    function parseComparator() {
      var left = parseUnary();
      var p = peek();
      if (p && (p.t === 'EQ' || p.t === 'NE' || p.t === 'GT' || p.t === 'GE' || p.t === 'LT' || p.t === 'LE' || p.t === 'RE')) {
        var op = next().t;
        var right = parseUnary();
        return { k: 'cmp', op: op, l: left, r: right };
      }
      return left;
    }
    function parseUnary() {
      var p = peek();
      if (p && p.t === 'NOT') { next(); return { k: 'not', e: parseUnary() }; }
      if (p && p.t === 'LP') { next(); var e = parseBinary(); expect('RP'); return e; }
      return parseAtom();
    }
    function parseAtom() {
      var k = next();
      if (!k) throw new Error('unexpected end in: ' + src);
      if (k.t === 'VAR') return { k: 'var', name: k.v };
      if (k.t === 'TXT') return { k: 'lit', v: k.v, str: true };
      if (k.t === 'CSV') return { k: 'csv', v: k.v };
      if (k.t === 'TEXT') {
        var v = k.v;
        if (v === 'true') return { k: 'bool', v: true };
        if (v === 'false') return { k: 'bool', v: false };
        return { k: 'lit', v: v, str: false, csv: v.indexOf(',') >= 0 };
      }
      throw new Error('unexpected token ' + k.t + ' in: ' + src);
    }

    var ast = parseBinary();
    if (pos !== toks.length) throw new Error('trailing tokens in: ' + src);
    return ast;
  }

  // -- Evaluation (mirrors EvaluationVisitor) ------------------------------------------------------------
  // §P8 (bim-compiler prompts/ERP_IDEMPIERE_UX_PARITY.md §P8-RESULT-DEFECT — Witness: W-PARITY-REFTABLE):
  //   the lookup is CASE-INSENSITIVE on the second pass. AD logic tokens are CamelCase (`@TenderType@`,
  //   `@IsSOTrx@`) but EVERY record this stack builds is lower-cased — crud_overlay's gatherVals() keys are
  //   `f.col`, which foldCrudSpec lower-cases — so an exact-case lookup NEVER resolved a CamelCase token and
  //   every such expression silently evaluated against "". Measured: C_Payment.TrxType's DisplayLogic
  //   `@TenderType@=C` stayed false however the user set TenderType, so the field could never appear.
  //   This is the same storage-detail mapping §P3-SPEC P3.5 already established for the val-rule @token@ feed
  //   ("AD tokens are CamelCase and our records are lowercase, so that case mapping lives in the wiring") —
  //   applied here too rather than left as a second, contradictory convention. Exact match still wins first,
  //   so a record that DOES carry the AD casing is unaffected.
  function _ciGet(bag, name) {
    if (!bag) return undefined;
    if (Object.prototype.hasOwnProperty.call(bag, name)) return bag[name];
    var lower = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(bag, lower)) return bag[lower];
    for (var k in bag) if (Object.prototype.hasOwnProperty.call(bag, k) && String(k).toLowerCase() === lower) return bag[k];
    return undefined;
  }
  function resolveVar(name, record, context) {
    var raw = _ciGet(record, name);
    if (raw === undefined) raw = _ciGet(context, name);
    var val = (raw == null) ? '' : String(raw);
    if (val.trim() === '' && /_ID$/.test(name)) return '0';                // empty _ID -> "0" (267-268)
    return val;
  }

  function nodeValue(node, record, context) {
    switch (node.k) {
      case 'var': return resolveVar(node.name, record, context);
      case 'lit': return node.v;
      case 'csv': return node.v;
      case 'bool': return node.v;
      default: throw new Error('not a value node: ' + node.k);
    }
  }

  var JDBC_TS = /.*[-].*[-].*[:].*[:].*/;
  function asComparable(v) {
    if (v == null) return null;
    var s = String(v);
    if (s.trim() === '') return null;
    if (JDBC_TS.test(s)) { var d = Date.parse(s.replace(' ', 'T')); if (!isNaN(d)) return { ts: d }; }
    if (/^-?\d+(\.\d+)?$/.test(s.trim())) return { num: Number(s) };
    return { str: s };
  }
  function cmp(a, b) {
    if (a == null || b == null) return null;
    if ('num' in a && 'num' in b) return a.num < b.num ? -1 : a.num > b.num ? 1 : 0;
    if ('ts' in a && 'ts' in b) return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    var sa = ('str' in a) ? a.str : ('num' in a ? String(a.num) : String(a.ts));
    var sb = ('str' in b) ? b.str : ('num' in b ? String(b.num) : String(b.ts));
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  function csvMembers(node) {
    var raw = node.v;
    if (node.k === 'lit') {
      return raw.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
    }
    var out = [], q = null, cur = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw[i];
      if (q && ch === q) { q = null; }
      else if (!q && (ch === "'" || ch === '"')) { q = ch; }
      else if (ch === ',' && !q) { if (cur.length) out.push(cur); cur = ''; }
      else if (/\s/.test(ch) && !q) { /* skip */ }
      else cur += ch;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  function isEqual(lNode, rNode, record, context) {
    var rIsCsv = (rNode.k === 'csv') || (rNode.k === 'lit' && rNode.csv);
    var left = nodeValue(lNode, record, context);
    if (rIsCsv) return csvMembers(rNode).indexOf(String(left)) >= 0;
    var right = nodeValue(rNode, record, context);
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    var ln = (/^-?\d+(\.\d+)?$/.test(String(left).trim())), rn = (/^-?\d+(\.\d+)?$/.test(String(right).trim()));
    if (ln && rn) return Number(left) === Number(right);
    return String(left) === String(right);
  }

  function evalNode(node, record, context) {
    switch (node.k) {
      case 'bool': return node.v;
      case 'not': return !evalNode(node.e, record, context);
      case 'bin':
        if (node.op === 'AND') return evalNode(node.l, record, context) && evalNode(node.r, record, context);
        return evalNode(node.l, record, context) || evalNode(node.r, record, context);
      case 'cmp': {
        if (node.op === 'EQ') return isEqual(node.l, node.r, record, context);
        if (node.op === 'NE') return !isEqual(node.l, node.r, record, context);
        if (node.op === 'RE') {
          var lv = String(nodeValue(node.l, record, context));
          var rv = String(nodeValue(node.r, record, context));
          try { return new RegExp('^(?:' + rv + ')$').test(lv); } catch (e) { return false; }
        }
        var a = asComparable(nodeValue(node.l, record, context));
        var b = asComparable(nodeValue(node.r, record, context));
        var c = cmp(a, b);
        if (c == null) return false;
        if (node.op === 'LT') return c < 0;
        if (node.op === 'GT') return c > 0;
        if (node.op === 'LE') return c <= 0;
        if (node.op === 'GE') return c >= 0;
        return false;
      }
      case 'var': return Boolean(resolveVar(node.name, record, context));
      case 'lit': return Boolean(node.v);
      default: throw new Error('cannot eval node ' + node.k);
    }
  }

  // -- Public API ----------------------------------------------------------------------------------------
  function evaluate(expr, record, context) {
    if (expr == null || String(expr).trim() === '') return true;
    var ast = parse(tokenize(String(expr)), String(expr));
    var r = evalNode(ast, record || {}, context || {});
    return Boolean(r);
  }

  function parseDepends(expr) {
    var list = [], s = String(expr || '');
    while (s.indexOf('@') !== -1) {
      var p = s.indexOf('@'); s = s.substring(p + 1);
      p = s.indexOf('@'); if (p === -1) break;
      var v = s.substring(0, p); s = s.substring(p + 1);
      if (v.charAt(0) === '~') v = v.substring(1);
      v = v.replace(/^[0-9][0-9]*\|/, '');
      if (v.indexOf('.') > 0) v = v.substring(0, v.indexOf('.'));
      if (v.indexOf(':') > 0) v = v.substring(0, v.indexOf(':'));
      list.push(v);
    }
    return list;
  }

  // @SQL= logic is a SEPARATE surface (Evaluator.parseSQLLogic:147-196 runs it as a PreparedStatement, not the
  // boolean grammar). Recognize + classify it as sql:true so coverage counts it honestly, not as a parse failure.
  function tryParse(expr) {
    if (expr == null || String(expr).trim() === '') return { ok: true };
    if (/^@SQL=/i.test(String(expr).trim())) return { ok: true, sql: true };
    try { parse(tokenize(String(expr)), String(expr)); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  var API = { evaluate: evaluate, parseDepends: parseDepends, tryParse: tryParse, _tokenize: tokenize, _parse: parse };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;        // node witness
  if (typeof window !== 'undefined') window.AdEvaluator = API;                       // browser / crud_overlay
  else if (global) global.AdEvaluator = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
