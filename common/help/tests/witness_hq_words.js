// ⚠ DO NOT REMOVE — W-HQ-WORDS (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D2, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: browsers ship different ICU word dictionaries, so a split made at query time can differ from the shell's. The core never calls Intl.Segmenter at query time (the pack's `vocab` does that job);
// this witness proves the page and Node then split every record name into the SAME terms. N = every record name (n and each other name a) of every built language; X = names whose term list is identical in headless Chromium and in Node.
// W2 REPORTS (a number, not a verdict) how many names a browser's own LIVE Intl.Segmenter would split differently from Node's: the risk the build-time vocab removes.
// W3 fold: every accented name loses its accents like legacy's Util.deleteAccents (U+0300-U+036F); it also reports how many names a literal NFKC fold would have left accented (why the fold decomposes first).
// Red control (must FAIL): HQ_BREAK=nodict in the PAGE only (the vocab ignored there: pairs only).   Run: node common/help/tests/witness_hq_words.js
'use strict';
const H = require('./_hq');
const k = H.kit('W-HQ-WORDS'), BR = process.env.HQ_BREAK || '';   // the kit names the log by the break
delete process.env.HQ_BREAK;   // the break is applied to ONE environment (the page); Node stays honest (the core reads the env per call)
const HQ = require(H.CORE);
(async function main() {
  const packs = H.LANGS.map(H.pack), names = (p) => { const o = []; p.index.records.forEach((r) => { o.push(r.n); (r.a || []).forEach((a) => o.push(a)); }); return o; };
  let page; try { page = await H.page(BR); } catch (e) { k.incon('ALL', 'no headless chromium: ' + e.message.split('\n')[0]); return k.end(); }
  try {
    k.L('chromium ' + page.version + ' (--disable-gpu) · node ' + process.versions.node + ' icu ' + process.versions.icu);
    let X = 0, N = 0, live = 0, liveN = 0;
    for (const p of packs) {
      const ns = names(p), nodeT = ns.map((s) => JSON.stringify(HQ.termsOf(s, p.index)));
      const r = await page.pg.evaluate(({ idx, ns, lang }) => {
        const terms = ns.map((s) => JSON.stringify(window.HelpQuery.termsOf(s, idx)));
        const nsRe = new RegExp('[' + idx.nospace + ']', 'u'), seg = new Intl.Segmenter(lang.replace('_', '-'), { granularity: 'word' });
        const live = ns.map((s) => nsRe.test(s) ? JSON.stringify(Array.from(seg.segment(window.HelpQuery.fold(s))).filter((x) => x.isWordLike && Array.from(x.segment).length >= 2 && new RegExp('^[' + idx.nospace + ']+$', 'u').test(x.segment)).map((x) => x.segment)) : null);
        return { terms, live };
      }, { idx: { nospace: p.index.nospace, vocab: p.index.vocab }, ns, lang: p.lang });
      let ok = 0; const bad = []; nodeT.forEach((t, i) => { if (t === r.terms[i]) ok++; else if (bad.length < 3) bad.push('"' + ns[i] + '" node=' + t + ' page=' + r.terms[i]); });
      X += ok; N += ns.length;
      k.L('lang=' + p.lang + ' names=' + ns.length + ' same-terms=' + ok + ' vocab=' + p.index.vocab.length);
      k.chk('W1 ' + p.lang + ' the page and Node split every name into the same terms: ' + ok + ' of ' + ns.length, ok === ns.length && ns.length > 0, bad.length ? 'e.g. ' + bad.join(' ; ') : '');
      // W2 (a report): Node's live segmenter vs the page's live segmenter, on the names with a no-space character
      const seg = new Intl.Segmenter(p.lang.replace('_', '-'), { granularity: 'word' }), nsRe = new RegExp('[' + p.index.nospace + ']', 'u'), only = new RegExp('^[' + p.index.nospace + ']+$', 'u');
      let n2 = 0, d2 = 0; ns.forEach((s, i) => { if (!nsRe.test(s)) return; n2++; const nl = JSON.stringify(Array.from(seg.segment(HQ.fold(s))).filter((x) => x.isWordLike && Array.from(x.segment).length >= 2 && only.test(x.segment)).map((x) => x.segment)); if (nl !== r.live[i]) d2++; });
      live += d2; liveN += n2; k.L('W2 REPORT lang=' + p.lang + ' names with a no-space script=' + n2 + ' split differently by the page\'s live Intl.Segmenter than by Node\'s=' + d2);
    }
    k.L('ALL languages: ' + X + ' of ' + N + ' names give the same terms in the page and in Node');
    k.L('W2 REPORT total: ' + live + ' of ' + liveN + ' no-space names would split differently if the segmenter ran at query time (the vocab removes this by construction)');
    // W3: the fold deletes accents (legacy's Util.deleteAccents), judged in Node on every name
    let acc = 0, kept = 0, same = 0, literalLeft = 0; const ACC = /[\u0300-\u036f]/;
    packs.forEach((p) => names(p).forEach((s) => { if (!ACC.test(s.normalize('NFD'))) return; acc++; const f = HQ.fold(s); if (ACC.test(f.normalize('NFD'))) kept++; if (f === HQ.deleteAccents(s.toLowerCase()).normalize('NFC')) same++; if (ACC.test(s.normalize('NFKC').toLowerCase().normalize('NFD')) && ACC.test(s.normalize('NFKC').toLowerCase().replace(/[\u0300-\u036f]/g, '').normalize('NFD'))) literalLeft++; }));
    if (!acc) k.incon('W3', 'no accented name in any pack');
    else k.chk('W3 every accented name loses its accents in the fold: ' + (acc - kept) + ' of ' + acc + ' (equal to legacy deleteAccents on ' + same + ' of ' + acc + '; a literal NFKC-then-strip fold would leave ' + literalLeft + ' of them accented)', kept === 0, kept ? kept + ' keep an accent' : '');
  } finally { await page.close(); }
  k.end();
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exitCode = 2; });
