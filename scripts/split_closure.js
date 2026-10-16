#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scripts/split_closure.js — move-only splitter for one big closure-module file.
// Spec: bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §SAFETY_GATES + §LANES_RULING (2026-10-06). Read the printed
// report after every run; it names every part, every shared name and every refusal.
//
// WHAT IT DOES. A viewer module is one closure — `function setupX(A){…}`, a nested `function init(…){…}`, or a
// `(function(){…})()` IIFE — whose top-level statements share one scope. This splits those statements into part
// files WITHOUT changing what any of them does:
//   phase 1  every part is created and run to its `yield` — exactly what the single closure's hoisting gave,
//   phase 2  every part resumes and runs its statements, parts in the original order.
// Each part is a generator function: phase 1 runs to its `yield` (the language has already hoisted its functions and
// vars; it publishes the names other parts use on ONE shared object — functions as the same objects, vars as live
// get/set accessors), phase 2 resumes in the SAME scope and runs the original statements verbatim. The ONLY edit to
// moved code: a reference to a name owned by ANOTHER part becomes <SHARED>.name. The owner's text is byte-identical.
// scripts/split_verify.js re-proves this independently with a parser.
//
// REFUSES (prints why, writes nothing): container-level return/arguments/this, destructuring or let/const/class at
// container level, a reference to a variable of an ENCLOSING non-global scope (it cannot cross files), a part
// anchor that is missing or out of order, a <SHARED> name that already exists in the file.
//
// BRANCH RECIPE (for a branch that edited the old single file after main split it): `git checkout <pre-split
// main> -- <file>` is NOT needed — just run this on YOUR version of the file with the same config; the anchors are
// declaration NAMES, so your edits land in the right part. Then take the generated parts over main's.
//
// USAGE  node scripts/split_closure.js scripts/split_configs/<name>.json [--src <file>] [--out <dir>]
//        (typescript is a parser dependency only: `npm i --no-save typescript@5.6.3`, or TSLIB=<path to typescript.js>)
'use strict';
const fs = require('fs'), path = require('path');
let ts; try { ts = require(process.env.TSLIB || 'typescript'); } catch (e) { console.error('§SPLIT_NEED_TS install the parser: npm i --no-save typescript@5.6.3  (or set TSLIB)'); process.exit(3); }

const args = process.argv.slice(2), argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.join(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const FILE = argOf('--src') || path.join(ROOT, cfg.file);
const OUT = argOf('--out') || path.dirname(path.join(ROOT, cfg.file));
const SH = cfg.shared, REG = cfg.registry, FAMILY = cfg.family;
const src = fs.readFileSync(FILE, 'utf8');
const refuse = (m) => { console.log('§SPLIT_REFUSE ' + FAMILY + ' ' + m); process.exit(1); };

const prog = ts.createProgram([FILE], { allowJs: true, noEmit: true, target: ts.ScriptTarget.ES2020 });
const ck = prog.getTypeChecker(), sf = prog.getSourceFile(FILE);
const line = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;

// ── the container ────────────────────────────────────────────────────────────────────────────────────────────
let C = null;
(function find(n) {
  if (C) return;
  if (cfg.container.kind === 'function' && ts.isFunctionDeclaration(n) && n.name && n.name.text === cfg.container.name) { C = n; return; }
  if (cfg.container.kind === 'iife' && ts.isExpressionStatement(n) && n.parent === sf) {
    let e = n.expression; if (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isCallExpression(e)) { let f = e.expression; if (ts.isParenthesizedExpression(f)) f = f.expression; if (ts.isFunctionExpression(f)) { C = f; return; } }
  }
  ts.forEachChild(n, find);
})(sf);
if (!C) refuse('container not found: ' + JSON.stringify(cfg.container));
const isAsync = !!(C.modifiers && C.modifiers.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
const params = C.parameters.map((p) => { if (!ts.isIdentifier(p.name)) refuse('non-identifier parameter'); return p.name.text; });
const stmts = C.body.statements;
// strictness: parts and driver are strict ONLY if the original container already ran strict (a directive in it or in
// any enclosing function / the file). Adding 'use strict' to sloppy code would change its behaviour.
const hasStrictDirective = (body) => { for (const st of body.statements) { if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) break; if (st.expression.text === 'use strict') return true; } return false; };
let STRICT = hasStrictDirective(C.body) || hasStrictDirective(sf);
for (let p = C.parent; p && !STRICT; p = p.parent) if (ts.isFunctionLike(p) && p.body && ts.isBlock(p.body) && hasStrictDirective(p.body)) STRICT = true;
const USE_STRICT = STRICT ? "  'use strict';\n" : '', OWN_STRICT = hasStrictDirective(C.body);   // parts are files: they need it explicitly; the driver repeats only the container's own directive
if (new RegExp('\\b' + SH + '\\b').test(src)) refuse('shared name "' + SH + '" already occurs in the file');

// ── assign statements to parts by anchor NAME ────────────────────────────────────────────────────────────────
const declNames = (st) => ts.isFunctionDeclaration(st) && st.name ? [st.name.text]
  : ts.isVariableStatement(st) ? st.declarationList.declarations.map((d) => ts.isIdentifier(d.name) ? d.name.text : null)
  // an anchor may also be an assignment target like "A.loadPathApplyVisual" (a part that starts with `A.x = function…`)
  : (ts.isExpressionStatement(st) && ts.isBinaryExpression(st.expression) && st.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken)
    ? [st.expression.left.getText(sf)] : [];
const partIdx = new Array(stmts.length); let cur = 0;
stmts.forEach((st, i) => {
  const nx = cfg.parts[cur + 1];
  if (nx && declNames(st).includes(nx.startsAt)) cur++;
  partIdx[i] = cur;
});
if (cur !== cfg.parts.length - 1) refuse('anchors not all reached in order; reached part ' + cfg.parts[cur].name + ' (missing ' + cfg.parts.slice(cur + 1).map((p) => p.startsAt).join(',') + ')');

// ── declarations + guards ────────────────────────────────────────────────────────────────────────────────────
const decl = new Map();
stmts.forEach((st, i) => {
  if (ts.isFunctionDeclaration(st)) decl.set(ck.getSymbolAtLocation(st.name), { name: st.name.text, part: partIdx[i], kind: 'function' });
  else if (ts.isVariableStatement(st)) {
    if (st.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) refuse('let/const at container level, line ' + line(st.getStart(sf)));
    st.declarationList.declarations.forEach((d) => { if (!ts.isIdentifier(d.name)) refuse('destructuring at container level, line ' + line(d.getStart(sf))); decl.set(ck.getSymbolAtLocation(d.name), { name: d.name.text, part: partIdx[i], kind: 'var' }); });
  } else if (ts.isClassDeclaration(st)) refuse('class at container level, line ' + line(st.getStart(sf)));
});
const bad = [], topReturns = [];   // container-level `return` = an EARLY EXIT of the whole setup (e.g. effects.js mobile skip)
(function scan(n, inFn) {
  if (!inFn && ts.isReturnStatement(n)) topReturns.push(n);
  if (!inFn && ((ts.isIdentifier(n) && n.text === 'arguments') || n.kind === ts.SyntaxKind.ThisKeyword)) bad.push(ts.SyntaxKind[n.kind] + '@' + line(n.getStart(sf)));
  ts.forEachChild(n, (c) => scan(c, inFn || (ts.isFunctionLike(n) && !ts.isArrowFunction(n) && n !== C)));
})(C.body, false);
if (bad.length) refuse('container-level arguments/this: ' + bad.join(','));
// enclosing-scope captures: a symbol declared OUTSIDE the container but not at file/global level
const outer = new Set();
(function walk(n) {
  if (ts.isIdentifier(n)) {
    const s = ck.getSymbolAtLocation(n);
    if (s && s.declarations && s.declarations.length && !decl.has(s)) {
      const d = s.declarations[0];
      const inside = d.pos >= C.pos && d.end <= C.end, inFile = d.getSourceFile() === sf;
      if (inFile && !inside) { let p = d.parent; while (p && !ts.isFunctionLike(p) && p !== sf) p = p.parent; if (p && p !== sf) outer.add(n.text + '@' + line(n.getStart(sf))); }
    }
  }
  ts.forEachChild(n, walk);
})(C.body);
const outerNotParams = [...outer].filter((x) => !params.includes(x.split('@')[0]));
if (outerNotParams.length) refuse('references to enclosing-scope variables (cannot cross files): ' + outerNotParams.slice(0, 20).join(','));

// ── references ───────────────────────────────────────────────────────────────────────────────────────────────
const refs = [];
stmts.forEach((st, i) => (function walk(n) {
  if (ts.isIdentifier(n)) {
    let s = ck.getSymbolAtLocation(n), d = s && decl.get(s);
    if (ts.isShorthandPropertyAssignment(n.parent)) { const v = ck.getShorthandAssignmentValueSymbol(n.parent); if (v && decl.get(v)) { d = decl.get(v); refs.push({ node: n, d, part: partIdx[i], shorthand: true }); } }
    else if (d) refs.push({ node: n, d, part: partIdx[i], isDeclName: (ts.isFunctionDeclaration(n.parent) || ts.isVariableDeclaration(n.parent)) && n.parent.name === n });
  }
  ts.forEachChild(n, walk);
})(st));
const cross = new Set(refs.filter((r) => !r.isDeclName && r.part !== r.d.part).map((r) => r.d.name));

// `this` guard: a shared function is called as <SHARED>.f() from other parts, which binds `this` to the shared object
// (the original f() call had `this` undefined). Refuse if any shared function uses `this` at its own level.
const thisUsers = [];
stmts.forEach((st) => { if (!ts.isFunctionDeclaration(st) || !cross.has(st.name.text)) return;
  (function w(n) { if (n.kind === ts.SyntaxKind.ThisKeyword) { thisUsers.push(st.name.text + '@' + line(n.getStart(sf))); return; }
    if (n !== st && ts.isFunctionLike(n) && !ts.isArrowFunction(n)) return; ts.forEachChild(n, w); })(st); });
if (thisUsers.length) refuse('shared functions use `this` (would bind to ' + SH + ' when called from another part): ' + thisUsers.join(','));

// ── edits: ONLY a non-owner reference becomes <SHARED>.name (owner text stays byte-identical) ─────────────────
const edits = [];
const render0 = (a, b) => { let o = '', p = a; edits.filter((e) => e[0] >= a && e[1] <= b).sort((x, y) => x[0] - y[0]).forEach((e) => { o += src.slice(p, e[0]) + e[2]; p = e[1]; }); return o + src.slice(p, b); };
refs.forEach((r) => { if (!cross.has(r.d.name) || r.isDeclName || r.part === r.d.part) return;
  edits.push([r.node.getStart(sf), r.node.end, r.shorthand ? r.d.name + ': ' + SH + '.' + r.d.name : SH + '.' + r.d.name]); });
// an early exit must stop the WHOLE setup, not just its part: `return X;` -> `return { __splitReturn: true, value: X };`
// (the driver stops running later parts when it sees it; split_verify + readUnsplit undo exactly this text)
topReturns.forEach((r) => { edits.push([r.getStart(sf), r.end, r.expression
  ? 'return { __splitReturn: true, value: ' + render0(r.expression.getStart(sf), r.expression.end) + ' };'
  : 'return { __splitReturn: true };']); });
for (let i = edits.length - 1; i >= 0; i--) { const e = edits[i]; if (topReturns.some((r) => e[0] >= r.getStart(sf) && e[1] <= r.end && !(e[0] === r.getStart(sf) && e[1] === r.end))) edits.splice(i, 1); }
const render = (a, b) => { let o = '', p = a; edits.filter((e) => e[0] >= a && e[1] <= b).sort((x, y) => x[0] - y[0]).forEach((e) => { o += src.slice(p, e[0]) + e[2]; p = e[1]; }); return o + src.slice(p, b); };
const awaitsAtTop = (st) => { let f = false; (function w(n, inFn) { if (!inFn && ts.isAwaitExpression(n)) f = true; ts.forEachChild(n, (c) => w(c, inFn || ts.isFunctionLike(n))); })(st, false); return f; };

// ── emit parts: each part is a GENERATOR — phase 1 runs to `yield` (functions + vars are hoisted by the language,
//    cross names published on <SHARED>), phase 2 resumes IN THE SAME SCOPE and runs the original statements verbatim.
const G = "(typeof window !== 'undefined' ? window : globalThis)";
const ORDER = cfg.parts.map((p) => p.name), report = [], files = [], asyncParts = [];
cfg.parts.forEach((P, pi) => {
  const mine = stmts.filter((_, i) => partIdx[i] === pi);
  const ownCrossFn = [], ownCrossVar = []; let asyncRun = false;
  mine.forEach((st) => {
    if (ts.isFunctionDeclaration(st) && cross.has(st.name.text)) ownCrossFn.push(st.name.text);
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => { if (cross.has(d.name.text)) ownCrossVar.push(d.name.text); });
    if (!ts.isFunctionDeclaration(st) && awaitsAtTop(st)) asyncRun = true;
  });
  if (asyncRun && !isAsync) refuse('await at container level in a non-async container (part ' + P.name + ')');
  if (asyncRun) asyncParts.push(P.name);
  const text = mine.filter((st) => !(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === 'use strict'))
    .map((st) => render(st.getFullStart(), st.end)).join('') +
    // the container's trailing comments (after its last statement, before its closing brace) belong to the last part
    (pi === cfg.parts.length - 1 ? src.slice(stmts[stmts.length - 1].end, C.body.end - 1).replace(/\s+$/, '') : '');
  const pub = [].concat(
    ownCrossFn.map((n) => '  ' + SH + '.' + n + ' = ' + n + ';'),
    ownCrossVar.map((n) => '  Object.defineProperty(' + SH + ", '" + n + "', { get: function () { return " + n + '; }, set: function (v) { ' + n + ' = v; }, enumerable: true });'));
  const lines = [mine.length ? line(mine[0].getStart(sf)) : 0, mine.length ? line(mine[mine.length - 1].end) : 0];
  const fname = cfg.prefix + P.name + '.js';
  fs.writeFileSync(path.join(OUT, fname),
    '// ' + FAMILY + ' family — part `' + P.name + '` (original ' + path.basename(cfg.file) + ' lines ' + lines.join('–') + ').\n' +
    '// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/' + FAMILY + '.json). Below the `yield` every\n' +
    '// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as ' + SH + '.name.\n' +
    '// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.\n' +
    G + '.' + REG + ' = ' + G + '.' + REG + ' || {};\n' +
    G + '.' + REG + '.' + P.name + ' = ' + (asyncRun ? 'async ' : '') + 'function* __split_' + FAMILY + '_' + P.name + '(' + [SH].concat(params).join(', ') + ') {\n' +
    USE_STRICT +
    (pub.length ? '  // phase 1 — publish this part\'s names that other parts use (same function objects; vars as live accessors)\n' + pub.join('\n') + '\n' : '') +
    '  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order\n' +
    text + '\n};\n');
  files.push(fname);
  report.push('§SPLIT_PART ' + fname + ' lines=' + lines.join('-') + ' statements=' + mine.length + ' publishedFns=' + ownCrossFn.length + ' publishedVars=' + ownCrossVar.length + (asyncRun ? ' async' : ''));
});

// ── rewrite the container body as the driver ─────────────────────────────────────────────────────────────────
const anyAsync = asyncParts.length > 0;
const ind = ' '.repeat(sf.getLineAndCharacterOfPosition(stmts[0].getStart(sf)).character), indClose = ' '.repeat(Math.max(0, ind.length - 2));
const driver = '{\n' + (OWN_STRICT ? ind + "'use strict';\n" : '') + ind + '// <split-driver> (readUnsplit() in viewer/tests/_split_families.js rebuilds the original body here)\n' +
  ind + '// Body split move-only into ' + files.join(', ') + ' (loaded before this file) by scripts/split_closure.js\n' +
  ind + '// (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Each part is a generator: phase 1 (to its `yield`) hoists its\n' +
  ind + '// functions/vars and publishes shared names on ' + SH + '; phase 2 runs its original statements, parts in original order.\n' +
  ind + 'var R = ' + G + '.' + REG + ' || {};\n' +
  ind + 'var ORDER = ' + JSON.stringify(ORDER) + ';\n' +
  ind + 'var missing = ORDER.filter(function (n) { return typeof R[n] !== \'function\'; });\n' +
  ind + "if (missing.length) { console.warn('§SPLIT_PART_MISSING " + FAMILY + " ' + missing.join(',')); return; }\n" +
  ind + 'var ' + SH + ' = {};\n' +
  ind + 'var parts = ORDER.map(function (n) { return R[n](' + [SH].concat(params).join(', ') + '); });\n' +
  (anyAsync
    ? ind + 'for (var i = 0; i < parts.length; i++) { var r1 = parts[i].next(); if (r1 && typeof r1.then === \'function\') await r1; }\n' +
      ind + 'for (var j = 0; j < parts.length; j++) { var r2 = parts[j].next(); if (r2 && typeof r2.then === \'function\') r2 = await r2;\n' +
      ind + '  if (r2 && r2.value && r2.value.__splitReturn) return r2.value.value; }   // an early `return` in the original stops the whole setup\n'
    : ind + 'parts.forEach(function (p) { p.next(); });   // phase 1\n' +
      ind + 'for (var j = 0; j < parts.length; j++) { var r2 = parts[j].next();   // phase 2\n' +
      ind + '  if (r2 && r2.value && r2.value.__splitReturn) return r2.value.value; }   // an early `return` in the original stops the whole setup\n') +
  ind + '// </split-driver>\n' + indClose + '}';
const shell = src.slice(0, C.body.getStart(sf)) + driver + src.slice(C.body.end);
fs.writeFileSync(path.join(OUT, path.basename(cfg.file)), shell);
console.log(report.join('\n'));
console.log('§SPLIT_DONE ' + FAMILY + ' earlyReturns=' + topReturns.length + ' strict=' + STRICT + ' parts=' + files.length + ' crossNames=' + cross.size + ' edits=' + edits.length + ' async=' + JSON.stringify(asyncParts) + ' shellLines=' + shell.split('\n').length);
