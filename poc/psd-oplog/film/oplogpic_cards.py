# ⚠ DO NOT REMOVE — Scope: the OplogPic film (poc/psd-oplog/film). Text cards in the house style of film_earthworks_clip_cards.py: backdrop = a frame of the user's own screen
# recording (darkened), chapter titles from the owner's script, a roadmap card, and the closing BLACK prior-art card. Every claim on a card traces to the owner's words,
# to the recording's own counter, or to a measured result named in README.md / witness_log/HYPOTHESES.md. Read the log: §OPLOGPIC_CARDS.
# usage: python3 oplogpic_cards.py <backdrop.png> <outdir> [en|ms]   → cover.png c1.png c2.png road.png end.png (1920×1080)
import sys, os
from PIL import Image, ImageDraw, ImageFont
bg_path, outdir = sys.argv[1], sys.argv[2]; LANG = sys.argv[3] if len(sys.argv) > 3 else 'en'; os.makedirs(outdir, exist_ok=True); W, H = 1920, 1080
def font(sz, bold=False):
    for p in (['/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf'] if bold else ['/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf']):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
def cover_fit(im):
    r = max(W / im.width, H / im.height); im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS); x, y = (im.width - W) // 2, (im.height - H) // 2; return im.crop((x, y, x + W, y + H))
def wrap(d, text, f, maxw):
    out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= maxw: cur = t
        else: out.append(cur); cur = w
    return out + ([cur] if cur else [])
from PIL import ImageFilter
bg = cover_fit(Image.open(bg_path).convert('RGB')).filter(ImageFilter.GaussianBlur(14))
def card(name, title, lines, sub=None, big=False, y0=None, colors=None):
    im = Image.alpha_composite(bg.convert('RGBA'), Image.new('RGBA', (W, H), (8, 10, 14, 200))); d = ImageDraw.Draw(im); y = y0 if y0 else (330 if not big else 400)
    ft = font(100 if big else 76, True)
    for t in wrap(d, title, ft, W - 360): d.text((180, y), t, font=ft, fill=(79, 195, 247)); y += (118 if big else 92)
    if sub: y += 10; d.text((180, y), sub, font=font(46), fill=(220, 224, 230)); y += 76
    y += 24; fb = font(48)
    for i, ln in enumerate(lines):
        col = (colors or {}).get(i, (235, 238, 242))
        for t in wrap(d, ln, fb, W - 360): d.text((180, y), t, font=fb, fill=col); y += 66
        y += 14
    im.convert('RGB').save(os.path.join(outdir, name + '.png')); print('§OPLOGPIC_CARDS wrote', name)
T = {'en': dict(
    cover=('OplogPic', [], 'A Photoshop clone on a kernel op log'),
    c1=('1 · Photoshop clone', ['Kernel OPLOG version', 'Works on mobile.', 'No install.', 'Works offline.']),
    c2=('2 · Just a proof of concept', ['MIT licensed.', 'A roadmap that keeps to the doctrine.', 'Suggestions and ideas are welcome.']),
    road=('Roadmap, in levels', ['Level 1 · layer delete, hide and reorder · photo import · selection · a history you can re-edit, replay and share as a link',
                                 'Level 2 · masks · clipping · curves, behind an Advanced switch', 'Level 3 · colour profiles · bigger canvases · PSD import, on desktop',
                                 'The doctrine: local first · serverless · asynchronous · simple relay · no install']),
    end_title='PRIOR ART CHECK', end_date='10 October 2026 · a passing web search, not a survey.', found='Found separately:',
    found_items=['Photopea · PSD editing in the browser (closed source)', 'photobaer, PhotoCraft · open-source browser editors on Rust and WebAssembly',
                 'Krita, GIMP · open-source desktop painters', 'Graphite · node-based, non-destructive vector and raster editing'],
    notfound='Not found together:',
    notfound_text='The picture IS a replayable op log: every stroke one entry, identical pixels on every machine tested, exact undo and share, MIT licensed, no install, works offline.'),
 'ms': dict(
    cover=('OplogPic', [], 'Klon Photoshop di atas kernel log op'),
    c1=('1 · Klon Photoshop', ['Versi kernel OPLOG', 'Berfungsi pada peranti mudah alih.', 'Tanpa pemasangan.', 'Berfungsi luar talian.']),
    c2=('2 · Hanya bukti konsep', ['Berlesen MIT.', 'Pelan hala tuju yang setia pada doktrin.', 'Cadangan dan idea dialu-alukan.']),
    road=('Pelan hala tuju, mengikut tahap', ['Tahap 1 · padam, sembunyi dan susun semula lapisan · import foto · pemilihan · sejarah yang boleh disunting semula, dimainkan semula dan dikongsi sebagai pautan',
                                 'Tahap 2 · topeng · keratan · lengkung, di sebalik suis Lanjutan', 'Tahap 3 · profil warna · kanvas lebih besar · import PSD, pada desktop',
                                 'Doktrin: utamakan setempat · tanpa pelayan · tak serentak · geganti ringkas · tanpa pemasangan']),
    end_title='SEMAKAN SENI TERDAHULU', end_date='10 Oktober 2026 · carian web sepintas lalu, bukan tinjauan.', found='Ditemui secara berasingan:',
    found_items=['Photopea · penyuntingan PSD dalam pelayar (sumber tertutup)', 'photobaer, PhotoCraft · penyunting pelayar sumber terbuka atas Rust dan WebAssembly',
                 'Krita, GIMP · pelukis desktop sumber terbuka', 'Graphite · penyuntingan vektor dan raster berasaskan nod, tidak merosakkan'],
    notfound='Tidak ditemui bersama:',
    notfound_text='Gambar itu ialah log op yang boleh dimainkan semula: setiap sapuan satu entri, piksel yang sama pada setiap mesin yang diuji, buat asal dan kongsi yang tepat, berlesen MIT, tanpa pemasangan, berfungsi luar talian.')}[LANG]
card('cover', T['cover'][0], T['cover'][1], sub=T['cover'][2], big=True)
card('c1', T['c1'][0], T['c1'][1], y0=300)
card('c2', T['c2'][0], T['c2'][1], y0=300)
card('road', T['road'][0], T['road'][1], y0=190, colors={3: (255, 193, 7)})
# closing black card (house style of CivilWorks_priorart_endcard.png)
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 150
d.text((160, y), T['end_title'], font=font(100 if LANG == 'en' else 84, True), fill=(255, 255, 255)); y += 150
d.text((160, y), T['end_date'], font=font(34), fill=(185, 185, 185)); y += 78
d.text((160, y), T['found'], font=font(38), fill=(255, 255, 255)); y += 62
for ln in T['found_items']:
    for t in wrap(d, '· ' + ln, font(36), W - 380): d.text((190, y), t, font=font(36), fill=(190, 190, 190)); y += 52
    y += 4
y += 24; d.text((160, y), T['notfound'], font=font(38), fill=(255, 235, 0)); y += 62
for t in wrap(d, T['notfound_text'], font(36), W - 380): d.text((190, y), t, font=font(36), fill=(255, 235, 0)); y += 52
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS wrote end (black)', LANG)
