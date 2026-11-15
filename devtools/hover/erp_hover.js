// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-ERP-HOVER), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.22 (decision F-17). DEV-ONLY: never loaded by a shipped page.
// ISSUE: "what code runs when I touch this ERP field?" needed the dictionary and four registries read by hand. Hover the field: every registered layer, in the order it fires, each with its
//        owner (base or a plugin, and its rank) and the file:line that registered it, plus the iDempiere Java file that file cites. Keys 1-9 open that layer's line in VS Code.
// WHAT:  stackFor(table, column, ctx) is PURE (the node witness calls it on every AD window field). install(window) is the page half, loaded by a bookmarklet from the localhost server:
//        it reads the page's own DB (window.__idmpDb) and the registries' describe(); it hovers [data-ad-table][data-ad-column] elements (the form rows, erp/crud_overlay.js).
//        A layer with nothing registered says UNPORTED, a line not in the index says so: it never guesses a file. Changes nothing in the ERP.
// LOG:   §ERP_HOVER installed index_entries=N · §ERP_HOVER table= column= layers=K [step:kind:name@file:line …]   Read the log after every run - exit code is not evidence.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root && root.document) api.install(root);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var STEPS = ['field', 'on change', 'picker', 'on save', 'button'];
  function sitesOf(index, kind, pred) { return ((index && index.entries) || []).filter(function (e) { return e.kind === kind && pred(e); }).map(function (e) { return e.file + ':' + e.line; }); }
  // the Java file a layer was ported from: the citation ON/just above its registration (erp_sites.js), else the file's own first citation ONLY when that Java class has the port's name
  //   (callouts/CalloutOrder.js -> CalloutOrder.java); otherwise null: never a citation from elsewhere guessed onto it
  function legacyOf(index, at) {
    var m = at && /^(.*):(\d+)$/.exec(at), e = m && ((index && index.entries) || []).filter(function (x) { return x.file === m[1] && x.line === Number(m[2]); })[0];
    if (e && e.legacy) return e.legacy;
    var fl = m && index && index.legacy ? index.legacy[m[1]] : null, base = m ? m[1].split('/').pop().replace(/\.js$/, '') : '';
    return fl && fl.split(':')[0] === base + '.java' ? fl : null; }
  function layer(index, step, kind, name, owner, at, note) { return { step: step, kind: kind, name: name, owner: owner || null, at: at || null, legacy: legacyOf(index, at), note: note || null }; }
  // ctx: { q(sql, params) -> rows with lower-case keys, callouts: AdCallout API, models: ModelLayer API, validators: AdModelVal API, processes: AdProcess API, index: erp_index.json }
  function stackFor(table, column, ctx) {
    var ix = ctx.index, out = [], t = String(table).toLowerCase();
    var row = (ctx.q('SELECT t.tablename, c.columnname, c.ad_reference_id, r.name AS reference, c.defaultvalue, c.callout, c.ad_val_rule_id, c.ad_process_id, c.ismandatory, c.readonlylogic, c.mandatorylogic, c.entitytype ' +
      'FROM ad_column c JOIN ad_table t ON t.ad_table_id = c.ad_table_id LEFT JOIN ad_reference r ON r.ad_reference_id = c.ad_reference_id WHERE lower(t.tablename) = ? AND lower(c.columnname) = ?', [t, String(column).toLowerCase()]) || [])[0];
    if (!row) return { table: table, column: column, found: false, layers: [] };
    table = row.tablename;   // the dictionary's spelling (the page writes c_order, the dictionary C_Order)
    var bits = [row.reference || ('reference ' + row.ad_reference_id)]; if (row.ismandatory === 'Y') bits.push('mandatory'); if (row.defaultvalue) bits.push('default ' + row.defaultvalue);
    if (row.readonlylogic) bits.push('read-only when ' + row.readonlylogic); if (row.mandatorylogic) bits.push('mandatory when ' + row.mandatorylogic);
    out.push(layer(ix, 'field', 'dictionary', table + '.' + row.columnname, row.entitytype ? 'entity ' + row.entitytype : null, null, bits.join(' · ')));
    // ON CHANGE: AD_Column.Callout (Class.method; several, ';'-separated) in order, then the per-column callouts (IColumnCallout)
    var C = ctx.callouts, cdesc = C && C.describe ? C.describe() : { classes: {}, handlers: {} };
    String(row.callout || '').split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (cmd) {
      var i = cmd.lastIndexOf('.'), cls = cmd.slice(0, i), meth = cmd.slice(i + 1), short = cls.split('.').pop();
      // presence is the ENGINE's own answer (ad_callout.js getCallout :442: the class registry, base classes put in directly, legacy handlers), never describe() alone:
      //   describe() lists only the layered registrations and missed CalloutEngine (put in directly at :512), so v1 of this hover called its dateAcct UNPORTED (2026-11-15)
      var present = C && C.getCallout ? !!C.getCallout(cls, meth) : null, owners = cdesc.classes[cls] || cdesc.classes[short] || (present ? ['core (base class)'] : null), handler = cdesc.handlers && cdesc.handlers[cmd];
      if (owners && present !== false) { var at = sitesOf(ix, 'callout-method', function (e) { return e.key === cls + '.' + meth || (e.key.split('.').slice(-2).join('.') === short + '.' + meth); });
        if (!at.length) at = sitesOf(ix, 'callout', function (e) { return e.key === cls || e.key.split('.').pop() === short; });
        out.push(layer(ix, 'on change', 'callout', short + '.' + meth, owners.join(' > '), at[0], at.length > 1 ? 'also at ' + at.slice(1).join(', ') : (at.length ? null : 'line not in the index: run node devtools/hover/gen_erp_index.js'))); }
      else if (handler) out.push(layer(ix, 'on change', 'handler', cmd, handler.join(' > '), null, 'a registered handler (registerHandler), its line is not indexed'));
      else { var u = layer(ix, 'on change', 'callout', short + '.' + meth, null, null, 'UNPORTED: no class registered for ' + cls); u.cmd = cmd; out.push(u); }
    });
    ((C && C.findColumnCallouts ? C.findColumnCallouts(table, row.columnname) : []) || []).forEach(function (cc) {
      var at = sitesOf(ix, 'column-callout', function (e) { return e.key === (t + '|' + String(row.columnname).toLowerCase()) && (e.name === cc.name || e.name === '?'); });
      out.push(layer(ix, 'on change', 'column-callout', cc.name || '?', cc.owner || 'base', at[0], at.length ? null : 'line not in the index'));
    });
    // PICKER: the validation rule (dictionary data: it has no file)
    if (row.ad_val_rule_id) { var vr = (ctx.q('SELECT name, code FROM ad_val_rule WHERE ad_val_rule_id = ?', [row.ad_val_rule_id]) || [])[0];
      out.push(layer(ix, 'picker', 'validation rule', vr ? vr.name : String(row.ad_val_rule_id), null, null, vr && vr.code ? String(vr.code).replace(/\s+/g, ' ').slice(0, 160) : null)); }
    // ON SAVE (the table's, for every column): model hooks (M*.java overrides), the doc action, model validators (ModelValidationEngine)
    var md = ctx.models && ctx.models.describe ? ctx.models.describe() : { models: {}, docs: {} };
    (md.models[t] || []).forEach(function (s, k) { var at = sitesOf(ix, 'model', function (e) { return e.key === t; }), o = s.split(':');
      out.push(layer(ix, 'on save', 'model', o.slice(1).join(':') || '?', o[0], at[k] || at[0], null)); });
    (md.docs[t] || []).forEach(function (s, k) { var at = sitesOf(ix, 'docaction', function (e) { return e.key === t; }); out.push(layer(ix, 'on save', 'doc action', table, s, at[k] || at[0], null)); });
    var REG = ctx.validators && ctx.validators.REGISTRY ? ctx.validators.REGISTRY[t] || {} : {};
    if (Object.keys(REG).length) Object.keys(REG).forEach(function (timing) { (REG[timing] || []).forEach(function (v) { var at = sitesOf(ix, 'validator', function (e) { return e.key === t && e.name === v.name; });
      out.push(layer(ix, 'on save', 'model validator', v.name + ' (' + timing + ')', v.owner || (v.client != null ? 'client ' + v.client : 'base'), at[0], at.length ? null : 'line not in the index')); }); });
    // the page installs its validators at the FIRST save (erp/crud_overlay.js _installAllModelVal): before that the live registry is empty, so the ones the code registers are listed from the index
    else ((ix && ix.entries) || []).filter(function (e) { return e.kind === 'validator' && e.key === t && e.timing; }).forEach(function (e) {
      out.push(layer(ix, 'on save', 'model validator', e.name + ' (' + e.timing + ')', 'base, installed at the first save', e.file + ':' + e.line, null)); });
    // BUTTON: the column's process
    if (row.ad_process_id) { var pr = (ctx.q('SELECT value, classname FROM ad_process WHERE ad_process_id = ?', [row.ad_process_id]) || [])[0], cn = pr && pr.classname;
      var pdd = ctx.processes && ctx.processes.describe ? ctx.processes.describe() : { processes: {}, handlers: {} }, pd = {}, at = cn ? sitesOf(ix, 'process', function (e) { return e.key === cn; }).concat(sitesOf(ix, 'handler', function (e) { return e.key === cn; })) : [];
      Object.keys(pdd.processes || {}).forEach(function (k) { pd[k] = pdd.processes[k]; }); Object.keys(pdd.handlers || {}).forEach(function (k) { if (!pd[k]) pd[k] = pdd.handlers[k].map(function (o) { return o + ' (handler)'; }); });   // a class served by registerHandler (ad_process.js:76) is present too
      var wf = !cn ? (ctx.q('SELECT w.name FROM ad_process p JOIN ad_workflow w ON w.ad_workflow_id = p.ad_workflow_id WHERE p.ad_process_id = ?', [row.ad_process_id]) || [])[0] : null;
      var pl = layer(ix, 'button', 'process', (pr && pr.value) + (cn ? ' (' + cn + ')' : ''), cn && pd[cn] ? pd[cn].join(' > ') : null, at[0], cn && !pd[cn] ? 'UNPORTED: no process registered for ' + cn : (!cn ? (wf ? 'no Java class: runs the workflow ' + wf.name : 'no Java class and no workflow') : null)); pl.classname = cn || null; out.push(pl); }
    return { table: table, column: row.columnname, found: true, layers: out };
  }
  function link(index, at) { return at && index && index.root ? 'vscode://file' + (String(index.root).charAt(0) === '/' ? '' : '/') + index.root + '/' + at : null; }

  function install(win) {
    if (win.__ERP_HOVER) return win.__ERP_HOVER;
    var doc = win.document, state = { index: null, cur: null, last: null };
    var tip = doc.createElement('div'); tip.id = 'erp-hover-tip';
    tip.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;display:none;max-width:760px;padding:8px 10px;border-radius:5px;font:12px/1.45 ui-monospace,monospace;' +
      'background:rgba(20,24,30,.94);color:#e8eef5;box-shadow:0 2px 10px rgba(0,0,0,.45);white-space:pre-wrap';
    doc.body.appendChild(tip);
    function q(sql, params) { var db = win.__idmpDb, st = db.prepare(sql), out = []; try { st.bind(params || []); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
    function ctx() { return { q: q, callouts: win.AdCallout, models: win.ModelLayer, validators: win.AdModelVal, processes: win.AdProcess, index: state.index }; }
    function render(s, x, y) {
      var lines = [s.table + '.' + s.column + '   (' + s.layers.length + ' layers, in the order they fire)'], n = 0, prev = null, keys = state.keys = {};
      var rows = []; s.layers.forEach(function (l) { var f = l.at ? l.at.replace(/:\d+$/, '') : null, g = rows[rows.length - 1];   // a run of >3 layers of one kind from one file is shown as one row (the witness sees them all)
        if (g && g.step === l.step && g.kind === l.kind && g.file === f && f) { g.n++; g.names.push(l.name); } else rows.push({ step: l.step, kind: l.kind, file: f, n: 1, names: [l.name], first: l }); });
      var shown = []; rows.forEach(function (g) { if (g.n > 3) shown.push(Object.assign({}, g.first, { name: g.n + ' × ' + g.names[0].replace(/\s*\(.*\)$/, '').split('.')[0] + '.* (' + g.names.slice(0, 2).map(function (x) { return x.split('.').pop().replace(/\s*\(.*\)$/, ''); }).join(', ') + ', …)' }));
        else g.names.forEach(function (nm, i) { shown.push(s.layers.filter(function (l) { return l.name === nm && l.step === g.step && l.kind === g.kind; })[0]); }); });
      shown.forEach(function (l) { if (l.step !== prev) { lines.push(l.step.toUpperCase()); prev = l.step; }
        var key = l.at ? '[' + (++n) + '] ' : '    '; keys[n] = l.at ? l.at : null;
        lines.push('  ' + key + l.kind + ': ' + l.name + (l.owner ? '  (' + l.owner + ')' : '') + (l.at ? '  ' + l.at : '') + (l.legacy ? '  ← ' + l.legacy : '') + (l.note ? '\n        ' + l.note : '')); });
      if (n) lines.push('1-' + Math.min(n, 9) + ' (or Alt+1-' + Math.min(n, 9) + ' while typing) = open that line in VS Code');
      tip.textContent = lines.join('\n'); tip.style.left = Math.min(x + 16, win.innerWidth - 780) + 'px'; tip.style.top = (y + 16) + 'px'; tip.style.display = 'block';
    }
    doc.addEventListener('mouseover', function (e) {
      // the field marks the page already has: form inputs data-col inside an edit form with data-ad-table (idempiere.html ~5285), buttons data-ad-column (~5209/5226), grid heads data-ad-col,
      //   the create form's rows data-ad-table + data-ad-column (crud_overlay.js:1553); the table is the element's own data-ad-table or its nearest ancestor's
      var el = e.target && e.target.closest ? e.target.closest('[data-ad-column],[data-col],[data-ad-col]') : null, holder = el && (el.hasAttribute('data-ad-table') ? el : el.closest('[data-ad-table]'));
      if (!el || !holder) { tip.style.display = 'none'; state.cur = null; return; }
      var t = holder.getAttribute('data-ad-table'), c = el.getAttribute('data-ad-column') || el.getAttribute('data-col') || el.getAttribute('data-ad-col'), id = t + '.' + c;
      var s; try { s = stackFor(t, c, ctx()); } catch (err) { s = { table: t, column: c, found: false, layers: [], error: String(err && err.message || err) }; }
      state.cur = s; render(s, e.clientX, e.clientY);
      if (state.last !== id) { state.last = id; console.log('§ERP_HOVER table=' + t + ' column=' + c + ' layers=' + s.layers.length + ' ' + s.layers.map(function (l) { return l.step.replace(' ', '_') + ':' + l.kind.replace(' ', '_') + ':' + l.name.replace(/\s+/g, '_') + (l.at ? '@' + l.at : ''); }).join(' ')); }
    }, true);
    win.addEventListener('keydown', function (e) {
      var dg = /^Digit([1-9])$/.exec(e.code || '') || (/^[1-9]$/.test(e.key) ? [0, e.key] : null);   // Alt+1-9 works with the focus in a field (plain digits there would type)
      if (!state.cur || !dg || (!e.altKey && /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || ''))) return; if (e.altKey) e.preventDefault();
      var at = state.keys && state.keys[Number(dg[1])], u = at && link(state.index, at); if (u) win.open(u);
    });
    var api = { stackFor: stackFor, state: state, link: link, ready: null };
    api.ready = win.fetch('/devtools/hover/erp_index.json?' + Date.now()).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (ix) {
      state.index = ix; console.log('§ERP_HOVER installed index_entries=' + (ix && ix.entries ? ix.entries.length : 0) + (ix ? '' : ' (no erp_index.json: run node devtools/hover/gen_erp_index.js)')); return ix; });
    win.__ERP_HOVER = api; return api;
  }
  return { stackFor: stackFor, install: install, link: link, STEPS: STEPS };
});
