// trl_batch_2026-11-17_roadstd_fill.js — FILL the four Road standards rows (pill_roadstd, pillc_roadstd_1..3) that exist in
// ad_message_base.csv but were trl="N" (English) in every locale; W-VIEWER-I18N counted them as GAP 4 (bim-compiler
// prompts/VOCAB_MESSAGE_CATALOG.md §14.8). Applied ONCE by `node viewer/tools/trl_fill_batch.js viewer/tools/trl_batch_2026-11-17_roadstd_fill.js`, then build_trl.js.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-17 — NOT reviewed by speakers. Kept as tokens: ATJ 2A/85 (the Malaysian
// JKR road-sign standard's own code), OK / UNKNOWN / MISSING (the panel's status words, shown as printed).
'use strict';
const KEYS = ['pill_roadstd', 'pillc_roadstd_1', 'pillc_roadstd_2', 'pillc_roadstd_3'];
const T = {
  ms_MY: ['Piawaian jalan', 'Kod papan tanda lwn ATJ 2A/85', 'Pepohon OK / UNKNOWN / MISSING', 'Klik papan tanda: zum + piawaian'],
  de_DE: ['Straßennormen', 'Schildcodes vs. ATJ 2A/85', 'Baum OK / UNKNOWN / MISSING', 'Schild anklicken: Zoom + Norm'],
  fr_FR: ['Normes routières', 'Codes des panneaux vs ATJ 2A/85', 'Arbre OK / UNKNOWN / MISSING', 'Cliquez sur un panneau : zoom + norme'],
  es_ES: ['Normas viales', 'Códigos de señales frente a ATJ 2A/85', 'Árbol OK / UNKNOWN / MISSING', 'Haga clic en una señal: zoom + norma'],
  zh_CN: ['道路标准', '标志代码对照 ATJ 2A/85', 'OK / UNKNOWN / MISSING 树', '点击标志：缩放 + 标准'],
  th_TH: ['มาตรฐานถนน', 'รหัสป้ายเทียบ ATJ 2A/85', 'ต้นไม้ OK / UNKNOWN / MISSING', 'คลิกป้าย: ซูม + มาตรฐาน'],
  ja_JP: ['道路基準', '標識コードと ATJ 2A/85 の照合', 'OK / UNKNOWN / MISSING ツリー', '標識をクリック：ズーム + 基準'],
  ko_KR: ['도로 기준', '표지 코드 대 ATJ 2A/85', 'OK / UNKNOWN / MISSING 트리', '표지 클릭: 확대 + 기준'],
  ar_SA: ['معايير الطرق', 'رموز اللافتات مقابل ATJ 2A/85', 'شجرة OK / UNKNOWN / MISSING', 'انقر على لافتة: تكبير + المعيار'],
  pt_BR: ['Normas viárias', 'Códigos de placas vs ATJ 2A/85', 'Árvore OK / UNKNOWN / MISSING', 'Clique em uma placa: zoom + norma'],
  id_ID: ['Standar jalan', 'Kode rambu vs ATJ 2A/85', 'Pohon OK / UNKNOWN / MISSING', 'Klik rambu: perbesar + standar'],
  bn_BD: ['সড়ক মানদণ্ড', 'সাইন কোড বনাম ATJ 2A/85', 'OK / UNKNOWN / MISSING ট্রি', 'একটি সাইনে ক্লিক করুন: জুম + মানদণ্ড'],
  bl_BD: ['Sorok manodondo', 'Sign code bonam ATJ 2A/85', 'OK / UNKNOWN / MISSING tree', 'Ekti sign-e click korun: zoom + manodondo'],
  af_ZA: ['Padstandaarde', 'Tekenkodes teenoor ATJ 2A/85', 'OK / UNKNOWN / MISSING-boom', "Klik op 'n teken: zoem + standaard"],
};
const FILL = {}; Object.keys(T).forEach((l) => { FILL[l] = {}; KEYS.forEach((k, i) => { FILL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-17), Road standards rows filled — viewer/tools/trl_batch_2026-11-17_roadstd_fill.js';
module.exports = { LABEL, FILL };
