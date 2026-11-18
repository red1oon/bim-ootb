// trl_batch_2026-11-18_export_menu.js — the words of the Viewer's ONE Export pill + menu (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(a)).
// The toolbar pill id 'save' keeps its id (saved order, #pill-save) and takes trlKey 'export' (panels.js _pillKey), so its name and Help sub-rows are the NEW rows
// pill_export / pillc_export_1..3; the menu (viewer/export_menu.js) reads ui_exp_*. The old pill_save / pillc_save_* rows stay (append-only ids); pill_save is still
// the Save Building wording in the menu's sub-line.
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-18_export_menu.js`, then build_trl.js.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-18 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text). Kept as the product's tokens: .db, IFC, .ifc, BCF, .bcfzip, Ctrl+S, BIM.
// Wording reused per locale: "Save Building" = pill_save row, "Export" = ui_export_bcf row.
'use strict';
const KEYS = ['pill_export', 'pillc_export_1', 'pillc_export_2', 'pillc_export_3', 'ui_exp_db', 'ui_exp_ifc', 'ui_exp_bcf', 'ui_exp_bcf_none', 'ui_exp_ifc_none'];
const EN = ['Export', 'Building (.db): same as Save Building, Ctrl+S', 'IFC (whole building): an .ifc file for other BIM tools', 'BCF (issues): saved issues as a .bcfzip, greyed until one exists',
  'Building (.db)', 'IFC (whole building)', 'BCF (issues)', 'no saved issues', 'needs a single-file building with geometry tables'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Eksport', 'Bangunan (.db): sama seperti Simpan Bangunan, Ctrl+S', 'IFC (seluruh bangunan): fail .ifc untuk alat BIM lain', 'BCF (isu): isu tersimpan sebagai .bcfzip, kelabu sehingga ada satu',
    'Bangunan (.db)', 'IFC (seluruh bangunan)', 'BCF (isu)', 'tiada isu tersimpan', 'perlukan bangunan satu fail dengan jadual geometri'],
  de_DE: ['Exportieren', 'Gebäude (.db): wie Gebäude speichern, Ctrl+S', 'IFC (ganzes Gebäude): eine .ifc-Datei für andere BIM-Werkzeuge', 'BCF (Probleme): gespeicherte Probleme als .bcfzip, ausgegraut bis eines existiert',
    'Gebäude (.db)', 'IFC (ganzes Gebäude)', 'BCF (Probleme)', 'keine gespeicherten Probleme', 'braucht ein Ein-Datei-Gebäude mit Geometrietabellen'],
  fr_FR: ['Exporter', 'Bâtiment (.db) : comme Enregistrer le bâtiment, Ctrl+S', 'IFC (tout le bâtiment) : un fichier .ifc pour d\'autres outils BIM', 'BCF (problèmes) : les problèmes enregistrés en .bcfzip, grisé tant qu\'il n\'y en a pas',
    'Bâtiment (.db)', 'IFC (tout le bâtiment)', 'BCF (problèmes)', 'aucun problème enregistré', 'nécessite un bâtiment en un seul fichier avec tables de géométrie'],
  es_ES: ['Exportar', 'Edificio (.db): igual que Guardar edificio, Ctrl+S', 'IFC (todo el edificio): un archivo .ifc para otras herramientas BIM', 'BCF (incidencias): incidencias guardadas como .bcfzip, en gris hasta que exista una',
    'Edificio (.db)', 'IFC (todo el edificio)', 'BCF (incidencias)', 'no hay incidencias guardadas', 'requiere un edificio de un solo archivo con tablas de geometría'],
  zh_CN: ['导出', '建筑 (.db)：与“保存建筑”相同，Ctrl+S', 'IFC（整栋建筑）：供其他 BIM 工具使用的 .ifc 文件', 'BCF（问题）：已保存的问题导出为 .bcfzip，没有问题时为灰色',
    '建筑 (.db)', 'IFC（整栋建筑）', 'BCF（问题）', '没有已保存的问题', '需要带几何表的单文件建筑'],
  th_TH: ['ส่งออก', 'อาคาร (.db): เหมือน บันทึกอาคาร, Ctrl+S', 'IFC (ทั้งอาคาร): ไฟล์ .ifc สำหรับเครื่องมือ BIM อื่น', 'BCF (ปัญหา): ปัญหาที่บันทึกไว้เป็น .bcfzip, เป็นสีเทาจนกว่าจะมีปัญหา',
    'อาคาร (.db)', 'IFC (ทั้งอาคาร)', 'BCF (ปัญหา)', 'ไม่มีปัญหาที่บันทึกไว้', 'ต้องเป็นอาคารไฟล์เดียวที่มีตารางเรขาคณิต'],
  ja_JP: ['エクスポート', '建物 (.db)：「建物を保存」と同じ、Ctrl+S', 'IFC（建物全体）：他の BIM ツール向けの .ifc ファイル', 'BCF（課題）：保存した課題を .bcfzip で出力、課題がない間はグレー表示',
    '建物 (.db)', 'IFC（建物全体）', 'BCF（課題）', '保存された課題はありません', 'ジオメトリテーブルを持つ単一ファイルの建物が必要です'],
  ko_KR: ['내보내기', '건물 (.db): 건물 저장과 동일, Ctrl+S', 'IFC (건물 전체): 다른 BIM 도구용 .ifc 파일', 'BCF (이슈): 저장된 이슈를 .bcfzip으로, 이슈가 생길 때까지 회색',
    '건물 (.db)', 'IFC (건물 전체)', 'BCF (이슈)', '저장된 이슈 없음', '지오메트리 테이블이 있는 단일 파일 건물이 필요합니다'],
  ar_SA: ['تصدير', 'المبنى (.db): مثل حفظ المبنى، Ctrl+S', 'IFC (المبنى كاملاً): ملف .ifc لأدوات BIM الأخرى', 'BCF (المشكلات): المشكلات المحفوظة بصيغة .bcfzip، معطّل حتى توجد مشكلة',
    'المبنى (.db)', 'IFC (المبنى كاملاً)', 'BCF (المشكلات)', 'لا توجد مشكلات محفوظة', 'يتطلب مبنى بملف واحد يحتوي على جداول الهندسة'],
  pt_BR: ['Exportar', 'Edifício (.db): igual a Salvar edifício, Ctrl+S', 'IFC (edifício inteiro): um arquivo .ifc para outras ferramentas BIM', 'BCF (problemas): problemas salvos como .bcfzip, cinza até existir um',
    'Edifício (.db)', 'IFC (edifício inteiro)', 'BCF (problemas)', 'nenhum problema salvo', 'requer um edifício de arquivo único com tabelas de geometria'],
  id_ID: ['Ekspor', 'Bangunan (.db): sama dengan Simpan Bangunan, Ctrl+S', 'IFC (seluruh bangunan): file .ifc untuk alat BIM lain', 'BCF (isu): isu tersimpan sebagai .bcfzip, abu-abu sampai ada satu',
    'Bangunan (.db)', 'IFC (seluruh bangunan)', 'BCF (isu)', 'tidak ada isu tersimpan', 'memerlukan bangunan satu file dengan tabel geometri'],
  bn_BD: ['রপ্তানি', 'ভবন (.db): ভবন সংরক্ষণের মতোই, Ctrl+S', 'IFC (পুরো ভবন): অন্য BIM টুলের জন্য একটি .ifc ফাইল', 'BCF (সমস্যা): সংরক্ষিত সমস্যা .bcfzip হিসেবে, একটি না থাকলে ধূসর',
    'ভবন (.db)', 'IFC (পুরো ভবন)', 'BCF (সমস্যা)', 'কোনো সংরক্ষিত সমস্যা নেই', 'জ্যামিতি টেবিলসহ একক-ফাইল ভবন দরকার'],
  bl_BD: ['Roptani', 'Building (.db): Building Save korun er moto, Ctrl+S', 'IFC (pura building): onno BIM tool-er jonno ekti .ifc file', 'BCF (shomossha): shongrokkhito shomossha .bcfzip hishebe, ekti na thakle dhushor',
    'Building (.db)', 'IFC (pura building)', 'BCF (shomossha)', 'kono shongrokkhito shomossha nei', 'jyamiti table shoho ek-file building dorkar'],
  af_ZA: ['Voer uit', 'Gebou (.db): dieselfde as Stoor gebou, Ctrl+S', 'IFC (hele gebou): \'n .ifc-lêer vir ander BIM-gereedskap', 'BCF (kwessies): gestoorde kwessies as .bcfzip, grys totdat daar een is',
    'Gebou (.db)', 'IFC (hele gebou)', 'BCF (kwessies)', 'geen gestoorde kwessies nie', 'het \'n eenlêer-gebou met meetkundetabelle nodig'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-18), the Viewer Export pill + menu (Building .db / IFC / BCF) — viewer/tools/trl_batch_2026-11-18_export_menu.js';
module.exports = { NEW, TRL, LABEL };
