// ⚠ DO NOT REMOVE — W-HQ-COST, BUILD HALF (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D8, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: the index must not cost the page more than its budget (PERF BUDGET). §19.3 adds the QUERY HALF (Q1-Q4), measured in the REAL ERP page now that the box is wired.
// C1 `§HQ_BUILD lang= records= bytes= gzip= ms=`: a fresh build of every language is <= 100 KB raw (else the line says OVER) and all languages build in <= 10 s. C2 the COMMITTED index.json equals a fresh build (header `built` aside):
// a stale file is a lie. C3 the index is made on the FIRST QUERY, never when the core is loaded or a handle is created (D8 "never at page load"). C4 `§HQ_READY ms= terms= postings=` is reported (budget 150 ms, once; informational here).
// QUERY HALF (design D8; headless chromium --disable-gpu, the page logged in as GardenAdmin, CDP for GC + heap; every language of the pack set; N = the RANK-TWIN query list of that language):
//   Q1 `§HQ_LOAD builds=`: no index is made by loading the page / binding the box (before the first question). Q2 `§HQ_READY ms=`: the index is made once, on the first query, <= 150 ms.
//   Q3 `§HQ_QUERY n= p50= p95=`: per query (HelpSearch idx.search = the core query + role gate) p95 <= 16 ms with the CPU slowed 4x (phone class); `§HQ_ASK` the whole card, informational.
//   Q4 `§HQ_HEAP delta=`: heap after forced GC, with the index made vs not, <= 2 MB (CDP Runtime.getHeapUsage; INCONCLUSIVE where it cannot be read). A line says OVER(budget) when exceeded, and the check FAILs.
// Red controls (must FAIL): HQ_BREAK=eager (the core makes the index in create(): C3 in Node, Q1 in the page) · HQ_BREAK=bloat (every measured size doubled: C1 must say OVER).   Run: node common/help/tests/witness_hq_cost.js
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./_hq'), k = H.kit('W-HQ-COST'), BR = process.env.HQ_BREAK || '';
const BUILD = require(path.join(H.ROOT, 'common', 'help', 'tools', 'build_help_index.js')), ADAPTER = require(path.join(H.ERP, 'tools', 'help_records.js')), HQ = require(H.CORE);
(async function main() {
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
  await queryHalf();
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]; };
async function queryHalf() {
  const BUD = { ready: 150, p95: 16, heap: 2 * 1024 * 1024 };
  let page; try { page = await H.erpPage({ HQ: BR }); } catch (e) { k.incon('Q', 'no headless chromium / page: ' + String(e.message).split('\n')[0]); return; }
  try {
    const cdp = await page.pg.context().newCDPSession(page.pg);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    k.L('chromium ' + page.version + ' (--disable-gpu) page errors at load=' + page.errs.length);
    const builds0 = await page.pg.evaluate(() => window.HelpQuery.builds());
    k.out('§HQ_LOAD builds=' + builds0 + ' (the page is up, the box is bound, no question asked yet)');
    k.chk('Q1 no index is made by loading the page or binding the box: builds=' + builds0, builds0 === 0);
    let nAll = 0, overP = 0, overR = 0, overH = 0, lastIdx = null;
    for (const lang of H.LANGS) {
      const line = lang === 'en_US' ? page.firstIndexLine : await page.setLang(lang);
      if (!line) { k.incon('Q-' + lang, 'the page did not build its index in ' + lang); continue; }
      const qs = H.queries(H.pack(lang));
      const h0 = await heap();
      const first = await page.pg.evaluate((q) => { const ix = window.__idmpHowto.index(), t = performance.now(); ix.search(q); return { ms: performance.now() - t, built: ix.core.built, stats: ix.core.stats }; }, qs[0]);
      const h1 = await heap(), delta = h1 - h0;
      k.out('§HQ_READY lang=' + lang + ' ms=' + first.stats.ms.toFixed(1) + ' first-query-ms=' + first.ms.toFixed(1) + ' terms=' + first.stats.terms + ' postings=' + first.stats.postings + ' (budget ' + BUD.ready + ' ms, once) ' + (first.stats.ms <= BUD.ready ? 'ok' : 'OVER(' + BUD.ready + ')'));
      k.out('§HQ_HEAP lang=' + lang + ' before=' + h0 + ' after=' + h1 + ' delta=' + delta + ' (budget ' + BUD.heap + ' bytes) ' + (delta <= BUD.heap ? 'ok' : 'OVER(' + BUD.heap + ')'));
      if (first.stats.ms > BUD.ready) overR++; if (delta > BUD.heap) overH++;
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t = await page.pg.evaluate((qs) => { const ix = window.__idmpHowto.index(), a = [], c = []; qs.forEach((q) => { let t0 = performance.now(); ix.search(q); a.push(performance.now() - t0); t0 = performance.now(); ix.ask(q); c.push(performance.now() - t0); }); return { a, c }; }, qs);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const p95 = pct(t.a, 0.95), ap95 = pct(t.c, 0.95); nAll += qs.length; if (p95 > BUD.p95) overP++;
      k.out('§HQ_QUERY lang=' + lang + ' n=' + qs.length + ' p50=' + pct(t.a, 0.5).toFixed(2) + ' p95=' + p95.toFixed(2) + ' max=' + Math.max.apply(null, t.a).toFixed(2) + ' ms, CPU 4x slower (budget ' + BUD.p95 + ' ms) ' + (p95 <= BUD.p95 ? 'ok' : 'OVER(' + BUD.p95 + ')'));
      k.out('§HQ_ASK lang=' + lang + ' n=' + qs.length + ' p50=' + pct(t.c, 0.5).toFixed(2) + ' p95=' + ap95.toFixed(2) + ' ms, CPU 4x slower (whole card incl. phrase matching; informational)');
      k.chk('Q2 ' + lang + ' the index is made once, on the first query, in <= ' + BUD.ready + ' ms: ' + first.stats.ms.toFixed(1), first.built && first.stats.ms <= BUD.ready);
      k.chk('Q3 ' + lang + ' per-query p95 <= ' + BUD.p95 + ' ms at 4x CPU slowdown: ' + p95.toFixed(2) + ' ms over ' + qs.length + ' queries', qs.length > 0 && p95 <= BUD.p95);
      k.chk('Q4 ' + lang + ' heap after the index is made <= +' + BUD.heap + ' bytes: +' + delta, delta <= BUD.heap);
    }
    if (!nAll) k.incon('Q3', 'VACUOUS: no query timed');
    k.out('§HQ_QUERY_ALL languages=' + H.LANGS.length + ' queries=' + nAll + ' over-budget: ready=' + overR + ' p95=' + overP + ' heap=' + overH);
  } finally { await page.close(); }
}
