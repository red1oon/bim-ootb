# ⚠ DO NOT REMOVE — Scope: the OplogPic v8 (developer cut) MALAY narration, two voices (F Yasmin, M Osman, Edge TTS), cues from v8/timeline_ms.json (build_v8 with V8_SUFFIX=_ms, slower takes and longer cards because Malay runs longer).
# Same ids and sources as the English dialogue_v8.tsv; numbers come from the facts files (never typed); Malay wording is mine, NOT reviewed by a native speaker (terms as in the v6 / v7 Malay films: calit, tongkat sakti, adunan, topeng, kabur, garis luar, bayang jatuh, pratonton, pautan).
# usage: python3 dialogue_v8_ms.py > ~/Videos/oplogpic_v2_work/v8/dialogue_v8_ms.tsv
import json, os, csv, re
R = os.path.expanduser('~/Videos/oplogpic_v2_work'); T = json.load(open(R + '/v8/timeline_ms.json'))['segments']
EN = {r[0]: r for r in csv.reader(open(R + '/v8/dialogue_v8.tsv'), delimiter='\t')}
def facts(p): return {r[0]: r[1] for r in list(csv.reader(open(p), delimiter='\t'))[1:]}
P, C, H, CU = facts(R + '/v7/poster_facts.tsv'), facts(R + '/v8/carry_facts.tsv'), facts(R + '/v6/history_facts.tsv'), facts(R + '/v8/cutout_facts.tsv')
U = 'kosong satu dua tiga empat lima enam tujuh lapan sembilan sepuluh sebelas'.split()
def w(n):
    n = int(round(n))
    if n <= 11: return U[n]
    if n < 20: return U[n - 10] + ' belas'
    if n < 100: return U[n // 10] + ' puluh' + ('' if n % 10 == 0 else ' ' + U[n % 10])
    if n < 200: return 'seratus' + ('' if n == 100 else ' ' + w(n - 100))
    if n < 1000: return U[n // 100] + ' ratus' + ('' if n % 100 == 0 else ' ' + w(n % 100))
    return str(n)
kb = lambda m: int(re.search(r'\((\d+) KB\)', m).group(1))
g1, sh = int(P['gradient1_bytes']), int(P['shadow_bytes']); jk, pk = kb(P['jpeg_msg']), kb(P['png_msg'])
lk = int(re.search(r'\((\d+) characters\)', C['link_msg']).group(1)); qb = json.loads(open(R + '/v7/qr_facts.tsv').read().split('qr_info\t')[1].split('\n')[0])['bytes']
nv = int(re.search(r'Verified: (\d+) entries', H['verify_message']).group(1)); smb = round(int(C['save_bytes']) / 1048576, 1); smb_w = w(int(smb)) + ' perpuluhan ' + w(round((smb % 1) * 10)); suites = 45
assert P['page_errors'] == C['page_errors'] == CU['page_errors'] == '0' and C['open_msg'].startswith('Verified') and 'not a painting link' in C['tamper_msg'] and CU['adjust_kinds'] == '["levels","gradmap","sharpen"]' and smb == 2.6
def win(a, b=None, over=None):
    b = b or a; s = T[a]['start'] + (0.35 if 'src' not in T[a] else 0.1); e = T[b]['start'] + T[b]['len'] - 0.15; return over or (s, e)
t1 = T['t1']; T1A = (t1['start'] + 0.2, t1['start'] + 11.3); T1B = (t1['start'] + 11.5, t1['start'] + t1['len'] - 0.15)
ROWS = {   # id: (window, SHORT, DETAIL)
 'cover': (win('cover'), 'F: OplogPic.', 'F: OplogPic. | M: Penyunting foto yang failnya ialah sejarahnya.'),
 'c1': (win('c1'), 'M: Setiap suntingan ialah satu baris log.', f'F: Apakah idea utamanya? | M: Setiap suntingan ialah satu baris dalam log. Gradien ini {w(g1)} bait. Gambar hanyalah main semula log itu.'),
 'c2': (win('c2'), 'M: Lapisan dan alat.', 'M: Lapisan dan alat.'),
 't1a': (T1A, 'M: Lapisan, sepuluh mod adunan.', 'M: Lapisan. Sembunyikan, susun semula, pudarkan, dan adunkan dengan sepuluh mod adunan.'),
 't1b': (T1B, 'M: Berus, calit, tongkat sakti, alih.', 'M: Alat: berus, calit, pemadam, kabur, pilih, tongkat sakti dan alih. Satu sapuan berus juga satu baris dalam log.'),
 'c3': (win('c3'), 'M: Kit reka bentuk.', 'M: Kit reka bentuk.'),
 'd1': (win('d1'), 'M: Gradien ialah satu seretan.', f'M: Gradien. Satu seretan, satu entri, {w(g1)} bait.'),
 'd2': (win('d2'), 'M: Cahaya yang pudar.', 'M: Jejari, pudar hingga lut sinar. Satu cahaya.'),
 'd3': (win('d3'), 'M: Bentuk pada lapisan baharu.', 'M: Bentuk, pada lapisan baharu. Panel bulat bertepi dengan garis luar, elips untuk matahari, dan satu garisan.'),
 'd4': (win('d4'), 'M: Teks boleh disunting semula.', 'M: Teks, dengan garis luar. Sunting teks membukanya semula dengan tetapan yang sama. Perkataan baharu, mohon.'),
 'd5': (win('d5'), 'M: Lapisan kabur di bawah panel.', 'M: Pilih panel, tambah lapisan kabur Gaussian di bawahnya. Kini panel kelihatan seperti kaca kabur.'),
 'd6': (win('d6'), 'M: Pratonton pantas, tepat apabila dilepas.', 'M: Seret jejari. Pratonton pantas dan kasar. Lepaskan, dan gambar yang tepat muncul.'),
 'd7': (win('d7'), 'M: Bayang jatuh.', f'M: Bayang jatuh pada panel. Satu mohon, satu entri, {w(sh)} bait.'),
 'c4': (win('c4'), 'M: Potong imej dan penapis.', 'M: Potong imej dan penapis.'),
 'x1': (win('x1'), 'M: Dua foto.', 'M: Dua foto, awan dan sebuah belon udara panas. Foto disimpan dalam log sebagai gambar.'),
 'x2': (win('x2'), 'M: Tongkat sakti.', 'M: Tongkat sakti. Ketik langit, dan ia memilih piksel bersambung yang hampir sama warnanya. Kemudian besarkan sedikit.'),
 'x3': (win('x3'), 'M: Lembutkan, topeng, songsang.', 'M: Lembutkan tepi, buat topeng daripada pilihan, kemudian songsangkannya. Langit diganti.'),
 'x4': (win('x4'), 'M: Awan ke dalam kumpulan.', 'M: Masukkan awan ke dalam satu kumpulan.'),
 'x5': (win('x5'), 'M: Lihat tepinya: ini toleransi.', 'M: Lapisan warna, dikepit pada belon. Lihat tepinya: jubin biru yang hampir sama dengan biru langit turut terpilih. Itu toleransi tongkat sakti, bukan kerosakan.'),
 'x6': (win('x6'), 'M: Toleransi rendah, kurang jubin.', 'M: Rendahkan toleransi dan lebih sedikit jubin terpilih. Sekarang Aras, sebagai lapisan hidup.'),
 'x7': (win('x7'), 'M: Peta gradien dan pertajam.', 'M: Peta gradien, dan pertajam. Juga lapisan hidup.'),
 'c5': (win('c5'), 'M: Alih, skala, warnakan semula.', 'M: Alih, skala, warnakan semula.'),
 'e1': (win('e1'), 'M: Alih dan skala lapisan.', 'M: Alih dan skala satu lapisan. Topeng potongannya mengikut sama.'),
 'e2': (win('e2'), 'M: Warnakan semula satu panel.', 'F: Itu sudah muktamad? | M: Tidak. Pilih satu panel dengan tongkat sakti, letak lapisan Hue dan Ketepuan bertopeng padanya. Seret hue: ia kekal tetapan hidup.'),
 'c6': (win('c6'), 'M: Sejarah membuktikannya.', 'M: Sejarah membuktikannya.'),
 'h1': (win('h1'), 'M: Ketik mana-mana langkah.', 'M: Ketik langkah lama, dan gambar kembali seperti ketika itu. Kembali ke kini untuk pulang.'),
 'h2': (win('h2'), 'M: Buat asal dan buat semula.', 'M: Buat asal dan buat semula menggunakan senarai yang sama.'),
 'h3': (win('h3'), 'M: Baris log mentah.', 'M: Tunjuk entri mentah. Inilah baris-baris sebenar.'),
 'h4': (win('h4'), 'M: Sahkan memainkan semula semuanya.', f'M: Sahkan memainkan semula kesemua {w(nv)} entri dari awal, dan membandingkan. Gambar yang sama.'),
 'c7': (win('c7'), 'M: Bawa bersama anda.', 'M: Bawa bersama anda.'),
 'k1': (win('k1'), 'M: Pautan kongsi.', f'M: Sebuah dokumen kecil, dan pautan kongsi. {w(lk)} aksara.'),
 'k2': (win('k2'), 'M: Buka pautan: lihat sahaja.', 'M: Buka pautan, dan lukisan muncul. Lihat sahaja.'),
 'k3': (win('k3'), 'M: Ubah satu aksara: ditolak.', 'M: Ubah satu aksara, dan pautan itu ditolak.'),
 'k4': (win('k4'), 'M: Simpan fail.', f'M: Simpan fail. Seluruh dokumen belon, termasuk foto, {smb_w} megabait.'),
 'k5': (win('k5'), 'M: Buka fail menyemak dahulu.', 'M: Buka fail menyemak log dan gambar sebelum menunjukkan apa-apa. Disahkan: gambar yang sama.'),
 'k6': (win('k6'), 'M: Eksport ke PSD.', 'M: Eksport ke PSD, dengan lapisan dan topeng.'),
 'k7': (win('k7'), 'M: Dokumen kecil muat dalam kod QR.', f'M: Dokumen kecil muat dalam kod QR. {w(qb)} bait.'),
 'k8': (win('k8'), 'M: JPEG atau PNG, mana-mana saiz.', f'M: Eksport sebagai JPEG atau PNG, pada saiz pilihan anda. Poster yang sama: {w(jk)} kilobait, berbanding {w(pk)}.'),
 'c8': (win('c8'), 'M: Empat puluh lima suite lulus.', f'F: Adakah ia diuji? | M: {w(suites).capitalize()} daripada {w(suites)} suite ujian lulus. Main semula bersifat deterministik, jadi ujian membandingkan piksel dengan cincangan.'),
 'end': (win('end'), 'M: Cuba, baca, garpu.', 'M: Cubalah. Pautannya ada di skrin: tiada pemasangan, dan berfungsi luar talian. Sumbernya di GitHub, berlesen MIT. | F: Mengapa ia boleh dibina sekecil ini? | M: Kerana dokumen itu ialah log. Buat asal, sejarah, sahkan, kongsi dan simpan semuanya data yang sama. Dan kerana ia mengutamakan setempat: pelayar anda yang bekerja dan menyimpan log. Tiada pelayan. Semuanya sudah ada di tapak langsung, termasuk QR.'),
}
assert set(ROWS) == set(EN), set(EN) ^ set(ROWS)
turns = lambda t: [x for x in t.split(' | ')]
for i in EN:
    (a, b), s, d = ROWS[i]
    en_s, en_d = EN[i][4], EN[i][5]
    if i != 'end': assert len(turns(s)) == len(turns(en_s)) and len(turns(d)) == len(turns(en_d)), (i, s, d)
    print('\t'.join([i, '%.2f' % a, '%.2f' % b, EN[i][3], s, d]))
