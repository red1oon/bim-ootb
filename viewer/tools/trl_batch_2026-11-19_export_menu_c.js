// trl_batch_2026-11-19_export_menu_c.js — the words of the IFC scope chips step (c) adds to the Viewer Export menu: Whole building | Find selection (N), the tip of the selection scope and the hint when nothing is isolated (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(c)).
// Read by viewer/export_menu.js (ui_exp_scope_whole, ui_exp_scope_find {n}, ui_exp_scope_find_tip {n}, ui_exp_scope_none). The IFC row's label itself is now the product word "IFC" (no key).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-19_export_menu_c.js`, then build_trl.js, then the help builds (see the (c) RESULT).
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-19 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text). Kept as the product's tokens: Find, IFC. {n} is the placeholder window._trl fills.
'use strict';
const KEYS = ['ui_exp_scope_whole', 'ui_exp_scope_find', 'ui_exp_scope_find_tip', 'ui_exp_scope_none'];
const EN = ['Whole building', 'Find selection ({n})', 'the {n} elements Find has isolated', 'Find and isolate first'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Seluruh bangunan', 'Pilihan Find ({n})', '{n} elemen yang diasingkan oleh Find', 'Gunakan Find dan asingkan dahulu'],
  de_DE: ['Ganzes Gebäude', 'Find-Auswahl ({n})', 'die {n} Elemente, die Find isoliert hat', 'Zuerst mit Find isolieren'],
  fr_FR: ['Bâtiment entier', 'Sélection Find ({n})', 'les {n} éléments isolés par Find', 'Isolez d\'abord avec Find'],
  es_ES: ['Todo el edificio', 'Selección de Find ({n})', 'los {n} elementos que Find ha aislado', 'Primero aísle con Find'],
  zh_CN: ['整栋建筑', 'Find 选择 ({n})', 'Find 已隔离的 {n} 个构件', '请先用 Find 隔离'],
  th_TH: ['ทั้งอาคาร', 'ที่เลือกจาก Find ({n})', '{n} องค์ประกอบที่ Find แยกไว้', 'ใช้ Find แยกองค์ประกอบก่อน'],
  ja_JP: ['建物全体', 'Find の選択 ({n})', 'Find が分離した {n} 個の要素', '先に Find で分離してください'],
  ko_KR: ['건물 전체', 'Find 선택 ({n})', 'Find가 분리한 {n}개 요소', '먼저 Find로 분리하세요'],
  ar_SA: ['المبنى كاملاً', 'تحديد Find ({n})', 'العناصر الـ {n} التي عزلها Find', 'اعزل أولاً باستخدام Find'],
  pt_BR: ['Edifício inteiro', 'Seleção do Find ({n})', 'os {n} elementos isolados pelo Find', 'Isole primeiro com o Find'],
  id_ID: ['Seluruh bangunan', 'Pilihan Find ({n})', '{n} elemen yang diisolasi oleh Find', 'Gunakan Find dan isolasi dahulu'],
  bn_BD: ['পুরো ভবন', 'Find নির্বাচন ({n})', 'Find যে {n}টি উপাদান আলাদা করেছে', 'আগে Find দিয়ে আলাদা করুন'],
  bl_BD: ['Pura building', 'Find nirbachon ({n})', 'Find je {n}ti upadan alada koreche', 'Age Find diye alada korun'],
  af_ZA: ['Hele gebou', 'Find-keuse ({n})', 'die {n} elemente wat Find geïsoleer het', 'Isoleer eers met Find'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-19), the Viewer Export menu IFC scope chips — viewer/tools/trl_batch_2026-11-19_export_menu_c.js';
module.exports = { NEW, TRL, LABEL };
