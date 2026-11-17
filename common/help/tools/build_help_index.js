#!/usr/bin/env node
// ⚠ DO NOT REMOVE — build_help_index.js: the ONE help index builder (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1 D2 D8, §4).
// READ THE LOG after every run (the `§HQ_BUILD` lines; common/help/tests/logs/ for the witnesses). An exit code is not evidence.
// The ONLY place Intl.Segmenter runs: it makes the per-language `vocab` word list (the distinct word-like segments of 2+ characters, in no-space scripts, over every name and text of the
// language's records) and the header says which Node and ICU made it. At query time the core never calls the segmenter, so the page and the shell split alike by construction.
// Usage: node common/help/tools/build_help_index.js [--app erp] [--lang en_US,fr_FR,...] [--out <dir>]   (default: the adapter's own committed path, <app>/i18n/help/<lang>/index.json)
// An adapter (<app>/tools/help_records.js) LISTS records; this file never names a table or a kind. Budget (design D8): index.json <= 100 KB per language, the line says OVER if not.
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..', '..', '..');
const HQ = require(path.join(__dirname, '..', 'help_query.js'));
const NOSPACE = '\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u0e00-\\u0e7f';   // kana, CJK ideographs, Thai: data in the header, read by the core
const HEADER = { bm25: { k1: 1.2, b: 0.75, scale: 1000000000 }, weights: { n: 3, a: 3, d: 2, h: 1, pair: 1 } };
const BUDGET = 100 * 1024;
function vocabOf(lang, recs, resolve) {
  const ns = new RegExp('^[' + NOSPACE + ']+$', 'u'), any = new RegExp('[' + NOSPACE + ']', 'u'), seg = new Intl.Segmenter(lang.replace('_', '-'), { granularity: 'word' }), set = new Set();
  const str = (v) => (typeof v === 'number' ? resolve(v) : v == null ? '' : String(v));
  recs.forEach((r) => [r.n].concat(r.a || [], [r.d, r.h]).forEach((f) => {
    const t = HQ.fold(str(f)); if (!any.test(t)) return;   // only a text with a no-space character needs the segmenter
    for (const s of seg.segment(t)) if (s.isWordLike && Array.from(s.segment).length >= 2 && ns.test(s.segment)) set.add(s.segment);
  }));
  return Array.from(set).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
function build(adapter, lang) {
  const t0 = Date.now(), d = adapter.load(lang), recs = d.records.slice();
  const order = {}; d.kinds.forEach((k, i) => { order[k] = i; });
  recs.sort((a, b) => order[a.k] - order[b.k] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // deterministic file: kind order, then id
  const idx = Object.assign({ v: 1, app: adapter.app, lang, spec: 'bim-compiler prompts/HELP_QUERY_CORE_DESIGN.md', built: { tool: 'build_help_index.js', node: process.versions.node, icu: process.versions.icu } },
    HEADER, { kinds: d.kinds, ntexts: d.ntexts, nospace: NOSPACE, vocab: vocabOf(lang, recs, d.resolve), records: recs });
  const text = JSON.stringify(idx);
  return { index: idx, text, bytes: Buffer.byteLength(text), gzip: zlib.gzipSync(text).length, ms: Date.now() - t0 };
}
function line(lang, b) { return '§HQ_BUILD lang=' + lang + ' records=' + b.index.records.length + ' vocab=' + b.index.vocab.length + ' bytes=' + b.bytes + ' gzip=' + b.gzip + ' ms=' + b.ms + ' node=' + process.versions.node + ' icu=' + process.versions.icu + (b.bytes > BUDGET ? ' OVER(' + BUDGET + ')' : ' ok(<=' + BUDGET + ')'); }
module.exports = { build, line, BUDGET, NOSPACE };
if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const adapter = require(path.join(ROOT, arg('app', 'erp'), 'tools', 'help_records.js')), out = arg('out', null);
  (arg('lang', '') ? arg('lang').split(',') : adapter.langs).forEach((lang) => {
    const b = build(adapter, lang), f = out ? path.join(out, lang + '.index.json') : adapter.outFile(lang);
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b.text); console.log(line(lang, b) + ' file=' + path.relative(ROOT, f));
  });
}
