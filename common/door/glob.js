// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — glob.js: the ONE wildcard reader of the door (bim-compiler prompts/CLI_ERP_IVR.md §22.7, step R4). READ THE LOG of W-GLOB after every change.
// Shell meaning, not case-sensitive: * any run · ? one character · [abc] / [a-z] one of · \* \? \[ \\ a literal. ONE parse gives both forms:
//   toRegExp(p) -> a JS RegExp (rows that come from an engine answer: the red1 shell's `| glob` view) · toSqlGlob(p) -> a pattern for `lower(CAST(col AS TEXT)) GLOB ?` (SQLite; the shared filter reader).
// A value with no wildcard is NOT a glob: the caller keeps its exact match. NO require, NO process: it runs unchanged in Node and in the page.
(function (root) {
  'use strict';
  function parse(p) {   // -> [{lit:'x'} | {any:true} | {one:true} | {set:'a-z', neg:false}]
    var out = [], s = String(p), i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && i + 1 < s.length) { out.push({ lit: s[i + 1] }); i += 2; continue; }
      if (c === '*') { out.push({ any: true }); i++; continue; }
      if (c === '?') { out.push({ one: true }); i++; continue; }
      if (c === '[') { var j = s.indexOf(']', i + 2); if (j > i) { var body = s.slice(i + 1, j), neg = body[0] === '!' || body[0] === '^'; out.push({ set: neg ? body.slice(1) : body, neg: neg }); i = j + 1; continue; } }
      out.push({ lit: c }); i++;
    }
    return out;
  }
  function isGlob(p) { return parse(p).some(function (t) { return !t.lit; }); }
  var reEsc = function (c) { return c.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&'); };
  function toRegExp(p) {
    return new RegExp('^' + parse(p).map(function (t) { return t.any ? '[\\s\\S]*' : t.one ? '[\\s\\S]' : t.set != null ? '[' + (t.neg ? '^' : '') + t.set.replace(/[\\\]]/g, '\\$&') + ']' : reEsc(t.lit); }).join('') + '$', 'i');
  }
  function toSqlGlob(p, brk) {   // SQLite GLOB has no escape character: a literal * ? [ is written as a one-member set
    var g = parse(p).map(function (t) { return t.any ? '*' : t.one ? '?' : t.set != null ? '[' + (t.neg ? '^' : '') + t.set + ']' : (/[*?[]/.test(t.lit) ? '[' + t.lit + ']' : t.lit); }).join('');
    return brk === 'casesens' ? g : g.toLowerCase();   // casesens: W-GLOB falsifier, the SQL form keeps the case (must FAIL G1)
  }
  function match(p) { var re = toRegExp(p); return function (v) { return re.test(v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))); }; }
  var API = { parse: parse, isGlob: isGlob, toRegExp: toRegExp, toSqlGlob: toSqlGlob, match: match };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Glob = API;
})(this);
