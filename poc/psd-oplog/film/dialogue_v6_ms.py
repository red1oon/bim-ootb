# ⚠ DO NOT REMOVE — Scope: the OplogPic v6 MALAY dialogue (voices F, M), same rows, cues and sources as dialogue_v6.py (English); only the spoken text is Malay. Read the fit log (§NARR_FIT) after every run.
# Rules kept: no claim about another editor except what its own page / manual says; no phone number; no "first". Unreviewed by a native speaker.
# usage: python3 dialogue_v6_ms.py > dialogue_v6_ms.tsv     (rows: id, cue, end, source, SHORT, DETAIL)
import json, os
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v6'); W = json.load(open(os.environ.get('TIMELINE', V + '/timeline.json')))['windows']
R = [
 ('cover', 'cover card: OplogPic (working name)', 'F: OplogPic.', 'F: OplogPic. | M: Penyunting foto dengan sejarah.'),
 ('c1', 'card 1; op-log design; offline reload verified on the live build 2026-10-11', 'M: Setiap suntingan ialah satu baris log.', 'F: Apa bezanya? | M: Setiap suntingan ialah satu baris dalam log. Gambar ialah main semula log itu. Tanpa pelayan, tanpa pemasangan.'),
 ('c2', 'chapter card 2: the finished file', 'M: Sebuah fail siap.', 'M: Ini sebuah fail yang siap.'),
 ('T1', 'layers panel names: Text, Paint, Balloon, Clouds, Background', 'M: Lima lapisan.', 'F: Apa di dalamnya? | M: Lima lapisan. Awan, belon, kapsyen, cat, dan latar belakang.'),
 ('T2', 'eye button on the caption layer, hide then show', 'M: Sembunyikan lapisan.', 'M: Sembunyikan lapisan. Papar semula.'),
 ('T3', 'Balloon moved below Clouds and back', 'M: Susun semula.', 'M: Susun semula. Belon di bawah awan, dan kembali.'),
 ('T4', 'opacity slider of the Clouds layer', 'M: Kelegapan.', 'M: Kelegapan, bagi setiap lapisan.'),
 ('T5', 'blend mode list on screen (10 options)', 'M: Sepuluh.', 'F: Mod adunan? | M: Sepuluh.'),
 ('T6', 'tool bar: Hard Soft Smudge Erase Blur Select Wand Move Pick; wand bar and move bar shown', 'M: Berus, dan tongkat sakti.', 'M: Berus, calit, kabur dan pemadam. Pilihan, tongkat sakti dan alat alih. | F: Dan bar itu? | M: Tongkat sakti ada toleransi, alat alih ada skala.'),
 ('T7', 'one coral stroke on the Paint layer; counter 22 -> 23 ops', 'M: Satu sapuan, satu entri.', 'F: Dan melukis? | M: Satu sapuan ialah satu entri dalam log.'),
 ('T8', 'Advanced ticked: mask and adjustment controls; Add text panel', 'M: Topeng, pelarasan, teks.', 'F: Apa di bawah Lanjutan? | M: Topeng, pelarasan, kumpulan. Teks pun satu lapisan, dengan bayang pilihan.'),
 ('c3', 'chapter card 3', 'M: Sejarah ialah failnya.', 'M: Sejarah ialah failnya.'),
 ('H1', 'History list in the side panel', 'M: Di sini.', 'F: Di mana sejarahnya? | M: Di sini.'),
 ('H2', 'tap an old entry: preview', 'M: Ketik mana-mana langkah.', 'M: Ketik mana-mana langkah, dan gambar kembali seperti ketika itu.'),
 ('H3', 'Back to now button', 'M: Kembali ke kini.', 'M: Kembali ke kini.'),
 ('H4', 'Undo x3, Redo x3; reopen + undo = suite editor_ckpt (desktop Chrome only)', 'M: Buat asal, dan buat semula.', 'M: Buat asal, tiga kali. Buat semula, tiga kali. Setiap langkah tepat. | F: Selepas tab ditutup pun? | M: Buka semula, dan buat asal masih berfungsi.'),
 ('H5', 'Show raw entries: log lines 39 B, 48 B, 77 B', 'M: Satu baris setiap suntingan.', 'M: Atau baca log mentah. Satu baris setiap suntingan, beberapa puluh bait.'),
 ('H6', 'Verify replays the log from scratch and compares', 'M: Sahkan menyemaknya.', 'F: Boleh dipercayai? | M: Sahkan memainkan semula seluruh log dari awal, dan menyemak gambar sepadan.'),
 ('c4', 'chapter card 4', 'M: Dua suntingan.', 'M: Dua suntingan.'),
 ('E1', 'Balloon layer selected, Move tool, Scale bar', 'M: Alat alih.', 'M: Pilih lapisan belon, dan alat alih.'),
 ('S2', 'splice: scale 125 %; top row 0 -> 469 balloon pixels', 'M: Bahagian atas terkeluar.', 'M: Besarkan, dan bahagian atas terkeluar dari bingkai. Lapisan masih menyimpan semuanya.'),
 ('S3', 'splice: scale 75 %; top row back to 0; nothing logged', 'M: Kecilkan, dan ia kembali.', 'M: Kecilkan, dan ia kembali. Tiada apa dibuang sehingga anda memohon.'),
 ('E2', 'drag + scale 75 % + Apply: xform s 750, dx -90, dy 40', 'M: Letak, dan mohon.', 'M: Sekarang letakkannya. Seret, skala tujuh puluh lima peratus, mohon. Potongan langitnya turut berpindah.'),
 ('E3', 'Add adjustment menu: Hue / Saturation', 'M: Rona dan ketepuan.', 'M: Tambah pelarasan rona dan ketepuan.'),
 ('E4', 'Wand tool, tolerance 12, tap one yellow panel, Grow', 'M: Satu panel.', 'F: Bahagian mana? | M: Satu panel. Tongkat sakti memilihnya dengan satu ketikan, pada toleransi dua belas.'),
 ('E5', 'Feather 2, Mask from selection on the adjustment row', 'M: Lembutkan, dan topeng.', 'M: Lembutkan tepinya, dan topengkan perubahan itu padanya.'),
 ('E6', 'Hue dragged to +150 then -90; adjustments re-editable; admask suite', 'M: Ia kekal tetapan hidup.', 'M: Putar rona. Putar lagi. Tetapan hidup. | F: Boleh diubah kemudian? | M: Boleh, dengan topengnya.'),
 ('c5', 'cost card: measure_ram.js: 508-509 MB loaded vs 213 MB empty; own arrays 112.0 MB; phone NOT measured', 'M: Setengah gigabait pada komputer riba. Telefon: belum diukur.', 'F: Dan kosnya? | M: Pada komputer riba, kira-kira setengah gigabait untuk fail ini. Seratus dua belas megabait ialah data lapisan kami. | M: Telefon belum diukur. Itulah hala tuju seterusnya.'),
 ('end', 'prior-art card: Photopea own page, miniPaint README, GIMP manual (verified 2026-10-12)', 'M: Kami tidak mendakwa yang pertama.', 'M: Seni terdahulu. Photopea dan miniPaint sudah menjalankan penyunting berlapis dalam pelayar. Kami tidak mendakwa yang pertama. | F: Jadi apa yang ditunjukkan? | M: Satu perkara. Fail yang disimpan ialah sejarah suntingannya.'),
]
for i, src, short, det in R:
    a, b = W[i]; print('\t'.join([i, '%.2f' % a, '%.2f' % b, src, short, det]))
