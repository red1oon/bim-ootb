// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-CTXHELP-OVERLAY K8 (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.16 C4): THE ONE READER of the context help (legacy's AD_CtxHelp / AD_CtxHelpMsg /
//   AD_CtxHelpMsg_Trl, filled by ad_ctxhelp_overlay.js). Every caller — the page's help box + How To panel (help_search.indexFrom), the CLI's erp.ask, the build tools and the
//   witnesses — reads the how-to through here, over any q(sql) -> rows handle. No second copy in help.json (deleted in C4).
//   msg()   = MCtxHelpMsg.get (MCtxHelpMsg.java:62-108) + getCtxHelpID (:110-205) + PO.get_Translation(MsgText): the help linked from the record (AD_Tab / AD_Process / AD_Form /
//             AD_InfoWindow / AD_Workflow / AD_Task / AD_WF_Node .AD_CtxHelp_ID, no CtxType filter), the tenant's / org's message first, then its _Trl row in the language.
//   howto() = every active help linked from a tab or a process, in the shape the help index reads: the title is MsgText's first paragraph <p><strong>..</strong></p>
//             (§19.16 C3), the rest is the html. PER ROW the language's translation when it has one, else the English row marked `english: true` (owner 2026-11-19:
//             translations are frozen while the content grows, so a pack is partly translated by design).
(function (root) {
  'use strict';
  var TYPES = { T: ['AD_Tab', 'AD_Tab_ID'], P: ['AD_Process', 'AD_Process_ID'], F: ['AD_Form', 'AD_Form_ID'], I: ['AD_InfoWindow', 'AD_InfoWindow_ID'], W: ['AD_Workflow', 'AD_Workflow_ID'], K: ['AD_Task', 'AD_Task_ID'], N: ['AD_WF_Node', 'AD_WF_Node_ID'] };
  var MACHINE = 'build session, not reviewed by a native speaker';
  var num = function (v) { var n = Number(v); return isFinite(n) ? n : 0; }, str = function (s) { return "'" + String(s).replace(/'/g, "''") + "'"; };
  function has(q) { try { return q("SELECT count(*) AS n FROM ad_ctxhelp").length > 0; } catch (e) { return false; } }
  function ent(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
  function plainParas(html) { return (String(html || '').match(/<(p|ul|ol)>[\s\S]*?<\/\1>/g) || []).map(function (b) { return ent(b.replace(/<\/li>|<ul>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(); }); }
  // the guide page the help's Description URL names, as its docs file (the mkdocs site serves docs/<Page>.md at .../<Page>/): the link text the How To panel shows
  function guideOf(url) { var m = /\/([A-Za-z0-9_]+)\/(?:#.*)?$/.exec(String(url || '')); return m ? 'docs/' + m[1] + '.md' : null; }
  function split(text) { var m = /^<p><strong>([\s\S]*?)<\/strong><\/p>([\s\S]*)$/.exec(String(text || '')); return m ? { title: ent(m[1].replace(/<[^>]+>/g, '')), html: m[2] } : { title: null, html: String(text || '') }; }
  // the message of one help (MCtxHelpMsg.get's query: client / org order) and its translation (get_Translation: the _Trl row of the language when present)
  function msgOf(q, hid, o) {
    var c = num(o && o.client), g = num(o && o.org), lang = (o && o.lang) || 'en_US';
    var m = q("SELECT ad_ctxhelpmsg_id AS id, msgtext AS t FROM ad_ctxhelpmsg WHERE isactive='Y' AND ad_client_id IN (0, " + c + ") AND ad_org_id IN (0, " + g + ") AND ad_ctxhelp_id=" + num(hid) + ' ORDER BY ad_client_id DESC, ad_org_id DESC, ad_ctxhelpmsg_id DESC')[0];
    if (!m) return null;
    var out = { ctxhelpId: num(hid), msgId: num(m.id), text: String(m.t), base: String(m.t), lang: 'en_US', istranslated: null };
    if (lang !== 'en_US') { var t = q("SELECT msgtext AS t, istranslated AS it FROM ad_ctxhelpmsg_trl WHERE isactive='Y' AND ad_ctxhelpmsg_id=" + num(m.id) + ' AND ad_language=' + str(lang))[0]; if (t && t.t != null) { out.text = String(t.t); out.lang = lang; out.istranslated = String(t.it); } }
    return out;
  }
  // MCtxHelpMsg.get(ctxType, recordId) in the login's client / org / language; Home (H) is the help with CtxType H
  function msg(q, ctxType, recordId, o) {
    var c = num(o && o.client), g = num(o && o.org), hid;
    if (ctxType === 'H') hid = (q("SELECT ad_ctxhelp_id AS h FROM ad_ctxhelp WHERE isactive='Y' AND ctxtype='H' AND ad_client_id IN (0, " + c + ") AND ad_org_id IN (0, " + g + ') ORDER BY ad_client_id DESC, ad_org_id DESC, ad_ctxhelp_id DESC')[0] || {}).h;
    else { var T = TYPES[ctxType]; if (!T) return null;
      hid = (q('SELECT t.ad_ctxhelp_id AS h FROM ' + T[0] + " t, ad_ctxhelp h WHERE t.ad_ctxhelp_id=h.ad_ctxhelp_id AND t.isactive='Y' AND h.isactive='Y' AND h.ad_client_id IN (0, " + c + ') AND h.ad_org_id IN (0, ' + g + ') AND t.' + T[1] + '=' + num(recordId) + ' ORDER BY h.ad_client_id DESC, h.ad_org_id DESC, h.ad_ctxhelp_id DESC')[0] || {}).h; }
    return hid != null ? msgOf(q, hid, o) : null;
  }
  // howto(q, lang, o) -> [{ id, ctxtype, ad_window_id, windows, tabs, ad_process_id, processes, name, name_en, window, kind, table, html, translated, english, source: { url, sentences, translation } }]
  //   windows = every window one of whose tabs links the help, header tabs (tablevel 0) first, then in window id order (legacy stores no order between the tabs of one help);
  //   ad_window_id = the first of them. A caller gates and matches on ANY of `windows` / `processes`, never on ad_window_id alone. §19.17 F5: a help may sit on a SUB tab
  //   (Order Line, a partner's Location) and its text may hold several sections, each under its own <p><strong>heading</strong></p>; the first heading is the title.
  function howto(q, lang, o) {
    if (!has(q)) return [];
    var c = num(o && o.client), g = num(o && o.org), L = lang || 'en_US';
    var helps = q("SELECT ad_ctxhelp_id AS id, ctxtype AS ct, name AS n, description AS d FROM ad_ctxhelp WHERE isactive='Y' AND ctxtype IN ('T','P') AND ad_client_id IN (0, " + c + ') AND ad_org_id IN (0, ' + g + ') ORDER BY ad_ctxhelp_id');
    var tabs = q("SELECT t.ad_ctxhelp_id AS h, t.ad_window_id AS w, t.ad_tab_id AS tab, tb.name AS tn, tb.tablename AS tt, w.name AS wn FROM ad_tab t JOIN ad_window w ON w.ad_window_id=t.ad_window_id JOIN ad_table tb ON tb.ad_table_id=t.ad_table_id WHERE t.ad_ctxhelp_id IS NOT NULL AND t.isactive='Y' AND w.isactive='Y' ORDER BY t.tablevel, t.ad_window_id, t.seqno, t.ad_tab_id");
    var procs = q("SELECT ad_ctxhelp_id AS h, ad_process_id AS p FROM ad_process WHERE ad_ctxhelp_id IS NOT NULL AND isactive='Y' ORDER BY ad_process_id");
    var out = [];
    helps.forEach(function (h) {
      var hid = num(h.id), en = msgOf(q, hid, { client: c, org: g, lang: 'en_US' }); if (!en) return;
      var tl = L === 'en_US' ? en : msgOf(q, hid, { client: c, org: g, lang: L }), ts = tabs.filter(function (t) { return num(t.h) === hid; }), ps = procs.filter(function (p) { return num(p.h) === hid; });
      if (!ts.length && !ps.length) return;   // a help no tab or process links is not a how-to of a place (legacy shows it nowhere)
      var E = split(en.base), X = split(tl.text), local = tl.lang === L && L !== 'en_US', first = ts[0];
      out.push({ id: hid, ctxtype: String(h.ct), ad_window_id: first ? num(first.w) : null, windows: ts.map(function (t) { return num(t.w); }).filter(function (w, i, a) { return a.indexOf(w) === i; }), tabs: ts.map(function (t) { return num(t.tab); }),
        ad_process_id: ps.length ? num(ps[0].p) : null, processes: ps.map(function (p) { return num(p.p); }),
        name: (local ? X.title : E.title) || String(h.n), name_en: E.title || String(h.n), window: first ? String(first.wn) : null, kind: first ? String(first.tn) : null, table: first ? String(first.tt) : null,
        html: local ? X.html : E.html, english: L !== 'en_US' && !local, translated: local && tl.istranslated === 'N' ? MACHINE : null, published: local && tl.istranslated !== 'N',   // `translated` = the machine label the page and the CLI print (a published row needs none)
        source: { url: h.d != null ? String(h.d) : null, guide: guideOf(h.d), heading: '### ' + (E.title || String(h.n)), sentences: plainParas(E.html), translation: local ? plainParas(X.html) : null } });
    });
    return out;
  }
  var api = { msg: msg, howto: howto, has: has, split: split, MACHINE: MACHINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.CtxHelp = api;
})(typeof window !== 'undefined' ? window : this);
