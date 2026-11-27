// trl_batch_2026-11-27_get_team.js — the Issue Log's "Get from team" button (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 4 BUILD SPEC).
// Read by viewer/viewer.html (data-trl="ui_get_team"). Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-27_get_team.js`, then build_trl.js.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-27 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text).
'use strict';
const KEYS = ['ui_get_team'];
const EN = ['Get from team'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Ambil daripada pasukan'],
  de_DE: ['Vom Team abrufen'],
  fr_FR: ['Recevoir de l\'équipe'],
  es_ES: ['Recibir del equipo'],
  zh_CN: ['从团队获取'],
  th_TH: ['รับจากทีม'],
  ja_JP: ['チームから取得'],
  ko_KR: ['팀에서 가져오기'],
  ar_SA: ['جلب من الفريق'],
  pt_BR: ['Receber da equipe'],
  id_ID: ['Ambil dari tim'],
  bn_BD: ['দল থেকে আনুন'],
  bl_BD: ['Team theke anun'],
  af_ZA: ['Kry van span'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-27), the Issue Log Get from team button — viewer/tools/trl_batch_2026-11-27_get_team.js';
module.exports = { NEW, TRL, LABEL };
