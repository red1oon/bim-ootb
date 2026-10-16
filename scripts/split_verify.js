#!/usr/bin/env node
// ⚠ DO NOT REMOVE — scripts/split_verify.js — INDEPENDENT move-only proof for a split made by split_closure.js
// (gate 1 of bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §SAFETY_GATES). Read its § lines after every run.
//
// ISSUE IT PROVES OR DISPROVES: "the split changed code, not just where it lives". It does NOT reuse the splitter's
// logic: it parses the ORIGINAL container and the NEW part files (statements after each part's `yield`), normalises
// only the one declared edit (drop the `<SHARED>.` prefix; expand nothing else), prints both sides with comments
// removed, and requires the two statement sequences — functions included — to be identical, in order.
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
  const tr = (ctx) => { const v = (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === SH) return ts.factory.createIdentifier(n.name.text);
    // the splitter's early-exit marker: return { __splitReturn: true[, value: X] }  ->  return[ X]
    if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression) && n.expression.properties.some((p) => p.name && p.name.text === '__splitReturn')) {
      const val = n.expression.properties.find((p) => p.name && p.name.text === 'value');
      return ts.factory.createReturnStatement(val ? ts.visitNode(val.initializer, v) : undefined);
    }
    return ts.visitEachChild(n, v, ctx); }; return v; };
  return pr.printNode(ts.EmitHint.Unspecified, ts.transform(node, [tr]).transformed[0], sf).replace(/\s+/g, ' ').trim();
}
// ORIGINAL container
const osf = parse('orig.js', fs.readFileSync(ORIG, 'utf8')); let C = null;
(function f(n) { if (C) return;
  if (cfg.container.kind === 'function' && ts.isFunctionDeclaration(n) && n.name && n.name.text === cfg.container.name) { C = n; return; }
  if (cfg.container.kind === 'iife' && ts.isExpressionStatement(n) && n.parent === osf) { let e = n.expression; if (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isCallExpression(e)) { let g = e.expression; if (ts.isParenthesizedExpression(g)) g = g.expression; if (ts.isFunctionExpression(g)) { C = g; return; } } }
  ts.forEachChild(n, f); })(osf);
// NEW parts, in config order: statements after the part generator's `yield;`
const oAll = C.body.statements.filter((st) => !(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))).map((st) => norm(st, osf));
const nAll = [], missingParts = [];
cfg.parts.forEach((P) => {
  const f = path.join(DIR, cfg.prefix + P.name + '.js');
  if (!fs.existsSync(f)) { missingParts.push(P.name); return; }
  const sf = parse(f, fs.readFileSync(f, 'utf8')); let fn = null;
  (function v(n) { if (!fn && ts.isFunctionExpression(n) && n.name && n.name.text === '__split_' + cfg.family + '_' + P.name) fn = n; else ts.forEachChild(n, v); })(sf);
  if (!fn) { missingParts.push(P.name + '(no part function)'); return; }
  const st = fn.body.statements, y = st.findIndex((s) => ts.isExpressionStatement(s) && ts.isYieldExpression(s.expression));
  if (y < 0) { missingParts.push(P.name + '(no yield)'); return; }
  st.slice(y + 1).forEach((s) => nAll.push(norm(s, sf)));
});
let diff = 0, first = -1;
for (let i = 0; i < Math.max(oAll.length, nAll.length); i++) if (oAll[i] !== nAll[i]) { diff++; if (first < 0) first = i; }
console.log('§SPLIT_VERIFY ' + cfg.family + ' parts=' + cfg.parts.length + ' missing=' + JSON.stringify(missingParts));
console.log('§SPLIT_VERIFY statements orig=' + oAll.length + ' new=' + nAll.length + ' differing=' + diff +
  (first >= 0 ? '\n  ORIG: ' + String(oAll[first]).slice(0, 220) + '\n  NEW : ' + String(nAll[first]).slice(0, 220) : ''));
const ok = !missingParts.length && diff === 0 && oAll.length > 0;
console.log('§SPLIT_VERIFY VERDICT ' + (ok ? 'PASS (move-only: every statement identical, in order, modulo ' + cfg.shared + '. prefixes)' : 'FAIL'));
process.exit(ok ? 0 : 1);
