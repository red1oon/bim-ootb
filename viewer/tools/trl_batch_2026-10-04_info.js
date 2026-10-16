// trl_batch_2026-10-04_info.js — the Info panel batch for the Viewer's AD_Message dictionary: the blocks filled when
// an element is picked — #info-cost (viewer/find_erp_push.js _showClassCost) and #info-4d (viewer/info_4d_panel.js).
// Spec: bim-compiler prompts/S226_localisation.md §R2c item 6. Applied ONCE by
// `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-10-04_info.js`, then `node viewer/tools/build_trl.js`.
// After that the XML is the source and this file is the batch's birth record — edit the XML, not this file.
//
// PROVENANCE: every translation below is a MACHINE translation written for this app by Claude (Anthropic) on
// 2026-10-04 — NOT from a published iDempiere language pack (labelled `source=machine` in each XML header, as
// prompts/ERP_UI_LOCALES.md §L2b). en_US/en_GB/en_AU: none (the base English is their text, trl="N").
// NEW: value -> { en } — English byte-identical to what the two renderers print today. `{name}` survives in every language.
'use strict';

const NEW = {
  info_cost_title:      { en: 'Cost variance' },
  info_cost_records:    { en: '· from records' },
  info_match_one:       { en: 'match' },
  info_match_many:      { en: 'matches' },
  info_planned:         { en: 'planned' },
  info_phase:           { en: 'Phase' },
  info_project:         { en: 'Project' },
  info_view_moment:     { en: '⏱ View at this moment' },
  info_4d_title:        { en: 'Construction window' },
  info_4d_unassigned:   { en: 'Not yet assigned to a dated task in "{name}".' },
  info_4d_sched_tip:    { en: 'Which schedule this window comes from' },
  info_4d_task:         { en: 'Task' },
  info_4d_window:       { en: 'Window' },
  info_4d_trade:        { en: 'Trade' },
  info_4d_float:        { en: 'Float' },
  info_4d_critical:     { en: '(critical path)' }
};

const TRL = {};
TRL.ms_MY = { info_cost_title: 'Varians kos', info_cost_records: '· daripada rekod', info_match_one: 'padanan', info_match_many: 'padanan',
  info_planned: 'dirancang', info_phase: 'Fasa', info_project: 'Projek', info_view_moment: '⏱ Lihat pada saat ini',
  info_4d_title: 'Tempoh pembinaan', info_4d_unassigned: 'Belum ditugaskan kepada tugas bertarikh dalam "{name}".',
  info_4d_sched_tip: 'Jadual asal tempoh ini', info_4d_task: 'Tugas', info_4d_window: 'Tempoh', info_4d_trade: 'Tred', info_4d_float: 'Apungan',
  info_4d_critical: '(laluan kritikal)' };
TRL.de_DE = { info_cost_title: 'Kostenabweichung', info_cost_records: '· aus den Belegen', info_match_one: 'Treffer', info_match_many: 'Treffer',
  info_planned: 'geplant', info_phase: 'Phase', info_project: 'Projekt', info_view_moment: '⏱ Zu diesem Zeitpunkt ansehen',
  info_4d_title: 'Bauzeitfenster', info_4d_unassigned: 'Noch keinem terminierten Vorgang in „{name}" zugeordnet.',
  info_4d_sched_tip: 'Aus welchem Terminplan dieses Fenster stammt', info_4d_task: 'Vorgang', info_4d_window: 'Zeitfenster', info_4d_trade: 'Gewerk',
  info_4d_float: 'Puffer', info_4d_critical: '(kritischer Pfad)' };
TRL.fr_FR = { info_cost_title: 'Écart de coût', info_cost_records: '· selon les écritures', info_match_one: 'correspondance', info_match_many: 'correspondances',
  info_planned: 'prévu', info_phase: 'Phase', info_project: 'Projet', info_view_moment: '⏱ Voir à ce moment',
  info_4d_title: 'Fenêtre de construction', info_4d_unassigned: 'Pas encore affecté à une tâche datée dans « {name} ».',
  info_4d_sched_tip: 'Planning d’où provient cette fenêtre', info_4d_task: 'Tâche', info_4d_window: 'Fenêtre', info_4d_trade: 'Corps de métier',
  info_4d_float: 'Marge', info_4d_critical: '(chemin critique)' };
TRL.es_ES = { info_cost_title: 'Desviación de coste', info_cost_records: '· según los registros', info_match_one: 'coincidencia', info_match_many: 'coincidencias',
  info_planned: 'previsto', info_phase: 'Fase', info_project: 'Proyecto', info_view_moment: '⏱ Ver en este momento',
  info_4d_title: 'Ventana de construcción', info_4d_unassigned: 'Aún sin asignar a una tarea con fecha en «{name}».',
  info_4d_sched_tip: 'Programa del que procede esta ventana', info_4d_task: 'Tarea', info_4d_window: 'Ventana', info_4d_trade: 'Oficio',
  info_4d_float: 'Holgura', info_4d_critical: '(ruta crítica)' };
TRL.zh_CN = { info_cost_title: '成本偏差', info_cost_records: '· 来自记录', info_match_one: '个匹配', info_match_many: '个匹配',
  info_planned: '计划', info_phase: '阶段', info_project: '项目', info_view_moment: '⏱ 查看此刻',
  info_4d_title: '施工时段', info_4d_unassigned: '尚未分配到“{name}”中有日期的任务。',
  info_4d_sched_tip: '此时段来自哪个进度计划', info_4d_task: '任务', info_4d_window: '时段', info_4d_trade: '工种',
  info_4d_float: '浮动时间', info_4d_critical: '（关键路径）' };
TRL.th_TH = { info_cost_title: 'ส่วนต่างต้นทุน', info_cost_records: '· จากบันทึก', info_match_one: 'รายการ', info_match_many: 'รายการ',
  info_planned: 'ตามแผน', info_phase: 'ระยะ', info_project: 'โครงการ', info_view_moment: '⏱ ดู ณ ช่วงเวลานี้',
  info_4d_title: 'ช่วงเวลาก่อสร้าง', info_4d_unassigned: 'ยังไม่ได้กำหนดให้กับงานที่มีวันที่ใน "{name}"',
  info_4d_sched_tip: 'ช่วงเวลานี้มาจากแผนงานใด', info_4d_task: 'งาน', info_4d_window: 'ช่วงเวลา', info_4d_trade: 'ช่าง',
  info_4d_float: 'เวลาลอยตัว', info_4d_critical: '(สายงานวิกฤต)' };
TRL.ja_JP = { info_cost_title: 'コスト差異', info_cost_records: '· 記録より', info_match_one: '件一致', info_match_many: '件一致',
  info_planned: '計画', info_phase: 'フェーズ', info_project: 'プロジェクト', info_view_moment: '⏱ この時点で見る',
  info_4d_title: '施工期間', info_4d_unassigned: '「{name}」の日付付きタスクにまだ割り当てられていません。',
  info_4d_sched_tip: 'この期間の出典となる工程表', info_4d_task: 'タスク', info_4d_window: '期間', info_4d_trade: '職種',
  info_4d_float: 'フロート', info_4d_critical: '（クリティカルパス）' };
TRL.ko_KR = { info_cost_title: '원가 차이', info_cost_records: '· 기록 기준', info_match_one: '건 일치', info_match_many: '건 일치',
  info_planned: '계획', info_phase: '단계', info_project: '프로젝트', info_view_moment: '⏱ 이 시점에서 보기',
  info_4d_title: '시공 기간', info_4d_unassigned: '"{name}"의 날짜가 정해진 작업에 아직 배정되지 않았습니다.',
  info_4d_sched_tip: '이 기간이 나온 공정표', info_4d_task: '작업', info_4d_window: '기간', info_4d_trade: '공종',
  info_4d_float: '여유 시간', info_4d_critical: '(주공정)' };
TRL.ar_SA = { info_cost_title: 'انحراف التكلفة', info_cost_records: '· من السجلات', info_match_one: 'تطابق', info_match_many: 'تطابقات',
  info_planned: 'مخطط', info_phase: 'المرحلة', info_project: 'المشروع', info_view_moment: '⏱ اعرض في هذه اللحظة',
  info_4d_title: 'نافذة الإنشاء', info_4d_unassigned: 'لم يُسند بعد إلى مهمة مؤرخة في "{name}".',
  info_4d_sched_tip: 'الجدول الذي جاءت منه هذه النافذة', info_4d_task: 'المهمة', info_4d_window: 'النافذة', info_4d_trade: 'الحرفة',
  info_4d_float: 'الفائض الزمني', info_4d_critical: '(المسار الحرج)' };
TRL.pt_BR = { info_cost_title: 'Variação de custo', info_cost_records: '· pelos registros', info_match_one: 'correspondência', info_match_many: 'correspondências',
  info_planned: 'previsto', info_phase: 'Fase', info_project: 'Projeto', info_view_moment: '⏱ Ver neste momento',
  info_4d_title: 'Janela de construção', info_4d_unassigned: 'Ainda não atribuído a uma tarefa com data em "{name}".',
  info_4d_sched_tip: 'De qual cronograma vem esta janela', info_4d_task: 'Tarefa', info_4d_window: 'Janela', info_4d_trade: 'Ofício',
  info_4d_float: 'Folga', info_4d_critical: '(caminho crítico)' };
TRL.id_ID = { info_cost_title: 'Selisih biaya', info_cost_records: '· dari catatan', info_match_one: 'kecocokan', info_match_many: 'kecocokan',
  info_planned: 'direncanakan', info_phase: 'Fase', info_project: 'Proyek', info_view_moment: '⏱ Lihat pada saat ini',
  info_4d_title: 'Jendela konstruksi', info_4d_unassigned: 'Belum ditugaskan ke tugas bertanggal di "{name}".',
  info_4d_sched_tip: 'Jadwal asal jendela ini', info_4d_task: 'Tugas', info_4d_window: 'Jendela', info_4d_trade: 'Bidang kerja',
  info_4d_float: 'Float', info_4d_critical: '(jalur kritis)' };
TRL.bn_BD = { info_cost_title: 'খরচের পার্থক্য', info_cost_records: '· রেকর্ড থেকে', info_match_one: 'মিল', info_match_many: 'মিল',
  info_planned: 'পরিকল্পিত', info_phase: 'পর্যায়', info_project: 'প্রকল্প', info_view_moment: '⏱ এই মুহূর্তে দেখুন',
  info_4d_title: 'নির্মাণের সময়সীমা', info_4d_unassigned: '"{name}"-এ এখনও কোনো তারিখযুক্ত কাজে বরাদ্দ হয়নি।',
  info_4d_sched_tip: 'এই সময়সীমা কোন সময়সূচি থেকে এসেছে', info_4d_task: 'কাজ', info_4d_window: 'সময়সীমা', info_4d_trade: 'পেশা',
  info_4d_float: 'ফ্লোট', info_4d_critical: '(ক্রিটিক্যাল পাথ)' };
TRL.bl_BD = { info_cost_title: 'Khoroch-er parthokko', info_cost_records: '· record theke', info_match_one: 'mil', info_match_many: 'mil',
  info_planned: 'porikolpito', info_phase: 'Porjay', info_project: 'Prokolpo', info_view_moment: '⏱ Ei muhurte dekhun',
  info_4d_title: 'Nirman-er shomoyshima', info_4d_unassigned: '"{name}"-e ekhono kono tarikh-joukto kaje boraddo hoyni.',
  info_4d_sched_tip: 'Ei shomoyshima kon schedule theke esheche', info_4d_task: 'Kaj', info_4d_window: 'Shomoyshima', info_4d_trade: 'Pesha',
  info_4d_float: 'Float', info_4d_critical: '(critical path)' };
TRL.af_ZA = { info_cost_title: 'Kosteafwyking', info_cost_records: '· uit die rekords', info_match_one: 'treffer', info_match_many: 'treffers',
  info_planned: 'beplan', info_phase: 'Fase', info_project: 'Projek', info_view_moment: '⏱ Kyk op hierdie oomblik',
  info_4d_title: 'Konstruksievenster', info_4d_unassigned: 'Nog nie aan ’n gedateerde taak in "{name}" toegeken nie.',
  info_4d_sched_tip: 'Uit watter skedule hierdie venster kom', info_4d_task: 'Taak', info_4d_window: 'Venster', info_4d_trade: 'Ambag',
  info_4d_float: 'Speling', info_4d_critical: '(kritieke pad)' };

module.exports = { LABEL: 'machine (Claude, Anthropic, 2026-10-04) — viewer/tools/trl_batch_2026-10-04_info.js', NEW, TRL };
