#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scripts/split_closure.js — move-only splitter for one big closure-module file.
// Spec: bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §SAFETY_GATES + §LANES_RULING (2026-10-06). Read the printed
// report after every run; it names every part, every shared name and every refusal.
//
// WHAT IT DOES. A viewer module is one closure — `function setupX(A){…}`, a nested `function init(…){…}`, or a
// `(function(){…})()` IIFE — whose top-level statements share one scope. This splits those statements into part
// files WITHOUT changing what any of them does:
//   phase 1  every part is defined (its functions hoisted, its literal constants set, its cross-part functions
//            exported on ONE shared object) — exactly what the single closure's hoisting gave,
//   phase 2  every part's remaining setup statements run, in the original order.
// The ONLY edits to moved code: (a) a top-level name used by another part is reached as <SHARED>.name (functions:
// the same function object; vars: the property IS the variable), (b) a top-level `var` keyword is dropped where its
// name is hoisted to the part (literal-valued constants are kept verbatim). scripts/split_verify.js re-proves this
// independently with a parser.
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
if (new RegExp('\\b' + SH + '\\b').test(src)) refuse('shared name "' + SH + '" already occurs in the file');

// ── assign statements to parts by anchor NAME ────────────────────────────────────────────────────────────────
const declNames = (st) => ts.isFunctionDeclaration(st) && st.name ? [st.name.text]
  : ts.isVariableStatement(st) ? st.declarationList.declarations.map((d) => ts.isIdentifier(d.name) ? d.name.text : null) : [];
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
const bad = [];
(function scan(n, inFn) {
  if (!inFn && (ts.isReturnStatement(n) || (ts.isIdentifier(n) && n.text === 'arguments') || n.kind === ts.SyntaxKind.ThisKeyword)) bad.push(ts.SyntaxKind[n.kind] + '@' + line(n.getStart(sf)));
  ts.forEachChild(n, (c) => scan(c, inFn || (ts.isFunctionLike(n) && !ts.isArrowFunction(n) && n !== C)));
})(C.body, false);
if (bad.length) refuse('container-level return/arguments/this: ' + bad.join(','));
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
const crossVar = (nm) => cross.has(nm) && [...decl.values()].some((d) => d.name === nm && d.kind === 'var');
function pure(e) { if (!e) return true;
  if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isRegularExpressionLiteral(e)) return true;
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return true;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return true;
  if (ts.isArrayLiteralExpression(e)) return e.elements.every(pure);
  if (ts.isObjectLiteralExpression(e)) return e.properties.every((p) => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && pure(p.initializer));
  if (ts.isParenthesizedExpression(e)) return pure(e.expression);
  return false; }
const constStmt = (st) => ts.isVariableStatement(st) && st.declarationList.declarations.every((d) => !crossVar(d.name.text) && pure(d.initializer));

// ── edits ────────────────────────────────────────────────────────────────────────────────────────────────────
const edits = [];
refs.forEach((r) => { const nm = r.d.name; if (!cross.has(nm)) return;
  const viaShared = r.d.kind === 'var' || (!r.isDeclName && r.part !== r.d.part);
  if (!viaShared) return;
  if (r.shorthand) edits.push([r.node.getStart(sf), r.node.end, nm + ': ' + SH + '.' + nm]);
  else edits.push([r.node.getStart(sf), r.node.end, SH + '.' + nm]); });
stmts.forEach((st) => { if (ts.isVariableStatement(st) && !constStmt(st)) { const kw = st.declarationList.getStart(sf);
  if (src.slice(kw, kw + 4) !== 'var ') refuse('var keyword not found at line ' + line(kw)); edits.push([kw, kw + 4, '']); } });
const render = (a, b) => { let o = '', p = a; edits.filter((e) => e[0] >= a && e[1] <= b).sort((x, y) => x[0] - y[0]).forEach((e) => { o += src.slice(p, e[0]) + e[2]; p = e[1]; }); return o + src.slice(p, b); };
const awaitsAtTop = (st) => { let f = false; (function w(n, inFn) { if (!inFn && ts.isAwaitExpression(n)) f = true; ts.forEachChild(n, (c) => w(c, inFn || ts.isFunctionLike(n))); })(st, false); return f; };

// ── emit parts ───────────────────────────────────────────────────────────────────────────────────────────────
const G = "(typeof window !== 'undefined' ? window : globalThis)";
const ORDER = cfg.parts.map((p) => p.name), report = [], files = [];
cfg.parts.forEach((P, pi) => {
  const mine = stmts.filter((_, i) => partIdx[i] === pi);
  const fnT = [], runT = [], hoist = [], exp = [], constT = []; let asyncRun = false;
  mine.forEach((st) => {
    const t = render(st.getFullStart(), st.end);
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression) && st.expression.text === 'use strict') return;
    if (constStmt(st)) constT.push(t);
    else if (ts.isFunctionDeclaration(st)) { fnT.push(t); if (cross.has(st.name.text)) exp.push(st.name.text); }
    else { runT.push(t); if (awaitsAtTop(st)) asyncRun = true;
      if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => { if (!crossVar(d.name.text)) hoist.push(d.name.text); }); }
  });
  if (asyncRun && !isAsync) refuse('await at container level in a non-async container (part ' + P.name + ')');
  const lines = [mine.length ? line(mine[0].getStart(sf)) : 0, mine.length ? line(mine[mine.length - 1].end) : 0];
  const body = ["  'use strict';",
    hoist.length ? '  var ' + hoist.join(', ') + ';   // hoisted to this part, as the single closure hoisted them' : '',
    constT.length ? '  // literal-valued constants, verbatim (evaluating a literal earlier changes nothing)' + constT.join('') : '',
    fnT.join(''),
    exp.length ? '\n  // phase-1 exports: other parts reach these through ' + SH + ' (same function objects)\n' + exp.map((n) => '  ' + SH + '.' + n + ' = ' + n + ';').join('\n') : '',
    '\n  return ' + (asyncRun ? 'async ' : '') + "function () {   // phase 2: this part's setup statements, in original order" + runT.join('') + '\n  };'].filter(Boolean).join('\n');
  const fname = cfg.prefix + P.name + '.js';
  fs.writeFileSync(path.join(OUT, fname),
    '// ' + FAMILY + ' family — part `' + P.name + '` (original ' + path.basename(cfg.file) + ' lines ' + lines.join('–') + ').\n' +
    '// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/' + FAMILY + '.json) — edit this file\n' +
    '// normally from now on; regenerate only to re-split a branch that still edits the old single file. Names shared\n' +
    '// across parts live on `' + SH + '`; load order + the two-phase setup are in ' + path.basename(cfg.file) + '.\n' +
    G + '.' + REG + ' = ' + G + '.' + REG + ' || {};\n' +
    G + '.' + REG + '.' + P.name + ' = function __split_' + FAMILY + '_' + P.name + '(' + [SH].concat(params).join(', ') + ') {\n' + body + '\n};\n');
  files.push(fname);
  report.push('§SPLIT_PART ' + fname + ' lines=' + lines.join('-') + ' statements=' + mine.length + ' functions=' + fnT.length + ' exports=' + exp.length + ' hoisted=' + hoist.length + ' constants=' + constT.length + (asyncRun ? ' async' : ''));
});

// ── rewrite the container body as the driver ─────────────────────────────────────────────────────────────────
const anyAsync = report.some((r) => / async$/.test(r));
const ind = ' '.repeat(sf.getLineAndCharacterOfPosition(stmts[0].getStart(sf)).character), indClose = ' '.repeat(Math.max(0, ind.length - 2));
const driver = '{\n' + ind + "'use strict';\n" +
  ind + '// Body split move-only into ' + files.join(', ') + ' (loaded before this file) by scripts/split_closure.js\n' +
  ind + '// (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md). Two phases keep the single closure\'s semantics: every part is\n' +
  ind + '// defined first (cross-part functions on ' + SH + '), then each part\'s setup statements run in the original order.\n' +
  ind + 'var R = ' + G + '.' + REG + ' || {};\n' +
  ind + 'var ORDER = ' + JSON.stringify(ORDER) + ';\n' +
  ind + 'var missing = ORDER.filter(function (n) { return typeof R[n] !== \'function\'; });\n' +
  ind + "if (missing.length) { console.warn('§SPLIT_PART_MISSING " + FAMILY + " ' + missing.join(',')); return; }\n" +
  ind + 'var ' + SH + ' = {};\n' +
  ind + 'var runs = ORDER.map(function (n) { return R[n](' + [SH].concat(params).join(', ') + '); });\n' +
  (anyAsync
    ? ind + 'for (var i = 0; i < runs.length; i++) { var r = runs[i](); if (r && typeof r.then === \'function\') await r; }\n'
    : ind + 'runs.forEach(function (run) { run(); });\n') +
  indClose + '}';
const shell = src.slice(0, C.body.getStart(sf)) + driver + src.slice(C.body.end);
fs.writeFileSync(path.join(OUT, path.basename(cfg.file)), shell);
console.log(report.join('\n'));
console.log('§SPLIT_DONE ' + FAMILY + ' parts=' + files.length + ' crossNames=' + cross.size + ' crossVars=' + [...cross].filter(crossVar).length + ' edits=' + edits.length + ' async=' + anyAsync + ' shellLines=' + shell.split('\n').length);
