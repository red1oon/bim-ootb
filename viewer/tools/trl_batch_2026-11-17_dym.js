// trl_batch_2026-11-17_dym.js — the words of the help boxes' "Did you mean" line (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.5).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-17_dym.js`, then build_trl.js.
// The line shows the label, then ': ' (added by common/help/help_dym.js, outside the translated word), then the names.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-17 — NOT from a published iDempiere language pack.
'use strict';
const NEW = { ui_help_dym: { en: 'Did you mean' } };
const T1 = {
  ms_MY: 'Adakah maksud anda', de_DE: 'Meinten Sie', fr_FR: 'Vouliez-vous dire', es_ES: 'Quizás quiso decir', zh_CN: '您是不是想找',
  th_TH: 'คุณหมายถึง', ja_JP: 'もしかして', ko_KR: '혹시 찾으시는 것은', ar_SA: 'هل تقصد', pt_BR: 'Você quis dizer',
  id_ID: 'Maksud Anda', bn_BD: 'আপনি কি বোঝাতে চেয়েছেন', bl_BD: 'Apni ki bojhate cheyechen', af_ZA: 'Bedoel jy'
};
const TRL = {};
Object.keys(T1).forEach(l => { TRL[l] = { ui_help_dym: T1[l] }; });
const LABEL = 'machine (Claude, Anthropic, 2026-11-17), the help boxes\' Did-you-mean label — viewer/tools/trl_batch_2026-11-17_dym.js';
module.exports = { NEW, TRL, LABEL };
