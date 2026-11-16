// erp/help_search.js — the help question box: a plain question -> an answer card, deterministic, no AI inside.
// ⚠ DO NOT REMOVE — Implementing bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §10 H2. Witness: W-HELP-SHOWCASE S3 (erp/tests/witness_help_showcase.js).
// Every part of the card is EXTRACTED: the window from the dictionary's window and table names, the action from AD_Ref_List 135, when it is
// allowed from AdDocFsm.TRANSITION (in the pack), the CLI line from common/door/verbs.json (in the pack), the how-to + guide link from the pack.
//   1 parse: lowercase, words, stop words dropped ("how do i … ?").
//   2 phrase match, longest first: window names, and table Names -> the table's own window (AD_Table.AD_Window_ID); DocAction names.
//     Several window phrases: the last one wins (the English head noun). A one-word action shared by two actions names both.
//     No exact window phrase -> the window whose name shares the most words (ties: a window with a how-to row, then the shorter name, then the lower id).
//   3 rank the how-to rows by shared words (BM25-like: rarer words weigh more); the matched window's own row first.
// Falsifier: HS_BREAK=nophrase (no dictionary phrase matching) -> no window, no action (S3 FAILs).
(function (root) {
  'use strict';
  var BREAK = (typeof process !== 'undefined' && process.env && process.env.HS_BREAK) || (root && root.__HS_BREAK) || '';
  var STOP = ' a an and are can could do does for how i in is it me my of on or please should the this to we what when where which with would you your ';
  function words(s) { return String(s == null ? '' : s).toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().split(' ').filter(Boolean); }
  function greater(a, b) { for (var j = 0; j < a.length; j++) if (a[j] !== b[j]) return a[j] > b[j]; return false; }   // lexicographic key compare
  function content(ws) { return ws.filter(function (w) { return STOP.indexOf(' ' + w + ' ') < 0; }); }
  // makeIndex({windows:[{id,name}], tables:[{name, windowId}], actions:{CODE:{name,description,allowedFrom,verb,inputs,offeredFor}}, howto:[rows], kindOf(windowId)->{name,table}})
  function makeIndex(o) {
    var phrases = [];   // {ws:[words], kind:'window'|'action', ref}
    (o.windows || []).forEach(function (w) { phrases.push({ ws: words(w.name), kind: 'window', ref: w }); });
    var wById = {}; (o.windows || []).forEach(function (w) { wById[w.id] = w; });
    (o.tables || []).forEach(function (t) { if (wById[t.windowId]) phrases.push({ ws: words(t.name), kind: 'window', ref: wById[t.windowId], via: t.name }); });
    Object.keys(o.actions || {}).forEach(function (code) { var a = o.actions[code]; phrases.push({ ws: words(a.name), kind: 'action', ref: { code: code, a: a } }); phrases.push({ ws: [words(a.name)[0]], kind: 'action', ref: { code: code, a: a } }); var j = words(a.name.replace(/-/g, '')); if (j.join(' ') !== words(a.name).join(' ')) phrases.push({ ws: j, kind: 'action', ref: { code: code, a: a } }); });   // 'Re-activate' is also typed 'reactivate' (the hyphen dropped, no synonym)
    phrases = phrases.filter(function (p) { return p.ws.length; }).sort(function (x, y) { return y.ws.length - x.ws.length; });
    var howto = o.howto || [], df = {}, docs = howto.map(function (r) { var ws = content(words(r.name + ' ' + (r.source && r.source.sentences ? r.source.sentences.join(' ') : r.html))); var seen = {}; ws.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); return ws; });
    var hasHowto = {}; howto.forEach(function (r) { hasHowto[r.ad_window_id] = r; });
    function ask(question) {
      var ws = words(question), cw = content(ws), win = null, act = null, matched = [];
      if (BREAK !== 'nophrase') {
        for (var i = 0; i < ws.length;) {
          var hit = null;
          for (var p = 0; p < phrases.length && !hit; p++) { var ph = phrases[p]; if (ph.ws.length <= ws.length - i && ph.ws.every(function (w, j) { return ws[i + j] === w; })) hit = ph; }
          if (hit) {
            if (hit.kind === 'window') { win = hit.ref; matched.push('window:' + hit.ws.join(' ') + (hit.via ? ' (table ' + hit.via + ')' : '')); }   // the LAST window phrase wins: English puts the head noun last ('customer payment' is a payment)
            else if (hit.kind === 'action' && !act) { act = hit.ref; act.alt = phrases.filter(function (x) { return x.kind === 'action' && x.ws.length === hit.ws.length && x.ws.join(' ') === hit.ws.join(' ') && x.ref.code !== hit.ref.code; }).map(function (x) { return { code: x.ref.code, name: x.ref.a.name }; }); matched.push('action:' + hit.ws.join(' ')); }
            i += hit.ws.length;
          } else i++;
        }
        if (!win && cw.length) {   // no exact window phrase: the window sharing the most content words
          var best = null;
          (o.windows || []).forEach(function (w) {
            var nw = words(w.name), sh = cw.filter(function (x) { return nw.indexOf(x) >= 0; }).length; if (!sh) return;
            var k = [sh, hasHowto[w.id] ? 1 : 0, -nw.length, -w.id];
            if (!best || greater(k, best.k)) best = { w: w, k: k };
          });
          if (best) { win = best.w; matched.push('window~' + words(best.w.name).join(' ') + ' (' + best.k[0] + ' shared)'); }
        }
      }
      // how-to rank: the matched window's own row first, then shared words weighted by rarity
      var N = howto.length, ranked = howto.map(function (r, k) {
        var s = 0; cw.forEach(function (w) { if (docs[k].indexOf(w) >= 0) s += Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); });
        if (win && r.ad_window_id === win.id) s += 100;
        return { r: r, s: s };
      }).filter(function (x) { return x.s > 0; }).sort(function (x, y) { return y.s - x.s || x.r.id - y.r.id; });
      var card = { question: String(question), words: cw, matched: matched, window: win ? { id: win.id, name: win.name } : null, action: null, cli: null, guide: null, howto: ranked.length ? ranked[0].r : null };
      if (act) {
        var a = act.a, kind = win && o.kindOf ? o.kindOf(win.id) : null;
        card.action = { code: act.code, name: a.name, description: a.description, allowedFrom: a.allowedFrom || [], alternatives: act.alt || [] };   // 'reverse' = Reverse - Accrual AND Reverse - Correct: both named
        if (a.verb) {
          var offered = kind && a.offeredFor && a.offeredFor.indexOf('(' + kind.table + ')') >= 0;
          card.cli = offered ? { line: a.verb + ' kind=' + kind.name + (a.inputs.indexOf('number') >= 0 ? ' number=<Document No>' : ' id=<id>'), verb: a.verb }
            : { line: null, verb: a.verb, note: a.verb + ' is offered for ' + (a.offeredFor || 'no kind') + (kind ? ', not for ' + kind.name : '') };
        }
      }
      if (card.howto && card.howto.source) card.guide = { url: card.howto.source.url, title: card.howto.name };
      return card;
    }
    return { ask: ask, size: { phrases: phrases.length, howto: howto.length } };
  }
  var api = { makeIndex: makeIndex, words: words };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpSearch = api;
})(typeof window !== 'undefined' ? window : this);
