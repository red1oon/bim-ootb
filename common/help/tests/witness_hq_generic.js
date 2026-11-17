// ⚠ DO NOT REMOVE — W-HQ-GENERIC (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: the query core is generic (AD-LAYER LAW) — its code names no table of the dictionary, no window id, and has no branch on a record kind (the kind order is data in the pack).
// N comes from the dictionary: every table name of ad_seed.db, every window id of ad_seed.db, every kind in the built packs' headers, each searched in the core's code (comments blanked by the repo's one tokenizer).
// Red controls (must FAIL): HQ_BREAK=c_order (a 'c_order' string appended to the checked source) · HQ_BREAK=kindbranch (a `rec.k === 'window'` branch appended).
// Run: node common/help/tests/witness_hq_generic.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), { scan } = require(path.join(H.ROOT, 'scripts', 'lib', 'js_scan.js'));
const k = H.kit('W-HQ-GENERIC'), BR = process.env.HQ_BREAK || '';
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  let src = fs.readFileSync(H.CORE, 'utf8');
  if (BR === 'c_order') src += "\nvar x = 'c_order';\n";
  if (BR === 'kindbranch') src += "\nif (rec.k === 'window') { }\n";
  const code = scan(src).code;
  const tables = H.q('SELECT tablename AS t FROM ad_table').map((r) => String(r.t)), wins = H.q('SELECT ad_window_id AS id FROM ad_window').map((r) => String(r.id));
  const kinds = new Set(); H.LANGS.forEach((l) => (H.pack(l).index.kinds || []).forEach((x) => kinds.add(x)));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tHits = tables.filter((t) => new RegExp('(?<![\\w])(' + esc(t) + (t.indexOf('_') > 0 ? '|' + esc(t.toLowerCase()) : '') + ')(?![\\w])').test(code));
  const wHits = wins.filter((w) => new RegExp('(?<![\\w.])' + w + '(?![\\w.])').test(code));
  const kHits = Array.from(kinds).filter((x) => new RegExp('[\'"]' + esc(x) + '[\'"]').test(code));
  const branch = code.match(/\b(?:k|kind)\s*[!=]==?\s*['"][^'"]*['"]|case\s+['"][^'"]*['"]\s*:/g) || [];
  k.L('dictionary tables=' + tables.length + ' window ids=' + wins.length + ' kinds in the packs=' + kinds.size + ' (' + Array.from(kinds).join(',') + ') code chars=' + code.length);
  if (!tables.length || !wins.length || !kinds.size) { k.incon('ALL', 'an empty population (tables=' + tables.length + ' windows=' + wins.length + ' kinds=' + kinds.size + ')'); return k.end(); }
  k.chk('G1 no table name of the dictionary in the core\'s code: ' + (tables.length - tHits.length) + ' of ' + tables.length + ' absent', tHits.length === 0, tHits.length ? 'FOUND ' + tHits.slice(0, 5).join(',') : '');
  k.chk('G2 no window id of the dictionary in the core\'s code: ' + (wins.length - wHits.length) + ' of ' + wins.length + ' absent', wHits.length === 0, wHits.length ? 'FOUND ' + wHits.slice(0, 5).join(',') : '');
  k.chk('G3 no kind name as a string in the core\'s code: ' + (kinds.size - kHits.length) + ' of ' + kinds.size + ' absent', kHits.length === 0, kHits.length ? 'FOUND ' + kHits.join(',') : '');
  k.chk('G4 no branch on a kind (k === \'…\', kind === \'…\', case \'…\':)', branch.length === 0, branch.length ? 'FOUND ' + branch.slice(0, 3).join(' ; ') : '');
  k.end();
})();
