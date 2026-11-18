// trl_batch_2026-11-18_export_menu_b2.js — the words of the two rows step (b2) adds to the Viewer Export menu: Schedule (MSP / PMXML / XER) and 5D cost (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §(b2)).
// ui_exp_sched / ui_exp_sched_tip / ui_exp_sched_none / ui_exp_5d / ui_exp_5d_tip are read by viewer/export_menu.js; pillc_export_4 / _5 are the Help sub-rows of the Export pill (panels.js children 4 and 5).
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-18_export_menu_b2.js`, then build_trl.js, then the help builds (see the (b2) RESULT).
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-18 — NOT from a published iDempiere language pack; NOT reviewed by speakers.
// en_US/en_GB/en_AU: none (the English is the text). Kept as the product's tokens: MS Project, Primavera P6, MSP, PMXML, XER, 5D, Excel, .xlsx, BIM, Time Machine (the pill's own name is a dictionary row elsewhere; here it stays the English product word in every locale).
'use strict';
const KEYS = ['ui_exp_sched', 'ui_exp_sched_tip', 'ui_exp_sched_none', 'ui_exp_5d', 'ui_exp_5d_tip', 'pillc_export_4', 'pillc_export_5'];
const EN = ['Schedule', 'the building\'s work schedule, for MS Project or Primavera P6', 'open the Time Machine once to make the schedule', '5D cost', 'cost workbook (Excel): bill of quantities, materials, labour, equipment',
  'Schedule (MSP / PMXML / XER): the work schedule for MS Project or Primavera P6, greyed until the Time Machine has made one', '5D cost: a cost workbook (.xlsx) from the 4D/5D page'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Jadual', 'jadual kerja bangunan, untuk MS Project atau Primavera P6', 'buka Time Machine sekali untuk menghasilkan jadual', 'Kos 5D', 'buku kerja kos (Excel): bil kuantiti, bahan, buruh, peralatan',
    'Jadual (MSP / PMXML / XER): jadual kerja untuk MS Project atau Primavera P6, kelabu sehingga Time Machine menghasilkannya', 'Kos 5D: buku kerja kos (.xlsx) dari halaman 4D/5D'],
  de_DE: ['Terminplan', 'der Bauablaufplan des Gebäudes, für MS Project oder Primavera P6', 'öffnen Sie einmal die Time Machine, um den Terminplan zu erstellen', '5D-Kosten', 'Kostenarbeitsmappe (Excel): Leistungsverzeichnis, Material, Arbeit, Geräte',
    'Terminplan (MSP / PMXML / XER): der Bauablaufplan für MS Project oder Primavera P6, ausgegraut bis die Time Machine einen erstellt hat', '5D-Kosten: eine Kostenarbeitsmappe (.xlsx) von der 4D/5D-Seite'],
  fr_FR: ['Planning', 'le planning des travaux du bâtiment, pour MS Project ou Primavera P6', 'ouvrez une fois la Time Machine pour créer le planning', 'Coût 5D', 'classeur des coûts (Excel) : bordereau des quantités, matériaux, main-d\'œuvre, équipements',
    'Planning (MSP / PMXML / XER) : le planning des travaux pour MS Project ou Primavera P6, grisé tant que la Time Machine n\'en a pas créé un', 'Coût 5D : un classeur des coûts (.xlsx) depuis la page 4D/5D'],
  es_ES: ['Cronograma', 'el cronograma de obra del edificio, para MS Project o Primavera P6', 'abra una vez la Time Machine para crear el cronograma', 'Coste 5D', 'libro de costes (Excel): mediciones, materiales, mano de obra, equipos',
    'Cronograma (MSP / PMXML / XER): el cronograma de obra para MS Project o Primavera P6, en gris hasta que la Time Machine cree uno', 'Coste 5D: un libro de costes (.xlsx) desde la página 4D/5D'],
  zh_CN: ['进度计划', '建筑的施工进度计划，供 MS Project 或 Primavera P6 使用', '先打开一次 Time Machine 以生成进度计划', '5D 成本', '成本工作簿（Excel）：工程量清单、材料、人工、设备',
    '进度计划（MSP / PMXML / XER）：供 MS Project 或 Primavera P6 使用的施工进度计划，Time Machine 生成之前为灰色', '5D 成本：来自 4D/5D 页面的成本工作簿 (.xlsx)'],
  th_TH: ['กำหนดการ', 'กำหนดการก่อสร้างของอาคาร สำหรับ MS Project หรือ Primavera P6', 'เปิด Time Machine หนึ่งครั้งเพื่อสร้างกำหนดการ', 'ต้นทุน 5D', 'สมุดงานต้นทุน (Excel): ใบแสดงปริมาณงาน วัสดุ แรงงาน อุปกรณ์',
    'กำหนดการ (MSP / PMXML / XER): กำหนดการก่อสร้างสำหรับ MS Project หรือ Primavera P6 เป็นสีเทาจนกว่า Time Machine จะสร้างขึ้น', 'ต้นทุน 5D: สมุดงานต้นทุน (.xlsx) จากหน้า 4D/5D'],
  ja_JP: ['工程表', '建物の施工工程表（MS Project または Primavera P6 用）', 'Time Machine を一度開いて工程表を作成してください', '5D コスト', 'コストのブック（Excel）：数量明細、材料、労務、機械',
    '工程表（MSP / PMXML / XER）：MS Project または Primavera P6 用の施工工程表、Time Machine が作成するまでグレー表示', '5D コスト：4D/5D ページからのコストのブック (.xlsx)'],
  ko_KR: ['공정표', '건물의 시공 공정표 (MS Project 또는 Primavera P6용)', 'Time Machine을 한 번 열어 공정표를 만드세요', '5D 비용', '비용 통합 문서 (Excel): 수량 내역서, 자재, 노무, 장비',
    '공정표 (MSP / PMXML / XER): MS Project 또는 Primavera P6용 시공 공정표, Time Machine이 만들기 전까지 회색', '5D 비용: 4D/5D 페이지의 비용 통합 문서 (.xlsx)'],
  ar_SA: ['الجدول الزمني', 'الجدول الزمني لأعمال المبنى، لبرنامج MS Project أو Primavera P6', 'افتح Time Machine مرة واحدة لإنشاء الجدول الزمني', 'تكلفة 5D', 'مصنّف التكلفة (Excel): جدول الكميات والمواد والعمالة والمعدات',
    'الجدول الزمني (MSP / PMXML / XER): الجدول الزمني للأعمال لبرنامج MS Project أو Primavera P6، معطّل حتى ينشئه Time Machine', 'تكلفة 5D: مصنّف تكلفة (.xlsx) من صفحة 4D/5D'],
  pt_BR: ['Cronograma', 'o cronograma de obra do edifício, para MS Project ou Primavera P6', 'abra o Time Machine uma vez para criar o cronograma', 'Custo 5D', 'planilha de custos (Excel): quantitativos, materiais, mão de obra, equipamentos',
    'Cronograma (MSP / PMXML / XER): o cronograma de obra para MS Project ou Primavera P6, cinza até o Time Machine criar um', 'Custo 5D: uma planilha de custos (.xlsx) da página 4D/5D'],
  id_ID: ['Jadwal', 'jadwal kerja bangunan, untuk MS Project atau Primavera P6', 'buka Time Machine sekali untuk membuat jadwal', 'Biaya 5D', 'buku kerja biaya (Excel): daftar kuantitas, material, tenaga kerja, peralatan',
    'Jadwal (MSP / PMXML / XER): jadwal kerja untuk MS Project atau Primavera P6, abu-abu sampai Time Machine membuatnya', 'Biaya 5D: buku kerja biaya (.xlsx) dari halaman 4D/5D'],
  bn_BD: ['সময়সূচি', 'ভবনের কাজের সময়সূচি, MS Project বা Primavera P6 এর জন্য', 'সময়সূচি তৈরি করতে একবার Time Machine খুলুন', '5D খরচ', 'খরচের ওয়ার্কবুক (Excel): পরিমাণের তালিকা, উপকরণ, শ্রম, যন্ত্রপাতি',
    'সময়সূচি (MSP / PMXML / XER): MS Project বা Primavera P6 এর জন্য কাজের সময়সূচি, Time Machine তৈরি না করা পর্যন্ত ধূসর', '5D খরচ: 4D/5D পাতা থেকে খরচের ওয়ার্কবুক (.xlsx)'],
  bl_BD: ['Shomoyshuchi', 'bhoboner kajer shomoyshuchi, MS Project ba Primavera P6-er jonno', 'shomoyshuchi toiri korte ekbar Time Machine kholun', '5D khoroch', 'khorocher workbook (Excel): poriman talika, upokoron, shrom, jantropati',
    'Shomoyshuchi (MSP / PMXML / XER): MS Project ba Primavera P6-er jonno kajer shomoyshuchi, Time Machine toiri na kora porjonto dhushor', '5D khoroch: 4D/5D page theke khorocher workbook (.xlsx)'],
  af_ZA: ['Skedule', 'die gebou se werkskedule, vir MS Project of Primavera P6', 'maak die Time Machine een keer oop om die skedule te skep', '5D-koste', 'kostewerkboek (Excel): hoeveelhedelys, materiaal, arbeid, toerusting',
    'Skedule (MSP / PMXML / XER): die werkskedule vir MS Project of Primavera P6, grys totdat die Time Machine een geskep het', '5D-koste: \'n kostewerkboek (.xlsx) vanaf die 4D/5D-bladsy'],
};
Object.keys(T).forEach((l) => { if (T[l].length !== KEYS.length) throw new Error(l + ' has ' + T[l].length + ' texts, want ' + KEYS.length); });
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-18), the Viewer Export menu Schedule + 5D cost rows — viewer/tools/trl_batch_2026-11-18_export_menu_b2.js';
module.exports = { NEW, TRL, LABEL };
