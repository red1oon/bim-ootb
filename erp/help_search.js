// erp/help_search.js — the help question box: a plain question -> an answer card, deterministic, no AI inside.
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10 H2 + §12 H2b + §19.3 Step 3. Witnesses: W-HELP-SHOWCASE S3, S6 (erp/tests/witness_help_showcase.js), W-HQ-BOX, W-HQ-LEGACY-SUPERSET (common/help/tests/).
// READ THE LOG after every change; an exit code is not evidence.
// §19.3: RANKING IS NOT HERE. The records (erp/help_records_core.js) go to the one query core (common/help/help_query.js, HelpQuery); this file keeps the CARD: what a plain question means.
// Every part of the card is EXTRACTED: the window from the dictionary's window and table names (the screen language's and English; they are the window record's names), the action from AD_Ref_List 135 (its names in both),
// a status name (AD_Ref_List 131) finds the action that reaches it (AdDocFsm.TRANSITION, passed in as `reach`), when it is allowed from the FSM, the CLI line from common/door/verbs.json, the how-to + guide link.
//   1 parse: lowercase, words. A question with CJK text is read as characters (no spaces between words): phrases are matched as substrings.
//   2 phrase match, longest first: window names, table Names -> the table's own window (AD_Table.AD_Window_ID); DocAction names; DocStatus names -> the action reaching that status.
//     Several window phrases: the last one wins (the English head noun; the Chinese one too: 客户付款 is a payment). A one-word action shared by two actions names both.
//     No exact window phrase: the best-ranked window of the core's list (HelpQuery: tiers, then BM25), the role's windows only; in one tier a window with a how-to row first.
//   §19.5 card.dym = up to 3 names (HelpDym over the role's record names) when the top ranked hit is not tier 0; the box shows them as one separate line, a pick searches, nothing runs.
//   3 the how-to: the matched window's own row first, else the core's best-ranked how-to row. card.hits = the core's top 5 (after the role gate) = what W-HQ-BOX compares to HelpQuery directly.
// Falsifiers: HS_BREAK=nophrase (no dictionary phrase matching -> S3 FAILs) · nocjk (CJK read as words, not characters -> S6 FAILs) · revhits (card.hits reversed in this environment -> W-HQ-BOX FAILs).
(function (root) {
  'use strict';
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.HS_BREAK) || (root && root.__HS_BREAK) || '';
  var CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
  function words(s) { return String(s == null ? '' : s).toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().split(' ').filter(Boolean); }
  function flat(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ''); }   // the CJK reading: letters and digits only, no spaces
  // makeIndex({windows:[{id,name,alt[]}], actions:{CODE:{name,alt[],description,allowedFrom,verb,inputs,offeredFor}}, statuses:{CODE:[names]}, reach:{STATUS:[ACTIONS]}, howto:[rows], kindOf(windowId), search(question)->ranked hits [{id,k,tier,score,rec}]})
  function makeIndex(o) {
    var phrases = [];   // {ws:[words], str:'flat', kind:'window'|'action', ref}
    var add = function (text, kind, ref) { var ws = words(text); if (ws.length) phrases.push({ ws: ws, str: flat(text), kind: kind, ref: ref }); };
    (o.windows || []).forEach(function (w) { add(w.name, 'window', w); });   // a window's own name before any other name (a table's name that equals another window's name does not outrank that window)
    (o.windows || []).forEach(function (w) { (w.alt || []).forEach(function (a) { add(a, 'window', w); }); });   // alt = the English name + the window's own table names
    var acts = o.actions || {};
    Object.keys(acts).forEach(function (code) {
      var a = acts[code], ref = { code: code, a: a };
      [a.name].concat(a.alt || []).forEach(function (n) {
        add(n, 'action', ref); var w1 = words(n); if (w1.length > 1) phrases.push({ ws: [w1[0]], str: flat(w1[0]), kind: 'action', ref: ref });
        var j = n.replace(/-/g, ''); if (j !== n) add(j, 'action', ref);   // 'Re-activate' is also typed 'reactivate' (the hyphen dropped, no synonym)
      });
    });
    // a status name finds the action that reaches it (Closed <- Close, Voided <- Void): the FSM's own relation, not a synonym list
    Object.keys(o.statuses || {}).forEach(function (st) { var to = (o.reach || {})[st] || []; if (!to.length || !acts[to[0]]) return;
      (o.statuses[st] || []).forEach(function (n) { add(n, 'action', { code: to[0], a: acts[to[0]], viaStatus: n, more: to.slice(1) }); }); });
    phrases.sort(function (x, y) { return y.str.length - x.str.length || y.ws.length - x.ws.length; });
    var howto = o.howto || [], hasHowto = {}, howById = {}; howto.forEach(function (r) { hasHowto[r.ad_window_id] = r; howById['howto/' + r.id] = r; });
    var altsOf = function (code, len, str) { return phrases.filter(function (x) { return x.kind === 'action' && x.str === str && x.ref.code !== code; }).map(function (x) { return { code: x.ref.code, name: x.ref.a.name }; }).filter(function (v, i, arr) { return arr.findIndex(function (y) { return y.code === v.code; }) === i; }); };
    function hit(ph, matched, st) {
      if (ph.kind === 'window') { st.win = ph.ref; matched.push('window:' + ph.str); }   // the LAST window phrase wins
      else if (!st.act) { st.act = ph.ref; st.act.alt = altsOf(ph.ref.code, 0, ph.str).concat((ph.ref.more || []).map(function (c) { return { code: c, name: acts[c] ? acts[c].name : c }; })); matched.push('action:' + ph.str + (ph.ref.viaStatus ? ' (status ' + ph.ref.viaStatus + ')' : '')); }
    }
    function ask(question) {
      var ws = words(question), st = { win: null, act: null }, matched = [], cjk = CJK.test(question) && BREAK !== 'nocjk';
      if (BREAK !== 'nophrase') {
        if (cjk) {   // characters: at each position the longest phrase whose flat text starts there
          var q = flat(question);
          for (var i = 0; i < q.length;) { var h = null; for (var p = 0; p < phrases.length && !h; p++) if (phrases[p].str && q.substr(i, phrases[p].str.length) === phrases[p].str) h = phrases[p]; if (h) { hit(h, matched, st); i += h.str.length; } else i++; }
        } else {
          for (var i2 = 0; i2 < ws.length;) { var h2 = null; for (var p2 = 0; p2 < phrases.length && !h2; p2++) { var ph = phrases[p2]; if (ph.ws.length <= ws.length - i2 && ph.ws.every(function (w, j) { return ws[i2 + j] === w; })) h2 = ph; } if (h2) { hit(h2, matched, st); i2 += h2.ws.length; } else i2++; }
        }
      }
      var hits = o.search ? o.search(question) : [];   // THE ranking: the one query core (tiers, then BM25, a total order), after the role gate
      if (BREAK !== 'nophrase' && !st.win) {   // no exact window phrase: the best-ranked window of the list; inside one tier a window that has a how-to row comes first (the help covers it), then the core's own order
        var bw = null; hits.forEach(function (x) { if (x.k !== 'window') return; if (!bw || (x.tier === bw.tier && hasHowto[x.rec.gate[1]] && !hasHowto[bw.rec.gate[1]])) bw = x; });
        if (bw) { st.win = { id: bw.rec.gate[1], name: bw.rec.n }; matched.push('window~' + flat(bw.rec.n) + ' (tier ' + bw.tier + ' score ' + bw.score + ')'); }
      }
      var win = st.win, act = st.act, own = null, top = null;
      if (win) howto.forEach(function (r) { if (!own && r.ad_window_id === win.id) own = r; });   // the matched window's own row first (a lookup, not a score)
      hits.forEach(function (x) { if (!top && x.k === 'howto' && howById[x.id]) top = howById[x.id]; });
      var shown = hits.slice(0, 5).map(function (x) { return { id: x.id, k: x.k, tier: x.tier, score: x.score }; }); if (BREAK === 'revhits') shown.reverse();
      var card = { question: String(question), words: ws, cjk: cjk, matched: matched, window: win ? { id: win.id, name: win.name } : null, action: null, cli: null, guide: null, howto: own || top, hits: shown, dym: o.dym ? o.dym(String(question), hits) : [] };   // §19.5 the "Did you mean" names (common/help/help_dym.js): [] when the top result is tier 0
      if (act) {
        var a = act.a, kind = win && o.kindOf ? o.kindOf(win.id) : null;
        card.action = { code: act.code, name: a.name, description: a.description, allowedFrom: a.allowedFrom || [], alternatives: act.alt || [] };   // 'reverse' = Reverse - Accrual AND Reverse - Correct: both named
        if (a.verb) {
          var offered = kind && a.offeredFor && a.offeredFor.indexOf('(' + kind.table + ')') >= 0;
          card.cli = offered ? { line: a.verb + ' kind=' + kind.name + (a.inputs.indexOf('number') >= 0 ? ' number=<Document No>' : ' id=<id>'), verb: a.verb }
            : { line: null, verb: a.verb, offeredFor: a.offeredFor || '', kind: kind ? kind.name : null, note: a.verb + ' is offered for ' + (a.offeredFor || 'no kind') + (kind ? ', not for ' + kind.name : '') };
        }
      }
      if (card.howto && card.howto.source) card.guide = { url: card.howto.source.url, title: card.howto.name };
      return card;
    }
    return { ask: ask, size: { phrases: phrases.length, howto: howto.length } };
  }
  // dep(global name, relative path): the same file in Node (require) and in the page (window.<name>, loaded by <script> before this one)
  function dep(name, rel) { return (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require(rel) : (root && root[name]); }
  // the pack header of the language's index.json (bm25, weights, nospace, vocab): given by the page (ErpI18n.loadHelpIndex), read from disk in Node; {} when absent (no-space scripts then split into pairs only, the name tiers still work)
  function headerOf(c, lang) {
    if (c.hq) return c.hq;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') { try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'i18n', 'help', lang, 'index.json'), 'utf8')); } catch (e) { /* no file: {} */ } }
    return {};
  }
  // indexFrom({q, en, pack, fsm, windowIds, hq}) — THE one way to build the index from the dictionary (the page, the witness and the CLI's erp.ask all call it):
  //   q(sql) -> rows (any handle); en = the en_US help pack (actions, how-to); pack = the screen language's pack or null (names, how-to); fsm = AdDocFsm (TRANSITION); windowIds = the role's menu windows;
  //   hq = the language's index.json (only its header is read; optional in Node). The RECORDS are made by HelpRecords.build (erp/help_records_core.js, the build tool's function) and ranked by HelpQuery.
  //   Names: the language's first (shown), the English ones also matched. How-to: the language's rows when the pack has them, else the English rows (marked by the caller).
  //   The role gate (windowIds) is applied AFTER ranking (design D3): a record is shown when it is a window of the role's menu or a how-to row of one; other gates (process, doctype) are not admitted by this gate.
  function indexFrom(c) {
    var q = c.q, en = c.en || {}, pk = c.pack || null, nm = (pk && pk.names) || { windows: {}, tables: {}, actions: {}, statuses: {} }, ids = c.windowIds || [], idset = {}, HR = dep('HelpRecords', './help_records_core.js'), HQ = dep('HelpQuery', '../common/help/help_query.js');
    ids.forEach(function (i) { idset[i] = 1; });
    var built = HR.build({ q: q, en: en, pack: pk }), hdr = headerOf(c, (pk && pk.lang) || 'en_US');
    var handle = HQ.create({ kinds: built.kinds, records: built.records, bm25: hdr.bm25, weights: hdr.weights, nospace: hdr.nospace, vocab: hdr.vocab }, { text: built.resolve });   // lazy: the index is made on the first query (D8)
    var allowed = function (gate) { return gate[0] === 'window' && !!idset[gate[1]]; };
    var wins = built.records.filter(function (r) { return r.k === 'window' && allowed(r.gate); }).map(function (r) { return { id: r.gate[1], name: r.n, alt: r.a || [] }; });
    var stEn = {}; q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y'").forEach(function (r) { stEn[r.v] = String(r.n); });
    var stName = function (code) { return nm.statuses[code] || stEn[code] || code; }, enAct = en.actions || {}, acts = {};
    Object.keys(enAct).forEach(function (code) { var a = enAct[code], t = nm.actions[code];
      acts[code] = { name: t || a.name, alt: t ? [a.name] : [], description: a.description, allowedFrom: Object.keys((c.fsm && c.fsm.TRANSITION[code]) || {}).map(stName), verb: a.verb, inputs: a.inputs || [], offeredFor: a.offeredFor }; });
    var reach = {}, T = (c.fsm && c.fsm.TRANSITION) || {}; Object.keys(T).forEach(function (code) { Object.keys(T[code]).forEach(function (from) { var to = T[code][from]; if (to && to !== from) { (reach[to] = reach[to] || []); if (reach[to].indexOf(code) < 0) reach[to].push(code); } }); });
    var statuses = {}; Object.keys(stEn).forEach(function (code) { statuses[code] = [stEn[code]].concat(nm.statuses[code] ? [nm.statuses[code]] : []); });
    var howto = (pk && pk.howto && pk.howto.length) ? pk.howto : (en.howto || []);
    var kindOf = function (wid) { var r = q('SELECT tb.name AS tn, tb.tablename AS tt FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.tablevel=0 AND t.ad_window_id=' + Number(wid) + ' ORDER BY t.seqno LIMIT 1')[0]; return r ? { name: String(r.tn), table: String(r.tt) } : null; };
    var search = function (question) { return handle.query(String(question), allowed); };
    var DYM = dep('HelpDym', '../common/help/help_dym.js'), dymNames = null;   // §19.5: the names of the role's records (the language's + the English `a`), made on the first miss, never at load (D8)
    var dym = function (question, hits) { if (!dymNames) dymNames = DYM.names(built.records, { alt: true, allowed: allowed }); return DYM.suggest(question, dymNames, hits.length ? hits[0].tier : 3); };
    var idx = makeIndex({ windows: wins, actions: acts, statuses: statuses, reach: reach, howto: howto, kindOf: kindOf, search: search, dym: dym });
    idx.search = search; idx.core = handle; idx.records = built.records;   // W-HQ-BOX / W-HQ-COST read these; the card's own list is card.hits
    idx.localHowto = !!(pk && pk.howto && pk.howto.length); idx.counts = { windows: wins.length, records: built.records.length, actions: Object.keys(acts).length, statuses: Object.keys(statuses).length, howto: howto.length };
    return idx;
  }
  var api = { makeIndex: makeIndex, indexFrom: indexFrom, words: words, flat: flat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpSearch = api;
})(typeof window !== 'undefined' ? window : this);
