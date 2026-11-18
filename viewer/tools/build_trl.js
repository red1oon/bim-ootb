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

// join one table's base rows with its _Trl xml sources for `lang` (T4, TRL_TRILOGY_STANDARD.md S-3/S-4). The sources are read in priority order T.SOURCES (own, then machine): for each
// base id the first source that has a USABLE row (its `original` equals today's English) wins, whatever its trl flag (an own trl="N" row deliberately keeps the English). A lower
// source's row for an id a higher source won is kept on disk and counted `shadowed`. A row whose `original` differs from today's English is `stale`: counted, never used.
// Each base id lands in exactly ONE class: shadowed (a lower row sits under the winner), else kept (a trl="Y" winner), else untranslated  =>  kept + shadowed + untranslatedIds = base rows.
// returns {entries, rows, translated, untranslated (rows left in English, incl. a winner trl="N"), kept, shadowed, untranslatedIds, stale, usedOwn, usedMachine, files}
function joinTable(tbl, table, base, lang, fileOf) {
  const byId = new Map(base.map(r => [r.id, r]));
  if (byId.size !== base.length) throw new Error('duplicate ids in the ' + table + ' base csv');
  base.forEach(r => { if (!(r.id > T.MAX_OFFICIAL_ID)) throw new Error(table + ' id ' + r.id + ' is not above MAX_OFFICIAL_ID'); });
  const entries = [], z = { entries, rows: base.length, translated: 0, untranslated: 0, kept: 0, shadowed: 0, untranslatedIds: 0, stale: 0, usedOwn: 0, usedMachine: 0, files: [] };
  if (lang === T.BASE) { base.forEach(r => entries.push({ id: r.id, tbl, value: r.value, text: r.msgtext })); z.rows = base.length; return z; }
  const problems = [], rowsBy = {};   // source -> Map(id -> row)
  T.SOURCES.forEach(src => {
    const xmlPath = fileOf(lang, src), m = rowsBy[src] = new Map();
    if (!fs.existsSync(xmlPath)) { if (src === 'machine' && base.length) throw new Error('missing machine/' + path.basename(xmlPath)); return; }
    const x = T.parseTrlXml(fs.readFileSync(xmlPath, 'utf8')), tag = src + '/' + path.basename(xmlPath);
    if (x.language !== lang) problems.push(tag + ': language attr ' + x.language + ' != ' + lang);
    if (x.table !== table) problems.push(tag + ': table attr ' + x.table + ' != ' + table);
    x.rows.forEach(r => {
      const b = byId.get(r.id);
      if (!b) { problems.push(tag + ': row ' + r.id + ' not in base'); return; }
      if (m.has(r.id)) problems.push(tag + ': row ' + r.id + ' duplicated');
      if (r.tipOriginal !== '') problems.push(tag + ': row ' + r.id + ' MsgTip original not empty');
      m.set(r.id, r);
    });
    if (m.size) z.files.push(src === 'machine' ? path.basename(xmlPath) : src + '/' + path.basename(xmlPath));
  });
  base.forEach(b => { if (!rowsBy.machine.has(b.id)) problems.push('machine: base ' + b.id + ' ' + b.value + ' missing from xml'); });   // machine/ is complete; own/ is sparse by design
  if (problems.length) throw new Error(problems.slice(0, 5).join('; ') + (problems.length > 5 ? ' (+' + (problems.length - 5) + ')' : ''));
  base.forEach(b => {
    let win = null, winAt = -1, shadowedHere = 0;
    T.SOURCES.forEach((src, i) => {
      const r = rowsBy[src].get(b.id); if (!r) return;
      if (r.original !== b.msgtext) { z.stale++; return; }                 // stale: counted, never used
      if (!win) { win = r; winAt = i; }
    });
    if (win) T.SOURCES.forEach((src, i) => { if (i > winAt && rowsBy[src].get(b.id)) shadowedHere++; });   // a lower source's row under the winner: kept on disk, not used
    const yes = !!win && win.trl === 'Y';
    entries.push({ id: b.id, tbl, value: b.value, text: yes ? win.text : b.msgtext });
    if (yes) { z.translated++; if (T.SOURCES[winAt] === 'own') z.usedOwn++; else z.usedMachine++; } else z.untranslated++;
    if (shadowedHere) z.shadowed++; else if (yes) z.kept++; else z.untranslatedIds++;
  });
  return z;
}
function buildAll() {
  const base = T.readBase(), terms = T.readTerms();
  const both = base.filter(r => terms.some(t => t.value === r.value));
  if (both.length) throw new Error(both.length + ' keys are in BOTH ad_message_base.csv and bim_element_base.csv (a key lives in ONE table): ' + both.slice(0, 5).map(r => r.value).join(','));
  const out = {};
  T.LOCALES.forEach(lang => {
    const a = joinTable(0, 'AD_Message', base, lang, T.xmlFile), e = joinTable(1, 'BIM_Element', terms, lang, T.elementXmlFile);
    const labels = {};
    a.entries.concat(e.entries).sort((p, q) => p.id - q.id || p.tbl - q.tbl).forEach(r => { labels[r.value] = r.text; });
    const from = ['ad_message_base.csv'].concat(a.files).concat(terms.length ? ['bim_element_base.csv'].concat(e.files) : []);   // machine/ file names as before; an own/ file that holds rows is added as own/<name>
    const built = { from, rows: a.rows + e.rows, translated: a.translated + e.translated, untranslated: a.untranslated + e.untranslated };
    out[lang] = lang === T.BASE ? { language: lang, table: 'AD_Message', base: true, built, labels } : { language: lang, table: 'AD_Message', built, labels };
    out[lang].tables = { AD_Message: a.rows, BIM_Element: e.rows };
    Object.defineProperty(out[lang], 'stats', { value: { AD_Message: a, BIM_Element: e } });   // for the log only: non-enumerable, never serialised
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
    if (lang !== T.BASE) ['AD_Message', 'BIM_Element'].forEach(tn => { const z = all[lang].stats[tn];   // S-4: per table and locale; kept + shadowed + untranslated = base rows
      console.log('§TRL_BUILD_SRC lang=' + lang + ' table=' + tn + ' base=' + z.rows + ' kept=' + z.kept + ' (own=' + z.usedOwn + ' machine=' + z.usedMachine + ') shadowed=' + z.shadowed + ' stale=' + z.stale + ' untranslated=' + z.untranslatedIds + (z.kept + z.shadowed + z.untranslatedIds === z.rows ? '' : ' SUM-MISMATCH')); });
    console.log('§TRL_BUILD lang=' + lang + ' rows=' + b.rows + ' translated=' + b.translated + ' untranslated=' + b.untranslated + ' AD_Message=' + all[lang].tables.AD_Message + ' BIM_Element=' + all[lang].tables.BIM_Element + ' json=' + (same ? 'unchanged' : (check ? 'STALE' : 'written')));
  });
  console.log('§TRL_BUILD ' + (check ? 'check' : 'done') + ' locales=' + Object.keys(all).length + ' changed=' + diff);
  if (check && diff) process.exit(1);
}
module.exports = { buildAll, serialize };
