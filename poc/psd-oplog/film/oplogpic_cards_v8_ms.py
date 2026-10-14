# ⚠ DO NOT REMOVE — Scope: cards of the OplogPic developer cut v8 (poc/psd-oplog/film/SCRIPT_v8_dev_cut.md): cover, concept, chapter cards, dev card, black END card (where to find it, the link, why op log + local-first).
# Every number on a card is read from a facts file or the witness ledger, never typed; read the log after every run: §OPLOGPIC_CARDS_V8.
# usage: python3 oplogpic_cards_v8.py <bgdir> <outdir>   bgdir holds bg_cover bg_tools bg_design bg_cutout bg_edits bg_hist bg_carry bg_dev (png frames)
import sys, os, json, csv
from PIL import Image, ImageDraw, ImageFont, ImageFilter
bgdir, outdir = sys.argv[1], sys.argv[2]; os.makedirs(outdir, exist_ok=True); W, H = 1920, 1080
V = os.path.expanduser('~/Videos/oplogpic_v2_work'); REPO = '/home/red1/bim-ootb-psd/poc/psd-oplog'
def font(sz, bold=False, mono=False):
    p = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono%s.ttf' % ('-Bold' if bold else '') if mono else '/usr/share/fonts/truetype/noto/NotoSans-%s.ttf' % ('Bold' if bold else 'Regular')
    return ImageFont.truetype(p, sz) if os.path.exists(p) else ImageFont.load_default()
def cover_fit(im):
    r = max(W / im.width, H / im.height); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS); x, y = (im.width - W) // 2, (im.height - H) // 2; return im.crop((x, y, x + W, y + H))
def wrap(d, text, f, maxw):
    out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw: cur = t
        else: out.append(cur); cur = w
    return out + ([cur] if cur else [])
def facts(path): return {r[0]: r[1] for r in list(csv.reader(open(path), delimiter='\t'))[1:]}
def base(bgname): bg = cover_fit(Image.open(os.path.join(bgdir, bgname)).convert('RGB')).filter(ImageFilter.GaussianBlur(5)); return Image.alpha_composite(bg.convert('RGBA'), Image.new('RGBA', (W, H), (8, 10, 14, 175)))
def card(name, bgname, title, lines, sub=None, big=False, y0=300, extra=None):
    im = base(bgname); d = ImageDraw.Draw(im); y = y0; ft = font(104 if big else 74, True)
    for t in wrap(d, title, ft, W - 360): d.text((180, y), t, font=ft, fill=(79, 195, 247)); y += (124 if big else 90)
    if sub: y += 10; d.text((180, y), sub, font=font(48), fill=(225, 229, 235)); y += 80
    y += 24; fb = font(46)
    for ln in lines:
        for t in wrap(d, ln, fb, W - 360): d.text((180, y), t, font=fb, fill=(238, 241, 245)); y += 64
        y += 14
    if extra: extra(d, y)
    im.convert('RGB').save(os.path.join(outdir, name + '.png')); print('§OPLOGPIC_CARDS_V8 wrote', name)
PF = facts(V + '/v7/poster_facts.tsv'); entry = PF['gradient1_entry']; nbytes = PF['gradient1_bytes']
last = {}
for l in open(os.path.join(REPO, 'witness_log/ledger.jsonl')):
    r = json.loads(l)
    if r['commit'] == 'db3cde7f': last[r['suite']] = r   # the last COMPLETE run (a later full run is in progress while this is built)
suites = len(last); passed = sum(1 for r in last.values() if r['gate'] == 'PASS'); commits = sorted(set(r['commit'] for r in last.values()))
KN = open(os.path.join(REPO, 'editor/carry_file.js')).read(); import re; nops = len(re.search(r"KNOWN_OPS = new Set\(\[(.*?)\]\)", KN).group(1).split(','))
print('§OPLOGPIC_CARDS_V8 facts: gradient entry bytes', nbytes, '| suites', suites, 'pass', passed, 'commit', commits, '| known ops', nops)
card('cover', 'bg_cover.png', 'OplogPic', [], sub='Penyunting foto yang failnya ialah sejarahnya. Versi pembangun.', big=True, y0=380)
def concept(d, y):
    d.rounded_rectangle((180, y + 6, W - 180, y + 150), 16, fill=(10, 14, 22), outline=(79, 195, 247), width=2); f = font(27, mono=True); yy = y + 24
    cur = ''
    for ch in entry:
        if d.textlength(cur + ch, font=f) > W - 440: d.text((210, yy), cur, font=f, fill=(190, 235, 190)); yy += 38; cur = ''
        cur += ch
    d.text((210, yy), cur, font=f, fill=(190, 235, 190))
    d.text((180, y + 170), 'Satu seretan gradien = satu baris ini, %s bait. Log ialah dokumennya.' % nbytes, font=font(34), fill=(225, 229, 235))
card('c1', 'bg_cover.png', 'Dokumen ialah log', ['Setiap suntingan ialah satu baris JSON. Gambar ialah main semula log itu.', 'Tanpa pelayan. Tanpa pemasangan. Berfungsi luar talian.'], y0=210, extra=concept)
card('c2', 'bg_tools.png', '1 · Lapisan dan alat', ['Lapisan, sembunyi, susun semula, kelegapan, sepuluh mod adunan.', 'Berus, lembut, calit, pemadam, kabur, pilih, tongkat sakti, alih.'])
card('c3', 'bg_design.png', '2 · Kit reka bentuk', ['Gradien, bentuk, teks boleh sunting dengan garis luar dan bayang.', 'Lapisan kabur hidup dan bayang jatuh. Setiap satu ialah satu baris log.'])
card('c4', 'bg_cutout.png', '3 · Potong imej dan penapis', ['Foto, tongkat sakti, pinggir lembut, topeng, kepit, kumpulan.', 'Aras, peta gradien dan pertajam sebagai lapisan hidup.'])
card('c5', 'bg_edits.png', '4 · Alih, skala, warnakan semula', ['Kecilkan belon: topeng potongannya ikut bersama.', 'Warnakan semula satu panel dan kekalkan sebagai tetapan hidup.'])
card('c6', 'bg_hist.png', '5 · Sejarah membuktikannya', ['Pratonton mana-mana langkah. Buat asal dan buat semula. Lihat baris log mentah.', 'Sahkan memainkan semula log dari awal dan membandingkan gambar.'])
card('c7', 'bg_carry.png', '6 · Bawa bersama anda', ['Pautan kongsi; pautan yang diusik ditolak. Simpan fail, Buka fail, disahkan.', 'Kod QR untuk dokumen kecil. Eksport PNG, JPEG, WebP, PSD.'])
def dev(d, y):
    f = font(40)
    for ln in ['%d daripada %d suite ujian lulus pada commit %s (lejar saksi).' % (passed, suites, commits[0]), 'Main semula bersifat deterministik: log yang sama memberi piksel yang sama, dibandingkan dengan SHA-256.', 'Penyunting membaca %d jenis baris log; yang tidak dikenali ditolak, tidak pernah diabaikan.' % nops, 'Sumber: poc/psd-oplog/editor (JavaScript biasa, tiada langkah binaan untuk menjalankannya).']:
        for t in wrap(d, '· ' + ln, f, W - 380): d.text((190, y), t, font=f, fill=(238, 241, 245)); y += 56
        y += 14
card('c8', 'bg_dev.png', 'Di bawah tudung', [], y0=250, extra=dev)
# END: black card. Where it is, the ready link, and why the op log and local-first made it possible.
ZHV = len(sys.argv) > 3 and sys.argv[3] == 'zh'   # Mandarin cut: the top 140 px stay free for the Chinese subtitles, text is a little tighter, the voice credit is on the card
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 40
d.text((120, y), 'Cuba. Baca. Garpu.', font=font(68 if ZHV else 76, True), fill=(255, 255, 255)); y += 88 if ZHV else 100
d.text((120, y), 'CUBA SEKARANG (tiada pemasangan, berfungsi luar talian)', font=font(30 if ZHV else 32, True), fill=(79, 195, 247)); y += 42 if ZHV else 46
d.text((120, y), 'https://red1oon.github.io/bim-ootb/oplogpic/', font=font(42 if ZHV else 44, True, mono=True), fill=(190, 235, 190)); y += 56 if ZHV else 64
d.text((120, y), 'SUMBER (lesen MIT)', font=font(30 if ZHV else 32, True), fill=(79, 195, 247)); y += 42 if ZHV else 46
d.text((120, y), 'github.com/red1oon/bim-ootb', font=font(38 if ZHV else 40, True, mono=True), fill=(190, 235, 190)); y += 48 if ZHV else 52
d.text((120, y), 'cabang claude/photoshop-clone-gaps-m5p5mz  ·  folder poc/psd-oplog', font=font(30 if ZHV else 32, mono=True), fill=(190, 235, 190)); y += 52 if ZHV else 58
d.text((120, y), 'MENGAPA LOG OPERASI DAN KEUTAMAAN SETEMPAT MEMUNGKINKANNYA', font=font(30 if ZHV else 32, True), fill=(79, 195, 247)); y += 44 if ZHV else 50
BF = 28 if ZHV else 31
for ln in ['Dokumen ialah log: buat asal, sejarah, Sahkan, pautan kongsi dan Simpan fail ialah data yang sama, bukan ciri berasingan.',
           'Gambar ialah main semula log yang deterministik: log sama, piksel sama, disemak dengan cincang. Begitulah ujiannya berfungsi juga.',
           'Mengutamakan setempat: pelayar anda yang bekerja dan menyimpan log. Tiada pelayan, tiada akaun, tiada muat naik. Pautan atau fail membawanya ke peranti lain.',
           'Ia kekal kecil: gradien kira-kira %s bait, jadi dokumen kecil muat dalam kod QR.' % nbytes]:
    for t in wrap(d, '· ' + ln, font(BF), W - 280): d.text((130, y), t, font=font(BF), fill=(235, 235, 235)); y += BF + 8
    y += 3
y += 6
for ln in ['Semua yang ditunjukkan ada di tapak langsung, termasuk Simpan fail, Buka fail dan Tunjuk QR (dilancarkan 15 Oktober 2026).',
           'Foto: Laura Seaman, Joiarib Morales Uc (Unsplash). Dirakam pada komputer riba dalam Chrome. Skrin aplikasi kekal dalam bahasa Inggeris. Belum diuji pada telefon sebenar.'] + (['Suara: dijana AI (Microsoft Edge TTS, awan). Perkataan Melayu belum disemak penutur asli.'] if ZHV else []):
    for t in wrap(d, ln, font(25 if ZHV else 26), W - 240): d.text((120, y), t, font=font(25 if ZHV else 26), fill=(170, 170, 170)); y += 31 if ZHV else 34
    y += 3
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS_V8 wrote end (black), text bottom y=%d of %d' % (y, H))
