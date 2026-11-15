// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC (W-ERP-HOVER E1), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.22
// ISSUE: an ERP field is handled by one generic engine plus layers REGISTERED by name (callouts, per-column callouts, model hooks, doc actions, model validators, processes).
//        The hover needs each registration's file:line, found by a parse of the code, never a text search (a name in a comment or a string is not a registration).
// WHAT:  sites(repoRoot) -> { entries: [{kind, key, name, file, line}], legacy: {file: 'X.java:N' | 'X.java'}, parsed, skipped }. Calls whose callee ends in one of the KINDS below with a
//        literal first argument; per file, the FIRST iDempiere Java file its comments cite (read from the parser's comment list). Dev-side only; one implementation for the index and the witness.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
function espree() { for (const m of ['espree', path.join(__dirname, '..', '..', 'node_modules', 'espree'), path.join(os.homedir(), 'bim-ootb', 'node_modules', 'espree')]) { try { return require(m); } catch (e) { /* next */ } } return null; }
let CONSTS = {};   // per file: var NAME = 'literal' (model_bankstatement.js: var TBL = 'c_bankstatement'), so ML.registerModel(TBL, …) is read as its literal
const lit = n => n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : n && n.type === 'Identifier' && Object.prototype.hasOwnProperty.call(CONSTS, n.name) ? CONSTS[n.name] : null;
let OBJKEYS = {};   // per file: var NAME = { key: … } , so Object.keys(NAME) is read as its keys (CalloutBankTransfer.js: defineColumnCallout(t, Object.keys(MAP), NAME, …))
const lits = n => lit(n) != null ? [lit(n)] : n && n.type === 'ArrayExpression' ? n.elements.map(lit).filter(x => x != null)
  : n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object' && n.callee.property.name === 'keys' && n.arguments[0] && n.arguments[0].type === 'Identifier' && OBJKEYS[n.arguments[0].name] ? OBJKEYS[n.arguments[0].name] : [];
// callee name -> how to read the call: kind, the key the registry uses, the layer's name
const KINDS = {
  defineCallout: a => lit(a[0]) && [{ kind: 'callout', key: lit(a[0]), name: lit(a[0]) }],
  defineColumnCallout: a => lit(a[0]) && lits(a[1]).map(c => ({ kind: 'column-callout', key: (lit(a[0]) + '|' + c).toLowerCase(), name: lit(a[2]) || '?' })),
  defineProcess: a => lit(a[0]) && [{ kind: 'process', key: lit(a[0]), name: lit(a[0]) }],
  registerModel: a => lit(a[0]) && [{ kind: 'model', key: lit(a[0]).toLowerCase(), name: lit(a[0]) }],
  registerDocAction: a => lit(a[0]) && [{ kind: 'docaction', key: lit(a[0]).toLowerCase(), name: lit(a[0]) }],
  registerHandler: a => lit(a[0]) && [{ kind: 'handler', key: lit(a[0]), name: lit(a[0]) }],   // ad_process.js:76 / ad_callout.js registerHandler: a class served by a handler, not defineProcess / defineCallout
  registerValidator: a => lit(a[0]) && lit(a[2]) ? [{ kind: 'validator', key: lit(a[0]).toLowerCase(), name: lit(a[2]), timing: lit(a[1]) }] : null   // a name that is not readable (a loop over [name, fn] pairs) is indexed from the pairs below
};
const SPEC_KEYS = ['init', 'before', 'afterNew', 'afterChange', 'afterDelete', 'beforeSave', 'afterSave', 'initialDefaults', 'beforeDelete'];
const calleeName0 = n => n.callee.type === 'MemberExpression' ? n.callee.property && n.callee.property.name : n.callee.type === 'Identifier' ? n.callee.name : null;
function walkFiles(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (!/^(tests|node_modules|vendor|lib)$/.test(d.name)) walkFiles(p, out); }
    else if (/\.js$/.test(d.name) && fs.statSync(p).size < 2e6) out.push(p);
  });
  return out;
}
function sites(repoRoot) {
  const E = espree(); if (!E) throw new Error('erp_sites: espree not resolvable (npm i in bim-ootb)');
  const erp = path.join(repoRoot, 'erp'), entries = [], legacy = {}; let parsed = 0, skipped = 0;
  walkFiles(erp, []).sort().forEach(f => {
    const rel = path.relative(repoRoot, f), src = fs.readFileSync(f, 'utf8'); let ast;
    try { ast = E.parse(src, { ecmaVersion: 'latest', loc: true, comment: true, sourceType: 'script' }); } catch (e) { try { ast = E.parse(src, { ecmaVersion: 'latest', loc: true, comment: true, sourceType: 'module' }); } catch (e2) { skipped++; return; } }
    parsed++;
    CONSTS = {}; OBJKEYS = {}; (function cw(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'ObjectExpression') OBJKEYS[n.id.name] = n.init.properties.map(q => q.key && (q.key.name || q.key.value)).filter(k => typeof k === 'string'); if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init && n.init.type === 'Literal' && typeof n.init.value === 'string') CONSTS[n.id.name] = CONSTS[n.id.name] === undefined ? n.init.value : null;   // a name bound twice is not a constant
      for (const k in n) { if (k === 'loc' || k === 'range' || k === 'comments') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(cw); else if (v && typeof v === 'object') cw(v); } })(ast);
    Object.keys(CONSTS).forEach(k => { if (CONSTS[k] === null) delete CONSTS[k]; });
    // 2) a table-keyed spec object installed by a loop (model_master.js install(registry): ML.registerModel(table, impl) over Object.keys): each { <table>: { init|before|afterNew|… } } entry is that table's registration line
    let loopAt = null; (function lw(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'CallExpression' && calleeName0(n) === 'registerModel' && n.arguments[0] && n.arguments[0].type === 'Identifier' && lit(n.arguments[0]) == null) loopAt = loopAt || n.loc.start.line;
      for (const k in n) { if (k === 'loc' || k === 'range' || k === 'comments') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(lw); else if (v && typeof v === 'object') lw(v); } })(ast);
    if (loopAt) (function ow(n) { if (!n || typeof n.type !== 'string') return;
      if (n.type === 'Property' && n.value && n.value.type === 'ObjectExpression' && n.value.properties.some(q => q.key && SPEC_KEYS.indexOf(q.key.name || q.key.value) >= 0)) { const k = n.key.name || n.key.value;
        if (typeof k === 'string' && /^[a-z][a-z0-9_]*$/i.test(k)) entries.push({ kind: 'model', key: k.toLowerCase(), name: k, file: rel, line: n.loc.start.line, via: rel + ':' + loopAt, legacy: null }); }
      for (const k in n) { if (k === 'loc' || k === 'range' || k === 'comments') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(ow); else if (v && typeof v === 'object') ow(v); } })(ast);
    const JAVA = /\b([A-Z]\w+\.java)\b(?:\s*:?\s*(\d+))?/, cites = (ast.comments || []).map(c => { const m = JAVA.exec(c.value); return m ? { line: c.loc.end.line, text: m[1] + (m[2] ? ':' + m[2] : '') } : null; }).filter(Boolean);
    if (cites.length) legacy[rel] = cites[0].text;
    const nearest = (ln, span) => { let best = null; for (const c of cites) if (c.line <= ln && ln - c.line <= (span || 3) && (!best || c.line > best.line)) best = c; return best ? best.text : null; };   // a citation ON the line or just above it; none = null (never a citation from elsewhere in the file)
    const add = (e, ln, endLn) => entries.push(Object.assign(e, { file: rel, line: ln, legacy: nearest(endLn || ln, endLn ? endLn - ln + 3 : 3) }));
    const calleeName = n => n.callee.type === 'MemberExpression' ? n.callee.property && n.callee.property.name : n.callee.type === 'Identifier' ? n.callee.name : null;
    // a callout class put straight into the registry (ad_callout.js:512 CLASSES['org.compiere.model.CalloutEngine'] = CalloutEngine): the class line, and its Ctor.prototype.<m> = function lines
    const direct = {}, protos = [];
    (function dw(n) { if (!n || typeof n.type !== 'string') return;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'Identifier' && n.left.object.name === 'CLASSES' && n.left.computed && lit(n.left.property) && lit(n.left.property).indexOf('.') > 0 && n.right.type === 'Identifier') {
        direct[n.right.name] = lit(n.left.property); add({ kind: 'callout', key: lit(n.left.property), name: lit(n.left.property) }, n.loc.start.line); }
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && n.left.object.type === 'MemberExpression' && n.left.object.object.type === 'Identifier' && n.left.object.property && n.left.object.property.name === 'prototype' && n.left.property && n.left.property.name)
        protos.push({ ctor: n.left.object.object.name, m: n.left.property.name, line: n.loc.start.line });
      for (const k in n) { if (k === 'loc' || k === 'range' || k === 'comments') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(dw); else if (v && typeof v === 'object') dw(v); } })(ast);
    protos.forEach(p => { if (direct[p.ctor]) add({ kind: 'callout-method', key: direct[p.ctor] + '.' + p.m, name: p.m }, p.line); });
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression') { const nm = calleeName(n);
        const rd = nm && Object.prototype.hasOwnProperty.call(KINDS, nm) ? KINDS[nm](n.arguments) : null; if (Array.isArray(rd)) rd.forEach(e => add(e, n.loc.start.line));
        // a callout class's METHODS: X.prototype.<method> = function inside the defineCallout factory -> kind callout-method, key '<fqcn>.<method>' (the hover jumps to the method, not the class)
        if (nm === 'defineCallout' && lit(n.arguments[0]) && n.arguments[1]) (function scanM(m) { if (!m || typeof m.type !== 'string') return;
          if (m.type === 'AssignmentExpression' && m.left.type === 'MemberExpression' && m.left.object.type === 'MemberExpression' && m.left.object.property && m.left.object.property.name === 'prototype' && m.left.property && m.left.property.name)
            add({ kind: 'callout-method', key: lit(n.arguments[0]) + '.' + m.left.property.name, name: m.left.property.name }, m.loc.start.line);
          for (const k in m) { if (k === 'loc' || k === 'range') continue; const v = m[k]; if (Array.isArray(v)) v.forEach(scanM); else if (v && typeof v === 'object') scanM(v); } })(n.arguments[1]); }
      // a function that registers validators for ONE literal table from a list of [name, function] pairs (ad_modelval.js install*SaveHooks): each pair's line is that validator's line
      if (/Function/.test(n.type) && n.body) { const tabs = {}, pairs = [];
        (function scan(m, depth) { if (!m || typeof m.type !== 'string') return;
          if (m.type === 'CallExpression' && calleeName(m) === 'registerValidator' && lit(m.arguments[0])) tabs[lit(m.arguments[0]).toLowerCase()] = lit(m.arguments[1]) || tabs[lit(m.arguments[0]).toLowerCase()] || true;
          if (m.type === 'ArrayExpression' && m.elements.length === 2 && lit(m.elements[0]) && m.elements[1] && /Function/.test(m.elements[1].type)) pairs.push({ name: lit(m.elements[0]), line: m.loc.start.line });
          for (const k in m) { if (k === 'loc' || k === 'range') continue; const v = m[k]; if (Array.isArray(v)) v.forEach(x => scan(x, depth + 1)); else if (v && typeof v === 'object') scan(v, depth + 1); }
        })(n.body, 0);
        const t = Object.keys(tabs); if (t.length === 1) pairs.forEach(p => add({ kind: 'validator', key: t[0], name: p.name, timing: typeof tabs[t[0]] === 'string' ? tabs[t[0]] : null }, p.line)); }
      for (const k in n) { if (k === 'loc' || k === 'range' || k === 'comments') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    })(ast);
  });
  return { entries, legacy, parsed, skipped };
}
module.exports = { sites, KINDS: Object.keys(KINDS) };
