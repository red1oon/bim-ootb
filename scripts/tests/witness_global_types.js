#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-ED-TYPES (bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8.1 S6)
// ISSUE IT PROVES OR DISPROVES: "F12 on `NAME.member` for a UMD-published browser global jumps nowhere."
// For every global in types/globals.gen.d.ts, take its first `NAME.member(` use in ANOTHER production file and ask
// the TypeScript language service (what VS Code runs) for the member's definition, twice:
//   BEFORE = the types as on <ref> (default origin/main), without globals.gen.d.ts
//   AFTER  = the types in this tree
// A hit = the definition lands in one of the files that publish NAME. Prints:
//   §ED_TYPES globals=N sampled=S resolved_before=B resolved_after=A verdict=PASS|FAIL|INCONCLUSIVE
// PASS needs S>0 and A>B. sampled=0 -> INCONCLUSIVE (nothing judged). Read the log; the misses are listed.
// Needs TypeScript as a parser-only dep: `npm i --no-save typescript@5.6.3` or TSLIB=<path to typescript>.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
let ts; try { ts = require(process.env.TSLIB || 'typescript'); }
catch (e) { console.error('§ED_TYPES_NEED_TS npm i --no-save typescript@5.6.3  (or set TSLIB)'); process.exit(3); }

const ROOT = path.resolve(__dirname, '..', '..');
const REF = process.argv[2] || 'origin/main';
const GEN = path.join(ROOT, 'types', 'globals.gen.d.ts');
const HAND = path.join(ROOT, 'types', 'erp-globals.d.ts');
const cfgPath = path.join(ROOT, 'jsconfig.json');
const cfg = ts.parseJsonConfigFileContent(ts.parseConfigFileTextToJson(cfgPath, fs.readFileSync(cfgPath, 'utf8')).config, ts.sys, ROOT);

const decls = fs.readFileSync(GEN, 'utf8').split('\n').map(l => /^declare var ([\w$]+): (.*);$/.exec(l)).filter(Boolean)
  .map(m => ({ nm: m[1], pubs: [...m[2].matchAll(/import\("\.\.\/([^"]+)"\)/g)].map(x => x[1]) }));
const prod = cfg.fileNames.map(f => path.relative(ROOT, f)).filter(f => f.endsWith('.js') && !/\/tests\/|witness|probe/.test(f));
// Blank comment bodies (same length, so offsets still point at the real code) before matching: a regex cannot tell
// code from prose, and a use sampled inside a comment always "resolves to none" (first run of this witness did exactly
// that: viewer/schedule_engine.js:2, erp/doc_poster.js:240). Same class as CodeScrapBook §10 R9.
function codeOnly(src) {
  // skipTrivia=false so the scanner RETURNS comments; blank comments and string bodies, keep every offset.
  const out = src.split(''); const sc = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, src);
  const blank = (a, b) => { for (let i = a; i < b; i++) if (out[i] !== '\n') out[i] = ' '; };
  let k; while ((k = sc.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (k === ts.SyntaxKind.SingleLineCommentTrivia || k === ts.SyntaxKind.MultiLineCommentTrivia) blank(sc.getTokenStart(), sc.getTokenEnd());
    else if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) blank(sc.getTokenStart() + 1, sc.getTokenEnd() - 1);
  }
  return out.join('');
}
const samples = [];
for (const d of decls) {
  const re = new RegExp('(^|[^.\\w$])' + d.nm.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'm');
  for (const f of prod) {
    if (d.pubs.includes(f)) continue;
    const src = codeOnly(fs.readFileSync(path.join(ROOT, f), 'utf8')); const m = re.exec(src);
    if (m) { samples.push({ ...d, file: f, pos: m.index + m[1].length + d.nm.length + 1, member: m[2] }); break; }
  }
}

function service(before) {
  const refHand = before ? cp.execSync(`git show ${REF}:types/erp-globals.d.ts`, { cwd: ROOT }).toString() : null;
  const names = cfg.fileNames.filter(f => !(before && path.resolve(f) === GEN));
  const host = {
    getScriptFileNames: () => names, getScriptVersion: () => '1',
    getScriptSnapshot: f => {
      if (before && path.resolve(f) === HAND) return ts.ScriptSnapshot.fromString(refHand);
      return fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined;
    },
    getCurrentDirectory: () => ROOT, getCompilationSettings: () => cfg.options,
    getDefaultLibFileName: o => ts.getDefaultLibFilePath(o), fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
  };
  return ts.createLanguageService(host);
}
function judge(ls) {
  let hit = 0; const miss = [];
  for (const s of samples) {
    const defs = ls.getDefinitionAtPosition(path.join(ROOT, s.file), s.pos) || [];
    const ok = defs.some(d => s.pubs.includes(path.relative(ROOT, d.fileName)));
    if (ok) hit++; else miss.push(`${s.nm}.${s.member} @${s.file} -> ${defs.map(d => path.relative(ROOT, d.fileName)).join(',') || 'none'}`);
  }
  return { hit, miss };
}
const B = judge(service(true));
const A = judge(service(false));
const verdict = samples.length === 0 ? 'INCONCLUSIVE' : (A.hit > B.hit ? 'PASS' : 'FAIL');
console.log(`§ED_TYPES ref=${REF} globals=${decls.length} sampled=${samples.length} resolved_before=${B.hit} resolved_after=${A.hit} verdict=${verdict}`);
A.miss.forEach(m => console.log('  §ED_TYPES_MISS_AFTER ' + m));
process.exit(verdict === 'PASS' ? 0 : 1);
