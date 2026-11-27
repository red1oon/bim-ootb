// trl_batch_2026-11-27_send_hq.js — the Issue Log's "Send to HQ" button (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEPS 1–2 BUILD SPEC).
// Read by viewer/viewer.html (data-trl="ui_send_hq"). Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-27_send_hq.js`, then build_trl.js.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-27 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text). Kept as the product's token: HQ.
'use strict';
const KEYS = ['ui_send_hq'];
const EN = ['Send to HQ'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Hantar ke HQ'],
  de_DE: ['An HQ senden'],
  fr_FR: ['Envoyer au siège'],
  es_ES: ['Enviar a la sede'],
  zh_CN: ['发送到总部'],
  th_TH: ['ส่งถึงสำนักงานใหญ่'],
  ja_JP: ['本社へ送信'],
  ko_KR: ['본사로 보내기'],
  ar_SA: ['إرسال إلى المقر'],
  pt_BR: ['Enviar à sede'],
  id_ID: ['Kirim ke HQ'],
  bn_BD: ['সদর দপ্তরে পাঠান'],
  bl_BD: ['HQ te pathan'],
  af_ZA: ['Stuur na HK'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-27), the Issue Log Send to HQ button — viewer/tools/trl_batch_2026-11-27_send_hq.js';
module.exports = { NEW, TRL, LABEL };
