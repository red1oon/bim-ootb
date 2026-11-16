// trl_batch_2026-11-17_ifcdef.js — (a) buildingSMART's IFC class definitions for the Viewer info panel's class-text block.
// Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.1 (owner 2026-11-17: "We proceed with community licensed IFC info").
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-17_ifcdef.js`, then build_trl.js.
//
// PROVENANCE: NOT machine text and NOT ours. Every string is copied VERBATIM, by code below, from buildingSMART's bSDD
// IFC 4.3 dictionary (https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3, licence CC BY-ND 4.0, fetched
// 2026-11-17 into ifc_class_help/bsdd_ifc43_shipped_classes.json). A translation is used ONLY where bSDD has an official
// text that differs from its English; every other locale keeps the English (trl="N"). ND: never reword, shorten or
// translate these rows. Credit + licence are shown under the text by info_class_help.js.
//
// Per class <C>: ifcdef_<C> = the definition; ifcdef_<C>_lang = the bSDD language code of that text ('EN' or e.g. 'de-DE').
'use strict';
const path = require('path');
const D = require(path.join(__dirname, 'ifc_class_help', 'bsdd_ifc43_shipped_classes.json'));
const MAP = { 'de-DE': 'de_DE', 'es-ES': 'es_ES', 'ja-JP': 'ja_JP', 'zh-CN': 'zh_CN', 'pt-BR': 'pt_BR', 'fr-FR': 'fr_FR' };
const NEW = {}, TRL = {};
Object.keys(D).sort().forEach(c => {
  const en = D[c].EN;
  if (!en || en.error || !en.definition) return;            // not in bSDD 4.3 (IfcWallStandardCase, …): no (a) row
  NEW['ifcdef_' + c] = { en: en.definition };
  NEW['ifcdef_' + c + '_lang'] = { en: 'EN' };
  Object.keys(MAP).forEach(code => {
    const x = D[c][code];
    if (!x || x.error || !x.definition || x.definition === en.definition) return;   // no official text in this language
    const loc = MAP[code];
    (TRL[loc] = TRL[loc] || {})['ifcdef_' + c] = x.definition;
    TRL[loc]['ifcdef_' + c + '_lang'] = code;
  });
});
const LABEL = 'buildingSMART bSDD IFC 4.3 (CC BY-ND 4.0), verbatim official text — viewer/tools/trl_batch_2026-11-17_ifcdef.js';
module.exports = { NEW, TRL, LABEL };
