// trl_batch_2026-11-17_helpdoc.js — the words of the help panels' `#<GlobalId prefix>` and `@` answers (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.6 step 6b).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-17_helpdoc.js`, then build_trl.js.
// Each word is its own text node on the page (the typed run and the count are added beside it, outside the translated word).
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-17 — NOT from a published iDempiere language pack.
'use strict';
const NEW = {
  ui_help_doc_usage: { en: 'Type # then at least 4 characters of an element GlobalId' },
  ui_help_doc_none: { en: 'No element' },
  ui_help_doc_more: { en: 'more' },
  ui_help_reserved: { en: '@ is reserved and does nothing yet' }
};
const T1 = {
  ms_MY: ['Taip # kemudian sekurang-kurangnya 4 aksara GlobalId elemen', 'Tiada elemen', 'lagi', '@ dikhaskan dan belum berfungsi'],
  de_DE: ['# eingeben, dann mindestens 4 Zeichen der GlobalId eines Elements', 'Kein Element', 'weitere', '@ ist reserviert und tut noch nichts'],
  fr_FR: ["Tapez # puis au moins 4 caractères du GlobalId d'un élément", 'Aucun élément', 'de plus', "@ est réservé et ne fait rien pour l'instant"],
  es_ES: ['Escriba # y al menos 4 caracteres del GlobalId de un elemento', 'Ningún elemento', 'más', '@ está reservado y aún no hace nada'],
  zh_CN: ['输入 # 然后至少 4 个构件 GlobalId 字符', '没有构件', '更多', '@ 为保留字符，暂无作用'],
  th_TH: ['พิมพ์ # แล้วตามด้วย GlobalId ของชิ้นส่วนอย่างน้อย 4 ตัวอักษร', 'ไม่พบชิ้นส่วน', 'เพิ่มเติม', '@ ถูกสงวนไว้และยังไม่ทำอะไร'],
  ja_JP: ['# に続けて要素の GlobalId を 4 文字以上入力してください', '要素がありません', '件あります', '@ は予約済みで、まだ何もしません'],
  ko_KR: ['# 다음에 요소 GlobalId의 4자 이상을 입력하세요', '요소 없음', '개 더', '@는 예약되어 있으며 아직 아무 기능이 없습니다'],
  ar_SA: ['اكتب # ثم 4 أحرف على الأقل من GlobalId للعنصر', 'لا يوجد عنصر', 'أخرى', '@ محجوز ولا يفعل شيئًا بعد'],
  pt_BR: ['Digite # e depois pelo menos 4 caracteres do GlobalId de um elemento', 'Nenhum elemento', 'mais', '@ é reservado e ainda não faz nada'],
  id_ID: ['Ketik # lalu minimal 4 karakter GlobalId elemen', 'Tidak ada elemen', 'lagi', '@ dicadangkan dan belum melakukan apa pun'],
  bn_BD: ['# লিখে তারপর উপাদানের GlobalId-এর অন্তত ৪টি অক্ষর লিখুন', 'কোনো উপাদান নেই', 'আরও', '@ সংরক্ষিত এবং এখনও কিছু করে না'],
  bl_BD: ['# likhe tarpor upadaner GlobalId-er ontoto 4ti okkhor likhun', 'Kono upadan nei', 'aro', '@ songrokkhito ebong ekhono kichu kore na'],
  af_ZA: ["Tik # en dan minstens 4 karakters van 'n element se GlobalId", 'Geen element', 'meer', '@ is gereserveer en doen nog niks']
};
const KEYS = ['ui_help_doc_usage', 'ui_help_doc_none', 'ui_help_doc_more', 'ui_help_reserved'];
const TRL = {};
Object.keys(T1).forEach(l => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T1[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-17), the help panels\' #GlobalId / @ words — viewer/tools/trl_batch_2026-11-17_helpdoc.js';
module.exports = { NEW, TRL, LABEL };
