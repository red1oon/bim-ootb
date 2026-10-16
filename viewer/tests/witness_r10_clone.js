#!/usr/bin/env node
// witness_r10_clone.js — W-R10-CLONE (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §R10-MAP-SHADOW).
// ISSUE IT PROVES OR DISPROVES: "highlighting a window/door element throws `arr.map is not a function`" — because
// _r10MatArray forwards the material property 'map' onto the array, shadowing Array.prototype.map, and clone() used it.
//  (a) clone() on an R10 material array returns an R10 array of per-element clones, same length, no throw
//  (b) the 'map' forward is KEPT: arr.map reads arr[0].map (the texture) — the fix must not drop the R10 contract
//  (c) dispose() reaches every element
//  (d) CONTROL: the same block with the pre-fix clone body (arr.map(...)) throws the TypeError — proves (a) can fail
// Builds the function from the REAL viewer/streaming.js source (no browser). INCONCLUSIVE if the block is not found.
// Run: node viewer/tests/witness_r10_clone.js — read the § lines; exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'streaming.js'), 'utf8');
let pass = 0, fail = 0; const W = (ok, m) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + m); };
const i = SRC.indexOf('var _R10_FWD_FIRST'), j = SRC.indexOf('A._r10MatCache = {};');
if (i < 0 || j < 0 || j < i) { console.log('§W-R10-CLONE INCONCLUSIVE — _r10MatArray block not found'); process.exit(1); }
const block = SRC.slice(i, j);
function build(code) { const A = {}; new Function('A', code)(A); return A; }
function mat(id) { return { id, map: { tex: 'T' + id }, color: 'c' + id, disposed: 0, clone() { return mat(id + "'"); }, dispose() { this.disposed++; } }; }
// (a)(b)(c) on the real code
{
  const A = build(block); const arr = A._r10MatArray([mat(1), mat(2)]);
  let c = null, err = null; try { c = arr.clone(); } catch (e) { err = e; }
  W(!err && c && c.length === 2 && c[0].id === "1'" && c[1].id === "2'" && c.isR10MaterialArray === true,
    '(a) clone() → R10 array of 2 clones' + (err ? ' THREW ' + err.message : ' ids=' + (c && [c[0].id, c[1].id].join(','))));
  W(arr.map && arr.map.tex === 'T1', '(b) texture forward kept: arr.map → arr[0].map = ' + JSON.stringify(arr.map));
  arr.dispose(); W(arr[0].disposed === 1 && arr[1].disposed === 1, '(c) dispose() reached both materials');
}
// (d) control: the pre-fix clone body
{
  const pre = block.replace(/Array\.prototype\.map\.call\(arr, /, 'arr.map(');
  const A = build(pre); const arr = A._r10MatArray([mat(1), mat(2)]);
  let err = null; try { arr.clone(); } catch (e) { err = e; }
  W(pre !== block && err && /arr\.map is not a function/.test(err.message), '(d) control: pre-fix clone throws "' + (err ? err.message : 'nothing') + '"');
}
const verdict = fail ? 'FAIL' : 'PASS';
console.log('§W-R10-CLONE ' + verdict + ' pass=' + pass + ' fail=' + fail);
process.exit(verdict === 'PASS' ? 0 : 1);
