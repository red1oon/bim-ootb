// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — msg_core.js: the ONE reader of the message catalog (vocab/messages.json) for text meant for a person (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §3, P2a).
// READ THE LOG of W-MSG-CATALOG (tests/witness_msg_catalog.js) after every change.
// PURE: no require, no process, no fs, no terminal codes; it runs unchanged in Node and in the page. The catalog is handed in, parsed.
// P2a is a PASS-THROUGH: English only, no level, no locale; what a person sees is byte for byte what the literal in the code printed before.
//   create(catalog) -> { t(key, ...args), keys(), used() }
//   A template takes the legacy MessageFormat positions {0} {1} … (iDempiere Msg.java L436-462). A literal { or } is not allowed in a template.
//   An unknown key, or a placeholder with no argument, THROWS: a wrong key is never printed blank.
(function (root) {
  'use strict';
  var PH = /\{(\d+)\}/g;
  function create(catalog) {
    if (!catalog || typeof catalog.messages !== 'object' || catalog.messages === null) throw new Error('msg: no catalog handed in (vocab/messages.json)');
    var M = catalog.messages, uses = {};
    function t(key) {
      var e = Object.prototype.hasOwnProperty.call(M, key) ? M[key] : null;
      if (!e || typeof e.en !== 'string') throw new Error('msg: no message ' + key);
      var args = Array.prototype.slice.call(arguments, 1);
      uses[key] = (uses[key] || 0) + 1;
      return e.en.replace(PH, function (all, n) {
        n = +n; if (n >= args.length) throw new Error('msg: ' + key + ' needs argument {' + n + '}, got ' + args.length);
        return String(args[n]);
      });
    }
    function keys() { return Object.keys(M); }
    function used() { var o = {}; Object.keys(uses).forEach(function (k) { o[k] = uses[k]; }); return o; }
    return { t: t, keys: keys, used: used };
  }
  var API = { create: create, PLACEHOLDER: PH };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MsgCore = API;
})(this);
