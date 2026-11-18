// _gantt_pipeline.js — one owner for "what does a Gantt edit verb reach through the commit pipeline" (bim-compiler
// prompts/4D_MODEL_INTEGRITY.md §Q.19.7). Since §ONE_COMMIT_PIPELINE a verb no longer calls resync / annotate / persist
// itself: it calls _tmCommitEdit (or _tmEditRefresh), and those two functions carry the steps. A witness that asks
// "does verb X persist / re-annotate / resync?" asks it of reach(body, src): the verb's own body plus the pipeline
// owners it calls. Each such witness keeps its own claim; only where it looks moved.
'use strict';
const OWNERS = ['_tmCommitEdit', '_tmEditRefresh'];   // in call order: the first calls the second
const COMMIT_CALL = '_tmCommitEdit(';                 // the call that carries an edit into the pipeline
function bodyOf(src, name) {
  const m = new RegExp('^[ \\t]*function ' + name + '\\(', 'm').exec(src);
  if (!m) throw new Error(name + ' not found — the commit pipeline owners were renamed and this reader went blind');
  const idx = m.index + m[0].indexOf('function'); let d = 0, open = false;
  for (let i = idx; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}
function reach(fnBody, src) {
  let out = fnBody;
  OWNERS.forEach(o => { if (out.indexOf(o + '(') >= 0 && fnBody.indexOf('function ' + o + '(') !== 0) out += '\n' + bodyOf(src, o); });
  return out;
}
module.exports = { OWNERS: OWNERS, COMMIT_CALL: COMMIT_CALL, bodyOf: bodyOf, reach: reach };
