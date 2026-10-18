#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (§L31): the whole film's narration table = the recorder take's rows (numbers re-stated from THIS take's §FILM_FACT lines) + the Viewer tour's rows (ids prefixed u_) + the two closing-card rows. usage: film_dxf2bim_v5_tsv.py <lang en|ms> <tour script dir> <out.tsv>
import sys, os, re
L, tour, out = sys.argv[1:4]; H = os.path.dirname(os.path.abspath(__file__))
KEEP = ['c1', 'd01', 'o01', 'a01', 'f01', 'l01', 's01', 'c02', 'i01', 'v03', 'v04', 'n01', 'end']
EDIT = {   # (id, old, new): the take's facts: 9 sheets, 512 bodies / elements, 5D estimate $1,132,974.92 (6 tasks, 194 days unchanged)
 'en': [('c1', 'Eight sheets: plans, elevations, a beam layout, a truss section.', 'Nine sheets: plans, elevations, a beam layout, a truss section and a details sheet.'),
        ('l01', 'all eight sheets reopen together', 'all nine sheets reopen together'),
        ('c02', 'Four hundred forty-eight bodies, in their material colours.', 'Five hundred twelve bodies, in their material colours.'),
        ('c02', 'Four hundred forty-eight bodies: thirty-two columns, thirty-two footings,', 'Five hundred twelve bodies: ninety-six column parts, thirty-two footings,'),
        ('c02', 'M: Each material in its standard colour.', 'M: Each material in its standard colour. | F: And the details sheet? | M: Its column schedule gives the section below grade.'),
        ('i01', 'Four hundred forty-eight elements, eight materials', 'Five hundred twelve elements, eight materials'),
        ('v03', 'about one point oh five million dollars', 'about one point one three million dollars')]}

MS = {   # Malay narration for the take's rows and the closing cards (the English meaning is burned smaller under it)
 'c1': ('F: Satu set lukisan BricsCAD biasa. Bolehkah ia menjadi model, jadual dan kos?', 'F: Ini satu set lukisan BricsCAD biasa. Sembilan helaian: pelan, pandangan hadapan, susun atur alang, keratan kekuda dan helaian butiran. | M: Bolehkah ia menjadi model, jadual dan kos? | F: Mari lihat. Tiada apa yang ditanda.'),
 'd01': ('M: 2D biasa. Garis, hatch, ukuran.', 'M: 2D biasa. Garis, hatch dan ukuran, dilukis untuk manusia, bukan untuk pangkalan data. | F: Apa yang Modeller tahu? | M: Hanya apa yang dinyatakan setiap lukisan.'),
 'o01': ('M: Ia mencadangkan hanya apa yang dinyatakan lukisan. Dalam warna kuning.', 'M: Ia mencadangkan hanya apa yang dinyatakan lukisan. Unit daripada pengepala fail, pandangan dan nama daripada tajuk. | F: Kenapa kuning? | M: Kuning bermaksud dicadangkan, belum menjadi milik anda.'),
 'a01': ('M: Terima semua. Grid datang daripada tanda ukuran.', 'M: Terima semua. Grid datang daripada tanda ukuran, bukan daripada tempat label berada. | F: Dan datum ketinggian? | M: Daripada garisan tanah yang tebal.'),
 'f01': ('M: Tiga fakta yang hanya manusia boleh nyatakan.', 'M: Tiga fakta yang hanya manusia boleh nyatakan. Nama set, aras pelan, dan datum plinth: dua kaki di atas tanah, dibaca daripada butiran tiang. | F: Ditaip sekali? | M: Ditaip sekali, dan disimpan dalam helaian.'),
 'l01': ('M: Tetapan tinggal dalam helaian. Kesemuanya dibuka semula.', 'M: Tetapan itu disimpan dalam helaian itu sendiri, jadi sembilan helaian dibuka semula bersama. | F: Apa yang dipilih? | M: Lapisan mana ialah tiang, tapak asas, alang, panel dinding, kipas, jaring, ayunan pintu, dan bar kekuda.'),
 's01': ('M: Lengkapkan menambah papak dan bumbung, disenaraikan sebagai lalai.', 'M: Lukisan membayangkan papak lantai dan bumbung. Menanda Lengkapkan menambahnya, dan menyenaraikan ketebalannya sebagai lalai kuning. | F: Jadi ia anggaran? | M: Anggaran, dan ditandakan begitu.'),
 'c02': ('M: Tukar. Lima ratus dua belas jasad, dalam warna bahan masing-masing.', 'M: Tukar. Lima ratus dua belas jasad: sembilan puluh enam bahagian tiang, tiga puluh dua tapak asas, tiga puluh lima alang, empat puluh satu panel dinding, tiga belas kipas, tiga jaring, empat pintu, anggota dan plat kekuda, satu papak dan satu bumbung. | F: Warna? | M: Setiap bahan dalam warna piawainya. | F: Dan helaian butiran? | M: Jadual tiangnya memberi keratan bawah aras tanah.'),
 'i01': ('M: IFC biasa, kemudian pangkalan data kami. Setiap mesh menyimpan sumbernya.', 'M: Eksport IFC biasa dengan bahannya. Kemudian pengekstrak biasa, ke format pangkalan data kami. | F: Apa di dalamnya? | M: Lima ratus dua belas elemen, lapan bahan, dan bagi setiap mesh, helaian dan handle asalnya.'),
 'v03': ('M: Lima D. Kos, daripada kadar dan kuantiti model.', 'M: Halaman lima D: kos mengikut disiplin, daripada kadar dan kuantiti model. | F: Tender? | M: Bukan. Anggaran berasaskan kadar, kira-kira satu perpuluhan satu tiga juta dolar.'),
 'v04': ('M: Empat D. Jadual yang dijana: enam tugas, seratus sembilan puluh empat hari.', 'M: Empat D: jadual yang dijana Viewer apabila model tiada jadual. Enam fasa sepanjang seratus sembilan puluh empat hari kalendar. | F: Urutan siapa? | M: Urutan lalai. Bukan pelan sebenar ladang ini.'),
 'n01': ('M: Apa yang masih terbuka, dinyatakan.', 'M: Masih terbuka, dinyatakan terus terang. Jarak kekuda tidak dilukis, jadi kekuda berulang itu andaian. Pad penyejat tiada panjang. Kos ialah anggaran dan jadual itu lalai. | F: Dan lukisan itu sendiri? | M: Setiap nombor di skrin datang daripada larian ini.'),
 'end': ('F: Daripada lukisan biasa, kepada model, jadual dan kos.', 'F: Daripada lukisan biasa, kepada model, jadual dan kos. | M: Setiap angka di skrin datang daripada larian ini.'),
 'pa01': ('M: Seni terdahulu: alat sedia ada membina dinding, pintu dan tingkap, atau hanya lengkung, dengan saiz lalai.', 'M: Seni terdahulu, dicari pada Oktober; tiada perbandingan terus. Alat sedia ada menukar pelan 2D kepada dinding, pintu, tingkap dan papak, atau hanya lengkung, dengan saiz lalai. | F: Berapa kosnya? | M: Beberapa memerlukan modul atau SDK berbayar.'),
 'pa02': ('M: Di sini: tetapan kuning, bukan lalai senyap; sumber pada setiap jasad; model yang sama setiap kali.', 'M: Di sini, nilai yang tidak dinyatakan ialah tetapan kuning, bukan lalai senyap. Setiap jasad membawa helaian dan handle-nya. Lukisan yang sama memberi model yang sama. | F: Dan kosnya? | M: Satu tab pelayar. MIT, tanpa pemasangan.'),
 'u_e01': ('M: Kini kos dan jadual, daripada pangkalan data sama.', 'M: Kini kos dan jadual, daripada pangkalan data sama.'),
}
rows = {r.split('\t')[0]: r.rstrip('\n').split('\t') for r in open(os.path.join(H, 'film_narration_dxf2bim_shed_en.tsv')) if r.strip()}
out_rows = []
for k in (KEEP if L == 'en' else []):
    r = rows[k][:]
    for i, old, new in EDIT.get('en', []):
        if i == k:
            for c in (3, 4): r[c] = r[c].replace(old, new)
    r[2] = r[2].replace('448', '512')
    out_rows.append(r)
tr = [l.rstrip('\n').split('\t') for l in open(os.path.join(tour, f'film_narration_dxf2bim_clips_{L}.tsv')) if l.strip()]
PA = {'en': [('pa01', 'docs DXF2BIM_Prior_Art §1 (searched 2026-10-18, no head-to-head run)', 'M: Prior art: existing tools build walls, doors and windows, or only curves, with default sizes.', 'M: Prior art, searched in October; no head-to-head run. Existing tools turn a 2D plan into walls, doors, windows and slabs, or only curves, with default sizes. | F: At what cost? | M: Several need a paid module or SDK.'),
              ('pa02', 'docs DXF2BIM_Prior_Art §2 + lane §L29/§L30', 'M: Here: a yellow setting, not a silent default; a source on every body; the same model every time.', 'M: Here, an unstated value is a yellow setting, not a silent default. Every body carries its sheet and handle. The same drawings give the same model. | F: And the cost? | M: A browser tab. MIT, zero install.')]}
if L == 'en':
    for k, src, s, d in PA['en']: out_rows.append([k, 'en', src, s, d])
    for r in tr:   # the tour's closing line is a bridge into the cost page here
        if r[0] == 'u_e01': r[3] = 'M: Now the cost and the schedule, from the same database.'; r[4] = 'M: Now the cost and the schedule, from the same database.'; r[2] = 'bridge to the 5D page'
        out_rows.append(r)
if L == 'ms':
    EN = {r.split('\t')[0]: r.rstrip('\n').split('\t') for r in open(os.path.join(os.path.dirname(out), 'film_narration_dxf2bim_v5_en.tsv'))}   # the English meaning = the EN table of THIS film (build EN first)
    for k in KEEP + ['pa01', 'pa02']:
        e = EN[k]; out_rows.append([k, 'ms', e[2], MS[k][0], MS[k][1], e[3], e[4]])
    for r in [l.rstrip('\n').split('\t') for l in open(os.path.join(tour, 'film_narration_dxf2bim_clips_ms.tsv')) if l.strip()]:
        if r[0] == 'u_e01': r = [r[0], 'ms', 'bridge to the 5D page', MS['u_e01'][0], MS['u_e01'][1], EN['u_e01'][3], EN['u_e01'][4]]
        out_rows.append(r)
open(out, 'w').write('\n'.join('\t'.join(r) for r in out_rows) + '\n'); print(f'§TSV {L} rows={len(out_rows)} -> {out}')
