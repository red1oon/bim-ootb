// ⚠ DO NOT REMOVE — erp/tools/help_records.js: the ERP ADAPTER of the help query core (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.2 Step 2; design prompts/HELP_QUERY_CORE_DESIGN.md §2 D1, §4).
// READ THE LOG of W-HQ-SELF / W-HQ-COST after a build (common/help/tests/logs/). An exit code is not evidence.
// It only LISTS records from sources that already exist; it ranks nothing and invents nothing:
//   window   every active AD_Window (name: the language's from the help pack's names.windows, else the dictionary's; the dictionary's English name and the window's own table names are other names `a`)
//   process  every active AD_Process · doctype every active C_DocType · action AD_Ref_List 135 (description = the English pack's text) · status AD_Ref_List 131
//   howto    the how-to rows the ERP help box already shows: the language pack's rows when it has them, else the English rows (the page's own rule, erp/help_search.js indexFrom)
// Text is never copied into a record: d / h are an INTEGER into one virtual text list, text(i) = pack.texts[i] for i < pack.texts.length, then the how-to texts, then the action descriptions.
// resolver(en, pack) rebuilds the same list at run time from the two packs the page already loads (erp/erp_i18n.js loadHelp), so index.json holds no second copy.
// `gate` = [kind, id] is opaque to the core; the page's role gate reads it (window / process / doctype). Actions, statuses and the how-to rows of every role carry no gate.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ERP = path.join(__dirname, '..'), HELP = path.join(ERP, 'i18n', 'help');
const SEED = process.env.ERP_SEED_DB || path.join(ERP, 'ad_seed.db');
const KINDS = ['window', 'process', 'doctype', 'action', 'status', 'howto'];
const LANGS = ['en_US', 'fr_FR', 'de_DE', 'ja_JP', 'zh_CN'];
const q = (sql) => { const r = cp.spawnSync('sqlite3', ['-readonly', '-json', SEED, sql], { encoding: 'utf8', maxBuffer: 1 << 29 }); if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stdout || '[]'); };
const readPack = (lang) => JSON.parse(fs.readFileSync(path.join(HELP, lang, 'help.json'), 'utf8'));
const howtoText = (r) => (r.source && r.source.translation ? r.source.translation : (r.source && r.source.sentences) || []).join(' ');
// the virtual text list beyond pack.texts: [how-to texts in row order..., action descriptions in code order...]
function extraTexts(en, pack) {
  const rows = (pack && pack.howto && pack.howto.length) ? pack.howto : (en.howto || []);
  return rows.map(howtoText).concat(Object.keys(en.actions || {}).sort().map((c) => String((en.actions[c] || {}).description || '')));
}
function resolver(en, pack) {
  const T = (pack && pack.texts) || [], X = extraTexts(en, pack);
  return (i) => (i < T.length ? T[i] : X[i - T.length]);
}
function load(lang) {
  const en = readPack('en_US'), pack = lang === 'en_US' ? en : readPack(lang), nm = (lang === 'en_US' ? null : pack.names) || { windows: {}, tables: {}, actions: {}, statuses: {} };
  const T = (pack.texts || []).length, X = extraTexts(en, pack), rows = (pack.howto && pack.howto.length) ? pack.howto : (en.howto || []);
  const recs = [], tidy = (s) => String(s).replace(/\s+/g, ' ').trim();
  const alts = (n, list) => { const seen = new Set([tidy(n).toLowerCase()]), out = []; list.forEach((x) => { if (x == null) return; const t = tidy(x), k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); out.push(t); } }); return out; };
  // windows (+ the Name of each table whose window it is: the dictionary's own other name for the window, as erp/help_search.js indexFrom matches it)
  const tabs = {}; q("SELECT ad_table_id AS tid, name AS tn, ad_window_id AS tw FROM ad_table WHERE isactive='Y' AND ad_window_id IS NOT NULL AND accesslevel<>'4' ORDER BY ad_table_id").forEach((t) => { (tabs[t.tw] = tabs[t.tw] || []).push(t); });
  q("SELECT ad_window_id AS id, name AS n FROM ad_window WHERE isactive='Y' ORDER BY ad_window_id").forEach((w) => {
    const t = nm.windows[String(w.id)], n = t || String(w.n), o = [];
    if (t) o.push(String(w.n));
    (tabs[w.id] || []).forEach((tb) => { o.push(String(tb.tn)); if (nm.tables[String(tb.tid)]) o.push(nm.tables[String(tb.tid)]); });
    const a = alts(n, o); recs.push(Object.assign({ id: 'window/' + w.id, k: 'window', n }, a.length ? { a } : {}, { gate: ['window', Number(w.id)] }));
  });
  q("SELECT ad_process_id AS id, name AS n FROM ad_process WHERE isactive='Y' ORDER BY ad_process_id").forEach((p) => recs.push({ id: 'process/' + p.id, k: 'process', n: String(p.n), gate: ['process', Number(p.id)] }));
  q("SELECT c_doctype_id AS id, name AS n FROM c_doctype WHERE isactive='Y' ORDER BY c_doctype_id").forEach((d) => recs.push({ id: 'doctype/' + d.id, k: 'doctype', n: String(d.n), gate: ['doctype', Number(d.id)] }));
  const codes = Object.keys(en.actions || {}).sort();
  q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=135 AND isactive='Y' AND value<>'--' ORDER BY value").forEach((r) => {
    const t = nm.actions[r.v], n = t || String(r.n), a = alts(n, t ? [String(r.n)] : []), c = codes.indexOf(r.v), d = (c >= 0 && X[rows.length + c]) ? T + rows.length + c : null;
    recs.push(Object.assign({ id: 'action/' + r.v, k: 'action', n }, a.length ? { a } : {}, d == null ? {} : { d }));
  });
  q("SELECT value AS v, name AS n FROM ad_ref_list WHERE ad_reference_id=131 AND isactive='Y' AND value<>'--' ORDER BY value").forEach((r) => {
    const t = nm.statuses[r.v], n = t || String(r.n), a = alts(n, t ? [String(r.n)] : []);
    recs.push(Object.assign({ id: 'status/' + r.v, k: 'status', n }, a.length ? { a } : {}));
  });
  rows.forEach((r, i) => { const e = (en.howto || []).find((x) => x.ad_window_id === r.ad_window_id), a = alts(r.name, e ? [e.name] : []);
    recs.push(Object.assign({ id: 'howto/' + r.id, k: 'howto', n: String(r.name) }, a.length ? { a } : {}, { h: T + i, gate: ['window', Number(r.ad_window_id)] })); });
  return { records: recs, kinds: KINDS, ntexts: T, resolve: (i) => (i < T ? pack.texts[i] : X[i - T]) };
}
module.exports = { app: 'erp', kinds: KINDS, langs: LANGS, load, resolver, extraTexts, outFile: (lang) => path.join(HELP, lang, 'index.json') };
