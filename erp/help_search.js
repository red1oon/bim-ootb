// erp/help_search.js — the help question box: a plain question -> an answer card, deterministic, no AI inside.
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10 H2 + §12 H2b. Witness: W-HELP-SHOWCASE S3, S6 (erp/tests/witness_help_showcase.js).
// Every part of the card is EXTRACTED: the window from the dictionary's window and table names (the screen language's and English), the action from AD_Ref_List 135 (its names in both),
// a status name (AD_Ref_List 131) finds the action that reaches it (AdDocFsm.TRANSITION, passed in as `reach`), when it is allowed from the FSM, the CLI line from common/door/verbs.json, the how-to + guide link.
//   1 parse: lowercase, words, stop words dropped ("how do i … ?"). A question with CJK text is read as characters (no spaces between words): phrases are matched as substrings.
//   2 phrase match, longest first: window names, table Names -> the table's own window (AD_Table.AD_Window_ID); DocAction names; DocStatus names -> the action reaching that status.
//     Several window phrases: the last one wins (the English head noun; the Chinese one too: 客户付款 is a payment). A one-word action shared by two actions names both.
//     No exact window phrase: the window whose name shares the most words (CJK: the most character pairs) (ties: a window with a how-to row, then the shorter name, then the lower id).
//   3 rank the how-to rows by shared words (BM25-like); the matched window's own row first.
// Falsifiers: HS_BREAK=nophrase (no dictionary phrase matching -> S3 FAILs) · nocjk (CJK read as words, not characters -> S6 FAILs).
(function (root) {
  'use strict';
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.HS_BREAK) || (root && root.__HS_BREAK) || '';
  var STOP = ' a an and are can could do does for how i in is it me my of on or please should the this to we what when where which with would you your ';
  var CJK = /[぀-ヿ㐀-鿿豈-﫿]/;
  function words(s) { return String(s == null ? '' : s).toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().split(' ').filter(Boolean); }
  function content(ws) { return ws.filter(function (w) { return STOP.indexOf(' ' + w + ' ') < 0; }); }
  function flat(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ''); }   // the CJK reading: letters and digits only, no spaces
  function pairs(s) { var f = flat(s).replace(/[a-z0-9_]+/g, ''), o = []; for (var i = 0; i + 1 < f.length; i++) o.push(f.slice(i, i + 2)); return o; }
  function greater(a, b) { for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] > b[j]; return false; }   // lexicographic key compare
  // makeIndex({windows:[{id,name,alt[]}], tables:[{name, windowId}], actions:{CODE:{name,alt[],description,allowedFrom,verb,inputs,offeredFor}}, statuses:{CODE:[names]}, reach:{STATUS:[ACTIONS]}, howto:[rows], kindOf(windowId)})
  function makeIndex(o) {
    var phrases = [];   // {ws:[words], str:'flat', kind:'window'|'action', ref}
    var add = function (text, kind, ref, via) { var ws = words(text); if (ws.length) phrases.push({ ws: ws, str: flat(text), kind: kind, ref: ref, via: via }); };
    var wById = {}; (o.windows || []).forEach(function (w) { wById[w.id] = w; add(w.name, 'window', w); (w.alt || []).forEach(function (a) { add(a, 'window', w); }); });
    (o.tables || []).forEach(function (t) { if (wById[t.windowId]) add(t.name, 'window', wById[t.windowId], t.name); });
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
    var howto = o.howto || [], df = {}, docs = howto.map(function (r) { var ws = content(words(r.name + ' ' + (r.source && r.source.translation ? r.source.translation.join(' ') : r.source && r.source.sentences ? r.source.sentences.join(' ') : r.html))); var seen = {}; ws.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); return ws; });
    var hasHowto = {}; howto.forEach(function (r) { hasHowto[r.ad_window_id] = r; });
    var altsOf = function (code, len, str) { return phrases.filter(function (x) { return x.kind === 'action' && x.str === str && x.ref.code !== code; }).map(function (x) { return { code: x.ref.code, name: x.ref.a.name }; }).filter(function (v, i, arr) { return arr.findIndex(function (y) { return y.code === v.code; }) === i; }); };
    function hit(ph, matched, st) {
      if (ph.kind === 'window') { st.win = ph.ref; matched.push('window:' + ph.str + (ph.via ? ' (table ' + ph.via + ')' : '')); }   // the LAST window phrase wins
      else if (!st.act) { st.act = ph.ref; st.act.alt = altsOf(ph.ref.code, 0, ph.str).concat((ph.ref.more || []).map(function (c) { return { code: c, name: acts[c] ? acts[c].name : c }; })); matched.push('action:' + ph.str + (ph.ref.viaStatus ? ' (status ' + ph.ref.viaStatus + ')' : '')); }
    }
    function ask(question) {
      var ws = words(question), cw = content(ws), st = { win: null, act: null }, matched = [], cjk = CJK.test(question) && BREAK !== 'nocjk';
      if (BREAK !== 'nophrase') {
        if (cjk) {   // characters: at each position the longest phrase whose flat text starts there
          var q = flat(question);
          for (var i = 0; i < q.length;) { var h = null; for (var p = 0; p < phrases.length && !h; p++) if (phrases[p].str && q.substr(i, phrases[p].str.length) === phrases[p].str) h = phrases[p]; if (h) { hit(h, matched, st); i += h.str.length; } else i++; }
        } else {
          for (var i2 = 0; i2 < ws.length;) { var h2 = null; for (var p2 = 0; p2 < phrases.length && !h2; p2++) { var ph = phrases[p2]; if (ph.ws.length <= ws.length - i2 && ph.ws.every(function (w, j) { return ws[i2 + j] === w; })) h2 = ph; } if (h2) { hit(h2, matched, st); i2 += h2.ws.length; } else i2++; }
        }
        if (!st.win && cw.length) {   // no exact window phrase: the window sharing the most words (CJK: character pairs)
          var best = null, qp = cjk ? pairs(question) : null;
          (o.windows || []).forEach(function (w) {
            var names = [w.name].concat(w.alt || []), sh = 0, len = 99;
            names.forEach(function (n) { var s2 = cjk ? pairs(n).filter(function (x, k, arr) { return arr.indexOf(x) === k && qp.indexOf(x) >= 0; }).length : cw.filter(function (x) { return words(n).indexOf(x) >= 0; }).length; if (s2 > sh) { sh = s2; len = (cjk ? flat(n).length : words(n).length); } });
            if (!sh) return; var k = [sh, hasHowto[w.id] ? 1 : 0, -len, -w.id];
            if (!best || greater(k, best.k)) best = { w: w, k: k };
          });
          if (best) { st.win = best.w; matched.push('window~' + flat(best.w.name) + ' (' + best.k[0] + (cjk ? ' pairs' : ' shared') + ')'); }
        }
      }
      var win = st.win, act = st.act, qwords = cjk ? pairs(question) : cw;
      var N = howto.length, ranked = howto.map(function (r, k) {
        var s = 0; qwords.forEach(function (w) { if (docs[k].indexOf(w) >= 0) s += Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); });
        if (win && r.ad_window_id === win.id) s += 100;
        return { r: r, s: s };
      }).filter(function (x) { return x.s > 0; }).sort(function (x, y) { return y.s - x.s || x.r.id - y.r.id; });
      var card = { question: String(question), words: cw, cjk: cjk, matched: matched, window: win ? { id: win.id, name: win.name } : null, action: null, cli: null, guide: null, howto: ranked.length ? ranked[0].r : null };
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
  // indexFrom({q, en, pack, fsm, windowIds}) — THE one way to build the index from the dictionary (the page, the witness and the CLI's erp.ask all call it):
  //   q(sql) -> rows (any handle); en = the en_US help pack (actions, how-to); pack = the screen language's pack or null (names, how-to); fsm = AdDocFsm (TRANSITION); windowIds = the role's menu windows.
  //   Names: the language's first (shown), the English ones also matched. How-to: the language's rows when the pack has them, else the English rows (marked by the caller).
  function indexFrom(c) {
    var q = c.q, en = c.en || {}, pk = c.pack || null, nm = (pk && pk.names) || { windows: {}, tables: {}, actions: {}, statuses: {} }, ids = c.windowIds || [], idset = {};
    ids.forEach(function (i) { idset[i] = 1; });
    var wins = ids.length ? q('SELECT ad_window_id AS wid, name AS wnm FROM ad_window WHERE ad_window_id IN (' + ids.join(',') + ')').map(function (r) { var id = Number(r.wid), t = nm.windows[String(id)]; return { id: id, name: t || String(r.wnm), alt: t ? [String(r.wnm)] : [] }; }) : [];
    var tabs = [];
    q("SELECT ad_table_id AS tid, name AS tn, ad_window_id AS tw FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL AND accesslevel<>'4'").forEach(function (t) {
      if (!idset[Number(t.tw)]) return; tabs.push({ name: String(t.tn), windowId: Number(t.tw) }); var tt = nm.tables[String(t.tid)]; if (tt) tabs.push({ name: tt, windowId: Number(t.tw) }); });
    var stEn = {}; q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y'").forEach(function (r) { stEn[r.v] = String(r.n); });
    var stName = function (code) { return nm.statuses[code] || stEn[code] || code; }, enAct = en.actions || {}, acts = {};
    Object.keys(enAct).forEach(function (code) { var a = enAct[code], t = nm.actions[code];
      acts[code] = { name: t || a.name, alt: t ? [a.name] : [], description: a.description, allowedFrom: Object.keys((c.fsm && c.fsm.TRANSITION[code]) || {}).map(stName), verb: a.verb, inputs: a.inputs || [], offeredFor: a.offeredFor }; });
    var reach = {}, T = (c.fsm && c.fsm.TRANSITION) || {}; Object.keys(T).forEach(function (code) { Object.keys(T[code]).forEach(function (from) { var to = T[code][from]; if (to && to !== from) { (reach[to] = reach[to] || []); if (reach[to].indexOf(code) < 0) reach[to].push(code); } }); });
    var statuses = {}; Object.keys(stEn).forEach(function (code) { statuses[code] = [stEn[code]].concat(nm.statuses[code] ? [nm.statuses[code]] : []); });
    var howto = (pk && pk.howto && pk.howto.length) ? pk.howto : (en.howto || []);
    var kindOf = function (wid) { var r = q('SELECT tb.name AS tn, tb.tablename AS tt FROM ad_tab t JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.tablevel=0 AND t.ad_window_id=' + Number(wid) + ' ORDER BY t.seqno LIMIT 1')[0]; return r ? { name: String(r.tn), table: String(r.tt) } : null; };
    var idx = makeIndex({ windows: wins, tables: tabs, actions: acts, statuses: statuses, reach: reach, howto: howto, kindOf: kindOf });
    idx.localHowto = !!(pk && pk.howto && pk.howto.length); idx.counts = { windows: wins.length, tables: tabs.length, actions: Object.keys(acts).length, statuses: Object.keys(statuses).length, howto: howto.length };
    return idx;
  }
  var api = { makeIndex: makeIndex, indexFrom: indexFrom, words: words, flat: flat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpSearch = api;
})(typeof window !== 'undefined' ? window : this);
