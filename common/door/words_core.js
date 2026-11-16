// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — words_core.js: the PURE expander of the red1 shell's short words (bim-compiler prompts/CLI_ERP_IVR.md §22.3-§22.5, steps R1 + R2; §24 help groups + DocAction codes). READ THE LOG of W-RED1-WORDS / W-RED1-CD after every change.
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
    if (!o.msg || typeof o.msg.t !== 'function') throw new Error('words_core: no message catalog handed in (o.msg = MsgCore.create(vocab/messages.json))');
    var M = o.msg.t;   // the person's text comes from the catalog (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §3, W-MSG-CATALOG)
    var SKIP = '\u0000leave-out';
    var LINKS = o.words.links || {}, SNAP = ['building', 'kind', 'columns', 'props', 'erp', 'ecolumns', 'eprops', 'ekey', 'etabs', 'rec', 'master'];
    function snap(st) { var s0 = {}; SNAP.forEach(function (k) { s0[k] = st[k] == null ? null : JSON.parse(JSON.stringify(st[k])); }); return s0; }   // §29.1: the place above, kept to come back to (cd ..)
    function tabOf(st, name) {   // a tab of the record the session is in: by the tab's name or the kind's, exact first, then ONE prefix
      var lo = String(name).toLowerCase(), ts = st.etabs || [], hit = ts.filter(function (t) { return String(t.tab).toLowerCase() === lo || String(t.kind).toLowerCase() === lo; })[0];
      if (hit) return hit; var pre = ts.filter(function (t) { return String(t.tab).toLowerCase().indexOf(lo) === 0 || String(t.kind).toLowerCase().indexOf(lo) === 0; }); return pre.length === 1 ? pre[0] : null;
    }
    function pcName(p) { return typeof p === 'string' ? p : p.name; }
    function got(obj, path) { return String(path).split('.').reduce(function (a, k) { return a == null ? null : a[k]; }, obj); }
    var LEVELS = ['short', 'student'];   // §0: Student is a LEVEL beside the language (VOCAB_MESSAGE_CATALOG.md)   // §25: the pick-list item that leaves an optional parameter out (never a value a record can have)
    function init() { return { building: null, kind: null, columns: null, props: null, erp: null, ecolumns: null, eprops: null, role: null, pending: null, last: null, menu: null, pickFor: null, paras: null, runFor: null, asking: null }; }
    function prompt(st) {
      // §29.1: a record is a place: the path is each place above (a record, then a tab of it) and this one: Project/BIM: Hospital/Project Phase
      var seg = function (s) { return s.erp + (s.rec ? '/' + s.rec.label : ''); };
      var where = st.erp ? (st.up || []).filter(function (s) { return s.erp; }).map(seg).concat([seg(st)]).join('/') : (st.building ? st.building + (st.kind ? '/' + st.kind : '') : '');
      return 'red1' + (st.role ? ' [' + st.role + ']' : '') + (where ? ' ' + where : '') + '> ';
    }
    function quote(v) { v = String(v); if (v.indexOf('"') >= 0) throw new Error(M('words.quote_in_value', v)); return /[\s=;]/.test(v) || v === '' ? '"' + v + '"' : v; }
    function lineOf(verb, args) {   // the canonical door line: inputs in the vocabulary's order, then the rest (filters) as typed
      var e = verbs[verb], names = e.inputs.map(function (i) { return i.name; }), keys = Object.keys(args);
      var order = names.filter(function (n) { return args[n] != null; }).concat(keys.filter(function (k) { return names.indexOf(k) < 0; }));
      return verb + order.map(function (k) { return ' ' + k + '=' + quote(args[k]); }).join('');
    }
    // §1d.1: the kind's properties, as the type assist needs them (name, label, type, list values), kept from the describe answer cd already read
    function slim(ps) { return (ps || []).map(function (q) { var o2 = { name: q.name, label: q.label || q.name, type: q.type, values: q.values || null }; if (q.seq != null) o2.seq = q.seq; if (q.displayed === false) o2.displayed = false; return o2; }); }   // seq + displayed=false kept only when the dictionary says them: the record view orders and filters by the window's own fields (§29.1)
    function where(st) { return st.erp ? 'erp' : (st.kind ? 'kind' : (st.building ? 'building' : 'any')); }
    function fits(form, w, st) { return (!form.for || (st && String(st.erp).toLowerCase() === String(form.for).toLowerCase())) && (form.in === 'any' || form.in === w || (form.in === 'building' && w === 'kind')); }   // form.for: a form of one ERP window only (status: Project)
    function ctxArgs(st, e, args) {   // §22.4: the context fills only an input the verb has and the line did not give
      var has = function (n) { return e.inputs.some(function (i) { return i.name === n; }); }, app = e.verb.split('.')[0];
      var put = function (n, v) { if (v != null && has(n) && (args[n] == null || brk === 'ctxwins')) args[n] = v; };   // ctxwins: W-RED1-CD falsifier, the context beats a typed key (must FAIL C2)
      put('building', st.building);
      put('kind', app === 'object' ? st.kind : ((app === 'mis' || app === 'erp') ? st.erp : null));
      put('role', st.role);
    }
    // §29.1 (D15): a word typed IN a record leaves out what the record already says: a missing id / number / record is the record's, and so is a process parameter that is the record's key
    function recFill(st, form, verb, args) {
      if (!st.rec || !st.erp || brk === 'norecfill') return;   // norecfill: W-RED1-RECORD falsifier (the context is not filled: must FAIL R5)
      if (args.kind != null && String(args.kind).toLowerCase() !== String(st.erp).toLowerCase()) return;
      (form.args || []).forEach(function (n) { if (args[n] != null) return;
        if (n === 'id' || n === 'record') args[n] = st.rec.id; else if (n === 'number') { if (st.rec.number != null) args[n] = st.rec.number; else if (verbs[verb] && verbs[verb].inputs.some(function (i) { return i.name === 'id'; }) && args.id == null) args.id = st.rec.id; } });
      if (verb === 'erp.process' && st.paras && st.paras.name === args.name && st.ekey && st.paras.rows.some(function (q) { return String(q.ColumnName).toLowerCase() === st.ekey.toLowerCase(); }) && !Object.keys(args).some(function (k) { return k.toLowerCase() === st.ekey.toLowerCase(); })) args[st.ekey] = st.rec.id;
    }
    function usage(w) { return M('words.usage', w, words[w].help, words[w].forms.map(function (f) { return f.in; }).join(', ')); }
    // a word-line -> {line} | {error}
    function expand(st, toks, xo) {
      var live = interactive && !(xo && xo.plain);
      var w = toks[0].text, def = words[w];
      if (!def) return { error: M('words.not_a_word', w) };
      if (w === 'ls' && st.last && (toks.length === 1 || (toks.length === 2 && toks[1].text.indexOf('=') < 0)))   // §22.6: the details of the last summary, the SAME line; §22.7 `ls <glob>` filters its rows (the shell's view: `line | glob`)
        return { line: st.last.line, verb: st.last.verb, args: st.last.args, view: 'rows', match: toks[1] ? toks[1].text : null };
      if (w === 'ls' && toks.length > 1 && toks.slice(1).some(function (t) { return t.text.indexOf('=') < 0; }) && (st.kind || st.erp))
        return { error: M('words.ls_filters_column', ((st.kind ? st.columns : st.ecolumns) || ['Name']).slice(-1)[0], toks[1].text, ((st.kind ? st.columns : st.ecolumns) || []).join(', ')) };
      if (w === 'ls' && st.rec && st.erp && toks.length === 1) { var ta = { kind: st.erp, id: st.rec.id }; ctxArgs(st, verbs['mis.read'], ta); return { line: lineOf('mis.read', ta), verb: 'mis.read', args: ta, draw: 'tabs', ctx: { tabs: st.etabs, label: st.rec.label, kind: st.erp } }; }   // §29.1: ls in a record = its child tabs with their counts
      var here = where(st), form = def.forms.filter(function (f) { return fits(f, here, st); })[0];
      if (!form && def.forms.some(function (f) { return f.for; })) return { error: M('words.works_for', w, def.forms.filter(function (f) { return f.for; })[0].for, here === 'any' ? M('words.here_nowhere') : (st.erp ? st.erp + (st.rec ? '/' + st.rec.label : '') : st.building + (st.kind ? '/' + st.kind : ''))) };   // a word of one window (status: Project): say which
      if (!form) { var WP = { kind: M('words.works_place.kind'), building: M('words.works_place.building'), erp: M('words.works_place.erp'), any: M('words.works_place.any') }, wk = def.forms.map(function (f) { return f.in === 'kind' || f.in === 'building' || f.in === 'erp' ? WP[f.in] : WP.any; }).join(M('words.works_list_or'));
        return { error: here === 'any' ? M('words.works_nowhere', w, wk) : M('words.works_in', w, wk, here === 'erp' ? st.erp : st.building + (st.kind ? '/' + st.kind : '')) }; }
      var pos = [], args = {};
      toks.slice(1).forEach(function (t) { var m = /^([A-Za-z_]\w*)=([\s\S]*)$/.exec(t.text); if (m && !(t.quoted && t.text.indexOf('=') < 0)) args[m[1]] = m[2]; else pos.push(t.text); });
      var verb = form.verb;
      if (form.pick) { var a0 = pos.shift() || '', code = form.codes && form.codes[a0.toUpperCase()]; if (code && brk === 'codes') code = form.pick[(form.pick.indexOf(code) + 1) % form.pick.length];   // §24 D12: a legacy DocAction code (CO VO CL RC) names the action; codes: W-RED1-HELP falsifier (a code names the next action: must FAIL H5)
        var a = (code || a0).toLowerCase(); if (form.pick.indexOf(a) < 0) return { error: M('words.needs_one_of', w, form.pick.join(', '), usage(w)) }; verb = verb.replace('{1}', a); }
      if (!verbs[verb]) return { error: M('words.verb_not_in_vocab', w, verb) };
      if (pos.length > form.args.length) return { error: M('words.too_many_values', w, pos.join(' '), usage(w)) };
      pos.forEach(function (v, i) { if (args[form.args[i]] == null) args[form.args[i]] = v; });
      // §29.6 P3c: a form may carry fixed inputs (data), take an input from the context by NAME (fill: {input: state field}), and fold the key=value words the person typed that the verb has no input for
      // into ONE text input (fold: its name): `post discipline=ARC` -> erp.process name="Fold from BIM" Building=<b> Selection="discipline=ARC"
      Object.keys(form.fixed || {}).forEach(function (k2) { args[k2] = form.fixed[k2]; });
      Object.keys(form.fill || {}).forEach(function (k2) { var v2 = st[form.fill[k2]]; if (v2 != null && args[k2] == null) args[k2] = v2; });
      if (form.fold && verbs[verb]) { var vin = verbs[verb].inputs.map(function (i) { return i.name; }), parts = [];
        Object.keys(args).forEach(function (k2) { if (vin.indexOf(k2) >= 0 || (form.fill && form.fill[k2] != null) || (form.fixed && form.fixed[k2] != null) || k2 === form.fold) return; parts.push(k2 + '=' + (/\s/.test(args[k2]) ? '"' + args[k2] + '"' : args[k2])); delete args[k2]; });
        if (parts.length) args[form.fold] = parts.join(' '); }
      var e = verbs[verb]; ctxArgs(st, e, args); recFill(st, form, verb, args);
      if (st.master && form.master && brk !== 'nomaster') {   // §29.1: a tab opened from a record is that tab FILTERED BY ITS LINK: a list word carries master=Parent/id, a new row gets the link column (data on the form)
        if (form.master === 'filter' && args.master == null) args.master = st.master.kind + '/' + st.master.id; else if (form.master === 'link' && args[st.master.link] == null) args[st.master.link] = st.master.id; }
      var colsHere = verb.indexOf('object.') === 0 ? st.columns : st.ecolumns;
      Object.keys(form.defaults || {}).forEach(function (k) { if (args[k] != null) return; var v = form.defaults[k]; if (v === '$columns') { if (colsHere && colsHere.length) args[k] = colsHere.join(','); } else args[k] = v; });
      // §25 D13: `run` in a session asks for each parameter not typed, one at a time, in AD_Process_Para SeqNo order (the legacy dialog's order), read by ONE door line
      if (form.ask === 'params' && live && args.name) {
        var PR = st.paras; if (!PR || PR.name !== args.name) return { params: { name: args.name } };
        var nx = PR.rows.filter(function (q) { var c = q.ColumnName; return c && !Object.keys(args).some(function (k2) { return k2.toLowerCase() === c.toLowerCase(); }) && PR.skipped.indexOf(c) < 0; });
        if (brk === 'paramorder' && nx.length > 1) nx = nx.slice().reverse();   // W-RED1-RUN falsifier: the questions out of SeqNo order (must FAIL R2)
        if (nx.length) return { ask: nx[0], args: args, verb: verb };
      }
      // §22.8 R5: a required input still missing opens a pick menu of its legal values (interactive sessions only; elsewhere the door refuses, naming it)
      var miss = e.inputs.filter(function (i) { return i.required && args[i.name] == null; })[0];
      if (miss && live && Menu && choices[miss.type]) return { pick: { input: miss.name, type: miss.type, word: w, verb: verb } };
      return { line: lineOf(verb, args), verb: verb, args: args, confirm: (!!def.confirm || (form.confirm === 'session' && live)) && brk !== 'noconfirm', view: form.summary ? 'summary' : null, draw: form.draw || null, ctx: form.ctx ? { props: st.eprops, key: st.ekey, kind: st.erp } : null };
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
          if (!vals.length) { st.pickFor = null; screen.push(M('words.pick_none', pf.word, pf.input, env.why || M('words.answer_no_rows'))); return out(); }
          st.menu = Menu.create({ items: vals.map(function (v) { return { name: String(v) }; }), title: M('words.pick_title', pf.word, pf.input, vals.length) });
          Menu.plain(Menu.render(st.menu)).forEach(function (l) { screen.push(l); }); return out();
        }
        if (p === 'run-paras') {   // the process's parameters, in SeqNo order; then the same word-line again (now it can ask)
          var rf = st.runFor; st.runFor = null;
          st.paras = { name: rf.name, rows: ok && Array.isArray(env.answer.rows) ? env.answer.rows : [], skipped: [] };
          if (!st.paras.rows.length) screen.push(M('words.run_no_params', rf.name, env.why || M('words.none_in_dictionary')));
          var ag = step(st, { text: rf.text }); ag.screen = screen.concat(ag.screen); return ag;
        }
        if (p === 'lookup') {   // a table-direct parameter: its legal records as a pick list (value = the id, shown with its name)
          var lf = st.pickFor, lr = ok && Array.isArray(env.answer.rows) ? env.answer.rows : [];
          if (!lr.length) { st.pickFor = null; st.asking = lf.ask; var lw = env.answer && env.answer.why ? env.answer.why : env.why ? env.why : null, le = lf.ask.def || (lf.ask.mandatory ? M('words.enter_needed') : M('words.enter_none'));
            screen.push(lw ? M('words.lookup_none_why', lf.ask.label, lf.input, lw, le) : M('words.lookup_none', lf.ask.label, lf.input, le)); return out(); }
          st.menu = Menu.create({ items: (lf.ask.mandatory ? [] : [{ name: M('words.leave_out_item'), value: SKIP }]).concat(lr.map(function (r) { var ks = Object.keys(r); return r.value !== undefined ? { name: r.name + ' · ' + r.value, value: r.value } : { name: (r.Name != null ? r.Name + ' · ' : '') + r[ks[0]], value: r[ks[0]] }; })), title: M('words.run_pick_title', lf.ask.label, lf.input, lr.length) });
          Menu.plain(Menu.render(st.menu)).forEach(function (l) { screen.push(l); }); return out();
        }
        if (p === 'offer') {   // §29.3 (D16): a run answer carries the engine's next step {key, line}; a SESSION asks it (y runs the exact line, anything else runs nothing); one-shot and AI get no question, the line is in the envelope's `next`
          var of0 = env.offer; if (!interactive || !of0 || !of0.line) return out();
          var said = of0.key === 'generate' ? M('words.offer_generate', of0.line) : of0.key === 'open_project' ? M('words.offer_open_project', of0.line) : of0.key === 'issue_vo' ? M('words.offer_issue_vo', of0.line) : of0.key === 'approve_vo' ? M('words.offer_approve_vo', of0.line) : of0.key === 'see_status' ? M('words.offer_see_status', of0.line) : null;   // a closed set: an offer with no catalog text is not asked, never invented
          if (said == null) return out();
          st.offer = { key: of0.key, line: of0.line }; screen.push(said); return out();
        }
        if (p === 'cd-kind') {
          if (ok) { st.kind = env.answer.kind; st.columns = pick(env.answer.properties || []).cols; st.props = slim(env.answer.properties); screen.push(M('words.cd_kind_ok', st.building, st.kind, (env.answer.properties || []).length, st.columns.join(', '))); return out(); }
          effects.push({ line: lineOf('mis.describe', { kind: pcName(st.pendingCd) }), purpose: 'cd-erp' }); return out();
        }
        if (p === 'cd-erp') {
          var pc = typeof st.pendingCd === 'string' ? { name: st.pendingCd } : st.pendingCd;   // a plain `cd X` keeps its text (string); a record or alternative reading is an object
          if (ok) {
            st.pendingCd = null; st.erp = env.answer.kind || pc.name; st.ecolumns = pick(env.answer.properties || []).cols; st.eprops = slim(env.answer.properties); if (env.answer.key) st.ekey = env.answer.key; if (env.answer.childTabs) st.etabs = env.answer.childTabs;
            st.building = null; st.kind = null; st.columns = null; if (st.rec) st.rec = null; if (st.master) st.master = null; if (pc.up) st.up = pc.up; else if (st.up && st.up.length) st.up = [];   // (a field is touched only when it holds something: the state of a plain `cd` stays what P2a made, W-MSG-CATALOG M1)
            if (pc.id != null || pc.ref != null) {   // §29.1: a record named with the kind: its row is read next (by id from a link, by number or name as typed)
              st.pendingRead = { ref: pc.ref != null ? pc.ref : null, id: pc.id != null ? pc.id : null, by: pc.id != null ? 'id' : 'number' };
              var ra = pc.id != null ? { kind: st.erp, id: pc.id } : { kind: st.erp, number: pc.ref }; ctxArgs(st, verbs['mis.read'], ra);
              effects.push({ line: lineOf('mis.read', ra), purpose: 'rec-read' }); return out(); }
            screen.push(M('words.cd_erp_ok', st.erp, (env.answer.properties || []).length, st.ecolumns.join(', '))); return out(); }
          if (pc.alt) { st.pendingCd = { name: pc.alt.name, ref: pc.alt.ref, first: pc.first }; effects.push({ line: lineOf('mis.describe', { kind: pc.alt.name }), purpose: 'cd-erp' }); return out(); }   // `cd Project Hospital`: the whole text is no kind, so the first word is
          st.pendingCd = null; var nm = pc.first || pc.name;
          screen.push(buildings.length ? M('words.cd_unknown_buildings', nm, buildings.join(', ')) : M('words.cd_unknown', nm)); return out();
        }
        if (p === 'rec-read') {   // the record named by `cd <kind> <number|name>` (or by a link): its row
          var pr = st.pendingRead, R0 = ok && env.answer && env.answer.record;
          if (R0) {
            st.pendingRead = null; var kc = String(st.ekey || '').toLowerCase(), no = R0.documentno != null ? String(R0.documentno) : null, lab = R0.documentno != null ? R0.documentno : (R0.name != null ? R0.name : (R0.value != null ? R0.value : R0[kc]));
            st.rec = { id: R0[kc], label: String(lab), number: no };
            screen.push(M('words.cd_record_ok', st.erp, st.rec.label, (st.etabs || []).length, (st.etabs || []).map(function (t) { return t.tab; }).join(', '))); return out(); }
          if (pr.by === 'number' && pr.ref != null && /^\d+$/.test(String(pr.ref))) { pr.by = 'id'; pr.why = env.why || null; var rb = { kind: st.erp, id: pr.ref }; ctxArgs(st, verbs['mis.read'], rb); effects.push({ line: lineOf('mis.read', rb), purpose: 'rec-read' }); return out(); }   // a whole number is a DocumentNo first, then an id
          st.pendingRead = null; screen.push(M('words.cd_record_none', st.erp, pr.ref != null ? pr.ref : pr.id, (pr.why || env.why || M('words.answer_no_rows')))); return out();   // the first refusal (as a number) is the one that says why, e.g. two records carry it
        }
        if (p === 'cd-tab') {   // §29.1: a tab of the record = that tab's window, FILTERED BY ITS LINK to the record (the master= filter every list word then carries)
          var ptb = st.pendingCd; st.pendingCd = null;
          if (!ok) { screen.push(M('words.cd_tab_fail', ptb.tab.tab, env.why || M('words.answer_no_rows'))); return out(); }
          var parent = snap(st); st.up = (st.up || []).concat([parent]); st.master = { kind: st.erp, id: st.rec.id, link: ptb.tab.link, label: st.rec.label };
          st.erp = env.answer.kind || ptb.tab.kind; st.ecolumns = pick(env.answer.properties || []).cols; st.eprops = slim(env.answer.properties); st.ekey = env.answer.key || null; st.etabs = env.answer.childTabs || []; st.rec = null;
          screen.push(M('words.cd_tab_ok', st.erp, st.master.kind, st.master.label, st.master.link, st.ecolumns.join(', '))); return out();
        }
        if (p === 'link') {   // §29.1: a link word (data: words.json links) took the building to its record in another app; the link's own verb answers which record
          var plk = st.pendingCd; st.pendingCd = null;
          if (!ok) { screen.push(M('words.link_fail', plk.link.kind, st.building, env.why || M('words.answer_no_rows'))); return out(); }
          var lid = got(env.answer, plk.link.id);
          if (lid == null || brk === 'nolink') { screen.push(M('words.link_none', plk.link.kind, st.building, plk.link.then || '')); return out(); }
          st.pendingCd = { name: plk.link.kind, id: lid, up: [snap(st)] }; effects.push({ line: lineOf('mis.describe', { kind: plk.link.kind }), purpose: 'cd-erp' }); return out();
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
          else if (st.menu.phase === 'quit') { st.menu = null; var cf = st.pickFor; st.pickFor = null; screen.push(M('words.cancelled_pick', cf.word, cf.input)); return out(); }
        }
        if (st.menu) { Menu.plain(Menu.render(st.menu)).forEach(function (l) { screen.push(l); }); return out(); }
        var pf2 = st.pickFor; st.pickFor = null;
        if (picked.value === SKIP) { st.paras.skipped.push(pf2.input); screen.push(M('words.left_out', pf2.input)); var sp = step(st, { text: pf2.text }); sp.screen = screen.concat(sp.screen); return sp; }   // §25: an optional parameter left out
        screen.push(M('words.picked', pf2.input, picked.name));
        var again = step(st, { text: pf2.text + ' ' + pf2.input + '=' + quote(picked.value) });   // the picked value goes on the line as key=value: the line then says what was chosen
        again.screen = screen.concat(again.screen); return again;
      }
      var text = String(input.text || '').trim();
      if (st.asking) {   // §25: a parameter question is open: Enter keeps the default (or leaves an optional one out), q cancels
        var q = st.asking; st.asking = null;
        if (/^(q|esc)$/i.test(text)) { st.paras = null; screen.push(M('words.cancelled')); return out(); }
        var val = text !== '' ? text : (q.def != null && q.def !== '' && String(q.def).indexOf('@') < 0 ? String(q.def) : null);
        if (val == null && q.mandatory) { st.asking = q; screen.push(M('words.param_needed', q.label, q.input, q.question)); return out(); }
        if (val == null) { st.paras.skipped.push(q.input); var sk = step(st, { text: q.text }); sk.screen = screen.concat(sk.screen); return sk; }
        var an = step(st, { text: q.text + ' ' + q.input + '=' + quote(val) }); an.screen = screen.concat(an.screen); return an;
      }
      if (st.offer) {   // the offer's y/N is open: y runs its line (a door line, or a word such as `cd project`); anything else runs nothing
        var ofr = st.offer; st.offer = null;
        if (/^y(es)?$/i.test(text)) { if (verbs[ofr.line.split(/\s/)[0]]) effects.push({ line: ofr.line, purpose: 'run' }); else { var fw = step(st, { text: ofr.line }); fw.screen = screen.concat(fw.screen); return fw; } return out(); }
        screen.push(M('words.not_done', ofr.line));
        if (/^(n|no)?$/i.test(text)) return out();   // n, no or an empty Return is the answer: nothing runs. Anything else is a new command: the offer lapses (nothing runs for it) and the command goes on as typed
        var nx2 = step(st, { text: text }); nx2.screen = screen.concat(nx2.screen); return nx2;
      }
      if (st.pending) {   // a y/N question is open
        var pend = st.pending; st.pending = null;
        if (/^y(es)?$/i.test(text)) effects.push({ line: pend, purpose: 'run' }); else screen.push(M('words.not_done', pend));
        return out();
      }
      var toks = tokenize(text); if (!toks.length) return out();
      var w = toks[0].text;
      if (w === 'cd') {
        st.last = null;
        var arg = toks.slice(1).map(function (t) { return t.text; }).join(' ');
        if (!arg || arg === '/') { var r0 = init(); r0.role = st.role; if (st.level) r0.level = st.level; st = r0; return out(); }
        if (arg === '..') {
          if (st.erp && st.rec) st.rec = null;   // a record is below its list
          else if (st.erp && st.up && st.up.length) { var top = st.up.pop(); SNAP.forEach(function (k) { st[k] = top[k]; }); }   // a tab goes back to its record; a record reached by a link, to the building
          else if (st.kind) { st.kind = null; st.columns = null; } else if (st.building) st.building = null; else if (st.erp) { st.erp = null; st.ecolumns = null; }
          return out();
        }
        var b = buildings.filter(function (x) { return x.toLowerCase() === arg.toLowerCase(); })[0];
        if (b) { st.building = b; st.kind = null; st.columns = null; st.erp = null; st.ecolumns = null; if (st.rec) st.rec = null; if (st.master) st.master = null; if (st.up && st.up.length) st.up = []; screen.push(M('words.cd_building', b)); return out(); }
        if (st.erp && st.rec) { var tb = tabOf(st, arg); if (tb) { st.pendingCd = { tab: tb }; effects.push({ line: lineOf('mis.describe', { kind: tb.kind }), purpose: 'cd-tab' }); return out(); } }   // §29.1: a tab of the record
        var LK = LINKS[arg.toLowerCase()];
        if (LK && LK.in === 'building' && st.building && brk !== 'kindfirst') { st.pendingCd = { link: LK }; effects.push({ line: lineOf(LK.verb, { building: st.building }), purpose: 'link' }); return out(); }   // §29.1: a link word is never a kind of the building (the film's "no such table: c_project")
        var tk = toks.slice(1), pcd = { name: arg, first: arg };
        if (tk.length > 1) { var rest = tk.slice(1).map(function (t) { return t.text; }).join(' '); if (tk[0].quoted) pcd = { name: tk[0].text, ref: rest, first: arg }; else pcd.alt = { name: tk[0].text, ref: rest }; }   // `cd "Business Partner" Joe`: the first word is the kind; `cd Project Hospital`: the whole text first, then the first word
        st.pendingCd = (pcd.alt || pcd.ref != null) ? pcd : arg;
        if (st.building) effects.push({ line: lineOf('object.describe', { building: st.building, kind: pcd.name }), purpose: 'cd-kind' });
        else effects.push({ line: lineOf('mis.describe', { kind: pcd.name }), purpose: 'cd-erp' });
        return out();
      }
      if (w === 'pwd') {
        var k = []; if (st.building) k.push('building=' + quote(st.building)); if (st.kind) k.push('kind=' + quote(st.kind)); if (st.erp) k.push('kind=' + quote(st.erp)); if (st.rec) k.push('id=' + quote(st.rec.id)); if (st.master) k.push('master=' + quote(st.master.kind + '/' + st.master.id)); if (st.role) k.push('role=' + st.role);
        screen.push(k.length ? k.join(' ') : M('words.pwd_nowhere')); return out();
      }
      if (w === 'role') { var rr = toks[1] ? toks[1].text : ''; if (rr && !/^\d+$/.test(rr)) { screen.push(M('words.role_not_number', rr)); return out(); } st.role = rr || null; screen.push(rr ? M('words.role_set', rr) : M('words.role_none')); return out(); }
      if (w === 'level') { var lv = toks[1] ? toks[1].text.toLowerCase() : 'short'; if (LEVELS.indexOf(lv) < 0) { screen.push(M('words.level_bad', toks[1].text, LEVELS.join(', '))); return out(); }
        if (lv === 'short') delete st.level; else st.level = lv; screen.push(lv === 'short' ? M('words.level_short') : M('words.level_student')); return out(); }   // §4 P3a: a person's setting beside the language
      var x; try { x = expand(st, toks); } catch (err) { x = { error: err.message }; }
      if (x.error) { screen.push(x.error); return out(); }
      if (x.params) { st.runFor = { text: text, name: x.params.name }; effects.push({ line: lineOf('mis.list', { kind: 'AD_Process_Para', columns: 'ColumnName,Name,IsMandatory,DefaultValue,SeqNo,AD_Reference_ID', sort: 'SeqNo', limit: '50', master: 'Process/' + x.params.name }), purpose: 'run-paras' }); return out(); }
      if (x.ask) {
        var a1 = x.ask, def = a1.DefaultValue, ctxDef = def != null && String(def).indexOf('@') >= 0, qq = { text: text, input: a1.ColumnName, label: a1.Name || a1.ColumnName, def: ctxDef ? null : def, mandatory: a1.IsMandatory === 'Y' && !ctxDef };
        qq.question = qq.def != null && qq.def !== '' ? M('words.ask_default', qq.label, qq.input, qq.def) : qq.mandatory ? M('words.ask_needed', qq.label, qq.input) : ctxDef ? M('words.ask_context', qq.label, qq.input) : M('words.ask_none', qq.label, qq.input);
        if (ctxDef) { st.paras.skipped.push(qq.input); var cs = step(st, { text: text }); cs.screen = screen.concat(cs.screen); return cs; }   // a context default (@…@): the engine fills it, as the dialog does
        if (Number(a1.AD_Reference_ID) === 19 && Menu && /_ID$/i.test(qq.input)) {   // table direct: the table is the column name without _ID (the dictionary's own rule)
          var tb = qq.input.replace(/_ID$/i, '');
          // §27: the legal values through mis.lookup (the parameter's validation rule), with the parameters already answered as its context
          var la = { process: x.args.name, column: qq.input, limit: '50' }, vins = (verbs[x.verb] || { inputs: [] }).inputs.map(function (i) { return i.name; });
          Object.keys(x.args).forEach(function (k3) { if (vins.indexOf(k3) < 0) la[k3] = x.args[k3]; });
          st.pickFor = { text: text, input: qq.input, word: 'run', ask: qq }; effects.push({ line: lineOf('mis.lookup', la), purpose: 'lookup' }); return out();
        }
        st.asking = qq; screen.push(qq.question); return out();
      }
      if (x.pick) { st.pickFor = { text: text, input: x.pick.input, type: x.pick.type, word: x.pick.word }; var c0 = choices[x.pick.type], ca = JSON.parse(JSON.stringify(c0.args || {})); ctxArgs(st, verbs[c0.verb], ca);
        effects.push({ line: lineOf(c0.verb, ca), purpose: 'choices' }); return out(); }
      var eff = { line: x.line, purpose: 'run', view: x.view || null, match: x.match || null, draw: x.draw || null }; if (x.ctx) eff.ctx = x.ctx;   // ctx only when a drawing needs the kind's dictionary rows (§29.1)
      if (x.view === 'summary') st.last = { line: x.line, verb: x.verb, args: x.args }; else if (x.view !== 'rows') st.last = null;
      if (brk === 'dropkey' && x.args.building) eff.shown = x.line.replace(/ building=\S+/, '');   // W-RED1-WORDS falsifier: the printed line lacks the context key
      if (x.verb === 'erp.process') st.paras = null;   // the questions are done: the next run reads its parameters again
      if (x.confirm) { st.pending = x.line; screen.push(M('words.confirm_run', x.line)); return out(); }
      effects.push(eff); return out();
    }
    // §24 D10-D11: the help text, PURE (the session and a one-shot `red1 help` print the same bytes). topic '' = the three groups; 'bim'|'mis'|'erp' = a group,
    // one typed example per form; a word = its detail (where it works, which door verb); anything else -> null (the driver hands it to the door's own help).
    var G = o.words.groups || {}, GN = Object.keys(G).filter(function (g) { return g !== '_'; }), EV = o.words.everywhere || [];
    function groupOf(verb) { var app = verb.split('.')[0]; return GN.filter(function (g) { return (G[g].apps || []).indexOf(app) >= 0; })[0] || null; }
    var PLACE = { building: M('words.place.building'), kind: M('words.place.kind'), erp: M('words.place.erp'), any: M('words.place.any') }, ORDER = ['building', 'kind', 'erp', 'any'];
    function short(h) { return String(h).split(':')[0]; }
    function formsOf(g) {
      var rows = [];
      Object.keys(words).forEach(function (w) { words[w].forms.forEach(function (f) { if (groupOf(f.verb) === g) rows.push({ word: w, form: f }); }); });
      if (brk === 'dropform' && rows.length) rows.shift();   // W-RED1-HELP falsifier: one form left out of its group (must FAIL H2)
      return rows;
    }
    function pad(rows) { var wid = Math.max.apply(null, rows.map(function (r) { return r[0].length; }).concat([4])); return rows.map(function (r) { return '  ' + r[0] + new Array(wid - r[0].length + 3).join(' ') + r[1]; }); }
    // §4 P3a: the Student block of one form, every fact from the vocabulary: the verb's description and its inputs (verbs.json), the example expanded in the sample place
    var SAMPLE = { building: { building: 'Duplex' }, kind: { building: 'Duplex', kind: 'Element', columns: ['guid'] }, erp: { erp: 'Order', ecolumns: ['DocumentNo'] }, any: {} };
    function studentBlock(w, f) {
      var sp = Object.assign({}, SAMPLE[f.in] || {}, f.for ? { erp: f.for } : {}), st = Object.assign(init(), sp), x, lines = [];   // a form of one window (form.for, data) is shown in THAT window
      var exT = String(f.ex || w).replace(/<([A-Za-z_]\w*)>=<([^<>\s]+)>/g, '$1=$2');   // a placeholder pair <Key>=<value> is read as Key=value, the shape the word's own help shows (new Column=value …)
      try { x = expand(st, tokenize(exT), { plain: true }); } catch (err) { x = { error: err.message }; }
      if (brk === 'dropctx' && x.args) { delete x.args.building; x.line = lineOf(x.verb, x.args); }   // W-HELP-STUDENT falsifier: the worked line loses its building (must FAIL S3)
      var e = x.line && verbs[x.verb]; if (!e) return lines;
      var dsc = e.description; if (brk === 'swapdesc') { var vs = Object.keys(verbs), o2 = verbs[vs[(vs.indexOf(x.verb) + 1) % vs.length]]; dsc = o2.description; }   // W-HELP-STUDENT falsifier (must FAIL S2)
      if (dsc) lines.push(M('words.student.does', dsc));
      var inp = function (n) { return e.inputs.filter(function (i) { return i.name === n; })[0]; };
      var you = (f.pick ? [M('words.student.action', f.pick.join(', '))] : []).concat((f.args || []).map(function (n) { var i = inp(n); return i && i.description ? M('words.student.input', n, i.description) : n; }));
      lines.push(you.length ? M('words.student.you_type', you.join(M('words.student.sep'))) : M('words.student.you_type_none'));
      var ctx = {}; ctxArgs(st, e, ctx); var typed = tokenize(exT).slice(1).map(function (t) { var m = /^([A-Za-z_]\w*)=/.exec(t.text); return m ? m[1] : null; });
      var from = Object.keys(ctx).filter(function (n) { return typed.indexOf(n) < 0 && x.args[n] === ctx[n]; });
      if (from.length) lines.push(M('words.student.from_here', from.join(', ')));
      var place = f.in === 'kind' ? sp.building + '/' + sp.kind : f.in === 'building' ? sp.building : f.in === 'erp' ? sp.erp : null;
      lines.push(place ? M('words.student.example_in', place, x.line) : M('words.student.example', x.line));
      return lines;
    }
    function helpText(topic, level) {
      topic = String(topic || '').trim();
      if (!topic) {
        var nw = function (g) { var seen = {}; formsOf(g).forEach(function (r) { seen[r.word] = 1; }); return Object.keys(seen).length; }, tw = Math.max.apply(null, GN.map(function (g) { return G[g].title.length; }));
        var tl = GN.map(function (g) { return [g, M('words.help_group_row', G[g].title + new Array(tw - G[g].title.length + 4).join(' '), G[g].start, nw(g))]; });
        return [M('words.help_intro')].concat(pad(tl), [M('words.help_everywhere', EV.map(function (e) { return e[0]; }).join(' · ')),
          M('words.help_footer')]).join('\n') + '\n';
      }
      if (G[topic] && topic !== '_') {
        var fr = formsOf(topic), out = [M('words.help_group_head', topic, G[topic].title, G[topic].start)], first = true;
        ORDER.forEach(function (pl) {
          var here = fr.filter(function (r) { return r.form.in === pl; }).map(function (r) { var ex = r.form.ex || r.word; if (brk === 'badexample' && first) { ex += ' zz zz zz'; first = false; } return [ex, short(words[r.word].help)]; });
          if (pl === 'any') here = here.concat(G[topic].session || []);   // the group's session words (menu) work anywhere
          if (!here.length) return;
          out.push(M('words.help_place_head', PLACE[pl])); pad(here).forEach(function (l) { out.push(l); });
        });
        return out.join('\n') + '\n';
      }
      if (words[topic]) {
        var d = words[topic];
        return M('words.help_word_head', topic, d.help) + '\n' + d.forms.map(function (f) { var vb = f.verb.replace('{1}', M('words.help_action_placeholder')); var fl = f.codes ? M('words.help_word_form_codes', PLACE[f.in], f.ex || topic, vb, Object.keys(f.codes).map(function (c) { return c + ' ' + f.codes[c]; }).join(', ')) : M('words.help_word_form', PLACE[f.in], f.ex || topic, vb); return level === 'student' ? [fl].concat(studentBlock(topic, f)).join('\n') : fl; }).join('\n') + '\n';
      }
      return null;
    }
    function wordList() { return Object.keys(words).map(function (w) { return { word: w, help: words[w].help, forms: words[w].forms }; }); }
    return { init: init, step: step, prompt: prompt, expand: expand, lineOf: lineOf, wordList: wordList, helpText: helpText, groupOf: groupOf, menuOpen: function (st) { return !!(st && st.menu); } };
  }
  var API = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WordsCore = API;
})(this);
