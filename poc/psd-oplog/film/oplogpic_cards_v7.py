# ⚠ DO NOT REMOVE — Scope: the OplogPic design-kit film v7 (poc/psd-oplog/film/SCRIPT_v7_design_kit.md). Chapter cards over darkened frames of the recorded takes, and a closing BLACK prior-art card.
# Every claim on a card traces to a test verdict or a verified source named in SCRIPT_v7_design_kit.md; read the log after every run: §OPLOGPIC_CARDS_V7.
# usage: python3 oplogpic_cards_v7.py <bgdir> <outdir>   bgdir holds bg_cover bg_poster bg_text bg_blur bg_hist bg_qr bg_export (png frames of the takes) -> cover c1..c6 end (1920x1080)
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
bgdir, outdir = sys.argv[1], sys.argv[2]; MS = len(sys.argv) > 3 and sys.argv[3] == 'ms'   # optional 3rd arg 'ms' = Malay card text (unreviewed by a native speaker)
os.makedirs(outdir, exist_ok=True); W, H = 1920, 1080
def font(sz, bold=False):
    p = '/usr/share/fonts/truetype/noto/NotoSans-%s.ttf' % ('Bold' if bold else 'Regular')
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
def card(name, bgname, title, lines, sub=None, big=False, y0=300):
    bg = cover_fit(Image.open(os.path.join(bgdir, bgname)).convert('RGB')).filter(ImageFilter.GaussianBlur(5))
    im = Image.alpha_composite(bg.convert('RGBA'), Image.new('RGBA', (W, H), (8, 10, 14, 175))); d = ImageDraw.Draw(im); y = y0
    ft = font(104 if big else 74, True)
    for t in wrap(d, title, ft, W - 360): d.text((180, y), t, font=ft, fill=(79, 195, 247)); y += (124 if big else 90)
    if sub: y += 10; d.text((180, y), sub, font=font(48), fill=(225, 229, 235)); y += 80
    y += 24; fb = font(46)
    for ln in lines:
        for t in wrap(d, ln, fb, W - 360): d.text((180, y), t, font=fb, fill=(238, 241, 245)); y += 64
        y += 14
    im.convert('RGB').save(os.path.join(outdir, name + '.png')); print('§OPLOGPIC_CARDS_V7 wrote', name)
if not MS:
    card('cover', 'bg_cover.png', 'OplogPic', [], sub='The design kit: a poster from a blank canvas', big=True, y0=380)
    card('c1', 'bg_poster.png', '1 · A poster from nothing', ['A gradient is one drag. A shape is one drag.', 'Every drag is one line in the log.'])
    card('c2', 'bg_text.png', '2 · Words you can change', ['A caption keeps its settings in the log.', 'Edit text reopens it. Undo brings the old look back.'])
    card('c3', 'bg_blur.png', '3 · A live blur', ['Blur and shadow stay changeable.', 'While you drag the slider the preview is quick and rough. The exact picture appears when you let go.'])
    card('c4', 'bg_hist.png', '4 · History proves it', ['Every step is listed. Tap one to see the picture then.', 'Verify rebuilds the picture from the log and compares.'])
    card('c5', 'bg_qr.png', '5 · A QR for a small document', ['A small document fits in a QR code: the link carries the edit list, not pixels.', 'A photo or a caption is too big for a link: use Save file.'])
    card('c6', 'bg_export.png', '6 · Export', ['PNG, JPEG or WebP, at the size you choose.', 'Recorded on a local build: some of this is not on the live site yet.'])
else:
    card('cover', 'bg_cover.png', 'OplogPic', [], sub='Kit reka bentuk: sebuah poster daripada kanvas kosong', big=True, y0=380)
    card('c1', 'bg_poster.png', '1 · Sebuah poster daripada kosong', ['Satu gradien ialah satu seretan. Satu bentuk ialah satu seretan.', 'Setiap seretan ialah satu baris dalam log.'])
    card('c2', 'bg_text.png', '2 · Kata-kata yang boleh diubah', ['Kapsyen menyimpan tetapannya dalam log.', 'Sunting teks membukanya semula. Buat asal mengembalikan rupa lama.'])
    card('c3', 'bg_blur.png', '3 · Kabur yang hidup', ['Kabur dan bayang kekal boleh diubah.', 'Semasa menyeret gelangsar, pratonton pantas dan kasar. Gambar tepat muncul apabila anda lepaskan.'])
    card('c4', 'bg_hist.png', '4 · Sejarah membuktikannya', ['Setiap langkah disenaraikan. Ketik satu untuk melihat gambar ketika itu.', 'Sahkan membina semula gambar daripada log dan membandingkannya.'])
    card('c5', 'bg_qr.png', '5 · Kod QR untuk dokumen kecil', ['Dokumen kecil muat dalam kod QR: pautannya membawa senarai suntingan, bukan piksel.', 'Foto atau kapsyen terlalu besar untuk pautan: guna Simpan fail.'])
    card('c6', 'bg_export.png', '6 · Eksport', ['PNG, JPEG atau WebP, pada saiz pilihan anda.', 'Dirakam pada binaan setempat: sebahagiannya belum ada di tapak langsung.'])
# closing BLACK prior-art card (house style of the v6 film; the three pages were read on 12 October 2026 and are unchanged here)
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 90
d.text((160, y), ('SENI TERDAHULU' if MS else 'PRIOR ART'), font=font(96, True), fill=(255, 255, 255)); y += 124
d.text((160, y), ('12 Oktober 2026 · tinjauan ringkas halaman awam, bukan kajian menyeluruh.' if MS else '12 October 2026 · a quick look at public pages, not a survey.'), font=font(32), fill=(185, 185, 185)); y += 62
d.text((160, y), ('Ditemui secara berasingan:' if MS else 'Found separately:'), font=font(38), fill=(255, 255, 255)); y += 56
for ln in (['Photopea · berjalan dalam pelayar dengan lapisan dan topeng (halamannya sendiri)', 'miniPaint · sumber terbuka, berjalan dalam pelayar dengan lapisan, semuanya kekal setempat (README-nya)', 'GIMP · penyunting desktop; manualnya menyatakan sejarah buat asal tidak disimpan dalam fail XCF'] if MS else ['Photopea · runs in the browser with layers and masks (its own page)', 'miniPaint · open source, runs in the browser with layers, keeps everything local (its README)', 'GIMP · a desktop editor; its manual says undo history is not saved in XCF files']):
    for t in wrap(d, '· ' + ln, font(34), W - 380): d.text((190, y), t, font=font(34), fill=(190, 190, 190)); y += 46
    y += 6
y += 18
for t in wrap(d, ('Kami tidak mendakwa yang pertama. Bukti konsep ini (berlesen MIT) menunjukkan satu perkara: fail yang disimpan ialah sejarah suntingan anda.' if MS else 'We do not claim to be first. This proof of concept (MIT licensed) shows one thing: the saved file is the history of your edits.'), font(40), W - 320): d.text((160, y), t, font=font(40), fill=(255, 255, 255)); y += 54
y += 22
for ln in (['Dirakam pada binaan setempat, 14 Oktober 2026.', 'Kembali ke laman utama: red1oon.github.io/bim-ootb'] if MS else ['Recorded on a local build, 14 October 2026.', 'Back to the main page: red1oon.github.io/bim-ootb']):
    d.text((160, y), ln, font=font(32), fill=(185, 185, 185)); y += 46
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS_V7 wrote end (black)')
