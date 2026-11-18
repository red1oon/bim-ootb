#!/usr/bin/env node
// trl_move_terms_2026-11-18.js — MOVE the term rows out of AD_Message into BIM_Element (bim-compiler prompts/TRL_TRILOGY_STANDARD.md S-2, step T2).
// ISSUE: IFC class names and definitions were AD_Message rows, so a term could not be shared or reviewed as a term.
// RULE (trl_common.isTermKey): a key is a term iff it names an IFC class: ifccls_<IfcClass>, ifcdef_<IfcClass>, ifcdef_<IfcClass>_lang, ifcdef_<IfcClass>_of. All others stay.
// A row keeps its id, its text and its trl flag: it is DELETED from ad_message_base.csv + every AD_Message_Trl_<lang>.xml and ADDED, unchanged, to bim_element_base.csv
// + every BIM_Element_Trl_<lang>.xml. Applied ONCE (re-running finds nothing left to move and writes nothing), then `node viewer/tools/build_trl.js`.
// Read the §TRL_MOVE lines after a run; exit code is not evidence.
'use strict';
const fs = require('fs'), path = require('path');
const T = require('./trl_common');
const log = (s) => console.log('§TRL_MOVE ' + s);

const base = T.readBase(), terms = T.readTerms();
const moving = base.filter(r => T.isTermKey(r.value));
if (!moving.length) { log('nothing to move (already applied) ad=' + base.length + ' element=' + terms.length); process.exit(0); }
const ids = new Set(moving.map(r => r.id));
const clash = moving.filter(r => terms.some(t => t.value === r.value || t.id === r.id));
if (clash.length) { log('REFUSED: ' + clash.length + ' rows already in bim_element_base.csv (a key lives in ONE table)'); process.exit(1); }

const byPrefix = {}; moving.forEach(r => { const p = r.value.replace(/^(ifccls|ifcdef)_Ifc.*?(_lang|_of)?$/, '$1$2'); byPrefix[p] = (byPrefix[p] || 0) + 1; });
const outs = [];
outs.push([T.CSV, T.writeCsv(base.filter(r => !ids.has(r.id)))]);
outs.push([T.ELEMENT_CSV, T.writeElementCsv(terms.concat(moving.map(r => ({ id: r.id, value: r.value, msgtext: r.msgtext }))).sort((a, b) => a.id - b.id))]);
const lo = Math.min.apply(null, moving.map(r => r.id)), hi = Math.max.apply(null, moving.map(r => r.id));
T.LOCALES.filter(l => l !== T.BASE).forEach(lang => {
  const old = fs.readFileSync(T.xmlFile(lang), 'utf8'), x = T.parseTrlXml(old);
  const keep = x.rows.filter(r => !ids.has(r.id)), mv = x.rows.filter(r => ids.has(r.id));
  if (mv.length !== moving.length) throw new Error(lang + ': ' + mv.length + ' xml rows to move, expected ' + moving.length);
  const m = old.match(/^<\?xml[^>]*>\s*<!--([\s\S]*?)-->/); let comment = m ? m[1] : ('BIM OOTB Viewer — AD_Message_Trl ' + lang);
  const note = ' TERMS MOVED OUT: ' + moving.length + ' rows (ids ' + lo + '-' + hi + ': ifccls_/ifcdef_ <IfcClass> keys) now live in BIM_Element_Trl_' + lang + '.xml (viewer/tools/trl_move_terms_2026-11-18.js, TRL_TRILOGY_STANDARD.md S-2).';
  outs.push([T.xmlFile(lang), T.writeTrlXml(lang, comment.indexOf('TERMS MOVED OUT') < 0 ? comment + note : comment, keep.map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text })))]);
  const ec = 'BIM OOTB Viewer — BIM_Element_Trl ' + lang + ' — the TERMINOLOGY table (IFC classes: our plain description ifccls_*, buildingSMART definition ifcdef_*), same format as AD_Element_Trl (org.compiere.install.Translation export). ' +
    'Rows ' + lo + '-' + hi + ' moved unchanged (id, text, trl flag) from AD_Message_Trl_' + lang + '.xml by viewer/tools/trl_move_terms_2026-11-18.js. Provenance per row, from the batches: ifccls_* = machine translation by Claude (Anthropic), 2026-11-17, ' +
    'NOT from a published iDempiere language pack (viewer/tools/trl_batch_2026-11-17_ifccls.js, _ifccls_fill.js); ifcdef_* = buildingSMART bSDD IFC 4.3 text VERBATIM, CC BY-ND 4.0, never reworded (trl_batch_2026-11-17_ifcdef.js, _ifcdef_types.js).';
  outs.push([T.elementXmlFile(lang), T.writeTrlXml(lang, ec, mv.map(r => ({ id: r.id, trl: r.trl, original: r.original, text: r.text })), 'BIM_Element')]);
});
outs.forEach(([f, t]) => fs.writeFileSync(f, t));
log('moved=' + moving.length + ' ids=' + lo + '-' + hi + ' by-kind=' + JSON.stringify(byPrefix) + ' ad_rows ' + base.length + '->' + (base.length - moving.length) + ' element_rows ' + terms.length + '->' + (terms.length + moving.length) + ' xml_pairs=' + (T.LOCALES.length - 1) + ' files=' + outs.length);
