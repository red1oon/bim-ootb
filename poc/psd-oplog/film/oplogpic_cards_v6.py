# ⚠ DO NOT REMOVE — Scope: the OplogPic balloon film v6 (poc/psd-oplog/film/SCRIPT_v6_balloon_3min.md). Chapter cards over darkened frames of the recorded takes, and a closing BLACK prior-art card.
# Every claim on a card traces to a measurement or a verified source named in SCRIPT_v6_balloon_3min.md; read the log after every run: §OPLOGPIC_CARDS_V6.
# usage: python3 oplogpic_cards_v6.py <bgdir> <outdir>   bgdir holds bg_cover.png bg_tools.png bg_hist.png bg_edits.png bg_adv.png (frames of the takes) → cover c1 c2 c3 c4 c5 end (1920x1080)
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
bgdir, outdir = sys.argv[1], sys.argv[2]; MS = len(sys.argv) > 3 and sys.argv[3] == 'ms'   # optional 3rd arg 'ms' = Malay card text
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
def card(name, bgname, title, lines, sub=None, big=False, y0=300, col_idx=None):
    bg = cover_fit(Image.open(os.path.join(bgdir, bgname)).convert('RGB')).filter(ImageFilter.GaussianBlur(5))
    im = Image.alpha_composite(bg.convert('RGBA'), Image.new('RGBA', (W, H), (8, 10, 14, 175))); d = ImageDraw.Draw(im); y = y0
    ft = font(104 if big else 74, True)
    for t in wrap(d, title, ft, W - 360): d.text((180, y), t, font=ft, fill=(79, 195, 247)); y += (124 if big else 90)
    if sub: y += 10; d.text((180, y), sub, font=font(48), fill=(225, 229, 235)); y += 80
    y += 24; fb = font(46)
    for i, ln in enumerate(lines):
        col = (col_idx or {}).get(i, (238, 241, 245))
        for t in wrap(d, ln, fb, W - 360): d.text((180, y), t, font=fb, fill=col); y += 64
        y += 14
    im.convert('RGB').save(os.path.join(outdir, name + '.png')); print('§OPLOGPIC_CARDS_V6 wrote', name)
if not MS:
    card('cover', 'bg_cover.png', 'OplogPic', [], sub='A photo editor with history', big=True, y0=380)
    card('c1', 'bg_cover.png', '1 · A photo editor with history', ['Every edit is one line in a log.', 'The picture is the replay of that log.', 'No server. No install. Works offline.'])
    card('c2', 'bg_tools.png', '2 · The finished file', ['Five layers: clouds, balloon, caption, paint, background.', 'Masks, adjustments, text, move and scale.'])
    card('c3', 'bg_hist.png', '3 · The history is the file', ['Preview any step. Go back to here. Undo and redo.', 'Verify rebuilds the picture from the log.'])
    card('c4', 'bg_edits.png', '4 · Two edits', ['Shrink the balloon and place it: its cut-out comes with it.', 'Recolour one panel and keep it a live setting.'])
    card('c5', 'bg_adv.png', '5 · What it costs', ['On a laptop this finished file takes about half a gigabyte in all (508 MB; an empty editor takes 213 MB).', 'Our own layer data is 112 MB, the same on any device.', 'Phones: not measured yet. Fitting phones is the roadmap.'], y0=260, col_idx={2: (255, 193, 7)})
else:
    card('cover', 'bg_cover.png', 'OplogPic', [], sub='Penyunting foto dengan sejarah', big=True, y0=380)
    card('c1', 'bg_cover.png', '1 · Penyunting foto dengan sejarah', ['Setiap suntingan ialah satu baris dalam log.', 'Gambar ialah main semula log itu.', 'Tanpa pelayan. Tanpa pemasangan. Berfungsi luar talian.'])
    card('c2', 'bg_tools.png', '2 · Fail yang siap', ['Lima lapisan: awan, belon, kapsyen, cat, latar belakang.', 'Topeng, pelarasan, teks, alih dan skala.'])
    card('c3', 'bg_hist.png', '3 · Sejarah ialah failnya', ['Pratonton mana-mana langkah. Kembali ke sini. Buat asal dan buat semula.', 'Sahkan membina semula gambar daripada log.'])
    card('c4', 'bg_edits.png', '4 · Dua suntingan', ['Kecilkan belon dan letakkannya: potongan langitnya turut berpindah.', 'Warnakan semula satu panel dan kekalkan ia tetapan hidup.'])
    card('c5', 'bg_adv.png', '5 · Kosnya', ['Pada komputer riba, fail siap ini mengambil kira-kira setengah gigabait keseluruhannya (508 MB; penyunting kosong mengambil 213 MB).', 'Data lapisan kami sendiri ialah 112 MB, sama pada mana-mana peranti.', 'Telefon: belum diukur. Memuatkan pada telefon ialah hala tuju seterusnya.'], y0=260, col_idx={2: (255, 193, 7)})
# closing BLACK prior-art card (house style of CivilWorks_priorart_endcard.png and the earlier OplogPic end card)
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 90
d.text((160, y), ('SENI TERDAHULU' if MS else 'PRIOR ART'), font=font(96, True), fill=(255, 255, 255)); y += 124
d.text((160, y), ('12 Oktober 2026 · tinjauan ringkas halaman awam, bukan kajian menyeluruh.' if MS else '12 October 2026 · a quick look at public pages, not a survey.'), font=font(32), fill=(185, 185, 185)); y += 62
d.text((160, y), ('Ditemui secara berasingan:' if MS else 'Found separately:'), font=font(38), fill=(255, 255, 255)); y += 56
for ln in (['Photopea · berjalan dalam pelayar dengan lapisan dan topeng (halamannya sendiri)', 'miniPaint · sumber terbuka, berjalan dalam pelayar dengan lapisan, semuanya kekal setempat (README-nya)', 'GIMP · penyunting desktop; manualnya menyatakan sejarah buat asal tidak disimpan dalam fail XCF'] if MS else ['Photopea · runs in the browser with layers and masks (its own page)', 'miniPaint · open source, runs in the browser with layers, keeps everything local (its README)', "GIMP · a desktop editor; its manual says undo history is not saved in XCF files"]):
    for t in wrap(d, '· ' + ln, font(34), W - 380): d.text((190, y), t, font=font(34), fill=(190, 190, 190)); y += 46
    y += 6
y += 18
for t in wrap(d, ('Kami tidak mendakwa yang pertama. Bukti konsep ini (berlesen MIT) menunjukkan satu perkara: fail yang disimpan ialah sejarah suntingannya.' if MS else 'We do not claim to be first. This proof of concept (MIT licensed) shows one thing: the saved file is the edit history.'), font(36), W - 380): d.text((160, y), t, font=font(36), fill=(255, 235, 0)); y += 50
y += 22
for ln in (['Foto: Laura Seaman, Joiarib Morales Uc, di Unsplash.', 'Kembali ke laman utama: red1oon.github.io/bim-ootb'] if MS else ['Photos: Laura Seaman, Joiarib Morales Uc, on Unsplash.', 'Back to the main page: red1oon.github.io/bim-ootb']):
    d.text((160, y), ln, font=font(32), fill=(185, 185, 185)); y += 46
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS_V6 wrote end (black)')
