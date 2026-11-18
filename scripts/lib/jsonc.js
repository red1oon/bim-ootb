// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the ONE JSONC reader of the dev tools (.vscode/tasks.json, launch.json): // and /* */ comments and trailing commas are dropped,
// outside strings only. Moved here from scripts/setup.js for W-VSC-OPERATIONAL (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.41; bim-ootb #3330). Dev-side only.
'use strict';
const fs = require('fs');
/** @param {string} t JSONC text @returns {any} */
function parse(t) {
  let o = '', i = 0, str = false;
  while (i < t.length) { const c = t[i];
    if (str) { o += c; if (c === '\\') o += t[++i]; else if (c === '"') str = false; i++; }
    else if (c === '"') { str = true; o += c; i++; }
    else if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; }
    else if (c === '/' && t[i + 1] === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i += 2; }
    else { o += c; i++; } }
  return JSON.parse(o.replace(/,(\s*[}\]])/g, '$1'));
}
const read = f => parse(fs.readFileSync(f, 'utf8'));
module.exports = { parse, read };
