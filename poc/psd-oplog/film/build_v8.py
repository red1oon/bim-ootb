# ⚠ DO NOT REMOVE — Scope: build the OplogPic v8 developer-cut RAW (silent) film from existing takes (v6 tour/history/edits, v7 poster/qr) and the two new takes (v8 cutout/carry), the cards, chapter markers and timeline.json.
# Read the log after every run: §V8 lines (durations per chapter, total, windows). usage: python3 build_v8.py   (needs ~/Videos/oplogpic_v2_work/{v6,v7,v8}, cards in v8/cards; ffmpeg)
import os, subprocess, json, csv
R = os.path.expanduser('~/Videos/oplogpic_v2_work'); V = R + '/v8'; S = V + '/seg'; os.makedirs(S, exist_ok=True)
for f in os.listdir(S): os.remove(os.path.join(S, f))
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', '-an']
def run(a): subprocess.run(['ffmpeg', '-v', 'error', '-y'] + a, check=True)
def dur(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode())
SRC = dict(tour=R + '/v6/tour.webm', history=R + '/v6/history.webm', edits=R + '/v6/edits.webm', poster=R + '/v7/poster.webm', qr=R + '/v7/qr.webm', cutout=V + '/cutout.webm', carry=V + '/carry.webm')
CD = dict(cover=3.5, c1=9.5, c2=2.5, c3=2.5, c4=2.5, c5=2.5, c6=2.5, c7=2.5, c8=11.0, end=31.0)
# (kind, name, src, a, b, speed); a / b are seconds in the source take (shot boundaries from each take's *_shots.tsv); speeds make a raw cut, the narrated cut will retime
plan = [('card', 'cover'), ('card', 'c1'),
 ('card', 'c2'), ('take', 't1', 'tour', 4.3, 51.8, 2.7),
 ('card', 'c3'), ('take', 'd1', 'poster', 1.9, 11.31, 1.8), ('take', 'd2', 'poster', 11.31, 17.72, 1.3), ('take', 'd3', 'poster', 17.72, 44.69, 2.6), ('take', 'd4', 'poster', 44.69, 66.58, 2.4), ('take', 'd5', 'poster', 78.35, 100.79, 2.6), ('take', 'd6', 'poster', 100.79, 110.54, 1.2), ('take', 'd7', 'poster', 110.54, 126.94, 2.4),
 ('card', 'c4'), ('take', 'x1', 'cutout', 2.2, 11.41, 1.3), ('take', 'x2', 'cutout', 11.41, 22.61, 1.25), ('take', 'x3', 'cutout', 22.61, 33.18, 1.8), ('take', 'x4', 'cutout', 33.19, 42.67, 2.4), ('take', 'x5', 'cutout', 42.67, 58.76, 1.5), ('take', 'x6', 'cutout', 58.76, 71.91, 2.4), ('take', 'x7', 'cutout', 71.91, 80.43, 1.8),
 ('card', 'c5'), ('take', 'e1', 'edits', 9.63, 21.03, 2.2), ('take', 'e2', 'edits', 26.37, 50.62, 2.4),
 ('card', 'c6'), ('take', 'h1', 'history', 9.61, 22.56, 2.2), ('take', 'h2', 'history', 22.56, 37.03, 3.0), ('take', 'h3', 'history', 37.03, 44.57, 1.5), ('take', 'h4', 'history', 44.57, 53.36, 1.3),
 ('card', 'c7'), ('take', 'k1', 'carry', 2.2, 23.2, 3.5), ('take', 'k2', 'carry', 23.2, 28.0, 1.0), ('take', 'k3', 'carry', 28.0, 32.9, 1.0), ('take', 'k4', 'carry', 32.9, 48.8, 2.4), ('take', 'k5', 'carry', 48.8, 56.7, 1.0), ('take', 'k6', 'carry', 56.7, 63.3, 2.0), ('take', 'k7', 'qr', 18.73, 25.18, 1.0), ('take', 'k8', 'poster', 174.46, 189.68, 1.4),
 ('card', 'c8'), ('card', 'end')]
t = 0.0; TL = {}
for p in plan:
    if p[0] == 'card':
        name = p[1]; sec = CD[name]
        run(['-loop', '1', '-t', str(sec), '-i', f'{V}/cards/{name}.png', '-vf', f'scale=1920:1080,fade=t=in:st=0:d=0.35,fade=t=out:st={sec-0.35}:d=0.35,format=yuv420p'] + ENC + [f'{S}/{name}.mp4']); TL[name] = dict(start=t, len=sec); L = sec
    else:
        _, name, src, a, b, sp = p
        run(['-ss', str(a), '-to', str(b), '-i', SRC[src], '-vf', f'scale=1920:1080,setpts=PTS/{sp},fade=t=in:st=0:d=0.25,format=yuv420p'] + ENC + [f'{S}/{name}.mp4']); L = dur(f'{S}/{name}.mp4'); TL[name] = dict(start=t, len=L, src=src, a=a, b=b, sp=sp)
    t += L
order = [p[1] for p in plan]; open(f'{S}/list.txt', 'w').write(''.join(f"file '{S}/{n}.mp4'\n" for n in order))
run(['-f', 'concat', '-safe', '0', '-i', f'{S}/list.txt', '-c', 'copy', f'{V}/OplogPic_v8_RAW.mp4']); total = dur(f'{V}/OplogPic_v8_RAW.mp4')
chap = [('Cover', ['cover']), ('The document is a log', ['c1']), ('1 Layers and tools', ['c2', 't1']), ('2 Design kit', ['c3', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']), ('3 Cut-out and filters', ['c4', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7']), ('4 Move, scale, recolour', ['c5', 'e1', 'e2']), ('5 History proves it', ['c6', 'h1', 'h2', 'h3', 'h4']), ('6 Take it with you', ['c7', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8']), ('Under the hood', ['c8']), ('Try it. Read it. Fork it.', ['end'])]
meta = [';FFMETADATA1']; tt = 0.0; summ = []
for title, segs in chap:
    ln = sum(TL[s]['len'] for s in segs); meta.append('[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s' % (round(tt * 1000), round((tt + ln) * 1000), title)); summ.append((title, round(tt, 1), round(ln, 1))); tt += ln
open(f'{S}/chapters.txt', 'w').write('\n'.join(meta) + '\n')
run(['-i', f'{V}/OplogPic_v8_RAW.mp4', '-i', f'{S}/chapters.txt', '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', f'{V}/OplogPic_v8_RAW_chapters.mp4'])
json.dump({'total': total, 'segments': TL, 'chapters': summ}, open(f'{V}/timeline.json', 'w'), indent=1)
print('§V8 raw cut %.2f s' % total)
for c in summ: print('§V8 chapter %-28s start %6.1f  len %5.1f' % c)
