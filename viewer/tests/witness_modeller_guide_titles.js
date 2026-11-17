#!/usr/bin/env node
// ⚠ DO NOT REMOVE — W-MODELLER-GUIDE-TITLES (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.5.1). Scope: the section TITLES of the Modeller's in-app guide (modeller/modeller.html `const SECTIONS`,
// shown by the help panel, bim-ootb #3171) against the dictionary the Modeller translates from (viewer/i18n/ad_message_base.csv + AD_Message_Trl_<lang>.xml). READ THE LOG: exit code alone is not evidence.
// Issue it proves/disproves: "a user who picked another language opens the Modeller help and the guide section titles are English because the dictionary has no row for them"
//   (W-MODELLER-I18N de_DE showed 6 such strings after #3171). N is read from the live source, never counted by hand.
//   G1 BASE  — every SECTIONS title has a base row whose msgtext equals it exactly (the Modeller matches by exact on-screen English).
//   G2 TRL   — for each of those rows, each of the 14 non-English locales has a trl="Y" row with a non-empty text. (en_* locales keep the English by design.)
//   RED CONTROL — a title with no base row and a locale row marked trl="N" must FAIL, or the invariants prove nothing.
// usage: node viewer/tests/witness_modeller_guide_titles.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { Witness } = require(path.join(ROOT, 'witness_kit', 'contract.js'));
const T = require(path.join(ROOT, 'viewer', 'tools', 'trl_common'));
const src = fs.readFileSync(path.join(ROOT, 'modeller', 'modeller.html'), 'utf8');
const i = src.indexOf('const SECTIONS = ['), j = src.indexOf('\n  ];', i);
if (i < 0 || j < 0) { console.log('§W-MODELLER-GUIDE-TITLES INCONCLUSIVE SECTIONS block not found — nothing judged'); process.exit(2); }
const TITLES = eval(src.slice(i + 'const SECTIONS = '.length, j + 4)).map(s => s[0]);
const NON_EN = T.LOCALES.filter(l => !/^en_/.test(l));
const base = T.readBase(), byText = new Map(base.map(r => [r.msgtext, r]));
const trl = {}; NON_EN.forEach(l => { trl[l] = new Map((T.parseTrlXml(fs.readFileSync(T.xmlFile(l), 'utf8')).rows || T.parseTrlXml(fs.readFileSync(T.xmlFile(l), 'utf8'))).map(r => [String(r.id), r])); });
console.log('§GUIDE_TITLES titles=' + TITLES.length + ' locales=' + NON_EN.length + ' [' + TITLES.join(' | ') + ']');
const rows = []; TITLES.forEach(t => { const b = byText.get(t); NON_EN.forEach(l => { const r = b && trl[l].get(String(b.id)); rows.push({ title: t, locale: l, hasBase: !!b, trl: r ? r.trl : '-', text: r ? r.text : '' }); }); });
const res = Witness('MODELLER-GUIDE-TITLES')
  .population(() => rows)
  .schema({ type: 'object', required: ['title', 'locale', 'hasBase', 'trl', 'text'], properties: { title: { type: 'string' }, locale: { type: 'string' } } })
  .invariant('G1 every guide title has a base row (exact English)', rs => { const miss = [...new Set(rs.filter(r => !r.hasBase).map(r => r.title))]; if (miss.length) console.log('  missing base rows: ' + miss.join(' | ')); return !miss.length; })
  .invariant('G2 every title x non-English locale is a trl="Y" row with text (' + TITLES.length + ' x ' + NON_EN.length + ' = ' + TITLES.length * NON_EN.length + ')', rs => { const bad = rs.filter(r => r.trl !== 'Y' || !r.text); if (bad.length) console.log('  not translated: ' + bad.slice(0, 12).map(r => r.title + '@' + r.locale + ':' + r.trl).join(', ')); return !bad.length; })
  .redControl(rs => rs.map((r, k) => k === 0 ? Object.assign({}, r, { hasBase: false }) : (k === 1 ? Object.assign({}, r, { trl: 'N' }) : r)))
  .run();
process.exit(res.fail ? 1 : 0);
