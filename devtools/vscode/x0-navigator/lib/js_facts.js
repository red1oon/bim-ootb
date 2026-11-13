// SPDX-License-Identifier: MIT
// X0 Navigator — read two kinds of fact out of a JavaScript file with a PARSER, never a regex:
//   stringConst(src, 'CACHE_VERSION')   → the string a top-level `const NAME = '…'` holds
//   stringArray(src, 'PRECACHE_ASSETS') → the string literals of a top-level `const NAME = [ … ]`
// Spec: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12 (rule: "Instrument honesty"). Pure node, no `vscode` import.
// The parser is VS Code's own TypeScript, found by the repo's scripts/lib/find_ts.js (no install). None found → null:
// the caller prints INCONCLUSIVE, it never falls back to guessing.
'use strict';
const path = require('path');

let cached = null;
/** The TypeScript module, or null. `root` is the bim-ootb checkout (it carries scripts/lib/find_ts.js). */
function loadTs(root) {
  if (cached) return cached;
  try {
    const f = require(path.join(root, 'scripts', 'lib', 'find_ts.js'));
    const r = (f.findTs || f)();
    cached = r && r.ts ? r.ts : null;
  } catch (e) { cached = null; }
  return cached;
}

function topLevelInit(ts, src, name) {
  const sf = ts.createSourceFile('x.js', src, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  let found = null;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) found = d.initializer;
  }
  return found;
}
const isStr = (ts, n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

/** @returns {string|null} */
function stringConst(ts, src, name) {
  const init = topLevelInit(ts, src, name);
  return init && isStr(ts, init) ? init.text : null;
}
/** @returns {{items: string[], nonliteral: number} | null}  nonliteral = elements that are not plain strings (spreads, calls) */
function stringArray(ts, src, name) {
  const init = topLevelInit(ts, src, name);
  if (!init || !ts.isArrayLiteralExpression(init)) return null;
  const items = []; let nonliteral = 0;
  for (const e of init.elements) { if (isStr(ts, e)) items.push(e.text); else nonliteral++; }
  return { items, nonliteral };
}

module.exports = { loadTs, stringConst, stringArray };
