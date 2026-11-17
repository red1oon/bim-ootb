// ⚠ DO NOT REMOVE — W-HQ-BM25 (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D3, §5). READ THE LOG; an exit code is not evidence.
// ISSUE it proves or disproves: the core's score is an INTEGER made with + - * / only (own ln()), so two engines add the same numbers; it must still BE a BM25. For the top hit of every query of the twin list (N, per language)
// this witness recomputes the score as a plain floating-point BM25 (Math.log, k1 / b / weights / scale read from the PACK HEADER, not from the core; terms from the core's own word rule) and needs agreement within 1e-6 relative.
// B2 checks the core's ln() against Math.log on the idf arguments in use. A top hit whose score is 0 (a name-tier hit with no term) is not counted as judged; a run where none scored is INCONCLUSIVE.
// Red control (must FAIL): HQ_BREAK=k1 (the core's k1 changed).   Run: node common/help/tests/witness_hq_bm25.js
'use strict';
const H = require('./_hq'), HQ = require(H.CORE), k = H.kit('W-HQ-BM25');
(function main() {
  let X = 0, N = 0, zero = 0, lnBad = 0, lnN = 0, worst = 0;
  H.LANGS.forEach((lang) => {
    const p = H.pack(lang), I = p.index, h = HQ.create(I, { text: p.text }), qs = H.queries(p), recs = I.records, Nr = recs.length;
    const str = (v) => (typeof v === 'number' ? p.text(v) : v == null ? '' : String(v));
    // the witness's own field table: terms per record by the core's word rule (h.terms), weights from the pack header
    const W = I.weights, tf = recs.map((r) => { const c = {}; let len = 0; [['n', r.n]].concat((r.a || []).map((a) => ['a', a]), [['d', r.d], ['h', r.h]]).forEach((f) => h.terms(str(f[1])).forEach((t) => { const w = t.charAt(0) === '\u0001' ? W.pair : W[f[0]]; c[t] = (c[t] || 0) + w; len += w; })); return { c, len }; });
    const avg = tf.reduce((a, x) => a + x.len, 0) / Nr, df = {}; tf.forEach((x) => Object.keys(x.c).forEach((t) => { df[t] = (df[t] || 0) + 1; }));
    const float = (rid, query) => { const i = recs.findIndex((r) => r.id === rid), seen = new Set(); let s = 0; h.terms(query).forEach((t) => { if (seen.has(t)) return; seen.add(t); const f = tf[i].c[t]; if (!f) return; const idf = Math.log(1 + (Nr - df[t] + 0.5) / (df[t] + 0.5)); s += idf * (f * (I.bm25.k1 + 1) / (f + I.bm25.k1 * (1 - I.bm25.b + I.bm25.b * tf[i].len / avg))); }); return s; };
    let ok = 0, judged = 0; const bad = [];
    qs.forEach((qq) => {
      const top = h.query(qq)[0]; if (!top) return; if (!(top.score > 0)) { zero++; return; }
      judged++; const a = top.score / I.bm25.scale, b = float(top.id, qq), rel = Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)); if (rel > worst) worst = rel;
      if (rel <= 1e-6) ok++; else if (bad.length < 3) bad.push('"' + qq + '" ' + top.id + ' int=' + a + ' float=' + b);
    });
    X += ok; N += judged;
    k.L('lang=' + lang + ' queries=' + qs.length + ' scored top hits=' + judged + ' within 1e-6=' + ok);
    if (!judged) k.incon('B1 ' + lang, 'no top hit with a score'); else k.chk('B1 ' + lang + ' integer score == float BM25 within 1e-6 relative: ' + ok + ' of ' + judged, ok === judged, bad.length ? 'e.g. ' + bad.join(' ; ') : '');
    Object.keys(df).forEach((t) => { const x = 1 + (Nr - df[t] + 0.5) / (df[t] + 0.5); lnN++; if (Math.abs(HQ.ln(x) - Math.log(x)) > 1e-12 * Math.max(1, Math.abs(Math.log(x)))) lnBad++; });
  });
  k.L('ALL languages: ' + X + ' of ' + N + ' scored top hits agree; worst relative difference ' + worst.toExponential(2) + '; top hits with no score (tier-only) skipped=' + zero);
  if (!lnN) k.incon('B2', 'no idf argument'); else k.chk('B2 own ln() == Math.log (1e-12) on every idf argument in use: ' + (lnN - lnBad) + ' of ' + lnN, lnBad === 0);
  k.end();
})();
