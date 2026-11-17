// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — assist_core.js: the ONE type assist of the red1 prompt and the door's "nearest" names (bim-compiler prompts/CLI_ERP_IVR.md §1d, §1d.1). READ THE LOG of W-RED1-ASSIST after every change.
// PURE: no require, no process, no fs, no terminal codes; it runs unchanged in Node and in the page (§1b). It never acts and never applies a suggestion:
// it proposes what may come next at the end of a line; the driver shows it (grey) and the PERSON accepts it (Tab / →). A wrong name is answered by a suggestion, never by a silent fix.
// Sources are only what it is handed (the vocabulary, the red1 words, the buildings, the properties of the kind the session is in, from a describe answer): no hand list, no guess.
//   nearest(name, names, n) -> [{name, how}]   how = 'case' | 'rule' (- read as _, _ID added) | 'prefix' | 'nearest' (edit distance)
//   suggest(ctx, text) -> null | {token, candidates:[{name, reason, how}], ghost, replace}
//     ctx = {words:[…], verbs:{verb:entry}, buildings:[…], props:[{name,label,type,values}], kind, codes:{CO:'complete',…}, actions:[…], places:[…] (§40: a record's tabs, a menu node's children), processes:[…] (§40 C3)}
//     ghost   = the text to show after the cursor when the first candidate EXTENDS what was typed (a prefix match)
//     replace = {from, to} when the first candidate is a different spelling of the token (a typo): the driver shows it as a hint, Tab replaces the token
(function (root) {
  'use strict';
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    var m = a.length, n = b.length, d = [], i, j; if (!m) return n; if (!n) return m;
    for (i = 0; i <= m; i++) { d[i] = [i]; } for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // the names nearest to a typed one, best first; empty when nothing is close (never a made-up name)
  function nearest(name, names, n) {
    name = String(name || ''); n = n || 3;
    var lo = name.toLowerCase(), rule = lo.replace(/-/g, '_'), out = [], seen = {};
    var add = function (nm, how) { if (!seen[nm]) { seen[nm] = 1; out.push({ name: nm, how: how }); } };
    names.forEach(function (nm) { if (nm.toLowerCase() === lo) add(nm, 'case'); });
    names.forEach(function (nm) { var l = nm.toLowerCase(); if (l === rule || l === rule + '_id' || l === rule.replace(/_id$/, '') + '_id') add(nm, 'rule'); });
    names.forEach(function (nm) { if (lo && nm.toLowerCase().indexOf(rule) === 0) add(nm, 'prefix'); });
    var lim = Math.min(Math.max(2, Math.floor(name.length / 3)), name.length - 1);   // §42 S3 (bim-compiler prompts/CLI_ERP_IVR.md): a 1-2 character name may differ by fewer edits than it has characters (2 edits reach ANY 2-character name); W-ASSIST-NEAREST
    names.map(function (nm) { return { nm: nm, d: lev(rule, nm) }; }).filter(function (x) { return x.d <= lim; })
      .sort(function (x, y) { return x.d - y.d || (x.nm < y.nm ? -1 : 1); }).forEach(function (x) { add(x.nm, 'nearest'); });
    return out.slice(0, n);
  }
  // split the line: the last token being typed, and what came before
  function lastToken(text) {
    var m = /(^|\s)("?[^\s"]*)$/.exec(text); var tok = m ? m[2] : ''; return { before: text.slice(0, text.length - tok.length), tok: tok };
  }
  function cands(tok, list) {   // prefix candidates (case ignored) in the list's order; else the nearest
    var lo = tok.toLowerCase(), hits = list.filter(function (x) { return x.name.toLowerCase().indexOf(lo) === 0; });
    if (hits.length) return hits.map(function (x) { return { name: x.name, reason: x.reason, how: 'prefix' }; });
    var by = {}; list.forEach(function (x) { by[x.name] = x; });
    return nearest(tok, list.map(function (x) { return x.name; })).map(function (x) { return { name: x.name, reason: by[x.name].reason, how: x.how }; });
  }
  function answer(tok, cs, suffix) {
    if (!tok && !cs.length) return null;
    var c = cs[0]; if (!c) return { token: tok, candidates: [], ghost: '', replace: null };
    var prefix = c.how === 'prefix' && c.name.slice(0, tok.length) === tok;   // extends exactly what was typed: grey text; any other spelling (case, -, a typo): a hint that Tab applies
    return { token: tok, candidates: cs.slice(0, 8), shown: Math.min(8, cs.length), of: cs.length,
      ghost: prefix ? c.name.slice(tok.length) + (suffix || '') : '', replace: prefix ? null : { from: tok, to: c.name + (suffix || '') } };
  }
  function suggest(ctx, text) {
    ctx = ctx || {}; text = String(text || '');
    var lt = lastToken(text), tok = lt.tok, words = lt.before.trim() ? lt.before.trim().split(/\s+/) : [], first = words[0] || null;
    if (/^"/.test(tok) && !(first === 'cd' && words.length === 1 && lt.before.trim() === 'cd')) return null;   // inside a quoted value: no assist (but a quoted kind after cd)
    // 1. the first word: red1 words, the help groups, session words, door verbs
    if (!first) {
      if (!tok) return null;
      var w1 = (ctx.words || []).map(function (w) { return { name: w, reason: 'red1 word' }; }).concat(Object.keys(ctx.verbs || {}).map(function (v) { return { name: v, reason: 'door verb' }; }));
      return answer(tok, cands(tok, w1));
    }
    // 2. after cd: the buildings, the kinds this session knows
    if (first === 'cd' && words.length === 1) {   // §1d.1: the buildings, then the ERP kinds (those with a window first); a name with a space is completed in quotes
      if (!tok) return null;
      var raw = tok.replace(/^"/, ''), cl2 = (ctx.places || []).map(function (p0) { return { name: p0, reason: 'here' }; }).concat((ctx.buildings || []).map(function (b) { return { name: b, reason: 'building' }; })).concat((ctx.kinds || []).map(function (k4) { return { name: k4.name, reason: k4.window ? 'ERP kind · window' : 'ERP kind' }; }));   // §40 C3/C5: the place's own first (a record's tabs, a menu node's children)
      var r2 = answer(raw, cands(raw, cl2)); if (!r2 || !r2.candidates.length) return r2;
      var c0 = r2.candidates[0].name;
      if (/\s/.test(c0) || /^"/.test(tok)) { r2.token = tok; r2.ghost = ''; r2.replace = { from: tok, to: '"' + c0 + '"' }; }
      return r2;
    }
    // 3. after do: the legacy codes, then the action names
    if (first === 'do' && words.length === 1) {
      var cl = Object.keys(ctx.codes || {}).map(function (c) { return { name: c, reason: ctx.codes[c] }; }).concat(Object.keys(ctx.codes || {}).map(function (c) { return { name: ctx.codes[c], reason: c }; }));
      return tok ? answer(tok, cands(tok, cl)) : null;
    }
    // §40 C3: after run, the record's own process buttons (quoted when the name has a space)
    if (first === 'run' && words.length === 1 && ctx.processes && ctx.processes.length) {
      if (!tok) return null;
      var raw3 = tok.replace(/^"/, ''), r3 = answer(raw3, cands(raw3, ctx.processes.map(function (p3) { return { name: p3, reason: 'process of this record' }; })));
      if (r3 && r3.candidates.length && (/\s/.test(r3.candidates[0].name) || /^"/.test(tok))) { r3.token = tok; r3.ghost = ''; r3.replace = { from: tok, to: '"' + r3.candidates[0].name + '"' }; }
      return r3;
    }
    var props = ctx.props || [];
    var eq = tok.indexOf('=');
    // 4. a value: after key= of a list column, its legal values
    if (eq > 0) {
      var key = tok.slice(0, eq), val = tok.slice(eq + 1), p = props.filter(function (x) { return x.name.toLowerCase() === key.toLowerCase(); })[0];
      if (!p) {   // a wrong key typed with its value: the nearest key, the value kept (shown as a hint; Tab replaces)
        var rk = props.length ? answer(key, cands(key, props.map(function (x) { return { name: x.name, reason: x.label + ' · ' + x.type }; }))) : null;
        if (rk && rk.candidates.length) { rk.token = tok; rk.ghost = ''; rk.replace = { from: tok, to: rk.candidates[0].name + '=' + val }; }
        return rk;
      }
      if (p.values && p.values.length) { var r = answer(val, cands(val, p.values.map(function (v) { return { name: String(v), reason: 'list value of ' + p.name }; }))); if (r && r.replace) r.replace = { from: tok, to: p.name + '=' + r.replace.to }; return r; }
      return null;
    }
    // 5. a key: the properties of the kind the session is in (a door line: its verb's inputs too)
    if (!tok) return null;
    var keys = props.map(function (x) { return { name: x.name, reason: x.label + ' · ' + x.type }; });
    var verb = (ctx.verbs || {})[first]; if (verb) keys = verb.inputs.map(function (i) { return { name: i.name, reason: 'input of ' + first }; }).concat(keys);
    if (!keys.length) return null;
    return answer(tok, cands(tok, keys), '=');
  }
  var api = { nearest: nearest, suggest: suggest, lev: lev };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AssistCore = api;
})(this);
