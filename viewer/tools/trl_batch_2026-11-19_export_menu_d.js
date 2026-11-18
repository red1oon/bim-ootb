// trl_batch_2026-11-19_export_menu_d.js — the words of the Frame control step (d) adds to the IFC row of the Viewer Export menu: the control's label, its tip, the sub-line word when no frame file is chosen, and the refusal word (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(d)).
// Read by viewer/export_menu.js (ui_exp_frame, ui_exp_frame_tip, ui_exp_frame_db, ui_exp_frame_refused).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-19_export_menu_d.js`, then build_trl.js, then the help builds (see the (d) RESULT).
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-19 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text). Kept as the product's tokens: IFC, JSON.
'use strict';
const KEYS = ['ui_exp_frame', 'ui_exp_frame_tip', 'ui_exp_frame_db', 'ui_exp_frame_refused'];
const EN = ['Frame…', 'Place the file in your shared coordinates: choose a frame file (JSON)', 'DB frame', 'refused'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Bingkai…', 'Letakkan fail dalam koordinat kongsi anda: pilih fail bingkai (JSON)', 'bingkai pangkalan data', 'ditolak'],
  de_DE: ['Rahmen…', 'Die Datei in Ihre gemeinsamen Koordinaten setzen: Rahmendatei (JSON) wählen', 'DB-Rahmen', 'abgelehnt'],
  fr_FR: ['Repère…', 'Placer le fichier dans vos coordonnées partagées : choisir un fichier de repère (JSON)', 'repère de la base', 'refusé'],
  es_ES: ['Marco…', 'Colocar el archivo en sus coordenadas compartidas: elija un archivo de marco (JSON)', 'marco de la base', 'rechazado'],
  zh_CN: ['坐标框架…', '把文件放入你们的共享坐标：选择框架文件 (JSON)', '数据库坐标', '已拒绝'],
  th_TH: ['กรอบพิกัด…', 'วางไฟล์ในพิกัดร่วมของคุณ: เลือกไฟล์กรอบพิกัด (JSON)', 'กรอบพิกัดของฐานข้อมูล', 'ถูกปฏิเสธ'],
  ja_JP: ['座標枠…', 'ファイルを共有座標に置く: 座標枠ファイル (JSON) を選択', 'DB の座標', '拒否されました'],
  ko_KR: ['좌표 프레임…', '파일을 공유 좌표에 배치: 프레임 파일 (JSON) 선택', 'DB 좌표', '거부됨'],
  ar_SA: ['الإطار…', 'ضع الملف في إحداثياتكم المشتركة: اختر ملف الإطار (JSON)', 'إطار قاعدة البيانات', 'مرفوض'],
  pt_BR: ['Referencial…', 'Colocar o arquivo nas suas coordenadas compartilhadas: escolha um arquivo de referencial (JSON)', 'referencial do banco', 'recusado'],
  id_ID: ['Kerangka…', 'Tempatkan berkas pada koordinat bersama Anda: pilih berkas kerangka (JSON)', 'kerangka basis data', 'ditolak'],
  bn_BD: ['ফ্রেম…', 'ফাইলটি আপনাদের যৌথ স্থানাঙ্কে বসান: একটি ফ্রেম ফাইল (JSON) বেছে নিন', 'ডেটাবেস ফ্রেম', 'প্রত্যাখ্যাত'],
  bl_BD: ['Frame…', 'File ta apnader shared coordinate e boshan: ekta frame file (JSON) bachun', 'DB frame', 'protyakhyato'],
  af_ZA: ['Raam…', 'Plaas die lêer in julle gedeelde koördinate: kies \'n raamlêer (JSON)', 'DB-raam', 'geweier'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-19), the Viewer Export menu IFC Frame control — viewer/tools/trl_batch_2026-11-19_export_menu_d.js';
module.exports = { NEW, TRL, LABEL };
