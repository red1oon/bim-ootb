# ⚠ DO NOT REMOVE — Scope: build the OplogPic v7 (design kit) silent cut, its chapter markers, a timeline.json and the shot windows the dialogue cues are computed from.
# Read the log after every run: §V7 lines. usage: python3 build_v7.py   (needs poster.webm, qr.webm, cards/ and the *_shots.tsv / *_facts.tsv in ~/Videos/oplogpic_v2_work/v7; ffmpeg)
import os, subprocess, json, csv
V = os.path.expanduser('~/Videos/oplogpic_v2_work/v7'); LANG = os.environ.get('LANG_SUFFIX', ''); S = V + '/seg' + LANG; os.makedirs(S, exist_ok=True)   # LANG_SUFFIX=_ms builds the Malay cut: cards_ms/, longer cards, slower takes, *_ms outputs
for f in os.listdir(S): os.remove(os.path.join(S, f))
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '25', '-an']
def run(a): subprocess.run(['ffmpeg', '-v', 'error', '-y'] + a, check=True)
def dur(p): return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).decode())
def shots(take):
    out = {}
    for r in list(csv.reader(open(f'{V}/{take}_shots.tsv'), delimiter='\t'))[1:]: out[r[0]] = (float(r[1]), float(r[2]), r[3])
    return out
def facts(take): return {r[0]: r[1] for r in list(csv.reader(open(f'{V}/{take}_facts.tsv'), delimiter='\t'))[1:]}
PF = facts('poster'); vp, vd = float(PF['verify_press_s']), float(PF['verify_done_s']); SH = shots('poster'); QS = shots('qr')
CD = dict(cover=4.5, c1=7.0, c2=3.5, c3=4.5, c4=3.5, c5=5.5, c6=4.5, end=15.0); SPK = 1.0
if LANG == '_ms': CD = dict(cover=5.5, c1=10.0, c2=4.5, c3=7.0, c4=5.0, c5=8.5, c6=6.5, end=19.0); SPK = 0.85   # Malay runs longer: lengthen the cards and slow the takes, not the speech speed
# (kind, name, src, a, b, speed): the take is cut at shot boundaries; the page freezes while Verify runs (vp..vd), that stretch is sped up, not hidden
plan = [('card', 'cover'), ('card', 'c1'), ('take', 'p_a1', 'poster', 1.9, SH['P1'][1], 1.25), ('take', 'p_a2', 'poster', SH['P2'][0], SH['P2'][1], 0.8), ('take', 'p_a3', 'poster', SH['P3'][0], SH['P4'][1], 1.25), ('card', 'c2'), ('take', 'p_b', 'poster', SH['T1'][0], SH['T3'][1], 1.3), ('card', 'c3'), ('take', 'p_c1', 'poster', SH['B1'][0], SH['B2'][1], 1.4), ('take', 'p_c2', 'poster', SH['B3'][0], SH['B3'][1], 0.9), ('take', 'p_c3', 'poster', SH['B4'][0], SH['B4'][1], 1.4),
        ('card', 'c4'), ('take', 'p_h1', 'poster', SH['H1'][0], vp + 0.4, 1.1), ('take', 'p_freeze', 'poster', vp + 0.4, vd - 0.2, 4.0), ('take', 'p_h3c', 'poster', vd - 0.2, SH['H3'][1], 1.0),
        ('card', 'c5'), ('take', 'q_small', 'qr', 2.1, QS['R1'][1], 2.2), ('take', 'q_show', 'qr', QS['R2'][0], QS['R2'][1] - 0.2, 0.6), ('take', 'p_q1', 'poster', SH['Q1'][0], SH['Q1'][1], 0.6), ('take', 'p_q2', 'poster', SH['Q1'][1], SH['Q2'][1], 1.3), ('card', 'c6'), ('take', 'p_x1', 'poster', SH['X1'][0], SH['X1'][1], 1.4), ('take', 'p_x2', 'poster', SH['X2'][0], SH['X2'][1] + 0.6, 1.0), ('card', 'end')]
t = 0.0; TL = {}
for p in plan:
    if p[0] == 'card':
        name = p[1]; sec = CD[name]
        run(['-loop', '1', '-t', str(sec), '-i', f'{V}/cards{LANG}/{name}.png', '-vf', f'scale=1920:1080,fade=t=in:st=0:d=0.35,fade=t=out:st={sec-0.35}:d=0.35,format=yuv420p'] + ENC + [f'{S}/{name}.mp4']); TL[name] = dict(start=t, len=sec); L = sec
    else:
        _, name, src, a, b, sp = p; sp = sp * SPK if name != 'p_freeze' else sp; fade = '' if name in ('p_freeze', 'p_h3c', 'q_show', 'p_a2', 'p_a3', 'p_c2', 'p_c3', 'p_x2') else 'fade=t=in:st=0:d=0.3,'
        run(['-ss', str(a), '-to', str(b), '-i', f'{V}/{src}.webm', '-vf', f'scale=1920:1080,setpts=PTS/{sp},{fade}format=yuv420p'] + ENC + [f'{S}/{name}.mp4']); L = dur(f'{S}/{name}.mp4'); TL[name] = dict(start=t, len=L, src=src, a=a, b=b, sp=sp)
    t += L
order = [p[1] for p in plan]; open(f'{S}/list.txt', 'w').write(''.join(f"file '{S}/{n}.mp4'\n" for n in order))
run(['-f', 'concat', '-safe', '0', '-i', f'{S}/list.txt', '-c', 'copy', f'{V}/OplogPic_v7_SILENT{LANG}.mp4']); total = dur(f'{V}/OplogPic_v7_SILENT{LANG}.mp4')
chap = [('1 A poster from nothing', ['cover', 'c1', 'p_a1', 'p_a2', 'p_a3']), ('2 Words you can change', ['c2', 'p_b']), ('3 A live blur', ['c3', 'p_c1', 'p_c2', 'p_c3']), ('4 History proves it', ['c4', 'p_h1', 'p_freeze', 'p_h3c']), ('5 A QR for a small document', ['c5', 'q_small', 'q_show', 'p_q1', 'p_q2']), ('6 Export', ['c6', 'p_x1', 'p_x2']), ('Prior art', ['end'])]
if LANG == '_ms':
    for c, t in zip(list(chap), ['1 Sebuah poster daripada kosong', '2 Kata-kata yang boleh diubah', '3 Kabur yang hidup', '4 Sejarah membuktikannya', '5 Kod QR untuk dokumen kecil', '6 Eksport', 'Seni terdahulu']): chap[chap.index(c)] = (t, c[1])
meta = [';FFMETADATA1']; tt = 0.0
for title, segs in chap:
    ln = sum(TL[s]['len'] for s in segs); meta.append('[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s' % (round(tt * 1000), round((tt + ln) * 1000), title)); tt += ln
open(f'{S}/chapters.txt', 'w').write('\n'.join(meta) + '\n')
run(['-i', f'{V}/OplogPic_v7_SILENT{LANG}.mp4', '-i', f'{S}/chapters.txt', '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', f'{V}/OplogPic_v7_SILENT{LANG}_chapters.mp4'])
def fin(src, take_t, end=False):   # a take time -> final time; a START belongs to the segment that begins at/after it, an END to the one that ends at/before it
    for n, s in TL.items():
        if s.get('src') != src: continue
        ok = (s['a'] + 1e-6 < take_t <= s['b'] + 1e-6) if end else (s['a'] - 1e-6 <= take_t < s['b'] - 1e-6)
        if ok: return s['start'] + (take_t - s['a']) / s['sp']
    raise SystemExit('§V7 no segment of %s contains %.2f (end=%s)' % (src, take_t, end))
W = {}
for k, (a, b, _) in SH.items(): W[k] = (fin('poster', max(a, 1.9)), fin('poster', b, True))
for k, (a, b, _) in QS.items():
    if k == 'R3': continue
    W[k] = (fin('qr', max(a, 2.1)), fin('qr', b if k == 'R1' else b - 0.2, True))
for c in ('cover', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'end'): W[c] = (TL[c]['start'] + 0.35, TL[c]['start'] + TL[c]['len'] - 0.15)
json.dump({'total': total, 'segments': TL, 'windows': W, 'verify': [vp, vd]}, open(f'{V}/timeline{LANG}.json', 'w'), indent=1)
print('§V7 silent cut %.2f s; chapters:' % total, [(c[0], round(sum(TL[s]['len'] for s in c[1]), 1)) for c in chap])
for k in sorted(W, key=lambda k: W[k][0]): print('§V7 window %-6s %7.2f - %7.2f  (%.1f s)' % (k, W[k][0], W[k][1], W[k][1] - W[k][0]))
