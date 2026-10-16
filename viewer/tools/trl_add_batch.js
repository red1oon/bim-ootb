#!/usr/bin/env node
// trl_add_batch.js — APPEND a labelled batch of NEW AD_Message rows (+ their translations) to the iDempiere-format
// sources: viewer/i18n/ad_message_base.csv (one base row per new key, ids continue above the highest existing id —
// an id is never renumbered, it is iDempiere's join key) and every viewer/i18n/AD_Message_Trl_<lang>.xml (one <row>
// per new id: trl="Y" with the batch's text, else trl="N" carrying the English, counted apart). The header comment of
// each XML gains the batch's source line (machine translations are labelled, S226 §R2 FORMAT RULE).
// Spec: bim-compiler prompts/S226_localisation.md §R2b SPEC R2b.3. The migration (trl_migrate_2026-10-03.js) was
// one-shot; THIS is the reusable path for every later batch. Idempotent: a NEW key already in the CSV with the same
// English is skipped; a key whose English differs, a translation for a key not in NEW, or an unknown locale is a
// PROBLEM — nothing is written and the exit code is 1. Existing rows are never touched (the XML is re-serialized
// through the same writer that produced it, so unchanged rows stay byte-identical).
// Run:  node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_<date>_<name>.js   then   node viewer/tools/build_trl.js
// Read the §TRL_ADD lines after a run; exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');

const file = process.argv[2];
if (!file) { console.error('usage: node viewer/tools/trl_add_batch.js <batch.js>'); process.exit(2); }
const B = require(path.resolve(file));
const label = B.LABEL || ('viewer/tools/' + path.basename(file));
function log(s) { console.log('§TRL_ADD ' + s); }

const base = T.readBase();
const byValue = new Map(base.map(r => [r.value, r]));
let nextId = base.reduce((m, r) => Math.max(m, r.id), T.MAX_OFFICIAL_ID) + 1;
const problems = [], added = [];
Object.keys(B.NEW || {}).forEach(k => {
  const spec = B.NEW[k]; const en = spec && spec.en;
  if (typeof en !== 'string' || !en.length) { problems.push('NEW ' + k + ' has no English'); return; }
  const ex = byValue.get(k);
  if (ex) { if (ex.msgtext !== en) problems.push('key ' + k + ' already exists with different English ' + JSON.stringify(ex.msgtext) + ' vs batch ' + JSON.stringify(en)); return; }
  const row = { id: nextId++, value: k, msgtext: en, msgtype: spec.type || 'I' };
  base.push(row); byValue.set(k, row); added.push(row);
});
Object.keys(B.TRL || {}).forEach(lang => {
  if (!T.LOCALES.includes(lang) || lang === T.BASE) { problems.push('TRL has unknown or base locale ' + lang); return; }
  Object.keys(B.TRL[lang]).forEach(k => {
    if (!B.NEW || !B.NEW[k]) problems.push(lang + ': translation for a key that is not in NEW: ' + k);
    else if (typeof B.TRL[lang][k] !== 'string' || !B.TRL[lang][k].length) problems.push(lang + ': empty translation for ' + k);
  });
});
if (problems.length) { problems.forEach(p => log('PROBLEM ' + p)); log('REFUSED problems=' + problems.length + ' — nothing written'); process.exit(1); }

// every XML is prepared in memory first; only when all parse cleanly is anything written
const outs = [];
T.LOCALES.filter(l => l !== T.BASE).forEach(lang => {
  const xmlPath = T.xmlFile(lang);
  const old = fs.readFileSync(xmlPath, 'utf8');
  const x = T.parseTrlXml(old);
  if (x.language !== lang) throw new Error(path.basename(xmlPath) + ': language attr ' + x.language);
  const have = new Set(x.rows.map(r => r.id));
  const tr = (B.TRL && B.TRL[lang]) || {};
  const rows = x.rows.map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text }));
  let y = 0, n = 0;
  added.forEach(r => {
    if (have.has(r.id)) return;
    const has = Object.prototype.hasOwnProperty.call(tr, r.value);
    if (has) y++; else n++;
    rows.push({ id: r.id, trl: has ? 'Y' : 'N', original: r.msgtext, text: has ? tr[r.value] : r.msgtext });
  });
  const m = old.match(/^<\?xml[^>]*>\s*<!--([\s\S]*?)-->/);
  let comment = m ? m[1] : ('BIM OOTB Viewer — AD_Message_Trl ' + lang + ' — format: org.compiere.install.Translation export (iDempiere).');
  if (added.length) {
    const srcLine = 'rows ' + added[0].id + '-' + added[added.length - 1].id + ' source=' + label;
    if (comment.indexOf(srcLine) < 0) {
      const at = comment.indexOf(' — NOT from a published iDempiere language pack');
      comment = at >= 0 ? comment.slice(0, at) + '; ' + srcLine + comment.slice(at) : comment + ' ' + srcLine + '.';
    }
  }
  const text = T.writeTrlXml(lang, comment, rows);
  // the rows that were already there must come back byte-identical (same writer, same input)
  const oldRows = old.slice(old.indexOf('<idempiereTrl')), newRows = text.slice(text.indexOf('<idempiereTrl'));
  const oldBody = oldRows.slice(0, oldRows.lastIndexOf('</idempiereTrl>'));
  if (!newRows.startsWith(oldBody)) throw new Error(path.basename(xmlPath) + ': existing rows would change — refusing');
  outs.push({ lang, xmlPath, text, y, n, rows: rows.length });
});

if (added.length) fs.writeFileSync(T.CSV, T.writeCsv(base));
outs.forEach(o => { if (added.length) fs.writeFileSync(o.xmlPath, o.text); log('lang=' + o.lang + ' rows=' + o.rows + ' added=' + (o.y + o.n) + ' trlY=' + o.y + ' trlN=' + o.n); });
log((added.length ? 'done' : 'nothing to add — every NEW key is already in ad_message_base.csv') + ' base rows=' + base.length + ' added=' + added.length +
  (added.length ? ' ids=' + added[0].id + '-' + added[added.length - 1].id : '') + ' label=' + JSON.stringify(label) + ' → now run: node viewer/tools/build_trl.js');
