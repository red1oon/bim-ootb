// ms_MY — machine translation (Claude, Anthropic, 2026-10-03), NOT from a published iDempiere pack. See trl_batch_2026-10-03.js.
'use strict';
module.exports = { ms_MY: {
  // gap fills (same word in Malay where listed as such — affirmed, trl="Y")
  h_item: 'Item', h_status: 'Status', ui_walk_set: 'TETAPKAN', ui_bearing: 'Arah', ui_vo_parameter: 'Parameter', landing_step_import: 'Import',
  ui_no_db_arch: 'Tiada DB untuk arketip: {name}',
  // landing
  landing_tip_red: 'Merah — anda masuk (bunyi hidup, kemudian kami muatkan)', landing_tip_blue: 'Biru — tiada apa berlaku, tiada apa dimuatkan',
  landing_blue_quote: '"Anda ambil pil biru — cerita tamat, anda terjaga di katil dan percaya apa sahaja yang anda mahu percaya."',
  landing_back: '← kembali', landing_choose_door: 'pilih pintu anda', landing_stats_title: 'Statistik trafik laman (GoatCounter)',
  landing_hub_title: 'BANGUNAN & IFC', landing_hub_sub: 'lepaskan IFC anda sendiri, atau buka bangunan sedia ada — dibuka dalam pemapar',
  landing_launcher_gps: 'Bangunan / IFC', landing_launcher_bonsai: 'Pemodel BIM', landing_launcher_erp: 'ERP', landing_launcher_doc: 'Panduan Pengguna',
  landing_launcher_watch: 'Tonton demo', landing_launcher_clear: 'Kosongkan cache', landing_more: 'Lagi',
  landing_mobile_note: 'Pemodelan BIM (DAGeVu) adalah pengalaman desktop — buka pada skrin yang lebih besar.',
  landing_drop_hint: '↓ Lepaskan fail IFC / 3D di sini — atau ketik untuk melayari', landing_drop_sub: 'beberapa fail disiplin digabungkan menjadi satu bangunan',
  landing_blank_viewer: 'Pemapar Kosong', landing_open_own_db: 'Buka fail .db anda sendiri', landing_loading_manifest: 'memuatkan manifes bangunan…',
  landing_city_buildings: 'Bangunan bandar', landing_landmark_buildings: 'Bangunan mercu tanda', landing_elements: 'elemen', landing_reload: 'muat semula',
  landing_no_db_for: 'Tiada DB untuk {name}',
  landing_clear_confirm: 'Tetapkan semula ke skrin mula?\n\nMemadam data bangunan dalam pelayar:\n  • bangunan dalam cache\n  • mana-mana adegan IFC yang anda lepaskan (tidak disimpan sebagai fail .db)\ndan membawa anda kembali ke pilihan merah / biru.\n\nKekal: aplikasi yang dipasang + data luar talian, dan mana-mana .db yang anda simpan sendiri.',
  // viewer.html
  ui_grid_bays: 'Ruang Grid', ui_share: 'Kongsi', ui_tt_minmax: 'Min/Maks', ui_tt_menu: 'Menu', ui_tt_prev_phase: 'Fasa sebelumnya', ui_tt_next_phase: 'Fasa seterusnya',
  ui_tt_bookmark_add: 'Tanda kedudukan keratan ini', ui_tt_bookmark_del: 'Buang penanda', ui_update_ready: 'Kemas kini sedia — ketik untuk muat semula', ui_report_bug: 'Lapor Pepijat',
  // pill
  pill_save: 'Simpan Bangunan', pill_open: 'Buka Bangunan', pill_find: 'Cari / Navigasi', pill_rolefilter: 'Paparan Peranan', pill_help: 'Bantuan',
  pill_worldhist: 'Sejarah Dunia', pill_dochist: 'Sejarah Halaman', pill_walk: 'Jalan', pill_whwalk: 'Laluan Kutipan', pill_share: 'Kongsi', pill_hbafm: 'Manusia-Aset',
  pill_measure: 'Ukur', pill_clash: 'Matriks Pertembungan', pill_sanity: 'Semakan Waras', pill_egress: 'Laluan Keluar', pill_xray: 'X-Ray / Bbox', pill_bbox: 'Kotak Sempadan',
  pill_tm: 'Mesin Masa', pill_sched4d: 'Tetingkap 4D', pill_sched4d_gen: 'Tetingkap 4D — ketik untuk menjana jadual', pill_section: 'Keratan Rentas',
  pill_background: 'Latar Belakang', pill_night: 'Malam', pill_palette: 'Palet', pill_shadow: 'Bayang + Tanah', pill_fly: 'Lawatan Terbang', pill_dlodnav: 'LOD navigasi (bangunan besar)',
  pill_report: '4D / 5D', pill_issues: 'Isu', pill_fullscreen: 'Skrin Penuh', pill_precision: 'Ketepatan (Halus)', pill_cam_reset: 'Set Semula Kamera', pill_cam_pivot: 'Pangsi Auto',
  pill_home: 'Laman Utama', pill_audio: 'Kesan Bunyi', pill_settings: 'Tetapan', pill_navigate: 'Navigasi', pill_inspect: 'Periksa', pill_camview: 'Kamera / Paparan',
  // roles, settings, ground
  role_plumber: 'Tukang Paip', role_electrician: 'Juruelektrik', role_acmv: 'Juruteknik ACMV', role_structural: 'Struktur', role_cleaner: 'Pembersih',
  ui_rate_pack_5d: 'Pek Kadar 5D', ui_cache_info: 'Maklumat Cache', ui_reset_pill_icons: 'Set Semula Ikon Pil', ui_defaults_restored: 'Lalai dipulihkan',
  ui_tt_shadow_ground_cycle: 'Bayang + Tanah — kitaran Mati → Tanah → Rumput → Berturap', ui_ground_none: 'Tiada', ui_ground_grass: 'Rumput', ui_ground_earth: 'Tanah', ui_ground_paved: 'Berturap',
  ui_blank_scene_hint: 'Adegan kosong — tekan Ctrl+O (Buka Bangunan) untuk memuatkan fail .db', ui_locale_toast_hint: 'tukar di ⚙',
  ui_hist_title: 'Sejarah — merentas halaman', ui_hist_whole: 'Keseluruhan', ui_hist_this_page: 'Halaman ini', ui_close: 'Tutup',
  ui_tt_precision_fine: 'Ketepatan halus', ui_tt_reset_camera: 'Set semula kamera', ui_tt_auto_pivot: 'Pangsi auto pada pusat adegan',
  ui_tt_still_refine: 'Perhalus Imej Pegun (Alt+S)', ui_tt_populate: 'Isi Penghuni (Alt+P)', ui_tt_maxq: 'Filem MaxQ (Alt+C — tekan lagi untuk batal)',
  ui_tt_tm: 'Mesin Masa', ui_tt_find: 'Cari', ui_tt_share: 'Kongsi', ui_tt_help: 'Bantuan', ui_tt_clash: 'Matriks Pertembungan', ui_tt_sunglass: 'Studio Warna', ui_tt_night: 'Malam',
  ui_tt_shadow: 'Bayang', ui_tt_bg: 'Latar Belakang', ui_tt_bbox: 'Kotak Sempadan', ui_tt_cinema: 'Orbit Sinema', ui_tt_doc: 'Dokumen', ui_tt_grid: 'Grid', ui_tt_table: 'Jadual',
  ui_tt_next: 'Fasa Seterusnya', ui_tt_save: 'Simpan Reka Bentuk', ui_tt_open: 'Buka Reka Bentuk', ui_tt_mep: 'Laluan MEP', ui_tt_ubbl: 'Pematuhan UBBL', ui_tt_rosetta: 'Batu Rosetta',
  ui_tt_disc: 'Disiplin', ui_sun: 'Keamatan matahari', ui_exposure: 'Pendedahan', ui_ambient: 'Ambien', ui_hemisphere: 'Hemisfera',
  ui_all: 'Semua', ui_off: 'Mati', ui_night_on: 'Hidup — {n} lampu',
  // find / main
  ui_find_tab_find: 'Cari', ui_find_tab_ask: 'Tanya', ui_save_xlsx: 'Simpan .xlsx', ui_all_types: 'Semua Jenis', ui_view_back: 'Paparan sebelumnya', ui_view_forward: 'Paparan seterusnya',
  ui_expand: 'Kembangkan', ui_voice_unsupported: 'Suara tidak disokong', ui_loading_find: 'Memuatkan Cari…', ui_find_load_failed: 'Cari gagal dimuatkan',
  ui_gpu_compiling: 'Menyusun shader GPU — sila tunggu...', ui_gpu_compiled: 'Shader GPU disusun dalam {ms}ms — memaparkan', ui_offline_badge: 'LUAR TALIAN',
  // reports
  title_boq: 'BIM OOTB — Analitik 4D/5D', title_clash: 'BIM OOTB — Laporan Penyelarasan Pertembungan', title_mep: 'BIM OOTB — Senarai Kuantiti MEP',
  t_analytics_4d5d: 'Analitik 4D/5D', ui_tt_export_5d: '5D — Excel Kos', ui_tt_export_4d: '4D — Excel Jadual', ui_tt_mep_boq: 'Senarai Kuantiti MEP',
  ui_tt_copy_link: 'Salin pautan kongsi', ui_tt_change_locale_cur: 'Tukar bahasa / mata wang', ui_tt_change_locale: 'Tukar bahasa', ui_loading_ellipsis: 'Memuatkan...',
  ui_requesting_viewer: 'Meminta data daripada pemapar...', ui_waiting_db_cache: 'Menunggu DB dicache dalam adegan utama...', ui_loading_url: 'Memuatkan {url}...',
  t_site_resources: 'Sumber Tapak', t_boq_5d: '5D — Senarai Kuantiti',
  clash_report_title: 'Laporan Penyelarasan Pertembungan', ui_tt_home: 'Laman Utama', ui_report_downloaded: 'Laporan Dimuat Turun',
  ui_report_downloaded_body: 'Fail HTML disimpan. Kongsi melalui WhatsApp, e-mel atau apa-apa medium.<br>Penerima membukanya dalam mana-mana pelayar — carta penuh, tiada persediaan diperlukan.',
  ui_ok: 'OK', clash_total: 'Jumlah Pertembungan', clash_reviewed: 'Disemak', clash_resolved: 'Diselesaikan', clash_accepted: 'Diterima',
  clash_tt_total: 'Jumlah pertindihan bbox yang dikesan merentas semua pasangan disiplin', clash_tt_reviewed: 'Pertembungan yang diakui sedang disiasat',
  clash_tt_resolved: 'Pertembungan dibaiki dalam model — sedia untuk semakan semula', clash_tt_accepted: 'Risiko diterima — tiada perubahan reka bentuk diperlukan',
  clash_by_pair: 'Mengikut Pasangan Disiplin', clash_risk_profile: 'Profil Risiko Disiplin', clash_by_severity: 'Mengikut Keterukan', clash_by_status: 'Mengikut Status',
  clash_top_offenders: 'Punca Utama — Baiki Ini Dahulu', clash_by_class: 'Mengikut Kelas Elemen', clash_matrix_summary: 'Ringkasan Matriks Disiplin',
  clash_source: 'Sumber', clash_target: 'Sasaran', clash_tolerance: 'Toleransi', clash_clashes: 'Pertembungan', clash_clashes_lbl: 'pertembungan'
} };
