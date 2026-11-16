// trl_batch_2026-11-17_howto.js — the words of the `?` palette's How To rows (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.3).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-17_howto.js`, then build_trl.js.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-17 — NOT from a published iDempiere language pack.
'use strict';
const NEW = { ui_howto_guide: { en: 'Guide' }, ui_howto_guide_en: { en: 'Guide (English)' }, ui_howto_cli: { en: 'Same at the CLI' } };
const T3 = {
  ms_MY: ['Panduan', 'Panduan (Bahasa Inggeris)', 'Sama di CLI'],
  de_DE: ['Handbuch', 'Handbuch (Englisch)', 'Dasselbe in der CLI'],
  fr_FR: ['Guide', 'Guide (anglais)', 'La même chose en CLI'],
  es_ES: ['Guía', 'Guía (inglés)', 'Lo mismo en la CLI'],
  zh_CN: ['指南', '指南（英文）', '命令行中的同一操作'],
  th_TH: ['คู่มือ', 'คู่มือ (ภาษาอังกฤษ)', 'แบบเดียวกันใน CLI'],
  ja_JP: ['ガイド', 'ガイド（英語）', 'CLI での同じ操作'],
  ko_KR: ['가이드', '가이드(영어)', 'CLI에서 같은 작업'],
  ar_SA: ['الدليل', 'الدليل (بالإنجليزية)', 'الشيء نفسه في سطر الأوامر'],
  pt_BR: ['Guia', 'Guia (inglês)', 'O mesmo na CLI'],
  id_ID: ['Panduan', 'Panduan (Bahasa Inggris)', 'Sama di CLI'],
  bn_BD: ['নির্দেশিকা', 'নির্দেশিকা (ইংরেজি)', 'CLI-তে একই কাজ'],
  bl_BD: ['Nirdeshika', 'Nirdeshika (English)', 'CLI-te eki kaj'],
  af_ZA: ['Gids', 'Gids (Engels)', 'Dieselfde in die CLI']
};
const TRL = {};
Object.keys(T3).forEach(l => { TRL[l] = { ui_howto_guide: T3[l][0], ui_howto_guide_en: T3[l][1], ui_howto_cli: T3[l][2] }; });
const LABEL = 'machine (Claude, Anthropic, 2026-11-17), How To palette words — viewer/tools/trl_batch_2026-11-17_howto.js';
module.exports = { NEW, TRL, LABEL };
