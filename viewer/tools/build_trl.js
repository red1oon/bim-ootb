#!/usr/bin/env node
// build_trl.js — BUILD viewer/i18n/<code>.json (what the pages fetch) from the iDempiere-format sources
// viewer/i18n/ad_message_base.csv ⋈ viewer/i18n/AD_Message_Trl_<lang>.xml, joined by AD_Message_ID — and (T2, TRL_TRILOGY_STANDARD.md S-2) the TERMINOLOGY table
// viewer/i18n/bim_element_base.csv ⋈ viewer/i18n/BIM_Element_Trl_<lang>.xml, joined by BIM_Element_ID — into the ONE label pack per locale (a page asks one lookup).
// A key in BOTH tables is an error (a move is delete + add, never a copy). Labels are written in id order across the two tables. The same
// join iDempiere's TranslationHandler does when it imports a pack (UPDATE AD_Message_Trl … WHERE AD_Message_ID=<row id>).
// Spec: bim-compiler prompts/S226_localisation.md §R2 SPEC R2.1 ("why the page loads a BUILT JSON").
// The JSON is NEVER hand-edited: edit the XML (or add a CSV row), run this. Deterministic — same inputs, same bytes.
// A trl="N" row yields the English (counted as untranslated). Read the §TRL_BUILD lines after a run; --check writes
// nothing and exits 1 if any shipped JSON differs from what the sources say (used by W-VIEWER-I18N).
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');

// join one table's base rows with its _Trl xml for `lang`; returns {entries:[{id,tbl,value,text}], rows, translated, untranslated, file}
function joinTable(tbl, table, base, lang, xmlPath) {
  const byId = new Map(base.map(r => [r.id, r]));
  if (byId.size !== base.length) throw new Error('duplicate ids in the ' + table + ' base csv');
  base.forEach(r => { if (!(r.id > T.MAX_OFFICIAL_ID)) throw new Error(table + ' id ' + r.id + ' is not above MAX_OFFICIAL_ID'); });
  const entries = []; let translated = 0, untranslated = 0;
  if (lang === T.BASE) { base.forEach(r => entries.push({ id: r.id, tbl, value: r.value, text: r.msgtext })); return { entries, rows: base.length, translated: 0, untranslated: 0, file: null }; }
  if (!fs.existsSync(xmlPath)) { if (!base.length) return { entries, rows: 0, translated: 0, untranslated: 0, file: null }; throw new Error('missing ' + path.basename(xmlPath)); }
  const problems = [], x = T.parseTrlXml(fs.readFileSync(xmlPath, 'utf8')), seen = new Set();
  if (x.language !== lang) problems.push('language attr ' + x.language + ' != ' + lang);
  if (x.table !== table) problems.push('table attr ' + x.table + ' != ' + table);
  x.rows.forEach(r => {
    const b = byId.get(r.id);
    if (!b) { problems.push('row ' + r.id + ' not in base'); return; }
    if (seen.has(r.id)) problems.push('row ' + r.id + ' duplicated'); seen.add(r.id);
    if (r.original !== b.msgtext) problems.push('row ' + r.id + ' original != base text');
    if (r.tipOriginal !== '') problems.push('row ' + r.id + ' MsgTip original not empty');
    if (r.trl === 'Y') { entries.push({ id: b.id, tbl, value: b.value, text: r.text }); translated++; } else { entries.push({ id: b.id, tbl, value: b.value, text: b.msgtext }); untranslated++; }
  });
  base.forEach(b => { if (!seen.has(b.id)) { problems.push('base ' + b.id + ' ' + b.value + ' missing from xml'); entries.push({ id: b.id, tbl, value: b.value, text: b.msgtext }); untranslated++; } });
  if (problems.length) throw new Error(path.basename(xmlPath) + ': ' + problems.slice(0, 5).join('; ') + (problems.length > 5 ? ' (+' + (problems.length - 5) + ')' : ''));
  return { entries, rows: x.rows.length, translated, untranslated, file: path.basename(xmlPath) };
}
function buildAll() {
  const base = T.readBase(), terms = T.readTerms();
  const both = base.filter(r => terms.some(t => t.value === r.value));
  if (both.length) throw new Error(both.length + ' keys are in BOTH ad_message_base.csv and bim_element_base.csv (a key lives in ONE table): ' + both.slice(0, 5).map(r => r.value).join(','));
  const out = {};
  T.LOCALES.forEach(lang => {
    const a = joinTable(0, 'AD_Message', base, lang, T.xmlFile(lang)), e = joinTable(1, 'BIM_Element', terms, lang, T.elementXmlFile(lang));
    const labels = {};
    a.entries.concat(e.entries).sort((p, q) => p.id - q.id || p.tbl - q.tbl).forEach(r => { labels[r.value] = r.text; });
    const from = ['ad_message_base.csv'].concat(a.file ? [a.file] : []).concat(terms.length ? ['bim_element_base.csv'].concat(e.file ? [e.file] : []) : []);
    const built = { from, rows: a.rows + e.rows, translated: a.translated + e.translated, untranslated: a.untranslated + e.untranslated };
    out[lang] = lang === T.BASE ? { language: lang, table: 'AD_Message', base: true, built, labels } : { language: lang, table: 'AD_Message', built, labels };
    out[lang].tables = { AD_Message: a.rows, BIM_Element: e.rows };
    out[lang].terms = terms.map(r => r.value);   // T3: the pack names its term keys, so a page can look a term up BY KEY and keep it out of any by-English path
  });
  return out;
}
function serialize(o) { return JSON.stringify(o, null, 1) + '\n'; }

if (require.main === module) {
  const check = process.argv.includes('--check');
  const all = buildAll(); let diff = 0;
  Object.keys(all).forEach(lang => {
    const file = path.join(T.I18N, lang + '.json'); const text = serialize(all[lang]);
    const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text;
    if (!same) { diff++; if (!check) fs.writeFileSync(file, text); }
    const b = all[lang].built;
    console.log('§TRL_BUILD lang=' + lang + ' rows=' + b.rows + ' translated=' + b.translated + ' untranslated=' + b.untranslated + ' AD_Message=' + all[lang].tables.AD_Message + ' BIM_Element=' + all[lang].tables.BIM_Element + ' json=' + (same ? 'unchanged' : (check ? 'STALE' : 'written')));
  });
  console.log('§TRL_BUILD ' + (check ? 'check' : 'done') + ' locales=' + Object.keys(all).length + ' changed=' + diff);
  if (check && diff) process.exit(1);
}
module.exports = { buildAll, serialize };
