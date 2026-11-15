// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — words_core.js: the PURE expander of the red1 shell's short words (bim-compiler prompts/CLI_ERP_IVR.md §22.3-§22.5, steps R1 + R2). READ THE LOG of W-RED1-WORDS / W-RED1-CD after every change.
// (state, input) -> { state, effects, screen }, the contract of mis_core.js / menu_core.js. NO require, NO process, NO fs, NO terminal codes: it runs unchanged in Node and in the page.
// It never acts: every effect is ONE door line {line, purpose}; the driver (red1.js) prints it, runs it through the door, and feeds the envelope back as {result:{purpose, envelope}}.
// The table of words is DATA (vocab/words.json); the verbs and their inputs come from the vocabulary (verbs.json); the tokenizer is the door's own (handed in). Nothing here holds a rule of an engine.
// input: {text} (one word-line, e.g. `clash ARC MEP`, `cd Duplex`, `pwd`, `role 102`) | {result:{purpose, envelope}}.
// state: {building, kind, columns, erp, ecolumns, role, pending}. A key typed on the line wins over the context; the printed line carries every key, so it replays with no session.
(function (root) {
  'use strict';
  function create(o) {
    var words = o.words.words, choices = o.words.choices || {}, verbs = {}, tokenize = o.tokenize, pick = o.pickColumns, brk = o.brk || '', Menu = o.menuCore || null, interactive = !!o.interactive;
    o.vocab.verbs.forEach(function (v) { verbs[v.verb] = v; });
    var buildings = (o.buildings || []).slice();
    function init() { return { building: null, kind: null, columns: null, erp: null, ecolumns: null, role: null, pending: null, last: null, menu: null, pickFor: null }; }
    function prompt(st) {
      var where = st.erp ? st.erp : (st.building ? st.building + (st.kind ? '/' + st.kind : '') : '');
      return 'red1' + (st.role ? ' [' + st.role + ']' : '') + (where ? ' ' + where : '') + '> ';
    }
    function quote(v) { v = String(v); if (v.indexOf('"') >= 0) throw new Error('a value may not hold a double quote: ' + v); return /[\s=;]/.test(v) || v === '' ? '"' + v + '"' : v; }
    function lineOf(verb, args) {   // the canonical door line: inputs in the vocabulary's order, then the rest (filters) as typed
      var e = verbs[verb], names = e.inputs.map(function (i) { return i.name; }), keys = Object.keys(args);
      var order = names.filter(function (n) { return args[n] != null; }).concat(keys.filter(function (k) { return names.indexOf(k) < 0; }));
      return verb + order.map(function (k) { return ' ' + k + '=' + quote(args[k]); }).join('');
    }
    function where(st) { return st.erp ? 'erp' : (st.kind ? 'kind' : (st.building ? 'building' : 'any')); }
    function fits(form, w) { return form.in === 'any' || form.in === w || (form.in === 'building' && w === 'kind'); }
    function ctxArgs(st, e, args) {   // §22.4: the context fills only an input the verb has and the line did not give
      var has = function (n) { return e.inputs.some(function (i) { return i.name === n; }); }, app = e.verb.split('.')[0];
      var put = function (n, v) { if (v != null && has(n) && (args[n] == null || brk === 'ctxwins')) args[n] = v; };   // ctxwins: W-RED1-CD falsifier, the context beats a typed key (must FAIL C2)
      put('building', st.building);
      put('kind', app === 'object' ? st.kind : ((app === 'mis' || app === 'erp') ? st.erp : null));
      put('role', st.role);
    }
    function usage(w) { return w + ': ' + words[w].help + '  (here: ' + words[w].forms.map(function (f) { return f.in; }).join(', ') + ')'; }
    // a word-line -> {line} | {error}
    function expand(st, toks) {
      var w = toks[0].text, def = words[w];
      if (!def) return { error: '"' + w + '" is not a word of red1 (type help) nor a door line (app.verb key=value)' };
      if (w === 'ls' && st.last && (toks.length === 1 || (toks.length === 2 && toks[1].text.indexOf('=') < 0)))   // §22.6: the details of the last summary, the SAME line; §22.7 `ls <glob>` filters its rows (the shell's view: `line | glob`)
        return { line: st.last.line, verb: st.last.verb, args: st.last.args, view: 'rows', match: toks[1] ? toks[1].text : null };
      if (w === 'ls' && toks.length > 1 && toks.slice(1).some(function (t) { return t.text.indexOf('=') < 0; }) && (st.kind || st.erp))
        return { error: 'ls here filters a column: ls <column>=<glob>, e.g. ls ' + ((st.kind ? st.columns : st.ecolumns) || ['Name']).slice(-1)[0] + '=' + toks[1].text + '  (columns: ' + ((st.kind ? st.columns : st.ecolumns) || []).join(', ') + ')' };
      var here = where(st), form = def.forms.filter(function (f) { return fits(f, here); })[0];
      if (!form) return { error: w + ' works ' + def.forms.map(function (f) { return f.in === 'kind' ? 'in a kind (cd Element)' : f.in === 'building' ? 'in a building (cd Duplex)' : f.in === 'erp' ? 'in an ERP kind (cd "Business Partner")' : 'anywhere'; }).join(' or ') + '; you are ' + (here === 'any' ? 'nowhere yet' : 'in ' + (here === 'erp' ? st.erp : st.building + (st.kind ? '/' + st.kind : ''))) };
      var pos = [], args = {};
      toks.slice(1).forEach(function (t) { var m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(t.text); if (m && !(t.quoted && t.text.indexOf('=') < 0)) args[m[1]] = m[2]; else pos.push(t.text); });
      var verb = form.verb;
      if (form.pick) { var a = (pos.shift() || '').toLowerCase(); if (form.pick.indexOf(a) < 0) return { error: w + ' needs one of: ' + form.pick.join(', ') + ' — ' + usage(w) }; verb = verb.replace('{1}', a); }
      if (!verbs[verb]) return { error: 'the word ' + w + ' names a verb the vocabulary does not have: ' + verb };
      if (pos.length > form.args.length) return { error: 'too many values for ' + w + ' (' + pos.join(' ') + '); ' + usage(w) };
      pos.forEach(function (v, i) { if (args[form.args[i]] == null) args[form.args[i]] = v; });
      var e = verbs[verb]; ctxArgs(st, e, args);
      var colsHere = verb.indexOf('object.') === 0 ? st.columns : st.ecolumns;
      Object.keys(form.defaults || {}).forEach(function (k) { if (args[k] != null) return; var v = form.defaults[k]; if (v === '$columns') { if (colsHere && colsHere.length) args[k] = colsHere.join(','); } else args[k] = v; });
      // §22.8 R5: a required input still missing opens a pick menu of its legal values (interactive sessions only; elsewhere the door refuses, naming it)
      var miss = e.inputs.filter(function (i) { return i.required && args[i.name] == null; })[0];
      if (miss && interactive && Menu && choices[miss.type]) return { pick: { input: miss.name, type: miss.type, word: w, verb: verb } };
      return { line: lineOf(verb, args), verb: verb, args: args, confirm: !!def.confirm, view: form.summary ? 'summary' : null, draw: form.draw || null };
    }
    function step(st, input) {
      st = JSON.parse(JSON.stringify(st || init()));
      var effects = [], screen = [];
      var out = function () { return { state: st, effects: effects, screen: screen, prompt: prompt(st) }; };
      if (input.result) {
        var p = input.result.purpose, env = input.result.envelope || {}, ok = env.status === 'ok' && env.answer;
        if (p === 'choices') {
          var pf = st.pickFor, ch = choices[pf.type], rows = ok && Array.isArray(env.answer.rows) ? env.answer.rows : [];
          var vals = rows.map(function (r) { return Array.isArray(r) ? r[ch.col] : r[Object.keys(r)[ch.col]]; }).filter(function (v) { return v != null && v !== ''; });
          if (!vals.length) { st.pickFor = null; screen.push(pf.word + ': no ' + pf.input + ' to pick from (' + (env.why || 'the answer has no rows') + ')'); return out(); }
          st.menu = Menu.create({ items: vals.map(function (v) { return { name: String(v) }; }), title: pf.word + ': pick ' + pf.input + ' (' + vals.length + ')' });
          Menu.plain(Menu.render(st.menu)).forEach(function (l) { screen.push(l); }); return out();
        }
        if (p === 'cd-kind') {
          if (ok) { st.kind = env.answer.kind; st.columns = pick(env.answer.properties || []).cols; screen.push(st.building + '/' + st.kind + ': ' + (env.answer.properties || []).length + ' properties; ls shows ' + st.columns.join(', ')); return out(); }
          effects.push({ line: lineOf('mis.describe', { kind: st.pendingCd }), purpose: 'cd-erp' }); return out();
        }
        if (p === 'cd-erp') {
          var name = st.pendingCd; st.pendingCd = null;
          if (ok) { st.erp = env.answer.kind || name; st.ecolumns = pick(env.answer.properties || []).cols; st.building = null; st.kind = null; st.columns = null; screen.push(st.erp + ': ' + (env.answer.properties || []).length + ' properties; ls shows ' + st.ecolumns.join(', ')); return out(); }
          screen.push('cd: no building, kind or ERP window is named "' + name + '"' + (buildings.length ? ' (buildings: ' + buildings.join(', ') + ')' : '')); return out();
        }
        return out();
      }
      if (st.menu && (input.key != null || input.text != null)) {   // the pick menu has the keys: {key}, or (a piped session) a line of key names / a digit; an empty line = Enter
        var keys = input.key != null ? [input.key] : (String(input.text).trim() ? String(input.text).trim().split(/\s+/) : ['Enter']), picked = null;
        for (var ki = 0; ki < keys.length && st.menu; ki++) {
          var kk = keys[ki], km = { q: 'Esc', esc: 'Esc', enter: 'Enter', up: 'Up', down: 'Down' }[kk.toLowerCase()] || kk;
          var mr = Menu.step(st.menu, { key: km }); st.menu = mr.state;
          mr.effects.forEach(function (ef) { if (ef.picked) picked = ef.picked; });
          if (picked) { if (brk === 'pickwrong') { var it = st.menu.tree, ix = it.map(function (x) { return x.name; }).indexOf(picked.name); picked = it[(ix + 1) % it.length]; }   // W-RED1-MENU falsifier
            st.menu = null; }
          else if (st.menu.phase === 'quit') { st.menu = null; var cf = st.pickFor; st.pickFor = null; screen.push('cancelled: nothing was run (' + cf.word + ' needs ' + cf.input + ')'); return out(); }
        }
        if (st.menu) { Menu.plain(Menu.render(st.menu)).forEach(function (l) { screen.push(l); }); return out(); }
        var pf2 = st.pickFor; st.pickFor = null;
        screen.push(pf2.input + ' = ' + picked.name);
        var again = step(st, { text: pf2.text + ' ' + pf2.input + '=' + quote(picked.value) });   // the picked value goes on the line as key=value: the line then says what was chosen
        again.screen = screen.concat(again.screen); return again;
      }
      var text = String(input.text || '').trim();
      if (st.pending) {   // a y/N question is open
        var pend = st.pending; st.pending = null;
        if (/^y(es)?$/i.test(text)) effects.push({ line: pend, purpose: 'run' }); else screen.push('not done: ' + pend);
        return out();
      }
      var toks = tokenize(text); if (!toks.length) return out();
      var w = toks[0].text;
      if (w === 'cd') {
        st.last = null;
        var arg = toks.slice(1).map(function (t) { return t.text; }).join(' ');
        if (!arg || arg === '/') { var r0 = init(); r0.role = st.role; st = r0; return out(); }
        if (arg === '..') { if (st.kind) { st.kind = null; st.columns = null; } else if (st.building) st.building = null; else if (st.erp) { st.erp = null; st.ecolumns = null; } return out(); }
        var b = buildings.filter(function (x) { return x.toLowerCase() === arg.toLowerCase(); })[0];
        if (b) { st.building = b; st.kind = null; st.columns = null; st.erp = null; st.ecolumns = null; screen.push('building ' + b); return out(); }
        st.pendingCd = arg;
        if (st.building) effects.push({ line: lineOf('object.describe', { building: st.building, kind: arg }), purpose: 'cd-kind' });
        else effects.push({ line: lineOf('mis.describe', { kind: arg }), purpose: 'cd-erp' });
        return out();
      }
      if (w === 'pwd') {
        var k = []; if (st.building) k.push('building=' + quote(st.building)); if (st.kind) k.push('kind=' + quote(st.kind)); if (st.erp) k.push('kind=' + quote(st.erp)); if (st.role) k.push('role=' + st.role);
        screen.push(k.length ? k.join(' ') : '(nowhere: cd <building> or cd <ERP kind>)'); return out();
      }
      if (w === 'role') { var rr = toks[1] ? toks[1].text : ''; if (rr && !/^\d+$/.test(rr)) { screen.push('role is a number (an AD_Role id), got ' + rr); return out(); } st.role = rr || null; screen.push(rr ? 'role ' + rr + ' on every line' : 'no role'); return out(); }
      var x; try { x = expand(st, toks); } catch (err) { x = { error: err.message }; }
      if (x.error) { screen.push(x.error); return out(); }
      if (x.pick) { st.pickFor = { text: text, input: x.pick.input, type: x.pick.type, word: x.pick.word }; var c0 = choices[x.pick.type], ca = JSON.parse(JSON.stringify(c0.args || {})); ctxArgs(st, verbs[c0.verb], ca);
        effects.push({ line: lineOf(c0.verb, ca), purpose: 'choices' }); return out(); }
      var eff = { line: x.line, purpose: 'run', view: x.view || null, match: x.match || null, draw: x.draw || null };
      if (x.view === 'summary') st.last = { line: x.line, verb: x.verb, args: x.args }; else if (x.view !== 'rows') st.last = null;
      if (brk === 'dropkey' && x.args.building) eff.shown = x.line.replace(/ building=\S+/, '');   // W-RED1-WORDS falsifier: the printed line lacks the context key
      if (x.confirm) { st.pending = x.line; screen.push(x.line + '   run it? y/N'); return out(); }
      effects.push(eff); return out();
    }
    function wordList() { return Object.keys(words).map(function (w) { return { word: w, help: words[w].help, forms: words[w].forms }; }); }
    return { init: init, step: step, prompt: prompt, expand: expand, lineOf: lineOf, wordList: wordList, menuOpen: function (st) { return !!(st && st.menu); } };
  }
  var API = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WordsCore = API;
})(this);
