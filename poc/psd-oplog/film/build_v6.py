# ⚠ DO NOT REMOVE — Scope: build the OplogPic v6 silent cut WITH the scale-up/scale-down splice, its chapter markers, a timeline.json and the dialogue file (cues computed from the real timeline).
# Read the log after every run: §V6 lines. usage: python3 build_v6.py   (needs the takes, cards and splice take in ~/Videos/oplogpic_v2_work/v6; ffmpeg)
import os, subprocess, json, csv
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v6'); LANG = os.environ.get('LANG_SUFFIX', ''); S = V + '/seg' + LANG; os.makedirs(S, exist_ok=True)   # LANG_SUFFIX=_ms builds the Malay cut: cards_ms/, longer cards, *_ms outputs
for f in os.listdir(S): os.remove(os.path.join(S, f))
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', '-an']
def run(a): subprocess.run(['ffmpeg', '-v', 'error', '-y'] + a, check=True)
def dur(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode())
def shots(take):
    out = {}
    for r in list(csv.reader(open(f'{V}/{take}_shots.tsv'), delimiter='\t'))[1:]: out[r[0]] = (float(r[1]), float(r[2]), r[3])
    return out
SEGS = []   # (name, final_start, final_len, mapper) in play order
def card(name, sec):
    run(['-loop', '1', '-t', str(sec), '-i', f'{V}/cards{LANG}/{name}.png', '-vf', f'scale=1920:1080,fade=t=in:st=0:d=0.35,fade=t=out:st={sec-0.35}:d=0.35,format=yuv420p'] + ENC + [f'{S}/{name}.mp4'])
def take(name, src, a, b, sp, tag):
    fade = '' if name in ('splice', 'edits_b') else 'fade=t=in:st=0:d=0.3,'   # no dip to black inside one continuous screen
    vf = f'scale=1920:1080,setpts=PTS/{sp},{fade}format=yuv420p'
    run(['-ss', str(a), '-to', str(b), '-i', f'{V}/{src}.webm', '-vf', vf] + ENC + [f'{S}/{name}.mp4'])
def lastend(take): return max(float(r[2]) for r in list(csv.reader(open(f'{V}/{take}_shots.tsv'), delimiter='\t'))[1:])
CD = dict(cover=3.0, c1=8.0, c5=11.0, end=15.0)
if LANG == '_ms': CD.update(cover=4.0, c1=10.5, c5=15.0, end=19.0)   # Malay runs longer: lengthen the cards, not the speech speed
plan = [('card', 'cover', CD['cover']), ('card', 'c1', CD['c1']), ('card', 'c2', 3.0), ('take', 'tour', 'tour', 4.3, lastend('tour') + 1.0, 1.1), ('card', 'c3', 3.0), ('take', 'history', 'history', 4.3, lastend('history') + 1.2, 1.25), ('card', 'c4', 3.0),
        ('take', 'edits_a', 'edits', 4.3, 9.63, 1.15), ('take', 'splice', 'splice', 9.8, 25.6, 1.0), ('take', 'edits_b', 'edits', 9.63, lastend('edits') + 1.0, 1.15), ('card', 'c5', CD['c5']), ('card', 'end', CD['end'])]
t = 0.0; TL = {}
for p in plan:
    if p[0] == 'card': card(p[1], p[2]); L = p[2]; TL[p[1]] = dict(start=t, len=L)
    else:
        _, name, src, a, b, sp = p; end = b if b else dur(f'{V}/{src}.webm') - 0.3; take(name, src, a, end, sp, name); L = dur(f'{S}/{name}.mp4'); TL[name] = dict(start=t, len=L, src=src, a=a, sp=sp)
    t += L
order = [p[1] for p in plan]; open(f'{S}/list.txt', 'w').write(''.join(f"file '{S}/{n}.mp4'\n" for n in order))
run(['-f', 'concat', '-safe', '0', '-i', f'{S}/list.txt', '-c', 'copy', f'{V}/OplogPic_v6_SILENT{LANG}.mp4'])
total = dur(f'{V}/OplogPic_v6_SILENT{LANG}.mp4')
chap = [('1 A photo editor with history', ['cover', 'c1']), ('2 The finished file', ['c2', 'tour']), ('3 The history is the file', ['c3', 'history']), ('4 Two edits', ['c4', 'edits_a', 'splice', 'edits_b']), ('5 What it costs', ['c5']), ('Prior art', ['end'])]
if LANG == '_ms':
    for c, t in zip(chap, ['1 Penyunting foto dengan sejarah', '2 Fail yang siap', '3 Sejarah ialah failnya', '4 Dua suntingan', '5 Kosnya', 'Seni terdahulu']): chap[chap.index(c)] = (t, c[1])
meta = [';FFMETADATA1']; tt = 0.0
for title, segs in chap:
    ln = sum(TL[s]['len'] for s in segs); meta.append('[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s' % (round(tt * 1000), round((tt + ln) * 1000), title)); tt += ln
open(f'{S}/chapters.txt', 'w').write('\n'.join(meta) + '\n')
run(['-i', f'{V}/OplogPic_v6_SILENT{LANG}.mp4', '-i', f'{S}/chapters.txt', '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', f'{V}/OplogPic_v6_SILENT{LANG}_chapters.mp4'])
# map a shot of a take to the final timeline
def fin(seg, take_t): s = TL[seg]; return s['start'] + (take_t - s['a']) / s['sp']
T = shots('tour'); H = shots('history'); E = shots('edits'); SP = shots('splice')
W = {}   # shot id -> (final start, final end)
for k, (a, b, _) in T.items(): W[k] = (fin('tour', a), fin('tour', b))
for k, (a, b, _) in H.items(): W[k] = (fin('history', a), fin('history', b))
W['E1'] = (fin('edits_a', E['E1'][0]), fin('edits_a', E['E1'][1]))
for k in ('S2', 'S3', 'S4'): W[k] = (fin('splice', SP[k][0]), fin('splice', SP[k][1]))
for k in ('E2', 'E3', 'E4', 'E5', 'E6'): W[k] = (fin('edits_b', E[k][0]), fin('edits_b', E[k][1]))
for c in ('cover', 'c1', 'c2', 'c3', 'c4', 'c5', 'end'): W[c] = (TL[c]['start'] + 0.35, TL[c]['start'] + TL[c]['len'] - 0.15)
json.dump({'total': total, 'segments': TL, 'windows': W}, open(f'{V}/timeline{LANG}.json', 'w'), indent=1)
print('§V6 silent cut %.2f s; chapters:' % total, [(c[0], round(sum(TL[s]['len'] for s in c[1]), 1)) for c in chap])
for k in sorted(W, key=lambda k: W[k][0]): print('§V6 window %-6s %7.2f - %7.2f  (%.1f s)' % (k, W[k][0], W[k][1], W[k][1] - W[k][0]))
