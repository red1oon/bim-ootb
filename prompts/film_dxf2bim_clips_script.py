#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — DXF2BIM film v5 (prompts/DXF2BIM_MODELLER_LANE.md §L31): beats anchored to SOURCE events (clip no, second), mapped through the cut (map.json), plus the EN/MS narration tables.
# usage: film_dxf2bim_clips_script.py <cut dir with map.json> <out dir>  -> beats.log, film_narration_dxf2bim_clips_{en,ms}.tsv (also copied next to this script)
import sys, os, json, re
cut, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
M = json.load(open(os.path.join(cut, 'map.json')))
def mt(clip, t):   # source second -> master second; a time inside a cut gap maps to the start of the next kept piece
    for s, e, m0, ext in M['map'][clip - 1]:
        if s - 1e-6 <= t <= e + 1e-6: return m0 + (t - s)
        if t < s: return m0
    s, e, m0, ext = M['map'][clip - 1][-1]; return m0 + (e - s)
# id, clip, source second, EN short, EN detail, MS short, MS detail, evidence
B = [
 ('p01', 1, 5.0, 'The same database opens in the Viewer. Pick a part and it names its source.', 'M: Five hundred twelve elements. Pick a fan and it shows its sheet, handle and layer.',
  'Pangkalan data sama dalam Viewer. Pilih satu bahagian, sumbernya muncul.', 'M: Lima ratus dua belas elemen. Pilih satu kipas dan ia menunjukkan lembaran, handle dan lapisannya.', 'DB ShedL29: 512 elements; clip 1 info panel on a fan (Provenance, SourceSheet 2_ELEV_WEST.dxf, SourceLayer)'),
 ('w01', 1, 11.0, 'Step inside. The frame, the walls, the fans and the floor, all from the drawings.', 'M: Step inside and walk it like a building. | F: What is all this? | M: The frame, the brick walls, the fans and the floor, built from the drawing set.',
  'Masuk ke dalam. Rangka, dinding, kipas dan lantai, semuanya daripada lukisan.', 'M: Masuk dan berjalan di dalamnya seperti sebuah bangunan. | F: Apa semua ini? | M: Rangka, dinding bata, kipas dan lantai, dibina daripada set lukisan.', 'clip 1 walk-through (first person inside the shed)'),
 ('n01', 1, 25.0, 'Night mode. Then Find, by storey or discipline.', 'M: Night mode. Then Find, which groups the model by storey or by discipline.',
  'Mod malam. Kemudian Cari, mengikut tingkat atau disiplin.', 'M: Mod malam. Kemudian Cari, yang mengumpulkan model mengikut tingkat atau disiplin.', 'clip 1: night lighting, Find panel (Storey / Discipline)'),
 ('h01', 1, 31.0, 'Hover over any part and it names itself: axial fan, section member, brick wall, floor slab.', 'M: Hover over any part and it names itself. An axial fan, a section member, a five inch brick wall, the ground floor slab. | F: Named from what? | M: From the model\'s own records.',
  'Gerakkan tetikus ke atas mana-mana bahagian dan ia menamakan dirinya: kipas, anggota keratan, dinding bata, papak lantai.', 'M: Gerakkan tetikus ke atas mana-mana bahagian dan ia menamakan dirinya. Kipas paksi, anggota keratan, dinding bata lima inci, papak lantai aras bawah. | F: Dinamakan daripada apa? | M: Daripada rekod model itu sendiri.', 'clip 1 hover tooltips: Axial fan, Section run, Section member, 5" Brick Wall, Ground floor slab'),
 ('d01', 1, 47.0, 'Find can group the model by discipline.', 'M: Find can group the model by discipline: structure, architecture, air conditioning.',
  'Cari boleh mengumpulkan model mengikut disiplin.', 'M: Cari boleh mengumpulkan model mengikut disiplin: struktur, seni bina, penyaman udara.', 'DB: disciplines STR 331, ARC 168, ACMV 13'),
 ('d02', 1, 56.8, 'Air conditioning lights the thirteen fans. Architecture, the shell. Structure, the frame.', 'M: Air conditioning lights the thirteen fans. Architecture is the shell. Structure is the frame.',
  'Kipas, kulit bangunan, rangka.', 'M: Penyaman udara menyalakan tiga belas kipas. Seni bina ialah cengkerang bangunan. Struktur ialah rangka.', 'DB: ACMV 13 fans; clip 1 highlights'),
 ('c01', 1, 62.8, 'Open structure, then columns: below grade, and grade to base.', 'M: Open structure, then column. | F: Below grade? | M: Each column now runs from its footing up to grade, then on to the base.',
  'Struktur, kemudian tiang: bawah aras tanah dan ke dasar.', 'M: Buka struktur, kemudian tiang. | F: Bawah aras tanah? | M: Setiap tiang kini naik dari tapak asasnya ke aras tanah, kemudian ke dasar tiang.', 'DB: 32 "Column below grade" + 32 "Column grade to base"; clip 1 list rows'),
 ('r01', 1, 69.0, 'Hover the roof: roof sheeting, over the section runs.', 'M: Hover over the roof: roof sheeting, over the section runs of the frame.',
  'Gerakkan tetikus ke atas bumbung: kepingan bumbung, di atas larian keratan.', 'M: Gerakkan tetikus ke atas bumbung: kepingan bumbung, di atas larian keratan rangka.', 'clip 1 tooltips Section run, Roof sheeting'),
 ('m01', 2, 5.0, 'Right-click the building for its totals by class: five hundred twelve elements.', 'M: Right-click the building for its totals by class. Five hundred twelve elements, ninety-six of them columns.',
  'Klik kanan bangunan untuk jumlahnya mengikut kelas: lima ratus dua belas elemen.', 'M: Klik kanan bangunan untuk jumlahnya mengikut kelas. Lima ratus dua belas elemen, sembilan puluh enam daripadanya tiang.', 'DB class counts; clip 2 Whole Building panel (Total 512, Column 96)'),
 ('m02', 2, 15.0, 'Measure: tap a spot, then another.', 'M: Measure: tap one spot, then another.',
  'Ukur: ketik satu titik, kemudian satu lagi.', 'M: Ukur: ketik satu titik, kemudian satu lagi.', 'clip 2 status "Tap another spot for length"'),
 ('m03', 2, 19.0, 'A length: eighteen point six two metres.', 'M: A length: eighteen point six two metres.',
  'Satu panjang: lapan belas perpuluhan enam dua meter.', 'M: Satu panjang: lapan belas perpuluhan enam dua meter.', 'clip 2 label 18.62 m'),
 ('m04', 2, 24.0, 'Roof area: six hundred forty-four square metres.', 'M: A roof gives its area: six hundred forty-four square metres, as a box.',
  'Luas: enam ratus empat puluh empat meter persegi.', 'M: Bumbung memberi luasnya: enam ratus empat puluh empat meter persegi, sebagai kotak.', 'clip 2 label Roof L 39.62 x W 7.75 x H 2.38 m (box) 644.01 m2; DB roof X extent 39.62 m'),
 ('k01', 2, 28.0, 'The clash matrix compares disciplines.', 'M: The clash matrix compares the disciplines.',
  'Matriks pertembungan membandingkan disiplin.', 'M: Matriks pertembungan membandingkan disiplin.', 'clip 2 Clash Matrix panel'),
 ('k02', 2, 35.2, 'Pick a pair, wall against column, and the Viewer flies in and outlines the overlap.', 'M: Pick a pair: wall against column, or wall against beam. The Viewer flies in and outlines where they meet. | F: How strict? | M: A tolerance slider sets it.',
  'Pilih satu pasangan, dinding dan tiang, dan Viewer terbang masuk dan menggariskan pertindihan itu.', 'M: Pilih satu pasangan: dinding dengan tiang, atau dinding dengan alang. Viewer terbang masuk dan menggariskan tempat ia bertemu. | F: Seketat mana? | M: Peluncur toleransi menetapkannya.', 'clip 2 clash list rows Wall - Column / Wall - Beam, outline, tolerance slider'),
 ('k03', 2, 47.5, 'Markers show where they are.', 'M: Markers show where they are along the building.',
  'Penanda menunjukkan tempatnya.', 'M: Penanda menunjukkan tempatnya di sepanjang bangunan.', 'clip 2 markers overview'),
 ('f01', 2, 51.0, 'A footing\'s record: sheet, handle, concrete grade, casting ratio.', 'M: Its sheet and handle, now with the concrete grade and casting ratio from the details sheet.',
  'Rekod tapak asas: lembaran, handle, gred konkrit, nisbah tuangan.', 'M: Lembaran dan handle, kini dengan gred konkrit dan nisbah tuangan daripada lembaran butiran.', 'DB: Note_fc_MPa / Note_CastingRatio on footings (W-L29); clip 2 last frame info panel'),
 ('i01', 3, 5.0, 'The same Viewer runs on a phone, walk-through included.', 'M: The same Viewer runs on a phone, walk-through included.',
  'Di telefon juga, dengan lawatan berjalan kaki.', 'M: Viewer yang sama berjalan di telefon, termasuk lawatan berjalan kaki.', 'owner statement 2026-10-19'),
 ('i02', 3, 9.0, 'A dock of icons opens the panels.', 'M: A dock of icons opens the panels.',
  'Dok ikon membuka panel.', 'M: Dok ikon membuka panel.', 'clip 3 dock'),
 ('i03', 3, 13.0, 'Camera and view, lighting, night, sound.', 'M: Camera and view, with lighting, night, background and sound.',
  'Kamera, cahaya, malam, bunyi.', 'M: Kamera dan paparan, dengan pencahayaan, malam, latar dan bunyi.', 'clip 3 Camera / View panel + sliders (Night n, Background b, Sound FX s)'),
 ('i04', 3, 19.0, 'Navigate and Inspect: find, measure, clash, x-ray, section, time, 4D, 5D.', 'M: Navigate: find, history, home. Inspect: measure, clash, x-ray, section, time.',
  'Navigasi dan Periksa: cari, ukur, pertembungan, keratan, masa.', 'M: Navigasi: cari, sejarah, rumah. Periksa: ukur, pertembungan, sinar-X, keratan, masa.', 'clip 3 Navigate + Inspect panels'),
]
# the closing line sits on the frozen last frame of clip 3 (its last 3.6 s)
END_T = M['master_sec'] - 3.6
PFX = os.environ.get('ID_PREFIX', '')   # ids of the tour rows are prefixed when they are merged into a take that has its own ids (v5: 'u_')
beats = [(PFX + b[0], mt(b[1], b[2])) for b in B] + [(PFX + 'e01', END_T), ('end', M['master_sec'])]
beats.sort(key=lambda x: x[1])
open(os.path.join(out, 'beats.log'), 'w').write(''.join(f'§FILM_BEAT id={k} t={t:.3f}\n' for k, t in beats))
E = ('e01', 3, 0, 'From a drawing set to a model you can walk and check.', 'M: From a drawing set to a model you can walk, measure and check.', 'Set lukisan, kini model untuk disemak.', 'M: Daripada set lukisan kepada model yang boleh dijalani, diukur dan disemak.', 'closing line on the frozen last frame')
for lang, ci in (('en', 3), ('ms', 5)):
    rows = []
    for b in B + [E]:
        tag = lambda x: x if re.match(r'^[MF]: ', x) else 'M: ' + x   # the fitter needs a speaker tag on every line
        r = [PFX + b[0], lang, b[7], tag(b[ci]), tag(b[ci + 1])]
        if lang == 'ms': r += [tag(b[3]), tag(b[4])]   # the English meaning, burned smaller under the Malay line
        rows.append('\t'.join(r))
    open(os.path.join(out, f'film_narration_dxf2bim_clips_{lang}.tsv'), 'w').write('\n'.join(rows) + '\n')
for k, t in beats: print(f'{k} t={t:.2f}')
