// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — help_grammar.js: the ONE reading of the leading character of a help line (`?` help, `#<number>` document, `@` reserved, else text).
//   Scope: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.1 Step 1; the grammar and its collision table are prompts/HELP_QUERY_CORE_DESIGN.md §3 (D4).
//   NOT WIRED: nothing calls it yet. READ THE LOG of W-PREFIX (common/help/tests/logs/witness_help_grammar.log) after every change; an exit code is not evidence.
// PURE: no require, no process, no fs, no DOM; it runs unchanged in Node and in the page (the common/door/assist_core.js shape).
// It reads a finished input VALUE only, never a key event. '/' has no meaning here (the shell reads paths before it calls parse; a box treats it as text).
//   parse(line) -> {kind, rest, number}
//     kind   = 'help' | 'doc' | 'reserved' | 'text'
//     rest   = help: what follows the '?' (leading spaces dropped, may be ''); reserved: what follows the '@'; doc: ''; text: the line as given
//     number = doc: the run after the '#' ('' for '#' alone: the caller prints a usage line); otherwise null
(function (root) {
  'use strict';
  function parse(line) {
    line = line == null ? '' : String(line);
    var i = 0, c;
    while (i < line.length && /\s/.test(line.charAt(i))) i++;          // ws* before the first character
    if (i >= line.length) return { kind: 'text', rest: line, number: null };
    c = String.fromCodePoint(line.codePointAt(i));
    var lead = c.normalize('NFKC'), after = line.slice(i + c.length);   // NFKC on the first character only: '？' '＃' count
    if (lead === '?') return { kind: 'help', rest: after.replace(/^\s+/, ''), number: null };
    if (lead === '@') return { kind: 'reserved', rest: after, number: null };
    if (lead === '#') {
      var num = after.replace(/\s+$/, '');                              // number ws* END
      if (!/[\s#]/.test(num)) return { kind: 'doc', rest: '', number: num };   // one run, no space, no '#'; '' = '#' alone
    }
    return { kind: 'text', rest: line, number: null };
  }
  var api = { parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HelpGrammar = api;
})(this);
