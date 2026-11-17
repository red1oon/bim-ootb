// ⚠ DO NOT REMOVE — W-HQ-COST, BUILD HALF (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D8, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: the index must not cost the page more than its budget (PERF BUDGET). The query half (p95 per query, heap) waits for the step that wires a box.
// C1 `§HQ_BUILD lang= records= bytes= gzip= ms=`: a fresh build of every language is <= 100 KB raw (else the line says OVER) and all languages build in <= 10 s. C2 the COMMITTED index.json equals a fresh build (header `built` aside):
// a stale file is a lie. C3 the index is made on the FIRST QUERY, never when the core is loaded or a handle is created (D8 "never at page load"). C4 `§HQ_READY ms= terms= postings=` is reported (budget 150 ms, once; informational here).
// Red controls (must FAIL): HQ_BREAK=eager (the core makes the index in create(): C3) · HQ_BREAK=bloat (every measured size doubled: C1 must say OVER).   Run: node common/help/tests/witness_hq_cost.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), k = H.kit('W-HQ-COST'), BR = process.env.HQ_BREAK || '';
const BUILD = require(path.join(H.ROOT, 'common', 'help', 'tools', 'build_help_index.js')), ADAPTER = require(path.join(H.ERP, 'tools', 'help_records.js')), HQ = require(H.CORE);
(function main() {
  if (!H.seedOk()) { k.incon('ALL', 'no usable ad_seed.db (an LFS stub?)'); return k.end(); }
  let total = 0, ready = [];
  H.LANGS.forEach((lang) => {
    const b = BUILD.build(ADAPTER, lang), bytes = BR === 'bloat' ? b.bytes * 2 : b.bytes; total += b.ms;
    k.out(BUILD.line(lang, Object.assign({}, b, { bytes })));
    k.chk('C1 ' + lang + ' index.json <= ' + BUILD.BUDGET + ' bytes: ' + bytes, bytes <= BUILD.BUDGET, bytes > BUILD.BUDGET ? 'OVER by ' + (bytes - BUILD.BUDGET) : '');
    const strip = (t) => { const o = JSON.parse(t); delete o.built; return JSON.stringify(o); }, f = ADAPTER.outFile(lang);
    k.chk('C2 ' + lang + ' the committed index.json equals a fresh build (built header aside)', fs.existsSync(f) && strip(fs.readFileSync(f, 'utf8')) === strip(b.text), fs.existsSync(f) ? '' : 'missing ' + f);
    const p = H.pack(lang), before = HQ.builds(), h = HQ.create(p.index, { text: p.text }), afterCreate = HQ.builds();
    k.chk('C3 ' + lang + ' no index is made by loading the core or create(): builds ' + before + ' -> ' + afterCreate, afterCreate === before);
    h.query(H.queries(p)[0]); const afterQuery = HQ.builds(); ready.push(h.stats);
    k.chk('C3b ' + lang + ' the first query makes it, once: builds ' + afterCreate + ' -> ' + afterQuery, afterQuery === afterCreate + 1);
    k.out('§HQ_READY lang=' + lang + ' ms=' + h.stats.ms.toFixed(1) + ' terms=' + h.stats.terms + ' postings=' + h.stats.postings + ' (budget 150 ms, once; the query half judges it when a box is wired)');
  });
  k.chk('C1b all languages build in <= 10000 ms: ' + total + ' ms', total <= 10000);
  k.end();
})();
