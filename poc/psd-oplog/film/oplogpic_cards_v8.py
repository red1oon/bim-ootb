# ⚠ DO NOT REMOVE — Scope: cards of the OplogPic developer cut v8 (poc/psd-oplog/film/SCRIPT_v8_dev_cut.md): cover, concept, chapter cards, dev card, black END card (where to find it, the link, why op log + local-first).
# Every number on a card is read from a facts file or the witness ledger, never typed; read the log after every run: §OPLOGPIC_CARDS_V8.
# usage: python3 oplogpic_cards_v8.py <bgdir> <outdir>   bgdir holds bg_cover bg_tools bg_design bg_cutout bg_edits bg_hist bg_carry bg_dev (png frames)
import sys, os, json, csv
from PIL import Image, ImageDraw, ImageFont, ImageFilter
bgdir, outdir = sys.argv[1], sys.argv[2]; os.makedirs(outdir, exist_ok=True); W, H = 1920, 1080
V = os.path.expanduser('~/Videos/oplogpic_v2_work'); REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
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
for l in open(os.path.join(REPO, 'witness_log/ledger.jsonl')): r = json.loads(l); last[r['suite']] = r
suites = len(last); passed = sum(1 for r in last.values() if r['gate'] == 'PASS'); commits = sorted(set(r['commit'] for r in last.values()))
KN = open(os.path.join(REPO, 'editor/carry_file.js')).read(); import re; nops = len(re.search(r"KNOWN_OPS = new Set\(\[(.*?)\]\)", KN).group(1).split(','))
print('§OPLOGPIC_CARDS_V8 facts: gradient entry bytes', nbytes, '| suites', suites, 'pass', passed, 'commit', commits, '| known ops', nops)
card('cover', 'bg_cover.png', 'OplogPic', [], sub='A photo editor whose file is its history. The developer cut.', big=True, y0=380)
def concept(d, y):
    d.rounded_rectangle((180, y + 6, W - 180, y + 150), 16, fill=(10, 14, 22), outline=(79, 195, 247), width=2); f = font(27, mono=True); yy = y + 24
    cur = ''
    for ch in entry:
        if d.textlength(cur + ch, font=f) > W - 440: d.text((210, yy), cur, font=f, fill=(190, 235, 190)); yy += 38; cur = ''
        cur += ch
    d.text((210, yy), cur, font=f, fill=(190, 235, 190))
    d.text((180, y + 170), 'One gradient drag = this one line, %s bytes. The log is the document.' % nbytes, font=font(34), fill=(225, 229, 235))
card('c1', 'bg_cover.png', 'The document is a log', ['Every edit is one JSON line. The picture is the replay of the log.', 'No server. No install. Works offline.'], y0=210, extra=concept)
card('c2', 'bg_tools.png', '1 · Layers and tools', ['Layers, hide, reorder, opacity, ten blend modes.', 'Brush, soft, smudge, erase, blur, select, wand, move.'])
card('c3', 'bg_design.png', '2 · Design kit', ['Gradients, shapes, editable text with outline and shadow.', 'A live blur layer and a drop shadow. Each is one log line.'])
card('c4', 'bg_cutout.png', '3 · Cut-out and filters', ['Photo, magic wand, feather, mask, clip, group.', 'Levels, gradient map and sharpen as live layers.'])
card('c5', 'bg_edits.png', '4 · Move, scale, recolour', ['Shrink the balloon: its cut-out moves with it.', 'Recolour one panel and keep it a live setting.'])
card('c6', 'bg_hist.png', '5 · History proves it', ['Preview any step. Undo and redo. See the raw log lines.', 'Verify replays the log from scratch and compares the picture.'])
card('c7', 'bg_carry.png', '6 · Take it with you', ['Share link, tamper refused. Save file, Open file, verified.', 'A QR code for small documents. Export PNG, JPEG, WebP, PSD.'])
def dev(d, y):
    f = font(40)
    for ln in ['%d of %d test suites passed at commit %s (witness ledger).' % (passed, suites, commits[0]), 'The replay is deterministic: the same log gives the same pixels, compared by SHA-256.', 'The editor reads %d kinds of log line; an unknown one is refused, never ignored.' % nops, 'Source: poc/psd-oplog/editor (plain JavaScript, no build step to run it).']:
        for t in wrap(d, '· ' + ln, f, W - 380): d.text((190, y), t, font=f, fill=(238, 241, 245)); y += 56
        y += 14
card('c8', 'bg_dev.png', 'Under the hood', [], y0=250, extra=dev)
# END: black card. Where it is, the ready link, and why the op log and local-first made it possible.
im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im); y = 36
d.text((120, y), 'Try it. Read it. Fork it.', font=font(76, True), fill=(255, 255, 255)); y += 100
d.text((120, y), 'TRY IT NOW (no install, works offline)', font=font(32, True), fill=(79, 195, 247)); y += 46
d.text((120, y), 'https://red1oon.github.io/bim-ootb/oplogpic/', font=font(44, True, mono=True), fill=(190, 235, 190)); y += 64
d.text((120, y), 'SOURCE (MIT licence)', font=font(32, True), fill=(79, 195, 247)); y += 46
d.text((120, y), 'github.com/red1oon/bim-ootb', font=font(40, True, mono=True), fill=(190, 235, 190)); y += 52
d.text((120, y), 'branch claude/photoshop-clone-gaps-m5p5mz  ·  folder poc/psd-oplog', font=font(32, mono=True), fill=(190, 235, 190)); y += 58
d.text((120, y), 'WHY THE OP LOG AND LOCAL-FIRST MADE THIS POSSIBLE', font=font(32, True), fill=(79, 195, 247)); y += 50
for ln in ['The document is the log: undo, history, Verify, share link and Save file are the same data, not separate features.',
           'The picture is a deterministic replay of the log: same log, same pixels, checked by hash. That is how the tests work too.',
           'Local-first: your browser does the work and keeps the log. No server, no account, no upload. A link or a file carries it to another device.',
           'It stays small: a gradient is about %s bytes, so a small document fits in a QR code.' % nbytes]:
    for t in wrap(d, '· ' + ln, font(31), W - 280): d.text((130, y), t, font=font(31), fill=(235, 235, 235)); y += 42
    y += 4
y += 8
for ln in ['The live site has the tools up to export. Save file, Open file and Show QR are built and tested in the source; the live site does not have them yet.',
           'Photos: Laura Seaman, Joiarib Morales Uc (Unsplash). Recorded on a laptop in Chrome. Not tested on a real phone.']:
    for t in wrap(d, ln, font(26), W - 240): d.text((120, y), t, font=font(26), fill=(170, 170, 170)); y += 34
    y += 4
im.save(os.path.join(outdir, 'end.png')); print('§OPLOGPIC_CARDS_V8 wrote end (black), text bottom y=%d of %d' % (y, H))
