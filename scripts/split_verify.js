#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scripts/split_verify.js — INDEPENDENT move-only proof for a split made by split_closure.js
// (gate 1 of bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §SAFETY_GATES). Read its § lines after every run.
//
// ISSUE IT PROVES OR DISPROVES: "the split changed code, not just where it lives". It does NOT reuse the splitter's
// logic: it parses the ORIGINAL container and the NEW part files, normalises only the two declared edits (drop the
// `<SHARED>.` prefix on member access, drop a leading `var `), prints both sides with comments removed, and requires
//   (a) the multiset of function declarations is identical,
//   (b) every constant the splitter moved to part scope exists in the original AND has a literal-only initializer,
//   (c) the remaining setup statements are identical AND in the same order.
// Falsifier: change one literal in a copy of any part -> FAIL naming the first differing statement.
//
// USAGE  node scripts/split_verify.js scripts/split_configs/<name>.json --orig <original single file> [--dir <dir of new files>]
'use strict';
const fs = require('fs'), path = require('path');
let ts; try { ts = require(process.env.TSLIB || 'typescript'); } catch (e) { console.error('§SPLIT_NEED_TS npm i --no-save typescript@5.6.3 (or TSLIB)'); process.exit(3); }
const args = process.argv.slice(2), argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const cfg = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const DIR = argOf('--dir') || path.join(__dirname, '..', path.dirname(cfg.file));
const ORIG = argOf('--orig');
const SH = cfg.shared;
const pr = ts.createPrinter({ removeComments: true });
const parse = (f, t) => ts.createSourceFile(f, t, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
function norm(node, sf) {
  const tr = (ctx) => { const v = (n) => (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SH) ? ts.factory.createIdentifier(n.name.text) : ts.visitEachChild(n, v, ctx); return v; };
  return pr.printNode(ts.EmitHint.Unspecified, ts.transform(node, [tr]).transformed[0], sf).replace(/\s+/g, ' ').trim();
}
function pure(e) { if (!e) return true;
  if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isRegularExpressionLiteral(e)) return true;
  if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(e.kind)) return true;
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) return true;
  if (ts.isArrayLiteralExpression(e)) return e.elements.every(pure);
  if (ts.isObjectLiteralExpression(e)) return e.properties.every((p) => ts.isPropertyAssignment(p) && !ts.isComputedPropertyName(p.name) && pure(p.initializer));
  if (ts.isParenthesizedExpression(e)) return pure(e.expression);
  return false; }
// ORIGINAL container
const osf = parse('orig.js', fs.readFileSync(ORIG, 'utf8')); let C = null;
(function f(n) { if (C) return;
  if (cfg.container.kind === 'function' && ts.isFunctionDeclaration(n) && n.name && n.name.text === cfg.container.name) { C = n; return; }
  if (cfg.container.kind === 'iife' && ts.isExpressionStatement(n) && n.parent === osf) { let e = n.expression; if (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isCallExpression(e)) { let g = e.expression; if (ts.isParenthesizedExpression(g)) g = g.expression; if (ts.isFunctionExpression(g)) { C = g; return; } } }
  ts.forEachChild(n, f); })(osf);
const oFn = [], oRun = [];
C.body.statements.forEach((st) => {
  if (ts.isFunctionDeclaration(st)) oFn.push(norm(st, osf));
  else if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) oRun.push(norm(st, osf).replace(/^var /, ''));
});
// NEW parts, in config order
const nFn = [], nRun = [], nConst = []; let nonLiteral = 0, missingParts = [];
cfg.parts.forEach((P) => {
  const f = path.join(DIR, cfg.prefix + P.name + '.js');
  if (!fs.existsSync(f)) { missingParts.push(P.name); return; }
  const sf = parse(f, fs.readFileSync(f, 'utf8')); let fn = null;
  (function v(n) { if (!fn && ts.isFunctionExpression(n) && n.name && n.name.text === '__split_' + cfg.family + '_' + P.name) fn = n; else ts.forEachChild(n, v); })(sf);
  if (!fn) { missingParts.push(P.name + '(no part function)'); return; }
  fn.body.statements.forEach((st) => {
    if (ts.isFunctionDeclaration(st)) nFn.push(norm(st, sf));
    else if (ts.isVariableStatement(st) && st.declarationList.declarations.some((d) => d.initializer)) {
      if (!st.declarationList.declarations.every((d) => pure(d.initializer))) nonLiteral++;
      nConst.push(norm(st, sf).replace(/^var /, ''));
    } else if (ts.isReturnStatement(st) && st.expression && ts.isFunctionExpression(st.expression)) st.expression.body.statements.forEach((s2) => nRun.push(norm(s2, sf)));
  });
});
const ms = (a) => { const m = new Map(); a.forEach((x) => m.set(x, (m.get(x) || 0) + 1)); return m; };
const A = ms(oFn), B = ms(nFn); let fnDiff = 0;
for (const [k, v] of A) if (B.get(k) !== v) fnDiff++;
for (const [k, v] of B) if (A.get(k) !== v) fnDiff++;
let constMissing = 0; const rest = oRun.slice();
nConst.forEach((c) => { const i = rest.indexOf(c); if (i < 0) constMissing++; else rest.splice(i, 1); });
let runDiff = 0, first = -1;
for (let i = 0; i < Math.max(rest.length, nRun.length); i++) if (rest[i] !== nRun[i]) { runDiff++; if (first < 0) first = i; }
console.log('§SPLIT_VERIFY ' + cfg.family + ' parts=' + cfg.parts.length + ' missing=' + JSON.stringify(missingParts));
console.log('§SPLIT_VERIFY functions orig=' + oFn.length + ' new=' + nFn.length + ' differing=' + fnDiff);
console.log('§SPLIT_VERIFY constantsMoved=' + nConst.length + ' notInOriginal=' + constMissing + ' nonLiteral=' + nonLiteral);
console.log('§SPLIT_VERIFY setupStatements orig=' + rest.length + ' new=' + nRun.length + ' differing=' + runDiff +
  (first >= 0 ? '\n  ORIG: ' + String(rest[first]).slice(0, 220) + '\n  NEW : ' + String(nRun[first]).slice(0, 220) : ''));
const ok = !missingParts.length && fnDiff === 0 && constMissing === 0 && nonLiteral === 0 && runDiff === 0 && oFn.length + rest.length > 0;
console.log('§SPLIT_VERIFY VERDICT ' + (ok ? 'PASS (move-only: identical modulo the two declared edits)' : 'FAIL'));
process.exit(ok ? 0 : 1);
