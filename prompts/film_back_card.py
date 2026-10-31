#!/usr/bin/env python3
# ⚠ DO NOT REMOVE — the submission-pack film's back card (prompts/FILM_DXF2BIM_WHY_MARKINGS.md "BACK CARD SPEC"): one card after the end card, the film's card style, its music bed, no voice.
# Left column = BIMCompiler docs/DXF2BIM_Prior_Art.md §3 "What we learned from others" (shortened, its own words); right = what this film shows; footer = the page's scope + the owner's contact.
# usage: film_back_card.py <film.mp4> <out.mp4> [seconds=25]   Logs §BACK_CARD. Read the log after every run.
import os, subprocess, sys, json
from PIL import Image, ImageDraw, ImageFont
film, out = sys.argv[1], sys.argv[2]; SEC = float(sys.argv[3]) if len(sys.argv) > 3 else 25.0
W, H, BG, CORAL, WHITE, GREY = 1920, 1080, '#14161c', '#FF6B78', '#F3EEE8', '#9aa3b2'
KICKER = 'PRIOR ART  ·  WHAT IT BRINGS'
LEFT_T = 'What we learned from others'
LEFT = [('WiseBIM AI', 'fix the scale first, then defaults per class'),
        ('ARCHLine.XP Blueprint', 'recognition meets limits: so you state what each layer is'),
        ('CrossBIM', 'the simplest honest table: layer to dimensions, typed by the user'),
        ('IfcOpenShell #1950', 'lines mapped to curves are not BIM: heights and extrusion are the missing piece'),
        ('ezdxf', 'a mature DXF writer is worth reusing')]
RIGHT_T = 'What this adds'
RIGHT = [('Architects and engineers', 'the 2D set\'s own notes and schedules reach the model, each with its sheet and handle; written against drawn, schedule against model, tagged against modelled are reported, never smoothed over; nothing is guessed'),
         ('Accountants', 'every price names its PWD Schedule of Rates item and page; unpriced lines, assumptions and facts not stated are listed in the report you hand in')]
FOOT = ['Prior art researched 2026-10-18 from vendor and project pages; no patent or literature search, and none of these tools was run on these drawings.',
        'If any fact here is not correct, please contact the author: red1org@gmail.com']
def font(sz, bold=False): return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans' + ('-Bold' if bold else '') + '.ttf', sz)
def wrap(d, text, f, width):
    out, cur = [], ''
    for w in text.split(' '):
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) > width and cur: out.append(cur); cur = w
        else: cur = t
    return out + ([cur] if cur else [])
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
d.text((W // 2, 92), KICKER, fill=CORAL, font=font(30, True), anchor='mm')
X0, X1, CW, Y = 120, 1010, 790, 170
fH, fB, fN = font(40, True), font(25, True), font(25)
def column(x, title, rows):
    y = Y; d.text((x, y), title, fill=CORAL, font=fH); y += 72
    for name, body in rows:
        d.text((x, y), name, fill=WHITE, font=fB); y += 36
        for ln in wrap(d, body, fN, CW): d.text((x, y), ln, fill=GREY, font=fN); y += 34
        y += 18
    return y
yl, yr = column(X0, LEFT_T, LEFT), column(X1, RIGHT_T, RIGHT)
d.line((120, 930, W - 120, 930), fill='#2c303a', width=2)
fF = font(22); y = 952
for ln in FOOT: d.text((W // 2, y), ln, fill=WHITE if 'contact' in ln else GREY, font=fF, anchor='mm'); y += 38
if max(yl, yr) > 920: sys.exit('§BACK_CARD FAIL text overflows the card: ' + str(max(yl, yr)))
work = os.path.join(os.path.dirname(os.path.abspath(out)), 'back_card_work'); os.makedirs(work, exist_ok=True)
png, wav, clip = os.path.join(work, 'back_card.png'), os.path.join(work, 'back_bed.wav'), os.path.join(work, 'back_card.mp4'); im.save(png)
run = lambda a: subprocess.run(a, capture_output=True, text=True)
r = run(['python3', os.path.expanduser('~/bim-compiler/prompts/film_music_bed.py'), wav, str(SEC)]); print((r.stdout.strip().split('\n') or [''])[-1])
r = run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', '25', '-i', png, '-i', wav, '-t', str(SEC), '-vf', 'format=yuv420p', '-af', 'volume=0.18,afade=t=in:d=2,afade=t=out:st=%.2f:d=3,aresample=48000' % (SEC - 3),
         '-ac', '1', '-c:v', 'libx264', '-profile:v', 'high', '-r', '25', '-c:a', 'aac', '-b:a', '160k', clip])
if r.returncode: sys.exit('§BACK_CARD FAIL clip ' + r.stderr[-300:])
r = run(['ffmpeg', '-v', 'error', '-y', '-i', film, '-i', clip, '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-ac', '1', out])
if r.returncode: sys.exit('§BACK_CARD FAIL concat ' + r.stderr[-300:])
cnt = lambda f: int(run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', f]).stdout.strip())
dur = lambda f: float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.strip())
a, b, c = cnt(film), cnt(clip), cnt(out)
print('§BACK_CARD png=%s text_bottom=%d film_frames=%d card_frames=%d out_frames=%d match=%s film_s=%.2f out_s=%.2f out=%s' % (png, max(yl, yr), a, b, c, a + b == c, dur(film), dur(out), out))
print('§BACK_CARD text ' + json.dumps({'kicker': KICKER, 'left': [n for n, _ in LEFT], 'right': [n for n, _ in RIGHT], 'foot': FOOT}))
