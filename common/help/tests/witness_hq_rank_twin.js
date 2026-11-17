// ⚠ DO NOT REMOVE — W-HQ-RANK-TWIN (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D3, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: the page and the shell must show the SAME list for the same words. The same packs and the same query list run through the core in Node and in headless Chromium (--disable-gpu);
// the two result lists (id | tier | integer score, every hit, in order) are compared TEXT FOR TEXT. N comes from the dictionary-built packs: every window, process, action and status name, every how-to title, and each
// multi-word name's first word alone, in every built language. T0 checks a tie group exists (equal tier and score) and a DEEP one (equal tier, score, kind and folded name: only the id decides); with none the verdict is INCONCLUSIVE.
// Red control (must FAIL): HQ_BREAK=revtie in the PAGE only (the last tie-break key reversed there).   Run: node common/help/tests/witness_hq_rank_twin.js
'use strict';
const crypto = require('crypto');
const H = require('./_hq'), k = H.kit('W-HQ-RANK-TWIN'), BR = process.env.HQ_BREAK || '';
delete process.env.HQ_BREAK;   // one environment carries the break: the page. Node stays honest.
const HQ = require(H.CORE);
(async function main() {
  let page; try { page = await H.page(BR); } catch (e) { k.incon('ALL', 'no headless chromium: ' + e.message.split('\n')[0]); return k.end(); }
  try {
    k.L('chromium ' + page.version + ' (--disable-gpu) · node ' + process.versions.node + ' icu ' + process.versions.icu);
    let X = 0, N = 0, hitsAll = 0, groups = 0, deep = 0;
    // one pack at a time: the ERP packs (text through their resolver) and, §19.4, the Viewer + Modeller packs of every locale (their records hold their own strings)
    const packs = H.LANGS.map((lang) => ({ label: 'erp ' + lang, p: H.pack(lang), all: false })).concat(
      [].concat(...H.BIM_APPS.map((app) => H.BIM_LOCALES.map((lang) => ({ label: app + ' ' + lang, p: H.bimPack(app, lang), all: true })))));
    for (const { label, p, all } of packs) {
      const qs = H.queries(p, all), node = H.lines(HQ, p, qs);
      const web = await page.pg.evaluate(({ idx, tx, qs }) => { const h = window.HelpQuery.create(idx, { text: (i) => tx[i] }); return qs.map((s) => h.query(s).map((x) => x.id + '|' + x.tier + '|' + x.score).join(',')); }, { idx: p.index, tx: H.textsUsed(p), qs });
      let ok = 0; const bad = []; qs.forEach((s, i) => { if (node[i] === web[i]) ok++; else if (bad.length < 2) bad.push('"' + s + '" node=' + node[i].slice(0, 90) + ' page=' + web[i].slice(0, 90)); });
      const h = HQ.create(p.index, { text: p.text }); let g = 0, d = 0, hits = 0;
      qs.forEach((s) => { const r = h.query(s); hits += r.length; for (let i = 1; i < r.length; i++) { const a = r[i - 1], b = r[i]; if (a.tier === b.tier && a.score === b.score) { g++; if (a.k === b.k && HQ.tidy(a.rec.n) === HQ.tidy(b.rec.n)) d++; } } });
      X += ok; N += qs.length; hitsAll += hits; groups += g; deep += d;
      const sha = (a) => crypto.createHash('sha256').update(a.join('\n')).digest('hex').slice(0, 16);
      k.L('pack=' + label + ' queries=' + qs.length + ' hits=' + hits + ' lists-equal=' + ok + ' node-sha=' + sha(node) + ' page-sha=' + sha(web) + ' tie-pairs=' + g + ' tie-pairs-decided-by-id=' + d);
      k.chk('T1 ' + label + ' the page list == the Node list, text for text: ' + ok + ' of ' + qs.length + ' queries', ok === qs.length && qs.length > 0, bad.length ? 'e.g. ' + bad.join(' ; ') : '');
    }
    k.L('ALL packs (erp x ' + H.LANGS.length + ', viewer + modeller x ' + H.BIM_LOCALES.length + ' locales): ' + X + ' of ' + N + ' queries identical; ' + hitsAll + ' hits compared; adjacent tie pairs=' + groups + ', decided by the id alone=' + deep);
    if (!groups || !deep) k.incon('T0', 'no tie group that reaches the last tie-break key (tie pairs ' + groups + ', by id ' + deep + '): the id order was not exercised');
    else k.chk('T0 the lists contain ties (' + groups + ' adjacent pairs) and ties only the id decides (' + deep + '), so the last key is exercised', true);
  } finally { await page.close(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
