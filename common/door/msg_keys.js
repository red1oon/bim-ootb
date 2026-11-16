// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — msg_keys.js: the ONE scanner of message-key uses in code (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §5).
// Read by W-MSG-CATALOG M3 (common/door/tests/witness_msg_catalog.js) and by the X0 Navigator (CODE_ARCHITECTURE_DESIGN.md, F-19). READ THE WITNESS LOG after a change.
// PURE: no require, no fs, no process; it runs unchanged in Node, the witness and the VS Code extension.
//   scan(sourceText, fileRel) -> [{ key, line, col, args, file }]   every call M('key', …) or .t('key', …); key null = not a literal string (computed)
//   check(catalog, uses, opts) -> [{ kind, key, file, line, col, detail }]
//     kinds: unknown-key · unused-key (opts.prefixes: the catalog keys this scan answers for) · template (gap or stray brace) · arg-count · computed-key
(function (root) {
  'use strict';
  var CALL = /(\bM|\.t)\(/g;
  // from the character after '(' : skip a JS string literal starting at i; returns the index after its closing quote
  function skipString(s, i) { var q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } return i + 1; }
  // count the top-level arguments of a call whose '(' is at s[open]; returns {args, end} (args = all arguments, the key included)
  function callArgs(s, open) {
    var depth = 0, i = open + 1, n = 0, any = false;
    for (; i < s.length; i++) {
      var c = s[i];
      if (c === '"' || c === "'" || c === '`') { i = skipString(s, i) - 1; any = true; continue; }
      if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (c === '(' || c === '[' || c === '{') { depth++; any = true; continue; }
      if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; continue; }
      if (c === ',' && depth === 0) { n++; continue; }
      if (!/\s/.test(c)) any = true;
    }
    return { args: any ? n + 1 : 0, end: i };
  }
  function lineCol(s, at) { var line = 1, last = -1; for (var i = 0; i < at; i++) if (s.charCodeAt(i) === 10) { line++; last = i; } return { line: line, col: at - last }; }
  function scan(text, file) {
    var out = [], m; CALL.lastIndex = 0;
    while ((m = CALL.exec(text))) {
      var open = m.index + m[0].length - 1, ca = callArgs(text, open), body = text.slice(open + 1, ca.end);
      // the first argument's text: up to the first top-level comma
      var first = body, d = 0;
      for (var j = 0; j < body.length; j++) { var c = body[j]; if (c === '"' || c === "'" || c === '`') { j = skipString(body, j) - 1; continue; } if (c === '(' || c === '[' || c === '{') d++; else if (c === ')' || c === ']' || c === '}') d--; else if (c === ',' && d === 0) { first = body.slice(0, j); break; } }
      first = first.trim();
      var lit = /^(['"])((?:(?!\1)[^\\])*)\1$/.exec(first), key;
      if (lit) key = lit[2];                                   // a literal key
      else if (/['"`]/.test(first)) key = null;               // built from strings at run time (a computed key: reported, never skipped)
      else continue;                                          // no string in the first argument: another API's call, not a message
      var lc = lineCol(text, m.index + (m[1] === '.t' ? 1 : 0));
      out.push({ key: key, line: lc.line, col: lc.col, args: Math.max(0, ca.args - 1), file: file || '' });
    }
    return out;
  }
  // the {n} placeholders a template takes: n+1 for the highest, and its problems
  function shape(t) {
    var ns = (t.match(/\{(\d+)\}/g) || []).map(function (x) { return +x.slice(1, -1); }), max = ns.length ? Math.max.apply(null, ns) : -1, bad = [];
    for (var i = 0; i <= max; i++) if (ns.indexOf(i) < 0) bad.push('gap {' + i + '}');
    if (/[{}]/.test(t.replace(/\{\d+\}/g, ''))) bad.push('stray brace');
    return { takes: max + 1, bad: bad };
  }
  function check(catalog, uses, opts) {
    opts = opts || {}; var M = (catalog && catalog.messages) || {}, out = [], used = {};
    uses.forEach(function (u) {
      if (u.key === null) { out.push({ kind: 'computed-key', key: null, file: u.file, line: u.line, col: u.col, detail: 'the key is not a literal string' }); return; }
      used[u.key] = 1;
      var e = M[u.key];
      if (!e || typeof e.en !== 'string') { out.push({ kind: 'unknown-key', key: u.key, file: u.file, line: u.line, col: u.col, detail: 'not in the catalog' }); return; }
      var sh = shape(e.en);
      if (u.args !== sh.takes) out.push({ kind: 'arg-count', key: u.key, file: u.file, line: u.line, col: u.col, detail: 'passes ' + u.args + ', the template takes ' + sh.takes });
    });
    Object.keys(M).forEach(function (k) {
      var sh = shape(M[k].en || ''); sh.bad.forEach(function (b) { out.push({ kind: 'template', key: k, file: '', line: 0, col: 0, detail: b }); });
      if ((opts.prefixes || []).some(function (p) { return k.indexOf(p) === 0; }) && !used[k]) out.push({ kind: 'unused-key', key: k, file: '', line: 0, col: 0, detail: 'in the catalog, used nowhere scanned' });
    });
    return out;
  }
  var API = { scan: scan, check: check, shape: shape };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MsgKeys = API;
})(this);
