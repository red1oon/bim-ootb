# ⚠ DO NOT REMOVE — Scope: the OplogPic film (poc/psd-oplog/film). Text cards in the house style of film_earthworks_clip_cards.py: backdrop = a frame of the user's own screen
# recording (darkened), chapter titles from the owner's script, a roadmap card, and the closing BLACK prior-art card. Every claim on a card traces to the owner's words,
# to the recording's own counter, or to a measured result named in README.md / witness_log/HYPOTHESES.md. Read the log: §OPLOGPIC_CARDS.
# usage: python3 oplogpic_cards.py <backdrop.png> <outdir>   → cover.png c1.png c2.png road.png end.png (1920×1080)
import sys, os
from PIL import Image, ImageDraw, ImageFont
bg_path, outdir = sys.argv[1], sys.argv[2]; os.makedirs(outdir, exist_ok=True); W, H = 1920, 1080
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
card('cover', 'OplogPic', [], sub='A Photoshop clone on a kernel op log', big=True)
card('c1', '1 · Photoshop clone', ['Kernel OPLOG version', 'Works on mobile.', 'No install.', 'Works offline.'], y0=300)
card('c2', '2 · Just a proof of concept', ['MIT licensed.', 'A roadmap that keeps to the doctrine.', 'Suggestions and ideas are welcome.'], y0=300)
card('road', 'Roadmap, in levels', ['Level 1 · layer delete, hide and reorder · photo import · selection · a history you can re-edit, replay and share as a link',
                                      'Level 2 · masks · clipping · curves, behind an Advanced switch',
                                      'Level 3 · colour profiles · bigger canvases · PSD import, on desktop',
                                      'The doctrine: local first · serverless · asynchronous · simple relay · no install'], y0=190, colors={3: (255, 193, 7)})
# closing black card (house style of CivilWorks_priorart_endcard.png)
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 150
d.text((160, y), 'PRIOR ART CHECK', font=font(100, True), fill=(255, 255, 255)); y += 150
d.text((160, y), '10 October 2026 · a passing web search, not a survey.', font=font(34), fill=(185, 185, 185)); y += 78
d.text((160, y), 'Found separately:', font=font(38), fill=(255, 255, 255)); y += 62
for ln in ['Photopea · PSD editing in the browser (closed source)',
           'photobaer, PhotoCraft · open-source browser editors on Rust and WebAssembly',
           'Krita, GIMP · open-source desktop painters',
           'Graphite · node-based, non-destructive vector and raster editing']:
    d.text((190, y), '· ' + ln, font=font(36), fill=(190, 190, 190)); y += 56
y += 24; d.text((160, y), 'Not found together:', font=font(38), fill=(255, 235, 0)); y += 62
for t in wrap(d, 'The picture IS a replayable op log: every stroke one entry, identical pixels on every machine tested, exact undo and share, MIT licensed, no install, works offline.', font(36), W - 380):
    d.text((190, y), t, font=font(36), fill=(255, 235, 0)); y += 52
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS wrote end (black)')
