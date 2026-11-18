// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part E, "E1 BUILD SPEC" (owner E-1: one `PROVES:` line).
// Reads the `PROVES:` line(s) of a witness's leading comment block:  // PROVES: viewer/db_resolve.js R1-R4, viewer/scene.js
// Returns [{file, rules}] (rules = the words after the path, may be empty). Only the header counts: a PROVES: later in the file is code or data.
'use strict';
function provesOf(src) {
  let s = String(src).replace(/^#![^\n]*\n/, ''), head = '';
  for (;;) { const m = /^\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(s); if (!m) break; head += m[1] + '\n'; s = s.slice(m[0].length); if (head.length > 20000) break; }
  const out = [];
  for (const m of head.matchAll(/(?:^|\n)\s*(?:\/\/|\*)?\s*PROVES:\s*([^\n]+)/g))
    for (const part of m[1].replace(/\*\/\s*$/, '').split(',')) { const w = part.trim().split(/\s+/).filter(Boolean); if (w.length) out.push({ file: w[0], rules: w.slice(1) }); }
  return out;
}
module.exports = { provesOf };
