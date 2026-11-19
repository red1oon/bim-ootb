// ⚠ DO NOT REMOVE — erp/help_records_core.js: the ONE pure builder of the ERP help RECORDS (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.3 Step 3; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1).
// READ THE LOG of W-HQ-BOX B0 / W-HQ-SELF / W-HQ-COST after every change (common/help/tests/logs/). An exit code is not evidence.
// Two callers, ONE function, so there is no second record shape: the build tool (erp/tools/help_records.js, q = the sqlite3 CLI, packs read from disk -> i18n/help/<lang>/index.json)
// and the run time (erp/help_search.js indexFrom, q = the live dictionary handle, packs as the page loaded them). PURE: no require, no fs, no DOM; runs unchanged in Node and in the page.
// It only LISTS records from sources that already exist; it ranks nothing and invents nothing:
//   window   every active AD_Window (name: the language's from the help pack's names.windows, else the dictionary's; the dictionary's English name and the window's own table names are other names `a`)
//   process  every active AD_Process · form / workflow / info / task (§19.14) every active AD_Menu leaf of action X / F / I / T, named as the MENU names it (help pack names.menus, built by erp/menu_name.js), gate ['menu', AD_Menu_ID] · doctype every active C_DocType · action AD_Ref_List 135 (description = the English pack's text) · status AD_Ref_List 131
//   howto    the how-to rows the ERP help box shows: the language pack's rows when it has them, else the English rows
// Text is never copied into a record: d / h are an INTEGER into one virtual text list, text(i) = pack.texts[i] for i < pack.texts.length, then the how-to texts, then the action descriptions.
// `gate` = [kind, id] is opaque to the query core; the page's role gate reads it. Actions and statuses carry no gate.
(function (root) {
  'use strict';
  var KINDS = ['window', 'process', 'form', 'workflow', 'info', 'task', 'doctype', 'action', 'status', 'howto'];
  function howtoText(r) { return (r.source && r.source.translation ? r.source.translation : (r.source && r.source.sentences) || []).join(' '); }
  function rowsOf(en, pack) { return (pack && pack.howto && pack.howto.length) ? pack.howto : (en.howto || []); }
  // the virtual text list beyond pack.texts: [how-to texts in row order..., action descriptions in code order...]
  function extraTexts(en, pack) {
    return rowsOf(en, pack).map(howtoText).concat(Object.keys(en.actions || {}).sort().map(function (c) { return String((en.actions[c] || {}).description || ''); }));
  }
  function resolver(en, pack) {
    var T = (pack && pack.texts) || [], X = extraTexts(en, pack);
    return function (i) { return i < T.length ? T[i] : X[i - T.length]; };
  }
  function tidy(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  // alts(n, list): the other names, trimmed, without a repeat of n or of each other (case-folded by toLowerCase only)
  function alts(n, list) {
    var seen = {}, out = []; seen[tidy(n).toLowerCase()] = 1;
    list.forEach(function (x) { if (x == null) return; var t = tidy(x), k = t.toLowerCase(); if (t && !seen[k]) { seen[k] = 1; out.push(t); } });
    return out;
  }
  function withA(rec, a) { if (a.length) rec.a = a; return rec; }
  // build({q, en, pack}) -> {records, kinds, ntexts, resolve}.  q(sql) -> rows (any handle); en = the en_US help pack; pack = the screen language's pack, or null/absent for en_US
  function build(c) {
    var q = c.q, en = c.en || {}, pack = c.pack || null, pk = pack || en, nm = (pack && pack.names) || { windows: {}, tables: {}, actions: {}, statuses: {} };
    var T = (pk.texts || []).length, X = extraTexts(en, pack), rows = rowsOf(en, pack), recs = [];
    var tabs = {};   // the window's own tables: the dictionary's other names for the window
    q("SELECT ad_table_id AS tid, name AS tn, ad_window_id AS tw FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL AND accesslevel<>'4' ORDER BY ad_table_id").forEach(function (t) { (tabs[t.tw] = tabs[t.tw] || []).push(t); });
    q("SELECT ad_window_id AS id, name AS n FROM ad_window WHERE isactive='Y' ORDER BY ad_window_id").forEach(function (w) {
      var t = nm.windows[String(w.id)], n = t || String(w.n), o = [];
      if (t) o.push(String(w.n));
      (tabs[w.id] || []).forEach(function (tb) { o.push(String(tb.tn)); if (nm.tables[String(tb.tid)]) o.push(nm.tables[String(tb.tid)]); });
      var r = withA({ id: 'window/' + w.id, k: 'window', n: n }, alts(n, o)); r.gate = ['window', Number(w.id)]; recs.push(r);
    });
    q("SELECT ad_process_id AS id, name AS n FROM ad_process WHERE isactive='Y' ORDER BY ad_process_id").forEach(function (p) { var t = (nm.processes || {})[String(p.id)], n = t || String(p.n), r = withA({ id: 'process/' + p.id, k: 'process', n: n }, alts(n, t ? [String(p.n)] : [])); r.gate = ['process', Number(p.id)]; recs.push(r); });   // §19.10 the language's name (help pack names.processes), the dictionary's English name another name `a`, as windows
    q("SELECT c_doctype_id AS id, name AS n FROM c_doctype WHERE isactive='Y' ORDER BY c_doctype_id").forEach(function (d) { recs.push({ id: 'doctype/' + d.id, k: 'doctype', n: String(d.n), gate: ['doctype', Number(d.id)] }); });
    var LEAF = { X: 'form', F: 'workflow', I: 'info', T: 'task' };   // §19.14 legacy's menu kinds (AbstractMenuPanel.java:204-228); a record per menu ENTRY, as legacy's menu search lists entries
    q("SELECT ad_menu_id AS id, action AS a, name AS n FROM ad_menu WHERE isactive='Y' AND issummary='N' AND action IN ('X','F','I','T') ORDER BY ad_menu_id").forEach(function (m) { var t = (nm.menus || {})[String(m.id)], en0 = String(m.n || '').trim(), n = t || en0, r = withA({ id: 'menu/' + m.id, k: LEAF[m.a], n: n }, alts(n, t ? [en0] : [])); r.gate = ['menu', Number(m.id)]; recs.push(r); });
    var codes = Object.keys(en.actions || {}).sort();
    q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=135 AND isactive='Y' AND value<>'--' ORDER BY value").forEach(function (r) {
      var t = nm.actions[r.v], n = t || String(r.n), a = alts(n, t ? [String(r.n)] : []), ci = codes.indexOf(r.v), rec = withA({ id: 'action/' + r.v, k: 'action', n: n }, a);
      if (ci >= 0 && X[rows.length + ci]) rec.d = T + rows.length + ci; recs.push(rec);
    });
    q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y' AND value<>'--' ORDER BY value").forEach(function (r) {
      var t = nm.statuses[r.v], n = t || String(r.n); recs.push(withA({ id: 'status/' + r.v, k: 'status', n: n }, alts(n, t ? [String(r.n)] : [])));
    });
    rows.forEach(function (r, i) {
      var e = (en.howto || []).find(function (x) { return x.id === r.id; }), rec = withA({ id: 'howto/' + r.id, k: 'howto', n: String(r.name) }, alts(r.name, e ? [e.name] : []));
      rec.h = T + i; var gs = (r.windows && r.windows.length ? r.windows : (r.ad_window_id != null ? [r.ad_window_id] : [])).map(function (w) { return ['window', Number(w)]; }).concat((r.processes || (r.ad_process_id != null ? [r.ad_process_id] : [])).map(function (p) { return ['process', Number(p)]; }));
      rec.gate = gs.length === 1 ? gs[0] : ['any', gs]; recs.push(rec);   // §19.16 C4 / §19.17 F1: a how-to is the role's when ANY window or process it is linked from is
    });
    var order = {}; KINDS.forEach(function (k, i) { order[k] = i; });
    recs.sort(function (a, b) { return order[a.k] - order[b.k] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });   // deterministic: kind order, then id (UTF-16 code units)
    return { records: recs, kinds: KINDS.slice(), ntexts: T, resolve: function (i) { return i < T ? pk.texts[i] : X[i - T]; } };
  }
  var api = { build: build, kinds: KINDS, resolver: resolver, extraTexts: extraTexts, howtoText: howtoText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else if (root) root.HelpRecords = api;
})(typeof window !== 'undefined' ? window : globalThis);
