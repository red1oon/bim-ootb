# ⚠ DO NOT REMOVE — Scope: the OplogPic v7 (design kit) MALAY dialogue (voices F, M), same rows, cues and sources as dialogue_v7.py (English); only the spoken text is Malay. Read the fit log (§NARR_FIT) after every run.
# Rules kept: no claim about another editor except what its own page / manual says (the prior-art row repeats the v6 Malay wording); no phone number; no "first". Numbers are read from the facts files. Unreviewed by a native speaker.
# usage: TIMELINE=~/Videos/oplogpic_v2_work/v7/timeline_ms.json python3 dialogue_v7_ms.py > dialogue_v7_ms.tsv     (rows: id, cue, end, source, SHORT, DETAIL)
import json, os, csv, re
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v7'); W = json.load(open(os.environ.get('TIMELINE', V + '/timeline_ms.json')))['windows']
def facts(t): return {r[0]: r[1] for r in list(csv.reader(open(f'{V}/{t}_facts.tsv'), delimiter='\t'))[1:]}
P, Q = facts('poster'), facts('qr')
U = 'kosong satu dua tiga empat lima enam tujuh lapan sembilan'.split()
def w(n):   # Malay number words (0..9999): seratus, seribu, dua puluh satu, sebelas, dua belas ...
    n = int(round(n))
    if n < 10: return U[n]
    if n == 10: return 'sepuluh'
    if n == 11: return 'sebelas'
    if n < 20: return U[n - 10] + ' belas'
    if n < 100: return U[n // 10] + ' puluh' + ('' if n % 10 == 0 else ' ' + U[n % 10])
    if n < 200: return 'seratus' + ('' if n == 100 else ' ' + w(n - 100))
    if n < 1000: return U[n // 100] + ' ratus' + ('' if n % 100 == 0 else ' ' + w(n % 100))
    if n < 2000: return 'seribu' + ('' if n == 1000 else ' ' + w(n - 1000))
    return str(n)
b = lambda k: int(P[k]); kb = lambda m: int(re.search(r'\((\d+) KB\)', m).group(1))
g1, g2, panel, shadow_b = b('gradient1_bytes'), b('gradient2_bytes'), b('panel_bytes'), b('shadow_bytes')
ver = re.search(r'Verified: (\d+) entries .*\((\d+) ms\)', P['verify_message']); n_ver, s_ver = int(ver.group(1)), round(int(ver.group(2)) / 1000)
save_kb, jpeg_kb, png_kb, qr_bytes = round(json.loads(P['save_last'])['bytes'] / 1024), kb(P['jpeg_msg']), kb(P['png_msg']), json.loads(Q['qr_info'])['bytes']
assert P['caption_entries'] == '2' and P['edit_text_entries'] == '2' and P['shadow_entries'] == '1' and P['page_errors'] == '0' and Q['page_errors'] == '0'
assert 'photos and captions' in P['poster_qr_message'] and P['poster_qr_overlay_hidden'] == 'true'
R = [
 ('cover', 'cover card: OplogPic (working name)', 'F: OplogPic.', 'F: OplogPic. | M: Sebuah poster, daripada kanvas kosong.'),
 ('c1', 'card 1; op-log design (HYPOTHESES Level 2i GD4, 2k SP4: one entry per drag)', 'M: Setiap seretan ialah satu baris log.', 'F: Apa yang kita buat? | M: Sebuah poster, daripada kanvas kosong. Setiap seretan ialah satu baris dalam log.'),
 ('P1', f'Gradient tool, one linear drag; entry of {g1} bytes (poster_facts gradient1_bytes)', 'M: Satu seretan, satu gradien.', f'M: Alat gradien. Satu seretan, dan latar siap. Itu satu entri, {w(g1)} bait.'),
 ('P2', f'Gradient tool, Radial and To clear; entry of {g2} bytes (gradient2_bytes)', 'M: Satu lagi, bersinar.', f'M: Seretan kedua, jejari, pudar hingga lut sinar. Cahaya yang hangat. {w(g2)} bait.'),
 ('P3', f'Add layer, Shape tool, Rounded, outline; panel entry {panel} bytes (panel_bytes); suite editor_shapes', 'M: Lapisan baharu, dan panel.', f'F: Dan bentuk? | M: Lapisan baharu, dan alat bentuk. Sebuah panel bulat, separuh lut sinar, dengan garis luar. {w(panel)} bait.'),
 ('P4', 'Ellipse and Line, poster_facts ellipse_bytes 104, line_bytes 111', 'M: Matahari, dan satu garisan.', 'M: Sebuah elips untuk matahari. Satu garisan sebagai pembahagi. Setiap satu ialah satu entri, kira-kira seratus bait.'),
 ('c2', 'card 2', 'M: Kata-kata yang boleh diubah.', 'M: Kata-kata yang boleh diubah.'),
 ('T1', 'Add text panel: title typed, size, outline, middle; caption_entries 2 (suite editor_textedit TE3)', 'M: Tambah teks.', 'M: Tambah teks. Sebuah tajuk, lebih besar, dengan garis luar, di tengah. Itu dua entri.'),
 ('T2', 'Edit text opens with the stored settings; Apply (edit_text_entries 2; TE3)', 'M: Sunting teks.', 'M: Sunting teks membukanya semula dengan tetapan yang sama. Kata baharu, saiz baharu. Mohon.'),
 ('T3', 'Undo twice then Redo twice (TE3: undo restores the previous pixels exactly, sha256)', 'M: Buat asal, dan tajuk lama kembali.', 'M: Buat asal dua kali, dan tajuk lama kembali, piksel demi piksel. Buat semula, dan yang baharu kembali.'),
 ('c3', 'card 3', 'M: Kabur yang hidup.', 'M: Kabur yang hidup.'),
 ('B1', 'Select tool, rectangle over the panel', 'M: Pilih kawasan panel.', 'M: Pilih kawasan panel.'),
 ('B2', 'Add adjustment, Gaussian blur, moved below the panel layer, mask from selection; suite editor_filters FL8, FL3', 'M: Kabur, di bawah panel.', 'M: Tambah lapisan kabur Gaussian. Alihkan ke bawah panel, dan hadkan kepada pilihan. Panel itu lut sinar, jadi kini ia kelihatan seperti kaca kabur.'),
 ('B3', 'Radius slider dragged; coarse preview while dragging, exact on release (HYPOTHESES FL9)', 'M: Seret jejari.', 'F: Perlahan? | M: Semasa menyeret, pratonton pantas dan kasar. Lepaskan, dan gambar yang tepat muncul. Satu seretan, satu entri.'),
 ('B4', f'Layer 2 selected, Effects, Drop shadow, Apply: one entry of {shadow_b} bytes (shadow_bytes; suite editor_fx FX4)', 'M: Dan bayang jatuh.', f'M: Kemudian bayang jatuh pada lapisan panel. Satu mohon, satu entri, {w(shadow_b)} bait.'),
 ('c4', 'card 4', 'M: Sejarah membuktikannya.', 'M: Sejarah membuktikannya.'),
 ('H1', 'the History list in the side panel (suite editor_history)', 'M: Seluruh poster, sebagai senarai.', 'M: Inilah seluruh poster, entri demi entri.'),
 ('H2', 'tap an early entry: preview (editor_history)', 'M: Ketik mana-mana langkah.', 'M: Ketik langkah awal, dan gambar kembali seperti ketika itu.'),
 ('H3', f'Back to now; Verify message "Verified: {n_ver} entries replay from scratch to the same picture" ({s_ver} s on this laptop; the dead time is sped up on purpose, build_v7.py)', 'M: Sahkan menyemaknya.', f'F: Boleh dipercayai? | M: Sahkan memainkan semula semua {w(n_ver)} entri dari awal dan menyemak gambar sama. Ia mengambil kira-kira {w(s_ver)} saat di sini.'),
 ('c5', 'card 5', 'M: Kod QR untuk dokumen kecil.', 'M: Kod QR untuk dokumen kecil.'),
 ('R1', f'qr take: a small document, one gradient, one ellipse (qr_facts small_entries {Q["small_entries"]})', 'M: Sebuah dokumen kecil.', 'M: Sebuah dokumen kecil. Satu gradien, satu bentuk.'),
 ('R2', f'Show QR: "{Q["qr_text"]}"; link design in history_ops.js; QR decoded by two independent decoders (Level 1m CF10); a real phone scan is NOT shown', 'M: Tunjuk QR.', f'M: Tunjuk QR. Pautannya membawa senarai suntingan, {w(qr_bytes)} bait. Telefon yang mengimbasnya membina semula gambar. Tiada pelayan.'),
 ('Q1', 'the poster (has a caption): Show QR says "' + P['poster_qr_message'] + '" (poster_qr_message; captions are pixel blobs, Level 1m)', 'M: Kapsyen terlalu besar.', 'M: Poster ini ada kapsyen, disimpan sebagai gambar. Terlalu besar untuk pautan.'),
 ('Q2', f'Save file: status "{P["save_status"]}" (save_status, save_last)', 'M: Simpan fail sebaliknya.', f'F: Jadi bagaimana saya memindahkannya? | M: Simpan fail. Satu fail dengan segalanya, {w(save_kb)} kilobait. Pada telefon ia membuka helaian kongsi.'),
 ('c6', 'card 6 (states: recorded on a local build)', 'M: Eksport.', 'M: Eksport.'),
 ('X1', f'Export image JPEG 512 px: "{P["jpeg_msg"]}" (jpeg_msg); suite editor_imgexport', 'M: JPEG, pada saiz pilihan anda.', f'M: Eksport imej. JPEG, pada saiz pilihan anda. Di sini, {w(jpeg_kb)} kilobait.'),
 ('X2', f'the same poster as PNG 512 px: "{P["png_msg"]}" (png_msg)', 'M: PNG lebih besar.', f'M: Sebagai PNG, {w(png_kb)} kilobait.'),
 ('end', 'prior-art card: Photopea own page, miniPaint README, GIMP manual (verified 2026-10-12; wording identical to the v6 Malay)', 'M: Kami tidak mendakwa yang pertama.', 'M: Seni terdahulu. Photopea dan miniPaint sudah menjalankan penyunting berlapis dalam pelayar. Kami tidak mendakwa yang pertama. | F: Jadi apa yang ditunjukkan? | M: Satu perkara. Fail yang disimpan ialah sejarah suntingannya.'),
]
cap = lambda t: re.sub(r'([.?!] )([a-z])', lambda m: m.group(1) + m.group(2).upper(), t)
for i, src, short, det in R:
    a, b2 = W[i]; print('\t'.join([i, '%.2f' % a, '%.2f' % b2, src, cap(short), cap(det)]))
