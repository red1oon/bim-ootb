#!/usr/bin/env node
// trl_fill_batch.js — FILL translations for EXISTING keys (AD_Message, or BIM_Element since T2: a term key goes to BIM_Element_Trl_<lang>.xml) whose row in the _Trl_<lang>.xml is still
// trl="N" (English kept). The counterpart of trl_add_batch.js, which only adds NEW keys. Spec: bim-compiler
// prompts/VOCAB_MESSAGE_CATALOG.md §14.2. Refuses (writes nothing, exit 1) on: a key not in ad_message_base.csv, an
// unknown or base locale, an empty text, or a row already trl="Y" with a DIFFERENT text (a translation is never
// overwritten here — edit the XML for that). A row already trl="Y" with the same text is skipped (idempotent).
// Each touched XML's header comment gains the batch's source line. Existing untouched rows stay byte-identical.
// Batch module: module.exports = { LABEL, FILL: { <locale>: { <key>: <text> } } }
// Run:  node viewer/tools/trl_fill_batch.js <batch.js>   then   node viewer/tools/build_trl.js   — read the §TRL_FILL lines.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');
const file = process.argv[2];
if (!file) { console.error('usage: node viewer/tools/trl_fill_batch.js <batch.js>'); process.exit(2); }
const B = require(path.resolve(file));
const label = B.LABEL || ('viewer/tools/' + path.basename(file));
const log = s => console.log('§TRL_FILL ' + s);
const byValue = new Map(T.readBase().map(r => [r.value, Object.assign({ tbl: 'AD_Message' }, r)]));
T.readTerms().forEach(r => byValue.set(r.value, Object.assign({ tbl: 'BIM_Element' }, r)));   // T2: the terminology table (a key lives in one table)
const problems = [], outs = [];
Object.keys(B.FILL || {}).forEach(lang0 => {
  if (!T.LOCALES.includes(lang0) || lang0 === T.BASE) { problems.push('unknown or base locale ' + lang0); return; }
 ['AD_Message', 'BIM_Element'].forEach(tbl => {
  const lang = lang0, fillKeys = Object.keys(B.FILL[lang]).filter(k => !byValue.has(k) ? tbl === 'AD_Message' : byValue.get(k).tbl === tbl);
  if (!fillKeys.length) return;
  const xmlPath = tbl === 'BIM_Element' ? T.elementXmlFile(lang) : T.xmlFile(lang), old = fs.readFileSync(xmlPath, 'utf8'), x = T.parseTrlXml(old);
  const byId = new Map(x.rows.map(r => [r.id, r]));
  const rows = x.rows.map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text }));
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  let filled = 0, same = 0; const ids = [];
  fillKeys.forEach(k => {
    const text = B.FILL[lang][k], b = byValue.get(k);
    if (!b) { problems.push(lang + ': key not in base ' + k); return; }
    if (typeof text !== 'string' || !text.trim()) { problems.push(lang + ': empty text for ' + k); return; }
    const r = byId.get(b.id);
    if (!r) { problems.push(lang + ': no xml row for ' + k + ' (' + b.id + ')'); return; }
    if (r.trl === 'Y') { if (r.text === text) { same++; return; } problems.push(lang + ': ' + k + ' already translated with other text'); return; }
    rows[idx.get(b.id)] = { id: r.id, trl: 'Y', original: r.original, text: text }; filled++; ids.push(b.id);
  });
  if (!filled) { log('lang=' + lang + ' filled=0 same=' + same); return; }
  const m = old.match(/^<\?xml[^>]*>\s*<!--([\s\S]*?)-->/);
  let comment = m ? m[1] : '';
  const srcLine = 'rows ' + Math.min(...ids) + '-' + Math.max(...ids) + ' (' + filled + ' filled) source=' + label;
  if (comment.indexOf(srcLine) < 0) {
    const at = comment.indexOf(' — NOT from a published iDempiere language pack');
    comment = at >= 0 ? comment.slice(0, at) + '; ' + srcLine + comment.slice(at) : comment + ' ' + srcLine + '.';
  }
  const text = T.writeTrlXml(lang, comment, rows, tbl);
  const back = new Map(T.parseTrlXml(text).rows.map(r => [r.id, r]));
  const touched = new Set(ids);
  const drift = x.rows.filter(r => { if (touched.has(r.id)) return false; const n = back.get(r.id); return !n || n.trl !== r.trl || n.text !== r.text || n.original !== r.original; }).length;
  if (drift) { problems.push(lang + ': ' + drift + ' untouched rows would change'); return; }
  outs.push({ lang, xmlPath, text, filled, same });
});
 });
if (problems.length) { problems.forEach(p => log('PROBLEM ' + p)); log('REFUSED problems=' + problems.length + ' — nothing written'); process.exit(1); }
outs.forEach(o => { fs.writeFileSync(o.xmlPath, o.text); log('lang=' + o.lang + ' filled=' + o.filled + ' same=' + o.same); });
log('done label="' + label + '" → now run: node viewer/tools/build_trl.js');
