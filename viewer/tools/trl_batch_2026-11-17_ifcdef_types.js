// trl_batch_2026-11-17_ifcdef_types.js — (a) for the two TYPE classes of the shipped buildings. bSDD has no ...Type class,
// so a type shows the bSDD definition of the occurrence class its own IFC 4.3 page names (ifc_class_help/type_of.json, the
// cited sentence checked below against the saved copy of that page). Spec: bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.2
// (owner 2026-11-17: "proceed" on "borrow the element class's definition, but say so on screen").
// PROVENANCE: buildingSMART bSDD IFC 4.3 text, VERBATIM, CC BY-ND 4.0 (ifc_class_help/bsdd_ifc43_type_of_classes.json).
// Per type <C>: ifcdef_<C> = the occurrence class's definition; ifcdef_<C>_lang = its language; ifcdef_<C>_of = the occurrence
// class (shown in the heading "IFC definition of {cls}"). Plus the panel word ui_cls_ifcdef_of (ours, machine-translated).
'use strict';
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'ifc_class_help');
const MAP = JSON.parse(fs.readFileSync(path.join(DIR, 'type_of.json'), 'utf8'));
const D = require(path.join(DIR, 'bsdd_ifc43_type_of_classes.json'));
const CODES = { 'de-DE': 'de_DE', 'es-ES': 'es_ES', 'ja-JP': 'ja_JP', 'zh-CN': 'zh_CN', 'pt-BR': 'pt_BR', 'fr-FR': 'fr_FR' };
const NEW = {}, TRL = {};
Object.keys(MAP).filter(k => k[0] !== '_').sort().forEach(type => {
  const m = MAP[type], page = fs.readFileSync(path.join(DIR, m.file), 'utf8');
  if (page.indexOf(m.cite) < 0) throw new Error(type + ': cited sentence not found in ' + m.file);
  const en = D[m.of] && D[m.of].EN;
  if (!en || !en.definition) throw new Error(type + ': no bSDD text for ' + m.of);
  NEW['ifcdef_' + type] = { en: en.definition };
  NEW['ifcdef_' + type + '_lang'] = { en: 'EN' };
  NEW['ifcdef_' + type + '_of'] = { en: m.of };
  Object.keys(CODES).forEach(code => {
    const x = D[m.of][code];
    if (!x || !x.definition || x.definition === en.definition) return;
    const loc = CODES[code];
    (TRL[loc] = TRL[loc] || {})['ifcdef_' + type] = x.definition;
    TRL[loc]['ifcdef_' + type + '_lang'] = code;
  });
});
NEW.ui_cls_ifcdef_of = { en: 'IFC definition of {cls}' };
const OF = { ms_MY: 'Definisi IFC bagi {cls}', de_DE: 'IFC-Definition von {cls}', fr_FR: 'Définition IFC de {cls}', es_ES: 'Definición IFC de {cls}',
  zh_CN: '{cls} 的 IFC 定义', th_TH: 'คำนิยาม IFC ของ {cls}', ja_JP: '{cls} の IFC 定義', ko_KR: '{cls}의 IFC 정의', ar_SA: 'تعريف IFC لـ {cls}',
  pt_BR: 'Definição IFC de {cls}', id_ID: 'Definisi IFC untuk {cls}', bn_BD: '{cls}-এর IFC সংজ্ঞা', bl_BD: '{cls}-er IFC songga', af_ZA: 'IFC-definisie van {cls}' };
Object.keys(OF).forEach(l => { (TRL[l] = TRL[l] || {}).ui_cls_ifcdef_of = OF[l]; });
const LABEL = 'buildingSMART bSDD IFC 4.3 (CC BY-ND 4.0) verbatim, type -> occurrence per its IFC page; ui_cls_ifcdef_of machine (Claude, 2026-11-17) — viewer/tools/trl_batch_2026-11-17_ifcdef_types.js';
module.exports = { NEW, TRL, LABEL };
