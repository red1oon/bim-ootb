// trl_batch_2026-11-17_modeller_guide_titles.js — the eight guide SECTION TITLES (six named by the leak witness, two more found by W-MODELLER-GUIDE-TITLES: 3D Grid, Save / Export) the Modeller's help panel (bim-ootb #3171) shows and the dictionary lacked
// (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §14.5.1). The Modeller translates by the exact English on screen (__TRL_DICT_PAGE), so these rows are the whole change.
// Applied ONCE by `node viewer/tools/trl_add_batch.js viewer/tools/trl_batch_2026-11-17_modeller_guide_titles.js`, then build_trl.js. After that the XML is the source.
// PROVENANCE: MACHINE translations by Claude (Anthropic), 2026-11-17 — NOT from a published iDempiere language pack. en_US/en_GB/en_AU: none (the English is the text).
// Terms kept as the product's own tokens, not translated: ARC (the discipline code), Disc, walker. Where the dictionary already translates a word the same way is not checked per row — review by speakers is NOT done.
'use strict';
const KEYS = ['mdl_m_guide_title_2d', 'mdl_m_guide_title_outliner', 'mdl_m_guide_title_walker', 'mdl_m_guide_title_conformity', 'mdl_m_guide_title_author', 'mdl_m_guide_title_move', 'mdl_m_guide_title_3dgrid', 'mdl_m_guide_title_export'];
const EN = ['2D drawings → model', 'Outliner — ARC leads, ONE Disc tab', 'Disc = walker', 'Conformity Gate', 'Author', 'Move & Manipulate', '3D Grid', 'Save / Export'];
const NEW = {}; KEYS.forEach((k, i) => { NEW[k] = { en: EN[i] }; });
const T = {
  ms_MY: ['Lukisan 2D → model', 'Outliner — ARC mendahului, SATU tab Disc', 'Disc = walker', 'Gerbang Pematuhan', 'Cipta', 'Alih & Manipulasi', 'Grid 3D', 'Simpan / Eksport'],
  de_DE: ['2D-Zeichnungen → Modell', 'Outliner — ARC führt, EIN Gewerk-Reiter', 'Gewerk = Walker', 'Konformitäts-Gate', 'Erstellen', 'Verschieben & Bearbeiten', '3D-Raster', 'Speichern / Exportieren'],
  fr_FR: ['Dessins 2D → modèle', 'Explorateur — ARC en tête, UN seul onglet Disc', 'Disc = walker', 'Porte de conformité', 'Créer', 'Déplacer et manipuler', 'Grille 3D', 'Enregistrer / Exporter'],
  es_ES: ['Planos 2D → modelo', 'Esquema — ARC primero, UNA sola pestaña Disc', 'Disc = walker', 'Puerta de conformidad', 'Crear', 'Mover y manipular', 'Cuadrícula 3D', 'Guardar / Exportar'],
  zh_CN: ['2D 图纸 → 模型', '大纲 — ARC 优先，仅一个 Disc 标签页', 'Disc = walker', '合规关卡', '创作', '移动与操作', '3D 网格', '保存 / 导出'],
  th_TH: ['แบบ 2D → โมเดล', 'Outliner — ARC นำ แท็บ Disc เพียงแท็บเดียว', 'Disc = walker', 'เกตตรวจสอบความสอดคล้อง', 'สร้าง', 'ย้ายและปรับแต่ง', 'กริด 3 มิติ', 'บันทึก / ส่งออก'],
  ja_JP: ['2D 図面 → モデル', 'アウトライナー — ARC が先頭、Disc タブは 1 つ', 'Disc = walker', '適合ゲート', '作成', '移動と操作', '3D グリッド', '保存 / エクスポート'],
  ko_KR: ['2D 도면 → 모델', '아웃라이너 — ARC 우선, Disc 탭은 하나', 'Disc = walker', '적합성 게이트', '작성', '이동 및 조작', '3D 그리드', '저장 / 내보내기'],
  ar_SA: ['رسومات 2D → النموذج', 'المخطط — ARC أولاً، تبويب Disc واحد', 'Disc = walker', 'بوابة المطابقة', 'إنشاء', 'نقل وتعديل', 'شبكة ثلاثية الأبعاد', 'حفظ / تصدير'],
  pt_BR: ['Desenhos 2D → modelo', 'Estrutura — ARC primeiro, UMA aba Disc', 'Disc = walker', 'Portão de conformidade', 'Criar', 'Mover e manipular', 'Grade 3D', 'Salvar / Exportar'],
  id_ID: ['Gambar 2D → model', 'Outliner — ARC memimpin, SATU tab Disc', 'Disc = walker', 'Gerbang Kesesuaian', 'Buat', 'Pindah & Manipulasi', 'Grid 3D', 'Simpan / Ekspor'],
  bn_BD: ['২ডি অঙ্কন → মডেল', 'আউটলাইনার — ARC আগে, একটিমাত্র Disc ট্যাব', 'Disc = walker', 'সামঞ্জস্য গেট', 'তৈরি', 'সরানো ও পরিচালনা', '৩ডি গ্রিড', 'সংরক্ষণ / রপ্তানি'],
  bl_BD: ['2D okkon → model', 'Outliner — ARC age, matro ekti Disc tab', 'Disc = walker', 'Samanjasya gate', 'Toiri', 'Sarano o porichalona', '3D grid', 'Songrokkhon / Roptani'],
  af_ZA: ['2D-tekeninge → model', 'Outliner — ARC voorop, EEN Disc-oortjie', 'Disc = walker', 'Konformiteitspoort', 'Skep', 'Skuif en manipuleer', '3D-rooster', 'Stoor / Voer uit']
};
const TRL = {}; Object.keys(T).forEach((l) => { TRL[l] = {}; KEYS.forEach((k, i) => { TRL[l][k] = T[l][i]; }); });
const LABEL = 'machine (Claude, Anthropic, 2026-11-17), Modeller guide section titles — viewer/tools/trl_batch_2026-11-17_modeller_guide_titles.js';
module.exports = { NEW, TRL, LABEL };
