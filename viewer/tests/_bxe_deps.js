// _bxe_deps.js — the delegates `_buildXrayElements` calls that a text-slicing witness must carry with it.
// bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.10 / §Q.12.3: since bim-ootb #1890 the element build calls
// `_scheduledWhere` and `_civilRule`; ten witnesses sliced the build without them, a bare catch swallowed the
// ReferenceError, and each one judged ZERO elements for six weeks. ONE list here, so the next delegate is added once.
// bxeDeps(src) -> the source text of every listed function PRESENT in `src` ('' for a revision that predates them).
// Both are one-line delegates to window.ScheduleAuthor with the pre-owner clause as their own fallback, so a sandbox
// without ScheduleAuthor still runs (and reads the same population on a building with no civil reference rows).
'use strict';
const DEPS = ['_scheduledWhere', '_civilRule'];
function sliceOne(src, name) {
  const at = src.search(new RegExp('^[ \\t]*function ' + name + '\\(', 'm'));
  if (at < 0) return '';
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return '';
}
function bxeDeps(src) { return DEPS.map(n => sliceOne(src, n)).filter(Boolean).join('\n'); }
module.exports = { bxeDeps: bxeDeps, DEPS: DEPS };
