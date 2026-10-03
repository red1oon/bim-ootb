#!/usr/bin/env node
// build_trl.js — BUILD viewer/i18n/<code>.json (what the pages fetch) from the iDempiere-format sources
// viewer/i18n/ad_message_base.csv ⋈ viewer/i18n/AD_Message_Trl_<lang>.xml, joined by AD_Message_ID — the same
// join iDempiere's TranslationHandler does when it imports a pack (UPDATE AD_Message_Trl … WHERE AD_Message_ID=<row id>).
// Spec: bim-compiler prompts/S226_localisation.md §R2 SPEC R2.1 ("why the page loads a BUILT JSON").
// The JSON is NEVER hand-edited: edit the XML (or add a CSV row), run this. Deterministic — same inputs, same bytes.
// A trl="N" row yields the English (counted as untranslated). Read the §TRL_BUILD lines after a run; --check writes
// nothing and exits 1 if any shipped JSON differs from what the sources say (used by W-VIEWER-I18N).
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');

function buildAll() {
  const base = T.readBase();
  const byId = new Map(base.map(r => [r.id, r]));
  if (byId.size !== base.length) throw new Error('duplicate ids in ad_message_base.csv');
  base.forEach(r => { if (!(r.id > T.MAX_OFFICIAL_ID)) throw new Error('id ' + r.id + ' is not above MAX_OFFICIAL_ID'); });
  const out = {};
  T.LOCALES.forEach(lang => {
    const labels = {}; let translated = 0, untranslated = 0, problems = [];
    if (lang === T.BASE) {
      base.forEach(r => { labels[r.value] = r.msgtext; });
      out[lang] = { language: lang, table: 'AD_Message', base: true, built: { from: ['ad_message_base.csv'], rows: base.length, translated: 0, untranslated: 0 }, labels };
      return;
    }
    const file = T.xmlFile(lang);
    if (!fs.existsSync(file)) throw new Error('missing ' + path.basename(file));
    const x = T.parseTrlXml(fs.readFileSync(file, 'utf8'));
    if (x.language !== lang) problems.push('language attr ' + x.language + ' != ' + lang);
    const seen = new Set();
    x.rows.forEach(r => {
      const b = byId.get(r.id);
      if (!b) { problems.push('row ' + r.id + ' not in base'); return; }
      if (seen.has(r.id)) problems.push('row ' + r.id + ' duplicated'); seen.add(r.id);
      if (r.original !== b.msgtext) problems.push('row ' + r.id + ' original != base msgtext');
      if (r.tipOriginal !== '') problems.push('row ' + r.id + ' MsgTip original not empty');
      if (r.trl === 'Y') { labels[b.value] = r.text; translated++; } else { labels[b.value] = b.msgtext; untranslated++; }
    });
    base.forEach(b => { if (!seen.has(b.id)) { problems.push('base ' + b.id + ' ' + b.value + ' missing from xml'); labels[b.value] = b.msgtext; untranslated++; } });
    if (problems.length) throw new Error(path.basename(file) + ': ' + problems.slice(0, 5).join('; ') + (problems.length > 5 ? ' (+' + (problems.length - 5) + ')' : ''));
    out[lang] = { language: lang, table: 'AD_Message', built: { from: ['ad_message_base.csv', path.basename(file)], rows: x.rows.length, translated, untranslated }, labels };
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
    console.log('§TRL_BUILD lang=' + lang + ' rows=' + b.rows + ' translated=' + b.translated + ' untranslated=' + b.untranslated + ' json=' + (same ? 'unchanged' : (check ? 'STALE' : 'written')));
  });
  console.log('§TRL_BUILD ' + (check ? 'check' : 'done') + ' locales=' + Object.keys(all).length + ' changed=' + diff);
  if (check && diff) process.exit(1);
}
module.exports = { buildAll, serialize };
