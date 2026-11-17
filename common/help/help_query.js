// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — help_query.js: the ONE help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1 D2 D3 D8, §4).
// READ THE LOG of W-HQ-GENERIC / W-HQ-SELF / W-HQ-WORDS / W-HQ-BM25 / W-HQ-RANK-TWIN / W-HQ-COST after every change (common/help/tests/logs/). An exit code is not evidence.
// PURE: no require, no process.* reads except the HQ_BREAK falsifier, no fs, no DOM; it runs unchanged in Node and in the page (the shape of common/door/assist_core.js).
// It sees RECORDS only ({id,k,n,a[],d,h,gate}); it holds no table name, no window id and no branch on a kind (the kind order is read from the pack's `kinds`).
//   fold(s)                  NFKD, lower case, delete U+0300-U+036F (accents), NFC again (see the note at fold()).
//   terms(text, pack)        the words of a text: spaced runs split on non-letters; no-space runs (pack.nospace) by the longest pack.vocab word at each position + character pairs for the gaps.
//                            Intl.Segmenter is NEVER called here (it ran once, at build time, to make pack.vocab).
//   create(pack, opts)       -> a handle; the index is made on the first query, never at create() (D8).  pack = a parsed index.json; opts = {text:(i)->string, extra:[records]}
//   handle.query(q, allowed) -> [{id,k,tier,score,rec}]  tiers 0-3, integer BM25 scores, the total tie-break of §4; allowed(gate, rec) is the role gate, applied AFTER ranking
//   legacyFilter(names, typed) = MenuSearchController.java:586-607 + :187-190 exactly (labels only, startsWith under 3 characters else contains, accents deleted, sorted by label).
// BM25 (k1, b from the pack header) is computed ONCE when the index is made, by + - * / only (own ln(), no Math.log), as an INTEGER weight per (term, record); a query only ADDS integers.
// Falsifiers (HQ_BREAK=): noname (tier 0-2 never match a name) · nolegacytier (tiers 1 and 2 off, W-HQ-LEGACY-SUPERSET) · nodict (the vocab ignored: pairs only) · k1 (k1 changed) · revtie (the last tie-break key reversed) · eager (index made in create()).
(function (root) {
  'use strict';
  function brk() { return (typeof process !== 'undefined' && process.env && process.env.HQ_BREAK) || (root && root.__HQ_BREAK) || ''; }
  var MARKS = /[̀-ͯ]/g;
  var builds = 0;   // how many indexes were made in this environment (W-HQ-COST: 0 until the first query)
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // fold: the design says NFKC, lower case, delete U+0300-U+036F. NFKC would leave a precomposed 'é' whole (no combining mark to delete), so accents would NOT be deleted as legacy's
  // Util.deleteAccents does (it is NFD then \p{InCombiningDiacriticalMarks} = U+0300-U+036F). Same range, applied on the decomposed form: NFKD, lower, delete the range, NFC to recompose (kana, Hangul).
  function fold(s) { return String(s == null ? '' : s).normalize('NFKD').toLowerCase().replace(MARKS, '').normalize('NFC'); }
  function tidy(s) { return fold(s).replace(/\s+/g, ' ').replace(/^ | $/g, ''); }   // folded, spaces collapsed: the form every name and query is compared in
  function deleteAccents(s) { return String(s).normalize('NFD').replace(MARKS, ''); }   // Util.java:272-277, no recomposition (legacy's own)
  function lt(a, b) { return a < b ? -1 : a > b ? 1 : 0; }   // UTF-16 code units, never localeCompare (also legacy's String.compareTo)

  // ln(x), x > 0, by + - * / only: halve/double to [1,2), then 2*atanh((x-1)/(x+1)) as a fixed 30-term series. Identical in every IEEE-754 engine.
  var LN2 = 0.6931471805599453;
  function ln(x) {
    var e = 0, z, z2, t, s = 0, k;
    while (x >= 2) { x = x / 2; e++; }
    while (x < 1) { x = x * 2; e--; }
    z = (x - 1) / (x + 1); z2 = z * z; t = z;
    for (k = 0; k < 30; k++) { s = s + t / (2 * k + 1); t = t * z2; }
    return 2 * s + e * LN2;
  }

  // ---- words (D2) ----
  // ctx = {ns: RegExp of ONE no-space character, vocab: Set, maxV: longest vocab word in characters}
  function context(pack) {
    var v = (brk() === 'nodict') ? [] : (pack.vocab || []), set = {}, maxV = 0;
    v.forEach(function (w) { set[w] = 1; var l = Array.from(w).length; if (l > maxV) maxV = l; });
    return { ns: new RegExp('[' + (pack.nospace || '') + ']', 'u'), word: /[\p{L}\p{N}_]/u, set: set, maxV: maxV };
  }
  var PAIR = '\u0001';   // a character-pair term is prefixed so it never meets a vocab word of the same two letters
  function nospaceRun(chars, c, out) {
    var i = 0, n = chars.length, gap = [], L, w;
    function flushGap() { for (var j = 0; j + 1 < gap.length; j++) out.push(PAIR + gap[j] + gap[j + 1]); gap = []; }
    while (i < n) {
      w = '';
      for (L = Math.min(c.maxV, n - i); L >= 2; L--) { var cand = chars.slice(i, i + L).join(''); if (c.set[cand] === 1) { w = cand; break; } }
      if (w) { flushGap(); out.push(w); i += L; } else { gap.push(chars[i]); i++; }
    }
    flushGap();
  }
  function termsOf(text, c) {
    var chars = Array.from(fold(text)), out = [], run = [], kind = 0, i, ch, k;
    function flush() { if (run.length) { if (kind === 1) out.push(run.join('')); else nospaceRun(run, c, out); } run = []; kind = 0; }
    for (i = 0; i < chars.length; i++) {
      ch = chars[i]; k = c.ns.test(ch) ? 2 : c.word.test(ch) ? 1 : 0;
      if (k !== kind) flush();
      kind = k; if (k) run.push(ch);
    }
    flush();
    return out;
  }

  // ---- the index (D3) ----
  function makeIndex(pack, opts) {
    var t0 = now(), c = context(pack), W = pack.weights || { n: 3, a: 3, d: 2, h: 1, pair: 1 }, B = pack.bm25 || { k1: 1.2, b: 0.75, scale: 1000000000 };
    var k1 = (brk() === 'k1') ? 2.0 : B.k1, b = B.b, scale = B.scale;
    var recs = (pack.records || []).concat((opts && opts.extra) || []), N = recs.length, text = (opts && opts.text) || function () { return ''; };
    var kinds = pack.kinds || [], kindOrder = {}; kinds.forEach(function (k, i) { kindOrder[k] = i; });
    var lens = [], lists = {}, names = [], dnames = [], fnames = [], total = 0, i, r;
    function str(v) { return typeof v === 'number' ? text(v) : (v == null ? '' : String(v)); }
    for (i = 0; i < N; i++) {
      r = recs[i]; var cnt = {}, ln_ = 0;
      var fields = [['n', r.n]].concat((r.a || []).map(function (x) { return ['a', x]; }), [['d', r.d], ['h', r.h]]);
      fields.forEach(function (f) {
        termsOf(str(f[1]), c).forEach(function (t) { var w = (t.charAt(0) === PAIR) ? W.pair : W[f[0]]; cnt[t] = (cnt[t] || 0) + w; ln_ += w; });
      });
      lens.push(ln_); total += ln_;
      Object.keys(cnt).forEach(function (t) { var l = lists[t] || (lists[t] = { r: [], f: [] }); l.r.push(i); l.f.push(cnt[t]); });
      var nl = [tidy(r.n == null ? '' : r.n)].concat((r.a || []).map(tidy)); names.push(nl); dnames.push(nl.map(deleteAccents)); fnames.push(nl[0]);
    }
    var avg = N ? total / N : 0, post = {}, np = 0;
    Object.keys(lists).forEach(function (t) {
      var l = lists[t], dft = l.r.length, idf = ln(1 + (N - dft + 0.5) / (dft + 0.5)), ws = new Float64Array(dft);
      for (var j = 0; j < dft; j++) { var wtf = l.f[j]; ws[j] = Math.round(scale * idf * (wtf * (k1 + 1) / (wtf + k1 * (1 - b + b * lens[l.r[j]] / avg)))); }
      post[t] = { r: Int32Array.from(l.r), w: ws }; np += dft;
    });
    builds++;
    return { recs: recs, N: N, names: names, dnames: dnames, fnames: fnames, kindOrder: kindOrder, kindsN: kinds.length, post: post, ctx: c, stats: { records: N, terms: Object.keys(post).length, postings: np, ms: now() - t0 } };
  }
  // tier 0 compares the folded names; tiers 1 and 2 are legacy's menu filter, so they compare the way legacy compares: the accent-deleted (NFD) text, startsWith under 3 units, else contains
  // (MenuSearchController.java:593-607). That is why a typed "ケーシ" is inside "ケーシ" + dakuten of "パッケージ": legacy shows it, and the twin must too.
  function tierOf(q, nl, qd, dl, br, long) {
    if (br === 'noname') return 3;
    var best = 3, j, f;
    for (j = 0; j < nl.length; j++) {
      if (nl[j] === q) return 0;
      if (br === 'nolegacytier') continue;   // falsifier: tiers 1 and 2 (legacy's menu filter) off
      f = dl[j];
      if (f.indexOf(qd) === 0) best = Math.min(best, 1);
      else if (long && f.indexOf(qd) >= 0) best = Math.min(best, 2);
    }
    return best;
  }
  function run(ix, q, allowed) {
    var fq = tidy(q); if (!fq) return [];
    var sc = new Float64Array(ix.N), seen = {}, i, hits = [], br = brk(), qd = deleteAccents(fq), long = qd.length >= 3;   // 'contains' from 3 characters, counted as legacy counts them: Java String.length() of the accent-deleted (NFD) text, so a kana with a dakuten is 2 (MenuSearchController.java:593-607)
    termsOf(q, ix.ctx).forEach(function (t) {
      if (seen[t]) return; seen[t] = 1;
      var p = ix.post[t]; if (p) for (var k = 0; k < p.r.length; k++) sc[p.r[k]] += p.w[k];
    });
    for (i = 0; i < ix.N; i++) { var tr = tierOf(fq, ix.names[i], qd, ix.dnames[i], br, long); if (tr < 3 || sc[i] > 0) hits.push({ i: i, tier: tr, score: sc[i] }); }
    var rev = br === 'revtie';
    hits.sort(function (x, y) {
      if (x.tier !== y.tier) return x.tier - y.tier;
      if (x.score !== y.score) return y.score - x.score;
      var rx = ix.recs[x.i], ry = ix.recs[y.i], kx = ix.kindOrder[rx.k], ky = ix.kindOrder[ry.k];
      if (kx === undefined) kx = ix.kindsN; if (ky === undefined) ky = ix.kindsN;
      if (kx !== ky) return kx - ky;
      var nx = ix.fnames[x.i], ny = ix.fnames[y.i];
      if (nx !== ny) return lt(nx, ny);
      return rev ? lt(ry.id, rx.id) : lt(rx.id, ry.id);
    });
    var out = [];
    hits.forEach(function (h) { var rc = ix.recs[h.i]; if (!allowed || rc.gate === undefined || allowed(rc.gate, rc)) out.push({ id: rc.id, k: rc.k, tier: h.tier, score: h.score, rec: rc }); });
    return out;
  }
  // create(pack, opts): nothing is built here (D8: never at page load); the first query() makes the index once.
  function create(pack, opts) {
    var ix = null, h = {
      query: function (q, allowed) { if (!ix) ix = makeIndex(pack, opts); return run(ix, q, allowed); },
      terms: function (text) { if (!ix) ix = makeIndex(pack, opts); return termsOf(text, ix.ctx); },
      get built() { return !!ix; },
      get stats() { if (!ix) ix = makeIndex(pack, opts); return ix.stats; },
      get index() { if (!ix) ix = makeIndex(pack, opts); return ix; }
    };
    if (brk() === 'eager') ix = makeIndex(pack, opts);
    return h;
  }
  // legacy's menu filter, exactly (MenuSearchController.java:593 constructor, :586-607 compare, :187-190 sort): labels only
  function legacyFilter(names, typed) {
    var cmp = deleteAccents(String(typed == null ? '' : typed).toLowerCase().trim());
    var hit = names.filter(function (nm) { var l = deleteAccents(String(nm).toLowerCase()); return cmp.length < 3 ? l.indexOf(cmp) === 0 : l.indexOf(cmp) >= 0; });
    return hit.sort(lt);
  }
  var api = { create: create, fold: fold, tidy: tidy, ln: ln, legacyFilter: legacyFilter, deleteAccents: deleteAccents, termsOf: function (text, pack) { return termsOf(text, context(pack)); }, builds: function () { return builds; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpQuery = api;
})(typeof window !== 'undefined' ? window : globalThis);
